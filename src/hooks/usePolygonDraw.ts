import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

import { useStagePointer } from '@/hooks/useStagePointer'
import type { Point } from '@convex/lib/grid'
import { MAX_FOG_POLYGON_POINTS } from '@convex/lib/limits'

export type PolygonDrawOptions = {
  /**
   * Whether the tool is in the DM's hand. A polygon in progress when this goes false is
   * **abandoned, not committed** — `useRubberBand`'s clause, word for word and for the same
   * reason: reaching for another control is not a decision about where the shape goes, and a
   * half-drawn outline left on screen with no listeners behind it never lands and never
   * leaves.
   */
  enabled: boolean
  /**
   * Where a vertex actually goes, given where the pointer was. `FogLayer` passes the grid
   * snap; a caller that wants free-hand vertices passes nothing.
   *
   * Applied to the **live cursor as well as the committed vertices**, which is what makes the
   * preview honest: the DM watches the outline that will be written rather than a smooth one
   * that jumps to the grid on the last click. `snappedRect` makes the same call for the band.
   */
  snap?: (point: Point) => Point
  /**
   * What to do with the finished outline, in image space, in click order and **not**
   * normalised — winding is not a thing `polygonCovers` has an opinion about, so nothing here
   * reorders anything.
   *
   * ⚠️ **Its identity does not matter**, for `useRubberBand`'s reason exactly: it is held in a
   * ref that every render refreshes, so the `window` listeners below bind once per gesture
   * rather than once per `mousemove`.
   */
  onCommit: (points: Point[]) => void
}

export type PolygonDraw = {
  /** Wire to the `onMouseDown` of the surface the outline is drawn on. Stable. */
  add: (event: Konva.KonvaEventObject<MouseEvent>) => void
  /** Close the outline and commit it. The double-click and the first-vertex click. Stable. */
  close: () => void
  /** The vertices so far, snapped. Empty when nothing is in progress. */
  points: readonly Point[]
  /** Where the next vertex would land, for the elastic segment. `null` before the first click. */
  cursor: Point | null
}

/** Two points that snapped to the same square. See `close`. */
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Held still so abandoning twice is one render rather than two.
 *
 * `useRubberBand` gets this for free because its empty state is `null`, which React compares
 * by identity and bails on. A fresh `[]` never bails — so a board where nobody is drawing
 * would re-render every time the tool changed, for a value that was already empty.
 */
const NO_POINTS: readonly Point[] = []

/**
 * THE CLICK-A-VERTEX-AT-A-TIME OUTLINE OVER THE MAP.
 *
 * ⚠️ **The second gesture built on `useStagePointer`, and deliberately not a third setting of
 * `useRubberBand`.** That hook is two points and a live second one: press, drag, release, one
 * commit. A polygon is a *different lifecycle* — an unbounded number of discrete clicks, a
 * live segment between the last one and the cursor, and two separate ways to finish — and the
 * mouse button is not held down for any of it. Teaching the band about vertices would give
 * both callers a `mode` and give the fog tool a hook whose `onCommit` fires on `mouseup`
 * sometimes and on a double-click other times. `useStagePointer`'s own docblock predicted this
 * split before either polygon or wall existed: *the wall tool takes this and builds a
 * polyline, which is what makes it a variant of the gesture rather than a fourth copy of it.*
 *
 * **Three ways out, and all three are needed.**
 *
 * - **Clicking the first vertex** is the one people reach for, and it is why `FogLayer` draws
 *   a grab handle there rather than measuring a distance in image space. A radius would have
 *   to be divided by the camera scale to stay a constant number of screen pixels, which is a
 *   second definition of "near enough" living beside the one Konva's hit graph already has.
 * - **Double-clicking** is the other one people reach for, and it costs a duplicate vertex —
 *   the second press of the pair lands before `dblclick` fires. `close` drops trailing
 *   duplicates rather than the surface trying to suppress the press, because a press that was
 *   swallowed on suspicion of being half a double-click is a vertex that sometimes does not
 *   appear.
 * - **Escape abandons**, which is `GridCalibrator`'s key and the only way out that does not
 *   write anything. Bound only while an outline is in progress, so this hook adds no listener
 *   to a board where nobody is drawing.
 *
 * ⚠️ **The vertex cap IS here, and it is the one place this hook departs from `FogTools`'
 * argument about the shape cap.** That panel refuses to import a bound for one integer and
 * lets `fog.draw`'s refusal arrive as a toast naming the way out, because the shape cap is met
 * after two hundred *successful* draws and the DM loses nothing by discovering it late.
 *
 * A vertex cap is met **during one gesture**, and losing it late means losing the gesture:
 * forty corners traced round a cave, a toast on release, and no way to get the outline back.
 * So the thirty-third click is refused as it happens. The constant moved to
 * `convex/lib/limits.ts` to make that possible — the file whose whole job is a bound both
 * sides need — and the server's copy is still the enforcement, exactly as CLAUDE.md invariant
 * 6 has it: the browser's is a courtesy that saves a round trip.
 */
