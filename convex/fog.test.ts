/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { normaliseFogRect } from './lib/fog'
import { MAX_FOG_RECTS_PER_SCENE } from './lib/games'
import type { Grid, Point, Rect } from './lib/grid'
import { snapToGrid } from './lib/grid'
import type { NpcSheet, PcSheet } from './lib/sheet'
import schema from './schema'

/**
 * MILESTONE 10'S FOG OF WAR.
 *
 * > A player's view of a fogged corridor has no position rows for what is standing in it.
 *
 * Fog is the first secrecy rule in this application that is decided by **arithmetic** rather
 * than by a field. A layer is a fact about a row and a reservation is a flag on a document;
 * whether a token is in the dark is a containment test between a rectangle and a point, and
 * every containment test has an off-by-one, a sign convention and an edge case. So this
 * suite is disproportionately about geometry, and the single highest-value test in it is the
 * four-directions one below: an unnormalised negative-width row makes `rectCovers` answer
 * false for *every* point, which produces fog that is drawn on every screen, that the DM
 * believes in, and that hides nothing whatever. Nothing about that failure looks like a
 * failure from either chair.
 *
 * Three properties are being held here, and they pull in different directions:
 *
 * - **Withholding.** A creature in the dark loses its placement, its health band and its
 *   feed lines — one `continue` in `boardCharacterAccess` and one filter in
 *   `visiblePositions`. The band lives in `vitals.test.ts` and the lines in `feed.test.ts`,
 *   because those suites already own the payloads and the needles; what is asserted here is
 *   the placement, which is the one this file's queries can see.
 * - **Not withholding.** ⚠️ **A token anybody at the table controls is never fogged**, and
 *   that is a correctness requirement rather than a courtesy. Without it a player who walks
 *   their own hero into a dark corridor loses their own coin from their own screen, with no
 *   way to select it back — `board.positions` takes no seat, so fog is one answer for every
 *   non-DM and there is no per-player exception to fall back on.
 * - **Costing nothing when unused.** `foggedTokenIds` returns before the positions read on a
 *   scene with no rectangles, so a game that never draws one has read sets byte-identical to
 *   what they were before fog existed. Convex-test cannot show a read set, so what is
 *   asserted is the observable half — see the last section.
 *
 * The fixtures duplicate `board.test.ts`'s and `vitals.test.ts`'s rather than sharing them,
 * deliberately and for the reason recorded in both: every safe home for a shared helper is
 * either deployed as a Convex module or swept by the leak guard, so duplication is the
 * cheaper of the two costs.
 */
const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

/** `Admittance [Gridded 16x12]` at its stored size, as the other three suites use. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

/**
 * The same calibration `board.test.ts` uses, with a non-zero offset on both axes, so a
 * token's settled centre is never a round number and a rectangle built around it is never
 * accidentally aligned to anything.
 */
const GRID: Grid = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }

const TINT = '#c0392b'

const HERO_NAME = 'Thorin Ironfist'
const HERO_MAX_HP = 45
const HERO_CURRENT_HP = 20

const PET_NAME = 'Wolf of the Second Cart'
const PET_MAX_HP = 31
const PET_CURRENT_HP = 17

/** The creature the fog is for: the DM's, on the board, controlled by nobody. */
const MONSTER_NAME = 'Skarnvex the Undrawn'
const MONSTER_TOKEN_NAME = 'Shape Beneath the Stair'
const MONSTER_MAX_HP = 587
const MONSTER_CURRENT_HP = 419

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

function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function pcSheet(overrides: Partial<PcSheet> = {}): PcSheet {
  return {
    kind: 'pc',
    level: 3,
    className: 'Fighter',
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
    saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
    armourClass: 17,
    maxHp: HERO_MAX_HP,
    hitDice: { count: 3, faces: 10 },
    feats: [],
    spells: [],
    ...overrides,
  }
}

function npcSheet(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return {
    kind: 'npc',
    armourClass: 22,
    maxHp: MONSTER_MAX_HP,
    initiativeBonus: 3,
    actions: [],
    notes: '',
    ...overrides,
  }
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

async function makeSeat(t: Harness, code: string, displayName: string) {
  const { playerId } = await t.mutation(api.players.join, { code, displayName })
  return playerId
}

/** Creating a character is the DM's on every path, a hero's included. */
async function makeCharacter(
  t: Harness,
  game: { code: string; dmCode: string },
  name: string,
  sheet: PcSheet | NpcSheet,
) {
  const { characterId } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name,
    sheet,
  })
  return characterId
}

async function setHp(
  t: Harness,
  game: { code: string; dmCode: string },
  characterId: Id<'characters'>,
  currentHp: number,
) {
  await t.mutation(api.characters.setHp, {
    code: game.code,
    dmCode: game.dmCode,
    characterId,
    currentHp,
  })
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
  return sceneId
}

async function calibrate(
  t: Harness,
  game: { code: string; dmCode: string },
  sceneId: Id<'scenes'>,
) {
  await t.mutation(api.scenes.updateGrid, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    gridSize: GRID.gridSize,
    gridOffsetX: GRID.gridOffsetX,
    gridOffsetY: GRID.gridOffsetY,
    gridVisible: true,
  })
}

type AddTokenOptions = {
  name?: string
  layer?: 'background' | 'player' | 'gm'
  characterId?: Id<'characters'>
  x?: number
  y?: number
}

async function addToken(
  t: Harness,
  game: { code: string; dmCode: string },
  sceneId: Id<'scenes'>,
  options: AddTokenOptions = {},
): Promise<Id<'tokens'>> {
  const { tokenId } = await t.mutation(api.board.addToken, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    name: options.name ?? 'Guard',
    layer: options.layer ?? 'player',
    sizeSquares: 1,
    tint: TINT,
    ...(options.characterId === undefined ? {} : { characterId: options.characterId }),
    x: options.x ?? 500,
    y: options.y ?? 500,
  })
  return tokenId
}

async function setControllers(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  playerIds: Id<'players'>[],
) {
  await t.mutation(api.board.setControllers, {
    code: game.code,
    dmCode: game.dmCode,
    tokenId,
    playerIds,
  })
}

