import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Layer, Rect } from 'react-konva'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import type Konva from 'konva'

import { setCursor, swallowLeftPress } from '@/components/board/konvaPointer'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { useFog, useFogMode } from '@/hooks/useFog'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicFog } from '@convex/lib/fog'
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

/** Where a gesture started and where the pointer is now, both in image space. */
type Band = { from: Point; to: Point }

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
 * **One write per gesture, on release, deliberately un-throttled.** This is the opposite
 * of a token drag, where invariant 2 asks for ten writes a second so that everybody
 * watches the coin move: nobody wants to watch a rectangle rubber-band on somebody else's
 * screen, and a fog rectangle has no intermediate state anybody at the table needs. So
 * the band is local until the mouse comes up, and the map goes dark for the party in one
 * step.
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
  //
  // ⚠️ **The member is taken and not the object, and that is load-bearing rather than tidy.**
  // `useLobbyAction` returns a fresh literal every render, so a `commit` closed over the whole
  // thing had a fresh identity every render too — and the band effect below depends on
  // `commit` while `setBand` fires on every `mousemove`, which tore down and re-added both
  // `window` listeners sixty times a second for the length of every gesture. `run` is a
  // `useCallback([])`, so depending on it is what holds `commit` still. Parking `commit` in a
  // ref would have worked equally well and would have said none of this.
  const { run } = useLobbyAction()

  const drawing = isDm && mode === 'draw'
  const erasing = isDm && mode === 'erase'

  /**
   * The gesture, twice: in state so the band redraws, and in a ref so the handlers on
   * `window` below read where the pointer *is* rather than where it was when the
   * listener was attached.
   */
  const [band, setBand] = useState<Band | null>(null)
  const bandRef = useRef<Band | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)

  const commit = useCallback(() => {
    const gesture = bandRef.current
    bandRef.current = null
    setBand(null)
    if (gesture === null || dmCode === null) return

    const rect = snappedRect(gesture, scene)
    // A drag that snapped to nothing — a click, or a wobble inside one square. Dropped
    // silently rather than sent, because the band the DM was watching is already the
    // snapped one, so there was visibly nothing there to fog. `fog.draw` refuses a
    // zero-area rectangle anyway, and its reason is a data one worth reading: a
    // rectangle with no width hides nothing and has nothing on screen to click, so it
    // would sit on the scene for ever counting against the cap.
    if (rect.width === 0 || rect.height === 0) return

    void run('draw', 'Could not fog that area.', () =>
      drawFog({ code, dmCode, sceneId: scene._id, ...rect }),
    )
  }, [code, dmCode, drawFog, run, scene])

  // Held still for the draw surface's sake. With the cursor handlers hoisted to module scope
  // this is the only prop on that shape that could still change identity, and one unstable
  // handler is enough to make Konva rebind on every frame of a band — a half-applied
  // discipline that reads as if it had been applied.
  const begin = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    // Left button only: a right-click is not a gesture and a middle-drag belongs to the
    // pan, which `BoardStage` claims on the container before Konva ever hears about it.
    if (event.evt.button !== 0) return

    const stage = event.target.getStage()
    const point = stage?.getRelativePointerPosition()
    if (!stage || !point) return

    // Konva binds the stage's drag with a namespaced `mousedown` listener, and the stage
    // is `draggable` so the map can be panned from anywhere. Cancelling the bubble is
    // what stops a rubber band panning the board underneath itself —
    // `TokenHealthBar.swallowLeftPress` is the same trick against the same mechanism one
    // level down.
    event.cancelBubble = true

    stageRef.current = stage
    bandRef.current = { from: point, to: point }
    setBand(bandRef.current)
  }, [])

  const banding = band !== null

  /**
   * The rest of the gesture, on `window` rather than on the shape.
   *
   * `BoardStage`'s own pan says why in one line: a drag that runs off the edge of the
   * canvas should keep going, and should still end when the button comes up somewhere
   * else entirely. Fogging the far edge of a map is exactly that drag, and a mouse-up
   * Konva never sees is a band that never commits and never clears.
   *
   * `setPointersPositions` is how a raw browser event is handed to Konva — the same
   * method its own HTML drag-and-drop support uses — and `getRelativePointerPosition`
   * then inverts the *stage's live transform*, which is this camera. That is
   * `toImageSpace` with the numbers the stage is actually painting with rather than the
   * ones this render was handed, which is the same reason `useTokenMove.nodePoint` reads
   * a dragged node's own position instead of converting a pointer.
   */
  useEffect(() => {
    const stage = stageRef.current
    if (!banding || !stage) return

    const move = (event: MouseEvent) => {
      stage.setPointersPositions(event)
      const point = stage.getRelativePointerPosition()
      const current = bandRef.current
      if (point === null || current === null) return
      bandRef.current = { from: current.from, to: point }
      setBand(bandRef.current)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', commit)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', commit)
    }
  }, [banding, commit])

  // Putting the tool down mid-drag abandons the band rather than committing it. The DM
  // reached for another control while holding the mouse, which is not a decision about
  // where the fog goes — and a band left on screen with no listeners behind it would be
  // a rectangle that never lands and never leaves.
  useEffect(() => {
    if (drawing) return
    bandRef.current = null
    setBand(null)
  }, [drawing])

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
  const drawn = rects ?? []
  if (drawn.length === 0 && !drawing) return null

  const preview = band === null ? null : snappedRect(band, scene)

  return (
    <Layer listening={drawing || erasing} opacity={isDm ? DM_FOG_OPACITY : 1}>
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

      {drawn.map((rect) => (
        <FogRect key={rect._id} rect={rect} listening={erasing} onErase={erase} />
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
    </Layer>
  )
})

type FogRectProps = {
  /** The row as it arrived from `fog.list`, held by reference — see the memo below. */
  rect: PublicFog
  /** Whether the eraser is armed. Nothing else on this board makes a rectangle pressable. */
  listening: boolean
  /**
   * One function for the whole list, given the rectangle it happened to, rather than one
   * closed over each row. `TokenCoinProps` states the rule and the reason at length.
   */
  onErase: (fogId: Id<'fogRects'>) => void
}

/**
 * ONE FOGGED RECTANGLE, and it is memoised for `TokenCoin`'s reason with numbers of the same
 * order.
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
 */
const FogRect = memo(function FogRect({ rect, listening, onErase }: FogRectProps) {
  return (
    <Rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={FOG_FILL}
      // The eraser is a click on a rectangle the client was *sent*, which is why rectangles
      // are rows rather than one blob of geometry on the scene — see `publicFogValidator`.
      // Deaf to the pointer at every other moment, including while the draw tool is down.
      listening={listening}
      onMouseDown={swallowLeftPress}
      onClick={() => onErase(rect._id)}
      onMouseEnter={pointerCursor}
      onMouseLeave={clearCursor}
      perfectDrawEnabled={false}
    />
  )
})

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
