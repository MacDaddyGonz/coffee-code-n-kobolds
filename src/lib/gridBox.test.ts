import { describe, expect, test } from 'vitest'

import {
  CALIBRATION_CELLS,
  GRID_HANDLES,
  boxOfGrid,
  dragBox,
  gridOfBox,
  handleAnchor,
} from './gridBox'
import type { GridBox, GridHandle } from './gridBox'
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '@convex/lib/grid'
import type { Grid } from '@convex/lib/grid'

/**
 * Every number here is exactly representable in binary floating point — 140, 560, 37.5,
 * −12.25, 0.25 — so the assertions are exact equality rather than `toBeCloseTo`, exactly
 * as `convex/lib/grid.test.ts` does and for the same reason. `toBeCloseTo` would hide the
 * one failure that matters: a corner that drifts a fraction of a pixel per drag is a
 * pinned corner that is not pinned, and the DM discovers it four calibrations later when
 * the grid no longer lines up with the wall they aimed it at.
 *
 * `CALIBRATION_CELLS` being 4 is what makes that available at all — see its docblock.
 */
const OFFSET_GRID: Grid = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }
const ORIGIN_GRID: Grid = { gridSize: 140, gridOffsetX: 0, gridOffsetY: 0 }
const SMALL_GRID: Grid = { gridSize: 6.25, gridOffsetX: -1000.5, gridOffsetY: 0.25 }

const GRIDS = [OFFSET_GRID, ORIGIN_GRID, SMALL_GRID]

/** The box `OFFSET_GRID` produces: 140 × 4, at the grid origin. */
const BOX: GridBox = { x: 37.5, y: -12.25, side: 560 }

const MIN_SIDE = CALIBRATION_CELLS * MIN_GRID_SIZE
const MAX_SIDE = CALIBRATION_CELLS * MAX_GRID_SIZE

const CORNERS: GridHandle[] = ['nw', 'ne', 'sw', 'se']
const EDGES: GridHandle[] = ['n', 's', 'e', 'w']

/** The corner a drag on `handle` must leave exactly where it was. */
function oppositeCorner(box: GridBox, handle: GridHandle) {
  return {
    x: handle.includes('e') ? box.x : box.x + box.side,
    y: handle.includes('s') ? box.y : box.y + box.side,
  }
}

/**
 * A delta that drags `handle` *away* from the box, whichever handle it is — so a clamp
 * test can say "push every handle until it stops" without four sign tables written out.
 * Negate it to drag inwards.
 */
function outward(handle: GridHandle, distance: number) {
  return {
    x: handle.includes('e') ? distance : handle.includes('w') ? -distance : 0,
    y: handle.includes('s') ? distance : handle.includes('n') ? -distance : 0,
  }
}

describe('boxOfGrid and gridOfBox', () => {
  test('the box is the first four cells at the grid origin', () => {
    expect(boxOfGrid(OFFSET_GRID)).toEqual({ x: 37.5, y: -12.25, side: 560 })
    expect(boxOfGrid(ORIGIN_GRID)).toEqual({ x: 0, y: 0, side: 560 })
  })

  /**
   * The identity that lets the calibrator be opened and closed without writing anything.
   * Exact, not approximate: a round trip that perturbed `gridSize` in the last decimal
   * place would be a write, and a write is a redraw on every screen at the table.
   */
  test('round-trips a grid through a box exactly', () => {
    for (const grid of GRIDS) {
      expect(gridOfBox(boxOfGrid(grid))).toEqual(grid)
    }
  })

  test('round-trips a box through a grid exactly', () => {
    for (const box of [BOX, { x: 0, y: 0, side: 16 }, { x: -3.5, y: 2.25, side: 8000 }]) {
      expect(boxOfGrid(gridOfBox(box))).toEqual(box)
    }
  })

  test('honours a cell count other than the default on both halves', () => {
    const box = boxOfGrid(OFFSET_GRID, 8)
    expect(box.side).toBe(1120)
    expect(gridOfBox(box, 8)).toEqual(OFFSET_GRID)
  })
})

