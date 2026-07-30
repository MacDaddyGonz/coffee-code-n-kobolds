/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from './lib/codes'
import { CLASSES, CLASS_KEYS, SUBCLASS_LEVEL } from './lib/classes'
import { MAX_CHARACTERS_PER_GAME } from './lib/games'
import { RACE_KEYS } from './lib/races'
import type {
  NpcSheet,
  PcSheet,
  PresetOverrides,
  PresetSheet,
  SheetEntry,
  StoredSheet,
} from './lib/sheet'
import {
  MAX_ABILITY_SCORE,
  MAX_ARMOUR_CLASS,
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_HIT_DICE_COUNT,
  MAX_INITIATIVE_BONUS,
  MAX_LEVEL,
  MAX_MAX_HP,
  MAX_NPC_NOTES_LENGTH,
  MAX_SHEET_ENTRIES,
  MAX_SPELL_LEVEL,
  MIN_ABILITY_SCORE,
  MIN_ARMOUR_CLASS,
  MIN_LEVEL,
  MIN_MAX_HP,
  SPEED_FEET,
  defaultNpcSheet,
  defaultPcSheet,
  noSkills,
} from './lib/sheet'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

/**
 * Wrapped rather than `ReturnType<typeof convexTest>`, so the harness keeps the
 * schema's generic: without it `t.run(ctx => ...)` sees a schemaless `ctx.db` and
 * every `withIndex` inside one fails to typecheck.
 */
function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

type ErrorKind =
  | 'BadInput'
  | 'CharacterLocked'
  | 'CharacterNotFound'
  | 'CharacterNotYours'
  | 'CharacterTaken'
  | 'GameFull'
  | 'GameNotFound'
  | 'NotDm'
  | 'PlayerNotFound'
  | 'TokenNotYours'

/**
 * The module throws `ConvexError({ kind, message })`. convex-test surfaces that
 * payload on `.data`, so the discriminant is assertable directly instead of
 * being string-matched out of the message.
 */
async function expectKind(op: Promise<unknown>, kind: ErrorKind) {
  await expect(op).rejects.toThrow()
  await expect(op).rejects.toMatchObject({ data: { kind } })
}

/** The whole `{ kind, message, path? }` payload, for assertions about the wording. */
async function refusalOf(op: Promise<unknown>): Promise<{
  kind: string
  message: string
  path?: string
}> {
  const thrown = await op.then(
    () => {
      throw new Error('the call resolved, but it was expected to be refused')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(ConvexError)
  return (thrown as ConvexError<{ kind: string; message: string; path?: string }>).data
}

/**
 * A sheet refused by `sheetProblem`, named by the field it blamed.
 *
 * The `path` is asserted rather than the sentence, because the sentence is shared
 * with the browser's form and is allowed to be reworded; the field it points at is
 * the contract. That a non-empty message came with it is asserted too — a form with
 * one error line has nothing else to show.
 */
async function expectSheetProblem(op: Promise<unknown>, path: string) {
  const refusal = await refusalOf(op)
  expect(refusal.kind).toBe('BadInput')
  expect(refusal.path).toBe(path)
  expect(refusal.message.length).toBeGreaterThan(0)
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

// ---------------------------------------------------------------------------
// Milestone 3: sheets, vitals and the permission matrix around them
// ---------------------------------------------------------------------------

/** A player-character sheet with the defaults, overridden field by field. */
function pcSheet(overrides: Partial<PcSheet> = {}): PcSheet {
  return { ...defaultPcSheet(), ...overrides }
}

function npcSheet(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return { ...defaultNpcSheet(), ...overrides }
}

/** One line on a sheet. Valid by default, so a test only states what it is testing. */
function sheetEntry(overrides: Partial<SheetEntry> = {}): SheetEntry {
  return {
    id: 'entry-1',
    name: 'Second Wind',
    text: 'Regain hit points as a bonus action.',
    roll: '1d10+2',
    level: null,
    catalogueKey: null,
    ...overrides,
  }
}

/** `count` distinct, valid entries — for the list-length bounds. */
function sheetEntries(count: number): SheetEntry[] {
  return Array.from({ length: count }, (_unused, index) =>
    sheetEntry({ id: `entry-${index}`, name: `Entry ${index}` }),
  )
}

async function makePc(t: Harness, code: string, name: string, sheet: PcSheet) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet })
  return characterId
}

async function makeNpc(
  t: Harness,
  code: string,
  dmCode: string,
  name = 'Goblin',
  sheet: NpcSheet = npcSheet(),
) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet, dmCode })
  return characterId
}

/** The game's own id, which `games.create` deliberately does not hand back. */
async function gameIdFor(t: Harness, code: string): Promise<Id<'games'>> {
  const game = await t.run(async (ctx) => {
    return await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
  })
  if (!game) throw new Error(`no game with code ${code}`)
  return game._id
}

/**
 * A Milestone 1 character: a row in `characters` with no `sheet` field and no
 * `characterVitals` row beside it. Written with `t.run` because no mutation can
 * produce one any more, which is exactly why the fallbacks need testing.
 */
async function insertLegacyCharacter(t: Harness, code: string, name: string) {
  const gameId = await gameIdFor(t, code)
  return await t.run(async (ctx) => await ctx.db.insert('characters', { gameId, name }))
}

/** The stored vitals row, or null. The write is what is being asserted, not a projection. */
function rawVitals(t: Harness, characterId: Id<'characters'>) {
  return t.run(async (ctx) => {
    return await ctx.db
      .query('characterVitals')
      .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
      .unique()
  })
}

function rawToken(t: Harness, tokenId: Id<'tokens'>) {
  return t.run(async (ctx) => await ctx.db.get('tokens', tokenId))
}

/** The whole sheet as the panel would receive it, or null if the caller may not have it. */
async function readSheet(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
  who: Actor = {},
) {
  return await t.query(api.characters.sheet, { code, characterId, ...who })
}

/**
 * The `exact` vitals row for one character, insisting it is the exact variant —
 * a band would mean the caller was not entitled to the number being asserted.
 */
async function exactVitals(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
  who: { dmCode?: string } = {},
) {
  const rows = await t.query(api.characters.vitals, { code, ...who })
  const row = rows.find((entry) => entry.characterId === characterId)
  if (!row) throw new Error(`no vitals for ${characterId}`)
  if (row.kind !== 'exact') throw new Error(`expected exact vitals, got a ${row.kind}`)
  return { current: row.current, max: row.max }
}

/** Who is asking: a seat, the DM code, or neither. Both are optional everywhere. */
type Actor = { playerId?: Id<'players'>; dmCode?: string }

/** A scene, so tokens have somewhere to stand. The bytes are a courtesy for the size check. */
async function makeScene(t: Harness, code: string, dmCode: string, name = 'Admittance') {
  const body = new Uint8Array(64)
  for (let i = 0; i < body.length; i += 1) body[i] = (name.charCodeAt(i % name.length) + i) % 256
  const imageId = await t.run(async (ctx) => await ctx.storage.store(new Blob([body])))
  const { sceneId } = await t.mutation(api.scenes.create, {
    code,
    dmCode,
    name,
    imageId,
    imageWidth: 2240,
    imageHeight: 1680,
  })
  return sceneId
}

async function addToken(
  t: Harness,
  code: string,
  dmCode: string,
  sceneId: Id<'scenes'>,
  options: { name?: string; layer?: 'player' | 'dm'; characterId?: Id<'characters'> } = {},
) {
  const { tokenId } = await t.mutation(api.board.addToken, {
    code,
    dmCode,
    sceneId,
    name: options.name ?? 'Coin',
    layer: options.layer ?? 'player',
    sizeSquares: 1,
    tint: '#c0392b',
    characterId: options.characterId,
    x: 500,
    y: 500,
  })
  return tokenId
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

// ===========================================================================
// Milestone 3: sheets, vitals, and who may touch them
// ===========================================================================

describe('characters.create — sheets', () => {
  test('a player character created without a sheet reads back as the defaults', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    expect(await readSheet(t, code, thorin, { dmCode })).toEqual({
      _id: thorin,
      name: 'Thorin',
      sheet: defaultPcSheet(),
      // Milestone 4 sends the stored selections alongside the resolved sheet, and
      // the premade sheet's kit and levelling note beside them. A hand-built
      // character has neither, so both fields are present and null rather than
      // absent — see `publicSheetValidator`.
      preset: null,
      extras: null,
    })
  })

  test('a created character gets a vitals row at full hit points', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({ maxHp: 45, hitDice: { count: 6, faces: 10 } }),
    )

    expect(await rawVitals(t, thorin)).toMatchObject({ currentHp: 45, hitDiceRemaining: 6 })
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 45, max: 45 })
  })

  test('an NPC gets a vitals row too, with no hit dice on it', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))

    const vitals = await rawVitals(t, goblin)
    expect(vitals?.currentHp).toBe(7)
    expect(vitals?.hitDiceRemaining).toBeUndefined()
  })

  test('creating an NPC without the DM code is refused, and nothing is written', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectKind(
      t.mutation(api.characters.create, { code, name: 'Ancient Red Dragon', sheet: npcSheet() }),
      'NotDm',
    )
    expect(await t.query(api.characters.list, { code })).toEqual([])
    expect(await t.run(async (ctx) => await ctx.db.query('characters').collect())).toEqual([])
  })

  test('creating an NPC with a wrong or empty DM code is refused', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    for (const wrong of ['', 'NOPENOPE', `${dmCode}X`, dmCode.slice(0, -1)]) {
      await expectKind(
        t.mutation(api.characters.create, {
          code,
          name: 'Ancient Red Dragon',
          sheet: npcSheet(),
          dmCode: wrong,
        }),
        'NotDm',
      )
    }
    expect(await t.query(api.characters.list, { code, dmCode })).toEqual([])
  })

  test('a DM code from another game does not authorise an NPC here', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')

    await expectKind(
      t.mutation(api.characters.create, {
        code: alpha.code,
        name: 'Goblin',
        sheet: npcSheet(),
        dmCode: beta.dmCode,
      }),
      'NotDm',
    )
    expect(
      await t.query(api.characters.list, { code: alpha.code, dmCode: alpha.dmCode }),
    ).toEqual([])
  })

  test('a DM code is not needed for a player character and is harmless when sent', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    const { characterId } = await t.mutation(api.characters.create, {
      code,
      name: 'Thorin',
      sheet: pcSheet({ level: 4 }),
      dmCode,
    })
    expect(rowFor(await t.query(api.characters.list, { code }), characterId).kind).toBe('pc')
  })

  test('an invalid sheet writes neither a character nor a vitals row', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, { code, name: 'Thorin', sheet: pcSheet({ level: 0 }) }),
      'level',
    )
    expect(await t.run(async (ctx) => await ctx.db.query('characters').collect())).toEqual([])
    expect(await t.run(async (ctx) => await ctx.db.query('characterVitals').collect())).toEqual([])
  })

  test('the per-game cap counts NPCs as well as heroes', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    // Deliberately fills the game: the point is that the hidden half counts.
    for (let i = 0; i < MAX_CHARACTERS_PER_GAME - 1; i += 1) {
      await makeCharacter(t, code, `Recruit ${i}`)
    }
    await makeNpc(t, code, dmCode, 'Goblin')

    await expectKind(t.mutation(api.characters.create, { code, name: 'One Too Many' }), 'GameFull')
    await expectKind(
      t.mutation(api.characters.create, {
        code,
        name: 'One Too Many',
        sheet: npcSheet(),
        dmCode,
      }),
      'GameFull',
    )
  })
})

describe('sheet round trips', () => {
  test('every field of a player-character sheet survives create and read', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const sheet = pcSheet({
      level: 7,
      className: 'Battle Master Fighter',
      abilities: { str: 18, dex: 14, con: 16, int: 9, wis: 11, cha: 13 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      armourClass: 18,
      maxHp: 62,
      hitDice: { count: 7, faces: 10 },
      feats: [
        sheetEntry({ id: 'feat-1', name: 'Second Wind', roll: '1d10+7' }),
        sheetEntry({ id: 'feat-2', name: 'Action Surge', text: 'One extra action.', roll: null }),
      ],
      spells: [
        sheetEntry({
          id: 'spell-1',
          name: 'Fire Bolt',
          roll: '1d10',
          level: 0,
          catalogueKey: 'fire-bolt',
        }),
        sheetEntry({ id: 'spell-2', name: 'Shield', roll: null, level: 1, catalogueKey: 'shield' }),
      ],
    })

    const characterId = await makePc(t, code, 'Thorin', sheet)
    expect((await readSheet(t, code, characterId, { dmCode }))?.sheet).toEqual(sheet)
  })

  test('every field of an NPC sheet survives create and read', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const sheet = npcSheet({
      armourClass: 22,
      maxHp: 546,
      initiativeBonus: -3,
      actions: [
        sheetEntry({ id: 'act-1', name: 'Fire Breath', text: 'A 90-foot cone.', roll: '8d6' }),
        sheetEntry({ id: 'act-2', name: 'Bite', roll: '2d10+9', level: null }),
      ],
      notes: 'Hoards a stolen crown. Will parley if offered it back.',
    })

    const characterId = await makeNpc(t, code, dmCode, 'Ancient Red Dragon', sheet)
    expect((await readSheet(t, code, characterId, { dmCode }))?.sheet).toEqual(sheet)
  })

  test('a sheet replaced through updateSheet comes back field for field', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')
    const sheet = pcSheet({
      level: 20,
      className: 'Wizard',
      abilities: { str: 8, dex: 14, con: 14, int: 20, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
      armourClass: 15,
      maxHp: 122,
      hitDice: { count: 20, faces: 6 },
      feats: [sheetEntry({ id: 'f', name: 'Arcane Recovery', roll: null })],
      spells: sheetEntries(3),
    })

    await t.mutation(api.characters.updateSheet, { code, characterId: thorin, sheet, dmCode })

    expect((await readSheet(t, code, thorin, { dmCode }))?.sheet).toEqual(sheet)
    // And the stored document, not only the projection of it.
    expect((await rawCharacter(t, thorin))?.sheet).toEqual(sheet)
  })

  test('a list of exactly the maximum number of entries survives the round trip', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const spells = sheetEntries(MAX_SHEET_ENTRIES)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ spells }))

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    expect(stored?.kind).toBe('pc')
    expect(stored?.kind === 'pc' ? stored.spells : []).toEqual(spells)
    expect(stored?.kind === 'pc' ? stored.spells : []).toHaveLength(MAX_SHEET_ENTRIES)
  })

  test('unicode and emoji in an entry survive whole', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const name = 'Éclair de Feu \u{1F525}\u{1F9D9}‍♀️ — Cœur'
    const text = 'Sätze mit Umlauten, 火 as an ideogram, and a \u{1F409} in the description.'
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({ spells: [sheetEntry({ id: 'spell-\u{1F525}', name, text, level: 3 })] }),
    )

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    const spells = stored?.kind === 'pc' ? stored.spells : []
    expect(spells[0].name).toBe(name)
    expect(spells[0].text).toBe(text)
    expect(spells[0].id).toBe('spell-\u{1F525}')
    // And no half of a surrogate pair survived the trip — the class of bug
    // Milestone 1 shipped in a display name, which convex-test stores happily.
    const unpaired = `${spells[0].name}${spells[0].text}${spells[0].id}`.replace(
      /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
      '',
    )
    expect(/[\uD800-\uDFFF]/.test(unpaired)).toBe(false)
  })

  test('an entry name is whitespace-collapsed and its text trimmed but not flattened', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({
        feats: [sheetEntry({ name: '  Fire   Bolt  ', text: '  Two lines.\n\nStill two.  ' })],
      }),
    )

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    const feats = stored?.kind === 'pc' ? stored.feats : []
    expect(feats[0].name).toBe('Fire Bolt')
    expect(feats[0].text).toBe('Two lines.\n\nStill two.')
  })

  test('a roll is normalised on the way in, so whitespace and casing do not matter', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({
        feats: [
          sheetEntry({ id: 'a', name: 'Spaced', roll: '2d6 + 3' }),
          sheetEntry({ id: 'b', name: 'Shouted', roll: '1D8+WIS' }),
          sheetEntry({ id: 'c', name: 'Whispered', roll: '1d20+prof' }),
          sheetEntry({ id: 'd', name: 'Blank', roll: '   ' }),
        ],
      }),
    )

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    const feats = stored?.kind === 'pc' ? stored.feats : []
    expect(feats.map((feat) => feat.roll)).toEqual(['2d6+3', '1d8+WIS', '1d20+PROF', null])
  })

  test('an empty catalogue key becomes null rather than an empty string', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({ feats: [sheetEntry({ catalogueKey: '   ' })] }),
    )

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    expect((stored?.kind === 'pc' ? stored.feats : [])[0].catalogueKey).toBeNull()
  })

  test('fractional numbers are rounded rather than refused', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({
        level: 4.4,
        armourClass: 15.6,
        maxHp: 30.5,
        abilities: { str: 13.5, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        hitDice: { count: 3.2, faces: 8 },
        spells: [sheetEntry({ level: 2.4 })],
      }),
    )

    const stored = (await readSheet(t, code, thorin, { dmCode }))?.sheet
    expect(stored?.kind).toBe('pc')
    if (stored?.kind !== 'pc') return
    expect(stored.level).toBe(4)
    expect(stored.armourClass).toBe(16)
    expect(stored.maxHp).toBe(31)
    expect(stored.abilities.str).toBe(14)
    expect(stored.hitDice.count).toBe(3)
    expect(stored.spells[0].level).toBe(2)
  })
})

