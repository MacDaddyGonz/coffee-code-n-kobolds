// THE OTHER CHOKE POINT. This module is the only place in `convex/` allowed to
// read the `characters` and `characterVitals` tables, and `leakGuard.test.ts`
// greps the sources to keep it that way — the same arrangement `lib/board.ts` has
// for the two token tables, enforced by the same test.
//
// It is worth being precise about why Milestone 3 needs both kinds of guard,
// because the two secrets here are different shapes and applying one tool to both
// would leave a hole (CLAUDE.md invariant 8).
//
// An NPC's **hit points** are a leaked *field*. A payload that carries them is a
// payload that legitimately exists — the party's own hit points travel the same
// route — so the guard is `publicVitalsValidator` below: a discriminated union
// whose player-facing variant has no numeric member at all. Add one by accident and
// Convex throws at runtime rather than shipping it. That is exactly the mechanical
// check `publicGameValidator` performs for the DM code.
//
// An NPC's **sheet** is a leaked *row*. `Ancient Red Dragon`, armour class 22, with
// a breath weapon on it, has precisely the shape of a hero's document, so no
// validator can tell one from the other and a projection would cheerfully approve
// an array made entirely of spoilers. That needs a structural guard instead: one
// reader, one predicate, and a test that greps for anybody who forgot.

import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import {
  creatureSizeValidator,
  crValidator,
  roleKeyValidator,
  tagKeyValidator,
  tierValidator,
} from './creatures'
// The sight half of the board's one pass. A crossing rather than a coupling — see
// `readableCharacterIds`, which is the only caller and explains why it reads it itself.
import { visibleCharacterIds } from './board'
import { MAX_CHARACTERS_PER_GAME } from './games'
// A pure inversion of a roster this module is handed, not a read: the `players` table
// belongs to lib/players.ts and the claim pointer with it, so the map that turns
// seat → character back into character → seat is built there and imported here.
import { holderByCharacter } from './players'
// The pair of published sheet numbers a coin carries, derived together. It lives in
// lib/skills.ts rather than lib/sheet.ts because passive perception needs values from both
// and only that direction has no cycle — its own docblock carries the argument.
import { coinStatsOf } from './skills'
import type { BestiarySheet, CharacterSheet, StoredSheet } from './sheet'
// `resolveSheet` rather than `characterSheet`, and that one substitution is the
// whole of what Milestone 4 changed in this file. Everything below still asks for a
// `CharacterSheet` and still gets one; whether it was typed in by hand or assembled
// from the library, a race and the DM's overrides is settled before it arrives.
import type { CreatureExtras } from './resolve'
import {
  bestiaryOf,
  creatureExtras,
  groupOf,
  kindOf,
  presetExtras,
  presetOf,
  resolveSheet,
  spellSlotsOf,
} from './resolve'
// The slot vocabulary and its one clamp. No table is read for any of it — `spellSlotsOf`
// above is a pure function of the stored selections, so a slot costs this module no read.
import { SPELL_SLOT_RECHARGE, clampSpent, maxSlotsAt } from './slots'
import type { SpellSlots, SpentSlot } from './slots'
import {
  bestiaryOverridesValidator,
  bestiarySheetValidator,
  characterGroupValidator,
  characterKindValidator,
  clampDeathSaves,
  clampHitDice,
  clampHp,
  clampTemporaryHp,
  defaultSheetFor,
  healthBand,
  presetSheetValidator,
  reconcileHp,
  sheetEntriesOf,
  sheetValidator,
  usesOf,
} from './sheet'
// The rest arithmetic, and the one place `restores` is asked in `convex/`. No mastery is
// imported here and none may be — `masteryGuard.test.ts` allows lib/sheet.ts alone.
import { restores } from './rest'
import type { Resource } from './rest'

/**
 * Deliberately indistinguishable from "no such character" and "character in
 * another game" — the same stance, and the same reasoning, as `TOKEN_NOT_FOUND`.
 *
 * The existence of an NPC is itself a spoiler. A refusal that said "you may not
 * read that one" would confirm that a character sits behind the id, which is most
 * of what the DM was keeping back; a player who knows there is a dragon has had the
 * dragon spoiled whether or not they can read its armour class. So the refusals are
 * one shared constant and the tests assert the parity, rather than three literals
 * that drift apart under maintenance.
 *
 * The wording is Milestone 1's, unchanged, so the existing suites and the existing
 * client copy still hold.
 */
export const CHARACTER_NOT_FOUND = {
  kind: 'CharacterNotFound',
  message: 'That character is not in this game.',
}

function characterNotFound(): ConvexError<typeof CHARACTER_NOT_FOUND> {
  return new ConvexError(CHARACTER_NOT_FOUND)
}

/**
 * The whole visibility rule for a character document, in one expression.
 *
 * `isDm` arrives from `resolveDmAccess` in lib/games.ts and may not be computed
 * from anything else — never `players.isDm`, which is a badge in the roster
 * (invariant 7), and never derived from a `playerId` argument, which says which
 * seat to act on rather than who is calling (ADR 0003).
 *
 * Note what this does **not** consult: whether a seat has claimed the character.
 * Deriving "is this an NPC?" from "has anybody claimed it?" is the precise shape of
 * the bug Milestone 2 shipped and had to correct, and here it would fail in both
 * directions — a hero whose player has not joined yet would have their sheet hidden
 * from the party, and an NPC the DM handed to somebody would have its stat block
 * published to the table. The kind is stated in the document, so it is read from
 * the document.
 *
 * ⚠️ **There is now a second door, and the sentence that used to say this refusal
 * keys off the DM code alone is no longer true.** A DM who hands the party a pet has
 * decided that those players may read its sheet, so `controlled` opens the row for
 * exactly the seats named — and nothing else about it changes. The honest statement
 * is that the refusal keys off the DM code *and off a grant the DM made deliberately*,
 * which is a widening with an author rather than a hole. `convex/characters.ts` and
 * `lib/board.ts` carry the same amendment beside their own advisory-ceiling notes.
 *
 * **The set is composed with the sight rule and never substituted for it.**
 * It arrives from `boardCharacterAccess` in lib/board.ts, which builds it from the
 * *visible* token set in the same pass — so a grant written onto a DM-layer token contributes nothing
 * for a player, because the token was already filtered out one module over. Sight of
 * the coin is still the precondition for sight of the sheet; a grant only decides what
 * a player may read about a creature they can already see standing there.
 *
 * **Optional, and absent means no grants.** That is fail-closed by construction rather
 * than by convention: the call sites with no seat to hand it — `claim`, `assign` and
 * `rename` — get the pre-grant rule by writing nothing, so a grant can never make a
 * monster a playable hero or widen a write that was never meant to widen. A caller who
 * genuinely has a set has one because it went and read the board for it.
 */
export function maySeeCharacter(
  character: Doc<'characters'>,
  isDm: boolean,
  controlled?: ReadonlySet<Id<'characters'>>,
): boolean {
  if (isDm) return true
  // `kindOf`, not `resolveSheet(...).kind`. The answer is one stored field, and a
  // predicate that guards a secret should not be reaching through the whole premade
  // library to find it — a content bug in any of 72 sheets would otherwise be able
  // to take this down, and with it `characters.list` for the entire table. See the
  // note on `kindOf`.
  if (kindOf(character) === 'pc') return true
  return controlled?.has(character._id) ?? false
}

/**
 * Whether the DM has set this character aside for somebody who is not at the table yet.
 *
 * One accessor over one optional field, defaulting to false, for the reason every
 * optional field on this schema is read through one: adding a required field to a
 * populated table fails the push, so every character written before this existed has
 * no answer and "not reserved" is what an absent answer means.
 *
 * ⚠️ **This is a second predicate, composed at the call site, and both of the places it
 * was not folded into were considered and refused.**
 *
 * **Not into `isMonsterSheet`.** That is an allow-list answering exactly one question —
 * which stored *kinds* may be published — and CLAUDE.md invariant 9 exists because the
 * formulation it replaced kept compiling, kept passing and answered `false` the moment a
 * member was added to the union. Reserving is not a kind of sheet; it is a fact about one
 * document, and a second question asked inside that discriminator is how the
 * discriminator stops being one question and starts being the place a leak hides.
 *
 * **Not into `maySeeCharacter`.** `characters.assign` and `characters.claim` both call
 * `requireVisibleCharacter(…, false)` with `isDm` hard-coded false, deliberately, so that
 * neither the DM code nor a grant can make a monster a playable hero. A reserved
 * character invisible *through that function* would therefore be one **the DM cannot
 * assign** — and being assignable to the player it was built for is the one thing
 * reserving it was for. So the two predicates meet at the call sites that have both
 * questions in view: `&&`-ed where the character list is built, and read on its own where
 * `claim` refuses.
 */
export function isReservedCharacter(character: Doc<'characters'>): boolean {
  return character.reserved === true
}

/**
 * The reservation as a *filter* — whether it withholds this row from this caller — in the
 * one spelling the two list builders below share.
 *
 * Extracted because `isDm || !isReservedCharacter(character)` was about to exist twice,
 * and "reserved is hidden from players" written twice is the thing that comes to be
 * written differently: `publicCharacters` builds the character list and
 * `readableCharacterIds` builds the set the feed is filtered against, and a row withheld
 * from one while its name is printed by the other publishes exactly what reserving it
 * withholds. That failure has happened once already in this file — see the ⚠️ on
 * `playerCharacterNames`, which is the same leak between a list and a roster.
 *
 * ⚠️ **Still a second predicate composed at the call site, and folded into neither of the
 * other two.** It is `&&`-ed beside `maySeeCharacter` and `mayHearOf` rather than living
 * inside either, for the reasons `isReservedCharacter` above sets out at length: folded
 * into the sight rule it would make a reserved character one **the DM cannot assign**,
 * because `claim` and `assign` both ask that question with `isDm` hard-coded false, and
 * being assignable to the player it was built for is the one thing reserving it was for.
 * Naming the composition is not the same act as performing it somewhere else.
 */
function isWithheldAsReserved(character: Doc<'characters'>, isDm: boolean): boolean {
  return !isDm && isReservedCharacter(character)
}

/**
 * Whether this caller may be told that this character **did something** — the feed's
 * question, which is not the sheet's.
 *
 * ⚠️ **A new question with a new name, deliberately not folded into `maySeeCharacter`.**
 * That predicate decides whose *sheet* may be opened; this decides whose *name may appear
 * in a line saying they rolled something*. The two genuinely differ, and a collapse fails
 * in whichever direction it is made. Ask the sheet question about a feed row and `Goblin
 * Archer attacks with their Shortbow` is suppressed for the very players watching the
 * arrow land, because a player who can see a goblin's coin still may not read its stat
 * block. Widen the sheet question to admit what the feed admits and that goblin's armour
 * class, hit dice and the DM's notes on it go out with the line. Two names is the cheap
 * way to keep two answers, and it is the arrangement `isReservedCharacter` already argues
 * for one function up.
 *
 * **The `visible` disjunct is honest rather than lax.** `board.tokens` has *already*
 * published that goblin's name and its coin to that player — that is what a player-layer
 * token is — so a feed that withheld the line would be secrecy theatre against a client
 * which can read the name off its own board. What it must not do is announce a creature
 * the caller cannot see, and it cannot: a token on the DM layer, or a creature with no
 * token at all, is in neither set, because `boardCharacterAccess` filtered that row out
 * before its loop began. **That is the ambush case, and it is the whole point** — the
 * DM's prepared encounter rolls nothing anybody hears about until the coin is on the
 * board, and reveals both in the one write to `layer`.
 *
 * **It composes `maySeeCharacter` and never substitutes for it.** The sheet rule runs
 * first and unchanged, and the disjunct only ever adds.
 *
 * ⚠️ **It takes no grant set, and that is a proof rather than an omission — the version
 * that took one was wrong about its own value.** `boardCharacterAccess` builds `controlled`
 * inside the loop that builds `visible`, and adds to it only on an iteration that has
 * already added to `visible`: `controlled ⊆ visible`, by construction, which is the
 * structural claim ADR 0009 makes and that function's own ⚠️ spells out. So passing the
 * grant set here would give `maySeeCharacter(c, isDm, controlled) || visible.has(c)` — and
 * every id the first disjunct could admit through a grant, the second has already admitted
 * through sight. The term is unreachable.
 *
 * It was not free to leave in. A parameter that provably changes no answer still *asserts*
 * a rule — and this one asserted that a grant widens the feed, which made `playerId` an
 * argument of `feed.list` and split the highest-churn subscription in the application into
 * one cache entry per seat, each re-executing on every roll at the table, to compute the
 * same rows. Removing it makes the answer a function of `isDm` alone: two entries for the
 * whole table.
 *
 * **What is lost is a hook, and losing it is the point.** If control is ever meant to let a
 * seat hear a line about a creature it cannot *see*, that is a new decision — it would mean
 * a grant on a DM-layer token doing something, which ADR 0009 deliberately made inert — and
 * it should arrive as a signature change somebody has to write, not as a parameter already
 * sitting here implying the rule is in place. `feed.test.ts` pins the present behaviour by
 * asserting a granted seat, an ungranted seat and a seatless client receive identical rows.
 *
 * ⚠️ **The exposure `visible` inherits is stated rather than left to be discovered.**
 * `boardCharacterAccess` reads tokens game-wide rather than per-scene, so a creature
 * standing on a player-layer token on a map nobody is looking at counts as visible. That
 * is exactly how `characters.vitals` already behaves — the same set, from the same read —
 * so this is not a new hole, and the control is the same one it has always been: the DM
 * layer. A creature the DM has not put in front of anybody belongs on it.
 */
