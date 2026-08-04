import { memo } from 'react'
import type { ReactElement } from 'react'
import { useQuery } from 'convex/react'

import { useCharactersByGroup } from '@/components/board/dm/CharacterRows'
import { LayerChoice } from '@/components/board/dm/LayerChoice'
import { MISSING_SHEET, TokenEditPanel } from '@/components/board/dm/TokenEditPanel'
import { TokenAddDialog } from '@/components/board/dm/TokenAddDialog'
import { TokenSwatch } from '@/components/board/dm/TokenSwatch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useBoardLayers } from '@/hooks/useBoardLayers'
import { useHiddenFromParty } from '@/hooks/useFog'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { PublicCharacter } from '@convex/lib/characters'
import type { TokenLayer } from '@convex/lib/layers'

/**
 * The badge on a coin's row, or `null` for the layer that needs none. Exhaustive by
 * construction — see CLAUDE.md invariant 9.
 *
 * ⚠️ **Worth the `Record` here specifically**, because of what a DM uses this list for:
 * they scan it asking *what have I left somewhere odd*, and the `layer === 'dm'` test this
 * replaced drew a Background coin with no badge at all — indistinguishable from an ordinary
 * one, in the only list in the application that shows every coin in the game. What a fourth
 * layer would have inherited was not "no badge yet", it was "silently filed as normal".
 *
 * Two words rather than the layer's full label from `TOKEN_LAYER_LABELS`: those are
 * sentences chosen to make a *choice* unambiguous at the moment it is made, and this is a
 * pill at the end of a row that already carries a name, a binding and a size.
 */
const LAYER_BADGES: Record<
  TokenLayer,
  { label: string; variant: 'destructive' | 'secondary' } | null
> = {
  background: { label: 'Scenery', variant: 'secondary' },
  player: null,
  gm: { label: 'GM layer', variant: 'destructive' },
}

/**
 * Held still, so the two states with no coins in them are one dependency rather than a fresh
 * literal per render — which is what `useHiddenFromParty` needs of it below.
 */
const NO_TOKENS: PublicToken[] = []

/**
 * What this tab has been handed about the board's coins: three states, not an array and a
 * status.
 *
 * ⚠️ **The pane hands down the *state* rather than the domain field, and that is the whole
 * point of this union.** `RightPane` already decides whether there is a board to ask about
 * — `game.status === 'playing' ? tokensArgs(…) : 'skip'` — and this tab used to be handed
 * `game.status` so that it could ask the same question again, purely to tell *the pane has
 * not asked* apart from *the answer has not arrived*. Two readers of one `GameStatus` is
 * the shape CLAUDE.md invariant 9 is about, on a screen instead of a secret: a third member
 * of that union would compile fine in both places and quietly fall into the not-started
 * branch here, and the compiler could not say so. Building the union at the one expression
 * that computes `'skip'` means **the pane reads `GameStatus` once and this tab not at all**
 * — no status literal is named in this file, and the two answers cannot drift because there
 * is only one of them.
 *
 * The three members are the three genuinely different things to draw, which is why they
 * carry those names rather than the board's vocabulary:
 *
 * - `notStarted` — the whole of the lobby, where the query is skipped outright. **A real
 *   state rather than a hypothetical, and sharper now that the add button is on this tab**:
 *   `TokenAddDialog` needs a scene on the table rather than a started game, so a DM setting
 *   an ambush up before pressing Start can add coins *from this very panel* that the list
 *   below cannot show. Asking `board.tokens` anyway would mean resolving a signed storage URL
 *   per token for a screen the rest of the shell is not showing either (`MapPane` draws a
 *   placeholder, not a board), so the honest answer is a sentence saying so, in the same
 *   words that placeholder uses.
 * - `loading` — the first frame of a running game, and now only that.
 * - `ready` — every token in the game.
 */
export type TokenListState =
  | { kind: 'notStarted' }
  | { kind: 'loading' }
  | { kind: 'ready'; tokens: PublicToken[] }

