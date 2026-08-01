/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { BestiarySheet, NpcSheet, PresetSheet } from './lib/sheet'
import { defaultNpcSheet } from './lib/sheet'
import schema from './schema'

/**
 * MILESTONE 5 ON THE WIRE. The DM's shelf, the CR stepper and the reset, asserted
 * through the real functions rather than against the scaler.
 *
 * The arithmetic has its own suite in `lib/scaling.test.ts` and the corpus has one in
 * `lib/bestiary.test.ts`; neither of them can see a `ctx`, a stored document or a
 * `returns:` validator. What is unproven without this file is the wiring: that the two
 * queries are gated on the DM code and on nothing else, that a summary really is a
 * summary rather than a stat block with a narrower type on it, that a rating shift
 * writes **one field** and no scaled number, and that hit points survive the shift as a
 * fraction rather than as a number.
 *
 * ⚠️ **Every number below is hand-copied out of the corpus and the benchmark table**,
 * with the arithmetic written out beside it. Deriving them by calling `scaleCombat` or
 * `bestiaryEntry` here would make the assertions tautological — they would agree with a
 * mangled corpus exactly as readily as with a correct one, which is the argument
 * `scripts/board-smoke.mjs` makes about its own fixtures and the reason
 * `characters.test.ts` writes the Fighter's hit points out by hand.
 *
 * The fixtures duplicate `vitals.test.ts`'s rather than sharing them, deliberately: see
 * the note at the top of that file. Every safe home for a shared helper is either
 * deployed as a Convex module or swept by the leak guard.
 */
const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

// ---------------------------------------------------------------------------
// The corpus, restated
// ---------------------------------------------------------------------------

/**
 * How many creatures the bestiary holds. Written out, because a query that quietly
 * returned half the shelf would still return an array of well-shaped rows.
 *
 * `lib/bestiary.test.ts` owns the completeness gate over the content files; this is the
 * same count asserted at the far end of a `returns:` validator, which is the only place
 * it can be seen from.
 */
const BESTIARY_ROWS = 129

/** The fourteen fields `bestiarySummaryValidator` declares, and no fifteenth. */
const SUMMARY_KEYS = [
  'blurb',
  'category',
  'cr',
  'creatureType',
  'hasCombat',
  'hasSocial',
  'key',
  'name',
  'recommendedPartyLevelMax',
  'recommendedPartyLevelMin',
  'role',
  'size',
  'tags',
  'tier',
]

const WOLF_KEY = 'dire-wolf'
const WOLF_NAME = 'Dire Wolf'
/** The rating the entry is written at. `libraryCr` on every payload that carries labels. */
const WOLF_LIBRARY_CR = 1

/**
 * The Dire Wolf's combat block as written, hand-copied from
 * `convex/lib/bestiary/monstersLow.ts`, and the same block at three other ratings with
 * the arithmetic spelled out.
 *
 * The benchmark rows, also hand-copied, from `convex/lib/bestiary/benchmarks.ts`:
 *
 * ```
 * CR    hp   ac  atk  dmg  dc  skill
 *  0     4   11   2     2  10   0
 *  1    26   13   4     8  12   2
 *  4    70   15   6    16  14   4
 *  6   120   16   7    25  15   5
 * ```
 *
 * `hp` and `damage` are ratio columns and the rest are deltas — mixing the two up is
 * the single easiest way to get a scaler wrong, so the two kinds are worked out
 * separately here as well.
 */
const WOLF_AT_1 = {
  // The entry, untouched: CR 1 → CR 1 is the exact identity and is not short-circuited.
  maxHp: 31,
  armourClass: 12,
  attackBonus: 4,
  initiativeBonus: 2,
  passivePerception: 13,
  speed: 50,
  skills: { perception: 3, stealth: 4 },
  damage: '2d6+3',
}

const WOLF_AT_4 = {
  // 31 × 70/26 = 83.46… → 83
  maxHp: 83,
  // +(15 − 13) = +2 on every d20 column
  armourClass: 14,
  attackBonus: 6,
  initiativeBonus: 4,
  passivePerception: 15,
  // Untouched. A Dire Wolf that follows the party up still moves 50 feet.
  speed: 50,
  skills: { perception: 5, stealth: 6 },
  // 16/8 = 2.0× exactly. (2 × 3.5 + 3) × 2 = 20; 4 dice average 14, so +6.
  damage: '4d6+6',
}

const WOLF_AT_6 = {
  // 31 × 120/26 = 143.07… → 143
  maxHp: 143,
  // +(16 − 13) = +3
  armourClass: 15,
  attackBonus: 7,
  initiativeBonus: 5,
  passivePerception: 16,
  speed: 50,
  skills: { perception: 6, stealth: 7 },
  // 25/8 = 3.125×. 10 × 3.125 = 31.25; round(2 × 3.125) = 6 dice average 21, so +10.
  damage: '6d6+10',
}

/** 31 × 4/26 = 4.77 → 5. Only the maximum is needed: this rating is the floor edge. */
const WOLF_AT_0_MAX_HP = 5

/** The first line of the resolved Bite, composed by `attackText` from the structured fields. */
const WOLF_BITE_TEXT_AT_1 = 'Melee. 2d6+3 piercing damage. Jaws wide enough to take a shoulder.'
const WOLF_BITE_TEXT_AT_4 = 'Melee. 4d6+6 piercing damage. Jaws wide enough to take a shoulder.'

