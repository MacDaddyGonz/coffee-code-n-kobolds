// Shared by the Convex functions and the browser, like lib/codes.ts and for the
// same reason: there must be exactly one definition of where a square is. The
// client imports this through the `@convex/…` alias rather than keeping a copy,
// so an optimistic update and the value the server commits cannot disagree about
// which square a token landed on.
//
// Deliberately free of Convex and React imports. Everything here is pure and
// works on a plain `Grid`, not a `Doc<'scenes'>`, so it is trivially testable and
// callable before a scene document exists.

/** Sane bounds for a hand-calibrated grid, in image-space pixels per square. */
export const MIN_GRID_SIZE = 4
export const MAX_GRID_SIZE = 2000

/** The smallest and largest token, measured in squares across. */
export const MIN_TOKEN_SQUARES = 1
export const MAX_TOKEN_SQUARES = 8

/**
 * Everything the grid maths needs from a scene. Taking this rather than the whole
 * scene document keeps the functions callable from the calibrator, which is
 * working with values the DM has typed but not yet saved.
 */
export type Grid = {
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
}

export type Point = { x: number; y: number }

/** Pixel extent of something rectangular — an image, a viewport, a scaled fit. */
export type Size = { width: number; height: number }

/** Column and row, zero-based, and freely negative — a map's grid may start off-image. */
export type Cell = { col: number; row: number }

/**
 * A rectangle in image space: top-left corner plus extent. What a fog-of-war row holds.
 *
 * Distinct from `Size` above rather than composed with it, because the two mean different
 * things — a `Size` is how big something is, with no position, and is what a viewport and a
 * scaled fit are. A `Rect` is a region *somewhere*, and only the latter can contain a point.
 */
export type Rect = { x: number; y: number; width: number; height: number }

/**
 * Is this point inside this rectangle?
 *
 * **Half-open on the far edges** — inclusive of the top-left, exclusive of the bottom-right
 * — so that rectangles sharing an edge tile without a seam and without both claiming the
 * line between them. Two abutting fog rectangles are one continuous dark region rather than
 * one with a one-pixel-wide double coverage down the middle, and a token standing exactly on
 * the boundary belongs to exactly one of them.
 *
 * ⚠️ **This fails *open* on a non-finite coordinate, and the choice is deliberate.** Every
 * NaN comparison is false, so a token whose stored `x` is NaN is covered by no rectangle and
 * is never fogged. `requireFinite` guards every write that could produce one, but
 * convex-test does not apply Convex's own value validation — so the test suite is precisely
 * where such a row can exist, and a fog test over it would silently answer "visible".
 *
 * Left fail-open rather than clamped to true because a token standing nowhere is not
 * standing in the fog, and because the secret a DM actually relies on is held by the *layer*
 * — a creature that must not be known about goes on the GM layer, where no arithmetic
 * decides anything. This is the only fail-open branch in the fog design, and it is the one
 * place where fog being a convenience rather than a guarantee is written into the code
 * instead of into an ADR.
 */
