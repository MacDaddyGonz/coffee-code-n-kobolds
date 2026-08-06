import { memo, useMemo } from 'react'
import { Layer } from 'react-konva'

import { TokenCoin } from './TokenCoin'
import type { BoardToken } from '@/hooks/useBoard'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import type { TokenLayer } from '@convex/lib/layers'
import { TOKEN_LAYERS, mayPlayersMove } from '@convex/lib/layers'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * A GM-layer coin is drawn slightly ghosted. It is a label, not a lock: the only
 * person who ever sees one is the DM, and they need to be able to tell at a glance
 * which of the tokens in front of them the party cannot see.
 */
const GM_LAYER_OPACITY = 0.88

/**
 * How each layer is drawn, keyed by the union so a fourth member fails to compile here
 * rather than arriving at full opacity as somebody's secret.
 *
 * ⚠️ **`dmOnly` is not a substitute for the server's filter and is not claimed to be.** A
 * player is sent no GM rows at all (`maySee` in convex/lib/board.ts, CLAUDE.md invariant 1),
 * so on their screen this flag has nothing to hide. What it *is* the floor under is `shown`:
 * that set comes out of a **stored preference**, and a preference must never be the thing
 * that decides whether a secret layer is painted. `dmOnly && !isDm` means the worst a
 * corrupt or hand-edited `localStorage` key can do is hide a layer, never reveal one.
 *
 * There is deliberately no `listening` column. Whether a layer answers the pointer is
 * `mayPlayersMove` — the same predicate `requireMovableToken` refuses on — so it is read
 * below rather than restated here as a third fact that could come to disagree with it.
 */
const TOKEN_LAYER_STYLES: Record<TokenLayer, { opacity: number; dmOnly: boolean }> = {
  background: { opacity: 1, dmOnly: false },
  player: { opacity: 1, dmOnly: false },
  gm: { opacity: GM_LAYER_OPACITY, dmOnly: true },
}

export type TokenLayersProps = {
  tokens: BoardToken[]
  scene: PublicScene
  scale: number
  selectedId: Id<'tokens'> | null
  /**
   * Whether this browser holds the DM code. **It decides interactivity and view, never
   * what arrived** — see the ⚠️ in this component's docblock.
   */
  isDm: boolean
  /**
   * Which layers the viewer is choosing to look at, from `useBoardLayers`. The DM's
   * preview toggle: a preference, and never a permission.
   */
  shown: ReadonlySet<TokenLayer>
  /**
   * The other half of the same toggle: leave out the coins the party has lost sight of.
   * `useBoardLayers`' `tableView`.
   *
   * ⚠️ **`token.hiddenFromParty` is read and never recomputed**, which is the point of this
   * prop being a bare boolean. That field comes off `useBoard`, which already `isDm &&`-gates
   * it and already shares `anyShapeCovers` with the server's own `veiled` — so it is the
   * server's three clauses, in the server's order, answered once for the whole board. A
   * second containment test here would be a fourth spelling of the fog inversion, on the one
   * screen where being wrong means the DM plans an ambush around it.
   *
   * ⚠️ **A preference and never a permission**, on `shown`'s exact terms and for a payload
   * this browser is fully entitled to. A player's coins are absent because `visiblePositions`
   * never sent them; the DM's are merely unpainted.
   */
  hideFogged: boolean
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
  onContextMenu?: (token: BoardToken, at: { clientX: number; clientY: number }) => void
}

