import { memo, useMemo } from 'react'
import { Group } from 'react-konva'

// The disc itself, shared with the stat badges on the other shoulder — see its docblock
// for why it stopped being local to this file.
import { TokenPip } from '@/components/board/TokenPip'

import {
  PIP_DIAMETER,
  PIP_FONT_SIZE,
  PIP_GAP,
  PIP_ROW_GAP,
  PIP_UNIT,
  PIP_STROKE,
  TOKEN_MARKER_PIPS,
  markerRow,
} from '@/lib/markers'

/**
 * The `+n` counter's fill.
 *
 * ⚠️ **Deliberately not `PIP_DEAD`**, which is the near-black of the one condition
 * nobody may misread. A counter in that colour would be a disc saying *dead* to anybody
 * reading colour first, which is precisely how this row is meant to be read. Slate is a
 * family of its own and belongs to nothing in the vocabulary, which is what makes it
 * legible as *and some more* rather than as a condition.
 */
const COUNTER_FILL = '#475569'

export type TokenMarkerPipsProps = {
  /** Exactly what the server stored. Never mapped over — see `markerRow`. */
  markers: readonly string[]
  /** The coin's radius, in image-space pixels. */
  radius: number
  scale: number
}

/**
 * The conditions on a coin, as a centred row of small discs under its rim.
 *
 * ⚠️ **A pip decides nothing and means nothing to this application.** Nothing in
 * `convex/` reads a marker — no roll consults one, no health band is computed from one,
 * no drag is refused because of one — and `markerGuard.test.ts` is what makes that a
 * promise rather than a comment. So this component draws what it was sent and there is
 * no rule anywhere downstream of it; the table adjudicates a condition exactly as it
 * would if somebody had said it out loud.
 *
 * ⚠️ **`markerRow` is handed the stored array unnarrowed and iterates the *vocabulary*,
 * never the array.** That is the fail-closed behaviour the marker union has instead of a
 * `never` arm (CLAUDE.md invariant 9's exception, argued in `convex/lib/markers.ts`), and
 * the case it exists for is an older bundle reading a newer deployment: GitHub Pages
 * serves a cached bundle, a condition this browser's union has never heard of arrives in
 * the row, and mapping over it would take that string to a `TOKEN_MARKER_PIPS` lookup
 * inside JSX, read `undefined.glyph` and take down **the whole board** — every coin, not
 * just the goblin somebody ticked. Intersecting drops it silently, which is exactly right
 * for a label that adjudicates nothing.
 *
 * **Deaf, hardcoded, and not a prop.** Every overlay on this board opts out of the
 * pointer and opts back in only where it draws something to click — `TokenHpPopover`
 * states the rule and `DiceTrayLayer` and `FogLayer` inherit it — and here it is also
 * what keeps the coin pickable by every part of itself. A seventeen-disc row hanging off
 * the bottom of a creature is a strip the DM's cursor crosses on the way to it, and a
 * pip that ate that press would be a token that cannot be dragged downwards, failing
 * silently because there is nothing on screen to explain it.
 *
 * Memoised on the same terms as `TokenHealthBar`: `markers` comes from the join in
 * `useBoard` by reference — a board with nothing ticked hands every coin one shared
 * empty array — so a pan reconciles nothing here, and the single `useMemo` below is the
 * only allocation this makes per render.
 *
 * Drawn as a child of the token's own `Group`, so it travels with the coin for free,
 * including through the imperative node moves `useSmoothPositions` makes between React
 * renders.
 */
export const TokenMarkerPips = memo(function TokenMarkerPips({
  markers,
  radius,
  scale,
}: TokenMarkerPipsProps) {
  // Screen pixels are what the capacity is expressed in — a pip stays a ten-pixel pip on
  // a one-square goblin and on a four-square dragon — so the coin's drawn width is its
  // image-space diameter through the camera, which is the one thing this needs `scale`
  // for besides dividing every length below by it.
  const row = useMemo(() => markerRow(markers, radius * 2 * scale), [markers, radius, scale])

  const { shown, overflow } = row
  // Nothing ticked, nothing this bundle recognises, or a coin too small to hold a disc.
  // No `Group`, no nodes, and no strip reserved under the rim.
  if (shown.length === 0 && overflow === 0) return null

  // The counter occupies the last slot when there is one, which is why `markerRow`
  // shows `capacity - 1` pips on a collapse: the row is as wide as what it draws.
  const slots = shown.length + (overflow > 0 ? 1 : 0)
  const pipRadius = PIP_DIAMETER / 2 / scale
  const step = PIP_UNIT / scale
  const width = (slots * PIP_DIAMETER + (slots - 1) * PIP_GAP) / scale
  // Centred on the coin, and hung below the rim by the gap the row's height is measured
  // from — `MARKER_ROW_SCREEN_HEIGHT` is the same three constants, which is what lets
  // `TokenCoin` push the name down by exactly this row without doing the arithmetic
  // again.
  const left = -width / 2 + pipRadius
  const y = radius + (PIP_ROW_GAP + PIP_DIAMETER / 2) / scale
  const fontSize = PIP_FONT_SIZE / scale
  const stroke = PIP_STROKE / scale

  return (
    <Group listening={false}>
      {shown.map((marker, index) => (
        <TokenPip
          key={marker}
          x={left + index * step}
          y={y}
          radius={pipRadius}
          stroke={stroke}
          fontSize={fontSize}
          fill={TOKEN_MARKER_PIPS[marker].fill}
          glyph={TOKEN_MARKER_PIPS[marker].glyph}
        />
      ))}

      {/* The same disc in a colour belonging to no condition. ⚠️ At two digits — ten or
          more conditions collapsed onto a coin small enough to hold one pip — `+12` is
          tight inside ten pixels and will clip rather than shrink, and that is the honest
          limit of a disc this size rather than something to fix with a smaller font: a
          glyph below seven pixels is not read, it is guessed at. The way out is the
          authoritative reading in words, which is two presses away in the editor and in
          the board menu. */}
      {overflow > 0 ? (
        <TokenPip
          x={left + shown.length * step}
          y={y}
          radius={pipRadius}
          stroke={stroke}
          fontSize={fontSize}
          fill={COUNTER_FILL}
          glyph={`+${overflow}`}
        />
      ) : null}
    </Group>
  )
})
