import { useState } from 'react'
import { useQuery } from 'convex/react'

import { LobbyRowEmpty, LobbyRowSkeletons, LobbyRows } from '@/components/lobby/LobbyRow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Door } from '@/lib/joinDoor'
import { api } from '@convex/_generated/api'
import type { GameListing } from './GameListRow'
import { GameListRow } from './GameListRow'
import { JoinDoorDialog } from './JoinDoorDialog'

/**
 * The games on the deployment, newest first, each with a player door and a DM door.
 *
 * This is the answer to "you cannot find a game you have already made": before it,
 * `games.getByCode` was a point lookup and a returning DM had nothing to go on but a
 * six-character code they may not have written down anywhere.
 *
 * **`useQuery(api.games.list, {})` — no arguments, and the emptiness is the design.**
 * Every argument is an axis of the query cache key, so a limit or a filter chosen
 * here would fragment one shared subscription into one entry per value a browser
 * happened to send. `{}` is a single cache entry and a single server execution shared
 * by every browser on this page, and the bound lives on the server as
 * `MAX_GAMES_ON_LANDING` where a client cannot move it.
 *
 * ⚠️ **The payload carries no join code**, deliberately, so nothing in this card can
 * admit anybody to anything: a row says a game exists and the code is still what gets
 * you in. That is why both doors open with a code step, and it is why the *Join with a
 * code* card below is not made redundant by this list — the cap is real, and a game
 * off the end of it is still perfectly joinable.
 *
 * **One dialog for the whole list rather than one per row.** The row reports which
 * door was clicked and this component holds the pair; the dialog reads `opening ===
 * null` as closed and resets everything typed into it on the way out, so consecutive
 * opens cannot inherit a code from the row before.
 *
 * The card below the list holds a *second* instance of the same dialog, opened with no
 * row at all. That is deliberate rather than a missed chance to share this one — see
 * `JoinGamePanel` for why the state is not hoisted up to `Home`.
 */
export function GameList() {
  const games = useQuery(api.games.list, {})

  /**
   * Which row's door is open. One piece of state rather than two, because "no game"
   * and "no door" are not separately reachable — the dialog is opened by a click that
   * names both at once, and a `door` left over from the last open would be a state
   * with nothing on screen to explain it.
   *
   * Non-null `game`, unlike the prop it feeds, which accepts a null one for the
   * code-only card. Every open from this list comes from a row, so saying so here keeps
   * the wrong-game check — the reason the row travels at all — mandatory on this path.
   */
  const [opening, setOpening] = useState<{ game: GameListing; door: Door } | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Games at the table</CardTitle>
        <CardDescription>
          The most recent ones. Join one to play in it, or come in as its DM.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {games === undefined ? (
          <LobbyRowSkeletons rows={3} />
        ) : games.length === 0 ? (
          <LobbyRowEmpty>No games yet — start one below.</LobbyRowEmpty>
        ) : (
          <LobbyRows>
            {/* The server's order, newest first, taken as given: `order('desc')` on
                the implicit creation-time index is an index scan rather than a sort,
                so re-ordering here would be paying to undo something free. */}
            {games.map((game) => (
              <GameListRow
                key={game._id}
                game={game}
                onJoin={(clicked, door) => setOpening({ game: clicked, door })}
              />
            ))}
          </LobbyRows>
        )}
      </CardContent>

      {/* The pair goes down whole. Splitting it into `game` and `door` props meant
          inventing a value for the second one while nothing was open — a `'player'`
          nothing reads, standing in for the field that decides which credential the
          dialog asks for, which is the last field to want a fabricated default. */}
      <JoinDoorDialog opening={opening} onClose={() => setOpening(null)} />
    </Card>
  )
}
