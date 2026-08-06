import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
// The placement sweep, borrowed rather than rewritten: `tokenPositions` belongs to
// lib/board.ts and `leakGuard.test.ts` greps for anyone who forgets it. The import
// runs one way — lib/board.ts knows nothing about scenes as a table — so there is no
// cycle here, and `convex/scenes.ts` has paired these two calls since Milestone 2.
import { deleteScenePlacements } from './board'
// The fog sweep, paired with the placement sweep everywhere it appears. `fogRects` is
// keyed on the scene alone, so a scene's rectangles are unreachable the moment its row is
// gone — an orphaned rectangle is not a leak, it is litter nothing in the app can name.
import { deleteSceneFog } from './fog'
// The wall sweep, for the identical reason one line up: `walls` is keyed on the scene alone.
import { deleteSceneWalls } from './walls'
// The base vocabulary. A function of a string, like lib/layers.ts — the *decision* about
// whether a given token is hidden stays in lib/board.ts, behind invariant 8's choke point.
import { fogBaseOf, fogBaseValidator } from './fogBase'
import { MAX_FOG_RECTS_PER_SCENE, MAX_SCENES_PER_GAME } from './games'

// Lives in lib/limits.ts, which the browser imports too so there is one definition
// of it rather than one on each side. Brought through here because `scenes.create`
// is what enforces it, and this is where a reader looks for it.
export { MAX_SCENE_BYTES, MAX_THUMB_BYTES } from './limits'

/**
 * The grid a fresh scene starts with, guessed at 20 squares across the image.
 *
 * A guess is better than nothing on screen: the DM sees a grid immediately and
 * drags the square count until it lines up with the map, which is a correction
 * rather than a blank form. Most battle maps sit between 16 and 30 across.
 */
export const DEFAULT_SQUARES_ACROSS = 20

/**
 * What is painted around a map that has never been given a colour.
 *
 * A near-black rather than the near-white the shell used to paint, because that is what a
 * board actually wants: a lit map on a dark surround reads as a map on a table, and the
 * white one read as a map that had failed to load into a bigger white page. The DM can
 * pick anything.
 *
 * ⚠️ **A real colour and never `null`, which is what makes `backgroundOf` a total
 * function.** The alternative — letting absent mean *whatever the stylesheet was doing* —
 * puts the default in the CSS and the override in the database, so the two would have to
 * be kept in step by memory and a screenshot would be the only way to tell they had
 * drifted. One answer, from one accessor.
 */
export const DEFAULT_SCENE_BACKGROUND = '#111114'

/**
 * The colour painted around this map. **The only reader of the optional field.**
 *
 * The schema could not require it — see the note on the column — so this is where absent
 * becomes a value, exactly once. A row written before the field existed and a row whose
 * DM has never opened the picker are the same thing and get the same answer.
 */
export function backgroundOf(scene: Doc<'scenes'>): string {
  return scene.backgroundColour ?? DEFAULT_SCENE_BACKGROUND
}

/**
 * The DM's prep for this board. **The only reader of the optional field.**
 *
 * `backgroundOf`'s arrangement exactly, for a string whose "none" is empty rather than a
 * default worth naming. Absent and `''` would otherwise be two spellings of one meaning that
 * every consumer has to agree about, so `scenes.setNotes` stores neither — it *removes* the
 * column for a blank — and this is where the one remaining state becomes a value.
 */
export function notesOf(scene: Doc<'scenes'>): string {
  return scene.notes ?? ''
}

/**
 * Where this board sits in the DM's list. **The only reader of the optional field.**
 *
 * ⚠️ **Absent sorts LAST, which is why this is `Infinity` and not `0`.** Every scene in
 * every game has no order until the DM first reorders one, and a default of 0 would make the
 * first drag invert the untouched rows behind it — they would all still answer 0 and tie,
 * then break on `_creationTime`, *above* whatever the DM had just moved to position 1. A new
 * map belongs at the end, and `scenes.create` and `scenes.duplicate` both leave the column
 * absent rather than computing a number for it.
 *
 * The tie-break is `_creationTime`, so a game nobody has reordered reads back in upload
 * order — byte-identical to what `scenes.list` did before this field existed.
 */
