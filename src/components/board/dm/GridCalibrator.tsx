import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SETTINGS_DEBOUNCE_MS, debounce } from '@/lib/throttle'
import { parseNumber } from '@/lib/utils'
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
 * Arrow keys nudge the focused field by a pixel, Shift by ten.
 *
 * Handled on the input rather than on the board, deliberately: the board's own
 * arrow keys move the selected token and do not fire while an input has focus, so
 * lining a grid up with a printed one has to be possible from the field the DM is
 * already typing in. `preventDefault` matters — a number input steps itself on the
 * same keys, and both would apply.
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

type NudgeFieldProps = {
  id: string
  label: string
  value: string
  /** Only the square count has a floor. The offsets are freely negative. */
  min?: number
  onChange: (next: string) => void
}

/**
 * One nudgeable number field. The three below differ by label, value and floor and
 * by nothing else, so they are one component and a list rather than three near
 * copies of fifteen lines — where a fix applied to two of them and not the third is
 * the sort of thing nobody notices until the grid is out by one axis.
 */
function NudgeField({ id, label, value, min, onChange }: NudgeFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => nudge(event, value, onChange)}
        className="h-7 w-24 tabular-nums"
      />
    </div>
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

  // Set the field, then ask for a write. `apply` reads the newest values off a ref, so
  // it does not matter that this runs before React has re-rendered with them.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value)
    apply()
  }

  // Not disabled while a write is in flight, unlike the old Save button. A field that
  // goes dead for the length of a round trip drops the next keystroke, and with a
  // write on every change that would happen constantly.
  const fields: NudgeFieldProps[] = [
    {
      id: `${fieldId}-across`,
      label: 'Squares across',
      value: across,
      min: 1,
      onChange: change(setAcross),
    },
    {
      id: `${fieldId}-x`,
      label: 'Offset X',
      value: offsetX,
      onChange: change(setOffsetX),
    },
    {
      id: `${fieldId}-y`,
      label: 'Offset Y',
      value: offsetY,
      onChange: change(setOffsetY),
    },
  ]

  // Applied as it is typed rather than behind a Save button. Calibrating is a loop of
  // nudge-and-look, so a button in the middle of it means either saving twenty times
  // or — worse, and what actually happened in the first session — nudging, looking at
  // an overlay that has not changed, and concluding the app is broken.
  //
  // Debounced rather than throttled, and `src/lib/throttle.ts` explains why at length:
  // the first keystroke of "16" is a valid calibration for a one-square map, so a
  // leading write would redraw the grid to something absurd en route to the answer.
  //
  // Held in a ref because the identity has to survive re-renders — every keystroke is
  // one — or each character would start its own timer and none would ever be replaced.
  const latest = useRef({ grid, gridVisible, usable })
  latest.current = { grid, gridVisible, usable }

  // The override exists for the one caller that flushes synchronously. `latest` is
  // written during render, so a handler that sets state and flushes in the same tick
  // would send the value it just replaced — React has not re-rendered yet. A typed
  // field never hits this, because 350ms is many renders away.
  const apply = useRef(
    debounce((override?: { gridVisible: boolean }) => {
      const { grid: g, gridVisible: visible, usable: ok } = latest.current
      // A half-typed field parses to NaN, which `isUsableGrid` rejects. Skipping is
      // the right response rather than erroring: the DM is mid-keystroke, not wrong.
      if (!ok) return
      void action.run('grid', 'Could not save the grid.', () =>
        updateGrid({
          code,
          dmCode,
          sceneId: scene._id,
          ...g,
          gridVisible: override?.gridVisible ?? visible,
        }),
      )
    }, SETTINGS_DEBOUNCE_MS),
  ).current

  useEffect(() => apply.cancel, [apply])

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // Enter applies immediately, for a DM who types a number and wants it now
        // rather than in a third of a second.
        event.preventDefault()
        apply.flush()
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        {fields.map((field) => (
          <NudgeField key={field.id} {...field} />
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Changes apply as you make them{busy ? ' — saving…' : ''}. Arrow keys nudge the focused offset
        by a pixel, Shift by ten. The map is {scene.imageWidth} × {scene.imageHeight} as stored.
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
          onChange={(event) => {
            const next = event.target.checked
            setGridVisible(next)
            // Flushed rather than debounced: a checkbox is one decision, not a run of
            // input to wait out, and a third of a second before the grid vanishes reads
            // as lag. Passed explicitly because the flush beats the re-render.
            apply({ gridVisible: next })
            apply.flush()
          }}
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
