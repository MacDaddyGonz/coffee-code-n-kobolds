import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The two halves of the character sheet editor's fixed-height column.
 *
 * **Promoted out of `ui/sheet.tsx`, which opens with a warning against exactly the
 * import that used to be here.** `CharacterSheetEditor` reached for `SheetFooter` —
 * a *drawer* part, in a file whose first paragraph is about the two senses of the
 * word "sheet" — because a slide-out drawer was the only place the editor was ever
 * mounted. That drawer has since gone: the editor's hosts are the tabs of the shell's
 * right-hand panel, which are fixed-height columns already. A layout part borrowed from
 * a host is a part that describes the host rather than the thing being laid out, and
 * the borrowed one has now outlived the host it was borrowed from — which is the
 * argument, demonstrated.
 *
 * So they are named for what the editor needs — a body and a footer — and the classes
 * are unchanged. `ui/sheet.tsx` keeps its own `SheetFooter`; this is not a rename of
 * that one.
 */

/**
 * The scrolling half. `flex-1` claims what is left of the column and `min-h-0` is
 * what lets it scroll rather than push the footer off the bottom — the same link in
 * the same chain the shell documents, arriving from a component that has no idea
 * which column it is in.
 */
export function EditorBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4', className)}
      {...props}
    />
  )
}

/**
 * The pinned half. Sticks to the bottom edge rather than scrolling away with the
 * content, because a form this tall has its Save button below the fold on any screen
 * otherwise — and a control you have to scroll to find is one people assume is
 * missing.
 */
export function EditorFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-muted/50 mt-auto flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
