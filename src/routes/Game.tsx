import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { CopyButton } from '@/components/CopyButton'
import { Shell } from '@/components/Shell'
import { Board } from '@/components/board/Board'
import { Lobby } from '@/components/lobby/Lobby'
import { NameGate } from '@/components/lobby/NameGate'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDm } from '@/hooks/useDm'
import { useSeat } from '@/hooks/useSeat'
import { api } from '@convex/_generated/api'
import { normaliseJoinCode } from '@convex/lib/codes'

/**
 * Resolves the game and this browser's seat, then hands off to the lobby or the
 * board. The seat resolution is the interesting part and lives in useSeat — see
 * ADR 0003.
 */
export default function Game() {
  const params = useParams<{ code: string }>()
  const code = normaliseJoinCode(params.code ?? '')

  const seat = useSeat(code)
  const dm = useDm(code, seat.playerId)

  // Which character this seat holds, read from the roster rather than kept in
  // client state: the seat → character pointer runs one way (ADR 0003), so the
  // roster is the authority and a claim made in another browser is reflected
  // here without anything to keep in sync. The board only uses it to decide
  // which tokens to offer as draggable; the server re-checks every move.
  const seats = useQuery(api.players.list, { code })
  const myCharacterId = seats?.find((row) => row._id === seat.playerId)?.characterId ?? null

  // leaveSeat reports failure by setting seat.error instead of rejecting, and a
  // failed leave keeps us seated — so the lobby would show nothing at all.
  useEffect(() => {
    if (seat.status === 'seated' && seat.error) toast.error(seat.error)
  }, [seat.error, seat.status])

  // 'restoring' is a returning browser rejoining a remembered name. It gets the
  // skeleton rather than the name gate, because it was never asked a question.
  if (seat.status === 'loadingGame' || seat.status === 'restoring') {
    return (
      <Shell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </Shell>
    )
  }

  if (seat.status === 'noSuchGame') {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>No game with the code {code || '—'}</AlertTitle>
          <AlertDescription>
            Check the code with whoever is running the game. Codes never contain the letters I, L or
            O, or the digits 0 or 1.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="self-start">
          <Link to="/">Back to the start</Link>
        </Button>
      </Shell>
    )
  }

  const game = seat.game!

  return (
    <Shell>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold">{game.name}</h1>
          <p className="text-muted-foreground text-sm">Run by {game.createdByName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Join code</span>
          <code className="bg-muted rounded px-2 py-1 font-mono text-lg tracking-[0.2em]">
            {game.code}
          </code>
          <CopyButton value={game.code} label="join code" />
        </div>
      </header>

      {seat.status === 'seated' ? (
        // The DM's click on Start patches `games.status`, and every client is
        // already subscribed here — so the whole table turns over on this one
        // condition rather than on a message each. `activeSceneId` is required as
        // well as the status: `games.start` refuses without one, but a scene
        // deleted mid-game would otherwise leave everybody on a blank canvas with
        // the way back three clicks deep in a panel only the DM can see.
        game.status === 'playing' && game.activeSceneId !== null ? (
          <Board
            code={code}
            dm={dm}
            playerId={seat.playerId!}
            myCharacterId={myCharacterId}
          />
        ) : (
          <Lobby
            code={code}
            playerId={seat.playerId!}
            game={game}
            dm={dm}
            onRenameSeat={seat.renameSeat}
            onLeaveSeat={seat.leaveSeat}
          />
        )
      ) : (
        <NameGate
          code={code}
          busy={seat.status === 'joining'}
          error={seat.error}
          onTakeSeat={seat.takeSeat}
        />
      )}
    </Shell>
  )
}