export function orderOf(scene: Doc<'scenes'>): number {
  return scene.order ?? Number.POSITIVE_INFINITY
}

/**
 * The DM's order, or upload order for the scenes that have none.
 *
 * A comparator rather than a sort key, because two absent orders are both `Infinity` and
 * `Infinity - Infinity` is `NaN` — a comparator that returns `NaN` leaves the array in
 * whatever order the engine's sort happened to visit it in, which is the one failure mode
 * here that looks like a rendering bug rather than a comparison bug.
 */
export function compareScenes(a: Doc<'scenes'>, b: Doc<'scenes'>): number {
  const left = orderOf(a)
  const right = orderOf(b)
  if (left !== right) return left < right ? -1 : 1
  return a._creationTime - b._creationTime
}

// `fogBaseOf` is the sibling of `backgroundOf` above and deliberately does **not** live here.
// It takes the stored value rather than the document, in lib/fogBase.ts, because lib/board.ts
// has to ask the question and this module already imports *from* lib/board.ts — an accessor
// over `Doc<'scenes'>` would close that cycle. Its own docblock carries the argument.

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
  // Required *here* even though the column is optional, which is the point of a projection:
  // `backgroundOf` has already turned absent into a colour, so no client ever has to know
  // this field arrived late or what it would have meant if it were missing.
  backgroundColour: v.string(),
  // Same arrangement, and it matters more: `fogBaseOf` has already turned absent into `lit`,
  // so the browser never has to spell that default a second time. A client that had to write
  // `scene.fogBase ?? 'lit'` for itself is a client that can disagree with the server about
  // whether a map is covered, which is a map that lies.
  fogBase: fogBaseValidator,
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
    backgroundColour: backgroundOf(scene),
    fogBase: fogBaseOf(scene.fogBase),
  }
}

/**
 * The same scene, plus the three things **only the DM is ever sent**.
 *
 * ⚠️ **The split is the point, and it is CLAUDE.md invariant 1 rather than tidiness.**
 * `scenes.active` is ungated — it is the one board the whole table is looking at, so every
 * player subscribes to it — and it returns `publicSceneValidator`. Anything added to that
 * object is published to the table by construction. So the projection forks, and the fork
 * has exactly one consumer: `scenes.list`, which is DM-only and *throws* for anybody else.
 *
 * What that buys, field by field:
 *
 * - **`thumbnailUrl`** is not a secret at all; it is a second signed URL for a picture no
 *   player renders. On `publicSceneValidator` it would cost every client at the table a
 *   storage resolution per scene change for bytes nothing on their screen asks for.
 * - **`notes`** is the DM's prep. It is the reason this fork is not optional.
 * - **`order`** is only meaningful in a list nobody else receives.
 *
 * The three arrive over two commits and the fork was built for the first of them, which is
 * the right way round: a projection created *because* a secret needed somewhere to go is a
 * projection somebody has to notice. `scenes.test.ts` pins `publicSceneValidator`'s exact
 * key set against a real player payload for the same reason `games.list`'s test does — a
 * subtractive spec across two audiences only guarantees the fields it names.
 */
export const dmSceneValidator = publicSceneValidator.extend({
  /**
   * A small derivative of the map, or **the map itself** when there is not one.
   *
   * ⚠️ **The fallback is resolved here and never in the browser**, which is `backgroundOf`'s
   * discipline applied to a URL. A client writing `scene.thumbnailUrl ?? scene.imageUrl` is
   * a client that can disagree with the server about which picture a row shows, and there
   * would be two of them the moment a second surface drew a scene list. It is `null` only
   * when the map's own blob has gone, which `publicScene` already says must not be an error.
   */
  thumbnailUrl: v.union(v.string(), v.null()),
  /**
   * ⚠️ **THE FIELD THIS FORK EXISTS FOR.** Required here even though the column is optional,
   * which is the point of a projection: `notesOf` has already turned absent into `''`, so no
   * client has to know the column arrived late or spell the default a second time.
   */
  notes: v.string(),
  /**
   * Where this row sits in the list that was just sorted: **0…n-1, always, with no gaps.**
   *
   * ⚠️ **NOT `orderOf(scene)`, and the difference is the interesting part of this field.**
   * The stored column is optional and `orderOf` answers `Infinity` for an absent one — a
   * perfectly good float64 that Convex stores and transmits, and a nonsense thing to hand a
   * browser. It is also the wrong *question*: whether a row has been dragged is a storage
   * detail, and what a client can use is where the row came in the order the server already
   * computed. So this is the index, supplied by `scenes.list` after `listScenes` has sorted.
   *
   * That keeps the sort in exactly one place. A client that wanted to re-sort would need
   * `orderOf`'s absent-sorts-last rule restated by hand, which is the second implementation
   * `listScenes`' own note is written to prevent.
   */
  order: v.number(),
})

