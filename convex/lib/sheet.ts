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
import { raceKeyValidator } from './races'
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
 * Milestone 3 validates the shape and Milestone 5 evaluates it, and that split is
 * deliberate rather than half a feature. A roll string stored unvalidated today is
 * a migration over every sheet in every game the moment something tries to parse
 * one — so the grammar is fixed now, while there is nothing to migrate, and the
 * evaluator lands on top of a corpus already known to conform.
 *
 * Die faces are an allow-list because `1d7` is a typo rather than a house rule, and
 * the count is capped at twenty because the alternative is a client asking for
 * 99999 dice to be rendered in Milestone 5's physics engine.
 */
export const ROLL_PATTERN =
  /^(?:[1-9]|1\d|20)d(?:4|6|8|10|12|20|100)(?:[+-](?:\d{1,3}|STR|DEX|CON|INT|WIS|CHA|PROF))*$/

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
 * empty object. `SKILL_KEYS` and these thirteen fields are asserted to agree by a
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
  animalHandling: v.boolean(),
  insight: v.boolean(),
  perception: v.boolean(),
  deception: v.boolean(),
  intimidation: v.boolean(),
  performance: v.boolean(),
  persuasion: v.boolean(),
})

export const hitDiceValidator = v.object({
  count: v.number(),
  faces: v.union(v.literal(6), v.literal(8), v.literal(10), v.literal(12)),
})
export type HitDice = Infer<typeof hitDiceValidator>

/**
 * One line on a sheet: a feat, a spell, or an NPC's action.
 *
 * **One shape for all three**, and that is the decision that keeps a reduced NPC
 * sheet from becoming a second copy of everything. The two sheet variants differ in
 * what they hold; they do not differ in what a *line* is, so Milestone 5 gets one
 * roll path rather than a fork, and the picker, the list and the editor are each
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
  roll: v.union(v.string(), v.null()),
  /** Spell level, 0 for a cantrip. Null on a feat or an NPC action. */
  level: v.union(v.number(), v.null()),
  catalogueKey: v.union(v.string(), v.null()),
})
export type SheetEntry = Infer<typeof sheetEntryValidator>

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
  race: raceKeyValidator,
  classKey: classKeyValidator,
  /** Null below level 2, when no archetype has been chosen yet. */
  subclassKey: v.union(v.string(), v.null()),
  level: v.number(),
  overrides: v.optional(presetOverridesValidator),
  locked: v.boolean(),
})
export type PresetSheet = Infer<typeof presetSheetValidator>

/**
 * WHAT THE DATABASE HOLDS, as opposed to what the rest of the application reads.
 *
 * The distinction is the whole of Milestone 4's design. A `preset` is a set of
 * selections that `resolveSheet` in lib/resolve.ts turns into an ordinary
 * `PcSheet` — so every consumer downstream of that one function keeps the type it
 * already had, and `maySeeCharacter`, `visibleVitals`, the health bands and
 * `publicSheet` needed no change at all.
 *
 * If you are reading a character to *display or roll* it, you want `CharacterSheet`.
 * This type appears only where the stored document is being written or validated.
 */
export const storedSheetValidator = v.union(
  pcSheetValidator,
  npcSheetValidator,
  presetSheetValidator,
)
export type StoredSheet = Infer<typeof storedSheetValidator>

// ---------------------------------------------------------------------------
// The two optional fields, read through accessors
// ---------------------------------------------------------------------------

/** All thirteen false. A fresh object each call — see the note on `defaultPcSheet`. */
export function noSkills(): SkillProficiencies {
  return {
    athletics: false,
    acrobatics: false,
    sleightOfHand: false,
    stealth: false,
    arcana: false,
    investigation: false,
    animalHandling: false,
    insight: false,
    perception: false,
    deception: false,
    intimidation: false,
    performance: false,
    persuasion: false,
  }
}

/** The only place the optional `skillProficiencies` is read. */
export function skillProficienciesOf(sheet: CharacterSheet): SkillProficiencies {
  return sheet.kind === 'pc' ? sheet.skillProficiencies ?? noSkills() : noSkills()
}

/**
 * The only place the optional `speed` is read.
 *
 * `SPEED_FEET` used to be the whole answer and is now merely the default. The
 * comment it carried — that a character with a different speed is one the rules say
 * cannot exist — was true until the Goliath, and is why that constant is still the
 * number every other character gets.
 */
