/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { PRE_2024_SPEED_FEET } from './lib/migrate'
import { SPEED_FEET, defaultNpcSheet, defaultPcSheet, noSkills, speedOf } from './lib/sheet'
import type { NpcSheet, PcSheet, PresetSheet, StoredSheet } from './lib/sheet'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

/**
 * The suite for the purge tool in `convex/admin.ts` — a maintenance function, not a
 * feature, so what is asserted here is different in kind from the other suites.
 *
 * Nothing below is about who may call it: it is internal, absent from the public API,
 * and reachable only by a caller already holding the deployment's admin credentials.
 * That is the whole of its authorisation story and there is no gate to test. What
 * there *is* to test is the two ways a destructive tool goes wrong — it leaves
 * something behind, or it takes something it was not asked for — and one thing it
 * shares with every query in this application, which is that its payload carries no
 * secret.
 *
 * ⚠️ **The blast-radius test is the one that matters most.** A purge that deleted its
 * game correctly and quietly took a neighbouring one with it would pass every
 * assertion in the first block, because that block only ever looks at the game it
 * purged. So the second block builds two, purges one, and counts the other's rows —
 * with a positive control that they were there to begin with, because a leaves-it-alone
 * assertion passes trivially against a game that was never populated.
 */

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

async function storeImage(t: Harness, label: string): Promise<Id<'_storage'>> {
  const bytes = new Uint8Array(64)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (label.charCodeAt(i % label.length) + i) % 256
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([bytes])))
}

/**
 * A game with one of everything the purge has to reach, and with the three pointers
 * that make the deletion order matter: a seat claiming a character, a token standing
 * on a character, and a grant of that token to a second seat.
 *
 * Populated through the real mutations rather than by inserting rows, so the fixture
 * cannot drift from what a game actually looks like — a hand-built `characters` row
 * with no `characterVitals` beside it would let the vitals assertion below pass
 * without the purge deleting anything.
 */
async function populate(t: Harness, name: string) {
  const { code, dmCode } = await t.mutation(api.games.create, {
    name,
    dmName: 'Mike',
    recoveryPhrase: 'brass lantern',
  })

  const mapImageId = await storeImage(t, `map-${name}`)
  const { sceneId } = await t.mutation(api.scenes.create, {
    code,
    dmCode,
    name: 'Admittance',
    imageId: mapImageId,
    imageWidth: MAP_WIDTH,
    imageHeight: MAP_HEIGHT,
  })

  // The DM's own seat already exists — `games.create` seats the creator — so this is
  // the second and third.
  const playerId = await t
    .mutation(api.players.join, { code, displayName: 'Ana' })
    .then((seat) => seat.playerId)
  const otherPlayerId = await t
    .mutation(api.players.join, { code, displayName: 'Bea' })
    .then((seat) => seat.playerId)

  const { characterId } = await t.mutation(api.characters.create, {
    code,
    dmCode,
    name: 'Seraphine',
  })
  const { characterId: npcId } = await t.mutation(api.characters.create, {
    code,
    dmCode,
    name: 'Goblin',
    // An NPC as well as a hero, so the purge is asserted against a game holding a
    // secret. `maySeeCharacter` is what withholds this row from a player; nothing
    // withholds it from a delete, and the point of a purge is that it must not.
    sheet: defaultNpcSheet(),
  })
  await t.mutation(api.characters.claim, { code, playerId, characterId })

  // Two tokens, one with art and one without: the art is what makes the blob
  // assertions below mean something, and the bare coin is the ordinary case.
  const tokenImageId = await storeImage(t, `token-${name}`)
  const { tokenId } = await t.mutation(api.board.addToken, {
    code,
    dmCode,
    sceneId,
    name: 'Seraphine',
    layer: 'player',
    sizeSquares: 1,
    tint: '#c0392b',
    imageId: tokenImageId,
    characterId,
    x: 500,
    y: 500,
  })
  const { tokenId: hiddenTokenId } = await t.mutation(api.board.addToken, {
    code,
    dmCode,
    sceneId,
    name: 'Goblin',
    layer: 'gm',
    sizeSquares: 1,
    tint: '#34495e',
    characterId: npcId,
    x: 900,
    y: 900,
  })

  // A grant, so the seats being deleted are seats a surviving row could dangle from.
  await t.mutation(api.board.setControllers, {
    code,
    dmCode,
    tokenId: hiddenTokenId,
    playerIds: [otherPlayerId],
  })

  const gameId = await t.run(async (ctx) => {
    const game = await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
    if (!game) throw new Error(`no game with code ${code}`)
    return game._id
  })

  return {
    code,
    dmCode,
    gameId,
    sceneId,
    playerId,
    otherPlayerId,
    characterId,
    npcId,
    tokenId,
    hiddenTokenId,
    mapImageId,
    tokenImageId,
  }
}

/**
 * The stored rows for one game, read directly rather than through a projection.
 *
 * Every query in this application filters something — the DM layer, an NPC's sheet, a
 * reserved hero — so a payload coming back empty is not evidence that a table is. The
 * only assertion worth making about a delete is against the table.
 */
