import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { BoardEmpty } from '@/components/board/BoardEmpty'
import { BoardStage } from '@/components/board/BoardStage'
import { BoardTokenMenu } from '@/components/board/BoardTokenMenu'
import { FogLayer } from '@/components/board/FogLayer'
import { TokenHpPopover } from '@/components/board/TokenHpPopover'
import { TokenLayers } from '@/components/board/TokenLayers'
import { ZoomControls } from '@/components/board/ZoomControls'
import { CalibrateToggle } from '@/components/board/dm/CalibrateToggle'
import { GridHandlesLayer } from '@/components/board/dm/GridHandlesLayer'
import { TokenDeleteDialog } from '@/components/board/dm/TokenDeleteDialog'
import { TokenDuplicateDialog } from '@/components/board/dm/TokenDuplicateDialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoardToken } from '@/hooks/useBoard'
import { useBoard } from '@/hooks/useBoard'
import { useBoardCamera } from '@/hooks/useBoardCamera'
import { useBoardKeys } from '@/hooks/useBoardKeys'
import { useBoardLayers } from '@/hooks/useBoardLayers'
import type { Dm } from '@/hooks/useDm'
import { useFogMode } from '@/hooks/useFog'
import { useGridWrite } from '@/hooks/useGridWrite'
import { useHpTarget } from '@/hooks/useHpTarget'
import { useSmoothPositions, useTokenMove } from '@/hooks/useTokenMove'
import { useTokenSelection } from '@/hooks/useTokenSelection'
import { useHpActions } from '@/hooks/useVitals'
import type { GridBox, GridHandle } from '@/lib/gridBox'
import { boxOfGrid, dragBox, gridOfBox } from '@/lib/gridBox'
import { cn } from '@/lib/utils'
import type { Id } from '@convex/_generated/dataModel'
import type { Grid, Point } from '@convex/lib/grid'

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
  /** A coin deleted from the board menu. See `GameShell.forgetToken`. */
  onTokenGone: (tokenId: Id<'tokens'>) => void
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
 * `BoardStage` and `TokenLayers`, and the movement rules are `useTokenMove`'s. What
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
  onTokenGone,
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

  // Which layers this browser is choosing to paint. A view rather than board state, so it
  // is read here for the same reason the camera is and goes to Convex for none of the same
  // reasons — see `useBoardLayers`. A player has no control that writes it.
  const layers = useBoardLayers(code)

  /**
   * ⚠️ **The second mode that takes the pointer off the coins, and the drag gate below had
   * only ever heard of the first.**
   *
   * `FogTools` tells the DM in as many words that while a tool is armed "pressing the map
   * draws or rubs out fog instead of picking up a coin", and `FogLayer` is mounted *under*
   * the token layers for the reason written out at that mount — so without this a press that
   * landed on a creature picked the creature up, which is the one gesture the panel promises
   * it will not do.
   *
   * Read here rather than threaded down from `FogTools`, which is exactly what the
   * module-level cell in `useFog` exists for: the control is in the right-hand pane and both
   * readers of it are in this one.
   *
   * ⚠️ **The drag half of the promise and not the whole of it.** The coins sit above the
   * fog, so a press on one still finds the coin rather than the rectangle underneath it and
   * selects instead of erasing. Closing that too means giving the veil the pointer over the
   * party's own figures, which is the trade the mount order already declined. What this
   * closes is the half that *moves something the DM did not mean to move*.
   */
  const { mode: fogMode } = useFogMode(code)
  const fogArmed = board.isDm && fogMode !== 'off'

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

  // Every coin's name, for the duplicate dialog's live preview. Read off the array this
  // component is already holding rather than through a subscription of its own, so the
  // preview and the write take the same three inputs — which is the whole reason
  // `duplicateNames` is one browser-shared function rather than two that agreed once.
  const names = useMemo(() => board.tokens.map((token) => token.name), [board.tokens])

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

  /**
   * Grid calibration: whether the handles are out, and the box the DM is dragging.
   *
   * Owned here rather than by `GridCalibrator` in the Map panel, because the two live in
   * different halves of the screen and this is the half the gesture happens in. They are
   * not two settings to keep in step — the *stored* grid is the single fact, and both
   * write it through `useGridWrite`. The draft below is the only thing local to a drag,
   * and it lasts about a tenth of a second.
   *
   * `useGridWrite` is called unconditionally with a nullable code and scene, so a player's
   * board runs the same hooks in the same order as the DM's and simply never sends
   * anything. Whether the button is offered is display only; `scenes.updateGrid` verifies
   * the DM code server-side on every write (invariant 7).
   */
  const [calibrating, setCalibrating] = useState(false)
  const [draftGrid, setDraftGrid] = useState<Grid | null>(null)

  const gridWrite = useGridWrite({ code, dmCode: dm.dmCode, sceneId: scene?._id ?? null })

  // The draft outranks the scene for as long as it exists, exactly as a local token
  // position outranks the server's — see `useTokenMove`. A `PublicScene` is structurally a
  // `Grid`, so the fallback needs no unpacking.
  const box = useMemo(
    () => (scene === null ? null : boxOfGrid(draftGrid ?? scene)),
    [draftGrid, scene],
  )

  // Konva holds the handlers below for the length of a gesture, so what they read has to
  // be a ref and not this render's closure — the same argument `useTokenMove` makes for
  // keeping its scene in one.
  const boxRef = useRef<GridBox | null>(box)
  boxRef.current = box
  const gridVisibleRef = useRef(true)
  gridVisibleRef.current = scene?.gridVisible ?? true

  // The box this gesture is measured from, and the grid its last move produced. Neither is
  // state: nothing renders them, and a re-render per mouse-move is the churn invariant 2
  // exists to prevent.
  const grabbed = useRef<GridBox | null>(null)
  const dragged = useRef<Grid | null>(null)

  const onGrab = useCallback(() => {
    grabbed.current = boxRef.current
    dragged.current = null
  }, [])

  const onHandleMove = useCallback(
    (handle: GridHandle, delta: Point) => {
      const from = grabbed.current
      if (from === null) return
      // From the box as it was when the grip was taken, never from the current one. The
      // delta is cumulative, so composing it onto a box that has already moved would
      // square the gesture and send the grid off the map in two frames.
      const next = gridOfBox(dragBox(from, handle, delta))
      dragged.current = next
      setDraftGrid(next)
      gridWrite.push(next, gridVisibleRef.current)
    },
    [gridWrite.push],
  )

  const onHandleRelease = useCallback(() => {
    grabbed.current = null
    const next = dragged.current
    dragged.current = null
    // Off the ref rather than the draft state: `dragend` can arrive before React has
    // rendered what the last `dragmove` set, and the settling write is the one that must
    // not be a frame stale.
    if (next !== null) gridWrite.settle(next, gridVisibleRef.current)
  }, [gridWrite.settle])

  const onToggleCalibrate = useCallback(() => {
    setCalibrating((on) => !on)
    // Cleared in both directions. Leaving drops a draft that has already been written
    // anyway; entering makes sure the handles start from the stored grid rather than from
    // a refused write left over from last time.
    setDraftGrid(null)
  }, [])

  // Hand the grid back to the subscription once the server agrees, which is the discipline
  // `useSmoothPositions` applies to a token and is needed for the same reason: a draft that
  // outlived its write would pin the board to it, and the Map panel's typed changes would
  // stop appearing.
  //
  // ⚠️ **Deliberately not skipped mid-gesture**, which is the guard that looks obviously
  // necessary and is not. The equality below is the whole of it: a throttled write echoing
  // back part-way through a drag does *not* match the draft the pointer has since moved on
  // to, so nothing is cleared under the DM's hand — and when it does match there is by
  // definition nothing to see, because the two are the same three numbers. Adding the guard
  // costs the one case it cannot handle: a box dragged back to exactly where it started
  // produces a write that changes nothing, so no echo ever arrives to release the draft.
  useEffect(() => {
    if (scene === null || draftGrid === null) return
    if (
      scene.gridSize === draftGrid.gridSize &&
      scene.gridOffsetX === draftGrid.gridOffsetX &&
      scene.gridOffsetY === draftGrid.gridOffsetY
    ) {
      setDraftGrid(null)
    }
  }, [scene, draftGrid])

  // A draft belongs to the map it was dragged on, so switching maps drops it rather than
  // laying the old map's numbers over the new one's art.
  const sceneId = scene?._id ?? null
  useEffect(() => setDraftGrid(null), [sceneId])

  // Hoisted out of the JSX so `TokenLayers` is handed the same function every render.
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

  /**
   * The coin the right-click menu is open on, and where to draw it.
   *
   * ⚠️ **The id is stored and the token is resolved against the live board every render**,
   * which is `useTokenSelection`'s and `useHpTarget`'s discipline for the same reason: a
   * coin deleted from under an open menu, or a scene switched away from, unmounts the menu
   * with no effect to correct and no render in between during which it names a token that
   * has gone. `canMove` is re-asked here too, so a grant revoked while the menu is open
   * closes it.
   *
   * The position is in **container pixels**, converted once at the handler because this is
   * the component holding the ref. Deliberately not a `Point`: that type means image space
   * everywhere else on this board, and `@/lib/camera`'s header is entirely about what goes
   * wrong when the two are confused.
   */
  const [menu, setMenu] = useState<{ tokenId: Id<'tokens'>; x: number; y: number } | null>(null)
  const menuToken = useMemo(
    () =>
      menu === null
        ? null
        : (tokens.find((token) => token._id === menu.tokenId && token.canMove) ?? null),
    [tokens, menu],
  )

  // Which dialog the menu has asked for. Mounted as siblings of the menu rather than
  // inside it, because a Radix `DialogTrigger` in a menu item is unmounted by the menu
  // closing on select and the dialog never appears.
  const [duplicating, setDuplicating] = useState<Id<'tokens'> | null>(null)
  const [deleting, setDeleting] = useState<Id<'tokens'> | null>(null)
  const duplicateToken = useMemo(
    () => tokens.find((token) => token._id === duplicating) ?? null,
    [tokens, duplicating],
  )
  const deleteToken = useMemo(
    () => tokens.find((token) => token._id === deleting) ?? null,
    [tokens, deleting],
  )

  // `[]` deps, so `TokenLayers`' prop contract holds: one function for the whole layer and
  // no rebinding of eighty Konva listeners on a pan. One `getBoundingClientRect` per
  // right-click is nothing.
  const onTokenContextMenu = useCallback(
    (token: BoardToken, at: { clientX: number; clientY: number }) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      setMenu({ tokenId: token._id, x: at.clientX - box.left, y: at.clientY - box.top })
    },
    [],
  )
  const closeMenu = useCallback(() => setMenu(null), [])

  // Selecting the coin *and* leaving this pane is the point of both: the panels that edit
  // a coin and open a sheet live in the other one, and the shell's selection is what tells
  // them which coin is being talked about.
  const onMenuEdit = useCallback(
    (tokenId: Id<'tokens'>) => {
      onSelectToken(tokenId)
      setMenu(null)
    },
    [onSelectToken],
  )

  // A click on the map closes both. It is the "I am done with this creature"
  // gesture, and leaving the editor open over bare map after the highlight has gone
  // would be a panel pointing at nothing.
  const onBackgroundClick = useCallback(() => {
    selection.clear()
    hpTarget.clear()
  }, [selection.clear, hpTarget.clear])

  // Innermost first. Escape leaves calibration if the handles are out, closes the hit
  // point editor if it is open, and clears the selection otherwise — so one press undoes
  // one thing and the token you were moving is still selected afterwards.
  //
  // ⚠️ **There are three cases and there used to be two, and the sentence that used to
  // stand here explained why there could never be a third: a dialog or sheet opened from a
  // panel portals out of this subtree and handles its own Escape before either of these
  // hears about it.** That is still true of a dialog and is no longer the whole story,
  // because a Konva layer does not portal. Calibration is a mode of *this* board, drawn
  // inside this stage, with nothing above it to swallow the key — so it has to be
  // dismissed here, and it goes first because it is the outermost thing the DM is holding
  // and the one that has changed what every other gesture on the board does.
  const onEscape = useCallback(() => {
    if (calibrating) {
      setCalibrating(false)
      setDraftGrid(null)
    } else if (hpTarget.hpTokenId !== null) hpTarget.clear()
    else selection.clear()
  }, [calibrating, hpTarget.hpTokenId, hpTarget.clear, selection.clear])

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
          <BoardStage
            scene={scene}
            camera={camera}
            onBackgroundClick={onBackgroundClick}
            // Only while a drag is in flight. `undefined` the rest of the time, so the
            // overlay is drawn from the scene and there is one grid on screen rather than
            // a stale copy of one.
            grid={draftGrid ?? undefined}
          >
            {/*
              ⚠️ **Under the coins, not between the player and GM layers — and the plan
              said between.** The obvious reading of "fog is a layer" puts it above the
              player tokens, and that is wrong here for a reason that only appears once
              the server's rule is in front of you.

              `foggedTokenIds` deliberately never fogs a token the table controls, so a
              player's own hero standing in the dark keeps its position row on purpose —
              the whole point being that a player who walks into a corridor does not lose
              their own coin with no way to select it back. An **opaque** rectangle painted
              over the top would take it away again, visually, having gone to some trouble
              on the server not to.

              Underneath, nothing leaks: every coin a player could have inside a rectangle
              is one their table controls, because the server dropped the rest before the
              payload was built. So the veil is a wash on the map, the party's own figures
              stand on top of it, and the DM — who sees it at partial opacity — reads their
              own coins against the dark.
            */}
            <FogLayer
              code={code}
              dmCode={dm.dmCode}
              scene={scene}
              scale={camera.camera.scale}
            />
            <TokenLayers
              tokens={tokens}
              scene={scene}
              scale={camera.camera.scale}
              selectedId={selection.selectedTokenId}
              // What the pointer may pick up and which layers are painted, never what
              // arrived — the secrecy filter ran on the server. See `TokenLayers`.
              isDm={board.isDm}
              shown={layers.shown}
              // Held space turns the whole board into a pan surface, so a press that
              // lands on a token has to move the view rather than the creature. The
              // calibration handles borrow the same mechanism: while the box is out, a
              // press anywhere near a coin is aimed at the grid underneath it — and an
              // armed fog tool is the third of them, for the reason `fogArmed` carries.
              draggable={!camera.spacePanning && !calibrating && !fogArmed}
              onSelect={onSelect}
              onDragStart={move.onDragStart}
              onDragMove={move.onDragMove}
              onDragEnd={move.onDragEnd}
              onOpenHp={onOpenHp}
              onContextMenu={onTokenContextMenu}
            />
            {/*
              Last, and that is the whole of how it wins the pointer — see `BoardStage`.
              Rendered only when the DM has asked for it, so on every other board the
              stage is exactly the tree it was before.
            */}
            {board.isDm && calibrating && box ? (
              <GridHandlesLayer
                box={box}
                scale={camera.camera.scale}
                onGrab={onGrab}
                onMove={onHandleMove}
                onRelease={onHandleRelease}
              />
            ) : null}
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
          {/*
            The right-click menu, and the two dialogs it asks for.

            ⚠️ **All three are siblings of the stage rather than children of it, and the
            dialogs are siblings of the menu rather than children of *it*.** A Radix
            `DialogTrigger` rendered inside a `DropdownMenuItem` is unmounted the moment
            the menu closes on select, so the dialog it was going to open never appears —
            which is why `ConfirmDialog` grew a controlled pair and why the menu asks
            rather than hosts.

            `menuToken` is resolved against the live board every render, so a coin deleted
            or a scene switched from under an open menu unmounts it rather than leaving it
            naming something that has gone.
          */}
          {menuToken ? (
            <BoardTokenMenu
              code={code}
              dmCode={dm.dmCode}
              playerId={playerId}
              token={menuToken}
              scene={scene}
              at={{ x: menu?.x ?? 0, y: menu?.y ?? 0 }}
              onClose={closeMenu}
              onEdit={onMenuEdit}
              onOpenSheet={onMenuEdit}
              onDuplicate={(tokenId) => {
                setMenu(null)
                setDuplicating(tokenId)
              }}
              onDelete={(tokenId) => {
                setMenu(null)
                setDeleting(tokenId)
              }}
            />
          ) : null}
          {dm.dmCode !== null && duplicateToken ? (
            <TokenDuplicateDialog
              code={code}
              dmCode={dm.dmCode}
              token={duplicateToken}
              scene={scene}
              existingNames={names}
              open
              onOpenChange={(next) => {
                if (!next) setDuplicating(null)
              }}
            />
          ) : null}
          {dm.dmCode !== null && deleteToken ? (
            <TokenDeleteDialog
              code={code}
              dmCode={dm.dmCode}
              token={deleteToken}
              // The board joins no roster, so the confirmation says the shorter of its two
              // sentences here. The Tokens tab, which does hold `characters.list`, names
              // the creature — one component, two callers, and the copy cannot drift.
              bound={null}
              open
              onOpenChange={(next) => {
                if (!next) setDeleting(null)
              }}
              onDeleted={(tokenId) => {
                setDeleting(null)
                onTokenGone(tokenId)
              }}
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
          {/*
            Top-left, opposite the zoom bar, because it is a mode rather than a nudge and
            wants to be visible from across the room while it is on. Offered on the
            strength of the DM code alone, which authorises nothing — see `CalibrateToggle`.
          */}
          {board.isDm ? (
            <CalibrateToggle
              active={calibrating}
              onToggle={onToggleCalibrate}
              className="absolute top-3 left-3"
            />
          ) : null}
        </>
      ) : (
        <BoardEmpty scene={scene} isDm={board.isDm} />
      )}
    </div>
  )
}
