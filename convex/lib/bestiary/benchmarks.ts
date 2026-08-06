// What a creature of each challenge rating is *supposed* to look like. Ten rows, one per
// entry in `CR_VALUES`, and the scaler in ./scale.ts is the only thing that reads them.
//
// This is content, and it is the most consequential content in the corpus: a stat block is
// wrong on its own, whereas a wrong row here is wrong on every creature that passes
// through it. What follows is therefore the reasoning behind the numbers rather than a
// description of them, because the numbers themselves are in the table and the reasoning
// is what the next person to tune it will otherwise have to guess at.
//
// ⚠️ **HALF OF WHAT FOLLOWS IS A FITTED CURVE AND HALF IS A DESIGN CONSTRAINT, AND THEY ARE
// RE-DERIVED ON COMPLETELY DIFFERENT TERMS.** The rows below were re-fitted to the D&D 5e
// (2024) SRD 5.2.1's own two hundred and fifty-three stat blocks at CR 0–6, replacing
// numbers that had been fitted to a hand-written corpus that no longer exists. But three
// things in this file are **not** fits and did not move, because they are arguments from
// arithmetic that the source cannot settle: `hp[0]`, `damage[0]`, and the CR 1 → CR 4 damage
// ratio. Read the four sections below and know which kind you are looking at before
// changing anything.
//
// ---------------------------------------------------------------------------
// 1. FITTED. The rows themselves.
// ---------------------------------------------------------------------------
//
// **The calibration is now the SRD's own median creature at each rating**, taken over every
// stat block in range: 29 at CR 0, 19 at CR ⅛, 32 at CR ¼, 27 at CR ½, 27 at CR 1, 42 at
// CR 2, 25 at CR 3, 16 at CR 4, 25 at CR 5 and 11 at CR 6. Hit points, armour class, attack
// bonus, save DC and skill bonus are read off the printed stat block; `damage` is the
// average of the creature's whole attack routine with Multiattack expanded, which is the
// same quantity `bestiary.test.ts` measures a stored creature by, so the column and the
// check are calibrated against one another rather than against two ideas of a round.
//
// Recalibrating means re-running `scripts/srd/creatures.mjs --check` and re-reading its
// report, not adjusting a percentage.
//
// ⚠️ **This replaced a calibration against `lib/library/`'s premade sheets**, which reasoned
// from a party of four putting out roughly 30 a round at level 1 and 80 at level 5. That
// argument was sound and is simply no longer the one in force: a table fitted to the SRD's
// creatures and a table fitted to this application's heroes are two different tables, and
// the roadmap's conversion chose the first. If a session plays badly, the honest fix is to
// re-open *that* question rather than to nudge a cell.
//
// ---------------------------------------------------------------------------
// 2. CONSTRAINT, AND THE SRD DOES NOT GET A VOTE. `hp[0]` and `damage[0]`.
// ---------------------------------------------------------------------------
//
// **`hp[0]` is 4 and `damage[0]` is 2, where the SRD's own CR 0 creatures would say 3 and
// 1**, and the reason is that these are the smallest denominators in the table and therefore
// the largest amplifiers. Every scale from CR 0 divides by them.
//
// The SRD's CR 0 creatures run from 1 hit point (the Bat, the Rat, the Owl, the Hawk) to 13
// (the Shrieker Fungus), and taking `hp[0] = 1` from that — or even the median 3 — is exactly
// the failure this paragraph exists to prevent: at `hp[0] = 1`, one hit point of difference
// between two CR 0 creatures becomes 120 hit points at CR 6, and every possible CR 0
// deviation is a whole-number multiple of the row, so there are no fine gradations available
// at all. Four gives a 25% quantum instead. At `damage[0] = 1`, the smallest roll the grammar
// permits is `1d2`, averaging 1.5, which is already a 1.5× deviation before anything has been
// scaled. Two keeps the bottom of the table usable in both directions.
//
// ⚠️ **This is the cell a re-derivation will reach for first, with the SRD in hand and a good
// argument.** It is still the wrong one.
//
// ---------------------------------------------------------------------------
// 3. CONSTRAINT. The CR 1 → CR 4 damage ratio is exactly 2.0×.
// ---------------------------------------------------------------------------
//
// **10 and 20**, and no other pair in the column is allowed to disturb those two cells'
// ratio. That is what makes the design's own illustration, `1d6+2` becoming `2d6+4`, a
// literal test fixture rather than a hand-wave: the ratio is exact, so the expected output is
// exact, so a test can assert it character for character.
//
// ⚠️ **The cells moved and the ratio did not**, which is the distinction to carry. They were
// 8 and 16 against the old corpus; the SRD's medians are 9 and 24, so a pair satisfying both
// the fit and the constraint had to be chosen, and 10/20 sits within about 10% of the median
// at CR 1 and 20% at CR 4 while being exactly 2.0×. A tuner who wants a different pair may
// have one — 12/24, 9/18 — but not a pair whose ratio is 2.4.
//
// ---------------------------------------------------------------------------
// 4. FITTED, AND ONE OF THEM BROKE. The shapes the columns make.
// ---------------------------------------------------------------------------
//
// **Two design shapes survived the re-derivation intact, which is worth stating because
// neither was aimed at.** `hp` still quadruples and a bit from CR 1 to CR 6 — 120/28 is 4.3×,
// where the old table's was 4.6× — while `armourClass` still moves by exactly three over the
// same span. A percentage applied to whatever numbers are already on a sheet cannot express
// both of those at once, and that incompatibility is still the whole argument for a table of
// rows instead of a multiplier.
//
// 🚫 **The three-column parallel is gone, and its going is a finding rather than a
// regression.** `attackBonus` used to be `armourClass − 9`, `saveDc` `armourClass − 1` and
// `skillBonus` `armourClass − 11`, on every row. In the 2024 SRD the offensive columns rise
// faster than the defensive one: across CR 0 to CR 6 the median attack bonus gains four
// points and the median armour class gains five, but they gain them at different ratings, so
// no single offset holds. The columns are still written out as literals, and now for a
// second reason as well as the first: there is no longer a formula that would reproduce
// them, so a reader has to see the numbers.
//
// ⚠️ **There is no initiative column and no passive-perception column. The arithmetic
// argument for that is unchanged; the calibration argument beside it was wrong and has been
// removed.** Initiative and passive perception are both *additive* against `skillBonus`, and
// in an additive transform the constant cancels:
//
//     pp_new = (10 + s_to) + (pp_old − (10 + s_from)) = pp_old + (s_to − s_from)
//
// So initiative, passive perception and every one of a creature's skill bonuses all take the
// same integer shift, and a column for either could only ever hold a number this one already
// implies. **That is a statement about how they *change* and it remains true.**
//
// 🚫 What is *not* true, and what this file used to imply by saying passive perception "is"
// `10 + skillBonus`, is that they sit at the same *level*. They do not, and the SRD is
// emphatic: across CR 0–6 the median passive perception moves from 11.5 to 14.7 and the
// median initiative from +0.9 to +3.3, while the median printed skill bonus moves from +3.7
// to +5.9 — because a `Skills` line lists only the skills a creature is *trained* in, and
// passive perception is ten plus a raw Wisdom modifier for the two thirds of the corpus with
// no Perception proficiency at all. `bestiary.test.ts` used to measure both against
// `10 + row.skillBonus` and would now fail on forty-five perfectly ordinary creatures; it
// measures them against their own SRD-derived bounds instead, and says so.
//
// ⚠️ **A solo CR 6 creature read straight off the bottom row dies in a round and a half**
// against a level 5 party, and that is intended rather than an oversight. The uplift for a
// boss comes from a Boss-role entry's own deviation *above* its row. **This is exactly the
// fix the next tuner will reach for, and it is the wrong one**, because `hp[6]` is shared —
// inflating it to make the boss survive inflates every CR 6 mook standing next to it, and
// turns a scaled group of four into a slog. Put the survivability on the creature, not on
// the row.

