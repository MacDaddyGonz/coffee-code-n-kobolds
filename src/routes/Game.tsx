import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { CopyButton } from '@/components/CopyButton'
import { Shell } from '@/components/Shell'
import { Board } from '@/components/board/Board'
import { MapSetupOverlay } from '@/components/board/dm/MapSetupOverlay'
import { Lobby } from '@/components/lobby/Lobby'
import { NameGate } from '@/components/lobby/NameGate'
import { CharacterSheetPanel } from '@/components/sheet/CharacterSheetPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDm } from '@/hooks/useDm'
import { useSeat } from '@/hooks/useSeat'
import { normaliseJoinCode } from '@convex/lib/codes'

/**
 * Resolves the game and this browser's seat, then hands off to the lobby or the
 * board. The seat resolution is the interesting part and lives in useSeat — see
 * ADR 0003.
 */
export default function Game() {
  const params = useParams<{ code: string }>()
  const code = normaliseJoinCode(params.code ?? '')

  // The seat, the character it holds and whether this browser is the DM. All three
  // are resolved by their own hook — this route wires them together and decides
  // between the lobby and the board, which is all it should be doing.
  const seat = useSeat(code)
  const dm = useDm(code, seat.playerId)

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
            myCharacterId={seat.characterId}
          >
            {/* The board's overlay slot. Nothing was ever passed into it, which left
                the grid calibrator reachable only from the lobby — so a grid found to
                be a fraction out mid-fight cost the whole table a trip off the board
                to fix. A player is given no map setup here, and that is not the
                guard: the panel's own queries and mutations all take the DM code and
                re-verify it server-side (invariant 7). */}
            {dm.dmCode !== null ? <MapSetupOverlay code={code} dmCode={dm.dmCode} /> : null}
            {/* Everyone gets the sheet panel, the DM included — a DM is a seat and
                may be playing a character too. It also covers the case the standing
                claim notice used to: a player who never claimed can move nothing now
                that an unattached token belongs to the DM, and the character list
                lives in the lobby this screen replaced, so the panel offers the list
                when the seat holds nothing. */}
            <CharacterSheetPanel
              code={code}
              playerId={seat.playerId!}
              dmCode={dm.dmCode}
              characterId={seat.characterId}
            />
          </Board>
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