describe('legacy characters with no sheet', () => {
  test('a row with no sheet field lists as a player character', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    // Stored as it was: the fallback is a read, not a lazy migration.
    expect((await rawCharacter(t, legacy))?.sheet).toBeUndefined()

    const list = await t.query(api.characters.list, { code })
    expect(rowFor(list, legacy)).toMatchObject({ name: 'Milestone One', kind: 'pc' })
  })

  test('its sheet reads as the player-character defaults rather than throwing', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    expect(await readSheet(t, code, legacy, { dmCode })).toEqual({
      _id: legacy,
      name: 'Milestone One',
      sheet: defaultPcSheet(),
      // As above: no stored selections and no library entry behind it, so both
      // are null rather than missing.
      preset: null,
      extras: null,
    })
  })

  test('its vitals read as full hit points with no stored row', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    expect(await rawVitals(t, legacy)).toBeNull()
    expect(await exactVitals(t, code, legacy)).toEqual({
      current: defaultPcSheet().maxHp,
      max: defaultPcSheet().maxHp,
    })
  })

  test('damaging one creates the vitals row it never had', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    const { currentHp } = await t.mutation(api.characters.adjustHp, {
      code,
      characterId: legacy,
      delta: -4,
      dmCode,
    })

    expect(currentHp).toBe(defaultPcSheet().maxHp - 4)
    expect((await rawVitals(t, legacy))?.currentHp).toBe(defaultPcSheet().maxHp - 4)
  })

  test('its hit dice read as the default complement and can be spent', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: legacy,
        delta: -1,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: defaultPcSheet().hitDice.count - 1 })
  })

  test('a legacy row can be renamed, claimed and removed as before', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    await t.mutation(api.characters.rename, { code, characterId: legacy, name: 'Renamed' })
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: legacy })
    expect(await heldBy(t, ana)).toBe(legacy)

    await t.mutation(api.characters.remove, { code, dmCode, characterId: legacy })
    expect(await rawCharacter(t, legacy)).toBeNull()
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('a legacy row cannot be turned into an NPC by an update', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: legacy,
        sheet: npcSheet(),
        dmCode,
      }),
      'BadInput',
    )
    expect((await rawCharacter(t, legacy))?.sheet).toBeUndefined()
  })

  test('a legacy row a seat is playing is editable by that seat', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: legacy })

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: legacy,
      sheet: pcSheet({ level: 6, maxHp: 44 }),
      playerId: ana,
    })

    expect((await readSheet(t, code, legacy, { playerId: ana }))?.sheet).toEqual(
      pcSheet({ level: 6, maxHp: 44 }),
    )
    expect(await exactVitals(t, code, legacy)).toEqual({ current: 44, max: 44 })
  })
})

describe('sheet validation, through the mutation rather than the helper', () => {
  /** Every bound `sheetProblem` enforces, and the field each one should blame. */
  const refused: [string, PcSheet | NpcSheet, string][] = [
    ['a level of 0', pcSheet({ level: MIN_LEVEL - 1 }), 'level'],
    ['a level of 21', pcSheet({ level: MAX_LEVEL + 1 }), 'level'],
    ['a NaN level', pcSheet({ level: Number.NaN }), 'level'],
    [
      'an ability score of 0',
      pcSheet({
        abilities: { str: MIN_ABILITY_SCORE - 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      }),
      'abilities.str',
    ],
    [
      'an ability score of 31',
      pcSheet({
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: MAX_ABILITY_SCORE + 1 },
      }),
      'abilities.cha',
    ],
    [
      'a NaN ability score',
      pcSheet({ abilities: { str: 10, dex: Number.NaN, con: 10, int: 10, wis: 10, cha: 10 } }),
      'abilities.dex',
    ],
    ['an armour class below the floor', pcSheet({ armourClass: MIN_ARMOUR_CLASS - 1 }), 'armourClass'],
    [
      'an armour class above the ceiling',
      pcSheet({ armourClass: MAX_ARMOUR_CLASS + 1 }),
      'armourClass',
    ],
    ['a maximum of 0 hit points', pcSheet({ maxHp: MIN_MAX_HP - 1 }), 'maxHp'],
    ['a maximum of 1000 hit points', pcSheet({ maxHp: MAX_MAX_HP + 1 }), 'maxHp'],
    ['a hit dice count of 0', pcSheet({ hitDice: { count: 0, faces: 8 } }), 'hitDice.count'],
    [
      'a hit dice count above the cap',
      pcSheet({ hitDice: { count: MAX_HIT_DICE_COUNT + 1, faces: 8 } }),
      'hitDice.count',
    ],
    ['a class name that is too long', pcSheet({ className: 'x'.repeat(41) }), 'className'],
    ['forty-one feats', pcSheet({ feats: sheetEntries(MAX_SHEET_ENTRIES + 1) }), 'feats'],
    ['forty-one spells', pcSheet({ spells: sheetEntries(MAX_SHEET_ENTRIES + 1) }), 'spells'],
    ['an empty entry id', pcSheet({ feats: [sheetEntry({ id: '' })] }), 'feats[0].id'],
    ['a whitespace-only entry id', pcSheet({ feats: [sheetEntry({ id: '   ' })] }), 'feats[0].id'],
    [
      'an over-long entry id',
      pcSheet({ feats: [sheetEntry({ id: 'x'.repeat(MAX_ENTRY_ID_LENGTH + 1) })] }),
      'feats[0].id',
    ],
    [
      'two entries sharing an id',
      pcSheet({
        feats: [sheetEntry({ id: 'same', name: 'One' }), sheetEntry({ id: 'same', name: 'Two' })],
      }),
      'feats[1].id',
    ],
    ['an entry with no name', pcSheet({ feats: [sheetEntry({ name: '   ' })] }), 'feats[0].name'],
    [
      'an over-long entry name',
      pcSheet({ feats: [sheetEntry({ name: 'x'.repeat(MAX_ENTRY_NAME_LENGTH + 1) })] }),
      'feats[0].name',
    ],
    [
      'an over-long entry description',
      pcSheet({ feats: [sheetEntry({ text: 'x'.repeat(MAX_ENTRY_TEXT_LENGTH + 1) })] }),
      'feats[0].text',
    ],
    ['a roll with no dice count', pcSheet({ feats: [sheetEntry({ roll: 'd8' })] }), 'feats[0].roll'],
    ['a die nobody owns', pcSheet({ feats: [sheetEntry({ roll: '1d7' })] }), 'feats[0].roll'],
    [
      'a roll with a term that is not a modifier',
      pcSheet({ feats: [sheetEntry({ roll: '1d8+LUCK' })] }),
      'feats[0].roll',
    ],
    [
      'a roll of ninety-nine thousand dice',
      pcSheet({ feats: [sheetEntry({ roll: '99999d6' })] }),
      'feats[0].roll',
    ],
    [
      'a spell level of 10',
      pcSheet({ spells: [sheetEntry({ level: MAX_SPELL_LEVEL + 1 })] }),
      'spells[0].level',
    ],
    ['a negative spell level', pcSheet({ spells: [sheetEntry({ level: -1 })] }), 'spells[0].level'],
    [
      'an over-long catalogue key',
      pcSheet({ spells: [sheetEntry({ catalogueKey: 'x'.repeat(MAX_ENTRY_ID_LENGTH + 1) })] }),
      'spells[0].catalogueKey',
    ],
    ['an NPC on 0 hit points', npcSheet({ maxHp: 0 }), 'maxHp'],
    [
      'an NPC with an impossible armour class',
      npcSheet({ armourClass: MAX_ARMOUR_CLASS + 1 }),
      'armourClass',
    ],
    [
      'an NPC initiative bonus past the ceiling',
      npcSheet({ initiativeBonus: MAX_INITIATIVE_BONUS + 1 }),
      'initiativeBonus',
    ],
    [
      'an NPC initiative bonus past the floor',
      npcSheet({ initiativeBonus: -MAX_INITIATIVE_BONUS - 1 }),
      'initiativeBonus',
    ],
    ['over-long NPC notes', npcSheet({ notes: 'x'.repeat(MAX_NPC_NOTES_LENGTH + 1) }), 'notes'],
    ['forty-one NPC actions', npcSheet({ actions: sheetEntries(MAX_SHEET_ENTRIES + 1) }), 'actions'],
    [
      'two NPC actions sharing an id',
      npcSheet({ actions: [sheetEntry({ id: 'same' }), sheetEntry({ id: 'same', name: 'Two' })] }),
      'actions[1].id',
    ],
  ]

  for (const [label, sheet, path] of refused) {
    test(`create refuses ${label}, blaming ${path}`, async () => {
      const t = convexTest(schema, modules)
      const { code, dmCode } = await makeGame(t)

      await expectSheetProblem(
        t.mutation(api.characters.create, { code, name: 'Subject', sheet, dmCode }),
        path,
      )
      expect(await t.run(async (ctx) => await ctx.db.query('characters').collect())).toEqual([])
    })

    test(`updateSheet refuses ${label}, blaming ${path}`, async () => {
      const t = convexTest(schema, modules)
      const { code, dmCode } = await makeGame(t)
      const characterId =
        sheet.kind === 'npc'
          ? await makeNpc(t, code, dmCode, 'Subject')
          : await makeCharacter(t, code, 'Subject')
      const before = (await rawCharacter(t, characterId))?.sheet

      await expectSheetProblem(
        t.mutation(api.characters.updateSheet, { code, characterId, sheet, dmCode }),
        path,
      )
      expect((await rawCharacter(t, characterId))?.sheet).toEqual(before)
    })
  }

  /** The edge values that must be accepted, so the bounds are inclusive as written. */
  const accepted: [string, PcSheet | NpcSheet][] = [
    ['the lowest legal level', pcSheet({ level: MIN_LEVEL })],
    ['the highest legal level', pcSheet({ level: MAX_LEVEL })],
    [
      'ability scores at both extremes',
      pcSheet({
        abilities: {
          str: MIN_ABILITY_SCORE,
          dex: MAX_ABILITY_SCORE,
          con: MIN_ABILITY_SCORE,
          int: MAX_ABILITY_SCORE,
          wis: 10,
          cha: 10,
        },
      }),
    ],
    ['an armour class of exactly zero', pcSheet({ armourClass: MIN_ARMOUR_CLASS })],
    ['an armour class at the ceiling', pcSheet({ armourClass: MAX_ARMOUR_CLASS })],
    ['exactly one hit point', pcSheet({ maxHp: MIN_MAX_HP })],
    ['the largest legal pool of hit points', pcSheet({ maxHp: MAX_MAX_HP })],
    ['a single hit die', pcSheet({ hitDice: { count: 1, faces: 6 } })],
    [
      'the full complement of hit dice',
      pcSheet({ hitDice: { count: MAX_HIT_DICE_COUNT, faces: 12 } }),
    ],
    ['exactly forty feats', pcSheet({ feats: sheetEntries(MAX_SHEET_ENTRIES) })],
    ['exactly forty spells', pcSheet({ spells: sheetEntries(MAX_SHEET_ENTRIES) })],
    [
      'an entry name at exactly the limit',
      pcSheet({ feats: [sheetEntry({ name: 'x'.repeat(MAX_ENTRY_NAME_LENGTH) })] }),
    ],
    [
      'an entry id at exactly the limit',
      pcSheet({ feats: [sheetEntry({ id: 'x'.repeat(MAX_ENTRY_ID_LENGTH) })] }),
    ],
    [
      'a description at exactly the limit',
      pcSheet({ feats: [sheetEntry({ text: 'x'.repeat(MAX_ENTRY_TEXT_LENGTH) })] }),
    ],
    ['a cantrip', pcSheet({ spells: [sheetEntry({ level: 0 })] })],
    ['a ninth-level spell', pcSheet({ spells: [sheetEntry({ level: MAX_SPELL_LEVEL })] })],
    ['an entry with no roll at all', pcSheet({ feats: [sheetEntry({ roll: null })] })],
    ['a roll of twenty dice', pcSheet({ feats: [sheetEntry({ roll: '20d12-1' })] })],
    ['an NPC at the initiative floor', npcSheet({ initiativeBonus: -MAX_INITIATIVE_BONUS })],
    ['an NPC at the initiative ceiling', npcSheet({ initiativeBonus: MAX_INITIATIVE_BONUS })],
    ['NPC notes at exactly the limit', npcSheet({ notes: 'x'.repeat(MAX_NPC_NOTES_LENGTH) })],
    ['exactly forty NPC actions', npcSheet({ actions: sheetEntries(MAX_SHEET_ENTRIES) })],
  ]

  for (const [label, sheet] of accepted) {
    test(`create accepts ${label}`, async () => {
      const t = convexTest(schema, modules)
      const { code, dmCode } = await makeGame(t)

      const { characterId } = await t.mutation(api.characters.create, {
        code,
        name: 'Subject',
        sheet,
        dmCode,
      })
      expect((await readSheet(t, code, characterId, { dmCode }))?.sheet.kind).toBe(sheet.kind)
    })
  }

  /**
   * THE DEFECT. `normaliseRoll` uppercases the whole string and then lowercases
   * *every* `D` in it, so the die separator and the `D` of `DEX` are treated
   * alike: `1d20+DEX` normalises to `1d20+dEX`, which `ROLL_PATTERN` then
   * refuses. `DEX` is one of the seven tokens `ROLL_MODIFIER_TOKENS` advertises
   * and the only one containing a `D`, so every Dexterity-scaled roll on every
   * sheet — a finesse attack, a ranged attack, a Dexterity save — is rejected.
   *
   * Left failing deliberately rather than rewritten to match: see the report.
   */
  test('a Dexterity-scaled roll is accepted and stored as typed', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    const { characterId } = await t.mutation(api.characters.create, {
      code,
      name: 'Rogue',
      sheet: pcSheet({ feats: [sheetEntry({ name: 'Rapier', roll: '1d8+DEX' })] }),
    })
    const stored = (await readSheet(t, code, characterId, { dmCode }))?.sheet
    expect((stored?.kind === 'pc' ? stored.feats : [])[0].roll).toBe('1d8+DEX')
  })

  test('the other six modifier tokens survive normalisation', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    for (const token of ['STR', 'CON', 'INT', 'WIS', 'CHA', 'PROF']) {
      const { characterId } = await t.mutation(api.characters.create, {
        code,
        name: `Roller ${token}`,
        sheet: pcSheet({ feats: [sheetEntry({ roll: `1d20+${token}` })] }),
      })
      const stored = (await readSheet(t, code, characterId, { dmCode }))?.sheet
      expect((stored?.kind === 'pc' ? stored.feats : [])[0].roll).toBe(`1d20+${token}`)
    }
  })

  /**
   * The ids have to be unique across BOTH lists, not within each — `sheetEntriesOf`
   * merges feats and spells into one array, which is a React key set and Milestone
   * 4's roll target, so a per-list check would enforce exactly the half of the
   * guarantee that does not matter.
   */
  test('a feat and a spell cannot share an id', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        name: 'Thorin',
        sheet: pcSheet({
          feats: [sheetEntry({ id: 'shared', name: 'A feat' })],
          spells: [sheetEntry({ id: 'shared', name: 'A spell', level: 1 })],
        }),
      }),
      'spells[0].id',
    )
    expect(await t.run(async (ctx) => await ctx.db.query('characters').collect())).toEqual([])
  })

  test('the same id in the two lists of two different characters is fine', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const sheet = pcSheet({ feats: [sheetEntry({ id: 'shared' })] })

    const thorin = await makePc(t, code, 'Thorin', sheet)
    const balin = await makePc(t, code, 'Balin', sheet)

    for (const characterId of [thorin, balin]) {
      const stored = (await readSheet(t, code, characterId, { dmCode }))?.sheet
      expect(stored?.kind === 'pc' ? stored.feats[0].id : null).toBe('shared')
    }
  })

  /**
   * The faces are a literal union in the mutation's own argument validator, so an
   * invalid one is refused before the handler runs — which convex-test does apply,
   * unlike Convex's validation of *stored* values. `sheetProblem` checks it as
   * well, for the browser's form, and that path belongs to lib/sheet.test.ts.
   */
  test('a hit die nobody owns is refused at the argument boundary', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expect(
      t.mutation(api.characters.create, {
        code,
        name: 'Thorin',
        sheet: pcSheet({ hitDice: { count: 1, faces: 7 as 6 } }),
      }),
    ).rejects.toThrow()
    expect(await t.run(async (ctx) => await ctx.db.query('characters').collect())).toEqual([])
  })
})

