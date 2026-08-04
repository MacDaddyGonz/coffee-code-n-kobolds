// The thirteen D&D Lite skills and the arithmetic behind them.
//
// Shared by the Convex functions and the browser through the `@convex/…` alias,
// like lib/grid.ts and lib/sheet.ts, so a bonus the form prints and a bonus the
// server would roll are the same number.
//
// **These are a deliberate change to the rules subset**, not an implementation of
// it. docs/requirements.md excluded "skills from backgrounds / proficiencies", and
// that exclusion was lifted for Milestone 4 — see ADR 0006. What was added is the
// *class's* skills; backgrounds are still excluded, so there is no second source a
// proficiency can come from and no place for one to be added by accident.

import type { AbilityKey, AbilityScores, CharacterSheet } from './sheet'
import {
  abilityModifier,
  armourClassOf,
  passivePerceptionOf,
  proficiencyBonus,
  skillProficienciesOf,
} from './sheet'

export type Skill = {
  key: SkillKey
  name: string
  /** The ability its bonus is built on. A skill is a stat check with a name. */
  ability: AbilityKey
}

export const SKILL_KEYS = [
  'athletics',
  'acrobatics',
  'sleightOfHand',
  'stealth',
  'arcana',
  'investigation',
  'animalHandling',
  'insight',
  'perception',
  'deception',
  'intimidation',
  'performance',
  'persuasion',
] as const
export type SkillKey = (typeof SKILL_KEYS)[number]

/**
 * Ordered by ability rather than alphabetically, because that is how the sheet
 * groups them and how a player looks one up — "what do I roll for sneaking" is
 * answered by finding the Dexterity block, not by scanning thirteen names.
 */
export const SKILLS: readonly Skill[] = [
  { key: 'athletics', name: 'Athletics', ability: 'str' },
  { key: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { key: 'sleightOfHand', name: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', name: 'Stealth', ability: 'dex' },
  { key: 'arcana', name: 'Arcana', ability: 'int' },
  { key: 'investigation', name: 'Investigation', ability: 'int' },
  { key: 'animalHandling', name: 'Animal Handling', ability: 'wis' },
  { key: 'insight', name: 'Insight', ability: 'wis' },
  { key: 'perception', name: 'Perception', ability: 'wis' },
  { key: 'deception', name: 'Deception', ability: 'cha' },
  { key: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { key: 'performance', name: 'Performance', ability: 'cha' },
  { key: 'persuasion', name: 'Persuasion', ability: 'cha' },
]

const SKILL_BY_KEY = new Map(SKILLS.map((skill) => [skill.key, skill]))

export function skill(key: SkillKey): Skill {
  // Non-null because `SkillKey` is derived from the same list the map is built
  // from — a key that is not in it cannot be constructed.
  return SKILL_BY_KEY.get(key)!
}

/** Every skill keyed to whether the character is proficient. All thirteen, always. */
export type SkillProficiencies = Record<SkillKey, boolean>

// There is deliberately no `noSkillProficiencies` here. `noSkills` in lib/sheet.ts
// is the one that everything uses, and it cannot be replaced by a version living
// here: `sheet.ts` may import only *types* from this module, because this one imports
// values from it. A second function for "thirteen falses" was written, went
// uncalled, and has been removed rather than left as a choice nobody should have to
// make.

/**
 * Ability modifier, plus the proficiency bonus when trained.
 *
 * Structurally the same calculation as `savingThrowBonus` in lib/sheet.ts, and
 * deliberately not folded into it: a save is keyed by ability and a skill is keyed
 * by skill, so a shared function would take the ability *and* the flag and leave
 * both callers doing the lookup it was supposed to save them.
 */
export function skillBonus(
  scores: AbilityScores,
  level: number,
  proficiencies: SkillProficiencies,
  key: SkillKey,
): number {
  const base = abilityModifier(scores[skill(key).ability])
  return proficiencies[key] ? base + proficiencyBonus(level) : base
}

/**
 * Ten plus the Perception bonus — what a character notices without looking.
 *
 * Derived rather than stored, like every other number on the sheet that can be:
 * a stored copy is a copy to keep in step with the Wisdom score it comes from.
 */
export function passivePerception(
  scores: AbilityScores,
  level: number,
  proficiencies: SkillProficiencies,
): number {
  return 10 + skillBonus(scores, level, proficiencies, 'perception')
}

/**
 * Passive perception for **either** kind of sheet — derived for a hero, stored for a
 * creature, `null` when a creature has none recorded.
 *
 * ⚠️ **New because the two halves had never met, and the halves are genuinely different
 * facts.** A hero's is computed above from Wisdom, the level and the Perception flag, all
 * of which exist only on a `PcSheet`. A creature's is a pre-calculated number the bestiary
 * or the DM wrote, read by `passivePerceptionOf` in lib/sheet.ts, which answers `null` for
 * every `pc` — so before this there was no way to ask the question of a `CharacterSheet`,
 * only of one variant or the other. The board asks it of both.
 *
 * ⚠️ **It lives here rather than beside `passivePerceptionOf`, and the import graph is
 * why.** lib/sheet.ts imports only *types* from this module, deliberately — its own comment
 * says so — because this module imports `abilityModifier` and `proficiencyBonus` as values
 * from it. A function needing both `passivePerception` (here) and `passivePerceptionOf`
 * (there) can only sit on this side without closing that loop.
 *
 * ⚠️ **`null` stays `null` for a hand-built creature, and printing 10 instead would be
 * inventing a statistic.** `passivePerceptionOf`'s docblock makes that point and it is
 * sharper now that the answer is drawn on the board: a blue circle reading 10 on a goblin
 * whose DM never gave it one is a number the table will act on.
 *
 * `skillProficienciesOf` rather than `sheet.skillProficiencies`, because that field is
 * optional on a stored PC sheet and the accessor is the one place its default lives.
 */
export function passivePerceptionFor(sheet: CharacterSheet): number | null {
  if (sheet.kind !== 'pc') return passivePerceptionOf(sheet)
  return passivePerception(sheet.abilities, sheet.level, skillProficienciesOf(sheet))
}

/**
 * THE TWO NUMBERS A COIN SAYS ABOUT ITSELF — armour class and passive perception, derived
 * together because they are published together.
 *
 * ⚠️ **One function rather than two calls at the call site, and that is a correction.**
 * `visibleVitals` reached for `passivePerceptionFor` for one of them and wrote
 * `Number.isFinite(sheet.armourClass) ? … : null` inline for the other — two altitudes for
 * one decision, and the inline half quietly re-implemented `finiteOrNull` because that
 * helper is module-private to lib/sheet.ts. The pair is what
 * [ADR 0014](../../docs/adr/0014-what-a-coin-says-about-itself.md) publishes, so the pair
 * is what gets derived, and *absent* means the same thing for both by construction.
 *
 * Returns the exact shape both members of `publicVitalsValidator` carry, so the caller
 * spreads it rather than naming the two fields twice.
 *
 * ⚠️ **This is the door a third published stat would come through, and it should not open
 * quietly.** Adding one here is adding it to a payload whose union exists to discriminate
 * *hit points* — the argument for the first two is that `resolveSheet` had already run so
 * they cost no read, and that argument will be just as available for a third. The shape
 * that survives a third is `{ characterId, vitals, stats }`, with the discriminator left
 * single-purpose. Ship that before shipping the third stat, not after.
 */
export function coinStatsOf(sheet: CharacterSheet): {
  armourClass: number | null
  passivePerception: number | null
} {
  return { armourClass: armourClassOf(sheet), passivePerception: passivePerceptionFor(sheet) }
}
