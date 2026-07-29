import { ConvexError } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_SEATS_PER_GAME } from './games'
import { nameKeyFor } from './codes'
import { requireDisplayName } from './names'

/**
 * Take a seat at the table, by name.
 *
 * This is the whole of player identity in this app. There is no session token
 * and no server-stored client id: a seat is found by its normalised display
 * name within one game, so "restore my session" and "join for the first time"
 * are the same call. A browser that has lost its storage rejoins by retyping
 * the same name, and its character claim is still there. See ADR 0003.
 */
export async function joinSeat(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  rawDisplayName: string,
): Promise<{ playerId: Id<'players'>; displayName: string; rejoined: boolean }> {
  const displayName = requireDisplayName(rawDisplayName)
  const nameKey = nameKeyFor(displayName)

  const existing = await findSeatByName(ctx, gameId, nameKey)
  if (existing) {
    // Adopt the casing they just typed; the seat is keyed on nameKey, so this
    // is cosmetic and does not create a second seat.
    if (existing.displayName !== displayName) {
      await ctx.db.patch('players', existing._id, { displayName })
    }
    return { playerId: existing._id, displayName, rejoined: true }
  }

  // The roster is read with a bound, so the write needs the matching one.
  // Without it the newest arrivals fall outside the read window and vanish from
  // the lobby while still holding their nameKey and their character claim — and
  // moveDmBadgeTo could not see them either.
  const seats = await listSeats(ctx, gameId)
  if (seats.length >= MAX_SEATS_PER_GAME) {
    throw new ConvexError({
      kind: 'GameFull',
      message: `This game already has ${MAX_SEATS_PER_GAME} seats.`,
    })
  }

  const playerId = await ctx.db.insert('players', {
    gameId,
    displayName,
    nameKey,
    isDm: false,
  })
  return { playerId, displayName, rejoined: false }
}

export async function findSeatByName(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  nameKey: string,
): Promise<Doc<'players'> | null> {
  return await ctx.db
    .query('players')
    .withIndex('by_gameId_and_nameKey', (q) => q.eq('gameId', gameId).eq('nameKey', nameKey))
    .unique()
}

export async function listSeats(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'players'>[]> {
  return await ctx.db
    .query('players')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_SEATS_PER_GAME)
}

/**
 * Loads a seat and checks it belongs to the game the caller named. A `playerId`
 * argument is routing, not proof of identity (ADR 0003) — this stops a stray id
 * from another game being patched, nothing more.
 */
export async function getSeatInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  playerId: Id<'players'>,
): Promise<Doc<'players'>> {
  const seat = await ctx.db.get('players', playerId)
  if (!seat || seat.gameId !== gameId) {
    throw new ConvexError({ kind: 'PlayerNotFound', message: 'That seat is not in this game.' })
  }
  return seat
}

export async function findClaimHolder(
  ctx: QueryCtx,
  characterId: Id<'characters'>,
): Promise<Doc<'players'> | null> {
  return await ctx.db
    .query('players')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .unique()
}

/** Clears the claim on `characterId` from whichever seat holds it, if any. */
export async function releaseClaimOn(ctx: MutationCtx, characterId: Id<'characters'>) {
  const holder = await findClaimHolder(ctx, characterId)
  if (holder) {
    await ctx.db.patch('players', holder._id, { characterId: undefined })
  }
}