export function mayHearOf(
  character: Doc<'characters'>,
  isDm: boolean,
  visible: ReadonlySet<Id<'characters'>>,
): boolean {
  return maySeeCharacter(character, isDm) || visible.has(character._id)
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/**
 * One row of the character list: who exists, which seat is playing them, and which
 * heading the row is printed under.
 *
 * ⚠️ **`kind` and `group` are two fields answering two different questions, and a
 * reader who collapses them will either publish a monster or lose a heading.**
 *
 * - `kind` is **secrecy**: it decides whether this caller may know the character exists
 *   at all. It comes from `kindOf`, which asks `isMonsterSheet`, whose default is
 *   fail-closed because getting it wrong publishes a dragon (invariant 9).
 * - `group` is **display**: it decides whether the row sits under Characters, NPCs or
 *   Monsters in the DM's selector. It comes from `groupOf`, which is allowed a safe
 *   default precisely because **only the DM ever receives a `group` that is not
 *   `'character'`** — a player's payload has already had every creature filtered out of
 *   it, so a wrong answer here misfiles a row and can never leak one.
 *
 * Four stored kinds do not map onto three groups (`pc` and `preset` are both characters;
 * `npc` and `bestiary` are each either of the other two), which is why one field cannot
 * do both jobs even before the secrecy argument is made.
 */
export const publicCharacterValidator = v.object({
  _id: v.id('characters'),
  name: v.string(),
  // Both unions spelled once, in lib/sheet.ts, rather than re-typed here. `kind` is the
  // field that decides what a caller is allowed to know a character even is, and two
  // copies of it is one place for a third member to be added to only one.
  kind: characterKindValidator,
  group: characterGroupValidator,
  /**
   * Whether the DM has hidden this character from the table.
   *
   * **Always `false` in a player's payload, and that is the point rather than a
   * weakness.** A reserved row is dropped from a player's list entirely by
   * `publicCharacters` — reserved means *absent*, not greyed out, because a disabled row
   * still publishes a name and the name is the spoiler. So the only caller that can ever
   * receive `true` is the DM, and this field carries no information a player did not
   * already have from the row's presence.
   *
   * It travels because the DM's control has to be a **state and not a command**. Without
   * it the hide button could only say what pressing it would do, never what is currently
   * true — which for a flag whose whole purpose is "somebody must not see this" is the
   * one thing a DM needs to be able to read off the screen.
   */
  reserved: v.boolean(),
  claimedByPlayerId: v.union(v.id('players'), v.null()),
  claimedByName: v.union(v.string(), v.null()),
  createdAt: v.number(),
})
export type PublicCharacter = Infer<typeof publicCharacterValidator>

/**
 * A social NPC's block, as it travels.
 *
 * `personality` arrives from the corpus as a fixed three-tuple and leaves as an array,
 * because Convex has no tuple validator — `v.array(v.string())` is the closest thing
 * expressible, and the tuple type stays the enforcement where it can actually be enforced,
 * on the entry being written. `usefulSkills` is likewise a plain string array rather than
 * the thirteen skill keys, for want of a skill-key validator to reference; the corpus test
 * is what holds those to `SKILL_KEYS`, which is where a content rule belongs.
 *
 * `questHooks` is optional on the entry and nullable here: `undefined` is not a Convex
 * value, so an absent errand has to become something on the way out.
 */
const creatureSocialValidator = v.object({
  occupation: v.string(),
  personality: v.array(v.string()),
  usefulSkills: v.array(v.string()),
  knows: v.string(),
  questHooks: v.union(v.string(), v.null()),
})

/**
 * What a bestiary entry says about a creature that its resolved `NpcSheet` has nowhere to
 * put.
 *
 * The same relationship `extras` has to a premade hero, and for the same reason: none of
 * this is a rule. Nothing rolls a creature type, computes with an alignment or adjudicates
 * a size, so carrying any of it on `NpcSheet` would mean a dozen more optional fields on a
 * type that a hand-built monster shares — and a dozen more accessors to read them through.
 *
 * `libraryCr` is the entry's **own** rating rather than the one this creature is currently
 * resolved at, and both travel. The pair is the `Owlbear · CR 3 → 5` banner, which exists
 * because a DM who has forgotten they scaled something has encounter maths that is quietly
 * wrong.
 */
export const creatureLabelsValidator = v.object({
  name: v.string(),
  /** The entry's own rating. The creature's current one is `cr` on the payload below. */
  libraryCr: crValidator,
  /** The tier of the **resolved** rating, not the entry's — see `CreatureExtras`. */
  tier: tierValidator,
  role: roleKeyValidator,
  tags: v.array(tagKeyValidator),
  creatureType: v.string(),
  size: creatureSizeValidator,
  alignment: v.string(),
  /**
   * A line of text, and **not** folded into a hero's `equipment`. Reusing that field for a
   * creature's hoard would be a lie in the schema for the sake of one fewer name: they are
   * the same *shape* and different facts, and the panel prints them under different
   * headings.
   */
  loot: v.string(),
  blurb: v.string(),
  recommendedPartyLevelMin: v.number(),
  recommendedPartyLevelMax: v.number(),
  environmentTags: v.array(tagKeyValidator),
  /**
   * Whether the entry has a statline at all — false for a social NPC not expected to fight.
   *
   * **Declared here as well as on the picker's summary row, and that is the point rather
   * than a duplication.** A resolved sheet always has an armour class and hit points, so
   * "does this creature fight?" cannot be read off the numbers; the nearest proxy is
   * `attackBonusOf(sheet) !== null`, and the panel did exactly that until two consumers of
   * the same fact disagreed. The server has `entry.combat` in hand, so it decides once and
   * ships the answer, and the statline and the comparison panel agree by construction. See
   * `CreatureExtras.hasCombat`, which records that failure in full.
   */
  hasCombat: v.boolean(),
  /** Null on a monster. Honestly named rather than squeezed into `levellingNotes`. */
  social: v.union(creatureSocialValidator, v.null()),
})
export type CreatureLabels = Infer<typeof creatureLabelsValidator>

/**
 * A bestiary-linked creature, both halves: what the DM selected, and what the library says
 * about what they selected.
 *
 * One payload rather than two round trips, because the panel needs both and they answer
 * different questions — the selections are what the CR stepper and the override panel
 * edit, the labels are what the sheet header prints. It also hands over every feature the
 * source spec's Library Linking section asked for without anything being computed twice:
 * `overrides === null` is *isModified*, `overriddenFields` is *modifiedFields[]*, and `cr`
 * read against `libraryCr` together with the override object **are** *Compare Changes*.
 *
 * ⚠️ **This is a new secret inside an existing payload, and the mechanical guard does not
 * reach it.** A `returns:` validator catches a secret *field* arriving in a shape that has
 * nowhere to put it — that is what keeps a DM code out of a public game. It cannot help
 * here, because a bestiary payload and a preset payload are both legitimately shaped, so
 * Convex would approve either against `publicSheetValidator` without comment. What keeps a
 * creature's stat block away from a player is the structural guard: `maySeeCharacter`,
 * one predicate, in this one module. The payload-scan test is where that gets proved rather
 * than asserted.
 */
export const creaturePayloadValidator = creatureLabelsValidator.extend({
  // Read off `bestiarySheetValidator` rather than re-typed, so the payload cannot come to
  // disagree with the document about what a selection is.
  entryKey: bestiarySheetValidator.fields.entryKey,
  /** The rating this creature is resolved at — the entry's own unless the DM has stepped it. */
  cr: bestiarySheetValidator.fields.cr,
  /**
   * The DM's overrides, or null for a creature straight off the shelf. Nullable rather
   * than optional because `undefined` is not a Convex value, and because null is what the
   * panel actually tests to decide whether *Reset to Library Defaults* does anything.
   */
  overrides: v.union(bestiaryOverridesValidator, v.null()),
  /**
   * Which fields the DM has pinned, for the marks beside them. Derived from the override
   * object's own keys rather than maintained alongside it — a hand-maintained list is the
   * design ADR 0006 rejected, and it goes stale the first time a write forgets to append.
   */
  overriddenFields: v.array(v.string()),
})
export type CreaturePayload = Infer<typeof creaturePayloadValidator>

/**
 * The labels, as **what is left of `CreatureExtras` once the two fields that are not labels
 * are dropped.**
 *
 * This was thirteen field names written out by hand, which is a projection maintained in a
 * second module and checked by nobody: a field added to `CreatureExtras` and to the
 * validator but forgotten here throws at runtime on the first call, and one dropped from the
 * validator and left here compiles and ships. `CreatureLabels` is a strict subset of
 * `CreatureExtras`, so saying so is both shorter and the check — assigning the rest to the
 * declared return type **typechecks only if the two agree**, which is the mechanical guard
 * the hand-written copy never had.
 *
 * The arrays are not re-copied on the way through. `creatureExtras` already builds fresh
 * ones, per request, with nothing cached in between — its doc comment is where that argument
 * now lives, because that is where the corpus is actually touched. A second copy here was
 * defending an object nothing else had ever held.
 */
export function creatureLabels(extras: CreatureExtras): CreatureLabels {
  // `overriddenFields` is the one field that is not a label: it describes what the DM has
  // done to this creature rather than what the library says about it, and it travels on
  // `creaturePayloadValidator` beside the overrides themselves.
  const { overriddenFields, ...labels } = extras
  return labels
}

/** The labels plus the selections. The shape `characters.sheet` sends for a creature. */
export function creaturePayload(
  creature: BestiarySheet,
  extras: CreatureExtras,
): CreaturePayload {
  return {
    ...creatureLabels(extras),
    // Off the stored selection rather than off `extras`, which no longer carries either —
    // see the warning on `CreatureExtras`. One spelling of a selection, in the document
    // that holds it.
    entryKey: creature.entryKey,
    cr: creature.cr,
    overrides: creature.overrides ?? null,
    overriddenFields: extras.overriddenFields,
  }
}

/**
 * A whole sheet, for the panel that edits one.
 *
 * Current hit points are deliberately absent — they come from `characters.vitals`
 * instead. Bundling them would undo the table split: every point of damage would
 * re-push the entire spell list to everyone with the panel open, and the board's
 * health bars would be reading sheet documents to draw a bar.
 */
export const publicSheetValidator = v.object({
  _id: v.id('characters'),
  name: v.string(),
  /**
   * The **resolved** sheet — what to display and what the rolls milestone rolls. For a
   * character built from the library this is the library's numbers with the race
   * applied and the DM's overrides on top; the client never sees the library itself
   * and never has to assemble anything.
   */
  sheet: sheetValidator,
  /**
   * The stored selections, or null for a hand-built character or an NPC.
   *
   * Sent *alongside* the resolved sheet rather than instead of it, because the two
   * answer different questions: the sheet says what the character can do, and this
   * says which four dropdowns to fill in and whether they are locked. Deriving the
   * selections back out of a resolved sheet would be impossible — that is the whole
   * point of resolving — and sending only the selections would put the library in
   * the browser.
   */
  preset: v.union(presetSheetValidator, v.null()),
  /**
   * The premade sheet's fixed kit and its note on what changed at this level. Null
   * for a hand-built character or an NPC, which have neither.
   *
   * Sent from here rather than carried on the sheet because neither is a rule — see
   * `presetExtras`. The kit is what requirements.md's "set equipment per character"
   * amounts to, and it is not an inventory: nothing manages it, nothing counts it.
   */
  extras: v.union(
    v.object({ equipment: v.string(), levellingNotes: v.string() }),
    v.null(),
  ),
  /**
   * The bestiary selections and the library's labels, or null for anything that is not a
   * creature taken off the DM's shelf.
   *
   * **A sibling of `preset` rather than a widening of it**, and that is not symmetry for
   * its own sake. Widening `preset` to `PresetSheet | BestiarySheet | null` type-checks and
   * then makes three consumers structurally dishonest: `presetOf`'s declared return, the
   * sheet editor's `storedOf`, and `PresetSheetView`'s `draft: PresetSheet`. Each would
   * compile against the wider field and mean something false — "these are the four
   * dropdowns" said about a creature key and a challenge rating. Two fields, one of which
   * is always null, is the honest shape.
   *
   * Null as well for a creature whose entry has since been retired, exactly as `extras` is
   * null for a hero whose class has: the labels are gone, so there are none to send, and the
   * resolved sheet above still renders. A character stays readable when the content it
   * pointed at does not.
   */
  creature: v.union(creaturePayloadValidator, v.null()),
})
export type PublicSheet = Infer<typeof publicSheetValidator>

/**
 * THE MECHANICAL GUARD FOR THE HIT-POINT ACCEPTANCE TEST.
 *
 * A discriminated union, so the variant a player receives for an NPC has **no
 * numeric field to put a hit point in**. This is not a convention anybody has to
 * remember: declared as a query's `returns:` validator, it makes Convex throw at
 * runtime the moment a projection tries to add `current` to a `band` payload. The
 * exact numbers cannot be leaked by accident, because there is nowhere to put them.
 *
 * That is the right tool here and the wrong tool one file over. A DM-layer token is
 * a leaked *row* of identical shape, which a validator can never catch; hit points
 * are a leaked *field*, which is the case a validator catches perfectly.
 *
 * ⚠️ **TWO NUMBERS OFF THE SHEET NOW RIDE HERE, AND THE GUARANTEE ABOVE IS UNCHANGED.
 * Read this before assuming the union has been weakened.** Armour class and passive
 * perception are on **both** members, deliberately, and that is not the same act as
 * putting `current` on the `band` member:
 *
 * - The guarantee this union exists for is *the player-facing variant has nowhere to put
 *   a hit point*. `band` still has no `current` and no `max`, so it still holds, word for
 *   word, and Convex still throws if a projection tries.
 * - A field present on **both** members is not a discriminator question at all. It is
 *   published to everyone who receives a row, and the union has nothing to say about it.
 *
 * These two are published **on purpose**, which is the part that needed a decision rather
 * than a design. A creature's armour class reached no player before this — it is ADR 0005's
 * own worked example of the row-shaped secret — and it now reaches every player who can
 * already see the coin. The scope is the whole of the defence: `visibleVitals` below drops
 * a creature a player may not see *before* it builds either variant, so a GM-layer or
 * fogged creature contributes no row at all and therefore no armour class. Nothing else off
 * the stat block moves. See ADR 0014.
 *
 * ⚠️ **The exact-only alternative was considered and is wrong for what was asked.** Putting
 * them on `exact` alone would show a granted pet's armour class and hide the goblin's
 * standing next to it, which is not "the number on the coin" — it is a second, invisible
 * permission rule expressed as a missing badge.
 *
 * ⚠️ **`null` is a real answer for both and must stay reachable.** A hand-built creature
 * whose DM never recorded a passive perception has none, and a blue circle reading 10 is a
 * statistic the table would act on that nobody wrote. `passivePerceptionFor` in
 * lib/skills.ts is the one place that decision is made.
 */
export const publicVitalsValidator = v.union(
  v.object({
    kind: v.literal('exact'),
    characterId: v.id('characters'),
    current: v.number(),
    max: v.number(),
    // Hit dice left to spend, and how many there are altogether. Null on a monster,
    // which has none — the reduced sheet carries no hit dice at all.
    //
    // They ride with hit points rather than with the sheet because they are the same
    // kind of fact: what changes during play, as opposed to what the character *is*.
    // A rest spends them, an edit does not. Putting them on the sheet would mean a
    // short rest rewriting a spell list.
    hitDiceRemaining: v.union(v.number(), v.null()),
    hitDiceCount: v.union(v.number(), v.null()),
    // Keys of once-per-long-rest abilities already spent. Which abilities a character
    // *has* comes from their race, which the client can look up itself from
    // lib/species.ts — only which ones are gone has to travel.
    spentPerRest: v.array(v.string()),
    // ⚠️ **THE 2024 STATE, AND EVERY LINE OF IT IS ON THIS MEMBER ONLY.** Five fields
    // arrived on `characterVitals` and none of them appears on `band` below — which is the
    // pressure the union exists against, arriving in its largest single instalment. Three of
    // the five are bare numbers, so a copy-paste onto the wrong member is exactly the edit
    // `vitals.test.ts`' *no member of the band variant is a bare float64* assertion refuses.
    //
    // They ride here rather than on a subscription of their own for `hitDiceRemaining`'s
    // stated reason: this is what changes during play, the board already re-runs this query
    // on every point of damage, and a sixth socket that idles is not worth opening.
    //
    // ⚠️ **This is NOT the third published *stat* `coinStatsOf` warns about.** That warning
    // is about a *sheet* fact reaching a player who can see a coin — armour class was one,
    // and a third would need its own ADR. Every field below is a *vitals* fact about a
    // creature the caller is already being sent exact hit points for, so it publishes
    // nothing to anybody who was not already receiving `current` and `max`.
    temporaryHp: v.number(),
    deathSaveSuccesses: v.number(),
    deathSaveFailures: v.number(),
    heroicInspiration: v.boolean(),
    // The counted successor to `spentPerRest` above, which travels beside it until the
    // narrowing. `spentUsesOf` folds the legacy array in, so a client reading this one alone
    // is already correct for both.
    spentUses: v.array(v.object({ key: v.string(), spent: v.number() })),
    // ⚠️ **Spell slots spent, on THIS MEMBER ONLY, and the band gains nothing.** It is an
    // array rather than a bare number, so the `no member of the band variant is a bare
    // float64` assertion in `vitals.test.ts` would not catch it being pasted onto the wrong
    // member — which is exactly why that test pins the band's key set *whole* as well, and
    // why `spentSlots` is named in `NO_2024_STATE` beside `spentUses` rather than asserted
    // on its own.
    //
    // It belongs here for `spentUses`' reason and needs no separate argument: it is play
    // state about a creature the caller is already being sent exact hit points for, so it
    // publishes nothing to anybody who was not already receiving `current` and `max`. What a
    // player must not learn from a health bar is how much magic a creature has left, and a
    // band carries no such thing.
    //
    // **The maximum does not travel and must not.** It is `spellSlotsFor(classKey, level)`,
    // which the browser can run for itself off `publicSheet.preset` — and for a creature the
    // caller may not read a sheet for, the answer is null anyway. Sending it would put a
    // second authority for a derived number on the highest-churn subscription in the
    // application.
    spentSlots: v.array(v.object({ level: v.number(), spent: v.number() })),
    // Published. See the ⚠️ above — on both members on purpose, and `null` is real.
    armourClass: v.union(v.number(), v.null()),
    passivePerception: v.union(v.number(), v.null()),
  }),
  v.object({
    kind: v.literal('band'),
    characterId: v.id('characters'),
    band: v.union(
      v.literal('healthy'),
      v.literal('bloodied'),
      v.literal('critical'),
      v.literal('down'),
    ),
    armourClass: v.union(v.number(), v.null()),
    passivePerception: v.union(v.number(), v.null()),
  }),
)
export type PublicVitals = Infer<typeof publicVitalsValidator>

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every character in the game, unfiltered.
 *
 * Private, like `visibleTokens` next door and for the same reason: a caller outside
 * this module holding raw `Doc<'characters'>` rows is a projection waiting to be
 * written somewhere the guard cannot see. Everything past this file gets one of the
 * public shapes above.
 */
async function allCharacters(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'characters'>[]> {
  return await ctx.db
    .query('characters')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_CHARACTERS_PER_GAME)
}

/**
 * The character list this caller may see, joined to whichever seat is playing each.
 *
 * The seats are passed in rather than read here, so this module stays confined to
 * its own two tables and the caller keeps its one roster read.
 *
 * **No controlled set, and that is a decision rather than an omission.** A granted
 * creature deliberately stays absent from this list: `characters.list` is one per-game
 * subscription shared by every client, and giving it a `playerId` would split it into a
 * cache entry per seat on the query the whole shell re-renders from. A grant is answered
 * where a grant is used — the board, and `characters.sheet` — and the selector this list
 * feeds is the DM's anyway. Whoever adds the argument here should be able to say what
 * screen needed it.
 *
 * **Two predicates, `&&`-ed here and merged nowhere.** `maySeeCharacter` withholds a
 * creature because it is a secret; `isReservedCharacter` withholds a hero because the DM
 * has set it aside for somebody who has not arrived. Reserved means *absent* rather than
 * greyed out, because a disabled row still publishes a name and the name is the spoiler.
 */
export async function publicCharacters(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
): Promise<PublicCharacter[]> {
  const characters = await allCharacters(ctx, gameId)

  // Built from the seats we were handed rather than a lookup per character, and built
  // by lib/players.ts because the claim pointer is that module's — see
  // `holderByCharacter`, which is where that reasoning now lives for all three callers.
  const holders = holderByCharacter(seats)

  // Characters arrive oldest-first: Convex appends _creationTime to every index.
  return characters
    .filter(
      (character) =>
        maySeeCharacter(character, isDm) && !isWithheldAsReserved(character, isDm),
    )
    .map((character) => {
      const holder = holders.get(character._id) ?? null
      return {
        _id: character._id,
        name: character.name,
        kind: kindOf(character),
        // The heading, resolved on the server. The client never computes it — the
        // mapping from four stored kinds onto three groups reads the bestiary to place
        // a linked creature, and the bestiary is not in the bundle (invariant 8).
        group: groupOf(character),
        // Only ever `true` for the DM — the filter above has already dropped every
        // reserved row from a player's list, so this says nothing a player could not
        // already infer from the row being there at all. See the validator.
        reserved: isReservedCharacter(character),
        claimedByPlayerId: holder?._id ?? null,
        claimedByName: holder?.displayName ?? null,
        createdAt: character._creationTime,
      }
    })
}

/**
 * Every character in this game whose name this caller may be told, as a set of ids.
 *
 * The set `lib/feed.ts` filters its rows against, and the reason that module can decide
 * what a player hears without reading one row of `characters`: **a `Set` of ids leaves
 * here and never a `Doc`** — the same narrow crossing `boardCharacterAccess` makes in the
 * other direction, and the arrangement that lets a third choke point exist without any
 * two of them reading each other's tables.
 *
 * **Two predicates, `&&`-ed here and merged nowhere**, which is `publicCharacters`'s
 * arrangement above and the precedent `isReservedCharacter`'s own doc comment argues for
 * at length. `mayHearOf` withholds a creature because it is a secret;
 * `isWithheldAsReserved` withholds a hero because the DM has set it aside for somebody who
 * has not arrived — and a reserved character's *name* is precisely what reserving it
 * withholds, so a feed line naming one would undo the whole flag.
 *
 * ⚠️ **Unlike the reserved filter on the roster, this one is genuinely reachable.** That
 * one guards a state nothing can produce and is written anyway; this one guards something
 * a DM does on purpose — the grouped Sheets selector rolls initiative row by row, and a
 * reserved hero has a row, so `Seraphine the Unarrived rolls initiative` is one click away
 * from the whole table for a character nobody is supposed to know exists yet.
 *
 * `allCharacters` reused rather than a second read, so this shares the one bound and the
 * one range read over the table that every other reader in this module goes through.
 *
 * ⚠️ **It reads the board itself rather than being handed the sight set, and that is a
 * refusal to trust a parameter.** The first version took `visible` from its caller — which
 * meant the caller had to have built it with *the same* `isDm`, and nothing whatever enforced
 * that. `maySeeCharacter(c, false, visibleBuiltForADm)` compiles, type-checks, passes
 * `leakGuard`, and publishes every DM-layer creature's feed lines to the table; the two
 * arguments are both a `ReadonlySet<Id<'characters'>>` and the compiler cannot tell them
 * apart. Taking `isDm` once and deriving everything from it makes the mismatch unspellable.
 *
 * This is why the module imports `lib/board.ts`, which is a crossing rather than a new
 * coupling and is precedented by `lib/access.ts`: what comes back is a `Set` of ids the
 * owning module has already filtered, never a `Doc<'tokens'>`, so neither choke point reads
 * the other's tables. `visibleVitals` next door still takes its two sets, and that is not the
 * same case — it genuinely needs both halves of one pass, whereas this has exactly one
 * consumer for one of them.
 */
export async function readableCharacterIds(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  // The board the table is looking at, so a creature standing in a fogged corridor is not
  // heard from either. This is the third consequence of one filter in `boardCharacterAccess`
  // — the band and the placement are the other two — and it arrives here without this module
  // learning anything new about tokens, because what crosses the boundary is still a `Set` of
  // ids somebody else has already filtered.
  sceneId: Id<'scenes'> | null,
  isDm: boolean,
): Promise<Set<Id<'characters'>>> {
  // ⚠️ **The board is not read for the DM at all, and skipping it is declining to ask a
  // question whose answer is already known rather than an optimisation.** `maySeeCharacter`
  // returns true for a DM on its first line, so `mayHearOf`'s `visible.has(...)` disjunct is
  // unreachable and every character in the game is admitted — the set would be built and
  // never consulted.
  //
  // What building it anyway would cost is the part that matters: a `take(MAX_TOKENS_PER_GAME)`
  // range read puts the whole `tokens` table into this subscription's read set, so every
  // `addToken`, `setLayer`, `setControllers`, rename and art change would re-execute the feed
  // and re-push sixty rows to the DM — the one client doing all of those things. That is the
  // trade `visiblePositions` refuses one module over, and the trade `feed.list`'s `playerId`
  // argument was removed for; having dropped a `players` range read for that reason, leaving a
  // `tokens` one would be the same mistake with a different table.
  const [characters, visible] = await Promise.all([
    allCharacters(ctx, gameId),
    isDm ? EMPTY_IDS : visibleCharacterIds(ctx, gameId, sceneId, false),
  ])

  const readable = new Set<Id<'characters'>>()
  for (const character of characters) {
    if (!mayHearOf(character, isDm, visible)) continue
    if (isWithheldAsReserved(character, isDm)) continue
    readable.add(character._id)
  }
  return readable
}

/**
 * No sight to add. Frozen and shared, because it is returned rather than built and a Convex
 * isolate outlives the request that warmed it — the hazard `creatureExtras` copies against.
 */
const EMPTY_IDS: ReadonlySet<Id<'characters'>> = Object.freeze(new Set<Id<'characters'>>())

/**
 * Names for the characters seats are holding, for the lobby roster.
 *
 * Point gets over the handful of characters actually held, rather than a range read
 * of the table. A range read is invalidated by any insert into its range, so adding
 * a character nobody holds would still re-run the roster query and re-push it to
 * every client; point reads are tracked per document, so only a rename of a held
 * character does that. That reasoning came from `players.list`, which used to do
 * this itself — the read moved here because the leak guard is about which module
 * touches the table, not about what it does with the rows.
 *
 * NPCs are filtered out even though `claim` and `assign` both refuse them, because
 * a roster that could name one would be a spoiler leaking through a query nobody
 * thinks of as privileged. Two refusals and a filter is not redundancy here; it is
 * the filter being where the payload is built.
 *
 * ⚠️ **This is the second place a reserved character's name would ship, and the
 * reserved filter below is not redundant with `publicCharacters`.** That function
 * builds the character list; this one builds the roster, which `players.list` prints as
 * `characterName` in the lobby and in the strip over the board. Withholding a row from
 * one payload and naming it in the other publishes exactly the thing reserving it was
 * meant to withhold — `Seraphine the Unarrived`, visible to the whole table, attached to
 * a seat nobody is sitting in. `convex/players.ts` anticipated this by name: its
 * projection nulls the id together with the name rather than beside it, so a filtered
 * character leaves neither half behind.
 *
 * Unreachable through the supported routes — `claim` refuses a reserved character and
 * `assign` clears the flag as it hands it over — which is the same standing the NPC
 * filter above has always had, and the same reason it is written anyway. The filter
 * belongs where the payload is built, not where the writes happen to be careful.
 */
export async function playerCharacterNames(
  ctx: QueryCtx,
  characterIds: Id<'characters'>[],
): Promise<Map<Id<'characters'>, string>> {
  const held = await Promise.all(characterIds.map((id) => ctx.db.get('characters', id)))

  const nameById = new Map<Id<'characters'>, string>()
  for (const character of held) {
    if (character && kindOf(character) === 'pc' && !isReservedCharacter(character)) {
      nameById.set(character._id, character.name)
    }
  }
  return nameById
}

/**
 * Loads a character and checks it belongs to this game. **Not** visibility-aware:
 * the callers are already DM-gated, and they need to look up an NPC by design.
 * `requireVisibleCharacter` is the form that applies `maySeeCharacter`.
 */
export async function getCharacterInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
): Promise<Doc<'characters'>> {
  const character = await ctx.db.get('characters', characterId)
  if (!character || character.gameId !== gameId) throw characterNotFound()
  return character
}