/**
 * One hero the party is playing, one pet the DM has lent them, and one creature that
 * belongs to nobody.
 *
 * ⚠️ **All three coins are on the *player* layer, which is what makes this suite worth
 * writing.** Hiding the creature on the GM layer would make every assertion below pass for
 * the wrong reason, because the token choke point would have dropped it before any
 * arithmetic ran. Fog is the tool for "cannot see into that corridor"; the GM layer is the
 * tool for "may not know it exists", and the two are only distinguishable on a coin the
 * table can otherwise see.
 *
 * The hero is claimed and the pet is granted, so each has an effective controller and
 * neither is ever fogged. The creature has neither, which is the only reason it can be.
 */
async function fogFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game)
  await calibrate(t, game, sceneId)

  const ana = await makeSeat(t, game.code, 'Ana')
  const ben = await makeSeat(t, game.code, 'Ben')

  const hero = await makeCharacter(t, game, HERO_NAME, pcSheet())
  await setHp(t, game, hero, HERO_CURRENT_HP)
  await t.mutation(api.characters.claim, {
    code: game.code,
    playerId: ana,
    characterId: hero,
  })
  const heroToken = await addToken(t, game, sceneId, {
    name: HERO_NAME,
    characterId: hero,
    x: 300,
    y: 300,
  })

  const pet = await makeCharacter(t, game, PET_NAME, npcSheet({ maxHp: PET_MAX_HP }))
  await setHp(t, game, pet, PET_CURRENT_HP)
  const petToken = await addToken(t, game, sceneId, {
    name: 'The Second Cart’s Wolf',
    characterId: pet,
    x: 700,
    y: 300,
  })
  await setControllers(t, game, petToken, [ana])

  const monster = await makeCharacter(t, game, MONSTER_NAME, npcSheet())
  await setHp(t, game, monster, MONSTER_CURRENT_HP)
  const monsterToken = await addToken(t, game, sceneId, {
    name: MONSTER_TOKEN_NAME,
    characterId: monster,
    x: 1400,
    y: 900,
  })

  return { ...game, sceneId, ana, ben, hero, heroToken, pet, petToken, monster, monsterToken }
}

type Fixture = Awaited<ReturnType<typeof fogFixture>>

// ---------------------------------------------------------------------------
// Reading the board
// ---------------------------------------------------------------------------

/**
 * Where a token is actually standing, read off the stored row.
 *
 * ⚠️ **Every rectangle in this file is built around a placement read back rather than
 * around the point the fixture asked for**, and that is not fussiness. `board.addToken`
 * snaps to the grid *and* displaces onto a free square, so the stored centre is neither the
 * requested point nor a simple rounding of it. A rectangle drawn around the requested point
 * would sometimes cover the token and sometimes not, which is a flaky secrecy test — the
 * worst kind, because the direction it flakes in is "the monster was visible".
 */
async function placementOf(
  t: Harness,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
): Promise<Point> {
  const row = await t.run(
    async (ctx) =>
      await ctx.db
        .query('tokenPositions')
        .withIndex('by_sceneId_and_tokenId', (q) =>
          q.eq('sceneId', sceneId).eq('tokenId', tokenId),
        )
        .unique(),
  )
  if (!row) throw new Error(`token ${tokenId} has no placement on scene ${sceneId}`)
  return { x: row.x, y: row.y }
}

/**
 * A square centred on a point, half a grid square out in each direction — big enough to
 * cover the coin and too small to reach the next one, which the fixture spaces at least
 * three squares apart.
 */
function boxAround(point: Point, half = 60): Rect {
  return { x: point.x - half, y: point.y - half, width: half * 2, height: half * 2 }
}

/** Which tokens a caller is told are standing on the board. */
async function placedIds(
  t: Harness,
  fixture: Fixture,
  who: { dmCode?: string } = {},
): Promise<Id<'tokens'>[]> {
  const rows = await t.query(api.board.positions, {
    code: fixture.code,
    sceneId: fixture.sceneId,
    ...who,
  })
  return rows.map((row) => row.tokenId)
}

async function drawFog(
  t: Harness,
  game: { code: string; dmCode: string },
  sceneId: Id<'scenes'>,
  rect: Rect,
): Promise<Id<'fogRects'>> {
  const { fogId } = await t.mutation(api.fog.draw, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    ...rect,
  })
  return fogId
}

async function eraseFog(
  t: Harness,
  game: { code: string; dmCode: string },
  fogId: Id<'fogRects'>,
) {
  await t.mutation(api.fog.erase, { code: game.code, dmCode: game.dmCode, fogId })
}

/** The stored rectangle, not the projection — for asserting that the write normalised it. */
async function fogRow(t: Harness, fogId: Id<'fogRects'>) {
  return await t.run(async (ctx) => await ctx.db.get('fogRects', fogId))
}

async function fogRowsOn(t: Harness, sceneId: Id<'scenes'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('fogRects')
        .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
        .collect(),
  )
}

/** A structurally valid `fogRects` id that points at nothing at all. */
async function vanishedFogId(t: Harness, sceneId: Id<'scenes'>): Promise<Id<'fogRects'>> {
  return await t.run(async (ctx) => {
    const fogId = await ctx.db.insert('fogRects', { sceneId, x: 0, y: 0, width: 1, height: 1 })
    await ctx.db.delete('fogRects', fogId)
    return fogId
  })
}

/**
 * Put a token on an exact point, unsnapped.
 *
 * `settle: false` stores the raw coordinate, which is the only way to stand a coin on a
 * rectangle's edge to the pixel — and the edge cases are most of what a containment test
 * gets wrong.
 */
async function standAt(t: Harness, fixture: Fixture, tokenId: Id<'tokens'>, point: Point) {
  await t.mutation(api.board.moveToken, {
    code: fixture.code,
    dmCode: fixture.dmCode,
    sceneId: fixture.sceneId,
    tokenId,
    x: point.x,
    y: point.y,
    settle: false,
  })
}

// ---------------------------------------------------------------------------
// (a) normaliseFogRect — the least interesting function to read and the easiest to omit
// ---------------------------------------------------------------------------

