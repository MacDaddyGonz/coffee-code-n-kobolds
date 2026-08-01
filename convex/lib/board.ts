// THE CHOKE POINT. This module is the only place in `convex/` allowed to read the
// `tokens` and `tokenPositions` tables, and a test greps the sources to keep it
// that way.
//
// The reason it has to be one module rather than a habit is CLAUDE.md invariant 8.
// A `returns:` validator catches a leaked *field* — that is what keeps the DM code
// out of a game payload — but a DM-layer token is the same shape as a player-layer
// one, so a validator would cheerfully approve a payload made entirely of secrets.
// Nothing about the type of a token distinguishes a spoiler from a hero. Only the
// row does. So the guard is structural instead: every read of those two tables
// passes through the single predicate below, and any future query that wants token
// data has to come here to get it.

import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_PLACEMENTS_PER_SCENE, MAX_SCENES_PER_GAME, MAX_TOKENS_PER_GAME } from './games'
import { findClaimHolder } from './players'
import type { Grid, Point } from './grid'
import { cellOf, centreOfCell, snapToGrid } from './grid'

/**
 * The two layers a token can be on, spelled once.
 *
 * Used by the schema, by the public projection and by `board.addToken`'s argument
 * validator, because this union is the field the DM layer's whole secrecy turns on
 * (invariant 8) and three copies of it are three places for a fourth member to be
 * added to two of them. The client derives its own type from `PublicToken['layer']`
 * rather than re-spelling it either.
 */
export const tokenLayerValidator = v.union(v.literal('player'), v.literal('dm'))

/** The public shape of a token. artUrl is a signed storage URL, null when there is no art. */
export const publicTokenValidator = v.object({
  _id: v.id('tokens'),
  name: v.string(),
  layer: tokenLayerValidator,
  sizeSquares: v.number(),
  artUrl: v.union(v.string(), v.null()),
  tint: v.string(),
  characterId: v.union(v.id('characters'), v.null()),
  /**
   * WHO MAY MOVE THIS TOKEN — the **effective** set, computed by
   * `effectiveControllersOf` below. What the client's `canMove` reads, and the one
   * fact it is allowed to read for that question.
   *
   * The DM is not in it and never will be: the DM is authorised by holding the DM
   * code (invariant 7), not by appearing in a list a payload carries.
   */
  controllerIds: v.array(v.id('players')),
  /**
   * EXACTLY WHAT IS STORED — the grants the DM has written down, and nothing
   * derived. What the DM's grant dialog edits.
   *
   * **Two fields rather than one, deliberately, and the second is not redundant
   * with the first.** One is state and one is a rule computed from it, so a dialog
   * given only the effective set would have to subtract the claim holder back out
   * to know which boxes it may untick — which is the control rule, re-implemented
   * in the browser, in a second language, where nothing checks it against the
   * server's. ADR 0005 recorded that exact failure in `useBoard`'s token → character
   * → my-character walk and said to stop doing it: when the server already knows the
   * answer, the server sends the answer. Sending both facts costs an array of ids per
   * token and removes the browser's licence to derive either.
   *
   * Which is also why the dialog can render "plays this character, always in
   * control" as checked-and-disabled honestly: that seat is in `controllerIds` and
   * absent from `grantedPlayerIds`, and the difference between the two arrays *is*
   * the derived half.
   */
  grantedPlayerIds: v.array(v.id('players')),
})
export type PublicToken = Infer<typeof publicTokenValidator>

export const publicPositionValidator = v.object({
  tokenId: v.id('tokens'),
  x: v.number(),
  y: v.number(),
})
export type PublicPosition = Infer<typeof publicPositionValidator>

/**
 * Deliberately indistinguishable from "no such token" and "token in another game".
 *
 * Once the payload channel is closed, the remaining way to enumerate the DM layer
 * is to guess ids and read the error back: a distinct "you are not allowed to move
 * that" confirms a hidden token exists, and a player who knows an ambush is on the
 * board has had the ambush spoiled whether or not they can see it. So all three
 * refusals throw this, and the tests assert the parity — which is why it is a
 * shared constant rather than three literals that drift apart under maintenance.
 */