/**
 * A creature with **no combat block at all** — twenty-two of the thirty social entries
 * are like this, and the innkeeper is the one whose `knows` string is the plot.
 *
 * Used here because a rating shift on a creature with nothing to scale is the branch
 * most likely to be forgotten: `resolveBestiary` returns the defaults, and the DM's
 * chosen rating still has to be stored and still has to come back.
 */
const INNKEEPER_KEY = 'innkeeper'
const INNKEEPER_NAME = 'Innkeeper'

// ---------------------------------------------------------------------------
// Harness helpers, copied rather than shared
// ---------------------------------------------------------------------------

type ErrorData = { kind: string; message: string; path?: string }

async function refusalOf(call: Promise<unknown>): Promise<ErrorData> {
  const thrown = (await call.then(
    () => new Error('the call resolved, but it was expected to be refused'),
    (error: unknown) => error,
  )) as unknown
  expect(thrown).toBeInstanceOf(ConvexError)
  const data = (thrown as ConvexError<ErrorData>).data
  expect(typeof data.kind).toBe('string')
  expect(typeof data.message).toBe('string')
  return data
}

async function expectKind(call: Promise<unknown>, kind: string) {
  const refusal = await refusalOf(call)
  expect(refusal.kind).toBe(kind)
  expect(refusal.message.length).toBeGreaterThan(0)
}

/**
 * A refusal that is Convex's own argument validation rather than a deliberate one.
 *
 * `dmCode` is a **required** `v.string()` on both bestiary queries, so "no DM code at
 * all" never reaches a handler and arrives as a bare `Error`. The distinction is worth
 * asserting rather than papering over: `expectKind` would pass on a handler that had
 * quietly stopped checking, and this would not.
 */
async function expectArgumentRefusal(call: Promise<unknown>) {
  const thrown = await call.then(
    () => null,
    (error: unknown) => error,
  )
  expect(thrown, 'the call resolved, but the argument validator should have refused it').not.toBeNull()
  expect(thrown).not.toBeInstanceOf(ConvexError)
}

/** Well-formed and wrong. A `dmCode` being *present* is not the same as being correct. */
function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

function bestiarySheet(overrides: Partial<BestiarySheet> = {}): BestiarySheet {
  return { kind: 'bestiary', entryKey: WOLF_KEY, cr: WOLF_LIBRARY_CR, ...overrides }
}

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

async function makeCreature(
  t: Harness,
  code: string,
  dmCode: string,
  name = 'The Thing at the Ford',
  sheet: BestiarySheet = bestiarySheet(),
) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet, dmCode })
  return characterId
}

/** The stored `sheet` field, insisting it is a bestiary selection rather than a sheet. */
async function storedCreature(
  t: Harness,
  characterId: Id<'characters'>,
): Promise<BestiarySheet> {
  const stored = await t.run(async (ctx) => (await ctx.db.get('characters', characterId))?.sheet)
  if (stored?.kind !== 'bestiary') {
    throw new Error(`expected a bestiary selection, got ${JSON.stringify(stored?.kind)}`)
  }
  return stored
}

/** The resolved sheet as the DM's panel receives it, insisting it resolved to a monster. */
async function resolvedSheet(
  t: Harness,
  code: string,
  dmCode: string,
  characterId: Id<'characters'>,
): Promise<NpcSheet> {
  const payload = await t.query(api.characters.sheet, { code, dmCode, characterId })
  if (!payload) throw new Error('no sheet came back at all')
  if (payload.sheet.kind !== 'npc') throw new Error(`resolved to a ${payload.sheet.kind}`)
  return payload.sheet
}

/** The DM's exact hit points for one character. */
async function exactVitals(
  t: Harness,
  code: string,
  dmCode: string,
  characterId: Id<'characters'>,
): Promise<{ current: number; max: number }> {
  const rows = await t.query(api.characters.vitals, { code, dmCode })
  const row = rows.find((entry) => entry.characterId === characterId)
  if (!row) throw new Error(`no vitals row for ${characterId}`)
  if (row.kind !== 'exact') throw new Error(`expected exact vitals, got a ${row.kind}`)
  return { current: row.current, max: row.max }
}

async function setHp(
  t: Harness,
  code: string,
  dmCode: string,
  characterId: Id<'characters'>,
  currentHp: number,
) {
  await t.mutation(api.characters.setHp, { code, dmCode, characterId, currentHp })
}

/** The statline of a resolved creature, as a comparable object. */
function statlineOf(sheet: NpcSheet) {
  return {
    maxHp: sheet.maxHp,
    armourClass: sheet.armourClass,
    attackBonus: sheet.attackBonus,
    initiativeBonus: sheet.initiativeBonus,
    passivePerception: sheet.passivePerception,
    speed: sheet.speed,
    skills: sheet.skills,
    damage: sheet.actions[0]?.roll,
  }
}

// ---------------------------------------------------------------------------
// (a) The DM gate
// ---------------------------------------------------------------------------