/**
 * Returns null for an unknown character, one in another game, and one this caller
 * may not see — all three collapsed into the same answer, so a query cannot be used
 * to tell an NPC apart from a character that does not exist.
 *
 * For queries, which paint a screen. Paired with `requireVisibleCharacter` below
 * exactly as `findSceneInGame` is paired with `getSceneInGame`, and for the same
 * reason: a mutation has nothing to render, so a bad id there should fail loudly
 * rather than write somewhere else.
 *
 * `controlled` is passed straight through to `maySeeCharacter` and is optional there for
 * the reason given on it: a caller with no seat in hand writes nothing and gets the
 * pre-grant rule, which is the fail-closed answer.
 */
export async function findVisibleCharacter(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  controlled?: ReadonlySet<Id<'characters'>>,
): Promise<Doc<'characters'> | null> {
  const character = await ctx.db.get('characters', characterId)
  if (!character || character.gameId !== gameId) return null
  return maySeeCharacter(character, isDm, controlled) ? character : null
}

/**
 * The same, refusing anything this caller may not see — with the identical error,
 * so "that NPC exists but is not yours" and "no such character" are one answer.
 *
 * ⚠️ **The call sites that pass nothing do so deliberately.** `claim` and `assign` call
 * this with `isDm` hard-coded false so that neither the DM code nor a grant can make a
 * monster a playable hero, and `rename` is a write that was never meant to widen with a
 * grant. Omitting the argument is how each of those says so; adding it "for consistency"
 * would change what all three of them mean.
 */