export const TOKEN_NOT_FOUND = {
  kind: 'TokenNotFound',
  message: 'That token is not on this board.',
}

function tokenNotFound(): ConvexError<typeof TOKEN_NOT_FOUND> {
  return new ConvexError(TOKEN_NOT_FOUND)
}

/**
 * The whole visibility rule, in one expression, in one place.
 *
 * `isDm` arrives from `resolveDmAccess` in lib/games.ts, which means it is the
 * result of comparing a DM code supplied on *this* request against the one stored
 * on the game. It is not computed here and it must never be computed from anything
 * else. In particular it is never `players.isDm`, which is a badge in the roster
 * that anybody can find (invariant 7), and never derived from a `playerId`
 * argument, which says which seat to act on rather than who is calling (ADR 0003).
 * Either of those would amount to a player asking to be trusted, and would defeat
 * invariant 1 completely while looking like a working filter.
 */
function maySee(token: Doc<'tokens'>, isDm: boolean): boolean {
  return isDm || token.layer === 'player'
}

/**
 * The seats the DM has explicitly granted this token to. The one accessor for the
 * stored field, and the only place the default is spelled.
 *
 * Optional in the schema because `tokens` has held rows since Milestone 2 and a
 * required field cannot be added to a populated table in one push — the fifth time
 * this project has met that, and the fifth time the answer is one accessor with a
 * documented default rather than a `?? []` at each reader. Absent means the DM has
 * granted this token to nobody, which is not the same statement as "nobody may move
 * it": see `effectiveControllersOf` below for the other half.
 */
export function grantedControllersOf(token: Doc<'tokens'>): Id<'players'>[] {
  return token.controllerIds ?? []
}

/**
 * THE CONTROL RULE, in one expression, in one place: the DM's explicit grants, plus
 * the seat playing the token's character if there is one.
 *
 * Every consumer of "who may move this?" resolves through here — `requireMovableToken`
 * with the one holder it looked up, `publicTokens` with a holder off the map it built,
 * `controlledCharacterIds` with the same map — so the browser's `canMove`, the refusal
 * on the write path and the sheets a granted player is sent cannot come to disagree
 * about what control is. There is exactly one rule and three callers, rather than three
 * comparisons that were identical when they were written.
 *
 * The claim holder is composed in here rather than written into `controllerIds` because
 * a claim already lives on the seat (ADR 0002, seat → character and never the reverse).
 * Storing it a second time would make two documents authoritative for one relation, and
 * the bug that follows is a hero reassigned to a new player whose old token still lists
 * the seat that left — the same denormalisation ADR 0004 refused for `layer`.
 *
 * **Zero grants and no claim gives the empty array, which means the DM alone**, and
 * this is the one place that is stated. It is the correction Milestone 2 shipped after
 * the first real session: control used to be *assumed* for a token with no character
 * attached, on the reasoning that a creature nobody is playing should still be
 * draggable — and since every NPC the DM adds has no character attached, the whole
 * table could shove the monsters around. An unattached token is the DM's. It is
 * draggable by a player only when the DM says so, which is now a thing the DM can
 * actually say.
 *
 * The DM is never a member. Being the DM is holding the DM code (invariant 7), checked
 * on the request, and a seat id in an array is not that.
 */
export function effectiveControllersOf(
  token: Doc<'tokens'>,
  holder: Doc<'players'> | null,
): Id<'players'>[] {
  const granted = grantedControllersOf(token)
  // The DM granting a token to the very seat already playing its character is an
  // ordinary thing to click, so the union has to be a union — a duplicate id would
  // otherwise reach the dialog as one seat with two entries.
  if (holder === null || granted.includes(holder._id)) return granted
  return [...granted, holder._id]
}

/**
 * Filtered token documents for this caller. THE choke point.
 *
 * Private deliberately: a caller outside this module holding raw `Doc<'tokens'>`
 * rows is a projection waiting to be written somewhere else, and the point of the
 * choke point is that the filtering and the projecting live together. Everything
 * beyond this file gets `publicTokens` below instead.
 */
async function visibleTokens(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
): Promise<Doc<'tokens'>[]> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.filter((token) => maySee(token, isDm))
}