describe('characters.updateSheet', () => {
  test('a player character cannot be turned into an NPC', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ level: 3 }))

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: thorin,
        sheet: npcSheet(),
        dmCode,
      }),
      'BadInput',
    )
    expect((await readSheet(t, code, thorin, { dmCode }))?.sheet).toEqual(pcSheet({ level: 3 }))
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).kind).toBe('pc')
  })

  test('an NPC cannot be turned into a player character', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: goblin,
        sheet: pcSheet(),
        dmCode,
      }),
      'BadInput',
    )
    expect((await readSheet(t, code, goblin, { dmCode }))?.sheet).toEqual(npcSheet({ maxHp: 7 }))
    // Still hidden from the players it was hidden from.
    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  test('a refused kind change leaves the vitals row alone', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -12, dmCode })

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: thorin,
        sheet: npcSheet({ maxHp: 5 }),
        dmCode,
      }),
      'BadInput',
    )
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 28, max: 40 })
  })

  test('a character in another game cannot have its sheet replaced across the boundary', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code: alpha.code,
        characterId: theirs,
        sheet: pcSheet({ level: 9 }),
        dmCode: alpha.dmCode,
      }),
      'CharacterNotFound',
    )
    expect((await rawCharacter(t, theirs))?.sheet).toEqual(defaultPcSheet())
  })

  test('updating against an unknown game code is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code: 'ZZZZZZ',
        characterId: thorin,
        sheet: pcSheet({ level: 9 }),
        dmCode,
      }),
      'GameNotFound',
    )
  })

  test('updating a removed character is rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: thorin,
        sheet: pcSheet(),
        dmCode,
      }),
      'CharacterNotFound',
    )
  })
})

describe('hit points', () => {
  test('adjustHp takes damage and returns the value it stored', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -7, dmCode }),
    ).toEqual({ currentHp: 38 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(38)
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 38, max: 45 })
  })

  test('two calls of the same delta compose', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -5, dmCode })
    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -5, dmCode }),
    ).toEqual({ currentHp: 35 })
  })

  test('a delta below zero lands on zero rather than a negative', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 12 }))

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -900, dmCode }),
    ).toEqual({ currentHp: 0 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(0)
    // And a second blow does not push it below.
    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -5, dmCode }),
    ).toEqual({ currentHp: 0 })
  })

  test('a heal past the maximum lands on the maximum', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 20 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -15, dmCode })

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: 999, dmCode }),
    ).toEqual({ currentHp: 20 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(20)
  })

  test('a delta larger than the hit point ceiling is refused outright', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 20 }))

    for (const delta of [MAX_MAX_HP + 1, -(MAX_MAX_HP + 1), 1e9]) {
      await expectKind(
        t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta, dmCode }),
        'BadInput',
      )
    }
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 20, max: 20 })

    // Exactly the ceiling is still allowed.
    expect(
      await t.mutation(api.characters.adjustHp, {
        code,
        characterId: thorin,
        delta: -MAX_MAX_HP,
        dmCode,
      }),
    ).toEqual({ currentHp: 0 })
  })

  test('NaN and both infinities are refused by adjustHp, leaving the stored value alone', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -6, dmCode })

    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expectKind(
        t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta, dmCode }),
        'BadInput',
      )
    }
    expect((await rawVitals(t, thorin))?.currentHp).toBe(24)
  })

  test('a fractional delta is rounded rather than stored', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -2.5, dmCode }),
    ).toEqual({ currentHp: 28 })
    expect(Number.isInteger((await rawVitals(t, thorin))?.currentHp)).toBe(true)
  })

  test('setHp writes a value straight in and returns what was stored', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    expect(
      await t.mutation(api.characters.setHp, { code, characterId: thorin, currentHp: 12, dmCode }),
    ).toEqual({ currentHp: 12 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(12)
  })

  test('setHp clamps at zero and at the maximum', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    expect(
      await t.mutation(api.characters.setHp, { code, characterId: thorin, currentHp: -30, dmCode }),
    ).toEqual({ currentHp: 0 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(0)
    expect(
      await t.mutation(api.characters.setHp, {
        code,
        characterId: thorin,
        currentHp: 9999,
        dmCode,
      }),
    ).toEqual({ currentHp: 45 })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(45)
  })

  test('setHp rounds a fraction rather than storing one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    expect(
      await t.mutation(api.characters.setHp, {
        code,
        characterId: thorin,
        currentHp: 12.6,
        dmCode,
      }),
    ).toEqual({ currentHp: 13 })
  })

  test('setHp refuses NaN and the infinities', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))

    for (const currentHp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expectKind(
        t.mutation(api.characters.setHp, { code, characterId: thorin, currentHp, dmCode }),
        'BadInput',
      )
    }
    expect((await rawVitals(t, thorin))?.currentHp).toBe(45)
  })

  test('an NPC takes damage the same way, and only the DM sees the number', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: goblin, delta: -3, dmCode }),
    ).toEqual({ currentHp: 4 })
    expect(await exactVitals(t, code, goblin, { dmCode })).toEqual({ current: 4, max: 7 })
    // A player is told nothing at all about a creature with no token on their board.
    expect(await t.query(api.characters.vitals, { code })).toEqual([])
  })

  test('hit points on one character do not disturb another', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40 }))
    const balin = await makePc(t, code, 'Balin', pcSheet({ maxHp: 30 }))

    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -11, dmCode })

    expect(await exactVitals(t, code, thorin)).toEqual({ current: 29, max: 40 })
    expect(await exactVitals(t, code, balin)).toEqual({ current: 30, max: 30 })
    expect(await t.run(async (ctx) => (await ctx.db.query('characterVitals').collect()).length)).toBe(2)
  })

  test('adjusting hit points writes exactly one vitals row per character', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40 }))

    for (let i = 0; i < 5; i += 1) {
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -1, dmCode })
    }

    const rows = await t.run(async (ctx) => await ctx.db.query('characterVitals').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0].currentHp).toBe(35)
  })
})

describe('lowering the maximum re-clamps the current value', () => {
  test('a character on 38 of 45 whose maximum drops to 20 is left on 20', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -7, dmCode })
    expect((await rawVitals(t, thorin))?.currentHp).toBe(38)

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: thorin,
      sheet: pcSheet({ maxHp: 20 }),
      dmCode,
    })

    expect((await rawVitals(t, thorin))?.currentHp).toBe(20)
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 20, max: 20 })
  })

  test('a value already under the new maximum is left exactly where it was', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))
    await t.mutation(api.characters.setHp, { code, characterId: thorin, currentHp: 9, dmCode })

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: thorin,
      sheet: pcSheet({ maxHp: 20 }),
      dmCode,
    })

    expect(await exactVitals(t, code, thorin)).toEqual({ current: 9, max: 20 })
  })

  test('raising the maximum does not heal anybody', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 20 }))
    await t.mutation(api.characters.setHp, { code, characterId: thorin, currentHp: 4, dmCode })

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: thorin,
      sheet: pcSheet({ maxHp: 90 }),
      dmCode,
    })

    expect(await exactVitals(t, code, thorin)).toEqual({ current: 4, max: 90 })
  })

  test('an NPC is re-clamped the same way, so no band comes from a ratio above one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const dragon = await makeNpc(t, code, dmCode, 'Dragon', npcSheet({ maxHp: 200 }))

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: dragon,
      sheet: npcSheet({ maxHp: 30 }),
      dmCode,
    })

    expect((await rawVitals(t, dragon))?.currentHp).toBe(30)
    expect(await exactVitals(t, code, dragon, { dmCode })).toEqual({ current: 30, max: 30 })
  })

  test('the seat playing the character can do it to itself, and is still re-clamped', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 45 }))
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    await t.mutation(api.characters.setHp, {
      code,
      characterId: thorin,
      currentHp: 38,
      playerId: ana,
    })

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: thorin,
      sheet: pcSheet({ maxHp: 20 }),
      playerId: ana,
    })

    expect(await exactVitals(t, code, thorin)).toEqual({ current: 20, max: 20 })
  })

  test('shrinking the hit dice pool re-clamps what is left of it', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 10, faces: 10 } }))

    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: thorin,
      sheet: pcSheet({ hitDice: { count: 2, faces: 10 } }),
      dmCode,
    })

    expect((await rawVitals(t, thorin))?.hitDiceRemaining).toBe(2)
    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: thorin,
        delta: 0,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: 2 })
  })
})

describe('characters.adjustHitDice', () => {
  test('spending one leaves the rest', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 5, faces: 10 } }))

    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: thorin,
        delta: -1,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: 4 })
    expect((await rawVitals(t, thorin))?.hitDiceRemaining).toBe(4)
  })

  test('spending more than are left floors at zero', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 3, faces: 8 } }))

    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: thorin,
        delta: -99,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: 0 })
  })

  test('a long rest cannot mint dice past the count on the sheet', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 6, faces: 8 } }))
    await t.mutation(api.characters.adjustHitDice, { code, characterId: thorin, delta: -4, dmCode })

    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: thorin,
        delta: 100,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: 6 })
  })

  test('an NPC has none to spend and reports zero either way', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')

    for (const delta of [5, -5, 0]) {
      expect(
        await t.mutation(api.characters.adjustHitDice, {
          code,
          characterId: goblin,
          delta,
          dmCode,
        }),
      ).toEqual({ hitDiceRemaining: 0 })
    }
    // And it did not invent or lose hit points on the way past.
    expect(await exactVitals(t, code, goblin, { dmCode })).toEqual({
      current: npcSheet().maxHp,
      max: npcSheet().maxHp,
    })
  })

  test('NaN and the infinities are refused and the pool is untouched', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 5, faces: 8 } }))
    await t.mutation(api.characters.adjustHitDice, { code, characterId: thorin, delta: -2, dmCode })

    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expectKind(
        t.mutation(api.characters.adjustHitDice, { code, characterId: thorin, delta, dmCode }),
        'BadInput',
      )
    }
    expect((await rawVitals(t, thorin))?.hitDiceRemaining).toBe(3)
  })

  test('a fractional delta is rounded rather than stored', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ hitDice: { count: 5, faces: 8 } }))

    expect(
      await t.mutation(api.characters.adjustHitDice, {
        code,
        characterId: thorin,
        delta: -1.6,
        dmCode,
      }),
    ).toEqual({ hitDiceRemaining: 3 })
  })

  test('spending hit dice does not change hit points', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -9, dmCode })

    await t.mutation(api.characters.adjustHitDice, { code, characterId: thorin, delta: -1, dmCode })

    expect(await exactVitals(t, code, thorin)).toEqual({ current: 31, max: 40 })
  })
})