export async function requireVisibleCharacter(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  controlled?: ReadonlySet<Id<'characters'>>,
): Promise<Doc<'characters'>> {
  const character = await getCharacterInGame(ctx, gameId, characterId)
  if (!maySeeCharacter(character, isDm, controlled)) throw characterNotFound()
  return character
}

export function publicSheet(character: Doc<'characters'>): PublicSheet {
  // Both halves or neither. `creatureExtras` returns null for a retired entry key, and a
  // payload carrying the selections with no labels beside them would put the panel in a
  // state it has no rendering for — a CR banner with nothing to name. `presetExtras` takes
  // the identical stance on a retired class.
  const creature = bestiaryOf(character)
  const extras = creatureExtras(character)

  return {
    _id: character._id,
    name: character.name,
    sheet: resolveSheet(character),
    preset: presetOf(character),
    extras: presetExtras(character),
    creature: creature && extras ? creaturePayload(creature, extras) : null,
  }
}

/** Bounded count, so `characters.create` can enforce MAX_CHARACTERS_PER_GAME. */
export async function countCharactersInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const characters = await allCharacters(ctx, gameId)
  return characters.length
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

async function vitalsFor(
  ctx: QueryCtx,
  characterId: Id<'characters'>,
): Promise<Doc<'characterVitals'> | null> {
  return await ctx.db
    .query('characterVitals')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .unique()
}

/**
 * Current hit points, tolerating a missing row by reading as unhurt.
 *
 * The row is written alongside every character created from this milestone on, so
 * the fallback is only reached by a character made in Milestone 1 — which is
 * exactly why it exists rather than a migration existing. A character with no
 * recorded damage has taken none.
 */
export function currentHpOf(
  vitals: Doc<'characterVitals'> | null,
  sheet: CharacterSheet,
): number {
  return vitals ? clampHp(vitals.currentHp, sheet.maxHp) : sheet.maxHp
}

/**
 * What this caller is allowed to know about how everyone is doing.
 *
 * Two rules, and the difference between them is the whole milestone:
 *
 * - **Player characters are exact for everybody.** requirements.md asks for `20/45`
 *   above a hero's token, and the party knowing its own hit points is not a secret
 *   in any edition.
 * - **NPCs are a band for a player and exact for the DM**, and a player is only
 *   told about an NPC whose token they can already see.
 *
 * That last clause is why this takes `visibleNpcIds` rather than working it out.
 * Sending a band for every NPC in the game would leak a *count* — a player reading
 * twelve entries knows the DM has twelve monsters prepared, which is the same
 * category of spoiler as the scene names ADR 0004 refused to send. The set comes
 * from `boardCharacterAccess` in lib/board.ts, so the question "may I see this
 * creature at all?" is still answered by the token choke point rather than
 * re-decided here.
 *
 * ⚠️ **`controlled` is a deliberate, narrow widening of this milestone's headline
 * secret, and the same one pass bounds it.** A player the
 * DM has granted a creature receives its **exact** hit points rather than a band. That
 * is not a softening of the rule but the other half of what a grant means: `HpControls`
 * renders its `−`/`+` only on the `exact` variant, on the stated grounds that a caller
 * who may edit hit points is always sent them, so a granted player with a band would get
 * the party's wolf with no way to take damage on it — a feature that looks broken rather
 * than restricted. The bound is that `controlled` is built from the same visible-token
 * set the paragraph above describes, so it can only ever widen a creature the caller can
 * already see standing on their board; it opens nothing new, it upgrades what a grant
 * already opened. Everything ungranted is untouched, which is what the payload-scan test
 * and its positive control exist to prove rather than assert.
 */
