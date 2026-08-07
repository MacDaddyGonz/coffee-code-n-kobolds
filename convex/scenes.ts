import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { copyScenePlacements, deleteScenePlacements, scaleScenePlacements } from './lib/board'
import { colourProblem } from './lib/colour'
import { deleteSceneFog } from './lib/fog'
import { copySceneWalls, deleteSceneWalls, scaleSceneWalls } from './lib/walls'
import { fogBaseOf, fogBaseValidator } from './lib/fogBase'
import { MAX_SCENES_PER_GAME, findGameByCode, requireDm, stampReveal } from './lib/games'
import { MIN_GRID_SIZE, gridSizeFor, isUsableGrid } from './lib/grid'
import { requireSceneName, requireSceneNotes, sceneCopyName } from './lib/names'
import {
  DEFAULT_SQUARES_ACROSS,
  MAX_SCENE_BYTES,
  MAX_THUMB_BYTES,
  copySceneFog,
  dmScene,
  dmSceneValidator,
  getSceneInGame,
  listScenes,
  notesOf,
  otherSceneReferencesImage,
  otherSceneReferencesThumbnail,
  publicScene,
  publicSceneValidator,
  scaleSceneFog,
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
    // Already in the DM's order — `listScenes` sorts, so that rule lives in one place — and
    // the index it came back in *is* each row's `order`. See the ⚠️ on that field.
    const scenes = await listScenes(ctx, game._id)
    return await Promise.all(scenes.map((scene, index) => dmScene(ctx, scene, index)))
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
 * The DM's prep for this board.
 *
 * ⚠️ **A blank REMOVES the column rather than storing `''`.** Convex's `patch` deletes a
 * field given `undefined`, and using it is what keeps "no notes" to one stored spelling —
 * ADR 0008's convention, which exists because two spellings of one meaning is a thing every
 * field-by-field rebuild afterwards has to agree about. `notesOf` is the only reader and it
 * answers `''` either way, so nothing downstream can tell the difference or has to.
 *
 * Its own mutation for `setBackground`'s reason: one field, one call, and nothing about it
 * belongs to the grid calibration it would otherwise ride along with.
 *
 * **No `stampReveal`.** Writing prep nobody but the DM can read reveals nothing, and
 * `fogActReveals`' cost argument runs the other way here — a stamp too many retires the
 * flourish on every feed line older than it, for an act no player can observe at all.
 */
export const setNotes = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes'), notes: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Argument-first, so an over-long note costs no reads — `setBackground`'s ordering.
    const notes = requireSceneNotes(args.notes)

    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)
    if (notesOf(scene) === notes) return null

    await ctx.db.patch('scenes', scene._id, { notes: notes === '' ? undefined : notes })
    return null
  },
})

/**
 * The DM's list, in the order they want it. **The whole list, every time.**
 *
 * ⚠️ **It takes the entire ordering rather than a scene and a direction, and that is
 * `board.setControllers`' argument arriving for a second table.** The DM means *this order*,
 * and a loop of N calls is that intention spread across N transactions: a browser that
 * refreshes between the third and the fourth shows a list nobody chose, and two DMs pressing
 * the arrows at once interleave into an order neither asked for. Twenty-five patches in one
 * transaction is cheap and is the thing that was meant.
 *
 * ⚠️ **A permutation, checked, and not a prefix.** Accepting a partial list would leave the
 * unnamed scenes holding whatever numbers they had, which is a list the next reorder cannot
 * reason about — and accepting one with a repeat would give two rows the same index and put
 * the tie-break in charge. So the check is exact: same length, same set, this game's scenes
 * only. `getSceneInGame` is what makes "this game's" true, and a foreign id refuses rather
 * than being ignored, because an ignored id is a UI that silently did something else.
 *
 * Ordinals are the **array index** rather than the numbers the rows already hold, so the
 * result is 0…n-1 with no gaps whatever it was before. A list where every row has an order
 * is the state `orderOf`'s absent-sorts-last rule never has to be thought about again in.
 *
 * The membership check reads the game's scenes **once** and then answers from that list,
 * rather than calling `getSceneInGame` twenty-five times: it is the same question, and one
 * range read is what `deleteTokensInGame` already had to be corrected to.
 */
