// The calibration box: what the DM's handles do to a `Grid`, as arithmetic.
//
// Kept pure and away from Konva for the same reason `convex/lib/grid.ts` is kept away
// from Convex and React — every interesting decision here is a sum, and a sum in an
// event handler is a sum nothing can test. `GridHandlesLayer` draws the boxes and
// reports pointer movement; this file decides what the box becomes.
//
// ⚠️ **Cells cannot be rectangular, and that is a decision rather than an omission.**
// The roadmap asks for handles that scale the grid on X and Y independently *and* for no
// schema change, and those cannot both be had. A `Grid` is a single `gridSize`, and seven
// functions in `convex/lib/grid.ts` divide by it; independent axes would need all seven,
// plus `publicSceneValidator`, `updateGrid`'s arguments, `isUsableGrid`, and every
// `sizeSquares` footprint — where "a 2×2 ogre" stops meaning anything at all, because two
// squares across and two squares down would no longer be the same distance. No schema
// change is the binding half, so the box is **square by construction**: it carries one
// `side`, not a width and a height, and there is nowhere in this file to put a second
// axis. Do not add `gridSizeX`/`gridSizeY`.
//
// What survives of the request is the *edge* handle, which is the genuinely distinct
// gesture and not a degenerate corner: it calibrates from one axis alone, which is what a
// DM does when the map's vertical is cropped or the printed grid is legible one way and
// not the other. It still moves both axes, because there is only one number.

import type { Grid, Point } from '@convex/lib/grid'
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '@convex/lib/grid'

/**
 * How many cells the box spans. Four rather than one, because a single cell is too small
 * a thing to aim a pointer at on a 140-pixel grid zoomed out to fit, and because a
 * one-cell error over four cells is a quarter of the error over one — the DM is lining
 * the far edge up with the fourth printed line, which is four times the leverage.
 *
 * ⚠️ **A power of two, and load-bearing.** `side = gridSize * cells` and
 * `gridSize = side / cells` are both exact in binary floating point for a power of two,
 * so `gridOfBox(boxOfGrid(g))` is an identity rather than nearly one. Change this to 3
 * or 5 and merely opening the calibrator perturbs the grid in the sixteenth decimal
 * place, which is a write, which is a redraw on every screen at the table.
 */
export const CALIBRATION_CELLS = 4

/** The box, in image space. One `side` — see the note at the top of this file. */
export type GridBox = { x: number; y: number; side: number }

/**
 * The nine things a pointer can be holding: four corners, four edges, and the box itself.
 *
 * `body` is a handle rather than a special case because it is one of the arms of
 * `dragBox` like any other, and because the renderer wants a single list to iterate.
 */
export type GridHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'body'

/**
 * Every handle, in **paint order, bottom first** — the same discipline `TOKEN_LAYERS`
 * applies to the board. The body is drawn underneath so the eight grips sit on top of it
 * and win hit-testing, which is how a press on a corner resizes instead of translating.
 * Iterated by the renderer rather than written out — see CLAUDE.md invariant 9.
 */
export const GRID_HANDLES: readonly GridHandle[] = [
  'body',
  'n',
  's',
  'e',
  'w',
  'nw',
  'ne',
  'sw',
  'se',
]

/** The first `cells` cells at the grid origin, which is where the handles hang. */
export function boxOfGrid(grid: Grid, cells: number = CALIBRATION_CELLS): GridBox {
  return { x: grid.gridOffsetX, y: grid.gridOffsetY, side: grid.gridSize * cells }
}

/**
 * The inverse. The box's top-left corner *is* the grid origin, so a translated box is a
 * changed offset and nothing else — which is why `body` never touches `gridSize`.
 */
export function gridOfBox(box: GridBox, cells: number = CALIBRATION_CELLS): Grid {
  return { gridSize: box.side / cells, gridOffsetX: box.x, gridOffsetY: box.y }
}

