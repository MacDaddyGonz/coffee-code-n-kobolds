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
  toHitProblem,
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
   * pass vacuously — a `for` loop over nothing asserts nothing.
   *
   * **`SPELLS` is pinned exactly and the other two are floors**, which is the shape
   * the corpora have: the spell list is a transcription of a fixed source at a fixed
   * level cap, so its length is a fact about the SRD and a number moving is a
   * transcription error rather than an editorial decision. 27 cantrips and the 57 /
   * 57 / 42 of levels 1–3 is 183, and `a spread over the levels the module claims`
   * below pins the four numbers that make it up.
   *
   * ⚠️ **The roadmap said 15 cantrips and 171 spells. It is wrong** — the source has
   * 27 cantrips, counted twice from `spells.md`, and the milestone's table was a
   * snapshot its own text says must be regenerated rather than trusted.
   */
  test('each list holds the documented number of entries', () => {
    expect(SPELLS).toHaveLength(183)
    expect(FEATS).toHaveLength(10)
    expect(NPC_ACTIONS.length).toBeGreaterThanOrEqual(12)
  })

  /**
   * ⚠️ **`SPELLS` is deliberately absent from this, and the absence is the change
   * rather than an oversight.**
   *
   * Every earlier version of the catalogue was short enough to be taken onto one sheet
   * wholesale, and this assertion ran over all three lists. `SPELLS` is now 183 long
   * against a `MAX_SHEET_ENTRIES` of 40, and that is correct in both directions: a
   * character prepares a handful of spells, not the whole SRD, and the cap belongs to
   * the sheet rather than to the corpus. Loosening it to fit a transcription would be
   * the wrong repair — 183 entries at ~400 bytes each is 73 KB on a document that also
   * holds feats, against Convex's 1 MB limit, and nobody wants the list.
   *
   * The other two are still capped and still meant to be: a DM really does take a
   * monster's whole action list, and a hero's feat list is short by construction.
   */
  test('the two lists a sheet might take entire still fit on one', () => {
    expect(FEATS.length).toBeLessThanOrEqual(MAX_SHEET_ENTRIES)
    expect(NPC_ACTIONS.length).toBeLessThanOrEqual(MAX_SHEET_ENTRIES)
    expect(SPELLS.length).toBeGreaterThan(MAX_SHEET_ENTRIES)
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
    expect(tally(SPELLS)).toEqual({ weapon: 18, action: 44, passive: 121 })
    expect(tally(FEATS)).toEqual({ weapon: 0, action: 0, passive: 10 })
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
      // Through the server's own predicate rather than a `startsWith` here, which is
      // what this line used to be: `toHitProblem` is what the mutation runs, and it
      // refuses `1d200` on a prefix match that a hand-written check happily accepts.
      expect(toHitProblem(toHit as string), `${entry.key} → ${toHit}`).toBeNull()
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

  /**
   * The list runs cantrips through 3rd level, because characters stop at level 5 and a
   * level 5 character has no slot above 3rd. A stray 4th would be a spell nobody in
   * this application can cast, offered by the picker to everybody.
   *
   * ⚠️ **Pinned as four exact counts rather than as a ceiling**, for the reason the
   * category tally is: a ceiling is satisfied by a corpus that dropped every 3rd-level
   * spell, and a transcription's failure mode is a level going missing rather than one
   * arriving. The numbers are the SRD's own — 27 cantrips, then 57 / 57 / 42 — and they
   * sum to the 183 pinned above, which is asserted here rather than trusted so that two
   * numbers cannot be edited into agreement one at a time.
   */
  test('the spell list has the spread over levels 0 to 3 that the module claims', () => {
    const byLevel = new Map<number, number>()
    for (const entry of SPELLS) {
      const level = entry.level as number
      byLevel.set(level, (byLevel.get(level) ?? 0) + 1)
    }
    expect(Object.fromEntries(byLevel)).toEqual({ 0: 27, 1: 57, 2: 57, 3: 42 })
    expect([...byLevel.values()].reduce((a, b) => a + b, 0)).toBe(SPELLS.length)

    // And the ceiling itself, stated separately: the counts above would still pass if
    // a 4th-level spell were added *and* the expectation updated, so this is the line
    // that says the cap is a rule rather than a tally.
    const tooHigh = SPELLS.filter((entry) => (entry.level as number) > 3).map((e) => e.key)
    expect(tooHigh).toEqual([])
  })
})

