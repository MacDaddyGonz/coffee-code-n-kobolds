import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, parseNumber } from '@/lib/utils'

// The small controls the two sheet forms are built out of.
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
 * change. `abilityModifier`, `savingThrowBonus` and `SPEED_FEET` in convex/lib/sheet.ts
 * are the definitions, and this only prints what they return.
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
 * A derived modifier as a person writes one: `+2`, `−1`, `+0`.
 *
 * A true minus sign rather than a hyphen, matching the wording `sheetProblem`
 * already uses for the initiative bounds.
 */
export function signed(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`
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
