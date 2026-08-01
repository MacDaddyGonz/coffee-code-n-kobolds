import { describe, expect, test } from 'vitest'

// The two accessors these cover moved to lib/resolve.ts in Milestone 4, because a
// stored preset needs the library to resolve and lib/sheet.ts must never import it.
import { kindOf, resolveSheet } from './resolve'

import { CLASSES, SUBCLASS_LEVEL } from './classes'
import { RACE_KEYS } from './races'
import { SKILL_KEYS } from './skills'
import {
  HEALTH_BANDS,
  HIT_DIE_FACES,
  MAX_ABILITY_SCORE,
  MAX_ARMOUR_CLASS,
  MAX_CLASS_NAME_LENGTH,
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_HIT_DICE_COUNT,
  MAX_INITIATIVE_BONUS,
  MAX_LEVEL,
  MAX_MAX_HP,
  MAX_ATTACK_BONUS,
  MAX_NPC_NOTES_LENGTH,
  MAX_ROLL_LENGTH,
  MAX_SHEET_ENTRIES,
  MAX_SPELL_LEVEL,
  MIN_ABILITY_SCORE,
  MIN_ARMOUR_CLASS,
  MIN_ATTACK_BONUS,
  MIN_LEVEL,
  MIN_MAX_HP,
  MIN_SPELL_LEVEL,
  CHARACTER_GROUPS,
  CHARACTER_GROUP_LABELS,
  CREATURE_GROUPS,
  CREATURE_GROUP_CHOICES,
  characterGroupValidator,
  creatureGroupValidator,
  ROLL_MODIFIER_TOKENS,
  ROLL_PATTERN,
  SHEET_ENTRY_CATEGORIES,
  SHEET_ENTRY_CATEGORY_LABELS,
  abilityModifier,
  categoryOf,
  clampHp,
  rollShapeOf,
  sheetEntryCategoryValidator,
  toHitFromBonus,
  toHitOf,
  defaultNpcSheet,
  defaultPcSheet,
  defaultSheetFor,
  healthBand,
  initiativeBonusOf,
  isValidRoll,
  maxHpOf,
  normaliseRoll,
  normaliseSheet,
  noSkills,
  normaliseStoredSheet,
  proficiencyBonus,
  savingThrowBonus,
  sheetEntriesOf,
  sheetProblem,
  skillProficienciesOf,
  skillProficienciesValidator,
  speedOf,
  storedSheetProblem,
  SPEED_FEET,
} from './sheet'
import type {
  CharacterSheet,
  HealthBand,
  NpcSheet,
  PcSheet,
  PresetSheet,
  SheetEntry,
  SheetEntryCategory,
  StoredSheet,
} from './sheet'

// ---------------------------------------------------------------------------
// Builders. Every test starts from a sheet that is known-good, so an assertion
// about a bound is an assertion about that bound and nothing else — a fixture
// that happened to be invalid for a second reason would make `sheetProblem`
// tests pass for the wrong one.
// ---------------------------------------------------------------------------

function pc(overrides: Partial<PcSheet> = {}): PcSheet {
  return { ...defaultPcSheet(), ...overrides }
}

function npc(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return { ...defaultNpcSheet(), ...overrides }
}

function entry(overrides: Partial<SheetEntry> = {}): SheetEntry {
  return {
    id: 'e1',
    name: 'Thing',
    text: 'It does a thing.',
    roll: null,
    level: null,
    catalogueKey: null,
    ...overrides,
  }
}

/** N distinct, valid entries — for the list-length bound. */
function entries(count: number): SheetEntry[] {
  return Array.from({ length: count }, (_, i) => entry({ id: `e${i}` }))
}

const NOT_A_NUMBER = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

describe('abilityModifier', () => {
  /**
   * The 5e table by hand rather than by re-deriving it from the formula, which
   * would only assert that the implementation equals itself. Odd and even are
   * both present at every step because the floor is the whole content of the
   * function: 8 and 9 are both −1, 10 and 11 are both 0.
   */
  test('matches the 5e table', () => {
    const table: [number, number][] = [
      [1, -5],
      [2, -4],
      [3, -4],
      [8, -1],
      [9, -1],
      [10, 0],
      [11, 0],
      [12, 1],
      [13, 1],
      [14, 2],
      [15, 2],
      [20, 5],
      [21, 5],
      [30, 10],
    ]
    for (const [score, modifier] of table) {
      expect(abilityModifier(score)).toBe(modifier)
    }
  })

  /**
   * Floor, not truncation. `Math.trunc((3 - 10) / 2)` is −3 where the rules say
   * −4, and the two only disagree below 10 — which is exactly where a dumped
   * stat sits, so the difference is not academic.
   */
  test('rounds down rather than towards zero for a low score', () => {
    expect(abilityModifier(3)).toBe(-4)
    expect(abilityModifier(7)).toBe(-2)
    expect(abilityModifier(0)).toBe(-5)
    expect(abilityModifier(-1)).toBe(-6)
  })
})

describe('proficiencyBonus', () => {
  test('steps at every four-level boundary', () => {
    const expected: [number[], number][] = [
      [[1, 2, 3, 4], 2],
      [[5, 6, 7, 8], 3],
      [[9, 10, 11, 12], 4],
      [[13, 14, 15, 16], 5],
      [[17, 18, 19, 20], 6],
    ]
    for (const [levels, bonus] of expected) {
      for (const level of levels) {
        expect(proficiencyBonus(level)).toBe(bonus)
      }
    }
  })

  /**
   * The form runs this on whatever is currently typed, so it is handed values a
   * validated sheet would never hold. Clamping means level 0 reads as level 1
   * rather than +1, and level 99 as level 20 rather than +26.
   */
  test('clamps outside 1–20 instead of extrapolating', () => {
    for (const level of [0, -1, -100]) {
      expect(proficiencyBonus(level)).toBe(proficiencyBonus(MIN_LEVEL))
    }
    for (const level of [21, 40, 1000]) {
      expect(proficiencyBonus(level)).toBe(proficiencyBonus(MAX_LEVEL))
    }
    expect(proficiencyBonus(Number.POSITIVE_INFINITY)).toBe(6)
    expect(proficiencyBonus(Number.NEGATIVE_INFINITY)).toBe(2)
  })

  /**
   * A fractional level cannot be stored — `sheetProblem` rejects it — but the
   * live form can hold one, and a bonus of 2.5 would be nonsense on screen.
   *
   * NaN is deliberately absent from this test rather than passing it: the
   * private `clamp` is `Math.min(high, Math.max(low, value))`, and every
   * comparison against NaN is false, so `proficiencyBonus(Number.NaN)` is NaN
   * today. `sheetProblem` refuses to store a NaN level, so nothing can reach it
   * from the database — but an emptied number input in the sheet editor is NaN,
   * and this module exists to be run against values that have not been saved.
   * Reported alongside this suite rather than asserted, since asserting the
   * current answer would cement it.
   */
  test('is a whole number for a fractional level', () => {
    for (const level of [1.5, 4.9, 12.25, 19.75]) {
      expect(Number.isInteger(proficiencyBonus(level))).toBe(true)
    }
  })
})

describe('savingThrowBonus', () => {
  test('adds the proficiency bonus only where the character is proficient', () => {
    const sheet = pc({
      level: 5, // +3 proficiency
      abilities: { str: 10, dex: 16, con: 14, int: 8, wis: 12, cha: 20 },
      saveProficiencies: {
        str: false,
        dex: true,
        con: true,
        int: false,
        wis: false,
        cha: true,
      },
    })
    expect(savingThrowBonus(sheet, 'str')).toBe(0)
    expect(savingThrowBonus(sheet, 'dex')).toBe(3 + 3)
    expect(savingThrowBonus(sheet, 'con')).toBe(2 + 3)
    expect(savingThrowBonus(sheet, 'int')).toBe(-1)
    expect(savingThrowBonus(sheet, 'wis')).toBe(1)
    expect(savingThrowBonus(sheet, 'cha')).toBe(5 + 3)
  })

  /**
   * A negative modifier plus proficiency must add, not clamp at zero: a level 1
   * wizard proficient in a Strength save is at −1 + 2 = +1, and a −3 with
   * proficiency at level 1 is still −1.
   */
  test('adds proficiency onto a negative modifier', () => {
    const sheet = pc({
      level: 1,
      abilities: { str: 5, dex: 8, con: 10, int: 10, wis: 10, cha: 10 },
      saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
    })
    expect(savingThrowBonus(sheet, 'str')).toBe(-3 + 2)
    expect(savingThrowBonus(sheet, 'dex')).toBe(-1 + 2)
  })

  test('tracks the level, so levelling up moves every proficient save', () => {
    const base = pc({
      saveProficiencies: { str: true, dex: false, con: false, int: false, wis: false, cha: false },
      abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    })
    expect(savingThrowBonus({ ...base, level: 4 }, 'str')).toBe(2 + 2)
    expect(savingThrowBonus({ ...base, level: 5 }, 'str')).toBe(2 + 3)
  })
})

describe('initiativeBonusOf', () => {
  /**
   * The two halves of the union are genuinely different code paths — derived
   * from Dexterity for a hero, read out of a field for a monster — and the one
   * that would be easy to get wrong is the NPC, whose stored bonus must be used
   * verbatim rather than run through `abilityModifier`.
   */
  test('derives a PC bonus from Dexterity', () => {
    for (const [dex, bonus] of [
      [10, 0],
      [8, -1],
      [18, 4],
      [20, 5],
    ]) {
      expect(
        initiativeBonusOf(pc({ abilities: { ...defaultPcSheet().abilities, dex } })),
      ).toBe(bonus)
    }
  })

  test('uses the stored bonus for an NPC, unmodified', () => {
    for (const initiativeBonus of [0, 3, -2, MAX_INITIATIVE_BONUS, -MAX_INITIATIVE_BONUS]) {
      expect(initiativeBonusOf(npc({ initiativeBonus }))).toBe(initiativeBonus)
    }
  })

  /** A stored 12 must not be read as `abilityModifier(12)` — that is +1, not +12. */
  test('does not run the NPC bonus through the ability table', () => {
    expect(initiativeBonusOf(npc({ initiativeBonus: 12 }))).toBe(12)
  })
})

describe('maxHpOf and sheetEntriesOf', () => {
  test('reads the maximum off either variant', () => {
    expect(maxHpOf(pc({ maxHp: 43 }))).toBe(43)
    expect(maxHpOf(npc({ maxHp: 7 }))).toBe(7)
  })

  test('merges feats and spells for a PC and returns the actions for an NPC', () => {
    const sheet = pc({ feats: [entry({ id: 'f1' })], spells: [entry({ id: 's1' })] })
    expect(sheetEntriesOf(sheet).map((e) => e.id)).toEqual(['f1', 's1'])
    expect(sheetEntriesOf(npc({ actions: [entry({ id: 'a1' })] })).map((e) => e.id)).toEqual(['a1'])
  })

  /** A copy, not the stored arrays — a caller sorting the result must not reorder the sheet. */
  test('returns a list the caller can mutate safely', () => {
    const feats = [entry({ id: 'f1' })]
    const sheet = pc({ feats })
    sheetEntriesOf(sheet).push(entry({ id: 'x' }))
    expect(sheet.feats).toHaveLength(1)
    expect(feats).toHaveLength(1)
  })
})

