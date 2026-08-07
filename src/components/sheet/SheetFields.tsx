import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn, parseNumber } from '@/lib/utils'
import { findTag } from '@convex/lib/creatures'
import type { HitDice, SheetProblem } from '@convex/lib/sheet'
import { HIT_DIE_FACES, SPEED_FEET } from '@convex/lib/sheet'

// The small controls the two sheet forms are built out of, and the handful of pure
// functions that decide how a shared field *reads*.
//
// They live together because each of them is a decision rather than a wrapper, and
// the decisions are the same one three times over: this shadcn set has no checkbox,
// no textarea and no numeric input, so a form either grows its own or drags in a
// primitive nobody else uses. `ui/native-select.tsx` already took this position for
// `<select>` and gave the reasoning — a native element is keyboard-accessible,
// screen-reader-correct and free, and the pasted class strings had already drifted
// apart across three call sites before it existed. These are the same answer for the
// other three elements, kept out of `ui/` because they are shaped for this form
// rather than for the design system.

/**
 * A labelled block: caption above, control below, and room for a message.
 *
 * The label is a real `<label for>` rather than an `aria-label`, because a sheet is
 * a form somebody fills in with the keyboard and clicking the word "Armour class"
 * ought to put the cursor in the box.
 */
export function SheetField({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

/**
 * A number the character sheet stores, shown read-only because the rules work it
 * out. Initiative, speed and every saving-throw bonus arrive here.
 *
 * Rendered as text and not as a disabled input, deliberately. A greyed-out box reads
 * as "you may not edit this yet", which invites somebody to go looking for the
 * permission that would unlock it; there is none, because there is nothing stored to
 * change. `abilityModifier`, `savingThrowBonus`, `speedOf` and `passivePerception` in
 * convex/lib/ are the definitions, and this only prints what they return.
 *
 * It also draws a number that *is* stored but that this reader has no way to change —
 * a library character's armour class on a player's screen. The rendering argument
 * carries across unchanged: there is no control to grey out, because for that reader
 * there is no control. `AbilityBlock` makes the same choice one field at a time.
 */
export function DerivedStat({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="font-heading text-base leading-none font-medium tabular-nums">
        {value}
      </span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

/**
 * The tinted row a set of `DerivedStat`s is printed in.
 *
 * Four columns, wrapping onto as many rows as the contents need — a hero has four
 * numbers and a creature has seven, and both want the same box rather than the same
 * count. It exists because the class string was spelled out twice, in the hero's derived
 * row and in the creature statline, and a tinted panel assembled out of five utilities is
 * exactly the kind of thing that drifts one utility at a time. `HitDiceField` above
 * carries the same argument at more length.
 */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="bg-muted/40 grid grid-cols-4 gap-3 rounded-lg border p-3">{children}</div>
}

export type NumberInputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type'
> & {
  value: number
  onChange: (value: number) => void
  /** Marks the field `aria-invalid`, which the Input styles pick up. */
  invalid?: boolean
}

/**
 * A number field that lets you empty it.
 *
 * Not `type="number"`. A spinner has no way to say "this box is empty" that is
 * distinct from zero — clearing one hands the form the empty string, and a form that
 * silently reads that as `0` is a form that quietly sets somebody's armour class to
 * nothing while they are half way through typing 18. The shared validator already
 * has the right answer for an empty box: `Number.isInteger(NaN)` is false, so
 * `sheetProblem` returns "Armour class has to be a whole number from 0 to 40" and
 * Save is disabled with the server's own wording. So an empty box parses to `NaN`
 * and is allowed to sit there being invalid. `HpControls` avoids the spinner too,
 * for its own separate reason.
 *
 * The state below is the fiddly part and is worth the fifteen lines. The draft holds
 * the *number*, this input holds the *text*, and the two disagree whenever what has
 * been typed is not yet a number — "", "-", "1e". So the text follows the prop only
 * when the prop moved for some reason other than this input: a save landing, or the
 * server pushing an edit somebody else made. Without that test, typing a minus sign
 * would round-trip through `NaN` and erase itself, and clearing the box would
 * refill it with the old value under the cursor.
 *
 * Setting state during render is React's own documented alternative to an effect
 * for exactly this — deriving state from a prop — and it re-renders before anything
 * is committed to the DOM rather than flashing the stale value for a frame.
 */
export function NumberInput({ value, onChange, invalid, className, ...rest }: NumberInputProps) {
  const [text, setText] = useState(() => formatNumber(value))
  const [echoed, setEchoed] = useState(value)

  if (!Object.is(echoed, value)) {
    setEchoed(value)
    setText(formatNumber(value))
  }

  return (
    <Input
      // The same choice `HpControls` makes, and it matters more here: this panel
      // sits over a board where the arrow keys nudge the selected token.
      inputMode="numeric"
      aria-invalid={invalid || undefined}
      className={cn('text-center tabular-nums', className)}
      value={text}
      onChange={(event) => {
        const next = event.target.value
        const parsed = parseNumber(next)
        setText(next)
        // Recorded *before* the parent is told, so the sync above sees its own
        // value coming back and leaves the typed text alone.
        setEchoed(parsed)
        onChange(parsed)
      }}
      onFocus={(event) => event.target.select()}
      {...rest}
    />
  )
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

/**
 * `n × d8` — a count and a die size, as one field.
 *
 * Both sheets that hold hit dice draw this: the hand-built form, where it is part of
 * the build somebody types, and the override panel, where the DM sets it over the
 * library's. That is two callers rather than three or four, which is normally under
 * the bar for extracting anything — but the two copies were byte-for-byte identical
 * apart from the width of the count box, and one of them had already drifted from
 * `w-16` to `w-14` with nobody able to say which was intended. A control assembled
 * out of three primitives is exactly the kind of thing that drifts one class at a
 * time, and this file's whole reason for existing is that the sheet forms stop
 * assembling their own.
 *
 * The cast is narrowing a `<select>`'s string back to the four literals its own
 * options were built from, rather than asserting anything the list does not already
 * guarantee. It is checked anyway: `sheetProblem` re-tests the faces against
 * `HIT_DIE_FACES`, because convex-test does not apply Convex's own value validation
 * to stored documents and a limit only the client applies is a limit a client bug
 * removes.
 */
export function HitDiceField({
  id,
  label,
  hint,
  value,
  invalid,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: ReactNode
  value: HitDice
  /** Marks the count box, which is the only half of this that can be out of range. */
  invalid?: boolean
  disabled?: boolean
  onChange: (hitDice: HitDice) => void
}) {
  return (
    <SheetField id={id} label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <NumberInput
          id={id}
          className="w-16"
          value={value.count}
          invalid={invalid}
          disabled={disabled}
          onChange={(count) => onChange({ ...value, count })}
        />
        <span className="text-muted-foreground">×</span>
        <NativeSelect
          aria-label="Hit die size"
          value={String(value.faces)}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, faces: Number(event.target.value) as HitDice['faces'] })
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
  )
}

/**
 * What goes under a speed: `the usual`, or how this one differs from it.
 *
 * Three screens print a speed — a hero's derived row, a hand-built monster's form and a
 * creature's statline — and until this existed the first two spelled the comparison out
 * separately while the third printed the bare number with nothing beside it. Three
 * spellings of one sentence is two chances to disagree about what 20 feet means.
 *
 * It says *faster or slower than the usual number* rather than naming a cause, and that
 * is the whole of what can honestly be claimed here. Speed used to be a constant, on the
 * grounds that a character whose speed differs is one the rules say cannot exist; then
 * the Goliath arrived at 45 and the bestiary gave a Dire Wolf 50 and a Zombie 20. Which
 * of species, lineage, entry or override moved it is *not on the wire* — the resolved
 * sheet carries one number with all four already folded in, and telling them apart would
 * mean shipping the corpora to the browser. So this compares against `SPEED_FEET`, which
 * is the one thing it can see, and the DM's own mark in `PresetNumbers` is where "you
 * changed this" is said.
 *
 * ⚠️ **This is the one client surface that reads that constant, and it was the visible
 * cost of the constant being stale.** While `SPEED_FEET` said 35 and the nine species
 * printed 30, every character in the game was captioned *slower than the usual 35* —
 * mis-captioning almost the whole party, on the screen the caption exists to reassure.
 * The migration commit moved it to 30, and the Goliath's 35 now reads *faster* as it
 * should.
 */
export function speedHint(speed: number): string {
  if (speed === SPEED_FEET) return 'the usual'
  return `${speed > SPEED_FEET ? 'faster' : 'slower'} than the usual ${SPEED_FEET}`
}

/**
 * Whether this exact field is the one thing `sheetProblem` is complaining about.
 *
 * ⚠️ **It belongs beside `messageAtField` and `problemAtEntry` in convex/lib/sheet.ts**,
 * which exist precisely so that no consumer takes a `SheetProblem` apart itself — and it
 * lives here only because the change that pulled the four hand-written copies together
 * did not own that file. Moving it there is a one-line follow-up and the call sites do
 * not change.
 *
 * Exact, unlike `messageAtField`, and the two match differently on purpose: the group's
 * *message* goes under the whole group, so asking about `hitDice` should also print what
 * is wrong with `hitDice.count`, whereas only the one control that is actually wrong
 * should turn red.
 */
export function marksField(problem: SheetProblem | null | undefined, path: string): boolean {
  return problem?.path === path
}

/**
 * A tag's long name, falling back to the key itself.
 *
 * `findTag` already tolerates a key the vocabulary has since retired, and gives the
 * reason: a tag key is *stored*, on every entry in the corpus, so removing one must leave
 * everything that named it readable. This adds the other half — a chip labelled with the
 * bare key still filters correctly, whereas one labelled `undefined` is a control nobody
 * will touch again.
 *
 * Beside `findTag` itself would be the right home, for the reason above; it is here so
 * that the picker's chips and the creature sheet's badges cannot come to disagree, which
 * is the failure that mattered.
 */
export function tagName(key: string): string {
  return findTag(key)?.name ?? key
}

/**
 * A checkbox with a caption. Native, per the note at the top of this file.
 *
 * `accent-color` is what makes a native box take the theme's own colour in both
 * light and dark, and is the whole reason a bare checkbox is presentable here.
 */
export function SheetCheckbox({
  id,
  label,
  checked,
  disabled,
  onChange,
  className,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <input
      id={id}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className={cn(
        'accent-primary size-4 cursor-pointer rounded-sm',
        'focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none',
        className,
      )}
    />
  )
}

/**
 * A multi-line field, dressed to match `Input`.
 *
 * Multi-line and not a text box, because `normaliseSheet` trims an entry's
 * description but deliberately does **not** collapse its line breaks — a two-part
 * spell is meant to stay in two parts. A single-line control here would make that
 * carefully preserved structure impossible to type in the first place.
 */
export function SheetTextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="sheet-textarea"
      className={cn(
        'border-input min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm',
        'placeholder:text-muted-foreground outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3',
        'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  )
}
