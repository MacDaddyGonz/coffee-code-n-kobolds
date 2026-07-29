import { useCallback, useEffect, useState } from 'react'
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
  /** A remembered name is being rejoined silently. No gate — this is a returning browser. */
  | 'restoring'
  /** Game exists, but this browser does not know which seat it is. Show the gate. */
  | 'needsName'
  /** The player typed a name and we are taking the seat. */
  | 'joining'
  | 'seated'

export type Seat = {
  status: SeatStatus
  game: PublicGame | null
  playerId: Id<'players'> | null
  error: string | null
  /** Join or rejoin under this name. Idempotent server-side. */
  takeSeat: (displayName: string) => Promise<void>
  /**
   * Rename this seat. The display name *is* the seat's identity key (ADR 0003),
   * so the rename and the storage write are one operation — split them and the
   * next visit rejoins under the old name, orphaning the character. Returns an
   * error message or null.
   */
  renameSeat: (displayName: string) => Promise<void>
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
  const rename = useMutation(api.players.rename)
  const leave = useMutation(api.players.leave)

  const [playerId, setPlayerId] = useState<Id<'players'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  // The remembered name still waiting to be rejoined, if there is one. Without
  // it the gate flashes for a frame on arrival: the effect has not run yet, so
  // there is no playerId and nothing in flight, which otherwise reads as "we
  // need a name". Cleared once the seat resolves, or when the player leaves on
  // purpose.
  const [pendingRejoin, setPendingRejoin] = useState<string | null>(() =>
    getDisplayNameForGame(code),
  )

  const takeSeat = useCallback(
    async (name: string) => {
      setJoining(true)
      setError(null)
      try {
        const seat = await join({ code, displayName: name })
        rememberDisplayName(code, seat.displayName)
        setPlayerId(seat.playerId)
      } catch (thrown) {
        setError(errorMessage(thrown, 'Could not join that game.'))
      } finally {
        setJoining(false)
        setPendingRejoin(null)
      }
    },
    [code, join],
  )

  // Rejoin on arrival when we already know the name. React double-invokes
  // effects in development, so the join can go out twice there — harmless,
  // because players.join is idempotent on the name key by design and hands back
  // the same seat.
  useEffect(() => {
    if (!game || playerId || joining || !pendingRejoin) return
    void takeSeat(pendingRejoin)
  }, [game, joining, pendingRejoin, playerId, takeSeat])

  // Lets the rejection propagate, unlike leaveSeat: renaming leaves the caller on
  // screen with its own error handling, whereas leaving tears this hook's state
  // down and has nowhere to report to.
  const renameSeat = useCallback(
    async (displayName: string) => {
      if (!playerId) return
      const result = await rename({ code, playerId, displayName })
      // The display name IS the seat's identity key, so the mutation and this
      // write are one operation — a rename the browser forgets orphans the
      // character on the next visit.
      rememberDisplayName(code, result.displayName)
    },
    [code, playerId, rename],
  )

  const leaveSeat = useCallback(async () => {
    if (!playerId) return
    // Cleared first so a second identical failure is still a state change, and
    // therefore still reaches whoever is watching `error` to report it.
    setError(null)
    try {
      await leave({ code, playerId })
    } catch (thrown) {
      setError(errorMessage(thrown, 'Could not leave that game.'))
      return
    }
    forgetDisplayName(code)
    setPlayerId(null)
    setPendingRejoin(null)
  }, [code, leave, playerId])

  const status: SeatStatus = (() => {
    if (game === undefined) return 'loadingGame'
    if (game === null) return 'noSuchGame'
    if (playerId) return 'seated'
    if (pendingRejoin) return 'restoring'
    if (joining) return 'joining'
    return 'needsName'
  })()

  return { status, game: game ?? null, playerId, error, takeSeat, renameSeat, leaveSeat }
}
