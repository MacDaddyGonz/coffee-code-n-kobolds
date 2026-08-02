import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  countTokensInGame,
  deleteTokenPlacements,
  freeCellNear,
  placeToken,
  publicPositionValidator,
  publicTokenValidator,
  publicTokens,
  replaceTokenArt,
  requireDmToken,
  requireMovableToken,
  setTokenAppearance,
  setTokenCharacter,
  setTokenControllers,
  setTokenLayer,
  visiblePositions,
} from './lib/board'
import { getCharacterInGame } from './lib/characters'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import {
  MAX_SEATS_PER_GAME,
  MAX_TOKENS_PER_GAME,
  activeSceneId,
  findGameByCode,
  requireDm,
  resolveDmAccess,
} from './lib/games'
// The NARROW three-member union, which is the only one anything outside `convex/schema.ts`
// uses. `addToken` and `setLayer` validate against it, so no `dm` row can be created from
// this deploy forward however many are still stored.
import { tokenLayerValidator } from './lib/layers'
import { getSeatInGame, listSeats } from './lib/players'
import type { Point } from './lib/grid'
import { isUsableTokenSize, snapToGrid } from './lib/grid'
import { MAX_TOKEN_BYTES } from './lib/limits'
import { requireText } from './lib/names'
import { findSceneInGame, getSceneInGame } from './lib/scenes'

// Not one row of the `tokens` or `tokenPositions` tables is read in this file.
// Every read goes through lib/board.ts, because a DM-layer token is the same
// shape as a player-layer one and so no `returns:` validator can catch a leaked
// row — only a single reader that knows whether the caller holds the DM code can
// (CLAUDE.md invariant 8). A test greps these sources to keep it that way.

/**
 * `#rrggbb`, and nothing else.
 *
 * The tint is handed straight to a Konva fill, so the strictness is worth having:
 * a CSS colour function or a `url(...)` would be a string the browser interprets
 * on every other player's screen, put there by whoever runs the game.
 */
const TINT_PATTERN = /^#[0-9a-f]{6}$/i

/**
 * A token whose position is NaN or Infinity has left the board for good — no cell
 * contains it, and every snap after it stays NaN, so it cannot be dragged back.
 * The value arrives from a division by a grid size of zero rather than from
 * anything anyone typed, which is exactly the sort of bug that survives testing:
 * convex-test does not apply Convex's own value validation, so it commits happily
 * in the suite and only misbehaves against a real deployment.
 */
function requireFinite(point: Point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new ConvexError({ kind: 'BadInput', message: 'That is not a position on this map.' })
  }
}

/**
 * The three cosmetic fields of a token, checked once and handed back normalised.
 *
 * Hoisted out of `addToken` when `updateToken` arrived, and the reason is
 * `TOKEN_NOT_FOUND`'s reason applied to refusals rather than to a message: a second copy
 * of these three checks would be identical the day it was written and would then drift,
 * until the sizes a DM may *create* and the sizes they may *change to* had quietly
 * stopped being the same set. One constant, not two copies that agreed once.
 *
 * The order is `addToken`'s unchanged — name, then size, then tint — so a caller sending
 * two bad fields is still told about the same one of them.
 *
 * It returns all three rather than only the name it had to normalise, so the writer is
 * handed the object that was checked instead of reaching back into the raw arguments. A
 * validated name beside an unvalidated size is the shape of the bug this exists to
 * remove.
 */
function requireTokenAppearance(args: { name: string; sizeSquares: number; tint: string }): {
  name: string
  sizeSquares: number
  tint: string
} {
  // A token names a creature, so it borrows the character-name limit rather
  // than inventing a fourth one for the client to have to know about.
  const name = requireText(args.name, {
    max: MAX_CHARACTER_NAME_LENGTH,
    blank: 'Give the token a name.',
    tooLong: `Keep the token name to ${MAX_CHARACTER_NAME_LENGTH} characters or fewer.`,
  })

  if (!isUsableTokenSize(args.sizeSquares)) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'A token must be a whole number of squares across, from 1 to 8.',
    })
  }
  if (!TINT_PATTERN.test(args.tint)) {
    throw new ConvexError({ kind: 'BadInput', message: 'Pick a colour for the token.' })
  }

  return { name, sizeSquares: args.sizeSquares, tint: args.tint }
}

