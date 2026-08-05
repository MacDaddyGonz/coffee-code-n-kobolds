import { describe, expect, test } from 'vitest'

import {
  MARKER_ROW_SCREEN_HEIGHT,
  PIP_CANNOT_ACT,
  PIP_DEAD,
  PIP_DIAMETER,
  PIP_GAP,
  PIP_IMPAIRED,
  PIP_MOVEMENT,
  PIP_NAME_GAP,
  PIP_ROW_GAP,
  PIP_STATE,
  TOKEN_MARKER_PIPS,
  markerRow,
  pipCapacity,
} from '@/lib/markers'
// The real constant rather than a copy of the number, so the coupling assertion
// below actually breaks when somebody lowers the threshold. This drags
// `TokenHealthBar.tsx` — and therefore react-konva and konva — into a
// `environment: 'node'` test file, which is why it is worth saying that it resolves
// fine: nothing in that module is *executed* here, and both packages import cleanly
// in Node. If a future konva release makes the import itself touch a DOM API, the
// fallback is to assert against a literal 30 with a comment naming
// `src/components/board/TokenHealthBar.tsx` as the file it must match.
import { COIN_DETAIL_MIN_DIAMETER } from '@/components/board/TokenHealthBar'
import { TOKEN_MARKERS } from '@convex/lib/markers'
import type { TokenMarker } from '@convex/lib/markers'

const FILLS = [PIP_CANNOT_ACT, PIP_IMPAIRED, PIP_MOVEMENT, PIP_STATE, PIP_DEAD]

/** Four conditions, chosen so their vocabulary order is obvious by eye. */
const FOUR: TokenMarker[] = ['blinded', 'charmed', 'dead', 'poisoned']

describe('TOKEN_MARKER_PIPS', () => {
  test('covers the vocabulary exactly, in both directions', () => {
    for (const marker of TOKEN_MARKERS) {
      expect(TOKEN_MARKER_PIPS[marker], marker).toBeDefined()
    }
    // And nothing extra: a pip for a marker that no longer exists is a row in the
    // DM's list that has quietly lost its colour.
    expect(Object.keys(TOKEN_MARKER_PIPS).sort()).toEqual([...TOKEN_MARKERS].sort())
  })

  // The one error in that table that looks entirely fine in a diff. Two conditions
  // sharing a letter *within a family* are indistinguishable on the board, and the
  // colour cannot rescue them.
  test('every glyph is a single distinct character', () => {
    const glyphs = TOKEN_MARKERS.map((marker) => TOKEN_MARKER_PIPS[marker].glyph)
    for (const glyph of glyphs) {
      expect([...glyph].length, glyph).toBe(1)
    }
    expect(new Set(glyphs).size).toBe(TOKEN_MARKERS.length)
  })

  test('every fill is one of the five family colours', () => {
    for (const marker of TOKEN_MARKERS) {
      expect(FILLS, marker).toContain(TOKEN_MARKER_PIPS[marker].fill)
    }
    // All five are actually used — an unused family is a colour nobody can decode.
    const used = new Set(TOKEN_MARKERS.map((marker) => TOKEN_MARKER_PIPS[marker].fill))
    expect(used.size).toBe(FILLS.length)
  })
})

describe('pipCapacity', () => {
  // Each of these is exactly the width `n` pips need, so the table sits on every
  // boundary rather than near it: `n * PIP_DIAMETER + (n - 1) * PIP_GAP`.
  test('the capacity table', () => {
    expect(pipCapacity(30)).toBe(2)
    expect(pipCapacity(46)).toBe(3)
    expect(pipCapacity(62)).toBe(4)
    expect(pipCapacity(94)).toBe(6)
    expect(pipCapacity(174)).toBe(11)
    expect(pipCapacity(270)).toBe(TOKEN_MARKERS.length)
    // One pixel under each is one fewer, which is what makes the row above a boundary
    // table rather than six numbers that happen to work.
    expect(pipCapacity(29)).toBe(1)
    expect(pipCapacity(61)).toBe(3)
  })

  // ⚠️ The coupling between two constants in two files. `TokenCoin` draws a pip row
  // only behind `showDetail`, so the smallest coin this is ever asked about is
  // `COIN_DETAIL_MIN_DIAMETER` across — and two pips need 30. Lower that threshold
  // and the smallest coins on the board become a bare `+4` counter with no pip beside
  // it, which is a worse answer than the name-only coin it replaced.
  //
  // ⚠️ **The two sides are now *equal* rather than 26 against 22.** The pips grew to
  // match the armour-class circle and the threshold rose to the smallest number that
  // still holds two — so this assertion has no slack left in it, deliberately: one more
  // pixel of pip fails here in the same commit that adds it.
  test('the detail threshold leaves room for at least two pips', () => {
    expect(COIN_DETAIL_MIN_DIAMETER).toBeGreaterThanOrEqual(2 * PIP_DIAMETER + PIP_GAP)
    expect(pipCapacity(COIN_DETAIL_MIN_DIAMETER)).toBeGreaterThanOrEqual(2)
  })

  test('is monotonic and never negative', () => {
    let previous = 0
    for (let width = 0; width <= 400; width += 1) {
      const capacity = pipCapacity(width)
      expect(capacity, `width ${width}`).toBeGreaterThanOrEqual(0)
      expect(capacity, `width ${width}`).toBeGreaterThanOrEqual(previous)
      previous = capacity
    }
    expect(pipCapacity(0)).toBe(0)
    expect(pipCapacity(Number.MAX_SAFE_INTEGER)).toBeGreaterThan(TOKEN_MARKERS.length)
  })

  // A zero viewport during the first layout pass makes `diameter * scale` NaN, the
  // same way it makes a camera scale NaN. Nothing drawn for one frame beats
  // `Math.floor(Infinity)` pips.
  test('answers nothing for a degenerate width', () => {
    expect(pipCapacity(Number.NaN)).toBe(0)
    expect(pipCapacity(Number.POSITIVE_INFINITY)).toBe(0)
    expect(pipCapacity(-50)).toBe(0)
  })
})

