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
// A fog shape is not like that. Every row goes to every client verbatim: a player has to
// see that a corridor is dark, or the feature is invisible and they simply wonder where the
// monsters went. There is no non-secret twin to be confused with and no predicate for this
// module to be the single home of, so an entry in that test's `GUARDS` table would assert a
// confinement protecting nothing — and `leakGuard.test.ts` says in as many words that this
// project does not keep guards that cannot fail. It would *pass*, which is exactly why
// omitting it has to be argued rather than left implicit.
//
// What is genuinely guarded is one step downstream. Turning these shapes into a set of
// withheld token ids requires reading `tokenPositions`, and that read is confined to
// `lib/board.ts` by the existing entry, with no edit. So `foggedTokenIds` lives there and
// this module hands it geometry.
//
// ⚠️ **A row here is a rectangle or a polygon, and the table is still called `fogRects`.**
// The name is history rather than a description — `convex/schema.ts` argues why renaming it
// is a two-deploy migration nothing about this table earns. Where the distinction matters the
// word in this file is *shape*.
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
import { boundsOf, type Point, type Rect, type Shape } from './grid'

/** A vertex, spelled once — the polygon's own points and the argument that draws one. */
const pointValidator = v.object({ x: v.number(), y: v.number() })

/**
 * The public shape of a fog shape — every stored field, because none of them is secret.
 *
 * ⚠️ **It matches the stored row 1:1, and that is the whole specification.** CLAUDE.md
 * invariant 8 is precise about what a `returns:` validator here does and does not do: this
 * table has no secret *field* to keep out and no secret *row* to be confused with a public
 * one, so the validator is a projection rather than a filter. What it is genuinely good for
 * is the direction that bit when polygons arrived — a stored `points` the projection had not
 * been taught about would reach the browser as a rectangle-shaped hole in a polygon-shaped
 * wall, painted at full confidence on every screen. So the rule for this object is that it
 * carries every column of `fogRects`, and a new column that does not appear here is a bug.
 *
 * The `_id` travels because `fog.erase` names one, and the DM's eraser is a click on a shape
 * it was sent. That is the whole reason these are rows rather than a single blob of geometry
 * on the scene: erasing one is a delete of one document, rather than a read-modify-write of
 * an array that two DMs clicking at once would clobber.
 */
export const publicFogValidator = v.object({
  _id: v.id('fogRects'),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  points: v.optional(v.array(pointValidator)),
})
export type PublicFog = Infer<typeof publicFogValidator>

/**
 * WHAT A CLIENT MAY ASK TO DRAW: a rectangle, or a polygon. **A discriminated union, and the
 * additive alternative was rejected rather than not considered.**
 *
 * The cheap version of this feature adds `points: v.optional(...)` beside the four numbers
 * that are already arguments and prefers whichever it finds. That call is then legal carrying
 * *both* spellings — four numbers and a point list that disagree with them — and the handler
 * silently picks one. Two states for one meaning, which is the failure
 * [ADR 0008](../../docs/adr/0008-one-shell-and-what-a-sheet-entry-is.md) settled, arriving on
 * the one write path where the wrong pick paints a shape on every screen that hides nothing.
 *
 * The union costs six call-site edits across four test suites and buys a `never` arm in
 * `fog.draw` and a second in `insertFogShape`. Two mechanical refusals, at the two places a
 * wrong answer does damage — the checker that would let an unknown kind past unvalidated, and
 * the writer that would store it — which is CLAUDE.md invariant 9's rule stated as *find the
 * place a wrong answer does damage* rather than as *every union gets an arm*.
 *
 * ⚠️ **The discriminator is on the argument and deliberately not on the row.** A stored shape
 * is asked whether it has a point list and either does or does not, which is the optional-field
 * convention invariant 9 settled; a *client* is stating which of two gestures it made, and
 * there the two shapes have no field in common at all.
 */
export const fogShapeArgValidator = v.union(
  v.object({
    kind: v.literal('rect'),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  v.object({
    kind: v.literal('polygon'),
    points: v.array(pointValidator),
  }),
)
export type FogShapeArg = Infer<typeof fogShapeArgValidator>

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
 * The shapes on one scene, as bare geometry. For `foggedTokenIds` in lib/board.ts.
 *
 * Returns `Shape`s rather than documents, which is the same narrow crossing every module
 * boundary in this codebase makes: `lib/board.ts` needs to ask "does this cover that point?"
 * and has no business holding a `Doc<'fogRects'>` it could accidentally project.
 *
 * ⚠️ **`points` travels by reference rather than being copied**, unlike on the write path
 * where `insertFogShape` copies it. That is the right way round: this array leaves a read and
 * is never mutated by anybody, and copying two hundred point lists on every execution of the
 * hottest query in the application to defend against a mutation nobody makes is the wrong
 * trade. The write path copies because it is crossing from a client's argument into the
 * database.
 */
export async function sceneFog(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<Shape[]> {
  const rows = await listFog(ctx, sceneId)
  return rows.map((row) => ({
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    points: row.points,
  }))
}

/**
 * The same rows projected for a client. For `fog.list`.
 *
 * `points` is spread in rather than assigned, which is `normaliseSheetEntry`'s idiom for an
 * optional field and is the same reason: absence and a key holding `undefined` are one
 * meaning, and this project spells it once — see the ⚠️ on `SheetEntry` in CLAUDE.md
 * invariant 9. A rectangle's payload is byte-identical to what it was before polygons.
 */
export async function publicFog(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<PublicFog[]> {
  const rows = await listFog(ctx, sceneId)
  return rows.map((row) => ({
    _id: row._id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    ...(row.points === undefined ? {} : { points: row.points }),
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

/**
 * Write one shape, of either kind. **The only writer**, and the only place the four stored
 * numbers are decided.
 *
 * ⚠️ **The `never` arm here is the second of the two `fog.draw` buys**, and it is not the same
 * refusal as the handler's. That one is the *checker*: a kind it has never heard of must not
 * reach a write unvalidated. This one is the *writer*: a kind it has never heard of must not
 * become a row. A third shape added to `fogShapeArgValidator` alone fails to compile in both
 * places, which is CLAUDE.md invariant 9's *find the place a wrong answer does damage* — and
 * there are two such places, so there are two arms.
 *
 * ⚠️ **The polygon's bounding box is computed here and cannot be supplied.** `boundsOf` runs
 * over the points the client sent; there is no argument on `fogShapeArgValidator`'s polygon
 * member that could carry a box, deliberately, so "the client got the box wrong" is not a
 * state this table can be in. That matters more than it sounds: the box is what every
 * containment test consults *first*, so a wrong one is a polygon that answers false for every
 * point inside it — fog drawn on every screen that hides nothing, which is exactly the failure
 * `normaliseFogRect` exists to prevent, arriving by a different route.
 *
 * The points are **copied** on the way in rather than stored by reference. Crossing from a
 * client's argument into the database is the one place in this module where that is worth the
 * allocation; `sceneFog` on the read side deliberately does not.
 */
export async function insertFogShape(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  shape: FogShapeArg,
): Promise<Id<'fogRects'>> {
  switch (shape.kind) {
    case 'rect':
      return await ctx.db.insert('fogRects', { sceneId, ...normaliseFogRect(shape) })
    case 'polygon': {
      const points: Point[] = shape.points.map((point) => ({ x: point.x, y: point.y }))
      return await ctx.db.insert('fogRects', { sceneId, ...boundsOf(points), points })
    }
    default: {
      const unknownKind: never = shape
      void unknownKind
      throw new ConvexError({ kind: 'BadInput', message: 'That is not a shape this map holds.' })
    }
  }
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
