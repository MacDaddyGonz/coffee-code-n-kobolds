import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getCharacterInGame, listCharacters } from './lib/characters'
import { MAX_CHARACTERS_PER_GAME, findGameByCode, getGameByCode, requireDm } from './lib/games'
import { requireCharacterName } from './lib/names'
import { findClaimHolder, getSeatInGame, listSeats, releaseClaimOn } from './lib/players'

const characterValidator = v.object({
  _id: v.id('characters'),
  name: v.string(),
  claimedByPlayerId: v.union(v.id('players'), v.null()),
  claimedByName: v.union(v.string(), v.null()),
  createdAt: v.number(),
})

export const list = query({
  args: { code: v.string() },
  returns: v.array(characterValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const [characters, seats] = await Promise.all([
      listCharacters(ctx, game._id),
      listSeats(ctx, game._id),
    ])
    // Built from the seats we already read rather than a lookup per character.
    const holderByCharacter = new Map(
      seats.filter((seat) => seat.characterId).map((seat) => [seat.characterId!, seat]),
    )

    // Characters arrive oldest-first: Convex appends _creationTime to every index.
    return characters.map((character) => {
      const holder = holderByCharacter.get(character._id) ?? null
      return {
        _id: character._id,
        name: character.name,
        claimedByPlayerId: holder?._id ?? null,
        claimedByName: holder?.displayName ?? null,
        createdAt: character._creationTime,
      }
    })
  },
})

/**
 * Any player in the game may add a character — it belongs to the game, not to
 * whoever typed it in (ADR 0002). Milestone 3 turns this into the full sheet.
 */
export const create = mutation({
  args: { code: v.string(), name: v.string() },
  returns: v.object({ characterId: v.id('characters') }),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const name = requireCharacterName(args.name)

    // The list is read with a bound, so the write needs the matching one — a
    // character past the read window would be claimable but invisible, and the
    // seat holding it would report a claim with no name against it.
    const existing = await listCharacters(ctx, game._id)
    if (existing.length >= MAX_CHARACTERS_PER_GAME) {
      throw new ConvexError({
        kind: 'GameFull',
        message: `This game already has ${MAX_CHARACTERS_PER_GAME} characters.`,
      })
    }

    const characterId = await ctx.db.insert('characters', { gameId: game._id, name })
    return { characterId }
  },
})

export const rename = mutation({
  args: { code: v.string(), characterId: v.id('characters'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const character = await getCharacterInGame(ctx, game._id, args.characterId)
    await ctx.db.patch('characters', character._id, { name: requireCharacterName(args.name) })
    return null
  },
})

/**
 * Claim a character for a seat. Refuses if another seat already holds it — the
 * DM breaks that tie with `assign`, which is the same operation with the force
 * to take it away.
 */
export const claim = mutation({
  args: { code: v.string(), playerId: v.id('players'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    const character = await getCharacterInGame(ctx, game._id, args.characterId)

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
 * `characterId: null` clears the seat.
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

    const character = await getCharacterInGame(ctx, game._id, args.characterId)
    await releaseClaimOn(ctx, character._id)
    await ctx.db.patch('players', seat._id, { characterId: character._id })
    return null
  },
})

/**
 * Gated on the DM code: this is the one irreversible operation on durable data.
 * Clears the claim first so no seat is left pointing at a deleted document.
 */
export const remove = mutation({
  args: { code: v.string(), dmCode: v.string(), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const character = await getCharacterInGame(ctx, game._id, args.characterId)

    await releaseClaimOn(ctx, character._id)
    await ctx.db.delete('characters', character._id)
    return null
  },
})
