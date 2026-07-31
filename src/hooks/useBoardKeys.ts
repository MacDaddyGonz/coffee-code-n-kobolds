import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import type { Cell } from '@convex/lib/grid'
import type { BoardCamera } from '@/hooks/useBoardCamera'
import { isTypingElement } from '@/lib/utils'

/** One square, or five with shift — a full round's dash for a 30-foot speed. */
const NUDGE_CELLS = 1
const NUDGE_CELLS_FAST = 5

/** Screen pixels per arrow press when the keys are panning instead of moving. */
const PAN_STEP = 80
const PAN_STEP_FAST = 400

const ARROWS: Record<string, Cell> = {
  ArrowLeft: { col: -1, row: 0 },
  ArrowRight: { col: 1, row: 0 },
  ArrowUp: { col: 0, row: -1 },
  ArrowDown: { col: 0, row: 1 },
}

/**
 * Is somebody typing rather than driving the board?
 *
 * The board's shortcuts are single characters — `f`, `0`, `-` — so every one of
 * them is also something somebody might type. The grid calibrator nudges its own
 * offsets with the arrow keys while a number field has focus, which is the case
 * that makes this load-bearing rather than tidy: without it, one arrow press would
 * shift the grid *and* pan the map, and neither would end up where it was aimed.
 *
 * Asked of `document.activeElement` and not of the event target, because a key
 * that reaches the window while a field is focused belongs to the field whatever
 * it was dispatched at. And a focused button is deliberately *not* typing here,
 * where it is for the space-pan modifier: clicking Fit and then pressing `F` again
 * should work, and a button ignores every key this hook handles anyway. Both
 * differences are arguments; the list of element types they differ about is not,
 * which is why that part lives in `@/lib/utils`.
 */
function isTyping(): boolean {
  return isTypingElement(document.activeElement, { buttons: false })
}

/**
 * The board's keyboard: arrows, zoom and escape.
 *
 * The arrows do two different things depending on whether anything is selected,
 * which is the only way to fit both onto the keys people reach for. With a token
 * selected they move it a square at a time — the second of the two input methods
 * invariant 2 covers, sharing the throttle, the mutation and the snap with the
 * mouse. With nothing selected the same keys pan the camera, which costs no
 * database traffic at all because the camera is never written to Convex (ADR 0004).
 *
 * Bound to the window rather than to the container, so a click anywhere on the
 * board keeps working, but gated on the container holding focus — otherwise a game
 * with a lobby form on the same screen would have every arrow press stolen from
 * whatever the person was actually doing.
 */
export function useBoardKeys(args: {
  containerRef: RefObject<HTMLElement | null>
  camera: BoardCamera
  selectedTokenId: Id<'tokens'> | null
  onNudge: (tokenId: Id<'tokens'>, delta: Cell) => void
  /** Every arrow key has been let go of. Settles the run of nudges. */
  onNudgeEnd: () => void
  onDeselect: () => void
}): void {
  // Behind a ref so the listeners are attached once. `camera` is a fresh object on
  // every render, so depending on it directly would tear the listeners down and
  // rebuild them constantly — and take the held-key bookkeeping's meaning with it.
  const latest = useRef(args)
  latest.current = args

  useEffect(() => {
    // Which arrows are down, so a run of nudges settles when the *last* of them is
    // released rather than when the first is. Holding right and then tapping up is
    // one diagonal move, and settling half way through it would write twice.
    const held = new Set<string>()

    const endRun = () => {
      if (held.size === 0) return
      held.clear()
      latest.current.onNudgeEnd()
    }

    const holdsFocus = () => {
      const container = latest.current.containerRef.current
      return container !== null && container.contains(document.activeElement)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!holdsFocus() || isTyping()) return
      // Left to the browser: these are its own shortcuts, and a board that ate
      // ctrl-0 or the back gesture would be worse than one with no keys at all.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const { camera, selectedTokenId, onNudge, onDeselect } = latest.current
      const arrow = ARROWS[e.key]

      if (arrow) {
        // Stopped whichever branch takes it, or the page scrolls behind the canvas
        // while the token moves — which on a full-height board reads as the whole
        // app jumping sideways.
        e.preventDefault()
        if (selectedTokenId) {
          held.add(e.key)
          const cells = e.shiftKey ? NUDGE_CELLS_FAST : NUDGE_CELLS
          onNudge(selectedTokenId, { col: arrow.col * cells, row: arrow.row * cells })
        } else {
          // Negated because an arrow says where to *look*, and looking right means
          // moving the map left under a stationary viewport.
          const step = e.shiftKey ? PAN_STEP_FAST : PAN_STEP
          camera.panBy(-arrow.col * step, -arrow.row * step)
        }
        return
      }

      switch (e.key) {
        // `=` and `_` are the unshifted keys `+` and `-` share, so both spellings
        // arrive depending on whether shift happened to be down.
        case '+':
        case '=':
          e.preventDefault()
          camera.zoomBy(1)
          return
        case '-':
        case '_':
          e.preventDefault()
          camera.zoomBy(-1)
          return
        case '0':
          e.preventDefault()
          camera.reset()
          return
        case 'f':
        case 'F':
          e.preventDefault()
          camera.fit()
          return
        // Not prevented, unlike the rest. Escape has no default worth stopping and
        // plenty of other claims on it — a dialog opened from the DM panel is the
        // obvious one — and swallowing it here would be a way to trap somebody in a
        // modal that no longer closes.
        case 'Escape':
          onDeselect()
          return
        default:
          return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (!ARROWS[e.key] || !held.has(e.key)) return
      held.delete(e.key)
      if (held.size === 0) latest.current.onNudgeEnd()
    }

    // A window that loses focus mid-hold never sees the keyup, so without this an
    // alt-tab away leaves the run of nudges unsettled — the token stranded at its
    // last unsnapped write until something else happens to move it.
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', endRun)
    document.addEventListener('visibilitychange', endRun)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', endRun)
      document.removeEventListener('visibilitychange', endRun)
      endRun()
    }
  }, [])
}
