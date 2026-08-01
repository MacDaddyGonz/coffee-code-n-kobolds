import { useCallback, useMemo, useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import type { BoardToken } from '@/hooks/useBoard'

export type HpTarget = {
  hpTokenId: Id<'tokens'> | null
  /** The token the editor is open on, re-read from the current board so it never goes stale. */
  hpToken: BoardToken | null
  /** Toggles: the bar that opened the editor is the bar that closes it again. */
  open: (tokenId: Id<'tokens'>) => void
  clear: () => void
}

/**
 * Which token the hit point editor is open on. Exactly one, or none.
 *
 * **This is deliberately a second file rather than `useTokenSelection` with a
 * predicate passed in**, and the shapes matching is the trap rather than the
 * argument for merging them. The two hooks answer different questions and are one
 * at a time for unrelated reasons: a selection is one at a time because the arrow
 * keys have to be aimed somewhere, and the hit point target is one at a time
 * because there is one panel and two of them would overlap. Neither reason
 * survives being stated generically, so a shared hook would have to drop both —
 * and `useTokenSelection`'s documentation of *why* it is shaped the way it is is
 * most of what that file is worth. Twenty lines of state is the cheaper copy.
 *
 * The condition differs too, and that difference is a bug fix in itself:
 * `canEditHp` has no layer clause where `canMove` requires the player layer, so a
 * hero the DM has moved onto the DM layer has hit points their own player may
 * still edit. Deriving the editor from the selection made those unreachable.
 */
export function useHpTarget(tokens: BoardToken[]): HpTarget {
  const [hpTokenId, setHpTokenId] = useState<Id<'tokens'> | null>(null)

  /**
   * The target, and the only place the question is answered — the discipline
   * `useTokenSelection` documents at length, taken wholesale.
   *
   * All three conditions are asked of the current board on every render rather
   * than corrected by an effect, so the editor cannot be open on a token that is
   * not there: the DM deletes it, the DM switches scenes so it is no longer placed
   * in front of us, or a player claims the character and this browser stops being
   * allowed to touch its hit points. There is no state to fix up, so there is no
   * render in between during which a panel is anchored to a token that has gone.
   *
   * The id in state is left alone when it stops matching, for the same reason as
   * there: a token that comes *back* — positions arriving a beat after the token
   * list — reopens rather than needing a second click.
   */
  const hpToken = useMemo(
    () =>
      tokens.find(
        (token) => token._id === hpTokenId && token.canEditHp && token.position !== null,
      ) ?? null,
    [tokens, hpTokenId],
  )

  /**
   * Deliberately depends on nothing, where `useTokenSelection.select` closes over
   * the token array to check the affordance before storing an id.
   *
   * This one cannot afford to. It is threaded down to a listener on every health
   * bar on the board, and react-konva rebinds a listener whose handler changed
   * identity — while the token array is rebuilt ten times a second for the whole
   * length of anybody's drag, because that is the rate invariant 2 caps position
   * writes at. A handler rebuilt with it would rebind every bar on the board
   * throughout every drag at the table.
   *
   * Nothing is lost by it: the resolve above already refuses a token this client
   * may not edit, so storing an id for one leaves the editor shut. The check was
   * never the thing keeping the panel honest.
   */
  const open = useCallback((tokenId: Id<'tokens'>) => {
    // A toggle, so clicking the bar again is the way out — the gesture that opened
    // the editor is the first one somebody tries to close it with.
    setHpTokenId((current) => (current === tokenId ? null : tokenId))
  }, [])

  const clear = useCallback(() => setHpTokenId(null), [])

  // Derived from the resolved token rather than from the raw state, so a caller is
  // never handed an id for a token that has left the board or stopped being theirs
  // to edit.
  return {
    hpTokenId: hpToken?._id ?? null,
    hpToken,
    open,
    clear,
  }
}
