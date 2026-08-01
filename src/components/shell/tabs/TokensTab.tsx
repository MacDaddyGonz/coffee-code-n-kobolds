import type { ReactElement } from 'react'
import { useMemo } from 'react'

import { useDmCharacterRows } from '@/components/board/dm/CharacterRows'
import { TokenEditPanel } from '@/components/board/dm/TokenEditPanel'
import { TokenSwatch } from '@/components/board/dm/TokenSwatch'
import { Badge } from '@/components/ui/badge'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import type { PublicGame } from '@/hooks/useSeat'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { PublicCharacter } from '@convex/lib/characters'
import { CHARACTER_GROUPS } from '@convex/lib/sheet'

export type TokensTabProps = {
  code: string
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string
  /**
   * Every token in the game, from the pane's own `board.tokens` subscription rather than a
   * second one.
   *
   * ⚠️ **This array is already the whole answer for a DM, and that is why this tab needed
   * no new query.** `board.tokens` is game-scoped through `by_gameId` rather than
   * scene-scoped, so for a caller whose DM code checked out it carries the DM-layer coins
   * *and* the coins standing on no scene at all — the two kinds nothing else in the
   * application can reach. A player's copy of the same query has had the first kind
   * filtered out of it by `maySee` before the payload was assembled (CLAUDE.md
   * invariant 1); nothing here does any filtering, because there is nothing left to filter.
   *
   * `undefined` for the whole of the lobby, where `RightPane` skips the query outright, and
   * for the first frame of a running game — two states that look identical from here and
   * are not, which is what `status` below is for.
   */
  tokens: PublicToken[] | undefined
  /**
   * Whether the game has started, and the *only* thing it is used for: telling *the pane
   * has not asked* apart from *the answer has not arrived*.
   *
   * ⚠️ **Without it this tab shows a skeleton forever in the lobby**, which is a real state
   * rather than a hypothetical: `TokenAddDialog` lives in DM tools and needs a scene on the
   * table, not a started game, so a DM setting an ambush up before pressing Start has coins
   * this tab cannot see. It deliberately mirrors the pane's own skip condition rather than
   * lifting it — asking `board.tokens` in the lobby means resolving a signed storage URL per
   * token for a screen the rest of the shell is not showing either (`MapPane` draws a
   * placeholder, not a board) — so the honest answer is a sentence saying so, in the same
   * words that placeholder uses.
   *
   * Taken off the server's own payload rather than reduced to a boolean by the caller, the
   * way `Layer` is taken off `PublicToken`, so the pane's skip condition and this tab's
   * branch are written against one union. It is **not** a mechanical refusal of the kind
   * invariant 9 is about, and it should not be read as one: a third member of `GameStatus`
   * would compile fine and fall into the not-started branch. That is the right default —
   * anything that is not `playing` has no board — but if a third status ever means something
   * else, this line has to be visited by hand.
   */
  status: PublicGame['status']
  /**
   * The coin the shell has selected, **already found**. `RightPane` holds the one `find`
   * over the array for the whole panel — the focus needs it, the DM's sheet tab needs it,
   * and so does this — so passing the id instead would have made this the fourth search
   * for one answer.
   *
   * Null when nothing is selected *and* when a creature with no coin is: a direct pick from
   * the Sheets selector writes a character id and a null token, which is correct and shows
   * up here as no row highlighted.
   */
  selectedToken: PublicToken | null
  /**
   * Picking a coin. **The map's gesture, and deliberately not the selector's.**
   *
   * A row here is a token, so `onSelectToken` is the handler that means it: it writes the
   * token id and clears the direct character pick, which is what lets `sheetFocusOf` resolve
   * the sheet from whatever the coin is bound to — the same answer a click on the board
   * gives. Calling `onSelectCharacter` instead would pin the panel to a creature and then
   * disagree with the board the moment the DM clicked a second coin on the same sheet.
   */
  onSelectToken: (tokenId: Id<'tokens'>) => void
}

