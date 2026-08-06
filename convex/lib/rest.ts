// THE TWO RESTS, AND THE SHAPE OF A THING THAT COMES BACK AFTER ONE. Shared verbatim by
// the Convex functions and the browser, like lib/grid.ts, lib/limits.ts, lib/layers.ts and
// lib/markers.ts, and for the same reason: a rest the two sides each spell for themselves
// is two vocabularies, and the one that loses is the button that stops restoring anything.
//
// ⚠️ **One union does two jobs here, and that is the decision rather than an economy.**
// `RestKind` is both *which rest was taken* and *the shortest rest that fully restores this
// resource*. Two unions with the same two members would compile and would need a function to
// convert between them, and the day somebody adds a third period to one of them — a turn, a
// recharge on 5–6, a dawn — the two would disagree about what a rest even is. `restores`
// below is the one place the two readings meet, and its whole body is that meeting.
//
// ⚠️ **Nothing here adjudicates anything.** A rest is a button somebody presses, not a state
// the application enters: no clock runs, nothing checks that eight hours have passed, nothing
// refuses a second short rest, and no roll anywhere consults a rest. What this module gives
// is the arithmetic of *how much of a counter comes back*, which is the same register as
// `spentPerRest` remembering whether Rage has been used — the app counts, and the table
// adjudicates.
//
// Deliberately free of any corpus import, and it must stay that way: every function here runs
// in the browser, so a specifier naming `lib/library/` or `lib/bestiary/` would be refused by
// `bundleGuard.test.ts` and `corpusGuard.test.ts` alike.

import { v } from 'convex/values'

/**
 * The two rests, **shortest first**, spelled once.
 *
 * The order is load-bearing in the mild way `TOKEN_LAYERS`' is: a control that offers both
 * iterates this array, and *short* before *long* is the order they appear on a character
 * sheet and the order of increasing generosity. It also makes the `restores` table below read
 * downward — a resource whose recharge sits at or before the rest taken comes back.
 *
 * ⚠️ **There is deliberately no third member and adding one is not a small change.** 2024 has
 * effects that recharge on a *turn*, on a roll of 5–6, and at *dawn*; every one of them would
 * be a legitimate fourth thing for a sheet to say and every one of them breaks the sentence
 * *"the shortest rest that fully restores it"*, because a dawn is not a rest anybody takes.
 * The two here are the two the SRD's own class tables are written in terms of at levels 1–5.
 */
export const REST_KINDS = ['short', 'long'] as const
export type RestKind = (typeof REST_KINDS)[number]

/**
 * The same two members as a Convex validator, **hand-spelled rather than derived from the
 * array above**, on the convention `tokenLayerValidator` and `tokenMarkerValidator` both
 * state at length.
 *
 * A generated `v.union(...REST_KINDS.map(v.literal))` would make the two agree by
 * construction, which sounds strictly better and removes the only guard that catches the
 * dangerous direction. Every refusal in this file fires when a member is added to
 * `REST_KINDS`; none of them fires when a literal is added to the *validator* alone — and
 * that is the failure that matters here, because this validator is inside
 * `sheetEntryValidator`, so the schema would accept and store a recharge period that
 * `restores` has never heard of and `REST_LABELS` cannot name. `lib/rest.test.ts` pins the
 * two against each other for membership and order.
 */
export const restKindValidator = v.union(v.literal('short'), v.literal('long'))

/**
 * What the button says, and the sentence under it.
 *
 * One record rather than two, for `TOKEN_LAYER_LABELS`' reason: two records make a third
 * member fail to compile in two files, and whichever is fixed first looks finished.
 *
 * ⚠️ **Both rests read their wording out of here, and that is a correction rather than
 * tidiness.** `HitDiceControls` shipped a button labelled *"Long rest"* that only returned
 * hit dice, and it read as broken the first time somebody pressed it at 1 hit point — the
 * label promised the thing the button did not do. The short rest is the same trap pointing
 * the other way: it **does not heal and does not return hit dice**, because *spending* hit
 * dice is what a short rest is for, and a control that said "Short rest" and silently healed
 * nobody would be read as broken by exactly the same person. So the explanation is beside the
 * label, in the one place both controls read from.
 */
export const REST_LABELS: Record<RestKind, { label: string; explanation: string }> = {
  short: {
    label: 'Short rest',
    explanation:
      'An hour of catching your breath. Spend hit dice to heal — nothing is healed for you — and anything that comes back on a short rest comes back.',
  },
  long: {
    label: 'Long rest',
    explanation:
      'A night of it. Hit points to full, every hit die back, and everything spent is unspent.',
  },
}

