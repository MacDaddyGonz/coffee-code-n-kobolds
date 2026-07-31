import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The list-row shape the lobby cards and the name gate share. Wrap the rows in
 * `<LobbyRows>`, render each as a `<LobbyRow>`, and use `<LobbyRowSkeletons>` for
 * the loading state — `<LobbyRoster>`, `<LobbyCharacters>` and `<NameGate>` all
 * draw the same list and had three copies of these class strings between them.
 */

/** `compact` is the name gate's shorter row; the lobby cards use `default`. */
type LobbyRowSize = 'default' | 'compact'

// Fixed height either way, so loading, empty and populated do not shift the card.
const ROW_SIZES: Record<LobbyRowSize, string> = {
  default: 'min-h-13 py-2',
  compact: 'h-11',
}

export function LobbyRows({ children }: { children: ReactNode }) {
  return <ul className="divide-border flex flex-col divide-y">{children}</ul>
}

export function LobbyRow({
  size = 'default',
  children,
}: {
  size?: LobbyRowSize
  children: ReactNode
}) {
  return (
    <li className={cn('flex items-center justify-between gap-3', ROW_SIZES[size])}>{children}</li>
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