/**
 * A pointer delta that cannot poison a grid.
 *
 * Konva reports finite coordinates, so this never fires in practice — it is here so that
 * "a drag can never produce a grid `isUsableGrid` refuses" is true by construction rather
 * than by trusting a library. A NaN offset is a perfectly valid Convex number and would
 * divide its way into every snap afterwards; `scenes.updateGrid` would refuse the write,
 * leaving the DM dragging a box that silently never saves.
 */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * The side, forced into the range `updateGrid` will accept.
 *
 * Applied on **every** arm of `dragBox`, including `body`, which does not change the side
 * at all — clamping there costs nothing and means the postcondition is a property of the
 * function rather than of eight of its nine branches.
 */
function clampSide(side: number, cells: number): number {
  if (!Number.isFinite(side)) return cells * MIN_GRID_SIZE
  return Math.min(Math.max(side, cells * MIN_GRID_SIZE), cells * MAX_GRID_SIZE)
}

/**
 * Where a handle's grip sits, in image space. The centre of the box for `body`, the
 * midpoint of an edge for an edge handle, a corner for a corner.
 */
export function handleAnchor(box: GridBox, handle: GridHandle): Point {
  if (handle === 'body') return { x: box.x + box.side / 2, y: box.y + box.side / 2 }

  const mid = box.side / 2
  return {
    x: handle.includes('w') ? box.x : handle.includes('e') ? box.x + box.side : box.x + mid,
    y: handle.includes('n') ? box.y : handle.includes('s') ? box.y + box.side : box.y + mid,
  }
}

/**
 * The whole gesture set: one box, one handle, one cumulative pointer movement since the
 * grip was taken, and the box that results.
 *
 * Three arms, and the difference between them is what the DM is actually doing:
 *
 * - **body** translates. Only the offsets move, so `gridSize` is untouched, and they are
 *   freely negative — `gridLines` walks back to the largest multiple at or before zero,
 *   so a box dragged off the top-left of the image is a legal calibration and not an
 *   error to guard against.
 * - **corner** resizes with the **opposite corner pinned**, so that corner stays exactly
 *   where the DM put it on a grid intersection and only one end of the box moves. The
 *   side comes from whichever axis the pointer committed to hardest, and the box stays
 *   square — **that squareness is the visible statement that cells cannot be
 *   rectangular.** A DM who drags a corner out sideways watches the box grow downwards
 *   too, and learns the rule in one gesture rather than from a tooltip.
 * - **edge** resizes from **one axis only**, with the opposite edge pinned. See the note
 *   at the top of this file for why this is the interesting one.
 *
 * The delta is cumulative from the grip rather than incremental frame to frame, so a drag
 * that runs past the clamp and comes back behaves like an image editor's: the box waits
 * at the limit until the pointer has returned past it, instead of setting off again from
 * wherever the run ended.
 */
export function dragBox(
  box: GridBox,
  handle: GridHandle,
  delta: Point,
  cells: number = CALIBRATION_CELLS,
): GridBox {
  const move = { x: finite(delta.x), y: finite(delta.y) }

  if (handle === 'body') {
    return { x: box.x + move.x, y: box.y + move.y, side: clampSide(box.side, cells) }
  }

  const east = handle.includes('e')
  const west = handle.includes('w')
  const north = handle.includes('n')
  const south = handle.includes('s')

  // How far the grip moved *outwards*, per axis. A west or north handle grows the box as
  // the pointer moves towards negative coordinates, which is the whole of the sign.
  const alongX = east ? move.x : west ? -move.x : 0
  const alongY = south ? move.y : north ? -move.y : 0

  // A corner takes the axis with the larger magnitude and applies it to both. Averaging
  // the two was the alternative and is worse: dragging a corner straight out sideways
  // would then grow the box by half of what the pointer did, so the corner visibly trails
  // the cursor and the DM chases it. On an edge handle exactly one term is zero.
  const corner = (east || west) && (north || south)
  const grow = corner
    ? Math.abs(alongX) >= Math.abs(alongY)
      ? alongX
      : alongY
    : alongX + alongY

  const side = clampSide(box.side + grow, cells)

  // Pin the far side. An east handle leaves the west edge alone, so `x` does not move; a
  // west handle moves `x` by exactly as much as the side changed, so `x + side` — the east
  // edge — is the number that does not move. Computed from the *clamped* side, so the pin
  // holds at the limits too rather than only in the middle of the range.
  return {
    x: west ? box.x + box.side - side : box.x,
    y: north ? box.y + box.side - side : box.y,
    side,
  }
}
