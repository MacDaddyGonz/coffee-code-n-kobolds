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
 *
 * Module-private, deliberately. `colourProblem` below is the whole interface — a caller
 * with the pattern in hand is a caller that can write its own refusal message, and the
 * message is the half that has to stay in one place.
 */
const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i

/** What the colour is for, which is the only part of the sentence a caller chooses. */
export type ColourSubject = 'token' | 'map background'

/**
 * What is wrong with this colour, or `null`.
 *
 * A *problem* function rather than a boolean predicate, which is `rollProblem`'s shape and
 * is what lets a form print the same sentence the mutation would have refused with.
 *
 * ⚠️ **A two-member union rather than a free string, and this module owns the sentence.**
 * The first version took the subject as a fragment — callers passed
 * `'colour for the token'` and `'background colour for the map'` to be interpolated into
 * `Pick a ${subject}.` — which put the user-facing copy in `convex/board.ts` and
 * `convex/scenes.ts` rather than in the module that decided the refusal. Two consequences:
 * the wording could be reworded per call site and drift, and a caller passing something
 * capitalised or plural produced ungrammatical output with nothing to object.
 *
 * **The message names the format**, which the fragment version never did. `rollProblem`
 * quotes the offending string and shows an accepted shape; a refusal that says only *pick a
 * colour* tells somebody debugging a hand-written client nothing at all.
 */
export function colourProblem(value: string, subject: ColourSubject): string | null {
  if (COLOUR_PATTERN.test(value)) return null
  const what = subject === 'token' ? 'the token' : 'the map background'
  return `Pick a colour for ${what}, written like #4f46e5.`
}
