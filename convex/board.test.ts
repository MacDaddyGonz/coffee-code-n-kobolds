/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import type { FunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import { MAX_TOKENS_PER_GAME } from './lib/games'
import { cellOf, snapToGrid } from './lib/grid'
import type { Grid, Point } from './lib/grid'
import { MAX_TOKEN_BYTES } from './lib/limits'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

/** `Admittance [Gridded 16x12]` at its stored size. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

/**
 * The same map's calibration, deliberately with a non-zero offset on both axes:
 * every snap assertion below has to hold for a grid the DM has nudged, not only
 * for one that happens to start at the origin. Both numbers are exact in binary
 * floating point so the arithmetic can be asserted exactly.
 */
const GRID: Grid = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }

const TINT = '#c0392b'

type ErrorData = { kind: string; message: string }

/** The `{ kind, message }` a refusal carried, for tests that compare two refusals. */
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

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

async function makeSeat(t: Harness, code: string, displayName: string) {
  const { playerId } = await t.mutation(api.players.join, { code, displayName })
  return playerId
}

/**
 * Takes the whole game rather than its join code, because **creating a character is
 * the DM's on every path now** and the fixture therefore needs both codes.
 *
 * Every call site already had the object in hand. This suite is about the board; the
 * create gate itself is asserted in `characters.test.ts`.
 */
async function makeCharacter(t: Harness, game: { code: string; dmCode: string }, name: string) {
  const { characterId } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name,
  })
  return characterId
}

/**
 * Distinct bytes per label on purpose. convex-test derives a stored file's URL
 * from the SHA-256 of its contents, so two identical blobs would share a URL and
 * the payload scan below would be comparing a DM token's art URL against a string
 * the player token also legitimately carries.
 */
async function storeImage(t: Harness, label: string, bytes = 64): Promise<Id<'_storage'>> {
  const body = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i += 1) body[i] = (label.charCodeAt(i % label.length) + i) % 256
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([body])))
}

async function blobExists(t: Harness, imageId: Id<'_storage'>) {
  return (await t.run(async (ctx) => await ctx.db.system.get('_storage', imageId))) !== null
}

async function makeScene(
  t: Harness,
  code: string,
  dmCode: string,
  name = 'Admittance',
  imageWidth = MAP_WIDTH,
  imageHeight = MAP_HEIGHT,
): Promise<Id<'scenes'>> {
  const imageId = await storeImage(t, `scene-${name}`)
  const { sceneId } = await t.mutation(api.scenes.create, {
    code,
    dmCode,
    name,
    imageId,
    imageWidth,
    imageHeight,
  })
  return sceneId
}

/** Calibrates a scene to GRID, so the snap assertions run against a real offset. */
async function calibrate(t: Harness, code: string, dmCode: string, sceneId: Id<'scenes'>) {
  await t.mutation(api.scenes.updateGrid, {
    code,
    dmCode,
    sceneId,
    gridSize: GRID.gridSize,
    gridOffsetX: GRID.gridOffsetX,
    gridOffsetY: GRID.gridOffsetY,
    gridVisible: true,
  })
}

type AddTokenOptions = {
  name?: string
  layer?: 'player' | 'dm'
  sizeSquares?: number
  tint?: string
  imageId?: Id<'_storage'>
  characterId?: Id<'characters'>
  x?: number
  y?: number
}

async function addToken(
  t: Harness,
  code: string,
  dmCode: string,
  sceneId: Id<'scenes'>,
  options: AddTokenOptions = {},
): Promise<Id<'tokens'>> {
  const { tokenId } = await t.mutation(api.board.addToken, {
    code,
    dmCode,
    sceneId,
    name: options.name ?? 'Guard',
    layer: options.layer ?? 'player',
    sizeSquares: options.sizeSquares ?? 1,
    tint: options.tint ?? TINT,
    ...(options.imageId === undefined ? {} : { imageId: options.imageId }),
    ...(options.characterId === undefined ? {} : { characterId: options.characterId }),
    x: options.x ?? 500,
    y: options.y ?? 500,
  })
  return tokenId
}

/** The stored placement, read directly — not the projection a query would hand back. */
async function placement(t: Harness, sceneId: Id<'scenes'>, tokenId: Id<'tokens'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('tokenPositions')
        .withIndex('by_sceneId_and_tokenId', (q) =>
          q.eq('sceneId', sceneId).eq('tokenId', tokenId),
        )
        .unique(),
  )
}

async function placementsOf(t: Harness, tokenId: Id<'tokens'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('tokenPositions')
        .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
        .collect(),
  )
}

async function tokenRow(t: Harness, tokenId: Id<'tokens'>) {
  return await t.run(async (ctx) => await ctx.db.get('tokens', tokenId))
}

/** A structurally valid `tokens` id that points at nothing at all. */
async function vanishedTokenId(t: Harness): Promise<Id<'tokens'>> {
  return await t.run(async (ctx) => {
    const gameId = (await ctx.db.query('games').first())!._id
    const tokenId = await ctx.db.insert('tokens', {
      gameId,
      name: 'Ghost',
      layer: 'dm',
      sizeSquares: 1,
      tint: TINT,
    })
    await ctx.db.delete('tokens', tokenId)
    return tokenId
  })
}

function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

/**
 * A fixture with one player-layer and one DM-layer token, both placed and both
 * carrying art, plus the DM's own view of the board so the leak tests have real
 * strings to hunt for rather than invented ones.
 */
async function boardFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  await calibrate(t, game.code, game.dmCode, sceneId)

  const openArt = await storeImage(t, 'player-art')
  const secretArt = await storeImage(t, 'dm-art')

  const openToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: 'Village Guard',
    layer: 'player',
    imageId: openArt,
    x: 300,
    y: 300,
  })
  const secretToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: 'Ambush Skeleton',
    layer: 'dm',
    imageId: secretArt,
    x: 900,
    y: 700,
  })

  const dmTokens = await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })
  const secret = dmTokens.find((token) => token._id === secretToken)
  if (!secret) throw new Error('the DM cannot see their own DM-layer token')
  // A scan for a null art URL would pass for the wrong reason.
  expect(typeof secret.artUrl).toBe('string')

  return { ...game, sceneId, openToken, secretToken, secret }
}

/**
 * One token off the real query as the **DM** receives it, by id.
 *
 * The player-side twin is `tokenPayload` in the Milestone 7 section below, and the two
 * are deliberately separate calls rather than one with an optional `dmCode`: every test
 * that reaches for either is asserting something about the difference between the two
 * audiences, so which one is being read should be legible at the call site rather than
 * hidden in an argument.
 *
 * It throws rather than returning undefined because every caller wants the row: a
 * `find` that quietly answered `undefined` would turn "the DM lost sight of their own
 * token" into a passing assertion about `undefined.artUrl` being absent.
 */
async function dmTokenPayload(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
) {
  const tokens = await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })
  const token = tokens.find((row) => row._id === tokenId)
  if (!token) throw new Error(`token ${tokenId} is not in the DM payload`)
  return token
}

describe('the DM layer never reaches a player', () => {
  /**
   * A substring scan of the serialised payload, not a length check. A length
   * check is satisfied the moment the array holds one element, so it keeps
   * passing when a DM token arrives nested inside a legitimate row — a
   * `dmTokens` sibling field, an expanded position, a debugging echo of the
   * arguments. The id, the name and the art URL are each independently enough to
   * tell a player where the ambush is.
   */
  test('no payload without the DM code contains a DM-layer id, name or art URL', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const wrongDmCode = twiddle(fixture.dmCode)

    const payloads: unknown[] = [
      await t.query(api.board.tokens, { code: fixture.code }),
      await t.query(api.board.tokens, { code: fixture.code, dmCode: wrongDmCode }),
      await t.query(api.board.tokens, { code: fixture.code, dmCode: '' }),
      await t.query(api.board.positions, { code: fixture.code, sceneId: fixture.sceneId }),
      await t.query(api.board.positions, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        dmCode: wrongDmCode,
      }),
      await t.query(api.scenes.active, { code: fixture.code }),
    ]

    for (const payload of payloads) {
      const serialised = JSON.stringify(payload) ?? ''
      expect(serialised).not.toContain(fixture.secretToken)
      expect(serialised).not.toContain('Ambush Skeleton')
      expect(serialised).not.toContain(fixture.secret.artUrl as string)
      expect(serialised).not.toContain('"dm"')
    }
  })

  /** The scan above is only meaningful if the same scan finds the token for the DM. */
  test('positive control: the DM’s own payloads do contain it', async () => {
    const t = harness()
    const fixture = await boardFixture(t)

    const tokens = JSON.stringify(
      await t.query(api.board.tokens, { code: fixture.code, dmCode: fixture.dmCode }),
    )
    expect(tokens).toContain(fixture.secretToken)
    expect(tokens).toContain('Ambush Skeleton')
    expect(tokens).toContain(fixture.secret.artUrl as string)

    const positions = JSON.stringify(
      await t.query(api.board.positions, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        dmCode: fixture.dmCode,
      }),
    )
    expect(positions).toContain(fixture.secretToken)

    // And the player-layer token is visible to both audiences, so the difference
    // between the two payloads is the DM layer and nothing else.
    const asPlayer = await t.query(api.board.tokens, { code: fixture.code })
    expect(asPlayer.map((token) => token._id)).toEqual([fixture.openToken])
  })

  /**
   * Enumerated from the modules rather than from a list kept in this file, so a
   * query added in a later milestone that forgets the gate fails here without
   * anyone remembering to extend anything.
   */
  test('every exported query of board, scenes, bestiary and feed is swept for the DM-layer id', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const wrongDmCode = twiddle(fixture.dmCode)

    type AnyQuery = FunctionReference<'query', 'public', Record<string, unknown>, unknown>
    const apiModules = api as unknown as Record<string, Record<string, AnyQuery>>

    // The same shapes a player's client could actually send: never a valid DM
    // code, and only arguments a board screen already has.
    //
    // `bestiary` is swept here rather than in a suite of its own because the property
    // is this one — every public query in the module either refuses a player or hands
    // back something with no secret in it — and the enumeration is what makes it
    // self-extending. The last two shapes are for it: both its queries take a
    // **required** `dmCode`, and `entry` also takes a `key`, so without them the
    // `reached` assertion below would fail rather than passing vacuously. That is the
    // whole point of that assertion.
    //
    // `feed` joins them for the same reason, and needs no shape of its own: `feed.list`
    // takes `{ code, dmCode? }` and nothing else, because a grant cannot widen the feed
    // beyond sight and a seat therefore cannot change its answer (see `mayHearOf`). The
    // secrecy suite for the feed is `feed.test.ts`; what this enumeration adds is that a
    // query added to that module in a later milestone is swept for the DM layer with no
    // edit to any list.
    //
    // ⚠️ **No shape here names a seat, and adding one would be worse than useless.** Not
    // one query in the four modules swept below accepts a `playerId` — the board's
    // subscriptions are keyed on the DM code alone by design — so an argument set carrying
    // one is refused by Convex's *argument validation*, before any handler runs and without
    // raising a `ConvexError`. The loop below only records `reached` for a resolved value or
    // a `ConvexError`, so such a shape asserts nothing at all while reading like coverage.
    // Two of them were here and are gone.
    const argSets: Record<string, unknown>[] = [
      { code: fixture.code },
      { code: fixture.code, dmCode: wrongDmCode },
      { code: fixture.code, sceneId: fixture.sceneId },
      { code: fixture.code, sceneId: fixture.sceneId, dmCode: wrongDmCode },
      { code: fixture.code, dmCode: wrongDmCode, key: 'dire-wolf' },
      { code: fixture.code, dmCode: wrongDmCode, key: 'dire-wolf', cr: 4 },
    ]

    const swept: string[] = []
    for (const moduleName of ['board', 'scenes', 'bestiary', 'feed']) {
      const loader = modules[`./${moduleName}.ts`]
      expect(loader, `convex/${moduleName}.ts is missing`).toBeTypeOf('function')
      const exports = (await loader()) as Record<string, unknown>

      const queryNames = Object.keys(exports).filter((name) => {
        const value = exports[name] as { isQuery?: boolean; isPublic?: boolean } | undefined
        return Boolean(value && value.isQuery && value.isPublic)
      })
      expect(queryNames.length, `no public queries found in convex/${moduleName}.ts`).toBeGreaterThan(
        0,
      )

      for (const name of queryNames) {
        const reference = apiModules[moduleName][name]
        let reached = false
        for (const args of argSets) {
          const outcome = await t.query(reference, args).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          )
          if (outcome.ok) {
            reached = true
            const serialised = JSON.stringify(outcome.value) ?? ''
            expect(serialised, `${moduleName}.${name} leaked the DM-layer id`).not.toContain(
              fixture.secretToken,
            )
            expect(serialised, `${moduleName}.${name} leaked the DM-layer name`).not.toContain(
              'Ambush Skeleton',
            )
          } else if (outcome.error instanceof ConvexError) {
            // A deliberate refusal means the handler ran and said no, which is
            // as good as a clean payload for this test's purpose.
            reached = true
          }
        }
        // Neither answered nor refused means none of the argument shapes above
        // fits this query — the sweep silently skipped it, so widen argSets.
        expect(reached, `${moduleName}.${name} was never reached by the sweep`).toBe(true)
        swept.push(`${moduleName}.${name}`)
      }
    }

    // The sweep really did run over the queries this milestone ships.
    expect(swept).toContain('board.tokens')
    expect(swept).toContain('board.positions')
    expect(swept).toContain('scenes.active')
    expect(swept).toContain('bestiary.index')
    expect(swept).toContain('bestiary.entry')
    expect(swept).toContain('feed.list')
  })

  /**
   * Telling "no such token" apart from "a DM-layer token you may not move" is an
   * existence oracle: a player who can distinguish the two can enumerate the DM
   * layer one id at a time without ever seeing a payload. The refusals must be
   * indistinguishable, message included.
   */
  test('moving a DM token, a vanished token and another game’s token refuse identically', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    const otherToken = await addToken(t, other.code, other.dmCode, otherScene, {
      name: 'Their Guard',
    })
    const ghost = await vanishedTokenId(t)

    const move = (tokenId: Id<'tokens'>) =>
      t.mutation(api.board.moveToken, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        tokenId,
        x: 400,
        y: 400,
        settle: true,
      })

    const secret = await refusalOf(move(fixture.secretToken))
    const vanished = await refusalOf(move(ghost))
    const foreign = await refusalOf(move(otherToken))

    expect(secret).toEqual(vanished)
    expect(secret).toEqual(foreign)
    // And the DM-layer token did not move as a side effect of being refused.
    expect(await placement(t, fixture.sceneId, fixture.secretToken)).toMatchObject({
      x: snapToGrid({ x: 900, y: 700 }, GRID, 1).x,
      y: snapToGrid({ x: 900, y: 700 }, GRID, 1).y,
    })
  })

  test('the same three refusals are identical for removeToken too', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    const otherToken = await addToken(t, other.code, other.dmCode, otherScene)
    const ghost = await vanishedTokenId(t)

    const remove = (tokenId: Id<'tokens'>) =>
      t.mutation(api.board.removeToken, { code: fixture.code, dmCode: fixture.dmCode, tokenId })

    const vanished = await refusalOf(remove(ghost))
    const foreign = await refusalOf(remove(otherToken))
    expect(vanished).toEqual(foreign)
    expect(await tokenRow(t, otherToken)).not.toBeNull()
  })
})

