// Rolling dice. The arithmetic and the randomness — and the only module in the tree that
// holds either.
//
// ⚠️ **Server-only. Nothing under `src/` may import this file, and that is a security
// boundary rather than a bundle-size preference.** A roll the browser computes is a roll
// the browser can choose: an evaluator in the client bundle is an evaluator a player can
// call with a source of their own and a total of their own, and every screen at the table
// would then be rendering a number nobody had checked. So the server rolls, the server
// writes the result down, and the client renders a row it was *sent*.
// `bundleGuard.test.ts` is what enforces the separation, because it is exactly the sort of
// thing one convenient import quietly undoes.
//
// lib/roll.ts is the other half of the same arrangement and is deliberately
// browser-shared: it holds the vocabulary — the modes, the parts of an entry, the shape of
// a result and the English that describes it — and no arithmetic and no randomness. A
// client may read that file to draw a feed line and has no way to produce one. The note at
// the top of it says the same thing from the other side.
//
// The grammar this file evaluates is `ROLL_PATTERN` in lib/sheet.ts and nothing wider.
// The sheets milestone fixed the grammar and validated a corpus against it precisely so that the
// evaluator could land on top of content already known to conform; this module is the
// second half of that bet being collected.

import {
  MAX_ROLL_DICE,
  ROLL_MODIFIER_TOKENS,
  abilityModifier,
  clamp,
  isValidRoll,
  proficiencyBonus,
} from './sheet'
import type { CharacterSheet } from './sheet'
import type { Crit, Die, RollMode, RollResult } from './roll'

// ---------------------------------------------------------------------------
// Where a face comes from
// ---------------------------------------------------------------------------

/**
 * A single die, thrown. Takes the number of faces and returns a whole number in
 * `1..faces` inclusive.
 *
 * A parameter rather than a hard-wired call to `crypto`, so that every rule below can be
 * tested against a die whose answer is known. That is what makes "advantage keeps the
 * higher of two d20s" a checkable statement instead of a statistical one — and it costs a
 * single argument, because the only thing an evaluator needs from a random number
 * generator is one face at a time.
 *
 * ⚠️ **Every source in this module honours the `1..faces` contract by construction**, by
 * clamping rather than by trusting its caller. A test source that could return 21 on a d20
 * would let a suite assert against a die that cannot exist, which is a worse failure than
 * the scripted value being quietly adjusted: the assertion would pass and the rule it
 * claims to check would be untested.
 */
export type DieSource = (faces: number) => number

/**
 * The largest die a single random byte can address uniformly.
 *
 * Well past the grammar's d100, and the bound is here rather than at 100 because it is a
 * property of the *method* rather than of the content: two bytes would raise it and there
 * is nothing to raise it for.
 */
const MAX_UNIFORM_FACES = 256

/**
 * The face count a source will actually use: whole, at least one, and inside the range a
 * byte can carry.
 *
 * ⚠️ **`Number.isFinite` is asked first, because `clamp` propagates `NaN`.** Every
 * comparison against `NaN` is false, so `Math.min` and `Math.max` hand it straight back —
 * which in `cryptoDice` below is a rejection loop that rejects every byte forever. The same
 * trap `proficiencyBonus` in lib/sheet.ts names and `scaleWith` in lib/bestiary/scale.ts
 * writes `!(x > 0)` against. Reached only by a caller passing something no expression can
 * spell, which is exactly when a hang is least welcome.
 */
function sidesOf(faces: number): number {
  if (!Number.isFinite(faces)) return 1
  return clamp(Math.floor(faces), 1, MAX_UNIFORM_FACES)
}

