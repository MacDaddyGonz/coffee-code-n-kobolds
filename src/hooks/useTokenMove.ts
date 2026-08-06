import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import Konva from 'konva'
import type { Node as KonvaNode } from 'konva/lib/Node'
import type { Layer as KonvaLayer } from 'konva/lib/Layer'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Cell, Point } from '@convex/lib/grid'
import { moveByCells, pathCrossesAnyWall, snapToGrid } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'
import { errorMessage } from '@/lib/errors'
import { MOVE_THROTTLE_MS, throttle } from '@/lib/throttle'
import type { BoardToken } from '@/hooks/useBoard'
import { positionsArgs } from '@/hooks/useBoard'

/**
 * How long a remote token takes to slide to a newly received position.
 *
 * Matched to the write rate rather than chosen for feel: writes arrive about every
 * `MOVE_THROTTLE_MS`, so tweening over a little longer than one window means each
 * new target arrives while the previous slide is still finishing and the motion
 * joins up. Much shorter and the steps show through; much longer and the token
 * visibly trails the person dragging it.
 */
export const SMOOTH_MS = 120

/**
 * Where a token node sits, in the image space the database stores.
 *
 * Konva reports a node's position in its parent's coordinates, and a coin is a
 * direct child of a token `Layer` whose only ancestor is the stage — and the
 * stage's transform *is* the camera. So a node's own position is already an
 * image-space coordinate, with no conversion to get wrong and, more usefully, no
 * dependence on this render's camera happening to agree with the stage's.
 * `toImageSpace` remains the only way to turn a *pointer* into a position; a
 * dragged node is not a pointer, because Konva has already done that arithmetic
 * and kept hold of where in the token you grabbed it.
 */
function nodePoint(node: KonvaNode): Point {
  return { x: node.x(), y: node.y() }
}

/**
 * The board's Konva stage, found by containment rather than by a ref.
 *
 * A ref would have to be threaded from `BoardStage` back up here, and the only
 * thing this needs it for is moving coins between React renders. `Konva.stages` is
 * a short global list, so asking which of them lives inside our container answers
 * it without the component contract growing a handle.
 *
 * It does touch the DOM — `container.contains` — so it is called once per frame
 * and per effect run, never once per token. That is the whole reason it is its own
 * function rather than folded into a lookup.
 */
function findStage(container: HTMLElement | null): Konva.Stage | null {
  if (!container) return null
  return Konva.stages.find((candidate) => container.contains(candidate.container())) ?? null
}

/**
 * Every drawn coin on the board, indexed by token id.
 *
 * `stage.findOne('#id')` walks the whole tree and re-parses the selector at every
 * node it visits, so twenty tokens is twenty full descendant walks a frame. The
 * coins are the direct children of the token layers and the only nodes there with
 * an id, so one shallow pass over those children collects all of them.
 *
 * This depends on `TokenCoin` giving its group `id={token._id}`. Without it the
 * board still works and stays correct — every position React is handed is right —
 * but motion between renders is lost, so remote tokens step ten times a second
 * instead of sliding. It degrades rather than breaks, deliberately.
 */
function coinNodes(stage: Konva.Stage | null): Map<string, KonvaNode> {
  const nodes = new Map<string, KonvaNode>()
  if (!stage) return nodes
  for (const layer of stage.getLayers()) {
    for (const child of layer.getChildren()) {
      const id = child.id()
      if (id) nodes.set(id, child)
    }
  }
  return nodes
}

/** One coin, for the callers that only ever want one. */
function findTokenNode(container: HTMLElement | null, tokenId: Id<'tokens'>): KonvaNode | null {
  return findStage(container)?.findOne<KonvaNode>(`#${tokenId}`) ?? null
}

/** What one call to `board.moveToken` says, before the game and the seat are added. */
type MoveArgs = {
  tokenId: Id<'tokens'>
  sceneId: Id<'scenes'>
  x: number
  y: number
  settle: boolean
}

