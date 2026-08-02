import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

import type { Id } from '@convex/_generated/dataModel'
import type { Size } from '@convex/lib/grid'
import type { Camera } from '@/lib/camera'
import {
  WHEEL_STEP,
  clampCamera,
  fitCamera,
  nextPreset,
  zoomAbout,
  zoomTo,
} from '@/lib/camera'
import { getCamera, rememberCamera } from '@/lib/session'
import { PERSIST_DELAY_MS } from '@/lib/throttle'
import { isTypingElement } from '@/lib/utils'

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
  /** The measured canvas, which the stage needs and the camera is fitted against. */
  viewport: Size
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

/**
 * Pan and zoom for one scene, held per browser.
 *
 * The camera is never written to Convex. Everybody looks where they like: the DM
 * zoomed into a corridor while a player takes in the whole floor is the point of
 * the feature, not two clients out of step. It is remembered in local storage per
 * `(code, sceneId)` so switching scenes and coming back does not lose your place,
 * and a scene with nothing remembered opens fitted.
 *
 * The viewport is measured here, from the container it is handed, rather than
 * reported in by whoever draws the canvas. It is the camera that needs it — to fit
 * a map to and to zoom about the centre of — so a stage measuring it into its own
 * state and pushing it up through a callback was one fact of layout living in two
 * pieces of React state with an effect keeping them in step.
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
  containerRef,
}: {
  code: string
  sceneId: Id<'scenes'> | null
  image: Size | null
  /** The element whose size *is* the viewport. Measured, not asked about. */
  containerRef: RefObject<HTMLElement | null>
}): BoardCamera {
  const [camera, setRenderedCamera] = useState<Camera>({ scale: 1, x: 0, y: 0 })
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })
  const [spacePanning, setSpacePanning] = useState(false)

  // Depended on as numbers rather than as the objects, so neither a parent that
  // rebuilds its `image` literal every render nor a resize that reports the same
  // box twice invalidates every callback here.
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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      // Same numbers, same object. A resize observer fires on layout that did not
      // change the box, and a fresh object each time would re-fit the camera and
      // rebuild every callback below on a frame where nothing moved.
      setViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  // The camera waiting to be written, carrying the keys it belongs under rather
  // than reading them from a closure. A flush that fires after the DM has switched
  // maps then still writes the old scene's camera to the old scene's key, instead
  // of stamping it over the new one.
  const dueRef = useRef<{ code: string; sceneId: Id<'scenes'>; camera: Camera } | null>(null)
  const timerRef = useRef<number | null>(null)

  const flushCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const due = dueRef.current
    if (!due) return
    dueRef.current = null
    rememberCamera(due.code, due.sceneId, due.camera)
  }, [])

  const persistCamera = useCallback(
    (scene: Id<'scenes'>, next: Camera) => {
      dueRef.current = { code, sceneId: scene, camera: next }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flushCamera, PERSIST_DELAY_MS)
    },
    [code, flushCamera],
  )

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

        // Queued, never written, from inside the frame. See PERSIST_DELAY_MS.
        if (sceneId && settledFor.current === sceneId) {
          persistCamera(sceneId, bounded)
        }
      })
    },
    [persistCamera, sceneId, imageWidth, imageHeight, viewportWidth, viewportHeight],
  )

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // The three ways the camera stops being watched, all of which have to spend the
  // write the timer above is still holding. `pagehide` is the one that fires on a
  // real navigation or a closed tab in every engine; `visibilitychange` to hidden
  // catches a backgrounded tab the browser then discards without another event;
  // unmount catches switching scenes and leaving the board. Between them they are
  // what makes a trailing timer safe — the last zoom before a closed tab is kept.
  useEffect(() => {
    const onHide = () => flushCamera()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushCamera()
    }

    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      flushCamera()
    }
  }, [flushCamera])

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

  /**
   * Re-clamp when the viewport changes shape.
   *
   * `clampCamera` runs inside `commit` and nowhere else, so it sees pans, zooms and
   * arrow keys — and not a resize, which changes the bounds without anybody
   * touching the camera. A pane with a draggable divider makes that reachable in
   * one gesture: drag it hard to the left and the map is left sitting mostly
   * outside its own pane, with no cue about what happened and no way back but
   * panning until it reappears. Committing the camera unchanged is enough, because
   * the clamp is the whole of what `commit` does to it.
   *
   * **Re-clamped and never re-fitted.** A camera is what the viewer chose to look
   * at; re-fitting on a resize would throw that away every time somebody nudged the
   * divider, which is the opposite of the behaviour the remembered camera exists
   * for.
   *
   * Declared after the restore-or-fit above so it cannot race it. Effects run in
   * order within a commit, so on the render where the viewport is first measured
   * that one has already established the camera and set `settledFor`; the guard
   * here then means this never fires against a camera that is still `{1, 0, 0}`
   * waiting to be fitted.
   */
  useEffect(() => {
    if (!sceneId || settledFor.current !== sceneId) return
    if (viewportWidth <= 0 || viewportHeight <= 0) return
    commit(cameraRef.current)
  }, [commit, sceneId, viewportWidth, viewportHeight])

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
      // re-entering pan mode thirty times a second. Space is a pan modifier on the
      // board but it is still a space bar in a text field — and, unlike the board's
      // other shortcuts, still a click on a focused button, which is why this asks
      // about buttons and `useBoardKeys` does not.
      if (e.code !== 'Space' || e.repeat || isTypingElement(e.target, { buttons: true })) return

      // Gated on the board holding focus, the same containment test `useBoardKeys`
      // makes, and it is load-bearing rather than tidy now that panels sit beside
      // the map all the time instead of over it. This is bound to the *window*, so
      // without it a space press with focus on anything non-typing in the other
      // pane — a badge, a label, a card, or `<body>` after a click on empty
      // background — put the whole board into pan mode. That reads through to
      // `draggable` on every token, so one person idly holding space in a panel
      // stopped everyone at the table dragging anything, silently and with nothing
      // on screen to explain it.
      //
      // `containerRef` is `Board`'s outer div and not `BoardStage`'s focusable one
      // inside it, deliberately — containment is the question, not identity, so the
      // zoom buttons count as the board while `isTypingElement` above keeps a
      // focused button from swallowing the space that clicks it.
      //
      // The cost is that space does nothing until the board has been clicked once.
      // That is the right trade: `BoardStage` takes focus on pointer-down, so
      // anybody who has touched the map at all already has it, and the alternative
      // is a modifier that fires from anywhere on the page.
      const container = containerRef.current
      if (!container?.contains(document.activeElement)) return

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

    // Focus moving *within* the document is the case the two above cannot see: the
    // window never blurs and the tab never hides, so tabbing out of the board with
    // space held leaves pan mode on with the keyup going to somebody else. Read off
    // `relatedTarget`, which is where focus is going — at `focusout` time
    // `document.activeElement` is usually still `<body>` and has not caught up.
    const onFocusOut = (e: FocusEvent) => {
      const container = containerRef.current
      if (!container) return
      const next = e.relatedTarget
      if (next instanceof Node && container.contains(next)) return
      release()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [containerRef])

  return {
    camera,
    viewport,
    // `commit` is the setter. Wrapping it in an arrow of its own bought nothing
    // and cost a second identity to keep stable.
    setCamera: commit,
    zoomBy,
    zoomToScale,
    fit,
    reset,
    panBy,
    onWheel,
    spacePanning,
  }
}
