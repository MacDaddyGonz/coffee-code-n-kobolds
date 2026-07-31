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

import type { AbilityKey, AbilityScores } from './sheet'
import { abilityModifier, proficiencyBonus } from './sheet'

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
