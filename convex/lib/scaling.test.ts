import { describe, expect, test } from 'vitest'

import { CR_BENCHMARKS, benchmarkFor } from './bestiary/benchmarks'
import { scaleCombat, scaleCombatUnclamped, scaleRoll } from './bestiary/scale'
// Types only, and from ./bestiary/types rather than ./bestiary/index — the corpus is
// still landing, and the whole point of `scaleWith` taking a `BestiaryCombat` instead of
// an entry is that the arithmetic is testable against hand-written literals. A suite that
// imported the corpus to get a fixture would also be a suite that fails for content
// reasons, which is the other file's job.
import type { BestiaryAbility, BestiaryAttack, BestiaryCombat } from './bestiary/types'
import { CR_VALUES, crIndex, crLabel, stepCr, tierOf, type ChallengeRating } from './creatures'
import {
  MAX_ARMOUR_CLASS,
  MAX_ATTACK_BONUS,
  MAX_INITIATIVE_BONUS,
  MAX_MAX_HP,
  MAX_PASSIVE_PERCEPTION,
  MAX_ROLL_DICE,
  MAX_SAVE_DC,
  MAX_SKILL_BONUS,
  MIN_ARMOUR_CLASS,
  MIN_ATTACK_BONUS,
  MIN_MAX_HP,
  MIN_PASSIVE_PERCEPTION,
  MIN_SAVE_DC,
  ROLL_FACES,
  bestiarySheetValidator,
  clampHp,
  isValidRoll,
  normaliseRoll,
  reconcileHp,
} from './sheet'

// ---------------------------------------------------------------------------
// Builders. Written in the key order `scaleWith` returns, because several
// assertions below compare `JSON.stringify` — a scaler that reordered a field
// would produce an object that is deep-equal and yet a different document.
// ---------------------------------------------------------------------------

function attack(overrides: Partial<BestiaryAttack> = {}): BestiaryAttack {
  return {
    name: 'Claw',
    damage: '1d6+2',
    damageType: 'slashing',
    range: 'melee',
    text: 'It opens a line across the forearm.',
    ...overrides,
  }
}

function ability(overrides: Partial<BestiaryAbility> = {}): BestiaryAbility {
  return {
    name: 'Keen Smell',
    text: 'It knows where you are before you move.',
    roll: null,
    ...overrides,
  }
}

/**
 * The six scores and the six saves a 2024 stat block prints.
 *
 * ⚠️ **Shared by reference across every fixture on purpose.** `scaleCombat` returns both
 * untouched and *by reference*, exactly as it returns a frozen ability, so a single shared
 * object is what lets the freeze be asserted with `toBe` rather than approximated with a
 * deep comparison — and a fixture that built a fresh object per creature would make that
 * assertion impossible to write. Nothing in this file mutates either.
 */
const SCORES = { str: 12, dex: 14, con: 12, int: 10, wis: 11, cha: 9 }
const SAVES = { str: 1, dex: 2, con: 1, int: 0, wis: 0, cha: -1 }

function combat(overrides: Partial<BestiaryCombat> = {}): BestiaryCombat {
  return {
    maxHp: 26,
    armourClass: 13,
    attackBonus: 4,
    initiativeBonus: 2,
    passivePerception: 12,
    speed: 30,
    saveDc: null,
    abilityScores: SCORES,
    saveBonuses: SAVES,
    skills: [{ key: 'perception', bonus: 2 }],
    attacks: [attack()],
    abilities: [],
    ...overrides,
  }
}

type Fixture = { label: string; cr: ChallengeRating; combat: BestiaryCombat }

/**
 * One hand-written creature per rating, plus three deliberately awkward ones —
 * zeroes, a negative attack bonus, a save DC, an opted-in ability and a frozen
 * one. Every loop in the file walks this list, so the count is asserted first.
 */
const FIXTURES: Fixture[] = [
  {
    label: 'giant rat (CR 0, skirmisher)',
    cr: 0,
    combat: combat({
      maxHp: 3,
      armourClass: 12,
      // Negative, because `MIN_ATTACK_BONUS` is −20 for exactly this creature and a
      // bonus that crosses zero on the way up is where a sign error would show.
      attackBonus: -1,
      initiativeBonus: 2,
      passivePerception: 10,
      speed: 30,
      skills: [{ key: 'stealth', bonus: 3 }],
      attacks: [attack({ name: 'Bite', damage: '1d4' })],
    }),
  },
  {
    label: 'zombie (CR 0.125, brute, zeroes everywhere)',
    cr: 0.125,
    combat: combat({
      maxHp: 9,
      armourClass: 8,
      // Zeroes on three fields at once. An additive scaler that produced `-0`
      // anywhere would produce it here first, and `toStrictEqual` distinguishes it.
      attackBonus: 0,
      initiativeBonus: 0,
      passivePerception: 8,
      speed: 20,
      skills: [{ key: 'athletics', bonus: 0 }],
      attacks: [attack({ name: 'Slam', damage: '1d6' })],
    }),
  },
  {
    label: 'stirge (CR 0.25, skirmisher)',
    cr: 0.25,
    combat: combat({
      maxHp: 12,
      armourClass: 14,
      attackBonus: 5,
      initiativeBonus: 3,
      passivePerception: 9,
      speed: 10,
      skills: [{ key: 'stealth', bonus: 4 }],
      attacks: [attack({ name: 'Blood Drain', damage: '1d4+2', damageType: 'piercing' })],
    }),
  },
  {
    label: 'hobgoblin (CR 0.5, archer)',
    cr: 0.5,
    combat: combat({
      maxHp: 22,
      armourClass: 12,
      attackBonus: 3,
      initiativeBonus: 1,
      passivePerception: 11,
      skills: [
        { key: 'perception', bonus: 1 },
        { key: 'intimidation', bonus: 1 },
      ],
      attacks: [
        attack({ name: 'Longsword', damage: '2d6+1' }),
        attack({ name: 'Longbow', damage: '1d8+1', range: '150/600 ft.' }),
      ],
    }),
  },
  {
    label: 'dire wolf (CR 1, brute, forces a save)',
    cr: 1,
    combat: combat({
      maxHp: 30,
      armourClass: 14,
      attackBonus: 5,
      initiativeBonus: 3,
      passivePerception: 13,
      speed: 50,
      saveDc: 12,
      skills: [
        { key: 'perception', bonus: 3 },
        { key: 'stealth', bonus: 4 },
      ],
      attacks: [attack({ name: 'Bite', damage: '2d6+3', damageType: 'piercing' })],
      abilities: [ability({ name: 'Pack Tactics' })],
    }),
  },
  {
    label: 'ogre (CR 2, brute)',
    cr: 2,
    combat: combat({
      maxHp: 52,
      armourClass: 11,
      attackBonus: 6,
      initiativeBonus: -1,
      passivePerception: 8,
      speed: 40,
      skills: [],
      attacks: [attack({ name: 'Greatclub', damage: '2d8+4', damageType: 'bludgeoning' })],
    }),
  },
  {
    label: 'mummy (CR 3, controller, one ability opted in)',
    cr: 3,
    combat: combat({
      maxHp: 58,
      armourClass: 15,
      attackBonus: 5,
      initiativeBonus: 2,
      passivePerception: 13,
      speed: 20,
      saveDc: 14,
      skills: [{ key: 'perception', bonus: 3 }],
      attacks: [attack({ name: 'Rotting Fist', damage: '2d6+3', damageType: 'necrotic' })],
      abilities: [
        ability({ name: 'Dreadful Glare', roll: '1d10', scalesWithCr: true }),
        // Opted in, but with nothing to scale. The implementation's condition is
        // `scalesWithCr === true && roll !== null`, so this must come back by
        // reference like a frozen one.
        ability({ name: 'Rejects the Grave', roll: null, scalesWithCr: true }),
      ],
    }),
  },
  {
    label: 'ettin (CR 4, tank)',
    cr: 4,
    combat: combat({
      maxHp: 85,
      armourClass: 16,
      attackBonus: 6,
      initiativeBonus: 3,
      passivePerception: 14,
      skills: [{ key: 'perception', bonus: 4 }],
      attacks: [
        attack({ name: 'Battleaxe', damage: '2d8+4' }),
        attack({ name: 'Morningstar', damage: '2d8+4', damageType: 'bludgeoning' }),
      ],
    }),
  },
  {
    label: 'troll (CR 5, brute, regeneration frozen)',
    cr: 5,
    combat: combat({
      maxHp: 100,
      armourClass: 14,
      attackBonus: 7,
      initiativeBonus: 4,
      passivePerception: 12,
      speed: 30,
      skills: [{ key: 'perception', bonus: 4 }],
      attacks: [
        attack({ name: 'Bite', damage: '1d6+4', damageType: 'piercing' }),
        attack({ name: 'Claw', damage: '2d6+4' }),
        attack({ name: 'Claw', damage: '2d6+4' }),
      ],
      abilities: [
        // A pace, not a payload — `scalesWithCr` absent, so it must be the same object.
        ability({ name: 'Regeneration', roll: '1d10' }),
        ability({ name: 'Keen Smell' }),
      ],
    }),
  },
  {
    label: 'young dragon (CR 6, boss, breath opted in)',
    cr: 6,
    combat: combat({
      maxHp: 190,
      armourClass: 18,
      attackBonus: 8,
      initiativeBonus: 4,
      passivePerception: 17,
      speed: 40,
      saveDc: 15,
      skills: [
        { key: 'perception', bonus: 5 },
        { key: 'stealth', bonus: 4 },
        { key: 'intimidation', bonus: 4 },
      ],
      attacks: [
        attack({ name: 'Bite', damage: '2d10+5', damageType: 'piercing' }),
        attack({ name: 'Claw', damage: '1d8+5' }),
      ],
      abilities: [
        ability({ name: 'Fire Breath', roll: '7d6', scalesWithCr: true }),
        ability({ name: 'Frightful Presence' }),
      ],
    }),
  },
  {
    label: 'giant spider (CR 1, skirmisher, save DC at the floor)',
    cr: 1,
    combat: combat({
      maxHp: 26,
      armourClass: 14,
      attackBonus: 5,
      initiativeBonus: 3,
      passivePerception: 10,
      speed: 30,
      // Low enough that scaling to CR 0 wants to push it under `MIN_SAVE_DC`.
      saveDc: 11,
      skills: [{ key: 'stealth', bonus: 7 }],
      attacks: [attack({ name: 'Bite', damage: '1d8+2', damageType: 'piercing' })],
    }),
  },
  {
    label: 'ancient horror (CR 6, boss, straight into the clamps)',
    cr: 6,
    combat: combat({
      // Deliberately absurd, so that scaling down to CR 0 and up from it lands on
      // `MIN_MAX_HP` / `MAX_MAX_HP` and the clamp is exercised on purpose.
      maxHp: 500,
      armourClass: 22,
      attackBonus: 12,
      initiativeBonus: 6,
      passivePerception: 20,
      speed: 40,
      saveDc: 18,
      skills: [{ key: 'arcana', bonus: 9 }],
      attacks: [attack({ name: 'Tendril', damage: '4d10+6', damageType: 'psychic' })],
      abilities: [ability({ name: 'Unmaking', roll: '6d8', scalesWithCr: true })],
    }),
  },
]

