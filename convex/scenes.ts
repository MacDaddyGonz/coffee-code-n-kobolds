import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { deleteScenePlacements } from './lib/board'
import { MAX_SCENES_PER_GAME, findGameByCode, requireDm } from './lib/games'
import { MIN_GRID_SIZE, gridSizeFor, isUsableGrid } from './lib/grid'
import { requireSceneName } from './lib/names'
import {
  DEFAULT_SQUARES_ACROSS,
  MAX_SCENE_BYTES,
  getSceneInGame,
  listScenes,
  publicScene,
  publicSceneValidator,
} from './lib/scenes'

/**
 * The board everyone is looking at, and the only scene a player's client can ask
 * for. Open, because the background image is the one part of the map that is not
 * a secret from anybody.
 *
 * Returns null rather than throwing for an unknown code or a game with no map
 * yet: this query renders a screen, and "nothing here yet" is a legitimate state
 * a lobby sits in for as long as it takes the DM to upload something.
 */
export const active = query({
  args: { code: v.string() },
  returns: v.union(publicSceneValidator, v.null()),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game?.activeSceneId) return null

    // `remove` clears the pointer, so a dangling one should not exist — but a
    // board that renders as empty is a far better failure than one that throws
    // in front of the whole table.
    const scene = await ctx.db.get('scenes', game.activeSceneId)
    if (!scene || scene.gameId !== game._id) return null

    return await publicScene(ctx, scene)
  },
})

/**
 * DM only, and it throws rather than returning an empty list.
 *
 * The names alone are the spoiler: `Dragon's Lair` sitting in a scene list tells
 * the players exactly what the next two hours hold, and no amount of not
 * rendering it on the client keeps it out of a payload they can read. Players get
 * `active` — the one board in front of them — which is the whole of what they
 * need to play. Throwing rather than answering emptily is deliberate too: only
 * the DM's own panel calls this, so an empty answer would hide a wrong-code bug
 * behind a plausible-looking "no scenes yet".
 */
export const list = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.array(publicSceneValidator),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scenes = await listScenes(ctx, game._id)
    // Oldest first: Convex appends _creationTime to every index, so the DM's list
    // stays in the order they uploaded rather than reshuffling on each render.
    return await Promise.all(scenes.map((scene) => publicScene(ctx, scene)))
  },
})

/** Finite and positive — which rules out the NaN, the 0 and the negative. */
function isUsableImageSize(pixels: number): boolean {
  return Number.isFinite(pixels) && pixels > 0
}

/**
 * Turn an uploaded blob into a board.
 *
 * The client has already stored the file and holds its id, so this mutation's job
 * is to decide whether that blob is allowed to become a scene — which means every
 * check here is the real one, and the matching checks in the browser are a
 * courtesy that saves an upload rather than the enforcement. CLAUDE.md invariant 6
 * is a promise about what is in storage, and a limit the server never looks at is
 * one a client bug quietly removes.
 *
 * Note what a rejection here cannot do: delete the blob it just refused. A
 * mutation is a transaction, so `ctx.storage.delete` on the way out of a throwing
 * handler is rolled back along with everything else — the file survives every
 * time. Tidying up has to happen in a call that commits, which is what
 * `files.discard` is for; the client's catch calls it. Reaching this at all takes
 * a full game or a bypassed downscaler, so the leak is small, but it is real and
 * it is not fixable from inside this function.
 */
