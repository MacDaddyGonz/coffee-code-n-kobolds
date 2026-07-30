import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MAX_SCALE, MIN_SCALE, ZOOM_PRESETS } from '@/lib/camera'
import type { BoardCamera } from '@/hooks/useBoardCamera'
import { cn } from '@/lib/utils'

export type ZoomControlsProps = {
  camera: BoardCamera
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
export function ZoomControls({ camera, className }: ZoomControlsProps) {
  const { scale } = camera.camera
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
        'bg-background/90 flex items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur',
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
            onClick={() => camera.zoomBy(-1)}
          >
            <MinusIcon aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom out (−)</TooltipContent>
      </Tooltip>

      <select
        aria-label="Zoom level"
        className="border-input h-7 rounded-lg border bg-transparent px-1.5 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        value={String(preset ?? scale)}
        onChange={(e) => camera.zoomToScale(Number(e.target.value))}
      >
        {options.map((option) => (
          <option key={option} value={String(option)}>
            {Math.round(option * 100)}%
          </option>
        ))}
      </select>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => camera.zoomBy(1)}
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
            onClick={camera.fit}
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
            onClick={camera.reset}
          >
            100%
          </Button>
        </TooltipTrigger>
        <TooltipContent>Actual size, centred (0)</TooltipContent>
      </Tooltip>
    </div>
  )
}
