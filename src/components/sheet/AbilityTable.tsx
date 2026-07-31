import { FieldError } from '@/components/FieldError'
import { NumberInput, SheetCheckbox, signed } from '@/components/sheet/SheetFields'
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
} from '@convex/lib/sheet'

export type AbilityTableProps = {
  sheet: PcSheet
  /** The whole sheet's first problem, so the field it names can be marked. */
  problem: SheetProblem | null
  disabled?: boolean
  /** Absent means the six scores are printed rather than typed in. */
  onScores?: (abilities: AbilityScores) => void
  /** Absent means the save ticks are printed rather than ticked. */
  onSaves?: (saves: SaveProficiencies) => void
}

/**
 * The six ability scores, the modifier each one gives, whether the character is
 * proficient in its saving throw, and what that throw comes to.
 *
 * **The two halves are made editable independently**, and that is not
 * over-generalisation — it is the one arrangement Milestone 4 actually needs. On a
 * hand-built sheet both are typed in. On a character built from the library both come
 * from the library, and the DM may push the *scores* around through
 * `preset.overrides.abilities` while the save proficiencies stay whatever the class
 * grants. A single `readOnly` flag would force those two into one answer and there is
 * no answer that is right for both.
 *
 * A score that cannot be edited is rendered as text rather than as a disabled input,
 * for the reason `DerivedStat` gives: a greyed-out box reads as "you may not edit this
 * *yet*", which sends somebody looking for the permission that would unlock it.
 * Nothing unlocks a library score for a player; the DM changes it or it stays.
 *
 * The modifier and the save bonus are shown side by side rather than one being
 * inferred from the other, because they differ by the proficiency bonus exactly when
 * the box is ticked — and seeing both is how somebody checks they ticked the right
 * ones.
 */
export function AbilityTable({ sheet, problem, disabled, onScores, onSaves }: AbilityTableProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading text-sm font-medium">Abilities and saving throws</h3>

      <div className="grid grid-cols-[1fr_4.5rem_2.5rem_2.5rem_3rem] items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-xs font-medium">Ability</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Score</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Mod</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Save</span>
        <span className="text-muted-foreground text-center text-xs font-medium">Bonus</span>

        {ABILITY_KEYS.map((ability) => (
          <AbilityRow
            key={ability}
            ability={ability}
            sheet={sheet}
            invalid={problem?.path === `abilities.${ability}`}
            disabled={disabled}
            onScore={
              onScores && ((score) => onScores({ ...sheet.abilities, [ability]: score }))
            }
            onProficient={
              onSaves &&
              ((proficient) => onSaves({ ...sheet.saveProficiencies, [ability]: proficient }))
            }
          />
        ))}
      </div>

      <FieldError message={messageAtField(problem, 'abilities')} />
    </section>
  )
}

function AbilityRow({
  ability,
  sheet,
  invalid,
  disabled,
  onScore,
  onProficient,
}: {
  ability: AbilityKey
  sheet: PcSheet
  invalid?: boolean
  disabled?: boolean
  onScore?: (score: number) => void
  onProficient?: (proficient: boolean) => void
}) {
  const score = sheet.abilities[ability]

  return (
    <>
      <label htmlFor={`ability-${ability}`} className="truncate text-sm">
        {ABILITY_NAMES[ability]}
      </label>

      {onScore ? (
        <NumberInput
          id={`ability-${ability}`}
          value={score}
          invalid={invalid}
          disabled={disabled}
          onChange={onScore}
        />
      ) : (
        <span className="text-center text-sm font-medium tabular-nums">{score}</span>
      )}

      <span className="text-center text-sm tabular-nums">{signed(abilityModifier(score))}</span>
      <span className="flex justify-center">
        <SheetCheckbox
          id={`save-${ability}`}
          label={`Proficient in ${ABILITY_NAMES[ability]} saving throws`}
          checked={sheet.saveProficiencies[ability]}
          // A tick nobody may change is still shown as a tick rather than as a dash:
          // it is the same fact on both kinds of sheet, and a reader scanning the
          // column for "which saves am I good at" should not have to learn two
          // notations for it.
          disabled={disabled || onProficient === undefined}
          onChange={(proficient) => onProficient?.(proficient)}
        />
      </span>
      <span className="text-center text-sm font-medium tabular-nums">
        {signed(savingThrowBonus(sheet, ability))}
      </span>
    </>
  )
}
