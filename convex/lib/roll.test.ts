import { describe, expect, test } from 'vitest'

import {
  FEED_PARTS,
  FEED_PART_LABELS,
  ROLL_MODES,
  ROLL_MODE_LABELS,
  abilityKeyValidator,
  feedPartValidator,
  partsFor,
  rollModeNote,
  rollModeValidator,
  rollSentence,
  rollWorking,
  skillKeyValidator,
} from './roll'
import type { FeedPart, FeedSubject, RollResult } from './roll'
import { ABILITY_KEYS, SHEET_ENTRY_CATEGORIES, rollShapeOf } from './sheet'
import { SKILL_KEYS, SKILLS } from './skills'

/**
 * The feed's vocabulary, and the one sentence generated from it.
 *
 * Everything here is pure: no harness, no fixture, no deployment. What is worth asserting
 * about a module of validators and one template is the three things a compiler cannot
 * reach — that each hand-spelled `v.union` admits exactly the list it sits beside, that
 * every shape produces a sentence rather than an empty string, and that the two rules the
 * wording actually turns on (a spell has a level; a mode only counts if a die was dropped)
 * behave as written.
 *
 * The arithmetic lives in lib/dice.ts and is tested by `dice.test.ts` against the corpus.
 * Nothing here rolls anything.
 */

// ---------------------------------------------------------------------------
// (a) The hand-spelled validators, pinned against their lists
// ---------------------------------------------------------------------------

/**
 * `sheet.ts` states the convention and `sheet.test.ts` enforces it for the groups: a
 * Convex validator is a *value* and an `as const` list is a *type*, so the names get
 * written twice on purpose and one test is cheaper than the generic that would build one
 * from the other. Three more unions arrive here and get the same treatment.
 *
 * The direction that hurts is different for each of them, which is why order is asserted
 * as well as membership. `abilityKeyValidator` and `skillKeyValidator` are what
 * `feedSubjectValidator` — and therefore the `feed` table — will accept, so a key missing
 * from one is a **save the real deployment refuses and convex-test allows**: precisely
 * the class of failure only `npm run test:smoke` has ever caught in this repo.
 * `rollModeValidator` fails the other way and just as quietly, because it is an argument
 * on the roll mutation.
 */
const literalsOf = (validator: unknown) =>
  (validator as { members: { kind: string; value: unknown }[] }).members

describe('the hand-spelled unions admit exactly their own lists', () => {
  test('the ability keys', () => {
    const members = literalsOf(abilityKeyValidator)
    expect(members.map((member) => member.kind)).toEqual(ABILITY_KEYS.map(() => 'literal'))
    expect(members.map((member) => member.value)).toEqual([...ABILITY_KEYS])
  })

  test('the thirteen skill keys', () => {
    const members = literalsOf(skillKeyValidator)
    expect(members).toHaveLength(SKILL_KEYS.length)
    expect(members.map((member) => member.value)).toEqual([...SKILL_KEYS])
  })

  test('the three roll modes', () => {
    const members = literalsOf(rollModeValidator)
    expect(members.map((member) => member.value)).toEqual([...ROLL_MODES])
  })

  test('the four parts of an entry', () => {
    const members = literalsOf(feedPartValidator)
    expect(members.map((member) => member.value)).toEqual([...FEED_PARTS])
  })

  /**
   * The two `Record`s a control renders from. A `Record` keyed by the union catches a
   * *missing* key at compile time and says nothing about a key left blank or two keys
   * sharing a word — and two buttons reading the same thing is a control nobody can use.
   */
  test('every mode and every part has its own non-empty label', () => {
    expect(Object.keys(ROLL_MODE_LABELS)).toEqual([...ROLL_MODES])
    expect(Object.keys(FEED_PART_LABELS)).toEqual([...FEED_PARTS])
    const labels = [
      ...ROLL_MODES.map((mode) => ROLL_MODE_LABELS[mode]),
      ...FEED_PARTS.map((part) => FEED_PART_LABELS[part]),
    ]
    for (const label of labels) expect(label.trim()).not.toBe('')
    expect(new Set(labels).size).toBe(labels.length)
  })
})

// ---------------------------------------------------------------------------
// (b) partsFor is rollShapeOf, restated
// ---------------------------------------------------------------------------

