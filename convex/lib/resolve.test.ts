import { describe, expect, test } from 'vitest'

import {
  CLASSES,
  MAX_LIBRARY_LEVEL,
  SUBCLASS_LEVEL,
  findClass,
  type ClassKey,
} from './classes'
import { LIBRARY, librarySheet } from './library'
import { RACE_KEYS, race } from './races'
// Reached from a test file, which `corpusGuard.test.ts` excludes from its sweep on
// purpose: the confinement rule is about production modules crossing the boundary, and
// a test that checks `groupOf` against the corpus has to be able to see the corpus.
import { bestiaryCategoryOf, bestiaryEntry } from './bestiary'
import { groupOf, presetExtras, presetOf, resolveSheet } from './resolve'
import {
  MAX_LEVEL,
  MIN_LEVEL,
  SPEED_FEET,
  categoryOf,
  defaultNpcSheet,
  defaultPcSheet,
  noSkills,
  rollShapeOf,
  sheetProblem,
  skillProficienciesOf,
  speedOf,
  storedSheetProblem,
} from './sheet'
import type {
  AbilityScores,
  NpcSheet,
  PcSheet,
  PresetOverrides,
  PresetSheet,
  SheetEntry,
  StoredSheet,
} from './sheet'
import type { ChallengeRating } from './creatures'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

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

function entry(overrides: Partial<SheetEntry> = {}): SheetEntry {
  return {
    id: 'dm-1',
    name: 'A gift from the DM',
    text: 'Handed over between sessions.',
    roll: null,
    level: null,
    catalogueKey: null,
    ...overrides,
  }
}

const CHAMPION_3 = LIBRARY.fighter.paths.champion[3]

// ---------------------------------------------------------------------------
// The order, which is the whole design
// ---------------------------------------------------------------------------

