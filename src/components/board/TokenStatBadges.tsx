import type { ReactElement } from 'react'
import { Group } from 'react-konva'

import { TokenPip } from '@/components/board/TokenPip'
import { PIP_BADGE_FONT_SIZE, PIP_DIAMETER, PIP_STROKE } from '@/lib/markers'
import { COIN_STATS, COIN_STAT_COLOUR, coinStatOf } from '@/lib/vitals'
import type { CoinStat } from '@/lib/vitals'
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

/**
 * Which shoulder each stat takes: `-1` is the upper one, `1` the lower.
 *
 * ⚠️ **A `Record` over the union rather than an index into an array, and that is the whole
 * of what makes a third published stat a compile error here.** ADR 0014's consequences end
 * with *"there is no seventh obvious place, so a seventh annotation is a layout decision
 * rather than a position to pick"* — the two left shoulders are the two slots, and there is
 * genuinely no third. A member added to `COIN_STATS` therefore has to be given a place by a
 * person, in the same commit, instead of quietly stacking on top of one of these two.
 *
 * The colours live in `@/lib/vitals` beside the vocabulary rather than here, because the
 * hover card prints the same two stats and a badge whose disc and whose row disagreed about
 * red would read as two different facts.
 */
const COIN_STAT_SLOT: Record<CoinStat, number> = {
  armourClass: -1,
  passivePerception: 1,
}

export type TokenStatBadgesProps = {
  /**
   * The coin's vitals row. **Both numbers ride here** — see the ⚠️ on
   * `publicVitalsValidator`: they are on both variants of the union, so this component
   * needs no branch on `kind` and must not grow one. A band row and an exact row answer
   * this question identically, which is the whole point of publishing them.
   *
   * Non-nullable, because the caller gates on it: `TokenCoin` renders this only for
   * `showDetail && token.vitals`, which is the same gate the health bar and the condition
   * row have and exists for the same reason — during a wheel-zoom `scale` busts the coin's
   * memo every frame, so an ungated component is two hundred mounts a frame to reach an
   * early return.
   */
  vitals: PublicVitals
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
 * a GM-layer or fogged creature arrives with no `vitals` and this component is never
 * mounted. **There is no `isDm` here and adding one would be a bug rather than a feature**,
 * exactly as `TokenHealthBar`'s docblock says of the band: a renderer that could decide what
 * to show would already have been handed the secret.
 *
 * **Each badge is omitted when its number is `null`, and `null` is a real answer.** A
 * hand-built goblin whose DM never recorded a passive perception has no blue circle — and
 * drawing 10 there would be inventing a statistic the table would then act on, which
 * `passivePerceptionOf` refuses on the server for the same reason.
 *
 * The disc is `TokenPip`, the same one the condition row draws, which is what makes the
 * request that prompted all this — *the conditions should be bigger, like the AC example* —
 * literally true rather than approximately: one constant sizes both.
 */
export function TokenStatBadges({
  vitals,
  radius,
  scale,
}: TokenStatBadgesProps): ReactElement | null {
  // Every screen-pixel constant divided once, here, so the child does no arithmetic — the
  // property that made `TokenPip` worth sharing rather than copying.
  const pipRadius = PIP_DIAMETER / 2 / scale
  const stroke = PIP_STROKE / scale
  const fontSize = PIP_BADGE_FONT_SIZE / scale
  const x = -radius * BADGE_X
  const y = radius * BADGE_Y

  // ⚠️ **Iterated from `COIN_STATS` rather than written out as two entries**, which is the
  // formulation CLAUDE.md invariant 9 asks a renderer for and is what it was: two hand-built
  // objects naming their own fields off the payload. The `null` filter is what the two
  // ternaries before them were, and it is load-bearing — a badge is *omitted* rather than
  // defaulted, because a blue circle reading 10 over a creature whose DM never recorded a
  // passive perception is a statistic the table would act on.
  const badges = COIN_STATS.map((stat) => ({
    stat,
    value: coinStatOf(vitals, stat),
    y: y * COIN_STAT_SLOT[stat],
  })).filter((badge) => badge.value !== null)

  if (badges.length === 0) return null

  return (
    <Group listening={false}>
      {badges.map((badge) => (
        <TokenPip
          key={badge.stat}
          x={x}
          y={badge.y}
          radius={pipRadius}
          stroke={stroke}
          fontSize={fontSize}
          fill={COIN_STAT_COLOUR[badge.stat]}
          glyph={String(badge.value)}
        />
      ))}
    </Group>
  )
}
