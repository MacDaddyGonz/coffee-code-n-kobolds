// WALLS — the only module in `convex/` that reads or writes the `walls` table.
//
// ⚠️ **That confinement is a convention here rather than a guard, and this file is the
// second in the codebase to have to say so.** `lib/board.ts`, `lib/characters.ts` and
// `lib/feed.ts` are each enforced by `leakGuard.test.ts`, because each of their tables
// holds rows that are secrets *of the same shape as non-secrets* — a DM-layer token is
// type-identical to a player-layer one, so no `returns:` validator can tell them apart and
// only a choke point can.
//
// A wall is not like that, and it is not like that for a stronger reason than a fog shape
// is. Every row goes to every client verbatim and it **has** to: the whole user-facing
// feature is a token that stops when it reaches a barrier, and a browser cannot stop a drag
// against geometry it has not been sent. There is no non-secret twin for a wall row to be
// confused with and there is no predicate for this module to be the single home of, so an
// entry in that test's `GUARDS` table would assert a confinement protecting nothing. It
// would *pass*, which is exactly why omitting it has to be argued rather than left
// implicit, and `leakGuard.test.ts` says in as many words that this project does not keep
// guards that cannot fail. `./lib/walls.ts` is named in that test's **load check** instead,
// beside `./lib/fog.ts` and `./bestiary.ts`, so that until the argument changes it is still
// swept against every table it must not read.
//
// ⚠️ **And there is nothing one step downstream either, which is where the parallel with
// fog stops.** `lib/fog.ts` hands geometry to `foggedTokenIds`, which crosses it against
// `tokenPositions` to decide what a player is *sent* — that read is the guarded thing, and
// it is guarded by the existing first row. A wall crosses nothing. It is consulted by one
// mutation deciding whether a write it was asked to make may proceed, and the answer
// changes no payload, withholds no row and hides no field. **Invariant 1 does not enter at
// all.**
//
// ⚠️ **WHAT WOULD FLIP ALL OF THAT, and this milestone is specified so it does not.**
// Roll20's barriers do two jobs — they stop movement and they block *sight*. What ships
// here is the movement half alone. Line of sight, per-player fog and reveal-as-you-walk
// each make a stored line a statement about what **one caller** may know, at which point
// these rows become secrets of the same shape as non-secrets, this module becomes a real
// reader, and `walls` needs a `GUARDS` entry and a predicate that day. That is the same
// sentence `lib/fog.ts` ends on, and the two tables would arrive at it together.

import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_WALLS_PER_SCENE } from './games'
import type { Point } from './grid'

/** A vertex, spelled once — the stored points and the argument that draws them. */
const pointValidator = v.object({ x: v.number(), y: v.number() })

/**
 * The public shape of a wall — every stored field, because none of them is secret.
 *
 * ⚠️ **It matches the stored row 1:1, and that is the whole specification**, exactly as
 * `publicFogValidator` is. CLAUDE.md invariant 8 is precise about what a `returns:`
 * validator does here: this table has no secret field to keep out and no secret row to be
 * confused with a public one, so the validator is a projection rather than a filter.
 *
 * What it is genuinely good for is the direction that bit fog when polygons arrived — a
 * stored column the projection had not been taught about. Here that failure is sharper than
 * a mis-drawn shape: the browser refuses a drag against the geometry in *this* payload, so a
 * column missing from it is a barrier the server enforces and the client has never heard of.
 * The token would jump to the wall on the drop and spring back with a refusal nobody can
 * see the cause of. So the rule for this object is that it carries every column of `walls`,
 * and a new column that does not appear here is a bug.
 *
 * The `_id` travels because `walls.remove` names one, and the DM's eraser is a click on a
 * line it was sent. That is the whole reason these are rows rather than one blob of
 * geometry on the scene: rubbing one out is a delete of one document, rather than a
 * read-modify-write of an array that two DMs clicking at once would clobber.
 */
export const publicWallValidator = v.object({
  _id: v.id('walls'),
  points: v.array(pointValidator),
})
export type PublicWall = Infer<typeof publicWallValidator>

/**
 * A wall a client named that is not there.
 *
 * Unlike `TOKEN_NOT_FOUND` next door this refusal has no parity to maintain and no oracle to
 * protect: a wall a client can name is one it was sent, because every wall is sent to
 * everybody. So the message can be honest about what happened. `FOG_NOT_FOUND` says the same
 * thing about its own wording, for the same reason.
 */
export const WALL_NOT_FOUND = {
  kind: 'WallNotFound',
  message: 'That wall is no longer on this map.',
}

