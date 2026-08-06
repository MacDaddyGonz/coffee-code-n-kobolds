/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_WALLS_PER_SCENE, MAX_WALL_POINTS } from './lib/games'
import type { Grid, Point } from './lib/grid'
import type { PcSheet } from './lib/sheet'
import schema from './schema'

/**
 * MILESTONE 13'S WALLS.
 *
 * > A token may not be dragged along a path that crosses a wall, and nothing about a wall
 * > decides what anybody can see.
 *
 * ⚠️ **Both halves of that sentence are the subject of this suite, and the second one is the
 * half that is easy to forget to test.** Every other secrecy-adjacent feature in this
 * codebase is tested by scanning a player's payload for something that must not be in it.
 * Here the assertion runs the other way round: a wall **is** in every payload, on purpose,
 * because a browser that has not been sent the geometry cannot stop a drag against it. So
 * `walls.list` being ungated is a test rather than an omission — see the last section.
 *
 * The three properties being held, and they pull in different directions:
 *
 * - **The refusal is real.** A settling move whose straight-line path crosses a wall is
 *   refused, with its own kind, to a player.
 * - **The refusal is narrow.** It does not apply to the DM, and it does not apply to an
 *   unsettled write. That second one is a **documented hole**, and it is asserted here
 *   rather than left in prose: a drag produces roughly twenty unchecked writes and exactly
 *   one checked one, so a client that never settles can park a token anywhere. A documented
 *   hole that no test names is a bug report waiting to be filed against the design.
 * - **Nothing survives its scene.** `walls` is keyed on the scene alone, so a deleted map
 *   that left its barriers behind would leave rows nothing in the application can name.
 *
 * The fixtures are deliberately simpler than `fog.test.ts`'s: fog's secrecy rules need a
 * hero, a granted pet and a creature nobody controls to be distinguishable, and a wall
 * treats all three identically because it withholds nothing from anybody.
 */
const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

/** `Admittance [Gridded 16x12]` at its stored size, as every other board suite uses. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

/**
 * ⚠️ **A round grid, unlike `fog.test.ts`'s deliberately awkward one, and the difference is
 * the point rather than laziness.** That suite offsets its grid so that a token's settled
 * centre is never a round number and a rectangle around it is never accidentally aligned.
 * This one asserts about a *snap landing on the near side of a line*, so the arithmetic has
 * to be legible in the test: squares are 100 px from the origin, square centres are at 50,
 * 150, 250 … and a wall along x = 200 is the boundary between the second and third columns.
 * An awkward offset here would hide an off-by-one behind a decimal.
 */
const GRID: Grid = { gridSize: 100, gridOffsetX: 0, gridOffsetY: 0 }

/** The column boundary every wall in this file is drawn along. */
const WALL_X = 200
/** Square centres either side of it, which is what `snapToGrid` produces for a 1×1 coin. */
const NEAR = { x: 50, y: 50 }
const SAME_SIDE = { x: 150, y: 50 }
const FAR_SIDE = { x: 250, y: 50 }

const TINT = '#c0392b'
const HERO_NAME = 'Thorin Ironfist'

type ErrorData = { kind: string; message: string }

async function refusalOf(call: Promise<unknown>): Promise<ErrorData> {
  const thrown = (await call.then(
    () => new Error('the call resolved, but it was expected to be refused'),
    (error: unknown) => error,
  )) as unknown
  expect(thrown).toBeInstanceOf(ConvexError)
  const data = (thrown as ConvexError<{ kind: string; message: string }>).data
  expect(typeof data.kind).toBe('string')
  expect(typeof data.message).toBe('string')
  return { kind: data.kind, message: data.message }
}

async function expectKind(call: Promise<unknown>, kind: string) {
  const refusal = await refusalOf(call)
  expect(refusal.kind).toBe(kind)
  expect(refusal.message.length).toBeGreaterThan(0)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function pcSheet(): PcSheet {
  return {
    kind: 'pc',
    level: 3,
    className: 'Fighter',
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
    saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
    armourClass: 17,
    maxHp: 45,
    hitDice: { count: 3, faces: 10 },
    feats: [],
    spells: [],
  }
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

/** Distinct bytes per label: convex-test derives a stored file's URL from its hash. */
async function storeImage(t: Harness, label: string, bytes = 64): Promise<Id<'_storage'>> {
  const body = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i += 1) body[i] = (label.charCodeAt(i % label.length) + i) % 256
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([body])))
}

