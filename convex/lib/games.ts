import { ConvexError, v } from 'convex/values'

import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { normaliseJoinCode, normaliseRecoveryPhrase } from './codes'

/**
 * Thrown with a `kind` so the UI can tell "no such game" from "wrong DM code"
 * without string-matching a message.
 */
export type GameErrorKind = 'GameNotFound' | 'NotDm' | 'BadRecoveryPhrase'

/**
 * Read bounds for the per-game lists. A D&D Lite table holds a handful of
 * seats and characters, so these are never reached in practice — they exist so
 * that no query in this app is unbounded, per the Convex guidelines. Use them
 * instead of `.collect()` when reading a game's seats or characters.
 */
export const MAX_SEATS_PER_GAME = 50
export const MAX_CHARACTERS_PER_GAME = 200

export function gameError(kind: GameErrorKind, message: string): ConvexError<{
  kind: GameErrorKind
  message: string
}> {
  return new ConvexError({ kind, message })
}

/**
 * The only shape of a game a public query may return.
 *
 * `dmCode`, `dmRecoverySalt` and `dmRecoveryHash` are absent by construction.
 * Declaring this as a query's `returns:` validator means Convex throws at
 * runtime if one of them is ever added to a projection by accident — the leak
 * guard for CLAUDE.md invariant 1 is mechanical, not vigilance.
 */
export const publicGameValidator = v.object({
  _id: v.id('games'),
  _creationTime: v.number(),
  name: v.string(),
  code: v.string(),
  createdByName: v.string(),
})

export function publicGame(game: Doc<'games'>) {
  return {
    _id: game._id,
    _creationTime: game._creationTime,
    name: game.name,
    code: game.code,
    createdByName: game.createdByName,
  }
}

/** Returns null for an unknown code — for queries that render "no such game". */
export async function findGameByCode(
  ctx: QueryCtx,
  rawCode: string,
): Promise<Doc<'games'> | null> {
  return await ctx.db
    .query('games')
    .withIndex('by_code', (q) => q.eq('code', normaliseJoinCode(rawCode)))
    .unique()
}

/** Throws for an unknown code — for mutations, where there is nothing to render. */
export async function getGameByCode(ctx: QueryCtx, rawCode: string): Promise<Doc<'games'>> {
  const game = await findGameByCode(ctx, rawCode)
  if (!game) throw gameError('GameNotFound', 'No game with that code.')
  return game
}

/**
 * The app's only authorisation primitive.
 *
 * A `playerId` argument is routing, not identity, and `players.isDm` is a
 * display flag — neither may ever gate access to anything. Holding the DM code
 * is what makes you the DM, and it is re-checked on every DM-only call. See
 * ADR 0003.
 */
export async function requireDm(
  ctx: QueryCtx,
  rawCode: string,
  dmCode: string,
): Promise<Doc<'games'>> {
  const game = await getGameByCode(ctx, rawCode)
  if (!secretsMatch(dmCode.trim().toUpperCase(), game.dmCode)) {
    throw gameError('NotDm', 'That DM code is not right for this game.')
  }
  return game
}

/**
 * Length-independent compare. Cheap insurance rather than a meaningful defence
 * — the DM code is short and the threat model is two people in one office —
 * but there is no reason to leak a prefix match through timing.
 */
function secretsMatch(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0')
  }
  return out
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/**
 * The recovery phrase itself is never stored — only a salted SHA-256 of it, so
 * the database never holds the thing that hands over the DM code.
 */
export async function hashRecoveryPhrase(salt: string, phrase: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${salt}:${normaliseRecoveryPhrase(phrase)}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(new Uint8Array(digest))
}

export async function recoveryPhraseMatches(
  game: Doc<'games'>,
  phrase: string,
): Promise<boolean> {
  const candidate = await hashRecoveryPhrase(game.dmRecoverySalt, phrase)
  return secretsMatch(candidate, game.dmRecoveryHash)
}

/**
 * Exactly one seat carries the DM badge. Called after a successful DM code or
 * recovery-phrase check; the badge is cosmetic, so this is bookkeeping for the
 * roster rather than a privilege grant.
 */
export async function moveDmBadgeTo(ctx: MutationCtx, playerId: Doc<'players'>['_id']) {
  const player = await ctx.db.get('players', playerId)
  if (!player) throw gameError('GameNotFound', 'That player is no longer in the game.')

  const seats = await ctx.db
    .query('players')
    .withIndex('by_gameId', (q) => q.eq('gameId', player.gameId))
    .take(MAX_SEATS_PER_GAME)

  for (const seat of seats) {
    const shouldBeDm = seat._id === playerId
    if (seat.isDm !== shouldBeDm) {
      await ctx.db.patch('players', seat._id, { isDm: shouldBeDm })
    }
  }
}