export function speedOf(sheet: CharacterSheet): number {
  const stored = sheet.kind === 'pc' ? sheet.speed : undefined
  return stored === undefined || !Number.isFinite(stored) ? SPEED_FEET : stored
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
export function characterSheet(doc: { sheet?: CharacterSheet }): CharacterSheet {
  return doc.sheet ?? defaultPcSheet()
}

export function characterKind(doc: { sheet?: CharacterSheet }): CharacterKind {
  return characterSheet(doc).kind
}

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

/** Every line on a sheet, whichever list it is in. For validation and for Milestone 5. */
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
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
  return isValidRoll(roll)
    ? null
    : `"${roll}" is not a roll. Try something like 1d8+WIS, 2d6 or 1d20+PROF.`
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
    // Milestone 4 added both, and every hand-built character's skill ticks went in
    // the bin on Save while the form showed them ticked. `npm run test:smoke` found
    // it; nothing in the local suite could have, because the value round-tripped
    // through a validator that permits it to be absent.
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
  return {
    id: entry.id.trim(),
    name: collapseWhitespace(entry.name),
    // Trimmed but not collapsed: an entry's description is a paragraph, and
    // flattening its line breaks would turn a two-part spell into one run-on.
    text: entry.text.trim(),
    roll: roll === '' ? null : roll,
    level: entry.level === null ? null : Math.round(entry.level),
    catalogueKey: entry.catalogueKey === null ? null : entry.catalogueKey.trim() || null,
  }
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

  if (sheet.kind === 'npc') {
    if (!isWholeWithin(sheet.initiativeBonus, -MAX_INITIATIVE_BONUS, MAX_INITIATIVE_BONUS)) {
      return {
        path: 'initiativeBonus',
        message: `The initiative bonus has to be a whole number from −${MAX_INITIATIVE_BONUS} to ${MAX_INITIATIVE_BONUS}.`,
      }
    }
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

  if (sheet.speed !== undefined && !isWholeWithin(sheet.speed, MIN_SPEED, MAX_SPEED)) {
    return {
      path: 'speed',
      message: `Speed has to be a whole number of feet from ${MIN_SPEED} to ${MAX_SPEED}.`,
    }
  }
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
  // Milestone 5 will aim a roll at — so an id checked only within its own list is
  // an id that can still collide in the merged one. Checking per list would have
  // enforced exactly the half of the guarantee that does not matter.
  const seen = new Set<string>()
  return (
    entriesProblem(sheet.feats, 'feats', seen) ?? entriesProblem(sheet.spells, 'spells', seen)
  )
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

    // The id is a React key and Milestone 5's roll target. A duplicate would make
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
 * Tidy a stored sheet, whichever of the three it is.
 *
 * A `preset` normalises to its selections and nothing else — there is no maximum to
 * round or spell list to trim, because it holds none. What it *resolves* to is
 * validated separately by the caller, which is the only place that can, since
 * resolution needs the library and this module deliberately never imports it.
 */
export function normaliseStoredSheet(sheet: StoredSheet): StoredSheet {
  if (sheet.kind !== 'preset') return normaliseSheet(sheet)

  return {
    kind: 'preset',
    race: sheet.race,
    classKey: sheet.classKey,
    subclassKey: sheet.subclassKey,
    level: Math.round(sheet.level),
    // **The override's entries get the same tidying as any other entry**, which they
    // were not getting. `storedSheetProblem` runs `entriesProblem` over them, so they
    // were being *validated* as though they had been normalised while being stored
    // raw: a roll typed the way a person types it, `2d6 + wis`, was refused inside an
    // override while the identical string in a feat list was accepted, and an id
    // stored as `" dm-2 "` sat on the sheet looking exactly like `"dm-2"` while being
    // a different React key and a different roll target.
    ...(sheet.overrides === undefined
      ? {}
      : {
          overrides: {
            ...sheet.overrides,
            ...(sheet.overrides.extraFeats === undefined
              ? {}
              : { extraFeats: sheet.overrides.extraFeats.map(normaliseEntry) }),
            ...(sheet.overrides.extraSpells === undefined
              ? {}
              : { extraSpells: sheet.overrides.extraSpells.map(normaliseEntry) }),
            ...(sheet.overrides.speed === undefined
              ? {}
              : { speed: Math.round(sheet.overrides.speed) }),
          },
        }),
    locked: sheet.locked,
  }
}

/**
 * The first thing wrong with a stored sheet's own fields, or null.
 *
 * For a `preset` this checks the **selections** — a level in range, an archetype
 * that belongs to the chosen class, an archetype not chosen before level 2. It
 * cannot check the numbers, because a preset has none until it is resolved; the
 * caller runs `sheetProblem` over the resolved sheet as well, which is what catches
 * a library entry or an override that lands out of bounds.
 *
 * Refusing an unknown archetype on **write** while `librarySheet` tolerates one on
 * **read** is deliberate rather than inconsistent: a character that already chose a
 * since-retired archetype must stay readable, and nobody should be able to choose
 * one now.
 */
export function storedSheetProblem(sheet: StoredSheet): SheetProblem | null {
  if (sheet.kind !== 'preset') return sheetProblem(sheet)

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
