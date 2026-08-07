import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BoardToken } from '@/hooks/useBoard'
import type { Id } from '@convex/_generated/dataModel'

/**
 * How long the pointer has to rest on a coin before the card appears, in milliseconds.
 *
 * ⚠️ **A dwell rather than an instant hover, and it is a cost decision as much as a
 * comfort one.** The card holds a `characters.sheet` subscription for whichever coin it is
 * about, so a pointer crossing six goblins on its way to the map would open and close six
 * of them in under a second. A quarter of a second is long enough that only a deliberate
 * point ever subscribes, and short enough that a deliberate point does not feel like a
 * wait — it is the interval the browser's own `title` tooltip trains everybody on, at the
 * fast end of it.
 */
const HOVER_DELAY_MS = 250

export type TokenHover = {
  hoveredTokenId: Id<'tokens'> | null
  /** Re-read from the current board every render, so it can never name a coin that has gone. */
  hoveredToken: BoardToken | null
  /**
   * The two handlers for a coin's pointer. **Stable for the life of the hook**, and that is
   * a requirement rather than a nicety: they are bound on every coin on the board, and
   * react-konva answers a changed `on*` reference by unbinding the old listener and binding
   * the new one — while the token array is rebuilt ten times a second for the whole of
   * anybody's drag (CLAUDE.md invariant 2). A handler rebuilt with it would rebind every
   * coin on the board throughout every drag at the table. `useHpTarget.open` is written the
   * same way for the same reason.
   */
  onEnter: (token: BoardToken) => void
  onLeave: (token: BoardToken) => void
  // ⚠️ **Deliberately no `clear`**, which is the shape `useHpTarget` and `useTokenSelection`
  // both have and this one does not need. Their state is set by a click and so has to be
  // unset by something; a hover is unset by the pointer leaving, and the resolve below
  // already answers `null` for a coin that has been deleted or a scene that has been
  // switched away from. A method nobody calls still costs everything that reads this type.
}

/**
 * Which coin the pointer is resting on, after a beat.
 *
 * **A third small hook beside `useTokenSelection` and `useHpTarget` rather than a parameter
 * on either**, which is the arrangement `useHpTarget`'s own docblock argues for at length:
 * the three are one-at-a-time for three unrelated reasons — the arrow keys have to be aimed
 * somewhere, there is one hit point panel and two would overlap, and the pointer is in one
 * place — and none of those reasons survives being stated generically. This one differs from
 * both in a fourth way as well: it has a *timer*, and it is the only one of the three that
 * can be pre-empted by the mouse leaving before it fires.
 *
 * ⚠️ **The id is stored and the token resolved against the live board on every render**,
 * which is the discipline both siblings keep and the reason none of them needs an effect to
 * correct itself. A coin deleted from under the pointer, or a scene switched away from,
 * leaves the card unmounted with no render in between during which it names something that
 * has gone.
 *
 * ⚠️ **`canMove`, `canEditHp` and layer are not consulted, deliberately.** A hover card says
 * what a coin *is*, and everything it draws is either already on the payload this browser
 * was sent or gated by a server-side query of its own — so there is nothing here for an
 * affordance test to protect, and adding one would be the client deciding what to show,
 * which is precisely CLAUDE.md invariant 1's mistake. A coin a player may look at and not
 * touch gets a card; a coin they may not know about was never in their payload.
 */
export function useTokenHover(tokens: BoardToken[]): TokenHover {
  const [hoveredTokenId, setHoveredTokenId] = useState<Id<'tokens'> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  // A pending timer outliving the board would fire into an unmounted component, which React
  // reports as a warning and which here would be a card opened over a game nobody is in.
  useEffect(() => cancel, [cancel])

  const onEnter = useCallback(
    (token: BoardToken) => {
      cancel()
      // The id is captured rather than the token: what arrives at the timer's callback a
      // quarter of a second later must not be a `BoardToken` object from a render that has
      // since been replaced ten times over by the drag next door.
      const tokenId = token._id
      timer.current = setTimeout(() => {
        timer.current = null
        setHoveredTokenId(tokenId)
      }, HOVER_DELAY_MS)
    },
    [cancel],
  )

  const onLeave = useCallback(
    (token: BoardToken) => {
      cancel()
      // ⚠️ **Only clears the hover if it is *this* coin's**, which matters because Konva
      // delivers `mouseleave` on the coin being left and `mouseenter` on the one being
      // entered in an order this component does not control. Clearing unconditionally would
      // let a leave that arrives second wipe a hover that has just been set by a neighbour.
      setHoveredTokenId((current) => (current === token._id ? null : current))
    },
    [cancel],
  )

  const hoveredToken = useMemo(
    () => tokens.find((token) => token._id === hoveredTokenId && token.position !== null) ?? null,
    [tokens, hoveredTokenId],
  )

  // Derived from the resolved token rather than from the raw state, so a caller is never
  // handed an id for a coin that has left the board — `useHpTarget`'s last paragraph.
  return { hoveredTokenId: hoveredToken?._id ?? null, hoveredToken, onEnter, onLeave }
}
