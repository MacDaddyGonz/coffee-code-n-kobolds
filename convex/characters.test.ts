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
import { MAX_RESOURCE_USES } from './lib/rest'
import { SPECIES_KEYS, species } from './lib/species'
import { kindOf } from './lib/resolve'
import type {
  BestiarySheet,
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
  categoryForRoll,
  defaultNpcSheet,
  defaultPcSheet,
  isMonsterSheet,
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

/**
 * The DM code for a game, read back out of the document rather than threaded.
 *
 * **Creating a character is the DM's on every path now**, so every fixture below that
 * makes one has to hold the code — and the alternative was a fourth argument at some
 * hundred and sixty call sites, most of which destructure only `code` from `makeGame`
 * and would have had to start destructuring both. Looking it up keeps each fixture's
 * signature saying what the fixture is *for*, and it is the same `t.run` read
 * `gameIdFor` below already performs for the game's own id.
 *
 * ⚠️ **No test about the gate may go through a fixture that does this.** A helper that
 * always supplies the right code cannot assert anything about a wrong one, so every
 * assertion below concerning `NotDm` calls `api.characters.create` directly with the
 * code it means to send — or with none.
 */
async function dmCodeFor(t: Harness, code: string): Promise<string> {
  const game = await t.run(async (ctx) => {
    return await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
  })
  if (!game) throw new Error(`no game with code ${code}`)
  return game.dmCode
}

async function makeCharacter(t: Harness, code: string, name: string) {
  const { characterId } = await t.mutation(api.characters.create, {
    code,
    name,
    dmCode: await dmCodeFor(t, code),
  })
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

/**
 * One line on a sheet. Valid by default, so a test only states what it is testing.
 *
 * ⚠️ **It supplies `category` and, where one is owed, `toHit`.** A fixture that
 * omitted them would leave every assertion under it vacuous with respect to the two
 * fields Milestone 6 added: `categoryOf` would answer from the roll, `toHitOf` would
 * answer null, and nothing below would ever have put either on the wire.
 *
 * **The category is derived from the roll rather than fixed**, and that is not
 * convenience — a constant breaks this helper's call sites in one direction or the
 * other, because `entriesProblem` now enforces arity both ways. `'action'` would make
 * every `sheetEntry({ roll: null })` an action promising a roll it has not got;
 * `'passive'` would make the default entry a passive carrying one. Deriving restates
 * the same rule `categoryOf`'s legacy default restates, so a fixture stays coherent
 * whatever a caller does to its roll.
 *
 * The derivation asks whether the roll **survives normalisation**, not merely whether
 * it is null: `roll: '   '` is stored as null, so an entry carrying one is a passive
 * by the time anything validates it.
 *
 * A `weapon` is given a to-hit to go with it. Pass `toHit: undefined` explicitly to
 * build the incoherent entry an arity refusal needs.
 */
function sheetEntry(overrides: Partial<SheetEntry> = {}): SheetEntry {
  const roll = overrides.roll === undefined ? '1d10+2' : overrides.roll
  // Normalised first, then through the one statement of the rule. The normalisation
  // is this fixture's own concern — `roll: '   '` is stored as null, so an entry
  // carrying one is a passive by the time anything validates it — but the *rule* is
  // `categoryForRoll`, shared with `categoryOf` and with the bestiary resolver so the
  // three cannot drift apart.
  const category =
    overrides.category ?? categoryForRoll(roll !== null && roll.trim() !== '' ? roll : null)
  return {
    id: 'entry-1',
    name: 'Second Wind',
    text: 'Regain hit points as a bonus action.',
    level: null,
    catalogueKey: null,
    ...(category === 'weapon' ? { toHit: '1d20+STR+PROF' } : {}),
    ...overrides,
    roll,
    category,
  }
}

/** `count` distinct, valid entries — for the list-length bounds. */
function sheetEntries(count: number): SheetEntry[] {
  return Array.from({ length: count }, (_unused, index) =>
    sheetEntry({ id: `entry-${index}`, name: `Entry ${index}` }),
  )
}

async function makePc(t: Harness, code: string, name: string, sheet: PcSheet) {
  const { characterId } = await t.mutation(api.characters.create, {
    code,
    name,
    sheet,
    dmCode: await dmCodeFor(t, code),
  })
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
 *
 * `who` widened from `{ dmCode? }` to the full `Actor` once a grant could entitle a *seat*
 * to exact numbers: the rebind tests below ask whether a granted player receives the
 * `exact` variant, and the throw inside this helper is the sharpest way to ask it. Every
 * older caller passes `{ dmCode }` and is unaffected.
 */
async function exactVitals(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
  who: Actor = {},
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
  options: { name?: string; layer?: 'background' | 'player' | 'gm'; characterId?: Id<'characters'> } = {},
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
  /**
   * ⚠️ **This used to read "any player in the game may add a character".** Creating one
   * is the DM's on every path now, and the *other* half of that sentence is what
   * survived and is still worth asserting: the character lands unclaimed. It belongs to
   * the game rather than to whoever typed it in (ADR 0002), so a DM-only create does not
   * quietly make it the DM's character.
   */
  test('the DM adds a character and it lands unclaimed', async () => {
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

  /**
   * Sent **with** the DM code, deliberately. The gate now runs ahead of
   * `requireCharacterName`, so dropping the code would turn each of these into an
   * assertion about the gate — which is worth having and is two tests further down —
   * and would stop exercising the name check they were written for. A test that
   * refuses for the wrong reason is a test that has stopped covering anything.
   */
  test('blank and whitespace-only names are rejected', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    await expectKind(t.mutation(api.characters.create, { code, dmCode, name: '' }), 'BadInput')
    await expectKind(t.mutation(api.characters.create, { code, dmCode, name: '   ' }), 'BadInput')
    await expectKind(t.mutation(api.characters.create, { code, dmCode, name: '\t\n ' }), 'BadInput')

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
    const { code, dmCode } = await makeGame(t)

    for (const length of [MAX_CHARACTER_NAME_LENGTH + 1, MAX_CHARACTER_NAME_LENGTH + 50]) {
      await expectKind(
        t.mutation(api.characters.create, { code, dmCode, name: 'x'.repeat(length) }),
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
    const { code, dmCode } = await makeGame(t)
    const typed = `${'a'.repeat(MAX_CHARACTER_NAME_LENGTH - 1)}\u{1F44D}`
    expect(typed).toHaveLength(MAX_CHARACTER_NAME_LENGTH + 1)

    await expectKind(t.mutation(api.characters.create, { code, dmCode, name: typed }), 'BadInput')
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
   *
   * One of the cap-filling tests `vitest.config.ts` raises the `convex` project's
   * `testTimeout` for — see the note there. Two hundred real `characters.create` round
   * trips is the point of it rather than an inefficiency.
   */
  test('the write cap matches the read bound, so everything created is visible', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    // Deliberately fills the game to the cap — that is what the test is about.
    const created: Id<'characters'>[] = []
    for (let i = 0; i < MAX_CHARACTERS_PER_GAME; i += 1) {
      created.push(await makeCharacter(t, code, `Recruit ${i}`))
    }

    await expectKind(
      t.mutation(api.characters.create, { code, dmCode, name: 'One Too Many' }),
      'GameFull',
    )

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
    await expectKind(
      t.mutation(api.characters.create, { code, dmCode, name: 'Latecomer' }),
      'GameFull',
    )

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
      // The bestiary link, sent as a sibling of `preset` rather than widening it —
      // a hand-built character has no creature behind it either.
      creature: null,
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

  /**
   * ⚠️ **This used to read "a DM code is not needed for a player character".** It is
   * needed now, and the half of the old claim that survived is the one still asserted:
   * the code decides *who may create*, not *what gets created*. A hero built with it is
   * an ordinary hero, listed as `pc` to a caller holding no code at all — a gate that
   * had quietly started producing hidden characters would be the failure this catches.
   */
  test('a hero created with the DM code is still an ordinary hero for everyone', async () => {
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
    const { code, dmCode } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        dmCode,
        name: 'Thorin',
        sheet: pcSheet({ level: 0 }),
      }),
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

    await expectKind(
      t.mutation(api.characters.create, { code, dmCode, name: 'One Too Many' }),
      'GameFull',
    )
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

// ---------------------------------------------------------------------------
// Milestone 6: what shape of roll a line is
//
// `category` and `toHit` are optional on `sheetEntryValidator`, which means a
// deployment will store an entry that has neither, one, or both — the schema cannot
// tell a coherent line from an incoherent one. `entriesProblem` is what does, and it
// is an *arity* rule rather than a bound: a weapon promises two rolls, an action one,
// a passive none, and an entry that does not keep its promise is a line the roll path
// cannot describe. These are the tests for that promise.
// ---------------------------------------------------------------------------

describe('sheet entry categories and to-hit rolls', () => {
  /**
   * The four arity violations, each blaming the field that is wrong.
   *
   * The `path` is asserted rather than the sentence for the reason
   * `expectSheetProblem` gives — but here it carries a second load. Two of these
   * four are refused by the *same* pair of rules read in opposite directions, and a
   * check that only asserted "something was refused" would pass on an
   * implementation that blamed `roll` for a missing to-hit. The form marks one
   * field, so the field is the contract.
   *
   * Driven through `updateSheet` rather than `create` because that is the mutation a
   * sheet that already exists goes through, and because it lets each case assert the
   * stored document is untouched — a refusal that half-wrote a sheet would be worse
   * than one that accepted it.
   */
  const arityViolations: [string, SheetEntry, string][] = [
    [
      'a weapon with no roll to hit with',
      sheetEntry({ id: 'w', name: 'Greatsword', roll: '2d6+STR', category: 'weapon', toHit: undefined }),
      'feats[0].toHit',
    ],
    [
      'an action carrying a to-hit',
      sheetEntry({ id: 'a', name: 'Fireball', roll: '8d6', category: 'action', toHit: '1d20+INT+PROF' }),
      'feats[0].toHit',
    ],
    [
      'a weapon with no damage roll',
      sheetEntry({ id: 'w', name: 'Greatsword', roll: null, category: 'weapon', toHit: '1d20+STR+PROF' }),
      'feats[0].roll',
    ],
    [
      'a passive carrying a roll',
      sheetEntry({ id: 'p', name: 'Rage', roll: '1d4', category: 'passive' }),
      'feats[0].roll',
    ],
  ]

  for (const [label, entry, path] of arityViolations) {
    test(`updateSheet refuses ${label}, blaming ${path}`, async () => {
      const t = convexTest(schema, modules)
      const { code, dmCode } = await makeGame(t)
      const characterId = await makeCharacter(t, code, 'Subject')
      const before = (await rawCharacter(t, characterId))?.sheet

      await expectSheetProblem(
        t.mutation(api.characters.updateSheet, {
          code,
          characterId,
          dmCode,
          sheet: pcSheet({ feats: [entry] }),
        }),
        path,
      )
      expect((await rawCharacter(t, characterId))?.sheet).toEqual(before)
    })
  }

  /**
   * The same rule read against a monster's list, because `actions` is the third array
   * position sharing this entry shape and the only one whose sheet variant is the
   * secret. A rule enforced on `feats` and not on `actions` would be enforced on the
   * half of the corpus nobody hides.
   */
  test('updateSheet refuses a monster action carrying a to-hit it may not have', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const characterId = await makeNpc(t, code, dmCode, 'Ogre')

    await expectSheetProblem(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId,
        dmCode,
        sheet: npcSheet({
          actions: [
            sheetEntry({ id: 'act', name: 'Fire Breath', roll: '6d6', category: 'action', toHit: '1d20+6' }),
          ],
        }),
      }),
      'actions[0].toHit',
    )
  })

  /**
   * The length cap `rollProblem` now applies, aimed at the field that did not exist
   * when the cap was written. `ROLL_PATTERN`'s trailing `(?:[+-]…)*` repeats without
   * limit, so this string is a perfectly *valid* roll and only the cap refuses it —
   * and there are now two such fields on each of up to forty entries.
   */
  test('updateSheet refuses a to-hit past the length cap even though the grammar accepts it', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const characterId = await makeCharacter(t, code, 'Subject')
    // `1d20` plus nineteen `+1` terms: 42 characters, every one of them legal.
    const longToHit = `1d20${'+1'.repeat(19)}`
    expect(longToHit.length).toBeGreaterThan(40)

    await expectSheetProblem(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId,
        dmCode,
        sheet: pcSheet({
          feats: [sheetEntry({ id: 'w', name: 'Rapier', category: 'weapon', toHit: longToHit })],
        }),
      }),
      'feats[0].toHit',
    )
  })

  /**
   * ⚠️ **Absence has to be storable, and an empty string is not how you say it.**
   *
   * `undefined` is not a Convex value, so an entry naming `toHit` and giving it `''`
   * is a different document from one that omits the key — and the second is the only
   * one that means "this line does not roll to hit". `normaliseEntry` is what turns
   * the first into the second, so the assertion is about the *key*, not the value:
   * `expect(entry.toHit).toBeUndefined()` would pass on a stored empty string.
   */
  test('an empty to-hit is stored as no to-hit key at all', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const characterId = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({
        feats: [sheetEntry({ id: 'a', name: 'Fireball', roll: '8d6', category: 'action', toHit: '' })],
      }),
    )

    const stored = (await rawCharacter(t, characterId))?.sheet
    expect(stored?.kind).toBe('pc')
    if (stored?.kind !== 'pc') return
    expect('toHit' in stored.feats[0]).toBe(false)
    // The category is not treated the same way and must still be there — without this
    // the check above passes on a normaliser that dropped both.
    expect(stored.feats[0].category).toBe('action')
  })

  /**
   * The positive of the two above: a weapon keeps both fields, through the mutation,
   * the stored document and the query the panel actually reads.
   */
  test('a weapon round-trips through the sheet query with both fields intact', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const weapon = sheetEntry({
      id: 'feat-rapier',
      name: 'Rapier',
      text: 'A light, quick blade.',
      roll: '1d8+DEX',
      category: 'weapon',
      toHit: '1d20+DEX+PROF',
    })
    const characterId = await makePc(t, code, 'Nightingale', pcSheet({ feats: [weapon] }))

    const stored = (await rawCharacter(t, characterId))?.sheet
    expect(stored?.kind === 'pc' ? stored.feats[0] : null).toEqual(weapon)

    const read = (await readSheet(t, code, characterId, { dmCode }))?.sheet
    expect(read?.kind).toBe('pc')
    if (read?.kind !== 'pc') return
    expect(read.feats[0].category).toBe('weapon')
    expect(read.feats[0].toHit).toBe('1d20+DEX+PROF')
  })

  /**
   * A to-hit goes through `normaliseRoll` exactly as a damage roll does, so a
   * hand-typed `1d20 + dex + prof` and a picked `1d20+DEX+PROF` end up byte-identical
   * rather than merely equivalent. The `DEX` here is deliberate: it is the one
   * modifier token containing a `D`, and the separator-lowercasing bug that ate every
   * Dexterity roll would eat every Dexterity *to-hit* the same way — which is most of
   * them, since a finesse weapon is the common case.
   */
  test('a to-hit is normalised on the way in, whitespace and casing included', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const characterId = await makePc(
      t,
      code,
      'Thorin',
      pcSheet({
        feats: [
          sheetEntry({
            id: 'w',
            name: 'Rapier',
            roll: '1d8+DEX',
            category: 'weapon',
            toHit: '1d20 + dex + prof',
          }),
        ],
      }),
    )

    const stored = (await rawCharacter(t, characterId))?.sheet
    expect(stored?.kind === 'pc' ? stored.feats[0].toHit : null).toBe('1d20+DEX+PROF')
  })

  /**
   * ⚠️ **THE ONE THAT DECIDES WHETHER THIS MILESTONE CAN SHIP.**
   *
   * `characters.sheet` already holds entries written before either field existed, in
   * both roll shapes, in every game anybody has played. `entriesProblem`'s arity rule
   * is new and runs over the *whole* sheet on every save — so if a legacy entry does
   * not satisfy it, every hand-built sheet in every existing game becomes unsaveable
   * on its next edit, and the DM finds out by clicking Save.
   *
   * It is safe only because `categoryOf`'s default is *derived*: an entry with no roll
   * reads as a passive and has none, one with a roll reads as an action and has one,
   * and neither has ever had a to-hit. That is the arity rule restated, which is why
   * the default cannot be a constant. This test is what holds that claim down.
   *
   * The entries are written as literals rather than through `sheetEntry`, which now
   * supplies a category — a fixture that helpfully filled the field in would be
   * testing the opposite of the thing named above.
   */
  test('a legacy sheet with neither field on any entry is still accepted and still saves', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacyFeats: SheetEntry[] = [
      {
        id: 'legacy-rage',
        name: 'Rage',
        text: 'Declared, not rolled. Written before a category was a thing.',
        roll: null,
        level: null,
        catalogueKey: null,
      },
      {
        id: 'legacy-smite',
        name: 'Divine Smite',
        text: 'Radiant damage on a hit already landed.',
        roll: '2d8',
        level: null,
        catalogueKey: null,
      },
    ]
    const legacySpells: SheetEntry[] = [
      {
        id: 'legacy-shield',
        name: 'Shield',
        text: 'Declared as a reaction.',
        roll: null,
        level: 1,
        catalogueKey: 'shield',
      },
      {
        id: 'legacy-fire-bolt',
        name: 'Fire Bolt',
        text: 'A mote of fire.',
        roll: '1d10',
        level: 0,
        catalogueKey: 'fire-bolt',
      },
    ]
    const legacy = pcSheet({ feats: legacyFeats, spells: legacySpells })

    const characterId = await makePc(t, code, 'Milestone Three', legacy)
    const stored = (await rawCharacter(t, characterId))?.sheet
    expect(stored).toEqual(legacy)

    // Stored as it was: no category was materialised on the way in. A normaliser that
    // filled the field in would leave `categoryOf`'s default reachable only by
    // documents nobody has saved, which is how a default becomes untested code.
    expect(stored?.kind).toBe('pc')
    if (stored?.kind !== 'pc') return
    for (const entry of [...stored.feats, ...stored.spells]) {
      expect('category' in entry).toBe(false)
      expect('toHit' in entry).toBe(false)
    }

    // And the edit that follows. This is the click that would fail.
    await t.mutation(api.characters.updateSheet, {
      code,
      characterId,
      dmCode,
      sheet: { ...legacy, maxHp: 42 },
    })
    const resaved = (await rawCharacter(t, characterId))?.sheet
    expect(resaved).toEqual({ ...legacy, maxHp: 42 })
  })

  /**
   * The same claim for a monster's list, and for the DM's two override diffs — the
   * other three of the six array positions this entry shape occupies. An override is
   * where an entry arrives from outside the picker, so a rule that held on a sheet
   * and not in an override would hold exactly where nothing types by hand.
   */
  test('a legacy NPC action and a hand-written override entry are both still saveable', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacyAction: SheetEntry = {
      id: 'legacy-club',
      name: 'Greatclub',
      text: 'Melee attack, +6 to hit, reach 5 feet — written when the bonus lived in the prose.',
      roll: '2d8+3',
      level: null,
      catalogueKey: 'npc-greatclub',
    }
    const npcId = await makeNpc(t, code, dmCode, 'Ogre', npcSheet({ actions: [legacyAction] }))
    expect((await rawCharacter(t, npcId))?.sheet).toEqual(npcSheet({ actions: [legacyAction] }))

    const overrides: PresetOverrides = {
      extraFeats: [
        {
          id: 'dm-boon',
          name: 'Boon of the Ninth Step',
          text: 'A gift from the DM, written before categories existed.',
          roll: '1d6',
          level: null,
          catalogueKey: null,
        },
      ],
    }
    const heroId = await makeCharacter(t, code, 'Nightingale')
    await t.mutation(api.characters.updateSheet, {
      code,
      characterId: heroId,
      dmCode,
      sheet: {
        kind: 'preset',
        race: 'elf',
        classKey: 'rogue',
        subclassKey: null,
        level: 1,
        locked: false,
        overrides,
      } satisfies PresetSheet,
    })
    const storedPreset = (await rawCharacter(t, heroId))?.sheet
    expect(storedPreset?.kind).toBe('preset')
    if (storedPreset?.kind !== 'preset') return
    const stored = storedPreset.overrides?.extraFeats?.[0]
    expect(stored).toEqual(overrides.extraFeats?.[0])
    expect(stored && 'category' in stored).toBe(false)
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
      // The bestiary link, sent as a sibling of `preset` rather than widening it —
      // a hand-built character has no creature behind it either.
      creature: null,
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
      dmCode,
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
        dmCode,
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
    const { code, dmCode } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        dmCode,
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
      layer: 'gm',
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
  const { characterId } = await t.mutation(api.characters.create, {
    code,
    name,
    sheet,
    dmCode: await dmCodeFor(t, code),
  })
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
      // ⚠️ **The Human's printed 30, not `SPEED_FEET`.** A 2024 species states its own
      // speed and the resolver *sets* it, so the constant — still 35 — is reached only
      // by a sheet with the field absent, which a resolved preset never is.
      speed: 30,
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
    const { code, dmCode } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        dmCode,
        name: 'Thorin',
        sheet: presetSheet({ level: 1, subclassKey: 'champion' }),
      }),
      'subclassKey',
    )
  })

  test('an archetype belonging to another class is refused', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    await expectSheetProblem(
      t.mutation(api.characters.create, {
        code,
        dmCode,
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
      // ⚠️ **`half-orc`, which is the case that matters now that it is real.** This used
      // to say `gnome`, which was an invented key until the 2024 conversion made it one of
      // the nine — so the test would have gone on passing for entirely the wrong reason if
      // nobody had looked. A *retired* key is the only key that can reach this boundary in
      // anger: `species()` tolerates one on read, and this union is where the write is
      // refused.
      // ⚠️ **NOT `half-orc` any more, and the reason is worth the comment.** That key *is* now
      // admitted by the argument validator, because `presetSheetValidator.race` had to widen to
      // `storedSpeciesKeyValidator` or `npx convex deploy` is refused over characters created
      // before the conversion. A sheet has no narrow/wide split the way a layer does — the same
      // union is the schema AND the argument — so the write-side refusal for a retired species
      // moved into `storedSheetProblem`, where it is a `ConvexError` and is tested next door.
      // What this test is about is the OTHER refusal, the one that never reaches a handler.
      { ...presetSheet(), race: 'kobold' },
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
          for (const race of SPECIES_KEYS) {
            const sheet = presetSheet({ race, classKey, subclassKey: subclass.key, level })
            await update(t, code, thorin, sheet, { dmCode })

            const resolved = await resolvedSheet(t, code, thorin, { dmCode })
            const where = `${race}/${classKey}/${subclass.key}/${level}`
            expect(resolved.className, where).toContain(subclass.name)
            expect(resolved.maxHp, where).toBeGreaterThan(0)
            // Every one of the species' own traits is on every sheet, whether or
            // not it moves a number — a Halfling's Luck is the whole of what makes
            // them one. Three to five each since the 2024 conversion, so this is
            // checked per trait rather than against one `race:<key>` id.
            const names = resolved.feats.map((entry) => entry.name)
            for (const trait of species(race)!.traits) {
              expect(names, `${where}: ${trait.name}`).toContain(trait.name)
            }
            // Ids are a React key set and Milestone 6's roll targets, merged
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
      for (const race of SPECIES_KEYS) {
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
   * `applyPresetPermissions` and `requireEditableCharacter` decide between.
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

  /**
   * ⚠️ WHERE THE LEVEL RULE STOPS, recorded so that whoever finds it reads this
   * rather than filing it as a bug — or, better, decides it *is* one on purpose.
   *
   * `applyPresetPermissions` protects a character that is *already* built from the
   * library. It does nothing on `create`, and nothing when the stored sheet is not a
   * preset, both by explicit design: "building a character that was not one before —
   * nothing to protect yet".
   *
   * The consequence is that a player can hand themselves a level, in two calls and
   * without the DM, by replacing their preset with a hand-built `pc` sheet — which is
   * always allowed, since a hero's sheet belongs to the party — and then building a
   * fresh preset at whatever level they like. The lock goes the same way.
   *
   * That is the advisory ceiling ADR 0004 describes rather than a hole in a secret:
   * nothing here is hidden from anybody, and every step of it is visible to the whole
   * table. It is asserted rather than left implicit because a test that only proved
   * the rule holds would read as a stronger promise than the code makes.
   */
  test('the level rule guards an existing premade character, and not the act of making one', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ level: 1, locked: true }))
    const { code, characterId, ana } = fixture

    // Step one: out of the library altogether, which is not a preset change.
    await update(t, code, characterId, pcSheet({ className: 'By hand', level: 1 }), {
      playerId: ana,
    })
    expect((await rawCharacter(t, characterId))?.sheet?.kind).toBe('pc')

    // Step two: back in, at a level nobody awarded.
    await update(t, code, characterId, presetSheet({ level: 5, subclassKey: 'champion' }), {
      playerId: ana,
    })
    expect(await storedPreset(t, characterId)).toMatchObject({ level: 5, locked: false })

    // And the same thing in one call, on a character being created rather than
    // changed — which is the case the design deliberately leaves open.
    const fresh = await makePreset(t, code, 'Fresh', presetSheet({ level: MAX_LEVEL }))
    expect((await storedPreset(t, fresh)).level).toBe(MAX_LEVEL)
  })

  test('the level a player sends is ignored, whatever nonsense it is', async () => {
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
    expect(resolved.feats.map((entry) => entry.name)).toContain('Elven Lineage')
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
        'Only a hero built from the character library has a level. A creature from the bestiary has a challenge rating instead.',
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
    expect(refusal.message).toBe(
      'Only a hero built from the character library has selections to lock.',
    )
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

/**
 * ⚠️ **`characters.setPerRest` is now `characters.setUses` and takes a COUNT.** The old
 * mutation could only say *the one use this character had is gone*, because its argument was
 * a boolean; 2024 is full of features with two, three or proficiency-bonus-many uses. Every
 * test below reads the counted field for that reason, and `spent: 1` is what the old
 * `spent: true` meant.
 *
 * ⚠️ **`spentPerRest` is still on the row and is deliberately NOT written by `setUses`.** It
 * is folded in on *read* by `spentUsesOf`, so a row written by an older deployment keeps
 * meaning what it meant, and it drains as characters take long rests. The narrowing commit
 * deletes it. A test asserting that a spend landed therefore asserts on `spentUses`.
 */
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
    await t.mutation(api.characters.setUses, {
      code,
      characterId,
      key: 'heroic-inspiration',
      spent: 1,
      playerId: ana,
    })
    expect(await rawVitals(t, characterId)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[5] - 20,
      hitDiceRemaining: 2,
      spentUses: [{ key: 'heroic-inspiration', spent: 1 }],
    })

    // One call, all three — a rest that restored hit points and left the dice
    // spent would be a rules bug somebody has to notice.
    await t.mutation(api.characters.longRest, { code, characterId, playerId: ana })
    expect(await rawVitals(t, characterId)).toMatchObject({
      currentHp: FIGHTER_MAX_HP[5],
      hitDiceRemaining: 5,
      // Both fields, because a long rest is what drains the legacy one — see the ⚠️ on this
      // describe block.
      spentPerRest: [],
      spentUses: [],
    })
  })

  test('a long rest also clears the 2024 state, and leaves heroic inspiration alone', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human', level: 5, subclassKey: 'champion' }))
    const { code, dmCode, characterId } = fixture

    // Written directly, because nothing on the sheet path sets a death save or a temporary
    // hit point yet — the fields are the schema spine and the controls are another branch's.
    const row = await rawVitals(t, characterId)
    await t.run(async (ctx) => {
      await ctx.db.patch('characterVitals', row!._id, {
        temporaryHp: 12,
        deathSaveSuccesses: 2,
        deathSaveFailures: 1,
        heroicInspiration: true,
      })
    })

    await t.mutation(api.characters.longRest, { code, characterId, dmCode })
    const rested = await rawVitals(t, characterId)
    expect(rested).toMatchObject({
      temporaryHp: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
    })
    // ⚠️ **The one that is deliberately untouched.** The 2024 Human *regains* Heroic
    // Inspiration on a long rest, which is a species trait rather than a property of resting
    // — granting it here would be the application inventing a rule for the eight species that
    // do not have it, in a function with no way to know which one it is looking at.
    expect(rested?.heroicInspiration).toBe(true)
  })

  test('the spent state travels on the vitals row, for the player and the DM alike', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, dmCode, characterId, ana } = fixture

    expect(
      await t.mutation(api.characters.setUses, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: 1,
        playerId: ana,
      }),
    ).toEqual({ spentUses: [{ key: 'heroic-inspiration', spent: 1 }] })

    for (const who of [{}, { dmCode }]) {
      const rows = await t.query(api.characters.vitals, { code, ...who })
      const row = rows.find((entry) => entry.characterId === characterId)
      expect(row?.kind).toBe('exact')
      expect(row).toMatchObject({ spentUses: [{ key: 'heroic-inspiration', spent: 1 }] })
    }

    // Handing it back is the same call with `spent: 0`, because a mark made by
    // mistake has to be undoable.
    expect(
      await t.mutation(api.characters.setUses, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: 0,
        playerId: ana,
      }),
    ).toEqual({ spentUses: [] })
    // ⚠️ **Nought is ABSENCE from the array rather than `{ spent: 0 }`.** Two spellings of
    // none is what every field-by-field rebuild then has to agree about, and
    // `firstDifference` in scripts/board-smoke.mjs reports it as an extra element rather than
    // as equality.
    expect((await rawVitals(t, characterId))?.spentUses).toEqual([])
  })

  test('setting the same count twice is absolute rather than cumulative', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, characterId, ana } = fixture

    for (let i = 0; i < 3; i += 1) {
      await t.mutation(api.characters.setUses, {
        code,
        characterId,
        key: 'heroic-inspiration',
        spent: 1,
        playerId: ana,
      })
    }
    // The argument is *how many have been spent*, not *spend one more* — the same stance
    // `characters.setHp` takes against `adjustHp`, and the reason there is exactly one row
    // per key rather than one per call.
    expect((await rawVitals(t, characterId))?.spentUses).toEqual([
      { key: 'heroic-inspiration', spent: 1 },
    ])
  })

  test('a key the character’s race does not have is refused', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, characterId, ana } = fixture

    for (const key of ['relentless-endurance', 'lucky', '', 'heroic_inspiration']) {
      const refusal = await refusalOf(
        t.mutation(api.characters.setUses, {
          code,
          characterId,
          key,
          spent: 1,
          playerId: ana,
        }),
      )
      expect(refusal.kind, key).toBe('BadInput')
      expect(refusal.message, key).toBe('That character has no such ability.')
    }
    expect((await rawVitals(t, characterId))?.spentUses ?? []).toEqual([])

    // ⚠️ **And handing one back is still allowed for every one of them**, which is the
    // asymmetry stated on the mutation: a DM who changes a character's species, or deletes an
    // entry, leaves whatever it had spent still marked, and a check that applied here too
    // would make it unclearable by anything short of a long rest.
    for (const key of ['relentless-endurance', 'lucky', '', 'heroic_inspiration']) {
      expect(
        await t.mutation(api.characters.setUses, {
          code,
          characterId,
          key,
          spent: 0,
          playerId: ana,
        }),
      ).toEqual({ spentUses: [] })
    }
  })

  test('a count of nonsense or of more than anything has is refused outright', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human' }))
    const { code, characterId, ana } = fixture

    // Refused *before* the key is looked at, because these are shapes rather than
    // permissions — `NaN` is a perfectly valid Convex float64 and would poison every
    // comparison made against it afterwards, exactly as it does on `adjustHp`.
    for (const spent of [Number.NaN, Number.POSITIVE_INFINITY, -1, MAX_RESOURCE_USES + 1]) {
      const refusal = await refusalOf(
        t.mutation(api.characters.setUses, {
          code,
          characterId,
          key: 'heroic-inspiration',
          spent,
          playerId: ana,
        }),
      )
      expect(refusal.kind, String(spent)).toBe('BadInput')
      expect(refusal.message, String(spent)).toBe('That is not a number of uses.')
    }
    expect((await rawVitals(t, characterId))?.spentUses ?? []).toEqual([])
  })

  test('a Dwarf has nothing to spend, and an Orc has exactly one thing', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const dwarf = await makePreset(t, code, 'Dwalin', presetSheet({ race: 'dwarf' }))
    // The Half-Orc used to be the one holding `relentless-endurance`. The Orc holds it
    // now, under the same key, which is what makes retiring that species cheap — a
    // character who had already spent their survival keeps the flag stored for it.
    const orc = await makePreset(t, code, 'Grash', presetSheet({ race: 'orc' }))

    for (const key of ['heroic-inspiration', 'relentless-endurance', 'dwarven-toughness']) {
      await expectKind(
        t.mutation(api.characters.setUses, {
          code,
          characterId: dwarf,
          key,
          spent: 1,
          dmCode,
        }),
        'BadInput',
      )
    }
    expect((await rawVitals(t, dwarf))?.spentUses ?? []).toEqual([])

    expect(
      await t.mutation(api.characters.setUses, {
        code,
        characterId: orc,
        key: 'relentless-endurance',
        spent: 1,
        dmCode,
      }),
    ).toEqual({ spentUses: [{ key: 'relentless-endurance', spent: 1 }] })
    await expectKind(
      t.mutation(api.characters.setUses, {
        code,
        characterId: orc,
        key: 'heroic-inspiration',
        spent: 1,
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
      t.mutation(api.characters.setUses, {
        code,
        characterId: thorin,
        key: 'heroic-inspiration',
        spent: 1,
        dmCode,
      }),
      'BadInput',
    )
  })

  /**
   * ⚠️ **The second source of a key, and it is `||`-ed rather than merged.** A species'
   * once-per-long-rest ability is keyed by species content; an entry's uses are keyed by the
   * entry's own id. They are different vocabularies sharing one namespace on the row, and
   * collapsing them would mean deciding which wins on a collision — a question neither side
   * asked.
   */
  test('an entry that declares uses is a key a hand-built character may spend', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const bruenor = await makePc(
      t,
      code,
      'Bruenor',
      pcSheet({
        feats: [
          {
            id: 'feat-rage',
            name: 'Rage',
            text: 'Bellow, and hit harder for a minute.',
            roll: null,
            level: null,
            catalogueKey: null,
            category: 'passive',
            uses: { max: 3, recharge: 'long' },
          },
        ],
      }),
    )

    expect(
      await t.mutation(api.characters.setUses, {
        code,
        characterId: bruenor,
        key: 'feat-rage',
        spent: 2,
        dmCode,
      }),
    ).toEqual({ spentUses: [{ key: 'feat-rage', spent: 2 }] })

    // And an id that is not on the sheet is still refused, so the check is about *this*
    // character rather than about entry ids being acceptable in general.
    await expectKind(
      t.mutation(api.characters.setUses, {
        code,
        characterId: bruenor,
        key: 'feat-second-wind',
        spent: 1,
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

    await t.mutation(api.characters.setUses, {
      code,
      characterId,
      key: 'heroic-inspiration',
      spent: 1,
      playerId: ana,
    })
    await t.mutation(api.characters.setLevel, { code, dmCode, characterId, level: 4 })
    await update(t, code, characterId, presetSheet({ race: 'human', level: 4, subclassKey: 'battle-master' }), { dmCode })

    // A rest clears it; an edit does not touch it (ADR 0005).
    expect((await rawVitals(t, characterId))?.spentUses).toEqual([
      { key: 'heroic-inspiration', spent: 1 },
    ])
  })
})

/**
 * ⚠️ **THE SHORT REST DOES NOT HEAL AND DOES NOT RETURN HIT DICE**, and both absences are
 * asserted rather than left implicit. *Spending* hit dice is what a short rest is for, so
 * returning them would undo the only thing the rest exists to let somebody do, and healing is
 * what spending them achieves — one die at a time, by a person choosing how many to burn.
 *
 * `HitDiceControls` is the precedent: it shipped a button labelled *"Long rest"* that only
 * returned hit dice, and it read as broken the first time somebody pressed it at 1 hit point,
 * because the label promised the thing the button did not do. This is that trap pointing the
 * other way, which is why both rests read their label **and their explanation** out of
 * `REST_LABELS`.
 */
describe('the short rest', () => {
  /** Three entries, one per outcome `shortRest` can reach. */
  function restingSheet() {
    return pcSheet({
      hitDice: { count: 5, faces: 10 },
      feats: [
        {
          id: 'feat-focus',
          name: 'Focus Points',
          text: 'A pool that comes back the moment you sit down.',
          roll: null,
          level: null,
          catalogueKey: null,
          category: 'passive',
          uses: { max: 5, recharge: 'short' },
        },
        {
          id: 'feat-second-wind',
          name: 'Second Wind',
          text: 'Regain one expended use on a short rest, all on a long rest.',
          roll: null,
          level: null,
          catalogueKey: null,
          category: 'passive',
          uses: { max: 3, recharge: 'long', regainOnShortRest: 1 },
        },
        {
          id: 'feat-rage',
          name: 'Rage',
          text: 'Nothing short of a night brings this back.',
          roll: null,
          level: null,
          catalogueKey: null,
          category: 'passive',
          uses: { max: 3, recharge: 'long' },
        },
      ],
    })
  }

  async function spendEverything(t: ReturnType<typeof convexTest>, code: string, dmCode: string, characterId: Id<'characters'>) {
    for (const [key, spent] of [
      ['feat-focus', 4],
      ['feat-second-wind', 3],
      ['feat-rage', 2],
    ] as const) {
      await t.mutation(api.characters.setUses, { code, characterId, key, spent, dmCode })
    }
  }

  test('a short-rest pool comes back whole, a partial one by its stated amount, and a long-rest one not at all', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const monk = await makePc(t, code, 'Kaelen', restingSheet())
    await spendEverything(t, code, dmCode, monk)

    await t.mutation(api.characters.shortRest, { code, characterId: monk, dmCode })

    // ⚠️ **The three outcomes, asserted together, because any one of them alone passes on a
    // rest that did the same thing to everything.** A rest that cleared the array would
    // satisfy the first; one that did nothing would satisfy the third.
    expect((await rawVitals(t, monk))?.spentUses).toEqual([
      // Regains one of the three spent — the 2024 normal case, and the reason
      // `regainOnShortRest` exists at all rather than being rounded down to long-rest-only.
      { key: 'feat-second-wind', spent: 2 },
      { key: 'feat-rage', spent: 2 },
    ])
  })

  test('it heals nobody and returns no hit dice', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const monk = await makePc(t, code, 'Kaelen', restingSheet())
    const full = defaultPcSheet().maxHp

    await t.mutation(api.characters.adjustHp, { code, characterId: monk, delta: -6, dmCode })
    await t.mutation(api.characters.adjustHitDice, { code, characterId: monk, delta: -3, dmCode })
    await spendEverything(t, code, dmCode, monk)

    await t.mutation(api.characters.shortRest, { code, characterId: monk, dmCode })
    const rested = await rawVitals(t, monk)
    expect(rested?.currentHp, 'the short rest healed somebody').toBe(full - 6)
    expect(rested?.hitDiceRemaining, 'the short rest handed hit dice back').toBe(2)

    // The positive control, and it is the load-bearing half: without it both assertions above
    // pass on a mutation that does nothing whatsoever.
    expect(rested?.spentUses).toEqual([
      { key: 'feat-second-wind', spent: 2 },
      { key: 'feat-rage', spent: 2 },
    ])

    // And the long rest, on the same fixture, does all three — so the absence above is this
    // rest's behaviour rather than a broken write path.
    await t.mutation(api.characters.longRest, { code, characterId: monk, dmCode })
    expect(await rawVitals(t, monk)).toMatchObject({
      currentHp: full,
      hitDiceRemaining: 5,
      spentUses: [],
    })
  })

  test('a key whose entry the sheet no longer has is left spent rather than cleared', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const monk = await makePc(t, code, 'Kaelen', restingSheet())
    await t.mutation(api.characters.setUses, {
      code,
      characterId: monk,
      key: 'feat-focus',
      spent: 4,
      dmCode,
    })

    // The entry goes, and the spent count stays behind — the state `setUses`' hand-back
    // asymmetry exists to let somebody clear.
    await update(t, code, monk, pcSheet({ feats: [] }), { dmCode })
    await t.mutation(api.characters.shortRest, { code, characterId: monk, dmCode })

    // ⚠️ **`restores`' fail-conservative direction applied to data rather than to a union.** A
    // key with no declaration might have been anything: leaving it spent costs one click on a
    // counter anybody can edit, where clearing it hands out a resource nobody asked for.
    expect((await rawVitals(t, monk))?.spentUses).toEqual([{ key: 'feat-focus', spent: 4 }])
  })

  test('it leaves the legacy per-rest array entirely alone', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const human = await makePreset(t, code, 'Aldis', presetSheet({ race: 'human' }))

    // Written directly, as an older deployment would have: everything in `spentPerRest` is a
    // once-per-**long**-rest species ability by construction, so a short rest has nothing to
    // say about it and saying nothing is the correct answer rather than an omission.
    const row = await rawVitals(t, human)
    await t.run(async (ctx) => {
      await ctx.db.patch('characterVitals', row!._id, { spentPerRest: ['heroic-inspiration'] })
    })

    await t.mutation(api.characters.shortRest, { code, characterId: human, dmCode })
    expect((await rawVitals(t, human))?.spentPerRest).toEqual(['heroic-inspiration'])

    // And the folded view still shows it, so a client reading `spentUses` alone is correct
    // for both fields.
    const rows = await t.query(api.characters.vitals, { code, dmCode })
    expect(rows.find((entry) => entry.characterId === human)).toMatchObject({
      spentUses: [{ key: 'heroic-inspiration', spent: 1 }],
    })
  })

  test('a rest is refused to a seat that is not playing the character, exactly as a long one is', async () => {
    const t = convexTest(schema, modules)
    const fixture = await presetFixture(t, presetSheet({ race: 'human', level: 3, subclassKey: 'champion' }))
    const { code, characterId, ben } = fixture

    await expectKind(
      t.mutation(api.characters.shortRest, { code, characterId, playerId: ben }),
      'CharacterNotYours',
    )
    await expectKind(
      t.mutation(api.characters.shortRest, { code, characterId }),
      'CharacterNotYours',
    )
  })

  test('a character with nothing spent is a no-op rather than a write', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const monk = await makePc(t, code, 'Kaelen', restingSheet())

    const before = await rawVitals(t, monk)
    await t.mutation(api.characters.shortRest, { code, characterId: monk, dmCode })
    const after = await rawVitals(t, monk)

    // Asserted on `_creationTime` staying put *and* the document being unchanged: a patch of
    // the same value would invalidate the health-bar subscription for every client at the
    // table every time somebody pressed a button that changed nothing.
    expect(after).toEqual(before)
  })

  test('a Milestone 1 character with no vitals row at all survives one', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const legacy = await insertLegacyCharacter(t, code, 'Milestone One')
    expect(await rawVitals(t, legacy)).toBeNull()

    await t.mutation(api.characters.shortRest, { code, characterId: legacy, dmCode })
    // ⚠️ And still none, unlike `longRest` which creates one: there is nothing for a short
    // rest to restore on a character that has spent nothing, so inserting a row would be a
    // write with no fact in it.
    expect(await rawVitals(t, legacy)).toBeNull()
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
      // The bestiary link, sent as a sibling of `preset` rather than widening it —
      // a hand-built character has no creature behind it either.
      creature: null,
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
    // The species traits are still there: only the numbers it was borrowing are gone.
    // All three of the Human's, read off the species so this keeps saying what it means.
    expect(resolved.feats.map((entry) => entry.name)).toEqual(
      species('human')!.traits.map((trait) => trait.name),
    )
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

// ---------------------------------------------------------------------------
// Milestone 5: invariant 9 — the discriminator, in all four directions
// ---------------------------------------------------------------------------
//
// A FOURTH MEMBER OF `storedSheetValidator` IS THE ONE CHANGE THAT COULD NOT BE
// MADE SAFELY BY THE COMPILER, and the two bugs it shipped are the reason this
// section exists.
//
// `isMonsterSheet` is an allow-list of the kinds that may be published rather than a
// deny-list of the ones that must not be, and every kind-test that guards the secret
// now goes through it. The two that did not, before the invariant was written down:
//
//   - `characters.create` gated on `wanted.kind === 'npc'`, so a `bestiary` sheet
//     took the *un-gated* branch of the ternary. Any client that knows the game code
//     — it is in the URL — could have posted `{ kind: 'bestiary', entryKey:
//     'ancient-red-dragon', cr: 6 }` with no `dmCode` at all.
//   - `updateSheet` compared `kind === 'npc'` on both sides, so `pc → bestiary`
//     slipped past a check whose entire job is to stop a document crossing the line
//     that decides who may see it. `playerId` is routing rather than identity, so the
//     seat id of whoever holds a hero clears `requireEditableCharacter` — and the
//     result is an irreversible overwrite of that hero's whole stored sheet plus a
//     character that vanishes from its own player's screen.
//
// Neither of those was a type error. `tsc` had nothing to say about either, because
// both expressions are perfectly valid against a fourth union member. So the matrix
// is asserted through the API in every direction rather than trusted to a comparison.

/** A creature the bestiary really has, so `requireUsableSheet`'s corpus check passes. */
const BESTIARY_KEY = 'dire-wolf'
/** 22 hit points at CR 1 — hand-copied from `convex/lib/bestiary/monstersLow.ts`. */
const BESTIARY_MAX_HP = 22

function bestiarySheet(overrides: Partial<BestiarySheet> = {}): BestiarySheet {
  return { kind: 'bestiary', entryKey: BESTIARY_KEY, cr: 1, ...overrides }
}

/** Well-formed and wrong. A `dmCode` being present is not the same as being correct. */
function twiddleCode(code: string): string {
  return (code[0] === 'A' ? 'B' : 'A') + code.slice(1)
}

/** Every row in the table, so "nothing was created" can be said about the table itself. */
function allCharacterRows(t: Harness) {
  return t.run(async (ctx) => await ctx.db.query('characters').collect())
}

describe('characters.create — the DM gate keys off nothing at all now', () => {
  /**
   * ⚠️ **THE GATE IS NOW UNCONDITIONAL, AND THAT IS THE STRONGEST FORM OF THE REPAIR
   * THIS SECTION WAS ORIGINALLY WRITTEN FOR.**
   *
   * The ternary this describe block is named after — `isMonsterSheet(wanted) ? requireDm
   * : getGameByCode` — is gone rather than corrected again. A kind-test that does not
   * exist cannot come to disagree with `isMonsterSheet`, which is exactly how the
   * bestiary turned the *previous* formulation into a live auth bypass. So the property
   * worth pinning is no longer "the gate fires for the monster kinds" but "the gate fires
   * for all four, and a fifth would be gated by construction".
   *
   * All four stored kinds, and a create with no `sheet` at all — which is the shape the
   * lobby used to send and the one a stale client would still send. Every one of them
   * refuses with `NotDm` rather than with a validation error, because the gate is first
   * in the handler: the two `sheet`s below are deliberately *invalid* as well, so an
   * ordering that put `requireUsableSheet` in front would answer `BadInput` here and be
   * caught.
   */
  test('every kind is refused without the DM code, ahead of any validation', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)

    const attempts: [string, string, StoredSheet | undefined][] = [
      ['no sheet at all', 'Someone', undefined],
      ['a hand-built hero', 'Someone', pcSheet()],
      ['a premade hero', 'Someone', presetSheet()],
      ['a hand-built creature', 'Someone', npcSheet()],
      ['a bestiary creature', 'Someone', bestiarySheet()],
      // Invalid in *two* ways, so the answer says which check ran first. An ordering
      // that validated before gating would hand back `BadInput` for these and quietly
      // stop being a test of the gate at all.
      ['a blank name as well', '   ', undefined],
      ['a level-nought hero as well', 'Someone', pcSheet({ level: 0 })],
      ['a nought-hit-point creature as well', 'Someone', npcSheet({ maxHp: 0 })],
    ]

    for (const [label, name, sheet] of attempts) {
      for (const who of [{}, { dmCode: '' }, { dmCode: '   ' }, { dmCode: 'NOPENOPE' }]) {
        const refusal = await refusalOf(
          t.mutation(api.characters.create, {
            code,
            name,
            ...(sheet === undefined ? {} : { sheet }),
            ...who,
          }),
        )
        expect(refusal.kind, `${label} / ${JSON.stringify(who)}`).toBe('NotDm')
      }
    }

    expect(await allCharacterRows(t)).toEqual([])
  })

  /**
   * The positive control for the loop above: the same five requests, with the code,
   * every one of which lands. Without it the test above would pass against a `create`
   * that refused everybody.
   */
  test('positive control: with the DM code every kind is created', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    const kinds: [string, StoredSheet | undefined][] = [
      ['no sheet at all', undefined],
      ['a hand-built hero', pcSheet()],
      ['a premade hero', presetSheet()],
      ['a hand-built creature', npcSheet()],
      ['a bestiary creature', bestiarySheet()],
    ]

    for (const [label, sheet] of kinds) {
      await t.mutation(api.characters.create, {
        code,
        dmCode,
        name: label,
        ...(sheet === undefined ? {} : { sheet }),
      })
    }

    expect(await allCharacterRows(t)).toHaveLength(kinds.length)
    // And the two audiences still differ by exactly the creatures, so a DM-only create
    // has not made the heroes secret.
    expect((await t.query(api.characters.list, { code })).map((row) => row.name).sort()).toEqual(
      ['a hand-built hero', 'a premade hero', 'no sheet at all'].sort(),
    )
    expect(await t.query(api.characters.list, { code, dmCode })).toHaveLength(kinds.length)
  })
})

