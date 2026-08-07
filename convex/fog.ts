import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  countFogOnScene,
  deleteFogRect,
  deleteSceneFog,
  fogShapeArgValidator,
  getFogRect,
  insertFogShape,
  publicFog,
  publicFogValidator,
} from './lib/fog'
import { fogActReveals, fogBaseOf } from './lib/fogBase'
import {
  MAX_FOG_RECTS_PER_SCENE,
  activeSceneId,
  findGameByCode,
  requireDm,
  resolveDmAccess,
  stampReveal,
} from './lib/games'
import { boundsOf, type Point, type Rect } from './lib/grid'
import { MAX_FOG_POLYGON_POINTS } from './lib/limits'
import { findSceneInGame, getSceneInGame } from './lib/scenes'

// WHERE THE MAP IS BLACKED OUT — the public surface over the `fogRects` table.
//
// **Reading fog is ungated and writing it is DM-only**, and that asymmetry is the whole of
// this module's design rather than something to infer from four `dmCode` arguments. Every
// rectangle goes to every client verbatim, because a blacked-out corridor *is* the feature:
// a player who cannot see that the corridor is dark does not experience suspense, they
// wonder where the monsters went and whether the app is broken. Drawing one, on the other
// hand, is a decision about what the table is allowed to know. lib/fog.ts carries the
// argument for why that makes these rows unlike a token row — and, more usefully, what
// would stop it being true.
//
// What is genuinely secret is whatever happens to be *standing* in a rectangle, and none of
// that is decided here: `foggedTokenIds` in lib/board.ts crosses these rows against
// `tokenPositions`, inside the choke point that already owns that table. So this file holds
// a gate, a bound and four numbers, and no predicate at all. There is nothing here that a
// `returns:` validator could get wrong, which is why the validators below are a projection
// and not a filter.
//
// ⚠️⚠️ **WHICH OF THESE WRITES WIDENS AN AUDIENCE DEPENDS ON THE SCENE'S BASE, AND THIS
// HEADER USED TO SAY OTHERWISE.** It read: *two of these four functions widen an audience and
// one narrows it, which is why `stampReveal` appears on `erase` and `clear` and deliberately
// not on `draw`.* That is true of a **lit** map and exactly backwards on a **dark** one, where
// a shape is a hole in the darkness — drawing one is the reveal and rubbing it out covers
// somebody back up. Every one of the three now asks `fogActReveals` in lib/fogBase.ts, which
// is the one place the inversion is written down, and none of them decides for itself.
//
// Uncovering a creature makes every feed line it has ever produced newly readable, and without
// the stamp those lines reach the client as *fresh* announcements — a session's worth of
// flourishes flying over the map at once, announcing a fight that finished ten minutes ago.

/**
 * Four numbers that describe a region of this map, or a refusal.
 *
 * ⚠️ **The finite half mirrors `requireFinite` in `convex/board.ts`.** That one is private
 * there, and could not have been reused even if it were exported: it takes a `Point`, and
 * half of what has to be checked here is an extent. The reasoning is that function's,
 * unchanged — a non-finite number arrives from a division by a grid size of zero rather
 * than from anything anyone typed, and convex-test does not apply Convex's own value
 * validation, so it commits happily in the suite and only misbehaves against a real
 * deployment.
 *
 * A non-finite *extent* is the worse of the two, and the reason this guard is not merely
 * tidiness. `rectCovers` fails **open** on a NaN (see lib/grid.ts, where that choice is
 * argued): the row is then fog that is drawn on every screen, that the DM believes in, and
 * that hides nothing whatever.
 *
 * The zero-area half looks like a usability refusal and is a data one. A rectangle with no
 * width covers no point, so it hides nothing — and there is nothing on screen to click, so
 * the DM cannot erase it either. It would sit on the scene for ever, counting against
 * MAX_FOG_RECTS_PER_SCENE, reachable only by clearing the whole map.
 *
 * A **negative** extent is not refused, and that is not an omission: three quarters of all
 * rubber-band drags produce one, and `normaliseFogRect` turns each into the rectangle the DM
 * actually dragged.
 *
 * Both halves are argument-only, so both are asked before any read — `board.moveToken`'s
 * rule, applied to a gesture that also arrives in a stream: a call that will be refused on
 * its arguments alone should cost no I/O to refuse.
 */