describe('board.tokens', () => {
  test('an unknown code yields an empty array rather than an error', async () => {
    const t = harness()
    await boardFixture(t)
    expect(await t.query(api.board.tokens, { code: 'ZZZZZZ' })).toEqual([])
  })

  test('only reports the tokens of the game its code names', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    await addToken(t, other.code, other.dmCode, otherScene, { name: 'Their Guard' })

    const mine = await t.query(api.board.tokens, { code: fixture.code, dmCode: fixture.dmCode })
    expect(mine.map((token) => token.name).sort()).toEqual(['Ambush Skeleton', 'Village Guard'])
  })

  test('a token without art reports a null art URL rather than omitting the field', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await addToken(t, game.code, game.dmCode, sceneId, { name: 'Plain Coin' })

    const [token] = await t.query(api.board.tokens, { code: game.code })
    expect(token).toHaveProperty('artUrl', null)
    expect(token).toHaveProperty('characterId', null)
  })
})

describe('board.positions', () => {
  /**
   * A query paints a screen, so every kind of unknown degrades to an empty board.
   * The case that forced it is the last one: the DM deleting the active scene is an
   * ordinary mid-session action, and it leaves every client still subscribed with
   * the sceneId that has just gone. Throwing would put an error in front of the
   * whole table for something an empty board describes correctly.
   *
   * The foreign sceneId answers emptily rather than refusing, and that leaks
   * nothing — it is the absence of an answer, indistinguishable from a scene with
   * no tokens on it. The mutations keep the throwing check; `moveToken` below
   * asserts it.
   */
  test('degrades to an empty board for an unknown code, a foreign scene and a deleted one', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    await addToken(t, other.code, other.dmCode, otherScene, { name: 'Their Guard' })

    expect(
      await t.query(api.board.positions, { code: 'ZZZZZZ', sceneId: fixture.sceneId }),
    ).toEqual([])
    expect(
      await t.query(api.board.positions, { code: fixture.code, sceneId: otherScene }),
    ).toEqual([])
    expect(
      await t.query(api.board.positions, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        sceneId: otherScene,
      }),
    ).toEqual([])

    await t.mutation(api.scenes.remove, {
      code: other.code,
      dmCode: other.dmCode,
      sceneId: otherScene,
    })
    expect(await t.query(api.board.positions, { code: other.code, sceneId: otherScene })).toEqual(
      [],
    )
  })

  test('reports only placements on the scene it was asked about', async () => {
    const t = harness()
    const game = await makeGame(t)
    const first = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const second = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    const tokenId = await addToken(t, game.code, game.dmCode, first, { x: 300, y: 300 })

    expect(
      await t.query(api.board.positions, { code: game.code, sceneId: second }),
    ).toEqual([])
    const here = await t.query(api.board.positions, { code: game.code, sceneId: first })
    expect(here.map((row) => row.tokenId)).toEqual([tokenId])
  })
})

describe('board.moveToken settles on the grid', () => {
  /**
   * Crux 2. The server snapping on settle is the only thing that guarantees a
   * dropped token is never left between squares — a client that skipped its own
   * snap, or got it wrong, must still produce a token on a square centre. The
   * arithmetic is asserted rather than a pair of pixel values, so it is a
   * statement about the grid and not about one lucky point.
   */
  test('settle: true puts a 1×1 token on a square centre from any loose point', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId)

    for (const point of [
      { x: 0, y: 0 },
      { x: 511.37, y: 91.11 },
      { x: 1234.5, y: 777.25 },
      { x: 2239.99, y: 1679.01 },
    ] as Point[]) {
      await t.mutation(api.board.moveToken, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        tokenId,
        x: point.x,
        y: point.y,
        settle: true,
      })

      const stored = await placement(t, sceneId, tokenId)
      expect(stored).not.toBeNull()
      const cell = cellOf(stored!, GRID, 1)
      expect((stored!.x - GRID.gridOffsetX) / GRID.gridSize).toBe(cell.col + 0.5)
      expect((stored!.y - GRID.gridOffsetY) / GRID.gridSize).toBe(cell.row + 0.5)
      // And it agrees exactly with the shared snap the client applies.
      expect({ x: stored!.x, y: stored!.y }).toEqual(snapToGrid(point, GRID, 1))
    }
  })

  test('settle: true puts a 2×2 token on a square corner covering four squares', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Ogre',
      sizeSquares: 2,
    })

    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      tokenId,
      x: 1010.4,
      y: 613.9,
      settle: true,
    })

    const stored = await placement(t, sceneId, tokenId)
    const acrossX = (stored!.x - GRID.gridOffsetX) / GRID.gridSize
    const acrossY = (stored!.y - GRID.gridOffsetY) / GRID.gridSize
    expect(Number.isInteger(acrossX)).toBe(true)
    expect(Number.isInteger(acrossY)).toBe(true)
    expect({ x: stored!.x, y: stored!.y }).toEqual(snapToGrid({ x: 1010.4, y: 613.9 }, GRID, 2))
  })

  /**
   * The in-flight writes carry continuous motion to the other screens, so they
   * must be stored exactly as sent. Rounding them here would make a drag hop
   * cell to cell, which is precisely the acceptance criterion this milestone is
   * judged on.
   */
  test('settle: false stores the raw point unsnapped', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId)

    for (const point of [
      { x: 511.37, y: 91.11 },
      { x: 512.5, y: 92.25 },
      { x: 0.5, y: 0.25 },
    ]) {
      await t.mutation(api.board.moveToken, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        tokenId,
        x: point.x,
        y: point.y,
        settle: false,
      })
      const stored = await placement(t, sceneId, tokenId)
      expect({ x: stored!.x, y: stored!.y }).toEqual(point)
      expect({ x: stored!.x, y: stored!.y }).not.toEqual(snapToGrid(point, GRID, 1))
    }
  })

  test('creates the placement when the token was not yet on this scene', async () => {
    const t = harness()
    const game = await makeGame(t)
    const first = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const second = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    await calibrate(t, game.code, game.dmCode, second)
    const tokenId = await addToken(t, game.code, game.dmCode, first, { x: 300, y: 300 })

    expect(await placement(t, second, tokenId)).toBeNull()
    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: second,
      tokenId,
      x: 800,
      y: 800,
      settle: true,
    })
    expect(await placement(t, second, tokenId)).not.toBeNull()
    expect(await placementsOf(t, tokenId)).toHaveLength(2)
  })

  /**
   * NaN and Infinity are valid Convex float64 values, so nothing between the
   * client and the row rejects them for us. One of them in the position table
   * poisons every snap thereafter.
   */
  test('rejects a non-finite x or y and leaves the stored position alone', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { x: 300, y: 300 })
    const before = await placement(t, sceneId, tokenId)

    const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    for (const value of bad) {
      for (const settle of [true, false]) {
        await expectKind(
          t.mutation(api.board.moveToken, {
            code: game.code,
            dmCode: game.dmCode,
            sceneId,
            tokenId,
            x: value,
            y: 400,
            settle,
          }),
          'BadInput',
        )
        await expectKind(
          t.mutation(api.board.moveToken, {
            code: game.code,
            dmCode: game.dmCode,
            sceneId,
            tokenId,
            x: 400,
            y: value,
            settle,
          }),
          'BadInput',
        )
      }
    }

    const after = await placement(t, sceneId, tokenId)
    expect({ x: after!.x, y: after!.y }).toEqual({ x: before!.x, y: before!.y })
  })

  test('rejects a sceneId belonging to another game', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')

    await expectKind(
      t.mutation(api.board.moveToken, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        sceneId: otherScene,
        tokenId: fixture.openToken,
        x: 400,
        y: 400,
        settle: true,
      }),
      'SceneNotFound',
    )
  })
})