describe('characters.create — the DM gate keys off monster-ness, not off one kind', () => {
  /**
   * THE LIVE AUTH BYPASS, held down. All three shapes a client can send: no `dmCode`
   * field at all, an empty string, and a well-formed wrong code. The third is the one
   * that distinguishes a gate on the argument being *present* from a gate on it being
   * *correct*.
   */
  test('a bestiary creature cannot be created without the DM code, in any of three ways', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    for (const who of [{}, { dmCode: '' }, { dmCode: '   ' }, { dmCode: twiddleCode(dmCode) }]) {
      await expectKind(
        t.mutation(api.characters.create, {
          code,
          name: 'Something at the Ford',
          sheet: bestiarySheet(),
          ...who,
        }),
        'NotDm',
      )
    }

    // Asserted against the table rather than against `characters.list`, which filters
    // monsters out and would report an empty game either way.
    expect(await allCharacterRows(t)).toEqual([])
    expect(await t.query(api.characters.list, { code })).toEqual([])
    expect(await t.query(api.characters.vitals, { code, dmCode })).toEqual([])
  })

  test('the same creature is created cleanly with the right code, and is a monster', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const { characterId } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Something at the Ford',
      sheet: bestiarySheet(),
    })

    // The positive control for the refusals above, and the visibility rule in one:
    // hidden from a player, listed as an `npc` to the DM, and its hit points came out
    // of the corpus rather than out of the request.
    expect(await t.query(api.characters.list, { code })).toEqual([])
    expect(rowFor(await t.query(api.characters.list, { code, dmCode }), characterId).kind).toBe(
      'npc',
    )
    expect(await readSheet(t, code, characterId)).toBeNull()
    expect(await exactVitals(t, code, characterId, { dmCode })).toEqual({
      current: BESTIARY_MAX_HP,
      max: BESTIARY_MAX_HP,
    })
  })

  /**
   * `requireUsableSheet`'s corpus-membership check, which is the only place in the
   * application it can happen: `lib/sheet.ts` may never import `lib/bestiary/`,
   * because every function in that file also runs in the browser.
   */
  test('a key the corpus does not have is refused on write', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    for (const entryKey of ['no-such-beast', 'Dire-Wolf', '__proto__', 'toString']) {
      await expectSheetProblem(
        t.mutation(api.characters.create, {
          code,
          dmCode,
          name: 'Invented',
          sheet: bestiarySheet({ entryKey }),
        }),
        'entryKey',
      )
    }
    expect(await allCharacterRows(t)).toEqual([])
  })

  /**
   * ⚠️ **Refused on write, tolerated on read**, and the asymmetry is deliberate. A
   * character *stores* the key, so retiring an entry has to leave every character that
   * named it readable rather than unopenable — resolution runs inside
   * `characters.list`, where a throw would blank the party panel for the whole table.
   */
  test('a character whose stored key has been retired still reads as a usable monster', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const gameId = await gameIdFor(t, code)
    const orphan = await t.run(
      async (ctx) =>
        await ctx.db.insert('characters', {
          gameId,
          name: 'Something Retired',
          sheet: { kind: 'bestiary', entryKey: 'no-such-beast', cr: 3 },
        }),
    )

    const payload = await readSheet(t, code, orphan, { dmCode })
    expect(payload?.sheet.kind).toBe('npc')
    expect((payload?.sheet as NpcSheet).maxHp).toBe(defaultNpcSheet().maxHp)
    expect((payload?.sheet as NpcSheet).notes).toBe('')
    // Both halves or neither: the labels are gone, so none are sent.
    expect(payload?.creature).toBeNull()
    // And it is still a monster, so the retirement did not publish it.
    expect(await t.query(api.characters.list, { code })).toEqual([])
    expect(rowFor(await t.query(api.characters.list, { code, dmCode }), orphan).kind).toBe('npc')
  })
})

