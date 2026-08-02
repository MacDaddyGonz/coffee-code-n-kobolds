import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/errors'
import { MOVE_THROTTLE_MS, SETTINGS_DEBOUNCE_MS, debounce, throttle } from '@/lib/throttle'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Grid } from '@convex/lib/grid'
import { isUsableGrid } from '@convex/lib/grid'

/**
 * One toast id for every failure this hook reports.
 *
 * A drag pushes ten writes a second, so a game that has gone offline mid-calibration
 * would otherwise stack thirty identical "could not save the grid" toasts over the map
 * the DM is trying to look at. Sonner replaces a toast that reuses an id, so the DM is
 * told once and told again only when it happens again.
 */
const TOAST_ID = 'grid-write'

export type GridWrite = {
  /**
   * Debounced. For a number the DM is **typing**: the first keystroke of "16" is the
   * number 1, which is a valid calibration for a one-square map, so a leading write would
   * redraw the grid to something absurd on the way to the right answer.
   */
  apply: (grid: Grid, gridVisible: boolean) => void
  /**
   * Throttled, leading and trailing. For a **drag in progress**: the first frame has to
   * reach the other screens at once, and the last one in each window has to be delivered
   * or the grid stops a tenth of a second behind the handle.
   */
  push: (grid: Grid, gridVisible: boolean) => void
  /**
   * Cancels whatever either of the above has pending and writes now. For a drop, for
   * Enter, and for the checkbox — a discrete decision with no run of input to wait out.
   *
   * Cancel-then-send, in that order, for the reason `@/lib/throttle` gives at length: an
   * intermediate value still sitting in a trailing window would otherwise land *after*
   * this one and leave the stored grid a frame behind where the DM let go.
   */
  settle: (grid: Grid, gridVisible: boolean) => void
  /** A write is in flight. The calibrator says "saving…"; nothing is disabled. */
  pending: boolean
}

/**
 * The one write path to `scenes.updateGrid`, at three different rates.
 *
 * Two things calibrate a grid now — the DM typing numbers into `GridCalibrator` and the
 * DM dragging the box on the board — and they want opposite ends of `@/lib/throttle`.
 * Lifting the write out of the calibrator is what stops the board growing a second,
 * subtly different copy of it.
 *
 * ⚠️ **Every entry point takes the grid as an argument, and that is the whole design.**
 * The calibrator used to hold a `latest` ref written during render, plus an
 * `override?: { gridVisible }` parameter on the debounced function — and both existed for
 * one reason: the closure was built during render and read state that had not
 * re-rendered yet, so a handler that set state and flushed in the same tick sent the
 * value it had just replaced. The checkbox was the caller that hit it, and the override
 * was the patch. Passing the value in deletes the ref and the override together, because
 * a caller always knows what it just decided; there is no longer anywhere for a stale
 * read to come from.
 *
 * ⚠️ **Deliberately not built on `useLobbyAction`, unlike every other DM control.** That
 * hook's `inFlight` ref refuses a second call while the first is outstanding, which is
 * exactly right for a button and exactly wrong here: a round trip longer than
 * `MOVE_THROTTLE_MS` would silently drop mid-drag pushes, and — the one that matters —
 * could drop the **settling** write on the drop, leaving the stored grid at whatever the
 * last delivered frame happened to be. `useTokenMove` calls its mutation directly for the
 * same reason, and this is the same gesture at a tenth of the frequency.
 *
 * `dmCode` and `sceneId` are nullable so the board can call this unconditionally — a
 * player has no DM code and an empty game has no scene, and neither is a reason for a
 * hook to be conditional. Both are re-verified server-side regardless (invariant 7): the
 * absence below only decides what this browser bothers to send.
 */
export function useGridWrite(args: {
  code: string
  dmCode: string | null
  sceneId: Id<'scenes'> | null
}): GridWrite {
  const updateGrid = useMutation(api.scenes.updateGrid)

  // A count rather than a boolean: `settle` can go out while a `push` is still in flight,
  // and a boolean cleared by whichever returned first would say "saved" with a write
  // still outstanding.
  //
  // ⚠️ **State and not a ref, and it is state for one reader.** `GridCalibrator` prints
  // "— saving…" off `pending`, so a ref would freeze that line and dropping the member would
  // delete it. The cost is worth writing down rather than rediscovering: `Board` holds a
  // second instance of this hook and never reads `pending`, so each of the ten throttled
  // writes a handle drag sends re-renders the whole board twice for a value nothing there
  // consumes. Twenty renders a second on top of the sixty `setDraftGrid` is already causing,
  // for about a second — which is why the fix is not an `options.trackPending` flag threaded
  // through both call sites, and is recorded here instead.
  const [writes, setWrites] = useState(0)

  // Behind a ref so `send` — and therefore the debounce and the throttle wrapped around
  // it — is built once and survives every re-render. Rebuilding either would drop
  // whatever call was sitting in its window, which during a drag is the newest one.
  const target = useRef(args)
  target.current = args

  const send = useCallback(
    (grid: Grid, gridVisible: boolean) => {
      const { code, dmCode, sceneId } = target.current
      if (dmCode === null || sceneId === null) return

      // A half-typed field parses to NaN, which `isUsableGrid` rejects and `updateGrid`
      // would refuse. Skipping is the right response rather than erroring: the DM is
      // mid-keystroke, not wrong. A drag cannot reach here unusable — `dragBox` clamps —
      // so this is the typed path's guard and a belt for the other.
      if (!isUsableGrid(grid)) return

      setWrites((count) => count + 1)
      void updateGrid({ code, dmCode, sceneId, ...grid, gridVisible })
        .catch((thrown: unknown) => {
          toast.error(errorMessage(thrown, 'Could not save the grid.'), { id: TOAST_ID })
        })
        .finally(() => setWrites((count) => count - 1))
    },
    [updateGrid],
  )

  const apply = useMemo(() => debounce(send, SETTINGS_DEBOUNCE_MS), [send])
  const push = useMemo(() => throttle(send, MOVE_THROTTLE_MS), [send])

  const settle = useCallback(
    (grid: Grid, gridVisible: boolean) => {
      apply.cancel()
      push.cancel()
      send(grid, gridVisible)
    },
    [apply, push, send],
  )

  // Both, on the way out. A component unmounted mid-gesture — the DM switching tabs
  // during a drag — must not fire a write into a scene nobody is looking at any more.
  useEffect(
    () => () => {
      apply.cancel()
      push.cancel()
    },
    [apply, push],
  )

  return { apply, push, settle, pending: writes > 0 }
}
