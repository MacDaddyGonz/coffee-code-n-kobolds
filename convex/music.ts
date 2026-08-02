import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { MAX_MUSIC_TRACKS_PER_GAME, findGameByCode, requireDm } from './lib/games'
import {
  MAX_MUSIC_BYTES,
  findTrackInGame,
  getTrackInGame,
  listTracks,
  publicTrack,
  publicTrackValidator,
  requireTrackName,
} from './lib/music'

/**
 * The track the DM has put on the table, and the one music query a player's client may
 * ask for. Open, because a track the DM has chosen to play to the room is not a secret
 * from the room — the same reasoning that makes `scenes.active` open while `scenes.list`
 * is not.
 *
 * ⚠️ **This says *which* track and nothing about playback.** No client is told whether
 * anybody else is listening, how far through the track they are, or when it started,
 * because none of that is written down anywhere: each browser presses play for itself.
 * See the ⚠️ on `publicTrackValidator`, and note that the absence is load-bearing rather
 * than incidental — the moment a field here says a track is playing, this query is half of
 * the synced-playback milestone.
 *
 * Returns null rather than throwing for an unknown code or a game with nothing on: this
 * query paints a control in a header that is always on screen, and "no music" is a
 * legitimate state most games spend all evening in.
 */
export const current = query({
  args: { code: v.string() },
  returns: v.union(publicTrackValidator, v.null()),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game?.activeTrackId) return null

    // `remove` clears the pointer, so a dangling one should not exist — but a header
    // with no music in it is a far better failure than one that throws in front of the
    // whole table, which is what the finding rather than the getting form buys.
    const track = await findTrackInGame(ctx, game._id, game.activeTrackId)
    if (!track) return null

    return await publicTrack(ctx, track)
  },
})

/**
 * DM only, and it throws rather than returning an empty list — `scenes.list`'s argument,
 * verbatim, because it is the same argument.
 *
 * The names alone are the spoiler: `Dragon's Lair (loop)` sitting in a track list tells
 * the table exactly what the next two hours hold, and no amount of not rendering it on the
 * client keeps it out of a payload they can read. Players get `current` — the one track
 * that is on — which is the whole of what they need. Throwing rather than answering
 * emptily is deliberate too: only the DM's own panel calls this, so an empty answer would
 * hide a wrong-code bug behind a plausible-looking "no tracks yet".
 */
export const list = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.array(publicTrackValidator),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const tracks = await listTracks(ctx, game._id)
    // Oldest first: Convex appends _creationTime to every index, so the DM's list stays
    // in the order they uploaded rather than reshuffling on each render.
    return await Promise.all(tracks.map((track) => publicTrack(ctx, track)))
  },
})

/**
 * Turn an uploaded blob into a track.
 *
 * ⚠️ **This is where CLAUDE.md invariant 6 gets its sharpest test, and the difference from
 * `scenes.create` is worth stating rather than inheriting.** An image is checked three
 * times: the browser shrinks it, the browser measures the result, and the server measures
 * the stored blob. There is no lossless-enough transcode a browser can do to audio, so the
 * first of those does not exist here — `useUpload`'s music arm only *measures* the file —
 * and `blob.size > MAX_MUSIC_BYTES` below is therefore **the whole of the enforcement**
 * rather than the last of three. `MAX_MUSIC_BYTES` carries the long version.
 *
 * That sharpens the invariant rather than weakening it. It has always said that a limit
 * only the client applies is a limit a client bug removes; audio is the case where the
 * client was never applying one at all, so nothing is being trusted here that previously
 * was not.
 *
 * Note what a rejection here cannot do: delete the blob it just refused. A mutation is a
 * transaction, so `ctx.storage.delete` on the way out of a throwing handler is rolled back
 * along with everything else. Tidying up has to happen in a call that commits, which is
 * what `files.discard` is for; `useUpload.commit` calls it. That leak is a *ten megabyte*
 * one here rather than a map's four, which is the other half of why `discard` matters more
 * to this mutation than to the two it copies.
 */
