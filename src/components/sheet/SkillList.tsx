import { Fragment } from 'react'

import { SheetCheckbox, signed } from '@/components/sheet/SheetFields'
import type { SkillProficiencies } from '@convex/lib/skills'
import { SKILLS, skillBonus } from '@convex/lib/skills'
import type { AbilityKey, PcSheet } from '@convex/lib/sheet'
import { ABILITY_KEYS, ABILITY_NAMES, skillProficienciesOf } from '@convex/lib/sheet'

export type SkillListProps = {
  sheet: PcSheet
  disabled?: boolean
  /** Absent means the ticks are printed rather than ticked. */
  onChange?: (skills: SkillProficiencies) => void
  /** Said once above the list, where a tick nobody may change is otherwise a puzzle. */
  note?: string
}

/**
 * The thirteen skills, grouped under the ability each one is rolled on.
 *
 * **Structurally the same thing as the saving-throw column in `AbilityTable`, and
 * drawn to look it** — a name, a tick, and the bonus that falls out of the two. That
 * is not a styling preference: a skill *is* a stat check with a name, and a sheet that
 * presented the two as different kinds of object would be teaching a beginner a
 * distinction the rules do not have.
 *
 * Grouped by ability rather than listed alphabetically, and the ability repeated in
 * brackets on every row. The grouping is how somebody actually looks one up — "what do
 * I roll for sneaking" is answered by finding the Dexterity block, not by scanning
 * thirteen names — and the brackets survive the scroll, so a row read on its own still
 * says what it is built on. `SKILLS` is already ordered this way for the same reason.
 *
 * Constitution has no skills and so gets no heading. Iterating the abilities and
 * filtering, rather than walking `SKILLS` and emitting a heading on each change, is
 * what keeps that from needing a special case.
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

        {ABILITY_KEYS.map((ability) => {
          const group = SKILLS.filter((skill) => skill.ability === ability)
          if (group.length === 0) return null

          return (
            <Fragment key={ability}>
              <span className="text-muted-foreground col-span-3 pt-1.5 text-xs font-semibold tracking-wide uppercase">
                {ABILITY_NAMES[ability]}
              </span>

              {group.map((skill) => (
                <Fragment key={skill.key}>
                  <label htmlFor={`skill-${skill.key}`} className="truncate text-sm">
                    {skill.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      ({abbreviate(skill.ability)})
                    </span>
                  </label>
                  <span className="flex justify-center">
                    <SheetCheckbox
                      id={`skill-${skill.key}`}
                      label={`Trained in ${skill.name}`}
                      checked={proficiencies[skill.key]}
                      disabled={disabled || onChange === undefined}
                      onChange={(trained) =>
                        onChange?.({ ...proficiencies, [skill.key]: trained })
                      }
                    />
                  </span>
                  <span className="text-center text-sm font-medium tabular-nums">
                    {signed(skillBonus(sheet.abilities, sheet.level, proficiencies, skill.key))}
                  </span>
                </Fragment>
              ))}
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}

/** `str` → `STR`, matching the tokens a roll like `1d20+STR` is written with. */
function abbreviate(ability: AbilityKey): string {
  return ability.toUpperCase()
}