describe('who may move a token', () => {
  /**
   * Advisory only — a `playerId` is routing, not proof of identity (invariant 7),
   * so this refusal stops a misclick rather than an attacker. It still has to
   * fire, because two players dragging one character's token around each other is
   * the confusion it exists to prevent.
   */
  test('refuses a player-layer token whose character another seat holds', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const ana = await makeSeat(t, game.code, 'Ana')
    const ben = await makeSeat(t, game.code, 'Ben')
    const thorin = await makeCharacter(t, game, 'Thorin')
    await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId: thorin })
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
      x: 300,
      y: 300,
    })
    const before = await placement(t, sceneId, tokenId)

    await expectKind(
      t.mutation(api.board.moveToken, {
        code: game.code,
        sceneId,
        tokenId,
        x: 900,
        y: 900,
        settle: true,
        playerId: ben,
      }),
      'TokenNotYours',
    )

    const after = await placement(t, sceneId, tokenId)
    expect({ x: after!.x, y: after!.y }).toEqual({ x: before!.x, y: before!.y })

    // The holding seat is not refused.
    await t.mutation(api.board.moveToken, {
      code: game.code,
      sceneId,
      tokenId,
      x: 900,
      y: 900,
      settle: true,
      playerId: ana,
    })
    expect(await placement(t, sceneId, tokenId)).toMatchObject(snapToGrid({ x: 900, y: 900 }, GRID, 1))
  })

  /**
   * These three replace tests that asserted the opposite, and the reversal is the
   * point rather than a detail. The old rule let a player move any token no character
   * was attached to, which sounded like generosity and meant the whole table could
   * shove the DM's monsters around — every NPC is unattached by construction. Control
   * is granted, never assumed.
   */
  test('refuses a player with no claimed character, whatever they pass', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const ana = await makeSeat(t, game.code, 'Ana')
    const thorin = await makeCharacter(t, game, 'Thorin')
    await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId: thorin })
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
    })
    const before = await placement(t, sceneId, tokenId)

    // No playerId at all: there is nothing to identify a claim with, so refuse.
    await expectKind(
      t.mutation(api.board.moveToken, {
        code: game.code,
        sceneId,
        tokenId,
        x: 640,
        y: 480,
        settle: true,
      }),
      'TokenNotYours',
    )
    expect(await placement(t, sceneId, tokenId)).toMatchObject({ x: before!.x, y: before!.y })
  })

  test('refuses a player moving an unattached token — every NPC is one', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const ben = await makeSeat(t, game.code, 'Ben')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { name: 'Loose Barrel' })
    const before = await placement(t, sceneId, tokenId)

    await expectKind(
      t.mutation(api.board.moveToken, {
        code: game.code,
        sceneId,
        tokenId,
        x: 1200,
        y: 300,
        settle: true,
        playerId: ben,
      }),
      'TokenNotYours',
    )
    expect(await placement(t, sceneId, tokenId)).toMatchObject({ x: before!.x, y: before!.y })

    // The DM still moves it, which is the whole point of the default.
    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      tokenId,
      x: 1200,
      y: 300,
      settle: true,
    })
    expect(await placement(t, sceneId, tokenId)).toMatchObject(
      snapToGrid({ x: 1200, y: 300 }, GRID, 1),
    )
  })

  test('refuses everyone but the DM once the holding seat has left', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const ana = await makeSeat(t, game.code, 'Ana')
    const ben = await makeSeat(t, game.code, 'Ben')
    const thorin = await makeCharacter(t, game, 'Thorin')
    await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId: thorin })
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
    })
    await t.mutation(api.players.leave, { code: game.code, playerId: ana })
    const before = await placement(t, sceneId, tokenId)

    // The claim went with the seat (ADR 0003 — the pointer runs seat → character),
    // so the token falls back to the DM rather than becoming a free-for-all.
    await expectKind(
      t.mutation(api.board.moveToken, {
        code: game.code,
        sceneId,
        tokenId,
        x: 700,
        y: 700,
        settle: true,
        playerId: ben,
      }),
      'TokenNotYours',
    )
    expect(await placement(t, sceneId, tokenId)).toMatchObject({ x: before!.x, y: before!.y })

    // And Ana retyping her name reclaims the character, so control comes back to her
    // rather than needing the DM to repair it.
    const anaAgain = await makeSeat(t, game.code, 'Ana')
    await t.mutation(api.characters.claim, {
      code: game.code,
      playerId: anaAgain,
      characterId: thorin,
    })
    await t.mutation(api.board.moveToken, {
      code: game.code,
      sceneId,
      tokenId,
      x: 700,
      y: 700,
      settle: true,
      playerId: anaAgain,
    })
    expect(await placement(t, sceneId, tokenId)).toMatchObject(snapToGrid({ x: 700, y: 700 }, GRID, 1))
  })

  test('the DM may move a DM-layer token', async () => {
    const t = harness()
    const fixture = await boardFixture(t)

    await t.mutation(api.board.moveToken, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      sceneId: fixture.sceneId,
      tokenId: fixture.secretToken,
      x: 1500,
      y: 1000,
      settle: true,
    })
    expect(await placement(t, fixture.sceneId, fixture.secretToken)).toMatchObject(
      snapToGrid({ x: 1500, y: 1000 }, GRID, 1),
    )
  })

  test('the DM may move a player-layer token another seat holds', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const ana = await makeSeat(t, game.code, 'Ana')
    const thorin = await makeCharacter(t, game, 'Thorin')
    await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId: thorin })
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
    })

    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      tokenId,
      x: 1120,
      y: 560,
      settle: true,
    })
    expect(await placement(t, sceneId, tokenId)).toMatchObject(
      snapToGrid({ x: 1120, y: 560 }, GRID, 1),
    )
  })
})

describe('placements survive a scene switch', () => {
  /**
   * The row's existence is what places a token on a board, keyed per scene, so
   * switching the group's view must not disturb either layout. Getting this
   * wrong loses a carefully arranged encounter the moment the DM peeks at
   * another map.
   */
  test('each scene keeps its own layout across a switch away and back', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    await calibrate(t, game.code, game.dmCode, cellar)
    await calibrate(t, game.code, game.dmCode, courtyard)
    const tokenId = await addToken(t, game.code, game.dmCode, cellar, { x: 300, y: 300 })
    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: courtyard,
      tokenId,
      x: 1600,
      y: 900,
      settle: true,
    })

    const inCellar = await placement(t, cellar, tokenId)
    const inCourtyard = await placement(t, courtyard, tokenId)
    expect(inCellar).not.toBeNull()
    expect(inCourtyard).not.toBeNull()
    expect({ x: inCellar!.x, y: inCellar!.y }).not.toEqual({ x: inCourtyard!.x, y: inCourtyard!.y })

    await t.mutation(api.scenes.setActive, { code: game.code, dmCode: game.dmCode, sceneId: courtyard })
    await t.mutation(api.scenes.setActive, { code: game.code, dmCode: game.dmCode, sceneId: cellar })

    expect(await placement(t, cellar, tokenId)).toEqual(inCellar)
    expect(await placement(t, courtyard, tokenId)).toEqual(inCourtyard)
    const positions = await t.query(api.board.positions, { code: game.code, sceneId: cellar })
    expect(positions).toEqual([{ tokenId, x: inCellar!.x, y: inCellar!.y }])
  })
})

// ---------------------------------------------------------------------------
// The argument corpora that BOTH token validators are run over
// ---------------------------------------------------------------------------
//
// One array per field, at module scope, and **the sharing is the mechanism rather than a
// tidy-up.** `board.addToken` and `board.updateToken` check a name, a size and a tint
// through one module-private `requireTokenAppearance`, so the set of names, sizes and
// tints a DM may *create* is the set they may *change to*. The way that stops being true
// is not a refactor anybody notices: it is two test corpora that were identical the day
// they were written and then had a case added to one of them. A tint accepted by the edit
// path and refused by the create path is a hole with no file you can read to see it.
//
// So each refusal test below runs the same array through both mutations and compares the
// two refusals with `toEqual` — kind *and* message — rather than settling for both being
// BadInput. That is the assertion that fails if somebody re-inlines the checks, because
// two copies can both refuse `'#fff'` while wording it differently, and a DM reading the
// second wording is reading a second implementation of the same rule.

/**
 * Not `#rrggbb`. The tint is handed straight to a Konva fill, so the pattern is strict:
 * a CSS colour function or a `url(...)` would be a string the browser interprets on every
 * other player's screen, put there by whoever runs the game.
 */
const UNUSABLE_TINTS = [
  'red',
  '#fff',
  '#FFF',
  'c0392b',
  '#c0392',
  '#c0392bb',
  '#GGGGGG',
  '',
  ' #c0392b',
]

/** `#rrggbb` in either case, which both mutations store verbatim rather than normalising. */
const USABLE_TINTS = ['#c0392b', '#C0392B', '#000000', '#ffffff']

/**
 * Outside 1–8, or not a whole number of squares at all.
 *
 * NaN and Infinity belong in here rather than in a separate non-finite test, and that is
 * the reason `updateToken` needs no `requireFinite` of its own: `isUsableTokenSize` tests
 * `Number.isInteger`, which is already `false` for both, so a second check could not fire
 * and this project does not keep guards that cannot fail.
 */
const UNUSABLE_SIZES = [0, -1, 1.5, 2.5, 9, 100, Number.NaN, Number.POSITIVE_INFINITY]

/**
 * Blank once whitespace is collapsed, or past the character-name limit a token borrows.
 *
 * ⚠️ The over-long entry is **new**, and hoisting the array is what made its absence
 * visible: the `addToken` test has been named *rejects a blank or over-long name* since
 * Milestone 2 and only ever sent blanks. A corpus read by two mutations gets read
 * properly, which is a second thing the sharing buys.
 */
const UNUSABLE_NAMES = ['', '   ', '\t\n ', 'x'.repeat(MAX_CHARACTER_NAME_LENGTH + 1)]

