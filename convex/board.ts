import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import {
  copyTokenRow,
  countTokensInGame,
  deleteTokenPlacements,
  freeCellNear,
  freeCellsNear,
  nextTokenNames,
  otherTokenReferencesImage,
  placeToken,
  placementOf,
  publicPositionValidator,
  publicTokenValidator,
  publicTokens,
  removeTokenFromScene,
  replaceTokenArt,
  requireDmToken,
  requireMovableToken,
  setTokenAppearance,
  setTokenCharacter,
  setTokenControllers,
  setTokenLayer,
  tokenPlacementScenes,
  visiblePositions,
} from './lib/board'
import { copyCharacter, countCharactersInGame, getCharacterInGame } from './lib/characters'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import {
  MAX_CHARACTERS_PER_GAME,
  MAX_SEATS_PER_GAME,
  MAX_TOKENS_PER_GAME,
  activeSceneId,
  findGameByCode,
  requireDm,
  resolveDmAccess,
  stampReveal,
} from './lib/games'
// The NARROW three-member union, which is the only one anything outside `convex/schema.ts`
// uses. `addToken` and `setLayer` validate against it, so no `dm` row can be created from
// this deploy forward however many are still stored. `layerOf` is the transition-only
// reader beside it: a *stored* layer may still be the legacy `dm`, so every comparison
// against `'gm'` in this file goes through it rather than against the raw field.
import { layerOf, tokenLayerValidator } from './lib/layers'
import { getSeatInGame, listSeats } from './lib/players'
import type { Point } from './lib/grid'
import { isUsableTokenSize, snapToGrid } from './lib/grid'
import { MAX_DUPLICATE_COUNT, MAX_TOKEN_BYTES } from './lib/limits'
import { duplicateNamesProblem, requireText } from './lib/names'
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
 *
 * ⚠️ **`count` is optional and absent means one, which is what keeps every existing
 * caller unchanged** — and it is here rather than only on `duplicateToken` because *add
 * five of these* and *duplicate this five times* are the same act with a different source
 * of the fields. Adding five `Goblin`s to a board with none gets `Goblin 1 … Goblin 5`;
 * duplicating a `Goblin` already standing there gets `Goblin 2 …`, because the source is
 * never renamed. Both come out of `duplicateNames` in lib/names.ts, so the dialog's live
 * preview and this write are one function.
 *
 * Note what the count does **not** change: one `imageId`, so the five copies share a blob
 * — which is exactly the state `otherTokenReferencesImage` exists for — and one
 * `characterId` when the DM attached an existing creature, because attaching a *named*
 * character to five coins is the DM asking for five coins of that creature rather than
 * five creatures. `duplicateToken` is where a copy gets a sheet of its own; here the DM
 * either picked one creature or picked none.
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
    count: v.optional(v.number()),
  },
  returns: v.object({ tokenId: v.id('tokens'), tokenIds: v.array(v.id('tokens')) }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const count = args.count ?? 1
    requireCount(count)

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
    //
    // No character cap is asked, and the asymmetry with `duplicateToken` is the point:
    // this mutation writes no sheets. The DM either attached a creature that already
    // exists or attached none.
    await requireRoomFor(ctx, game._id, count, false)
    // And that is the only cap needed here. There is deliberately no second check
    // against MAX_PLACEMENTS_PER_SCENE: a token holds at most one placement per
    // scene, so the cap above already bounds one scene's placements structurally.
    // See the note on the constant in lib/games.ts.

    // The DM typed one name and asked for `count` coins, so the numbering is the same
    // rule a duplicate uses — reading the board, not the argument. At a count of one on
    // a board with no `Goblin`, this is the name they typed, unchanged.
    const names = await requireBatchNames(ctx, game._id, name, count)
    const cells = await freeCellsNear(ctx, scene._id, scene, sizeSquares, { x: args.x, y: args.y }, count)

    const tokenIds: Id<'tokens'>[] = []
    for (let index = 0; index < count; index += 1) {
      const tokenId = await ctx.db.insert('tokens', {
        gameId: game._id,
        name: names[index],
        layer: args.layer,
        sizeSquares,
        imageId: args.imageId,
        tint,
        characterId: args.characterId,
      })
      // On a square from the moment it exists rather than from its first drag — and on
      // an *empty* one. Every token is added at the same default point, so snapping
      // alone dropped each new one into the square the last one is already in.
      await placeToken(ctx, scene._id, tokenId, cells[index])
      tokenIds.push(tokenId)
    }
    // A coin created straight onto the player layer with a creature already on it is a
    // reveal like any other — the DM's usual way of putting a monster the party has been
    // fighting elsewhere onto this board — and that creature's earlier lines become
    // audible in this write. Both conditions are needed: an empty coin names nobody, and a
    // GM-layer one is exactly the encounter being prepared rather than sprung.
    if (args.layer === 'player' && args.characterId !== undefined) {
      await stampReveal(ctx, game._id)
    }
    // `tokenId` is the first of them, kept so every existing caller and test reads the
    // same field it always did. `tokenIds` is the whole batch, for a client that asked
    // for more than one.
    return { tokenId: tokenIds[0], tokenIds }
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

    // ⚠️ **A stamp, and only in the widening direction.** Everything this write publishes
    // was rolled while the coin was hidden, so the lines arrive at the table as *new* rows
    // minutes after the dice stopped — see `predatesReveal` on `publicFeedValidator`, which
    // is what stops the map replaying all of them at once. Hiding a coin again must not
    // stamp: that suppresses the flourish for rolls nobody has been shown yet.
    //
    // `layerOf` because the stored value may still be the legacy `dm`, and Background is
    // deliberately not a source: it is already public, so nothing widens by leaving it.
    // Coverage here is discipline rather than construction, as that note says at length —
    // a new widening path that skips this line breaks the flourish and nothing else, with
    // no type error and nothing failing until somebody writes a case beside it.
    const widening = layerOf(token.layer) === 'gm' && args.layer === 'player'

    await setTokenLayer(ctx, token, args.layer)
    if (widening) await stampReveal(ctx, game._id)
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
    // The same stamp `setLayer` makes, for the same widening seen from the other side: the
    // coin was already on the board and it is the *character* that has just become audible,
    // so every line that creature rolled elsewhere reaches the table at once. Only on a
    // bind, and only onto a coin the players can see — unbinding narrows, and binding onto
    // a Background or GM-layer coin publishes nothing.
    if (args.characterId !== null && layerOf(token.layer) === 'player') {
      await stampReveal(ctx, game._id)
    }
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
 * How many coins one call may create, argument-checked before any read.
 *
 * Shared by `addToken`'s optional `count` and by `duplicateToken`, so the two ways of
 * asking for five goblins are refused by one rule. Argument-only, so a bad call costs no
 * I/O to refuse — `moveToken`'s ordering, applied to the mutation that writes the most.
 */
function requireCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_DUPLICATE_COUNT) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `Add between 1 and ${MAX_DUPLICATE_COUNT} coins at a time.`,
    })
  }
}

