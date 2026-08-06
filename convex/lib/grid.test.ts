import { describe, expect, test } from 'vitest'

import {
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  anyShapeCovers,
  boundsOf,
  centreOfCell,
  cellOf,
  gridLines,
  gridSizeFor,
  isUsableGrid,
  isUsableTokenSize,
  moveByCells,
  polygonCovers,
  rectCovers,
  shapeCovers,
  snapToGrid,
  squaresDown,
} from './grid'
import type { Grid, Point, Rect, Shape } from './grid'

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

/**
 * ⚠️⚠️ **THE KEYSTONE OF THE MILESTONE'S GEOMETRY, AND IT IS A TEST RATHER THAN A
 * PARAGRAPH ON PURPOSE.**
 *
 * `rectCovers` is half-open — inclusive of the top-left, exclusive of the bottom-right — so
 * that abutting shapes tile with no seam and without both claiming the line between them.
 * `polygonCovers` has to answer **identically**, and the reason it does is two details of the
 * crossing-number rule that look arbitrary: a strict `>` on both ends of the scan-line test,
 * and a strict `<` against the intersection.
 *
 * Nothing about that is obvious by reading, and it is the sort of thing that is quietly wrong
 * for a year: a fog polygon that claims one extra row of pixels down its bottom edge hides a
 * token standing on the line that the rectangle beside it also hides, and one that claims one
 * fewer opens a one-pixel corridor of visibility through a wall the DM believes is solid.
 * Neither is visible on a screen.
 *
 * So the assertions below compare the two functions against **each other** rather than against
 * a list of expected booleans. The claim is the equivalence, so the equivalence is what is
 * pinned — a hand-written truth table would have to be got right by the same reasoning that
 * could have got the implementation wrong.
 */
const SQUARE: Rect = { x: 100, y: 200, width: 140, height: 140 }

/** The same region as a point list, clockwise from the top-left. */
const SQUARE_POINTS: Point[] = [
  { x: 100, y: 200 },
  { x: 240, y: 200 },
  { x: 240, y: 340 },
  { x: 100, y: 340 },
]

/** And anticlockwise, because winding must not change the answer. */
const SQUARE_WIDDERSHINS: Point[] = [...SQUARE_POINTS].reverse()

/**
 * A pixel is far too coarse to probe an edge with, and a float too small vanishes into the
 * mantissa of a coordinate in the hundreds. A thousandth of a pixel is fine at this magnitude
 * and is well inside any square.
 */
const EPSILON = 0.001

