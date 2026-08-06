import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * `Input`'s multi-line sibling, with the same border, focus ring and disabled treatment.
 *
 * The first thing in this application a person types a *paragraph* into: every other field
 * holds a name, a colour or a dice expression. It is here rather than inline in the one
 * component that needs it for the reason the rest of this directory exists — a second
 * multi-line field would otherwise copy the class list and diverge from this one by a ring
 * colour on the first theme change.
 *
 * `field-sizing-content` grows the box with what is in it up to `max-h`, so a one-line note
 * is one line tall and a page of prep scrolls rather than pushing the map list off screen.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
