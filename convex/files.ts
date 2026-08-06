import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { tokenReferencesImage } from './lib/board'
import { requireDm } from './lib/games'
import { MAX_DISCARD_IDS } from './lib/limits'
import { modalImageReferencesImage } from './lib/modalImages'
import { trackReferencesFile } from './lib/music'
import { sceneReferencesImage, sceneReferencesThumbnail } from './lib/scenes'

/**
 * Hand out a one-shot URL the browser can POST a map or a token image to.
 *
 * DM-gated, and that gate is the point. An upload URL that anyone could ask for
 * is an open door onto the 1 GB of file storage ADR 0001 accepts, and this
 * repository is public — the deployment URL and the shape of this call are both
 * readable, so "nobody knows it is there" is not a defence. Requiring the DM code
 * means filling the quota needs the secret for a game, and the DM can delete
 * whatever appears.
 *
 * The game code is taken as well as the DM code, because a DM code only means
 * anything against the game it belongs to — `requireDm` has no notion of a code
 * that is valid everywhere.
 *
 * The URL itself is deliberately not tied to what it is for. A blob is inert until
 * `scenes.create` or `board.addToken` accepts it as a scene image or token art,
 * and those are where the size limit and the dimensions are checked.
 */
export const generateUploadUrl = mutation({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireDm(ctx, args.code, args.dmCode)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * What is still holding this blob, said in the DM's words — or `null` if nothing is.
 *
 * ⚠️ **One function per storage-id FIELD, not per table, and `storageGuard.test.ts` is
 * what makes that true rather than this list.** A map upload stores two blobs in two
 * columns of the same row, so a guard derived from the *table* name would have been
 * satisfied by `sceneReferencesImage` alone and let a thumbnail's bytes be deleted out from
 * under the picker. The guard now derives one predicate name per field and asserts each is
 * imported here and awaited; every entry below is a name it forces.
 *
 * Each question is asked *of the module that owns the table* rather than answered here, so
 * only a boolean ever crosses the boundary — `leakGuard.test.ts` greps the sources to keep
 * every read of the token tables inside `lib/board.ts`, and a `files.ts` that ran its own
 * query would be a second reader of a guarded table.
 *
 * The message names the row and the way to delete it, because the caller is a DM whose
 * client has mis-sequenced something and the useful answer is never *no*.
 */
async function referenceProblem(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  imageId: Id<'_storage'>,
): Promise<string | null> {
  if (await sceneReferencesImage(ctx, gameId, imageId)) {
    return 'That image is in use by a scene. Delete the scene instead.'
  }
  if (await sceneReferencesThumbnail(ctx, gameId, imageId)) {
    // Its own sentence rather than the one above, because the fix is genuinely different:
    // a DM whose *thumbnail* is being discarded has not mistaken which map is in play, they
    // have a client that lost track of which of two blobs it was tidying up.
    return 'That image is a map’s thumbnail. Delete the map instead.'
  }
  if (await tokenReferencesImage(ctx, gameId, imageId)) {
    return 'That image is in use by a token. Remove the token instead.'
  }
  if (await modalImageReferencesImage(ctx, gameId, imageId)) {
    return 'That image is in use by a handout. Delete the handout instead.'
  }
  // Not an image at all, which is why the predicate is named for a file — and why this
  // is the one refusal here where the blob being discarded could be ten megabytes.
  if (await trackReferencesFile(ctx, gameId, imageId)) {
    return 'That file is in use by a music track. Delete the track instead.'
  }
  return null
}

/**
 * Throw away a blob that never became anything — the other half of the upload,
 * called from the client's catch when `scenes.create` or `board.addToken` refuses
 * the file it just stored.
 *
 * It has to be a separate call, and that is not a design preference. A mutation is
 * a transaction, so a `ctx.storage.delete` on the way out of a handler that throws
 * is rolled back with the rest of it and the file survives — a rejecting mutation
 * cannot clean up after itself, however carefully it is written. This is the call
 * that commits, because it is the call that succeeds. Without it, a DM who has
 * filled their 25 scenes leaves a full-size map in storage on every further
 * attempt, counting against the 1 GB ceiling ADR 0001 accepts with nothing in the
 * app able to see it, let alone delete it.
 *
 * Deliberately idempotent: the error path it is called from may itself be retried,
 * and a second discard of the same blob should be a no-op rather than a second
 * error on top of the first.
 *
 * Refuses a blob anything still points at — a scene's background, a token's art, a handout
 * or a music track — so a wrongly-plumbed catch handler cannot blank the map out from under
 * the table, strip the art off a live token, delete the bytes of the image everybody is
 * looking at, or cut the music off mid-session. Being DM-gated bounds *who* can call this,
 * but it does not make the call correct: the DM's own client is what invokes it, from an
 * error path, with an id it may have mis-sequenced.
 *
 * ⚠️ **Every storage-id FIELD in the schema is asked, and that used to say every
 * *table*.** `referenceProblem` above is the list, and `storageGuard.test.ts` is what keeps
 * it true. The failure mode of forgetting one is silent until somebody's upload deletes
 * somebody else's file, and the schema says the same thing from the other end beside each
 * column that holds a blob.
 *
 * ⚠️ **IT TAKES AN ARRAY, BECAUSE ONE UPLOAD IS NOW TWO BLOBS.** A map arrives with a
 * thumbnail beside it, so the client's catch has two ids to clean up, and two calls would
 * be two transactions, two round trips and two chances for the second one to be skipped by
 * a `return` somebody added to the first one's error path. One call is one transaction: the
 * cleanup either happened or it did not, and there is no third state for a reader of
 * `useUpload.commit` to reason about.
 *
 * ⚠️ **A referenced id refuses the WHOLE call, and the tempting alternative is the bug.**
 * The obvious reading of *best effort* is to delete the ids that are free and quietly skip
 * the ones something still holds. Do not: the caller then cannot tell what happened, and
 * the id it most needs to know about — the one that is still referenced, which means its
 * sequencing is wrong — is the one it is told nothing about. Note that the transaction
 * makes the *outcome* of a mid-way throw identical either way; what is being chosen here is
 * that the caller finds out. A discard that is partly right is a discard nobody can debug.
 *
 * Bounded by `MAX_DISCARD_IDS`, so this cannot become a sweeper for a game's storage and so
 * the predicate sweep stays a bounded read — that constant carries both halves.
 *
 * Duplicates are collapsed before anything is asked. A caller that passed the same id twice
 * is not asking for a second delete, and the second one would throw a plain `Error` —
 * `deleteTokensInGame` in `lib/board.ts` documents that failure confirmed against a real
 * deployment.
 *
 * `scenes.remove`, `board.removeToken`, `modalImages.remove` and `music.remove` remain the
 * ways to delete a file that is genuinely in use, because they delete the thing using it in
 * the same transaction.
 */
export const discard = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    imageIds: v.array(v.id('_storage')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The DM code first, always. An open delete-by-id is a way to wipe another
    // table's maps, which is worse than the leak this exists to close.
    const game = await requireDm(ctx, args.code, args.dmCode)

    if (args.imageIds.length > MAX_DISCARD_IDS) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `A discard can name at most ${MAX_DISCARD_IDS} files.`,
      })
    }

    // Deliberately idempotent, and the filter is where that lives now: the error path this
    // is called from may itself be retried, so a blob that has already gone is a no-op
    // rather than a second error on top of the first. Doing it before the predicates also
    // means a retry costs no table reads at all, which is the common case.
    const present: Id<'_storage'>[] = []
    for (const imageId of new Set(args.imageIds)) {
      if ((await ctx.db.system.get('_storage', imageId)) !== null) present.push(imageId)
    }

    // Every question first, every delete after. See the ⚠️ above: interleaving them would
    // reclaim some bytes and refuse others in a transaction that then rolls the deletes
    // back anyway, so the only thing it could change is how much the caller has to guess.
    for (const imageId of present) {
      const problem = await referenceProblem(ctx, game._id, imageId)
      if (problem !== null) throw new ConvexError({ kind: 'BadInput', message: problem })
    }

    for (const imageId of present) {
      await ctx.storage.delete(imageId)
    }
    return null
  },
})
