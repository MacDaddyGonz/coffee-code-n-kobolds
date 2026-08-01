// How a name is drawn as a coin, in one place, because it is drawn twice: as Konva
// shapes above a token on the canvas and as HTML in the header and the seat roster.
// This is `health.ts`'s argument applied to identity — a tint chosen on each side is
// two tints the moment one of them is adjusted, and the whole promise of a generated
// icon is that the same person is the same disc on every screen at the table.
//
// Deliberately free of React and Konva imports so both renderers can take it.

import { nameKeyFor } from '@convex/lib/codes'

/**
 * The tints a generated icon may be, and a fixed list rather than a hue computed
 * from a hash.
 *
 * `hsl(hash % 360, 65%, 45%)` looks like 360 answers and is nothing of the sort,
 * because perceived hue is not uniform: everything from about 45° to 160° reads
 * "greenish", and the blues are a wide band of one colour too. So the pair that
 * collides is exactly the pair nobody can tell apart on a 40-pixel disc — the
 * arithmetic spreads the numbers evenly and the eye does not. A list also lets the
 * ink be checked by eye once, here, instead of being a claim about every hue.
 *
 * These are Tailwind's 500s, and four of them are already `BAND_COLOUR` in
 * `@/lib/health` — this is the app's existing colour vocabulary rather than a
 * second one invented beside it.
 */
export const AVATAR_TINTS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
]

/**
 * FNV-1a, 32 bits. Small, dependency-free and well spread over short ASCII strings,
 * which is all this needs — nothing here is a security question.
 *
 * `Math.imul` is load-bearing and not a micro-optimisation. A plain `*` on the FNV
 * prime promotes to a double, and past 2^53 the low bits are silently rounded away
 * — so the avalanche stops working and the result starts depending mostly on the
 * input's *length*, clustering short names onto neighbouring tints. Short names are
 * precisely the input this has. `Math.imul` does the multiply as int32 with wrapping,
 * which is what FNV is defined over.
 */
function hash32(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  // `>>> 0` back to unsigned: the imul above leaves a signed int32, and a negative
  // remainder would index off the front of the list.
  return hash >>> 0
}

/**
 * The tint for a display name.
 *
 * Keyed on `nameKeyFor` and not on the display name itself, because `Mike`, `mike`
 * and ` Mike ` are **one seat** server-side (ADR 0003). They must therefore be one
 * disc: a player fixing their own capitalisation lands back on the same seat holding
 * the same character, and a colour that changed under them there would be a change
 * with no explanation anybody could give.
 *
 * **Collision-freedom is not claimed.** Sixteen tints and six seats is about a 66%
 * chance that some pair shares a colour, and thirty-two tints only gets that to 39%
 * while making the tints themselves harder to tell apart at 40px — so the extra
 * sixteen buy a smaller number and a worse screen. The identity is the *pair* (tint,
 * initials), with the display name as the third leg in the tooltip; two seats sharing
 * a tint are still two different sets of letters.
 *
 * Two alternatives rejected:
 *
 * - **De-duplicating within a game** — walk the roster, hand out unused tints. It
 *   makes the tint a function of who else is in the game, so somebody leaving
 *   recolours everybody who was after them. It is also not available at half the call
 *   sites: the header knows one name, and the game feed will know one name per line.
 * - **Letting the DM pick a colour.** That is an uploaded-picture feature wearing a
 *   smaller hat, and it belongs with the other upload-backed libraries.
 *
 * **Determinism from the name alone beats collision-freedom**, and that is not a
 * preference — it is the acceptance criterion, which asks for the same colour on
 * every screen.
 */
export function tintForName(name: string): string {
  return AVATAR_TINTS[hash32(nameKeyFor(name)) % AVATAR_TINTS.length]
}

/** Up to two initials for an art-less coin. Split by code point, so an emoji name survives. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * Ink that can be read on the tint. The server already validates a tint as
 * `#rrggbb`, so the guards here are only for a value that arrived some other way —
 * a preview in the DM's panel with a half-typed colour in it.
 *
 * There is now a second caller whose input this very module generates, so on that
 * path the guards can never fire and are belt-and-braces. They are still
 * load-bearing on the first one, which is the DM's half-typed colour picker — worth
 * writing down, because a reader who arrives from the profile icon sees dead code
 * and deletes it.
 */
export function readableInk(tint: string): string {
  const hex = tint.replace('#', '')
  if (hex.length !== 6) return '#ffffff'

  const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((pair) =>
    Number.parseInt(pair, 16),
  )
  if (channels.some((channel) => Number.isNaN(channel))) return '#ffffff'

  // Rec. 601 luma, which is close enough for a two-way choice and needs no gamma.
  const [red, green, blue] = channels as [number, number, number]
  const luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luma > 0.6 ? '#111111' : '#ffffff'
}