export const reorder = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneIds: v.array(v.id('scenes')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scenes = await listScenes(ctx, game._id)
    const byId = new Map(scenes.map((scene) => [scene._id, scene]))

    const named = new Set(args.sceneIds)
    if (named.size !== args.sceneIds.length || named.size !== scenes.length) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'Reordering needs every map in the game, each named once.',
      })
    }
    // Every named id belongs to this game — and, given the two counts above, every scene in
    // the game is therefore named. One direction implies the other only because the sizes
    // match, which is why the length check is not decoration.
    for (const sceneId of args.sceneIds) {
      if (!byId.has(sceneId)) {
        throw new ConvexError({
          kind: 'SceneNotFound',
          message: 'That scene is not in this game.',
        })
      }
    }

    for (const [index, sceneId] of args.sceneIds.entries()) {
      // No-op guarded per row, like `setTokenLayer`: a patch that changes nothing still
      // invalidates every subscription reading it, and swapping two rows in a list of
      // twenty-five should re-push two documents rather than twenty-five.
      if (byId.get(sceneId)?.order === index) continue
      await ctx.db.patch('scenes', sceneId, { order: index })
    }
    return null
  },
})

/**
 * Copy a board. **One choice, not three checkboxes.**
 *
 * ⚠️ **The blob is SHARED and never copied** (CLAUDE.md invariant 6). Four megabytes
 * duplicated on a press is a quarter of a game's map budget spent on a picture that is
 * byte-identical to one already in storage, and the free tier's 1 GB is what the whole
 * downscaler exists to defend. The thumbnail is shared for the same reason and the same
 * arithmetic. That sharing is what broke two unconditional deletes, which is why the commit
 * before this one made `scenes.remove` conditional and deduplicated the purge.
 *
 * **What a copy always takes, and the sentence that decides it:** *a wall is a property of
 * the map; a placement and a fog shape are where things are tonight.* So the image, the
 * thumbnail, the grid calibration, the fog base, the notes and the background colour come
 * across unconditionally — they describe the map — and the token placements and the fog
 * shapes come only when asked. One boolean rather than three checkboxes, because that
 * sentence answers every case a DM actually has: *the same room, laid out again* or *the
 * same room, empty*.
 *
 * Walls arrived on a parallel branch and are on the unconditional side, exactly where that
 * sentence puts them — `copySceneWalls` is called outside the `includeContents` branch.
 *
 * ⚠️ **It does not become active and it does not stamp.** Copying a map is preparation, and
 * a duplicate that put itself on the table would move the whole party onto a board the DM
 * made to work on. `scenes.create` makes the *first* map active because there is only one
 * possible answer then; here there are two, and the DM picks. Nothing about a copy is a
 * reveal either — the rows land on a scene nobody is looking at — so `stampReveal` would
 * retire the flourish on every feed line older than it for an act no player can observe.
 *
 * The copy's `order` is left absent, which sorts it last. That is the same choice
 * `scenes.create` makes, and it is the useful one: a new row belongs at the end of the list
 * rather than beside the row it came from, where it would silently renumber everything after.
 */
