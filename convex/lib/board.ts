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
import { sceneFog } from './fog'
import {
  MAX_PLACEMENTS_PER_SCENE,
  MAX_SCENES_PER_GAME,
  MAX_TOKENS_PER_GAME,
} from './games'
import { duplicateNames } from './names'
import { findClaimHolder, holderByCharacter, listSeats } from './players'
import type { Grid, Point, Rect } from './grid'
import { anyRectCovers, cellOf, centreOfCell, snapToGrid } from './grid'
import {
  layerOf,
  maySeeLayer,
  mayPlayersMove,
  tokenLayerValidator,
  type TokenLayer,
} from './layers'

// The layer union used to be declared in this file, and moving it to lib/layers.ts is not
// a loosening of the choke point. What left is a function of a *string* — three literals,
// two `switch`es and a label — which no caller can turn back into a row. What stayed is
// every predicate that takes a `Doc<'tokens'>`, so "does this leak?" is still answered by
// reading this file, which is the claim at the top.
//
// The move paid for itself on the client, where a `Record<TokenLayer, …>` is what makes a
// fourth layer fail to compile in the two places the browser decides how to draw and label
// one. Keying a record off `PublicToken['layer']` needs the type's *name*, and reaching for
// it here would have meant value-importing the choke point into the bundle.

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
 * A token on the Background layer, refused to a player who tried to drag it.
 *
 * ⚠️ **Deliberately distinguishable from `TOKEN_NOT_FOUND`, which inverts the rule that
 * constant exists to enforce — so the inversion has to be argued rather than assumed.**
 *
 * That rule is about an *oracle*: telling "you may not move that" apart from "no such
 * token" lets somebody enumerate the GM layer by guessing ids, and knowing an ambush exists
 * spoils it whether or not you can see it. Every word of that still holds for a GM-layer
 * token, which is why it still throws `TOKEN_NOT_FOUND`.
 *
 * It does not hold here, because a Background token **is in the player's payload** — it is
 * drawn on their screen, they clicked on it, and they can see it did not move. There is no
 * existence to confirm and nothing to enumerate. Answering "that token is not on this
 * board" about a coin somebody is looking at is not discretion, it is a lie, and it reads as
 * a bug in the application rather than as a rule of the game.
 *
 * A separate constant rather than reusing `TokenNotYours` because that message ends "ask the
 * DM to hand it to you", and here that is not true: the DM cannot hand over a Background
 * token without first moving it off Background. One constant so the tests can assert the
 * `kind`, exactly as they do for the other two.
 */
export const TOKEN_NOT_MOVABLE = {
  kind: 'TokenNotMovable',
  message: 'That token is part of the scenery. Only the DM can move it.',
}

/**
 * The whole visibility rule, in one place. **A `Doc<'tokens'>` goes in.**
 *
 * `isDm` arrives from `resolveDmAccess` in lib/games.ts, which means it is the
 * result of comparing a DM code supplied on *this* request against the one stored
 * on the game. It is not computed here and it must never be computed from anything
 * else. In particular it is never `players.isDm`, which is a badge in the roster
 * that anybody can find (invariant 7), and never derived from a `playerId`
 * argument, which says which seat to act on rather than who is calling (ADR 0003).
 * Either of those would amount to a player asking to be trusted, and would defeat
 * invariant 1 completely while looking like a working filter.
 *
 * ⚠️ **The `isDm` short-circuit is above the layer question rather than inside it, and the
 * ordering is deliberate.** `maySeeLayer` is a `switch` over three literals with a `never`
 * arm; folding the DM in would put `isDm ||` in every arm and force the `never` arm to
 * decide what a DM sees — a second question inside a discriminator, which is the failure
 * `isReservedCharacter` is written the way it is to avoid. So this function answers *who is
 * asking* and lib/layers.ts answers *what this layer is*, and a fourth layer changes exactly
 * one of those two files.
 *
 * ⚠️ **Fog is not here, and that is the other half of the same discipline.** A fogged token
 * is withheld too, but that is a fact about a `(scene, position)` pair rather than about this
 * row, so it is `&&`-ed at the call sites below — see `foggedTokenIds`. Folding it in would
 * mean handing this function a set it cannot verify was built for the same caller and the
 * same scene, which is precisely the hazard `readableCharacterIds` documents next door: two
 * `ReadonlySet`s the compiler cannot tell apart, one of which publishes everything.
 */
function maySee(token: Doc<'tokens'>, isDm: boolean): boolean {
  return isDm || maySeeLayer(layerOf(token.layer))
}

type FogVeil = {
  rects: readonly Rect[]
  holders: Map<Id<'characters'>, Doc<'players'>>
}

