import { FieldError } from '@/components/FieldError'
import { AbilityTable } from '@/components/sheet/AbilityTable'
import { DerivedStats } from '@/components/sheet/DerivedStats'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { SkillList } from '@/components/sheet/SkillList'
import { HitDiceField, NumberInput, SheetField } from '@/components/sheet/SheetFields'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FEATS, SPELLS } from '@convex/lib/rules'
import type { PcSheet, SheetProblem } from '@convex/lib/sheet'
import { MAX_CLASS_NAME_LENGTH, messageAtField } from '@convex/lib/sheet'

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
 * **This is now the second way to make a character rather than the only one.** A
 * character built from the library gets `PresetSheetView` instead, and everything on it
 * is read live rather than typed. What this form is still for is the hand-built case
 * the library cannot cover — a hero somebody has brought from another table, or an
 * old character made before the library existed — so it stays a form, and the builder
 * sits above it offering the other route.
 *
 * What is *not* here is as deliberate as what is. No inventory and no conditions:
 * requirements.md excludes both by design rather than by omission, and a field for one
 * of them here is how the reduced rule set stops being reduced. Skills and racial
 * abilities *were* on that list and were taken off it for Milestone 4 (ADR 0006), which
 * is why thirteen skills now appear below and a race does not — a race is a selection
 * made in the builder, and there is no coherent thing for it to mean on a sheet whose
 * numbers were all typed in by hand.
 */
export function PcSheetForm({ sheet, problem, disabled, onChange }: PcSheetFormProps) {
  const set = (patch: Partial<PcSheet>) => onChange({ ...sheet, ...patch })

  // `sheetProblem` returns the *first* problem and names it with a path, so the form
  // marks one field at a time and prints one sentence — the server's own sentence,
  // since the mutation calls the same function to decide whether to throw. `marks`
  // reddens the box; `messageAtField` puts the wording beside the group it belongs
  // to, rather than at the bottom of a column the offending field has scrolled off.
  //
  // The two match differently on purpose. `messageAtField` catches a nested path, so
  // asking about `hitDice` also prints what is wrong with `hitDice.count`; `marks`
  // stays exact, because the group's message goes under the whole group but only the
  // one control that is actually wrong should turn red. Both forms used to carry
  // their own copy of the message matcher and the two had already drifted apart,
  // which is why it now lives beside `sheetProblem` and not here.
  const marks = (path: string) => problem?.path === path

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
      <FieldError message={messageAtField(problem, 'level', 'className')} />

      {/* Shared with the panel a library character gets, so a derived number cannot be
          worked out one way here and another way there — and so that Passive Perception,
          which arrived with the skills below, could not land on only one of them. */}
      <DerivedStats sheet={sheet} />

      <AbilityTable
        sheet={sheet}
        problem={problem}
        disabled={disabled}
        onScores={(abilities) => set({ abilities })}
        onSaves={(saveProficiencies) => set({ saveProficiencies })}
      />

      {/* Ticked by hand, exactly like the saves, and drawn to match them because a
          skill is a saving throw with a different name on it. A library character's
          come from their class and are printed instead. */}
      <SkillList
        sheet={sheet}
        disabled={disabled}
        note="Tick whatever this character is trained in."
        onChange={(skillProficiencies) => set({ skillProficiencies })}
      />

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
      <HitDiceField
        id="pc-hit-dice"
        label="Hit dice the character has"
        hint="What is left to spend is at the top of this panel."
        value={sheet.hitDice}
        invalid={marks('hitDice.count')}
        disabled={disabled}
        onChange={(hitDice) => set({ hitDice })}
      />
      <FieldError message={messageAtField(problem, 'armourClass', 'maxHp', 'hitDice')} />

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
