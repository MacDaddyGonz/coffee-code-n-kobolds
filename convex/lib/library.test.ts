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
import { RACE_KEYS } from './races'
import { resolveSheet } from './resolve'
import { catalogueEntry } from './rules'
import { SKILL_KEYS } from './skills'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_SPELL_LEVEL,
  MIN_SPELL_LEVEL,
  isValidRoll,
  sheetProblem,
} from './sheet'
import type { PcSheet, PresetSheet, SheetEntry } from './sheet'

// ---------------------------------------------------------------------------
// The seventy-two, enumerated once.
//
// Every test below walks this list rather than naming a class, because the
// failure this file exists to catch is the one sheet out of seventy-two that
// nobody re-read. A per-class test would only ever be as good as the classes
// somebody remembered to write one for.
// ---------------------------------------------------------------------------

/** Levels 2 to 5, the range an archetype covers. */
const ARCHETYPE_LEVELS = [2, 3, 4, 5] as const

type Coordinate = {
  classKey: ClassKey
  /** Null for the shared level 1 sheet. */
  subclassKey: string | null
  level: number
  /** `fighter/champion/3`, so a failure names the sheet rather than an index. */
  label: string
}

/** Every position the library is supposed to hold a sheet at: 8 + 8 × 2 × 4 = 72. */
const COORDINATES: Coordinate[] = CLASS_KEYS.flatMap((classKey) => [
  { classKey, subclassKey: null, level: MIN_LIBRARY_LEVEL, label: `${classKey}/base` },
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
  if (at.subclassKey === null) return library.base
  return library.paths[at.subclassKey]?.[at.level]
}

type Placed = Coordinate & { sheet: LibrarySheet }

/**
 * The coordinates that actually hold a sheet. Everything downstream iterates
 * this, and `the library holds a sheet at all 72 positions` below is what stops
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

/** The selections that produce this sheet, for the race given. */
function preset(at: Coordinate, race: PresetSheet['race']): PresetSheet {
  return {
    kind: 'preset',
    race,
    classKey: at.classKey,
    subclassKey: at.subclassKey,
    level: at.level,
    locked: false,
  }
}

function resolvedAt(at: Coordinate, race: PresetSheet['race'] = 'human'): PcSheet {
  return resolveSheet({ sheet: preset(at, race) }) as PcSheet
}

/** Only the lines the library contributed — the resolver prefixes those `lib:`. */
function libraryEntries(sheet: PcSheet): SheetEntry[] {
  return [...sheet.feats, ...sheet.spells].filter((entry) => entry.id.startsWith('lib:'))
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe('the library is complete', () => {
  /**
   * The anti-vacuity check, and it has to come first. Every loop below runs
   * over `SHEETS`; a library that had quietly lost half its content would make
   * all of them pass while asserting half as much.
   */
  test('holds a sheet at all 72 positions', () => {
    const missing = COORDINATES.filter((at) => sheetAt(at) === undefined).map((at) => at.label)
    expect(missing).toEqual([])
    expect(COORDINATES).toHaveLength(72)
    expect(SHEETS).toHaveLength(72)
  })

  test('has an entry for every class key, keyed by itself', () => {
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
   * A subclass key is stored on a character and looked up in two independent
   * places — `LIBRARY[class].paths` for the numbers and `CLASSES` for the name
   * the dropdown shows. A key present in one and not the other means either a
   * playable archetype nobody can pick or a pickable archetype with no sheet.
   */
  test('every path key is an archetype of its class, and both archetypes are present', () => {
    for (const classKey of CLASS_KEYS) {
      const declared = findClass(classKey)!.subclasses.map((entry) => entry.key)
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

  test('every sheet carries all thirteen skill flags and nothing else', () => {
    for (const { label, sheet } of SHEETS) {
      expect(Object.keys(sheet.skillProficiencies).sort(), label).toEqual([...SKILL_KEYS].sort())
      for (const key of SKILL_KEYS) {
        expect(typeof sheet.skillProficiencies[key], `${label}.${key}`).toBe('boolean')
      }
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
   * and the die on each of a class's nine sheets — and the count, which is the
   * level and is therefore derivable but typed out anyway. `classes.ts` says in
   * as many words that this test is why `hitDieFaces` is held there at all: "a
   * d6 rogue is the sort of typo that survives a hundred readings".
   */
  test('is one die per level, of the face the class declares', () => {
    for (const { label, level, classKey, sheet } of SHEETS) {
      expect(sheet.hitDice.count, `${label}.hitDice.count`).toBe(level)
      expect(sheet.hitDice.faces, `${label}.hitDice.faces`).toBe(
        findClass(classKey)!.hitDieFaces,
      )
    }
  })
})

describe('ability scores', () => {
  const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
  const STANDARD_TOTAL = STANDARD_ARRAY.reduce((sum, value) => sum + value, 0)
  /** One ability score improvement is +2, spread over one score or two. */
  const MAX_IMPROVEMENT = 2

  function sorted(sheet: LibrarySheet): number[] {
    return Object.values(sheet.abilities).sort((a, b) => b - a)
  }

  /**
   * The library is race-agnostic by construction — that is what lets race be
   * applied on top instead of multiplying seventy-two sheets by eight — so the
   * scores at level 1 must be the standard array itself, allocated but not
   * added to. A sheet that had quietly baked in an Elf's +2 would give an Elf
   * +4 and everybody else a free point.
   */
  test('are exactly the standard array at levels 1 and 2', () => {
    for (const { label, level, sheet } of SHEETS) {
      if (level > SUBCLASS_LEVEL) continue
      expect(sorted(sheet), label).toEqual(STANDARD_ARRAY)
    }
  })

  /**
   * From level 3 an ability score improvement is allowed and several sheets
   * take one. It is bounded rather than free: +2 in total, and never a score
   * going *down*, so the pointwise comparison against the sorted array catches
   * a sheet that paid for its improvement by dumping something else.
   */
  test('differ from the standard array by at most one improvement above level 2', () => {
    for (const { label, level, sheet } of SHEETS) {
      if (level <= SUBCLASS_LEVEL) continue
      const scores = sorted(sheet)
      const total = scores.reduce((sum, value) => sum + value, 0)
      expect(total - STANDARD_TOTAL, `${label} total`).toBeGreaterThanOrEqual(0)
      expect(total - STANDARD_TOTAL, `${label} total`).toBeLessThanOrEqual(MAX_IMPROVEMENT)
      for (const [index, score] of scores.entries()) {
        expect(score, `${label} score ${index}`).toBeGreaterThanOrEqual(STANDARD_ARRAY[index])
      }
    }
  })

  /**
   * An improvement is a step forward, never a step back. Level 5 having fewer
   * points than level 3 would be a transcription slip rather than a build
   * choice, and neither sheet is wrong on its own.
   */
  test('never fall as a path levels up', () => {
    for (const classKey of CLASS_KEYS) {
      for (const key of Object.keys(LIBRARY[classKey].paths)) {
        const path = LIBRARY[classKey].paths[key]
        for (const level of [3, 4, 5]) {
          const here = Object.values(path[level].abilities)
          const before = Object.values(path[level - 1].abilities)
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
   * is not a wizard in a robe — but a maximum that fell as a character levelled
   * up, or an armour class that did, is a slip rather than a build.
   */
  test('never fall as a path levels up', () => {
    for (const classKey of CLASS_KEYS) {
      for (const key of Object.keys(LIBRARY[classKey].paths)) {
        const path = LIBRARY[classKey].paths[key]
        expect(path[2].maxHp, `${classKey}/${key}/2`).toBeGreaterThan(LIBRARY[classKey].base.maxHp)
        for (const level of [3, 4, 5]) {
          expect(path[level].maxHp, `${classKey}/${key}/${level}`).toBeGreaterThan(
            path[level - 1].maxHp,
          )
          expect(path[level].armourClass, `${classKey}/${key}/${level}`).toBeGreaterThanOrEqual(
            path[level - 1].armourClass,
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
   * A name is what a player reads and an id is what React and Milestone 5's
   * roll target use, and the two can fail independently. `sheetProblem` refuses
   * a sheet with a duplicate *id*, so a repeated name is caught downstream — but
   * a repeated name that slugs to two *different* ids is not, and reads as the
   * same spell listed twice.
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
   * Spell lists stay short on purpose: these are sheets a beginner reads in one
   * sitting, and the roadmap's shape is roughly two at level 1 and two more per
   * level. An upper bound rather than an exact count, because a cleric and a
   * fighter have nothing in common here and pinning a number would make adding
   * a cantrip a test edit.
   */
  test('spell lists grow at roughly two a level and no faster', () => {
    for (const { label, level, sheet } of SHEETS) {
      expect(sheet.spells.length, label).toBeLessThanOrEqual(2 * level + 2)
    }
    // Not vacuous: the full casters really do fill the allowance, so the bound
    // above is one entry away from biting rather than an order of magnitude
    // clear of the content. A sheet that gained two spells at a level would
    // fail it.
    const fullest = Math.max(...SHEETS.map(({ sheet }) => sheet.spells.length))
    expect(fullest).toBeGreaterThanOrEqual(8)
    // And a class with no spells at all is allowed — a barbarian has none at
    // any level, which is what makes the bound an upper one rather than a shape.
    expect(SHEETS.some(({ sheet }) => sheet.spells.length === 0)).toBe(true)
  })
})

describe('entries taken from the catalogue', () => {
  const KEYED = SHEETS.flatMap(({ label, sheet }) =>
    entriesOf(sheet)
      .filter((entry) => entry.catalogueKey !== null)
      .map((entry) => ({ label, entry })),
  )

  /** Vacuity again: the library does lean on the catalogue, and should keep doing so. */
  test('there are some, and every key names a catalogue entry that exists', () => {
    expect(KEYED.length).toBeGreaterThan(10)
    for (const { label, entry } of KEYED) {
      expect(
        catalogueEntry(entry.catalogueKey as string),
        `${label}: ${entry.name} → ${entry.catalogueKey}`,
      ).toBeDefined()
    }
  })

  /**
   * **The deliberate asymmetry, and it is a rule rather than a gap.**
   *
   * A `catalogueKey` is a breadcrumb saying "this line came from there", and a
   * player looking at Cure Wounds on their sheet and at Cure Wounds in the
   * picker must read the same words — so the name and the description are held
   * byte-for-byte identical.
   *
   * The **roll is exempt**, and rules.ts sanctions the exemption in as many
   * words: "Where a spell is cast by classes keyed off different abilities …
   * the entry names the commonest one. That is not a claim about the rules; it
   * is the least-editing default, and the copy on the sheet is editable
   * precisely so a paladin can change it to CHA." A bard's Cure Wounds heals
   * off Charisma while the catalogue says Wisdom, and that is correct on both
   * sides. So the roll is required to be a *valid* roll and nothing more —
   * requiring equality would force the library to be wrong about half its
   * classes.
   *
   * ---
   *
   * **The text is exempt for the same reason, and that was a decision rather
   * than a discovery.** This suite originally required it to match and thirteen
   * entries failed — `rage` on all nine barbarian sheets, `bardic-inspiration`
   * on both level-5 bards, `divine-smite` on both level-5 paladins. Every one
   * extends the catalogue's words with the detail that level actually has:
   * "Two rages between long rests, and the extra damage is +2", "the die — now
   * a d8 —".
   *
   * Two resolutions were on the table: drop the key on the thirteen, or relax
   * the rule. Relaxing is right, because it is what `catalogueKey` already
   * says it is — rules.ts calls it "a breadcrumb recording where a copy came
   * from, not a foreign key… a player is free to edit the copy on their sheet".
   * A tailored copy still came from the catalogue, so the breadcrumb is true.
   * Dropping the keys would also make the picker offer a barbarian the Rage
   * they are already looking at.
   *
   * So the line the rule is drawn on is **identity, not wording**: the `name`
   * and the spell `level` say *which* catalogue entry this is and are held
   * exactly — the name doubly so, since ids derive from it. The `text` and the
   * `roll` are the copy, and the copy is meant to be edited.
   */
  test('match the catalogue on name and level, but may tailor text and roll', () => {
    const drifted: string[] = []
    for (const { label, entry } of KEYED) {
      const source = catalogueEntry(entry.catalogueKey as string)
      if (!source) continue
      const where = `${label}: ${entry.catalogueKey}`
      if (entry.name !== source.name) drifted.push(`${where} name: ${entry.name}`)
      if (entry.level !== source.level) drifted.push(`${where} level: ${entry.level}`)
      // A tailored description is still a description, so the bounds hold.
      expect(entry.text.length, `${where} text empty`).toBeGreaterThan(0)
      if (entry.roll !== null) {
        expect(isValidRoll(entry.roll), `${where} roll ${entry.roll}`).toBe(true)
      }
    }
    expect(drifted).toEqual([])
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
})

// ---------------------------------------------------------------------------
// The D&D Lite scope
// ---------------------------------------------------------------------------

describe('the D&D Lite scope', () => {
  /**
   * The same sweep rules.test.ts runs over the catalogue, over the seventy-two
   * sheets. Movement-impairing conditions are excluded by design rather than
   * unbuilt, and 150 pages of hand-written class content is the likeliest place
   * one creeps back in — nobody writing a Battle Master manoeuvre re-reads
   * requirements.md first.
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
    // Speed is fixed at 35 for everyone but the Goliath, whose +10 is a *race*
    // and is applied by the resolver. No class content may mention it: a sheet
    // that promised otherwise would be promising something the app cannot
    // represent, and would disagree with every other screen.
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
})

// ---------------------------------------------------------------------------
// The library and the validator agree
// ---------------------------------------------------------------------------

describe('every combination resolves to a storable sheet', () => {
  /**
   * **The most valuable test in the file**, and the reason the library is
   * iterated rather than sampled. Everything above checks a sheet against one
   * bound at a time; this puts each of the seventy-two through the real
   * resolver with each of the eight races and runs the function the mutation
   * runs — 576 sheets, which is every character this milestone can produce.
   *
   * The failures it is here for are the ones no single-sheet check sees: a
   * maximum that only breaks its bound once a Dwarf's per-level hit points are
   * added, an entry id that only collides once a race appends its trait, a
   * roll that only the validator objects to.
   */
  test('for every class, archetype, level and race', () => {
    const problems: string[] = []
    for (const at of SHEETS) {
      for (const race of RACE_KEYS) {
        const problem = sheetProblem(resolvedAt(at, race))
        if (problem) problems.push(`${at.label} + ${race}: ${problem.path} — ${problem.message}`)
      }
    }
    expect(problems).toEqual([])
  })

  /** 72 × 8, stated so a resolver that silently stopped returning PC sheets is visible. */
  test('and there really are 576 of them, all player characters', () => {
    let count = 0
    for (const at of SHEETS) {
      for (const race of RACE_KEYS) {
        expect(resolvedAt(at, race).kind).toBe('pc')
        count += 1
      }
    }
    expect(count).toBe(576)
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
      // Every library line survives resolution, plus whatever the race adds.
      expect(libraryEntries(resolved).length, at.label).toBe(entriesOf(at.sheet).length)
    }
  })
})

describe('librarySheet', () => {
  test('hands back the level 1 sheet below level 2 or with no archetype chosen', () => {
    for (const classKey of CLASS_KEYS) {
      const base = LIBRARY[classKey].base
      const [first] = findClass(classKey)!.subclasses
      expect(librarySheet(classKey, null, 1), classKey).toBe(base)
      expect(librarySheet(classKey, first.key, 1), classKey).toBe(base)
      // Mid-decision: level 2 and nothing chosen yet. The library has no
      // archetype-less level 2 on purpose, so level 1 is the honest answer.
      for (const level of ARCHETYPE_LEVELS) {
        expect(librarySheet(classKey, null, level), `${classKey}/${level}`).toBe(base)
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
   * renaming one must leave the characters that chose it readable.
   *
   * DEFECT (library/index.ts:63), minor. `paths` is a plain object literal, so
   * `library.paths[subclassKey]` resolves through `Object.prototype`:
   * `paths['toString']` is a function, `paths['constructor']` is `Object` and
   * `paths['__proto__']` is the prototype itself. All three are truthy, so the
   * `if (!path) return null` guard passes them, `path[wanted]` is undefined and
   * the function falls through to `?? library.base` — **returning the level 1
   * sheet where the contract says null**.
   *
   * Not reachable through a write today: `storedSheetProblem` refuses any
   * `subclassKey` that `subclassOf` does not recognise, so nothing can store
   * one. It is worth closing anyway, and cheaply — `Object.hasOwn(library.paths,
   * subclassKey)`, or building `paths` from a `Map`. This is the same lookup
   * `catalogueEntry` gets right by using a `Map`, and rules.test.ts already
   * asserts exactly these six keys against it; the library is the one of the
   * pair that reaches into a bare object.
   *
   * The first three keys pass today. The last three are the defect.
   */
  test('returns null for an archetype that is not ours', () => {
    for (const key of ['', 'not-a-path', 'CHAMPION', 'toString', 'constructor', '__proto__']) {
      expect(librarySheet('fighter', key, 3), key).toBeNull()
    }
  })
})
