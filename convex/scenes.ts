import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { deleteScenePlacements } from './lib/board'
import { colourProblem } from './lib/colour'
import { deleteSceneFog } from './lib/fog'
import { fogBaseOf, fogBaseValidator } from './lib/fogBase'
import { MAX_SCENES_PER_GAME, findGameByCode, requireDm, stampReveal } from './lib/games'
import { MIN_GRID_SIZE, gridSizeFor, isUsableGrid } from './lib/grid'
import { requireSceneName } from './lib/names'
import {
  DEFAULT_SQUARES_ACROSS,
  MAX_SCENE_BYTES,
  MAX_THUMB_BYTES,
  dmScene,
  dmSceneValidator,
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
 *
 * ⚠️ **The one caller of `dmSceneValidator`, and it must stay the one caller.** That
 * projection carries what the DM alone may read; `scenes.active` is ungated and carries
 * `publicSceneValidator`, which is the whole of what a player is ever sent about a board.
 * The refusal above is what makes the wider payload defensible, so the two facts are one
 * fact: this query throws for a non-DM, therefore this query may say more.
 */
export const list = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.array(dmSceneValidator),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scenes = await listScenes(ctx, game._id)
    // Oldest first: Convex appends _creationTime to every index, so the DM's list
    // stays in the order they uploaded rather than reshuffling on each render.
    return await Promise.all(scenes.map((scene) => dmScene(ctx, scene)))
  },
})

/** Finite and positive — which rules out the NaN, the 0 and the negative. */
function isUsableImageSize(pixels: number): boolean {
  return Number.isFinite(pixels) && pixels > 0
}

/**
 * CLAUDE.md invariant 6's server half, for one blob.
 *
 * Read from storage rather than taken as an argument, because the byte count is the one
 * fact about an upload the client cannot be trusted to report — it is the client being
 * checked. A helper rather than the check written out three times, because `create` now
 * looks at two blobs and `replaceImage` looks at two more, and three copies of a ceiling
 * comparison is three chances to pair the wrong constant with the wrong blob. That is the
 * mistake `UploadSpec` in `src/hooks/useUpload.ts` was restructured to make unspellable on
 * the other side of the wire.
 *
 * ⚠️ **`tooBig` is passed whole rather than built from a noun and the number.** A generated
 * sentence has to render `MAX_THUMB_BYTES` as *0.25 MB*, which is not how anybody says a
 * quarter of a megabyte, and the two ceilings here are four orders of magnitude apart. The
 * missing-blob case genuinely is one sentence for every caller: whichever blob went, the
 * advice is to add the map again.
 */
async function requireStoredBlob(
  ctx: QueryCtx,
  imageId: Id<'_storage'>,
  limit: { maxBytes: number; tooBig: string },
): Promise<void> {
  const blob = await ctx.db.system.get('_storage', imageId)
  if (!blob) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'That upload is no longer in storage. Try adding the map again.',
    })
  }
  if (blob.size > limit.maxBytes) {
    throw new ConvexError({ kind: 'BadInput', message: limit.tooBig })
  }
}

/** The two ceilings a map upload is checked against, worded for the DM. */
const SCENE_IMAGE_LIMIT = {
  maxBytes: MAX_SCENE_BYTES,
  tooBig: `Maps have to be under ${MAX_SCENE_BYTES / (1024 * 1024)} MB once downscaled. That one is bigger.`,
}

/**
 * ⚠️ **Reachable only through a bug, and kept for exactly that.** The thumbnail is made by
 * this application from a blob it has already accepted, so a DM cannot produce one over the
 * limit by choosing a bigger file. What this catches is a client that posted the *map* into
 * the thumbnail argument — which is the one way those bytes get into storage twice — and
 * that is a real class of mis-sequencing, the same one `files.discard` exists for.
 */