export async function visibleVitals(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  visibleNpcIds: Set<Id<'characters'>>,
  controlled: ReadonlySet<Id<'characters'>>,
): Promise<PublicVitals[]> {
  // Concurrent, because neither read depends on the other. This is the health-bar
  // subscription and it re-runs on every point of damage, for each distinct
  // argument set — the DM's and the players' are different cache entries — so one
  // avoidable round trip here is one on every hit at the table.
  //
  // The vitals side is a bounded range read rather than a point get per character:
  // that is what `gameId` is on the row for. A character holds at most one row, so
  // the per-game character bound is the right one for both.
  const [characters, rows] = await Promise.all([
    allCharacters(ctx, gameId),
    ctx.db
      .query('characterVitals')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .take(MAX_CHARACTERS_PER_GAME),
  ])
  const byCharacter = new Map(rows.map((row) => [row.characterId, row]))

  const out: PublicVitals[] = []
  for (const character of characters) {
    const sheet = resolveSheet(character)
    // ⚠️ **Read off the *resolved* sheet, and do not "optimise" this to `kindOf`.**
    //
    // The argument for doing so is a good one everywhere else in this module and is written
    // out on `kindOf` itself: the answer is one stored field, and reaching through a corpus
    // to get it costs a lookup and several object copies per character on a subscription
    // that re-runs on every point of damage. `maySeeCharacter` takes that trade for exactly
    // that reason.
    //
    // It is the wrong trade here, because this is the *second* place the same question is
    // asked, and the value of a second answer is entirely in it being reached by a different
    // route. A discriminator that had come to answer `pc` for a monster — a fifth stored
    // kind, a schema push read by an older deployment mid-deploy — would defeat
    // `maySeeCharacter` and this branch together if both read it, and only the first if
    // they do not. `resolveSheet` returns `kind: 'npc'` for a monster because it built an
    // `NpcSheet`, which is a fact about the object in hand rather than a claim on the
    // document. That is a guard worth a library lookup.
    const isNpc = sheet.kind === 'npc'
    if (isNpc && !isDm && !visibleNpcIds.has(character._id)) continue

    const vitals = byCharacter.get(character._id) ?? null
    const current = currentHpOf(vitals, sheet)

    // The two published sheet numbers, computed **above** the branch because both
    // variants carry them — see the ⚠️ on `publicVitalsValidator`. Deliberately not
    // inside either arm: two copies of one expression is how a badge comes to mean
    // something different on a monster than on a hero.
    //
    // ⚠️ **One call for the pair**, and it was two — `passivePerceptionFor` for one of them
    // and a hand-written finite check for the other, which is one decision at two altitudes
    // and re-implemented lib/sheet.ts's module-private `finiteOrNull`. `coinStatsOf` owns
    // both, so *absent* means the same thing for both.
    //
    // ⚠️ **Free.** `resolveSheet` ran at the top of this loop already, for the kind test
    // and for `maxHp`, so neither of these is a read — which is what made publishing them
    // a decision about secrecy rather than about cost. They are *sheet* facts on a
    // *vitals* channel that re-runs on every point of damage, which is the honest thing
    // to know: a hit re-pushes two constants. The alternative is a sixth subscription
    // that idles, and that is not worth a socket.
    const stats = coinStatsOf(sheet)

    // The one branch that decides what leaves the server. Note that the exact
    // numbers are never even assembled on the losing side of it: the band is
    // computed from values that stay in this scope, so there is no object holding
    // `current` that a later edit could accidentally spread into the payload.
    //
    // The grant is a third term on the *existing* condition rather than a second
    // branch, and keeping it that way is the point: one expression decides, and the
    // losing side still assembles no number. A creature the caller controls falls
    // through to the same `exact` payload a hero does, because a granted pet's hit
    // points are the granted player's business — see the ⚠️ on this function.
    if (isNpc && !isDm && !controlled.has(character._id)) {
      out.push({
        kind: 'band',
        characterId: character._id,
        band: healthBand(current, sheet.maxHp),
        ...stats,
      })
    } else {
      const isPc = sheet.kind === 'pc'
      // One call for the pair, on `coinStatsOf`'s reason: this is the health-bar
      // subscription and it re-runs on every point of damage, so two calls that clamp the
      // same two numbers twice is work done once per character per hit for nothing.
      const deathSaves = deathSavesOf(vitals)
      out.push({
        kind: 'exact',
        characterId: character._id,
        current,
        max: sheet.maxHp,
        hitDiceCount: isPc ? sheet.hitDice.count : null,
        spentPerRest: vitals?.spentPerRest ?? [],
        // Through the same helper the mutations use, so the number a player reads
        // off the panel and the number a spend starts from cannot disagree. An
        // absent value means none have been spent, for the same reason a missing
        // row means undamaged.
        hitDiceRemaining: isPc ? hitDiceRemainingOf(vitals, sheet) : null,
        // ⚠️ **Inside the `exact` arm and nowhere else.** Every one of these is read through
        // its accessor rather than off the row, so an absent field means the same thing here
        // as it does to the mutation that writes it — and, more to the point, so the losing
        // side of the branch above assembles none of them. The band payload is built from
        // values that never enter this scope, which is the property the whole union exists
        // to keep and the reason five new fields cost it nothing.
        //
        // Not narrowed to `isPc`, unlike the two hit-dice fields above. A creature can be
        // given temporary hit points and can be marked down as failing a death save if the
        // DM is running a boss that way; only hit *dice* are a thing the reduced sheet has
        // no room for, which is what `hitDiceRemainingOf` returns 0 for and the reason those
        // two are `null` rather than 0 here.
        temporaryHp: temporaryHpOf(vitals),
        deathSaveSuccesses: deathSaves.successes,
        deathSaveFailures: deathSaves.failures,
        heroicInspiration: heroicInspirationOf(vitals),
        spentUses: spentUsesOf(vitals),
        // Clamped against the derivation rather than sent raw, which is the one thing this
        // field does that `spentUses` above deliberately does not — see `spentSlotsOf`. The
        // lookup is a `Record` index on a stored class key and costs no read, so unlike
        // `coinStatsOf` there is not even a resolved sheet to be reused: it is free in the
        // stronger sense.
        spentSlots: spentSlotsOf(vitals, spellSlotsOf(character)),
        ...stats,
      })
    }
  }

  return out
}

/**
 * The only place the optional `temporaryHp` is read. **Zero when absent**, which is every
 * row written before the 2024 conversion and most rows at any moment.
 *
 * ⚠️ **Zero rather than null, and that is not this file's usual answer.** `passivePerceptionOf`
 * answers `null` for an absent number on the grounds that *absent* and *zero* are different
 * facts — a creature whose DM never recorded one does not have a passive perception of nought.
 * Temporary hit points are the opposite: **absent and zero are the same fact.** There is no
 * such thing as a character with an unrecorded quantity of them, only one with none, so a
 * `null` here would be a state the sheet would then have to decide how to print.
 *
 * ⚠️ **They are not part of `maxHp` and not healing.** `clampTemporaryHp` in lib/sheet.ts
 * takes no ceiling off the sheet for exactly that reason — see its docblock, which is where
 * that argument lives rather than being restated at every reader.
 */
export function temporaryHpOf(vitals: Doc<'characterVitals'> | null): number {
  return clampTemporaryHp(vitals?.temporaryHp ?? 0)
}

/**
 * The death-save tally: how many of each column are ticked.
 *
 * ⚠️ **A COUNTER, AND NOT AN ADJUDICATION — and this is the paragraph that reverses a stated
 * never, so it is worth reading rather than skimming.** The milestone this one replaced put
 * death saving throws out of scope in the words *"never in scope"*, in the same register as
 * concentration and the action economy, and ADR 0016 reverses that deliberately and on the
 * record. What makes the reversal admissible is the same test every previous one passed:
 * **does something now change a number a player rolls against without a person asking it
 * to?** It does not. Nothing here decides that the character dies at three failures, nothing
 * stabilises them at three successes, nothing refuses a heal, nothing sets a marker, nothing
 * is announced, and no die anywhere in the application rolls differently. Three ticked boxes
 * is three ticked boxes — the same register as a condition pip on a coin, a creature's loot
 * being a line of text, and a spell's casting time being printed and never counted.
 *
 * What it buys is the thing a table at 0 hit points genuinely loses track of, which is
 * precisely the argument `spentPerRest` was admitted on.
 *
 * ⚠️ **The moment anything reads the return value to decide something, this stops being
 * true** and needs an amendment and an ADR of its own, exactly as CR scaling would. A guard
 * test is not written for it here because there is no vocabulary to grep for — the honest
 * check is that no caller of this function branches on what it returns.
 *
 * Both columns come back from one accessor because they are one tally: two accessors would
 * be two places to decide independently what an absent row means, and a sheet that showed
 * three failures and no successes because one of them defaulted differently is a sheet
 * somebody acts on.
 */
export function deathSavesOf(vitals: Doc<'characterVitals'> | null): {
  successes: number
  failures: number
} {
  return {
    successes: clampDeathSaves(vitals?.deathSaveSuccesses ?? 0),
    failures: clampDeathSaves(vitals?.deathSaveFailures ?? 0),
  }
}

/**
 * The only place the optional `heroicInspiration` flag is read. **False when absent**, which
 * is every row written before the 2024 conversion.
 *
 * A boolean and nothing else: it is not spent by anything, not required by anything, and no
 * reroll in this application consults it. The 2024 Human regains it on a long rest, which is
 * the one place it touches another rule — and even that is species *content*, so it does not
 * arrive here.
 *
 * ⚠️ **It is deliberately not folded into `spentUses`**, which is the obvious economy and the
 * wrong one. A spent use is a count against a maximum somebody wrote down; this is a flag
 * with no maximum and no owning entry, so expressing it as `{ key: 'heroic-inspiration',
 * spent: 1 }` would make its absence indistinguishable from an unrecognised key and would
 * hand the sheet renderer a row it has nothing to draw a stepper against.
 */
export function heroicInspirationOf(vitals: Doc<'characterVitals'> | null): boolean {
  return vitals?.heroicInspiration ?? false
}

/**
 * How many uses of each limited-use thing have been spent, **with the legacy array folded
 * in.**
 *
 * ⚠️ **`spentPerRest` is kept rather than migrated in place, and this function is what makes
 * that survivable.** That field is a list of *keys*, where a key present means the one thing
 * the character had has been used; `spentUses` counts, because 2024 is full of features with
 * two, three or proficiency-bonus-many uses. The fold is therefore a concatenation under one
 * rule — **every legacy key is exactly one spent use** — which is what the old field always
 * meant, said in the new field's vocabulary.
 *
 * The counted row wins on a collision. That is the direction that makes the eventual
 * backfill idempotent and interruptible, for `speciesKeyOf`'s reason: a migration that has
 * written the new field for half the rows leaves both halves answering correctly, and a
 * re-run changes nothing. The other order would make the migration's own writes invisible
 * until the narrowing commit deleted the legacy field.
 *
 * Legacy keys come first so that the order a client renders is stable across the migration —
 * a character whose Relentless Endurance jumped to the bottom of the list on the day the
 * backfill ran would look like something had been reset.
 */
export function spentUsesOf(
  vitals: Doc<'characterVitals'> | null,
): { key: string; spent: number }[] {
  const counted = vitals?.spentUses ?? []
  const byKey = new Map(counted.map((use) => [use.key, Math.max(0, Math.round(use.spent))]))

  const out: { key: string; spent: number }[] = []
  for (const key of vitals?.spentPerRest ?? []) {
    if (byKey.has(key)) continue
    out.push({ key, spent: 1 })
  }
  for (const use of counted) out.push({ key: use.key, spent: byKey.get(use.key) ?? 0 })
  return out
}

/**
 * HOW MANY SPELL SLOTS OF EACH LEVEL HAVE BEEN SPENT. **The one place the optional
 * `spentSlots` is read**, and empty when absent — which is every row written before this
 * field existed and most rows at any moment.
 *
 * ⚠️ **It clamps against the derivation, and `spentUsesOf` beside it deliberately does not.**
 * That asymmetry is the interesting part of this function and it is not an inconsistency:
 *
 * - A **counted use** has a maximum written on a *sheet entry*, which the DM can edit and
 *   delete. `shortRest` therefore leaves an undeclared key alone on purpose —
 *   `restores`' fail-conservative direction applied to data — because a key with no
 *   declaration might have been anything, and clearing it hands out a resource nobody asked
 *   for.
 * - A **spell slot's** maximum is not editable at all. It is `spellSlotsFor(classKey,
 *   level)`, a pure function of two stored selections, so *how many a character has* is never
 *   unknown and never stale. Three spent 2nd-level slots on a character who has two is not a
 *   fact that might mean something; it is arithmetic that has gone wrong, and the honest
 *   reading is two.
 *
 * **Read is clamped and storage is not**, which is `clampHp`'s and `clampHitDice`'s
 * arrangement: a row against a level the character has temporarily lost survives untouched,
 * so a DM who drops somebody to level 1 to check something and puts it straight back finds
 * the counts where they left them. `spellSlotBars` in lib/slots.ts is the other half of that
 * — it iterates the derivation, so a stale row draws nothing rather than drawing wrongly.
 *
 * `slots` is a required parameter with no default. A default would be `null`, which means
 * *this character has no slots* and would silently return the empty array for everybody —
 * a plausible-looking accessor that erases the whole feature, on a field whose absence is
 * also its resting state and therefore invisible in a fixture.
 */
export function spentSlotsOf(
  vitals: Doc<'characterVitals'> | null,
  slots: SpellSlots | null,
): SpentSlot[] {
  const out: SpentSlot[] = []
  for (const row of vitals?.spentSlots ?? []) {
    const spent = clampSpent(row.spent, maxSlotsAt(slots, row.level))
    // Nought is absence, on this codebase's rule that two spellings of none is what every
    // field-by-field comparison then has to agree about — and the same rule `setUsesSpent`
    // states for a count of zero.
    if (spent > 0) out.push({ level: row.level, spent })
  }
  return out
}

