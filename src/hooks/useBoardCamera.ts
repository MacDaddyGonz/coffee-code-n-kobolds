import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

import type { Id } from '@convex/_generated/dataModel'
import type { Camera, Size } from '@/lib/camera'
import {
  WHEEL_STEP,
  clampCamera,
  fitCamera,
  nextPreset,
  zoomAbout,
  zoomTo,
} from '@/lib/camera'
import { getCamera, rememberCamera } from '@/lib/session'

/**
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set — the browser's
 * long-standing way of reporting it — but as a continuous stream of small deltas
 * rather than one event per detent. Applying the wheel's 10% a notch to each of
 * them makes a gentle pinch fly to the zoom limit, so the step is much finer and
 * the gesture's own speed supplies the rest.
 */
const PINCH_STEP = 1.02

export type BoardCamera = {
  camera: Camera
  setCamera: (next: Camera) => void
  zoomBy: (direction: 1 | -1) => void
  zoomToScale: (scale: number) => void
  fit: () => void
  reset: () => void
  panBy: (dx: number, dy: number) => void
  onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  /** True while the space bar is held, so the stage can pan instead of dragging a token. */
  spacePanning: boolean
}

/** Space is a pan modifier on the board, but it is still a space bar in a text field. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    // A focused button treats space as a click, and swallowing it would break
    // every control in the DM panel.
    target instanceof HTMLButtonElement
  )
}

/**
 * Pan and zoom for one scene, held per browser.
 *
 * The camera is never written to Convex. Everybody looks where they like: the DM
 * zoomed into a corridor while a player takes in the whole floor is the point of
 * the feature, not two clients out of step. It is remembered in local storage per
 * `(code, sceneId)` so switching scenes and coming back does not lose your place,
 * and a scene with nothing remembered opens fitted.
 *
 * Everything the hook offers is expressed in one of two coordinate systems and it
 * matters which: `panBy` takes screen pixels because its callers are a drag and an
 * arrow key, while the camera it produces is what turns those into the image-space
 * positions the database stores. See the note at the top of `@/lib/camera`.
 */
