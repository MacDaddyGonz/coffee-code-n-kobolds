import type { ReactElement } from "react";

import { MapSetupPanel } from "@/components/board/dm/MapSetupPanel";
import { StartGameButton } from "@/components/board/dm/StartGameButton";
import { TabBody } from "@/components/shell/TabPane";
import type { PublicGame } from "@/hooks/useSeat";

export type DmToolsTabProps = {
  code: string;
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string;
  /** Taken whole rather than as two derived props: the Start button needs both. */
  game: PublicGame;
};

/**
 * The DM's tools: the map, and the switch that starts the game.
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
 * **One panel, so no tab strip.** A `TabsList` with a single trigger is a control that
 * cannot do anything, and it would read as a promise that there is something else behind
 * it. The tab keeps its name: the DM-tooling milestone puts sub-tabs back, and renaming a
 * tab twice teaches the group nothing.
 *
 * **Start lives under the map**, next to the thing it refuses to start without, and it is
 * the same button that used to be in the lobby: `games.start` is what turns the whole
 * table over, and *Stop the game* is what turns it back. Nothing is lost either
 * way — scenes, tokens and positions all survive.
 *
 * Rendered only when this browser holds a DM code, and that is a display decision and
 * not the guard: every query and mutation inside takes the code and re-verifies it
 * server-side (CLAUDE.md invariant 7), so a player who forced this on would get a
 * panel of controls and a refusal from each one.
 */
export function DmToolsTab({ code, dmCode, game }: DmToolsTabProps): ReactElement {
  return (
    // One scroll container for the whole tab: the calibrator and the token dialog's
    // trigger are together taller than any pane on a small window.
    <TabBody>
      <div className="flex flex-col gap-3">
        <MapSetupPanel code={code} dmCode={dmCode} />
        <div className="flex justify-end">
          <StartGameButton
            code={code}
            dmCode={dmCode}
            status={game.status}
            hasScene={game.activeSceneId !== null}
          />
        </div>
      </div>
    </TabBody>
  );
}
