import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import type { PublicWall } from '@convex/lib/walls'

// WALLS, in the browser: the barriers on this map, and the tool the DM has armed.
//
// ⚠️ **Nothing here decides what anybody may see, and unlike `useFog` next door there is
// not even a cue that could be mistaken for a filter.** `walls.list` is ungated by design —
// the browser is where the feature is *felt*, because a client that has not been sent the
// geometry cannot slide a coin up to a barrier and stop it. So every wall in the game is in
// this payload on purpose, and `convex/lib/walls.ts` argues at length why that means the
// table needs no choke point at all.
//
// The one thing this file feeds that has a consequence is `useTokenMove`, and that is a
// *feel* rather than a permission: the server re-checks the settling write in
// `board.moveToken` with the same `pathCrossesAnyWall`, so a browser that skipped every
// clause below would get a refusal instead of a silent crossing.

/**
 * The arguments `walls.list` is subscribed with. `fogArgs`' rule and the fifth member of
 * that set — see `feedArgs` for the long version.
 *
 * ⚠️ **Mandatory rather than stylistic, and this entry has one more reader than fog's.**
 * `WallLayer` draws the barriers, `WallTools` counts them, and `Board` turns them into the
 * geometry the drag is tested against — three readers on one screen. `useQuery` keys its
 * cache on the serialised arguments, so a second spelling anywhere would be a second socket
 * subscription and a second server execution of a query the board already holds.
 *
 * `dmCode` is **omitted rather than passed as `undefined`** when there is none, because
 * `undefined` is not a Convex value, and the key order is fixed here because
 * `JSON.stringify` is order-sensitive.
 */
export function wallArgs(code: string, sceneId: Id<'scenes'>, dmCode: string | null) {
  return dmCode === null ? { code, sceneId } : { code, sceneId, dmCode }
}

/**
 * Every wall on one scene, or `undefined` while the first answer is in flight.
 *
 * **Skipped until there is a scene**, exactly as `useFog` and `useBoard` skip theirs:
 * `walls.list` insists the scene belongs to the game, so with no scene there is no id to
 * pass and nothing to ask.
 *
 * `undefined` travels rather than being flattened, because the two mean different things to
 * a panel that wants to print a count — see `WallTools`.
 */
export function useWalls(
  code: string,
  sceneId: Id<'scenes'> | null,
  dmCode: string | null,
): PublicWall[] | undefined {
  return useQuery(api.walls.list, sceneId === null ? 'skip' : wallArgs(code, sceneId, dmCode))
}

/** Held still so a map with no walls hands the drag the same empty array every render. */
const NO_PATHS: readonly Point[][] = []

/**
 * The same walls as bare geometry, for `useTokenMove`.
 *
 * ⚠️ **A second hook over the same subscription rather than a second subscription**, which
 * is the whole reason `wallArgs` exists: `WallLayer` and `WallTools` are already holding this
 * query, so what this costs is one `map` per change of the wall list and nothing on the wire.
 *
 * Memoised on the payload's identity, which is what makes it cheap in the place it matters.
 * The drag reads this through a ref that every render refreshes, and this component's parent
 * re-renders on every frame of a pan and ten times a second during anybody's drag — so a
 * fresh array each time would be an allocation per frame for a value that changes only when
 * the DM draws a wall.
 */
export function useWallPaths(
  code: string,
  sceneId: Id<'scenes'> | null,
  dmCode: string | null,
): readonly Point[][] {
  const walls = useWalls(code, sceneId, dmCode)
  return useMemo(
    () => (walls === undefined ? NO_PATHS : walls.map((wall) => wall.points)),
    [walls],
  )
}

/**
 * Which wall tool the DM has armed. `off` is the board behaving normally.
 *
 * Two rather than fog's four, because a wall has one shape and there is nothing to erase it
 * with but a click on the line itself.
 */
export type WallMode = 'off' | 'draw' | 'erase'

/**
 * The modes, in the order they are offered. Iterated rather than three buttons written out,
 * for `TOKEN_LAYERS`' and `FOG_MODES`' reason: a mode cannot arrive with nowhere to be
 * pressed.
 */
export const WALL_MODES: readonly WallMode[] = ['off', 'draw', 'erase']

type Store = { mode: WallMode; listeners: Set<() => void> }

/**
 * ⚠️ **A module-level store rather than `useState`, and it is `useFogMode`'s argument for the
 * third time with the same two halves of the screen in it.** The controls are in `WallTools`,
 * deep inside the right-hand pane; the gesture they arm is in `WallLayer`, inside the Konva
 * tree in the map pane. Two `useState`s cannot be that, and hoisting the mode to `GameShell`
 * would thread a board concern through the component whose job is to arrange two panes.
 *
 * Keyed by game code so a browser that has been in two games does not carry the first one's
 * armed tool into the second, and **nothing is written to `localStorage`** — `useFogMode`'s
 * departure from `useBoardLayers`, for a reason that applies here too: a tool still armed
 * after a refresh nobody remembers doing is how a press meant for a coin deletes a barrier.
 *
 * ⚠️⚠️ **AND THAT IS NOW THE THIRD SUCH CELL ON ONE BOARD, WHICH IS A BUG RATHER THAN A
 * PATTERN.** `useFogMode`, `useGridTrace` and this one can all be armed at once, and each
 * mounts a draw surface spanning the whole image — so whichever is rendered last swallows
 * every press and the other two silently stop working. `useBoardLayers`' docblock already
 * makes the argument this is a case of: *two `useState`s seeded from the same key are two
 * pieces of state that agree only until somebody presses something.* The fix is one cell
 * over one union, and it is the commit after this one; this store exists so that the wall
 * tool lands whole and the collision is fixed once for all three rather than twice.
 */
const stores = new Map<string, Store>()

function storeFor(code: string): Store {
  const existing = stores.get(code)
  if (existing) return existing

  const store: Store = { mode: 'off', listeners: new Set() }
  stores.set(code, store)
  return store
}

/**
 * The wall tool this browser has armed, and the way to change it.
 *
 * ⚠️ **A view and never a permission**, on ADR 0004's terms and word for word `useFogMode`'s:
 * arming the eraser paints a cursor and makes the lines clickable on *this* screen, and the
 * refusal behind the click is `requireDm` inside every one of `walls.add`, `walls.remove` and
 * `walls.clear` (CLAUDE.md invariant 7).
 */
export function useWallMode(code: string): {
  mode: WallMode
  setMode: (mode: WallMode) => void
} {
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

  const mode = useSyncExternalStore(subscribe, useCallback(() => storeFor(code).mode, [code]))

  const setMode = useCallback(
    (next: WallMode) => {
      const store = storeFor(code)
      // Not tidiness: `useSyncExternalStore` re-renders every subscriber on any
      // notification, so pressing the tool you are already holding would repaint the board.
      if (store.mode === next) return
      store.mode = next
      for (const listener of store.listeners) listener()
    },
    [code],
  )

  return { mode, setMode }
}