describe('characters.updateSheet — monster-ness may not change, in either direction', () => {
  /**
   * THE FOUR-DIRECTION MATRIX. `pc` and `preset` are the two kinds a player may see;
   * `npc` and `bestiary` are the two they may not. Crossing that line in a single write
   * is what is refused — the *storage form* is free to change, which is the whole
   * reason the comparison goes through `isMonsterSheet` rather than naming a kind.
   */
  test('a hero cannot become a creature and a creature cannot become a hero', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    const byHand = await makePc(t, code, 'Thorin', pcSheet())
    const premade = await makePreset(t, code, 'Brannoc')
    const creatureOne = (
      await t.mutation(api.characters.create, {
        code,
        dmCode,
        name: 'Wolf One',
        sheet: bestiarySheet(),
      })
    ).characterId
    const creatureTwo = (
      await t.mutation(api.characters.create, {
        code,
        dmCode,
        name: 'Wolf Two',
        sheet: bestiarySheet(),
      })
    ).characterId

    const crossings: [string, Id<'characters'>, StoredSheet][] = [
      ['pc → bestiary', byHand, bestiarySheet()],
      ['preset → bestiary', premade, bestiarySheet()],
      ['bestiary → pc', creatureOne, pcSheet()],
      ['bestiary → preset', creatureTwo, presetSheet()],
    ]

    for (const [label, characterId, sheet] of crossings) {
      const before = (await rawCharacter(t, characterId))?.sheet
      const refusal = await refusalOf(update(t, code, characterId, sheet, { dmCode }))
      expect(refusal.kind, label).toBe('BadInput')
      expect(refusal.message, label).toBe(
        'A character cannot change between a player character and an NPC.',
      )
      // Byte-identical afterwards: the refusal happens before any write, so a rejected
      // crossing cannot have overwritten half a sheet on the way past.
      expect((await rawCharacter(t, characterId))?.sheet, label).toStrictEqual(before)
    }

    // And nothing moved across the visibility line either way.
    expect(
      (await t.query(api.characters.list, { code })).map((row) => row._id).sort(),
    ).toEqual([byHand, premade].sort())
  })

  /**
   * THE ONE THE NETWORK TAB REACHES. `playerId` is routing rather than identity (ADR
   * 0004), so the seat id of whoever holds a hero — readable straight out of the public
   * roster — clears `requireEditableCharacter`. That is accepted for a hero's sheet,
   * which is not a secret from the party; what it must never buy is `pc → bestiary`,
   * because that write both destroys the hero's stored sheet irreversibly and makes the
   * character vanish from its own player's screen.
   */
  test('a seat holding a hero cannot overwrite it with a creature, and nothing is lost', async () => {
    const t = convexTest(schema, modules)
    const { code } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const wanted: PcSheet = pcSheet({
      className: 'Battle Skald',
      maxHp: 84,
      armourClass: 18,
      feats: [sheetEntry({ id: 'feat-second-wind' })],
    })
    const thorin = await makePc(t, code, 'Thorin', wanted)
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const refusal = await refusalOf(
      update(t, code, thorin, bestiarySheet(), { playerId: ana }),
    )
    expect(refusal.kind).toBe('BadInput')

    // Byte-identical, which is the assertion that matters: the attack was an
    // irreversible overwrite rather than a permission slip.
    expect((await rawCharacter(t, thorin))?.sheet).toStrictEqual(wanted)
    expect(rowFor(await t.query(api.characters.list, { code }), thorin).kind).toBe('pc')
    expect((await readSheet(t, code, thorin, { playerId: ana }))?.sheet).toEqual(wanted)
    expect(await exactVitals(t, code, thorin)).toEqual({ current: 84, max: 84 })
  })

  /**
   * `npc ↔ bestiary` IS PERMITTED IN BOTH DIRECTIONS, and that is required rather than
   * incidental: saving a linked creature as a plain `npc` sheet is the documented
   * one-way door out of CR scaling, and linking a hand-built monster to an entry is how
   * a DM adopts the feature at all. Monster-ness does not move in either case.
   */
  test('a hand-built monster may be linked to the bestiary, and a creature saved back out of it', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)

    // Adopting the feature: a goblin somebody typed in becomes a linked creature, and
    // its numbers now come out of the corpus.
    const typedIn = await makeNpc(t, code, dmCode, 'Goblin, typed in', npcSheet({ maxHp: 7 }))
    await update(t, code, typedIn, bestiarySheet(), { dmCode })
    expect((await rawCharacter(t, typedIn))?.sheet).toStrictEqual(bestiarySheet())
    expect((await readSheet(t, code, typedIn, { dmCode }))?.sheet.maxHp).toBe(BESTIARY_MAX_HP)

    // Leaving it: the resolved sheet is saved back as a hand-built one, which is the
    // door out of scaling. It stops being scalable and stays a monster.
    const resolved = (await readSheet(t, code, typedIn, { dmCode }))!.sheet as NpcSheet
    await update(t, code, typedIn, resolved, { dmCode })
    expect((await rawCharacter(t, typedIn))?.sheet).toMatchObject({ kind: 'npc', maxHp: BESTIARY_MAX_HP })
    await expectKind(
      t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: typedIn, cr: 4 }),
      'BadInput',
    )

    // Hidden from a player at every point in that journey.
    expect(await t.query(api.characters.list, { code })).toEqual([])
    expect(await readSheet(t, code, typedIn)).toBeNull()
  })

  /**
   * `applyPresetPermissions` refuses a monster outright rather than waving it through,
   * and the branch is unreachable only because `updateSheet`'s guard above stops a
   * creature arriving without the DM code. Asserted anyway, because the two facts that
   * make it unreachable live in another function.
   */
  test('a player with no DM code cannot edit a creature even with a seat id attached', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const { characterId: creature } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Wolf',
      sheet: bestiarySheet(),
    })

    for (const who of [{}, { playerId: ana }, { dmCode: twiddleCode(dmCode) }]) {
      await expectKind(update(t, code, creature, bestiarySheet({ cr: 6 }), who), 'CharacterNotFound')
    }
    expect((await rawCharacter(t, creature))?.sheet).toStrictEqual(bestiarySheet())
  })
})

