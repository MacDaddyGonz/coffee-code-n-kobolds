/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { ConvexError } from 'convex/values'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { MAX_DISPLAY_NAME_LENGTH } from './lib/codes'
import { MAX_SEATS_PER_GAME } from './lib/games'

const modules = import.meta.glob('./**/*.ts')

type Harness = ReturnType<typeof convexTest>
type ErrorKind =
  | 'BadInput'
  | 'GameFull'
  | 'GameNotFound'
  | 'PlayerNotFound'
  | 'NameTaken'
  | 'CharacterTaken'
  | 'CharacterNotFound'

function harness(): Harness {
  return convexTest(schema, modules)
}

async function createGame(t: Harness, dmName = 'Mike') {
  return await t.mutation(api.games.create, {
    name: 'Kobold Season',
    dmName,
    recoveryPhrase: 'brass lantern',
  })
}

async function join(t: Harness, code: string, displayName: string) {
  return await t.mutation(api.players.join, { code, displayName })
}

/**
 * Takes the whole game rather than its join code, because **creating a character is
 * the DM's on every path now** and the fixture therefore needs both codes.
 *
 * Every call site already had the object in hand, so this is the cheap way to thread
 * the DM code through. This suite is about seats; the gate itself is asserted in
 * `characters.test.ts`.
 */
async function addCharacter(t: Harness, game: { code: string; dmCode: string }, name: string) {
  const { characterId } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name,
  })
  return characterId
}

async function claim(
  t: Harness,
  code: string,
  playerId: Id<'players'>,
  characterId: Id<'characters'>,
) {
  await t.mutation(api.characters.claim, { code, playerId, characterId })
}

async function playerRows(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('players').collect())
}

/**
 * Who is at the table and which of them wears the badge, in the server's own join
 * order, as a shape small enough to write a whole roster out with `toEqual`.
 *
 * These assertions used to go through `players.listNames`, a query that returned this
 * projection and nothing else. It is gone — the name gate mounted it alongside
 * `useSeat`'s `players.list {code}`, which is a second cache entry, a second socket
 * and a second server execution for a strict subset of rows already on the wire — so
 * the projection it used to perform is done here instead. Nothing about what these
 * tests assert changed: the roster is still whole (`toEqual`, not `toMatchObject`),
 * still ordered, and still checked for the badge, which is the part several of them
 * exist for. Dropping the extra fields at the helper rather than at each call site is
 * what keeps the assertion readable — `characterName` and `_creationTime` are
 * `players.list`'s subject and are asserted directly wherever they are the point.
 */
async function seatNames(t: Harness, code: string) {
  return (await t.query(api.players.list, { code })).map(({ displayName, isDm }) => ({
    displayName,
    isDm,
  }))
}

async function playerRow(t: Harness, playerId: Id<'players'>) {
  return await t.run(async (ctx) => await ctx.db.get('players', playerId))
}

/**
 * Asserts both that the call rejected and which `kind` it carried. A test that
 * only checks "something threw" keeps passing when the wrong guard fires — and
 * every guard in this module is reachable by ordinary user input.
 */
async function expectRejection(call: Promise<unknown>, kind: ErrorKind) {
  await expect(call).rejects.toThrow()
  const thrown = (await call.catch((error: unknown) => error)) as ConvexError<{ kind: string }>
  expect(thrown).toBeInstanceOf(ConvexError)
  expect(thrown.data.kind).toBe(kind)
}

/** True if `value` contains a surrogate code unit without its pair. */
function hasLoneSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
}

