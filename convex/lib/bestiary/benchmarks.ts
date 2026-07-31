// What a creature of each challenge rating is *supposed* to look like. Ten rows, one per
// entry in `CR_VALUES`, and the scaler in ./scale.ts is the only thing that reads them.
//
// This is content, and it is the most consequential content in the corpus: a stat block is
// wrong on its own, whereas a wrong row here is wrong on every creature that passes
// through it. What follows is therefore the reasoning behind the numbers rather than a
// description of them, because the numbers themselves are in the table and the reasoning
// is what the next person to tune it will otherwise have to guess at.
//
// **The calibration was read out of lib/library/ rather than assumed.** A level 1 premade
// sheet runs an armour class of 12 to 18 and a maximum of 7 to 14 hit points, and deals
// something like 7.5 damage in a round; a level 5 sheet runs 12 to 19, a maximum of 27 to
// 50 (median around 38), and 15 to 25 a round. So a party of four is putting out roughly
// 30 a round at level 1 and roughly 80 at level 5, and those two figures are what these
// rows are aimed at. Official 5e CR maths assumes a full 5e character; a D&D Lite one has
// a reduced spell list, no inventory and its power spike at level 4, so the curve follows
// that party rather than the published one. Recalibrating means re-reading those sheets,
// not adjusting a percentage.
//
// **Two shapes in the table are constraints the design set, not accidents of arithmetic.**
// `hp` quadruples and a bit from CR 1 to CR 6 — 120/26 is 4.6× — while `armourClass` moves
// by exactly three over the same span. A percentage applied to whatever numbers are already
// on a sheet cannot express both of those at once, and that incompatibility is the whole
// argument for a table of rows instead of a multiplier. If a change to one of those two
// spans is wanted, it is a change to the design and both columns need looking at together.
//
// **`damage` is pinned so that CR 1 → CR 4 is exactly 2.0×** — 8 to 16, and nothing else in
// the column is allowed to disturb those two cells. That is what makes the design's own
// illustration, `1d6+2` becoming `2d6+4`, a literal test fixture rather than a hand-wave:
// the ratio is exact, so the expected output is exact, so a test can assert it character
// for character. Those two cells are load-bearing. Moving either breaks a fixture that is
// currently the clearest statement of what the scaler is for.
//
// **`hp[0]` is 4 and `damage[0]` is 2, where 5e would have 1 of each**, and the reason is
// that these are the smallest denominators in the table and therefore the largest
// amplifiers. Every scale from CR 0 divides by them. At `hp[0] = 1`, one hit point of
// difference between two CR 0 creatures becomes 120 hit points at CR 6, and every possible
// CR 0 deviation is a whole-number multiple of the row — there are no fine gradations
// available at all. Four gives a 25% quantum instead. At `damage[0] = 1`, the smallest roll
// the grammar permits is `1d4`, averaging 2.5, which is already a 2.5× deviation before
// anything has been scaled; every CR 0 creature would then explode on the way up. Two makes
// the weakest legal attack a modest 1.25× and keeps the bottom of the table usable.
//
// ⚠️ **A solo CR 6 creature read straight off the bottom row dies in a round and a half**
// against a level 5 party — 120 hit points against 80 a round — and that is intended rather
// than an oversight. The uplift for a boss comes from a Boss-role entry's own deviation
// *above* its row: a CR 6 boss written at 2.2× the row is 264 hit points, which is the
// three or four rounds a set-piece fight wants. **This is exactly the fix the next tuner
// will reach for, and it is the wrong one**, because `hp[6]` is shared — inflating it to
// make the boss survive inflates every CR 6 mook standing next to it, and turns a scaled
// group of four into a slog. Put the survivability on the creature, not on the row.
//
// The three columns after `armourClass` are currently **one competence curve read at three
// offsets**: `attackBonus` is `armourClass − 9`, `saveDc` is `armourClass − 1`, and
// `skillBonus` is `armourClass − 11`, on every row. They are written out as literal columns
// anyway, and deliberately, so that breaking the parallel — a bestiary where things get
// harder to hit faster than they get better at hitting — is an edit to three numbers rather
// than a restructuring of the table.
//
// **There is no initiative column and no passive-perception column, and that falls out of
// the arithmetic rather than being a corner cut.** Initiative is additive against
// `skillBonus` and passive perception is `10 + skillBonus`, and in an additive transform the
// constant cancels:
//
//     pp_new = (10 + s_to) + (pp_old − (10 + s_from)) = pp_old + (s_to − s_from)
//
// So initiative, passive perception and every one of a creature's skill bonuses all take
// the same integer shift, and a separate column for either could only ever hold a number
// this one already implies. If passive perception ever stops being ten plus a bonus, that
// changes and it needs its own column.

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
  { cr: 0, hp: 4, armourClass: 11, attackBonus: 2, damage: 2, saveDc: 10, skillBonus: 0 },
  { cr: 0.125, hp: 8, armourClass: 11, attackBonus: 2, damage: 3, saveDc: 10, skillBonus: 0 },
  { cr: 0.25, hp: 13, armourClass: 12, attackBonus: 3, damage: 4, saveDc: 11, skillBonus: 1 },
  { cr: 0.5, hp: 18, armourClass: 12, attackBonus: 3, damage: 6, saveDc: 11, skillBonus: 1 },
  { cr: 1, hp: 26, armourClass: 13, attackBonus: 4, damage: 8, saveDc: 12, skillBonus: 2 },
  { cr: 2, hp: 39, armourClass: 14, attackBonus: 5, damage: 10, saveDc: 13, skillBonus: 3 },
  { cr: 3, hp: 53, armourClass: 14, attackBonus: 5, damage: 13, saveDc: 13, skillBonus: 3 },
  { cr: 4, hp: 70, armourClass: 15, attackBonus: 6, damage: 16, saveDc: 14, skillBonus: 4 },
  { cr: 5, hp: 92, armourClass: 15, attackBonus: 6, damage: 20, saveDc: 14, skillBonus: 4 },
  { cr: 6, hp: 120, armourClass: 16, attackBonus: 7, damage: 25, saveDc: 15, skillBonus: 5 },
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
