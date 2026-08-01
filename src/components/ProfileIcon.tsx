import type { ReactElement } from 'react'

import { initialsOf, readableInk, tintForName } from '@/lib/avatar'
import { cn } from '@/lib/utils'

type ProfileIconProps = {
  name: string
  size?: 'sm' | 'md'
  className?: string
}

/** The two sizes anything has wanted so far: beside a line of text, and on its own. */
const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'size-6 text-[0.625rem]',
  md: 'size-10 text-sm',
}

/**
 * A seat's icon: a tinted disc with one or two initials, generated from the display
 * name rather than uploaded.
 *
 * It is the HTML half of what `TokenCoin` draws in Konva, and both take their colour
 * and their letters from `@/lib/avatar` so that the same person is the same disc
 * wherever they appear — the header, the roster, and the game feed when it lands.
 * Costing nothing against the 1 GB storage ceiling (CLAUDE.md invariant 6) and
 * needing no upload UI, no cropping and no moderation is the whole reason it is
 * generated; real pictures are a library feature and belong with the other
 * upload-backed libraries.
 *
 * **`aria-hidden`, deliberately.** It is decorative in every position it appears in,
 * because the name it stands for is always either printed beside it or carried in
 * the tooltip of the control it sits inside. An `aria-label` here would be a screen
 * reader announcing the same name twice in a row, which is noise rather than
 * information — the icon is a faster way to recognise a name you can already read,
 * not a second way to find out what it is.
 */
export function ProfileIcon({ name, size = 'md', className }: ProfileIconProps): ReactElement {
  const tint = tintForName(name)

  return (
    <span
      aria-hidden
      // Inline, because the tint is one of sixteen values chosen at runtime and
      // Tailwind cannot generate a class for a colour it never sees in the source.
      style={{ backgroundColor: tint, color: readableInk(tint) }}
      className={cn(
        'rounded-full inline-flex shrink-0 select-none items-center justify-center font-semibold ring-1 ring-black/10',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