describe('which buttons a category offers', () => {
  test('a weapon is two clicks, an action one, a passive one', () => {
    expect(partsFor('weapon')).toEqual(['toHit', 'roll'])
    expect(partsFor('action')).toEqual(['roll'])
    expect(partsFor('passive')).toEqual(['use'])
  })

  /**
   * The claim `partsFor`'s doc comment makes, asserted rather than trusted: it is a
   * restatement of `rollShapeOf` and not a second opinion about the category. A fourth
   * category added to only one of the two would show up here even if both kept compiling
   * — which is the failure CLAUDE.md invariant 9 was written about.
   */
  test('every category agrees with its roll shape, and every category offers something', () => {
    for (const category of SHEET_ENTRY_CATEGORIES) {
      const shape = rollShapeOf(category)
      const parts = partsFor(category)
      expect(parts.length, category).toBeGreaterThan(0)
      expect(parts.includes('toHit'), category).toBe(shape.toHit)
      expect(parts.includes('roll'), category).toBe(shape.roll)
      // A passive is the one category with nothing to roll, and it still gets a button —
      // because clicking a passive has to announce it, which is the whole of what the
      // roadmap asks a passive click to do.
      expect(parts.includes('use'), category).toBe(!shape.roll)
      // `text` is a modifier on the gesture rather than a fourth button, so it is never
      // in this list even though every entry has one.
      expect(parts.includes('text'), category).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// (c) The sentence — the roadmap's six, exactly
// ---------------------------------------------------------------------------

const ACTOR = 'Chadius'

function entry(part: FeedPart, over: Partial<Extract<FeedSubject, { kind: 'entry' }>> = {}) {
  return {
    kind: 'entry' as const,
    part,
    name: 'Greatsword',
    category: 'weapon' as const,
    level: null,
    text: null,
    ...over,
  }
}

describe('the roll announcement', () => {
  /**
   * The six lines the roadmap writes out, which is the acceptance criterion for the
   * wording. Asserted as exact strings on purpose: this is copy, and copy that drifts is
   * copy nobody notices has drifted.
   */
  test('produces the roadmap’s six sentences', () => {
    expect(
      rollSentence(
        ACTOR,
        entry('roll', { name: 'Cure Wounds', category: 'action', level: 1 }),
        '2d8+WIS',
      ),
    ).toBe('Chadius casts Cure Wounds')

    expect(rollSentence(ACTOR, entry('toHit'), '1d20+STR+PROF')).toBe(
      'Chadius attacks with their Greatsword',
    )

    expect(
      rollSentence(ACTOR, entry('roll', { name: 'Divine Smite', category: 'action' }), '2d8'),
    ).toBe('Chadius uses Divine Smite')

    expect(rollSentence(ACTOR, { kind: 'check', ability: 'str' }, '1d20+STR')).toBe(
      'Chadius performs a STR check',
    )

    expect(rollSentence(ACTOR, { kind: 'save', ability: 'str' }, '1d20+STR')).toBe(
      'Chadius performs a STR saving throw',
    )

    expect(rollSentence(ACTOR, { kind: 'skill', skill: 'athletics' }, '1d20+STR')).toBe(
      'Chadius performs an Athletics roll',
    )
  })

  /**
   * ⚠️ **The spell/feature split keys off `level` and not off the category**, which is what
   * ADR 0008 said the announcement would do. Fire Bolt is a `weapon` and Shield is a
   * `passive`, and both are spells — so a test that only looked at the category would pass
   * while announcing "Chadius uses Shield".
   */
  test('a level makes it a spell, whichever category it landed in', () => {
    // A cantrip is level 0, which is falsy — the one shape a `level ? …` test would get
    // wrong, and the reason the implementation asks `=== null`.
    expect(
      rollSentence(ACTOR, entry('roll', { name: 'Fire Bolt', category: 'weapon', level: 0 }), null),
    ).toBe('Chadius rolls damage for their Fire Bolt')
    expect(
      rollSentence(ACTOR, entry('toHit', { name: 'Fire Bolt', category: 'weapon', level: 0 }), null),
    ).toBe('Chadius attacks with their Fire Bolt')
    expect(
      rollSentence(ACTOR, entry('use', { name: 'Shield', category: 'passive', level: 1 }), null),
    ).toBe('Chadius casts Shield')
    expect(
      rollSentence(ACTOR, entry('use', { name: 'Rage', category: 'passive', level: null }), null),
    ).toBe('Chadius uses Rage')
  })

  test('alt-click describes rather than rolls', () => {
    expect(
      rollSentence(ACTOR, entry('text', { name: 'Lay on Hands', category: 'passive' }), null),
    ).toBe('Chadius describes Lay on Hands')
  })

  test('initiative and ad-hoc dice', () => {
    expect(rollSentence(ACTOR, { kind: 'initiative' }, '1d20+DEX')).toBe('Chadius rolls initiative')
    expect(rollSentence(ACTOR, { kind: 'dice' }, '4d6+2')).toBe('Chadius rolls 4d6+2')
    // The expression is threaded in rather than stored a second time on the subject, so
    // its absence is a real case and not an unreachable branch.
    expect(rollSentence(ACTOR, { kind: 'dice' }, null)).toBe('Chadius rolls the dice')
  })

  /**
   * The article, which is doing more work than it looks like: seven of the thirteen skill
   * names begin with a vowel, so *"performs a Athletics roll"* would be half the list
   * rather than a corner case. Every skill is exercised because the whole point of a
   * five-vowel test over a table of thirteen articles is that it cannot fall behind a
   * rename — and this is what checks that claim.
   */
  test('every skill reads as English, and none of them is blank', () => {
    for (const key of SKILL_KEYS) {
      const sentence = rollSentence(ACTOR, { kind: 'skill', skill: key }, '1d20')
      const name = SKILLS.find((entry) => entry.key === key)?.name ?? ''
      expect(name).not.toBe('')
      expect(sentence).toBe(
        `Chadius performs ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} roll`,
      )
    }
  })

  /**
   * The sweep. Every subject shape and every part produces something a screen can print,
   * because an announcement that renders as an empty glowing line is worse than no
   * announcement — the roller learns nothing and cannot tell a bug from a miss.
   */
  test('no shape produces an empty sentence', () => {
    const subjects: FeedSubject[] = [
      ...FEED_PARTS.map((part) => entry(part)),
      ...ABILITY_KEYS.flatMap((ability): FeedSubject[] => [
        { kind: 'check', ability },
        { kind: 'save', ability },
      ]),
      ...SKILL_KEYS.map((skill): FeedSubject => ({ kind: 'skill', skill })),
      { kind: 'initiative' },
      { kind: 'dice' },
    ]
    for (const subject of subjects) {
      const sentence = rollSentence(ACTOR, subject, '1d20')
      expect(sentence.startsWith(`${ACTOR} `), JSON.stringify(subject)).toBe(true)
      expect(sentence.length, JSON.stringify(subject)).toBeGreaterThan(ACTOR.length + 4)
    }
  })
})

// ---------------------------------------------------------------------------
// (d) The mode note, which keys off what happened rather than what was asked
// ---------------------------------------------------------------------------

function result(over: Partial<RollResult> = {}): RollResult {
  return {
    expression: '1d20+STR',
    mode: 'flat',
    dice: [{ faces: 20, value: 18 }],
    dropped: null,
    modifier: 3,
    total: 21,
    crit: null,
    ...over,
  }
}

describe('whether the feed says "with advantage"', () => {
  test('it says so when a die was genuinely dropped', () => {
    expect(rollModeNote(result({ mode: 'advantage', dropped: 4 }))).toBe('with advantage')
    expect(rollModeNote(result({ mode: 'disadvantage', dropped: 19 }))).toBe('with disadvantage')
  })

  /**
   * ⚠️ **The case the whole function exists for.** A sticky toggle left on from the last
   * saving throw and then used on a damage roll asks for advantage and gets nothing,
   * because `2d6` has no d20 to keep the higher of. A note keyed off `mode` would print
   * "with advantage" over a roll the evaluator deliberately did not touch — the feed
   * asserting a rule that was not applied.
   */
  test('it stays silent when the toggle was inert', () => {
    expect(rollModeNote(result({ mode: 'advantage', dropped: null }))).toBe(null)
    expect(rollModeNote(result({ mode: 'disadvantage', dropped: null }))).toBe(null)
    expect(rollModeNote(result({ mode: 'flat', dropped: null }))).toBe(null)
  })
})

describe('the arithmetic, spelled out', () => {
  test('dice and a modifier', () => {
    expect(rollWorking(result())).toBe('18 + 3')
    expect(rollWorking(result({ dice: [{ faces: 6, value: 2 }, { faces: 6, value: 5 }] }))).toBe(
      '2 + 5 + 3',
    )
  })

  test('no modifier prints no sign, which is the majority shape in both corpora', () => {
    expect(rollWorking(result({ modifier: 0 }))).toBe('18')
  })

  test('a negative modifier reads as a subtraction rather than a plus-minus', () => {
    expect(rollWorking(result({ modifier: -2 }))).toBe('18 − 2')
  })

  test('a roll that failed to parse prints nothing rather than a stray sign', () => {
    expect(rollWorking(result({ dice: [], modifier: 0, total: 0 }))).toBe('')
  })
})
