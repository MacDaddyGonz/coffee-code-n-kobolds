import { describe, expect, test } from 'vitest'

import {
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  centreOfCell,
  cellOf,
  gridLines,
  gridSizeFor,
  isUsableGrid,
  isUsableTokenSize,
  moveByCells,
  snapToGrid,
  squaresDown,
} from './grid'
import type { Grid, Point } from './grid'

/**
 * Every number here is exactly representable in binary floating point — 140 and
 * 37.5 and −12.25 — so the assertions can be exact equality rather than
 * `toBeCloseTo`. That is deliberate: `toBeCloseTo` would hide precisely the drift
 * these functions exist to avoid, and a token half a pixel off a square centre is
 * a token that stops being on the same square as the one next to it.
 */
const OFFSET_GRID: Grid = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }
const ORIGIN_GRID: Grid = { gridSize: 140, gridOffsetX: 0, gridOffsetY: 0 }

/** Points that are deliberately nowhere near a square centre. */
const LOOSE_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 511.37, y: 91.11 },
  { x: 1234.5, y: 777.25 },
  { x: 2239.99, y: 1679.01 },
  { x: -63.4, y: -8.2 },
]

/** How many squares from the grid origin the point sits, in grid units. */
function inSquaresX(point: Point, grid: Grid): number {
  return (point.x - grid.gridOffsetX) / grid.gridSize
}

function inSquaresY(point: Point, grid: Grid): number {
  return (point.y - grid.gridOffsetY) / grid.gridSize
}

describe('gridSizeFor and squaresDown', () => {
  /**
   * The real sample maps, not invented numbers. `Admittance [Gridded 16x12]` is
   * 2240 × 1680 and the High Security maps are 2520 × 1680 across 18 squares.
   * Both land on 140.00 exactly and 12.00 down, which is the whole argument for
   * returning a float instead of rounding.
   */
  test('is exact for the gridded sample maps', () => {
    expect(gridSizeFor(2240, 16)).toBe(140)
    expect(gridSizeFor(2520, 18)).toBe(140)
    expect(squaresDown(1680, gridSizeFor(2240, 16))).toBe(12)
    expect(squaresDown(1680, gridSizeFor(2520, 18))).toBe(12)
  })

  test('does not round a calibration that is not whole', () => {
    // 4900 / 30 is 163.33…; rounding it to 163 would lose two whole squares by
    // the far edge of finalenemy_lvl01 (6300 px tall).
    const size = gridSizeFor(4900, 30)
    expect(size).not.toBe(Math.round(size))
    expect(size * 30).toBeCloseTo(4900, 9)
  })

  test('round-trips a width through gridSizeFor and back', () => {
    for (const [width, across] of [
      [2240, 16],
      [2520, 18],
      [1024, 32],
      [960, 12],
    ]) {
      expect(gridSizeFor(width, across) * across).toBe(width)
    }
  })
})

