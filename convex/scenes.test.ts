/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { MAX_SCENE_NAME_LENGTH, MAX_SCENE_NOTES_LENGTH, hasLoneSurrogate } from './lib/codes'
import { MAX_SCENES_PER_GAME } from './lib/games'
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from './lib/grid'
// Imported rather than re-stated, for `DEFAULT_SCENE_BACKGROUND`'s reason below: neither is
// a promise to the DM about what may be uploaded. `MAX_DISCARD_IDS` bounds one call's
// argument, and `MAX_THUMB_BYTES` guards a blob this application produces for itself — what
// the assertions are for is that a ceiling exists and fires, not that it is any particular
// number. `MAX_SCENE_BYTES` is the one that stays hand-written, and its note says why.
import { MAX_DISCARD_IDS, MAX_THUMB_BYTES } from './lib/limits'
// Imported rather than re-stated, unlike `MAX_SCENE_BYTES` above, and the difference is
// what the value is. That one is a *promise* — changing it changes what a DM may upload,
// so a test that imports it cannot notice the promise moving. This is a default nobody
// has promised anything about: what the assertions are for is that the projection turns
// absent into whatever it happens to be, not that it is any particular near-black.
import { DEFAULT_SCENE_BACKGROUND, deleteScenesInGame } from './lib/scenes'
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
    await t.mutation(api.files.discard, {
      code: game.code,
      dmCode: game.dmCode,
      imageIds: [imageId],
    })
    expect(await blobExists(t, imageId)).toBe(false)
    // Idempotent, because the error path it is called from may itself be retried.
    await t.mutation(api.files.discard, {
      code: game.code,
      dmCode: game.dmCode,
      imageIds: [imageId],
    })
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

describe('scenes.setBackground', () => {
  /**
   * The projection turns absent into a colour, so no client ever sees the optional field.
   * This is the assertion that keeps `backgroundOf` the only reader of it: a scene created
   * before the column existed and one created a second ago answer identically, because
   * `create` writes nothing and the read supplies everything.
   */
  test('a scene nobody has coloured reads back the default', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    expect((await sceneRow(t, sceneId))?.backgroundColour).toBeUndefined()

    const active = await t.query(api.scenes.active, { code: game.code })
    expect(active?.backgroundColour).toBe(DEFAULT_SCENE_BACKGROUND)
  })

  test('stores the colour and hands it to every client', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.scenes.setBackground, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      backgroundColour: '#3B0A0A',
    })

    // Stored verbatim: the pattern is case-insensitive, and normalising the case here
    // would be a second spelling of one colour for `firstDifference` to trip over.
    expect((await sceneRow(t, sceneId))?.backgroundColour).toBe('#3B0A0A')

    // `scenes.active` is the ungated query, which is the point — the colour is not a
    // secret and reaches a player who holds no DM code.
    expect((await t.query(api.scenes.active, { code: game.code }))?.backgroundColour).toBe(
      '#3B0A0A',
    )
  })

  /**
   * The refusal that makes this worth a server check at all. An `<input type="color">`
   * cannot emit any of these, which is exactly why the guard cannot live in the browser:
   * every one of them is a string a hand-written client could send, and the value is
   * handed to a CSS `background-color` on every screen at the table.
   */
  test('refuses anything that is not #rrggbb, and keeps the old colour', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    await t.mutation(api.scenes.setBackground, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      backgroundColour: '#123456',
    })

    const bad = [
      'rgb(0,0,0)',
      'url(https://example.test/x.png)',
      'red',
      '#123',
      '#1234567',
      'image-set("x.png" 1x)',
      '',
      '#12345g',
      ' #123456',
    ]
    for (const backgroundColour of bad) {
      await expectKind(
        t.mutation(api.scenes.setBackground, {
          code: game.code,
          dmCode: game.dmCode,
          sceneId,
          backgroundColour,
        }),
        'BadInput',
      )
    }

    expect((await sceneRow(t, sceneId))?.backgroundColour).toBe('#123456')
  })

  test("needs the DM code, and refuses another game's scene", async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const other = await makeGame(t, 'Somebody Else', 'Ana')
    const theirs = await makeScene(t, other.code, other.dmCode)

    await expectKind(
      t.mutation(api.scenes.setBackground, {
        code: game.code,
        dmCode: 'NOTTHEDM',
        sceneId,
        backgroundColour: '#123456',
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.setBackground, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        backgroundColour: '#123456',
      }),
      'SceneNotFound',
    )

    expect((await sceneRow(t, sceneId))?.backgroundColour).toBeUndefined()
    expect((await sceneRow(t, theirs.sceneId))?.backgroundColour).toBeUndefined()
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
        layer: 'gm',
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

describe('scenes.setNotes', () => {
  /**
   * ⚠️ **THE POSITIVE CONTROL THIS WHOLE PROJECTION SPLIT EXISTS FOR.**
   *
   * `scenes.active` is ungated: every player at the table subscribes to it, so a `notes`
   * field on `publicSceneValidator` publishes the DM's prep to the party — CLAUDE.md
   * invariant 1, in a milestone whose entire subject is what players may know. This is
   * `board.test.ts`'s and `feed.test.ts`'s shape of test: a fixture carrying a distinctive
   * string, a scan of a *real* payload, and a positive control so it cannot pass on an
   * empty one.
   */
  test('the DM’s prep never reaches a player', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode, 'Admittance')
    const secret = 'the lich is invisible until somebody casts detect magic'

    await t.mutation(api.scenes.setNotes, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      notes: secret,
    })

    // Every way a caller without the DM code can reach this scene.
    const payloads = [
      await t.query(api.scenes.active, { code: game.code }),
      await t.query(api.games.getByCode, { code: game.code }),
    ]
    for (const payload of payloads) {
      expect(JSON.stringify(payload)).not.toContain('lich')
    }
    expect(Object.keys((await t.query(api.scenes.active, { code: game.code }))!)).not.toContain(
      'notes',
    )

    // THE POSITIVE CONTROL. The scan above passes trivially against a fixture whose notes
    // were never stored, so the DM's own list has to contain the very string it looked for.
    const [listed] = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(listed.notes).toBe(secret)
  })

  test('a blank clears it, and the column goes rather than holding an empty string', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)

    // Absent from the start, and the projection still promises a string.
    expect((await sceneRow(t, sceneId))?.notes).toBeUndefined()
    const before = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(before[0].notes).toBe('')

    await t.mutation(api.scenes.setNotes, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      // Trimmed at the ends and *not* collapsed in the middle: prose written in paragraphs
      // is what this field is for, and `collapseWhitespace` would flatten it to one line.
      notes: '  Two rooms.\n\nThe second one is trapped.  ',
    })
    expect((await sceneRow(t, sceneId))?.notes).toBe('Two rooms.\n\nThe second one is trapped.')

    await t.mutation(api.scenes.setNotes, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      notes: '   ',
    })
    // One stored spelling of "none" — ADR 0008's convention, so nothing downstream has to
    // decide whether absent and '' mean the same thing.
    expect((await sceneRow(t, sceneId))?.notes).toBeUndefined()
  })

  test('refuses notes past the limit and keeps the old ones', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    await t.mutation(api.scenes.setNotes, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      notes: 'Keep me.',
    })

    await expectKind(
      t.mutation(api.scenes.setNotes, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        notes: 'x'.repeat(MAX_SCENE_NOTES_LENGTH + 1),
      }),
      'BadInput',
    )
    expect((await sceneRow(t, sceneId))?.notes).toBe('Keep me.')

    // And exactly the limit is accepted, so the refusal is a boundary rather than a fence
    // one character inside it.
    await t.mutation(api.scenes.setNotes, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      notes: 'y'.repeat(MAX_SCENE_NOTES_LENGTH),
    })
    expect((await sceneRow(t, sceneId))?.notes).toHaveLength(MAX_SCENE_NOTES_LENGTH)
  })

  test('rejects a wrong DM code and a scene from another game', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const theirs = await makeScene(t, other.code, other.dmCode, 'Theirs')

    await expectKind(
      t.mutation(api.scenes.setNotes, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId,
        notes: 'nope',
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.setNotes, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        notes: 'nope',
      }),
      'SceneNotFound',
    )
    expect((await sceneRow(t, theirs.sceneId))?.notes).toBeUndefined()
  })
})

