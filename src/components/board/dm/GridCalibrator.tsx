import { useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@convex/_generated/api'
import {
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  gridSizeFor,
  isUsableGrid,
  squaresDown,
} from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

export type GridCalibratorProps = {
  code: string
  dmCode: string
  scene: PublicScene
}

/**
 * Empty means empty, not zero.
 *
 * `Number('')` is 0, which would sail through every check and store a grid whose
 * square is zero pixels wide — dividing by it hands `Infinity` to the position
 * table on the first drag. NaN is the honest answer for a blank field, and
 * `isUsableGrid` refuses it.
 */
function parseNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw)
}

/** Back out of a float that came from a division, so 16.000000001 reads as 16. */
function trim(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(3))) : ''
}

/** Says which numbers are wrong in the DM's terms — squares across, not pixels. */
function unusableMessage(imageWidth: number): string {
  const most = Math.floor(imageWidth / MIN_GRID_SIZE)
  return (
    `Fill in all three. A square has to be between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE} pixels, ` +
    `which puts the square count somewhere between 1 and ${most} across this map.`
  )
}

/**
 * Calibrating the grid against the map, which is the one setup step nobody can do
 * for the DM.
 *
 * The DM types a square count across the image and everything else is derived:
 * `gridSize = gridSizeFor(imageWidth, squaresAcross)`. That is the right way round
 * because a square count is something you can *count* off a map, whereas pixels
 * per square is a number nobody knows. The derived line underneath is what turns a
 * guess into a check: the sample map `Admittance [Gridded 16x12]` is 2240 × 1680,
 * so 16 across reads back as exactly 140.00 px and 12.00 squares down — and a DM
 * seeing 140.00 and 12.00 knows the calibration is right rather than merely
 * close enough to look right at this zoom.
 *
 * Mounted with `key={scene._id}` by <MapSetupPanel>, so switching scenes remounts
 * this with that scene's stored values rather than needing an effect to resync.
 */
export function GridCalibrator({ code, dmCode, scene }: GridCalibratorProps) {
  const updateGrid = useMutation(api.scenes.updateGrid)
  const action = useLobbyAction()
  const fieldId = useId()

  const [across, setAcross] = useState(() => trim(scene.imageWidth / scene.gridSize))
  const [offsetX, setOffsetX] = useState(() => trim(scene.gridOffsetX))
  const [offsetY, setOffsetY] = useState(() => trim(scene.gridOffsetY))
  const [gridVisible, setGridVisible] = useState(scene.gridVisible)

  const grid = {
    gridSize: gridSizeFor(scene.imageWidth, parseNumber(across)),
    gridOffsetX: parseNumber(offsetX),
    gridOffsetY: parseNumber(offsetY),
  }
  const usable = isUsableGrid(grid)
  const down = squaresDown(scene.imageHeight, grid.gridSize)
  const busy = action.pending !== null

  /**
   * Arrow keys nudge the focused field by a pixel, Shift by ten.
   *
   * Handled on the input rather than on the board, deliberately: the board's own
   * arrow keys move the selected token and do not fire while an input has focus,
   * so lining a grid up with a printed one has to be possible from the field the
   * DM is already typing in. `preventDefault` matters — a number input steps
   * itself on the same keys, and both would apply.
   */
  function nudge(
    event: React.KeyboardEvent<HTMLInputElement>,
    value: string,
    set: (next: string) => void,
  ) {
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    if (direction === 0) return
    event.preventDefault()
    const current = parseNumber(value)
    const from = Number.isFinite(current) ? current : 0
    set(trim(from + direction * (event.shiftKey ? 10 : 1)))
  }

  const save = () =>
    void action
      .run('grid', 'Could not save the grid.', () =>
        updateGrid({ code, dmCode, sceneId: scene._id, ...grid, gridVisible }),
      )
      .then((done) => {
        if (done) toast.success('Grid saved.')
      })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (usable) save()
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-across`} className="text-xs">
            Squares across
          </Label>
          <Input
            id={`${fieldId}-across`}
            type="number"
            min={1}
            step={1}
            value={across}
            onChange={(event) => setAcross(event.target.value)}
            onKeyDown={(event) => nudge(event, across, setAcross)}
            className="h-7 w-24 tabular-nums"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-x`} className="text-xs">
            Offset X
          </Label>
          <Input
            id={`${fieldId}-x`}
            type="number"
            step={1}
            value={offsetX}
            onChange={(event) => setOffsetX(event.target.value)}
            onKeyDown={(event) => nudge(event, offsetX, setOffsetX)}
            className="h-7 w-24 tabular-nums"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${fieldId}-y`} className="text-xs">
            Offset Y
          </Label>
          <Input
            id={`${fieldId}-y`}
            type="number"
            step={1}
            value={offsetY}
            onChange={(event) => setOffsetY(event.target.value)}
            onKeyDown={(event) => nudge(event, offsetY, setOffsetY)}
            className="h-7 w-24 tabular-nums"
            disabled={busy}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !usable}>
          Save grid
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Arrow keys nudge the focused offset by a pixel, Shift by ten. The map is{' '}
        {scene.imageWidth} × {scene.imageHeight} as stored.
      </p>

      {/* The reassurance, and the whole reason the square count is the input. */}
      <p className="text-xs tabular-nums" aria-live="polite">
        {usable ? (
          <>
            <span className="font-medium">{grid.gridSize.toFixed(2)} px</span>
            <span className="text-muted-foreground"> per square · </span>
            <span className="font-medium">{down.toFixed(2)}</span>
            <span className="text-muted-foreground"> squares down</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>

      <FieldError message={usable ? null : unusableMessage(scene.imageWidth)} />

      <div className="flex items-start gap-2">
        <input
          id={`${fieldId}-visible`}
          type="checkbox"
          checked={gridVisible}
          onChange={(event) => setGridVisible(event.target.checked)}
          disabled={busy}
          className="accent-foreground mt-0.5 size-4"
        />
        <div className="flex flex-col">
          <Label htmlFor={`${fieldId}-visible`}>Draw the grid</Label>
          <p className="text-muted-foreground text-xs">
            Turn this off for a map that arrived with its own grid printed on it — the squares still
            work, and ours drawn a fraction of a pixel out over theirs is worse than none. Calibrate
            with it on, then switch it off.
          </p>
        </div>
      </div>
    </form>
  )
}
