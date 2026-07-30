import { FieldError } from '@/components/FieldError'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import {
  DerivedStat,
  NumberInput,
  SheetCheckbox,
  SheetField,
  signed,
} from '@/components/sheet/SheetFields'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { FEATS, SPELLS } from '@convex/lib/rules'
import type { AbilityKey, HitDice, PcSheet, SheetProblem } from '@convex/lib/sheet'
import {
  ABILITY_KEYS,
  ABILITY_NAMES,
  HIT_DIE_FACES,
  MAX_CLASS_NAME_LENGTH,
  SPEED_FEET,
  abilityModifier,
  initiativeBonusOf,
  proficiencyBonus,
  savingThrowBonus,
} from '@convex/lib/sheet'

export type PcSheetFormProps = {
  sheet: PcSheet
  /** The whole sheet's first problem, so the field it names can be marked. */
  problem: SheetProblem | null
  disabled?: boolean
  onChange: (sheet: PcSheet) => void
}

/**
 * A hero's sheet: the six scores, the six saving throws, armour class, hit points,
 * hit dice, feats and spells.
 *
 * **Every derived number on this form comes out of convex/lib/sheet.ts**, and none
 * of the arithmetic is repeated here. That module is shared with the Convex
 * functions through the `@convex/…` alias for exactly this reason: a modifier the
 * form works out and a modifier the server works out have to be the same number, and
 * a second `Math.floor((score - 10) / 2)` in a component is the first place they
 * would drift. The same goes for the bounds — the form does not know that a level
 * stops at 20, it asks `sheetProblem`.
 *
 * What is *not* here is as deliberate as what is. No racial abilities, no background
 * skills or proficiencies, no inventory, no conditions: requirements.md excludes all
 * four by design rather than by omission, and a field for one of them here is how
 * the reduced rule set stops being reduced.
 */