describe('scenes.reorder', () => {
  async function namesInOrder(t: Harness, game: { code: string; dmCode: string }) {
    const list = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    return list.map((scene) => scene.name)
  }

  test('a game nobody has reordered reads back in upload order', async () => {
    const t = harness()
    const game = await makeGame(t)
    for (const name of ['Cellar', 'Courtyard', "Dragon's Lair"]) {
      await makeScene(t, game.code, game.dmCode, name)
    }
    // Byte-identical to what this query did before the column existed, which is the
    // acceptance criterion for `orderOf`'s absent-sorts-last default.
    expect(await namesInOrder(t, game)).toEqual(['Cellar', 'Courtyard', "Dragon's Lair"])
  })

  test('stores the whole ordering, and a later scene still lands last', async () => {
    const t = harness()
    const game = await makeGame(t)
    const made: Record<string, Id<'scenes'>> = {}
    for (const name of ['Cellar', 'Courtyard', "Dragon's Lair"]) {
      made[name] = (await makeScene(t, game.code, game.dmCode, name)).sceneId
    }

    await t.mutation(api.scenes.reorder, {
      code: game.code,
      dmCode: game.dmCode,
      sceneIds: [made["Dragon's Lair"], made.Cellar, made.Courtyard],
    })
    expect(await namesInOrder(t, game)).toEqual(["Dragon's Lair", 'Cellar', 'Courtyard'])

    // ⚠️ The reason absent is `Infinity` and not 0: a scene added after a reorder has no
    // opinion, and a default of 0 would put it at the top of a list the DM had just sorted.
    await makeScene(t, game.code, game.dmCode, 'Latecomer')
    expect(await namesInOrder(t, game)).toEqual([
      "Dragon's Lair",
      'Cellar',
      'Courtyard',
      'Latecomer',
    ])
  })

  /**
   * A prefix would leave the unnamed scenes holding whatever numbers they had, and a repeat
   * would give two rows the same index and put the tie-break in charge. Both are refusals
   * rather than best-effort sorts.
   */
  test('refuses a partial list, a repeated id, and a foreign scene', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const cellar = await makeScene(t, game.code, game.dmCode, 'Cellar')
    const courtyard = await makeScene(t, game.code, game.dmCode, 'Courtyard')
    const theirs = await makeScene(t, other.code, other.dmCode, 'Theirs')

    await expectKind(
      t.mutation(api.scenes.reorder, {
        code: game.code,
        dmCode: game.dmCode,
        sceneIds: [cellar.sceneId],
      }),
      'BadInput',
    )
    await expectKind(
      t.mutation(api.scenes.reorder, {
        code: game.code,
        dmCode: game.dmCode,
        sceneIds: [cellar.sceneId, cellar.sceneId],
      }),
      'BadInput',
    )
    await expectKind(
      t.mutation(api.scenes.reorder, {
        code: game.code,
        dmCode: game.dmCode,
        sceneIds: [cellar.sceneId, theirs.sceneId],
      }),
      'SceneNotFound',
    )
    await expectKind(
      t.mutation(api.scenes.reorder, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneIds: [cellar.sceneId, courtyard.sceneId],
      }),
      'NotDm',
    )

    // Nothing moved, and nothing was half-written: the refusals all land before any patch.
    expect(await namesInOrder(t, game)).toEqual(['Cellar', 'Courtyard'])
    expect((await sceneRow(t, cellar.sceneId))?.order).toBeUndefined()
  })

  test('leaves a row whose position did not change unwritten', async () => {
    const t = harness()
    const game = await makeGame(t)
    const a = await makeScene(t, game.code, game.dmCode, 'A')
    const b = await makeScene(t, game.code, game.dmCode, 'B')

    await t.mutation(api.scenes.reorder, {
      code: game.code,
      dmCode: game.dmCode,
      sceneIds: [a.sceneId, b.sceneId],
    })
    const settled = await sceneRow(t, a.sceneId)
    expect(settled?.order).toBe(0)

    // The same order again is no writes at all — a patch that changes nothing still
    // invalidates every subscription reading the row.
    const before = settled?._creationTime
    await t.mutation(api.scenes.reorder, {
      code: game.code,
      dmCode: game.dmCode,
      sceneIds: [a.sceneId, b.sceneId],
    })
    expect((await sceneRow(t, a.sceneId))?._creationTime).toBe(before)
    expect((await sceneRow(t, a.sceneId))?.order).toBe(0)
  })
})

