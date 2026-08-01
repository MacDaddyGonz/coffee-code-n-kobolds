import type { ReactElement } from "react";

import { DmNpcPanel } from "@/components/board/dm/DmNpcPanel";
import { DmSheetsPanel } from "@/components/board/dm/DmSheetsPanel";
import { MapSetupPanel } from "@/components/board/dm/MapSetupPanel";
import { StartGameButton } from "@/components/board/dm/StartGameButton";
import { TabBody } from "@/components/shell/TabPane";
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
 * The DM's tools: Map, Sheets and NPCs, plus the switch that starts the game.
 *
 * The three tabs are the ones that used to float over the canvas behind a *DM tools*
 * button, moved here whole rather than rebuilt. Three things went away in the move
 * and each is worth naming, because each was a workaround for being over the map:
 * the `pointer-events-none` wrapper that stopped the reserved space from becoming a
 * hole in the board, the translucent backgrounds and blur, and the collapse toggle.
 * A panel in its own column swallows no clicks meant for a token, needs nothing
 * behind it to show through, and is not in the way when it is open.
 *
 * **Start lives under Map**, next to the map it refuses to start without, and it is
 * the same button that used to be in the lobby: `games.start` is what turns the whole
 * table over, and *Stop the game* is what turns it back. Nothing is lost either
 * way — scenes, tokens and positions all survive.
 *
 * Rendered only when this browser holds a DM code, and that is a display decision and
 * not the guard: every query and mutation inside takes the code and re-verifies it
 * server-side (CLAUDE.md invariant 7), so a player who forced this on would get a
 * panel of controls and a refusal from each one.
 */
export function DmToolsTab({
  code,
  dmCode,
  game,
}: DmToolsTabProps): ReactElement {
  return (
    // One scroll container for the whole tab, with the inner strip sticky at the top
    // of it: the calibrator, both dialogs' triggers and a party of six with their
    // monsters are together taller than any pane, and the way back to the other tab
    // must not scroll off above them.
    <TabBody>
      <Tabs defaultValue="map">
        <TabsList className="sticky top-0 z-10 w-full">
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="sheets">Sheets</TabsTrigger>
          <TabsTrigger value="npcs">NPCs</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="flex flex-col gap-3">
          <MapSetupPanel code={code} dmCode={dmCode} />
          <div className="flex justify-end">
            <StartGameButton
              code={code}
              dmCode={dmCode}
              status={game.status}
              hasScene={game.activeSceneId !== null}
            />
          </div>
        </TabsContent>

        <TabsContent value="sheets">
          <DmSheetsPanel code={code} dmCode={dmCode} />
        </TabsContent>

        <TabsContent value="npcs">
          <DmNpcPanel code={code} dmCode={dmCode} />
        </TabsContent>
      </Tabs>
    </TabBody>
  );
}
