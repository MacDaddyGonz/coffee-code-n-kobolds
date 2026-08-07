import { describe, expect, test } from 'vitest'

import { CLASS_KEYS, MAX_LIBRARY_LEVEL, MIN_LIBRARY_LEVEL, type ClassKey } from './classes'
import { restores } from './rest'
import {
  MAX_SLOT_LEVEL,
  MIN_SLOT_LEVEL,
  SPELL_SLOT_RECHARGE,
  SPELL_SLOT_TRACKS,
  SPELL_SLOT_TRACK_LABELS,
  clampSpent,
  maxSlotsAt,
  spellSlotBars,
  spellSlotsFor,
} from './slots'

/**
 * THE SRD'S OWN TABLES, TRANSCRIBED A SECOND TIME.
 *
 * ⚠️ **This is deliberately a second transcription rather than a derivation from the first**,
 * and it is the whole reason the suite is worth having. `lib/slots.ts` contains no rule and no
 * formula — the SRD prints tables, so the module *is* a table — which means the only failure
 * mode it has is a wrong number, and the only thing that catches a wrong number is somebody
 * writing it out again from the source. A test that read `CASTER_PROGRESSION` and asserted its
 * shape would pass on a Wizard with two 3rd-level slots at level 3.
 *
 * Written as `level → [1st, 2nd, 3rd]` with trailing zeroes trimmed by the reader, because
 * that is how SRD 5.2.1 prints it and a reader checking this against the book should not have
 * to translate on the way.
 */
const SRD_FULL_CASTER: Record<number, readonly number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
}

/** Paladin and Ranger. Level 1 is empty because both gain Spellcasting at level 2. */
const SRD_HALF_CASTER: Record<number, readonly number[]> = {
  1: [],
  2: [2],
  3: [3],
  4: [3],
  5: [4, 2],
}

/**
 * The Warlock, as `level → [slots, slotLevel]` — which is how the SRD prints it, in two
 * columns, and is exactly the thing the graded table cannot express.
 */
const SRD_PACT_MAGIC: Record<number, readonly [number, number]> = {
  1: [1, 1],
  2: [2, 1],
  3: [2, 2],
  4: [2, 2],
  5: [2, 3],
}

const FULL_CASTERS = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'] as const
const HALF_CASTERS = ['paladin', 'ranger'] as const
const NON_CASTERS = ['barbarian', 'fighter', 'monk', 'rogue'] as const

/** `[{ level: 1, max: 4 }, …]` back to the SRD's row, so the two spellings can be compared. */
function asRow(classKey: string, level: number): readonly number[] {
  const slots = spellSlotsFor(classKey, level)
  if (slots === null) return []
  const row: number[] = []
  for (let spellLevel = MIN_SLOT_LEVEL; spellLevel <= MAX_SLOT_LEVEL; spellLevel += 1) {
    row.push(maxSlotsAt(slots, spellLevel))
  }
  while (row.length > 0 && row[row.length - 1] === 0) row.pop()
  return row
}

const LEVELS = [1, 2, 3, 4, 5] as const

