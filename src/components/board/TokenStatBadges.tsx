import type { ReactElement } from 'react'
import { Circle, Group, Text } from 'react-konva'

import { PIP_DIAMETER, PIP_INK, PIP_STROKE } from '@/lib/markers'
import type { PublicVitals } from '@convex/lib/characters'

/**
 * Where the two badges sit on the rim: up-and-left and down-and-left, at **30° above and
 * below the horizontal** rather than at 45°.
 *
 * ⚠️ **The left side and not the right, because the right is taken.** `TokenCoin`'s own
 * note states the scheme: the health bar owns the strip above the rim, the name the strip
 * below, the hidden-from-party pip the upper-right shoulder, and the condition row the
 * strip between the rim and the name. These are the fifth and sixth, and the left shoulders
 * were the space left.
 *
 * ⚠️ **30° and not 45°, and that is a correction made by looking at a coin rather than at
 * the geometry.** `HIDDEN_ANGLE` is 45° and gets away with it because there is one of it;
 * a badge centred on the rim at 45° has half its disc *above* the rim, which is the health
 * bar's strip, and the bar spans the coin's full width — so at 45° the upper badge grazed
 * the bar's left end. Flattening to 30° drops the vertical offset from `0.707r` to `0.5r`
 * and moves both clear, of the bar above and of the condition row below. **The scheme is
 * six distinct positions; it is not a proof that no two ever touch**, and this is the pair
 * that showed the difference.
 */
const BADGE_X = Math.cos(Math.PI / 6)
const BADGE_Y = Math.sin(Math.PI / 6)

/** Armour class: red, the colour of the thing you are trying to beat. */
const AC_FILL = '#b91c1c'
/** Passive perception: blue, and distinguishable from every condition family. */
const PP_FILL = '#1d4ed8'
const BADGE_STROKE_INK = 'rgba(2, 6, 23, 0.85)'

/**
 * The glyph size. Smaller than the condition pips' relative to the disc, because these
 * hold **two digits** where a pip holds one letter — an armour class of 22 has to fit
 * inside the same circle as a `P`.
 */
const BADGE_FONT_SIZE = 8

export type TokenStatBadgesProps = {
  /**
   * The coin's vitals row, or null. **Both numbers ride here** — see the ⚠️ on
   * `publicVitalsValidator`: they are on both variants of the union, so this component
   * needs no branch on `kind` and must not grow one. A band row and an exact row answer
   * this question identically, which is the whole point of publishing them.
   */
  vitals: PublicVitals | null
  /** The coin's radius in image space. Same contract as every other annotation. */
  radius: number
  /** The camera's scale, so screen-pixel sizes stay screen-pixel sizes. */
  scale: number
}

/**
 * ARMOUR CLASS AND PASSIVE PERCEPTION, on the coin.
 *
 * ⚠️ **This draws a number that used to be a secret, and the guard is not here.** A
 * creature's armour class reached no player before ADR 0014; it does now, for every coin a
 * player can already see. What keeps that bounded is entirely server-side —
 * `visibleVitals` drops a creature the caller may not see before it builds a row at all, so
 * a GM-layer or fogged creature arrives as no `vitals` and this component draws nothing
 * because there was nothing to draw. **There is no `isDm` here and adding one would be a
 * bug rather than a feature**, exactly as `TokenHealthBar`'s docblock says of the band: a
 * renderer that could decide what to show would already have been handed the secret.
 *
 * **Each badge is omitted when its number is `null`, and `null` is a real answer.** An
 * unbound coin has no vitals at all. A hand-built goblin whose DM never recorded a passive
 * perception has no blue circle — and drawing 10 there would be inventing a statistic the
 * table would then act on, which `passivePerceptionOf` refuses on the server for the same
 * reason.
 *
 * `listening={false}` throughout: these are annotations, and anything over the canvas that
 * eats a click is a token the DM cannot pick up.
 */
export function TokenStatBadges({
  vitals,
  radius,
  scale,
}: TokenStatBadgesProps): ReactElement | null {
  if (vitals === null) return null

  const { armourClass, passivePerception } = vitals
  if (armourClass === null && passivePerception === null) return null

  // The same disc as a condition pip, deliberately: the request that added these asked for
  // the conditions to be *"bigger, like the AC example"*, so one constant is what makes
  // that literally true rather than approximately. `PIP_DIAMETER` moving moves both.
  const badgeRadius = PIP_DIAMETER / 2 / scale
  const x = -radius * BADGE_X
  const y = radius * BADGE_Y

  return (
    <>
      {armourClass === null ? null : (
        <Badge x={x} y={-y} fill={AC_FILL} value={armourClass} r={badgeRadius} s={scale} />
      )}
      {passivePerception === null ? null : (
        <Badge x={x} y={y} fill={PP_FILL} value={passivePerception} r={badgeRadius} s={scale} />
      )}
    </>
  )
}

/**
 * One filled disc with a number in it.
 *
 * A local component rather than the markup twice: the two differ by a colour, a number and
 * a sign on `y`, and three of the six props on the `Text` below are the fiddly centring
 * that a second copy gets subtly wrong. `TokenMarkerPips` makes the same call for the same
 * reason.
 */
function Badge({
  x,
  y,
  fill,
  value,
  r,
  s,
}: {
  x: number
  y: number
  fill: string
  value: number
  r: number
  s: number
}) {
  const fontSize = BADGE_FONT_SIZE / s

  return (
    <Group x={x} y={y} listening={false}>
      <Circle
        radius={r}
        fill={fill}
        stroke={BADGE_STROKE_INK}
        strokeWidth={PIP_STROKE / s}
        perfectDrawEnabled={false}
      />
      {/*
        Centred by giving the text a box the width of the disc and letting Konva place the
        line inside it — the arrangement `TokenMarkerPips` uses, and the reason it is worth
        stating is that the vertical half is not symmetric with the horizontal: `y` is the
        text's *top*, so it is offset by half the line height rather than by half the box.
        `fontSize * 0.5` is that half for the default line height of 1.
      */}
      <Text
        text={String(value)}
        x={-r}
        y={-fontSize * 0.5}
        width={r * 2}
        align="center"
        fontSize={fontSize}
        fontStyle="bold"
        fill={PIP_INK}
        wrap="none"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}
