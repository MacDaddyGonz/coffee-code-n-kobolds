import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  MAX_WALLS_PER_SCENE,
  MAX_WALL_POINTS,
  activeSceneId,
  findGameByCode,
  requireDm,
  resolveDmAccess,
} from './lib/games'
import { boundsOf, type Point } from './lib/grid'
import { findSceneInGame, getSceneInGame } from './lib/scenes'
import {
  countWallsOnScene,
  deleteSceneWalls,
  deleteWall,
  getWall,
  insertWall,
  publicWallValidator,
  publicWalls,
} from './lib/walls'

// WHERE A TOKEN MAY NOT WALK — the public surface over the `walls` table.
//
// **Reading walls is ungated and writing them is DM-only**, which is `convex/fog.ts`'s
// asymmetry arriving for a second table and for a *stronger* reason. Fog is sent to
// everybody because a player who cannot see that a corridor is dark wonders whether the app
// is broken. A wall is sent to everybody because the browser is where the feature lives: the
// token slides up to the barrier and stops, which cannot happen in a client that has not
// been handed the geometry. Drawing one, on the other hand, is a decision about the shape of
// the map, and that is the DM's. lib/walls.ts carries the argument for why that makes these
// rows unlike a token row — and, more usefully, what would stop it being true.
//
// ⚠️⚠️ **THERE IS NO `stampReveal` ANYWHERE IN THIS FILE, AND ITS ABSENCE IS A DECISION
// RATHER THAN AN OVERSIGHT.** Every mutation in `convex/fog.ts` has to ask `fogActReveals`
// whether it has just widened an audience, because a fog shape decides who is *sent* a
// position row, a health band and a feed line — so rubbing one out makes a session's worth
// of rolls newly readable and, unstamped, replays them across the map. A wall withholds
// nothing. Drawing one, rubbing one out and clearing every one of them change no payload
// that any client receives, so there is no audience to widen and nothing to mark as history.
// A stamp here would be a flourish retired for a press that revealed nobody.
//
// Which is the same fact as the one above it: this file holds a gate, two bounds and a
// point list, and **no predicate at all**. There is nothing here a `returns:` validator
// could get wrong, which is why the validator below is a projection and not a filter.
//
// The barrier check itself is deliberately not in this file. It lives at the one call site
// that needs it, in `board.moveToken`, `&&`-ed beside the layer and control rules rather
// than folded into `requireMovableToken` — see that function's docblock, whose argument
// against a `fogRects` read on a handler that runs ten times a second applies here word for
// word.

/**
 * Two or more finite vertices that describe a line on this map, or a refusal.
 *
 * `requireDrawablePolygon`'s four clauses next door, restated for a shape that is a path
 * rather than a region — and the third of them inverts, which is the whole reason this is a
 * second function rather than a shared one:
 *
 * - **Finite.** `requireDrawableRect`'s paragraph, unchanged in substance and changed in
 *   consequence. A non-finite vertex makes every comparison in `segmentsIntersect` false, so
 *   the wall silently blocks nothing — a barrier drawn on the DM's screen that the party
 *   walks straight through, which is `normaliseFogRect`'s failure mode exactly, arriving at
 *   a third door. convex-test does not apply Convex's own value validation, so this is the
 *   only thing standing between the suite and such a row.
 * - **At least two points.** A grammar rather than a courtesy: one point is not a line, has
 *   no segment and blocks nothing. `MAX_WALL_POINTS`' docblock carries it.
 * - **At most `MAX_WALL_POINTS`.** The cap's docblock carries the arithmetic.
 * - ⚠️ **Non-degenerate bounds, and the test is `&&` where fog's is `||`.** A fog shape with
 *   a zero extent in *either* axis covers no point, so `requireDrawablePolygon` refuses it.
 *   A wall with a zero extent in one axis is the commonest wall there is — a vertical line
 *   has no width, a horizontal one has no height — so refusing on `||` here would refuse
 *   every barrier drawn along a grid line, which is nearly all of them. What is degenerate
 *   is a wall with zero extent in **both**: every vertex in one place, no length, nothing to
 *   cross and nothing on screen to click, sitting on the scene for ever counting against the
 *   cap. This is the single easiest clause in the milestone to copy across wrong, and it
 *   fails in the direction where the DM cannot draw a wall at all.
 *
 * Argument-only, so it is asked before any read — `board.moveToken`'s rule, and the same one
 * both of the fog guards state: a call that will be refused on its arguments alone should
 * cost no I/O to refuse.
 */
function requireDrawableWall(points: readonly Point[]): void {
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new ConvexError({ kind: 'BadInput', message: 'That is not a line on this map.' })
  }
  if (points.length < 2) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'A wall needs at least two corners. One would only be a dot.',
    })
  }
  if (points.length > MAX_WALL_POINTS) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `A wall can have at most ${MAX_WALL_POINTS} corners. Draw it as two walls.`,
    })
  }

  const bounds = boundsOf(points)
  if (bounds.width === 0 && bounds.height === 0) {
    throw new ConvexError({
      kind: 'BadInput',
      message: 'Those corners are all in the same place, so the wall would have no length.',
    })
  }
}

