import { ConvexError, v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { detachCharacterFromTokens, visibleCharacterIds } from './lib/board'
import {
  changeCurrentHp,
  changeHitDiceRemaining,
  countCharactersInGame,
  deleteCharacter,
  longRest as takeLongRest,
  setPerRestSpent,
  findVisibleCharacter,
  getCharacterInGame,
  insertCharacter,
  publicCharacterValidator,
  publicCharacters,
  publicSheet,
  publicSheetValidator,
  publicVitalsValidator,
  renameCharacter,
  requireVisibleCharacter,
  visibleVitals,
  writeSheet,
  writeSheetRescalingHp,
} from './lib/characters'
import { bestiaryEntry } from './lib/bestiary'
import { crValidator } from './lib/creatures'
import {
  MAX_CHARACTERS_PER_GAME,
  findGameByCode,
  getGameByCode,
  requireDm,
  resolveDmAccess,
} from './lib/games'
import { requireCharacterName } from './lib/names'
import {
  findClaimHolder,
  getSeatInGame,
  listSeats,
  releaseClaimOn,
  setSeatCharacter,
} from './lib/players'
import { SUBCLASS_LEVEL } from './lib/classes'
import { perRestAbilities } from './lib/races'
import { bestiaryOf, presetOf, resolveSheet } from './lib/resolve'
import type { BestiarySheet, PresetSheet, SheetProblem, StoredSheet } from './lib/sheet'
import {
  MAX_MAX_HP,
  defaultSheetFor,
  isMonsterSheet,
  normaliseStoredSheet,
  sheetProblem,
  storedSheetProblem,
  storedSheetValidator,
} from './lib/sheet'

// Not one row of the `characters` or `characterVitals` tables is read in this file.
// Every read goes through lib/characters.ts, because an NPC's sheet is the same
// shape as a hero's and so no `returns:` validator can catch a leaked row — only a
// single reader that knows whether the caller holds the DM code can (CLAUDE.md
// invariant 8). A test greps these sources to keep it that way.
//
// The *numbers* on that sheet are the opposite case, and are guarded the opposite
// way: `publicVitalsValidator` is a discriminated union whose player-facing variant
// has no numeric field, so exact NPC hit points cannot be added to a player's
// payload without Convex throwing. One leak of each shape, one tool for each.

/**
 * The character this caller may change, or a throw.
 *
 * Refuses an NPC to anybody without the DM code, with the same error a fabricated
 * id gets — an NPC's existence is a spoiler, so the error channel gets no more
 * latitude than the payload channel did (ADR 0004's reasoning, applied to the other
 * secret).
 *
 * For a player character the rule is Milestone 2's, restated for sheets: control is
 * granted, never assumed. The seat that has claimed the character may change it,
 * the DM may change anything, and a character nobody is playing is the DM's.
 *
 * **The ceiling is the same one, and it is advisory.** `playerId` is a routing
 * argument, so anybody can pass another seat's id and walk straight past the check
 * below; it stops a misclick and says whose sheet it is, and it is not a defence
 * against somebody with the network tab open. That is acceptable here for the same
 * reason it is acceptable for moving a token — a hero's sheet is not a secret from
 * the party, and the worst outcome is a rude edit everybody can see. The refusal
 * above, which *does* guard a secret, keys off the DM code alone and nothing else.
 */
async function requireEditableCharacter(
  ctx: QueryCtx,
  game: Doc<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  playerId?: Id<'players'>,
): Promise<Doc<'characters'>> {
  const character = await requireVisibleCharacter(ctx, game._id, characterId, isDm)
  if (isDm) return character

  if (playerId === undefined) {
    throw new ConvexError({
      kind: 'CharacterNotYours',
      message: 'Only the DM can change that character.',
    })
  }

  const holder = await findClaimHolder(ctx, character._id)
  if (!holder) {
    throw new ConvexError({
      kind: 'CharacterNotYours',
      message: 'Nobody is playing that character yet, so only the DM can change it.',
    })
  }
  if (holder._id !== playerId) {
    throw new ConvexError({
      kind: 'CharacterNotYours',
      message: `${holder.displayName} is playing that character.`,
    })
  }

  return character
}

/**
 * Normalise, validate, and throw the shared wording the form would have shown.
 *
 * **Two checks, and the second is the one worth having.** `storedSheetProblem` covers
 * what the document holds — for a hand-built sheet that is everything, for a selection
 * sheet only the selections. So a selection sheet is then *resolved* and put through
 * `sheetProblem` as well, which is what catches a library entry with a bad roll spec,
 * a race bonus that pushes an ability past 30, or a DM override that lands the
 * armour class out of range. Both corpora are content and content drifts; this is the
 * gate that stops it drifting into the database.
 */
function requireUsableSheet(sheet: StoredSheet): StoredSheet {
  const normalised = normaliseStoredSheet(sheet)
  const problem = storedSheetProblem(normalised) ?? resolvedSheetProblem(normalised)
  if (problem) {
    throw new ConvexError({ kind: 'BadInput', message: problem.message, path: problem.path })
  }
  return normalised
}

/**
 * The second half of the check above: what a stored sheet **resolves to**, plus the one
 * thing lib/sheet.ts is structurally unable to verify about it.
 *
 * The condition used to be `kind === 'preset'`, which was already too narrow the moment a
 * second selection shape existed — and narrow in the worst direction, because a `bestiary`
 * sheet is the one stored kind whose numbers come *entirely* from content. A preset at
 * least carries its own level; a creature carries a key and a rating and nothing else, so
 * everything a player will roll against arrives from the corpus and the scaler. It needs
 * this gate more than a preset does, not less.
 *
 * **The corpus-membership check has to happen here**, and this is the only place in the
 * application where it can. `storedSheetProblem` checks the key's shape and says so in its
 * own comment: lib/sheet.ts may never import lib/bestiary/, because every function in that
 * file also runs in the browser and ~130 stat blocks must not enter the bundle. So the
 * question "is this the key of a creature that exists?" can only be asked from a module
 * that is server-only, which is this one.
 *
 * ⚠️ **Refused on write, tolerated on read**, deliberately, and the asymmetry is the same
 * stance `subclassOf` and `catalogueEntry` already take: a character *stores* the key, so
 * retiring an entry must leave every character that named it readable rather than
 * unopenable, while nobody should be able to select the retired one now. `resolveSheet`
 * and `creatureExtras` therefore tolerate a miss and this function refuses one.
 *
 * The switch is exhaustive on purpose. A fifth stored kind fails `npm run lint` on the
 * `never` below rather than silently skipping validation, and the runtime default refuses
 * rather than passing — the stance `isMonsterSheet` takes, for the reason it gives.
 */
function resolvedSheetProblem(sheet: StoredSheet): SheetProblem | null {
  switch (sheet.kind) {
    case 'pc':
    case 'npc':
      // Nothing to resolve: a hand-built sheet *is* its numbers, and `storedSheetProblem`
      // has already checked every one of them.
      return null
    case 'bestiary':
      if (!bestiaryEntry(sheet.entryKey)) {
        return { path: 'entryKey', message: 'That creature is not in this bestiary.' }
      }
      return sheetProblem(resolveSheet({ sheet }))
    case 'preset':
      return sheetProblem(resolveSheet({ sheet }))
    default: {
      const unknownKind: never = sheet
      void unknownKind
      return { path: 'kind', message: 'That is not a kind of character sheet this game has.' }
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Who exists in this game, and which seat is playing each of them.
 *
 * **NPCs are absent for a caller without the DM code**, which is a change from
 * Milestone 1 and is the point of it: `Ancient Red Dragon` sitting in a character
 * list three rooms before the party meets one is the same spoiler as a scene name,
 * and ADR 0004 already settled how those are handled. `dmCode` is optional because
 * a player's client has none to send, and its absence is an ordinary player rather
 * than an error — the same `resolveDmAccess` shape `board.tokens` uses.
 */
export const list = query({
  args: { code: v.string(), dmCode: v.optional(v.string()) },
  returns: v.array(publicCharacterValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    // Concurrent: whether this caller holds the DM code and who is sitting at the
    // table are independent questions, and this query re-runs whenever either the
    // roster or the character list changes.
    const [{ isDm }, seats] = await Promise.all([
      resolveDmAccess(ctx, args.code, args.dmCode),
      listSeats(ctx, game._id),
    ])
    return await publicCharacters(ctx, game._id, isDm, seats)
  },
})

/**
 * One whole sheet, for the panel that shows it.
 *
 * A player sees the character they are playing and nothing else; the DM sees any of
 * them. Null rather than a throw for everything else — an unknown id, another
 * seat's hero and any NPC all come back the same way, so this query cannot be used
 * to find out which of those it was.
 *
 * Current hit points are deliberately not here. They come from `vitals` below, so
 * that a point of damage does not re-push a spell list to everyone with the panel
 * open, and so the board can draw a health bar without ever reading a sheet.
 */
export const sheet = query({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.union(publicSheetValidator, v.null()),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return null

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)

    // The *finding* form, so every refusal is the same empty answer rather than an
    // error dialog on somebody's screen — and, more to the point, so an unknown id,
    // another seat's hero and an NPC are one indistinguishable outcome. Written as
    // a null-check rather than by catching what `requireEditableCharacter` throws:
    // a `try` wide enough to swallow every refusal is also wide enough to swallow a
    // genuine fault and report it as "no such character".
    const character = await findVisibleCharacter(ctx, game._id, args.characterId, isDm)
    if (!character) return null

    if (!isDm) {
      const holder = await findClaimHolder(ctx, character._id)
      if (!holder || holder._id !== args.playerId) return null
    }

    return publicSheet(character)
  },
})

/**
 * How everyone on the board is doing. The health-bar subscription.
 *
 * The `returns:` validator is the guard, and it is doing real work rather than
 * documenting: the variant a player receives for an NPC has no numeric member, so
 * exact hit points cannot be put into their payload by a future edit without Convex
 * refusing it at runtime. See `publicVitalsValidator`.
 *
 * Separate from `board.tokens` on purpose. Hit points change several times a round
 * and signed art URLs do not, so folding the two together would re-resolve every
 * piece of token art each time somebody took damage — the same reasoning that split
 * `board.positions` off in the first place (CLAUDE.md invariant 2).
 */
export const vitals = query({
  args: { code: v.string(), dmCode: v.optional(v.string()) },
  returns: v.array(publicVitalsValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    // Which creatures the caller can see at all is still the token choke point's
    // question, so it is asked there rather than answered again here. A player is
    // told about an NPC only when its token is already on their board — otherwise
    // the length of this array would publish how many monsters are waiting.
    const onBoard = await visibleCharacterIds(ctx, game._id, isDm)
    return await visibleVitals(ctx, game._id, isDm, onBoard)
  },
})

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Any player in the game may add a player character — it belongs to the game, not
 * to whoever typed it in (ADR 0002). **Adding an NPC needs the DM code**, because
 * an NPC is a thing the players are not supposed to know about yet.
 *
 * `sheet` is optional so that the lobby can go on creating a character from a name
 * alone and fill it in afterwards, while the DM's token dialog can create a goblin
 * with its armour class and hit points in one round trip.
 */
export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    sheet: v.optional(storedSheetValidator),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ characterId: v.id('characters') }),
  handler: async (ctx, args) => {
    const wanted = args.sheet ?? defaultSheetFor('pc')

    // Checked before anything else is read, and by asking for the DM code rather
    // than by trusting a flag: creating an NPC is the operation that decides what
    // the rest of the table is not allowed to see. It stays first, ahead of
    // `requireCharacterName` and `requireUsableSheet`, so that no reordering of
    // validation can put a reachable step in front of the gate.
    //
    // **The predicate is `isMonsterSheet` and is now shared with the visibility rule**,
    // which is the whole of what stops the two disagreeing about what a monster is. This
    // read `wanted.kind === 'npc'`, and the bestiary made that a hole rather than a
    // simplification: a player who knows the game code — it is in the URL — could post
    // `{ kind: 'bestiary', entryKey: 'ancient-red-dragon', cr: 6 }` with no `dmCode`, take
    // the un-gated branch of this ternary, and create a creature nobody had checked they
    // were allowed to. `tsc` had nothing to say, because the expression is perfectly valid
    // against a fourth union member; the only thing that could have caught it is asking
    // the question in one place.
    const game = isMonsterSheet(wanted)
      ? await requireDm(ctx, args.code, args.dmCode ?? '')
      : await getGameByCode(ctx, args.code)

    const name = requireCharacterName(args.name)
    const sheet = requireUsableSheet(wanted)

    // The list is read with a bound, so the write needs the matching one — a
    // character past the read window would be claimable but invisible, and the
    // seat holding it would report a claim with no name against it.
    if ((await countCharactersInGame(ctx, game._id)) >= MAX_CHARACTERS_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_CHARACTERS_PER_GAME} characters.`,
      })
    }

    return { characterId: await insertCharacter(ctx, game._id, name, sheet) }
  },
})

/**
 * Renaming stays ungated for a player character, as it has been since Milestone 1,
 * and the asymmetry with `updateSheet` below is deliberate rather than an oversight:
 * a character's name is already printed on its coin on every screen in the game,
 * whereas its sheet is not. Renaming an NPC is refused like every other read or
 * write of one, through `requireVisibleCharacter`.
 */
export const rename = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    name: v.string(),
    dmCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireVisibleCharacter(ctx, game._id, args.characterId, isDm)
    await renameCharacter(ctx, character._id, requireCharacterName(args.name))
    return null
  },
})

/**
 * Replaces the whole sheet. The character editor's save.
 *
 * Whole rather than per-field because the sheet is a discriminated union: there is
 * no coherent way to patch `abilities.str` on a document that might be a monster,
 * and a partial update would need its own validator per variant per field. The
 * document is low-churn — hit points, the thing that actually changes during play,
 * are in `characterVitals` — so rewriting it on an edit costs nothing.
 *
 * Changing the kind is refused. A hero is not turned into a monster by an edit, and
 * allowing it would let a sheet a player can see become one they cannot, or the
 * reverse, in a single write.
 */
export const updateSheet = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    sheet: storedSheetValidator,
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )

    const before = character.sheet
    // **Monster-ness is what may not change**, not the storage form. A hand-built
    // hero swapping to a premade sheet is an ordinary thing to want; a hero becoming
    // a monster would move a document across the line that decides who may see it,
    // in a single write. Comparing the *resolved* kind would be worse than useless,
    // since a preset resolves to `pc` and would refuse every update it made to itself.
    //
    // **Through `isMonsterSheet`, and this comparison used to be `kind === 'npc'` on both
    // sides.** With a fourth stored kind that was a hole open to *any* client, in both
    // directions: `playerId` is routing rather than identity (ADR 0004), so passing the seat
    // id of whoever holds a hero clears `requireEditableCharacter`, and a `pc → bestiary`
    // write then slipped past this test because neither side was `npc`. The result is an
    // irreversible overwrite of that hero's whole stored sheet plus a character that
    // vanishes from its own player's screen — the discriminator now says monster, so
    // `characters.sheet` answers null and `characters.list` drops the row.
    //
    // **It deliberately permits `npc ↔ bestiary` in both directions**, and that is required
    // rather than incidental. Saving a linked creature as a plain `npc` sheet is the
    // documented one-way door out of CR scaling, and linking a hand-built monster to an
    // entry is how a DM adopts the feature at all. Monster-ness does not move in either
    // case, so nothing crosses the line this check exists to hold.
    if (isMonsterSheet(before) !== isMonsterSheet(args.sheet)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'A character cannot change between a player character and an NPC.',
      })
    }

    const wanted = applyPresetPermissions(before, args.sheet, isDm)
    await writeSheet(ctx, character, requireUsableSheet(wanted))
    return null
  },
})

/**
 * Who may change which part of a premade character, and the only place it is decided.
 *
 * Three rules, each with a reason at the table rather than a security one — every
 * one of them stops a mistake, and none of them survives the network tab, because
 * `playerId` is routing and not identity (ADR 0004). That is the right amount of
 * enforcement for what these are.
 *
 * - **Level is the DM's.** Levels are awarded, not taken; there is no experience in
 *   D&D Lite and the DM decides when the party goes up.
 * - **Race, class and archetype lock once chosen.** Rebuilding a character mid-session
 *   is almost always a misclick rather than an intention, and when it is an intention
 *   the DM clears the lock and it takes two seconds.
 * - **Overrides are the DM's**, because they are the DM's own thumb on the scale.
 *
 * A player may set `locked` true — committing is theirs — but only the DM may set it
 * false. That asymmetry is the whole unlock mechanic.
 */
function applyPresetPermissions(
  before: StoredSheet | undefined,
  after: StoredSheet,
  isDm: boolean,
): StoredSheet {
  if (isDm) return after

  // ⚠️ **"No rule applies" is the wrong default for a union member added after a function
  // was written**, which is what this used to do: the test was `isDm || after.kind !==
  // 'preset'`, so every kind the function did not recognise was waved through as though a
  // player editing it were unremarkable. That is structurally the same defect the old
  // `kindOf` had — a fail-open answer about a document nobody had considered.
  //
  // Once `updateSheet`'s monster-ness guard is asked through `isMonsterSheet`, a monster
  // cannot reach this function without the DM code and this branch is unreachable. It is an
  // explicit refusal rather than a pass-through anyway, because the two facts that make it
  // unreachable live in another function, and an unreachable refusal costs one comparison.
  if (isMonsterSheet(after)) {
    throw new ConvexError({
      kind: 'CharacterNotYours',
      message: 'Only the DM can change that character.',
    })
  }

  if (after.kind !== 'preset') return after

  // Building a character that was not one before — nothing to protect yet.
  if (before?.kind !== 'preset') return after

  // **Preserved rather than refused**, and the distinction matters. The level and
  // the overrides are fields the player's form displays but cannot edit, so the
  // client sends them back exactly as it received them — and comparing what came
  // back against what is stored, to refuse a difference, makes an ordinary save
  // fail whenever the two happen to serialise differently. The first version of
  // this did precisely that, with a `JSON.stringify` comparison that would have
  // rejected a no-op the moment a key order changed, under the message "Only the DM
  // can change those."
  //
  // Taking the stored values instead makes the rule unconditional: a player's write
  // *cannot* move these, however the client is behaving or misbehaving, and there is
  // no comparison to get wrong.
  const preserved: StoredSheet = {
    ...after,
    level: before.level,
    ...(before.overrides === undefined ? {} : { overrides: before.overrides }),
  }
  if (before.overrides === undefined) delete (preserved as { overrides?: unknown }).overrides

  // The lock is the one thing a player may still be told "no" about, because here a
  // refusal is information they need: their choices are set, and somebody has to
  // unlock them.
  const selectionsChanged =
    before.race !== after.race ||
    before.classKey !== after.classKey ||
    before.subclassKey !== after.subclassKey

  if (before.locked && (selectionsChanged || !after.locked)) {
    throw new ConvexError({
      kind: 'CharacterLocked',
      message: 'Your race, class and archetype are set. Ask the DM to unlock them.',
    })
  }

  return preserved
}

