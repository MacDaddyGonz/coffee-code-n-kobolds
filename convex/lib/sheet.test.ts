import { describe, expect, test } from 'vitest'

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
  MAX_NPC_NOTES_LENGTH,
  MAX_SHEET_ENTRIES,
  MAX_SPELL_LEVEL,
  MIN_ABILITY_SCORE,
  MIN_ARMOUR_CLASS,
  MIN_LEVEL,
  MIN_MAX_HP,
  MIN_SPELL_LEVEL,
  ROLL_MODIFIER_TOKENS,
  ROLL_PATTERN,
  abilityModifier,
  characterKind,
  characterSheet,
  clampHp,
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

describe('characterSheet, characterKind and the defaults', () => {
  test('a document with no sheet reads as a player character with defaults', () => {
    expect(characterSheet({})).toEqual(defaultPcSheet())
    expect(characterKind({})).toBe('pc')
    expect(characterSheet({ sheet: undefined })).toEqual(defaultPcSheet())
  })

  test('a document with a sheet reads as that sheet', () => {
    const stored = npc({ maxHp: 33, notes: 'Hidden in the rafters.' })
    expect(characterSheet({ sheet: stored })).toBe(stored)
    expect(characterKind({ sheet: stored })).toBe('npc')

    const hero = pc({ level: 7 })
    expect(characterSheet({ sheet: hero })).toBe(hero)
    expect(characterKind({ sheet: hero })).toBe('pc')
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
    const a = characterSheet({}) as PcSheet
    a.abilities.dex = 18
    a.feats.push(entry())
    const b = characterSheet({}) as PcSheet
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
