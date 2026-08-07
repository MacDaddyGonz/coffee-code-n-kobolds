// Aligning the grid by tracing the map's *own* squares: what a dragged box and two square
// counts make of a `Grid`, as arithmetic.
//
// Beside `gridBox.ts` and pure for its reason — every interesting decision in here is a
// division, and a division in an event handler is a division nothing can test.
// `TraceBoxLayer` draws the box and reports where it landed; this file decides what the box
// means. Free of Konva, of React and of Convex, like the module it sits next to.
//
// ⭐ **What this replaces is Roll20's alignment tool, whose own blog calls it "click, drag
// and pray"**, and which says the thing it lacked was per-axis scaling. Per-axis scaling is
// declined here too, for the third time and for the reason `gridBox.ts` sets out at length:
// a `Grid` carries one `gridSize`, seven functions in `convex/lib/grid.ts` divide by it, and
// "a 2×2 ogre" stops meaning anything the moment two squares across is a different distance
// from two squares down. Cells are square and stay square.
//
// **What is offered instead is better than praying, and it is the whole reason this module
// hands back four things rather than one.** The two measurements leave separately,
// `outOfSquare` says how far apart they are, and the panel prints all three — so a DM
// tracing a map whose printed grid is 140.0 across and 139.6 down is told exactly that,
// told that ours is the average of the two, and told by how much the assumption is wrong on
// *this* map. That is the intent of per-axis scaling delivered inside one number, rather
// than the intent being pretended unreasonable. Hiding the disagreement — averaging quietly
// and returning a `Grid` — is the one thing this module must not do.

import type { Grid, Rect } from '@convex/lib/grid'
import { isUsableGrid } from '@convex/lib/grid'

/**
 * How far out of square a map may be printed before the panel says so in words, as a
 * fraction of the cell the two measurements average to.
 *
 * One percent, which on a 140-pixel square is 1.4 px — a hair under the width of the line
 * such a map is usually printed with, and about the best anybody does aiming a pointer at a
 * printed intersection over three or four squares. Below it the disagreement is the DM's
 * hand rather than the map, and a warning that fires on every good trace ever made is a
 * warning nobody reads by the second session.
 *
 * ⚠️ **It gates a sentence and nothing else.** The mean is taken either way, the grid is
 * written either way, and nothing anywhere is refused because of it — `gridFromTrace` does
 * not read this constant. Moving it changes how talkative the panel is and changes no grid.
 */
export const OUT_OF_SQUARE_THRESHOLD = 0.01

/**
 * What a traced box says about the grid: the grid to write, the two measurements it was
 * averaged from, and how far apart they were.
 *
 * The two measurements are handed back rather than collapsed, because the panel is the only
 * thing that can act on their disagreement — see the ⭐ at the top of this file. A function
 * returning `grid` alone would be the same arithmetic with the interesting half discarded,
 * and nothing downstream could recover it: the mean does not remember what it averaged.
 */
export type TraceResult = {
  /** Ready for `scenes.updateGrid` through `useGridWrite`. Square cells, like every other. */
  grid: Grid
  /** Pixels per square measured **across** the box: `box.width / across`. */
  sizeAcross: number
  /** Pixels per square measured **down** the box: `box.height / down`. */
  sizeDown: number
  /**
   * `|sizeAcross − sizeDown| / gridSize` — so `0.003` reads as "three tenths of a percent
   * out". A fraction rather than a percentage because it is compared to
   * `OUT_OF_SQUARE_THRESHOLD`, and the multiplication by a hundred belongs next to the `%`
   * sign that explains it.
   */
  outOfSquare: number
}

/**
 * A count of printed squares the DM could actually have traced over.
 *
 * `Number.isInteger` is doing three jobs at once, and they are worth naming because the
 * three failures arrive from different places: a fractional count is a typo, `NaN` is an
 * empty or half-typed field, and `Infinity` is nothing a person types and everything
 * `Number()` makes of a long enough run of digits.
 */