/**
 * The same set, projected and with signed art URLs resolved. For `board.tokens`.
 *
 * Filter first, project second, and the order is load-bearing rather than tidy. A
 * signed storage URL is unguessable but not permission-checked: once it exists it
 * is a bearer link to that image for anyone holding the string. Resolving one for
 * a hidden token — even to throw the object away a line later — would mean the
 * secret had already been minted into a form that could be logged, cached or
 * accidentally spread. Projection only ever runs over rows the caller may see.
 *
 * The seats are passed in rather than read here, exactly as `publicCharacters` takes
 * them next door: this module stays confined to its own two tables and the caller
 * keeps its one bounded roster read. `board.tokens` therefore re-subscribes when the
 * roster changes, which is *correct* for a claim — a claim is control, so the
 * effective set genuinely moved — and merely cheap for a rename. It is affordable
 * only because this is the low-churn half of the board; see the warning on
 * `visiblePositions`, where the same read would not be.
 */
export async function publicTokens(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
): Promise<PublicToken[]> {
  const tokens = await visibleTokens(ctx, gameId, isDm)

  // Built once from the seats we were handed rather than a claim lookup per token,
  // which is the same idiom `publicCharacters` uses and matters more here: a board
  // holds up to MAX_TOKENS_PER_GAME rows, so the per-token form would be two hundred
  // index reads on a subscription every client in the game holds open.
  const holderByCharacter = new Map(
    seats.filter((seat) => seat.characterId).map((seat) => [seat.characterId!, seat]),
  )

  return await Promise.all(
    tokens.map(async (token) => {
      const holder = token.characterId ? holderByCharacter.get(token.characterId) ?? null : null
      return {
        _id: token._id,
        name: token.name,
        layer: token.layer,
        sizeSquares: token.sizeSquares,
        // Null rather than undefined: `undefined` is not a Convex value, so an
        // optional field has to become something on the way out. A getUrl of a blob
        // that has been deleted underneath us is null too, and the board draws a
        // tinted coin for both cases.
        artUrl: token.imageId ? await ctx.storage.getUrl(token.imageId) : null,
        tint: token.tint,
        characterId: token.characterId ?? null,
        // Both halves of control, computed here and derived nowhere else — see the
        // note on the validator for why the browser gets the rule's answer and its
        // input rather than just the input.
        controllerIds: effectiveControllersOf(token, holder),
        grantedPlayerIds: grantedControllersOf(token),
      }
    }),
  )
}

/**
 * The characters standing on tokens this caller may see.
 *
 * The only thing that crosses this module's boundary is a filtered set of ids —
 * never a `Doc<'tokens'>` — which is the same narrow crossing `tokenReferencesImage`
 * makes below, and it is what lets `characters.vitals` be built out of both choke
 * points without either one reading the other's tables.
 *
 * It exists to close a leak that is easy to miss. A health bar needs hit points for
 * every creature on the board, and the obvious way to serve one is to send a band
 * for every NPC in the game — which quietly publishes a *count*. A player reading
 * twelve entries knows the DM has twelve monsters prepared for tonight, and that is
 * the same category of spoiler as the scene names ADR 0004 refused to send. Scoping
 * to what the caller can already see on the board means a hidden creature
 * contributes nothing at all: not a row, not a band, not a number in a length.
 */
export async function visibleCharacterIds(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
): Promise<Set<Id<'characters'>>> {
  const tokens = await visibleTokens(ctx, gameId, isDm)

  const ids = new Set<Id<'characters'>>()
  for (const token of tokens) {
    if (token.characterId) ids.add(token.characterId)
  }
  return ids
}