/**
 * A blob is real, and small enough to be token art. The other half of the hoist above.
 *
 * The size of the art is read out of storage rather than taken as an argument, because
 * the byte count is the one fact about an upload the client cannot be trusted to report —
 * it is the client being checked. `scenes.create` does exactly this for a map; token art
 * had only the browser's word for it, which makes CLAUDE.md invariant 6 a client-side
 * promise for half the uploads in the app. A token is downscaled to 256 px on its long
 * edge, so anything over MAX_TOKEN_BYTES means the downscaler was bypassed or broke.
 *
 * The refused blob survives, exactly as it does in `scenes.create`, and for the same
 * unavoidable reason: a mutation is one transaction, so a `ctx.storage.delete` on the way
 * out of a throwing handler is rolled back with everything else. Cleaning up is
 * `files.discard`'s job because it is the call that commits — see ADR 0004.
 */
async function requireTokenArt(ctx: MutationCtx, imageId: Id<'_storage'>): Promise<void> {
  const blob = await ctx.db.system.get('_storage', imageId)
  if (!blob) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'That upload is no longer in storage. Try adding the token again.',
    })
  }
  if (blob.size > MAX_TOKEN_BYTES) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `Token art has to be under ${MAX_TOKEN_BYTES / 1024} KB once downscaled. That one is bigger.`,
    })
  }
}

/**
 * The stable half of the board: names, art, sizes and layers.
 *
 * Split from `positions` below rather than returned together, for the reason
 * behind CLAUDE.md invariant 2. Positions are written around ten times a second
 * during a drag; if the two shared a subscription, every frame of one player
 * nudging a token would re-push every name and every signed art URL to every
 * client. Two queries means a drag invalidates only the cheap one.
 *
 * Serves both audiences from one function, so the gate is `resolveDmAccess` — the
 * answering form — rather than `requireDm`. `dmCode` is optional because a
 * player's client has none to send, and its absence is an ordinary player, not an
 * error.
 *
 * It also carries who may move each token, which is why the roster is read here. That
 * makes this query re-execute on a join, a rename, a claim or a release: correct for a
 * claim, because a claim *is* control and the answer genuinely moved, and merely cheap
 * for the rest. `positions` below deliberately does not do this — see the warning on
 * `visiblePositions`.
 */
export const tokens = query({
  args: { code: v.string(), dmCode: v.optional(v.string()) },
  returns: v.array(publicTokenValidator),
  handler: async (ctx, args) => {
    // Found first, and separately from the DM check, because an unknown code has
    // to render as an empty board rather than throw — a query paints a screen.
    // `resolveDmAccess` insists on a game existing, so it goes second; it costs a
    // second read of the same document through the same index and buys the one
    // authorisation primitive the app has rather than a re-implementation of it.
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    // Concurrent: whether this caller holds the DM code and who is sitting at the
    // table are independent questions, and this query re-runs whenever either the
    // roster or the token list changes. The same arrangement `characters.list` has.
    const [{ isDm }, seats] = await Promise.all([
      resolveDmAccess(ctx, args.code, args.dmCode),
      listSeats(ctx, game._id),
    ])
    // ⚠️ **No fog here, and the absence is load-bearing.** This query resolves a signed
    // storage URL per token, so putting the fog question in it would make every drag frame
    // re-resolve two hundred of them — see the note on `visibleTokens`. A fogged creature
    // loses its placement, its health band and its feed lines; its coin's *name* stays in
    // this payload, and the GM layer is the tool for hiding that.
    return await publicTokens(ctx, game._id, isDm, seats)
  },
})

/**
 * Where those tokens stand on one scene. The high-churn subscription.
 *
 * Filtered by the same reader, because a position row pointing at a DM-layer
 * token is as much of a leak as the token itself: it says something is standing
 * there, which is most of what the DM was hiding.
 *
 * Empty rather than thrown for every kind of unknown, like `tokens` above and for
 * a sharper reason: the DM deleting the active scene is an ordinary thing to do
 * mid-session, and it leaves every client subscribed here with a sceneId that no
 * longer resolves. A thrown query would turn that into an error screen in front of
 * the whole table, where an empty board is the correct picture of what happened. So
 * this uses the *finding* forms — `findGameByCode` and `findSceneInGame` — while
 * the mutations below keep the demanding ones. A mutation has nothing to render, so
 * a bad scene there should still fail loudly rather than write somewhere else.
 */