/**
 * The real thing: `crypto.getRandomValues`, never `Math.random`.
 *
 * The precedent and the rule are `generateCode` in lib/codes.ts, which ADR 0003 leans on
 * for the DM code being unguessable. Dice are a softer case — nobody's ambush turns on the
 * predictability of a d6 — but a seeded PRNG here would be a second standard for
 * randomness in one codebase, and there is nothing to buy with it: the cost of the real
 * generator at this scale is a byte.
 *
 * ⚠️ **Bytes at or above the largest whole multiple of the face count are discarded
 * rather than folded with `%`.** 256 is not divisible by 6, so the naive
 * `byte % 6` maps 256 bytes onto six faces as 43-43-43-43-42-42 — a d6 whose 1 comes up
 * about 2% more often than its 5, forever, on every damage roll in the game. Rejecting the
 * tail makes the surviving range an exact multiple and the modulo uniform. The loop is
 * unbounded for the same reason lib/codes.ts's is: the worst rejection rate in the grammar
 * is the d100 at 56/256, so the chance of needing even ten draws is around one in four
 * million, and a fixed retry count would be a bias with a ceiling on it.
 */
export const cryptoDice: DieSource = (faces) => {
  const sides = sidesOf(faces)
  const ceiling = Math.floor(MAX_UNIFORM_FACES / sides) * sides
  const byte = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(byte)
    if (byte[0] < ceiling) return (byte[0] % sides) + 1
  }
}

/**
 * A source that always answers the same face. **For tests.**
 *
 * Clamped into range per die, so `fixedSource(18)` on a d6 gives a 6 rather than an
 * impossible 18 — see the note on `DieSource`.
 */
export function fixedSource(value: number): DieSource {
  return (faces) => clamp(Math.floor(value), 1, sidesOf(faces))
}

/** Every die on its lowest face. The bottom of `rollRange`, made observable. */
export function minSource(): DieSource {
  return () => 1
}

/** Every die on its highest face. The top of `rollRange`, made observable. */
export function maxSource(): DieSource {
  return (faces) => sidesOf(faces)
}

/**
 * A scripted run of faces, in order. **For tests**, and the one source that makes
 * advantage checkable: `sequenceSource([4, 18])` says which two d20s were thrown, so
 * "keeps the higher" and "keeps the lower" are assertions about a known pair.
 *
 * ⚠️ **Throws when the script runs out, and it is the only function in this module that
 * throws at all.** Everything else here fails soft, because everything else here runs
 * inside a mutation during play. This one runs only from a suite, where an exhausted script
 * means the evaluator drew a different number of dice than the test believed — which is
 * precisely the bug worth being loud about, and which cycling or repeating the last value
 * would convert into a green run.
 */
export function sequenceSource(values: readonly number[]): DieSource {
  let index = 0
  return (faces) => {
    if (index >= values.length) {
      throw new Error(`sequenceSource ran out after ${values.length} dice`)
    }
    const value = values[index]
    index += 1
    return clamp(Math.floor(value), 1, sidesOf(faces))
  }
}

// ---------------------------------------------------------------------------
// Resolving the tokens
// ---------------------------------------------------------------------------

/**
 * One of the seven things a roll may name instead of a number.
 *
 * Derived here rather than in lib/sheet.ts because that module owns the *grammar* — the
 * list of tokens a roll may contain — and this one owns the only question anybody asks
 * about a token, which is what number it currently stands for. A type describing
 * resolution belongs beside the resolver.
 */
export type RollModifierToken = (typeof ROLL_MODIFIER_TOKENS)[number]

/**
 * Each token and the number it resolves to for one character, right now.
 *
 * The whole set rather than a lookup function, because a roll may name up to four of them
 * — `1d20+STR+CHA+PROF` is in the library — and because resolving them once per roll
 * rather than once per term keeps `evaluateRoll` free of any knowledge of where a sheet
 * comes from.
 */
export type RollModifiers = Readonly<Record<RollModifierToken, number>>

