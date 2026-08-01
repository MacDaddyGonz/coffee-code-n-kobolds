import { useQuery } from 'convex/react'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import { GridCalibrator } from './GridCalibrator'
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
          Only you can see this panel, and only you can see the names of the maps in it.
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
