import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_SCENE_NAME_LENGTH } from './codes'
import { MAX_MODAL_IMAGES_PER_GAME } from './games'
import { requireText } from './names'

// Lives in lib/limits.ts, which the browser imports too so there is one definition of
// it rather than one on each side. Brought through here because `modalImages.create`
// is what enforces it, and this is where a reader looks for it — the arrangement
// lib/scenes.ts has for MAX_SCENE_BYTES.
export { MAX_MODAL_BYTES } from './limits'

/**
 * The only shape of a handout a query may return.
 *
 * `imageId` is deliberately absent, for `publicSceneValidator`'s reason: a raw storage
 * id is useless to a browser and the signed URL is what it actually needs.
 *
 * ⚠️ **This projection is the same for both audiences, and that is not an oversight.**
 * A handout the DM has opened is meant to be looked at, so the player's payload and the
 * DM's are the same five fields — what differs is *which rows* each may ask for, which
 * is a gate on `modalImages.list` rather than a redaction here. Nothing on this table
 * has a secret variant, so there is no filtering to do, only a projection.
 */
export const publicModalImageValidator = v.object({
  _id: v.id('modalImages'),
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  imageWidth: v.number(),
  imageHeight: v.number(),
})

export type PublicModalImage = Infer<typeof publicModalImageValidator>

/**
 * `imageUrl` is null when the blob has gone — a file deleted out from under the row,
 * which should not happen and must not take the viewer down with it. A dialog with a
 * broken image in it still carries the name and still closes; an error thrown out of
 * the one query every client at the table subscribes to does neither.
 */
export async function publicModalImage(
  ctx: QueryCtx,
  image: Doc<'modalImages'>,
): Promise<PublicModalImage> {
  return {
    _id: image._id,
    name: image.name,
    imageUrl: await ctx.storage.getUrl(image.imageId),
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
  }
}

/**
 * A handout's name, checked the way every other name in the application is.
 *
 * `MAX_SCENE_NAME_LENGTH` is **borrowed rather than copied**, and the borrow is the
 * point: this is the same kind of string as a scene's name — the DM's own label on an
 * image they uploaded — and the browser sets the field's `maxLength` from that same
 * constant, so the two sides cannot come to disagree about where the limit is. A
 * `MAX_MODAL_NAME_LENGTH` of sixty beside it would be a second number nothing keeps in
 * step with the first.
 *
 * Insisting on one is not bureaucracy. The name is what the DM picks a handout by in a
 * list nobody else can see, and it is also the dialog's title and the image's alt text
 * once it is open — three jobs, all of which "Untitled" does badly.
 */
export function requireModalImageName(raw: string): string {
  return requireText(raw, {
    max: MAX_SCENE_NAME_LENGTH,
    blank: 'Give the handout a name.',
    tooLong: `Keep the handout name to ${MAX_SCENE_NAME_LENGTH} characters or fewer.`,
  })
}

export async function listModalImages(
  ctx: QueryCtx,
  gameId: Id<'games'>,
): Promise<Doc<'modalImages'>[]> {
  return await ctx.db
    .query('modalImages')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_MODAL_IMAGES_PER_GAME)
}

/**
 * Loads a handout and checks it belongs to the game the caller named, as
 * `findSceneInGame` does for a scene: an id off the wire is routing, so this stops one
 * from another game being opened to this table, or deleted through a code the caller
 * does hold.
 *
 * Returns null for an unknown row or one in another game — for queries, which render
 * nothing rather than an error.
 */
export async function findModalImageInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  modalImageId: Id<'modalImages'>,
): Promise<Doc<'modalImages'> | null> {
  const image = await ctx.db.get('modalImages', modalImageId)
  if (!image || image.gameId !== gameId) return null
  return image
}

/** Throws instead — for mutations, where there is nothing to render. */
export async function getModalImageInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  modalImageId: Id<'modalImages'>,
): Promise<Doc<'modalImages'>> {
  const image = await findModalImageInGame(ctx, gameId, modalImageId)
  if (!image) {
    throw new ConvexError({
      kind: 'ModalImageNotFound',
      message: 'That handout is not in this game.',
    })
  }
  return image
}

/**
 * Is this blob still a handout? The third question `files.discard` asks, stated as a
 * predicate here so that call reads as one question put to three tables rather than a
 * list walk in each of them.
 *
 * ⚠️ **The schema note beside `modalImages` is what this exists for.** A discard that
 * did not ask would delete the bytes out from under an image the table is looking at,
 * because `discard` is called from an *error path* with an id the client may have
 * mis-sequenced — being DM-gated bounds who can call it and does nothing to make the
 * call correct.
 */
export async function modalImageReferencesImage(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const images = await listModalImages(ctx, gameId)
  return images.some((image) => image.imageId === imageId)
}

/**
 * Every handout in a game, with its blob. For the purge tool in `convex/admin.ts`, and
 * for nothing a client can reach.
 *
 * This is `modalImages.remove` done once per row, minus the `openImageId` repair — the
 * game document pointing at these rows is deleted in the same transaction, so clearing
 * the pointer first would be a write to a row on its way out. `deleteScenesInGame`
 * skips `activeSceneId` for exactly that reason.
 *
 * ⚠️ **The blob goes with the row** (CLAUDE.md invariant 6). Twenty-five handouts at
 * `MAX_MODAL_BYTES` is 50 MB of a purged game's storage that no screen in the
 * application could ever name again, let alone delete.
 */
export async function deleteModalImagesInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const images = await listModalImages(ctx, gameId)
  for (const image of images) {
    await ctx.storage.delete(image.imageId)
    await ctx.db.delete('modalImages', image._id)
  }
  return images.length
}
