import { RotateCcw } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import {
  DerivedStat,
  HitDiceField,
  NumberInput,
  SheetField,
  marksField,
} from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PcSheet, PresetOverrides, SheetProblem } from '@convex/lib/sheet'
import { messageAtField, speedOf, withoutUndefined } from '@convex/lib/sheet'

export type PresetNumbersProps = {
  /**
   * The sheet as it currently stands: the library's numbers with the race applied and
   * the *draft* overrides on top, so a field the DM is halfway through typing is
   * already reflected everywhere else on the panel.
   */
  sheet: PcSheet
  overrides: PresetOverrides | undefined
  problem: SheetProblem | null
  disabled?: boolean
  /** Absent means the numbers are printed rather than typed in. Players get no handle. */
  onChange?: (overrides: PresetOverrides | undefined) => void
}

/**
 * The stored numbers on a character built from the library, and the DM's thumb on the
 * scale.
 *
 * **A player sees only the armour class here**, and that is not a permission being
 * applied — it is that everything else in this block already appears somewhere better
 * on the same panel. Maximum hit points are the right-hand half of `20/45` at the top,
 * and the hit dice complement is the `/5` beside it. Printing either a second time in
 * a box captioned differently is how `HitDiceControls` describes going wrong, and its
 * comment is worth taking twice.
 *
 * The DM gets the four an override exists for, because "the DM can always change a
 * player's sheet" has to stay literally true against a character whose stats are read
 * live out of the library. An override survives a level-up by design — bumping a
 * boss-fight armour class should not be undone by the DM awarding a level five minutes
 * later — which is exactly why each one is marked and why there is a way back to the
 * library value. A field with no mark on it is one nobody has touched.
 *
 * ⚠️ **What is deliberately not shown is which number the library would have given.**
 * The server sends the resolved sheet, and resolution has already folded the override
 * in; the original is not on the wire and could only be recovered by shipping the 72
 * stat blocks to the browser, which is the one thing `lib/library/` is kept out of `src/`
 * to prevent. So a mark says "you changed this" rather than "this was 15", and the
 * reset button is how a DM finds out what it was.
 */
