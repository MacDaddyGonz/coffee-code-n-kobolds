import { useState } from 'react'

import { DmSheetsPanel } from '@/components/board/dm/DmSheetsPanel'
import { MapSetupPanel } from '@/components/board/dm/MapSetupPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type MapSetupOverlayProps = {
  code: string
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string
}

/**
 * The DM's tools, over the board, behind one button.
 *
 * It exists because the setup the panels do is not all setup. A grid that lines up
 * on the DM's monitor at the size they calibrated it and drifts by half a square by
 * the far wall is something you notice once tokens are standing on it — and with
 * the panel only in the lobby, fixing it meant sending the whole table off the board
 * to do it. Adding a map mid-session and switching to it is the same story, and so
 * is a monster whose hit points need adjusting while the party is standing on it.
 *
 * **Two tabs, and that is the whole of the ambition.** requirements.md asks for a
 * tabbed DM panel with five sections — every player sheet, every NPC sheet, the
 * token list, the modal image library and the music — and roadmap.md puts that panel
 * squarely in Milestone 5, alongside the layer work and the scene-switching UX it
 * has to be designed around. Building a five-tab shell now would mean building it
 * twice and throwing the first one away. So this is deliberately the *seam* rather
 * than an attempt at the panel: the place Milestone 5 adds tabs to, holding only
 * what Milestone 3 actually needs to be playable.
 *
 * Collapsed by default, and the wrapper is `pointer-events-none` so that the empty
 * space it reserves is not a hole in the map: only the button and the open panel
 * take the pointer. That matters more here than anywhere else in the app, because
 * anything that swallows a click over the canvas is a token the DM cannot pick up
 * and no visible reason why. The tab strip is `w-full` for the same reason and it is
 * not cosmetic — a `w-fit` list would leave the rest of its row inside the
 * pointer-taking box and dead to the canvas underneath, which is precisely that bug
 * in its least visible form.
 */
export function MapSetupOverlay({ code, dmCode }: MapSetupOverlayProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-none absolute top-3 right-3 bottom-3 flex w-full max-w-md flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant={open ? 'default' : 'outline'}
        aria-expanded={open}
        className="pointer-events-auto bg-background/90 shadow-sm backdrop-blur"
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Hide DM tools' : 'DM tools'}
      </Button>

      {open ? (
        // Scrolls inside itself rather than growing past the bottom of the board:
        // the calibrator and both dialogs' triggers together are taller than a short
        // viewport, and a panel running off the canvas takes its Save button with it.
        // A list of characters is longer still, which is why the tab strip below is
        // sticky — one scroll container for the whole panel, with the way back to the
        // other tab pinned to the top of it rather than scrolled off above a party of
        // six and their monsters.
        <div className="pointer-events-auto min-h-0 w-full overflow-y-auto">
          <Tabs defaultValue="map">
            <TabsList className="sticky top-0 z-10 w-full">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="sheets">Sheets</TabsTrigger>
            </TabsList>

            <TabsContent value="map">
              <MapSetupPanel
                code={code}
                dmCode={dmCode}
                className="bg-background/95 shadow-lg backdrop-blur"
              />
            </TabsContent>

            <TabsContent value="sheets">
              <DmSheetsPanel
                code={code}
                dmCode={dmCode}
                className="bg-background/95 shadow-lg backdrop-blur"
              />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  )
}
