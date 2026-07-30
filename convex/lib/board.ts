// THE CHOKE POINT. This module is the only place in `convex/` allowed to read the
// `tokens` and `tokenPositions` tables, and a test greps the sources to keep it
// that way.
//
// The reason it has to be one module rather than a habit is CLAUDE.md invariant 8.
// A `returns:` validator catches a leaked *field* — that is what keeps the DM code
// out of a game payload — but a DM-layer token is the same shape as a player-layer
// one, so a validator would cheerfully approve a payload made entirely of secrets.
// Nothing about the type of a token distinguishes a spoiler from a hero. Only the
// row does. So the guard is structural instead: every read of those two tables
// passes through the single predicate below, and any future query that wants token
// data has to come here to get it.

import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_PLACEMENTS_PER_SCENE, MAX_SCENES_PER_GAME, MAX_TOKENS_PER_GAME } from './games'
import { findClaimHolder } from './players'
import type { Point } from './grid'

/** The public shape of a token. artUrl is a signed storage URL, null when there is no art. */
export const publicTokenValidator = v.object({
  _id: v.id('tokens'),
  name: v.string(),
  layer: v.union(v.literal('player'), v.literal('dm')),
  sizeSquares: v.number(),
  artUrl: v.union(v.string(), v.null()),
  tint: v.string(),
  characterId: v.union(v.id('characters'), v.null()),
})
export type PublicToken = Infer<typeof publicTokenValidator>

export const publicPositionValidator = v.object({
  tokenId: v.id('tokens'),
  x: v.number(),
  y: v.number(),
})
export type PublicPosition = Infer<typeof publicPositionValidator>

/**
 * Deliberately indistinguishable from "no such token" and "token in another game".
 *
 * Once the payload channel is closed, the remaining way to enumerate the DM layer
 * is to guess ids and read the error back: a distinct "you are not allowed to move
 * that" confirms a hidden token exists, and a player who knows an ambush is on the
 * board has had the ambush spoiled whether or not they can see it. So all three
 * refusals throw this, and the tests assert the parity — which is why it is a
 * shared constant rather than three literals that drift apart under maintenance.
 */
export const TOKEN_NOT_FOUND = {
  kind: 'TokenNotFound',
  message: 'That token is not on this board.',
}

function tokenNotFound(): ConvexError<typeof TOKEN_NOT_FOUND> {
  return new ConvexError(TOKEN_NOT_FOUND)
}

/**
 * The whole visibility rule, in one expression, in one place.
 *
 * `isDm` arrives from `resolveDmAccess` in lib/games.ts, which means it is the
 * result of comparing a DM code supplied on *this* request against the one stored
 * on the game. It is not computed here and it must never be computed from anything
 * else. In particular it is never `players.isDm`, which is a badge in the roster
 * that anybody can find (invariant 7), and never derived from a `playerId`
 * argument, which says which seat to act on rather than who is calling (ADR 0003).
 * Either of those would amount to a player asking to be trusted, and would defeat
 * invariant 1 completely while looking like a working filter.
 */
function maySee(token: Doc<'tokens'>, isDm: boolean): boolean {
  return isDm || token.layer === 'player'
}

/** Filtered token documents for this caller. THE choke point. */
export async function visibleTokens(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
): Promise<Doc<'tokens'>[]> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.filter((token) => maySee(token, isDm))
}

/**
 * The same set, projected and with signed art URLs resolved. For `board.tokens`.
 *
 * Filter first, project second, and the order is load-bearing rather than tidy. A
 * signed storage URL is unguessable but not permission-checked: once it exists it
 * is a bearer link to that image for anyone holding the string. Resolving one for
 * a hidden token — even to throw the object away a line later — would mean the
 * secret had already been minted into a form that could be logged, cached or
 * accidentally spread. Projection only ever runs over rows the caller may see.
 */
export async function publicTokens(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
): Promise<PublicToken[]> {
  const tokens = await visibleTokens(ctx, gameId, isDm)

  return await Promise.all(
    tokens.map(async (token) => ({
      _id: token._id,
      name: token.name,
      layer: token.layer,
      sizeSquares: token.sizeSquares,
      // Null rather than undefined: `undefined` is not a Convex value, so an
      // optional field has to become something on the way out. A getUrl of a blob
      // that has been deleted underneath us is null too, and the board draws a
      // tinted coin for both cases.
      artUrl: token.imageId ? await ctx.storage.getUrl(token.imageId) : null,
      tint: token.tint,
      characterId: token.characterId ?? null,
    })),
  )
}

/**
 * Positions on one scene, filtered to tokens this caller may see. For `board.positions`.
 *
 * Each position row is hydrated back to its token so the same `maySee` decides it.
 * The obvious optimisation is to copy `layer` onto the position row and skip the
 * join, and it is the wrong trade: it would make two documents authoritative for
 * the one field that decides whether a row is a secret, and the bug that leaks is
 * exactly a token moved to the DM layer whose stale placements still say 'player'.
 * A denormalised copy cannot be verified by reading this file, which is the whole
 * point of having a choke point.
 *
 * The cost accepted is that this query re-subscribes when a token *document*
 * changes, not only when something moves. That is cheap here precisely because of
 * invariant 2's table split: token documents are written when the DM adds, renames
 * or re-layers a token, which is rare, while the churn of a drag lands on
 * `tokenPositions` alone.
 */