describe('the SRD 5.2.1 slot tables, at every class and every level 1–5', () => {
  test.each(FULL_CASTERS)('%s is a full caster', (classKey) => {
    for (const level of LEVELS) {
      expect(asRow(classKey, level), `level ${level}`).toEqual(SRD_FULL_CASTER[level])
      expect(spellSlotsFor(classKey, level)?.track).toBe('spellcasting')
    }
  })

  test.each(HALF_CASTERS)('%s is a half caster and casts nothing at level 1', (classKey) => {
    for (const level of LEVELS) {
      expect(asRow(classKey, level), `level ${level}`).toEqual(SRD_HALF_CASTER[level])
    }
    // ⚠️ **The answer at level 1 is `null` and not an empty track**, which is the collapse the
    // module argues for: the Spells sub-tab is *absent* for a character with no slots rather
    // than empty, so a level 1 Paladin and a Fighter get the same answer and a renderer needs
    // one test. It becoming non-null at level 2 is the SRD's own event.
    expect(spellSlotsFor(classKey, 1)).toBeNull()
    expect(spellSlotsFor(classKey, 2)?.track).toBe('spellcasting')
  })

  test.each(NON_CASTERS)('%s has no slots at any level', (classKey) => {
    for (const level of LEVELS) {
      expect(spellSlotsFor(classKey, level), `level ${level}`).toBeNull()
    }
  })

  /**
   * ⚠️ **The Warlock is not "a caster with a small table", and this test asserts the two
   * things that make it different rather than only the counts.** The bank is tiny and climbs
   * in *slot level* — a level 5 Warlock has two slots and they are 3rd-level ones, where a
   * level 5 Wizard has nine across three levels — and it is a single row at all times, so
   * every other level is empty.
   */
  test('the warlock has one row that climbs in level rather than in count', () => {
    for (const level of LEVELS) {
      const [count, slotLevel] = SRD_PACT_MAGIC[level]
      const slots = spellSlotsFor('warlock', level)
      expect(slots, `level ${level}`).not.toBeNull()
      expect(slots!.track).toBe('pact')
      expect(slots!.levels, `level ${level}`).toEqual([{ level: slotLevel, max: count }])
      // And nothing at either of the other two spell levels — the half of "a single row" that
      // a `toEqual` on a one-element array asserts only by implication.
      for (let other = MIN_SLOT_LEVEL; other <= MAX_SLOT_LEVEL; other += 1) {
        if (other !== slotLevel) expect(maxSlotsAt(slots, other), `level ${level}`).toBe(0)
      }
    }
  })

  /**
   * The anti-vacuity check: every one of the twelve is accounted for above, so a thirteenth
   * class arrives here as a failing count as well as a failing compile in `lib/slots.ts`.
   */
  test('all twelve classes are covered by the three groups above', () => {
    const covered = [...FULL_CASTERS, ...HALF_CASTERS, ...NON_CASTERS, 'warlock'].sort()
    expect(covered).toEqual([...CLASS_KEYS].sort())
    expect(covered).toHaveLength(CLASS_KEYS.length)
  })

  /** A level 5 full caster is nine slots across three levels. The headline number, stated. */
  test('a level 5 wizard has 4/3/2 and a level 5 paladin has 4/2', () => {
    expect(asRow('wizard', 5)).toEqual([4, 3, 2])
    expect(asRow('paladin', 5)).toEqual([4, 2])
  })
})

describe('which rest brings each track back', () => {
  /**
   * ⚠️ **THE ACCEPTANCE CRITERION, AS ONE POSITIVE AND ONE NEGATIVE.**
   *
   * A Warlock takes a short rest and gets both Pact Magic slots back while the Wizard beside
   * them gets none. The negative is the load-bearing half: **a short rest that restored a
   * Wizard's slots would be the application inventing a rule**, and it is the one failure this
   * feature can have that nobody at the table would report as a bug, because it looks like
   * generosity rather than like a fault.
   *
   * Asked through `restores` rather than by reading `SPELL_SLOT_RECHARGE` and comparing
   * strings, because `restores` is what `shortRest` actually calls — a test that compared the
   * table to itself would pass against a `shortRest` that had stopped asking.
   */
  test('a warlock’s pact slots come back on a short rest and a wizard’s do not', () => {
    const warlock = spellSlotsFor('warlock', 5)!
    const wizard = spellSlotsFor('wizard', 5)!

    expect(restores(SPELL_SLOT_RECHARGE[warlock.track], 'short')).toBe(true)
    expect(restores(SPELL_SLOT_RECHARGE[wizard.track], 'short')).toBe(false)
  })

  test('a long rest returns both, because it is the longest rest there is', () => {
    for (const track of SPELL_SLOT_TRACKS) {
      expect(restores(SPELL_SLOT_RECHARGE[track], 'long'), track).toBe(true)
    }
  })

  test('every half caster and every full caster is on the long-rest track', () => {
    // Driven by the class list rather than by the two tracks, so a class moved onto the wrong
    // progression fails here as well as in the number tables above.
    for (const classKey of [...FULL_CASTERS, ...HALF_CASTERS]) {
      const slots = spellSlotsFor(classKey, MAX_LIBRARY_LEVEL)
      expect(SPELL_SLOT_RECHARGE[slots!.track], classKey).toBe('long')
    }
    expect(SPELL_SLOT_RECHARGE[spellSlotsFor('warlock', MAX_LIBRARY_LEVEL)!.track]).toBe('short')
  })
})