describe('the feats are feats', () => {
  /**
   * ⭐ **The split, pinned by name.** `FEATS` used to hold sixteen entries of which
   * eight were **class features** — a different thing, with a different home and a
   * different recharge story — and six more were feats that appear in no SRD, 2014 or
   * 2024, written from general knowledge.
   *
   * Named individually rather than counted, because a count is satisfied by any ten
   * entries: the failure this guards against is somebody restoring Rage to the picker
   * because a character sheet mentions it, which a length assertion would never notice.
   * The class features belong on the library sheet for the level that grants them.
   */
  const CLASS_FEATURES = [
    'second-wind',
    'action-surge',
    'rage',
    'sneak-attack',
    'divine-smite',
    'lay-on-hands',
    'bardic-inspiration',
    'wild-shape',
  ]

  const NON_SRD_FEATS = [
    'great-weapon-master',
    'sharpshooter',
    'tough',
    'lucky',
    'mobile',
    'resilient',
  ]

  test('no class feature and no invented feat is offered as a feat', () => {
    expect(CLASS_FEATURES).toHaveLength(8)
    const offered = FEATS.map((feat) => feat.key)
    for (const key of [...CLASS_FEATURES, ...NON_SRD_FEATS]) {
      expect(offered, `${key} is back in FEATS`).not.toContain(key)
    }
  })

  /**
   * And gone from the catalogue *entirely*, which is the stronger claim and the one
   * that matters for the picker — `catalogueEntry` is the lookup every badge goes
   * through. Divine Smite is the single exception and has its own test below.
   */
  test('thirteen of the fourteen retired keys resolve to nothing at all', () => {
    const retired = [...CLASS_FEATURES, ...NON_SRD_FEATS].filter((key) => key !== 'divine-smite')
    expect(retired).toHaveLength(13)
    for (const key of retired) {
      expect(catalogueEntry(key), `${key} is back in the catalogue`).toBeUndefined()
    }
  })

  /**
   * ⚠️ **The eighth retired class feature is not retired — it MOVED**, and it is here
   * rather than in the list above so that the difference is impossible to miss. 2024
   * makes Divine Smite a level 1 Paladin *spell*, so the key still resolves and now
   * answers a spell. A character holding the old feat copy keeps a working badge.
   */
  test('divine-smite moved to the spell list rather than retiring', () => {
    const entry = catalogueEntry('divine-smite')
    expect(entry).toBeDefined()
    expect(entry?.level).toBe(1)
    expect(SPELLS).toContain(entry)
    expect(FEATS.map((feat) => feat.key)).not.toContain('divine-smite')
  })

  /** The ten that are left, named, and in the three SRD categories that reach level 5. */
  test('the ten SRD feats reachable at levels 1 to 5 are exactly what is offered', () => {
    expect(FEATS.map((feat) => feat.key)).toEqual([
      // Origin
      'alert',
      'magic-initiate',
      'savage-attacker',
      'skilled',
      // Fighting Style
      'archery',
      'defense',
      'great-weapon-fighting',
      'two-weapon-fighting',
      // General
      'ability-score-improvement',
      'grappler',
    ])
  })

  /**
   * Every one of the ten grants a proficiency, a bonus to a number already on the sheet,
   * or permission to do something — none has dice of its own. That was not true before:
   * the five rolling entries this list used to hold were all class features, and they
   * left with the rest. Asserted so that a future feat with a roll is a decision
   * somebody makes rather than a line somebody adds.
   */
  test('no feat rolls anything and none carries a to-hit', () => {
    for (const feat of FEATS) {
      expect(feat.roll, feat.key).toBeNull()
      expect(feat.toHit, feat.key).toBeUndefined()
      expect(feat.category, feat.key).toBe('passive')
      expect(feat.level, feat.key).toBeNull()
    }
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

  /**
   * A full sheet at once, which is the state the picker can actually put one in.
   *
   * ⚠️ **`SPELLS` is sliced and the other two are not, and the slice is the point
   * rather than a convenience.** A hero can hold `MAX_SHEET_ENTRIES` spells and no
   * more, so the interesting case is a sheet filled *to* the cap out of the corpus —
   * which is what the picker produces after forty clicks — and the two lists that fit
   * entire are still taken entire. Passing all 183 would only assert that
   * `entriesProblem` refuses 183, which `sheet.test.ts` already pins directly.
   *
   * Taken from the end as well as the beginning, because the corpus is alphabetical
   * and a first-40 slice is every spell between Acid Arrow and Bless.
   */
  test('a sheet filled to the cap from each list is storable', () => {
    for (const window of [
      SPELLS.slice(0, MAX_SHEET_ENTRIES),
      SPELLS.slice(-MAX_SHEET_ENTRIES),
      SPELLS.filter((entry) => entry.category === 'weapon').slice(0, MAX_SHEET_ENTRIES),
    ]) {
      const sheet: PcSheet = {
        ...defaultPcSheet(),
        spells: window.map((entry, i) => asSheetEntry(entry, i)),
      }
      expect(sheetProblem(sheet)).toBeNull()
    }

    const pcSheet: PcSheet = {
      ...defaultPcSheet(),
      spells: SPELLS.slice(0, MAX_SHEET_ENTRIES).map((entry, i) => asSheetEntry(entry, i)),
      feats: FEATS.map((entry, i) => asSheetEntry(entry, i + MAX_SHEET_ENTRIES)),
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
    // Every spell, not a window: `normaliseSheet` has no length rule to trip over, so
    // this is the one place the whole corpus goes through the real normaliser.
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
   * Speed is a **default** — `SPEED_FEET`, 30, with a species printing its own over the
   * top — and nothing in a catalogue entry can move it: a feat is a copy taken onto a
   * sheet, and the sheet's speed comes from the species and the DM's override. So an
   * entry that changes it is promising something nothing in the app can represent, and a
   * sheet that says 40 while every other screen says 30 is worse than the feat being
   * slightly smaller than its 5e original.
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
