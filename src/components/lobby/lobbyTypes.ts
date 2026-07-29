import type { FunctionReturnType } from 'convex/server'

import type { api } from '@convex/_generated/api'

/** One roster row, exactly as the server projects it — character name included. */
export type LobbySeat = FunctionReturnType<typeof api.players.list>[number]

export type LobbyCharacter = FunctionReturnType<typeof api.characters.list>[number]