describe('MARKER_ROW_SCREEN_HEIGHT', () => {
  test('is the three vertical pieces of the row', () => {
    expect(MARKER_ROW_SCREEN_HEIGHT).toBe(PIP_ROW_GAP + PIP_DIAMETER + PIP_NAME_GAP)
    expect(MARKER_ROW_SCREEN_HEIGHT).toBe(19)
  })
})

describe('markerRow', () => {
  test('draws all of them when they fit', () => {
    expect(markerRow(FOUR, 200)).toEqual({ shown: FOUR, overflow: 0 })
    expect(markerRow(['poisoned'], 30)).toEqual({ shown: ['poisoned'], overflow: 0 })
    // Exactly full is not a collapse: four in four slots is four pips.
    expect(markerRow(FOUR, 62)).toEqual({ shown: FOUR, overflow: 0 })
  })

  test('returns them in vocabulary order whatever order they were stored in', () => {
    expect(markerRow(['stunned', 'blinded', 'poisoned'], 200).shown).toEqual([
      'blinded',
      'poisoned',
      'stunned',
    ])
    expect(markerRow([...FOUR].reverse(), 200).shown).toEqual(FOUR)
  })

  test('collapses into a counter that occupies the last slot', () => {
    // Capacity 3, four present: two pips and `+2`, because the counter takes a slot.
    expect(markerRow(FOUR, 46)).toEqual({ shown: ['blinded', 'charmed'], overflow: 2 })
    // ⚠️ Capacity 2 at the detail threshold: one pip and `+3`. The brief for this
    // module predicted `{ shown: [], overflow: 4 }` here, which is the answer for a
    // capacity of one — with two slots the stated arithmetic spends the first on a
    // pip. Reported rather than quietly reconciled; the capacity table is explicit
    // that 30 holds two.
    expect(markerRow(FOUR, 30)).toEqual({ shown: ['blinded'], overflow: 3 })
  })

  test('gives the single slot to the counter rather than to one arbitrary pip', () => {
    // Below anything `TokenCoin` will ask for, but the function does not rely on its
    // caller for that. One condition in one slot is still just the pip.
    expect(pipCapacity(14)).toBe(1)
    expect(markerRow(FOUR, 14)).toEqual({ shown: [], overflow: 4 })
    expect(markerRow(['poisoned'], 14)).toEqual({ shown: ['poisoned'], overflow: 0 })
  })

  test('nothing stored is nothing drawn and nothing counted', () => {
    expect(markerRow([], 200)).toEqual({ shown: [], overflow: 0 })
    expect(markerRow([], 0)).toEqual({ shown: [], overflow: 0 })
    // No room at all is not an overflow either: a `+4` nobody can see is not better
    // than a clean coin.
    expect(markerRow(FOUR, 0)).toEqual({ shown: [], overflow: 0 })
  })

  // ⚠️ The older-bundle-newer-deployment case, and the reason `stored` is
  // `readonly string[]`. A newer deployment writes a marker this bundle's union has
  // never heard of, a `returns:` validator approves it, and it arrives here. Mapping
  // the stored array would take `'exhausted'` to a `TOKEN_MARKER_PIPS` lookup inside
  // JSX and crash every coin on the board; intersecting with the vocabulary drops it.
  // A `TokenMarker[]` parameter would make this test unwriteable, which is the point
  // — a guard with no expressible failing case is a guard that gets deleted.
  test('drops a value it has never heard of', () => {
    expect(markerRow(['poisoned', 'exhausted'], 200)).toEqual({
      shown: ['poisoned'],
      overflow: 0,
    })
    expect(markerRow(['', 'POISONED', 'prone '], 200)).toEqual({ shown: [], overflow: 0 })
    // And an unknown value never inflates the counter either: it was never present.
    expect(markerRow([...FOUR, 'exhausted', 'dazzled'], 46)).toEqual({
      shown: ['blinded', 'charmed'],
      overflow: 2,
    })
  })
})
