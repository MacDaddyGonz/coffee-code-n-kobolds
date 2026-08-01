import type { ReactElement } from 'react'
import { memo, useState } from 'react'

import { TabPane } from '@/components/shell/TabPane'
import { DmToolsTab } from '@/components/shell/tabs/DmToolsTab'
import { FeedTab } from '@/components/shell/tabs/FeedTab'
import { SettingsTab } from '@/components/shell/tabs/SettingsTab'
import { SheetTab } from '@/components/shell/tabs/SheetTab'
import { TableTab } from '@/components/shell/tabs/TableTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Dm } from '@/hooks/useDm'
import type { PublicGame } from '@/hooks/useSeat'
import type { Id } from '@convex/_generated/dataModel'

type TabValue = 'feed' | 'sheet' | 'table' | 'dm' | 'settings'

export type RightPaneProps = {
  code: string
  game: PublicGame
  dm: Dm
  playerId: Id<'players'>
  characterId: Id<'characters'> | null
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
 */
export const RightPane = memo(function RightPane({
  code,
  game,
  dm,
  playerId,
  characterId,
  onRenameSeat,
  onLeaveSeat,
}: RightPaneProps): ReactElement {
  // The sheet rather than the feed, because the feed is empty until the dice land and
  // opening a game on an empty panel reads as a broken app.
  const [tab, setTab] = useState<TabValue>('sheet')

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
          <SheetTab
            code={code}
            playerId={playerId}
            dmCode={dm.dmCode}
            characterId={characterId}
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
