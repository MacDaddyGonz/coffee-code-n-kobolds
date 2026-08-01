import type { ReactElement } from 'react'
import { useMemo } from 'react'

import { FieldError } from '@/components/FieldError'
import { BestiaryPicker } from '@/components/board/dm/BestiaryPicker'
import { CharacterCreateDialog } from '@/components/board/dm/CharacterCreateDialog'
import {
  CharacterRow,
  CharacterSection,
  DeleteCharacterButton,
  DmCharacterRowsSkeleton,
  ReserveCharacterButton,
  useDmCharacterRows,
} from '@/components/board/dm/CharacterRows'
import { CreatureCreateDialog } from '@/components/board/dm/CreatureCreateDialog'
import { TokenControlPanel } from '@/components/board/dm/TokenControlPanel'
import { CharacterSheetView } from '@/components/sheet/CharacterSheetView'
import { Button } from '@/components/ui/button'
import type { SheetFocus } from '@/lib/sheetFocus'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { CharacterGroup } from '@convex/lib/sheet'
import { CHARACTER_GROUPS } from '@convex/lib/sheet'

export type SheetsTabProps = {
  code: string
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string
  /** Where the panel is pointed. Computed once, in `RightPane`, by `sheetFocusOf`. */
  focus: SheetFocus
  /**
   * The board's tokens, from the pane's own `board.tokens` subscription rather than a
   * second one. Three questions are asked of them here — which coin a chosen creature is
   * standing on, what to call a selected token that carries no sheet, and which coin the
   * grant panel is editing — and three props carrying three answers would be the same
   * array taken apart upstairs and reassembled here.
   */
  tokens: PublicToken[] | undefined
  /**
   * Which token the shell has selected. Only used to *prefer* it as the grant target: a
   * creature may have two coins on the board, and the one the DM clicked is the one they
   * mean.
   */
  selectedTokenId: Id<'tokens'> | null
  onSelectCharacter: (characterId: Id<'characters'>, tokenId: Id<'tokens'> | null) => void
  onClearSelection: () => void
}

/**
 * The headings and the sentence shown when one is empty.
 *
 * ⚠️ **A `Record` over the union rather than three sections written out in JSX**, which
 * is the formulation CLAUDE.md invariant 9 settled on for `SheetEntry.category` and for
 * the same reason: three hand-written sections is the arrangement where a fourth group
 * leaves a character stored, counted and with no heading to find it under. This fails to
 * compile for a fourth member instead, which is the whole of the guard — nothing here
 * guards a secret, because every group but `character` is DM-only anyway and a player is
 * sent none of them.
 */
const GROUP_SECTIONS: Record<CharacterGroup, { title: string; empty: string }> = {
  character: {
    title: 'Characters',
    empty: 'No characters yet. Add one and anybody at the table can pick it up.',
  },
  npc: {
    title: 'NPCs',
    empty: 'No NPCs yet. The innkeeper and the captain of the guard live here.',
  },
  monster: {
    title: 'Monsters',
    empty: 'No monsters yet. Most of them come off the bestiary shelf.',
  },
}

/**
 * Every sheet in the game, in one place, for the person running it.
 *
 * **The DM's tab, rendered instead of the player's Character tab and never beside it.**
 * The DM does not play a character, so a tab offering them one is a tab offering
 * something they cannot have — which is where the old *Pick a character* button in the
 * DM's sheet panel came from. Both tabs keep the value `sheet`, so the force-mount
 * arrangement in `RightPane` is unchanged and switching tabs still cannot discard a
 * half-edited sheet (ADR 0008).
 *
 * **Three regions in a fixed-height column, and the middle one is the interesting
 * decision.** The pane is 576 pixels at its narrowest and the character sheet below
 * pins its Save button to the bottom of whatever column it is given — so a selector
 * that grew with the number of monsters in the game would push that button off the
 * bottom of the screen, which is the exact failure ADR 0008's divider argument is
 * about. **The selector is therefore bounded and scrolls inside itself** rather than
 * being collapsed behind a disclosure: it is the thing that says *which* creature the
 * DM is looking at, and a collapsed selector is a panel that has stopped answering the
 * question the whole tab exists for. A DM with forty goblins scrolls a list; a DM with
 * a collapsed selector has to open it to find out where they are. The ceiling is only
 * half of it — **the sheet has a floor as well**, so that on a short laptop the regions
 * around it are what give up height rather than the Save button; the ⚠️ at each of the
 * three regions below says which way each of them yields.
 *
 * **All three creation routes are here** — a character, the bestiary shelf and a
 * hand-built creature. Two of them used to be inside *DM tools → NPCs*, which is a tab
 * named for the DM's plumbing holding the DM's most-used act, and the third was a form
 * in the lobby footer that any seat could type into before `characters.create` started
 * demanding the DM code on every path.
 *
 * Rendered only when this browser holds a DM code, and that is a display decision rather
 * than the guard: `characters.list` returns creatures only to a request carrying a code
 * it verifies against the game document, and every mutation behind every control here
 * re-verifies it (CLAUDE.md invariant 7). A browser that forced this on with an invented
 * code would get the player characters and a refusal from everything.
 */