export const positions = query({
  args: { code: v.string(), sceneId: v.id('scenes'), dmCode: v.optional(v.string()) },
  returns: v.array(publicPositionValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    // Checked against the game rather than trusted, so a scene id from another
    // game cannot be used to read that game's layout with this game's code. An
    // empty answer for a foreign scene leaks nothing — it is the absence of one.
    const scene = await findSceneInGame(ctx, game._id, args.sceneId)
    if (!scene) return []

    // ⚠️ **A non-DM may only ask about the board in front of them**, and this closes a hole
    // the two scene scopes would otherwise open. Fog is per scene, but the *character*
    // crossing fogs against `activeSceneId` because that is the only board a player can be
    // looking at. Without this line a player could name some other scene and receive
    // placements filtered by that scene's rectangles instead — publishing the coordinates of
    // exactly what the DM had blacked out, from a map the party has not reached.
    //
    // Empty rather than thrown, in this query's own register: everything unknown here paints
    // an empty board rather than an error screen. It costs nothing in practice — `useBoard`
    // only ever passes the active scene, and `scenes.list` is DM-only so a player has no
    // route to another scene's id anyway.
    if (!isDm && scene._id !== activeSceneId(game)) return []

    return await visiblePositions(ctx, game._id, scene._id, isDm)
  },
})

/**
 * DM-gated because putting a creature on the board is the DM's job, and because
 * the `layer` argument decides what the other players are allowed to know exists.
 *
 * Every check below is the real one, and the matching checks in the browser are a
 * courtesy that saves an upload rather than the enforcement — the same stance
 * `scenes.create` takes, including the size of the blob.
 *
 * Two of those checks live above rather than here — `requireTokenAppearance` and
 * `requireTokenArt` — shared with the edit mutations further down, so that the names,
 * sizes, tints and blobs a DM may *create* stay the same set as the ones they may
 * *change to*.
 */