export function rectCovers(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

/** Is this point inside any of them? The whole of "is this token standing in the dark". */
export function anyRectCovers(rects: readonly Rect[], point: Point): boolean {
  return rects.some((rect) => rectCovers(rect, point))
}

/**
 * Pixels per square from a square count across the image width.
 *
 * This is the calibration entry point, and it exists because the answer is often
 * exact: the sample map `Admittance [Gridded 16x12]` is 2240 px wide across 16
 * squares, which is 140.00 on the nose, and 1680 / 140 is 12.00 down. Returning a
 * float rather than rounding is what makes that hold — a rounded 139 accumulates
 * to a full square of error by the far edge of the map.
 */
export function gridSizeFor(imageWidth: number, squaresAcross: number): number {
  return imageWidth / squaresAcross
}

/** The inverse, for showing the DM how many squares tall their calibration makes the map. */
export function squaresDown(imageHeight: number, gridSize: number): number {
  return imageHeight / gridSize
}

/**
 * Which cell a token of this size occupies, given its centre.
 *
 * An even-sized token centres on a grid *intersection* rather than a square, so
 * the half-square offset that recovers its cell differs by parity. `snapToGrid`
 * and this function are inverses over the snapped positions, which is what lets
 * arrow-key movement be defined as "recover the cell, add one, snap again" without
 * accumulating drift.
 */
export function cellOf(point: Point, grid: Grid, sizeSquares: number): Cell {
  const half = sizeSquares / 2
  return {
    col: Math.round((point.x - grid.gridOffsetX) / grid.gridSize - half),
    row: Math.round((point.y - grid.gridOffsetY) / grid.gridSize - half),
  }
}

/** The centre point of the cell a token of this size would occupy at (col, row). */
export function centreOfCell(cell: Cell, grid: Grid, sizeSquares: number): Point {
  const half = sizeSquares / 2
  return {
    x: grid.gridOffsetX + (cell.col + half) * grid.gridSize,
    y: grid.gridOffsetY + (cell.row + half) * grid.gridSize,
  }
}

/**
 * Put a loose position onto the grid. **The** snap: the server applies it on every
 * settling write, and the client applies the same one optimistically, so a dropped
 * token cannot come to rest between squares even if the client's arithmetic were
 * wrong or skipped entirely.
 *
 * A 1×1 token lands on a square's centre. A 2×2 lands on a square *corner*, so it
 * covers four whole squares rather than straddling eight halves. That falls out of
 * the half-square offset rather than needing a special case.
 */
export function snapToGrid(point: Point, grid: Grid, sizeSquares: number): Point {
  return centreOfCell(cellOf(point, grid, sizeSquares), grid, sizeSquares)
}

/**
 * Move a token a whole number of squares — the arrow keys.
 *
 * Snaps first and moves second, deliberately. A position left off-grid by an
 * interrupted drag is corrected by the first keypress rather than carrying its
 * offset along for every square after, which is what makes "arrow keys always
 * leave the token on a square" true unconditionally rather than only when the
 * previous move happened to be a clean drop.
 */
export function moveByCells(
  point: Point,
  grid: Grid,
  sizeSquares: number,
  delta: Cell,
): Point {
  const from = cellOf(point, grid, sizeSquares)
  return centreOfCell(
    { col: from.col + delta.col, row: from.row + delta.row },
    grid,
    sizeSquares,
  )
}

/**
 * True when the numbers describe a grid that can actually be drawn. Guards the
 * calibrator's inputs before they reach the database: a zero or negative
 * `gridSize` makes `cellOf` divide by zero and hands `Infinity` to the position
 * table, and a NaN from an empty input field is a valid Convex number that
 * poisons every snap thereafter.
 */
export function isUsableGrid(grid: Grid): boolean {
  return (
    Number.isFinite(grid.gridSize) &&
    grid.gridSize >= MIN_GRID_SIZE &&
    grid.gridSize <= MAX_GRID_SIZE &&
    Number.isFinite(grid.gridOffsetX) &&
    Number.isFinite(grid.gridOffsetY)
  )
}

/** Token sizes the board can render, guarding `addToken` the same way. */
export function isUsableTokenSize(sizeSquares: number): boolean {
  return (
    Number.isInteger(sizeSquares) &&
    sizeSquares >= MIN_TOKEN_SQUARES &&
    sizeSquares <= MAX_TOKEN_SQUARES
  )
}

/**
 * The lines to draw for a visible grid, clipped to the image. Returned as offsets
 * rather than Konva shapes so this stays free of rendering imports and testable.
 *
 * A grid whose offset puts the first line outside the image is normal — the DM
 * nudges the offset to line ours up with a printed one — so the first line is
 * walked back to the largest multiple at or before zero.
 */
export function gridLines(
  grid: Grid,
  imageWidth: number,
  imageHeight: number,
): { vertical: number[]; horizontal: number[] } {
  if (!isUsableGrid(grid)) return { vertical: [], horizontal: [] }

  const start = (offset: number) => offset - Math.ceil(offset / grid.gridSize) * grid.gridSize

  const vertical: number[] = []
  for (let x = start(grid.gridOffsetX); x <= imageWidth; x += grid.gridSize) {
    if (x >= 0) vertical.push(x)
  }

  const horizontal: number[] = []
  for (let y = start(grid.gridOffsetY); y <= imageHeight; y += grid.gridSize) {
    if (y >= 0) horizontal.push(y)
  }

  return { vertical, horizontal }
}