import { crIndex, type ChallengeRating } from '../creatures'

/**
 * One row of the benchmark table: what an average creature of this rating looks like.
 *
 * **The columns are read two different ways and the split is not cosmetic.**
 *
 * - **Ratio columns — `hp` and `damage`.** The creature's own number is multiplied by
 *   `to / from`, so a creature at 1.4× its row stays at 1.4× its new row. These are the
 *   two quantities where "twice as tough" is the meaningful comparison, and where a
 *   difference of one at the bottom of the table has to become a difference of many at the
 *   top.
 * - **Delta columns — `armourClass`, `attackBonus`, `saveDc` and `skillBonus`.** The
 *   difference between the rows is *added*. Multiplying a d20 bonus is meaningless: these
 *   are all measured against a fixed twenty-sided die, so the distance between an armour
 *   class of 13 and one of 16 is three points of difficulty whatever the rating, and
 *   1.23× of an armour class is not a statement about anything.
 *
 * Mixing the two up is the single easiest way to get this wrong. A ratio applied to armour
 * class would take a CR 0 creature's 11 to 16 on the way to CR 6 by coincidence and then
 * take a tanky one's 15 to 22, which is past what a level 5 party can hit at all.
 */
export type CrBenchmark = {
  /** The rating this row describes. Held here as well as in its position so a test can catch a misfile. */
  cr: ChallengeRating
  /** RATIO. Target maximum hit points. */
  hp: number
  /** DELTA. Target armour class. */
  armourClass: number
  /** DELTA. Target attack bonus — one number for the whole creature. */
  attackBonus: number
  /** RATIO. Target damage per round, averaged across the creature's attacks. */
  damage: number
  /** DELTA. Target save DC for a creature that forces saves. */
  saveDc: number
  /** DELTA. Target skill bonus — and therefore initiative and passive perception too. */
  skillBonus: number
}