/**
 * Both caps, checked before **anything** is written, with two messages.
 *
 * ⚠️ **Two messages and not one, because "too many coins" and "too many sheets" are two
 * different reasons the DM is stuck and the fix is in two different tabs.** Same `kind`,
 * which both `addToken` and `characters.create` already use for their own single-row
 * versions: a client acts on the message, and inventing a second kind for one category of
 * refusal would be a distinction nothing consumes.
 *
 * `>` on `existing + count` rather than `>=` on `existing`, which is arithmetic the
 * single-row checks never had to do. The character cap is asked only when there are sheets
 * to write, so a game at two hundred sheets can still make more barrels.
 */
async function requireRoomFor(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  count: number,
  sheets: boolean,
): Promise<void> {
  if ((await countTokensInGame(ctx, gameId)) + count > MAX_TOKENS_PER_GAME) {
    throw new ConvexError({
      kind: 'GameFull',
      message: `That would take this game past ${MAX_TOKENS_PER_GAME} tokens. Delete some coins, or add fewer.`,
    })
  }
  if (sheets && (await countCharactersInGame(ctx, gameId)) + count > MAX_CHARACTERS_PER_GAME) {
    throw new ConvexError({
      kind: 'GameFull',
      message: `That would take this game past ${MAX_CHARACTERS_PER_GAME} character sheets. Delete some sheets, or add fewer.`,
    })
  }
}

