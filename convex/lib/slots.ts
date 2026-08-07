// SPELL SLOTS: HOW MANY A CHARACTER HAS, AND WHICH REST BRINGS THEM BACK. Shared verbatim by
// the Convex functions and the browser, like lib/grid.ts, lib/rest.ts, lib/layers.ts and
// lib/markers.ts, and for the same reason: a slot table the two sides each spell for
// themselves is two tables, and the one that loses is the row of pips a player is counting.
//
// ⚠️ **NOTHING HERE SPENDS ANYTHING AND NOTHING HERE REFUSES A CAST, AND THIS IS THE FILE
// SOMEBODY WILL COME TO IN ORDER TO CHANGE THAT.** A slot moves because a person pressed the
// pip. `feed.roll` does not consult this module, does not import it and must not: casting a
// levelled spell spends nothing, and no cast is ever refused for want of a slot. CLAUDE.md's
// *Rules scope* gives this feature its entire licence in one sentence — *counting a slot
// compares nothing, refuses nothing, and changes no die of damage* — and automatic spending
// is precisely how that gets exceeded. It would also be a rule arriving without an author:
// the door this project puts every rules change through is *does something now change a
// number a player rolls against without a person asking it to?*, and a roll that debits a
// counter is the app asking on the person's behalf.
//
// ⚠️ **ADR 0011's superseding table says "Slots exist, per class and level, and a roll spends
// one", and the last five words are not built.** That is recorded here rather than quietly
// diverged from: the counting half was instructed and is what this module is, and the
// spending half is a second decision that has had no ADR of its own. Whoever wants it writes
// one; nobody gets it by reading the strikethrough table as a specification.
//
// ⚠️ **This module is pure and knows nothing about a document, a table or a caller.** It takes
// a class key and a level and returns numbers. That is what lets the character sheet in `src/`
// import it and draw the pips off `publicSheet.preset`, which carries a `classKey` and a
// `level` — where `lib/resolve.ts`, the module that answers the same question about a stored
// *character*, may never be imported by the browser (`bundleGuard.test.ts`). The two halves
// exist for that reason and not for tidiness.
//
// Deliberately free of any corpus import, and it must stay that way: a specifier naming
// `lib/library/` or `lib/bestiary/` would be refused by `bundleGuard.test.ts` and
// `corpusGuard.test.ts` alike.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE `never` ARM, DECLINED, WITH THE ARGUMENT — because CLAUDE.md invariant 9 says a union
// on this project gets a mechanical refusal, and the rule it actually states is *find the
// place a wrong answer does damage, and make the compiler refuse there.*
//
// There is **no switch anywhere in this file and there should not be one**, and the reason is
// the strongest form of the invariant rather than an exemption from it: `CASTER_PROGRESSION`
// below is a `Record<ClassKey, …>`, which is a **total** function of the union by
// construction. A thirteenth class added to `CLASS_KEYS` fails `npm run lint` *at the table
// itself*, before any lookup exists to have a default arm. A `switch` written beside it would
// be a second refusal firing on the same edit — and, worse, a switch is only a guard if
// somebody writes it, whereas the `Record` cannot be omitted because it is the data.
// `SPELL_SLOT_RECHARGE` and `SPELL_SLOT_TRACK_LABELS` are the same refusal over the smaller
// union, which is why a third track costs two failed compiles.
//
// This is `lib/markers.ts`' and `lib/mastery.ts`' position reached from the other direction.
// Those two decline a `never` arm because **nothing switches on the vocabulary at all**, so a
// switch would be a guard that cannot fail; this one declines it because the `Record`
// *already is* the exhaustive answer. In neither case is the invariant weakened — in both,
// the compiler refuses at the place a wrong answer does damage.
//
// ⚠️ **What no compiler can check is the numbers, and that is where the danger actually is.**
// A `Record` is satisfied by a Warlock whose recharge reads `long`, and the symptom would be
// a Warlock sitting down for an hour and getting nothing back — the SRD's single most
// distinctive caster silently turned into a Wizard. So the guard for *that* is
// `lib/slots.test.ts`, which pins every class at every level 1–5 against the SRD as literals
// and asserts the recharge as **one positive and one negative**: a Warlock's slots come back
// on a short rest and a Wizard's do not. A short rest that restored a Wizard's slots would be
// the application inventing a rule, which is the one failure this feature can have that
// nobody would report as a bug.

import { MAX_LIBRARY_LEVEL, MIN_LIBRARY_LEVEL, type ClassKey } from './classes'
import type { RestKind } from './rest'

