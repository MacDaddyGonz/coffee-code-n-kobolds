import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'

export type TokenPlacementControlProps = {
  code: string
  dmCode: string
  token: PublicToken
}

/**
 * Which maps this coin is standing on, and the two presses that change that.
 *
 * ⚠️ **`board.placements` is subscribed here rather than in the tab, and that is the
 * whole cost model rather than a filing decision.** It reads by token, so it joins one
 * coin's invalidation set instead of every drag on the board — and this panel is mounted
 * only while the Tokens tab has a coin selected and is keyed on its id, so the
 * subscription exists exactly while the question is on screen. The game-wide version,
 * one map of coin → boards so that every *row* in the list could carry a badge, puts
 * every placement on every scene into the read set of a panel that is open all session:
 * the read CLAUDE.md invariant 2's read-side rule exists to refuse. `TokensTab`'s own ⚠️
 * says the list cannot answer this, and it is narrowed rather than deleted — the list
 * still cannot, and the selected coin now can.
 *
 * ⚠️ **`scenes.list` is needed regardless, which is why `board.placements` hands back
 * bare ids.** The panel has to offer the maps the coin is *not* on as well, so it is
 * holding the full list either way — and scene names are DM-only (a list of them is a
 * spoiler, which is why that query takes the code), so a projection carrying them out of
 * `board.placements` would be a second door onto the same secret for no saving.
 *
 * `scenes.active` is the same `{ code }` entry `useBoard` and `MapSetupPanel` already
 * hold, so the badge saying which map is on the table costs one more reader of an
 * existing socket and no server execution.
 */
export function TokenPlacementControl({
  code,
  dmCode,
  token,
}: TokenPlacementControlProps): ReactElement {
  const placements = useQuery(api.board.placements, { code, dmCode, tokenId: token._id })
  const scenes = useQuery(api.scenes.list, { code, dmCode })
  const active = useQuery(api.scenes.active, { code })

  const placeOnScene = useMutation(api.board.placeOnScene)
  const removeFromScene = useMutation(api.board.removeFromScene)
  const action = useLobbyAction()

  // Held still while the answer has not moved, so the rows below are not rebuilt every
  // time an unrelated query re-runs.
  const on = useMemo(() => new Set(placements ?? []), [placements])

  const put = (sceneId: Id<'scenes'>, name: string) => {
    void action.run(`place:${sceneId}`, `Could not put ${token.name} on ${name}.`, () =>
      placeOnScene({ code, dmCode, sceneId, tokenId: token._id }),
    )
  }

  const take = (sceneId: Id<'scenes'>, name: string) => {
    void action.run(`remove:${sceneId}`, `Could not take ${token.name} off ${name}.`, () =>
      removeFromScene({ code, dmCode, sceneId, tokenId: token._id }),
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        A coin belongs to the game rather than to a map, so one villain can stand on several.
        Putting it on a map drops it on an empty square in the middle — drag it where it
        belongs. Taking it off leaves the coin, its sheet and everything on it exactly as they
        are; it is only off <em>that</em> map.
      </p>

      {scenes === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : scenes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No maps yet. A coin has to land on one, so add a map under DM tools → Map setup
          first.
        </p>
      ) : (
        <>
          <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
            {scenes.map((scene) => {
              const here = on.has(scene._id)
              const busy = action.pending !== null || placements === undefined
              return (
                <li key={scene._id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{scene.name}</span>
                  {scene._id === active?._id ? (
                    <Badge variant="secondary">On the table</Badge>
                  ) : null}
                  {here ? <Badge variant="outline">Standing here</Badge> : null}
                  <Button
                    type="button"
                    size="sm"
                    variant={here ? 'outline' : 'default'}
                    disabled={busy}
                    onClick={() => (here ? take(scene._id, scene.name) : put(scene._id, scene.name))}
                  >
                    {here ? 'Take it off' : 'Put it here'}
                  </Button>
                </li>
              )
            })}
          </ul>

          <FieldError message={action.error} />

          {/*
            ⚠️ Never printed while the answer is in flight. *On no map at all* is a real
            and useful thing to be told, and printing it before `board.placements` has
            arrived would say it about every coin for a frame — the same discipline the
            roster's `MISSING_SHEET` and the rows' loading caption already keep.
          */}
          <p className="text-muted-foreground text-xs">
            {placements === undefined
              ? '…'
              : on.size === 0
                ? 'On no map at all. It exists in the game and is nowhere to be found on a board.'
                : `On ${on.size} of ${scenes.length}.`}
          </p>
        </>
      )}
    </div>
  )
}