/**
 * The fog on one scene, read once, or null when there is none to apply.
 *
 * Split from the test below because **the callers already hold most of what deciding needs**,
 * and the first version did not take advantage of that: it range-read the placements a second
 * time, point-got token documents its caller had just read, and fetched a roster it had been
 * handed. Three redundant reads on the two hottest queries in the application, for an answer
 * that was correct. So this reads only the part nobody else has — the rectangles — and
 * `veiled` below is pure.
 *
 * The early returns are the cost model, and each is deliberate:
 *
 * - **The DM reads nothing at all.** Not an optimisation: a `fogRects` read in the DM's
 *   transaction would put the scene's fog into the read set of every board query belonging to
 *   the one client that is *drawing* the fog, so each rectangle would re-execute the lot. The
 *   same reasoning `readableCharacterIds` uses to skip the board entirely for a DM.
 * - **A scene with no rectangles returns before anything else.** ⚠️ Stated precisely, because
 *   an earlier version of this comment claimed read sets *byte-identical* to before the feature
 *   and that is not quite true — one empty range read on this scene's `fogRects` remains. What
 *   is true is the half that matters: **nothing a `tokenPositions` write does can invalidate
 *   it**, because an empty range is invalidated only by an insert into that range, which is
 *   `fog.draw` and nothing else. So no subscription joins a drag's invalidation set until a
 *   rectangle actually exists.
 * - **`board.tokens` is not a caller.** Fog filters positions and the character crossing, never
 *   the token projection, so signed storage URLs are not re-resolved on a drag — the cost
 *   ADR 0004 split the two board queries to avoid.
 *
 * ⚠️ **`seats` is taken rather than read, and an empty roster is a real answer rather than a
 * missing one.** `boardCharacterAccess` hands over the roster it already built;
 * `visibleCharacterIds` passes the empty one deliberately, because putting a `players` range
 * read into the feed's read set would re-push sixty rows on every join, rename and claim — a
 * trade that function's docblock refuses in as many words, and which the first version of this
 * one quietly made anyway by calling `listSeats` itself. The consequence is on `veiled`.
 */
async function fogVeil(
  ctx: QueryCtx,
  sceneId: Id<'scenes'> | null,
  isDm: boolean,
  seats: Doc<'players'>[],
): Promise<FogVeil | null> {
  if (isDm || sceneId === null) return null

  const rects = await sceneFog(ctx, sceneId)
  if (rects.length === 0) return null

  return { rects, holders: holderByCharacter(seats) }
}

/**
 * Is this token, standing here, hidden from the party? **Pure**, so a caller decides with the
 * token and the placement it already has in hand.
 *
 * The centre point, not the footprint. `cellOf` carries a half-square parity offset — an
 * even-sized token centres on a grid *intersection* — so a footprint test would need
 * `sizeSquares` and `gridSize`, which means reading the scene *document*, and an uncalibrated
 * grid would then produce a NaN half-extent that silently unfogs the whole map. The stored
 * coordinate already *is* the centre, so no grid enters the question at all. It is also stable
 * at the boundary, where a footprint test makes a 2x2 ogre one pixel over the line vanish
 * entirely while most of it stands in the lit room.
 *
 * ⚠️ **A token anybody at the table controls is never veiled, and this is a correctness
 * requirement rather than a courtesy.** `board.positions` takes no seat and must not — that is
 * the per-seat cache split the feed deliberately walked away from — so fog is one answer for
 * every non-DM. Without this clause a player who drags their own hero into a fogged corridor
 * loses their own coin from their own screen, with no way to select it back and no way to undo,
 * recoverable only by asking the DM. The exclusion also says what fog is *for*: it hides what
 * the DM placed. A hero and a granted pet belong to the table.
 *
 * ⚠️ **With an empty roster that exclusion is inert, and that is an accepted consequence rather
 * than a bug.** `visibleCharacterIds` passes no seats — see `fogVeil` — so on the feed's path a
 * claimed hero and a granted pet both look uncontrolled here. For a **hero** that costs exactly
 * nothing: `maySeeCharacter` admits a `pc` on its first line, so a hero is never in `visible`
 * for a reason that matters and is never withheld from the feed whatever this answers. For a
 * **granted pet** it means its lines are withheld while it stands in fog, even though its coin
 * is still drawn for the seat holding it. Mildly inconsistent, and the alternative is a
 * `players` range read on the highest-churn subscription in the application, which is the more
 * expensive of the two by a wide margin.
 */
function veiled(veil: FogVeil | null, token: Doc<'tokens'>, at: Point): boolean {
  if (veil === null) return false
  if (!anyRectCovers(veil.rects, at)) return false

  const holder = token.characterId ? veil.holders.get(token.characterId) ?? null : null
  return effectiveControllersOf(token, holder).length === 0
}

