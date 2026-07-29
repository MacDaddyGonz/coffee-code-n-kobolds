import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  games: defineTable({
    name: v.string(),
    // Normalised uppercase, 6 characters from CODE_ALPHABET. Unique.
    code: v.string(),
    // Display name of whoever created the game, for the lobby header.
    createdByName: v.string(),
    // BEARER SECRET. Holding this is what makes you the DM. Never returned by a
    // public query — see publicGameValidator in lib/games.ts.
    dmCode: v.string(),
    // The recovery phrase is never stored; only a salted SHA-256 of it.
    dmRecoverySalt: v.string(),
    dmRecoveryHash: v.string(),
  }).index('by_code', ['code']),

  // A seat at the table, not a user. Identified within a game by nameKey, so a
  // cleared browser rejoins by retyping the same display name. See ADR 0003.
  players: defineTable({
    gameId: v.id('games'),
    // As typed, whitespace-collapsed.
    displayName: v.string(),
    // normaliseDisplayName + lowercase. The identity key.
    nameKey: v.string(),
    // DISPLAY ONLY — drives a badge in the roster. Never an authorisation
    // check: the DM code is the only thing that authorises anything.
    isDm: v.boolean(),
    // The character this seat has claimed. The pointer runs seat → character
    // and never the reverse, so deleting every seat leaves the characters
    // intact and reclaimable.
    characterId: v.optional(v.id('characters')),
  })
    .index('by_gameId', ['gameId'])
    .index('by_gameId_and_nameKey', ['gameId', 'nameKey'])
    .index('by_characterId', ['characterId']),

  // Characters belong to the game, never to a player identity (ADR 0002).
  // Milestone 3 grows this into the full D&D Lite sheet.
  characters: defineTable({
    gameId: v.id('games'),
    name: v.string(),
  }).index('by_gameId', ['gameId']),
})
