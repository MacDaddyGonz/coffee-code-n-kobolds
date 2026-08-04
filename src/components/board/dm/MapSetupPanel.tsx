import { useQuery } from 'convex/react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useBoardLayers } from '@/hooks/useBoardLayers'
import { api } from '@convex/_generated/api'
import { GridCalibrator } from './GridCalibrator'
import { SceneSelect } from './SceneSelect'
import { SceneUploadDialog } from './SceneUploadDialog'

export type MapSetupPanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * Everything the DM does before a game can start: get a map in, calibrate its
 * grid, and put a few tokens on it.
 *
 * Two subscriptions, both cheap and both low-churn: `scenes.list` for the DM's own
 * scene names, and `scenes.active` for the one board everybody is looking at.
 * Taking the active scene from the open query rather than threading
 * `game.activeSceneId` in is what keeps this component's props to a code and a
 * secret, so the Map tab mounts it with nothing else to hand.
 */
export function MapSetupPanel({ code, dmCode }: MapSetupPanelProps) {
  const scenes = useQuery(api.scenes.list, { code, dmCode })
  const active = useQuery(api.scenes.active, { code })

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Map setup</CardTitle>
        <CardDescription>
          Only you can see this panel, and only you can see the names and the pictures of the
          maps in it.
        </CardDescription>
        <CardAction>
          <SceneUploadDialog code={code} dmCode={dmCode} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {scenes === undefined || active === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : scenes.length === 0 ? (
          <p className="text-muted-foreground">
            No map yet. Add one and it goes straight onto the table — then check the grid lines up
            with it before you start.
          </p>
        ) : (
          <>
            <SceneSelect
              code={code}
              dmCode={dmCode}
              scenes={scenes}
              activeSceneId={active?._id ?? null}
            />

            {active ? (
              <>
                <Separator />
                {/* Keyed on the scene, so switching maps remounts the calibrator with
                    that map's stored numbers instead of carrying the last one's. */}
                <GridCalibrator key={active._id} code={code} dmCode={dmCode} scene={active} />
                <Separator />
                <BoardView code={code} />
                <p className="text-muted-foreground text-xs">
                  Coins are added and edited under <span className="font-medium">Tokens</span> —
                  they belong to the game rather than to this map, so one villain can stand on
                  several and none of them is this panel's business.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing is on the table. Pick a map above to put one there.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Whether the DM is previewing the table's view or looking at all of it.
 *
 * **Here rather than on the board itself**, because it is set once and then left, and the
 * map has room for the coins rather than for a control strip.
 *
 * ⚠️ **This used to be `LayerTools` and had a second half — *New tokens land on* — which
 * has moved to the Tokens tab.** The split is along the line the two were always on: where
 * a *new coin* goes is about coins, and what *this browser paints* is about looking at a
 * map. Filing them together put the button that creates a creature three clicks deep in the
 * panel for getting a map in. Splitting cost nothing because `useBoardLayers` is a
 * module-level subscribable store rather than `useState` — its docblock says it was written
 * that way for exactly this, so the picker over there and this control here read one cell.
 *
 * ⚠️ **It does not go to Convex, and that is ADR 0004's camera argument rather than an
 * omission** — the DM previewing the table's view while the table looks at the map is the
 * point of the control, not drift to be synchronised away. See `useBoardLayers` for why the
 * player view is computed from `maySeeLayer` instead of by naming a layer here.
 *
 * A local component rather than a file of its own: it is one button group over one hook, and
 * the panel it belongs to is the only thing that will ever mount it.
 */
function BoardView({ code }: { code: string }) {
  const { view, setView } = useBoardLayers(code)

  return (
    <div className="flex flex-col gap-2">
      <Label>Your view of the board</Label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === 'all' ? 'default' : 'outline'}
          aria-pressed={view === 'all'}
          onClick={() => setView('all')}
        >
          Everything
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'player' ? 'default' : 'outline'}
          aria-pressed={view === 'player'}
          onClick={() => setView('player')}
        >
          What the table sees
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Yours alone, and nothing moves: hiding your own layer changes what this browser paints
        and not one row of what anybody was sent. Nobody else's board flickers, and the coins
        come straight back.
      </p>
    </div>
  )
}