describe('players.join is idempotent on the normalised display name', () => {
  test('joining twice under the same name yields one seat and the same playerId', async () => {
    const t = harness()
    const game = await createGame(t)

    const first = await join(t, game.code, 'Sam')
    const second = await join(t, game.code, 'Sam')

    expect(first.rejoined).toBe(false)
    expect(second.rejoined).toBe(true)
    expect(second.playerId).toBe(first.playerId)

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.filter((seat) => seat.displayName === 'Sam')).toHaveLength(1)
  })

  test('case and surrounding whitespace never separate a player from their seat', async () => {
    const t = harness()
    const game = await createGame(t)

    const original = await join(t, game.code, 'Sam')
    const variants = ['sam', 'SAM', 'sAm', '  Sam  ', '\tSam\t', '\nSam ', '  Sam  ']

    for (const variant of variants) {
      const result = await join(t, game.code, variant)
      expect(result.rejoined).toBe(true)
      expect(result.playerId).toBe(original.playerId)
    }

    const rows = await playerRows(t)
    expect(rows.filter((row) => row.nameKey === 'sam')).toHaveLength(1)
  })

  test('internal whitespace is collapsed, so "Sam   Vimes" is "Sam Vimes"', async () => {
    const t = harness()
    const game = await createGame(t)

    const spaced = await join(t, game.code, 'Sam   Vimes')
    expect(spaced.displayName).toBe('Sam Vimes')

    const tabbed = await join(t, game.code, ' Sam \t Vimes ')
    expect(tabbed.rejoined).toBe(true)
    expect(tabbed.playerId).toBe(spaced.playerId)

    const rows = await playerRows(t)
    expect(rows.filter((row) => row.nameKey === 'sam vimes')).toHaveLength(1)
  })

  test('a genuinely different name adds a seat without touching the first seat', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)

    const ada = await join(t, game.code, 'Ada')
    expect(ada.rejoined).toBe(false)
    expect(ada.playerId).not.toBe(sam.playerId)

    const roster = await t.query(api.players.list, { code: game.code })
    const samSeat = roster.find((seat) => seat._id === sam.playerId)
    expect(samSeat?.characterId).toBe(grog)
    expect(samSeat?.characterName).toBe('Grog')
  })

  test('rejoining adopts the newly typed casing without creating a second row', async () => {
    const t = harness()
    const game = await createGame(t)
    const first = await join(t, game.code, 'sam')

    const second = await join(t, game.code, 'SaM ViMeS'.slice(0, 3))
    expect(second.playerId).toBe(first.playerId)
    expect(second.displayName).toBe('SaM')

    const row = await playerRow(t, first.playerId)
    expect(row?.displayName).toBe('SaM')
    expect(row?.nameKey).toBe('sam')

    const rows = await playerRows(t)
    expect(rows).toHaveLength(2) // the DM's seat plus this one
  })

  test('a blank display name is refused', async () => {
    const t = harness()
    const game = await createGame(t)
    await expectRejection(join(t, game.code, ''), 'BadInput')
    expect(await playerRows(t)).toHaveLength(1)
  })

  test('a whitespace-only display name is refused', async () => {
    const t = harness()
    const game = await createGame(t)

    for (const blank of [' ', '   ', '\t', '\n', ' \t\n ', ' ']) {
      await expectRejection(join(t, game.code, blank), 'BadInput')
    }
    expect(await playerRows(t)).toHaveLength(1)
  })

  test('an emoji-only name is a legitimate seat, not an empty one', async () => {
    const t = harness()
    const game = await createGame(t)

    const dragon = await join(t, game.code, '  \u{1F409}  ')
    expect(dragon.displayName).toBe('\u{1F409}')
    expect(dragon.rejoined).toBe(false)
    expect((await join(t, game.code, '\u{1F409}')).playerId).toBe(dragon.playerId)
  })

  test('joining an unknown game code throws GameNotFound', async () => {
    const t = harness()
    await createGame(t)
    await expectRejection(join(t, 'ZZZZZZ', 'Sam'), 'GameNotFound')
  })

  test('a join code typed in lower case with punctuation still finds the game', async () => {
    const t = harness()
    const game = await createGame(t)
    const messy = `${game.code.toLowerCase().slice(0, 3)}-${game.code.toLowerCase().slice(3)} `

    const seat = await join(t, messy, 'Sam')
    expect(seat.rejoined).toBe(false)
    expect((await t.query(api.players.list, { code: game.code })).map((s) => s.displayName)).toEqual(
      ['Mike', 'Sam'],
    )
  })

  test('typing the DM’s name takes the DM’s seat — the badge is display only', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')

    const impostor = await join(t, game.code, 'MIKE')
    expect(impostor.rejoined).toBe(true)

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ displayName: 'MIKE', isDm: true })
  })
})