describe('the DM’s shelf is gated on the DM code and nothing else', () => {
  /**
   * The third case is the one that matters, and it is why `twiddle` exists at all: a
   * `dmCode` argument being **present** is not the same as being **correct**, and a
   * gate that keyed off the argument arriving would pass every other test here.
   *
   * The library itself is not a secret — a Monster Manual is a book anyone can buy —
   * but *which twelve of them the DM has prepared* is twelve monsters' worth of
   * spoiler, and the picker is the only thing that reads these two queries.
   */
  test('bestiary.index is refused with no DM code, an empty one and a well-formed wrong one', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    await expectArgumentRefusal(
      t.query(api.bestiary.index, { code } as unknown as { code: string; dmCode: string }),
    )
    await expectKind(t.query(api.bestiary.index, { code, dmCode: '' }), 'NotDm')
    await expectKind(t.query(api.bestiary.index, { code, dmCode: '   ' }), 'NotDm')
    await expectKind(t.query(api.bestiary.index, { code, dmCode: twiddle(dmCode) }), 'NotDm')
    await expectKind(t.query(api.bestiary.index, { code, dmCode: 'ZZZZZZZZ' }), 'NotDm')

    // Another table's DM code is not this table's.
    const other = await makeGame(t, 'Other Table', 'Sam')
    await expectKind(t.query(api.bestiary.index, { code, dmCode: other.dmCode }), 'NotDm')

    // The control: the right code does answer, so the refusals above are the gate
    // rather than the query being broken.
    expect(await t.query(api.bestiary.index, { code, dmCode })).toHaveLength(BESTIARY_ROWS)
  })

  test('bestiary.entry is refused the same three ways', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    await expectArgumentRefusal(
      t.query(api.bestiary.entry, { code, key: WOLF_KEY } as unknown as {
        code: string
        dmCode: string
        key: string
      }),
    )
    for (const wrong of ['', '   ', twiddle(dmCode), 'ZZZZZZZZ']) {
      await expectKind(
        t.query(api.bestiary.entry, { code, dmCode: wrong, key: WOLF_KEY }),
        'NotDm',
      )
    }

    expect(await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY })).not.toBeNull()
  })

  /**
   * The gate is checked **before the key is looked at**, so a player cannot use the
   * shape of the refusal to find out whether a creature key exists. An unknown key with
   * the right code answers `null`; an unknown key with the wrong one refuses, exactly as
   * a known key with the wrong one does.
   */
  test('a wrong DM code refuses identically for a real key and for a made-up one', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const wrong = twiddle(dmCode)

    const real = await refusalOf(t.query(api.bestiary.entry, { code, dmCode: wrong, key: WOLF_KEY }))
    const invented = await refusalOf(
      t.query(api.bestiary.entry, { code, dmCode: wrong, key: 'no-such-beast' }),
    )
    expect(invented).toEqual(real)

    // And with the right code the invented key is a plain null rather than a throw,
    // because a character *stores* a key and a retired entry has to stay readable.
    expect(await t.query(api.bestiary.entry, { code, dmCode, key: 'no-such-beast' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// (b) The index is a summary, not a stat block
// ---------------------------------------------------------------------------

describe('bestiary.index sends the shape its validator promises', () => {
  test('every one of the 129 rows carries the fourteen summary fields and no fifteenth', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const rows = await t.query(api.bestiary.index, { code, dmCode })
    expect(rows).toHaveLength(BESTIARY_ROWS)

    for (const row of rows) {
      expect(Object.keys(row).sort(), `row ${row.key}`).toEqual(SUMMARY_KEYS)
      expect(row.key.length, 'a row with no key').toBeGreaterThan(0)
      expect(row.name.length, `${row.key} has no name`).toBeGreaterThan(0)
      expect(row.blurb.length, `${row.key} has no blurb`).toBeGreaterThan(0)
      expect(['monster', 'enemy', 'social'], `${row.key} has no tab`).toContain(row.category)
      expect(Array.isArray(row.tags), `${row.key} tags`).toBe(true)
      expect(typeof row.hasCombat, `${row.key} hasCombat`).toBe('boolean')
      expect(typeof row.hasSocial, `${row.key} hasSocial`).toBe('boolean')
    }

    // Every key distinct, which is the collision the corpus deliberately does not throw
    // on at module scope — seen here through the payload that would silently shrink.
    expect(new Set(rows.map((row) => row.key)).size).toBe(BESTIARY_ROWS)
  })

  /**
   * A SUMMARY AND A STAT BLOCK HAVE DIFFERENT SHAPES, which is what makes a `returns:`
   * validator the right tool for this one leak and useless for the row-shaped one next
   * door. There is nowhere in a summary to put an armour class, so a projection that
   * widened a row into the whole entry makes Convex throw rather than shipping ~130
   * stat blocks to a browser.
   *
   * Asserted against the serialised payload rather than field by field, because the
   * hazard is a *nested* stat block — an `entry` key somebody added for convenience —
   * which a property check on the top level would walk straight past.
   *
   * The needles carry their closing quote and colon: `"social"` on its own matches the
   * `social` **tab name**, which every one of thirty rows legitimately carries.
   */
  test('not one row carries a statistic, an action, a note or the social block', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const serialised = JSON.stringify(await t.query(api.bestiary.index, { code, dmCode })) ?? ''
    for (const needle of [
      '"maxHp":',
      '"armourClass":',
      '"attackBonus":',
      '"initiativeBonus":',
      '"passivePerception":',
      '"saveDc":',
      '"attacks":',
      '"abilities":',
      '"combat":',
      '"notes":',
      '"loot":',
      '"social":',
      '"knows":',
      '"alignment":',
      '"environmentTags":',
    ]) {
      expect(serialised, `the index leaked ${needle}`).not.toContain(needle)
    }

    // The positive control on the other side of the same line: the fields a picker row
    // *is* made of are all there, so the sweep above is running over a real payload.
    for (const needle of ['"key":', '"blurb":', '"tier":', '"role":', '"hasCombat":']) {
      expect(serialised).toContain(needle)
    }
    expect(serialised).toContain(WOLF_KEY)
    expect(serialised).toContain(WOLF_NAME)
  })

  /**
   * Declaration order, which is what keeps the picker's rows where the DM last saw them
   * instead of reshuffling on a render. The three monster files come first, ascending by
   * tier, then the humanoid enemies, then the people.
   */
  test('the rows arrive in content-file order, monsters then enemies then people', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const categories = (await t.query(api.bestiary.index, { code, dmCode })).map(
      (row) => row.category,
    )

    const firstEnemy = categories.indexOf('enemy')
    const firstSocial = categories.indexOf('social')
    expect(categories[0]).toBe('monster')
    expect(firstEnemy).toBeGreaterThan(0)
    expect(firstSocial).toBeGreaterThan(firstEnemy)
    // No interleaving: each category is one contiguous run, because the category is read
    // off the *file* rather than looked up per entry.
    expect(categories.lastIndexOf('monster')).toBeLessThan(firstEnemy)
    expect(categories.lastIndexOf('enemy')).toBeLessThan(firstSocial)
  })

  /**
   * The corpus is module state on an isolate that outlives the request, so a caller
   * handed an entry's own `tags` array could sort it in place and change it for every
   * later query until the next deploy. `index` copies; this is that copy, observed.
   */
  test('a caller mutating a row’s tags does not change the next answer', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const before = await t.query(api.bestiary.index, { code, dmCode })
    const target = before.find((row) => row.tags.length > 1)
    expect(target, 'no row has two tags to reorder').toBeDefined()
    const original = [...target!.tags]
    target!.tags.reverse()
    target!.tags.push('boss')

    const after = await t.query(api.bestiary.index, { code, dmCode })
    expect(after.find((row) => row.key === target!.key)!.tags).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// (c) bestiary.entry — View Original
// ---------------------------------------------------------------------------

describe('bestiary.entry resolves the library’s own copy', () => {
  test('with no rating it answers at the entry’s own, and with one at the rating asked for', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const own = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY })
    expect(own).not.toBeNull()
    expect(statlineOf(own!.sheet)).toEqual(WOLF_AT_1)
    expect(own!.extras.name).toBe(WOLF_NAME)
    expect(own!.extras.libraryCr).toBe(WOLF_LIBRARY_CR)

    const stepped = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY, cr: 4 })
    expect(statlineOf(stepped!.sheet)).toEqual(WOLF_AT_4)

    // THE POSITIVE CONTROL. Without it a scaler that returned its input unconditionally
    // would pass every identity assertion in this file.
    expect(stepped!.sheet).not.toStrictEqual(own!.sheet)
    expect(stepped!.sheet.maxHp).toBeGreaterThan(own!.sheet.maxHp)

    // Explicitly asking for the entry's own rating is the same answer as omitting it —
    // `from === to` is the exact identity and is deliberately not short-circuited.
    const explicit = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY, cr: 1 })
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(own))
  })

  /**
   * `tier` is the tier of the **resolved** rating rather than the entry's own, because a
   * DM who has scaled a creature to CR 4 wants to read Tier IV. `libraryCr` travels
   * beside it, which is the other half of the `Dire Wolf · CR 1 → 4` banner and the
   * reason a DM who has forgotten they scaled something can see that they did.
   */
  test('the tier follows the rating asked for while libraryCr stays the entry’s', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const own = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY })
    expect(own!.extras.tier).toBe(2) // CR 1 is Tier II
    expect(own!.extras.libraryCr).toBe(1)

    const stepped = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY, cr: 4 })
    expect(stepped!.extras.tier).toBe(4) // CR 4 is Tier IV
    expect(stepped!.extras.libraryCr).toBe(1)
  })

  /**
   * ⚠️ **`entry` never applies an override, because it is *View Original*.** The
   * selection sheet it resolves is built in the handler and carries none — so a DM
   * comparing the creature they have been editing against the library gets the library,
   * whatever they have pinned on their own copy.
   */
  test('a DM’s pinned armour class does not reach the library’s copy of the same creature', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)
    await t.mutation(api.characters.updateSheet, {
      code,
      dmCode,
      characterId: creature,
      sheet: bestiarySheet({ overrides: { armourClass: 25, notes: 'Bribed. Fights for us.' } }),
    })

    // The DM's own copy has moved.
    expect((await resolvedSheet(t, code, dmCode, creature)).armourClass).toBe(25)

    // The library's has not, and the payload has nowhere to say that anybody pinned
    // anything: `creatureLabelsValidator` carries no `overrides` and no
    // `overriddenFields`, which `creaturePayloadValidator` next door does.
    const original = await t.query(api.bestiary.entry, { code, dmCode, key: WOLF_KEY })
    expect(original!.sheet.armourClass).toBe(WOLF_AT_1.armourClass)
    const serialised = JSON.stringify(original) ?? ''
    expect(serialised).not.toContain('overrides')
    expect(serialised).not.toContain('overriddenFields')
    expect(serialised).not.toContain('Bribed')
  })

  test('an unknown key is null rather than a throw, for both the sheet and the labels', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    expect(await t.query(api.bestiary.entry, { code, dmCode, key: 'no-such-beast' })).toBeNull()
    expect(await t.query(api.bestiary.entry, { code, dmCode, key: '' })).toBeNull()
    // A key that differs from a real one only in case, because the corpus is a `Map`
    // and a `Map` does not fold case.
    expect(await t.query(api.bestiary.entry, { code, dmCode, key: 'Dire-Wolf' })).toBeNull()
    // And `__proto__`, which is truthy on a plain object and is why the corpus is a Map.
    expect(await t.query(api.bestiary.entry, { code, dmCode, key: '__proto__' })).toBeNull()
    expect(await t.query(api.bestiary.entry, { code, dmCode, key: 'toString' })).toBeNull()
  })

  /**
   * A creature with no combat block still resolves to a complete `NpcSheet`, because
   * `npcSheetValidator` requires five fields and the retired-key and no-combat branches
   * are the two places nothing supplies them. An innkeeper the DM has put on the board
   * can still take damage.
   */
  test('a social NPC with no statline resolves to the defaults and keeps its notes', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const found = await t.query(api.bestiary.entry, { code, dmCode, key: INNKEEPER_KEY })
    expect(found).not.toBeNull()
    expect(found!.sheet.kind).toBe('npc')
    expect(found!.sheet.maxHp).toBe(defaultNpcSheet().maxHp)
    expect(found!.sheet.armourClass).toBe(defaultNpcSheet().armourClass)
    expect(found!.sheet.actions).toEqual([])
    expect(found!.sheet.notes.length).toBeGreaterThan(0)
    expect(found!.extras.social).not.toBeNull()
    expect(found!.extras.social!.knows.length).toBeGreaterThan(0)
    expect(found!.extras.social!.personality).toHaveLength(3)

    // Nothing to scale, so a rating shift changes the labels' tier and no number.
    const stepped = await t.query(api.bestiary.entry, {
      code,
      dmCode,
      key: INNKEEPER_KEY,
      cr: 0.125,
    })
    expect(stepped!.sheet).toEqual(found!.sheet)
    expect(stepped!.extras.libraryCr).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (d) The stepper: one field changes and eight numbers move
// ---------------------------------------------------------------------------

describe('characters.setCreatureCr', () => {
  /**
   * ⚠️ **THE INVARIANT-SHAPED TEST.** `bestiarySheetValidator` has no `maxHp`, no
   * `armourClass` and no bonus field of any kind, so there is **nowhere on the stored
   * document to put a scaled number** — which is what makes CR scaling non-compounding
   * by construction rather than by everybody remembering to do it in the right order.
   *
   * Asserted against the raw document with `toStrictEqual` rather than `toMatchObject`,
   * because the claim is about the *absence* of a field and a subset match cannot make
   * it.
   */
  test('the rating moves and not one scaled number is written to the document', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    expect(await storedCreature(t, creature)).toStrictEqual({
      kind: 'bestiary',
      entryKey: WOLF_KEY,
      cr: 1,
    })

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 4 })

    expect(await storedCreature(t, creature)).toStrictEqual({
      kind: 'bestiary',
      entryKey: WOLF_KEY,
      cr: 4,
    })
    // And the numbers really did move, so the assertion above is about what was *not*
    // stored rather than about nothing having happened.
    expect(statlineOf(await resolvedSheet(t, code, dmCode, creature))).toEqual(WOLF_AT_4)
  })

  /**
   * ONE FIELD IN, EIGHT NUMBERS OUT — and the words stay exactly as written. A CR 6
   * goblin is a goblin who has been lifting; it is not a goblin that has grown a second
   * head or learnt Multiattack.
   */
  test('the statline moves, the attack text carries the new damage, and nothing else changes', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    const atOne = await resolvedSheet(t, code, dmCode, creature)
    expect(atOne.actions.map((action) => action.id)).toEqual([
      'atk:bite',
      'abl:pack-tactics',
      'abl:never-loses-a-trail',
    ])
    expect(atOne.actions[0].roll).toBe(WOLF_AT_1.damage)
    expect(atOne.actions[0].text.startsWith(WOLF_BITE_TEXT_AT_1)).toBe(true)

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 4 })
    const atFour = await resolvedSheet(t, code, dmCode, creature)

    // The ids do not renumber, because `entryId` derives them from the name rather than
    // the position — React would otherwise read the whole list as replaced.
    expect(atFour.actions.map((action) => action.id)).toEqual(
      atOne.actions.map((action) => action.id),
    )
    expect(atFour.actions).toHaveLength(atOne.actions.length)
    expect(atFour.actions[0].roll).toBe(WOLF_AT_4.damage)
    // The composed text carries the *current* damage, which is exactly why the corpus's
    // no-dice-in-prose rule applies to the authored fields and not to this string.
    expect(atFour.actions[0].text.startsWith(WOLF_BITE_TEXT_AT_4)).toBe(true)
    // The two abilities are words, so they are byte-identical.
    expect(atFour.actions.slice(1)).toEqual(atOne.actions.slice(1))
    expect(atFour.notes).toBe(atOne.notes)
    expect(atFour.speed).toBe(atOne.speed)
  })

  /**
   * CR A → B → A RETURNS THE ORIGINAL SHEET BYTE FOR BYTE, which is the whole promise
   * the stored shape exists to make: the scaler reads the entry's own baseline every
   * time, so the second scale is never applied on top of the first.
   *
   * `expect(atB).not.toStrictEqual(atA)` is mandatory rather than decorative. Without
   * it, a scaler that returned its input unconditionally would pass this test.
   */
  test('a rating shifted away and back is byte-identical, and the shift itself is real', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    const atA = await resolvedSheet(t, code, dmCode, creature)
    const serialisedA = JSON.stringify(atA)

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 6 })
    const atB = await resolvedSheet(t, code, dmCode, creature)
    expect(atB).not.toStrictEqual(atA)

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 1 })
    expect(JSON.stringify(await resolvedSheet(t, code, dmCode, creature))).toBe(serialisedA)

    // The long way round too, through every rating in the table and back, because a
    // compounding scaler that survived one round trip would not survive nine.
    for (const cr of [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6] as const) {
      await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr })
    }
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 1 })
    expect(JSON.stringify(await resolvedSheet(t, code, dmCode, creature))).toBe(serialisedA)
  })

  /**
   * THE FRACTION, NOT THE NUMBER. A level-up is growth and keeps the number; a CR shift
   * is the same creature rescaled, so the number on its own means nothing — a Troll's
   * maximum was 45 because it was a CR 5 Troll and is 20 because it is now a CR 2 one.
   *
   * Both writes land in one transaction, so nothing ever observes the sheet at the new
   * rating beside a current total from the old one.
   */
  test('a creature on half its hit points comes out on half of the new maximum', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    // 15 of 31 — a fraction of 0.484, which is `bloodied`.
    await setHp(t, code, dmCode, creature, 15)
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 15, max: 31 })

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 4 })
    // round(15 × 83/31) = round(40.16) = 40 of 83, a fraction of 0.482.
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 40, max: 83 })

    // Neither dead nor healed, and still the same band a player is told.
    const rows = await t.query(api.characters.vitals, { code, dmCode })
    expect(rows.find((row) => row.characterId === creature)!.kind).toBe('exact')
    expect(40 / 83).toBeCloseTo(15 / 31, 2)
  })

  test('a creature at full health comes out exactly full, not one short', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    // Created undamaged: the vitals row is seeded from the resolved maximum.
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 31, max: 31 })

    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 6 })
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 143, max: 143 })

    // And down again. "It was on full and now it is one short" is a thing a DM notices
    // immediately, which is why `reconcileHp` takes it as a special case rather than
    // leaving it to a ratio that ought to round to 1.
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 1 })
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 31, max: 31 })
  })

  test('a corpse stays a corpse and a survivor never rounds down to dead', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    // (1) Adjusting the difficulty of tonight's fight must not resurrect anything.
    const dead = await makeCreature(t, code, dmCode, 'Already Finished')
    await setHp(t, code, dmCode, dead, 0)
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: dead, cr: 6 })
    expect(await exactVitals(t, code, dmCode, dead)).toEqual({ current: 0, max: 143 })
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: dead, cr: 0 })
    expect(await exactVitals(t, code, dmCode, dead)).toEqual({
      current: 0,
      max: WOLF_AT_0_MAX_HP,
    })

    // (2) The floor of 1. `healthBand` promises in writing that a creature which is
    // alive is never `down`, and a promise with an exception in it is not one — so
    // 1 of 143 scaled to a maximum of 5 must not round to nought.
    const clinging = await makeCreature(t, code, dmCode, 'Barely Standing')
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: clinging, cr: 6 })
    await setHp(t, code, dmCode, clinging, 1)
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: clinging, cr: 0 })
    expect(await exactVitals(t, code, dmCode, clinging)).toEqual({
      current: 1,
      max: WOLF_AT_0_MAX_HP,
    })
  })

  /**
   * AN OVERRIDE IS THE DM'S LAST WORD, and it survives a shift because the scale happens
   * before it. A boss-fight armour class somebody bumped stays bumped, while everything
   * the DM did *not* pin moves.
   */
  test('a pinned armour class survives two shifts while the rest of the statline moves', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    await t.mutation(api.characters.updateSheet, {
      code,
      dmCode,
      characterId: creature,
      sheet: bestiarySheet({ overrides: { armourClass: 25 } }),
    })
    expect((await resolvedSheet(t, code, dmCode, creature)).armourClass).toBe(25)

    for (const cr of [4, 6] as const) {
      await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr })
      const sheet = await resolvedSheet(t, code, dmCode, creature)
      expect(sheet.armourClass, `armour class at CR ${cr}`).toBe(25)
    }

    const atSix = await resolvedSheet(t, code, dmCode, creature)
    expect(atSix.maxHp).toBe(WOLF_AT_6.maxHp)
    expect(atSix.actions[0].roll).toBe(WOLF_AT_6.damage)
    expect(atSix.attackBonus).toBe(WOLF_AT_6.attackBonus)

    // The override rode across untouched rather than being rebuilt, and the panel can
    // see which field the DM pinned.
    expect(await storedCreature(t, creature)).toStrictEqual({
      kind: 'bestiary',
      entryKey: WOLF_KEY,
      cr: 6,
      overrides: { armourClass: 25 },
    })
    const payload = await t.query(api.characters.sheet, { code, dmCode, characterId: creature })
    expect(payload?.creature).toMatchObject({
      entryKey: WOLF_KEY,
      cr: 6,
      libraryCr: 1,
      overrides: { armourClass: 25 },
      overriddenFields: ['armourClass'],
    })
  })

  /** Nothing to scale, and the rating still has to be stored and to come back. */
  test('a creature with no combat block accepts a rating and keeps its defaults', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const person = await makeCreature(
      t,
      code,
      dmCode,
      'Maergan Tolt',
      { kind: 'bestiary', entryKey: INNKEEPER_KEY, cr: 0 },
    )

    const before = await resolvedSheet(t, code, dmCode, person)
    await t.mutation(api.characters.setCreatureCr, {
      code,
      dmCode,
      characterId: person,
      cr: 0.125,
    })
    expect(await resolvedSheet(t, code, dmCode, person)).toEqual(before)
    expect((await storedCreature(t, person)).cr).toBe(0.125)
    expect(await exactVitals(t, code, dmCode, person)).toEqual({
      current: defaultNpcSheet().maxHp,
      max: defaultNpcSheet().maxHp,
    })
  })

  test('a rating shift is refused with no DM code, an empty one and a wrong one', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    await expectArgumentRefusal(
      t.mutation(api.characters.setCreatureCr, { code, characterId: creature, cr: 4 } as unknown as {
        code: string
        dmCode: string
        characterId: Id<'characters'>
        cr: 4
      }),
    )
    for (const wrong of ['', '   ', twiddle(dmCode)]) {
      await expectKind(
        t.mutation(api.characters.setCreatureCr, {
          code,
          dmCode: wrong,
          characterId: creature,
          cr: 4,
        }),
        'NotDm',
      )
    }

    // And nothing moved, which is the other half of a refusal.
    expect((await storedCreature(t, creature)).cr).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// (e) resetCreature
// ---------------------------------------------------------------------------

describe('characters.resetCreature', () => {
  test('clears the rating and the override in one write, and reconciles hit points', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)

    await t.mutation(api.characters.updateSheet, {
      code,
      dmCode,
      characterId: creature,
      sheet: bestiarySheet({ cr: 6, overrides: { armourClass: 25, maxHp: 400 } }),
    })
    await setHp(t, code, dmCode, creature, 89)
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 89, max: 400 })

    await t.mutation(api.characters.resetCreature, { code, dmCode, characterId: creature })

    // `overrides` is *not named* on the rebuilt object, which is how the field is
    // deleted — one patch rather than two, so there is no state in between where the
    // rating had been restored and the DM's numbers had not.
    expect(await storedCreature(t, creature)).toStrictEqual({
      kind: 'bestiary',
      entryKey: WOLF_KEY,
      cr: WOLF_LIBRARY_CR,
    })
    expect(statlineOf(await resolvedSheet(t, code, dmCode, creature))).toEqual(WOLF_AT_1)

    // round(89 × 31/400) = round(6.90) = 7. Resetting a scaled creature moves its
    // maximum just as much as scaling it did, so the fraction is what is preserved.
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 7, max: 31 })

    // And the panel's own *isModified* flag falls out of the data rather than a field.
    const payload = await t.query(api.characters.sheet, { code, dmCode, characterId: creature })
    expect(payload?.creature).toMatchObject({ overrides: null, overriddenFields: [] })
  })

  test('resetting an unscaled, unedited creature is a no-op that succeeds', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)
    const before = JSON.stringify(await resolvedSheet(t, code, dmCode, creature))

    await t.mutation(api.characters.resetCreature, { code, dmCode, characterId: creature })

    expect(JSON.stringify(await resolvedSheet(t, code, dmCode, creature))).toBe(before)
    expect(await exactVitals(t, code, dmCode, creature)).toEqual({ current: 31, max: 31 })
  })

  /**
   * A retired key has no rating to go back to, so the creature stays perfectly readable
   * and simply cannot be reset — the same asymmetry `requireUsableSheet` draws between
   * write and read, said out loud in a refusal rather than by resetting to a rating that
   * no longer means anything.
   */
  test('a creature whose entry has been retired is refused rather than reset', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const orphan = await t.run(async (ctx) => {
      const game = await ctx.db
        .query('games')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique()
      return await ctx.db.insert('characters', {
        gameId: game!._id,
        name: 'Something Retired',
        sheet: { kind: 'bestiary', entryKey: 'no-such-beast', cr: 3 },
      })
    })

    const refusal = await refusalOf(
      t.mutation(api.characters.resetCreature, { code, dmCode, characterId: orphan }),
    )
    expect(refusal.kind).toBe('BadInput')
    expect(refusal.message).toContain('no longer in the bestiary')

    // Still readable, and still a monster.
    expect((await resolvedSheet(t, code, dmCode, orphan)).kind).toBe('npc')
    expect((await storedCreature(t, orphan)).cr).toBe(3)
  })

  test('a reset is refused with no DM code, an empty one and a wrong one', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const creature = await makeCreature(t, code, dmCode)
    await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 6 })

    await expectArgumentRefusal(
      t.mutation(api.characters.resetCreature, { code, characterId: creature } as unknown as {
        code: string
        dmCode: string
        characterId: Id<'characters'>
      }),
    )
    for (const wrong of ['', twiddle(dmCode)]) {
      await expectKind(
        t.mutation(api.characters.resetCreature, { code, dmCode: wrong, characterId: creature }),
        'NotDm',
      )
    }
    expect((await storedCreature(t, creature)).cr).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// (f) The two creature mutations refuse everything that is not a creature
