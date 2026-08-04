// FOG OF WAR — the only module in `convex/` that reads or writes the `fogRects` table.
//
// ⚠️ **That confinement is a convention here rather than a guard, and the difference is
// worth being precise about, because every other "one module reads this table" note in this
// codebase means something stronger.** `lib/board.ts`, `lib/characters.ts` and `lib/feed.ts`
// are each enforced by `leakGuard.test.ts`, because each of their tables holds rows that are
// secrets *of the same shape as non-secrets* — a DM-layer token is type-identical to a
// player-layer one, so no `returns:` validator can tell them apart and only a choke point
// can.
//
// A fog rectangle is not like that. Every row goes to every client verbatim: a player has to
// see that a corridor is dark, or the feature is invisible and they simply wonder where the
// monsters went. There is no non-secret twin to be confused with and no predicate for this
// module to be the single home of, so an entry in that test's `GUARDS` table would assert a
// confinement protecting nothing — and `leakGuard.test.ts` says in as many words that this
// project does not keep guards that cannot fail. It would *pass*, which is exactly why
// omitting it has to be argued rather than left implicit.
//
// What is genuinely guarded is one step downstream. Turning these rectangles into a set of
// withheld token ids requires reading `tokenPositions`, and that read is confined to
// `lib/board.ts` by the existing entry, with no edit. So `foggedTokenIds` lives there and
// this module hands it geometry.
//
// ⚠️ **What would flip all of that:** per-player fog, reveal-as-you-walk, or line of sight.
// Any one of those makes a rectangle a statement about what *one caller* may know, at which
// point these rows become secrets of the same shape as non-secrets, this module becomes a
// real reader, and `fogRects` needs a `GUARDS` entry that day. It is named in that test's
// load check so that until then it is still swept against every table it must not read.

import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_FOG_RECTS_PER_SCENE } from './games'
import type { Rect } from './grid'

/**
 * The public shape of a fog rectangle — every stored field, because none of them is secret.
 *
 * The `_id` travels because `fog.erase` names one, and the DM's eraser is a click on a
 * rectangle it was sent. That is the whole reason rectangles are rows rather than a single
 * blob of geometry on the scene: erasing one is a delete of one document, rather than a
 * read-modify-write of an array that two DMs clicking at once would clobber.
 */
export const publicFogValidator = v.object({
  _id: v.id('fogRects'),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})
export type PublicFog = Infer<typeof publicFogValidator>

export const FOG_NOT_FOUND = {
  kind: 'FogNotFound',
  message: 'That fogged area is no longer on this map.',
}

/**
 * Top-left corner plus a non-negative extent, whichever way the drag went.
 *
 * ⚠️ **The single most important line in the fog feature, and the least interesting to
 * read.** A rubber-band gesture produces a rectangle in any of four directions, so three
 * quarters of all drags arrive with a negative width, a negative height, or both. Stored
 * unnormalised, `rectCovers` answers false for every point inside such a row — because the
 * far edge is *behind* the near one — and the result is fog that is drawn on every screen,
 * that the DM believes in, and that hides nothing at all.
 *
 * Normalised on the write path rather than on read, so there is one shape in the database
 * and every reader can trust it. Doing it on read would mean every future consumer of a
 * rectangle has to remember, and the one that forgets fails silently in the direction that
 * publishes a monster.
 */
export function normaliseFogRect(rect: Rect): Rect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
}

/**
 * The rectangles on one scene, as bare geometry. For `foggedTokenIds` in lib/board.ts.
 *
 * Returns `Rect`s rather than documents, which is the same narrow crossing every module
 * boundary in this codebase makes: `lib/board.ts` needs to ask "does this cover that point?"
 * and has no business holding a `Doc<'fogRects'>` it could accidentally project.
 */
export async function sceneFog(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<Rect[]> {
  const rows = await listFog(ctx, sceneId)
  return rows.map((row) => ({ x: row.x, y: row.y, width: row.width, height: row.height }))
}

/** The same rows projected for a client. For `fog.list`. */
export async function publicFog(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<PublicFog[]> {
  const rows = await listFog(ctx, sceneId)
  return rows.map((row) => ({
    _id: row._id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
  }))
}

async function listFog(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<Doc<'fogRects'>[]> {
  return await ctx.db
    .query('fogRects')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_FOG_RECTS_PER_SCENE)
}

/** How many rectangles this scene already has. For `fog.draw`'s bound check. */
export async function countFogOnScene(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<number> {
  return (await listFog(ctx, sceneId)).length
}

/**
 * One rectangle the caller named, or a throw.
 *
 * Unlike `TOKEN_NOT_FOUND` next door this refusal has no parity to maintain and no oracle to
 * protect: a rectangle a client can name is one it was sent, because every rectangle is sent
 * to everybody. So the message can be honest about what happened.
 */
export async function getFogRect(
  ctx: QueryCtx,
  fogId: Id<'fogRects'>,
): Promise<Doc<'fogRects'>> {
  const row = await ctx.db.get('fogRects', fogId)
  if (!row) throw new ConvexError(FOG_NOT_FOUND)
  return row
}

export async function insertFogRect(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  rect: Rect,
): Promise<Id<'fogRects'>> {
  const normalised = normaliseFogRect(rect)
  return await ctx.db.insert('fogRects', { sceneId, ...normalised })
}

export async function deleteFogRect(ctx: MutationCtx, fogId: Id<'fogRects'>): Promise<void> {
  await ctx.db.delete('fogRects', fogId)
}

/**
 * Every rectangle on one scene, gone. Returns the count, never a row — the same discipline
 * `deleteTokensInGame` keeps, and for the same reason: a sweep's receipt is a number a person
 * recognises, and a sweep that handed back documents would be a read path wearing a delete
 * path's name.
 *
 * Called by `fog.clear` and by the scene cascade, so deleting a map takes its fog with it the
 * way it already takes its placements.
 */
export async function deleteSceneFog(ctx: MutationCtx, sceneId: Id<'scenes'>): Promise<number> {
  const rows = await listFog(ctx, sceneId)
  for (const row of rows) await ctx.db.delete('fogRects', row._id)
  return rows.length
}
