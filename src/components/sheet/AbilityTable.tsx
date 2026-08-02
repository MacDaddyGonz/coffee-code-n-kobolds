import { FieldError } from '@/components/FieldError'
import { RollButton } from '@/components/sheet/RollButton'
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
 *
 * **Both of those numbers are now the roll they describe.** The modifier sends an ability
 * check and the bonus sends a saving throw, through `RollButton`, which reads the target
 * itself — so a sheet with nothing to aim at prints the same twelve numbers it always did.
 * Nothing here works a roll out; `+3` is a label on a request, and the expression behind it
 * is read off the stored sheet by the server.
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

      {/* ⚠️ **A wrapper around a cell changes the grid**, so the control goes inside the
          same `flex justify-center` span the Save tick already uses rather than beside it.
          `AbilityRow` returns five bare cells and the parent's `grid-cols-[…]` counts
          them; an extra element here would shunt every row one column to the left.

          `disabled` is threaded in for the same reason the tick and the score box take it:
          a sheet mid-save is a sheet whose numbers are about to change, and the confusing
          click is the one that rolls the stored modifier while the screen is showing an
          unsaved one. */}
      <span className="flex justify-center">
        <RollButton
          request={{ kind: 'check', ability }}
          // `the` rather than `a`, and it is the one word that avoids a duplicated rule.
          // Intelligence is the only ability whose name begins with a vowel, so "a
          // Intelligence check" is wrong — and `article` in convex/lib/roll.ts, which
          // exists for exactly this and is private to that module, cannot be imported.
          // `the` is invariant across all six.
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
          // A tick nobody may change is still shown as a tick rather than as a dash:
          // it is the same fact on both kinds of sheet, and a reader scanning the
          // column for "which saves am I good at" should not have to learn two
          // notations for it.
          disabled={disabled || onProficient === undefined}
          onChange={(proficient) => onProficient?.(proficient)}
        />
      </span>
      <span className="flex justify-center">
        <RollButton
          request={{ kind: 'save', ability }}
          says={`Roll the ${ABILITY_NAMES[ability]} saving throw`}
          look="number"
          // The weight this cell has always had, passed in rather than baked into the
          // `number` look — the Mod cell beside it is not `font-medium` and this change is
          // not the place to decide which of the two is right.
          className="font-medium"
          disabled={disabled}
        >
          {signed(savingThrowBonus(sheet, ability))}
        </RollButton>
      </span>
    </>
  )
}