async function makeScene(
  t: Harness,
  game: { code: string; dmCode: string },
  name = 'Admittance',
): Promise<Id<'scenes'>> {
  const imageId = await storeImage(t, `scene-${name}`)
  const { sceneId } = await t.mutation(api.scenes.create, {
    code: game.code,
    dmCode: game.dmCode,
    name,
    imageId,
    imageWidth: MAP_WIDTH,
    imageHeight: MAP_HEIGHT,
  })
  await t.mutation(api.scenes.updateGrid, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    gridSize: GRID.gridSize,
    gridOffsetX: GRID.gridOffsetX,
    gridOffsetY: GRID.gridOffsetY,
    gridVisible: true,
  })
  return sceneId
}

/**
 * One seat playing one hero, standing on a coin one square west of the wall line.
 *
 * The coin is on the **player** layer and claimed, which is what makes it movable at all —
 * a wall refusal is only observable on a token whose drag would otherwise have been
 * accepted, and `requireMovableToken` would have refused a GM-layer or unclaimed one first
 * with a different kind entirely.
 */
async function wallFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game)

  const { playerId } = await t.mutation(api.players.join, { code: game.code, displayName: 'Ana' })

  const { characterId } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name: HERO_NAME,
    sheet: pcSheet(),
  })
  await t.mutation(api.characters.claim, { code: game.code, playerId, characterId })

  const { tokenId } = await t.mutation(api.board.addToken, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    name: HERO_NAME,
    layer: 'player',
    sizeSquares: 1,
    tint: TINT,
    characterId,
    x: NEAR.x,
    y: NEAR.y,
  })

  return { ...game, sceneId, playerId, characterId, tokenId }
}

type Fixture = Awaited<ReturnType<typeof wallFixture>>

/** A north–south barrier along the boundary between the second and third columns. */
async function drawWall(t: Harness, game: Fixture, points?: Point[]) {
  const { wallId } = await t.mutation(api.walls.add, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId: game.sceneId,
    points: points ?? [
      { x: WALL_X, y: 0 },
      { x: WALL_X, y: MAP_HEIGHT },
    ],
  })
  return wallId
}

/** One move, as the browser sends it. `settle` is the difference between the two kinds. */
async function move(
  t: Harness,
  game: Fixture,
  to: Point,
  options: { settle?: boolean; asDm?: boolean } = {},
) {
  return await t.mutation(api.board.moveToken, {
    code: game.code,
    sceneId: game.sceneId,
    tokenId: game.tokenId,
    x: to.x,
    y: to.y,
    settle: options.settle ?? true,
    ...(options.asDm ? { dmCode: game.dmCode } : { playerId: game.playerId }),
  })
}

async function placementOf(t: Harness, game: Fixture): Promise<Point | null> {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query('tokenPositions')
      .withIndex('by_sceneId_and_tokenId', (q) =>
        q.eq('sceneId', game.sceneId).eq('tokenId', game.tokenId),
      )
      .unique()
    return row === null ? null : { x: row.x, y: row.y }
  })
}

async function storedWallCount(t: Harness, sceneId: Id<'scenes'>): Promise<number> {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query('walls')
          .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
          .collect()
      ).length,
  )
}

// ---------------------------------------------------------------------------
// Drawing, rubbing out and clearing
// ---------------------------------------------------------------------------

