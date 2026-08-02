/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { defaultNpcSheet } from './lib/sheet'
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
