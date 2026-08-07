import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { BoardEmpty } from '@/components/board/BoardEmpty'
import { BoardStage } from '@/components/board/BoardStage'
import { BoardTokenMenu } from '@/components/board/BoardTokenMenu'
import { BoardToolbar } from '@/components/board/BoardToolbar'
import { TableViewBadge } from '@/components/board/TableViewBadge'
import { FogLayer } from '@/components/board/FogLayer'
import { TokenDetailCard } from '@/components/board/TokenDetailCard'
import { TokenHpPopover } from '@/components/board/TokenHpPopover'
import { TokenLayers } from '@/components/board/TokenLayers'
import { ZoomControls } from '@/components/board/ZoomControls'
import { GridHandlesLayer } from '@/components/board/dm/GridHandlesLayer'
import { TokenDeleteDialog } from '@/components/board/dm/TokenDeleteDialog'
import { TokenDuplicateDialog } from '@/components/board/dm/TokenDuplicateDialog'
import { TraceBoxLayer } from '@/components/board/dm/TraceBoxLayer'
import { WallLayer } from '@/components/board/dm/WallLayer'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoardToken } from '@/hooks/useBoard'
import { useBoard } from '@/hooks/useBoard'
import { useBoardCamera } from '@/hooks/useBoardCamera'
import { useBoardKeys } from '@/hooks/useBoardKeys'
import { useBoardLayers } from '@/hooks/useBoardLayers'
import type { Dm } from '@/hooks/useDm'
import { useBoardTool } from '@/hooks/useBoardTool'
import { useGridTrace } from '@/hooks/useGridTrace'
import { useGridWrite } from '@/hooks/useGridWrite'
import { useCoinSheet } from '@/hooks/useCoinSheet'
import { useHpTarget } from '@/hooks/useHpTarget'
import { useSmoothPositions, useTokenMove } from '@/hooks/useTokenMove'
import { useTokenHover } from '@/hooks/useTokenHover'
import { useTokenSelection } from '@/hooks/useTokenSelection'
import { useWallPaths } from '@/hooks/useWalls'
import { useHpActions } from '@/hooks/useVitals'
import type { GridBox, GridHandle } from '@/lib/gridBox'
import { boxOfGrid, dragBox, gridOfBox } from '@/lib/gridBox'
import { cn } from '@/lib/utils'
import type { Id } from '@convex/_generated/dataModel'
import type { Grid, Point } from '@convex/lib/grid'