describe('board.addToken', () => {
  test('snaps the given point before inserting the placement', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { x: 511.37, y: 91.11 })

    const stored = await placement(t, sceneId, tokenId)
    expect({ x: stored!.x, y: stored!.y }).toEqual(snapToGrid({ x: 511.37, y: 91.11 }, GRID, 1))
  })

  /**
   * Found by running the real app rather than by a test: the token dialog offers the
   * middle of the map as its drop point, so snapping alone put every new token into
   * the square the previous one was already in. Six goblins arrived as one coin with
   * six names printed on top of each other. Each individual write was correct, which
   * is exactly why nothing here caught it.
   */
  test('drops each new token on an empty square rather than stacking them', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)

    // The same requested point every time, as the dialog does.
    const drop = { x: 1120, y: 840 }
    const ids = []
    for (let i = 0; i < 6; i += 1) {
      ids.push(await addToken(t, game.code, game.dmCode, sceneId, { ...drop, name: `Goblin ${i}` }))
    }

    const centres = []
    for (const id of ids) {
      const stored = await placement(t, sceneId, id)
      centres.push(`${stored!.x},${stored!.y}`)
    }
    expect(new Set(centres).size).toBe(6)

    // Still on the grid, and still near where they were asked for — a free square,
    // not an arbitrary one.
    for (const id of ids) {
      const stored = await placement(t, sceneId, id)
      const snapped = snapToGrid({ x: stored!.x, y: stored!.y }, GRID, 1)
      expect({ x: stored!.x, y: stored!.y }).toEqual(snapped)
      expect(Math.abs(stored!.x - drop.x)).toBeLessThanOrEqual(GRID.gridSize * 2)
      expect(Math.abs(stored!.y - drop.y)).toBeLessThanOrEqual(GRID.gridSize * 2)
    }
  })

  /**
   * The displacement above is for *adding* only. Two figures crowding a doorway is a
   * legitimate thing to want, so a move must never shove anything aside.
   */
  test('moveToken does not displace a token already on the square', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    await calibrate(t, game.code, game.dmCode, sceneId)

    const first = await addToken(t, game.code, game.dmCode, sceneId, { x: 1120, y: 840 })
    const second = await addToken(t, game.code, game.dmCode, sceneId, { x: 4000, y: 3000 })
    const settled = await placement(t, sceneId, first)

    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      tokenId: second,
      x: settled!.x,
      y: settled!.y,
      settle: true,
    })

    const a = await placement(t, sceneId, first)
    const b = await placement(t, sceneId, second)
    expect({ x: b!.x, y: b!.y }).toEqual({ x: settled!.x, y: settled!.y })
    expect({ x: a!.x, y: a!.y }).toEqual({ x: settled!.x, y: settled!.y })
  })

  test('rejects a tint that is not a #rrggbb string', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    for (const tint of UNUSABLE_TINTS) {
      await expectKind(addToken(t, game.code, game.dmCode, sceneId, { tint }), 'BadInput')
    }
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })

  test('accepts a #rrggbb tint in either case', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    for (const tint of USABLE_TINTS) {
      const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { tint })
      expect((await tokenRow(t, tokenId))?.tint).toBe(tint)
    }
  })

  test('rejects a sizeSquares outside the drawable range', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    for (const sizeSquares of UNUSABLE_SIZES) {
      await expectKind(addToken(t, game.code, game.dmCode, sceneId, { sizeSquares }), 'BadInput')
    }
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })

  test('rejects a non-finite x or y', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expectKind(addToken(t, game.code, game.dmCode, sceneId, { x: value }), 'BadInput')
      await expectKind(addToken(t, game.code, game.dmCode, sceneId, { y: value }), 'BadInput')
    }
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })

  test('rejects a blank or over-long name', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    for (const name of UNUSABLE_NAMES) {
      await expectKind(addToken(t, game.code, game.dmCode, sceneId, { name }), 'BadInput')
    }
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })

  test('rejects a characterId from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeCharacter(t, other, 'Their Hero')

    await expectKind(
      addToken(t, game.code, game.dmCode, sceneId, { characterId: theirs }),
      'CharacterNotFound',
    )
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })

  test('rejects a sceneId from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    await makeScene(t, game.code, game.dmCode)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')

    await expectKind(addToken(t, game.code, game.dmCode, otherScene), 'SceneNotFound')
  })

  /**
   * The size of the art is read out of storage, not taken from the client, because
   * the browser's downscaler is a courtesy that saves an upload rather than the
   * enforcement — CLAUDE.md invariant 6 is a promise about what is in storage, and a
   * limit only the browser applies is one a client bug silently removes.
   *
   * The blob surviving the refusal is asserted positively, as `scenes.create`'s
   * equivalent test does: a Convex mutation is one transaction, so the refusal cannot
   * delete what it refused, and cleaning up is `files.discard`'s job because that is
   * the call that commits. See ADR 0004.
   */
  test('refuses art over MAX_TOKEN_BYTES, and files.discard clears the blob', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'huge-token', MAX_TOKEN_BYTES + 1)
    expect(await blobExists(t, imageId)).toBe(true)

    await expectKind(addToken(t, game.code, game.dmCode, sceneId, { imageId }), 'BadInput')

    // No token, and no placement either — the whole transaction rolled back.
    expect(await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })).toEqual([])
    expect(
      await t.query(api.board.positions, { code: game.code, sceneId, dmCode: game.dmCode }),
    ).toEqual([])
    // And the blob is still there, for the same reason.
    expect(await blobExists(t, imageId)).toBe(true)

    // The client's catch calls this, and it is the call that commits.
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId })
    expect(await blobExists(t, imageId)).toBe(false)
  })

  test('accepts art of exactly MAX_TOKEN_BYTES', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'exact-token', MAX_TOKEN_BYTES)

    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId })

    expect((await tokenRow(t, tokenId))?.imageId).toBe(imageId)
    const [token] = await t.query(api.board.tokens, { code: game.code })
    expect(typeof token.artUrl).toBe('string')
  })

  /**
   * A storage id that resolves to nothing is what a retried upload path produces —
   * `files.discard` ran and then the create was attempted again with the same id. A
   * token made from it would draw as a blank coin forever, so it is refused rather
   * than stored, exactly as `scenes.create` refuses one.
   */
  test('refuses a storage id that is no longer in storage', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'gone-token')
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId })
    expect(await blobExists(t, imageId)).toBe(false)

    await expectKind(addToken(t, game.code, game.dmCode, sceneId, { imageId }), 'BadInput')
    expect(await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })).toEqual([])
  })

  /** A token with no art at all is the common case, and skips the storage read. */
  test('accepts a token with no imageId', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { name: 'Plain Coin' })

    expect((await tokenRow(t, tokenId))?.imageId).toBeUndefined()
  })

  /**
   * MAX_TOKENS_PER_GAME and MAX_PLACEMENTS_PER_SCENE are both 200, so a single
   * scene cannot exceed the placement cap without first exceeding the token cap.
   * The tokens are split across two scenes so that what is being tested here is
   * unambiguously the game-wide cap.
   */
  test('refuses the token past MAX_TOKENS_PER_GAME', async () => {
    const t = harness()
    const game = await makeGame(t)
    const first = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const second = await makeScene(t, game.code, game.dmCode, 'Courtyard')

    for (let i = 0; i < MAX_TOKENS_PER_GAME; i += 1) {
      await addToken(t, game.code, game.dmCode, i % 2 === 0 ? first : second, {
        name: `Extra ${i}`,
      })
    }

    const refusal = await refusalOf(
      addToken(t, game.code, game.dmCode, first, { name: 'One Too Many' }),
    )
    expect(refusal.message.length).toBeGreaterThan(0)

    // Everything created stays visible: the write cap must match the read bound,
    // or the last tokens added are invisible while still being movable by id.
    const visible = await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })
    expect(visible).toHaveLength(MAX_TOKENS_PER_GAME)
  })
})

// ---------------------------------------------------------------------------
// The four token-edit mutations: cosmetics, two secrecy writes, and the art
// ---------------------------------------------------------------------------
//
// Until these landed, nothing edited a token except `setControllers`: a DM who mistyped a
// name deleted the coin and made another one, and a coin bound to nothing — or sitting on
// a layer nobody is being shown — was unreachable from every screen in the app.
//
// They are four mutations rather than one, and these are four describes rather than one,
// because of what *kind* of fact each one writes. An absolute multi-field write is right
// for cosmetics — one appearance, one form, one commit — and wrong for `layer` and
// `characterId`, because with those folded in every rename would carry a layer value, and
// a client sending a stale one would reveal an ambush as a side effect of fixing a typo.
// `setArt` is separate again for a third reason: it is the only token write that destroys
// data outside the row it patches.
//
// Two things are asserted elsewhere on purpose rather than four times over here. The DM
// gate is one table-driven loop in the `DM gating` describe further down, because all four
// share `requireDm` → `requireDmToken` → argument checks → a writer. And
// what a rebind does to the *derived* half of control is beside the Milestone 7 control
// tests at the bottom of this file, where the fixture that can express it already lives.
//
// One thing is deliberately **not** asserted anywhere: the no-op suppression on
// `setTokenAppearance`, `setTokenLayer` and `setTokenCharacter`. A skipped patch and an
// identical patch leave byte-identical documents, so nothing observable through the public
// API can tell them apart — what the suppression saves is a subscription invalidation,
// which is not a thing the API can be asked about. The reasoning is at the writers, and
// this project does not keep guards that cannot fail. `replaceTokenArt`'s early return is
// a different animal and is tested twice below, because skipping *that* one destroys the
// art.

/**
 * ⚠️ **The defaults here are real values, not *leave this field alone*.**
 *
 * `board.updateToken` is absolute, the shape `scenes.updateGrid` has: all three cosmetic
 * fields travel on every call whether or not the caller cares about them, because a name,
 * a size and a colour are one appearance edited in one form, and committing them
 * separately would show the table a coin nobody chose in between. So a test that names
 * only the tint is still renaming the token to `Guard` and resizing it to 1 square.
 *
 * That is used deliberately by the refusal tests below: each starts from a token whose
 * three fields all differ from these defaults, so a write that landed when it should have
 * been refused shows up in the row comparison in *any* of the three fields rather than
 * only in the one the test was about.
 */
async function updateToken(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  fields: { name?: string; sizeSquares?: number; tint?: string } = {},
) {
  await t.mutation(api.board.updateToken, {
    code: game.code,
    dmCode: game.dmCode,
    tokenId,
    name: fields.name ?? 'Guard',
    sizeSquares: fields.sizeSquares ?? 1,
    tint: fields.tint ?? TINT,
  })
}

async function setLayer(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  layer: 'player' | 'dm',
) {
  await t.mutation(api.board.setLayer, { code: game.code, dmCode: game.dmCode, tokenId, layer })
}

/** `null` unbinds — a **required** argument, so there is one spelling of "none". */
async function setCharacter(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  characterId: Id<'characters'> | null,
) {
  await t.mutation(api.board.setCharacter, {
    code: game.code,
    dmCode: game.dmCode,
    tokenId,
    characterId,
  })
}

/** `null` clears the art, and clearing it deletes the blob. See `replaceTokenArt`. */
async function setArt(
  t: Harness,
  game: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  imageId: Id<'_storage'> | null,
) {
  await t.mutation(api.board.setArt, { code: game.code, dmCode: game.dmCode, tokenId, imageId })
}

/**
 * One token whose name, size and tint all differ from `updateToken`'s defaults, so a
 * refused write that quietly landed is visible in the row comparison whichever field it
 * touched. Shared by the three refusal tests below.
 */
async function appearanceFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
    name: 'Village Guard',
    sizeSquares: 3,
    tint: '#000000',
  })
  return { ...game, sceneId, tokenId }
}

describe('board.updateToken', () => {
  test('refuses every unusable tint exactly as addToken does, and leaves the row alone', async () => {
    const t = harness()
    const fixture = await appearanceFixture(t)
    const before = await tokenRow(t, fixture.tokenId)

    for (const tint of UNUSABLE_TINTS) {
      const refusal = await refusalOf(updateToken(t, fixture, fixture.tokenId, { tint }))
      expect(refusal.kind).toBe('BadInput')
      // Byte-identical to the create path's refusal, because there is one
      // `requireTokenAppearance` rather than two copies that agreed when they were
      // written. See the note above the corpora.
      expect(refusal).toEqual(
        await refusalOf(addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, { tint })),
      )
    }

    expect(await tokenRow(t, fixture.tokenId)).toEqual(before)
  })

  test('refuses every unusable size exactly as addToken does, and leaves the row alone', async () => {
    const t = harness()
    const fixture = await appearanceFixture(t)
    const before = await tokenRow(t, fixture.tokenId)

    for (const sizeSquares of UNUSABLE_SIZES) {
      const refusal = await refusalOf(updateToken(t, fixture, fixture.tokenId, { sizeSquares }))
      expect(refusal.kind).toBe('BadInput')
      expect(refusal).toEqual(
        await refusalOf(
          addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, { sizeSquares }),
        ),
      )
    }

    expect(await tokenRow(t, fixture.tokenId)).toEqual(before)
  })

  test('refuses every unusable name exactly as addToken does, and leaves the row alone', async () => {
    const t = harness()
    const fixture = await appearanceFixture(t)
    const before = await tokenRow(t, fixture.tokenId)

    for (const name of UNUSABLE_NAMES) {
      const refusal = await refusalOf(updateToken(t, fixture, fixture.tokenId, { name }))
      expect(refusal.kind).toBe('BadInput')
      expect(refusal).toEqual(
        await refusalOf(addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, { name })),
      )
    }

    expect(await tokenRow(t, fixture.tokenId)).toEqual(before)
  })

  /**
   * The accepted ends of both ranges, round-tripped through the stored row *and* through
   * the query the board actually draws from — the second is the one a client would notice
   * being wrong, and a projection that dropped a field would still leave the row correct.
   *
   * 1 and 8 are the inclusive bounds `isUsableTokenSize` allows. Both tint cases are
   * stored verbatim rather than normalised: Konva does not care, and rewriting what
   * somebody typed is a change nobody asked for.
   */
  test('round-trips a size of 1 and of 8, and a tint in either case', async () => {
    const t = harness()
    const fixture = await appearanceFixture(t)

    for (const sizeSquares of [1, 8]) {
      for (const tint of USABLE_TINTS) {
        const name = `Ogre ${sizeSquares} ${tint}`
        await updateToken(t, fixture, fixture.tokenId, { name, sizeSquares, tint })

        expect(await tokenRow(t, fixture.tokenId)).toMatchObject({ name, sizeSquares, tint })
        const [payload] = await t.query(api.board.tokens, { code: fixture.code })
        expect(payload).toMatchObject({ name, sizeSquares, tint })
      }
    }
  })

  /**
   * The limit is inclusive, and it is the *character* name limit rather than a fourth
   * number for a client to have to know about — a token names a creature.
   *
   * The padded name is the second half of the same assertion, and it is about the writer
   * rather than the check. `requireTokenAppearance` hands back all three fields
   * normalised, and `setTokenAppearance` patches the object it was handed rather than
   * reaching back into the raw arguments; a stored name with the DM's stray spaces still
   * in it is precisely the bug that arrangement exists to remove.
   */
  test('accepts a name of exactly MAX_CHARACTER_NAME_LENGTH, and stores it collapsed', async () => {
    const t = harness()
    const fixture = await appearanceFixture(t)

    const exact = 'x'.repeat(MAX_CHARACTER_NAME_LENGTH)
    await updateToken(t, fixture, fixture.tokenId, { name: exact })
    expect((await tokenRow(t, fixture.tokenId))?.name).toBe(exact)

    await updateToken(t, fixture, fixture.tokenId, { name: '  Sir   Robin  ' })
    expect((await tokenRow(t, fixture.tokenId))?.name).toBe('Sir Robin')
  })
})

