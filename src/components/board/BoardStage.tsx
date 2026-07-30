import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'

import { GridOverlay } from './GridOverlay'
import { SceneImage } from './SceneImage'
import type { BoardCamera } from '@/hooks/useBoardCamera'
import type { Size } from '@/lib/camera'
import { cn } from '@/lib/utils'
import type { PublicScene } from '@convex/lib/scenes'

export type BoardStageProps = {
  scene: PublicScene
  camera: BoardCamera
  /** A click on the map itself, hitting no token — the gesture that deselects. */
  onBackgroundClick: () => void
  /**
   * The measured size of the canvas, reported upward because only this component
   * knows it: the camera needs a viewport to fit a map to and to zoom about the
   * centre of, and it is a layout fact, not a prop anybody can pass in.
   */
  onViewportChange: (viewport: Size) => void
  /** The interactive layers — `TokenLayer`. See the note on the layer order below. */
  children?: ReactNode
  className?: string
}

/**
 * The canvas: the map, the grid, and whatever interactive layers it is given, under
 * one camera.
 *
 * The layer order is requirements.md's, bottom-up — background, then player, then
 * DM — and the first two are `listening={false}`, which is doing more work than it
 * looks. It takes them out of hit-testing altogether, so a left-drag on empty map
 * finds no node at all and Konva walks up to the draggable Stage and pans instead of
 * picking up the map image. It is also what makes "did the pointer hit a token?"
 * answerable by comparing the event target to the stage.
 *
 * The token layers arrive as children rather than being built here so that this
 * component stays about pan, zoom and layer order, and knows nothing about tokens,
 * selection or who is looking.
 */
export function BoardStage({
  scene,
  camera,
  onBackgroundClick,
  onViewportChange,
  children,
  className,
}: BoardStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })
  const [pointerPanning, setPointerPanning] = useState(false)

  // Whether the gesture in progress moved the camera. A pan ends in a click, and
  // clearing the selection because someone dragged the view across is a small
  // betrayal that is hard to attribute afterwards.
  const panned = useRef(false)

  const { camera: view, panBy, setCamera, onWheel, spacePanning } = camera

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      // The identity of this object is load-bearing: it is handed straight to
      // `onViewportChange` below, and a fresh object on every observation would
      // push a new value at the camera on every frame of a window resize.
      setViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onViewportChange(viewport)
  }, [viewport, onViewportChange])

  /**
   * Panning with the middle button, and with the space bar held, done by hand.
   *
   * Konva would happily pan the stage for either, but only when the press lands on
   * empty map: over a token it picks the token up, which is exactly the case both
   * gestures exist to avoid. So the press is caught on the container in the capture
   * phase — Konva's own listener is on that same element in the bubble phase — and
   * stopped there, which means no token ever learns the press happened.
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let release: (() => void) | null = null

    const beginPan = (event: MouseEvent) => {
      if (event.button !== 1 && !spacePanning) return
      // Also stops the browser's middle-click autoscroll, which would otherwise
      // fight the pan with a scroll of its own.
      event.preventDefault()
      event.stopPropagation()

      let last = { x: event.clientX, y: event.clientY }

      const move = (moved: MouseEvent) => {
        panBy(moved.clientX - last.x, moved.clientY - last.y)
        last = { x: moved.clientX, y: moved.clientY }
      }

      // Listening on the window, not the container: a pan that runs off the edge of
      // the canvas should keep going, and should still end when the button comes up
      // somewhere else entirely.
      const stop = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', stop)
        release = null
        setPointerPanning(false)
      }

      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', stop)
      release = stop
      setPointerPanning(true)
    }

    container.addEventListener('mousedown', beginPan, true)
    return () => {
      container.removeEventListener('mousedown', beginPan, true)
      // Letting go of the space bar mid-gesture, or unmounting mid-gesture, ends the
      // pan rather than leaving a mousemove listener on the window behind it.
      release?.()
    }
  }, [panBy, spacePanning])

  // Konva events bubble, so a token's own drag reaches these handlers too. The
  // comparison against the stage is what tells "the view moved" from "a token did".
  const isStage = (event: Konva.KonvaEventObject<unknown>) => event.target === event.target.getStage()

  const commitPan = (event: Konva.KonvaEventObject<DragEvent>) => {
    const stage = event.target.getStage()
    if (!stage || event.target !== stage) return
    panned.current = true
    // Committed during the drag as well as at the end of it, so the persisted camera
    // and anything else reading it keep up with what is on screen. The camera's own
    // soft bound is applied where it lands, which is why the stage can be read back
    // raw here.
    setCamera({ scale: stage.scaleX(), x: stage.x(), y: stage.y() })
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={`Game map: ${scene.name}`}
      className={cn(
        'relative h-full w-full overflow-hidden outline-none',
        'focus-visible:ring-ring/50 focus-visible:ring-2',
        spacePanning || pointerPanning ? 'cursor-grabbing' : 'cursor-default',
        className,
      )}
      // The board's keyboard shortcuts — arrow keys, zoom, delete — belong to
      // whoever renders this, and none of them arrive unless the container holds
      // focus. Taking it on press is what makes clicking the map enough.
      onPointerDown={(event) => {
        if (event.currentTarget !== document.activeElement) {
          event.currentTarget.focus({ preventScroll: true })
        }
      }}
    >
      <Stage
        width={viewport.width}
        height={viewport.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable
        onWheel={onWheel}
        onDragStart={(event) => {
          if (isStage(event)) panned.current = false
        }}
        onDragMove={commitPan}
        onDragEnd={commitPan}
        onClick={(event) => {
          if (!isStage(event)) return
          if (panned.current) {
            panned.current = false
            return
          }
          onBackgroundClick()
        }}
      >
        {/* Background. Deaf to the pointer: nobody interacts with the map itself. */}
        <Layer listening={false}>
          <SceneImage scene={scene} />
        </Layer>

        {/* The grid, its own layer so a recalibration redraws nothing else. */}
        <Layer listening={false}>
          <GridOverlay scene={scene} scale={view.scale} />
        </Layer>

        {/* The player layer, and the DM layer if this viewer was sent one. */}
        {children}
      </Stage>
    </div>
  )
}
