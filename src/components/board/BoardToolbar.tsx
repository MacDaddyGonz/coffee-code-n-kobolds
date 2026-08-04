import { memo } from 'react'

import { DiceBar } from '@/components/board/DiceBar'
import { CalibrateToggle } from '@/components/board/dm/CalibrateToggle'
import { BOARD_OVERLAY_SURFACE } from '@/components/board/overlay'
import { RollModeBar } from '@/components/feed/RollModeBar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export type BoardToolbarProps = {
  /** Whether to offer the grid adjuster. A display gate — see `CalibrateToggle`. */
  isDm: boolean
  calibrating: boolean
  onToggleCalibrate: () => void
  className?: string
}

/**
 * THE TOOLS, over the map: how the next roll will be made, what to roll, and — for the DM
 * — whether the pointer is drawing a grid.
 *
 * **Three groups that were in three places.** `RollModeBar` was pinned above the tab
 * bodies in the right-hand pane, the dice presets were a row inside `DiceComposer` under
 * the feed, and `CalibrateToggle` was already a lone overlay in this corner. All three are
 * things you reach for *while looking at the board*, and two of them were in the pane you
 * are not looking at.
 *
 * ⚠️ **Moved rather than copied, every one of them.** `RollModeBar` and `CalibrateToggle`
 * are the same components at their new mounting point; `DiceComposer` gave its presets up
 * to `DiceBar` and kept only the typed field. Nothing is rendered in two places, so there
 * is no pair to keep in step — which matters most for the mode bar, whose whole design is
 * that a non-Normal mode is loud in one obvious place rather than quiet in two.
 *
 * ⚠️ **This is what forced `RollProvider` up to `GameShell`.** Both `RollModeBar` and
 * `DiceBar` read `useRollControls`, and the provider used to be inside `RightPane`'s memo
 * boundary — which `useRoll.ts` warns against crossing. The argument for why it is safe is
 * written where the provider is now mounted, and it is a property of that value rather than
 * a licence to hoist contexts across memos generally.
 *
 * **The pointer rule every overlay on this board keeps:** the wrapper opts out of the
 * pointer and only what is drawn takes it back. Anything laid over the canvas that eats a
 * click is a token the DM cannot pick up, and it fails silently — a transparent box has
 * nothing on screen to explain why the map stopped responding. `TokenHpPopover` states it
 * first and `BoardTokenMenu` restates it.
 *
 * ⚠️ **Every button inside is `type="button"`, and that is not stylistic.** `useBoardKeys`
 * gates the board's arrow keys and shortcuts on the container holding focus, and a button
 * that submitted a form or navigated would take focus away for good. The controls sit
 * inside the board's own container for the same reason `BoardTokenMenu`'s trigger does.
 *
 * `flex-wrap` is what makes it safe at any pane width: the groups stack rather than the bar
 * growing a horizontal scrollbar or running under the zoom controls in the opposite corner.
 *
 * Memoised for `ZoomControls`' reason — it sits over a board that re-renders on every frame
 * of a pan and reads two primitives and a stable callback.
 */
export const BoardToolbar = memo(function BoardToolbar({
  isDm,
  calibrating,
  onToggleCalibrate,
  className,
}: BoardToolbarProps) {
  return (
    <div className={cn('pointer-events-none absolute', className)}>
      <div
        className={cn(
          BOARD_OVERLAY_SURFACE,
          'pointer-events-auto flex max-w-[min(46rem,calc(100%-1.5rem))] flex-wrap items-center gap-x-2 gap-y-1 p-1.5',
        )}
      >
        <RollModeBar />

        <Separator orientation="vertical" className="h-4" />

        <DiceBar />

        {/* Last, and only for the DM.

            ⚠️ **`CalibrateToggle` used to draw its own surface and was handed four
            utilities here to cancel it** — `border-none bg-transparent p-0 shadow-none
            backdrop-blur-none`, on the reasoning that it was a standalone overlay elsewhere.
            It is not: after this bar existed it had exactly one mount, and a negation that
            goes stale when the toolbar's chrome changes is invisible. So it gave up its
            wrapper, `BOARD_OVERLAY_SURFACE` names the surface once, and the bar owns it for
            all three groups — the same correction `RollModeBar` took on the way here. */}
        {isDm ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <CalibrateToggle active={calibrating} onToggle={onToggleCalibrate} />
          </>
        ) : null}
      </div>
    </div>
  )
})
