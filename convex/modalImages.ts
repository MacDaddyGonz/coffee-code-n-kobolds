import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { MAX_MODAL_IMAGES_PER_GAME, findGameByCode, requireDm } from './lib/games'
import {
  MAX_MODAL_BYTES,
  getModalImageInGame,
  findModalImageInGame,
  listModalImages,
  publicModalImage,
  publicModalImageValidator,
  requireModalImageName,
} from './lib/modalImages'

/**
 * The handout the DM is holding up, and the one query on this table a player's client
 * may call.
 *
 * Open, and that is the whole feature rather than a relaxation: a handout reaches a
 * player exactly when the DM has decided it should, so the act of opening one *is* the
 * authorisation. Nothing is filtered on the way out because there is nothing here the
 * DM has not just chosen to publish.
 *
 * Returns null rather than throwing for an unknown code or a game with nothing open,
 * for `scenes.active`'s reason: this query renders a screen, and "nothing is up" is the
 * state every game sits in for almost all of its life.
 */
export const open = query({
  args: { code: v.string() },
  returns: v.union(publicModalImageValidator, v.null()),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game?.openImageId) return null

    // `remove` clears the pointer, so a dangling one should not exist — but a table
    // that sees no handout is a far better failure than one that throws in front of
    // everybody at once. This is the only query in the application every client at a
    // table subscribes to *and* that resolves a pointer somebody else can delete.
    const image = await findModalImageInGame(ctx, game._id, game.openImageId)
    if (!image) return null

    return await publicModalImage(ctx, image)
  },
})

/**
 * DM only, and it throws rather than returning an empty list.
 *
 * The same argument `scenes.list` makes, and it is worth restating because a handout
 * looks less like a secret than a map does: the names alone are the spoiler. `The
 * Duke's Real Face` sitting in a list tells the players what the next two hours hold,
 * and not rendering it on the client keeps it out of nothing — the payload is readable
 * and this repository is public. Players get `open`, which is the one image the DM has
 * chosen to show them.
 *
 * Throwing rather than answering emptily is deliberate too: only the DM's own panel
 * calls this, so an empty answer would hide a wrong-code bug behind a plausible-looking
 * "no handouts yet".
 */
export const list = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.array(publicModalImageValidator),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const images = await listModalImages(ctx, game._id)
    // Oldest first: Convex appends _creationTime to every index, so the list stays in
    // the order the DM uploaded rather than reshuffling on each render.
    return await Promise.all(images.map((image) => publicModalImage(ctx, image)))
  },
})

/**
 * Turn an uploaded blob into a handout.
 *
 * The client has already stored the file and holds its id, so this mutation's job is to
 * decide whether that blob is allowed to become one — which means every check here is
 * the real one, and the matching checks in the browser are a courtesy that saves an
 * upload rather than the enforcement (CLAUDE.md invariant 6). `scenes.create` is the
 * shape this follows, check for check, and the three are not interchangeable: the
 * missing blob catches a client that invented an id, the byte count catches a bypassed
 * or broken downscaler, and the per-game count is what makes `MAX_MODAL_BYTES` bound
 * anything at all — a ceiling with no count is not a limit on storage.
 *
 * Note what a rejection here cannot do: delete the blob it just refused. A mutation is
 * a transaction, so `ctx.storage.delete` on the way out of a throwing handler is rolled
 * back along with everything else. That is what `files.discard` is for, and
 * `useUpload.commit` is the caller that cannot forget it.
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
  returns: v.object({ modalImageId: v.id('modalImages') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const name = requireModalImageName(args.name)

    // Read from storage rather than taken as an argument, because the byte count is the
    // one fact about the upload the client cannot be trusted to report — it is the
    // client we are checking.
    const blob = await ctx.db.system.get('_storage', args.imageId)
    if (!blob) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That upload is no longer in storage. Try adding the image again.',
      })
    }
    if (blob.size > MAX_MODAL_BYTES) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `Handouts have to be under ${MAX_MODAL_BYTES / (1024 * 1024)} MB once shrunk. That one is bigger.`,
      })
    }

    // The list is read with a bound, so the write needs the matching one: a handout past
    // the read window could be opened to the table and then never be found again by the
    // panel that would let the DM close it.
    const existing = await listModalImages(ctx, game._id)
    if (existing.length >= MAX_MODAL_IMAGES_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_MODAL_IMAGES_PER_GAME} handouts.`,
      })
    }

    const modalImageId = await ctx.db.insert('modalImages', {
      gameId: game._id,
      name,
      imageId: args.imageId,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
    })

    // ⚠️ **Deliberately not opened on upload, and the contrast with `scenes.create` is
    // the reason to say so.** A first map goes straight onto the table because a game
    // with no board is unplayable and there is only one thing the DM can have meant. A
    // handout is a thing held up at a moment of the DM's choosing, and uploading one
    // during a session is ordinary preparation — putting it on everybody's screen the
    // instant it finished uploading would be the app choosing that moment for them.
    return { modalImageId }
  },
})

/**
 * Put a handout on everybody's screen.
 *
 * DM only — every client subscribes to `open`, so this is the one call that puts a
 * dialog in front of the whole table. `getModalImageInGame` is what stops a handout
 * from another game being pointed at through a code the caller does hold.
 *
 * One at a time by construction: `openImageId` is a single pointer, so showing a second
 * image replaces the first rather than stacking dialogs on top of each other.
 */
export const show = mutation({
  args: { code: v.string(), dmCode: v.string(), modalImageId: v.id('modalImages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const image = await getModalImageInGame(ctx, game._id, args.modalImageId)
    await ctx.db.patch('games', game._id, { openImageId: image._id })
    return null
  },
})

/**
 * Take it down, for everybody.
 *
 * Takes no image id and clears whatever is open, deliberately: the DM means "close it",
 * and an id argument would introduce a state where the wrong one is named and the
 * dialog stays up. Idempotent for the same reason — closing what is already closed is
 * the outcome the caller asked for, not an error.
 *
 * ⚠️ **This is not the only way a handout leaves a player's screen**, and the viewer
 * says why at length: a dismissal in one browser is local, so a DM who wanders off does
 * not leave the table staring at an image nobody can shift. This is the call that means
 * it for everyone.
 */
export const hide = mutation({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    await ctx.db.patch('games', game._id, { openImageId: undefined })
    return null
  },
})

/**
 * Delete a handout: the pointer at it, its blob, and the row — in that order.
 *
 * The pointer is cleared **first**, and it has to be. `open` resolves `openImageId` on
 * every client at the table, so deleting the row while the game still pointed at it
 * would leave a dangling pointer that only `open`'s null branch saves — and relying on
 * a defensive branch to produce the right screen is how that branch stops being
 * defensive. Clearing it also means the dialog closes for everybody as part of the
 * delete, which is what a DM deleting the image they are showing obviously meant.
 *
 * The blob goes with the row, in the same transaction. Nothing else can reach it once
 * the handout is gone, so leaving it behind would be a slow leak against the 1 GB
 * ceiling that no screen in the app could ever show.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), modalImageId: v.id('modalImages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const image = await getModalImageInGame(ctx, game._id, args.modalImageId)

    if (game.openImageId === image._id) {
      await ctx.db.patch('games', game._id, { openImageId: undefined })
    }

    await ctx.storage.delete(image.imageId)
    await ctx.db.delete('modalImages', image._id)
    return null
  },
})