/**
 * The two ways a character can hold spell slots, and they are genuinely two things rather
 * than one thing with a flag.
 *
 * - `spellcasting` is the **graded** track: several spell levels at once, in different
 *   quantities, growing in both directions as the character levels — `1 ◆◆◆◆  2 ◆◆◆  3 ◆◆`.
 * - `pact` is the Warlock's, and it is a **single row that climbs**: one or two slots, all at
 *   the same level, and what changes with level is mostly *which* level they are.
 *
 * ⚠️ **A renderer that cannot tell them apart prints a Warlock's slots under the wrong
 * heading**, which is not cosmetic — *two 3rd-level slots that come back in an hour* and *two
 * 3rd-level slots that come back tomorrow* are different resources, and a table planning its
 * evening around the first while reading the second has been misinformed by the application.
 * That is why the track is on the payload rather than inferred from the shape of the rows: a
 * level 5 Warlock's single row is indistinguishable from a hypothetical caster's single row,
 * and `rows.length === 1` is exactly the sort of test that reads as a discriminator and is not
 * one.
 */
export const SPELL_SLOT_TRACKS = ['spellcasting', 'pact'] as const
export type SpellSlotTrack = (typeof SPELL_SLOT_TRACKS)[number]

/**
 * WHICH REST BRINGS EACH TRACK BACK — and the whole of what the short rest asks.
 *
 * ⚠️ **`RestKind` rather than a boolean, deliberately, because `restores` in lib/rest.ts is
 * then the one place the question is answered for slots as well as for counted uses.** That
 * module's header argues at length that a resource's recharge period and the rest somebody
 * took are one union doing two jobs precisely so there is a single meeting point; a
 * `comesBackOnShortRest: boolean` here would be a second, parallel spelling of the same fact
 * that agrees with `restores` on the day it is written and is answerable by nothing.
 *
 * ⚠️ **One spelling, on the track and not on the slots.** An earlier shape carried
 * `recharge` on the returned object beside `track`, which reads better at the call site and
 * is two fields for one fact — the correlation is total, so the pair could disagree and
 * nothing would notice. The `Record` is one authority, and it is a compile-time refusal for a
 * third track into the bargain.
 *
 * The Warlock is the entire reason this is a table rather than a constant: **it is the one
 * caster in the SRD whose slots return before a night's sleep**, and the absorbed
 * character-resources milestone reasoned from a corpus that had no Warlock in it at all.
 */
export const SPELL_SLOT_RECHARGE: Record<SpellSlotTrack, RestKind> = {
  spellcasting: 'long',
  pact: 'short',
}

/**
 * What the block of pips is called, and the sentence under it.
 *
 * One record rather than two, for `TOKEN_LAYER_LABELS`' and `REST_LABELS`' reason: two
 * records make a third member fail to compile in two files, and whichever is fixed first
 * looks finished.
 *
 * The explanations say **when they come back** rather than what a slot is, because that is
 * the fact the two tracks disagree about and therefore the only thing a heading has to
 * carry. `REST_LABELS.short` promises that *anything that comes back on a short rest comes
 * back*; this is the other end of that sentence, and the two have to stay true together.
 */
export const SPELL_SLOT_TRACK_LABELS: Record<
  SpellSlotTrack,
  { label: string; explanation: string }
> = {
  spellcasting: {
    label: 'Spell slots',
    explanation: 'Spent by casting, and every one of them back after a long rest.',
  },
  pact: {
    label: 'Pact Magic',
    explanation:
      'A small bank of slots, all at the same level, and they come back after a short rest as well as a long one.',
  },
}

/** One row of pips: how many slots of one spell level a character has. */
export type SpellSlotRow = {
  /** The spell level, 1–3. */
  level: number
  /** How many the character has at that level. Never zero — an empty row is not stored. */
  max: number
}

/**
 * A character's slots: which track, and how many of each level.
 *
 * `levels` is **never empty and always ascending**, which is what lets a renderer walk it
 * straight into `1 ◆◆◇◇  2 ◆◇  3 ◇` with no arithmetic and no sort. A level with no slots is
 * absent rather than present with a zero, on this codebase's usual rule that two spellings of
 * none is what every field-by-field comparison then has to agree about.
 */
export type SpellSlots = {
  track: SpellSlotTrack
  levels: readonly SpellSlotRow[]
}