describe('ADR 0002 — characters outlive every seat', () => {
  test('clearing every seat leaves the characters intact and claimable again', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')

    const mike = await join(t, game.code, 'Mike')
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    const nessa = await addCharacter(t, game, 'Nessa')
    await claim(t, game.code, mike.playerId, grog)
    await claim(t, game.code, sam.playerId, nessa)

    // The play session ends and both browsers lose their storage. Nothing
    // identifies these players any more, so every seat goes.
    for (const seat of await t.query(api.players.list, { code: game.code })) {
      await t.mutation(api.players.leave, { code: game.code, playerId: seat._id })
    }
    expect(await t.query(api.players.list, { code: game.code })).toEqual([])
    expect(await playerRows(t)).toHaveLength(0)

    const characters = await t.query(api.characters.list, { code: game.code })
    expect(characters.map((character) => character.name)).toEqual(['Grog', 'Nessa'])
    expect(characters.every((character) => character.claimedByPlayerId === null)).toBe(true)
    expect(characters.every((character) => character.claimedByName === null)).toBe(true)

    // Months later, the same two people retype the same names.
    const mikeAgain = await join(t, game.code, 'mike')
    const samAgain = await join(t, game.code, 'sam')
    expect(mikeAgain.rejoined).toBe(false)
    await claim(t, game.code, mikeAgain.playerId, grog)
    await claim(t, game.code, samAgain.playerId, nessa)

    const reclaimed = await t.query(api.characters.list, { code: game.code })
    expect(reclaimed.map((character) => character.claimedByName)).toEqual(['mike', 'sam'])
  })

  test('a seat that leaves releases its character for anyone else to claim', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)

    const ada = await join(t, game.code, 'Ada')
    await expectRejection(
      t.mutation(api.characters.claim, {
        code: game.code,
        playerId: ada.playerId,
        characterId: grog,
      }),
      'CharacterTaken',
    )

    await t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId })
    await claim(t, game.code, ada.playerId, grog)

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.find((seat) => seat._id === ada.playerId)?.characterName).toBe('Grog')
  })
})

describe('players.list', () => {
  test('returns an empty array for an unknown code rather than throwing', async () => {
    const t = harness()
    await createGame(t)
    expect(await t.query(api.players.list, { code: 'ZZZZZZ' })).toEqual([])
    expect(await t.query(api.players.list, { code: '' })).toEqual([])
  })

  test('is ordered by join time, oldest seat first', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')
    for (const name of ['Sam', 'Ada', 'Bea', 'Cy']) {
      await join(t, game.code, name)
    }
    // Rejoining must not reshuffle the roster: the seat is not recreated.
    await join(t, game.code, 'Sam')

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.map((seat) => seat.displayName)).toEqual(['Mike', 'Sam', 'Ada', 'Bea', 'Cy'])
    const times = roster.map((seat) => seat.joinedAt)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  test('resolves characterName for a claimed seat and null for an unclaimed one', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    await join(t, game.code, 'Ada')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)

    const roster = await t.query(api.players.list, { code: game.code })
    const claimed = roster.find((seat) => seat._id === sam.playerId)
    const unclaimed = roster.find((seat) => seat.displayName === 'Ada')

    expect(claimed).toMatchObject({ characterId: grog, characterName: 'Grog' })
    expect(unclaimed).toMatchObject({ characterId: null, characterName: null })
  })

  test('an unclaimed seat reports characterId as null, not as a missing field', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')

    const stored = await playerRow(t, sam.playerId)
    expect('characterId' in (stored ?? {})).toBe(false)

    const seat = (await t.query(api.players.list, { code: game.code })).find(
      (row) => row._id === sam.playerId,
    )
    expect(seat).toHaveProperty('characterId', null)
    expect(seat).toHaveProperty('characterName', null)
  })

  test('the creator of the game appears with the DM badge', async () => {
    const t = harness()
    const game = await createGame(t, '  dana   scully ')
    await join(t, game.code, 'Sam')

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.filter((seat) => seat.isDm)).toHaveLength(1)
    expect(roster[0]).toMatchObject({ displayName: 'dana scully', isDm: true })
    expect(roster.find((seat) => seat.displayName === 'Sam')?.isDm).toBe(false)
  })

  test('deleting a claimed character leaves no dangling pointer or stale name', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)

    await t.mutation(api.characters.remove, {
      code: game.code,
      dmCode: game.dmCode,
      characterId: grog,
    })

    const seat = (await t.query(api.players.list, { code: game.code })).find(
      (row) => row._id === sam.playerId,
    )
    expect(seat).toMatchObject({ displayName: 'Sam', characterId: null, characterName: null })

    const stored = await playerRow(t, sam.playerId)
    expect(stored?.characterId).toBeUndefined()
  })
})

