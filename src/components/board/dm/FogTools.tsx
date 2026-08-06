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
import { useBoardTool } from '@/hooks/useBoardTool'
import { useFog } from '@/hooks/useFog'
import type { FogTool } from '@/lib/boardTool'
import { FOG_TOOLS, isFogTool } from '@/lib/boardTool'
import { api } from '@convex/_generated/api'
import type { FogBase } from '@convex/lib/fogBase'
import { FOG_BASES, FOG_BASE_LABELS } from '@convex/lib/fogBase'

export type FogToolsProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * ⚠️⚠️ **EVERY SENTENCE IN THIS PANEL IS A FUNCTION OF THE BASE, AND THAT IS THE POINT OF
 * THE FILE RATHER THAN A STYLISTIC CHOICE.**
 *
 * On a lit map the DM blacks areas out; on a dark one they light areas up. The *same three
 * tools* do opposite things, so a label that does not invert is a label that lies — and the
 * worst of them is the destructive confirm, where "lift the fog off this map" over a covered
 * map would describe the exact opposite of covering the whole board.
 *
 * So every one of these is a `Record<FogBase, …>`: a third base fails to compile here rather
 * than arriving as copy somebody has to remember to write. `FOG_TOOLS` and `FOG_BASES` are
 * both iterated below rather than written out, for `TOKEN_LAYERS`' reason — a member cannot
 * arrive with nowhere to be pressed.
 *
 * ⚠️ **Keyed by `FogTool` and not by `BoardTool`.** The armed tool is now one cell shared by
 * every overlay on the board, so keying this by the whole union would demand fog copy for the
 * grid tracer and the wall eraser. `FOG_TOOLS` is the fog panel's own slice of it, hand-spelled
 * so that this `Record` stays a compile-time refusal, and `boardTool.test.ts` sweeps the slice
 * against the surface map in both directions — which is the part the compiler cannot see.
 */
const MODE_LABELS: Record<FogBase, Record<FogTool, { label: string; hint: string }>> = {
  lit: {
    off: {
      label: 'Off',
      hint: 'The board behaves normally: coins are yours to pick up and the fog is scenery.',
    },
    'fog-draw': {
      label: 'Black out',
      hint: 'Drag a rectangle on the map. It snaps to whole squares, and the table goes dark the moment you let go — not while you are dragging.',
    },
    'fog-polygon': {
      label: 'Black out a shape',
      hint: 'Click a corner at a time to trace an area that is not a rectangle. Corners snap to whole squares. Click the white dot you started on, or double-click, to close it; Esc throws it away.',
    },
    'fog-erase': {
      label: 'Rub out',
      hint: 'Click a blacked-out area to lift it. That is the moment the party walks into the room, so anything standing in it appears for them at once.',
    },
  },
  dark: {
    off: {
      label: 'Off',
      hint: 'The board behaves normally: coins are yours to pick up and the cover is scenery.',
    },
    'fog-draw': {
      label: 'Reveal',
      hint: 'Drag a rectangle on the map to open it up. It snaps to whole squares, and the party sees that room — and everything standing in it — the moment you let go.',
    },
    'fog-polygon': {
      label: 'Reveal a shape',
      hint: 'Click a corner at a time to open up an area that is not a rectangle. Corners snap to whole squares. Click the white dot you started on, or double-click, to close it; Esc throws it away.',
    },
    'fog-erase': {
      label: 'Cover back up',
      hint: 'Click a revealed area to close it again. Anything standing in it disappears from the party’s board.',
    },
  },
}

/** What the card says it is for, which is two different things. */
const CARD_DESCRIPTION: Record<FogBase, string> = {
  lit: 'The map is visible and you black out the parts the party has not reached. Everyone can see that an area is dark — that is the point of it — and anything standing in one disappears from their board until you rub it out.',
  dark: 'The map starts covered and you open it up room by room. Everyone can see that the map is dark — that is the point of it — and anything standing in a covered area is absent from their board until you reveal it.',
}

/** The count line. Zero means an untouched map, which is opposite things on the two bases. */
const COUNT_LABELS: Record<FogBase, { none: string; one: string; many: string }> = {
  lit: {
    none: 'None of this map is blacked out.',
    one: 'area blacked out on this map.',
    many: 'areas blacked out on this map.',
  },
  dark: {
    none: 'None of this map is revealed — the party sees nothing but the dark.',
    one: 'area revealed on this map.',
    many: 'areas revealed on this map.',
  },
}

/**
 * ⚠️ **The destructive control, and the worst copy bug available in this milestone.** The
 * mutation behind both of these is the same `fog.clear`, and what it *does* is opposite: on a
 * lit map it lifts the fog and shows the party everything, and on a dark one it takes every
 * revealed area away and covers the whole board. A confirm dialog saying the opposite of what
 * it is about to do is worse than no confirm dialog.
 */
