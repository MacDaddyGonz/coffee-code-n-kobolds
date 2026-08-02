import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getPaneWidth, rememberPaneWidth } from '@/lib/session'
import { PERSIST_DELAY_MS, debounce } from '@/lib/throttle'

/**
 * The narrowest the right-hand panel is allowed to get.
 *
 * It is `CharacterSheetEditor`'s ability grid and nothing more arbitrary than that:
 * six ability scores, each with a save column and a derived bonus beside it, do not
 * fold. The number was arrived at as the max-width of the slide-out drawer the editor
 * used to be mounted in; that drawer is gone, the shadcn primitive behind it has been
 * deleted with it, and this is now the only place the measurement is stated at all —
 * which is the right number of places for it.
 */
export const MIN_RIGHT_PANE = 576

/** The narrowest the map is allowed to get before the panel stops taking from it. */
export const MIN_MAP_PANE = 480

/**
 * What a game with nothing remembered opens at, and what a double-click on the
 * divider goes back to. Wide enough for the sheet to breathe without the map being
 * the smaller half of a 1440-pixel window.
 */
const DEFAULT_RIGHT_PANE = 640

export type PaneWidth = {
  /** What to render the panel at: the remembered width, made to fit the window. */
  width: number
  /** The bounds the divider reports through `aria-valuemin` / `aria-valuemax`. */
  min: number
  max: number
  /** Set from a drag or a key press. Clamped here, so no caller has to know the bounds. */
  setWidth: (next: number) => void
  /** Back to the default — what a double-click on the divider does. */
  reset: () => void
}

/**
 * The width of the right-hand panel for one game: remembered, and made to fit.
 *
 * Two facts meet here and they are stored in different places on purpose. What the
 * viewer *chose* lives in local storage and outlives the session; how much room
 * there actually is is measured from the body row every time the window changes and
 * is never written anywhere. The rendered width is the first bounded by the second,
 * which is why `getPaneWidth` does no clamping of its own — see the note on it.
 *
 * The row is measured with a `ResizeObserver` rather than read off `window`, because
 * the thing being divided is the body row and not the viewport: a browser window
 * that has not changed size still changes this number the moment anything above the
 * row does.
 *
 * ⚠️ **Below about 1056 pixels both minimums cannot be met, and the sheet wins.**
 * `max` is floored at `MIN_RIGHT_PANE` rather than being allowed to fall below it,
 * so a narrow window takes the space out of the map. A cramped map is a cramped map
 * — you can still pan it, zoom it and drag a token on it — whereas a panel below its
 * floor puts the Save button under the fold, which is the exact failure the pinned
 * footer exists to prevent. This application is desktop-only by
 * [ADR 0001](docs/adr/0001-platform-and-hosting.md), so the window where that
 * trade-off is live is a person who has dragged their browser narrow rather than a
 * whole class of device.
 */
export function usePaneWidth({
  code,
  containerRef,
}: {
  code: string
  /** The body row — the element whose width the two panes divide between them. */
  containerRef: RefObject<HTMLElement | null>
}): PaneWidth {
  // What the viewer chose, unclamped. Kept separate from what is rendered so that a
  // window narrowed and widened again comes back to the chosen width rather than to
  // whatever the narrow window forced.
  const [chosen, setChosen] = useState<number>(() => getPaneWidth(code) ?? DEFAULT_RIGHT_PANE)
  const [available, setAvailable] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      const width = Math.round(box.width)
      // Same number, same state. A resize observer fires on layout that did not
      // change the box, and re-setting an identical width would re-render the whole
      // shell — the board included — on a frame where nothing moved.
      setAvailable((previous) => (previous === width ? previous : width))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  const max = Math.max(MIN_RIGHT_PANE, available - MIN_MAP_PANE)

  // Unclamped until the row has been measured. Clamping against an `available` of 0
  // would open every game at exactly `MIN_RIGHT_PANE` for one frame and then jump.
  const width = available === 0 ? chosen : Math.min(Math.max(chosen, MIN_RIGHT_PANE), max)

  // `debounce` from lib/throttle rather than a hand-rolled timer, and the two
  // properties this depends on are the ones its own tests already pin: the pending
  // *arguments* are what get replayed, and `flush` sends them now. That args-capture
  // is exactly the "carry the code it belongs under rather than read it from a
  // closure" discipline this needs — a flush firing after the browser has moved to
  // another game still writes this game's width under this game's key, because the
  // code travelled with the call rather than being looked up at flush time.
  //
  // ⚠️ `useBoardCamera` still hand-rolls its own timer instead, which predates this
  // hook. That is the obvious follow-up, and this is the note saying so.
  //
  // Held in a ref so the identity survives a re-render: `debounce` returns a fresh
  // function each call, and a new one per render would be a new timer per render with
  // the old one's pending write silently orphaned.
  const persistRef = useRef<ReturnType<typeof debounce<[string, number]>> | null>(null)
  if (persistRef.current === null) {
    persistRef.current = debounce(rememberPaneWidth, PERSIST_DELAY_MS)
  }
  const persist = persistRef.current

  // The three ways this stops being watched, all of which have to spend the write
  // the timer is still holding — the same three `useBoardCamera` covers, and for the
  // same reason. `pagehide` is the one that fires on a real navigation or a closed
  // tab in every engine; `visibilitychange` to hidden catches a backgrounded tab the
  // browser then discards without another event; unmount catches leaving the game.
  useEffect(() => {
    const onHide = () => persist.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist.flush()
    }

    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      persist.flush()
    }
  }, [persist])

  // Only a deliberate change is written down. A width the *window* forced is never
  // persisted, which is the other half of the argument on `getPaneWidth`: resizing a
  // window is not a preference, and recording it as one loses the real preference.
  const commit = useCallback(
    (next: number) => {
      const bounded = Math.min(Math.max(next, MIN_RIGHT_PANE), max)
      setChosen(bounded)
      persist(code, bounded)
    },
    [code, max, persist],
  )

  const reset = useCallback(() => commit(DEFAULT_RIGHT_PANE), [commit])

  return { width, min: MIN_RIGHT_PANE, max, setWidth: commit, reset }
}
