import { useEffect, useId, useRef, useState } from 'react'

import { FieldError } from '@/components/FieldError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useBoardTool } from '@/hooks/useBoardTool'
import type { GridTool } from '@/hooks/useGridTrace'
import { GRID_TOOLS, useGridTrace } from '@/hooks/useGridTrace'
import { useGridWrite } from '@/hooks/useGridWrite'
import { OUT_OF_SQUARE_THRESHOLD, gridFromTrace } from '@/lib/gridTrace'
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
 * The same sentence for the trace box, and it covers both of `gridFromTrace`'s remaining
 * refusals with one message deliberately. A count that is not a whole number and a count so
 * far off the block traced that the square comes out undrawable are the same mistake from the
 * DM's side — *that is not how many squares are in the box* — and telling them apart would be
 * two messages describing one miscount.
 */
const TRACE_UNUSABLE_MESSAGE =
  `Say how many whole squares the box covers, across and down. A square has to come out ` +
  `between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE} pixels, so a count far off the block you ` +
  `traced will not take.`

/**
 * What each grid tool is called and what it does, keyed by the union so a third tool fails to
 * compile here rather than arriving as a button with no label — `MODE_LABELS` in `FogTools`
 * and CLAUDE.md invariant 9. `GRID_TOOLS` is iterated below rather than two buttons being
 * written out, so the array is the order they are offered in.
 */