/** Every number a scaled block carries, labelled, so a `-0` failure names its field. */
function numericLeaves(block: BestiaryCombat): [string, number][] {
  const out: [string, number][] = [
    ['maxHp', block.maxHp],
    ['armourClass', block.armourClass],
    ['attackBonus', block.attackBonus],
    ['initiativeBonus', block.initiativeBonus],
    ['passivePerception', block.passivePerception],
    ['speed', block.speed],
  ]
  if (block.saveDc !== null) out.push(['saveDc', block.saveDc])
  block.skills.forEach((skill, i) => out.push([`skills[${i}].bonus`, skill.bonus]))
  return out
}

/** `NdM±K`, the only shape the scaler rewrites. Throws on anything else, by design. */
const SIMPLE_ROLL = /^(\d{1,2})d(\d{1,3})(?:([+-])(\d{1,3}))?$/

function averageOf(roll: string): number {
  const match = SIMPLE_ROLL.exec(roll)
  if (match === null) throw new Error(`averageOf: not a simple roll: "${roll}"`)
  const count = Number(match[1])
  const faces = Number(match[2])
  const mod = match[4] === undefined ? 0 : Number(match[4]) * (match[3] === '-' ? -1 : 1)
  return (count * (faces + 1)) / 2 + mod
}

/** The average of a whole attack routine — what `damage` on a benchmark row means. */
function routineAverage(block: BestiaryCombat): number {
  return block.attacks.reduce((total, entry) => total + averageOf(entry.damage), 0)
}

function rowAt(cr: ChallengeRating) {
  const row = benchmarkFor(cr)
  if (row === null) throw new Error(`no benchmark row for CR ${cr}`)
  return row
}

/** Every ordered pair of ratings — the sweep every loop below runs. */
const PAIRS: [ChallengeRating, ChallengeRating][] = CR_VALUES.flatMap((from) =>
  CR_VALUES.map((to) => [from, to] as [ChallengeRating, ChallengeRating]),
)

// ---------------------------------------------------------------------------
// 1. The benchmark table
// ---------------------------------------------------------------------------

