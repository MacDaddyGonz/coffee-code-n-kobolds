// Moving a creature between benchmark rows. The middle of the three layers of resolution —
// bestiary entry, then this, then the DM's overrides.
//
// **Combat block in, combat block out.** This module knows nothing about `NpcSheet`, and
// that is deliberate: it means the arithmetic can be tested against a hand-written
// `BestiaryCombat` literal without assembling a sheet, minting entry ids or reaching for a
// corpus, and it means the assembling code in lib/resolve.ts has no arithmetic in it. The
// two halves fail separately and are read separately.
//
// **What scaling does is preserve the creature's deviation from its own row.** A Tank sits
// above its row on armour class and below it on damage; a Brute is the reverse. Reading
// absolute figures off the target row would turn every CR 4 creature in the bestiary into
// the same statline wearing a different name, which is a worse outcome than not having the
// feature — so the ratio columns multiply the creature's own number and the delta columns
// shift it. See the note on `CrBenchmark` in ./benchmarks.ts for which is which and why.
//
// **What scaling does not touch is everything made of words**, plus speed and the number of
// attacks. A CR 6 goblin is a goblin who has been lifting; it is not a goblin that has grown
// a second head, learnt Multiattack or started moving faster.

import {
  MAX_ARMOUR_CLASS,
  MAX_ATTACK_BONUS,
  MAX_INITIATIVE_BONUS,
  MAX_MAX_HP,
  MAX_PASSIVE_PERCEPTION,
  MAX_ROLL_DICE,
  MAX_SAVE_DC,
  MAX_SKILL_BONUS,
  MIN_ARMOUR_CLASS,
  MIN_ATTACK_BONUS,
  MIN_MAX_HP,
  MIN_PASSIVE_PERCEPTION,
  MIN_SAVE_DC,
  clamp,
  isValidRoll,
} from '../sheet'
import type { ChallengeRating } from '../creatures'
import { benchmarkFor } from './benchmarks'
import type { BestiaryCombat } from './types'

/**
 * A creature's combat block moved from one rating to another.
 *
 * Pure, total, and never throws. Everything it cannot do it declines to do, handing the
 * block back untouched — this runs inside `characters.list`, so the cost of a thrown error
 * is the party panel going blank for the whole table rather than one creature reading
 * oddly.
 *
 * ⚠️ **`from === to` is the exact identity, and it is not short-circuited.** With both rows
 * the same, IEEE-754 division of a finite non-zero value by itself is exactly `1.0` and
 * subtraction of a value from itself is exactly `+0`, so every formula below reduces to
 * `Math.round(x * 1)` or `Math.round(x + 0)` — the identity on any integer input, with no
 * rounding to go wrong. That is a property of the arithmetic, so it is left as one.
 *
 * Writing `if (from === to) return combat` would make the identity requirement true by
 * construction and thereby make the test of it worthless: it would pass over an
 * arithmetically broken scaler, which is precisely the scaler that test exists to catch.
 * Idempotence at the entry's own rating is the cheapest available proof that scaling three
 * up and three back down returns the original sheet, and it is only proof if the ordinary
 * code path produced it.
 */
export function scaleCombat(
  combat: BestiaryCombat,
  from: ChallengeRating,
  to: ChallengeRating,
): BestiaryCombat {
  return scaleWith(combat, from, to, clamp)
}

/**
 * The identical arithmetic with every bound removed. **For the corpus test, and for nothing
 * else.**
 *
 * The test asserts that this equals `scaleCombat` for every entry in the bestiary at every
 * rating in range, which is what stops a clamp quietly converting a content bug into a green
 * test. A CR 6 Tank whose armour class wants to be 43 is a content bug; pinned at
 * `MAX_ARMOUR_CLASS` it becomes a sheet that passes `sheetProblem` and nobody ever hears
 * about it. Comparing the two answers makes the clamp a tripwire rather than a repair.
 *
 * The bounds themselves stay in the shipping path regardless. They are the guard that stops
 * a non-finite float64 or an absurd figure reaching a stored document, which is a different
 * job from telling a content author their creature is out of range.
 */
export function scaleCombatUnclamped(
  combat: BestiaryCombat,
  from: ChallengeRating,
  to: ChallengeRating,
): BestiaryCombat {
  return scaleWith(combat, from, to, unclamped)
}