/**
 * The names for a batch, refused rather than truncated when numbering would overrun.
 *
 * Milestone 1 shipped exactly the bug a truncation causes — a `slice` on a UTF-16
 * boundary leaving a lone surrogate that convex-test stored happily and the cloud
 * refused — and `npm run test:smoke` exists because of it. `duplicateNamesProblem` is the
 * browser-shared half, so the dialog refuses the same batch this does and its message
 * names the fix rather than being a dead end mid-session.
 */
async function requireBatchNames(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  sourceName: string,
  count: number,
): Promise<string[]> {
  const names = await nextTokenNames(ctx, gameId, sourceName, count)
  const problem = duplicateNamesProblem(names)
  if (problem) throw new ConvexError({ kind: 'BadInput', message: problem })
  return names
}

/**
 * Copy a coin, N times, each copy with **its own character document and its own vitals
 * row**.
 *
 * That is the whole feature and it is the thing Roll20 needs a community script for: its
 * own documentation tells a GM that eight identical goblins must have their hit-point bars
 * manually unlinked, or damaging one damages all eight. Five goblins sharing one pool is a
 * bug that looks like a feature until the second one takes damage.
 *
 * ⚠️ **One transaction, and `TokenAddDialog`'s argument for two does not transfer.** There
 * the *client* owns the sequence — create a character, then a token — and a refused token
 * leaves a sheet the Sheets tab deletes in two clicks. Here the server owns both halves,
 * so N coins and N sheets arrive together or not at all. Twelve half-created goblins is
 * not a state anybody should have to clean up.
 *
 * **The copies land on the board named in the arguments, and only that one.** A coin that
 * appeared on all five of the source's maps at once is a surprise; `placeOnScene` is the
 * deliberate way to reach the other four.
 *
 * **The character takes the coin's name**, which is `TokenAddDialog`'s own rule — a coin
 * reading `Goblin 4` over a sheet called something else is a confusion nobody asked for —
 * and here there is nobody typing a different one.
 *
 * ⚠️ **The reveal stamp mirrors `addToken`'s condition exactly**, with one spelling
 * difference that is required rather than stylistic: `addToken` compares its **narrow**
 * argument validator and needs no `layerOf`, while this reads a **stored** layer that may
 * still be the legacy `dm`. Both clauses are needed for `addToken`'s reasons verbatim: an
 * empty coin names nobody, and a GM-layer one is the encounter being prepared rather than
 * sprung.
 *
 * Worth knowing what that stamp can and cannot do here: the copies' creatures are made in
 * this transaction and have rolled nothing, so no feed row becomes audible through this
 * write. What it costs is the flourish on rolls made in the last few minutes. That is the
 * trade `gameRevealedAt` already states — a stamp too many costs one missing animation and
 * a stamp too few replays an evening — and it is the right way round. The day this learns
 * to *reuse* the source's character, the stamp is already correct.
 */