describe('the DM draws walls and nobody else does', () => {
  test('a two-point wall lands on the scene and comes back to every client', async () => {
    const t = harness()
    const game = await wallFixture(t)
    const wallId = await drawWall(t, game)

    const walls = await t.query(api.walls.list, { code: game.code, sceneId: game.sceneId })
    expect(walls).toHaveLength(1)
    expect(walls[0]._id).toBe(wallId)
    expect(walls[0].points).toEqual([
      { x: WALL_X, y: 0 },
      { x: WALL_X, y: MAP_HEIGHT },
    ])
  })

  test('a wall is refused without the DM code', async () => {
    const t = harness()
    const game = await wallFixture(t)

    await expectKind(
      t.mutation(api.walls.add, {
        code: game.code,
        dmCode: 'NOTITSDMCODE',
        sceneId: game.sceneId,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      }),
      'NotDm',
    )
  })

  /**
   * ⚠️ **A closed loop keeps its repeated vertex, which is the one place in this codebase a
   * duplicated first-and-last point is meaningful rather than redundant.** `usePolygonDraw`
   * drops it, because a polygon is closed by definition. A wall is a polyline and is
   * deliberately *not* closed by `pathCrossesAnyWall`, so a DM sealing a room clicks back
   * onto the corner they started at — and if this write dropped that vertex, every sealed
   * room in the game would have a doorway along one wall that nobody drew.
   */
  test('a wall that returns to its first corner keeps the repeated vertex', async () => {
    const t = harness()
    const game = await wallFixture(t)
    const loop: Point[] = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 100 },
    ]
    await drawWall(t, game, loop)

    const walls = await t.query(api.walls.list, { code: game.code, sceneId: game.sceneId })
    expect(walls[0].points).toEqual(loop)
  })

  test('one wall is rubbed out and the rest are left alone', async () => {
    const t = harness()
    const game = await wallFixture(t)
    const first = await drawWall(t, game)
    await drawWall(t, game, [
      { x: 0, y: 400 },
      { x: 900, y: 400 },
    ])

    await t.mutation(api.walls.remove, {
      code: game.code,
      dmCode: game.dmCode,
      wallId: first,
    })

    const walls = await t.query(api.walls.list, { code: game.code, sceneId: game.sceneId })
    expect(walls).toHaveLength(1)
    expect(walls[0]._id).not.toBe(first)
  })

  test('clearing reports what it removed and leaves the scene empty', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)
    await drawWall(t, game, [
      { x: 0, y: 400 },
      { x: 900, y: 400 },
    ])

    const { removed } = await t.mutation(api.walls.clear, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: game.sceneId,
    })
    expect(removed).toBe(2)
    expect(await storedWallCount(t, game.sceneId)).toBe(0)
  })

  test('clearing a map with no walls on it removes nothing and does not throw', async () => {
    const t = harness()
    const game = await wallFixture(t)

    const { removed } = await t.mutation(api.walls.clear, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: game.sceneId,
    })
    expect(removed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// What a wall may be
// ---------------------------------------------------------------------------

describe('a wall has to be a line', () => {
  test('one corner is refused, because a dot is not a line', async () => {
    const t = harness()
    const game = await wallFixture(t)

    await expectKind(
      t.mutation(api.walls.add, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: game.sceneId,
        points: [{ x: 100, y: 100 }],
      }),
      'BadInput',
    )
  })

  /**
   * ⚠️ **The degenerate test is `&&` and not `||`, and this pair is the assertion that says
   * so.** `requireDrawablePolygon` refuses a fog shape with a zero extent in *either* axis,
   * because such a shape covers no point. Copying that across would refuse every wall drawn
   * along a grid line — a vertical barrier has no width — which is nearly all of them. What
   * is degenerate for a wall is zero extent in **both** axes.
   */
  test('a wall with no width is fine and a wall with no length is not', async () => {
    const t = harness()
    const game = await wallFixture(t)

    // Vertical: zero width, real length. The commonest wall there is.
    await drawWall(t, game, [
      { x: 500, y: 0 },
      { x: 500, y: 900 },
    ])
    expect(await storedWallCount(t, game.sceneId)).toBe(1)

    await expectKind(
      t.mutation(api.walls.add, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: game.sceneId,
        points: [
          { x: 500, y: 500 },
          { x: 500, y: 500 },
        ],
      }),
      'BadInput',
    )
  })

  /**
   * A non-finite vertex makes every comparison in `segmentsIntersect` false, so the wall is
   * drawn on the DM's screen and blocks nothing at all — the fog feature's worst failure,
   * arriving at a third door. convex-test does not apply Convex's own value validation, so
   * this refusal is the only thing standing between the suite and such a row.
   */
  test('a non-finite corner is refused', async () => {
    const t = harness()
    const game = await wallFixture(t)

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      await expectKind(
        t.mutation(api.walls.add, {
          code: game.code,
          dmCode: game.dmCode,
          sceneId: game.sceneId,
          points: [
            { x: 0, y: 0 },
            { x: bad, y: 400 },
          ],
        }),
        'BadInput',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// The two caps
// ---------------------------------------------------------------------------

describe('the caps are write checks and not read bounds', () => {
  /**
   * The whole point of the constants' docblock, asserted at the boundary because a bound and
   * the write check against it can only be compared *at* it. A scene past the read window
   * would hold barriers that `pathCrossesAnyWall` sees on some passes and not others.
   */
  test('a scene refuses the wall past MAX_WALLS_PER_SCENE and names the way out', async () => {
    const t = harness()
    const game = await wallFixture(t)

    for (let i = 0; i < MAX_WALLS_PER_SCENE; i += 1) {
      await drawWall(t, game, [
        { x: i, y: 0 },
        { x: i, y: 10 },
      ])
    }
    expect(await storedWallCount(t, game.sceneId)).toBe(MAX_WALLS_PER_SCENE)

    const refusal = await refusalOf(
      t.mutation(api.walls.add, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: game.sceneId,
        points: [
          { x: 900, y: 0 },
          { x: 900, y: 10 },
        ],
      }),
    )
    expect(refusal.kind).toBe('SceneFull')
    expect(refusal.message).toContain(String(MAX_WALLS_PER_SCENE))
  })

  test('a wall refuses the corner past MAX_WALL_POINTS and accepts exactly that many', async () => {
    const t = harness()
    const game = await wallFixture(t)

    const corners = (count: number): Point[] =>
      Array.from({ length: count }, (_, i) => ({ x: i * 10, y: i % 2 === 0 ? 0 : 10 }))

    await drawWall(t, game, corners(MAX_WALL_POINTS))
    expect(await storedWallCount(t, game.sceneId)).toBe(1)

    const refusal = await refusalOf(
      t.mutation(api.walls.add, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: game.sceneId,
        points: corners(MAX_WALL_POINTS + 1),
      }),
    )
    expect(refusal.kind).toBe('BadInput')
    expect(refusal.message).toContain(String(MAX_WALL_POINTS))
  })
})

// ---------------------------------------------------------------------------
// A scene id off the wire is routing
// ---------------------------------------------------------------------------

describe('a scene or a wall from another game cannot be reached with this game’s DM code', () => {
  test('drawing on a foreign scene is refused', async () => {
    const t = harness()
    const mine = await wallFixture(t)
    const theirs = await makeGame(t, 'Somebody else’s table', 'Sam')
    const theirScene = await makeScene(t, theirs, 'Their map')

    await expectKind(
      t.mutation(api.walls.add, {
        code: mine.code,
        dmCode: mine.dmCode,
        sceneId: theirScene,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      }),
      'SceneNotFound',
    )
    expect(await storedWallCount(t, theirScene)).toBe(0)
  })

  test('rubbing out a foreign wall is refused and it stays where it is', async () => {
    const t = harness()
    const mine = await wallFixture(t)
    const theirs = await makeGame(t, 'Somebody else’s table', 'Sam')
    const theirScene = await makeScene(t, theirs, 'Their map')
    const { wallId } = await t.mutation(api.walls.add, {
      code: theirs.code,
      dmCode: theirs.dmCode,
      sceneId: theirScene,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    })

    await expectKind(
      t.mutation(api.walls.remove, { code: mine.code, dmCode: mine.dmCode, wallId }),
      'SceneNotFound',
    )
    expect(await storedWallCount(t, theirScene)).toBe(1)
  })

  test('clearing a foreign scene is refused', async () => {
    const t = harness()
    const mine = await wallFixture(t)
    const theirs = await makeGame(t, 'Somebody else’s table', 'Sam')
    const theirScene = await makeScene(t, theirs, 'Their map')
    await t.mutation(api.walls.add, {
      code: theirs.code,
      dmCode: theirs.dmCode,
      sceneId: theirScene,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    })

    await expectKind(
      t.mutation(api.walls.clear, {
        code: mine.code,
        dmCode: mine.dmCode,
        sceneId: theirScene,
      }),
      'SceneNotFound',
    )
    expect(await storedWallCount(t, theirScene)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// The barrier
// ---------------------------------------------------------------------------

describe('a wall stops a token', () => {
  test('a settling move across a wall is refused with its own kind', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    const refusal = await refusalOf(move(t, game, FAR_SIDE))
    expect(refusal.kind).toBe('WallBlocks')
    expect(await placementOf(t, game)).toEqual(NEAR)
  })

  /**
   * ⚠️ **The refusal is deliberately NOT `TokenNotFound`, and that inversion is worth an
   * assertion of its own.** `requireMovableToken` collapses three failures into one *not
   * found* because telling them apart is an existence oracle for the GM layer. Nothing of
   * the sort applies here: every wall is already in this caller's payload, so a refusal
   * naming one confirms something they were sent. Answering *no such token* about a coin the
   * player is looking at would be a lie that reads as a bug.
   */
  test('the refusal names the wall rather than pretending the coin is missing', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    const refusal = await refusalOf(move(t, game, FAR_SIDE))
    expect(refusal.kind).not.toBe('TokenNotFound')
    expect(refusal.message.toLowerCase()).toContain('wall')
  })

  test('a settling move that stays on the near side is accepted', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    await move(t, game, SAME_SIDE)
    expect(await placementOf(t, game)).toEqual(SAME_SIDE)
  })

  test('with no wall on the map the same move is accepted', async () => {
    const t = harness()
    const game = await wallFixture(t)

    await move(t, game, FAR_SIDE)
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })

  /**
   * ⚠️ **Walls do not block the DM, and this is the assertion behind the sentence.** They
   * place creatures inside sealed rooms, drag the party through a door they have just
   * narrated open, and rearrange scenery. A wall the DM cannot cross is a wall the DM cannot
   * use — and the check is skipped on the DM's own drags before any read, so their board
   * costs nothing for the feature either.
   */
  test('the DM is not refused', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    await move(t, game, FAR_SIDE, { asDm: true })
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })

  /**
   * ⚠️⚠️ **THE ADVISORY CEILING, ASSERTED RATHER THAN LEFT IN PROSE.**
   *
   * The check is on the settling write alone, because a `walls` range read on the handler
   * that runs ten times a second during a drag would turn every wall the DM traced into an
   * OCC conflict against every in-flight drag (CLAUDE.md invariant 2, and
   * `requireMovableToken`'s own docblock). So an unsettled move through a wall **succeeds**,
   * is stored, and is broadcast to every other client.
   *
   * That is a hole and it is the sanctioned position: nothing behind a wall is a secret, so
   * the worst outcome is a coin everybody watched walk through a barrier. It is asserted
   * here because a documented hole that no test names becomes a bug report — and because the
   * day somebody decides to close it, this test is what tells them they are changing a
   * decision rather than fixing an oversight.
   */
  test('an UNSETTLED move through a wall succeeds — the documented hole', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    await move(t, game, FAR_SIDE, { settle: false })
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })

  /**
   * The second half of the same hole, and the more useful one to have pinned: because those
   * unchecked writes move the *from* point, a settling write that follows one sees a
   * perfectly legal hop. A client that wants to cross a wall crosses it in unchecked steps.
   */
  test('and the settling write after one sees a legal hop', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    await move(t, game, FAR_SIDE, { settle: false })
    await move(t, game, FAR_SIDE)
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })

  /**
   * ⚠️ **The arrow keys, which get no slide-and-stop and are refused instead.** A drag is
   * held back frame by frame in the browser and comes to rest against the barrier; a
   * keypress is a whole square at once, so there is nothing to slide. `useTokenMove`
   * therefore lets the settling write reach here and be refused, and `WallTools` says so in
   * a sentence — without which the difference between the two input methods reads as a bug.
   *
   * This is the same call shape as the first test in this section, and it is repeated
   * deliberately: what is being pinned is that the *keyboard* path has no exemption, and a
   * future `nudge` that acquired one would leave the test above passing.
   */
  test('a whole-square keyboard step across a wall is refused, not slid', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    // One square east of NEAR is SAME_SIDE and is fine; two is FAR_SIDE and is not.
    await move(t, game, SAME_SIDE)
    await expectKind(move(t, game, FAR_SIDE), 'WallBlocks')
    expect(await placementOf(t, game)).toEqual(SAME_SIDE)
  })

  /**
   * A token joining this board has no placement to draw a path out of, so there is nothing
   * to cross. Landing on the far side of a wall by being *put* there is not a journey.
   */
  test('a token with no placement on this scene is not blocked by anything', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    const second = await makeScene(t, game, 'Cellar')
    await t.mutation(api.walls.add, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      points: [
        { x: WALL_X, y: 0 },
        { x: WALL_X, y: MAP_HEIGHT },
      ],
    })

    await t.mutation(api.board.moveToken, {
      code: game.code,
      sceneId: second,
      tokenId: game.tokenId,
      x: FAR_SIDE.x,
      y: FAR_SIDE.y,
      settle: true,
      playerId: game.playerId,
    })

    const landed = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('tokenPositions')
        .withIndex('by_sceneId_and_tokenId', (q) =>
          q.eq('sceneId', second).eq('tokenId', game.tokenId),
        )
        .unique()
      return row === null ? null : { x: row.x, y: row.y }
    })
    expect(landed).toEqual(FAR_SIDE)
  })

  /**
   * A wall belongs to one scene, so barriers on the map nobody is looking at do not reach
   * across. `sceneWalls` is asked about the scene the move names and no other.
   */
  test('a wall on another map does not block a move on this one', async () => {
    const t = harness()
    const game = await wallFixture(t)
    const second = await makeScene(t, game, 'Cellar')
    await t.mutation(api.walls.add, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      points: [
        { x: WALL_X, y: 0 },
        { x: WALL_X, y: MAP_HEIGHT },
      ],
    })

    await move(t, game, FAR_SIDE)
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })

  /**
   * The path is a straight line between two centres, so a wall that ends short of it is not
   * on the way. This is what makes walking round the end of a barrier work.
   */
  test('a wall the path goes round does not block it', async () => {
    const t = harness()
    const game = await wallFixture(t)
    // The same column boundary, but only across the rows well south of the coin.
    await drawWall(t, game, [
      { x: WALL_X, y: 400 },
      { x: WALL_X, y: MAP_HEIGHT },
    ])

    await move(t, game, FAR_SIDE)
    expect(await placementOf(t, game)).toEqual(FAR_SIDE)
  })
})

