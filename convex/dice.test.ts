import { describe, expect, test } from 'vitest'

import {
  critOf,
  cryptoDice,
  evaluateRoll,
  fixedSource,
  maxSource,
  minSource,
  modifiersFor,
  rollRange,
  sequenceSource,
  type RollModifiers,
} from './lib/dice'
import { BESTIARY } from './lib/bestiary'
import { CR_VALUES, type ChallengeRating } from './lib/creatures'
import { LIBRARY } from './lib/library'
import type { LibrarySheet } from './lib/library'
import { resolveBestiaryAt } from './lib/resolve'
import { FEATS, NPC_ACTIONS, SPELLS } from './lib/rules'
import {
  MAX_ROLL_DICE,
  ROLL_MODIFIER_TOKENS,
  abilityModifier,
  defaultNpcSheet,
  defaultPcSheet,
  isValidRoll,
  proficiencyBonus,
  sheetEntriesOf,
  toHitOf,
} from './lib/sheet'
import type { PcSheet } from './lib/sheet'

/**
 * THE EVALUATOR, AGAINST EVERY EXPRESSION THE GAME CAN PRODUCE.
 *
 * The corpora are the test. The sheets milestone fixed the roll grammar and validated three corpora
 * against it a milestone before anything could evaluate one, on the stated bet that the
 * evaluator would then land on content already known to conform — so this suite collects
 * that bet by enumerating the expressions **at runtime** rather than naming a handful of
 * shapes somebody thought of.
 *
 * That distinction is the whole architecture of the file, and it is `library.test.ts`'s
 * applied to arithmetic. A hand-written list of interesting rolls is only ever as good as
 * the rolls somebody remembered, and the awkward ones here were all found by looking:
 * `1d20+STR+CHA+PROF` is the only four-term expression in the game, `1d8+STR+2` mixes a
 * token with a flat, the wizard's Portent is `2d20` and `3d20`, the Ranger's Animal Companion
 * rolls `1d20+5` with no token at all, several entries put a d20 in the *damage* slot, and the
 * CR scaler turns a modest `2d6` into a `12d6` on the way up. Not one of those would have been
 * on a list.
 *
 * ⚠️ **This file may import the corpora directly, and nothing under `src/` may.**
 * `corpusGuard.test.ts` excludes `.test.ts` files precisely so a test can read the content
 * it is checking; `bundleGuard.test.ts` is what keeps lib/dice.ts and the two corpora out of
 * the client bundle. Reading them here is the point rather than an exception.
 */

// ---------------------------------------------------------------------------
// The fixtures the modifiers come from
// ---------------------------------------------------------------------------

/**
 * DELIBERATELY UNEQUAL ABILITY SCORES, and a level whose proficiency bonus is not two.
 *
 * Six scores of ten would make every ability token resolve to zero, at which point
 * `1d8+STR`, `1d8+CHA` and `1d8` are the same arithmetic and the four-term expression in
 * the library proves nothing. These six give six different modifiers — +4, +3, +2, +1, 0,
 * −1 — and level 9 gives a `PROF` of +4, so a term read in the wrong place shifts a total.
 */
const HERO: PcSheet = {
  ...defaultPcSheet(),
  level: 9,
  abilities: { str: 18, dex: 16, con: 14, int: 12, wis: 10, cha: 8 },
}

const HERO_MODS: RollModifiers = modifiersFor(HERO)

/** The ten ratings, as the array the bestiary loop steps through. */
const RATINGS: readonly ChallengeRating[] = CR_VALUES

