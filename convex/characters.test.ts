/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import { MAX_CHARACTERS_PER_GAME } from './lib/games'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

type Harness = ReturnType<typeof convexTest>

type ErrorKind =
  | 'BadInput'
  | 'CharacterNotFound'
  | 'CharacterTaken'
  | 'GameFull'
  | 'GameNotFound'
  | 'NotDm'
  | 'PlayerNotFound'

/**
 * The module throws `ConvexError({ kind, message })`. convex-test surfaces that
 * payload on `.data`, so the discriminant is assertable directly instead of
 * being string-matched out of the message.
 */
async function expectKind(op: Promise<unknown>, kind: ErrorKind) {
  await expect(op).rejects.toThrow()
  await expect(op).rejects.toMatchObject({ data: { kind } })
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

async function makeSeat(t: Harness, code: string, displayName: string) {
  const { playerId } = await t.mutation(api.players.join, { code, displayName })
  return playerId
}

async function makeCharacter(t: Harness, code: string, name: string) {
  const { characterId } = await t.mutation(api.characters.create, { code, name })
  return characterId
}

/** The claim pointer as stored, not as reported by a query. */
async function heldBy(t: Harness, playerId: Id<'players'>) {
  const seat = await t.run(async (ctx) => await ctx.db.get('players', playerId))
  return seat?.characterId ?? null
}

function rawCharacter(t: Harness, characterId: Id<'characters'>) {
  return t.run(async (ctx) => await ctx.db.get('characters', characterId))
}

type CharacterRow = FunctionReturnType<typeof api.characters.list>[number]

function rowFor(list: CharacterRow[], characterId: Id<'characters'>): CharacterRow {
  const row = list.find((entry) => entry._id === characterId)
  if (!row) throw new Error(`character ${characterId} missing from list`)
  return row
}

describe('characters.create', () => {
  test('any player in the game may add a character and it lands unclaimed', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    await makeSeat(t, code, 'Ana')

    const characterId = await makeCharacter(t, code, 'Thorin')

    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      _id: characterId,
      name: 'Thorin',
      claimedByPlayerId: null,
      claimedByName: null,
    })
  })

  test('a character is not attached to whoever created it', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    await makeCharacter(t, code, 'Thorin')

    expect(await heldBy(t, ana)).toBeNull()
  })

  test('blank and whitespace-only names are rejected', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectKind(t.mutation(api.characters.create, { code, name: '' }), 'BadInput')
    await expectKind(t.mutation(api.characters.create, { code, name: '   ' }), 'BadInput')
    await expectKind(t.mutation(api.characters.create, { code, name: '\t\n ' }), 'BadInput')

    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  test('surrounding whitespace is stripped from the stored name', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makeCharacter(t, code, '   Thorin Oakenshield  ')

    expect((await rawCharacter(t, characterId))?.name).toBe('Thorin Oakenshield')
  })

  test('a name of exactly the maximum length is accepted', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const atLimit = 'x'.repeat(MAX_CHARACTER_NAME_LENGTH)
    // The limit is applied after trimming, so the padding must not count.
    const characterId = await makeCharacter(t, code, `  ${atLimit}  `)

    expect((await rawCharacter(t, characterId))?.name).toBe(atLimit)
  })

  test('an over-long name is rejected rather than truncated', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    for (const length of [MAX_CHARACTER_NAME_LENGTH + 1, MAX_CHARACTER_NAME_LENGTH + 50]) {
      await expectKind(
        t.mutation(api.characters.create, { code, name: 'x'.repeat(length) }),
        'BadInput',
      )
    }
    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  test('two characters may share a name without breaking list or claiming', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const first = await makeCharacter(t, code, 'Thorin')
    const second = await makeCharacter(t, code, 'Thorin')

    expect(first).not.toBe(second)

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: first })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: second })

    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(2)
    expect(rowFor(list, first).claimedByName).toBe('Ana')
    expect(rowFor(list, second).claimedByName).toBe('Ben')
  })

  test('an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    await makeGame(t)

    await expectKind(
      t.mutation(api.characters.create, { code: 'ZZZZZZ', name: 'Thorin' }),
      'GameNotFound',
    )
  })

  test('an empty game code is rejected rather than matching a game', async () => {
    const t = convexTest(schema, modules)
    await makeGame(t)

    await expectKind(
      t.mutation(api.characters.create, { code: '', name: 'Thorin' }),
      'GameNotFound',
    )
  })

  /**
   * Truncation was `slice` over UTF-16 code units, so a name whose 40th and 41st
   * units were a surrogate pair got cut in half and a lone high surrogate was
   * stored. Convex strings must be valid Unicode; convex-test does not enforce
   * that, so it passed locally and was a hazard against a real deployment.
   */
  test('rejects a name whose limit falls inside a surrogate pair', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const typed = `${'a'.repeat(MAX_CHARACTER_NAME_LENGTH - 1)}\u{1F44D}`
    expect(typed).toHaveLength(MAX_CHARACTER_NAME_LENGTH + 1)

    await expectKind(t.mutation(api.characters.create, { code, name: typed }), 'BadInput')
    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  test('a name ending in an emoji at exactly the limit is stored whole', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const typed = `${'a'.repeat(MAX_CHARACTER_NAME_LENGTH - 2)}\u{1F44D}`
    expect(typed).toHaveLength(MAX_CHARACTER_NAME_LENGTH)

    const characterId = await makeCharacter(t, code, typed)
    const stored = (await rawCharacter(t, characterId))?.name ?? ''
    expect(stored).toBe(typed)
    const unpaired = stored.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    expect(/[\uD800-\uDFFF]/.test(unpaired)).toBe(false)
  })

  /**
   * `create` now caps at MAX_CHARACTERS_PER_GAME, matching the bound
   * `listCharacters` reads with. Previously character 201 was invisible in
   * `characters.list` while `claim` still accepted it, because `claim` resolves
   * it with a direct `db.get`.
   */
  test('the write cap matches the read bound, so everything created is visible', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    // Deliberately fills the game to the cap — that is what the test is about.
    const created: Id<'characters'>[] = []
    for (let i = 0; i < MAX_CHARACTERS_PER_GAME; i += 1) {
      created.push(await makeCharacter(t, code, `Recruit ${i}`))
    }

    await expectKind(t.mutation(api.characters.create, { code, name: 'One Too Many' }), 'GameFull')

    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(MAX_CHARACTERS_PER_GAME)
    const visible = new Set(list.map((entry) => entry._id))
    expect(created.every((characterId) => visible.has(characterId))).toBe(true)
  })

  /**
   * The same overflow seen from the roster: the seat used to report a claim whose
   * name could not be resolved, so the lobby showed a character with no name.
   */
  test('a claimed character resolves a name in the roster even at the cap', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    // Deliberately at the cap: the last row created is the one that used to fall
    // outside the read window.
    let last: Id<'characters'> | null = null
    for (let i = 0; i < MAX_CHARACTERS_PER_GAME; i += 1) {
      last = await makeCharacter(t, code, `Recruit ${i}`)
    }
    const ana = await makeSeat(t, code, 'Ana')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: last! })

    const seats = await t.query(api.players.list, { code })
    expect(seats.find((entry) => entry._id === ana)).toMatchObject({
      characterId: last,
      characterName: `Recruit ${MAX_CHARACTERS_PER_GAME - 1}`,
    })
  })

  test('removing a character makes room under the cap again', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    // Deliberately at the cap, to check it counts live rows rather than acting as
    // a high-water mark.
    let first: Id<'characters'> | null = null
    for (let i = 0; i < MAX_CHARACTERS_PER_GAME; i += 1) {
      const characterId = await makeCharacter(t, code, `Recruit ${i}`)
      first ??= characterId
    }
    await expectKind(t.mutation(api.characters.create, { code, name: 'Latecomer' }), 'GameFull')

    await t.mutation(api.characters.remove, { code, dmCode, characterId: first! })
    const latecomer = await makeCharacter(t, code, 'Latecomer')

    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(MAX_CHARACTERS_PER_GAME)
    expect(list.some((entry) => entry._id === latecomer)).toBe(true)
  })
})

