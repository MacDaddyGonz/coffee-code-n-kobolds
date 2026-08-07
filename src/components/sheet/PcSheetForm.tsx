import { FieldError } from '@/components/FieldError'
import {
  HitDiceField,
  NumberInput,
  SheetField,
  marksField,
} from '@/components/sheet/SheetFields'
import { Input } from '@/components/ui/input'
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
 * THE FIVE NUMBERS A HAND-BUILT HERO STORES AND NOTHING ELSE DERIVES: level, class name,
 * armour class, maximum hit points and the hit-dice complement.
 *
 * ⚠️ **This used to be the whole hand-built sheet and is now one block of the Build pane**,
 * which is the shape the sub-tabs forced and the shape that was always right. The six
 * ability scores, the eighteen skills, the derived row, the feats and the spells all used to
 * be rendered here *and again*, separately, in the panel a library character got — two
 * assemblies of one sheet, which is exactly how Passive Perception nearly landed on only one
 * of them. They are now `AbilityBlock`, `PlayPane` and `SpellsPane`, drawn once for both
 * kinds, and what is left here is the part that genuinely differs: on a hand-built sheet
 * these five are typed, and on a library one they are read live out of the corpus and the
 * DM overrides them through `PresetNumbers`.
 *
 * **Every derived number in the application comes out of convex/lib/sheet.ts** and none of
 * the arithmetic is repeated in any component. That module is shared with the Convex
 * functions through the `@convex/…` alias for exactly this reason: a modifier the form works
 * out and a modifier the server works out have to be the same number. The same goes for the
 * bounds — this form does not know that a level stops at 20, it asks `sheetProblem`, which
 * is the same function `characters.updateSheet` throws from.
 *
 * A hand-built sheet is still supported on purpose — a hero brought from another table, or
 * one made before the library existed — which is why the builder sits above this offering the
 * other route rather than replacing it.
 */
export function PcSheetForm({ sheet, problem, disabled, onChange }: PcSheetFormProps) {
  const set = (patch: Partial<PcSheet>) => onChange({ ...sheet, ...patch })

  // `sheetProblem` returns the *first* problem and names it with a path, so the form marks
  // one field at a time and prints one sentence — the server's own sentence. `marks`
  // reddens the box; `messageAtField` puts the wording beside the group it belongs to. The
  // two match differently on purpose and `marksField` carries that note: `messageAtField`
  // catches a nested path, so asking about `hitDice` also prints what is wrong with
  // `hitDice.count`, while the mark stays exact because only the one control that is
  // actually wrong should turn red.
  const marks = (path: string) => marksField(problem, path)

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">This character’s own numbers</h3>
        <p className="text-muted-foreground text-xs">
          Typed in rather than read from the library. Building from the library above
          replaces every one of them.
        </p>
      </div>

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

      {/* The full complement, and the caption says so, because the panel shows a second
          hit-dice number — how many are left to spend — in the pinned header and again on
          the Play pane. Two bare `5`s and `3`s under the same word would read as a
          contradiction, so each caption names what it is and points at the other. This one
          is part of the build and changes when the character levels; that one is state and
          changes when they rest. */}
      <HitDiceField
        id="pc-hit-dice"
        label="Hit dice the character has"
        hint="What is left to spend is at the top of this panel, and on the Play tab."
        value={sheet.hitDice}
        invalid={marks('hitDice.count')}
        disabled={disabled}
        onChange={(hitDice) => set({ hitDice })}
      />
      <FieldError message={messageAtField(problem, 'armourClass', 'maxHp', 'hitDice')} />
    </section>
  )
}