export const duplicate = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    /** The placements and the fog shapes. Everything else comes across regardless. */
    includeContents: v.boolean(),
  },
  returns: v.object({ sceneId: v.id('scenes') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const source = await getSceneInGame(ctx, game._id, args.sceneId)

    // The same bound `create` enforces, for the same reason: a scene past the read window
    // could never be found again by the panel that would let the DM delete it.
    const existing = await listScenes(ctx, game._id)
    if (existing.length >= MAX_SCENES_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_SCENES_PER_GAME} scenes.`,
      })
    }

    // ⚠️ Field by field rather than `{ ...source }`, which would carry `_id` and
    // `_creationTime` into the insert — and, more to the point, would copy a future column
    // nobody had thought about. `copyTokenRow` in lib/board.ts carries the long version, plus
    // the warning that an optional field spelled as an explicit `undefined` is a *different
    // write* from an omitted one against a real deployment, which convex-test cannot see.
    const sceneId = await ctx.db.insert('scenes', {
      gameId: game._id,
      // `requireSceneName` still runs, because `sceneCopyName` reserves the suffix's budget
      // and a refusal here would mean the two disagree — which is worth finding in a test
      // rather than in front of the table.
      name: requireSceneName(sceneCopyName(source.name)),
      imageId: source.imageId,
      ...(source.thumbnailId === undefined ? {} : { thumbnailId: source.thumbnailId }),
      imageWidth: source.imageWidth,
      imageHeight: source.imageHeight,
      gridSize: source.gridSize,
      gridOffsetX: source.gridOffsetX,
      gridOffsetY: source.gridOffsetY,
      gridVisible: source.gridVisible,
      ...(source.backgroundColour === undefined
        ? {}
        : { backgroundColour: source.backgroundColour }),
      ...(source.fogBase === undefined ? {} : { fogBase: source.fogBase }),
      ...(source.notes === undefined ? {} : { notes: source.notes }),
    })

    // ⚠️ **The walls come across unconditionally, and the sentence in the docblock is why:**
    // a wall is a property of the map. A DM copying a dungeon level wants the same rooms with
    // the same doorways; re-tracing every corridor is exactly the work this button exists to
    // avoid. So this sits OUTSIDE the branch below, beside the fields on the insert rather
    // than beside the placements.
    await copySceneWalls(ctx, source._id, sceneId)

    if (args.includeContents) {
      await copyScenePlacements(ctx, source._id, sceneId)
      await copySceneFog(ctx, source._id, sceneId)
    }

    return { sceneId }
  },
})

/**
 * ⚠️ **How far two aspect ratios may differ and still be the same map.**
 *
 * One percent, which is a rounding error rather than a crop: the downscaler rounds both
 * edges to whole pixels, so 2240 × 1680 re-exported at 2560 lands on 2560 × 1920 exactly but
 * an odd-numbered source can come back a pixel out — 0.05% on a map that size. A DM who
 * cropped a border off, or exported the same dungeon at a different page size, is past this
 * within a few pixels of doing it, which is the case the refusal is for.
 */
const MAX_ASPECT_DRIFT = 0.01

/**
 * Swap the picture under a board without losing its grid, its fog or where everything is
 * standing.
 *
 * ⚠️ **Every coordinate in this application is in the stored image's pixel space, so
 * replacing the blob moves everything.** The grid is pixels-per-square; a placement is a
 * pixel point; a fog rectangle is a pixel rectangle. Swap a 2240 px map for a 2560 px one and
 * every one of those numbers now means something 14% smaller than it did. The alternative
 * designs are worse in an obvious way and a subtle one: storing normalised coordinates is a
 * schema migration of every position row in every game to buy this one mutation, and doing
 * nothing means a DM's afternoon of calibration and fog silently ends up in the wrong place
 * with no error anywhere.
 *
 * In order, and every check before every write:
 *
 * 1. **The blobs**, against the stored bytes rather than the client's word for them — the
 *    same shape `scenes.create` uses, for CLAUDE.md invariant 6's reason.
 * 2. ⚠️ **An aspect-ratio change beyond a whisker is refused**, with the advice rather than
 *    a diagnosis: *that map is a different shape; add it as a new map instead.* A different
 *    shape needs two scale factors, and two factors shear every square the DM aligned
 *    against a printed grid — a "successful" replace that quietly makes the calibration
 *    wrong is worse than a refusal, because nothing on screen says so.
 * 3. `k = newWidth / oldWidth`, one factor, a **uniform similarity transform** — so a shape
 *    snapped to the old grid is snapped to the new one.
 * 4. ⚠️ **`k === 1` skips every rewrite, and that is the common case rather than an
 *    optimisation.** Re-exporting a map at the same size is what a DM does when they redraw
 *    a room, and multiplying two hundred placements by 1 is two hundred writes that change
 *    nothing and re-push the board to the whole table.
 * 5. Otherwise the one factor goes through the grid, every placement and every fog shape.
 * 6. The **old** blobs are reclaimed conditionally, through the same siblings `scenes.remove`
 *    uses, because a duplicate may still be drawing them.
 *
 * ⚠️ **A scaled `gridSize` that leaves `isUsableGrid` REFUSES rather than being clamped**,
 * and the roadmap does not say which. Clamping is the wrong answer for the reason the whole
 * mutation exists: a calibration silently pinned to `MIN_GRID_SIZE` is a grid that no longer
 * lines up with the map, discovered by a DM who is mid-session and has no way to know the
 * app changed their number. A refusal names the reason and leaves the old map in place,
 * which is a state they can act on. It is unreachable at any sane scale — `MIN_GRID_SIZE` is
 * 4 px and `MAX_GRID_SIZE` is 2000 — and it is checked because `MAX_SCENE_BYTES` does not
 * bound a *dimension* and a 20 px-wide upload is a client bug rather than a map.
 *
 * **It does not stamp.** Rescaling fog moves every shape by the same factor and reveals
 * nothing that was hidden; the party is looking at a map that changed under them, and
 * `fogActReveals` has nothing to say about an act that is not a fog act.
 */
export const replaceImage = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    imageId: v.id('_storage'),
    thumbnailId: v.optional(v.id('_storage')),
    imageWidth: v.number(),
    imageHeight: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    if (!isUsableImageSize(args.imageWidth) || !isUsableImageSize(args.imageHeight)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That image has no usable width and height.',
      })
    }

    await requireStoredBlob(ctx, args.imageId, SCENE_IMAGE_LIMIT)
    if (args.thumbnailId !== undefined) {
      await requireStoredBlob(ctx, args.thumbnailId, SCENE_THUMB_LIMIT)
    }

    const was = scene.imageWidth / scene.imageHeight
    const now = args.imageWidth / args.imageHeight
    if (Math.abs(now - was) > was * MAX_ASPECT_DRIFT) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That map is a different shape. Add it as a new map instead.',
      })
    }

    const k = args.imageWidth / scene.imageWidth
    const grid = {
      gridSize: scene.gridSize * k,
      gridOffsetX: scene.gridOffsetX * k,
      gridOffsetY: scene.gridOffsetY * k,
    }
    // Checked before anything is written, and refused rather than clamped — see the ⚠️ above.
    if (k !== 1 && !isUsableGrid(grid)) {
      throw new ConvexError({
        kind: 'BadInput',
        message:
          'Scaling this map’s grid to that size would leave a grid that cannot be drawn. Recalibrate the grid first, or add the image as a new map.',
      })
    }

    const previousImageId = scene.imageId
    const previousThumbnailId = scene.thumbnailId

    await ctx.db.patch('scenes', scene._id, {
      imageId: args.imageId,
      // Absent clears the column, which is right: the replacement was uploaded without a
      // derivative, so keeping the old map's thumbnail would draw the picture that is no
      // longer there. `dmScene` then falls back to the new map.
      thumbnailId: args.thumbnailId,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      ...(k === 1 ? {} : grid),
    })

    if (k !== 1) {
      await scaleScenePlacements(ctx, scene._id, k)
      await scaleSceneFog(ctx, scene._id, k)
      // ⚠️ **And the walls, which is the one of the four whose omission is worse than a
      // deletion.** A barrier left at the old map's scale stops the party where nothing is
      // drawn and lets them through a door that is plainly open — a missing wall at least
      // looks like a missing wall.
      await scaleSceneWalls(ctx, scene._id, k)
    }

    // Reclaimed only if no duplicate is still drawing them, and only if the swap actually
    // changed them — re-uploading the identical blob id is a no-op, not a reason to delete
    // the bytes the row now points at. The row is already patched, so `otherScene…`'s `_id`
    // exclusion is what makes these correct rather than the ordering.
    if (
      previousImageId !== args.imageId &&
      !(await otherSceneReferencesImage(ctx, scene, previousImageId))
    ) {
      await ctx.storage.delete(previousImageId)
    }
    if (
      previousThumbnailId !== undefined &&
      previousThumbnailId !== args.thumbnailId &&
      !(await otherSceneReferencesThumbnail(ctx, scene, previousThumbnailId))
    ) {
      await ctx.storage.delete(previousThumbnailId)
    }
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
 *
 * ⚠️ **The image delete is conditional, and it had to become so before duplication existed
 * rather than in the same commit.** A duplicated scene shares the map blob, because
 * invariant 6 forbids copying four megabytes to make a copy — so an unconditional
 * `ctx.storage.delete` here means duplicating a map and then deleting the original blanks
 * the copy. It is the same latent bug the tokens milestone found in a coin's art, arriving
 * for a second table, and it is worth noticing that **an unconditional delete is a bet that
 * nothing will ever share the thing, and this project has now lost that bet twice.**
 *
 * ⚠️ **`deleteScenesInGame` is the other half of the pair and did NOT become conditional**,
 * which is where the roadmap's "both become conditional" is wrong. That one deletes every
 * scene in the game, so the question has no useful answer; its failure was a *second delete
 * of the same id*, and its fix is deduplication. Its docblock carries the argument.
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
    // And the walls, which are keyed on the scene in exactly the same way and would
    // otherwise outlive every reader that could ever name them.
    await deleteSceneWalls(ctx, scene._id)

    // Cleared rather than moved to another scene. Choosing the next board is the
    // DM's decision, and every client would follow this one silently.
    if (game.activeSceneId === scene._id) {
      await ctx.db.patch('games', game._id, { activeSceneId: undefined })
    }

    // Deleted with the row, in the same transaction — **unless a duplicate is still
    // drawing it.** Leaving a blob nothing points at is a slow leak against the 1 GB
    // ceiling that no screen in the app could ever show; reclaiming one a copy still holds
    // is worse, because it blanks a map the DM can see in the list beside this one.
    //
    // ⚠️ **Ordered rows-then-blobs, and the exclusion rather than the ordering is what makes
    // this correct.** `otherSceneReferencesImage` compares `_id`, so it answers the same
    // either side of the row delete; a version that worked because the row was already gone
    // would be a correctness property held by two adjacent lines.
    if (!(await otherSceneReferencesImage(ctx, scene, scene.imageId))) {
      await ctx.storage.delete(scene.imageId)
    }
    // The derivative asks its own question. A duplicate shares both blobs, so today the two
    // answers agree — `otherSceneReferencesThumbnail` says why they are still two questions.
    if (
      scene.thumbnailId &&
      !(await otherSceneReferencesThumbnail(ctx, scene, scene.thumbnailId))
    ) {
      await ctx.storage.delete(scene.thumbnailId)
    }
    await ctx.db.delete('scenes', scene._id)
    return null
  },
})
