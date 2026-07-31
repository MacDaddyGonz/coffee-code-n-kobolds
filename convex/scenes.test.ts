/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_SCENE_NAME_LENGTH } from './lib/codes'
import { MAX_SCENES_PER_GAME } from './lib/games'
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from './lib/grid'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

/**
 * Deliberately re-stated here rather than imported from the module under test.
 * The limit is a promise to the DM and to `src/lib/images.ts`, and a test that
 * imports the constant it is checking cannot notice the promise being changed.
 */
const MAX_SCENE_BYTES = 4 * 1024 * 1024

type ErrorData = { kind: string; message: string }

async function refusalOf(call: Promise<unknown>): Promise<ErrorData> {
  const thrown = (await call.then(
    () => new Error('the call resolved, but it was expected to be refused'),
    (error: unknown) => error,
  )) as unknown
  expect(thrown).toBeInstanceOf(ConvexError)
  const data = (thrown as ConvexError<{ kind: string; message: string }>).data
  return { kind: String(data.kind), message: String(data.message) }
}

async function expectKind(call: Promise<unknown>, kind: string) {
  const refusal = await refusalOf(call)
  expect(refusal.kind).toBe(kind)
  expect(refusal.message.length).toBeGreaterThan(0)
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

async function storeImage(t: Harness, label: string, bytes = 64): Promise<Id<'_storage'>> {
  const body = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i += 1) body[i] = (label.charCodeAt(i % label.length) + i) % 256
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([body])))
}

async function makeScene(
  t: Harness,
  code: string,
  dmCode: string,
  name = 'Admittance',
): Promise<{ sceneId: Id<'scenes'>; imageId: Id<'_storage'> }> {
  const imageId = await storeImage(t, `scene-${name}`)
  const { sceneId } = await t.mutation(api.scenes.create, {
    code,
    dmCode,
    name,
    imageId,
    imageWidth: MAP_WIDTH,
    imageHeight: MAP_HEIGHT,
  })
  return { sceneId, imageId }
}

/** The stored scene row, not the projection a query hands back. */
async function sceneRow(t: Harness, sceneId: Id<'scenes'>) {
  return await t.run(async (ctx) => await ctx.db.get('scenes', sceneId))
}

async function blobExists(t: Harness, imageId: Id<'_storage'>) {
  return (await t.run(async (ctx) => await ctx.db.system.get('_storage', imageId))) !== null
}

async function activeSceneId(t: Harness, code: string) {
  return (await t.query(api.games.getByCode, { code }))?.activeSceneId ?? null
}

function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

describe('scenes.active', () => {
  test('is null before the DM has uploaded anything', async () => {
    const t = harness()
    const game = await makeGame(t)
    expect(await t.query(api.scenes.active, { code: game.code })).toBeNull()
  })

  test('is open to everyone — no DM code involved', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode, 'Admittance')

    const scene = await t.query(api.scenes.active, { code: game.code })
    expect(scene).toMatchObject({
      _id: sceneId,
      name: 'Admittance',
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
      gridVisible: true,
    })
    expect(typeof scene?.imageUrl).toBe('string')
  })

  test('an unknown code renders as no scene rather than an error', async () => {
    const t = harness()
    const game = await makeGame(t)
    await makeScene(t, game.code, game.dmCode)
    expect(await t.query(api.scenes.active, { code: 'ZZZZZZ' })).toBeNull()
  })

  test('follows setActive', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const lair = await makeScene(t, game.code, game.dmCode, "Dragon's Lair")

    expect((await t.query(api.scenes.active, { code: game.code }))?._id).toBe(cellar.sceneId)
    await t.mutation(api.scenes.setActive, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: lair.sceneId,
    })
    expect((await t.query(api.scenes.active, { code: game.code }))?._id).toBe(lair.sceneId)
  })
})

