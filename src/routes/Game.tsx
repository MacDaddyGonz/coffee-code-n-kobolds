import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { CopyButton } from '@/components/CopyButton'
import { Lobby } from '@/components/lobby/Lobby'
import { NameGate } from '@/components/lobby/NameGate'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDm } from '@/hooks/useDm'
import { useSeat } from '@/hooks/useSeat'
import { normaliseJoinCode } from '@convex/lib/codes'

/**
 * Resolves the game and this browser's seat, then hands off to the lobby. The
 * seat resolution is the interesting part and lives in useSeat — see ADR 0003.
 */
export default function Game() {
  const params = useParams<{ code: string }>()
  const code = normaliseJoinCode(params.code ?? '')

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
        <Lobby code={code} playerId={seat.playerId!} dm={dm} onLeaveSeat={seat.leaveSeat} />
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 p-8">{children}</main>
  )
}