export const duplicateToken = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
    count: v.number(),
  },
  returns: v.object({ tokenIds: v.array(v.id('tokens')), names: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    requireCount(args.count)

    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    const source = await requireDmToken(ctx, game, args.tokenId)
    const sourceCharacter =
      source.characterId === undefined
        ? null
        : await getCharacterInGame(ctx, game._id, source.characterId)

    await requireRoomFor(ctx, game._id, args.count, sourceCharacter !== null)
    const names = await requireBatchNames(ctx, game._id, source.name, args.count)

    // Beside the coin the DM pressed on, or the middle of the map when the source is not
    // standing on *this* board — which is reachable: the Tokens tab can duplicate a coin
    // that stands only on another map.
    const anchor = (await placementOf(ctx, scene._id, source._id)) ?? {
      x: scene.imageWidth / 2,
      y: scene.imageHeight / 2,
    }
    const cells = await freeCellsNear(
      ctx,
      scene._id,
      scene,
      source.sizeSquares,
      { x: anchor.x, y: anchor.y },
      args.count,
    )

    const tokenIds: Id<'tokens'>[] = []
    for (let index = 0; index < args.count; index += 1) {
      const characterId = sourceCharacter
        ? await copyCharacter(ctx, game._id, names[index], sourceCharacter)
        : undefined
      const tokenId = await copyTokenRow(ctx, source, names[index], characterId)
      await placeToken(ctx, scene._id, tokenId, cells[index])
      tokenIds.push(tokenId)
    }

    if (layerOf(source.layer) === 'player' && source.characterId !== undefined) {
      await stampReveal(ctx, game._id)
    }

    return { tokenIds, names }
  },
})

/**
 * Put a coin on a board it is not standing on, without taking it off any other.
 *
 * `MapSetupPanel` has told the DM since the board existed that *tokens belong to the
 * game, not to this map, so one villain can stand on several* — **true of the schema and
 * false of the application** until this existed. `addToken` was the only thing that
 * created a placement and `moveToken` is only ever called with the active scene, so a
 * coin made on map A could never reach map B and could never leave A without being
 * destroyed. This is `addToken`'s placement decision made a second time.
 *
 * DM-gated for that reason: deciding which board a creature stands on is the same call
 * as deciding to put it on one at all. A player has no route to another scene's id in
 * any case — `scenes.list` is DM-only, because a list of scene names is a spoiler.
 *
 * ⚠️ **Idempotent, and the value is in not writing.** If the row is already there this
 * returns having touched nothing, so pressing the button twice does not teleport a coin
 * the DM had already dragged into position. Leaning on `placeToken`'s upsert instead
 * would patch the coordinates back to the middle of the map, which is the bug this early
 * return exists to prevent rather than an optimisation of it.
 *
 * **No `x` and no `y`, deliberately.** The DM is choosing a *board*, not a square: they
 * have never looked at this map, so there is no square they picked and no client
 * coordinate worth trusting. The centre is the one point guaranteed to be on the map,
 * and it goes through `freeCellNear` for `addToken`'s reason — every coin sent to a map
 * would otherwise land in the identical square with its name overprinted into mush.
 * Adding coordinates here would make this `moveToken` with a different gate.
 *
 * ⚠️ **Still no `MAX_PLACEMENTS_PER_SCENE` write check, and the structural argument
 * survives this.** A token holds at most one placement per scene — enforced twice here,
 * by the early return and by `placeToken`'s upsert on `by_sceneId_and_tokenId` — so
 * placements on one scene still cannot outnumber the tokens in the game, and that count
 * is already capped. What changed is that the ceiling is now *attainable*: a DM may
 * deliberately put all 200 coins on all 25 boards. See the note on the constant in
 * lib/games.ts.
 */
export const placeOnScene = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    const token = await requireDmToken(ctx, game, args.tokenId)

    if (await placementOf(ctx, scene._id, token._id)) return null

    await placeToken(
      ctx,
      scene._id,
      token._id,
      await freeCellNear(ctx, scene._id, scene, token.sizeSquares, {
        x: scene.imageWidth / 2,
        y: scene.imageHeight / 2,
      }),
    )
    return null
  },
})