/**
 * Every coin in the game, in one place, for the person running it.
 *
 * **The tab exists because the Sheets tab reaches every *sheet* and nothing reached the
 * *coins*.** A token bound to nothing has no row in the sheet selector to find it under; a
 * token on a layer that is not being drawn is not on the map to click; a token placed on no
 * scene at all is on neither. Each of those is a thing the DM made on purpose and then
 * could not get back to, which is the whole of the case for a list.
 *
 * **Two regions, and the split is `SheetsTab`'s with the same argument behind it.** A
 * bounded, scrolling list on top says *which* coin is being talked about, and the editor
 * below it is what the DM came to use. The list is capped rather than collapsed behind a
 * disclosure for that file's reason — a collapsed selector is a panel that has stopped
 * answering the question the tab exists for — and the editor has a floor so that on a short
 * laptop the list gives up height first. The ⚠️ at each region says which way it yields.
 *
 * **The editor is a fixed region rather than a row that expands in place**, and that is the
 * one layout decision here that is not copied from next door. Selection is shell state:
 * clicking a coin on the map selects it, and this tab has to agree. With an inline
 * expansion the DM would click the board, come back to this tab, and find the editor
 * somewhere down a list they then have to scroll to; with a fixed region below, whatever
 * the shell has selected is already in front of them.
 *
 * ⚠️ **Nothing here computes who controls a token.** `TokenEditPanel` mounts
 * `TokenControlPanel` verbatim for that, which is the one client writer of
 * `board.setControllers` and reads `controllerIds` and `grantedPlayerIds` off the payload
 * without deriving either. The grant relation acquiring a second writer is the specific
 * failure ADR 0009 spent a milestone removing.
 *
 * ⚠️ **Two things the payload deliberately does not carry, so that this tab cannot ask for
 * them.** There is no `characterName` on a token — `board.tokens` already re-executes for
 * everyone at the table on any roster churn, and joining the character table into it would
 * make every rename re-push every signed art URL to every client — so the creature's name
 * is joined on **here**, in the browser, against the `characters.list` the shell is already
 * holding. And there is no placement: a token's position lives in `tokenPositions` and is
 * written ten times a second, so folding *where does this coin stand* into the low-churn
 * subscription would invert CLAUDE.md invariant 2 outright. The consequence to know about
 * is that this list cannot say which map a coin is on, or whether it is on one at all —
 * recorded rather than worked around.
 *
 * Rendered only when this browser holds a DM code, and that is a display decision rather
 * than the guard: `board.tokens` returns the DM layer only to a request carrying a code it
 * verified against the game document, and all four mutations behind the editor re-verify it
 * (CLAUDE.md invariant 7). A browser that forced this tab on with an invented code would
 * get the player-layer coins and a refusal from every control.
 */