// ---------------------------------------------------------------------------
// (a) THE CORPUS IS THE TEST
//
// Every expression in the game, gathered from the three places one can live: a premade
// sheet in lib/library/, a catalogue entry in lib/rules.ts, and a creature in
// lib/bestiary/ resolved at each of the ten ratings.
//
// The bestiary half reaches through `resolveBestiaryAt`, which is the shipping path — entry,
// then the CR scaler, then the entries the resolver builds — rather than reading `damage`
// off an attack. That matters twice over. An attack's damage is *rewritten* by the scaler, so
// two thirds of the 194 expressions this finds — a `12d6` where the content wrote `2d6` —
// exist nowhere in it and are produced; and a creature's to-hit is composed from its scaled
// `attackBonus` rather than stored, so reading the corpus directly would miss every one of
// those as well.
//
// ⚠️ **The roadmap's own count of the bestiary's expressions was wrong, and this is how.**
// It said 27, which is what a grep for `roll:` finds — but `roll:` belongs to an *ability*,
// and an attack carries `damage:`. The loop below reaches both, which is why the anti-vacuity
// gate asserts a number comfortably larger rather than merely non-zero: a gate set at 1
// would have passed happily over exactly the omission that produced the 27.
// ---------------------------------------------------------------------------

/** An expression and where it was found, so a failure names the entry rather than an index. */
type Found = Map<string, string>

function record(into: Found, expression: string | null | undefined, where: string) {
  if (expression === null || expression === undefined || expression === '') return
  if (!into.has(expression)) into.set(expression, where)
}

/** Feats and spells together — one premade sheet's worth of lines. */
function libraryEntries(sheet: LibrarySheet) {
  return [...sheet.feats, ...sheet.spells]
}

const LIBRARY_ROLLS: Found = new Map()
const LIBRARY_TO_HITS: Found = new Map()

for (const [classKey, library] of Object.entries(LIBRARY)) {
  const placed: { label: string; sheet: LibrarySheet }[] = [
    { label: `${classKey}/base`, sheet: library.base },
  ]
  for (const [subclassKey, levels] of Object.entries(library.paths)) {
    for (const [level, sheet] of Object.entries(levels)) {
      placed.push({ label: `${classKey}/${subclassKey}/${level}`, sheet })
    }
  }

  for (const { label, sheet } of placed) {
    for (const entry of libraryEntries(sheet)) {
      record(LIBRARY_ROLLS, entry.roll, `${label} · ${entry.name}`)
      record(LIBRARY_TO_HITS, entry.toHit, `${label} · ${entry.name} (to hit)`)
    }
  }
}

const CATALOGUE_ROLLS: Found = new Map()
const CATALOGUE_TO_HITS: Found = new Map()

for (const [list, name] of [
  [SPELLS, 'SPELLS'],
  [FEATS, 'FEATS'],
  [NPC_ACTIONS, 'NPC_ACTIONS'],
] as const) {
  for (const entry of list) {
    record(CATALOGUE_ROLLS, entry.roll, `${name} · ${entry.key}`)
    record(CATALOGUE_TO_HITS, entry.toHit, `${name} · ${entry.key} (to hit)`)
  }
}

const BESTIARY_ROLLS: Found = new Map()
const BESTIARY_TO_HITS: Found = new Map()

/**
 * The same rolls at each creature's **own** rating only — the corpus as written, before the
 * scaler has multiplied anything.
 *
 * Kept as a second map so the two counts can be compared, which is what makes "resolved at
 * every rating" a checkable claim rather than a comment: if the loop below only ever reached
 * one rating, these two would be the same size.
 */
const BESTIARY_ROLLS_AT_OWN_CR: Found = new Map()

for (const entry of BESTIARY) {
  for (const cr of RATINGS) {
    const sheet = resolveBestiaryAt(entry.key, cr)
    // Null only for a key nothing declares, which by construction cannot happen here — the
    // keys come out of the corpus itself. Skipped rather than asserted, because
    // `lib/bestiary.test.ts` is where the corpus's own integrity is checked.
    if (!sheet) continue
    for (const line of sheetEntriesOf(sheet)) {
      record(BESTIARY_ROLLS, line.roll, `${entry.key}@${cr} · ${line.name}`)
      record(BESTIARY_TO_HITS, toHitOf(line), `${entry.key}@${cr} · ${line.name} (to hit)`)
      if (cr === entry.cr) {
        record(BESTIARY_ROLLS_AT_OWN_CR, line.roll, `${entry.key} · ${line.name}`)
      }
    }
  }
}