describe('normaliseFogRect turns any drag into one rectangle', () => {
  /**
   * The pure half. Four drags describing the identical region, three of them with a
   * negative extent, because a rubber band goes wherever the DM's hand goes and only one
   * quarter of gestures start at the top-left.
   */
  test('all four directions collapse to the same top-left corner and extent', () => {
    const canonical: Rect = { x: 100, y: 200, width: 60, height: 40 }

    expect(normaliseFogRect({ x: 100, y: 200, width: 60, height: 40 })).toEqual(canonical)
    expect(normaliseFogRect({ x: 160, y: 200, width: -60, height: 40 })).toEqual(canonical)
    expect(normaliseFogRect({ x: 100, y: 240, width: 60, height: -40 })).toEqual(canonical)
    expect(normaliseFogRect({ x: 160, y: 240, width: -60, height: -40 })).toEqual(canonical)

    // Idempotent, which is what lets the write path normalise and every reader trust the
    // row without asking again.
    expect(normaliseFogRect(canonical)).toEqual(canonical)
  })

  /**
   * ⚠️ **THE HIGHEST-VALUE TEST IN THIS FILE, AND THE ONE WHOSE FAILURE IS INVISIBLE FROM
   * BOTH CHAIRS.**
   *
   * Stored unnormalised, a negative-width row puts its far edge *behind* its near one, so
   * `rectCovers` answers false for every point in the plane. The result is fog that the DM
   * has drawn, that the DM can see on their own screen, and that hides nothing at all — no
   * error, no warning, and a monster standing in a corridor the party believes is dark.
   * Three quarters of real drags produce exactly that row.
   *
   * So the assertion is behavioural rather than arithmetic: the same monster disappears from
   * the same player's board however the gesture went, and the stored row is the same four
   * numbers each time. Erased between iterations so each direction is tested against a clean
   * scene rather than inheriting the previous rectangle's coverage.
   */
  test('a rectangle dragged in each of the four directions hides the same token', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const at = await placementOf(t, fixture.sceneId, fixture.monsterToken)
    const box = boxAround(at)

    const drags: [string, Rect][] = [
      ['top-left → bottom-right', box],
      [
        'top-right → bottom-left',
        { x: box.x + box.width, y: box.y, width: -box.width, height: box.height },
      ],
      [
        'bottom-left → top-right',
        { x: box.x, y: box.y + box.height, width: box.width, height: -box.height },
      ],
      [
        'bottom-right → top-left',
        {
          x: box.x + box.width,
          y: box.y + box.height,
          width: -box.width,
          height: -box.height,
        },
      ],
    ]

    for (const [direction, drag] of drags) {
      // The precondition: nothing is hidden before this drag, so a pass cannot be inherited.
      expect(await placedIds(t, fixture), direction).toContain(fixture.monsterToken)

      const fogId = await drawFog(t, fixture, fixture.sceneId, drag)

      expect(await fogRow(t, fogId), `${direction} was stored unnormalised`).toMatchObject(box)
      expect(await placedIds(t, fixture), `${direction} hid nothing`).not.toContain(
        fixture.monsterToken,
      )
      // And the DM is unaffected, so the disappearance is a filter rather than a delete.
      expect(await placedIds(t, fixture, { dmCode: fixture.dmCode }), direction).toContain(
        fixture.monsterToken,
      )

      await eraseFog(t, fixture, fogId)
    }
  })
})

// ---------------------------------------------------------------------------
// (b) The withholding, and the way back out of it
// ---------------------------------------------------------------------------

describe('a token standing in the dark has no placement in a player’s payload', () => {
  /**
   * ⚠️ **BOTH DIRECTIONS IN ONE TEST, WHICH IS NOT REDUNDANCY.** A one-way assertion —
   * draw, then check the row is gone — passes on a fixture that never had a row in the first
   * place: a mistyped token id, a scene that is not the active one, a placement that was
   * never written. The restore is what proves the absence was caused by the rectangle.
   */
  test('drawing removes the row, erasing brings it back, and the others never move', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const before = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    expect(before.map((row) => row.tokenId).sort()).toEqual(
      [fixture.heroToken, fixture.petToken, fixture.monsterToken].sort(),
    )

    const fogId = await drawFog(
      t,
      fixture,
      fixture.sceneId,
      boxAround(await placementOf(t, fixture.sceneId, fixture.monsterToken)),
    )

    const fogged = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    expect(fogged.map((row) => row.tokenId).sort()).toEqual(
      [fixture.heroToken, fixture.petToken].sort(),
    )
    // Nothing was rewritten to make that true: the placement is still in the table, and the
    // DM's payload still carries it. A fogged coin is filtered, not moved and not deleted.
    expect(await placementOf(t, fixture.sceneId, fixture.monsterToken)).toBeDefined()

    await eraseFog(t, fixture, fogId)

    // Field for field, including the coordinates — so the round trip is a reveal rather
    // than a re-placement, exactly as `board.setLayer`'s is.
    expect(
      await t.query(api.board.positions, { code: fixture.code, sceneId: fixture.sceneId }),
    ).toEqual(before)
  })

  /**
   * The coin's *name* stays in `board.tokens` throughout, and stating it here is the
   * honest scope of the feature rather than a gap.
   *
   * `foggedTokenIds` is deliberately not a filter on `publicTokens`: that query resolves a
   * signed storage URL per token, so putting the fog question into it would make every drag
   * frame re-resolve two hundred of them — the cost ADR 0004 split the two board queries to
   * avoid. What a player is denied about a fogged creature is where it is standing, how hurt
   * it is and what it just rolled; **the GM layer remains the tool for "may not know it
   * exists"**, and fog is not.
   */
  test('the coin’s name survives the fog, which is what the GM layer is for instead', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    await drawFog(
      t,
      fixture,
      fixture.sceneId,
      boxAround(await placementOf(t, fixture.sceneId, fixture.monsterToken)),
    )

    const tokens = await t.query(api.board.tokens, { code: fixture.code })
    expect(tokens.map((token) => token._id)).toContain(fixture.monsterToken)
    expect(JSON.stringify(tokens) ?? '').toContain(MONSTER_TOKEN_NAME)

    // The *character* behind it is a different question and is withheld, which is the
    // asymmetry worth having in one place: a coin by that name exists somewhere in the game,
    // and nothing else about it travels.
    const asPlayer = JSON.stringify(
      await t.query(api.characters.vitals, { code: fixture.code }),
    ) as string
    expect(asPlayer).not.toContain(fixture.monster)
    expect(asPlayer).not.toContain(MONSTER_NAME)
    expect(
      await t.query(api.characters.sheet, {
        code: fixture.code,
        characterId: fixture.monster,
      }),
    ).toBeNull()
  })

  /** The DM reads nothing at all in `foggedTokenIds`, so their board is never affected. */
  test('the DM sees everything through fog, including a rectangle over the whole map', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const before = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
      dmCode: fixture.dmCode,
    })

    await drawFog(t, fixture, fixture.sceneId, {
      x: -MAP_WIDTH,
      y: -MAP_HEIGHT,
      width: MAP_WIDTH * 3,
      height: MAP_HEIGHT * 3,
    })

    expect(
      await t.query(api.board.positions, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        dmCode: fixture.dmCode,
      }),
    ).toEqual(before)
    // And a wrong DM code is an ordinary player, not a partial DM — the gate is
    // `resolveDmAccess` and nothing else.
    expect(
      await placedIds(t, fixture, { dmCode: twiddle(fixture.dmCode) }),
    ).not.toContain(fixture.monsterToken)
  })
})

