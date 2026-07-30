import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Is this element one that a keystroke belongs to rather than to a shortcut?
 *
 * Single-character shortcuts — `f`, `0`, `-`, and space — are all things somebody
 * might be trying to type, so every keyboard handler on the board needs this
 * question answered. One list of element types, because two lists drift: an
 * element type added to one and not the other is a shortcut that fires while a DM
 * is typing in the field it was added for.
 *
 * `buttons` is the deliberate difference between the two callers, and it is a
 * genuine disagreement rather than an oversight. A focused button treats space as
 * a click, so the space-pan modifier must leave it alone; but `f` on a focused Fit
 * button should still fit, because a button ignores every other key the board
 * binds. Which element to ask about differs too — the event's target for a key
 * the handler might swallow, `document.activeElement` for one it merely reads —
 * so that choice stays with the caller.
 */
export function isTypingElement(
  element: EventTarget | null,
  options: { buttons: boolean },
): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (options.buttons && element instanceof HTMLButtonElement)
  )
}

/**
 * A number field's value, where empty means empty rather than zero.
 *
 * `Number('')` is 0, which sails through every range check — so a blank grid field
 * would store a square zero pixels wide, and dividing by it hands `Infinity` to
 * the position table on the first drag. NaN is the honest answer for a blank
 * field, and the `isUsable*` guards in `@convex/lib/grid` refuse it.
 *
 * A true minus sign (U+2212) is read as a hyphen before parsing, and that is not
 * politeness about typography — it is a character this application itself puts on
 * the screen. `signed` prints every derived modifier as `−1`, and `sheetProblem`
 * words the initiative bounds with the same character, so the obvious thing for
 * somebody to do with a number they can see is copy it into the one field that takes
 * a negative one: an NPC's initiative bonus. `Number('−3')` is NaN, so without this
 * the paste lands as an empty box and the form reddens a field over a value that
 * looks perfectly correct.
 *
 * Shared rather than written out per form for exactly that reason: the callers feed
 * one of those guards or `sheetProblem`, so a divergence here is a NaN — or worse, a
 * zero — reaching a mutation. The sheet forms had grown a second copy of this that
 * had the minus sign and the grid fields did not, which is the drift in miniature.
 */
export function parseNumber(raw: string): number {
  const text = raw.trim().replace('−', '-')
  return text === '' ? Number.NaN : Number(text)
}