describe('snapToGrid', () => {
  /**
   * A 1×1 token sits on a square centre, which in grid units means exactly
   * col + 0.5 from the grid origin. Asserting the arithmetic rather than a
   * hard-coded pair of pixels is what makes this a statement about the grid
   * instead of a statement about one lucky point.
   */
  test('puts a 1×1 token on a square centre, with a non-zero offset', () => {
    for (const grid of [OFFSET_GRID, ORIGIN_GRID]) {
      for (const point of LOOSE_POINTS) {
        const snapped = snapToGrid(point, grid, 1)
        const cell = cellOf(snapped, grid, 1)
        expect(inSquaresX(snapped, grid)).toBe(cell.col + 0.5)
        expect(inSquaresY(snapped, grid)).toBe(cell.row + 0.5)
      }
    }
  })

  /**
   * A 2×2 token lands on a square *corner* so it covers four whole squares
   * rather than straddling eight halves — which in grid units means a whole
   * number from the grid origin, not a half.
   */
  test('puts a 2×2 token on a square corner covering four whole squares', () => {
    for (const grid of [OFFSET_GRID, ORIGIN_GRID]) {
      for (const point of LOOSE_POINTS) {
        const snapped = snapToGrid(point, grid, 2)
        const acrossX = inSquaresX(snapped, grid)
        const acrossY = inSquaresY(snapped, grid)
        expect(Number.isInteger(acrossX)).toBe(true)
        expect(Number.isInteger(acrossY)).toBe(true)
        // The four squares it covers are the ones from (corner − 1) to corner.
        const cell = cellOf(snapped, grid, 2)
        expect(acrossX).toBe(cell.col + 1)
        expect(acrossY).toBe(cell.row + 1)
      }
    }
  })

  test('every odd size lands on a centre and every even size on a corner', () => {
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const snapped = snapToGrid({ x: 733.21, y: 401.09 }, OFFSET_GRID, size)
      const acrossX = inSquaresX(snapped, OFFSET_GRID)
      const acrossY = inSquaresY(snapped, OFFSET_GRID)
      const wantsHalf = size % 2 === 1
      expect(Number.isInteger(acrossX)).toBe(!wantsHalf)
      expect(Number.isInteger(acrossY)).toBe(!wantsHalf)
      if (wantsHalf) {
        expect(acrossX - Math.floor(acrossX)).toBe(0.5)
        expect(acrossY - Math.floor(acrossY)).toBe(0.5)
      }
    }
  })

  test('is idempotent — snapping a snapped point changes nothing', () => {
    for (const size of [1, 2, 3, 8]) {
      for (const point of LOOSE_POINTS) {
        const once = snapToGrid(point, OFFSET_GRID, size)
        expect(snapToGrid(once, OFFSET_GRID, size)).toEqual(once)
      }
    }
  })

  test('never moves a point more than half a square in either axis', () => {
    for (const size of [1, 2, 3]) {
      for (const point of LOOSE_POINTS) {
        const snapped = snapToGrid(point, OFFSET_GRID, size)
        expect(Math.abs(snapped.x - point.x)).toBeLessThanOrEqual(OFFSET_GRID.gridSize / 2)
        expect(Math.abs(snapped.y - point.y)).toBeLessThanOrEqual(OFFSET_GRID.gridSize / 2)
      }
    }
  })
})

describe('cellOf and centreOfCell', () => {
  /**
   * These two being inverses over snapped positions is what lets arrow-key
   * movement be "recover the cell, add one, snap again" without accumulating
   * drift. Both parities of token size are checked because the half-square offset
   * that recovers a cell differs between them.
   */
  test('are inverses over snapped positions at both parities', () => {
    for (const size of [1, 2, 3, 4]) {
      for (const point of LOOSE_POINTS) {
        const snapped = snapToGrid(point, OFFSET_GRID, size)
        const cell = cellOf(snapped, OFFSET_GRID, size)
        expect(centreOfCell(cell, OFFSET_GRID, size)).toEqual(snapped)
        expect(cellOf(centreOfCell(cell, OFFSET_GRID, size), OFFSET_GRID, size)).toEqual(cell)
      }
    }
  })

  test('recovers negative cells for a grid that starts off-image', () => {
    for (const size of [1, 2]) {
      for (const cell of [
        { col: -1, row: -1 },
        { col: -4, row: 0 },
        { col: 0, row: -7 },
      ]) {
        const centre = centreOfCell(cell, OFFSET_GRID, size)
        expect(cellOf(centre, OFFSET_GRID, size)).toEqual(cell)
      }
    }
  })

  test('adjacent cells are exactly one grid size apart', () => {
    for (const size of [1, 2, 3]) {
      const here = centreOfCell({ col: 4, row: 6 }, OFFSET_GRID, size)
      const east = centreOfCell({ col: 5, row: 6 }, OFFSET_GRID, size)
      const south = centreOfCell({ col: 4, row: 7 }, OFFSET_GRID, size)
      expect(east.x - here.x).toBe(OFFSET_GRID.gridSize)
      expect(east.y).toBe(here.y)
      expect(south.y - here.y).toBe(OFFSET_GRID.gridSize)
      expect(south.x).toBe(here.x)
    }
  })
})

