import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ColourFieldProps = {
  /** The label above the swatch. `Colour`, `Background colour` — the caller's words. */
  label: string
  /** Always `#rrggbb`: it is what the control emits and what the server accepts. */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /**
   * The sentence under the swatch saying what this colour paints. Optional because not
   * every colour needs explaining, and never defaulted — a generic hint is the thing that
   * gets copied and then means nothing on the third screen.
   */
  hint?: ReactNode
}

/**
 * A colour swatch with a label and, usually, a sentence about what it paints.
 *
 * ⚠️ **A component because there are two of these now, and the first one had already
 * drifted.** `TokenAppearanceFields`' own docblock records what happened when the coin's
 * name/size/colour block existed twice: *"the same labels, the same `tabular-nums`, the
 * same `h-8 px-1 py-1` on the colour input… and the two copies had already drifted inside
 * a single milestone."* A scene's background is the second colour a person picks in this
 * application, so writing that markup out a third time is repeating an experiment whose
 * result is already written down one file over.
 *
 * The `h-8 px-1 py-1` is the whole reason this is worth extracting rather than left as
 * three lines of JSX. A bare `<Input type="color">` inherits the text field's padding and
 * draws a postage stamp inside a box four times its size; those three utilities are the
 * fix, they are not obvious, and they are exactly the sort of thing a second copy gets
 * wrong. There is no validation here at all, deliberately — the control cannot emit
 * anything but `#rrggbb`, and what enforces that is the server (`colourProblem` in
 * `convex/lib/colour.ts`), not this.
 */
export function ColourField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: ColourFieldProps): ReactElement {
  const fieldId = useId()

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 px-1 py-1"
        disabled={disabled}
      />
      {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