describe('a scene’s thumbnail', () => {
  /**
   * ⚠️ **THE POSITIVE CONTROL FOR THE PROJECTION SPLIT, AND IT PINS AN EXACT KEY SET.**
   *
   * `scenes.active` is ungated — every player at the table subscribes to it — so anything
   * that reaches `publicSceneValidator` is published to everybody. `scenes.list` is DM-only
   * and returns a *wider* object, which is only defensible while the two really are two.
   * A subtractive spec across two audiences guarantees only the fields it names, which is
   * `games.list`'s reasoning about the join code, so this asserts the whole set rather than
   * the absence of one key.
   *
   * The fixture is deliberately a scene that **has** a thumbnail: a scan for an absent key
   * passes trivially against a row that never had one.
   */
  test('never reaches a player, and the player’s payload has exactly its old keys', async () => {
    const t = harness()
    const game = await makeGame(t)
    const thumbnailId = await storeImage(t, 'thumb')
    await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId: await storeImage(t, 'map'),
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })

    const seen = await t.query(api.scenes.active, { code: game.code })
    expect(seen).not.toBeNull()
    expect(Object.keys(seen!).sort()).toEqual(
      [
        '_id',
        'backgroundColour',
        'fogBase',
        'gridOffsetX',
        'gridOffsetY',
        'gridSize',
        'gridVisible',
        'imageHeight',
        'imageUrl',
        'imageWidth',
        'name',
      ].sort(),
    )
    expect(JSON.stringify(seen)).not.toContain('thumbnail')

    // And the DM's own list does carry it, so the assertion above is about the audience
    // rather than about the field never being projected at all.
    const [listed] = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(typeof listed.thumbnailUrl).toBe('string')
    expect(listed.thumbnailUrl).not.toBe(listed.imageUrl)
  })

  /**
   * The fallback is resolved server-side so no client branches — `dmScene`'s ⚠️. Every scene
   * uploaded before this field existed is permanently in this state, because nothing
   * regenerates a derivative.
   */
  test('falls back to the full map when there is none', async () => {
    const t = harness()
    const game = await makeGame(t)
    await makeScene(t, game.code, game.dmCode, 'Old Map')

    const [listed] = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(typeof listed.imageUrl).toBe('string')
    expect(listed.thumbnailUrl).toBe(listed.imageUrl)
  })

  test('is stored, and refused when it is too big to be one', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'map')
    const thumbnailId = await storeImage(t, 'thumb')

    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId,
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    expect((await sceneRow(t, sceneId))?.thumbnailId).toBe(thumbnailId)

    // A client that posted the map into the thumbnail argument, which is the one way those
    // bytes get into storage twice. Invariant 6 is about what is in storage rather than
    // about who wrote it.
    const wrongWayRound = await storeImage(t, 'not-a-thumb', MAX_THUMB_BYTES + 1)
    await expectKind(
      t.mutation(api.scenes.create, {
        code: game.code,
        dmCode: game.dmCode,
        name: 'Wrong Way Round',
        imageId: await storeImage(t, 'second-map'),
        thumbnailId: wrongWayRound,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'BadInput',
    )
  })

  test('goes with the scene when the scene goes', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'map')
    const thumbnailId = await storeImage(t, 'thumb')
    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId,
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })

    await t.mutation(api.scenes.remove, { code: game.code, dmCode: game.dmCode, sceneId })
    expect(await blobExists(t, imageId)).toBe(false)
    // The one that would be missed: a forgotten thumbnail leaves no gap on any screen, so
    // nothing in the application would ever report it.
    expect(await blobExists(t, thumbnailId)).toBe(false)
  })
})

