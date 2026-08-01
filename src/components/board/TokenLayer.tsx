import { useMemo } from 'react'
import { Layer } from 'react-konva'

import { TokenCoin } from './TokenCoin'
import type { BoardToken } from '@/hooks/useBoard'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * A DM-layer coin is drawn slightly ghosted. It is a label, not a lock: the only
 * person who ever sees one is the DM, and they need to be able to tell at a glance
 * which of the tokens in front of them the party cannot see.
 */
const DM_LAYER_OPACITY = 0.88

export type TokenLayerProps = {
  tokens: BoardToken[]
  scene: PublicScene
  scale: number
  selectedId: Id<'tokens'> | null
  /** Off while the space bar is held, so a drag pans the board instead. */
  draggable: boolean
  /**
   * One function per event for the whole layer, each given the token it happened
   * to. Stable identities matter here rather than being tidy — see the note on
   * `TokenCoinProps`.
   */
  onSelect: (token: BoardToken) => void
  onDragStart?: (token: BoardToken) => void
  onDragMove?: (token: BoardToken, point: Point) => void
  onDragEnd?: (token: BoardToken, point: Point) => void
  /** A click on a coin's health bar. The id comes back, not the token — see `TokenCoinProps`. */
  onOpenHp: (tokenId: Id<'tokens'>) => void
}

/**
 * The two interactive layers of the board — the player layer and, above it, the DM
 * layer — as one element the stage can be handed.
 *
 * The split is by `layer` because requirements.md stacks the board that way, and
 * separate Konva layers mean separate canvases: the DM shuffling their ambush about
 * does not force a redraw of the party standing still one layer down.
 *
 * The DM layer is absent, not hidden, when there is nothing on it — and for a player
 * there never is anything on it, because `convex/lib/board.ts` did not send them a
 * single DM-layer row. So there is nothing here to toggle open, nothing to peel back
 * in the devtools, and no `isDm` for this component to be told. That filtering is
 * server-side by construction (CLAUDE.md invariants 1 and 8); the emptiness on a
 * player's screen is a consequence of it rather than an implementation of it.
 */
export function TokenLayer({
  tokens,
  scene,
  scale,
  selectedId,
  draggable,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onOpenHp,
}: TokenLayerProps) {
  // On `tokens` alone, because that is the only thing any of it depends on. A pan
  // changes neither which tokens exist nor where they are, and paying for three
  // filters, two array copies and two sorts on each of its sixty frames a second is
  // work whose entire output is the array we already had.
  const { playerTokens, dmTokens } = useMemo(() => {
    const placed = tokens.filter((token) => token.position !== null)
    return {
      playerTokens: byDescendingSize(placed.filter((token) => token.layer === 'player')),
      dmTokens: byDescendingSize(placed.filter((token) => token.layer === 'dm')),
    }
  }, [tokens])

  const coins = (layerTokens: BoardToken[]) =>
    layerTokens.map((token) => (
      <TokenCoin
        key={token._id}
        token={token}
        scene={scene}
        scale={scale}
        selected={token._id === selectedId}
        // `canMove` is an affordance: it stops a player wrestling with a token that
        // is not theirs, and the server refuses the write regardless.
        draggable={draggable && token.canMove}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onOpenHp={onOpenHp}
      />
    ))

  return (
    <>
      <Layer>{coins(playerTokens)}</Layer>
      {dmTokens.length > 0 ? <Layer opacity={DM_LAYER_OPACITY}>{coins(dmTokens)}</Layer> : null}
    </>
  )
}

/**
 * Big tokens underneath. A hero standing on a dragon's four-square footprint would
 * otherwise be unclickable, since the last node drawn is the one the pointer hits.
 */
function byDescendingSize(tokens: BoardToken[]): BoardToken[] {
  return [...tokens].sort((a, b) => b.sizeSquares - a.sizeSquares)
}