/**
 * Awarding a level. DM only, and separate from `updateSheet` so that it is one call
 * rather than a read-modify-write the client has to get right.
 *
 * Everything the level changes — hit points, hit dice, features, spells — falls out
 * of the library the moment the number moves, which is the whole reason a premade
 * character stores selections rather than a sheet.
 */
export const setLevel = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    characterId: v.id('characters'),
    level: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // **"Not built from the library" is no longer a true thing to say**, which is why this
    // sentence changed. A creature from the bestiary *is* built from a library — the other
    // one — and it has no level to award, only a challenge rating, which `setCreatureCr`
    // shifts. A refusal that told the DM to go and edit a sheet instead would be sending
    // them to the wrong control on the basis of a false statement.
    const { character, preset } = await requirePresetCharacter(
      ctx,
      args,
      'Only a hero built from the character library has a level. A creature from the bestiary has a challenge rating instead.',
    )

    // An archetype chosen at level 2 is cleared if the DM drops the character below
    // it, because the sheet it points at does not exist down there — and leaving a
    // dangling archetype would silently reapply itself on the way back up rather
    // than asking again.
    const level = Math.round(args.level)
    await writeSheet(
      ctx,
      character,
      requireUsableSheet({
        ...preset,
        level,
        subclassKey: level < SUBCLASS_LEVEL ? null : preset.subclassKey,
      }),
    )
    return null
  },
})

