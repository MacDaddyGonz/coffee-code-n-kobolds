import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { Shell } from '@/components/Shell'
import { NameGate } from '@/components/lobby/NameGate'
import { GameShell } from '@/components/shell/GameShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDm } from '@/hooks/useDm'
import { useSeat } from '@/hooks/useSeat'
import { normaliseJoinCode } from '@convex/lib/codes'

/**
 * Resolves the game and this browser's seat, then hands the seated case to
 * `GameShell`. The seat resolution is the interesting part and lives in `useSeat` —
 * see ADR 0003.
 *
 * **The three states before a seat exists keep the scrolling `Shell`, and the seated
 * one deliberately does not.** A skeleton, a wrong join code and the name gate are
 * ordinary pages that should grow and scroll like the home screen, which uses the
 * same `Shell`; the game itself is exactly one viewport tall and says so on its own
 * root element rather than in a global stylesheet. Which is why this file no longer
 * draws a header: the header belongs to the shell that is a screen, not to the route.
 */
export default function Game() {
  const params = useParams<{ code: string }>()
  const code = normaliseJoinCode(params.code ?? '')

  // The seat, the character it holds and whether this browser is the DM. All three
  // are resolved by their own hook — this route wires them together and decides
  // which of the four screens is showing, which is all it should be doing.
  const seat = useSeat(code)
  const dm = useDm(code, seat.playerId)

  // leaveSeat reports failure by setting seat.error instead of rejecting, and a
  // failed leave keeps us seated — so nothing on screen would say what happened.
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

  if (seat.status !== 'seated') {
    return (
      <Shell>
        <NameGate
          code={code}
          busy={seat.status === 'joining'}
          error={seat.error}
          onTakeSeat={seat.takeSeat}
        />
      </Shell>
    )
  }

  return (
    <GameShell
      code={code}
      game={game}
      dm={dm}
      playerId={seat.playerId!}
      displayName={seat.displayName}
      characterId={seat.characterId}
      characterName={seat.characterName}
      onRenameSeat={seat.renameSeat}
      onLeaveSeat={seat.leaveSeat}
    />
  )
}