describe('players.rename', () => {
  test('renames in place, keeping the same seat and its character', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)

    const renamed = await t.mutation(api.players.rename, {
      code: game.code,
      playerId: sam.playerId,
      displayName: '  Samwise   Gamgee  ',
    })
    expect(renamed.displayName).toBe('Samwise Gamgee')

    const seats = await t.query(api.players.list, { code: game.code })
    expect(seats.filter((seat) => !seat.isDm)).toHaveLength(1)
    expect(seats.find((seat) => seat._id === sam.playerId)).toMatchObject({
      displayName: 'Samwise Gamgee',
      characterId: grog,
      characterName: 'Grog',
    })
  })

  test('the seat is found by the new name and rejoining is idempotent again', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    await t.mutation(api.players.rename, {
      code: game.code,
      playerId: sam.playerId,
      displayName: 'Samwise',
    })

    const rejoined = await join(t, game.code, 'samwise')
    expect(rejoined.rejoined).toBe(true)
    expect(rejoined.playerId).toBe(sam.playerId)
  })

  test('the old name is orphaned — joining under it opens a second seat', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const grog = await addCharacter(t, game, 'Grog')
    await claim(t, game.code, sam.playerId, grog)
    await t.mutation(api.players.rename, {
      code: game.code,
      playerId: sam.playerId,
      displayName: 'Samwise',
    })

    const stale = await join(t, game.code, 'Sam')
    expect(stale.rejoined).toBe(false)
    expect(stale.playerId).not.toBe(sam.playerId)

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.map((seat) => seat.displayName)).toEqual(['Mike', 'Samwise', 'Sam'])
    expect(roster.find((seat) => seat._id === stale.playerId)?.characterId).toBeNull()
    expect(roster.find((seat) => seat._id === sam.playerId)?.characterId).toBe(grog)
  })

  test('renaming onto a name another seat already holds throws NameTaken', async () => {
    const t = harness()
    const game = await createGame(t)
    await join(t, game.code, 'Sam')
    const ada = await join(t, game.code, 'Ada')

    await expectRejection(
      t.mutation(api.players.rename, {
        code: game.code,
        playerId: ada.playerId,
        displayName: '  sAm ',
      }),
      'NameTaken',
    )
    const row = await playerRow(t, ada.playerId)
    expect(row?.displayName).toBe('Ada')
  })

  test('renaming onto the DM’s name throws rather than merging the seats', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')
    const sam = await join(t, game.code, 'Sam')

    await expectRejection(
      t.mutation(api.players.rename, {
        code: game.code,
        playerId: sam.playerId,
        displayName: 'mike',
      }),
      'NameTaken',
    )
  })

  test('renaming to a case or whitespace variant of your own name succeeds', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam Vimes')

    for (const variant of ['SAM VIMES', '  sam   vimes  ', 'Sam Vimes']) {
      const result = await t.mutation(api.players.rename, {
        code: game.code,
        playerId: sam.playerId,
        displayName: variant,
      })
      expect(result.displayName).toBe(variant.trim().replace(/\s+/g, ' '))
    }

    const rows = await playerRows(t)
    expect(rows).toHaveLength(2)
  })

  // Under the old truncating normaliser this collapsed onto the seat already
  // called `long` and threw NameTaken. The over-length name is now refused
  // outright, so the collision can never be constructed in the first place.
  test('renaming to a name that only collides after truncation throws BadInput', async () => {
    const t = harness()
    const game = await createGame(t)
    const long = 'Q'.repeat(MAX_DISPLAY_NAME_LENGTH)
    const owner = await join(t, game.code, long)
    const ada = await join(t, game.code, 'Ada')

    await expectRejection(
      t.mutation(api.players.rename, {
        code: game.code,
        playerId: ada.playerId,
        displayName: `${long} the Bold`,
      }),
      'BadInput',
    )
    expect((await playerRow(t, ada.playerId))?.displayName).toBe('Ada')
    expect((await playerRow(t, owner.playerId))?.displayName).toBe(long)
  })

  test('renaming to exactly the limit succeeds and one character over throws', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const atLimit = 'S'.repeat(MAX_DISPLAY_NAME_LENGTH)

    const renamed = await t.mutation(api.players.rename, {
      code: game.code,
      playerId: sam.playerId,
      displayName: `  ${atLimit}  `,
    })
    expect(renamed.displayName).toBe(atLimit)

    await expectRejection(
      t.mutation(api.players.rename, {
        code: game.code,
        playerId: sam.playerId,
        displayName: 'S'.repeat(MAX_DISPLAY_NAME_LENGTH + 1),
      }),
      'BadInput',
    )
    expect((await playerRow(t, sam.playerId))?.displayName).toBe(atLimit)
  })

  test('a playerId from a different game throws PlayerNotFound', async () => {
    const t = harness()
    const one = await createGame(t, 'Mike')
    const two = await createGame(t, 'Dana')
    const sam = await join(t, one.code, 'Sam')

    await expectRejection(
      t.mutation(api.players.rename, {
        code: two.code,
        playerId: sam.playerId,
        displayName: 'Interloper',
      }),
      'PlayerNotFound',
    )
    expect((await playerRow(t, sam.playerId))?.displayName).toBe('Sam')
    expect(await seatNames(t, two.code)).toEqual([{ displayName: 'Dana', isDm: true }])
  })

  test('a seat that has already left cannot be renamed', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    await t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId })

    await expectRejection(
      t.mutation(api.players.rename, {
        code: game.code,
        playerId: sam.playerId,
        displayName: 'Samwise',
      }),
      'PlayerNotFound',
    )
  })

  test('a blank or whitespace-only new name throws BadInput', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')

    for (const blank of ['', '   ', '\t\n']) {
      await expectRejection(
        t.mutation(api.players.rename, {
          code: game.code,
          playerId: sam.playerId,
          displayName: blank,
        }),
        'BadInput',
      )
    }
    expect((await playerRow(t, sam.playerId))?.displayName).toBe('Sam')
  })

  test('an unknown game code throws GameNotFound before anything is written', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')

    await expectRejection(
      t.mutation(api.players.rename, {
        code: 'ZZZZZZ',
        playerId: sam.playerId,
        displayName: 'Samwise',
      }),
      'GameNotFound',
    )
    expect((await playerRow(t, sam.playerId))?.displayName).toBe('Sam')
  })
})

