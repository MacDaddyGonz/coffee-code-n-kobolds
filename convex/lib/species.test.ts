import { describe, expect, test } from 'vitest'

import { CLASS_KEYS, findClass } from './classes'
import { LIBRARY, librarySheet } from './library'
import {
  SPECIES,
  SPECIES_KEYS,
  lineageOf,
  perRestAbilities,
  species,
  speciesKeyValidator,
  speciesLabel,
} from './species'
import type { Lineage, Species } from './species'
import { resolveSheet } from './resolve'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  isValidRoll,
  sheetProblem,
  storedSheetProblem,
} from './sheet'
import type { PcSheet, PresetSheet } from './sheet'

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

/**
 * The trait counts the SRD prints, transcribed from `character-origins.md` and asserted
 * rather than derived from `SPECIES`.
 *
 * ⚠️ **A count derived from the thing it is checking is not a check.** `SPECIES.flatMap`
 * would agree with itself after a trait was deleted, which is the failure this whole
 * table exists to catch — a species whose fifth trait went missing is invisible on the
 * sheet, invisible in the builder, and has no symptom at all.
 */
const TRAIT_COUNTS: Record<string, number> = {
  dragonborn: 5,
  dwarf: 4,
  elf: 5,
  gnome: 3,
  goliath: 3,
  halfling: 4,
  human: 3,
  orc: 3,
  tiefling: 3,
}

/** Likewise for the lineage tables. Four species print none, and that is a fact too. */
const LINEAGE_COUNTS: Record<string, number> = {
  dragonborn: 10,
  dwarf: 0,
  elf: 3,
  gnome: 2,
  goliath: 6,
  halfling: 0,
  human: 0,
  orc: 0,
  tiefling: 3,
}

/** The speed each species prints. The Goliath is the only one that is not 30. */
const SPEEDS: Record<string, number> = {
  dragonborn: 30,
  dwarf: 30,
  elf: 30,
  gnome: 30,
  goliath: 35,
  halfling: 30,
  human: 30,
  orc: 30,
  tiefling: 30,
}

function preset(overrides: Partial<PresetSheet> = {}): PresetSheet {
  return {
    kind: 'preset',
    race: 'human',
    classKey: 'fighter',
    subclassKey: 'champion',
    level: 3,
    locked: false,
    ...overrides,
  }
}

function resolve(sheet: PresetSheet): PcSheet {
  return resolveSheet({ sheet }) as PcSheet
}

/** The library sheet a set of selections borrows from, before any species touches it. */
function source(sheet: PresetSheet) {
  const found = librarySheet(sheet.classKey, sheet.subclassKey, sheet.level)
  if (!found) throw new Error('the fixture must name a sheet the library holds')
  return found
}

/** Every lineage in the corpus, paired with the species that owns it. */
function allLineages(): { species: Species; lineage: Lineage }[] {
  return SPECIES.flatMap((entry) =>
    (entry.lineages ?? []).map((lineage) => ({ species: entry, lineage })),
  )
}

// ---------------------------------------------------------------------------
// The list itself
// ---------------------------------------------------------------------------