describe('board.setLayer', () => {
  /**
   * ⚠️ **The broadest secrecy write on the board**, asserted the way this file asserts
   * every secret: a substring scan of the serialised payload, with a positive control
   * beside it so the scan cannot pass on an empty fixture.
   *
   * Not a length check, for the reason the first describe in this file gives. A length
   * check is satisfied the moment the array empties, so it keeps passing when the hidden
   * coin arrives nested inside a legitimate row — a sibling field, an expanded position, a
   * debugging echo of the arguments. The id, the name and the art URL are each
   * independently enough to tell a player where the ambush is.
   *
   * **Both halves of the board are scanned, and the placement is most of the secret.** A
   * position row pointing at a hidden token says *something is standing there*, which is
   * what the DM was hiding in the first place. It goes because each placement is hydrated
   * back to its token and decided by the same `maySee`, with nothing written to the
   * position row at all.
   */
  test('hiding a token empties both of the player’s payloads and neither of the DM’s', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    // Captured from the DM's own view before the flip, so the scan hunts for the real
    // signed URL rather than for an invented string.
    const open = await dmTokenPayload(t, fixture, fixture.openToken)
    expect(typeof open.artUrl).toBe('string')

    await setLayer(t, fixture, fixture.openToken, 'dm')
    expect((await tokenRow(t, fixture.openToken))?.layer).toBe('dm')

    for (const payload of [
      await t.query(api.board.tokens, { code: fixture.code }),
      await t.query(api.board.positions, { code: fixture.code, sceneId: fixture.sceneId }),
    ]) {
      const serialised = JSON.stringify(payload) ?? ''
      expect(serialised).not.toContain(fixture.openToken)
      expect(serialised).not.toContain('Village Guard')
      expect(serialised).not.toContain(open.artUrl as string)
    }

    // The positive control, and the reason the scan above is a statement about the
    // audience rather than about the fixture having emptied: all three strings are still
    // in the DM's payloads, and so is the placement.
    const dmTokens = JSON.stringify(
      await t.query(api.board.tokens, { code: fixture.code, dmCode: fixture.dmCode }),
    )
    expect(dmTokens).toContain(fixture.openToken)
    expect(dmTokens).toContain('Village Guard')
    expect(dmTokens).toContain(open.artUrl as string)
    const dmPositions = JSON.stringify(
      await t.query(api.board.positions, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        dmCode: fixture.dmCode,
      }),
    )
    expect(dmPositions).toContain(fixture.openToken)
  })

  test('flipping it back to the player layer restores the coin, its position and its art', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const before = await placement(t, fixture.sceneId, fixture.openToken)
    const open = await dmTokenPayload(t, fixture, fixture.openToken)

    await setLayer(t, fixture, fixture.openToken, 'dm')
    expect(await t.query(api.board.tokens, { code: fixture.code })).toEqual([])

    await setLayer(t, fixture, fixture.openToken, 'player')

    const restored = await t.query(api.board.tokens, { code: fixture.code })
    expect(restored.map((token) => token._id)).toEqual([fixture.openToken])
    expect(restored[0]).toMatchObject({ name: 'Village Guard', artUrl: open.artUrl })
    // ⚠️ The placement was never deleted, and that is what makes the round trip a reveal
    // rather than a re-placement: hiding a token filters the row out of the player's
    // payload, it does not take the coin off the map. A DM who hides a carefully arranged
    // encounter and reveals it again gets the arrangement back.
    expect(await placement(t, fixture.sceneId, fixture.openToken)).toEqual(before)
    expect(
      await t.query(api.board.positions, { code: fixture.code, sceneId: fixture.sceneId }),
    ).toEqual([{ tokenId: fixture.openToken, x: before!.x, y: before!.y }])
  })

  /**
   * The other direction, and the one the mutation exists for: the ambush the DM prepared
   * before the session arrives on every player's board in one write, in the square it was
   * already standing in.
   */
  test('revealing a DM-layer token publishes its name, art and position', async () => {
    const t = harness()
    const fixture = await boardFixture(t)

    // The precondition, which is the whole of the first describe in this file.
    expect(JSON.stringify(await t.query(api.board.tokens, { code: fixture.code }))).not.toContain(
      'Ambush Skeleton',
    )

    await setLayer(t, fixture, fixture.secretToken, 'player')

    const asPlayer = await t.query(api.board.tokens, { code: fixture.code })
    expect([...asPlayer.map((token) => token._id)].sort()).toEqual(
      [fixture.openToken, fixture.secretToken].sort(),
    )
    const revealed = asPlayer.find((token) => token._id === fixture.secretToken)
    expect(revealed?.name).toBe('Ambush Skeleton')
    expect(revealed?.artUrl).toBe(fixture.secret.artUrl)

    const positions = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    expect([...positions.map((row) => row.tokenId)].sort()).toEqual(
      [fixture.openToken, fixture.secretToken].sort(),
    )
  })

  /**
   * The same parity `moveToken` and `removeToken` keep, through the same shared
   * `TOKEN_NOT_FOUND`. A DM has no existence oracle to gain here, so the value is the
   * parity itself: one call site quietly wording its own refusal is how a shared constant
   * becomes four literals again.
   */
  test('a vanished token and another game’s token refuse identically', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    const theirToken = await addToken(t, other.code, other.dmCode, otherScene, { name: 'Theirs' })
    const ghost = await vanishedTokenId(t)

    const vanished = await refusalOf(setLayer(t, fixture, ghost, 'dm'))
    expect(vanished.kind).toBe('TokenNotFound')
    expect(await refusalOf(setLayer(t, fixture, theirToken, 'dm'))).toEqual(vanished)

    // The other table's coin is still on the layer its own DM put it on — this game's DM
    // code does not reach it.
    expect((await tokenRow(t, theirToken))?.layer).toBe('player')
  })
})

describe('board.setCharacter', () => {
  /**
   * The check is `getCharacterInGame`, the same line `addToken` runs, so the two refuse an
   * id from another table identically and neither can leave a coin on this board standing
   * for somebody else's hero. Asserted from both ends, as the `addToken` equivalent is:
   * the refusal, and the binding that did not move.
   */
  test('refuses a characterId from another game and writes nothing', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const thorin = await makeCharacter(t, game, 'Thorin')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
    })
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeCharacter(t, other, 'Their Hero')

    await expectKind(setCharacter(t, game, tokenId, theirs), 'CharacterNotFound')

    expect((await tokenRow(t, tokenId))?.characterId).toBe(thorin)
    const [payload] = await t.query(api.board.tokens, { code: game.code })
    expect(payload.characterId).toBe(thorin)
  })

  /**
   * ⚠️ **`null` as a present key, never a dropped field**, which is the same distinction
   * `board.tokens` already makes for `artUrl`: `undefined` is not a Convex value, so an
   * optional column has to become *something* on the way out, and a client reading
   * `token.characterId === undefined` as "unbound" would be reading the absence of a field
   * rather than the answer to a question.
   *
   * The stored side is the opposite spelling on purpose. `setTokenCharacter` patches
   * `undefined`, which is what `detachCharacterFromTokens` writes when a character is
   * deleted, so the two routes to an unbound token leave one shape of row rather than two
   * for the smoke script's field-by-field rebuild to report as *present on one side only*.
   */
  test('null unbinds, and the payload reports characterId: null as a present key', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const thorin = await makeCharacter(t, game, 'Thorin')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, {
      name: 'Thorin',
      characterId: thorin,
    })

    await setCharacter(t, game, tokenId, null)

    expect((await tokenRow(t, tokenId))?.characterId).toBeUndefined()
    const [payload] = await t.query(api.board.tokens, { code: game.code })
    expect(payload).toHaveProperty('characterId', null)
    expect(Object.keys(payload)).toContain('characterId')

    // The character document is untouched: the pointer runs token → character, so
    // unbinding is a fact about the coin and never about the creature.
    expect(
      (await t.query(api.characters.list, { code: game.code, dmCode: game.dmCode })).map(
        (character) => character._id,
      ),
    ).toEqual([thorin])
  })

  test('binds a coin that stood for nothing, and rebinds a coin that stood for somebody', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const thorin = await makeCharacter(t, game, 'Thorin')
    const balin = await makeCharacter(t, game, 'Balin')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { name: 'Loose Barrel' })
    expect((await tokenRow(t, tokenId))?.characterId).toBeUndefined()

    await setCharacter(t, game, tokenId, thorin)
    expect((await tokenRow(t, tokenId))?.characterId).toBe(thorin)
    expect((await t.query(api.board.tokens, { code: game.code }))[0].characterId).toBe(thorin)

    await setCharacter(t, game, tokenId, balin)
    expect((await tokenRow(t, tokenId))?.characterId).toBe(balin)
    expect((await t.query(api.board.tokens, { code: game.code }))[0].characterId).toBe(balin)
  })
})

