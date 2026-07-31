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
import { MAX_CHARACTERS_PER_GAME } from './games'
import type { CharacterSheet, StoredSheet } from './sheet'
// `resolveSheet` rather than `characterSheet`, and that one substitution is the
// whole of what Milestone 4 changed in this file. Everything below still asks for a
// `CharacterSheet` and still gets one; whether it was typed in by hand or assembled
// from the library, a race and the DM's overrides is settled before it arrives.
import { kindOf, presetExtras, presetOf, resolveSheet } from './resolve'
import {
  characterKindValidator,
  clampHitDice,
  clampHp,
  healthBand,
  presetSheetValidator,
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
  return {
    _id: character._id,
    name: character.name,
    sheet: resolveSheet(character),
    preset: presetOf(character),
    extras: presetExtras(character),
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
 */
export async function writeSheet(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  sheet: StoredSheet,
): Promise<void> {
  await ctx.db.patch('characters', character._id, { sheet })

  const vitals = await vitalsFor(ctx, character._id)
  if (!vitals) return

  // Resolved, because a level-up is a `preset` whose stored form has no maximum on
  // it at all — and levelling up is precisely when the maximum moves. Without this
  // the re-clamp below would be reading a number that is not there.
  const resolved = resolveSheet({ sheet })
  const patch: { currentHp: number; hitDiceRemaining?: number } = {
    currentHp: clampHp(vitals.currentHp, resolved.maxHp),
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

