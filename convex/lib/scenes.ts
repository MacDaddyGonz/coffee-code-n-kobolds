import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
// The placement sweep, borrowed rather than rewritten: `tokenPositions` belongs to
// lib/board.ts and `leakGuard.test.ts` greps for anyone who forgets it. The import
// runs one way — lib/board.ts knows nothing about scenes as a table — so there is no
// cycle here, and `convex/scenes.ts` has paired these two calls since Milestone 2.
import { deleteScenePlacements } from './board'
// The fog sweep, paired with the placement sweep everywhere it appears. `fogRects` is
// keyed on the scene alone, so a scene's rectangles are unreachable the moment its row is
// gone — an orphaned rectangle is not a leak, it is litter nothing in the app can name.
import { deleteSceneFog } from './fog'
import { MAX_SCENES_PER_GAME } from './games'

// Lives in lib/limits.ts, which the browser imports too so there is one definition
// of it rather than one on each side. Brought through here because `scenes.create`
// is what enforces it, and this is where a reader looks for it.
export { MAX_SCENE_BYTES } from './limits'

/**
 * The grid a fresh scene starts with, guessed at 20 squares across the image.
 *
 * A guess is better than nothing on screen: the DM sees a grid immediately and
 * drags the square count until it lines up with the map, which is a correction
 * rather than a blank form. Most battle maps sit between 16 and 30 across.
 */
export const DEFAULT_SQUARES_ACROSS = 20

/**
 * What is painted around a map that has never been given a colour.
 *
 * A near-black rather than the near-white the shell used to paint, because that is what a
 * board actually wants: a lit map on a dark surround reads as a map on a table, and the
 * white one read as a map that had failed to load into a bigger white page. The DM can
 * pick anything.
 *
 * ⚠️ **A real colour and never `null`, which is what makes `backgroundOf` a total
 * function.** The alternative — letting absent mean *whatever the stylesheet was doing* —
 * puts the default in the CSS and the override in the database, so the two would have to
 * be kept in step by memory and a screenshot would be the only way to tell they had
 * drifted. One answer, from one accessor.
 */
export const DEFAULT_SCENE_BACKGROUND = '#111114'

/**
 * The colour painted around this map. **The only reader of the optional field.**
 *
 * The schema could not require it — see the note on the column — so this is where absent
 * becomes a value, exactly once. A row written before the field existed and a row whose
 * DM has never opened the picker are the same thing and get the same answer.
 */
export function backgroundOf(scene: Doc<'scenes'>): string {
  return scene.backgroundColour ?? DEFAULT_SCENE_BACKGROUND
}

/**
 * The only shape of a scene a query may return.
 *
 * `imageId` is deliberately absent: a raw storage id is useless to a browser and
 * the signed URL is what it actually needs, so resolving it here means no client
 * has to know that Convex file storage exists. Nothing in a scene is a secret —
 * the background image is what every player is looking at — so unlike the token
 * tables there is no filtering to do, only a projection.
 */
export const publicSceneValidator = v.object({
  _id: v.id('scenes'),
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  imageWidth: v.number(),
  imageHeight: v.number(),
  gridSize: v.number(),
  gridOffsetX: v.number(),
  gridOffsetY: v.number(),
  gridVisible: v.boolean(),
  // Required *here* even though the column is optional, which is the point of a projection:
  // `backgroundOf` has already turned absent into a colour, so no client ever has to know
  // this field arrived late or what it would have meant if it were missing.
  backgroundColour: v.string(),
})

export type PublicScene = Infer<typeof publicSceneValidator>

/**
 * `imageUrl` is null when the blob has gone — a file deleted out from under the
 * row, which should not happen and must not take the whole board down with it.
 * The canvas can still draw the grid over empty space, and a DM looking at a
 * gridded void can tell that something is wrong far more easily than one looking
 * at an error screen.
 */
export async function publicScene(ctx: QueryCtx, scene: Doc<'scenes'>): Promise<PublicScene> {
  return {
    _id: scene._id,
    name: scene.name,
    imageUrl: await ctx.storage.getUrl(scene.imageId),
    imageWidth: scene.imageWidth,
    imageHeight: scene.imageHeight,
    gridSize: scene.gridSize,
    gridOffsetX: scene.gridOffsetX,
    gridOffsetY: scene.gridOffsetY,
    gridVisible: scene.gridVisible,
    backgroundColour: backgroundOf(scene),
  }
}

