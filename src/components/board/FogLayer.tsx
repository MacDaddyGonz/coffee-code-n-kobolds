import { memo, useCallback } from 'react'
import { Circle, Layer, Line, Rect } from 'react-konva'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import type Konva from 'konva'

import { setCursor, swallowLeftPress } from '@/components/board/konvaPointer'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { useFog, useFogMode } from '@/hooks/useFog'
import { usePolygonDraw } from '@/hooks/usePolygonDraw'
import { useRubberBand, type Band } from '@/hooks/useRubberBand'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicFog } from '@convex/lib/fog'
import { startsCovered } from '@convex/lib/fogBase'
import type { Grid, Point, Rect as ImageRect } from '@convex/lib/grid'
import { isUsableGrid, snapToGrid } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * Near-black rather than `#000000`, matching the ink the health bar's track uses: a
 * pure black rectangle over a dark cave map reads as a hole in the canvas, and this
 * still reads as *covered*.
 */
const FOG_FILL = '#05070d'

/**
 * How much of the map shows through the DM's own fog.
 *
 * The layer model is that you see through the upper layers to what is below, and the DM
 * has to see what they have covered — a DM who cannot see their own map cannot place
 * anything on the part of it that matters. Opaque for everybody else, because for a
 * player the rectangle *is* the wall.
 *
 * ⚠️ On the `Layer` rather than each `Rect`, which is `TokenLayers`' arrangement and has
 * one visible consequence: Konva multiplies opacity down to each child, so two
 * overlapping rectangles read darker than one. Left alone — the darker patch is honest
 * about the DM having covered that square twice, and the alternative is caching the
 * whole layer to a buffer canvas on every draw.
 */
const DM_FOG_OPACITY = 0.55

/** The rubber band. White dashes on a dark wash, so it reads on any map art. */
const BAND_STROKE = '#ffffff'
const BAND_FILL = 'rgba(5, 7, 13, 0.45)'
/** Screen-pixel weights, divided by the scale so they hold at any zoom. */
const BAND_WIDTH = 2
const BAND_DASH = 6

/**
 * The grab handle on the first vertex of an outline in progress — **the** way to close a
 * polygon, and the reason `usePolygonDraw` measures no distance in image space.
 *
 * A radius in screen pixels divided by the camera scale, exactly as the band's stroke is, so
 * the target is the same size on a zoomed-out map as on a zoomed-in one. Doing it the other
 * way — a fixed image-space radius — makes the handle a speck at 25% and a dinner plate at
 * 400%, on a gesture whose whole difficulty is landing on one square.
 */
const CLOSE_HANDLE_RADIUS = 6

export type FogLayerProps = {
  code: string
  /**
   * Present means this browser holds the DM code. It decides **how the fog is drawn and
   * whether it answers the pointer**, and decides nothing about what arrived: `fog.list`
   * is ungated and sends every rectangle to everybody, because a corridor the party
   * cannot see is dark on the party's screen too. See the header of `convex/fog.ts`.
   */
  dmCode: string | null
  /** The map being fogged: its grid, for the snap, and its extent, for the draw surface. */
  scene: PublicScene
  /** The camera's scale, needed for the same reason `GridOverlay` needs it. */
  scale: number
}

/**
 * THE BLACKED-OUT PARTS OF THE MAP, and the DM's two gestures over them.
 *
 * ⚠️ **This layer takes the pointer, and it is the first overlay on this board that ever
 * does.** `TokenHpPopover` states the standing rule and `DiceTrayLayer` inherits it:
 * anything laid over the canvas is pointer-transparent by default and opts back in only
 * where it draws something clickable, because an overlay that eats a click is a token the
 * DM cannot pick up and it fails *silently* — a transparent box has nothing on screen to
 * explain why the map has stopped responding.
 *
 * Every clause of that rule is kept. The layer is `listening={false}` for a player
 * always, and for the DM whenever no tool is armed; the eraser listens only on the
 * rectangles it can actually rub out; and the draw surface, which genuinely does swallow
 * every press on the map, exists only while the DM is holding a tool that is *for*
 * pressing on the map. The failure the rule is about is a silent one, and this one
 * cannot be silent: arming a tool is a deliberate act with a lit button in DM tools and
 * a crosshair under the cursor, and `FogTools`' first control turns it off.
 *
 * **The gestures are `useRubberBand` and `usePolygonDraw`**, one for each shape kind, both
 * over `useStagePointer`. One write per gesture, un-throttled — the argument for that lives on
 * the band hook, along with the listener-identity trap this component used to carry a
 * paragraph about and no longer has to.
 *
 * ⚠️ **Two shapes and exactly two, which is what Roll20 offers and there is no third.** They
 * are two *modes* rather than one tool with a setting, because the lifecycles do not resemble
 * each other: a rectangle is press-drag-release and a polygon is a sequence of clicks with two
 * ways to finish. Only one is ever armed, so only one draw surface is ever mounted and there
 * is no question about which gesture a press belongs to.
 *
 * **Memoised, and `scale` is the reason it is worth anything.** The other three props are a
 * code, a secret and a scene row the subscription holds still, and the scale changes on a
 * zoom rather than on a pan — so with this in place a pan and a calibration drag reconcile
 * no fog at all, where before every frame of either re-entered this component and walked its
 * whole rectangle list. `TokenCoin` makes the same trade one level down and states the
 * numbers; the mode and the rectangles arrive through hooks rather than props, so arming a
 * tool and drawing a rectangle still re-render this regardless of the memo.
 */