describe('handleAnchor', () => {
  test('puts each grip on the corner, edge midpoint or centre it names', () => {
    expect(handleAnchor(BOX, 'nw')).toEqual({ x: 37.5, y: -12.25 })
    expect(handleAnchor(BOX, 'se')).toEqual({ x: 597.5, y: 547.75 })
    expect(handleAnchor(BOX, 'n')).toEqual({ x: 317.5, y: -12.25 })
    expect(handleAnchor(BOX, 'w')).toEqual({ x: 37.5, y: 267.75 })
    expect(handleAnchor(BOX, 'body')).toEqual({ x: 317.5, y: 267.75 })
  })
})

describe('dragBox — body', () => {
  test('translates and leaves the side alone', () => {
    const moved = dragBox(BOX, 'body', { x: 100, y: -40 })
    expect(moved).toEqual({ x: 137.5, y: -52.25, side: 560 })
  })

  /**
   * A grid whose origin is off the top-left of the image is normal, not an error: the DM
   * nudges ours onto a printed one and `gridLines` walks back to the largest multiple at
   * or before zero. So there is deliberately no floor here.
   */
  test('lets the box go freely negative', () => {
    const moved = dragBox(BOX, 'body', { x: -5000, y: -5000 })
    expect(moved.x).toBe(-4962.5)
    expect(moved.y).toBe(-5012.25)
    expect(moved.side).toBe(560)
  })

  test('only ever changes the offsets, whatever the delta', () => {
    for (const delta of [
      { x: 0, y: 0 },
      { x: 0.25, y: -0.25 },
      { x: 1e6, y: -1e6 },
    ]) {
      expect(dragBox(BOX, 'body', delta).side).toBe(BOX.side)
    }
  })
})

describe('dragBox — corners', () => {
  test('pins the opposite corner, at every corner and in every direction', () => {
    for (const handle of CORNERS) {
      const pinned = oppositeCorner(BOX, handle)
      for (const delta of [
        { x: 90, y: 40 },
        { x: -90, y: -40 },
        { x: 90, y: -40 },
        { x: -90, y: 40 },
        { x: 0, y: 0 },
      ]) {
        const next = dragBox(BOX, handle, delta)
        expect(oppositeCorner(next, handle)).toEqual(pinned)
      }
    }
  })

  /**
   * The squareness statement. The pointer described a rectangle 90 across and 40 down;
   * the box takes the 90 on both axes, because a `Grid` has one `gridSize` and there is
   * nowhere for a second to go.
   */
  test('takes the axis the pointer moved furthest along and stays square', () => {
    expect(dragBox(BOX, 'se', { x: 90, y: 40 })).toEqual({ x: 37.5, y: -12.25, side: 650 })
    expect(dragBox(BOX, 'se', { x: 40, y: 90 })).toEqual({ x: 37.5, y: -12.25, side: 650 })
    // Shrinking works the same way, and "furthest" is a magnitude rather than a sign: the
    // −90 wins over the +40, so the box shrinks even though one axis was dragged outwards.
    expect(dragBox(BOX, 'se', { x: -90, y: 40 })).toEqual({ x: 37.5, y: -12.25, side: 470 })
  })

  test('a north-west drag moves both edges and pins the south-east corner', () => {
    // Dragging up and left by 40 grows the box by 40 on the axis that moved furthest.
    expect(dragBox(BOX, 'nw', { x: -40, y: -10 })).toEqual({
      x: -2.5,
      y: -52.25,
      side: 600,
    })
  })

  test('a corner drag is exactly reversible while it stays inside the clamp', () => {
    for (const handle of CORNERS) {
      const out = dragBox(BOX, handle, { x: 120, y: 120 })
      expect(dragBox(out, handle, { x: -120, y: -120 })).toEqual(BOX)
    }
  })
})