export const create = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    name: v.string(),
    imageId: v.id('_storage'),
    imageWidth: v.number(),
    imageHeight: v.number(),
  },
  returns: v.object({ sceneId: v.id('scenes') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const name = requireSceneName(args.name)

    // The dimensions are the client's word for what it uploaded, and every piece of
    // grid arithmetic divides by them. A NaN or a zero here would hand `Infinity`
    // to the position table on the first drag, and convex-test does not apply
    // Convex's own value validation — so garbage passes the suite locally and only
    // shows up against a real deployment. The same reasoning as `requireText`.
    if (!isUsableImageSize(args.imageWidth) || !isUsableImageSize(args.imageHeight)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That image has no usable width and height.',
      })
    }

    // Read from storage rather than taken as an argument, because the byte count is
    // the one fact about the upload the client cannot be trusted to report — it is
    // the client we are checking.
    const blob = await ctx.db.system.get('_storage', args.imageId)
    if (!blob) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That upload is no longer in storage. Try adding the map again.',
      })
    }
    if (blob.size > MAX_SCENE_BYTES) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `Maps have to be under ${MAX_SCENE_BYTES / (1024 * 1024)} MB once downscaled. That one is bigger.`,
      })
    }

    // The list is read with a bound, so the write needs the matching one: a scene
    // past the read window could be made active and then never be found again by
    // the panel that would let the DM switch off it.
    const existing = await listScenes(ctx, game._id)
    if (existing.length >= MAX_SCENES_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_SCENES_PER_GAME} scenes.`,
      })
    }

    const sceneId = await ctx.db.insert('scenes', {
      gameId: game._id,
      name,
      imageId: args.imageId,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      // Floored at MIN_GRID_SIZE so `isUsableGrid` holds for every stored scene
      // from the moment it exists; only an absurdly narrow image reaches the floor.
      gridSize: Math.max(MIN_GRID_SIZE, gridSizeFor(args.imageWidth, DEFAULT_SQUARES_ACROSS)),
      gridOffsetX: 0,
      gridOffsetY: 0,
      // Maps that arrive with a grid printed on them get ours turned off by hand;
      // defaulting to visible is what lets the DM see whether it lines up at all.
      gridVisible: true,
    })

    // The first map becomes the board straight away. Uploading a map and then being
    // told to select it is a second step with only one possible answer.
    if (!game.activeSceneId) {
      await ctx.db.patch('games', game._id, { activeSceneId: sceneId })
    }

    return { sceneId }
  },
})

/**
 * The calibrator's save. Everything the DM drags in the grid panel arrives here
 * together, because pixels-per-square and the two offsets are one calibration —
 * committing them separately would draw a grid nobody chose in between.
 */
export const updateGrid = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    gridSize: v.number(),
    gridOffsetX: v.number(),
    gridOffsetY: v.number(),
    gridVisible: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    const grid = {
      gridSize: args.gridSize,
      gridOffsetX: args.gridOffsetX,
      gridOffsetY: args.gridOffsetY,
    }
    // A NaN out of an emptied number field is a perfectly valid Convex number, so
    // nothing between the input and here would stop it. Stored, it divides its way
    // into every snap afterwards and the only symptom is tokens that will not sit
    // on a square — which is why the guard is at the write and not at the read.
    if (!isUsableGrid(grid)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That grid size and offset cannot be drawn. Check the numbers.',
      })
    }

    await ctx.db.patch('scenes', scene._id, { ...grid, gridVisible: args.gridVisible })
    return null
  },
})

export const rename = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    await ctx.db.patch('scenes', scene._id, { name: requireSceneName(args.name) })
    return null
  },
})

/**
 * Move the whole table to another board. DM only — every client watches
 * `games.activeSceneId`, so this is the one call that changes what other people
 * are looking at.
 */
export const setActive = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    await ctx.db.patch('games', game._id, { activeSceneId: scene._id })
    return null
  },
})

/**
 * Delete a board: its placements, its image and the pointer at it — and not one
 * token.
 *
 * The pointers here all run one way, exactly as ADR 0003 has them run from a seat
 * to a character. A placement points at a scene and at a token; a token belongs to
 * the game and knows nothing about which boards it stands on. So deleting a scene
 * takes the placements with it and leaves the recurring villain in the game's
 * token library, ready to be dropped onto the next map. The reverse arrangement —
 * a scene owning its tokens — would mean deleting a board you had finished with
 * quietly deleted the NPCs you had built for it.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    await deleteScenePlacements(ctx, scene._id)

    // Cleared rather than moved to another scene. Choosing the next board is the
    // DM's decision, and every client would follow this one silently.
    if (game.activeSceneId === scene._id) {
      await ctx.db.patch('games', game._id, { activeSceneId: undefined })
    }

    // Deleted with the row, in the same transaction. Nothing else can reach the
    // blob once the scene is gone, so leaving it behind would be a slow leak
    // against the 1 GB ceiling that no screen in the app could ever show.
    await ctx.storage.delete(scene.imageId)
    await ctx.db.delete('scenes', scene._id)
    return null
  },
})
