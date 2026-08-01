import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The two halves of the character sheet editor's fixed-height column.
 *
 * **Promoted out of the shadcn drawer primitive, and it has now outlived it
 * entirely.** `CharacterSheetEditor` reached for that file's `SheetFooter` — a
 * *drawer* part, from a primitive whose whole opening paragraph was about the two
 * senses of the word "sheet" — because a slide-out drawer was the only place the
 * editor was ever mounted. That drawer went first: the editor's hosts are the tabs of
 * the shell's right-hand panel, which are fixed-height columns already. Then the
 * primitive itself went, once nothing in the application imported it. A layout part
 * borrowed from a host is a part that describes the host rather than the thing being
 * laid out — and this is that argument demonstrated twice over, since what remained
 * after both removals is exactly these two divs.
 *
 * So they are named for what the editor needs — a body and a footer — and the classes
 * are the drawer's unchanged, which is why nothing about the editor moved when its
 * host did. ⚠️ Re-adding the primitive is `npx shadcn add sheet`, and it would arrive
 * with a `SheetFooter` of its own: these two are not a rename of that one, and an
 * editor reaching back into it for a layout part would be the same mistake again.
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
