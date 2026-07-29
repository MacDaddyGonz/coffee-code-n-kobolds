import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { errorMessage } from '@/lib/errors'
import {
  forgetDisplayName,
  getDisplayNameForGame,
  rememberDisplayName,
} from '@/lib/session'

export type PublicGame = NonNullable<FunctionReturnType<typeof api.games.getByCode>>

export type SeatStatus =
  /** Waiting on the game lookup. */
  | 'loadingGame'
  /** The code in the URL matches no game. */
  | 'noSuchGame'
  /** Game exists, but this browser does not know which seat it is. Show the gate. */
  | 'needsName'
  | 'joining'
  | 'seated'
  | 'error'

export type Seat = {
  status: SeatStatus
  game: PublicGame | null
  playerId: Id<'players'> | null
  displayName: string | null
  error: string | null
  /** Join or rejoin under this name. Idempotent server-side. */
  takeSeat: (displayName: string) => Promise<void>
  /** Give up the seat and return to the name gate. The character is untouched. */
  leaveSeat: () => Promise<void>
}

/**
 * Resolves which seat this browser occupies in one game.
 *
 * The server call is idempotent by display name, so "restore my session" and
 * "join for the first time" are the same code path — there is no session token
 * to be missing. A browser with no remembered name simply asks for one, and
 * typing the same name as last time lands on the same seat with the same
 * character still claimed. See ADR 0003.
 */
export function useSeat(code: string): Seat {
  const game = useQuery(api.games.getByCode, { code })
  const join = useMutation(api.players.join)
  const leave = useMutation(api.players.leave)

  const [playerId, setPlayerId] = useState<Id<'players'> | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const takeSeat = useCallback(
    async (name: string) => {
      setJoining(true)
      setError(null)
      try {
        const seat = await join({ code, displayName: name })
        rememberDisplayName(code, seat.displayName)
        setPlayerId(seat.playerId)
        setDisplayName(seat.displayName)
      } catch (thrown) {
        setError(errorMessage(thrown, 'Could not join that game.'))
      } finally {
        setJoining(false)
      }
    },
    [code, join],
  )

  // Rejoin on arrival when we already know the name. Idempotent, so React's
  // double-invoked effects in development are harmless; the ref only stops a
  // redundant round trip.
  const autoJoinedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!game || playerId) return
    const remembered = getDisplayNameForGame(code)
    if (!remembered) return
    if (autoJoinedFor.current === code) return
    autoJoinedFor.current = code
    void takeSeat(remembered)
  }, [code, game, playerId, takeSeat])

  const leaveSeat = useCallback(async () => {
    if (!playerId) return
    try {
      await leave({ code, playerId })
    } catch (thrown) {
      setError(errorMessage(thrown, 'Could not leave that game.'))
      return
    }
    forgetDisplayName(code)
    autoJoinedFor.current = null
    setPlayerId(null)
    setDisplayName(null)
  }, [code, leave, playerId])

  const status: SeatStatus = (() => {
    if (game === undefined) return 'loadingGame'
    if (game === null) return 'noSuchGame'
    if (playerId) return 'seated'
    if (joining) return 'joining'
    if (error) return 'error'
    return 'needsName'
  })()

  return { status, game: game ?? null, playerId, displayName, error, takeSeat, leaveSeat }
}