describe('the track vocabulary is spelled once and labelled once', () => {
  /**
   * The reverse of what the two `Record`s give for free. `tsc` refuses a missing key and
   * accepts a leftover one, so an entry surviving a member's removal is invisible to it — the
   * direction `lib/rest.ts` and `lib/layers.ts` both keep a test for.
   */
  test('no label and no recharge names a track that does not exist', () => {
    expect(Object.keys(SPELL_SLOT_TRACK_LABELS).sort()).toEqual([...SPELL_SLOT_TRACKS].sort())
    expect(Object.keys(SPELL_SLOT_RECHARGE).sort()).toEqual([...SPELL_SLOT_TRACKS].sort())
  })

  test('every track has a distinct label and a distinct explanation, both non-empty', () => {
    const entries = SPELL_SLOT_TRACKS.map((track) => SPELL_SLOT_TRACK_LABELS[track])
    for (const { label, explanation } of entries) {
      expect(label.trim()).not.toBe('')
      expect(explanation.trim()).not.toBe('')
    }
    expect(new Set(entries.map((entry) => entry.label)).size).toBe(SPELL_SLOT_TRACKS.length)
    expect(new Set(entries.map((entry) => entry.explanation)).size).toBe(SPELL_SLOT_TRACKS.length)
  })

  test('the pact explanation says out loud that a short rest returns them', () => {
    // ⚠️ `REST_LABELS.short` promises that *anything that comes back on a short rest comes
    // back*; this is the other end of that sentence, and the two have to stay true together.
    // The trap `HitDiceControls` shipped is a label promising what the button does not do.
    expect(SPELL_SLOT_TRACK_LABELS.pact.explanation).toContain('short rest')
    expect(SPELL_SLOT_TRACK_LABELS.spellcasting.explanation).toContain('long rest')
  })
})

describe('a level outside the library’s range', () => {
  test('a level past the cap reads the level 5 row rather than throwing', () => {
    // `MAX_LIBRARY_LEVEL` already promises that beyond it a character stops gaining anything,
    // and the stored schema permits a level 20 preset (`MAX_LEVEL`). A throw here would be a
    // throw inside the query that paints a sheet.
    expect(asRow('wizard', MAX_LIBRARY_LEVEL + 1)).toEqual(SRD_FULL_CASTER[5])
    expect(asRow('wizard', 20)).toEqual(SRD_FULL_CASTER[5])
  })

  test('a level below the floor, a fractional one and a nonsense one all read as level 1', () => {
    for (const level of [MIN_LIBRARY_LEVEL - 1, 0, -7, Number.NaN, Number.POSITIVE_INFINITY]) {
      if (level === Number.POSITIVE_INFINITY) continue
      expect(asRow('wizard', level), String(level)).toEqual(SRD_FULL_CASTER[1])
    }
    // Rounded rather than floored, on `clampLevel`'s stance in lib/resolve.ts.
    expect(asRow('wizard', 2.4)).toEqual(SRD_FULL_CASTER[2])
    expect(asRow('wizard', 2.6)).toEqual(SRD_FULL_CASTER[3])
  })

  test('an infinite level reads as level 1 rather than crashing on an absent row', () => {
    // Non-finite is gated *before* the clamp, so an infinity does not survive `Math.min` into
    // an array index. `clampLevel` in lib/resolve.ts answers the same way for the same reason.
    expect(asRow('wizard', Number.POSITIVE_INFINITY)).toEqual(SRD_FULL_CASTER[1])
    expect(asRow('wizard', Number.NEGATIVE_INFINITY)).toEqual(SRD_FULL_CASTER[1])
  })
})

describe('a retired or unknown class key', () => {
  /**
   * ⚠️ **Tolerated on read, exactly as `findClass`, `subclassOf` and `librarySheet` tolerate
   * one.** A class key is *stored* on a preset sheet, so a retired one outlives `CLASS_KEYS`
   * in the database; this runs inside the query that paints a whole party, and answering null
   * is what keeps such a character openable.
   */
  test('answers null rather than throwing', () => {
    for (const classKey of ['artificer', '', 'WIZARD', 'wizard ', 'toString', '__proto__']) {
      expect(spellSlotsFor(classKey, 5), classKey).toBeNull()
    }
  })
})

describe('maxSlotsAt', () => {
  test('is zero for a non-caster, for a level they have none at, and for nonsense', () => {
    expect(maxSlotsAt(null, 1)).toBe(0)
    const wizard = spellSlotsFor('wizard', 3)
    expect(maxSlotsAt(wizard, 3)).toBe(0)
    expect(maxSlotsAt(wizard, 9)).toBe(0)
    expect(maxSlotsAt(wizard, 0)).toBe(0)
    // The positive control: without it every assertion above passes on a function that
    // returns zero unconditionally.
    expect(maxSlotsAt(wizard, 1)).toBe(4)
    expect(maxSlotsAt(wizard, 2)).toBe(2)
  })
})

