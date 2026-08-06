import { memo, useCallback } from 'react'
import { Layer, Line, Rect } from 'react-konva'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import type Konva from 'konva'

import { setCursor, swallowLeftPress } from '@/components/board/konvaPointer'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { usePolylineDraw } from '@/hooks/usePolylineDraw'
import { useWallMode, useWalls } from '@/hooks/useWalls'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import { isUsableGrid, snapToGrid } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'
import type { PublicWall } from '@convex/lib/walls'

/**
 * The barrier's ink: a warm, solid line that reads against both a dark cave and a lit
 * tavern, and is deliberately nothing like the fog band's white dashes or the calibrator's
 * blue. Three overlays can be armed on this board and the DM has to be able to tell at a
 * glance which one answered a drag.
 */
const WALL_STROKE = '#f97316'
/** Screen-pixel weights, divided by the scale so they hold at any zoom — `GridOverlay`'s rule. */
const WALL_WIDTH = 3
/** The line in progress, in the same colour and dashed the way every live gesture here is. */
const DRAFT_DASH = 6
/**
 * How much wider than the stroke the invisible click target is.
 *
 * A three-pixel line is not something anybody can hit, and Konva hit-tests a `Line` by its
 * stroke — so the eraser gets a second, transparent copy of every wall drawn underneath at a
 * generous width. `hitStrokeWidth` would do the same job with one node, and is deliberately
 * not used: it is in *image* pixels with no way to divide by the camera scale, so a target
 * that was comfortable at 100% would be a speck at 25%.
 */
const HIT_WIDTH = 14

export type WallLayerProps = {
  code: string
  /**
   * Present means this browser holds the DM code. It decides **whether the walls are drawn
   * at all**, and decides nothing about what arrived: `walls.list` is ungated and sends
   * every barrier to everybody, because a client that has not been handed the geometry
   * cannot stop a drag against it. See the header of `convex/walls.ts`.
   */
  dmCode: string
  /** The map being walled: its grid, for the snap, and its extent, for the draw surface. */
  scene: PublicScene
  /** The camera's scale, needed for the same reason `GridOverlay` needs it. */
  scale: number
}

/**
 * THE BARRIERS ON THE MAP, and the DM's two gestures over them.
 *
 * ⚠️⚠️ **DRAWN FOR THE DM ONLY, AND EVERY CLIENT IS SENT THE GEOMETRY ANYWAY — THE TWO
 * HALVES OF THAT SENTENCE ARE BOTH DELIBERATE AND THEY ARE NOT IN TENSION.** A player's
 * browser needs the walls, because the whole feature is a coin that slides up to one and
 * stops, and `useTokenMove` cannot do that against geometry it does not hold. A player's
 * *screen* does not need them: a wall traced over the wall the map already has printed on it
 * would be an orange line over a drawn one, and the map is what the party is meant to be
 * reading.
 *
 * ⚠️ **The residual, said here as well as in the panel's copy and ADR 0015's costs, because
 * a partial guard described as a whole one is worse than no guard.** A wall traced over the
 * map's own drawn wall leaks nothing the fully-downloaded image does not already leak. A
 * barrier where the map shows **no** wall — an invisible ward, a magically sealed door — is
 * information the picture does not carry, and devtools recovers it. That is the whole of
 * what is exposed, it is exposed to a table of trusted colleagues, and the alternative is
 * withholding the geometry and losing the feature.
 *
 * **The gesture is `usePolylineDraw`**, which is deliberately not `usePolygonDraw` — a wall
 * takes two corners rather than three, and a repeated first-and-last vertex is how a DM
 * seals a room rather than a redundant corner to be dropped. That hook's docblock argues the
 * pair at length.
 *
 * **The pointer rule every overlay on this board keeps is kept here** exactly as `FogLayer`
 * keeps it: the layer is `listening={false}` whenever no wall tool is armed, the eraser
 * listens only on the lines it can actually rub out, and the draw surface — which genuinely
 * swallows every press on the map — exists only while the DM is holding a tool that is *for*
 * pressing on the map. The failure that rule is about is a silent one, and this one cannot
 * be: arming is a lit button in DM tools with a crosshair under the cursor, and `WallTools`'
 * first control turns it off.
 *
 * Memoised for `FogLayer`'s reason and with its numbers: three of the four props are a code,
 * a secret and a scene row the subscription holds still, and the scale changes on a zoom
 * rather than on a pan — so a pan and a calibration drag reconcile no walls at all.
 */