describe('the permission matrix for sheets and vitals', () => {
  /**
   * One game, two seats and three characters: a hero Ana has claimed, a hero
   * nobody is playing, and a monster. Everything below is a statement about who
   * may touch which of those.
   */
  async function table() {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const hers = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40 }))
    const nobodys = await makePc(t, code, 'Balin', pcSheet({ maxHp: 40 }))
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: hers })
    return { t, code, dmCode, ana, ben, hers, nobodys, goblin }
  }

  type Write = { name: string; call: (t: Harness, who: Actor) => Promise<unknown> }

  /** The four mutations that change a sheet or its numbers, parameterised on the caller. */
  function writes(
    code: string,
    characterId: Id<'characters'>,
    sheet: PcSheet | NpcSheet,
  ): Write[] {
    return [
      {
        name: 'updateSheet',
        call: (t, who) => t.mutation(api.characters.updateSheet, { code, characterId, sheet, ...who }),
      },
      {
        name: 'adjustHp',
        call: (t, who) => t.mutation(api.characters.adjustHp, { code, characterId, delta: -1, ...who }),
      },
      {
        name: 'setHp',
        call: (t, who) => t.mutation(api.characters.setHp, { code, characterId, currentHp: 3, ...who }),
      },
      {
        name: 'adjustHitDice',
        call: (t, who) =>
          t.mutation(api.characters.adjustHitDice, { code, characterId, delta: -1, ...who }),
      },
    ]
  }

  test('the DM may read and change any character, hero or monster', async () => {
    const { t, code, dmCode, hers, nobodys, goblin } = await table()
    const targets: [Id<'characters'>, PcSheet | NpcSheet][] = [
      [hers, pcSheet({ maxHp: 40, level: 2 })],
      [nobodys, pcSheet({ maxHp: 40, level: 2 })],
      [goblin, npcSheet({ maxHp: 7, armourClass: 13 })],
    ]

    for (const [characterId, sheet] of targets) {
      expect(await readSheet(t, code, characterId, { dmCode })).toMatchObject({ _id: characterId })
      for (const write of writes(code, characterId, sheet)) {
        await write.call(t, { dmCode })
      }
    }

    expect((await rawCharacter(t, hers))?.sheet).toMatchObject({ level: 2 })
    expect((await rawCharacter(t, goblin))?.sheet).toMatchObject({ armourClass: 13 })
  })

  test('the seat playing a hero may read and change that hero', async () => {
    const { t, code, ana, hers } = await table()

    expect(await readSheet(t, code, hers, { playerId: ana })).toMatchObject({ _id: hers })
    for (const write of writes(code, hers, pcSheet({ maxHp: 40, level: 5 }))) {
      await write.call(t, { playerId: ana })
    }
    expect((await rawCharacter(t, hers))?.sheet).toMatchObject({ level: 5 })
  })

  test('a seat holding nothing may touch nothing', async () => {
    const { t, code, ben, nobodys } = await table()

    expect(await readSheet(t, code, nobodys, { playerId: ben })).toBeNull()
    for (const write of writes(code, nobodys, pcSheet({ maxHp: 40, level: 5 }))) {
      await expectKind(write.call(t, { playerId: ben }), 'CharacterNotYours')
    }
    expect((await rawCharacter(t, nobodys))?.sheet).toEqual(pcSheet({ maxHp: 40 }))
    expect((await rawVitals(t, nobodys))?.currentHp).toBe(40)
  })

  test('a seat may not touch another seat’s hero, and is told who has it', async () => {
    const { t, code, ana, ben, hers } = await table()

    expect(await readSheet(t, code, hers, { playerId: ben })).toBeNull()
    for (const write of writes(code, hers, pcSheet({ maxHp: 40, level: 5 }))) {
      const refusal = await refusalOf(write.call(t, { playerId: ben }))
      expect(refusal.kind).toBe('CharacterNotYours')
      expect(refusal.message).toContain('Ana')
    }
    expect(await heldBy(t, ana)).toBe(hers)
    expect((await rawVitals(t, hers))?.currentHp).toBe(40)
  })

  test('a caller with neither a seat nor the DM code may touch nothing', async () => {
    const { t, code, hers, nobodys } = await table()

    for (const characterId of [hers, nobodys]) {
      expect(await readSheet(t, code, characterId)).toBeNull()
      for (const write of writes(code, characterId, pcSheet({ maxHp: 40, level: 5 }))) {
        await expectKind(write.call(t, {}), 'CharacterNotYours')
      }
    }
    expect((await rawCharacter(t, hers))?.sheet).toEqual(pcSheet({ maxHp: 40 }))
  })

  test('nobody without the DM code may read or change a monster', async () => {
    const { t, code, ana, ben, goblin } = await table()
    const actors: Actor[] = [{}, { playerId: ana }, { playerId: ben }, { dmCode: 'NOPENOPE' }]

    for (const who of actors) {
      expect(await readSheet(t, code, goblin, who)).toBeNull()
      for (const write of writes(code, goblin, npcSheet({ maxHp: 7, armourClass: 13 }))) {
        // CharacterNotFound, not CharacterNotYours: an NPC's existence is itself
        // the spoiler, so the error channel says exactly what a fabricated id says.
        await expectKind(write.call(t, who), 'CharacterNotFound')
      }
    }
    expect((await rawCharacter(t, goblin))?.sheet).toEqual(npcSheet({ maxHp: 7 }))
    expect((await rawVitals(t, goblin))?.currentHp).toBe(7)
  })

  test('the refusal for a monster is identical to the one for a character that never existed', async () => {
    const { t, code, dmCode, ana, goblin } = await table()
    const doomed = await makeCharacter(t, code, 'Doomed')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: doomed })

    const forMonster = await refusalOf(
      t.mutation(api.characters.setHp, { code, characterId: goblin, currentHp: 1, playerId: ana }),
    )
    const forGone = await refusalOf(
      t.mutation(api.characters.setHp, { code, characterId: doomed, currentHp: 1, playerId: ana }),
    )
    expect(forMonster).toEqual(forGone)
  })

  test('the sheet query answers null identically for a monster, a stranger’s hero and a fiction', async () => {
    const { t, code, dmCode, ana, goblin, nobodys } = await table()
    const doomed = await makeCharacter(t, code, 'Doomed')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: doomed })

    for (const characterId of [goblin, nobodys, doomed]) {
      expect(await readSheet(t, code, characterId, { playerId: ana })).toBeNull()
    }
  })

  test('a seat id from another game does not stand in for a claim', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const outsider = await makeSeat(t, beta.code, 'Ben')
    const thorin = await makePc(t, alpha.code, 'Thorin', pcSheet({ maxHp: 30 }))
    const ana = await makeSeat(t, alpha.code, 'Ana')
    await t.mutation(api.characters.claim, { code: alpha.code, playerId: ana, characterId: thorin })

    await expectKind(
      t.mutation(api.characters.setHp, {
        code: alpha.code,
        characterId: thorin,
        currentHp: 1,
        playerId: outsider,
      }),
      'CharacterNotYours',
    )
    expect((await rawVitals(t, thorin))?.currentHp).toBe(30)
  })

  test('releasing a character takes the seat’s write access with it', async () => {
    const { t, code, ana, hers } = await table()

    await t.mutation(api.characters.release, { code, playerId: ana })

    expect(await readSheet(t, code, hers, { playerId: ana })).toBeNull()
    await expectKind(
      t.mutation(api.characters.setHp, { code, characterId: hers, currentHp: 1, playerId: ana }),
      'CharacterNotYours',
    )
  })

  test('the DM assigning a hero elsewhere moves the write access with the claim', async () => {
    const { t, code, dmCode, ana, ben, hers } = await table()

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ben, characterId: hers })

    await t.mutation(api.characters.setHp, {
      code,
      characterId: hers,
      currentHp: 11,
      playerId: ben,
    })
    await expectKind(
      t.mutation(api.characters.setHp, { code, characterId: hers, currentHp: 1, playerId: ana }),
      'CharacterNotYours',
    )
    expect((await rawVitals(t, hers))?.currentHp).toBe(11)
  })

  test('the DM badge on a seat grants nothing without the code', async () => {
    const { t, code, dmCode, ben, goblin, nobodys } = await table()
    // The badge is display-only (invariant 7). Set it directly and confirm it
    // buys exactly nothing.
    await t.run(async (ctx) => await ctx.db.patch('players', ben, { isDm: true }))

    expect(await readSheet(t, code, goblin, { playerId: ben })).toBeNull()
    await expectKind(
      t.mutation(api.characters.setHp, { code, characterId: goblin, currentHp: 1, playerId: ben }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.setHp, { code, characterId: nobodys, currentHp: 1, playerId: ben }),
      'CharacterNotYours',
    )
    // The real code still works, so the badge was the only thing that changed.
    await t.mutation(api.characters.setHp, { code, characterId: goblin, currentHp: 1, dmCode })
    expect((await rawVitals(t, goblin))?.currentHp).toBe(1)
  })

  test('a sheet read against an unknown game code is null rather than a throw', async () => {
    const { t, dmCode, hers } = await table()

    expect(
      await t.query(api.characters.sheet, { code: 'ZZZZZZ', characterId: hers, dmCode }),
    ).toBeNull()
  })
})

describe('characters.list and NPCs', () => {
  test('an NPC is absent for a player and present for the DM', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')
    const dragon = await makeNpc(t, code, dmCode, 'Ancient Red Dragon')

    const asPlayer = await t.query(api.characters.list, { code })
    expect(asPlayer.map((row) => row._id)).toEqual([thorin])
    expect(JSON.stringify(asPlayer)).not.toContain('Dragon')
    expect(JSON.stringify(asPlayer)).not.toContain(dragon)

    const asDm = await t.query(api.characters.list, { code, dmCode })
    expect(asDm.map((row) => row._id)).toEqual([thorin, dragon])
    expect(rowFor(asDm, dragon).kind).toBe('npc')
  })

  test('every row carries a kind, and a sheet-less one says pc', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')

    const list = await t.query(api.characters.list, { code, dmCode })
    expect(rowFor(list, thorin).kind).toBe('pc')
    expect(rowFor(list, legacy).kind).toBe('pc')
    expect(rowFor(list, goblin).kind).toBe('npc')
  })

  test('a wrong DM code on the list is an ordinary player rather than an error', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    await makeCharacter(t, code, 'Thorin')
    await makeNpc(t, code, dmCode, 'Goblin')

    for (const wrong of ['', 'NOPENOPE', dmCode.slice(0, -1)]) {
      const list = await t.query(api.characters.list, { code, dmCode: wrong })
      expect(list.map((row) => row.name)).toEqual(['Thorin'])
    }
  })

  test('the DM code is accepted with stray case and whitespace', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    await makeNpc(t, code, dmCode, 'Goblin')

    const list = await t.query(api.characters.list, { code, dmCode: `  ${dmCode.toLowerCase()} ` })
    expect(list.map((row) => row.name)).toEqual(['Goblin'])
  })

  test('a DM code from another game does not unhide this game’s monsters', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    await makeNpc(t, alpha.code, alpha.dmCode, 'Goblin')

    expect(await t.query(api.characters.list, { code: alpha.code, dmCode: beta.dmCode })).toEqual([])
  })

  test('hiding NPCs does not disturb the order or the holders of the rest', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await makeNpc(t, code, dmCode, 'Goblin')
    const balin = await makeCharacter(t, code, 'Balin')
    await makeNpc(t, code, dmCode, 'Orc')
    const dwalin = await makeCharacter(t, code, 'Dwalin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: balin })

    const list = await t.query(api.characters.list, { code })
    expect(list.map((row) => row._id)).toEqual([thorin, balin, dwalin])
    expect(rowFor(list, balin)).toMatchObject({ claimedByPlayerId: ana, claimedByName: 'Ana' })
  })

  test('renaming an NPC needs the DM code, and the refusal is the missing one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')

    await expectKind(
      t.mutation(api.characters.rename, { code, characterId: goblin, name: 'Hobgoblin' }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.rename, {
        code,
        characterId: goblin,
        name: 'Hobgoblin',
        dmCode: 'NOPENOPE',
      }),
      'CharacterNotFound',
    )
    expect((await rawCharacter(t, goblin))?.name).toBe('Goblin')

    await t.mutation(api.characters.rename, { code, characterId: goblin, name: 'Hobgoblin', dmCode })
    expect((await rawCharacter(t, goblin))?.name).toBe('Hobgoblin')
  })

  test('renaming a player character still needs no DM code at all', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const thorin = await makeCharacter(t, code, 'Thorin')

    await t.mutation(api.characters.rename, { code, characterId: thorin, name: 'Balin' })
    expect((await rawCharacter(t, thorin))?.name).toBe('Balin')
  })

  test('an NPC cannot be claimed, even by the DM', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')

    await expectKind(
      t.mutation(api.characters.claim, { code, playerId: ana, characterId: goblin }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: goblin }),
      'CharacterNotFound',
    )
    expect(await heldBy(t, ana)).toBeNull()
  })
})

describe('players.list never names an NPC', () => {
  test('a seat forced to hold an NPC reports no character name', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')

    // Neither `claim` nor `assign` will do this, which is the point: the filter
    // lives where the payload is built, not only on the two doors into it.
    await t.run(async (ctx) => await ctx.db.patch('players', ana, { characterId: goblin }))

    const seats = await t.query(api.players.list, { code })
    expect(seats.find((seat) => seat._id === ana)?.characterName).toBeNull()
    expect(JSON.stringify(seats)).not.toContain('Goblin')
  })

  test('a hero on the next seat is still named', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const ben = await makeSeat(t, code, 'Ben')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')
    const thorin = await makeCharacter(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: thorin })
    await t.run(async (ctx) => await ctx.db.patch('players', ana, { characterId: goblin }))

    const seats = await t.query(api.players.list, { code })
    expect(seats.find((seat) => seat._id === ben)?.characterName).toBe('Thorin')
    expect(seats.find((seat) => seat._id === ana)?.characterName).toBeNull()
  })

  test('a legacy character with no sheet is still named in the roster', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: legacy })

    const seats = await t.query(api.players.list, { code })
    expect(seats.find((seat) => seat._id === ana)?.characterName).toBe('Milestone One')
  })
})