export type DmScene = Infer<typeof dmSceneValidator>

/** `position` is the row's index in the sorted list — see the ⚠️ on `order` above. */
export async function dmScene(
  ctx: QueryCtx,
  scene: Doc<'scenes'>,
  position: number,
): Promise<DmScene> {
  const base = await publicScene(ctx, scene)
  // Two `getUrl` calls only when there is genuinely a second blob. A scene uploaded before
  // thumbnails existed resolves exactly one, and hands the same string back twice.
  const thumbnailUrl =
    scene.thumbnailId === undefined ? null : await ctx.storage.getUrl(scene.thumbnailId)

  return {
    ...base,
    thumbnailUrl: thumbnailUrl ?? base.imageUrl,
    notes: notesOf(scene),
    order: position,
  }
}

/**
 * Every board in a game, **in the DM's order**.
 *
 * ⚠️ **The sort is here rather than in `scenes.list`, so there is one answer.** Four other
 * callers read this — two `…References…` predicates, the purge and `reorder`'s permutation
 * check — and none of them cares about order, which is exactly why putting the comparator in
 * the query would be safe today and wrong tomorrow: the second surface that lists scenes
 * would sort for itself, and the two would disagree the first time `orderOf`'s
 * absent-sorts-last rule was restated by hand. Twenty-five rows is a free sort.
 *
 * `Infinity` in the comparator is what a `v.number()` column can never hold, so it cannot
 * collide with a real order — see `orderOf`.
 */