/**
 * Take a coin off one board and leave it on every other, and leave the coin itself alone.
 *
 * The other half of `placeOnScene`, and the reversible sibling of `removeToken` below:
 * this destroys a placement, that destroys a creature's whole coin and its picture.
 * Which is why the board's menu confirms one and not the other.
 *
 * ⚠️ **A no-op rather than a throw when the coin is not there**, for `files.discard`'s
 * reason: the client calls this from a menu and a panel that may each be a frame stale,
 * and a second removal should be nothing rather than a second error on top of the first.
 *
 * Deliberately **no** refusal for removing the last one. A coin on no board at all is a
 * legitimate state — it is what the schema means by "tokens belong to the game, not to
 * this map" — and it is the state the Tokens tab exists to be able to reach. The client
 * renders the intersection of the two board subscriptions, so such a coin is simply not
 * drawn; it keeps its row, its sheet and its grants, and one press puts it back.
 */
export const removeFromScene = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    const token = await requireDmToken(ctx, game, args.tokenId)

    await removeTokenFromScene(ctx, scene._id, token._id)
    return null
  },
})

/**
 * Which boards this one coin stands on. Ids, which the client joins against the
 * `scenes.list` it is already holding.
 *
 * ⚠️ **Per token, and that is its whole cost model.** It reads by `by_tokenId`, so it is
 * invalidated by writes to *one* coin's placements rather than by every drag on the
 * board, and the panel that holds it is mounted only while the Tokens tab has a coin
 * selected. The obvious alternative — one game-wide map of coin → boards, so every row
 * in the list could carry a badge — puts every placement on every scene into the read
 * set of a panel that is open all session, which is exactly the read CLAUDE.md
 * invariant 2's read-side rule exists to refuse. `TokensTab`'s own ⚠️ says the list
 * cannot answer this; that comment is narrowed rather than deleted, because the *list*
 * still cannot and the *selected coin* now can.
 *
 * ⚠️ **Ids and not names, even though a name is what the panel prints.** Scene names are
 * DM-only — `scenes.list` requires the code because a list of them is a spoiler — and a
 * projection carrying them here would be a second door onto that list. It costs nothing:
 * the panel needs the maps the coin is **not** on as well, to offer *Put it here*, so it
 * is holding `scenes.list` regardless.
 *
 * `requireDm` and then `requireDmToken`, so a foreign or vanished token refuses with the
 * same `TokenNotFound` every other board function gives rather than answering with an
 * empty array — the parity ADR 0004 argues for, applied to a query whose empty answer
 * would otherwise be indistinguishable from *this coin is on no board*.
 */
export const placements = query({
  args: {
    code: v.string(),
    dmCode: v.string(),
    tokenId: v.id('tokens'),
  },
  returns: v.array(v.id('scenes')),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const token = await requireDmToken(ctx, game, args.tokenId)

    return await tokenPlacementScenes(ctx, token._id)
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
    // ⚠️ **Conditional now, and duplication is what made it have to be.** This was
    // unconditional while an upload made exactly one token and no route existed to
    // point a second one at the same picture. `board.duplicate` copies the image id,
    // so deleting one of five goblins would have stripped the art from the other four
    // and `Goblin 2` would have become a purple disc mid-fight.
    //
    // The predicate is `otherTokenReferencesImage` and not `tokenReferencesImage`:
    // this row is about to go, so it must not count itself as an owner. That is the
    // whole difference between the two, and it is why they are siblings rather than
    // one function with a flag — `files.discard` needs the answer that *includes* the
    // row it is asking about.
    //
    // There were **three** of these, they named each other so that whatever made art
    // shareable would find all of them in one pass, and it did. All three are converted
    // in the commit that first allowed a twin to exist — but not identically, which is
    // the part worth carrying forward: this one and `replaceTokenArt` ask the predicate,
    // and `deleteTokensInGame` deduplicates instead, because there the answer is *no*
    // by construction and asking would be forty thousand reads in one transaction. Its
    // own note carries that argument.
    if (token.imageId && !(await otherTokenReferencesImage(ctx, token, token.imageId))) {
      await ctx.storage.delete(token.imageId)
    }
    await ctx.db.delete('tokens', token._id)
    return null
  },
})