/**
 * Where every token on one scene is standing, keyed by token.
 *
 * The fourth spelling of this bounded read in this file, and the one that exists because
 * `boardCharacterAccess` needs the crossing without being a position query. It is called only
 * when a veil exists, so a game without fog does not perform it.
 */
async function placementsOn(
  ctx: QueryCtx,
  sceneId: Id<'scenes'>,
): Promise<Map<Id<'tokens'>, Point>> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  return new Map(placements.map((placement) => [placement.tokenId, placement]))
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
 *
 * ⚠️ **Fog is deliberately NOT applied here, and this is the single most consequential
 * placement decision in the feature.** This function feeds two very different consumers:
 * `publicTokens`, which projects the token *rows* and resolves a signed storage URL per
 * token, and `boardCharacterAccess`, which crosses the board into the character choke point.
 * Fogging here would filter both.
 *
 * Filtering the rows is what it costs that is unaffordable. Fog is a fact about a
 * *placement*, so any query that filters on it must read `tokenPositions` — the table
 * written ten times a second during a drag. Put that read into `board.tokens` and every drag
 * frame re-executes it, re-resolving up to two hundred signed URLs and re-pushing the whole
 * token list to every client: precisely the cost ADR 0004 split the two board queries to
 * avoid, spent to close a leak the layer model already answers properly.
 *
 * So the fog filter lives in `boardCharacterAccess` and in `visiblePositions`, and what a
 * player is denied about a fogged creature is **where it is standing, how hurt it is, and
 * what it just rolled** — never that a coin by that name exists somewhere in the game. That
 * last residual is real and is the same one an unplaced player-layer token has had since the
 * board existed. **The GM layer remains the tool for "may not know it exists"**, and it is
 * absolute; fog is the tool for "cannot see into that corridor", and it is not.
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
        // Normalised on the way out, which is what keeps the rename of the GM layer
        // invisible to the browser: `publicTokenValidator` carries the narrow three-member
        // union, so a row still stored as the legacy `dm` is projected as `gm` and no
        // client ever learns the transition happened. It is also why the relabel can run at
        // any point after this deploy rather than during it.
        layer: layerOf(token.layer),
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
  sceneId: Id<'scenes'> | null,
  isDm: boolean,
  seats: Doc<'players'>[],
  playerId?: Id<'players'>,
): Promise<{ visible: Set<Id<'characters'>>; controlled: Set<Id<'characters'>> }> {
  const [tokens, veil] = await Promise.all([
    visibleTokens(ctx, gameId, isDm),
    fogVeil(ctx, sceneId, isDm, seats),
  ])
  // Read only when there is a veil to apply, and *after* it — which is why this is not in the
  // `Promise.all` above. A game with no fog therefore performs no placement read here at all,
  // which is the whole of what makes the cascade free until it is used. Sequential costs one
  // round trip on the path that has already decided it is paying for fog.
  const at = veil === null || sceneId === null ? null : await placementsOn(ctx, sceneId)

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
    // ⚠️ **The fog cascade, and it is one line because the loop below already does the
    // work.** A creature standing in the dark never enters `visible`, so it loses its health
    // band in `visibleVitals` and its feed lines through `mayHearOf` — two consequences from
    // one filter, by exactly the structural subset property the docblock above describes.
    // It cannot enter `controlled` either, which needs no separate statement for the same
    // reason a GM-layer grant is inert: the `continue` is above both.
    //
    // `&&`-ed here rather than folded into `maySee`, because a layer is a fact about this row
    // and fog is a fact about where it is standing — two separately-statable reasons, which
    // the DM's own screen has to be able to tell apart when it explains why the party cannot
    // see something.
    //
    // A token with no placement on this scene is not standing anywhere on it, so it cannot be
    // in the dark — which is also why a creature prepared on another map keeps its band.
    const standing = at?.get(token._id)
    if (standing !== undefined && veiled(veil, token, standing)) continue
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
  sceneId: Id<'scenes'> | null,
  isDm: boolean,
  seats: Doc<'players'>[],
  playerId?: Id<'players'>,
): Promise<Set<Id<'characters'>>> {
  return (await boardCharacterAccess(ctx, gameId, sceneId, isDm, seats, playerId)).controlled
}