export function TokensTab({
  code,
  dmCode,
  tokens,
  status,
  selectedToken,
  onSelectToken,
}: TokensTabProps): ReactElement {
  /**
   * The creature list, for the two things this tab asks of it: the caption on each row, and
   * the options in the editor's rebind select.
   *
   * ⚠️ **The same hook the Sheets tab uses, and therefore the same subscription rather than
   * a third one.** Convex keys a query on its arguments, so `{ code, dmCode }` here is the
   * cache entry `SheetsTab` already holds — one socket, one server-side execution — which is
   * the arrangement `TokenControlPanel` documents for `players.list` and `Roster` documents
   * for the roster. Its `useVitals` joins one entry too, because `vitalsArgs` drops the seat
   * whenever a DM code is present, so the board and both sheet panels are already reading it.
   *
   * `byGroup` is the reason to take the whole hook rather than the bare query. It is the
   * `CHARACTER_GROUPS`-keyed record CLAUDE.md invariant 9 argues for — the shape a fourth
   * group arrives in a select through instead of being stored, counted and unbindable — and
   * rebuilding it here would be a second copy of that discipline to keep correct.
   *
   * What is genuinely surplus is the hit-point half: four `useMutation` refs and an
   * optimistic-update closure this tab never calls, so `rows.error` is always null here and
   * nothing renders it. That is a real cost and a small one — no query, no socket, one memo
   * per mount — and the alternative is the bucketing above written twice.
   */
  const rows = useDmCharacterRows(code, dmCode)

  /**
   * Which creature each coin stands for, by id.
   *
   * Built over `CHARACTER_GROUPS` rather than over a flat list, because `byGroup` is what
   * the hook hands back and iterating the union is what keeps a fourth group's characters
   * from silently having no name in this list. Memoised on the record, which the hook
   * already holds still until the roster itself changes.
   */
  const charactersById = useMemo(() => {
    const map = new Map<Id<'characters'>, PublicCharacter>()
    for (const group of CHARACTER_GROUPS) {
      for (const character of rows.byGroup[group]) map.set(character._id, character)
    }
    return map
  }, [rows.byGroup])

  return (
    // Not a `TabBody`: this tab is two regions of its own rather than one scrolling column.
    // The bounded height comes from the `TabPane` above, which is the contract that file
    // exists to state — and it is what makes the two `overflow-y-auto`s below scroll inside
    // the pane instead of growing the page.
    <>
      {/* `shrink-0`, like every fixed region in the Sheets tab: a line of explanation that
          gave up its height to a long list would be the first thing to vanish, and it is
          the answer to "why is there a coin in this list I cannot find on the map". */}
      <div className="flex shrink-0 flex-col gap-0.5 border-b p-3">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Every coin in the game
        </h3>
        <p className="text-muted-foreground text-xs">
          Including the ones on your own layer and the ones bound to nothing — this list is the
          only place either is reachable. Picking one here selects it everywhere: the ring on the
          board and the sheet panel follow, and clicking a coin on the map picks the same row.
        </p>
      </div>

      {/* The bounded region, and the four utilities are the whole of the vertical argument —
          the same four the Sheets tab's selector carries, for the reasons written out at
          length there.

          `max-h-64` is the ceiling: however many goblins are in the game, the list stops at
          sixteen rems and scrolls the rest. **No `shrink-0`**, deliberately and unlike the
          header above: on a short pane the editor below claims what is left and what is left
          can be nothing, which would put the Save button and the grant list off the bottom of
          a screen that cannot be scrolled to them. So this region shrinks first and scrolls
          inside a smaller box, and `min-h-16` stops it collapsing to a sliver of scroll bar
          on the way. */}
      <div className="max-h-64 min-h-16 overflow-y-auto border-b p-3">
        {status !== 'playing' ? (
          // Not a skeleton, because nothing is coming: the pane has not asked. See the ⚠️
          // on `status` — the wording follows `MapPanePlaceholder`, which is the sentence
          // the left half of this screen is showing at the same moment.
          <p className="text-muted-foreground text-sm">
            Nothing on the table yet. Coins are listed here once you have put a map on the table
            and pressed <span className="font-medium">Start the game</span> — both under{' '}
            <span className="font-medium">DM tools</span>. Anything you add before then is kept:
            it appears in this list the moment the board does.
          </p>
        ) : tokens === undefined ? (
          // The first frame of a running game, and now only that. Two rows rather than one,
          // matching `DmCharacterRowsSkeleton`, so the gap reads as a list.
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No coins on the board yet. They are added from{' '}
            <span className="font-medium">DM tools → Map setup → Add a token</span>, which needs a
            map on the table first — a coin has to land somewhere. Everything about one after
            that is edited here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <TokenRow
                key={token._id}
                token={token}
                character={
                  token.characterId === null
                    ? null
                    : (charactersById.get(token.characterId) ?? null)
                }
                charactersLoading={rows.loading}
                selected={token._id === selectedToken?._id}
                onSelect={() => onSelectToken(token._id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The editor. ⚠️ **`min-h-64` and not `min-h-0`**, which is the one place in this file
          that departs from the chain the shell documents — and it is the same departure
          `SheetsTab` makes for the same reason. Everywhere else `min-h-0` is what lets a flex
          item scroll instead of pushing its neighbours; here the item *is* the thing being
          pushed, and a zero floor means the list above can squeeze the controls off a short
          screen. Sixteen rems is enough for the first section and the start of the second,
          and it is what makes the list yield first.

          ⚠️ **`key={selectedToken._id}`**, so choosing a different coin remounts the panel
          with that coin's stored values. The appearance form inside holds an explicitly-saved
          draft, and carrying the last coin's half-typed name onto the next one is a data bug
          dressed as a convenience. */}
      <div className="flex min-h-64 flex-1 flex-col overflow-y-auto">
        {selectedToken === null ? (
          <div className="text-muted-foreground flex flex-col gap-2 p-4 text-sm">
            <p>
              Nothing selected. Pick a coin from the list to change what it stands for, who can
              see it, its name, size, colour and art — and who at the table may drag it.
            </p>
            <p>
              A creature chosen from the Sheets tab that has no coin on the board lands here as
              nothing selected too, which is the honest answer: there is no token to edit until
              one is added.
            </p>
          </div>
        ) : (
          <TokenEditPanel
            key={selectedToken._id}
            code={code}
            dmCode={dmCode}
            token={selectedToken}
            byGroup={rows.byGroup}
            loading={rows.loading}
          />
        )}
      </div>
    </>
  )
}

/**
 * One coin, selectable.
 *
 * A `PickerRow` rather than the markup written out again, for that primitive's stated
 * reason: a row assembled from eleven utilities is exactly the thing that drifts one
 * utility at a time until two lists visibly disagree about their own hover state. It draws
 * the chosen state *and* sets `aria-pressed`, which is what stops a row that looks picked
 * from being read as an ordinary button.
 *
 * **The whole row is the button here, unlike `CharacterRow` next door, and the difference
 * is that this row holds no other controls.** That one had to make the *name* the button,
 * because it carries `HpControls` — two buttons and a text input — and a `<button>` wrapped
 * around those is invalid HTML that browsers fix by unnesting, landing the `−` outside the
 * control the DM thought they pressed. There is nothing to nest here: everything a DM does
 * to a coin happens in the editor below, so one clickable thing per gesture is available at
 * the cheaper price.
 *
 * The caption is the one join this tab performs. `publicTokenValidator` carries a
 * `characterId` and never a name — see the ⚠️ on the tab — so the name arrives from
 * `characters.list` and is looked up by the caller, which already holds the map.
 */
function TokenRow({
  token,
  character,
  charactersLoading,
  selected,
  onSelect,
}: {
  token: PublicToken
  /** What the coin stands for, joined by the caller. Null when it is bound to nothing. */
  character: PublicCharacter | null
  /** True until `characters.list` has arrived, so *waiting* is not printed as *nothing*. */
  charactersLoading: boolean
  selected: boolean
  onSelect: () => void
}) {
  const squares = `${token.sizeSquares} ${token.sizeSquares === 1 ? 'square' : 'squares'}`

  // Three states rather than two, because "bound to nothing" and "the roster has not
  // arrived" are different answers and printing the first for the second would tell the DM
  // their coin had come unbound. The fallback is the fourth and should be unreachable:
  // `characters.remove` detaches every token pointing at the character it deletes, so a
  // binding with no row behind it means the two payloads are momentarily out of step.
  const binding =
    token.characterId === null
      ? 'Bound to nothing'
      : charactersLoading
        ? '…'
        : (character?.name ?? 'A sheet that is no longer there')

  return (
    <li>
      <PickerRow className="w-full" selected={selected} onClick={onSelect}>
        <span className="flex w-full items-center gap-2">
          <TokenSwatch name={token.name} tint={token.tint} artUrl={token.artUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{token.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {binding} · {squares}
            </span>
          </span>
          {/* Read straight off the payload, and the only badge on the row: it is the one
              field about a coin whose being wrong spoils something, and a DM scanning this
              list for "what have I left hidden" is scanning for exactly this. */}
          {token.layer === 'dm' ? (
            <Badge variant="destructive" className="ml-auto">
              DM layer
            </Badge>
          ) : null}
        </span>
      </PickerRow>
    </li>
  )
}