export const FogLayer = memo(function FogLayer({ code, dmCode, scene, scale }: FogLayerProps) {
  const isDm = dmCode !== null
  const rects = useFog(code, scene._id, dmCode)
  const { mode } = useFogMode(code)

  const drawFog = useMutation(api.fog.draw)
  const eraseFog = useMutation(api.fog.erase)
  // The idiom every DM control on this board uses, and it is what puts the server's own
  // wording in front of the DM: `fog.draw`'s `SceneFull` refusal names the two ways out
  // of a full map, and a toast of it is the whole handling that refusal needs.
  //
  // ⚠️ **Draw only, and the eraser deliberately does not share it.** The hook runs one
  // call at a time — the `inFlight` ref is a double-click guard, and it *returns* rather
  // than queueing — which is right for a button that can be pressed twice by accident and
  // wrong for a gesture the DM repeats as fast as they can click. Rubbing out four
  // rectangles across a corridor is four independent deletes, there is no control to
  // disable while one is in flight, and the rectangle vanishing is the whole of the
  // feedback. So `erase` reports the way `Board` reports a refused move: the server's own
  // words, in a toast, over a board that has already settled.
  const { run } = useLobbyAction()

  const drawing = isDm && mode === 'draw'
  const tracing = isDm && mode === 'polygon'
  const erasing = isDm && mode === 'erase'

  const commit = useCallback(
    (gesture: Band) => {
      if (dmCode === null) return

      const rect = snappedRect(gesture, scene)
      // A drag that snapped to nothing — a click, or a wobble inside one square. Dropped
      // silently rather than sent, because the band the DM was watching is already the
      // snapped one, so there was visibly nothing there to fog. `fog.draw` refuses a
      // zero-area rectangle anyway, and its reason is a data one worth reading: a
      // rectangle with no width hides nothing and has nothing on screen to click, so it
      // would sit on the scene for ever counting against the cap.
      if (rect.width === 0 || rect.height === 0) return

      void run('draw', 'Could not fog that area.', () =>
        drawFog({ code, dmCode, sceneId: scene._id, shape: { kind: 'rect', ...rect } }),
      )
    },
    [code, dmCode, drawFog, run, scene],
  )

  const { begin, band } = useRubberBand({ enabled: drawing, onCommit: commit })

  /**
   * ⚠️ **Vertices snap the way a rectangle's corners do, through the same zero-square trick.**
   * `snappedRect`'s docblock carries the argument: `snapToGrid` with a size of zero squares
   * lands on grid *intersections*, which is what a shape's edge wants. Doing anything else
   * here would give the two fog tools two different ideas of where a square is, on one map, on
   * the same click.
   *
   * An uncalibrated grid leaves the vertex where the DM put it, for `snappedRect`'s reason
   * too — snapping to NaN is a shape `requireDrawablePolygon` refuses, from a gesture that
   * looked like it worked.
   */
  const snapVertex = useCallback(
    (point: Point): Point => (isUsableGrid(scene) ? snapToGrid(point, scene, 0) : point),
    [scene],
  )

  const commitPolygon = useCallback(
    (points: Point[]) => {
      if (dmCode === null) return
      // Nothing is dropped silently here, unlike the band above. A polygon is deliberate work
      // — three clicks at least — so a refusal is worth a sentence, and the two the server can
      // give (all in a line, too many corners) both name what to do instead.
      void run('draw', 'Could not fog that area.', () =>
        drawFog({ code, dmCode, sceneId: scene._id, shape: { kind: 'polygon', points } }),
      )
    },
    [code, dmCode, drawFog, run, scene],
  )

  const polygon = usePolygonDraw({
    enabled: tracing,
    snap: snapVertex,
    onCommit: commitPolygon,
  })

  // A `useCallback` because it crosses into `FogRect`, whose memo is worth nothing unless the
  // handler it is handed survives a render. Two hundred rectangles is `TokenLayers`' arithmetic
  // exactly: one function for the whole list rather than one closed over each row.
  const erase = useCallback(
    (fogId: Id<'fogRects'>) => {
      if (dmCode === null) return
      void eraseFog({ code, dmCode, fogId }).catch((thrown: unknown) => {
        toast.error(errorMessage(thrown, 'Could not rub that out.'))
      })
    },
    [code, dmCode, eraseFog],
  )

  // Nothing to draw and nothing to press. Absent rather than transparent, which is
  // `TokenLayers`' rule for an empty layer and matters more here: an empty `Layer` is a
  // second canvas element over the map for as long as the game lasts.
  //
  // ⚠️ **The `covered` term inverts this early return, and it is the second of the two client
  // inversions that would have been missed.** *Nothing drawn, draw nothing* is right for a lit
  // map and is exactly backwards for a covered one, where nothing drawn means **paint the
  // whole map black**. A half-inverted fog is a map that lies, which is why the base lands as
  // one commit covering the server, both client cues and the tools panel.
  const drawn = rects ?? []
  const covered = startsCovered(scene.fogBase)
  if (drawn.length === 0 && !covered && !drawing && !tracing) return null

  const preview = band === null ? null : snappedRect(band, scene)
  // The committed vertices plus the elastic segment, as Konva's flat pair list. Drawn
  // `closed`, so what the DM watches is the region rather than the path — the same honesty
  // the snapped band has, applied to the gesture where the difference is larger.
  const outline =
    polygon.points.length === 0
      ? null
      : flatten(polygon.cursor === null ? polygon.points : [...polygon.points, polygon.cursor])

  return (
    <Layer listening={drawing || tracing || erasing} opacity={isDm ? DM_FOG_OPACITY : 1}>
      {/*
        The draw surface: the map itself, made pressable, and only while the DM is
        holding the draw tool. It spans the image and nothing beyond it, which is the
        right bound — fog off the edge of the map hides nothing.

        A press that lands on *existing* fog starts a band here too, because a
        `listening={false}` shape is not in the hit graph at all and the rectangles are
        deaf while the draw tool is down. So extending a dark area works the way it
        looks like it should, rather than doing nothing over the part already covered.

        `fill="transparent"` rather than no fill: Konva builds its hit graph by drawing
        each shape into a second canvas with a colour key, and a shape with nothing to
        fill draws nothing there and answers no press.
      */}
      {drawing ? (
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
      ) : null}

      {/*
        The polygon's draw surface. The same rectangle and the same reasoning as the band's,
        with one addition: `onDblClick` is the second way to close an outline, and it is bound
        here rather than on the line being drawn because the DM's last double-click lands on
        bare map far more often than on the two-pixel stroke they are dragging out.

        ⚠️ **Konva fires `dblclick` *after* both of the presses that make it up**, so the
        second one has already added a vertex by the time this runs. `usePolygonDraw.close`
        drops the duplicate rather than this surface trying to suppress a press on suspicion,
        which is argued on the hook — a press swallowed on suspicion is a corner that sometimes
        does not appear.
      */}
      {tracing ? (
        <Rect
          x={0}
          y={0}
          width={scene.imageWidth}
          height={scene.imageHeight}
          fill="transparent"
          onMouseDown={polygon.add}
          onDblClick={polygon.close}
          onMouseEnter={crosshairCursor}
          onMouseLeave={clearCursor}
        />
      ) : null}

      {/*
        ⚠️ **THE INVERSION, AND IT IS THE ONE THING IN THIS MILESTONE NO TEST CAN ASSERT.**

        Under a lit base each shape is painted as darkness and there is nothing underneath
        them. Under a covered base the whole image is painted first and each shape is then
        punched *out* of it with `destination-out`, which composites against this `Layer`'s
        own canvas — that is why `DM_FOG_OPACITY` stays on the `Layer` and not on the shapes,
        and it is what makes a hole a hole rather than a lighter patch.

        Konva's **hit graph does not apply composite operations**, so a revealed area still
        answers the pointer as its own rectangle. That is exactly what the eraser wants — the
        DM clicks the hole to cover it back up — and it is worth knowing because it looks like
        it should be the other way round.

        The rejected alternative was computing complement rectangles and painting those. It is
        O(n²) in the shape count, it turns a short-circuit containment test into a stencil
        composite, and it is the layers-of-paint model the roadmap declines under per-shape
        hide-or-reveal. **Verified by hand in two browsers, both bases, with overlapping
        shapes**, because there is nothing in `npm test` that can look at a canvas.
      */}
      {covered ? (
        <Rect
          x={0}
          y={0}
          width={scene.imageWidth}
          height={scene.imageHeight}
          fill={FOG_FILL}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}

      {drawn.map((shape) => (
        <FogShape
          key={shape._id}
          shape={shape}
          listening={erasing}
          covered={covered}
          onErase={erase}
        />
      ))}

      {/*
        The band, already snapped — so what the DM is watching is exactly the rectangle
        that will be written, rather than a smooth outline that jumps to the grid on
        release. It is also what makes the dropped zero-area gesture above honest: a drag
        inside one square shows nothing, so committing nothing is what it looked like.
      */}
      {preview ? (
        <Rect
          x={preview.x}
          y={preview.y}
          width={preview.width}
          height={preview.height}
          fill={BAND_FILL}
          stroke={BAND_STROKE}
          strokeWidth={BAND_WIDTH / scale}
          dash={[BAND_DASH / scale, BAND_DASH / scale]}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}

      {/*
        The outline in progress, in the band's own colours so the two tools read as one
        feature. `closed` while it is still being drawn, deliberately: an open polyline shows
        the path and a closed one shows the *region*, and the region is what is about to be
        written. Deaf to the pointer, so the surface underneath keeps taking every click.
      */}
      {outline ? (
        <Line
          points={outline}
          closed
          fill={BAND_FILL}
          stroke={BAND_STROKE}
          strokeWidth={BAND_WIDTH / scale}
          dash={[BAND_DASH / scale, BAND_DASH / scale]}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}

      {/*
        The grab handle on the first vertex — **the** way to close an outline, and the only
        shape in this layer that listens while the polygon tool is armed.

        It is drawn last so it sits above the draw surface and wins the press; Konva dispatches
        to the topmost hit-testing node and does not bubble between siblings, so the surface
        never sees this click and never adds a fourth vertex on top of the first.

        Only offered once there is a shape to close. Two vertices is a line, and a handle that
        closes nothing is a control that does nothing when pressed.
      */}
      {polygon.points.length >= 3 ? (
        <Circle
          x={polygon.points[0].x}
          y={polygon.points[0].y}
          radius={CLOSE_HANDLE_RADIUS / scale}
          fill={BAND_STROKE}
          stroke={FOG_FILL}
          strokeWidth={BAND_WIDTH / scale}
          onMouseDown={swallowLeftPress}
          onClick={polygon.close}
          onMouseEnter={pointerCursor}
          onMouseLeave={clearCursor}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Layer>
  )
})

type FogShapeProps = {
  /** The row as it arrived from `fog.list`, held by reference — see the memo below. */
  shape: PublicFog
  /** Whether the eraser is armed. Nothing else on this board makes a shape pressable. */
  listening: boolean
  /**
   * Whether this shape is a piece of darkness or a hole in it. A boolean rather than the
   * `FogBase` itself, because that is what the shape actually needs and a memo compares props
   * by reference — one derived value at the top beats two hundred `startsCovered` calls.
   */
  covered: boolean
  /**
   * One function for the whole list, given the shape it happened to, rather than one
   * closed over each row. `TokenCoinProps` states the rule and the reason at length.
   */
  onErase: (fogId: Id<'fogRects'>) => void
}

/**
 * ONE FOGGED SHAPE — a rectangle or a polygon — memoised for `TokenCoin`'s reason with
 * numbers of the same order.
 *
 * Up to two hundred of these, four `on*` props each, and react-konva compares handlers by
 * reference and answers a changed one by unbinding the old listener and binding the new one.
 * Built inline they were fresh arrows on every render of the layer — so eight hundred
 * detach/attach pairs per frame of a pan, of a calibration drag and of a rubber band, to
 * arrive back at the picture already on screen.
 *
 * The memo only pays because every prop above is held still: the row comes off the
 * subscription by reference, `listening` is a boolean, and `onErase` is the caller's
 * `useCallback`. The arrow inside is a fresh identity per render of *this* component, which
 * is fine and is the same arrangement `TokenCoin` uses — a render that did not happen builds
 * no closures.
 *
 * ⚠️ **`points` decides which node is drawn, and its absence means rectangle** — the stored
 * row's own convention, read here rather than restated as a `kind`. The two branches are
 * otherwise identical in every prop that matters, including the composite operation, which is
 * what makes a polygon a hole in a covered map exactly as a rectangle is.
 *
 * ⚠️ **A `Line` needs its points flattened on every render and a `Rect` does not**, which is
 * the one place these two branches genuinely cost different amounts. It is bounded by
 * `MAX_FOG_POLYGON_POINTS`, and the memo above is what keeps it off the frames of a pan — a
 * shape whose row has not changed does not re-render, so it does not re-flatten.
 */
const FogShape = memo(function FogShape({
  shape,
  listening,
  covered,
  onErase,
}: FogShapeProps) {
  // Darkness, or a hole punched through the darkness the layer painted first. The fill is
  // the same either way — under `destination-out` only the alpha matters — so this is one
  // value and not a second colour to keep in step.
  const composite = covered ? ('destination-out' as const) : undefined

  // The eraser is a click on a shape the client was *sent*, which is why these are rows
  // rather than one blob of geometry on the scene — see `publicFogValidator`. Deaf to the
  // pointer at every other moment, including while a draw tool is down.
  const pointer = {
    listening,
    onMouseDown: swallowLeftPress,
    onClick: () => onErase(shape._id),
    onMouseEnter: pointerCursor,
    onMouseLeave: clearCursor,
  }

  if (shape.points !== undefined) {
    return (
      <Line
        points={flatten(shape.points)}
        // A fog polygon is a region and never a path, so it is always closed and always
        // filled. Konva hit-tests a closed filled `Line` by its interior, which is what makes
        // the eraser work on one at all.
        closed
        fill={FOG_FILL}
        globalCompositeOperation={composite}
        {...pointer}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      fill={FOG_FILL}
      globalCompositeOperation={composite}
      {...pointer}
      perfectDrawEnabled={false}
    />
  )
})

/**
 * A point list as Konva wants it: `[x, y, x, y, …]`.
 *
 * ⚠️ **A pair list is the wire format and a flat list is Konva's**, and this is the one place
 * the two meet. `{ x, y }` is what the schema stores, what `polygonCovers` walks and what the
 * containment test on the server and in the browser both read — flattening at the boundary
 * keeps the flat form from leaking anywhere a `Point` is expected, where an off-by-one in the
 * index arithmetic is a shape that hides the wrong squares and looks plausible.
 */
function flatten(points: readonly Point[]): number[] {
  const flat: number[] = []
  for (const point of points) flat.push(point.x, point.y)
  return flat
}

/**
 * The rectangle a gesture asks for, on the grid.
 *
 * ⚠️ **`snapToGrid` with a size of zero squares, which is the whole trick and is worth
 * a sentence.** That function centres a token of `n` squares, and its half-square offset
 * is what makes a 1×1 land on a square's centre and a 2×2 on a corner. A *corner* is
 * what a rectangle's edge wants, and zero is the size whose half-offset is nothing — so
 * both ends of the band land on grid intersections and the DM fogs whole squares. The
 * alternative was flooring one corner and ceiling the other, which reads better and
 * needs its own arithmetic over `gridSize` and `gridOffset`: a second definition of
 * where a square is, in the one codebase whose grid module exists to have exactly one.
 *
 * An uncalibrated grid is committed unsnapped rather than snapped to NaN. `isUsableGrid`
 * guards the same division `cellOf` would do, and a non-finite rectangle is refused by
 * `requireDrawableRect` — which is fortunate, because `rectCovers` fails *open* on one:
 * fog that is drawn on every screen, that the DM believes in, and that hides nothing.
 *
 * Normalised here as well as on the server. Not the enforcement — `insertFogRect` calls
 * `normaliseFogRect` on every write, and three quarters of all drags need it — but the
 * preview has to be drawn and the zero-area test above has to compare a magnitude.
 */
function snappedRect(band: Band, grid: Grid): ImageRect {
  const usable = isUsableGrid(grid)
  const from = usable ? snapToGrid(band.from, grid, 0) : band.from
  const to = usable ? snapToGrid(band.to, grid, 0) : band.to

  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}

/**
 * The three cursors this layer paints, bound once at module scope.
 *
 * An arrow closed over nothing but a string literal is precisely the prop that would defeat
 * `FogRect`'s memo, so there is nowhere for these to live inside a component — the same reason
 * `TokenLayers` hoists one `onSelect` for a whole layer of coins rather than one per coin.
 */
const pointerCursor = (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, 'pointer')
const crosshairCursor = (event: Konva.KonvaEventObject<MouseEvent>) =>
  setCursor(event, 'crosshair')
const clearCursor = (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, '')