/**
 * ⚠️ **THREE, BECAUSE THE LEVEL CAP IS THE WHOLE OF WHAT THIS APPLICATION REDUCES.**
 * CLAUDE.md's *Rules scope* plays SRD 5.2.1 at character levels 1–5, and a level 5 full
 * caster's highest slot is 3rd level. This is that fact named rather than a policy of its
 * own: raising the character cap raises this, and the tables below are what actually move.
 *
 * It is enforced at `characters.setSlots`' boundary, so a client cannot write a spent count
 * against a 9th-level slot that no row in this file describes.
 */
export const MIN_SLOT_LEVEL = 1
export const MAX_SLOT_LEVEL = 3

/**
 * What a class's slots look like at each character level.
 *
 * Indexed **from zero for character level 1**, which is the one indexing decision here worth
 * stating rather than discovering: `byCharacterLevel[0]` is a level 1 character. `rowsAt`
 * below is the only reader and the only place the offset is applied.
 */
type SpellSlotProgression = {
  track: SpellSlotTrack
  byCharacterLevel: readonly (readonly SpellSlotRow[])[]
}

/**
 * THE FULL CASTER — Bard, Cleric, Druid, Sorcerer, Wizard.
 *
 * SRD 5.2.1, the *Spell Slots per Spell Level* columns of each of those five class tables,
 * which carry identical numbers at levels 1–5:
 *
 * | Level | 1st | 2nd | 3rd |
 * | --- | --- | --- | --- |
 * | 1 | 2 | — | — |
 * | 2 | 3 | — | — |
 * | 3 | 4 | 2 | — |
 * | 4 | 4 | 3 | — |
 * | 5 | 4 | 3 | 2 |
 *
 * Written out per class level rather than derived from a rule, because there is no rule —
 * the SRD prints a table, and a formula that reproduced five rows would be a formula to check
 * against the table anyway. `lib/slots.test.ts` pins every cell as a literal for the same
 * reason: a transcription error is the failure this content can have, and only a second
 * transcription catches one.
 */
const FULL_CASTER: SpellSlotProgression = {
  track: 'spellcasting',
  byCharacterLevel: [
    [{ level: 1, max: 2 }],
    [{ level: 1, max: 3 }],
    [
      { level: 1, max: 4 },
      { level: 2, max: 2 },
    ],
    [
      { level: 1, max: 4 },
      { level: 2, max: 3 },
    ],
    [
      { level: 1, max: 4 },
      { level: 2, max: 3 },
      { level: 3, max: 2 },
    ],
  ],
}

/**
 * THE HALF CASTER — Paladin and Ranger.
 *
 * SRD 5.2.1, the Paladin and Ranger class tables, which agree at levels 1–5:
 *
 * | Level | 1st | 2nd |
 * | --- | --- | --- |
 * | 1 | — | — |
 * | 2 | 2 | — |
 * | 3 | 3 | — |
 * | 4 | 3 | — |
 * | 5 | 4 | 2 |
 *
 * ⚠️ **Level 1 is genuinely empty and is not an off-by-one.** Both classes gain Spellcasting
 * at level 2, so a level 1 Paladin has no slots at all — and `spellSlotsFor` answers `null`
 * for one, which is the same answer a Fighter gets. That collapse is deliberate: the Spells
 * sub-tab is *absent* for a character with no slots rather than empty, and a heading over a
 * row of nothing is the state that reads as a bug. The character becoming a caster at level 2
 * is the SRD's own event and the tab appearing then is the correct rendering of it.
 */
const HALF_CASTER: SpellSlotProgression = {
  track: 'spellcasting',
  byCharacterLevel: [
    [],
    [{ level: 1, max: 2 }],
    [{ level: 1, max: 3 }],
    [{ level: 1, max: 3 }],
    [
      { level: 1, max: 4 },
      { level: 2, max: 2 },
    ],
  ],
}

/**
 * PACT MAGIC — the Warlock, and the reason this module has two tracks instead of one table.
 *
 * SRD 5.2.1, the Warlock class table's *Spell Slots* and *Slot Level* columns:
 *
 * | Level | Slots | Slot level |
 * | --- | --- | --- |
 * | 1 | 1 | 1st |
 * | 2 | 2 | 1st |
 * | 3 | 2 | 2nd |
 * | 4 | 2 | 2nd |
 * | 5 | 2 | 3rd |
 *
 * ⚠️ **Two differences from every other caster, and both are load-bearing.** The bank is
 * **tiny and climbs in level rather than in count** — a level 5 Warlock has two slots and they
 * are 3rd-level ones, where a level 5 Wizard has nine slots across three levels — and it
 * **comes back on a short rest**, which is the only place in this application where a short
 * rest restores something a long rest also restores in full. Flatten the two tracks into one
 * table and the Warlock either loses its short rest or the Wizard gains one; there is no
 * third outcome, which is why `SPELL_SLOT_RECHARGE` is keyed on the track.
 */
