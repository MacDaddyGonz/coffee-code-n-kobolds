import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'

import { BoardEmpty } from '@/components/board/BoardEmpty'
import { BoardStage } from '@/components/board/BoardStage'
import { TokenHpPopover } from '@/components/board/TokenHpPopover'
import { TokenLayer } from '@/components/board/TokenLayer'
import { ZoomControls } from '@/components/board/ZoomControls'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoardToken } from '@/hooks/useBoard'
import { useBoard } from '@/hooks/useBoard'
import { useBoardCamera } from '@/hooks/useBoardCamera'
import { useBoardKeys } from '@/hooks/useBoardKeys'
import type { Dm } from '@/hooks/useDm'
import { useHpTarget } from '@/hooks/useHpTarget'
import { useSmoothPositions, useTokenMove } from '@/hooks/useTokenMove'
import { useTokenSelection } from '@/hooks/useTokenSelection'
import { useHpActions } from '@/hooks/useVitals'
import { cn } from '@/lib/utils'
import type { Id } from '@convex/_generated/dataModel'

export type BoardProps = {
  code: string
  dm: Dm
  playerId: Id<'players'>
  /** The character this seat is playing, which decides which token it may drag. */
  myCharacterId: Id<'characters'> | null
  /**
   * The shell's selection, which the board reads rather than owns — see
   * `useTokenSelection`. A primitive and two stable callbacks, never an object:
   * `MapPane` between here and `GameShell` is memoised against a pane width that
   * changes sixty times a second, and a fresh object would defeat it.
   */
  selectedTokenId: Id<'tokens'> | null
  onSelectToken: (tokenId: Id<'tokens'>) => void
  onClearSelection: () => void
  /**
   * Merged over the base classes, which no longer include an edge of their own. The
   * board is the contents of a pane rather than a card floating on a page, so the
   * border and the corner belong to the shell that owns the pane — drawing one here
   * as well is two rules describing the same line, and they disagree the first time
   * either moves.
   */
  className?: string
}

/**
 * The board: a map, a grid, tokens on it, and the two ways of moving them.
 *
 * Almost nothing happens in this file, which is the point. Secrecy was settled
 * server-side before any of this data arrived (ADR 0004), the drawing belongs to
 * `BoardStage` and `TokenLayer`, and the movement rules are `useTokenMove`'s. What
 * is left here is wiring a handful of hooks to each other in the one order that
 * works.
 *
 * That order is the only interesting thing about it. Selection reads the board,
 * movement is told what selection is pointing at, and the smoothing is told what
 * movement is holding — so the token array is transformed twice on its way to the
 * canvas: joined to the server's positions, then overridden by whatever this
 * browser is doing with the mouse. Getting those two the wrong way round would let
 * the echo of your own drag fight the drag.
 *
 * The hit point target comes last of the three for the same reason and reads the
 * *smoothed* array, because it anchors something to a coin rather than deciding
 * what a key press moves.
 *
 * ⚠️ **Selection is no longer the board's to own.** It lives in `GameShell`, because
 * the DM's sheet selector writes it too and the right-hand panel reads it, and the
 * board is handed the id and the two setters. The visible consequence is that the id
 * can name a token this scene does not draw — a creature picked from the selector
 * with its token elsewhere or nowhere. **The board then draws no ring while the
 * panel still shows the sheet**, which is intended: the panel is what says which
 * creature is being talked about. `useTokenSelection` carries the long version.
 */