describe('scenes.list', () => {
  /**
   * A list of scene names is a spoiler in itself — `Dragon's Lair` sitting in the
   * payload tells the party what is coming three sessions early — so this is
   * DM-only and throws rather than quietly returning the active scene alone.
   */
  test('throws for a wrong, empty or foreign DM code', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    await makeScene(t, game.code, game.dmCode, "Dragon's Lair")

    for (const dmCode of [twiddle(game.dmCode), '', '   ', other.dmCode]) {
      await expectKind(t.query(api.scenes.list, { code: game.code, dmCode }), 'NotDm')
    }
  })

  test('a refusal carries no scene name at all', async () => {
    const t = harness()
    const game = await makeGame(t)
    await makeScene(t, game.code, game.dmCode, "Dragon's Lair")

    const refusal = await refusalOf(
      t.query(api.scenes.list, { code: game.code, dmCode: twiddle(game.dmCode) }),
    )
    expect(JSON.stringify(refusal)).not.toContain("Dragon's Lair")
  })

  test('lists every scene for the DM in creation order', async () => {
    const t = harness()
    const game = await makeGame(t)
    const names = ['Cellar', 'Courtyard', "Dragon's Lair"]
    for (const name of names) await makeScene(t, game.code, game.dmCode, name)

    const list = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(list.map((scene) => scene.name)).toEqual(names)
  })

  test('lists only the scenes of the game its code names', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    await makeScene(t, game.code, game.dmCode, 'Mine')
    await makeScene(t, other.code, other.dmCode, 'Theirs')

    const list = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(list.map((scene) => scene.name)).toEqual(['Mine'])
  })
})