/**
 * Unlocking, so a player can change their race, class or archetype. DM only, which
 * is the point of the lock existing.
 */
export const setUnlocked = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    characterId: v.id('characters'),
    locked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character, preset } = await requirePresetCharacter(
      ctx,
      args,
      'Only a hero built from the character library has selections to lock.',
    )
    await writeSheet(ctx, character, requireUsableSheet({ ...preset, locked: args.locked }))
    return null
  },
})

/**
 * Load a character the DM is about to change through the library, or throw.
 *
 * The two mutations above had this preamble written out twice, and the duplication
 * had already cost something: `setUnlocked` wrote its result straight to
 * `writeSheet` while `setLevel` put it through `requireUsableSheet` first, so the
 * one path that skipped re-validation was the one that had been copied from the
 * other. That is the failure mode `clampHitDice` describes a few files away — not
 * everywhere at once, but in whichever copy was edited last. Both now go through the
 * same door and out through the same check.
 *
 * `updateSheet` deliberately does not use this: it is reachable by a player, so it
 * goes through `requireEditableCharacter` and `applyPresetPermissions` instead of a
 * flat DM gate.
 *
 * **Refusing anything that is not a `preset` is right and was deliberately left alone** when
 * the bestiary arrived — this is one of the few kind-tests in this file that a fourth union
 * member did not break. A creature has no level and no lock, so refusing it is the answer
 * rather than an oversight, and widening the test to accept one would give `setLevel` a
 * `PresetSheet` it does not have. `setCreatureCr` goes through `requireBestiaryCharacter`
 * instead, which is the same door cut for the other corpus.
 *
 * Through `presetOf` rather than an inlined `sheet?.kind === 'preset'`, exactly as its
 * sibling goes through `bestiaryOf`: one question, asked in one place, answered the same way
 * everywhere. This file already imports and uses it, so the inlined copy was the single
 * kind-test that made that claim false.
 */
