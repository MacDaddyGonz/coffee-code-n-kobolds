import { describe, expect, test } from 'vitest'

import { collapseWhitespace } from './codes'
import { CATALOGUE, FEATS, NPC_ACTIONS, SPELLS, catalogueEntry } from './rules'
import type { CatalogueEntry } from './rules'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_SHEET_ENTRIES,
  MAX_SPELL_LEVEL,
  MIN_SPELL_LEVEL,
  defaultNpcSheet,
  defaultPcSheet,
  isValidRoll,
  normaliseRoll,
  normaliseSheet,
  sheetProblem,
} from './sheet'
import type { NpcSheet, PcSheet, SheetEntry } from './sheet'

/** The three lists with their names, so a failure says which one it came from. */
const LISTS: [string, readonly CatalogueEntry[]][] = [
  ['SPELLS', SPELLS],
  ['FEATS', FEATS],
  ['NPC_ACTIONS', NPC_ACTIONS],
]

/** A catalogue entry as it lands on a sheet: the template plus a per-character id. */
function asSheetEntry(entry: CatalogueEntry, index = 0): SheetEntry {
  return {
    id: `entry-${index}`,
    name: entry.name,
    text: entry.text,
    roll: entry.roll,
    level: entry.level,
    catalogueKey: entry.key,
  }
}