describe('scenes.create', () => {
  test('makes the first scene active and leaves later ones alone', async () => {
    const t = harness()
    const game = await makeGame(t)

    const first = await makeScene(t, game.code, game.dmCode, 'Cellar')
    expect(await activeSceneId(t, game.code)).toBe(first.sceneId)

    const second = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    expect(await activeSceneId(t, game.code)).toBe(first.sceneId)
    expect(second.sceneId).not.toBe(first.sceneId)
  })

  test('defaults the grid to twenty squares across, no offset, visible', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    const stored = await sceneRow(t, sceneId)
    expect(stored).toMatchObject({
      gridSize: MAP_WIDTH / 20,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridVisible: true,
    })
  })

  test('trims the name and rejects a blank or over-long one', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'named')

    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: `  ${'S'.repeat(MAX_SCENE_NAME_LENGTH)}  `,
      imageId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    expect((await sceneRow(t, sceneId))?.name).toBe('S'.repeat(MAX_SCENE_NAME_LENGTH))

    for (const name of ['', '   ', 'S'.repeat(MAX_SCENE_NAME_LENGTH + 1)]) {
      const another = await storeImage(t, `named-${name.length}`)
      await expectKind(
        t.mutation(api.scenes.create, {
          code: game.code,
          dmCode: game.dmCode,
          name,
          imageId: another,
          imageWidth: MAP_WIDTH,
          imageHeight: MAP_HEIGHT,
        }),
        'BadInput',
      )
    }
  })

  /**
   * The refusal is what holds invariant 6: an oversized map never becomes a scene,
   * and the DM who tried to upload a 12 MB screenshot cannot spend the free tier's
   * one gigabyte on it by trying again three times.
   *
   * The blob surviving the refusal is asserted positively, because it is settled
   * behaviour rather than a gap. A Convex mutation is one transaction, so
   * `ctx.storage.delete` before the throw is rolled back with everything else —
   * probed directly against convex-test — and `ctx.scheduler` is transactional too,
   * so scheduling the cleanup does not escape it either. A rejecting mutation
   * therefore cannot clean up after itself, and `scenes.create` does not try:
   * `files.generateUploadUrl` can mint blobs that never reach this mutation at all,
   * so it was never the boundary protecting the quota. Cleanup belongs in a call
   * that commits, which is `files.discard`. See ADR 0004, "Costs and constraints we
   * are accepting", for the decision and the Milestone 7 sweeper behind it.
   */
  test('refuses an image over MAX_SCENE_BYTES, and files.discard clears the blob', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'huge', MAX_SCENE_BYTES + 1)
    expect(await blobExists(t, imageId)).toBe(true)

    await expectKind(
      t.mutation(api.scenes.create, {
        code: game.code,
        dmCode: game.dmCode,
        name: 'Too Big',
        imageId,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'BadInput',
    )

    // Nothing was written: no scene, and the game still has no board.
    expect(await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })).toEqual([])
    expect(await activeSceneId(t, game.code)).toBeNull()
    // And the blob is still there, because the transaction rolled back.
    expect(await blobExists(t, imageId)).toBe(true)

    // The client's catch calls this, and it is the call that commits.
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId })
    expect(await blobExists(t, imageId)).toBe(false)
    // Idempotent, because the error path it is called from may itself be retried.
    await t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageId })
    expect(await blobExists(t, imageId)).toBe(false)
  })

  test('accepts an image of exactly MAX_SCENE_BYTES', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'exact', MAX_SCENE_BYTES)

    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Right At The Limit',
      imageId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    expect(await sceneRow(t, sceneId)).not.toBeNull()
    expect(await blobExists(t, imageId)).toBe(true)
  })

  test('rejects a storage id that no longer exists', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'gone')
    await t.run(async (ctx) => await ctx.storage.delete(imageId))

    await expectKind(
      t.mutation(api.scenes.create, {
        code: game.code,
        dmCode: game.dmCode,
        name: 'Vanished',
        imageId,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'BadInput',
    )
    expect(await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })).toEqual([])
  })

  /**
   * Zero or NaN dimensions divide through every piece of grid maths downstream.
   * They arrive from a client whose image decode failed, so they are reachable
   * without anyone being hostile.
   */
  test('rejects non-finite or non-positive dimensions', async () => {
    const t = harness()
    const game = await makeGame(t)

    const bad = [0, -1, -MAP_WIDTH, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    for (const value of bad) {
      for (const axis of ['imageWidth', 'imageHeight'] as const) {
        const imageId = await storeImage(t, `dims-${axis}-${value}`)
        await expectKind(
          t.mutation(api.scenes.create, {
            code: game.code,
            dmCode: game.dmCode,
            name: 'Broken Dimensions',
            imageId,
            imageWidth: axis === 'imageWidth' ? value : MAP_WIDTH,
            imageHeight: axis === 'imageHeight' ? value : MAP_HEIGHT,
          }),
          'BadInput',
        )
      }
    }
    expect(await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })).toEqual([])
  })

  test('enforces MAX_SCENES_PER_GAME and keeps every scene it accepted visible', async () => {
    const t = harness()
    const game = await makeGame(t)
    // Deliberately fills the game to the cap — the cap is what is under test.
    for (let i = 0; i < MAX_SCENES_PER_GAME; i += 1) {
      await makeScene(t, game.code, game.dmCode, `Board ${i}`)
    }

    const imageId = await storeImage(t, 'one-too-many')
    const refusal = await refusalOf(
      t.mutation(api.scenes.create, {
        code: game.code,
        dmCode: game.dmCode,
        name: 'One Too Many',
        imageId,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
    )
    expect(refusal.message.length).toBeGreaterThan(0)

    // The write cap must match the read bound, or the last scenes created are
    // invisible in the DM's own list while still being addressable by id.
    const list = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(list).toHaveLength(MAX_SCENES_PER_GAME)
  })

  test('rejects a wrong, empty or foreign DM code', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')

    for (const dmCode of [twiddle(game.dmCode), '', '   ', other.dmCode]) {
      const imageId = await storeImage(t, `intruder-${dmCode.length}`)
      await expectKind(
        t.mutation(api.scenes.create, {
          code: game.code,
          dmCode,
          name: 'Intruder Board',
          imageId,
          imageWidth: MAP_WIDTH,
          imageHeight: MAP_HEIGHT,
        }),
        'NotDm',
      )
    }
    expect(await activeSceneId(t, game.code)).toBeNull()
  })
})

