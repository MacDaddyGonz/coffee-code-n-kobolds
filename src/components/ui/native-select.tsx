import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * A plain `<select>`, dressed to match `Input`.
 *
 * There is no select primitive in this shadcn set — `LobbyAssignDialog` says the
 * same thing and works around it with a list of rows — and three call sites had
 * each pasted their own copy of the class string, which had already drifted apart
 * on height and text size. This is the one copy.
 *
 * Deliberately the native element and not a Radix listbox. Milestone 5 owns the
 * real DM panel and will want a proper combobox for scenes; until then a native
 * select is keyboard-accessible, screen-reader-correct and free.
 *
 * The default height matches `Input` so a select sits level with a text field in
 * the same row. The compact bars pass `h-7` to sit level with their own controls
 * instead, which is a layout decision belonging to the row, not to this.
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input h-8 rounded-lg border bg-transparent px-2 text-sm outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  )
}
