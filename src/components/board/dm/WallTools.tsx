import { useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { WallMode } from '@/hooks/useWalls'
import { WALL_MODES, useWallMode, useWalls } from '@/hooks/useWalls'
import { api } from '@convex/_generated/api'

export type WallToolsProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * What each tool is called and what pressing the map does while it is armed, keyed by the
 * union so a fourth mode fails to compile here rather than arriving as a button with no
 * label — `MODE_LABELS` in `FogTools`, `TOOL_LABELS` in `GridCalibrator`, and CLAUDE.md
 * invariant 9. `WALL_MODES` is iterated below rather than three buttons being written out,
 * so the array is the order they are offered in.
 *
 * **Not a `Record<FogBase, …>` of these**, which is the one structural difference from the
 * fog panel and is worth knowing rather than inferring: every sentence there inverts because
 * the same three tools do opposite things on a lit map and a dark one. A wall does one thing.
 */
const MODE_LABELS: Record<WallMode, { label: string; hint: string }> = {
  off: {
    label: 'Off',
    hint: 'The board behaves normally: coins are yours to pick up and the walls are scenery.',
  },
  draw: {
    label: 'Draw a wall',
    hint: 'Click a corner at a time to trace a barrier. Corners snap to the lines between squares. Double-click or press Enter to finish it; Esc throws it away. To seal a room, click back onto the corner you started at.',
  },
  erase: {
    label: 'Rub out',
    hint: 'Click a wall to take it away — the door the party has just opened, or the wall you traced one square out.',
  },
}

/**
 * WALLS: the lines a token may not be dragged through, and nothing else.
 *
 * ⚠️⚠️ **THE SECOND SENTENCE OF THAT TITLE IS THE FEATURE AND NOT A LIMITATION.** Roll20's
 * barriers stop movement *and* block sight; what this panel controls is the first half
 * alone. Line of sight, per-player fog and reveal-as-you-walk each turn a stored line into a
 * statement about what one particular player may know, which is the day the walls table
 * needs a choke point and a predicate of its own — `convex/lib/walls.ts` carries the
 * argument. Until then a wall withholds nothing from anybody, and the copy below is careful
 * never to suggest otherwise: a DM who plans an ambush behind a wall has used the wrong
 * tool, and the right one is the GM layer.
 *
 * **The write behind the two tools is not in this file**, which is `FogTools`' split for
 * `FogTools`' reason: drawing and rubbing out are *gestures on the map*, so they live with
 * the thing being gestured at, in `WallLayer`, and this panel only says which of them is
 * armed. Clearing is a button, and a button belongs on a panel.
 *
 * **The mode does not leave this component as a prop.** It goes into `useWallMode`, a cell
 * keyed by game code, because the control is here in the right-hand pane and the gesture is
 * inside the Konva tree in the map pane — `useBoardLayers`' arrangement for the third time.
 *
 * Rendered on the strength of the DM code being present, and that display gate authorises
 * nothing: all three mutations re-verify the code server-side on every call (CLAUDE.md
 * invariant 7).
 */
export function WallTools({ code, dmCode }: WallToolsProps) {
  // The one board everybody is looking at, taken from the open query rather than threaded in
  // — `FogTools`' reasoning and its cache entry, so this panel's props stay a code and a
  // secret. Walls are per scene, so there is nothing to wall until there is a map.
  const active = useQuery(api.scenes.active, { code })
  const sceneId = active?._id ?? null

  const walls = useWalls(code, sceneId, dmCode)
  const { mode, setMode } = useWallMode(code)

  /**
   * ⚠️ **Put down on the way out**, which is `FogTools`' three lines and the same bug they
   * were written for: `DmToolsTab`'s sub-tab strip is uncontrolled and its subtree is not
   * force-mounted, so arming the eraser, glancing at the Feed and coming back would leave an
   * armed tool with no lit button anywhere on screen and presses on the map deleting walls.
   */
  useEffect(() => () => setMode('off'), [setMode])

  const clearWalls = useMutation(api.walls.clear)
  const action = useLobbyAction()

  const busy = action.pending !== null
  const drawn = walls?.length ?? 0

  const clear = () => {
    if (sceneId === null) return
    return action.run('clear', 'Could not clear the walls on this map.', () =>
      clearWalls({ code, dmCode, sceneId }),
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Walls</CardTitle>
        <CardDescription>
          Trace the barriers on this map and a coin cannot be dragged through one — it slides
          up to the wall and stops. Walls do not block you, so you can still place creatures
          inside a sealed room and pull the party through a door you have just narrated open.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {active === undefined ? (
          // A skeleton the shape of the tool row, as `FogTools` and `MapSetupPanel` do: the
          // answer is coming, and an empty card meanwhile reads as a panel with nothing in it.
          <Skeleton className="h-7 w-64" />
        ) : sceneId === null ? (
          <p className="text-muted-foreground text-sm">
            Nothing is on the table. Walls belong to a map, so pick one under{' '}
            <span className="font-medium">Map setup</span> first.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>Tool</Label>
              <div className="flex flex-wrap gap-2">
                {WALL_MODES.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    size="sm"
                    variant={mode === choice ? 'default' : 'outline'}
                    aria-pressed={mode === choice}
                    // Never disabled while a call is in flight, unlike the control below it:
                    // putting a tool down is the way out of a mistake, and a refused wall is
                    // exactly the moment somebody reaches for it. `FogTools` makes the same
                    // call for the same reason.
                    onClick={() => setMode(choice)}
                  >
                    {MODE_LABELS[choice].label}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">{MODE_LABELS[mode].hint}</p>
            </div>

            {/* ⚠️ Said here rather than left to be discovered — `FogTools`' sentence, and it
                matters more with three tools on one board than it did with one. While
                anything is armed the map answers the tool and not the coins. */}
            {mode === 'off' ? null : (
              <p className="text-muted-foreground text-xs">
                While this is armed, pressing the map draws or rubs out walls instead of
                picking up a coin. Press <span className="font-medium">Off</span> to get the
                board back.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {/* A count and never the cap. The limit lives in `convex/lib/games.ts`,
                    which is a server module carrying `requireDm` — importing it for one
                    number would put that in the bundle — and `walls.add`'s refusal already
                    names it in a sentence the DM reads at the moment it applies. */}
                {drawn === 0
                  ? 'No walls on this map.'
                  : `${drawn} wall${drawn === 1 ? '' : 's'} on this map.`}
              </p>

              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy || drawn === 0}
                  >
                    Clear all walls
                  </Button>
                }
                title="Take every wall off this map?"
                description="Every wall on this map goes, and this cannot be undone. Coins can then be dragged anywhere on it. Walls on your other maps are untouched."
                confirmLabel="Clear all of them"
                busy={action.pending === 'clear'}
                onConfirm={clear}
              />
            </div>

            {/* ⚠️ **The two things about walls that read as bugs unless they are written
                down**, which is why this paragraph is copy rather than a comment. */}
            <p className="text-muted-foreground text-xs">
              ⚠️ Dragging a coin into a wall stops it against the wall. The{' '}
              <span className="font-medium">arrow keys</span> do not: a keypress is a whole
              square at once, so there is nothing to slide, and a step into a wall is refused
              with a message instead.
            </p>

            <p className="text-muted-foreground text-xs">
              ⚠️ Walls are sent to every browser, because that is what lets a coin stop
              against one on the player’s own screen — they are simply not drawn for anybody
              but you. A wall traced over one the map already shows gives nothing away. A
              wall where the map shows <span className="font-medium">no</span> wall — an
              invisible ward, a magically sealed door — is something a curious player could
              dig out of their browser. Walls stop movement and hide{' '}
              <span className="font-medium">nothing</span>: a creature the party must not know
              about belongs on the <span className="font-medium">GM layer</span>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