describe('scenes.updateGrid', () => {
  test('stores exactly the calibration the DM typed', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.scenes.updateGrid, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      gridSize: 140,
      gridOffsetX: 37.5,
      gridOffsetY: -12.25,
      gridVisible: false,
    })

    expect(await sceneRow(t, sceneId)).toMatchObject({
      gridSize: 140,
      gridOffsetX: 37.5,
      gridOffsetY: -12.25,
      gridVisible: false,
    })
  })

  /**
   * `isUsableGrid` exists to stop these reaching the database, where a zero grid
   * size makes every later snap divide by zero and a NaN from an emptied input
   * field poisons the position table.
   */
  test('rejects an unusable grid and leaves the old calibration in place', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const before = await sceneRow(t, sceneId)

    const badSizes = [
      0,
      -1,
      -140,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      MIN_GRID_SIZE - 1,
      MAX_GRID_SIZE + 1,
    ]
    for (const gridSize of badSizes) {
      await expectKind(
        t.mutation(api.scenes.updateGrid, {
          code: game.code,
          dmCode: game.dmCode,
          sceneId,
          gridSize,
          gridOffsetX: 0,
          gridOffsetY: 0,
          gridVisible: true,
        }),
        'BadInput',
      )
    }

    for (const offset of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expectKind(
        t.mutation(api.scenes.updateGrid, {
          code: game.code,
          dmCode: game.dmCode,
          sceneId,
          gridSize: 140,
          gridOffsetX: offset,
          gridOffsetY: 0,
          gridVisible: true,
        }),
        'BadInput',
      )
      await expectKind(
        t.mutation(api.scenes.updateGrid, {
          code: game.code,
          dmCode: game.dmCode,
          sceneId,
          gridSize: 140,
          gridOffsetX: 0,
          gridOffsetY: offset,
          gridVisible: true,
        }),
        'BadInput',
      )
    }

    expect(await sceneRow(t, sceneId)).toEqual(before)
  })

  test('accepts the exact grid-size bounds', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    for (const gridSize of [MIN_GRID_SIZE, MAX_GRID_SIZE]) {
      await t.mutation(api.scenes.updateGrid, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        gridSize,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridVisible: true,
      })
      expect((await sceneRow(t, sceneId))?.gridSize).toBe(gridSize)
    }
  })

  test('rejects a wrong DM code and a scene from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeScene(t, other.code, other.dmCode, 'Their Map')
    const before = await sceneRow(t, sceneId)

    await expectKind(
      t.mutation(api.scenes.updateGrid, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId,
        gridSize: 140,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridVisible: true,
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.updateGrid, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        gridSize: 140,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridVisible: true,
      }),
      'SceneNotFound',
    )

    expect(await sceneRow(t, sceneId)).toEqual(before)
    expect((await sceneRow(t, theirs.sceneId))?.gridSize).toBe(MAP_WIDTH / 20)
  })
})

describe('scenes.rename', () => {
  test('renames in place, trimmed', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode, 'Cellar')

    await t.mutation(api.scenes.rename, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      name: "  Dragon's Lair  ",
    })
    expect((await sceneRow(t, sceneId))?.name).toBe("Dragon's Lair")
  })

  test('rejects a blank or over-long name and keeps the old one', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode, 'Cellar')

    for (const name of ['', '   ', 'S'.repeat(MAX_SCENE_NAME_LENGTH + 1)]) {
      await expectKind(
        t.mutation(api.scenes.rename, { code: game.code, dmCode: game.dmCode, sceneId, name }),
        'BadInput',
      )
    }
    expect((await sceneRow(t, sceneId))?.name).toBe('Cellar')
  })

  test('rejects a wrong DM code and a scene from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeScene(t, other.code, other.dmCode, 'Their Map')

    await expectKind(
      t.mutation(api.scenes.rename, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId,
        name: 'Hacked',
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.rename, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        name: 'Hacked',
      }),
      'SceneNotFound',
    )
    expect((await sceneRow(t, sceneId))?.name).toBe('Cellar')
    expect((await sceneRow(t, theirs.sceneId))?.name).toBe('Their Map')
  })
})

describe('scenes.setActive', () => {
  test('rejects a wrong DM code and a scene from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeScene(t, other.code, other.dmCode, 'Their Map')

    await expectKind(
      t.mutation(api.scenes.setActive, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId: courtyard.sceneId,
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.setActive, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
      }),
      'SceneNotFound',
    )
    expect(await activeSceneId(t, game.code)).toBe(cellar.sceneId)
  })

  test('setting the already active scene is a no-op that succeeds', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.scenes.setActive, { code: game.code, dmCode: game.dmCode, sceneId })
    expect(await activeSceneId(t, game.code)).toBe(sceneId)
  })
})