describe('players.leave', () => {
  test('removes only the named seat', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')
    const sam = await join(t, game.code, 'Sam')
    const ada = await join(t, game.code, 'Ada')

    await t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId })

    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster.map((seat) => seat.displayName)).toEqual(['Mike', 'Ada'])
    expect(await playerRow(t, sam.playerId)).toBeNull()
    expect(await playerRow(t, ada.playerId)).not.toBeNull()
  })

  test('leaves every character in the game untouched', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')
    const ada = await join(t, game.code, 'Ada')
    const grog = await addCharacter(t, game, 'Grog')
    const nessa = await addCharacter(t, game, 'Nessa')
    await claim(t, game.code, sam.playerId, grog)
    await claim(t, game.code, ada.playerId, nessa)

    await t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId })

    const characters = await t.query(api.characters.list, { code: game.code })
    expect(characters.map((character) => [character.name, character.claimedByName])).toEqual([
      ['Grog', null],
      ['Nessa', 'Ada'],
    ])
  })

  test('a playerId from another game throws instead of deleting across games', async () => {
    const t = harness()
    const one = await createGame(t, 'Mike')
    const two = await createGame(t, 'Dana')
    const sam = await join(t, one.code, 'Sam')

    await expectRejection(
      t.mutation(api.players.leave, { code: two.code, playerId: sam.playerId }),
      'PlayerNotFound',
    )
    expect(await playerRow(t, sam.playerId)).not.toBeNull()
  })

  test('leaving twice throws the second time rather than silently succeeding', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')

    await t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId })
    await expectRejection(
      t.mutation(api.players.leave, { code: game.code, playerId: sam.playerId }),
      'PlayerNotFound',
    )
  })

  test('an unknown game code throws GameNotFound and deletes nothing', async () => {
    const t = harness()
    const game = await createGame(t)
    const sam = await join(t, game.code, 'Sam')

    await expectRejection(
      t.mutation(api.players.leave, { code: 'ZZZZZZ', playerId: sam.playerId }),
      'GameNotFound',
    )
    expect(await playerRow(t, sam.playerId)).not.toBeNull()
  })

  test('the DM can vacate their own seat and retake it by retyping the name', async () => {
    const t = harness()
    const game = await createGame(t, 'Mike')
    const mike = await join(t, game.code, 'Mike')

    await t.mutation(api.players.leave, { code: game.code, playerId: mike.playerId })
    expect(await seatNames(t, game.code)).toEqual([])

    // The badge is not restored by joining: only the DM code moves it back.
    const back = await join(t, game.code, 'Mike')
    expect(back.rejoined).toBe(false)
    expect(await seatNames(t, game.code)).toEqual([{ displayName: 'Mike', isDm: false }])

    await t.mutation(api.games.elevateDm, {
      code: game.code,
      dmCode: game.dmCode,
      playerId: back.playerId,
    })
    expect(await seatNames(t, game.code)).toEqual([{ displayName: 'Mike', isDm: true }])
  })
})

