import type { FunctionReturnType } from 'convex/server'

import { ProfileIcon } from '@/components/ProfileIcon'
import { LobbyRow } from '@/components/lobby/LobbyRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Door } from '@/lib/joinDoor'
import { whenCreated } from '@/lib/when'
import { api } from '@convex/_generated/api'

/**
 * One row of the landing page's list, taken from the server's own payload rather
 * than spelled out again. `games.list` returns a shape derived with `.omit()` from
 * `publicGameValidator`, so the fields it carries are decided in one place on the
 * server and reading them through `FunctionReturnType` is what stops a local
 * interface from claiming a `code` this payload deliberately does not have.
 */
export type GameListing = FunctionReturnType<typeof api.games.list>[number]

export type GameListRowProps = {
  game: GameListing
  onJoin: (game: GameListing, door: Door) => void
}

/**
 * A game, and the two doors into it.
 *
 * **Two buttons rather than one and a choice inside**, because they are two
 * different arrivals rather than two settings of one: a player is asked which seat
 * they are and a DM is asked for a second code, and there is no step the two share
 * past the join code. Putting the fork on the row means the door is chosen before
 * anything has been typed, which is also what lets the dialog know from its first
 * frame which question it is asking.
 *
 * *Join as player* is the default variant and *Join as DM* an outline one, which is
 * the ordinary reading of these two variants — most arrivals at most rows are
 * players, and exactly one person per game is ever the other thing.
 *
 * The sub-line is `run by X · when`, and the creator's name is on the row twice on
 * purpose: once as the disc, which is a way of recognising a name you can already
 * read, and once in words, because the disc carries two letters and `aria-hidden`.
 * The disc takes `createdByName` rather than the game's name so that the same person
 * is the same colour here as in every roster they appear in — that consistency is
 * `ProfileIcon`'s whole reason for generating rather than uploading.
 *
 * ⚠️ **There is no join code anywhere in this row, and none is available to put
 * there.** `games.list` omits it deliberately: a row says a game exists, and the
 * code is still what admits you to it. That is why both doors open with a code step
 * — the row is an aid to remembering which game you meant, not a credential.
 */
export function GameListRow({ game, onJoin }: GameListRowProps) {
  return (
    <LobbyRow>
      <div className="flex min-w-0 items-center gap-2">
        <ProfileIcon name={game.createdByName} size="sm" />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{game.name}</span>
            {/* `secondary` for both states rather than a colour per state: neither
                "in play" nor "in the lobby" is a warning or a success, and a
                variant that implied either would be reading something into the
                status that the server does not mean by it. */}
            <Badge variant="secondary">
              {game.status === 'playing' ? 'In play' : 'In the lobby'}
            </Badge>
          </div>
          <span className="text-muted-foreground truncate text-xs">
            {/* `Date.now()` in the render is the right call rather than a shortcut:
                `whenCreated` takes the instant as an argument so it can be tested,
                and what it produces is a rough age that nothing needs to watch tick
                over. A row that re-rendered once a minute to turn `4 minutes ago`
                into `5 minutes ago` would be paying a subscription's price for a
                sentence nobody is reading twice. */}
            run by {game.createdByName} · {whenCreated(game._creationTime, Date.now())}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Both labels repeat on every row, so the game they belong to has to be in
            the accessible name or the list is a column of identical buttons to
            anybody not looking at the row it sits in. Same reasoning, and the same
            fix, as the seat picker's "That's me". */}
        <Button
          type="button"
          size="sm"
          aria-label={`Join ${game.name} as a player`}
          onClick={() => onJoin(game, 'player')}
        >
          Join as player
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Join ${game.name} as the DM`}
          onClick={() => onJoin(game, 'dm')}
        >
          Join as DM
        </Button>
      </div>
    </LobbyRow>
  )
}
