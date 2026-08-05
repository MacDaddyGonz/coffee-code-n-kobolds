import type { ReactElement } from 'react'
import { Circle, Group, Text } from 'react-konva'

import { PIP_INK } from '@/lib/markers'

/**
 * The dark ring every pip is drawn with.
 *
 * A stroke rather than a shadow, and it is not decoration: five fills have to read on
 * whatever map art happens to be under them, and a ten-pixel disc of amber on a sandy
 * tavern floor is a disc nobody can find. `TokenCoin`'s hidden mark and
 * `TokenHealthBar`'s track make the same choice with the same reasoning — a blurred
 * canvas shadow is the most expensive primitive on this board and is paid once per pip
 * per creature per frame of a pan, where a hairline stroke is free.
 */
export const PIP_EDGE = 'rgba(2, 6, 23, 0.75)'

export type TokenPipProps = {
  /** Centre, in image space. The caller positions; this draws. */
  x: number
  y: number
  /**
   * ⚠️ **All three of these arrive already divided by the camera scale.** The child does
   * no arithmetic at all, which is the property worth keeping: every screen-pixel constant
   * on this board is `k / scale`, and a component that took the scale would be a second
   * place that decides what a pip's size means.
   */
  radius: number
  stroke: number
  fontSize: number
  fill: string
  /** One or two characters. A condition's letter, a `+n` counter, or an armour class. */
  glyph: string
}

/**
 * ONE DISC AND THE CHARACTER ON IT — the shape every annotation on a coin's rim is made of.
 *
 * **A module of its own because there are three callers now**, and the third is what moved
 * it. It began local to `TokenMarkerPips`, where the argument was that the `+n` counter is
 * the same disc as a condition and only the fill and the glyph differ — *"two copies is
 * where a stroke width gets tuned on the pips and not on the `+n` beside them"*. The
 * armour-class and passive-perception badges are the same disc again, and the second copy
 * had already drifted before anybody looked: its edge ink was `0.85` against this `0.75`,
 * and it centred its glyph by guessing at half a line height instead of using Konva's own
 * vertical alignment.
 *
 * The text is centred the way `TokenCoin` centres its initials: a box the size of the disc,
 * anchored at its top-left, with Konva doing both alignments. Konva has no way to centre a
 * glyph on a point, and measuring one per pip per frame is not a thing to do on a board of
 * two hundred coins.
 *
 * `PIP_INK` for every fill — `@/lib/markers` argues it: every fill is dark enough that
 * white reads on it, and a per-fill ink is a second table whose failure mode is a pip that
 * has gone invisible on exactly one condition.
 *
 * `listening` is deliberately not set here and belongs to the caller's `Group`: these are
 * annotations, and anything over the canvas that eats a click is a token the DM cannot pick
 * up. Both callers turn it off one level up.
 */
export function TokenPip({
  x,
  y,
  radius,
  stroke,
  fontSize,
  fill,
  glyph,
}: TokenPipProps): ReactElement {
  return (
    <Group x={x} y={y}>
      <Circle
        radius={radius}
        fill={fill}
        stroke={PIP_EDGE}
        strokeWidth={stroke}
        perfectDrawEnabled={false}
      />
      <Text
        text={glyph}
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle="bold"
        fill={PIP_INK}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}