/**
 * The characters standing on tokens **this seat controls**. The second narrow
 * crossing out of this module, beside `visibleCharacterIds` above.
 *
 * Same discipline as its neighbour and for the same reason: a set of ids leaves,
 * never a `Doc<'tokens'>`, so `lib/characters.ts` can widen what a granted player is
 * allowed to see without either choke point reading the other's tables. What
 * `visibleCharacterIds` answers is *whose health bar may this caller be shown*; this
 * answers *whose sheet is this caller allowed to open, and whose hit points may they
 * change*. They are composed, never substituted: control is added to sight, and the
 * sight rule in `maySeeCharacter` still runs first.
 *
 * ⚠️ **This is built from `visibleTokens`, and that composition is what the whole
 * feature rests on.** A grant written on a DM-layer token contributes nothing to a
 * player's set, because the token was filtered out one line above — so "sight follows
 * the token" is true structurally rather than by anybody remembering to check the
 * layer here. The DM moves the token to the player layer and the sheet arrives with
 * it; the DM moves it back and the sheet goes. There is deliberately no second layer
 * test in this function, and adding one would be the signal that the composition had
 * been broken somewhere above.
 *
 * ⚠️ **`playerId === undefined` gives the empty set. Fail closed.** A caller with no
 * seat is an anonymous client, not a caller who controls everything, and this is the
 * argument that widens access to a secret — so its absent case is the refusing one.
 * Note that this is not identity: a `playerId` is routing (ADR 0003), so this widens
 * what *that seat* may read to anybody who passes that seat's id. That residual is
 * accepted deliberately and is written out in full on `requireMovableToken` below.
 */
export async function controlledCharacterIds(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
  playerId?: Id<'players'>,
): Promise<Set<Id<'characters'>>> {
  if (playerId === undefined) return new Set()

  const tokens = await visibleTokens(ctx, gameId, isDm)

  const holderByCharacter = new Map(
    seats.filter((seat) => seat.characterId).map((seat) => [seat.characterId!, seat]),
  )

  const ids = new Set<Id<'characters'>>()
  for (const token of tokens) {
    const characterId = token.characterId
    if (!characterId) continue
    const holder = holderByCharacter.get(characterId) ?? null
    if (effectiveControllersOf(token, holder).includes(playerId)) ids.add(characterId)
  }
  return ids
}

/**
 * Positions on one scene, filtered to tokens this caller may see. For `board.positions`.
 *
 * Each position row is hydrated back to its token so the same `maySee` decides it.
 * The obvious optimisation is to copy `layer` onto the position row and skip the
 * join, and it is the wrong trade: it would make two documents authoritative for
 * the one field that decides whether a row is a secret, and the bug that leaks is
 * exactly a token moved to the DM layer whose stale placements still say 'player'.
 * A denormalised copy cannot be verified by reading this file, which is the whole
 * point of having a choke point.
 *
 * The cost accepted is that this query re-subscribes when a token *document*
 * changes, not only when something moves. That is cheap here precisely because of
 * invariant 2's table split: token documents are written when the DM adds, renames
 * or re-layers a token, which is rare, while the churn of a drag lands on
 * `tokenPositions` alone.
 *
 * ⚠️ **This deliberately does not take the seats, and the signature must stay that
 * way.** `publicPositionValidator` is a token id and two coordinates — there is no
 * controller field on it and so nothing here to compose. Passing the roster in "for
 * symmetry" with `publicTokens` would add a `players` range read to the highest-churn
 * subscription in the app, which is exactly the read `publicTokens` can afford and
 * this one cannot: every join, rename, claim and release would re-execute the
 * position query for every client at the table, on top of the ten writes a second a
 * drag already makes. Who may move a token is decided on the write path and rendered
 * from `board.tokens`; where it stands is a different question with a different cost.
 */
export async function visiblePositions(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'>,
  isDm: boolean,
): Promise<PublicPosition[]> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  const rows = await Promise.all(
    placements.map(async (placement) => {
      const token = await ctx.db.get('tokens', placement.tokenId)
      // The gameId check is not paranoia about a caller: a scene belongs to one
      // game, so a placement pointing at a token in another is data that should
      // not exist, and dropping it here means a stray row cannot become a coin
      // hovering on somebody else's map.
      if (!token || token.gameId !== gameId || !maySee(token, isDm)) return null
      return { tokenId: placement.tokenId, x: placement.x, y: placement.y }
    }),
  )

  return rows.filter((row): row is PublicPosition => row !== null)
}

/**
 * The token this caller is allowed to move, or a throw. Throws the SAME
 * TokenNotFound error for "no such token", "token in another game" and
 * "DM-layer token without the DM code" — telling those apart is an existence
 * oracle for the DM layer. Throws TokenNotYours for a player-layer token this seat
 * neither plays nor has been granted (advisory only; see ADR 0004).
 */
