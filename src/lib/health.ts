// How hit points are drawn, in one place, because they are drawn twice: as HTML on
// the character sheet and as Konva shapes above a token on the canvas. A colour
// defined on each side is two colours the moment one of them is adjusted.
//
// Deliberately free of React and Konva imports so both renderers can take it.

import type { PublicVitals } from '@convex/lib/characters'
import type { HealthBand } from '@convex/lib/sheet'

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
 */
export function healthColour(vitals: PublicVitals): string {
  if (vitals.kind === 'band') return BAND_COLOUR[vitals.band]

  const fraction = healthFraction(vitals)
  if (vitals.current <= 0) return BAND_COLOUR.down
  if (fraction > 0.5) return BAND_COLOUR.healthy
  if (fraction > 0.25) return BAND_COLOUR.bloodied
  return BAND_COLOUR.critical
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