async function requirePresetCharacter(
  ctx: MutationCtx,
  args: { code: string; dmCode: string; characterId: Id<'characters'> },
  // Passed rather than shared: "edit its sheet instead" is the useful next step when
  // somebody tries to level a hand-built character, and no help at all when they try
  // to unlock one. Sharing the lookup is worth doing; sharing the sentence is not.
  refusal: string,
): Promise<{ character: Doc<'characters'>; preset: PresetSheet }> {
  const game = await requireDm(ctx, args.code, args.dmCode)
  const character = await getCharacterInGame(ctx, game._id, args.characterId)

  const preset = presetOf(character)
  if (!preset) {
    throw new ConvexError({ kind: 'BadInput', message: refusal })
  }
  return { character, preset }
}

/**
 * The same door for the other corpus: load a creature the DM is about to change through
 * the bestiary, or throw.
 *
 * Written as its own helper rather than folded into `requirePresetCharacter` because the
 * two return different sheets to different callers, and written *now* rather than after the
 * duplication has cost something, which is the one lesson that function's own doc comment
 * records: it existed as two copies of a preamble, and the copy edited last was the one
 * that had quietly stopped re-validating. There are two mutations below with identical
 * openings, so the same trap was already waiting here.
 *
 * Through `bestiaryOf` rather than `character.sheet?.kind === 'bestiary'`, for the reason
 * every kind-test in this file now goes through one function: one question, asked in one
 * place, answered the same way everywhere.
 */
