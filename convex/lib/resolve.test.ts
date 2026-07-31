import { describe, expect, test } from 'vitest'

import { MAX_LIBRARY_LEVEL, SUBCLASS_LEVEL, findClass, type ClassKey } from './classes'
import { LIBRARY, librarySheet } from './library'
import { race } from './races'
import { presetExtras, presetOf, resolveSheet } from './resolve'
import {
  MAX_LEVEL,
  MIN_LEVEL,
  SPEED_FEET,
  defaultNpcSheet,
  defaultPcSheet,
  noSkills,
  sheetProblem,
  skillProficienciesOf,
  speedOf,
  storedSheetProblem,
} from './sheet'
import type {
  AbilityScores,
  PcSheet,
  PresetOverrides,
  PresetSheet,
  SheetEntry,
  StoredSheet,
} from './sheet'

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
