import { useCallback, useSyncExternalStore } from 'react'

import type { BoardSurface, BoardTool } from '@/lib/boardTool'
import {
  BOARD_TOOL_SURFACE,
  armBoardTool,
  boardTool,
  putDownBoardSurface,
  subscribeToBoardTool,
} from '@/lib/boardTool'

export type BoardToolControls = {
  /** What this browser is holding over the map. `off` is the board behaving normally. */
  tool: BoardTool
  /**
   * Which overlay owns the pointer, looked up rather than derived by naming members — see
   * `BOARD_TOOL_SURFACE`, which is where a new tool is forced to say where it belongs.
   */
  surface: BoardSurface
  /** Arm one tool, which puts down whatever was in the DM's hand. */
  setTool: (tool: BoardTool) => void
  /** Put the tool down, but only if the armed one is this surface's. See `WallTools`. */
  putDown: (surface: BoardSurface) => void
}

/**
 * THE ONE ARMED TOOL ON THIS BOARD.
 *
 * ⚠️ **Three cells became one, and it fixed a real bug rather than tidying three files.**
 * `useFogMode`, `useGridTrace`'s arming and `useWallMode` could all be lit at once, and each
 * mounts a Konva draw surface spanning the whole image — so the last one rendered swallowed
 * every press while the other panels went on showing a lit button. `src/lib/boardTool.ts` holds
 * the vocabulary, the store and the argument; this is the subscription over it.
 *
 * ⚠️ **A view and never a permission**, on ADR 0004's terms and word for word `useFogMode`'s:
 * arming a tool paints a cursor and decides which layer is listening on *this* screen. Every
 * write any of these tools leads to re-verifies the DM code server-side — `fog.draw`,
 * `fog.erase`, `fog.clear`, `walls.add`, `walls.remove`, `walls.clear` and `scenes.updateGrid`,
 * all through `requireDm` (CLAUDE.md invariant 7). A player who reached into this cell would
 * arm a tool over layers that are not mounted for them and, past that, be refused by every
 * mutation.
 *
 * **A module-level cell rather than `useState` or a prop through `GameShell`**, which is
 * `useBoardLayers`' argument inherited three times over: the controls are in the right-hand
 * pane and the gestures they arm are inside the Konva tree in the map pane, and routing a board
 * concern through the component whose job is to arrange two panes buys nothing over one
 * subscribable cell.
 */
export function useBoardTool(code: string): BoardToolControls {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToBoardTool(code, listener),
    [code],
  )

  const tool = useSyncExternalStore(subscribe, useCallback(() => boardTool(code), [code]))

  const setTool = useCallback((next: BoardTool) => armBoardTool(code, next), [code])
  const putDown = useCallback(
    (surface: BoardSurface) => putDownBoardSurface(code, surface),
    [code],
  )

  return {
    tool,
    // Not memoised: a string is compared by value, so there is no identity to hold still and a
    // `useMemo` would cost more than the lookup it saved. `tableView` in `useBoardLayers` makes
    // the same call for the same reason.
    surface: BOARD_TOOL_SURFACE[tool],
    setTool,
    putDown,
  }
}