describe('characters.rename', () => {
  test('renames in place without disturbing the claim', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const characterId = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId })

    await t.mutation(api.characters.rename, { code, characterId, name: '  Balin  ' })

    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Balin', claimedByPlayerId: ana, claimedByName: 'Ana' })
  })

  test('a blank rename is rejected and the old name survives', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.rename, { code, characterId, name: '   ' }),
      'BadInput',
    )
    expect((await rawCharacter(t, characterId))?.name).toBe('Thorin')
  })

  test('a rename to exactly the maximum length is accepted', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Thorin')
    const atLimit = 'y'.repeat(MAX_CHARACTER_NAME_LENGTH)

    await t.mutation(api.characters.rename, { code, characterId, name: `  ${atLimit}  ` })
    expect((await rawCharacter(t, characterId))?.name).toBe(atLimit)
  })

  test('an over-long rename is rejected and the old name survives', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Thorin')

    for (const length of [MAX_CHARACTER_NAME_LENGTH + 1, MAX_CHARACTER_NAME_LENGTH + 10]) {
      await expectKind(
        t.mutation(api.characters.rename, { code, characterId, name: 'y'.repeat(length) }),
        'BadInput',
      )
    }
    expect((await rawCharacter(t, characterId))?.name).toBe('Thorin')
  })

  test('a character in another game cannot be renamed across the boundary', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.rename, { code: alpha.code, characterId: theirs, name: 'Stolen' }),
      'CharacterNotFound',
    )
    expect((await rawCharacter(t, theirs))?.name).toBe('Thorin')
  })

  test('renaming against an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.rename, { code: 'ZZZZZZ', characterId, name: 'Balin' }),
      'GameNotFound',
    )
    expect((await rawCharacter(t, characterId))?.name).toBe('Thorin')
  })

  test('renaming a removed character is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.remove, { code, dmCode, characterId })

    await expectKind(
      t.mutation(api.characters.rename, { code, characterId, name: 'Balin' }),
      'CharacterNotFound',
    )
  })
})