export const addToken = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    name: v.string(),
    layer: tokenLayerValidator,
    sizeSquares: v.number(),
    tint: v.string(),
    imageId: v.optional(v.id('_storage')),
    characterId: v.optional(v.id('characters')),
    x: v.number(),
    y: v.number(),
  },
  returns: v.object({ tokenId: v.id('tokens') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    const { name, sizeSquares, tint } = requireTokenAppearance(args)
    requireFinite(args)

    if (args.imageId !== undefined) await requireTokenArt(ctx, args.imageId)

    // An id from another game would put someone else's character on this board.
    if (args.characterId !== undefined) {
      await getCharacterInGame(ctx, game._id, args.characterId)
    }

    // The token list is read with a bound, so the write needs the matching one. A
    // token past the read window would exist, hold its art in storage and count
    // against nothing, while never appearing on anybody's board. Counted across
    // both layers, as the DM sees them: a limit that only counted the visible half
    // would let the DM layer push player tokens off the end of that window.
    if ((await countTokensInGame(ctx, game._id)) >= MAX_TOKENS_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_TOKENS_PER_GAME} tokens.`,
      })
    }
    // And that is the only cap needed here. There is deliberately no second check
    // against MAX_PLACEMENTS_PER_SCENE: a token holds at most one placement per
    // scene, so the cap above already bounds one scene's placements structurally.
    // See the note on the constant in lib/games.ts.

    const tokenId = await ctx.db.insert('tokens', {
      gameId: game._id,
      name,
      layer: args.layer,
      sizeSquares,
      imageId: args.imageId,
      tint,
      characterId: args.characterId,
    })
    // On a square from the moment it exists rather than from its first drag — and on
    // an *empty* one. Every token is added at the same default point, so snapping
    // alone dropped each new one into the square the last one is already in.
    await placeToken(
      ctx,
      scene._id,
      tokenId,
      await freeCellNear(ctx, scene._id, scene, args.sizeSquares, { x: args.x, y: args.y }),
    )
    return { tokenId }
  },
})

/**
 * The whole write path of dragging something around, and the only one: the mouse
 * throttles calls to this at roughly ten a second and the arrow keys send a
 * single one, so both input methods commit through the same check and the same
 * snap.
 *
 * `settle` is the difference between the two kinds of call, and it exists so the
 * server owns the snap rather than trusting the client's. A moving drag is stored
 * exactly as given — floats, deliberately, so the motion arrives on the other
 * screens as motion instead of a token hopping cell to cell — and the settling
 * write is snapped here. That is what makes "a dropped token never rests between
 * squares" true even for a client whose arithmetic is wrong, or which skipped its
 * own snap altogether; if the flag merely reported that the client had already
 * snapped, the guarantee would be the client's to keep.
 *
 * Ungated beyond `resolveDmAccess`, because a player has to be able to move their
 * own character. `requireMovableToken` decides what "their own" means, and refuses
 * a DM-layer token with the same error it gives for one that does not exist.
 */
export const moveToken = mutation({
  args: {
    code: v.string(),
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
    x: v.number(),
    y: v.number(),
    settle: v.boolean(),
    dmCode: v.optional(v.string()),
    playerId: v.optional(v.id('players')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Before any read. This is the write the app makes ten times a second, so a
    // call that is going to be refused on its arguments alone should cost no I/O to
    // refuse — and the coordinates are checkable without knowing anything about the
    // game, the scene or the token.
    requireFinite(args)

    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    const token = await requireMovableToken(ctx, game, args.tokenId, isDm, args.playerId)

    const point = args.settle
      ? snapToGrid({ x: args.x, y: args.y }, scene, token.sizeSquares)
      : { x: args.x, y: args.y }
    // Creates the row if this token was not on this scene yet, which is how a
    // token from another board joins this one: the row's existence is the
    // placement.
    await placeToken(ctx, scene._id, token._id, point)
    return null
  },
})

/**
 * Rename, resize or re-tint a token. **Cosmetics, and nothing else** — the DM's Tokens
 * tab reaches the other three facts about a coin through the three mutations below.
 *
 * ⚠️ **The split is the whole design here, so it is worth saying what one `updateToken`
 * would have cost.** An absolute multi-field write is exactly right for cosmetics, for
 * `scenes.updateGrid`'s reason: a name, a size and a colour are one appearance, edited in
 * one form, and committing them separately would show the table a coin nobody chose in
 * between. It is the wrong shape for `layer` and `characterId`, because those two decide
 * what the other players are allowed to know. Folded in, every rename would carry a layer
 * value, and a client sending a stale one would reveal an ambush as a side effect of
 * fixing a typo. Two secrecy fields, two mutations that are only ever called on purpose.
 *
 * All three arguments are required and absolute, like the grid's. There is no `imageId`
 * among them either: art is `setArt` below, because changing it destroys a blob.
 *
 * No `requireFinite` on the size, and the absence is deliberate rather than an oversight
 * — `isUsableTokenSize` tests `Number.isInteger`, which is already `false` for `NaN` and
 * for `Infinity`, so a second check could not fire. And no `MAX_TOKENS_PER_GAME` check,
 * because this creates nothing: the cap belongs on the mutation that adds a row.
 */
export const updateToken = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
    name: v.string(),
    sizeSquares: v.number(),
    tint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    const appearance = requireTokenAppearance(args)

    await setTokenAppearance(ctx, token, appearance)
    return null
  },
})

/**
 * Move a token between the player layer and the DM's. ⚠️ **A secrecy write** — the one
 * the whole choke point in `lib/board.ts` exists to make decidable in one place.
 *
 * What it does to every player's payload is written out in full at `setTokenLayer`, and
 * it is more than the coin: the placements go too, and so does the bound creature's sheet
 * and its exact hit points for any seat holding a grant on it. Read that before changing
 * anything here.
 *
 * `layer` is the only argument, and there is nothing else to check — which is the point
 * rather than an omission. `tokenLayerValidator` is the same union the schema stores and
 * the same one `addToken` validates against, so a third member cannot appear in one of
 * them and not the other, and there is no range or pattern for a handler to re-test.
 */
export const setLayer = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
    layer: tokenLayerValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    await setTokenLayer(ctx, token, args.layer)
    return null
  },
})

/**
 * Bind a token to a character, or unbind it. ⚠️ **The other secrecy write, and the
 * sharper of the two**, because `setLayer` above hides and reveals a coin the DM chose to
 * hide, while this one can hand a creature's stat block to a player as a side effect of
 * moving a pointer.
 *
 * The three consequences are written out at `setTokenCharacter`, and the first of them is
 * the one to have in mind here: **rebinding a granted token onto a monster publishes that
 * monster's sheet and its exact hit points to the granted seats in the same write, with
 * no second confirmation anywhere.** The other two are quieter — rebinding away from a
 * claimed hero withdraws that seat's derived control with nothing written to the token,
 * and unbinding entirely leaves the token the DM's alone.
 *
 * `characterId: null` unbinds, as a **required** argument rather than an optional one.
 * `characters.assign` set that precedent and it is the right one: an optional argument
 * has two spellings for none — absent and null — and every reader then has to agree about
 * which of them means *leave it alone* and which means *clear it*. A required union
 * designs the question out instead of documenting it.
 *
 * ⚠️ **The check on a non-null id is `getCharacterInGame` — the same line `addToken`
 * runs — and deliberately neither `requireVisibleCharacter` nor `isReservedCharacter`.**
 * That looks like a gap beside `claim` and `assign`, which both hard-code `isDm` to
 * `false` so that holding the DM code cannot make a monster a playable hero, so it is
 * worth being exact about why it is not one. Those two are about **playability**: they
 * decide what a *seat* may pick up. This decides what a *coin* stands for, and binding a
 * coin to a creature is the ordinary case — it is most of what the DM's board is. Binding
 * one to a hero reserved for a player who has not arrived yet is ordinary too: the DM is
 * setting the board up ahead of them, and the reservation withholds the sheet from the
 * players rather than the token from the DM. `addToken` has taken exactly this stance
 * since Milestone 2, and the two have to keep agreeing — a coin the DM can create bound to
 * a creature but not rebind onto one would be a rule nobody could state.
 *
 * All the game membership check buys is the thing it is for: an id from another game would
 * put someone else's character on this board.
 */
export const setCharacter = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
    characterId: v.union(v.id('characters'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    if (args.characterId !== null) {
      await getCharacterInGame(ctx, game._id, args.characterId)
    }

    await setTokenCharacter(ctx, token, args.characterId)
    return null
  },
})

/**
 * Point a token at a new piece of art, or clear it. The only token write that destroys
 * something outside the row it patches.
 *
 * `imageId: null` clears the art, required rather than optional for the reason
 * `setCharacter` above gives.
 *
 * **Three things about the blobs, because this is where they all meet.**
 *
 * (a) A *refused* blob survives. One mutation is one transaction, so the
 * `ctx.storage.delete` that would tidy up after a throw is rolled back with the throw
 * itself — a rejecting mutation cannot clean up after itself however carefully it is
 * written. The client's catch calls `files.discard`, exactly as `addToken`'s does, and
 * that is the call that commits because it is the call that succeeds (ADR 0004).
 *
 * (b) `files.discard` cannot be the way the *old* art is removed, which is the mirror
 * image of (a) and easy to get backwards. It refuses any blob a token still points at,
 * through `tokenReferencesImage` — so the only transaction permitted to delete the
 * outgoing blob is the one that stops referencing it. That is why the delete lives inside
 * `replaceTokenArt` rather than in a second call after this one, and why a client
 * sequencing it the other way round would simply be told the image is in use.
 *
 * (c) That delete is the **third** unconditional `ctx.storage.delete` in the codebase,
 * beside `board.removeToken` and `deleteTokensInGame`. All three carry the same caveat and
 * all three now name each other: an upload makes exactly one token today, and whatever
 * makes art shareable between tokens has to make all three conditional in one go.
 *
 * ⚠️ **`returns: v.null()`, deliberately not the new `artUrl`.** Handing one back would
 * be convenient — the client has just changed the picture and wants to draw it — and it
 * would be a second place a signed URL is minted, outside the one that filters. Signed
 * storage URLs are unguessable but not permission-checked: once minted, the string is a
 * bearer link to that image. `publicTokens` mints them only *after* `maySee` has dropped
 * the rows this caller may not have, which is the ordering ADR 0004 calls load-bearing
 * rather than tidy. A mutation returning one would mint outside that ordering, and the
 * next mutation to want the convenience would have a precedent for doing it on a token
 * whose layer nobody checked. The client redraws from its `board.tokens` subscription,
 * which is where the URL comes from for every other reason.
 */
export const setArt = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
    imageId: v.union(v.id('_storage'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    if (args.imageId !== null) await requireTokenArt(ctx, args.imageId)

    await replaceTokenArt(ctx, token, args.imageId)
    return null
  },
})

/**
 * Hand a token to some seats, or take it back. DM-gated, because deciding who may
 * move what is the DM's job and nobody else's.
 *
 * The list is absolute rather than a pair of add/remove calls: the dialog holds a
 * checkbox per seat and sends the state of all of them, so two DM browsers racing on
 * the same token end with one of the two intentions rather than an interleaving of
 * both. It is also what makes revoking everything expressible — an empty array.
 *
 * ⚠️ **A grant is a second door onto a secret, and it is opened here.** Control
 * carries the creature's sheet and its exact hit points to the granted seat, through
 * `controlledCharacterIds`. That is the intended behaviour — handing a player the
 * party's wolf and not its statistics would be handing them nothing usable — but it is
 * why this mutation is `requireDm` and not `resolveDmAccess`, and why every id below
 * is checked against this game before it is written.
 *
 * Note what a grant on a **DM-layer** token does: nothing. The token is absent from
 * that player's payload, so the sheet does not travel either. Refusing the write would
 * be wrong — preparing an ambush and granting it before revealing it is a reasonable
 * order to work in — so the write succeeds and the DM's panel is where that gets said.
 */
export const setControllers = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
    playerIds: v.array(v.id('players')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)

    // Bounded before the loop below, so a caller cannot buy an unbounded run of reads
    // with one argument. A token cannot be granted to more seats than the game can
    // hold, so MAX_SEATS_PER_GAME is the right ceiling rather than a fresh number —
    // and duplicates are squeezed out by the writer, after this, which is the
    // conservative order.
    if (args.playerIds.length > MAX_SEATS_PER_GAME) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `A token cannot be handed to more than ${MAX_SEATS_PER_GAME} seats.`,
      })
    }

    // Through the same lookup the other five DM-gated token mutations use — the bound
    // form of `requireMovableToken`, which is where the reasoning about what the DM code
    // has already discharged now lives.
    const token = await requireDmToken(ctx, game, args.tokenId)

    // Every id checked against this game before any of it is written. A stray seat from
    // another game would be a grant nothing in this game can render, name or revoke —
    // `players.leave` sweeps by game, so it would never be cleaned up either.
    //
    // Concurrent because none of the lookups depends on another: awaiting them in a loop
    // made the round trips sequential, and the array is already bounded above by
    // MAX_SEATS_PER_GAME. `getSeatInGame` throws on the first bad id either way — a
    // rejected `Promise.all` is still one refusal, and which of several bad ids is named
    // is not a promise this mutation makes.
    await Promise.all(args.playerIds.map((playerId) => getSeatInGame(ctx, game._id, playerId)))

    await setTokenControllers(ctx, token._id, args.playerIds)
    return null
  },
})

/**
 * DM-gated: this destroys durable data, and it is the only thing on the board
 * that does.
 */
export const removeToken = mutation({
  args: { code: v.string(), dmCode: v.string(), tokenId: v.id('tokens') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    // Placements first, across every scene rather than the current one. They are
    // what points at the token, so removing them first means no order of
    // failures can leave a scene holding a position for a document that has gone.
    await deleteTokenPlacements(ctx, token._id)
    // The blob goes too, or a table's worth of deleted NPCs quietly keeps its
    // share of the 1 GB the free tier allows (CLAUDE.md invariant 6).
    //
    // Unconditional because in Milestone 2 an upload makes exactly one token, so
    // this `imageId` has no other owner. The game editor's token library breaks that
    // assumption — reusing one piece of art across several tokens is the point of
    // it — and then deleting one goblin would strip the art from its twin. Whatever
    // makes art shareable has to make this conditional at the same time:
    // reference-count the id, or leave the blob for a sweep.
    //
    // There are **three** of these now, and they name each other so that whatever makes
    // art shareable finds all of them in one pass: this one, `replaceTokenArt` (reached
    // through `setArt` above), and `deleteTokensInGame` in lib/board.ts. A partially
    // converted set of three is the state in which somebody believes the problem is
    // solved.
    if (token.imageId) await ctx.storage.delete(token.imageId)
    await ctx.db.delete('tokens', token._id)
    return null
  },
})
