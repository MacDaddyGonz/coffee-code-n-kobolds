import { ConvexError } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { MAX_CHARACTERS_PER_GAME } from './games'

export async function listCharacters(
  ctx: QueryCtx,
  gameId: Id<'games'>,
): Promise<Doc<'characters'>[]> {
  return await ctx.db
    .query('characters')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_CHARACTERS_PER_GAME)
}

export async function getCharacterInGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  characterId: Id<'characters'>,
): Promise<Doc<'characters'>> {
  const character = await ctx.db.get('characters', characterId)
  if (!character || character.gameId !== gameId) {
    throw new ConvexError({
      kind: 'CharacterNotFound',
      message: 'That character is not in this game.',
    })
  }
  return character
}