describe('boundsOf', () => {
  test('is the smallest rectangle containing every point', () => {
    expect(boundsOf(SQUARE_POINTS)).toEqual(SQUARE)
  })

  test('finds the extremes wherever they sit in the list, and takes negatives', () => {
    expect(
      boundsOf([
        { x: 40, y: -12.25 },
        { x: -63.5, y: 90 },
        { x: 10, y: 200.5 },
        { x: 511.25, y: 3 },
      ]),
    ).toEqual({ x: -63.5, y: -12.25, width: 574.75, height: 212.75 })
  })

  test('a single point and a straight line both have a zero extent', () => {
    expect(boundsOf([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9, width: 0, height: 0 })
    expect(
      boundsOf([
        { x: 0, y: 5 },
        { x: 100, y: 5 },
        { x: 50, y: 5 },
      ]),
    ).toEqual({ x: 0, y: 5, width: 100, height: 0 })
  })

  /**
   * ⚠️ **Not a curiosity — it is the reason `requireDrawablePolygon` refuses an empty list
   * before this is ever called.** A zero-extent rectangle at the origin covers no point at
   * all, which is the fail-closed answer, but a row holding one would be fog the DM drew and
   * cannot see, cannot click and cannot rub out.
   */
  test('an empty list is a zero-extent rectangle at the origin, which covers nothing', () => {
    const empty = boundsOf([])
    expect(empty).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(rectCovers(empty, { x: 0, y: 0 })).toBe(false)
  })
})

describe('polygonCovers agrees with rectCovers, exactly', () => {
  /** Every point worth asking about on a square: the four edges, and just either side. */
  function probes(rect: Rect): Point[] {
    const left = rect.x
    const right = rect.x + rect.width
    const top = rect.y
    const bottom = rect.y + rect.height
    const midX = rect.x + rect.width / 2
    const midY = rect.y + rect.height / 2

    return [
      // The four corners, which are where the two axes' conventions meet.
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
      // The four edges, away from a corner.
      { x: midX, y: top },
      { x: right, y: midY },
      { x: midX, y: bottom },
      { x: left, y: midY },
      // A thousandth of a pixel inside each edge …
      { x: left + EPSILON, y: midY },
      { x: right - EPSILON, y: midY },
      { x: midX, y: top + EPSILON },
      { x: midX, y: bottom - EPSILON },
      // … and outside it.
      { x: left - EPSILON, y: midY },
      { x: right + EPSILON, y: midY },
      { x: midX, y: top - EPSILON },
      { x: midX, y: bottom + EPSILON },
      // And the middle, so a pair agreeing on nothing but "false" would fail.
      { x: midX, y: midY },
    ]
  }

  test('at all four edges, all four corners and a thousandth of a pixel either side', () => {
    for (const point of probes(SQUARE)) {
      expect([point, polygonCovers(SQUARE_POINTS, point)]).toEqual([
        point,
        rectCovers(SQUARE, point),
      ])
    }
  })

  /**
   * The convention spelled out, so a future reader can see *which* answer the pair agreed on
   * rather than only that they agreed. Top-left in, bottom-right out.
   */
  test('and the convention they agree on is top-left inclusive, bottom-right exclusive', () => {
    expect(polygonCovers(SQUARE_POINTS, { x: 100, y: 200 })).toBe(true)
    expect(polygonCovers(SQUARE_POINTS, { x: 100, y: 270 })).toBe(true)
    expect(polygonCovers(SQUARE_POINTS, { x: 170, y: 200 })).toBe(true)
    expect(polygonCovers(SQUARE_POINTS, { x: 240, y: 270 })).toBe(false)
    expect(polygonCovers(SQUARE_POINTS, { x: 170, y: 340 })).toBe(false)
    expect(polygonCovers(SQUARE_POINTS, { x: 240, y: 340 })).toBe(false)
  })

  /**
   * The DM's polygon tool emits vertices in whatever order they clicked, and nothing anywhere
   * normalises the winding — `polygonCovers` counts crossings rather than turns, so it must
   * not care. If it ever did, half of every DM's shapes would answer the opposite way.
   */
  test('and it does not care which way round the points were clicked', () => {
    for (const point of probes(SQUARE)) {
      expect([point, polygonCovers(SQUARE_WIDDERSHINS, point)]).toEqual([
        point,
        rectCovers(SQUARE, point),
      ])
    }
  })
})

describe('shapeCovers', () => {
  test('a shape with no points is its bounding box and nothing else', () => {
    for (const point of [
      { x: 100, y: 200 },
      { x: 170, y: 270 },
      { x: 240, y: 340 },
      { x: 99.999, y: 270 },
    ]) {
      expect(shapeCovers(SQUARE, point)).toBe(rectCovers(SQUARE, point))
    }
  })

  /**
   * ⚠️ **The bounds test is not merely an optimisation — it is the whole reason the box is
   * stored, and a wrong box is the failure the schema comment is about.** A polygon whose
   * points reach outside its recorded box is invisible in the part that sticks out, so this
   * asserts the *composition* rather than the ray-cast: a point genuinely inside the outline
   * but outside the box answers false.
   */
  test('the box wins — a point outside it is never ray-cast', () => {
    const inside: Point = { x: 170, y: 270 }
    const wrongBox: Shape = { x: 0, y: 0, width: 1, height: 1, points: SQUARE_POINTS }

    expect(polygonCovers(SQUARE_POINTS, inside)).toBe(true)
    expect(shapeCovers(wrongBox, inside)).toBe(false)
    expect(shapeCovers({ ...boundsOf(SQUARE_POINTS), points: SQUARE_POINTS }, inside)).toBe(true)
  })

  /**
   * ⚠️ **The one documented fail-open branch in the fog design, extended to shapes.** Every
   * NaN comparison is false, so `rectCovers` answers false for a broken coordinate and
   * `shapeCovers` returns before the ray-cast ever sees one — which is why the bounds test
   * runs first rather than second. There is **one** fail-open branch, not one per shape kind.
   *
   * ⚠️ **Under a covered base that same answer inverts to fail-CLOSED**, because being inside
   * no shape is being in the dark, so a token with a broken position is withheld rather than
   * published. ADR 0012 records the fail-open half and ADR 0015 records the inversion; both
   * are true of a polygon for exactly this reason — one containment test, read through two
   * bases in `veiled`.
   */
  test('fails open on a non-finite coordinate, for both kinds, without ray-casting', () => {
    const polygon: Shape = { ...boundsOf(SQUARE_POINTS), points: SQUARE_POINTS }

    for (const broken of [
      { x: Number.NaN, y: 270 },
      { x: 170, y: Number.NaN },
      { x: Number.NaN, y: Number.NaN },
    ]) {
      expect(rectCovers(SQUARE, broken)).toBe(false)
      expect(shapeCovers(SQUARE, broken)).toBe(false)
      expect(shapeCovers(polygon, broken)).toBe(false)
    }
  })

  /** A shape whose own points are broken is refused on the write path; it hides nothing here. */
  test('a shape with a non-finite vertex covers nothing at all', () => {
    const points: Point[] = [
      { x: 100, y: 200 },
      { x: Number.NaN, y: 200 },
      { x: 240, y: 340 },
    ]
    expect(shapeCovers({ ...boundsOf(points), points }, { x: 170, y: 270 })).toBe(false)
  })
})

/**
 * ⚠️ **The second half of the keystone: two abutting shapes of *different kinds* must tile.**
 *
 * The equivalence above says a polygon and a rectangle agree about one region's edges. This
 * says the consequence the feature actually depends on — a DM who blacks out a room with a
 * rectangle and the corridor beside it with a polygon gets one continuous dark region, with no
 * seam a token can stand in and no line both shapes claim.
 */
describe('shapes of different kinds tile without a seam', () => {
  const room: Shape = { x: 0, y: 0, width: 100, height: 100 }
  const corridorPoints: Point[] = [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
  ]
  const corridor: Shape = { ...boundsOf(corridorPoints), points: corridorPoints }

  /** Points down the shared line, including both ends of it. */
  const seam: Point[] = [0, 0.001, 25, 50, 99.999].map((y) => ({ x: 100, y }))

  test('exactly one of them claims every point on the line between', () => {
    for (const point of seam) {
      expect([point, shapeCovers(room, point), shapeCovers(corridor, point)]).toEqual([
        point,
        false,
        true,
      ])
    }
  })

  test('so the pair covers the whole span with no gap and no overlap', () => {
    for (let x = 0; x < 200; x += 0.5) {
      const point = { x, y: 50 }
      const claims = [room, corridor].filter((shape) => shapeCovers(shape, point)).length
      expect([point, claims]).toEqual([point, 1])
    }
    // And the far edge of the pair is exclusive, exactly as one rectangle's would be.
    expect(anyShapeCovers([room, corridor], { x: 200, y: 50 })).toBe(false)
  })

  test('the same holds with the kinds the other way round', () => {
    const roomPoints: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const shapes: Shape[] = [
      { ...boundsOf(roomPoints), points: roomPoints },
      { x: 100, y: 0, width: 100, height: 100 },
    ]
    for (const point of seam) {
      expect([point, shapes.filter((shape) => shapeCovers(shape, point)).length]).toEqual([
        point,
        1,
      ])
    }
  })
})

/**
 * The shapes a DM actually draws by accident. None of these is refused on the write path —
 * `requireDrawablePolygon` checks finiteness, a corner count and a non-degenerate box, and
 * deliberately nothing about validity — so the even-odd rule has to answer all of them
 * sensibly rather than the tool having to prevent them.
 */
describe('polygonCovers on the shapes a hand actually draws', () => {
  /** An L-shaped room: 200×200 with the bottom-right quarter cut out. */
  const ELL: Point[] = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ]

  test('a concave outline excludes the notch and includes both arms', () => {
    expect(polygonCovers(ELL, { x: 50, y: 50 })).toBe(true)
    expect(polygonCovers(ELL, { x: 150, y: 50 })).toBe(true)
    expect(polygonCovers(ELL, { x: 50, y: 150 })).toBe(true)
    // The cut-out quarter, which the bounding box contains and the outline does not.
    expect(polygonCovers(ELL, { x: 150, y: 150 })).toBe(false)
    expect(rectCovers(boundsOf(ELL), { x: 150, y: 150 })).toBe(true)
    expect(shapeCovers({ ...boundsOf(ELL), points: ELL }, { x: 150, y: 150 })).toBe(false)
  })

  /**
   * A DM tracing a wall clicks along a straight run and produces three collinear points. The
   * shape is a perfectly good rectangle; the middle vertex is simply a corner with no angle
   * at it, and the crossing rule must not count the degenerate edge twice.
   */
  test('collinear points on an edge change nothing', () => {
    const withMidpoints: Point[] = [
      { x: 100, y: 200 },
      { x: 170, y: 200 },
      { x: 240, y: 200 },
      { x: 240, y: 270 },
      { x: 240, y: 340 },
      { x: 100, y: 340 },
    ]
    for (const point of [
      { x: 100, y: 200 },
      { x: 170, y: 200 },
      { x: 170, y: 270 },
      { x: 240, y: 270 },
      { x: 170, y: 340 },
      { x: 99.999, y: 270 },
    ]) {
      expect([point, polygonCovers(withMidpoints, point)]).toEqual([
        point,
        rectCovers(SQUARE, point),
      ])
    }
  })

  /**
   * A bowtie — the outline crosses itself, which happens the moment a DM clicks their corners
   * out of order. Under the even-odd rule the two lobes are inside and the notch either side
   * of the crossing is not, and that is a coherent answer rather than a bug: it is *a* region,
   * it is the one drawn, and refusing it would refuse a gesture that works.
   */
  test('a self-intersecting outline is answered by the even-odd rule rather than refused', () => {
    const bowtie: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ]
    expect(polygonCovers(bowtie, { x: 50, y: 10 })).toBe(true)
    expect(polygonCovers(bowtie, { x: 50, y: 90 })).toBe(true)
    expect(polygonCovers(bowtie, { x: 10, y: 50 })).toBe(false)
    expect(polygonCovers(bowtie, { x: 90, y: 50 })).toBe(false)
  })

  /**
   * A shape pinched to a point in the middle — two lobes joined at one vertex, which is what
   * a DM gets by routing a figure back through the square they started in. Both lobes are
   * inside.
   */
  test('an outline that touches itself at one vertex still has an inside', () => {
    const pinched: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 50 },
    ]
    expect(polygonCovers(pinched, { x: 50, y: 10 })).toBe(true)
    expect(polygonCovers(pinched, { x: 50, y: 90 })).toBe(true)
    expect(polygonCovers(pinched, { x: 95, y: 50 })).toBe(false)
  })

  /** Fewer than three points is not a region, whatever the box says. */
  test('a line and a single point cover nothing', () => {
    expect(polygonCovers([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(false)
    expect(
      polygonCovers(
        [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        { x: 50, y: 50 },
      ),
    ).toBe(false)
    expect(polygonCovers([], { x: 0, y: 0 })).toBe(false)
  })
})

describe('anyShapeCovers', () => {
  const shapes: Shape[] = [
    { x: 0, y: 0, width: 50, height: 50 },
    { ...boundsOf(SQUARE_POINTS), points: SQUARE_POINTS },
  ]

  test('is true when any one of them covers, and false for an empty list', () => {
    expect(anyShapeCovers(shapes, { x: 10, y: 10 })).toBe(true)
    expect(anyShapeCovers(shapes, { x: 170, y: 270 })).toBe(true)
    expect(anyShapeCovers(shapes, { x: 1000, y: 1000 })).toBe(false)
    expect(anyShapeCovers([], { x: 10, y: 10 })).toBe(false)
  })
})
