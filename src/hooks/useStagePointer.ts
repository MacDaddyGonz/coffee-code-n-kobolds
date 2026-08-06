import { useCallback, useRef } from 'react'
import type Konva from 'konva'

import type { Point } from '@convex/lib/grid'

/**
 * READING IMAGE-SPACE POINTS OUT OF THE MAP STAGE, INCLUDING FROM RAW WINDOW EVENTS.
 *
 * The plumbing under every drag gesture the DM makes over the map, and it is a hook rather
 * than three lines copied into each because this is the third caller. `FogLayer` had it
 * first; the grid tracer needs the same thing; the wall tool needs a variant that keeps
 * pressing rather than releasing. Extracted before the second copy existed rather than
 * after the third, which is the instruction the roadmap gives and the reason it gives it.
 *
 * **Two layers, not one.** This is the plumbing; `useRubberBand` is the two-point band built
 * on it. The wall tool takes *this* and builds a polyline, which is what makes it a variant
 * of the gesture rather than a fourth copy of it.
 *
 * ⚠️ **Why the move and up handlers go on `window` and not on the Konva shape.** A drag that
 * runs off the edge of the canvas should keep going, and should still end when the button
 * comes up somewhere else entirely — fogging the far edge of a map is exactly that drag, and
 * a mouse-up Konva never sees is a gesture that never commits and never clears. `BoardStage`
 * makes the same call for its own pan.
 *
 * ⚠️ **`setPointersPositions` then `getRelativePointerPosition` is not a detour.** It is how
 * a raw browser event is handed to Konva — the same method its own HTML drag-and-drop support
 * uses — and the second call then inverts the **stage's live transform**, which is the camera
 * as it is actually painting rather than as some render was handed it. That is `toImageSpace`
 * with the right numbers, and it is the same reason `useTokenMove.nodePoint` reads a dragged
 * node's own position instead of converting a pointer.
 *
 * Every member is a `useCallback([])`, so the whole object is stable for the lifetime of the
 * component. Callers put `track` and `release` in effect dependency arrays.
 */
export type StagePointer = {
  /**
   * Wire to a shape's `onMouseDown`. Claims the press, remembers the stage, and hands back
   * where it landed in image space — or `null` when the press is not ours to take.
   *
   * Left button only: a right-click is not a gesture, and a middle-drag belongs to the pan,
   * which `BoardStage` claims on the container before Konva hears about it.
   *
   * ⚠️ **It cancels the bubble, and that is what stops the map panning underneath the
   * gesture.** Konva binds the stage's drag with a namespaced `mousedown` listener and the
   * stage is `draggable` so the map can be panned from anywhere, so a press that reaches it
   * starts a pan as well. `TokenHealthBar.swallowLeftPress` is the same trick against the
   * same mechanism one level down.
   */
  press: (event: Konva.KonvaEventObject<MouseEvent>) => Point | null
  /**
   * Where a raw `window` event is, in image space, through the live transform of whichever
   * stage `press` last claimed. `null` before a press, or if the stage cannot answer.
   */
  track: (event: MouseEvent) => Point | null
  /** Forget the stage. Called when a gesture ends, so a stale stage cannot be tracked into. */
  release: () => void
}

export function useStagePointer(): StagePointer {
  const stageRef = useRef<Konva.Stage | null>(null)

  const press = useCallback((event: Konva.KonvaEventObject<MouseEvent>): Point | null => {
    if (event.evt.button !== 0) return null

    const stage = event.target.getStage()
    const point = stage?.getRelativePointerPosition()
    if (!stage || !point) return null

    event.cancelBubble = true
    stageRef.current = stage
    return point
  }, [])

  const track = useCallback((event: MouseEvent): Point | null => {
    const stage = stageRef.current
    if (stage === null) return null

    stage.setPointersPositions(event)
    return stage.getRelativePointerPosition()
  }, [])

  const release = useCallback(() => {
    stageRef.current = null
  }, [])

  return { press, track, release }
}