// ---------------------------------------------------------------------------
// Reading walls
// ---------------------------------------------------------------------------

describe('walls are sent to everybody, and that is the feature rather than a leak', () => {
  /**
   * ⚠️ **The assertion that runs the other way round from every other secrecy test in this
   * repository.** A player with no DM code receives the geometry in full, because the
   * browser is where the barrier is felt: a client that has not been sent the wall cannot
   * slide a coin up to it and stop. `lib/walls.ts` argues why that means the table gets no
   * leak-guard entry.
   */
  test('a player with no DM code is sent every wall on the board in front of them', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)

    const walls = await t.query(api.walls.list, { code: game.code, sceneId: game.sceneId })
    expect(walls).toHaveLength(1)
    expect(walls[0].points).toHaveLength(2)
  })

  /**
   * ⚠️ **`fog.list`'s active-scene guard, restated rather than borrowed.** A wall sketch of
   * a map the party has not reached is a floor plan too — a more legible one than fog, since
   * a DM who has traced the corridors of a dungeon level has drawn its layout in lines.
   */
  test('a player may not read the walls of a map that is not on the table', async () => {
    const t = harness()
    const game = await wallFixture(t)
    const second = await makeScene(t, game, 'Cellar')
    await t.mutation(api.walls.add, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    })

    expect(await t.query(api.walls.list, { code: game.code, sceneId: second })).toEqual([])
    // And the DM, who chooses which map is on the table, can.
    const asDm = await t.query(api.walls.list, {
      code: game.code,
      sceneId: second,
      dmCode: game.dmCode,
    })
    expect(asDm).toHaveLength(1)
  })

  test('an unknown game and a foreign scene both read as an empty board', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)
    const theirs = await makeGame(t, 'Somebody else’s table', 'Sam')
    const theirScene = await makeScene(t, theirs, 'Their map')

    expect(
      await t.query(api.walls.list, { code: 'ZZZZZZ', sceneId: game.sceneId }),
    ).toEqual([])
    expect(
      await t.query(api.walls.list, {
        code: game.code,
        sceneId: theirScene,
        dmCode: game.dmCode,
      }),
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Nothing outlives its scene
// ---------------------------------------------------------------------------

describe('walls are deleted with the map they are drawn on', () => {
  test('scenes.remove takes the walls with it and leaves the other map alone', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)
    const second = await makeScene(t, game, 'Cellar')
    await t.mutation(api.walls.add, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    })

    await t.mutation(api.scenes.remove, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: game.sceneId,
    })

    expect(await storedWallCount(t, game.sceneId)).toBe(0)
    expect(await storedWallCount(t, second)).toBe(1)
  })

  /**
   * The game purge sweeps them too. Nothing else in a purge touches `walls` — no token owns
   * one and no character does — so a game deleted without that line leaves every barrier its
   * DM ever traced behind, keyed on a scene id that resolves to nothing.
   */
  test('purging a game takes every wall in it', async () => {
    const t = harness()
    const game = await wallFixture(t)
    await drawWall(t, game)
    const second = await makeScene(t, game, 'Cellar')
    await t.mutation(api.walls.add, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    })

    await t.run(async (ctx) => {
      const rows = await ctx.db.query('walls').collect()
      expect(rows.length).toBe(2)
    })

    const gameId = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('games')
        .withIndex('by_code', (q) => q.eq('code', game.code))
        .unique()
      return row!._id
    })
    await t.mutation(internal.admin.purgeGame, { gameId })

    await t.run(async (ctx) => {
      expect(await ctx.db.query('walls').collect()).toEqual([])
    })
  })
})