/**
 * The interactive layers of the board — scenery, the party, and the DM's own — as one
 * element the stage can be handed.
 *
 * The split is by `layer` because requirements.md stacks the board that way, and separate
 * Konva layers mean separate canvases: the DM shuffling their ambush about does not force a
 * redraw of the party standing still one layer down. `TOKEN_LAYERS` is iterated rather than
 * three `<Layer>`s being written out, so the array *is* the paint order — bottom to top —
 * and a fourth layer cannot arrive with nowhere to be drawn.
 *
 * A layer with nothing on it renders no `<Layer>` at all: absent, not hidden. For a player
 * the GM layer is always in that state, because `convex/lib/board.ts` did not send them a
 * single GM row. So there is nothing here to toggle open, nothing to peel back in the
 * devtools, and the filtering is server-side by construction (CLAUDE.md invariants 1 and 8)
 * — the emptiness on a player's screen is a consequence of that rather than an
 * implementation of it.
 *
 * ⚠️ **This component is told `isDm` now, and the sentence that used to stand here said it
 * must not be — so read the correction rather than assuming the old argument lapsed.** That
 * argument was that a player is sent no GM rows, so there is nothing for an `isDm` to
 * toggle. Every word of it still holds *of the GM layer*, and it was never an argument about
 * a layer players genuinely receive. Background is exactly that: it is in everybody's
 * payload, and the two things the DM does with it that a player must not — pick a piece of
 * scenery up, and hide the GM layer to preview the table's view — are questions about **who
 * is looking, not about what arrived**. So `isDm` here decides interactivity and view, and
 * decides nothing about secrecy, which stays where it was.
 *
 * **Background is `listening={isDm}`, and that is the affordance rather than the
 * enforcement.** With the layer deaf to the pointer a player's press on scenery finds no
 * node at all, so Konva walks up to the draggable Stage and pans — the same trick
 * `BoardStage`'s docblock describes for the map and the grid, and the reason a player never
 * wrestles with a rock they were never going to move. The refusal is `requireMovableToken`'s,
 * server-side, on every write.
 *
 * **Memoised, which finishes the job `TokenCoin`'s own memo started rather than duplicating
 * it.** That one stops a coin reconciling; this one stops the board even asking. Every prop
 * is a primitive or an identity `Board` holds still deliberately — the token array is a
 * `useMemo` in `useSmoothPositions`, `shown` is a `useMemo` in `useBoardLayers`, the six
 * handlers are `useCallback`s, and the scene comes off the subscription by reference — so a
 * pan, a calibration draft and a band all changed nothing here and were costing a render of
 * this component plus a shallow comparison per coin at sixty frames a second. ⚠️ The list of
 * props is therefore a contract: a fresh object or arrow added to the call site in `Board`
 * silently returns the whole board to paying that, with nothing failing to say so.
 */
export const TokenLayers = memo(function TokenLayers({
  tokens,
  scene,
  scale,
  selectedId,
  isDm,
  shown,
  hideFogged,
  draggable,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onOpenHp,
  onContextMenu,
}: TokenLayersProps) {
  // On `tokens` and the fog toggle, because those are the only things any of it depends on.
  // A pan changes neither which tokens exist nor where they are, and paying for a bucketing
  // and a sort per layer on each of its sixty frames a second is work whose entire output is
  // the array we already had. The toggle is a boolean somebody presses, so it costs one
  // rebucketing per press.
  //
  // ⚠️ **The fogged coins are dropped here rather than at the render, which is what makes an
  // emptied layer *absent* instead of transparent** — this file's own rule, and it matters
  // more than usual for this mode: a DM previewing the table's board with a GM layer holding
  // nothing but fogged coins should see no such layer at all, because that is what the party
  // has. A `<Layer>` rendered with no children is a second canvas over the map saying nothing.
  //
  // The buckets come from `TOKEN_LAYERS` rather than from an object literal, so the union
  // is named once in this file and a fourth layer arrives with a bucket rather than with
  // an `undefined` to push onto.
  const byLayer = useMemo<Record<TokenLayer, BoardToken[]>>(() => {
    const grouped = Object.fromEntries(
      TOKEN_LAYERS.map((layer) => [layer, [] as BoardToken[]]),
    ) as Record<TokenLayer, BoardToken[]>

    for (const token of tokens) {
      if (token.position === null) continue
      if (hideFogged && token.hiddenFromParty) continue
      grouped[token.layer].push(token)
    }
    // Big tokens underneath. A hero standing on a dragon's four-square footprint would
    // otherwise be unclickable, since the last node drawn is the one the pointer hits.
    for (const layer of TOKEN_LAYERS) grouped[layer].sort((a, b) => b.sizeSquares - a.sizeSquares)
    return grouped
  }, [tokens, hideFogged])

  return (
    <>
      {TOKEN_LAYERS.map((layer) => {
        const style = TOKEN_LAYER_STYLES[layer]
        // Three reasons not to draw one, in the order of how far each is trusted: what
        // this caller is, what they have chosen to look at, and whether there is anything
        // on it. The last is what keeps an empty layer absent rather than transparent.
        if (style.dmOnly && !isDm) return null
        if (!shown.has(layer)) return null

        const layerTokens = byLayer[layer]
        if (layerTokens.length === 0) return null

        return (
          <Layer
            key={layer}
            opacity={style.opacity}
            // The shared predicate, so the cursor and the server agree about scenery by
            // reading one rule rather than by two files describing it. The DM keeps the
            // pointer on every layer, which is what makes the GM layer's own `false` moot
            // — it is only ever drawn for them in the first place.
            listening={isDm || mayPlayersMove(layer)}
          >
            {layerTokens.map((token) => (
              <TokenCoin
                key={token._id}
                token={token}
                scene={scene}
                scale={scale}
                selected={token._id === selectedId}
                // `canMove` is an affordance: it stops a player wrestling with a token
                // that is not theirs, and the server refuses the write regardless.
                draggable={draggable && token.canMove}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onOpenHp={onOpenHp}
                onContextMenu={onContextMenu}
              />
            ))}
          </Layer>
        )
      })}
    </>
  )
})
