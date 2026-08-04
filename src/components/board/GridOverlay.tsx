import { memo, useCallback, useMemo } from 'react'
import { Shape } from 'react-konva'
import type { Context as KonvaContext } from 'konva/lib/Context'

import { gridLines } from '@convex/lib/grid'
import type { Grid } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * The grid, drawn twice: a pale wide stroke with a dark narrow one on top of it.
 *
 * One colour cannot work. A single dark line disappears into a black cave and a
 * single pale one disappears into a sunlit tavern floor, and the DM picks the map,
 * not us. Two passes over the same path give every line its own halo, so it reads
 * against whatever art is underneath at the cost of one extra stroke of an
 * already-built path.
 */
const HALO_COLOUR = 'rgba(255, 255, 255, 0.3)'
const LINE_COLOUR = 'rgba(0, 0, 0, 0.42)'

/** Both widths are screen pixels, divided by the scale on the way in. */
const HALO_WIDTH = 3
const LINE_WIDTH = 1

export type GridOverlayProps = {
  scene: PublicScene
  scale: number
  /**
   * A calibration in progress, which outranks the scene's stored one while it lasts.
   *
   * ⚠️ **Not a nicety.** Without it the interactive handles reproduce exactly the failure
   * `GridCalibrator`'s docblock records from the first session with the typed fields: the
   * DM adjusts the grid, looks at an overlay that has not moved, and concludes the app is
   * broken. A drag pushes ten writes a second, so the stored grid catches up in a tenth
   * of a second — but a tenth of a second of a grid that does not follow the box is
   * enough to make the box feel disconnected from the thing it is supposed to be moving.
   *
   * Only the three numbers `Grid` carries. `gridVisible` is not among them, so the DM's
   * switch still decides whether anything is drawn at all: a map that arrived with its own
   * grid printed on it is calibrated against the *box*, which is drawn regardless.
   */
  grid?: Grid
}

/**
 * The grid squares, in image space so they sit on the map rather than on the
 * viewport — pan and zoom then move the grid with the wall it was lined up
 * against, which is the entire point of calibrating one.
 *
 * Drawing in image space is also what makes `scale` a required prop rather than a
 * detail: a stroke width is in the same units as the coordinates, so a `1` here is
 * one *image* pixel, which is four screen pixels at 400% zoom and a grid of slabs.
 * Every width below is therefore a screen-pixel figure divided by the scale, which
 * keeps a hairline a hairline at every zoom level.
 *
 * One `Shape` with a hand-written `sceneFunc`, not a `Line` per line. A 5320×7840
 * map at 140 px squares is 38 verticals and 56 horizontals, and this component
 * re-renders on every wheel notch; ninety-odd Konva nodes each with their own
 * transform and hit region is real work to do at that rate, where one path is not.
 *
 * Both the memo and the `useCallback` under it are about the same mechanism, and
 * neither is decoration. Konva's `_setAttr` skips the write and the redraw only for
 * an *equal* value, which two functions never are — so a `sceneFunc` rebuilt each
 * render always set the attribute, always asked the layer to redraw, and so rebuilt
 * and double-stroked this whole path on renders that changed nothing about the
 * grid. That included every one of the ten position ticks a second during a drag,
 * which should be touching the token layer's canvas and nothing else.
 */
export const GridOverlay = memo(function GridOverlay({ scene, scale, grid }: GridOverlayProps) {
  const { imageWidth, imageHeight } = scene
  // Destructured to three numbers before either hook below sees them, deliberately. The
  // draft is a fresh object whenever the caller re-derives it, and the memo above compares
  // props by reference — so taking the object into a dependency list would rebuild
  // `sceneFunc` on renders that changed nothing, which is the redraw-on-every-position-tick
  // the note above is about. Numbers compare equal.
  const { gridSize, gridOffsetX, gridOffsetY } = grid ?? scene

  const lines = useMemo(
    () => gridLines({ gridSize, gridOffsetX, gridOffsetY }, imageWidth, imageHeight),
    [gridSize, gridOffsetX, gridOffsetY, imageWidth, imageHeight],
  )

  const draw = useCallback(
    (context: KonvaContext) => {
      // Built once and stroked twice. A path survives `stroke()`, so the halo and
      // the line share it and the coordinates are only walked once.
      context.beginPath()
      for (const x of lines.vertical) {
        context.moveTo(x, 0)
        context.lineTo(x, imageHeight)
      }
      for (const y of lines.horizontal) {
        context.moveTo(0, y)
        context.lineTo(imageWidth, y)
      }

      context.lineWidth = HALO_WIDTH / scale
      context.strokeStyle = HALO_COLOUR
      context.stroke()

      context.lineWidth = LINE_WIDTH / scale
      context.strokeStyle = LINE_COLOUR
      context.stroke()
    },
    [lines, scale, imageWidth, imageHeight],
  )

  // The DM's switch, honoured here rather than by the caller so that every board —
  // the played one and any preview — obeys it without being asked to.
  if (!scene.gridVisible) return null

  return <Shape listening={false} perfectDrawEnabled={false} sceneFunc={draw} />
})