export const create = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    name: v.string(),
    // `fileId` rather than `imageId`, unlike every other mutation taking a storage id.
    // The blob is not an image, the stored field says so deliberately, and the dialog
    // spends one line mapping `StoredUpload.imageId` onto it — which is the right place
    // for the mismatch to be visible.
    fileId: v.id('_storage'),
  },
  returns: v.object({ trackId: v.id('tracks') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const name = requireTrackName(args.name)

    // Read from storage rather than taken as an argument, because the byte count is the
    // one fact about the upload the client cannot be trusted to report — it is the client
    // we are checking.
    const blob = await ctx.db.system.get('_storage', args.fileId)
    if (!blob) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That upload is no longer in storage. Try adding the track again.',
      })
    }
    if (blob.size > MAX_MUSIC_BYTES) {
      throw new ConvexError({
        kind: 'BadInput',
        message:
          `Tracks have to be under ${MAX_MUSIC_BYTES / (1024 * 1024)} MB, and nothing here ` +
          'can shrink audio — that one needs a shorter loop or a lower bitrate.',
      })
    }

    // ⚠️ **Labelled honestly: this is the header the *browser* chose at upload time, and
    // nothing has read a byte of the file.** It catches a DM who picked the wrong thing
    // out of their downloads folder — a PDF, a screenshot — and it catches nothing else,
    // because a client that wants to send `audio/mpeg` over arbitrary bytes simply does.
    // The size check above is the check; this is a better error message.
    //
    // An *absent* content type is allowed through rather than refused. Some browsers hand
    // over an empty type for a format they do not recognise, and refusing a legitimate
    // track over a header nobody may rely on anyway would be spending a real refusal to
    // enforce a fake guarantee.
    if (blob.contentType && !blob.contentType.startsWith('audio/')) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That does not look like an audio file. Pick an MP3, an OGG or an M4A.',
      })
    }

    // The list is read with a bound, so the write needs the matching one: a track past the
    // read window could be put on the table and then never be found again by the panel
    // that would let the DM take it off.
    const existing = await listTracks(ctx, game._id)
    if (existing.length >= MAX_MUSIC_TRACKS_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_MUSIC_TRACKS_PER_GAME} tracks. Delete one first.`,
      })
    }

    const trackId = await ctx.db.insert('tracks', {
      gameId: game._id,
      name,
      fileId: args.fileId,
    })

    // ⚠️ **The first track does *not* become the active one, and the contrast with
    // `scenes.create` is deliberate rather than an inconsistency.** A game with no board
    // cannot be played, so making the first map active has exactly one possible answer and
    // asking the DM to pick it is a second step with no decision in it. Music is the
    // opposite: a game with no music is an ordinary game, and putting a track on is an act
    // at the table that reaches every client in it. Uploading three tracks before a
    // session should not start the third one's name appearing in everybody's header.
    return { trackId }
  },
})

/**
 * Put a track on the table, or take the music off. DM only — every client watches
 * `games.activeTrackId`, so this is the one call that changes what other people are
 * offered.
 *
 * ⚠️ **What it broadcasts is a pointer and nothing else.** It does not start anything, it
 * cannot start anything, and no field it writes says whether anybody is listening. Two
 * separate reasons, and both are worth keeping in view because losing either one is how
 * this becomes the wrong milestone:
 *
 *  - **Scope.** Synced play state — a shared playhead, a pause everybody feels — is the
 *    tools-and-polish milestone, and it needs a clock, a drift policy and an answer for
 *    the client that joins mid-track. None of that is here.
 *  - **The platform.** A browser will not begin audio without a user gesture in that
 *    browser. So even a mutation that *wanted* to start the music could not: every client
 *    would still be waiting for its own click, and the "playing" flag it wrote would be a
 *    lie on every screen where nobody had pressed anything.
 *
 * `null` clears it, which is why the argument is a union rather than an optional id: a
 * mutation that means "take the music off" should say so, and an absent argument means
 * "unchanged" in every other mutation in this codebase.
 */
export const select = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    trackId: v.union(v.id('tracks'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)

    if (args.trackId === null) {
      // `undefined` is how a Convex patch removes an optional field. Every client's
      // element loses its source and stops, which is the whole of what "off" means here.
      await ctx.db.patch('games', game._id, { activeTrackId: undefined })
      return null
    }

    const track = await getTrackInGame(ctx, game._id, args.trackId)
    await ctx.db.patch('games', game._id, { activeTrackId: track._id })
    return null
  },
})

/**
 * Delete a track: the row, the audio and the pointer at it.
 *
 * The blob goes in the same transaction, exactly as `scenes.remove` takes a map's image.
 * Nothing else can reach it once the row is gone, so leaving it behind would be a ten
 * megabyte leak against the 1 GB ceiling that no screen in the app could ever show.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), trackId: v.id('tracks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const track = await getTrackInGame(ctx, game._id, args.trackId)

    // Cleared rather than moved on to another track, for the reason `scenes.remove` gives
    // about the board: choosing what the table hears next is the DM's decision, and every
    // client would follow this one silently.
    if (game.activeTrackId === track._id) {
      await ctx.db.patch('games', game._id, { activeTrackId: undefined })
    }

    await ctx.storage.delete(track.fileId)
    await ctx.db.delete('tracks', track._id)
    return null
  },
})