/** Everything, deduplicated across all three sources. */
const EVERY_EXPRESSION: Found = new Map([
  ...LIBRARY_ROLLS,
  ...LIBRARY_TO_HITS,
  ...CATALOGUE_ROLLS,
  ...CATALOGUE_TO_HITS,
  ...BESTIARY_ROLLS,
  ...BESTIARY_TO_HITS,
])

/**
 * The die count as *written*, read straight off the string.
 *
 * A second, deliberately naive parser. The point of the assertion it feeds is that the
 * evaluator throws as many dice as the expression asks for, and asking lib/dice.ts how many
 * that is would make the check compare the parser with itself.
 */
function writtenCount(expression: string): number {
  const head = /^(\d+)d/.exec(expression)
  return head ? Number(head[1]) : 0
}

describe('the enumeration reaches the whole of all three corpora', () => {
  /**
   * ⚠️ **Anti-vacuity, and it is the load-bearing test in this file.** Every loop below
   * walks a map built at import time, so a glob that matched nothing, an import that
   * resolved to an empty object or a resolver that quietly returned no entries would make
   * every other test here pass while asserting nothing at all. The thresholds are floors
   * rather than exact counts because content is expected to grow — but they are floors
   * within sight of the real figures, so losing a class or a content file trips one.
   */
  test('each source contributes the number of distinct expressions it should', () => {
    // 32 at the time of writing: the whole premade library's feats and spells.
    expect(LIBRARY_ROLLS.size).toBeGreaterThanOrEqual(32)
    // Exactly seven, and pinned exactly rather than as a floor: a to-hit on a premade sheet
    // is `1d20` plus a token combination, and there are only so many of those a hero can
    // have. A new one is a content decision worth a second look at this line.
    expect(LIBRARY_TO_HITS.size).toBe(7)
    // 21 and 6. The catalogue and the library overlap heavily — a premade sheet's lines are
    // copies of catalogue entries — which is why the union below is far short of the sum.
    expect(CATALOGUE_ROLLS.size).toBeGreaterThanOrEqual(18)
    expect(CATALOGUE_TO_HITS.size).toBeGreaterThanOrEqual(6)
    // 194 and 10.
    expect(BESTIARY_ROLLS.size + BESTIARY_TO_HITS.size).toBeGreaterThanOrEqual(60)
    // ⚠️ **61, not 27.** This is the count the roadmap got wrong, pinned: `roll:` is an
    // *ability's* field and an attack carries `damage:`, so a grep for the first finds a
    // third of the expressions in the bestiary. A gate at 1 would have passed over exactly
    // that omission.
    expect(BESTIARY_ROLLS_AT_OWN_CR.size).toBeGreaterThanOrEqual(60)
    // And scaling genuinely produces shapes the corpus does not contain, which is what makes
    // the loop over all ten ratings worth running rather than a slower way to reach the same
    // sixty-one strings.
    expect(BESTIARY_ROLLS.size).toBeGreaterThan(BESTIARY_ROLLS_AT_OWN_CR.size * 2)
    // 227 all told.
    expect(EVERY_EXPRESSION.size).toBeGreaterThanOrEqual(200)
  })

  test('every expression the corpora produce is one the grammar accepts', () => {
    for (const [expression, where] of EVERY_EXPRESSION) {
      expect(isValidRoll(expression), `${where}: ${expression}`).toBe(true)
    }
  })
})

