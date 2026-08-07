import { Fragment } from 'react'

import { signed } from '@/lib/vitals'
import { FieldError } from '@/components/FieldError'
import { RollButton } from '@/components/sheet/RollButton'
import { NumberInput, SheetCheckbox } from '@/components/sheet/SheetFields'
import type { Skill, SkillProficiencies } from '@convex/lib/skills'
import { SKILLS, skillBonus } from '@convex/lib/skills'
import type {
  AbilityKey,
  AbilityScores,
  PcSheet,
  SaveProficiencies,
  SheetProblem,
} from '@convex/lib/sheet'
import {
  ABILITY_KEYS,
  ABILITY_NAMES,
  abilityModifier,
  messageAtField,
  savingThrowBonus,
  skillProficienciesOf,
} from '@convex/lib/sheet'

export type AbilityBlockProps = {
  sheet: PcSheet
  /** The whole sheet's first problem, so the field it names can be marked. */
  problem: SheetProblem | null
  disabled?: boolean
  /** Absent means the six scores are printed rather than typed in. */
  onScores?: (abilities: AbilityScores) => void
  /** Absent means the save ticks are printed rather than ticked. */
  onSaves?: (saves: SaveProficiencies) => void
  /** Absent means the skill ticks are printed rather than ticked. */
  onSkills?: (skills: SkillProficiencies) => void
}

/**
 * The six abilities, their saving throws, and **each ability's own skills nested under
 * it.**
 *
 * ⚠️ **This reverses the alphabetical list the thirteen skills used to be shown as, and
 * the reversal is the point of the component rather than a side effect of merging two.**
 * That decision was argued for: alphabetical answers *"what do I roll for sneaking"*
 * without the reader having to know that Stealth is a Dexterity skill, which is the one
 * thing somebody asking that question does not know. It was right for thirteen names in a
 * column of their own. It is wrong for eighteen sitting beside the scores they are built
 * from, for two reasons the conversion produced: **five of the eighteen went into two
 * blocks** — Intelligence now has five skills and Wisdom five — so the ability blocks are
 * the structure a 2024 sheet actually has; and a skill's bonus *is* its ability's modifier
 * plus a proficiency bonus, so printing the two a screen apart made the arithmetic on the
 * page unverifiable. Nested, a reader can see `+3` become `+5` on the row under it.
 * The bracketed ability abbreviation every row carried is gone with the flattening,
 * because the heading now says it.
 *
 * **A skill is a saving throw with a different name on it, and both are drawn to look it.**
 * A save and a skill are the same object — a d20 plus a modifier, better if you are trained
 * — so they get the same tick, the same column and the same kind of button. Presenting them
 * as different kinds of thing would teach a beginner a distinction the rules do not have.
 *
 * ⚠️ **Iterated over `ABILITY_KEYS` and `SKILLS`, never over six or eighteen names in the
 * markup.** Every skill is bucketed by its own `ability` field in one pass, so a nineteenth
 * skill appears under its ability the moment it is added to the vocabulary — where
 * eighteen hand-written rows is the arrangement in which it is stored, counted in a
 * proficiency payload, and invisible. That is CLAUDE.md invariant 9's rule applied to the
 * one screen the skills are actually seen on.
 *
 * Constitution has nothing under it and needs no special case: the list is built from the
 * skills rather than from the abilities, so an ability with none is one nothing mentions
 * rather than a group to skip.
 *
 * **Both halves are made editable independently**, which is not over-generalisation but
 * the one arrangement that exists: a hand-built sheet types all three, and a character
 * built from the library has scores the DM may override while the save and skill
 * proficiencies stay whatever the class granted. A single `readOnly` flag would force
 * three answers into one, and there is no answer right for all three.
 *
 * Every number here is a roll. `RollButton` reads its own target, so a sheet rendered with
 * nothing to aim at prints the same figures and offers no buttons — and nothing on this
 * page works a roll out: `+5` is a label on a request naming an ability or a skill, and
 * the server reads the expression off the stored sheet.
 */
export function AbilityBlock({
  sheet,
  problem,
  disabled,
  onScores,
  onSaves,
  onSkills,
}: AbilityBlockProps) {
  const proficiencies = skillProficienciesOf(sheet)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Abilities, saves and skills</h3>
        <p className="text-muted-foreground text-xs">
          {onScores || onSaves || onSkills
            ? 'Every number is a button. Tick what this character is trained in.'
            : 'Every number is a button. Your class and level decide the ticks, and they keep up as you go.'}
        </p>
      </div>

      {ABILITY_KEYS.map((ability) => (
        <AbilitySection
          key={ability}
          ability={ability}
          sheet={sheet}
          proficiencies={proficiencies}
          skills={SKILLS_BY_ABILITY.get(ability) ?? []}
          invalid={problem?.path === `abilities.${ability}`}
          disabled={disabled}
          onScore={onScores && ((score) => onScores({ ...sheet.abilities, [ability]: score }))}
          onProficient={
            onSaves &&
            ((proficient) => onSaves({ ...sheet.saveProficiencies, [ability]: proficient }))
          }
          onSkill={
            onSkills &&
            ((key: Skill['key'], trained: boolean) =>
              onSkills({ ...proficiencies, [key]: trained }))
          }
        />
      ))}

      <FieldError message={messageAtField(problem, 'abilities')} />
    </section>
  )
}