export type TokenMove = {
  /** The token this browser is moving right now — a held drag, or a held arrow key. */
  heldTokenId: Id<'tokens'> | null
  /**
   * Where this browser believes a token is, which outranks the server for as long
   * as it is non-null. Read during render, so the position React hands to Konva and
   * the position the drag put there cannot disagree.
   */
  localPositionOf: (tokenId: Id<'tokens'>) => Point | null
  /**
   * The three drag handlers `TokenLayer` calls, which read the coin's position off
   * the Konva node for us — so nothing here has to touch a Konva event, and the
   * point that arrives is already image-space.
   */
  onDragStart: (token: BoardToken) => void
  onDragMove: (token: BoardToken, point: Point) => void
  onDragEnd: (token: BoardToken, point: Point) => void
  /** One arrow keypress: move this token `delta` whole squares from where it is now. */
  nudge: (tokenId: Id<'tokens'>, delta: Cell) => void
  /** The arrow keys were released. Settles wherever the run of presses arrived. */
  endNudge: () => void
  /** The server's own wording for a refused move, or null. */
  error: string | null
}

/**
 * Moving a token: two input methods, one write path.
 *
 * The shape of this hook is CLAUDE.md invariant 2 written out. A pointer drag
 * emits `dragmove` at the display's frame rate and a held arrow key repeats around
 * thirty times a second, and neither may become a database write — so both feed
 * the same throttle at roughly ten writes a second with `settle: false`, and both
 * finish with exactly one `settle: true` call carrying the snapped position. The
 * server snaps that last write again with the same function, which is what makes
 * "a dropped token is never left between squares" a guarantee rather than a hope
 * (ADR 0004).
 *
 * Nothing here re-renders React per frame. During a drag Konva owns the node and
 * this hook only records where it got to; during a run of arrow keys the node is
 * moved imperatively. React sees a position change when a write goes out — ten
 * times a second — and never in between.
 *
 * ⚠️⚠️ **WALLS LIVE HERE AND THE SERVER ONLY BACKSTOPS THEM, WHICH IS THE DESIGN AND NOT A
 * SHORTCUT.** `board.moveToken` checks the settling write and nothing else, because a
 * `walls` range read on a handler that runs ten times a second would turn every barrier the
 * DM traced into an OCC conflict against every in-flight drag (CLAUDE.md invariant 2, and
 * `requireMovableToken`'s docblock). So the *feel* is this file's job: each frame is tested
 * against the last point this browser **accepted**, and a blocked frame is simply not
 * accepted — the node is put back and nothing is pushed. The coin slides up to the wall and
 * stops, which is what Roll20 does and is the entire user-facing feature.
 *
 * ⭐ **Testing against the last accepted point rather than against where the drag started is
 * the whole of why walking round a wall works**, and it makes the block *path-dependent*,
 * which is what a person expects: you cannot reach the far side of a barrier in one straight
 * line, and you can reach it by going round the end. A test against the drag origin would
 * refuse the second half of every journey round a corner.
 *
 * ⚠️ **Skipped entirely for the DM**, who places creatures inside sealed rooms and drags the
 * party through doors they have just narrated open. And **not applied to the arrow keys**:
 * a keypress is a whole square at once, so there is nothing to slide, and those moves reach
 * `board.moveToken` and are refused there — see `nudge` and `WallTools`' copy, without which
 * the difference between the two input methods reads as a bug.
 */
