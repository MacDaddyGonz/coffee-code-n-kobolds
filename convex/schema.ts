import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// The two literal unions this schema shares with the queries that project them and
// the mutations that take them as arguments. Imported rather than re-spelled so the
// table definition and the public payload cannot end up disagreeing about which
// members exist — see the notes beside each field below.
import { tokenLayerValidator } from './lib/board'
import { gameStatusValidator } from './lib/games'

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
    // The board everyone is looking at. Optional because a game has no scene until
    // the DM uploads a map. Scene *switching* for the whole group is Milestone 5;
    // this field is the data it will drive.
    activeSceneId: v.optional(v.id('scenes')),
    // 'lobby' until the DM presses Start, then 'playing' and every client flips to
    // the board. Optional only because adding a required field to a table that
    // already has rows fails the schema push — read it through `gameStatus` in
    // lib/games.ts, never directly, so the default lives in exactly one place.
    status: v.optional(gameStatusValidator),
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

  // One board: a background image plus where its grid is. The background layer of
  // requirements.md — players see it and cannot interact with it.
  scenes: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    imageId: v.id('_storage'),
    // Dimensions of the STORED image, after the upload downscaler has had it. Every
    // scene coordinate and all the grid maths are in this space, so calibration is
    // unaffected by whatever the downscaler decided.
    imageWidth: v.number(),
    imageHeight: v.number(),
    // Pixels per square, in image space. Kept as a float: 2240 / 16 is exactly 140,
    // and rounding it would drift a whole square out by the far edge of the map.
    gridSize: v.number(),
    gridOffsetX: v.number(),
    gridOffsetY: v.number(),
    // Maps that arrive with a grid printed on them do not want ours drawn over it.
    gridVisible: v.boolean(),
  }).index('by_gameId', ['gameId']),

  // STABLE token data — art, name, size, layer, owning character. Low churn: this
  // document is written when the DM adds or renames a token, not when one moves.
  // Position lives in `tokenPositions`, per CLAUDE.md invariant 2.
  //
  // Scoped to the game rather than to one scene, so a recurring villain can stand
  // on several boards. Milestone 7 grows this into the token library.
  tokens: defineTable({
    gameId: v.id('games'),
    name: v.string(),
    // Two members, not the three layers in requirements.md: the background layer is
    // the scene image itself, and no token ever lives on it. Images on layers are
    // Milestone 5.
    //
    // THE SECRET IS HERE. A 'dm' token must never reach a player client, and it has
    // the same shape as a 'player' one — so a `returns:` validator cannot catch a
    // leak of it. Every read goes through lib/board.ts. See invariant 8.
    layer: tokenLayerValidator,
    // Diameter in grid squares. 1 = one square, 2 = a 2×2 ogre.
    sizeSquares: v.number(),
    // Absent → drawn as a coloured coin with the name's initials, which is enough
    // to play with and skips an upload per NPC.
    imageId: v.optional(v.id('_storage')),
    tint: v.string(),
    // Which character stands on this token, if any. NPC tokens have none, which is
    // also why this is optional rather than a union with null — see the roadmap's
    // open question about NPC sheets; nothing here constrains the answer.
    characterId: v.optional(v.id('characters')),
  })
    .index('by_gameId', ['gameId'])
    .index('by_characterId', ['characterId']),

  // HIGH-CHURN position, in its own table (CLAUDE.md invariant 2). Convex rewrites
  // a whole document on patch, so a throttled drag write rewrites these four fields
  // and nothing else — no contention with reads of art, names or sizes.
  //
  // Keyed per (scene, token): the row's EXISTENCE is what places a token on a
  // board, so each scene remembers its own layout and switching scenes destroys
  // nothing. x and y are image-space pixel floats, token centre — floats rather
  // than cells so an in-flight drag carries continuous motion to the other screens
  // instead of hopping cell to cell. The snap happens once, on settle.
  tokenPositions: defineTable({
    sceneId: v.id('scenes'),
    tokenId: v.id('tokens'),
    x: v.number(),
    y: v.number(),
  })
    .index('by_sceneId', ['sceneId'])
    .index('by_tokenId', ['tokenId'])
    .index('by_sceneId_and_tokenId', ['sceneId', 'tokenId']),
})