describe('spellSlotBars — the derivation and the stored state, crossed', () => {
  test('draws the pips for a level 5 wizard with two spent', () => {
    const bars = spellSlotBars(spellSlotsFor('wizard', 5), [
      { level: 1, spent: 2 },
      { level: 3, spent: 1 },
    ])
    expect(bars).toEqual([
      { level: 1, max: 4, spent: 2, remaining: 2 },
      { level: 2, max: 3, spent: 0, remaining: 3 },
      { level: 3, max: 2, spent: 1, remaining: 1 },
    ])
  })

  /**
   * ⚠️ **Driven by the derivation and never by the stored array**, which is what makes a
   * stale row harmless: a count against a level the character no longer has draws no bar,
   * because the loop is over `slots.levels`. This is the state a DM produces by dropping
   * somebody's level with slots already spent.
   */
  test('a spent count against a level the character has lost contributes no bar', () => {
    const bars = spellSlotBars(spellSlotsFor('wizard', 1), [
      { level: 1, spent: 1 },
      { level: 3, spent: 2 },
    ])
    expect(bars).toEqual([{ level: 1, max: 2, spent: 1, remaining: 1 }])
  })

  test('a count above the maximum is clamped rather than drawn as negative remaining', () => {
    const bars = spellSlotBars(spellSlotsFor('wizard', 1), [{ level: 1, spent: 99 }])
    expect(bars).toEqual([{ level: 1, max: 2, spent: 2, remaining: 0 }])
  })

  test('a non-caster draws nothing at all, so a renderer needs one test rather than two', () => {
    expect(spellSlotBars(null, [{ level: 1, spent: 1 }])).toEqual([])
    expect(spellSlotBars(spellSlotsFor('fighter', 5), [])).toEqual([])
  })

  test('a warlock draws one bar, and it is the one that climbed', () => {
    expect(spellSlotBars(spellSlotsFor('warlock', 5), [{ level: 3, spent: 1 }])).toEqual([
      { level: 3, max: 2, spent: 1, remaining: 1 },
    ])
    // The 1st-level count the character had at level 1 is stale by level 5 and draws nothing,
    // which is the climbing track's own version of the stale-row case above.
    expect(spellSlotBars(spellSlotsFor('warlock', 5), [{ level: 1, spent: 1 }])).toEqual([
      { level: 3, max: 2, spent: 0, remaining: 2 },
    ])
  })
})

describe('clampSpent — the one clamp the accessor, the writer and the pips all share', () => {
  test('rounds, floors at zero and caps at the maximum', () => {
    expect(clampSpent(2.4, 4)).toBe(2)
    expect(clampSpent(2.6, 4)).toBe(3)
    expect(clampSpent(-1, 4)).toBe(0)
    expect(clampSpent(9, 4)).toBe(4)
  })

  test('a non-finite float64 reads as nought rather than propagating a NaN into a payload', () => {
    // The hazard `npm run test:smoke` exists for: convex-test does not apply Convex's own
    // value validation, so a `NaN` reaching a stored row passes the suite and is refused by a
    // real deployment.
    //
    // ⚠️ **All three read as nought, including the positive infinity**, and that is the
    // `Number.isFinite` gate rather than a clamp: `setUsesSpent` takes the identical stance one
    // module over. Capping an infinity at the maximum would be *interpreting* a value nobody
    // could have meant, on a counter a person can set correctly in one click.
    expect(clampSpent(Number.NaN, 4)).toBe(0)
    expect(clampSpent(Number.POSITIVE_INFINITY, 4)).toBe(0)
    expect(clampSpent(Number.NEGATIVE_INFINITY, 4)).toBe(0)
  })

  test('a negative maximum cannot produce a negative count', () => {
    expect(clampSpent(3, -1)).toBe(0)
  })
})

describe('the level bounds', () => {
  test('run 1 to 3, because the character cap is 5', () => {
    // ⚠️ Pinned as literals rather than derived, because raising the character level cap is
    // what would move them and the tables above are what actually change. A constant that
    // moved silently would leave a level 5 full caster's 3rd-level slots unreachable.
    expect(MIN_SLOT_LEVEL).toBe(1)
    expect(MAX_SLOT_LEVEL).toBe(3)
    expect(MAX_LIBRARY_LEVEL).toBe(5)
  })

  test('no class at any level in range has a slot outside those bounds', () => {
    for (const classKey of CLASS_KEYS as readonly ClassKey[]) {
      for (const level of LEVELS) {
        for (const row of spellSlotsFor(classKey, level)?.levels ?? []) {
          expect(row.level, `${classKey} ${level}`).toBeGreaterThanOrEqual(MIN_SLOT_LEVEL)
          expect(row.level, `${classKey} ${level}`).toBeLessThanOrEqual(MAX_SLOT_LEVEL)
          // Never a stored zero: absence is the one spelling of none.
          expect(row.max, `${classKey} ${level}`).toBeGreaterThan(0)
        }
      }
    }
  })

  test('every returned track lists its levels ascending, so a renderer need not sort', () => {
    for (const classKey of CLASS_KEYS as readonly ClassKey[]) {
      for (const level of LEVELS) {
        const levels = spellSlotsFor(classKey, level)?.levels ?? []
        const ascending = [...levels].sort((left, right) => left.level - right.level)
        expect(levels, `${classKey} ${level}`).toEqual(ascending)
      }
    }
  })
})