describe('moveByCells', () => {
  test('moves exactly one cell per call from an on-grid start', () => {
    for (const size of [1, 2]) {
      let point = snapToGrid({ x: 500, y: 500 }, OFFSET_GRID, size)
      const startCell = cellOf(point, OFFSET_GRID, size)
      for (let step = 1; step <= 5; step += 1) {
        point = moveByCells(point, OFFSET_GRID, size, { col: 1, row: 0 })
        const cell = cellOf(point, OFFSET_GRID, size)
        expect(cell.col).toBe(startCell.col + step)
        expect(cell.row).toBe(startCell.row)
      }
    }
  })

  /**
   * The reason `moveByCells` snaps first and moves second. A position left off
   * the grid by an interrupted drag must be corrected by the first keypress
   * rather than carrying its offset along for every square after it, or "arrow
   * keys always leave the token on a square" is only true after a clean drop.
   */
  test('snaps as well as moves on the first call from an off-grid start', () => {
    for (const size of [1, 2]) {
      const loose = { x: 511.37, y: 91.11 }
      const first = moveByCells(loose, OFFSET_GRID, size, { col: 1, row: 0 })

      // On the grid immediately, not one grid size away from an off-grid start.
      expect(first).toEqual(snapToGrid(first, OFFSET_GRID, size))
      expect(first.x - loose.x).not.toBe(OFFSET_GRID.gridSize)

      // And identical to snapping first and then moving, which is the property
      // that stops the offset being carried along.
      expect(first).toEqual(
        moveByCells(snapToGrid(loose, OFFSET_GRID, size), OFFSET_GRID, size, { col: 1, row: 0 }),
      )
    }
  })

  test('a walk of many single steps lands where one big delta would', () => {
    const size = 1
    let walked = { x: 511.37, y: 91.11 }
    for (let i = 0; i < 7; i += 1) {
      walked = moveByCells(walked, OFFSET_GRID, size, { col: 1, row: -1 })
    }
    const jumped = moveByCells({ x: 511.37, y: 91.11 }, OFFSET_GRID, size, { col: 7, row: -7 })
    expect(walked).toEqual(jumped)
  })

  test('a zero delta only snaps', () => {
    const loose = { x: 1234.5, y: 777.25 }
    expect(moveByCells(loose, OFFSET_GRID, 1, { col: 0, row: 0 })).toEqual(
      snapToGrid(loose, OFFSET_GRID, 1),
    )
  })

  test('moving out and back returns to the same point', () => {
    const start = snapToGrid({ x: 900, y: 400 }, OFFSET_GRID, 2)
    const out = moveByCells(start, OFFSET_GRID, 2, { col: 3, row: -2 })
    expect(moveByCells(out, OFFSET_GRID, 2, { col: -3, row: 2 })).toEqual(start)
  })
})

describe('isUsableGrid', () => {
  test('accepts a plausible calibration and the exact bounds', () => {
    expect(isUsableGrid(OFFSET_GRID)).toBe(true)
    expect(isUsableGrid({ gridSize: MIN_GRID_SIZE, gridOffsetX: 0, gridOffsetY: 0 })).toBe(true)
    expect(isUsableGrid({ gridSize: MAX_GRID_SIZE, gridOffsetX: -5, gridOffsetY: 5 })).toBe(true)
  })

  /**
   * NaN from an emptied number input is a perfectly valid Convex number, and a
   * zero or negative grid size makes `cellOf` divide by zero and hand Infinity
   * to the position table. Both have to be refused before they are stored.
   */
  test('rejects NaN, Infinity, zero and negative sizes', () => {
    for (const gridSize of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      -140,
      MIN_GRID_SIZE - 1,
      MAX_GRID_SIZE + 1,
    ]) {
      expect(isUsableGrid({ gridSize, gridOffsetX: 0, gridOffsetY: 0 })).toBe(false)
    }
  })

  test('rejects a non-finite offset on either axis', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isUsableGrid({ gridSize: 140, gridOffsetX: bad, gridOffsetY: 0 })).toBe(false)
      expect(isUsableGrid({ gridSize: 140, gridOffsetX: 0, gridOffsetY: bad })).toBe(false)
    }
  })

  test('a negative offset is fine — a printed grid may start off-image', () => {
    expect(isUsableGrid({ gridSize: 140, gridOffsetX: -139, gridOffsetY: -12.25 })).toBe(true)
  })
})