async function rowsFor(t: Harness, gameId: Id<'games'>) {
  return await t.run(async (ctx) => {
    const scenes = await ctx.db
      .query('scenes')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    const tokens = await ctx.db
      .query('tokens')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    const characters = await ctx.db
      .query('characters')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    const vitals = await ctx.db
      .query('characterVitals')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    const seats = await ctx.db
      .query('players')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()

    // Placements carry no gameId — they point at a scene and a token — so they are
    // gathered per token rather than per game. That is exactly the shape that makes an
    // orphan possible, which is why they are counted at all.
    const placements = (
      await Promise.all(
        tokens.map(
          async (token) =>
            await ctx.db
              .query('tokenPositions')
              .withIndex('by_tokenId', (q) => q.eq('tokenId', token._id))
              .collect(),
        ),
      )
    ).flat()

    return {
      game: await ctx.db.get('games', gameId),
      scenes: scenes.length,
      tokens: tokens.length,
      characters: characters.length,
      vitals: vitals.length,
      seats: seats.length,
      placements: placements.length,
    }
  })
}

/** Placements on one scene, by scene id — the half `rowsFor` cannot see once its tokens have gone. */
async function placementsOnScene(t: Harness, sceneId: Id<'scenes'>) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('tokenPositions')
      .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
      .collect()
    return rows.length
  })
}

async function blobExists(t: Harness, imageId: Id<'_storage'>) {
  return (await t.run(async (ctx) => await ctx.db.system.get('_storage', imageId))) !== null
}

/** The three secrets on a game document, read off the row rather than reconstructed. */
async function secretsOf(t: Harness, gameId: Id<'games'>) {
  const game = await t.run(async (ctx) => await ctx.db.get('games', gameId))
  if (!game) throw new Error('no such game')
  return {
    dmCode: game.dmCode,
    dmRecoverySalt: game.dmRecoverySalt,
    dmRecoveryHash: game.dmRecoveryHash,
  }
}

describe('admin.purgeGame', () => {
  test('takes the game and everything that belonged to it', async () => {
    const t = harness()
    const game = await populate(t, 'Board Smoke 2026-08-01T00:00:00.000Z')

    // Positive control. Every assertion after the purge is that a number is zero, and
    // zero is what an empty fixture produces too.
    const before = await rowsFor(t, game.gameId)
    expect(before).toMatchObject({
      scenes: 1,
      tokens: 2,
      characters: 2,
      vitals: 2,
      // The DM's seat plus Ana plus Bea.
      seats: 3,
      placements: 2,
    })
    expect(await blobExists(t, game.mapImageId)).toBe(true)
    expect(await blobExists(t, game.tokenImageId)).toBe(true)

    const receipt = await t.mutation(internal.admin.purgeGame, { gameId: game.gameId })
    expect(receipt).toMatchObject({
      name: 'Board Smoke 2026-08-01T00:00:00.000Z',
      code: game.code,
      counts: { scenes: 1, tokens: 2, characters: 2, seats: 3 },
    })

    const after = await rowsFor(t, game.gameId)
    expect(after.game).toBeNull()
    expect(after).toMatchObject({
      scenes: 0,
      tokens: 0,
      characters: 0,
      vitals: 0,
      seats: 0,
      placements: 0,
    })
    // Asked a second way, by scene rather than by token: `rowsFor` gathers placements
    // through the tokens, so once the tokens have gone it would report zero whether the
    // placements went with them or were orphaned.
    expect(await placementsOnScene(t, game.sceneId)).toBe(0)
  })

  test('takes the storage blobs with the rows', async () => {
    const t = harness()
    const game = await populate(t, 'Board Smoke blobs')

    await t.mutation(internal.admin.purgeGame, { gameId: game.gameId })

    // ⚠️ CLAUDE.md invariant 6. A purge that dropped the rows and left the images would
    // be a worse leak than the games it cleaned up: nothing in the application could
    // ever name these two blobs again, and they would sit against the 1 GB ceiling for
    // ever. The map and the token art are deleted by different helpers, in different
    // modules, so both are asserted.
    expect(await blobExists(t, game.mapImageId)).toBe(false)
    expect(await blobExists(t, game.tokenImageId)).toBe(false)
  })

  /**
   * ⚠️ **THE PURGE IS THE ONE DELETE PATH THAT MUST *NOT* ASK WHETHER SOMETHING ELSE HOLDS
   * THE BLOB, AND THIS IS WHAT MAKES THAT SAFE.**
   *
   * A purge takes every scene in the game, so *is another scene using this map?* is `true`
   * for a duplicate that is also about to go — asked per row it would keep the blob for ever.
   * Its fix is deduplication instead, and the bug being fixed is not about sharing at all:
   * a second `ctx.storage.delete` of the same id throws a plain `Error` rather than a
   * `ConvexError`, so it aborts the **whole** transaction. Before a map could be copied
   * nothing could produce two scenes on one blob; from the moment one can, a purge of any
   * game containing a copy would have failed outright and there would be no way left to
   * clean it up. `deleteTokensInGame` hit exactly this and documents it confirmed against a
   * real deployment.
   *
   * The second row is inserted directly, because `scenes.duplicate` does not exist yet —
   * which is the point of landing the fix here rather than inside the feature that trips it.
   *
   * The receipt is asserted as well as the blob, because "the purge did not throw" and "the
   * purge deleted both scenes" are different claims and only the second one is the fix.
   */
  test('deletes a blob two scenes share exactly once, rather than aborting', async () => {
    const t = harness()
    const game = await populate(t, 'Board Smoke shared blob')

    const original = await t.run(async (ctx) => await ctx.db.get('scenes', game.sceneId))
    if (!original) throw new Error('the fixture has no scene')
    await t.run(
      async (ctx) =>
        await ctx.db.insert('scenes', {
          gameId: original.gameId,
          name: 'Admittance (copy)',
          imageId: original.imageId,
          imageWidth: original.imageWidth,
          imageHeight: original.imageHeight,
          gridSize: original.gridSize,
          gridOffsetX: original.gridOffsetX,
          gridOffsetY: original.gridOffsetY,
          gridVisible: original.gridVisible,
        }),
    )

    const receipt = await t.mutation(internal.admin.purgeGame, { gameId: game.gameId })
    expect(receipt.counts.scenes).toBe(2)
    expect(await blobExists(t, game.mapImageId)).toBe(false)
    // And the rest of the purge still ran, which is the half a thrown transaction takes
    // with it: the game document itself is what everything else hangs off.
    expect(await t.run(async (ctx) => await ctx.db.get('games', game.gameId))).toBeNull()
  })

  test('leaves a second game in the same deployment completely untouched', async () => {
    const t = harness()
    const doomed = await populate(t, 'Board Smoke 2026-08-01T00:00:00.000Z')
    const spared = await populate(t, 'Kobold Season')

    // The positive control for this whole test. Without it, "the spared game still has
    // its rows" is a claim about a game that might never have had any.
    const before = await rowsFor(t, spared.gameId)
    expect(before).toMatchObject({
      scenes: 1,
      tokens: 2,
      characters: 2,
      vitals: 2,
      seats: 3,
      placements: 2,
    })

    await t.mutation(internal.admin.purgeGame, { gameId: doomed.gameId })

    const after = await rowsFor(t, spared.gameId)
    expect(after.game).not.toBeNull()
    expect(after).toMatchObject(before)
    expect(await placementsOnScene(t, spared.sceneId)).toBe(2)
    expect(await blobExists(t, spared.mapImageId)).toBe(true)
    expect(await blobExists(t, spared.tokenImageId)).toBe(true)

    // And the game is still playable rather than merely present: the claim pointer, the
    // grant and the token's character binding are the three relations the purge order
    // walks, so they are the three most likely to be swept by id from the wrong game.
    const relations = await t.run(async (ctx) => {
      const seat = await ctx.db.get('players', spared.playerId)
      const token = await ctx.db.get('tokens', spared.hiddenTokenId)
      return {
        claimed: seat?.characterId ?? null,
        granted: token?.controllerIds ?? null,
        standingOn: token?.characterId ?? null,
      }
    })
    expect(relations.claimed).toBe(spared.characterId)
    expect(relations.granted).toEqual([spared.otherPlayerId])
    expect(relations.standingOn).toBe(spared.npcId)
  })

  test('refuses an id it cannot find rather than reporting an empty success', async () => {
    const t = harness()
    const game = await populate(t, 'Board Smoke twice')

    await t.mutation(internal.admin.purgeGame, { gameId: game.gameId })

    // A second pass over the same id means the listing and the deployment disagree, and
    // a tool deleting things is the wrong place to shrug that off.
    await expect(
      t.mutation(internal.admin.purgeGame, { gameId: game.gameId }),
    ).rejects.toMatchObject({ data: { kind: 'GameNotFound' } })
  })
})