/**
 * The sight half alone. For `readableCharacterIds` in lib/characters.ts, which asks whose
 * *name* this caller may be told, and has no grant question to ask at all.
 *
 * ⚠️ **This is not a revival of the `visibleCharacterIds` ADR 0005 named and
 * `boardCharacterAccess` replaced**, and the difference is the whole reason it is allowed to
 * exist. That function was a *second traversal* of the same two hundred rows, which is what
 * made keeping it beside the control question wasteful. This one delegates to the single
 * pass and throws half the answer away, so there is still exactly one loop over the board
 * and exactly one `maySee`.
 *
 * ⚠️ **The empty roster is correct rather than a shortcut, and it is what this wrapper is
 * for.** `boardCharacterAccess` consults `seats` only to build `holderByCharacter` for the
 * control comparison, and it skips that entirely when no `playerId` arrives — so a caller
 * with no grant question to ask has no use for the roster, and passing `[]` says so. What it
 * buys is real: `listSeats` is a range read, so taking it would put the whole `players`
 * table into the read set of a query that re-runs on every roll at the table, and every
 * join, rename, claim and release would then re-push the feed to everybody. The same trade
 * `visiblePositions` refuses to make one screen down, for the same reason.
 */
export async function visibleCharacterIds(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'> | null,
  isDm: boolean,
): Promise<Set<Id<'characters'>>> {
  return (await boardCharacterAccess(ctx, gameId, sceneId, isDm, [])).visible
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
 * ⚠️ **This used to say it takes no seats and that the signature must stay that way, and
 * that sentence is now corrected rather than overridden — read both halves.** The cost it
 * named is real and unchanged: a `players` range read here puts the whole roster into the
 * read set of the highest-churn subscription in the app, so every join, rename, claim and
 * release would re-execute the position query for every client, on top of the ten writes a
 * second a drag already makes. It was right to refuse that read *unconditionally* while
 * nothing needed it.
 *
 * Fog needs it, and only when fog exists — because a token somebody controls must never be
 * veiled, or a player who walks their hero into the dark loses their own coin. So the roster
 * read sits behind a rectangle existing on this scene, and the paragraph above still describes
 * exactly what a game without fog costs. A game with fog pays it, and `players` is the
 * lowest-churn table in a live session anyway: joins and claims happen in the lobby, before
 * anybody has drawn a rectangle.
 *
 * The distinction that sentence was protecting still holds: this signature takes no seats, and
 * nothing composes a controller field into a position row. The roster is read *inside the fog
 * question*, conditionally, and nothing about who may move a token leaves through this payload.
 *
 * ⚠️ **The fog test adds no read of its own here, and that is why it is shaped as a pure
 * function.** This query already range-reads the placements and already point-gets each token,
 * so `veiled` decides from what the loop is holding. An earlier version called a helper that
 * did both reads *again* — a duplicate 200-row scan and up to 200 duplicate point gets, ten
 * times a second per client, on the query invariant 2 exists to protect.
 */
export async function visiblePositions(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'>,
  isDm: boolean,
): Promise<PublicPosition[]> {
  const [placements, rects] = await Promise.all([
    ctx.db
      .query('tokenPositions')
      .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
      .take(MAX_PLACEMENTS_PER_SCENE),
    isDm ? [] : sceneFog(ctx, sceneId),
  ])
  // The roster only once a rectangle exists — see the ⚠️ above. `fogVeil` is handed the seats
  // rather than reading them, so the conditional lives here where the trade is being made.
  const veil =
    rects.length === 0 ? null : await fogVeil(ctx, sceneId, isDm, await listSeats(ctx, gameId))

  const rows = await Promise.all(
    placements.map(async (placement) => {
      const token = await ctx.db.get('tokens', placement.tokenId)
      // The gameId check is not paranoia about a caller: a scene belongs to one
      // game, so a placement pointing at a token in another is data that should
      // not exist, and dropping it here means a stray row cannot become a coin
      // hovering on somebody else's map.
      if (!token || token.gameId !== gameId || !maySee(token, isDm)) return null
      // The second reason, `&&`-ed rather than folded into `maySee`. This is the one the
      // roadmap's acceptance names: a player whose view of a corridor is fogged has no
      // position rows for what is standing in it. The coin is not drawn because the client
      // renders the intersection of the two board subscriptions, so a token with no
      // placement is simply not on this board.
      if (veiled(veil, token, placement)) return null
      return { tokenId: placement.tokenId, x: placement.x, y: placement.y }
    }),
  )

  return rows.filter((row): row is PublicPosition => row !== null)
}

/**
 * The token this caller is allowed to move, or a throw. Throws the SAME
 * TokenNotFound error for "no such token", "token in another game" and
 * "GM-layer token without the DM code" — telling those apart is an existence
 * oracle for the GM layer. Throws TokenNotMovable for a Background token, which is
 * scenery everybody can see, and TokenNotYours for a player-layer token this seat
 * neither plays nor has been granted (both advisory only; see ADR 0004).
 *
 * ⚠️ **Fog is deliberately not tested here, and the omission is argued rather than
 * inherited.** Two reasons, and the second is decisive.
 *
 * The oracle argument does not apply. The only tokens a non-DM can reach past `maySee`,
 * `mayPlayersMove` and `effectiveControllersOf` are ones whose existence they have already
 * been told about — it was in their payload, or they hold a grant on it. There is no id to
 * guess and nothing a refusal could confirm.
 *
 * And the read would land on the wrong path. This handler runs ten times a second during a
 * drag; a `fogRects` range read here would put that range into the transaction's read set
 * and turn every rectangle the DM draws into an OCC conflict against every in-flight drag —
 * on the one write path invariant 2 exists for. `foggedTokenIds` can afford both of its
 * reads because it runs in a *query* that Convex re-executes; this cannot.
 *
 * The consequence is that a token can be moved into or within fog and the move succeeds while
 * other clients see nothing, which is the same asymmetry a GM-layer token already has. That
 * is also correct on its own terms: a monster walking into the dark is what the DM is doing
 * on purpose, and refusing the write would be enforcing a *view* on *board state*.
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

  // The DM moves anything on their own board, including a claimed hero and their own
  // scenery, because dragging the party through a door is a normal thing for them to do.
  if (isDm) return token

  // ⚠️ **Scenery is refused here, above the claim and grant read, and the position in this
  // function is the whole of what it means.**
  //
  // Above the read, so **a grant cannot open a layer.** A seat the DM has granted a
  // Background token to is still refused, which makes the grant *inert* rather than
  // dangerous — exactly what `board.setControllers` already says about the GM layer, now
  // true of two layers by one line instead of two. Below the `isDm` return, because the
  // acceptance is that scenery cannot be picked up *by them*; the DM rearranges it freely.
  //
  // It is also the cheaper order on a handler that runs ten times a second: a drag on
  // scenery is refused with no index read at all, the same instinct as `requireFinite`
  // running before any read in `moveToken`.
  if (!mayPlayersMove(layerOf(token.layer))) throw new ConvexError(TOKEN_NOT_MOVABLE)

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
 * Deliberately only used by the mutations that **create** a placement — `addToken`,
 * `placeOnScene` and `duplicate`. Never `moveToken`: moving a token onto an occupied
 * square is a legitimate thing to want — two figures crowding a doorway — so that
 * handler must never displace anything, and this is not called from there.
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
  return (await freeCellsNear(ctx, sceneId, grid, sizeSquares, point, 1))[0]
}

/**
 * The `count` nearest empty squares to `point`, nearest first, for dropping that many
 * *new* tokens at once.
 *
 * **The plural is the real function and `freeCellNear` above is the `count: 1` case**,
 * so there is one occupancy rule and one terminating condition rather than two that
 * agreed on the day they were written. Adding five goblins is precisely the gesture
 * that produced the stacking `freeCellNear` was written to stop, so a duplicate that
 * called it five times would either read the placements five times or hand back the
 * same square five times, depending on how the transaction saw its own writes.
 *
 * **One placements read for the whole batch.** Each accepted cell joins `taken` before
 * the walk continues, which is what makes the five copies land in five different
 * squares from a single scan of the board.
 *
 * The ring walk, the snapped-centre key and the fallback are all `freeCellNear`'s and
 * unchanged — see the note above for why occupancy is a centre and not a footprint.
 */
export async function freeCellsNear(
  ctx: QueryCtx,
  sceneId: Id<'scenes'>,
  grid: Grid,
  sizeSquares: number,
  point: Point,
  count: number,
): Promise<Point[]> {
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

  const found: Point[] = []
  const wanted = cellOf(point, grid, sizeSquares)

  for (let ring = 0; ring <= FREE_CELL_RINGS && found.length < count; ring += 1) {
    for (let dCol = -ring; dCol <= ring && found.length < count; dCol += 1) {
      for (let dRow = -ring; dRow <= ring && found.length < count; dRow += 1) {
        // Only the edge of each ring: the inside was covered by a smaller one.
        if (ring > 0 && Math.abs(dCol) !== ring && Math.abs(dRow) !== ring) continue
        const candidate = centreOfCell(
          { col: wanted.col + dCol, row: wanted.row + dRow },
          grid,
          sizeSquares,
        )
        const key = `${candidate.x},${candidate.y}`
        if (taken.has(key)) continue
        taken.add(key)
        found.push(candidate)
      }
    }
  }

  // Every square within the search is occupied, which needs 289 tokens on one
  // scene and cannot happen under MAX_TOKENS_PER_GAME and MAX_DUPLICATE_COUNT.
  // Stack rather than refuse: a token the DM cannot place at all is worse than
  // one they have to drag.
  while (found.length < count) found.push(centreOfCell(wanted, grid, sizeSquares))

  return found
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
 * validation rather than a division of labour: `tokenLayerValidator` in lib/layers.ts is the
 * union `board.setLayer` validates its argument against, so there is no fourth member to
 * reject and nowhere for one to appear in one copy and not the other. That is the point of
 * the union being spelled once.
 *
 * ⚠️ **The schema's union is one member wider than this one while the rename is in flight**,
 * and the no-op guard reads across that gap correctly by accident and then on purpose: a
 * token still stored as the legacy `dm` compares unequal to `'gm'`, so re-layering it writes
 * the canonical spelling. Every token the DM touches migrates itself. That does not replace
 * the sweep — a token nobody moves keeps the old value, which is what `relabelGmLayer` is
 * for — but it does mean the two mechanisms cannot disagree, because both write the same
 * canonical value through the same field.
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
 * TRANSITION ONLY — rewrite every `dm` layer in one game to `gm`. Deleted with the rest of
 * the rename scaffolding once the sweep has run against every deployment.
 *
 * Lives here rather than in `convex/admin.ts` because it reads and writes `tokens`, and
 * `leakGuard.test.ts` sweeps `admin.ts` like every other module — a migration is not an
 * exemption from the choke point. What `admin.ts` keeps is the `internalMutation` wrapper,
 * where the authorisation question lives, which is the same split `purgeGame` already makes.
 *
 * One game per call, bounded by `MAX_TOKENS_PER_GAME`, so the natural transaction is a game
 * and the script above it can be resumable and report per game. That bound is also the
 * argument against adding `@convex-dev/migrations` for this: the component exists for
 * cursor-driven batching across a table too large for one transaction, and two hundred rows
 * is not that.
 *
 * Patches only the rows that need it, like `revokeControlForSeat` — a no-op patch is a write
 * that invalidates every subscription reading the row for no change at all.
 */
export async function relabelGmLayer(ctx: MutationCtx, gameId: Id<'games'>): Promise<number> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  let relabelled = 0
  for (const token of tokens) {
    if (token.layer !== 'dm') continue
    await ctx.db.patch('tokens', token._id, { layer: 'gm' })
    relabelled += 1
  }
  return relabelled
}

/**
 * TRANSITION ONLY — how many tokens in this game still carry the legacy spelling.
 *
 * The check that has to read zero across every deployment before the narrowing commit
 * lands. Returns a count and never a row, like `countTokensInGame` beside it.
 */
export async function countLegacyLayers(ctx: QueryCtx, gameId: Id<'games'>): Promise<number> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.filter((token) => token.layer === 'dm').length
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
 * ⚠️ **The delete is conditional on nothing else owning the blob, and duplication is what
 * made that necessary.** This used to be unconditional, on the reasoning that an upload
 * made exactly one token — true until `board.duplicate` began copying the image id, at
 * which point repointing one of five goblins would have blanked the other four. The row
 * being patched must not count as an owner of the picture it is giving up, which is the
 * whole reason `otherTokenReferencesImage` exists as a sibling of `tokenReferencesImage`
 * rather than as a flag on it.
 *
 * The question is asked **before** the patch. It is correct either way, because the
 * predicate excludes this row by `_id` — but computing it first means the answer does not
 * depend on read-your-writes returning a row whose `imageId` has already moved on, and
 * this file has already recorded once what it costs to let two adjacent lines carry a
 * correctness property.
 *
 * This is one of the three deletes the shared-art conversion had to reach together, and
 * the other two are **not** the same shape: `board.removeToken` asks this predicate, and
 * `deleteTokensInGame` cannot ask it at all — see its own note for why. Naming all three
 * at each of them is what made them findable in one pass; saying how each one differs is
 * what stops the next reader assuming they are interchangeable.
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

  const shared = previous !== null && (await otherTokenReferencesImage(ctx, token, previous))

  await ctx.db.patch('tokens', token._id, { imageId: imageId ?? undefined })
  if (previous && !shared) await ctx.storage.delete(previous)
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

/**
 * Where one token stands on one scene, or null if it is not on that board at all.
 *
 * Extracted from `placeToken`'s own body, which is why there is one lookup rather than
 * four: the upsert asks it, `board.placeOnScene` asks it to be idempotent, and
 * `board.removeFromScene` asks it to be a no-op. The row's **existence** is what puts a
 * token on a board, so "is it there?" and "where is it?" are one question.
 */
export async function placementOf(
  ctx: QueryCtx,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
): Promise<Doc<'tokenPositions'> | null> {
  return await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId_and_tokenId', (q) => q.eq('sceneId', sceneId).eq('tokenId', tokenId))
    .unique()
}

/**
 * Take one token off one board, leaving every other placement alone. Answers whether a
 * row actually went.
 *
 * The single-board sibling of `deleteTokenPlacements` below, which sweeps *every* board
 * because the token itself is going. Two functions rather than one with a nullable
 * `sceneId`, for `deleteScenePlacements`' reason: the axis differs, so the bound differs,
 * and one function taking either would be one function with two bounds.
 *
 * The boolean is what lets `board.removeFromScene` be a no-op rather than a throw
 * without the mutation having to look first.
 */
export async function removeTokenFromScene(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
): Promise<boolean> {
  const placement = await placementOf(ctx, sceneId, tokenId)
  if (!placement) return false

  await ctx.db.delete('tokenPositions', placement._id)
  return true
}

/**
 * Every board this token stands on. **Ids only.**
 *
 * The narrow crossing this module always makes — a set of ids leaves and never a row,
 * the same discipline `boardCharacterAccess` keeps — so the scene *names* are resolved
 * by the caller through `lib/scenes.ts` and this file never learns one.
 *
 * Bounded by the scene count rather than the placement count, verbatim from
 * `deleteTokenPlacements` below: a token holds at most one row per scene, so this is the
 * tight bound and `MAX_PLACEMENTS_PER_SCENE` would be the wrong axis.
 *
 * ⚠️ **That bound has stopped being unreachable.** Until `board.placeOnScene` existed a
 * coin could only ever be on the boards `addToken` and `moveToken` had put it on, and the
 * client only ever names the active scene — so a token on all 25 scenes was not a state
 * the application could produce. It is now one press per map. The take is still exactly
 * tight and still cannot truncate, but it is worth knowing it is now approached rather
 * than theoretical.
 */
export async function tokenPlacementScenes(
  ctx: QueryCtx,
  tokenId: Id<'tokens'>,
): Promise<Id<'scenes'>[]> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
    .take(MAX_SCENES_PER_GAME)

  return placements.map((placement) => placement.sceneId)
}