export function useTokenMove(args: {
  code: string
  dmCode: string | null
  playerId: Id<'players'> | null
  scene: PublicScene | null
  tokens: BoardToken[]
  containerRef: RefObject<HTMLElement | null>
  /**
   * The barriers on this board, as bare geometry — `useWallPaths`. Every client is sent
   * them, because a browser cannot stop a drag against geometry it does not have; see the
   * header of `convex/walls.ts`.
   */
  walls: readonly Point[][]
}): TokenMove {
  const { code, dmCode, playerId, scene, tokens, containerRef, walls } = args

  const [heldTokenId, setHeldTokenId] = useState<Id<'tokens'> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Everything the handlers need, behind refs. They are created once and handed to
  // Konva and to the key listener, so a handler that closed over this render's
  // props would still be sending last minute's scene id when the DM switched maps
  // mid-drag.
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const codeRef = useRef(code)
  codeRef.current = code
  const dmCodeRef = useRef(dmCode)
  dmCodeRef.current = dmCode
  const playerIdRef = useRef(playerId)
  playerIdRef.current = playerId

  const byId = useMemo(() => new Map(tokens.map((token) => [token._id, token])), [tokens])
  const tokensRef = useRef(byId)
  tokensRef.current = byId

  const wallsRef = useRef(walls)
  wallsRef.current = walls

  /** This browser's own answer for one token, which the server has not confirmed yet. */
  const localRef = useRef<{ tokenId: Id<'tokens'>; point: Point } | null>(null)
  const heldRef = useRef<Id<'tokens'> | null>(null)

  /**
   * The last point of the gesture in progress that was **not** refused by a wall — where
   * the coin is actually allowed to be.
   *
   * ⚠️ **A second ref beside `localRef` rather than a reading of it**, and the two genuinely
   * differ for the length of one frame: `localRef` is *what this browser is drawing*, which
   * the blocked branch below deliberately puts back to the accepted point, while this is
   * *what this browser has agreed to*. They coincide after every frame and diverge during
   * one, and collapsing them would make the wall test compare the candidate against itself.
   *
   * Seeded at the start of a gesture and cleared at the end of one, so a coin that was
   * released against a barrier last minute does not start its next drag already blocked.
   */
  const acceptedRef = useRef<{ tokenId: Id<'tokens'>; point: Point } | null>(null)

  const moveToken = useMutation(api.board.moveToken)

  // Built once, and reading the refs above, so `commit` and the throttle wrapped
  // around it are stable for the lifetime of the board. Re-creating the throttle
  // on a prop change would drop whatever call was sitting in its trailing window.
  const commit = useMemo(
    () =>
      moveToken.withOptimisticUpdate((localStore, mutationArgs) => {
        // THE thing to get wrong here. These arguments must be byte-for-byte what
        // the component subscribes with, `dmCode` included: Convex caches a query
        // per argument set, so a DM and a player hold different entries for the
        // same board (ADR 0004). Patch the wrong one and the optimistic position
        // is written where nobody is reading, the drag renders from the server
        // instead, and the token rubber-bands a tenth of a second behind the
        // mouse. Hence the shared builder rather than a literal typed out twice.
        const queryArgs = positionsArgs(
          codeRef.current,
          mutationArgs.sceneId,
          dmCodeRef.current,
        )
        const current = localStore.getQuery(api.board.positions, queryArgs)
        if (current === undefined) return

        const point = { tokenId: mutationArgs.tokenId, x: mutationArgs.x, y: mutationArgs.y }
        // Appended when missing, because the row's existence is what puts a token
        // on this board — a token dragged onto a scene it has never stood on has
        // no position row to patch until the mutation lands.
        const next = current.some((row) => row.tokenId === mutationArgs.tokenId)
          ? current.map((row) => (row.tokenId === mutationArgs.tokenId ? point : row))
          : [...current, point]

        localStore.setQuery(api.board.positions, queryArgs, next)
      }),
    [moveToken],
  )

  const send = useCallback(
    (moveArgs: MoveArgs) => {
      void commit({
        code: codeRef.current,
        ...moveArgs,
        // Spread conditionally for the same reason the query args are: `undefined`
        // is not a Convex value, and a seat that has not been taken has no id to
        // send. `playerId` is advisory either way — it says whose token this is
        // meant to be, not who is calling (invariant 7, ADR 0004).
        ...(dmCodeRef.current === null ? {} : { dmCode: dmCodeRef.current }),
        ...(playerIdRef.current === null ? {} : { playerId: playerIdRef.current }),
      }).catch((thrown: unknown) => {
        setError(errorMessage(thrown, 'That token could not be moved.'))
        // Let go of the local answer, so the token returns to wherever the server
        // says it is. Keeping it would leave a refused move looking like it had
        // worked until the next reload.
        if (localRef.current?.tokenId === moveArgs.tokenId) localRef.current = null
        if (heldRef.current === moveArgs.tokenId) {
          heldRef.current = null
          setHeldTokenId(null)
        }
      })
    },
    [commit],
  )

  const throttled = useMemo(() => throttle(send, MOVE_THROTTLE_MS), [send])
  useEffect(() => () => throttled.cancel(), [throttled])

  /**
   * Put a token somewhere on this browser only: the node now, the local answer for
   * the next render, and nothing at all to the database.
   *
   * Both halves are needed. The local answer is what the next render hands Konva,
   * and the node write is what happens in between — which is every frame of a run
   * of arrow keys inside one throttle window, and the drop of a token that landed
   * back in the square it started from. That second case is the subtle one: React
   * would be handing Konva a position it has already been given, so react-konva
   * would see no change and leave the coin sitting wherever the pointer let go.
   */
  const placeLocally = useCallback(
    (tokenId: Id<'tokens'>, point: Point) => {
      localRef.current = { tokenId, point }
      const node = findTokenNode(containerRef.current, tokenId)
      if (!node) return
      node.position(point)
      node.getLayer()?.batchDraw()
    },
    [containerRef],
  )

  /**
   * Would going from the accepted point to `point` cross a barrier?
   *
   * Three short-circuits before the arithmetic, in the order that makes a board without
   * walls cost nothing: **the DM is never blocked**, a map with no walls has nothing to
   * cross, and a gesture that has not been seeded has no journey to measure. The same
   * `pathCrossesAnyWall` the server runs on the settling write, imported rather than
   * re-implemented — which is what makes the coin's stop and the server's refusal one
   * function rather than two that agreed when they were written.
   */
  const blocked = useCallback((tokenId: Id<'tokens'>, point: Point): boolean => {
    if (dmCodeRef.current !== null) return false
    if (wallsRef.current.length === 0) return false
    const accepted = acceptedRef.current
    if (accepted === null || accepted.tokenId !== tokenId) return false
    return pathCrossesAnyWall(wallsRef.current, accepted.point, point)
  }, [])

  /**
   * Take a candidate point, or refuse it and hand back the one already accepted.
   *
   * **The one place a wall changes what a drag does**, and it is written as a function of a
   * point rather than as a branch in each handler so that the drop is literally one more
   * frame of the drag. Advancing the accepted point *only* on the clear branch is what makes
   * the block path-dependent — see the ⭐ on the hook.
   */
  const accept = useCallback(
    (tokenId: Id<'tokens'>, point: Point): Point => {
      const accepted = acceptedRef.current
      if (accepted !== null && accepted.tokenId === tokenId && blocked(tokenId, point)) {
        return accepted.point
      }
      acceptedRef.current = { tokenId, point }
      return point
    },
    [blocked],
  )

  const hold = useCallback((tokenId: Id<'tokens'>) => {
    if (heldRef.current === tokenId) return
    heldRef.current = tokenId
    setHeldTokenId(tokenId)
    setError(null)
  }, [])

  /**
   * Stop treating a token as ours to move. The local answer deliberately outlives
   * the hold: it is cleared by the effect below, once the position we sent has come
   * back, so there is no frame between letting go and the server agreeing in which
   * the token is drawn from a stale subscription.
   */
  const release = useCallback(() => {
    if (heldRef.current === null) return
    heldRef.current = null
    setHeldTokenId(null)
    // The accepted point belongs to the gesture and not to the token, so it goes with the
    // hold rather than with the local answer above. A coin let go of against a barrier must
    // start its next drag from wherever it now stands, not from where the last one stopped.
    acceptedRef.current = null
  }, [])

  /**
   * The settling write, shared by dropping a token and releasing an arrow key.
   *
   * `cancel()` comes first and the ordering is the whole point. An intermediate
   * position still sitting in the throttle's trailing window would be delivered
   * *after* this one and strand the token between squares, with the server having
   * no way to tell it was stale — the argument in `@/lib/throttle`.
   */
  const settle = useCallback(
    (tokenId: Id<'tokens'>, loose: Point) => {
      throttled.cancel()

      const currentScene = sceneRef.current
      if (!currentScene) {
        release()
        return
      }

      // The same `snapToGrid` the server is about to apply, so the optimistic
      // position and the committed one are the same numbers and there is nothing to
      // rubber-band back from. The server's copy is the guarantee; this one is the
      // nicety (ADR 0004). A token that has vanished from the board mid-gesture is
      // snapped as 1×1 — the write will be refused anyway, and guessing is better
      // than sending an unsnapped position on the way to being told no.
      const size = tokensRef.current.get(tokenId)?.sizeSquares ?? 1
      const point = snapToGrid(loose, currentScene, size)

      placeLocally(tokenId, point)
      send({ tokenId, sceneId: currentScene._id, x: point.x, y: point.y, settle: true })
      release()
    },
    [placeLocally, release, send, throttled],
  )

  const onDragStart = useCallback(
    (token: BoardToken) => {
      hold(token._id)
      if (token.position) localRef.current = { tokenId: token._id, point: token.position }
      // Seeded from the **stored** placement, which is the only point on this board a wall
      // has already been satisfied about. A gesture on a coin with no placement — one that
      // is not on this scene — is left unseeded, so `blocked` answers false and the drag
      // behaves exactly as it did before walls existed.
      acceptedRef.current = token.position
        ? { tokenId: token._id, point: token.position }
        : null
    },
    [hold],
  )

  const onDragMove = useCallback(
    (token: BoardToken, point: Point) => {
      const currentScene = sceneRef.current
      if (!currentScene) return

      /*
        The wall, and the whole of the feel. A blocked frame is **not accepted**: the node is
        put back where the coin is allowed to be and nothing is pushed, so the token slides
        up to the barrier and stops there rather than being yanked back after a round trip.

        Konva recomputes the node's position from the pointer on the *next* frame rather than
        from what we set here, so this correction is applied per frame for as long as the
        pointer stays past the wall — which is what makes the coin sit still against it
        instead of accumulating an offset.

        `placeLocally` rather than a bare `node.position`: the local answer is what the next
        render hands Konva, and leaving it pointing past the wall would let a re-render put
        the coin back on the far side between frames.
      */
      const allowed = accept(token._id, point)
      if (allowed !== point) {
        placeLocally(token._id, allowed)
        return
      }

      // Konva has already moved the node for this frame and it keeps it: no React
      // state is touched per mouse-move, which is the first half of invariant 2.
      // The raw, unsnapped position goes out — floats deliberately, so the far
      // screen sees motion rather than a token hopping cell to cell (ADR 0004).
      localRef.current = { tokenId: token._id, point }
      throttled({
        tokenId: token._id,
        sceneId: currentScene._id,
        x: point.x,
        y: point.y,
        settle: false,
      })
    },
    [accept, placeLocally, throttled],
  )

  /**
   * The drop, which is one more frame of the drag and is written as one.
   *
   * ⚠️ **`accept` is applied here too, and it is not belt and braces.** Konva does not move
   * the node again on `dragend`, so in the ordinary case this returns the point the last
   * frame already accepted and the call is free. What it closes is the case where the DM's
   * pointer is somewhere past the wall when the button comes up: without it, a browser whose
   * last `dragmove` never fired would settle at a position the server is about to refuse.
   *
   * ⚠️ **What it cannot close is the snap**, and that is the honest boundary between the
   * client's feel and the server's authority. `settle` rounds the accepted point to a square
   * centre, and on a wall drawn along a grid line — which is every wall the DM's own snap
   * produces — a point on the near side rounds to the near side's centre. Where the two can
   * disagree, `board.moveToken` refuses and the coin springs back with the server's own
   * words. One rule, checked twice, and the second check is the one that is authoritative.
   */
  const onDragEnd = useCallback(
    (token: BoardToken, point: Point) => {
      settle(token._id, accept(token._id, point))
    },
    [accept, settle],
  )

  const nudge = useCallback(
    (tokenId: Id<'tokens'>, delta: Cell) => {
      const currentScene = sceneRef.current
      const token = tokensRef.current.get(tokenId)
      if (!currentScene || !token || !token.canMove) return

      // From wherever this browser last put the token, not from the server's idea
      // of it. A held key repeats about thirty times a second while writes go out
      // ten times a second, so reading the subscription would replay the same two
      // or three squares over and over.
      const from = localRef.current?.tokenId === tokenId ? localRef.current.point : token.position
      if (!from) return

      // Seeded on the first press of a run, from the **stored** placement rather than from
      // the local answer above: a run of keys is one gesture, and what a wall has already
      // been satisfied about is where the coin actually stands.
      if (heldRef.current !== tokenId && token.position) {
        acceptedRef.current = { tokenId, point: token.position }
      }

      hold(tokenId)
      // `moveByCells` snaps before it steps, so an interrupted drag is corrected by
      // the first keypress instead of carrying its offset along for every square
      // after it.
      const point = moveByCells(from, currentScene, token.sizeSquares, delta)
      placeLocally(tokenId, point)

      /*
        ⚠️ **The arrow keys get no slide-and-stop, and this is the whole of the difference.**
        A drag is held frame by frame and comes to rest against the barrier; a keypress is a
        whole square at once, so there is nothing to slide up to — the coin moves where the
        key says and `endNudge`'s settling write is refused by `board.moveToken`, which puts
        it back with the server's own words. `WallTools` says so in a sentence, because
        without one the two input methods behaving differently reads as a bug.

        What this clause does is stop the *intermediate* write, and it is what makes that
        refusal actually happen. Those writes are unchecked by design (see `board.moveToken`
        on the advisory ceiling) and they move the `from` point the settling check measures
        from — so pushing one here would walk the coin through the wall on every other
        client and then hand the server a perfectly legal hop to accept. The gesture is still
        blocked as a whole, because `acceptedRef` is not advanced: every later step of the
        same run is measured from the same place and suppressed too.
      */
      if (blocked(tokenId, point)) return
      acceptedRef.current = { tokenId, point }

      throttled({
        tokenId,
        sceneId: currentScene._id,
        x: point.x,
        y: point.y,
        settle: false,
      })
    },
    [blocked, hold, placeLocally, throttled],
  )

  const endNudge = useCallback(() => {
    const tokenId = heldRef.current
    const local = localRef.current
    if (!tokenId || local?.tokenId !== tokenId) {
      release()
      return
    }
    settle(tokenId, local.point)
  }, [release, settle])

  const localPositionOf = useCallback((tokenId: Id<'tokens'>) => {
    return localRef.current?.tokenId === tokenId ? localRef.current.point : null
  }, [])

  // Hand the token back to the subscription once the server agrees, and only then.
  // The optimistic update means agreement usually arrives on the very next render
  // with the identical numbers, so the handover is invisible; a token that has been
  // deleted or has left this scene is let go of too, or its local answer would pin
  // a coin to a board it is no longer on.
  useEffect(() => {
    const local = localRef.current
    if (!local || heldRef.current !== null) return

    const token = byId.get(local.tokenId)
    if (!token?.position) {
      localRef.current = null
      return
    }
    if (token.position.x === local.point.x && token.position.y === local.point.y) {
      localRef.current = null
    }
  }, [byId])

  return {
    heldTokenId,
    localPositionOf,
    onDragStart,
    onDragMove,
    onDragEnd,
    nudge,
    endNudge,
    error,
  }
}

