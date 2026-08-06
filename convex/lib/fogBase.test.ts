import { describe, expect, test } from 'vitest'

import {
  FOG_ACTS,
  FOG_BASES,
  FOG_BASE_LABELS,
  fogActReveals,
  fogBaseOf,
  fogBaseValidator,
  startsCovered,
  type FogAct,
  type FogBase,
} from './fogBase'

/**
 * THE PIN THE COMPILER CANNOT PROVIDE. `lib/layers.test.ts`'s argument, for the second union
 * on this schema that is spelled twice.
 *
 * Every other guard on the base is a compile error: `startsCovered` has a `never` arm,
 * `fogActReveals` has one plus a `Record<FogBase, Record<FogAct, boolean>>`, `FOG_BASE_LABELS`
 * is a `Record<FogBase, …>`, and the DM's panel keeps four more records for its copy. Add a
 * member to `FOG_BASES` and `npm run lint` names all of them.
 *
 * ⚠️ **None of them fires in the other direction.** A literal added to `fogBaseValidator`
 * alone is a value the schema will accept and store, that `scenes.setFogBase` will take as an
 * argument, and that nothing can answer `startsCovered` for — it would meet the `never` arm at
 * runtime and the map would go dark on every screen including the DM's.
 */
describe('the fog base is spelled twice and the two spellings agree', () => {
  /** The literals a `v.union` of `v.literal`s was built from, in declaration order. */
  function literalsOf(union: typeof fogBaseValidator) {
    return union.members.map((member) => member.value)
  }

  test('the validator has exactly the members of FOG_BASES, in order', () => {
    // Order and not just membership, because `FOG_BASES` is what the DM's picker iterates —
    // so the array *is* the button order, and a reordering silently swaps two controls whose
    // labels a reader would then have to check against the wrong one.
    expect(literalsOf(fogBaseValidator)).toEqual([...FOG_BASES])
  })

  test('every base has a label and a hint, and no label names a base that does not exist', () => {
    // The forward direction is the compiler's. This is the reverse: a `Record` is satisfied by
    // extra keys, so copy left behind after a member was *removed* is invisible to `tsc`.
    expect(Object.keys(FOG_BASE_LABELS).sort()).toEqual([...FOG_BASES].sort())
    for (const base of FOG_BASES) {
      expect(FOG_BASE_LABELS[base].label.length).toBeGreaterThan(0)
      expect(FOG_BASE_LABELS[base].hint.length).toBeGreaterThan(0)
    }
  })

  test('the two bases say opposite things, which is what makes them two', () => {
    // If this ever passes with both bases giving the same answer, the union has stopped
    // earning its existence — `lib/layers.test.ts` makes the same check of its two predicates.
    expect(startsCovered('lit')).toBe(false)
    expect(startsCovered('dark')).toBe(true)
  })
})

/**
 * ⚠️⚠️ **THE TWO DEFAULTS THAT POINT IN OPPOSITE DIRECTIONS.**
 *
 * This is the single most confusing thing about the fog base and the thing somebody will
 * eventually reconcile by making one match the other. Both directions are asserted here, side
 * by side, so that "fixing" either one fails a test that says why.
 */
describe('absent means lit and unrecognised means dark', () => {
  test('a scene stored before the base existed is lit', () => {
    // Absence is HISTORY. Every scene stored before this field was calibrated under the lit
    // model and its fog was drawn as darkness, so answering `dark` here would have blacked out
    // every map in every game on the schema push.
    expect(fogBaseOf(undefined)).toBe('lit')
    expect(startsCovered(fogBaseOf(undefined))).toBe(false)
  })

  test('a stored base is answered as itself', () => {
    for (const base of FOG_BASES) expect(fogBaseOf(base)).toBe(base)
  })

  test('a base from the future is covered', () => {
    // A schema push is not atomic: a scene written by a newer deployment can be read by an
    // older one, and in that window this is the answer. Cast because the point is a value the
    // type system says cannot exist — which is exactly the case the arm is for.
    expect(startsCovered('candlelit' as FogBase)).toBe(true)
  })

  test('the two defaults are genuinely opposite, and that is not a bug', () => {
    // Stated as one assertion so a reader who makes them agree sees this line fail with this
    // name. `fogBaseOf` answers "the field is absent"; `startsCovered` answers "the field says
    // something I have never heard of". Different questions, different safe answers.
    expect(startsCovered(fogBaseOf(undefined))).toBe(false)
    expect(startsCovered('candlelit' as FogBase)).toBe(true)
  })
})

