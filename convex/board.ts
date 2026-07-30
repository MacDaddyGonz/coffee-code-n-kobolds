import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  countTokensInGame,
  deleteTokenPlacements,
  placeToken,
  publicPositionValidator,
  publicTokenValidator,
  publicTokens,
  requireMovableToken,
  tokenLayerValidator,
  visiblePositions,
} from './lib/board'
import { getCharacterInGame } from './lib/characters'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import { MAX_TOKENS_PER_GAME, findGameByCode, requireDm, resolveDmAccess } from './lib/games'
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

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    return await publicTokens(ctx, game._id, isDm)
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
    requireFinite(args)

    // The size of the art, read out of storage rather than taken as an argument,
    // because the byte count is the one fact about an upload the client cannot be
    // trusted to report — it is the client being checked. `scenes.create` does
    // exactly this for a map; token art had only the browser's word for it, which
    // makes CLAUDE.md invariant 6 a client-side promise for half the uploads in the
    // app. A token is downscaled to 256 px on its long edge, so anything over
    // MAX_TOKEN_BYTES means the downscaler was bypassed or broke.
    //
    // The refused blob survives, exactly as it does in `scenes.create`, and for the
    // same unavoidable reason: a mutation is one transaction, so a
    // `ctx.storage.delete` on the way out of a throwing handler is rolled back with
    // everything else. Cleaning up is `files.discard`'s job because it is the call
    // that commits — see ADR 0004.
    if (args.imageId !== undefined) {
      const blob = await ctx.db.system.get('_storage', args.imageId)
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
      sizeSquares: args.sizeSquares,
      imageId: args.imageId,
      tint: args.tint,
      characterId: args.characterId,
    })
    // Snapped on the way in, so a token is on a square from the moment it exists
    // rather than from its first drag.
    await placeToken(
      ctx,
      scene._id,
      tokenId,
      snapToGrid({ x: args.x, y: args.y }, scene, args.sizeSquares),
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
 * DM-gated: this destroys durable data, and it is the only thing on the board
 * that does.
 */
export const removeToken = mutation({
  args: { code: v.string(), dmCode: v.string(), tokenId: v.id('tokens') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    // The literal `true` is discharged by the `requireDm` on the line above, which
    // threw unless this caller holds the DM code — it is not a locally computed
    // `isDm` of the kind CLAUDE.md invariant 7 forbids. It is only true while those
    // two lines stay in that order.
    const token = await requireMovableToken(ctx, game, args.tokenId, true)

    // Placements first, across every scene rather than the current one. They are
    // what points at the token, so removing them first means no order of
    // failures can leave a scene holding a position for a document that has gone.
    await deleteTokenPlacements(ctx, token._id)
    // The blob goes too, or a table's worth of deleted NPCs quietly keeps its
    // share of the 1 GB the free tier allows (CLAUDE.md invariant 6).
    //
    // Unconditional because in Milestone 2 an upload makes exactly one token, so
    // this `imageId` has no other owner. Milestone 7's token library breaks that
    // assumption — reusing one piece of art across several tokens is the point of
    // it — and then deleting one goblin would strip the art from its twin. Whatever
    // makes art shareable has to make this conditional at the same time:
    // reference-count the id, or leave the blob for a sweep.
    if (token.imageId) await ctx.storage.delete(token.imageId)
    await ctx.db.delete('tokens', token._id)
    return null
  },
})
