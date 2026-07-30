import { describe, expect, test } from 'vitest'

import { CLASS_KEYS, findClass } from './classes'
import { LIBRARY, librarySheet } from './library'
import { RACES, RACE_KEYS, perRestAbilities, race } from './races'
import type { Race } from './races'
import { resolveSheet } from './resolve'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  SPEED_FEET,
  isValidRoll,
  sheetProblem,
} from './sheet'
import type { AbilityKey, PcSheet, PresetSheet } from './sheet'

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

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

/** The library sheet a set of selections borrows from, before any race touches it. */
function source(sheet: PresetSheet) {
  const found = librarySheet(sheet.classKey, sheet.subclassKey, sheet.level)
  if (!found) throw new Error('the fixture must name a sheet the library holds')
  return found
}

// ---------------------------------------------------------------------------
// The list itself
// ---------------------------------------------------------------------------

describe('the eight races', () => {
  test('RACES and RACE_KEYS describe the same eight, keyed by themselves', () => {
    expect(RACES).toHaveLength(8)
    expect(RACES.map((entry) => entry.key)).toEqual([...RACE_KEYS])
    for (const key of RACE_KEYS) {
      expect(race(key).key, key).toBe(key)
    }
    expect(new Set(RACES.map((entry) => entry.name)).size).toBe(8)
  })

  /**
   * A race's trait lands on the sheet as an ordinary entry, so its name and
   * text are bounded by the same limits every other entry is. A trait longer
   * than the field would make every character of that race unsaveable — and
   * `sheetProblem` would blame the entry rather than the race.
   */
  test('every trait fits the entry it becomes', () => {
    for (const entry of RACES) {
      expect(entry.traitName.trim(), entry.key).not.toBe('')
      expect(entry.traitName.length, entry.key).toBeLessThanOrEqual(MAX_ENTRY_NAME_LENGTH)
      expect(entry.traitText.trim(), entry.key).not.toBe('')
      expect(entry.traitText.length, entry.key).toBeLessThanOrEqual(MAX_ENTRY_TEXT_LENGTH)
      expect(entry.blurb.trim(), entry.key).not.toBe('')
    }
  })

  test('every granted entry is a storable entry with a valid roll', () => {
    for (const entry of RACES) {
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
})

// ---------------------------------------------------------------------------
// Each modifier, applied exactly once
// ---------------------------------------------------------------------------

describe('a race changes its numbers exactly once', () => {
  /**
   * **The failure this whole describe exists for is double application.** The
   * resolver is called on every read of a character rather than at write time,
   * so a bonus added in the wrong place is not a one-off mistake in one
   * document — it is a number that grows, or that reappears after a level-up,
   * across every character of that race in every game.
   *
   * Asserted against the library sheet the character is actually borrowing
   * rather than against a literal, so the test keeps meaning what it says when
   * somebody rebalances a fighter.
   */
  test('the Elf is +2 Dexterity and not +4, and touches nothing else', () => {
    const selections = preset({ race: 'elf' })
    const base = source(selections)
    const resolved = resolve(selections)

    expect(resolved.abilities.dex).toBe(base.abilities.dex + 2)
    for (const ability of ABILITIES) {
      if (ability === 'dex') continue
      expect(resolved.abilities[ability], ability).toBe(base.abilities[ability])
    }
    expect(resolved.maxHp).toBe(base.maxHp)
    expect(resolved.speed).toBe(SPEED_FEET)
  })

  /**
   * Per *level*, so this is the one racial bonus that a level-up has to move —
   * and the one where "applied twice" and "applied once but with the wrong
   * level" look identical at level 1 and diverge everywhere else. Several
   * levels, therefore, rather than one.
   */
  test("the Dwarf's hit points are the library's plus one per level, at every level", () => {
    for (const level of [1, 2, 3, 4, 5, 12, 20]) {
      const selections = preset({
        race: 'dwarf',
        level,
        subclassKey: level < 2 ? null : 'champion',
      })
      const base = source(selections)
      // The character's level, not the library sheet's — a level 12 fighter
      // borrows the level 5 numbers but is still twelve levels of Dwarf.
      const expected = base.maxHp + Math.min(level, 20)
      expect(resolve(selections).maxHp, `level ${level}`).toBe(expected)
    }
  })

  test("the Goliath is 10 feet faster than everybody, and no faster than that", () => {
    const selections = preset({ race: 'goliath' })
    expect(resolve(selections).speed).toBe(SPEED_FEET + 10)
    expect(resolve(selections).abilities).toEqual(source(selections).abilities)
    expect(resolve(selections).maxHp).toBe(source(selections).maxHp)
  })

  /**
   * The five that change no number must change no number. A race whose whole
   * contribution is a trait is where an accidental `+ 0` turning into `+ 1`
   * would go unnoticed longest, because nobody is watching a Halfling's
   * arithmetic.
   */
  test('a race with no numeric modifier leaves every number exactly as the library had it', () => {
    const numeric: Race[] = RACES.filter(
      (entry) => entry.abilityBonus || entry.hpPerLevel || entry.speedBonus,
    )
    // Vacuity: three of the eight do touch arithmetic, and the other five must not.
    expect(numeric.map((entry) => entry.key).sort()).toEqual(['dwarf', 'elf', 'goliath'])

    for (const key of RACE_KEYS) {
      if (numeric.some((entry) => entry.key === key)) continue
      const selections = preset({ race: key })
      const base = source(selections)
      const resolved = resolve(selections)
      expect(resolved.abilities, key).toEqual(base.abilities)
      expect(resolved.maxHp, key).toBe(base.maxHp)
      expect(resolved.armourClass, key).toBe(base.armourClass)
      expect(resolved.speed, key).toBe(SPEED_FEET)
      expect(resolved.hitDice, key).toEqual(base.hitDice)
      expect(resolved.saveProficiencies, key).toEqual(base.saveProficiencies)
      expect(resolved.skillProficiencies, key).toEqual(base.skillProficiencies)
    }
  })

  /**
   * The same modifier over every class and level the library holds, because
   * "applied once" is a property of the resolver rather than of the fixture
   * this file happens to use. 8 races × 8 classes is where a bonus applied in
   * the wrong branch would show up.
   */
  test('holds for every class at every level, not just the fixture', () => {
    for (const classKey of CLASS_KEYS) {
      for (const [subclassKey, level] of [
        [null, 1],
        [findClass(classKey)!.subclasses[0].key, 5],
      ] as const) {
        const selections = preset({ classKey, subclassKey, level })
        const base = source(selections)
        for (const key of RACE_KEYS) {
          const chosen = race(key)
          const resolved = resolve({ ...selections, race: key })
          const where = `${classKey}/${subclassKey}/${level} + ${key}`
          for (const ability of ABILITIES) {
            expect(resolved.abilities[ability], `${where} ${ability}`).toBe(
              base.abilities[ability] + (chosen.abilityBonus?.[ability] ?? 0),
            )
          }
          expect(resolved.maxHp, where).toBe(base.maxHp + (chosen.hpPerLevel ?? 0) * level)
          expect(resolved.speed, where).toBe(SPEED_FEET + (chosen.speedBonus ?? 0))
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The trait on the sheet
// ---------------------------------------------------------------------------

describe('the trait lands on the sheet', () => {
  /**
   * "The trait always appears, whether or not it changes a number — a
   * Halfling's Lucky is the whole of what makes them a Halfling and would
   * otherwise be invisible on their own sheet."
   */
  test("every race's trait appears exactly once, on every class and level", () => {
    for (const classKey of CLASS_KEYS) {
      for (const level of [1, 3, 5]) {
        for (const key of RACE_KEYS) {
          const chosen = race(key)
          const resolved = resolve(
            preset({
              classKey,
              race: key,
              level,
              subclassKey: level < 2 ? null : findClass(classKey)!.subclasses[0].key,
            }),
          )
          const where = `${classKey}/${level} + ${key}`
          // Matched on the id rather than the name, because the id is what the
          // resolver mints and what has to be unique. The Dragonborn is the
          // reason the distinction is not academic — see the duplicate-name
          // test below.
          const matching = resolved.feats.filter((entry) => entry.id === `race:${key}`)
          expect(matching.length, where).toBe(1)
          expect(matching[0].name, where).toBe(chosen.traitName)
          expect(matching[0].text, where).toBe(chosen.traitText)
          expect(matching[0].roll, where).toBeNull()
          expect(matching[0].level, where).toBeNull()
          expect(matching[0].catalogueKey, where).toBeNull()
          // And it is on the feats list, never the spell list, whether or not
          // the race also grants a spell.
          expect(resolved.spells.some((entry) => entry.id === `race:${key}`), where).toBe(false)
        }
      }
    }
  })

  /**
   * A stable id, and this is what "stable" has to mean in practice: the same
   * across two resolutions of the same character, and — the case that matters —
   * unchanged by a level-up. `withId` derives an id from the entry's *name*
   * rather than its position precisely so that levelling does not renumber a
   * sheet, which React would read as every row being replaced and Milestone 5
   * would read as every roll target moving.
   */
  test("every race's trait keeps one id across resolutions, levels and classes", () => {
    for (const key of RACE_KEYS) {
      const chosen = race(key)
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
          const trait = resolved.feats.find((entry) => entry.name === chosen.traitName)
          expect(trait, `${classKey}/${level} + ${key}`).toBeDefined()
          ids.add(trait!.id)
        }
      }
      expect([...ids], key).toHaveLength(1)
      const [id] = [...ids]
      expect(id, key).toBe(`race:${key}`)
      expect(id.length, key).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
    }
  })

  test('the Tiefling gets Thaumaturgy, on the spell list, exactly once', () => {
    const resolved = resolve(preset({ race: 'tiefling' }))
    const matching = resolved.spells.filter((entry) => entry.name === 'Thaumaturgy')
    expect(matching).toHaveLength(1)
    expect(matching[0].level).toBe(0)
    expect(resolved.feats.some((entry) => entry.name === 'Thaumaturgy')).toBe(false)
    // And nobody else does.
    for (const key of RACE_KEYS) {
      if (key === 'tiefling') continue
      expect(
        resolve(preset({ race: key })).spells.some((entry) => entry.name === 'Thaumaturgy'),
        key,
      ).toBe(false)
    }
  })

  test('the Dragonborn gets a Breath Weapon, on the feat list, with a roll', () => {
    const resolved = resolve(preset({ race: 'dragonborn' }))
    const granted = resolved.feats.filter((entry) => entry.roll === '2d6')
    expect(granted).toHaveLength(1)
    expect(granted[0].name).toBe('Breath Weapon')
    expect(granted[0].id).toBe('race-dragonborn:breath-weapon')
    for (const key of RACE_KEYS) {
      if (key === 'dragonborn') continue
      expect(
        resolve(preset({ race: key })).feats.some((entry) => entry.name === 'Breath Weapon'),
        key,
      ).toBe(false)
    }
  })

  /**
   * DEFECT (races.ts:164 and :169). The Dragonborn's `traitName` and the name of
   * the feat it grants are the same string, "Breath Weapon", so the resolver
   * appends both and every Dragonborn's sheet carries two feats with an
   * identical name — one describing the cone and one rolling for it.
   *
   * It is not caught downstream, which is why it needs catching here: the two
   * ids differ (`race:dragonborn` and `race-dragonborn:breath-weapon`), so
   * `sheetProblem`'s uniqueness check is satisfied and the sheet saves happily.
   * What the player sees is one ability listed twice, with only one of the two
   * rows rollable — and a DM comparing the party's sheets has no way to tell
   * which duplicate is the real one.
   *
   * The other two races with granted content avoid it: the Tiefling's trait is
   * "Infernal Legacy" and grants "Thaumaturgy", and the Human's and Half-Orc's
   * per-rest abilities share their trait names but are not sheet entries.
   */
  test('no race puts two entries with the same name on a sheet', () => {
    const offenders: string[] = []
    for (const key of RACE_KEYS) {
      const resolved = resolve(preset({ race: key }))
      const names = [...resolved.feats, ...resolved.spells].map((entry) => entry.name)
      for (const [index, name] of names.entries()) {
        if (names.indexOf(name) !== index) offenders.push(`${key}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Every race, on every class, at every level, through the validator the
   * mutation runs. The granted entries are where a race can break a sheet that
   * was fine without it — an id that collides with a library entry's, a roll
   * the grammar refuses, a trait text over the limit.
   */
  test('every race resolves to a storable sheet on every class', () => {
    const problems: string[] = []
    for (const classKey of CLASS_KEYS) {
      for (const subclass of findClass(classKey)!.subclasses) {
        for (const level of [2, 5]) {
          for (const key of RACE_KEYS) {
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
   * Two races, and exactly two. This is the list the vitals panel draws a
   * spendable checkbox from, so a race that quietly acquired one would put an
   * untracked resource on a sheet — and one that lost one would silently drop a
   * flag somebody had already spent.
   */
  test('returns entries for the Human and the Half-Orc, and nothing for the other six', () => {
    const withAbilities = RACE_KEYS.filter((key) => perRestAbilities(key).length > 0)
    expect([...withAbilities].sort()).toEqual(['half-orc', 'human'])

    for (const key of RACE_KEYS) {
      const abilities = perRestAbilities(key)
      expect(Array.isArray(abilities), key).toBe(true)
      if (key === 'human' || key === 'half-orc') {
        expect(abilities, key).toHaveLength(1)
      } else {
        expect(abilities, key).toEqual([])
      }
    }
    expect(perRestAbilities('human')[0].key).toBe('heroic-inspiration')
    expect(perRestAbilities('half-orc')[0].key).toBe('relentless-endurance')
  })

  /**
   * The key is what the spent flag is stored against in `characterVitals`, so
   * it has to be unique across every race — two races sharing one would make a
   * Human's spent Inspiration read as a Half-Orc's spent Endurance.
   */
  test('every per-rest key is unique across all eight races and is a usable id', () => {
    const keys = RACE_KEYS.flatMap((key) => perRestAbilities(key).map((entry) => entry.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(key.length).toBeLessThanOrEqual(MAX_ENTRY_ID_LENGTH)
    }
    for (const key of RACE_KEYS) {
      for (const ability of perRestAbilities(key)) {
        expect(ability.name.trim(), key).not.toBe('')
        expect(ability.text.trim(), key).not.toBe('')
      }
    }
  })

  /**
   * DEFECT (races.ts:200), minor. `perRestAbilities` returns `race(key).perRest`
   * itself — the live array on the module-level `RACES` constant — so a caller
   * that sorts, splices or pushes is editing the race definition rather than a
   * copy of it. On Convex that is worse than it sounds: the isolate outlives the
   * request, so one mutating caller changes what every subsequent query in that
   * isolate sees, and the corruption disappears on redeploy.
   *
   * The rest of this codebase is careful about exactly this. `defaultPcSheet`
   * and `noSkills` build a fresh object every call and sheet.test.ts pins it;
   * `sheetEntriesOf` spreads its two lists for the stated reason that "a caller
   * sorting the result must not reorder the sheet". `[...(race(key).perRest ??
   * [])]` would put this accessor on the same footing.
   */
  test('hands back a list the caller cannot use to edit the race', () => {
    const first = perRestAbilities('human')
    first.push({ key: 'made-up', name: 'Made Up', text: 'Not real.' })
    try {
      expect(perRestAbilities('human')).toHaveLength(1)
    } finally {
      // Put it back whatever happens. While the defect stands this test really
      // does edit `RACES`, and leaving it edited would make every suite that
      // ran afterwards in the same worker read a race that does not exist.
      race('human').perRest!.length = 1
    }
  })
})

// ---------------------------------------------------------------------------
// The race and the library do not overlap
// ---------------------------------------------------------------------------

describe('races and the library stay out of each other', () => {
  /**
   * A race's trait name colliding with a library entry's would produce two rows
   * a player cannot tell apart — the same failure the Dragonborn has internally,
   * one file over. Checked across the whole library because a class content
   * edit is what would introduce it.
   */
  test('no library entry is named after a race trait or a granted entry', () => {
    const racial = new Set(
      RACES.flatMap((entry) => [
        entry.traitName,
        ...(entry.grantedFeats ?? []).map((granted) => granted.name),
        ...(entry.grantedSpells ?? []).map((granted) => granted.name),
      ]),
    )
    const offenders: string[] = []
    for (const classKey of CLASS_KEYS) {
      const library = LIBRARY[classKey]
      const sheets = [library.base, ...Object.values(library.paths).flatMap((path) => Object.values(path))]
      for (const sheet of sheets) {
        for (const entry of [...sheet.feats, ...sheet.spells]) {
          if (racial.has(entry.name)) offenders.push(`${classKey}/${sheet.level}: ${entry.name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /** And the ids the resolver mints for the two sources cannot collide either. */
  test('a race id and a library id never share a namespace', () => {
    for (const key of RACE_KEYS) {
      for (const classKey of CLASS_KEYS) {
        const resolved = resolve(
          preset({ classKey, race: key, subclassKey: findClass(classKey)!.subclasses[1].key }),
        )
        const ids = [...resolved.feats, ...resolved.spells].map((entry) => entry.id)
        expect(new Set(ids).size, `${classKey} + ${key}`).toBe(ids.length)
        for (const id of ids) {
          expect(id, `${classKey} + ${key}`).toMatch(/^(lib|race|race-[a-z-]+):/)
        }
      }
    }
  })
})
