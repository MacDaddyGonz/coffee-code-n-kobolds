import { memo } from 'react'
import { EyeIcon } from 'lucide-react'

import { BOARD_OVERLAY_SURFACE } from '@/components/board/overlay'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type TableViewBadgeProps = {
  /** Back to Everything. The badge is the way out as well as the notice. */
  onExit: () => void
  className?: string
}

/**
 * YOU ARE LOOKING AT THE TABLE'S BOARD, NOT YOURS.
 *
 * ⚠️ **A persistent badge on the map rather than a lit button in a panel, and Roll20's own
 * documentation is the argument.** GMs get this wrong constantly there, and the reason is
 * that the toggle is not visible from the map: the DM previews the party's view, gets
 * distracted, and then spends ten minutes wondering where their ambush went — or worse,
 * places three creatures onto a board that is missing half of what is on it. The control
 * that turns a mode on and the notice that it is on are two different jobs, and only one of
 * them has to be on the thing being modified.
 *
 * That is `CalibrateToggle`'s argument arriving at a second mode, with one difference worth
 * naming: calibration changes what the *pointer* does and this changes what the *canvas*
 * shows, so it is the more invisible of the two. A DM in calibration mode discovers it on
 * the first click; a DM in table view can look at a board for a long time and believe it.
 *
 * **HTML rather than Konva**, which is not a preference. It has to be legible at any zoom
 * and it has to be clickable, and a Konva node is neither for free — it would scale with the
 * camera, need its own hit target, and sit inside a stage whose layers this mode is already
 * rearranging. It is a control over the map, so it is drawn the way every other control over
 * the map is: `BOARD_OVERLAY_SURFACE`, positioned by whoever mounts it, exactly as
 * `ZoomControls` is.
 *
 * ⚠️ **A notice about a preference, and never about a permission.** Nothing here filters
 * anything; `useBoardLayers`' docblock carries that argument at length. This browser was sent
 * the whole board and is choosing what to paint of it, so what the badge announces is a
 * *drawing* state and not a smaller payload.
 *
 * Memoised for `ZoomControls`' reason: it sits over a board that re-renders on every frame of
 * a pan, reads one callback, and contains a Radix tooltip subtree that is real work to
 * reconcile for output that never changes.
 */
export const TableViewBadge = memo(function TableViewBadge({
  onExit,
  className,
}: TableViewBadgeProps) {
  return (
    <div
      className={cn(
        BOARD_OVERLAY_SURFACE,
        'flex items-center gap-2 py-1 pr-1 pl-2.5',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <EyeIcon aria-hidden className="size-3.5" />
        {/*
          The words the panel's own button uses, so the notice and the control that caused it
          read as one thing. "Preview" would be a third name for a state that already has two.
        */}
        What the table sees
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="secondary" size="xs" onClick={onExit}>
            Exit
          </Button>
        </TooltipTrigger>
        {/*
          Says what is being left out rather than only what to press, because the DM reading
          this is usually reading it to answer "where did my monster go".
        */}
        <TooltipContent>
          Back to Everything — your own layer and anything the fog is hiding from the party
        </TooltipContent>
      </Tooltip>
    </div>
  )
})
