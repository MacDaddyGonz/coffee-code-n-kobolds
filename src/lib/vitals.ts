// What a vitals row says about a creature *other than how many hit points it has* — the
// 2024 state that arrived with the conversion, in the one place the three surfaces that
// read it can share.
//
// `health.ts` next door owns the bar: the bands, the colours, the fractions and the ward.
// This owns the tally and the flag, which are drawn as pips and a badge and never as a
// width. Two modules because they are two subjects, and because a reader looking for "how
// wide is the bar" and a reader looking for "how many boxes are ticked" should not have to
// read past each other.
//
// ⚠️ **NOTHING HERE DECIDES ANYTHING, AND THAT IS THE WHOLE OF THE DESIGN.** Three ticked
// failure boxes is three ticked boxes: no character dies, no heal is refused, no marker is
// set, no band is recomputed and no die anywhere rolls differently. CLAUDE.md's *Rules
// scope* names *"no death save kills a character"* as a standing exclusion, and
// `setDeathSaves` in convex/characters.ts carries the same warning at the write end. The
// place a reader will most want to break it is a renderer — a `if (failures >= 3)` beside
// the pips that greys the coin out — and this is the module such a line would be written
// in, which is why the warning is at the top of it rather than buried beside one function.
//
// Deliberately free of React and Konva imports, like `health.ts` and `markers.ts`, so the
// same answers reach the HTML card and the popover's controls, and so this is testable as
// arithmetic rather than through a rendered component.

import type { PublicVitals } from '@convex/lib/characters'
import { MAX_DEATH_SAVES } from '@convex/lib/sheet'

/**
 * THE TWO PUBLISHED SHEET NUMBERS A COIN CARRIES, as a vocabulary.
 *
 * ⚠️ **These two and no others, and a third is a decision rather than an entry.**
 * [ADR 0014](../../docs/adr/0014-what-a-coin-says-about-itself.md) published a creature's
 * armour class and passive perception to every player who can already see its coin — the
 * only time this project has taken a secret it was keeping and given it away — and it says
 * in terms that **a third published stat is a second decision needing its own ADR**. So
 * adding a member to this array is not a rendering change: it is a claim that some further
 * number is on `publicVitalsValidator` for every audience, which it will not be until
 * somebody has argued for it.
 *
 * The `Record`s below and `COIN_STAT_SLOT` in `TokenStatBadges` are what make that
 * mechanical rather than remembered — a third member fails `npm run lint` in three places,
 * one of which is the one that has no shoulder left to draw it on.
 */
export const COIN_STATS = ['armourClass', 'passivePerception'] as const
export type CoinStat = (typeof COIN_STATS)[number]

/** The full words, for the card, which has room for them and is the authoritative reading. */
export const COIN_STAT_LABELS: Record<CoinStat, string> = {
  armourClass: 'Armour class',
  passivePerception: 'Passive perception',
}

/** Two letters, for a screen reader over a coin badge that is drawn as a bare number. */
export const COIN_STAT_ABBREVIATIONS: Record<CoinStat, string> = {
  armourClass: 'AC',
  passivePerception: 'PP',
}

/**
 * Red for the thing you are trying to beat, blue for the thing that notices you — and blue
 * is deliberately distinguishable from every one of the five condition families in
 * `markers.ts`, because the two sit on the same coin as the same size of disc.
 */
export const COIN_STAT_COLOUR: Record<CoinStat, string> = {
  armourClass: '#b91c1c',
  passivePerception: '#1d4ed8',
}

/**
 * One published number off a vitals row, whichever variant arrived.
 *
 * ⚠️ **No branch on `kind`, and there must not be one.** Both members of
 * `publicVitalsValidator` carry both of these, on purpose: putting them on `exact` alone
 * would show a granted pet's armour class and hide the goblin's standing beside it, which is
 * not *the number on the coin* but an invisible permission rule expressed as a missing
 * badge. ADR 0014 rejected exactly that narrowing by name.
 *
 * ⚠️ **`null` is a real answer and must stay reachable.** A hand-built goblin whose DM never
 * recorded a passive perception has none, and printing 10 would invent a statistic the table
 * would then act on. `passivePerceptionFor` on the server refuses to default it for the same
 * reason; a renderer that filled the gap in would undo that one file later.
 */
export function coinStatOf(vitals: PublicVitals, stat: CoinStat): number | null {
  return vitals[stat]
}

