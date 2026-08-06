// The shape of a character sheet, the numbers derived from one, and the bounds a
// stored one has to satisfy. Shared by the Convex functions and the browser through
// the `@convex/…` alias, exactly as lib/grid.ts and lib/codes.ts are, and for the
// same reason: a modifier the form works out and a modifier the server works out
// must be the same number, and a bound only the client applies is a bound a client
// bug removes.
//
// Deliberately free of `ctx`, of the generated data model and of React. Everything
// here operates on plain objects rather than on a `Doc<'characters'>`, so the sheet
// editor can run all of it against values the player has typed but not yet saved.
//
// The catalogue of actual spells and feats is content rather than shape and lives
// next door in lib/rules.ts. What is here is the grammar those entries have to
// satisfy; what is there is which ones exist.

import { v, type Infer } from 'convex/values'

import { SUBCLASS_LEVEL, classKeyValidator, subclassOf } from './classes'
import { collapseWhitespace, hasLoneSurrogate } from './codes'
// A value import, and safe: lib/creatures.ts is a strict runtime leaf whose only
// import is `v` from convex/values. That is what keeps `crValidator` reachable from
// here without dragging the bestiary corpus behind it — the same relationship
// lib/classes.ts has to lib/library/.
import { crIndex, crValidator } from './creatures'
import { speciesKeyValidator } from './species'
// Type-only, and it has to stay that way: skills.ts imports `abilityModifier` and
// `proficiencyBonus` from this module at runtime, so a value import back would close
// a cycle. See the note on `skillProficienciesValidator`.
import type { SkillProficiencies } from './skills'

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const MIN_LEVEL = 1
export const MAX_LEVEL = 20

export const MIN_ABILITY_SCORE = 1
export const MAX_ABILITY_SCORE = 30

export const MIN_ARMOUR_CLASS = 0
export const MAX_ARMOUR_CLASS = 40

export const MIN_MAX_HP = 1
export const MAX_MAX_HP = 999

export const MAX_HIT_DICE_COUNT = 20
export const HIT_DIE_FACES = [6, 8, 10, 12] as const

export const MAX_INITIATIVE_BONUS = 20

// Bounds on the numbers a creature carries pre-calculated because it has nothing to
// derive them from.
//
// Generous on purpose, in the spirit of `MIN_SPEED`/`MAX_SPEED` below: these are not the
// rules policing themselves, they are the guard that stops a non-finite float64 reaching
// a stored document. A DM who wants an absurd boss gets one.
//
// A `//` section comment rather than a JSDoc block, because a JSDoc attaches to the
// declaration that follows it — and the one that follows carries its own, so this
// paragraph documented nothing and tooling dropped it on the floor.

/** An attack bonus can be negative — a Giant Rat is worse at hitting than nothing at all. */
export const MIN_ATTACK_BONUS = -20
export const MAX_ATTACK_BONUS = 30
/** A save DC of 0 is not a difficulty class, and 30 is past anything a level 5 party faces. */
export const MIN_SAVE_DC = 1
export const MAX_SAVE_DC = 30
/** Passive perception is 10 plus a bonus, so it is never zero and never enormous. */
export const MIN_PASSIVE_PERCEPTION = 1
export const MAX_PASSIVE_PERCEPTION = 40
/** Used as ±: a stored skill bonus is a whole number within this of zero. */
export const MAX_SKILL_BONUS = 20

/**
 * Bounds on a character's speed, in feet.
 *
 * Zero is allowed and the ceiling is generous, because this is not the rules
 * policing themselves — it is the guard that stops a non-finite float64 reaching a
 * stored document and a player-facing payload. `speed` arrived in Milestone 4 as the
 * one numeric field on the sheet with no range check at all, so `NaN` and `Infinity`
 * both stored cleanly and came back out on the wire; `speedOf` guarded them on read,
 * which is exactly why nobody noticed. `npm run test:smoke` did.
 */
export const MIN_SPEED = 0
export const MAX_SPEED = 200

export const MIN_SPELL_LEVEL = 0
export const MAX_SPELL_LEVEL = 9

/**
 * The speed every character has unless something says otherwise — **a default now,
 * not a rule.**
 *
 * requirements.md fixed this at 35 for everyone and this was a constant with no
 * field behind it, on the reasoning that storing a number nobody may change would
 * invite a form control and then a character the rules say cannot exist. Milestone 4
 * lifted that exclusion for one race: the Goliath is Large and moves 45. So `speed`
 * is a field on the PC sheet, optional because the table already held sheets without
 * it, and read through `speedOf` — which returns this whenever nothing has said
 * otherwise, which is seven races out of eight. See ADR 0006.
 */
export const SPEED_FEET = 35

/**
 * Feats, spells and NPC actions are bounded arrays on the character document
 * rather than rows in a child table, which runs against the Convex guideline about
 * lists inside documents. Three things make it the right call here and this is the
 * one place that argument is written down.
 *
 * The list is genuinely bounded — a D&D Lite character has a handful of feats and
 * a page of spells, not an unbounded feed. It is always read *with* the sheet, so a
 * child table would mean forty extra reads every time a panel opens, in exchange
 * for nothing. And the document is not high-churn: current hit points live in
 * `characterVitals`, so the sheet is written when somebody edits their build, not
 * when somebody takes damage. The guideline exists to stop a growing array making
 * every write rewrite a document that is also being read constantly; neither half
 * of that applies.
 *
 * Worst case is two lists of forty entries at roughly seven hundred bytes each,
 * which is about 56 KB against Convex's 1 MB document limit.
 */
export const MAX_SHEET_ENTRIES = 40
export const MAX_ENTRY_ID_LENGTH = 32
export const MAX_ENTRY_NAME_LENGTH = 60
export const MAX_ENTRY_TEXT_LENGTH = 600
export const MAX_CLASS_NAME_LENGTH = 40
export const MAX_NPC_NOTES_LENGTH = 1000

// ---------------------------------------------------------------------------
// The roll grammar
// ---------------------------------------------------------------------------

/**
 * The ability and proficiency tokens a roll may reference.
 *
 * A roll is stored with the token rather than with the number it currently works
 * out to, so raising a character's Wisdom fixes every spell that scales off it
 * instead of leaving twenty stale `+3`s behind.
 */
export const ROLL_MODIFIER_TOKENS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'PROF'] as const

/**
 * `NdM` followed by any number of `±term`, where a term is a small integer or one
 * of the tokens above. `1d8+WIS`, `2d6`, `1d20+PROF`, `3d6-1`, `1d10+STR+PROF`.
 *
 * Milestone 3 validates the shape and Milestone 6 evaluates it, and that split is
 * deliberate rather than half a feature. A roll string stored unvalidated today is
 * a migration over every sheet in every game the moment something tries to parse
 * one — so the grammar is fixed now, while there is nothing to migrate, and the
 * evaluator lands on top of a corpus already known to conform.
 *
 * Die faces are an allow-list because `1d7` is a typo rather than a house rule, and
 * the count is capped because the alternative is a client asking for 99999 dice to be
 * rendered in the physics engine.
 *
 * ⚠️ **Both halves were widened deliberately, on the record, and this is not a place to
 * widen one quietly.** It admitted `4|6|8|10|12|20|100` and 1–20 dice; the ad-hoc dice
 * tray asked for a **d2** and a **1×–50× count**, and
 * [ADR 0014](../../docs/adr/0014-what-a-coin-says-about-itself.md) records the decision
 * along with the amendment in `docs/requirements.md`. CLAUDE.md invariant 10 calls this
 * regex the cap itself, so moving it is a change to an invariant rather than a constant
 * bump — which is exactly why it went through that door.
 *
 * ⚠️ **This is one grammar for two callers, and that was the contested part.** A sheet
 * entry and a string somebody types into the tray are checked here, by this expression,
 * with no second bound anywhere — so the price of not having two caps that agreed once is
 * that **a stored damage expression may now legitimately read `30d6`**. That was weighed
 * and taken. If it ever has to be re-narrowed, narrow it *here*, for both.
 */
export const ROLL_PATTERN =
  /^(?:[1-9]|[1-4]\d|50)d(?:2|4|6|8|10|12|20|100)(?:[+-](?:\d{1,3}|STR|DEX|CON|INT|WIS|CHA|PROF))*$/

/**
 * The eight faces the pattern above admits, as a list — the same relationship
 * `MAX_ROLL_DICE` has to the count in front of it: **one fact spelled twice, and the regex
 * is the copy that decides.**
 *
 * ⚠️ **It exists because the count had this and the faces did not, and the gap bit inside
 * one commit.** Widening the grammar to admit `d2` left four hand-maintained face lists —
 * the alternation above, the renderer's `ORDINARY_FACES`, the dice tray's buttons and
 * `scaling.test.ts`'s exhaustive sweep — and the sweep was the one that silently stopped
 * covering the new face, in the very change that added it. `MAX_ROLL_DICE` had no such
 * problem, because every reader of the cap reads the constant.
 *
 * **The regex is still written out rather than built from this**, deliberately: a grammar
 * assembled by string concatenation is one nobody can read in a grep, and this is the
 * expression that decides what a client may ask the server to roll. `sheet.test.ts` pins
 * the two against each other instead — every member is accepted and the neighbours either
 * side of each are refused — which is the direction a shared constant cannot check anyway.
 */
export const ROLL_FACES = [2, 4, 6, 8, 10, 12, 20, 100] as const
export type RollFaces = (typeof ROLL_FACES)[number]

/**
 * The die-count cap the pattern above enforces, named — the `(?:[1-9]|[1-4]\d|50)` at the
 * front of it and this constant are **one fact spelled twice**, and the regex is the
 * copy that decides.
 *
 * It is named because something now has to *reason* about it rather than merely satisfy
 * it. The CR scaler multiplies a damage expression's die count on the way up, and its
 * output has to come back through `isValidRoll` — so it needs the ceiling as a number
 * to clamp against, and a scaler that hard-coded its own 20 would be a second cap free
 * to disagree with the first. When one moves, both move: the regex is the enforcement
 * and this is what everything else reads.
 *
 * ⚠️ **It moved, and "when one moves, both move" was the checklist.** Twenty became fifty
 * for the ad-hoc dice tray ([ADR 0014](../../docs/adr/0014-what-a-coin-says-about-itself.md)),
 * and what had to move with it was this constant, the regex above, the two `clamp` calls in
 * `lib/dice.ts`, the CR scaler that reads this to bound its multiplication, the renderer's
 * face allow-list in `src/lib/dice/notation.ts` — which also gained the d2 — and CLAUDE.md
 * invariant 10. Six places plus the invariant, which is what a sentence like the one above
 * is for.
 */
export const MAX_ROLL_DICE = 50

/**
 * The longest a roll expression may be, which the grammar itself does not bound.
 *
 * Forty is comfortably past the longest anything in the three corpora writes —
 * `1d20+STR+CHA+PROF` is seventeen — and well short of a string worth storing forty
 * of on a sheet. See the note in `rollProblem`.
 */
export const MAX_ROLL_LENGTH = 40

/**
 * The prefix every to-hit starts with. **One** d20 and exactly one, because that is
 * what a to-hit is: you roll a die against an armour class and add your modifiers.
 *
 * Advantage and disadvantage are a *toggle* applied at the moment of rolling rather
 * than a second die written into the expression, which is why this is `1d20` and not
 * anything up to `2d20` — a stored `2d20+STR` would be advantage spelled into the
 * content, permanently, for everybody holding that sheet.
 *
 * Read by both halves so they cannot disagree: `toHitFromBonus` builds a to-hit with
 * it and `toHitProblem` refuses one that does not start with it.
 */
export const TO_HIT_PREFIX = '1d20'

/**
 * Uppercases and strips whitespace, so `2d6 + wis` typed into a custom entry
 * becomes `2d6+WIS`: modifier tokens upper, the die separator lower, whatever case
 * it arrived in.
 *
 * Applied before validation *and* before storage, so what the picker offers and
 * what somebody types by hand end up byte-identical. Must not throw: it runs on
 * every keystroke in the custom-entry field.
 *
 * **The separator is lowercased only between two digits**, and that narrowness is
 * load-bearing rather than fussy. The first version of this uppercased the string
 * and then lowercased every `D` in it, which is correct for six of the seven
 * modifier tokens and silently destroys the seventh: `DEX` is the only one
 * containing a `D`, so `1d8+DEX` normalised to `1d8+dEX` and was then refused by
 * the validator — with an error quoting a string the user had never typed. Every
 * Dexterity-scaled roll in the game was unsaveable, and no test of the catalogue
 * would ever have noticed, because the catalogue happens to use no `DEX` token.
 */
export function normaliseRoll(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(\d)D(?=\d)/g, '$1d')
}

