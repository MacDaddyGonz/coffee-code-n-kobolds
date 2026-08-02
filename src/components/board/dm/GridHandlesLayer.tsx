import { useRef } from 'react'
import { Layer, Rect } from 'react-konva'
import type Konva from 'konva'

import { GRID_HANDLES, handleAnchor } from '@/lib/gridBox'
import type { GridBox, GridHandle } from '@/lib/gridBox'
import type { Point } from '@convex/lib/grid'

/**
 * A colour that is not the grid's.
 *
 * `GridOverlay` draws in black and white on purpose, so that it reads over any map art.
 * The calibration box has to be told apart from the thing it is calibrating at a glance,
 * and a third weight of grey would not manage it — so the box is the one coloured thing
 * on the board, and it is only ever on screen while the DM is holding the tool.
 */
const BOX_COLOUR = '#38bdf8'
const BOX_FILL = 'rgba(56, 189, 248, 0.12)'
const GRIP_FILL = '#ffffff'
const GRIP_INK = '#0c4a6e'

/**
 * Screen-pixel figures, divided by the scale wherever they are used — the same rule
 * `GridOverlay` and `TokenCoin` follow, and for the same reason: these are coordinates in
 * image space, so an undivided `12` is twelve *image* pixels, which is a grip the size of
 * a full square at 25% zoom and an invisible speck at 400%.
 */
const GRIP_SIZE = 12
const GRIP_STROKE = 1.5
const BOX_STROKE = 2

/**
 * What the pointer looks like over each grip, keyed by the union so a tenth handle fails
 * to compile here rather than arriving with the default arrow and no way to tell it
 * resizes anything.
 */
const HANDLE_CURSORS: Record<GridHandle, string> = {
  body: 'move',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
}

export type GridHandlesLayerProps = {
  /** The box to draw, in image space — the caller's draft if it has one, else the scene's. */
  box: GridBox
  /** The camera's scale. Needed for the same reason `GridOverlay` needs it. */
  scale: number
  /** A grip was taken. The caller snapshots the box this gesture is measured from. */
  onGrab: (handle: GridHandle) => void
  /** Cumulative pointer movement since the grab, in image space. Feed it to `dragBox`. */
  onMove: (handle: GridHandle, delta: Point) => void
  /** The pointer came up. Settle the write. */
  onRelease: () => void
}

/**
 * The eight grips and the body of the calibration box — what the DM actually grabs.
 *
 * **Mounted as the last child of the stage, which is the whole of how it wins the
 * pointer.** `BoardStage`'s docblock explains that the map and the grid are
 * `listening={false}`, so a press on empty map finds no node at all and Konva walks up to
 * the draggable Stage and pans. Drawn last, this layer is the topmost hit-testable thing
 * over the map, and no `zIndex` or `moveToTop` is needed to keep it there — the order the
 * children arrive in *is* the order, exactly as it is for the token layers.
 *
 * ⚠️ **Every grip cancels the bubble on `mousedown`.** Without it the press reaches the
 * Stage, the Stage is `draggable`, and the board pans underneath the gesture — and worse,
 * `stageOf` then sees the click on the way up and `onBackgroundClick` clears the DM's
 * selection every time they nudge the grid.
 *
 * The delta is read from the **stage pointer** rather than from the dragged node, which
 * is what makes the line below safe: after each move the grip is put back where the box
 * says it should be, so it stays glued to the box instead of floating off to wherever the
 * pointer went. It has to be able to disagree with the pointer — a corner drag takes one
 * axis and applies it to both, and a drag past the clamp moves nothing at all — and if
 * the delta were `node.position()` minus its start, resetting the node would be feeding
 * the gesture its own correction.
 */
export function GridHandlesLayer({
  box,
  scale,
  onGrab,
  onMove,
  onRelease,
}: GridHandlesLayerProps) {
  // Where the pointer was when the grip was taken, in image space. One gesture at a time,
  // so one ref rather than one per handle.
  const origin = useRef<Point | null>(null)

  // Konva's own container, which sits inside BoardStage's div — the same trick `TokenCoin`
  // uses. An inline style overrides the class-set cursor while the pointer is on a grip
  // and clearing it hands control straight back.
  const cursor = (event: Konva.KonvaEventObject<MouseEvent>, style: string) => {
    const container = event.target.getStage()?.container()
    if (container) container.style.cursor = style
  }

  return (
    <Layer>
      {GRID_HANDLES.map((handle) => {
        const isBody = handle === 'body'
        const anchor = handleAnchor(box, handle)
        const size = isBody ? box.side : GRIP_SIZE / scale
        // Konva positions a rect by its top-left corner; every anchor is a centre.
        const at = { x: anchor.x - size / 2, y: anchor.y - size / 2 }

        return (
          <Rect
            key={handle}
            x={at.x}
            y={at.y}
            width={size}
            height={size}
            // A faint wash rather than `transparent`. It has to hit-test — a fill-less
            // rect answers the pointer only on its stroke — and the DM should be able to
            // see the region that translates the whole grid rather than discover it.
            fill={isBody ? BOX_FILL : GRIP_FILL}
            stroke={isBody ? BOX_COLOUR : GRIP_INK}
            strokeWidth={(isBody ? BOX_STROKE : GRIP_STROKE) / scale}
            cornerRadius={isBody ? 0 : (GRIP_SIZE / scale) * 0.2}
            perfectDrawEnabled={false}
            draggable
            onMouseEnter={(event) => cursor(event, HANDLE_CURSORS[handle])}
            onMouseLeave={(event) => cursor(event, '')}
            onMouseDown={(event) => {
              // See the ⚠️ above: without this the stage pans under the gesture and the
              // selection is cleared on the way up.
              event.cancelBubble = true
            }}
            onDragStart={(event) => {
              event.cancelBubble = true
              origin.current = event.target.getStage()?.getRelativePointerPosition() ?? null
              onGrab(handle)
            }}
            onDragMove={(event) => {
              event.cancelBubble = true
              const start = origin.current
              const now = event.target.getStage()?.getRelativePointerPosition()
              if (start && now) onMove(handle, { x: now.x - start.x, y: now.y - start.y })
              // Back onto the box. React will place it again on the next render with the
              // box this move produced; this is what stops it drifting in between, and
              // while the side is clamped it is the only thing that does.
              event.target.position(at)
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true
              origin.current = null
              event.target.position(at)
              cursor(event, HANDLE_CURSORS[handle])
              onRelease()
            }}
          />
        )
      })}
    </Layer>
  )
}