/** Hit dice left to spend, defaulting to the full complement on a sheet that has them. */
export function hitDiceRemainingOf(
  vitals: Doc<'characterVitals'> | null,
  sheet: CharacterSheet,
): number {
  if (sheet.kind !== 'pc') return 0
  return clampHitDice(vitals?.hitDiceRemaining ?? sheet.hitDice.count, sheet.hitDice.count)
}

/**
 * What one writer may change about a vitals row: everything on it that is state, and
 * neither of the two pointers.
 */
type VitalsPatch = {
  currentHp?: number
  hitDiceRemaining?: number
  spentPerRest?: string[]
  temporaryHp?: number
  deathSaveSuccesses?: number
  deathSaveFailures?: number
  heroicInspiration?: boolean
  spentUses?: { key: string; spent: number }[]
  spentSlots?: SpentSlot[]
}

/**
 * Insert or update a character's vitals row. **The only writer**, and the only
 * place that knows what a fresh one looks like.
 *
 * It is one function because it was briefly two, and the two had already drifted:
 * writing hit points seeded a new row without hit dice, writing hit dice seeded one
 * at full health, and neither had chosen to differ from the other. A table this
 * small should not have two ideas of what a new row is.
 *
 * The row is written with every character created from this milestone on, so the
 * insert branch is reached only by a Milestone 1 character taking its first damage
 * — which is also why the defaults have to be the undamaged ones rather than
 * anything derived from the caller's patch.
 */
async function upsertVitals(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  // Widened field by field rather than made `Partial<Doc<'characterVitals'>>`, which is the
  // shorter thing to write and would let a caller patch `gameId` or `characterId` — the two
  // fields on this row that must never move, since `visibleVitals` joins on the second and
  // reads the whole table by the first.
  patch: VitalsPatch,
): Promise<void> {
  const existing = await vitalsFor(ctx, character._id)
  if (existing) {
    await ctx.db.patch('characterVitals', existing._id, patch)
    return
  }

  const sheet = resolveSheet(character)

  // ⚠️ **The rest of the patch is carried through, and the version that dropped it was
  // silently lossy.** This insert used to name `currentHp` and `hitDiceRemaining` and
  // nothing else, so a caller asking for anything *other* than those two — temporary hit
  // points, a death-save tally, a spent count — got a fresh row with the field missing and
  // a return value saying it had been written. Unreachable at the time, because the only
  // such caller was `setUsesSpent` and the one character that can lack a row is a Milestone
  // 1 one, which has no ability to spend; the 2024 fields make it reachable, and a write
  // path that quietly discards half of what it was handed is not a thing to leave standing
  // on the grounds that nobody has walked into it yet.
  //
  // Destructured rather than spread whole so the two fields the insert **decides for
  // itself** cannot be overwritten by the same object that supplies them: a fresh row is
  // undamaged and holds its full complement of hit dice, and a patch only ever says which
  // of those two defaults to displace.
  const { currentHp, hitDiceRemaining, ...rest } = patch

  await ctx.db.insert('characterVitals', {
    gameId: character.gameId,
    characterId: character._id,
    currentHp: currentHp ?? sheet.maxHp,
    // Spread, never `hitDiceRemaining: undefined` — `undefined` is not a Convex
    // value, so naming the field and giving it that is a different write from
    // omitting it. See the note on `insertCharacter`. `rest` is safe for the same
    // reason from the other side: a key is in it only because the caller named it.
    ...(sheet.kind === 'pc'
      ? { hitDiceRemaining: hitDiceRemaining ?? sheet.hitDice.count }
      : {}),
    ...rest,
  })
}

/**
 * Apply a change to current hit points and return what was actually stored.
 *
 * `change` is given the value now and returns the value wanted, which is what lets
 * a delta and an absolute set share one path — and, more usefully, lets both read
 * and write the row **once**. Reading through a separate `readCurrentHp` and then
 * writing through a separate `writeCurrentHp` cost two index lookups of the same
 * document on the mutation a DM fires most often during a fight, and widened the
 * transaction's read set for nothing.
 *
 * The clamp is applied here rather than trusted from the caller, so no client can
 * heal something past full or beat it below zero.
 *
 * ⚠️ **Coming back up from nought wipes the death-save tally, and this is the one place
 * that happens** — which is why it is here rather than in the two mutations that heal.
 * `adjustHp`, `setHp` and `longRest` are three doors onto one fact, and a rule written at
 * a door is a rule the next door does not have. See `clearedDeathSaves`.
 */
export async function changeCurrentHp(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  change: (current: number) => number,
): Promise<number> {
  const sheet = resolveSheet(character)
  const vitals = await vitalsFor(ctx, character._id)

  const before = currentHpOf(vitals, sheet)
  const next = clampHp(change(before), sheet.maxHp)
  const patch: VitalsPatch = {
    currentHp: next,
    ...clearedDeathSaves(vitals, before, next),
  }

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, patch)
  } else {
    await upsertVitals(ctx, character, patch)
  }
  return next
}

/**
 * The death-save half of a hit-point write: `{}` almost always, and both columns zeroed on
 * the one transition that makes the tally meaningless.
 *
 * ⚠️ **A COUNTER BEING RESET BY THE THING THAT ENDED THE SITUATION IT COUNTED, AND NOT AN
 * ADJUDICATION.** Nobody died and nobody was stabilised. Three ticked boxes were a record
 * of rolls made *while a character was at nought hit points*, and a character who is no
 * longer at nought is a character those boxes have stopped being about — so clearing them
 * is the same act as rubbing out a tally on a whiteboard when the fight moves on. Nothing
 * here decides that the third failure kills anybody, nothing refuses a heal at three, and
 * no die anywhere rolls differently. See `deathSavesOf` and `MAX_DEATH_SAVES`, where the
 * reversal of a stated *never* is argued rather than assumed; **the moment something reads
 * this tally to decide an outcome, that argument stops holding** and needs an amendment and
 * an ADR of its own.
 *
 * Three properties, and each of them is the answer to an edit somebody would otherwise
 * make:
 *
 * - **Only on a transition from nought to above it.** Not on every heal, because a
 *   character on 5 who goes to 8 was never dying and has no tally to wipe — and clearing
 *   there would mean a DM who had been keeping the tally by hand for a *player* they had
 *   just topped up lost it to a point of healing.
 * - **Never on damage.** A character taken *to* nought is a character the tally is about to
 *   be for; zeroing it on the way down would be the only formulation where the counter is
 *   destroyed at the exact moment it starts mattering.
 * - **Nothing written when there is nothing to clear**, which is the common case by a very
 *   long way. `characterVitals` is rewritten whole on every patch and this row feeds the
 *   health-bar subscription, so naming two fields that are already nought — or, worse,
 *   *adding* them to a row that never had them — would re-push every bar at the table on
 *   every point of healing in the game.
 */
function clearedDeathSaves(
  vitals: Doc<'characterVitals'> | null,
  before: number,
  after: number,
): { deathSaveSuccesses?: number; deathSaveFailures?: number } {
  if (before > 0 || after <= 0) return {}
  const { successes, failures } = deathSavesOf(vitals)
  if (successes === 0 && failures === 0) return {}
  return { deathSaveSuccesses: 0, deathSaveFailures: 0 }
}

/**
 * The same for hit dice. A monster has none, so there is nothing to write and the
 * answer is zero — returning early rather than clamping to a ceiling of zero and
 * patching anyway, because schema.ts says the field is player characters only and a
 * write that put `hitDiceRemaining: 0` on every NPC the DM ever prodded would make
 * that comment quietly false. A field documented as absent should be absent.
 */
export async function changeHitDiceRemaining(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  change: (remaining: number) => number,
): Promise<number> {
  const sheet = resolveSheet(character)
  if (sheet.kind !== 'pc') return 0

  const vitals = await vitalsFor(ctx, character._id)
  const next = clampHitDice(change(hitDiceRemainingOf(vitals, sheet)), sheet.hitDice.count)

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { hitDiceRemaining: next })
  } else {
    await upsertVitals(ctx, character, { hitDiceRemaining: next })
  }
  return next
}

/**
 * Write temporary hit points outright. **The one writer of the field**, paired with
 * `temporaryHpOf` as the one reader.
 *
 * ⚠️ **The clamp takes no ceiling off the sheet, and supplying one is the obvious wrong
 * edit.** Temporary hit points are **not part of `maxHp` and are not healing**: a character
 * on 3 of 8 may legitimately be holding 20 of them, and a character at full health with
 * fifteen is an ordinary state rather than an error to repair. `clampTemporaryHp` has no
 * parameter to pass a maximum to precisely so that `clampTemporaryHp(value, sheet.maxHp)`
 * is unwriteable — its docblock in lib/sheet.ts is where that argument lives, and
 * `MAX_TEMPORARY_HP` is a guard against a non-finite float64 reaching a stored row rather
 * than a statement about the character.
 *
 * ⚠️ **It SETS, and it deliberately does not take the maximum against what is stored.**
 * 5e's rule is that temporary hit points do not stack — a second source replaces the first
 * only if it is larger — and this application **announces and counts** while the table
 * **adjudicates** (CLAUDE.md, *Rules scope*). `Math.max(stored, wanted)` is three
 * characters and it is the application deciding an outcome nobody asked it to decide: it
 * would make the number on screen disagree with the number a person typed, and it would
 * leave no way at all to correct a mistake downwards. So a person picks the larger of two
 * numbers, exactly as they do at a table with a pencil, and this stores what they picked.
 */
export async function writeTemporaryHp(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  temporaryHp: number,
): Promise<number> {
  const vitals = await vitalsFor(ctx, character._id)
  const next = clampTemporaryHp(temporaryHp)

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { temporaryHp: next })
  } else {
    await upsertVitals(ctx, character, { temporaryHp: next })
  }
  return next
}

/**
 * Write both columns of the death-save tally. **The one writer**, paired with
 * `deathSavesOf` as the one reader.
 *
 * ⚠️ **NOTHING HERE KILLS ANYBODY, AND THIS IS THE FUNCTION A READER WILL BE MOST TEMPTED
 * TO MAKE KILL SOMEBODY.** Three failures is three pips filled in: no hit point moves, no
 * marker is set, no feed line is written, no band is recomputed and no heal is refused.
 * CLAUDE.md's *Rules scope* names *"no death save kills a character"* as a standing
 * exclusion of the 5e (2024) conversion, in the same register as a condition pip that
 * halves no speed and a spell row that prints *Concentration* and drops nothing — and
 * `deathSavesOf` carries the longer argument, because putting death saving throws in at all
 * reversed a stated *never* and was admissible only on the grounds that the counter decides
 * nothing. **A branch that reads three and does something is a spec amendment and an ADR,
 * not a tidy-up.**
 *
 * ⚠️ **Both columns in one call, and splitting this into two writers would be a bug with a
 * shape.** They are one tally on one row of boxes: two mutations means a client that writes
 * half of it, and a sheet showing two successes and a stale failure is a sheet somebody acts
 * on. It is the same reasoning `deathSavesOf` gives for answering both from one accessor.
 */
export async function writeDeathSaves(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  successes: number,
  failures: number,
): Promise<{ successes: number; failures: number }> {
  const vitals = await vitalsFor(ctx, character._id)
  const next = {
    deathSaveSuccesses: clampDeathSaves(successes),
    deathSaveFailures: clampDeathSaves(failures),
  }

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, next)
  } else {
    await upsertVitals(ctx, character, next)
  }
  return { successes: next.deathSaveSuccesses, failures: next.deathSaveFailures }
}

/**
 * Write the Heroic Inspiration flag. **The one writer**, paired with `heroicInspirationOf`
 * as the one reader.
 *
 * A boolean, and the whole of the feature: nothing grants it, nothing spends it, and no
 * reroll anywhere in this application consults it. The 2024 Human regains it on a long
 * rest, which is why `longRest` pointedly leaves it alone — that is a **species trait**
 * rather than a property of resting, and a rest that granted it would be the application
 * inventing a rule for the eight species that do not have it. Until species content says
 * otherwise it is a flag a person ticks, which is what this writes.
 *
 * No clamp, because a boolean has no out-of-range value to repair — the argument validator
 * is the whole of the normalisation, and the absence of a `clampHeroicInspiration` beside
 * the other two is that fact rather than an omission.
 */
