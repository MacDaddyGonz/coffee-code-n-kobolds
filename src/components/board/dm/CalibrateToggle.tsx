import { memo } from 'react'
import { Grid3x3Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type CalibrateToggleProps = {
  active: boolean
  onToggle: () => void
}

/**
 * The DM's way in and out of grid calibration.
 *
 * **On the board rather than in the Map panel**, which is the opposite of where every
 * other grid control lives, and deliberately: this one turns the map itself into an
 * editor, and a switch that changes what the pointer does belongs next to the pointer.
 * The numbers stay in `GridCalibrator`, because a number is something you read and type;
 * a box is something you grab.
 *
 * ⚠️ **A display gate and nothing more.** Whoever renders this decides on the strength of
 * holding a DM code, and `scenes.updateGrid` re-verifies that code server-side on every
 * write it causes — CLAUDE.md invariant 7. Hiding the button authorises nothing.
 *
 * Memoised, and for the reason `ZoomControls` is: it sits over a board that re-renders on
 * every frame of a pan, reads two primitives, and contains a Radix tooltip subtree that
 * is real work to reconcile for output that never changes.
 */
export const CalibrateToggle = memo(function CalibrateToggle({
  active,
  onToggle,
}: CalibrateToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'default' : 'ghost'}
          size="icon-sm"
          aria-label="Calibrate the grid on the map"
          aria-pressed={active}
          onClick={onToggle}
        >
          <Grid3x3Icon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {active
          ? 'Done calibrating (Esc). Tokens are locked while this is on.'
          : 'Drag a four-square box onto the map to line the grid up'}
      </TooltipContent>
    </Tooltip>
  )
})