describe('healthBand', () => {
  /**
   * These thresholds are the one number a player is allowed to learn about an
   * NPC, so both sides of each are pinned. `>` rather than `>=` is what puts
   * exactly half into `bloodied` and exactly a quarter into `critical`.
   */
  test('puts exactly half at bloodied and exactly a quarter at critical', () => {
    expect(healthBand(6, 10)).toBe('healthy')
    expect(healthBand(5, 10)).toBe('bloodied')
    expect(healthBand(3, 10)).toBe('bloodied')
    expect(healthBand(2.5, 10)).toBe('critical')
    expect(healthBand(2, 10)).toBe('critical')

    // The same two boundaries on a maximum where they are not round numbers.
    expect(healthBand(450, 900)).toBe('bloodied')
    expect(healthBand(451, 900)).toBe('healthy')
    expect(healthBand(225, 900)).toBe('critical')
    expect(healthBand(226, 900)).toBe('bloodied')
  })

  test('reads a full or overhealed creature as healthy', () => {
    expect(healthBand(10, 10)).toBe('healthy')
    expect(healthBand(15, 10)).toBe('healthy')
  })

  test('reads zero or below as down', () => {
    for (const current of [0, -1, -999]) {
      expect(healthBand(current, 10)).toBe('down')
    }
  })

  /**
   * The doc comment's promise, and the one worth a test of its own: `down` is
   * the band the party acts on immediately, so a creature still standing on one
   * hit point out of nine hundred must not read as one that has fallen.
   */
  test('never reads a living creature as down, however thin the sliver', () => {
    for (const max of [10, 100, 900, MAX_MAX_HP]) {
      expect(healthBand(1, max)).toBe('critical')
      expect(healthBand(0.5, max)).toBe('critical')
      expect(healthBand(Number.MIN_VALUE, max)).toBe('critical')
    }
  })

  /**
   * A nonsense maximum cannot produce a ratio. It must not throw and must not
   * invent a fifth state — and a creature with hit points left reads as unhurt
   * rather than as down, because down is the band that gets acted on.
   */
  test('survives a zero, negative or non-finite maximum', () => {
    for (const max of [0, -1, -50, ...NOT_A_NUMBER]) {
      expect(healthBand(5, max)).toBe('healthy')
      expect(healthBand(0, max)).toBe('down')
    }
  })

  test('returns one of the four bands for every silly pair, and never throws', () => {
    const values = [0, 1, -1, 0.5, 2.5, 10, 999, 1e9, -1e9, ...NOT_A_NUMBER]
    for (const current of values) {
      for (const max of values) {
        const band = healthBand(current, max)
        expect(HEALTH_BANDS).toContain(band)
      }
    }
  })

  /**
   * A property rather than a case: healing can never make a creature look worse
   * and damage can never make it look better. An inverted comparison or a
   * mis-ordered pair of `if`s would show up here even at a threshold nobody
   * thought to write a case for.
   */
  test('never worsens as hit points rise', () => {
    const rank = (band: HealthBand) => HEALTH_BANDS.indexOf(band)
    for (const max of [1, 7, 10, 33, 900]) {
      let previous = rank(healthBand(0, max))
      for (let current = 0; current <= max + 2; current += 0.25) {
        const here = rank(healthBand(current, max))
        expect(here).toBeLessThanOrEqual(previous)
        previous = here
      }
    }
  })
})