const SCENE_THUMB_LIMIT = {
  maxBytes: MAX_THUMB_BYTES,
  tooBig: `A map thumbnail has to be under ${MAX_THUMB_BYTES / 1024} KB. That one is bigger, which means it is not a thumbnail.`,
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
    /**
     * ⚠️ **Optional, and absent has to keep working for ever.** A browser with no WebP
     * encoder, a derivative that failed to encode, and every scene uploaded before this
     * existed all arrive the same way, and `dmScene` answers all three with the full map.
     * Making it required would be a client-side failure that can refuse a map.
     */
    thumbnailId: v.optional(v.id('_storage')),
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

    await requireStoredBlob(ctx, args.imageId, SCENE_IMAGE_LIMIT)
    // Both blobs, or the derivative is the hole in invariant 6 that the map is not.
    if (args.thumbnailId !== undefined) {
      await requireStoredBlob(ctx, args.thumbnailId, SCENE_THUMB_LIMIT)
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
      // ⚠️ **Spread rather than written as `thumbnailId: args.thumbnailId`.** An optional
      // Convex field spelled with an explicit `undefined` is a *different write* from an
      // omitted one, and convex-test does not apply Convex's own value validation — so the
      // explicit version passes the whole suite and misbehaves against a real deployment.
      // `copyTokenRow` in lib/board.ts carries the long form of this warning.
      ...(args.thumbnailId === undefined ? {} : { thumbnailId: args.thumbnailId }),
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

/**
 * What is painted around the map.
 *
 * ⚠️ **Its own mutation rather than a seventh argument on `updateGrid`**, and that
 * function's own docblock is the reason: the three grid numbers arrive together because
 * they are *one calibration* and committing them separately would draw a grid nobody
 * chose. A colour is not part of that calibration and never becomes stale against it —
 * folding it in would mean every colour press re-committing a grid, and every grid save
 * re-committing a colour, so a stale copy of either in a client's form could quietly
 * overwrite the other. `rename` is the shape this follows: one field, one call.
 *
 * The check is at the write for `isUsableGrid`'s reason, restated for a string. An
 * `<input type="color">` cannot produce anything but `#rrggbb` — so this refusal is
 * unreachable by pointing at the control — and it is still here, because the value is
 * handed to a CSS `background-color` on every screen at the table and a client is not
 * what enforces anything (CLAUDE.md invariant 7's rule, and invariant 6's).
 */
export const setBackground = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    backgroundColour: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Argument-first, so a bad colour costs no reads — `moveToken`'s ordering, and the
    // one this file's other write checks keep.
    const problem = colourProblem(args.backgroundColour, 'map background')
    if (problem !== null) {
      throw new ConvexError({ kind: 'BadInput', message: problem })
    }

    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    await ctx.db.patch('scenes', scene._id, { backgroundColour: args.backgroundColour })
    return null
  },
})

/**
 * Flip this map between starting lit and starting covered.
 *
 * Its own mutation for `setBackground`'s reason exactly: one field, one call, and nothing
 * about it is part of the grid calibration it would otherwise have to ride along with.
 *
 * ⚠️ **It does not delete the shapes, and the confirm dialog says so in words.** Inverting a
 * map exactly — what was dark is now lit — is arguably a feature and is definitely a surprise,
 * so the DM is told before it happens rather than after. Deleting is what `fog.clear` is for,
 * and a flip that destroyed an afternoon's drawing with no undo is unforgivable.
 *
 * ⚠️ **The stamp is unconditional, and it is the one write in the fog surface `fogActReveals`
 * cannot answer for.** That predicate asks whether an act widens or narrows, and a flip does
 * **both at once**: every shape that was covering is now revealing and vice versa, so some
 * creature somewhere almost certainly just became audible. The two costs are the ones that
 * function's docblock weighs — a stamp too many is one missing flourish, a stamp too few
 * replays an evening — so the cheap side wins and the flip always stamps.
 *
 * No-op guarded, like `setTokenLayer`: a patch that changes nothing still invalidates every
 * subscription reading the row, and re-stamping the game for a press that changed nothing
 * would silently retire the flourish on every line older than it.
 */
export const setFogBase = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    fogBase: fogBaseValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    if (fogBaseOf(scene.fogBase) === args.fogBase) return null

    await ctx.db.patch('scenes', scene._id, { fogBase: args.fogBase })
    await stampReveal(ctx, game._id)
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
 * Delete a board: its placements, its fog, its image and the pointer at it — and
 * not one token.
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
    // And the fog with them, for the reason the docblock gives about placements, applied to
    // rows that point *only* at this scene. A fog rectangle is keyed on the scene and on
    // nothing else, so unlike a token it has no life beyond this board and no library to be
    // returned to — leaving it would be leaving a row nothing in the app can name, reach or
    // delete. `deleteScenesInGame` pairs these two calls the same way.
    await deleteSceneFog(ctx, scene._id)

    // Cleared rather than moved to another scene. Choosing the next board is the
    // DM's decision, and every client would follow this one silently.
    if (game.activeSceneId === scene._id) {
      await ctx.db.patch('games', game._id, { activeSceneId: undefined })
    }

    // Deleted with the row, in the same transaction. Nothing else can reach the
    // blob once the scene is gone, so leaving it behind would be a slow leak
    // against the 1 GB ceiling that no screen in the app could ever show.
    await ctx.storage.delete(scene.imageId)
    // The derivative goes with it, for the reason `deleteScenesInGame` states: a forgotten
    // thumbnail leaves no gap on any screen, so nothing would ever report it.
    if (scene.thumbnailId) await ctx.storage.delete(scene.thumbnailId)
    await ctx.db.delete('scenes', scene._id)
    return null
  },
})
