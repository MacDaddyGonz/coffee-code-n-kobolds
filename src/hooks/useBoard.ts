import { useMemo } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { PublicVitals } from '@convex/lib/characters'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'
import { useVitals } from '@/hooks/useVitals'

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
  /**
   * What this browser has been told about the creature's hit points, or null for a
   * token with nothing behind it — a scenery marker, a summoned wolf nobody wrote a
   * sheet for — and null again for the moment before the vitals subscription lands.
   *
   * Exact numbers or one of four bands, and **the server chose which** in
   * `visibleVitals`: the band form has no numeric field for a hit point to sit in,
   * so there is nothing here to unlock and nothing behind the word. Nothing
   * downstream of this may branch on "am I the DM" to decide how to draw it.
   */
  vitals: PublicVitals | null
  /**
   * Whether to offer the `+`/`−` control on this token's bar. An **affordance**, on
   * exactly the same terms as `canMove` above: `requireEditableCharacter` in
   * `convex/characters.ts` re-decides it server-side on every write and it is that
   * check which counts. This only chooses whether a control is drawn, so that a
   * player is not handed buttons that answer with a refusal.
   */
  canEditHp: boolean
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
 * Everything on screen for one game: the active board, who is standing on it, and
 * how they are all doing.
 *
 * Four subscriptions rather than one, and the split is deliberate in three
 * different ways. `scenes.active` is separate because the background is what the
 * whole table shares and changes about once an hour. `board.tokens` and
 * `board.positions` are separate from each other because positions are written
 * ten times a second during a drag, and a single query would re-push every name
 * and every signed art URL on each of those ticks — the reason behind CLAUDE.md
 * invariant 2. The cost is that a token appears only once both halves have
 * arrived, which is what `loading` is for.
 *
 * `characters.vitals` is the third axis of the same argument: hit points change
 * several times a round while art URLs change almost never, so folding them into
 * `board.tokens` would re-resolve every signed URL on the board each time somebody
 * took damage. They are joined on here rather than subscribed separately by the
 * canvas because a coin and its health bar are one thing to draw, and a component
 * that took the tokens from one hook and the numbers from another would render the
 * two out of step for a frame every time a token appeared.
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
  // Not skipped on a board with no scene: the character sheets want the same
  // numbers, and a game whose DM has not uploaded a map yet still has a party.
  const { of: vitalsOf } = useVitals(code, dmCode)

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
      vitals: vitalsOf(token.characterId),
      // `requireEditableCharacter` restated, exactly as `canMove` restates
      // `requireMovableToken`: the DM may change anybody's hit points, a player may
      // change only the character their seat has claimed, and a token with no
      // character behind it has no hit points for anyone to change. There is
      // deliberately no `layer` clause — hit points belong to the character, not to
      // the token drawn for it, and the server's rule does not mention one either.
      //
      // The two rules have to keep agreeing. Offering a `+` that the server then
      // refuses is a worse experience than not offering it, and the refusal a player
      // would get for somebody else's hero is worded for the case where they had to
      // have gone looking for it.
      canEditHp:
        token.characterId !== null && (isDm || token.characterId === myCharacterId),
    }))
    // `vitalsOf` is stable until the vitals themselves change, at which point every
    // token object here is rebuilt and every coin reconciles. That is the trade, and
    // it is the right way round: damage lands a few times a round, whereas a pan
    // lands sixty times a second and touches none of these dependencies at all.
  }, [tokens, positions, isDm, myCharacterId, vitalsOf])

  return {
    scene: scene ?? null,
    tokens: joined,
    isDm,
    // A scene of `null` is a settled answer — this game has no map yet — so it is
    // not loading. Positions are only awaited when there is a scene, or a board
    // with no map would report loading forever.
    //
    // Vitals are deliberately not awaited. A token drawn before its position has
    // arrived is a token in the wrong place, which is why that one blocks; a token
    // drawn before its vitals have arrived is a token whose bar appears a moment
    // later, and holding the whole map behind a skeleton for that would be paying
    // for a health bar with the map.
    loading:
      scene === undefined || tokens === undefined || (scene !== null && positions === undefined),
  }
}
