import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'

import { ColourField } from '@/components/ui/colour-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNumber } from '@/lib/utils'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'
import { MAX_TOKEN_SQUARES, MIN_TOKEN_SQUARES, isUsableTokenSize } from '@convex/lib/grid'

/**
 * What a DM types about how a coin looks.
 *
 * `size` is a **string** and not a number, because that is what an `<input type="number">`
 * holds: a half-deleted field is `''` and has to stay `''` rather than becoming a 0 the DM
 * has to delete again. `parseNumber` is applied at the two edges — by the predicate below,
 * and by each caller as it submits.
 */
export type TokenAppearanceDraft = { name: string; size: string; tint: string }

/**
 * Whether these three fields are worth sending.
 *
 * The same two checks `requireTokenAppearance` runs server-side, in the same order, as a
 * courtesy rather than as the enforcement. The tint needs none of its own, because a
 * colour input cannot produce anything but `#rrggbb`.
 */
export function isUsableAppearance(draft: TokenAppearanceDraft): boolean {
  return draft.name.trim() !== '' && isUsableTokenSize(parseNumber(draft.size))
}

/**
 * A coin's name, size and colour: the three fields the DM may set when a token is created
 * and change afterwards, in one component so that they cannot stop being the same three.
 *
 * ⚠️ **This is the client half of `requireTokenAppearance`'s argument.** The server
 * hoisted that helper precisely so the sizes a DM may *create* and may *change to* are one
 * set validated in one place; the browser had done the opposite and written the fields out
 * twice — the same labels, the same `tabular-nums`, the same `h-8 px-1 py-1` on the colour
 * input, the same `MIN`/`MAX_TOKEN_SQUARES` — and the two copies had already drifted inside
 * a single milestone, disagreeing about the size hint and about whether the colour field
 * had one at all. Two spellings of "up to eight squares" is one edit away from two
 * different answers to what a legal coin is.
 *
 * The **hints are here rather than at each caller**, which is the whole of the drift that
 * was found: there is one true sentence about what a size means and one about what the
 * tint paints, and a form that owns the input owns the sentence explaining it. What stays
 * with the caller is anything about *its own* act — the dialog's placeholder, the editor's
 * Save-button status line, and both layer alerts.
 *
 * `children` is the one arrangement concession: the dialog puts *Who can see it* between
 * the name and the numbers and the editor does not, and a slot is cheaper than two
 * components or a reordered dialog. It is where `LayerChoice` goes for the caller that
 * wants it there.
 */
export function TokenAppearanceFields({
  draft,
  onChange,
  disabled,
  namePlaceholder,
  children,
}: {
  draft: TokenAppearanceDraft
  /** Absolute over all three, so a caller holds one piece of state rather than three. */
  onChange: (next: TokenAppearanceDraft) => void
  disabled: boolean
  /** The dialog's `Goblin archer`. Absent where the field already holds a stored name. */
  namePlaceholder?: string
  /** Whatever belongs between the name and the numbers — see the note above. */
  children?: ReactNode
}): ReactElement {
  // Not a literal: the editor can be mounted while the add dialog is open behind it, and
  // two name inputs sharing an id is a label that focuses the wrong control.
  const fieldId = useId()

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-name`}>Name</Label>
        <Input
          id={`${fieldId}-name`}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          // The character-name limit, because a token names a creature and the server
          // borrows the same constant rather than inventing a fourth one.
          maxLength={MAX_CHARACTER_NAME_LENGTH}
          autoComplete="off"
          placeholder={namePlaceholder}
          disabled={disabled}
        />
      </div>

      {children}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-size`}>Size in squares</Label>
          <Input
            id={`${fieldId}-size`}
            type="number"
            min={MIN_TOKEN_SQUARES}
            max={MAX_TOKEN_SQUARES}
            step={1}
            value={draft.size}
            onChange={(event) => onChange({ ...draft, size: event.target.value })}
            className="tabular-nums"
            disabled={disabled}
          />
          <p className="text-muted-foreground text-xs">
            1 square for a person, 2 for an ogre, up to {MAX_TOKEN_SQUARES}.
          </p>
        </div>
        {/* `ColourField` rather than the swatch written out here, now that a scene's
            background is a second colour somebody picks. The hint stays with this caller
            because it is a sentence about a *coin* — which is this file's own rule about
            what belongs to the form and what belongs to the field. */}
        <ColourField
          label="Colour"
          value={draft.tint}
          onChange={(tint) => onChange({ ...draft, tint })}
          disabled={disabled}
          hint="The coin's colour, and its ring when it has art."
        />
      </div>
    </>
  )
}
