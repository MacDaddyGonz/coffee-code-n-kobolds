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
  SHEET_ENTRY_CATEGORIES,
  defaultNpcSheet,
  defaultPcSheet,
  isValidRoll,
  normaliseRoll,
  normaliseSheet,
  rollShapeOf,
  sheetProblem,
} from './sheet'
import type { NpcSheet, PcSheet, SheetEntry, SheetEntryCategory } from './sheet'

/** The three lists with their names, so a failure says which one it came from. */
const LISTS: [string, readonly CatalogueEntry[]][] = [
  ['SPELLS', SPELLS],
  ['FEATS', FEATS],
  ['NPC_ACTIONS', NPC_ACTIONS],
]

/**
 * A catalogue entry as it lands on a sheet: the template plus a per-character id.
 *
 * ⚠️ **Built field by field, which is the trap `normaliseSheet` carries a paragraph
 * about in both of its branches — and this helper had already fallen into it.** It was
 * written before entries had a `category` or a `toHit` and was not extended when they
 * arrived, so every catalogue entry reached `sheetProblem` stripped of both. Both fields
 * are optional on `SheetEntry`, so nothing failed to compile and nothing failed to run:
 * the two arity tests below — including the one this file calls its most valuable —
 * passed over fifty-two entries that had been quietly reduced to their pre-milestone
 * shape. A weapon with no to-hit is precisely what `entriesProblem` now refuses, and
 * this helper was removing the evidence on the way in.
 *
 * `category` is copied unconditionally because it is **required** on a `CatalogueEntry`;
 * `toHit` is spread conditionally because naming a key and handing it `undefined` is a
 * different object from omitting the key, and `entriesProblem` refuses a to-hit on
 * anything that is not a weapon by asking `!== undefined`.
 *
 * `carries every field` below is the guard that stops this happening a third time.
 */
function asSheetEntry(entry: CatalogueEntry, index = 0): SheetEntry {
  return {
    id: `entry-${index}`,
    name: entry.name,
    text: entry.text,
    roll: entry.roll,
    level: entry.level,
    catalogueKey: entry.key,
    category: entry.category,
    ...(entry.toHit === undefined ? {} : { toHit: entry.toHit }),
  }
}

