import type { ReactElement } from "react";

import { MapSetupPanel } from "@/components/board/dm/MapSetupPanel";
import { StartGameButton } from "@/components/board/dm/StartGameButton";
import { TabBody, TabPane } from "@/components/shell/TabPane";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicGame } from "@/hooks/useSeat";

export type DmToolsTabProps = {
  code: string;
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string;
  /** Taken whole rather than as two derived props: the Start button needs both. */
  game: PublicGame;
};

/**
 * The DM's tools: the map, the fog, the pictures, the music, and the switch that
 * starts the game.
 *
 * These panels are the ones that used to float over the canvas behind a *DM tools*
 * button, moved here whole rather than rebuilt. Three things went away in the move
 * and each is worth naming, because each was a workaround for being over the map:
 * the `pointer-events-none` wrapper that stopped the reserved space from becoming a
 * hole in the board, the translucent backgrounds and blur, and the collapse toggle.
 * A panel in its own column swallows no clicks meant for a token, needs nothing
 * behind it to show through, and is not in the way when it is open.
 *
 * **It had a Sheets sub-tab and an NPCs sub-tab, and both are gone rather than moved
 * twice.** They were two views of one list, three clicks inside a tab named for the DM's
 * plumbing — and the second of them held the DM's most-used act, adding a creature. That
 * list is now the selector at the top of the Sheets tab, beside the sheet it selects, and
 * all three creation routes are with it. What is left here is genuinely plumbing.
 *
 * **The strip is back, and this is the milestone it was promised to.** What used to
 * stand in this paragraph argued against a `TabsList` with a single trigger — a control
 * that cannot do anything, reading as a promise that something else is behind it — and
 * said the DM-tooling milestone would put sub-tabs back rather than rename the tab a
 * second time. Four of them: **Map** is what was already here, and Fog, Images and Music
 * are the three tools this milestone adds. The tab's name never had to move, which is
 * exactly what that paragraph was buying by leaving one panel bare.
 *
 * **Uncontrolled, unlike the strip above it, and the difference is the same test.**
 * `RightPane` holds its tab in state because a tab *body* steers it — the Character tab's
 * empty state sends the reader to the Table and a claim sends them back — and nothing
 * down here does: no panel reaches for another, so Radix keeps the value and this
 * component holds no state at all. ⚠️ The consequence to know about is that the strip is
 * back on **Map** whenever the DM leaves *DM tools* and returns, because this tab is
 * deliberately not force-mounted and the whole subtree goes with it. The fix is not a
 * `useState` here — that unmounts too — it is either lifting the value into `RightPane`,
 * which puts a second tab value in the pane's state for one panel's convenience, or a
 * per-browser preference in `@/lib/session` beside the layer view. Neither is worth
 * building before somebody says it bites.
 *
 * **Start lives under the map**, next to the thing it refuses to start without, and it is
 * the same button that used to be in the lobby: `games.start` is what turns the whole
 * table over, and *Stop the game* is what turns it back. Nothing is lost either
 * way — scenes, tokens and positions all survive. It stays inside the Map sub-tab rather
 * than rising above the strip, because the condition it is disabled on is *there is a
 * scene on the table*, and the control that puts one there is the panel directly above it.
 *
 * Rendered only when this browser holds a DM code, and that is a display decision and
 * not the guard: every query and mutation inside takes the code and re-verifies it
 * server-side (CLAUDE.md invariant 7), so a player who forced this on would get a
 * panel of controls and a refusal from each one. The sub-tabs add no gating of their
 * own and must not look as though they do — `RightPane`'s `DM_ONLY_TABS` is what keeps
 * this whole subtree off a player's strip, and it is one decision rather than five.
 */