describe('clampHp', () => {
  test('clamps into [0, max] and rounds a fraction', () => {
    expect(clampHp(5, 10)).toBe(5)
    expect(clampHp(11, 10)).toBe(10)
    expect(clampHp(-4, 10)).toBe(0)
    expect(clampHp(0, 10)).toBe(0)
    expect(clampHp(10, 10)).toBe(10)
    expect(clampHp(4.4, 10)).toBe(4)
    expect(clampHp(4.5, 10)).toBe(5)
    expect(clampHp(9.99, 10)).toBe(10)
  })

  test('rounds the ceiling too, so a fractional max cannot leak through', () => {
    expect(clampHp(10, 9.4)).toBe(9)
    expect(clampHp(10, 9.6)).toBe(10)
  })

  /**
   * An emptied number input yields NaN, and NaN is a perfectly storable Convex
   * float64 that would poison every comparison made against it afterwards. It
   * must come back out as a number.
   */
  test('never returns NaN, whatever it is handed', () => {
    const values = [0, 1, -1, 7.5, 1e9, ...NOT_A_NUMBER]
    for (const current of values) {
      for (const max of values) {
        const result = clampHp(current, max)
        expect(Number.isInteger(result)).toBe(true)
        expect(result).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('treats a nonsense or non-positive maximum as a ceiling of zero', () => {
    for (const max of [0, -1, -100, ...NOT_A_NUMBER]) {
      expect(clampHp(5, max)).toBe(0)
    }
  })

  test('is idempotent — clamping a clamped value changes nothing', () => {
    for (const current of [-5, 0, 3.5, 12, Number.NaN]) {
      const once = clampHp(current, 10)
      expect(clampHp(once, 10)).toBe(once)
    }
  })
})

describe('the roll grammar', () => {
  const VALID = [
    '1d8',
    '2d6+3',
    '1d8+WIS',
    '1d20+PROF',
    '3d6-1',
    '1d10+STR+PROF',
    '20d12',
    '1d100',
    '1d4',
    '2d20-2+CON',
    '19d10+999',
  ]

  const INVALID = [
    'd8', // no count
    '1d7', // not a real die
    '0d6', // no dice at all
    '21d6', // over the cap Milestone 4's physics engine has to render
    '+5', // a modifier is not a roll
    '',
    '2d6 + 3', // spaces are normalised away, not accepted
    '1d8+FOO',
    '1d8+',
    '1d8++WIS',
    '1d8+wis', // lowercase token: normalise first
    '1D8', // uppercase separator: normalise first
    '1d8+WIS+', // trailing sign
    '1d8-',
    '1d6+1000', // four digits
    '01d6', // leading zero
    '1d06',
    '1d8;DROP',
    ' 1d8',
    '1d8 ',
  ]

  test('accepts the shapes the picker and the custom field produce', () => {
    for (const roll of VALID) {
      expect(isValidRoll(roll)).toBe(true)
    }
  })

  test('rejects typos, out-of-range counts and anything that is not a roll', () => {
    for (const roll of INVALID) {
      expect(isValidRoll(roll)).toBe(false)
    }
  })

  /**
   * JavaScript's `$` is a strict end-of-input without the `m` flag — unlike
   * Perl's, which would match before a trailing newline. That distinction is the
   * difference between a stored roll and a stored roll with a second line of
   * anything after it, so it gets a test rather than a memory.
   */
  test('rejects anything carrying a newline, at either end or through the middle', () => {
    for (const roll of ['1d8\n', '\n1d8', '1d8\n2d6', '1d8+WIS\n', '1d8\r\n', '1d8 ']) {
      expect(isValidRoll(roll)).toBe(false)
    }
    expect(ROLL_PATTERN.flags).not.toContain('m')
  })

  /**
   * `sheetProblem` puts a rejected roll into its message, and the pattern is
   * shared, so a stateful `g`-flagged regex would make `isValidRoll` alternate
   * between true and false on the same input.
   */
  test('is stateless across repeated calls', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(isValidRoll('1d8+WIS')).toBe(true)
      expect(isValidRoll('1d7')).toBe(false)
    }
    expect(ROLL_PATTERN.flags).not.toContain('g')
    expect(ROLL_PATTERN.lastIndex).toBe(0)
  })

  /**
   * The trailing `(?:[+-]…)*` is the shape that goes exponential when a regex is
   * written carelessly. Each repetition here has to start with a sign, so there
   * is nothing to backtrack ambiguously — this pins that, since a validator that
   * runs on every keystroke hanging the tab is a denial of service on the person
   * typing.
   */
  test('does not backtrack catastrophically on a long hostile input', () => {
    const inputs = [
      `1d6${'+1'.repeat(20_000)}!`,
      `1d6+${'1'.repeat(50_000)}`,
      `1d6${'+PRO'.repeat(20_000)}`,
      `${'1'.repeat(50_000)}d6`,
    ]
    const started = Date.now()
    for (const input of inputs) {
      expect(isValidRoll(input)).toBe(false)
    }
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test('normaliseRoll strips whitespace and fixes the case of the separator', () => {
    expect(normaliseRoll('  2d6 + wis ')).toBe('2d6+WIS')
    expect(isValidRoll(normaliseRoll('  2d6 + wis '))).toBe(true)
    expect(normaliseRoll('1D8')).toBe('1d8')
    expect(normaliseRoll('1 d 8 + p r o f')).toBe('1d8+PROF')
    expect(normaliseRoll('\t2d6\n+3 ')).toBe('2d6+3')
  })

  /**
   * DEFECT (sheet.ts:118). `normaliseRoll` uppercases the whole string and then
   * lowercases *every* D, which is fine for the separator and wrong for the one
   * modifier token that contains a D. `1d8+DEX` normalises to `1d8+dEX`, which
   * `isValidRoll` then rejects — so a Dexterity-scaled entry cannot be saved at
   * all, and the message the form shows quotes a string the user never typed.
   * Every token in ROLL_MODIFIER_TOKENS has to survive its own normaliser.
   */
  test('every modifier token survives normalisation', () => {
    for (const token of ROLL_MODIFIER_TOKENS) {
      expect(normaliseRoll(`1d8+${token}`)).toBe(`1d8+${token}`)
      expect(isValidRoll(normaliseRoll(`1d8+${token.toLowerCase()}`))).toBe(true)
    }
  })

  test('normaliseRoll is idempotent and never throws on junk', () => {
    for (const raw of ['', '   ', '1d8', 'hello world', '2d6 + wis', '1d8+DEX', '\n\n', '𝔡6']) {
      const once = normaliseRoll(raw)
      expect(normaliseRoll(once)).toBe(once)
    }
  })

  /** Whatever the picker offers has to be storable as-is, without a second pass. */
  test('a normalised valid roll is a fixed point', () => {
    for (const roll of VALID) {
      expect(normaliseRoll(roll)).toBe(roll)
    }
  })
})

describe('normaliseSheet', () => {
  test('collapses a name but only trims an entry description', () => {
    const sheet = pc({
      className: '  War   lock  ',
      feats: [
        entry({
          name: '  Fire   Bolt ',
          text: '  First paragraph.\n\nSecond paragraph.  ',
        }),
      ],
    })
    const normalised = normaliseSheet(sheet) as PcSheet
    const [feat] = normalised.feats
    expect(normalised.className).toBe('War lock')
    expect(feat.name).toBe('Fire Bolt')
    // Trimmed, not collapsed: flattening the blank line would run a two-part
    // spell description into one paragraph.
    expect(feat.text).toBe('First paragraph.\n\nSecond paragraph.')
  })

  test('rounds every number on a PC sheet', () => {
    const sheet = pc({
      level: 3.6,
      armourClass: 15.4,
      maxHp: 22.5,
      abilities: { str: 13.5, dex: 11.4, con: 9.6, int: 10.2, wis: 12.8, cha: 10 },
      hitDice: { count: 2.4, faces: 10 },
      spells: [entry({ level: 2.6 })],
    })
    const normalised = normaliseSheet(sheet) as PcSheet
    expect(normalised.level).toBe(4)
    expect(normalised.armourClass).toBe(15)
    expect(normalised.maxHp).toBe(23)
    expect(normalised.abilities).toEqual({ str: 14, dex: 11, con: 10, int: 10, wis: 13, cha: 10 })
    expect(normalised.hitDice).toEqual({ count: 2, faces: 10 })
    expect(normalised.spells[0].level).toBe(3)
  })

  test('rounds every number on an NPC sheet and trims the notes', () => {
    const normalised = normaliseSheet(
      npc({
        armourClass: 13.5,
        maxHp: 44.4,
        initiativeBonus: -1.5,
        notes: '  Ambushes from the ledge.\nFlees below 5 hp.  ',
      }),
    ) as NpcSheet
    expect(normalised.armourClass).toBe(14)
    expect(normalised.maxHp).toBe(44)
    expect(normalised.initiativeBonus).toBe(-1)
    expect(normalised.notes).toBe('Ambushes from the ledge.\nFlees below 5 hp.')
  })

  test('turns an empty or whitespace-only roll into null, and normalises a real one', () => {
    const sheet = pc({
      feats: [
        entry({ id: 'a', roll: '' }),
        entry({ id: 'b', roll: '   ' }),
        entry({ id: 'c', roll: ' 2d6 + wis ' }),
        entry({ id: 'd', roll: null }),
      ],
    })
    expect((normaliseSheet(sheet) as PcSheet).feats.map((e) => e.roll)).toEqual([
      null,
      null,
      '2d6+WIS',
      null,
    ])
  })

  test('trims the id and turns an empty catalogue key into null', () => {
    const sheet = pc({
      feats: [
        entry({ id: '  f1  ', catalogueKey: '  fire-bolt  ' }),
        entry({ id: 'f2', catalogueKey: '   ' }),
      ],
    })
    const normalised = normaliseSheet(sheet) as PcSheet
    expect(normalised.feats[0].id).toBe('f1')
    expect(normalised.feats[0].catalogueKey).toBe('fire-bolt')
    expect(normalised.feats[1].catalogueKey).toBeNull()
  })

  /**
   * Both sides run this, and the mutation runs it over a sheet the browser has
   * already normalised. If a second pass differed from the first, a saved sheet
   * would not equal the one on screen.
   */
  test('is idempotent for both variants', () => {
    const messy: CharacterSheet[] = [
      pc({
        level: 3.5,
        className: '  Fighter  of   the   Ninth ',
        abilities: { str: 15.5, dex: 10.4, con: 12, int: 8.6, wis: 11, cha: 9 },
        armourClass: 16.5,
        maxHp: 30.5,
        hitDice: { count: 3.5, faces: 12 },
        feats: [entry({ id: ' f1 ', name: '  Second   Wind ', text: ' a\n\nb ', roll: ' 1d10 ' })],
        spells: [entry({ id: 's1', roll: ' 2d6 + wis ', level: 1.5, catalogueKey: ' x ' })],
      }),
      npc({
        armourClass: 12.5,
        maxHp: 9.5,
        initiativeBonus: 2.5,
        notes: '  a\n\n b  ',
        actions: [entry({ id: ' a1 ', name: ' Claw  Swipe ', roll: ' 1d6 + 2 ' })],
      }),
    ]
    for (const sheet of messy) {
      const once = normaliseSheet(sheet)
      expect(normaliseSheet(once)).toEqual(once)
    }
  })

  test('leaves an already-clean sheet untouched', () => {
    for (const sheet of [defaultPcSheet(), defaultNpcSheet()]) {
      expect(normaliseSheet(sheet)).toEqual(sheet)
    }
  })

  /** The stored document must not alias the caller's object: a later edit of one is not an edit of both. */
  test('does not mutate its argument or share the sub-objects', () => {
    const original = pc({
      abilities: { str: 15.5, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      feats: [entry()],
    })
    const snapshot = structuredClone(original)
    const normalised = normaliseSheet(original) as PcSheet
    expect(original).toEqual(snapshot)

    normalised.abilities.str = 3
    normalised.saveProficiencies.str = true
    normalised.feats.push(entry({ id: 'other' }))
    expect(original.abilities.str).toBe(15.5)
    expect(original.saveProficiencies.str).toBe(false)
    expect(original.feats).toHaveLength(1)
  })
})

describe('sheetProblem', () => {
  test('accepts both default sheets', () => {
    expect(sheetProblem(defaultPcSheet())).toBeNull()
    expect(sheetProblem(defaultNpcSheet())).toBeNull()
    expect(sheetProblem(defaultSheetFor('pc'))).toBeNull()
    expect(sheetProblem(defaultSheetFor('npc'))).toBeNull()
  })

  /**
   * Each bound checked from both sides of its edge in the same test, so a
   * comparison written with the wrong strictness fails on one half of the pair
   * whichever way it was written wrong.
   */
  test('accepts the exact bounds and rejects one step past them', () => {
    const cases: [string, CharacterSheet[], CharacterSheet[]][] = [
      [
        'armourClass',
        [pc({ armourClass: MIN_ARMOUR_CLASS }), pc({ armourClass: MAX_ARMOUR_CLASS })],
        [pc({ armourClass: MIN_ARMOUR_CLASS - 1 }), pc({ armourClass: MAX_ARMOUR_CLASS + 1 })],
      ],
      [
        'maxHp',
        [pc({ maxHp: MIN_MAX_HP }), pc({ maxHp: MAX_MAX_HP })],
        [pc({ maxHp: MIN_MAX_HP - 1 }), pc({ maxHp: MAX_MAX_HP + 1 })],
      ],
      [
        'level',
        [pc({ level: MIN_LEVEL }), pc({ level: MAX_LEVEL })],
        [pc({ level: MIN_LEVEL - 1 }), pc({ level: MAX_LEVEL + 1 })],
      ],
      [
        'hitDice.count',
        [pc({ hitDice: { count: 1, faces: 8 } }), pc({ hitDice: { count: MAX_HIT_DICE_COUNT, faces: 8 } })],
        [
          pc({ hitDice: { count: 0, faces: 8 } }),
          pc({ hitDice: { count: MAX_HIT_DICE_COUNT + 1, faces: 8 } }),
        ],
      ],
      [
        'initiativeBonus',
        [
          npc({ initiativeBonus: MAX_INITIATIVE_BONUS }),
          npc({ initiativeBonus: -MAX_INITIATIVE_BONUS }),
        ],
        [
          npc({ initiativeBonus: MAX_INITIATIVE_BONUS + 1 }),
          npc({ initiativeBonus: -MAX_INITIATIVE_BONUS - 1 }),
        ],
      ],
    ]

    for (const [path, good, bad] of cases) {
      for (const sheet of good) {
        expect(sheetProblem(sheet)).toBeNull()
      }
      for (const sheet of bad) {
        expect(sheetProblem(sheet)?.path).toBe(path)
      }
    }
  })

  test('accepts an ability score of 1 and 30 and refuses 0 or 31', () => {
    const base = defaultPcSheet().abilities
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(sheetProblem(pc({ abilities: { ...base, [ability]: MIN_ABILITY_SCORE } }))).toBeNull()
      expect(sheetProblem(pc({ abilities: { ...base, [ability]: MAX_ABILITY_SCORE } }))).toBeNull()
      expect(
        sheetProblem(pc({ abilities: { ...base, [ability]: MIN_ABILITY_SCORE - 1 } }))?.path,
      ).toBe(`abilities.${ability}`)
      expect(
        sheetProblem(pc({ abilities: { ...base, [ability]: MAX_ABILITY_SCORE + 1 } }))?.path,
      ).toBe(`abilities.${ability}`)
    }
  })

  /**
   * NaN is what an emptied number input produces and a perfectly valid float64
   * for Convex to store, so it has to be refused by name rather than left to a
   * range comparison — every comparison against NaN is false, including the ones
   * that would otherwise reject it.
   */
  test('refuses NaN and both infinities in every numeric field', () => {
    for (const value of NOT_A_NUMBER) {
      expect(sheetProblem(pc({ armourClass: value }))?.path).toBe('armourClass')
      expect(sheetProblem(pc({ maxHp: value }))?.path).toBe('maxHp')
      expect(sheetProblem(pc({ level: value }))?.path).toBe('level')
      expect(
        sheetProblem(pc({ abilities: { ...defaultPcSheet().abilities, wis: value } }))?.path,
      ).toBe('abilities.wis')
      expect(sheetProblem(pc({ hitDice: { count: value, faces: 8 } }))?.path).toBe('hitDice.count')
      expect(sheetProblem(npc({ initiativeBonus: value }))?.path).toBe('initiativeBonus')
      expect(
        sheetProblem(pc({ feats: [entry({ level: value })] }))?.path,
      ).toBe('feats[0].level')
    }
  })

  test('refuses a fractional value in every numeric field', () => {
    expect(sheetProblem(pc({ armourClass: 15.5 }))?.path).toBe('armourClass')
    expect(sheetProblem(pc({ maxHp: 10.5 }))?.path).toBe('maxHp')
    expect(sheetProblem(pc({ level: 2.5 }))?.path).toBe('level')
    expect(sheetProblem(pc({ hitDice: { count: 1.5, faces: 8 } }))?.path).toBe('hitDice.count')
    expect(sheetProblem(npc({ initiativeBonus: 1.5 }))?.path).toBe('initiativeBonus')
  })

  test('accepts every allowed hit die and refuses one that is not', () => {
    for (const faces of HIT_DIE_FACES) {
      expect(sheetProblem(pc({ hitDice: { count: 1, faces } }))).toBeNull()
    }
    for (const faces of [4, 7, 20, 0, -8]) {
      // Cast, because the literal union already rules these out at compile time
      // — the check exists for the runtime convex-test does not validate.
      expect(sheetProblem(pc({ hitDice: { count: 1, faces: faces as 6 } }))?.path).toBe(
        'hitDice.faces',
      )
    }
  })

  test('bounds the free text on both variants', () => {
    expect(sheetProblem(pc({ className: 'c'.repeat(MAX_CLASS_NAME_LENGTH) }))).toBeNull()
    expect(sheetProblem(pc({ className: 'c'.repeat(MAX_CLASS_NAME_LENGTH + 1) }))?.path).toBe(
      'className',
    )
    // An empty class is fine — a character in progress has not chosen one yet.
    expect(sheetProblem(pc({ className: '' }))).toBeNull()

    expect(sheetProblem(npc({ notes: 'n'.repeat(MAX_NPC_NOTES_LENGTH) }))).toBeNull()
    expect(sheetProblem(npc({ notes: 'n'.repeat(MAX_NPC_NOTES_LENGTH + 1) }))?.path).toBe('notes')
  })

  test('accepts exactly MAX_SHEET_ENTRIES and refuses one more, in every list', () => {
    expect(sheetProblem(pc({ feats: entries(MAX_SHEET_ENTRIES) }))).toBeNull()
    expect(sheetProblem(pc({ spells: entries(MAX_SHEET_ENTRIES) }))).toBeNull()
    expect(sheetProblem(npc({ actions: entries(MAX_SHEET_ENTRIES) }))).toBeNull()
    expect(sheetProblem(pc({ feats: entries(MAX_SHEET_ENTRIES + 1) }))?.path).toBe('feats')
    expect(sheetProblem(pc({ spells: entries(MAX_SHEET_ENTRIES + 1) }))?.path).toBe('spells')
    expect(sheetProblem(npc({ actions: entries(MAX_SHEET_ENTRIES + 1) }))?.path).toBe('actions')
  })

  /**
   * The id is a React key and Milestone 4's roll target, so a duplicate is not
   * cosmetic: rolling one entry would roll another.
   */
  test('refuses a missing, over-long or duplicated entry id', () => {
    expect(sheetProblem(pc({ feats: [entry({ id: '' })] }))?.path).toBe('feats[0].id')
    expect(
      sheetProblem(pc({ feats: [entry({ id: 'x'.repeat(MAX_ENTRY_ID_LENGTH + 1) })] }))?.path,
    ).toBe('feats[0].id')
    expect(sheetProblem(pc({ feats: [entry({ id: 'x'.repeat(MAX_ENTRY_ID_LENGTH) })] }))).toBeNull()

    const duplicated = pc({ feats: [entry({ id: 'same' }), entry({ id: 'same' })] })
    expect(sheetProblem(duplicated)).toEqual({
      path: 'feats[1].id',
      message: 'Two entries on this sheet share an id.',
    })
    expect(sheetProblem(npc({ actions: [entry({ id: 'same' }), entry({ id: 'same' })] }))?.path).toBe(
      'actions[1].id',
    )
  })

  /**
   * The uniqueness check is sheet-wide rather than per list, and this is the case
   * that distinguishes the two. `sheetEntriesOf` merges feats and spells into one
   * array — a React key set, and what Milestone 4 will aim a roll at — so an id
   * checked only within its own list would have enforced exactly the half of the
   * guarantee that does not matter.
   *
   * This suite originally pinned the opposite behaviour, having found that a feat
   * and a spell could share an id; the check was widened in response.
   */
  test('catches an id shared between the feats and spells lists', () => {
    const sheet = pc({ feats: [entry({ id: 'same' })], spells: [entry({ id: 'same' })] })
    expect(sheetProblem(sheet)).toEqual({
      path: 'spells[0].id',
      message: 'Two entries on this sheet share an id.',
    })
    // The reason it matters, stated as an assertion rather than as a comment: the
    // merged list silently loses an entry when two ids agree.
    expect(new Set(sheetEntriesOf(sheet).map((e) => e.id)).size).toBe(1)
  })

  test('refuses an entry with no name, and bounds the name and the text', () => {
    expect(sheetProblem(pc({ feats: [entry({ name: '' })] }))?.path).toBe('feats[0].name')
    expect(
      sheetProblem(pc({ feats: [entry({ name: 'n'.repeat(MAX_ENTRY_NAME_LENGTH) })] })),
    ).toBeNull()
    expect(
      sheetProblem(pc({ feats: [entry({ name: 'n'.repeat(MAX_ENTRY_NAME_LENGTH + 1) })] }))?.path,
    ).toBe('feats[0].name')
    expect(
      sheetProblem(pc({ feats: [entry({ text: 't'.repeat(MAX_ENTRY_TEXT_LENGTH) })] })),
    ).toBeNull()
    expect(
      sheetProblem(pc({ feats: [entry({ text: 't'.repeat(MAX_ENTRY_TEXT_LENGTH + 1) })] }))?.path,
    ).toBe('feats[0].text')
    // An entry with no description is fine; an entry with no name is not.
    expect(sheetProblem(pc({ feats: [entry({ text: '' })] }))).toBeNull()
  })

  test('refuses an entry whose roll is not a roll, and names it in the message', () => {
    expect(sheetProblem(pc({ feats: [entry({ roll: '1d8+WIS' })] }))).toBeNull()
    expect(sheetProblem(pc({ feats: [entry({ roll: null })] }))).toBeNull()
    const problem = sheetProblem(pc({ spells: [entry({ roll: '1d7' })] }))
    expect(problem?.path).toBe('spells[0].roll')
    expect(problem?.message).toContain('1d7')
    // An empty string is not null, and `normaliseSheet` is what turns one into
    // the other — an un-normalised sheet reaching the validator is refused.
    expect(sheetProblem(pc({ feats: [entry({ roll: '' })] }))?.path).toBe('feats[0].roll')
  })

  /** A cantrip is level 0, which is falsy — the easiest bound in the file to lose to a truthiness check. */
  test('accepts a cantrip at level 0 and refuses −1 or 10', () => {
    expect(sheetProblem(pc({ spells: [entry({ level: MIN_SPELL_LEVEL })] }))).toBeNull()
    expect(sheetProblem(pc({ spells: [entry({ level: MAX_SPELL_LEVEL })] }))).toBeNull()
    expect(sheetProblem(pc({ spells: [entry({ level: null })] }))).toBeNull()
    expect(sheetProblem(pc({ spells: [entry({ level: MIN_SPELL_LEVEL - 1 })] }))?.path).toBe(
      'spells[0].level',
    )
    expect(sheetProblem(pc({ spells: [entry({ level: MAX_SPELL_LEVEL + 1 })] }))?.path).toBe(
      'spells[0].level',
    )
    expect(sheetProblem(pc({ spells: [entry({ level: 1.5 })] }))?.path).toBe('spells[0].level')
  })

  test('bounds the catalogue key but accepts a null one', () => {
    expect(sheetProblem(pc({ feats: [entry({ catalogueKey: null })] }))).toBeNull()
    expect(
      sheetProblem(pc({ feats: [entry({ catalogueKey: 'k'.repeat(MAX_ENTRY_ID_LENGTH) })] })),
    ).toBeNull()
    expect(
      sheetProblem(pc({ feats: [entry({ catalogueKey: 'k'.repeat(MAX_ENTRY_ID_LENGTH + 1) })] }))
        ?.path,
    ).toBe('feats[0].catalogueKey')
  })

  test('reports the index of the offending entry, not the first one', () => {
    const sheet = pc({
      feats: [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c', roll: 'nope' })],
    })
    expect(sheetProblem(sheet)?.path).toBe('feats[2].roll')
  })

  test('checks the spells list as well as the feats list', () => {
    expect(sheetProblem(pc({ spells: [entry({ id: '' })] }))?.path).toBe('spells[0].id')
    // A problem in the feats list wins, because it is checked first.
    expect(sheetProblem(pc({ feats: [entry({ id: '' })], spells: [entry({ id: '' })] }))?.path).toBe(
      'feats[0].id',
    )
  })

  /**
   * The NPC branch returns before the PC checks, so nothing PC-shaped can be
   * demanded of a monster — no level, no abilities, no hit dice.
   */
  test('does not apply the PC-only bounds to an NPC', () => {
    expect(sheetProblem(npc({ armourClass: 0, maxHp: 1, initiativeBonus: 0 }))).toBeNull()
  })

  test('every problem carries a non-empty message as well as a path', () => {
    const broken: CharacterSheet[] = [
      pc({ armourClass: 99 }),
      pc({ maxHp: 0 }),
      pc({ level: 0 }),
      pc({ className: 'c'.repeat(200) }),
      pc({ abilities: { ...defaultPcSheet().abilities, str: 0 } }),
      pc({ hitDice: { count: 0, faces: 8 } }),
      pc({ hitDice: { count: 1, faces: 7 as 6 } }),
      pc({ feats: entries(MAX_SHEET_ENTRIES + 1) }),
      pc({ feats: [entry({ id: '' })] }),
      pc({ feats: [entry({ name: '' })] }),
      pc({ spells: [entry({ roll: 'x' })] }),
      pc({ spells: [entry({ level: 10 })] }),
      npc({ initiativeBonus: 99 }),
      npc({ notes: 'n'.repeat(MAX_NPC_NOTES_LENGTH + 1) }),
    ]
    for (const sheet of broken) {
      const problem = sheetProblem(sheet)
      expect(problem).not.toBeNull()
      expect(problem?.path.length).toBeGreaterThan(0)
      expect(problem?.message.length).toBeGreaterThan(0)
    }
  })

  /** Validation must not quietly repair what it is inspecting. */
  test('does not mutate the sheet it inspects', () => {
    const sheet = pc({ feats: [entry({ id: 'a' })], spells: [entry({ id: 'b' })] })
    const snapshot = structuredClone(sheet)
    sheetProblem(sheet)
    expect(sheet).toEqual(snapshot)
  })
})

describe('resolveSheet, kindOf and the defaults', () => {
  test('a document with no sheet reads as a player character with defaults', () => {
    expect(resolveSheet({})).toEqual(defaultPcSheet())
    expect(kindOf({})).toBe('pc')
    expect(resolveSheet({ sheet: undefined })).toEqual(defaultPcSheet())
  })

  test('a document with a sheet reads as that sheet', () => {
    const stored = npc({ maxHp: 33, notes: 'Hidden in the rafters.' })
    expect(resolveSheet({ sheet: stored })).toBe(stored)
    expect(kindOf({ sheet: stored })).toBe('npc')

    const hero = pc({ level: 7 })
    expect(resolveSheet({ sheet: hero })).toBe(hero)
    expect(kindOf({ sheet: hero })).toBe('pc')
  })

  /**
   * The defaults must be built fresh on every call. A module-level constant
   * returned by reference would give every legacy character the same abilities
   * object, and the first edit to one would silently rewrite all the others.
   */
  test('defaultPcSheet hands back a fresh object every time', () => {
    const first = defaultPcSheet()
    first.abilities.str = 20
    first.saveProficiencies.dex = true
    first.hitDice.count = 9
    first.feats.push(entry())
    first.spells.push(entry())
    first.level = 12

    expect(defaultPcSheet()).toEqual({
      kind: 'pc',
      level: 1,
      className: '',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
      armourClass: 10,
      maxHp: 10,
      hitDice: { count: 1, faces: 8 },
      feats: [],
      spells: [],
    })
    expect(defaultPcSheet().abilities).not.toBe(first.abilities)
  })

  test('defaultNpcSheet hands back a fresh object every time', () => {
    const first = defaultNpcSheet()
    first.actions.push(entry())
    first.notes = 'edited'
    first.maxHp = 400
    expect(defaultNpcSheet()).toEqual({
      kind: 'npc',
      armourClass: 12,
      maxHp: 10,
      initiativeBonus: 0,
      actions: [],
      notes: '',
    })
    expect(defaultNpcSheet().actions).not.toBe(first.actions)
  })

  /** The same freshness through the accessor, which is where a legacy character gets one. */
  test('two sheet-less documents do not share a sheet', () => {
    const a = resolveSheet({}) as PcSheet
    a.abilities.dex = 18
    a.feats.push(entry())
    const b = resolveSheet({}) as PcSheet
    expect(b.abilities.dex).toBe(10)
    expect(b.feats).toHaveLength(0)
    expect(b).not.toBe(a)
  })

  test('defaultSheetFor picks the variant and both defaults validate', () => {
    expect(defaultSheetFor('pc').kind).toBe('pc')
    expect(defaultSheetFor('npc').kind).toBe('npc')
    for (const sheet of [defaultPcSheet(), defaultNpcSheet()]) {
      expect(normaliseSheet(sheet)).toEqual(sheet)
      expect(sheetProblem(normaliseSheet(sheet))).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Milestone 4: the two optional fields, the thirteen skills, and the preset
// ---------------------------------------------------------------------------

describe('skillProficienciesValidator', () => {
  /**
   * **The test lib/sheet.ts promises in a comment.** The thirteen skill names
   * are written out here and again in `SKILL_KEYS` in lib/skills.ts, and the
   * duplication is deliberate rather than lazy: `skillBonus` needs
   * `abilityModifier` and `proficiencyBonus` from this module, so skills.ts
   * imports values from sheet.ts, and a validator here that imported values
   * back would close a runtime cycle at module scope — where both sides are
   * evaluated eagerly and one of them would see an empty object.
   *
   * What the split costs is that the two lists can drift, and the comment on
   * the validator says the cost is "checked by machine rather than by memory".
   * This is the machine. Both directions matter and neither is theoretical: a
   * skill in `SKILL_KEYS` but not the validator is a flag Convex refuses to
   * store, and a skill in the validator but not `SKILL_KEYS` is a flag the
   * sheet never shows and `noSkillProficiencies` never sets.
   */
  test('has exactly the thirteen fields of SKILL_KEYS', () => {
    const fields = Object.keys(skillProficienciesValidator.fields)
    expect([...fields].sort()).toEqual([...SKILL_KEYS].sort())
    expect(fields).toHaveLength(13)
    expect(SKILL_KEYS).toHaveLength(13)
  })

  /** Every one of them a required boolean — an optional flag would be a fourth state. */
  test('declares every skill as a required boolean', () => {
    for (const [key, field] of Object.entries(skillProficienciesValidator.fields)) {
      expect(field.kind, key).toBe('boolean')
      expect(field.isOptional, key).toBe('required')
    }
  })

  /** And `noSkills` fills every field the validator declares, with nothing left over. */
  test('agrees with noSkills, which is what a defaulted sheet gets', () => {
    expect(Object.keys(noSkills()).sort()).toEqual([...SKILL_KEYS].sort())
    expect(Object.values(noSkills()).every((flag) => flag === false)).toBe(true)
  })
})

describe('skillProficienciesOf and speedOf', () => {
  /**
   * The two fields Milestone 3 shipped without, and the accessors that exist so
   * their default lives in exactly one place. Adding a required field to a
   * table that already has rows fails the schema push, so both are optional in
   * the validator for ever — which makes reading one directly a bug waiting for
   * the first legacy character to be opened.
   */
  test('a sheet with neither field reads as untrained and 35 feet', () => {
    const legacy = defaultPcSheet()
    expect(legacy.skillProficiencies).toBeUndefined()
    expect(legacy.speed).toBeUndefined()
    expect(skillProficienciesOf(legacy)).toEqual(noSkills())
    expect(speedOf(legacy)).toBe(SPEED_FEET)
  })

  test('a sheet with the fields reads them back', () => {
    const trained = { ...noSkills(), stealth: true, perception: true }
    const sheet = pc({ skillProficiencies: trained, speed: 45 })
    expect(skillProficienciesOf(sheet)).toEqual(trained)
    expect(speedOf(sheet)).toBe(45)
  })

  /**
   * A monster has no skills and no speed of its own — the reduced sheet is an
   * armour class, hit points, an initiative bonus and a list of things it does.
   * Asking anyway must give the defaults rather than throwing or reading a
   * field that is not there.
   */
  test('an NPC reads as untrained and at the default speed', () => {
    expect(skillProficienciesOf(npc())).toEqual(noSkills())
    expect(speedOf(npc())).toBe(SPEED_FEET)
  })

  /**
   * `speedOf` guards non-finite as well as absent, which the `??` written out
   * by hand at a call site would not: a stored NaN is a perfectly valid Convex
   * float64, and `35` is a better answer on screen than `NaN ft`.
   */
  test('speedOf repairs a nonsense stored speed', () => {
    for (const speed of NOT_A_NUMBER) {
      expect(speedOf(pc({ speed }))).toBe(SPEED_FEET)
    }
    // A zero or a negative is not repaired, and should not be: those are
    // numbers a DM can mean, and the override field exists to let them.
    expect(speedOf(pc({ speed: 0 }))).toBe(0)
    expect(speedOf(pc({ speed: -5 }))).toBe(-5)
  })

  /** A fresh object per call, like `defaultPcSheet` — two sheets must not share one. */
  test('two defaulted sheets do not share a skills object', () => {
    const first = skillProficienciesOf(defaultPcSheet())
    first.stealth = true
    expect(skillProficienciesOf(defaultPcSheet()).stealth).toBe(false)
  })
})

describe('storedSheetProblem on a preset', () => {
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

  test('accepts a plain set of selections, and every class and archetype', () => {
    expect(storedSheetProblem(preset())).toBeNull()
    for (const definition of CLASSES) {
      expect(
        storedSheetProblem(preset({ classKey: definition.key, subclassKey: null, level: 1 })),
        definition.key,
      ).toBeNull()
      for (const subclass of definition.subclasses) {
        expect(
          storedSheetProblem(
            preset({ classKey: definition.key, subclassKey: subclass.key, level: 5 }),
          ),
          `${definition.key}/${subclass.key}`,
        ).toBeNull()
      }
    }
    for (const race of RACE_KEYS) {
      expect(storedSheetProblem(preset({ race })), race).toBeNull()
    }
  })

  test('bounds the level from both sides, and refuses a fraction or a NaN', () => {
    expect(storedSheetProblem(preset({ level: MIN_LEVEL, subclassKey: null }))).toBeNull()
    expect(storedSheetProblem(preset({ level: MAX_LEVEL }))).toBeNull()
    for (const level of [MIN_LEVEL - 1, MAX_LEVEL + 1, 2.5, ...NOT_A_NUMBER]) {
      expect(storedSheetProblem(preset({ level }))?.path, String(level)).toBe('level')
    }
  })

  /**
   * An archetype belongs to exactly one class, and the two are stored in
   * separate fields — so nothing but this check stops a fighter being saved as
   * a Thief. It matters more than it looks: `librarySheet` would find no path
   * for the key and the character would silently resolve to a level 1 sheet
   * with the wrong name, which reads as "levelling up did nothing" rather than
   * as an error.
   */
  test("refuses an archetype that belongs to another class, naming every class's own", () => {
    for (const definition of CLASSES) {
      for (const other of CLASSES) {
        if (other.key === definition.key) continue
        for (const subclass of other.subclasses) {
          const problem = storedSheetProblem(
            preset({ classKey: definition.key, subclassKey: subclass.key, level: 3 }),
          )
          expect(problem?.path, `${definition.key} + ${subclass.key}`).toBe('subclassKey')
        }
      }
    }
    expect(storedSheetProblem(preset({ subclassKey: 'not-an-archetype' }))?.path).toBe('subclassKey')
    // The empty string is not "no archetype" — null is. An empty key would be a
    // lookup miss dressed up as a choice.
    expect(storedSheetProblem(preset({ subclassKey: '' }))?.path).toBe('subclassKey')
  })

  /**
   * An archetype is chosen at level 2 and this refuses one before then, which
   * is the write-side half of a deliberately asymmetric pair: `librarySheet`
   * *tolerates* an unknown archetype on read so a character that chose a
   * since-retired one stays readable, while nothing may choose one now.
   */
  test('refuses an archetype chosen below level 2, and allows null at any level', () => {
    const early = storedSheetProblem(preset({ level: 1 }))
    expect(early?.path).toBe('subclassKey')
    expect(early?.message).toContain(String(SUBCLASS_LEVEL))
    for (const level of [MIN_LEVEL, SUBCLASS_LEVEL, 5, MAX_LEVEL]) {
      // No archetype is always fine, at every level — a character can sit at
      // level 5 undecided, and the library shows them level 1 until they choose.
      expect(storedSheetProblem(preset({ subclassKey: null, level })), `level ${level}`).toBeNull()
    }
    // And level 2 is the first at which one may be chosen — the boundary from
    // both sides, so a `<` written as `<=` fails on one half of the pair.
    expect(storedSheetProblem(preset({ level: SUBCLASS_LEVEL }))).toBeNull()
    expect(storedSheetProblem(preset({ level: SUBCLASS_LEVEL - 1 }))?.path).toBe('subclassKey')
  })

  /**
   * The DM's extra entries get the ordinary entry checks, because an override
   * is a place a bad roll spec or a missing id can enter just as easily as a
   * feat list — and it is the place least likely to be looked at, since it is
   * typed once and then read live for ever.
   */
  test('checks the entries inside the overrides', () => {
    const good = entry({ id: 'dm-1' })
    expect(storedSheetProblem(preset({ overrides: { extraFeats: [good] } }))).toBeNull()
    expect(storedSheetProblem(preset({ overrides: { extraSpells: [good] } }))).toBeNull()
    expect(storedSheetProblem(preset({ overrides: {} }))).toBeNull()

    expect(
      storedSheetProblem(preset({ overrides: { extraFeats: [entry({ id: '' })] } }))?.path,
    ).toBe('overrides.extraFeats[0].id')
    expect(
      storedSheetProblem(preset({ overrides: { extraFeats: [entry({ name: '' })] } }))?.path,
    ).toBe('overrides.extraFeats[0].name')
    expect(
      storedSheetProblem(preset({ overrides: { extraSpells: [entry({ roll: '1d7' })] } }))?.path,
    ).toBe('overrides.extraSpells[0].roll')
    expect(
      storedSheetProblem(preset({ overrides: { extraSpells: [entry({ level: 10 })] } }))?.path,
    ).toBe('overrides.extraSpells[0].level')
    expect(
      storedSheetProblem(
        preset({ overrides: { extraFeats: entries(MAX_SHEET_ENTRIES + 1) } }),
      )?.path,
    ).toBe('overrides.extraFeats')
  })

  /**
   * One `seen` set across both override lists, matching what `sheetProblem`
   * does for feats and spells — and for the same reason, since the two are
   * appended to one sheet and then merged into one React key set.
   */
  test('catches an id shared between extraFeats and extraSpells', () => {
    const problem = storedSheetProblem(
      preset({
        overrides: { extraFeats: [entry({ id: 'same' })], extraSpells: [entry({ id: 'same' })] },
      }),
    )
    expect(problem).toEqual({
      path: 'overrides.extraSpells[0].id',
      message: 'Two entries on this sheet share an id.',
    })
  })

  /**
   * A preset holds no numbers, so there is nothing here to round but the level
   * — and the selections have to survive the trip byte for byte, or a
   * normalised sheet would be a different character from the one that was
   * typed.
   */
  test('normaliseStoredSheet rounds only the level and keeps every selection', () => {
    const messy = preset({ level: 3.6, overrides: { armourClass: 21 } })
    const tidied = normaliseStoredSheet(messy) as PresetSheet
    expect(tidied.level).toBe(4)
    expect(tidied.race).toBe(messy.race)
    expect(tidied.classKey).toBe(messy.classKey)
    expect(tidied.subclassKey).toBe(messy.subclassKey)
    expect(tidied.locked).toBe(messy.locked)
    expect(tidied.overrides).toEqual(messy.overrides)
    expect(normaliseStoredSheet(tidied)).toEqual(tidied)
  })

  /** The other two stored shapes still go through `sheetProblem` untouched. */
  test('delegates to sheetProblem for a pc or npc sheet', () => {
    const shapes: CharacterSheet[] = [defaultPcSheet(), defaultNpcSheet()]
    for (const sheet of shapes) {
      const stored: StoredSheet = sheet
      expect(storedSheetProblem(stored)).toBeNull()
      expect(normaliseStoredSheet(stored)).toEqual(normaliseSheet(sheet))
    }
    expect(storedSheetProblem(pc({ armourClass: 99 }))?.path).toBe('armourClass')
    expect(storedSheetProblem(npc({ initiativeBonus: 99 }))?.path).toBe('initiativeBonus')
  })

  /** Validation must not quietly repair the selections it is inspecting. */
  test('does not mutate the preset it inspects', () => {
    const stored = preset({ overrides: { extraFeats: [entry()], maxHp: 40 } })
    const snapshot = structuredClone(stored)
    storedSheetProblem(stored)
    expect(stored).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// The entry taxonomy: `category`, `toHit`, and the arity rule between them.
//
// ⚠️ **Both fields are optional, and that is what makes this section hard to
// write honestly.** A fixture that silently dropped either would produce exactly
// the same green tick as one that carried it correctly — the entry would simply
// read as a pre-milestone entry, which is a shape everything here is required to
// accept. So the assertions below are about **presence and absence** wherever a
// dropped field and a correctly-absent field would otherwise look identical,
// using `'toHit' in entry` rather than `entry.toHit === undefined`: the second is
// true of a key that is present and holding `undefined`, which is a different
// document as far as Convex is concerned.
// ---------------------------------------------------------------------------

/**
 * An entry exactly as it was written **before this milestone**: neither key
 * present at all.
 *
 * Spelled out rather than built from `entry()` so that the shape is visible at
 * the point of use, and so that adding a default `category` to `entry()` later
 * cannot quietly turn every legacy test in this file into a modern one.
 */
function legacyEntry(overrides: Partial<SheetEntry> = {}): SheetEntry {
  const built: SheetEntry = {
    id: 'legacy-1',
    name: 'Something From Before',
    text: 'Typed in by a DM in Milestone 3.',
    roll: null,
    level: null,
    catalogueKey: null,
    ...overrides,
  }
  return built
}

/** A category the union has never heard of, as a deployment skew would deliver one. */
const ALIEN_CATEGORY = 'legendary' as unknown as SheetEntryCategory

describe('the category union, its validator and its labels', () => {
  /**
   * `SHEET_ENTRY_CATEGORIES` is a type and `sheetEntryCategoryValidator` is a
   * value, and sheet.ts writes the three names out twice on purpose — "a Convex
   * validator is a value and the list is a type, and the one test pinning the two
   * together is cheaper than the generic that would build one from the other."
   *
   * This is that one test. Without it the two copies are free to disagree, and the
   * direction that hurts is a category the code accepts and the *schema* refuses,
   * which surfaces as a save that fails against the real deployment and passes
   * against convex-test — the class of failure only `npm run test:smoke` has ever
   * caught here.
   */
  test('the validator admits exactly the three categories, in the same order', () => {
    const members = (sheetEntryCategoryValidator as unknown as {
      members: { kind: string; value: unknown }[]
    }).members
    expect(members.map((member) => member.kind)).toEqual(['literal', 'literal', 'literal'])
    expect(members.map((member) => member.value)).toEqual([...SHEET_ENTRY_CATEGORIES])
  })

  /**
   * The labels are documented as being "in the order the sections appear", so the
   * order is part of the contract rather than incidental to how the object was
   * typed. A `Record` keyed by the union catches a *missing* key at compile time
   * and says nothing at all about the order they were written in.
   */
  test('every category has a non-empty heading, in section order', () => {
    expect(Object.keys(SHEET_ENTRY_CATEGORY_LABELS)).toEqual([...SHEET_ENTRY_CATEGORIES])
    for (const category of SHEET_ENTRY_CATEGORIES) {
      expect(SHEET_ENTRY_CATEGORY_LABELS[category].trim(), category).not.toBe('')
    }
    // Three distinct headings — two sections sharing one would be a sheet that
    // reads as though it had lost a list.
    expect(new Set(Object.values(SHEET_ENTRY_CATEGORY_LABELS)).size).toBe(3)
  })

  test('there are exactly three of them and no duplicates', () => {
    expect([...SHEET_ENTRY_CATEGORIES]).toEqual(['weapon', 'action', 'passive'])
    expect(new Set(SHEET_ENTRY_CATEGORIES).size).toBe(SHEET_ENTRY_CATEGORIES.length)
  })
})

describe('rollShapeOf', () => {
  test('states how many rolls each category promises', () => {
    expect(rollShapeOf('weapon')).toEqual({ toHit: true, roll: true })
    expect(rollShapeOf('action')).toEqual({ toHit: false, roll: true })
    expect(rollShapeOf('passive')).toEqual({ toHit: false, roll: false })
  })

  /**
   * Only a weapon promises a second field, which is the property `categoryOf`'s
   * doc leans on when it rules `weapon` out as a possible default: a default that
   * asserted a `toHit` exists would promise one that no legacy entry has.
   */
  test('only a weapon asks for a to-hit, and a passive asks for nothing', () => {
    const asking = SHEET_ENTRY_CATEGORIES.filter((category) => rollShapeOf(category).toHit)
    expect(asking).toEqual(['weapon'])
    const rolling = SHEET_ENTRY_CATEGORIES.filter((category) => rollShapeOf(category).roll)
    expect(rolling).toEqual(['weapon', 'action'])
  })

  /** The fail-closed runtime default, reachable only by casting past the compiler. */
  test('an unrecognised category promises nothing', () => {
    expect(rollShapeOf(ALIEN_CATEGORY)).toEqual({ toHit: false, roll: false })
  })
})

describe('categoryOf', () => {
  /**
   * **The derived default, which is a stored fact restated rather than a guess.**
   * `roll === null` is the definition of a passive, so an entry written before the
   * field existed already records the one thing the category turns on.
   */
  test('an entry with no category and no roll is a passive', () => {
    expect(categoryOf(legacyEntry({ roll: null }))).toBe('passive')
  })

  test('an entry with no category but a roll is an action', () => {
    expect(categoryOf(legacyEntry({ roll: '2d6' }))).toBe('action')
    expect(categoryOf(legacyEntry({ roll: '1d8+WIS' }))).toBe('action')
  })

  /**
   * ⚠️ **Never `weapon`.** It is the only category that asserts a second field
   * exists, and nothing distinguishes a greatsword's `1d8+STR` from Cure Wounds'
   * `2d8+WIS` — so a default of `weapon` would announce a heal as an attack. This
   * is asserted over both roll shapes rather than assumed from the two tests above.
   */
  test('and never guesses weapon, whatever the roll looks like', () => {
    for (const roll of [null, '1d8+STR', '2d6', '1d20+PROF', '1d10+DEX+PROF']) {
      expect(categoryOf(legacyEntry({ roll })), `roll ${roll}`).not.toBe('weapon')
    }
  })

  test('a stored category is returned as it was stored', () => {
    for (const category of SHEET_ENTRY_CATEGORIES) {
      // Paired with a coherent roll, so the answer cannot be coming from the
      // derivation by coincidence.
      const roll = rollShapeOf(category).roll ? '1d8' : null
      expect(categoryOf(legacyEntry({ category, roll })), category).toBe(category)
    }
  })

  /**
   * And returned as stored even when the roll disagrees with it — the accessor
   * reads a field, it does not adjudicate one. An incoherent pair is
   * `entriesProblem`'s to refuse, and a `categoryOf` that quietly corrected one
   * would make that refusal unreachable.
   */
  test('a stored category wins over the derivation, even when the two disagree', () => {
    expect(categoryOf(legacyEntry({ category: 'passive', roll: '2d6' }))).toBe('passive')
    expect(categoryOf(legacyEntry({ category: 'action', roll: null }))).toBe('action')
    expect(categoryOf(legacyEntry({ category: 'weapon', roll: null }))).toBe('weapon')
  })

  /**
   * A schema push is not atomic, so a document written by a newer deployment can
   * be read by an older one. An unknown category falls back to the derived default
   * rather than being handed on to a `switch` that has never heard of it.
   */
  test('a category outside the union reads as the derived default', () => {
    expect(categoryOf(legacyEntry({ category: ALIEN_CATEGORY, roll: null }))).toBe('passive')
    expect(categoryOf(legacyEntry({ category: ALIEN_CATEGORY, roll: '2d6' }))).toBe('action')
  })

  /**
   * ⚠️ **A discrepancy between `rollShapeOf`'s doc comment and what the save path
   * actually does, pinned here as behaviour rather than papered over.**
   *
   * That comment argues its runtime default of "a passive" is fail-closed because
   * "an entry carrying rolls is *refused on save* by `entriesProblem`". It is not,
   * and cannot be: `entriesProblem` asks `rollShapeOf(categoryOf(entry))`, and
   * `categoryOf` has already replaced the unknown category with the derived
   * default — so `rollShapeOf` is never handed one, its default branch is
   * unreachable from the save path, and the entry is **accepted**.
   *
   * That is arguably the better outcome (an entry with a roll really is an action
   * as far as anything downstream can tell) but it is not what the comment says
   * happens, and the next person to rely on the refusal should find this test.
   */
  test('and is therefore accepted on save rather than refused, whatever rollShapeOf says', () => {
    const alien = legacyEntry({ id: 'x1', category: ALIEN_CATEGORY, roll: '2d6' })
    expect(rollShapeOf(ALIEN_CATEGORY)).toEqual({ toHit: false, roll: false })
    expect(categoryOf(alien)).toBe('action')
    expect(sheetProblem(pc({ feats: [alien] }))).toBeNull()
  })
})

describe('toHitOf', () => {
  test('reads a weapon its to-hit', () => {
    expect(toHitOf(legacyEntry({ category: 'weapon', roll: '1d8+STR', toHit: '1d20+STR+PROF' })))
      .toBe('1d20+STR+PROF')
    expect(toHitOf(legacyEntry({ category: 'weapon', roll: '2d6', toHit: '1d20+4' }))).toBe('1d20+4')
  })

  /**
   * ⚠️ **Null on anything that is not a weapon, whatever the document says.**
   *
   * Unreachable through a validated sheet, because `entriesProblem` refuses a
   * stored to-hit on an action or a passive — and kept for the seconds after a
   * deploy when a document written by newer code is read by older code. A to-hit
   * that outlives its category is a roll nobody asked for, arriving on a line that
   * announces "uses".
   */
  test('refuses to read a to-hit off an action or a passive that carries one anyway', () => {
    expect(toHitOf(legacyEntry({ category: 'action', roll: '2d6', toHit: '1d20+9' }))).toBeNull()
    expect(toHitOf(legacyEntry({ category: 'passive', roll: null, toHit: '1d20+9' }))).toBeNull()
  })

  /**
   * And the same for an entry that has a to-hit but **no** category — which reads
   * as an action or a passive by derivation and so gets the same refusal. This is
   * the case a real deployment skew would actually produce.
   */
  test('and off an entry with no category at all', () => {
    expect(toHitOf(legacyEntry({ roll: '2d6', toHit: '1d20+9' }))).toBeNull()
    expect(toHitOf(legacyEntry({ roll: null, toHit: '1d20+9' }))).toBeNull()
    expect(toHitOf(legacyEntry({ category: ALIEN_CATEGORY, roll: '2d6', toHit: '1d20+9' })))
      .toBeNull()
  })

  test('an empty to-hit is no to-hit', () => {
    expect(toHitOf(legacyEntry({ category: 'weapon', roll: '1d8', toHit: '' }))).toBeNull()
  })

  test('an absent to-hit is no to-hit', () => {
    expect(toHitOf(legacyEntry({ category: 'weapon', roll: '1d8' }))).toBeNull()
    expect(toHitOf(legacyEntry({ roll: null }))).toBeNull()
  })
})

describe('toHitFromBonus', () => {
  /**
   * ⚠️ **Never `1d20+0`.** `ROLL_PATTERN` would accept it — `\d{1,3}` matches `0` —
   * so the grammar is not the guard and the check has to be explicit. A bare
   * `1d20` is what a creature with no bonus rolls.
   */
  test('a bonus of zero is a bare 1d20, and negative zero is too', () => {
    expect(toHitFromBonus(0)).toBe('1d20')
    expect(toHitFromBonus(-0)).toBe('1d20')
    // `Math.round(-0.3)` is `-0`, which is the way negative zero actually arrives.
    expect(toHitFromBonus(-0.3)).toBe('1d20')
    expect(toHitFromBonus(-0.5)).toBe('1d20')
    expect(toHitFromBonus(0.4)).toBe('1d20')
  })

  test('a positive bonus is added and a negative one subtracted', () => {
    expect(toHitFromBonus(4)).toBe('1d20+4')
    expect(toHitFromBonus(1)).toBe('1d20+1')
    expect(toHitFromBonus(12)).toBe('1d20+12')
    // A Giant Rat is worse at hitting than nothing at all, which is why the bound
    // goes below zero.
    expect(toHitFromBonus(-1)).toBe('1d20-1')
    expect(toHitFromBonus(-2)).toBe('1d20-2')
  })

  test('a fractional bonus is rounded rather than refused', () => {
    expect(toHitFromBonus(3.4)).toBe('1d20+3')
    expect(toHitFromBonus(3.5)).toBe('1d20+4')
    expect(toHitFromBonus(-2.6)).toBe('1d20-3')
  })

  /** A non-finite float64 reaches a stored document the same way it reaches a speed. */
  test('a nonsense bonus is a bare 1d20 rather than a nonsense roll', () => {
    for (const value of NOT_A_NUMBER) {
      expect(toHitFromBonus(value), String(value)).toBe('1d20')
    }
  })

  /**
   * **The property, over the whole stored range.** `MIN_ATTACK_BONUS` to
   * `MAX_ATTACK_BONUS` is every bonus a validated sheet can hold, and every one of
   * them has to come back out as something `isValidRoll` accepts — otherwise a
   * creature the database stored happily has an attack the roll grammar refuses.
   */
  test('every bonus in range produces a roll the grammar accepts', () => {
    for (let bonus = MIN_ATTACK_BONUS; bonus <= MAX_ATTACK_BONUS; bonus += 1) {
      const roll = toHitFromBonus(bonus)
      expect(isValidRoll(roll), `${bonus} → ${roll}`).toBe(true)
      expect(roll.startsWith('1d20'), `${bonus} → ${roll}`).toBe(true)
      expect(roll.length, `${bonus} → ${roll}`).toBeLessThanOrEqual(MAX_ROLL_LENGTH)
    }
  })

  /**
   * And never a zero term, over a sweep wide enough to include every way one could
   * be produced: the integer zero, both signed zeroes, and the fractions that round
   * to them.
   */
  test('and never emits a zero term', () => {
    const sweep: number[] = [...NOT_A_NUMBER, 0, -0, 0.49, -0.49, 0.5, -0.5]
    for (let bonus = MIN_ATTACK_BONUS - 5; bonus <= MAX_ATTACK_BONUS + 5; bonus += 0.25) {
      sweep.push(bonus)
    }
    for (const bonus of sweep) {
      const roll = toHitFromBonus(bonus)
      expect(roll, String(bonus)).not.toContain('+0')
      expect(roll, String(bonus)).not.toContain('-0')
      expect(isValidRoll(roll), `${bonus} → ${roll}`).toBe(true)
    }
  })

  /**
   * The grammar has the last word rather than the arithmetic. `\d{1,3}` cannot
   * hold four digits, so a bonus far outside the stored bounds falls back to a bare
   * `1d20` rather than producing a string the validator would refuse — the same
   * stance the foot of `scaleRoll` takes.
   */
  test('a bonus too large for the grammar falls back rather than escaping it', () => {
    expect(toHitFromBonus(999)).toBe('1d20+999')
    expect(toHitFromBonus(1000)).toBe('1d20')
    expect(toHitFromBonus(-1000)).toBe('1d20')
  })

  test('is a pure function of its argument', () => {
    expect(toHitFromBonus(7)).toBe(toHitFromBonus(7))
    expect(toHitFromBonus(7)).toBe('1d20+7')
  })
})

describe('normaliseSheet carries the entry taxonomy', () => {
  /**
   * ⚠️ **The assertion this file has never had, and the one the milestone turns
   * on.** `normaliseEntry` rebuilds an entry field by field — which is deliberate,
   * it is what stops an unknown field riding into the database — and this codebase
   * has twice shipped a field added to a validator and not added to a rebuild,
   * silently discarded on every write with the form still showing the value it had
   * just binned. Both times only `npm run test:smoke` caught it.
   *
   * Both new fields are optional, so a rebuild that dropped them would produce a
   * perfectly valid entry and every other test in this file would stay green.
   * Presence is therefore asserted directly.
   */
  test('both fields survive a round trip through the normaliser', () => {
    const sheet = pc({
      feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8+STR', toHit: '1d20+STR+PROF' })],
      spells: [entry({ id: 's1', category: 'action', roll: '2d8+WIS', level: 1 })],
    })
    const out = normaliseSheet(sheet) as PcSheet
    const weapon = out.feats[0] as unknown as Record<string, unknown>
    expect('category' in weapon).toBe(true)
    expect('toHit' in weapon).toBe(true)
    expect(weapon.category).toBe('weapon')
    expect(weapon.toHit).toBe('1d20+STR+PROF')
    const action = out.spells[0] as unknown as Record<string, unknown>
    expect(action.category).toBe('action')
    expect('toHit' in action).toBe(false)
  })

  /** The same on the other variant, where a monster's actions live. */
  test('and on an NPC sheet, whose actions share the shape', () => {
    const out = normaliseSheet(
      npc({ actions: [entry({ id: 'a1', category: 'weapon', roll: '2d6+3', toHit: '1d20+5' })] }),
    ) as NpcSheet
    const action = out.actions[0] as unknown as Record<string, unknown>
    expect('category' in action).toBe(true)
    expect('toHit' in action).toBe(true)
    expect(action).toMatchObject({ category: 'weapon', toHit: '1d20+5' })
  })

  /**
   * A to-hit goes through `normaliseRoll` for the reason the damage does: a
   * hand-typed `1d20 + str` and a picked `1d20+STR` must end up byte-identical
   * rather than merely equivalent, or the picker's "already has this one"
   * comparison is against a string nobody stored.
   */
  test('a hand-typed to-hit is normalised exactly as a hand-typed roll is', () => {
    const out = normaliseSheet(
      pc({
        feats: [
          entry({ id: 'f1', category: 'weapon', roll: '1d8 + str', toHit: '1d20 + str + prof' }),
        ],
      }),
    ) as PcSheet
    expect(out.feats[0].roll).toBe('1d8+STR')
    expect(out.feats[0].toHit).toBe('1d20+STR+PROF')
  })

  /**
   * `DEX` is the one modifier token containing a `D`, and the separator is
   * lowercased only between two digits precisely so that a to-hit scaled off it
   * survives. The damage half of this is already covered; the to-hit is a second
   * field with the same hazard.
   */
  test('and a DEX to-hit survives the separator rule that once destroyed it', () => {
    const out = normaliseSheet(
      pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d6+DEX', toHit: '1d20 + dex + prof' })] }),
    ) as PcSheet
    expect(out.feats[0].toHit).toBe('1d20+DEX+PROF')
    expect(isValidRoll(out.feats[0].toHit as string)).toBe(true)
  })

  /**
   * An empty to-hit is dropped **to no key at all**, not written as an empty
   * string and not written as `undefined`. `undefined` is not a Convex value, so
   * naming a key and handing it one is a different write from omitting the key —
   * and `entriesProblem` decides whether a to-hit exists by asking `!== undefined`,
   * so a present-but-empty key would read as a to-hit on an entry that has none.
   */
  test('an empty or whitespace-only to-hit is dropped to no key at all', () => {
    for (const toHit of ['', '   ', '\t\n ']) {
      const out = normaliseSheet(
        pc({ feats: [entry({ id: 'f1', category: 'passive', roll: null, toHit })] }),
      ) as PcSheet
      const built = out.feats[0] as unknown as Record<string, unknown>
      expect('toHit' in built, JSON.stringify(toHit)).toBe(false)
      expect(Object.keys(built), JSON.stringify(toHit)).not.toContain('toHit')
    }
  })

  /**
   * ⚠️ **And the mirror image, which is the assertion that actually distinguishes
   * a working normaliser from one that discards both fields.** An entry that
   * arrived without either key has to come back without either key.
   *
   * The category is deliberately **not materialised**: absent stays a legal state
   * for as long as the schema says the field is optional, and a normaliser that
   * filled it in would leave `categoryOf`'s default reachable only by documents
   * nobody has saved — which is how a default becomes untested code that nobody
   * notices is wrong.
   */
  test('an entry that arrived without either field comes back without either key', () => {
    const before = legacyEntry({ id: 'f1', roll: '2d6' })
    expect('category' in before, 'the fixture is not legacy').toBe(false)
    expect('toHit' in before, 'the fixture is not legacy').toBe(false)

    const out = normaliseSheet(pc({ feats: [before] })) as PcSheet
    const after = out.feats[0] as unknown as Record<string, unknown>
    expect('category' in after).toBe(false)
    expect('toHit' in after).toBe(false)
    expect(Object.keys(after).sort()).toEqual(
      ['catalogueKey', 'id', 'level', 'name', 'roll', 'text'],
    )
  })

  /** Idempotent on an entry carrying both, like every other part of the normaliser. */
  test('normalising twice changes nothing', () => {
    const sheet = pc({
      feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8+STR', toHit: '1d20 + str' })],
      spells: [entry({ id: 's1', category: 'passive', roll: null, level: 0 })],
    })
    const once = normaliseSheet(sheet)
    expect(normaliseSheet(once)).toEqual(once)
  })
})

describe('sheetProblem refuses an entry whose category and rolls disagree', () => {
  /**
   * **The arity rule — the definition of the discriminator, not a cap.** A passive
   * carrying a roll is a value the roll path will never read, and a weapon with no
   * to-hit is a category lying about its shape to the one function that switches on
   * it. Each of the four is asserted with its exact path *and* its exact message,
   * because the path is what a form marks and the message is what a person reads,
   * and a refusal that arrives on the wrong field is a refusal nobody can act on.
   */
  test('a weapon with no to-hit is refused, naming the field', () => {
    const problem = sheetProblem(
      pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8+STR' })] }),
    )
    expect(problem?.path).toBe('feats[0].toHit')
    expect(problem?.message).toBe(
      'A weapon needs a roll to hit with. Try something like 1d20+STR+PROF.',
    )
  })

  test('an action or a passive carrying a to-hit is refused, naming the field', () => {
    const action = sheetProblem(
      pc({ feats: [entry({ id: 'f1', category: 'action', roll: '2d6', toHit: '1d20+4' })] }),
    )
    expect(action?.path).toBe('feats[0].toHit')
    expect(action?.message).toBe(
      'Only a weapon rolls to hit. Make it a weapon, or clear the to-hit roll.',
    )

    const passive = sheetProblem(
      pc({ spells: [entry({ id: 's1', category: 'passive', roll: null, toHit: '1d20+4' })] }),
    )
    expect(passive?.path).toBe('spells[0].toHit')
    expect(passive?.message).toBe(
      'Only a weapon rolls to hit. Make it a weapon, or clear the to-hit roll.',
    )
  })

  test('a weapon or an action with no roll is refused, naming the roll', () => {
    const weapon = sheetProblem(
      pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: null, toHit: '1d20+STR' })] }),
    )
    expect(weapon?.path).toBe('feats[0].roll')
    expect(weapon?.message).toBe(
      'A weapon and an action both roll something. Give it a roll, or make it a passive.',
    )

    const action = sheetProblem(pc({ feats: [entry({ id: 'f1', category: 'action', roll: null })] }))
    expect(action?.path).toBe('feats[0].roll')
    expect(action?.message).toBe(
      'A weapon and an action both roll something. Give it a roll, or make it a passive.',
    )
  })

  test('a passive carrying a roll is refused, naming the roll', () => {
    const problem = sheetProblem(
      npc({ actions: [entry({ id: 'a1', category: 'passive', roll: '2d6' })] }),
    )
    expect(problem?.path).toBe('actions[0].roll')
    expect(problem?.message).toBe(
      'A passive is declared rather than rolled. Clear the roll, or make it an action.',
    )
  })

  /** The coherent combinations, so the four refusals above are not simply "no entry passes". */
  test('and accepts every coherent combination on both variants', () => {
    const coherent: SheetEntry[] = [
      entry({ id: 'w1', category: 'weapon', roll: '1d8+STR', toHit: '1d20+STR+PROF' }),
      entry({ id: 'a1', category: 'action', roll: '2d8+WIS' }),
      entry({ id: 'p1', category: 'passive', roll: null }),
    ]
    expect(sheetProblem(pc({ feats: coherent }))).toBeNull()
    expect(sheetProblem(npc({ actions: coherent }))).toBeNull()
  })

  /**
   * The refusal is reported against the offending entry rather than the first one,
   * for the reason `problemAtEntry` exists: a form marks one row, and marking the
   * wrong row is worse than marking none.
   */
  test('naming the index of the entry that is actually wrong', () => {
    const problem = sheetProblem(
      pc({
        feats: [
          entry({ id: 'f0', category: 'passive', roll: null }),
          entry({ id: 'f1', category: 'action', roll: '2d6' }),
          entry({ id: 'f2', category: 'weapon', roll: '1d8' }),
        ],
      }),
    )
    expect(problem?.path).toBe('feats[2].toHit')
  })

  /**
   * ⚠️ **A to-hit has to be a d20 roll, and the shared grammar does not say so.**
   *
   * This started life as a test recording the *absence* of this rule: the field was
   * documented as "`1d20+STR+PROF` on a hero; `1d20+4` on a monster" and checked only
   * against `rollProblem`, which is the grammar every damage expression shares — so
   * `2d6+STR` saved cleanly and the dice work would have thrown two d6 at an armour
   * class. The gap was reachable by a DM typing into the entry editor or an override
   * diff, never by generated content, and it is now closed by `toHitProblem`.
   *
   * The three cases below are the ones the check has to separate, and the third is
   * the reason a `startsWith` on its own is not enough: the grammar permits a d100,
   * so `1d200` shares the prefix and is not a d20.
   */
  test('a to-hit that is not a d20 roll is refused', () => {
    const odd = entry({ id: 'f1', category: 'weapon', roll: '1d8+STR', toHit: '2d6+STR' })
    // The grammar has no objection — which is exactly why the grammar was not enough.
    expect(isValidRoll('2d6+STR')).toBe(true)

    const problem = sheetProblem(pc({ feats: [odd] }))
    expect(problem?.path).toBe('feats[0].toHit')
    expect(problem?.message).toContain('one d20')

    // Two d20s is advantage spelled into the content permanently, rather than the
    // toggle it is meant to be at the moment of rolling.
    expect(
      sheetProblem(
        pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: '2d20+STR' })] }),
      )?.path,
    ).toBe('feats[0].toHit')

    // Shares the prefix, is not a d20.
    expect(
      sheetProblem(
        pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: '1d200' })] }),
      )?.path,
    ).toBe('feats[0].toHit')

    // And the two legitimate shapes still pass: a hero's tokens, a monster's flat number.
    for (const good of ['1d20+STR+PROF', '1d20+4', '1d20-2', '1d20']) {
      expect(
        sheetProblem(
          pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: good })] }),
        ),
      ).toBeNull()
    }

    // The accessor still hands back whatever is stored: adjudicating a roll is not
    // its job, and a document written by a newer deployment must read as it was written.
    expect(toHitOf(odd)).toBe('2d6+STR')
  })

  /**
   * The grammar is checked before the arity, deliberately, so a malformed to-hit
   * gets the sentence saying what is wrong with it rather than the one about which
   * category may carry one. Asserted because the two messages are both plausible
   * here and only one of them helps.
   */
  test('a malformed to-hit gets the grammar message, not the category one', () => {
    const problem = sheetProblem(
      pc({ feats: [entry({ id: 'f1', category: 'passive', roll: null, toHit: 'not-a-roll' })] }),
    )
    expect(problem?.path).toBe('feats[0].toHit')
    expect(problem?.message).toContain('is not a roll')
  })
})