// ---------------------------------------------------------------------------

describe('the creature mutations refuse anything that has no rating', () => {
  /**
   * A hand-built NPC has no rating to scale from, a premade hero has a level instead, and
   * a hand-built hero has neither. All three are refused, and the refusal has to say
   * something **true about the character in hand** — a refusal that sends the DM to the
   * wrong control on the basis of a false statement is worse than a bare "no", because
   * the DM acts on it.
   *
   * ⚠️ **A REGRESSION HELD DOWN, and this one was live when the suite was written.**
   * `setCreatureCr` and `resetCreature` originally took their whole refusal as a
   * parameter, copying `requirePresetCharacter`'s shape — so one sentence covered every
   * non-creature:
   *
   * > Only a creature from the bestiary can have its challenge rating shifted. A
   * > hand-built NPC has no rating to scale from — edit its sheet instead.
   *
   * True of a hand-built NPC, false of a premade hero, and it sent that hero's DM to edit
   * a sheet a premade character has not got. The shape does not transfer because a
   * *level* is refused to exactly one kind of thing and a *rating* is refused to three;
   * the fix was to build the second half of the sentence from the character rather than
   * from the call site, which is `notACreature`.
   *
   * Asserted as three distinct messages rather than three non-empty ones, because "each
   * of these says something specific and different" is the whole property.
   */
  test('the refusal names the right control for a monster, a premade hero and a hand-built one', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)

    const { characterId: handBuilt } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Goblin, typed in',
      sheet: defaultNpcSheet(),
    })
    const { characterId: premadeHero } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Brannoc Emberhand',
      sheet: presetSheet(),
    })
    const { characterId: typedHero } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Thorin, typed in',
      sheet: {
        kind: 'pc',
        level: 3,
        className: 'Fighter',
        abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
        saveProficiencies: {
          str: true,
          dex: false,
          con: true,
          int: false,
          wis: false,
          cha: false,
        },
        armourClass: 17,
        maxHp: 28,
        hitDice: { count: 3, faces: 10 },
        feats: [],
        spells: [],
      },
    })

    const shift = (characterId: Id<'characters'>) =>
      refusalOf(t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId, cr: 4 }))

    const forNpc = await shift(handBuilt)
    expect(forNpc.kind).toBe('BadInput')
    expect(forNpc.message).toContain('hand-built NPC')

    const forPremade = await shift(premadeHero)
    expect(forPremade.kind).toBe('BadInput')
    // The right control, named: the DM sets a premade hero's level.
    expect(forPremade.message).toContain('level')
    expect(
      forPremade.message,
      'a premade hero was told it is a hand-built NPC and sent to edit a sheet it has not got',
    ).not.toContain('hand-built NPC')

    const forTypedHero = await shift(typedHero)
    expect(forTypedHero.kind).toBe('BadInput')
    expect(forTypedHero.message).not.toContain('hand-built NPC')

    // All three genuinely differ, which is the property. Three identical sentences would
    // satisfy every individual assertion above.
    expect(new Set([forNpc.message, forPremade.message, forTypedHero.message]).size).toBe(3)

    // ...and every one of them still opens with the same true clause, so the shared half
    // is shared rather than three near-copies.
    for (const refusal of [forNpc, forPremade, forTypedHero]) {
      expect(refusal.message).toContain('Only a creature from the bestiary can')
    }

    // `resetCreature` asks a different question of the same three and gets the same
    // treatment — one shared opening clause, one sentence chosen from the character.
    for (const characterId of [handBuilt, premadeHero, typedHero]) {
      const refusal = await refusalOf(
        t.mutation(api.characters.resetCreature, { code, dmCode, characterId }),
      )
      expect(refusal.kind).toBe('BadInput')
      expect(refusal.message).toContain('Only a creature from the bestiary can')
    }
  })

  test('a hand-built NPC and a premade hero are unchanged by either refusal', async () => {
    const t = harness()
    const { code, dmCode } = await makeGame(t)
    const { characterId: handBuilt } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: 'Goblin, typed in',
      sheet: defaultNpcSheet(),
    })
    const before = await t.run(
      async (ctx) => (await ctx.db.get('characters', handBuilt))?.sheet,
    )

    await refusalOf(
      t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: handBuilt, cr: 4 }),
    )
    await refusalOf(
      t.mutation(api.characters.resetCreature, { code, dmCode, characterId: handBuilt }),
    )

    expect(
      await t.run(async (ctx) => (await ctx.db.get('characters', handBuilt))?.sheet),
    ).toStrictEqual(before)
  })

  /**
   * A fabricated id and a character in another game get the same refusal a real
   * character gets, so neither mutation can be used to find out that a creature exists.
   * Both are DM-gated, so this is not the spoiler channel `characters.sheet` is — but
   * the refusals are one shared constant and asserting the parity is what stops three
   * literals drifting apart under maintenance.
   */
  test('another game’s creature is not this game’s', async () => {
    const t = harness()
    const mine = await makeGame(t)
    const theirs = await makeGame(t, 'Other Table', 'Sam')
    const creature = await makeCreature(t, theirs.code, theirs.dmCode)

    await expectKind(
      t.mutation(api.characters.setCreatureCr, {
        code: mine.code,
        dmCode: mine.dmCode,
        characterId: creature,
        cr: 4,
      }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.resetCreature, {
        code: mine.code,
        dmCode: mine.dmCode,
        characterId: creature,
      }),
      'CharacterNotFound',
    )
    expect((await storedCreature(t, creature)).cr).toBe(1)
  })
})