describe('library, then race, then the DM', () => {
  /**
   * **The order is load-bearing and this is the test that pins it.** Each case
   * below picks a field all three stages touch and asserts each stage in turn,
   * so a failure says which pair got swapped rather than merely that a number
   * is wrong:
   *
   * - the library alone, with a race that changes nothing;
   * - the library plus the race, which must be *added to* the library's number
   *   rather than replacing it, or an Elf's +2 would become part of a base the
   *   next level overwrites;
   * - and the DM's override, which is the final word — that is what makes "the
   *   DM can always change a player's sheet" true of a character whose stats
   *   are read live.
   */
  test('an override beats the race, which beats the library, on the abilities', () => {
    const dexterous: AbilityScores = { str: 8, dex: 20, con: 8, int: 8, wis: 8, cha: 8 }

    const plain = resolve(preset({ race: 'human' }))
    expect(plain.abilities).toEqual(CHAMPION_3.abilities)

    const elf = resolve(preset({ race: 'elf' }))
    expect(elf.abilities.dex).toBe(CHAMPION_3.abilities.dex + 2)

    const overridden = resolve(preset({ race: 'elf', overrides: { abilities: dexterous } }))
    expect(overridden.abilities).toEqual(dexterous)
    // Not `library + race + override` — the DM's number is the number, and the
    // Elf's +2 must not be added on top of it a second time.
    expect(overridden.abilities.dex).toBe(20)
  })

  test('an override beats the race, which beats the library, on the hit points', () => {
    const level = 3
    const plain = resolve(preset({ race: 'human', level }))
    expect(plain.maxHp).toBe(CHAMPION_3.maxHp)

    const dwarf = resolve(preset({ race: 'dwarf', level }))
    expect(dwarf.maxHp).toBe(CHAMPION_3.maxHp + level)

    const overridden = resolve(preset({ race: 'dwarf', level, overrides: { maxHp: 99 } }))
    expect(overridden.maxHp).toBe(99)
  })

  test('an override beats the race, which beats the library, on the speed', () => {
    expect(resolve(preset({ race: 'human' })).speed).toBe(SPEED_FEET)
    expect(resolve(preset({ race: 'goliath' })).speed).toBe(SPEED_FEET + 10)
    expect(resolve(preset({ race: 'goliath', overrides: { speed: 25 } })).speed).toBe(25)
  })

  test('an override replaces the library on every field it names', () => {
    const overrides: PresetOverrides = {
      armourClass: 11,
      maxHp: 7,
      abilities: { str: 3, dex: 3, con: 3, int: 3, wis: 3, cha: 3 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
      skillProficiencies: { ...noSkills(), stealth: true },
      speed: 5,
      hitDice: { count: 2, faces: 6 },
    }
    const resolved = resolve(preset({ overrides }))
    expect(resolved.armourClass).toBe(11)
    expect(resolved.maxHp).toBe(7)
    expect(resolved.abilities).toEqual(overrides.abilities)
    expect(resolved.saveProficiencies).toEqual(overrides.saveProficiencies)
    expect(resolved.skillProficiencies).toEqual(overrides.skillProficiencies)
    expect(resolved.speed).toBe(5)
    expect(resolved.hitDice).toEqual({ count: 2, faces: 6 })
    // The selections are not overridable — level, class and race are changed by
    // changing them, and `presetOverridesValidator` deliberately has no field
    // for any of the three.
    expect(resolved.level).toBe(3)
    expect(resolved.className).toContain('Champion')
  })

  /**
   * The promise `presetOverridesValidator` makes in as many words: "bumping a
   * boss-fight armour class should not be undone by the DM awarding a level
   * five minutes later". A stored sheet would satisfy this trivially; a sheet
   * read live out of the library only satisfies it because the override is
   * applied *after* the lookup rather than baked in at write time.
   */
  test('an override survives a level change, and an archetype change', () => {
    const overrides: PresetOverrides = { armourClass: 25, maxHp: 200 }
    for (const level of [2, 3, 4, 5, 20]) {
      const resolved = resolve(preset({ level, overrides }))
      expect(resolved.armourClass, `level ${level}`).toBe(25)
      expect(resolved.maxHp, `level ${level}`).toBe(200)
    }
    const swapped = resolve(preset({ subclassKey: 'battle-master', overrides }))
    expect(swapped.armourClass).toBe(25)
    expect(swapped.maxHp).toBe(200)
  })

  /**
   * Appended rather than replacing, which is the other half of the same
   * promise: a plot item handed out at level 3 has to survive the level 4
   * lookup instead of being overwritten by it.
   */
  test('extraFeats and extraSpells are appended to what the library and the race gave', () => {
    const gift = entry({ id: 'dm-blade', name: 'The Sunder Blade' })
    const cantrip = entry({ id: 'dm-cantrip', name: 'A Borrowed Cantrip', level: 0 })

    const plain = resolve(preset({ race: 'tiefling' }))
    const resolved = resolve(
      preset({ race: 'tiefling', overrides: { extraFeats: [gift], extraSpells: [cantrip] } }),
    )

    expect(resolved.feats).toHaveLength(plain.feats.length + 1)
    expect(resolved.spells).toHaveLength(plain.spells.length + 1)
    // Last, and with everything that was there before still in front of it —
    // including the Tiefling's Thaumaturgy, which the race appended.
    expect(resolved.feats.at(-1)).toEqual(gift)
    expect(resolved.spells.at(-1)).toEqual(cantrip)
    expect(resolved.feats.slice(0, -1)).toEqual(plain.feats)
    expect(resolved.spells.slice(0, -1)).toEqual(plain.spells)
    expect(resolved.spells.some((e) => e.name === 'Thaumaturgy')).toBe(true)
  })

  test('an empty overrides object changes nothing at all', () => {
    expect(resolve(preset({ overrides: {} }))).toEqual(resolve(preset()))
    expect(resolve(preset({ overrides: undefined }))).toEqual(resolve(preset()))
  })

  /**
   * `resolveSheet` is called on every read of a character, so it must not write
   * back into the module-level library it read from. A resolved sheet handed to
   * a caller that sorts its feats would otherwise reorder the premade sheet for
   * every character in every game in the process.
   */
  test('does not alias or mutate the library it read from', () => {
    const resolved = resolve(preset())
    resolved.abilities.str = 30
    resolved.saveProficiencies.str = !resolved.saveProficiencies.str
    resolved.hitDice.count = 19
    resolved.feats.push(entry())
    resolved.spells.push(entry())

    expect(CHAMPION_3.abilities.str).not.toBe(30)
    expect(CHAMPION_3.hitDice.count).toBe(3)
    expect(resolve(preset()).abilities).toEqual(CHAMPION_3.abilities)
    expect(resolve(preset()).feats).toHaveLength(CHAMPION_3.feats.length + 1) // + the race trait
  })
})

// ---------------------------------------------------------------------------
// Selections the library cannot honour
// ---------------------------------------------------------------------------

describe('a selection the library no longer has', () => {
  /**
   * `librarySheet` returns null for a retired archetype **by design** — a
   * subclass key is stored on a character, so renaming one has to leave the
   * characters that chose it readable. `resolve.ts` says what that costs them:
   * "the character keeps its level, its name and its hit points and loses only
   * the numbers it was borrowing — which is far better than a thrown error on a
   * query that paints a screen".
   */
  test('a retired archetype resolves to a default sheet that keeps the level and the class', () => {
    const resolved = resolve(preset({ subclassKey: 'trickster', level: 4 }))
    expect(resolved.kind).toBe('pc')
    expect(resolved.level).toBe(4)
    expect(resolved.className).toBe('Fighter')
    expect(resolved.hitDice).toEqual({ count: 4, faces: findClass('fighter')!.hitDieFaces })
    expect(sheetProblem(resolved)).toBeNull()
  })

  /**
   * DEFECT (resolve.ts:69 and :162). The comment quoted above says "a class **or**
   * an archetype the library no longer has", and `librarySheet` returns null for
   * an unknown class for exactly that reason — but `findClass` is a
   * `Map.get(…)!`, so a class key that has been retired from `CLASSES` comes back
   * as `undefined` and `classLabel` dereferences `.name` on it. The resolver
   * throws a TypeError on the one path it documents itself as handling.
   *
   * How a document gets there: `classKeyValidator` is a union of literals, so
   * nothing can *write* an unknown key today. Retiring a class tomorrow is a
   * one-line edit to `CLASS_KEYS` that turns every stored character of that
   * class into a query that throws — and the query that throws is
   * `characters.list`, which paints the whole party panel, so one retired class
   * takes the screen down for everybody rather than for the character that has
   * it.
   */
  test('a retired class resolves rather than throwing', () => {
    // Two shapes, because they fail in two different places: without an
    // archetype it is `classLabel` reading `.name` off an undefined class, and
    // with one it is `librarySheet` reading `.paths` off an undefined library.
    const withoutArchetype = preset({ classKey: 'druid' as ClassKey, subclassKey: null, level: 3 })
    const withArchetype = preset({ classKey: 'druid' as ClassKey, subclassKey: 'moon', level: 5 })

    expect(() => resolve(withoutArchetype)).not.toThrow()
    expect(() => resolve(withArchetype)).not.toThrow()

    const resolved = resolve(withoutArchetype)
    expect(resolved.kind).toBe('pc')
    expect(resolved.level).toBe(3)
    expect(sheetProblem(resolved)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

describe('levels the library does not cover', () => {
  /**
   * `clampLevel` runs on a number that has already been through
   * `storedSheetProblem` in the ordinary case — but the ordinary case is not the
   * only one. A DM raising a character past the library's ceiling is expected,
   * and a level that is NaN or infinite is what a corrupt document or a client
   * bug produces. None of them may produce a sheet the validator then refuses,
   * because that would make the character unreadable rather than merely odd.
   */
  test('every silly level resolves to a sheet that validates', () => {
    const levels = [
      -1000,
      -1,
      0,
      1,
      5,
      6,
      20,
      21,
      1000,
      2.4,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]
    for (const level of levels) {
      for (const subclassKey of [null, 'champion']) {
        const resolved = resolve(preset({ level, subclassKey }))
        const where = `level ${level} / ${subclassKey}`
        expect(sheetProblem(resolved), where).toBeNull()
        expect(Number.isInteger(resolved.level), where).toBe(true)
        expect(resolved.level, where).toBeGreaterThanOrEqual(MIN_LEVEL)
        expect(resolved.level, where).toBeLessThanOrEqual(MAX_LEVEL)
      }
    }
  })

  test('clamps below 1 to 1 and above 20 to 20, and reads anything non-finite as level 1', () => {
    expect(resolve(preset({ level: 0 })).level).toBe(1)
    expect(resolve(preset({ level: -50 })).level).toBe(1)
    expect(resolve(preset({ level: 21 })).level).toBe(20)
    expect(resolve(preset({ level: 1000 })).level).toBe(20)
    expect(resolve(preset({ level: 2.6 })).level).toBe(3)

    /**
     * `clampLevel` rejects **every** non-finite value before it clamps, so
     * positive infinity reads as level 1 rather than as level 20. That is
     * deliberately unlike `proficiencyBonus` in sheet.ts, whose comment says the
     * infinities are left to the clamp on purpose and come out as 20 and 1.
     *
     * The two never disagree in practice — a resolved sheet's level has already
     * been clamped to 1 before any bonus is worked out — and level 1 is the
     * better answer of the two here: an infinite level is corruption rather than
     * a very high level, and reading it as "the least this could mean" beats
     * silently promoting the character to 20th.
     */
    expect(resolve(preset({ level: Number.NaN })).level).toBe(1)
    expect(resolve(preset({ level: Number.POSITIVE_INFINITY })).level).toBe(1)
    expect(resolve(preset({ level: Number.NEGATIVE_INFINITY })).level).toBe(1)
  })

  /**
   * Past 5 the character stops gaining rather than falling back to nothing, so
   * a level 12 fighter reads as the level 5 sheet with the level printed on it.
   */
  test('a level past the library ceiling keeps the level 5 numbers', () => {
    const top = LIBRARY.fighter.paths.champion[MAX_LIBRARY_LEVEL]
    for (const level of [6, 11, 20]) {
      const resolved = resolve(preset({ level }))
      expect(resolved.level, `level ${level}`).toBe(level > MAX_LEVEL ? MAX_LEVEL : level)
      expect(resolved.armourClass, `level ${level}`).toBe(top.armourClass)
      expect(resolved.maxHp, `level ${level}`).toBe(top.maxHp)
    }
  })

  /**
   * The mid-decision case the library documents: sitting at level 2 or above
   * with nothing chosen shows level 1 rather than a sheet the library does not
   * contain. Worth pinning because the alternative — inventing an
   * archetype-less level 3 — is the change somebody would make to "fix" it.
   */
  test('a preset above level 1 with no archetype gets the level 1 sheet', () => {
    for (const level of [SUBCLASS_LEVEL, 3, 4, 5]) {
      const resolved = resolve(preset({ subclassKey: null, level }))
      const base = LIBRARY.fighter.base
      expect(resolved.armourClass, `level ${level}`).toBe(base.armourClass)
      expect(resolved.maxHp, `level ${level}`).toBe(base.maxHp)
      expect(resolved.abilities, `level ${level}`).toEqual(base.abilities)
      // The level is the character's own, not the sheet it is borrowing.
      expect(resolved.level, `level ${level}`).toBe(level)
      expect(resolved.className, `level ${level}`).toBe('Fighter')
      expect(sheetProblem(resolved), `level ${level}`).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// The shapes that are not presets
// ---------------------------------------------------------------------------

describe('resolveSheet passes through everything that is not a preset', () => {
  test('a stored pc or npc sheet comes back as itself', () => {
    const pc = defaultPcSheet()
    const npc = defaultNpcSheet()
    expect(resolveSheet({ sheet: pc })).toBe(pc)
    expect(resolveSheet({ sheet: npc })).toBe(npc)
  })

  test('a document with no sheet reads as the default player character', () => {
    expect(resolveSheet({})).toEqual(defaultPcSheet())
    expect(resolveSheet({ sheet: undefined })).toEqual(defaultPcSheet())
  })

  /**
   * A Milestone 3 character, exactly as the table holds one: `kind: 'pc'` with
   * neither `skillProficiencies` nor `speed`, because both fields were added
   * afterwards and a required field cannot be added to a table that already has
   * rows. It has to resolve, validate, read as thirteen untrained skills and
   * read as the D&D Lite 35 feet.
   */
  test('a legacy sheet with no skills and no speed resolves and reads as the defaults', () => {
    const legacy: StoredSheet = {
      kind: 'pc',
      level: 4,
      className: 'Rogue',
      abilities: { str: 10, dex: 16, con: 12, int: 13, wis: 11, cha: 14 },
      saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      armourClass: 15,
      maxHp: 27,
      hitDice: { count: 4, faces: 8 },
      feats: [],
      spells: [],
    }
    const resolved = resolveSheet({ sheet: legacy })
    expect(resolved).toBe(legacy)
    expect(sheetProblem(resolved)).toBeNull()
    expect(skillProficienciesOf(resolved)).toEqual(noSkills())
    expect(Object.values(skillProficienciesOf(resolved)).every((flag) => flag === false)).toBe(true)
    expect(speedOf(resolved)).toBe(SPEED_FEET)
  })
})

describe('presetOf', () => {
  test('returns the selections for a preset and null for anything else', () => {
    const selections = preset()
    expect(presetOf({ sheet: selections })).toBe(selections)
    expect(presetOf({ sheet: defaultPcSheet() })).toBeNull()
    expect(presetOf({ sheet: defaultNpcSheet() })).toBeNull()
    expect(presetOf({})).toBeNull()
  })
})

describe('presetExtras', () => {
  /**
   * The two strings a premade sheet carries that `PcSheet` has nowhere to put.
   * They come back beside the sheet rather than on it, so they need their own
   * check that they track the *same* library sheet the numbers came from — a
   * kit belonging to the level below is the kind of mismatch nobody notices
   * until somebody asks what rope they have.
   */
  test('hands back the kit and the note for the sheet the selections resolve to', () => {
    for (const classKey of Object.keys(LIBRARY) as ClassKey[]) {
      for (const subclass of findClass(classKey)!.subclasses) {
        for (const level of [2, 3, 4, 5]) {
          const stored = preset({ classKey, subclassKey: subclass.key, level })
          const source = librarySheet(classKey, subclass.key, level)
          expect(presetExtras({ sheet: stored }), `${classKey}/${subclass.key}/${level}`).toEqual({
            equipment: source?.equipment,
            levellingNotes: source?.levellingNotes,
          })
        }
      }
    }
  })

  test('is null for anything that is not a preset, and for a retired archetype', () => {
    expect(presetExtras({})).toBeNull()
    expect(presetExtras({ sheet: defaultPcSheet() })).toBeNull()
    expect(presetExtras({ sheet: defaultNpcSheet() })).toBeNull()
    expect(presetExtras({ sheet: preset({ subclassKey: 'trickster' }) })).toBeNull()
  })

  /**
   * Past the library's ceiling the character keeps the level 5 kit, matching
   * what the numbers do — the two must not disagree about which sheet is being
   * borrowed.
   */
  test('follows the numbers past the library ceiling', () => {
    const top = LIBRARY.fighter.paths.champion[MAX_LIBRARY_LEVEL]
    for (const level of [5, 9, 20]) {
      expect(presetExtras({ sheet: preset({ level }) })?.equipment, `level ${level}`).toBe(
        top.equipment,
      )
    }
  })
})

describe('a resolved sheet is complete', () => {
  /**
   * `pcSheetValidator` says of `skillProficiencies` and `speed` that "a
   * resolved sheet always carries both" — they are optional only because the
   * table already holds Milestone 3 rows without them. Every ordinary
   * resolution has to make that true, or a client reading the field rather than
   * the accessor gets `undefined` from a sheet the server built this second.
   */
  test('every library-backed resolution carries both optional fields', () => {
    for (const classKey of Object.keys(LIBRARY) as ClassKey[]) {
      for (const level of [1, 5]) {
        const subclassKey = level < SUBCLASS_LEVEL ? null : findClass(classKey)!.subclasses[0].key
        const resolved = resolve(preset({ classKey, subclassKey, level }))
        expect(resolved.skillProficiencies, `${classKey}/${level}`).toBeDefined()
        expect(resolved.speed, `${classKey}/${level}`).toBeDefined()
        expect(Object.keys(resolved.skillProficiencies ?? {}), `${classKey}/${level}`).toHaveLength(
          13,
        )
      }
    }
  })

  /**
   * The fallback path is the exception, and it is worth stating rather than
   * leaving to be discovered. A retired archetype takes the `defaultPcSheet()`
   * branch, which sets no `skillProficiencies`; `applyRace` spreads the sheet
   * without adding one and `applyOverrides` returns early when there are no
   * overrides, so the field is absent on the sheet the server hands over.
   *
   * Harmless today only because every reader goes through
   * `skillProficienciesOf` — asserted here, since that is the property the app
   * actually depends on. `speed`, by contrast, `applyRace` always sets, so the
   * two optional fields behave differently on this one path.
   */
  test('and a fallback resolution still reads as thirteen untrained skills', () => {
    const resolved = resolve(preset({ subclassKey: 'trickster', level: 4 }))
    expect(resolved.speed).toBe(SPEED_FEET)
    expect(skillProficienciesOf(resolved)).toEqual(noSkills())
    expect(speedOf(resolved)).toBe(SPEED_FEET)
    expect(sheetProblem(resolved)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The two validators meet
// ---------------------------------------------------------------------------

describe('a preset the store would accept always resolves to a sheet it would accept', () => {
  /**
   * The pair that has to hold together: `storedSheetProblem` checks the
   * *selections* and `sheetProblem` checks what they *resolve to*, and the
   * mutation runs both. A preset that passed the first and failed the second
   * would be a character the DM could save and nobody could read.
   */
  test('across every class, archetype and level the store permits', () => {
    const problems: string[] = []
    for (const classKey of Object.keys(LIBRARY) as ClassKey[]) {
      for (const subclass of findClass(classKey)!.subclasses) {
        for (const level of [2, 3, 4, 5, 6, 20]) {
          const stored = preset({ classKey, subclassKey: subclass.key, level })
          const where = `${classKey}/${subclass.key}/${level}`
          if (storedSheetProblem(stored)) {
            problems.push(`${where} refused on write: ${storedSheetProblem(stored)?.message}`)
            continue
          }
          const problem = sheetProblem(resolve(stored))
          if (problem) problems.push(`${where} unreadable: ${problem.path} — ${problem.message}`)
        }
      }
      const level1 = preset({ classKey, subclassKey: null, level: 1 })
      expect(storedSheetProblem(level1), classKey).toBeNull()
      expect(sheetProblem(resolve(level1)), classKey).toBeNull()
    }
    expect(problems).toEqual([])
  })

  /**
   * And the resolver really is consulting the library rather than a default
   * that happens to validate — the assertion that keeps the test above from
   * passing over a resolver that returned `defaultPcSheet()` for everything.
   */
  test('and the numbers come from the library rather than from the default sheet', () => {
    const fallback = defaultPcSheet()
    for (const classKey of Object.keys(LIBRARY) as ClassKey[]) {
      const [first] = findClass(classKey)!.subclasses
      const source = librarySheet(classKey, first.key, 5)
      expect(source, classKey).not.toBeNull()
      const resolved = resolve(preset({ classKey, subclassKey: first.key, level: 5 }))
      expect(resolved.maxHp, classKey).toBe(source?.maxHp)
      expect(resolved.maxHp, classKey).not.toBe(fallback.maxHp)
      expect(resolved.hitDice.faces, classKey).toBe(findClass(classKey)!.hitDieFaces)
      expect(resolved.className, classKey).toBe(
        `${findClass(classKey)!.name} (${first.name})`,
      )
    }
  })

  /** The race a character picked is on the sheet, whichever class it was pinned to. */
  test('and the race is applied for every class', () => {
    for (const classKey of Object.keys(LIBRARY) as ClassKey[]) {
      const source = librarySheet(classKey, null, 1)
      const elf = resolve(preset({ classKey, subclassKey: null, level: 1, race: 'elf' }))
      expect(elf.abilities.dex, classKey).toBe((source?.abilities.dex ?? 0) + 2)
      expect(elf.feats.some((e) => e.name === race('elf').traitName), classKey).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The entry taxonomy across the three layers
//
// ⚠️ **`category` and `toHit` are optional on a `SheetEntry`, so every assertion
// here has to be about presence rather than value.** A `withId` that rebuilt an
// entry field by field instead of spreading it would drop both, and the resolved
// sheet would still validate, still render and still pass every other test in
// this file — the lines would simply have quietly reverted to their pre-milestone
// shape on the way through the resolver.
// ---------------------------------------------------------------------------

describe('the category survives every layer of resolution', () => {
  /** The trait `applyRace` mints for every race, whichever race it is. */
  function traitOf(sheet: PcSheet, key: string): SheetEntry {
    const found = sheet.feats.find((line) => line.id === `race:${key}`)
    if (!found) throw new Error(`no trait line for ${key}`)
    return found
  }

  /**
   * **A race trait is a `passive`, and that is the only coherent answer rather
   * than a choice.** It is built out of `traitName` and `traitText` and has no
   * roll by construction, so `entriesProblem` would refuse it as anything else. A
   * race whose trait genuinely rolls something grants a feat or a spell instead,
   * which is exactly what the Dragonborn's breath weapon already does.
   *
   * Asserted for all eight rather than for one, because the trait is minted in a
   * single place and a regression there is a regression for every character in
   * every game at once.
   */
  test('every race trait resolves to a passive that carries no rolls', () => {
    for (const key of RACE_KEYS) {
      const sheet = resolve(preset({ race: key }))
      const trait = traitOf(sheet, key)
      const built = trait as unknown as Record<string, unknown>
      expect(trait.category, key).toBe('passive')
      expect(trait.roll, key).toBeNull()
      expect('toHit' in built, `${key} trait carries a to-hit`).toBe(false)
      expect(trait.name, key).toBe(race(key).traitName)
    }
  })

  /** Anti-vacuity: eight races, eight traits, and the lookup really found them. */
  test('and there is a trait line for every one of the eight', () => {
    expect(RACE_KEYS.length).toBe(8)
    const found = RACE_KEYS.map((key) => traitOf(resolve(preset({ race: key })), key).name)
    expect(new Set(found).size).toBe(RACE_KEYS.length)
  })

  /**
   * ⚠️ **The granted entries, which are the ones that could actually lose a
   * category.** The trait is built inside `applyRace` with `category: 'passive'`
   * written in the literal, so it cannot be dropped; a granted feat or spell is
   * declared in `races.ts` and copied through `withId`, which is a spread — and a
   * spread is exactly what stops being one when somebody "tidies" it into a
   * field-by-field rebuild.
   *
   * Compared against the source entry rather than against a hard-coded string, so
   * the test says "the category the corpus declared arrived on the sheet" rather
   * than "the sheet says passive", which would keep passing over a resolver that
   * had stopped reading the corpus at all.
   */
  test('a granted feat or spell keeps the category its race declared', () => {
    let checked = 0
    for (const key of RACE_KEYS) {
      const chosen = race(key)
      const sheet = resolve(preset({ race: key }))
      const granted = [
        ...(chosen.grantedFeats ?? []).map((source) => ({ source, list: sheet.feats })),
        ...(chosen.grantedSpells ?? []).map((source) => ({ source, list: sheet.spells })),
      ]
      for (const { source, list } of granted) {
        checked += 1
        const line = list.find((candidate) => candidate.name === source.name)
        expect(line, `${key}: ${source.name} missing from the resolved sheet`).toBeDefined()
        const built = line as unknown as Record<string, unknown>
        expect('category' in built, `${key}: ${source.name} lost its category`).toBe(true)
        expect(line?.category, `${key}: ${source.name}`).toBe(source.category)
        expect('toHit' in built, `${key}: ${source.name} to-hit key`).toBe(
          source.toHit !== undefined,
        )
        expect(line?.toHit, `${key}: ${source.name}`).toBe(source.toHit)
        // And it really came through the race layer, under the race prefix.
        expect(line?.id.startsWith(`race-${key}:`), `${key}: ${source.name} id ${line?.id}`).toBe(
          true,
        )
      }
    }
    // Not vacuous: two races grant entries — the Tiefling a cantrip and the
    // Dragonborn a breath weapon — and this loop would be empty if either lost it.
    expect(checked).toBeGreaterThanOrEqual(2)
  })

  /** The two grants, named, so the loop above is anchored to something concrete. */
  test('the Dragonborn’s breath weapon is an action and the Tiefling’s cantrip a passive', () => {
    const dragonborn = resolve(preset({ race: 'dragonborn' }))
    const breath = dragonborn.feats.find((line) => line.name === 'Breath Weapon')
    expect(breath?.category).toBe('action')
    expect(breath?.roll).not.toBeNull()
    expect('toHit' in (breath as unknown as Record<string, unknown>)).toBe(false)

    const tiefling = resolve(preset({ race: 'tiefling' }))
    const cantrip = tiefling.spells.find((line) => line.name === 'Thaumaturgy')
    expect(cantrip?.category).toBe('passive')
    expect(cantrip?.roll).toBeNull()
  })

  /**
   * The library layer, for completeness — `withId` is one function and serves all
   * three sources, so a rebuild there would take the premade sheets with it. Every
   * `lib:` line on a resolved sheet has to carry the category its `LibrarySheet`
   * declared, and a weapon has to arrive with its to-hit intact.
   */
  test('a library entry keeps the category and to-hit its sheet declared', () => {
    const at = { classKey: 'fighter' as ClassKey, subclassKey: 'champion', level: 3 }
    const found = librarySheet(at.classKey, at.subclassKey, at.level)
    expect(found, 'the fixture sheet is missing').toBeDefined()
    const sheet = resolve(preset({ ...at, race: 'human' }))

    let checked = 0
    for (const source of [...(found?.feats ?? []), ...(found?.spells ?? [])]) {
      const line = [...sheet.feats, ...sheet.spells].find(
        (candidate) => candidate.id.startsWith('lib:') && candidate.name === source.name,
      )
      expect(line, `${source.name} missing`).toBeDefined()
      const built = line as unknown as Record<string, unknown>
      checked += 1
      expect('category' in built, `${source.name} lost its category`).toBe(true)
      expect(line?.category, source.name).toBe(source.category)
      expect('toHit' in built, `${source.name} to-hit key`).toBe(source.toHit !== undefined)
      expect(line?.toHit, source.name).toBe(source.toHit)
    }
    expect(checked).toBeGreaterThan(0)
    // The Champion at 3 really does have a weapon, so the to-hit half above is
    // exercised rather than being a loop over passives.
    expect(
      [...sheet.feats, ...sheet.spells].some(
        (line) => line.id.startsWith('lib:') && line.category === 'weapon',
      ),
    ).toBe(true)
  })

  /**
   * ⚠️ **The DM's own entries are appended unmodified**, which is what makes an
   * override the last word. `withOverrides` spreads `extraFeats` and `extraSpells`
   * straight onto the resolved lists — it does not mint an id, does not derive a
   * category and does not compose a to-hit — so a weapon the DM wrote arrives on
   * the sheet byte for byte as it was stored.
   *
   * Asserted with `toEqual` against the stored object rather than field by field,
   * so a field the merge starts dropping in future fails here without anybody
   * having to add it to a list.
   */
  test('the DM’s extra entries arrive exactly as they were stored', () => {
    const weapon = entry({
      id: 'dm-weapon',
      name: 'Ancestral Greatsword',
      text: 'A blade the party found in the barrow.',
      roll: '2d6+STR',
      category: 'weapon',
      toHit: '1d20+STR+PROF',
    })
    const declared = entry({
      id: 'dm-boon',
      name: 'The Duke’s Favour',
      text: 'Doors open in the capital.',
      roll: null,
      category: 'passive',
    })
    const spell = entry({
      id: 'dm-spell',
      name: 'Borrowed Fire',
      text: 'Once a day, from the amulet.',
      roll: '3d6',
      level: 2,
      category: 'action',
    })

    const sheet = resolve(
      preset({ overrides: { extraFeats: [weapon, declared], extraSpells: [spell] } }),
    )

    expect(sheet.feats.find((line) => line.id === 'dm-weapon')).toEqual(weapon)
    expect(sheet.feats.find((line) => line.id === 'dm-boon')).toEqual(declared)
    expect(sheet.spells.find((line) => line.id === 'dm-spell')).toEqual(spell)

    // Presence of the keys, separately, because `toEqual` treats an absent key and
    // a key holding `undefined` as the same thing and Convex does not.
    const stored = sheet.feats.find((line) => line.id === 'dm-weapon') as unknown as
      Record<string, unknown>
    expect('category' in stored).toBe(true)
    expect('toHit' in stored).toBe(true)
    const plain = sheet.feats.find((line) => line.id === 'dm-boon') as unknown as
      Record<string, unknown>
    expect('toHit' in plain).toBe(false)

    // And the whole sheet is still storable, which is what the arity rule decides.
    expect(sheetProblem(sheet)).toBeNull()
  })

  /**
   * A legacy override entry — neither field — is appended just as unmodified, and
   * must not acquire a category on the way through. This is the shape a preset
   * stored before this milestone actually holds.
   */
  test('and a pre-milestone extra entry is not given a category on the way through', () => {
    const legacy: SheetEntry = {
      id: 'dm-old',
      name: 'A gift from before',
      text: 'Stored in Milestone 4.',
      roll: '1d6',
      level: null,
      catalogueKey: null,
    }
    expect('category' in (legacy as unknown as Record<string, unknown>)).toBe(false)

    const sheet = resolve(preset({ overrides: { extraFeats: [legacy] } }))
    const line = sheet.feats.find((candidate) => candidate.id === 'dm-old') as unknown as
      Record<string, unknown>
    expect(line).toBeDefined()
    expect('category' in line).toBe(false)
    expect('toHit' in line).toBe(false)
    expect(sheetProblem(sheet)).toBeNull()
  })

  /**
   * And the whole resolved sheet satisfies the arity rule at every coordinate the
   * library covers, for every race — which is the property the three layers have
   * to hold *jointly*. Each layer is coherent on its own above; this is the one
   * that would catch a race trait landing on a class whose sheet already used the
   * id, or an override merged into the wrong list.
   */
  test('and every resolved combination satisfies the arity rule', () => {
    const problems: string[] = []
    for (const key of RACE_KEYS) {
      for (const definition of CLASSES) {
        for (const level of [MIN_LEVEL, SUBCLASS_LEVEL, MAX_LIBRARY_LEVEL]) {
          const subclassKey = level < SUBCLASS_LEVEL ? null : definition.subclasses[0].key
          const sheet = resolve(
            preset({ race: key, classKey: definition.key, subclassKey, level }),
          )
          const problem = sheetProblem(sheet)
          if (problem) {
            problems.push(`${key}/${definition.key}/${level}: ${problem.path} — ${problem.message}`)
          }
          for (const line of [...sheet.feats, ...sheet.spells]) {
            const shape = rollShapeOf(categoryOf(line))
            const where = `${key}/${definition.key}/${level} → ${line.name}`
            if (shape.toHit !== (line.toHit !== undefined)) problems.push(`${where} toHit`)
            if (shape.roll !== (line.roll !== null)) problems.push(`${where} roll`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// groupOf — which of the DM's three headings a character sits under
// ---------------------------------------------------------------------------
//
// ⚠️ **`group` is a *display* discriminator and `kind` is a *secrecy* one, and the whole
// reason this function is allowed a safe default is that only the DM ever receives a
// group that is not `'character'`.** A player's payload has had every creature filtered
// out of it by `maySeeCharacter` before `groupOf` is consulted, so a wrong answer here
// misfiles a row in the DM's selector and can never leak one. Contrast `isMonsterSheet`,
// whose default is fail-closed because getting *it* wrong publishes a dragon.
//
// That is the argument for the default being safe. It is not an argument for the answers
// being untested — a creature filed under the wrong heading is a DM who cannot find their
// own monster — and the four stored kinds do not map onto the three groups in any way a
// reader can guess, which is what the table below is for.

/**
 * One key from each of the corpus's three categories.
 *
 * ⚠️ **Hand-copied, and each one checked against `bestiaryEntry` before it is used.**
 * A retired key resolves to `'monster'` through the tolerated-miss path, so a test whose
 * fixture key had quietly left the corpus would go on passing for two of the three
 * categories and would be asserting the fallback rather than the lookup. The membership
 * check is what tells those two apart.
 */
const MONSTER_KEY = 'dire-wolf'
const ENEMY_KEY = 'town-guard'
const SOCIAL_KEY = 'innkeeper'

function bestiary(entryKey: string, cr: ChallengeRating = 1): StoredSheet {
  return { kind: 'bestiary', entryKey, cr }
}

function creature(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return { ...defaultNpcSheet(), ...overrides }
}

describe('groupOf places every stored kind under a heading', () => {
  /**
   * The two hero kinds and the Milestone 1 document with no sheet at all. A `preset` is a
   * set of selections over the *player-character* library, so it is a character however
   * it resolves; a sheet-less row predates NPCs existing, so every one of them is a hero.
   */
  test('a hand-built hero, a premade hero and a sheet-less document are all characters', () => {
    expect(groupOf({ sheet: defaultPcSheet() })).toBe('character')
    expect(groupOf({ sheet: preset() })).toBe('character')
    expect(groupOf({})).toBe('character')
    expect(groupOf({ sheet: undefined })).toBe('character')
  })

  /**
   * ⚠️ **A hand-built creature is grouped by what the DM said, and by `'npc'` when they
   * were never asked.**
   *
   * `defaultNpcSheet` deliberately omits the field rather than writing `'npc'` into it,
   * so absent means *unanswered* rather than *answered npc* — which is what lets the
   * create dialog put its own answer in without the default having to be spread over
   * first. Both readings produce the same group today; only one of them survives a form
   * that sets the field afterwards.
   */
  test('a hand-built creature reads its stored group, and defaults to npc without one', () => {
    expect(groupOf({ sheet: creature({ group: 'monster' }) })).toBe('monster')
    expect(groupOf({ sheet: creature({ group: 'npc' }) })).toBe('npc')

    const unanswered = creature()
    expect('group' in unanswered, 'defaultNpcSheet has started writing a group').toBe(false)
    expect(groupOf({ sheet: unanswered })).toBe('npc')
  })

  /**
   * ⚠️ **A linked creature is grouped by the *corpus category of the file its entry came
   * out of*, which is a fact the character document does not carry at all.**
   *
   * The category is declared on the file rather than on the entry, so this is the one
   * group answer that cannot be read off the row — which is why `groupOf` lives in
   * `lib/resolve.ts` beside the corpus rather than in `lib/sheet.ts` beside every other
   * sheet question, and why the client is sent the answer instead of computing it.
   *
   * Two of the three categories collapse onto `'monster'`: a town guard is an `enemy` in
   * the corpus and a monster in the DM's selector, because the selector's three headings
   * are about how the DM *uses* a creature rather than about which file it was typed
   * into.
   */
  test('a linked creature is grouped by its corpus category, all three of them', () => {
    const cases: [string, string, 'npc' | 'monster'][] = [
      [MONSTER_KEY, 'monster', 'monster'],
      [ENEMY_KEY, 'enemy', 'monster'],
      [SOCIAL_KEY, 'social', 'npc'],
    ]

    for (const [key, category, group] of cases) {
      // Anti-vacuity, both halves: the entry is really in the corpus, and it is really in
      // the category this case claims. Without these a retired or refiled key would make
      // the assertion below pass through the fallback.
      expect(bestiaryEntry(key), `${key} is no longer in the bestiary`).toBeDefined()
      expect(bestiaryCategoryOf(key), `${key} has moved category`).toBe(category)

      expect(groupOf({ sheet: bestiary(key) }), key).toBe(group)
    }

    // And the two monster categories genuinely answer the same thing while the social one
    // does not, which is the distinction the headings exist for.
    expect(groupOf({ sheet: bestiary(MONSTER_KEY) })).toBe(
      groupOf({ sheet: bestiary(ENEMY_KEY) }),
    )
    expect(groupOf({ sheet: bestiary(SOCIAL_KEY) })).not.toBe(
      groupOf({ sheet: bestiary(MONSTER_KEY) }),
    )
  })

  /**
   * A retired key groups as a monster rather than throwing, exactly as `resolveBestiary`
   * keeps a retired creature readable: this runs inside `characters.list`, so a throw
   * would blank the DM's whole panel over one creature nobody can look up.
   *
   * The prototype-chain names are here for `lib/library/index.ts`'s reason — a plain
   * object lookup answers truthily for `__proto__` and `toString`, and `bestiaryCategoryOf`
   * is a `Map` precisely so that the whole class of bug is unexpressible.
   */
  test('a retired or invented entry key groups as a monster and does not throw', () => {
    for (const key of ['no-such-beast', 'Dire-Wolf', '__proto__', 'toString', '']) {
      expect(bestiaryCategoryOf(key), `${key} is somehow in the corpus`).toBeUndefined()
      expect(groupOf({ sheet: bestiary(key) }), key).toBe('monster')
    }
  })

  /**
   * ⚠️ **The `never` arm, which is the guard rather than a formality.** A fifth stored
   * kind fails `npm run lint` on the exhaustive switch — that is where a new member is
   * meant to be caught — and this asserts the runtime half, which is what a deployment
   * reading a document written by a newer one actually hits.
   *
   * `'monster'` is the right answer for the unknown case here for the opposite reason to
   * `isMonsterSheet`'s: nothing is being guarded, both creature groups are DM-only, so
   * the default is chosen to keep an unrecognised row *out* of the Characters heading,
   * where it would be the one place a group answer could look like a hero.
   */
  test('a kind this deployment has never heard of groups as a monster', () => {
    expect(groupOf({ sheet: { kind: 'chimera' } as unknown as StoredSheet })).toBe('monster')
  })

  /** Every answer is one of the three the validator declares, and all three are reachable. */
  test('the answers are exactly the three declared groups', () => {
    const answers = new Set([
      groupOf({ sheet: defaultPcSheet() }),
      groupOf({ sheet: preset() }),
      groupOf({}),
      groupOf({ sheet: creature() }),
      groupOf({ sheet: creature({ group: 'monster' }) }),
      groupOf({ sheet: bestiary(MONSTER_KEY) }),
      groupOf({ sheet: bestiary(SOCIAL_KEY) }),
    ])
    expect([...answers].sort()).toEqual(['character', 'monster', 'npc'])
  })
})
