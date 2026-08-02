import { useEffect, useId, useRef, useState } from 'react'

import { FieldError } from '@/components/FieldError'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGridWrite } from '@/hooks/useGridWrite'
import { parseNumber } from '@/lib/utils'
import {
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  gridSizeFor,
  isUsableGrid,
  squaresDown,
} from '@convex/lib/grid'
import type { Grid } from '@convex/lib/grid'
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
 * this with that scene's stored values. That was once the whole of the resync story; the
 * effect below is the other half of it, and its docblock says why the key is not enough.
 *
 * The numbers here are no longer the only way to calibrate a grid — the DM can drag a box
 * on the map instead (`GridHandlesLayer`) — and both go out through `useGridWrite`, so
 * there is one write path at three rates rather than two implementations of one.
 */
export function GridCalibrator({ code, dmCode, scene }: GridCalibratorProps) {
  const fieldId = useId()
  const write = useGridWrite({ code, dmCode, sceneId: scene._id })

  const [across, setAcross] = useState(() => trim(scene.imageWidth / scene.gridSize))
  const [offsetX, setOffsetX] = useState(() => trim(scene.gridOffsetX))
  const [offsetY, setOffsetY] = useState(() => trim(scene.gridOffsetY))
  const [gridVisible, setGridVisible] = useState(scene.gridVisible)

  /** The three fields as a grid. Arguments, so a handler can pass what it was just handed. */
  const gridOf = (acrossText: string, xText: string, yText: string): Grid => ({
    gridSize: gridSizeFor(scene.imageWidth, parseNumber(acrossText)),
    gridOffsetX: parseNumber(xText),
    gridOffsetY: parseNumber(yText),
  })

  const grid = gridOf(across, offsetX, offsetY)
  const usable = isUsableGrid(grid)
  const down = squaresDown(scene.imageHeight, grid.gridSize)
  const busy = write.pending

  /**
   * ⚠️ **The one place the two ways of calibrating genuinely collide, and it was a bug.**
   *
   * These four are `useState` initialisers and this component is keyed on `scene._id`, so
   * before the handles existed nothing could change the stored grid that had not been typed
   * into one of these fields — the key covered the only other case, a different map. A
   * dragged box breaks that: the fields go on showing the numbers from before the drag, and
   * the DM's next keystroke in one of them submits a grid built from two of the *old* three
   * numbers, silently undoing the calibration they had just dragged.
   *
   * Resynced on the stored triple changing, and **only while nothing inside the form has
   * focus**. Bumping the `key` would have done the resync in one line and stolen focus in
   * the middle of typing, which is the same class of bug facing the other way. The focus
   * test also makes this a no-op for the calibrator's own writes: whoever typed them still
   * has the caret, and a DM who has clicked away is looking at numbers they are not editing.
   */
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (formRef.current?.contains(document.activeElement)) return
    setAcross(trim(scene.imageWidth / scene.gridSize))
    setOffsetX(trim(scene.gridOffsetX))
    setOffsetY(trim(scene.gridOffsetY))
    setGridVisible(scene.gridVisible)
  }, [
    scene.imageWidth,
    scene.gridSize,
    scene.gridOffsetX,
    scene.gridOffsetY,
    scene.gridVisible,
  ])

  /**
   * Applied as it is typed rather than behind a Save button. Calibrating is a loop of
   * nudge-and-look, so a button in the middle of it means either saving twenty times or —
   * worse, and what actually happened in the first session — nudging, looking at an overlay
   * that has not changed, and concluding the app is broken.
   *
   * Debounced, which is `useGridWrite.apply`, and `src/lib/throttle.ts` argues it at length:
   * the first keystroke of "16" is a valid calibration for a one-square map, so a leading
   * write would redraw the grid to something absurd en route to the answer.
   *
   * ⚠️ **Each handler passes the value it was just handed** rather than letting the write
   * read state that has not re-rendered yet — see `useGridWrite`'s docblock.
   *
   * Not disabled while a write is in flight, unlike the old Save button. A field that goes
   * dead for the length of a round trip drops the next keystroke, and with a write on every
   * change that would happen constantly.
   */
  const fields: NudgeFieldProps[] = [
    {
      id: `${fieldId}-across`,
      label: 'Squares across',
      value: across,
      min: 1,
      onChange: (next) => {
        setAcross(next)
        write.apply(gridOf(next, offsetX, offsetY), gridVisible)
      },
    },
    {
      id: `${fieldId}-x`,
      label: 'Offset X',
      value: offsetX,
      onChange: (next) => {
        setOffsetX(next)
        write.apply(gridOf(across, next, offsetY), gridVisible)
      },
    },
    {
      id: `${fieldId}-y`,
      label: 'Offset Y',
      value: offsetY,
      onChange: (next) => {
        setOffsetY(next)
        write.apply(gridOf(across, offsetX, next), gridVisible)
      },
    },
  ]

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // Enter applies immediately, for a DM who types a number and wants it now
        // rather than in a third of a second.
        event.preventDefault()
        write.settle(grid, gridVisible)
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
            // Settled rather than debounced: a checkbox is one decision, not a run of
            // input to wait out, and a third of a second before the grid vanishes reads
            // as lag. `next` goes in as an argument because the write happens before React
            // has re-rendered with the value it just set.
            write.settle(grid, next)
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