describe('board.setArt', () => {
  /**
   * The pair from `addToken`'s equivalent test, plus the half only an *edit* can get
   * wrong: the art the token was already drawing has to survive a refused swap, or a
   * rejected upload becomes a way to blank a coin.
   *
   * The byte count is read out of storage rather than taken as an argument, because it is
   * the client being checked — CLAUDE.md invariant 6 is a promise about what is in
   * storage, and a limit only the browser applies is one a client bug silently removes.
   * The refused blob then survives because a Convex mutation is one transaction: the
   * `ctx.storage.delete` that would tidy up after a throw is rolled back with the throw
   * itself, so cleaning up is `files.discard`'s job because that is the call that commits.
   * See ADR 0004.
   */
  test('refuses art over MAX_TOKEN_BYTES, keeps the old art, leaves the blob', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'original-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })
    const huge = await storeImage(t, 'huge-token', MAX_TOKEN_BYTES + 1)

    const refusal = await refusalOf(setArt(t, game, tokenId, huge))
    expect(refusal.kind).toBe('BadInput')
    // Byte-identical to `addToken`'s, for the reason the appearance corpora are shared:
    // one `requireTokenArt`, so the blobs a DM may create a token from are exactly the
    // blobs they may change it to.
    expect(refusal).toEqual(
      await refusalOf(addToken(t, game.code, game.dmCode, sceneId, { imageId: huge })),
    )

    expect((await tokenRow(t, tokenId))?.imageId).toBe(original)
    expect(await blobExists(t, original)).toBe(true)
    expect(await blobExists(t, huge)).toBe(true)

    // The client's catch calls this, and it is the call that commits.
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId: huge })
    expect(await blobExists(t, huge)).toBe(false)
    // And the cleanup could not have taken the live art with it even if the client had
    // mis-sequenced it: `discard` refuses a blob a token still points at, which is the
    // guard the whole swap path below depends on.
    expect(await blobExists(t, original)).toBe(true)
  })

  /**
   * A storage id that resolves to nothing is what a retried upload path produces —
   * `files.discard` ran and then the write was attempted again with the same id. Pointing
   * a token at it would leave a blank coin forever, so it is refused rather than stored,
   * exactly as `addToken` and `scenes.create` refuse one.
   */
  test('refuses a storage id that is no longer in storage, and keeps the old art', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'original-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })
    const gone = await storeImage(t, 'gone-token')
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId: gone })
    expect(await blobExists(t, gone)).toBe(false)

    await expectKind(setArt(t, game, tokenId, gone), 'BadInput')

    expect((await tokenRow(t, tokenId))?.imageId).toBe(original)
    expect(await blobExists(t, original)).toBe(true)
  })

  /**
   * The swap itself, and the three facts that make it a *replacement*: the row points at
   * the new blob, the old blob is gone, and the URL the board draws from changed.
   *
   * The URLs really do differ because `storeImage` writes distinct bytes per label —
   * convex-test derives a stored file's URL from the SHA-256 of its contents, so two
   * identical blobs would share one URL and this assertion would pass for the wrong
   * reason.
   */
  test('a swap deletes the old blob, keeps the new one, and changes the art URL', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'original-art')
    const replacement = await storeImage(t, 'replacement-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })
    const before = await dmTokenPayload(t, game, tokenId)

    await setArt(t, game, tokenId, replacement)

    expect((await tokenRow(t, tokenId))?.imageId).toBe(replacement)
    expect(await blobExists(t, original)).toBe(false)
    expect(await blobExists(t, replacement)).toBe(true)
    const after = await dmTokenPayload(t, game, tokenId)
    expect(typeof after.artUrl).toBe('string')
    expect(after.artUrl).not.toBe(before.artUrl)
  })

  test('imageId: null clears the art, deletes the blob, and reports artUrl: null', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'original-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })

    await setArt(t, game, tokenId, null)

    expect((await tokenRow(t, tokenId))?.imageId).toBeUndefined()
    expect(await blobExists(t, original)).toBe(false)
    const [payload] = await t.query(api.board.tokens, { code: game.code })
    expect(payload).toHaveProperty('artUrl', null)

    // Idempotent, and for the same reason the guard below exists rather than by luck:
    // `previous === imageId` is true of `null === null`, so a second clear is not a second
    // delete of a blob that has already gone.
    await setArt(t, game, tokenId, null)
    expect((await tokenRow(t, tokenId))?.imageId).toBeUndefined()
  })

  /**
   * ⚠️ **THE DATA-LOSS GUARD, AND THE MOST VALUABLE TEST IN THIS DESCRIBE.**
   *
   * `replaceTokenArt` patches the row and then deletes the blob it *was* pointing at,
   * unconditionally. Without its `previous === imageId` early return, re-submitting the id
   * a token already carries would patch the row to point at that blob and then delete the
   * blob — leaving a coin drawing nothing, holding a valid-looking `imageId`, with nothing
   * in the app able to explain why afterwards. The DM's art picker is one double-click
   * away from producing exactly that call, and the failure is silent: the mutation
   * succeeds, and the picture disappears.
   *
   * It is also the one no-op suppression in this milestone that is **observable**, which
   * is why it is the one that is tested. The other three writers skip an identical patch,
   * and a skipped patch and an identical patch leave byte-identical documents; see the
   * note at the top of this section.
   */
  test('setting the same imageId twice leaves the art intact', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'sticky-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })
    const before = await dmTokenPayload(t, game, tokenId)
    expect(typeof before.artUrl).toBe('string')

    await setArt(t, game, tokenId, original)
    await setArt(t, game, tokenId, original)

    expect(await blobExists(t, original)).toBe(true)
    expect((await tokenRow(t, tokenId))?.imageId).toBe(original)
    // Through the query too, because the row pointing at a deleted blob is the shape the
    // bug takes: `getUrl` of a blob that has gone is null, and the board draws a plain
    // tinted coin for that exactly as it does for a token with no art at all.
    const after = await dmTokenPayload(t, game, tokenId)
    expect(typeof after.artUrl).toBe('string')
    expect(after.artUrl).toBe(before.artUrl)
  })

  /**
   * The reference moved with the pointer, asserted from `files.discard`'s side.
   *
   * This is the mirror image of the refused-blob case above and is easy to get backwards:
   * `discard` cannot be the way the *old* art is removed, because it refuses any blob a
   * token still points at. So the only transaction permitted to delete the outgoing blob
   * is the one that stops referencing it, which is why the delete lives inside
   * `replaceTokenArt` and why a client sequencing it the other way round is simply told
   * the image is in use.
   */
  test('files.discard refuses the new blob after a swap, and the old one has already gone', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const original = await storeImage(t, 'original-art')
    const replacement = await storeImage(t, 'replacement-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId: original })

    await setArt(t, game, tokenId, replacement)

    await expectKind(
      t.mutation(api.files.discard, {
        code: game.code,
        dmCode: game.dmCode,
        imageId: replacement,
      }),
      'BadInput',
    )
    expect(await blobExists(t, replacement)).toBe(true)
    expect(await blobExists(t, original)).toBe(false)
  })
})

describe('board.removeToken', () => {
  test('clears the placements on every scene and deletes the token', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    const survivor = await addToken(t, game.code, game.dmCode, cellar, { name: 'Survivor' })
    const doomed = await addToken(t, game.code, game.dmCode, cellar, { name: 'Doomed' })
    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: courtyard,
      tokenId: doomed,
      x: 800,
      y: 800,
      settle: true,
    })
    expect(await placementsOf(t, doomed)).toHaveLength(2)

    await t.mutation(api.board.removeToken, {
      code: game.code,
      dmCode: game.dmCode,
      tokenId: doomed,
    })

    expect(await placementsOf(t, doomed)).toEqual([])
    expect(await tokenRow(t, doomed)).toBeNull()
    // The other token's placement is untouched.
    expect(await placementsOf(t, survivor)).toHaveLength(1)
    expect(await tokenRow(t, survivor)).not.toBeNull()
  })

  test('deletes the token’s art blob', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'doomed-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId })

    await t.mutation(api.board.removeToken, { code: game.code, dmCode: game.dmCode, tokenId })

    expect(await t.run(async (ctx) => await ctx.db.system.get('_storage', imageId))).toBeNull()
  })

  test('frees room under the cap again', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const first = await addToken(t, game.code, game.dmCode, sceneId, { name: 'First' })
    await t.mutation(api.board.removeToken, {
      code: game.code,
      dmCode: game.dmCode,
      tokenId: first,
    })
    expect(await t.query(api.board.tokens, { code: game.code })).toEqual([])
  })
})

describe('files.discard refuses art that is still in use', () => {
  /**
   * `discard` is DM-gated, which bounds who can call it — but the caller is the DM's
   * own client, calling from an error path with an id it may have mis-sequenced, so
   * the gate is not the same thing as the call being correct. Deleting the art of a
   * token that is on the board would strip a creature to a blank coin with nothing in
   * the app able to explain why.
   */
  test('a live token’s art survives a discard, and goes when the token does', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'live-token-art')
    const tokenId = await addToken(t, game.code, game.dmCode, sceneId, { imageId })

    await expectKind(
      t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId }),
      'BadInput',
    )
    expect(await blobExists(t, imageId)).toBe(true)

    // `removeToken` is the way to delete art that is in use, because it deletes the
    // thing using it in the same transaction.
    await t.mutation(api.board.removeToken, { code: game.code, dmCode: game.dmCode, tokenId })
    expect(await blobExists(t, imageId)).toBe(false)
  })

  /**
   * Both layers, and this is the case that matters most: the DM's hidden encounter
   * art is exactly as much in use as a hero's portrait, and a check that read only the
   * visible half would blank out the ambush it was hiding.
   */
  test('a DM-layer token’s art is protected too', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)
    const imageId = await storeImage(t, 'secret-token-art')
    await addToken(t, game.code, game.dmCode, sceneId, { layer: 'dm', imageId })

    await expectKind(
      t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId }),
      'BadInput',
    )
    expect(await blobExists(t, imageId)).toBe(true)
  })

  /** The control: a blob nothing points at is still discarded, or the guard is useless. */
  test('an unreferenced blob is still deleted', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'orphan')

    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId })
    expect(await blobExists(t, imageId)).toBe(false)
  })
})

describe('DM gating', () => {
  test('addToken and removeToken refuse a wrong, empty or foreign DM code', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')

    for (const dmCode of [twiddle(fixture.dmCode), '', '   ', other.dmCode]) {
      await expectKind(
        addToken(t, fixture.code, dmCode, fixture.sceneId, { name: 'Intruder' }),
        'NotDm',
      )
      await expectKind(
        t.mutation(api.board.removeToken, {
          code: fixture.code,
          dmCode,
          tokenId: fixture.openToken,
        }),
        'NotDm',
      )
    }

    // Nothing was added and nothing was removed.
    const tokens = await t.query(api.board.tokens, { code: fixture.code, dmCode: fixture.dmCode })
    expect(tokens.map((token) => token.name).sort()).toEqual(['Ambush Skeleton', 'Village Guard'])
  })

  /**
   * ⚠️ **One loop over four mutations rather than four copies of the describe above, and
   * the table is the point.**
   *
   * Every one of these begins `requireDm` → `requireDmToken`, and the pair is the whole
   * gate. That is one property shared by four handlers, so it wants one assertion
   * parameterised four ways: a hand-written describe each is four places for the fifth
   * token mutation to be forgotten, and the one that gets forgotten is the one written in
   * a hurry — which is also the one most likely to have reached for the wrong lookup.
   *
   * ⚠️ **The table still earns its place now that `requireDmToken` exists, and it is worth
   * saying why rather than assuming.** The helper is what makes the two lines *hard to get
   * wrong* — the literal `true` and the ordering property live inside it, so a call site
   * cannot mis-spell either — but nothing mechanical stops a sixth mutation calling
   * `requireMovableToken` directly with an `isDm` it computed itself, or running its writer
   * before its gate. This tests the composition through the public API, which is the only
   * place that distinction is observable.
   *
   * Every argument below differs from what the fixture's token already stores — a
   * different name, size, tint, layer, character and blob — so a write that landed is
   * visible in the row comparison whichever field it touched. `toEqual` on the whole
   * document rather than a field-by-field check, for the same reason: a gate that leaked
   * one patch through is a gate that leaked, whatever it happened to write.
   */
  test('the four token-edit mutations refuse a wrong, empty or foreign DM code', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const thorin = await makeCharacter(t, fixture, 'Thorin')
    const spareArt = await storeImage(t, 'spare-art')
    const before = await tokenRow(t, fixture.openToken)

    const edits: { name: string; call: (dmCode: string) => Promise<unknown> }[] = [
      {
        name: 'updateToken',
        call: (dmCode) =>
          t.mutation(api.board.updateToken, {
            code: fixture.code,
            dmCode,
            tokenId: fixture.openToken,
            name: 'Intruder',
            sizeSquares: 4,
            tint: '#ffffff',
          }),
      },
      {
        name: 'setLayer',
        call: (dmCode) =>
          t.mutation(api.board.setLayer, {
            code: fixture.code,
            dmCode,
            tokenId: fixture.openToken,
            layer: 'dm',
          }),
      },
      {
        name: 'setCharacter',
        call: (dmCode) =>
          t.mutation(api.board.setCharacter, {
            code: fixture.code,
            dmCode,
            tokenId: fixture.openToken,
            characterId: thorin,
          }),
      },
      {
        name: 'setArt',
        call: (dmCode) =>
          t.mutation(api.board.setArt, {
            code: fixture.code,
            dmCode,
            tokenId: fixture.openToken,
            imageId: spareArt,
          }),
      },
    ]

    for (const edit of edits) {
      for (const dmCode of [twiddle(fixture.dmCode), '', '   ', other.dmCode]) {
        await expectKind(edit.call(dmCode), 'NotDm')
        expect(await tokenRow(t, fixture.openToken), `${edit.name} wrote the row`).toEqual(before)
      }
    }

    // `setArt` is the one of the four that destroys data outside the row, so the gate has
    // to be asserted in storage as well: neither the art the token is drawing nor the blob
    // the refused call was pointing at may have been touched.
    expect(await blobExists(t, spareArt)).toBe(true)
    expect(await blobExists(t, before!.imageId!)).toBe(true)
    // And the same statement made where it actually matters. The row comparison above
    // already covers `layer`, but `setLayer` is a secrecy write and this is the payload
    // whose contents are the secret, so it is worth reading the answer off the query a
    // player's client subscribes to rather than only off the document behind it.
    expect(
      (await t.query(api.board.tokens, { code: fixture.code })).map((token) => token._id),
    ).toEqual([fixture.openToken])
  })

  test('games.start and games.returnToLobby refuse a wrong DM code', async () => {
    const t = harness()
    const fixture = await boardFixture(t)

    for (const dmCode of [twiddle(fixture.dmCode), '', '   ']) {
      await expectKind(t.mutation(api.games.start, { code: fixture.code, dmCode }), 'NotDm')
      await expectKind(t.mutation(api.games.returnToLobby, { code: fixture.code, dmCode }), 'NotDm')
    }
    expect((await t.query(api.games.getByCode, { code: fixture.code }))?.status).toBe('lobby')
  })
})