/**
 * ⚠️ **THE SHARED BLOB, BEFORE ANYTHING CAN CREATE ONE.**
 *
 * `scenes.duplicate` does not exist yet, and these tests do not wait for it — the fix is
 * reviewable on its own precisely because the bug is a property of the delete path rather
 * than of the feature that trips it. A second row pointing at one blob is inserted directly,
 * which is exactly what a duplicate will produce, and the assertions are about what
 * `scenes.remove` and `purgeGame` then do.
 *
 * The pair is the point. `remove` becomes conditional and `deleteScenesInGame` must not —
 * see the ⚠️ on each. A test suite that only exercised one of them would let somebody
 * "finish the job" by converting the other and breaking the purge.
 */
describe('a map blob two scenes share', () => {
  /** A second scene row on the same two blobs — what `scenes.duplicate` will write. */
  async function twinOf(t: Harness, scene: Doc<'scenes'>, name: string): Promise<Id<'scenes'>> {
    return await t.run(
      async (ctx) =>
        await ctx.db.insert('scenes', {
          gameId: scene.gameId,
          name,
          imageId: scene.imageId,
          ...(scene.thumbnailId === undefined ? {} : { thumbnailId: scene.thumbnailId }),
          imageWidth: scene.imageWidth,
          imageHeight: scene.imageHeight,
          gridSize: scene.gridSize,
          gridOffsetX: scene.gridOffsetX,
          gridOffsetY: scene.gridOffsetY,
          gridVisible: scene.gridVisible,
        }),
    )
  }

  test('survives deleting the original, and goes when the last holder goes', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'map')
    const thumbnailId = await storeImage(t, 'thumb')
    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId,
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    const original = await sceneRow(t, sceneId)
    expect(original).not.toBeNull()
    const copy = await twinOf(t, original!, 'Admittance (copy)')

    await t.mutation(api.scenes.remove, { code: game.code, dmCode: game.dmCode, sceneId })
    expect(await sceneRow(t, sceneId)).toBeNull()
    // The copy is still on the DM's list and still has a picture. An unconditional delete
    // here is a blank map in a list the DM is looking at.
    expect(await blobExists(t, imageId)).toBe(true)
    expect(await blobExists(t, thumbnailId)).toBe(true)
    const [listed] = await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })
    expect(listed._id).toBe(copy)
    expect(typeof listed.imageUrl).toBe('string')

    // ⚠️ THE POSITIVE CONTROL. A `remove` that had simply stopped deleting blobs would
    // satisfy every assertion above, so the same call on the last holder has to reclaim
    // them — otherwise this is a leak test dressed as a sharing test.
    await t.mutation(api.scenes.remove, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: copy,
    })
    expect(await blobExists(t, imageId)).toBe(false)
    expect(await blobExists(t, thumbnailId)).toBe(false)
  })

  /**
   * ⚠️ **The bug that is not about sharing at all.** A second `ctx.storage.delete` of the
   * same id throws a plain `Error` rather than a `ConvexError`, so it aborts the whole
   * transaction — `deleteTokensInGame` documents that confirmed against a real deployment.
   * Before duplication nothing could produce two scenes on one blob; from the moment one
   * press can copy a map, a purge of any game containing a copy would have failed outright
   * and there would be no way left to clean it up.
   */
  test('purges exactly once, so the whole purge does not abort', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'map')
    const thumbnailId = await storeImage(t, 'thumb')
    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId,
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    const original = await sceneRow(t, sceneId)
    await twinOf(t, original!, 'Admittance (copy)')

    const receipt = await t.run(async (ctx) => await deleteScenesInGame(ctx, original!.gameId))
    expect(receipt).toBe(2)
    expect(await blobExists(t, imageId)).toBe(false)
    expect(await blobExists(t, thumbnailId)).toBe(false)
    expect(await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })).toEqual([])
  })

  /**
   * One set for both columns, not one per column. A blob a mis-sequenced client stored as
   * one scene's map and another's thumbnail is exactly as undeletable-twice as a shared map,
   * and it is the case a per-column dedup would miss.
   */
  test('a blob used as one scene’s map and another’s thumbnail is deleted once', async () => {
    const t = harness()
    const game = await makeGame(t)
    const shared = await storeImage(t, 'both')
    const { sceneId } = await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId: shared,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    const original = await sceneRow(t, sceneId)
    await t.run(async (ctx) => {
      await ctx.db.insert('scenes', {
        gameId: original!.gameId,
        name: 'Second',
        imageId: await ctx.storage.store(new Blob([new Uint8Array(8)])),
        thumbnailId: shared,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
        gridSize: original!.gridSize,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridVisible: true,
      })
    })

    expect(await t.run(async (ctx) => await deleteScenesInGame(ctx, original!.gameId))).toBe(2)
    expect(await blobExists(t, shared)).toBe(false)
  })
})

