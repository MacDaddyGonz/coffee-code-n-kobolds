// How hit points are drawn, in one place, because they are drawn twice: as HTML on
// the character sheet and as Konva shapes above a token on the canvas. A colour
// defined on each side is two colours the moment one of them is adjusted.
//
// Deliberately free of React and Konva imports so both renderers can take it.

import type { PublicVitals } from '@convex/lib/characters'
import type { HealthBand } from '@convex/lib/sheet'
import { healthBand } from '@convex/lib/sheet'

/**
 * What a player is told about a creature they may not have the numbers for.
 *
 * The words matter more than they look. `down` is the one state the party will act
 * on immediately, so it has to read as unambiguous — and the server guarantees it
 * means what it says rather than being where the arithmetic rounded to.
 */
export const BAND_LABEL: Record<HealthBand, string> = {
  healthy: 'Healthy',
  bloodied: 'Bloodied',
  critical: 'Badly hurt',
  down: 'Down',
}

export const BAND_COLOUR: Record<HealthBand, string> = {
  healthy: '#22c55e',
  bloodied: '#eab308',
  critical: '#ef4444',
  down: '#6b7280',
}

// There is deliberately no per-band ink here. One was added, to let the token
// health bar drop the blurred shadow behind its label, and removed again once it
// turned out the label sits on the fill and the track at the same time — see the
// note beside that label in `TokenHealthBar.tsx`, which is where the reasoning is
// worth reading.

/**
 * How full to draw the bar for a band.
 *
 * A band is not a ratio, so these are presentation: four widths that read as "most
 * of it left", "about half", "nearly gone", "empty". Deliberately *not* the
 * midpoint of each band's real range — a bar that stopped exactly at 0.375 would
 * invite reading a number back off it, and there is no number to read.
 */
export const BAND_FILL: Record<HealthBand, number> = {
  healthy: 1,
  bloodied: 0.5,
  critical: 0.2,
  down: 0,
}

/**
 * The ward's colour — temporary hit points, which are **not** hit points.
 *
 * ⚠️ **Deliberately outside `BAND_COLOUR` and deliberately not a fifth band.** The four
 * above are degrees of one quantity and are chosen to be read against each other; this is a
 * *different* quantity that happens to be drawn beside them, so it has to be a colour no
 * band could ever be mistaken for. Sky blue is the one hue in this application already
 * reserved for a fact about a creature rather than a state of it — `PP_FILL` on the coin's
 * passive-perception badge is the same family — and nothing in the health vocabulary is
 * anywhere near it.
 */
export const WARD_COLOUR = '#38bdf8'

/**
 * Temporary hit points, or `null` for a viewer who was not sent any.
 *
 * ⚠️ **`null` here means *there is no such field in this payload*, and it is not the same
 * answer as `0`.** A player looking at a goblin holds the `band` variant, which has no
 * `temporaryHp` member at all — so there is nothing to draw, no ward, and no hint that one
 * might exist. That is CLAUDE.md invariant 1 arriving as a *type*: the discriminated union
 * makes "hide it in the client" unwriteable, because the number was never sent. A caller
 * that wants a number for the arithmetic should read `0` from a *missing* row itself and
 * say why; this function refuses to make that decision on its behalf.
 */
export function temporaryHpOf(vitals: PublicVitals): number | null {
  return vitals.kind === 'exact' ? vitals.temporaryHp : null
}

/**
 * How much of the coin's width the ward strip spans.
 *
 * ⚠️ **Scaled against `max` as a *comparison* and never as a claim that it is part of it.**
 * Temporary hit points are not healing and are not part of the maximum — `clampTemporaryHp`
 * on the server has nowhere to pass a ceiling, on purpose — so the only honest reason to
 * measure them against `max` is that a reader needs to know whether the ward is worth a
 * point of damage or worth the whole fight. That is why the *renderer* draws them as a
 * separate strip in a separate colour rather than as more of the same bar: the proportion
 * is a comparison, and the geometry is what stops it reading as an addition.
 *
 * A ward larger than the character's maximum fills the strip and stops. Saturating rather
 * than overflowing is the right failure for a comparison — 30 temporary on a maximum of 8
 * is *plenty*, and a strip two and a half coins wide would say something about the
 * neighbouring creature instead.
 */
export function wardFraction(vitals: PublicVitals): number {
  if (vitals.kind !== 'exact' || vitals.temporaryHp <= 0) return 0
  return vitals.max <= 0 ? 1 : Math.min(1, vitals.temporaryHp / vitals.max)
}

/** How full to draw the bar, whichever kind of answer arrived. */
export function healthFraction(vitals: PublicVitals): number {
  if (vitals.kind === 'band') return BAND_FILL[vitals.band]
  if (vitals.max <= 0) return 0
  return Math.min(1, Math.max(0, vitals.current / vitals.max))
}

/**
 * The colour of the bar. Exact numbers get the same four colours as the bands, at
 * the same thresholds, so the DM's view of a goblin and a player's view of it are
 * recognisably the same creature in the same state.
 *
 * `healthBand` does the deciding rather than a second copy of its two thresholds.
 * This module's own header objects to a colour being defined twice; re-deriving the
 * bands here from literal `0.5` and `0.25` was the same fault one level up, and its
 * failure mode is worse than a mismatched yellow — move a threshold server-side and
 * the DM's exact bar and a player's band would describe the same goblin
 * differently, which nobody notices until two people compare screens mid-fight.
 * Reusing the function also inherits its guarantee that a creature with hit points
 * left is never drawn as `down`.
 */
export function healthColour(vitals: PublicVitals): string {
  return BAND_COLOUR[
    vitals.kind === 'band' ? vitals.band : healthBand(vitals.current, vitals.max)
  ]
}

/**
 * What to print on the bar: `20/45` for a hero, a word for a monster a player is
 * looking at.
 *
 * There is nothing hidden behind the word. For an NPC on a player's screen the
 * exact values were never sent to this browser, so this is formatting what arrived
 * rather than choosing what to reveal — CLAUDE.md invariant 1 is settled on the
 * server, and a renderer that had to decide would already have been sent the
 * secret.
 */
export function healthLabel(vitals: PublicVitals): string {
  return vitals.kind === 'exact'
    ? `${vitals.current}/${vitals.max}`
    : BAND_LABEL[vitals.band]
}