function requireDrawableRect(rect: Rect): void {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    throw new ConvexError({ kind: 'BadInput', message: 'That is not a region of this map.' })
  }
  if (rect.width === 0 || rect.height === 0) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'Drag out an area to fog. One with no width or height would hide nothing.',
    })
  }
}

/**
 * The other half of the same refusal, for the other gesture. **Beside `requireDrawableRect`
 * rather than folded into it**, because the two check different things and the pair of them
 * is what the union above buys — one function taking "four numbers or a point list" would be
 * the additive spelling `fogShapeArgValidator` exists to refuse, wearing a guard's name.
 *
 * Four clauses, and each is the rectangle guard's own reasoning applied to a point list:
 *
 * - **Finite.** `requireDrawableRect`'s paragraph, unchanged. A non-finite vertex poisons
 *   `boundsOf` — `Math.min` with a NaN is NaN — and `rectCovers` then fails *open* on the box,
 *   so the shape is drawn on every screen, the DM believes in it, and it hides nothing.
 *   convex-test does not apply Convex's own value validation, so this is the only thing
 *   standing between the suite and such a row.
 * - **At least three points.** The floor is a *grammar* rather than a courtesy: two points are
 *   a line, `boundsOf` gives it a zero extent in one axis, and the zero-area refusal below
 *   would catch it — but the message would talk about area when the problem is that a wall is
 *   not a region. Refused first, and named.
 * - **At most `MAX_FOG_POLYGON_POINTS`.** The cap's docblock carries the arithmetic: unbounded
 *   vertices is unbounded per-token CPU inside `visiblePositions`, which is the query on the
 *   drag path (CLAUDE.md invariant 2).
 * - **Non-degenerate bounds.** `requireDrawableRect`'s zero-area clause, asked of the box. A
 *   polygon whose points are all collinear covers no point, so it hides nothing — and there is
 *   nothing on screen to click, so the DM cannot rub it out either. It would sit on the scene
 *   for ever, counting against `MAX_FOG_RECTS_PER_SCENE`, reachable only by clearing the map.
 *
 * ⚠️ **Self-intersecting and concave polygons are deliberately NOT refused.** `polygonCovers`
 * is the even-odd rule, which answers a bowtie and a C-shaped corridor perfectly well, and a
 * DM tracing a cave wall produces both by accident. A validity check here would refuse a
 * gesture that works, for tidiness.
 *
 * Argument-only, so it is asked before any read — `board.moveToken`'s rule, and the same one
 * `requireDrawableRect` states.
 */
function requireDrawablePolygon(points: readonly Point[]): void {
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new ConvexError({ kind: 'BadInput', message: 'That is not a region of this map.' })
  }
  if (points.length < 3) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'A fogged shape needs at least three corners. Two would only be a line.',
    })
  }
  if (points.length > MAX_FOG_POLYGON_POINTS) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `A fogged shape can have at most ${MAX_FOG_POLYGON_POINTS} corners. Draw it as two shapes.`,
    })
  }

  const bounds = boundsOf(points)
  if (bounds.width === 0 || bounds.height === 0) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'Those corners are all in a line, so the shape would hide nothing.',
    })
  }
}

/**
 * Every rectangle on one scene. **Ungated** — see the header.
 *
 * Empty rather than thrown for every kind of unknown, in `board.positions`' register and for
 * a sharper version of that query's reason: the canvas subscribes to both of them together,
 * so a DM deleting the active scene mid-session leaves the pair holding a `sceneId` that no
 * longer resolves. One of them painting an empty board while the other threw would be the
 * worst of both answers.
 *
 * ⚠️ **A non-DM may only ask about the board in front of them.** That is `board.positions`'
 * guard repeated rather than borrowed, and it closes a *different* hole through the same
 * two-scene gap. There, naming a foreign scene would hand back placements filtered by the
 * wrong scene's rectangles; here it would hand back the rectangles themselves — which is a
 * room-by-room sketch of a map the party has not reached yet. Fog is not a secret on the
 * board everybody is looking at, and it is a rough floor plan of one they are not.
 *
 * It costs nothing in practice, exactly as it does next door: the canvas only ever passes
 * the active scene, and `scenes.list` is DM-only, so a player has no route to another
 * scene's id in the first place.
 */
