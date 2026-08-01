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

/**
 * The same relation as `findClaimHolder`, read off a roster already in hand:
 * character → the seat playing it, for every seat that is playing one.
 *
 * **This lives here because the claim pointer does.** `setSeatCharacter` below claims
 * to be the one place the relation is written; this is the one place it is inverted,
 * so the two halves of "a seat points at a character, and never the reverse"
 * (ADR 0002) sit in the module that owns the table. It had been written out verbatim
 * three times — in `publicTokens`, in `boardCharacterAccess` and in
 * `publicCharacters` — each with its own copy of the non-null assertion, in two
 * modules that are forbidden from reading this table directly.
 *
 * Built once per query rather than looked up per row, which is the reason all three
 * callers wanted it: a board holds up to `MAX_TOKENS_PER_GAME` rows, so the
 * `findClaimHolder`-per-row form would be two hundred index reads on a subscription
 * every client at the table holds open.
 *
 * A typed loop rather than `new Map(seats.filter(…).map(…))`, so the `characterId!`
 * that shape forces disappears — the compiler narrows the field inside the `if` and
 * there is no assertion left to be wrong.
 *
 * ⚠️ **At most one holder per character, and the last seat wins if that is ever
 * false.** Nothing enforces the uniqueness in the schema: `claim` refuses a character
 * another seat holds and `assign` releases the previous holder first, so the state is
 * unreachable through the supported writes, and `findClaimHolder` would throw on it
 * where this quietly picks one. Both answers are defensible for something that cannot
 * happen; what matters is that the choice is made once, here, rather than differently
 * in three copies.
 */
export function holderByCharacter(
  seats: Doc<'players'>[],
): Map<Id<'characters'>, Doc<'players'>> {
  const byCharacter = new Map<Id<'characters'>, Doc<'players'>>()
  for (const seat of seats) {
    if (seat.characterId) byCharacter.set(seat.characterId, seat)
  }
  return byCharacter
}

/**
 * Point a seat at a character, or at nothing.
 *
 * The one place the claim pointer is written, so `characters.claim`, `release`,
 * `assign` and this module's own `releaseClaimOn` all say it the same way — they
 * had four direct `ctx.db.patch('players', …)` calls between them, two of which
 * were byte-identical. This table belongs to this module the way `tokens` belongs
 * to lib/board.ts, and the pointer running seat → character and never the reverse
 * (ADR 0002) is the sort of rule that is easier to keep when there is one writer.
 *
 * `undefined` clears the field rather than storing one: that is what `patch` does
 * with it, and it is why a released character has no dangling holder to find.
 */
export async function setSeatCharacter(
  ctx: MutationCtx,
  seatId: Id<'players'>,
  characterId: Id<'characters'> | null,
) {
  await ctx.db.patch('players', seatId, { characterId: characterId ?? undefined })
}

/**
 * Every seat in a game. For the purge tool in `convex/admin.ts`, and for nothing a
 * client can reach.
 *
 * It lives here rather than there because this table belongs to this module the way
 * `tokens` belongs to lib/board.ts — the same reason `setSeatCharacter` above is the
 * one writer of the claim pointer. Nothing greps for it, unlike the two secret-bearing
 * pairs, but a purge is exactly the sort of code that grows its own copy of a table
 * read if there is nowhere obvious to put one.
 *
 * **`revokeControlForSeat` is deliberately not called, and `players.leave` calling it
 * is not an inconsistency.** That mutation removes one seat from a game that carries
 * on, so a grant naming it would outlive it and render as a row the DM's dialog cannot
 * name. Here the tokens holding those grants have already gone — see the purge order
 * in `convex/admin.ts`, which is chosen so that every pointer is deleted before the
 * thing it points at. Sweeping two hundred tokens per seat to mend rows that no longer
 * exist would be the expensive way to reach the same state.
 */
export async function deleteSeatsInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const seats = await listSeats(ctx, gameId)
  for (const seat of seats) {
    await ctx.db.delete('players', seat._id)
  }
  return seats.length
}

/** Clears the claim on `characterId` from whichever seat holds it, if any. */
export async function releaseClaimOn(ctx: MutationCtx, characterId: Id<'characters'>) {
  const holder = await findClaimHolder(ctx, characterId)
  if (holder) await setSeatCharacter(ctx, holder._id, null)
}