describe('the roll length bound', () => {
  /**
   * ⚠️ **The grammar has a ceiling on the dice and none on the length.**
   * `ROLL_PATTERN`'s trailing `(?:[+-]…)*` repeats without limit, so `1d6+1+1+1…` a
   * thousand times over is a perfectly *valid* roll — and there are now two such
   * fields on every one of up to forty entries.
   *
   * Both fixtures are built to an exact length and their lengths asserted, so a
   * change to `MAX_ROLL_LENGTH` makes this test fail loudly rather than quietly
   * testing a different bound than it says.
   */
  const AT_LIMIT = `1d10${'+1'.repeat(18)}`
  const OVER_LIMIT = `1d100${'+1'.repeat(18)}`

  test('the fixtures sit exactly on and exactly past the bound, and both are valid rolls', () => {
    expect(MAX_ROLL_LENGTH).toBe(40)
    expect(AT_LIMIT.length).toBe(MAX_ROLL_LENGTH)
    expect(OVER_LIMIT.length).toBe(MAX_ROLL_LENGTH + 1)
    // The point of the bound: the grammar itself has no objection to either.
    expect(isValidRoll(AT_LIMIT)).toBe(true)
    expect(isValidRoll(OVER_LIMIT)).toBe(true)
  })

  test('a roll on the bound is accepted and one past it is refused', () => {
    expect(sheetProblem(pc({ feats: [entry({ id: 'f1', roll: AT_LIMIT })] }))).toBeNull()

    const problem = sheetProblem(pc({ feats: [entry({ id: 'f1', roll: OVER_LIMIT })] }))
    expect(problem?.path).toBe('feats[0].roll')
    expect(problem?.message).toBe(`Keep a roll to ${MAX_ROLL_LENGTH} characters or fewer.`)
  })

  /**
   * **And on the to-hit, which is the field the bound was actually widened for.**
   * A sheet holding forty weapons now has eighty roll strings on it rather than
   * forty, so a bound enforced on one field and not the other halves the guarantee.
   *
   * These fixtures have to be *d20* rolls where the two above do not: a to-hit is
   * checked for being one d20 as well as for its length, so reusing the `1d10` pair
   * would have this test passing on the wrong refusal. Built to exact lengths and
   * asserted, for the same reason the others are.
   */
  const TO_HIT_AT_LIMIT = `1d20${'+1'.repeat(18)}`
  const TO_HIT_OVER_LIMIT = `1d20+10${'+1'.repeat(17)}`

  test('the to-hit fixtures are d20 rolls sitting exactly on and past the bound', () => {
    expect(TO_HIT_AT_LIMIT.length).toBe(MAX_ROLL_LENGTH)
    expect(TO_HIT_OVER_LIMIT.length).toBe(MAX_ROLL_LENGTH + 1)
    expect(isValidRoll(TO_HIT_AT_LIMIT)).toBe(true)
    expect(isValidRoll(TO_HIT_OVER_LIMIT)).toBe(true)
  })

  test('a to-hit on the bound is accepted and one past it is refused', () => {
    const ok = entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: TO_HIT_AT_LIMIT })
    expect(sheetProblem(pc({ feats: [ok] }))).toBeNull()

    const problem = sheetProblem(
      pc({
        feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: TO_HIT_OVER_LIMIT })],
      }),
    )
    expect(problem?.path).toBe('feats[0].toHit')
    expect(problem?.message).toBe(`Keep a roll to ${MAX_ROLL_LENGTH} characters or fewer.`)
  })

  /**
   * An empty to-hit box is a *missing* value, not a malformed one — the distinction
   * the editor form depends on, since `sheetProblem` drives it as somebody types and
   * `normaliseEntry` has not run yet.
   */
  test('an empty to-hit on a weapon asks for one rather than calling it malformed', () => {
    const problem = sheetProblem(
      pc({ feats: [entry({ id: 'f1', category: 'weapon', roll: '1d8', toHit: '' })] }),
    )
    expect(problem?.path).toBe('feats[0].toHit')
    expect(problem?.message).toContain('A weapon needs a roll to hit with')
  })

  /** And an empty one on an action is simply absent, not "only a weapon rolls to hit". */
  test('an empty to-hit on an action is read as absent', () => {
    expect(
      sheetProblem(pc({ feats: [entry({ id: 'f1', category: 'action', roll: '1d8', toHit: '' })] })),
    ).toBeNull()
  })

  /** On a monster's actions too — one shape, one set of rules, both lists. */
  test('on an NPC action as well', () => {
    const problem = sheetProblem(npc({ actions: [entry({ id: 'a1', roll: OVER_LIMIT })] }))
    expect(problem?.path).toBe('actions[0].roll')
    expect(problem?.message).toBe(`Keep a roll to ${MAX_ROLL_LENGTH} characters or fewer.`)
  })
})