describe('scenes.remove', () => {
  test('deletes the placements and the blob but leaves the tokens intact', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    const tokenId = (
      await t.mutation(api.board.addToken, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: cellar.sceneId,
        name: 'Recurring Villain',
        layer: 'dm',
        sizeSquares: 1,
        tint: '#c0392b',
        x: 300,
        y: 300,
      })
    ).tokenId
    await t.mutation(api.board.moveToken, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: courtyard.sceneId,
      tokenId,
      x: 900,
      y: 900,
      settle: true,
    })

    await t.mutation(api.scenes.remove, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: cellar.sceneId,
    })

    expect(await sceneRow(t, cellar.sceneId)).toBeNull()
    expect(await blobExists(t, cellar.imageId)).toBe(false)

    const placements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('tokenPositions')
          .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
          .collect(),
    )
    // The other board's layout survives; only the deleted scene's placement goes.
    expect(placements.map((row) => row.sceneId)).toEqual([courtyard.sceneId])

    // A recurring villain stands on several boards, so the token row itself must
    // outlive any one of them.
    expect(await t.run(async (ctx) => await ctx.db.get('tokens', tokenId))).not.toBeNull()
    const visible = await t.query(api.board.tokens, { code: game.code, dmCode: game.dmCode })
    expect(visible.map((token) => token._id)).toEqual([tokenId])
  })

  test('clears games.activeSceneId when it pointed at the removed scene', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    expect(await activeSceneId(t, game.code)).toBe(sceneId)

    await t.mutation(api.scenes.remove, { code: game.code, dmCode: game.dmCode, sceneId })

    expect(await activeSceneId(t, game.code)).toBeNull()
    expect(await t.query(api.scenes.active, { code: game.code })).toBeNull()
    // And a game with no board again refuses to start.
    await expectKind(
      t.mutation(api.games.start, { code: game.code, dmCode: game.dmCode }),
      'BadInput',
    )
  })

  test('leaves games.activeSceneId alone when it pointed elsewhere', async () => {
    const t = harness()
    const game = await makeGame(t)
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')

    await t.mutation(api.scenes.remove, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: courtyard.sceneId,
    })
    expect(await activeSceneId(t, game.code)).toBe(cellar.sceneId)
  })

  test('rejects a wrong DM code and a scene from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId, imageId } = await makeScene(t, game.code, game.dmCode)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makeScene(t, other.code, other.dmCode, 'Their Map')

    await expectKind(
      t.mutation(api.scenes.remove, { code: game.code, dmCode: twiddle(game.dmCode), sceneId }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.remove, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
      }),
      'SceneNotFound',
    )

    expect(await sceneRow(t, sceneId)).not.toBeNull()
    expect(await blobExists(t, imageId)).toBe(true)
    expect(await sceneRow(t, theirs.sceneId)).not.toBeNull()
    expect(await blobExists(t, theirs.imageId)).toBe(true)
  })

  test('removing the same scene twice refuses the second time', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.scenes.remove, { code: game.code, dmCode: game.dmCode, sceneId })
    await expectKind(
      t.mutation(api.scenes.remove, { code: game.code, dmCode: game.dmCode, sceneId }),
      'SceneNotFound',
    )
  })

  test('frees room under MAX_SCENES_PER_GAME again', async () => {
    const t = harness()
    const game = await makeGame(t)
    // Deliberately at the cap, to check it counts live rows rather than acting
    // as a high-water mark.
    let first: Id<'scenes'> | null = null
    for (let i = 0; i < MAX_SCENES_PER_GAME; i += 1) {
      const made = await makeScene(t, game.code, game.dmCode, `Board ${i}`)
      first ??= made.sceneId
    }

    await t.mutation(api.scenes.remove, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: first!,
    })
    const latecomer = await makeScene(t, game.code, game.dmCode, 'Latecomer')

    const list = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(list).toHaveLength(MAX_SCENES_PER_GAME)
    expect(list.some((scene) => scene._id === latecomer.sceneId)).toBe(true)
  })
})

describe('files.generateUploadUrl', () => {
  test('hands the DM a URL', async () => {
    const t = harness()
    const game = await makeGame(t)
    const url = await t.mutation(api.files.generateUploadUrl, {
      code: game.code,
      dmCode: game.dmCode,
    })
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)
  })

  /**
   * An open upload URL is an open write to the storage quota, which invariant 6
   * says is one gigabyte for the whole app.
   */
  test('refuses a wrong, empty or foreign DM code', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')

    for (const dmCode of [twiddle(game.dmCode), '', '   ', other.dmCode]) {
      await expectKind(
        t.mutation(api.files.generateUploadUrl, { code: game.code, dmCode }),
        'NotDm',
      )
    }
  })

  test('refuses an unknown game code', async () => {
    const t = harness()
    const game = await makeGame(t)
    await expectKind(
      t.mutation(api.files.generateUploadUrl, { code: 'ZZZZZZ', dmCode: game.dmCode }),
      'GameNotFound',
    )
  })
})