/**
 * All seven at zero.
 *
 * Frozen and shared because it is returned rather than built: nothing may mutate a
 * resolved modifier set, and a Convex isolate outlives the request that warmed it — the
 * hazard `creatureExtras` in lib/resolve.ts copies its arrays against.
 *
 * Exported for one caller: `feed.rollDice`, the ad-hoc dice tray, which has no character
 * to resolve a token against and refuses an expression containing one — so by the time it
 * reaches `evaluateRoll` this set is *provably* unused rather than merely a plausible
 * default. `modifiersFor` below is the only other reader, and for it the same value means
 * something different: a creature's tokens genuinely are worth nothing.
 */
export const NO_MODIFIERS: RollModifiers = Object.freeze({
  STR: 0,
  DEX: 0,
  CON: 0,
  INT: 0,
  WIS: 0,
  CHA: 0,
  PROF: 0,
})

/**
 * What this character's tokens are worth.
 *
 * A hero resolves each ability token through `abilityModifier` and `PROF` through
 * `proficiencyBonus`, which is what makes a stored `1d8+WIS` follow a Wisdom score up
 * instead of leaving a stale `+3` behind — the reason `ROLL_MODIFIER_TOKENS` exists at all.
 *
 * ⚠️ **Every token on a creature is zero, and that is honesty rather than a gap.** A
 * reduced NPC sheet has no ability scores and no level, which is exactly why the bestiary
 * never writes a token into a roll: `scaleRoll` refuses to scale one and its doc comment
 * calls a token on a monster a content bug. But a DM may hand-type `1d8+STR` on a goblin,
 * and of the three available answers — throw, invent a score, or add nothing — only the
 * third is defensible. A throw takes down a mutation mid-session over a typo; an invented
 * score is the app adjudicating a rule nobody asked for, and it would make the sheet's
 * arithmetic disagree with its own displayed statline. Adding nothing gives `1d8+0`, which
 * the feed spells out in full, so the DM can see what happened and fix the line.
 *
 * Exhaustive with a `never` arm, the discipline CLAUDE.md invariant 9 asks for on every
 * union this codebase switches on: a third sheet kind fails `npm run lint` here rather than
 * silently resolving every token to nothing.
 */
export function modifiersFor(sheet: CharacterSheet): RollModifiers {
  switch (sheet.kind) {
    case 'pc':
      // A literal typed as `RollModifiers` rather than a fold over
      // `ROLL_MODIFIER_TOKENS`, so that an eighth token fails to compile here — the same
      // trade `ROLL_MODE_LABELS` makes against a `switch`.
      return {
        STR: abilityModifier(sheet.abilities.str),
        DEX: abilityModifier(sheet.abilities.dex),
        CON: abilityModifier(sheet.abilities.con),
        INT: abilityModifier(sheet.abilities.int),
        WIS: abilityModifier(sheet.abilities.wis),
        CHA: abilityModifier(sheet.abilities.cha),
        PROF: proficiencyBonus(sheet.level),
      }
    case 'npc':
      return NO_MODIFIERS
    default: {
      const unknownKind: never = sheet
      void unknownKind
      return NO_MODIFIERS
    }
  }
}

// ---------------------------------------------------------------------------
// Evaluating an expression
// ---------------------------------------------------------------------------

/** `1d8` at the head of an expression. Applied only after `isValidRoll` has passed. */
const ROLL_HEAD = /^(\d+)d(\d+)/

/**
 * One `±term` of the tail: a small integer or a modifier token.
 *
 * Read with `matchAll`, which copies the pattern rather than advancing this one, so the
 * `g` flag on a module-level constant carries no state between calls.
 */
const ROLL_TERM = /([+-])(\d{1,3}|[A-Z]+)/g

/** The three numbers an expression comes down to, with every token already resolved. */
type ParsedRoll = { count: number; faces: number; modifier: number }

function isModifierToken(term: string): term is RollModifierToken {
  return (ROLL_MODIFIER_TOKENS as readonly string[]).includes(term)
}

/**
 * `NdM` plus every `±term` folded into one number.
 *
 * Null for anything the grammar does not describe. The caller has already asked
 * `isValidRoll`, so the null branch is a backstop rather than a path — see the note on
 * `evaluateRoll`.
 */
