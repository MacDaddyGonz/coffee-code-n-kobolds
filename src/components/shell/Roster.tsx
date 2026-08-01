import type { ReactElement } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { ProfileIcon } from '@/components/ProfileIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { api } from '@convex/_generated/api'

type RosterProps = {
  code: string
  className?: string
}

/** One seat, exactly as the server projects it — character name included. */
type RosterSeat = FunctionReturnType<typeof api.players.list>[number]

/**
 * Who is at the table, as a strip of profile icons in the corner of the board.
 *
 * The character's name is printed and the person's is on hover, which is the
 * inversion the screen asks for on purpose: at the table you address the character,
 * and you need the human's name only occasionally.
 *
 * **It positions nothing itself.** The caller passes `absolute right-3 bottom-3`
 * through `className`, for the same reason `ZoomControls` does — only whoever
 * renders it knows where the canvas edges are.
 *
 * **And it shrink-wraps.** No fixed width, no wrapper box reserving a column: the
 * lesson the DM tools overlay wrote down is that anything which swallows a click
 * over the canvas is a token the DM cannot pick up, with no visible reason why. An
 * empty box that merely reserves space for six icons is that bug in its least
 * visible form, because nothing is drawn where the clicks are going. So the only
 * thing here that takes the pointer is a seat button.
 */
export function Roster({ code, className }: RosterProps): ReactElement | null {
  // Exactly these arguments and no others. `useSeat` already subscribes to
  // `players.list` with `{ code }`, so Convex serves both from one cache entry over
  // one socket. Adding `dmCode` out of habit — nothing here is DM-gated; the roster
  // is public — would make this a genuinely different subscription returning
  // identical rows, and the cost of that is invisible until you look for it.
  const seats = useQuery(api.players.list, { code })

  // Nothing at all while it loads, rather than skeleton discs. Three grey circles
  // appearing and vanishing over the map on every load is noise for a strip nobody
  // is waiting on — the lobby roster earns its skeletons because it *is* the screen.
  if (seats === undefined) return null

  return (
    <div
      className={cn(
        // Wraps *upward*. On a bottom-anchored element `flex-wrap-reverse` is what
        // makes the second row stack above the first rather than off the bottom
        // edge of the board; `justify-end` keeps the strip against the right-hand
        // side as it grows. Twelve seats at this cap is two rows of six, and past
        // that it scrolls inside its own height rather than climbing the map.
        //
        // Shrinking the discs as the count grows was rejected. It would make the
        // same person a different size in a party of four and a party of ten, and
        // the icon's whole promise is that it is identical everywhere — a size that
        // encodes how many other people are in the game is one more thing the eye
        // has to discount before it recognises anybody.
        'flex max-h-[45%] max-w-[min(28rem,calc(100%-1.5rem))] flex-wrap-reverse justify-end gap-x-2 gap-y-1 overflow-y-auto',
        className,
      )}
    >
      {/*
        The server's own order — join order, oldest first — and deliberately not
        DM-first. A strip whose positions never move is a strip people learn, so
        somebody joining late must not shuffle everyone else along; and the DM is
        already marked, so sorting them to the front would buy nothing and cost that.
      */}
      {seats.map((seat) => (
        <RosterSeatButton key={seat._id} seat={seat} />
      ))}
    </div>
  )
}

/**
 * One seat.
 *
 * **A `<button>` rather than a `<span>`, and that is an accessibility decision, not
 * a styling one.** A Radix tooltip opens on hover *and* on focus, and a span is not
 * focusable — so a roster built out of spans would be a roster reachable only with a
 * mouse, where the display names simply could not be read at all by keyboard.
 *
 * It has **no `onClick` this milestone**: a read-only view of another player's sheet
 * has deliberately not been done, so the tooltip *is* the action. The button exists
 * to make that action reachable, which is the whole of its job.
 */
function RosterSeatButton({ seat }: { seat: RosterSeat }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex w-16 shrink-0 cursor-default flex-col items-center gap-1 rounded-md p-1 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <ProfileIcon
            name={seat.displayName}
            size="md"
            // The DM gets a ring, not a `Badge`. A badge is the existing vocabulary
            // in the lobby roster and the DM bar, and it is the wrong tool at this
            // size: the word is unreadable pinned to a 40px disc, and shrinking it
            // until it fits makes it a coloured smudge. Nothing is conveyed by
            // colour alone either — the tooltip below says it in words.
            className={seat.isDm ? 'ring-primary ring-2 ring-offset-2 ring-offset-background' : undefined}
          />
          {/*
            Copied verbatim from the lobby roster, wording included. Two spellings of
            one state is how they drift, and this is the same state.
          */}
          <span className="text-muted-foreground max-w-full truncate text-[0.625rem] leading-tight">
            {seat.characterName ?? 'no character yet'}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {seat.isDm ? `${seat.displayName} — running the game` : seat.displayName}
      </TooltipContent>
    </Tooltip>
  )
}