export function useBoardCamera({
  code,
  sceneId,
  image,
  viewport,
}: {
  code: string
  sceneId: Id<'scenes'> | null
  image: Size | null
  viewport: Size
}): BoardCamera {
  const [camera, setRenderedCamera] = useState<Camera>({ scale: 1, x: 0, y: 0 })
  const [spacePanning, setSpacePanning] = useState(false)

  // Depended on as numbers rather than as the objects, so a parent that rebuilds
  // its `viewport` literal every render does not invalidate every callback here.
  const imageWidth = image?.width ?? 0
  const imageHeight = image?.height ?? 0
  const { width: viewportWidth, height: viewportHeight } = viewport

  // The authoritative camera. React state lags by a render, and a wheel spin
  // delivers several events between two paints, so a handler reading `camera`
  // would compute every one of them from the same starting point and throw all
  // but the last away.
  const cameraRef = useRef<Camera>(camera)
  const frameRef = useRef<number | null>(null)

  // Which scene the camera has been established for. Both the image dimensions
  // and the viewport are measured asynchronously, so this waits for them rather
  // than fitting against a 0×0 viewport and calling it done.
  const settledFor = useRef<string | null>(null)

  const commit = useCallback(
    (next: Camera) => {
      cameraRef.current = next
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null

        // Bounded here, where the camera lands, rather than inside the maths for
        // each event: a soft bound re-applied part-way through a fast gesture is
        // how anchored zoom loses its anchor.
        const bounded =
          imageWidth > 0 && imageHeight > 0
            ? clampCamera(
                cameraRef.current,
                { width: imageWidth, height: imageHeight },
                { width: viewportWidth, height: viewportHeight },
              )
            : cameraRef.current

        cameraRef.current = bounded
        setRenderedCamera(bounded)

        // Written straight out rather than debounced. It is three numbers, once a
        // frame at worst, and a debounce would drop the last gesture of anyone who
        // zooms and immediately closes the tab — which is the one case where
        // remembering the camera was worth anything.
        if (sceneId && settledFor.current === sceneId) {
          rememberCamera(code, sceneId, bounded)
        }
      })
    },
    [code, sceneId, imageWidth, imageHeight, viewportWidth, viewportHeight],
  )

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Restore, or fit. The remembered camera wins, because it is what the viewer
  // last chose; fitting is only the answer for a scene they have not opened yet.
  useEffect(() => {
    if (!sceneId || settledFor.current === sceneId) return
    if (imageWidth <= 0 || imageHeight <= 0) return
    if (viewportWidth <= 0 || viewportHeight <= 0) return

    settledFor.current = sceneId
    const next =
      getCamera(code, sceneId) ??
      fitCamera(
        { width: imageWidth, height: imageHeight },
        { width: viewportWidth, height: viewportHeight },
      )
    cameraRef.current = next
    setRenderedCamera(next)
  }, [code, sceneId, imageWidth, imageHeight, viewportWidth, viewportHeight])

  const setCamera = useCallback((next: Camera) => commit(next), [commit])

  const zoomToScale = useCallback(
    (scale: number) => {
      const centre = { x: viewportWidth / 2, y: viewportHeight / 2 }
      commit(zoomTo(cameraRef.current, centre, scale))
    },
    [commit, viewportWidth, viewportHeight],
  )

  // About the viewport centre, unlike the wheel, because a button press has no
  // meaningful pointer position — the cursor is over the button, off the map.
  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      zoomToScale(nextPreset(cameraRef.current.scale, direction))
    },
    [zoomToScale],
  )

  const fit = useCallback(() => {
    if (imageWidth <= 0 || imageHeight <= 0) return
    commit(
      fitCamera(
        { width: imageWidth, height: imageHeight },
        { width: viewportWidth, height: viewportHeight },
      ),
    )
  }, [commit, imageWidth, imageHeight, viewportWidth, viewportHeight])

  const reset = useCallback(() => {
    // 100% and centred, not 100% about the centre: after a long look at one corner
    // "reset" should put the middle of the map in front of you, otherwise it reads
    // as having only half worked.
    commit({
      scale: 1,
      x: (viewportWidth - imageWidth) / 2,
      y: (viewportHeight - imageHeight) / 2,
    })
  }, [commit, imageWidth, imageHeight, viewportWidth, viewportHeight])

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const current = cameraRef.current
      commit({ scale: current.scale, x: current.x + dx, y: current.y + dy })
    },
    [commit],
  )

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      // Without this the page scrolls behind the canvas while the board zooms,
      // which on a full-height board looks like the whole app jumping.
      e.evt.preventDefault()
      if (e.evt.deltaY === 0) return

      const pointer = e.target.getStage()?.getPointerPosition()
      const step = e.evt.ctrlKey ? PINCH_STEP : WHEEL_STEP
      const factor = e.evt.deltaY > 0 ? 1 / step : step

      // Anchored on the pointer, which is what the whole gesture is for. A stage
      // that has not registered the pointer yet falls back to the centre rather
      // than to (0, 0), where the zoom would visibly lurch to the corner.
      commit(
        zoomAbout(
          cameraRef.current,
          pointer ?? { x: viewportWidth / 2, y: viewportHeight / 2 },
          factor,
        ),
      )
    },
    [commit, viewportWidth, viewportHeight],
  )

  // Held space turns a drag over a token into a pan, so the DM can shift the view
  // without first finding a gap between tokens to grab.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Repeats are ignored so held space stays one gesture rather than
      // re-entering pan mode thirty times a second.
      if (e.code !== 'Space' || e.repeat || isTyping(e.target)) return
      e.preventDefault()
      setSpacePanning(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePanning(false)
    }
    // A window that loses focus mid-hold never sees the keyup, so without this an
    // alt-tab away and back leaves the board stuck in pan mode with no key held
    // and no way to tell what is wrong.
    const release = () => setSpacePanning(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
    }
  }, [])

  return {
    camera,
    setCamera,
    zoomBy,
    zoomToScale,
    fit,
    reset,
    panBy,
    onWheel,
    spacePanning,
  }
}