const PACT_MAGIC: SpellSlotProgression = {
  track: 'pact',
  byCharacterLevel: [
    [{ level: 1, max: 1 }],
    [{ level: 1, max: 2 }],
    [{ level: 2, max: 2 }],
    [{ level: 2, max: 2 }],
    [{ level: 3, max: 2 }],
  ],
}

/**
 * WHICH OF THE TWELVE CASTS, AND ON WHICH TRACK. **The compile-time refusal this module
 * relies on** — see the ⚠️ at the top of the file, which argues why there is no `switch` and
 * no `never` arm beside it.
 *
 * A `Record<ClassKey, …>` is total by construction, so a thirteenth class fails `npm run
 * lint` here and cannot be answered by omission. What it cannot check is that the *right*
 * progression is beside the right class, which is `lib/slots.test.ts`' job.
 *
 * ⚠️ **Fighter and Rogue get nothing, and that is a fact about the SRD's subclass list rather
 * than about the classes.** In the full 2024 rules an Eldritch Knight and an Arcane Trickster
 * are third-casters; SRD 5.2.1 publishes exactly one subclass per class — Champion and Thief —
 * and `CharacterClass.subclasses` is a one-element tuple for that reason. A third-caster track
 * therefore has nobody to belong to, and adding one before a third-casting archetype exists
 * would be content with no character able to select it. Barbarian and Monk cast nothing in any
 * reading.
 */
const CASTER_PROGRESSION: Record<ClassKey, SpellSlotProgression | null> = {
  barbarian: null,
  bard: FULL_CASTER,
  cleric: FULL_CASTER,
  druid: FULL_CASTER,
  fighter: null,
  monk: null,
  paladin: HALF_CASTER,
  ranger: HALF_CASTER,
  rogue: null,
  sorcerer: FULL_CASTER,
  warlock: PACT_MAGIC,
  wizard: FULL_CASTER,
}

/**
 * The same table as a `Map`, and it is **not** a convenience — indexing the `Record` with an
 * arbitrary string is a crash.
 *
 * ⚠️ A stored class key reaches `spellSlotsFor` as a `string`, and an object literal inherits
 * from `Object.prototype`, so `CASTER_PROGRESSION['toString']` is a *function* rather than
 * `undefined` and sails straight past `?? null` into `progression.byCharacterLevel`. The
 * symptom is a `TypeError` inside the query that paints a whole party — precisely the failure
 * `findClass` in lib/classes.ts exists to describe, where reading `.name` off an undefined
 * turned retiring a class into `characters.list` throwing for everybody. That function answers
 * it with a `Map` and so does this one; `lib/slots.test.ts` probes `toString` and `__proto__`
 * by name so the fix cannot be undone by somebody simplifying the lookup back.
 *
 * The `Record` above is still the authority and still the compile-time refusal. This is
 * derived from it by `Object.entries`, so the two cannot drift.
 */
const PROGRESSION_BY_KEY = new Map<string, SpellSlotProgression | null>(
  Object.entries(CASTER_PROGRESSION),
)

/**
 * THE SLOTS A CHARACTER OF THIS CLASS AND LEVEL HAS, or **null for anybody who has none.**
 *
 * ⚠️ **Null rather than an empty track, and the two callers want the same thing from it.**
 * The Spells sub-tab is *absent* for a non-caster rather than empty, and `characters.setSlots`
 * refuses a spend against nothing — both of which are one `=== null` rather than a length
 * check somebody could write two ways. Three quite different characters land on it: a
 * Barbarian, a level 1 Paladin who is not a caster yet, and a character whose class key has
 * been retired out of the game. **The third is why this takes a `string` rather than a
 * `ClassKey`**: a class key is *stored* on a preset sheet, so a retired one survives in the
 * database long after `CLASS_KEYS` stops naming it, and this is `findClass`' and
 * `subclassOf`' stance applied to the same problem — tolerate it on read, answer null, and
 * let the character stay openable.
 *
 * ⚠️ **The level is clamped to the library's range rather than refused.** `MAX_LIBRARY_LEVEL`
 * already promises that *beyond this a character stops gaining anything*, so a level 9 preset
 * — which the stored schema permits, since `MAX_LEVEL` is 20 — reads the level 5 row rather
 * than throwing inside a query that paints a sheet. A non-finite level reads as level 1, on
 * `clampLevel`'s stance in lib/resolve.ts.
 */