export async function requireMovableToken(
  ctx: QueryCtx,
  game: Doc<'games'>,
  tokenId: Id<'tokens'>,
  isDm: boolean,
  playerId?: Id<'players'>,
): Promise<Doc<'tokens'>> {
  const token = await ctx.db.get('tokens', tokenId)
  if (!token || token.gameId !== game._id || !maySee(token, isDm)) throw tokenNotFound()

  // The DM moves anything on their own board, including a claimed hero, because
  // dragging the party through a door is a normal thing for them to do.
  if (isDm) return token

  // Be honest about the ceiling. `playerId` is a routing argument, so anyone can pass
  // another seat's id and walk straight past the check below; it stops a misclick
  // and a misunderstanding, not somebody with the network tab open. Closing that needs
  // real identity, which means accounts, and ADR 0002 declined those deliberately —
  // ADR 0004 records why that is the right trade at this table rather than a gap
  // waiting to be filled. It is acceptable *here* because nothing behind this check is
  // a secret: a player-layer token is already drawn on every screen in the game, so
  // the worst outcome is a rude move everybody watched happen.
  //
  // ⚠️ **The clause that used to follow — that the refusal above, which does guard a
  // secret, keys off the DM code alone and nothing else — is no longer true, and the
  // change is deliberate rather than a slip.** The layer filter itself still keys off
  // the DM code alone: `maySee` consults nothing else and must not. But a grant is now
  // a **second door**, opened by the DM on purpose, and it opens onto a secret: control
  // of a token carries that creature's sheet and its exact hit points to the granted
  // seat, through `controlledCharacterIds` above. So the residual reaches further than
  // it did. A player passing another seat's id now reads whatever the DM has granted
  // *that* seat — a monster's stat block, not only a rude shove of a hero everyone can
  // already see. That is the sanctioned position, not an oversight: the door is one the
  // DM chose to open, the audience is the same trusted group, and the alternative is
  // still accounts. What has changed is the size of the residual, so it is written down
  // rather than left for the next reader to discover.
  //
  // Note also the read below, and what it is not. One indexed `findClaimHolder`, never
  // a roster range read: this handler runs ten times a second during a drag, and a
  // `listSeats` here would put the whole `players` range into that transaction's read
  // set, turning every concurrent join, rename or claim into an OCC conflict against an
  // in-flight drag — on the one write path invariant 2 exists for. `publicTokens` may
  // build the map because it is a query on the low-churn half; this may not.
  if (playerId !== undefined) {
    const holder = token.characterId ? await findClaimHolder(ctx, token.characterId) : null
    // The same rule the payload was projected through, so what the browser drew as
    // draggable and what the server accepts are one function rather than two that
    // agreed when they were written.
    if (effectiveControllersOf(token, holder).includes(playerId)) return token
  }

  // One message for every way of not controlling it — no claim, somebody else's claim,
  // no grant, no seat at all. The three it replaced named the holder and distinguished
  // the cases, which is a courtesy on a player-layer token and pointless precision now
  // that a grant can produce any combination of them. The tests assert the `kind`.
  throw new ConvexError({
    kind: 'TokenNotYours',
    message: 'That token is not yours to move. Ask the DM to hand it to you.',
  })
}

/**
 * How far from the asked-for square to look for an empty one. Eight rings is 289
 * squares, which is more of a search than any real board needs — it exists so the
 * loop terminates rather than because anyone will reach it.
 */
const FREE_CELL_RINGS = 8

/**
 * The nearest empty square to `point`, for dropping a *new* token.
 *
 * Every token is added at the same default spot — the middle of the map — and
 * snapping then puts each one in the identical square, so a DM adding six goblins
 * got six coins stacked in one cell with their names overprinted into mush and five
 * drags needed to undo it. Found by running the app; no test would have noticed,
 * because every individual write was correct.
 *
 * Deliberately only used by `addToken`. Moving a token onto an occupied square is a
 * legitimate thing to want — two figures crowding a doorway — so `moveToken` must
 * never displace anything, and this is not called from there.
 *
 * Occupancy compares snapped centres rather than footprints. A 2×2 ogre overlapping
 * a 1×1 goblin's square is not detected, which is the honest limit of one line of
 * arithmetic; it costs a drag in a rare case, where the stacking above cost a drag
 * every single time.
 */
