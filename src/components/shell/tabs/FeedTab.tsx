import type { ReactElement } from 'react'

import { DiceComposer } from '@/components/feed/DiceComposer'
import { FeedList } from '@/components/feed/FeedList'
import type { Dm } from '@/hooks/useDm'
import { useFeed } from '@/hooks/useFeed'

export type FeedTabProps = {
  code: string
  /**
   * Whether this browser holds the DM code, and it decides two things here: which lines
   * arrive, and whether the private toggle is offered on the bar above. It authorises
   * neither — `feed.list` re-verifies it server-side on every subscription (invariant 7).
   */
  dm: Dm
}

/**
 * WHAT HAS HAPPENED AT THE TABLE, and the tray for adding to it.
 *
 * The scrollback above and the composer below, in a bounded column so that the list scrolls
 * inside the pane and the tray stays pinned to the bottom of it. That is the same arrangement
 * `CharacterSheetEditor` has and the reason `TabPane` exists as a named contract rather than
 * as a lucky string of classes: this tab supplies its own scrolling body and pins a footer
 * under it, so it takes the bounded height and brings the rest.
 *
 * ⚠️ **`RollModeBar` is deliberately not here.** It is mounted by `RightPane` above *every*
 * tab body, because the mode is sticky and a bar that only appeared on the two tabs that roll
 * would let somebody set advantage, glance at the Table, come back and roll with a modifier
 * they can no longer see they chose.
 *
 * ⚠️ **This is the only reader of `useFeed` in the panel, and the query is a shared cache
 * entry rather than this tab's private one.** The table effects subscribe to the same rows to
 * know when to throw dice over the map, through the same `feedArgs` builder — so the arguments
 * have to match exactly or the two are two subscriptions with two executions of a query that
 * reads the whole character table. `feedArgs` is what makes them agree by construction.
 *
 * **Nothing here filters.** Every line this browser is not allowed to hear about was dropped
 * by one predicate on the server before the payload existed (invariant 1); the panel renders
 * what arrived.
 */
export function FeedTab({ code, dm }: FeedTabProps): ReactElement {
  const rows = useFeed(code, dm.dmCode)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FeedList rows={rows} />
      <DiceComposer />
    </div>
  )
}