describe('a sheet written before this milestone is still saveable', () => {
  /**
   * ⚠️ **THE MOST IMPORTANT TEST IN THIS FILE, and the reason `categoryOf`'s
   * default is derived rather than constant.**
   *
   * `characters.sheet` already holds entries with neither field. If any of the four
   * new arity refusals fires on one of them, every hand-built sheet in every
   * existing game becomes unsaveable on its next edit — and the failure would first
   * appear to a DM mid-session, as a Save button that has stopped working on a
   * character they did not change.
   *
   * The property that makes this safe is that `categoryOf`'s derived default *is*
   * the arity rule restated: a legacy entry with no roll reads as a passive and has
   * none, one with a roll reads as an action and has one, and neither has ever had
   * a to-hit. Both roll shapes are exercised, on both sheet variants, because the
   * rule is enforced in one place for all four lists.
   */
  const LEGACY_FEATS: SheetEntry[] = [
    legacyEntry({ id: 'old-1', name: 'Rage', text: 'Declared, never rolled.', roll: null }),
    legacyEntry({ id: 'old-2', name: 'Second Wind', text: 'Catch your breath.', roll: '1d10' }),
    legacyEntry({ id: 'old-3', name: 'Great Weapon', text: 'A swing.', roll: '2d6+STR' }),
  ]
  const LEGACY_SPELLS: SheetEntry[] = [
    legacyEntry({ id: 'old-4', name: 'Shield', text: 'Up until your next turn.', roll: null, level: 1 }),
    legacyEntry({ id: 'old-5', name: 'Fire Bolt', text: 'A mote of fire.', roll: '1d10', level: 0 }),
    legacyEntry({
      id: 'old-6',
      name: 'Cure Wounds',
      text: 'Touch a creature.',
      roll: '2d8+WIS',
      level: 1,
      catalogueKey: 'cure-wounds',
    }),
  ]

  /**
   * Anti-vacuity, and it is not decoration. Every assertion in this section would
   * pass just as well over fixtures that had quietly acquired a `category` — which
   * is exactly what a helper carrying a default would do to them — and would then
   * be testing the modern shape under a heading that promises the old one.
   */
  test('the fixtures really are pre-milestone entries, with neither key present', () => {
    const all = [...LEGACY_FEATS, ...LEGACY_SPELLS]
    expect(all.length).toBe(6)
    for (const line of all) {
      const built = line as unknown as Record<string, unknown>
      expect('category' in built, `${line.name} has a category`).toBe(false)
      expect('toHit' in built, `${line.name} has a to-hit`).toBe(false)
    }
    // Both roll shapes are represented, so neither half of the rule is untested.
    expect(all.some((line) => line.roll === null)).toBe(true)
    expect(all.some((line) => line.roll !== null)).toBe(true)
  })

  test('a legacy PC sheet still validates', () => {
    expect(sheetProblem(pc({ feats: LEGACY_FEATS, spells: LEGACY_SPELLS }))).toBeNull()
  })

  test('a legacy NPC sheet still validates', () => {
    const actions = [...LEGACY_FEATS, ...LEGACY_SPELLS].map((line) => ({ ...line, level: null }))
    expect(sheetProblem(npc({ actions }))).toBeNull()
  })

  /**
   * And it survives the round trip the mutation actually performs — normalise,
   * then validate — without acquiring either key on the way through. A normaliser
   * that materialised a category would make this pass while changing every stored
   * document in the game on its next save.
   */
  test('and survives normalise-then-validate without acquiring either key', () => {
    const sheet = pc({ feats: LEGACY_FEATS, spells: LEGACY_SPELLS })
    const out = normaliseSheet(sheet) as PcSheet
    expect(sheetProblem(out)).toBeNull()
    for (const line of [...out.feats, ...out.spells]) {
      const built = line as unknown as Record<string, unknown>
      expect('category' in built, `${line.name} gained a category`).toBe(false)
      expect('toHit' in built, `${line.name} gained a to-hit`).toBe(false)
    }
  })

  /**
   * The same for the two override diffs, which hold entries of the identical shape
   * and are validated by the identical function — a stored preset written before
   * this milestone has legacy entries in `extraFeats` exactly as a hand-built sheet
   * has them in `feats`.
   */
  test('and a legacy preset override still validates', () => {
    const stored: StoredSheet = {
      kind: 'preset',
      race: 'human',
      classKey: 'fighter',
      subclassKey: 'champion',
      level: 3,
      locked: false,
      overrides: { extraFeats: [LEGACY_FEATS[0]], extraSpells: [LEGACY_SPELLS[1]] },
    }
    expect(storedSheetProblem(stored)).toBeNull()
    expect(normaliseStoredSheet(stored)).toEqual(stored)
  })

  /**
   * And a legacy creature override, the fourth of the six array positions this one
   * entry shape occupies.
   */
  test('and a legacy bestiary override still validates', () => {
    const stored: StoredSheet = {
      kind: 'bestiary',
      entryKey: 'goblin',
      cr: 1,
      overrides: { extraActions: [legacyEntry({ id: 'dm-1', roll: '2d6' })] },
    }
    expect(storedSheetProblem(stored)).toBeNull()
  })
})

