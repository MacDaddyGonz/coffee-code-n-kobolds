import { memo, useCallback, useEffect, useMemo } from 'react'
import { Layer, Rect } from 'react-konva'
import type Konva from 'konva'

import { setCursor } from '../konvaPointer'
import { useGridTrace } from '@/hooks/useGridTrace'
import { useRubberBand, type Band } from '@/hooks/useRubberBand'
import { gridFromTrace } from '@/lib/gridTrace'
import type { Grid, Rect as ImageRect } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * The measuring box's colours: the calibration family's blue, dashed like the fog band.
 *
 * Both halves of that are deliberate. The **blue** is `GridHandlesLayer`'s exactly, because
 * this is the other half of one tool — the DM should read it as the same thing done a
 * different way rather than as a third kind of rectangle. The **dashes** are `FogLayer`'s
 * band, because that is what this board has already taught the DM a live drag looks like.
 *
 * ⚠️ **The wash is a third of the handles box's**, and that is the one number in here doing
 * real work. What the DM is aiming at is the map's own printed grid lines, *underneath this
 * rectangle* — a fill that reads nicely over map art would hide the very thing being traced.
 */
const BOX_COLOUR = '#38bdf8'
const BOX_FILL = 'rgba(56, 189, 248, 0.04)'

/**
 * Screen-pixel weights, divided by the scale wherever they are used — `GridOverlay`'s rule
 * and `GridHandlesLayer`'s, for the reason those files give: these are image-space
 * coordinates, so an undivided `2` is two *image* pixels, invisible at 25% zoom and a band
 * the width of a corridor at 400%.
 */
const BOX_STROKE = 2
const BOX_DASH = 6

export type TraceBoxLayerProps = {
  code: string
  /** The map being traced. Its extent is the draw surface; its grid is not consulted. */
  scene: PublicScene
  /** The camera's scale, needed for the same reason `GridOverlay` needs it. */
  scale: number
  /**
   * Every frame of the drag, with the grid the box currently describes. The caller throttles
   * it into `useGridWrite.push`, so the table watches the grid settle onto the printed one as
   * the box is drawn.
   *
   * ⚠️ **Called only when there is a grid**, never with `null`. A box mid-drag routinely
   * describes nothing yet — three squares traced over eleven pixels is not a grid the board
   * can draw — and a caller handed `null` would have to decide whether that means *clear the
   * draft* or *ignore me*, which is a decision this component already made by not calling.
   */
  onPreview: (grid: Grid) => void
  /** The drop, once. `useGridWrite.settle`, and the same "only when there is one" rule. */
  onSettle: (grid: Grid) => void
}

/**
 * THE MEASURING BOX: drag it over a block of the map's *own* printed squares, say how many
 * squares it spans, and the grid falls out.
 *
 * **A different object from the calibration handles, and only one of the two is ever
 * mounted** — `Board` chooses, `GridTool` carries the argument. The handles box is square by
 * construction and anchored to the grid origin, so dragging it edits the stored numbers
 * directly. This one is free-aspect and anchored wherever the DM found a legible block, so it
 * is a *measurement* and the numbers are derived from it by `gridFromTrace`.
 *
 * ⚠️ **Deliberately not snapped to the grid, which is the opposite of what `FogLayer` does
 * with the same gesture.** Fog covers whole squares, so its band snaps. This box exists to
 * find out where the squares *are*, so snapping it to the grid it is about to replace would
 * make the measurement a function of its own answer — a box traced over a badly calibrated
 * grid would report that grid back, converge on nothing, and look like it was working.
 *
 * **The box survives the mouse coming up**, which is the other difference from a fog band. It
 * lives in `useGridTrace`'s cell so the panel can print its readout beside the two counts, and
 * so that correcting *"three squares — no, four"* is a keystroke rather than a second drag.
 *
 * The gesture itself is `useRubberBand`, shared with the fog tool. The pointer rule every
 * overlay on this board keeps is kept here the way `FogLayer` keeps it: the draw surface
 * genuinely does swallow every press on the map, and it exists only while the DM is holding a
 * tool that is *for* pressing on the map — armed by a lit button in the board's own toolbar,
 * with a crosshair under the cursor, and Escape gets the board back.
 */
