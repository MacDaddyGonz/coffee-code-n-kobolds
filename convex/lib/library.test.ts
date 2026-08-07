import { describe, expect, test } from 'vitest'

import {
  CLASS_KEYS,
  MAX_LIBRARY_LEVEL,
  MIN_LIBRARY_LEVEL,
  SUBCLASS_LEVEL,
  findClass,
  type ClassKey,
} from './classes'
import { LIBRARY, librarySheet } from './library'
import type { LibraryEntry, LibrarySheet } from './library'
import { MAX_RESOURCE_USES, REST_KINDS, restores } from './rest'
import { SPECIES, SPECIES_KEYS } from './species'
import { resolveSheet } from './resolve'
import { catalogueEntry } from './rules'
import { SKILL_KEYS } from './skills'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_ROLL_LENGTH,
  MAX_SHEET_ENTRIES,
  MAX_SPELL_LEVEL,
  MIN_SPELL_LEVEL,
  SHEET_ENTRY_CATEGORIES,
  isValidRoll,
  normaliseRoll,
  rollShapeOf,
  sheetProblem,
} from './sheet'
import type { PcSheet, PresetSheet, SheetEntry, SheetEntryCategory } from './sheet'

// ---------------------------------------------------------------------------
// The sixty, enumerated once.
//
// Every test below walks this list rather than naming a class, because the
// failure this file exists to catch is the one sheet out of sixty that nobody
// re-read. A per-class test would only ever be as good as the classes somebody
// remembered to write one for.
//
// ⚠️ **It was seventy-two and the shape changed as well as the count.** An
// archetype is chosen at level 3 in 2024, so levels 1 **and 2** are shared by
// everybody of the class and each needs a sheet of its own; and no SRD contains
// more than one subclass per class, so a class has one path covering 3 to 5.
// 12 × (2 + 3) = 60.
// ---------------------------------------------------------------------------

/** Levels 1 and 2, before any archetype exists to choose. */
const BASE_LEVELS = [1, 2] as const
/** Levels 3 to 5, the range one archetype covers. */
const ARCHETYPE_LEVELS = [3, 4, 5] as const

/**
 * The level an ability score improvement first appears at.
 *
 * Four in every one of the twelve classes, which is why it is a constant here rather
 * than `SUBCLASS_LEVEL + 1`: the two numbers agree today and mean different things, and
 * the SRD is free to move either.
 */
const IMPROVEMENT_LEVEL = 4

type Coordinate = {
  classKey: ClassKey
  /** Null for the two shared levels. */
  subclassKey: string | null
  level: number
  /** `fighter/champion/3`, so a failure names the sheet rather than an index. */
  label: string
}

/** Every position the library is supposed to hold a sheet at: 12 × (2 + 3) = 60. */
const COORDINATES: Coordinate[] = CLASS_KEYS.flatMap((classKey) => [
  ...BASE_LEVELS.map((level) => ({
    classKey,
    subclassKey: null,
    level,
    label: `${classKey}/base/${level}`,
  })),
  ...findClass(classKey)!.subclasses.flatMap((subclass) =>
    ARCHETYPE_LEVELS.map((level) => ({
      classKey,
      subclassKey: subclass.key,
      level,
      label: `${classKey}/${subclass.key}/${level}`,
    })),
  ),
])

function sheetAt(at: Coordinate): LibrarySheet | undefined {
  const library = LIBRARY[at.classKey]
  if (at.subclassKey === null) return library.base[at.level]
  return library.paths[at.subclassKey]?.[at.level]
}

type Placed = Coordinate & { sheet: LibrarySheet }

/**
 * The coordinates that actually hold a sheet. Everything downstream iterates
 * this, and `the library holds a sheet at all 60 positions` below is what stops
 * a missing sheet turning every other loop in the file into a shorter one that
 * still passes.
 */
const SHEETS: Placed[] = COORDINATES.flatMap((at) => {
  const sheet = sheetAt(at)
  return sheet ? [{ ...at, sheet }] : []
})

/** Feats and spells together — one sheet's worth of lines, in the order the resolver adds them. */
function entriesOf(sheet: LibrarySheet): LibraryEntry[] {
  return [...sheet.feats, ...sheet.spells]
}

/** The selections that produce this sheet, for the species and lineage given. */
function preset(
  at: Coordinate,
  speciesKey: PresetSheet['species'],
  lineageKey: string | null = null,
): PresetSheet {
  return {
    kind: 'preset',
    species: speciesKey,
    lineageKey,
    classKey: at.classKey,
    subclassKey: at.subclassKey,
    level: at.level,
    locked: false,
  }
}

function resolvedAt(
  at: Coordinate,
  speciesKey: PresetSheet['species'] = 'human',
  lineageKey: string | null = null,
): PcSheet {
  return resolveSheet({ sheet: preset(at, speciesKey, lineageKey) }) as PcSheet
}

/** Only the lines the library contributed — the resolver prefixes those `lib:`. */
function libraryEntries(sheet: PcSheet): SheetEntry[] {
  return [...sheet.feats, ...sheet.spells].filter((entry) => entry.id.startsWith('lib:'))
}

/**
 * Every species, paired with every lineage it offers and with none.
 *
 * The resolver appends a species' traits *and* a lineage's on top of the library's own
 * entries, so the widest sheet the application can produce is a class's fullest level
 * plus the busiest species-and-lineage pair. Nothing below may assume which pair that is.
 */