describe('characters.remove — vitals and tokens', () => {
  test('the vitals row goes with the character', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -5, dmCode })
    expect(await rawVitals(t, thorin)).not.toBeNull()

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    expect(await rawVitals(t, thorin)).toBeNull()
    expect(await t.run(async (ctx) => await ctx.db.query('characterVitals').collect())).toEqual([])
    expect(await t.query(api.characters.vitals, { code, dmCode })).toEqual([])
  })

  test('removing an NPC takes its vitals too and leaves the party’s alone', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))

    await t.mutation(api.characters.remove, { code, dmCode, characterId: goblin })

    expect(await rawVitals(t, goblin)).toBeNull()
    expect((await rawVitals(t, thorin))?.currentHp).toBe(30)
  })

  test('a legacy character with no vitals row is removed without complaint', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    await t.mutation(api.characters.remove, { code, dmCode, characterId: legacy })
    expect(await rawCharacter(t, legacy)).toBeNull()
  })

  test('every token pointing at the character is detached, across every scene', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    const balin = await makePc(t, code, 'Balin', pcSheet({ maxHp: 30 }))
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const cellar = await makeScene(t, code, dmCode, 'Cellar')
    const roof = await makeScene(t, code, dmCode, 'Roof')
    const onCellar = await addToken(t, code, dmCode, cellar, { name: 'Thorin', characterId: thorin })
    const onRoof = await addToken(t, code, dmCode, roof, { name: 'Thorin', characterId: thorin })
    const hidden = await addToken(t, code, dmCode, cellar, {
      name: 'Thorin (illusion)',
      layer: 'dm',
      characterId: thorin,
    })
    const other = await addToken(t, code, dmCode, cellar, { name: 'Balin', characterId: balin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    // The stored rows, not a projection of them — the pointer is what has to be gone.
    for (const tokenId of [onCellar, onRoof, hidden]) {
      const token = await rawToken(t, tokenId)
      expect(token).not.toBeNull()
      expect(token?.characterId).toBeUndefined()
    }
    expect((await rawToken(t, other))?.characterId).toBe(balin)

    const leftovers = await t.run(async (ctx) =>
      (await ctx.db.query('tokens').collect()).filter((token) => token.characterId === thorin),
    )
    expect(leftovers).toEqual([])
    expect(await heldBy(t, ana)).toBeNull()
  })

  test('the detached token survives, keeps its placement, and reports a null character', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    const cellar = await makeScene(t, code, dmCode, 'Cellar')
    const tokenId = await addToken(t, code, dmCode, cellar, { name: 'Thorin', characterId: thorin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    const tokens = await t.query(api.board.tokens, { code, dmCode })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({ _id: tokenId, name: 'Thorin', characterId: null })
    expect(await t.query(api.board.positions, { code, sceneId: cellar, dmCode })).toHaveLength(1)
  })

  test('a detached token becomes the DM’s to move, rather than anybody’s', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })
    const cellar = await makeScene(t, code, dmCode, 'Cellar')
    const tokenId = await addToken(t, code, dmCode, cellar, { characterId: thorin })

    await t.mutation(api.characters.remove, { code, dmCode, characterId: thorin })

    await expectKind(
      t.mutation(api.board.moveToken, {
        code,
        sceneId: cellar,
        tokenId,
        x: 300,
        y: 300,
        settle: true,
        playerId: ana,
      }),
      'TokenNotYours',
    )
    await t.mutation(api.board.moveToken, {
      code,
      sceneId: cellar,
      tokenId,
      x: 300,
      y: 300,
      settle: true,
      dmCode,
    })
  })

  test('a token in another game keeps its own character', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const mine = await makeCharacter(t, alpha.code, 'Thorin')
    const theirs = await makeCharacter(t, beta.code, 'Thorin')
    const scene = await makeScene(t, beta.code, beta.dmCode, 'Theirs')
    const token = await addToken(t, beta.code, beta.dmCode, scene, { characterId: theirs })

    await t.mutation(api.characters.remove, {
      code: alpha.code,
      dmCode: alpha.dmCode,
      characterId: mine,
    })

    expect((await rawToken(t, token))?.characterId).toBe(theirs)
  })

  test('a refused removal detaches nothing', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 30 }))
    const cellar = await makeScene(t, code, dmCode, 'Cellar')
    const tokenId = await addToken(t, code, dmCode, cellar, { characterId: thorin })

    await expectKind(
      t.mutation(api.characters.remove, { code, dmCode: 'NOPENOPE', characterId: thorin }),
      'NotDm',
    )

    expect((await rawToken(t, tokenId))?.characterId).toBe(thorin)
    expect(await rawVitals(t, thorin)).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Milestone 4: the premade library, levelling, rests, and who may change what
// ---------------------------------------------------------------------------
//
// The fixtures below deliberately restate this file's own helpers rather than
// abstracting over them, for the reason given at the top of vitals.test.ts: every
// safe home for a shared helper is either deployed as a Convex module or swept by
// the leak guard.
//
// THE NUMBERS ARE THE LIBRARY'S, WRITTEN OUT. A Human Fighter is 12 hit points at
// level 1, 20 at 2, 28 at 3, 36 at 4 and 44 at 5, on 1 to 5 d10s. Deriving them by
// calling `librarySheet` here would make every assertion below tautological — the
// test would agree with the resolver whatever either of them said. Written out, a
// change to the content or to the arithmetic has to be looked at by a person.

const FIGHTER_MAX_HP: Record<number, number> = { 1: 12, 2: 20, 3: 28, 4: 36, 5: 44 }

/** The selections a premade character stores. A level 1 Human Fighter by default. */
function presetSheet(overrides: Partial<PresetSheet> = {}): PresetSheet {
  return {
    kind: 'preset',
    race: 'human',
    classKey: 'fighter',
    subclassKey: null,
    level: 1,
    locked: false,
    ...overrides,
  }
}

async function makePreset(
  t: Harness,
  code: string,
  name: string,
  sheet: PresetSheet = presetSheet(),
) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet })
  return characterId
}

/** The stored `sheet` field, insisting it is a set of selections rather than a sheet. */
async function storedPreset(t: Harness, characterId: Id<'characters'>): Promise<PresetSheet> {
  const stored = (await rawCharacter(t, characterId))?.sheet
  if (stored?.kind !== 'preset') {
    throw new Error(`expected stored selections, got ${JSON.stringify(stored?.kind)}`)
  }
  return stored
}

/** The resolved sheet as the panel receives it, insisting it resolved to a hero. */
async function resolvedSheet(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
  who: Actor = {},
): Promise<PcSheet> {
  const payload = await readSheet(t, code, characterId, who)
  if (!payload) throw new Error('no sheet came back at all')
  if (payload.sheet.kind !== 'pc') throw new Error(`resolved to a ${payload.sheet.kind}`)
  return payload.sheet
}

/**
 * A premade character claimed by Ana, with Ben sitting at the same table.
 *
 * Both seats exist in every case, because most of what is under test is the
 * difference between them: the claiming seat, another seat, the DM and nobody are
 * four different answers and three of them are refusals.
 */
async function presetFixture(t: Harness, sheet: PresetSheet = presetSheet()) {
  const game = await makeGame(t)
  const ana = await makeSeat(t, game.code, 'Ana')
  const ben = await makeSeat(t, game.code, 'Ben')
  const characterId = await makePreset(t, game.code, 'Thorin', sheet)
  await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId })
  return { ...game, ana, ben, characterId }
}

function update(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
  sheet: StoredSheet,
  who: Actor = {},
) {
  return t.mutation(api.characters.updateSheet, { code, characterId, sheet, ...who })
}

describe('characters.create — a character built from the library', () => {
  test('the document stores the selections, and the query resolves them', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const selections = presetSheet({ race: 'human', classKey: 'fighter', level: 1 })
    const thorin = await makePreset(t, code, 'Thorin', selections)

    // Nothing derived is stored: no maximum, no hit dice, no feats.
    expect(await storedPreset(t, thorin)).toEqual(selections)

    const payload = await readSheet(t, code, thorin, { dmCode })
    expect(payload?.preset).toEqual(selections)
    expect(payload?.sheet).toMatchObject({
      kind: 'pc',
      level: 1,
      className: 'Fighter',
      armourClass: 18,
      maxHp: FIGHTER_MAX_HP[1],
      hitDice: { count: 1, faces: 10 },
      speed: SPEED_FEET,
    })
    // The library's allocation of the standard array, not the flat tens a
    // hand-built sheet starts on.
    expect((payload!.sheet as PcSheet).abilities).toEqual({
      str: 15,
      dex: 13,
      con: 14,
      int: 8,
      wis: 12,
      cha: 10,
    })
    // A resolved sheet always carries both optional fields, whatever the stored
    // shape does — that is what `skillProficienciesOf` and `speedOf` default for.
    expect((payload!.sheet as PcSheet).skillProficiencies).toEqual({
      ...noSkills(),
      athletics: true,
      perception: true,
    })
  })

  test('the kit and the levelling note travel beside the sheet, and only for a premade one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(
      t,
      code,
      'Thorin',
      presetSheet({ level: 3, subclassKey: 'champion' }),
    )
    const byHand = await makePc(t, code, 'Handmade', pcSheet())

    const extras = (await readSheet(t, code, thorin, { dmCode }))?.extras
    expect(extras?.equipment.length).toBeGreaterThan(0)
    expect(extras?.levellingNotes.length).toBeGreaterThan(0)
    // Neither is on the sheet itself — they are not rules, and nothing rolls a kit.
    expect(await readSheet(t, code, thorin, { dmCode })).toMatchObject({ sheet: { kind: 'pc' } })
    expect((await readSheet(t, code, byHand, { dmCode }))?.extras).toBeNull()
  })

  test('the vitals row is written at the library’s maximum, not at a default', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const thorin = await makePreset(
      t,
      code,
      'Thorin',
      presetSheet({ level: 3, subclassKey: 'champion' }),
    )

    // 28, not `defaultPcSheet().maxHp` — the number has to come from the library
    // at insert time, because the stored document has no maximum on it at all.
    expect(defaultPcSheet().maxHp).not.toBe(FIGHTER_MAX_HP[3])
    expect(await rawVitals(t, thorin)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[3],
      hitDiceRemaining: 3,
    })
    expect(await exactVitals(t, code, thorin)).toEqual({
      current: FIGHTER_MAX_HP[3],
      max: FIGHTER_MAX_HP[3],
    })
  })

  test('a premade character is an ordinary player character to everybody', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makePreset(t, code, 'Thorin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    // No DM code anywhere: a preset resolves to `pc`, so it is listed, claimable
    // and readable exactly as a hand-built hero is.
    expect(rowFor(await t.query(api.characters.list, { code }), thorin)).toMatchObject({
      kind: 'pc',
      claimedByName: 'Ana',
    })
    expect((await readSheet(t, code, thorin, { playerId: ana }))?.sheet.kind).toBe('pc')
  })

  test('an archetype cannot be chosen before level 2', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        name: 'Thorin',
        sheet: presetSheet({ level: 1, subclassKey: 'champion' }),
      }),
      'subclassKey',
    )
  })

  test('an archetype belonging to another class is refused', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        name: 'Thorin',
        sheet: presetSheet({ classKey: 'fighter', level: 3, subclassKey: 'berserker' }),
      }),
      'subclassKey',
    )
  })

  /**
   * The documented convex-test gap, restated for the two new enums.
   *
   * Convex applies *argument* validators, so a race or a class outside the union
   * never reaches a handler — which means the refusal is a bare `Error` rather than
   * the `ConvexError` every deliberate refusal in this file carries. Milestone 3
   * hit exactly this with a d7 hit die.
   */
  test('a race or a class outside the union is refused at the argument boundary', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    for (const sheet of [
      { ...presetSheet(), race: 'gnome' },
      { ...presetSheet(), classKey: 'warlock' },
    ]) {
      const thrown = await t
        .mutation(api.characters.create, {
          code,
          name: 'Thorin',
          sheet: sheet as unknown as PresetSheet,
        })
        .then(
          () => null,
          (error: unknown) => error,
        )
      expect(thrown, 'an unknown enum member was accepted').not.toBeNull()
      expect(thrown).not.toBeInstanceOf(ConvexError)
    }

    expect(await t.query(api.characters.list, { code })).toEqual([])
  })

  /**
   * Every selection the pickers can offer, through the real mutation.
   *
   * `create` validates the *resolved* sheet as well as the stored one, so this is
   * the check that the content and the resolver agree everywhere rather than on the
   * one combination a hand-written fixture happens to use: an ability score pushed
   * past 30 by a race bonus, a duplicate entry id where a class's feat and spell
   * share a name, a roll spec that drifted — each of them would land here.
   */
  test('every race, class, archetype and level resolves into a storable sheet', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(t, code, 'Sweep')

    for (const classKey of CLASS_KEYS) {
      const definition = CLASSES.find((entry) => entry.key === classKey)!
      for (const subclass of definition.subclasses) {
        for (const level of [2, 3, 4, 5]) {
          for (const race of RACE_KEYS) {
            const sheet = presetSheet({ race, classKey, subclassKey: subclass.key, level })
            await update(t, code, thorin, sheet, { dmCode })

            const resolved = await resolvedSheet(t, code, thorin, { dmCode })
            const where = `${race}/${classKey}/${subclass.key}/${level}`
            expect(resolved.className, where).toContain(subclass.name)
            expect(resolved.maxHp, where).toBeGreaterThan(0)
            // The race's own trait is on every sheet, whether or not it moves a
            // number — a Halfling's Lucky is the whole of what makes them one.
            expect(
              resolved.feats.map((entry) => entry.id),
              where,
            ).toContain(`race:${race}`)
            // Ids are a React key set and Milestone 5's roll targets, merged
            // across both lists.
            const ids = [...resolved.feats, ...resolved.spells].map((entry) => entry.id)
            expect(new Set(ids).size, `${where} repeated an entry id`).toBe(ids.length)
          }
        }
      }
    }
  })

  test('level 1 with no archetype resolves for every race and class', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(t, code, 'Sweep')

    for (const classKey of CLASS_KEYS) {
      for (const race of RACE_KEYS) {
        await update(t, code, thorin, presetSheet({ race, classKey, level: 1 }), { dmCode })
        const resolved = await resolvedSheet(t, code, thorin, { dmCode })
        expect(resolved.level, `${race}/${classKey}`).toBe(1)
        expect(resolved.hitDice.count, `${race}/${classKey}`).toBe(1)
      }
    }
  })
})