export const WallLayer = memo(function WallLayer({
  code,
  dmCode,
  scene,
  scale,
}: WallLayerProps) {
  const walls = useWalls(code, scene._id, dmCode)
  const { mode } = useWallMode(code)

  const addWall = useMutation(api.walls.add)
  const removeWall = useMutation(api.walls.remove)
  // The idiom every DM control on this board uses, and it is what puts the server's own
  // wording in front of the DM: `walls.add`'s `SceneFull` and corner-count refusals both
  // name the way out, and a toast of one is the whole handling it needs.
  //
  // ⚠️ **Draw only, and the eraser deliberately does not share it** — `FogLayer`'s note, for
  // its reason: the hook runs one call at a time, which is right for a button pressed twice
  // by accident and wrong for a gesture the DM repeats as fast as they can click.
  const { run } = useLobbyAction()

  const drawing = mode === 'draw'
  const erasing = mode === 'erase'

  /**
   * ⚠️ **Corners snap the way a fog shape's do, through the same zero-square trick.**
   * `snapToGrid` with a size of zero squares lands on grid *intersections*, which is what a
   * barrier's endpoints want — a wall belongs on the line between two squares rather than
   * through the middle of one. `snappedRect` in `FogLayer` carries the long argument, and
   * sharing it matters more here than there: a wall that ran through square centres would
   * refuse a token that is standing legally on its own square, and there would be nothing on
   * screen to explain why.
   *
   * An uncalibrated grid leaves the corner where the DM put it, for that function's reason —
   * snapping to NaN is a wall `requireDrawableWall` refuses, from a gesture that looked like
   * it worked.
   */
  const snapCorner = useCallback(
    (point: Point): Point => (isUsableGrid(scene) ? snapToGrid(point, scene, 0) : point),
    [scene],
  )

  const commit = useCallback(
    (points: Point[]) => {
      // Nothing is dropped silently, unlike the fog band. A wall is deliberate work — two
      // clicks at least — so a refusal is worth a sentence, and all three the server can
      // give (too many corners, all in one place, the map is full) name what to do instead.
      void run('wall', 'Could not draw that wall.', () =>
        addWall({ code, dmCode, sceneId: scene._id, points }),
      )
    },
    [addWall, code, dmCode, run, scene._id],
  )

  const line = usePolylineDraw({ enabled: drawing, snap: snapCorner, onCommit: commit })

  // A `useCallback` because it crosses into `Wall`, whose memo is worth nothing unless the
  // handler it is handed survives a render — `TokenLayers`' arithmetic, one layer over.
  const erase = useCallback(
    (wallId: Id<'walls'>) => {
      void removeWall({ code, dmCode, wallId }).catch((thrown: unknown) => {
        toast.error(errorMessage(thrown, 'Could not rub that wall out.'))
      })
    },
    [code, dmCode, removeWall],
  )

  // Nothing to draw and nothing to press. Absent rather than transparent, which is
  // `TokenLayers`' rule for an empty layer and matters for its reason: an empty `Layer` is a
  // second canvas element over the map for as long as the game lasts.
  const drawn = walls ?? []
  if (drawn.length === 0 && !drawing) return null

  // The corners so far plus the elastic segment, as Konva's flat pair list. Drawn **open**,
  // which is the one visible difference from the fog polygon's preview and is the honest
  // one: a wall is a path and not a region, so what the DM watches is the line that will be
  // written rather than an area that will not be.
  const draft =
    line.points.length === 0
      ? null
      : flatten(line.cursor === null ? line.points : [...line.points, line.cursor])

  return (
    <Layer listening={drawing || erasing}>
      {/*
        The draw surface: the map itself, made pressable, and only while the DM is holding
        the draw tool. It spans the image and nothing beyond it, which is the right bound —
        a barrier off the edge of the map stops nothing.

        `onDblClick` finishes the line and is bound here rather than on the line being drawn,
        because the DM's last double-click lands on bare map far more often than on the
        three-pixel stroke they are dragging out. Konva fires `dblclick` *after* both presses
        that make it up, so `usePolylineDraw.finish` drops the duplicate corner rather than
        this surface trying to suppress a press on suspicion.

        `fill="transparent"` rather than no fill: Konva builds its hit graph by drawing each
        shape into a second canvas with a colour key, and a shape with nothing to fill draws
        nothing there and answers no press.
      */}
      {drawing ? (
        <Rect
          x={0}
          y={0}
          width={scene.imageWidth}
          height={scene.imageHeight}
          fill="transparent"
          onMouseDown={line.add}
          onDblClick={line.finish}
          onMouseEnter={crosshairCursor}
          onMouseLeave={clearCursor}
        />
      ) : null}

      {drawn.map((wall) => (
        <Wall
          key={wall._id}
          wall={wall}
          listening={erasing}
          scale={scale}
          onErase={erase}
        />
      ))}

      {/*
        The line in progress, dashed so it reads as a gesture rather than as a wall that has
        already landed, and deaf to the pointer so the surface underneath keeps taking every
        click.
      */}
      {draft ? (
        <Line
          points={draft}
          stroke={WALL_STROKE}
          strokeWidth={WALL_WIDTH / scale}
          dash={[DRAFT_DASH / scale, DRAFT_DASH / scale]}
          lineCap="round"
          lineJoin="round"
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
    </Layer>
  )
})

type WallProps = {
  /** The row as it arrived from `walls.list`, held by reference — see the memo below. */
  wall: PublicWall
  /** Whether the eraser is armed. Nothing else on this board makes a wall pressable. */
  listening: boolean
  /** For the two stroke widths, both of which are screen pixels divided by the camera. */
  scale: number
  /** One function for the whole list, given the wall it happened to — `TokenCoinProps`' rule. */
  onErase: (wallId: Id<'walls'>) => void
}

/**
 * ONE WALL, as two `Line`s: the one you see and the one you can hit.
 *
 * ⚠️ **The second node is not decoration and it is not `hitStrokeWidth`.** Konva hit-tests a
 * stroked line by its stroke, and this one is three screen pixels wide — a target nobody can
 * land on, on the gesture whose whole difficulty is landing on it. `hitStrokeWidth` would fix
 * that with one node and is in *image* pixels with no route to the camera scale, so a target
 * comfortable at 100% would be a speck at 25% and a corridor at 400%. A transparent sibling
 * takes the same `/ scale` division every other weight on this board takes.
 *
 * The visible line is `listening={false}` unconditionally, so there is exactly one node in
 * the hit graph per wall and no question about which of the two answered a press.
 *
 * Memoised for `FogShape`'s reason with numbers of the same order: up to a hundred of these,
 * four `on*` props each, and react-konva answers a changed handler by unbinding the old
 * listener and binding the new one. The memo only pays because every prop is held still —
 * the row comes off the subscription by reference, `listening` and `scale` are primitives,
 * and `onErase` is the caller's `useCallback`.
 */
const Wall = memo(function Wall({ wall, listening, scale, onErase }: WallProps) {
  const points = flatten(wall.points)

  return (
    <>
      <Line
        points={points}
        stroke={WALL_STROKE}
        strokeWidth={WALL_WIDTH / scale}
        lineCap="round"
        lineJoin="round"
        listening={false}
        perfectDrawEnabled={false}
      />
      <Line
        points={points}
        stroke="transparent"
        strokeWidth={HIT_WIDTH / scale}
        lineCap="round"
        lineJoin="round"
        listening={listening}
        onMouseDown={swallowLeftPress}
        onClick={() => onErase(wall._id)}
        onMouseEnter={pointerCursor}
        onMouseLeave={clearCursor}
        perfectDrawEnabled={false}
      />
    </>
  )
})

/**
 * A point list as Konva wants it: `[x, y, x, y, …]`.
 *
 * ⚠️ **A pair list is the wire format and a flat list is Konva's**, and this is the second
 * place the two meet — `FogLayer` has the other. Deliberately duplicated rather than shared:
 * four lines whose whole job is to be the boundary of one component, and a helper reached for
 * across the board directory would make an off-by-one in the index arithmetic a bug in two
 * features at once.
 */
function flatten(points: readonly Point[]): number[] {
  const flat: number[] = []
  for (const point of points) flat.push(point.x, point.y)
  return flat
}

/**
 * The two cursors this layer paints, bound once at module scope — `FogLayer`'s rule and its
 * reason: an arrow closed over nothing but a string literal is precisely the prop that would
 * defeat `Wall`'s memo.
 */
const pointerCursor = (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, 'pointer')
const crosshairCursor = (event: Konva.KonvaEventObject<MouseEvent>) =>
  setCursor(event, 'crosshair')
const clearCursor = (event: Konva.KonvaEventObject<MouseEvent>) => setCursor(event, '')