/**
 * `+3`, `−1`, `+0` — a modifier with its sign always shown.
 *
 * ⚠️ **A second copy of `signed` in `@/components/sheet/SheetFields`, and it is recorded as
 * one rather than left to be discovered.** The two halves of this milestone are being built
 * in parallel and that module belongs to the other one, so importing across would be a
 * coupling neither side agreed to. They should become one function — this file is the better
 * home, since it has no React in it — and until then this comment is what stops a third copy
 * being written by somebody who found neither.
 *
 * A true minus sign rather than a hyphen, which is `rollWorking`'s choice in lib/roll.ts and
 * is worth matching: the two appear a centimetre apart when a feed row and a card are both
 * on screen.
 */
export function signedBonus(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`
}

/**
 * The two columns of a death-save tally, as a vocabulary rather than as two names written
 * out in markup.
 *
 * CLAUDE.md invariant 9's renderer rule applied to the smallest union in the application:
 * the array **is** the order the columns are drawn in, so a third column — a table that
 * counts natural twenties separately, say — arrives with a row rather than with nowhere to
 * be drawn, and the two `Record`s below fail to compile until somebody has decided what it
 * looks like. Two members is not too few for the rule to be worth keeping; it is the size
 * at which writing them out inline looks most obviously harmless.
 */
export const DEATH_SAVE_COLUMNS = ['successes', 'failures'] as const
export type DeathSaveColumn = (typeof DEATH_SAVE_COLUMNS)[number]

export const DEATH_SAVE_LABELS: Record<DeathSaveColumn, string> = {
  successes: 'Successes',
  failures: 'Failures',
}

/**
 * The ink for a ticked box in each column.
 *
 * Green and red, which is the one place in this application those two carry their obvious
 * meaning without adjudicating anything — the same green as `healthy` and the same red as
 * `critical`, taken from `BAND_COLOUR` by eye rather than by import, because a band and a
 * death save are unrelated facts that would then be coupled by a shared constant.
 */
export const DEATH_SAVE_COLOUR: Record<DeathSaveColumn, string> = {
  successes: '#22c55e',
  failures: '#ef4444',
}

/**
 * The tally, or `null` for a viewer who was not sent one.
 *
 * ⚠️ **`null` is *there is no such field in this payload* and not *nobody has rolled
 * any*.** A player looking at a goblin holds the `band` variant, which carries neither
 * column — so the card draws no boxes and says nothing about their absence. That is
 * CLAUDE.md invariant 1 arriving as a type rather than as a condition somebody remembered
 * to write: a renderer that *could* choose to hide this would already have been handed it.
 *
 * Both columns come back together for the reason `deathSavesOf` on the server gives: they
 * are one tally, and two accessors would be two places to decide independently what an
 * absent answer means.
 */
export function deathSavesOf(vitals: PublicVitals): Record<DeathSaveColumn, number> | null {
  if (vitals.kind !== 'exact') return null
  return { successes: vitals.deathSaveSuccesses, failures: vitals.deathSaveFailures }
}

/**
 * Heroic Inspiration, or `null` for a viewer who was not sent the flag. Same rule as above,
 * and `null` is again distinct from `false`: one means *not shown a badge*, the other means
 * *shown, and empty*.
 */
export function heroicInspirationOf(vitals: PublicVitals): boolean | null {
  return vitals.kind === 'exact' ? vitals.heroicInspiration : null
}

/**
 * A column's boxes, as ticked-or-not, for a renderer that draws one element per box.
 *
 * The length is `MAX_DEATH_SAVES` from the server, not a literal three: the clamp the
 * mutation applies and the number of boxes on screen are the same fact, and a screen with
 * three boxes over a clamp of five is a tally a DM cannot finish entering.
 *
 * A stored count outside the range is tolerated rather than refused — an older bundle
 * reading a newer deployment is the case, and `normaliseMarkers`' argument transfers
 * exactly: dropping the extra tick costs one undrawn box, where trusting the number costs
 * an array of that length inside JSX.
 */
export function deathSaveTicks(count: number): boolean[] {
  const filled = Math.min(MAX_DEATH_SAVES, Math.max(0, Math.round(count)))
  return Array.from({ length: MAX_DEATH_SAVES }, (_, index) => index < filled)
}

/**
 * What pressing the box at `index` should set the column to.
 *
 * ⚠️ **Pressing the last ticked box unticks it, which is the whole reason this is a
 * function rather than `index + 1` written at the call site.** Without it a tally can only
 * ever go up, and the way a DM actually uses this is that somebody miscounted — so the
 * gesture that fixes a wrong third failure has to be pressing the third failure. Every
 * other press sets the column to the box that was pressed, so going from one to three is
 * one click rather than two.
 *
 * It is arithmetic on a counter and adjudicates nothing: see this module's header. The
 * server clamps the result again regardless, which is what makes this an affordance.
 */
export function nextDeathSaveCount(current: number, index: number): number {
  const pressed = index + 1
  return current === pressed ? index : pressed
}
