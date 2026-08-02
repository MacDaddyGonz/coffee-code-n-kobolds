import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_SCENE_NAME_LENGTH } from './codes'
import { MAX_MUSIC_TRACKS_PER_GAME } from './games'
import { requireText } from './names'

// Lives in lib/limits.ts, which the browser imports too so there is one definition of
// it rather than one on each side. Brought through here because `music.create` is what
// enforces it, and this is where a reader looks for it — the same arrangement
// `lib/scenes.ts` makes for MAX_SCENE_BYTES.
export { MAX_MUSIC_BYTES } from './limits'

/**
 * The only shape of a track a query may return.
 *
 * `fileId` is deliberately absent for `publicSceneValidator`'s reason: a raw storage id
 * is useless to a browser and the signed URL is what it actually needs, so resolving it
 * here means no client has to know that Convex file storage exists. It is `url` rather
 * than `imageUrl` because it is not an image, which is the same distinction the stored
 * field's name makes.
 *
 * ⚠️ **Nothing in this payload says anything about *playback*, and the omission is the
 * feature rather than an oversight.** There is no `playing`, no position, no `startedAt`
 * and no listener count, because nothing anywhere records any of them: `music.select`
 * broadcasts *which track* and each client presses play for itself. Synced play state is
 * a later milestone, and a browser will not start audio without a user gesture in any
 * case — so a field here saying a track was playing would be a claim this application
 * cannot make true. Adding one is not a small extension of this payload; it is half of
 * that milestone, arriving without its argument.
 *
 * **The name is published to everybody, and that is a decision.** A track the DM has put
 * on the table is one they have chosen to play to the room, so its name reaches the room
 * — exactly as `publicSceneValidator` publishes the active board's name. The names of the
 * tracks they have *not* chosen are a different matter, which is why `music.list` is
 * DM-only on `scenes.list`'s spoiler argument.
 */
export const publicTrackValidator = v.object({
  _id: v.id('tracks'),
  name: v.string(),
  url: v.union(v.string(), v.null()),
})

export type PublicTrack = Infer<typeof publicTrackValidator>

/**
 * `url` is null when the blob has gone — a file deleted out from under the row, which
 * should not happen and must not take the header down with it. `MusicControl` renders the
 * name with a disabled button and says the file is missing, which is a state a DM can
 * recognise and delete; a throw from a query every client in the game subscribes to is
 * not.
 */
export async function publicTrack(ctx: QueryCtx, track: Doc<'tracks'>): Promise<PublicTrack> {
  return {
    _id: track._id,
    name: track.name,
    url: await ctx.storage.getUrl(track.fileId),
  }
}

/**
 * Insisting on a name is `requireSceneName`'s argument one table over: the DM picks
 * between tracks by name in a list nobody else can see, and three rows called
 * `track_02_final` is a list that cannot be used.
 *
 * It borrows the scene-name limit rather than inventing a sixth number for the client to
 * have to know about — the same borrowing `requireTokenAppearance` does from the
 * character-name limit, and for the same reason: a label on a DM-only row is a label on a
 * DM-only row.
 */
export function requireTrackName(raw: string): string {
  return requireText(raw, {
    max: MAX_SCENE_NAME_LENGTH,
    blank: 'Give the track a name.',
    tooLong: `Keep the track name to ${MAX_SCENE_NAME_LENGTH} characters or fewer.`,
  })
}

export async function listTracks(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'tracks'>[]> {
  return await ctx.db
    .query('tracks')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_MUSIC_TRACKS_PER_GAME)
}

/**
 * Is this blob still a track's audio? The third half of `files.discard`'s refusal, stated
 * as a predicate so that call reads as one question asked of every table holding a storage
 * id rather than a list walk here and a helper call there.
 *
 * ⚠️ Every table with a `v.id('_storage')` in it owes `files.discard` one of these — see
 * the note on `tracks` in `convex/schema.ts`. Without it a good-citizen discard from a
 * mis-sequenced error path deletes the bytes out from under a track the table is listening
 * to, and the row survives pointing at nothing.
 */
export async function trackReferencesFile(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  fileId: Id<'_storage'>,
): Promise<boolean> {
  const tracks = await listTracks(ctx, gameId)
  return tracks.some((track) => track.fileId === fileId)
}

/**
 * Every track in a game, with its audio. For the purge tool in `convex/admin.ts`, and for
 * nothing a client can reach.
 *
 * This is `music.remove` done once per row, minus the `activeTrackId` repair —
 * `deleteScenesInGame` skips the matching `activeSceneId` repair for the same reason: the
 * game document pointing at these rows is deleted in the same transaction, so clearing the
 * pointer first would be a write to a row on its way out.
 *
 * ⚠️ **The blob goes with the row** (CLAUDE.md invariant 6), and music is where that costs
 * the most per row of anything in this schema. A track is up to `MAX_MUSIC_BYTES` — ten
 * times a token's ceiling and two and a half times a map's — so a purge that dropped the
 * rows and left the audio would be the largest storage leak this application is capable
 * of, sitting against the 1 GB the free tier allows with nothing in the app able to name
 * it. `npm run prune-games` exists to keep that arithmetic true.
 */
export async function deleteTracksInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const tracks = await listTracks(ctx, gameId)
  for (const track of tracks) {
    await ctx.storage.delete(track.fileId)
    await ctx.db.delete('tracks', track._id)
  }
  return tracks.length
}

/**
 * Loads a track and checks it belongs to the game the caller named, exactly as
 * `findSceneInGame` does for scenes: a track id off the wire is routing, so this stops one
 * from another game being put on this table or deleted through a code the caller does
 * hold.
 *
 * Returns null for an unknown track or one in another game — for queries, which render a
 * header with no music in it rather than an error.
 */
export async function findTrackInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  trackId: Id<'tracks'>,
): Promise<Doc<'tracks'> | null> {
  const track = await ctx.db.get('tracks', trackId)
  if (!track || track.gameId !== gameId) return null
  return track
}

/** Throws instead — for mutations, where there is nothing to render. */
export async function getTrackInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  trackId: Id<'tracks'>,
): Promise<Doc<'tracks'>> {
  const track = await findTrackInGame(ctx, gameId, trackId)
  if (!track) {
    throw new ConvexError({ kind: 'TrackNotFound', message: 'That track is not in this game.' })
  }
  return track
}
