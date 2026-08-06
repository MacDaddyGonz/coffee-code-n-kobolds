import { describe, expect, test } from 'vitest'

import { OUT_OF_SQUARE_THRESHOLD, gridFromTrace } from './gridTrace'
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '@convex/lib/grid'
import type { Rect } from '@convex/lib/grid'

/**
 * Every number in the first two blocks is exactly representable in binary floating point —
 * 140, 420, 37, 177 — so those assertions are exact equality rather than `toBeCloseTo`,
 * exactly as `gridBox.test.ts` and `convex/lib/grid.test.ts` are and for the same reason.
 * `toBeCloseTo` would hide the failure that matters here: a grid recovered a sixteenth of a
 * pixel out is a grid whose lines have visibly left the printed ones by the far edge of a
 * map sixteen squares wide.
 *
 * Where a case is *about* an inexact number — a map printed out of square is inexact by
 * definition — the sizes are still chosen exact (139.5, 100.5) and only the ratio is
 * compared loosely, so the looseness is confined to the one value that has to be a ratio.
 */

/** The sample map's grid: `Admittance [Gridded 16x12]` is 2240 px over 16 squares. */
const SIZE = 140

/**
 * Three printed squares, traced starting from the second printed line of a grid whose
 * origin sits 37 px in. Lines fall at 37, 177, 317, 457 — so a box from 177 spanning 420
 * covers exactly three of them and its far edge lands on the fourth.
 */
const TRACED: Rect = { x: 177, y: 177, width: 420, height: 420 }

describe('gridFromTrace — the size', () => {
  test('recovers the printed square exactly from three of them', () => {
    const result = gridFromTrace(TRACED, 3, 3)
    expect(result).not.toBeNull()
    expect(result?.sizeAcross).toBe(SIZE)
    expect(result?.sizeDown).toBe(SIZE)
    expect(result?.grid.gridSize).toBe(SIZE)
    expect(result?.outOfSquare).toBe(0)
  })

  test('measures each axis against its own count', () => {
    // A block four squares wide and three tall, traced in one box. The counts are what tell
    // the two axes apart; nothing about the box itself says which is which.
    const result = gridFromTrace({ x: 0, y: 0, width: 560, height: 420 }, 4, 3)
    expect(result?.sizeAcross).toBe(SIZE)
    expect(result?.sizeDown).toBe(SIZE)
    expect(result?.grid.gridSize).toBe(SIZE)
  })
})

describe('gridFromTrace — the offset', () => {
  test('recovers the offset exactly, as a modulus of the traced edge', () => {
    const result = gridFromTrace(TRACED, 3, 3)
    expect(result?.grid.gridOffsetX).toBe(37)
    expect(result?.grid.gridOffsetY).toBe(37)
  })

  /**
   * The case the double modulus exists for. `gridBox.ts` states that a calibration box off
   * the top-left of the image is legal rather than an error, and JavaScript's `%` keeps the
   * sign of the dividend — so a single modulus would hand `updateGrid` a *negative* offset
   * here. That is not wrong arithmetically, since `gridLines` walks back to the largest
   * multiple at or before zero either way, but it is a number the DM reads in the Offset X
   * field and the panel's arrow keys nudge.
   */
  test('is positive and inside one square however far off the top-left the box was traced', () => {
    for (const x of [-243, -1000.5, -140, 0, 37, 1e6]) {
      const result = gridFromTrace({ x, y: x, width: 420, height: 420 }, 3, 3)
      const offset = result?.grid.gridOffsetX
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(SIZE)
    }
  })

  test('recovers 37 from a box traced two squares off the left of the image', () => {
    // 37 − 2 × 140 = −243, which `%` alone would report as −103.
    expect(gridFromTrace({ ...TRACED, x: -243 }, 3, 3)?.grid.gridOffsetX).toBe(37)
  })

  /**
   * The property the modulus is claimed to have, asserted rather than argued: the traced
   * edge lies on one of the lines the resulting grid draws. Everything else about the offset
   * — which member of the congruence class it is — is by definition unobservable.
   */
  test('puts a line through the edge the DM traced', () => {
    for (const box of [TRACED, { x: -243, y: 4.5, width: 420, height: 700 }]) {
      const result = gridFromTrace(box, 3, 5)
      const size = result?.grid.gridSize ?? Number.NaN
      expect(Number.isInteger((box.x - (result?.grid.gridOffsetX ?? 0)) / size)).toBe(true)
      expect(Number.isInteger((box.y - (result?.grid.gridOffsetY ?? 0)) / size)).toBe(true)
    }
  })
})

describe('gridFromTrace — a map printed out of square', () => {
  /**
   * ⭐ The measurement the whole module exists for. The map's squares are 140 across and
   * 139.5 down; ours cannot be, so the size is the mean of the two — and the disagreement
   * survives the averaging instead of being swallowed by it.
   */
  test('reports both measurements and the mean of them', () => {
    const result = gridFromTrace({ x: 0, y: 0, width: 420, height: 418.5 }, 3, 3)
    expect(result?.sizeAcross).toBe(140)
    expect(result?.sizeDown).toBe(139.5)
    expect(result?.grid.gridSize).toBe(139.75)
  })

  test('reports how far out of square as a fraction of the resulting cell', () => {
    const result = gridFromTrace({ x: 0, y: 0, width: 420, height: 418.5 }, 3, 3)
    // 0.5 px of disagreement over a 139.75 px cell — which the panel prints as "0.4% out".
    expect(result?.outOfSquare).toBeCloseTo(0.5 / 139.75, 12)
  })

  test('does not care which axis is the larger', () => {
    const wide = gridFromTrace({ x: 0, y: 0, width: 420, height: 418.5 }, 3, 3)
    const tall = gridFromTrace({ x: 0, y: 0, width: 418.5, height: 420 }, 3, 3)
    expect(tall?.grid.gridSize).toBe(wide?.grid.gridSize)
    expect(tall?.outOfSquare).toBe(wide?.outOfSquare)
  })

  /**
   * ⚠️ Out of square is measured and **never refused**. A map printed 3% out is still a map,
   * and the DM who traced it gets a grid and a sentence rather than a dead panel — see
   * `OUT_OF_SQUARE_THRESHOLD`, which `gridFromTrace` deliberately does not read.
   */
  test('still returns a grid for a map that is wildly out of square', () => {
    // Squares printed three times as wide as they are tall: 300 across, 100 down, and a
    // cell of 200 that matches neither. A hundred percent out, and still a grid.
    const result = gridFromTrace({ x: 0, y: 0, width: 600, height: 200 }, 2, 2)
    expect(result?.grid.gridSize).toBe(200)
    expect(result?.outOfSquare).toBe(1)
  })
})

