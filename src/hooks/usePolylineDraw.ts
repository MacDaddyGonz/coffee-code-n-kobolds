import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

import { useStagePointer } from '@/hooks/useStagePointer'
import type { Point } from '@convex/lib/grid'

export type PolylineDrawOptions = {
  /**
   * Whether the tool is in the DM's hand. A line in progress when this goes false is
   * **abandoned, not committed** — `usePolygonDraw`'s clause and `useRubberBand`'s before
   * it, for the same reason: reaching for another control is not a decision about where the
   * wall goes, and a half-drawn barrier left on screen with no listeners behind it never
   * lands and never leaves.
   */
  enabled: boolean
  /** Where a vertex actually goes. `WallLayer` passes the grid snap; a caller that wants
   * free-hand vertices passes nothing. Applied to the **live cursor as well**, so the DM
   * watches the line that will be written rather than a smooth one that jumps on the last
   * click — `usePolygonDraw`'s note, and `snappedRect`'s before that. */
  snap?: (point: Point) => Point
  /**
   * What to do with the finished line, in image space, in click order and **not**
   * normalised. Winding is not a thing `segmentsIntersect` has an opinion about.
   *
   * ⚠️ **Its identity does not matter**, for `usePolygonDraw`'s reason exactly: it is held
   * in a ref that every render refreshes, so the `window` listeners below bind once per
   * gesture rather than once per `mousemove`.
   */
  onCommit: (points: Point[]) => void
}

export type PolylineDraw = {
  /** Wire to the `onMouseDown` of the surface the line is drawn on. Stable. */
  add: (event: Konva.KonvaEventObject<MouseEvent>) => void
  /** Finish the line and commit it. The double-click and the Enter key. Stable. */
  finish: () => void
  /** The vertices so far, snapped. Empty when nothing is in progress. */
  points: readonly Point[]
  /** Where the next vertex would land, for the elastic segment. `null` before the first. */
  cursor: Point | null
}

/** Two points that snapped to the same square. See `add`. */
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Held still so abandoning twice is one render rather than two — `usePolygonDraw`'s note: a
 * fresh `[]` never bails out of a re-render the way `null` does.
 */
const NO_POINTS: readonly Point[] = []

/**
 * THE CLICK-A-CORNER-AT-A-TIME **LINE** OVER THE MAP.
 *
 * ⚠️⚠️ **THE THIRD GESTURE ON `useStagePointer`, AND THE SECOND-CLOSEST PAIR OF HOOKS IN
 * THIS CODEBASE — SO READ WHY IT IS NOT A SETTING ON `usePolygonDraw`.** That hook and this
 * one have the *same lifecycle*: an unbounded sequence of clicks, a live segment to the
 * cursor, and a way to finish. That is exactly the similarity `useRubberBand` and
 * `usePolygonDraw` do **not** have, and it is why the split had to be argued rather than
 * asserted. Two differences decided it, and only the second one is really about lifecycle:
 *
 * - **Two corners, not three.** A wall between two points is the commonest wall there is —
 *   a doorway, a stretch of corridor — and `usePolygonDraw` discards anything under three
 *   because two points are not a region. A minimum is the sort of thing that *could* be a
 *   number passed in, and on its own it would not have justified a second file.
 * - ⭐ **A repeated first-and-last vertex is meaningful here and redundant there.**
 *   `usePolygonDraw.close` drops it, correctly: a polygon is closed by definition, so a
 *   corner with no angle at it counts against the cap for nothing. A wall is a polyline that
 *   `pathCrossesAnyWall` deliberately does *not* close, so clicking back onto the corner you
 *   started at is **how a DM seals a room** — and a hook that dropped that vertex would put a
 *   doorway in every sealed room in the game, along a wall nobody drew and nothing shows.
 *
 * A flag switching that behaviour would be a hook whose output means one thing or the
 * opposite depending on an argument, on the one gesture where the wrong answer is invisible
 * on screen. So: two files, and this paragraph. **What would merge them** is a third caller
 * wanting either shape, at which point the right refactor is a shared vertex-collecting
 * primitive under both rather than a `mode` on one of them.
 *
 * **Three ways out, and they are not `usePolygonDraw`'s three.**
 *
 * - **Double-clicking** finishes, and it costs a duplicate vertex — the second press of the
 *   pair lands before `dblclick` fires. Dropped in `finish` rather than suppressed at the
 *   surface, because a press swallowed on suspicion of being half a double-click is a corner
 *   that sometimes does not appear. ⚠️ Only a *trailing* duplicate of the immediately
 *   preceding vertex is dropped, never a repeat of the **first** one — that is the seam a
 *   sealed room is made of.
 * - **Enter** finishes too, and it exists because this hook has no grab handle to offer.
 *   `usePolygonDraw`'s first-vertex circle *is* its close gesture; here clicking that vertex
 *   is a legitimate corner, so the affordance had to go somewhere that is not on the map.
 * - **Escape abandons**, which is `usePolygonDraw`'s key and `GridCalibrator`'s. Both key
 *   listeners are bound only while a line is in progress, so this hook adds nothing to a
 *   board nobody is drawing on.
 *
 * **There is no vertex cap here**, which is `usePolygonDraw`'s decision and `FogTools`'
 * before it: the number lives in `convex/lib/games.ts`, a server module carrying `requireDm`,
 * and importing it for one integer would put that in the bundle. The refusal is the server's
 * and arrives as a toast naming the way out — draw it as two walls — at the moment it
 * applies.
 */