/**
 * The refusal a blocked move gets. **Its own kind, and deliberately not `TOKEN_NOT_FOUND`.**
 *
 * ⚠️ **A wall is not an existence oracle, which is what makes an honest message safe here
 * and unsafe one function over.** `requireMovableToken` collapses three different failures
 * into one *not found* precisely because telling them apart would confirm that a GM-layer
 * coin exists. Nothing of the sort applies to a barrier: every wall on the scene is already
 * in this caller's payload, drawn or not, so a refusal naming one confirms something they
 * were sent. There is nothing to enumerate.
 *
 * And the inverse would be actively worse — ADR 0012's argument, reused. Answering *no such
 * token* about a coin the player is looking at on their own screen is a lie that reads as a
 * bug, and the player retries, reloads and reports the board as broken. A sentence naming
 * the wall is the only answer that leaves them able to act on it.
 */
export const WALL_BLOCKS = {
  kind: 'WallBlocks',
  message: 'There is a wall across that path.',
}

/**
 * The walls on one scene, as bare geometry. For the barrier check in `convex/board.ts` and
 * for nothing else.
 *
 * Returns point lists rather than documents, which is the same narrow crossing every module
 * boundary in this codebase makes — `sceneFog` next door states it: the caller needs to ask
 * "does this path cross any of these?" and has no business holding a `Doc<'walls'>` it could
 * accidentally project.
 *
 * ⚠️ **The arrays travel by reference rather than being copied**, exactly as `sceneFog`'s do
 * and for that function's reason: this array leaves a read and is never mutated by anybody.
 * `insertWall` on the write path copies, because that one is crossing from a client's
 * argument into the database.
 */
export async function sceneWalls(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<Point[][]> {
  const rows = await listWalls(ctx, sceneId)
  return rows.map((row) => row.points)
}

/** The same rows projected for a client. For `walls.list`. */
export async function publicWalls(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<PublicWall[]> {
  const rows = await listWalls(ctx, sceneId)
  return rows.map((row) => ({ _id: row._id, points: row.points }))
}

/**
 * Every wall row on one scene, bounded.
 *
 * Exported, unlike `listFog` next door, because the bound is the interesting part and three
 * callers in this file want the rows rather than a projection of them. Nothing outside this
 * module calls it, and nothing should: the two shapes that leave here are bare geometry and
 * a public projection.
 */
export async function listWalls(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<Doc<'walls'>[]> {
  return await ctx.db
    .query('walls')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_WALLS_PER_SCENE)
}

/** How many walls this scene already has. For `walls.add`'s bound check. */
export async function countWallsOnScene(ctx: QueryCtx, sceneId: Id<'scenes'>): Promise<number> {
  return (await listWalls(ctx, sceneId)).length
}

/** One wall the caller named, or a throw. See `WALL_NOT_FOUND` for why it can be honest. */
export async function getWall(ctx: QueryCtx, wallId: Id<'walls'>): Promise<Doc<'walls'>> {
  const row = await ctx.db.get('walls', wallId)
  if (!row) throw new ConvexError(WALL_NOT_FOUND)
  return row
}

/**
 * Write one wall. **The only writer.**
 *
 * The points are **copied** on the way in rather than stored by reference. Crossing from a
 * client's argument into the database is the one place in this module where that is worth
 * the allocation; `sceneWalls` on the read side deliberately does not — `insertFogShape`
 * splits the same way and states the same reason.
 *
 * ⚠️ **Nothing is normalised, and the contrast with `normaliseFogRect` is worth a sentence
 * because that function is the most important line in the fog feature.** A rubber band
 * produces a rectangle in any of four directions, three quarters of which store an extent
 * that silently covers nothing — so fog has to be canonicalised on the way in. A polyline
 * has no such degenerate spelling: the vertices are the wall, in the order they were
 * clicked, and a segment intersection test has no opinion about direction. There is nothing
 * here to get backwards, which is why there is nothing here to normalise.
 */
export async function insertWall(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  points: readonly Point[],
): Promise<Id<'walls'>> {
  return await ctx.db.insert('walls', {
    sceneId,
    points: points.map((point) => ({ x: point.x, y: point.y })),
  })
}

export async function deleteWall(ctx: MutationCtx, wallId: Id<'walls'>): Promise<void> {
  await ctx.db.delete('walls', wallId)
}

/**
 * Every wall on one scene, gone. Returns the count, never a row — `deleteSceneFog`'s
 * discipline and `deleteTokensInGame`'s before it: a sweep's receipt is a number a person
 * recognises, and a sweep that handed back documents would be a read path wearing a delete
 * path's name.
 *
 * Called by `walls.clear` and by the scene cascade, so deleting a map takes its barriers
 * with it the way it already takes its fog and its placements. Without that line a deleted
 * scene leaves rows keyed on an id that resolves to nothing — litter no query in the
 * application can ever reach again, which is `deleteScenesInGame`'s own argument for
 * sweeping fog.
 */
export async function deleteSceneWalls(ctx: MutationCtx, sceneId: Id<'scenes'>): Promise<number> {
  const rows = await listWalls(ctx, sceneId)
  for (const row of rows) await ctx.db.delete('walls', row._id)
  return rows.length
}
