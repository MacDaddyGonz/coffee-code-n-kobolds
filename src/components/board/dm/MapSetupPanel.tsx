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
import { LayerChoice } from './LayerChoice'
import { SceneSelect } from './SceneSelect'
import { SceneUploadDialog } from './SceneUploadDialog'
import { TokenAddDialog } from './TokenAddDialog'

export type MapSetupPanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * Everything the DM does before a game can start: get a map in, calibrate its
 * grid, and put a few tokens on it.
 *
 * Rendered on the strength of `dm.dmCode` being present, and that display gate
 * authorises nothing — `scenes.list` throws for a caller without the code and
 * every mutation here re-verifies it, which is CLAUDE.md invariant 7 working as
 * intended. Nothing about this panel would be safe if the gate were `players.isDm`.
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    Tokens belong to the game, not to this map, so one villain can stand on several.
                  </p>
                  <TokenAddDialog code={code} dmCode={dmCode} scene={active} />
                </div>
                <Separator />
                <LayerTools code={code} />
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
 * The DM's two board tools: which layer they are working on, and whether they are looking at
 * the board the way the table is.
 *
 * **Here rather than on the board itself**, because both are set once and then left — a DM
 * lays a room out on Background, then goes back to putting creatures on the player layer —
 * and the map has room for the coins rather than for a control strip. `TokenAddDialog` reads
 * the same active layer through `useBoardLayers`, so the picker below and the one inside that
 * dialog are one setting shown twice rather than two that have to be kept in step.
 *
 * ⚠️ **Neither goes to Convex, and that is ADR 0004's camera argument rather than an
 * omission** — the DM previewing the table's view while the table looks at the map is the
 * point of the control, not drift to be synchronised away. See `useBoardLayers` for both
 * halves and for why the player view is computed from `maySeeLayer` instead of by naming a
 * layer here.
 *
 * A local component rather than a file of its own: it is two button groups over one hook,
 * and the panel it belongs to is the only thing that will ever mount it.
 */
function LayerTools({ code }: { code: string }) {
  const { view, setView, active, setActive } = useBoardLayers(code)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>New tokens land on</Label>
        {/* The add dialog's own picker, so the layers a DM may create on are described in the
            same three sentences wherever the question is asked. Never disabled: nothing here
            writes to the server, so there is never a call in flight to wait out. */}
        <LayerChoice layer={active} onChange={setActive} disabled={false} />
      </div>

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
          Yours alone, and nothing moves: hiding your own layer changes what this browser
          paints and not one row of what anybody was sent. Nobody else's board flickers, and
          the coins come straight back.
        </p>
      </div>
    </div>
  )
}