describe('admin.listByPrefix', () => {
  test('names the matching games and counts what would go with each', async () => {
    const t = harness()
    const smoke = await populate(t, 'Board Smoke 2026-08-01T00:00:00.000Z')
    await populate(t, 'Kobold Season')

    const listing = await t.query(internal.admin.listByPrefix, { prefix: 'Board Smoke ' })
    expect(listing.truncated).toBe(false)
    expect(listing.games).toHaveLength(1)
    expect(listing.games[0]).toMatchObject({
      _id: smoke.gameId,
      name: 'Board Smoke 2026-08-01T00:00:00.000Z',
      code: smoke.code,
      createdByName: 'Mike',
      counts: { scenes: 1, tokens: 2, characters: 2, seats: 3 },
    })
    expect(typeof listing.games[0]._creationTime).toBe('number')
  })

  test('carries no DM code, no salt and no recovery hash', async () => {
    const t = harness()
    const smoke = await populate(t, 'Board Smoke 2026-08-01T00:00:00.000Z')
    const secrets = await secretsOf(t, smoke.gameId)

    const listing = await t.query(internal.admin.listByPrefix, { prefix: 'Board Smoke ' })
    const serialised = JSON.stringify(listing)

    // The positive control, and it is doing real work here: a scan for three strings
    // over an empty array passes, and so does a scan over a payload that was filtered
    // down to nothing by a wrong prefix. The join code proves the scan is reading a
    // real game — and the join code is deliberately the one code that *should* be here,
    // since it is what a person recognises the game by.
    expect(listing.games).toHaveLength(1)
    expect(serialised).toContain(smoke.code)

    expect(serialised).not.toContain(secrets.dmCode)
    expect(serialised).not.toContain(secrets.dmRecoverySalt)
    expect(serialised).not.toContain(secrets.dmRecoveryHash)

    // The keys as well as the values. A secret renamed on its way out would slip past
    // the substring scan above, and `purgeCandidateValidator` is derived from
    // `publicGameValidator` precisely so neither can happen.
    const keys = Object.keys(listing.games[0])
    expect(keys).not.toContain('dmCode')
    expect(keys).not.toContain('dmRecoverySalt')
    expect(keys).not.toContain('dmRecoveryHash')
    expect(keys.sort()).toEqual(
      ['_creationTime', '_id', 'code', 'counts', 'createdByName', 'name'].sort(),
    )
  })

  test('a game outside the prefix is neither listed nor countable from the listing', async () => {
    const t = harness()
    await populate(t, 'Board Smoke 2026-08-01T00:00:00.000Z')
    await populate(t, 'Kobold Season')

    // The prefix is the whole of this tool's blast radius — there is no `--all` — so a
    // real game staying out of the list is the assertion that keeps it out of harm.
    const listing = await t.query(internal.admin.listByPrefix, { prefix: 'Board Smoke ' })
    expect(listing.games.map((game) => game.name)).toEqual([
      'Board Smoke 2026-08-01T00:00:00.000Z',
    ])

    // And the empty prefix does match everything, which is why it has to be typed out.
    const everything = await t.query(internal.admin.listByPrefix, { prefix: '' })
    expect(everything.games).toHaveLength(2)
  })

  test('an unmatched prefix is an empty list rather than a refusal', async () => {
    const t = harness()
    await populate(t, 'Kobold Season')

    const listing = await t.query(internal.admin.listByPrefix, { prefix: 'Board Smoke ' })
    expect(listing).toEqual({ truncated: false, games: [] })
  })
})

