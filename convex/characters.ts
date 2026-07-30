import { ConvexError, v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { detachCharacterFromTokens, visibleCharacterIds } from './lib/board'
import {
  countCharactersInGame,
  deleteCharacter,
  findVisibleCharacter,
  getCharacterInGame,
  insertCharacter,
  publicCharacterValidator,
  publicCharacters,
  publicSheet,
  publicSheetValidator,
  publicVitalsValidator,
  readCurrentHp,
  readHitDiceRemaining,
  renameCharacter,
  requireVisibleCharacter,
  visibleVitals,
  writeCurrentHp,
  writeHitDiceRemaining,
  writeSheet,
} from './lib/characters'
import {
  MAX_CHARACTERS_PER_GAME,
  findGameByCode,
  getGameByCode,
  requireDm,
  resolveDmAccess,
} from './lib/games'
import { requireCharacterName } from './lib/names'
import { findClaimHolder, getSeatInGame, listSeats, releaseClaimOn } from './lib/players'
import type { CharacterSheet } from './lib/sheet'
import {
  MAX_MAX_HP,
  characterSheet,
  defaultSheetFor,
  normaliseSheet,
  sheetValidator,
  sheetProblem,
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

/** Normalise, validate, and throw the shared wording the form would have shown. */
function requireUsableSheet(sheet: CharacterSheet): CharacterSheet {
  const normalised = normaliseSheet(sheet)
  const problem = sheetProblem(normalised)
  if (problem) {
    throw new ConvexError({ kind: 'BadInput', message: problem.message, path: problem.path })
  }
  return normalised
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

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    const seats = await listSeats(ctx, game._id)
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
    sheet: v.optional(sheetValidator),
    dmCode: v.optional(v.string()),
  },
  returns: v.object({ characterId: v.id('characters') }),
  handler: async (ctx, args) => {
    const wanted = args.sheet ?? defaultSheetFor('pc')

    // Checked before anything else is read, and by asking for the DM code rather
    // than by trusting a flag: creating an NPC is the operation that decides what
    // the rest of the table is not allowed to see.
    const game =
      wanted.kind === 'npc'
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
    sheet: sheetValidator,
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

    if (characterSheet(character).kind !== args.sheet.kind) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'A character cannot change between a player character and an NPC.',
      })
    }

    await writeSheet(ctx, character, requireUsableSheet(args.sheet))
    return null
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

    const current = await readCurrentHp(ctx, character)
    return { currentHp: await writeCurrentHp(ctx, character, current + args.delta) }
  },
})

/** For typing a number straight into the sheet. Same clamp, same permission rule. */
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

    return { currentHp: await writeCurrentHp(ctx, character, args.currentHp) }
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

    const remaining = await readHitDiceRemaining(ctx, character)
    return {
      hitDiceRemaining: await writeHitDiceRemaining(ctx, character, remaining + args.delta),
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
    const character = await requireVisibleCharacter(ctx, game._id, args.characterId, false)

    const holder = await findClaimHolder(ctx, character._id)
    if (holder && holder._id !== seat._id) {
      throw new ConvexError({
        kind: 'CharacterTaken',
        message: `${holder.displayName} is already playing ${character.name}.`,
      })
    }

    // A seat holds at most one character, so claiming a second releases the first.
    await ctx.db.patch('players', seat._id, { characterId: character._id })
    return null
  },
})

export const release = mutation({
  args: { code: v.string(), playerId: v.id('players') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    await ctx.db.patch('players', seat._id, { characterId: undefined })
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
      await ctx.db.patch('players', seat._id, { characterId: undefined })
      return null
    }

    const character = await requireVisibleCharacter(ctx, game._id, args.characterId, false)
    await releaseClaimOn(ctx, character._id)
    await ctx.db.patch('players', seat._id, { characterId: character._id })
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