export async function freeCellNear(
  ctx: QueryCtx,
  sceneId: Id<'scenes'>,
  grid: Grid,
  sizeSquares: number,
  point: Point,
): Promise<Point> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  // Keyed on the snapped centre, so a placement left off-grid by an interrupted
  // drag still occupies the square it is sitting in.
  const taken = new Set(
    placements.map((placement) => {
      const centre = snapToGrid({ x: placement.x, y: placement.y }, grid, sizeSquares)
      return `${centre.x},${centre.y}`
    }),
  )

  const wanted = cellOf(point, grid, sizeSquares)
  for (let ring = 0; ring <= FREE_CELL_RINGS; ring += 1) {
    for (let dCol = -ring; dCol <= ring; dCol += 1) {
      for (let dRow = -ring; dRow <= ring; dRow += 1) {
        // Only the edge of each ring: the inside was covered by a smaller one.
        if (ring > 0 && Math.abs(dCol) !== ring && Math.abs(dRow) !== ring) continue
        const candidate = centreOfCell(
          { col: wanted.col + dCol, row: wanted.row + dRow },
          grid,
          sizeSquares,
        )
        if (!taken.has(`${candidate.x},${candidate.y}`)) return candidate
      }
    }
  }

  // Every square within the search is occupied, which needs 289 tokens on one
  // scene and cannot happen under MAX_TOKENS_PER_GAME. Stack rather than refuse:
  // a token the DM cannot place at all is worse than one they have to drag.
  return centreOfCell(wanted, grid, sizeSquares)
}

/**
 * Take a deleted character off whatever tokens were standing on it.
 *
 * `characters.remove` is the only irreversible operation on durable data, and
 * without this it would leave tokens pointing at a document that has gone. The
 * pointer runs token → character, so the token is what has to be repaired, and it
 * has to be repaired here because this is the only module that may write that
 * table.
 *
 * The consequences of skipping it are quiet rather than loud, which is why it is
 * worth doing: `requireMovableToken` would find no claim holder, so the effective
 * controllers would collapse to whatever the DM had granted — nothing, usually — and
 * the health bar would simply never appear. A hero's token that has become
 * undraggable with no visible reason why.
 *
 * Bounded by the by_characterId index rather than a scan of the game's tokens.
 */
export async function detachCharacterFromTokens(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
): Promise<void> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .take(MAX_TOKENS_PER_GAME)

  for (const token of tokens) {
    await ctx.db.patch('tokens', token._id, { characterId: undefined })
  }
}

/**
 * Write the DM's grants for one token. The only writer of `controllerIds`.
 *
 * Deduped here rather than trusted from the caller, because the array is what the
 * dialog sends and a double-click is the ordinary way to produce a repeat. A seat
 * listed twice would reach `effectiveControllersOf` unchanged, come back on the
 * payload twice, and render as one player with two checkboxes.
 *
 * It does **not** check that these seats exist or belong to this game: that is
 * `board.setControllers`'s job, because it holds the game and the DM code and this
 * module holds neither. The split is the same one `deleteCharacter` keeps — the
 * writer writes, and the gate is where the code was verified.
 *
 * An empty list is stored as an empty array rather than patched away to `undefined`.
 * Both read identically through `grantedControllersOf`, and one shape of write is one
 * fewer thing for the smoke script's field-by-field comparison to call "present on one
 * side only".
 */
export async function setTokenControllers(
  ctx: MutationCtx,
  tokenId: Id<'tokens'>,
  playerIds: Id<'players'>[],
): Promise<void> {
  await ctx.db.patch('tokens', tokenId, { controllerIds: [...new Set(playerIds)] })
}

