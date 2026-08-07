// What a roll and a feed line *are* — the shape that crosses the wire, and the one
// sentence that describes it.
//
// **Browser-shared, and the split from lib/dice.ts is the security boundary rather than
// a tidy-up.** This module holds the vocabulary: the modes, the parts of an entry that
// can be clicked, the shape of a result and the English that describes it. It holds no
// arithmetic and no randomness. `lib/dice.ts` holds both and may never be imported by
// anything under `src/` — `bundleGuard.test.ts` is what enforces that, because a roll the
// browser computes is a roll the browser can choose.
//
// So a client may read this file to render a row it was *sent*, and has no way to produce
// one. That is the whole of the arrangement, and it is why the wording lives here and the
// evaluator does not.
//
// ⚠️ **The wording is generated and never stored.** A feed row carries the facts — the
// category, the spell level, the ability, the part that was clicked — and the sentence is
// built from them on the way to the screen. Storing English would put a copy edit behind
// a migration over every row of every game, and would mean the announcement over the map
// and the line in the feed could disagree about what happened. One template per shape, no
// copy per entry, which is exactly what ADR 0008 said the category was for.

import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import {
  SHEET_ENTRY_ROLL_LABELS,
  abilityAbbreviation,
  rollShapeOf,
  sheetEntryCategoryValidator,
} from './sheet'
import type { SheetEntryCategory } from './sheet'
import { skill } from './skills'

// ---------------------------------------------------------------------------
// Advantage, which is a toggle and not a die
// ---------------------------------------------------------------------------

/**
 * Normal, advantage, disadvantage — chosen at the moment of rolling.
 *
 * This is `TO_HIT_PREFIX`'s decision honoured rather than re-taken. lib/sheet.ts writes
 * every to-hit as `1d20` and says why: advantage is a *toggle* applied when somebody
 * presses the button, never a second die written permanently into content, because the
 * same greatsword is swung with advantage on Tuesday and without it on Wednesday.
 *
 * ⚠️ **It only ever affects a single d20**, and everywhere else it is deliberately
 * inert rather than refused. Advantage on a damage roll is a category error, not a
 * mistake worth stopping somebody for: the roller has a sticky toggle set from the last
 * saving throw and is now rolling `2d6`, and a refusal there would be the app
 * adjudicating a rule nobody asked it to. `RollResult.dropped` is how a row says whether
 * the toggle did anything, and it is `null` on every roll where it could not.
 */
export const ROLL_MODES = ['flat', 'advantage', 'disadvantage'] as const
export type RollMode = (typeof ROLL_MODES)[number]

export const rollModeValidator = v.union(
  v.literal('flat'),
  v.literal('advantage'),
  v.literal('disadvantage'),
)

/**
 * What to call each mode on a control.
 *
 * A `Record` rather than a `switch`, for the reason `SHEET_ENTRY_CATEGORY_LABELS` is one:
 * a fourth mode fails to compile here instead of rendering a blank button.
 */
export const ROLL_MODE_LABELS: Record<RollMode, string> = {
  flat: 'Normal',
  advantage: 'Advantage',
  disadvantage: 'Disadvantage',
}

// ---------------------------------------------------------------------------
// What can be clicked on an entry
// ---------------------------------------------------------------------------

/**
 * The four things a sheet entry offers to a pointer.
 *
 * - **`toHit`** — a weapon's attack roll. The first of its two clicks.
 * - **`roll`** — the damage or the effect. A weapon's second click, and an action's only one.
 * - **`use`** — a passive being declared. No dice; the point is that the table is told.
 * - **`text`** — the entry's own description, which is what **alt-click** sends.
 *
 * `text` is available on every category and is the only part that is not a function of
 * the category at all, which is why `partsFor` leaves it out: alt-click is a modifier on
 * a gesture rather than a fourth button.
 */
export const FEED_PARTS = ['toHit', 'roll', 'use', 'text'] as const
export type FeedPart = (typeof FEED_PARTS)[number]

export const feedPartValidator = v.union(
  v.literal('toHit'),
  v.literal('roll'),
  v.literal('use'),
  v.literal('text'),
)

const WEAPON_PARTS: readonly FeedPart[] = Object.freeze(['toHit', 'roll'] as FeedPart[])
const ACTION_PARTS: readonly FeedPart[] = Object.freeze(['roll'] as FeedPart[])
const PASSIVE_PARTS: readonly FeedPart[] = Object.freeze(['use'] as FeedPart[])

