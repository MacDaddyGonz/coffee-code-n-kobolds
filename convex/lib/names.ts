import { ConvexError } from 'convex/values'

import { collapseWhitespace } from './codes'

/**
 * Trims, collapses whitespace, and **rejects** anything blank or over-length
 * rather than truncating it.
 *
 * Rejecting rather than slicing matters for three reasons:
 *
 * 1. A truncated display name is an identity collision. `nameKey` is how a seat
 *    is found, so two players whose names differ only past the cut-off would
 *    land on one seat and the second would silently inherit the first's
 *    character. The identity key is meant to be forgiving about the same person,
 *    never about different people.
 * 2. `String.prototype.slice` counts UTF-16 code units, so cutting mid-emoji
 *    leaves a lone surrogate. Convex requires stored strings to be valid Unicode,
 *    and convex-test does not enforce that — so it would pass locally and fail
 *    against a real deployment.
 * 3. `trim()` before a slice can still leave a trailing space, which quietly
 *    breaks the normalisation contract this function exists to provide.
 *
 * The client sets `maxLength` from the same constants, so a rejection is
 * unreachable through the UI and only fires for input that would corrupt data.
 */
export function requireText(
  raw: string,
  options: { max: number; blank: string; tooLong: string },
): string {
  const value = collapseWhitespace(raw)
  if (!value) {
    throw new ConvexError({ kind: 'BadInput', message: options.blank })
  }
  // UTF-16 length, matching the HTML maxLength the client applies, so the two
  // agree exactly on where the limit is.
  if (value.length > options.max) {
    throw new ConvexError({ kind: 'BadInput', message: options.tooLong })
  }
  return value
}