/**
 * One token's slide from where it was drawn to where the server says it is.
 *
 * `pinned` is rule 1 below made explicit: a token this browser is moving keeps an
 * entry so the next slide has somewhere to start from, but the frame loop steps
 * straight over it. Without that, the loop would write a hundred-millisecond-old
 * position onto the very node Konva is dragging.
 */
type Tween = { from: Point; to: Point; startedAt: number; current: Point; pinned: boolean }

/**
 * Smoothing everybody else's tokens.
 *
 * Positions arrive about ten times a second, because that is the rate invariant 2
 * caps writes at. Applied as they land, a token being dragged on another screen
 * moves in ten visible jerks a second, which is exactly the "in jumps" the
 * acceptance criterion rules out — the throttle bought the database its quiet and
 * left the far screen looking worse. So each new position starts a short slide from
 * wherever the token was last drawn, and one `requestAnimationFrame` loop advances
 * every slide in progress and stops itself when the last one lands.
 *
 * Two rules, and they are the whole correctness of it:
 *
 * 1. A token *this* browser is moving is never driven by server state — not for any
 *    part of a drag, not while an arrow key is held, and specifically not by the
 *    echoes of this browser's own throttled writes, which are a tenth of a second
 *    behind the mouse and would drag the token backwards.
 * 2. Every other token is driven only by the interpolated server state, never by a
 *    local guess.
 *
 * The loop writes Konva node positions imperatively. React is not re-rendered per
 * frame; it only re-renders when a subscription updates, and the array returned
 * here reports each token's *current* interpolated position so that when React
 * does render, it hands Konva the same place the loop has the node.
 */
