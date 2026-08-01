import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * One arrow press, and one with shift held.
 *
 * The two-speed shape mirrors `useBoardKeys`' one square or five, so the whole app
 * has a single idea of what shift means on an arrow key: "the same thing, but a
 * useful jump". The numbers differ because the units do — a square is a distance on
 * a map and this is pixels of panel.
 */
const KEY_STEP = 16
const KEY_STEP_FAST = 64

export type PaneResizerProps = {
  /** The current width of the pane being sized, for `aria-valuenow`. */
  width: number
  min: number
  max: number
  /** The id of the pane this divider sizes, for `aria-controls`. */
  controls: string
  /** A candidate width. `usePaneWidth` clamps, so this may hand over anything. */
  onResize: (width: number) => void
  /** Double-click, back to the default. */
  onReset: () => void
  className?: string
}

/**
 * The divider between the map and the right-hand panel, drag or arrow keys.
 *
 * **Hand-rolled rather than `react-resizable-panels`, and it was a close enough call
 * to write down.** Three things decided it:
 *
 * - **It cannot persist through `session.ts`.** That module exists because
 *   `localStorage` throws outright when storage is disabled, and everything it reads
 *   back is validated field by field — `getCamera` is the worked example, checking
 *   for a NaN scale rather than trusting text that has outlived however many
 *   deploys. What the library stores is an opaque layout array of its own devising,
 *   and there is no meaningful validation to write for it: you either trust it whole
 *   or you do not use it.
 * - **It expresses sizes as percentages**, and the constraint here is 576 pixels of
 *   ability grid. Every bound would be a percentage computed from a measured width
 *   and re-computed on every resize, which is the arithmetic this file avoids by
 *   working in the units the constraint is written in.
 * - **It is a dependency for one divider between exactly two panes** that never
 *   collapse, never nest and never rearrange, in a bundle already near a megabyte.
 *
 * What it costs, honestly: about fifteen lines of keyboard accessibility that a
 * library would have supplied — the `role`, the three `aria-value*`, the four keys
 * and their `preventDefault`. They are below, and they are the part to check if this
 * is ever revisited.
 *
 * ⚠️ **This must be a DOM sibling of the map pane and never a child of it.**
 * `useBoardKeys` gates every shortcut on `containerRef.contains(document.activeElement)`,
 * so a resizer inside the board's container would have each arrow press pan the map
 * *and* move the divider — a thing that would look like the board being broken rather
 * than like the divider being in the wrong place.
 */
export function PaneResizer({
  width,
  min,
  max,
  controls,
  onResize,
  onReset,
  className,
}: PaneResizerProps): ReactElement {
  const [dragging, setDragging] = useState(false)

  // Where the gesture started, and how wide the pane was then. Deriving the width
  // from the pointer's absolute position instead would jump by however far from the
  // centre of the line the grab landed.
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  /**
   * The cursor and the selection lock, on `document.body` and only while dragging.
   *
   * **Body rather than the handle, and both halves of that are the point.** The
   * selection that ruins a drag is not in the divider — it is in the *panes the
   * pointer travels over*, so a `select-none` on a 6-pixel strip prevents nothing
   * and the map's labels and the sheet's fields highlight as you sweep across them.
   * The cursor is the same story from the other side: the pointer leaves the strip on
   * the first frame of the gesture, so a `cursor-col-resize` scoped to the handle
   * flickers to a text caret for the whole of the drag it is supposed to describe.
   *
   * Keyed on the `dragging` state rather than set and unset by the pointer handlers,
   * so that a component unmounted mid-gesture — the DM sending everyone back to the
   * lobby while somebody is dragging — still hands the body back its own cursor.
   */
  useEffect(() => {
    if (!dragging) return
    const body = document.body
    const previousCursor = body.style.cursor
    const previousSelect = body.style.userSelect
    body.style.cursor = 'col-resize'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = previousCursor
      body.style.userSelect = previousSelect
    }
  }, [dragging])

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      // ⚠️ `vertical` reads backwards and is correct. `aria-orientation` on a
      // separator describes the *line*, which is vertical, not the axis the handle
      // travels along, which is horizontal. Somebody will eventually "fix" this;
      // this comment is the only thing standing between them and doing so.
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side panel"
      aria-controls={controls}
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      data-dragging={dragging}
      className={cn(
        // A 6-pixel line with a 14-pixel grab zone behind it, via a pseudo-element
        // that reaches 4 pixels into each pane. Widening the element itself would
        // move both panes over to make room for a target nobody can see; this way
        // the thing you aim at is bigger than the thing you look at, which is the
        // whole trick of a comfortable divider.
        "relative w-1.5 shrink-0 cursor-col-resize touch-none bg-border transition-colors after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-['']",
        'hover:bg-primary/40 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        'data-[dragging=true]:bg-primary',
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // Cancelled, which suppresses the text selection the press would otherwise
        // begin — the body's `user-select` lock below is set from an effect and so
        // lands a tick too late to stop the *first* frame of a fast drag. Cancelling
        // a pointerdown also suppresses the focus that would have followed it, so
        // focus is taken explicitly: a divider you cannot click and then nudge with
        // the arrow keys is half a control.
        event.preventDefault()
        event.currentTarget.focus()
        // Pointer capture, so the events keep arriving at this element once the
        // pointer is over the `<canvas>` next door — no window listeners to add on
        // the way in and forget to remove on the way out, and no gesture lost to a
        // pointer that leaves the window entirely.
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const started = drag.current
        if (started?.pointerId !== event.pointerId) return
        // Subtracted: the divider is on the panel's left edge, so a pointer moving
        // left makes the panel *wider*.
        onResize(started.startWidth - (event.clientX - started.startX))
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP
        switch (event.key) {
          // Left widens, matching the drag: the key moves the divider, not the edge
          // of the panel.
          case 'ArrowLeft':
            event.preventDefault()
            onResize(width + step)
            return
          case 'ArrowRight':
            event.preventDefault()
            onResize(width - step)
            return
          // Prevented as well, because both scroll a page by default and the shell
          // is the one screen in the app that must not scroll.
          case 'Home':
            event.preventDefault()
            onResize(min)
            return
          case 'End':
            event.preventDefault()
            onResize(max)
            return
          default:
            return
        }
      }}
    />
  )
}