/**
 * How a scaled figure is bounded. **The one reason the two functions above cannot drift.**
 *
 * A copy of the body with the `clamp` calls deleted is the obvious way to write
 * `scaleCombatUnclamped`, and it defeats the test it exists for: the moment the two copies
 * differ by anything other than a bound, the comparison is no longer comparing a clamped
 * answer with the same answer unclamped. One body, one strategy argument.
 */
type Bound = (value: number, low: number, high: number) => number

// The clamping strategy is `clamp` from ../sheet.ts, imported rather than copied: what this
// file needs is a *name* to swap against the one below, and it had a byte-identical copy of
// three lines from a module it already takes fifteen other names from. Only the no-op is
// local, because only this file wants one.
function unclamped(value: number): number {
  return value
}

function scaleWith(
  combat: BestiaryCombat,
  from: ChallengeRating,
  to: ChallengeRating,
  bound: Bound,
): BestiaryCombat {
  const a = benchmarkFor(from)
  const b = benchmarkFor(to)
  // A rating with no row is one the stepper's clamp and `storedSheetProblem` both exist to
  // prevent, so arriving here means something upstream is already wrong. Unscaled is the
  // honest answer: the creature reads as its library self, which is visibly the wrong
  // difficulty rather than invisibly the wrong numbers.
  if (!a || !b) return combat

  // ⚠️ **Written as `!(x > 0)` rather than `x <= 0`, so that `NaN` fails it.** Every
  // comparison against `NaN` is false, so `NaN <= 0` is false and a half-typed or corrupted
  // row would sail through a plain range check and then divide the whole bestiary into
  // nonsense. `proficiencyBonus` in lib/sheet.ts uses the same trick against a half-typed
  // level and its comment records why. Both denominators are checked, not just the
  // divisors' own row, because either one being zero is a division that produces Infinity.
  if (!(a.hp > 0) || !(b.hp > 0) || !(a.damage > 0) || !(b.damage > 0)) return combat

  const hpRatio = b.hp / a.hp
  const damageRatio = b.damage / a.damage
  const dAc = b.armourClass - a.armourClass
  const dAtk = b.attackBonus - a.attackBonus
  const dDc = b.saveDc - a.saveDc
  const dSkill = b.skillBonus - a.skillBonus

  return {
    maxHp: bound(Math.round(combat.maxHp * hpRatio), MIN_MAX_HP, MAX_MAX_HP),
    // `Math.round` on the additive fields as well as the multiplied ones. It is free, it is
    // the identity on the integers every entry is written with, and it means one
    // hand-written entry with a fractional armour class in it produces a creature with a
    // slightly wrong number rather than a sheet `sheetProblem` refuses outright. The corpus
    // test is what catches the fraction; this is the net underneath it.
    armourClass: bound(Math.round(combat.armourClass + dAc), MIN_ARMOUR_CLASS, MAX_ARMOUR_CLASS),
    attackBonus: bound(Math.round(combat.attackBonus + dAtk), MIN_ATTACK_BONUS, MAX_ATTACK_BONUS),
    // Initiative and passive perception both move by the *skill* delta, and that is
    // arithmetic rather than an approximation — see the note at the foot of
    // ./benchmarks.ts on why neither needs a column of its own.
    initiativeBonus: bound(
      Math.round(combat.initiativeBonus + dSkill),
      -MAX_INITIATIVE_BONUS,
      MAX_INITIATIVE_BONUS,
    ),
    passivePerception: bound(
      Math.round(combat.passivePerception + dSkill),
      MIN_PASSIVE_PERCEPTION,
      MAX_PASSIVE_PERCEPTION,
    ),
    // **Untouched.** A Dire Wolf that follows the party up to CR 5 still moves 50 feet;
    // speed is what the creature *is* on a grid, and the spec lists it with the labels
    // rather than with the numbers that scale.
    speed: combat.speed,
    // Null passes straight through. A creature that forces no saving throws does not
    // acquire one by being scaled up — the absence is a statement about the creature, and
    // `MIN_SAVE_DC` is 1 precisely because a save DC of 0 is not a difficulty class.
    saveDc:
      combat.saveDc === null
        ? null
        : bound(Math.round(combat.saveDc + dDc), MIN_SAVE_DC, MAX_SAVE_DC),
    // ⚠️ **The six scores and the six saves pass through untouched, by reference, and that
    // is a decision rather than an omission.**
    //
    // A score is what the creature *is* — the same category as `speed` above and as every
    // word on an attack. The two numbers a score would otherwise imply, the attack bonus
    // and the save DC, are already stored and already shifted by their benchmark deltas
    // three lines up; scaling the score as well would move each of them twice, in
    // directions that need not agree. It would also put this scaler in direct conflict with
    // `scalesWithCr`, which exists precisely to say that an ability's *own* numbers are
    // frozen unless the entry opts in.
    //
    // By reference for the same reason a non-scaling ability is: `Object.is` then holds
    // against the entry's own object, so a test can assert the freeze exactly rather than
    // by deep comparison. Safe because nothing downstream mutates either — `resolveBestiary`
    // does not read them at all.
    abilityScores: combat.abilityScores,
    saveBonuses: combat.saveBonuses,
    // Same keys in the same order — a creature is listed with the thing it is best at
    // first, and re-sorting a scaled creature's skills would change what its sheet looks
    // like for no reason. Fresh pair objects rather than mutated ones: this array belongs
    // to the corpus, which is module state that outlives the isolate that warmed it, and
    // `SPECIES` copies its granted abilities for exactly that reason.
    skills: combat.skills.map((skill) => ({
      key: skill.key,
      bonus: bound(Math.round(skill.bonus + dSkill), -MAX_SKILL_BONUS, MAX_SKILL_BONUS),
    })),
    // Only `damage` moves. The name, the damage type, the range and the flavour text are
    // words, and the count of attacks is a decision about what the creature does.
    attacks: combat.attacks.map((attack) => ({
      ...attack,
      damage: scaleRoll(attack.damage, damageRatio),
    })),
    // **Frozen unless the entry opted in**, which is the source spec's rule and therefore
    // what happens when nobody thinks about it. The opt-in exists for the dragon's breath
    // weapon — most of its damage output, and left at the CR 6 figure it would kill a level
    // 2 party that had asked for a CR 2 dragon. See `BestiaryAbility.scalesWithCr`.
    //
    // An ability that is not scaling is returned **by reference**, so `Object.is` holds
    // against the entry's own object and a test can assert the freeze exactly rather than
    // by deep comparison. Safe because nothing downstream mutates an ability: lib/resolve.ts
    // reads three fields off it and builds a `SheetEntry`.
    abilities: combat.abilities.map((ability) =>
      ability.scalesWithCr === true && ability.roll !== null
        ? { ...ability, roll: scaleRoll(ability.roll, damageRatio) }
        : ability,
    ),
  }
}