export const list = query({
  args: { code: v.string(), sceneId: v.id('scenes'), dmCode: v.optional(v.string()) },
  returns: v.array(publicFogValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    // Checked against the game rather than trusted, so a scene id from another game cannot
    // be used to read that game's fog with this game's code. An empty answer for a foreign
    // scene leaks nothing — it is the absence of one.
    const scene = await findSceneInGame(ctx, game._id, args.sceneId)
    if (!scene) return []

    if (!isDm && scene._id !== activeSceneId(game)) return []

    return await publicFog(ctx, scene._id)
  },
})

/**
 * Black out a shape on the map — a rectangle, or a polygon.
 *
 * DM-gated, because deciding what the table can and cannot see is the DM's job.
 *
 * ⚠️ **The shape is a discriminated union rather than four numbers plus an optional point
 * list**, and `fogShapeArgValidator`'s docblock argues the alternative out at length: an
 * additive spelling accepts a call carrying *both*, and a handler that silently prefers one is
 * two states for one meaning on the write path where the wrong pick draws a shape that hides
 * nothing. The `switch` below is what the union bought — a `never` arm, so a third gesture
 * fails `npm run lint` here rather than reaching the database unchecked. There is a second in
 * `insertFogShape`, at the other place a wrong answer does damage.
 *
 * ⚠️ **A polygon's bounding box is not an argument and cannot be.** The four stored numbers
 * are `boundsOf`'s answer over the points the client sent, computed in the writer. That is the
 * one thing about this shape a client must not be trusted with, because the box is what every
 * containment test consults first.
 *
 * ⚠️ **On a lit map this narrows and on a dark one it widens**, so whether it stamps is
 * `fogActReveals`' answer rather than this handler's. It used to be the one mutation in this
 * file that never stamped, and under a covered base that would mean a DM opening a room full
 * of creatures the party has been fighting around gets no flourish at all — or worse, gets
 * every line at once whenever they next rub something out.
 *
 * The order is `board.moveToken`'s: the argument checks, then the game, then the scene, then
 * the bound, then the row. A DM sweeping out a dark corridor produces one of these per
 * gesture, so it is worth refusing a bad one before any of it costs a read.
 *
 * ⚠️ **The bound is a write check and not only a read bound**, which is the thing
 * `MAX_PLACEMENTS_PER_SCENE` next door to it deliberately is not. Nothing structural caps
 * rectangles — a small brush over one room is a dozen rows, and there is no reason the
 * evening stops there — so a scene past the read window would hold fog that hides tokens
 * from `foggedTokenIds` on some passes and not others, depending on which rows the `take`
 * happened to return. The refusal names both ways out, because "the map is full" with no
 * next step is a dead end in the middle of a session.
 */
export const draw = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    shape: fogShapeArgValidator,
  },
  returns: v.object({ fogId: v.id('fogRects') }),
  handler: async (ctx, args) => {
    const { shape } = args

    // Argument-first, before any read, and one `switch` for both kinds so the `never` arm
    // covers the whole gesture rather than one branch of it.
    switch (shape.kind) {
      case 'rect':
        requireDrawableRect(shape)
        break
      case 'polygon':
        requireDrawablePolygon(shape.points)
        break
      default: {
        const unknownKind: never = shape
        void unknownKind
        throw new ConvexError({
          kind: 'BadInput',
          message: 'That is not a shape this map holds.',
        })
      }
    }

    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    if ((await countFogOnScene(ctx, scene._id)) >= MAX_FOG_RECTS_PER_SCENE) {
      throw new ConvexError({
        kind: 'SceneFull',
        message: `This map already has ${MAX_FOG_RECTS_PER_SCENE} fogged areas. Cover it with one bigger rectangle, or clear the fog and start again.`,
      })
    }

    // Normalised — and, for a polygon, bounded — by the writer rather than here, so there is
    // one shape in the database and every reader can trust it. lib/fog.ts argues both.
    const fogId = await insertFogShape(ctx, scene._id, shape)
    if (fogActReveals('draw', fogBaseOf(scene.fogBase))) await stampReveal(ctx, game._id)
    return { fogId }
  },
})

