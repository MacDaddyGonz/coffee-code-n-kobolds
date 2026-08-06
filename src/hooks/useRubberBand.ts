import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

import { useStagePointer } from '@/hooks/useStagePointer'
import type { Point } from '@convex/lib/grid'

/** Where a gesture started and where the pointer is now, both in image space. */
export type Band = { from: Point; to: Point }

export type RubberBandOptions = {
  /**
   * Whether the tool is in the DM's hand. A gesture in flight when this goes false is
   * **abandoned, not committed** — the DM reached for another control while holding the
   * mouse, which is not a decision about where the rectangle goes, and a band left on screen
   * with no listeners behind it is one that never lands and never leaves.
   */
  enabled: boolean
  /**
   * What to do with the finished gesture, in image space and un-normalised — `from` is
   * where the press landed and `to` is where the button came up, in whichever of the four
   * directions the DM dragged. Normalising is the caller's, because a fog rectangle snaps to
   * the grid and a trace box does not.
   *
   * ⚠️ **Its identity does not matter, and that is deliberate.** It is held in a ref that
   * every render refreshes, so the two `window` listeners below bind once per gesture rather
   * than once per render. That is not a nicety: `setBand` fires on every `mousemove`, so an
   * effect depending on this callback would tear down and re-add both listeners sixty times a
   * second for the length of every drag. `FogLayer` used to avoid that by taking one stable
   * member off `useLobbyAction` instead of the object — a discipline every future caller
   * would have had to know about and none would have been told. Making the hook robust is
   * the version of that fix which cannot be got wrong by the next caller.
   */
  onCommit: (band: Band) => void
}

export type RubberBand = {
  /** Wire to the `onMouseDown` of whatever surface the gesture is drawn on. Stable. */
  begin: (event: Konva.KonvaEventObject<MouseEvent>) => void
  /** The live gesture, for the preview. `null` when nothing is in flight. */
  band: Band | null
}

/**
 * THE DRAG-A-BOX GESTURE OVER THE MAP, ONCE.
 *
 * Two points and a live preview, on top of `useStagePointer`'s plumbing. The fog tool draws
 * a rectangle with it and the grid tracer draws a measuring box with it; the wall tool takes
 * the layer below instead, because a polyline is a different lifecycle rather than this one
 * with more points.
 *
 * **One commit per gesture, on release, un-throttled** — which is the opposite of a token
 * drag and is the right opposite. Invariant 2 asks for ten writes a second on a coin so that
 * everybody watches it move; nobody wants to watch a rectangle rubber-band on somebody else's
 * screen, and neither of these gestures has an intermediate state anyone at the table needs.
 * So the band is local until the mouse comes up.
 *
 * The hook holds no opinion about what the band *means*. It does not snap, does not normalise
 * negative extents, and does not drop a zero-area gesture — all three differ between the two
 * callers, and a hook that guessed would be wrong for one of them.
 */
export function useRubberBand({ enabled, onCommit }: RubberBandOptions): RubberBand {
  const { press, track, release } = useStagePointer()

  /**
   * The gesture, twice: in state so the preview redraws, and in a ref so the handlers on
   * `window` read where the pointer *is* rather than where it was when they were attached.
   */
  const [band, setBand] = useState<Band | null>(null)
  const bandRef = useRef<Band | null>(null)

  // See the note on `onCommit` above. Refreshed on every render, read only when the button
  // comes up, so the listener effect below can depend on nothing that moves.
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  const begin = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const point = press(event)
      if (point === null) return

      bandRef.current = { from: point, to: point }
      setBand(bandRef.current)
    },
    [press],
  )

  const banding = band !== null

  useEffect(() => {
    if (!banding) return

    const move = (event: MouseEvent) => {
      const point = track(event)
      const current = bandRef.current
      if (point === null || current === null) return
      bandRef.current = { from: current.from, to: point }
      setBand(bandRef.current)
    }

    const commit = () => {
      const gesture = bandRef.current
      bandRef.current = null
      setBand(null)
      release()
      if (gesture !== null) commitRef.current(gesture)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', commit)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', commit)
    }
  }, [banding, track, release])

  // Putting the tool down mid-drag abandons the band. See `enabled` above.
  useEffect(() => {
    if (enabled) return
    bandRef.current = null
    setBand(null)
    release()
  }, [enabled, release])

  return { begin, band }
}