describe('cross-game isolation', () => {
  test('the same display name in two games is two independent seats', async () => {
    const t = harness()
    const one = await createGame(t, 'Mike')
    const two = await createGame(t, 'Mike')

    const seatOne = await join(t, one.code, 'Sam')
    const seatTwo = await join(t, two.code, 'Sam')
    expect(seatTwo.rejoined).toBe(false)
    expect(seatTwo.playerId).not.toBe(seatOne.playerId)

    const grogOne = await addCharacter(t, one, 'Grog')
    const grogTwo = await addCharacter(t, two, 'Grog')
    await claim(t, one.code, seatOne.playerId, grogOne)

    expect(
      (await t.query(api.players.list, { code: one.code })).find(
        (seat) => seat._id === seatOne.playerId,
      )?.characterName,
    ).toBe('Grog')
    expect(
      (await t.query(api.players.list, { code: two.code })).find(
        (seat) => seat._id === seatTwo.playerId,
      )?.characterId,
    ).toBeNull()

    // A character from the other game is not claimable, even by the same name.
    await expectRejection(
      t.mutation(api.characters.claim, {
        code: one.code,
        playerId: seatOne.playerId,
        characterId: grogTwo,
      }),
      'CharacterNotFound',
    )
  })

  test('leaving a seat in one game does not touch the same name in another', async () => {
    const t = harness()
    const one = await createGame(t, 'Mike')
    const two = await createGame(t, 'Dana')
    const seatOne = await join(t, one.code, 'Sam')
    const seatTwo = await join(t, two.code, 'Sam')

    await t.mutation(api.players.leave, { code: one.code, playerId: seatOne.playerId })

    expect(await seatNames(t, one.code)).toEqual([{ displayName: 'Mike', isDm: true }])
    expect((await playerRow(t, seatTwo.playerId))?.displayName).toBe('Sam')
  })
})

/**
 * Over-length display names are rejected, never truncated. Truncation made
 * `nameKey` — the whole of player identity here — collide between people, and
 * `slice` over UTF-16 code units could also store invalid Unicode or a name with
 * a trailing space. See lib/names.ts.
 */
