import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { revokeControlForSeat } from './lib/board'
import { playerCharacterNames } from './lib/characters'
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

    // The read itself lives in lib/characters.ts, which is the only module allowed
    // to touch that table now that an NPC sheet is a secret of the same shape as a
    // hero's (invariant 8). The point-get optimisation and the reason for it moved
    // with it; so did the filter that stops a roster naming an NPC.
    const nameById = await playerCharacterNames(
      ctx,
      seats.flatMap((seat) => (seat.characterId ? [seat.characterId] : [])),
    )

    // Seats arrive oldest-first: Convex appends _creationTime to every index.
    return seats.map((seat) => {
      // The id is nulled with the name rather than beside it. `playerCharacterNames`
      // withholds an NPC's name, so a seat somehow holding one would otherwise come
      // back with a live id and a blank label — an id a client could then take
      // straight to `characters.sheet`, which is the one query that would refuse it,
      // rather than to a screen that renders it. Unreachable today, because `claim`
      // and `assign` both refuse an NPC; the projection filtering as one decision
      // rather than two is what keeps it unreachable if a later milestone changes who
      // may hold what.
      //
      // ⚠️ **This filter now withholds a second thing and the sentence above is only
      // half of it**: `playerCharacterNames` also drops a *reserved* character, which
      // is a hero and which a seat therefore could hold. That state is unreachable too
      // — `setReserved` refuses a held character and `assign` clears the flag — but it
      // is unreachable by a different argument, so both are worth having.
      const name = seat.characterId ? nameById.get(seat.characterId) ?? null : null
      return {
        _id: seat._id,
        displayName: seat.displayName,
        isDm: seat.isDm,
        characterId: name === null ? null : seat.characterId ?? null,
        characterName: name,
        joinedAt: seat._creationTime,
      }
    })
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
 *
 * The grants the DM had written for this seat go with it, which is the same class of
 * repair `detachCharacterFromTokens` performs when a character is deleted: the pointer
 * runs token → seat, so the token is what has to be mended, and the mending lives in
 * lib/board.ts because that is the only module allowed to write that table.
 */
export const leave = mutation({
  args: { code: v.string(), playerId: v.id('players') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    // Before the delete, so no ordering of failures can leave a game holding a grant
    // for a seat that has gone. Seat ids are never reused, so the residue would
    // authorise nobody — it would simply be a row the DM's dialog cannot name.
    await revokeControlForSeat(ctx, game._id, seat._id)
    await ctx.db.delete('players', seat._id)
    return null
  },
})