// ---------------------------------------------------------------------------
// (c) The exclusion that is a correctness requirement, not a courtesy
// ---------------------------------------------------------------------------

describe('a coin somebody controls is never fogged', () => {
  /**
   * ⚠️ **WITHOUT THIS, A PLAYER WHO WALKS THEIR OWN HERO INTO THE DARK LOSES THEIR OWN COIN
   * AND CANNOT GET IT BACK.**
   *
   * `board.positions` takes no seat and must not — that is the per-seat cache split the feed
   * deliberately walked away from — so fog is one answer for every non-DM, and there is no
   * per-player exception available to repair this afterwards. The coin would vanish from the
   * player's own screen with nothing to select, no undo, and only "ask the DM" as a way out.
   *
   * The exclusion also states what fog is *for*: it hides what the DM placed. A hero and a
   * granted pet belong to the table.
   *
   * The same rectangle is drawn over the monster in the same test, which is what makes this
   * an assertion about *control* rather than about the rectangle having missed.
   */
  test('a claimed hero keeps its placement, its sheet and its exact hit points', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    // One rectangle wide enough to swallow the hero and the monster together.
    const hero = await placementOf(t, fixture.sceneId, fixture.heroToken)
    const monster = await placementOf(t, fixture.sceneId, fixture.monsterToken)
    await drawFog(t, fixture, fixture.sceneId, {
      x: Math.min(hero.x, monster.x) - 100,
      y: Math.min(hero.y, monster.y) - 100,
      width: Math.abs(monster.x - hero.x) + 200,
      height: Math.abs(monster.y - hero.y) + 200,
    })

    // The rectangle really did cover both, which is the control for everything below.
    const placed = await placedIds(t, fixture)
    expect(placed, 'the rectangle missed the monster').not.toContain(fixture.monsterToken)
    expect(placed, 'the hero was fogged out of their own board').toContain(fixture.heroToken)

    // Everything else the fog cascade could have taken with it. A hero's hit points are
    // exact for the whole table and were never gated, so the failure to look for is fog
    // quietly turning `characters.vitals` into a rule that withholds more than it should.
    const vitals = await t.query(api.characters.vitals, {
      code: fixture.code,
      playerId: fixture.ana,
    })
    expect(vitals.find((row) => row.characterId === fixture.hero)).toMatchObject({
      kind: 'exact',
      current: HERO_CURRENT_HP,
      max: HERO_MAX_HP,
    })
    expect(
      await t.query(api.characters.sheet, {
        code: fixture.code,
        characterId: fixture.hero,
        playerId: fixture.ana,
      }),
    ).not.toBeNull()

    // And the seat can still move it, so the coin is genuinely usable rather than merely
    // drawn. (Its feed lines are the other half of "untouched", and they are asserted in
    // `feed.test.ts`, where the roll fixtures and the needles already live.)
    await t.mutation(api.board.moveToken, {
      code: fixture.code,
      sceneId: fixture.sceneId,
      tokenId: fixture.heroToken,
      x: hero.x + GRID.gridSize,
      y: hero.y,
      settle: true,
      playerId: fixture.ana,
    })
    expect(await placedIds(t, fixture)).toContain(fixture.heroToken)
  })

  /**
   * A granted pet is likewise never fogged, and the reason is one function rather than two:
   * `effectiveControllersOf` is what `foggedTokenIds` asks, so a grant and a claim are the
   * same answer to it. The pet is bound to a creature nobody is playing, so the *only* thing
   * keeping it out of the dark is the DM's tick.
   */
  test('a granted pet keeps its placement, and revoking the grant lets the fog take it', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const pet = await placementOf(t, fixture.sceneId, fixture.petToken)
    await drawFog(t, fixture, fixture.sceneId, boxAround(pet))

    expect(await placedIds(t, fixture)).toContain(fixture.petToken)
    // For every seat, not only the granted one: `board.positions` takes no seat, so the pet
    // is on Ben's board as well as Ana's. What the grant changes is the sheet and the
    // numbers, which is a different question asked by a different query.
    expect(
      (
        await t.query(api.characters.vitals, { code: fixture.code, playerId: fixture.ana })
      ).find((row) => row.characterId === fixture.pet),
    ).toMatchObject({ kind: 'exact', current: PET_CURRENT_HP, max: PET_MAX_HP })
    expect(
      (
        await t.query(api.characters.vitals, { code: fixture.code, playerId: fixture.ben })
      ).find((row) => row.characterId === fixture.pet)?.kind,
    ).toBe('band')

    // ⚠️ The live disjunct, and the thing that stops the test above passing because the
    // rectangle missed: take the grant away and the identical rectangle hides the identical
    // coin. Nothing about the geometry changed.
    await setControllers(t, fixture, fixture.petToken, [])
    expect(await placedIds(t, fixture)).not.toContain(fixture.petToken)
    expect(
      (
        await t.query(api.characters.vitals, { code: fixture.code, playerId: fixture.ana })
      ).find((row) => row.characterId === fixture.pet),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// (d) The edges
// ---------------------------------------------------------------------------

describe('a rectangle is half-open: inclusive of its near edge, exclusive of its far one', () => {
  /**
   * The convention is what lets two rectangles tile without a seam and without both claiming
   * the line between them. It is also the single most likely place for an off-by-one, so
   * every one of the four edges is asserted rather than one of them plus an assumption.
   *
   * The token is stood on each point with `settle: false`, because a snapped placement can
   * never land exactly on an edge and the edge is the whole subject.
   */
  test('the near edges are covered and the far edges are not', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const rect: Rect = { x: 400, y: 400, width: 200, height: 200 }
    await drawFog(t, fixture, fixture.sceneId, rect)

    const cases: [string, Point, boolean][] = [
      ['the top-left corner itself', { x: 400, y: 400 }, true],
      ['just inside the far edges', { x: 599.9, y: 599.9 }, true],
      ['exactly on the right edge', { x: 600, y: 500 }, false],
      ['exactly on the bottom edge', { x: 500, y: 600 }, false],
      ['a hair left of the near edge', { x: 399.9, y: 500 }, false],
      ['a hair above the near edge', { x: 500, y: 399.9 }, false],
    ]

    for (const [what, point, hidden] of cases) {
      await standAt(t, fixture, fixture.monsterToken, point)
      expect((await placedIds(t, fixture)).includes(fixture.monsterToken), what).toBe(!hidden)
    }
  })

  /**
   * The reason the convention is worth having at all: a DM brushing out a corridor draws
   * overlapping and abutting rectangles by the dozen, and a coin standing on the shared
   * boundary of two of them must belong to exactly one — never to neither.
   */
  test('two abutting rectangles leave no gap on the line between them', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    await drawFog(t, fixture, fixture.sceneId, { x: 400, y: 400, width: 200, height: 200 })
    await drawFog(t, fixture, fixture.sceneId, { x: 600, y: 400, width: 200, height: 200 })

    for (const x of [400, 500, 599.999, 600, 700, 799.999]) {
      await standAt(t, fixture, fixture.monsterToken, { x, y: 500 })
      expect(
        (await placedIds(t, fixture)).includes(fixture.monsterToken),
        `x=${x} fell through the seam`,
      ).toBe(false)
    }

    // And the far edge of the pair is still open, so the tiling has not silently grown.
    await standAt(t, fixture, fixture.monsterToken, { x: 800, y: 500 })
    expect(await placedIds(t, fixture)).toContain(fixture.monsterToken)
  })
})

// ---------------------------------------------------------------------------
// (e) fog.draw — what it refuses, and why each refusal is about data rather than taste
// ---------------------------------------------------------------------------

describe('fog.draw', () => {
  /**
   * A zero-area rectangle covers no point, so it hides nothing — and there is nothing on
   * screen to click, so the DM cannot erase it either. It would sit on the scene for ever,
   * counting against the bound, reachable only by clearing the whole map. That is a data
   * refusal wearing a usability refusal's clothes.
   */
  test('refuses a rectangle with no width or no height, and writes nothing', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    for (const rect of [
      { x: 100, y: 100, width: 0, height: 50 },
      { x: 100, y: 100, width: 50, height: 0 },
      { x: 100, y: 100, width: 0, height: 0 },
    ]) {
      await expectKind(drawFog(t, fixture, fixture.sceneId, rect), 'BadInput')
    }
    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])
  })

  /**
   * NaN and Infinity are valid Convex float64s, so nothing between the client and the row
   * rejects them — and a non-finite *extent* is the worse of the two, because `rectCovers`
   * fails **open** on a NaN. The row would then be fog that is drawn on every screen, that
   * the DM believes in, and that hides nothing.
   */
  test('refuses a non-finite corner or extent', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const base: Rect = { x: 100, y: 100, width: 50, height: 50 }

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const field of ['x', 'y', 'width', 'height'] as const) {
        await expectKind(
          drawFog(t, fixture, fixture.sceneId, { ...base, [field]: value }),
          'BadInput',
        )
      }
    }
    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])
  })

  /** A negative extent is not refused — it is three quarters of all real drags. */
  test('accepts a negative extent and stores it normalised', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    const fogId = await drawFog(t, fixture, fixture.sceneId, {
      x: 500,
      y: 500,
      width: -200,
      height: -100,
    })

    expect(await fogRow(t, fogId)).toMatchObject({ x: 300, y: 400, width: 200, height: 100 })
    // Through the query the canvas actually draws from, too — a normalisation the projection
    // undid would be the same bug one layer out.
    const [listed] = await t.query(api.fog.list, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    expect(listed).toMatchObject({ x: 300, y: 400, width: 200, height: 100 })
  })

  /**
   * ⚠️ **The bound is a *write* check, unlike `MAX_PLACEMENTS_PER_SCENE` beside it, and the
   * contrast is the point.** Nothing structural caps rectangles — a small brush over one
   * room is a dozen rows — so a scene past the read window would hold fog that hides a token
   * on some passes and not others depending on which rows the `take` returned. That is
   * non-determinism in a secrecy filter, which is worse than a refusal.
   */
  test('refuses the rectangle past MAX_FOG_RECTS_PER_SCENE, and clearing makes room again', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    for (let i = 0; i < MAX_FOG_RECTS_PER_SCENE; i += 1) {
      await drawFog(t, fixture, fixture.sceneId, { x: i, y: 0, width: 1, height: 1 })
    }
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(MAX_FOG_RECTS_PER_SCENE)

    await expectKind(
      drawFog(t, fixture, fixture.sceneId, { x: 5000, y: 5000, width: 10, height: 10 }),
      'SceneFull',
    )
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(MAX_FOG_RECTS_PER_SCENE)

    // The way out the refusal's message points at, and the reason `clear` is one mutation
    // rather than the client erasing in a loop.
    const { removed } = await t.mutation(api.fog.clear, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      sceneId: fixture.sceneId,
    })
    expect(removed).toBe(MAX_FOG_RECTS_PER_SCENE)
    await drawFog(t, fixture, fixture.sceneId, { x: 5000, y: 5000, width: 10, height: 10 })
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(1)
  })

  test('refuses a wrong, empty or foreign DM code, and a scene from another game', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other, 'Their Map')

    for (const dmCode of [twiddle(fixture.dmCode), '', '   ', other.dmCode]) {
      await expectKind(
        t.mutation(api.fog.draw, {
          code: fixture.code,
          dmCode,
          sceneId: fixture.sceneId,
          x: 100,
          y: 100,
          width: 50,
          height: 50,
        }),
        'NotDm',
      )
    }

    // A scene id off the wire is routing rather than proof of anything, so it is checked
    // against the game the code named — otherwise this table's DM could black out another
    // table's map.
    await expectKind(drawFog(t, fixture, otherScene, { x: 1, y: 1, width: 2, height: 2 }), 'SceneNotFound')

    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])
    expect(await fogRowsOn(t, otherScene)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (f) fog.erase and fog.clear
// ---------------------------------------------------------------------------

describe('fog.erase and fog.clear', () => {
  /**
   * The rectangle's scene is checked against this game the way `board.setControllers` checks
   * every seat id it is handed. Without it, a `fogId` from another table could be erased
   * with this game's DM code — uncovering that table's ambush from outside it.
   *
   * The refusal names the scene rather than the rectangle, and that costs nothing here:
   * every rectangle is sent to every client, so there is no existence oracle to protect.
   */
  test('refuses a rect id from another game and leaves that game’s fog alone', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other, 'Their Map')
    const theirFog = await drawFog(t, other, otherScene, { x: 10, y: 10, width: 40, height: 40 })

    await expectKind(
      t.mutation(api.fog.erase, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        fogId: theirFog,
      }),
      'SceneNotFound',
    )
    expect(await fogRow(t, theirFog)).not.toBeNull()

    // Their own DM code still reaches it, so the refusal is about the pairing rather than
    // about the rectangle being unerasable.
    await eraseFog(t, other, theirFog)
    expect(await fogRow(t, theirFog)).toBeNull()
  })

  test('refuses a fog id that points at nothing, and a wrong DM code', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const fogId = await drawFog(t, fixture, fixture.sceneId, { x: 10, y: 10, width: 40, height: 40 })

    await expectKind(
      t.mutation(api.fog.erase, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        fogId: await vanishedFogId(t, fixture.sceneId),
      }),
      'FogNotFound',
    )

    for (const dmCode of [twiddle(fixture.dmCode), '', '   ']) {
      await expectKind(
        t.mutation(api.fog.erase, { code: fixture.code, dmCode, fogId }),
        'NotDm',
      )
      await expectKind(
        t.mutation(api.fog.clear, { code: fixture.code, dmCode, sceneId: fixture.sceneId }),
        'NotDm',
      )
    }
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(1)
  })

  /**
   * `clear` is one mutation rather than a loop of erases for `board.setControllers`' reason:
   * the DM means *this map is no longer dark*, and two hundred calls is that intention spread
   * across two hundred transactions, any of which can be the last one. The receipt is what
   * `deleteSceneFog` counted, so the panel can say what happened rather than assuming.
   */
  test('clear removes every rectangle on its own scene and reports how many', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const elsewhere = await makeScene(t, fixture, 'Courtyard')

    for (let i = 0; i < 3; i += 1) {
      await drawFog(t, fixture, fixture.sceneId, { x: i * 100, y: 0, width: 50, height: 50 })
    }
    await drawFog(t, fixture, elsewhere, { x: 0, y: 0, width: 50, height: 50 })

    expect(
      await t.mutation(api.fog.clear, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        sceneId: fixture.sceneId,
      }),
    ).toEqual({ removed: 3 })
    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])
    // The other board is untouched, which is what makes this a per-scene sweep.
    expect(await fogRowsOn(t, elsewhere)).toHaveLength(1)

    // Idempotent, and honest about having done nothing.
    expect(
      await t.mutation(api.fog.clear, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        sceneId: fixture.sceneId,
      }),
    ).toEqual({ removed: 0 })
  })

  /**
   * Deleting a map takes its fog with it, the way it already takes its placements.
   *
   * An orphaned rectangle is litter rather than a leak — `fogRects` is keyed on the scene
   * alone, so a row whose scene has gone is unreachable from every query in the application
   * — but it is litter nothing can ever name again, which is the same reason `purgeGame`
   * exists at all.
   */
  test('deleting a scene takes its fog with it', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const doomed = await makeScene(t, fixture, 'Cellar')
    await drawFog(t, fixture, doomed, { x: 0, y: 0, width: 50, height: 50 })
    await drawFog(t, fixture, fixture.sceneId, { x: 0, y: 0, width: 50, height: 50 })

    await t.mutation(api.scenes.remove, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      sceneId: doomed,
    })

    expect(await fogRowsOn(t, doomed)).toEqual([])
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// (g) fog.list — ungated by design, and scoped to the board in front of the caller
// ---------------------------------------------------------------------------