/**
 * The subset of the roll grammar this scaler will rewrite: **one `NdM` plus at most one
 * signed integer.** `1d6`, `2d8+3`, `3d6-1`.
 *
 * Looser than `ROLL_PATTERN` on purpose — two digits of count and three of faces — because
 * its job is to *recognise the shape* and let `isValidRoll` be the one thing that decides
 * what a legal roll is. A pattern here that tried to re-state the die-face allow-list would
 * be a second copy of it, free to disagree with the first.
 */
const SCALABLE = /^(\d{1,2})d(\d{1,3})(?:([+-])(\d{1,3}))?$/

/** The largest flat modifier `ROLL_PATTERN`'s `\d{1,3}` can spell. */
const MODIFIER_LIMIT = 999

/**
 * A damage expression scaled by a ratio, staying inside the roll grammar. `1d6+2` at 2.0×
 * is `2d6+4`.
 *
 * Inside the grammar rather than as a bare number, because the output has to satisfy
 * `isValidRoll` — which keeps a scaled attack rollable by the dice work through the one
 * path everything else uses, instead of being a special case an evaluator has to know
 * about.
 *
 * **Anything the pattern above does not match is returned unchanged**, and each exclusion is
 * a decision rather than an omission:
 *
 * - **A modifier token — `1d8+STR`, `2d6+PROF`.** On a monster this is a content bug, not a
 *   valid roll to preserve: a reduced sheet has no ability scores and no proficiency bonus,
 *   so there is nothing for the token to resolve against. Doubling the dice while leaving
 *   the token where it is would produce a roll whose value depends on a score that does not
 *   exist, which is worse than either scaling it or refusing it.
 * - **More than one term — `2d6+1+2`.** That is the same roll as `2d6+3`, and folding it
 *   into one modifier before scaling means writing a small evaluator to get back to
 *   canonical form. The grammar permits the long spelling; no entry should use it.
 * - **Anything `isValidRoll` refuses.** `1d7`, `0d6`, `30d6`, an empty string. Rewriting an
 *   invalid roll into a valid one would repair a typo silently and hide it from the corpus
 *   test.
 *
 * Returning the input unchanged keeps the sheet **valid**, which is the property that
 * matters: the risk taken on is silent non-scaling, and that is closed from the other end by
 * the corpus test asserting every roll in the bestiary matches `SCALABLE`. A creature whose
 * damage quietly refused to scale would otherwise be a fight that is wrong in the direction
 * nobody checks.
 */
