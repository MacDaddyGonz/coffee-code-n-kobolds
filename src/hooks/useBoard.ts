import { useMemo } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/** A token joined to where it stands on the active scene, or null if it stands nowhere. */
export type BoardToken = PublicToken & {
  position: Point | null
  /**
   * Whether to offer this token as draggable. An **affordance**, not a
   * permission: `board.moveToken` re-checks the same question server-side on
   * every single write through `requireMovableToken`, and it is that check which
   * decides the outcome. Nothing here is trusted, because a client-side
   * permission is not a permission (CLAUDE.md invariant 1, ADR 0004) — this only
   * decides whether the cursor changes and the token follows the mouse, so that
   * a player does not discover what they may move by being refused.
   */
  canMove: boolean
}

export type Board = {
  scene: PublicScene | null
  tokens: BoardToken[]
  isDm: boolean
  loading: boolean
}

/**
 * The arguments `board.tokens` is subscribed with.
 *
 * Exported, and built here rather than inline at each call site, because
 * `useTokenMove`'s optimistic update has to name the *same* cache entry the
 * component is reading. Convex keys a query by its arguments, so a DM and a
 * player watching the same board hold genuinely different subscriptions (ADR
 * 0004) — and an optimistic write against the wrong one patches an entry nobody
 * is reading, which shows up as the token snapping back a tenth of a second
 * after every drag. One builder, used by both, is what stops that.
 *
 * `dmCode` is omitted rather than passed as `undefined` when there is none.
 * `undefined` is not a Convex value, so the two spellings are the same request
 * on the wire but not necessarily the same object here; omitting it keeps the
 * comparison boring.
 */
export function tokensArgs(code: string, dmCode: string | null) {
  return dmCode === null ? { code } : { code, dmCode }
}

/** The arguments `board.positions` is subscribed with. Same reasoning as above. */
export function positionsArgs(code: string, sceneId: Id<'scenes'>, dmCode: string | null) {
  return dmCode === null ? { code, sceneId } : { code, sceneId, dmCode }
}

/**
 * Everything on screen for one game: the active board, and who is standing on it.
 *
 * Three subscriptions rather than one, and the split is deliberate in two
 * different ways. `scenes.active` is separate because the background is what the
 * whole table shares and changes about once an hour. `board.tokens` and
 * `board.positions` are separate from each other because positions are written
 * ten times a second during a drag, and a single query would re-push every name
 * and every signed art URL on each of those ticks — the reason behind CLAUDE.md
 * invariant 2. The cost is that a token appears only once both halves have
 * arrived, which is what `loading` is for.
 *
 * `playerId` is in the argument shape but deliberately absent from the rule
 * below. A seat id is routing, not proof of identity (invariant 7), so it cannot
 * decide anything here; it is `useTokenMove` that sends it, as the advisory
 * "whose token is this" hint ADR 0004 describes. Taking it here too means a
 * caller hands the whole seat to one place instead of remembering which hook
 * wants which half.
 */
export function useBoard(args: {
  code: string
  dmCode: string | null
  playerId: Id<'players'> | null
  myCharacterId: Id<'characters'> | null
}): Board {
  const { code, dmCode, myCharacterId } = args

  const scene = useQuery(api.scenes.active, { code })
  const tokens = useQuery(api.board.tokens, tokensArgs(code, dmCode))
  // Skipped until there is a board to stand on. `board.positions` insists the
  // scene belongs to the game, so there is no id to pass and nothing to ask.
  const positions = useQuery(
    api.board.positions,
    scene ? positionsArgs(code, scene._id, dmCode) : 'skip',
  )

  const isDm = dmCode !== null

  const joined = useMemo<BoardToken[]>(() => {
    if (!tokens) return []

    const at = new Map((positions ?? []).map((row) => [row.tokenId, { x: row.x, y: row.y }]))

    // Order is left alone — `TokenLayer` splits the tokens by layer and stacks them
    // by size, which is a drawing decision and belongs with the canvas.
    return tokens.map((token) => ({
      ...token,
      position: at.get(token._id) ?? null,
      // The DM moves anything on their own board, including a claimed hero:
      // dragging the party through a door is a normal thing for them to do. A
      // player moves the token of the character they are playing, and nothing else
      // — an unattached token belongs to the DM, so every NPC on the board stays
      // out of the party's hands.
      //
      // This mirrors `requireMovableToken` deliberately, and has to keep mirroring
      // it. It is not the check that matters — the server refuses regardless — but
      // a token the UI lets you pick up and the server then rejects is a worse
      // experience than one that never moved, so the two rules are written to agree.
      canMove:
        isDm ||
        (token.layer === 'player' &&
          myCharacterId !== null &&
          token.characterId === myCharacterId),
    }))
  }, [tokens, positions, isDm, myCharacterId])

  return {
    scene: scene ?? null,
    tokens: joined,
    isDm,
    // A scene of `null` is a settled answer — this game has no map yet — so it is
    // not loading. Positions are only awaited when there is a scene, or a board
    // with no map would report loading forever.
    loading:
      scene === undefined || tokens === undefined || (scene !== null && positions === undefined),
  }
}