describe('fog.list', () => {
  /**
   * ⚠️ **READING FOG IS UNGATED, AND THAT IS THE DESIGN RATHER THAN AN OVERSIGHT.** A
   * blacked-out corridor *is* the feature: a player who cannot see that the corridor is dark
   * does not experience suspense, they wonder where the monsters went and whether the
   * application is broken. Every rectangle goes to every client verbatim, which is also why
   * `fogRects` has no `leakGuard` entry — there is no non-secret twin for one of these rows
   * to be confused with.
   */
  test('a player is sent the rectangles on the board in front of them', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const fogId = await drawFog(t, fixture, fixture.sceneId, {
      x: 120,
      y: 240,
      width: 300,
      height: 180,
    })

    expect(await t.query(api.fog.list, { code: fixture.code, sceneId: fixture.sceneId })).toEqual([
      { _id: fogId, x: 120, y: 240, width: 300, height: 180 },
    ])
  })

  /**
   * ⚠️ **A non-DM may only ask about the board in front of them** — `board.positions`' guard
   * repeated rather than borrowed, closing a different hole through the same two-scene gap.
   * There, naming a foreign scene would hand back placements filtered by the wrong scene's
   * rectangles. Here it would hand back the rectangles themselves, which is a room-by-room
   * sketch of a map the party has not reached yet.
   */
  test('a non-DM gets nothing for a scene that is not the active one, and the DM gets it', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    const ahead = await makeScene(t, fixture, 'The Flooded Stair')
    const fogId = await drawFog(t, fixture, ahead, { x: 500, y: 500, width: 400, height: 400 })

    for (const who of [{}, { dmCode: twiddle(fixture.dmCode) }, { dmCode: '' }]) {
      expect(
        await t.query(api.fog.list, { code: fixture.code, sceneId: ahead, ...who }),
        JSON.stringify(who),
      ).toEqual([])
    }

    // The positive control: the rectangles exist, so the emptiness above is a gate rather
    // than an unfogged scene.
    expect(
      await t.query(api.fog.list, {
        code: fixture.code,
        sceneId: ahead,
        dmCode: fixture.dmCode,
      }),
    ).toEqual([{ _id: fogId, x: 500, y: 500, width: 400, height: 400 }])

    // And making that scene the board changes the answer, which is what says the gate is
    // "the active scene" rather than "any scene but the first".
    await t.mutation(api.scenes.setActive, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      sceneId: ahead,
    })
    expect(await t.query(api.fog.list, { code: fixture.code, sceneId: ahead })).toHaveLength(1)
  })

  /**
   * Empty rather than thrown for every kind of unknown, in `board.positions`' register and
   * for a sharper version of its reason: the canvas subscribes to both of them together, so
   * a DM deleting the active scene mid-session leaves the pair holding a `sceneId` that no
   * longer resolves. One painting an empty board while the other threw would be the worst of
   * both answers.
   */
  test('degrades to an empty array for an unknown code, a foreign scene and a deleted one', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    await drawFog(t, fixture, fixture.sceneId, { x: 0, y: 0, width: 50, height: 50 })
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other, 'Their Map')
    await drawFog(t, other, otherScene, { x: 0, y: 0, width: 50, height: 50 })

    expect(await t.query(api.fog.list, { code: 'ZZZZZZ', sceneId: fixture.sceneId })).toEqual([])
    // A scene id from another game, with this game's code and even this game's DM code.
    expect(await t.query(api.fog.list, { code: fixture.code, sceneId: otherScene })).toEqual([])
    expect(
      await t.query(api.fog.list, {
        code: fixture.code,
        sceneId: otherScene,
        dmCode: fixture.dmCode,
      }),
    ).toEqual([])

    await t.mutation(api.scenes.remove, {
      code: other.code,
      dmCode: other.dmCode,
      sceneId: otherScene,
    })
    expect(await t.query(api.fog.list, { code: other.code, sceneId: otherScene })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (h) Pay-as-you-go
// ---------------------------------------------------------------------------

describe('a game with no rectangles pays nothing for fog', () => {
  /**
   * ⚠️ **WHAT CANNOT BE ASSERTED HERE, SAID PLAINLY.** The claim `foggedTokenIds` makes is
   * about *read sets*: the DM reads nothing at all, and a scene with no rectangles returns
   * before the `tokenPositions` read, so a game that never uses fog has read sets
   * byte-identical to what they were before fog existed. Convex-test exposes no read set —
   * there is no way from here to observe which ranges a handler subscribed to — so that
   * claim is held by the three early returns and by the reasoning beside them, and not by
   * this test.
   *
   * What *is* observable is the other half of the same sentence, and it is worth pinning
   * because the cheapest way to break the early return is to make it answer differently
   * rather than more slowly: with no rectangles on the scene, every payload a player fetches
   * is identical to what it was before fog existed at all. The round trip — draw, then
   * erase — is what makes that a statement about the empty case rather than about a fixture
   * that has never met the feature.
   */
  test('drawing and erasing leaves every player payload byte-identical', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    const snapshot = async () =>
      JSON.stringify({
        positions: await t.query(api.board.positions, {
          code: fixture.code,
          sceneId: fixture.sceneId,
        }),
        tokens: await t.query(api.board.tokens, { code: fixture.code }),
        vitals: await t.query(api.characters.vitals, {
          code: fixture.code,
          playerId: fixture.ana,
        }),
        list: await t.query(api.fog.list, { code: fixture.code, sceneId: fixture.sceneId }),
      })

    const before = await snapshot()

    const fogId = await drawFog(
      t,
      fixture,
      fixture.sceneId,
      boxAround(await placementOf(t, fixture.sceneId, fixture.monsterToken)),
    )
    // The control: the fixture is one a rectangle genuinely changes, so "identical" below is
    // a fact about the empty scene rather than about fog doing nothing anywhere.
    expect(await snapshot()).not.toBe(before)

    await eraseFog(t, fixture, fogId)
    expect(await snapshot()).toBe(before)
    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])
  })

  /**
   * The same statement made where a token is standing somewhere a rectangle would have
   * mattered: with no fog, a player's placements are exactly the DM's for every coin the
   * layer rule already admits.
   */
  test('with no fog a player’s placements are the DM’s, snapped centres and all', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    const asPlayer = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    const asDm = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
      dmCode: fixture.dmCode,
    })
    expect(asPlayer).toEqual(asDm)
    expect(asPlayer).toHaveLength(3)
    for (const row of asPlayer) {
      expect({ x: row.x, y: row.y }).toEqual(snapToGrid({ x: row.x, y: row.y }, GRID, 1))
    }
  })
})

