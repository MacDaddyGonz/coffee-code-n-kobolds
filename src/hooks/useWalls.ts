import { useMemo } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import type { PublicWall } from '@convex/lib/walls'

// WALLS, in the browser: the barriers on this map.
//
// ⚠️ **The armed tool used to live here too, for exactly one commit.** `useWallMode` was the
// third module-level cell of its kind on one board and made the collision the other two
// already had impossible to ignore: three draw surfaces spanning the whole image, and the last
// one rendered swallowing every press. There is one cell now, `src/lib/boardTool.ts`, whose
// header carries the argument and inherits every clause this store's docblock had.
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