/** Insert or update the placement of a token on a scene. */
export async function placeToken(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
  point: Point,
): Promise<void> {
  const existing = await placementOf(ctx, sceneId, tokenId)

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
 * to name them.
 *
 * ⚠️ **Each distinct blob is deleted exactly once, and this is the third of the three
 * sites the shared-art conversion had to reach — converted differently from the other
 * two, on purpose.** `board.removeToken` and `replaceTokenArt` ask
 * `otherTokenReferencesImage`; this one must not, for two reasons that both matter:
 *
 * - **It would answer the wrong question.** A purge deletes *every* token in the game,
 *   so "is any other token using this?" is `true` for a twin that is also about to go.
 *   Asked per row it would keep the blob for ever, or work only by accident of the order
 *   the loop happens to run in — which is exactly the fragility `replaceTokenArt`'s early
 *   return exists to stop this file resting on.
 * - **It would be O(n²).** Two hundred tokens would mean two hundred range reads of two
 *   hundred rows — forty thousand document reads in one transaction, on the function that
 *   has to work on the largest game in the deployment. Today it reads two hundred rows
 *   once, and it still does.
 *
 * So the conversion here is **deduplication**, and it is a stronger statement than the
 * other two make rather than a weaker one: the question they ask is answered *no* by
 * construction for every id, because no token survives to own it.
 *
 * ⚠️ **This also fixes a live bug rather than merely preparing for one.** The loop used
 * to call `ctx.storage.delete` once per row, and a second delete of the same id throws —
 * confirmed against a real deployment: `Error: storage id … not found`, a plain `Error`
 * and not a `ConvexError`, so it aborts the whole transaction. Before duplication nothing
 * could produce two tokens sharing a blob, so it never fired; from the moment one press
 * can make five goblins, a purge of any game containing them would have failed outright
 * and `admin.purgeGame` would have had no way to clean it up.
 *
 * The two deletes are ordered rows-then-blobs, so a failure part-way leaves storage
 * holding bytes with no row — which the orphaned-blob sweeper is for — rather than rows
 * pointing at bytes that have gone, which nothing repairs.
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

  const blobs = new Set<Id<'_storage'>>()

  for (const token of tokens) {
    // Placements first, across every scene rather than the current one, for the same
    // reason `removeToken` does it in this order: they are what points at the token,
    // so no ordering of failures can leave a scene holding a position for a document
    // that has gone.
    await deleteTokenPlacements(ctx, token._id)
    if (token.imageId) blobs.add(token.imageId)
    await ctx.db.delete('tokens', token._id)
  }

  for (const imageId of blobs) {
    await ctx.storage.delete(imageId)
  }

  return tokens.length
}