export function useSmoothPositions(args: {
  tokens: BoardToken[]
  containerRef: RefObject<HTMLElement | null>
  heldTokenId: Id<'tokens'> | null
  localPositionOf: (tokenId: Id<'tokens'>) => Point | null
}): BoardToken[] {
  const { tokens, containerRef, heldTokenId, localPositionOf } = args

  const tweens = useRef(new Map<Id<'tokens'>, Tween>())
  const frame = useRef<number | null>(null)

  // Annotated because the body schedules the next frame by naming itself, which
  // TypeScript cannot infer a type through.
  const tick: () => void = useCallback(() => {
    frame.current = null
    const now = performance.now()
    // Both lookups hoisted out of the loop below. Inside it they were a DOM call
    // and a full tree walk per moving token per frame, which at twenty tokens is
    // the kind of work that decides whether the board holds sixty frames.
    const nodes = coinNodes(findStage(containerRef.current))
    const layers = new Set<KonvaLayer>()
    let running = false

    for (const [tokenId, tween] of tweens.current) {
      if (tween.pinned) continue
      const progress = Math.min(1, (now - tween.startedAt) / SMOOTH_MS)
      // Landed and already drawn there, so there is nothing to write. Kept in the
      // map rather than deleted: its `current` is where the next slide starts from.
      if (progress >= 1 && tween.current.x === tween.to.x && tween.current.y === tween.to.y) {
        continue
      }

      tween.current = {
        x: tween.from.x + (tween.to.x - tween.from.x) * progress,
        y: tween.from.y + (tween.to.y - tween.from.y) * progress,
      }
      if (progress < 1) running = true

      const node = nodes.get(tokenId)
      if (!node) continue
      node.position(tween.current)
      const layer = node.getLayer()
      if (layer) layers.add(layer)
    }

    // Once per layer rather than once per token: `batchDraw` redraws the whole
    // layer, so calling it per moving token would redraw it several times a frame.
    for (const layer of layers) layer.batchDraw()
    if (running) frame.current = window.requestAnimationFrame(tick)
  }, [containerRef])

  const start = useCallback(() => {
    if (frame.current === null) frame.current = window.requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    }
  }, [])

  // Runs after every commit, which is when react-konva has just applied this
  // render's positions to the nodes — so a node's own position is the most
  // truthful answer available to "where is this token drawn right now", and it is
  // what each new slide starts from. Deriving the start from the previous tween's
  // arithmetic instead is subtly wrong at exactly one moment: letting go of a
  // token hands it back to the server, and a start point a hundred milliseconds
  // stale would yank it backwards before sliding it forwards again.
  useEffect(() => {
    const now = performance.now()
    // Indexed once, for the same reason as in `tick`: this runs after every commit,
    // which during a drag is ten times a second.
    const nodes = coinNodes(findStage(containerRef.current))
    const live = new Set<Id<'tokens'>>()

    for (const token of tokens) {
      if (!token.position) continue
      live.add(token._id)

      const drawn = (fallback: Point) => {
        const node = nodes.get(token._id)
        return node ? nodePoint(node) : fallback
      }

      // Rule 1. A token we are moving is nobody else's business: nothing the server
      // says about it, our own throttled writes coming back included, may start a
      // slide. The entry is kept rather than dropped so the token has a history to
      // resume from, and `pinned` keeps the frame loop off it in the meantime.
      const local = localPositionOf(token._id)
      if (local || token._id === heldTokenId) {
        const at = local ?? token.position
        tweens.current.set(token._id, {
          from: at,
          to: at,
          startedAt: now,
          current: at,
          pinned: true,
        })
        continue
      }

      const tween = tweens.current.get(token._id)
      // First sight of a token is not a slide. A coin appearing on the board should
      // be drawn where it stands, not travel there from wherever the last one was.
      if (!tween) {
        tweens.current.set(token._id, {
          from: token.position,
          to: token.position,
          startedAt: now,
          current: token.position,
          pinned: false,
        })
        continue
      }
      if (!tween.pinned && tween.to.x === token.position.x && tween.to.y === token.position.y) {
        continue
      }

      const from = drawn(tween.current)
      tweens.current.set(token._id, {
        from,
        to: token.position,
        startedAt: now,
        current: from,
        pinned: false,
      })
      // Only worth a frame loop if there is actually ground to cover. Releasing a
      // token lands here with the two already equal, and spinning rAF for 120 ms to
      // interpolate nothing would keep the board redrawing after every single drop.
      if (from.x !== token.position.x || from.y !== token.position.y) start()
    }

    for (const tokenId of tweens.current.keys()) {
      if (!live.has(tokenId)) tweens.current.delete(tokenId)
    }
  }, [tokens, heldTokenId, localPositionOf, start, containerRef])

  // Read during render on purpose. The loop above is the only thing moving these
  // tokens between renders, so this is what keeps a render from handing Konva a
  // position the loop has already moved past — the alternative is React state per
  // frame, which is the churn the whole hook exists to avoid.
  return useMemo(
    () =>
      tokens.map((token) => {
        const local = localPositionOf(token._id)
        if (local) return { ...token, position: local }
        const tween = tweens.current.get(token._id)
        return tween ? { ...token, position: tween.current } : token
      }),
    [tokens, localPositionOf],
  )
}
