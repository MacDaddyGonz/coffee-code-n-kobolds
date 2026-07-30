import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import type { BoardToken } from '@/hooks/useBoard'

export type TokenSelection = {
  selectedTokenId: Id<'tokens'> | null
  /** The selected token, re-read from the current board so it never goes stale. */
  selectedToken: BoardToken | null
  select: (tokenId: Id<'tokens'>) => void
  clear: () => void
}

/**
 * Which token the keyboard is pointed at. Exactly one, or none.
 *
 * One at a time because the only thing selection does in this milestone is decide
 * what the arrow keys move, and D&D Lite has no group orders — the requirements
 * have players moving their own character and the DM moving one creature at a
 * time. A multi-select would have to answer what happens when half the group is
 * refused by the server, which is a question worth not asking yet.
 *
 * Only a token this browser may move can be selected. Selecting one it may not
 * would offer a keyboard that does nothing and report the refusal as silence.
 * `canMove` is an affordance, not a permission — the server re-checks every write
 * (CLAUDE.md invariant 1).
 */
export function useTokenSelection(tokens: BoardToken[]): TokenSelection {
  const [selectedTokenId, setSelectedTokenId] = useState<Id<'tokens'> | null>(null)

  const selectedToken = useMemo(
    () => tokens.find((token) => token._id === selectedTokenId) ?? null,
    [tokens, selectedTokenId],
  )

  const select = useCallback(
    (tokenId: Id<'tokens'>) => {
      const token = tokens.find((candidate) => candidate._id === tokenId)
      if (!token?.canMove) return
      setSelectedTokenId(tokenId)
    },
    [tokens],
  )

  const clear = useCallback(() => setSelectedTokenId(null), [])

  // A selection has to be able to lose its token, because plenty of things take it
  // away from under the person holding it: the DM deletes it, the DM switches
  // scenes so it is no longer placed on the board in front of us, or a player
  // claims the character and this browser stops being allowed to move it. Left
  // alone, the id would stay selected forever — the highlight gone, the arrow keys
  // still aimed at it, and nothing on screen to explain why they stopped working.
  useEffect(() => {
    if (selectedTokenId === null) return
    const token = tokens.find((candidate) => candidate._id === selectedTokenId)
    if (!token || !token.canMove || !token.position) setSelectedTokenId(null)
  }, [tokens, selectedTokenId])

  // Derived rather than the raw state, so the one render between a token vanishing
  // and the effect above noticing does not hand out an id that is no longer on the
  // board — which a caller would spend that render highlighting nothing, or aiming
  // an arrow key at a token the server has already deleted.
  return {
    selectedTokenId: selectedToken?._id ?? null,
    selectedToken,
    select,
    clear,
  }
}
