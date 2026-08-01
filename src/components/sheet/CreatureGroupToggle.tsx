import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { CreatureGroup } from '@convex/lib/sheet'
import { CREATURE_GROUPS, CREATURE_GROUP_CHOICES } from '@convex/lib/sheet'

export type CreatureGroupToggleProps = {
  value: CreatureGroup
  onChange: (group: CreatureGroup) => void
  disabled?: boolean
}

/**
 * WHICH OF THE DM'S LISTS A CREATURE SITS UNDER, as a row of buttons.
 *
 * Drawn by both screens that ask the question: the create dialogs, through
 * `CreatureSheetFields`, and the full sheet editor, through `CreatureSheetForm`. Those
 * two had a hand-written NPC button and a hand-written Monster button each — same
 * variants, same `aria-pressed`, same two-column grid, and two wordings of one sentence
 * about innkeepers and owlbears that had already drifted apart.
 *
 * ⚠️ **The buttons are iterated out of `CREATURE_GROUPS` rather than written out**, which
 * is the whole reason this component exists rather than being a tidier copy of either. Two
 * buttons in JSX is the formulation where a third group compiles, passes, ships, and is
 * **unselectable in both dialogs and in the editor** — stored, counted, and with no
 * control to reach it. That is CLAUDE.md invariant 9 one type down, and it is the rule
 * ADR 0009 applied to `CHARACTER_GROUPS` and its sibling here did not get. The labels and
 * the examples live in `CREATURE_GROUP_CHOICES` beside the union, so a third member is a
 * missing key the compiler asks about.
 *
 * Nothing about secrecy turns on the answer — both values are DM-only, and a player is
 * sent neither — so a wrong one is a row under the wrong heading and never a published
 * stat block. `creatureGroupOf` carries that argument in full. It is what makes a default
 * safe here at all; compare the token dialog's layer control a few fields above one of
 * these, where the two answers differ by whether an ambush survives, and which is why that
 * one has an alert under it and this has a sentence.
 *
 * `useId` rather than a fixed id, for the reason `CreatureSheetFields` gives at more
 * length: both call sites can be mounted at once — the sheet editor is in the pane while a
 * create dialog is open over it — and two groups labelled by the same element is a label
 * pointing at the wrong control.
 *
 * The caption asks *which list* rather than "is this an NPC or a monster?", which is what
 * one of the two copies said. A question naming its answers is a third thing to fix when
 * the union grows, and the sentence below already names them — from the record, so it
 * grows on its own.
 */
export function CreatureGroupToggle({ value, onChange, disabled }: CreatureGroupToggleProps) {
  const labelId = useId()

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label id={labelId}>Which list</Label>
      {/* Buttons rather than a select, matching the layer control the token dialog draws
          above this one: a choice between a handful of things reads better as those things
          than as a list with all but one of them hidden.

          `flex` with `basis-0 flex-1` rather than `grid-cols-2`, because a column count is
          the two spelled a third time — the members would grow and the grid would not. */}
      <div role="group" aria-labelledby={labelId} className="flex max-w-md flex-wrap gap-2">
        {CREATURE_GROUPS.map((group) => (
          <Button
            key={group}
            type="button"
            className="basis-0 flex-1"
            variant={value === group ? 'default' : 'outline'}
            aria-pressed={value === group}
            disabled={disabled}
            onClick={() => onChange(group)}
          >
            {CREATURE_GROUP_CHOICES[group].label}
          </Button>
        ))}
      </div>
      {/* One sentence joined from the record rather than written out, so a third group
          brings its own clause. "No creature reaches a player" rather than "neither",
          which is the two hard-coded into the prose. */}
      <p className="text-muted-foreground text-xs">
        Which heading it sits under in your sheet list —{' '}
        {CREATURE_GROUPS.map((group) => CREATURE_GROUP_CHOICES[group].hint).join(', ')}. No
        creature reaches a player whichever you pick, and it can be moved later from its own
        sheet.
      </p>
    </div>
  )
}