export async function listScenes(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'scenes'>[]> {
  return await ctx.db
    .query('scenes')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_SCENES_PER_GAME)
}

/**
 * Is this blob still a scene's background? The other half of `files.discard`'s
 * refusal, stated as a predicate so that call reads as one question asked of both
 * tables rather than a list walk here and a helper call there.
 */
export async function sceneReferencesImage(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const scenes = await listScenes(ctx, gameId)
  return scenes.some((scene) => scene.imageId === imageId)
}

/**
 * Every board in a game, with its placements and its background image. For the purge
 * tool in `convex/admin.ts`, and for nothing a client can reach.
 *
 * This is `scenes.remove` done once per row, minus the `activeSceneId` repair — the
 * game document pointing at these scenes is deleted in the same transaction, so
 * clearing the pointer first would be a write to a row on its way out. Everything
 * else that mutation does, this does, in the same order and for the same reasons.
 *
 * ⚠️ **The blob goes with the row** (CLAUDE.md invariant 6). A purge that dropped the
 * scenes and left the maps would be a worse leak than the games it cleaned up: a
 * 4 MB battle map belonging to a game that no longer exists is unreachable from every
 * screen in the app, and would sit against the 1 GB the free tier allows with nothing
 * able to name it, let alone delete it. `scenes.remove` says the same thing about one
 * scene; thirty-five smoke games' worth is the reason this tool is worth building
 * properly rather than deleting rows and moving on.
 *
 * It does **not** make the orphaned-blob sweeper unnecessary. That pass exists for
 * blobs a *refused or abandoned upload* left behind — a mutation that throws cannot
 * delete the file it just rejected, which is the whole reason `files.discard` is a
 * separate call — and those blobs never had a row to go with. Different residue.
 *
 * The placement sweep is very nearly always a no-op when the purge runs it, because
 * `deleteTokensInGame` has already taken every placement with its token. It is kept
 * because this helper has to be correct on its own terms — the game editor will reuse
 * it — and because the one placement it *would* find is the pathological one: a row
 * whose token had already vanished, which nothing else in the codebase would ever
 * reach again.
 *
 * ⚠️ **The fog sweep is not that, and it does real work every time.** Nothing else in a
 * purge touches `fogRects`: no token owns a rectangle and no character does, so a game
 * deleted without this line leaves every rectangle its DM ever drew behind, keyed on a
 * scene id that resolves to nothing. Cheap rows rather than blobs, so this is litter and
 * not the storage leak the image delete above prevents — but it is litter no query in the
 * application can ever reach again, which is the same reason `purgeGame` exists at all.
 */
export async function deleteScenesInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const scenes = await listScenes(ctx, gameId)
  for (const scene of scenes) {
    await deleteScenePlacements(ctx, scene._id)
    await deleteSceneFog(ctx, scene._id)
    await ctx.storage.delete(scene.imageId)
    await ctx.db.delete('scenes', scene._id)
  }
  return scenes.length
}

/**
 * Loads a scene and checks it belongs to the game the caller named, the same way
 * `getSeatInGame` does for seats: a scene id off the wire is routing, so this
 * stops one from another game being read, recalibrated or deleted through a code
 * the caller does hold.
 *
 * Returns null for an unknown scene or one in another game — for queries, which
 * render an empty board rather than an error. Paired with `getSceneInGame` below
 * exactly as `findGameByCode` is paired with `getGameByCode`.
 */
export async function findSceneInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'>,
): Promise<Doc<'scenes'> | null> {
  const scene = await ctx.db.get('scenes', sceneId)
  if (!scene || scene.gameId !== gameId) return null
  return scene
}

/** Throws instead — for mutations, where there is nothing to render. */
export async function getSceneInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'>,
): Promise<Doc<'scenes'>> {
  const scene = await findSceneInGame(ctx, gameId, sceneId)
  if (!scene) {
    throw new ConvexError({ kind: 'SceneNotFound', message: 'That scene is not in this game.' })
  }
  return scene
}
