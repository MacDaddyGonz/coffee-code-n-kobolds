import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import Konva from 'konva'
import type { Node as KonvaNode } from 'konva/lib/Node'
import type { Layer as KonvaLayer } from 'konva/lib/Layer'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Cell, Point } from '@convex/lib/grid'
import { moveByCells, snapToGrid } from '@convex/lib/grid'
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
 * The Konva node drawing one token, found through the stage rather than a ref.
 *
 * A ref would have to be threaded from every `TokenCoin` back up here, and the
 * only thing this needs it for is moving a coin between React renders. Konva
 * already indexes nodes by id, so the token id doubles as the handle — which keeps
 * the component contract to plain data and means a token that has not been drawn
 * yet simply returns null instead of being a missing ref to defend against.
 *
 * This depends on `TokenCoin` giving its group `id={token._id}`. Without it the
 * board still works and stays correct — every position React is handed is right —
 * but motion between renders is lost, so remote tokens step ten times a second
 * instead of sliding. It degrades rather than breaks, deliberately.
 */
function findTokenNode(container: HTMLElement | null, tokenId: Id<'tokens'>): KonvaNode | null {
  if (!container) return null
  const stage = Konva.stages.find((candidate) => container.contains(candidate.container()))
  return stage?.findOne<KonvaNode>(`#${tokenId}`) ?? null
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
 */
export function useTokenMove(args: {
  code: string
  dmCode: string | null
  playerId: Id<'players'> | null
  scene: PublicScene | null
  tokens: BoardToken[]
  containerRef: RefObject<HTMLElement | null>
}): TokenMove {
  const { code, dmCode, playerId, scene, tokens, containerRef } = args

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

  /** This browser's own answer for one token, which the server has not confirmed yet. */
  const localRef = useRef<{ tokenId: Id<'tokens'>; point: Point } | null>(null)
  const heldRef = useRef<Id<'tokens'> | null>(null)

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
    },
    [hold],
  )

  const onDragMove = useCallback(
    (token: BoardToken, point: Point) => {
      const currentScene = sceneRef.current
      if (!currentScene) return

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
    [throttled],
  )

  const onDragEnd = useCallback(
    (token: BoardToken, point: Point) => {
      settle(token._id, point)
    },
    [settle],
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

      hold(tokenId)
      // `moveByCells` snaps before it steps, so an interrupted drag is corrected by
      // the first keypress instead of carrying its offset along for every square
      // after it.
      const point = moveByCells(from, currentScene, token.sizeSquares, delta)
      placeLocally(tokenId, point)
      throttled({
        tokenId,
        sceneId: currentScene._id,
        x: point.x,
        y: point.y,
        settle: false,
      })
    },
    [hold, placeLocally, throttled],
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
    const container = containerRef.current
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

      const node = findTokenNode(container, tokenId)
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
    const container = containerRef.current
    const live = new Set<Id<'tokens'>>()

    for (const token of tokens) {
      if (!token.position) continue
      live.add(token._id)

      const drawn = (fallback: Point) => {
        const node = findTokenNode(container, token._id)
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