// ---------------------------------------------------------------------------
// The fog base — Milestone 13
// ---------------------------------------------------------------------------

/**
 * Flip a scene between starting lit and starting covered.
 *
 * Through the mutation rather than by patching the row, because the whole point of the base
 * is that every reader agrees on it — and `scenes.setFogBase` is what the panel calls.
 */
async function setBase(
  t: Harness,
  game: { code: string; dmCode: string },
  sceneId: Id<'scenes'>,
  fogBase: 'lit' | 'dark',
) {
  await t.mutation(api.scenes.setFogBase, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    fogBase,
  })
}

/**
 * ⚠️ **EVERY ASSERTION ABOVE THIS LINE PASSED UNTOUCHED WHEN THE BASE ARRIVED, AND THAT IS
 * THE ACCEPTANCE CRITERION FOR THE ABSENT-BASE DEFAULT.**
 *
 * The roadmap states it in exactly those terms — *if any of them needs editing, the
 * absent-base default is wrong* — and it is a real check rather than a flourish. Every
 * fixture in this file creates its scene through `scenes.create`, which writes no `fogBase`
 * at all, so all 1270 lines above are a running proof that a scene with the field absent
 * behaves precisely as it did before the field existed. `fogBaseOf` answering `lit` is what
 * makes that true, and answering `dark` would have failed roughly half of them.
 *
 * What follows is the other half: the same scene, turned dark, behaving as the inverse.
 */