export async function writeHeroicInspiration(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  heroicInspiration: boolean,
): Promise<boolean> {
  const vitals = await vitalsFor(ctx, character._id)

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { heroicInspiration })
  } else {
    await upsertVitals(ctx, character, { heroicInspiration })
  }
  return heroicInspiration
}

// ⚠️ **`setPerRestSpent` used to be here and is gone, deliberately — `spentPerRest` is now
// READ-ONLY until the narrowing commit.** It marked a key spent by adding it to the legacy
// array, and `setUsesSpent` below replaces it: 2024 has features with two, three or
// proficiency-bonus-many uses, and a list of keys cannot say *two*.
//
// Deleted rather than kept beside it, and that is the important half. Two writers against one
// fact is how the two fields would come to disagree — a spend through the old one and a
// hand-back through the new one leaves a key present in `spentPerRest` and absent from
// `spentUses`, which `spentUsesOf` then folds back into *one spent use* for ever. With one
// writer, the legacy array only ever shrinks: `longRest` clears it, nothing adds to it, and
// every existing row drains as characters sleep. That is what makes the narrowing a deletion
// rather than a migration.

/**
 * Set how many uses of one thing have been spent, or hand some back.
 *
 * `setPerRestSpent`'s successor, and it keeps that function's asymmetry deliberately — see
 * `characters.setUses`, where the check lives: **a spend is validated against what the
 * character actually has, and a hand-back never is.** That is what stops a stale key becoming
 * permanent when a DM changes somebody's species or deletes an entry.
 *
 * ⚠️ **It writes the counted field and leaves `spentPerRest` alone.** The legacy array is
 * folded in on *read* by `spentUsesOf`, and a write that also rewrote it would have to decide
 * what a legacy key means when its count goes to two — which is a question the old field
 * cannot answer. So the counted field is where every write from here lands, the legacy one
 * drains as characters take long rests, and the narrowing commit deletes it.
 *
 * A count of zero is stored as **absence from the array** rather than as `{ spent: 0 }`, on
 * this codebase's usual rule: two spellings of none is what every field-by-field rebuild then
 * has to agree about, and `firstDifference` in scripts/board-smoke.mjs reports the difference
 * as an extra element rather than as equality.
 */
export async function setUsesSpent(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  key: string,
  spent: number,
): Promise<{ key: string; spent: number }[]> {
  const vitals = await vitalsFor(ctx, character._id)
  const counted = (vitals?.spentUses ?? []).filter((use) => use.key !== key)
  const whole = Number.isFinite(spent) ? Math.max(0, Math.round(spent)) : 0
  const next = whole > 0 ? [...counted, { key, spent: whole }] : counted

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { spentUses: next })
  } else {
    await upsertVitals(ctx, character, { spentUses: next })
  }
  // The folded view, so the caller's answer and the subscription's are the same shape and the
  // same list — a client that read one from the mutation and the other from the query would
  // otherwise see the legacy keys appear and disappear.
  return spentUsesOf({ ...(vitals ?? ({} as Doc<'characterVitals'>)), spentUses: next })
}

/**
 * Set how many spell slots of one level have been spent, or hand some back.
 *
 * `setUsesSpent`'s sibling one function up, and it keeps that function's asymmetry for a
 * different reason — see `characters.setSlots`, where the check lives. **A spend is refused
 * against a level the character has no slots at, and a hand-back never is.** There the reason
 * was a stale key becoming permanent; here it is a DM dropping somebody's level with slots
 * spent, which leaves counts the character can no longer justify and which a person must
 * still be able to clear.
 *
 * ⚠️ **Nothing calls this except a person pressing a pip.** No roll debits a slot, and
 * `feed.roll` does not reach this module — the header of lib/slots.ts is where that line is
 * argued. A caller who wants casting to spend a slot is proposing a rule and needs an ADR,
 * not a call site.
 *
 * **Kept ascending by level**, which is a canonical stored form rather than a rendering
 * decision: `spellSlotBars` iterates the derivation and would draw correctly from any order,
 * so this is `normaliseMarkers`' reason — what is stored is canonical, so a browser's
 * optimistic value and the server's are the same string of bytes and a field-by-field
 * comparison in `board-smoke.mjs` has one answer rather than a set of them.
 *
 * A count of zero is stored as **absence from the array** rather than as `{ spent: 0 }`, on
 * the rule `setUsesSpent` states.
 */
export async function setSlotsSpent(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  slots: SpellSlots | null,
  level: number,
  spent: number,
): Promise<SpentSlot[]> {
  const vitals = await vitalsFor(ctx, character._id)
  const others = (vitals?.spentSlots ?? []).filter((row) => row.level !== level)
  const whole = clampSpent(spent, maxSlotsAt(slots, level))
  const next = (whole > 0 ? [...others, { level, spent: whole }] : others).sort(
    (left, right) => left.level - right.level,
  )

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { spentSlots: next })
  } else {
    await upsertVitals(ctx, character, { spentSlots: next })
  }
  // Through the accessor, so the caller's answer and the subscription's are the same list
  // clamped the same way — a client reading one from the mutation and the other from the
  // query would otherwise see a stale row appear and disappear.
  return spentSlotsOf({ ...(vitals ?? ({} as Doc<'characterVitals'>)), spentSlots: next }, slots)
}

/**
 * A SHORT REST: whatever comes back on one comes back, and **nothing else happens.**
 *
 * ⚠️ **It does NOT heal and does NOT return hit dice, and both absences are the feature.**
 * *Spending* hit dice is what a short rest is *for* — returning them would make the button
 * undo the only thing the rest exists to let somebody do — and healing is what spending them
 * achieves, one die at a time, by a person choosing how many to burn. A short rest that
 * quietly restored hit points would take that choice away and would be the application
 * adjudicating a rule rather than counting one.
 *
 * `HitDiceControls`' history is the precedent and it is worth carrying: it shipped a button
 * labelled *"Long rest"* that only returned hit dice, and it read as broken the first time
 * somebody pressed it at 1 hit point, because the label promised the thing the button did not
 * do. This is the same trap pointing the other way, which is why both rests read their label
 * **and their explanation** out of `REST_LABELS` in lib/rest.ts rather than out of whichever
 * component drew them.
 *
 * What it does do is walk the counted uses and ask `restores` about each one. Three outcomes,
 * and the third is the interesting one:
 *
 * - **Fully back** — the entry recharges on a short rest, so the row goes.
 * - **Partly back** — the entry recharges on a long rest but hands one or more back on a
 *   short one, which is the *normal* case in 2024 and the reason `regainOnShortRest` exists
 *   at all. See `resourceValidator`.
 * - **Left alone** — including, deliberately, every key whose entry this sheet no longer has.
 *   That is `restores`' fail-conservative direction applied to data rather than to a union: a
 *   key with no declaration might have been anything, and leaving it spent costs one click on
 *   a counter anybody can edit, where clearing it hands out a resource nobody asked for.
 *
 * ⚠️ **SPELL SLOTS COME BACK FOR EXACTLY ONE CLASS, AND THE NEGATIVE IS THE LOAD-BEARING
 * HALF.** A Warlock's Pact Magic recharges on a short rest and every other caster's slots do
 * not — so a Warlock who sits down for an hour gets both slots back while the Wizard beside
 * them gets none. **A short rest that restored the Wizard's slots would be the application
 * inventing a rule**, which is the one failure this feature can have that nobody at the table
 * would report as a bug, because it looks like generosity.
 *
 * It is decided by `restores(SPELL_SLOT_RECHARGE[track], 'short')` and by nothing else: one
 * `Record` in lib/slots.ts says which rest a track answers to, and lib/rest.ts's one function
 * compares it against the rest that was taken. There is deliberately **no `track === 'pact'`
 * written here** — that is the same fact spelled a second time, in a file that would then have
 * to be edited if a third track ever arrived, and the whole reason `SPELL_SLOT_RECHARGE` is a
 * table.
 *
 * ⚠️ **It clears the whole array rather than restoring per level, and that is right rather
 * than lazy.** A short-rest track comes back *in full* — `restores` answers a boolean because
 * there is no partial case for slots, unlike `regainOnShortRest` above — so there is nothing
 * to subtract. A per-level loop would be arithmetic with one possible answer.
 *
 * `spentPerRest` is untouched, because everything in it is a once-per-**long**-rest species
 * ability by construction — a short rest has nothing to say about it, and saying nothing is
 * the correct answer rather than an omission. ⚠️ **Temporary hit points and the death-save
 * tally are untouched for the same reason and are the two a reader will expect otherwise:**
 * both end on a *long* rest, where `longRest` clears them, and an hour sitting down neither
 * expires a ward somebody cast nor erases what happened while a character was at nought.
 */
export async function shortRest(ctx: MutationCtx, character: Doc<'characters'>): Promise<void> {
  const vitals = await vitalsFor(ctx, character._id)
  const counted = vitals?.spentUses ?? []
  const spentSlots = vitals?.spentSlots ?? []
  // Nothing spent is nothing to do. An early return rather than a patch of the same value,
  // because a write here would invalidate the health-bar subscription for every client at the
  // table every time somebody pressed a button that changed nothing. ⚠️ **Both fields, `&&`-ed
  // — the version that tested only the counted uses would silently decline to give a Warlock
  // its slots back whenever it happened to have spent nothing else.**
  if (counted.length === 0 && spentSlots.length === 0) return

  const sheet = resolveSheet(character)
  const declared = new Map<string, Resource>()
  for (const entry of sheetEntriesOf(sheet)) {
    const uses = usesOf(entry)
    if (uses) declared.set(entry.id, uses)
  }

  const next: { key: string; spent: number }[] = []
  for (const use of counted) {
    const uses = declared.get(use.key)
    if (uses === undefined) {
      next.push(use)
      continue
    }
    if (restores(uses.recharge, 'short')) continue
    const remaining = Math.max(0, Math.round(use.spent) - (uses.regainOnShortRest ?? 0))
    if (remaining > 0) next.push({ key: use.key, spent: remaining })
  }

  const slots = spellSlotsOf(character)
  const slotsReturn = slots !== null && restores(SPELL_SLOT_RECHARGE[slots.track], 'short')

  // Named field by field rather than built whole, so a track that keeps its slots is not
  // patched with the array it already holds: `characterVitals` is rewritten on every patch and
  // feeds the health-bar subscription, so re-writing an unchanged field re-pushes every bar at
  // the table. That is `clearedDeathSaves`' third property, applied to the other counter.
  const patch: VitalsPatch = {}
  if (counted.length > 0) patch.spentUses = next
  if (slotsReturn && spentSlots.length > 0) patch.spentSlots = []
  if (Object.keys(patch).length === 0) return

  // A row always exists by here — both arrays came out of one — so this is a patch rather than
  // an upsert, and the early return above is what makes that true rather than a guess.
  if (vitals) await ctx.db.patch('characterVitals', vitals._id, patch)
}

/**
 * A long rest: hit points back to full, every hit die returned, every once-per-rest
 * ability unspent.
 *
 * All three in one transaction and one button, because they are one thing that
 * happens at the table — a rest that restored hit points but left the hit dice spent
 * would be a rules bug somebody has to notice. Deliberately generous compared with
 * 5e, which returns only half a character's hit dice: the library spec asks for fast
 * levelling, minimal resource tracking and no edge cases, and "you get everything
 * back" is a rule a child can hold.
 *
 * ⚠️ **Four of the 2024 fields are cleared here and one deliberately is not.** Temporary hit
 * points end, the death-save tally is wiped, every counted use comes back and **every spell
 * slot comes back**, because all four are things a night's sleep undoes and a field the rest
 * never touches is a field that accumulates until somebody notices. The slots are cleared
 * unconditionally and without consulting the track: *long* is the longest rest there is, so
 * `restores` answers true for both — asking would be a branch with one outcome, and the
 * shortest way to make a Warlock's slots outlive a night is to write it.
 * **`heroicInspiration` is left exactly as it was**, and
 * that is the interesting one: the 2024 Human *regains* it on a long rest, which is a
 * **species trait** rather than a property of resting — granting it to everybody here would
 * be the application inventing a rule for the eight species that do not have it, in a
 * function that has no way to know which one it is looking at. It belongs to species content,
 * which is another branch's, and until then it is a flag a person ticks.
 */