const TOOL_LABELS: Record<GridTool, { label: string; hint: string }> = {
  handles: {
    label: 'Drag a box',
    hint: 'A four-square box anchored to the grid origin. A corner resizes it, an edge works off one axis alone, the middle slides the whole grid. This is the one for a map with no grid printed on it.',
  },
  trace: {
    label: 'Trace the printed squares',
    hint: 'For a map that already has a grid printed on it: drag a box over a block of its own squares and say how many you covered. The size and both offsets are solved from that in one step.',
  },
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
 * The numbers here are no longer the only way to calibrate a grid — there are three ways
 * now, and **every one of them goes out through the one `useGridWrite`**, so there is one
 * write path at three rates rather than three implementations of one:
 *
 * - typing into the three fields below, debounced (`apply`);
 * - dragging the four-square handles box on the map (`GridHandlesLayer`);
 * - tracing a block of the map's own printed squares (`TraceBoxLayer`), whose counts and
 *   readout are the second half of this panel.
 *
 * ⚠️ **The tool picker chooses which of the two *map* tools is mounted, and it does not arm
 * either of them.** Arming is the grid button in the board's own toolbar, next to the pointer
 * it changes the meaning of — `CalibrateToggle` argues that placement. So this control is
 * "which tool the button gives you", and the copy under it says so, because a picker that
 * looked like a switch and put nothing on the map would read as the feature being broken.
 */
export function GridCalibrator({ code, dmCode, scene }: GridCalibratorProps) {
  const fieldId = useId()
  const write = useGridWrite({ code, dmCode, sceneId: scene._id })

  /**
   * The trace tool, shared with the Konva layer that draws its box — see `useGridTrace` for
   * why a module-level cell rather than state anywhere. The counts live in the cell because
   * the *layer* is what turns the box into a grid ten times a second while it is being
   * dragged; the text below is this panel's, because a half-typed field is a string and the
   * cell holds numbers.
   */
  const { tool, box: traceBox, across: traceAcross, down: traceDown, setTrace } = useGridTrace(code)

  // Whether the chosen tool is actually on the board, which is the board's own armed-tool
  // cell and not this picker's business to change — see the ⚠️ beside the hint below.
  const armed = useBoardTool(code).tool === 'grid'

  const [traceAcrossText, setTraceAcrossText] = useState(() => trim(traceAcross))
  const [traceDownText, setTraceDownText] = useState(() => trim(traceDown))

  /**
   * What the traced box says, recomputed from the **cell's** numbers rather than from the two
   * strings beside them. That is what makes this readout and the grid the board is drawing one
   * answer rather than two that agree: `TraceBoxLayer` reads the same two fields out of the
   * same cell and calls the same function on the same box.
   */
  const traced = traceBox === null ? null : gridFromTrace(traceBox, traceAcross, traceDown)

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

  /**
   * The two counts, and the write behind them.
   *
   * ⚠️ **The cell is patched *and* the text is set, in that order, and both are needed.** The
   * text is what the field shows while it is being typed into; the number in the cell is what
   * `TraceBoxLayer` will use for the next frame of the next drag. Setting only the text would
   * leave the board measuring against the previous count the moment the DM re-traced.
   *
   * Debounced through `apply`, exactly as the three fields above are and for the identical
   * reason: the first keystroke of "12" is the number 1, which is a perfectly good trace of one
   * enormous square, and a leading write would redraw everybody's grid to it on the way past.
   *
   * ⚠️ **Each handler passes the value it was just handed**, because `traced` above was
   * computed from the cell as it stood at the top of this render — see `useGridWrite`'s
   * docblock on the same trap.
   */
  const traceWrite = (acrossValue: number, downValue: number) => {
    if (traceBox === null) return
    const next = gridFromTrace(traceBox, acrossValue, downValue)
    if (next !== null) write.apply(next.grid, gridVisible)
  }

  const traceFields: NudgeFieldProps[] = [
    {
      id: `${fieldId}-trace-across`,
      label: 'Squares across the box',
      value: traceAcrossText,
      min: 1,
      onChange: (next) => {
        setTraceAcrossText(next)
        setTrace({ across: parseNumber(next) })
        traceWrite(parseNumber(next), traceDown)
      },
    },
    {
      id: `${fieldId}-trace-down`,
      label: 'Squares down the box',
      value: traceDownText,
      min: 1,
      onChange: (next) => {
        setTraceDownText(next)
        setTrace({ down: parseNumber(next) })
        traceWrite(traceAcross, parseNumber(next))
      },
    },
  ]

  return (
    // ⚠️ **Two forms rather than one, and it is the resync effect above that makes it
    // necessary rather than a matter of taste.** That effect deliberately leaves the three
    // typed fields alone while anything inside `formRef` holds focus — so if the trace counts
    // sat in the same form, typing one would freeze the fields beside it at the numbers from
    // before the trace, and the next Enter would submit a grid built from two stale thirds of
    // one. Separate forms mean a trace write echoes back and resyncs the typed fields the way
    // a dragged handle already does, and Enter in a trace count settles the *traced* grid
    // rather than whatever the other form is showing.
    <div className="flex flex-col gap-4">
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
          Changes apply as you make them{busy ? ' — saving…' : ''}. Arrow keys nudge the focused
          offset by a pixel, Shift by ten. The map is {scene.imageWidth} × {scene.imageHeight} as
          stored.
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
              Turn this off for a map that arrived with its own grid printed on it — the squares
              still work, and ours drawn a fraction of a pixel out over theirs is worse than none.
              Calibrate with it on, then switch it off.
            </p>
          </div>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <Label>Grid tool</Label>
        <div className="flex flex-wrap gap-2">
          {GRID_TOOLS.map((choice) => (
            <Button
              key={choice}
              type="button"
              size="sm"
              variant={tool === choice ? 'default' : 'outline'}
              aria-pressed={tool === choice}
              onClick={() => {
                // Pressing the tool already in your hand does nothing, rather than rubbing out
                // the box it measured. `setTrace`'s own no-op guard cannot see that, because
                // the patch below genuinely does change something.
                if (choice === tool) return
                // The box goes with the tool. It is a measurement of *this* map made with
                // *this* tool, and one left lying about would come back on screen the next
                // time the DM reached for the tracer, over art it may never have measured.
                setTrace({ tool: choice, box: null })
              }}
            >
              {TOOL_LABELS[choice].label}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{TOOL_LABELS[tool].hint}</p>
        {/* ⚠️ Said rather than left to be discovered — see the ⚠️ on this component. This
            picker chooses a tool; the grid button over the map is what puts it in your hand,
            and while it is out the map answers the tool instead of the coins.

            ⚠️ **The one place this panel reads the board's armed tool**, and it reads it to
            say which of two true sentences applies. A picker that looked like a switch and
            said "press the button" while the tool was already on the board would be the
            feature reading as broken in the other direction. It arms nothing: `BoardTool`'s
            docblock argues why the handles-or-trace choice above stays a preference. */}
        <p className="text-muted-foreground text-xs">
          {armed ? (
            <>
              This is on the board now. Escape puts it away, and coins are locked while it is
              out.
            </>
          ) : (
            <>
              Press the grid button at the top left of the map to put this on the board. Escape
              puts it away, and coins are locked while it is out.
            </>
          )}
        </p>
      </div>

      {tool === 'trace' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            // Enter settles the traced grid now rather than in a third of a second — the same
            // affordance the other form gives, aimed at the numbers this one is showing.
            event.preventDefault()
            if (traced !== null) write.settle(traced.grid, gridVisible)
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            {traceFields.map((field) => (
              <NudgeField key={field.id} {...field} />
            ))}
          </div>

          {traceBox === null ? (
            <p className="text-muted-foreground text-xs">
              Nothing traced yet. Drag a box over a block of the map's own squares, corner to
              corner on the printed lines — and cover as many of them as you can read, because a
              pointer a pixel out over one square is a pixel out per square, and over four it is a
              quarter of that.
            </p>
          ) : (
            <>
              {/*
                ⭐ The readout the whole tool exists for. Both measurements and their
                disagreement, never just the answer — `gridTrace.ts` carries the argument.
              */}
              <p className="text-xs tabular-nums" aria-live="polite">
                {traced === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="font-medium">{traced.sizeAcross.toFixed(1)} px</span>
                    <span className="text-muted-foreground"> across · </span>
                    <span className="font-medium">{traced.sizeDown.toFixed(1)} px</span>
                    <span className="text-muted-foreground"> down · </span>
                    <span className="font-medium">
                      {(traced.outOfSquare * 100).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground"> out</span>
                  </>
                )}
              </p>

              <FieldError message={traced === null ? TRACE_UNUSABLE_MESSAGE : null} />

              {/*
                Past the threshold, in plain words: what the map is, what this application is,
                and by how much the two differ. Not an error and not a refusal — the grid was
                written either way — so it is a paragraph rather than a `FieldError`.
              */}
              {traced !== null && traced.outOfSquare > OUT_OF_SQUARE_THRESHOLD ? (
                <p className="text-xs" aria-live="polite">
                  <span className="font-medium">This map's squares are not square.</span>{' '}
                  <span className="text-muted-foreground">
                    They measure {traced.sizeAcross.toFixed(1)} px across and{' '}
                    {traced.sizeDown.toFixed(1)} px down, which is{' '}
                    {(traced.outOfSquare * 100).toFixed(1)}% apart. Ours are always square, so the
                    grid is drawn at the average of the two — {traced.grid.gridSize.toFixed(1)} px —
                    and it will sit a little proud of the printed lines one way and a little shy of
                    them the other. If the block you traced was small, try again over more squares;
                    if the map really is printed that far out, this is as close as a square grid
                    gets to it.
                  </span>
                </p>
              ) : null}
            </>
          )}
        </form>
      ) : null}
    </div>
  )
}
