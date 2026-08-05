import { memo } from 'react'
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MAX_SCALE, MIN_SCALE, ZOOM_PRESETS } from '@/lib/camera'
import { BOARD_OVERLAY_SURFACE } from '@/components/board/overlay'
import { cn } from '@/lib/utils'

export type ZoomControlsProps = {
  /**
   * The camera's scale, and deliberately not the camera.
   *
   * This bar reads one number, but a `BoardCamera` is a fresh object every render
   * of the board — so taking the whole thing defeated the memo below and put four
   * Radix tooltip subtrees and a sorted options array through reconciliation on
   * every frame of every pan, for a bar whose contents had not moved.
   */
  scale: number
  onZoomBy: (direction: 1 | -1) => void
  onZoomToScale: (scale: number) => void
  onFit: () => void
  onReset: () => void
  className?: string
}

/**
 * The zoom bar: step out, jump to a percentage, step in, fit, back to 100%.
 *
 * All five do nothing the wheel and the keyboard cannot already do. They exist
 * because the wheel gives no reading — after a minute of zooming about, "how big
 * is this?" and "how do I get back to where everyone else is?" have no answer
 * without a number on screen and a way to type over it.
 *
 * Positioning is left to whoever renders this, since only they know where the
 * canvas edges are.
 */
export const ZoomControls = memo(function ZoomControls({
  scale,
  onZoomBy,
  onZoomToScale,
  onFit,
  onReset,
  className,
}: ZoomControlsProps) {
  const percent = Math.round(scale * 100)

  // The dropdown has to read as the live zoom, but a native select can only show
  // one of its own options, and the wheel leaves you between presets nearly
  // always. So an off-preset scale is added to the list as its own entry, matched
  // by displayed percentage rather than exact value — a scale of 0.2502 is "25%"
  // to the reader, and offering that twice would look like a bug.
  const preset = ZOOM_PRESETS.find((option) => Math.round(option * 100) === percent)
  const options = preset === undefined ? [...ZOOM_PRESETS, scale].sort((a, b) => a - b) : ZOOM_PRESETS

  return (
    <div
      className={cn(
        BOARD_OVERLAY_SURFACE,
        'flex items-center gap-1 p-1',
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={scale <= MIN_SCALE}
            onClick={() => onZoomBy(-1)}
          >
            <MinusIcon aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom out (−)</TooltipContent>
      </Tooltip>

      <NativeSelect
        aria-label="Zoom level"
        className="h-7 px-1.5 text-xs tabular-nums"
        value={String(preset ?? scale)}
        onChange={(e) => onZoomToScale(Number(e.target.value))}
      >
        {options.map((option) => (
          <option key={option} value={String(option)}>
            {Math.round(option * 100)}%
          </option>
        ))}
      </NativeSelect>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => onZoomBy(1)}
          >
            <PlusIcon aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom in (+)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fit map to view"
            onClick={onFit}
          >
            <MaximizeIcon aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fit the whole map (F)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="tabular-nums"
            onClick={onReset}
          >
            100%
          </Button>
        </TooltipTrigger>
        <TooltipContent>Actual size, centred (0)</TooltipContent>
      </Tooltip>
    </div>
  )
})