const ORIGINS: { speciesKey: PresetSheet['species']; lineageKey: string | null; label: string }[] =
  SPECIES.flatMap((entry) => [
    { speciesKey: entry.key, lineageKey: null, label: entry.key },
    ...(entry.lineages ?? []).map((lineage) => ({
      speciesKey: entry.key,
      lineageKey: lineage.key,
      label: `${entry.key}/${lineage.key}`,
    })),
  ])

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe('the library is complete', () => {
  /**
   * The anti-vacuity check, and it has to come first. Every loop below runs
   * over `SHEETS`; a library that had quietly lost half its content would make
   * all of them pass while asserting half as much.
   */
  test('holds a sheet at all 60 positions', () => {
    const missing = COORDINATES.filter((at) => sheetAt(at) === undefined).map((at) => at.label)
    expect(missing).toEqual([])
    expect(COORDINATES).toHaveLength(60)
    expect(SHEETS).toHaveLength(60)
  })

  test('has an entry for every class key, keyed by itself', () => {
    expect(CLASS_KEYS).toHaveLength(12)
    for (const classKey of CLASS_KEYS) {
      expect(LIBRARY[classKey], classKey).toBeDefined()
      // The record's key and the sheet's own `classKey` are two places the same
      // fact is written, which is two places for it to disagree — a paladin
      // filed under `ranger` would otherwise show up as a ranger with smites.
      expect(LIBRARY[classKey].classKey, classKey).toBe(classKey)
    }
    expect(Object.keys(LIBRARY).sort()).toEqual([...CLASS_KEYS].sort())
  })

  /**
   * ⚠️ **`base` is a record of two levels now rather than one sheet**, which is
   * `SUBCLASS_LEVEL` moving to 3 reaching the shape of the library. A class with
   * only a level 1 base would resolve a level 2 character to its level 1 sheet
   * and look entirely correct on screen.
   */
  test('shares levels 1 and 2 across every class, and nothing else', () => {
    for (const classKey of CLASS_KEYS) {
      expect(Object.keys(LIBRARY[classKey].base).map(Number).sort(), classKey).toEqual([
        ...BASE_LEVELS,
      ])
    }
    expect(SUBCLASS_LEVEL).toBe(3)
  })

  /**
   * A subclass key is stored on a character and looked up in two independent
   * places — `LIBRARY[class].paths` for the numbers and `CLASSES` for the name
   * the dropdown shows. A key present in one and not the other means either a
   * playable archetype nobody can pick or a pickable archetype with no sheet.
   *
   * **Exactly one**, and that is a licensing fact rather than a design one: no
   * SRD contains more than one subclass per class. `CharacterClass.subclasses`
   * is a tuple for the same reason.
   */
  test('every class has exactly one archetype, covering levels 3 to 5', () => {
    for (const classKey of CLASS_KEYS) {
      const declared = findClass(classKey)!.subclasses.map((entry) => entry.key)
      expect(declared, classKey).toHaveLength(1)
      expect(Object.keys(LIBRARY[classKey].paths).sort(), classKey).toEqual([...declared].sort())
      for (const key of declared) {
        expect(
          Object.keys(LIBRARY[classKey].paths[key]).map(Number).sort(),
          `${classKey}/${key}`,
        ).toEqual([...ARCHETYPE_LEVELS])
      }
    }
  })

  /**
   * The eight archetypes this library used to hold appear in no SRD and are
   * retired. None of them may come back through a content file — which is the
   * direction the type checker cannot see, because `paths` is keyed by string.
   */
  test('no retired archetype key survives in any path', () => {
    const retired = [
      'battle-master',
      'assassin',
      'vengeance',
      'valour',
      'light',
      'wild-heart',
      'divination',
      'beast-master',
    ]
    const found: string[] = []
    for (const classKey of CLASS_KEYS) {
      for (const key of Object.keys(LIBRARY[classKey].paths)) {
        if (retired.includes(key)) found.push(`${classKey}/${key}`)
      }
    }
    expect(found).toEqual([])
  })

  /**
   * `types.ts` says the level is held on the sheet as well as in its position
   * "so a test can catch a misfile". This is that test: a level 4 sheet pasted
   * into the level 5 slot is invisible to every other assertion here, because
   * both are well-formed sheets.
   */
  test('every sheet states the level it is filed at', () => {
    for (const { label, level, sheet } of SHEETS) {
      expect(sheet.level, label).toBe(level)
    }
  })

  /**
   * ⚠️ **Eighteen, not thirteen** — change 4 of the conversion. Every content file
   * builds this by spreading `noSkills()` rather than writing the flags out, and
   * this is what makes that spelling safe: a sheet that had lost a key, or gained
   * one nothing knows about, fails here.
   */
  test('every sheet carries all eighteen skill flags and nothing else', () => {
    expect(SKILL_KEYS).toHaveLength(18)
    for (const { label, sheet } of SHEETS) {
      expect(Object.keys(sheet.skillProficiencies).sort(), label).toEqual([...SKILL_KEYS].sort())
      for (const key of SKILL_KEYS) {
        expect(typeof sheet.skillProficiencies[key], `${label}.${key}`).toBe('boolean')
      }
    }
  })

  /**
   * **Six trained skills at level 1 is the most any 2024 build reaches** — the
   * background's two plus the class's four — and every build has at least the
   * background's two. A sheet with none is one where the absorbed background was
   * forgotten, which is the failure this whole conversion invites.
   */
  test('every sheet is trained in at least the background΄s two skills', () => {
    for (const { label, sheet } of SHEETS) {
      const trained = SKILL_KEYS.filter((key) => sheet.skillProficiencies[key])
      expect(trained.length, `${label} trained skills`).toBeGreaterThanOrEqual(2)
      expect(trained.length, `${label} trained skills`).toBeLessThanOrEqual(9)
    }
  })

  test('every sheet has equipment and levelling notes', () => {
    for (const { label, sheet } of SHEETS) {
      expect(sheet.equipment.trim(), `${label}.equipment`).not.toBe('')
      expect(sheet.levellingNotes.trim(), `${label}.levellingNotes`).not.toBe('')
    }
  })
})

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

describe('hit dice', () => {
  /**
   * Two facts that are written down twice — the die in `CLASSES.hitDieFaces`
   * and the die on each of a class's five sheets — and the count, which is the
   * level and is therefore derivable but typed out anyway. `classes.ts` says in
   * as many words that this test is why `hitDieFaces` is held there at all: "a
   * d6 rogue is the sort of typo that survives a hundred readings".
   */
  test('is one die per level, of the face the class declares', () => {
    for (const { label, level, classKey, sheet } of SHEETS) {
      expect(sheet.hitDice.count, `${label}.hitDice.count`).toBe(level)
      expect(sheet.hitDice.faces, `${label}.hitDice.faces`).toBe(findClass(classKey)!.hitDieFaces)
    }
  })

  /** Not vacuous: the twelve classes really do span all four dice. */
  test('and the twelve classes between them use every face', () => {
    const faces = new Set(CLASS_KEYS.map((key) => findClass(key)!.hitDieFaces))
    expect([...faces].sort((a, b) => a - b)).toEqual([6, 8, 10, 12])
  })
})