/**
 * The names the next `count` coins should take, given a source name and everything
 * already on the board.
 *
 * ⚠️ **This shape is what keeps invariant 8 intact, and the obvious alternative breaks
 * it.** A helper handing back *every token name in the game* would give `convex/board.ts`
 * an array containing `Ambush Skeleton` — the exact string `board.test.ts` scans player
 * payloads for, and the secret this module exists to hold. What leaves here is
 * `Goblin 4`, `Goblin 5`: strings derived from the source name the caller already holds
 * and from an integer. A GM-layer coin's name **influences the number and nothing else**,
 * which is the same narrow crossing `countTokensInGame` below makes with one integer and
 * `tokenReferencesImage` with one boolean.
 *
 * Counting both layers is required for the reason those two give: numbering that ignored
 * the hidden half would hand the DM a `Goblin 4` to stand beside the `Goblin 4` they had
 * already prepared.
 *
 * The rule itself is `duplicateNames` in lib/names.ts, which is pure and browser-shared —
 * so the dialog's live preview and this write are one function rather than two that
 * agreed on the day they were written.
 */
export async function nextTokenNames(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sourceName: string,
  count: number,
): Promise<string[]> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return duplicateNames(
    sourceName,
    tokens.map((token) => token.name),
    count,
  )
}