/**
 * DOES A REST OF THIS KIND FULLY RESTORE A RESOURCE THAT RECHARGES ON THAT ONE?
 *
 * The one place the union's two readings meet: `recharge` is *the shortest rest that fully
 * restores it* and `taken` is *the rest somebody just pressed*. A short-rest resource comes
 * back on either; a long-rest resource comes back only on a long rest.
 *
 * ⚠️ **The `never` arm here is FAIL-CONSERVATIVE and not fail-closed, and the difference is
 * worth reading before anybody "fixes" it to match `isMonsterSheet`.** That function's runtime
 * default is `true` because it guards a secret and being wrong publishes a dragon. **Nothing
 * here guards anything.** The two costs are: restoring too little, which is one click on a
 * counter the sheet lets anybody edit directly; and restoring too much, which is the
 * application handing out a resource nobody asked for, silently, on a screen the whole table
 * is reading. The second is worse, so an unrecognised period restores nothing — and that is a
 * judgement about which mistake a person can see and undo, not about secrecy.
 *
 * The compile-time refusal is the real guard, exactly as it is for `rollShapeOf`: a third
 * member of `REST_KINDS` fails `npm run lint` here and again at `REST_LABELS` above, so the
 * question gets asked before anything ships. The runtime `return` is for the branch the
 * compiler cannot see — a row written by a newer deployment during a non-atomic schema push.
 */
export function restores(recharge: RestKind, taken: RestKind): boolean {
  switch (recharge) {
    case 'short':
      // Any rest at all is at least a short one.
      return true
    case 'long':
      return taken === 'long'
    default: {
      const unknownRecharge: never = recharge
      void unknownRecharge
      return false
    }
  }
}

/**
 * The largest number of uses one thing on a sheet may have.
 *
 * Twenty, which is past everything the SRD's levels 1–5 contain by a wide margin — a level 5
 * Monk has five Focus Points, a level 5 Sorcerer five Sorcery Points, and the largest pool in
 * range is smaller than a hero's hit dice. It is a guard against a non-finite float64 and an
 * absurd stored count rather than the rules policing themselves, in the spirit `MIN_SPEED`
 * and `MAX_ATTACK_BONUS` are written in.
 */
export const MAX_RESOURCE_USES = 20

/**
 * A LIMITED-USE THING ON A SHEET: how many, what brings them back, and how many the shorter
 * rest hands over.
 *
 * ⚠️ **This REVERSES the absorbed character-resources milestone's design, on the record.**
 * That milestone decided a feature which *partially* recovers on a short rest would be written
 * as long-rest-only, deliberately, on the grounds that expressing it needs an *amount* as well
 * as a period — *"which turns a boolean into a number and a comparison into arithmetic"*. That
 * was a defensible reduction against a corpus where the pattern appeared once.
 *
 * In 2024 it is **the normal case**. Second Wind, Wild Shape and the superiority-style pools
 * all read *"regain one expended use on a short rest, all on a long rest"*, so writing them
 * long-rest-only would under-restore most of the martial classes at every short rest in the
 * game — which is not a conservative error, it is the application quietly making the Fighter
 * worse than the book says. The direction-of-error argument that milestone made is unchanged
 * and is still the safety net in `restores` above; it is no longer the design.
 *
 * The three fields, and why each is spelled the way it is:
 *
 * - **`max` — absent, never zero.** The field is optional on `sheetEntryValidator`, so an
 *   entry with nothing to count simply has no `uses` object at all; a `uses` present with a
 *   `max` of 0 is a thing that exists and can never be used, which is not a state any sheet
 *   wants and `entriesProblem` refuses. That is the absorbed milestone's rule, kept verbatim.
 * - **`recharge` — the SHORTEST rest that fully restores it**, which is what makes one union
 *   serve both readings. Not *"the rest it recharges on"*, which is ambiguous about whether a
 *   long rest also returns a short-rest resource: it does, and the wording is what says so.
 * - **`regainOnShortRest` — optional, and only meaningful on a long-rest resource.** A
 *   short-rest resource already comes back in full, so a partial hand-back beside it is two
 *   rules that contradict each other, and `entriesProblem` refuses that pairing the same way
 *   it refuses a to-hit on a passive.
 *
 * ⚠️ **Nothing here spends anything and nothing here refuses a cast.** The count is a tally a
 * person keeps; no mutation checks it before a roll, no entry is greyed out at zero by the
 * server, and nothing decides that a spent resource means an ability cannot be used. That is
 * the same line the whole application draws: it announces and counts, and the table
 * adjudicates.
 */
export const resourceValidator = v.object({
  max: v.number(),
  recharge: restKindValidator,
  regainOnShortRest: v.optional(v.number()),
})
export type Resource = {
  max: number
  recharge: RestKind
  regainOnShortRest?: number
}