async function requireBestiaryCharacter(
  ctx: MutationCtx,
  args: { code: string; dmCode: string; characterId: Id<'characters'> },
  // What was being asked for, as a noun phrase — "have its challenge rating shifted", "be
  // reset to its library defaults". The rest of the sentence is built from what the
  // character actually turned out to be, which is the half a caller cannot know.
  wanted: string,
): Promise<{ character: Doc<'characters'>; creature: BestiarySheet }> {
  const game = await requireDm(ctx, args.code, args.dmCode)
  const character = await getCharacterInGame(ctx, game._id, args.characterId)

  const creature = bestiaryOf(character)
  if (!creature) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `Only a creature from the bestiary can ${wanted}. ${notACreature(character)}`,
    })
  }
  return { character, creature }
}

/**
 * Why this character has no challenge rating, in a sentence that is **true of the character
 * in front of it**.
 *
 * `requirePresetCharacter` takes its whole refusal as a parameter, and copying that shape
 * here was wrong in a way a test caught: one sentence covering every non-creature said "a
 * hand-built NPC has no rating to scale from — edit its sheet instead", which is helpful for
 * a hand-built NPC, false for a premade hero, and sends that hero to edit a sheet it has not
 * got. The difference between the two files is that a *level* is refused to exactly one kind
 * of thing, so one sentence covers it, whereas a *rating* is refused to three — and a
 * refusal that guesses wrong about which is worse than no refusal message at all, because
 * the DM acts on it.
 *
 * The `never` branch is unreachable while `bestiaryOf` is the test above, and is written as
 * an exhaustive switch anyway so a fifth stored kind arrives here as a lint failure rather
 * than as a sentence about a hand-built NPC.
 */