export async function visiblePositions(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  sceneId: Id<'scenes'>,
  isDm: boolean,
): Promise<PublicPosition[]> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  const rows = await Promise.all(
    placements.map(async (placement) => {
      const token = await ctx.db.get('tokens', placement.tokenId)
      // The gameId check is not paranoia about a caller: a scene belongs to one
      // game, so a placement pointing at a token in another is data that should
      // not exist, and dropping it here means a stray row cannot become a coin
      // hovering on somebody else's map.
      if (!token || token.gameId !== gameId || !maySee(token, isDm)) return null
      return { tokenId: placement.tokenId, x: placement.x, y: placement.y }
    }),
  )

  return rows.filter((row): row is PublicPosition => row !== null)
}

/**
 * The token this caller is allowed to move, or a throw. Throws the SAME
 * TokenNotFound error for "no such token", "token in another game" and
 * "DM-layer token without the DM code" — telling those apart is an existence
 * oracle for the DM layer. Throws TokenNotYours for a player-layer token whose
 * character another seat has claimed (advisory only; see ADR 0004).
 */
export async function requireMovableToken(
  ctx: QueryCtx,
  game: Doc<'games'>,
  tokenId: Id<'tokens'>,
  isDm: boolean,
  playerId?: Id<'players'>,
): Promise<Doc<'tokens'>> {
  const token = await ctx.db.get('tokens', tokenId)
  if (!token || token.gameId !== game._id || !maySee(token, isDm)) throw tokenNotFound()

  // The DM moves anything on their own board, including a claimed hero, because
  // dragging the party through a door is a normal thing for them to do.
  if (isDm) return token

  // Be honest about what this is: `playerId` is a routing argument, so anyone can
  // pass another seat's id and walk straight past this check. It is table manners
  // rendered server-side — it stops a misclick, not a person — and it is exactly
  // as spoofable as ungated `players.leave` in ADR 0003. That is acceptable only
  // because nothing behind it is a secret: a player-layer token is already on
  // every screen in the game, so the worst outcome is a rude move that everybody
  // watched happen. The refusal above, which does guard a secret, gets no such
  // latitude and keys off the DM code alone.
  if (playerId !== undefined && token.characterId) {
    const holder = await findClaimHolder(ctx, token.characterId)
    if (holder && holder._id !== playerId) {
      throw new ConvexError({
        kind: 'TokenNotYours',
        message: `${holder.displayName} is playing that token.`,
      })
    }
  }

  return token
}

/** Insert or update the placement of a token on a scene. */
export async function placeToken(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
  tokenId: Id<'tokens'>,
  point: Point,
): Promise<void> {
  const existing = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId_and_tokenId', (q) => q.eq('sceneId', sceneId).eq('tokenId', tokenId))
    .unique()

  // Upsert rather than insert, because the row's existence is what puts a token on
  // a board: a drag has to patch the four coordinates it already has, while a token
  // dropped onto a scene it has never stood on has to create them. One function for
  // both keeps a mid-drag write from quietly stacking up duplicate placements.
  if (existing) {
    await ctx.db.patch('tokenPositions', existing._id, { x: point.x, y: point.y })
  } else {
    await ctx.db.insert('tokenPositions', { sceneId, tokenId, x: point.x, y: point.y })
  }
}

/**
 * Every placement of one token, across all scenes. For removeToken.
 *
 * Bounded by the scene count rather than the placement count: a token holds at
 * most one row per scene, so this is the tight bound and MAX_PLACEMENTS_PER_SCENE
 * would be the wrong axis.
 */
export async function deleteTokenPlacements(
  ctx: MutationCtx,
  tokenId: Id<'tokens'>,
): Promise<void> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
    .take(MAX_SCENES_PER_GAME)

  for (const placement of placements) {
    await ctx.db.delete('tokenPositions', placement._id)
  }
}

/**
 * Every placement on one scene. For scenes.remove.
 *
 * Deleting a scene takes its layout with it and leaves every `tokens` row alone,
 * which is what makes a recurring villain survive the map they were last seen on.
 */
export async function deleteScenePlacements(
  ctx: MutationCtx,
  sceneId: Id<'scenes'>,
): Promise<void> {
  const placements = await ctx.db
    .query('tokenPositions')
    .withIndex('by_sceneId', (q) => q.eq('sceneId', sceneId))
    .take(MAX_PLACEMENTS_PER_SCENE)

  for (const placement of placements) {
    await ctx.db.delete('tokenPositions', placement._id)
  }
}

/**
 * Bounded count of tokens in a game, so addToken can enforce MAX_TOKENS_PER_GAME.
 *
 * Counts both layers regardless of the caller, because this answers "is the game
 * full?" and a limit that ignored the hidden half would let the DM's own bestiary
 * overrun the read window that every board query uses. The number never leaves the
 * server: only `addToken` reads it, to decide whether to throw.
 *
 * There is no matching count of placements on a scene, and the absence is
 * deliberate — see the note on MAX_PLACEMENTS_PER_SCENE in lib/games.ts.
 */
export async function countTokensInGame(ctx: QueryCtx, gameId: Id<'games'>): Promise<number> {
  const tokens = await ctx.db
    .query('tokens')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_TOKENS_PER_GAME)

  return tokens.length
}