export async function listScenes(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'scenes'>[]> {
  const scenes = await ctx.db
    .query('scenes')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_SCENES_PER_GAME)

  return scenes.sort(compareScenes)
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
 * Is this blob still a scene's **thumbnail**? The same question one column over.
 *
 * ⚠️ **A second function rather than a second `||` inside the one above, and this pair is
 * the whole reason `storageGuard.test.ts` was rewritten.** That guard used to derive one
 * predicate per *table*, so `scenes` already having `sceneReferencesImage` meant a second
 * blob column on the same table satisfied it with nothing asking about those bytes. It now
 * derives one per **field**, and this function is the name it forces.
 *
 * Widening `sceneReferencesImage` to look at both columns would have passed the old guard
 * *and* the new one — the derivation only asks that a predicate of that name exists and is
 * awaited — so the argument for two functions has to stand on its own, and it does. It is
 * `otherTokenReferencesImage`'s argument in `lib/board.ts` arriving for a different reason:
 * a predicate that answers about two columns cannot tell a caller *which* one held the
 * blob, and `replaceImage` needs exactly that. It repoints both columns at once and must
 * reclaim the old map and the old thumbnail independently, because a DM who replaced a map
 * with a blob the game happens to hold twice is a case that has to resolve per column.
 *
 * Rows with no thumbnail — every scene stored before the field existed — contribute
 * `undefined`, which is never equal to an id, so they cannot make this true by accident.
 */
export async function sceneReferencesThumbnail(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const scenes = await listScenes(ctx, gameId)
  return scenes.some((scene) => scene.thumbnailId === imageId)
}

/**
 * Is this blob the background of some **other** scene in the same game? So the delete
 * paths can stop short of reclaiming a map a duplicate is still drawing.
 *
 * ⚠️ **A sibling of `sceneReferencesImage` above and deliberately not a parameter on it.**
 * `otherTokenReferencesImage` in `lib/board.ts` spends a paragraph on exactly this and it
 * is the same paragraph here, one table over: the two answer different callers' questions
 * and the difference is exactly one row. `files.discard` asks *is anything using this?* and
 * needs `true` for the scene being examined — that is what makes it refuse to blank the map
 * out from under the table. A delete path asks *is anything **else** using this?* and needs
 * `false` for the row it is about to remove or repoint. Collapsing them into one function
 * with an optional `exclude` gives the discard guard an argument no caller ever wants to
 * pass, and which a future caller can get wrong in the one direction that blanks a live map.
 *
 * **The exclusion is what makes each call site correct, not the ordering.** `scenes.remove`
 * could be made to work by asking before the row write and leaning on read-your-writes; a
 * correctness property held by the order of two adjacent lines is the fragility this
 * codebase has already documented nearly shipping once. The `_id` comparison holds whichever
 * side of the write it runs.
 *
 * Takes the row rather than a `(gameId, sceneId)` pair, so the game comes off the document
 * and there is no way to ask the question about the wrong one. `imageId` stays a separate
 * argument because `replaceImage` asks about the **previous** blob, which is no longer the
 * one the row will hold.
 */
export async function otherSceneReferencesImage(
  ctx: QueryCtx,
  scene: Doc<'scenes'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const scenes = await listScenes(ctx, scene.gameId)
  return scenes.some((other) => other._id !== scene._id && other.imageId === imageId)
}

/**
 * The same question about the other column, for the same two callers.
 *
 * ⚠️ **Not folded into the one above, and the cross-column case is why rather than
 * symmetry.** A duplicate shares *both* of the original's blobs, so the two questions have
 * the same answer today — but they are asked about two ids, and `replaceImage` repoints both
 * columns at once and must reclaim each independently. A single predicate answering *does
 * any other scene point at this blob from either column?* would keep a map alive because
 * some scene happens to use those bytes as a thumbnail, which is a state a mis-sequenced
 * client can genuinely produce and which nothing else would ever notice.
 */
export async function otherSceneReferencesThumbnail(
  ctx: QueryCtx,
  scene: Doc<'scenes'>,
  imageId: Id<'_storage'>,
): Promise<boolean> {
  const scenes = await listScenes(ctx, scene.gameId)
  return scenes.some((other) => other._id !== scene._id && other.thumbnailId === imageId)
}

// ─── A SCENE'S FOG, COPIED AND RESCALED ─────────────────────────────────────────────────
//
// ⚠️ **THESE TWO READ AND WRITE `fogRects` FROM OUTSIDE `lib/fog.ts`, WHICH THAT MODULE'S
// HEADER SAYS IS THE ONLY READER. READ WHY BEFORE COPYING THE PATTERN.**
//
// That confinement is a **convention** and not a guard, and `lib/fog.ts` and
// `leakGuard.test.ts` both say so at length: a fog rectangle goes to every client verbatim,
// so its rows have no non-secret twin, there is no predicate for a choke point to be the home
// of, and an entry in the leak guard's table would be a guard that cannot fail. Nothing here
// is therefore a security exception — the two functions below leak nothing that `fog.list`
// does not already publish to the whole table.
//
// What they *are* is misfiled, honestly and on purpose. They belong beside `deleteSceneFog`,
// which is the same shape of thing — a scene-lifecycle sweep over rows keyed on a scene
// alone — and they are here because the fog-shape work is in flight on a parallel branch and
// a second author in that file is a merge conflict rather than a design. **Move them when it
// lands**, and take this comment with them.
//
// ⚠️ **AND THE THING THAT MOVE HAS TO FIX.** A `fogRects` row today is `x`, `y`, `width`,
// `height` — four numbers this file rescales and copies. The shape work adds polygons, which
// carry a `points` array, and **neither function below touches it**: a duplicated polygon
// would arrive with its points and no scaling, so `replaceImage` on a scene with polygons
// would leave every polygon at the old map's scale while every rectangle moved. That is not
// a guess left implicit — it is written here because the two commits cannot see each other,
// and the merge that brings them together is the one place somebody can fix it.

/**
 * Every rectangle on one scene, copied onto another. For `scenes.duplicate`.
 *
 * Bounded by `MAX_FOG_RECTS_PER_SCENE` on the read, which is also the bound on the write:
 * the source cannot hold more than the destination is allowed, so the copy cannot overrun a
 * limit the draw path enforces.
 *
 * Fields are spelled out rather than spread, for `copyTokenRow`'s reason in `lib/board.ts`:
 * a spread carries `_id` and `_creationTime` into an insert, and a rebuild is where a new
 * column silently fails to be copied — which is exactly the polygon trap named above.
 */
export async function copySceneFog(
  ctx: MutationCtx,
  fromSceneId: Id<'scenes'>,
  toSceneId: Id<'scenes'>,
): Promise<number> {
  const rows = await ctx.db
    .query('fogRects')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', fromSceneId))
    .take(MAX_FOG_RECTS_PER_SCENE)

  for (const row of rows) {
    await ctx.db.insert('fogRects', {
      sceneId: toSceneId,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      // ⚠️ **A field-by-field rebuild of a row with an optional field, which is the trap this
      // project has now met six times.** A polygon copied without its `points` becomes a
      // rectangle the size of its bounding box — silently, on a duplicate the DM made precisely
      // so they would not have to redraw anything.
      //
      // **Spread rather than `points: row.points`**, and that is the half `npm test` cannot
      // check: `undefined` is not a Convex value, so naming the field and giving it that is a
      // *different write* from omitting it, convex-test stores both happily, and only
      // `board-smoke.mjs` against a real deployment reports the difference as
      // `present on one side only`. `copyTokenRow` carries the same warning for the same reason.
      ...(row.points === undefined ? {} : { points: row.points }),
    })
  }
  return rows.length
}

/**
 * Multiply every rectangle on one scene by `k`. For `scenes.replaceImage`.
 *
 * A **uniform similarity transform**, which is the whole reason the mutation refuses an
 * aspect-ratio change: one factor through both axes keeps a shape snapped to the old grid
 * snapped to the new one, and two factors would shear every rectangle the DM drew against a
 * square.
 *
 * No renormalising on the way through. `normaliseFogRect` guarantees a non-negative extent
 * on the write path and `k` is positive, so a positive extent stays positive — a second
 * opinion about the stored shape here would be a second place for it to be wrong.
 */
export async function scaleSceneFog(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  k: number,
): Promise<number> {
  const rows = await ctx.db
    .query('fogRects')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_FOG_RECTS_PER_SCENE)

  for (const row of rows) {
    await ctx.db.patch('fogRects', row._id, {
      x: row.x * k,
      y: row.y * k,
      width: row.width * k,
      height: row.height * k,
      // ⚠️ **The polygon's vertices scale with its box, and forgetting them was the one thing
      // the merge of two parallel branches had to fix.** This function and `copySceneFog` were
      // written while the shape work was in flight elsewhere, when a `fogRects` row was four
      // numbers and nothing else — so a polygon would have kept its old-scale outline inside a
      // correctly-scaled bounding box, which is a shape that hides the wrong part of the map on
      // every screen and looks like a rendering bug from either chair.
      //
      // Spread rather than written as `points: (row.points ?? []).map(...)`, because `points` is
      // optional and absent means *rectangle*: patching an empty array onto one would turn every
      // rectangle on the map into a degenerate polygon, and `board-smoke.mjs`' key-set comparison
      // is what reports that as `present on one side only`.
      ...(row.points === undefined
        ? {}
        : { points: row.points.map((point) => ({ x: point.x * k, y: point.y * k })) }),
    })
  }
  return rows.length
}