describe('normaliseSheet carries a creature’s group', () => {
  /**
   * ⚠️ **THE FIELD-BY-FIELD REBUILD TRAP, MET FOR THE THIRD TIME.**
   *
   * `normaliseSheet` rebuilds an `NpcSheet` field by field — which is deliberate, it is
   * what stops an unknown field riding into the database — and this codebase has now
   * twice shipped a field added to a validator and not added to the rebuild: silently
   * discarded on every write, with the form still showing the value it had just binned.
   * Both times only `npm run test:smoke` caught it, because a dropped optional field
   * leaves a perfectly valid sheet behind and every other test stays green.
   *
   * `group` is optional, so the same trap was waiting for it. Presence is therefore
   * asserted directly rather than through a value comparison that a default could
   * satisfy.
   */
  test('a stored group survives the round trip', () => {
    for (const group of ['npc', 'monster'] as const) {
      const out = normaliseSheet(npc({ group })) as NpcSheet
      const built = out as unknown as Record<string, unknown>
      expect('group' in built, group).toBe(true)
      expect(out.group, group).toBe(group)
    }
  })

  /**
   * ⚠️ **AND THE MIRROR IMAGE, WHICH IS THE HALF THAT ACTUALLY CATCHES THE TRAP.**
   *
   * A creature that arrived without the key has to come back without it. `undefined` is
   * not a Convex value, so a rebuild that wrote `group: sheet.group` unconditionally
   * would be making a *different write* from one that omits the field — which the local
   * suite cannot tell apart from the correct one, and which `board-smoke.mjs` reports as
   * `present on one side only`. Hence `'group' in sheet` rather than a check that the
   * value is undefined: the two are the same assertion in JavaScript and different
   * assertions against a real deployment.
   *
   * Absent also has to stay a legal state for as long as the schema says the field is
   * optional. A normaliser that filled it in would leave `groupOf`'s documented default
   * reachable only by documents nobody has saved, which is how a default becomes untested
   * code that nobody notices is wrong.
   */
  test('a creature that arrived without a group comes back without the key', () => {
    const before = npc()
    expect('group' in before, 'the fixture already has a group').toBe(false)

    const out = normaliseSheet(before) as NpcSheet
    const built = out as unknown as Record<string, unknown>
    expect('group' in built).toBe(false)
    expect(Object.keys(built)).not.toContain('group')
  })

  /**
   * `defaultNpcSheet` is the second field-by-field rebuild and it made the opposite
   * decision on purpose: it omits `group` rather than writing `'npc'`, so a hand-built
   * creature with no answer defaults through the accessor instead of storing one.
   *
   * That matters at exactly one place — the create dialog spreads the default and then
   * puts the DM's answer over the top — and it is asserted here because it is a decision
   * two functions away from where its consequences show up.
   */
  test('defaultNpcSheet omits the field rather than defaulting it', () => {
    const built = defaultNpcSheet() as unknown as Record<string, unknown>
    expect('group' in built).toBe(false)
  })

  /** Idempotent in both directions, like every other part of the normaliser. */
  test('normalising twice changes nothing, with the key and without it', () => {
    for (const sheet of [npc(), npc({ group: 'monster' })]) {
      const once = normaliseSheet(sheet)
      expect(normaliseSheet(once)).toEqual(once)
      expect(Object.keys(once as unknown as Record<string, unknown>).sort()).toEqual(
        Object.keys(sheet as unknown as Record<string, unknown>).sort(),
      )
    }
  })

  /**
   * The stored form, through the door the mutation actually uses. `normaliseStoredSheet`
   * delegates to `normaliseSheet` for a hand-built creature, so this is the same rebuild
   * reached the way `characters.create` reaches it — and `toEqual` over the whole sheet
   * is what would catch a field dropped anywhere in it, not only this one.
   */
  test('and the same holds through normaliseStoredSheet, which is what the mutation calls', () => {
    const withGroup: StoredSheet = npc({ group: 'monster' })
    expect(normaliseStoredSheet(withGroup)).toEqual(withGroup)
    expect(storedSheetProblem(withGroup)).toBeNull()

    const without: StoredSheet = npc()
    expect(normaliseStoredSheet(without)).toEqual(without)
    expect(storedSheetProblem(without)).toBeNull()
    expect(
      'group' in (normaliseStoredSheet(without) as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  /**
   * The group is a creature's alone, and the two hero variants have nowhere to put one —
   * so a `pc` sheet carrying the key is an unknown field, and the rebuild drops it for
   * the reason every field-by-field rebuild in this file exists.
   */
  test('a group smuggled onto a hero sheet is dropped', () => {
    const smuggled = { ...pc(), group: 'monster' } as unknown as StoredSheet
    const out = normaliseStoredSheet(smuggled) as unknown as Record<string, unknown>
    expect('group' in out).toBe(false)
  })

  /**
   * The two unions, spelled once each and asserted against each other. `CreatureGroup` is
   * what a DM's creature can be; `CharacterGroup` is that widened by the one group a
   * creature can never be in, and it is what `publicCharacterValidator` sends.
   *
   * Worth pinning because they are declared separately and a fifth heading added to one
   * and not the other would compile: the selector would gain a tab that nothing can ever
   * be filed under, or a creature would be filed under a heading the payload cannot carry.
   */
  test('the creature groups are exactly the character groups minus “character”', () => {
    expect([...CREATURE_GROUPS]).toEqual(['npc', 'monster'])
    expect([...CHARACTER_GROUPS]).toEqual(['character', 'npc', 'monster'])
    expect(CHARACTER_GROUPS.filter((group) => group !== 'character')).toEqual([...CREATURE_GROUPS])
  })

  /**
   * Each list is a type and each validator is a value, and sheet.ts writes the names out
   * twice on purpose — the convention `sheetEntryCategoryValidator` states and that the
   * test above it enforces: "a Convex validator is a value and the list is a type, and the
   * one test pinning the two together is cheaper than the generic that would build one
   * from the other."
   *
   * These two unions had the convention and not the test. Without it the copies are free
   * to disagree, and the direction that hurts is a group the code accepts and the *schema*
   * refuses — a save that fails against the real deployment and passes against
   * convex-test, which is the class of failure only `npm run test:smoke` has ever caught
   * here. `characterGroupValidator` fails the other way and just as quietly: it is what
   * `publicCharacterValidator` sends, so a heading missing from it makes `characters.list`
   * throw for the whole table over one creature.
   */
  test('each validator admits exactly its own groups, in the same order', () => {
    const literalsOf = (validator: unknown) =>
      (validator as { members: { kind: string; value: unknown }[] }).members

    const creature = literalsOf(creatureGroupValidator)
    expect(creature.map((member) => member.kind)).toEqual(['literal', 'literal'])
    expect(creature.map((member) => member.value)).toEqual([...CREATURE_GROUPS])

    const character = literalsOf(characterGroupValidator)
    expect(character.map((member) => member.kind)).toEqual(['literal', 'literal', 'literal'])
    expect(character.map((member) => member.value)).toEqual([...CHARACTER_GROUPS])
  })

  /**
   * The record `CreatureGroupToggle` iterates. A `Record` keyed by the union catches a
   * *missing* group at compile time and says nothing about the order, about a key left
   * blank, or about two groups sharing a word — and a toggle with two buttons reading the
   * same thing is a control nobody can use.
   */
  test('every creature group has a button label and an example, in list order', () => {
    expect(Object.keys(CREATURE_GROUP_CHOICES)).toEqual([...CREATURE_GROUPS])
    for (const group of CREATURE_GROUPS) {
      expect(CREATURE_GROUP_CHOICES[group].label.trim(), group).not.toBe('')
      expect(CREATURE_GROUP_CHOICES[group].hint.trim(), group).not.toBe('')
    }
    const labels = CREATURE_GROUPS.map((group) => CREATURE_GROUP_CHOICES[group].label)
    expect(new Set(labels).size).toBe(CREATURE_GROUPS.length)
  })

  /**
   * The record the DM's sheet selector and the token editor's rebind select both iterate,
   * pinned on the same three terms as the one above — because a `Record` keyed by the union
   * catches a *missing* group at compile time and says nothing about the order, about a key
   * left blank, or about two groups printing the same word.
   *
   * The last of those is what makes this worth a test rather than a comment now that there is
   * one record instead of three: two headings reading *Monsters* is a selector where a DM
   * cannot tell which list they are looking at, and it would be one typo in one file that
   * every screen inherits at once. That inheritance is the point of consolidating them, and it
   * cuts both ways.
   */
  test('every character group has a heading, in list order, all distinct', () => {
    expect(Object.keys(CHARACTER_GROUP_LABELS)).toEqual([...CHARACTER_GROUPS])
    for (const group of CHARACTER_GROUPS) {
      expect(CHARACTER_GROUP_LABELS[group].trim(), group).not.toBe('')
    }
    const headings = CHARACTER_GROUPS.map((group) => CHARACTER_GROUP_LABELS[group])
    expect(new Set(headings).size).toBe(CHARACTER_GROUPS.length)
  })
})