describe('a bestiary creature is not a playable hero', () => {
  /**
   * A DISTINCT REFUSAL IS AN EXISTENCE ORACLE. Once the payload channel is closed, the
   * remaining way to enumerate the DM's shelf is to guess ids and read the error back —
   * so "you may not claim that one" and "no such character" have to be one answer,
   * message included.
   *
   * Compared with `toEqual` on the whole `{ kind, message }` rather than on the kind
   * alone, which is the stance the Milestone 3 tests one file over take.
   */
  test('claim refuses a creature exactly as it refuses a fabricated id', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const { characterId: creature } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Wolf',
      sheet: bestiarySheet(),
    })
    const ghost = await makeCharacter(t, code, 'Ghost')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: ghost })

    const claim = (characterId: Id<'characters'>) =>
      t.mutation(api.characters.claim, { code, playerId: ana, characterId })

    const forCreature = await refusalOf(claim(creature))
    expect(forCreature.kind).toBe('CharacterNotFound')
    expect(await refusalOf(claim(ghost))).toEqual(forCreature)

    expect(await heldBy(t, ana)).toBeNull()
  })

  /**
   * Refused even to the DM, because the rule is about what a seat may play rather than
   * about who is asking. Handing a player a monster would make its hit points exact on
   * every screen in the game through the `exact` variant of `publicVitalsValidator`.
   */
  test('assign refuses a creature to the DM, with the fabricated id’s own refusal', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const { characterId: creature } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Wolf',
      sheet: bestiarySheet(),
    })
    const ghost = await makeCharacter(t, code, 'Ghost')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: ghost })

    const assign = (characterId: Id<'characters'>) =>
      t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId })

    const forCreature = await refusalOf(assign(creature))
    expect(forCreature.kind).toBe('CharacterNotFound')
    expect(await refusalOf(assign(ghost))).toEqual(forCreature)
    expect(await heldBy(t, ana)).toBeNull()

    // The control: a real hero does go onto the seat, so the refusals above are about
    // the character rather than about `assign` being broken.
    const thorin = await makePc(t, code, 'Thorin', pcSheet())
    await assign(thorin)
    expect(await heldBy(t, ana)).toBe(thorin)
  })

  /**
   * The roster is a query nobody thinks of as privileged, which is why it is worth
   * checking: a seat holding a character resolves that character's name for the lobby.
   * `claim` and `assign` both refuse a creature, so the only way into this state is to
   * write it directly — which is the point. The filter has to be where the payload is
   * built, not only at the two doors.
   */
  test('the lobby roster never names a creature written onto a seat behind the API', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const { characterId: creature } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Maergan Tolt',
      sheet: bestiarySheet(),
    })
    await t.run(async (ctx) => {
      await ctx.db.patch('players', ana, { characterId: creature })
    })

    const roster = await t.query(api.players.list, { code })
    expect(roster.find((row) => row._id === ana)?.characterName).toBeNull()
    expect(JSON.stringify(roster) ?? '').not.toContain('Maergan Tolt')
  })
})