/**
 * Every board in a game, with its placements and its background image. For the purge
 * tool in `convex/admin.ts`, and for nothing a client can reach.
 *
 * This is `scenes.remove` done once per row, minus the `activeSceneId` repair — the
 * game document pointing at these scenes is deleted in the same transaction, so
 * clearing the pointer first would be a write to a row on its way out. Everything
 * else that mutation does, this does, in the same order and for the same reasons.
 *
 * ⚠️ **The blob goes with the row** (CLAUDE.md invariant 6). A purge that dropped the
 * scenes and left the maps would be a worse leak than the games it cleaned up: a
 * 4 MB battle map belonging to a game that no longer exists is unreachable from every
 * screen in the app, and would sit against the 1 GB the free tier allows with nothing
 * able to name it, let alone delete it. `scenes.remove` says the same thing about one
 * scene; thirty-five smoke games' worth is the reason this tool is worth building
 * properly rather than deleting rows and moving on.
 *
 * It does **not** make the orphaned-blob sweeper unnecessary. That pass exists for
 * blobs a *refused or abandoned upload* left behind — a mutation that throws cannot
 * delete the file it just rejected, which is the whole reason `files.discard` is a
 * separate call — and those blobs never had a row to go with. Different residue.
 *
 * The placement sweep is very nearly always a no-op when the purge runs it, because
 * `deleteTokensInGame` has already taken every placement with its token. It is kept
 * because this helper has to be correct on its own terms — the game editor will reuse
 * it — and because the one placement it *would* find is the pathological one: a row
 * whose token had already vanished, which nothing else in the codebase would ever
 * reach again.
 *
 * ⚠️ **The fog sweep is not that, and it does real work every time.** Nothing else in a
 * purge touches `fogRects`: no token owns a rectangle and no character does, so a game
 * deleted without this line leaves every rectangle its DM ever drew behind, keyed on a
 * scene id that resolves to nothing. Cheap rows rather than blobs, so this is litter and
 * not the storage leak the image delete above prevents — but it is litter no query in the
 * application can ever reach again, which is the same reason `purgeGame` exists at all.
 *
 * ⚠️ **EACH DISTINCT BLOB IS DELETED EXACTLY ONCE, AND THIS FUNCTION IS THE ONE OF THE PAIR
 * THAT MUST *NOT* BE MADE CONDITIONAL.** The roadmap says both unconditional deletes "become
 * conditional in the same commit", and that is right for `scenes.remove` and wrong here, for
 * the two reasons `deleteTokensInGame` in `lib/board.ts` already wrote down about the tokens
 * milestone's identical pair:
 *
 * - **It would answer the wrong question.** A purge deletes *every* scene in the game, so
 *   *is another scene using this map?* is `true` for a duplicate that is also about to go.
 *   Asked per row it would keep the blob for ever, or work only by accident of the order the
 *   loop happens to run in.
 * - **It would be O(n²).** Twenty-five scenes would mean twenty-five range reads of
 *   twenty-five rows, to answer a question whose answer is known.
 *
 * So the conversion here is **deduplication**, and it is a stronger statement than
 * `scenes.remove`'s rather than a weaker one: the question that mutation asks is answered
 * *no* by construction for every id here, because no scene survives to own one.
 *
 * ⚠️ **This fixes a live bug rather than merely preparing for one, and it is the second time
 * this project has hit it.** The loop called `ctx.storage.delete` once per row, and a second
 * delete of the same id throws — confirmed against a real deployment on the token side:
 * `Error: storage id … not found`, a plain `Error` and not a `ConvexError`, so it aborts the
 * whole transaction. Before duplication nothing could produce two scenes sharing a blob;
 * from the moment one press can copy a map, a purge of any game containing a duplicate would
 * have failed outright and `admin.purgeGame` would have had no way to clean it up.
 *
 * **One set for both columns**, not one per column. A blob a mis-sequenced client stored as
 * one scene's map and another's thumbnail is exactly as undeletable-twice as a shared map.
 *
 * The two deletes are ordered rows-then-blobs, so a failure part-way leaves storage holding
 * bytes with no row — which the orphaned-blob sweeper is for — rather than rows pointing at
 * bytes that have gone, which nothing repairs.
 */
export async function deleteScenesInGame(ctx: MutationCtx, gameId: Id<'games'>): Promise<number> {
  const scenes = await listScenes(ctx, gameId)
  const blobs = new Set<Id<'_storage'>>()

  for (const scene of scenes) {
    await deleteScenePlacements(ctx, scene._id)
    await deleteSceneFog(ctx, scene._id)
    await deleteSceneWalls(ctx, scene._id)
    blobs.add(scene.imageId)
    // The derivative goes with the map. A thumbnail is small, which is exactly why
    // forgetting it would be invisible: 25 orphans a game is a few megabytes nothing in the
    // application can name, and no screen would ever be short a picture to say so.
    if (scene.thumbnailId) blobs.add(scene.thumbnailId)
    await ctx.db.delete('scenes', scene._id)
  }

  for (const imageId of blobs) {
    await ctx.storage.delete(imageId)
  }

  return scenes.length
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
    throw new ConvexError({
      kind: 'SceneNotFound',
      message: 'That scene is not in this game.',
    })
  }
  return scene
}