describe('ability scores', () => {
  const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
  const STANDARD_TOTAL = STANDARD_ARRAY.reduce((sum, value) => sum + value, 0)
  /**
   * ⚠️ **The background's spread, which every sheet now has baked in.** A 2024
   * background gives `+2/+1` or `+1/+1/+1` over three named abilities — three
   * points, no single step larger than two — and requirements.md still excludes
   * backgrounds, so the *premade sheet* is the authority on where they went. See
   * the docblock on `LibrarySheet.abilities`, which exists so that nobody reads
   * this as "backgrounds were lifted".
   */
  const BACKGROUND_TOTAL = 3
  const BACKGROUND_STEP = 2
  /** One ability score improvement is +2, spread over one score or two. */
  const MAX_IMPROVEMENT = 2

  function sorted(sheet: LibrarySheet): number[] {
    return Object.values(sheet.abilities).sort((a, b) => b - a)
  }

  /**
   * ⚠️ **This test USED to say the scores were exactly the standard array, and
   * the change is the sharpest single edit in the conversion.** In 2024 a species
   * grants no ability score increase at all and a background grants three points,
   * so a level 1 sheet holding the bare array would be two points short of every
   * character in the book.
   *
   * Adding a non-negative amount to a multiset can only raise each order
   * statistic, so a pointwise comparison against the sorted array is exact in both
   * directions: nothing may be below the array, nothing may be more than one
   * background step above it, and the total is the array plus three. A sheet that
   * paid for its spread by dumping something else fails the lower bound.
   */
  test('are the standard array plus one background spread below level 4', () => {
    for (const { label, level, sheet } of SHEETS) {
      if (level >= IMPROVEMENT_LEVEL) continue
      const scores = sorted(sheet)
      const total = scores.reduce((sum, value) => sum + value, 0)
      expect(total, `${label} total`).toBe(STANDARD_TOTAL + BACKGROUND_TOTAL)
      for (const [index, score] of scores.entries()) {
        expect(score, `${label} score ${index}`).toBeGreaterThanOrEqual(STANDARD_ARRAY[index])
        expect(score, `${label} score ${index}`).toBeLessThanOrEqual(
          STANDARD_ARRAY[index] + BACKGROUND_STEP,
        )
      }
    }
  })

  /**
   * From level 4 an ability score improvement is allowed and every sheet takes
   * one. It is bounded rather than free: +2 in total on top of the background's
   * three, and never a score going *down*.
   */
  test('differ by at most one improvement from level 4', () => {
    for (const { label, level, sheet } of SHEETS) {
      if (level < IMPROVEMENT_LEVEL) continue
      const scores = sorted(sheet)
      const total = scores.reduce((sum, value) => sum + value, 0)
      expect(total - STANDARD_TOTAL - BACKGROUND_TOTAL, `${label} total`).toBeGreaterThanOrEqual(0)
      expect(total - STANDARD_TOTAL - BACKGROUND_TOTAL, `${label} total`).toBeLessThanOrEqual(
        MAX_IMPROVEMENT,
      )
      for (const [index, score] of scores.entries()) {
        expect(score, `${label} score ${index}`).toBeGreaterThanOrEqual(STANDARD_ARRAY[index])
        expect(score, `${label} score ${index}`).toBeLessThanOrEqual(
          STANDARD_ARRAY[index] + BACKGROUND_STEP + MAX_IMPROVEMENT,
        )
      }
    }
  })

  /**
   * An improvement is a step forward, never a step back. Level 5 having fewer
   * points than level 3 would be a transcription slip rather than a build
   * choice, and neither sheet is wrong on its own. Run across the base/path seam
   * as well, because levels 2 and 3 are held in different objects now.
   */
  test('never fall as a class levels up', () => {
    for (const classKey of CLASS_KEYS) {
      const library = LIBRARY[classKey]
      for (const key of Object.keys(library.paths)) {
        const path = library.paths[key]
        const by = (level: number) => (level <= 2 ? library.base[level] : path[level])
        for (const level of [2, 3, 4, 5]) {
          const here = Object.values(by(level).abilities)
          const before = Object.values(by(level - 1).abilities)
          for (const [index, score] of here.entries()) {
            expect(score, `${classKey}/${key}/${level} ability ${index}`).toBeGreaterThanOrEqual(
              before[index],
            )
          }
        }
      }
    }
  })
})