describe('keys', () => {
  test('every key is kebab-case', () => {
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        expect(entry.key, `${name}: ${entry.key}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      }
    }
  })

  /**
   * Uniqueness has to hold across all three lists, not within each: `BY_KEY` is
   * one map, so a spell and a feat sharing a key would make `catalogueEntry`
   * return whichever was concatenated last — silently the wrong entry, with the
   * right name in the picker.
   */
  test('no key is used twice anywhere in the catalogue', () => {
    const keys = CATALOGUE.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /**
   * `catalogueKey` is stored on a sheet and bounded by the same limit as an
   * entry id, so a key longer than that could be offered by the picker and then
   * refused on save.
   */
  test('every key fits the field that stores it', () => {
    for (const entry of CATALOGUE) {
      expect(entry.key.length).toBeGreaterThan(0)
      expect(entry.key.length).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
    }
  })
})

describe('CATALOGUE', () => {
  test('is exactly the three lists concatenated', () => {
    expect(CATALOGUE).toEqual([...SPELLS, ...FEATS, ...NPC_ACTIONS])
    expect(CATALOGUE).toHaveLength(SPELLS.length + FEATS.length + NPC_ACTIONS.length)
  })

  /**
   * An accidentally emptied list would make almost every other test in this file
   * pass vacuously — a `for` loop over nothing asserts nothing. The counts are
   * the ones the module documents; the upper bound matters too, because a list
   * longer than `MAX_SHEET_ENTRIES` could not be taken wholesale onto a sheet.
   */
  test('each list holds roughly the documented number of entries', () => {
    expect(SPELLS.length).toBeGreaterThanOrEqual(24)
    expect(FEATS.length).toBeGreaterThanOrEqual(16)
    expect(NPC_ACTIONS.length).toBeGreaterThanOrEqual(12)
    for (const [name, list] of LISTS) {
      expect(list.length, name).toBeLessThanOrEqual(MAX_SHEET_ENTRIES)
    }
  })

  test('no two entries share a name within a list', () => {
    for (const [name, list] of LISTS) {
      const names = list.map((entry) => entry.name)
      expect(new Set(names).size, name).toBe(names.length)
    }
  })
})

describe('catalogueEntry', () => {
  test('round-trips every entry', () => {
    for (const entry of CATALOGUE) {
      expect(catalogueEntry(entry.key)).toBe(entry)
    }
  })

  /**
   * A character stores a copy and may name a key that has since been retired, so
   * a miss is ordinary rather than corruption — it must come back as undefined
   * rather than throwing, and it must not resolve through the prototype either.
   */
  test('returns undefined for a key that is not ours', () => {
    for (const key of [
      '',
      'not-a-key',
      'FIRE-BOLT',
      'fire bolt',
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(catalogueEntry(key)).toBeUndefined()
    }
  })
})

describe('rolls', () => {
  /**
   * The check that stops the catalogue drifting away from the grammar. It uses
   * `isValidRoll` from sheet.ts rather than a copy of the pattern on purpose: a
   * copy would keep passing after the real grammar tightened, which is exactly
   * the drift it is here to catch.
   */
  test('every roll satisfies the stored grammar', () => {
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        if (entry.roll === null) continue
        expect(isValidRoll(entry.roll), `${name}: ${entry.key} → ${entry.roll}`).toBe(true)
      }
    }
  })

  /**
   * Stronger than validity, and the one that would have caught a token the
   * normaliser mangles: the picker's copy goes through `normaliseSheet` on the
   * way to the database, so an entry that is valid but not already normalised
   * would be stored as something other than what the catalogue says.
   */
  test('every roll is already in its normalised form', () => {
    for (const entry of CATALOGUE) {
      if (entry.roll === null) continue
      expect(normaliseRoll(entry.roll), entry.key).toBe(entry.roll)
    }
  })

  /**
   * An ability token is a promise that something can resolve it, and the reduced
   * NPC sheet has no ability scores — so a monster's numbers have to be flat.
   * This is the asymmetry the module documents, asserted rather than trusted.
   */
  test('no NPC action references an ability or proficiency token', () => {
    for (const entry of NPC_ACTIONS) {
      if (entry.roll === null) continue
      expect(entry.roll, entry.key).toMatch(/^\d+d\d+([+-]\d+)*$/)
    }
  })
})

describe('names, text and levels', () => {
  test('every name and description is non-empty and inside the stored bounds', () => {
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        expect(entry.name.length, `${name}: ${entry.key}`).toBeGreaterThan(0)
        expect(entry.name.length, `${name}: ${entry.key}`).toBeLessThanOrEqual(
          MAX_ENTRY_NAME_LENGTH,
        )
        expect(entry.text.length, `${name}: ${entry.key}`).toBeGreaterThan(0)
        expect(entry.text.length, `${name}: ${entry.key}`).toBeLessThanOrEqual(
          MAX_ENTRY_TEXT_LENGTH,
        )
      }
    }
  })

  /** Already tidy, so the copy stored on a sheet is byte-identical to the template. */
  test('no name needs collapsing and no description needs trimming', () => {
    for (const entry of CATALOGUE) {
      expect(collapseWhitespace(entry.name), entry.key).toBe(entry.name)
      expect(entry.text.trim(), entry.key).toBe(entry.text)
    }
  })

  test('every spell has a level in range and every feat and NPC action has none', () => {
    for (const entry of SPELLS) {
      expect(entry.level, entry.key).not.toBeNull()
      expect(Number.isInteger(entry.level), entry.key).toBe(true)
      expect(entry.level as number, entry.key).toBeGreaterThanOrEqual(MIN_SPELL_LEVEL)
      expect(entry.level as number, entry.key).toBeLessThanOrEqual(MAX_SPELL_LEVEL)
    }
    for (const entry of [...FEATS, ...NPC_ACTIONS]) {
      expect(entry.level, entry.key).toBeNull()
    }
  })

  /** The list is meant to run cantrips through 3rd level; a stray 9th would be out of scope. */
  test('the spell list stays inside the levels the module claims', () => {
    for (const entry of SPELLS) {
      expect(entry.level as number, entry.key).toBeLessThanOrEqual(3)
    }
    expect(SPELLS.some((entry) => entry.level === 0)).toBe(true)
  })
})

describe('the catalogue and the validator agree', () => {
  /**
   * The most valuable test in the file. Everything above checks the catalogue
   * against a bound one at a time; this puts each entry where it will actually
   * live and runs the function the mutation runs, so an entry the picker offers
   * but the server would refuse fails here rather than in front of the group.
   */
  test('every entry is storable on the sheet it belongs to', () => {
    for (const entry of [...SPELLS, ...FEATS]) {
      const sheet: PcSheet = { ...defaultPcSheet(), spells: [asSheetEntry(entry)] }
      expect(sheetProblem(sheet), entry.key).toBeNull()
    }
    for (const entry of NPC_ACTIONS) {
      const sheet: NpcSheet = { ...defaultNpcSheet(), actions: [asSheetEntry(entry)] }
      expect(sheetProblem(sheet), entry.key).toBeNull()
    }
  })

  /** And the whole list at once, which is what "add them all" from the picker would do. */
  test('a whole list can be taken onto one sheet', () => {
    const pcSheet: PcSheet = {
      ...defaultPcSheet(),
      spells: SPELLS.map((entry, i) => asSheetEntry(entry, i)),
      feats: FEATS.map((entry, i) => asSheetEntry(entry, i + SPELLS.length)),
    }
    expect(sheetProblem(pcSheet)).toBeNull()

    const npcSheet: NpcSheet = {
      ...defaultNpcSheet(),
      actions: NPC_ACTIONS.map((entry, i) => asSheetEntry(entry, i)),
    }
    expect(sheetProblem(npcSheet)).toBeNull()
  })

  /**
   * Normalisation must be a no-op on a catalogue entry. If it were not, the copy
   * on the sheet would differ from the template and the picker's "already has
   * this one" comparison would be against a string nobody stored.
   */
  test('normalising a sheet full of catalogue entries changes nothing', () => {
    const sheet: PcSheet = {
      ...defaultPcSheet(),
      spells: SPELLS.map((entry, i) => asSheetEntry(entry, i)),
      feats: FEATS.map((entry, i) => asSheetEntry(entry, i + SPELLS.length)),
    }
    expect(normaliseSheet(sheet)).toEqual(sheet)

    const npcSheet: NpcSheet = {
      ...defaultNpcSheet(),
      actions: NPC_ACTIONS.map((entry, i) => asSheetEntry(entry, i)),
    }
    expect(normaliseSheet(npcSheet)).toEqual(npcSheet)
  })
})

describe('the D&D Lite scope', () => {
  /**
   * requirements.md excludes racial abilities, background skills and
   * proficiencies, inventory, and movement-detriment status effects. A catalogue
   * is the likeliest place one of those creeps back in — nobody adding a spell
   * re-reads the requirements first — so the words themselves are checked. The
   * patterns are word-bounded so an innocent substring cannot fail the build.
   */
  const EXCLUDED = [
    /\bprone\b/i,
    /\bdifficult terrain\b/i,
    /\bgrappled?\b/i,
    /\brestrained\b/i,
    /\bknocked (down|over)\b/i,
    /\bstands? up\b/i,
    /\bhalf (its |their |your )?speed\b/i,
    /\bspeed (is |becomes )?(reduced|halved|drops)\b/i,
    /\binventory\b/i,
    /\bencumber/i,
    /\bracial\b/i,
    /\bbackground\b/i,
  ]

  test('no entry names an excluded condition or an excluded subsystem', () => {
    for (const [list, entries] of LISTS) {
      for (const entry of entries) {
        const haystack = `${entry.name} ${entry.text}`
        for (const pattern of EXCLUDED) {
          expect(pattern.test(haystack), `${list}: ${entry.key} matched ${pattern}`).toBe(false)
        }
      }
    }
  })

  /**
   * Speed is a constant — `SPEED_FEET`, 35 for everybody, deliberately not a field
   * — so an entry that changes it is promising something nothing in the app can
   * represent, and a sheet that says 45 while every other screen says 35 is worse
   * than the feat being slightly smaller than its 5e original.
   *
   * `mobile` used to carry "your speed rises by 10 feet". This suite found it; the
   * clause was dropped rather than written down and ignored, leaving the half of
   * the feat D&D Lite can actually honour. The assertion is now an empty set, which
   * makes it a real tripwire: the next entry to mention speed has to be a decision
   * somebody makes rather than a line somebody adds.
   */
  test('no entry describes a change of speed', () => {
    const mentioning = CATALOGUE.filter((entry) => /\bspeed\b/i.test(entry.text)).map((e) => e.key)
    expect(mentioning).toEqual([])
  })
})
