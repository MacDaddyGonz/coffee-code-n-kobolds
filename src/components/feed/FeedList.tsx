import type { ReactElement } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { ScrollTextIcon } from 'lucide-react'

import { FeedRow } from '@/components/feed/FeedRow'
import { Skeleton } from '@/components/ui/skeleton'
import type { PublicFeedRow } from '@/hooks/useFeed'

/**
 * How close to the bottom still counts as *at* the bottom, in pixels.
 *
 * ⚠️ **Not zero, and a slack rather than an exact test is the whole of what makes this
 * work.** `scrollHeight`, `scrollTop` and `clientHeight` are fractional on a zoomed or
 * fractionally-scaled display, so `scrollTop + clientHeight === scrollHeight` is a comparison
 * that is simply never true on some machines — and the symptom of getting that wrong is a
 * feed that stops following on one person's laptop and nobody else's. A few dozen pixels is
 * also the honest reading of the intent: somebody with the newest line and a bit of the one
 * above it on screen is following the conversation.
 */
const AT_BOTTOM_SLACK = 48

/**
 * THE SCROLLBACK — every line the table has been told about, oldest at the top.
 *
 * **Rendered in the order it arrives.** `visibleFeed` takes the newest sixty off a
 * descending index and reverses them server-side, deliberately, so that the one order a chat
 * panel wants is decided once rather than by every client per render.
 *
 * ⚠️ **It follows the newest line, but only when the reader is already at the bottom.**
 * Scrolling up to check what a monster did two rounds ago and being yanked back down because
 * somebody else rolled a d6 is the bug every chat panel ships once, and it is worse here than
 * in a chat: the thing the reader scrolled up to find is a number they are about to act on.
 * So *pinned* is a fact about where the reader is, recomputed on every scroll event — which
 * includes this component's own programmatic scroll, so following resumes the moment somebody
 * scrolls back down. No state, because nothing on screen depends on it and a `setState` per
 * scroll event would re-render sixty rows to change a boolean nobody draws.
 *
 * **`useLayoutEffect` rather than `useEffect`**, because the rows have to be measured after
 * the DOM has the new one and before the browser paints. With `useEffect` the frame in which
 * a line arrives is painted at the old scroll position and corrected on the next one, which
 * reads as the whole list jumping.
 *
 * Three states, and the difference between the last two is deliberate: `undefined` is an
 * answer in flight and gets skeletons, `[]` is a genuine emptiness and gets a sentence,
 * because a skeleton promises something is coming.
 */
export function FeedList({ rows }: { rows: PublicFeedRow[] | undefined }): ReactElement {
  const scroller = useRef<HTMLDivElement>(null)
  // Starts true so the first frame of a running game opens on the newest line rather than at
  // the top of an hour-old scrollback.
  const pinned = useRef(true)

  useLayoutEffect(() => {
    const node = scroller.current
    if (node === null || !pinned.current) return
    node.scrollTop = node.scrollHeight
  }, [rows])

  const onScroll = () => {
    const node = scroller.current
    if (node === null) return
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight <= AT_BOTTOM_SLACK
  }

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      // `min-h-0` is what lets this scroll instead of pushing the composer below it out of
      // the pane — the same link in the chain `TabPane` and `TabBody` describe. Not `TabBody`
      // itself, because this tab pins a composer under a scrolling region and supplies its
      // own body for that reason, exactly as `CharacterSheetEditor` does.
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {rows === undefined ? (
        <FeedSkeletons />
      ) : rows.length === 0 ? (
        <FeedEmpty />
      ) : (
        // ⚠️ **`mt-auto` rather than `justify-end`**, and the difference is that one of them
        // works. This list is a content-sized flex item, so `justify-end` on it would
        // distribute its own children within a box that is already exactly their height — it
        // does nothing. An auto top margin is what consumes the spare space in the *parent*,
        // so a handful of lines sit against the composer rather than floating at the top of an
        // empty panel, and it resolves to zero once the content overflows and there is no
        // spare space to consume. The newest line is the one being read, so it belongs where
        // the eye already is.
        <ul className="mt-auto flex flex-col gap-0.5 py-1">
          {rows.map((row) => (
            <FeedRow key={row._id} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Nothing has happened yet.
 *
 * The first sentence is the one this tab has carried since it was an empty placeholder, and
 * it is kept because it was right: it describes what the panel is *for*, which is what
 * somebody looking at an empty region needs. What has changed is the second line — there is
 * now something to do about it, and it names both routes rather than only the tray, because
 * clicking an item on a sheet is the one this app is actually built around.
 */
function FeedEmpty(): ReactElement {
  return (
    <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <ScrollTextIcon aria-hidden className="size-6" />
      <p className="text-sm">
        Rolls, damage and everything else that happens at the table will appear here.
      </p>
      <p className="text-xs">Click something on a character sheet, or type dice below.</p>
    </div>
  )
}

/**
 * The shape of a line, three times over, while the first answer is in flight.
 *
 * Laid out as a disc and two bars because that is what a row is: guessing the *shape* of the
 * content is the whole value of a skeleton over a spinner, and it is why these live beside
 * the row they imitate rather than in a shared placeholder. Three rather than sixty, because
 * a wall of grey bars promises a busy evening that may not have happened yet.
 */
function FeedSkeletons(): ReactElement {
  return (
    <div aria-hidden className="flex flex-col gap-2 p-2">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
