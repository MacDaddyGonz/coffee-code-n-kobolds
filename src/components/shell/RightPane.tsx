import type { ReactElement } from 'react'
import { memo, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'

import { TabPane } from '@/components/shell/TabPane'
import { DmToolsTab } from '@/components/shell/tabs/DmToolsTab'
import { FeedTab } from '@/components/shell/tabs/FeedTab'
import { SettingsTab } from '@/components/shell/tabs/SettingsTab'
import { SheetTab } from '@/components/shell/tabs/SheetTab'
import { TableTab } from '@/components/shell/tabs/TableTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { tokensArgs } from '@/hooks/useBoard'
import type { Dm } from '@/hooks/useDm'
import type { PublicGame } from '@/hooks/useSeat'
import { sheetFocusOf } from '@/lib/sheetFocus'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

type TabValue = 'feed' | 'sheet' | 'table' | 'dm' | 'settings'

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
 * The tabbed panel beside the map: the feed, this seat's sheet, the table, the DM's
 * tools and the settings.
 *
 * **Controlled rather than uncontrolled**, which costs one `useState` and buys the
 * two things that need it. The Character tab's empty state has a button that sends
 * the reader to the Table tab to pick a character up — a tab body steering the strip
 * above it — and the roll announcement the next milestone brings will want to do the
 * same from the other direction. Radix would happily hold this state; the point is
 * that something else needs to be able to set it.
 *
 * ⚠️ **The Character tab is force-mounted and nothing else is, and that asymmetry is
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
  onRenameSeat,
  onLeaveSeat,
}: RightPaneProps): ReactElement {
  // The sheet rather than the feed, because the feed is empty until the dice land and
  // opening a game on an empty panel reads as a broken app.
  const [tab, setTab] = useState<TabValue>('sheet')

  /**
   * The board's tokens, for the one question this pane has to ask of them: what is
   * the selected token bound to?
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
   */
  const tokens = useQuery(api.board.tokens, tokensArgs(code, dm.dmCode))

  const selectedTokenCharacterId = useMemo(
    () => tokens?.find((token) => token._id === selectedTokenId)?.characterId ?? null,
    [tokens, selectedTokenId],
  )

  // The one place the "whose sheet is on screen" question is asked. `sheetFocusOf`
  // carries the five rules and the reason the player's fallback and the DM's differ.
  const focus = sheetFocusOf({
    selectedCharacterId,
    selectedTokenId,
    selectedTokenCharacterId,
    myCharacterId: characterId,
    isDm: dm.dmCode !== null,
  })

  // A DM standing down takes their own tab off the strip underneath them, and a
  // controlled `Tabs` pointed at a value with no trigger and no content shows an
  // empty pane rather than falling back on its own. Settings is where they will have
  // just been, and is where the way back in lives.
  const active: TabValue = tab === 'dm' && dm.dmCode === null ? 'settings' : tab

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
        <TabsTrigger value="sheet">Character</TabsTrigger>
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
          {/*
            TODO(packages F and G): this tab still takes a single `characterId`,
            which is the shape from before selection existed. The player's Character
            tab and the DM's Sheets tab are owned elsewhere and are what will take
            the `SheetFocus` itself, along with `onSelectToken`, `onSelectCharacter`
            and `onClearSelection` — all three are on `RightPaneProps` already and
            are deliberately left undestructured until there is something here to
            hand them to, because an unread binding does not compile under
            `noUnusedParameters`.

            Until then the focus is collapsed onto the one prop that exists, which
            is enough to make selection visible today: a player selecting a token
            they control sees that creature's sheet, and deselecting puts them back
            on their own, because `sheetFocusOf` answers with `myCharacterId`.

            ⚠️ The fallback to `characterId` is a shim over the two cases the prop
            cannot say. `tokenWithoutSheet` has no character to name — package G
            renders the "this token carries no sheet" copy — and a DM's `none` would
            otherwise blank a sheet the DM can still legitimately be holding, so it
            keeps today's behaviour rather than inventing a third one on the way past.
          */}
          <SheetTab
            code={code}
            playerId={playerId}
            dmCode={dm.dmCode}
            characterId={focus.kind === 'character' ? focus.characterId : characterId}
            onGoToTable={() => setTab('table')}
          />
        </TabPane>
      </TabsContent>

      <TabsContent value="table" className="min-h-0">
        <TabPane>
          <TableTab
            code={code}
            playerId={playerId}
            dm={dm}
            onRenameSeat={onRenameSeat}
            onLeaveSeat={onLeaveSeat}
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