describe('every expression in the game evaluates inside its own range', () => {
  test('the lowest source lands exactly on the minimum and the highest on the maximum', () => {
    for (const [expression, where] of EVERY_EXPRESSION) {
      const range = rollRange(expression, HERO_MODS)
      const low = evaluateRoll(expression, HERO_MODS, 'flat', minSource())
      const high = evaluateRoll(expression, HERO_MODS, 'flat', maxSource())

      expect(low.total, `${where}: ${expression} at minimum`).toBe(range.min)
      expect(high.total, `${where}: ${expression} at maximum`).toBe(range.max)
      // Not vacuous: a range whose ends coincide would make the two assertions above one
      // assertion, and every expression in the game rolls at least one die.
      expect(range.max, `${where}: ${expression}`).toBeGreaterThan(range.min)
    }
  })

  test('a real roll lands inside the range and throws exactly the written dice', () => {
    for (const [expression, where] of EVERY_EXPRESSION) {
      const range = rollRange(expression, HERO_MODS)
      const result = evaluateRoll(expression, HERO_MODS, 'flat', cryptoDice)

      expect(result.total, `${where}: ${expression}`).toBeGreaterThanOrEqual(range.min)
      expect(result.total, `${where}: ${expression}`).toBeLessThanOrEqual(range.max)
      expect(result.dice.length, `${where}: ${expression}`).toBe(writtenCount(expression))
      expect(result.dice.length, `${where}: ${expression}`).toBeLessThanOrEqual(MAX_ROLL_DICE)
      expect(result.expression, `${where}`).toBe(expression)
      // Every die reports the faces it was thrown on, and every face is a legal one. The 3D
      // dice are handed this array, so a die claiming a face it cannot have is a die the
      // physics engine is asked to render.
      for (const die of result.dice) {
        expect(die.value, `${where}: ${expression}`).toBeGreaterThanOrEqual(1)
        expect(die.value, `${where}: ${expression}`).toBeLessThanOrEqual(die.faces)
      }
    }
  })

  /**
   * The shapes worth naming, named — so that a content edit removing one shows up as a
   * failing expectation rather than as a silently narrower suite. Every one of them was
   * found by looking at the corpora rather than by imagining what a roll could be.
   */
  test('the awkward shapes the corpora actually contain are all present', () => {
    for (const shape of [
      // Four terms, and the only expression in the game with that many.
      '1d20+STR+CHA+PROF',
      // A token and a flat in the same expression, on a damage roll and on a to-hit.
      '1d8+STR+2',
      '1d20+DEX+PROF+2',
      // Portent. Two and three d20s, which is what makes the single-d20 conditions bite.
      '2d20',
      '3d20',
      // A d20 in the damage slot — a check written as an entry's roll rather than a to-hit.
      '1d20+WIS+PROF',
      '1d20+INT+PROF',
      // Flat only, no token at all: the Ranger's Animal Companion.
      '1d8+3',
      '1d20+5',
      // And the majority shape, with no modifier of any kind.
      '2d6',
    ]) {
      expect(EVERY_EXPRESSION.has(shape), `${shape} has gone from the corpora`).toBe(true)
    }
  })

  /**
   * ⚠️ **The grammar's extremes are tested synthetically, because the corpus does not
   * reach them.** `20d6+455` is the shape the CR scaler is *capable* of emitting — twenty
   * dice is `MAX_ROLL_DICE` and the flat modifier absorbs whatever the capped count could not
   * account for — but the bestiary's ten ratings only span CR 0 to 6, so the steepest ratio in
   * play tops out at `12d6` with a modifier of 18. Leaving the extremes untested on the
   * grounds that no content produces one today would leave the evaluator unchecked at exactly
   * the point a wider CR range or a bigger creature would first reach it.
   */
  test('the grammar’s extremes evaluate, even where no content reaches them', () => {
    for (const [expression, min, max] of [
      ['20d6+455', 475, 575],
      ['20d100', 20, 2000],
      ['1d4-999', 0, 0],
      ['20d12-999', 0, 0],
    ] as const) {
      expect(isValidRoll(expression), expression).toBe(true)
      expect(rollRange(expression, HERO_MODS), expression).toEqual({ min, max })
      expect(evaluateRoll(expression, HERO_MODS, 'flat', minSource()).total, expression).toBe(min)
      expect(evaluateRoll(expression, HERO_MODS, 'flat', maxSource()).total, expression).toBe(max)
      expect(
        evaluateRoll(expression, HERO_MODS, 'flat', cryptoDice).dice.length,
        expression,
      ).toBe(writtenCount(expression))
    }
  })
})

// ---------------------------------------------------------------------------
// (b) Advantage and disadvantage, against a scripted source
// ---------------------------------------------------------------------------