export function DmToolsTab({ code, dmCode, game }: DmToolsTabProps): ReactElement {
  return (
    // `min-h-0` and `flex-1` on the nested root, which extends the chain `GameShell`
    // documents by two more links: this is a flex item of the `TabPane` `RightPane`
    // wrapped us in *and* a flex column of its own, and each body below then repeats
    // the `TabsContent`/`TabPane` pair for the same reason the pane's own tabs do.
    // Without them the calibrator pushes this taller than the pane instead of
    // scrolling inside it, and the strip is the first thing to scroll off.
    <Tabs defaultValue="map" className="min-h-0 flex-1 gap-0">
      {/* Inset rather than full-bleed, unlike the pane's own strip: two edge-to-edge
          bars stacked with a border between them read as one strip of nine tabs. The
          wrapper is what carries the inset — the primitive's own `w-fit` becomes
          `w-full` so the four triggers divide the row evenly instead of huddling on
          the left. */}
      <div className="shrink-0 px-3 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="fog">Fog</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="music">Music</TabsTrigger>
        </TabsList>
      </div>

      {/* One scroll container per sub-tab: the calibrator and the token dialog's
          trigger are together taller than any pane on a small window, and a scroll
          position belongs to the panel it was scrolled in rather than to the strip. */}
      <TabsContent value="map" className="min-h-0">
        <TabPane>
          <TabBody className="gap-3">
            <MapSetupPanel code={code} dmCode={dmCode} />
            <div className="flex justify-end">
              <StartGameButton
                code={code}
                dmCode={dmCode}
                status={game.status}
                hasScene={game.activeSceneId !== null}
              />
            </div>
          </TabBody>
        </TabPane>
      </TabsContent>

      <TabsContent value="fog" className="min-h-0">
        <TabPane>
          <TabBody className="gap-3">
            {/* WIRING: FogTools is being written in parallel and is not on disk yet.
                When it lands, add to the imports at the top of this file:

                  import { FogTools } from "@/components/board/dm/FogTools";
                  import { useQuery } from "convex/react";
                  import { api } from "@convex/_generated/api";

                take the scene at the top of the component:

                  const scene = useQuery(api.scenes.active, { code });

                — `{ code }` exactly, because `MapSetupPanel` already subscribes with
                those args and an argument object of the same shape is the same cache
                entry, one socket and one server-side execution rather than two — and
                replace the paragraph below with:

                  <FogTools code={code} dmCode={dmCode} scene={scene} />

                ⚠️ The subscription is `PublicScene | null | undefined`: null is a game
                with no map on the table and undefined is the first frame. Fog is drawn
                per scene, so both are states this panel has to say something about
                rather than states `FogTools` can assume away. Check its actual prop
                type before assuming it takes all three. */}
            <p className="text-muted-foreground text-sm">
              Not in this build yet. Fog goes here — the rectangles that hide a corridor
              from the table until somebody walks down it.
            </p>
          </TabBody>
        </TabPane>
      </TabsContent>

      <TabsContent value="images" className="min-h-0">
        <TabPane>
          <TabBody className="gap-3">
            {/* WIRING: ModalImagePanel is being written in parallel and is not on disk
                yet. When it lands, add to the imports at the top of this file:

                  import { ModalImagePanel } from "@/components/board/dm/ModalImagePanel";

                and replace the paragraph below with:

                  <ModalImagePanel code={code} dmCode={dmCode} />

                Nothing else is needed here — the panel owns its own subscription and
                its own uploads, the way `MapSetupPanel` does. */}
            <p className="text-muted-foreground text-sm">
              Not in this build yet. The picture library goes here — the portrait or the
              handout you throw up on everybody's screen at once, and take down again.
            </p>
          </TabBody>
        </TabPane>
      </TabsContent>

      <TabsContent value="music" className="min-h-0">
        <TabPane>
          <TabBody className="gap-3">
            {/* WIRING: MusicPanel is being written in parallel and is not on disk yet.
                When it lands, add to the imports at the top of this file:

                  import { MusicPanel } from "@/components/board/dm/MusicPanel";

                and replace the paragraph below with:

                  <MusicPanel code={code} dmCode={dmCode} />

                Same as Images: it owns whatever it subscribes to. */}
            <p className="text-muted-foreground text-sm">
              Not in this build yet. The music selector goes here — what the table is
              listening to, chosen by you and started for everybody.
            </p>
          </TabBody>
        </TabPane>
      </TabsContent>
    </Tabs>
  );
}