/** A scene with a grid, a colour, a covered base, notes, a coin on it and one fog shape. */
async function furnishedScene(t: Harness, game: { code: string; dmCode: string }) {
  const imageId = await storeImage(t, 'map')
  const thumbnailId = await storeImage(t, 'thumb')
  const { sceneId } = await t.mutation(api.scenes.create, {
    code: game.code,
    dmCode: game.dmCode,
    name: 'Admittance',
    imageId,
    thumbnailId,
    imageWidth: MAP_WIDTH,
    imageHeight: MAP_HEIGHT,
  })

  await t.mutation(api.scenes.updateGrid, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    gridSize: 140,
    gridOffsetX: 12.5,
    gridOffsetY: 7.25,
    gridVisible: false,
  })
  await t.mutation(api.scenes.setBackground, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    backgroundColour: '#204060',
  })
  await t.mutation(api.scenes.setFogBase, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    fogBase: 'dark',
  })
  await t.mutation(api.scenes.setNotes, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    notes: 'Two rooms and a trapped chest.',
  })

  const { tokenId } = await t.mutation(api.board.addToken, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    name: 'Village Guard',
    layer: 'player',
    sizeSquares: 1,
    tint: '#c0392b',
    x: 280,
    y: 420,
  })
  await t.mutation(api.fog.draw, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    shape: { kind: 'rect', x: 100, y: 200, width: 300, height: 400 },
  })
  // ⚠️ **A polygon as well as a rectangle, because the two are copied and scaled differently.**
  // A `fogRects` row's `points` is optional and absent means rectangle, so a field-by-field
  // rebuild that forgets it turns a polygon into its own bounding box — silently, on the
  // duplicate a DM made precisely so they would not have to redraw anything. One of each in the
  // fixture is what makes `duplicate` and `replaceImage` answer that question at all.
  await t.mutation(api.fog.draw, {
    code: game.code,
    dmCode: game.dmCode,
    sceneId,
    shape: {
      kind: 'polygon',
      points: [
        { x: 800, y: 300 },
        { x: 1000, y: 340 },
        { x: 940, y: 560 },
      ],
    },
  })

  return { sceneId, imageId, thumbnailId, tokenId }
}

async function placementsOn(t: Harness, sceneId: Id<'scenes'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('tokenPositions')
        .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
        .collect(),
  )
}

