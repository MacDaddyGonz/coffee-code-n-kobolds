import type { ReactElement } from "react";

import { CharacterSheetView } from "@/components/sheet/CharacterSheetView";
import { TabBody } from "@/components/shell/TabPane";
import { Button } from "@/components/ui/button";
import type { Id } from "@convex/_generated/dataModel";

export type SheetTabProps = {
  code: string;
  /** Routing, not identity — see `useCharacterSheet`. */
  playerId: Id<"players">;
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string | null;
  /** The character this seat is playing, or null. */
  characterId: Id<"characters"> | null;
  /** Sends the panel to the Table tab, where characters are picked up. */
  onGoToTable: () => void;
};

/**
 * This seat's own character sheet — the tab that replaces the sheet panel over the
 * board.
 *
 * Everyone gets it, the DM included, and that is not a loosening of anything: a DM is
 * a seat like any other and may be playing a character alongside running the game.
 * What the DM code buys — every sheet in the game, monsters included — is the DM tools
 * tab, and nothing here anticipates it.
 *
 * **The empty state is two sentences and a button, and the button is the reason the
 * tab strip is controlled state.** It used to be a whole component: a claim prompt
 * that existed because the board replaced the lobby and the character list lived in
 * the lobby. The character list is now a tab that is always there, so a second claim
 * UI beside it would be two places to pick up the same character and two chances to
 * disagree about what is free. Pointing at the one list is the smaller and truer
 * thing.
 */
export function SheetTab({
  code,
  playerId,
  dmCode,
  characterId,
  onGoToTable,
}: SheetTabProps): ReactElement {
  if (characterId === null) {
    return (
      <TabBody className="items-start gap-3">
        <p className="text-muted-foreground text-sm">
          {dmCode !== null
            ? "You run this game by holding the DM code, so you do not need a character of your own — but you can pick one up if you are playing as well."
            : "You are not playing a character yet. You can only move your own character’s token, and this is where their sheet will be."}
        </p>
        <Button type="button" onClick={onGoToTable}>
          Pick a character
        </Button>
      </TabBody>
    );
  }

  return (
    <CharacterSheetView
      code={code}
      characterId={characterId}
      playerId={playerId}
      dmCode={dmCode}
    />
  );
}
