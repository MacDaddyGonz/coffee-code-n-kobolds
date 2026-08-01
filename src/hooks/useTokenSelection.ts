import { useCallback, useMemo } from 'react'

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
 * One at a time because the arrow keys have to be aimed somewhere, and D&D Lite has
 * no group orders — the requirements have players moving their own character and
 * the DM moving one creature at a time. A multi-select would have to answer what
 * happens when half the group is refused by the server, which is a question worth
 * not asking yet.
 *
 * Only a token this browser may move can be selected. Selecting one it may not
 * would offer a keyboard that does nothing and report the refusal as silence.
 * `canMove` is an affordance, not a permission — the server re-checks every write
 * (CLAUDE.md invariant 1).
 *
 * **Controlled, and no longer the owner of the state.** The id lives in `GameShell`
 * because two panes now write it and two read it: the map writes it on a click, the
 * DM's sheet selector writes it on a choice, and the sheet panel reads it to decide
 * whose sheet is on screen. What is left here is the half that has to know about the
 * board — resolving the id against the live token list, and refusing one this
 * browser may not move — which is the half the shell has no business doing.
 *
 * ⚠️ **The shell's id can now name a token that is not on this scene**, because the
 * DM's selector can pick a creature whose token is placed somewhere else or nowhere
 * at all. The board then draws no ring while the right-hand panel still shows the
 * sheet, and that is intended rather than a gap: the panel is what says which
 * creature is being talked about, and a ring drawn around nothing would be worse
 * than no ring. The same is true of a token this browser may not move.
 */
export function useTokenSelection(
  tokens: BoardToken[],
  selectedTokenId: Id<'tokens'> | null,
  onSelect: (tokenId: Id<'tokens'>) => void,
  onClear: () => void,
): TokenSelection {
  /**
   * The selection, and the only place the question is answered.
   *
   * The three conditions are one thing, not a match plus two guards, and they were
   * previously spread across a `find` that checked the id, an effect that checked
   * all three, and a return value derived from the first — which meant the token
   * this hook handed out could be one the effect was about to reject.
   *
   * A selection has to be able to lose its token, because plenty of things take it
   * away from under the person holding it: the DM deletes it, the DM switches
   * scenes so it is no longer placed on the board in front of us, or a player
   * claims the character and this browser stops being allowed to move it. Asking
   * the current board all three questions every render is what makes those cases
   * free — there is no state to correct, so there is no render in between during
   * which the highlight is gone and the arrow keys are still aimed at it.
   *
   * The shell's id is deliberately left alone when it stops matching, and that
   * argument survived the move up: nothing reads it for the keyboard, and keeping
   * it means a token that comes *back* — positions arriving a beat after the token
   * list, most often — is still selected rather than needing a second click. It is
   * also now what keeps the panel pointed at a creature whose token this scene does
   * not draw.
   */
  const selectedToken = useMemo(
    () =>
      tokens.find(
        (token) => token._id === selectedTokenId && token.canMove && token.position !== null,
      ) ?? null,
    [tokens, selectedTokenId],
  )

  const select = useCallback(
    (tokenId: Id<'tokens'>) => {
      const token = tokens.find((candidate) => candidate._id === tokenId)
      if (!token?.canMove) return
      onSelect(tokenId)
    },
    [tokens, onSelect],
  )

  // Both derived from the token above rather than from the id passed in, so a caller
  // can never be handed an id for a token that is not on the board, is not theirs
  // to move, or is not standing anywhere on this scene. That is what keeps the
  // keyboard honest while the panel goes on showing a sheet.
  return {
    selectedTokenId: selectedToken?._id ?? null,
    selectedToken,
    select,
    // Passed straight through rather than wrapped. There is nothing to check on the
    // way out, and an arrow here would be a fresh identity every render for the one
    // callback the board hands to a Konva listener.
    clear: onClear,
  }
}