describe('characters.updateSheet — the permission split over a premade character', () => {
  /**
   * THE MATRIX. Four callers, and the difference between them is the whole of what
   * `requirePresetChangeAllowed` and `requireEditableCharacter` decide between.
   *
   * `owner` is the seat holding the character, `other` is a second seat that is not,
   * and `anonymous` is a client that sent no identification at all — which is not
   * the same as `other`, because it is refused a step earlier and with different
   * wording. Each case rebuilds the game, so a refusal in one cannot be a leftover
   * write in the next.
   */
  type Caller = 'dm' | 'owner' | 'other' | 'anonymous'

  function actorFor(
    who: Caller,
    fixture: Awaited<ReturnType<typeof presetFixture>>,
  ): Actor {
    if (who === 'dm') return { dmCode: fixture.dmCode }
    if (who === 'owner') return { playerId: fixture.ana }
    if (who === 'other') return { playerId: fixture.ben }
    return {}
  }

  /** The refusal a caller with no business here gets, before any preset rule runs. */
  const NOT_YOURS: Record<'other' | 'anonymous', string> = {
    other: 'Ana is playing that character.',
    anonymous: 'Only the DM can change that character.',
  }

  /**
   * LEVEL IS THE DM'S, AND A PLAYER'S WRITE CANNOT MOVE IT.
   *
   * Note the shape of the guarantee, because the implementation states it in an
   * unusual way: a player asking for a different level is **not** refused, it is
   * *preserved* — the rest of their save lands and the level comes back off the
   * stored document. The level is a field their form displays and cannot edit, so a
   * client sends it back as it received it, and refusing a difference would fail an
   * ordinary save whenever the two happened to disagree. What is asserted here is
   * therefore the outcome rather than the mechanism: after any player write, the
   * stored level is the one the DM last set.
   */
  test('a player’s write can never move the level, and the DM’s can', async () => {
    for (const who of ['dm', 'owner', 'other', 'anonymous'] as Caller[]) {
      const t = convexTest(schema, modules)
      const fixture = await presetFixture(t, presetSheet({ level: 1 }))
      // A race change is something this player *is* allowed, sent in the same call
      // as the level they are not — so a passing test cannot be the whole write
      // being dropped on the floor.
      const wanted = presetSheet({ level: 3, race: 'elf' })

      if (who === 'dm') {
        await update(t, fixture.code, fixture.characterId, wanted, actorFor(who, fixture))
        expect(await storedPreset(t, fixture.characterId)).toMatchObject({
          level: 3,
          race: 'elf',
        })
        continue
      }

      if (who === 'owner') {
        await update(t, fixture.code, fixture.characterId, wanted, actorFor(who, fixture))
        expect(await storedPreset(t, fixture.characterId), who).toMatchObject({
          level: 1,
          race: 'elf',
        })
        // And the sheet everybody reads followed the level that is stored, not the
        // one that was asked for.
        expect(
          (await resolvedSheet(t, fixture.code, fixture.characterId, { playerId: fixture.ana }))
            .maxHp,
          who,
        ).toBe(FIGHTER_MAX_HP[1])
        continue
      }

      const refusal = await refusalOf(
        update(t, fixture.code, fixture.characterId, wanted, actorFor(who, fixture)),
      )
      expect(refusal.kind, who).toBe('CharacterNotYours')
      expect(refusal.message, who).toBe(NOT_YOURS[who])
      // Nothing moved at all, which is the other half of a refusal.
      expect(await storedPreset(t, fixture.characterId), who).toMatchObject({
        level: 1,
        race: 'human',
      })
    }
  })

  test('a player cannot level themselves by any route through updateSheet', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 2, subclassKey: 'champion' }))
    const stored = await storedPreset(t, fixture.characterId)

    for (const level of [5, 20, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      await update(
        t,
        fixture.code,
        fixture.characterId,
        { ...stored, level },
        { playerId: fixture.ana },
      ).catch(() => undefined)
      expect((await storedPreset(t, fixture.characterId)).level, String(level)).toBe(2)
    }
  })

  test('a locked character keeps its race, class and archetype against its own player', async () => {
    const locked = presetSheet({ level: 3, subclassKey: 'champion', locked: true })
    const changes: [string, PresetSheet][] = [
      ['race', { ...locked, race: 'elf' }],
      ['class', { ...locked, classKey: 'wizard', subclassKey: 'evocation' }],
      ['archetype', { ...locked, subclassKey: 'battle-master' }],
    ]

    for (const [label, wanted] of changes) {
      const t = convexTest(schema, modules)
      const fixture = await presetFixture(t, locked)

      const refusal = await refusalOf(
        update(t, fixture.code, fixture.characterId, wanted, { playerId: fixture.ana }),
      )
      expect(refusal.kind, label).toBe('CharacterLocked')
      expect(refusal.message, label).toBe(
        'Your race, class and archetype are set. Ask the DM to unlock them.',
      )
      expect(await storedPreset(t, fixture.characterId), label).toEqual(locked)

      // The DM is allowed the same change, on the same locked character.
      await update(t, fixture.code, fixture.characterId, wanted, { dmCode: fixture.dmCode })
      expect(await storedPreset(t, fixture.characterId), label).toEqual(wanted)
    }
  })

  test('an unlocked character may be rebuilt by the player playing it', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 3, subclassKey: 'champion' }))

    const wanted = presetSheet({
      race: 'elf',
      classKey: 'rogue',
      subclassKey: 'assassin',
      level: 3,
    })
    await update(t, fixture.code, fixture.characterId, wanted, { playerId: fixture.ana })

    expect(await storedPreset(t, fixture.characterId)).toEqual(wanted)
    // And the sheet the panel draws followed the selections, without anybody
    // typing a number.
    const resolved = await resolvedSheet(t, fixture.code, fixture.characterId, {
      playerId: fixture.ana,
    })
    expect(resolved.className).toBe('Rogue (Assassin)')
    expect(resolved.feats.map((entry) => entry.id)).toContain('race:elf')
  })

  test('a player may commit to their selections but may not undo the lock', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 1, locked: false }))

    // Locking is theirs: committing is the player's own decision.
    await update(t, fixture.code, fixture.characterId, presetSheet({ locked: true }), {
      playerId: fixture.ana,
    })
    expect((await storedPreset(t, fixture.characterId)).locked).toBe(true)

    // Unlocking is not — and this is the one thing a player is genuinely told
    // "no" about, because a refusal here is information they need: somebody has to
    // unlock them.
    const refusal = await refusalOf(
      update(t, fixture.code, fixture.characterId, presetSheet({ locked: false }), {
        playerId: fixture.ana,
      }),
    )
    expect(refusal.kind).toBe('CharacterLocked')
    expect(refusal.message).toBe(
      'Your race, class and archetype are set. Ask the DM to unlock them.',
    )
    expect((await storedPreset(t, fixture.characterId)).locked).toBe(true)

    // Saving a locked character unchanged is not an unlock attempt and is allowed,
    // so an ordinary save does not fail merely because the lock is on.
    await update(t, fixture.code, fixture.characterId, presetSheet({ locked: true }), {
      playerId: fixture.ana,
    })
    expect((await storedPreset(t, fixture.characterId)).locked).toBe(true)

    // The DM can, through `updateSheet` or through the mutation that exists for it.
    await t.mutation(api.characters.setUnlocked, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId: fixture.characterId,
      locked: false,
    })
    expect((await storedPreset(t, fixture.characterId)).locked).toBe(false)

    // And now the player may change what the lock was protecting.
    await update(t, fixture.code, fixture.characterId, presetSheet({ race: 'goliath' }), {
      playerId: fixture.ana,
    })
    expect((await storedPreset(t, fixture.characterId)).race).toBe('goliath')
  })

  /**
   * Overrides are the DM's thumb on the scale, and a player's write cannot touch
   * them — stated the same way the level is: the stored value is taken, whatever
   * arrived. So the assertions are on the document afterwards rather than on a
   * refusal, and the interesting cases are the three ways a client could get it
   * wrong — inventing one, editing one, and dropping one.
   */
  test('a player’s write can neither invent, edit nor drop an override', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t)
    const overrides: PresetOverrides = { armourClass: 21, maxHp: 60 }

    // Inventing one does nothing, and does not stop the rest of the save landing.
    await update(
      t,
      fixture.code,
      fixture.characterId,
      presetSheet({ overrides, race: 'elf' }),
      { playerId: fixture.ana },
    )
    expect(await storedPreset(t, fixture.characterId)).toMatchObject({ race: 'elf' })
    expect((await storedPreset(t, fixture.characterId)).overrides).toBeUndefined()

    // The DM sets one, and it reaches the sheet everybody reads.
    await update(t, fixture.code, fixture.characterId, presetSheet({ overrides, race: 'elf' }), {
      dmCode: fixture.dmCode,
    })
    const asOwner = () =>
      resolvedSheet(t, fixture.code, fixture.characterId, { playerId: fixture.ana })
    expect(await asOwner()).toMatchObject({
      armourClass: 21,
      maxHp: 60,
    })

    // A player round-tripping the `preset` they were sent keeps it, which is the
    // ordinary save and the one that must not fail.
    const stored = await storedPreset(t, fixture.characterId)
    await update(
      t,
      fixture.code,
      fixture.characterId,
      { ...stored, race: 'halfling' },
      { playerId: fixture.ana },
    )
    expect(await storedPreset(t, fixture.characterId)).toMatchObject({ race: 'halfling' })
    expect((await storedPreset(t, fixture.characterId)).overrides).toEqual(overrides)

    // Editing it, or quietly dropping it, changes nothing either.
    for (const attempt of [
      { ...stored, overrides: { ...overrides, armourClass: 40, maxHp: 999 } },
      { ...stored, overrides: undefined },
    ]) {
      await update(t, fixture.code, fixture.characterId, attempt, { playerId: fixture.ana })
      expect((await storedPreset(t, fixture.characterId)).overrides).toEqual(overrides)
    }
    expect(await asOwner()).toMatchObject({ armourClass: 21, maxHp: 60 })
  })

  /**
   * `requireUsableSheet` runs `sheetProblem` over the *resolved* sheet as well as
   * the stored one, and this is the case that needs it: a preset holds no numbers,
   * so the only place an override that lands the armour class at 999 can be caught
   * is after the library, the race and the override have been put together.
   */
  test('an override that pushes the resolved sheet out of bounds is refused', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t)

    await expectSheetProblem(
      update(t, fixture.code, fixture.characterId, presetSheet({ overrides: { armourClass: 999 } }), {
        dmCode: fixture.dmCode,
      }),
      'armourClass',
    )
    await expectSheetProblem(
      update(t, fixture.code, fixture.characterId, presetSheet({ overrides: { maxHp: 0 } }), {
        dmCode: fixture.dmCode,
      }),
      'maxHp',
    )
    // An extra feat is an ordinary entry and gets the ordinary checks — an override
    // is a place a bad roll spec can enter just as easily as a feat list is.
    await expectSheetProblem(
      update(
        t,
        fixture.code,
        fixture.characterId,
        presetSheet({
          overrides: { extraFeats: [sheetEntry({ id: 'plot:x', roll: '99d99' })] },
        }),
        { dmCode: fixture.dmCode },
      ),
      'overrides.extraFeats[0].roll',
    )
    expect((await storedPreset(t, fixture.characterId)).overrides).toBeUndefined()
  })

  test('the DM can take an override away again, and the sheet goes back to the library', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(
      t,
      presetSheet({ level: 3, subclassKey: 'champion', overrides: { maxHp: 60 } }),
    )

    await update(
      t,
      fixture.code,
      fixture.characterId,
      presetSheet({ level: 3, subclassKey: 'champion' }),
      { dmCode: fixture.dmCode },
    )
    expect((await storedPreset(t, fixture.characterId)).overrides).toBeUndefined()
    expect(
      (await resolvedSheet(t, fixture.code, fixture.characterId, { dmCode: fixture.dmCode })).maxHp,
    ).toBe(FIGHTER_MAX_HP[3])
  })

  test('the DM may change level, selections and overrides of a locked character at once', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ locked: true }))

    const wanted = presetSheet({
      race: 'dragonborn',
      classKey: 'cleric',
      subclassKey: 'light',
      level: 4,
      locked: true,
      overrides: { armourClass: 20 },
    })
    await update(t, fixture.code, fixture.characterId, wanted, { dmCode: fixture.dmCode })
    expect(await storedPreset(t, fixture.characterId)).toEqual(wanted)
  })

  test('a character nobody is playing belongs to the DM', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const thorin = await makePreset(t, code, 'Thorin')

    const refusal = await refusalOf(
      update(t, code, thorin, presetSheet({ race: 'elf' }), { playerId: ana }),
    )
    expect(refusal.kind).toBe('CharacterNotYours')
    expect(refusal.message).toBe(
      'Nobody is playing that character yet, so only the DM can change it.',
    )
    await update(t, code, thorin, presetSheet({ race: 'elf' }), { dmCode })
    expect((await storedPreset(t, thorin)).race).toBe('elf')
  })

  test('a premade character cannot be turned into a monster, nor a monster into one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(t, code, 'Thorin')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))

    const toMonster = await refusalOf(update(t, code, thorin, npcSheet(), { dmCode }))
    expect(toMonster.kind).toBe('BadInput')
    expect(toMonster.message).toBe('A character cannot change between a player character and an NPC.')

    const toHero = await refusalOf(update(t, code, goblin, presetSheet(), { dmCode }))
    expect(toHero.kind).toBe('BadInput')
    expect(toHero.message).toBe('A character cannot change between a player character and an NPC.')

    // Neither document moved, and the monster is still nobody's business but the
    // DM's.
    expect((await storedPreset(t, thorin)).kind).toBe('preset')
    expect((await rawCharacter(t, goblin))?.sheet).toEqual(npcSheet({ maxHp: 7 }))
    expect(await t.query(api.characters.list, { code })).toHaveLength(1)
  })

  /**
   * Swapping between the two storage forms is allowed on purpose — a hand-built
   * hero picking a premade sheet is an ordinary thing to want, and the check is on
   * monster-ness rather than on the stored kind.
   */
  test('a hand-built hero may be rebuilt from the library, and keeps its vitals row', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ maxHp: 40, className: 'By hand' }))
    await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -30, dmCode })

    await update(t, code, thorin, presetSheet({ level: 2, subclassKey: 'champion' }), { dmCode })

    expect((await storedPreset(t, thorin)).classKey).toBe('fighter')
    // 10 hit points survive the swap; the maximum is now the library's.
    expect(await exactVitals(t, code, thorin, { dmCode })).toEqual({
      current: 10,
      max: FIGHTER_MAX_HP[2],
    })
  })
})

