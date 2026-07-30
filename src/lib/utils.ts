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
 * Shared rather than written out per form for exactly that reason: both callers
 * feed one of those guards, so a divergence here is a NaN — or worse, a zero —
 * reaching a mutation.
 */
export function parseNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw)
}