export async function longRest(
  ctx: MutationCtx,
  character: Doc<'characters'>,
): Promise<void> {
  const sheet = resolveSheet(character)
  const vitals = await vitalsFor(ctx, character._id)

  // `currentHp` required rather than merely permitted, because the else-branch below inserts
  // this object as a whole row and the schema requires it there. Annotated rather than
  // inferred so that a field added to `VitalsPatch` and forgotten here is a type error at the
  // insert rather than a rest that quietly stops clearing something.
  const patch: VitalsPatch & { currentHp: number } = {
    currentHp: sheet.maxHp,
    ...(sheet.kind === 'pc' ? { hitDiceRemaining: sheet.hitDice.count } : {}),
    spentPerRest: [],
    temporaryHp: 0,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    spentUses: [],
    spentSlots: [],
  }

  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, patch)
  } else {
    await ctx.db.insert('characterVitals', {
      gameId: character.gameId,
      characterId: character._id,
      ...patch,
    })
  }
}

// ---------------------------------------------------------------------------
// Writes to the character document itself
// ---------------------------------------------------------------------------

export async function insertCharacter(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  name: string,
  sheet: StoredSheet,
): Promise<Id<'characters'>> {
  const characterId = await ctx.db.insert('characters', { gameId, name, sheet })
  // Resolved before the hit points are read off it, because a `preset` stores no
  // maximum — it stores a class and a level, and the number comes from the library.
  const resolved = resolveSheet({ sheet })

  // In the same transaction, so a character can never exist without somewhere to
  // record its hit points.
  //
  // The field is spread in rather than written as `hitDiceRemaining: undefined`,
  // and that is not fussiness: `undefined` is not a Convex value, so an insert
  // naming a field and giving it that is a different thing from an insert omitting
  // the field. This is exactly the shape of bug `npm run test:smoke` exists to
  // catch — convex-test does not apply Convex's own value validation, so the
  // version that spells it out would pass the suite and only misbehave against a
  // real deployment.
  await ctx.db.insert('characterVitals', {
    gameId,
    characterId,
    currentHp: resolved.maxHp,
    ...(resolved.kind === 'pc' ? { hitDiceRemaining: resolved.hitDice.count } : {}),
  })
  return characterId
}

/**
 * A second creature exactly like this one, at full hit points.
 *
 * **The whole of what stops five goblins sharing a hit-point pool.** Roll20's own
 * documentation tells a GM that eight identical goblins must have their bars *manually
 * unlinked* from the character sheet or damaging one damages all eight, and the community
 * wrote a script to work around it. A copy that makes its own character document costs
 * this function, so that trap is one this project simply does not build.
 *
 * It lives here because it writes both of the tables `lib/characters.ts` is the sole
 * reader of, and it is `insertCharacter` plus one line rather than a second insert path —
 * which is what guarantees the copy gets its `characterVitals` row in the same transaction
 * and gets it through the **spread** that keeps `hitDiceRemaining` absent rather than
 * `undefined`.
 *
 * ⚠️ **Full hit points is `insertCharacter`'s decision and not duplication's.** Creating a
 * character means starting it whole; the copy inherits that by reuse rather than by
 * restating it. Note the consequence, which is the point of the feature: the source's
 * *current* hit points are not copied, so duplicating a goblin on 3 hp gives a fresh one
 * at full. `spentPerRest` is absent for the same reason — a copy is a fresh creature, not
 * a resumed one.
 *
 * ⚠️ **The stored sheet passes through verbatim**, without `requireUsableSheet` and
 * without `normaliseStoredSheet`. Re-validating would let a bestiary key retired since the
 * source was stored refuse a duplication of a coin the DM is looking at — the same
 * asymmetry `librarySheet` already keeps, where choosing a retired archetype is refused on
 * write and reading one is tolerated. Re-normalising would be a write to a shape the DM
 * did not ask to change, which is *the source is never renamed* reached from the other
 * side. `?? defaultSheetFor('pc')` mirrors `characters.create`'s own line so the legacy-row
 * default lives in one shape.
 *
 * ⚠️ **`reserved` is carried, and it is fail-closed.** A hero the DM has withheld from the
 * table must not become visible by being copied. It is a second write rather than an
 * argument on `insertCharacter` because `reserved` is deliberately not part of the sheet
 * union — see the schema — and adding it to that signature would put the question in front
 * of every other caller.
 *
 * Nothing else is carried because there is nothing else: a claim lives on `players` and
 * not on `characters`, so a copy is unclaimed by construction. That is the same answer as
 * *a copy does not inherit granted controllers*, arrived at from the other table.
 */
export async function copyCharacter(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  name: string,
  source: Doc<'characters'>,
): Promise<Id<'characters'>> {
  const characterId = await insertCharacter(
    ctx,
    gameId,
    name,
    source.sheet ?? defaultSheetFor('pc'),
  )
  if (isReservedCharacter(source)) await setReserved(ctx, characterId, true)
  return characterId
}

export async function renameCharacter(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
  name: string,
): Promise<void> {
  await ctx.db.patch('characters', characterId, { name })
}

/**
 * Set a character aside for somebody who is not at the table yet, or hand it back.
 * **The one writer of the flag**, paired with `isReservedCharacter` as the one reader.
 *
 * Top-level rather than inside `sheet`, which is what makes this a two-line function
 * instead of a rebuild: reserving is not a property of the sheet, so `updateSheet`
 * cannot move it and `normaliseStoredSheet` has nothing to carry. Note that `false` is
 * *stored* rather than the field being removed, which a patch could also do: absent and
 * `false` are one answer through `isReservedCharacter`, so unreserving does not need to
 * reproduce the exact shape of a document that was never reserved. Compare the fields
 * that are spread in rather than named — those are optional on the *insert* path, where
 * `undefined` is not a Convex value and naming a field is a different write from
 * omitting it. Here the value is always a boolean the caller supplied.
 *
 * Two callers, and the second one is the interesting one: the DM's toggle, and
 * `characters.assign`, which clears the reservation as it hands the character over.
 * Unreserving and assigning are the two routes out of this state that the design names,
 * and assigning is one of them.
 */
export async function setReserved(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
  reserved: boolean,
): Promise<void> {
  await ctx.db.patch('characters', characterId, { reserved })
}

/**
 * Replaces the whole sheet, and re-clamps current hit points against the new
 * maximum in the same transaction.
 *
 * The re-clamp is the part worth stating: dropping a character's maximum from 45 to
 * 20 while they are sitting on 38 would otherwise leave them above their own
 * ceiling, which draws a health bar past the end of itself and hands a player a
 * band computed from a ratio greater than one.
 *
 * **Keeping the number is right for an edit and for a level-up, and wrong for a
 * challenge-rating shift** — `writeSheetRescalingHp` below is the other rule, and the
 * distinction between them is principled rather than a matter of taste.
 */
export async function writeSheet(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  sheet: StoredSheet,
): Promise<void> {
  await storeSheet(ctx, character, sheet, false)
}

/**
 * The same write, carrying current hit points across as a **fraction** rather than as a
 * number. For a challenge-rating shift.
 *
 * The difference from `writeSheet` is principled and worth stating in one place, because
 * it is the sort of thing that otherwise gets "tidied" into a single rule: **a level-up is
 * growth, and a CR shift is the same creature rescaled.** 5e adds a level's new hit points
 * to the current total, so keeping the number is as close as this app gets to that. A
 * shifted creature is not growing — its maximum was 45 because it was a CR 5 Troll and is
 * 20 because it is now a CR 2 one, so the number on its own means nothing and the fraction
 * is the fact worth preserving. A Troll on half its hit points comes out on half of the new
 * maximum; re-clamping instead would leave it on 20 of 20 and reading `healthy` when it had
 * been nearly dead.
 *
 * `reconcileHp` in lib/sheet.ts holds the rest of the rules — a corpse stays a corpse, an
 * untouched creature stays exactly untouched, and a living one never rounds down to `down`.
 */
export async function writeSheetRescalingHp(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  sheet: StoredSheet,
): Promise<void> {
  await storeSheet(ctx, character, sheet, true)
}

/**
 * The one sheet-write path, so that the two rules above cannot drift apart.
 *
 * `preserveHpFraction` is the whole difference between them, and it is a flag rather than a
 * second copy of this function for the reason `clampHitDice` records a few functions away:
 * arithmetic written out twice in this file has already failed once, and it failed "not
 * everywhere at once, but in whichever copy was edited last".
 */
async function storeSheet(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  sheet: StoredSheet,
  preserveHpFraction: boolean,
): Promise<void> {
  // ⚠️ **Read before the patch, and the ordering is load-bearing rather than tidy.** The
  // old maximum is the denominator of the fraction being preserved, and the only place it
  // exists is the document as it stands. `ctx.db.patch` does not mutate this local object
  // today, so reading it afterwards happens to work — which is precisely the kind of
  // accident one refactor removes, and the symptom would be silent rather than a failure:
  // every ratio would come out as 1, `reconcileHp` would hand back the new maximum, and
  // the feature would quietly become the clamp it was written to replace.
  //
  // Null rather than a number on the other path so that the cheap case stays cheap — a
  // level-up does not need the old maximum, and resolving a sheet to work one out costs a
  // library lookup and a copy of every feat and spell on it.
  const oldMax = preserveHpFraction ? resolveSheet(character).maxHp : null

  await ctx.db.patch('characters', character._id, { sheet })

  const vitals = await vitalsFor(ctx, character._id)
  if (!vitals) return

  // Resolved, because a level-up is a `preset` whose stored form has no maximum on
  // it at all — and levelling up is precisely when the maximum moves. Without this
  // the re-clamp below would be reading a number that is not there. A `bestiary` sheet
  // is the same case doubled: neither the maximum nor the rating it was scaled from is
  // written down anywhere on the document.
  const resolved = resolveSheet({ sheet })
  const patch: { currentHp: number; hitDiceRemaining?: number } = {
    // Both branches end inside `clampHp` — `reconcileHp` applies it itself, at both ends —
    // so neither can store a value above the new ceiling or below zero.
    currentHp:
      oldMax === null
        ? clampHp(vitals.currentHp, resolved.maxHp)
        : reconcileHp(vitals.currentHp, oldMax, resolved.maxHp),
  }
  // Through `clampHitDice`, like every other path. This branch used to cap at the
  // new complement without flooring at zero or rounding — so the one write whose
  // entire job is re-normalising a row against a changed sheet was the one that
  // would preserve a value the other three repaired. That is the ordinary way
  // copied arithmetic fails: not everywhere at once, but in whichever copy was
  // edited last.
  if (resolved.kind === 'pc' && vitals.hitDiceRemaining !== undefined) {
    patch.hitDiceRemaining = clampHitDice(vitals.hitDiceRemaining, resolved.hitDice.count)
  }
  await ctx.db.patch('characterVitals', vitals._id, patch)
}

/**
 * Every character in a game, each with its vitals row. For the purge tool in
 * `convex/admin.ts`, and for nothing a client can reach.
 *
 * It lives here rather than there for the reason every read of these two tables does:
 * `convex/admin.ts` is swept by `leakGuard.test.ts` like every other module, so it may
 * not query `characters` itself. That sweep reaching a brand-new destructive module
 * with no edit at all is the arrangement working.
 *
 * ⚠️ **`allCharacters` unfiltered, and the absence of `maySeeCharacter` is deliberate
 * rather than an oversight.** A purge does not ask who may read a sheet — it must take
 * the monsters too, since a deleted game's bestiary is precisely the residue this
 * exists to remove. What holds invariant 8 is the same thing that holds it for
 * `countCharactersInGame`: **a number leaves this function and never a row.**
 *
 * **None of the three repairs `characters.remove` performs are done here, and that is
 * the whole difference between deleting a character and deleting a game.** That
 * mutation releases the seat's claim and detaches the tokens standing on the character
 * because both of those *survive* it; here nothing survives, so a repair would be a
 * write to a document being deleted in the same transaction. The purge order in
 * `convex/admin.ts` is what makes that true, and it is written down there.
 */
export async function deleteCharactersInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const characters = await allCharacters(ctx, gameId)
  for (const character of characters) {
    await deleteCharacter(ctx, character._id)
  }
  return characters.length
}

/** Deletes a character and its vitals row. Placements and claims are the caller's. */
export async function deleteCharacter(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
): Promise<void> {
  const vitals = await vitalsFor(ctx, characterId)
  if (vitals) await ctx.db.delete('characterVitals', vitals._id)
  await ctx.db.delete('characters', characterId)
}