describe('characters.list', () => {
  test('an unknown code yields an empty array rather than an error or null', async () => {
    const t = convexTest(schema, modules)
    await makeGame(t)

    const list = await t.query(api.characters.list, { code: 'ZZZZZZ' })
    expect(list).toEqual([])
  })

  test('characters come back in creation order', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const names = ['Thorin', 'Balin', 'Dwalin', 'Fili', 'Kili']
    for (const name of names) await makeCharacter(t, code, name)

    const list = await t.query(api.characters.list, { code })
    expect(list.map((entry) => entry.name)).toEqual(names)
    const times = list.map((entry) => entry.createdAt)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  test('an unclaimed character reports null holder fields rather than omitting them', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    await makeCharacter(t, code, 'Thorin')

    const [row] = await t.query(api.characters.list, { code })
    expect(row).toHaveProperty('claimedByPlayerId', null)
    expect(row).toHaveProperty('claimedByName', null)
  })

  test('every character reports its own holder under interleaved claims', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const cas = await makeSeat(t, code, 'Cas')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    const dwalin = await makeCharacter(t, code, 'Dwalin')

    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: balin })
    await t.mutation(api.characters.claim, { code, playerId: cas, characterId: dwalin })
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, thorin)).toMatchObject({ claimedByPlayerId: ana, claimedByName: 'Ana' })
    expect(rowFor(list, balin)).toMatchObject({ claimedByPlayerId: ben, claimedByName: 'Ben' })
    expect(rowFor(list, dwalin)).toMatchObject({ claimedByPlayerId: cas, claimedByName: 'Cas' })
  })

  /**
   * The holder lookup is built from the seats already read. A seat holding
   * nothing must not become the fallback holder for a character nobody claimed.
   */
  test('seats without a claim do not poison the holder lookup', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    await makeSeat(t, code, 'Idle One')
    await makeSeat(t, code, 'Idle Two')
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const spare = await makeCharacter(t, code, 'Spare')

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, thorin).claimedByPlayerId).toBe(ana)
    expect(rowFor(list, spare)).toMatchObject({ claimedByPlayerId: null, claimedByName: null })
  })

  test('a released character reverts to reporting no holder', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    const ben = await makeSeat(t, code, 'Ben')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: balin })

    await t.mutation(api.characters.release, { code, playerId: ana })

    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, thorin)).toMatchObject({ claimedByPlayerId: null, claimedByName: null })
    expect(rowFor(list, balin).claimedByPlayerId).toBe(ben)
  })

  test('the holder name follows a seat rename', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.players.rename, { code, playerId: ana, displayName: 'Anastasia' })

    const [row] = await t.query(api.characters.list, { code })
    expect(row.claimedByName).toBe('Anastasia')
  })
})

