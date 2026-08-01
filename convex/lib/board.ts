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
import { findClaimHolder, holderByCharacter } from './players'
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

/**
 * The same union as a TypeScript type, for `setTokenLayer` below.
 *
 * Inferred from the validator rather than written out, for the reason the validator
 * itself is written once: a fourth spelling of `'player' | 'dm'` is a fourth place a
 * third member can be added to three of them.
 *
 * **Deliberately not exported**, unlike `PublicToken` beside it, and the asymmetry is
 * the point: `setTokenLayer` in this file is the only signature that wants it. The
 * browser derives its own from `PublicToken['layer']` — the same validator by a
 * different route — and `board.setLayer` validates its argument against
 * `tokenLayerValidator` itself, so an export would serve nobody while putting a second
 * `TokenLayer` in auto-import range beside the *component* of that name in
 * `src/components/board/TokenLayer.tsx`. An editor picking the wrong one of those is a
 * confusing failure rather than a loud one.
 */
type TokenLayer = Infer<typeof tokenLayerValidator>

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
 * `boardCharacterAccess` with the same map — so the browser's `canMove`, the refusal
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
  // and built by lib/players.ts because the claim pointer is that module's — see
  // `holderByCharacter`, which carries the reasoning this comment used to hold.
  const holders = holderByCharacter(seats)

  return await Promise.all(
    tokens.map(async (token) => {
      const holder = token.characterId ? holders.get(token.characterId) ?? null : null
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
 * THE CROSSING between the two choke points, in one pass over the board: which
 * characters this caller may be told about, and which of those they control.
 *
 * The only thing that leaves this module is two filtered sets of ids — never a
 * `Doc<'tokens'>` — which is the same narrow crossing `tokenReferencesImage` makes
 * below, and it is what lets `characters.vitals` be built out of both choke points
 * without either one reading the other's tables.
 *
 * **This is what ADR 0005 and CLAUDE.md's invariant 8 call `visibleCharacterIds`.** That
 * function was the sight half alone, and it is gone: once a second question had to be
 * asked about the same two hundred rows, keeping a separate entry point for each answer
 * meant reading the board twice. The name survives in the ADRs, which are history and are
 * not edited after the fact; the live prose names this one.
 *
 * **`visible` closes a leak that is easy to miss.** A health bar needs hit points for
 * every creature on the board, and the obvious way to serve one is to send a band for
 * every NPC in the game — which quietly publishes a *count*. A player reading twelve
 * entries knows the DM has twelve monsters prepared for tonight, and that is the same
 * category of spoiler as the scene names ADR 0004 refused to send. Scoping to what the
 * caller can already see means a hidden creature contributes nothing at all: not a
 * row, not a band, not a number in a length.
 *
 * **`controlled` is the second door, and it answers a different question.** `visible`
 * is *whose health bar may this caller be shown*; `controlled` is *whose sheet may
 * they open, and whose hit points may they change*. They are composed, never
 * substituted: control is added to sight, and the sight rule in `maySeeCharacter`
 * still runs first.
 *
 * ⚠️ **One traversal, and that is what makes ADR 0009's structural claim true rather
 * than coincidental.** The ADR says `controlled` is a subset of `visible` *by
 * construction*, and that there is deliberately no second layer test here because
 * adding one would be the signal that the composition had been broken above. That was
 * only ever a claim about two functions which each called `visibleTokens` and happened
 * to filter identically — two traversals that agreed. Now the subset property is the
 * loop: an id can only enter `controlled` on an iteration that has already put it into
 * `visible`. A grant written onto a DM-layer token therefore contributes nothing to a
 * player, because `visibleTokens` dropped that row before the loop began. The DM moves
 * the token to the player layer and the sheet arrives with it; the DM moves it back and
 * the sheet goes.
 *
 * It is also the reason this exists at all. `characters.vitals` re-runs on every point
 * of damage, once per distinct cache entry at the table, and it wants both sets — which
 * was two `take(MAX_TOKENS_PER_GAME)` range reads and two `maySee` passes over the same
 * two hundred rows to produce two answers from one iteration.
 *
 * ⚠️ **`playerId === undefined` gives an empty `controlled`. Fail closed.** A caller
 * with no seat is an anonymous client, not a caller who controls everything, and this is
 * the argument that widens access to a secret, so its absent case is the refusing one.
 * Note that this is not identity: a `playerId` is routing (ADR 0003), so this widens what
 * *that seat* may read to anybody who passes that seat's id. That residual is accepted
 * deliberately and is written out in full on `requireMovableToken` below.
 *
 * ⚠️ **`controlled` is skipped entirely for the DM, and that is safe only because every
 * consumer of it short-circuits on `isDm` first.** `maySeeCharacter` returns true for the
 * DM before it looks at the set, `visibleVitals` sends the DM exact numbers on the same
 * test, and `requireEditableCharacter` returns before it asks. An empty set for the DM is
 * therefore unobservable, and building one would mean a holder map and a controller
 * comparison per token for an answer nothing reads. A future caller that consults
 * `controlled` *before* `isDm` would have to change this.
 */
export async function boardCharacterAccess(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
  playerId?: Id<'players'>,
): Promise<{ visible: Set<Id<'characters'>>; controlled: Set<Id<'characters'>> }> {
  const tokens = await visibleTokens(ctx, gameId, isDm)

  const visible = new Set<Id<'characters'>>()
  const controlled = new Set<Id<'characters'>>()

  // Null rather than an empty map when there is no control question to answer, so the
  // loop below skips the whole comparison rather than looking every token up in a map
  // that cannot match. See the warnings above for both of the cases that get here. The
  // seat id rides along inside it rather than being re-tested in the loop, which is how
  // the narrowing survives: one null check answers "is there a control question?" and
  // "which seat is asking?" together.
  const control =
    playerId !== undefined && !isDm ? { playerId, holders: holderByCharacter(seats) } : null

  for (const token of tokens) {
    const characterId = token.characterId
    if (!characterId) continue
    visible.add(characterId)
    if (control === null) continue
    // The same rule `publicTokens` projects through and `requireMovableToken` refuses
    // by, so what the browser drew as draggable, what the server accepts, and what a
    // granted seat is allowed to read are one function rather than three that agreed
    // when they were written.
    const holder = control.holders.get(characterId) ?? null
    if (effectiveControllersOf(token, holder).includes(control.playerId)) {
      controlled.add(characterId)
    }
  }

  return { visible, controlled }
}

/**
 * The control half alone. For `resolveEditableCharacter` in `convex/characters.ts`, which
 * reaches the grant question about **one named character** — the sheet panel opening it,
 * or a mutation about to write to it — and so has no use for the sight set beside it.
 *
 * Same discipline as its sibling: a set of ids leaves, never a `Doc<'tokens'>`, so
 * `lib/characters.ts` can widen what a granted player is allowed to see without either
 * choke point reading the other's tables.
 */
export async function controlledCharacterIds(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
  playerId?: Id<'players'>,
): Promise<Set<Id<'characters'>>> {
  return (await boardCharacterAccess(ctx, gameId, isDm, seats, playerId)).controlled
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
 * The token a DM named, or the same `TokenNotFound` throw. `requireMovableToken` above
 * with its one boolean answered — and **the** place the reasoning for that answer is
 * written down.
 *
 * ⚠️ **Takes a `game` that has already been admitted, not a code and a DM code, so no
 * authorisation moves into this module.** `requireDm` stays in `convex/board.ts`, where
 * the codes arrive and where every other gate in the app is; what reaches here is a
 * document that call has already vouched for. This file holds neither the game code nor
 * the DM code, which is the split every writer below keeps, and it is why *this* helper
 * can exist here while the check it depends on cannot.
 *
 * That is also what discharges the literal `true`. It is not a locally computed `isDm`
 * of the kind CLAUDE.md invariant 7 forbids — it is the caller's `requireDm` reported
 * once instead of re-derived from a seat, a badge or a `playerId`. Six DM-gated
 * mutations used to pass that literal themselves, each carrying a copy of this
 * paragraph and each resting on two adjacent lines staying in one order; four copies of
 * a comment maintaining an ordering property is this codebase's own signal that a shared
 * fact has no home. It has one now, and a call site cannot reach it without a game.
 *
 * **Named for what it actually asks.** For a caller holding the DM code the movability
 * question has exactly one answer — the DM moves anything on their own board — so what
 * is left of `requireMovableToken` on that path is *does this token exist on this
 * board*, which is what all six of these callers want and what the older name stopped
 * describing. `moveToken` keeps the `isDm` / `playerId` form, because it is the one
 * caller for which control is a real question.
 *
 * **The shared `TOKEN_NOT_FOUND` refusal comes with it**, and is right to, even though a
 * caller who already holds the DM code has no existence oracle to gain from it: the
 * parity across every refusal is that constant's whole value, and a call site quietly
 * opting out is how one shared refusal becomes six literals that drift.
 */
export async function requireDmToken(
  ctx: QueryCtx,
  game: Doc<'games'>,
  tokenId: Id<'tokens'>,
): Promise<Doc<'tokens'>> {
  return await requireMovableToken(ctx, game, tokenId, true)
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
 * Rename, resize or re-tint one token — the cosmetic corner of the DM's Tokens tab, and
 * the first of the four writers that tab's mutations edit a token through.
 *
 * ⚠️ **These four live here by discipline rather than by mechanism, and it is worth
 * saying which.** `leakGuard.test.ts` greps for *reads* — `.query('tokens'` and
 * `db.get('tokens'` — and `convex/board.ts` already inserts and deletes rows in that
 * table itself, so nothing mechanical would stop a fifth writer being written next
 * door. They are here because the reasoning about what a write to `layer` or
 * `characterId` does to a player's payload belongs beside the predicate that decides
 * it, which is in this file; the guard is not what is holding that.
 *
 * **It checks nothing it cannot know**, which is the same split `setTokenControllers`
 * keeps below. The name's length, the size's range and the tint's pattern are all
 * checked in `convex/board.ts`, by `requireTokenAppearance`, because that is where the
 * game and the DM code are — this module holds neither, and a writer that half-validated
 * would be a second, weaker copy of a check that already exists. The three writers after
 * this one inherit that sentence and name only their own unchecked facts.
 *
 * **Takes the document rather than an id**, which the four of them share and
 * `setTokenControllers` does not. The deviation is deliberate: each of these has a
 * reason to compare against what is stored, the caller already holds the row because
 * `requireDmToken` handed it back, and the comparison buys **no-op suppression**.
 * A DM re-submitting an unchanged form should cost the table nothing, and a patch that
 * changes no field is still a write — Convex rewrites the whole document, invalidating
 * `board.tokens` for every client at the table. It is the reason `revokeControlForSeat`
 * skips the tokens it would not change, and the reason `characters.assign` guards its
 * write of `reserved`.
 *
 * There is deliberately **no test** for the suppression here, and the absence is not an
 * omission: a skipped patch and an identical patch leave byte-identical documents, so
 * nothing observable through the public API can tell them apart, and this project does
 * not keep guards that cannot fail. What it saves is a subscription invalidation, which
 * is not a thing the API can be asked about. (`replaceTokenArt`'s early return is a
 * different animal — that one is observable, because skipping it destroys the art.)
 */
export async function setTokenAppearance(
  ctx: MutationCtx,
  token: Doc<'tokens'>,
  fields: { name: string; sizeSquares: number; tint: string },
): Promise<void> {
  if (
    token.name === fields.name &&
    token.sizeSquares === fields.sizeSquares &&
    token.tint === fields.tint
  ) {
    return
  }

  await ctx.db.patch('tokens', token._id, fields)
}

/**
 * Move one token between the player layer and the DM's. **A secrecy write, and the
 * broadest one on the board** — this is the field the whole of invariant 8's structural
 * guard exists to act on.
 *
 * ⚠️ Moving a token to `'dm'` does all of the following, in one patch, with nothing
 * else written anywhere:
 *
 * - **the coin leaves every player's `board.tokens`**, because `visibleTokens` filters
 *   on `maySee`;
 * - **its placements leave every player's `board.positions`**, because each placement is
 *   hydrated back to its token and decided by the same predicate — so *the fact that
 *   something is standing there* goes with it, which is most of what was being hidden;
 * - **the bound character leaves both halves of `boardCharacterAccess`**, because that
 *   function iterates `visibleTokens` and an id cannot enter `controlled` on an
 *   iteration that did not already put it into `visible`. So a granted seat loses that
 *   creature's sheet **and its exact hit points** in the same write, and the hit points
 *   go by falling back to the band rather than by anything being subtracted.
 *
 * Moving it back to `'player'` restores every one of those, in the same one write.
 *
 * **The stored grants are untouched in both directions**, and that is what makes the
 * round trip usable rather than destructive: `controllerIds` is not read here and must
 * not be. A grant on a DM-layer token is *inert*, not revoked — which is precisely how a
 * DM prepares an ambush, hands the party its pet before revealing it, and then reveals it
 * with one click (ADR 0009, and the note on `board.setControllers`).
 *
 * Checks nothing it cannot know, like its siblings, and here that is the whole of the
 * validation rather than a division of labour: `tokenLayerValidator` is the same union
 * the schema uses and the same one `board.setLayer` validates its argument against, so
 * there is no third member to reject and nowhere for one to appear in one copy and not
 * the other. That is the point of the union being spelled once.
 */
export async function setTokenLayer(
  ctx: MutationCtx,
  token: Doc<'tokens'>,
  layer: TokenLayer,
): Promise<void> {
  if (token.layer === layer) return

  await ctx.db.patch('tokens', token._id, { layer })
}

/**
 * Bind one token to a character, or unbind it. **The singular sibling of
 * `detachCharacterFromTokens` above** — the same field, written in the same shape, for
 * one row the DM named instead of every row pointing at a character that has gone. A
 * rebind and a detach therefore leave a document of the same shape, which is one fewer
 * thing for the smoke script's field-by-field comparison to call *present on one side
 * only*.
 *
 * It is also **a secrecy write**, and the three consequences are worth having in front
 * of you rather than derivable from two other files:
 *
 * - ⚠️ **Rebinding a granted token onto a monster publishes that monster's stat block
 *   and its exact hit points to the granted seats, in this write, with no second
 *   confirmation anywhere.** `boardCharacterAccess` reads the binding the token carries
 *   *now*, so the grant the DM wrote last week starts pointing at tonight's dragon the
 *   moment the pointer moves. Nothing refuses it and nothing should — a DM handing the
 *   party a creature is the ordinary case — but it is the one write in the tab that can
 *   publish a secret without looking like it touched one.
 * - **Rebinding away from a claimed hero silently withdraws that seat's derived
 *   control.** The seat simply stops appearing in `controllerIds` on the next payload,
 *   with nothing written to the token to make that happen, and their coin stops being
 *   draggable. `grantedPlayerIds` is unchanged, which is exactly the two-fields-are-
 *   different-facts property `publicTokenValidator` exists to make visible.
 * - **Unbinding entirely collapses a claim-only token to the empty array**, which means
 *   the DM alone — the Milestone 2 correction on `effectiveControllersOf`, *an unattached
 *   token is the DM's*, reached by a new route.
 *
 * ⚠️ **It must not touch `controllerIds`, and that is not an oversight.** A grant is of
 * the token; the claim holder is composed *in* by `effectiveControllersOf` from whatever
 * the token points at now. Migrating the array on a rebind would write the derived half
 * down — the denormalisation ADR 0004 refused for `layer`, for the same reason — and the
 * bug that follows is a token still listing the seat that played the creature it is no
 * longer bound to: a stale grant that authorises a real drag and that the DM's dialog
 * renders as a box it has no way to explain.
 *
 * Checks nothing it cannot know: whether this character belongs to this game is
 * `board.setCharacter`'s job, through the same `getCharacterInGame` that `board.addToken`
 * runs, because that is where the game is.
 */
export async function setTokenCharacter(
  ctx: MutationCtx,
  token: Doc<'tokens'>,
  characterId: Id<'characters'> | null,
): Promise<void> {
  if ((token.characterId ?? null) === characterId) return

  // `undefined` for none, matching `detachCharacterFromTokens` above, so the two routes
  // to an unbound token produce one shape of row rather than two.
  await ctx.db.patch('tokens', token._id, { characterId: characterId ?? undefined })
}

/**
 * Point one token at a different piece of art, or at none — and delete the blob it was
 * pointing at.
 *
 * **Named *replace* rather than *set* because the old blob does not survive**, and the
 * caller should have to read that in the name. The delete cannot be somebody else's job:
 * `files.discard` refuses a blob a token still references, through
 * `tokenReferencesImage` at the bottom of this file, so the only transaction allowed to
 * delete the old art is the one that stops referencing it. That is this one.
 *
 * ⚠️ **The early return is a DATA-LOSS guard, not an optimisation.** Re-submitting the id
 * a token already carries would otherwise patch the row to point at that blob and then
 * delete the blob — leaving a token drawing nothing, with a valid-looking `imageId`, and
 * no way for anyone looking at it afterwards to explain why. Unlike the suppression on
 * its three siblings, this one is observable and is tested.
 *
 * The delete is **unconditional** on there having been a previous blob, matching
 * `board.removeToken` and `deleteTokensInGame`, and it inherits their caveat unchanged:
 * today an upload makes exactly one token and there is no route to pick an existing blob,
 * so this id has no other owner. The game editor's shared token library breaks that, and
 * whatever makes art shareable has to make all **three** of those deletes conditional at
 * the same time. A *partially* conditional set of three is the state in which somebody
 * believes the problem is solved.
 *
 * Checks nothing it cannot know: that the blob exists and is under `MAX_TOKEN_BYTES` is
 * `board.setArt`'s job, through the same `requireTokenArt` that `board.addToken` runs,
 * because the limit belongs beside the DM code that admitted the upload.
 */
export async function replaceTokenArt(
  ctx: MutationCtx,
  token: Doc<'tokens'>,
  imageId: Id<'_storage'> | null,
): Promise<void> {
  const previous = token.imageId ?? null
  if (previous === imageId) return

  await ctx.db.patch('tokens', token._id, { imageId: imageId ?? undefined })
  if (previous) await ctx.storage.delete(previous)
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
 * Every token in a game, with its placements and its art. For the purge tool in
 * `convex/admin.ts`, and for nothing a client can reach.
 *
 * This is `removeToken` done once per row, and it lives here for the reason every
 * other write to these two tables does: `convex/admin.ts` is swept by
 * `leakGuard.test.ts` like every other module, so it may not query `tokens` itself.
 * That sweep catching a brand-new destructive module with no edit at all is the
 * arrangement working, not an obstacle to route around.
 *
 * ⚠️ **The one read of `tokens` in this file that does not pass through `maySee`,
 * and it is safe for a reason worth stating rather than assuming.** A purge is not a
 * question about contents — it does not care which layer a row is on, and it must not,
 * because a DM-layer ambush left behind in a deleted game is exactly the residue this
 * exists to remove. What keeps invariant 8 intact is that **a number leaves and never
 * a row**: the return value is a count, the same narrow crossing `countTokensInGame`
 * below and `tokenReferencesImage` already make.
 *
 * ⚠️ **The blob goes with the row, and that is the point of doing this properly**
 * (CLAUDE.md invariant 6). Rows without their art would be a *worse* leak than the
 * games being cleaned up, because a deleted game's coins are unreachable from every
 * screen in the app and would sit against the 1 GB ceiling for ever with nothing able
 * to name them. Unconditional on the id being present, exactly as `board.removeToken`
 * is, and it inherits that mutation's caveat unchanged: the game editor's token
 * library makes one piece of art shareable between tokens, and whatever makes it
 * shareable has to make **all three** of the unconditional deletes conditional at the
 * same time — `board.removeToken`, `replaceTokenArt` above, and this one. Three sites,
 * named at each of them, because a partially converted set is worse than none.
 *
 * This does **not** make the orphaned-blob sweeper unnecessary. That sweeper is for
 * blobs a *refused or abandoned upload* left behind — a mutation that throws cannot
 * delete the file it just rejected (see `files.discard`), so those blobs never had a
 * row to be deleted alongside. Different residue, different pass.
 */
export async function deleteTokensInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  for (const token of tokens) {
    // Placements first, across every scene rather than the current one, for the same
    // reason `removeToken` does it in this order: they are what points at the token,
    // so no ordering of failures can leave a scene holding a position for a document
    // that has gone.
    await deleteTokenPlacements(ctx, token._id)
    if (token.imageId) await ctx.storage.delete(token.imageId)
    await ctx.db.delete('tokens', token._id)
  }

  return tokens.length
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