describe('players.join rejects over-length display names', () => {
  test('accepts a display name of exactly the limit', async () => {
    const t = harness()
    const game = await createGame(t)
    const atLimit = 'A'.repeat(MAX_DISPLAY_NAME_LENGTH)

    // The limit is applied after trimming, so the padding must not count.
    const seat = await join(t, game.code, `  ${atLimit}  `)
    expect(seat.displayName).toBe(atLimit)
    expect((await playerRow(t, seat.playerId))?.nameKey).toBe(atLimit.toLowerCase())
  })

  test('a display name one character over the limit throws BadInput', async () => {
    const t = harness()
    const game = await createGame(t)

    await expectRejection(join(t, game.code, 'A'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)), 'BadInput')
    expect(await playerRows(t)).toHaveLength(1)
  })

  // The defect this replaced: two players whose names differ only past the
  // cut-off landed on ONE seat, and the second silently inherited the first's
  // character with `rejoined: true` looking like an ordinary cleared-cache
  // rejoin. Rejecting both makes that collision unconstructable.
  test('two names differing only past the limit are both rejected, never merged', async () => {
    const t = harness()
    const game = await createGame(t)
    const prefix = 'A'.repeat(MAX_DISPLAY_NAME_LENGTH)

    await expectRejection(join(t, game.code, `${prefix}lastname`), 'BadInput')
    await expectRejection(join(t, game.code, `${prefix}different`), 'BadInput')

    // Only the DM's seat exists, so there is no seat for anyone to inherit.
    expect(await playerRows(t)).toHaveLength(1)
    expect(await t.query(api.players.list, { code: game.code })).toHaveLength(1)
  })

  test('rejects a name whose limit falls inside a surrogate pair', async () => {
    const t = harness()
    const game = await createGame(t)
    // 39 BMP characters plus one astral character is 41 UTF-16 code units, so
    // slice(0, 40) cut the emoji in half and stored a lone high surrogate —
    // invalid UTF-16 that convex-test accepts but a real deployment rejects.
    const typed = `${'a'.repeat(MAX_DISPLAY_NAME_LENGTH - 1)}\u{1F600}`
    expect(typed).toHaveLength(MAX_DISPLAY_NAME_LENGTH + 1)

    await expectRejection(join(t, game.code, typed), 'BadInput')

    const rows = await playerRows(t)
    expect(rows).toHaveLength(1)
    expect(rows.some((row) => hasLoneSurrogate(row.displayName))).toBe(false)
    expect(rows.some((row) => hasLoneSurrogate(row.nameKey))).toBe(false)
  })

  test('a name ending in an emoji at exactly the limit is stored intact', async () => {
    const t = harness()
    const game = await createGame(t)
    const typed = `${'a'.repeat(MAX_DISPLAY_NAME_LENGTH - 2)}\u{1F600}`
    expect(typed).toHaveLength(MAX_DISPLAY_NAME_LENGTH)

    const seat = await join(t, game.code, typed)
    expect(seat.displayName).toBe(typed)
    expect(hasLoneSurrogate(seat.displayName)).toBe(false)

    const row = await playerRow(t, seat.playerId)
    expect(row?.displayName).toBe(typed)
    expect(hasLoneSurrogate(row?.nameKey ?? '')).toBe(false)
  })

  test('rejects an over-long name rather than storing a trailing space', async () => {
    const t = harness()
    const game = await createGame(t)
    // Trimming and then slicing left the space before "Vimes" as the last
    // character of the stored name, breaking the normalisation contract.
    const typed = `${'b'.repeat(MAX_DISPLAY_NAME_LENGTH - 1)} Vimes`

    await expectRejection(join(t, game.code, typed), 'BadInput')

    const rows = await playerRows(t)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.displayName === row.displayName.trim())).toBe(true)
    expect(rows.every((row) => row.nameKey === row.nameKey.trim())).toBe(true)
  })
})

describe('players.join enforces the seat cap the roster is read with', () => {
  test('the seat past the cap is refused and every seat that joined is visible', async () => {
    const t = harness()
    const game = await createGame(t)
    // Deliberately fills the game to exactly MAX_SEATS_PER_GAME — the creator's
    // seat plus one short of the cap — so the next join is the one it refuses.
    const joined: Id<'players'>[] = []
    for (let i = 0; i < MAX_SEATS_PER_GAME - 1; i += 1) {
      joined.push((await join(t, game.code, `Player ${i}`)).playerId)
    }
    expect(await playerRows(t)).toHaveLength(MAX_SEATS_PER_GAME)

    await expectRejection(join(t, game.code, 'Last Arrival'), 'GameFull')
    expect(await playerRows(t)).toHaveLength(MAX_SEATS_PER_GAME)

    // Nothing that joined fell outside the read window; the roster shows it all.
    const roster = await t.query(api.players.list, { code: game.code })
    expect(roster).toHaveLength(MAX_SEATS_PER_GAME)
    const visible = new Set(roster.map((seat) => seat._id))
    expect(joined.every((playerId) => visible.has(playerId))).toBe(true)

    // A rejoin is not a new seat, so the cap must not lock existing players out.
    const rejoined = await join(t, game.code, 'Player 0')
    expect(rejoined.rejoined).toBe(true)
    expect(rejoined.playerId).toBe(joined[0])
  })

  test('a seat freed by leaving makes room for a new arrival again', async () => {
    const t = harness()
    const game = await createGame(t)
    // Deliberately at the cap again — this time to check it is not a high-water
    // mark: the count is of live seats, so leaving genuinely frees one.
    const first: Id<'players'>[] = []
    for (let i = 0; i < MAX_SEATS_PER_GAME - 1; i += 1) {
      first.push((await join(t, game.code, `Player ${i}`)).playerId)
    }
    await expectRejection(join(t, game.code, 'Newcomer'), 'GameFull')

    await t.mutation(api.players.leave, { code: game.code, playerId: first[0] })
    const newcomer = await join(t, game.code, 'Newcomer')
    expect(newcomer.rejoined).toBe(false)
    expect(await playerRows(t)).toHaveLength(MAX_SEATS_PER_GAME)
  })
})
