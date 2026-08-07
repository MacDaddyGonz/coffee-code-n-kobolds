import type { ReactElement } from "react";

import { CharacterSheetView } from "@/components/sheet/CharacterSheetView";
import { TabBody } from "@/components/shell/TabPane";
import { Button } from "@/components/ui/button";
import type { SheetFocus } from "@/lib/sheetFocus";
import type { Id } from "@convex/_generated/dataModel";

export type SheetTabProps = {
  code: string;
  /** Routing, not identity — see `useCharacterSheet`. */
  playerId: Id<"players">;
  /** Where the panel is pointed. Computed once, in `RightPane`, by `sheetFocusOf`. */
  focus: SheetFocus;
  /** The character this seat is playing, for the empty state's copy. */
  characterId: Id<"characters"> | null;
  /** The name of the selected token when it carries no sheet. */
  selectedTokenName: string | null;
  /** Sends the panel to the Table tab, where characters are picked up. */
  onGoToTable: () => void;
};

/**
 * A player's Character tab: their own sheet, or the sheet of whatever they have
 * selected.
 *
 * **The DM never mounts this.** They get the Sheets tab instead — instead, not as
 * well — because a DM does not play a character, and the branch that used to live
 * here offering them one to pick up was the clearest statement of the model this
 * milestone came to correct. There is no `dmCode` prop for that reason; the one
 * `CharacterSheetView` takes is passed `null` below, which is the honest value for
 * a browser that does not hold the code rather than an omission.
 *
 * **Three of the four behaviours are `sheetFocusOf`'s and none of them are decided
 * here.** Default to their own character, show a selected token's creature instead,
 * fall back to their own on deselect — one function answers all of it, this tab
 * reads the answer, and the DM's tab reads the same one. Re-deriving any part of it
 * from `characterId` would be the second reader that makes the two panels drift.
 * Hence no state: the question is settled above, and the sheet on screen is a pure
 * function of the props.
 *
 * ⚠️ **Which sheets may be *read* was settled server-side and is not this file's
 * business.** `characters.sheet` is claim-or-control now, so a selected NPC the DM
 * has granted answers and one they have not comes back null, and
 * `CharacterSheetView` draws the refusal. Nothing here inspects a sheet to decide
 * whether to draw it (CLAUDE.md invariant 1).
 *
 * **The empty state is two sentences and a button, and the button is the reason the
 * tab strip is controlled state.** It used to be a whole component: a claim prompt
 * that existed because the board replaced the lobby and the character list lived in
 * the lobby. The character list is now a tab that is always there, so a second claim
 * UI beside it would be two places to pick up the same character and two chances to
 * disagree about what is free. Pointing at the one list is the smaller and truer
 * thing — and it is a *claim*, not a creation: making characters is the DM's now, so
 * the button goes to the list rather than offering a form.
 */
export function SheetTab({
  code,
  playerId,
  focus,
  characterId,
  selectedTokenName,
  onGoToTable,
}: SheetTabProps): ReactElement {
  if (focus.kind === "character") {
    return (
      <CharacterSheetView
        code={code}
        characterId={focus.characterId}
        playerId={playerId}
        // Never present in this tab — the DM is on the Sheets tab. Stated rather
        // than threaded so nothing downstream can be handed a code from here.
        dmCode={null}
      />
    );
  }

  if (focus.kind === "none") {
    return (
      <TabBody className="items-start gap-3">
        {/* For a player, `none` *is* "no character assigned", and flatly rather than
            probably: `sheetFocusOf` falls back to `myCharacterId` one rule earlier,
            so nothing else reaches here. That is why the copy states it instead of
            branching on `characterId`.

            ⚠️ **The second sentence names the half of the job that happens *here*, and
            it is the difference between one route and half of one.** The copy used to
            stop at "pick one up from the table", which describes the button and not the
            outcome: a new player claims a character whose sheet is a blank `pc` — ten
            across, no species, no class — and the two dropdowns that turn it into somebody
            are on this panel, in `CharacterBuilder`'s *Build a character* form. Nothing
            on the Table tab says so, and nothing needs to, because they land back here
            the moment the claim succeeds (`onClaimed` in `RightPane`). Copy that
            described only the click left them holding a level-one nobody with no
            indication that they were two choices away from a character, which is the
            state the DM then gets asked about.

            It says *species and class* rather than naming the archetype, because there is
            no archetype to choose until level 3 — `CharacterBuilder` draws that field only
            from `SUBCLASS_LEVEL` up, so promising three choices would be wrong for every
            character that has just been made. ⚠️ **The word is *species* now and *race*
            before the 2024 conversion**, which is the rename reaching the last piece of
            copy that had it. The stored field is called `species` too, as of the migration
            commits; `speciesKeyOf` is the accessor everything reads it through, because a
            rename is not the last thing that will happen to that field.

            It also names the Build tab, which the sheet did not have when this was
            written: landing on a blank Play pane and being told to choose a species is a
            reader looking for a control that is one tab over. */}
        <p className="text-muted-foreground text-sm">
          You are not playing a character yet. Pick up one of the characters the DM has made and
          you will choose its species and class on the Build tab here.
        </p>
        <Button type="button" onClick={onGoToTable}>
          Pick a character
        </Button>
      </TabBody>
    );
  }

  /*
   * A token with nothing behind it.
   *
   * ⚠️ **Nearly unreachable here, and kept anyway rather than left to render
   * nothing.** `sheetFocusOf` only answers `tokenWithoutSheet` for the DM: a player
   * with a character falls back to their own sheet one rule earlier, and a player
   * without one lands on `none`. So the honest reachable set is empty today — but
   * "empty today" is a property of a rule in another file, and the day that rule
   * grows a fourth case, the failure mode of having deleted this is a blank panel
   * that looks broken. Two sentences is a cheap price for not owing `sheetFocusOf`
   * a promise it never made. It is not dead code; it is the branch that stops a
   * distant edit being silent.
   */
  return (
    <TabBody className="items-start gap-3">
      <p className="text-muted-foreground text-sm">
        {selectedTokenName !== null
          ? `${selectedTokenName} carries no sheet — it is a marker on the board and nothing more.`
          : "That token carries no sheet — it is a marker on the board and nothing more."}
      </p>
      {/* No affordance to fix it: binding a token to a creature is the DM's, and a
          button here would be the same mistake as the DM's old *Pick a character*.
          `characterId` decides only whether there is a sheet to go back to. */}
      <p className="text-muted-foreground text-sm">
        {characterId !== null
          ? "Deselect it to return to your own sheet."
          : "Deselect it to clear the panel."}
      </p>
    </TabBody>
  );
}