describe('characters.claim', () => {
  test('a claim is visible from both the character list and the roster', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    expect(await heldBy(t, ana)).toBe(thorin)
    const [character] = await t.query(api.characters.list, { code })
    expect(character).toMatchObject({ claimedByPlayerId: ana, claimedByName: 'Ana' })
    const seats = await t.query(api.players.list, { code })
    expect(seats.find((seat) => seat._id === ana)).toMatchObject({
      characterId: thorin,
      characterName: 'Thorin',
    })
  })

  test('a second seat cannot take a held character and the holder is unchanged', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await expectKind(
      t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin }),
      'CharacterTaken',
    )

    expect(await heldBy(t, ana)).toBe(thorin)
    expect(await heldBy(t, ben)).toBeNull()
  })

  test('the holding seat may re-claim what it already holds', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    expect(await heldBy(t, ana)).toBe(thorin)
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).claimedByPlayerId).toBe(ana)
  })

  test('claiming a second character frees the first and leaves the seat holding one', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: balin })

    expect(await heldBy(t, ana)).toBe(balin)
    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, thorin)).toMatchObject({ claimedByPlayerId: null, claimedByName: null })
    expect(rowFor(list, balin).claimedByPlayerId).toBe(ana)

    // The freed character is genuinely available, not merely reported as free.
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin })
    expect(await heldBy(t, ben)).toBe(thorin)
  })

  test('a seat from another game cannot claim and nothing moves', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const intruder = await makeSeat(t, beta.code, 'Ben')
    const thorin = await makeCharacter(t, alpha.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.claim, {
        code: alpha.code,
        playerId: intruder,
        characterId: thorin,
      }),
      'PlayerNotFound',
    )

    expect(await heldBy(t, intruder)).toBeNull()
    expect(rowFor(await t.query(api.characters.list, { code: alpha.code }), thorin)).toMatchObject({
      claimedByPlayerId: null,
    })
  })

  test('a character from another game cannot be claimed and nothing moves', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ana = await makeSeat(t, alpha.code, 'Ana')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.claim, { code: alpha.code, playerId: ana, characterId: theirs }),
      'CharacterNotFound',
    )

    expect(await heldBy(t, ana)).toBeNull()
  })

  test('naming a third game does not let a matched seat and character be joined', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ana = await makeSeat(t, alpha.code, 'Ana')
    const thorin = await makeCharacter(t, alpha.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.claim, { code: beta.code, playerId: ana, characterId: thorin }),
      'PlayerNotFound',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('claiming against an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.claim, { code: 'ZZZZZZ', playerId: ana, characterId: thorin }),
      'GameNotFound',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('claiming a removed character is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    await expectKind(
      t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin }),
      'CharacterNotFound',
    )
  })

  /** Characters outlive seats — the pointer only ever runs seat → character. */
  test('a character held by a departed seat becomes claimable again', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.players.leave, { code, playerId: ana })

    expect(rowFor(await t.query(api.characters.list, { code }), thorin)).toMatchObject({
      claimedByPlayerId: null,
    })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin })
    expect(await heldBy(t, ben)).toBe(thorin)
  })
})

describe('characters.release', () => {
  test('releasing frees the character for another seat', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.release, { code, playerId: ana })

    expect(await heldBy(t, ana)).toBeNull()
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin })
    expect(await heldBy(t, ben)).toBe(thorin)
  })

  test('releasing when nothing is held is a no-op', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')

    await t.mutation(api.characters.release, { code, playerId: ana })
    await t.mutation(api.characters.release, { code, playerId: ana })

    expect(await heldBy(t, ana)).toBeNull()
  })

  test('releasing one seat leaves other claims alone', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: balin })

    await t.mutation(api.characters.release, { code, playerId: ana })

    expect(await heldBy(t, ben)).toBe(balin)
  })

  test('a seat from another game cannot be released', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ben = await makeSeat(t, beta.code, 'Ben')
    const balin = await makeCharacter(t, beta.code, 'Balin')
    await t.mutation(api.characters.claim, { code: beta.code, playerId: ben, characterId: balin })

    await expectKind(
      t.mutation(api.characters.release, { code: alpha.code, playerId: ben }),
      'PlayerNotFound',
    )
    expect(await heldBy(t, ben)).toBe(balin)
  })
})

