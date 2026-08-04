import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { ColourField } from '@/components/ui/colour-field'
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
import type { PublicScene } from '@convex/lib/scenes'
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
                    that map's stored numbers instead of carrying the last one's.

                    ⚠️ **Prefixed, and the bare id was a bug found in a browser.** These two
                    are siblings in one children array, so `key={active._id}` on both is two
                    children with the same key — React warns, and its documented behaviour
                    for the case is that a child may be *duplicated or omitted*. Nothing
                    looked wrong on screen, which is exactly why it needed the console rather
                    than the eye. A key only has to be unique among siblings, so a word each
                    is the whole fix. */}
                <GridCalibrator
                  key={`grid-${active._id}`}
                  code={code}
                  dmCode={dmCode}
                  scene={active}
                />
                <Separator />
                {/* Keyed like the calibrator, and for the same reason: the picker holds the
                    colour it is showing, so switching maps must start it on that map's
                    stored value rather than on the last one's. */}
                <SceneBackground
                  key={`background-${active._id}`}
                  code={code}
                  dmCode={dmCode}
                  scene={active}
                />
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
 * What is painted around this map, where the image does not reach.
 *
 * **A map tool and not a secret**, which is the whole reason this needed no design work
 * beyond the picker: `lib/scenes.ts` says in as many words that *nothing in a scene is a
 * secret — the background image is what every player is looking at* — so the colour goes to
 * everybody through the projection every client already reads, and there is no filtering to
 * do and no predicate to be the home of.
 *
 * ⚠️ **Committed on release rather than on every tick of the swatch, through `onCommit`
 * — and the first version of this said so while doing the opposite.** That is the
 * difference between this and the grid calibrator next door: that one throttles a *drag*, a
 * run of intermediate values the DM is steering through where the point is watching the
 * lines move, and `useGridWrite` exists for exactly that. A colour picker's intermediate
 * values are whatever the OS colour wheel passed under the cursor, and writing them pushes a
 * scene document to every client at the table for a decision nobody has made yet.
 *
 * The trap is that **React's `onChange` on an input is the `input` event**, which for a
 * colour picker fires continuously during the drag — so `onChange` alone was a write per
 * pointer move, throttled only by `useLobbyAction`'s in-flight ref into one write per round
 * trip for the whole duration. `ColourField` grew a real DOM `change` listener for this;
 * `onChange` now only moves the local swatch, which is what keeps it showing the DM's choice
 * while the round trip completes.
 */
function SceneBackground({
  code,
  dmCode,
  scene,
}: {
  code: string
  dmCode: string
  scene: PublicScene
}) {
  const setBackground = useMutation(api.scenes.setBackground)
  const action = useLobbyAction()

  // Seeded from the stored colour and keyed on the scene by the caller, so switching maps
  // starts on that map's value. It leads the server by one round trip deliberately: a
  // swatch that snapped back to the old colour until the subscription caught up would read
  // as the press not having worked.
  const [colour, setColour] = useState(scene.backgroundColour)

  const commit = (next: string) => {
    setColour(next)
    void action.run('background', 'Could not change the background colour.', () =>
      setBackground({ code, dmCode, sceneId: scene._id, backgroundColour: next }),
    )
  }

  return (
    <ColourField
      label="Background colour"
      value={colour}
      // The live swatch, and nothing else. See the ⚠️ above: this is the `input` event.
      onChange={setColour}
      onCommit={commit}
      disabled={action.pending !== null}
      hint="Painted around the map, where the image does not reach. Everybody at the table sees it."
    />
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