describe('OUT_OF_SQUARE_THRESHOLD', () => {
  /** One square traced over a box of this width and height. The mean is exactly 100. */
  const oneSquare = (width: number, height: number) =>
    gridFromTrace({ x: 0, y: 0, width, height }, 1, 1)?.outOfSquare ?? Number.NaN

  test('a trace inside it reads as clean', () => {
    expect(oneSquare(100.4, 99.6)).toBeLessThan(OUT_OF_SQUARE_THRESHOLD)
  })

  test('a trace past it reads as out of square', () => {
    expect(oneSquare(100.6, 99.4)).toBeGreaterThan(OUT_OF_SQUARE_THRESHOLD)
  })

  /**
   * The boundary itself, exactly — 100.5 and 99.5 are both exact in binary, so this is a
   * genuine equality rather than a near miss. The panel compares with `>`, so a trace landing
   * precisely on the threshold reads as clean; that is arbitrary and is pinned here so that
   * a later change to either side of the comparison is a visible one.
   */
  test('exactly one percent is exactly the threshold', () => {
    expect(oneSquare(100.5, 99.5)).toBe(OUT_OF_SQUARE_THRESHOLD)
    expect(OUT_OF_SQUARE_THRESHOLD).toBe(0.01)
  })
})

describe('gridFromTrace — what it refuses', () => {
  /**
   * ⚠️ `null` rather than a clamped grid, which is `useGridWrite`'s sentence: the DM is
   * mid-keystroke, not wrong. Every one of these is a count field on its way to a real
   * number, and a grid written from any of them is a grid nobody asked for.
   */
  test('a count that is not a positive whole number', () => {
    for (const count of [0, -1, -3, 2.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(gridFromTrace(TRACED, count, 3)).toBeNull()
      expect(gridFromTrace(TRACED, 3, count)).toBeNull()
    }
  })

  /**
   * ⚠️ The guard that looks like tidiness and is not. A box with no width still has a
   * height, so the mean of the two measurements lands on 70 — comfortably inside
   * `isUsableGrid` — and without this the DM's stray click would write a grid derived from
   * one axis and a division by zero on the other.
   */
  test('a box with no area, including one with a healthy other axis', () => {
    expect(gridFromTrace({ x: 10, y: 10, width: 0, height: 420 }, 3, 3)).toBeNull()
    expect(gridFromTrace({ x: 10, y: 10, width: 420, height: 0 }, 3, 3)).toBeNull()
    expect(gridFromTrace({ x: 10, y: 10, width: 0, height: 0 }, 3, 3)).toBeNull()
  })

  test('a box handed over inside out', () => {
    expect(gridFromTrace({ x: 10, y: 10, width: -420, height: 420 }, 3, 3)).toBeNull()
    expect(gridFromTrace({ x: 10, y: 10, width: 420, height: -420 }, 3, 3)).toBeNull()
  })

  /**
   * The postcondition the whole set of refusals exists for, and it is `gridBox.finite`'s:
   * `scenes.updateGrid` refuses a grid `isUsableGrid` rejects, so a trace that could produce
   * one is a trace that silently stops saving. Konva never reports a non-finite corner —
   * this is here so that "it cannot happen" is a property of the function rather than of a
   * library.
   */
  test('a non-finite corner or extent', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(gridFromTrace({ ...TRACED, x: bad }, 3, 3)).toBeNull()
      expect(gridFromTrace({ ...TRACED, y: bad }, 3, 3)).toBeNull()
      expect(gridFromTrace({ ...TRACED, width: bad }, 3, 3)).toBeNull()
      expect(gridFromTrace({ ...TRACED, height: bad }, 3, 3)).toBeNull()
    }
  })

  test('a square smaller than the board can draw', () => {
    // Four squares traced over twelve pixels is three pixels a square.
    expect(gridFromTrace({ x: 0, y: 0, width: 12, height: 12 }, 4, 4)).toBeNull()
  })

  test('a square larger than the board can draw', () => {
    // Two squares traced over the whole of a very large map.
    expect(gridFromTrace({ x: 0, y: 0, width: 9000, height: 9000 }, 2, 2)).toBeNull()
  })

  /** Both bounds are inclusive, which is `isUsableGrid`'s answer and not a second one. */
  test('accepts a square sitting exactly on either bound', () => {
    const smallest = 4 * MIN_GRID_SIZE
    expect(
      gridFromTrace({ x: 0, y: 0, width: smallest, height: smallest }, 4, 4)?.grid.gridSize,
    ).toBe(MIN_GRID_SIZE)

    const largest = 2 * MAX_GRID_SIZE
    expect(
      gridFromTrace({ x: 0, y: 0, width: largest, height: largest }, 2, 2)?.grid.gridSize,
    ).toBe(MAX_GRID_SIZE)
  })
})
