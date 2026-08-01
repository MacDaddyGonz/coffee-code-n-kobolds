import type { ReactElement } from 'react'
import { memo, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'

import { TabPane } from '@/components/shell/TabPane'
import { DmToolsTab } from '@/components/shell/tabs/DmToolsTab'
import { FeedTab } from '@/components/shell/tabs/FeedTab'
import { SettingsTab } from '@/components/shell/tabs/SettingsTab'
import { SheetTab } from '@/components/shell/tabs/SheetTab'
import { SheetsTab } from '@/components/shell/tabs/SheetsTab'
import { TableTab } from '@/components/shell/tabs/TableTab'
import { TokensTab } from '@/components/shell/tabs/TokensTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { tokensArgs } from '@/hooks/useBoard'
import type { Dm } from '@/hooks/useDm'
import type { PublicGame } from '@/hooks/useSeat'
import { sheetFocusOf } from '@/lib/sheetFocus'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

// `'sheet'` is deliberately one value for two panels — see the ⚠️ on the component — and
// `'tokens'` and `'dm'` are the two that exist only for a DM. Which of the six a player
// never sees is not read off this union but off `DM_ONLY_TABS` below.
type TabValue = 'feed' | 'sheet' | 'tokens' | 'table' | 'dm' | 'settings'

/**
 * The tabs that are only on a DM's strip.
 *
 * A `Set` rather than two comparisons, so that the trigger, the content and the stand-down
 * fallback cannot come to disagree about which tabs vanish when a DM stands down. The
 * failure it prevents is specific and was already possible with one member: a `TabValue`
 * that has a conditional trigger and *not* an entry here leaves a controlled `Tabs` pointed
 * at a value with no trigger and no content, which Radix renders as an empty pane rather
 * than falling back on its own.
 */
const DM_ONLY_TABS = new Set<TabValue>(['tokens', 'dm'])

export type RightPaneProps = {
  code: string
  game: PublicGame
  dm: Dm
  playerId: Id<'players'>
  /** The character this seat is playing, or null. Not necessarily the one on screen. */
  characterId: Id<'characters'> | null
  /**
   * The shell's selection and the three ways to change it. ⚠️ **Primitives and
   * stable callbacks, never a selection object** — this component is memoised
   * against a pane width that changes sixty times a second; see the memo note below
   * and the longer one in `GameShell`.
   */
  selectedTokenId: Id<'tokens'> | null
  selectedCharacterId: Id<'characters'> | null
  onSelectToken: (tokenId: Id<'tokens'>) => void
  onSelectCharacter: (characterId: Id<'characters'>, tokenId: Id<'tokens'> | null) => void
  onClearSelection: () => void
  onRenameSeat: (displayName: string) => Promise<void>
  onLeaveSeat: () => Promise<void>
}

/**
 * The tabbed panel beside the map: the feed, this seat's sheet, the DM's coins, the
 * table, the DM's tools and the settings.
 *
 * ⚠️ **Two of the six are the DM's, and both are conditional in three places** — the
 * trigger, the `TabsContent`, and `DM_ONLY_TABS` above, which is what the stand-down
 * fallback reads. Adding a third means all three; missing the third leaves a DM who
 * stands down looking at an empty pane.
 *
 * **Controlled rather than uncontrolled**, which costs one `useState` and buys the
 * two things that need it. The Character tab's empty state has a button that sends
 * the reader to the Table tab to pick a character up — a tab body steering the strip
 * above it — and the roll announcement the next milestone brings will want to do the
 * same from the other direction. Radix would happily hold this state; the point is
 * that something else needs to be able to set it.
 *
 * ⚠️ **The second tab is split by role, and it is *instead of* rather than *as well
 * as*.** A player gets **Character** — their own sheet, and whatever they have been
 * granted. The DM gets **Sheets** — every creature in the game, with the selector and
 * the three creation routes. The DM does not play a character (`docs/roadmap.md`'s
 * vocabulary table is explicit), so a Character tab on their strip is a tab offering
 * something they cannot have, which is exactly where the old *Pick a character* button
 * in the DM's sheet panel came from.
 *
 * **Both keep the tab value `sheet`**, deliberately, and only the trigger's label and
 * the mounted component differ. The force-mount arrangement below is written against
 * that one value; two values would be two panels to force-mount, two `data-state`
 * selectors and a stored tab that means different things to different people. The
 * split is a branch in one place rather than a second tab.
 *
 * ⚠️ **The sheet tab is force-mounted and nothing else is, and that asymmetry is
 * the whole of the thinking here.** Radix unmounts an inactive tab, which is right for
 * every other one: the DM tools tab holds a drawer per character row and the bestiary
 * picker, and those genuinely should go away with the tab. But
 * `CharacterSheetEditor` holds an explicitly-saved draft in `useState`, so glancing at
 * the feed for two seconds would **silently destroy a half-edited sheet** — a
 * data-loss bug this layout would otherwise have introduced, and one that would be
 * blamed on the save button rather than on the tab strip. The cost is one extra
 * low-churn `characters.sheet` subscription held open; the vitals subscription beside
 * it is already held by `useBoard` on the same cache entry.
 *
 * ⚠️ **`forceMount` does not hide anything, and hiding it is therefore ours to do.**
 * This was got wrong first time and found in a browser rather than by a test, which is
 * worth recording because the mistake is so reasonable. Radix computes
 * `present = forceMount || isSelected` and renders `hidden={!present}` — so with
 * `forceMount` set, `present` is *always* true and the `hidden` attribute is **never**
 * applied. The prop means "keep this in the DOM and let the caller decide what to do
 * with it", which is what an animation library wants; on its own it simply leaves the
 * inactive panel on screen, stacked under the active one. The symptom was the
 * character sheet visible below the feed on every tab.
 *
 * So the panel is hidden explicitly, off the `data-state` Radix does set. That is also
 * the sturdier arrangement: it does not depend on the user-agent `[hidden]` rule, which
 * a Tailwind display utility on the same element would out-specify from the author
 * stylesheet — the trap this comment used to describe as though it were the live one.
 * `display: none` keeps the subtree mounted and its subscriptions open, which is the
 * whole point, while taking it out of layout completely.
 *
 * ⚠️ **Memoised for the same reason `MapPane` is**: the divider's width lives in
 * `GameShell`'s state and a drag sets it on every pointer move, so without this each
 * frame reconciles this whole panel — the force-mounted character sheet included,
 * with both of its entry lists and every row in them — to produce exactly what was
 * there before. Nothing in here reads the width. Every prop is stable across the
 * parent's re-renders, so the memo holds.
 *
 * ⚠️ **Selection is the second piece of `GameShell` state and arrives as primitives
 * for exactly that reason.** Two ids and three `useCallback([])` handlers: the ids
 * change only when the selection genuinely does, and the handlers never change. A
 * single `{ tokenId, characterId }` prop would be a new object on every frame of a
 * divider drag and would defeat this memo entirely — and the symptom, a panel
 * reconciling sixty times a second, points at nothing in particular in a profiler.
 * The `SheetFocus` built below is an object and is deliberately built *inside* the
 * boundary, where a fresh identity per render costs nothing.
 */
export const RightPane = memo(function RightPane({
  code,
  game,
  dm,
  playerId,
  characterId,
  selectedTokenId,
  selectedCharacterId,
  // ⚠️ **`onSelectToken` is read now, and the reader is the one this door was left open
  // for.** It used to sit on the props type undestructured, on the reasoning that every
  // selection a *panel* makes names a creature — the DM's selector calls
  // `onSelectCharacter` with whatever coin that creature happens to have — while picking a
  // bare token was the map's gesture. The Tokens tab is a list of coins, so picking one is
  // exactly the map's gesture arriving in a panel: it writes a token id and clears the
  // direct character pick, which is what lets `sheetFocusOf` resolve the sheet from the
  // binding rather than pinning the panel to a creature the next click would contradict.
  //
  // Nothing was threaded through `GameShell` to make that work, which is the point: it has
  // handed both panes the same three handlers since selection moved up there.
  onSelectToken,
  onSelectCharacter,
  onClearSelection,
  onRenameSeat,
  onLeaveSeat,
}: RightPaneProps): ReactElement {
  // The sheet rather than the feed, because the feed is empty until the dice land and
  // opening a game on an empty panel reads as a broken app.
  //
  // ⚠️ **And the sheet rather than the *table*, which is the improvement somebody will
  // reasonably try to make.** A brand-new player has no character, so this opens on the
  // Character tab's empty state — which looks like the wrong tab to have chosen and is
  // the right one: that empty state is one click from the list (`onGoToTable`), and the
  // claim comes straight back here (`onClaimed` below), so the whole route is *one* click
  // away from the sheet the reader wants. Defaulting to Table makes it two, and does it
  // by putting every returning player — who has a character and came to look at it — on a
  // roster they did not ask for. The first-run case is not the common case, and it is
  // already the shorter path.
  const [tab, setTab] = useState<TabValue>('sheet')

  /**
   * The board's tokens. Two readers now, and they are the two shapes of question this
   * pane asks about a coin: *what is the selected one bound to*, which decides the focus
   * below, and *what coins are there at all*, which is the whole of the DM's Tokens tab.
   * One subscription answers both, which is why that tab needed no query of its own.
   *
   * ⚠️ **`tokensArgs` rather than a literal, and that is not tidiness.** `useQuery`
   * keys its memo on `JSON.stringify(convexToJson(args))`, so an argument object of
   * the same *shape* as `useBoard`'s is genuinely the same subscription — one cache
   * entry, one socket, one server-side execution — while `{ code, dmCode: undefined }`
   * beside `{ code }` would be a second. `Roster.tsx:37-42` documents the same
   * arrangement for `players.list` and is the precedent.
   *
   * `board.tokens` is the low-churn half of the board deliberately (invariant 2):
   * positions live in their own query, so nobody's drag re-renders this panel.
   *
   * ⚠️ **Skipped until the game is running.** In the lobby there is no board to select
   * from and nothing here reads the array — but the query is not free to ask: it
   * resolves a signed storage URL per token, server-side, for a payload with no reader.
   * Every consumer below already handles `undefined`, because it is what the first
   * frame of a running game looks like anyway. `MapPane` mounts `Board` on the same
   * condition (plus an active scene), so this either shares that subscription's cache
   * entry or is the only holder of it, never a second one.
   */
  const tokens = useQuery(
    api.board.tokens,
    game.status === 'playing' ? tokensArgs(code, dm.dmCode) : 'skip',
  )

  /**
   * The selected token, found **once for the whole panel**.
   *
   * Three facts hang off it: what it is bound to decides the focus below, its name is
   * what the player's tab prints when it is bound to nothing, and it is the coin the
   * DM's grant panel edits. All three used to `find` it separately — here, in
   * `SheetsTab`'s `grantToken`, and again in `SheetRegion` — over the same array for
   * the same answer, because only the *id* was passed down.
   *
   * ⚠️ So the token goes down, not the id. Handing a fresh object across this boundary
   * would normally be the thing the memo note above forbids; it is safe precisely
   * because `SheetsTab` is *inside* the boundary, where identity costs nothing — and
   * the identity is stable regardless, since this is an element of the query's own
   * array rather than a new object.
   */
  const selectedToken = useMemo(
    () => tokens?.find((token) => token._id === selectedTokenId) ?? null,
    [tokens, selectedTokenId],
  )

  // The one place the "whose sheet is on screen" question is asked. `sheetFocusOf`
  // carries the five rules and the reason the player's fallback and the DM's differ.
  const focus = sheetFocusOf({
    selectedCharacterId,
    selectedTokenId,
    selectedTokenCharacterId: selectedToken?.characterId ?? null,
    myCharacterId: characterId,
    isDm: dm.dmCode !== null,
  })

  // A DM standing down takes *both* of their tabs off the strip underneath them, and a
  // controlled `Tabs` pointed at a value with no trigger and no content shows an
  // empty pane rather than falling back on its own. Settings is where they will have
  // just been, and is where the way back in lives.
  //
  // Read through `DM_ONLY_TABS` rather than as `tab === 'dm' || tab === 'tokens'`, so that
  // the next tab added to the DM's strip is one edit rather than a chain somebody extends
  // in two places out of three. The Sheets tab is deliberately *not* a member: it shares
  // the value `sheet` with the player's Character tab, so a DM standing down on it stays on
  // a trigger that still exists and simply finds a different panel under it.
  const active: TabValue = DM_ONLY_TABS.has(tab) && dm.dmCode === null ? 'settings' : tab

  return (
    // `min-h-0` on the tabs root, one of six links in the chain: this is a flex item
    // of the aside *and* a flex column of its own, so without it the tab bodies push
    // it taller than the pane instead of scrolling inside it.
    <Tabs
      value={active}
      onValueChange={(next) => setTab(next as TabValue)}
      className="min-h-0 flex-1 gap-0"
    >
      {/* `w-full` rather than the primitive's `w-fit`, so the strip is the top edge
          of the pane and not a pill floating in it — and `shrink-0`, because a strip
          that gave up height to a long tab body would be the first thing to vanish. */}
      <TabsList className="w-full shrink-0 rounded-none border-b">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        {/* One trigger, two names. See the ⚠️ above: the value is shared so that the
            force-mounted body below stays one panel, and the label is the only thing
            that says which of the two people at this table is reading it. */}
        <TabsTrigger value="sheet">{dm.dmCode !== null ? 'Sheets' : 'Character'}</TabsTrigger>
        {/* **Beside Sheets, and that placement is the point rather than an accident.** The
            two are the same list read from opposite ends — Sheets reaches every creature and
            asks which coin it stands on, this reaches every coin and asks which creature it
            stands for — so a DM who cannot find something in one looks in the other. Sitting
            them next to each other is what makes that the obvious move. Narrowed on the code
            for the same reason *DM tools* is: a trigger that is not rendered is not a
            permission either way, and every call behind it re-verifies the code
            server-side. */}
        {dm.dmCode !== null ? <TabsTrigger value="tokens">Tokens</TabsTrigger> : null}
        <TabsTrigger value="table">Table</TabsTrigger>
        {dm.dmCode !== null ? <TabsTrigger value="dm">DM tools</TabsTrigger> : null}
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* Every `TabsContent` below is `min-h-0` and block-level, and every body is
          wrapped in a `TabPane`. Both halves of that are explained above. */}
      <TabsContent value="feed" className="min-h-0">
        <TabPane>
          <FeedTab />
        </TabPane>
      </TabsContent>

      {/* `data-[state=inactive]:hidden` is what actually takes this off screen —
          `forceMount` only keeps it mounted. See the note above. */}
      <TabsContent
        value="sheet"
        forceMount
        className="min-h-0 data-[state=inactive]:hidden"
      >
        <TabPane>
          {/* The role split, and the only branch it costs. `SheetFocus` is computed
              once above and handed to whichever of the two is mounted, so the two
              panels cannot come to disagree about whose sheet is on screen — which
              is the whole reason `sheetFocusOf` is a function rather than three
              expressions (see its ⚠️ on the four readers).

              Narrowed on the code rather than on a boolean so the DM's panel takes
              the value its queries need. Rendering it is a display decision and not
              a permission: every call inside re-verifies the code server-side
              (invariant 7). */}
          {dm.dmCode !== null ? (
            <SheetsTab
              code={code}
              dmCode={dm.dmCode}
              focus={focus}
              tokens={tokens}
              selectedToken={selectedToken}
              onSelectCharacter={onSelectCharacter}
              onClearSelection={onClearSelection}
            />
          ) : (
            <SheetTab
              code={code}
              playerId={playerId}
              focus={focus}
              // The seat's *own* character, which is not necessarily the one on
              // screen: `focus` may be pointing at a creature the DM has granted
              // them. This is only for the empty state's copy — "you are not
              // playing a character yet" — and for nothing else.
              characterId={characterId}
              selectedTokenName={selectedToken?.name ?? null}
              onGoToTable={() => setTab('table')}
            />
          )}
        </TabPane>
      </TabsContent>

      {/* Narrowed on the code rather than on a boolean, exactly as *DM tools* below is, so
          the panel takes the value its four mutations need. Not force-mounted, unlike the
          sheet above: the appearance form inside holds a draft, but it is one field per coin
          rather than a whole sheet, and the panel is deliberately remounted per selection
          anyway — so keeping it alive across a glance at the feed would preserve a draft the
          next click was going to discard. */}
      {dm.dmCode !== null ? (
        <TabsContent value="tokens" className="min-h-0">
          <TabPane>
            <TokensTab
              code={code}
              dmCode={dm.dmCode}
              // ⚠️ **The pane's own array, not a second subscription.** `board.tokens`
              // resolves a signed storage URL per token server-side, and `{ code, dmCode:
              // undefined }` beside `{ code }` would be a second cache entry for the same
              // rows — the note on the query above is the long version. Handing the array
              // (and the token below) across this boundary is free because both are *inside*
              // the memo: what must stay primitive is what crosses into this component from
              // `GameShell`, not what leaves it for a child.
              tokens={tokens}
              // Which is why the status has to travel with it: the array above is `undefined`
              // both when the query has not answered *and* when it was never asked, and only
              // one of those two is worth a skeleton. This is the same condition the `useQuery`
              // above skips on, handed to the one reader that has to be able to tell the
              // difference.
              status={game.status}
              selectedToken={selectedToken}
              // The map's own gesture, threaded through at last — see the note at the
              // destructuring above. A row in this list is a coin, so picking one writes a
              // token id and clears the direct character pick, which is what makes this tab,
              // the board and the sheet panel agree about what is being talked about.
              onSelectToken={onSelectToken}
            />
          </TabPane>
        </TabsContent>
      ) : null}

      <TabsContent value="table" className="min-h-0">
        <TabPane>
          <TableTab
            code={code}
            playerId={playerId}
            dm={dm}
            onRenameSeat={onRenameSeat}
            onLeaveSeat={onLeaveSeat}
            // The other half of the route the empty state above starts, and **the second
            // reason this tab strip is controlled state**: the docblock's own words are
            // that "Radix would happily hold this state; the point is that something else
            // needs to be able to set it". `onGoToTable` was the first thing that needed
            // to; a claim landing is the return leg, and it closes the loop rather than
            // opening a new one. A new player picks up a character and is put in front of
            // the two dropdowns that finish it, instead of being left on a list whose job
            // is done.
            //
            // Unbranched, and the shared tab value is why that is fine: `'sheet'` is the
            // DM's Sheets tab as well as a player's Character tab, so a DM who picks up a
            // character from here — something the model says they do not do, and nothing
            // forbids — lands on their own panel rather than on a value with no trigger.
            // Branching on `dm.dmCode` would be a second answer to a question the shared
            // value already answers.
            onClaimed={() => setTab('sheet')}
          />
        </TabPane>
      </TabsContent>

      {/* Narrowed on the code rather than on a boolean, so the panel below takes the
          value its queries need. A trigger that is not rendered is not a permission
          either way — invariant 7 is settled server-side on every call inside. */}
      {dm.dmCode !== null ? (
        <TabsContent value="dm" className="min-h-0">
          <TabPane>
            <DmToolsTab code={code} dmCode={dm.dmCode} game={game} />
          </TabPane>
        </TabsContent>
      ) : null}

      <TabsContent value="settings" className="min-h-0">
        <TabPane>
          <SettingsTab code={code} dm={dm} />
        </TabPane>
      </TabsContent>
    </Tabs>
  )
})