describe('scenes.duplicate', () => {
  /**
   * ⚠️ **The blob is SHARED and never copied** — CLAUDE.md invariant 6. Four megabytes on a
   * press is a quarter of a game's map budget spent on bytes already in storage.
   */
  test('shares both blobs and takes everything that describes the map', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)

    const { sceneId } = await t.mutation(api.scenes.duplicate, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
      includeContents: false,
    })

    const copy = await sceneRow(t, sceneId)
    expect(copy).toMatchObject({
      name: 'Admittance (copy)',
      imageId: source.imageId,
      thumbnailId: source.thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
      gridSize: 140,
      gridOffsetX: 12.5,
      gridOffsetY: 7.25,
      gridVisible: false,
      backgroundColour: '#204060',
      fogBase: 'dark',
      notes: 'Two rooms and a trapped chest.',
    })
    // Absent, so it sorts last — a copy belongs at the end rather than beside its source.
    expect(copy?.order).toBeUndefined()

    // Not on the table, and the original still is. Copying a map is preparation.
    expect(await activeSceneId(t, game.code)).toBe(source.sceneId)
  })

  /**
   * *A wall is a property of the map; a placement and a fog shape are where things are
   * tonight.* One choice rather than three checkboxes.
   */
  test('takes the placements and the fog only when asked', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)

    const empty = await t.mutation(api.scenes.duplicate, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
      includeContents: false,
    })
    expect(await placementsOn(t, empty.sceneId)).toEqual([])
    expect(
      await t.query(api.fog.list, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: empty.sceneId,
      }),
    ).toEqual([])

    const laidOut = await t.mutation(api.scenes.duplicate, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
      includeContents: true,
    })
    const copied = await placementsOn(t, laidOut.sceneId)
    // The *token* is shared and only the placement is copied: the two boards show one coin,
    // which is what a DM copying an encounter means.
    expect(copied.map((row) => row.tokenId)).toEqual([source.tokenId])
    const fog = await t.query(api.fog.list, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: laidOut.sceneId,
    })
    expect(fog).toHaveLength(2)

    const rect = fog.find((row) => row.points === undefined)
    const polygon = fog.find((row) => row.points !== undefined)

    expect(rect).toMatchObject({ x: 100, y: 200, width: 300, height: 400 })
    // ⚠️ **A rectangle must come back with NO `points` key**, not with an empty array. Absence
    // is what `shapeCovers` reads as *this is a box*, and an empty array would make it a
    // degenerate polygon covering nothing — a copied fog rectangle that silently hides no one.
    expect(rect !== undefined && 'points' in rect).toBe(false)

    // ⚠️ **And the polygon keeps its outline, which is the half a field-by-field rebuild drops.**
    // Without it a copied polygon arrives as its own bounding box: a shape that hides the wrong
    // part of the map, on a duplicate the DM made precisely so they would not have to redraw
    // anything. Both directions are asserted here because one fixture of each kind is the only
    // thing that can tell a copier that handles both from one that handles neither.
    expect(polygon).toMatchObject({
      points: [
        { x: 800, y: 300 },
        { x: 1000, y: 340 },
        { x: 940, y: 560 },
      ],
    })

    // And the source is untouched by either copy.
    expect(await placementsOn(t, source.sceneId)).toHaveLength(1)
  })

  /**
   * ⚠️ **The Milestone 1 lone-surrogate bug, third occurrence and first where the *app*
   * supplies the over-long part.** ` (copy)` on a 58-character name is 65, past the limit,
   * and no field's `maxLength` could have stopped it because nobody typed it. Cut by code
   * point, with the suffix's budget reserved, so the result both fits and stays a copy.
   */
  test('cuts a long name by code point and keeps the suffix', async () => {
    const t = harness()
    const game = await makeGame(t)
    // Emoji at the cut, so a `slice` would leave a lone surrogate that `requireSceneName`
    // accepts and a real deployment refuses.
    const long = `${'a'.repeat(MAX_SCENE_NAME_LENGTH - 8)}🐉🐉🐉`
    const { sceneId } = await makeScene(t, game.code, game.dmCode, long)

    const copy = await t.mutation(api.scenes.duplicate, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      includeContents: false,
    })
    const name = (await sceneRow(t, copy.sceneId))?.name ?? ''
    expect(name.length).toBeLessThanOrEqual(MAX_SCENE_NAME_LENGTH)
    expect(name.endsWith(' (copy)')).toBe(true)
    expect(hasLoneSurrogate(name)).toBe(false)
  })

  test('counts against MAX_SCENES_PER_GAME, and needs the DM code', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const theirs = await makeScene(t, other.code, other.dmCode, 'Theirs')

    await expectKind(
      t.mutation(api.scenes.duplicate, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId,
        includeContents: false,
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.duplicate, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        includeContents: false,
      }),
      'SceneNotFound',
    )

    while (
      (await t.query(api.scenes.list, { code: game.code, dmCode: game.dmCode })).length <
      MAX_SCENES_PER_GAME
    ) {
      await makeScene(t, game.code, game.dmCode, `Filler ${Math.random()}`)
    }
    await expectKind(
      t.mutation(api.scenes.duplicate, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        includeContents: false,
      }),
      'GameFull',
    )
  })
})