/**
 * Every skill filed under the ability it is rolled on, in `SKILLS`' own order.
 *
 * Built in one pass at module load from the vocabulary itself, which is what makes the
 * grouping total: a skill can only fail to appear by not being in `SKILLS`, and `SKILLS`
 * is what `SKILL_KEYS`, the proficiency validator and the roll subject are all pinned
 * against. The buckets are seeded from `ABILITY_KEYS` so that an ability with no skills
 * still has an entry rather than answering `undefined` at the call site — Constitution is
 * that ability today, and it is the SRD's business rather than this file's whether it stays
 * the only one.
 *
 * `SKILLS` is read and never sorted: it is ordered by ability and says so on itself, and
 * it is not only this component's input.
 */
const SKILLS_BY_ABILITY: ReadonlyMap<AbilityKey, Skill[]> = (() => {
  const map = new Map<AbilityKey, Skill[]>(ABILITY_KEYS.map((ability) => [ability, []]))
  for (const skill of SKILLS) map.get(skill.ability)?.push(skill)
  return map
})()

function AbilitySection({
  ability,
  sheet,
  proficiencies,
  skills,
  invalid,
  disabled,
  onScore,
  onProficient,
  onSkill,
}: {
  ability: AbilityKey
  sheet: PcSheet
  proficiencies: SkillProficiencies
  skills: readonly Skill[]
  invalid?: boolean
  disabled?: boolean
  onScore?: (score: number) => void
  onProficient?: (proficient: boolean) => void
  onSkill?: (key: Skill['key'], trained: boolean) => void
}) {
  const score = sheet.abilities[ability]

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-2">
      {/* The ability's own row. Five columns, and the skill rows below reuse the last
          three so that a skill's tick sits under the save's tick and its bonus under the
          save's bonus — which is what makes "a skill is a save with a name" legible
          rather than merely asserted. */}
      <div className="grid grid-cols-[1fr_4rem_2.75rem_2.5rem_3rem] items-center gap-x-2">
        <label htmlFor={`ability-${ability}`} className="font-heading truncate text-sm font-medium">
          {ABILITY_NAMES[ability]}
        </label>

        {onScore ? (
          <NumberInput
            id={`ability-${ability}`}
            className="h-7"
            value={score}
            invalid={invalid}
            disabled={disabled}
            onChange={onScore}
          />
        ) : (
          <span className="text-center text-sm font-medium tabular-nums">{score}</span>
        )}

        <span className="flex justify-center">
          <RollButton
            request={{ kind: 'check', ability }}
            // `the` rather than `a`: Intelligence is the only one of the six beginning
            // with a vowel, and `article` in convex/lib/roll.ts — which exists for exactly
            // this — is private to that module. `the` is invariant across all six.
            says={`Roll the ${ABILITY_NAMES[ability]} check`}
            look="number"
            disabled={disabled}
          >
            {signed(abilityModifier(score))}
          </RollButton>
        </span>

        <span className="flex justify-center">
          <SheetCheckbox
            id={`save-${ability}`}
            label={`Proficient in ${ABILITY_NAMES[ability]} saving throws`}
            checked={sheet.saveProficiencies[ability]}
            // A tick nobody may change is still a tick rather than a dash: it is the same
            // fact on both kinds of sheet, and a reader scanning for "which saves am I
            // good at" should not have to learn two notations for it.
            disabled={disabled || onProficient === undefined}
            onChange={(proficient) => onProficient?.(proficient)}
          />
        </span>

        <span className="flex justify-center">
          <RollButton
            request={{ kind: 'save', ability }}
            says={`Roll the ${ABILITY_NAMES[ability]} saving throw`}
            look="number"
            className="font-medium"
            disabled={disabled}
          >
            {signed(savingThrowBonus(sheet, ability))}
          </RollButton>
        </span>
      </div>

      {skills.length === 0 ? null : (
        <div className="grid grid-cols-[1fr_4rem_2.75rem_2.5rem_3rem] items-center gap-x-2 gap-y-0.5">
          {skills.map((skill) => (
            <Fragment key={skill.key}>
              {/* Spans the ability's own name and score columns, so the skill name has
                  room and the two numeric columns stay aligned with the row above. */}
              <label
                htmlFor={`skill-${skill.key}`}
                className="text-muted-foreground col-span-3 truncate pl-3 text-sm"
              >
                {skill.name}
              </label>
              <span className="flex justify-center">
                <SheetCheckbox
                  id={`skill-${skill.key}`}
                  label={`Trained in ${skill.name}`}
                  checked={proficiencies[skill.key]}
                  disabled={disabled || onSkill === undefined}
                  onChange={(trained) => onSkill?.(skill.key, trained)}
                />
              </span>
              <span className="flex justify-center">
                <RollButton
                  request={{ kind: 'skill', skill: skill.key }}
                  // No article, and none invented: several of the eighteen names begin
                  // with a vowel, which is why `article` exists on the server at all, and
                  // "Roll Athletics" needs neither it nor the `the` the ability rows use.
                  says={`Roll ${skill.name}`}
                  look="number"
                  disabled={disabled}
                >
                  {signed(skillBonus(sheet.abilities, sheet.level, proficiencies, skill.key))}
                </RollButton>
              </span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