export function usePolylineDraw({ enabled, snap, onCommit }: PolylineDrawOptions): PolylineDraw {
  const { press, track, release } = useStagePointer()

  /**
   * The line, twice: in state so the preview redraws, and in a ref so the `window` handlers
   * read the vertices as they *are* rather than as they were when they bound.
   * `usePolygonDraw` and `useRubberBand` both split the same way and for the same reason.
   */
  const [points, setPoints] = useState<readonly Point[]>(NO_POINTS)
  const pointsRef = useRef<readonly Point[]>(NO_POINTS)
  const [cursor, setCursor] = useState<Point | null>(null)

  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

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
   * Finish the line. **Only a trailing duplicate of the vertex before it is dropped**, which
   * is what makes double-clicking work without the surface having to guess which presses are
   * halves of one — and is deliberately narrower than `usePolygonDraw.close`, which also
   * drops a repeat of the first vertex. Here that repeat is the seal on a closed room.
   *
   * Fewer than two surviving corners commits nothing and clears. A double-click on bare map
   * is one point twice, and `walls.add` would refuse it anyway with a message about corners
   * that the DM did not need to read to know that one click is not a wall.
   */
  const finish = useCallback(() => {
    const drawn: Point[] = []
    for (const point of pointsRef.current) {
      const last = drawn[drawn.length - 1]
      if (last !== undefined && samePoint(last, point)) continue
      drawn.push(point)
    }

    forget()
    if (drawn.length >= 2) commitRef.current(drawn)
  }, [forget])

  const add = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const point = press(event)
      if (point === null) return

      const placed = place(point)
      const last = pointsRef.current[pointsRef.current.length - 1]
      // A second click in the same square is not a second corner. Dropped rather than
      // stored, so the count the server sees is the count the DM drew.
      if (last !== undefined && samePoint(last, placed)) return

      pointsRef.current = [...pointsRef.current, placed]
      setPoints(pointsRef.current)
      setCursor(placed)
    },
    [place, press],
  )

  const drawing = points.length > 0

  // The elastic segment. `window` rather than the Konva shape for `useStagePointer`'s
  // reason: a wall traced round the edge of the map runs the pointer off the canvas, and a
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

  // Enter finishes and Escape abandons, both bound only while something is in progress — so
  // a board nobody is drawing on carries no key listener, and `useBoardKeys`' own bindings
  // are untouched the rest of the time.
  useEffect(() => {
    if (!drawing) return

    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        forget()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        finish()
      }
    }

    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
    }
  }, [drawing, forget, finish])

  // Putting the tool down mid-line abandons it. See `enabled` above.
  useEffect(() => {
    if (enabled) return
    forget()
  }, [enabled, forget])

  return { add, finish, points, cursor }
}
