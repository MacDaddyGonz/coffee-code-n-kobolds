import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { tokenReferencesImage } from './lib/board'
import { requireDm } from './lib/games'
import { sceneReferencesImage } from './lib/scenes'

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
 * Refuses a blob anything still points at — a scene's background or a token's art —
 * so a wrongly-plumbed catch handler cannot blank the map out from under the table
 * or strip the art off a live token. Being DM-gated bounds *who* can call this, but
 * it does not make the call correct: the DM's own client is what invokes it, from an
 * error path, with an id it may have mis-sequenced.
 *
 * The token half is asked as a question of `lib/board.ts` rather than answered here,
 * because every read of the token tables belongs in that module and the leak guard
 * greps these sources to prove it. Only a boolean crosses the boundary.
 * `scenes.remove` and `board.removeToken` remain the ways to delete a file that is
 * genuinely in use, because they delete the thing using it in the same transaction.
 */
export const discard = mutation({
  args: { code: v.string(), dmCode: v.string(), imageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The DM code first, always. An open delete-by-id is a way to wipe another
    // table's maps, which is worse than the leak this exists to close.
    const game = await requireDm(ctx, args.code, args.dmCode)

    const blob = await ctx.db.system.get('_storage', args.imageId)
    if (!blob) return null

    if (await sceneReferencesImage(ctx, game._id, args.imageId)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That image is in use by a scene. Delete the scene instead.',
      })
    }
    if (await tokenReferencesImage(ctx, game._id, args.imageId)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That image is in use by a token. Remove the token instead.',
      })
    }

    await ctx.storage.delete(args.imageId)
    return null
  },
})