export function SheetsTab({
  code,
  dmCode,
  focus,
  tokens,
  selectedTokenId,
  onSelectCharacter,
  onClearSelection,
}: SheetsTabProps): ReactElement {
  const rows = useDmCharacterRows(code, dmCode)

  /**
   * Which coin each creature is standing on.
   *
   * First wins where a creature has two. Nothing forbids binding a second token to one
   * character — `board.addToken` takes a character id and does not ask whether one is
   * already placed — so this is the *default* answer to "select its token", and the
   * shell's own selection overrides it below when the DM has clicked a particular one.
   */
  const tokenByCharacter = useMemo(() => {
    const map = new Map<Id<'characters'>, PublicToken>()
    for (const token of tokens ?? []) {
      if (token.characterId !== null && !map.has(token.characterId)) {
        map.set(token.characterId, token)
      }
    }
    return map
  }, [tokens])

  // The two ids out of the focus, taken apart here rather than passed around as the
  // object: `focus` is rebuilt on every render of the pane above, so a memo that
  // depended on it would recompute every time and quietly stop being a memo.
  const focusedCharacterId = focus.kind === 'character' ? focus.characterId : null
  const focusedTokenId = focus.kind === 'tokenWithoutSheet' ? focus.tokenId : null

  /**
   * The coin the grant panel edits: the selected one when it belongs to the creature on
   * screen, otherwise whichever one that creature has, otherwise the bare token the DM
   * has clicked on. All three are the same question — *which token is this panel talking
   * about* — and the order is what makes a DM who clicked the second goblin get the
   * second goblin.
   */
  const grantToken = useMemo(() => {
    if (focusedTokenId !== null) {
      return (tokens ?? []).find((token) => token._id === focusedTokenId) ?? null
    }
    if (focusedCharacterId === null) return null
    const selected = (tokens ?? []).find((token) => token._id === selectedTokenId) ?? null
    if (selected?.characterId === focusedCharacterId) return selected
    return tokenByCharacter.get(focusedCharacterId) ?? null
  }, [focusedTokenId, focusedCharacterId, selectedTokenId, tokenByCharacter, tokens])

  return (
    // Not a `TabBody`: this tab is three regions of its own rather than one scrolling
    // column, and the sheet at the bottom brings its own body and pinned footer. The
    // bounded height comes from the `TabPane` above, which is the contract that file
    // exists to state.
    <>
      {/* `shrink-0`, like every fixed region here: a row of buttons that gave up its
          height to a long list below would be the first thing to vanish, and it is how
          a DM adds anything at all. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <CharacterCreateDialog code={code} dmCode={dmCode} />
        {/* Unchanged, and with no `onPick`: absent means the picker creates the creature
            itself, which is what a list of sheets wants. The token dialog passes one
            because it needs the choice rather than the document. */}
        <BestiaryPicker code={code} dmCode={dmCode} />
        <CreatureCreateDialog code={code} dmCode={dmCode} />
      </div>

      {/* The bounded region, and the whole of the vertical argument is in these four
          utilities.

          `max-h-64` is the ceiling: however many goblins are in the game, the selector
          stops at sixteen rems and scrolls the rest. A fixed length rather than a
          percentage, because a percentage of a column whose height comes from a
          draggable divider is a number that moves while you are reading it.

          ⚠️ **No `shrink-0`, unlike the button row above, and that asymmetry is the
          part that is easy to get wrong.** On a short laptop the ceiling alone is not
          enough: the sheet below claims what is left, and what is left can be nothing —
          which puts its pinned Save button off the bottom of the screen, the exact
          failure ADR 0008's divider argument is about. So this region is shrinkable and
          the sheet has a floor (see below): when the pane runs short the selector gives
          up its height and scrolls inside a smaller box, and the sheet keeps enough to
          show a field and its Save. `min-h-16` stops it collapsing to a sliver of a
          scroll bar on the way. */}
      <div className="max-h-64 min-h-16 overflow-y-auto border-b p-3">
        {rows.loading ? (
          <DmCharacterRowsSkeleton />
        ) : (
          <div className="flex flex-col gap-4">
            {CHARACTER_GROUPS.map((group) => (
              <CharacterSection
                key={group}
                title={GROUP_SECTIONS[group].title}
                empty={GROUP_SECTIONS[group].empty}
              >
                {rows.byGroup[group].map((character) => (
                  <CharacterRow
                    key={character._id}
                    {...rows.rowProps(character)}
                    selected={character._id === focusedCharacterId}
                    // Both halves of the selection, because a creature routinely has no
                    // token: passing only the id it has would leave the previous coin
                    // ringed on the map while the panel talked about something else.
                    onSelect={() =>
                      onSelectCharacter(
                        character._id,
                        tokenByCharacter.get(character._id)?._id ?? null,
                      )
                    }
                    actions={
                      group === 'character' ? (
                        // A hero gets the eye and no Delete: the character belongs to
                        // the player, and the DM's delete lives in the lobby beside the
                        // rename. Hiding one is the reversible act; deleting it is not.
                        <ReserveCharacterButton {...rows.reserveProps(character)} />
                      ) : (
                        // And a creature gets the Delete and no eye: `setReserved`
                        // refuses anything that is not a player character, because a
                        // creature is already hidden from everybody.
                        <DeleteCharacterButton {...rows.deleteProps(character)} />
                      )
                    }
                  />
                ))}
              </CharacterSection>
            ))}
          </div>
        )}
      </div>

      {/* Outside the scrolling region above rather than at the bottom of it. Already
          merged by the hook, which carries the note about why a refused `−5` reports
          rather than throwing — and a refusal a DM has to scroll to find is a refusal
          they conclude did not happen. The wrapper is conditional as well as the
          message, so an absent error costs no padding either. */}
      {rows.error !== null ? (
        <div className="shrink-0 px-3 pt-2">
          <FieldError message={rows.error} />
        </div>
      ) : null}

      {/* The sheet. `flex-1 flex-col` is the column `CharacterSheetEditor` pins its
          footer to the bottom of — the same contract `TabPane` supplies one level up,
          restated here because this tab divides that column further.

          ⚠️ **`min-h-64` and not `min-h-0`, which is the one place in this file that
          departs from the chain the shell documents.** Everywhere else `min-h-0` is
          what lets a flex item scroll instead of pushing its neighbours; here the item
          *is* the thing being pushed, and a zero floor means the two bounded regions
          around it can squeeze the Save button off a short screen. Sixteen rems is
          enough for a field and the pinned footer, and it is what makes the regions
          above and below shrink first. `EditorBody` inside carries its own `min-h-0`,
          so the scrolling still happens where it should. */}
      <div className="flex min-h-64 flex-1 flex-col">
        <SheetRegion
          code={code}
          dmCode={dmCode}
          focus={focus}
          tokens={tokens}
          onClearSelection={onClearSelection}
        />
      </div>

      {grantToken ? (
        // Bounded and shrinkable on exactly the terms the selector is, and for the same
        // reason: a table of six seats under a sheet must not be what takes Save off the
        // screen. Below the sheet rather than above it because the sheet is what the DM
        // came for and this is what they do next.
        <div className="max-h-48 min-h-16 overflow-y-auto border-t p-3">
          <TokenControlPanel code={code} dmCode={dmCode} token={grantToken} />
        </div>
      ) : null}
    </>
  )
}