describe('dragBox — edges', () => {
  /**
   * The distinct gesture: one ruler, one axis. The opposite edge is pinned and the two
   * edges perpendicular to the drag do not move at all — which is what makes an east drag
   * "the map is this many squares wide" and nothing else.
   */
  test('pins the opposite edge and leaves the perpendicular axis alone', () => {
    expect(dragBox(BOX, 'e', { x: 60, y: 999 })).toEqual({ x: 37.5, y: -12.25, side: 620 })
    expect(dragBox(BOX, 'w', { x: 60, y: 999 })).toEqual({ x: 97.5, y: -12.25, side: 500 })
    expect(dragBox(BOX, 's', { x: 999, y: 60 })).toEqual({ x: 37.5, y: -12.25, side: 620 })
    expect(dragBox(BOX, 'n', { x: 999, y: 60 })).toEqual({ x: 37.5, y: 47.75, side: 500 })
  })

  test('the pinned edge is the one that does not move, for all four', () => {
    for (const handle of EDGES) {
      const next = dragBox(BOX, handle, { x: -37, y: 53 })
      if (handle === 'e') expect(next.x).toBe(BOX.x)
      if (handle === 'w') expect(next.x + next.side).toBe(BOX.x + BOX.side)
      if (handle === 's') expect(next.y).toBe(BOX.y)
      if (handle === 'n') expect(next.y + next.side).toBe(BOX.y + BOX.side)
    }
  })

  /**
   * ⚠️ An edge handle still changes both dimensions, because there is only one number to
   * change. Asserting it rather than leaving it implied: this is the sentence somebody
   * will come here to argue with when they want rectangular cells.
   */
  test('an east drag changes the height too — one gridSize, one side', () => {
    const next = dragBox(BOX, 'e', { x: 60, y: 0 })
    expect(next.side).toBe(620)
    expect(gridOfBox(next).gridSize).toBe(155)
  })
})

describe('dragBox — clamping', () => {
  test('never goes below the smallest drawable grid, on any handle', () => {
    for (const handle of [...CORNERS, ...EDGES]) {
      const next = dragBox(BOX, handle, outward(handle, -1e6))
      expect(next.side).toBe(MIN_SIDE)
      expect(gridOfBox(next).gridSize).toBe(MIN_GRID_SIZE)
    }
  })

  test('never goes above the largest drawable grid, on any handle', () => {
    for (const handle of [...CORNERS, ...EDGES]) {
      const next = dragBox(BOX, handle, outward(handle, 1e6))
      expect(next.side).toBe(MAX_SIDE)
      expect(gridOfBox(next).gridSize).toBe(MAX_GRID_SIZE)
    }
  })

  /**
   * The clamp must not cost the pin. A corner run hard into either limit still has to
   * leave the opposite corner where the DM put it, or the box walks across the map while
   * the DM is only trying to make it smaller.
   */
  test('still pins the opposite corner when the side is clamped', () => {
    for (const handle of CORNERS) {
      const pinned = oppositeCorner(BOX, handle)
      for (const delta of [
        { x: -1e6, y: -1e6 },
        { x: 1e6, y: 1e6 },
      ]) {
        expect(oppositeCorner(dragBox(BOX, handle, delta), handle)).toEqual(pinned)
      }
    }
  })

  /**
   * The postcondition the whole clamp exists for: `scenes.updateGrid` refuses a grid
   * `isUsableGrid` rejects, so a drag that could produce one is a drag that silently
   * stops saving. A non-finite delta is the case Konva will never send and the one that
   * would be worst if it did.
   */
  test('a non-finite delta is a no-op rather than a poisoned grid', () => {
    for (const delta of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.NaN },
      { x: Number.POSITIVE_INFINITY, y: Number.NEGATIVE_INFINITY },
    ]) {
      for (const handle of GRID_HANDLES) {
        expect(dragBox(BOX, handle, delta)).toEqual(BOX)
      }
    }
  })

  test('scales the clamp with the cell count', () => {
    const box = boxOfGrid(OFFSET_GRID, 8)
    expect(dragBox(box, 'se', { x: -1e6, y: 0 }, 8).side).toBe(8 * MIN_GRID_SIZE)
    expect(dragBox(box, 'se', { x: 1e6, y: 0 }, 8).side).toBe(8 * MAX_GRID_SIZE)
  })
})

describe('GRID_HANDLES', () => {
  test('draws the body first, so the grips sit on top of it', () => {
    expect(GRID_HANDLES[0]).toBe('body')
    expect(GRID_HANDLES).toHaveLength(9)
    expect(new Set(GRID_HANDLES).size).toBe(9)
  })
})