describe('advantage and disadvantage on a single d20', () => {
  test('advantage keeps the higher die and reports the other as dropped', () => {
    const result = evaluateRoll('1d20', HERO_MODS, 'advantage', sequenceSource([4, 18]))
    expect(result.dice).toEqual([{ faces: 20, value: 18 }])
    expect(result.dropped).toBe(4)
    expect(result.total).toBe(18)
  })

  test('disadvantage keeps the lower die and reports the other as dropped', () => {
    const result = evaluateRoll('1d20', HERO_MODS, 'disadvantage', sequenceSource([4, 18]))
    expect(result.dice).toEqual([{ faces: 20, value: 4 }])
    expect(result.dropped).toBe(18)
    expect(result.total).toBe(4)
  })

  test('flat rolls once and drops nothing', () => {
    // One value in the script, so a second draw would throw rather than pass quietly —
    // which is the whole reason `sequenceSource` is allowed to throw.
    const result = evaluateRoll('1d20', HERO_MODS, 'flat', sequenceSource([4]))
    expect(result.dice).toEqual([{ faces: 20, value: 4 }])
    expect(result.dropped).toBeNull()
  })

  test('the toggle applies to a to-hit with modifiers, and the modifier is added once', () => {
    const result = evaluateRoll('1d20+STR+PROF', HERO_MODS, 'advantage', sequenceSource([9, 2]))
    expect(result.dice).toEqual([{ faces: 20, value: 9 }])
    expect(result.dropped).toBe(2)
    expect(result.modifier).toBe(8)
    expect(result.total).toBe(17)
  })

  /**
   * ⚠️ **The inert cases are asserted, not assumed.** `ROLL_MODES` in lib/roll.ts decided
   * that advantage on a damage roll is recorded and ignored rather than refused, because
   * the roller has a sticky toggle set from the last saving throw. That decision is only
   * real if a `2d6` with the toggle on throws two dice — and Portent is the case that makes
   * the rule bite, since `2d20` and `3d20` are d20s and still get no second draw.
   */
  test('anywhere but a single d20 the mode is inert and exactly the written dice are thrown', () => {
    for (const [expression, count] of [
      ['2d6', 2],
      ['2d20', 2],
      ['3d20', 3],
      ['1d8+STR', 1],
    ] as const) {
      for (const mode of ['advantage', 'disadvantage'] as const) {
        const result = evaluateRoll(expression, HERO_MODS, mode, fixedSource(20))
        expect(result.dice.length, `${expression} with ${mode}`).toBe(count)
        expect(result.dropped, `${expression} with ${mode}`).toBeNull()
        // The row still records what was asked for, so a feed line can say the toggle was
        // set — `rollModeNote` is what decides that it did nothing.
        expect(result.mode, `${expression} with ${mode}`).toBe(mode)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// (c) Crits
// ---------------------------------------------------------------------------

describe('critOf answers only for a lone d20', () => {
  test('a natural 20 succeeds, a natural 1 fails and a 19 is neither', () => {
    expect(critOf([{ faces: 20, value: 20 }])).toBe('success')
    expect(critOf([{ faces: 20, value: 1 }])).toBe('failure')
    expect(critOf([{ faces: 20, value: 19 }])).toBeNull()
  })

  test('three d20s all showing 20 is still nothing', () => {
    const dice = [20, 20, 20].map((value) => ({ faces: 20, value }))
    expect(critOf(dice)).toBeNull()
    // And through the evaluator, because Portent is a real entry rather than a hypothesis.
    expect(evaluateRoll('3d20', HERO_MODS, 'flat', maxSource()).crit).toBeNull()
  })

  test('a d8 on its highest face is not a crit', () => {
    expect(critOf([{ faces: 8, value: 8 }])).toBeNull()
    expect(evaluateRoll('1d8', HERO_MODS, 'flat', maxSource()).crit).toBeNull()
  })

  test('the natural die decides, not the total', () => {
    // 20 + 8 = 28 and 1 + 8 = 9, and neither total is what is being read.
    const hit = evaluateRoll('1d20+STR+PROF', HERO_MODS, 'flat', fixedSource(20))
    expect(hit.total).toBe(28)
    expect(hit.crit).toBe('success')

    const miss = evaluateRoll('1d20+STR+PROF', HERO_MODS, 'flat', fixedSource(1))
    expect(miss.total).toBe(9)
    expect(miss.crit).toBe('failure')

    // And a total of 20 reached without a natural 20 is not a crit, which is the mistake
    // this test exists to catch.
    const arithmetic = evaluateRoll('1d20+STR+PROF', HERO_MODS, 'flat', fixedSource(12))
    expect(arithmetic.total).toBe(20)
    expect(arithmetic.crit).toBeNull()
  })

  test('advantage crits on the die it kept and never on the one it dropped', () => {
    const kept = evaluateRoll('1d20', HERO_MODS, 'advantage', sequenceSource([1, 20]))
    expect(kept.crit).toBe('success')
    expect(kept.dropped).toBe(1)

    const lower = evaluateRoll('1d20', HERO_MODS, 'disadvantage', sequenceSource([1, 20]))
    expect(lower.crit).toBe('failure')
    expect(lower.dropped).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// (d) Resolving the tokens
// ---------------------------------------------------------------------------

describe('modifiersFor', () => {
  test('a hero resolves each ability token and PROF from the sheet', () => {
    const mods = modifiersFor(HERO)
    expect(mods.STR).toBe(abilityModifier(HERO.abilities.str))
    expect(mods.DEX).toBe(abilityModifier(HERO.abilities.dex))
    expect(mods.CON).toBe(abilityModifier(HERO.abilities.con))
    expect(mods.INT).toBe(abilityModifier(HERO.abilities.int))
    expect(mods.WIS).toBe(abilityModifier(HERO.abilities.wis))
    expect(mods.CHA).toBe(abilityModifier(HERO.abilities.cha))
    expect(mods.PROF).toBe(proficiencyBonus(HERO.level))

    // Not vacuous: six equal modifiers would make the six assertions above one assertion.
    expect(new Set([mods.STR, mods.DEX, mods.CON, mods.INT, mods.WIS, mods.CHA]).size).toBe(6)
    expect(mods.PROF).toBe(4)
  })

  test('every one of the seven tokens is answered', () => {
    const mods = modifiersFor(HERO)
    for (const token of ROLL_MODIFIER_TOKENS) {
      expect(typeof mods[token], token).toBe('number')
      expect(Number.isFinite(mods[token]), token).toBe(true)
    }
    expect(Object.keys(mods)).toHaveLength(ROLL_MODIFIER_TOKENS.length)
  })

  /**
   * A creature has no ability scores and no level, which is why the bestiary never writes a
   * token into a roll and why `scaleRoll` calls one a content bug. A DM can still type one,
   * and this is the promised answer: `1d8+0`, honestly, rather than a throw or an invented
   * Strength.
   */
  test('a creature answers every token with zero, so a hand-typed token adds nothing', () => {
    const mods = modifiersFor(defaultNpcSheet())
    for (const token of ROLL_MODIFIER_TOKENS) expect(mods[token], token).toBe(0)

    const withToken = evaluateRoll('1d8+STR', mods, 'flat', fixedSource(5))
    const without = evaluateRoll('1d8', mods, 'flat', fixedSource(5))
    expect(withToken.modifier).toBe(0)
    expect(withToken.total).toBe(without.total)
    expect(rollRange('1d8+STR', mods)).toEqual(rollRange('1d8', mods))

    // The positive control, so the equality above is not simply two zero results: the same
    // expression against a hero's modifiers is a different roll.
    expect(evaluateRoll('1d8+STR', HERO_MODS, 'flat', fixedSource(5)).total).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// (e) The generator itself
//
// A smoke test for a modulo bias, not a statistics exam. Twenty thousand d20s is enough that
// a face missing entirely or a face taking a tenth of the sample is a certainty rather than
// bad luck, and nowhere near enough to say anything about the quality of the platform's CSPRNG
// — which is not this file's business. What is being checked is that the rejection loop in
// `cryptoDice` covers the whole range and folds it evenly, which is the one thing a hand-rolled
// `% faces` gets wrong.
// ---------------------------------------------------------------------------

describe('cryptoDice', () => {
  const SAMPLE = 20_000

  test('every face of a d20 appears, none outside, and none takes more than 8% of the sample', () => {
    const counts = new Map<number, number>()
    for (let index = 0; index < SAMPLE; index += 1) {
      const value = cryptoDice(20)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }

    for (let face = 1; face <= 20; face += 1) {
      const count = counts.get(face) ?? 0
      expect(count, `face ${face} never came up`).toBeGreaterThan(0)
      // Fair is 5%. Eight is roughly nineteen standard deviations away at this sample size,
      // so this fires on a bias and not on a run of luck.
      expect(count / SAMPLE, `face ${face} took too much of the sample`).toBeLessThan(0.08)
    }
    expect(counts.size).toBe(20)
  })

  test('every die the grammar allows is answered inside its own range', () => {
    for (const faces of [4, 6, 8, 10, 12, 20, 100]) {
      const seen = new Set<number>()
      for (let index = 0; index < 400; index += 1) {
        const value = cryptoDice(faces)
        expect(Number.isInteger(value), `d${faces} rolled ${value}`).toBe(true)
        expect(value, `d${faces}`).toBeGreaterThanOrEqual(1)
        expect(value, `d${faces}`).toBeLessThanOrEqual(faces)
        seen.add(value)
      }
      // Four hundred draws on the smallest die in the grammar cannot plausibly miss a face,
      // so this catches a source stuck on one value — which every range assertion above
      // would happily accept.
      expect(seen.size, `d${faces} produced too few distinct faces`).toBeGreaterThan(1)
    }
  })
})

// ---------------------------------------------------------------------------
// (f) Fail-soft
// ---------------------------------------------------------------------------

describe('an expression the grammar refuses is an empty roll rather than a throw', () => {
  /**
   * The roll path paints a feed line during play, and the expressions it is handed come from
   * 763 hand-written entries plus whatever a DM has typed. A content bug in one of them must
   * not take a mutation down mid-session — `sheetProblem` already refuses a bad roll on the
   * write path, where a person is present to be told.
   */
  test('every malformed shape returns zeroes, keeps the expression and does not throw', () => {
    for (const nonsense of [
      'nonsense',
      '',
      '   ',
      '1d7',
      '0d6',
      '30d6',
      '1d20+',
      'STR',
      '1d20+STR+',
      '2d6+1000',
      'd20',
      '1D20',
    ]) {
      const result = evaluateRoll(nonsense, HERO_MODS, 'advantage', cryptoDice)
      expect(result.expression, nonsense).toBe(nonsense)
      expect(result.dice, nonsense).toEqual([])
      expect(result.modifier, nonsense).toBe(0)
      expect(result.total, nonsense).toBe(0)
      expect(result.crit, nonsense).toBeNull()
      // Null even under advantage, so `rollModeNote` cannot print `with advantage` over a
      // roll that never happened.
      expect(result.dropped, nonsense).toBeNull()
      expect(rollRange(nonsense, HERO_MODS), nonsense).toEqual({ min: 0, max: 0 })
    }
  })

  /**
   * THE POSITIVE CONTROL, and it is not optional. Every assertion above is satisfied by an
   * evaluator that returns zeroes for everything, so the suite needs one call on the same
   * path proving that a valid expression comes out non-zero.
   */
  test('a valid expression on the same call path is a real roll', () => {
    const result = evaluateRoll('2d6+3', HERO_MODS, 'flat', cryptoDice)
    expect(result.dice).toHaveLength(2)
    expect(result.modifier).toBe(3)
    expect(result.total).toBeGreaterThanOrEqual(5)
    expect(result.total).toBeLessThanOrEqual(15)
    expect(rollRange('2d6+3', HERO_MODS)).toEqual({ min: 5, max: 15 })
  })

  test('a total is floored at zero and the working still shows the arithmetic', () => {
    // Nothing in the corpora is this punitive; the floor exists so that a heavily penalised
    // hand-typed roll reads `0` rather than `-2`.
    const result = evaluateRoll('1d4-999', HERO_MODS, 'flat', maxSource())
    expect(result.modifier).toBe(-999)
    expect(result.total).toBe(0)
    expect(rollRange('1d4-999', HERO_MODS)).toEqual({ min: 0, max: 0 })
  })
})