/**
 * Every wall on one scene. **Ungated** — see the header.
 *
 * Empty rather than thrown for every kind of unknown, in `fog.list`'s and
 * `board.positions`' register and for the sharper version of that reason those two give: the
 * canvas subscribes to all three together, so a DM deleting the active scene mid-session
 * leaves them holding a `sceneId` that no longer resolves, and one of them throwing while
 * the other two painted an empty board would be the worst of the available answers.
 *
 * ⚠️ **A non-DM may only ask about the board in front of them, and this guard is restated
 * here rather than borrowed from `fog.list`.** It closes the same hole with a different
 * thing behind it. There, naming a foreign scene hands back a room-by-room sketch of a map
 * the party has not reached; here it hands back the walls of one — which is a floor plan
 * too, and a more legible one, because a DM who has traced the corridors of a dungeon level
 * has drawn its layout in lines rather than in blocks. Sharing the check would have been one
 * fewer clause and would have made *why* it is here a fact about the other file.
 *
 * It costs nothing in practice, exactly as it does next door: the canvas only ever passes
 * the active scene, and `scenes.list` is DM-only, so a player has no route to another
 * scene's id in the first place.
 */
export const list = query({
  args: { code: v.string(), sceneId: v.id('scenes'), dmCode: v.optional(v.string()) },
  returns: v.array(publicWallValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    // Checked against the game rather than trusted, so a scene id from another game cannot
    // be used to read that game's walls with this game's code. An empty answer for a foreign
    // scene leaks nothing — it is the absence of one.
    const scene = await findSceneInGame(ctx, game._id, args.sceneId)
    if (!scene) return []

    if (!isDm && scene._id !== activeSceneId(game)) return []

    return await publicWalls(ctx, scene._id)
  },
})

/**
 * Draw a barrier on the map.
 *
 * DM-gated, because the shape of the map is the DM's to decide. **Walls do not block the DM
 * either** — see `board.moveToken` — so this is the one of the pair of decisions a DM makes
 * about a wall that has any effect on them at all.
 *
 * The order is `board.moveToken`'s and `fog.draw`'s: the argument checks, then the game,
 * then the scene, then the bound, then the row. Tracing a dungeon's corridors produces one
 * of these per gesture, so it is worth refusing a bad one before any of it costs a read.
 *
 * ⚠️ **The bound is a write check and not only a read bound**, which is the thing
 * `MAX_PLACEMENTS_PER_SCENE` deliberately is not, and the constant's own docblock argues
 * why a wall is on `fog.draw`'s side of that line rather than on the placement table's. The
 * refusal names both ways out, because "the map is full" with no next step is a dead end in
 * the middle of a session.
 */
export const add = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    sceneId: v.id('scenes'),
    points: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  returns: v.object({ wallId: v.id('walls') }),
  handler: async (ctx, args) => {
    requireDrawableWall(args.points)

    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    if ((await countWallsOnScene(ctx, scene._id)) >= MAX_WALLS_PER_SCENE) {
      throw new ConvexError({
        kind: 'SceneFull',
        message: `This map already has ${MAX_WALLS_PER_SCENE} walls. Trace the next stretch as one longer wall, or clear them and start again.`,
      })
    }

    return { wallId: await insertWall(ctx, scene._id, args.points) }
  },
})

/**
 * Rub one wall out — the door the party has just opened.
 *
 * The wall's scene is checked against this game, the way `fog.erase` checks its rectangle's
 * and `board.setControllers` checks every seat id it is handed: a `wallId` off the wire is
 * routing rather than proof of anything, and without this a wall belonging to another game
 * could be deleted with this game's DM code. The refusal that follows names the scene rather
 * than the wall, and that costs nothing here — a wall id a client can name is one it was
 * sent, because every wall is sent to everybody, so there is no existence oracle to protect.
 *
 * **No `stampReveal`, and this is the mutation where its absence is worth checking rather
 * than assuming.** `fog.erase` is the reveal on a lit map — it is the moment the party walks
 * into the room, and every feed line belonging to whatever was standing in the dark becomes
 * newly readable. Opening a door reveals nobody: what was on the far side of a wall was
 * already in every payload, already drawn on every screen, already audible in the feed. The
 * only thing that changes is where a coin may be dragged. See the header.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), wallId: v.id('walls') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const wall = await getWall(ctx, args.wallId)
    await getSceneInGame(ctx, game._id, wall.sceneId)

    await deleteWall(ctx, wall._id)
    return null
  },
})

/**
 * Take every barrier off a whole map: the end of a dungeon level, and the way out the
 * bound's refusal points at.
 *
 * One mutation rather than the client deleting walls in a loop, for the reason
 * `board.setControllers` is absolute and `fog.clear` repeats: the DM means *this map has no
 * walls on it*, and a loop of a hundred calls is that intention spread across a hundred
 * transactions, any of which can be the last one. It also makes the receipt possible —
 * `removed` is what `deleteSceneWalls` counted, so the panel can say what happened rather
 * than assuming.
 *
 * There is no `removed > 0` clause here, unlike `fog.clear`, and the absence is the same
 * fact as the missing stamp: that guard exists so an empty clear does not retire the
 * flourish on every line older than the click. Nothing here stamps, so there is nothing for
 * an empty clear to cost.
 */
export const clear = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes') },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    return { removed: await deleteSceneWalls(ctx, scene._id) }
  },
})