function notACreature(character: Doc<'characters'>): string {
  const kind = character.sheet?.kind
  switch (kind) {
    case 'npc':
      return 'A hand-built NPC has no rating to scale from — edit its sheet instead.'
    case 'preset':
      return 'That is a hero from the character library, so the DM sets its level instead.'
    case 'pc':
    case undefined:
      return 'That is a hand-built player character, so edit its sheet instead.'
    case 'bestiary':
      // Unreachable: `bestiaryOf` returned null, so the stored kind is not this one.
      return 'That creature is no longer in the bestiary.'
    default: {
      const unknownKind: never = kind
      void unknownKind
      return 'That character has no challenge rating.'
    }
  }
}

/**
 * Shift an assigned creature's challenge rating. DM only, and the whole of the CR stepper.
 *
 * **One field changes and eight numbers move**, which is the point of storing a selection
 * rather than a sheet: hit points, armour class, attack bonus, damage, initiative, save DC
 * and the skill and perception bonuses are all read back out of the corpus at the new
 * rating, while the creature's name, speed, abilities and the *number* of its attacks stay
 * exactly as written. A CR 6 goblin is a goblin who has been lifting.
 *
 * Not routed through `requirePresetCharacter`, which correctly refuses a creature: a
 * bestiary sheet has no level and no lock, and the rating is the index its library is looked
 * up at rather than anything a preset hero would recognise.
 *
 * The rating is validated by `crValidator` at the function boundary — set membership in the
 * ten ratings, not a range — so the handler never has to consider CR 1.5, which has no
 * benchmark row to scale towards. ⚠️ It must not be rounded on the way past: `Math.round`
 * collapses CR ⅛, ¼ and ½ onto other ratings. See the warning on `CR_VALUES`.
 */
export const setCreatureCr = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    characterId: v.id('characters'),
    cr: crValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character, creature } = await requireBestiaryCharacter(
      ctx,
      args,
      'have its challenge rating shifted',
    )

    // The overrides are carried across untouched, which is the ordering ADR 0006 fixed and
    // the roadmap restates for this corpus: the scale happens before the DM's own numbers,
    // so an armour class somebody bumped for a boss fight survives the shift. Spreading the
    // stored sheet rather than rebuilding it is what makes that true by construction —
    // there is no branch here that could forget to carry an override.
    //
    // `writeSheetRescalingHp`, not `writeSheet`: the maximum is about to move, and a Troll
    // on half its hit points should come out on half of the new maximum rather than dead or
    // fully healed. Both writes land in one transaction, so nothing ever observes the sheet
    // at the new rating beside a current total from the old one.
    await writeSheetRescalingHp(
      ctx,
      character,
      requireUsableSheet({ ...creature, cr: args.cr }),
    )
    return null
  },
})