export function usePolygonDraw({ enabled, snap, onCommit }: PolygonDrawOptions): PolygonDraw {
  const { press, track, release } = useStagePointer()

  /**
   * The outline, twice: in state so the preview redraws, and in a ref so the `window`
   * handlers read the vertices as they *are* rather than as they were when they bound.
   * `useRubberBand` splits its band the same way and for the same reason.
   */
  const [points, setPoints] = useState<readonly Point[]>(NO_POINTS)
  const pointsRef = useRef<readonly Point[]>(NO_POINTS)
  const [cursor, setCursor] = useState<Point | null>(null)

  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  // Snapping is a prop, so it is refreshed the same way — otherwise every effect below would
  // depend on a function identity that changes whenever the scene row does.
  const snapRef = useRef(snap)
  snapRef.current = snap

  const place = useCallback((point: Point): Point => {
    const apply = snapRef.current
    return apply === undefined ? point : apply(point)
  }, [])

  const forget = useCallback(() => {
    pointsRef.current = NO_POINTS
    setPoints(NO_POINTS)
    setCursor(null)
    release()
  }, [release])

  /**
   * Finish the outline. **Trailing duplicates are dropped here**, which is what makes
   * double-clicking work without the surface having to guess which presses are halves of one.
   *
   * Fewer than three surviving vertices commits nothing and clears — a double-click on bare
   * map is one point twice, and `fog.draw` would refuse it anyway with a message about corners
   * that the DM did not need to read to know that two clicks are not a shape.
   */
  const close = useCallback(() => {
    const drawn: Point[] = []
    for (const point of pointsRef.current) {
      const last = drawn[drawn.length - 1]
      if (last !== undefined && samePoint(last, point)) continue
      drawn.push(point)
    }
    // The same duplicate at the seam, for a DM who closed the shape by clicking the square
    // they started in rather than the marker on it. A polygon is closed by definition — the
    // stored point list never repeats its first vertex — so a repeated one is a corner with
    // no angle at it, counting against the cap for nothing.
    if (drawn.length > 1 && samePoint(drawn[0], drawn[drawn.length - 1])) drawn.pop()

    forget()
    if (drawn.length >= 3) commitRef.current(drawn)
  }, [forget])

  const add = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const point = press(event)
      if (point === null) return

      const placed = place(point)
      const last = pointsRef.current[pointsRef.current.length - 1]
      // A second click in the same square is not a second corner. Dropped rather than stored,
      // so the count the server sees is the count the DM drew — the cap is on corners, and a
      // wobble is not one.
      if (last !== undefined && samePoint(last, placed)) return

      // ⚠️ **The cap is refused as it is reached rather than on release, and that is the whole
      // reason `MAX_FOG_POLYGON_POINTS` lives in lib/limits.ts instead of beside the shape
      // count in lib/games.ts.** `fog.draw` refuses an over-long outline too and that refusal
      // is the enforcement — a client-side bound is a bound a client bug removes (invariant 6's
      // rule, and invariant 7's). But it arrives on *release*, by which point the DM has drawn
      // forty corners round a cave and gets a toast and nothing else: the outline is gone and
      // there is no way to get it back. Stopping here costs them one click that does nothing
      // and keeps the thirty-two they have.
      //
      // Silent rather than toasted, for `useRubberBand`'s reason about a zero-area drag: the
      // preview *is* the feedback, and a corner that does not appear is a corner that was not
      // taken. The panel carries the number so it is not a surprise.
      if (pointsRef.current.length >= MAX_FOG_POLYGON_POINTS) return

      pointsRef.current = [...pointsRef.current, placed]
      setPoints(pointsRef.current)
      setCursor(placed)
    },
    [place, press],
  )

  const drawing = points.length > 0

  // The elastic segment. `window` rather than the Konva shape for `useStagePointer`'s reason:
  // an outline traced round the edge of the map runs the pointer off the canvas, and a
  // preview that freezes there reads as the tool having stopped working.
  useEffect(() => {
    if (!drawing) return

    const move = (event: MouseEvent) => {
      const point = track(event)
      if (point === null) return
      setCursor(place(point))
    }

    window.addEventListener('mousemove', move)
    return () => {
      window.removeEventListener('mousemove', move)
    }
  }, [drawing, place, track])

  // Escape abandons. Bound only while something is in progress, so a board nobody is drawing
  // on carries no key listener — and `BoardKeys`' own bindings are untouched the rest of the
  // time, which is what stops this stealing the key that leaves grid calibration.
  useEffect(() => {
    if (!drawing) return

    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      forget()
    }

    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
    }
  }, [drawing, forget])

  // Putting the tool down mid-outline abandons it. See `enabled` above.
  useEffect(() => {
    if (enabled) return
    forget()
  }, [enabled, forget])

  return { add, close, points, cursor }
}