export function Board({
  code,
  dm,
  playerId,
  myCharacterId,
  selectedTokenId,
  onSelectToken,
  onClearSelection,
  className,
}: BoardProps) {
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
  const selection = useTokenSelection(
    board.tokens,
    selectedTokenId,
    onSelectToken,
    onClearSelection,
  )

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

  const hp = useHpActions({ code, dmCode: dm.dmCode, playerId })

  /**
   * Which token the hit point editor is open on — its own question, asked by
   * clicking a health bar, and no longer whatever the arrow keys happen to be
   * pointed at.
   *
   * Selecting a token is how you pick it up to move it, and that is not a request
   * to edit its hit points: the editor used to appear under a creature the moment
   * you touched it, over the squares you were dragging towards. Worse, it made the
   * editor unreachable for a case that is entirely legitimate — hit points follow the
   * character, so `canEditHp` is true for the player playing it, where `canMove` asks
   * whether this seat is one of the token's controllers. A hero the DM has moved onto
   * their own layer is therefore one its player may heal and may not drag, and while
   * the editor hung off the selection they could do neither. Asking the right question
   * closes that without a special case for it.
   *
   * Handed the **smoothed** array, deliberately. The board before interpolation is
   * the same creature but not the same position, so anchoring to it would leave the
   * panel where the server last said a token was while the coin slides to where it
   * now is — most visible during somebody else's drag, which is exactly when the DM
   * is watching that token.
   */
  const hpTarget = useHpTarget(tokens)
  const hpToken = hpTarget.hpToken

  // Hoisted out of the JSX so `TokenLayer` is handed the same function every render.
  // A fresh arrow there would have been a changed prop on every coin on every frame
  // of a pan, and react-konva answers a changed handler by rebinding the listener.
  const onSelect = useCallback(
    (token: BoardToken) => selection.select(token._id),
    [selection.select],
  )

  // Not wrapped, on purpose: `open` is already built once and held for the life of
  // the hook, so an arrow around it here would add exactly the fresh identity per
  // render that the note above is about.
  const onOpenHp = hpTarget.open

  // A click on the map closes both. It is the "I am done with this creature"
  // gesture, and leaving the editor open over bare map after the highlight has gone
  // would be a panel pointing at nothing.
  const onBackgroundClick = useCallback(() => {
    selection.clear()
    hpTarget.clear()
  }, [selection.clear, hpTarget.clear])

  // Innermost first. Escape closes the editor if it is open and clears the
  // selection otherwise, so one press undoes one thing and the token you were
  // moving is still selected afterwards. A dialog or sheet opened from a panel
  // portals out of this subtree entirely and handles its own Escape before either
  // of these hears about it, which is why there is no third case here.
  const onEscape = useCallback(() => {
    if (hpTarget.hpTokenId !== null) hpTarget.clear()
    else selection.clear()
  }, [hpTarget.hpTokenId, hpTarget.clear, selection.clear])

  useBoardKeys({
    containerRef,
    camera,
    selectedTokenId: selection.selectedTokenId,
    onNudge: move.nudge,
    onNudgeEnd: move.endNudge,
    onEscape,
  })

  // The server's own wording, and a toast rather than a panel: a refused move is
  // over by the time it is reported, and the board behind the message has already
  // put the token back where the server says it is, so there is nothing left on
  // screen for something more permanent to explain.
  useEffect(() => {
    if (move.error) toast.error(move.error)
  }, [move.error])

  // A refused hit point change is reported the same way and for the same reason: the
  // bar has already snapped back to whatever the server says, so there is nothing
  // left on screen for a panel to sit next to and explain.
  useEffect(() => {
    if (hp.error) toast.error(hp.error)
  }, [hp.error])

  // A scene whose image has gone is not a board. It should never happen — a storage
  // blob deleted from under a live scene — and `BoardEmpty` says so in its own
  // words, which is more use to the DM than a canvas showing a grid over nothing and
  // no explanation of what went wrong.
  const drawable = scene !== null && scene.imageUrl !== null

  return (
    <div ref={containerRef} className={cn('bg-muted/40 relative overflow-hidden', className)}>
      {board.loading ? (
        <Skeleton className="absolute inset-0" />
      ) : drawable && scene ? (
        <>
          <BoardStage scene={scene} camera={camera} onBackgroundClick={onBackgroundClick}>
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
              onOpenHp={onOpenHp}
            />
          </BoardStage>
          {/*
            Hidden while this browser is dragging the token, and only that token.
            React sees a dragged position ten times a second, because that is the
            rate invariant 2 caps writes at — so a popover following it would stutter
            along a quarter of a second behind the pointer that is dragging it, under
            that very pointer. It comes straight back on the drop, at which point the
            token is where it is going to stay and the control is worth aiming at.
          */}
          {/*
            No `canEditHp` test here any more. `useHpTarget` asks it of the current
            board every render as part of resolving the token at all, so a client
            that may not edit these hit points has no token to be handed — which is
            the same discipline `useTokenSelection` applies to the highlight.
          */}
          {hpToken && move.heldTokenId !== hpToken._id ? (
            <TokenHpPopover
              token={hpToken}
              scene={scene}
              // The camera itself this time, not one number off it: the popover is
              // positioned in screen space, so it needs the pan as well as the zoom.
              camera={camera.camera}
              onAdjust={hp.adjust}
            />
          ) : null}
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
    </div>
  )
}
