import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  countFogOnScene,
  deleteFogRect,
  deleteSceneFog,
  getFogRect,
  insertFogRect,
  publicFog,
  publicFogValidator,
} from './lib/fog'
import {
  MAX_FOG_RECTS_PER_SCENE,
  activeSceneId,
  findGameByCode,
  requireDm,
  resolveDmAccess,
  stampReveal,
} from './lib/games'
import type { Rect } from './lib/grid'
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
// ⚠️ **Two of these four functions widen an audience and one narrows it**, which is why
// `stampReveal` appears on `erase` and `clear` and deliberately not on `draw`. Uncovering a
// creature makes every feed line it has ever produced newly readable, and without the stamp
// those lines reach the client as *fresh* announcements.

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
 * Black out a rectangle of the map.
 *
 * DM-gated, because deciding what the table cannot see is the DM's job. Note what this write
 * is not: it only ever **narrows** what a player may know, which is why it is the one
 * mutation in this file that does not call `stampReveal`. A stamp on a narrowing write would
 * suppress the flourish for rolls nobody had been shown yet — that function's own ⚠️ says
 * so, and this is the write it is warning about.
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
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.object({ fogId: v.id('fogRects') }),
  handler: async (ctx, args) => {
    const rect = { x: args.x, y: args.y, width: args.width, height: args.height }
    requireDrawableRect(rect)

    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    if ((await countFogOnScene(ctx, scene._id)) >= MAX_FOG_RECTS_PER_SCENE) {
      throw new ConvexError({
        kind: 'SceneFull',
        message: `This map already has ${MAX_FOG_RECTS_PER_SCENE} fogged areas. Cover it with one bigger rectangle, or clear the fog and start again.`,
      })
    }

    // Normalised by the writer rather than here, so there is one shape in the database and
    // every reader can trust it. lib/fog.ts is where that decision is argued.
    return { fogId: await insertFogRect(ctx, scene._id, rect) }
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
 * ⚠️ **`stampReveal`, and it is the reason this is more than a delete.** Erasing fog makes
 * every earlier feed line belonging to whatever was standing in the dark newly readable, and
 * an unstamped game hands them to the client as *new*: a session's worth of flourishes flying
 * over the map at once, announcing a fight that finished ten minutes ago. The stamp is what
 * marks them as history. Coverage of that call is discipline rather than construction —
 * `feed.test.ts` asserts it per widening mutation, which is what makes this one hard to
 * forget.
 */
export const erase = mutation({
  args: { code: v.string(), dmCode: v.string(), fogId: v.id('fogRects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const rect = await getFogRect(ctx, args.fogId)
    await getSceneInGame(ctx, game._id, rect.sceneId)

    await deleteFogRect(ctx, rect._id)
    await stampReveal(ctx, game._id)
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
 * ⚠️ **The stamp is conditional, and that is the one place this and `erase` differ.** There,
 * `getFogRect` has already proved a rectangle existed, so the write always widens. Clearing a
 * scene that has no fog on it reveals nobody, and stamping anyway would cost the flourish on
 * every line older than the click in exchange for a reveal that did not happen.
 */
export const clear = mutation({
  args: { code: v.string(), dmCode: v.string(), sceneId: v.id('scenes') },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const scene = await getSceneInGame(ctx, game._id, args.sceneId)

    const removed = await deleteSceneFog(ctx, scene._id)
    if (removed > 0) await stampReveal(ctx, game._id)
    return { removed }
  },
})
