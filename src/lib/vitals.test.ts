import { describe, expect, it } from 'vitest'

import {
  COIN_STATS,
  COIN_STAT_ABBREVIATIONS,
  COIN_STAT_COLOUR,
  COIN_STAT_LABELS,
  DEATH_SAVE_COLOUR,
  DEATH_SAVE_COLUMNS,
  DEATH_SAVE_LABELS,
  coinStatOf,
  deathSaveTicks,
  deathSavesOf,
  heroicInspirationOf,
  nextDeathSaveCount,
  signed,
} from '@/lib/vitals'
import type { PublicVitals } from '@convex/lib/characters'
import { MAX_DEATH_SAVES } from '@convex/lib/sheet'

/**
 * A row of each variant, spelled out in full rather than built by a helper.
 *
 * The whole point of these tests is *which member carries what*, so a factory that filled in
 * the fields would be the thing under test writing its own fixture — and the one failure
 * worth catching here is a field appearing on the member that has no business holding it.
 */
function exact(overrides: Partial<Extract<PublicVitals, { kind: 'exact' }>> = {}): PublicVitals {
  return {
    kind: 'exact',
    characterId: 'c1' as PublicVitals['characterId'],
    current: 12,
    max: 30,
    hitDiceRemaining: 3,
    hitDiceCount: 3,
    spentPerRest: [],
    temporaryHp: 0,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    heroicInspiration: false,
    spentUses: [],
    // Landed on this member after this fixture was written, in a branch running
    // alongside it. Required rather than optional, so the compiler is what noticed.
    spentSlots: [],
    armourClass: 16,
    passivePerception: 13,
    ...overrides,
  }
}

function band(): PublicVitals {
  return {
    kind: 'band',
    characterId: 'c2' as PublicVitals['characterId'],
    band: 'bloodied',
    armourClass: 18,
    passivePerception: null,
  }
}

/**
 * THE SCOPE TEST, and it is the reason this file exists rather than a convenience.
 *
 * A band row is what a player is sent about a creature they may see and may not read, and
 * `publicVitalsValidator` makes that mechanical by having nowhere on that member to put a
 * hit point. These assertions are the client half: every accessor that reads the 2024 state
 * answers `null` for a band, so a renderer holding one has *nothing to draw* rather than
 * something to hide. A change that made any of them answer `0` or `false` would turn an
 * absence into a claim, and the card would start asserting facts about a goblin nobody sent
 * it (CLAUDE.md invariant 1).
 */
describe('a band row carries none of the 2024 state', () => {
  it('has no death-save tally', () => {
    expect(deathSavesOf(band())).toBeNull()
    // The positive control, so the assertion above cannot pass because the function is broken.
    expect(deathSavesOf(exact())).toEqual({ successes: 0, failures: 0 })
  })

  it('has no heroic inspiration flag, and null is not false', () => {
    expect(heroicInspirationOf(band())).toBeNull()
    expect(heroicInspirationOf(exact())).toBe(false)
    expect(heroicInspirationOf(exact({ heroicInspiration: true }))).toBe(true)
  })
})

/**
 * The other half of ADR 0014: the two published stats are on **both** members, so a viewer
 * holding a band gets the goblin's armour class exactly as the DM does. A branch on `kind`
 * appearing in `coinStatOf` would be the "exact-only" narrowing that ADR rejected by name —
 * it shows a granted pet's armour class and hides the goblin's standing beside it.
 */
describe('the published pair rides on both members', () => {
  it('answers off a band row', () => {
    expect(coinStatOf(band(), 'armourClass')).toBe(18)
  })

  it('answers off an exact row', () => {
    expect(coinStatOf(exact(), 'armourClass')).toBe(16)
    expect(coinStatOf(exact(), 'passivePerception')).toBe(13)
  })

  it('keeps null reachable rather than defaulting it', () => {
    // A hand-built creature whose DM never recorded a passive perception has none, and
    // printing 10 would invent a statistic the table would act on.
    expect(coinStatOf(band(), 'passivePerception')).toBeNull()
    expect(coinStatOf(exact({ passivePerception: null }), 'passivePerception')).toBeNull()
  })

  it('has exactly two members, because a third is an ADR', () => {
    // ADR 0014: "a third published stat is a second decision needing its own ADR". This is
    // the assertion that makes adding one a conversation rather than a diff.
    expect(COIN_STATS).toEqual(['armourClass', 'passivePerception'])
  })

  it('has a label, an abbreviation and a colour for every member', () => {
    for (const stat of COIN_STATS) {
      expect(COIN_STAT_LABELS[stat], stat).toBeTruthy()
      expect(COIN_STAT_ABBREVIATIONS[stat], stat).toBeTruthy()
      expect(COIN_STAT_COLOUR[stat], stat).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('the death-save vocabulary', () => {
  it('has a label and a colour for every column', () => {
    for (const column of DEATH_SAVE_COLUMNS) {
      expect(DEATH_SAVE_LABELS[column], column).toBeTruthy()
      expect(DEATH_SAVE_COLOUR[column], column).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('is the order the columns are drawn in', () => {
    // The array *is* the order, exactly as `TOKEN_MARKERS` is the pip order, so this pins
    // the direction the compiler cannot see: successes above failures on every screen.
    expect(DEATH_SAVE_COLUMNS).toEqual(['successes', 'failures'])
  })
})

describe('deathSaveTicks', () => {
  it('draws as many boxes as the server will store', () => {
    // Not a literal three: the clamp the mutation applies and the number of boxes on screen
    // are one fact, and a screen with fewer boxes is a tally a DM cannot finish entering.
    expect(deathSaveTicks(0)).toHaveLength(MAX_DEATH_SAVES)
    expect(deathSaveTicks(0).every((ticked) => !ticked)).toBe(true)
  })

  it('fills from the left', () => {
    expect(deathSaveTicks(2)).toEqual([true, true, false])
  })

  it('survives a count an older bundle has no room for', () => {
    // The `normaliseMarkers` case in a second disguise: a newer deployment raising the cap
    // costs one undrawn box here rather than an array of that length inside JSX.
    expect(deathSaveTicks(99)).toEqual([true, true, true])
    expect(deathSaveTicks(-4)).toEqual([false, false, false])
    expect(deathSaveTicks(1.6)).toEqual([true, true, false])
  })
})

describe('nextDeathSaveCount', () => {
  it('sets the column to the box that was pressed', () => {
    expect(nextDeathSaveCount(0, 0)).toBe(1)
    expect(nextDeathSaveCount(0, 2)).toBe(3)
    expect(nextDeathSaveCount(1, 2)).toBe(3)
  })

  it('unticks the last ticked box, which is how a miscount is corrected', () => {
    // Without this a tally can only go up, and the gesture somebody reaches for to fix a
    // wrong third failure is pressing the third failure.
    expect(nextDeathSaveCount(3, 2)).toBe(2)
    expect(nextDeathSaveCount(1, 0)).toBe(0)
  })
})

describe('signed', () => {
  it('always shows a sign, including on nought', () => {
    expect(signed(3)).toBe('+3')
    expect(signed(0)).toBe('+0')
  })

  it('uses a true minus sign rather than a hyphen', () => {
    // `rollWorking` in lib/roll.ts makes the same choice, and the two appear a centimetre
    // apart when a feed row and a hover card are both on screen.
    expect(signed(-2)).toBe('−2')
    expect(signed(-2)).not.toBe('-2')
  })
})
