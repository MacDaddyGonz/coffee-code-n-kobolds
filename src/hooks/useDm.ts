import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { errorMessage } from '@/lib/errors'
import { forgetDmCode, getDmCode, rememberDmCode } from '@/lib/session'

export type Dm = {
  /**
   * The code to pass to DM-only mutations, or null when this browser does not
   * hold one. Every DM-only Convex function re-verifies it server-side — having
   * it here authorises nothing, it only says what the UI may offer.
   */
  dmCode: string | null
  /** Verify a pasted DM code and take the badge. Returns an error message or null. */
  elevate: (dmCode: string) => Promise<string | null>
  /** Exchange the recovery phrase for the DM code. Returns an error message or null. */
  recover: (recoveryPhrase: string) => Promise<string | null>
  /** Forget the cached code on this browser. Does not change the game. */
  standDown: () => void
}

/**
 * Holds the DM credential for one game.
 *
 * The DM code is a bearer secret: the browser keeps it and presents it on every
 * DM-only call. Losing browser storage therefore costs DM powers until the code
 * is pasted again — or exchanged for, with the recovery phrase. That is the
 * whole recovery story, and it is why what this hook holds is a UI concern only:
 * nothing is authorised client-side, because the code is re-verified server-side
 * on every DM-only call.
 *
 * Takes the seat id rather than its display name: a name held in client state is
 * stale the moment the seat is renamed, and the badge would land on a phantom
 * seat under the old name instead of this one.
 */
export function useDm(code: string, playerId: Id<'players'> | null): Dm {
  const elevateDm = useMutation(api.games.elevateDm)
  const recoverDmCode = useMutation(api.games.recoverDmCode)

  const [dmCode, setDmCode] = useState<string | null>(null)

  const elevate = useCallback(
    async (candidate: string) => {
      if (!playerId) return 'Take a seat before claiming the DM badge.'
      try {
        await elevateDm({ code, dmCode: candidate, playerId })
      } catch (thrown) {
        return errorMessage(thrown, 'That DM code was not accepted.')
      }
      rememberDmCode(code, candidate)
      setDmCode(candidate)
      return null
    },
    [code, elevateDm, playerId],
  )

  const recover = useCallback(
    async (recoveryPhrase: string) => {
      if (!playerId) return 'Take a seat before recovering the DM code.'
      try {
        const result = await recoverDmCode({ code, recoveryPhrase, playerId })
        rememberDmCode(code, result.dmCode)
        setDmCode(result.dmCode)
        return null
      } catch (thrown) {
        return errorMessage(thrown, 'That recovery phrase was not accepted.')
      }
    },
    [code, recoverDmCode, playerId],
  )

  // Re-present a cached code once we know which seat we are, so the badge lands
  // on this seat rather than wherever it was last session. A code the server
  // rejects is dropped rather than kept around failing quietly.
  const restoredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!playerId || dmCode) return
    const cached = getDmCode(code)
    if (!cached) return
    if (restoredFor.current === code) return
    restoredFor.current = code
    void (async () => {
      const failure = await elevate(cached)
      if (failure) forgetDmCode(code)
    })()
  }, [code, playerId, dmCode, elevate])

  const standDown = useCallback(() => {
    forgetDmCode(code)
    setDmCode(null)
    restoredFor.current = null
  }, [code])

  /**
   * ⚠️ **Memoised, and the reason is two panes rather than anything in this hook.**
   * `MapPane` and `RightPane` are both `memo`'d, and `dm` is one of the props both of
   * them take — so a fresh object per render defeats both memos at once and reconciles
   * the whole board tree *and* the whole right-hand panel to produce byte-identical
   * output.
   *
   * The divider drag those memos were written for is not what exposed it: a drag sets
   * state on `GameShell` and never re-renders `Game`, so this hook is not called. What
   * does call it is roster churn — `useSeat` subscribes `players.list`, so every join,
   * rename and DM claim re-renders `Game` and minted a new object here. Cheap enough
   * to ignore once; not once `board.tokens` re-runs on the same churn, which is why the
   * comment on `MapPane` asserting every prop is stable had to become true rather than
   * be softened.
   *
   * Every member is already stable — `useMutation` is memoised inside convex/react and
   * the three callbacks close over `code` and `playerId` — so the dependency list
   * changes only when the credential genuinely does.
   */
  return useMemo(
    () => ({ dmCode, elevate, recover, standDown }),
    [dmCode, elevate, recover, standDown],
  )
}