describe('the discriminator itself', () => {
  /**
   * ⚠️ **THE ONE-LINE FIX THAT DECIDES WHETHER EVERY PREPARED CREATURE IN THE GAME
   * REACHES PLAYERS**, asserted directly rather than only through a payload.
   *
   * `isMonsterSheet` is an allow-list with a `never` assignment behind it, so a fifth
   * union member fails `npm run lint` rather than answering `false` and publishing
   * itself. The runtime default is `true` — fail-closed — because a schema push is not
   * atomic across a deployment and a document written by a newer one can be read by an
   * older one for the seconds in between.
   */
  test('isMonsterSheet answers for all four stored kinds and for a sheet-less character', () => {
    expect(isMonsterSheet(npcSheet())).toBe(true)
    expect(isMonsterSheet(bestiarySheet())).toBe(true)
    expect(isMonsterSheet(pcSheet())).toBe(false)
    expect(isMonsterSheet(presetSheet())).toBe(false)
    // A Milestone 1 character has no sheet at all, and every one of them is a hero:
    // NPCs could not be created before sheets existed.
    expect(isMonsterSheet(undefined)).toBe(false)

    // Fail-closed on a kind this deployment has never heard of, which is the state a
    // mid-deploy read is in. Cast, because the type system's whole job here is to make
    // this unreachable from ordinary code.
    expect(isMonsterSheet({ kind: 'chimera' } as unknown as StoredSheet)).toBe(true)
  })

  /**
   * `kindOf` is what `maySeeCharacter`, `publicCharacters` and `playerCharacterNames`
   * all ask, and it used to read `doc.sheet?.kind === 'npc'` — a deny-list of the one
   * secret kind. Adding the bestiary member made it answer `'pc'` for a creature nobody
   * was allowed to see, while compiling cleanly and passing every test.
   */
  test('kindOf reports a bestiary creature as an npc without resolving anything', () => {
    expect(kindOf({ sheet: bestiarySheet() })).toBe('npc')
    expect(kindOf({ sheet: npcSheet() })).toBe('npc')
    expect(kindOf({ sheet: pcSheet() })).toBe('pc')
    expect(kindOf({ sheet: presetSheet() })).toBe('pc')
    expect(kindOf({})).toBe('pc')

    // And it answers for a creature the corpus does not have, because a security
    // predicate reads one stored field rather than reaching through ~130 stat blocks —
    // a content bug that made resolution throw would otherwise take `characters.list`
    // down for the whole table.
    expect(kindOf({ sheet: bestiarySheet({ entryKey: 'no-such-beast' }) })).toBe('npc')
  })
})

// ---------------------------------------------------------------------------
// Milestone 7: control, and what a grant is allowed to widen
// ---------------------------------------------------------------------------
//
// A grant is the first thing in this application that lets a player read a secret,
// so it is the first thing that can *lose* one. Everything below is written to bound
// it from both sides: the ungranted case still has to hold, and the granted case has
// to actually work, because a grant that quietly did nothing would pass every
// negative scan in this file and be discovered at the table instead.
//
// House style throughout — scan the **serialised** payload of a real query, and put a
// positive control beside every negative so the scan cannot pass on an empty fixture.

/**
 * Four separate spoilers about one creature, so a partial leak cannot pass as a clean
 * one, and none of them a string another payload has any reason to carry.
 *
 * The coin's name is deliberately none of the other three: a player is *supposed* to
 * see what is written on a token, so reusing the character's name for it would make
 * every scan below unable to tell a leak from the thing it is meant to allow.
 */
const WOLF_NAME = 'Wyrmshadow at the Ford'
const WOLF_NOTES = 'Answers to a whistle the party has not heard yet.'
const WOLF_ACTION = 'Sundering Wyrmbreath'
const WOLF_TOKEN_NAME = 'Shape in the Reeds'

/**
 * A **second** creature, with four needles of its own, for the tests about a rebind.
 *
 * Four rather than one for the reason the wolf has four, and distinct from the wolf's in
 * all four places on purpose: the rebind tests assert that one creature's spoilers left a
 * seat's payload in the same write that another's arrived, and a shared string anywhere
 * would make both halves of that unprovable — a scan that found `Wyrmshadow` could not say
 * which creature had put it there.
 *
 * ⚠️ **It gets no coin of its own in the fixture, and that absence is the whole
 * experiment.** The only route from a player to this creature is the token that used to
 * point at the wolf, so if the rebind were not moving sight along with the binding there
 * would be no other way for the sheet to arrive and the test could not pass by accident.
 */
const BEAR_NAME = 'Ursaline of the Bone Orchard'
const BEAR_NOTES = 'Was somebody’s pet before the winter that emptied the village.'
const BEAR_ACTION = 'Bonecrush Embrace'

/** A hero the DM has built for a player who has not arrived. */
const RESERVED_NAME = 'Seraphine the Unarrived'

/**
 * Its maximum, and three digits that appear nowhere else in the fixture on purpose. A
 * monster on `12/20` would make the scan below lie in both directions: `20` occurs in
 * an ability score and in the middle of a timestamp, so a scan for it either fires on
 * nothing or fires on everything. `vitals.test.ts` picked 271 for the same reason.
 */
const WOLF_MAX_HP = 271

/**
 * The second creature's maximum, and a **different** three digits that likewise appear
 * nowhere else in this file — checked, not assumed, and the same check is owed to anybody
 * who adds a third. `271` is the wolf's here and in `vitals.test.ts`, `293` is the granted
 * creature's in `board-smoke.mjs` and `181` the ambush's, so `347` is the free one. Two
 * creatures sharing a maximum would make "the wolf's hit points left and the bear's
 * arrived" a single unfalsifiable assertion about one number.
 */
const BEAR_MAX_HP = 347

/**
 * `271` as a number in the payload, rather than `271` sitting inside a document id or a
 * millisecond timestamp. The same instrument `vitals.test.ts` documents at length: a
 * plain `toContain('271')` fires on a `_creationTime` and so passes or fails on the
 * clock.
 */
function containsNumber(serialised: string, value: number): boolean {
  return new RegExp(`(?<![\\w.])${value}(?![\\w.])`).test(serialised)
}

/** The creature's own sheet, with all four of its secrets written onto it. */
function wolfSheet(): NpcSheet {
  return npcSheet({
    maxHp: WOLF_MAX_HP,
    notes: WOLF_NOTES,
    actions: [sheetEntry({ id: 'act-1', name: WOLF_ACTION, roll: '4d6+3' })],
  })
}

/** The second creature's, built the same way so the two are comparable in every respect. */
function bearSheet(): NpcSheet {
  return npcSheet({
    maxHp: BEAR_MAX_HP,
    notes: BEAR_NOTES,
    actions: [sheetEntry({ id: 'act-1', name: BEAR_ACTION, roll: '2d8+5' })],
  })
}

/**
 * Two seats, **two** creatures, and a coin for the first of them on the layer the caller
 * names.
 *
 * The default is the **player** layer, for the reason `vitals.test.ts` gives about its
 * own fixture: a creature hidden on the DM layer would make every assertion pass for
 * the wrong reason, because the token choke point would have dropped it before
 * `maySeeCharacter` was ever asked a hard question. The `dm` variant is used by exactly
 * one test, and that test is about the composition of the two rules.
 *
 * ⚠️ **The bear has no coin, deliberately.** `board.setCharacter` rebinding the wolf's
 * token is the only path from a player to it, so a rebind that failed to move sight would
 * leave the bear unreachable rather than reachable by some second route — which is what
 * makes the assertion below about the *rebind* rather than about the board in general.
 * Giving it a token of its own would be the change that quietly turns those tests into
 * tests of `addToken`.
 */
