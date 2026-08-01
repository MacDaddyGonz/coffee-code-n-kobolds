import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The list-row shape the lobby cards, the seat picker and the landing page share.
 * Wrap the rows in `<LobbyRows>`, render each as a `<LobbyRow>`, and use
 * `<LobbyRowSkeletons>` for the loading state — `<LobbyRoster>`,
 * `<LobbyCharacters>`, `<SeatPicker>` and `<GameList>` all draw the same list and
 * had three copies of these class strings between them before this existed.
 *
 * `<GameList>` is the first consumer outside a game, which is worth naming because it
 * is what settled the shape as *a list row* rather than *a lobby row*: an icon, a
 * name, a badge, a sub-line and a control or two on the right is the same furniture
 * whether the thing listed is a seat, a character or a whole game.
 */

/**
 * One height, and there used to be two. The second — `compact`, `h-11` — was the name
 * gate's shorter seat row, and the name gate now renders `SeatPicker`'s ordinary ones,
 * which left a `Record` over a two-member union with nothing rendering the other member.
 * That is worth deleting rather than keeping for later: a `Record` over a union is this
 * codebase's strongest "a new member must be handled" signal (CLAUDE.md invariant 9),
 * and spending it on a variant nothing draws teaches the next reader to skim past it.
 *
 * The height is fixed rather than intrinsic so loading, empty and populated do not shift
 * the card they sit in — which is why the skeletons and the empty row below are here too.
 */
const ROW = 'min-h-13 py-2'

export function LobbyRows({ children }: { children: ReactNode }) {
  return <ul className="divide-border flex flex-col divide-y">{children}</ul>
}

export function LobbyRow({ children }: { children: ReactNode }) {
  return <li className={cn('flex items-center justify-between gap-3', ROW)}>{children}</li>
}

/**
 * The "nothing here yet" row, for a list query that came back empty.
 *
 * It wraps itself in `<LobbyRows>` for the same reason `LobbyRowSkeletons` does: the
 * three arms of a caller's loading/empty/populated ternary are then three components,
 * and the empty one cannot be given the wrong text size or lose its list wrapper on the
 * way past. Two consumers arrived within one milestone having independently written the
 * identical `<LobbyRows><LobbyRow><span className="text-muted-foreground text-sm">`, on
 * two screens, from two directions — which is precisely the drift the skeletons were
 * extracted to stop, happening again one component along.
 *
 * The two older consumers still print a bare `<p className="text-muted-foreground">`
 * instead, deliberately left alone: theirs are two-line sentences that read better
 * unboxed, and rewrapping them is a visual change rather than a de-duplication.
 */
export function LobbyRowEmpty({ children }: { children: ReactNode }) {
  return (
    <LobbyRows>
      <LobbyRow>
        <span className="text-muted-foreground text-sm">{children}</span>
      </LobbyRow>
    </LobbyRows>
  )
}

/** Placeholder rows while a list query is still in flight. */
export function LobbyRowSkeletons({ rows }: { rows: number }) {
  return (
    <LobbyRows>
      {Array.from({ length: rows }, (_, row) => (
        <LobbyRow key={row}>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-24" />
        </LobbyRow>
      ))}
    </LobbyRows>
  )
}