describe('characters.setLevel', () => {
  test('the DM code is the only thing that authorises it', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t)

    await expectKind(
      t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: 'NOPENOPE',
        characterId: fixture.characterId,
        level: 5,
      }),
      'NotDm',
    )
    // The badge in the roster is not the code, and the seat playing the character
    // has no way to award itself a level.
    await t.run(async (ctx) => {
      await ctx.db.patch('players', fixture.ana, { isDm: true })
    })
    await expectKind(
      t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: '',
        characterId: fixture.characterId,
        level: 5,
      }),
      'NotDm',
    )
    expect((await storedPreset(t, fixture.characterId)).level).toBe(1)

    await t.mutation(api.characters.setLevel, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId: fixture.characterId,
      level: 5,
    })
    expect((await storedPreset(t, fixture.characterId)).level).toBe(5)
  })

  test('dropping below level 2 clears the archetype, and level 2 keeps it', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 5, subclassKey: 'champion' }))
    const setLevel = (level: number) =>
      t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.characterId,
        level,
      })

    await setLevel(SUBCLASS_LEVEL)
    // The stored document, not the response — an archetype that survived only in a
    // payload would reapply itself on the way back up.
    expect(await storedPreset(t, fixture.characterId)).toMatchObject({
      level: 2,
      subclassKey: 'champion',
    })

    await setLevel(1)
    expect(await storedPreset(t, fixture.characterId)).toMatchObject({
      level: 1,
      subclassKey: null,
    })

    // And back up: the archetype is genuinely gone rather than hidden, so the
    // character is level 3 with no archetype until somebody chooses again.
    await setLevel(3)
    expect(await storedPreset(t, fixture.characterId)).toMatchObject({
      level: 3,
      subclassKey: null,
    })
    expect(
      (await resolvedSheet(t, fixture.code, fixture.characterId, { dmCode: fixture.dmCode }))
        .className,
    ).toBe('Fighter')
  })

  test('a level moves the whole sheet without anybody editing one', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 2, subclassKey: 'champion' }))
    const at = async (level: number) => {
      await t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.characterId,
        level,
      })
      return await resolvedSheet(t, fixture.code, fixture.characterId, { playerId: fixture.ana })
    }

    const two = await at(2)
    expect(two).toMatchObject({ maxHp: FIGHTER_MAX_HP[2], hitDice: { count: 2, faces: 10 } })
    expect(two.feats.map((entry) => entry.id)).not.toContain('lib:extra-attack')

    const five = await at(5)
    expect(five).toMatchObject({ maxHp: FIGHTER_MAX_HP[5], hitDice: { count: 5, faces: 10 } })
    // Features arrive with the level, out of the library rather than out of a form.
    expect(five.feats.map((entry) => entry.id)).toContain('lib:extra-attack')
    expect(five.feats.length).toBeGreaterThan(two.feats.length)
    // Level 3 is where this build takes its ability score improvement.
    expect(five.abilities.str).toBe(17)
    expect(two.abilities.str).toBe(15)
  })

  test('a level past the library’s last one stops gaining rather than falling back', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 5, subclassKey: 'champion' }))
    await t.mutation(api.characters.setLevel, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId: fixture.characterId,
      level: MAX_LEVEL,
    })

    const resolved = await resolvedSheet(t, fixture.code, fixture.characterId, {
      dmCode: fixture.dmCode,
    })
    expect((await storedPreset(t, fixture.characterId)).level).toBe(MAX_LEVEL)
    expect(resolved.level).toBe(MAX_LEVEL)
    expect(resolved.maxHp).toBe(FIGHTER_MAX_HP[5])
    expect(resolved.hitDice).toEqual({ count: 5, faces: 10 })
  })

  /**
   * THE PROMISE THE DESIGN MAKES. An override is the DM's final word, applied after
   * the library and after the race — so awarding a level five minutes after bumping
   * a boss-fight armour class must not quietly undo it.
   */
  test('a DM override survives every level change, in both directions', async () => {
    const t = convexTest(schema, modules)
    const overrides: PresetOverrides = {
      armourClass: 21,
      maxHp: 60,
      speed: 45,
      abilities: { str: 20, dex: 11, con: 16, int: 9, wis: 12, cha: 13 },
      extraFeats: [
        sheetEntry({ id: 'plot:wyrmglass', name: 'Wyrmglass Shard', roll: '2d6', text: 'A shard.' }),
      ],
    }
    const fixture = await presetFixture(
      t,
      presetSheet({ level: 2, subclassKey: 'champion', overrides }),
    )

    for (const level of [3, 5, 4, 2, 5]) {
      await t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.characterId,
        level,
      })

      expect((await storedPreset(t, fixture.characterId)).overrides, `level ${level}`).toEqual(
        overrides,
      )
      const resolved = await resolvedSheet(t, fixture.code, fixture.characterId, {
        dmCode: fixture.dmCode,
      })
      expect(resolved, `level ${level}`).toMatchObject({
        armourClass: 21,
        maxHp: 60,
        speed: 45,
        abilities: overrides.abilities,
      })
      // Appended, not replacing: the plot item sits beside whatever the level just
      // handed over.
      expect(resolved.feats.map((entry) => entry.id), `level ${level}`).toContain('plot:wyrmglass')
      expect(resolved.feats.map((entry) => entry.id), `level ${level}`).toContain('lib:second-wind')
    }
  })

  test('levelling a hand-built character or a monster says what to do instead', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet({ level: 2 }))
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    for (const characterId of [thorin, goblin, legacy]) {
      const refusal = await refusalOf(
        t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 4 }),
      )
      expect(refusal.kind).toBe('BadInput')
      expect(refusal.message).toBe(
        'That character is not built from the library, so edit its sheet instead.',
      )
    }

    // Nothing was rewritten on the way past.
    expect((await rawCharacter(t, thorin))?.sheet).toEqual(pcSheet({ level: 2 }))
    expect((await rawCharacter(t, legacy))?.sheet).toBeUndefined()
  })

  test('unlocking a character that is not built from the library is refused too', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet())

    const refusal = await refusalOf(
      t.mutation(api.characters.setUnlocked, {
        code,
        dmCode,
        characterId: thorin,
        locked: false,
      }),
    )
    expect(refusal.kind).toBe('BadInput')
    expect(refusal.message).toBe('That character is not built from the library.')
  })

  test('a level outside 1 to 20 is refused, including the values a form produces', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 3, subclassKey: 'champion' }))

    // `NaN` is what an emptied number input sends, and it is a perfectly valid
    // float64 — so it reaches the handler and has to be refused there rather than
    // being stored to poison every comparison made against it afterwards.
    for (const level of [0, -1, MAX_LEVEL + 1, Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      await expectSheetProblem(
        t.mutation(api.characters.setLevel, {
          code: fixture.code,
          dmCode: fixture.dmCode,
          characterId: fixture.characterId,
          level,
        }),
        'level',
      )
      expect(await storedPreset(t, fixture.characterId), String(level)).toMatchObject({
        level: 3,
        subclassKey: 'champion',
      })
    }

    // Both ends of the range are accepted, so the refusals above are about the
    // bound rather than about the check being on at all.
    for (const level of [MIN_LEVEL, MAX_LEVEL]) {
      await t.mutation(api.characters.setLevel, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.characterId,
        level,
      })
      expect((await storedPreset(t, fixture.characterId)).level).toBe(level)
    }
  })

  test('setLevel refuses a character in another game', async () => {
    const t = convexTest(schema, modules)
    const alpha = await makeGame(t, 'Alpha')
    const beta = await makeGame(t, 'Beta', 'Ben')
    const theirs = await makePreset(t, beta.code, 'Thorin')

    await expectKind(
      t.mutation(api.characters.setLevel, {
        code: alpha.code,
        dmCode: alpha.dmCode,
        characterId: theirs,
        level: 4,
      }),
      'CharacterNotFound',
    )
    expect((await storedPreset(t, theirs)).level).toBe(1)
  })
})

describe('hit points against a resolved sheet', () => {
  /**
   * THE CASE MOST LIKELY TO BE WRONG. A preset stores no maximum, so the re-clamp
   * in `writeSheet` has to resolve the *new* selections to find one — and levelling
   * down is precisely when the maximum moves underneath a character who is standing
   * on more hit points than the new sheet allows.
   */
  test('levelling down re-clamps hit points and hit dice against the new sheet', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 5, subclassKey: 'champion' }))
    const { code, dmCode, characterId } = fixture

    await t.mutation(api.characters.adjustHp, { code, characterId, delta: -6, dmCode })
    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: 38,
      max: FIGHTER_MAX_HP[5],
    })

    await t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 1 })

    // 38 out of a maximum of 12 would draw a health bar past the end of itself and
    // hand a player a band computed from a ratio greater than one.
    expect(await rawVitals(t, characterId)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[1],
      hitDiceRemaining: 1,
    })
    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: FIGHTER_MAX_HP[1],
      max: FIGHTER_MAX_HP[1],
    })
  })

  test('levelling up raises the ceiling without healing anybody', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 1 }))
    const { code, dmCode, characterId } = fixture

    await t.mutation(api.characters.adjustHp, { code, characterId, delta: -8, dmCode })
    await t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 5 })
    await update(t, code, characterId, presetSheet({ level: 5, subclassKey: 'champion' }), {
      dmCode,
    })

    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: 4,
      max: FIGHTER_MAX_HP[5],
    })
    // Spent hit dice are not minted by a level either — one was all it had.
    expect((await rawVitals(t, characterId))?.hitDiceRemaining).toBe(1)
  })

  test('a Dwarf’s maximum is the library’s plus its level, and the clamp follows it', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(
      t,
      presetSheet({ race: 'dwarf', level: 3, subclassKey: 'champion' }),
    )
    const { code, dmCode, characterId } = fixture
    const dwarfMax = FIGHTER_MAX_HP[3] + 3

    expect(await rawVitals(t, characterId)).toMatchObject({ currentHp: dwarfMax })
    expect(await resolvedSheet(t, code, characterId, { dmCode })).toMatchObject({
      maxHp: dwarfMax,
    })

    // The clamp is against the raced maximum, not the library's.
    expect(
      await t.mutation(api.characters.setHp, { code, characterId, currentHp: 500, dmCode }),
    ).toEqual({ currentHp: dwarfMax })
    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId, delta: -500, dmCode }),
    ).toEqual({ currentHp: 0 })

    // And it moves with the level, one point at a time.
    await t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 5 })
    expect((await resolvedSheet(t, code, characterId, { dmCode })).maxHp).toBe(
      FIGHTER_MAX_HP[5] + 5,
    )
  })

  test('a DM override of the maximum wins over the race and the library', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(
      t,
      presetSheet({
        race: 'dwarf',
        level: 3,
        subclassKey: 'champion',
        overrides: { maxHp: 25 },
      }),
    )
    const { code, dmCode, characterId } = fixture

    expect(await rawVitals(t, characterId)).toMatchObject({ currentHp: 25 })
    expect(
      await t.mutation(api.characters.setHp, { code, characterId, currentHp: 999, dmCode }),
    ).toEqual({ currentHp: 25 })
  })

  test('the player playing a premade character may take damage on it, and another seat may not', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 3, subclassKey: 'champion' }))
    const { code, characterId, ana, ben } = fixture

    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId, delta: -5, playerId: ana }),
    ).toEqual({ currentHp: FIGHTER_MAX_HP[3] - 5 })

    await expectKind(
      t.mutation(api.characters.adjustHp, { code, characterId, delta: -5, playerId: ben }),
      'CharacterNotYours',
    )
    expect((await rawVitals(t, characterId))?.currentHp).toBe(FIGHTER_MAX_HP[3] - 5)
  })
})