/**
 * Rub one rectangle out — the eraser, and the moment the party walks into the room.
 *
 * The rectangle's scene is checked against this game, the way `board.setControllers` checks
 * every seat id it is handed: a `fogId` off the wire is routing rather than proof of
 * anything, and without this a rectangle belonging to another game could be erased with this
 * game's DM code, uncovering that table's ambush from outside it. The refusal that follows
 * names the scene rather than the rectangle, and that costs nothing here — a fog id a client
 * can name is one it was sent, because every rectangle is sent to everybody, so there is no
 * existence oracle to protect. `getFogRect` says the same thing about its own message.
 *
 * ⚠️ **`stampReveal`, and it is the reason this is more than a delete — on a lit map.**
 * Erasing fog there makes every earlier feed line belonging to whatever was standing in the
 * dark newly readable, and an unstamped game hands them to the client as *new*. The stamp is
 * what marks them as history.
 *
 * ⚠️ **On a dark map this is the covering write and must not stamp**, which is the single
 * easiest thing to get backwards in the fog base: rubbing out a reveal would otherwise replay
 * a session's worth of rolls across the map, which is the exact failure ADR 0012 built the
 * timestamp to prevent, arriving through the mechanism it built. `fogActReveals` is asked
 * rather than assumed. Coverage of that call is discipline rather than construction —
 * `feed.test.ts` asserts it per widening mutation **per base**, which is what makes this one
 * hard to forget in either direction.
 */
export const erase = mutation({
  args: { code: v.string(), dmCode: v.string(), fogId: v.id('fogRects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const rect = await getFogRect(ctx, args.fogId)
    // Read for its base as well as for the cross-game check now, which is the one extra cost
    // the inversion adds to this path — and it was already a point get, so it is free.
    const scene = await getSceneInGame(ctx, game._id, rect.sceneId)

    await deleteFogRect(ctx, rect._id)
    if (fogActReveals('erase', fogBaseOf(scene.fogBase))) await stampReveal(ctx, game._id)
    return null
  },
})

/**
 * Lift the fog off a whole scene: the end of an encounter, and the way out the bound's
 * refusal points at.
 *
 * One mutation rather than the client erasing rectangles in a loop, for the reason
 * `board.setControllers` is absolute: the DM means *this map is no longer dark*, and a loop
 * of two hundred calls is that intention spread across two hundred transactions, any of
 * which can be the last one. It also makes the receipt possible — `removed` is what
 * `deleteSceneFog` counted, so the panel can say what happened rather than assuming.
 *
 * ⚠️ **The `removed > 0` half is the one place this and `erase` differ.** There, `getFogRect`
 * has already proved a rectangle existed, so the write always changes something. Clearing a
 * scene that has no fog on it changes nothing at all, and stamping anyway would cost the
 * flourish on every line older than the click in exchange for a reveal that did not happen.
 *
 * ⚠️ **What this button *does* is a function of the base, and so is what it should be called.**
 * On a lit map it lifts the fog; on a dark one it takes every revealed area away and covers
 * the whole board. `FogTools` reads its label and its destructive confirm out of a
 * `Record<FogBase, …>` for that reason — a destructive confirm saying the opposite of what it
 * does is the worst copy bug available here.
 */
export const clear = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes') },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    const removed = await deleteSceneFog(ctx, scene._id)
    if (removed > 0 && fogActReveals('clear', fogBaseOf(scene.fogBase))) await stampReveal(ctx, game._id)
    return { removed }
  },
})