describe('games.start and games.returnToLobby', () => {
  /**
   * Starting into a board with no map would flip every client to an empty stage
   * with no way back except the DM noticing. Refusing is the whole guard.
   */
  test('refuses to start a game with no active scene', async () => {
    const t = harness()
    const game = await makeGame(t)

    await expectKind(
      t.mutation(api.games.start, { code: game.code, dmCode: game.dmCode }),
      'BadInput',
    )
    expect((await t.query(api.games.getByCode, { code: game.code }))?.status).toBe('lobby')
  })

  test('starts once a scene exists, and returns to the lobby again', async () => {
    const t = harness()
    const game = await makeGame(t)
    const sceneId = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.games.start, { code: game.code, dmCode: game.dmCode })
    const started = await t.query(api.games.getByCode, { code: game.code })
    expect(started?.status).toBe('playing')
    expect(started?.activeSceneId).toBe(sceneId)

    await t.mutation(api.games.returnToLobby, { code: game.code, dmCode: game.dmCode })
    expect((await t.query(api.games.getByCode, { code: game.code }))?.status).toBe('lobby')

    // Idempotent in both directions — a double click must not throw.
    await t.mutation(api.games.returnToLobby, { code: game.code, dmCode: game.dmCode })
    await t.mutation(api.games.start, { code: game.code, dmCode: game.dmCode })
    await t.mutation(api.games.start, { code: game.code, dmCode: game.dmCode })
    expect((await t.query(api.games.getByCode, { code: game.code }))?.status).toBe('playing')
  })

  test('refuses to start against an unknown game code', async () => {
    const t = harness()
    const game = await makeGame(t)
    await expectKind(
      t.mutation(api.games.start, { code: 'ZZZZZZ', dmCode: game.dmCode }),
      'GameNotFound',
    )
  })

  test('returning to the lobby leaves the scene and every placement alone', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const before = await placement(t, fixture.sceneId, fixture.openToken)

    await t.mutation(api.games.start, { code: fixture.code, dmCode: fixture.dmCode })
    await t.mutation(api.games.returnToLobby, { code: fixture.code, dmCode: fixture.dmCode })

    expect(await placement(t, fixture.sceneId, fixture.openToken)).toEqual(before)
    expect((await t.query(api.games.getByCode, { code: fixture.code }))?.activeSceneId).toBe(
      fixture.sceneId,
    )
  })
})

// ---------------------------------------------------------------------------
// Milestone 7: controllers — who may move a token, and where the answer comes from
// ---------------------------------------------------------------------------
//
// The payload now carries the control rule's **answer** as well as its **input**, so
// the browser derives neither. That is the repair ADR 0005 predicted for `useBoard`'s
// token → character → my-character walk, and it only pays off if the two fields really
// are different facts — a `grantedPlayerIds` that had quietly become a copy of
// `controllerIds` would let the DM's dialog untick the seat playing the character, and
// nothing about the types would notice.
//
// So every test below asserts both arrays, and the interesting cases are the ones where
// they differ.

/** A board with one seat, one hero it holds, and a loose token attached to nothing. */
async function controlFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  await calibrate(t, game.code, game.dmCode, sceneId)

  const ana = await makeSeat(t, game.code, 'Ana')
  const ben = await makeSeat(t, game.code, 'Ben')
  const thorin = await makeCharacter(t, game, 'Thorin')

  const heroToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: 'Thorin',
    characterId: thorin,
    x: 300,
    y: 300,
  })
  const looseToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: 'Loose Barrel',
    x: 900,
    y: 300,
  })

  return { ...game, sceneId, ana, ben, thorin, heroToken, looseToken }
}

type ControlFixture = Awaited<ReturnType<typeof controlFixture>>

async function setControllers(
  t: Harness,
  fixture: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  playerIds: Id<'players'>[],
) {
  await t.mutation(api.board.setControllers, {
    code: fixture.code,
    dmCode: fixture.dmCode,
    tokenId,
    playerIds,
  })
}

/** One token off the real query, by id, as a player's client would receive it. */
async function tokenPayload(t: Harness, fixture: ControlFixture, tokenId: Id<'tokens'>) {
  const tokens = await t.query(api.board.tokens, { code: fixture.code })
  const token = tokens.find((row) => row._id === tokenId)
  if (!token) throw new Error(`token ${tokenId} is not in the player payload`)
  return token
}

describe('board.tokens carries both halves of the control rule', () => {
  /**
   * ⚠️ **ZERO GRANTS AND NO CLAIM IS THE EMPTY ARRAY, WHICH MEANS THE DM ALONE.**
   *
   * This is the correction Milestone 2 shipped after the first real session, restated as
   * a payload assertion. Control used to be *assumed* for a token with no character
   * attached, on the reasoning that a creature nobody is playing should still be
   * draggable — and since every NPC the DM adds has no character attached, the whole
   * table could shove the monsters around. An unattached token is the DM's, and the DM is
   * never a member of either array: being the DM is holding the DM code (invariant 7),
   * and a seat id in a list is not that.
   */
  test('a token with no grant and no claim reports both arrays empty', async () => {
    const t = harness()
    const fixture = await controlFixture(t)

    const loose = await tokenPayload(t, fixture, fixture.looseToken)
    expect(loose.controllerIds).toEqual([])
    expect(loose.grantedPlayerIds).toEqual([])

    // Unclaimed but *attached* is the same answer: a hero nobody has picked up is the
    // DM's, exactly as a barrel is.
    const hero = await tokenPayload(t, fixture, fixture.heroToken)
    expect(hero.controllerIds).toEqual([])
    expect(hero.grantedPlayerIds).toEqual([])

    // Nothing is stored, either — the derived default is derived rather than written.
    expect((await tokenRow(t, fixture.looseToken))?.controllerIds).toBeUndefined()
  })

  /**
   * ⚠️ **THE CASE WHERE THE TWO FIELDS DIFFER, WHICH IS THE WHOLE REASON THERE ARE TWO.**
   *
   * The seat playing the token's character is in `controllerIds` and absent from
   * `grantedPlayerIds`, because a claim lives on the seat (ADR 0002, seat → character and
   * never the reverse) and is composed into the effective set rather than written into
   * the stored one. That difference *is* the derived half, and it is what lets the DM's
   * dialog render "plays this character, always in control" as checked-and-disabled
   * honestly instead of subtracting the holder back out in the browser.
   */
  test('a claim puts the holder in controllerIds and never in grantedPlayerIds', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, ana, thorin } = fixture

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const hero = await tokenPayload(t, fixture, fixture.heroToken)
    expect(hero.controllerIds).toEqual([ana])
    expect(hero.grantedPlayerIds).toEqual([])
    // Nothing was written to the token to make that true.
    expect((await tokenRow(t, fixture.heroToken))?.controllerIds).toBeUndefined()

    // Releasing takes it away again, because the claim was the only thing holding it.
    await t.mutation(api.characters.release, { code, playerId: ana })
    expect((await tokenPayload(t, fixture, fixture.heroToken)).controllerIds).toEqual([])
  })

  /** A grant is stored verbatim, and appears in both arrays because it is in both. */
  test('a grant appears in grantedPlayerIds and in controllerIds', async () => {
    const t = harness()
    const fixture = await controlFixture(t)

    await setControllers(t, fixture, fixture.looseToken, [fixture.ben])

    const loose = await tokenPayload(t, fixture, fixture.looseToken)
    expect(loose.grantedPlayerIds).toEqual([fixture.ben])
    expect(loose.controllerIds).toEqual([fixture.ben])
    expect((await tokenRow(t, fixture.looseToken))?.controllerIds).toEqual([fixture.ben])
  })

  /**
   * Holder and grant together, which is the state the DM's dialog actually renders: two
   * seats in `controllerIds` and one of them in `grantedPlayerIds`.
   *
   * And the union really is a union. Granting the token to the very seat already playing
   * its character is an ordinary thing to click, and a duplicate id would reach the
   * dialog as one player with two checkboxes.
   */
  test('a holder and a grant compose, and granting the holder does not double them up', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, ana, ben, thorin } = fixture
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await setControllers(t, fixture, fixture.heroToken, [ben])
    const both = await tokenPayload(t, fixture, fixture.heroToken)
    expect([...both.controllerIds].sort()).toEqual([ana, ben].sort())
    expect(both.grantedPlayerIds).toEqual([ben])

    await setControllers(t, fixture, fixture.heroToken, [ana, ben, ana])
    const deduped = await tokenPayload(t, fixture, fixture.heroToken)
    expect([...deduped.controllerIds].sort()).toEqual([ana, ben].sort())
    expect([...deduped.grantedPlayerIds].sort()).toEqual([ana, ben].sort())
  })
})