/**
 * Which buttons an entry of this category shows, in the order they are shown.
 *
 * ⚠️ **Composed out of `rollShapeOf` rather than switching on the category again.** That
 * function is the one place in the codebase where `SheetEntryCategory` is answered, with
 * a `never` arm and a fail-safe default, and CLAUDE.md invariant 9 exists because the
 * formulation it replaced kept compiling after a member was added to a union. A second
 * switch here would be a second thing to remember; asking the first one means a fourth
 * category still fails in exactly one place.
 *
 * The mapping is a restatement of the shape and nothing more: a to-hit is a click if the
 * entry has one, a roll is a click if the entry rolls, and a category that does neither
 * still gets a button — because a passive with no button is a passive nobody can announce,
 * which is the one thing the roadmap says clicking a passive must do.
 */
export function partsFor(category: SheetEntryCategory): readonly FeedPart[] {
  const shape = rollShapeOf(category)
  if (shape.toHit) return WEAPON_PARTS
  return shape.roll ? ACTION_PARTS : PASSIVE_PARTS
}

/**
 * What to print on each button — except the one whose word depends on the category.
 *
 * ⚠️ **`roll` is deliberately absent, and its absence is the fix rather than an omission.**
 * This was a total `Record<FeedPart, string>` whose `roll` member said `'Damage'`, which is
 * right on a weapon and wrong on everything else: Cure Wounds deals none. Nothing read it —
 * every renderer reached for `SHEET_ENTRY_ROLL_LABELS[category]` instead — so what sat in the
 * vocabulary module was a plausible-looking wrong answer that the next renderer would find
 * first, with a test pinning it in place. `Exclude` keeps the compile-time totality for the
 * three parts that genuinely have one word, and removes the trap.
 *
 * Private, because `partLabel` below is the question anybody actually has.
 */
const FEED_PART_LABELS: Record<Exclude<FeedPart, 'roll'>, string> = {
  toHit: 'To hit',
  use: 'Use',
  text: 'Describe',
}

/**
 * What to print on the button for this part of an entry of this category.
 *
 * One function because the answer has two sources and only one of them is per-part:
 * `SHEET_ENTRY_ROLL_LABELS` already answers *"what do you call the roll that is not the
 * to-hit"* per category — `Damage` on a weapon, `Roll` on an action — and it is the label
 * printed on the read-only line and on the editable field directly beneath the button, so
 * taking the word from anywhere else would put two names on one roll a centimetre apart.
 */
export function partLabel(part: FeedPart, category: SheetEntryCategory): string {
  return part === 'roll' ? SHEET_ENTRY_ROLL_LABELS[category] : FEED_PART_LABELS[part]
}

/**
 * Does pressing this part throw dice?
 *
 * ⚠️ **Because `RollButton` was asking `part === 'use'` and meaning this.** Naming one member
 * gets the right answer today and the wrong one for a fifth part, and it states a coincidence
 * where the reason is *"there is no die to take the higher of"*. Asking the question makes the
 * button's condition say what it is actually about.
 *
 * `planEntryRoll` in `convex/feed.ts` is the other reader of the same fact and stays a
 * `switch`, which is not a duplication being tolerated: it needs a different *expression* per
 * part — a to-hit off `toHitOf` and a damage off `entry.roll` — so its `use`/`text` arm is
 * where those two happen to have nothing rather than the reason they do. A `Record` here for
 * the reason every other union on this type gets one: a fifth part fails `npm run lint`
 * instead of silently rolling nothing.
 */
const PART_ROLLS: Record<FeedPart, boolean> = {
  toHit: true,
  roll: true,
  use: false,
  text: false,
}

