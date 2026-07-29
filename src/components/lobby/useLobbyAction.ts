import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/errors'

export type LobbyAction = {
  /** Key of the call in flight, or null. Disable the control that fired it. */
  pending: string | null
  /** Resolves true when the call succeeded, false once the failure is on screen. */
  run: (key: string, fallback: string, call: () => Promise<unknown>) => Promise<boolean>
}

/**
 * Runs one lobby mutation at a time and turns a rejection into a toast in the
 * server's own words — "Sam is already playing Thorin" rather than a stack.
 *
 * The ref, not the state, is what stops a double-click firing twice: a second
 * click in the same frame still sees the old `pending` through its closure.
 */
export function useLobbyAction(): LobbyAction {
  const [pending, setPending] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(
    async (key: string, fallback: string, call: () => Promise<unknown>) => {
      if (inFlight.current) return false
      inFlight.current = true
      setPending(key)
      try {
        await call()
        return true
      } catch (thrown) {
        toast.error(errorMessage(thrown, fallback))
        return false
      } finally {
        inFlight.current = false
        setPending(null)
      }
    },
    [],
  )

  return { pending, run }
}