/** Held still, so a board with no dialog open hands the same array every render. */
const NO_NAMES: readonly string[] = []

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
   * The two board gestures that ask for a *panel* rather than a selection: the DM's
   * *Edit this coin* and anybody's *Open the sheet*.
   *
   * ⚠️ **Named for what the reader asked for and not for the tab it lands on, which is
   * the whole of why the bug these replace was possible.** Both entries used to route to
   * one handler that selected the coin and stopped, because the tab was `useState` inside
   * `RightPane` and no prop reached it — so two menu items promising two different panels
   * were the same function, and the panel never changed. The shell owns the tab now and
   * decides which one each of these means; the board says *what happened*, which is the
   * only thing it can honestly know.
   */
  onEditToken: (tokenId: Id<'tokens'>) => void
  onOpenTokenSheet: (tokenId: Id<'tokens'>) => void
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
  onEditToken,
  onOpenTokenSheet,
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
   * ⚠️⚠️ **THE ONE ARMED TOOL ON THIS BOARD, AND IT REPLACED THREE CELLS THAT COULD EACH BE
   * LIT AT ONCE.** The fog brush, the grid tracer and the wall tool each mount a Konva draw
   * surface spanning the whole image, so with three cells the last one rendered took every
   * press while the other two panels went on showing a lit button for a tool that had
   * silently stopped working. One cell over one union makes arming any of them put the others
   * down by construction — `src/lib/boardTool.ts` carries the argument.
   *
   * ⚠️ **`surface` is looked up rather than derived by naming members**, which is the other
   * half of what the merge bought. `BOARD_TOOL_SURFACE` is a `Record` over the union, so a new
   * tool cannot arrive, compile, pass and then mount nothing at all — a lit button that does
   * nothing when the map is pressed. CLAUDE.md invariant 9's rule, applied at the place a
   * wrong answer does damage.
   *
   * Read here rather than threaded down from the panels, which is what the cell exists for:
   * the controls are in the right-hand pane and every reader of the answer is in this one.
   *
   * ⚠️ **`armed` is the drag half of the panels' promise and not the whole of it.** `FogTools`
   * tells the DM that while a tool is armed "pressing the map draws or rubs out areas instead
   * of picking up a coin", and this is what makes that true for a *drag*. The coins sit above
   * the fog, so a press on one still finds the coin and selects rather than erasing — closing
   * that too means giving the veil the pointer over the party's own figures, which is the
   * trade the mount order declined. `WallLayer` sits above the coins and so has no such gap.
   */
  const { tool, surface, setTool, putDown } = useBoardTool(code)
  const armed = board.isDm && surface !== 'none'

  /**
   * ⚠️ **The board puts the tool down when it unmounts, and none of the panels can do it for
   * it.** Calibration used to be a `useState` here, so leaving the board took it with it. It
   * is a module-level cell now, and the *only* control that arms it lives in the board's own
   * toolbar — `GridCalibrator` chooses which grid tool the button gives you and deliberately
   * arms nothing — so a DM who left a game with the tracer out would come back to an armed
   * board. `FogTools` and `WallTools` disarm their own surfaces on the way out of a sub-tab;
   * this is the same discipline for the one surface no sub-tab owns, and it is conditional for
   * the same reason theirs are.
   */
  useEffect(() => () => putDown('grid'), [putDown])

  /**
   * The barriers on this board, as bare geometry, for the drag.
   *
   * ⚠️ **Held by every client and not only the DM's**, which looks like a leak and is the
   * feature: `useTokenMove` slides a coin up to a wall and stops it, and it cannot do that
   * against geometry the browser was not sent. `WallLayer` decides whether they are *drawn*,
   * and that layer is DM-only. `convex/walls.ts`'s header and `WallTools`' copy both carry
   * the residual this leaves.
   *
   * The same subscription `WallLayer` and `WallTools` hold, through the same `wallArgs`
   * builder — so this costs a `map` per change of the wall list and nothing on the wire.
   */
  const walls = useWallPaths(code, scene?._id ?? null, dm.dmCode)

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
    walls,
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

  /**
   * Which coin the detail card is about: the one the pointer is resting on, or the selected
   * one when it is resting on nothing.
   *
   * ⚠️ **Hover wins over selection**, which is the way round that matches what a pointer
   * means: you are asking about the thing you are pointing at, and the selection is what the
   * arrow keys are aimed at from a minute ago. The other order would make the card refuse to
   * follow the mouse for as long as anything was selected, which is most of a session.
   *
   * Given the **smoothed** array for `useHpTarget`'s reason: it anchors something to a coin
   * rather than deciding what a key press moves, so it has to read where the coin is drawn.
   *
   * ⚠️ **The selection half inherits `useTokenSelection`'s own narrowing, which is to coins
   * this caller may move** — so a player who has selected nothing (because they may move
   * nothing) still gets a card by pointing, and that is the half that matters. Widening the
   * selection to reach the card would change what the arrow keys are aimed at, which is a
   * far larger decision than a tooltip.
   */
  const hover = useTokenHover(tokens)
  const cardToken = hover.hoveredToken ?? selection.selectedToken

  /**
   * The card's creature, if this caller may read one.
   *
   * ⚠️ **`null` is the access rule and not a loading state**, and the decision was made by
   * `characters.sheet` before this line ran — see `useCoinSheet`, which carries the whole
   * argument, and `TokenDetailCard`, which explains why initiative and speed are the only
   * two things drawn from it. Nothing here filters and nothing here may start to.
   */
  const cardSheet = useCoinSheet({
    code,
    characterId: cardToken?.characterId ?? null,
    playerId,
    dmCode: dm.dmCode,
  })

  /**
   * Grid calibration: whether a tool is out, which of the two it is, and the box the DM is
   * dragging.
   *
   * Owned here rather than by `GridCalibrator` in the Map panel, because the two live in
   * different halves of the screen and this is the half the gesture happens in. They are
   * not two settings to keep in step — the *stored* grid is the single fact, and both
   * write it through `useGridWrite`. The draft below is the only thing local to a drag,
   * and it lasts about a tenth of a second.
   *
   * ⚠️ **Two tools and never both.** `calibrating` says a grid tool is in the DM's hand;
   * `useGridTrace`'s cell says which one, because the picker for it is in the other pane.
   * The handles box is square by construction and anchored to the grid origin; the trace box
   * is free-aspect and anchored wherever the map's printed squares are legible — see
   * `GridTool` for why widening one of them into the other was never on the table. Both end
   * up in the same `setDraftGrid` and the same `gridWrite`.
   *
   * ⚠️ **`calibrating` is derived from the shared armed-tool cell now and is not state**,
   * which is what stops the grid tracer and a fog brush being out at once. It used to be a
   * `useState` here, and the two spellings of *a tool is out* were the bug. The choice between
   * `handles` and `trace` stays where it is: it is a preference the DM sets in the panel and
   * it arms nothing, so folding it into the union would give the toolbar button two things to
   * mean — `BoardTool`'s docblock argues the asymmetry.
   *
   * `useGridWrite` is called unconditionally with a nullable code and scene, so a player's
   * board runs the same hooks in the same order as the DM's and simply never sends
   * anything. Whether the button is offered is display only; `scenes.updateGrid` verifies
   * the DM code server-side on every write (invariant 7).
   */
  const calibrating = tool === 'grid'
  const [draftGrid, setDraftGrid] = useState<Grid | null>(null)

  const trace = useGridTrace(code)
  const setTrace = trace.setTrace
  const tracing = calibrating && trace.tool === 'trace'

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

  /**
   * The trace box's two rates, and they are the same two the handles use one screen over.
   *
   * `onTracePreview` runs on every frame of the drag, so the table watches the grid settle
   * onto the printed one *while the box is being drawn* — which is the whole feedback loop of
   * that tool, and is why it is `push` and not silence until the drop. `onTraceSettle` is the
   * drop. Neither is ever handed a `null`: `TraceBoxLayer` simply does not call while the box
   * describes no drawable grid, which is most of the first few frames of every trace.
   *
   * The draft is set from both, exactly as the handles set it, so `BoardStage` draws the new
   * grid this frame rather than after a round trip.
   */
  const onTracePreview = useCallback(
    (next: Grid) => {
      setDraftGrid(next)
      gridWrite.push(next, gridVisibleRef.current)
    },
    [gridWrite.push],
  )

  const onTraceSettle = useCallback(
    (next: Grid) => {
      setDraftGrid(next)
      gridWrite.settle(next, gridVisibleRef.current)
    },
    [gridWrite.settle],
  )

  // Arming the grid puts down whatever else was out, which is the whole of what the shared
  // cell buys here: there is no second flag to clear and no ordering between two setters.
  const onToggleCalibrate = useCallback(() => {
    setTool(calibrating ? 'off' : 'grid')
    // Cleared in both directions. Leaving drops a draft that has already been written
    // anyway; entering makes sure the handles start from the stored grid rather than from
    // a refused write left over from last time.
    setDraftGrid(null)
    // The traced box goes the same way and for a sharper version of the same reason: it is a
    // measurement of a block of *this* map, and one still on screen when the tool next comes
    // out would be numbers in the panel that nobody in this session traced.
    setTrace({ box: null })
  }, [calibrating, setTool, setTrace])

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
  // laying the old map's numbers over the new one's art. The traced box belongs to a map far
  // more literally — it is a rectangle measured off one particular picture — so it goes too,
  // rather than sitting over the new map claiming to have measured something on it.
  const sceneId = scene?._id ?? null
  useEffect(() => {
    setDraftGrid(null)
    setTrace({ box: null })
  }, [sceneId, setTrace])

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
  // Guarded on the id rather than scanning for a match that cannot be there. `tokens` is a
  // fresh array ten times a second during anybody's drag, and both of these are null for
  // the whole of a session except the seconds a dialog is open.
  const duplicateToken = useMemo(
    () => (duplicating === null ? null : (tokens.find((token) => token._id === duplicating) ?? null)),
    [tokens, duplicating],
  )
  // Every coin's name, for the duplicate dialog's live preview. Read off the array this
  // component is already holding rather than through a subscription of its own, so the
  // preview and the write take the same three inputs — which is the whole reason
  // `addedNames` and `duplicateNames` are browser-shared rather than two rules that
  // agreed once.
  //
  // ⚠️ Gated on the dialog being open, like the two lookups above. UnGated this mapped two
  // hundred names ten times a second for the whole of every drag, to feed a dialog that is
  // shut for all but a few seconds of a session — and while it *is* open, a background drag
  // would hand it a fresh array identity on every tick and re-run its own naming memo with
  // it.
  const names = useMemo(
    () => (duplicating === null ? NO_NAMES : board.tokens.map((token) => token.name)),
    [board.tokens, duplicating],
  )

  const deleteToken = useMemo(
    () => (deleting === null ? null : (tokens.find((token) => token._id === deleting) ?? null)),
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

  // ⚠️ **Every prop the menu takes is stable, which is what makes its `memo` mean
  // anything.** It is deliberately `modal={false}` so the board keeps zooming underneath
  // it — and this component re-renders on every frame of that zoom, so a fresh object or a
  // fresh arrow here would reconcile the whole portalled subtree, seventeen checkbox items
  // included, sixty times a second. Two numbers rather than a point, for the same reason
  // `ZoomControls` takes a scale rather than a camera.
  const openDuplicate = useCallback((tokenId: Id<'tokens'>) => {
    setMenu(null)
    setDuplicating(tokenId)
  }, [])
  const openDelete = useCallback((tokenId: Id<'tokens'>) => {
    setMenu(null)
    setDeleting(tokenId)
  }, [])

  /**
   * The two menu entries that leave this pane, each closing the menu on the way out.
   *
   * ⚠️ **Two handlers, and they were one.** The panels that edit a coin and open a sheet
   * live in the other pane under two different tabs, so a single function could only ever
   * satisfy one of the two entries — and satisfied neither, because selecting a coin does
   * not move a tab. The shell is handed the gesture and picks the tab; all that is needed
   * here is to stop pretending the two are the same act.
   */
  const onMenuEdit = useCallback(
    (tokenId: Id<'tokens'>) => {
      onEditToken(tokenId)
      setMenu(null)
    },
    [onEditToken],
  )
  const onMenuOpenSheet = useCallback(
    (tokenId: Id<'tokens'>) => {
      onOpenTokenSheet(tokenId)
      setMenu(null)
    },
    [onOpenTokenSheet],
  )

  // A click on the map closes both. It is the "I am done with this creature"
  // gesture, and leaving the editor open over bare map after the highlight has gone
  // would be a panel pointing at nothing.
  const onBackgroundClick = useCallback(() => {
    selection.clear()
    hpTarget.clear()
  }, [selection.clear, hpTarget.clear])

  // Innermost first. Escape rubs out a traced box if there is one, leaves calibration if a
  // tool is out, closes the hit point editor if it is open, and clears the selection
  // otherwise — so one press undoes one thing and the token you were moving is still
  // selected afterwards.
  //
  // ⚠️ **There are four cases and there used to be two, and the sentence that used to
  // stand here explained why there could never be a third: a dialog or sheet opened from a
  // panel portals out of this subtree and handles its own Escape before either of these
  // hears about it.** That is still true of a dialog and is no longer the whole story,
  // because a Konva layer does not portal. Calibration is a mode of *this* board, drawn
  // inside this stage, with nothing above it to swallow the key — so it has to be
  // dismissed here, and it goes near the front because it is the outermost thing the DM is
  // holding and the one that has changed what every other gesture on the board does.
  //
  // ⚠️ **The traced box goes in front of calibration rather than with it**, which is the
  // "innermost first" rule taken seriously rather than a fourth branch bolted on. A box on
  // screen is a thing the DM made *inside* the tool, and it is the thing they most often want
  // rid of: a trace over the wrong block of squares is corrected by rubbing it out and doing
  // it again, and folding it into the branch below would make that cost putting the tool down
  // and picking it back up. Two presses still leave calibration, in the order they were
  // entered in.
  const onEscape = useCallback(() => {
    if (tracing && trace.box !== null) setTrace({ box: null })
    else if (calibrating) {
      setTool('off')
      setDraftGrid(null)
      setTrace({ box: null })
    } else if (hpTarget.hpTokenId !== null) hpTarget.clear()
    else selection.clear()
  }, [
    tracing,
    trace.box,
    setTrace,
    calibrating,
    setTool,
    hpTarget.hpTokenId,
    hpTarget.clear,
    selection.clear,
  ])

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

  // Memoised because this component re-renders on every frame of a pan and a zoom, and a
  // fresh object literal in the JSX below would be an allocation and a style key-walk per
  // frame for a value that changes only when the DM picks a colour. `ZoomControls` takes a
  // scale rather than a camera for the same reason, one element down.
  const surround = useMemo(
    () => (scene === null ? undefined : { backgroundColor: scene.backgroundColour }),
    [scene],
  )

  return (
    /*
      ⚠️ **The surround is painted here in the DOM rather than as a Konva rectangle**, and
      the reason is what a full-viewport `<Rect>` would cost. It would have to live in the
      background layer *in image space*, so covering the whole viewport at any zoom means
      recomputing its size and position from the camera on every pan and wheel frame — and
      `TokenHealthBar`'s note about every layer being re-rasterised on each of those frames
      is the price. This element already exists, already has the right box, and repaints for
      nothing. The one thing it does not do is appear in a canvas export, which nothing in
      this application performs.

      `bg-muted/40` was what this used to be: near-white in light mode, so a map floated in
      a white page and read as one that had failed to load. `backgroundOf` on the server has
      already turned a scene with no stored colour into a real one, so there is no `??` here.

      ⚠️ **The class is unconditional and the style is what overrides it**, which is one
      condition rather than two. An inline `background-color` always beats a class, so the
      pair needs no proof of mutual exclusivity — the class is simply what shows while there
      is no scene to ask, which is the loading skeleton and `BoardEmpty`, neither of them a
      map with a surround. (It was written as a conditional class *and* a conditional style,
      which is the same fact tested twice and a reader having to check they agree.)
    */
    <div
      ref={containerRef}
      className={cn('bg-muted/40 relative overflow-hidden', className)}
      style={surround}
    >
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
              // Paints the party's opaque veil instead of the DM's translucent one. It
              // changes nothing about what arrived — `fog.list` is ungated — and
              // `useBoardLayers` spends a paragraph on why that distinction is restated at
              // every one of this toggle's three consumers rather than written once.
              tableView={layers.tableView}
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
              // The other half of the same toggle. `hiddenFromParty` is already on each
              // token, computed once for the whole board in `useBoard` and `isDm &&`-gated
              // there, so this is a boolean deciding whether to read it — never a second
              // containment test.
              hideFogged={layers.tableView}
              // Held space turns the whole board into a pan surface, so a press that
              // lands on a token has to move the view rather than the creature. Any armed
              // board tool does the same: while one is out, a press anywhere near a coin is
              // aimed at the overlay rather than at the creature — and `armed` is now one
              // lookup rather than three flags that had to be remembered separately.
              draggable={!camera.spacePanning && !armed}
              onSelect={onSelect}
              onDragStart={move.onDragStart}
              onDragMove={move.onDragMove}
              onDragEnd={move.onDragEnd}
              onOpenHp={onOpenHp}
              onContextMenu={onTokenContextMenu}
              // Two more stable identities on the prop contract this component's docblock
              // calls a contract: `useTokenHover` builds both with `[]` deps for exactly the
              // reason listed there, so a pan still reconciles nothing and no coin rebinds.
              onHoverStart={hover.onEnter}
              onHoverEnd={hover.onLeave}
            />
            {/*
              ⚠️ **Over the coins, which is the opposite of where the fog goes, and the two
              reasons are different from each other.**

              Visually, a barrier is the one piece of map furniture that has to read *across*
              a figure: a wall drawn underneath a 2×2 ogre standing against it would
              disappear exactly where the DM most needs to see it. Fog goes underneath
              because an opaque veil painted over the party's own coins would take away the
              figures the server went to some trouble not to withhold.

              For the pointer it is the half-promise `FogLayer` makes and this layer keeps
              whole. There, the coins sit on top, so a press on a creature finds the creature
              and selects it rather than erasing the fog underneath — a documented trade.
              Here the draw surface is above them, so while a wall tool is armed the map
              answers the tool, full stop. It costs nothing that fog was protecting: there is
              no equivalent of *a player's own hero, which must stay pickable through the
              veil*, because this layer is DM-only and only exists while the DM is holding a
              tool for pressing on the map.

              Rendered only for the DM, so on a player's board the stage is exactly the tree
              it was before walls existed — the geometry still arrives, through `useWallPaths`
              above, and stops their drags without being painted.
            */}
            {board.isDm && dm.dmCode !== null ? (
              <WallLayer
                code={code}
                dmCode={dm.dmCode}
                scene={scene}
                scale={camera.camera.scale}
              />
            ) : null}
            {/*
              Last, and that is the whole of how it wins the pointer — see `BoardStage`.
              Rendered only when the DM has asked for it, so on every other board the
              stage is exactly the tree it was before.

              ⚠️ **One of the two, never both, and the ternary is what says so.** They are
              different objects rather than two settings of one tool — `GridTool` carries the
              argument — and two blue rectangles over one map would leave nothing on screen to
              say which of them the grid is currently following. Both write through the same
              `gridWrite` and set the same `draftGrid`, so what changes between them is the
              gesture and not the consequence.

              ⚠️ **This mount used to carry a paragraph about the tracer, the fog brush and the
              wall tool all being out at once and the tracer winning the pointer**, because it
              is mounted last and its draw surface spans the whole image. That is no longer
              possible: `useBoardTool` holds one value, so arming the grid disarms the other two
              by construction and this ternary can only run when nothing else is out. The
              paragraph is kept as a sentence rather than deleted, because the failure it
              described is the one a fourth overlay would reintroduce — and the answer that day
              is a member on `BoardTool`, not a second cell.
            */}
            {board.isDm && calibrating ? (
              tracing ? (
                <TraceBoxLayer
                  code={code}
                  scene={scene}
                  scale={camera.camera.scale}
                  onPreview={onTracePreview}
                  onSettle={onTraceSettle}
                />
              ) : box ? (
                <GridHandlesLayer
                  box={box}
                  scale={camera.camera.scale}
                  onGrab={onGrab}
                  onMove={onHandleMove}
                  onRelease={onHandleRelease}
                />
              ) : null
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
              // The three 2024 writes, each held still by `useHpActions` for the reason
              // `adjust` is — a mutation re-wrapped in a render body is a new function
              // every render, and this component renders on every camera commit.
              onSetTemporaryHp={hp.setTemporaryHp}
              onSetDeathSaves={hp.setDeathSaves}
              onSetHeroicInspiration={hp.setHeroicInspiration}
            />
          ) : null}
          {/*
            WHAT THE COIN IS, beside it. Hidden while this browser is dragging that coin, on
            the popover's reason one element up: React sees a dragged position ten times a
            second because that is the rate invariant 2 caps writes at, so a card following
            it would stutter a quarter of a second behind the pointer dragging it.

            ⚠️ **No permission test here.** The card draws what arrived — the vitals row this
            browser was sent, and a sheet `characters.sheet` decided to answer with — and
            `TokenDetailCard`'s docblock is where the two gates are set out. A viewer who may
            not know a creature's initiative has no sheet, so the card has nothing to draw;
            it does not fetch the number and then decline to print it.
          */}
          {cardToken && move.heldTokenId !== cardToken._id ? (
            <TokenDetailCard
              token={cardToken}
              scene={scene}
              camera={camera.camera}
              sheet={cardSheet}
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
              atX={menu?.x ?? 0}
              atY={menu?.y ?? 0}
              onClose={closeMenu}
              onEdit={onMenuEdit}
              onOpenSheet={onMenuOpenSheet}
              onDuplicate={openDuplicate}
              onDelete={openDelete}
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
            Top-left, opposite the zoom bar. This used to be `CalibrateToggle` alone, on the
            reasoning that a mode wants to be visible from across the room while it is on —
            and that argument turned out to apply to the roll mode far more strongly, since
            advantage is sticky and was two panes away. So the corner holds a toolbar now
            and the calibrate button is one of its three groups. Everything DM-only inside
            is offered on the strength of the DM code alone, which authorises nothing.
          */}
          <BoardToolbar
            isDm={board.isDm}
            calibrating={calibrating}
            onToggleCalibrate={onToggleCalibrate}
            className="top-3 left-3"
          />
          {/*
            ⚠️ **Top-right, on the map, and it is not in the toolbar opposite it on purpose.**
            The toolbar holds controls that are always there; this is a notice that a mode is
            on, and a notice that shares a surface with four permanent buttons is one the eye
            stops reading after the second session. Roll20's documentation says GMs lose track
            of this mode constantly, and a toggle you cannot see from the map is why —
            `TableViewBadge` carries the argument.

            `board.isDm` gates it because "the table cannot see this" is only a sentence about
            somebody else from the DM's chair. It authorises nothing: every consumer of
            `tableView` is already correct for a player without an `isDm` of its own, which is
            the arrangement `useBoardLayers` argues for rather than a gap this fills.
          */}
          {board.isDm && layers.tableView ? (
            <TableViewBadge
              onExit={() => layers.setView('all')}
              className="absolute top-3 right-3"
            />
          ) : null}
        </>
      ) : (
        <BoardEmpty scene={scene} isDm={board.isDm} />
      )}
    </div>
  )
}