export function partRolls(part: FeedPart): boolean {
  return PART_ROLLS[part]
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

/** One die and the face it settled on. `faces` is what the 3D dice are told to throw. */
export const dieValidator = v.object({
  faces: v.number(),
  value: v.number(),
})
export type Die = Infer<typeof dieValidator>

/**
 * A natural 20 or a natural 1, or neither.
 *
 * ⚠️ **Stored on the row rather than derived in the browser, and that is deliberate
 * duplication.** A reader can work it out from `dice`, so this is a second spelling of a
 * fact the row already carries — which this codebase normally refuses. It is here for the
 * same reason the total is: every screen renders this row, and "what counts as a crit"
 * decided in the browser is a second implementation of a rule the server owns. One of
 * them would eventually disagree, and the disagreement would be two players seeing
 * different fireworks for the same die.
 *
 * `critOf` in lib/dice.ts is the one place the question is answered.
 */
export const critValidator = v.union(v.literal('success'), v.literal('failure'), v.null())
export type Crit = Infer<typeof critValidator>

/**
 * What a roll came out as, in enough detail to render it three ways.
 *
 * The feed prints the total and the arithmetic, the announcement over the map prints the
 * total alone, and the 3D dice are handed `dice` so that the faces on the table **are**
 * the faces the server rolled. That third reader is why `dice` is a list rather than a
 * sum: a client that only knew the total would have to invent faces to animate, and
 * invented faces that add up to the right number are still the wrong dice.
 *
 * - **`expression`** is the roll as evaluated — `1d8+STR`, not `1d8+3`. The tokens are
 *   what the sheet says, and resolving them into `modifier` is what the server did.
 * - **`modifier`** is every flat and token term added together, already resolved. One
 *   number, because a breakdown per term is a tooltip nobody has asked for and would be
 *   a third thing to keep in step with the grammar.
 * - **`dropped`** is the d20 that advantage or disadvantage discarded, or `null`. It
 *   doubles as the answer to "did the toggle do anything", which is why nothing here
 *   stores the mode a second time.
 * - **`total`** is `dice` summed plus `modifier`, never negative — floored at zero the
 *   way damage is, so a heavily penalised roll reads `0` rather than `-2`.
 */
export const rollResultValidator = v.object({
  expression: v.string(),
  mode: rollModeValidator,
  dice: v.array(dieValidator),
  dropped: v.union(v.number(), v.null()),
  modifier: v.number(),
  total: v.number(),
  crit: critValidator,
})
export type RollResult = Infer<typeof rollResultValidator>

// ---------------------------------------------------------------------------
// What was rolled, and the sentence that says so
// ---------------------------------------------------------------------------

/**
 * The six ability keys as a validator.
 *
 * Hand-spelled beside `ABILITY_KEYS` rather than derived from it, which is this
 * codebase's stated convention wherever an `as const` list and a `v.union` describe the
 * same set (lib/sheet.ts says so at `skillProficienciesValidator`, and the same pair
 * exists for the health bands and the character groups). The cost is one duplication and
 * it is paid for by a test that asserts the two agree, so what could drift is checked by
 * machine rather than by memory.
 */
export const abilityKeyValidator = v.union(
  v.literal('str'),
  v.literal('dex'),
  v.literal('con'),
  v.literal('int'),
  v.literal('wis'),
  v.literal('cha'),
)

/**
 * The eighteen skill keys. Hand-spelled beside `SKILL_KEYS` for the reason above.
 *
 * ⚠️ **This union is STORED** — `feedSubjectValidator` below carries it and a feed row holds
 * one. Widening it is additive and safe, which is the one direction a stored union can move
 * without a migration: a row written before the five 2024 skills existed names one of the
 * thirteen and still validates. Narrowing it would not be, which is why removing a skill from
 * this list is a different kind of change from adding one.
 */
export const skillKeyValidator = v.union(
  v.literal('athletics'),
  v.literal('acrobatics'),
  v.literal('sleightOfHand'),
  v.literal('stealth'),
  v.literal('arcana'),
  v.literal('investigation'),
  v.literal('history'),
  v.literal('nature'),
  v.literal('religion'),
  v.literal('animalHandling'),
  v.literal('insight'),
  v.literal('perception'),
  v.literal('medicine'),
  v.literal('survival'),
  v.literal('deception'),
  v.literal('intimidation'),
  v.literal('performance'),
  v.literal('persuasion'),
)

/**
 * WHAT HAPPENED, as six shapes — the discriminator the whole feed turns on.
 *
 * Six rather than one row of free text, because the sentence is generated and a generator
 * needs the facts rather than the prose. And six rather than fifteen, because these are
 * the *shapes* a roll comes in and not the things that can be rolled: every one of the
 * 763 entries in three corpora is an `entry`, and adding a spell to the library adds
 * nothing here.
 *
 * ⚠️ **`entry` carries a copy of the name, the category and the level rather than a
 * pointer to the entry.** That is the `catalogueKey` decision applied to history: an
 * entry id is stable only for as long as the sheet holds it, and a DM who deletes a
 * manoeuvre or a player who levels out of a spell must not blank the line that says they
 * used it an hour ago. A feed row is what happened, so it is written down; the sheet is
 * what is true now, so it is looked up.
 *
 * ⚠️ **`text` is populated only when `part` is `'text'`**, and is `null` otherwise. An
 * alt-click *is* the description, so it has to travel; a roll does not need six hundred
 * characters of prose repeated on every line of a busy feed. The one writer is
 * `convex/feed.ts`, which is why this coherence is a documented invariant with a test
 * rather than something a validator could express.
 */
export const feedSubjectValidator = v.union(
  v.object({
    kind: v.literal('entry'),
    part: feedPartValidator,
    name: v.string(),
    category: sheetEntryCategoryValidator,
    /** The spell level, `0` for a cantrip, `null` for anything that is not a spell. */
    level: v.union(v.number(), v.null()),
    text: v.union(v.string(), v.null()),
  }),
  v.object({ kind: v.literal('check'), ability: abilityKeyValidator }),
  v.object({ kind: v.literal('save'), ability: abilityKeyValidator }),
  v.object({ kind: v.literal('skill'), skill: skillKeyValidator }),
  v.object({ kind: v.literal('initiative') }),
  v.object({ kind: v.literal('dice') }),
)
export type FeedSubject = Infer<typeof feedSubjectValidator>

/**
 * WHAT WAS CLICKED — the argument shape of `feed.roll`, and deliberately **not** the same
 * type as the subject above.
 *
 * ⚠️ **The client says which thing, and the server says what it was.** A request names an
 * entry by its **id** and nothing else; the server looks that id up on the stored sheet and
 * fills in the name, the category, the level, the text and the expression itself. So there
 * is no field here a caller could use to announce a weapon it does not have, roll a die the
 * sheet does not carry, or put words in a creature's mouth — the only thing a request can
 * be wrong about is *which* entry, and a wrong id is a refusal.
 *
 * That asymmetry is the whole reason two types exist where one would compile. Reusing
 * `feedSubjectValidator` as the argument would hand the client `name`, `category`, `level`
 * and `text` as *inputs*, and a mutation that writes what it was told is a mutation whose
 * feed is whatever the network tab says it is. It would also be the one place in this
 * codebase where a payload the table reads came from a client rather than from a document.
 *
 * There is no `dice` member: an ad-hoc roll has no character to look anything up on, so it
 * is `feed.rollDice` with an expression rather than a sixth request kind. Splitting the two
 * mutations is what keeps *every* argument of this one an identifier.
 */
export const rollRequestValidator = v.union(
  v.object({ kind: v.literal('entry'), entryId: v.string(), part: feedPartValidator }),
  v.object({ kind: v.literal('check'), ability: abilityKeyValidator }),
  v.object({ kind: v.literal('save'), ability: abilityKeyValidator }),
  v.object({ kind: v.literal('skill'), skill: skillKeyValidator }),
  v.object({ kind: v.literal('initiative') }),
)
export type RollRequest = Infer<typeof rollRequestValidator>


/**
 * `a` or `an`, decided by the sound the reader is about to make.
 *
 * Needed because seven of the thirteen skills begin with a vowel — Athletics, Acrobatics,
 * Arcana, Investigation, Insight, Intimidation, Animal Handling — so *"performs a
 * Athletics roll"* is not a corner case but half the list. A five-vowel test rather than
 * a per-skill lookup: the words are ordinary English and there is no *hour* or *unicorn*
 * among them, and a table of thirteen articles is a table somebody has to maintain when a
 * skill is renamed.
 */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

/**
 * WHO DID WHAT, in one sentence — the only place the feed's English is written.
 *
 * `Chadius casts Cure Wounds` · `Chadius attacks with their Greatsword` · `Chadius uses
 * Divine Smite` · `Chadius performs a STR check` · `Chadius performs a STR saving throw`
 * · `Chadius performs an Athletics roll`. Those are the roadmap's six, and they come out
 * of this function rather than out of six hundred hand-written strings.
 *
 * **The spell/feature split keys off `level`, not off the category**, which is what
 * ADR 0008 predicted the announcement would do. A spell has a level — `0` for a cantrip —
 * and a class feature has `null`, so Cure Wounds *casts* and Divine Smite *uses* without
 * either of them having to say which it is. That is also why the categories describe the
 * rolling and not the fiction: Fire Bolt is a `weapon` and still announces as a spell.
 *
 * **`their` rather than a pronoun.** The seat behind a character has never told this
 * application its pronouns and never will, and *"attacks with their Greatsword"* is
 * correct for every character at the table.
 *
 * `expression` is threaded in for the one shape that has nothing else to describe itself
 * — an ad-hoc roll is *only* its notation — and is tolerated as `null` rather than being
 * stored a second time on the subject.
 */
export function rollSentence(
  actorName: string,
  subject: FeedSubject,
  expression: string | null,
): string {
  switch (subject.kind) {
    case 'entry': {
      // A spell is a spell whichever category it landed in, so this test comes first.
      const verb = subject.level === null ? 'uses' : 'casts'
      switch (subject.part) {
        case 'toHit':
          return `${actorName} attacks with their ${subject.name}`
        case 'roll':
          // A weapon's second click is the only one that is about the weapon rather than
          // about the swing, which is why it does not simply repeat the line above.
          return subject.category === 'weapon'
            ? `${actorName} rolls damage for their ${subject.name}`
            : `${actorName} ${verb} ${subject.name}`
        case 'use':
          return `${actorName} ${verb} ${subject.name}`
        case 'text':
          return `${actorName} describes ${subject.name}`
        default: {
          // A fifth part fails `npm run lint` here rather than announcing nothing.
          const unknownPart: never = subject.part
          void unknownPart
          return `${actorName} ${verb} ${subject.name}`
        }
      }
    }
    case 'check':
      return `${actorName} performs a ${abilityAbbreviation(subject.ability)} check`
    case 'save':
      return `${actorName} performs a ${abilityAbbreviation(subject.ability)} saving throw`
    case 'skill': {
      const name = skill(subject.skill).name
      return `${actorName} performs ${article(name)} ${name} roll`
    }
    case 'initiative':
      return `${actorName} rolls initiative`
    case 'dice':
      return expression === null
        ? `${actorName} rolls the dice`
        : `${actorName} rolls ${expression}`
    default: {
      // ⚠️ A seventh subject kind fails `npm run lint` here. Nothing behind this
      // discriminator is a secret — a row a caller must not see was dropped server-side
      // long before anybody asked what to call it (CLAUDE.md invariant 8) — so unlike
      // `isMonsterSheet` the runtime fallback is a wording of last resort rather than a
      // fail-closed refusal. The compile-time refusal is the whole of the guard.
      const unknownSubject: never = subject
      void unknownSubject
      return `${actorName} rolls`
    }
  }
}

/**
 * `with advantage`, `with disadvantage`, or nothing at all.
 *
 * ⚠️ **Keyed off `dropped` rather than off `mode`, and that is the point.** `mode` is what
 * was asked for and `dropped` is what happened, and they differ every time somebody
 * leaves a sticky toggle on and rolls damage with it. A line that said "with advantage"
 * over a `2d6` would be the feed asserting a rule the evaluator deliberately did not
 * apply — so the note appears exactly when a die was genuinely discarded.
 */
export function rollModeNote(result: RollResult): string | null {
  return result.dropped === null ? null : modeNote(result.mode)
}

/**
 * `with advantage` / `with disadvantage`, built from the one copy of those words.
 *
 * ⚠️ **Shared with the sheet's roll buttons, because the two must not be able to disagree
 * about the same roll.** `RollButton` puts this clause in the accessible name of the control
 * you are about to press, and `rollModeNote` puts it on the feed row that press produces —
 * so a button reading *"with adv."* over a line reading *"with advantage"* is the two halves
 * of one gesture describing it differently. The button's own comment used to claim it derived
 * the phrase from `ROLL_MODE_LABELS` precisely so that could not happen, while this function
 * held the phrase as a literal. Now there is one derivation and both call it.
 *
 * A lookup rather than a ternary for the reason the labels are a `Record`: the ternary's
 * `else` arm answered *"with advantage"* for a fourth mode, which is the one wrong answer a
 * compile error is cheaper than.
 */
export function modeNote(mode: RollMode): string {
  return `with ${ROLL_MODE_LABELS[mode].toLowerCase()}`
}

/**
 * The die advantage or disadvantage discarded, as a die — or null when nothing was.
 *
 * ⚠️ **Its face count is 20 by construction, and that construction fact belongs here rather
 * than in each renderer.** Advantage only ever applies to a single d20, which is what
 * `TO_HIT_PREFIX` and `evaluateRoll` between them guarantee — so `dropped` is a bare number
 * on the row, and both the feed's die chips and the 3D tray had to put the 20 back on it,
 * each with a comment saying why. Two spellings of one convention, and if `dropped` ever
 * carries anything else the tray and the feed would disagree about what landed.
 *
 * The tray wants it because two dice on the table is the whole visible point of advantage;
 * the feed wants it struck through beside the kept one.
 */
export function droppedDie(result: RollResult): Die | null {
  return result.dropped === null ? null : { faces: 20, value: result.dropped }
}

/**
 * The arithmetic, spelled out — `18 + 5`, or `18` when there is nothing to add.
 *
 * Beside the total rather than instead of it, because the number a player shouts across
 * the table is the total and the number they check when it looks wrong is this.
 */
export function rollWorking(result: RollResult): string {
  const dice = result.dice.map((die) => String(die.value)).join(' + ')
  if (result.modifier === 0) return dice
  return `${dice} ${result.modifier < 0 ? '−' : '+'} ${Math.abs(result.modifier)}`
}
