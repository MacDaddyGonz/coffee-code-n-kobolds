import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/errors'

/**
 * Where a refusal is put in front of the person who caused it.
 *
 * A toast for a control that acts on the spot — a Start button, a select that
 * switches the map — because there is nothing left on screen for a permanent
 * message to attach itself to. A field for a dialog that stays open on failure,
 * because a toast over a form the DM is still filling in is the wrong shape: it
 * disappears while they are reading the field it was about.
 */
export type ActionReport = 'toast' | 'field'

export type LobbyAction = {
  /** Key of the call in flight, or null. Disable the control that fired it. */
  pending: string | null
  /**
   * The message from the last `report: 'field'` failure, ready for <FieldError>.
   * Always null while a `report: 'toast'` caller is the only one using this hook.
   */
  error: string | null
  /** Resolves true when the call succeeded, false once the failure is on screen. */
  run: (
    key: string,
    fallback: string,
    call: () => Promise<unknown>,
    options?: { report?: ActionReport },
  ) => Promise<boolean>
  /** Drop a field error — on retry, and when a dialog closes on top of one. */
  clearError: () => void
}

/**
 * Runs one mutation at a time and turns a rejection into the server's own words —
 * "Sam is already playing Thorin" rather than a stack.
 *
 * One idiom for every DM and lobby control, which is the point of the `report`
 * option. Before it, the two upload dialogs each hand-rolled their own
 * `saving`/`error`/try-catch-finally because they needed an inline message rather
 * than a toast, and a second pending-and-error mechanism is a second set of edge
 * cases — the double-click guard below being the one they both got wrong.
 *
 * The ref, not the state, is what stops a double-click firing twice: a second
 * click in the same frame still sees the old `pending` through its closure.
 */
export function useLobbyAction(): LobbyAction {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const clearError = useCallback(() => setError(null), [])

  const run = useCallback(
    async (
      key: string,
      fallback: string,
      call: () => Promise<unknown>,
      options?: { report?: ActionReport },
    ) => {
      if (inFlight.current) return false
      inFlight.current = true
      setPending(key)
      // Cleared on the way in, so a second identical failure is still a state
      // change and still reaches whoever is rendering it.
      setError(null)
      try {
        await call()
        return true
      } catch (thrown) {
        const message = errorMessage(thrown, fallback)
        if (options?.report === 'field') setError(message)
        else toast.error(message)
        return false
      } finally {
        inFlight.current = false
        setPending(null)
      }
    },
    [],
  )

  return { pending, error, run, clearError }
}