describe('long rest and once-per-rest abilities', () => {
  test('a long rest restores hit points, hit dice and spent abilities in one call', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(
      t,
      presetSheet({ race: 'human', level: 5, subclassKey: 'champion' }),
    )
    const { code, characterId, ana } = fixture

    await t.mutation(api.characters.adjustHp, { code, characterId, delta: -20, playerId: ana })
    await t.mutation(api.characters.adjustHitDice, {
      code,
      characterId,
      delta: -3,
      playerId: ana,
    })
    await t.mutation(api.characters.setPerRest, {
      code,
      characterId,
      key: 'heroic-inspiration',
      spent: true,
      playerId: ana,
    })
    expect(await rawVitals(t, characterId)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[5] - 20,
      hitDiceRemaining: 2,
      spentPerRest: ['heroic-inspiration'],
    })

    // One call, all three — a rest that restored hit points and left the dice
    // spent would be a rules bug somebody has to notice.
    await t.mutation(api.characters.longRest, { code, characterId, playerId: ana })
    expect(await rawVitals(t, characterId)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[5],
      hitDiceRemaining: 5,
      spentPerRest: [],
    })
  })

  test('the spent state travels on the vitals row, for the player and the DM alike', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, dmCode, characterId, ana } = fixture

    expect(
      await t.mutation(api.characters.setPerRest, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: true,
        playerId: ana,
      }),
    ).toEqual({ spentPerRest: ['heroic-inspiration'] })

    for (const who of [{}, { dmCode }]) {
      const rows = await t.query(api.characters.vitals, { code, ...who })
      const row = rows.find((entry) => entry.characterId === characterId)
      expect(row?.kind).toBe('exact')
      expect(row).toMatchObject({ spentPerRest: ['heroic-inspiration'] })
    }

    // Handing it back is the same call with `spent: false`, because a mark made by
    // mistake has to be undoable.
    expect(
      await t.mutation(api.characters.setPerRest, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: false,
        playerId: ana,
      }),
    ).toEqual({ spentPerRest: [] })
  })

  test('spending the same ability twice is idempotent rather than cumulative', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, characterId, ana } = fixture

    for (let i = 0; i < 3; i += 1) {
      await t.mutation(api.characters.setPerRest, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: true,
        playerId: ana,
      })
    }
    expect((await rawVitals(t, characterId))?.spentPerRest).toEqual(['heroic-inspiration'])
  })

  test('a key the character’s race does not have is refused', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, characterId, ana } = fixture

    for (const key of ['relentless-endurance', 'lucky', '', 'heroic_inspiration']) {
      const refusal = await refusalOf(
        t.mutation(api.characters.setPerRest, {
          code,
          characterId,
          key,
          spent: true,
          playerId: ana,
        }),
      )
      expect(refusal.kind, key).toBe('BadInput')
      expect(refusal.message, key).toBe('That character has no such ability.')
    }
    expect((await rawVitals(t, characterId))?.spentPerRest ?? []).toEqual([])
  })

  test('a Dwarf has nothing to spend, and a Half-Orc has exactly one thing', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const dwarf = await makePreset(t, code, 'Dwalin', presetSheet({ race: 'dwarf' }))
    const halfOrc = await makePreset(t, code, 'Grash', presetSheet({ race: 'half-orc' }))

    for (const key of ['heroic-inspiration', 'relentless-endurance', 'dwarven-toughness']) {
      await expectKind(
        t.mutation(api.characters.setPerRest, {
          code,
          characterId: dwarf,
          key,
          spent: true,
          dmCode,
        }),
        'BadInput',
      )
    }
    expect((await rawVitals(t, dwarf))?.spentPerRest ?? []).toEqual([])

    expect(
      await t.mutation(api.characters.setPerRest, {
        code,
        characterId: halfOrc,
        key: 'relentless-endurance',
        spent: true,
        dmCode,
      }),
    ).toEqual({ spentPerRest: ['relentless-endurance'] })
    await expectKind(
      t.mutation(api.characters.setPerRest, {
        code,
        characterId: halfOrc,
        key: 'heroic-inspiration',
        spent: true,
        dmCode,
      }),
      'BadInput',
    )
  })

  test('a hand-built character has no per-rest abilities at all', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet())

    await expectKind(
      t.mutation(api.characters.setPerRest, {
        code,
        characterId: thorin,
        key: 'heroic-inspiration',
        spent: true,
        dmCode,
      }),
      'BadInput',
    )
  })

  test('a rest is refused to a seat that is not playing the character, and to nobody', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human', level: 3, subclassKey: 'champion' }))
    const { code, characterId, ana, ben } = fixture
    await t.mutation(api.characters.adjustHp, { code, characterId, delta: -10, playerId: ana })

    await expectKind(
      t.mutation(api.characters.longRest, { code, characterId, playerId: ben }),
      'CharacterNotYours',
    )
    await expectKind(t.mutation(api.characters.longRest, { code, characterId }), 'CharacterNotYours')
    expect((await rawVitals(t, characterId))?.currentHp).toBe(FIGHTER_MAX_HP[3] - 10)

    await t.mutation(api.characters.longRest, { code, characterId, playerId: ana })
    expect((await rawVitals(t, characterId))?.currentHp).toBe(FIGHTER_MAX_HP[3])
  })

  test('resting an NPC is the DM’s alone, and a player cannot even find one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const goblin = await makeNpc(t, code, dmCode, 'Goblin', npcSheet({ maxHp: 7 }))
    await t.mutation(api.characters.setHp, { code, characterId: goblin, currentHp: 2, dmCode })

    await expectKind(
      t.mutation(api.characters.longRest, { code, characterId: goblin, playerId: ana }),
      'CharacterNotFound',
    )
    expect((await rawVitals(t, goblin))?.currentHp).toBe(2)

    await t.mutation(api.characters.longRest, { code, characterId: goblin, dmCode })
    const rested = await rawVitals(t, goblin)
    expect(rested?.currentHp).toBe(7)
    // A monster carries no hit dice, so a rest must not invent it any.
    expect(rested?.hitDiceRemaining).toBeUndefined()
  })

  test('a long rest creates the vitals row a Milestone 1 character never had', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')
    expect(await rawVitals(t, legacy)).toBeNull()

    await t.mutation(api.characters.longRest, { code, characterId: legacy, dmCode })
    expect(await rawVitals(t, legacy)).toMatchObject({
      currentHp: defaultPcSheet().maxHp,
      hitDiceRemaining: defaultPcSheet().hitDice.count,
      spentPerRest: [],
    })
  })

  test('the spent state survives a level change and an edit', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human', level: 2, subclassKey: 'champion' }))
    const { code, dmCode, characterId, ana } = fixture

    await t.mutation(api.characters.setPerRest, {
      code,
      characterId,
      key: 'heroic-inspiration',
      spent: true,
      playerId: ana,
    })
    await t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 4 })
    await update(t, code, characterId, presetSheet({ race: 'human', level: 4, subclassKey: 'battle-master' }), { dmCode })

    // A rest clears it; an edit does not touch it (ADR 0005).
    expect((await rawVitals(t, characterId))?.spentPerRest).toEqual(['heroic-inspiration'])
  })
})

describe('characters built before the library existed', () => {
  /**
   * A Milestone 3 sheet has neither `skillProficiencies` nor `speed`, because
   * neither field existed when it was written. Both are optional for exactly that
   * reason, and the accessors default them — so one has to keep reading, keep
   * editing and keep taking damage without a migration.
   */
  test('a Milestone 3 sheet with neither optional field still reads, edits and takes damage', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const gameId = await gameIdFor(t, code)

    // Written straight into the table, because no mutation produces this shape any
    // more — which is exactly why the fallbacks need testing.
    const milestoneThree: PcSheet = {
      kind: 'pc',
      level: 3,
      className: 'Fighter',
      abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      armourClass: 17,
      maxHp: 30,
      hitDice: { count: 3, faces: 10 },
      feats: [sheetEntry()],
      spells: [],
    }
    const thorin = await t.run(
      async (ctx) =>
        await ctx.db.insert('characters', { gameId, name: 'Thorin', sheet: milestoneThree }),
    )

    const payload = await readSheet(t, code, thorin, { dmCode })
    expect(payload?.preset).toBeNull()
    expect(payload?.sheet).toEqual(milestoneThree)
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).kind).toBe('pc')

    // It still takes damage, against the maximum on the stored sheet.
    expect(
      await t.mutation(api.characters.adjustHp, { code, characterId: thorin, delta: -12, dmCode }),
    ).toEqual({ currentHp: 18 })

    // And it still edits, by hand, with the fields it always had.
    await update(t, code, thorin, { ...milestoneThree, maxHp: 34 }, { dmCode })
    expect((await readSheet(t, code, thorin, { dmCode }))?.sheet).toMatchObject({ maxHp: 34 })
    expect(await exactVitals(t, code, thorin, { dmCode })).toEqual({ current: 18, max: 34 })
  })

  test('a character with no sheet at all is untouched by any of this', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')

    expect(await readSheet(t, code, legacy, { dmCode })).toEqual({
      _id: legacy,
      name: 'Milestone One',
      sheet: defaultPcSheet(),
      preset: null,
      extras: null,
    })
    // The read is a fallback, not a lazy migration.
    expect((await rawCharacter(t, legacy))?.sheet).toBeUndefined()
    await t.mutation(api.characters.adjustHp, { code, characterId: legacy, delta: -3, dmCode })
    expect((await rawCharacter(t, legacy))?.sheet).toBeUndefined()
  })

  /**
   * Content drifts. A subclass key is stored on a character, so retiring or
   * renaming an archetype must leave the characters that chose it *readable* — the
   * resolver returns the class's own defaults rather than throwing on a query that
   * paints a screen.
   */
  test('a character whose archetype has been retired still reads', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(
      t,
      code,
      'Thorin',
      presetSheet({ level: 4, subclassKey: 'champion' }),
    )

    // The archetype disappears out from under the stored document.
    await t.run(async (ctx) => {
      const character = await ctx.db.get('characters', thorin)
      await ctx.db.patch('characters', thorin, {
        sheet: { ...(character!.sheet as PresetSheet), subclassKey: 'retired-in-a-later-patch' },
      })
    })

    const resolved = await resolvedSheet(t, code, thorin, { dmCode })
    expect(resolved.className).toBe('Fighter')
    expect(resolved.level).toBe(4)
    expect(resolved.hitDice).toEqual({ count: 4, faces: 10 })
    // The race trait is still there: only the numbers it was borrowing are gone.
    expect(resolved.feats.map((entry) => entry.id)).toEqual(['race:human'])
    // And it is still a hero to everybody, rather than becoming unreadable.
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).kind).toBe('pc')
  })

  /**
   * A character above level 1 with no archetype chosen reads as the level 1 sheet —
   * `librarySheet`'s stated rule, because the library has no archetype-less level 2
   * and showing somebody mid-decision the sheet they have is more honest than
   * inventing one.
   *
   * ⚠️ WORTH KNOWING ABOUT, because the two correct behaviours compose into a
   * surprising one: an unlocked player who clears their own archetype at level 5
   * drops from 44 maximum hit points to 12, and `writeSheet`'s re-clamp — which is
   * right on its own terms — takes their current hit points down with it. Choosing
   * the archetype again restores the maximum and **not** the hit points. A long rest
   * repairs it, so the damage is bounded, but nothing on the way through says so.
   */
  test('clearing the archetype above level 2 falls back to the level 1 sheet, and hit points follow', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 5, subclassKey: 'champion' }))
    const { code, dmCode, characterId, ana } = fixture
    expect((await rawVitals(t, characterId))?.currentHp).toBe(FIGHTER_MAX_HP[5])

    await update(t, code, characterId, presetSheet({ level: 5, subclassKey: null }), {
      dmCode,
    })

    const resolved = await resolvedSheet(t, code, characterId, { playerId: ana })
    expect(resolved.level).toBe(5)
    expect(resolved.className).toBe('Fighter')
    expect(resolved.maxHp).toBe(FIGHTER_MAX_HP[1])
    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: FIGHTER_MAX_HP[1],
      max: FIGHTER_MAX_HP[1],
    })

    // Choosing again restores the maximum, and does not restore the hit points.
    await update(t, code, characterId, presetSheet({ level: 5, subclassKey: 'champion' }), {
      dmCode,
    })
    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: FIGHTER_MAX_HP[1],
      max: FIGHTER_MAX_HP[5],
    })
    // A long rest is what repairs it.
    await t.mutation(api.characters.longRest, { code, characterId, playerId: ana })
    expect((await rawVitals(t, characterId))?.currentHp).toBe(FIGHTER_MAX_HP[5])
  })
})

// ---------------------------------------------------------------------------
// The two normalisation regressions, held down
// ---------------------------------------------------------------------------
//
// Both of these were live defects when this suite was written, and both were found
// and fixed while it was being written. They are kept because the shape of each is
// a trap that will be walked into again: `normaliseSheet` rebuilds a sheet **field
// by field** rather than spreading it — which is the right call, since it is what
// stops an unknown field riding into the database — and the cost of that call is
// that any field added to `pcSheetValidator` and not added here is discarded in
// silence, by a write that reports success.
//
// Neither is a leak. Both are data loss on Save, invisible to a validator, because
// a value that is permitted to be absent looks identical to one that was thrown
// away.

describe('normalisation covers every field the sheet has grown', () => {
  /**
   * `skillProficiencies` and `speed` are Milestone 4's additions to
   * `pcSheetValidator`, and both are optional — necessarily, because the table
   * already held Milestone 3 sheets without them. Optional is exactly what makes
   * losing them silent.
   *
   * The case that matters is the swap the design invites in both directions:
   * `updateSheet`'s own comment says "a hand-built hero swapping to a premade sheet
   * is an ordinary thing to want", and the reverse — taking the resolved sheet and
   * saving it back as a `pc` to edit by hand — arrives carrying thirteen skill
   * proficiencies and, for a Goliath, 45 feet of speed.
   */
  test('a hand-built sheet keeps its skill proficiencies and its speed across a save', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const wanted: PcSheet = {
      ...pcSheet({ className: 'Rogue' }),
      skillProficiencies: { ...noSkills(), stealth: true, perception: true },
      speed: 45,
    }
    const thorin = await makePc(t, code, 'Thorin', wanted)

    expect((await rawCharacter(t, thorin))?.sheet).toEqual(wanted)
    expect((await readSheet(t, code, thorin, { dmCode }))?.sheet).toEqual(wanted)

    // And through the edit path as well as the create path, since they share the
    // normaliser but not the caller.
    const swapped: PcSheet = { ...wanted, speed: 25, skillProficiencies: noSkills() }
    await update(t, code, thorin, swapped, { dmCode })
    expect((await rawCharacter(t, thorin))?.sheet).toEqual(swapped)
  })

  test('a sheet that never had either field does not acquire one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePc(t, code, 'Thorin', pcSheet())

    // Absent means the defaults, and absent is what the table already holds — so a
    // write must not name the field and give it `undefined`, which is a different
    // thing from omitting it and is not a Convex value at all.
    await update(t, code, thorin, pcSheet({ maxHp: 22 }), { dmCode })
    const stored = (await rawCharacter(t, thorin))?.sheet as PcSheet
    expect(stored.maxHp).toBe(22)
    expect('skillProficiencies' in stored).toBe(false)
    expect('speed' in stored).toBe(false)
  })

  /**
   * The DM's `overrides.extraFeats` and `overrides.extraSpells` are ordinary sheet
   * entries and are validated as such by `storedSheetProblem` — so they have to be
   * *normalised* as such too, or they are checked before `normaliseEntry` has run
   * over them rather than after.
   *
   * The visible symptom of getting that wrong is a roll spec the rest of the
   * application accepts being refused inside an override: `normaliseRoll` exists
   * precisely so that `2d6 + wis` typed by hand becomes `2d6+WIS`. The invisible one
   * is worse — an id stored as `" plot:shard "` looks identical to `"plot:shard"` on
   * screen while being a different React key and a different roll target.
   */
  test('an override entry is normalised before it is validated, like every other entry', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const thorin = await makePreset(t, code, 'Thorin')

    await update(
      t,
      code,
      thorin,
      presetSheet({
        overrides: {
          extraFeats: [
            sheetEntry({
              id: 'plot:shard',
              name: 'Wyrmglass  Shard',
              text: 'A shard of the thing.',
              // Accepted anywhere else on any sheet, because `normaliseRoll` runs
              // first. Here it reaches `rollProblem` exactly as it was typed.
              roll: '2d6 + wis',
            }),
          ],
        },
      }),
      { dmCode },
    )

    const stored = await storedPreset(t, thorin)
    expect(stored.overrides?.extraFeats?.[0]).toMatchObject({
      name: 'Wyrmglass Shard',
      roll: '2d6+WIS',
    })
  })
})