export function spellSlotsFor(classKey: string, characterLevel: number): SpellSlots | null {
  const progression = PROGRESSION_BY_KEY.get(classKey) ?? null
  if (progression === null) return null

  const levels = rowsAt(progression, characterLevel)
  // A caster class that is not a caster *yet*. See the ⚠️ on `HALF_CASTER`.
  if (levels.length === 0) return null
  return { track: progression.track, levels }
}

/** The one place the from-zero indexing on `byCharacterLevel` is applied. */
function rowsAt(
  progression: SpellSlotProgression,
  characterLevel: number,
): readonly SpellSlotRow[] {
  const level = Number.isFinite(characterLevel)
    ? Math.min(MAX_LIBRARY_LEVEL, Math.max(MIN_LIBRARY_LEVEL, Math.round(characterLevel)))
    : MIN_LIBRARY_LEVEL
  return progression.byCharacterLevel[level - 1] ?? []
}

/**
 * How many slots of one spell level this character has — **zero for a level they have none
 * at, and zero for a non-caster**, so one call answers both questions a write path asks.
 *
 * The ceiling `characters.setSlots` clamps against, and the reason that mutation needs no
 * arithmetic of its own. Taking `SpellSlots | null` rather than a non-null one is what lets
 * the caller do a single lookup and pass the result straight in, instead of branching before
 * it can find out whether there was anything to branch on.
 */
export function maxSlotsAt(slots: SpellSlots | null, slotLevel: number): number {
  if (slots === null) return 0
  return slots.levels.find((row) => row.level === slotLevel)?.max ?? 0
}

/** A stored spent count, as it travels and as `characterVitals.spentSlots` holds it. */
export type SpentSlot = { level: number; spent: number }

/** One row of pips, ready to draw. */
export type SpellSlotBar = SpellSlotRow & {
  /** Filled pips. Never above `max`. */
  spent: number
  /** Hollow pips — `max - spent`, so the renderer subtracts nothing. */
  remaining: number
}

/**
 * THE DERIVATION AND THE STORED STATE, CROSSED — `1 ◆◆◇◇  2 ◆◇  3 ◇` with the counting
 * already done.
 *
 * ⚠️ **It exists so that the subtraction happens once, on shared code, rather than in JSX.**
 * `max - spent` is trivial and that is exactly the problem: written at the render site it is
 * written per surface — the sheet, a future token popover, a DM's party overview — and the
 * copy that gets edited last is the one that forgets to floor at zero when a DM drops
 * somebody's level with slots already spent. This is `clampHitDice`'s recorded failure
 * (*"not everywhere at once, but in whichever copy was edited last"*) with a different
 * subtrahend.
 *
 * **Driven by the derivation and never by the stored array**, which is what makes a stale row
 * harmless: a spent count against a level the character no longer has contributes no bar,
 * because the loop is over `slots.levels`. The row stays in the database untouched — read is
 * clamped and storage is not, which is the arrangement `clampHp` and `clampHitDice` already
 * keep — so a DM who drops a level to look at something and puts it straight back finds the
 * counts where they left them.
 *
 * Empty for a non-caster, so a renderer needs one test rather than two.
 */
export function spellSlotBars(
  slots: SpellSlots | null,
  spent: readonly SpentSlot[],
): readonly SpellSlotBar[] {
  if (slots === null) return []

  const byLevel = new Map(spent.map((row) => [row.level, row.spent]))
  return slots.levels.map((row) => {
    const used = clampSpent(byLevel.get(row.level) ?? 0, row.max)
    return { level: row.level, max: row.max, spent: used, remaining: row.max - used }
  })
}

/**
 * A spent count as a whole number inside `0..max`. **The one clamp**, used by the accessor
 * that reads the stored array, by the mutation that writes it and by the bars above, so a
 * count a client sends, a count the database holds and a count the pips draw cannot disagree
 * about what an out-of-range value means.
 *
 * A non-finite float64 reads as nought rather than propagating a `NaN` into a payload, which
 * is `MAX_RESOURCE_USES`' stated purpose applied to the other counter.
 */
export function clampSpent(spent: number, max: number): number {
  if (!Number.isFinite(spent)) return 0
  return Math.min(Math.max(0, Math.round(spent)), Math.max(0, max))
}
