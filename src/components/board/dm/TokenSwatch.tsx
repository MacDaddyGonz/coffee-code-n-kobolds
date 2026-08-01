import type { ReactElement } from 'react'

import { initialsOf, readableInk } from '@/lib/avatar'
import { cn } from '@/lib/utils'

/**
 * The two sizes a coin has wanted so far: beside a line of text in the DM's list, and
 * beside a file field in the editor.
 *
 * ⚠️ **`ProfileIcon` has a constant of the same name and these are not its values**, which
 * is worth saying because the shared name reads like a shared vocabulary and there is none:
 * a coin is a picture of a creature and is drawn a step larger than a seat's generated
 * initials at both sizes. Changing one of the four numbers to match the other file would
 * make one of the two lists wrong.
 */
const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'size-8 text-[0.625rem]',
  md: 'size-12 text-sm',
}

export type TokenSwatchProps = {
  /** For the initials on an art-less coin. Never announced — see the `alt=""` below. */
  name: string
  /** `#rrggbb`, validated server-side by `TINT_PATTERN` before it was stored. */
  tint: string
  /** The signed storage URL off `publicTokenValidator`, or null when there is none. */
  artUrl: string | null
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A token as it looks on the board, drawn small in HTML.
 *
 * **`ProfileIcon`'s cousin, and the difference between them is the whole reason this
 * exists rather than reusing it.** That one is a *generated* identity: a disc whose tint
 * and letters are both a function of a display name, so the same person is the same disc
 * everywhere (`@/lib/avatar`). A token's tint is not generated — the DM picked it out of a
 * colour input — and its art is an upload. So the two components share the letters and the
 * ink calculation and disagree about where the colour comes from, which is one prop rather
 * than a variant of `ProfileIcon` that ignores the argument it is named for.
 *
 * It is the second HTML half of what `TokenCoin` draws in Konva, and it is deliberately
 * not a second set of rules: art wins over tint, the tint shows through when there is no
 * art, and the initials come from `initialsOf` — the same three decisions that component
 * makes, so a row in the DM's list is recognisably the coin they will find on the map.
 * What it does **not** copy is the size: a coin is `sizeSquares` squares across in image
 * space, which is meaningless in a list, so the number is printed beside this instead.
 *
 * **`alt=""` and no `aria-label`**, for `ProfileIcon`'s stated reason: the name is always
 * printed beside it, and a second announcement of the same word is noise rather than
 * information. The swatch is a faster way to recognise a name you can already read.
 */
export function TokenSwatch({
  name,
  tint,
  artUrl,
  size = 'sm',
  className,
}: TokenSwatchProps): ReactElement {
  return (
    <span
      // Inline, because a stored `#rrggbb` is a colour Tailwind never sees in the source
      // and so can never generate a class for — the same reason `ProfileIcon` does it.
      // `borderColor` as well as the fill, so an art-bearing coin still shows its ring:
      // on the board the tint is the ring when there is art, and the ring is how a DM
      // tells three goblins with the same portrait apart.
      style={{ backgroundColor: tint, color: readableInk(tint), borderColor: tint }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-semibold select-none',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {artUrl === null ? (
        initialsOf(name)
      ) : (
        // An `<img>` rather than a `background-image`, deliberately. A signed storage URL
        // is a server-minted string, but interpolating any URL into a CSS `url(...)` is a
        // habit that only has to be wrong once, and `object-cover` is the same `cover`
        // fit `TokenCoin`'s fill pattern computes by hand.
        //
        // ⚠️ **`loading="lazy"` matters here rather than being a habit.** The DM's token
        // list is a `max-h-64` scroll box showing about four rows, so a game with sixty
        // coins would otherwise fetch sixty signed URLs and decode sixty images the moment
        // the tab is opened — and some of them are genuinely cold, because this list
        // deliberately includes the DM-layer coins and the ones on no scene, which Konva
        // has never drawn. `decoding="async"` keeps the decode of the ones that *are* in
        // view off the frame that reveals the tab.
        <img
          src={artUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )}
    </span>
  )
}
