import { describe, expect, it } from 'vitest'

import { healthFraction, healthLabel, temporaryHpOf, wardFraction } from '@/lib/health'
import type { PublicVitals } from '@convex/lib/characters'

function exact(current: number, max: number, temporaryHp = 0): PublicVitals {
  return {
    kind: 'exact',
    characterId: 'c1' as PublicVitals['characterId'],
    current,
    max,
    hitDiceRemaining: null,
    hitDiceCount: null,
    spentPerRest: [],
    temporaryHp,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    heroicInspiration: false,
    spentUses: [],
    // Landed on this member after this fixture was written, in a branch running
    // alongside it. Required rather than optional, so the compiler is what noticed.
    spentSlots: [],
    armourClass: 14,
    passivePerception: 11,
  }
}

const band: PublicVitals = {
  kind: 'band',
  characterId: 'c2' as PublicVitals['characterId'],
  band: 'bloodied',
  armourClass: 14,
  passivePerception: 11,
}

/**
 * THE SCOPE ASSERTION FOR THE WARD.
 *
 * A player looking at a goblin holds the `band` variant, which has no `temporaryHp` member —
 * so the strip above the bar is not drawn, and nothing on screen says one might exist. This
 * is the client half of the guarantee `publicVitalsValidator` makes mechanically: an
 * accessor that answered `0` here would turn *not sent* into *sent, and none*, which is a
 * claim about a creature nobody made (CLAUDE.md invariant 1).
 */
describe('the ward is absent from a band row', () => {
  it('has no temporary hit points to read', () => {
    expect(temporaryHpOf(band)).toBeNull()
    // The positive control, so the assertion above cannot pass on a broken accessor.
    expect(temporaryHpOf(exact(5, 10, 7))).toBe(7)
  })

  it('draws no strip', () => {
    expect(wardFraction(band)).toBe(0)
    expect(wardFraction(exact(5, 10, 5))).toBe(0.5)
  })
})

describe('wardFraction', () => {
  it('is nothing at all when there is no ward', () => {
    // Nought is drawn as *no element*, not as an empty slot: a permanent placeholder would
    // invite somebody to wonder what is missing from it.
    expect(wardFraction(exact(5, 10, 0))).toBe(0)
  })

  it('saturates rather than overflowing', () => {
    // Temporary hit points are not part of the maximum, so a ward larger than it is an
    // ordinary state. A strip two and a half coins wide would say something about the
    // neighbouring creature.
    expect(wardFraction(exact(3, 8, 30))).toBe(1)
  })

  it('answers a full strip for a maximum of nought rather than dividing by it', () => {
    expect(wardFraction(exact(0, 0, 4))).toBe(1)
  })

  it('is measured against the maximum and never against the current value', () => {
    // The comparison the ward makes is *how much is this worth compared to the creature*,
    // which is a fact about the creature and not about how hurt it is right now.
    expect(wardFraction(exact(1, 20, 5))).toBe(wardFraction(exact(19, 20, 5)))
  })
})

describe('the bar and the ward are two quantities', () => {
  it('leaves the health fraction untouched by a ward', () => {
    // The one wrong reading available at a glance is *that creature has been healed*, and it
    // would arrive here first: a ward folded into the fill would move the bar.
    expect(healthFraction(exact(5, 10, 9))).toBe(healthFraction(exact(5, 10, 0)))
  })

  it('leaves the label untouched by a ward', () => {
    expect(healthLabel(exact(5, 10, 9))).toBe('5/10')
  })
})