/**
 * ⚠️⚠️ **THE FULL ACT × BASE MATRIX, WHICH IS THE HIGHEST-VALUE ASSERTION IN THE MILESTONE.**
 *
 * `convex/fog.ts`'s header used to state the rule directly: two of these widen an audience and
 * one narrows it, so the stamp goes on `erase` and `clear` and not on `draw`. That is true of a
 * lit map and **exactly backwards** on a dark one. Get it wrong and rubbing out a reveal
 * replays a session's worth of rolls across the map — the failure ADR 0012 built the timestamp
 * to prevent, arriving through the mechanism it built.
 *
 * Written out one row per cell rather than looped over a formula, deliberately, for the reason
 * `lib/layers.test.ts` writes its sight table out: this table *is* the rule in the most
 * readable form it has anywhere, and a loop asserting "whatever the function says" would pass
 * for the un-inverted implementation too.
 */
describe('which fog act reveals, per base', () => {
  const MATRIX: Array<[FogAct, FogBase, boolean]> = [
    // Lit: a shape IS the darkness. Drawing one narrows; rubbing it out is the party walking in.
    ['draw', 'lit', false],
    ['erase', 'lit', true],
    ['clear', 'lit', true],
    // Dark: a shape is a HOLE in the darkness. Every answer above, inverted.
    ['draw', 'dark', true],
    ['erase', 'dark', false],
    ['clear', 'dark', false],
  ]

  test.each(MATRIX)('%s on a %s map reveals — %s', (act, base, reveals) => {
    expect(fogActReveals(act, base)).toBe(reveals)
  })

  test('the two bases disagree about every act, which is the whole inversion', () => {
    for (const act of FOG_ACTS) {
      expect(fogActReveals(act, 'lit')).toBe(!fogActReveals(act, 'dark'))
    }
  })

  test('the matrix covers every act on every base, so a fourth act cannot slip through', () => {
    // Anti-vacuity in the direction the `Record` cannot check: the table above is hand-written,
    // so a new act would compile fine here while being untested. This counts the cells.
    expect(MATRIX).toHaveLength(FOG_ACTS.length * FOG_BASES.length)
    for (const act of FOG_ACTS) {
      for (const base of FOG_BASES) {
        expect(MATRIX.some(([a, b]) => a === act && b === base)).toBe(true)
      }
    }
  })
})

/**
 * ⚠️ **BOTH RUNTIME DEFAULTS HERE POINT AT *STAMP*, WHICH IS THE OPPOSITE DIRECTION FROM
 * EVERY OTHER FAIL-CLOSED DEFAULT IN THE CODEBASE.**
 *
 * `maySeeLayer` withholds, `isMonsterSheet` treats an unknown kind as a monster, `startsCovered`
 * above answers `dark`. All three are guarding a secret. This one is not: `revealedAt` decides
 * whether a feed row arrives with a flourish over the map or arrives quietly, and every one of
 * those rows was already readable or already withheld before this function was asked.
 *
 * So the two costs are **a stamp too many, which is one missing flourish**, and **a stamp too
 * few, which replays an evening.** There is no version of this where withholding is cautious,
 * and these assertions exist so that somebody making it "consistent" with its neighbour has to
 * delete a test that says why.
 */
describe('an unrecognised act or base stamps', () => {
  test('an act nobody has heard of stamps, on both bases', () => {
    const invented = 'invert' as FogAct
    expect(fogActReveals(invented, 'lit')).toBe(true)
    expect(fogActReveals(invented, 'dark')).toBe(true)
  })

  test('a base nobody has heard of stamps, for every act', () => {
    const invented = 'candlelit' as FogBase
    for (const act of FOG_ACTS) expect(fogActReveals(act, invented)).toBe(true)
  })

  test('and this is the opposite direction from startsCovered, deliberately', () => {
    // The pair, in one place: an unknown base is treated as *more hidden* by one predicate and
    // as *worth a stamp* by the other, and neither is a default for the other.
    const invented = 'candlelit' as FogBase
    expect(startsCovered(invented)).toBe(true)
    expect(fogActReveals('erase', invented)).toBe(true)
  })
})
