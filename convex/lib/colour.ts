/**
 * WHAT COUNTS AS A COLOUR ANYWHERE IN THIS APPLICATION.
 *
 * One module because there are now two callers, and the second one is the reason this
 * file exists rather than a second `const`. `TINT_PATTERN` lived module-private inside
 * `convex/board.ts` and was correct there for as long as a token's tint was the only
 * colour a person could choose. A scene's background is the second, and a regex copied
 * into `convex/scenes.ts` would be two copies that agreed on the day they were written —
 * exactly what `requireTokenAppearance`'s own docblock argues against one function up
 * ("One constant, not two copies that agreed once").
 *
 * ⚠️ **The strictness is a guard and not tidiness, and it matters more here than it did
 * for a coin.** The value is handed straight to a Konva fill or a CSS `background-color`,
 * so anything the browser interprets is a string chosen by whoever runs the game and then
 * rendered on every other player's screen. A `url(...)`, a CSS colour function, an
 * `image-set()` — none of them is a colour, and the scene case paints the entire viewport
 * rather than a disc twenty pixels across.
 *
 * **Shared with the browser deliberately**, like `lib/layers.ts` and `lib/markers.ts` and
 * for the same reason: the client's `<input type="color">` cannot produce anything but
 * `#rrggbb`, so the check is unreachable by typing — and it is still the server that
 * refuses, because a client is not what enforces anything (CLAUDE.md invariant 6's rule,
 * applied to a string instead of a byte count). There is no arithmetic here, no randomness
 * and nothing secret, so nothing in `bundleGuard.test.ts` has any reason to keep it out.
 */

/**
 * `#rrggbb`, and nothing else.
 *
 * Six digits rather than also accepting the three-digit shorthand: `<input type="color">`
 * emits the long form, so the short one would be a spelling nothing in this application
 * produces and every reader would then have to normalise before comparing two colours.
 */
export const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i

/**
 * What is wrong with this colour, or `null`.
 *
 * A *problem* function rather than a boolean predicate, which is `rollProblem`'s shape and
 * is what lets a form print the same sentence the mutation would have refused with. The
 * caller supplies the subject, because "Pick a colour for the token" and "Pick a
 * background colour for the map" are the two sentences that exist and neither is a good
 * default for the other.
 */
export function colourProblem(value: string, subject: string): string | null {
  return COLOUR_PATTERN.test(value) ? null : `Pick a ${subject}.`
}
