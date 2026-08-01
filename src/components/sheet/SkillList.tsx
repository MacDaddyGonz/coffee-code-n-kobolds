import { Fragment } from 'react'

import { RollButton } from '@/components/sheet/RollButton'
import { SheetCheckbox, signed } from '@/components/sheet/SheetFields'
import type { Skill, SkillProficiencies } from '@convex/lib/skills'
import { SKILLS, skillBonus } from '@convex/lib/skills'
import type { AbilityKey, PcSheet } from '@convex/lib/sheet'
import { skillProficienciesOf } from '@convex/lib/sheet'

export type SkillListProps = {
  sheet: PcSheet
  disabled?: boolean
  /** Absent means the ticks are printed rather than ticked. */
  onChange?: (skills: SkillProficiencies) => void
  /** Said once above the list, where a tick nobody may change is otherwise a puzzle. */
  note?: string
}

/**
 * Every skill, sorted by name, taken once at module load.
 *
 * ⚠️ **A copy, and `SKILLS` itself is deliberately left alone.** That array is ordered
 * by ability and says so on itself, and it is not only this component's input — sorting
 * it in place would reorder it for every other reader to save one `[...]` here.
 *
 * `localeCompare` rather than `<`, which compares UTF-16 code units: the thirteen names
 * happen to be plain ASCII today, so the two agree, and the moment one of them is not
 * they stop agreeing in the direction a reader would call wrong. The comparison a person
 * would make is the one this list is read by, so it is worth naming even where it is
 * currently free.
 */
const SKILLS_BY_NAME: readonly Skill[] = [...SKILLS].sort((a, b) => a.name.localeCompare(b.name))

/**
 * The thirteen skills, listed alphabetically, each annotated with the ability it is
 * rolled on.
 *
 * **Structurally the same thing as the saving-throw column in `AbilityTable`, and
 * drawn to look it** — a name, a tick, and the bonus that falls out of the two. That
 * is not a styling preference: a skill *is* a stat check with a name, and a sheet that
 * presented the two as different kinds of object would be teaching a beginner a
 * distinction the rules do not have.
 *
 * **This used to be grouped under an ability heading**, on the argument that "what do I
 * roll for sneaking" is answered by finding the Dexterity block. Alphabetical with the
 * ability in brackets answers the same question and asks less of the reader: it does not
 * require knowing that stealth is a Dexterity skill *before* being able to look it up,
 * which is the one thing somebody asking that question does not know. The brackets were
 * already on every row, so nothing was lost by dropping the headings.
 *
 * Constitution simply never appears, and now needs no special case for it: the list is
 * walked skill by skill rather than ability by ability, so an ability with nothing under
 * it is not a group to skip — it is an ability nothing here mentions.
 *
 * **The bonus is now the roll**, exactly as the saving-throw column beside it is, which is
 * the same argument one more time: a skill is a stat check with a name, so clicking one has
 * to feel like clicking the other. `RollButton` reads the target itself, so a sheet with
 * nothing to aim at prints the same thirteen numbers it always did.
 *
 * ⚠️ **`CreatureSkills` in `CreatureSheetView.tsx` is not this and must not be given the
 * same treatment.** A creature's skills are pre-calculated sparse bonuses with no ability
 * score, level or proficiency behind them, and the server refuses a `skill` request against
 * a creature outright — so a clickable badge there would be a control whose only outcome is
 * a toast. That component's own ⚠️ already says the two are not interchangeable; this is the
 * same warning arriving from the other side.
 */
export function SkillList({ sheet, disabled, onChange, note }: SkillListProps) {
  const proficiencies = skillProficienciesOf(sheet)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Skills</h3>
        {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      </div>

      <div className="grid grid-cols-[1fr_2.5rem_3rem] items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-xs font-medium">Skill</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Trained</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Bonus</span>

        {SKILLS_BY_NAME.map((skill) => (
          <Fragment key={skill.key}>
            <label htmlFor={`skill-${skill.key}`} className="truncate text-sm">
              {skill.name}{' '}
              <span className="text-muted-foreground text-xs">({abbreviate(skill.ability)})</span>
            </label>
            <span className="flex justify-center">
              <SheetCheckbox
                id={`skill-${skill.key}`}
                label={`Trained in ${skill.name}`}
                checked={proficiencies[skill.key]}
                disabled={disabled || onChange === undefined}
                onChange={(trained) => onChange?.({ ...proficiencies, [skill.key]: trained })}
              />
            </span>
            {/* The `flex justify-center` wrapper the tick beside it uses, for the reason
                `AbilityTable` spells out: these are bare cells of the parent's grid, so an
                element added around one of them shifts the whole row. */}
            <span className="flex justify-center">
              <RollButton
                request={{ kind: 'skill', skill: skill.key }}
                // No article needed and none invented: four of the thirteen names begin
                // with a vowel, which is why `article` exists in convex/lib/roll.ts at
                // all, and "Roll Athletics" needs neither it nor the `the` the ability
                // rows use.
                says={`Roll ${skill.name}`}
                look="number"
                className="font-medium"
                disabled={disabled}
              >
                {signed(skillBonus(sheet.abilities, sheet.level, proficiencies, skill.key))}
              </RollButton>
            </span>
          </Fragment>
        ))}
      </div>
    </section>
  )
}

/** `str` → `STR`, matching the tokens a roll like `1d20+STR` is written with. */
function abbreviate(ability: AbilityKey): string {
  return ability.toUpperCase()
}