function isSquareCount(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/**
 * The offset a traced edge implies, and **the whole of the offset solve**.
 *
 * There is nothing to iterate here and nothing to fit. `gridLines` draws at
 * `offset + k × gridSize` and walks back to the largest multiple at or before zero, so every
 * member of the congruence class of `box.x` modulo `gridSize` names the *same set of lines*
 * — and the traced edge sits on a printed line by construction, because lining it up with
 * one is the entire gesture. So the offset **is** the modulus. Scoring candidate offsets
 * against the image, which is what an alignment tool that "fits" a grid does, would be a
 * slower and less certain way of arriving at the number this one expression already holds.
 *
 * ⚠️ **Double modulus, because a box traced off the top-left of the image is legal.**
 * `gridBox.ts` says so in as many words — the DM drags our origin onto a printed one and
 * negatives are normal — and JavaScript's `%` keeps the sign of the *dividend*, so
 * `-243 % 140` is `-103`. `((x % n) + n) % n` is the arithmetic modulus, and it is what puts
 * the answer in `[0, gridSize)` whichever side of the image origin the DM traced from.
 */
function offsetOf(edge: number, gridSize: number): number {
  return ((edge % gridSize) + gridSize) % gridSize
}

/**
 * The grid a traced box and two square counts describe, or `null` when they do not yet
 * describe one.
 *
 * ⚠️ **`null` rather than a clamp, and it is `useGridWrite`'s existing sentence rather than
 * a new decision**: a half-typed count parses to `NaN` and an empty field is nothing at all,
 * and *the DM is mid-keystroke, not wrong*. Clamping would answer a question nobody has
 * finished asking and write a grid nobody traced. `dragBox` next door clamps instead, and
 * the difference is where the input comes from — a pointer delta is always a number, a typed
 * count is a string until it is not.
 *
 * Three refusals, and each of them can genuinely fire:
 *
 * - **A count that is not a positive whole number.** Half a square is not something you can
 *   count off a printed map.
 * - **A box with no area, or one handed over inside out.** This one looks like tidiness and
 *   is load-bearing: a box of zero *width* still has a height, so the mean of the two
 *   measurements can land comfortably inside `isUsableGrid` and write a grid derived from
 *   one axis and a division by zero on the other.
 * - **A `gridSize` outside `isUsableGrid`.** Four squares traced over a thumbnail, or one
 *   square traced over the whole map — the same bound the typed field and the drag handles
 *   are held to, asked with the same function.
 *
 * ⚠️ **There is deliberately no fourth guard for a non-finite corner**, even though a
 * non-finite input does return `null`. `offsetOf` turns an infinity into `NaN` and
 * `isUsableGrid` tests both offsets for finiteness as well as testing the size for range, so
 * a `Number.isFinite` pass over `box.x` and `box.y` above would be a guard that cannot fail
 * — which this codebase does not keep. The postcondition still holds by construction and is
 * the one `gridBox.finite` states for a drag: **a trace can never produce a grid
 * `scenes.updateGrid` would refuse.**
 */
export function gridFromTrace(box: Rect, across: number, down: number): TraceResult | null {
  if (!isSquareCount(across) || !isSquareCount(down)) return null

  // Negated rather than written `<= 0`, so a `NaN` extent is refused here rather than
  // falling through to the range test three lines down and arriving as a mystery.
  if (!(box.width > 0) || !(box.height > 0)) return null

  const sizeAcross = box.width / across
  const sizeDown = box.height / down

  // ⭐ The mean, and this single line is what the note at the top of the file is about.
  // Everything else in this function exists so that the DM finds out it was taken.
  const gridSize = (sizeAcross + sizeDown) / 2

  const grid: Grid = {
    gridSize,
    gridOffsetX: offsetOf(box.x, gridSize),
    gridOffsetY: offsetOf(box.y, gridSize),
  }

  if (!isUsableGrid(grid)) return null

  return {
    grid,
    sizeAcross,
    sizeDown,
    outOfSquare: Math.abs(sizeAcross - sizeDown) / gridSize,
  }
}
