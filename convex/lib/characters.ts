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
import { MAX_CHARACTERS_PER_GAME } from './games'
import type { BestiarySheet, CharacterSheet, StoredSheet } from './sheet'
// `resolveSheet` rather than `characterSheet`, and that one substitution is the
// whole of what Milestone 4 changed in this file. Everything below still asks for a
// `CharacterSheet` and still gets one; whether it was typed in by hand or assembled
// from the library, a race and the DM's overrides is settled before it arrives.
import type { CreatureExtras } from './resolve'
import { bestiaryOf, creatureExtras, kindOf, presetExtras, presetOf, resolveSheet } from './resolve'
import {
  bestiaryOverridesValidator,
  bestiarySheetValidator,
  characterKindValidator,
  clampHitDice,
  clampHp,
  healthBand,
  presetSheetValidator,
  reconcileHp,
  sheetValidator,
} from './sheet'

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
 */
export function maySeeCharacter(character: Doc<'characters'>, isDm: boolean): boolean {
  // `kindOf`, not `resolveSheet(...).kind`. The answer is one stored field, and a
  // predicate that guards a secret should not be reaching through the whole premade
  // library to find it — a content bug in any of 72 sheets would otherwise be able
  // to take this down, and with it `characters.list` for the entire table. See the
  // note on `kindOf`.
  return isDm || kindOf(character) === 'pc'
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** One row of the character list: who exists, and which seat is playing them. */
export const publicCharacterValidator = v.object({
  _id: v.id('characters'),
  name: v.string(),
  // The union spelled once, in lib/sheet.ts, rather than re-typed here. It is the
  // field that decides what a caller is allowed to know a character even is, and
  // two copies of it is one place for a third member to be added to only one.
  kind: characterKindValidator,
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
   * The **resolved** sheet — what to display and what Milestone 6 will roll. For a
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
 * THE MECHANICAL GUARD FOR THIS MILESTONE'S ACCEPTANCE TEST.
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
    // lib/races.ts — only which ones are gone has to travel.
    spentPerRest: v.array(v.string()),
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
 */
export async function publicCharacters(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  seats: Doc<'players'>[],
): Promise<PublicCharacter[]> {
  const characters = await allCharacters(ctx, gameId)

  // Built from the seats we were handed rather than a lookup per character.
  const holderByCharacter = new Map(
    seats.filter((seat) => seat.characterId).map((seat) => [seat.characterId!, seat]),
  )

  // Characters arrive oldest-first: Convex appends _creationTime to every index.
  return characters
    .filter((character) => maySeeCharacter(character, isDm))
    .map((character) => {
      const holder = holderByCharacter.get(character._id) ?? null
      return {
        _id: character._id,
        name: character.name,
        kind: kindOf(character),
        claimedByPlayerId: holder?._id ?? null,
        claimedByName: holder?.displayName ?? null,
        createdAt: character._creationTime,
      }
    })
}

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
 */
export async function playerCharacterNames(
  ctx: QueryCtx,
  characterIds: Id<'characters'>[],
): Promise<Map<Id<'characters'>, string>> {
  const held = await Promise.all(characterIds.map((id) => ctx.db.get('characters', id)))

  const nameById = new Map<Id<'characters'>, string>()
  for (const character of held) {
    if (character && kindOf(character) === 'pc') {
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
 */
export async function findVisibleCharacter(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
): Promise<Doc<'characters'> | null> {
  const character = await ctx.db.get('characters', characterId)
  if (!character || character.gameId !== gameId) return null
  return maySeeCharacter(character, isDm) ? character : null
}

/**
 * The same, refusing anything this caller may not see — with the identical error,
 * so "that NPC exists but is not yours" and "no such character" are one answer.
 */
export async function requireVisibleCharacter(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
): Promise<Doc<'characters'>> {
  const character = await getCharacterInGame(ctx, gameId, characterId)
  if (!maySeeCharacter(character, isDm)) throw characterNotFound()
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
 * from `visibleCharacterIds` in lib/board.ts, so the question "may I see this
 * creature at all?" is still answered by the token choke point rather than
 * re-decided here.
 */
export async function visibleVitals(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  visibleNpcIds: Set<Id<'characters'>>,
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

    // The one branch that decides what leaves the server. Note that the exact
    // numbers are never even assembled on the losing side of it: the band is
    // computed from values that stay in this scope, so there is no object holding
    // `current` that a later edit could accidentally spread into the payload.
    if (isNpc && !isDm) {
      out.push({
        kind: 'band',
        characterId: character._id,
        band: healthBand(current, sheet.maxHp),
      })
    } else {
      const isPc = sheet.kind === 'pc'
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
      })
    }
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
  patch: { currentHp?: number; hitDiceRemaining?: number; spentPerRest?: string[] },
): Promise<void> {
  const existing = await vitalsFor(ctx, character._id)
  if (existing) {
    await ctx.db.patch('characterVitals', existing._id, patch)
    return
  }

  const sheet = resolveSheet(character)
  await ctx.db.insert('characterVitals', {
    gameId: character.gameId,
    characterId: character._id,
    currentHp: patch.currentHp ?? sheet.maxHp,
    // Spread, never `hitDiceRemaining: undefined` — `undefined` is not a Convex
    // value, so naming the field and giving it that is a different write from
    // omitting it. See the note on `insertCharacter`.
    ...(sheet.kind === 'pc'
      ? { hitDiceRemaining: patch.hitDiceRemaining ?? sheet.hitDice.count }
      : {}),
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
 */
export async function changeCurrentHp(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  change: (current: number) => number,
): Promise<number> {
  const sheet = resolveSheet(character)
  const vitals = await vitalsFor(ctx, character._id)

  const next = clampHp(change(currentHpOf(vitals, sheet)), sheet.maxHp)
  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { currentHp: next })
  } else {
    await upsertVitals(ctx, character, { currentHp: next })
  }
  return next
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
 * Mark a once-per-long-rest ability spent, or hand it back.
 *
 * Keys are stored rather than counted, so a race with two of them tracks both
 * independently and a race that gains one later needs no migration — an absent key
 * is simply unspent. The set is bounded by what a race defines, which is at most a
 * couple, so there is no growth to worry about.
 *
 * The app never enforces the effect of any of these. It remembers whether one has
 * been used, which is the part a table actually forgets.
 */
export async function setPerRestSpent(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  key: string,
  spent: boolean,
): Promise<string[]> {
  const vitals = await vitalsFor(ctx, character._id)
  const current = new Set(vitals?.spentPerRest ?? [])
  if (spent) current.add(key)
  else current.delete(key)

  const next = [...current]
  if (vitals) {
    await ctx.db.patch('characterVitals', vitals._id, { spentPerRest: next })
  } else {
    await upsertVitals(ctx, character, { spentPerRest: next })
  }
  return next
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
 */
export async function longRest(
  ctx: MutationCtx,
  character: Doc<'characters'>,
): Promise<void> {
  const sheet = resolveSheet(character)
  const vitals = await vitalsFor(ctx, character._id)

  const patch = {
    currentHp: sheet.maxHp,
    ...(sheet.kind === 'pc' ? { hitDiceRemaining: sheet.hitDice.count } : {}),
    spentPerRest: [],
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

export async function renameCharacter(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
  name: string,
): Promise<void> {
  await ctx.db.patch('characters', characterId, { name })
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

/** Deletes a character and its vitals row. Placements and claims are the caller's. */
export async function deleteCharacter(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
): Promise<void> {
  const vitals = await vitalsFor(ctx, characterId)
  if (vitals) await ctx.db.delete('characterVitals', vitals._id)
  await ctx.db.delete('characters', characterId)
}

