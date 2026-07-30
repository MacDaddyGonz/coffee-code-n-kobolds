import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'

import { BoardEmpty } from '@/components/board/BoardEmpty'
import { BoardStage } from '@/components/board/BoardStage'
import { TokenLayer } from '@/components/board/TokenLayer'
import { ZoomControls } from '@/components/board/ZoomControls'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoardToken } from '@/hooks/useBoard'
import { useBoard } from '@/hooks/useBoard'
import { useBoardCamera } from '@/hooks/useBoardCamera'
import { useBoardKeys } from '@/hooks/useBoardKeys'
import type { Dm } from '@/hooks/useDm'
import { useSmoothPositions, useTokenMove } from '@/hooks/useTokenMove'
import { useTokenSelection } from '@/hooks/useTokenSelection'
import type { Id } from '@convex/_generated/dataModel'

export type BoardProps = {
  code: string
  dm: Dm
  playerId: Id<'players'>
  /** The character this seat is playing, which decides which token it may drag. */
  myCharacterId: Id<'characters'> | null
  /**
   * The DM's map panel, rendered over the canvas. A slot rather than something this
   * component builds, because the panel is DM-only and its own owner: the board has
   * no business knowing what is in it, and a player's board is given nothing to put
   * here. `Game.tsx` fills it — see `MapSetupOverlay`.
   */
  children?: ReactNode
}

/**
 * The board: a map, a grid, tokens on it, and the two ways of moving them.
 *
 * Almost nothing happens in this file, which is the point. Secrecy was settled
 * server-side before any of this data arrived (ADR 0004), the drawing belongs to
 * `BoardStage` and `TokenLayer`, and the movement rules are `useTokenMove`'s. What
 * is left here is wiring five hooks to each other in the one order that works.
 *
 * That order is the only interesting thing about it. Selection reads the board,
 * movement is told what selection is pointing at, and the smoothing is told what
 * movement is holding — so the token array is transformed twice on its way to the
 * canvas: joined to the server's positions, then overridden by whatever this
 * browser is doing with the mouse. Getting those two the wrong way round would let
 * the echo of your own drag fight the drag.
 */
export function Board({ code, dm, playerId, myCharacterId, children }: BoardProps) {
  // The board's outer element, which is what "does the map have focus?" means for
  // the keyboard, and how the smoothing loop finds its way to the Konva stage. The
  // focusable container is `BoardStage`'s own div inside it, so both questions are
  // answered by containment rather than by identity.
  const containerRef = useRef<HTMLDivElement>(null)

  const board = useBoard({ code, dmCode: dm.dmCode, playerId, myCharacterId })
  const scene = board.scene

  const image = useMemo(
    () => (scene ? { width: scene.imageWidth, height: scene.imageHeight } : null),
    [scene],
  )

  // The camera measures the container itself. It is the thing that needs a viewport
  // — to fit a map to and to zoom about the centre of — so it takes the element
  // rather than being told, which is one measurement and one piece of state.
  const camera = useBoardCamera({ code, sceneId: scene?._id ?? null, image, containerRef })
  const selection = useTokenSelection(board.tokens)

  const move = useTokenMove({
    code,
    dmCode: dm.dmCode,
    playerId,
    scene,
    tokens: board.tokens,
    containerRef,
  })

  const tokens = useSmoothPositions({
    tokens: board.tokens,
    containerRef,
    heldTokenId: move.heldTokenId,
    localPositionOf: move.localPositionOf,
  })

  // Hoisted out of the JSX so `TokenLayer` is handed the same function every render.
  // A fresh arrow there would have been a changed prop on every coin on every frame
  // of a pan, and react-konva answers a changed handler by rebinding the listener.
  const onSelect = useCallback(
    (token: BoardToken) => selection.select(token._id),
    [selection.select],
  )

  useBoardKeys({
    containerRef,
    camera,
    selectedTokenId: selection.selectedTokenId,
    onNudge: move.nudge,
    onNudgeEnd: move.endNudge,
    onDeselect: selection.clear,
  })

  // The server's own wording, and a toast rather than a panel: a refused move is
  // over by the time it is reported, and the board behind the message has already
  // put the token back where the server says it is, so there is nothing left on
  // screen for something more permanent to explain.
  useEffect(() => {
    if (move.error) toast.error(move.error)
  }, [move.error])

  // A scene whose image has gone is not a board. It should never happen — a storage
  // blob deleted from under a live scene — and `BoardEmpty` says so in its own
  // words, which is more use to the DM than a canvas showing a grid over nothing and
  // no explanation of what went wrong.
  const drawable = scene !== null && scene.imageUrl !== null

  return (
    <div
      ref={containerRef}
      className="bg-muted/40 relative min-h-0 flex-1 overflow-hidden rounded-xl border"
    >
      {board.loading ? (
        <Skeleton className="absolute inset-0 rounded-xl" />
      ) : drawable && scene ? (
        <>
          <BoardStage scene={scene} camera={camera} onBackgroundClick={selection.clear}>
            <TokenLayer
              tokens={tokens}
              scene={scene}
              scale={camera.camera.scale}
              selectedId={selection.selectedTokenId}
              // Held space turns the whole board into a pan surface, so a press that
              // lands on a token has to move the view rather than the creature.
              draggable={!camera.spacePanning}
              onSelect={onSelect}
              onDragStart={move.onDragStart}
              onDragMove={move.onDragMove}
              onDragEnd={move.onDragEnd}
            />
          </BoardStage>
          <ZoomControls
            // The scale, not the camera: a `BoardCamera` is a new object every render
            // and the bar reads one number off it. See `ZoomControlsProps`.
            scale={camera.camera.scale}
            onZoomBy={camera.zoomBy}
            onZoomToScale={camera.zoomToScale}
            onFit={camera.fit}
            onReset={camera.reset}
            className="absolute bottom-3 left-3"
          />
        </>
      ) : (
        <BoardEmpty scene={scene} isDm={board.isDm} />
      )}
      {children}
    </div>
  )
}