function parseRoll(expression: string, mods: RollModifiers): ParsedRoll | null {
  const head = ROLL_HEAD.exec(expression)
  if (!head) return null

  let modifier = 0
  for (const [, sign, term] of expression.slice(head[0].length).matchAll(ROLL_TERM)) {
    const value = isModifierToken(term) ? mods[term] : Number(term)
    // A token is always one of the seven and a number is always three digits or fewer, so
    // `NaN` is unreachable here through a validated expression. Skipped rather than
    // propagated, because a `NaN` total would render as `NaN` on every screen at the table.
    if (!Number.isFinite(value)) continue
    modifier += sign === '-' ? -value : value
  }

  return { count: Number(head[1]), faces: Number(head[2]), modifier }
}

/**
 * A roll with nothing in it. What an expression the grammar refuses comes out as.
 *
 * The mode is carried through because the row still records what was asked for, and
 * `dropped` is null because nothing was discarded — which is what `rollModeNote` in
 * lib/roll.ts keys off, so a refused expression cannot claim to have been rolled with
 * advantage.
 */
function inertResult(expression: string, mode: RollMode): RollResult {
  return { expression, mode, dice: [], dropped: null, modifier: 0, total: 0, crit: null }
}

/**
 * THE ROLL. An expression, a character's modifiers, a toggle and a source of faces in;
 * one `RollResult` out.
 *
 * ⚠️ **An expression the grammar refuses returns an empty roll rather than throwing.** This
 * runs inside the mutation that writes a feed line during play, and the expressions it is
 * handed come from 763 hand-written catalogue entries plus whatever a DM has typed into a
 * custom line — so the failure mode of a throw is the roll button doing nothing, mid-session,
 * for a content bug in one entry nobody re-read. `rollProblem` and `sheetProblem` already
 * refuse a malformed roll on the *write* path, which is where a person is present to be
 * told; this branch is the net underneath that, and it is the same trade `scaleRoll` makes
 * when it hands back an expression it cannot rewrite. An empty roll is visibly nothing
 * happening, which is a better outcome than an exception the table has no way to read.
 *
 * ⚠️ **Advantage and disadvantage apply to a single d20 and to nothing else, and elsewhere
 * they are inert rather than refused.** `ROLL_MODES` in lib/roll.ts records why: the roller
 * has a sticky toggle set from the last saving throw and is now rolling `2d6`, and refusing
 * that would be the app adjudicating a rule nobody asked it to. So the condition is exactly
 * one die of exactly twenty faces — which is what `TO_HIT_PREFIX` guarantees every to-hit
 * is, and what the wizard's Portent (`2d20`, `3d20`) deliberately is not. Anywhere the
 * toggle cannot apply, exactly the written number of dice are thrown and `dropped` stays
 * null, so the row itself says whether the toggle did anything.
 *
 * ⚠️ **`total` is floored at zero.** A heavily penalised roll reads `0` rather than `-2`,
 * because a hit that heals the target is not a rule in this game — and because the working
 * beside it (`rollWorking`) still spells out the dice and the modifier, so the floor is
 * visible rather than silent.
 *
 * Every die is listed individually in `dice`, in the order it was thrown, each carrying its
 * own face count. That third field is not decoration: the 3D dice are handed this array so
 * that the faces on the table *are* the faces the server rolled, which a client that only
 * knew the total would have to invent.
 */