export function isValidRoll(roll: string): boolean {
  return ROLL_PATTERN.test(roll)
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

/**
 * `str` → `STR`, and **the abbreviation is load-bearing rather than cosmetic.**
 *
 * It has to equal the token spellings in `ROLL_MODIFIER_TOKENS` below, because a skill row
 * prints `(STR)` beside a bonus whose expression the server parses as `+STR` — the same three
 * letters read by a person and by `parseRoll`. Written once here, beside the keys and beside
 * the tokens, rather than in the two components that need it: it existed twice, in
 * `SkillList` and in the roll announcement's wording, which is two spellings of the one
 * string that has to match a parser.
 */
export function abilityAbbreviation(ability: AbilityKey): string {
  return ability.toUpperCase()
}

/** Long names for the six, so a form and a tooltip agree on the spelling. */
export const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

export const abilityScoresValidator = v.object({
  str: v.number(),
  dex: v.number(),
  con: v.number(),
  int: v.number(),
  wis: v.number(),
  cha: v.number(),
})
export type AbilityScores = Infer<typeof abilityScoresValidator>

export const saveProficienciesValidator = v.object({
  str: v.boolean(),
  dex: v.boolean(),
  con: v.boolean(),
  int: v.boolean(),
  wis: v.boolean(),
  cha: v.boolean(),
})
export type SaveProficiencies = Infer<typeof saveProficienciesValidator>

/**
 * The thirteen skills, as a flag each.
 *
 * The names, the ability behind each one and the arithmetic all live in
 * lib/skills.ts; only the validator is here, and the split is about import
 * direction rather than taste. `skillBonus` needs `abilityModifier` and
 * `proficiencyBonus` from this module, so skills.ts imports values from sheet.ts —
 * and a validator here that imported values back would close a runtime cycle at
 * module scope, where both sides are evaluated eagerly and one of them would see an
 * empty object. `SKILL_KEYS` and these eighteen fields are asserted to agree by a
 * test, so the one thing the split costs is checked by machine rather than by
 * memory.
 */
export const skillProficienciesValidator = v.object({
  athletics: v.boolean(),
  acrobatics: v.boolean(),
  sleightOfHand: v.boolean(),
  stealth: v.boolean(),
  arcana: v.boolean(),
  investigation: v.boolean(),
  // ⚠️ **The five 2024 skills, OPTIONAL where the thirteen above are required, and the
  // difference is this table's age rather than the skills' importance.** `characters` has
  // held `pc` sheets since Milestone 3 and every one of them carries thirteen booleans, so
  // making these required fails the schema push — the trap `games.status`, `speed` and
  // `skillProficiencies` itself each hit in turn. They are read through
  // `skillProficienciesOf`, which fills them in, and they become required in the narrowing
  // commit after the sweep. Widen → migrate → narrow, as always.
  history: v.optional(v.boolean()),
  nature: v.optional(v.boolean()),
  religion: v.optional(v.boolean()),
  animalHandling: v.boolean(),
  insight: v.boolean(),
  perception: v.boolean(),
  medicine: v.optional(v.boolean()),
  survival: v.optional(v.boolean()),
  deception: v.boolean(),
  intimidation: v.boolean(),
  performance: v.boolean(),
  persuasion: v.boolean(),
})

/**
 * A creature's skills: **skill → pre-calculated bonus**, sparse.
 *
 * Not the eighteen booleans a hero carries, and the two are not interchangeable. A
 * monster has no Dexterity, no Wisdom and no level, so `skillBonus` in lib/skills.ts
 * has nothing to work from — the bonus is stored ready-made, which is the same trade
 * `initiativeBonus` made when the reduced sheet was designed and the same reasoning.
 * Sparse because a creature is listed with the two or three things it is *good at*;
 * thirteen entries mostly reading +0 would be noise on a sheet meant to fit one screen.
 *
 * **Spelled out by hand rather than built from `SKILL_KEYS`**, for the import-direction
 * reason given on `skillProficienciesValidator` above: lib/skills.ts imports values
 * from this module, so a value import back would close a runtime cycle at module scope.
 * The same test that pins those thirteen fields against `SKILL_KEYS` pins these.
 *
 * **And not `v.record(v.string(), v.number())`**, which is the shorter thing to write
 * and gives away the only guarantee that matters here. A record accepts a fourteenth
 * skill, a misspelled `steath`, and any key string a client cares to invent — and "only
 * the thirteen D&D Lite skills, no monster-only fourteenth" is a spec rule that has
 * nowhere else it can be enforced mechanically. Here it is thirteen named fields and
 * Convex refuses the rest at the function boundary.
 */
export const creatureSkillsValidator = v.object({
  athletics: v.optional(v.number()),
  acrobatics: v.optional(v.number()),
  sleightOfHand: v.optional(v.number()),
  stealth: v.optional(v.number()),
  arcana: v.optional(v.number()),
  investigation: v.optional(v.number()),
  history: v.optional(v.number()),
  nature: v.optional(v.number()),
  religion: v.optional(v.number()),
  animalHandling: v.optional(v.number()),
  insight: v.optional(v.number()),
  perception: v.optional(v.number()),
  medicine: v.optional(v.number()),
  survival: v.optional(v.number()),
  deception: v.optional(v.number()),
  intimidation: v.optional(v.number()),
  performance: v.optional(v.number()),
  persuasion: v.optional(v.number()),
})
export type CreatureSkills = Infer<typeof creatureSkillsValidator>

/**
 * The eighteen keys, read off the validator rather than listed a second time.
 *
 * `SKILL_KEYS` is the list everything else uses and this module may not import it as a
 * value, so the choice was between a third hand-written copy of the eighteen names and
 * deriving them from the one copy that is already here. Derived cannot drift.
 */
const CREATURE_SKILL_KEYS = Object.keys(
  creatureSkillsValidator.fields,
) as (keyof CreatureSkills)[]

export const hitDiceValidator = v.object({
  count: v.number(),
  faces: v.union(v.literal(6), v.literal(8), v.literal(10), v.literal(12)),
})
export type HitDice = Infer<typeof hitDiceValidator>

/**
 * WHAT SHAPE OF ROLL A LINE ON A SHEET IS — and therefore what happens when
 * somebody clicks it.
 *
 * **The category describes the rolling, not the fiction.** A spell falls in all
 * three: Fire Bolt is a `weapon` because you have to land it before it burns
 * anything, Fireball is an `action` because it simply goes off, and Shield is a
 * `passive` because you declare it and it is up. Sorting by what a thing *is*
 * would put all twenty-four spells in one bucket and tell the roll path nothing.
 *
 * - **`weapon` — two rolls.** A to-hit and then a damage. This is the one
 *   `roll: string | null` could not express, and the only reason `toHit` exists.
 * - **`action` — one roll.** Divine Smite, Cure Wounds, a dragon's breath.
 * - **`passive` — no roll.** Lay on Hands, Giant's Might, Rage. Declared, not
 *   rolled.
 *
 * The dice milestone reads this for the announcement wording — a `weapon`
 * "attacks with their", an `action` "uses" — and for how many dice to throw.
 * Nothing evaluates a roll here; the field is stored and validated a milestone
 * before anything parses it, exactly as the roll grammar itself was.
 */
export const SHEET_ENTRY_CATEGORIES = ['weapon', 'action', 'passive'] as const
export type SheetEntryCategory = (typeof SHEET_ENTRY_CATEGORIES)[number]

/**
 * Spelled out by hand beside the list above rather than derived from it, the way
 * `creatureSkillsValidator` sits beside `SKILL_KEYS`. A Convex validator is a value
 * and the list is a type, and the one test pinning the two together is cheaper than
 * the generic that would build one from the other.
 */
export const sheetEntryCategoryValidator = v.union(
  v.literal('weapon'),
  v.literal('action'),
  v.literal('passive'),
)

/**
 * One line on a sheet: a feat, a spell, or an NPC's action.
 *
 * **One shape for all three**, and that is the decision that keeps a reduced NPC
 * sheet from becoming a second copy of everything. The two sheet variants differ in
 * what they hold; they do not differ in what a *line* is, so the dice milestone gets
 * one roll path rather than a fork, and the picker, the list and the editor are each
 * written once.
 *
 * `catalogueKey` records where the line came from and is not a pointer: the entry
 * is stored as a **copy**, so editing or retiring a catalogue entry never rewrites
 * an existing sheet, and a hand-typed line is byte-identical in shape to one the
 * picker supplied. The key is only used to show a badge and to avoid offering the
 * same catalogue entry twice.
 */
export const sheetEntryValidator = v.object({
  id: v.string(),
  name: v.string(),
  text: v.string(),
  /**
   * The **damage or the effect** — what the line does once it has happened. Not the
   * to-hit, which is `toHit` below and is a separate field precisely so that the
   * dice work aims at two targets rather than splitting one string.
   */
  roll: v.union(v.string(), v.null()),
  /** Spell level, 0 for a cantrip. Null on a feat or an NPC action. */
  level: v.union(v.number(), v.null()),
  catalogueKey: v.union(v.string(), v.null()),
  // ⚠️ BOTH OPTIONAL BECAUSE `characters.sheet` ALREADY HOLDS ENTRIES WITHOUT THEM,
  // AND ADDING A REQUIRED FIELD TO A POPULATED TABLE FAILS THE SCHEMA PUSH.
  //
  // **The fourth occasion** — `games.status`, then `skillProficiencies` and `speed`
  // on the PC sheet, then the five on the NPC sheet, now these — and the first on a
  // type whose field-by-field rebuilds have twice silently discarded a newly added
  // field. Read both through exactly one accessor, `categoryOf` and `toHitOf`, so
  // the default for an entry written before this milestone lives in one place.
  //
  // **Absent, never null**, and the rule that decides it is worth stating once
  // because this file now contains both spellings. `roll`, `level` and
  // `catalogueKey` say "none" with `null` because they are *required*, and a
  // required field needs a value meaning none. An optional field already has one, so
  // a second would be two states for one meaning — which every field-by-field
  // rebuild below would then have to agree about, and which `firstDifference` in
  // scripts/board-smoke.mjs reports as `present on one side only`.
  category: v.optional(sheetEntryCategoryValidator),
  /**
   * The roll that lands a weapon. `1d20+STR+PROF` on a hero; `1d20+4` on a monster,
   * whose reduced sheet has no ability scores for a token to resolve against.
   *
   * **Only a weapon has one**, and `entriesProblem` refuses it on anything else — so
   * a stored to-hit that nothing will ever read cannot exist, and `toHitOf` fails
   * closed against one written by a deployment this one has not heard of.
   */
  toHit: v.optional(v.string()),
})
export type SheetEntry = Infer<typeof sheetEntryValidator>

/**
 * A sheet entry as **content** declares it: no per-character `id`, and the category
 * answered rather than defaulted.
 *
 * ⚠️ **`category` is required here and optional on `sheetEntryValidator`, and the
 * asymmetry is the point.** The stored field has to be optional, because
 * `characters.sheet` already holds entries without one. But content is written,
 * reviewed and compiled with the code, so there is no old content — and making it
 * required is what turns "recategorise every entry in three corpora" from a job
 * somebody has to remember into a list `npm run lint` prints. `categoryOf`'s default
 * exists for documents written before this milestone, not as a way for an author to
 * skip the question.
 *
 * `toHit` stays optional, because most entries are not weapons and six hundred
 * literals saying `toHit: undefined` would be noise — and `undefined` in a content
 * literal is a habit this codebase does not want. That a weapon has one is enforced
 * by `entriesProblem`, which every entry in all three corpora already goes through.
 *
 * Declared here rather than in `library/types.ts` so that `lib/species.ts` can take it
 * too: that module is imported by the browser for its dropdown, and `bundleGuard`
 * and `corpusGuard` both refuse a specifier naming a corpus directory.
 */
export type ContentEntry = Omit<SheetEntry, 'id' | 'category'> & {
  category: SheetEntryCategory
}

/**
 * The full D&D Lite sheet: six stats, saving throws, AC, HP, hit dice, feats and
 * spells. Initiative and speed are absent because both are derived — see
 * `initiativeBonusOf` and `SPEED_FEET`.
 *
 * Current hit points are absent too, and that one is load-bearing rather than
 * tidy. They live in `characterVitals` so that the board's health-bar subscription
 * never has to read a sheet document — which for an NPC is the secret this
 * milestone exists to keep. See the note on the table in schema.ts.
 */
export const pcSheetValidator = v.object({
  kind: v.literal('pc'),
  level: v.number(),
  className: v.string(),
  abilities: abilityScoresValidator,
  saveProficiencies: saveProficienciesValidator,
  armourClass: v.number(),
  maxHp: v.number(),
  hitDice: hitDiceValidator,
  feats: v.array(sheetEntryValidator),
  spells: v.array(sheetEntryValidator),
  // ⚠️ BOTH OPTIONAL BECAUSE THE TABLE ALREADY HOLDS SHEETS WITHOUT THEM.
  //
  // Milestone 3 wrote `kind: 'pc'` sheets with neither field, and adding a required
  // one to an object that already has stored instances fails the schema push — the
  // same trap `games.status` and the `sheet` field itself each hit in turn. Read
  // them through `skillProficienciesOf` and `speedOf`, never directly, so the
  // default lives in exactly one place. A resolved sheet always carries both.
  skillProficiencies: v.optional(skillProficienciesValidator),
  // Feet. Absent means the D&D Lite default of 35, which was a constant with no
  // field behind it until the Goliath needed to be 10 feet faster.
  speed: v.optional(v.number()),
})
export type PcSheet = Infer<typeof pcSheetValidator>

/**
 * The two groups a DM's creature can sit in. An innkeeper is an `npc`; an owlbear is a
 * `monster`.
 *
 * **This says nothing about secrecy.** Both are refused to a player wholesale by
 * `maySeeCharacter`, which asks `isMonsterSheet` and not this — the schema has four sheet
 * *kinds* and they do not map onto the DM's three headings, which is the whole reason
 * this union exists. Keeping the two questions apart is deliberate: one decides who may
 * read a document and the other decides which list it is printed in.
 */
export const CREATURE_GROUPS = ['npc', 'monster'] as const
export type CreatureGroup = (typeof CREATURE_GROUPS)[number]

/**
 * Spelled out by hand beside the list above rather than derived from it, on the
 * convention `sheetEntryCategoryValidator` states: a Convex validator is a value and
 * the list is a type, and one test pinning the two together is cheaper than the
 * generic that would build one from the other. `sheet.test.ts` is that test, and it
 * pins `characterGroupValidator` below in the same breath.
 */
export const creatureGroupValidator = v.union(v.literal('npc'), v.literal('monster'))

/**
 * WHAT THE DM IS CHOOSING BETWEEN: the word on the button, and the example beside it.
 *
 * A `Record` keyed by the union rather than two buttons written out in JSX — the
 * idiom `SHEET_ENTRY_CATEGORY_LABELS` uses further down this file, and the one
 * CLAUDE.md invariant 9 argues for. `CreatureGroupToggle` iterates `CREATURE_GROUPS`
 * against this, so a third group arrives in both create dialogs and in the sheet
 * editor with a button of its own; two hand-written buttons would have left it
 * **stored, counted and unselectable**, which is exactly the failure a category with
 * no section heading would have been.
 *
 * ⚠️ **The sibling union got this and this one did not**, which is why it is worth
 * spelling out. `CHARACTER_GROUPS` has been iterated through a `Record` of headings
 * since the change that added both, and `CREATURE_GROUPS` was declared in the same
 * change and read by nothing.
 *
 * The hint is a whole clause rather than a bare noun, so that the sentence under the
 * control can be joined from however many groups there are. It used to be two
 * hand-written sentences, one per call site, already differing in wording.
 *
 * Prose in a Convex module for the same reason as `ABILITY_NAMES` and the two entry
 * label records: the alternative is one copy per screen, and copies of a label are
 * labels that can disagree. Nothing here is sent to a player — see the note on the
 * union above.
 */
export const CREATURE_GROUP_CHOICES: Record<CreatureGroup, { label: string; hint: string }> = {
  npc: { label: 'NPC', hint: 'an innkeeper is an NPC' },
  monster: { label: 'Monster', hint: 'an owlbear is a monster' },
}

/**
 * The reduced NPC sheet. A monster gets AC, hit points, an initiative bonus and a
 * list of things it does, and nothing else.
 *
 * `initiativeBonus` is stored rather than derived precisely because there is no
 * Dexterity score to derive it from — that is the cost of the reduction, paid in
 * one field. A monster that needs a saving throw gets an `actions` entry whose roll
 * is `1d20+3`, which is the escape hatch that keeps the reduction from being a
 * ceiling.
 *
 * `notes` is DM-only by construction rather than by a flag: the whole document is
 * refused to a player, because an NPC sheet is a spoiler of exactly the same shape
 * as a hero's. See `maySeeCharacter` in lib/characters.ts.
 */
export const npcSheetValidator = v.object({
  kind: v.literal('npc'),
  armourClass: v.number(),
  maxHp: v.number(),
  initiativeBonus: v.number(),
  actions: v.array(sheetEntryValidator),
  notes: v.string(),
  // ⚠️ ALL FIVE OPTIONAL BECAUSE THE TABLE HAS HELD `kind: 'npc'` SHEETS SINCE SHEETS
  // EXISTED, AND ADDING A REQUIRED FIELD TO A POPULATED TABLE FAILS THE SCHEMA PUSH.
  //
  // **This is the third occasion**, and the count is worth keeping: `games.status`, then
  // `skillProficiencies` and `speed` on `pcSheetValidator`, now these. Each is read
  // through exactly one accessor — `speedOf`, `passivePerceptionOf`, `attackBonusOf`,
  // `saveDcOf`, `creatureSkillsOf` — so the default for a monster somebody typed in
  // before the bestiary existed lives in one place per field rather than at every call
  // site. Nothing reads any of them directly.
  //
  // Absent is not the same as zero for four of the five, which is why the accessors
  // return null rather than a number: a hand-built goblin has no recorded passive
  // perception, and printing 10 would be inventing a statistic the DM never gave.
  //
  // `attackBonus` is **one number for the whole creature** rather than one per attack,
  // which is a reduction against the source spec's attack block and a deliberate one.
  // Per-attack would mean widening `sheetEntryValidator`, and that shape is the single
  // one shared across a hero's feats, a hero's spells and a monster's actions — the
  // saving that stops two sheet kinds becoming two of everything, and the reason the
  // dice milestone gets one roll path instead of a fork. Widening it for a monster-only
  // concern spends that on the one creature in a hundred whose claw and bite differ.
  //
  // ⚠️ **That shape has since been widened, and this reduction survived it.** An entry
  // now carries a `category` and a weapon carries a `toHit`, because a to-hit paired
  // with a damage is a shape `roll: string | null` could not express for *anything* —
  // a hero's greatsword as much as a goblin's scimitar. ADR 0007 left the door open
  // for exactly that revisit, and the answer keeps its decision rather than reversing
  // it: there is still one attack bonus per creature, and `resolveBestiary` composes
  // every attack's to-hit *from* this field through `toHitFromBonus`. Nothing is
  // stored per attack, so there is still nowhere for a claw and a bite to disagree.
  speed: v.optional(v.number()),
  passivePerception: v.optional(v.number()),
  attackBonus: v.optional(v.number()),
  saveDc: v.optional(v.number()),
  skills: v.optional(creatureSkillsValidator),
  // Which heading this creature sits under in the DM's sheet selector: the innkeeper is
  // an NPC and the owlbear is a monster. **A hand-built creature stores it because it has
  // nothing to derive it from** — a bestiary-linked one is grouped by the corpus category
  // of the entry it points at, in `groupOf`, which is the same split every other number
  // on these two sheet kinds already makes.
  //
  // Sixth optional field on this validator and the same reason as the five above.
  // Read through `creatureGroupOf` below and nowhere else, which is where the default and
  // the reason a default is safe at all are both written down. `groupOf` in
  // lib/resolve.ts is that accessor's one backend caller and answers the wider question
  // — which of the DM's *three* headings a character of any kind sits under.
  group: v.optional(creatureGroupValidator),
})
export type NpcSheet = Infer<typeof npcSheetValidator>

/**
 * THE DISCRIMINATOR. Whether a character is a monster is stated here, in the stored
 * document, and is never inferred from anything else.
 *
 * In particular it is never derived from "has any seat claimed this character?".
 * That derivation is the exact shape of the bug Milestone 2 shipped and had to
 * correct — an unattached token was treated as nobody's and therefore everybody's —
 * and it would fail in both directions here: a hero whose player has not joined yet
 * would have their hit points hidden from the party, and an NPC somebody claimed
 * would have theirs published to it.
 */
export const sheetValidator = v.union(pcSheetValidator, npcSheetValidator)
export type CharacterSheet = Infer<typeof sheetValidator>
export type CharacterKind = CharacterSheet['kind']

export const characterKindValidator = v.union(v.literal('pc'), v.literal('npc'))

/**
 * The three headings the DM's sheet selector has, resolved: Characters, NPCs, Monsters.
 *
 * `CreatureGroup` widened by the one group a creature can never be in. The schema's four
 * stored kinds do not map onto these — `pc` and `preset` are both characters, `npc` and
 * `bestiary` are each either of the other two — so the mapping is a function,
 * `groupOf` in lib/resolve.ts, and it is asked in one place.
 *
 * ⚠️ **`kind` and `group` are two fields on one payload and they answer different
 * questions.** `kind` (`pc` | `npc`) is the secrecy discriminator: it decides whether a
 * caller may know the character exists at all. `group` decides which heading it is
 * printed under, and only the DM ever receives one that is not `'character'`. A reader
 * who collapses them will either publish a monster or lose a heading.
 */
export const CHARACTER_GROUPS = ['character', 'npc', 'monster'] as const
export type CharacterGroup = (typeof CHARACTER_GROUPS)[number]

/** Hand-spelled beside the list, and pinned against it by a test — see `creatureGroupValidator`. */
export const characterGroupValidator = v.union(
  v.literal('character'),
  v.literal('npc'),
  v.literal('monster'),
)

/**
 * WHAT EACH OF THE THREE HEADINGS IS CALLED. The union above, `groupOf`'s `never` arm and
 * these three words are **one fact**, and this is where the third part of it lives.
 *
 * Prose in a Convex module for the reason `ABILITY_NAMES`, `CREATURE_GROUP_CHOICES` and the
 * two `SheetEntry` label records are: the alternative is one copy per screen, and copies of
 * a label are labels that can disagree. Nothing here is sent to a player — every group but
 * `character` is DM-only, and `maySeeCharacter` refused the row long before anybody asked
 * which heading it went under (see the ⚠️ on `CHARACTER_GROUPS`).
 *
 * ⚠️ **A `Record` keyed by the union is what lets a renderer iterate `CHARACTER_GROUPS`
 * instead of naming three sections in JSX**, which is the formulation CLAUDE.md invariant 9
 * and ADR 0009 settled on. Three hand-written sections is the arrangement where a fourth
 * group leaves a character **stored, counted and with no heading to find it under** — or, in
 * the token editor's rebind select, a creature no coin can be pointed at. A missing key here
 * fails to compile, and that refusal is the whole of the guard.
 *
 * ⚠️ **One record rather than three, which is worth spelling out because it was three.**
 * `SheetsTab`'s `GROUP_SECTIONS` and `TokenEditPanel`'s `GROUP_LABELS` each held their own
 * copy of these words keyed by the same union, and both carried the invariant-9 argument
 * correctly — which is precisely the problem rather than a mitigation of it. Three records
 * make a fourth group fail to compile in three files, and whichever one is fixed first looks
 * finished, so the group that arrives is the group that ends up printed under two headings
 * and missing from a third list. One record is one refusal, at the declaration, and every
 * screen inherits it.
 *
 * (`BestiaryPicker`'s tab strip is **not** a fourth copy and must not be folded in here. Its
 * four tabs are the corpus's own `all | monster | enemy | social` — a different union that
 * happens to share one word with this one, over content categories rather than over the DM's
 * headings.)
 *
 * A per-screen sentence about an *empty* group is a different thing and stays on that
 * screen: `SheetsTab` still owns "No monsters yet — most of them come off the bestiary
 * shelf", which is about that list in that panel and would be furniture in a module the
 * browser shares for its arithmetic. The heading is the shared fact; the copy around it
 * is not.
 */
export const CHARACTER_GROUP_LABELS: Record<CharacterGroup, string> = {
  character: 'Characters',
  npc: 'NPCs',
  monster: 'Monsters',
}

/**
 * What the DM has typed over the top of a premade sheet.
 *
 * Every field optional, and absent is overwhelmingly the common case — this exists
 * so that "the DM can always change a player's sheet" stays literally true against a
 * character whose stats are read live from the library. An override survives a
 * level-up, which is the point: bumping a boss-fight armour class should not be
 * undone by the DM awarding a level five minutes later.
 *
 * Deliberately **not** every field of `PcSheet`. Level, class and race are the
 * *selections* and are changed by changing them; overriding them here would give two
 * ways to say the same thing and two places for them to disagree.
 */
export const presetOverridesValidator = v.object({
  armourClass: v.optional(v.number()),
  maxHp: v.optional(v.number()),
  abilities: v.optional(abilityScoresValidator),
  saveProficiencies: v.optional(saveProficienciesValidator),
  skillProficiencies: v.optional(skillProficienciesValidator),
  speed: v.optional(v.number()),
  hitDice: v.optional(hitDiceValidator),
  /** Appended to what the library and the race already gave, never replacing them. */
  extraFeats: v.optional(v.array(sheetEntryValidator)),
  extraSpells: v.optional(v.array(sheetEntryValidator)),
})
export type PresetOverrides = Infer<typeof presetOverridesValidator>

/**
 * A character built by choosing rather than by filling in a form.
 *
 * **This stores the choices, not the sheet.** Ability scores, armour class, hit
 * points, skills, feats and spells are all read live out of `lib/library/` at
 * resolution time, so awarding a level is one number changing and every character in
 * the game improves the moment the library does.
 *
 * `locked` is a courtesy rather than a defence, and worth being honest about: it
 * stops a player rebuilding their character by accident mid-session, and the DM
 * clears it when somebody genuinely wants to change. `playerId` is routing and not
 * identity (ADR 0004), so it does not survive the network tab — but nothing behind
 * it is a secret, and the worst outcome is a rude change everybody can see.
 */
export const presetSheetValidator = v.object({
  kind: v.literal('preset'),
  race: speciesKeyValidator,
  classKey: classKeyValidator,
  /** Null below level 2, when no archetype has been chosen yet. */
  subclassKey: v.union(v.string(), v.null()),
  /**
   * The lineage, legacy or draconic ancestry, on the five species that print one.
   *
   * ⚠️ **Optional *and* nullable, and the two spellings mean different things** —
   * absent is a character stored before this field existed, null is a character whose
   * species has a lineage table and who has not picked from it yet. Both resolve to
   * nothing, so nothing downstream has to tell them apart; `lineageOf` takes the null
   * and answers null, exactly as `subclassOf` does below `SUBCLASS_LEVEL`.
   *
   * A bare `v.string()` rather than a union of the twenty-four keys, which is the
   * opposite of what `speciesKeyValidator` does one field up and is deliberate: a
   * lineage key is only unique **within its species**, so a flat union would happily
   * accept `wood` on a Goliath and a narrow one would need to be per-species, which a
   * Convex object validator cannot express. The check that matters therefore lives in
   * `lineageOf`, which is asked with the resolved species and answers null for anything
   * that does not belong to it.
   */
  lineageKey: v.optional(v.union(v.string(), v.null())),
  level: v.number(),
  overrides: v.optional(presetOverridesValidator),
  locked: v.boolean(),
})
export type PresetSheet = Infer<typeof presetSheetValidator>

/**
 * What the DM has typed over the top of a creature resolved from the bestiary.
 *
 * The same shape and the same purpose as `presetOverridesValidator` above, applied to
 * the other corpus: dropping tonight's Owlbear to 30 hit points leaves the library entry
 * untouched and every other game's Owlbear unchanged, and clearing the override puts the
 * library's number back. An override is the last layer of resolution, so it survives a CR
 * shift — an armour class somebody bumped for a boss fight stays bumped.
 *
 * Deliberately **not** `cr` and **not** `entryKey`. Those two are the *selections* — the
 * key is which creature this is and the rating is the index the bestiary is looked up at,
 * exactly what a level is to a preset hero — and they are changed by changing them. An
 * override entry for either would be two ways to say the same thing and therefore two
 * places for them to disagree, which is the rule ADR 0006 established for level, class
 * and race and the reason a shifted CR is stored beside the key rather than in here.
 */
export const bestiaryOverridesValidator = v.object({
  armourClass: v.optional(v.number()),
  maxHp: v.optional(v.number()),
  initiativeBonus: v.optional(v.number()),
  attackBonus: v.optional(v.number()),
  saveDc: v.optional(v.number()),
  passivePerception: v.optional(v.number()),
  speed: v.optional(v.number()),
  notes: v.optional(v.string()),
  skills: v.optional(creatureSkillsValidator),
  /** Appended to what the entry already gives, never replacing them. */
  extraActions: v.optional(v.array(sheetEntryValidator)),
})
export type BestiaryOverrides = Infer<typeof bestiaryOverridesValidator>

/**
 * A creature taken off the shelf rather than typed in. The DM's half of `preset`.
 *
 * **This stores the selections, not the sheet.** Which creature, at which rating, plus
 * whatever the DM has typed over the top; the armour class, hit points, initiative,
 * attacks and abilities are read live out of `lib/bestiary/` at resolution time and
 * scaled to `cr` on the way through.
 *
 * ⚠️ **There is deliberately no `maxHp`, no `armourClass`, no `attackBonus`, no
 * `initiativeBonus` and no `saveDc` field here, and the absence is the guarantee.**
 *
 * CR scaling must be reversible and non-compounding: 3 → 6 → 3 has to return the
 * original sheet byte for byte. The way that goes wrong is a scaled number being
 * persisted and then used as the baseline for the next shift, at which point the second
 * scale is applied on top of the first and stepping back down lands somewhere new. This
 * shape makes that unwriteable — the scaler reads the entry's own baseline every time
 * because **there is nowhere on this document to put a scaled number.** Non-compounding
 * is enforced by the validator, not by everyone remembering to do it in the right order.
 *
 * (An overridden `maxHp` in `overrides` is not the same thing and does not reopen it: an
 * override is the DM's own figure, applied *after* the scale and never read by it, which
 * is exactly why a pinned armour class survives a shift unchanged.)
 */
export const bestiarySheetValidator = v.object({
  kind: v.literal('bestiary'),
  /** Which creature. A key into `lib/bestiary/`, checked against the corpus on write. */
  entryKey: v.string(),
  /** The rating to resolve at — the entry's own unless the DM has stepped it. */
  cr: crValidator,
  overrides: v.optional(bestiaryOverridesValidator),
})
export type BestiarySheet = Infer<typeof bestiarySheetValidator>

/**
 * WHAT THE DATABASE HOLDS, as opposed to what the rest of the application reads.
 *
 * The distinction is the whole of the premade-library design. A `preset` is a set of
 * selections that `resolveSheet` in lib/resolve.ts turns into an ordinary
 * `PcSheet` — so every consumer downstream of that one function keeps the type it
 * already had, and `maySeeCharacter`, `visibleVitals`, the health bands and
 * `publicSheet` needed no change at all.
 *
 * `bestiary` is the fourth member and the same trick applied to the DM's corpus: a
 * creature key, a challenge rating and an optional override diff, which resolve to an
 * ordinary `NpcSheet`. Two of the four are selections that resolve, and two are the
 * finished article.
 *
 * If you are reading a character to *display or roll* it, you want `CharacterSheet`.
 * This type appears only where the stored document is being written or validated.
 */
export const storedSheetValidator = v.union(
  pcSheetValidator,
  npcSheetValidator,
  presetSheetValidator,
  bestiarySheetValidator,
)
export type StoredSheet = Infer<typeof storedSheetValidator>

/**
 * IS THIS DOCUMENT A MONSTER? The one question the visibility rule turns on.
 *
 * **An allow-list of the kinds that may be published, not a deny-list of the ones that
 * must not be.** That inversion is the whole point of the function existing. The
 * previous formulation was `sheet?.kind === 'npc'`, written in three places, and it was
 * the only kind-test in this codebase whose wrongness was invisible to the compiler:
 * adding a member to the union above leaves it compiling, passing, and answering
 * `false` — publishing the new kind to every player at the table. Of all the kind-tests
 * that could have had that property, it was the one guarding the secret.
 *
 * The `never` assignment is what fixes that. A fifth member of `storedSheetValidator`
 * makes `sheet` un-narrowable to `never` in the default branch, and `npm run lint`
 * fails on the line below — so the compiler asks the question rather than choosing an
 * answer.
 *
 * The **runtime** default is `true`, which is fail-closed, and that is not belt and
 * braces for an unreachable branch. A schema push is not atomic across a deployment: a
 * document written by a newer deployment can be read by an older one for the seconds in
 * between, and in that window this function sees a kind it has never heard of. A secret
 * must read as a secret. The cost of being wrong in this direction is a monster the DM
 * cannot see for a moment; the cost of being wrong in the other is an ambush spoiled.
 */
export function isMonsterSheet(sheet: StoredSheet | undefined): boolean {
  // A sheet-less legacy character is a player character — NPCs could not be created
  // before sheets existed. See the note on `resolveSheet`.
  if (sheet === undefined) return false
  switch (sheet.kind) {
    case 'pc':
    case 'preset':
      return false
    case 'npc':
    case 'bestiary':
      return true
    default: {
      const unknownKind: never = sheet
      void unknownKind
      return true
    }
  }
}

/**
 * HOW MANY ROLLS A CATEGORY PROMISES. The one place the category union is switched
 * on.
 *
 * **An allow-list of the shapes that exist, not a deny-list of the ones that do
 * not**, for the reason written out at length on `isMonsterSheet` above: this
 * codebase learned that a discriminator test whose wrongness is invisible to the
 * compiler will eventually be the one guarding something. The `never` assignment
 * makes `npm run lint` fail on a fourth category rather than letting one be quietly
 * handled as something else.
 *
 * ⚠️ **The compile-time refusal is the whole of the guard, and the runtime default is
 * unreachable from the save path.** An earlier version of this comment claimed
 * otherwise — that an unknown category would be read as a passive and an entry
 * carrying rolls therefore refused on save — and that is simply not what happens:
 * every caller reaches this through `categoryOf`, which has already replaced an
 * unrecognised value with the *derived* default, so a document written by a newer
 * deployment is stored under the shape its rolls actually have and is accepted.
 *
 * That is the better outcome and it is worth being clear that it is the one we get.
 * Nothing here guards a secret — this union decides how many dice a click throws, not
 * who may see a stat block — so the conservative move is to keep the entry and
 * describe it by what it demonstrably is, rather than to refuse a DM's save during
 * the seconds a deploy is rolling out. The `never` arm below is what actually holds
 * the line: a fourth category fails `npm run lint` here and in
 * `SHEET_ENTRY_CATEGORY_LABELS`, so the question gets asked before anything ships.
 * The runtime `return` is the answer that promises least, kept for the branch the
 * compiler cannot see.
 */
export type EntryRollShape = { readonly toHit: boolean; readonly roll: boolean }

// Three shared frozen values rather than an object literal per arm. This runs once
// per entry inside `entriesProblem`, which the sheet editor re-runs on every
// keystroke over as many as forty entries — so a fresh object per call is up to
// eighty allocations a keypress for three constants. Frozen because they are handed
// to callers who have no business editing them, and declared here rather than inline
// so the switch below stays the thing a reader looks at.
const WEAPON_SHAPE: EntryRollShape = Object.freeze({ toHit: true, roll: true })
const ACTION_SHAPE: EntryRollShape = Object.freeze({ toHit: false, roll: true })
const PASSIVE_SHAPE: EntryRollShape = Object.freeze({ toHit: false, roll: false })

export function rollShapeOf(category: SheetEntryCategory): EntryRollShape {
  switch (category) {
    case 'weapon':
      return WEAPON_SHAPE
    case 'action':
      return ACTION_SHAPE
    case 'passive':
      return PASSIVE_SHAPE
    default: {
      const unknownCategory: never = category
      void unknownCategory
      return PASSIVE_SHAPE
    }
  }
}

/**
 * The heading each category gets on a sheet, in the order the sections appear.
 *
 * A `Record` keyed by the union rather than a switch, which is a second
 * exhaustiveness check for free: a fourth category fails to compile here as well as
 * at the `never` above. Two mechanical refusals is the right number for the union a
 * whole milestone turns on.
 */
export const SHEET_ENTRY_CATEGORY_LABELS: Record<SheetEntryCategory, string> = {
  weapon: 'Weapons',
  action: 'Actions',
  passive: 'Passives',
}

/**
 * What to call the roll that is **not** the to-hit, per category.
 *
 * A weapon's is its *damage*, and calling it that is what keeps the two rolls on one
 * row tellable apart — by a reader now, and by the dice work, which makes each one
 * clickable and would otherwise offer two things labelled the same. Every other
 * category has one roll and no ambiguity to resolve, so it keeps the plain word.
 *
 * A `Record` beside the section labels above rather than a ternary at each call site,
 * for the same reason as those: the entry list and the entry picker each need it, one
 * imports from the other so neither could own it, and two spellings of a label are
 * two labels that can disagree. It also earns the same compile-time refusal — a
 * fourth category that had no answer here would otherwise fall silently to "Roll".
 */
export const SHEET_ENTRY_ROLL_LABELS: Record<SheetEntryCategory, string> = {
  weapon: 'Damage',
  action: 'Roll',
  passive: 'Roll',
}

// ---------------------------------------------------------------------------
// The optional fields, each read through exactly one accessor
//
// Every field on either sheet variant — and now on an entry — that the schema could
// not require is read from here and nowhere else, so the default for a document
// written before the field existed lives in one place per field. There are ten now,
// which is why they have a section.
// ---------------------------------------------------------------------------

/**
 * WHAT SHAPE OF ROLL THIS ENTRY IS. The only place the optional `category` is read.
 *
 * **The default is derived rather than constant, and the derivation is not a
 * guess.** An entry written before this milestone already records the one fact the
 * category turns on: whether it rolls anything. `roll === null` *is* the definition
 * of a passive, so reading it restates a stored fact rather than inventing one — and
 * it is the only default under which every entry that already exists satisfies the
 * coherence rules `entriesProblem` now enforces. A constant would break one half of
 * the legacy corpus whichever constant it was: `'action'` makes Rage, Action Surge
 * and Lay on Hands into things that announce "uses" and then roll nothing, and would
 * make every sheet holding one unsaveable on its next edit; `'passive'` makes
 * Fireball unclickable.
 *
 * ⚠️ **`weapon` can never be a default.** It is the only category that *asserts a
 * second field exists*, so defaulting to it would promise a `toHit` no legacy entry
 * has and every consumer would have to re-check anyway — at which point the category
 * has stopped being a discriminator and become a hint. It cannot be derived even in
 * principle: nothing distinguishes a greatsword's `1d8+STR` from Cure Wounds'
 * `2d8+WIS`, so a guess would announce a heal as an attack.
 *
 * A stored value outside the union reads as the default too — the stance `speedOf`
 * takes on a non-finite number, for the same reason `isMonsterSheet` keeps a runtime
 * default at all: a schema push is not atomic, and in that window an unknown
 * category must not be allowed to claim a roll exists.
 */
export function categoryOf(entry: SheetEntry): SheetEntryCategory {
  const stored = entry.category
  if (stored !== undefined && (SHEET_ENTRY_CATEGORIES as readonly string[]).includes(stored)) {
    return stored
  }
  return categoryForRoll(entry.roll)
}

/**
 * The category a line with this roll and nothing else to go on must be. **The one
 * statement of the rule `categoryOf` defaults to**, split out so that the two callers
 * who cannot ask `categoryOf` are not left restating it.
 *
 * They cannot ask because `categoryOf` takes a `SheetEntry` and both of them are
 * building a `ContentEntry`, which has no `id` yet: `abilityEntry` in lib/resolve.ts
 * turns a bestiary ability into a line, and the entry fixture in the character tests
 * builds one from a roll. Both had written the rule out again, and the third copy
 * **had already drifted** — it asked whether the roll survived trimming where the
 * other two asked only whether it was null, so a whitespace-only roll was a passive to
 * one and an action to the others.
 *
 * ⚠️ That drift is worse than it looks, because `entriesProblem`'s arity rule is
 * anchored to this exact derivation — its note says the rule is safe against existing
 * rows precisely *because* it is this default restated. A copy that disagrees mints
 * entries the validator then refuses, and it surfaces as a DM's creature failing to
 * save rather than as a failing test.
 */
export function categoryForRoll(roll: string | null): SheetEntryCategory {
  return roll === null ? 'passive' : 'action'
}

/**
 * The only place the optional `toHit` is read. **Null on anything that is not a
 * weapon**, whatever the document says.
 *
 * Unreachable through a validated sheet — `entriesProblem` refuses a to-hit on an
 * action or a passive — and kept for the reason `isMonsterSheet`'s runtime default
 * is kept: this is what runs in the seconds after a deploy, when a document written
 * by newer code is read by older code. A to-hit that outlives its category is a roll
 * nobody asked for, arriving on a line that announces "uses".
 */
export function toHitOf(entry: SheetEntry): string | null {
  // Asked as "does this category carry a to-hit" rather than "is it the weapon",
  // because those are the same question today and the second one stops being right
  // the moment a fourth category is added. `rollShapeOf` is the place that decides,
  // and it is the place the compiler makes somebody answer.
  if (!rollShapeOf(categoryOf(entry)).toHit) return null
  return entry.toHit === undefined || entry.toHit === '' ? null : entry.toHit
}

/**
 * A to-hit built from a flat bonus. `1d20+4`, `1d20-2`, and a bare `1d20` at zero.
 *
 * For a creature, whose reduced sheet carries one `attackBonus` for the whole thing
 * and no ability scores for a token to resolve against. The bestiary composes its
 * attacks' to-hit through this rather than storing one per attack, which is what
 * leaves ADR 0007's decision standing: there is still exactly one attack bonus per
 * creature, and this is that bonus spelled as a roll.
 *
 * ⚠️ **Never `1d20+0`.** `ROLL_PATTERN` would accept it — `\d{1,3}` matches `0` — so
 * the grammar is not the guard here and the check has to be explicit. Tested before
 * formatting, which also catches `-0`: `Math.round(-0.3)` produces it and `-0 === 0`
 * is true, so one comparison handles both. `scaleRoll` refuses `+0` at the identical
 * point for the identical reason.
 */
export function toHitFromBonus(bonus: number): string {
  if (!Number.isFinite(bonus)) return TO_HIT_PREFIX
  const whole = Math.round(bonus)
  if (whole === 0) return TO_HIT_PREFIX
  const out = `${TO_HIT_PREFIX}${whole < 0 ? '-' : '+'}${Math.abs(whole)}`
  // The last word belongs to the grammar rather than to the arithmetic, exactly as
  // it does at the foot of `scaleRoll`. Both attack-bonus bounds fit `\d{1,3}`, so
  // this is unreachable through a validated sheet.
  return isValidRoll(out) ? out : TO_HIT_PREFIX
}

/** All eighteen false. A fresh object each call — see the note on `defaultPcSheet`. */
export function noSkills(): SkillProficiencies {
  return {
    athletics: false,
    acrobatics: false,
    sleightOfHand: false,
    stealth: false,
    arcana: false,
    investigation: false,
    history: false,
    nature: false,
    religion: false,
    animalHandling: false,
    insight: false,
    perception: false,
    medicine: false,
    survival: false,
    deception: false,
    intimidation: false,
    performance: false,
    persuasion: false,
  }
}

/**
 * The only place the optional `skillProficiencies` is read.
 *
 * ⚠️ **It normalises rather than passing the stored object through, and that is the whole of
 * the widen half of the skills migration.** `SkillProficiencies` is a `Record<SkillKey,
 * boolean>` over eighteen keys; a sheet stored before the five 2024 skills existed carries
 * thirteen. Handing that back unchanged would be a type that lies — every caller believes it
 * holds eighteen booleans and five of them are `undefined`, which reads as `false` at a
 * comparison and as *missing* to `Object.keys`, `board-smoke.mjs`' key-set walk and the
 * renderer's `SKILLS.map`.
 *
 * Spread over `noSkills()` rather than `??`-ed field by field, so a nineteenth skill needs no
 * edit here. The five become required after the sweep, at which point this collapses back to
 * the pass-through it used to be — but not before, because a schema push is not atomic and a
 * row written by an older deployment can be read by a newer one in the window between.
 */
export function skillProficienciesOf(sheet: CharacterSheet): SkillProficiencies {
  if (sheet.kind !== 'pc' || sheet.skillProficiencies === undefined) return noSkills()
  return { ...noSkills(), ...sheet.skillProficiencies }
}

/**
 * The only place the optional `speed` is read.
 *
 * `SPEED_FEET` used to be the whole answer and is now merely the default. The
 * comment it carried — that a character with a different speed is one the rules say
 * cannot exist — was true until the Goliath, and is why that constant is still the
 * number every other character gets.
 *
 * **Kind-agnostic**, which it was not: the test used to be `kind === 'pc'`, so a
 * monster's speed was read as 35 whatever the sheet said and a stored value was
 * silently discarded. That was invisible while a monster had no `speed` field to store
 * and became wrong the moment the bestiary gave every creature one — a Dire Wolf moves
 * 50 and a Zombie moves 20, and the difference is most of what makes them feel unlike
 * each other on a grid. The field means the same thing on both variants, so it is read
 * the same way on both.
 */
export function speedOf(sheet: CharacterSheet): number {
  const stored = sheet.speed
  return stored === undefined || !Number.isFinite(stored) ? SPEED_FEET : stored
}

/**
 * A creature's armour class, or `null` when the number stored is not one.
 *
 * ⚠️ **An accessor because this is a *resolved* sheet's field and the resolution can fail
 * open.** `armourClass` is required on both members of `sheetValidator`, so on the face of
 * it this needs no helper — but it is `v.optional(v.number())` on `bestiarySheetValidator`'s
 * overrides and on a preset's, so the value that lands here has been through `resolveSheet`
 * and can be whatever a stale corpus entry or a half-written override left behind.
 * `finiteOrNull` is module-private, which is the tell: the first call site to want it wrote
 * `Number.isFinite(sheet.armourClass) ? … : null` inline, and the second would have written
 * it again somewhere else.
 *
 * Sits beside `passivePerceptionOf` because the two are published together — see
 * `visibleVitals` — and a pair derived in two different ways is a pair that comes to
 * disagree about what *absent* means.
 */
export function armourClassOf(sheet: CharacterSheet): number | null {
  return finiteOrNull(sheet.armourClass)
}

/**
 * The only place the optional `passivePerception` is read. **Null when absent**, not 10.
 *
 * A hero's passive perception is derived — `passivePerception` in lib/skills.ts, from
 * Wisdom, the level and the Perception flag — so this is only ever a monster's, which is
 * stored pre-calculated because a reduced sheet has no ability score to derive it from.
 *
 * Null rather than the 5e floor of 10, because absent means *the DM never gave one*. A
 * goblin somebody typed in by hand before the bestiary existed has no recorded value,
 * and printing 10 against its name would be inventing a statistic and presenting it as
 * the creature's. The sheet shows nothing there instead, which is the truth.
 */
export function passivePerceptionOf(sheet: CharacterSheet): number | null {
  return finiteOrNull(sheet.kind === 'npc' ? sheet.passivePerception : undefined)
}

/**
 * The only place the optional `attackBonus` is read. Null when absent, for the reason
 * above — a creature with no recorded bonus does not have one of +0.
 *
 * One number for the whole creature rather than one per attack; see the note on
 * `npcSheetValidator`.
 */
export function attackBonusOf(sheet: CharacterSheet): number | null {
  return finiteOrNull(sheet.kind === 'npc' ? sheet.attackBonus : undefined)
}

/** The only place the optional `saveDc` is read. Null on a creature that forces no saves. */
export function saveDcOf(sheet: CharacterSheet): number | null {
  return finiteOrNull(sheet.kind === 'npc' ? sheet.saveDc : undefined)
}

/**
 * The only place the optional `skills` map is read. `{}` when absent, because sparse is
 * the normal case — a creature is listed with the two or three things it is good at.
 *
 * ⚠️ **`skillProficienciesOf` is not a substitute and must not be reused here.** A
 * monster's skills are skill → *bonus*; a hero's are thirteen *booleans*, from which a
 * bonus is worked out with an ability score, a level and a proficiency bonus that a
 * reduced sheet does not have. The two answer the same question with incompatible data,
 * and a sheet renders them differently. Nothing converts between them, deliberately:
 * turning thirteen flags into bonuses needs the ability scores, and turning bonuses back
 * into flags throws the number away.
 */
export function creatureSkillsOf(sheet: CharacterSheet): CreatureSkills {
  return (sheet.kind === 'npc' ? sheet.skills : undefined) ?? {}
}

/**
 * The only place the optional `group` is read. **Absent means nobody was asked**, which
 * is every creature typed in before the field existed and every sheet `defaultNpcSheet`
 * builds — and unanswered reads as `'npc'`.
 *
 * ⚠️ **This is a display discriminator and not a security one, and that is what makes a
 * default safe here at all.** Both values are DM-only — a player is sent neither an `npc`
 * nor a `monster` row, because `maySeeCharacter` refused the whole document before
 * anybody asked which heading it went under — so a wrong answer misfiles a row and can
 * never publish one. Compare `isMonsterSheet` above, whose runtime default is fail-closed
 * because getting *that* wrong publishes a dragon. Do not merge the two questions, and do
 * not copy this function's tolerance across to that one.
 *
 * **`NpcSheet` rather than `CharacterSheet`**, which is the one place this accessor's
 * shape differs from the five beside it. A hero has no group and no field to put one in,
 * so a `CharacterSheet` signature would have to invent an answer for a kind the question
 * does not apply to; every caller has already narrowed. `groupOf` in lib/resolve.ts is
 * the backend's, from inside its `npc` arm, and the two creature forms are the browser's.
 *
 * A stored value outside the union reads as the default too, the stance `categoryOf` and
 * `speedOf` take and for the same reason: a schema push is not atomic, so a document
 * written by a newer deployment can be read by an older one, and in that window an
 * unrecognised heading must still land under one that exists.
 */
export function creatureGroupOf(sheet: NpcSheet): CreatureGroup {
  const stored = sheet.group
  if (stored !== undefined && (CREATURE_GROUPS as readonly string[]).includes(stored)) {
    return stored
  }
  return 'npc'
}

/**
 * Absent or nonsense reads as absent, so a `NaN` that reached a stored document cannot
 * be printed on a sheet or compared against. Shared by the three accessors above so
 * that "not a number" and "no number" are one answer, decided once — `speedOf` takes the
 * identical stance and reads its default for the identical reason.
 */
function finiteOrNull(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : value
}

// ---------------------------------------------------------------------------
// Defaults, and the one place the optional field is read
// ---------------------------------------------------------------------------

export function defaultPcSheet(): PcSheet {
  return {
    kind: 'pc',
    level: 1,
    className: '',
    // Ten across, so every modifier starts at zero and the DM is correcting a
    // sheet rather than filling in a blank form.
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    armourClass: 10,
    maxHp: 10,
    hitDice: { count: 1, faces: 8 },
    feats: [],
    spells: [],
  }
}

/**
 * `group` is deliberately **omitted** rather than defaulted to `'npc'` here.
 *
 * This is the second field-by-field rebuild of an `NpcSheet` and the question it has to
 * answer is not "which group" but "has anybody said". Writing `group: 'npc'` would make
 * every creature built from this default carry an answer nobody gave, which is
 * indistinguishable on the wire from a DM who chose NPC — and the dialogs that *do* ask
 * spread their answer over the top of this. Absent means unanswered, and `groupOf` reads
 * unanswered as `'npc'` in one place.
 */
export function defaultNpcSheet(): NpcSheet {
  return {
    kind: 'npc',
    armourClass: 12,
    maxHp: 10,
    initiativeBonus: 0,
    actions: [],
    notes: '',
  }
}

export function defaultSheetFor(kind: CharacterKind): CharacterSheet {
  return kind === 'npc' ? defaultNpcSheet() : defaultPcSheet()
}

/**
 * The only place the stored `sheet` field is read.
 *
 * It is optional in the schema because adding a required field to a table that
 * already has rows fails the schema push, and this game's `characters` table has
 * held rows since Milestone 1. Reading it through one accessor means the default
 * lives in exactly one place — the same treatment `games.status` gets through
 * `gameStatus`, for the same reason and with the same consequence: the fallback
 * only ever applies to a character created before this milestone.
 *
 * A sheet-less legacy character reads as a player character, which is what every
 * one of them is: NPCs could not be created before this milestone existed.
 */
// `characterSheet` and `characterKind` used to live here and are gone. Milestone 4
// moved the job to `resolveSheet` and `kindOf` in lib/resolve.ts, which handle the
// third stored shape this module cannot resolve on its own — a `preset` needs the
// library, and the library must never be imported from here or it reaches the
// browser.
//
// They are named rather than quietly deleted because they were the two most
// plausible names for the job, and the next person wanting "give me this character's
// sheet" will look for them here first. The answer is one file over.

// ---------------------------------------------------------------------------
// Derived numbers
// ---------------------------------------------------------------------------

/** The 5e modifier: floor((score - 10) / 2), so 8 is −1 and 20 is +5. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * +2 at level 1, rising by one every four levels.
 *
 * A `NaN` level reads as level 1 rather than propagating. This module exists to run
 * against values somebody has typed but not yet saved, and an emptied number input
 * is `NaN` — every comparison against which is false, so a plain clamp lets it
 * straight through and the sheet renders `NaN` in six saving-throw bonuses while the
 * player is halfway through retyping their level.
 *
 * The infinities are deliberately *not* caught here: `clamp` handles those
 * correctly, giving level 20 and level 1 respectively, and short-circuiting them to
 * a flat +2 would be a worse answer than the one the arithmetic already reaches.
 */
export function proficiencyBonus(level: number): number {
  if (Number.isNaN(level)) return 2
  return 2 + Math.floor((clamp(level, MIN_LEVEL, MAX_LEVEL) - 1) / 4)
}

export function savingThrowBonus(sheet: PcSheet, ability: AbilityKey): number {
  const base = abilityModifier(sheet.abilities[ability])
  return sheet.saveProficiencies[ability] ? base + proficiencyBonus(sheet.level) : base
}

/**
 * A player character rolls initiative on Dexterity; a monster rolls on the number
 * the DM typed, because the reduced sheet has no Dexterity to consult.
 */
export function initiativeBonusOf(sheet: CharacterSheet): number {
  return sheet.kind === 'pc' ? abilityModifier(sheet.abilities.dex) : sheet.initiativeBonus
}

export function maxHpOf(sheet: CharacterSheet): number {
  return sheet.maxHp
}

/** Every line on a sheet, whichever list it is in. For validation and for Milestone 6. */
export function sheetEntriesOf(sheet: CharacterSheet): SheetEntry[] {
  return sheet.kind === 'pc' ? [...sheet.feats, ...sheet.spells] : [...sheet.actions]
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

export const HEALTH_BANDS = ['healthy', 'bloodied', 'critical', 'down'] as const
export type HealthBand = (typeof HEALTH_BANDS)[number]

/** At or below half is bloodied; at or below a quarter is critical. */
export const BLOODIED_RATIO = 0.5
export const CRITICAL_RATIO = 0.25

/**
 * The four states a player is allowed to know an NPC is in.
 *
 * Four buckets rather than a percentage, and the coarseness is the point. A
 * percentage is not actually a summary: 82.2% of a plausible maximum hands `37/45`
 * straight back to anyone willing to try the small fractions, so a bar that
 * "estimates" to one decimal place has published the exact number requirements.md
 * says the DM keeps. Rounding to five-point steps narrows that but does not close
 * it. Four states leak about two bits and still tell the party the one thing they
 * need to decide whether to press the attack.
 *
 * A creature that is alive is never `down`, even at a hit point out of nine
 * hundred: `down` is the one band the party will act on immediately, so it has to
 * mean what it says rather than being where the arithmetic rounded to.
 */
export function healthBand(current: number, max: number): HealthBand {
  // Non-finite before the comparison, so a garbage-but-positive current does not
  // read as a corpse. Only reachable from corrupt data — `clampHp` would have
  // stored a zero — but the promise above is that a creature with hit points left
  // is never `down`, and a promise with an exception in it is not one.
  if (!Number.isFinite(current)) return current > 0 ? 'healthy' : 'down'
  if (current <= 0) return 'down'
  // A max of zero or a nonsense max cannot produce a ratio, and a creature with
  // hit points left is not down — so it reads as unhurt rather than as an error.
  if (!Number.isFinite(max) || max <= 0) return 'healthy'

  const ratio = current / max
  if (ratio > BLOODIED_RATIO) return 'healthy'
  if (ratio > CRITICAL_RATIO) return 'bloodied'
  return 'critical'
}

/**
 * Current hit points, normalised. The server applies this on every write, so no
 * client bug can store a character on 9,999 hit points or on −40.
 *
 * Rounding rather than refusing a fraction, because a fraction can only arrive from
 * a client bug rather than from anything anyone typed — the +/− controls send
 * whole numbers — and normalising is what the rest of this application does with a
 * value it can repair. `snapToGrid` takes the same stance for the same reason.
 */
export function clampHp(current: number, max: number): number {
  if (!Number.isFinite(current)) return 0
  const ceiling = Number.isFinite(max) && max > 0 ? Math.round(max) : 0
  return clamp(Math.round(current), 0, ceiling)
}

/**
 * Current hit points carried across a change of maximum, **preserving the fraction
 * rather than the number.**
 *
 * This is the edge a CR shift walks straight into, and it is not theoretical. `maxHp`
 * lives on the sheet and current hit points live in `characterVitals` (ADR 0005), so
 * scaling a creature mid-fight would otherwise leave current above the new ceiling —
 * a health bar drawn past the end of itself, and a band computed from a ratio greater
 * than one — or leave a creature scaled *up* reading `critical` at full health. A
 * creature on half its hit points comes out on half of the new maximum.
 *
 * The rules, and why each one is a rule rather than arithmetic:
 */
export function reconcileHp(current: number, oldMax: number, newMax: number): number {
  // A nonsense current value gets `clampHp`'s answer, which is 0. One rule for a
  // nonsense number, defined in one place, rather than a second opinion here.
  if (!Number.isFinite(current)) return clampHp(current, newMax)

  // No old maximum means no ratio exists, so there is nothing to preserve and the value
  // is simply re-clamped. `healthBand` takes the same stance on the same input for the
  // same reason.
  if (!Number.isFinite(oldMax) || oldMax <= 0) return clampHp(current, newMax)

  // **Before any floor.** A creature that is down stays down: adjusting the difficulty
  // of tonight's fight must not resurrect a corpse, and the floor below would put a
  // dead troll back on 1 hit point if this branch came after it.
  if (current <= 0) return 0

  // An untouched creature stays untouched, *exactly*. Taken as a special case rather
  // than left to the arithmetic because `Math.round` of a ratio that ought to be 1 is
  // not reliably the new maximum, and "it was on full and now it is one short" is a
  // thing a DM notices immediately.
  if (current >= oldMax) return clampHp(newMax, newMax)

  // The floor of 1 is load-bearing. Scaling a creature on 1 of 200 down to a maximum of
  // 20 gives a ratio that rounds to 0, and `healthBand` promises in writing that a
  // creature which is alive is never `down` — a promise with an exception in it is not
  // one, and `down` is the band the party acts on immediately.
  //
  // The accepted cost, stated so nobody has to rediscover it: at the other end, 199 of
  // 200 rounds up to the full new maximum, so a barely-hurt creature is over-healed by a
  // point. Capping a hurt creature at `newMax - 1` would fix that and break at
  // `newMax === 1`, where there is no value that is both alive and not full — and a
  // special case in a promise is not a promise. A point of free healing is the cheaper
  // wrong answer.
  //
  // The floor is applied *under* the ceiling rather than over it, so a `newMax` of zero
  // returns zero rather than a creature alive on 1 of 0. `MIN_MAX_HP` makes that
  // unreachable through a validated sheet, which is an argument for not needing the
  // ordering and not an argument for getting it the wrong way round.
  const ceiling = clampHp(newMax, newMax)
  return Math.min(ceiling, Math.max(1, clampHp(Math.round((current * newMax) / oldMax), newMax)))
}

/**
 * Hit dice left to spend, normalised the same way `clampHp` normalises hit points.
 *
 * It exists because the arithmetic was written out four times and the fourth had
 * already drifted — `writeSheet` capped at the sheet's complement but neither
 * floored at zero nor rounded, so a negative or fractional value was repaired by
 * three paths and preserved by the one that runs when somebody shortens their hit
 * dice. That is the ordinary way this kind of duplication fails: not all at once,
 * but in whichever copy was edited last.
 */
export function clampHitDice(remaining: number, count: number): number {
  if (!Number.isFinite(remaining)) return 0
  const ceiling = Number.isFinite(count) && count > 0 ? Math.round(count) : 0
  return clamp(Math.round(remaining), 0, ceiling)
}

/**
 * Exported for ./bestiary/scale.ts, which needs it as a *name* — its `Bound` strategy swaps
 * this against a no-op so the clamped and unclamped scalers cannot be two copies of the
 * arithmetic. Needing the name is not a reason to keep a second copy of the body, which is
 * what it had: three identical lines in a module that already takes fifteen other names
 * from this one.
 */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * `Math.round`, tolerating absence. The two override normalisers each declared a
 * byte-identical local copy of this, and both of their doc comments insist on rounding
 * **every** number — a promise a shared helper keeps mechanically and two local copies keep
 * for as long as somebody remembers to edit both.
 *
 * Absent stays absent rather than becoming zero: an override that says nothing about armour
 * class is not an override pinning it to 0, and `undefined` is not a Convex value, so the
 * key is dropped by `withoutUndefined` rather than written.
 */
function roundOrUndefined(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value)
}

// ---------------------------------------------------------------------------
// Normalisation and validation
// ---------------------------------------------------------------------------

/**
 * A problem with a sheet, or null. One function, run by the form to decide whether
 * Save is enabled and by the mutation to decide whether to throw — so the browser
 * never offers something the server is about to refuse, and the server never trusts
 * that it did not. `recoveryPhraseProblem` in lib/codes.ts is the same pattern.
 *
 * `path` names the field for a form that wants to mark one; a caller with a single
 * error line can ignore it and show the message.
 */
export type SheetProblem = { path: string; message: string }

/**
 * Does this problem belong to entry `index` of `list`?
 *
 * Exported so that no consumer has to take `path` apart itself, and that is not
 * tidiness — the obvious hand-written test is
 * `path.startsWith(`${list}[${index}]`)`, which is **wrong** in a way nothing
 * reveals until a sheet is long: `'feats[10].name'.startsWith('feats[1]')` is true,
 * so an error on the eleventh feat also lights up the second. With
 * `MAX_SHEET_ENTRIES` at 40, rows 1, 2 and 3 alias a third of the list between
 * them. It was written that way once already.
 *
 * The trailing separator is the whole fix, and it belongs here rather than in each
 * form, next to the code that builds the string.
 */
export function problemAtEntry(
  problem: SheetProblem | null,
  list: string,
  index: number,
): boolean {
  return problem !== null && problem.path.startsWith(`${list}[${index}].`)
}

/**
 * The message for one of these fields, or null — matching a nested path too, so
 * asking about `hitDice` also catches `hitDice.count`.
 *
 * Both sheet forms wrote their own version of this and the two had already
 * diverged: one matched nested paths and the other did not, so the first nested
 * field added to the NPC form would silently have shown no message at all.
 */
export function messageAtField(
  problem: SheetProblem | null,
  ...fields: string[]
): string | null {
  if (problem === null) return null
  const hit = fields.some(
    (field) => problem.path === field || problem.path.startsWith(`${field}.`),
  )
  return hit ? problem.message : null
}

/**
 * What is wrong with a roll, or null. The picker's custom-entry field and
 * `entriesProblem` both ask, so they cannot disagree about what a roll is or about
 * how to say so.
 */
export function rollProblem(roll: string): string | null {
  // ⚠️ **The grammar has a ceiling on the dice and none on the length.**
  // `ROLL_PATTERN`'s trailing `(?:[+-]…)*` repeats without limit, so `1d6+1+1+1…` a
  // thousand times over is a *valid* roll — and there are now two such fields on
  // every one of up to forty entries. Cheap to close, and closed here rather than in
  // the pattern because a regex that counted its own terms would stop being readable
  // for a rule nobody needs to see spelled that way.
  if (roll.length > MAX_ROLL_LENGTH) {
    return `Keep a roll to ${MAX_ROLL_LENGTH} characters or fewer.`
  }
  return isValidRoll(roll)
    ? null
    : `"${roll}" is not a roll. Try something like 1d8+WIS, 2d6 or 1d20+PROF.`
}

/**
 * A to-hit has to be a d20 roll, and the shared grammar does not say so.
 *
 * `rollProblem` accepts anything the roll grammar accepts, which is correct for a
 * damage expression and too permissive for this one: `2d6+STR` passes it happily, and
 * a to-hit of two d6 is not a to-hit. The field's own documentation has always said
 * `1d20+STR+PROF` or `1d20+4` — this is that contract enforced rather than merely
 * described, which is the difference this codebase keeps insisting on.
 *
 * Unreachable from generated content: `toHitFromBonus` only ever emits a `1d20`, and
 * both corpora are asserted to start with one. It is reachable by a DM typing into
 * the entry editor or an override diff, which is exactly who this catches.
 *
 * Exported for that last reason. The picker that *creates* entries has to be able to
 * ask the same question the server will, or it enables an Add button on a value the
 * save then refuses — and the whole point of a client-side check here is to spare
 * somebody a refusal, never to authorise anything.
 */
export function toHitProblem(toHit: string): string | null {
  const grammar = rollProblem(toHit)
  if (grammar) return grammar

  // Two ways to not be a d20 and one sentence for both, written once. The prefix has
  // to be there, and — because the grammar also allows a d100 — whatever follows it
  // has to be a sign or nothing at all, or `1d200` would pass on the prefix alone.
  const rest = toHit.startsWith(TO_HIT_PREFIX) ? toHit.slice(TO_HIT_PREFIX.length) : null
  if (rest === null || (rest !== '' && rest[0] !== '+' && rest[0] !== '-')) {
    return `A roll to hit is one d20 and its modifiers. Try something like ${TO_HIT_PREFIX}+STR+PROF.`
  }
  return null
}

/**
 * Trim, collapse and round a sheet into the form that gets stored.
 *
 * Run before `sheetProblem`, always, and by both sides. A name of `"  Fire  Bolt "`
 * is not a validation failure, it is a value that needs tidying — and tidying it in
 * one shared place is what stops the client's idea of "already valid" from drifting
 * away from the server's.
 *
 * Numbers are rounded rather than rejected for the reason given on `clampHp`: an
 * ability score of 13.5 arrives from a client bug, never from a form.
 */
export function normaliseSheet(sheet: CharacterSheet): CharacterSheet {
  if (sheet.kind === 'npc') {
    return {
      kind: 'npc',
      armourClass: Math.round(sheet.armourClass),
      maxHp: Math.round(sheet.maxHp),
      initiativeBonus: Math.round(sheet.initiativeBonus),
      actions: sheet.actions.map(normaliseEntry),
      notes: sheet.notes.trim(),
      // **The same trap, arriving a third time, and these five are why it is worth
      // naming.** See the note on the `pc` branch below: this function rebuilds a sheet
      // field by field rather than spreading it, which is what stops an unknown field
      // riding into the database — and the cost of that is that a field added to a
      // validator and not added here is silently discarded on every write, with the form
      // still showing the value it just binned. It has happened twice, to
      // `skillProficiencies` and to `speed`, and both times the local suite could not
      // have caught it because the value round-trips through a validator that permits it
      // to be absent.
      //
      // Conditional spreads rather than `field: undefined`: `undefined` is not a Convex
      // value, so naming a key and giving it that is a different write from omitting it.
      ...(sheet.speed === undefined ? {} : { speed: Math.round(sheet.speed) }),
      ...(sheet.passivePerception === undefined
        ? {}
        : { passivePerception: Math.round(sheet.passivePerception) }),
      ...(sheet.attackBonus === undefined ? {} : { attackBonus: Math.round(sheet.attackBonus) }),
      ...(sheet.saveDc === undefined ? {} : { saveDc: Math.round(sheet.saveDc) }),
      ...(sheet.skills === undefined ? {} : { skills: normaliseCreatureSkills(sheet.skills) }),
      // **Sixth, and the trap's fifth outing.** Same conditional spread as the five
      // above, for the same reason: absent has to stay absent, because `groupOf`'s
      // default is what files every creature typed in before this field existed.
      ...(sheet.group === undefined ? {} : { group: sheet.group }),
    }
  }

  return {
    kind: 'pc',
    level: Math.round(sheet.level),
    className: collapseWhitespace(sheet.className),
    abilities: mapAbilities(sheet.abilities, Math.round),
    saveProficiencies: { ...sheet.saveProficiencies },
    armourClass: Math.round(sheet.armourClass),
    maxHp: Math.round(sheet.maxHp),
    hitDice: { count: Math.round(sheet.hitDice.count), faces: sheet.hitDice.faces },
    feats: sheet.feats.map(normaliseEntry),
    spells: sheet.spells.map(normaliseEntry),
    // **Both of these were being dropped.** This function rebuilds the sheet field
    // by field rather than spreading it, which is deliberate — it is what stops an
    // unknown field riding into the database — but it means a field added to
    // `pcSheetValidator` and not added here is silently discarded on every write.
    // The premade-library milestone added both, and every hand-built character's skill
    // ticks went in the bin on Save while the form showed them ticked. `npm run
    // test:smoke` found it; nothing in the local suite could have, because the value
    // round-tripped through a validator that permits it to be absent.
    //
    // **It has since arrived a third time**, on the branch above: the bestiary gave the
    // NPC sheet five optional fields — `speed`, `passivePerception`, `attackBonus`,
    // `saveDc` and `skills` — and every one of them would have been dropped here in
    // exactly the same silence. Two occurrences is a coincidence; three is the shape of
    // this function, so it is written down in both branches rather than in one.
    //
    // Spread conditionally rather than written as `undefined`: `undefined` is not a
    // Convex value, so naming the key and giving it that is a different write from
    // omitting the key.
    ...(sheet.skillProficiencies === undefined
      ? {}
      : { skillProficiencies: { ...sheet.skillProficiencies } }),
    ...(sheet.speed === undefined ? {} : { speed: Math.round(sheet.speed) }),
  }
}

function normaliseEntry(entry: SheetEntry): SheetEntry {
  const roll = entry.roll === null ? null : normaliseRoll(entry.roll)
  // Through `normaliseRoll` for the reason `roll` is: a hand-typed `1d20 + str` and a
  // picked `1d20+STR` must end up byte-identical rather than merely equivalent. It
  // cannot throw, so it is safe on every keystroke in the editor.
  const toHit = entry.toHit === undefined ? undefined : normaliseRoll(entry.toHit)
  return {
    id: entry.id.trim(),
    name: collapseWhitespace(entry.name),
    // Trimmed but not collapsed: an entry's description is a paragraph, and
    // flattening its line breaks would turn a two-part spell into one run-on.
    text: entry.text.trim(),
    roll: roll === '' ? null : roll,
    level: entry.level === null ? null : Math.round(entry.level),
    catalogueKey: entry.catalogueKey === null ? null : entry.catalogueKey.trim() || null,
    // ⚠️ **THE FOURTH TIME, AND THE FIRST ON THIS FUNCTION.** `normaliseSheet` above
    // carries the note twice over: a field added to a validator and not added to the
    // rebuild is silently discarded on every write, with the form still showing the
    // value it just binned, and only `npm run test:smoke` has ever caught it. These
    // two are the largest exposure that trap has had, because this entry shape is
    // shared across a hero's feats, a hero's spells, a monster's actions and both
    // override diffs — six array positions, all fixed by this one function.
    //
    // Conditional spreads rather than `field: undefined`: `undefined` is not a Convex
    // value, so naming a key and giving it that is a different write from omitting
    // it. `withoutUndefined` is the repair for a shape built by *spreading* and this
    // one is not — the distinction `normaliseCreatureSkills` already draws.
    //
    // The category is deliberately **not materialised** for an entry that has none.
    // Absent stays a legal state for as long as the schema says the field is
    // optional, and a normaliser that filled it in would leave `categoryOf`'s default
    // reachable only by documents nobody has saved — which is how a default becomes
    // untested code that nobody notices is wrong.
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(toHit === undefined || toHit === '' ? {} : { toHit }),
  }
}

/**
 * Round every bonus that is present and drop every key that is not.
 *
 * Driven by `CREATURE_SKILL_KEYS` rather than by the object's own keys, which is the
 * field-by-field rebuild this function's callers rely on: a fourteenth skill that somehow
 * reached a draft is not copied through, it simply is not read.
 *
 * The absent keys are **never created**, rather than written as `undefined` and deleted
 * again on the way out. `undefined` is not a Convex value — an object naming `stealth` and
 * giving it that is a different write from one that omits `stealth`, and only the second is
 * what "this creature is not sneaky" means — so a key that is never assigned cannot be a
 * key somebody later forgets to remove. `withoutUndefined` is the repair for a shape built
 * by spreading, which this one is not.
 */
function normaliseCreatureSkills(skills: CreatureSkills): CreatureSkills {
  const out: CreatureSkills = {}
  for (const key of CREATURE_SKILL_KEYS) {
    const bonus = skills[key]
    if (bonus !== undefined) out[key] = Math.round(bonus)
  }
  return out
}

function mapAbilities(scores: AbilityScores, fn: (value: number) => number): AbilityScores {
  return {
    str: fn(scores.str),
    dex: fn(scores.dex),
    con: fn(scores.con),
    int: fn(scores.int),
    wis: fn(scores.wis),
    cha: fn(scores.cha),
  }
}

/**
 * The first thing wrong with a normalised sheet, or null.
 *
 * Every bound in this file is checked here, because this is the function the
 * mutation calls — a limit declared as a constant and enforced nowhere is a comment.
 * Returns the first problem rather than all of them: the form marks one field at a
 * time, and a mutation only needs something to throw.
 */
export function sheetProblem(sheet: CharacterSheet): SheetProblem | null {
  if (!isWholeWithin(sheet.armourClass, MIN_ARMOUR_CLASS, MAX_ARMOUR_CLASS)) {
    return {
      path: 'armourClass',
      message: `Armour class has to be a whole number from ${MIN_ARMOUR_CLASS} to ${MAX_ARMOUR_CLASS}.`,
    }
  }
  if (!isWholeWithin(sheet.maxHp, MIN_MAX_HP, MAX_MAX_HP)) {
    return {
      path: 'maxHp',
      message: `Maximum hit points have to be a whole number from ${MIN_MAX_HP} to ${MAX_MAX_HP}.`,
    }
  }
  // ⚠️ **Checked once for both variants, above the branch.** `speed` is optional on the
  // hero's sheet and on the monster's, means feet on both, and is read through one
  // `speedOf` that narrows neither — so a bound in each branch was the same rule and the
  // same message string written twice, which is one place for the next edit to reach only
  // one of them. It is the field that shipped with no bound at all, so the duplication
  // was a repair applied twice rather than a rule stated twice on purpose.
  const speed = boundProblem(
    sheet.speed,
    'speed',
    MIN_SPEED,
    MAX_SPEED,
    `Speed has to be a whole number of feet from ${MIN_SPEED} to ${MAX_SPEED}.`,
  )
  if (speed) return speed

  if (sheet.kind === 'npc') {
    if (!isWholeWithin(sheet.initiativeBonus, -MAX_INITIATIVE_BONUS, MAX_INITIATIVE_BONUS)) {
      return {
        path: 'initiativeBonus',
        message: `The initiative bonus has to be a whole number from −${MAX_INITIATIVE_BONUS} to ${MAX_INITIATIVE_BONUS}.`,
      }
    }
    // ⚠️ **A bound for every one of the five, now rather than later, and the reason is
    // on the record.** `speed` — checked above, since it is not a monster's alone —
    // shipped as the only numeric field on a sheet with no range check at all: `NaN` and
    // `Infinity` both stored cleanly and went out on the wire, `speedOf` quietly repaired
    // them on read, and so nobody noticed until `npm run test:smoke` did, because
    // convex-test does not apply Convex's own value validation and a real deployment
    // does. These arrive the same way, from a stepper, a scaler and a DM's override
    // panel, and any of them can produce a non-finite float64. A constant declared and
    // enforced nowhere is a comment.
    const bounds =
      boundProblem(
        sheet.passivePerception,
        'passivePerception',
        MIN_PASSIVE_PERCEPTION,
        MAX_PASSIVE_PERCEPTION,
        `Passive perception has to be a whole number from ${MIN_PASSIVE_PERCEPTION} to ${MAX_PASSIVE_PERCEPTION}.`,
      ) ??
      boundProblem(
        sheet.attackBonus,
        'attackBonus',
        MIN_ATTACK_BONUS,
        MAX_ATTACK_BONUS,
        `The attack bonus has to be a whole number from ${MIN_ATTACK_BONUS} to ${MAX_ATTACK_BONUS}.`,
      ) ??
      boundProblem(
        sheet.saveDc,
        'saveDc',
        MIN_SAVE_DC,
        MAX_SAVE_DC,
        `A save DC has to be a whole number from ${MIN_SAVE_DC} to ${MAX_SAVE_DC}.`,
      ) ??
      creatureSkillsProblem(sheet.skills)
    if (bounds) return bounds

    if (sheet.notes.length > MAX_NPC_NOTES_LENGTH) {
      return {
        path: 'notes',
        message: `Keep the notes to ${MAX_NPC_NOTES_LENGTH} characters or fewer.`,
      }
    }
    return textProblem(sheet.notes, 'notes') ?? entriesProblem(sheet.actions, 'actions', new Set())
  }

  if (!isWholeWithin(sheet.level, MIN_LEVEL, MAX_LEVEL)) {
    return {
      path: 'level',
      message: `Level has to be a whole number from ${MIN_LEVEL} to ${MAX_LEVEL}.`,
    }
  }
  if (sheet.className.length > MAX_CLASS_NAME_LENGTH) {
    return {
      path: 'className',
      message: `Keep the class to ${MAX_CLASS_NAME_LENGTH} characters or fewer.`,
    }
  }
  const className = textProblem(sheet.className, 'className')
  if (className) return className

  for (const ability of ABILITY_KEYS) {
    if (!isWholeWithin(sheet.abilities[ability], MIN_ABILITY_SCORE, MAX_ABILITY_SCORE)) {
      return {
        path: `abilities.${ability}`,
        message: `${ABILITY_NAMES[ability]} has to be a whole number from ${MIN_ABILITY_SCORE} to ${MAX_ABILITY_SCORE}.`,
      }
    }
  }
  if (!isWholeWithin(sheet.hitDice.count, 1, MAX_HIT_DICE_COUNT)) {
    return {
      path: 'hitDice.count',
      message: `Hit dice have to be a whole number from 1 to ${MAX_HIT_DICE_COUNT}.`,
    }
  }
  // Unreachable through a mutation, and kept anyway. The faces are a literal union
  // in `hitDiceValidator`, and Convex's *argument* validation rejects a d7 at the
  // function boundary before any of this runs — which the suite demonstrates, since
  // the refusal that arrives is a bare `Validator error` rather than the wording
  // below.
  //
  // It stays because this function's other caller is the sheet editor, running
  // against a draft nobody has saved, where the value is whatever a control
  // produced. It is also the only version of the check that says something a person
  // can read. Worth being exact about the gap it does *not* fill: convex-test does
  // not apply value validation to *stored documents*, which is what `npm run
  // test:smoke` is for, but it does apply argument validators.
  if (!(HIT_DIE_FACES as readonly number[]).includes(sheet.hitDice.faces)) {
    return { path: 'hitDice.faces', message: 'A hit die has to be a d6, d8, d10 or d12.' }
  }

  // One `seen` set across both lists, not one per list. `sheetEntriesOf` merges
  // feats and spells into a single array — which is a React key set, and is what
  // Milestone 6 will aim a roll at — so an id checked only within its own list is
  // an id that can still collide in the merged one. Checking per list would have
  // enforced exactly the half of the guarantee that does not matter.
  const seen = new Set<string>()
  return (
    entriesProblem(sheet.feats, 'feats', seen) ?? entriesProblem(sheet.spells, 'spells', seen)
  )
}

/**
 * One optional bounded number, checked. **Absent is not a problem**, which is what
 * optional means on every field this is asked about: a creature with no recorded save DC
 * has not got one out of range.
 *
 * Five fields wanted the identical three lines of `if (x !== undefined && !isWholeWithin(…))
 * return { path, message }`, and a rule written out five times is five places for the sixth
 * field to be added to four of them. Only the shared *shape* moves in here — the message
 * stays at the call site, because each field names itself in its own words and those words
 * are what a form prints beside it.
 */
function boundProblem(
  value: number | undefined,
  path: string,
  low: number,
  high: number,
  message: string,
): SheetProblem | null {
  if (value === undefined || isWholeWithin(value, low, high)) return null
  return { path, message }
}

/**
 * The first out-of-range skill bonus on a creature, or null.
 *
 * Driven by `CREATURE_SKILL_KEYS` rather than by the object's own keys, so the check cannot
 * be skipped by a bonus arriving under a key this module does not know about.
 */
function creatureSkillsProblem(skills: CreatureSkills | undefined): SheetProblem | null {
  if (skills === undefined) return null
  for (const key of CREATURE_SKILL_KEYS) {
    const problem = boundProblem(
      skills[key],
      `skills.${key}`,
      -MAX_SKILL_BONUS,
      MAX_SKILL_BONUS,
      `A skill bonus has to be a whole number from −${MAX_SKILL_BONUS} to ${MAX_SKILL_BONUS}.`,
    )
    if (problem) return problem
  }
  return null
}

function entriesProblem(
  entries: SheetEntry[],
  list: string,
  seen: Set<string>,
): SheetProblem | null {
  if (entries.length > MAX_SHEET_ENTRIES) {
    return { path: list, message: `A character can hold ${MAX_SHEET_ENTRIES} of those at most.` }
  }

  for (const [index, entry] of entries.entries()) {
    const path = `${list}[${index}]`

    // The id is a React key and Milestone 6's roll target. A duplicate would make
    // rolling one entry roll another, and an empty one would make the list
    // unaddressable — neither is something a user can see to fix, so it is checked
    // rather than trusted.
    if (!entry.id || entry.id.length > MAX_ENTRY_ID_LENGTH) {
      return { path: `${path}.id`, message: 'That entry is missing a usable id.' }
    }
    if (seen.has(entry.id)) {
      return { path: `${path}.id`, message: 'Two entries on this sheet share an id.' }
    }
    seen.add(entry.id)

    if (!entry.name) {
      return { path: `${path}.name`, message: 'Give every entry a name.' }
    }
    if (entry.name.length > MAX_ENTRY_NAME_LENGTH) {
      return {
        path: `${path}.name`,
        message: `Keep an entry name to ${MAX_ENTRY_NAME_LENGTH} characters or fewer.`,
      }
    }
    if (entry.text.length > MAX_ENTRY_TEXT_LENGTH) {
      return {
        path: `${path}.text`,
        message: `Keep a description to ${MAX_ENTRY_TEXT_LENGTH} characters or fewer.`,
      }
    }
    // Every free-text field on an entry, not just the name — see `textProblem` for
    // why this is worth checking even though the server would refuse it anyway.
    const text =
      textProblem(entry.id, `${path}.id`) ??
      textProblem(entry.name, `${path}.name`) ??
      textProblem(entry.text, `${path}.text`) ??
      (entry.catalogueKey === null
        ? null
        : textProblem(entry.catalogueKey, `${path}.catalogueKey`))
    if (text) return text
    if (entry.roll !== null) {
      const roll = rollProblem(entry.roll)
      if (roll) return { path: `${path}.roll`, message: roll }
    }
    // ⚠️ **An empty box is a missing value, not a malformed one**, and the form is the
    // reason that distinction earns a line. `normaliseEntry` drops an empty to-hit
    // before any mutation sees one, so this is unreachable from a write — but
    // `sheetProblem` also drives the editor as somebody types, and a weapon whose
    // to-hit field is simply blank should be told *"a weapon needs a roll to hit
    // with"* rather than *`"" is not a roll`*. Reading it as absent hands the sentence
    // to the arity rule below, which is the one that knows what is wanted.
    const toHit = entry.toHit === '' ? undefined : entry.toHit

    // The grammar first, so a malformed to-hit gets the sentence saying what is wrong
    // with it rather than the one about which category may carry one.
    if (toHit !== undefined) {
      const problem = toHitProblem(toHit)
      if (problem) return { path: `${path}.toHit`, message: problem }
    }

    // ⚠️ **The arity rule — the definition of the discriminator, not a cap.**
    //
    // A cap belongs to the content that it describes: `MAX_SHEET_ENTRIES` stays here
    // at forty while "at most three attacks" lives in the bestiary's own test, because
    // three is a rule about what makes a *library entry* fast to run at the table and
    // a DM hand-building a boss with five legendary actions is not doing anything
    // wrong. This is not that. A passive carrying a roll is a value the roll path will
    // never read, and a weapon with no to-hit is a category lying about its shape to
    // the one function that switches on it. The nearest precedent is
    // `storedSheetProblem` refusing an archetype below level 2: two stored fields that
    // contradict each other make a document nothing can render.
    //
    // **Every entry written before this milestone satisfies all four**, because
    // `categoryOf`'s derived default is this rule restated — a legacy entry with no
    // roll reads as a passive and has none, one with a roll reads as an action and has
    // one, and neither has ever had a to-hit. That is why the default is derived, and
    // it is what makes adding these checks safe against a table that already has rows.
    const shape = rollShapeOf(categoryOf(entry))
    if (shape.toHit && toHit === undefined) {
      return {
        path: `${path}.toHit`,
        message: 'A weapon needs a roll to hit with. Try something like 1d20+STR+PROF.',
      }
    }
    if (!shape.toHit && toHit !== undefined) {
      return {
        path: `${path}.toHit`,
        message: 'Only a weapon rolls to hit. Make it a weapon, or clear the to-hit roll.',
      }
    }
    if (shape.roll && entry.roll === null) {
      return {
        path: `${path}.roll`,
        message: 'A weapon and an action both roll something. Give it a roll, or make it a passive.',
      }
    }
    if (!shape.roll && entry.roll !== null) {
      return {
        path: `${path}.roll`,
        message: 'A passive is declared rather than rolled. Clear the roll, or make it an action.',
      }
    }
    if (
      entry.level !== null &&
      !isWholeWithin(entry.level, MIN_SPELL_LEVEL, MAX_SPELL_LEVEL)
    ) {
      return {
        path: `${path}.level`,
        message: `A spell level has to be a whole number from ${MIN_SPELL_LEVEL} to ${MAX_SPELL_LEVEL}.`,
      }
    }
    if (entry.catalogueKey !== null && entry.catalogueKey.length > MAX_ENTRY_ID_LENGTH) {
      return { path: `${path}.catalogueKey`, message: 'That catalogue key is not one of ours.' }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// The stored shapes, which include the one this module cannot resolve
// ---------------------------------------------------------------------------

/**
 * Tidy a stored sheet, whichever of the four it is.
 *
 * A `preset` normalises to its selections and nothing else — there is no maximum to
 * round or spell list to trim, because it holds none. A `bestiary` sheet is the same:
 * a key, a rating and an override diff. What either *resolves* to is validated
 * separately by the caller, which is the only place that can, since resolution needs a
 * corpus and this module deliberately never imports one.
 *
 * Switched on the kind rather than written as `!== 'preset'`, which is what it used to
 * be: that test read "one selection shape and everything else", and the moment there
 * were two selection shapes it silently handed a `bestiary` sheet to `normaliseSheet`.
 */
export function normaliseStoredSheet(sheet: StoredSheet): StoredSheet {
  if (sheet.kind === 'pc' || sheet.kind === 'npc') return normaliseSheet(sheet)

  if (sheet.kind === 'bestiary') {
    return {
      kind: 'bestiary',
      entryKey: sheet.entryKey.trim(),
      // ⚠️ **Not rounded.** `Math.round(0.125)` is 0 and `Math.round(0.5)` is 1, so
      // rounding here would collapse three of the ten ratings on every write — a CR ⅛
      // stirge becoming CR 0 and a CR ½ hobgoblin becoming CR 1, silently, on a save the
      // DM did not think changed anything. See the warning on `CR_VALUES` in
      // lib/creatures.ts, which exists because the doc comment on
      // `normaliseCreatureOverrides` below insists on rounding *every* number and is
      // right about every number except this one. A rating is a selection, so it is
      // checked for membership by `crIndex` and refused, never repaired.
      cr: sheet.cr,
      ...(sheet.overrides === undefined
        ? {}
        : { overrides: normaliseCreatureOverrides(sheet.overrides) }),
    }
  }

  return {
    kind: 'preset',
    race: sheet.race,
    classKey: sheet.classKey,
    subclassKey: sheet.subclassKey,
    // ⚠️ **Named here because this is a field-by-field rebuild**, which is the trap the
    // note on `withOverrides` records this codebase falling into twice: a field added to
    // a validator, one of two rebuilds updated, and `skillProficiencies` then `speed`
    // silently dropped on every save. A lineage omitted here would be a Wood Elf who
    // reverts to 30 feet the next time anybody presses Save.
    //
    // Spread rather than assigned, so an absent key stays absent: `undefined` is not a
    // Convex value, and naming the field while handing it `undefined` is a different
    // write from omitting it. Null is a real stored value and passes through as one.
    ...(sheet.lineageKey === undefined ? {} : { lineageKey: sheet.lineageKey }),
    level: Math.round(sheet.level),
    // **The override's entries get the same tidying as any other entry**, which they
    // were not getting. `storedSheetProblem` runs `entriesProblem` over them, so they
    // were being *validated* as though they had been normalised while being stored
    // raw: a roll typed the way a person types it, `2d6 + wis`, was refused inside an
    // override while the identical string in a feat list was accepted, and an id
    // stored as `" dm-2 "` sat on the sheet looking exactly like `"dm-2"` while being
    // a different React key and a different roll target.
    ...(sheet.overrides === undefined ? {} : { overrides: normaliseOverrides(sheet.overrides) }),
    locked: sheet.locked,
  }
}

/**
 * Lay the DM's overrides over a sheet. The last stage of resolution, **and it lives
 * here rather than in lib/resolve.ts so that the browser can run the same one.**
 *
 * The override panel has to show every derived number moving as the DM types, which
 * means applying overrides client-side — and the browser cannot call `resolveSheet`,
 * because that reaches into `lib/library/` and 72 stat blocks must not enter the
 * bundle. The obvious conclusion, which was drawn once, is that the browser needs its
 * own copy of this merge. It does not: overrides land on an already-resolved sheet,
 * and this function touches nothing but `PcSheet` and `PresetOverrides`, both of
 * which are already shared. Only the *library lookup* is server-only, not the last
 * third of the pipeline.
 *
 * The copy was real and so was its cost. This codebase has twice shipped a bug where
 * a field was added to a validator and one of two field-by-field rebuilds was not
 * updated — `skillProficiencies` and `speed`, silently dropped on every save. A
 * second merge maintained by hand is the same trap with a subtler symptom: a preview
 * that disagrees with the server for exactly one field.
 *
 * Entries are **appended** rather than replaced, so a plot item the DM handed out
 * survives the next level's library lookup instead of being overwritten by it.
 */
export function withOverrides(sheet: PcSheet, overrides: PresetOverrides | undefined): PcSheet {
  if (!overrides) return sheet

  return {
    ...sheet,
    abilities: overrides.abilities ? { ...overrides.abilities } : sheet.abilities,
    saveProficiencies: overrides.saveProficiencies
      ? { ...overrides.saveProficiencies }
      : sheet.saveProficiencies,
    skillProficiencies: overrides.skillProficiencies
      ? { ...overrides.skillProficiencies }
      : sheet.skillProficiencies,
    armourClass: overrides.armourClass ?? sheet.armourClass,
    maxHp: overrides.maxHp ?? sheet.maxHp,
    hitDice: overrides.hitDice ? { ...overrides.hitDice } : sheet.hitDice,
    speed: overrides.speed ?? sheet.speed,
    feats: [...sheet.feats, ...(overrides.extraFeats ?? [])],
    spells: [...sheet.spells, ...(overrides.extraSpells ?? [])],
  }
}

/**
 * The same for a creature: the DM's overrides laid over a resolved and scaled `NpcSheet`.
 * The last of the three layers — bestiary entry, then the CR scale, then this.
 *
 * **It lives here rather than in lib/resolve.ts for the identical reason `withOverrides`
 * does**, and the reasoning is worth repeating because a creature has more moving parts
 * than a hero and so the temptation is stronger. The CR stepper and the override panel
 * both have to show every derived number moving as the DM types, which means applying
 * the merge client-side; and the browser cannot import lib/resolve.ts, because that
 * reaches into the corpora and neither 72 stat blocks nor ~130 more may enter the bundle.
 * The obvious conclusion is that the browser needs its own copy of this merge. It does
 * not. Only the **corpus lookup and the scale** are server-only — an override lands on an
 * already-finished `NpcSheet`, and the last third of the pipeline touches nothing but
 * types that are already shared.
 *
 * ⚠️ **Every field of `bestiaryOverridesValidator` has to appear below.** A field added
 * to the validator and not added here is silently ignored, and this failure is *unusually*
 * quiet: because the same function runs on both sides, the preview the DM is looking at
 * will agree with the server exactly. Nobody would notice from the screen. The two
 * previous instances of this trap — `skillProficiencies` and `speed` dropped by
 * `normaliseSheet` — at least disagreed with the form.
 *
 * Actions are **appended** rather than replaced, so a legendary action the DM wrote for
 * tonight survives the next CR shift instead of being overwritten by the entry's own list.
 */
export function withCreatureOverrides(
  sheet: NpcSheet,
  overrides: BestiaryOverrides | undefined,
): NpcSheet {
  if (!overrides) return sheet

  // Through `withoutUndefined`, because four of these fields are optional on both sides:
  // `attackBonus: undefined` when neither the entry nor the DM gave one would name the key
  // and hand it a value Convex does not have, which is a different document from one that
  // omits the key.
  return withoutUndefined({
    ...sheet,
    armourClass: overrides.armourClass ?? sheet.armourClass,
    maxHp: overrides.maxHp ?? sheet.maxHp,
    initiativeBonus: overrides.initiativeBonus ?? sheet.initiativeBonus,
    attackBonus: overrides.attackBonus ?? sheet.attackBonus,
    saveDc: overrides.saveDc ?? sheet.saveDc,
    passivePerception: overrides.passivePerception ?? sheet.passivePerception,
    speed: overrides.speed ?? sheet.speed,
    notes: overrides.notes ?? sheet.notes,
    // Replaced wholesale rather than merged key by key, matching what
    // `skillProficiencies` does one function up. A merge would make "this creature is no
    // longer sneaky" inexpressible: there would be no way to say *remove*, only to say a
    // different number.
    skills: overrides.skills ? { ...overrides.skills } : sheet.skills,
    actions: [...sheet.actions, ...(overrides.extraActions ?? [])],
  })
}

/**
 * Drop the keys whose value is `undefined`.
 *
 * `undefined` is not a Convex value, so an object naming a field and giving it that
 * is a different write from one omitting the field — which is why this rule appears
 * everywhere a shape is built optionally. It was being spelled four different ways
 * across eight sites (conditional spread, destructure-and-rest, a `delete` in a
 * loop, a `delete` of a named key), each with its own paragraph re-explaining the
 * same thing. One helper, one explanation, and the call sites go back to being
 * ordinary object literals.
 */
export function withoutUndefined<T extends object>(value: T): T {
  const out = { ...value }
  for (const key of Object.keys(out) as (keyof T)[]) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

/**
 * The DM's overrides, tidied the same way the corresponding fields on a sheet are.
 *
 * **Every number, not just the ones that seemed to need it.** An earlier version
 * rounded `speed` alone, which made a fractional armour class *refused* inside an
 * override while the identical value on a hand-built sheet was rounded and accepted
 * — the resolved sheet goes through `sheetProblem`, and `isWholeWithin` does not
 * forgive a fraction that nothing rounded first. Two rules for one kind of value,
 * decided by which field it happened to be.
 */
function normaliseOverrides(overrides: PresetOverrides): PresetOverrides {
  return withoutUndefined({
    ...overrides,
    armourClass: roundOrUndefined(overrides.armourClass),
    maxHp: roundOrUndefined(overrides.maxHp),
    speed: roundOrUndefined(overrides.speed),
    abilities: overrides.abilities && mapAbilities(overrides.abilities, Math.round),
    hitDice: overrides.hitDice && {
      ...overrides.hitDice,
      count: Math.round(overrides.hitDice.count),
    },
    extraFeats: overrides.extraFeats?.map(normaliseEntry),
    extraSpells: overrides.extraSpells?.map(normaliseEntry),
  })
}

/**
 * The same for a creature's overrides, built the same way and for the same reason.
 *
 * **Every number, and the entries through `normaliseEntry`.** An override is a place a
 * fractional armour class or an untidy roll spec enters exactly as easily as a hand-built
 * sheet is, and the resolved creature goes through `sheetProblem`, where `isWholeWithin`
 * does not forgive a fraction that nothing rounded first. Rounding some fields and not
 * others is two rules for one kind of value, decided by which field it happened to be —
 * which is the bug the note above records.
 *
 * `notes` is trimmed rather than whitespace-collapsed, matching what `normaliseSheet`
 * does with a monster's notes: it is a couple of sentences, and flattening its line
 * breaks would run them together.
 */
function normaliseCreatureOverrides(overrides: BestiaryOverrides): BestiaryOverrides {
  return withoutUndefined({
    ...overrides,
    armourClass: roundOrUndefined(overrides.armourClass),
    maxHp: roundOrUndefined(overrides.maxHp),
    initiativeBonus: roundOrUndefined(overrides.initiativeBonus),
    attackBonus: roundOrUndefined(overrides.attackBonus),
    saveDc: roundOrUndefined(overrides.saveDc),
    passivePerception: roundOrUndefined(overrides.passivePerception),
    speed: roundOrUndefined(overrides.speed),
    notes: overrides.notes?.trim(),
    skills: overrides.skills && normaliseCreatureSkills(overrides.skills),
    extraActions: overrides.extraActions?.map(normaliseEntry),
  })
}

/**
 * The first thing wrong with a stored sheet's own fields, or null.
 *
 * For a `preset` this checks the **selections** — a level in range, an archetype
 * that belongs to the chosen class, an archetype not chosen before level 2. It
 * cannot check the numbers, because a preset has none until it is resolved; the
 * caller runs `sheetProblem` over the resolved sheet as well, which is what catches
 * a library entry or an override that lands out of bounds. A `bestiary` sheet is the
 * same arrangement with two selections instead of four.
 *
 * Refusing an unknown archetype on **write** while `librarySheet` tolerates one on
 * **read** is deliberate rather than inconsistent: a character that already chose a
 * since-retired archetype must stay readable, and nobody should be able to choose
 * one now.
 */
export function storedSheetProblem(sheet: StoredSheet): SheetProblem | null {
  if (sheet.kind === 'pc' || sheet.kind === 'npc') return sheetProblem(sheet)

  if (sheet.kind === 'bestiary') {
    if (!sheet.entryKey || sheet.entryKey.length > MAX_ENTRY_ID_LENGTH) {
      return { path: 'entryKey', message: 'That creature is not one of ours.' }
    }
    const entryKey = textProblem(sheet.entryKey, 'entryKey')
    if (entryKey) return entryKey

    // **Set membership, not a range.** `isWholeWithin` would be wrong twice over: it
    // rejects CR ⅛, ¼ and ½ for not being whole, and it accepts CR 1.5, which has no
    // benchmark row for the scaler to aim at. There are exactly ten ratings and `crIndex`
    // is the question "is this one of them?".
    if (crIndex(sheet.cr) < 0) {
      return { path: 'cr', message: 'That is not a challenge rating this bestiary covers.' }
    }

    // What this **cannot** check is that `entryKey` names a creature that exists, because
    // this module may never import lib/bestiary/ — the corpus must not reach the browser,
    // and every function in this file runs in it. That check belongs to
    // `requireUsableSheet` in convex/characters.ts, which is already the place that
    // resolves a selection sheet and puts the result through `sheetProblem`.
    const overrides = sheet.overrides
    if (overrides) {
      if (overrides.notes !== undefined && overrides.notes.length > MAX_NPC_NOTES_LENGTH) {
        return {
          path: 'overrides.notes',
          message: `Keep the notes to ${MAX_NPC_NOTES_LENGTH} characters or fewer.`,
        }
      }
      // The DM's extra actions are ordinary sheet entries and get the ordinary checks.
      // Its own `seen` set, because these are the only entries on the document — the
      // entry's own actions come from the corpus and are checked against the resolved
      // sheet, where the merged list is what has to have unique ids.
      return entriesProblem(overrides.extraActions ?? [], 'overrides.extraActions', new Set())
    }
    return null
  }

  if (!isWholeWithin(sheet.level, MIN_LEVEL, MAX_LEVEL)) {
    return {
      path: 'level',
      message: `Level has to be a whole number from ${MIN_LEVEL} to ${MAX_LEVEL}.`,
    }
  }
  if (sheet.subclassKey !== null) {
    if (sheet.level < SUBCLASS_LEVEL) {
      return {
        path: 'subclassKey',
        message: `An archetype is chosen at level ${SUBCLASS_LEVEL}, not before.`,
      }
    }
    if (!subclassOf(sheet.classKey, sheet.subclassKey)) {
      return { path: 'subclassKey', message: 'That is not an archetype of that class.' }
    }
  }

  // The DM's extra entries are ordinary sheet entries and get the ordinary checks —
  // an override is a place a bad roll spec can enter just as easily as a feat list.
  const overrides = sheet.overrides
  if (overrides) {
    const seen = new Set<string>()
    return (
      entriesProblem(overrides.extraFeats ?? [], 'overrides.extraFeats', seen) ??
      entriesProblem(overrides.extraSpells ?? [], 'overrides.extraSpells', seen)
    )
  }
  return null
}

/**
 * Finite, whole, and inside the range. `Number.isInteger` already rejects NaN and
 * both infinities, which is the case that actually matters: an empty number input
 * yields NaN, and NaN is a perfectly valid Convex float64 that would otherwise be
 * stored and poison every comparison made against it afterwards.
 */
function isWholeWithin(value: number, low: number, high: number): boolean {
  return Number.isInteger(value) && value >= low && value <= high
}

/**
 * The string half of the same job, for every free-text field on a sheet.
 *
 * **This one earns its place in the browser, not on the server.** Convex's argument
 * validation refuses a malformed string at the function boundary before any handler
 * runs, so the mutation would reject it regardless and this branch is unreachable
 * from that direction — `npm run test:smoke` shows the refusal arriving as a bare
 * `Invalid arguments provided` with a request id in it. But `sheetProblem` is also
 * what the sheet editor runs against a draft to decide whether Save is enabled, and
 * there the difference is between a sentence and a round trip that fails opaquely.
 *
 * A lone surrogate reaches a sheet the same way it reached Milestone 1's display
 * names: something cut a string to length with `slice`, which counts UTF-16 code
 * units and will happily halve an emoji. `truncateCodePoints` in lib/codes.ts is
 * the fix for that at the point of creation; this is the net underneath it.
 */
function textProblem(value: string, path: string): SheetProblem | null {
  return hasLoneSurrogate(value)
    ? { path, message: 'That text contains a half-finished character. Retype it and try again.' }
    : null
}