export const TraceBoxLayer = memo(function TraceBoxLayer({
  code,
  scene,
  scale,
  onPreview,
  onSettle,
}: TraceBoxLayerProps) {
  const { box, across, down, setTrace } = useGridTrace(code)

  const commit = useCallback(
    (gesture: Band) => {
      const rect = traceRect(gesture)
      // A click, or a wobble inside one printed square. Dropped rather than stored: it would
      // measure nothing, `gridFromTrace` refuses it anyway, and keeping it would rub out the
      // box the DM traced a moment ago and is still reading numbers off.
      if (rect.width === 0 || rect.height === 0) return

      setTrace({ box: rect })
      const traced = gridFromTrace(rect, across, down)
      if (traced !== null) onSettle(traced.grid)
    },
    [across, down, onSettle, setTrace],
  )

  /*
    `enabled` is a literal `true`, and that is honest rather than lazy. The flag exists so a
    tool put down mid-drag abandons its band instead of committing it — and putting *this*
    tool down unmounts the whole layer, which abandons the band and everything else with it.

    ⚠️ **Deliberately still not a read of `useBoardTool`**, now that there is one cell to read.
    This layer is mounted only while `tool === 'grid'`, so a subscription here could answer
    nothing but `true` — a guard that cannot fail, which is the thing `leakGuard.test.ts` and
    `lib/markers.ts` both argue this project does not keep. `Board` owns the condition and
    duplicating it here would be two components agreeing about one fact.
  */
  const { begin, band } = useRubberBand({ enabled: true, onCommit: commit })

  // Memoised on the band, whose identity changes once per `mousemove` and not once per render
  // — which is what makes the effect below fire on pointer movement rather than on every
  // frame of the pan happening underneath it.
  const live = useMemo(() => (band === null ? null : traceRect(band)), [band])

  /*
    The live half of the write, at `useGridWrite`'s throttled rate. Watching our grid land on
    the printed one *while the box is being drawn* is the whole feedback loop of this tool: the
    DM stops dragging when the lines coincide, rather than letting go and checking.

    An effect rather than a call inside the gesture, because `useRubberBand` reports movement
    by setting state and holds no opinion about what a band means — which is the property that
    let the fog tool and this one share it.
  */
  useEffect(() => {
    if (live === null) return
    const traced = gridFromTrace(live, across, down)
    if (traced !== null) onPreview(traced.grid)
  }, [live, across, down, onPreview])

  // The live gesture outranks the stored box, exactly as a dragged token's local position
  // outranks the server's: two rectangles on screen during a re-trace would be the old
  // measurement arguing with the new one.
  const drawn = live ?? box

  return (
    <Layer>
      {/*
        The draw surface: the map itself, made pressable. It spans the image and nothing
        beyond it, which is the right bound — there are no printed squares off the edge of
        the map to trace.

        `fill="transparent"` rather than no fill, which is `FogLayer`'s note and the same
        mechanism: Konva builds its hit graph by drawing each shape into a second canvas with
        a colour key, and a shape with nothing to fill draws nothing there and answers no
        press.
      */}
      <Rect
        x={0}
        y={0}
        width={scene.imageWidth}
        height={scene.imageHeight}
        fill="transparent"
        onMouseDown={begin}
        onMouseEnter={crosshairCursor}
        onMouseLeave={clearCursor}
      />

      {drawn ? (
        <Rect
          x={drawn.x}
          y={drawn.y}
          width={drawn.width}
          height={drawn.height}
          fill={BOX_FILL}
          stroke={BOX_COLOUR}
          strokeWidth={BOX_STROKE / scale}
          dash={[BOX_DASH / scale, BOX_DASH / scale]}
          // Deaf to the pointer, so a press that lands inside the box it just drew starts
          // another trace rather than finding the box and doing nothing. There is no handle
          // on this rectangle to grab; re-measuring is re-dragging.
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Layer>
  )
})

/**
 * The rectangle a gesture describes, normalised and **nothing else** — see the ⚠️ on the
 * component about why there is no snap here.
 *
 * `useRubberBand` hands back the press and the release in whichever of the four directions
 * the DM dragged, deliberately, because the fog tool and this one want different things done
 * about it. What both want is a positive extent: `gridFromTrace` refuses an inside-out box,
 * and the zero-area test at the call site above has to compare a magnitude.
 */
function traceRect(band: Band): ImageRect {
  return {
    x: Math.min(band.from.x, band.to.x),
    y: Math.min(band.from.y, band.to.y),
    width: Math.abs(band.to.x - band.from.x),
    height: Math.abs(band.to.y - band.from.y),
  }
}

/**
 * The two cursors this layer paints, bound once at module scope — `FogLayer`'s rule, and for
 * its reason: an arrow closed over nothing but a string literal is precisely the prop that
 * would defeat a memo, and a changed handler is a Konva listener unbound and rebound.
 */
const crosshairCursor = (event: Konva.KonvaEventObject<MouseEvent>) =>
  setCursor(event, 'crosshair')
const clearCursor = (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, '')