describe('isUsableTokenSize', () => {
  test('accepts the whole squares the board can draw', () => {
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(isUsableTokenSize(size)).toBe(true)
    }
  })

  test('rejects fractions, zero, negatives, out-of-range and non-finite sizes', () => {
    for (const size of [0, -1, 1.5, 0.5, 9, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isUsableTokenSize(size)).toBe(false)
    }
  })
})

describe('gridLines', () => {
  /**
   * A positive offset puts the grid's own origin line inside the image but its
   * previous line outside it, and the walked-back start must not leak that
   * negative line into the output.
   */
  test('drops the lines that fall off the image when the offset is positive', () => {
    const { vertical, horizontal } = gridLines(OFFSET_GRID, 2240, 1680)
    expect(vertical[0]).toBe(37.5)
    expect(vertical.every((x) => x >= 0 && x <= 2240)).toBe(true)
    // gridOffsetY is −12.25, so the first line at or above zero is 127.75.
    expect(horizontal[0]).toBe(127.75)
    expect(horizontal.every((y) => y >= 0 && y <= 1680)).toBe(true)
  })

  test('spaces every line exactly one grid size from the last', () => {
    const { vertical, horizontal } = gridLines(OFFSET_GRID, 2240, 1680)
    for (let i = 1; i < vertical.length; i += 1) {
      expect(vertical[i] - vertical[i - 1]).toBe(OFFSET_GRID.gridSize)
    }
    for (let i = 1; i < horizontal.length; i += 1) {
      expect(horizontal[i] - horizontal[i - 1]).toBe(OFFSET_GRID.gridSize)
    }
  })

  test('includes the line at zero when the offset is a whole number of squares', () => {
    const { vertical } = gridLines({ gridSize: 140, gridOffsetX: 140, gridOffsetY: 0 }, 2240, 1680)
    expect(vertical[0]).toBe(0)
    expect(vertical).toHaveLength(17)
  })

  test('a large negative offset still starts inside the image', () => {
    const { vertical } = gridLines(
      { gridSize: 140, gridOffsetX: -1000.5, gridOffsetY: 0 },
      2240,
      1680,
    )
    expect(vertical[0]).toBeGreaterThanOrEqual(0)
    expect(vertical[0]).toBeLessThan(140)
    expect(vertical.every((x) => x >= 0 && x <= 2240)).toBe(true)
  })

  test('covers the whole width — the last line is within one square of the edge', () => {
    const { vertical, horizontal } = gridLines(OFFSET_GRID, 2240, 1680)
    expect(2240 - vertical[vertical.length - 1]).toBeLessThan(OFFSET_GRID.gridSize)
    expect(1680 - horizontal[horizontal.length - 1]).toBeLessThan(OFFSET_GRID.gridSize)
  })

  /** An unusable grid must not become an infinite loop or an infinite array. */
  test('returns nothing at all for an unusable grid', () => {
    for (const gridSize of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(gridLines({ gridSize, gridOffsetX: 0, gridOffsetY: 0 }, 2240, 1680)).toEqual({
        vertical: [],
        horizontal: [],
      })
    }
    expect(gridLines({ gridSize: 140, gridOffsetX: Number.NaN, gridOffsetY: 0 }, 2240, 1680)).toEqual(
      { vertical: [], horizontal: [] },
    )
  })
})