/**
 * One more coin exactly like this one, under a new name and standing for a new creature.
 *
 * ⚠️ **Both optional fields are spread, never written as `imageId: undefined`, and that
 * is the line `npm run test:smoke` exists to protect.** `undefined` is not a Convex value,
 * so an insert naming a field and giving it that is a *different write* from an insert
 * omitting the field — and convex-test does not apply Convex's own value validation, so
 * the spelled-out version passes the whole suite and only misbehaves against a real
 * deployment. It is also exactly what makes the smoke script's field-by-field comparison
 * report `present on one side only`. `insertCharacter` carries the same warning for the
 * same reason.
 *
 * `layer` is carried as **stored**, legacy spelling and all, because `layerOf` is a
 * read-time reader and a copy is not the place to migrate a row.
 *
 * ⚠️ **`controllerIds` is omitted rather than written as `[]`**, matching `addToken` — a
 * duplicate is `addToken`'s decision made a second time, and both spellings read
 * identically through `grantedControllersOf`. (`setTokenControllers` writes `[]`, and that
 * is right for *it*: an edit that clears a list should leave the shape it always leaves.)
 *
 * **Grants are dropped, and that is the decision rather than a simplification.** A grant
 * is a decision about a person and a coin; an unattached copy is the DM's, which is the
 * correction the first real session forced on `requireMovableToken` reached by a new
 * route.
 */
