import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
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