export type TokensTabProps = {
  code: string
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string
  /**
   * Every token in the game, from the pane's own `board.tokens` subscription rather than a
   * second one — wrapped in the state above so that *not asked* and *not arrived* are
   * different values here instead of one `undefined` and a second look at `game.status`.
   *
   * ⚠️ **The array is already the whole answer for a DM, and that is why this tab needed
   * no new query.** `board.tokens` is game-scoped through `by_gameId` rather than
   * scene-scoped, so for a caller whose DM code checked out it carries the DM-layer coins
   * *and* the coins standing on no scene at all — the two kinds nothing else in the
   * application can reach. A player's copy of the same query has had the first kind
   * filtered out of it by `maySee` before the payload was assembled (CLAUDE.md
   * invariant 1); nothing here does any filtering, because there is nothing left to filter.
   */
  tokenList: TokenListState
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
  /**
   * A coin the DM has just deleted. Handed to the editor's delete control.
   *
   * ⚠️ **Not `onClearSelection`.** That clears the character pick as well, and a DM who
   * reached this coin from the Sheets selector is still looking at that creature's sheet.
   * `GameShell.forgetToken` carries the full argument, including the `sheetFocusOf` rule
   * that makes a lingering id actively wrong rather than merely untidy.
   */
  onTokenGone: (tokenId: Id<'tokens'>) => void
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
 * **One subscription of its own: `characters.list`, through `useCharactersByGroup`.** The
 * coins arrive from the pane. That hook exists for this tab — taking the whole of
 * `useDmCharacterRows` for the same filing brought a `characters.vitals` subscription with
 * it, so every point of damage in the game re-rendered up to two hundred coin rows and the
 * editor to produce byte-identical output. `{ code, dmCode }` is the cache entry `SheetsTab`
 * already holds either way, so this is one socket and one server-side execution rather than
 * a second.
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
 * subscription would invert CLAUDE.md invariant 2 outright.
 *
 * The consequence to know about is that **this list** still cannot say which map a coin is
 * on, or whether it is on one at all — and that is now a statement about the *list* rather
 * than about the application. The **selected** coin gets a full answer, from
 * `board.placements`, which reads by token: it is invalidated by writes to one coin's
 * placements instead of by every drag on the board, and it is subscribed only while this
 * tab has a coin selected, because `TokenEditPanel` is where it is mounted. The game-wide
 * version — one map of coin → boards, so every row could carry the badge — puts every
 * placement on every scene into the read set of a panel that is open all session, and it is
 * **refused** here rather than merely absent.
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
  tokenList,
  selectedToken,
  onSelectToken,
  onTokenGone,
}: TokensTabProps): ReactElement {
  /**
   * The creature list, for the three things this tab asks of it: the caption on each row,
   * the creature the selected coin stands for, and the options in the editor's rebind
   * select.
   *
   * ⚠️ **`useCharactersByGroup` and not `useDmCharacterRows`.** The hit-point half of that
   * hook is a real `characters.vitals` subscription, and nothing on this screen prints a
   * hit point: the rows print a name and a size, and the editor writes appearance, layer,
   * binding, art and grants. Holding it meant re-rendering the whole tab on every `−5` at
   * the table for identical output. `byGroup` still comes out of exactly one place — that
   * hook — which is the `CHARACTER_GROUPS` bucketing CLAUDE.md invariant 9 argues for, so
   * a fourth group is a compiler question rather than a creature with no row.
   */
  const roster = useCharactersByGroup(code, dmCode)

  /**
   * The map on the table, for the add dialog — which needs a scene because a new coin has
   * to land on one.
   *
   * ⚠️ **`{ code }` and nothing else, which is the whole cost of this subscription.**
   * `useQuery` keys its memo on the serialised arguments, so this is byte-identical to the
   * entry `useBoard` and `MapSetupPanel` already hold: one cache entry, one socket, one
   * server-side execution, and this is a third reader of it rather than a second
   * subscription. That is what made moving the button here free — the alternative, passing
   * the scene down from `RightPane`, would have put a board fact into the props of a pane
   * memoised against a divider that moves sixty times a second.
   */
  const scene = useQuery(api.scenes.active, { code })

  /**
   * Which of these coins the party has lost sight of, for the badge on the row.
   *
   * ⚠️ **The ⚠️ above says this tab is not told where a coin stands, and this does not
   * undo that.** No placement joins the coin list — a row still cannot say which map it
   * is on — and the hook answers about the **active scene only**, which is the honest
   * scope: fog is per map, so a coin parked on last week's dungeon is not standing in the
   * dark, it is standing somewhere else. What it does cost is a `board.positions`
   * subscription while the map has fog on it, and only then; the hook's own docblock
   * carries that trade and the gate that keeps a game which never fogs anything paying
   * nothing at all.
   *
   * A cue and never a filter: every coin in the game is in this list either way, which is
   * the whole reason the list exists.
   *
   * ⚠️ **A set of ids, and the coins go *in* — so the hook is handed this tab's array rather
   * than handing back a predicate over its own.** Its docblock carries the argument; the part
   * that matters here is that the identity of what comes back changes only when a creature
   * crosses a rectangle's edge, which is what lets `TokenRow` below be memoised at all. The
   * empty array is a module constant for the same reason: a fresh literal in the not-ready
   * branch would be a changed dependency on every render of a tab that has nothing to show.
   */
  const hidden = useHiddenFromParty(
    code,
    dmCode,
    tokenList.kind === 'ready' ? tokenList.tokens : NO_TOKENS,
  )

  /**
   * Which creature a coin stands for. **The one place this tab answers that**, for a row
   * and for the selected coin alike.
   *
   * It used to be answered twice: here by the map, and again inside `TokenEditPanel`, which
   * flattened `byGroup` into a fresh array and scanned it on every render for the answer
   * this hash lookup already had. So the panel is handed the resolved creature now.
   *
   * A plain function rather than a memo: `roster.byId` is held still by the hook until the
   * roster itself changes, and this tab is inside `RightPane`'s memo boundary.
   */
  const boundTo = (token: PublicToken) =>
    token.characterId === null ? null : (roster.byId.get(token.characterId) ?? null)

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

      {/*
        MAKING A COIN, in the tab that is about coins.

        ⚠️ **These two lived under DM tools → Map setup, and that was the wrong filing rather
        than a small one.** That panel is where a DM gets a *map* in and lines its grid up;
        the button that creates a creature and the picker deciding which layer it lands on
        are about the thing this tab lists, and a DM looking for *where do coins come from*
        looked here first and found a sentence pointing three clicks away. Nothing was
        re-implemented — both components moved whole.

        `shrink-0` for the header's reason: this is the answer to "how do I add one", and a
        long list must not be able to squeeze it off the top.
      */}
      <div className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            A coin belongs to the game rather than to a map, so one villain can stand on several.
          </p>
          {/* ⚠️ **Three states here rather than a nullable prop on the dialog**, which is
              what keeps `TokenAddDialog` unchanged: it needs a scene for the middle square a
              coin lands on and for its own title, and threading a null through it would put
              four guards inside a component that has a scene in every case it can actually
              run. *Waiting* and *there is no map* are the caller's to tell apart anyway —
              printing "add a map first" for a frame while the answer is in flight is the
              same mistake `TokenPlacementControl` refuses next door. */}
          {scene === undefined ? (
            <Skeleton className="h-8 w-28" />
          ) : scene === null ? (
            <Button size="sm" variant="outline" disabled>
              Add a token
            </Button>
          ) : (
            <TokenAddDialog code={code} dmCode={dmCode} scene={scene} />
          )}
        </div>

        {scene === null ? (
          <p className="text-muted-foreground text-xs">
            No map on the table, and a coin has to land on one. Put one there under{' '}
            <span className="font-medium">DM tools → Map setup</span> and this button wakes up.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label>New tokens land on</Label>
          {/* The add dialog's own picker, so the layers a DM may create on are described in
              the same three sentences wherever the question is asked — and both read the one
              `useBoardLayers` cell, so this and the copy inside the dialog are one setting
              shown twice rather than two to keep in step. Never disabled: nothing here writes
              to the server, so there is never a call in flight to wait out. */}
          <NewTokenLayer code={code} />
        </div>
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
        {tokenList.kind === 'notStarted' ? (
          // Not a skeleton, because nothing is coming: the pane has not asked. See the ⚠️
          // on `TokenListState` — the wording follows `MapPanePlaceholder`, which is the
          // sentence the left half of this screen is showing at the same moment.
          <p className="text-muted-foreground text-sm">
            Nothing on the table yet. Coins are listed here once you have put a map on the table
            and pressed <span className="font-medium">Start the game</span> — both under{' '}
            <span className="font-medium">DM tools</span>. Anything you add before then is kept:
            it appears in this list the moment the board does.
          </p>
        ) : tokenList.kind === 'loading' ? (
          // Two rows rather than one, so the gap reads as a list. `h-14` and not
          // `DmCharacterRowsSkeleton`'s `h-12`, deliberately: a coin's row carries a swatch
          // beside its two lines and is the taller of the two, so borrowing that component
          // would draw a gap the arriving rows then jump out of — and would tie two lists'
          // row heights together for nothing.
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : tokenList.tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No coins yet. <span className="font-medium">Add a token</span> is just above, and
            everything about one after that is edited below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokenList.tokens.map((token) => (
              <TokenRow
                key={token._id}
                token={token}
                character={boundTo(token)}
                charactersLoading={roster.loading}
                hidden={hidden.has(token._id)}
                selected={token._id === selectedToken?._id}
                // The prop straight through rather than an arrow per row: the id comes back
                // out of the row, which is `TokenLayers`' arrangement and is what the memo
                // on `TokenRow` needs to skip anything at all.
                onSelect={onSelectToken}
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
            byGroup={roster.byGroup}
            // Resolved here rather than there, by the same function the rows use — see the
            // note on `boundTo` and the ⚠️ on the panel's own prop.
            bound={boundTo(selectedToken)}
            loading={roster.loading}
            onRemoved={onTokenGone}
          />
        )}
      </div>
    </>
  )
}

/**
 * Which layer the DM's next coin lands on.
 *
 * **Half of what used to be `LayerTools` in `MapSetupPanel`**, and the split is along the
 * line the two halves were always on: *where new coins go* is about coins, and *what this
 * browser paints* is about looking at a map. The second half stayed where it was.
 *
 * Splitting costs nothing because `useBoardLayers` is a module-level subscribable store
 * rather than `useState` — its own docblock says it was written that way precisely because
 * the DM's control, the board's renderer and the add dialog are in three different parts of
 * the screen. A second consumer is what it is for.
 *
 * A local component rather than a file of its own: it is one control over one hook, and this
 * tab is the only thing that will ever mount it.
 */
function NewTokenLayer({ code }: { code: string }) {
  const { active, setActive } = useBoardLayers(code)
  return <LayerChoice layer={active} onChange={setActive} disabled={false} />
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
 *
 * **Memoised, for `TokenCoin`'s reason on a list of the same length.** There can be two
 * hundred of these, and the tab around them re-renders ten times a second for as long as
 * anybody at the table is dragging a coin — the fog cue holds a `board.positions`
 * subscription, and its own docblock calls that the honest price of a cue that is never
 * stale. The price was being paid twice: once for the subscription, and once more for two
 * hundred rows rebuilding a name, a binding and two badges that had not changed. Every prop
 * is a primitive or an identity the caller holds still, `hidden` included, which is what
 * makes the memo more than decoration.
 */
const TokenRow = memo(function TokenRow({
  token,
  character,
  charactersLoading,
  hidden,
  selected,
  onSelect,
}: {
  token: PublicToken
  /** What the coin stands for, joined by the caller. Null when it is bound to nothing. */
  character: PublicCharacter | null
  /** True until `characters.list` has arrived, so *waiting* is not printed as *nothing*. */
  charactersLoading: boolean
  /**
   * Whether the DM's fog has taken this coin off the party's board — answered by the
   * caller, from the same predicate the map's mark uses and the server's filter ran.
   */
  hidden: boolean
  selected: boolean
  /** The id comes back out, so the caller passes one function for the whole list. */
  onSelect: (tokenId: Id<'tokens'>) => void
}) {
  const squares = `${token.sizeSquares} ${token.sizeSquares === 1 ? 'square' : 'squares'}`

  // Three states rather than two, because "bound to nothing" and "the roster has not
  // arrived" are different answers and printing the first for the second would tell the DM
  // their coin had come unbound. The fallback is the fourth and should be unreachable —
  // `MISSING_SHEET` carries the reason, and it is that constant rather than a sentence
  // typed here so that this row and the editor's rebind select say it in one wording.
  const binding =
    token.characterId === null
      ? 'Bound to nothing'
      : charactersLoading
        ? '…'
        : (character?.name ?? MISSING_SHEET)

  const badge = LAYER_BADGES[token.layer]

  return (
    <li>
      <PickerRow className="w-full" selected={selected} onClick={() => onSelect(token._id)}>
        <span className="flex w-full items-center gap-2">
          <TokenSwatch name={token.name} tint={token.tint} artUrl={token.artUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{token.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {binding} · {squares}
            </span>
          </span>
          {/* Both badges answer the same question a DM scans this list with — *what have
              I left somewhere odd* — so they share one right-aligned group rather than
              each claiming `ml-auto`, which would have put the second one wherever the
              first happened to end.

              The layer is read straight off the payload and is the one *field* about a
              coin whose being wrong spoils something or strands it; see the ⚠️ on
              `LAYER_BADGES`. Fog is not a field at all — it is a rectangle crossed with a
              position — and it is the DM's only warning that a creature has gone from the
              party's board, or that a rectangle drawn over a corridor also covered
              somebody standing in it. `outline` rather than `destructive`: fog is
              normally something the DM meant. */}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {hidden ? <Badge variant="outline">Hidden from party</Badge> : null}
            {badge === null ? null : <Badge variant={badge.variant}>{badge.label}</Badge>}
          </span>
        </span>
      </PickerRow>
    </li>
  )
})