/**
 * What the bottom two-thirds of the tab shows, which is one of three things.
 *
 * The three arms are `SheetFocus`'s own, and they are read here rather than re-derived:
 * `sheetFocusOf` decides in one place, and the ⚠️ on that function is about the three
 * call sites that would otherwise each learn the rules separately.
 */
function SheetRegion({
  code,
  dmCode,
  focus,
  tokens,
  onClearSelection,
}: {
  code: string
  dmCode: string
  focus: SheetFocus
  tokens: PublicToken[] | undefined
  onClearSelection: () => void
}): ReactElement {
  if (focus.kind === 'character') {
    return (
      <CharacterSheetView
        code={code}
        characterId={focus.characterId}
        // No seat id. The DM's authority here is the code, which every query and
        // mutation behind this view re-verifies; a `playerId` would be routing dressed
        // up as permission (ADR 0003) and would buy nothing the code has not already
        // bought — the DM is sent every creature's exact hit points regardless.
        playerId={null}
        dmCode={dmCode}
      />
    )
  }

  if (focus.kind === 'tokenWithoutSheet') {
    const token = tokens?.find((row) => row._id === focus.tokenId) ?? null

    return (
      <div className="text-muted-foreground flex flex-col items-start gap-2 p-4 text-sm">
        {/* **Named, rather than an empty panel.** A door marker or a summoned wolf
            nobody wrote a sheet for is something the DM has deliberately clicked on,
            and silently leaving the last creature on screen is how a DM ends up
            adjusting a goblin they are no longer looking at. */}
        <p>
          <span className="text-foreground font-medium">{token?.name ?? 'That token'}</span> is on
          the board but carries no sheet — there is nothing behind it to show, and nothing to
          roll. Bind it to a creature from the token dialog on the Map tab, or pick a sheet from
          the list above.
        </p>
        {/* The one place a *Deselect* is offered, and only here. Everywhere else the
            gesture is clicking empty map, which is what the copy points at — but this
            state is usually reached by clicking something by accident, and the panel
            that just said "there is nothing here" should be able to undo itself. It is
            also the only state where the map's own gesture is awkward: the token the DM
            wants to get away from is under the cursor.

            Control of the coin is still offered below it. An unbound token is the DM's
            alone until they say otherwise, and a door the party can push open is a
            reasonable thing to want. */}
        <Button type="button" size="sm" variant="outline" onClick={onClearSelection}>
          Select nothing
        </Button>
      </div>
    )
  }

  return (
    <div className="text-muted-foreground flex flex-col gap-2 p-4 text-sm">
      <p>
        Nothing selected. Choose a sheet from the list above, or click a token on the map —
        both write the same selection, so the list and the board always agree about what is
        being talked about.
      </p>
    </div>
  )
}