describe('board.setCharacter moves the derived half of control and writes nothing', () => {
  /**
   * ⚠️ **THE NO-MIGRATION PAIR, AND THE WHOLE REASON `setTokenCharacter` MUST NOT TOUCH
   * `controllerIds`.**
   *
   * A grant is of the token; the claim holder is composed *in* by `effectiveControllersOf`
   * from whatever the token points at now. So a rebind changes who may move a coin without
   * anything being written about who may move it — and these two tests are the assertion
   * that the derived half really is derived. Migrating the array on a rebind instead would
   * write the derived half down, which is the denormalisation ADR 0004 refused for `layer`
   * for the same reason, and the bug that follows is a token still listing the seat that
   * played the creature it is no longer bound to: a stale grant that authorises a real drag
   * and that the DM's dialog renders as a box it has no way to explain.
   *
   * ⚠️ **This is also the sharpest reason `publicTokenValidator` carries two fields rather
   * than one.** `controllerIds` moves here and `grantedPlayerIds` does not, in the same
   * write, with nothing written to the token to make either true. A dialog handed only the
   * effective set would have to subtract the claim holder back out to know which boxes it
   * may untick — the control rule, re-implemented in the browser, where nothing checks it
   * against the server's.
   */
  test('binding to a claimed hero adds the holder and leaves the grants alone', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, ana, ben, thorin, looseToken } = fixture
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await setControllers(t, fixture, looseToken, [ben])

    // The precondition: Ben by grant, Ana nowhere, because the barrel is nobody's.
    expect((await tokenPayload(t, fixture, looseToken)).controllerIds).toEqual([ben])

    await setCharacter(t, fixture, looseToken, thorin)

    const bound = await tokenPayload(t, fixture, looseToken)
    expect([...bound.controllerIds].sort()).toEqual([ana, ben].sort())
    // Exactly what the DM wrote, and only that. The difference between the two arrays *is*
    // the derived half.
    expect(bound.grantedPlayerIds).toEqual([ben])
    expect((await tokenRow(t, looseToken))?.controllerIds).toEqual([ben])
  })

  test('rebinding away drops the holder while the grants stay byte-identical', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, sceneId, ana, ben, thorin, looseToken } = fixture
    const balin = await makeCharacter(t, fixture, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await setControllers(t, fixture, looseToken, [ben])
    await setCharacter(t, fixture, looseToken, thorin)
    const granted = (await tokenRow(t, looseToken))?.controllerIds

    await setCharacter(t, fixture, looseToken, balin)

    const rebound = await tokenPayload(t, fixture, looseToken)
    expect(rebound.controllerIds).toEqual([ben])
    expect(rebound.grantedPlayerIds).toEqual([ben])
    expect((await tokenRow(t, looseToken))?.controllerIds).toEqual(granted)

    // The write path agrees with the payload, because both resolve through the one
    // `effectiveControllersOf`: Ana's control was withdrawn by the pointer moving, and
    // nothing told her so.
    await expectKind(
      t.mutation(api.board.moveToken, {
        code,
        sceneId,
        tokenId: looseToken,
        x: 300,
        y: 900,
        settle: true,
        playerId: ana,
      }),
      'TokenNotYours',
    )
    // Ben still may, which is what makes the assertion above about the *derived* half
    // rather than about control having collapsed.
    await t.mutation(api.board.moveToken, {
      code,
      sceneId,
      tokenId: looseToken,
      x: 1200,
      y: 300,
      settle: true,
      playerId: ben,
    })
    expect(await placement(t, sceneId, looseToken)).toMatchObject(
      snapToGrid({ x: 1200, y: 300 }, GRID, 1),
    )
  })

  /**
   * **An unattached token is the DM's** — the correction Milestone 2 shipped after the
   * first real session, reached by a third route. Control used to be *assumed* for a token
   * with no character attached, which meant the whole table could shove the DM's monsters
   * around, since every creature the DM adds is unattached by construction.
   *
   * Unbinding is now a way to produce that state deliberately, and it collapses a
   * claim-only token to the empty array rather than to whoever held it a moment ago.
   */
  test('unbinding a claim-only token collapses controllerIds to the empty array', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, sceneId, ana, thorin, heroToken } = fixture
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    expect((await tokenPayload(t, fixture, heroToken)).controllerIds).toEqual([ana])

    await setCharacter(t, fixture, heroToken, null)

    const unbound = await tokenPayload(t, fixture, heroToken)
    expect(unbound.controllerIds).toEqual([])
    expect(unbound.grantedPlayerIds).toEqual([])
    expect(unbound.characterId).toBeNull()
    // Nothing was stored to say so, in either direction: the claim is still on Ana's seat,
    // and the token simply no longer points at what she is playing.
    expect((await tokenRow(t, heroToken))?.controllerIds).toBeUndefined()

    await expectKind(
      t.mutation(api.board.moveToken, {
        code,
        sceneId,
        tokenId: heroToken,
        x: 700,
        y: 700,
        settle: true,
        playerId: ana,
      }),
      'TokenNotYours',
    )
    // The DM still moves it, which is the whole point of the default.
    await t.mutation(api.board.moveToken, {
      code,
      dmCode: fixture.dmCode,
      sceneId,
      tokenId: heroToken,
      x: 700,
      y: 700,
      settle: true,
    })
    expect(await placement(t, sceneId, heroToken)).toMatchObject(
      snapToGrid({ x: 700, y: 700 }, GRID, 1),
    )
  })
})

describe('a grant is what lets a player move a token', () => {
  /**
   * The write path and the payload go through the one `effectiveControllersOf`, so what
   * the browser drew as draggable and what the server accepts are one function rather
   * than two that agreed when they were written. Asserted from both ends here: the
   * payload says Ben may move it, and the mutation lets him.
   */
  test('the granted seat may move an unattached token and an ungranted one may not', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, sceneId, ana, ben, looseToken } = fixture

    await setControllers(t, fixture, looseToken, [ben])
    expect((await tokenPayload(t, fixture, looseToken)).controllerIds).toEqual([ben])

    await t.mutation(api.board.moveToken, {
      code,
      sceneId,
      tokenId: looseToken,
      x: 1200,
      y: 300,
      settle: true,
      playerId: ben,
    })
    expect(await placement(t, sceneId, looseToken)).toMatchObject(
      snapToGrid({ x: 1200, y: 300 }, GRID, 1),
    )

    // Ana was not granted it, and the refusal is the same `TokenNotYours` a
    // player-layer token has always given — one message for every way of not
    // controlling it.
    const before = await placement(t, sceneId, looseToken)
    await expectKind(
      t.mutation(api.board.moveToken, {
        code,
        sceneId,
        tokenId: looseToken,
        x: 300,
        y: 900,
        settle: true,
        playerId: ana,
      }),
      'TokenNotYours',
    )
    expect(await placement(t, sceneId, looseToken)).toMatchObject({ x: before!.x, y: before!.y })
  })

  /**
   * ⚠️ **A grant on a DM-layer token buys nothing, and the refusal is `TokenNotFound`
   * rather than `TokenNotYours`.**
   *
   * The layer filter runs first and keys off the DM code alone — `maySee` consults
   * nothing else and must not — so a granted seat cannot even tell that the token
   * exists. Telling the two refusals apart would be an existence oracle for the DM
   * layer, which is the reasoning `TOKEN_NOT_FOUND` is one shared constant for, and the
   * grant does not get to weaken it.
   */
  test('a grant on a DM-layer token still refuses, and refuses as unfindable', async () => {
    const t = harness()
    const fixture = await boardFixture(t)
    const ana = await makeSeat(t, fixture.code, 'Ana')

    await setControllers(t, fixture, fixture.secretToken, [ana])
    expect((await tokenRow(t, fixture.secretToken))?.controllerIds).toEqual([ana])

    // Absent from the payload entirely: the grant did not put the coin on their board.
    const asPlayer = await t.query(api.board.tokens, { code: fixture.code })
    expect(asPlayer.map((token) => token._id)).toEqual([fixture.openToken])

    const refusal = await refusalOf(
      t.mutation(api.board.moveToken, {
        code: fixture.code,
        sceneId: fixture.sceneId,
        tokenId: fixture.secretToken,
        x: 400,
        y: 400,
        settle: true,
        playerId: ana,
      }),
    )
    expect(refusal.kind).toBe('TokenNotFound')
    // Identical, message included, to the refusal for a token that never existed.
    expect(
      await refusalOf(
        t.mutation(api.board.moveToken, {
          code: fixture.code,
          sceneId: fixture.sceneId,
          tokenId: await vanishedTokenId(t),
          x: 400,
          y: 400,
          settle: true,
          playerId: ana,
        }),
      ),
    ).toEqual(refusal)
  })
})

describe('board.setControllers is the DM’s alone', () => {
  test('refuses a wrong, empty or foreign DM code and writes nothing', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')

    for (const dmCode of [twiddle(fixture.dmCode), '', '   ', other.dmCode]) {
      await expectKind(
        t.mutation(api.board.setControllers, {
          code: fixture.code,
          dmCode,
          tokenId: fixture.looseToken,
          playerIds: [fixture.ben],
        }),
        'NotDm',
      )
    }

    expect((await tokenRow(t, fixture.looseToken))?.controllerIds).toBeUndefined()
    expect((await tokenPayload(t, fixture, fixture.looseToken)).controllerIds).toEqual([])
  })

  /**
   * ⚠️ **Every seat is checked against *this* game before any of it is written.**
   *
   * A stray seat id from another table would be a grant nothing in this game can render,
   * name or revoke: the dialog builds its rows from `players.list`, so the id would show
   * as a checkbox with no label, and `players.leave` sweeps by game, so it would never be
   * cleaned up either. Asserted with a valid seat beside the foreign one, so the check is
   * shown to reject the *request* rather than to have written the good half.
   */
  test('refuses a seat from another game, and writes neither id', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const outsider = await makeSeat(t, other.code, 'Sam')

    await expectKind(
      t.mutation(api.board.setControllers, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        tokenId: fixture.looseToken,
        playerIds: [fixture.ben, outsider],
      }),
      'PlayerNotFound',
    )
    expect((await tokenRow(t, fixture.looseToken))?.controllerIds).toBeUndefined()

    // A fabricated seat that belongs to nobody is the same answer.
    const vanished = await t.run(async (ctx) => {
      const gameId = (await ctx.db.query('games').first())!._id
      const playerId = await ctx.db.insert('players', {
        gameId,
        displayName: 'Ghost',
        nameKey: 'ghost',
        isDm: false,
      })
      await ctx.db.delete('players', playerId)
      return playerId
    })
    await expectKind(
      t.mutation(api.board.setControllers, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        tokenId: fixture.looseToken,
        playerIds: [vanished],
      }),
      'PlayerNotFound',
    )

    // The control: the same call with only this game's seats lands.
    await setControllers(t, fixture, fixture.looseToken, [fixture.ana, fixture.ben])
    expect([...((await tokenRow(t, fixture.looseToken))?.controllerIds ?? [])].sort()).toEqual(
      [fixture.ana, fixture.ben].sort(),
    )
  })

  /** A token from another game is refused as unfindable, like every other board write. */
  test('refuses a token from another game', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const otherScene = await makeScene(t, other.code, other.dmCode, 'Their Map')
    const theirToken = await addToken(t, other.code, other.dmCode, otherScene, { name: 'Theirs' })

    await expectKind(
      t.mutation(api.board.setControllers, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        tokenId: theirToken,
        playerIds: [fixture.ben],
      }),
      'TokenNotFound',
    )
    expect((await tokenRow(t, theirToken))?.controllerIds).toBeUndefined()
  })
})

describe('players.leave takes the seat’s grants with it', () => {
  /**
   * The same class of repair `detachCharacterFromTokens` performs when a character is
   * deleted, and it is worth a test for the same reason: skipping it is quiet rather
   * than loud. Seat ids are never reused — `players.join` inserts a fresh document (ADR
   * 0003) — so a stale grant authorises nobody and simply accumulates, and the DM's
   * dialog would render it as a row it cannot name.
   *
   * Two tokens and two seats, because the sweep is by game rather than by seat: the
   * assertion that matters is that it took exactly one id off exactly the tokens that
   * had it.
   */
  test('leaving strips that seat from every token and leaves the others alone', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, ana, ben, heroToken, looseToken } = fixture

    await setControllers(t, fixture, heroToken, [ana, ben])
    await setControllers(t, fixture, looseToken, [ben])

    await t.mutation(api.players.leave, { code, playerId: ben })

    expect((await tokenRow(t, heroToken))?.controllerIds).toEqual([ana])
    expect((await tokenRow(t, looseToken))?.controllerIds).toEqual([])
    // And through the query, which is what the DM's dialog is actually reading.
    expect((await tokenPayload(t, fixture, heroToken)).grantedPlayerIds).toEqual([ana])
    expect((await tokenPayload(t, fixture, looseToken)).controllerIds).toEqual([])

    // Ana is untouched and can still move what she was granted.
    await t.mutation(api.board.moveToken, {
      code,
      sceneId: fixture.sceneId,
      tokenId: heroToken,
      x: 1120,
      y: 560,
      settle: true,
      playerId: ana,
    })
    expect(await placement(t, fixture.sceneId, heroToken)).toMatchObject(
      snapToGrid({ x: 1120, y: 560 }, GRID, 1),
    )
  })

  /**
   * Rejoining under the same name is a **new seat** (ADR 0003), so the grant does not
   * come back — which is the honest consequence of ids not being reused, and worth
   * pinning so nobody later "fixes" the sweep by keying grants on a display name.
   *
   * Contrast a *claim*, which does come back, because it is keyed on the character the
   * seat picks up rather than on the seat id: the test two sections up asserts exactly
   * that. The two behaviours differ for a reason and both are correct.
   */
  test('rejoining under the same name does not restore the grant', async () => {
    const t = harness()
    const fixture = await controlFixture(t)
    const { code, ben, looseToken } = fixture

    await setControllers(t, fixture, looseToken, [ben])
    await t.mutation(api.players.leave, { code, playerId: ben })

    const benAgain = await makeSeat(t, code, 'Ben')
    expect(benAgain).not.toBe(ben)
    expect((await tokenPayload(t, fixture, looseToken)).controllerIds).toEqual([])
    await expectKind(
      t.mutation(api.board.moveToken, {
        code,
        sceneId: fixture.sceneId,
        tokenId: looseToken,
        x: 300,
        y: 900,
        settle: true,
        playerId: benAgain,
      }),
      'TokenNotYours',
    )
  })
})