describe('characters.assign', () => {
  test('a wrong DM code is rejected and mutates nothing', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await expectKind(
      t.mutation(api.characters.assign, {
        code,
        dmCode: 'WRONGWRONG',
        playerId: ben,
        characterId: thorin,
      }),
      'NotDm',
    )

    expect(await heldBy(t, ana)).toBe(thorin)
    expect(await heldBy(t, ben)).toBeNull()
  })

  test('an empty DM code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.assign, { code, dmCode: '', playerId: ana, characterId: thorin }),
      'NotDm',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('the DM code is accepted with stray case and whitespace', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')

    await t.mutation(api.characters.assign, {
      code,
      dmCode: `  ${dmCode.toLowerCase()} `,
      playerId: ana,
      characterId: thorin,
    })
    expect(await heldBy(t, ana)).toBe(thorin)
  })

  test('assigning takes the character off its previous holder', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ben, characterId: thorin })

    expect(await heldBy(t, ana)).toBeNull()
    expect(await heldBy(t, ben)).toBe(thorin)
    const holders = await t.run(async (ctx) =>
      (await ctx.db.query('players').collect()).filter((seat) => seat.characterId === thorin),
    )
    expect(holders).toHaveLength(1)
  })

  test('a null characterId clears the target seat', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: null })

    expect(await heldBy(t, ana)).toBeNull()
    expect(rowFor(await t.query(api.characters.list, { code }), thorin)).toMatchObject({
      claimedByPlayerId: null,
      claimedByName: null,
    })
  })

  test('clearing an already empty seat succeeds', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: null })
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('assigning a character the seat already holds is a no-op that succeeds', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: thorin })

    expect(await heldBy(t, ana)).toBe(thorin)
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).claimedByPlayerId).toBe(ana)
  })

  test('assigning over a different held character frees the displaced one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: balin })

    expect(await heldBy(t, ana)).toBe(balin)
    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, thorin)).toMatchObject({ claimedByPlayerId: null, claimedByName: null })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin })
    expect(await heldBy(t, ben)).toBe(thorin)
  })

  test('a swap between two seats leaves each holding exactly one character', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: balin })

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: balin })
    await t.mutation(api.characters.assign, { code, dmCode, playerId: ben, characterId: thorin })

    expect(await heldBy(t, ana)).toBe(balin)
    expect(await heldBy(t, ben)).toBe(thorin)
    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, balin).claimedByName).toBe('Ana')
    expect(rowFor(list, thorin).claimedByName).toBe('Ben')
  })

  test('a DM code from another game is rejected', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ana = await makeSeat(t, alpha.code, 'Ana')
    const thorin = await makeCharacter(t, alpha.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.assign, {
        code: alpha.code,
        dmCode: beta.dmCode,
        playerId: ana,
        characterId: thorin,
      }),
      'NotDm',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('a seat from another game cannot be assigned to', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const outsider = await makeSeat(t, beta.code, 'Ben')
    const thorin = await makeCharacter(t, alpha.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.assign, {
        code: alpha.code,
        dmCode: alpha.dmCode,
        playerId: outsider,
        characterId: thorin,
      }),
      'PlayerNotFound',
    )
    expect(await heldBy(t, outsider)).toBeNull()
  })

  test('a character from another game cannot be assigned', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ana = await makeSeat(t, alpha.code, 'Ana')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.assign, {
        code: alpha.code,
        dmCode: alpha.dmCode,
        playerId: ana,
        characterId: theirs,
      }),
      'CharacterNotFound',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('assigning against an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.assign, {
        code: 'ZZZZZZ',
        dmCode,
        playerId: ana,
        characterId: thorin,
      }),
      'GameNotFound',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })
})