describe('hit points and armour', () => {
  /**
   * Not an exact formula — the sheets are hand-written and a paladin in plate
   * is not a sorcerer in a shirt — but a maximum that fell as a character
   * levelled up, or an armour class that did, is a slip rather than a build.
   */
  test('never fall as a class levels up', () => {
    for (const classKey of CLASS_KEYS) {
      const library = LIBRARY[classKey]
      for (const key of Object.keys(library.paths)) {
        const path = library.paths[key]
        const by = (level: number) => (level <= 2 ? library.base[level] : path[level])
        for (const level of [2, 3, 4, 5]) {
          expect(by(level).maxHp, `${classKey}/${key}/${level}`).toBeGreaterThan(
            by(level - 1).maxHp,
          )
          expect(by(level).armourClass, `${classKey}/${key}/${level}`).toBeGreaterThanOrEqual(
            by(level - 1).armourClass,
          )
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

describe('entries', () => {
  /**
   * `isValidRoll` imported from sheet.ts rather than a copy of the pattern, for
   * the reason rules.test.ts gives about the catalogue: a copied regex keeps
   * passing after the real grammar tightens, which is exactly the drift it
   * would be there to catch.
   */
  test('every roll satisfies the stored grammar', () => {
    for (const { label, sheet } of SHEETS) {
      for (const entry of entriesOf(sheet)) {
        if (entry.roll === null) continue
        expect(isValidRoll(entry.roll), `${label}: ${entry.name} → ${entry.roll}`).toBe(true)
        expect(normaliseRoll(entry.roll), `${label}: ${entry.name}`).toBe(entry.roll)
        expect(entry.roll.length, `${label}: ${entry.name}`).toBeLessThanOrEqual(MAX_ROLL_LENGTH)
      }
    }
  })

  test('every name and description is non-empty and inside the stored bounds', () => {
    for (const { label, sheet } of SHEETS) {
      for (const entry of entriesOf(sheet)) {
        const where = `${label}: ${entry.name}`
        expect(entry.name.trim(), where).not.toBe('')
        expect(entry.name.length, where).toBeLessThanOrEqual(MAX_ENTRY_NAME_LENGTH)
        expect(entry.text.trim(), where).not.toBe('')
        expect(entry.text.length, where).toBeLessThanOrEqual(MAX_ENTRY_TEXT_LENGTH)
      }
    }
  })

  /** `level` means *spell* level throughout — a feat has none, and a cantrip is 0. */
  test('feats carry no level and spells carry one in range', () => {
    for (const { label, sheet } of SHEETS) {
      for (const entry of sheet.feats) {
        expect(entry.level, `${label} feat ${entry.name}`).toBeNull()
      }
      for (const entry of sheet.spells) {
        const where = `${label} spell ${entry.name}`
        expect(entry.level, where).not.toBeNull()
        expect(Number.isInteger(entry.level), where).toBe(true)
        expect(entry.level as number, where).toBeGreaterThanOrEqual(MIN_SPELL_LEVEL)
        expect(entry.level as number, where).toBeLessThanOrEqual(MAX_SPELL_LEVEL)
      }
    }
  })

  /**
   * ⚠️ **Level 3 is the ceiling, and it is the scope lever the whole milestone
   * rests on.** A character stops at level 5, which is where level 3 slots
   * arrive and where level 4 spells do not — so a level 4 spell on a library
   * sheet is a spell nobody at this table can cast.
   */
  test('no spell is of a level this library can cast', () => {
    const tooHigh: string[] = []
    for (const { label, sheet } of SHEETS) {
      for (const entry of sheet.spells) {
        if ((entry.level as number) > 3) tooHigh.push(`${label}: ${entry.name}`)
      }
    }
    expect(tooHigh).toEqual([])
  })

  /**
   * A name is what a player reads and an id is what React and the roll target
   * use, and the two can fail independently. `sheetProblem` refuses a sheet with
   * a duplicate *id*, so a repeated name is caught downstream — but a repeated
   * name that slugs to two *different* ids is not, and reads as the same spell
   * listed twice.
   */
  test('no sheet repeats an entry name across its feats and spells', () => {
    for (const { label, sheet } of SHEETS) {
      const names = entriesOf(sheet).map((entry) => entry.name)
      const repeated = names.filter((name, index) => names.indexOf(name) !== index)
      expect(repeated, label).toEqual([])
    }
  })

  /**
   * And the other direction, which is the one distinct names do not protect
   * against: `resolve.ts` slugs a name and then **truncates the result to
   * `MAX_ENTRY_ID_LENGTH`**, so two long names sharing a prefix collide after
   * the cut. `lib:` costs four of the thirty-two characters, leaving twenty-
   * eight of the slug — well inside the sixty a name is allowed to be.
   *
   * A collision is not cosmetic. `sheetProblem` refuses the whole sheet, so the
   * character cannot be saved at all, and `sheetEntriesOf` silently loses a row
   * to the duplicate React key.
   */
  test('no sheet repeats a derived entry id once truncated', () => {
    for (const at of SHEETS) {
      const ids = libraryEntries(resolvedAt(at)).map((entry) => entry.id)
      expect(ids.length, `${at.label} lost entries`).toBe(entriesOf(at.sheet).length)
      for (const id of ids) {
        expect(id.length, `${at.label}: ${id}`).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
      }
      const repeated = ids.filter((id, index) => ids.indexOf(id) !== index)
      expect(repeated, at.label).toEqual([])
    }
  })

  /**
   * ⚠️ **The bound moved from `2 × level + 2` and the reason is the SRD rather
   * than generosity.** A 2024 full caster knows three or four *cantrips* before
   * it prepares anything, which the old bound predates — a level 1 Wizard with
   * three cantrips and three spells is already six lines.
   *
   * It is still an upper bound rather than a shape, because a Barbarian has none
   * at any level and a Cleric has thirteen at level 5. **These sheets hold a
   * playable selection rather than a class's whole prepared list**: the SRD says
   * *choose N spells*, this is one such choice, and nothing in this application
   * counts prepared spells. A sheet carrying all nine a level 5 Cleric may
   * prepare plus six domain spells is a sheet nobody reads.
   */
  test('spell lists stay inside a bound that grows with the level', () => {
    for (const { label, level, sheet } of SHEETS) {
      expect(sheet.spells.length, label).toBeLessThanOrEqual(2 * level + 4)
    }
    // Not vacuous: the full casters really do fill the allowance, so the bound
    // above is one or two entries away from biting rather than an order of
    // magnitude clear of the content.
    const fullest = Math.max(...SHEETS.map(({ sheet }) => sheet.spells.length))
    expect(fullest).toBeGreaterThanOrEqual(12)
    // And a class with no spells at all is allowed — a barbarian has none at
    // any level, which is what makes the bound an upper one rather than a shape.
    expect(SHEETS.some(({ sheet }) => sheet.spells.length === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Limited uses
//
// ⚠️ **An ALLOW-LIST AND ITS INVERSE, because either half alone is a guard that
// cannot fail.** `uses` is optional on a `SheetEntry`, so a sweep that had lost
// the field would leave every entry looking like an unlimited one — a shape
// everything downstream is required to accept — and a test that only checked the
// entries which *have* one would pass over a corpus that had none.
//
// So both directions are pinned: every entry carrying a count is named here, and
// every name here still carries one. Rage losing its two uses fails the second
// half; `convex/lib/dice.ts` growing a reason to spend one fails the first.
// ---------------------------------------------------------------------------

describe('the things a sheet counts', () => {
  /**
   * The full list, copied out of the corpus by hand rather than derived from it.
   *
   * Twelve classes, four resource shapes this library had never held before —
   * the Monk's short-rest Focus Points, the Sorcerer's Sorcery Points, the
   * Warlock's short-rest Pact Magic slots and the Druid's Wild Shape with its
   * partial hand-back — and one class, the Rogue, that counts nothing at all.
   */
  const LIMITED: Record<ClassKey, string[]> = {
    barbarian: ['Rage'],
    bard: ['Bardic Inspiration'],
    cleric: ['Channel Divinity'],
    druid: ['Wild Shape'],
    fighter: ['Second Wind', 'Action Surge'],
    monk: ["Monk's Focus", 'Uncanny Metabolism'],
    paladin: ["Paladin's Smite", 'Channel Divinity: Divine Sense', 'Faithful Steed'],
    ranger: ['Favored Enemy'],
    rogue: [],
    sorcerer: ['Innate Sorcery', 'Font of Magic', 'Sorcerous Restoration'],
    warlock: ['Pact Magic', 'Magical Cunning'],
    wizard: ['Arcane Recovery'],
  }

  const COUNTED = SHEETS.flatMap(({ label, classKey, sheet }) =>
    entriesOf(sheet)
      .filter((entry) => entry.uses !== undefined)
      .map((entry) => ({ label, classKey, entry })),
  )

  test('are exactly the ones named above, and every name is really used', () => {
    const unexpected = COUNTED.filter(
      ({ classKey, entry }) => !LIMITED[classKey].includes(entry.name),
    ).map(({ label, entry }) => `${label}: ${entry.name}`)
    expect(unexpected, 'an entry counts something the allow-list does not name').toEqual([])

    const missing: string[] = []
    for (const classKey of CLASS_KEYS) {
      for (const name of LIMITED[classKey]) {
        const found = COUNTED.some(
          (counted) => counted.classKey === classKey && counted.entry.name === name,
        )
        if (!found) missing.push(`${classKey}: ${name}`)
      }
    }
    expect(missing, 'the allow-list names something that no longer counts anything').toEqual([])

    // And the sweep read something. A corpus that had lost `uses` entirely would
    // satisfy the first half above and fail here.
    expect(COUNTED.length).toBeGreaterThan(20)
  })

  /**
   * ⚠️ **A spell never counts its own uses, and that is a decision rather than an
   * omission.** Spell slots are a pool the *class feature* holds — Pact Magic's
   * two, the Sorcerer's Font of Magic — and a per-spell count beside them would
   * be a second thing to tick off for one cast. Weapons never count either, for
   * the obvious reason.
   */
  test('and no spell and no weapon is one of them', () => {
    const stray: string[] = []
    for (const { label, sheet } of SHEETS) {
      for (const entry of sheet.spells) {
        if (entry.uses !== undefined) stray.push(`${label}: spell ${entry.name}`)
      }
      for (const entry of entriesOf(sheet)) {
        if (entry.category === 'weapon' && entry.uses !== undefined) {
          stray.push(`${label}: weapon ${entry.name}`)
        }
      }
    }
    expect(stray).toEqual([])
  })

  /**
   * The shape rules `usesProblem` in lib/sheet.ts enforces on save, checked over
   * the whole corpus at once — it stops at the first problem on a sheet, so the
   * resolution test at the foot of this file would report one offender out of
   * sixty and say nothing about the rest.
   */
  test('every count is in range, and a partial hand-back only sits on a long rest', () => {
    const wrong: string[] = []
    for (const { label, classKey, entry } of COUNTED) {
      const uses = entry.uses!
      const where = `${label}: ${entry.name}`
      void classKey
      if (!Number.isInteger(uses.max) || uses.max < 1 || uses.max > MAX_RESOURCE_USES) {
        wrong.push(`${where} max ${uses.max}`)
      }
      if (!REST_KINDS.includes(uses.recharge)) wrong.push(`${where} recharge ${uses.recharge}`)
      const regain = uses.regainOnShortRest
      if (regain !== undefined) {
        // Asked through `restores` rather than `recharge === 'short'` for the
        // reason lib/sheet.ts gives: a third rest period is answered by the one
        // function with a `never` arm.
        if (restores(uses.recharge, 'short')) wrong.push(`${where} partial on a short-rest pool`)
        if (!Number.isInteger(regain) || regain < 1 || regain > uses.max) {
          wrong.push(`${where} regainOnShortRest ${regain}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  /**
   * ⚠️ **Both rests and the partial hand-back all really occur**, so the rules
   * above are rules rather than descriptions of a corpus that only writes one
   * shape. The Warlock's Pact Magic is the short-rest case the absorbed
   * character-resources milestone said this corpus did not contain; Wild Shape
   * and Second Wind are the partial hand-back that reversed its long-rest-only
   * reduction.
   */
  test('and all three recharge shapes are present in the corpus', () => {
    const recharges = new Set(COUNTED.map(({ entry }) => entry.uses!.recharge))
    expect([...recharges].sort()).toEqual([...REST_KINDS].sort())
    expect(COUNTED.some(({ entry }) => entry.uses!.regainOnShortRest !== undefined)).toBe(true)

    const warlock = COUNTED.filter(
      ({ classKey, entry }) => classKey === 'warlock' && entry.name === 'Pact Magic',
    )
    expect(warlock.length).toBeGreaterThan(0)
    for (const { label, entry } of warlock) {
      expect(entry.uses!.recharge, `${label} Pact Magic`).toBe('short')
    }
    // And the negative control the roadmap's acceptance criterion asks for: the
    // Wizard beside them gets nothing back on a short rest.
    const wizard = COUNTED.filter(({ classKey }) => classKey === 'wizard')
    expect(wizard.length).toBeGreaterThan(0)
    for (const { label, entry } of wizard) {
      expect(entry.uses!.recharge, `${label} ${entry.name}`).toBe('long')
    }
  })
})

// ---------------------------------------------------------------------------
// The entry taxonomy
//
// ⚠️ **Every assertion here is about several hundred entries, and both of the
// fields it is about are optional on the stored shape.** A sweep that dropped
// `category` on the way in would leave each entry looking like a legacy entry,
// which is a shape everything downstream is required to accept — so these are
// written to fail on absence, and the anti-vacuity gate below is what stops them
// passing over a corpus they never read.
// ---------------------------------------------------------------------------

describe('the category on a premade entry', () => {
  const ALL = SHEETS.flatMap(({ label, sheet }) =>
    entriesOf(sheet).map((entry) => ({ label, entry })),
  )

  /** The tokens a to-hit may reference, and the one it must reference alongside them. */
  const ABILITY_TOKEN = /\b(STR|DEX|CON|INT|WIS|CHA)\b/
  const PROFICIENCY_TOKEN = /\bPROF\b/

  /**
   * ⚠️ **The anti-vacuity gate, and it is load-bearing rather than decorative.**
   *
   * `category` is required on a `LibraryEntry` and optional on the `SheetEntry` it
   * becomes, so a corpus that had lost the field would still typecheck everywhere
   * it is *read* — and every loop below would then be iterating entries whose
   * category is `undefined`, comparing it against nothing and passing. The count
   * is pinned by hand, and all three categories are asserted to exist, because a
   * mass re-categorisation is the failure that leaves every per-entry rule below
   * still satisfied.
   */
  test('every one of the 834 entries names one of the three categories', () => {
    // Copied out of the corpus by hand, not derived from it.
    expect(ALL.length).toBe(834)
    for (const { label, entry } of ALL) {
      expect(SHEET_ENTRY_CATEGORIES, `${label}: ${entry.name}`).toContain(entry.category)
    }
    // And all three are actually used, so no loop below is filtering to nothing.
    const used = new Set<SheetEntryCategory>(ALL.map(({ entry }) => entry.category))
    expect([...used].sort()).toEqual([...SHEET_ENTRY_CATEGORIES].sort())
  })

  /**
   * **The coherence rule, over the whole corpus at once.** `entriesProblem`
   * enforces the identical thing on save, but it stops at the first problem on a
   * sheet — so the resolution test at the foot of this file would report one
   * offender out of sixty sheets and say nothing about the rest. This reports all
   * of them, which is what a corpus-wide re-categorisation needs.
   */
  test('every entry carries exactly the rolls its category promises', () => {
    const wrong: string[] = []
    for (const { label, entry } of ALL) {
      const shape = rollShapeOf(entry.category)
      const where = `${label}: ${entry.name} (${entry.category})`
      if (shape.toHit !== (entry.toHit !== undefined)) {
        wrong.push(`${where} toHit ${entry.toHit ?? 'absent'}`)
      }
      if (shape.roll !== (entry.roll !== null)) {
        wrong.push(`${where} roll ${entry.roll ?? 'absent'}`)
      }
    }
    expect(wrong).toEqual([])
  })

  test('no action and no passive carries a to-hit', () => {
    const stray = ALL.filter(
      ({ entry }) => entry.category !== 'weapon' && entry.toHit !== undefined,
    ).map(({ label, entry }) => `${label}: ${entry.name} (${entry.category})`)
    expect(stray).toEqual([])
  })

  /**
   * ⚠️ **A mastery is a word on a WEAPON and on nothing else**, which
   * `entriesProblem` refuses on the way in and which is asserted here over the
   * whole corpus. It does nothing — see the header of lib/mastery.ts and
   * `convex/masteryGuard.test.ts`, which is what makes that a promise rather than
   * an intention.
   */
  test('a mastery sits on a weapon and only on a weapon, and some weapons have none', () => {
    const stray = ALL.filter(({ entry }) => entry.category !== 'weapon' && entry.mastery !== undefined)
      .map(({ label, entry }) => `${label}: ${entry.name} (${entry.category})`)
    expect(stray).toEqual([])

    const weapons = ALL.filter(({ entry }) => entry.category === 'weapon')
    // Both shapes occur, so the rule above is a rule rather than a description of
    // a corpus that happens to put a mastery on everything: a spell attack has
    // none, and neither does an unarmed strike.
    expect(weapons.some(({ entry }) => entry.mastery !== undefined)).toBe(true)
    expect(weapons.some(({ entry }) => entry.mastery === undefined)).toBe(true)
  })

  /**
   * A to-hit is a d20 roll, which the *validator* does not enforce — `entriesProblem`
   * asks only that it satisfies the shared grammar, so `2d6+STR` would be stored as
   * a to-hit without complaint. The corpus is where that discipline is actually
   * kept, so it is asserted here.
   *
   * Normalisation is checked alongside for the reason rules.test.ts gives about the
   * damage: the resolver copies the string verbatim onto the sheet, so one that is
   * valid but not already normalised would be stored as something other than what
   * the library says.
   */
  test('every weapon rolls 1d20 to hit, in already-normalised form', () => {
    const weapons = ALL.filter(({ entry }) => entry.category === 'weapon')
    expect(weapons.length).toBeGreaterThan(0)
    for (const { label, entry } of weapons) {
      const toHit = entry.toHit
      const where = `${label}: ${entry.name}`
      expect(toHit, `${where} has no to-hit`).toBeDefined()
      expect(isValidRoll(toHit as string), `${where} → ${toHit}`).toBe(true)
      expect((toHit as string).startsWith('1d20'), `${where} → ${toHit}`).toBe(true)
      expect(normaliseRoll(toHit as string), where).toBe(toHit)
      expect((toHit as string).length, where).toBeLessThanOrEqual(MAX_ROLL_LENGTH)
      // A weapon rolls damage as well as landing — the other half of its arity.
      expect(entry.roll, `${where} has no damage`).not.toBeNull()
    }
  })

  /**
   * ⚠️ **Every hero's to-hit carries PROF, and there is no longer a flat one.**
   *
   * The corpus used to hold both shapes, because the Ranger's Animal Companion was
   * a *creature* attacking on a number the sheet stated outright — and that
   * archetype was Beast Master, which appears in no SRD and is retired. Every
   * remaining weapon on every remaining sheet is swung by the character, so every
   * one of them scales off an ability and the proficiency bonus.
   *
   * What is refused is a to-hit that names an ability with no `PROF` beside it:
   * that is a hero's to-hit with the proficiency bonus forgotten, which is two to
   * four points too low at every level and looks entirely plausible on a sheet.
   * Nothing else here would catch it — it is a valid roll, it is a d20 roll, and
   * it resolves.
   */
  test("a weapon's to-hit names an ability and PROF together", () => {
    const wrong: string[] = []
    for (const { label, entry } of ALL) {
      if (entry.category !== 'weapon') continue
      const toHit = entry.toHit as string
      if (!ABILITY_TOKEN.test(toHit) || !PROFICIENCY_TOKEN.test(toHit)) {
        wrong.push(`${label}: ${entry.name} → ${toHit}`)
      }
    }
    expect(wrong).toEqual([])
  })

  /**
   * ⚠️ **The prose never states the to-hit**, which rules.ts states as a rule for
   * the catalogue and which applies to the library for the identical reason: a
   * number written in both a sentence and a field is two places for it to disagree
   * the moment a player edits their copy, and a line reading `+4 to hit` beside a
   * `toHit` of `1d20+6` is worse than one that says nothing.
   *
   * Scoped to weapons, deliberately. The Champion's Improved Critical explains that
   * "a 19 on the d20 is a critical hit for you", which is a rule about the die and
   * not a to-hit the entry is quoting — and it is a passive, so it has no `toHit`
   * for anything to disagree with.
   */
  test('no weapon states a to-hit or a d20 in its prose', () => {
    const offenders: string[] = []
    for (const { label, entry } of ALL) {
      if (entry.category !== 'weapon') continue
      if (/\bto hit\b/i.test(entry.text)) offenders.push(`${label}: ${entry.name} says "to hit"`)
      if (/1d20/.test(entry.text)) offenders.push(`${label}: ${entry.name} names 1d20`)
    }
    expect(offenders).toEqual([])
  })

  /** The positive control, so the empty set above is a tripwire rather than a blind spot. */
  test('and the sweep reads every weapon and its patterns do find a needle', () => {
    const weapons = ALL.filter(({ entry }) => entry.category === 'weapon')
    expect(weapons.length).toBeGreaterThan(50)
    for (const { entry } of weapons) expect(typeof entry.text).toBe('string')

    expect(/\bto hit\b/i.test('A melee swing, +7 to hit, reach 5 ft.')).toBe(true)
    expect(/1d20/.test('Roll 1d20+STR+PROF against its armour class.')).toBe(true)
    // And the exemption the scoping relies on is real: the passive that mentions a
    // d20 would fail a corpus-wide version of this sweep.
    expect(/1d20/.test('A 19 on the d20 is a critical hit for you as well as a 20.')).toBe(false)
  })
})

describe('entries taken from the catalogue', () => {
  const KEYED = SHEETS.flatMap(({ label, sheet }) =>
    entriesOf(sheet)
      .filter((entry) => entry.catalogueKey !== null)
      .map((entry) => ({ label, entry })),
  )

  /**
   * ⚠️ **Every key resolves, with no exemption list, and getting back here is what
   * the conversion was for.**
   *
   * A block used to sit at the top of this describe naming eight class features —
   * Second Wind, Action Surge, Rage, Sneak Attack, Divine Smite, Lay on Hands,
   * Bardic Inspiration and Wild Shape — that the spells branch had removed from
   * `FEATS` while the library still keyed entries at them. It was written as a
   * tripwire in three directions, one of which was *"the day the library rebuild
   * lands, this block fails and forces its own removal"*. That day is this commit:
   * the rebuilt sheets state those eight themselves with no `catalogueKey` at all,
   * so nothing dangles and the list has been deleted rather than extended.
   *
   * `catalogueEntry` still returns `undefined` rather than throwing, and a stored
   * copy still survives a retired key by design — that is `catalogueKey` being a
   * breadcrumb rather than a foreign key. What this asserts is a property of the
   * *corpus*: the library and the catalogue are written together, so they agree.
   */
  test('there are some, and every key names a catalogue entry that exists', () => {
    expect(KEYED.length).toBeGreaterThan(10)
    const dangling: string[] = []
    for (const { label, entry } of KEYED) {
      if (catalogueEntry(entry.catalogueKey as string) === undefined) {
        dangling.push(`${label}: ${entry.name} → ${entry.catalogueKey}`)
      }
    }
    expect(dangling).toEqual([])
  })

  /**
   * **The deliberate asymmetry, and it is a rule rather than a gap.**
   *
   * A `catalogueKey` is a breadcrumb saying "this line came from there", and a
   * player looking at Cure Wounds on their sheet and at Cure Wounds in the
   * picker must read the same words — so the name and the spell level are held
   * byte-for-byte identical.
   *
   * The **roll is exempt**, and rules.ts sanctions the exemption in as many
   * words: "Where a spell is cast by classes keyed off different abilities …
   * the entry names the commonest one. That is not a claim about the rules; it
   * is the least-editing default, and the copy on the sheet is editable
   * precisely so a paladin can change it to CHA." A bard's Cure Wounds heals
   * off Charisma while the catalogue says Wisdom, and that is correct on both
   * sides.
   *
   * **The text is exempt for the same reason, and that was a decision rather
   * than a discovery.** Every level 5 caster's cantrip says something the
   * catalogue's copy cannot, because the dice double there and the catalogue
   * describes the spell rather than the character.
   *
   * So the line the rule is drawn on is **identity, not wording**: the `name`
   * and the spell `level` say *which* catalogue entry this is and are held
   * exactly — the name doubly so, since ids derive from it.
   *
   * ⚠️ **`category` joins `name` and `level` on the identity side, and `toHit`
   * joins `text` and `roll` on the copy side.** A category says what happens when
   * the line is clicked — whether the dice work throws one roll or two — so a
   * spell cannot be a `weapon` in the picker and an `action` on a cleric's sheet.
   * A to-hit is exempt for precisely the reason the damage roll is: a cleric's
   * Guiding Bolt lands on `WIS` and a wizard's Fire Bolt on `INT`, and a druid's
   * Fire Bolt on `WIS` again — all three correct.
   */
  test('match the catalogue on name, level and category, but may tailor text, roll and to-hit', () => {
    const drifted: string[] = []
    for (const { label, entry } of KEYED) {
      const source = catalogueEntry(entry.catalogueKey as string)
      if (!source) continue
      const where = `${label}: ${entry.catalogueKey}`
      if (entry.name !== source.name) drifted.push(`${where} name: ${entry.name}`)
      if (entry.level !== source.level) drifted.push(`${where} level: ${entry.level}`)
      if (entry.category !== source.category) {
        drifted.push(`${where} category: ${entry.category} (catalogue says ${source.category})`)
      }
      // A tailored description is still a description, so the bounds hold.
      expect(entry.text.length, `${where} text empty`).toBeGreaterThan(0)
      if (entry.roll !== null) {
        expect(isValidRoll(entry.roll), `${where} roll ${entry.roll}`).toBe(true)
      }
      // A tailored to-hit is still a to-hit. Its *presence* is not tailorable —
      // that is decided by the category, which is held exactly one line up — so
      // this also catches a keyed weapon whose to-hit went missing in the copy.
      if (source.category === 'weapon') {
        expect(entry.toHit, `${where} lost its to-hit`).toBeDefined()
        expect(isValidRoll(entry.toHit as string), `${where} toHit ${entry.toHit}`).toBe(true)
      } else {
        expect(entry.toHit, `${where} gained a to-hit`).toBeUndefined()
      }
    }
    expect(drifted).toEqual([])
  })

  /**
   * The category half of the rule above is only meaningful if a keyed entry could
   * in principle disagree — so this asserts the comparison is actually running over
   * something, and that the catalogue and the library between them use more than
   * one category among the keyed entries. A `KEYED` list that had gone all-passive
   * would make the identity check above true and empty.
   */
  test('and the keyed entries span more than one category', () => {
    const categories = new Set(KEYED.map(({ entry }) => entry.category))
    expect(KEYED.length).toBeGreaterThan(10)
    expect(categories.size).toBeGreaterThan(1)
    for (const { label, entry } of KEYED) {
      expect(SHEET_ENTRY_CATEGORIES, `${label}: ${entry.name}`).toContain(entry.category)
    }
  })

  /**
   * The exemption is real rather than theoretical — asserted so that nobody
   * "tidies" the test above into an equality check on the strength of every
   * roll happening to agree. If this ever goes empty the comment above has
   * become a description of nothing.
   */
  test('at least one keyed entry genuinely re-rolls its catalogue source', () => {
    const rekeyed = KEYED.filter(({ entry }) => {
      const source = catalogueEntry(entry.catalogueKey as string)
      return source !== undefined && source.roll !== entry.roll
    })
    expect(rekeyed.length).toBeGreaterThan(0)
  })

  /**
   * ⚠️ **The Origin feat each build absorbed from its background, and it is here
   * because it is the half of change 1 that is easiest to lose.** The ability
   * spread is checked above by arithmetic; the *feat* is a single entry that would
   * go missing without any number moving. Four backgrounds are used across the
   * twelve classes, so the corpus should carry exactly three distinct Origin feats
   * — Magic Initiate for Acolyte and Sage, Alert for Criminal, Savage Attacker for
   * Soldier — and every sheet should carry one of them.
   */
  test('every sheet carries the Origin feat of the background it absorbed', () => {
    const ORIGIN_FEATS = ['magic-initiate', 'alert', 'savage-attacker']
    const without: string[] = []
    const used = new Set<string>()
    for (const { label, sheet } of SHEETS) {
      const found = sheet.feats.filter(
        (entry) => entry.catalogueKey !== null && ORIGIN_FEATS.includes(entry.catalogueKey),
      )
      if (found.length !== 1) without.push(`${label} has ${found.length}`)
      for (const entry of found) used.add(entry.catalogueKey as string)
    }
    expect(without).toEqual([])
    expect([...used].sort()).toEqual([...ORIGIN_FEATS].sort())
  })
})

// ---------------------------------------------------------------------------
// The rules scope
// ---------------------------------------------------------------------------

describe('the rules scope', () => {
  /**
   * The same sweep rules.test.ts runs over the catalogue, over the sixty sheets.
   * Movement-impairing conditions are excluded by design rather than unbuilt, and
   * a corpus of hand-written class content is the likeliest place one creeps back
   * in — nobody writing a monk's Open Hand Technique re-reads requirements.md
   * first, and two of that feature's three options are on this list.
   *
   * Word-bounded so an innocent substring cannot fail the build, and run over
   * the equipment and the levelling notes as well as the entry text: a kit that
   * includes a net, or a note saying an archetype knocks people down, is the
   * same promise the app cannot keep.
   */
  const EXCLUDED: [string, RegExp][] = [
    ['prone', /\bprone\b/i],
    ['difficult terrain', /\bdifficult terrain\b/i],
    ['grappled/grappling', /\bgrappl(e|ed|es|ing)\b/i],
    ['restrained', /\brestrained?\b/i],
    ['knocked down', /\bknocked (down|over|prone)\b/i],
    ['stand up', /\bstands? up\b/i],
    // ⚠️ **Speed is a real per-species field now and this rule survives the
    // change, for a reason that is sharper than the one it replaces.** It used to
    // read "speed is fixed at 35 for everyone but the Goliath". After the 2024
    // conversion `speed` is set by the species layer and then by the lineage
    // layer in lib/resolve.ts, and by nothing else — so a class sheet that also
    // moved it would be a second authority for one number, and the two would
    // disagree the moment either changed. That is what costs the Barbarian its
    // Fast Movement and the Monk its Unarmored Movement; both files say so.
    ['speed', /\bspeed\b/i],
  ]

  test('no sheet mentions an excluded condition or a change of speed', () => {
    const offenders: string[] = []
    for (const { label, sheet } of SHEETS) {
      const haystacks: [string, string][] = [
        ['equipment', sheet.equipment],
        ['levellingNotes', sheet.levellingNotes],
        ...entriesOf(sheet).map(
          (entry) => [entry.name, `${entry.name} ${entry.text}`] as [string, string],
        ),
      ]
      for (const [where, text] of haystacks) {
        for (const [name, pattern] of EXCLUDED) {
          if (pattern.test(text)) offenders.push(`${label} → ${where} mentions ${name}`)
        }
      }
    }
    // Reported in full rather than failing on the first, so one run says how
    // much content needs revisiting.
    expect(offenders).toEqual([])
  })

  /** The positive control, so the empty set above is a tripwire rather than a blind spot. */
  test('and the patterns do find a needle', () => {
    const haystack = SHEETS.flatMap(({ sheet }) => entriesOf(sheet).map((entry) => entry.text))
    expect(haystack.length).toBeGreaterThan(400)
    expect(EXCLUDED[0][1].test('The target has the Prone condition.')).toBe(true)
    expect(EXCLUDED[6][1].test('Your Speed increases by 10 feet.')).toBe(true)
    expect(EXCLUDED[6][1].test('You cover ten more feet on every move.')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The library and the validator agree
// ---------------------------------------------------------------------------

describe('every combination resolves to a storable sheet', () => {
  /**
   * **The most valuable test in the file**, and the reason the library is
   * iterated rather than sampled. Everything above checks a sheet against one
   * bound at a time; this puts each of the sixty through the real resolver with
   * each of the nine species and runs the function the mutation runs — 540
   * sheets, which is every character this milestone can produce before a lineage
   * is chosen.
   *
   * The failures it is here for are the ones no single-sheet check sees: a
   * maximum that only breaks its bound once a Dwarf's per-level hit points are
   * added, an entry id that only collides once a species appends its traits, a
   * roll that only the validator objects to.
   */
  test('for every class, archetype, level and species', () => {
    const problems: string[] = []
    for (const at of SHEETS) {
      for (const speciesKey of SPECIES_KEYS) {
        const problem = sheetProblem(resolvedAt(at, speciesKey))
        if (problem) problems.push(`${at.label} + ${speciesKey}: ${problem.path} — ${problem.message}`)
      }
    }
    expect(problems).toEqual([])
  })

  /** 60 × 9, stated so a resolver that silently stopped returning PC sheets is visible. */
  test('and there really are 540 of them, all player characters', () => {
    let count = 0
    for (const at of SHEETS) {
      for (const speciesKey of SPECIES_KEYS) {
        expect(resolvedAt(at, speciesKey).kind).toBe('pc')
        count += 1
      }
    }
    expect(count).toBe(540)
  })

  /**
   * ⚠️⚠️ **THE ENTRY BUDGET, WITH THE SPECIES AND THE LINEAGE ON TOP — the one
   * bound in this file that nothing in the library can see for itself.**
   *
   * `applySpecies` appends a species' traits and its granted feats to a sheet's
   * own, and `applyLineage` appends a lineage's on top of that, so the widest
   * list the application can build is a class's fullest level plus the busiest
   * origin. The Dragonborn is that origin — four traits and a granted breath
   * weapon, five lines — and a class that had crept up to thirty-six feats would
   * be storable on its own and refused by `sheetProblem` for exactly one of the
   * nine species. That is a bug with no symptom until somebody picks the wrong
   * species, which is why the bound is checked against **every** origin rather
   * than against `MAX_SHEET_ENTRIES` minus a guess.
   *
   * Checked on the two lists separately, because `entriesProblem` is run once per
   * list with `MAX_SHEET_ENTRIES` each.
   */
  test('no sheet plus any species and lineage exceeds the entry budget', () => {
    const over: string[] = []
    let widest = 0
    for (const at of SHEETS) {
      for (const origin of ORIGINS) {
        const resolved = resolvedAt(at, origin.speciesKey, origin.lineageKey)
        widest = Math.max(widest, resolved.feats.length, resolved.spells.length)
        if (resolved.feats.length > MAX_SHEET_ENTRIES) {
          over.push(`${at.label} + ${origin.label}: ${resolved.feats.length} feats`)
        }
        if (resolved.spells.length > MAX_SHEET_ENTRIES) {
          over.push(`${at.label} + ${origin.label}: ${resolved.spells.length} spells`)
        }
      }
    }
    expect(over).toEqual([])
    // Not vacuous, and not comfortable either: the widest list really is a
    // meaningful fraction of the budget, so this bound is worth checking.
    expect(widest).toBeGreaterThan(12)
    expect(widest).toBeLessThanOrEqual(MAX_SHEET_ENTRIES)
  })

  /**
   * The same 540 again with every lineage as well, through the validator this
   * time — the pairing `applyLineage` exists for, and the one place a lineage's
   * granted feats can collide with a species' or a class's.
   */
  test('and every species-and-lineage pair still validates', () => {
    const problems: string[] = []
    for (const at of SHEETS) {
      for (const origin of ORIGINS) {
        const problem = sheetProblem(resolvedAt(at, origin.speciesKey, origin.lineageKey))
        if (problem) {
          problems.push(`${at.label} + ${origin.label}: ${problem.path} — ${problem.message}`)
        }
      }
    }
    expect(problems).toEqual([])
    // The lineages are really being exercised: nine species, and more than nine
    // origins because five of them print a table.
    expect(ORIGINS.length).toBeGreaterThan(SPECIES_KEYS.length)
  })

  /**
   * The resolved sheet has to be the one the selections name, not a fallback
   * that happens to validate. `librarySheet` returns null for a class or an
   * archetype it does not have and the resolver quietly substitutes a default —
   * which is the right behaviour for a retired key and would be an invisible
   * disaster for a live one.
   */
  test('and each is the library sheet the selections name, not the default', () => {
    for (const at of SHEETS) {
      const resolved = resolvedAt(at)
      expect(librarySheet(at.classKey, at.subclassKey, at.level), at.label).toBe(at.sheet)
      expect(resolved.level, at.label).toBe(at.level)
      expect(resolved.armourClass, at.label).toBe(at.sheet.armourClass)
      expect(resolved.hitDice, at.label).toEqual(at.sheet.hitDice)
      expect(resolved.className, at.label).toContain(findClass(at.classKey)!.name)
      // Every library line survives resolution, plus whatever the species adds.
      expect(libraryEntries(resolved).length, at.label).toBe(entriesOf(at.sheet).length)
    }
  })
})

describe('librarySheet', () => {
  test('hands back the shared sheet at levels 1 and 2, chosen archetype or not', () => {
    for (const classKey of CLASS_KEYS) {
      const base = LIBRARY[classKey].base
      const [first] = findClass(classKey)!.subclasses
      for (const level of BASE_LEVELS) {
        expect(librarySheet(classKey, null, level), `${classKey}/${level}`).toBe(base[level])
        expect(librarySheet(classKey, first.key, level), `${classKey}/${level}`).toBe(base[level])
      }
    }
  })

  test('falls back to level 1 for an archetype nobody has chosen yet', () => {
    for (const classKey of CLASS_KEYS) {
      const base = LIBRARY[classKey].base
      // Mid-decision: level 3 or above and nothing chosen. The library has no
      // archetype-less level 4 on purpose, so the level 1 sheet is the honest
      // answer rather than an invented one.
      for (const level of ARCHETYPE_LEVELS) {
        expect(librarySheet(classKey, null, level), `${classKey}/${level}`).toBe(
          base[MIN_LIBRARY_LEVEL],
        )
      }
    }
  })

  test('stops at level 5 rather than falling back to nothing', () => {
    for (const classKey of CLASS_KEYS) {
      const [first] = findClass(classKey)!.subclasses
      const top = LIBRARY[classKey].paths[first.key][MAX_LIBRARY_LEVEL]
      for (const level of [5, 6, 12, 20, 1000]) {
        expect(librarySheet(classKey, first.key, level), `${classKey}/${level}`).toBe(top)
      }
    }
  })

  test('survives a nonsense level rather than returning undefined', () => {
    for (const classKey of CLASS_KEYS) {
      const [first] = findClass(classKey)!.subclasses
      for (const level of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(librarySheet(classKey, first.key, level), `${classKey}/${level}`).toBeTruthy()
      }
      // A fraction lands on the nearest whole level rather than on nothing.
      expect(librarySheet(classKey, first.key, 3.4)).toBe(LIBRARY[classKey].paths[first.key][3])
      expect(librarySheet(classKey, first.key, 3.6)).toBe(LIBRARY[classKey].paths[first.key][4])
    }
  })

  /**
   * Null rather than a throw, because a subclass key is stored on a character:
   * retiring one must leave the characters that chose it readable. Eight of them
   * have now actually been retired, so this is load-bearing rather than
   * defensive.
   *
   * The last three keys are the inherited-property hole `Object.hasOwn` closes —
   * `paths['toString']` and `paths['__proto__']` are both truthy on a plain
   * object, so a bare truthiness check returned the level 1 sheet where the
   * contract promises null.
   */
  test('returns null for an archetype that is not ours', () => {
    for (const key of [
      '',
      'not-a-path',
      'CHAMPION',
      'battle-master',
      'toString',
      'constructor',
      '__proto__',
    ]) {
      expect(librarySheet('fighter', key, 3), key).toBeNull()
    }
  })
})