// ---------------------------------------------------------------------------
// TRANSITION ONLY — Milestone 14's sweep
// ---------------------------------------------------------------------------

/**
 * The suite for `admin.listUnmigrated` and `admin.migrateGame`, and it is a different
 * shape of test again from the purge above.
 *
 * A destructive tool goes wrong by leaving something behind or by taking something it was
 * not asked for. A **migration** goes wrong in three ways, and each has a block below:
 *
 * - it **does not run** — so every fixture here is a document the sweep demonstrably
 *   changes, and every assertion has a before as well as an after;
 * - it **runs twice** — so the whole thing is run twice and the second pass must write
 *   nothing at all, which is what makes it safe against a deployment somebody is playing
 *   on;
 * - it **rehearses and writes anyway** — so the dry run is asserted against a fixture the
 *   real run is then shown to change, because "nothing was written" passes trivially over
 *   a game that had nothing to write.
 *
 * ⚠️ **Every fixture is inserted through `ctx.db` rather than through a mutation, and the
 * awkwardness is the job rather than a nuisance.** These are rows as a deployment holds
 * them — a `race` with no `species`, thirteen skill flags, a `spentPerRest` — and no
 * mutation in the application produces one any more. They still *validate*, because this is
 * the wide half of the transition and the schema is deliberately wide enough to hold both
 * the shapes the sweep reads and the shapes it writes. The narrowing commit is what takes
 * that away, and it is what forces this block to relax the harness.
 */

/** The thirteen skill flags a `pc` sheet carried before the 2024 conversion. */
const THIRTEEN_SKILLS = {
  athletics: false,
  acrobatics: true,
  sleightOfHand: false,
  stealth: true,
  arcana: false,
  investigation: false,
  animalHandling: false,
  insight: false,
  perception: true,
  deception: false,
  intimidation: false,
  performance: false,
  persuasion: false,
}

/** The five the 2024 conversion added, which a sheet stored before it does not carry. */
const ADDED_IN_2024 = ['history', 'nature', 'religion', 'medicine', 'survival'] as const

/**
 * A `preset` as the database holds one from before the rename: `race` required, no
 * `species`.
 */
function legacyPreset(overrides: Record<string, unknown> = {}): StoredSheet {
  return {
    kind: 'preset',
    race: 'human',
    classKey: 'fighter',
    subclassKey: null,
    level: 1,
    locked: false,
    ...overrides,
  } as unknown as StoredSheet
}

/** A hand-typed hero with thirteen skill flags and no `speed`. */
function legacyPc(overrides: Partial<PcSheet> = {}): StoredSheet {
  return {
    ...defaultPcSheet(),
    className: 'Rogue',
    skillProficiencies: THIRTEEN_SKILLS,
    ...overrides,
  } as unknown as StoredSheet
}

/** A hand-typed creature with no `speed`, which is every one written before the bestiary. */
function legacyNpc(overrides: Partial<NpcSheet> = {}): StoredSheet {
  return { ...defaultNpcSheet(), notes: 'A goblin somebody typed in.', ...overrides }
}

async function makeGame(t: Harness, name: string) {
  const { code, dmCode } = await t.mutation(api.games.create, {
    name,
    dmName: 'Mike',
    recoveryPhrase: 'brass lantern',
  })
  const gameId = await t.run(async (ctx) => {
    const game = await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
    if (!game) throw new Error(`no game with code ${code}`)
    return game._id
  })
  return { code, dmCode, gameId }
}

/**
 * Inserts a character and its vitals row straight into the tables, bypassing every
 * mutation.
 *
 * That is the only way to produce a pre-conversion document now that the narrowing has
 * landed, and it is also the honest fixture: what this sweep meets on a real deployment is
 * a row, not a request.
 */
