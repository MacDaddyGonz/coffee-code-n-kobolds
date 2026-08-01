import type { ReactElement } from 'react'

import { CopyButton } from '@/components/CopyButton'
import { ProfileIcon } from '@/components/ProfileIcon'

export type GameHeaderProps = {
  /** The game's name. */
  name: string
  /** Whoever created the game, which is who the table is being run by. */
  runBy: string
  /** The join code, as the server spells it. */
  code: string
  /** This browser's seat, and what it is playing. Both null until the roster arrives. */
  displayName: string | null
  characterName: string | null
}

/**
 * The bar across the top of a game: which table this is, how to get into it, and who
 * the browser thinks you are.
 *
 * **Presentational, with no subscription of its own.** Everything on it is already
 * held by `useSeat` — the game payload and the seat's own roster row — so a query
 * here would be a second copy of facts the route has resolved, with its own loading
 * state and its own chance to disagree.
 *
 * The right-hand side is the answer to a question the old lobby answered by being a
 * whole screen: *am I signed in as the right person, and is my character attached?*
 * Once the board is permanent there is nowhere else for that to live, and a player
 * who is quietly nobody is a player who cannot move a token and does not know why.
 * That is also why the character line reads as a sentence rather than a bare name —
 * an empty space beside an icon says nothing, and "no character yet" says the thing
 * that needs saying.
 */
export function GameHeader({
  name,
  runBy,
  code,
  displayName,
  characterName,
}: GameHeaderProps): ReactElement {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-2">
      <div className="flex min-w-0 items-baseline gap-3">
        {/* Smaller than it was on the lobby screen. The same words in a bar that is
            permanently on screen are a label rather than a title page, and every
            pixel of header height comes straight off the map below it. */}
        <h1 className="font-heading truncate text-xl font-bold">{name}</h1>
        <p className="text-muted-foreground shrink-0 text-sm">Run by {runBy}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Join code</span>
          <code className="bg-muted rounded px-2 py-1 font-mono tracking-[0.2em]">{code}</code>
          <CopyButton value={code} label="join code" />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {/* `aria-hidden` by its own design — the name it stands for is printed
              immediately beside it, so announcing it would read the same name twice. */}
          <ProfileIcon name={displayName ?? ''} size="sm" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{displayName ?? '…'}</span>
            <span className="text-muted-foreground truncate text-xs">
              {characterName ?? 'no character yet'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