export function PresetNumbers({
  sheet,
  overrides,
  problem,
  disabled,
  onChange,
}: PresetNumbersProps) {
  if (!onChange) {
    return (
      <div className="bg-muted/40 rounded-lg border p-3">
        <DerivedStat label="Armour class" value={String(sheet.armourClass)} />
      </div>
    )
  }

  const set = (patch: Partial<PresetOverrides>) => onChange(merge(overrides, patch))
  const marks = (path: string) => marksField(problem, path)

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Your changes to this character</h3>
        <p className="text-muted-foreground text-xs">
          Anything you set here wins over the library and stays put when the character
          levels up. Everything else moves with them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SheetField
          id="preset-ac"
          label="Armour class"
          hint={
            <OverrideMark
              overridden={overrides?.armourClass !== undefined}
              disabled={disabled}
              onReset={() => set({ armourClass: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-ac"
            value={sheet.armourClass}
            invalid={marks('armourClass')}
            disabled={disabled}
            onChange={(armourClass) => set({ armourClass })}
          />
        </SheetField>

        <SheetField
          id="preset-max-hp"
          label="Maximum hit points"
          hint={
            <OverrideMark
              overridden={overrides?.maxHp !== undefined}
              disabled={disabled}
              onReset={() => set({ maxHp: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-max-hp"
            value={sheet.maxHp}
            invalid={marks('maxHp')}
            disabled={disabled}
            onChange={(maxHp) => set({ maxHp })}
          />
        </SheetField>

        <SheetField
          id="preset-speed"
          label="Speed (feet)"
          hint={
            <OverrideMark
              overridden={overrides?.speed !== undefined}
              disabled={disabled}
              onReset={() => set({ speed: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-speed"
            value={speedOf(sheet)}
            disabled={disabled}
            // Emptying the box drops the override rather than storing the `NaN` an
            // empty numeric field produces. Speed is the one number here with no bound
            // in `sheetProblem` to catch that on the way past, and clearing a field to
            // mean "go back to what it was" is the same thing the reset button does —
            // so it does the same thing rather than quietly writing a value that would
            // read back as 35 anyway.
            onChange={(speed) => set({ speed: Number.isFinite(speed) ? speed : undefined })}
          />
        </SheetField>

        <HitDiceField
          id="preset-hit-dice"
          label="Hit dice"
          hint={
            <OverrideMark
              overridden={overrides?.hitDice !== undefined}
              disabled={disabled}
              onReset={() => set({ hitDice: undefined })}
            />
          }
          value={sheet.hitDice}
          invalid={marks('hitDice.count')}
          disabled={disabled}
          onChange={(hitDice) => set({ hitDice })}
        />
      </div>

      <FieldError message={messageAtField(problem, 'armourClass', 'maxHp', 'hitDice')} />
    </section>
  )
}

/**
 * Whether a field is the corpus's or the DM's, and the way back.
 *
 * Exported because the ability scores are overridden through `AbilityBlock` — they are
 * shown to everybody and merely become editable for the DM, rather than living in the
 * block above — and one mark drawn two ways is one mark that could come to mean two
 * things. A creature's statline draws it seven times, through `OverrideNumberField`
 * below.
 *
 * `source` names where the unoverridden value came from, because there are two shelves
 * now: a hero's numbers come from the premade library and a creature's from the bestiary,
 * and a DM told "from the library" about an Owlbear would reasonably go looking for the
 * Owlbear in the character builder. It is a word rather than a flag so the two call sites
 * read as the sentences they produce.
 */
export function OverrideMark({
  overridden,
  disabled,
  source = 'library',
  onReset,
}: {
  overridden: boolean
  disabled?: boolean
  source?: string
  onReset: () => void
}) {
  if (!overridden) {
    return <span className="text-muted-foreground text-xs">from the {source}</span>
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">yours</Badge>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcw />
        Use the {source}’s
      </Button>
    </span>
  )
}

/**
 * One overridable number: the caption, the box, the mark and the way back.
 *
 * **Written for the creature statline, where seven of these are identical**, and
 * deliberately not used by the four fields above it. That is not inconsistency; it is
 * where the line falls. Each of the hero's four genuinely differs — speed's `onChange`
 * drops the override rather than storing the `NaN` an empty box produces, hit dice is a
 * different control altogether — so folding them into a table would mean a table with an
 * exception per row. The creature's seven get *identical* treatment, and seven uniform
 * repeats is well past the point where writing each one out stops being clearer than
 * writing it once.
 *
 * What the table buys is the thing longhand cannot: each of those seven named its
 * override key **three** times, in the mark's test, the reset patch and the change patch,
 * plus once more for the error path and twice for the element ids, with nothing checking
 * that the six agreed. Pairing the save-DC key with the passive-perception row compiled,
 * rendered, and reset the wrong field. Driven from one row of a table, they cannot
 * disagree.
 *
 * `value` takes the null a genuinely absent number arrives as and passes `NaN` to the
 * box, which `NumberInput` draws as empty — see the note on the statline about why an
 * emptied box drops the override rather than storing that `NaN`.
 */
export function OverrideNumberField({
  id,
  label,
  value,
  overridden,
  invalid,
  disabled,
  source,
  onChange,
  onReset,
}: {
  id: string
  label: string
  /** Null for a number the corpus never recorded. Drawn as an empty box. */
  value: number | null
  overridden: boolean
  invalid?: boolean
  disabled?: boolean
  source?: string
  onChange: (value: number) => void
  onReset: () => void
}) {
  return (
    <SheetField
      id={id}
      label={label}
      hint={
        <OverrideMark
          overridden={overridden}
          disabled={disabled}
          onReset={onReset}
          source={source}
        />
      }
    >
      <NumberInput
        id={id}
        value={value ?? Number.NaN}
        invalid={invalid}
        disabled={disabled}
        onChange={onChange}
      />
    </SheetField>
  )
}

/**
 * Merge a patch into an override set, dropping anything set back to absent — and the
 * way a field is *reset*, since "use the library's" is a patch of `undefined`.
 *
 * Exported because `CharacterSheetEditor` resets the ability scores, which are overridden
 * through `AbilityBlock` on the Build pane rather than through the block above. It had grown its own
 * `without(overrides, key)` doing the identical two things, which is one drop-the-key
 * rule in two places for a panel with exactly one of each.
 *
 * **Generic over the override set rather than tied to a hero's**, because a creature
 * taken from the bestiary has one of its own — a different list of fields, and the
 * identical two rules about absence. `CreatureSheetView` calls this with a
 * `BestiaryOverrides`. Nothing in here reads a field name, so there was never anything
 * to specialise; a second copy would only have been a second place for the collapse
 * below to be forgotten.
 *
 * The dropping itself is `withoutUndefined`, shared with the server, and is not
 * tidiness. `undefined` is not a Convex value, so an object carrying
 * `armourClass: undefined` is a *different write* from one that omits the key — a
 * class of bug convex-test does not catch, because it does not apply Convex's own
 * value validation.
 *
 * An empty result collapses to `undefined` rather than to `{}`, for that same reason
 * and for one more. `applyPresetPermissions` does **not** compare the override set
 * before against the override set after — an earlier version did, with
 * `JSON.stringify`, and was removed because it refused a no-op edit — so nothing on
 * the server depends on this. What does depend on it is `CharacterSheetEditor`'s
 * dirty check, which serialises the draft against what the server last sent: a
 * character nobody has overridden holds no `overrides` field at all, so a DM who sets
 * an armour class and then presses "Use the library's" has to arrive back at a draft
 * that is byte-identical to the saved one, or the footer reads "Unsaved changes"
 * against a sheet that has none.
 */
export function merge<T extends object>(overrides: T | undefined, patch: Partial<T>): T | undefined {
  const merged = withoutUndefined({ ...overrides, ...patch } as T)
  return Object.keys(merged).length === 0 ? undefined : merged
}