async function insertLegacy(
  t: Harness,
  gameId: Id<'games'>,
  name: string,
  sheet: StoredSheet,
  vitals: Record<string, unknown> = {},
): Promise<Id<'characters'>> {
  return await t.run(async (ctx) => {
    const characterId = await ctx.db.insert('characters', { gameId, name, sheet })
    await ctx.db.insert('characterVitals', {
      gameId,
      characterId,
      currentHp: 10,
      ...vitals,
    } as unknown as Omit<Doc<'characterVitals'>, '_id' | '_creationTime'>)
    return characterId
  })
}

async function storedSheet(t: Harness, characterId: Id<'characters'>) {
  const row = await t.run(async (ctx) => await ctx.db.get('characters', characterId))
  if (!row) throw new Error('no such character')
  return row.sheet as StoredSheet & Record<string, unknown>
}

async function storedVitals(t: Harness, characterId: Id<'characters'>) {
  const row = await t.run(
    async (ctx) =>
      await ctx.db
        .query('characterVitals')
        .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
        .unique(),
  )
  if (!row) throw new Error('no vitals row')
  return row as Doc<'characterVitals'> & Record<string, unknown>
}

/** Every row of a game, as JSON, so "nothing was written" can be asserted whole. */
async function snapshot(t: Harness, gameId: Id<'games'>) {
  return await t.run(async (ctx) => {
    const characters = await ctx.db
      .query('characters')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    const vitals = await ctx.db
      .query('characterVitals')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()
    return JSON.stringify({ characters, vitals })
  })
}

function unmigrated(t: Harness) {
  return t.query(internal.admin.listUnmigrated, {
    paginationOpts: { numItems: 25, cursor: null },
  })
}

const NOTHING = {
  species: 0,
  archetypes: 0,
  skills: 0,
  overrideSkills: 0,
  speeds: 0,
  uses: 0,
}

describe('admin.listUnmigrated', () => {
  test('names a game with unswept documents and counts each kind of change', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Undercroft')
    await insertLegacy(t, game.gameId, 'Seraphine', legacyPreset())
    await insertLegacy(t, game.gameId, 'Thorn', legacyPc())
    await insertLegacy(t, game.gameId, 'Goblin', legacyNpc(), {
      spentPerRest: ['relentless-endurance'],
    })

    const listing = await unmigrated(t)
    expect(listing.isDone).toBe(true)
    expect(listing.page).toHaveLength(1)
    expect(listing.page[0]).toMatchObject({
      _id: game.gameId,
      name: 'The Undercroft',
      code: game.code,
      createdByName: 'Mike',
      counts: { species: 1, archetypes: 0, skills: 1, overrideSkills: 0, speeds: 2, uses: 1 },
    })
  })

  test('a game with nothing to do is absent rather than listed with six zeroes', async () => {
    const t = harness()
    const game = await makeGame(t, 'Already Swept')
    // Built through the real mutation, so it is exactly what a premade character created
    // today looks like: a `species`, eighteen flags, and no legacy array.
    await t.mutation(api.characters.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Modern Hero',
      sheet: {
        kind: 'preset',
        species: 'human',
        classKey: 'fighter',
        subclassKey: null,
        level: 1,
        locked: false,
      },
    })

    const listing = await unmigrated(t)
    expect(listing.page).toEqual([])
    expect(listing.isDone).toBe(true)
  })

  /**
   * ⚠️ **THE ONE PLACE THIS SWEEP CANNOT TELL A LEGACY ROW FROM A NEW ONE, WRITTEN DOWN
   * RATHER THAN DISCOVERED BY WHOEVER RUNS IT SECOND.**
   *
   * `characters.create` with no sheet writes `defaultPcSheet()`, which carries **no
   * `speed`** — deliberately, because absent means *the default*, and that is the whole
   * design `speedOf` exists for. But *absent* is also exactly what a sheet typed in 2023
   * looks like, and the pin has nothing else to go on. So a blank hero made five minutes
   * ago is pinned to 35 like everything else, and 35 is the wrong number for it.
   *
   * Two consequences, and both are accepted rather than fixed:
   *
   * - a character created between the deploy that moved `SPEED_FEET` and the run of this
   *   sweep gets five feet it did not ask for — visible on the sheet, and one field for a
   *   DM to correct;
   * - **this tool does not converge to "nothing left" on a deployment somebody is still
   *   playing on**, because every new blank hero is another pinnable sheet. Run it
   *   promptly after the deploy; it is transition code, not a cron job.
   *
   * The fix, if this is ever run months late, is a creation-time cutoff passed to both
   * functions — the shape the Convex guidelines prescribe for a query that needs the wall
   * clock. It is not built because the sweep is meant to run once, and an argument the
   * operator has to guess a value for is its own hazard.
   */
  test('a blank hero created today is pinned too, because absent means the same thing', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Window')
    await t.mutation(api.characters.create, {
      code: game.code,
      dmCode: game.dmCode,
      name: 'Brand New',
    })

    const listing = await unmigrated(t)
    expect(listing.page).toHaveLength(1)
    expect(listing.page[0]!.counts).toEqual({ ...NOTHING, speeds: 1 })
  })

  /**
   * ⚠️ **THE DRY RUN, WITH A POSITIVE CONTROL.** "Nothing was written" passes trivially
   * over a game that had nothing to write, so the same fixture is listed, asserted
   * byte-identical, and then demonstrably changed by the real run.
   *
   * The claim is structural rather than behavioural: `listUnmigrated` is an
   * `internalQuery`, and a `QueryCtx` has no `patch`, no `insert` and no `replace`. There
   * is no edit to it that could start writing.
   */
  test('listing a game changes nothing about it, and the real run then does', async () => {
    const t = harness()
    const game = await makeGame(t, 'Rehearsal')
    await insertLegacy(t, game.gameId, 'Seraphine', legacyPreset())
    await insertLegacy(t, game.gameId, 'Thorn', legacyPc())

    const before = await snapshot(t, game.gameId)

    await unmigrated(t)
    await unmigrated(t)
    expect(await snapshot(t, game.gameId)).toBe(before)

    // The positive control: the fixture really was one the sweep changes, so the two
    // assertions above are about the dry run rather than about an inert game.
    await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(await snapshot(t, game.gameId)).not.toBe(before)
  })
})