describe('a scene that starts covered', () => {
  /**
   * ⚠️ **THE MILESTONE'S HEADLINE ACCEPTANCE.** *A scene set to dark hides every DM-placed
   * creature from a player's payload with no shape drawn at all.*
   *
   * This is the case the whole feature exists for and the one the old early return made
   * impossible: fog used to be free precisely because nothing was hidden until a rectangle
   * existed, so "cover the map" had to be drawn one rectangle at a time and could never be
   * complete. The health-band and feed-line halves of this sentence live in `vitals.test.ts`
   * and `feed.test.ts`, where those payloads and their positive controls already are — this
   * file owns the placement.
   */
  test('hides the DM’s creature with no rectangle drawn at all', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    // The control. Lit and empty, every coin the layer rule admits is standing somewhere.
    expect(await placedIds(t, fixture)).toHaveLength(3)

    await setBase(t, fixture, fixture.sceneId, 'dark')
    expect(await fogRowsOn(t, fixture.sceneId)).toEqual([])

    // The monster is gone, and the hero and the granted pet are not — the control exemption
    // stops being a courtesy here and becomes load-bearing, because on a covered map with
    // nothing revealed *everything* is in the dark, and without it every player at the table
    // would lose their own hero on the first click of the toggle.
    const ids = await placedIds(t, fixture)
    expect(ids).not.toContain(fixture.monsterToken)
    expect(ids).toContain(fixture.heroToken)
    expect(ids).toContain(fixture.petToken)

    // And the DM sees all three, as ever: fog filters the party's payload and paints a veil
    // on the DM's screen, which is a preference rather than a permission.
    expect(await placedIds(t, fixture, { dmCode: fixture.dmCode })).toHaveLength(3)
  })

  /**
   * The inverse of the headline: a drawn shape is a **hole** in the dark, so revealing one
   * room brings back exactly what is standing in it.
   */
  test('revealing one room brings back exactly what is standing in it', async () => {
    const t = harness()
    const fixture = await fogFixture(t)
    await setBase(t, fixture, fixture.sceneId, 'dark')

    const monsterAt = await placementOf(t, fixture.sceneId, fixture.monsterToken)
    await drawFog(t, fixture, fixture.sceneId, boxAround(monsterAt))

    expect(await placedIds(t, fixture)).toContain(fixture.monsterToken)
  })

  test('a second creature outside the revealed room stays hidden', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    // A second monster, far from the first, so one hole cannot reach both.
    const other = await makeCharacter(t, fixture, 'Cave Troll', npcSheet())
    const otherToken = await addToken(t, fixture, fixture.sceneId, {
      name: 'Cave Troll',
      characterId: other,
      x: 300,
      y: 1400,
    })

    await setBase(t, fixture, fixture.sceneId, 'dark')
    await drawFog(
      t,
      fixture,
      fixture.sceneId,
      boxAround(await placementOf(t, fixture.sceneId, fixture.monsterToken)),
    )

    const ids = await placedIds(t, fixture)
    expect(ids).toContain(fixture.monsterToken)
    expect(ids).not.toContain(otherToken)
  })

  /**
   * ⚠️ **The inversion is exact, which is what makes the two bases one predicate rather than
   * two implementations that agree in the cases somebody thought of.**
   *
   * The same scene and the same rectangle, read on both bases: what it hides on one is what
   * it reveals on the other. The hero and the pet are in both, because control beats fog on
   * either base — the one asymmetry, and it is deliberate.
   */
  test('the same rectangle hides on lit exactly what it reveals on dark', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    const monsterAt = await placementOf(t, fixture.sceneId, fixture.monsterToken)
    await drawFog(t, fixture, fixture.sceneId, boxAround(monsterAt))

    const lit = await placedIds(t, fixture)
    expect(lit).not.toContain(fixture.monsterToken)

    await setBase(t, fixture, fixture.sceneId, 'dark')
    const dark = await placedIds(t, fixture)
    expect(dark).toContain(fixture.monsterToken)

    // Stated as a set difference over the coins fog can touch. Only the monster is
    // uncontrolled, so it is the only member either way.
    expect(dark.filter((id) => !lit.includes(id))).toEqual([fixture.monsterToken])
  })

  /**
   * ⚠️ **Flipping must not delete the shapes.** Inverting a map exactly is arguably a feature
   * and definitely a surprise, so the confirm dialog says it in words — and deleting is what
   * `fog.clear` is for. A flip that destroyed an afternoon's drawing with no undo is
   * unforgivable, and the property that makes the dialog's promise true is this one: flip
   * away and back and the board is byte-identical.
   */
  test('flipping keeps every shape, and flipping back restores the board exactly', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    const fogId = await drawFog(
      t,
      fixture,
      fixture.sceneId,
      boxAround(await placementOf(t, fixture.sceneId, fixture.monsterToken)),
    )

    const snapshot = async () =>
      JSON.stringify({
        positions: await t.query(api.board.positions, {
          code: fixture.code,
          sceneId: fixture.sceneId,
        }),
        list: await t.query(api.fog.list, { code: fixture.code, sceneId: fixture.sceneId }),
      })

    const before = await snapshot()

    await setBase(t, fixture, fixture.sceneId, 'dark')
    expect(await fogRowsOn(t, fixture.sceneId)).toHaveLength(1)
    expect(await fogRow(t, fogId)).not.toBeNull()
    // The control: the flip genuinely changed what the party is told, so "identical" below is
    // a fact about the round trip and not about the flip being a no-op.
    expect(await snapshot()).not.toBe(before)

    await setBase(t, fixture, fixture.sceneId, 'lit')
    expect(await snapshot()).toBe(before)
  })

  /**
   * The base is a fact about the map, so every client has to be told it — and the browser must
   * never spell the absent-means-lit default a second time. `scenes.active` carries the
   * resolved answer, which is what stops a client painting a covered map as visible.
   */
  test('the base reaches every client through scenes.active, already resolved', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    expect((await t.query(api.scenes.active, { code: fixture.code }))?.fogBase).toBe('lit')

    await setBase(t, fixture, fixture.sceneId, 'dark')
    expect((await t.query(api.scenes.active, { code: fixture.code }))?.fogBase).toBe('dark')
  })

  test('setting the base is DM-only', async () => {
    const t = harness()
    const fixture = await fogFixture(t)

    await expectKind(
      t.mutation(api.scenes.setFogBase, {
        code: fixture.code,
        dmCode: twiddle(fixture.dmCode),
        sceneId: fixture.sceneId,
        fogBase: 'dark',
      }),
      'NotDm',
    )
    expect((await t.query(api.scenes.active, { code: fixture.code }))?.fogBase).toBe('lit')
  })
})
