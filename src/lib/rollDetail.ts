// What a feed row says about *where the roll came from*, as opposed to what it came out as.
//
// `@convex/lib/roll.ts` owns the sentence — who did what, in one generated line, shared with
// the server so the announcement over the map and the line in the panel cannot disagree.
// This module owns the small print underneath it: which kind of entry was pressed, and at
// what spell level. That is deliberately on this side of the wire, because none of it is a
// fact the server decides — it is two labels read off facts the row already carries, and
// putting them in `lib/roll.ts` would grow the browser-shared vocabulary for the benefit of
// two client renderers.
//
// ⚠️ **Nothing here computes a roll, and nothing here compares one to anything.** The
// arithmetic and the randomness are in `convex/lib/dice.ts`, which `bundleGuard.test.ts`
// forbids this bundle from importing at all (CLAUDE.md invariant 10). What arrives is a
// result the server decided; what leaves is a caption for it.

import type { FeedSubject } from '@convex/lib/roll'
import type { SheetEntryCategory } from '@convex/lib/sheet'

/**
 * What to call a category when it is describing **one entry** rather than heading a list of
 * them.
 *
 * ⚠️ **A third `Record` over this union, and it is the same argument
 * `SHEET_ENTRY_ROLL_LABELS` already makes for being the second.** The one in lib/sheet.ts is
 * `SHEET_ENTRY_CATEGORY_LABELS` and it says `Weapons`, `Actions`, `Passives` — those are
 * *section headings on a sheet*, and the plural is correct there and wrong here: a feed row
 * about a greataxe captioned `Weapons` reads as a category of things rather than as what
 * this one was. Reusing it would be one fewer table and a word that is wrong on every row.
 *
 * It earns the same compile-time refusal as the other two: a fourth category fails
 * `npm run lint` here rather than printing an empty caption, which is CLAUDE.md invariant
 * 9's rule at the place a wrong answer does its (small) damage.
 *
 * It lives on this side of the wire because it is a *client* caption — nothing on the server
 * prints it, and growing the browser-shared vocabulary in lib/roll.ts for the benefit of two
 * renderers is what that module's header argues against.
 */
const FEED_CATEGORY_LABELS: Record<SheetEntryCategory, string> = {
  weapon: 'Weapon',
  action: 'Action',
  passive: 'Passive',
}

/**
 * `Cantrip`, `Level 3 spell`, or nothing at all.
 *
 * ⚠️ **`null` and `0` are different answers and the ternary order is what says so.** A
 * cantrip is a spell of level nought, and a greataxe is not a spell — so `level === null` is
 * *this is not a spell* and prints nothing, while `0` is *this is a spell, and it is free*.
 * `rollSentence` on the server makes the same distinction in the other direction and calls
 * it the spell/feature split: it says *casts* for anything with a level and *uses* for
 * anything without one, which is why Cure Wounds and Divine Smite announce differently
 * without either of them having to declare which it is.
 *
 * ⚠️ **The conversion turned this from a label into a resource, and the wording is
 * deliberately unchanged by that.** A spell's level is now counted, spent and returned by a
 * rest — it left *A label is not a rule*'s table by going through the amendment door, which
 * CLAUDE.md records as the most instructive entry in it. What this function prints is still
 * only what the row already said; **it does not consult a slot, and a feed line must never
 * become the place a slot is deducted.** That write belongs to the mutation that rolled,
 * server-side, where it can be one transaction with the roll.
 */
export function spellLevelLabel(level: number | null): string | null {
  if (level === null) return null
  return level === 0 ? 'Cantrip' : `Level ${level} spell`
}

/**
 * The captions under a feed row's sentence: what kind of thing was pressed, and its spell
 * level if it has one. Empty for every subject that is not a sheet entry.
 *
 * ⚠️ **`FEED_CATEGORY_LABELS` rather than a `switch` or three names in markup.** It is a
 * `Record` over the union, which is the formulation CLAUDE.md invariant 9 asks a renderer
 * for: a fourth category fails `npm run lint` there instead of printing an empty caption on
 * every row that carries it. `rollShapeOf` on the server is the one place the union is
 * *switched* on, and this deliberately is not a second one — it asks nothing about the
 * category, it names it.
 *
 * ⚠️ **A `'text'` part still gets its caption.** An alt-clicked description is the entry
 * being read out, so *Weapon* under *Chadius describes their Greatsword* is the same true
 * sentence it is under a damage roll. The part is what changed, not what was pressed.
 */
export function entryCaptions(subject: FeedSubject): string[] {
  if (subject.kind !== 'entry') return []
  const level = spellLevelLabel(subject.level)
  const category = FEED_CATEGORY_LABELS[subject.category]
  // The level first, because it is the more specific of the two and a reader scanning a busy
  // feed is looking for *which spell slot went*, not for the fact that it was an action.
  return level === null ? [category] : [level, category]
}