describe('admin.migrateGame', () => {
  test('folds race into species and drops the old field', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Rename')
    const characterId = await insertLegacy(t, game.gameId, 'Seraphine', legacyPreset())

    expect(await storedSheet(t, characterId)).toMatchObject({ race: 'human' })

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt).toMatchObject({ name: 'The Rename', code: game.code })
    expect(receipt.counts).toEqual({ ...NOTHING, species: 1 })

    const sheet = await storedSheet(t, characterId)
    expect(sheet.species).toBe('human')
    // ⚠️ Dropped rather than left beside the new field. A row carrying both still fails the
    // narrowed push, because `v.object` refuses a field it does not name.
    expect(sheet).not.toHaveProperty('race')
  })

  test('the new field wins when a half-finished pass left both', async () => {
    const t = harness()
    const game = await makeGame(t, 'Interrupted')
    const characterId = await insertLegacy(
      t,
      game.gameId,
      'Seraphine',
      legacyPreset({ race: 'human', species: 'elf' }),
    )

    await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })

    // `speciesKeyOf`'s rule, not a second copy of it: the new field wins, which is what
    // made the backfill interruptible in the first place.
    const sheet = await storedSheet(t, characterId)
    expect(sheet.species).toBe('elf')
    expect(sheet).not.toHaveProperty('race')
  })

  /**
   * ⚠️ **The acceptance criterion for the species half of the milestone, and the reason
   * `'half-orc'` stays in `storedSpeciesKeyValidator`.** A Half-Orc created before the
   * conversion has to open, keep its name, and say plainly which species needs choosing
   * again — which requires the key to remain **storable**. The sweep therefore renames the
   * field and leaves the value entirely alone: remapping it onto Orc would satisfy the
   * schema and hand somebody a different character.
   */
  test('a half-orc keeps its key through the sweep rather than being remapped', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Retired Species')
    const characterId = await insertLegacy(
      t,
      game.gameId,
      'Grukk',
      legacyPreset({ race: 'half-orc' }),
    )

    await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })

    const sheet = await storedSheet(t, characterId)
    expect(sheet.species).toBe('half-orc')
    expect(sheet).not.toHaveProperty('race')
    // And the character still resolves, which is the half a player sees.
    const payload = await t.query(api.characters.list, { code: game.code, dmCode: game.dmCode })
    expect(payload.find((row) => row._id === characterId)?.name).toBe('Grukk')
  })

  /**
   * ⚠️ **CLEARED AND UNLOCKED, NEVER REMAPPED — and `locked: false` is the half people
   * forget.** A Rogue whose Assassin became a Thief has been given a different character;
   * a locked sheet whose selection was cleared is a sheet nobody can fix, because the
   * builder refuses to save it and only the DM can unlock.
   */
  test('a retired archetype is cleared and the sheet unlocked', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Retired Archetype')
    const characterId = await insertLegacy(
      t,
      game.gameId,
      'Vex',
      legacyPreset({ classKey: 'rogue', subclassKey: 'assassin', level: 3, locked: true }),
    )

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts).toEqual({ ...NOTHING, species: 1, archetypes: 1 })

    const sheet = await storedSheet(t, characterId)
    expect(sheet.subclassKey).toBeNull()
    expect(sheet.locked).toBe(false)
    // Nothing else about the character moved. Clearing is not remapping.
    expect(sheet).toMatchObject({ classKey: 'rogue', level: 3, species: 'human' })
  })

  test('an archetype that still resolves is left alone, lock included', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Surviving Archetype')
    const characterId = await insertLegacy(
      t,
      game.gameId,
      'Kessa',
      legacyPreset({ classKey: 'rogue', subclassKey: 'thief', level: 3, locked: true }),
    )

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts.archetypes).toBe(0)

    const sheet = await storedSheet(t, characterId)
    expect(sheet.subclassKey).toBe('thief')
    // ⚠️ The lock is the DM's, so an untouched selection must not quietly unlock. The two
    // halves of "cleared and unlocked" travel together or not at all.
    expect(sheet.locked).toBe(true)
  })

  test('back-fills the five 2024 skill flags on a hand-built hero', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Skills')
    const characterId = await insertLegacy(t, game.gameId, 'Thorn', legacyPc())

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts).toEqual({ ...NOTHING, skills: 1, speeds: 1 })

    const sheet = (await storedSheet(t, characterId)) as PcSheet
    expect(Object.keys(sheet.skillProficiencies!).sort()).toEqual(Object.keys(noSkills()).sort())
    for (const key of ADDED_IN_2024) {
      expect(sheet.skillProficiencies![key], key).toBe(false)
    }
    // A fill rather than a reset: the three the DM had ticked are still ticked.
    expect(sheet.skillProficiencies).toMatchObject({
      acrobatics: true,
      stealth: true,
      perception: true,
    })
  })

  /**
   * ⚠️ **The second place the five live, and the one a sweep forgets.** A DM who has typed
   * over a premade character's skills has a thirteen-key object inside the override diff,
   * checked by the same `skillProficienciesValidator` and refused by the same narrowed
   * push. A sweep that only walked `pc` sheets would leave the deploy failing with no
   * obvious reason why.
   */
  test('back-fills the five inside a preset override diff too', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Override Diff')
    const characterId = await insertLegacy(
      t,
      game.gameId,
      'Seraphine',
      legacyPreset({
        overrides: { armourClass: 21, skillProficiencies: THIRTEEN_SKILLS },
      }),
    )

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts).toEqual({ ...NOTHING, species: 1, overrideSkills: 1 })

    const sheet = (await storedSheet(t, characterId)) as PresetSheet
    const flags = sheet.overrides!.skillProficiencies!
    expect(Object.keys(flags).sort()).toEqual(Object.keys(noSkills()).sort())
    for (const key of ADDED_IN_2024) expect(flags[key], key).toBe(false)
    expect(flags).toMatchObject({ acrobatics: true, stealth: true, perception: true })
    // The rest of the diff is untouched — the sweep is not a normalisation pass.
    expect(sheet.overrides!.armourClass).toBe(21)
  })

  /**
   * ⚠️ **THE SPEED PIN, AND THE ASYMMETRY IS THE WHOLE OF IT.** `speedOf` answers
   * `SPEED_FEET` for any sheet with the field absent, and the migration commit moved that
   * constant 35 → 30 — so a hand-typed goblin would silently lose five feet. A `preset`
   * stores no speed at all and must NOT be pinned: `resolvePreset` writes the constant into
   * the *resolved* sheet and a 2024 species then sets its own absolute over the top, so
   * flipping the constant re-resolves those correctly, Goliaths and Wood Elves included.
   */
  test('pins a hand-built sheet to the speed it already meant, and leaves a preset alone', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Speed Pin')
    const hero = await insertLegacy(t, game.gameId, 'Thorn', legacyPc())
    const goblin = await insertLegacy(t, game.gameId, 'Goblin', legacyNpc())
    const premade = await insertLegacy(t, game.gameId, 'Seraphine', legacyPreset())

    // The pin writes 35 while the constant now says 30 — which is the whole reason
    // `PRE_2024_SPEED_FEET` is a literal rather than an import of `SPEED_FEET`.
    expect(PRE_2024_SPEED_FEET).toBe(35)
    expect(SPEED_FEET).toBe(30)

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts.speeds).toBe(2)

    expect((await storedSheet(t, hero)).speed).toBe(PRE_2024_SPEED_FEET)
    expect((await storedSheet(t, goblin)).speed).toBe(PRE_2024_SPEED_FEET)
    expect(speedOf((await storedSheet(t, hero)) as PcSheet)).toBe(35)

    // The preset is untouched and re-resolves through the species instead: a Human prints
    // 30 because the SRD says so, not because a constant does.
    expect(await storedSheet(t, premade)).not.toHaveProperty('speed')
    const payload = await t.query(api.characters.sheet, {
      code: game.code,
      dmCode: game.dmCode,
      characterId: premade,
    })
    expect((payload!.sheet as PcSheet).speed).toBe(30)
  })

  test('a sheet that already carries a speed is not repinned', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Fast Goblin')
    const characterId = await insertLegacy(t, game.gameId, 'Worg', legacyNpc({ speed: 50 }))

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts.speeds).toBe(0)
    expect((await storedSheet(t, characterId)).speed).toBe(50)
  })

  /**
   * ⚠️ **The fold is `spentUsesOf`'s, reused rather than re-derived**: one legacy key is
   * exactly one spent use, a counted row wins a collision, and legacy keys come first so a
   * client's render order does not jump on the day the sweep runs.
   */
  test('folds the legacy per-rest array into the counted one and removes the field', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Spent Uses')
    const characterId = await insertLegacy(t, game.gameId, 'Grukk', legacyNpc({ speed: 30 }), {
      spentPerRest: ['second-wind', 'rage'],
      spentUses: [{ key: 'rage', spent: 3 }],
    })

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts).toEqual({ ...NOTHING, uses: 1 })

    const row = await storedVitals(t, characterId)
    expect(row.spentUses).toEqual([
      { key: 'second-wind', spent: 1 },
      { key: 'rage', spent: 3 },
    ])
    // ⚠️ Removed, not emptied. `spentPerRest: []` refuses the narrowed push exactly as a
    // full one does, and `ctx.db.patch` reading `undefined` as *delete this field* is the
    // one place in this codebase where naming a field and handing it `undefined` is right.
    expect(row).not.toHaveProperty('spentPerRest')
  })

  test('an empty legacy array is removed rather than left, and writes no empty spentUses', async () => {
    const t = harness()
    const game = await makeGame(t, 'The Empty Array')
    const characterId = await insertLegacy(t, game.gameId, 'Grukk', legacyNpc({ speed: 30 }), {
      spentPerRest: [],
    })

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts.uses).toBe(1)

    const row = await storedVitals(t, characterId)
    expect(row).not.toHaveProperty('spentPerRest')
    // *Absent, never zero* — this table's rule for every count on it. Writing `spentUses: []`
    // would grow every row in the deployment to say nothing.
    expect(row).not.toHaveProperty('spentUses')
  })

  /**
   * ⚠️ **IDEMPOTENCE, ASSERTED AS *NOTHING WAS WRITTEN* RATHER THAN AS *THE ANSWER IS THE
   * SAME*.** A second pass returning the same sheet would look correct and still be a write
   * per character, which on this table is a re-push of the health-bar subscription for
   * every client at the table. Every planner answers null for a document that already
   * agrees with the schema, so the second pass patches nothing — and the whole-game
   * snapshot is what proves it, `_creationTime` and all.
   */
  test('running it twice writes nothing the second time', async () => {
    const t = harness()
    const game = await makeGame(t, 'Twice')
    await insertLegacy(
      t,
      game.gameId,
      'Seraphine',
      legacyPreset({ classKey: 'rogue', subclassKey: 'assassin', level: 3, locked: true }),
    )
    await insertLegacy(t, game.gameId, 'Thorn', legacyPc())
    await insertLegacy(t, game.gameId, 'Goblin', legacyNpc(), { spentPerRest: ['rage'] })

    const first = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(first.counts).toEqual({
      species: 1,
      archetypes: 1,
      skills: 1,
      overrideSkills: 0,
      speeds: 2,
      uses: 1,
    })

    const afterFirst = await snapshot(t, game.gameId)

    const second = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(second.counts).toEqual(NOTHING)
    expect(await snapshot(t, game.gameId)).toBe(afterFirst)

    // And the listing agrees, which is what makes the CLI stop rather than loop.
    const listing = await unmigrated(t)
    expect(listing.page).toEqual([])
  })

  test('leaves a second game in the same deployment completely untouched', async () => {
    const t = harness()
    const doomed = await makeGame(t, 'Swept')
    const spared = await makeGame(t, 'Spared')
    await insertLegacy(t, doomed.gameId, 'Seraphine', legacyPreset())
    await insertLegacy(t, spared.gameId, 'Thorn', legacyPreset())

    const before = await snapshot(t, spared.gameId)
    // The positive control: the spared game really does hold a row the sweep would change.
    expect(before).toContain('race')

    await t.mutation(internal.admin.migrateGame, { gameId: doomed.gameId })
    expect(await snapshot(t, spared.gameId)).toBe(before)
  })

  test('refuses an id it cannot find rather than reporting an empty success', async () => {
    const t = harness()
    const game = await makeGame(t, 'Gone')
    await t.mutation(internal.admin.purgeGame, { gameId: game.gameId })

    await expect(
      t.mutation(internal.admin.migrateGame, { gameId: game.gameId }),
    ).rejects.toMatchObject({ data: { kind: 'GameNotFound' } })
  })

  /**
   * A Milestone 1 character has no `sheet` field at all. `resolveSheet` reads that as a
   * default hero on the way out and stores nothing, so there is nothing to migrate — and
   * materialising one would be this sweep inventing a document nobody wrote.
   */
  test('a character with no sheet at all is left without one', async () => {
    const t = harness()
    const game = await makeGame(t, 'Milestone One')
    const characterId = await t.run(
      async (ctx) => await ctx.db.insert('characters', { gameId: game.gameId, name: 'Nobody' }),
    )

    const receipt = await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect(receipt.counts).toEqual(NOTHING)
    expect(
      await t.run(async (ctx) => await ctx.db.get('characters', characterId)),
    ).not.toHaveProperty('sheet')
  })

  /**
   * ⚠️ **`spentUsesOf` still folds a legacy array although the field is off the schema**,
   * which is the tolerance a non-atomic push needs: a row written by an older deployment
   * has to keep meaning what it meant until the sweep reaches it. This is the assertion
   * that moved here out of `characters.test.ts`, where the fixture had stopped being
   * producible.
   */
  test('a legacy row reads correctly through the payload before the sweep touches it', async () => {
    const t = harness()
    const game = await makeGame(t, 'Before The Sweep')
    const characterId = await insertLegacy(t, game.gameId, 'Aldis', legacyNpc({ speed: 30 }), {
      spentPerRest: ['heroic-inspiration'],
    })

    const rows = await t.query(api.characters.vitals, { code: game.code, dmCode: game.dmCode })
    expect(rows.find((row) => row.characterId === characterId)).toMatchObject({
      spentUses: [{ key: 'heroic-inspiration', spent: 1 }],
    })

    // And the sweep then makes the same answer true of the stored row.
    await t.mutation(internal.admin.migrateGame, { gameId: game.gameId })
    expect((await storedVitals(t, characterId)).spentUses).toEqual([
      { key: 'heroic-inspiration', spent: 1 },
    ])
  })
})
