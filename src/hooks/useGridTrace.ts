import { useCallback, useSyncExternalStore } from 'react'

import type { Rect } from '@convex/lib/grid'

// WHICH GRID TOOL THE DM IS HOLDING, AND THE BOX THEY HAVE TRACED WITH IT.
//
// Nothing in this file decides anything anybody may see or do. It is a browser's own choice
// of tool and one rectangle of geometry the DM dragged; every write it leads to goes through
// `useGridWrite` to `scenes.updateGrid`, which re-verifies the DM code server-side on every
// call (CLAUDE.md invariant 7). A player who reached into this cell would arm a tool over a
// layer that is not mounted for them and, if they got past that, be refused by the mutation.

/**
 * The two ways of calibrating a grid *on the map*, as against typing numbers at it.
 *
 * - `handles` — the square-by-construction box anchored to the grid origin, `gridBox.ts`.
 * - `trace` — the free-aspect box dragged over a block of the map's **own** printed squares,
 *   `gridTrace.ts`.
 *
 * ⚠️ **They are different objects rather than two settings of one, and only one is ever on
 * screen.** The handles box carries a single `side` and its top-left corner *is* the grid
 * origin, so dragging it is a direct edit of the three stored numbers. The trace box is a
 * measurement of something already printed on the map, anchored wherever the DM found a
 * legible block of squares, and the grid falls out of it by division and a modulus. Drawing
 * both at once would put two blue rectangles over one map with no way to tell which one the
 * grid is currently following.
 */
export type GridTool = 'handles' | 'trace'

/**
 * The tools, in the order they are offered. Iterated by the picker rather than two buttons
 * being written out — `FOG_MODES`' rule and CLAUDE.md invariant 9's: a third tool arrives
 * with somewhere to be pressed rather than with nowhere.
 */
export const GRID_TOOLS: readonly GridTool[] = ['handles', 'trace']

/**
 * How many squares the trace box is assumed to span before the DM says otherwise.
 *
 * ⚠️ **Deliberately not `CALIBRATION_CELLS`, and sharing the two would be a mistake worth
 * naming.** That four is load-bearing arithmetic: it is a power of two precisely so that
 * `side / cells` and `gridSize * cells` are both exact in binary and merely opening the
 * handles perturbs nothing. Nothing of the sort is true here — `box.width / 3` is whatever
 * the DM's pointer landed on — so this number is only a starting guess, overwritten on most
 * traces, and its one job is to be a plausible block that is not zero. A zero would make the
 * readout say nothing on the first drag the DM ever makes, which reads as the tool being
 * broken.
 */
export const DEFAULT_TRACE_SQUARES = 3

/** Everything the two panes have to agree about while the trace tool is out. */
export type TraceState = {
  tool: GridTool
  /**
   * The box the DM last traced, in image space and already normalised, or `null` before the
   * first drag. It **survives the mouse coming up**, unlike a fog band: the counts beside it
   * are meant to be corrected after the fact, and a box that vanished on release would make
   * *"three squares, no — four"* a second drag rather than a keystroke.
   */
  box: Rect | null
  /** Squares across the traced box, and down it. Freely `NaN` — see `gridFromTrace`. */
  across: number
  down: number
}

const INITIAL: TraceState = {
  tool: 'handles',
  box: null,
  across: DEFAULT_TRACE_SQUARES,
  down: DEFAULT_TRACE_SQUARES,
}

type Store = { state: TraceState; listeners: Set<() => void> }

/**
 * ⚠️ **A module-level store rather than `useState`, and it is `useFogMode`'s argument with
 * the same two halves of the screen in it.** The tool picker and the two count fields are in
 * `GridCalibrator`, deep inside the right-hand pane; the box they describe is dragged in
 * `TraceBoxLayer`, inside the Konva tree in the map pane. Two `useState`s cannot be that, and
 * hoisting this to `GameShell` would thread a board concern through the component whose job
 * is to arrange two panes — the same trade that file makes and declines.
 *
 * Keyed by game code, so a browser that has been in two games does not carry the first one's
 * traced box into the second.
 *
 * **Nothing is written to `localStorage`**, which is `useFogMode`'s departure from
 * `useBoardLayers` for a reason that applies here too: a box traced over last week's map is
 * measured against art that is no longer on the table, and a stale one restored after a
 * refresh nobody remembers doing would be a measurement of nothing sitting over a picture of
 * something else.
 */
const stores = new Map<string, Store>()

function storeFor(code: string): Store {
  const existing = stores.get(code)
  if (existing) return existing

  const store: Store = { state: INITIAL, listeners: new Set() }
  stores.set(code, store)
  return store
}

/** Whether a patch would actually change anything. See the no-op guard in `setTrace`. */
function changes(state: TraceState, patch: Partial<TraceState>): boolean {
  return (Object.keys(patch) as (keyof TraceState)[]).some((key) => state[key] !== patch[key])
}

export type GridTraceControls = TraceState & {
  /**
   * Patch the shared cell. A patch rather than four setters because the callers change two
   * fields at once and mean it as one act — putting the trace tool down *is* dropping the box
   * it measured, and a pair of calls would notify twice and repaint the board twice for one
   * decision.
   */
  setTrace: (patch: Partial<TraceState>) => void
}

/**
 * The trace tool as this browser is holding it.
 *
 * ⚠️ **A view and never a permission**, on ADR 0004's terms and word for word `useFogMode`'s:
 * choosing a tool decides which Konva layer is mounted on *this* screen, and the refusal
 * behind every write it leads to is `requireDm` inside `scenes.updateGrid`.
 */
export function useGridTrace(code: string): GridTraceControls {
  const subscribe = useCallback(
    (listener: () => void) => {
      const store = storeFor(code)
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    [code],
  )

  const state = useSyncExternalStore(subscribe, useCallback(() => storeFor(code).state, [code]))

  const setTrace = useCallback(
    (patch: Partial<TraceState>) => {
      const store = storeFor(code)
      // Not tidiness: `useSyncExternalStore` re-renders every subscriber on any notification,
      // and one of the subscribers is a Konva layer over a map. Pressing the tool already in
      // your hand, or retyping the count that is already there, would repaint the board.
      if (!changes(store.state, patch)) return
      store.state = { ...store.state, ...patch }
      for (const listener of store.listeners) listener()
    },
    [code],
  )

  return { ...state, setTrace }
}