export function scaleRoll(roll: string, ratio: number): string {
  // A non-finite or non-positive ratio can only come from a benchmark row that the gates in
  // `scaleWith` should already have stopped. Unchanged rather than clamped, for the reason
  // above.
  if (!Number.isFinite(ratio) || ratio <= 0) return roll

  const match = SCALABLE.exec(roll)
  if (!match || !isValidRoll(roll)) return roll

  const count = Number(match[1])
  const faces = Number(match[2])
  const mod0 = match[4] === undefined ? 0 : Number(match[4]) * (match[3] === '-' ? -1 : 1)

  // Exact in float64 for every face the grammar allows — 2.5, 3.5, 4.5, 5.5, 6.5, 10.5,
  // 50.5 are all representable — so the target below carries no accumulated error and the
  // ratio-1 case comes out character-identical rather than nearly so.
  const faceAvg = (faces + 1) / 2
  const target = (count * faceAvg + mod0) * ratio

  // **The die count moves proportionally and the faces never change.** A swingy `4d10`
  // stays swingy and a single-die jab stays a single-die jab, because how a creature's
  // damage is *distributed* is part of what it feels like to fight — a boss that hits for
  // 25 or for 3 is a different experience from one that reliably hits for 14. Swapping
  // faces to dodge `MAX_ROLL_DICE` would change what the creature is rather than how big
  // it is, so the cap is absorbed by the flat modifier below instead.
  let n = Math.min(MAX_ROLL_DICE, Math.max(1, Math.round(count * ratio)))

  // Whatever the dice did not account for goes into the flat modifier, so expected damage
  // lands on target even where the count was capped at twenty or floored at one. This is
  // what makes a heavily scaled-up `4d10` read `20d10+40` rather than merely `20d10`.
  let mod = Math.round(target - n * faceAvg)

  // **Negative repair, and gated on the roll not having been written with a minus.** A
  // ratio that shrinks a roll can leave the modifier below zero, at which point one fewer
  // die and a bigger remainder is the same expected damage in a shape a person would
  // recognise — `1d8+2` reads like a stat block and `2d8-2` reads like a spreadsheet.
  //
  // The gate does two jobs. It stops the repair rewriting a roll somebody deliberately wrote
  // with a minus, where the negative modifier is the author's intent and not an artefact of
  // division; and because a ratio of exactly 1 cannot produce a modifier more negative than
  // the one it started with, it is also what guarantees the repair can never fire on the
  // identity case and disturb it.
  if (mod0 >= 0) {
    while (mod < 0 && n > 1) {
      n -= 1
      mod = Math.round(target - n * faceAvg)
    }
    // One die left and still short. Floored rather than left negative, because `1d6-2` on a
    // creature scaled towards the bottom of the table is an attack that mostly does nothing,
    // and the arithmetic has already given away what it could.
    if (mod < 0) mod = 0
  }

  // The grammar's modifier is `\d{1,3}`, so a value outside this cannot be spelled. Reached
  // only by a ratio steep enough that the die cap has absorbed everything else.
  mod = Math.min(MODIFIER_LIMIT, Math.max(-MODIFIER_LIMIT, mod))

  // ⚠️ **Never emit `+0`.** Checked before formatting rather than after, which also catches
  // `-0` — `Math.round(-0.3)` produces it, `-0 < 0` is false so neither branch of the repair
  // above touches it, and `-0 === 0` is true so this one line handles both. Formatting first
  // and pattern-matching the result afterwards would emit `1d6-0`, which `isValidRoll`
  // accepts and which no stat block has ever contained.
  if (mod === 0) return `${n}d${faces}`

  const out = `${n}d${faces}${mod < 0 ? '-' : '+'}${Math.abs(mod)}`

  // The last word belongs to the grammar rather than to the arithmetic above. Every path
  // here is believed to produce a legal roll; a roll the validator refuses is a bug in this
  // function, and handing back the input is what keeps that bug from reaching a sheet as an
  // unrollable string.
  return isValidRoll(out) ? out : roll
}