/**
 * Put a creature back the way the library has it: the entry's own rating, and no overrides.
 * DM only.
 *
 * This is the source spec's *Reset to Library Defaults*, and it is worth saying that it
 * **falls out of the data rather than being built** — which is the whole argument for
 * storing a link and a diff instead of a campaign copy. Every feature that section asked
 * for is somewhere in this file already: `overrides === undefined` is `isModified`, its keys
 * are `modifiedFields[]`, the CR shift and the override object together *are* *Compare
 * Changes*, and *View Original* is `bestiary.entry` resolving the same key with the diff
 * skipped. There is nothing to detect about library versions, because the library ships with
 * the code — there is exactly one version and it is the deployed one.
 *
 * The write is one patch, not two. Patching `sheet` replaces the whole field, so a rebuilt
 * object that simply does not name `overrides` is how the override is deleted; there is no
 * second call and therefore no state in between where the rating had been restored and the
 * DM's numbers had not. Hit points are reconciled by the same write, for the reason
 * `setCreatureCr` gives — resetting a scaled creature moves its maximum just as much as
 * scaling it did.
 */
export const resetCreature = mutation({
  args: { code: v.string(), dmCode: v.string(), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character, creature } = await requireBestiaryCharacter(
      ctx,
      args,
      'be reset to its library defaults',
    )

    // Refused rather than reset, because the entry's own rating is the one thing this
    // mutation cannot get from anywhere else — and a retired key has no rating to return to.
    // Note the asymmetry with the read paths, which is the same one `requireUsableSheet`
    // explains: the creature stays perfectly readable, it just cannot be reset, and saying
    // so is better than resetting it to a rating that no longer means anything.
    const entry = bestiaryEntry(creature.entryKey)
    if (!entry) {
      throw new ConvexError({
        kind: 'BadInput',
        message:
          'That creature is no longer in the bestiary, so there are no library defaults to go back to. Save it as an ordinary NPC sheet to keep it.',
      })
    }

    // Rebuilt rather than spread, and that is the deletion: `overrides` is simply not named,
    // so the field is gone from the stored document. `entryKey` is carried across because it
    // is what the character *is* — resetting a creature does not turn it into another one.
    await writeSheetRescalingHp(
      ctx,
      character,
      requireUsableSheet({ kind: 'bestiary', entryKey: creature.entryKey, cr: entry.cr }),
    )
    return null
  },
})

/**
 * A long rest. Hit points to full, hit dice back, once-per-rest abilities unspent.
 *
 * Available to whoever may edit the character, because a rest is a thing the party
 * decides on together and making it DM-only would put the DM in the loop for the
 * most routine event in the game.
 */
export const longRest = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )
    await takeLongRest(ctx, character)
    return null
  },
})

/** Spend a once-per-long-rest ability, or hand it back if it was marked by mistake. */
export const setPerRest = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    key: v.string(),
    spent: v.boolean(),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ spentPerRest: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )

    // Checked against the character's own race rather than taken as given, so the
    // stored array cannot fill up with keys nothing will ever clear.
    //
    // **Only when spending.** Handing one back is always allowed, and the asymmetry
    // is what stops a stale key becoming permanent: a DM who changes a character's
    // race leaves whatever the old race had spent still marked, and a check that
    // applied here too would make it unclearable by anything short of a long rest —
    // refusing to undo a state it had been happy to create.
    const preset = presetOf(character)
    const known = preset ? perRestAbilities(preset.race).map((ability) => ability.key) : []
    if (args.spent && !known.includes(args.key)) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That character has no such ability.',
      })
    }

    return { spentPerRest: await setPerRestSpent(ctx, character, args.key, args.spent) }
  },
})

/**
 * Damage and healing. The `+`/`−` controls on the sheet and on the token.
 *
 * A delta rather than a value, and that is the whole reason this is separate from
 * `setHp`: the DM and the player both clicking `−5` on the same goblin at the same
 * moment should take ten hit points off it. A mutation is one transaction, so the
 * read and the write here compose; two clients each sending "set it to 32" would
 * not.
 *
 * Returns the value actually stored, which is not always the one implied by the
 * delta — the server clamps to the sheet's maximum, so a client cannot heal
 * something past full or beat it below zero.
 */
export const adjustHp = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    delta: v.number(),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ currentHp: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.delta) || Math.abs(args.delta) > MAX_MAX_HP) {
      throw new ConvexError({ kind: 'BadInput', message: 'That is not an amount of damage.' })
    }

    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )

    return {
      currentHp: await changeCurrentHp(ctx, character, (current) => current + args.delta),
    }
  },
})