describe('the benchmark table is well formed', () => {
  /**
   * The anti-vacuity check, first, for the reason library.test.ts:111-122 gives:
   * every loop below walks `CR_BENCHMARKS`, and a table that had lost half its
   * rows would make all of them pass while asserting half as much.
   */
  test('holds exactly one row per rating, in the order of CR_VALUES', () => {
    expect(CR_BENCHMARKS.map((row) => row.cr)).toEqual([...CR_VALUES])
    expect(CR_BENCHMARKS).toHaveLength(10)
    expect(CR_VALUES).toHaveLength(10)
  })

  test('states nothing but whole numbers in its stat columns', () => {
    let checked = 0
    for (const row of CR_BENCHMARKS) {
      for (const [field, value] of [
        ['hp', row.hp],
        ['armourClass', row.armourClass],
        ['attackBonus', row.attackBonus],
        ['damage', row.damage],
        ['saveDc', row.saveDc],
        ['skillBonus', row.skillBonus],
      ] as [string, number][]) {
        expect(Number.isInteger(value), `CR ${row.cr} ${field} = ${value}`).toBe(true)
        checked += 1
      }
    }
    // Six stat columns on ten rows. `cr` is excluded deliberately — three of the ten
    // are fractions, and rounding one is the trap `CR_VALUES` carries a warning about.
    expect(checked).toBe(60)
  })

  /**
   * `hp` and `damage` are the only two denominators in the whole scaler, so a zero
   * or a negative in either divides the bestiary into nonsense. Two rather than one
   * for the reason the file's header gives: they are the smallest denominators and
   * therefore the largest amplifiers.
   */
  test('never offers a denominator smaller than two', () => {
    for (const row of CR_BENCHMARKS) {
      expect(row.hp, `CR ${row.cr} hp`).toBeGreaterThanOrEqual(2)
      expect(row.damage, `CR ${row.cr} damage`).toBeGreaterThanOrEqual(2)
    }
    expect(CR_BENCHMARKS).toHaveLength(10)
  })

  test('rises strictly on the ratio columns and never falls on the delta columns', () => {
    for (let i = 1; i < CR_BENCHMARKS.length; i += 1) {
      const previous = CR_BENCHMARKS[i - 1]
      const row = CR_BENCHMARKS[i]
      const at = `CR ${previous.cr} → ${row.cr}`
      // Ratio columns strictly: two adjacent rows with the same `hp` would mean a
      // step of the CR stepper that does nothing at all.
      expect(row.hp, `${at} hp`).toBeGreaterThan(previous.hp)
      expect(row.damage, `${at} damage`).toBeGreaterThan(previous.damage)
      // Delta columns merely non-decreasing: the table doubles up on purpose —
      // CR 0 and CR ⅛ share an armour class of 11.
      expect(row.armourClass, `${at} armourClass`).toBeGreaterThanOrEqual(previous.armourClass)
      expect(row.attackBonus, `${at} attackBonus`).toBeGreaterThanOrEqual(previous.attackBonus)
      expect(row.saveDc, `${at} saveDc`).toBeGreaterThanOrEqual(previous.saveDc)
      expect(row.skillBonus, `${at} skillBonus`).toBeGreaterThanOrEqual(previous.skillBonus)
    }
    expect(CR_BENCHMARKS).toHaveLength(10)
  })

  /**
   * ⚠️ The two load-bearing cells. benchmarks.ts says in writing that `damage` is
   * pinned so CR 1 → CR 4 is exactly 2.0×, because that is what makes the design's
   * own illustration — `1d6+2` becoming `2d6+4` — a literal fixture rather than a
   * hand-wave. Without this assertion a tuner can move either cell, the fixture
   * below silently stops being an exact ratio, and nothing says so.
   */
  /**
   * ⚠️ **The cells moved with the 2024 re-derivation and the ratio did not, which is the
   * distinction this test now has to carry.** They were 8 and 16 against a hand-written
   * corpus; the SRD's own medians at those two ratings are 9 and 24, and 10/20 is the pair
   * that sits close to both while being exactly 2.0×.
   *
   * The ratio is the constraint. `benchmarks.ts` section 3 says in writing that `damage` is
   * pinned so CR 1 → CR 4 is exactly 2.0×, because that is what makes the design's own
   * illustration — `1d6+2` becoming `2d6+4` — a literal fixture rather than a hand-wave.
   * A tuner may have a different pair; they may not have a pair whose ratio is 2.4.
   */
  test('pins damage at CR 1 and CR 4 so the 2.0× illustration stays exact', () => {
    expect(rowAt(1).damage).toBe(10)
    expect(rowAt(4).damage).toBe(20)
    expect(rowAt(4).damage / rowAt(1).damage).toBe(2)
  })

  /**
   * The two design constraints the header claims are constraints, not accidents.
   *
   * ⭐ **Both survived the re-derivation without being aimed at**, which is the strongest
   * available evidence that they were describing something real about the shape of a
   * difficulty curve rather than the old corpus's habits: `hp` still quadruples and a bit
   * from CR 1 to CR 6 — 120/28 is 4.3×, where the old table's was 4.6× — and `armourClass`
   * still moves by exactly three across the same span.
   */
  test('quadruples hit points and moves armour class by three from CR 1 to CR 6', () => {
    expect(rowAt(6).hp / rowAt(1).hp).toBeGreaterThanOrEqual(4)
    expect(rowAt(6).armourClass - rowAt(1).armourClass).toBe(3)
  })

  /**
   * 🚫 **THE THREE-COLUMN PARALLEL IS GONE, AND ITS GOING IS A FINDING RATHER THAN A
   * REGRESSION.** This test used to assert `attackBonus === armourClass - 9`,
   * `saveDc === armourClass - 1` and `skillBonus === armourClass - 11` on every row —
   * one competence curve read at three offsets — and the 2024 SRD does not have that shape.
   * Its offensive columns and its defensive one gain their points at different ratings, so
   * no single offset holds anywhere across the table.
   *
   * What replaces it has to be a claim that can still *fail*, or deleting the old one would
   * have been the honest move instead. So: the offsets are stated as bands, read off the
   * re-derived rows, and the span each column covers from CR 0 to CR 6 is pinned. Between
   * them those catch what the parallel caught — a bestiary where things get harder to hit
   * far faster than they get better at hitting would break a band, and a column that had
   * quietly flattened or run away would break a span.
   */
  test('the competence columns track the armour class within a stated band', () => {
    for (const row of CR_BENCHMARKS) {
      const at = `CR ${row.cr}`
      expect(row.attackBonus - row.armourClass, at).toBeGreaterThanOrEqual(-9)
      expect(row.attackBonus - row.armourClass, at).toBeLessThanOrEqual(-8)
      expect(row.saveDc - row.armourClass, at).toBeGreaterThanOrEqual(-2)
      expect(row.saveDc - row.armourClass, at).toBeLessThanOrEqual(0)
      expect(row.skillBonus - row.armourClass, at).toBeGreaterThanOrEqual(-10)
      expect(row.skillBonus - row.armourClass, at).toBeLessThanOrEqual(-8)
    }
    expect(CR_BENCHMARKS).toHaveLength(10)
  })

  /**
   * The spans, stated as exact numbers because a band alone would let a whole column drift
   * up or down together. Five points of armour class across the table, four of attack bonus,
   * four of save DC and three of skill bonus — and sixteen and a half times as much damage,
   * which is the asymmetry the 2024 SRD is built on: a d20 column can only ever move a few
   * points, so difficulty at the top of the range is carried almost entirely by hit points
   * and damage.
   */
  test('and each column covers exactly the span the SRD gives it', () => {
    const first = CR_BENCHMARKS[0]
    const last = CR_BENCHMARKS[CR_BENCHMARKS.length - 1]
    expect(last.armourClass - first.armourClass).toBe(5)
    expect(last.attackBonus - first.attackBonus).toBe(4)
    expect(last.saveDc - first.saveDc).toBe(4)
    expect(last.skillBonus - first.skillBonus).toBe(3)
    expect(last.hp / first.hp).toBe(30)
    expect(last.damage / first.damage).toBe(16.5)
  })

  test('finds each of the ten rows by its own rating', () => {
    CR_VALUES.forEach((cr, index) => {
      expect(benchmarkFor(cr), `CR ${cr}`).toBe(CR_BENCHMARKS[index])
      expect(benchmarkFor(cr)?.cr, `CR ${cr}`).toBe(cr)
    })
    expect(CR_VALUES).toHaveLength(10)
  })

  test('answers null for anything that is not one of the ten', () => {
    for (const cr of [0.3, 7, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(benchmarkFor(cr), String(cr)).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Identity at a creature's own rating
// ---------------------------------------------------------------------------

describe('a creature at its own rating is untouched', () => {
  test('twelve fixtures across the ten ratings and several roles', () => {
    // The anti-vacuity gate for every loop in this file.
    expect(FIXTURES.length).toBeGreaterThan(11)
    expect(new Set(FIXTURES.map((f) => f.cr)).size).toBe(10)
    expect(new Set(FIXTURES.map((f) => f.label)).size).toBe(FIXTURES.length)
  })

  test('scaling a creature to the rating it already has returns it exactly', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      const scaled = scaleCombat(fixture.combat, fixture.cr, fixture.cr)
      expect(scaled, fixture.label).toStrictEqual(fixture.combat)
      checked += 1
    }
    expect(checked).toBe(FIXTURES.length)
  })

  /**
   * Key order as well as key contents. `toStrictEqual` is blind to it, and a stored
   * document whose fields arrived in a different order is a different document —
   * so the shape the resolver hands on is pinned here rather than assumed.
   */
  test('and returns it with its fields in the same order', () => {
    for (const fixture of FIXTURES) {
      expect(
        JSON.stringify(scaleCombat(fixture.combat, fixture.cr, fixture.cr)),
        fixture.label,
      ).toBe(JSON.stringify(fixture.combat))
    }
    expect(FIXTURES).toHaveLength(12)
  })

  /**
   * ⚠️ `-0` explicitly, field by field. `toStrictEqual` does distinguish it in
   * vitest, but it reports "expected 0, received -0" without saying where — and the
   * additive path is `Math.round(x + delta)`, which is one sign error away from
   * producing one on every creature whose bonus is zero.
   */
  test('produces whole numbers and never a negative zero', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const scaled = scaleCombat(fixture.combat, from, to)
        for (const [field, value] of numericLeaves(scaled)) {
          const at = `${fixture.label} CR ${from}→${to} ${field}`
          expect(Number.isInteger(value), `${at} = ${value}`).toBe(true)
          expect(Object.is(value, -0), `${at} is -0`).toBe(false)
          checked += 1
        }
      }
    }
    // Twelve fixtures × 100 pairs × at least six numbers each.
    expect(checked).toBeGreaterThan(12 * 100 * 6)
  })

  /**
   * An ability that did not opt in comes back **by reference**, which is a stronger
   * statement than deep equality and is what the doc comment promises. A scaler that
   * rebuilt every ability would still pass a `toStrictEqual`, and would then be free
   * to start scaling one.
   */
  test('hands back a frozen ability as the same object', () => {
    let frozen = 0
    let scaledThrough = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const scaled = scaleCombat(fixture.combat, from, to)
        fixture.combat.abilities.forEach((original, i) => {
          const opted = original.scalesWithCr === true && original.roll !== null
          if (opted) {
            // A new object, because its roll was rewritten.
            expect(scaled.abilities[i], `${fixture.label}[${i}]`).not.toBe(original)
            scaledThrough += 1
          } else {
            expect(scaled.abilities[i], `${fixture.label}[${i}]`).toBe(original)
            frozen += 1
          }
        })
      }
    }
    // Both branches are actually exercised — a fixture set with no opted-in ability
    // would make the `else` above the whole test.
    expect(frozen).toBeGreaterThan(0)
    expect(scaledThrough).toBeGreaterThan(0)
  })

  test('leaves speed and the words on an attack alone at every rating', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const scaled = scaleCombat(fixture.combat, from, to)
        expect(scaled.speed, `${fixture.label} CR ${from}→${to}`).toBe(fixture.combat.speed)
        expect(scaled.attacks).toHaveLength(fixture.combat.attacks.length)
        expect(scaled.abilities).toHaveLength(fixture.combat.abilities.length)
        expect(scaled.skills).toHaveLength(fixture.combat.skills.length)
        fixture.combat.attacks.forEach((original, i) => {
          const moved = scaled.attacks[i]
          expect(moved.name).toBe(original.name)
          expect(moved.damageType).toBe(original.damageType)
          expect(moved.range).toBe(original.range)
          expect(moved.text).toBe(original.text)
          checked += 1
        })
        fixture.combat.skills.forEach((original, i) => {
          expect(scaled.skills[i].key).toBe(original.key)
          // Fresh pair objects — the corpus's arrays are module state that outlives
          // the isolate, so a mutated pair would redefine the creature for every
          // later query.
          expect(scaled.skills[i]).not.toBe(original)
        })
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  test('a creature that forces no saves does not acquire a save DC', () => {
    const silent = FIXTURES.filter((f) => f.combat.saveDc === null)
    expect(silent.length).toBeGreaterThan(2)
    for (const fixture of silent) {
      for (const [from, to] of PAIRS) {
        expect(scaleCombat(fixture.combat, from, to).saveDc, fixture.label).toBeNull()
      }
    }
  })

  test('never mutates the block it was given', () => {
    for (const fixture of FIXTURES) {
      const before = JSON.stringify(fixture.combat)
      for (const [from, to] of PAIRS) scaleCombat(fixture.combat, from, to)
      expect(JSON.stringify(fixture.combat), fixture.label).toBe(before)
    }
    expect(FIXTURES).toHaveLength(12)
  })

  /**
   * A rating with no row is one the stepper's clamp and `storedSheetProblem` both
   * exist to prevent, so unscaled is the honest answer. By reference, because that
   * is the branch: `if (!a || !b) return combat`.
   */
  test('declines to scale towards a rating that has no row', () => {
    const c = FIXTURES[4].combat
    for (const bad of [7, 0.3, -1, 1.5, Number.NaN] as ChallengeRating[]) {
      expect(scaleCombat(c, bad, 3), `from ${bad}`).toBe(c)
      expect(scaleCombat(c, 3, bad), `to ${bad}`).toBe(c)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Deviation preserved, not row values read
// ---------------------------------------------------------------------------

/**
 * Two CR 3 creatures with deliberately opposite deviations from their row. This is
 * the pair that catches a reimplementation which reads the *target* row instead of
 * carrying the deviation across — that scaler makes every CR 6 creature AC 16, and
 * the gap assertion below becomes `0 === 6`.
 */
const CR3_ROW = { hp: 64, armourClass: 14, attackBonus: 5, damage: 17, saveDc: 12, skillBonus: 4 }

const TANK: BestiaryCombat = combat({
  // ⚠️ **94 rather than a round 96, and the reason is the tolerance below rather than
  // taste.** `each keeps its own multiple of the hit-point row` allows 0.05 of drift, and
  // the CR ⅛ row's `hp` is 9 — small enough that a deviation landing on an exact half
  // (96 × 9/64 is 13.5) rounds away 0.056 of it and fails on correct arithmetic. The
  // fixture is chosen to avoid a tie, not to hide one; `hp[0] = 4` being the largest
  // amplifier in the table is the same fact seen from the other end.
  maxHp: 94, // ×1.47 of its row
  armourClass: 18, // +4 above its row
  attackBonus: 4,
  initiativeBonus: 1,
  passivePerception: 13,
  speed: 25,
  saveDc: null,
  skills: [{ key: 'athletics', bonus: 5 }],
  // 5.5 average, well under the row's 17.
  attacks: [attack({ name: 'Shield Bash', damage: '1d8+1', damageType: 'bludgeoning' })],
  abilities: [ability({ name: 'Hold the Line' })],
})

const BRUTE: BestiaryCombat = combat({
  maxHp: 48, // ×0.75 of its row
  armourClass: 12, // −2 below its row
  attackBonus: 7,
  initiativeBonus: 4,
  passivePerception: 11,
  speed: 40,
  saveDc: null,
  skills: [{ key: 'athletics', bonus: 1 }],
  // 18 average, above the row's 17.
  attacks: [attack({ name: 'Maul', damage: '2d12+5', damageType: 'bludgeoning' })],
  abilities: [ability({ name: 'Reckless' })],
})

describe('a role survives a change of rating', () => {
  /**
   * The fixtures' whole premise is the CR 3 row's numbers. Pinned here so that a
   * tuner moving the row turns this into a named failure rather than into a set of
   * assertions that quietly stop meaning what they say.
   */
  test('the CR 3 row is the one these two fixtures were written against', () => {
    const row = rowAt(3)
    expect({
      hp: row.hp,
      armourClass: row.armourClass,
      attackBonus: row.attackBonus,
      damage: row.damage,
      saveDc: row.saveDc,
      skillBonus: row.skillBonus,
    }).toEqual(CR3_ROW)
    expect(routineAverage(TANK)).toBe(5.5)
    expect(routineAverage(BRUTE)).toBe(18)
  })

  /**
   * ⚠️ The exact-invariance assertion, and the reason the delta columns are
   * integers. Both creatures take the same integer shift, so the distance between
   * them cannot move by a fraction of a point at any rating.
   */
  test('the armour-class gap between them is exactly the same at every rating', () => {
    let checked = 0
    for (const to of CR_VALUES) {
      const tank = scaleCombat(TANK, 3, to)
      const brute = scaleCombat(BRUTE, 3, to)
      expect(tank.armourClass - brute.armourClass, `CR ${to}`).toBe(18 - 12)
      expect(tank.attackBonus - brute.attackBonus, `CR ${to}`).toBe(4 - 7)
      expect(tank.initiativeBonus - brute.initiativeBonus, `CR ${to}`).toBe(1 - 4)
      expect(tank.passivePerception - brute.passivePerception, `CR ${to}`).toBe(13 - 11)
      expect(tank.skills[0].bonus - brute.skills[0].bonus, `CR ${to}`).toBe(5 - 1)
      checked += 1
    }
    expect(checked).toBe(10)
  })

  /**
   * The multiplicative twin. Stated as "the creature's distance from its own row is
   * the same fraction at the new row", with a tolerance derived from the one place
   * error can enter — a single `Math.round` on the hit point total, worth at most
   * half a hit point.
   */
  test('each keeps its own multiple of the hit-point row', () => {
    let checked = 0
    for (const source of [TANK, BRUTE]) {
      const deviation = source.maxHp / rowAt(3).hp
      for (const to of CR_VALUES) {
        const row = rowAt(to)
        const scaled = scaleCombat(source, 3, to)
        expect(scaled.maxHp / row.hp, `CR ${to}`).toBeCloseTo(deviation, 1)
        // And exactly, to the rounding: no accumulated drift anywhere.
        expect(Math.abs(scaled.maxHp - source.maxHp * (row.hp / rowAt(3).hp))).toBeLessThanOrEqual(
          0.5,
        )
        checked += 1
      }
    }
    expect(checked).toBe(20)
  })

  test('and its own multiple of the damage row wherever the dice can express it', () => {
    let checked = 0
    for (const source of [TANK, BRUTE]) {
      for (const to of CR_VALUES) {
        const ratio = rowAt(to).damage / rowAt(3).damage
        const target = routineAverage(source) * ratio
        const actual = routineAverage(scaleCombat(source, 3, to))
        // A single die's average is the floor the grammar imposes: `1d8` cannot
        // express 0.85, and scale.ts says so in writing. Above that floor the
        // modifier absorbs the remainder to within half a point.
        const floor = averageOf(`1d${SIMPLE_ROLL.exec(source.attacks[0].damage)![2]}`)
        if (target >= floor) {
          expect(Math.abs(actual - target), `CR ${to}`).toBeLessThanOrEqual(0.5)
        } else {
          expect(actual, `CR ${to}`).toBeLessThanOrEqual(floor)
        }
        checked += 1
      }
    }
    expect(checked).toBe(20)
  })

  /**
   * Neither creature lands *on* the row it was scaled to. This is the assertion a
   * reimplementation reading absolute target figures fails first — it would produce
   * the row itself, which is a bestiary where every CR 6 creature is one statline
   * wearing a different name.
   */
  test('neither creature lands on the row it was scaled to', () => {
    const top = rowAt(6)
    const tank = scaleCombat(TANK, 3, 6)
    const brute = scaleCombat(BRUTE, 3, 6)
    expect(tank.armourClass).not.toBe(top.armourClass)
    expect(tank.maxHp).not.toBe(top.hp)
    expect(brute.armourClass).not.toBe(top.armourClass)
    expect(brute.maxHp).not.toBe(top.hp)
  })

  test('a scaled-up Tank is still unusually hard to hit, at every rating', () => {
    let checked = 0
    for (const to of CR_VALUES) {
      const tank = scaleCombat(TANK, 3, to)
      const brute = scaleCombat(BRUTE, 3, to)
      expect(tank.armourClass, `CR ${to}`).toBeGreaterThan(brute.armourClass)
      expect(tank.maxHp, `CR ${to}`).toBeGreaterThan(brute.maxHp)
      checked += 1
    }
    expect(checked).toBe(10)
  })

  /**
   * ⚠️ Named because it is a *balance* consequence rather than an arithmetic fault,
   * and the arithmetic is behaving exactly as scale.ts says it will. The smallest
   * thing the grammar can express is one die, so at the bottom of the table both
   * creatures deal far more than their new row asks for — the Tank's `1d8+1` becomes
   * `1d8`, which is 4.5 against a CR 0 row of 2, and the Brute's becomes `1d10` at
   * 5.5. A DM who steps a CR 3 creature down to CR 0 for a level 1 party gets
   * something that hits between two and three times as hard as a native CR 0
   * creature. Absorbing that would mean swapping die faces, which scale.ts rules out
   * on purpose; this assertion is here so the size of the effect is on the record.
   *
   * ⚠️ **The 2024 re-derivation made this worse rather than better, and the numbers say by
   * how much.** `damage[0]` is still 2 — it is an anti-amplification floor and the SRD does
   * not get a vote on it — while `damage[3]` rose from 13 to 17, so the step down is steeper
   * and the floor is in the way of more of it.
   */
  test('the single-die floor makes a scaled-down creature hit harder than its new row', () => {
    expect(scaleCombat(TANK, 3, 0).attacks[0].damage).toBe('1d8')
    expect(scaleCombat(BRUTE, 3, 0).attacks[0].damage).toBe('1d12')
    const row = rowAt(0).damage
    expect(row).toBe(2)
    expect(routineAverage(scaleCombat(TANK, 3, 0)) / row).toBeCloseTo(2.25, 2)
    expect(routineAverage(scaleCombat(BRUTE, 3, 0)) / row).toBeCloseTo(3.25, 2)
    // Hit points and armour class have no such floor, so the scaled-down creature is
    // fragile *and* hits hard — a CR 0 the party can kill in a round but should not
    // be standing next to.
    expect(scaleCombat(TANK, 3, 0).maxHp).toBe(6)
    expect(scaleCombat(BRUTE, 3, 0).maxHp).toBe(3)
  })

  test('a scaled-down Brute is still glassy, at every rating', () => {
    let checked = 0
    for (const to of CR_VALUES) {
      const tank = scaleCombat(TANK, 3, to)
      const brute = scaleCombat(BRUTE, 3, to)
      // Hits harder…
      expect(routineAverage(brute), `CR ${to}`).toBeGreaterThan(routineAverage(tank))
      // …and goes down faster.
      expect(brute.maxHp, `CR ${to}`).toBeLessThan(tank.maxHp)
      expect(brute.armourClass, `CR ${to}`).toBeLessThan(tank.armourClass)
      checked += 1
    }
    expect(checked).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// 4. Non-compounding
// ---------------------------------------------------------------------------

describe('a scaled number has nowhere to be persisted', () => {
  /**
   * The structural half, and it is the actual guarantee. Non-compounding is not
   * enforced by anyone remembering to read the entry baseline — it is enforced by
   * the stored shape having no field a scaled number could go in.
   */
  test('the stored bestiary sheet holds selections and overrides and nothing else', () => {
    expect(Object.keys(bestiarySheetValidator.fields).sort()).toEqual([
      'cr',
      'entryKey',
      'kind',
      'overrides',
    ])
    for (const forbidden of [
      'maxHp',
      'armourClass',
      'attackBonus',
      'initiativeBonus',
      'saveDc',
      'passivePerception',
      'speed',
      'skills',
    ]) {
      expect(Object.keys(bestiarySheetValidator.fields), forbidden).not.toContain(forbidden)
    }
  })

  test('scaling is deterministic for every rating pair', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const once = scaleCombat(fixture.combat, from, to)
        const twice = scaleCombat(fixture.combat, from, to)
        expect(twice, `${fixture.label} CR ${from}→${to}`).toStrictEqual(once)
        checked += 1
      }
    }
    expect(checked).toBe(FIXTURES.length * 100)
  })

  /**
   * Idempotence at the entry's own rating, at every rating, is the cheapest
   * available proof that three up and three back down returns the original sheet:
   * the second call reads the entry baseline, so there is no first answer for it to
   * compound on.
   */
  test('every rating is its own fixed point', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const cr of CR_VALUES) {
        expect(scaleCombat(fixture.combat, cr, cr), `${fixture.label} @ CR ${cr}`).toStrictEqual(
          fixture.combat,
        )
        checked += 1
      }
    }
    expect(checked).toBe(FIXTURES.length * 10)
  })

  /**
   * ⚠️ THE POSITIVE CONTROL, AND IT IS MANDATORY. Without it, a scaler that
   * returned its input unconditionally would pass every assertion above this line.
   */
  test('but scaling to a different rating really does change the creature', () => {
    let changed = 0
    for (const fixture of FIXTURES) {
      const down = scaleCombat(fixture.combat, 5, 2)
      const up = scaleCombat(fixture.combat, 2, 5)
      expect(down, fixture.label).not.toStrictEqual(fixture.combat)
      expect(up, fixture.label).not.toStrictEqual(fixture.combat)
      expect(down, fixture.label).not.toStrictEqual(up)
      changed += 1
    }
    expect(changed).toBe(FIXTURES.length)
  })
})

// ---------------------------------------------------------------------------
// The clamps, and the unclamped twin
// ---------------------------------------------------------------------------

/**
 * Which of a block's clamped fields is outside the bounds a stored sheet allows.
 * Written out field by field rather than derived, so a field added to `scaleWith`
 * without a bound shows up as a field this function does not know about.
 */
function outOfRange(block: BestiaryCombat): string[] {
  const bounded: [string, number, number, number][] = [
    ['maxHp', block.maxHp, MIN_MAX_HP, MAX_MAX_HP],
    ['armourClass', block.armourClass, MIN_ARMOUR_CLASS, MAX_ARMOUR_CLASS],
    ['attackBonus', block.attackBonus, MIN_ATTACK_BONUS, MAX_ATTACK_BONUS],
    ['initiativeBonus', block.initiativeBonus, -MAX_INITIATIVE_BONUS, MAX_INITIATIVE_BONUS],
    [
      'passivePerception',
      block.passivePerception,
      MIN_PASSIVE_PERCEPTION,
      MAX_PASSIVE_PERCEPTION,
    ],
  ]
  if (block.saveDc !== null) bounded.push(['saveDc', block.saveDc, MIN_SAVE_DC, MAX_SAVE_DC])
  block.skills.forEach((skill, i) =>
    bounded.push([`skills[${i}].bonus`, skill.bonus, -MAX_SKILL_BONUS, MAX_SKILL_BONUS]),
  )
  return bounded
    .filter(([, value, low, high]) => value < low || value > high)
    .map(([field]) => field)
}

describe('the bounds are a tripwire rather than a repair', () => {
  /**
   * The comparison the corpus test is built on, stated as the exact property rather
   * than as "these two agree": the clamped and unclamped answers are identical
   * *unless* the arithmetic genuinely left the range, and where they differ the
   * difference is a field sitting on its bound and nothing else. A blanket
   * "they always agree" would be false — a creature written far enough below its
   * own row rounds to zero hit points on the way down to CR 0 — and the version of
   * this test that asserted it would have to exclude fixtures until it passed,
   * which is how a tripwire becomes decoration.
   */
  test('differ from the unclamped arithmetic only where a figure has left the range', () => {
    let identical = 0
    let clampedAway = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const at = `${fixture.label} CR ${from}→${to}`
        const clamped = scaleCombat(fixture.combat, from, to)
        const raw = scaleCombatUnclamped(fixture.combat, from, to)
        const escaped = outOfRange(raw)
        if (escaped.length === 0) {
          expect(raw, at).toStrictEqual(clamped)
          identical += 1
        } else {
          expect(raw, `${at} (escaped: ${escaped.join(', ')})`).not.toStrictEqual(clamped)
          // Everything the arithmetic kept inside the range is untouched by the
          // bound, so the clamp is not silently adjusting anything else.
          expect(outOfRange(clamped), at).toEqual([])
          clampedAway += 1
        }
      }
    }
    // Both branches genuinely run. Either count at zero would make this a test of
    // one function.
    expect(identical).toBeGreaterThan(900)
    expect(clampedAway).toBeGreaterThan(0)
    expect(identical + clampedAway).toBe(FIXTURES.length * 100)
  })

  /**
   * ⚠️ A hazard for whoever writes the corpus, found by this suite and worth naming.
   * `hp[0] / hp[6]` is 4/120, so any creature written at less than about an eighth of
   * its own row's hit points rounds to **zero** on the way down to CR 0 and is saved
   * only by `MIN_MAX_HP`. Since the corpus test compares the clamped answer with the
   * unclamped one, such an entry fails that test — correctly, because a creature that
   * can be scaled to nothing is a content problem rather than an arithmetic one.
   */
  test('a creature written far below its own row rounds to nothing at the bottom of the table', () => {
    const feeble = combat({ maxHp: 3, attacks: [attack({ damage: '1d4' })], skills: [] })
    expect(scaleCombatUnclamped(feeble, 1, 0).maxHp).toBe(0)
    expect(scaleCombat(feeble, 1, 0).maxHp).toBe(MIN_MAX_HP)
    // 3 / 26 is under 4/120, which is the threshold. One hit point more clears it.
    expect(scaleCombatUnclamped(combat({ maxHp: 4 }), 1, 0).maxHp).toBe(1)
  })

  /**
   * The positive control for the pair above: the two functions must be genuinely
   * different, or "they agree everywhere" is a statement about one function.
   */
  test('and disagree exactly where a figure is out of range', () => {
    const boss = FIXTURES[FIXTURES.length - 1].combat
    expect(boss.maxHp).toBe(500)
    const clamped = scaleCombat(boss, 0, 6)
    const raw = scaleCombatUnclamped(boss, 0, 6)
    // 500 × (120/4) is 15,000, which is not a number a stored document may hold.
    expect(raw.maxHp).toBeGreaterThan(MAX_MAX_HP)
    expect(clamped.maxHp).toBe(MAX_MAX_HP)
    expect(clamped).not.toStrictEqual(raw)
  })

  test('a creature scaled to the bottom of the table still has an armour class and a save DC', () => {
    // AC 8 at CR ⅛ scaled to CR 0 wants 8 + (11 − 11) = 8; the interesting one is a
    // low AC dropping five points off the top row.
    const flimsy = combat({ maxHp: 4, armourClass: 3, saveDc: 3, attacks: [attack()] })
    const down = scaleCombat(flimsy, 6, 0)
    expect(down.armourClass).toBeGreaterThanOrEqual(MIN_ARMOUR_CLASS)
    expect(down.armourClass).toBeLessThanOrEqual(MAX_ARMOUR_CLASS)
    // `MIN_SAVE_DC` is 1 precisely because a save DC of 0 is not a difficulty class.
    expect(down.saveDc).toBeGreaterThanOrEqual(MIN_SAVE_DC)
    expect(down.maxHp).toBeGreaterThanOrEqual(MIN_MAX_HP)
  })

  test('no rating pair can drive any fixture outside the stored bounds', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const scaled = scaleCombat(fixture.combat, from, to)
        const at = `${fixture.label} CR ${from}→${to}`
        expect(scaled.maxHp, at).toBeGreaterThanOrEqual(MIN_MAX_HP)
        expect(scaled.maxHp, at).toBeLessThanOrEqual(MAX_MAX_HP)
        expect(scaled.armourClass, at).toBeGreaterThanOrEqual(MIN_ARMOUR_CLASS)
        expect(scaled.armourClass, at).toBeLessThanOrEqual(MAX_ARMOUR_CLASS)
        if (scaled.saveDc !== null) expect(scaled.saveDc, at).toBeGreaterThanOrEqual(MIN_SAVE_DC)
        checked += 1
      }
    }
    expect(checked).toBe(FIXTURES.length * 100)
  })
})