describe('scenes.replaceImage', () => {
  async function replace(
    t: Harness,
    game: { code: string; dmCode: string },
    sceneId: Id<'scenes'>,
    size: { width: number; height: number },
    label = 'replacement',
  ) {
    const imageId = await storeImage(t, label)
    await t.mutation(api.scenes.replaceImage, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      imageId,
      imageWidth: size.width,
      imageHeight: size.height,
    })
    return imageId
  }

  /**
   * ⚠️ **`k === 1` skips every rewrite, and it is the common case rather than an
   * optimisation** — a DM re-exporting a map at the same size after redrawing a room.
   * Multiplying two hundred placements by 1 is two hundred writes that change nothing.
   */
  test('a same-size replacement moves nothing', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)
    const before = await sceneRow(t, source.sceneId)
    // Read rather than asserted as a literal: `addToken` snapped the coin server-side, so
    // where it actually sits is the grid's business and not this test's.
    const stood = (await placementsOn(t, source.sceneId))[0]

    const swapped = await replace(t, game, source.sceneId, {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    })

    const after = await sceneRow(t, source.sceneId)
    expect(after).toMatchObject({
      imageId: swapped,
      gridSize: before!.gridSize,
      gridOffsetX: before!.gridOffsetX,
      gridOffsetY: before!.gridOffsetY,
    })
    expect((await placementsOn(t, source.sceneId))[0]).toMatchObject({ x: stood.x, y: stood.y })
    const fog = await t.query(api.fog.list, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
    })
    expect(fog.find((row) => row.points === undefined)).toMatchObject({
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    })
    // The polygon too, unmoved — `k === 1` skips the rewrite, so the interesting thing here is
    // that its vertices were not touched by a multiplication that did not happen.
    expect(fog.find((row) => row.points !== undefined)).toMatchObject({
      points: [
        { x: 800, y: 300 },
        { x: 1000, y: 340 },
        { x: 940, y: 560 },
      ],
    })
  })

  /**
   * Every coordinate in this application is in the stored image's pixel space, so one factor
   * has to go through the grid, every placement and every fog shape together — a uniform
   * similarity transform, which is why an aspect-ratio change is refused rather than scaled.
   */
  test('a bigger map of the same shape scales the grid, the coins and the fog by one factor', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)
    const stood = (await placementsOn(t, source.sceneId))[0]

    await replace(t, game, source.sceneId, { width: MAP_WIDTH * 2, height: MAP_HEIGHT * 2 })

    expect(await sceneRow(t, source.sceneId)).toMatchObject({
      imageWidth: MAP_WIDTH * 2,
      imageHeight: MAP_HEIGHT * 2,
      gridSize: 280,
      gridOffsetX: 25,
      gridOffsetY: 14.5,
    })
    // ⚠️ The same factor as the grid, which is the whole property: a coin centred on a
    // square before the swap is centred on it after. A placement multiplied by a different
    // number from the grid it was snapped to is the bug this mutation exists to not have.
    expect((await placementsOn(t, source.sceneId))[0]).toMatchObject({
      x: stood.x * 2,
      y: stood.y * 2,
    })
    const fog = await t.query(api.fog.list, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
    })
    expect(fog.find((row) => row.points === undefined)).toMatchObject({
      x: 200,
      y: 400,
      width: 600,
      height: 800,
    })

    // ⚠️ **A POLYGON'S VERTICES SCALE WITH ITS BOX, AND THIS IS THE ASSERTION THAT SAYS SO.**
    // The box and the outline are two representations of one shape, so scaling one and not the
    // other is a shape that hides the wrong part of the map — a correctly-sized bounding box
    // with the old map's outline inside it. It looks like a rendering bug from either chair,
    // and nothing else in this suite would have caught it: every other assertion here reads
    // four numbers that `scaleSceneFog` was always multiplying.
    expect(fog.find((row) => row.points !== undefined)).toMatchObject({
      points: [
        { x: 1600, y: 600 },
        { x: 2000, y: 680 },
        { x: 1880, y: 1120 },
      ],
    })
  })

  test('refuses a map of a different shape and changes nothing', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)
    const square = await storeImage(t, 'square')

    await expectKind(
      t.mutation(api.scenes.replaceImage, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: source.sceneId,
        imageId: square,
        imageWidth: 2000,
        imageHeight: 2000,
      }),
      'BadInput',
    )
    expect((await sceneRow(t, source.sceneId))?.imageId).toBe(source.imageId)
    expect(await blobExists(t, source.imageId)).toBe(true)

    // A pixel of rounding is not a different shape: the downscaler rounds both edges to
    // whole pixels, so an odd-numbered source comes back a fraction out.
    await t.mutation(api.scenes.replaceImage, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
      imageId: await storeImage(t, 'rounded'),
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT + 1,
    })
    expect((await sceneRow(t, source.sceneId))?.imageHeight).toBe(MAP_HEIGHT + 1)
  })

  /**
   * ⚠️ **REFUSED RATHER THAN CLAMPED, and the roadmap does not say which.** A calibration
   * silently pinned to `MIN_GRID_SIZE` is a grid that no longer lines up with the map,
   * discovered mid-session by a DM with no way to know the app changed their number.
   */
  test('refuses a scale that would take the grid out of range, rather than clamping it', async () => {
    const t = harness()
    const game = await makeGame(t)
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    await t.mutation(api.scenes.updateGrid, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId,
      gridSize: MIN_GRID_SIZE,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridVisible: true,
    })

    // A tenth of the width takes a 4 px grid to 0.4 px, which `isUsableGrid` refuses.
    await expectKind(
      t.mutation(api.scenes.replaceImage, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        imageId: await storeImage(t, 'tiny'),
        imageWidth: MAP_WIDTH / 10,
        imageHeight: MAP_HEIGHT / 10,
      }),
      'BadInput',
    )
    expect((await sceneRow(t, sceneId))?.gridSize).toBe(MIN_GRID_SIZE)
    expect((await sceneRow(t, sceneId))?.imageWidth).toBe(MAP_WIDTH)
  })

  test('reclaims the old blobs — but not one a copy is still drawing', async () => {
    const t = harness()
    const game = await makeGame(t)
    const source = await furnishedScene(t, game)

    // No copy yet: the outgoing map and its thumbnail are nobody else's.
    const first = await replace(t, game, source.sceneId, {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    })
    expect(await blobExists(t, source.imageId)).toBe(false)
    expect(await blobExists(t, source.thumbnailId)).toBe(false)

    // Now a duplicate shares `first`, so replacing it again must leave those bytes alone.
    await t.mutation(api.scenes.duplicate, {
      code: game.code,
      dmCode: game.dmCode,
      sceneId: source.sceneId,
      includeContents: false,
    })
    await replace(t, game, source.sceneId, { width: MAP_WIDTH, height: MAP_HEIGHT }, 'third')
    expect(await blobExists(t, first)).toBe(true)
  })

  test('checks the stored bytes, and needs the DM code', async () => {
    const t = harness()
    const game = await makeGame(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const { sceneId } = await makeScene(t, game.code, game.dmCode)
    const theirs = await makeScene(t, other.code, other.dmCode, 'Theirs')
    const huge = await storeImage(t, 'huge', MAX_SCENE_BYTES + 1)

    await expectKind(
      t.mutation(api.scenes.replaceImage, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId,
        imageId: huge,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'BadInput',
    )
    await expectKind(
      t.mutation(api.scenes.replaceImage, {
        code: game.code,
        dmCode: twiddle(game.dmCode),
        sceneId,
        imageId: await storeImage(t, 'fine'),
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.scenes.replaceImage, {
        code: game.code,
        dmCode: game.dmCode,
        sceneId: theirs.sceneId,
        imageId: await storeImage(t, 'fine-2'),
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'SceneNotFound',
    )
    // The refused blob survives the rollback, which is what `files.discard` is for.
    expect(await blobExists(t, huge)).toBe(true)
  })
})

describe('files.discard takes a list', () => {
  test('clears both blobs of a refused map upload in one call', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'huge', MAX_SCENE_BYTES + 1)
    const thumbnailId = await storeImage(t, 'thumb')

    await expectKind(
      t.mutation(api.scenes.create, {
        code: game.code,
        dmCode: game.dmCode,
        name: 'Too Big',
        imageId,
        thumbnailId,
        imageWidth: MAP_WIDTH,
        imageHeight: MAP_HEIGHT,
      }),
      'BadInput',
    )
    // A rejecting mutation cannot delete what it refused: both survive the rollback.
    expect(await blobExists(t, imageId)).toBe(true)
    expect(await blobExists(t, thumbnailId)).toBe(true)

    await t.mutation(api.files.discard, {
      code: game.code,
      dmCode: game.dmCode,
      imageIds: [imageId, thumbnailId],
    })
    expect(await blobExists(t, imageId)).toBe(false)
    expect(await blobExists(t, thumbnailId)).toBe(false)
  })

  test('a repeated id is one delete rather than two', async () => {
    const t = harness()
    const game = await makeGame(t)
    const imageId = await storeImage(t, 'twice')

    // A second `ctx.storage.delete` of the same id throws a plain Error, not a
    // ConvexError — see `deleteTokensInGame`. Passing an id twice must not reach that.
    await t.mutation(api.files.discard, {
      code: game.code,
      dmCode: game.dmCode,
      imageIds: [imageId, imageId],
    })
    expect(await blobExists(t, imageId)).toBe(false)
  })

  /**
   * ⚠️ **The whole call is refused, and the unheld blob survives.** The tempting
   * alternative is to delete the free one and skip the held one, which leaves the caller
   * unable to tell what happened — and the id it most needs to know about is the one it
   * would be told nothing about. See the ⚠️ on `files.discard`.
   */
  test('one referenced id refuses the whole call', async () => {
    const t = harness()
    const game = await makeGame(t)
    const scene = await makeScene(t, game.code, game.dmCode, 'Admittance')
    const loose = await storeImage(t, 'loose')

    await expectKind(
      t.mutation(api.files.discard, {
        code: game.code,
        dmCode: game.dmCode,
        imageIds: [loose, scene.imageId],
      }),
      'BadInput',
    )
    expect(await blobExists(t, scene.imageId)).toBe(true)
    expect(await blobExists(t, loose)).toBe(true)
  })

  /**
   * The predicate that would not have existed if `storageGuard.test.ts` still derived one
   * per table: `scenes` already had `sceneReferencesImage`, so a second blob column on the
   * same table would have gone unasked about and this call would have succeeded.
   */
  test('refuses a scene’s thumbnail, which is the column the old guard missed', async () => {
    const t = harness()
    const game = await makeGame(t)
    const thumbnailId = await storeImage(t, 'thumb')
    await t.mutation(api.scenes.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Admittance',
      imageId: await storeImage(t, 'map'),
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })

    await expectKind(
      t.mutation(api.files.discard, {
        code: game.code,
        dmCode: game.dmCode,
        imageIds: [thumbnailId],
      }),
      'BadInput',
    )
    expect(await blobExists(t, thumbnailId)).toBe(true)
  })

  test('refuses more ids than MAX_DISCARD_IDS, and deletes none of them', async () => {
    const t = harness()
    const game = await makeGame(t)
    const ids: Id<'_storage'>[] = []
    for (let i = 0; i <= MAX_DISCARD_IDS; i += 1) ids.push(await storeImage(t, `loose-${i}`))

    await expectKind(
      t.mutation(api.files.discard, { code: game.code, dmCode: game.dmCode, imageIds: ids }),
      'BadInput',
    )
    for (const id of ids) expect(await blobExists(t, id)).toBe(true)
  })

  test('an empty list is a no-op that succeeds', async () => {
    const t = harness()
    const game = await makeGame(t)
    expect(
      await t.mutation(api.files.discard, {
        code: game.code,
        dmCode: game.dmCode,
        imageIds: [],
      }),
    ).toBeNull()
  })
})