export async function copyTokenRow(
  ctx: MutationCtx,
  source: Doc<'tokens'>,
  name: string,
  characterId: Id<'characters'> | undefined,
): Promise<Id<'tokens'>> {
  return await ctx.db.insert('tokens', {
    gameId: source.gameId,
    name,
    layer: source.layer,
    sizeSquares: source.sizeSquares,
    tint: source.tint,
    ...(source.imageId === undefined ? {} : { imageId: source.imageId }),
    ...(characterId === undefined ? {} : { characterId }),
  })
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

/**
 * Is this blob the art of some **other** token in the same game? So the two delete
 * paths can stop short of reclaiming a picture a twin is still drawing.
 *
 * ⚠️ **A sibling of `tokenReferencesImage` above and deliberately not a parameter on
 * it**, because the two answer different callers' questions and the difference is
 * exactly one row. `files.discard` asks *is anything using this?* and needs `true` for
 * the token being examined — that is what makes it refuse to strip the art off a coin
 * somebody is looking at. A delete path asks *is anything **else** using this?* and
 * needs `false` for the row it is about to remove or repoint. Collapsing them into one
 * function with an optional `exclude` gives the discard guard an argument no caller
 * ever wants to pass, and which a future caller can get wrong in the one direction that
 * blanks a live coin.
 *
 * **The exclusion is what makes each call site correct, not the ordering.** Two of the
 * three sites could be made to work by running the check before the row write and
 * leaning on read-your-writes; a correctness property held by the order of two adjacent
 * lines is precisely the fragility `replaceTokenArt`'s early return already documents
 * having nearly shipped. The `_id` comparison holds whichever side of the write it runs.
 *
 * Takes the row rather than a `(gameId, tokenId)` pair, so the game comes off the
 * document and there is no way to ask the question about the wrong one. `imageId` stays
 * a separate argument because `replaceTokenArt` asks about the **previous** blob, which
 * is no longer the one the row will hold.
 *
 * Counts both layers, for `tokenReferencesImage`'s reason verbatim: a DM-layer
 * skeleton's portrait is exactly as much in use as a hero's.
 */
export async function otherTokenReferencesImage(
  ctx: QueryCtx,
  token: Doc<'tokens'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', token.gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.some((other) => other._id !== token._id && other.imageId === imageId)
}
