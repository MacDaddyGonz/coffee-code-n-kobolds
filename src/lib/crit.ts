// How a natural 20 and a natural 1 are coloured and named, in one place, because they
// are drawn twice: as a wash and a shower of sparks over the map, and as a marker on the
// feed row that reports the very same die. This is `health.ts`'s argument applied to the
// crit — a colour chosen on each side is two colours the moment one of them is adjusted,
// and the whole promise of a crit is that the alarm over the map and the line in the feed
// are obviously about the same roll.
//
// Deliberately free of React and Konva imports so either renderer can take it.
//
// ⚠️ **`FeedRow.tsx` asked for exactly this module and this is it.** That component was
// written first and held the two colours and the two words itself, with a note saying they
// *"should move to a shared module the day a second file imports them"* and that
// `health.ts` was the shape to copy. That day arrived within the hour — the announcement
// over the map is the second renderer — so the values moved here and the component imports
// them. The reconciliation was a pure deletion rather than a repaint, because both sides
// were byte-identical on purpose while the two existed side by side.
//
// ⚠️ **The two values are `BAND_COLOUR.healthy` and `BAND_COLOUR.critical`, and that is
// reuse of the app's existing colour vocabulary rather than a coincidence to be tidied
// away.** They are Tailwind's green-500 and red-500, which is also where `AVATAR_TINTS`
// takes its sixteen from. They are *spelled* here rather than imported from `@/lib/health`
// because a hit point band and a critical roll are unrelated facts that happen to agree
// about which red means "bad" — importing one into the other would say that moving a
// health threshold's colour must move the crit alarm's too, which is not true. One
// definition per *meaning* is the rule; `health.ts` and this file are two meanings.

import type { Crit } from '@convex/lib/roll'

/**
 * A crit that actually happened.
 *
 * `Crit` includes `null`, which is the *absence* of one — so a `Record<Crit, …>` would
 * need a colour for "no crit", and there is no such colour. Excluding it here is what
 * makes both records below total without inventing a third entry, and it is what a caller
 * narrows to before it may look anything up.
 */
export type CritKind = Exclude<Crit, null>

/**
 * The colour of the alarm.
 *
 * A `Record` keyed on the union rather than two constants, for the reason
 * `ROLL_MODE_LABELS` is one: a third member of `Crit` fails to compile here instead of
 * rendering a wash with no colour in it.
 *
 * Private, because `critColour` below is the question every caller actually has —
 * `FEED_PART_LABELS` and `partLabel` in `convex/lib/roll.ts` are the same pair for the same
 * reason. Nothing outside this file needs a total record over the two crits that happened;
 * what the three renderers have in hand is a `Crit`, which includes the third case.
 */
const CRIT_COLOUR: Record<CritKind, string> = {
  success: '#22c55e',
  failure: '#ef4444',
}

/**
 * The colour for a crit, or `null` when the roll was ordinary.
 *
 * ⚠️ **Here rather than in each renderer, which is this file's own header instruction
 * applied a second time.** The narrowing was written out three times — once as a private
 * function in `FeedRow.tsx`, twice inline in `RollAnnouncement.tsx` and once more in
 * `CritEffect.tsx` — because `CRIT_COLOUR` is deliberately total over the two crits that
 * *happened* and every caller holds a `Crit`, which includes the absence of one. Three
 * copies of one `=== null` test is the shape this module was created to remove.
 *
 * `null` and not a third colour: there is no colour for "not a crit", and a caller that
 * wants the ordinary ink says so itself — `colour ?? undefined` on a style property is the
 * spelling that inherits it.
 */
export function critColour(crit: Crit): string | null {
  return crit === null ? null : CRIT_COLOUR[crit]
}

/**
 * What to call it in words.
 *
 * **Two signals for one fact, which is `FeedRow.tsx`'s argument for its own copy of this and
 * is just as true over the map:** about one reader in twelve cannot tell that red from that
 * green, and a wash that is merely a different colour tells them nothing at all.
 *
 * ⚠️ **It is also the half of the crit that survives `prefers-reduced-motion`, which is why
 * it is a constant and not a string in a component.** The shake, the pulse and the
 * fireworks are all motion and are all suppressed for a reader who has asked for less of
 * it — but somebody who has asked for less motion still needs to know they rolled a 20,
 * so the announcement over the map prints this beside the total in both modes and it is
 * the guarantee that the information survives. See `CritEffect.tsx` for the rest of the
 * substitution.
 *
 * Not a sentence, and not the feed's wording: `rollSentence` owns the English that
 * describes *what somebody did*, and this describes *how the die landed*, which is the
 * one fact that sentence deliberately does not carry.
 */
export const CRIT_LABEL: Record<CritKind, string> = {
  success: 'Critical hit!',
  failure: 'Critical miss!',
}