async function grantFixture(t: Harness, layer: 'background' | 'player' | 'gm' = 'player') {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  const ana = await makeSeat(t, game.code, 'Ana')
  const ben = await makeSeat(t, game.code, 'Ben')

  const wolf = await makeNpc(t, game.code, game.dmCode, WOLF_NAME, wolfSheet())
  const wolfToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: WOLF_TOKEN_NAME,
    layer,
    characterId: wolf,
  })

  const bear = await makeNpc(t, game.code, game.dmCode, BEAR_NAME, bearSheet())

  // The fixture asserts its own needles, exactly as `board.test.ts`'s `boardFixture`
  // reaches for the DM's view of the hidden token before handing it back. A negative
  // scan for a string the database does not contain passes for the wrong reason, and the
  // bear is the one creature here that nothing else in the fixture touches — a sheet that
  // had silently failed to save, or a `maxHp` that some future default overwrote, would
  // make every "no trace of the bear" assertion below vacuous and nothing would say so.
  const written = await t.query(api.characters.sheet, {
    code: game.code,
    dmCode: game.dmCode,
    characterId: bear,
  })
  const serialised = JSON.stringify(written) ?? ''
  if (
    written?.name !== BEAR_NAME ||
    !serialised.includes(BEAR_NOTES) ||
    !serialised.includes(BEAR_ACTION) ||
    !containsNumber(serialised, BEAR_MAX_HP)
  ) {
    throw new Error('the second creature’s four needles are not all on its stored sheet')
  }

  return { ...game, sceneId, ana, ben, wolf, wolfToken, bear }
}

type GrantFixture = Awaited<ReturnType<typeof grantFixture>>

/** The DM hands a token to a set of seats. The only writer of a grant. */
async function grant(
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

/**
 * Every payload one seat's client can fetch, keyed by name so a failure says which
 * query leaked rather than which array index did.
 *
 * `playerId` is threaded into the two queries that take one, because a grant is
 * answered per seat — a scan that omitted it would be scanning the anonymous payload
 * and reporting the answer as the granted seat's.
 *
 * `characterId` names which creature the sheet query asks about, defaulting to the wolf so
 * that no existing caller moves. It is an argument because there are two creatures now and
 * `characters.sheet` is reached with an id in hand: a scan for the bear's spoilers over a
 * payload set that had only ever asked about the wolf would be missing the one query that
 * could actually have answered with them.
 */
async function seatPayloads(
  t: Harness,
  fixture: GrantFixture,
  playerId?: Id<'players'>,
  characterId: Id<'characters'> = fixture.wolf,
): Promise<Record<string, unknown>> {
  const { code, sceneId } = fixture
  const who = playerId === undefined ? {} : { playerId }
  return {
    'characters.list': await t.query(api.characters.list, { code }),
    'characters.sheet (the creature)': await t.query(api.characters.sheet, {
      code,
      characterId,
      ...who,
    }),
    'characters.vitals': await t.query(api.characters.vitals, { code, ...who }),
    'board.tokens': await t.query(api.board.tokens, { code }),
    'board.positions': await t.query(api.board.positions, { code, sceneId }),
    'players.list': await t.query(api.players.list, { code }),
  }
}

/**
 * The two payloads that **enumerate characters**, and are therefore the two where the
 * creature's document id is itself a secret.
 *
 * ⚠️ **The id is deliberately not swept out of the other four, and the reason is
 * Milestone 2 and 3 rather than a hole this scan is papering over.** A creature whose
 * coin is on the player layer is one the party can see standing there, so `board.tokens`
 * carries its `characterId` — that is what binds a coin to a health bar — and
 * `characters.vitals` carries the same id on the `band` row for the same reason. Both
 * are bounded by `visibleCharacterIds`, so a creature the player cannot see contributes
 * neither. What must never travel is the *sheet*: the name, the notes, the actions and
 * the numbers, which is what the loop below hunts for in all six.
 *
 * When the coin itself is hidden the id must be gone from everything, and the DM-layer
 * test asserts that directly rather than through this helper — an empty `board.tokens`
 * is a stronger and clearer claim than a substring miss.
 */
const CHARACTER_ENUMERATING = ['characters.list', 'characters.sheet (the creature)']

/**
 * One creature's whole spoiler, as a value, so a scan can name which creature it is
 * hunting for.
 *
 * The four needles travelled as module constants while there was one creature to hunt.
 * There are two now — the wolf a token points at, and the bear a rebind points it at — and
 * the interesting assertion is that one of them left a payload in the same write the other
 * arrived in. That is two scans of the same payloads with different needles, which is a
 * parameter rather than a second copy of the loop.
 */
type CreatureNeedles = {
  id: Id<'characters'>
  name: string
  notes: string
  action: string
  maxHp: number
}

function wolfNeedles(fixture: GrantFixture): CreatureNeedles {
  return {
    id: fixture.wolf,
    name: WOLF_NAME,
    notes: WOLF_NOTES,
    action: WOLF_ACTION,
    maxHp: WOLF_MAX_HP,
  }
}

function bearNeedles(fixture: GrantFixture): CreatureNeedles {
  return {
    id: fixture.bear,
    name: BEAR_NAME,
    notes: BEAR_NOTES,
    action: BEAR_ACTION,
    maxHp: BEAR_MAX_HP,
  }
}

/** Not one of the named creature's secrets is anywhere in these payloads. */
function expectNoCreature(payloads: Record<string, unknown>, needles: CreatureNeedles) {
  for (const [name, payload] of Object.entries(payloads)) {
    const serialised = JSON.stringify(payload) ?? ''
    if (CHARACTER_ENUMERATING.includes(name)) {
      expect(serialised, `${name} leaked the creature's id`).not.toContain(needles.id)
    }
    expect(serialised, `${name} leaked the creature's name`).not.toContain(needles.name)
    expect(serialised, `${name} leaked the creature's notes`).not.toContain(needles.notes)
    expect(serialised, `${name} leaked one of its actions`).not.toContain(needles.action)
    expect(containsNumber(serialised, needles.maxHp), `${name} leaked its maximum`).toBe(false)
    // The discriminator, the way board.test.ts sweeps for `"dm"`. No player payload has
    // a reason to carry it: the list filters creature rows out and the sheet refuses one.
    //
    // Not one of the four needles, and so not keyed off `needles` — it is a property of
    // the *payload* rather than of either creature, which is why it stays in the loop and
    // is asserted twice when both creatures are scanned over the same payloads. Two
    // identical assertions cost nothing; one that had been lifted out to the wrong scan
    // would have gone quiet for the other.
    expect(serialised, `${name} leaked the npc discriminator`).not.toContain('"npc"')
  }
}

/**
 * The wolf, which is the creature every test written before the rebind existed is about.
 * Kept so none of those call sites has to move: they say what they mean already, and a
 * needles argument at each of them would be a fixture detail repeated fourteen times.
 */
function expectNoWolf(payloads: Record<string, unknown>, fixture: GrantFixture) {
  expectNoCreature(payloads, wolfNeedles(fixture))
}

describe('an ungranted creature is in no player payload', () => {
  /**
   * MILESTONE 3'S GUARANTEE, RE-PROVEN WITH THE GRANT MACHINERY IN THE PATH.
   *
   * `characters.sheet` now reads the roster and the board before it decides, and
   * `maySeeCharacter` takes a third argument. Either change could have widened the
   * default case by accident — an empty set that answered `true`, or a `?? true` where
   * the fail-closed `?? false` belongs — and neither would be visible in a type.
   *
   * Both seats are swept, and so is the caller with no seat at all, because the seat
   * argument is the thing that changed.
   */
  test('no seat sees the creature’s id, name, notes or actions with no grant written', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)

    for (const playerId of [undefined, fixture.ana, fixture.ben]) {
      expectNoWolf(await seatPayloads(t, fixture, playerId), fixture)
    }

    // The creature's token is *supposed* to be visible: a player looking at the board
    // sees a coin called `Shape in the Reeds`. If that had gone too, the scan above
    // would be passing because the fixture had nothing in it.
    const tokens = await t.query(api.board.tokens, { code: fixture.code })
    expect(tokens.map((token) => token.name)).toEqual([WOLF_TOKEN_NAME])
  })

  /**
   * THE POSITIVE CONTROL. Every needle the scan above hunted for is genuinely in the
   * database and genuinely reachable — with the DM code, and only with it.
   */
  test('positive control: the DM’s own list and sheet carry every one of them', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, dmCode } = fixture

    const list = JSON.stringify(await t.query(api.characters.list, { code, dmCode })) ?? ''
    expect(list).toContain(fixture.wolf)
    expect(list).toContain(WOLF_NAME)

    const sheet =
      JSON.stringify(
        await t.query(api.characters.sheet, { code, dmCode, characterId: fixture.wolf }),
      ) ?? ''
    expect(sheet).toContain(fixture.wolf)
    expect(sheet).toContain(WOLF_NAME)
    expect(sheet).toContain(WOLF_NOTES)
    expect(sheet).toContain(WOLF_ACTION)
  })
})

describe('a grant opens the sheet, and opens it for exactly one seat', () => {
  /**
   * THE FEATURE AND ITS BOUND, IN ONE TEST. Ana is handed the party's wolf and Ben is
   * not, so one query answers two different things for two seats at one table — which
   * is the whole reason `characters.sheet` and `characters.vitals` take a seat id at
   * all, and the whole reason it costs a cache entry per seat.
   *
   * Ben's side is a full payload scan rather than a null check, because a grant is the
   * first thing in this application that widens what a player may read, and the
   * interesting failure is not "Ben's sheet query answered" but "the creature turned up
   * in something else of Ben's on the way past".
   */
  test('the granted seat reads the creature and the ungranted seat sees nothing of it', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, ana, ben, wolf } = fixture

    await grant(t, fixture, fixture.wolfToken, [ana])

    const forAna = await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana })
    expect(forAna?._id).toBe(wolf)
    expect(forAna?.name).toBe(WOLF_NAME)
    expect((forAna?.sheet as NpcSheet).notes).toBe(WOLF_NOTES)
    expect((forAna?.sheet as NpcSheet).actions.map((action) => action.name)).toEqual([WOLF_ACTION])

    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ben }),
    ).toBeNull()
    expectNoWolf(await seatPayloads(t, fixture, ben), fixture)
    // And the caller with no seat at all, which is the fail-closed case: `undefined`
    // means no grants rather than every grant.
    expectNoWolf(await seatPayloads(t, fixture, undefined), fixture)
  })

  /**
   * ⚠️ **A GRANTED CREATURE STAYS ABSENT FROM `characters.list`, AND THAT IS DELIBERATE
   * RATHER THAN A GAP.**
   *
   * `publicCharacters` takes no controlled set, on the grounds that `characters.list` is
   * one per-game subscription shared by every client and a `playerId` would split it
   * into a cache entry per seat on the query the whole shell re-renders from. A grant is
   * answered where a grant is used — the board, and `characters.sheet`.
   *
   * Pinned here rather than left to be discovered, because the two obvious readings of
   * "the sheet arrives" disagree about it, and the wrong one is the one somebody would
   * implement by adding an argument to the busiest query in the app.
   */
  test('the granted seat’s character list is unchanged — a grant is answered elsewhere', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)

    const before = JSON.stringify(await t.query(api.characters.list, { code: fixture.code })) ?? ''
    await grant(t, fixture, fixture.wolfToken, [fixture.ana])
    const after = JSON.stringify(await t.query(api.characters.list, { code: fixture.code })) ?? ''

    expect(after).toBe(before)
    expect(after).not.toContain(WOLF_NAME)
    // The control: the DM's list does carry it, so the comparison above is between two
    // payloads of a game that has a creature in it. **Both** of the fixture's creatures,
    // sorted — the second one has no coin and no grant, so its presence here is the plainest
    // statement that this list answers no question about either.
    expect(
      (await t.query(api.characters.list, { code: fixture.code, dmCode: fixture.dmCode }))
        .map((row) => row.name)
        .sort(),
    ).toEqual([WOLF_NAME, BEAR_NAME].sort())
  })

  /** Revoking is the same door shutting: the DM writes an empty list and the sheet goes. */
  test('revoking the grant closes the sheet again', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, ana, wolf } = fixture

    await grant(t, fixture, fixture.wolfToken, [ana])
    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana }),
    ).not.toBeNull()

    await grant(t, fixture, fixture.wolfToken, [])
    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana }),
    ).toBeNull()
    expectNoWolf(await seatPayloads(t, fixture, ana), fixture)
  })
})

describe('a grant on a DM-layer token reveals nothing', () => {
  /**
   * ⚠️ **THE COMPOSITION, ASSERTED RATHER THAN DESCRIBED — the most important test in
   * this section.**
   *
   * `controlledCharacterIds` is built from `visibleTokens`, so a grant written onto a
   * DM-layer token contributes nothing for a player: the token was filtered out one line
   * earlier, by `maySee`, which keys off the DM code and nothing else. Sight of the coin
   * is the precondition for sight of the sheet, structurally rather than because
   * somebody remembered to test the layer a second time.
   *
   * The second half is what makes this a composition rather than a refusal. Nothing
   * about the grant changes when the DM moves the token to the player layer — the stored
   * `controllerIds` array is byte-identical across the move, which is asserted — and yet
   * the sheet arrives. That is the behaviour the DM panel's "move it to the player layer
   * for them to see it" copy is describing, and it holds in both directions rather than
   * being a one-way door that happened to open.
   *
   * ⚠️ **The round trip is driven through `api.board.setLayer`, which is what makes this
   * assertion and § 28 of `scripts/board-smoke.mjs` the same round trip.** ADR 0009
   * promises this property is "asserted twice, in the two places this project asserts
   * secrets" — and until the DM's Tokens tab existed there was no mutation that re-layered
   * a token, so the two places asserted it around the API rather than through it: this test
   * patched the row with `t.run`, and the smoke script added a *second* token on the other
   * layer because it has no `t.run` to reach for. Two different workarounds standing in for
   * one claim is the weakest form "asserted twice" can take — neither of them exercised the
   * write the app now makes, so a `setLayer` that patched the wrong field would have left
   * both of them green.
   *
   * `t.run` is still the right instrument for a state no mutation can produce, and the
   * roster test below uses it for exactly that. This is no longer such a state.
   */
  test('the sheet is withheld on the dm layer and arrives on the player layer', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t, 'gm')
    const { code, dmCode, ana, wolf, wolfToken } = fixture

    /** The one write under test, so the two flips below cannot drift apart. */
    const setLayer = (layer: 'background' | 'player' | 'gm') =>
      t.mutation(api.board.setLayer, { code, dmCode, tokenId: wolfToken, layer })

    await grant(t, fixture, wolfToken, [ana])

    // The grant is written down — this is not a test of a grant that failed to save.
    expect((await rawToken(t, wolfToken))?.controllerIds).toEqual([ana])
    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana }),
    ).toBeNull()
    expectNoWolf(await seatPayloads(t, fixture, ana), fixture)
    // Not even the coin, which is the reason the sheet is withheld.
    expect(await t.query(api.board.tokens, { code })).toEqual([])

    await setLayer('player')

    // Nothing about the grant moved; the token did. `setTokenLayer` does not read
    // `controllerIds` and must not — a grant on a DM-layer token is inert rather than
    // revoked, which is what lets a DM hand the party its pet before revealing it.
    expect((await rawToken(t, wolfToken))?.controllerIds).toEqual([ana])
    const arrived = await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana })
    expect(arrived?._id).toBe(wolf)
    expect(arrived?.name).toBe(WOLF_NAME)

    await setLayer('gm')
    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana }),
    ).toBeNull()
    // And the grant survived the return trip too, so the door is genuinely two-way rather
    // than a one-way one that happened to open.
    expect((await rawToken(t, wolfToken))?.controllerIds).toEqual([ana])
  })
})