/**
 * Take a departing seat off every token it had been granted.
 *
 * The same class of repair `detachCharacterFromTokens` above performs for a deleted
 * character, and it lives here for the same reason: the pointer runs token → seat, so
 * the token is what has to be mended, and this is the only module that may write that
 * table.
 *
 * Skipping it would be quiet rather than loud, which is why it is worth doing. Seat
 * ids are not reused — `players.join` inserts a fresh document (ADR 0003) — so a stale
 * grant authorises nobody and simply accumulates, and the DM's dialog would render it
 * as a row it cannot name. Left long enough, the honest reading of the array stops
 * being "the seats the DM chose" and becomes "the seats the DM chose, minus the ones
 * who have since left", which nothing in the UI knows how to say.
 *
 * Swept by `by_gameId` and bounded by MAX_TOKENS_PER_GAME rather than indexed by seat,
 * because there is no index on an array member and a per-game sweep of at most two
 * hundred rows on the rare occasion somebody leaves is the cheaper thing to have than
 * a second table to maintain. Tokens without the id are skipped rather than patched
 * with an identical array: a no-op patch is still a write, and it would invalidate
 * `board.tokens` for every client at the table.
 */
export async function revokeControlForSeat(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  playerId: Id<'players'>,
): Promise<void> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  for (const token of tokens) {
    const granted = grantedControllersOf(token)
    if (!granted.includes(playerId)) continue
    await ctx.db.patch('tokens', token._id, {
      controllerIds: granted.filter((id) => id !== playerId),
    })
  }
}

/** Insert or update the placement of a token on a scene. */
export async function placeToken(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
  point: Point,
): Promise<void> {
  const existing = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId_and_tokenId', (q) => q.eq('sceneId', sceneId).eq('tokenId', tokenId))
    .unique()

  // Upsert rather than insert, because the row's existence is what puts a token on
  // a board: a drag has to patch the four coordinates it already has, while a token
  // dropped onto a scene it has never stood on has to create them. One function for
  // both keeps a mid-drag write from quietly stacking up duplicate placements.
  if (existing) {
    await ctx.db.patch('tokenPositions', existing._id, { x: point.x, y: point.y })
  } else {
    await ctx.db.insert('tokenPositions', { sceneId, tokenId, x: point.x, y: point.y })
  }
}

/**
 * Every placement of one token, across all scenes. For removeToken.
 *
 * Bounded by the scene count rather than the placement count: a token holds at
 * most one row per scene, so this is the tight bound and MAX_PLACEMENTS_PER_SCENE
 * would be the wrong axis.
 */
export async function deleteTokenPlacements(
  ctx: MutationCtx,
  tokenId: Id<'tokens'>,
): Promise<void> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
    .take(MAX_SCENES_PER_GAME)

  for (const placement of placements) {
    await ctx.db.delete('tokenPositions', placement._id)
  }
}

/**
 * Every placement on one scene. For scenes.remove.
 *
 * Deleting a scene takes its layout with it and leaves every `tokens` row alone,
 * which is what makes a recurring villain survive the map they were last seen on.
 */
export async function deleteScenePlacements(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
): Promise<void> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  for (const placement of placements) {
    await ctx.db.delete('tokenPositions', placement._id)
  }
}

/**
 * Bounded count of tokens in a game, so addToken can enforce MAX_TOKENS_PER_GAME.
 *
 * Counts both layers regardless of the caller, because this answers "is the game
 * full?" and a limit that ignored the hidden half would let the DM's own bestiary
 * overrun the read window that every board query uses. The number never leaves the
 * server: only `addToken` reads it, to decide whether to throw.
 *
 * There is no matching count of placements on a scene, and the absence is
 * deliberate — see the note on MAX_PLACEMENTS_PER_SCENE in lib/games.ts.
 */
export async function countTokensInGame(ctx: QueryCtx, gameId: Id<'games'>): Promise<number> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.length
}

/**
 * Is this blob still the art of a token in this game? So `files.discard` can refuse
 * to delete a file that something on the board is drawing.
 *
 * It lives here rather than in files.ts for the reason at the top of this module:
 * the leak guard greps the sources, and a read of the `tokens` table outside this
 * file is a violation whether it returns rows or a boolean. A boolean is all that
 * crosses the boundary, which is also why there is no `isDm` argument — the only
 * caller is DM-gated, and the question is about a storage id the caller already
 * holds rather than about what is on the board.
 *
 * Counts both layers: a DM-layer skeleton's portrait is exactly as much in use as a
 * hero's, and a check that skipped the hidden half would let a mis-sequenced client
 * blank out the encounter it was hiding.
 */
export async function tokenReferencesImage(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.some((token) => token.imageId === imageId)
}