const CLEAR_LABELS: Record<FogBase, { trigger: string; title: string; description: string; confirm: string }> = {
  lit: {
    trigger: 'Clear all fog',
    title: 'Lift the fog off this map?',
    description:
      'Every blacked-out area on this map goes, and this cannot be undone. The party sees the whole map and everything standing on it that you have not put on your own layer — so this is the end of an encounter rather than a tidy-up. Fog on your other maps is untouched.',
    confirm: 'Lift all of it',
  },
  dark: {
    trigger: 'Cover the whole map',
    title: 'Close every revealed area?',
    description:
      'Every revealed area on this map goes and the whole board goes dark again, and this cannot be undone. The party loses sight of everything except their own coins and anything you have granted them. Other maps are untouched. To turn the map back to lit instead, use the base control above — that keeps your areas.',
    confirm: 'Cover all of it',
  },
}

/** What flipping the base is about to do, said before it happens rather than after. */
const FLIP_LABELS: Record<FogBase, { title: string; description: string; confirm: string }> = {
  // Keyed by the base being switched **to**, because that is what the DM is choosing.
  lit: {
    title: 'Turn this map to lit?',
    description:
      'The map becomes visible and the areas you have drawn become blacked-out ones instead of revealed ones — so the map inverts exactly: what the party could see, they cannot, and what was hidden is shown. Nothing is deleted; flipping back returns it exactly as it is now.',
    confirm: 'Turn it lit',
  },
  dark: {
    title: 'Turn this map to dark?',
    description:
      'The map becomes covered and the areas you have drawn become revealed ones instead of blacked-out ones — so the map inverts exactly: what the party could see, they cannot, and what was hidden is shown. Nothing is deleted; flipping back returns it exactly as it is now.',
    confirm: 'Turn it dark',
  },
}

/**
 * FOG OF WAR: the map's base, and the DM's four tools over it.
 *
 * ⚠️ **Two draw tools and exactly two — rectangle and polygon, which is what Roll20 offers
 * and there is no third.** They are separate modes rather than one tool with a shape setting,
 * because the gestures have nothing in common: one is press-drag-release and the other is a
 * sequence of clicks with two ways to finish. A setting would mean a lit button that does not
 * say what pressing the map is about to do.
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
 * **The mode does not leave this component as a prop.** It goes into `useBoardTool`, a cell
 * keyed by game code, because the control is here in the right-hand pane and the gesture
 * is inside the Konva tree in the map pane — `useBoardLayers`' arrangement, for
 * `useBoardLayers`' reason, and the alternative of hoisting it to `GameShell` would put a
 * board concern in the props of the component whose job is to arrange two panes.
 *
 * ⚠️ **That cell is shared with the grid tracer and the wall tool now, and it holds exactly
 * one value.** Arming a brush here puts either of those down by construction rather than by
 * three effects agreeing to — which was a real bug, because all three mount a draw surface
 * spanning the whole image and the last one rendered took every press. The visible
 * consequence in this panel is that arming a fog tool un-lights the grid button on the map.
 *
 * ⚠️ **The base is the opposite: it goes to the server.** It is a fact about the map that
 * every client has to agree on — `scenes.active` carries it, resolved through `fogBaseOf` —
 * because a browser that thought a covered map was lit would paint the party a fully visible
 * floor plan. A mode is this browser holding a tool; a base is what the map *is*.
 *
 * Rendered on the strength of the DM code being present, and that display gate authorises
 * nothing: all four mutations re-verify the code server-side on every call (CLAUDE.md
 * invariant 7), so a browser that forced this panel on with an invented code would get
 * some buttons and a refusal from each.
 */