describe('a rebind moves sight with the token', () => {
  /**
   * ⚠️ **THE MILESTONE'S HEADLINE SECRECY ASSERTION, AND THE SHARPEST WRITE ON THE BOARD.**
   *
   * `boardCharacterAccess` reads `token.characterId` as it iterates `visibleTokens`, so the
   * binding a coin carries *now* is what decides which sheets and which exact hit points a
   * granted seat receives. One `board.setCharacter` therefore moves a creature's whole
   * spoiler between seats — out of one player's payload and into it for another — in a
   * single patch of a single field, with **nothing written to `controllerIds`** to make
   * either half happen.
   *
   * That is the ordinary case rather than a bug, which is why nothing refuses it: a DM
   * pointing the party's coin at the creature it is now standing in for is most of what the
   * Tokens tab is. But it is the one write in that tab that can publish a monster's stat
   * block without looking as though it touched a secret, so the property is pinned here
   * rather than left to the panel's copy.
   *
   * The bear is deliberately coinless (see `grantFixture`), so the rebind is the *only*
   * route to it and the second half of this test cannot pass by some other means.
   */
  test('the granted seat loses the old creature’s sheet and gains the new one’s', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, dmCode, ana, wolf, wolfToken, bear } = fixture

    await grant(t, fixture, wolfToken, [ana])

    // ⚠️ **THE PRECONDITION, ASSERTED BEFORE THE WRITE.** Without it every scan below
    // passes on a fixture where Ana could never read the wolf in the first place, which is
    // the shape of empty-fixture failure this whole section is written against. Two of the
    // wolf's four needles and its exact maximum, so it is the grant that is proven working
    // and not merely the existence of a row.
    const before = await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana })
    expect(before?.name).toBe(WOLF_NAME)
    expect((before?.sheet as NpcSheet).notes).toBe(WOLF_NOTES)
    // `exactVitals` throws unless the row really is the `exact` variant, which is the
    // sharpest way to ask this: a band would mean the grant had carried sight without
    // carrying hit points, which ADR 0009 calls half a feature.
    expect((await exactVitals(t, code, wolf, { playerId: ana })).max).toBe(WOLF_MAX_HP)

    // Captured as bytes rather than as a value, because "unchanged" is the claim: the
    // stored array is what a rebind must not touch, and comparing the serialisation says
    // so about the whole field rather than about a length or a membership.
    const grantsBefore = JSON.stringify((await rawToken(t, wolfToken))?.controllerIds)
    expect(grantsBefore).toBe(JSON.stringify([ana]))

    await t.mutation(api.board.setCharacter, {
      code,
      dmCode,
      tokenId: wolfToken,
      characterId: bear,
    })

    // (1) The wolf is gone, in the query that would have answered with it and in every
    // other payload this seat can fetch. `characters.sheet` first, because a null there is
    // the specific claim; the sweep after it is the general one, and it looks for the
    // numbers with `containsNumber` rather than `toContain` for the reason that helper
    // documents.
    expect(
      await t.query(api.characters.sheet, { code, characterId: wolf, playerId: ana }),
    ).toBeNull()
    expectNoWolf(await seatPayloads(t, fixture, ana), fixture)

    // (2) The bear arrived through the very same grant — the one written for the wolf,
    // never re-written, and never pointed at the bear by anybody. Its sheet, three of its
    // four needles, and — because a grant carries hit points and not only sight — the
    // `exact` variant of the vitals row rather than a band.
    const after = await t.query(api.characters.sheet, { code, characterId: bear, playerId: ana })
    expect(after?._id).toBe(bear)
    expect(after?.name).toBe(BEAR_NAME)
    expect((after?.sheet as NpcSheet).notes).toBe(BEAR_NOTES)
    expect((after?.sheet as NpcSheet).actions.map((action) => action.name)).toEqual([BEAR_ACTION])
    expect((await exactVitals(t, code, bear, { playerId: ana })).max).toBe(BEAR_MAX_HP)

    // And the wolf has **no row at all** in Ana's vitals, not a band. A band would still be
    // a leak of the shape `boardCharacterAccess`'s `visible` set exists to close: the length
    // of that array publishes how many creatures are on the board.
    const rows = await t.query(api.characters.vitals, { code, playerId: ana })
    expect(rows.map((row) => row.characterId)).toEqual([bear])

    // (3) ⚠️ **Nothing was written to the token to make any of the above true.** The grant
    // is byte-identical across the rebind, which is the point: `setTokenCharacter` must not
    // migrate `controllerIds`, because the claim holder is composed *in* by
    // `effectiveControllersOf` from whatever the token points at now, and writing the
    // derived half down is the denormalisation ADR 0004 refused for `layer`.
    expect(JSON.stringify((await rawToken(t, wolfToken))?.controllerIds)).toBe(grantsBefore)
  })

  /**
   * THE POSITIVE CONTROL for the test above, and it has to span both sides of the write.
   * Every needle of both creatures is genuinely in the database before the rebind and still
   * there after it, so the disappearance asserted above is **Ana's payload and not the
   * database**. A rebind that had deleted the wolf, or that had never saved the bear, would
   * satisfy every negative scan in the previous test, and this is the one that refuses it.
   *
   * Both stages loop over one scan rather than being written out twice, because the claim is
   * that the DM's view is *unaffected* by the write: two hand-written copies is where one of
   * them quietly stops asserting a needle the other still does.
   */
  test('positive control: the DM reads both creatures on both sides of the rebind', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, dmCode, ana, wolf, wolfToken, bear } = fixture

    await grant(t, fixture, wolfToken, [ana])

    const dmSees = async () => {
      const list = JSON.stringify(await t.query(api.characters.list, { code, dmCode })) ?? ''
      const sheets = await Promise.all(
        [wolf, bear].map((characterId) =>
          t.query(api.characters.sheet, { code, dmCode, characterId }),
        ),
      )
      return `${list}${JSON.stringify(sheets) ?? ''}`
    }

    for (const stage of ['before', 'after'] as const) {
      if (stage === 'after') {
        await t.mutation(api.board.setCharacter, {
          code,
          dmCode,
          tokenId: wolfToken,
          characterId: bear,
        })
      }

      const serialised = await dmSees()
      for (const needles of [wolfNeedles(fixture), bearNeedles(fixture)]) {
        expect(serialised, `${stage}: the DM lost the creature's id`).toContain(needles.id)
        expect(serialised, `${stage}: the DM lost the creature's name`).toContain(needles.name)
        expect(serialised, `${stage}: the DM lost the creature's notes`).toContain(needles.notes)
        expect(serialised, `${stage}: the DM lost one of its actions`).toContain(needles.action)
        expect(
          containsNumber(serialised, needles.maxHp),
          `${stage}: the DM lost its maximum`,
        ).toBe(true)
      }
    }
  })

  /**
   * The bound on the feature. A rebind hands the new creature to the seats holding the
   * grant and to nobody else, so the seat that was never granted anything gains nothing —
   * and neither does the caller with no seat at all, which is the fail-closed case
   * `boardCharacterAccess` returns an empty `controlled` set for.
   *
   * Ben is swept rather than null-checked for the reason his side of the grant test is: the
   * interesting failure is not "Ben's sheet query answered" but "the bear turned up in
   * something else of Ben's on the way past", and the sheet query is asked about the *bear*
   * here so the one query that could have answered with it is actually in the sweep.
   */
  test('the ungranted seat and the anonymous caller gained nothing from the rebind', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, dmCode, ana, ben, wolfToken, bear } = fixture

    await grant(t, fixture, wolfToken, [ana])
    await t.mutation(api.board.setCharacter, {
      code,
      dmCode,
      tokenId: wolfToken,
      characterId: bear,
    })

    for (const playerId of [undefined, ben]) {
      expectNoCreature(await seatPayloads(t, fixture, playerId, bear), bearNeedles(fixture))
    }

    // The coin is still on the board for both of them, which is what makes the scans above
    // scans of a payload with something in it. A player is *supposed* to see a coin called
    // `Shape in the Reeds` standing there — what the rebind changed is what it stands for,
    // and that is the thing they may not have.
    expect((await t.query(api.board.tokens, { code })).map((token) => token.name)).toEqual([
      WOLF_TOKEN_NAME,
    ])
  })
})

// A separate describe from the three above, because it is a separate property. Those are
// about **sight** — which sheets and which hit points a rebind moves between seats. This one
// is about **control**, which travels the other way through the same field and is the reason
// a token payload carries two controller arrays rather than one.
describe('a rebind moves derived control with the token', () => {
  /**
   * ⚠️ **THE OTHER HALF OF A REBIND, AND THE REASON `publicTokenValidator` CARRIES TWO
   * CONTROLLER FIELDS RATHER THAN ONE.**
   *
   * The tests above are about a *granted* seat, where the stored array is what opens the
   * door. This one has no grant in it at all: Ana controls the coin because she is playing
   * the character it is bound to, and `effectiveControllersOf` composes that in from the
   * claim pointer on her seat every time the payload is built. So pointing the coin
   * somewhere else takes her control away **with nothing written to the token** — no patch
   * to `controllerIds`, no patch to her seat, and her claim on the hero entirely intact.
   *
   * Which is exactly why the payload carries both `controllerIds` and `grantedPlayerIds`:
   * the difference between the two arrays *is* the derived half, and a dialog handed only
   * the effective set would have to subtract the claim holder back out — the control rule
   * re-implemented in the browser, in a second language, which ADR 0005 recorded as a real
   * failure and said to stop doing.
   *
   * The write side is asserted too, because a payload changing is only half the claim: a
   * `setTokenCharacter` that had helpfully migrated the array would produce the same
   * `controllerIds: []` here while leaving a stale grant behind on the row.
   */
  test('a control-only seat loses the coin when the binding moves', async () => {
    const t = convexTest(schema, modules)
    const fixture = await grantFixture(t)
    const { code, dmCode, sceneId, ana, bear } = fixture

    const thorin = await makePc(t, code, 'Thorin', pcSheet())
    // The coin's name is deliberately not the character's, the way `WOLF_TOKEN_NAME` is
    // not `WOLF_NAME`: a token's label is something every player is meant to read, so
    // reusing the hero's name for it would make any scan unable to tell the two apart.
    const heroToken = await addToken(t, code, dmCode, sceneId, {
      name: 'Dwarf in Plate',
      characterId: thorin,
    })
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    /** The public row, which is where the two halves of control are visible. */
    const publicRow = async () => {
      const row = (await t.query(api.board.tokens, { code })).find(
        (token) => token._id === heroToken,
      )
      if (!row) throw new Error('the hero’s coin is missing from the board')
      return row
    }

    const move = () =>
      t.mutation(api.board.moveToken, {
        code,
        sceneId,
        tokenId: heroToken,
        x: 620,
        y: 620,
        settle: true,
        playerId: ana,
      })

    // Derived, not granted: Ana is in the effective set and absent from the stored one, and
    // the stored field has never been written at all — which is the state the whole test
    // depends on being distinguishable from an empty grant.
    expect(await publicRow()).toMatchObject({ controllerIds: [ana], grantedPlayerIds: [] })
    expect((await rawToken(t, heroToken))?.controllerIds).toBeUndefined()
    // And the control: she really can move it, so the refusal below is caused by the rebind
    // rather than by anything else about this fixture.
    await move()

    await t.mutation(api.board.setCharacter, {
      code,
      dmCode,
      tokenId: heroToken,
      characterId: bear,
    })

    expect(await publicRow()).toMatchObject({ controllerIds: [], grantedPlayerIds: [] })
    await expectKind(move(), 'TokenNotYours')

    // Nothing was written to the token to make that happen, and nothing was taken off her
    // seat either: she is still playing Thorin, which is the point — a rebind is a statement
    // about a coin, not about a claim.
    expect((await rawToken(t, heroToken))?.controllerIds).toBeUndefined()
    expect(await heldBy(t, ana)).toBe(thorin)
  })
})