// ---------------------------------------------------------------------------
// 5. scaleRoll — the exhaustive sweep
// ---------------------------------------------------------------------------

/**
 * ⚠️ **`ROLL_FACES` rather than a hand-written list, and the hand-written one had already
 * gone stale inside the commit that widened the grammar.** This sweep exists to prove
 * `scaleRoll` can never emit a string `isValidRoll` refuses — so a face the grammar admits
 * and this array omits is a hole in exactly the guard, silently. `d2` was that face for one
 * commit. The count beside it never had the problem, because every reader of the cap reads
 * `MAX_ROLL_DICE`.
 *
 * This is the one place in this file that imports the thing it is testing against, and it
 * is the right call here: the claim is *the scaler agrees with the grammar*, which a second
 * copy of the grammar cannot check.
 */
const FACES = ROLL_FACES
const MODS = [-99, -1, 0, 1, 2, 99] as const

/** The canonical spelling: no `+0` suffix, because no stat block has ever had one. */
function spell(count: number, faces: number, mod: number): string {
  if (mod === 0) return `${count}d${faces}`
  return mod > 0 ? `${count}d${faces}+${mod}` : `${count}d${faces}-${-mod}`
}

describe('scaleRoll cannot emit a string the sheet validator refuses', () => {
  /**
   * The cheapest possible proof, and the reason it is a sweep rather than a set of
   * examples: the failure mode is one combination of faces, count, modifier and
   * ratio that formats to something outside the grammar, and there is no way to
   * guess which one that would be. Failures are accumulated rather than thrown, so
   * one run names every broken combination instead of the first.
   */
  test('every die, every count, every modifier, every rating pair', () => {
    const ratios: [ChallengeRating, ChallengeRating, number][] = PAIRS.map(([from, to]) => [
      from,
      to,
      rowAt(to).damage / rowAt(from).damage,
    ])
    expect(ratios).toHaveLength(100)

    const failures: string[] = []
    let checked = 0

    for (const faces of FACES) {
      for (let count = 1; count <= MAX_ROLL_DICE; count += 1) {
        for (const mod of MODS) {
          const input = spell(count, faces, mod)
          // The fixture's own validity, or the sweep is asserting that invalid input
          // is passed through — which is true and is not what this test is for.
          if (!isValidRoll(input)) {
            failures.push(`fixture "${input}" is not a valid roll`)
            continue
          }
          for (const [from, to, ratio] of ratios) {
            const out = scaleRoll(input, ratio)
            checked += 1
            const at = `"${input}" CR ${from}→${to} (×${ratio}) → "${out}"`
            if (!isValidRoll(out)) failures.push(`${at}: isValidRoll refuses it`)
            // `+0` and `-0` are inside ROLL_PATTERN and outside every stat block
            // ever written. The implementation checks `mod === 0` before formatting
            // precisely so this cannot happen; this is the check of that.
            if (/[+-]0$/.test(out)) failures.push(`${at}: ends in a zero modifier`)
            if (normaliseRoll(out) !== out) failures.push(`${at}: is not already normalised`)
            if (from === to && out !== input) failures.push(`${at}: identity is not exact`)
          }
        }
      }
    }

    expect(checked).toBe(FACES.length * MAX_ROLL_DICE * MODS.length * 100)
    // Sliced first, so a broad breakage produces a readable diff rather than an
    // 84,000-line one.
    expect(failures.slice(0, 20)).toEqual([])
    expect(failures).toEqual([])
  })

  /**
   * ⚠️ **These are fixtures *parameterised by the benchmark table*, and the 2024
   * re-derivation moved five of the seven.** Nothing about `scaleRoll` changed — the ratios
   * fed to it did, because every row but the first reads `rowAt(to).damage /
   * rowAt(from).damage`. The claims are identical and the expected strings are the
   * arithmetic consequence of the new `damage` column.
   *
   * The **first row did not move**, and that is the point of pinning the CR 1 → CR 4 ratio
   * at exactly 2.0×: the design's own illustration survives a whole recalibration of the
   * table underneath it.
   */
  test('the design fixtures, character for character', () => {
    const table: [string, ChallengeRating, ChallengeRating, string][] = [
      // The design's own illustration, and the reason the CR 1 → CR 4 damage ratio is
      // pinned above. Unchanged by the re-derivation, by construction.
      ['1d6+2', 1, 4, '2d6+4'],
      ['2d8+3', 5, 2, '1d8+1'],
      ['4d10+5', 1, 6, '13d10+18'],
      ['1d4', 1, 6, '3d4+1'],
      // The negative-floor path: one die left, still short, floored rather than left
      // negative. Unchanged too, because the floor is where the arithmetic stops mattering.
      ['6d6', 3, 0, '1d6'],
      ['3d6-1', 2, 2, '3d6-1'],
      ['1d4', 0, 0, '1d4'],
    ]
    for (const [input, from, to, expected] of table) {
      const ratio = rowAt(to).damage / rowAt(from).damage
      expect(scaleRoll(input, ratio), `${input} CR ${from}→${to}`).toBe(expected)
    }
    expect(table).toHaveLength(7)
  })

  test('anything outside the scalable shape comes back unchanged and never throws', () => {
    const passThrough = [
      // A token has nothing to resolve against on a reduced sheet.
      '2d6+STR',
      '1d20+PROF',
      // Two terms is the same roll spelled long; folding it would need an evaluator.
      '2d6+1+2',
      // Things `isValidRoll` refuses. Rewriting one would repair a typo in silence.
      '1d7',
      '0d6',
      // Over the die cap, which is fifty since ADR 0014 — `30d6` used to be here and is
      // now a roll the grammar accepts and this function will happily scale.
      '51d6',
      '',
      'banana',
      '2d6 + 3',
    ]
    let checked = 0
    for (const input of passThrough) {
      for (const [from, to] of PAIRS) {
        const ratio = rowAt(to).damage / rowAt(from).damage
        expect(() => scaleRoll(input, ratio)).not.toThrow()
        expect(scaleRoll(input, ratio), `"${input}" CR ${from}→${to}`).toBe(input)
        checked += 1
      }
    }
    expect(checked).toBe(passThrough.length * 100)
    expect(passThrough).toHaveLength(9)
  })

  test('a ratio that is not a positive finite number changes nothing', () => {
    const refused = [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    for (const ratio of refused) {
      expect(scaleRoll('2d6+3', ratio), String(ratio)).toBe('2d6+3')
    }
  })

  /**
   * `scaleRoll` is exported and takes a bare `number`, so it is reachable with a ratio
   * no benchmark row could produce. A ratio big enough to overflow `count * ratio` to
   * `Infinity` must still come out inside the grammar — `Math.round(Infinity)` is
   * `Infinity`, which `Math.min` caps at twenty and the modifier clamp caps at 999.
   */
  test('an absurd but finite ratio still lands inside the grammar', () => {
    for (const ratio of [1e-323, 1e-9, 1e9, 1e308, Number.MAX_VALUE, Number.MIN_VALUE]) {
      const out = scaleRoll('7d12+3', ratio)
      expect(isValidRoll(out), `×${ratio} → "${out}"`).toBe(true)
      expect(/[+-]0$/.test(out), `×${ratio} → "${out}"`).toBe(false)
      expect(Number(SIMPLE_ROLL.exec(out)![1]), `×${ratio}`).toBeGreaterThan(0)
      expect(Number(SIMPLE_ROLL.exec(out)![1]), `×${ratio}`).toBeLessThanOrEqual(MAX_ROLL_DICE)
    }
  })

  // -------------------------------------------------------------------------
  // Edge cases of my own devising
  // -------------------------------------------------------------------------

  /**
   * The die cap, and what happens to the damage that no longer fits in dice. The
   * count is capped rather than the faces swapped, because how a creature's damage
   * is *distributed* is part of what it feels like to fight — so the remainder has
   * to land in the flat modifier or it is simply lost.
   */
  // ⚠️ **The input moved from `10d10` to `20d10` when the cap moved from twenty to fifty,
  // and the reason is worth stating: at this ratio ten dice now scale to thirty-one, which
  // is under the cap, so the old input would have gone on passing while testing nothing.
  // A boundary test that stops sitting on its boundary is the failure this file's other
  // ⚠️s are about.
  test('a count driven past the cap is absorbed by the flat modifier, not dropped', () => {
    const out = scaleRoll('20d10', rowAt(6).damage / rowAt(1).damage)
    // ⚠️ The modifier moved from +69 to +88 with the 2024 re-derivation and nothing else
    // about this test did: the CR 1 → CR 6 damage ratio went from 25/8 to 33/10, the cap
    // still bites at fifty dice, and the overflow still lands in the modifier. The two
    // assertions below are the actual claims and neither was touched.
    expect(out).toBe('50d10+88')
    expect(SIMPLE_ROLL.exec(out)![1]).toBe(String(MAX_ROLL_DICE))
    // Expected damage still lands on target — that is the whole point of the
    // modifier absorbing the overflow.
    const target = averageOf('20d10') * (rowAt(6).damage / rowAt(1).damage)
    expect(Math.abs(averageOf(out) - target)).toBeLessThanOrEqual(0.5)
  })

  test('the die count is never zero, however small the ratio', () => {
    let checked = 0
    for (const faces of FACES) {
      for (let count = 1; count <= MAX_ROLL_DICE; count += 1) {
        for (const ratio of [1e-9, 0.001, 0.01, 0.05, rowAt(0).damage / rowAt(6).damage]) {
          const out = scaleRoll(spell(count, faces, 0), ratio)
          const at = `${count}d${faces} ×${ratio}`
          expect(Number(SIMPLE_ROLL.exec(out)![1]), at).toBeGreaterThan(0)
          checked += 1
        }
      }
    }
    expect(checked).toBe(FACES.length * MAX_ROLL_DICE * 5)
  })

  /**
   * ⚠️ `Math.round` returns `-0` for anything in [−0.5, −0), `-0 < 0` is false so no
   * branch of the negative repair touches it, and `-0 === 0` is true so the one
   * `mod === 0` line catches both. `6d6` scaled from CR 3 to CR 0 is a real instance
   * of that path, which is why it is in the fixture table above as well.
   */
  test('a negative zero modifier can never escape into a roll string', () => {
    const failures: string[] = []
    let checked = 0
    for (const faces of FACES) {
      for (let count = 1; count <= MAX_ROLL_DICE; count += 1) {
        for (const mod of MODS) {
          for (const [from, to] of PAIRS) {
            const out = scaleRoll(spell(count, faces, mod), rowAt(to).damage / rowAt(from).damage)
            checked += 1
            if (out.includes('-0') || out.includes('+0')) {
              failures.push(`${count}d${faces} mod ${mod} CR ${from}→${to} → "${out}"`)
            }
          }
        }
      }
    }
    expect(checked).toBe(FACES.length * MAX_ROLL_DICE * MODS.length * 100)
    expect(failures.slice(0, 20)).toEqual([])
  })

  /**
   * The repair is gated on the *original* sign, and the gate does real work. These
   * two rolls differ only in that sign and take different paths: the positive one
   * gives up a die to get a friendly modifier, the negative one keeps the die
   * because the minus is the author's intent rather than an artefact of division.
   */
  test('a roll written with a minus is not rewritten by the negative repair', () => {
    // Positive modifier: two dice would need −1, so it drops to one die and +4.
    //
    // ⚠️ **The rating pair moved from CR 3 → 5 to CR ⅛ → ¼ and the expected string did
    // not.** The repair only fires in a narrow window — a ratio that rounds the count up to
    // two while leaving under nine points of expected damage to spread across them — and the
    // 2024 damage column no longer has that window at CR 3 → 5 (28/17 is 1.65, which lands
    // the modifier on zero rather than below it). CR ⅛ → ¼ is exactly 1.5 and does. A
    // fixture that had merely been updated to whatever CR 3 → 5 now produces would have
    // stopped exercising the repair at all, silently, which is the failure mode this file's
    // other ⚠️s are about.
    expect(scaleRoll('1d8+1', rowAt(0.25).damage / rowAt(0.125).damage)).toBe('1d8+4')
    // Negative modifier at a shrinking ratio: the count stays where the ratio put
    // it and the minus survives. Repaired, this would have read `9d4`.
    expect(scaleRoll('20d4-5', 0.5)).toBe('10d4-2')
    expect(scaleRoll('3d6-1', 1)).toBe('3d6-1')
    // And at a ratio of exactly 1 the repair provably cannot fire, which is what
    // keeps the identity case undisturbed — asserted across the whole grammar in
    // the sweep above.
  })

  test('a single die that has given away everything it can is floored rather than left negative', () => {
    // 1d100+2 at a hundredth: the target is under one, one die is the minimum, and
    // `1d100-50` would be an attack that mostly does nothing.
    expect(scaleRoll('1d100+2', 0.01)).toBe('1d100')
    expect(scaleRoll('1d8+1', rowAt(0).damage / rowAt(3).damage)).toBe('1d8')
  })

  test('a modifier too large for the grammar is clamped rather than spelled', () => {
    // Three digits is all `ROLL_PATTERN` allows. Reachable only by a ratio steep
    // enough that the die cap has already absorbed everything else — at which point
    // expected damage is knowingly no longer preserved.
    const up = scaleRoll('20d4+99', rowAt(6).damage / rowAt(0).damage)
    expect(up).toBe('50d4+999')
    expect(isValidRoll(up)).toBe(true)
    // Thirteen dice became seventeen with the 2024 re-derivation, because the CR 0 → CR 6
    // damage ratio went from 25/2 to 33/2. The claim — clamped, and still a legal roll — is
    // the line below it and did not move.
    const down = scaleRoll('1d4-99', rowAt(6).damage / rowAt(0).damage)
    expect(down).toBe('17d4-999')
    expect(isValidRoll(down)).toBe(true)
  })

  /**
   * A hazard worth naming rather than a bug: `1d6+0` is inside `ROLL_PATTERN`, so
   * it is a legal roll, and the scaler's "never emit a zero modifier" rule rewrites
   * it to `1d6` even at a ratio of exactly 1. The identity is therefore
   * character-for-character only for *canonically* written rolls. No corpus entry
   * should ever be written with `+0` — and this is the assertion that says what
   * happens if one is.
   */
  test('a redundant zero modifier is normalised away, even at the identity ratio', () => {
    expect(isValidRoll('1d6+0')).toBe(true)
    expect(scaleRoll('1d6+0', 1)).toBe('1d6')
    expect(scaleRoll('1d6-0', 1)).toBe('1d6')
  })

  test('the faces of a die are never swapped', () => {
    let checked = 0
    for (const faces of FACES) {
      for (const [from, to] of PAIRS) {
        const out = scaleRoll(`2d${faces}+2`, rowAt(to).damage / rowAt(from).damage)
        expect(SIMPLE_ROLL.exec(out)![2], `d${faces} CR ${from}→${to}`).toBe(String(faces))
        checked += 1
      }
    }
    expect(checked).toBe(FACES.length * 100)
  })
})

// ---------------------------------------------------------------------------
// 6. reconcileHp
// ---------------------------------------------------------------------------

describe('current hit points survive a change of maximum', () => {
  test('an untouched creature stays untouched, exactly', () => {
    expect(reconcileHp(40, 40, 40)).toBe(40)
    expect(reconcileHp(40, 40, 90)).toBe(90)
  })

  test('half stays half', () => {
    expect(reconcileHp(20, 40, 90)).toBe(45)
  })

  test('a corpse is not resurrected by adjusting the fight', () => {
    expect(reconcileHp(0, 40, 90)).toBe(0)
    expect(reconcileHp(-5, 40, 90)).toBe(0)
  })

  /**
   * ⚠️ The floor of 1. A ratio of 1/200 rounds to zero, and `healthBand` promises in
   * writing that a creature which is alive is never `down` — the band the party acts
   * on immediately. A promise with an exception in it is not one.
   */
  test('a creature that is alive is never scaled into being down', () => {
    expect(reconcileHp(1, 200, 20)).toBe(1)
    expect(reconcileHp(1, 999, 1)).toBe(1)
  })

  /** The accepted cost at the other end, stated so nobody rediscovers it. */
  test('a barely-hurt creature is over-healed by a point rather than special-cased', () => {
    expect(reconcileHp(199, 200, 20)).toBe(20)
  })

  test('no old maximum means no ratio, so the value is simply re-clamped', () => {
    expect(reconcileHp(40, 0, 90)).toBe(clampHp(40, 90))
    expect(reconcileHp(40, Number.NaN, 90)).toBe(clampHp(40, 90))
    expect(reconcileHp(40, -5, 90)).toBe(clampHp(40, 90))
    expect(reconcileHp(40, Number.POSITIVE_INFINITY, 90)).toBe(clampHp(40, 90))
  })

  test('a nonsense current value gets one answer, and it is zero', () => {
    expect(reconcileHp(Number.NaN, 40, 90)).toBe(0)
    expect(reconcileHp(Number.POSITIVE_INFINITY, 40, 90)).toBe(0)
    expect(reconcileHp(Number.NEGATIVE_INFINITY, 40, 90)).toBe(0)
  })

  /**
   * ⚠️ The floor must not exceed the ceiling. Applied the other way round, this
   * returns a creature alive on 1 of 0 — a health bar drawn past the end of itself.
   */
  test('a maximum of zero leaves nothing alive, floor or no floor', () => {
    expect(reconcileHp(20, 40, 0)).toBe(0)
    expect(reconcileHp(1, 200, 0)).toBe(0)
    expect(reconcileHp(40, 40, 0)).toBe(0)
  })

  test('always lands on a whole number inside the new range', () => {
    const currents = [0, 1, 2, 5, 19, 20, 39, 40, 41, 99, 100, 199, 200]
    const maxima = [1, 2, 20, 40, 90, 200, 999]
    let checked = 0
    for (const current of currents) {
      for (const oldMax of maxima) {
        for (const newMax of maxima) {
          const out = reconcileHp(current, oldMax, newMax)
          const at = `(${current}, ${oldMax}, ${newMax})`
          expect(Number.isInteger(out), at).toBe(true)
          expect(Object.is(out, -0), `${at} is -0`).toBe(false)
          expect(out, at).toBeGreaterThanOrEqual(0)
          expect(out, at).toBeLessThanOrEqual(newMax)
          // The promise, swept: alive in, alive out.
          if (current > 0) expect(out, at).toBeGreaterThanOrEqual(1)
          else expect(out, at).toBe(0)
          checked += 1
        }
      }
    }
    expect(checked).toBe(currents.length * maxima.length * maxima.length)
    expect(checked).toBeGreaterThan(400)
  })

  /**
   * The reason this function exists: a CR shift moves `maxHp` on the sheet while
   * current hit points sit in `characterVitals`, so the two have to be reconciled or
   * the health bar is drawn past the end of itself.
   */
  test('reconciles a real CR shift without leaving current above the new maximum', () => {
    let checked = 0
    for (const fixture of FIXTURES) {
      for (const [from, to] of PAIRS) {
        const oldMax = scaleCombat(fixture.combat, fixture.cr, from).maxHp
        const newMax = scaleCombat(fixture.combat, fixture.cr, to).maxHp
        for (const fraction of [0, 0.01, 0.5, 0.99, 1]) {
          const current = Math.max(0, Math.round(oldMax * fraction))
          const out = reconcileHp(current, oldMax, newMax)
          const at = `${fixture.label} CR ${from}→${to} on ${current}/${oldMax}`
          expect(out, at).toBeLessThanOrEqual(newMax)
          expect(out, at).toBeGreaterThanOrEqual(0)
          if (current > 0) expect(out, at).toBeGreaterThan(0)
          checked += 1
        }
      }
    }
    expect(checked).toBe(FIXTURES.length * 100 * 5)
  })
})

// ---------------------------------------------------------------------------
// 7. The rating arithmetic
// ---------------------------------------------------------------------------

describe('a rating is a selection rather than a number', () => {
  test('is written the way a DM says it out loud', () => {
    const table: [ChallengeRating, string][] = [
      [0, '0'],
      [0.125, '1/8'],
      [0.25, '1/4'],
      [0.5, '1/2'],
      [1, '1'],
      [2, '2'],
      [3, '3'],
      [4, '4'],
      [5, '5'],
      [6, '6'],
    ]
    for (const [cr, label] of table) expect(crLabel(cr), String(cr)).toBe(label)
    // One label per rating, and all ten distinct.
    expect(table.map(([cr]) => cr)).toEqual([...CR_VALUES])
    expect(new Set(table.map(([, label]) => label)).size).toBe(10)
  })

  test('is found by position, and −1 says it is not one of the ten', () => {
    CR_VALUES.forEach((cr, index) => expect(crIndex(cr), String(cr)).toBe(index))
    for (const cr of [0.3, Number.NaN, Number.POSITIVE_INFINITY, -1, 7, 1.5]) {
      expect(crIndex(cr), String(cr)).toBe(-1)
    }
  })

  test('steps by position, so the unequal gaps between ratings do not matter', () => {
    CR_VALUES.forEach((cr, index) => {
      if (index > 0) expect(stepCr(cr, -1), String(cr)).toBe(CR_VALUES[index - 1])
      if (index < CR_VALUES.length - 1) expect(stepCr(cr, 1), String(cr)).toBe(CR_VALUES[index + 1])
    })
    // ⅛ + 1 is not a rating; ⅛ stepped once is ¼.
    expect(stepCr(0.125, 1)).toBe(0.25)
  })

  test('clamps at both ends rather than inventing a rating past them', () => {
    expect(stepCr(6, 1)).toBe(6)
    expect(stepCr(0, -1)).toBe(0)
    expect(stepCr(0, 100)).toBe(6)
    expect(stepCr(6, -100)).toBe(0)
  })

  test('hands back a rating it cannot place, rather than snapping it to one', () => {
    expect(stepCr(0.3, 1)).toBe(0.3)
    expect(stepCr(7, -1)).toBe(7)
    expect(Number.isNaN(stepCr(Number.NaN, 1))).toBe(true)
    // A nonsense delta is no step at all, not a jump to an end of the table.
    expect(stepCr(1, Number.NaN)).toBe(1)
    expect(stepCr(1, Number.POSITIVE_INFINITY)).toBe(1)
    // Fractional deltas round; half a press is one press.
    expect(stepCr(1, 0.4)).toBe(1)
  })

  test('falls in the tier the spec puts it in', () => {
    const table: [ChallengeRating, number][] = [
      [0, 1],
      [0.125, 1],
      [0.25, 1],
      [0.5, 2],
      [1, 2],
      [2, 3],
      [3, 3],
      [4, 4],
      [5, 4],
      [6, 5],
    ]
    for (const [cr, tier] of table) expect(tierOf(cr), `CR ${cr}`).toBe(tier)
    expect(table.map(([cr]) => cr)).toEqual([...CR_VALUES])
  })

  test('reads an unplaceable rating as the weakest tier rather than as a boss', () => {
    expect(tierOf(7)).toBe(1)
    expect(tierOf(Number.NaN)).toBe(1)
    expect(tierOf(-1)).toBe(1)
  })
})