export function FogTools({ code, dmCode }: FogToolsProps) {
  // The one board everybody is looking at, taken from the open query rather than threaded
  // in — `MapSetupPanel`'s reasoning and its cache entry, so this panel's props stay a
  // code and a secret. Fog is per scene, so there is nothing to fog until there is a map.
  const active = useQuery(api.scenes.active, { code })
  const sceneId = active?._id ?? null
  // Resolved on the server. The browser never spells the absent-means-lit default.
  const base: FogBase = active?.fogBase ?? 'lit'

  const fog = useFog(code, sceneId, dmCode)
  const { tool, setTool, putDown } = useBoardTool(code)
  // The armed tool is one cell shared by every overlay on the board, so it may perfectly well
  // be holding the grid tracer or a wall tool. This panel then reads `off`, which is the honest
  // answer: no button of *its* is lit. `isFogTool` is what keeps the `Record` lookups total.
  const mode: FogTool = isFogTool(tool) ? tool : 'off'

  /**
   * ⚠️ **Put down on the way out, and this is `useFog`'s own rule applied to the second way
   * of losing sight of these buttons.**
   *
   * `src/lib/boardTool.ts` refuses to write the armed tool to `localStorage` because an armed
   * eraser is one click from deleting the ambush the DM spent the afternoon drawing, and a tool
   * still armed after a refresh nobody remembers doing is exactly how that click happens. The
   * cell is module-level, though, and `DmToolsTab`'s sub-tab strip is uncontrolled with a
   * subtree that is not force-mounted — so arming the eraser, glancing at the Feed and coming
   * back reached the same place without needing a refresh: an armed tool, no lit button
   * anywhere on screen, and presses on the map that delete fog.
   *
   * ⚠️ **It is `putDown('fog')` and not `setTool('off')`, and the difference arrived with the
   * merge.** While this panel owned its own cell, putting it down unconditionally could only
   * ever affect fog. Now one cell holds every tool, so an unconditional put-down here would
   * disarm the *grid tracer* on the way out of the Fog tab, from a component that has nothing
   * to do with it. `putDownBoardSurface` asks whether the armed tool is this panel's first.
   */
  useEffect(() => () => putDown('fog'), [putDown])

  const clearFog = useMutation(api.fog.clear)
  const setFogBase = useMutation(api.scenes.setFogBase)
  const action = useLobbyAction()

  const busy = action.pending !== null
  const drawn = fog?.length ?? 0
  const labels = MODE_LABELS[base]
  const clearLabels = CLEAR_LABELS[base]

  const clear = () => {
    if (sceneId === null) return
    return action.run('clear', 'Could not change the fog on this map.', () =>
      clearFog({ code, dmCode, sceneId }),
    )
  }

  const flipTo = (next: FogBase) => {
    if (sceneId === null) return
    return action.run('base', 'Could not change this map’s base.', () =>
      setFogBase({ code, dmCode, sceneId, fogBase: next }),
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Fog of war</CardTitle>
        <CardDescription>{CARD_DESCRIPTION[base]}</CardDescription>
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
              <Label>This map starts</Label>
              <div className="flex flex-wrap gap-2">
                {FOG_BASES.map((choice) =>
                  choice === base ? (
                    <Button
                      key={choice}
                      type="button"
                      size="sm"
                      variant="default"
                      aria-pressed
                      // The base you are already on is not a thing to press. Disabled rather
                      // than absent, so the pair reads as a two-way switch with one side lit.
                      disabled
                    >
                      {FOG_BASE_LABELS[choice].label}
                    </Button>
                  ) : (
                    // ⚠️ **Behind a confirm, because the map inverts exactly.** That is
                    // arguably a feature and is definitely a surprise, and the dialog says in
                    // words that nothing is deleted — which is the question a DM looking at an
                    // afternoon of drawing actually has.
                    <ConfirmDialog
                      key={choice}
                      trigger={
                        <Button type="button" size="sm" variant="outline" disabled={busy}>
                          {FOG_BASE_LABELS[choice].label}
                        </Button>
                      }
                      title={FLIP_LABELS[choice].title}
                      description={FLIP_LABELS[choice].description}
                      confirmLabel={FLIP_LABELS[choice].confirm}
                      busy={action.pending === 'base'}
                      onConfirm={() => flipTo(choice)}
                    />
                  ),
                )}
              </div>
              <p className="text-muted-foreground text-xs">{FOG_BASE_LABELS[base].hint}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tool</Label>
              <div className="flex flex-wrap gap-2">
                {FOG_TOOLS.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    size="sm"
                    variant={mode === choice ? 'default' : 'outline'}
                    aria-pressed={mode === choice}
                    // Never disabled while a call is in flight, unlike the controls
                    // beside it: putting a tool down is the way out of a mistake, and a
                    // refused draw is exactly the moment somebody reaches for it.
                    onClick={() => setTool(choice)}
                  >
                    {labels[choice].label}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">{labels[mode].hint}</p>
            </div>

            {/* ⚠️ Said here rather than left to be discovered: while a tool is armed the
                map answers the tool and not the coins, which is the one time an overlay
                on this board takes the pointer. `FogLayer`'s docblock carries the
                argument for why that is allowed to be true here and nowhere else. */}
            {mode === 'off' ? null : (
              <p className="text-muted-foreground text-xs">
                While this is armed, pressing the map draws or rubs out areas instead of picking
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
                  ? COUNT_LABELS[base].none
                  : `${drawn} ${drawn === 1 ? COUNT_LABELS[base].one : COUNT_LABELS[base].many}`}
              </p>

              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy || drawn === 0}
                  >
                    {clearLabels.trigger}
                  </Button>
                }
                title={clearLabels.title}
                description={clearLabels.description}
                confirmLabel={clearLabels.confirm}
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