describe('characters.setReserved and what reserved means', () => {
  /**
   * A hero the DM has built for somebody who is not at the table yet, one ordinary hero
   * beside it, and a seat that will eventually be handed the first.
   */
  async function reservedFixture(t: Harness) {
    const game = await makeGame(t)
    const ana = await makeSeat(t, game.code, 'Ana')
    const seraphine = await makePc(t, game.code, RESERVED_NAME, pcSheet())
    const thorin = await makePc(t, game.code, 'Thorin', pcSheet())
    await t.mutation(api.characters.setReserved, {
      code: game.code,
      dmCode: game.dmCode,
      characterId: seraphine,
      reserved: true,
    })
    return { ...game, ana, seraphine, thorin }
  }

  /**
   * ⚠️ **RESERVED MEANS ABSENT, NOT GREYED OUT — AND THE ROSTER IS THE SECOND PLACE THE
   * NAME WOULD SHIP.**
   *
   * `publicCharacters` builds the character list and `playerCharacterNames` builds the
   * roster, which `players.list` prints as `characterName` in the lobby and in the strip
   * over the board. Filtering one and not the other publishes exactly the thing
   * reserving it was meant to withhold. Both are scanned, and the roster is reached
   * through a seat written to hold the character directly — `claim` refuses a reserved
   * character and `assign` clears the flag, so that state is unreachable through the
   * API, which is precisely why the filter has to live where the payload is built rather
   * than at the two doors.
   */
  test('a reserved character is in no player payload, and is in the DM’s', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const { code, dmCode, ana, seraphine } = fixture

    // ⚠️ **The sheet is asserted *before* the seat is tampered with, and that ordering
    // is the honest one.** Reserved is a filter on the two payloads that *enumerate* —
    // the character list and the roster — and `characters.sheet` is not one of them: it
    // is reached with an id in hand, and it answers null here because the character is
    // unclaimed and ungranted, which is a rule that predates reserving. A reserved
    // character is unclaimable by construction (`claim` refuses it, `setReserved`
    // refuses a held one), so "reserved and claimed" is not a state the sheet gate has
    // to have an opinion about.
    expect(await readSheet(t, code, seraphine, { playerId: ana })).toBeNull()
    expect(await readSheet(t, code, seraphine)).toBeNull()

    // Now behind the API, because nothing supported can produce a seat holding a
    // reserved character — which is exactly why the roster filter is not redundant with
    // the list filter, and why it has to live where the payload is built.
    await t.run(async (ctx) => await ctx.db.patch('players', ana, { characterId: seraphine }))

    // ⚠️ **`players.list` is now the query behind the landing page's seat picker as well
    // as the in-game roster, so this array is scanning the front page of the site.** It
    // used to have `players.listNames` beside it — the door's own query, which carried a
    // display name and an `isDm` badge and no character name at all — and that query is
    // gone: the seat picker has to show the character each seat holds, which is the whole
    // point of picking your name off a list rather than retyping it, so the door reads
    // this one. Which means the two filters in `playerCharacterNames` are what stop a
    // stranger who has typed no code at all being told the party is waiting on
    // `Seraphine the Unarrived`.
    for (const payload of [
      await t.query(api.characters.list, { code }),
      await t.query(api.characters.list, { code, dmCode: 'NOPENOPE' }),
      await t.query(api.players.list, { code }),
    ]) {
      expect(JSON.stringify(payload) ?? '').not.toContain(RESERVED_NAME)
    }

    // The roster nulls the id along with the name rather than beside it, so a filtered
    // character leaves neither half behind for a client to take to another query.
    expect(
      (await t.query(api.players.list, { code })).find((seat) => seat._id === ana),
    ).toMatchObject({ characterId: null, characterName: null })

    // The positive control, both halves: the unreserved hero is still listed for the
    // player, and the reserved one is listed for the DM.
    expect((await t.query(api.characters.list, { code })).map((row) => row.name)).toEqual(['Thorin'])
    expect(
      (await t.query(api.characters.list, { code, dmCode })).map((row) => row.name).sort(),
    ).toEqual([RESERVED_NAME, 'Thorin'])
  })

  /**
   * ⚠️ **THE CREATURE HALF OF THE SAME FILTER, AND IT IS NOW THE FRONT PAGE OF THE SITE
   * THAT DEPENDS ON IT.**
   *
   * The test above covers a reserved *hero*; `playerCharacterNames` has two filters and
   * this is the other one. It matters more than it used to for one reason that has nothing
   * to do with either filter: `players.list` is the query behind the landing page's seat
   * picker as well as the in-game roster, so this payload now reaches a browser that has
   * typed no code at all. A creature's name leaking here would put `Wyrmshadow at the Ford`
   * on the public page of a game nobody has joined.
   *
   * Reached behind the API, exactly as the reserved case is and for the same reason:
   * `characters.claim` and `characters.assign` both refuse a creature, so no supported route
   * produces a seat holding one. That is not an argument for skipping the test — it is the
   * argument for the filter living where the payload is *built* rather than at the two
   * doors, and a test of a filter has to reach the state the doors refuse.
   *
   * **The id is asserted null alongside the name**, which is the property `convex/players.ts`
   * was written to have: nulling them as one decision means a filtered character leaves
   * neither half behind, so a client cannot take a live id off the roster to
   * `characters.sheet` — the one query that would refuse it — instead of to a screen.
   */
  test('the seat list at the door names no creature, and names an ordinary hero', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const { code, dmCode, ana, seraphine, thorin } = fixture
    const ben = await makeSeat(t, code, 'Ben')
    const cass = await makeSeat(t, code, 'Cass')

    // The same four needles the grant section hunts for, so a leak here is recognisably the
    // same leak rather than a differently-spelled near miss.
    const wolf = await makeNpc(t, code, dmCode, WOLF_NAME, wolfSheet())

    await t.run(async (ctx) => {
      await ctx.db.patch('players', ana, { characterId: seraphine })
      await ctx.db.patch('players', ben, { characterId: wolf })
    })

    // Through the API, because this one is the positive control and has to be a state the
    // app can actually produce.
    await t.mutation(api.characters.claim, { code, playerId: cass, characterId: thorin })

    const roster = await t.query(api.players.list, { code })
    const serialised = JSON.stringify(roster) ?? ''
    expect(serialised, 'the door named a creature').not.toContain(WOLF_NAME)
    expect(serialised, 'the door named a reserved hero').not.toContain(RESERVED_NAME)
    // Its id too. The roster has no legitimate reason to carry either, unlike `board.tokens`,
    // which carries a visible creature's id on purpose to bind a coin to a health bar.
    expect(serialised, 'the door named a creature’s id').not.toContain(wolf)
    expect(serialised, 'the door named a reserved hero’s id').not.toContain(seraphine)

    const seat = (playerId: Id<'players'>) => roster.find((row) => row._id === playerId)
    expect(seat(ben)).toMatchObject({ characterId: null, characterName: null })
    expect(seat(ana)).toMatchObject({ characterId: null, characterName: null })

    // ⚠️ **THE POSITIVE CONTROL.** Without it every assertion above is satisfied by a
    // roster that names nobody at all — which is precisely what a `characterName` accidentally
    // hard-wired to null would produce, and the seat picker's whole reason to exist is that
    // it shows the character each seat holds.
    expect(seat(cass)).toMatchObject({ characterId: thorin, characterName: 'Thorin' })
    expect(serialised).toContain('Thorin')
  })

  /**
   * The projected flag, which is what makes the DM's control a *state* rather than a
   * command that cannot say what is currently true.
   *
   * The player half is not a second way of asserting the filter above — it pins the claim
   * the field's presence rests on. `reserved` is `false` in every player payload **by
   * construction**, because a reserved row was dropped before anything could project it,
   * so the field publishes nothing. A `true` reaching a player would mean the filter had
   * gone and this assertion is what would say so.
   */
  test('the DM’s rows carry `reserved`, and a player’s are all false', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await reservedFixture(t)

    const dmRows = await t.query(api.characters.list, { code, dmCode })
    expect(
      Object.fromEntries(dmRows.map((row) => [row.name, row.reserved])),
    ).toEqual({ [RESERVED_NAME]: true, Thorin: false })

    const playerRows = await t.query(api.characters.list, { code })
    expect(playerRows.map((row) => row.reserved)).toEqual([false])
  })

  /**
   * The refusal is `CHARACTER_NOT_FOUND`, indistinguishable from a fabricated id, and
   * compared whole rather than by kind: a player told "that one is spoken for" has been
   * told it exists and roughly who it is waiting for, which is most of the spoiler.
   */
  test('claim refuses a reserved character exactly as it refuses a fabricated id', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const { code, dmCode, ana, seraphine } = fixture
    const ghost = await makeCharacter(t, code, 'Ghost')
    await t.mutation(api.characters.remove, { code, dmCode, characterId: ghost })

    const claim = (characterId: Id<'characters'>) =>
      t.mutation(api.characters.claim, { code, playerId: ana, characterId })

    const forReserved = await refusalOf(claim(seraphine))
    expect(forReserved.kind).toBe('CharacterNotFound')
    expect(await refusalOf(claim(ghost))).toEqual(forReserved)
    expect(await heldBy(t, ana)).toBeNull()

    // The control: an ordinary hero is claimable, so the refusals are about the flag.
    await claim(fixture.thorin)
    expect(await heldBy(t, ana)).toBe(fixture.thorin)
  })

  /**
   * ⚠️ **`assign` does not consult the flag, and clears it — the opposite of `claim`, on
   * purpose.** The DM handing the character to the player it was built for is precisely
   * the moment the reservation is over, so making them unreserve first would be a click
   * whose only effect is a window in which the row is visible to everybody and held by
   * nobody.
   */
  test('assign succeeds on a reserved character and clears the reservation', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const { code, dmCode, ana, seraphine } = fixture

    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: seraphine })

    expect(await heldBy(t, ana)).toBe(seraphine)
    expect((await rawCharacter(t, seraphine))?.reserved).toBe(false)
    // Visible to the whole table now, in both the payloads that were withholding it.
    expect((await t.query(api.characters.list, { code })).map((row) => row.name).sort()).toEqual(
      [RESERVED_NAME, 'Thorin'].sort(),
    )
    expect(
      (await t.query(api.players.list, { code })).find((seat) => seat._id === ana)?.characterName,
    ).toBe(RESERVED_NAME)
  })

  /**
   * Two refusals, both `BadInput` and both with a message that helps, because the person
   * asking is the DM and nothing here is a secret from them.
   *
   * A monster is already invisible to every player, so reserving one is a no-op that
   * would read as having worked. A held character would be half-hidden — gone from the
   * character list while `players.list` went on printing the name beside its player.
   */
  test('setReserved refuses a monster and refuses a character a seat is holding', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const { code, dmCode, ana, thorin } = fixture
    const goblin = await makeNpc(t, code, dmCode, 'Goblin')
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: thorin })

    const forMonster = await refusalOf(
      t.mutation(api.characters.setReserved, { code, dmCode, characterId: goblin, reserved: true }),
    )
    expect(forMonster.kind).toBe('BadInput')
    expect(forMonster.message).toContain('player character')
    expect((await rawCharacter(t, goblin))?.reserved).toBeUndefined()

    const forHeld = await refusalOf(
      t.mutation(api.characters.setReserved, { code, dmCode, characterId: thorin, reserved: true }),
    )
    expect(forHeld.kind).toBe('BadInput')
    expect(forHeld.message).toContain('Ana')
    expect((await rawCharacter(t, thorin))?.reserved).toBeUndefined()

    // Refused in **both** directions rather than only when reserving, so "held and
    // reserved" stays a state nothing can produce and there is no repair being blocked.
    await expectKind(
      t.mutation(api.characters.setReserved, {
        code,
        dmCode,
        characterId: thorin,
        reserved: false,
      }),
      'BadInput',
    )

    // The control: unassign, and the same call now succeeds.
    await t.mutation(api.characters.assign, { code, dmCode, playerId: ana, characterId: null })
    await t.mutation(api.characters.setReserved, {
      code,
      dmCode,
      characterId: thorin,
      reserved: true,
    })
    expect((await rawCharacter(t, thorin))?.reserved).toBe(true)
  })

  /** DM only, like every write whose effect is on what other people can see. */
  test('setReserved refuses a wrong, empty or foreign DM code', async () => {
    const t = convexTest(schema, modules)
    const fixture = await reservedFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')

    for (const dmCode of [twiddleCode(fixture.dmCode), '', '   ', other.dmCode]) {
      await expectKind(
        t.mutation(api.characters.setReserved, {
          code: fixture.code,
          dmCode,
          characterId: fixture.thorin,
          reserved: true,
        }),
        'NotDm',
      )
    }
    expect((await rawCharacter(t, fixture.thorin))?.reserved).toBeUndefined()
  })
})

describe('characters.sheet keeps refusing another seat’s hero', () => {
  /**
   * ⚠️ **THE GATE THE GRANT WORK COULD HAVE REMOVED, AND THE ARGUMENT SHAPE THAT ALMOST
   * REMOVED IT.**
   *
   * A hero belonging to somebody else is perfectly visible to `maySeeCharacter` — it is
   * a `pc`, which is the whole of that predicate's player-facing rule — so the second
   * gate in `characters.sheet` is the only thing keeping *a player cannot read another
   * player's hero* true. There are existing tests for the claimed case and they must
   * keep passing untouched.
   *
   * This is the case none of them names: **no `playerId` at all, against an unclaimed
   * hero.** Written as `holder?._id === args.playerId`, the natural spelling, both sides
   * are `undefined` and the comparison succeeds — so a caller who sends nothing is handed
   * the sheet of every character nobody has picked up, including the ones the DM has
   * prepared for players who have not arrived. The gate is therefore written
   * `holder !== null && holder._id === args.playerId`: the seat has to exist for a claim
   * to mean anything.
   */
  test('a caller sending no seat id is refused an unclaimed hero', async () => {
    const t = convexTest(schema, modules)
    const { code, dmCode } = await makeGame(t)
    const ana = await makeSeat(t, code, 'Ana')
    const unclaimed = await makePc(t, code, 'Nobody’s Yet', pcSheet())
    const claimed = await makePc(t, code, 'Thorin', pcSheet())
    await t.mutation(api.characters.claim, { code, playerId: ana, characterId: claimed })

    expect(await readSheet(t, code, unclaimed)).toBeNull()
    expect(await readSheet(t, code, claimed)).toBeNull()
    // And a seat holding neither is refused both, so the answer is not "no seat" but
    // "not yours".
    const ben = await makeSeat(t, code, 'Ben')
    expect(await readSheet(t, code, unclaimed, { playerId: ben })).toBeNull()
    expect(await readSheet(t, code, claimed, { playerId: ben })).toBeNull()

    // The two positive controls, or the nulls above prove nothing: the holder reads
    // their own, and the DM reads either.
    expect((await readSheet(t, code, claimed, { playerId: ana }))?.name).toBe('Thorin')
    expect((await readSheet(t, code, unclaimed, { dmCode }))?.name).toBe('Nobody’s Yet')
  })
})
