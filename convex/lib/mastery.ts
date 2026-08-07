// THE WEAPON MASTERY VOCABULARY — the eight properties a 2024 weapon can carry, and
// nothing else. Shared verbatim by the Convex functions and the browser, like lib/grid.ts,
// lib/limits.ts, lib/layers.ts and lib/markers.ts, and for the same reason: a mastery the
// two sides each spell for themselves is two vocabularies, and the one that loses is the
// word that stops appearing on the weapon.
//
// ⚠️ **THIS IS THE ONE 2024 FEATURE THAT LANDS ON A STANDING EXCLUSION, and what ships is a
// word.** Three of the eight are movement-detriment effects by any reading: **Push** shoves a
// creature 10 feet, **Slow** reduces its Speed by 10, and **Topple** knocks it Prone.
// docs/requirements.md excludes *"movement-detriment status effects (prone, stand up,
// difficult terrain, etc.)"* and that exclusion **still stands**. Nothing shoves anybody,
// nothing halves a speed, nothing sets Prone, no drag is refused, no roll consults a mastery,
// and no health band is computed from one. A mastery is the word printed on a weapon entry so
// the people at the table can see it, and the table adjudicates it exactly as it would if
// somebody had read it off the page.
//
// That is the same register as a condition pip in lib/markers.ts, a creature's loot being a
// line of text, and a spell's casting time being printed and never counted — and it is the
// sixth time this project has drawn that line.
//
// ⚠️ **The promise is a GUARD TEST rather than a comment**: `convex/masteryGuard.test.ts`
// greps `convex/` for a quoted module specifier naming this module and fails if anything
// outside lib/sheet.ts imports it. That is what makes the paragraph above a promise instead
// of an intention — a comment saying "nothing reads a mastery" is true until the commit that
// makes it false, and this one fails the build on that commit.
//
// ⚠️ **The module the guard exists to keep out is `convex/lib/dice.ts`**, and that is not a
// hypothetical. The way this exclusion breaks is somebody writing three reasonable lines
// there — *if the weapon has Vex, roll the next attack with advantage* — which is a small,
// correct-looking change that turns an announcement into an adjudication, on the one module
// CLAUDE.md invariant 10 exists to keep the browser out of. A comment in that file would not
// stop them. `markerGuard.test.ts` names the same module for the same reason.
//
// ⚠️ **There is no `never`-arm switch anywhere in this file, and that is honest rather than
// lazy.** CLAUDE.md invariant 9 asks a new union for an allow-list switch — and there is **no
// predicate here**, because nothing decides anything from a mastery, which is the entire point
// of the paragraphs above. A switch written to satisfy the rule would be a guard that cannot
// fail, which is precisely what ADR 0012 argued out of `fogRects`' leak-guard entry; and it
// would also make this the first module in `convex/` to *read* a mastery, so the guard test
// would have to grant it an exemption. The rule would eat the promise it was invoked to
// protect. lib/markers.ts reached exactly this conclusion first and the reasoning transfers
// without amendment.
//
// What the invariant protects is met two other ways, each of which *can* fail:
// `WEAPON_MASTERY_LABELS` below is a `Record<WeaponMastery, string>` and fails to compile for
// a ninth member; and `lib/mastery.test.ts` pins the validator's members **and their order**
// against the list, which is the direction the compiler cannot see.

import { v } from 'convex/values'

/**
 * The eight mastery properties, **alphabetically**, spelled once.
 *
 * Every one of the SRD's 38 weapons carries exactly one of these, and a Fighter unlocks three
 * of them at level 1 — so the list is closed by the rules rather than by this application's
 * taste, and a ninth member would mean the SRD had changed.
 *
 * The order is load-bearing in the way `TOKEN_MARKERS`' is: it is what a picker offers and
 * the order a reader scans, so a ninth member appended rather than inserted alphabetically
 * reorders a control somebody has learned the shape of. `lib/mastery.test.ts` asserts both
 * the order and the alphabetisation for that reason.
 *
 * ⚠️ **These are the SRD's own words, in its own spelling, and three of them describe effects
 * this application deliberately does not implement.** `push`, `slow` and `topple` are named
 * by requirements.md's movement-detriment exclusion; they are here as *labels* and that is the
 * whole of it. See the header, and the amendment in docs/requirements.md, which exists
 * precisely because the exclusion names the exact effects these words describe — an
 * unrecorded near-miss is indistinguishable from a quiet lifting.
 */
export const WEAPON_MASTERIES = [
  'cleave',
  'graze',
  'nick',
  'push',
  'sap',
  'slow',
  'topple',
  'vex',
] as const
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number]

/**
 * The same eight members as a Convex validator, **hand-spelled rather than derived from the
 * array above**, and the duplication is deliberate — `lib/layers.ts` and `lib/markers.ts`
 * both make this argument and it transfers without amendment.
 *
 * A generated `v.union(...WEAPON_MASTERIES.map(v.literal))` would make the two agree by
 * construction, which sounds strictly better and removes the only guard that catches the
 * dangerous direction. Every refusal in this file and on the client fires when a member is
 * added to `WEAPON_MASTERIES`; none of them fires when a literal is added to the *validator*
 * alone — and that is the failure that matters, because this validator is inside
 * `sheetEntryValidator`, so the schema would accept and store a mastery nothing can label or
 * draw. `lib/mastery.test.ts` pins the two against each other for membership and order.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it can still repeat in —
 * see the docblock on it in lib/sheet.ts.
 */
export const weaponMasteryValidator = v.union(
  v.literal('cleave'),
  v.literal('graze'),
  v.literal('nick'),
  v.literal('push'),
  v.literal('sap'),
  v.literal('slow'),
  v.literal('topple'),
  v.literal('vex'),
)

/**
 * What the sheet calls each one. One record, not several, for the reason
 * `TOKEN_MARKER_LABELS` and `TOKEN_LAYER_LABELS` both give: two records make a ninth member
 * fail to compile in two files, and whichever is fixed first looks finished.
 *
 * ⚠️ **The word and nothing more, which is the same decision `TOKEN_MARKER_LABELS` made.**
 * There is deliberately no sentence here describing what Topple *does* — the mechanical
 * effect belongs to the rulebook on the table, and a tooltip in `convex/` explaining that a
 * creature is knocked Prone would be the first sentence in this codebase implying that
 * something here does it. A DM who wants to know what Vex means looks it up, exactly as they
 * would for a condition.
 */
export const WEAPON_MASTERY_LABELS: Record<WeaponMastery, string> = {
  cleave: 'Cleave',
  graze: 'Graze',
  nick: 'Nick',
  push: 'Push',
  sap: 'Sap',
  slow: 'Slow',
  topple: 'Topple',
  vex: 'Vex',
}
