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
 * A rectangle in image space: top-left corner plus extent. What a fog-of-war row holds — and
 * since polygons arrived, what a fog-of-war row holds as its **bounding box**. See `Shape`.
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
 * A region of the map that is a rectangle **or** a polygon, which is what a fog row now is.
 *
 * ⚠️ **The four numbers are the bounding box and the point list is the shape**, and once
 * `points` is present the box is derived rather than drawn. `boundsOf` computes it, on the
 * server, on the write path — a client-supplied box that disagrees with its own points is a
 * shape painted on every screen that hides nothing, which is `normaliseFogRect`'s failure
 * arriving through a second door.
 *
 * **Absence means rectangle**, which is CLAUDE.md invariant 9's own convention for a field
 * the schema push forced optional: an optional field already has a spelling for none, and
 * adding a `kind: 'rect' | 'polygon'` discriminator beside it would be two states for one
 * meaning that every reader then has to agree about. (The *argument* to `fog.draw` is a
 * discriminated union, and that is not the same decision — see `fogShapeArgValidator` in
 * lib/fog.ts. A client says which of two gestures it made; a stored row is asked whether it
 * has a point list, and it either does or does not.)
 */
export type Shape = Rect & { points?: readonly Point[] }

/**
 * The smallest rectangle containing every one of these points.
 *
 * **The whole reason a polygon is cheap.** `shapeCovers` compares against this before it
 * looks at a single edge, so a scene of two hundred polygons costs two hundred rectangle
 * tests and a ray-cast for the handful whose box actually contains the point — which on a
 * map where the DM has outlined separate rooms is one, or none. Without it, fog would be
 * `MAX_FOG_POLYGON_POINTS` edge visits per shape per token, on `visiblePositions`, which is
 * the query on the drag path.
 *
 * An empty list has no bounds, so it answers a zero-extent rectangle at the origin — which
 * `rectCovers` then reports as covering nothing at all, and which `requireDrawablePolygon`
 * refuses before it can ever be stored. Fail-closed in the only direction that is available
 * here: an empty polygon is not a region.
 */
export function boundsOf(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Is this point inside this polygon? The crossing-number rule, even-odd.
 *
 * ⚠️⚠️ **THE EDGE CONVENTION HERE IS `rectCovers`' CONVENTION, EXACTLY, AND THAT IS THE
 * KEYSTONE OF THE WHOLE FOG GEOMETRY RATHER THAN A TIDY COINCIDENCE.** A polygon whose four
 * points spell out a rectangle must answer *identically at all four edges and all four
 * corners*, and a rectangle abutting a polygon must tile with no seam and without both of
 * them claiming the line between. Fog that double-claims a line is a token belonging to two
 * shapes; fog that claims neither is a one-pixel corridor of visibility through a wall the DM
 * believes is solid.
 *
 * The convention falls out of two details that look arbitrary and are not:
 *
 * - **`(yi > py) !== (yj > py)`** — a strict `>` on both ends. An edge whose lower vertex sits
 *   exactly on the scan line counts as crossed and one whose upper vertex does not, so a
 *   horizontal ray at `py` passes *through* the top of a shape and *under* the bottom of it.
 *   That is top-inclusive, bottom-exclusive: `point.y >= rect.y && point.y < rect.y + height`.
 * - **`px <` the intersection** — strict, so a point sitting exactly on a left edge has that
 *   edge to its right and is counted, and a point on a right edge has it to the left and is
 *   not. That is left-inclusive, right-exclusive: `point.x >= rect.x && point.x < rect.x + w`.
 *
 * Verified by hand at all four edges and all four corners of a square before it was relied on,
 * and pinned in `grid.test.ts` against `rectCovers` itself rather than against a list of
 * expected booleans — the equivalence is the claim, so the equivalence is what is asserted.
 *
 * **Winding order does not matter**, because the rule counts crossings rather than turns. The
 * DM's polygon tool emits vertices in whatever order they clicked, and there is deliberately
 * nothing anywhere that normalises them.
 *
 * ⚠️ **This is never reached with a non-finite coordinate**, because `shapeCovers` runs the
 * bounds test first and every NaN comparison is false. That ordering is load-bearing and is
 * argued there.
 */
export function polygonCovers(points: readonly Point[], point: Point): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    if ((a.y > point.y) === (b.y > point.y)) continue
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Is this point inside this shape, whichever kind it is? **The** containment test.
 *
 * ⚠️ **`rectCovers` on the bounds runs FIRST, and the order is the design rather than a
 * short-circuit for speed.** Two things depend on it and both are documented soft spots:
 *
 * - **Cost.** The box rejects a polygon in one comparison, so the ray-cast runs only for the
 *   shapes that could possibly contain the point. `boundsOf` carries that arithmetic.
 * - ⚠️ **A NaN never reaches the ray-cast.** `rectCovers` fails *open* on a non-finite
 *   coordinate — every NaN comparison is false — and that behaviour is argued at length on
 *   that function and recorded in ADR 0012 as the one fail-open branch in the fog design.
 *   Putting the polygon test first would give a second, differently-shaped answer to the same
 *   broken input, from a division by `b.y - a.y` that can itself be zero. One test decides,
 *   and it is the one whose failure mode is written down.
 *
 * ⚠️ **Under a covered base that fail-open inverts to fail-closed** — being inside no shape is
 * being in the dark — so a token with a broken position is *withheld* rather than published.
 * ADR 0015 records that for rectangles and it is true of every shape kind for exactly this
 * reason: there is one containment test and the base reads its answer, in `veiled`.
 *
 * A shape with no `points` is a rectangle and the bounds test *is* the whole answer, which is
 * what makes the equivalence in `polygonCovers`' docblock matter: the two kinds have to agree
 * on their edges or a stored rectangle and a hand-drawn one covering the same squares behave
 * differently.
 */
export function shapeCovers(shape: Shape, point: Point): boolean {
  if (!rectCovers(shape, point)) return false
  return shape.points === undefined ? true : polygonCovers(shape.points, point)
}

/** Is this point inside any of them? `anyRectCovers`, for shapes of either kind. */
export function anyShapeCovers(shapes: readonly Shape[], point: Point): boolean {
  return shapes.some((shape) => shapeCovers(shape, point))
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