export function PcSheetForm({ sheet, problem, disabled, onChange }: PcSheetFormProps) {
  const set = (patch: Partial<PcSheet>) => onChange({ ...sheet, ...patch })

  // `sheetProblem` returns the *first* problem and names it with a path, so the form
  // marks one field at a time and prints one sentence — the server's own sentence,
  // since the mutation calls the same function to decide whether to throw. `marks`
  // reddens the box; `messageFor` puts the wording beside the group it belongs to,
  // rather than at the bottom of a column the offending field has scrolled off.
  const marks = (path: string) => problem?.path === path
  const messageFor = (...paths: string[]) =>
    problem && paths.some((path) => problem.path === path || problem.path.startsWith(`${path}.`))
      ? problem.message
      : null

  const proficiency = proficiencyBonus(sheet.level)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <SheetField id="pc-level" label="Level">
          <NumberInput
            id="pc-level"
            value={sheet.level}
            invalid={marks('level')}
            disabled={disabled}
            onChange={(level) => set({ level })}
          />
        </SheetField>
        <SheetField id="pc-class" label="Class">
          <Input
            id="pc-class"
            value={sheet.className}
            maxLength={MAX_CLASS_NAME_LENGTH}
            aria-invalid={marks('className') || undefined}
            disabled={disabled}
            autoComplete="off"
            placeholder="Fighter, Wizard, Cleric…"
            onChange={(event) => set({ className: event.target.value })}
          />
        </SheetField>
      </div>
      <FieldError message={messageFor('level', 'className')} />

      {/* Read-only, all three, and each for its own reason. Proficiency and
          initiative are worked out from what is above; speed is a constant, because
          every character in D&D Lite moves 35 feet and a box to change it in would
          invite a character the rules say cannot exist. See `SPEED_FEET`. */}
      <div className="bg-muted/40 grid grid-cols-3 gap-3 rounded-lg border p-3">
        <DerivedStat label="Proficiency" value={signed(proficiency)} />
        <DerivedStat label="Initiative" value={signed(initiativeBonusOf(sheet))} hint="Dexterity" />
        <DerivedStat label="Speed" value={`${SPEED_FEET} ft`} hint="everyone, always" />
      </div>

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
              invalid={marks(`abilities.${ability}`)}
              disabled={disabled}
              onScore={(score) =>
                set({ abilities: { ...sheet.abilities, [ability]: score } })
              }
              onProficient={(proficient) =>
                set({
                  saveProficiencies: { ...sheet.saveProficiencies, [ability]: proficient },
                })
              }
            />
          ))}
        </div>

        <FieldError message={messageFor('abilities')} />
      </section>

      <Separator />

      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <SheetField id="pc-ac" label="Armour class">
          <NumberInput
            id="pc-ac"
            value={sheet.armourClass}
            invalid={marks('armourClass')}
            disabled={disabled}
            onChange={(armourClass) => set({ armourClass })}
          />
        </SheetField>

        <SheetField id="pc-max-hp" label="Maximum hit points">
          <NumberInput
            id="pc-max-hp"
            value={sheet.maxHp}
            invalid={marks('maxHp')}
            disabled={disabled}
            onChange={(maxHp) => set({ maxHp })}
          />
        </SheetField>
      </div>

      {/* The full complement, and the caption says so, because the panel now shows a
          second hit-dice number — how many are left to spend — up beside the health
          bar. Two bare `5`s and `3`s under the same word would read as a
          contradiction, so each of the two captions names what it is and points at
          the other. This one is part of the build and changes when the character
          levels; that one is state and changes when they rest. */}
      <SheetField
        id="pc-hit-dice"
        label="Hit dice the character has"
        hint="What is left to spend is at the top of this panel."
      >
        <div className="flex items-center gap-2">
          <NumberInput
            id="pc-hit-dice"
            className="w-16"
            value={sheet.hitDice.count}
            invalid={marks('hitDice.count')}
            disabled={disabled}
            onChange={(count) => set({ hitDice: { ...sheet.hitDice, count } })}
          />
          <span className="text-muted-foreground">×</span>
          <NativeSelect
            aria-label="Hit die size"
            value={String(sheet.hitDice.faces)}
            disabled={disabled}
            onChange={(event) =>
              set({
                hitDice: {
                  ...sheet.hitDice,
                  // The union is four literals in the validator, so the cast is
                  // narrowing a string back to what the options were built from
                  // rather than asserting anything the list does not already
                  // guarantee. `sheetProblem` checks the value regardless, because
                  // convex-test does not apply Convex's own value validation.
                  faces: Number(event.target.value) as HitDice['faces'],
                },
              })
            }
          >
            {HIT_DIE_FACES.map((faces) => (
              <option key={faces} value={faces}>
                d{faces}
              </option>
            ))}
          </NativeSelect>
        </div>
      </SheetField>
      <FieldError message={messageFor('armourClass', 'maxHp', 'hitDice')} />

      <Separator />

      <SheetEntryList
        title="Feats and traits"
        description="The things this character can do that are not spells."
        noun="feat"
        entries={sheet.feats}
        catalogue={FEATS}
        path="feats"
        problem={problem}
        disabled={disabled}
        onChange={(feats) => set({ feats })}
      />

      <SheetEntryList
        title="Spells"
        description="Cantrips through 3rd level. Your copy is yours to change."
        noun="spell"
        entries={sheet.spells}
        catalogue={SPELLS}
        path="spells"
        problem={problem}
        disabled={disabled}
        onChange={(spells) => set({ spells })}
      />
    </div>
  )
}

/**
 * One ability: its score, the modifier that falls out of it, whether the character
 * is proficient in its saving throw, and what that throw comes to.
 *
 * The modifier and the bonus are shown side by side rather than one being inferred
 * from the other, because they differ by the proficiency bonus exactly when the box
 * is ticked — and seeing both is how somebody checks they ticked the right ones.
 */
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
  onScore: (score: number) => void
  onProficient: (proficient: boolean) => void
}) {
  const score = sheet.abilities[ability]

  return (
    <>
      <label htmlFor={`ability-${ability}`} className="truncate text-sm">
        {ABILITY_NAMES[ability]}
      </label>
      <NumberInput
        id={`ability-${ability}`}
        value={score}
        invalid={invalid}
        disabled={disabled}
        onChange={onScore}
      />
      <span className="text-center text-sm tabular-nums">{signed(abilityModifier(score))}</span>
      <span className="flex justify-center">
        <SheetCheckbox
          id={`save-${ability}`}
          label={`Proficient in ${ABILITY_NAMES[ability]} saving throws`}
          checked={sheet.saveProficiencies[ability]}
          disabled={disabled}
          onChange={onProficient}
        />
      </span>
      <span className="text-center text-sm font-medium tabular-nums">
        {signed(savingThrowBonus(sheet, ability))}
      </span>
    </>
  )
}
