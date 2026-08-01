/**
 * Turning a roll the **server already decided** into the notation the 3D dice engine
 * wants.
 *
 * The rolls work rests on one rule: the server evaluates every roll, because
 * a roll the browser computes is a roll the browser can choose. So the dice on screen
 * are a *readout* of numbers that arrived over a subscription, never a source of them —
 * which is the reason this project uses `@3d-dice/dice-box-threejs` rather than
 * `@3d-dice/dice-box`. The latter rolls its own numbers and cannot be told what to
 * show; the fork exists specifically to keep the predetermined-roll notation Teall
 * Dice had solved, spelled `2d20@18,4`.
 *
 * Pure — no DOM, no engine import, no React. `notation.test.ts` covers every rule here,
 * which is the point of it being a separate module from `diceBox.ts`: the interesting
 * decisions are string manipulation and a support test, and neither needs WebGL to
 * check.
 *
 * ⚠️ **No modifier is ever put in the notation, and the engine's arithmetic is never
 * used.** `dice-box-threejs` will happily parse `1d20+5` and report a `total` of the
 * roll plus five — and accepting that offer would make the browser a **second place
 * this game does arithmetic**, which is exactly what this milestone must not have. The
 * server has already resolved `+STR+PROF` into one number, the feed prints that number,
 * and the announcement over the map repeats it. The dice show the raw faces and nothing
 * else. That is also why `ShownDie` carries a face count and a value and has no room
 * for a bonus: there is nowhere to put one.
 */

/**
 * One die on the tray: how many faces it has, and the face the server says is up.
 *
 * Deliberately not a roll, a total or a feed entry. The feed's shape belongs to
 * `convex/`, changes with the milestone, and would drag a Convex `FunctionReturnType`
 * into this file's test for no gain — so the caller projects whatever the subscription
 * hands it down to this pair, and the seam between the game's rules and the flourish on
 * top of them is two numbers wide.
 */
export type ShownDie = { faces: number; value: number }

/**
 * The dice this engine can actually render, and how to tell whether a value fits one.
 *
 * ⚠️ **Verified against the package rather than taken from its README.** The dice
 * table in `dist/dice-box-threejs.es.js` declares each type as a
 * `values: [min, max, step]` triple which `DiceFactory.setValues` expands through
 * `range(min, max, step)`, and `swapDiceFace` — the function that pins a die to a
 * predetermined face — looks the wanted value up with `values.indexOf(value)` and
 * **silently returns without swapping anything when that misses**. A value the table
 * cannot express therefore does not throw and does not warn: it leaves the die showing
 * whatever the physics happened to roll, which is the one failure mode this whole
 * module exists to prevent. So the support test is a value test and not merely a
 * face-count test.
 *
 * The engine also ships `d1`, `d2`, `d3`, a Fudge die and about a dozen Star Wars and
 * poker dice. Those are absent here on purpose — D&D Lite rolls none of them, and a
 * face count this app cannot produce is better reported as unshowable than quietly
 * mapped onto a novelty die.
 *
 * ⚠️ **`d100` is a tens die on its own, so it shows 10, 20 … 100 and nothing between.**
 * Its declared triple is `[10, 100, 10]`. There is no percentile *pair* in this engine,
 * so a server-decided 47 cannot be shown on it and is reported unshowable rather than
 * rounded to 50 — a die displaying a number the feed disagrees with is worse than a die
 * that does not appear.
 */
const SHOWABLE_DICE = new Map<number, (value: number) => boolean>([
  [4, (value) => isWhole(value, 1, 4)],
  [6, (value) => isWhole(value, 1, 6)],
  [8, (value) => isWhole(value, 1, 8)],
  [10, (value) => isWhole(value, 1, 10)],
  [12, (value) => isWhole(value, 1, 12)],
  [20, (value) => isWhole(value, 1, 20)],
  [100, (value) => isWhole(value, 10, 100) && value % 10 === 0],
])

/** An integer in `[min, max]`. Rejects `NaN`, infinities and 3.5 without four tests at each call. */
function isWhole(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

/**
 * Can the engine show this die with this value on it?
 *
 * Exported because the two halves of the answer are wanted in two places — the
 * notation, and the report of what got left out — and computing the same predicate
 * twice is how those two drift apart.
 */
export function isShowable(die: ShownDie): boolean {
  return SHOWABLE_DICE.get(die.faces)?.(die.value) ?? false
}

/**
 * The notation strings for a server-decided roll: one per distinct face count, values
 * in the order they arrived.
 *
 * `[{faces:6,value:3},{faces:6,value:5},{faces:8,value:2}]` → `['2d6@3,5', '1d8@2']`.
 * Empty input answers `[]` rather than `['']`, because a passive ability announces
 * itself and rolls nothing, and the caller should be able to hand that straight here
 * without a length test of its own.
 *
 * ⚠️ **One string per face count, and not one string for the lot, because of how the
 * engine's parser splits on `@`.** A combined form does exist — `2d6+1d8@3,5,2` parses
 * correctly, since `parseNotation` splits the string once and reads every set from the
 * left of the `@` and every result from the right. But *joining* two already-formed
 * groups with `+` produces `2d6@3,5+1d8@2`, and that splits into three parts of which
 * the parser reads two: it takes `2d6` as the whole roll and `3,5+1d8` as the value
 * list, so the d8 vanishes and its face count is read as a *value*. Returning a list
 * makes that mistake unavailable to a caller, and `diceBox.ts` feeds the groups to the
 * engine one at a time through `roll` then `add`.
 *
 * Dice the engine cannot show are dropped, never rounded and never thrown over — see
 * `unshowableDice` for the other half. A feed line must still render when somebody
 * rolls something exotic; the number is in the feed either way, and the dice are the
 * flourish.
 *
 * Grouping preserves **first appearance**, not ascending face count. There is no rules
 * reason to prefer either, and first appearance is the one a reader can verify against
 * the feed line they are looking at.
 */
export function diceNotation(dice: readonly ShownDie[]): string[] {
  // A Map because insertion order is part of the contract above, and because the same
  // face count can appear in two runs — `d6, d8, d6` is one group of two d6 and one
  // d8, not three groups.
  const groups = new Map<number, number[]>()

  for (const die of dice) {
    if (!isShowable(die)) continue

    const values = groups.get(die.faces)
    if (values) values.push(die.value)
    else groups.set(die.faces, [die.value])
  }

  return [...groups].map(([faces, values]) => `${values.length}d${faces}@${values.join(',')}`)
}

/**
 * The dice `diceNotation` had to leave out, for a caller that wants to say so.
 *
 * Separate from `diceNotation` rather than bundled into a `{ notation, dropped }`
 * return, because the notation is wanted on every roll and this is wanted almost never
 * — and a two-field return would put a `dropped` array at every call site, where the
 * overwhelmingly common answer is an empty one that nobody then reads. Reporting is
 * still better than throwing: the engine failing to draw a die must not stop the feed
 * line, the announcement or the next roll.
 */
export function unshowableDice(dice: readonly ShownDie[]): ShownDie[] {
  return dice.filter((die) => !isShowable(die))
}
