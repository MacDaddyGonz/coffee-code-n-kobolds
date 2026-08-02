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
import type { FogMode } from '@/hooks/useFog'
import { FOG_MODES, useFog, useFogMode } from '@/hooks/useFog'
import { api } from '@convex/_generated/api'

export type FogToolsProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * What each tool is called and what it does, keyed by the union so a fourth mode fails
 * to compile here rather than arriving as a button with no label.
 *
 * The same discipline `TOKEN_LAYER_STYLES` and `LAYER_BADGES` keep, and `FOG_MODES` is
 * iterated below rather than three buttons being written out — so the array is the order
 * they are offered in, and a mode cannot arrive with nowhere to be pressed.
 */
const MODE_LABELS: Record<FogMode, { label: string; hint: string }> = {
  off: {
    label: 'Off',
    hint: 'The board behaves normally: coins are yours to pick up and the fog is scenery.',
  },
  draw: {
    label: 'Fog an area',
    hint: 'Drag a rectangle on the map. It snaps to whole squares, and the table goes dark the moment you let go — not while you are dragging.',
  },
  erase: {
    label: 'Rub out',
    hint: 'Click a fogged area to lift it. That is the moment the party walks into the room, so anything standing in it appears for them at once.',
  },
}

/**
 * FOG OF WAR: the DM's three tools over one map.
 *
 * **Two of the three writes are not in this file**, and the split is deliberate rather
 * than incidental. Drawing and erasing are *gestures on the map* — a rubber band and a
 * click on a rectangle — so they live with the thing being gestured at, in `FogLayer`,
 * and this panel only says which of them is armed. Clearing is a button, and a button
 * belongs on a panel. The consequence worth knowing: `fog.draw`'s refusal when a map is
 * full arrives as a toast from the layer rather than as a message here, and it names the
 * two ways out — cover the map with one bigger rectangle, or clear it and start again.
 * The second of those is the control at the bottom of this card.
 *
 * **The mode does not leave this component as a prop.** It goes into `useFogMode`, a cell
 * keyed by game code, because the control is here in the right-hand pane and the gesture
 * is inside the Konva tree in the map pane — `useBoardLayers`' arrangement, for
 * `useBoardLayers`' reason, and the alternative of hoisting it to `GameShell` would put a
 * board concern in the props of the component whose job is to arrange two panes.
 *
 * Rendered on the strength of the DM code being present, and that display gate authorises
 * nothing: all three mutations re-verify the code server-side on every call (CLAUDE.md
 * invariant 7), so a browser that forced this panel on with an invented code would get
 * three buttons and a refusal from each.
 */
export function FogTools({ code, dmCode }: FogToolsProps) {
  // The one board everybody is looking at, taken from the open query rather than threaded
  // in — `MapSetupPanel`'s reasoning and its cache entry, so this panel's props stay a
  // code and a secret. Fog is per scene, so there is nothing to fog until there is a map.
  const active = useQuery(api.scenes.active, { code })
  const sceneId = active?._id ?? null

  const fog = useFog(code, sceneId, dmCode)
  const { mode, setMode } = useFogMode(code)

  /**
   * ⚠️ **Put down on the way out, and this is `useFog`'s own rule applied to the second way
   * of losing sight of these buttons.**
   *
   * That hook refuses to write the mode to `localStorage` because an armed eraser is one
   * click from deleting the ambush the DM spent the afternoon drawing, and a tool still armed
   * after a refresh nobody remembers doing is exactly how that click happens. The cell is
   * module-level, though, and `DmToolsTab`'s sub-tab strip is uncontrolled with a subtree that
   * is not force-mounted — so arming the eraser, glancing at the Feed and coming back reached
   * the same place without needing a refresh: an armed tool, no lit button anywhere on screen,
   * and presses on the map that delete fog.
   *
   * Three lines here rather than relocating the controls somewhere permanent, which is the
   * other fix and a much larger one. Off is the only safe thing to arrive at, and now the only
   * thing to come back to.
   */
  useEffect(() => () => setMode('off'), [setMode])

  const clearFog = useMutation(api.fog.clear)
  const action = useLobbyAction()

  const busy = action.pending !== null
  const drawn = fog?.length ?? 0

  const clear = () => {
    if (sceneId === null) return
    return action.run('clear', 'Could not lift the fog.', () =>
      clearFog({ code, dmCode, sceneId }),
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Fog of war</CardTitle>
        <CardDescription>
          Black out the parts of the map the party has not reached. Everyone can see that an
          area is dark — that is the point of it — and anything standing in one disappears
          from their board until you rub it out.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {active === undefined ? (
          // A skeleton the shape of the tool row, as `MapSetupPanel` does: the answer is
          // coming, and an empty card in the meantime reads as a panel with nothing in it.
          <Skeleton className="h-7 w-64" />
        ) : sceneId === null ? (
          <p className="text-muted-foreground text-sm">
            Nothing is on the table. Fog belongs to a map, so pick one under{' '}
            <span className="font-medium">Map setup</span> first.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>Tool</Label>
              <div className="flex flex-wrap gap-2">
                {FOG_MODES.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    size="sm"
                    variant={mode === choice ? 'default' : 'outline'}
                    aria-pressed={mode === choice}
                    // Never disabled while a call is in flight, unlike the controls
                    // beside it: putting a tool down is the way out of a mistake, and a
                    // refused draw is exactly the moment somebody reaches for it.
                    onClick={() => setMode(choice)}
                  >
                    {MODE_LABELS[choice].label}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">{MODE_LABELS[mode].hint}</p>
            </div>

            {/* ⚠️ Said here rather than left to be discovered: while a tool is armed the
                map answers the tool and not the coins, which is the one time an overlay
                on this board takes the pointer. `FogLayer`'s docblock carries the
                argument for why that is allowed to be true here and nowhere else. */}
            {mode === 'off' ? null : (
              <p className="text-muted-foreground text-xs">
                While this is armed, pressing the map draws or rubs out fog instead of picking
                up a coin. Press <span className="font-medium">Off</span> to get the board back.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {/* A count and never the cap. The limit lives in `convex/lib/games.ts`,
                    which is a server module carrying `requireDm` — importing it for one
                    number would put that in the bundle — and `fog.draw`'s refusal already
                    names it in a sentence the DM reads at the moment it applies. */}
                {drawn === 0
                  ? 'None of this map is fogged.'
                  : `${drawn} fogged ${drawn === 1 ? 'area' : 'areas'} on this map.`}
              </p>

              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy || drawn === 0}
                  >
                    Clear all fog
                  </Button>
                }
                title="Lift the fog off this map?"
                description={
                  'Every fogged area on this map goes, and this cannot be undone. The party sees the whole map and everything standing on it that you have not put on your own layer — so this is the end of an encounter rather than a tidy-up. Fog on your other maps is untouched.'
                }
                confirmLabel="Lift all of it"
                busy={action.pending === 'clear'}
                onConfirm={clear}
              />
            </div>

            <p className="text-muted-foreground text-xs">
              ⚠️ Your own fog is a veil rather than a wall: you can see through it, so
              nothing on this screen looks hidden. Coins the party has lost sight of are
              marked — a small crossed disc on the board, and a badge on the row in{' '}
              <span className="font-medium">Tokens</span>. A hero or anything you have granted
              somebody control of is <span className="font-medium">never</span> hidden by fog,
              which is why one standing in the dark carries no mark.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
