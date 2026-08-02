import { useCallback, useEffect, useRef, useState } from 'react'
import { Layer, Rect } from 'react-konva'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import type Konva from 'konva'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { useFog, useFogMode } from '@/hooks/useFog'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Grid, Point, Rect as ImageRect } from '@convex/lib/grid'
import { isUsableGrid, snapToGrid } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

// WIRING: nothing mounts this yet. `Board.tsx` and `BoardStage.tsx` belong to the grid
// work happening in parallel, so the two lines below are deliberately not in this change
// — they are the whole of what is missing.
//
// 1. **`Board.tsx`, inside `<BoardStage>`, beside `<TokenLayers>`:**
//
//        <FogLayer
//          code={code}
//          dmCode={dm.dmCode}
//          scene={scene}
//          scale={camera.camera.scale}
//        />
//
//    Four props and no handlers. The rectangles, the armed tool, both writes and the
//    cursor are held here, so nothing crosses `BoardStage` and no callback has to be
//    threaded from the right-hand pane into the Konva tree.
//
// 2. **Where in the stack: after the player token layer and before the GM one.** Konva
//    paints layers in child order, and the order this wants is Background tokens →
//    player tokens → *fog* → GM tokens. The DM's own creatures then stay crisp above
//    their own veil, which is the point of the position: everything the veil dims is
//    something the party has lost, and everything above it is the DM's to place.
//
//    ⚠️ `TokenLayers` renders all three token layers as one fragment, so there is no
//    slot between them today. Two ways to make one, and the choice is the wiring
//    author's: give `TokenLayers` a `betweenPlayerAndGm` slot prop, or mount `<FogLayer>`
//    *after* `<TokenLayers>` and accept the veil sitting over the GM layer too. The
//    fallback costs the DM a dimmed monster and nothing else — no player is sent a GM
//    row (`maySee`), so nothing is hidden from anybody who was going to see it — but on
//    a player's screen it also blacks out a coin their own seat controls standing in
//    fog, which is the one case `foggedTokenIds` goes out of its way to keep visible.
//
// 3. **The mode does not arrive as a prop.** `useFogMode(code)` is a subscribable cell
//    keyed by game code, for the reason `useBoardLayers` is one: the control is in
//    `FogTools` inside the right-hand pane and the gesture is here inside the map pane.
//    So mounting `FogTools` anywhere in DM tools is enough to arm this — nothing to
//    thread, and nothing for `GameShell` to hold.
//
// 4. **`FogTools` mounts with the same two props every DM panel takes:**
//    `<FogTools code={code} dmCode={dmCode} />`.

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
 */
export function FogLayer({ code, dmCode, scene, scale }: FogLayerProps) {
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
  const action = useLobbyAction()

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

    void action.run('draw', 'Could not fog that area.', () =>
      drawFog({ code, dmCode, sceneId: scene._id, ...rect }),
    )
  }, [action, code, dmCode, drawFog, scene])

  const begin = (event: Konva.KonvaEventObject<MouseEvent>) => {
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
  }

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

  const erase = (fogId: Id<'fogRects'>) => {
    if (dmCode === null) return
    void eraseFog({ code, dmCode, fogId }).catch((thrown: unknown) => {
      toast.error(errorMessage(thrown, 'Could not rub that out.'))
    })
  }

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
          onMouseEnter={(event) => cursor(event, 'crosshair')}
          onMouseLeave={(event) => cursor(event, '')}
        />
      ) : null}

      {drawn.map((rect) => (
        <Rect
          key={rect._id}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={FOG_FILL}
          // The eraser is a click on a rectangle the client was *sent*, which is why
          // rectangles are rows rather than one blob of geometry on the scene — see
          // `publicFogValidator`. Deaf to the pointer at every other moment, including
          // while the draw tool is down.
          listening={erasing}
          onMouseDown={swallowLeftPress}
          onClick={() => erase(rect._id)}
          onMouseEnter={(event) => cursor(event, 'pointer')}
          onMouseLeave={(event) => cursor(event, '')}
          perfectDrawEnabled={false}
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
    </Layer>
  )
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
 * The container trick `TokenCoin` and `TokenHealthBar` both use: an inline style on
 * Konva's own container overrides the resting cursor `BoardStage`'s div sets with a
 * class, and clearing it hands control straight back.
 */
function cursor(event: Konva.KonvaEventObject<MouseEvent>, style: string) {
  const container = event.target.getStage()?.container()
  if (container) container.style.cursor = style
}

/** A press on a rectangle is an erase, not the start of a pan. See `begin` above. */
function swallowLeftPress(event: Konva.KonvaEventObject<MouseEvent>) {
  if (event.evt.button !== 0) return
  event.cancelBubble = true
}
