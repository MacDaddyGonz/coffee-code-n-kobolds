import { ConvexError, v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { nameKeyFor } from './lib/codes'
import { requireDisplayName } from './lib/names'
import { findGameByCode, getGameByCode } from './lib/games'
import { findSeatByName, getSeatInGame, joinSeat, listSeats } from './lib/players'

/**
 * One row of the lobby roster. `characterName` is resolved here rather than
 * cross-referenced in the client, so the roster is one subscription.
 */
const seatValidator = v.object({
  _id: v.id('players'),
  displayName: v.string(),
  isDm: v.boolean(),
  characterId: v.union(v.id('characters'), v.null()),
  characterName: v.union(v.string(), v.null()),
  joinedAt: v.number(),
})

/**
 * Idempotent by normalised display name. Called on every entry to a game, not
 * just the first — see joinSeat in lib/players.ts for why that is the whole of
 * player identity here.
 */
export const join = mutation({
  args: { code: v.string(), displayName: v.string() },
  returns: v.object({
    playerId: v.id('players'),
    displayName: v.string(),
    rejoined: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    return await joinSeat(ctx, game._id, args.displayName)
  },
})

export const list = query({
  args: { code: v.string() },
  returns: v.array(seatValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const seats = await listSeats(ctx, game._id)

    // Point gets over the handful of characters actually held, rather than a
    // range read of the table. A range read is invalidated by any insert into
    // its range, so adding a character nobody holds would still re-run this
    // query and re-push the whole roster to every client. Point reads are
    // tracked per document, so only a rename of a held character does that.
    const held = await Promise.all(
      seats
        .filter((seat) => seat.characterId)
        .map((seat) => ctx.db.get('characters', seat.characterId!)),
    )
    const nameById = new Map<Id<'characters'>, string>()
    for (const character of held) {
      if (character) nameById.set(character._id, character.name)
    }

    // Seats arrive oldest-first: Convex appends _creationTime to every index.
    return seats.map((seat) => ({
      _id: seat._id,
      displayName: seat.displayName,
      isDm: seat.isDm,
      characterId: seat.characterId ?? null,
      characterName: seat.characterId ? nameById.get(seat.characterId) ?? null : null,
      joinedAt: seat._creationTime,
    }))
  },
})

/**
 * The seat list shown by the name gate before anyone commits to a name, so a
 * player whose storage was cleared can pick their existing seat instead of
 * creating a near-duplicate by typing `Mikey` where they once typed `Mike`.
 *
 * Deliberately just the names — nothing here is privileged, and anyone holding
 * the join code can already see the roster from inside the lobby.
 */
export const listNames = query({
  args: { code: v.string() },
  returns: v.array(v.object({ displayName: v.string(), isDm: v.boolean() })),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []
    const seats = await listSeats(ctx, game._id)
    return seats.map((seat) => ({ displayName: seat.displayName, isDm: seat.isDm }))
  },
})

/**
 * Changing a display name changes the identity key, so the caller must store the
 * new name — otherwise the next visit creates a fresh seat.
 */
export const rename = mutation({
  args: { code: v.string(), playerId: v.id('players'), displayName: v.string() },
  returns: v.object({ displayName: v.string() }),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)

    const displayName = requireDisplayName(args.displayName)

    const nameKey = nameKeyFor(displayName)
    const clash = await findSeatByName(ctx, game._id, nameKey)
    if (clash && clash._id !== seat._id) {
      throw new ConvexError({
        kind: 'NameTaken',
        message: `Someone in this game is already called ${clash.displayName}.`,
      })
    }

    await ctx.db.patch('players', seat._id, { displayName, nameKey })
    return { displayName }
  },
})

/**
 * Removes a seat. The claimed character is untouched and becomes claimable
 * again — characters belong to the game, not to a seat (ADR 0002).
 *
 * Not gated on the DM code, and deliberately so: a seat is identified by a
 * display name anyone with the join code can type, so pretending removal is
 * privileged would be theatre. The DM strip calls this for other seats.
 */
export const leave = mutation({
  args: { code: v.string(), playerId: v.id('players') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    await ctx.db.delete('players', seat._id)
    return null
  },
})