/**
 * Set hit points outright, rather than by a delta. Same clamp, same permission rule.
 *
 * **No UI reaches this yet**, and that is worth saying rather than leaving a reader
 * to search for the caller: every control on screen is `−`, an amount and `+`, which
 * `adjustHp` serves and serves better, because two people clicking at once compose
 * instead of clobbering. This is here for the case a delta cannot express — a DM
 * typing a monster's hit points straight in, which Milestone 7's DM panel will want —
 * and it is exercised by the suite and by `npm run test:smoke` in the meantime.
 */
export const setHp = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    currentHp: v.number(),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ currentHp: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.currentHp)) {
      throw new ConvexError({ kind: 'BadInput', message: 'That is not a number of hit points.' })
    }

    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )

    return { currentHp: await changeCurrentHp(ctx, character, () => args.currentHp) }
  },
})

/**
 * Spends or restores hit dice — `delta` of −1 on a short rest, or the whole
 * complement back on a long one. Floors at zero and caps at what the sheet says the
 * character has, so a rest cannot mint dice.
 */
export const adjustHitDice = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    delta: v.number(),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ hitDiceRemaining: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.delta)) {
      throw new ConvexError({ kind: 'BadInput', message: 'That is not a number of hit dice.' })
    }

    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
    )

    return {
      hitDiceRemaining: await changeHitDiceRemaining(
        ctx,
        character,
        (remaining) => remaining + args.delta,
      ),
    }
  },
})

/**
 * Claim a character for a seat. Refuses one another seat already holds — the DM
 * breaks that tie with `assign`, which is the same operation with the force to take
 * it away.
 *
 * An NPC is refused as unfindable. A seat plays a hero; handing a player a monster
 * would make its hit points exact on every screen in the game, which is the one
 * thing this milestone exists to prevent.
 */
export const claim = mutation({
  args: { code: v.string(), playerId: v.id('players'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    // `false`, not the caller's DM status: this refuses an NPC even to the DM,
    // because the refusal is about what a seat may play rather than about who is
    // asking.
    //
    // That also makes it refuse a creature from the bestiary, with no change here — and
    // note what the correctness of this line now rests on. `maySeeCharacter` asks
    // `isMonsterSheet`, so "monster" covers all of the kinds that are one; a discriminator
    // that answered `pc` for a bestiary creature would let a seat claim a dragon and
    // publish its exact hit points to the whole table through the `exact` variant of
    // `publicVitalsValidator`. Nothing at this call site would look wrong.
    const character = await requireVisibleCharacter(ctx, game._id, args.characterId, false)

    const holder = await findClaimHolder(ctx, character._id)
    if (holder && holder._id !== seat._id) {
      throw new ConvexError({
        kind: 'CharacterTaken',
        message: `${holder.displayName} is already playing ${character.name}.`,
      })
    }

    // A seat holds at most one character, so claiming a second releases the first.
    await setSeatCharacter(ctx, seat._id, character._id)
    return null
  },
})

export const release = mutation({
  args: { code: v.string(), playerId: v.id('players') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    await setSeatCharacter(ctx, seat._id, null)
    return null
  },
})

/**
 * DM override: put any character on any seat, taking it off whoever had it.
 * Gated on the DM code because it is the forceful version of `claim` — a player
 * can only take what nobody else holds.
 *
 * `characterId: null` clears the seat. An NPC is refused here too, for the reason
 * on `claim`: the DM holding the code does not make a monster a playable hero.
 */
export const assign = mutation({
  args: {
    code: v.string(),
    dmCode: v.string(),
    playerId: v.id('players'),
    characterId: v.union(v.id('characters'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)

    if (args.characterId === null) {
      await setSeatCharacter(ctx, seat._id, null)
      return null
    }

    // `false` again, and it carries the same dependency `claim` does: a bestiary creature is
    // refused here only because `maySeeCharacter` asks `isMonsterSheet` rather than testing
    // one stored kind by name. Holding the DM code does not make a monster a playable hero.
    const character = await requireVisibleCharacter(ctx, game._id, args.characterId, false)
    await releaseClaimOn(ctx, character._id)
    await setSeatCharacter(ctx, seat._id, character._id)
    return null
  },
})

/**
 * Gated on the DM code: this is the one irreversible operation on durable data.
 *
 * Three pointers are cleared before the document goes, in the order that leaves
 * nothing dangling however the transaction is read: the seat's claim, then the
 * tokens standing on it, then the character and its vitals row together.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const character = await getCharacterInGame(ctx, game._id, args.characterId)

    await releaseClaimOn(ctx, character._id)
    // Tokens point at characters, so the tokens are what need repairing. Without
    // this a hero's coin would quietly become undraggable and lose its health bar,
    // with nothing on screen to say why.
    await detachCharacterFromTokens(ctx, character._id)
    await deleteCharacter(ctx, character._id)
    return null
  },
})