describe('characters.remove', () => {
  test('a wrong DM code is rejected and the character survives', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.remove, { code, dmCode: 'NOPENOPE', characterId: thorin }),
      'NotDm',
    )

    expect(await rawCharacter(t, thorin)).not.toBeNull()
    expect(await t.query(api.characters.list, { code })).toHaveLength(1)
  })

  test('removing clears the claim so no seat is left pointing at a deleted row', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    const seat = await t.run(async (ctx) => await ctx.db.get('players', ana))
    expect(seat?.characterId).toBeUndefined()
    expect(await rawCharacter(t, thorin)).toBeNull()
    const seats = await t.query(api.players.list, { code })
    expect(seats.find((entry) => entry._id === ana)).toMatchObject({
      characterId: null,
      characterName: null,
    })
    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  test('removing one character leaves other seats and claims intact', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const balin = await makeCharacter(t, code, 'Balin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: balin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    expect(await heldBy(t, ana)).toBeNull()
    expect(await heldBy(t, ben)).toBe(balin)
    const list = await t.query(api.characters.list, { code })
    expect(list).toHaveLength(1)
    expect(rowFor(list, balin).claimedByName).toBe('Ben')
  })

  test('removing an unclaimed character touches no claim', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    const spare = await makeCharacter(t, code, 'Spare')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: spare })

    expect(await heldBy(t, ana)).toBe(thorin)
  })

  test('a character in another game cannot be removed and survives', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const ben = await makeSeat(t, beta.code, 'Ben')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')
    await t.mutation(api.characters.claim, { code: beta.code, playerId: ben, characterId: theirs })

    await expectKind(
      t.mutation(api.characters.remove, {
        code: alpha.code,
        dmCode: alpha.dmCode,
        characterId: theirs,
      }),
      'CharacterNotFound',
    )

    expect(await rawCharacter(t, theirs)).not.toBeNull()
    expect(await heldBy(t, ben)).toBe(theirs)
  })

  test('removing the same character twice throws the second time', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })
    await expectKind(
      t.mutation(api.characters.remove, { code, dmCode, characterId: thorin }),
      'CharacterNotFound',
    )
  })

  test('removing against an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.remove, { code: 'ZZZZZZ', dmCode, characterId: thorin }),
      'GameNotFound',
    )
    expect(await rawCharacter(t, thorin)).not.toBeNull()
  })
})

describe('cross-game isolation', () => {
  test('identically named characters in two games are claimed independently', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const anaAlpha = await makeSeat(t, alpha.code, 'Ana')
    const anaBeta = await makeSeat(t, beta.code, 'Ana')
    const thorinAlpha = await makeCharacter(t, alpha.code, 'Thorin')
    const thorinBeta = await makeCharacter(t, beta.code, 'Thorin')

    await t.mutation(api.characters.claim, {
      code: alpha.code,
      playerId: anaAlpha,
      characterId: thorinAlpha,
    })
    await t.mutation(api.characters.claim, {
      code: beta.code,
      playerId: anaBeta,
      characterId: thorinBeta,
    })

    expect(await heldBy(t, anaAlpha)).toBe(thorinAlpha)
    expect(await heldBy(t, anaBeta)).toBe(thorinBeta)
    const alphaList = await t.query(api.characters.list, { code: alpha.code })
    const betaList = await t.query(api.characters.list, { code: beta.code })
    expect(alphaList).toHaveLength(1)
    expect(betaList).toHaveLength(1)
    expect(alphaList[0]._id).toBe(thorinAlpha)
    expect(betaList[0]._id).toBe(thorinBeta)
  })

  test('a list only reports the characters of the game its code names', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    await makeCharacter(t, alpha.code, 'Thorin')
    await makeCharacter(t, beta.code, 'Balin')
    await makeCharacter(t, beta.code, 'Dwalin')

    expect((await t.query(api.characters.list, { code: alpha.code })).map((c) => c.name)).toEqual([
      'Thorin',
    ])
    expect((await t.query(api.characters.list, { code: beta.code })).map((c) => c.name)).toEqual([
      'Balin',
      'Dwalin',
    ])
  })

  test('releasing a seat in one game does not free the other game claim', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const anaAlpha = await makeSeat(t, alpha.code, 'Ana')
    const anaBeta = await makeSeat(t, beta.code, 'Ana')
    const thorinAlpha = await makeCharacter(t, alpha.code, 'Thorin')
    const thorinBeta = await makeCharacter(t, beta.code, 'Thorin')
    await t.mutation(api.characters.claim, {
      code: alpha.code,
      playerId: anaAlpha,
      characterId: thorinAlpha,
    })
    await t.mutation(api.characters.claim, {
      code: beta.code,
      playerId: anaBeta,
      characterId: thorinBeta,
    })

    await t.mutation(api.characters.release, { code: alpha.code, playerId: anaAlpha })

    expect(await heldBy(t, anaAlpha)).toBeNull()
    expect(await heldBy(t, anaBeta)).toBe(thorinBeta)
  })
})