/** The three categories, tallied over a list. */
function tally(list: readonly CatalogueEntry[]): Record<SheetEntryCategory, number> {
  const out: Record<SheetEntryCategory, number> = { weapon: 0, action: 0, passive: 0 }
  for (const entry of list) out[entry.category] += 1
  return out
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

describe('categories', () => {
  /**
   * **Pinned as exact numbers, copied out of the corpus by hand**, because the
   * failure this guards against is not one entry being wrong — it is a mass
   * re-categorisation that leaves every per-entry rule below still satisfied. A
   * sweep that turned all twenty-four spells into `action`s would keep every
   * coherence test in this file green (an action rolls something and carries no
   * to-hit, which is true of most of them), and the only visible symptom would be
   * five spells that no longer ask for an attack roll at the table.
   *
   * So the shape of the catalogue is stated rather than derived. A number moving
   * here is a decision somebody has to make on purpose.
   */
  test('each list holds the categories the catalogue was written with', () => {
    expect(tally(SPELLS)).toEqual({ weapon: 5, action: 10, passive: 9 })
    expect(tally(FEATS)).toEqual({ weapon: 0, action: 5, passive: 11 })
    expect(tally(NPC_ACTIONS)).toEqual({ weapon: 7, action: 4, passive: 1 })
    // And the tallies really do account for every entry, so a list that gained one
    // in a category nobody counted cannot hide in the arithmetic.
    for (const [name, list] of LISTS) {
      const counted = Object.values(tally(list)).reduce((a, b) => a + b, 0)
      expect(counted, name).toBe(list.length)
    }
  })

  /** Every stored value is one of the three. A cast-in fourth would fail the schema. */
  test('every entry names one of the three categories', () => {
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        expect(SHEET_ENTRY_CATEGORIES, `${name}: ${entry.key}`).toContain(entry.category)
      }
    }
  })

  /**
   * The arity rule, applied to the catalogue directly rather than through a sheet.
   * `entriesProblem` enforces the same thing on save, but it reports the *first*
   * problem on a sheet, so a list checked one entry at a time through a sheet says
   * nothing about the second offender. This says which entries, all of them.
   */
  test('every entry carries exactly the rolls its category promises', () => {
    const wrong: string[] = []
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        const shape = rollShapeOf(entry.category)
        const where = `${name}: ${entry.key} (${entry.category})`
        if (shape.toHit !== (entry.toHit !== undefined)) {
          wrong.push(`${where} toHit ${entry.toHit === undefined ? 'absent' : entry.toHit}`)
        }
        if (shape.roll !== (entry.roll !== null)) {
          wrong.push(`${where} roll ${entry.roll === null ? 'absent' : entry.roll}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  /**
   * A weapon's to-hit is a roll like any other and goes through the same grammar and
   * the same normaliser — for the reason `every roll is already in its normalised
   * form` gives about the damage: the picker's copy is stored verbatim, so a to-hit
   * that is valid but not already normalised would be stored as something other than
   * what the catalogue says.
   */
  test('every weapon has a valid, already-normalised to-hit and a damage roll', () => {
    const weapons = CATALOGUE.filter((entry) => entry.category === 'weapon')
    // Not vacuous: the catalogue really does contain weapons.
    expect(weapons.length).toBeGreaterThan(0)
    for (const entry of weapons) {
      const toHit = entry.toHit
      expect(toHit, `${entry.key} has no to-hit`).toBeDefined()
      expect(isValidRoll(toHit as string), `${entry.key} → ${toHit}`).toBe(true)
      expect(normaliseRoll(toHit as string), entry.key).toBe(toHit)
      expect((toHit as string).startsWith('1d20'), `${entry.key} → ${toHit}`).toBe(true)
      expect(entry.roll, `${entry.key} has no damage`).not.toBeNull()
    }
  })

  /**
   * The other half, and the one that is a *refusal* rather than a requirement:
   * `entriesProblem` rejects a to-hit on anything that is not a weapon, and
   * `toHitOf` returns null for one regardless. A stored to-hit nothing will ever
   * read is a roll waiting to be resurrected by a future category change.
   */
  test('no action and no passive carries a to-hit', () => {
    const stray = CATALOGUE.filter(
      (entry) => entry.category !== 'weapon' && entry.toHit !== undefined,
    ).map((entry) => `${entry.key} (${entry.category}) → ${entry.toHit}`)
    expect(stray).toEqual([])
  })

  /**
   * **The asymmetry `no NPC action references an ability or proficiency token`
   * already asserts about damage, asserted about the to-hit for the same reason.**
   *
   * An ability token is a promise that something can resolve it, and the reduced NPC
   * sheet has no ability scores — so `1d20+STR+PROF` on a monster's scimitar is a
   * roll the dice work cannot complete. A monster's numbers are flat, and `PROF` is
   * excluded alongside the six because a creature has no level to derive a
   * proficiency bonus from either.
   */
  test("no NPC action's to-hit references an ability or proficiency token", () => {
    const weapons = NPC_ACTIONS.filter((entry) => entry.category === 'weapon')
    expect(weapons.length).toBeGreaterThan(0)
    for (const entry of weapons) {
      expect(entry.toHit as string, entry.key).toMatch(/^1d20([+-]\d+)?$/)
    }
  })

  /**
   * ⚠️ **The prose never states the to-hit**, which rules.ts states in its header as
   * a rule about the corpus: a number written in both a sentence and a field is two
   * places for it to disagree the moment somebody edits their copy.
   *
   * ⚠️ **Scanned over the `text` fields, not over the file source.** The doc comment
   * this test enforces quotes `+4 to hit` as its own example of what not to write, so
   * a grep of rules.ts would fail on the paragraph most carefully written to respect
   * the rule — which is how a guard gets deleted rather than obeyed.
   */
  test('no entry states a to-hit or a d20 in its prose', () => {
    const offenders: string[] = []
    for (const [name, list] of LISTS) {
      for (const entry of list) {
        if (/\bto hit\b/i.test(entry.text)) offenders.push(`${name}: ${entry.key} says "to hit"`)
        if (/1d20/.test(entry.text)) offenders.push(`${name}: ${entry.key} names 1d20`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The positive control for the sweep above. Both patterns are empty sets over the
   * catalogue, which is what makes them tripwires — and an empty set is exactly what
   * a scan reading nothing at all also produces.
   */
  test('and the sweep reads every entry and its patterns do find a needle', () => {
    expect(CATALOGUE.length).toBe(SPELLS.length + FEATS.length + NPC_ACTIONS.length)
    expect(CATALOGUE.length).toBeGreaterThan(40)
    for (const entry of CATALOGUE) expect(typeof entry.text).toBe('string')

    expect(/\bto hit\b/i.test('Scimitar. +4 to hit, reach 5 ft.')).toBe(true)
    expect(/1d20/.test('Roll 1d20+STR+PROF against its armour class.')).toBe(true)
    // And they do not fire on an innocent substring — a guard that cries wolf is a
    // guard somebody relaxes.
    expect(/\bto hit\b/i.test('Hard to hits and easy to miss.')).toBe(false)
    expect(/1d20/.test('A 19 on the d20 counts as a critical hit for you.')).toBe(false)
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
   * ⚠️ **The guard on the fixture, and it has to come first, because everything
   * below it is only as good as `asSheetEntry` is faithful.**
   *
   * This test exists because the helper was *not* faithful. It rebuilt a `SheetEntry`
   * field by field and was never extended when `category` and `toHit` arrived, so the
   * two tests underneath — the ones whose whole job is to run the server's own
   * validator over the real catalogue — were running it over fifty-two entries with
   * both new fields stripped off. Every weapon in the catalogue reached
   * `entriesProblem` looking like a legacy action, which is the one shape the new
   * arity rules are written to accept. Green, and asserting nothing.
   *
   * Written against `Object.keys` of the source rather than against a list of field
   * names, so the **next** field added to `CatalogueEntry` and forgotten here fails
   * this test rather than silently hollowing out the two below it.
   */
  test('the fixture carries every field of a catalogue entry onto the sheet', () => {
    for (const entry of CATALOGUE) {
      const source = entry as unknown as Record<string, unknown>
      const built = asSheetEntry(entry) as unknown as Record<string, unknown>
      // `key` becomes `catalogueKey`; `id` is minted per character. Everything else
      // has to survive the copy under its own name and with its own value.
      const carried = Object.keys(source).filter((field) => field !== 'key')
      const missing = carried.filter((field) => !(field in built))
      expect(missing, `${entry.key} lost fields`).toEqual([])
      for (const field of carried) {
        expect(built[field], `${entry.key}.${field}`).toEqual(source[field])
      }
      expect(built.catalogueKey, entry.key).toBe(entry.key)
      // Absent, never null: `entriesProblem` asks `toHit !== undefined`, so a key
      // present and empty is a to-hit as far as the refusal is concerned.
      expect('toHit' in built, `${entry.key} toHit key`).toBe(entry.toHit !== undefined)
    }
  })

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