describe('the nine species', () => {
  test('SPECIES and SPECIES_KEYS describe the same nine, keyed by themselves', () => {
    expect(SPECIES).toHaveLength(9)
    expect(SPECIES.map((entry) => entry.key)).toEqual([...SPECIES_KEYS])
    for (const key of SPECIES_KEYS) {
      expect(species(key)!.key, key).toBe(key)
    }
    expect(new Set(SPECIES.map((entry) => entry.name)).size).toBe(9)
  })

  /**
   * ⚠️ **Half-Orc is not a 2024 species and Gnome and Orc are** — 8 − 1 + 2 = 9. The
   * roadmap says *"Half-Orc retired, Gnome added"*, which is loose: the SRD species is
   * **Orc**, with 120 feet of Darkvision and a bonus-action Dash the Half-Orc never had,
   * so it is a third species arriving rather than the second being renamed.
   */
  test('Half-Orc has gone, and Gnome and Orc have arrived', () => {
    expect([...SPECIES_KEYS]).not.toContain('half-orc')
    expect([...SPECIES_KEYS]).toContain('gnome')
    expect([...SPECIES_KEYS]).toContain('orc')
  })

  /**
   * ⚠️ **The sharpest single statement of what this milestone changed, and it is the
   * exact inverse of the assertion that used to stand here.** That one proved an Elf's
   * +2 Dexterity was applied once and no more. In 2024 an ability increase comes from a
   * **background**, which requirements.md excludes and which stays excluded — its
   * numbers are absorbed into the premade sheet's stored `abilities` instead. So there
   * is no such thing as a species that moves a score, and `Species` has no field one
   * could go in.
   *
   * Asserted against the library sheet the character actually borrows rather than
   * against a literal, so it keeps meaning what it says when somebody rebalances a
   * fighter. Over every class and both archetypes, because "no arithmetic" is a
   * property of the resolver rather than of the fixture this file happens to use.
   */
  test('no species changes an ability score, on any class at any level', () => {
    for (const classKey of CLASS_KEYS) {
      for (const [subclassKey, level] of [
        [null, 1],
        [findClass(classKey)!.subclasses[0].key, 5],
      ] as const) {
        const selections = preset({ classKey, subclassKey, level })
        const base = source(selections)
        for (const key of SPECIES_KEYS) {
          const resolved = resolve({ ...selections, race: key })
          const where = `${classKey}/${subclassKey}/${level} + ${key}`
          for (const ability of ABILITIES) {
            expect(resolved.abilities[ability], `${where} ${ability}`).toBe(base.abilities[ability])
          }
        }
      }
    }
  })

  /** And it is unwriteable rather than merely unwritten — there is no field for it. */
  test('and there is nowhere on a species to put one', () => {
    for (const entry of SPECIES) {
      expect('abilityBonus' in entry, entry.key).toBe(false)
      expect('speedBonus' in entry, entry.key).toBe(false)
    }
  })

  test('every species has the traits the SRD prints, and no others', () => {
    for (const entry of SPECIES) {
      expect(entry.traits.length, entry.key).toBe(TRAIT_COUNTS[entry.key])
      // Unique *within* a species, which is what makes the resolved ids unique: they are
      // derived from the name. Darkvision appears on six species and never twice on one.
      expect(new Set(entry.traits.map((trait) => trait.name)).size, entry.key).toBe(
        entry.traits.length,
      )
    }
    expect(SPECIES.reduce((total, entry) => total + entry.traits.length, 0)).toBe(33)
  })

  /**
   * A species' trait lands on the sheet as an ordinary entry, so its name and text are
   * bounded by the same limits every other entry is. A trait longer than the field would
   * make every character of that species unsaveable — and `sheetProblem` would blame the
   * entry rather than the species.
   */
  test('every trait fits the entry it becomes', () => {
    for (const entry of SPECIES) {
      expect(entry.blurb.trim(), entry.key).not.toBe('')
      for (const trait of entry.traits) {
        const where = `${entry.key}: ${trait.name}`
        expect(trait.name.trim(), where).not.toBe('')
        expect(trait.name.length, where).toBeLessThanOrEqual(MAX_ENTRY_NAME_LENGTH)
        expect(trait.text.trim(), where).not.toBe('')
        expect(trait.text.length, where).toBeLessThanOrEqual(MAX_ENTRY_TEXT_LENGTH)
      }
    }
  })

  /**
   * ⚠️ **`baseSpeed` is an absolute, and it is spelled out on all nine on purpose.**
   * The type leaves it optional, so eight of them could have relied on `SPEED_FEET`
   * being the default — and `SPEED_FEET` is still **35**, because flipping it to 30 is a
   * stored-value change that belongs to the migration branch. A species that leaned on
   * it would therefore be wrong today and right later, which is the worst of both.
   *
   * `SPEED_FEET` is deliberately not imported by this test for the same reason: a
   * literal 30 goes on saying the same thing after the constant moves.
   */
  test('every species prints its own speed, and only the Goliath is not 30', () => {
    for (const entry of SPECIES) {
      expect(entry.baseSpeed, entry.key).toBe(SPEEDS[entry.key])
    }
    expect(SPECIES.filter((entry) => entry.baseSpeed !== 30).map((entry) => entry.key)).toEqual([
      'goliath',
    ])
  })

  test('every granted entry is a storable entry with a valid roll', () => {
    for (const entry of SPECIES) {
      for (const granted of [...(entry.grantedFeats ?? []), ...(entry.grantedSpells ?? [])]) {
        const where = `${entry.key}: ${granted.name}`
        expect(granted.name.trim(), where).not.toBe('')
        expect(granted.name.length, where).toBeLessThanOrEqual(MAX_ENTRY_NAME_LENGTH)
        expect(granted.text.length, where).toBeLessThanOrEqual(MAX_ENTRY_TEXT_LENGTH)
        if (granted.roll !== null) expect(isValidRoll(granted.roll), where).toBe(true)
      }
      // A granted *spell* needs a spell level and a granted *feat* must not have one.
      for (const granted of entry.grantedSpells ?? []) {
        expect(granted.level, entry.key).not.toBeNull()
      }
      for (const granted of entry.grantedFeats ?? []) {
        expect(granted.level, entry.key).toBeNull()
      }
    }
  })

  /**
   * ⚠️⚠️ **THE DEFECT THIS FILE RECORDED FOR A MILESTONE, NOW PINNED.**
   *
   * The Dragonborn's `traitName` and the name of the feat it granted were the same
   * string, `Breath Weapon`, so the resolver appended both and every Dragonborn's sheet
   * carried two feats with an identical name — one describing the cone and one rolling
   * for it. Nothing downstream caught it: the two ids differed, so `sheetProblem`'s
   * uniqueness check was satisfied and the sheet saved happily, and what the player saw
   * was one ability listed twice with only one of the two rows rollable.
   *
   * **A species now has up to five traits, so that is five chances at it instead of
   * one** — which is why this is a test rather than a comment. Two things close it:
   * `applySpecies` mints traits and granted feats under the **same `race` prefix**, so a
   * collision is a duplicate id the validator refuses outright rather than a cosmetic
   * duplication; and this assertion catches it here, before a deployment does.
   */
  test('no trait name collides with a granted entry, on a species or on a lineage', () => {
    const offenders: string[] = []
    for (const entry of SPECIES) {
      const traits = new Set(entry.traits.map((trait) => trait.name))
      const granted = [...(entry.grantedFeats ?? []), ...(entry.grantedSpells ?? [])]
      for (const line of granted) {
        if (traits.has(line.name)) offenders.push(`${entry.key}: ${line.name}`)
      }
      for (const lineage of entry.lineages ?? []) {
        // Cross-layer as well: a lineage's own trait and its grants land on the same
        // sheet as the species', under a different prefix — so this pairing would *not*
        // be caught by the duplicate-id refusal and needs catching here.
        const where = `${entry.key}/${lineage.key}`
        if (traits.has(lineage.traitName)) offenders.push(`${where}: ${lineage.traitName}`)
        for (const line of [...(lineage.grantedFeats ?? []), ...(lineage.grantedSpells ?? [])]) {
          if (traits.has(line.name) || line.name === lineage.traitName) {
            offenders.push(`${where}: ${line.name}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Lineages — the sixth pick
// ---------------------------------------------------------------------------

describe('lineages, legacies and ancestries', () => {
  test('the five species that print a table have one, and the four that do not have none', () => {
    for (const entry of SPECIES) {
      expect(entry.lineages?.length ?? 0, entry.key).toBe(LINEAGE_COUNTS[entry.key])
      // Absent rather than empty for the four, because that is what the builder tests to
      // decide whether to draw the control at all.
      if (LINEAGE_COUNTS[entry.key] === 0) expect(entry.lineages, entry.key).toBeUndefined()
    }
    expect(allLineages()).toHaveLength(24)
  })

  test('every lineage is storable, and its keys and names are unique within its species', () => {
    for (const entry of SPECIES) {
      const lineages = entry.lineages ?? []
      expect(new Set(lineages.map((lineage) => lineage.key)).size, entry.key).toBe(lineages.length)
      expect(new Set(lineages.map((lineage) => lineage.name)).size, entry.key).toBe(lineages.length)
      for (const lineage of lineages) {
        const where = `${entry.key}/${lineage.key}`
        expect(lineage.key, where).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        expect(lineage.blurb.trim(), where).not.toBe('')
        expect(lineage.traitName.trim(), where).not.toBe('')
        expect(lineage.traitName.length, where).toBeLessThanOrEqual(MAX_ENTRY_NAME_LENGTH)
        expect(lineage.traitText.trim(), where).not.toBe('')
        expect(lineage.traitText.length, where).toBeLessThanOrEqual(MAX_ENTRY_TEXT_LENGTH)
        for (const line of [...(lineage.grantedFeats ?? []), ...(lineage.grantedSpells ?? [])]) {
          expect(line.name.length, `${where}: ${line.name}`).toBeLessThanOrEqual(
            MAX_ENTRY_NAME_LENGTH,
          )
          expect(line.text.length, `${where}: ${line.name}`).toBeLessThanOrEqual(
            MAX_ENTRY_TEXT_LENGTH,
          )
          if (line.roll !== null) expect(isValidRoll(line.roll), `${where}: ${line.name}`).toBe(true)
        }
      }
    }
  })

  /**
   * ⚠️ **`lineageOf` is `subclassOf`'s stance, and this is the case that stance exists
   * for.** A lineage key is stored on a character, so retiring or renaming one must
   * leave the characters that chose it readable rather than breaking their sheet.
   */
  test('lineageOf answers null for a retired key, a foreign key and a species without any', () => {
    const elf = species('elf')!
    expect(lineageOf(elf, 'wood')?.key).toBe('wood')
    expect(lineageOf(elf, 'ancient-sun-elf-lineage')).toBeNull()
    expect(lineageOf(elf, null)).toBeNull()
    expect(lineageOf(null, 'wood')).toBeNull()
    // Scoped to the species, which is the whole reason the signature takes one: `wood` is
    // an elven lineage and means nothing at all on a Goliath.
    expect(lineageOf(species('goliath'), 'wood')).toBeNull()
    expect(lineageOf(species('halfling'), 'wood')).toBeNull()
  })

  /**
   * ⭐ **The acceptance criterion for this whole step, read off the content rather than
   * off a constant.** The roadmap suggested absorbing lineages into the premade builds;
   * its own criterion — *"a Wood Elf moves 35 and a Human moves 30"* — is unsatisfiable
   * if Wood Elf cannot be chosen, which is what made this a builder field.
   *
   * ⚠️ **`SPEED_FEET` is deliberately not imported.** It is still 35, and a test written
   * as `SPEED_FEET - 5` would go on passing after the migration branch moves it to 30
   * while saying nothing about whether these two numbers are still different.
   */
  test('a Wood Elf moves 35 and a Human moves 30', () => {
    expect(resolve(preset({ race: 'elf', lineageKey: 'wood' })).speed).toBe(35)
    expect(resolve(preset({ race: 'human' })).speed).toBe(30)
    // And the lineage is applied *after* the species rather than before it. Reversed,
    // the Elf's printed 30 would overwrite the 35 and this whole feature would be
    // invisible.
    expect(resolve(preset({ race: 'elf' })).speed).toBe(30)
    expect(resolve(preset({ race: 'elf', lineageKey: 'high' })).speed).toBe(30)
  })

  test('a species with no lineages ignores a stored lineageKey entirely', () => {
    const plain = resolve(preset({ race: 'halfling' }))
    for (const stray of ['wood', 'red', 'infernal', 'not-a-lineage']) {
      expect(resolve(preset({ race: 'halfling', lineageKey: stray })), stray).toEqual(plain)
    }
    // And a lineage belonging to some other species is equally inert — a Goliath holding
    // `wood` is a Goliath, not a Goliath who moves 35.
    expect(resolve(preset({ race: 'goliath', lineageKey: 'wood' }))).toEqual(
      resolve(preset({ race: 'goliath' })),
    )
  })

  /**
   * Every lineage, on every class, through the validator the mutation runs. A lineage is
   * where a species can break a sheet that was fine without it — an id that collides with
   * the species layer's, a roll the grammar refuses, a trait text over the limit.
   */
  test('every lineage resolves to a storable sheet, and adds exactly its own lines', () => {
    const problems: string[] = []
    for (const { species: entry, lineage } of allLineages()) {
      for (const classKey of CLASS_KEYS) {
        const without = resolve(preset({ classKey, subclassKey: null, level: 1, race: entry.key }))
        const withIt = resolve(
          preset({
            classKey,
            subclassKey: null,
            level: 1,
            race: entry.key,
            lineageKey: lineage.key,
          }),
        )
        const where = `${entry.key}/${lineage.key}/${classKey}`
        const problem = sheetProblem(withIt)
        if (problem) problems.push(`${where}: ${problem.path} — ${problem.message}`)

        // One trait line, plus whatever it grants, and nothing else moved.
        const added =
          1 + (lineage.grantedFeats?.length ?? 0) + (lineage.grantedSpells?.length ?? 0)
        expect(withIt.feats.length + withIt.spells.length - added, where).toBe(
          without.feats.length + without.spells.length,
        )
        expect(withIt.maxHp, where).toBe(without.maxHp)
        expect(withIt.abilities, where).toEqual(without.abilities)
        expect(withIt.speed, where).toBe(lineage.speed ?? without.speed)
      }
    }
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The one number a species still changes
// ---------------------------------------------------------------------------

describe('a species changes its numbers exactly once', () => {
  /**
   * **The failure this describe exists for is double application.** The resolver is
   * called on every read of a character rather than at write time, so a modifier applied
   * in the wrong place is not a one-off mistake in one document — it is a number that
   * grows, or that reappears after a level-up, across every character of that species in
   * every game.
   *
   * There are only two such numbers left. Ability scores are gone entirely (see above),
   * so what remains is the Dwarf's hit point per level and the printed speed.
   *
   * Per *level*, so the hit points are the one modifier a level-up has to move — and the
   * one where "applied twice" and "applied once but with the wrong level" look identical
   * at level 1 and diverge everywhere else. Several levels, therefore, rather than one.
   */
  test("the Dwarf's hit points are the library's plus one per level, at every level", () => {
    for (const level of [1, 2, 3, 4, 5, 12, 20]) {
      const selections = preset({
        race: 'dwarf',
        level,
        subclassKey: level < 2 ? null : 'champion',
      })
      const base = source(selections)
      // The character's level, not the library sheet's — a level 12 fighter borrows the
      // level 5 numbers but is still twelve levels of Dwarf.
      const expected = base.maxHp + Math.min(level, 20)
      expect(resolve(selections).maxHp, `level ${level}`).toBe(expected)
    }
  })

  test('the Goliath moves 35 and everybody else moves 30, whatever the library says', () => {
    expect(resolve(preset({ race: 'goliath' })).speed).toBe(35)
    expect(resolve(preset({ race: 'goliath' })).abilities).toEqual(
      source(preset({ race: 'goliath' })).abilities,
    )
    expect(resolve(preset({ race: 'goliath' })).maxHp).toBe(source(preset()).maxHp)
  })

  /**
   * The eight that change no number must change no number. A species whose whole
   * contribution is a list of traits is where an accidental `+ 0` turning into `+ 1`
   * would go unnoticed longest, because nobody is watching a Halfling's arithmetic.
   */
  test('a species with no numeric modifier leaves every number exactly as the library had it', () => {
    const numeric: Species[] = SPECIES.filter((entry) => entry.hpPerLevel !== undefined)
    // Vacuity: exactly one of the nine touches arithmetic now, and the other eight must
    // not. Speed is excluded on purpose — every species states one, so it is not a
    // *modifier*, and the assertion for it is the speed test above.
    expect(numeric.map((entry) => entry.key)).toEqual(['dwarf'])

    for (const key of SPECIES_KEYS) {
      if (key === 'dwarf') continue
      const selections = preset({ race: key })
      const base = source(selections)
      const resolved = resolve(selections)
      expect(resolved.abilities, key).toEqual(base.abilities)
      expect(resolved.maxHp, key).toBe(base.maxHp)
      expect(resolved.armourClass, key).toBe(base.armourClass)
      expect(resolved.speed, key).toBe(SPEEDS[key])
      expect(resolved.hitDice, key).toEqual(base.hitDice)
      expect(resolved.saveProficiencies, key).toEqual(base.saveProficiencies)
      expect(resolved.skillProficiencies, key).toEqual(base.skillProficiencies)
    }
  })

  /**
   * The same modifiers over every class and level the library holds, because "applied
   * once" is a property of the resolver rather than of the fixture this file happens to
   * use. 9 species × 8 classes is where a modifier applied in the wrong branch would show
   * up.
   */
  test('holds for every class at every level, not just the fixture', () => {
    for (const classKey of CLASS_KEYS) {
      for (const [subclassKey, level] of [
        [null, 1],
        [findClass(classKey)!.subclasses[0].key, 5],
      ] as const) {
        const selections = preset({ classKey, subclassKey, level })
        const base = source(selections)
        for (const key of SPECIES_KEYS) {
          const chosen = species(key)!
          const resolved = resolve({ ...selections, race: key })
          const where = `${classKey}/${subclassKey}/${level} + ${key}`
          expect(resolved.maxHp, where).toBe(base.maxHp + (chosen.hpPerLevel ?? 0) * level)
          expect(resolved.speed, where).toBe(chosen.baseSpeed)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The traits on the sheet
// ---------------------------------------------------------------------------

describe('the traits land on the sheet', () => {
  /**
   * "The trait always appears, whether or not it changes a number — a Halfling's Luck is
   * the whole of what makes them a Halfling and would otherwise be invisible on their
   * own sheet."
   *
   * ⚠️ **All of them, which is the change.** A species used to be one trait, so this test
   * used to look for one entry. Three to five each now, and a species whose fifth trait
   * silently stopped being emitted would have no symptom at all.
   */
  test("every species' traits appear exactly once each, on every class and level", () => {
    for (const classKey of CLASS_KEYS) {
      for (const level of [1, 3, 5]) {
        for (const key of SPECIES_KEYS) {
          const chosen = species(key)!
          const resolved = resolve(
            preset({
              classKey,
              race: key,
              level,
              subclassKey: level < 2 ? null : findClass(classKey)!.subclasses[0].key,
            }),
          )
          for (const trait of chosen.traits) {
            const where = `${classKey}/${level} + ${key}: ${trait.name}`
            const matching = resolved.feats.filter((entry) => entry.name === trait.name)
            expect(matching.length, where).toBe(1)
            expect(matching[0].text, where).toBe(trait.text)
            expect(matching[0].roll, where).toBeNull()
            expect(matching[0].level, where).toBeNull()
            expect(matching[0].catalogueKey, where).toBeNull()
            expect(matching[0].category, where).toBe('passive')
            // And it is on the feats list, never the spell list, whether or not the
            // species also grants a spell.
            expect(resolved.spells.some((entry) => entry.name === trait.name), where).toBe(false)
          }
        }
      }
    }
  })

  /**
   * A stable id, and this is what "stable" has to mean in practice: the same across two
   * resolutions of the same character, and — the case that matters — unchanged by a
   * level-up. `withId` derives an id from the entry's *name* rather than its position
   * precisely so that levelling does not renumber a sheet, which React would read as
   * every row being replaced and Milestone 6 would read as every roll target moving.
   */
  test("every trait keeps one id across resolutions, levels and classes", () => {
    for (const key of SPECIES_KEYS) {
      for (const trait of species(key)!.traits) {
        const ids = new Set<string>()
        for (const classKey of CLASS_KEYS) {
          for (const level of [1, 2, 5]) {
            const resolved = resolve(
              preset({
                classKey,
                race: key,
                level,
                subclassKey: level < 2 ? null : findClass(classKey)!.subclasses[0].key,
              }),
            )
            const line = resolved.feats.find((entry) => entry.name === trait.name)
            expect(line, `${classKey}/${level} + ${key}: ${trait.name}`).toBeDefined()
            ids.add(line!.id)
          }
        }
        const where = `${key}: ${trait.name}`
        expect([...ids], where).toHaveLength(1)
        const [id] = [...ids]
        expect(id.startsWith('race:'), `${where} — ${id}`).toBe(true)
        expect(id.length, where).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
      }
    }
  })

  test('the Tiefling gets Thaumaturgy, on the spell list, exactly once', () => {
    const resolved = resolve(preset({ race: 'tiefling' }))
    const matching = resolved.spells.filter((entry) => entry.name === 'Thaumaturgy')
    expect(matching).toHaveLength(1)
    expect(matching[0].level).toBe(0)
    expect(resolved.feats.some((entry) => entry.name === 'Thaumaturgy')).toBe(false)
    // And nobody else does.
    for (const key of SPECIES_KEYS) {
      if (key === 'tiefling') continue
      expect(
        resolve(preset({ race: key })).spells.some((entry) => entry.name === 'Thaumaturgy'),
        key,
      ).toBe(false)
    }
  })

  /**
   * ⚠️ **The Dragonborn's rollable breath comes from its ancestry now, and this is the
   * test that says so.** The species' `Breath Weapon` is one of the five SRD traits and
   * is a `passive` by construction; the roll needs a damage type, and the ancestry is
   * what decides it. That is what resolved the duplicate-name defect — `Fire Breath` and
   * `Breath Weapon` are two rows saying two different things.
   */
  test('a Dragonborn breathes what its ancestry breathes, and only then', () => {
    const plain = resolve(preset({ race: 'dragonborn' }))
    expect(plain.feats.filter((entry) => entry.roll !== null && entry.id.startsWith('lineage:'))).toEqual(
      [],
    )

    const damageByKey: Record<string, string> = {
      black: 'Acid',
      blue: 'Lightning',
      brass: 'Fire',
      bronze: 'Lightning',
      copper: 'Acid',
      gold: 'Fire',
      green: 'Poison',
      red: 'Fire',
      silver: 'Cold',
      white: 'Cold',
    }
    for (const lineage of species('dragonborn')!.lineages ?? []) {
      const resolved = resolve(preset({ race: 'dragonborn', lineageKey: lineage.key })).feats
      const breath = resolved.find((entry) => entry.name === `${damageByKey[lineage.key]} Breath`)
      expect(breath, lineage.key).toBeDefined()
      expect(breath!.roll, lineage.key).toBe('1d10')
      expect(breath!.category, lineage.key).toBe('action')
    }
  })

  /**
   * No species — with or without a lineage — puts two entries with the same name on a
   * sheet. The Dragonborn shipped exactly that for a milestone; see the collision test in
   * the first describe for the full account.
   */
  test('no species puts two entries with the same name on a sheet', () => {
    const offenders: string[] = []
    for (const key of SPECIES_KEYS) {
      const keys: (string | null)[] = [null, ...(species(key)!.lineages ?? []).map((l) => l.key)]
      for (const lineageKey of keys) {
        const resolved = resolve(preset({ race: key, lineageKey }))
        const names = [...resolved.feats, ...resolved.spells].map((entry) => entry.name)
        for (const [index, name] of names.entries()) {
          if (names.indexOf(name) !== index) offenders.push(`${key}/${lineageKey}: ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Every species, on every class, at every level, through the validator the mutation
   * runs. The traits and granted entries are where a species can break a sheet that was
   * fine without it — an id that collides with a library entry's, a roll the grammar
   * refuses, a trait text over the limit, or simply more entries than `MAX_SHEET_ENTRIES`
   * now that a species contributes five lines rather than one.
   */
  test('every species resolves to a storable sheet on every class', () => {
    const problems: string[] = []
    for (const classKey of CLASS_KEYS) {
      for (const subclass of findClass(classKey)!.subclasses) {
        for (const level of [2, 5]) {
          for (const key of SPECIES_KEYS) {
            const resolved = resolve(
              preset({ classKey, subclassKey: subclass.key, level, race: key }),
            )
            const problem = sheetProblem(resolved)
            if (problem) {
              problems.push(
                `${classKey}/${subclass.key}/${level} + ${key}: ${problem.path} — ${problem.message}`,
              )
            }
          }
        }
      }
    }
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Per-rest abilities
// ---------------------------------------------------------------------------

describe('perRestAbilities', () => {
  /**
   * Two species, and exactly two. This is the list the vitals panel draws a spendable
   * checkbox from, so a species that quietly acquired one would put an untracked resource
   * on a sheet — and one that lost one would silently drop a flag somebody had already
   * spent.
   *
   * ⚠️ **The Orc inherits the Half-Orc's `relentless-endurance` key**, which is what makes
   * retiring that species cheap: nothing stored has to move. And it is still only two,
   * because every other 2024 species resource is *"a number of times equal to your
   * Proficiency Bonus"* — a count, not a boolean, and a count belongs to the resource
   * shape the schema step adds.
   */
  test('returns entries for the Human and the Orc, and nothing for the other seven', () => {
    const withAbilities = SPECIES_KEYS.filter((key) => perRestAbilities(key).length > 0)
    expect([...withAbilities].sort()).toEqual(['human', 'orc'])

    for (const key of SPECIES_KEYS) {
      const abilities = perRestAbilities(key)
      expect(Array.isArray(abilities), key).toBe(true)
      if (key === 'human' || key === 'orc') {
        expect(abilities, key).toHaveLength(1)
      } else {
        expect(abilities, key).toEqual([])
      }
    }
    expect(perRestAbilities('human')[0].key).toBe('heroic-inspiration')
    expect(perRestAbilities('orc')[0].key).toBe('relentless-endurance')
  })

  /**
   * The key is what the spent flag is stored against in `characterVitals`, so it has to
   * be unique across every species — two species sharing one would make a Human's spent
   * Inspiration read as an Orc's spent Endurance.
   */
  test('every per-rest key is unique across all nine species and is a usable id', () => {
    const keys = SPECIES_KEYS.flatMap((key) => perRestAbilities(key).map((entry) => entry.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(key.length).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
    }
    for (const key of SPECIES_KEYS) {
      for (const ability of perRestAbilities(key)) {
        expect(ability.name.trim(), key).not.toBe('')
        expect(ability.text.trim(), key).not.toBe('')
      }
    }
  })

  /**
   * `perRestAbilities` hands back a copy rather than `species(key).perRest` itself — the
   * live array on the module-level `SPECIES` constant — so a caller that sorts, splices
   * or pushes is editing a copy rather than the species definition. On Convex that
   * matters more than it sounds: the isolate outlives the request, so one mutating caller
   * would change what every subsequent query in that isolate saw, and the corruption
   * would disappear on redeploy.
   *
   * The rest of this codebase is careful about exactly this. `defaultPcSheet` and
   * `noSkills` build a fresh object every call and sheet.test.ts pins it; `sheetEntriesOf`
   * spreads its two lists for the stated reason that "a caller sorting the result must not
   * reorder the sheet".
   */
  test('hands back a list the caller cannot use to edit the species', () => {
    const first = perRestAbilities('human')
    first.push({ key: 'made-up', name: 'Made Up', text: 'Not real.' })
    expect(perRestAbilities('human')).toHaveLength(1)
    expect(species('human')!.perRest).toHaveLength(1)
  })

  /**
   * ⚠️ **No lineage has one, and that absence is asserted rather than assumed.**
   * `perRestAbilities` is keyed by species alone, so a lineage that acquired a
   * once-per-long-rest boolean would be invisible to the vitals panel — a checkbox that
   * simply never appears. The day one does, this signature grows a second argument.
   */
  test('and no lineage has one, which is why the accessor takes no lineage', () => {
    for (const { species: entry, lineage } of allLineages()) {
      expect(lineage.perRest, `${entry.key}/${lineage.key}`).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// The species and the library do not overlap
// ---------------------------------------------------------------------------

describe('species and the library stay out of each other', () => {
  /**
   * A trait name colliding with a library entry's would produce two rows a player cannot
   * tell apart — the same failure the Dragonborn had internally, one file over. Checked
   * across the whole library because a class content edit is what would introduce it.
   *
   * ⚠️ **The lineages are swept too, and that is what keeps their cantrips honest.** Six
   * of the eight lineage cantrips are already on a class's spell list — a Tiefling Wizard
   * would carry two `Fire Bolt`s — which is why a lineage names its cantrip in prose
   * rather than granting a duplicate entry. This is the assertion that would catch
   * somebody granting one.
   */
  test('no library entry is named after a species trait or a granted entry', () => {
    const owned = new Set(
      SPECIES.flatMap((entry) => [
        ...entry.traits.map((trait) => trait.name),
        ...(entry.grantedFeats ?? []).map((granted) => granted.name),
        ...(entry.grantedSpells ?? []).map((granted) => granted.name),
        ...(entry.lineages ?? []).flatMap((lineage) => [
          lineage.traitName,
          ...(lineage.grantedFeats ?? []).map((granted) => granted.name),
          ...(lineage.grantedSpells ?? []).map((granted) => granted.name),
        ]),
      ]),
    )
    const offenders: string[] = []
    for (const classKey of CLASS_KEYS) {
      const library = LIBRARY[classKey]
      const sheets = [library.base, ...Object.values(library.paths).flatMap((path) => Object.values(path))]
      for (const sheet of sheets) {
        for (const entry of [...sheet.feats, ...sheet.spells]) {
          if (owned.has(entry.name)) offenders.push(`${classKey}/${sheet.level}: ${entry.name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /** And the ids the resolver mints for the three sources cannot collide either. */
  test('a species id, a lineage id and a library id never share a namespace', () => {
    for (const key of SPECIES_KEYS) {
      const lineageKeys: (string | null)[] = [
        null,
        ...(species(key)!.lineages ?? []).map((lineage) => lineage.key),
      ]
      for (const classKey of CLASS_KEYS) {
        for (const lineageKey of lineageKeys) {
          const resolved = resolve(
            preset({
              classKey,
              race: key,
              lineageKey,
              subclassKey: findClass(classKey)!.subclasses[1].key,
            }),
          )
          const ids = [...resolved.feats, ...resolved.spells].map((entry) => entry.id)
          const where = `${classKey} + ${key}/${lineageKey}`
          expect(new Set(ids).size, where).toBe(ids.length)
          for (const id of ids) {
            expect(id, where).toMatch(/^(lib|race|lineage):/)
            expect(id.length, `${where} — ${id}`).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// A species that has been retired — Milestone 14
// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **THE LANDMINE, DISARMED AND THEN PROVED DISARMED.**
 *
 * `species()` used to end `SPECIES_BY_KEY.get(key)!` under the comment *"Non-null:
 * `SpeciesKey` is derived from the same list, so an unknown key cannot exist."* That comment
 * was true when it was written and is the exact shape of the bug `findClass` in lib/classes.ts
 * was rewritten to prevent — whose docblock records that retiring a class was a one-line edit
 * that turned `characters.list` into a `TypeError` **for the whole party**, not just for the
 * character concerned. One player's stale key took everybody's sheet list down.
 *
 * A key being unconstructable *in new code* is not the same as unconstructable, because a
 * character **stores** its species. ⭐ **This block was hypothetical when it was written and
 * is not any more: Half-Orc has actually gone**, so every case below is now reachable by a
 * real document rather than only by an invented key.
 *
 * Both are exercised, and the pairing is the point. The invented key proves the functions are
 * total rather than special-cased, and `half-orc` proves the one key a real deployment holds
 * takes the same path.
 */
describe('a stored species key that no longer resolves', () => {
  const INVENTED = 'ancient-halfling-subspecies'
  const RETIRED = 'half-orc'

  test('is genuinely not a species, so these tests are about the case that matters', () => {
    // Anti-vacuity. Without this, a fixture that accidentally named a real species would make
    // every assertion below pass for entirely the wrong reason.
    expect([...SPECIES_KEYS]).not.toContain(INVENTED)
    expect([...SPECIES_KEYS]).not.toContain(RETIRED)
  })

  test('species() answers null rather than throwing or returning undefined', () => {
    expect(species(INVENTED)).toBeNull()
    expect(species(RETIRED)).toBeNull()
  })

  test('perRestAbilities answers an empty list, so nothing downstream indexes into undefined', () => {
    expect(perRestAbilities(INVENTED)).toEqual([])
    // ⚠️ **Empty even though the Half-Orc had one**, which is the deliberate half of the
    // asymmetry: `characters.setPerRest` validates a *spend* against this list and does not
    // validate handing one back, so a Half-Orc who had already spent their survival can
    // still clear the flag and cannot spend a new one.
    expect(perRestAbilities(RETIRED)).toEqual([])
  })

  /**
   * ⚠️ **The failure that actually mattered was never about one character.** `characters.list`
   * resolves every sheet in the game in one query, so a single stale key threw before the query
   * returned and took the whole party's list with it. This is that shape: one broken character
   * among several, resolved together.
   */
  test('a character holding one resolves, keeps its name and does not take the party down', () => {
    // ⚠️ **Cast through `unknown`, and the awkwardness is the point rather than a nuisance.**
    // `PresetSheet.race` is typed `SpeciesKey`, so a retired key is unconstructable *in new
    // code* — which is exactly the false comfort the old `!` rested on. The database has no
    // such type. This is what `ctx.db.get` hands back now that Half-Orc has gone, and the only
    // way to write the test at all. `storedSpeciesKeyValidator` is what lets such a row survive
    // a schema push; this is what happens once it does.
    const party = [
      { kind: 'preset', race: 'human', classKey: 'fighter', subclassKey: 'champion', level: 3, locked: false },
      { kind: 'preset', race: RETIRED, classKey: 'wizard', subclassKey: 'evocation', level: 3, locked: false },
      { kind: 'preset', race: 'elf', classKey: 'rogue', subclassKey: 'thief', level: 3, locked: false },
    ] as unknown as PresetSheet[]

    const resolved = party.map((sheet) => resolveSheet({ sheet }) as PcSheet)

    // Nothing threw, and all three came back.
    expect(resolved).toHaveLength(3)
    for (const sheet of resolved) expect(sheet.kind).toBe('pc')

    // The broken one keeps everything the LIBRARY gave it — level, class, hit points, abilities
    // — and loses only what the species was adding. That is the same degradation a retired
    // archetype already produces through `librarySheet` returning null, reached by the other
    // route, and it is why `resolveSheet` is not a place to raise an error.
    const orphan = resolved[1]
    expect(orphan.level).toBe(3)
    expect(orphan.className).toContain('Evocation')
    expect(orphan.maxHp).toBeGreaterThan(0)
    expect(Object.keys(orphan.skillProficiencies ?? {})).toHaveLength(18)

    // And it carries no species traits, which is the visible consequence — three entries fewer
    // than the same build with a species that resolves. Asserted against a *real* build rather
    // than against a literal, so a change to what the library grants does not make this a lie.
    const intact = resolveSheet({
      sheet: { ...party[1], race: 'human' } as PresetSheet,
    }) as PcSheet
    expect(orphan.feats.length).toBeLessThan(intact.feats.length)
  })

  /**
   * ⚠️ **Tolerated on READ and refused on WRITE — and writing this test found that the refusal
   * is not where it looks like it should be.**
   *
   * `storedSheetProblem` answers **null** for the sheet below, and that is correct rather than a
   * hole: it validates numbers, entries and roll grammar, and it takes a `PresetSheet` — a type
   * whose `race` field is `SpeciesKey` and therefore cannot hold a retired key in any code the
   * compiler has seen. Adding a hand-written key check there would be a second opinion about
   * something the type already decides.
   *
   * **What actually refuses the write is `speciesKeyValidator`**, at the Convex function
   * boundary, before a handler runs — the same mechanical refusal `tokenLayerValidator` gives a
   * layer. That is the stronger of the two and it is the one asserted here. The asymmetry the
   * roadmap names is therefore real and is spelled: the NARROW validator is what every argument
   * takes, and only the widened stored one admits a retired key at all, which is what lets an
   * existing row survive a push without letting a new one be created.
   */
  test('is refused on write by the validator, which is where that refusal lives', () => {
    const literals = speciesKeyValidator.members.map((member) => member.value)
    expect(literals).toEqual([...SPECIES_KEYS])
    expect(literals).not.toContain(INVENTED)
    expect(literals).not.toContain(RETIRED)

    // And the sheet checker is silent about it, deliberately — see above. Asserted rather than
    // left implicit, so a later reader does not add a redundant check to "fix" the gap.
    for (const race of [INVENTED, RETIRED]) {
      expect(
        storedSheetProblem({
          kind: 'preset',
          race,
          classKey: 'fighter',
          subclassKey: 'champion',
          level: 3,
          locked: false,
        } as unknown as PresetSheet),
        race,
      ).toBeNull()
    }
  })

  /**
   * ⚠️ **The two retired keys are shown differently, and that difference is `RETIRED_SPECIES`
   * earning its place.** An invented key nobody ever shipped has no name to print, so it prints
   * itself; `half-orc` was a species this application really had, so a sheet built before the
   * conversion still says *Half-Orc* rather than a slug. A blank would read as a bug either way.
   */
  test('speciesLabel shows a name where there is one and the stored key where there is not', () => {
    expect(speciesLabel(INVENTED)).toBe(INVENTED)
    expect(speciesLabel(RETIRED)).toBe('Half-Orc')
    expect(speciesLabel('human')).toBe('Human')
    expect(speciesLabel('orc')).toBe('Orc')
  })
})
