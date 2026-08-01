import type { ReactElement } from "react";

import { TabBody } from "@/components/shell/TabPane";
import { DmBar } from "@/components/lobby/dm/DmBar";
import type { Dm } from "@/hooks/useDm";

export type SettingsTabProps = {
  code: string;
  dm: Dm;
};

/**
 * Game-level settings: at present, everything to do with the DM credential.
 *
 * ⚠️ **This closes a real gap rather than tidying one.** `DmBar` — *I'm the DM*, the
 * recovery phrase, and standing down — has only ever been mounted by the lobby, and
 * the lobby went away the moment the game started. So a DM whose browser lost its
 * storage mid-campaign had nowhere to paste their code and nowhere to exchange their
 * recovery phrase for it: the only way back in was for somebody to end the session.
 * Putting it in a tab that is always there is what makes recovery an in-app nuisance
 * again rather than a lockout, which is what ADR 0003 promised it would be.
 *
 * Shown to everybody, including a browser holding no code — because a browser holding
 * no code is exactly the one that needs the elevate dialog. Nothing here authorises
 * anything: `games.elevateDm` and `games.recoverDmCode` check what they are given
 * server-side, and standing down only forgets a local copy.
 */
export function SettingsTab({ code, dm }: SettingsTabProps): ReactElement {
  return (
    <TabBody className="gap-4">
      <DmBar code={code} dm={dm} />
    </TabBody>
  );
}