/**
 * The ten rows, ascending, **one per entry of `CR_VALUES` and in that order.**
 *
 * **The ordering is what `benchmarkFor` relies on.** It takes the position `crIndex` gives it
 * and returns whatever row is sitting there, without reading the `cr` written on it — so a
 * misfiled row is a creature silently scaled against the wrong benchmark rather than a
 * lookup that fails. The `cr` field exists for the test, not for the lookup: it is what lets
 * one pin the two lists in agreement, the same way `crValidator` is pinned against
 * `CR_VALUES`.
 */
export const CR_BENCHMARKS: readonly CrBenchmark[] = [
  { cr: 0, hp: 4, armourClass: 11, attackBonus: 3, damage: 2, saveDc: 11, skillBonus: 3 },
  { cr: 0.125, hp: 9, armourClass: 12, attackBonus: 4, damage: 4, saveDc: 11, skillBonus: 4 },
  { cr: 0.25, hp: 14, armourClass: 12, attackBonus: 4, damage: 6, saveDc: 11, skillBonus: 4 },
  { cr: 0.5, hp: 21, armourClass: 12, attackBonus: 4, damage: 7, saveDc: 11, skillBonus: 4 },
  { cr: 1, hp: 28, armourClass: 13, attackBonus: 5, damage: 10, saveDc: 11, skillBonus: 4 },
  { cr: 2, hp: 45, armourClass: 13, attackBonus: 5, damage: 13, saveDc: 12, skillBonus: 4 },
  { cr: 3, hp: 64, armourClass: 14, attackBonus: 5, damage: 17, saveDc: 12, skillBonus: 4 },
  { cr: 4, hp: 79, armourClass: 15, attackBonus: 6, damage: 20, saveDc: 13, skillBonus: 5 },
  { cr: 5, hp: 103, armourClass: 15, attackBonus: 7, damage: 28, saveDc: 14, skillBonus: 5 },
  { cr: 6, hp: 120, armourClass: 16, attackBonus: 7, damage: 33, saveDc: 15, skillBonus: 6 },
]

/**
 * The row for a rating, or null for anything that is not one of the ten.
 *
 * **Null rather than a throw, and by position rather than by search.** `crIndex` is already
 * the set-membership test a stored rating is checked with, so this is the same question
 * asked once more — and a rating that is not one of the ten is exactly the case the CR
 * stepper's clamp exists to prevent and that `storedSheetProblem` refuses on write. Getting
 * one here means something upstream already went wrong, and the caller's answer is to hand
 * the creature back unscaled: this runs inside `characters.list`, where a throw would blank
 * the party panel for the whole table rather than misprint one creature. `findRole` and
 * `librarySheet` take the same stance for the same reason.
 */
export function benchmarkFor(cr: number): CrBenchmark | null {
  const index = crIndex(cr)
  if (index < 0) return null
  // Guarded against the table being short of a row rather than trusting `CR_VALUES` and
  // this file to have stayed the same length. The test pins them; this is what happens in
  // the seconds before somebody notices it does not.
  return CR_BENCHMARKS[index] ?? null
}