export function evaluateRoll(
  expression: string,
  mods: RollModifiers,
  mode: RollMode,
  source: DieSource,
): RollResult {
  if (!isValidRoll(expression)) return inertResult(expression, mode)

  const parsed = parseRoll(expression, mods)
  if (!parsed) return inertResult(expression, mode)

  // The identity on every expression `isValidRoll` accepts — the grammar's own
  // `(?:[1-9]|1\d|20)` is the enforcement and `MAX_ROLL_DICE` is that fact named. Written
  // as a bound anyway, so that a grammar loosened in some future milestone costs a wrong
  // number of dice rather than a mutation that never returns.
  const count = clamp(parsed.count, 1, MAX_ROLL_DICE)
  const { faces, modifier } = parsed

  const dice: Die[] = []
  let dropped: number | null = null

  if (mode !== 'flat' && count === 1 && faces === 20) {
    const first = source(20)
    const second = source(20)
    const keep = mode === 'advantage' ? Math.max(first, second) : Math.min(first, second)
    dice.push({ faces: 20, value: keep })
    // The other one, whichever it was. Written as a sum rather than a second comparison so
    // that a tie keeps one 20 and drops the other rather than reporting neither.
    dropped = first + second - keep
  } else {
    for (let index = 0; index < count; index += 1) {
      dice.push({ faces, value: source(faces) })
    }
  }

  const rolled = dice.reduce((sum, die) => sum + die.value, 0)

  return {
    expression,
    mode,
    dice,
    dropped,
    modifier,
    total: Math.max(0, rolled + modifier),
    crit: critOf(dice),
  }
}

// ---------------------------------------------------------------------------
// Crits
// ---------------------------------------------------------------------------

/**
 * A natural 20 or a natural 1 — and only when there is **exactly one d20 among the kept
 * dice.**
 *
 * ⚠️ **The single-d20 condition is the rule rather than a special case carved out for the
 * wizard.** A crit is a property of *the* die you rolled against a target, so a roll with
 * two of them has no such die: on `2d20` there is no answer to "did it come up 20"
 * that is not a choice about which one counts, and the choice belongs to whoever wrote the
 * feature — Portent picks a die deliberately, which is the whole of what Portent is. So
 * `2d20` and `3d20` fire no fireworks, and neither does a `1d8` that rolls an 8, and both
 * fall out of the same sentence.
 *
 * Reads the *kept* dice, so advantage crits on the die that survived and never on the one
 * in `dropped`. Takes a list rather than a `RollResult` because it is called while one is
 * being built.
 *
 * `Crit` is stored on the row rather than derived in the browser, which is deliberate
 * duplication — its note in lib/roll.ts explains why, and this is the one place the
 * question is answered.
 */
export function critOf(dice: readonly Die[]): Crit {
  const twenties = dice.filter((die) => die.faces === 20)
  if (twenties.length !== 1) return null
  if (twenties[0].value === 20) return 'success'
  return twenties[0].value === 1 ? 'failure' : null
}

// ---------------------------------------------------------------------------
// The range
// ---------------------------------------------------------------------------

/**
 * The lowest and highest total an expression can produce, **ignoring advantage.**
 *
 * Advantage is ignored because it cannot move either end: keeping the higher of two d20s
 * still cannot beat 20 and still cannot fall below 1, so the range of `1d20+3` is the same
 * whichever way the toggle is set. Stating that here is cheaper than a second pair of
 * bounds that would always be equal to this one.
 *
 * The minimum is floored at zero to match `total`, and so is the maximum — a roll whose
 * entire span is negative has a maximum of nothing happening, not a maximum of `-1`.
 *
 * Written for the corpus test, which uses it as the oracle for every roll in three
 * corpora: `minSource` must land exactly on `min` and `maxSource` exactly on `max`, for
 * every expression the game can produce. Two independent statements of the same arithmetic
 * that have to agree is a weaker check than a proof, and a considerably stronger one than
 * either alone.
 */
export function rollRange(
  expression: string,
  mods: RollModifiers,
): { min: number; max: number } {
  if (!isValidRoll(expression)) return { min: 0, max: 0 }

  const parsed = parseRoll(expression, mods)
  if (!parsed) return { min: 0, max: 0 }

  const count = clamp(parsed.count, 1, MAX_ROLL_DICE)
  return {
    min: Math.max(0, count + parsed.modifier),
    max: Math.max(0, count * parsed.faces + parsed.modifier),
  }
}
