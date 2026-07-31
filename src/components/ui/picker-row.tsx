import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * One row of a picker: a full-width `<button>` holding a title line and a sentence.
 *
 * The same reasoning `native-select.tsx` gives, one element over. Two pickers — the
 * catalogue of feats, spells and NPC actions, and the bestiary shelf — had each pasted
 * the identical eleven-utility class string, and a row assembled out of that many
 * utilities is exactly the kind of thing that drifts one utility at a time until the two
 * lists visibly disagree about their own hover state. This is the one copy.
 *
 * ⚠️ **Only the row is shared, and deliberately not the dialog around it.** The two flows
 * are genuinely different — one copies a line onto a sheet and stays open, the other
 * selects a creature and then steps its rating before anything is created — so a shared
 * "dialog with a search box and a list" primitive would be an abstraction over the
 * coincidence that both happen to be lists.
 *
 * `selected` is what makes it a toggle: it draws the chosen state *and* sets
 * `aria-pressed`, because a row that looks picked and does not say so is a row a screen
 * reader reads as an ordinary button. Absent means this row is an action rather than a
 * choice, which is the catalogue picker's case, and no `aria-pressed` is then set.
 *
 * The `disabled:` variants are in the shared base rather than passed in by the one caller
 * that disables rows. They are inert for a picker that never does, and having them here
 * means "what a disabled row looks like" is answered once.
 */
export function PickerRow({
  selected,
  className,
  ...props
}: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type="button"
      data-slot="picker-row"
      aria-pressed={selected}
      className={cn(
        'hover:bg-muted focus-visible:ring-ring/50 flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none',
        'disabled:opacity-50 disabled:hover:bg-transparent',
        selected && 'border-primary bg-muted',
        className,
      )}
      {...props}
    />
  )
}
