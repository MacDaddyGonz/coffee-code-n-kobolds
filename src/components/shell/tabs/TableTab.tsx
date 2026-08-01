import type { ReactElement } from "react";
import { useQuery } from "convex/react";

import { LobbyCharacters } from "@/components/lobby/LobbyCharacters";
import { LobbyRoster } from "@/components/lobby/LobbyRoster";
import { TabBody } from "@/components/shell/TabPane";
import type { Dm } from "@/hooks/useDm";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type TableTabProps = {
  code: string;
  playerId: Id<"players">;
  dm: Dm;
  /** Rename this seat, storage included. Owned by useSeat. */
  onRenameSeat: (displayName: string) => Promise<void>;
  /** Give up this seat and drop back to the name gate. Owned by useSeat. */
  onLeaveSeat: () => Promise<void>;
  /**
   * Where a successful claim leads. Threaded straight through to `LobbyCharacters`,
   * which carries the reasoning; this tab adds nothing to it and deliberately does not
   * decide the destination, because the destination is a tab and a tab body does not own
   * the strip above it.
   */
  onClaimed?: () => void;
};

/**
 * Who is at this table and which character each of them is playing — the two lists
 * the lobby used to be.
 *
 * They are a tab rather than a screen now, which is what makes them reachable during
 * play: a player arriving mid-session picks up a character here without the DM
 * sending the whole table off the board to allow it, and a seat can be renamed or
 * given up without leaving the game.
 *
 * The two subscriptions live here because this is the only thing that reads both.
 * `characters.list` is asked **without** the DM code even when this browser holds
 * one, deliberately: a seat plays a hero, `characters.claim` refuses a monster to
 * everybody including the DM, and the list without monsters in it is exactly the list
 * of things that can be picked up. Asking for more would only offer something the
 * mutation would then refuse — and would publish a count of prepared monsters to a
 * panel that has no use for one.
 *
 * The roster takes the character list as well, because the DM's assign dialog picks
 * from it and a third subscription for the same rows would buy nothing.
 */
export function TableTab({
  code,
  playerId,
  dm,
  onRenameSeat,
  onLeaveSeat,
  onClaimed,
}: TableTabProps): ReactElement {
  const seats = useQuery(api.players.list, { code });
  const characters = useQuery(api.characters.list, { code });

  return (
    <TabBody className="gap-4">
      <LobbyRoster
        code={code}
        playerId={playerId}
        seats={seats}
        characters={characters}
        dm={dm}
        onRenameSeat={onRenameSeat}
        onLeaveSeat={onLeaveSeat}
      />
      <LobbyCharacters
        code={code}
        playerId={playerId}
        characters={characters}
        dm={dm}
        onClaimed={onClaimed}
      />
    </TabBody>
  );
}
