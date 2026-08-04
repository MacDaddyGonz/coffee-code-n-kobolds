import { useMemo } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { PublicVitals } from '@convex/lib/characters'
import type { Point } from '@convex/lib/grid'
import { mayPlayersMove } from '@convex/lib/layers'
import type { TokenMarker } from '@convex/lib/markers'
import type { PublicScene } from '@convex/lib/scenes'
import { hiddenFromParty, useFog } from '@/hooks/useFog'
import { useVitals } from '@/hooks/useVitals'

/**
 * Held still so a board with nothing marked hands every coin the same array.
 *
 * `NO_TOKENS`/`NONE_HIDDEN`'s idiom, and here it is what keeps `TokenCoin`'s memo
 * skipping: the field below is an array, so a fresh `[]` per unmarked coin per render
 * would be a changed prop on two hundred coins that nobody has ticked anything on —
 * which is every coin in almost every game.
 */
const NO_MARKERS: readonly TokenMarker[] = []

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
   *
   * It is now *read* rather than derived: `controllerIds` on the payload is the
   * server's own answer, so the affordance and the refusal cannot come apart. See
   * the rule below for why that mattered enough to change.
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
   *
   * Wider than `canMove`'s question in one direction and narrower in another, and
   * the rule below says why: hit points follow the character, not the layer its
   * token happens to be drawn on.
   */
  canEditHp: boolean
  /**
   * Whether the party has lost sight of this token behind the DM's own fog. **False on
   * every screen but the DM's**, and a cue rather than anything anybody may act on.
   *
   * ⚠️ **It is joined on here rather than asked for by the coin, and the reason is the
   * shape of the answer rather than tidiness.** It is a crossing of three things — a
   * position, a rectangle and the token's controllers — and this hook is where the first
   * two already meet. `TokenCoin` sits four components down inside the Konva tree with no
   * game code to subscribe with, so the alternative was a subscription per coin.
   *
   * Nothing here withholds a row: the withholding is `foggedTokenIds`', server-side,
   * before a player's payload was assembled (CLAUDE.md invariant 1). See
   * `hiddenFromParty` for the three clauses and for why a controlled token is never
   * fogged.
   */
  hiddenFromParty: boolean
  /**
   * The conditions written on this coin — poisoned, prone, concentrating — in the
   * vocabulary's own alphabetical order, as `visibleMarkers` normalised them.
   *
   * ⚠️ **Labels and nothing else, and that sentence is the whole design.** Nothing in
   * `convex/` reads one: no roll consults it, no health band is computed from it, no
   * drag is refused because of it, and `markerGuard.test.ts` is what makes that a
   * promise rather than an intention — it greps `convex/` for a quoted specifier
   * reaching the vocabulary and allows three importers. So nothing downstream of this
   * field may branch on a marker either; a pip is drawn and that is all it does.
   *
   * ⚠️ **Fog does not hide these, and that is `board.tokens`' argument rather than an
   * omission.** Filtering them would put a `tokenPositions` read into a subscription
   * that is open all session, which is precisely the read-side cost CLAUDE.md invariant
   * 2 exists to refuse — and what it would buy is closing a devtools leak of exactly the
   * kind ADR 0012 already accepts for a fogged coin's *name*. Fog takes where a coin is,
   * how hurt it is and what it just rolled; it does not take that a coin by that name
   * exists or what condition it is in. A creature that must not be known about goes on
   * the GM layer, where the row never travels at all.
   */
  markers: readonly TokenMarker[]
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
 * The arguments `board.markers` is subscribed with. `tokensArgs`' argument, and the
 * reason the builder is shared rather than the shape being written twice.
 *
 * Convex keys a query by its arguments, so the DM's `TokenMarkerControl` — which reads
 * this to tick the boxes — and the board drawing the pips must *name the same entry* or
 * they hold two: two socket subscriptions, two server executions, and two answers that
 * arrive a beat apart while the DM watches their own tick appear on the panel before it
 * appears on the coin. One builder is what makes the two the same cache entry rather
 * than two objects that happen to serialise alike today.
 *
 * `dmCode` is omitted rather than passed as `undefined` when there is none, for the
 * reason `tokensArgs` gives: `undefined` is not a Convex value, so the two spellings are
 * one request on the wire and not necessarily one object here.
 */
export function markersArgs(code: string, dmCode: string | null) {
  return dmCode === null ? { code } : { code, dmCode }
}

/**
 * Everything on screen for one game: the active board, who is standing on it, and
 * how they are all doing.
 *
 * Five subscriptions rather than one, and the split is deliberate in four
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
 * `board.markers` is the fourth axis and the cheapest of them: a condition hangs off a
 * coin rather than off a placement, so the query is game-scoped, reads no
 * `tokenPositions` row and never re-runs on a drag or a join. Joined here rather than
 * subscribed by the coin for the reason `hiddenFromParty` gives — `TokenCoin` sits
 * inside the Konva tree with no game code to subscribe with, so the alternative is a
 * subscription per coin.
 *
 * `playerId` now appears in the rule below, where it used not to, and the reason
 * it may is worth stating rather than assuming. A seat id is routing and not proof
 * of identity (invariant 7), so it can never *authorise* anything — but neither can
 * anything in this file, because nothing here is a permission. It is used exactly
 * as `useTokenMove` uses it when it sends it: as the advisory "which seat is this
 * browser sitting in" hint ADR 0004 describes, here answering "should this token
 * look draggable to me". The server is told the same thing on the write and
 * re-decides from scratch.
 */
export function useBoard(args: {
  code: string
  dmCode: string | null
  playerId: Id<'players'> | null
  myCharacterId: Id<'characters'> | null
}): Board {
  const { code, dmCode, playerId, myCharacterId } = args

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
  //
  // The seat is passed for the same advisory reason it appears in the rule below,
  // and for a player it changes what comes back: a creature the DM has granted this
  // seat arrives with *exact* hit points rather than a band, which is what makes
  // `canEditHp` above a control the player can actually use instead of a bar with no
  // buttons. For a DM `vitalsArgs` drops it — the answer does not depend on the seat
  // — so this hook and the sheet panels share one cache entry rather than holding two
  // copies of the same rows and patching them separately. See `vitalsArgs`.
  const { of: vitalsOf } = useVitals(code, dmCode, playerId)

  // The rectangles, for the DM's cue and for nothing else this hook does. Not a
  // subscription of its own in practice: `FogLayer` is drawing the same entry beside
  // this one, and `fogArgs` is what makes the two of them name it — `fog.list` is ungated
  // and cheap, so a player holds it too and simply never looks at the answer this file
  // computes from it.
  const fog = useFog(code, scene?._id ?? null, dmCode)

  // The conditions on every coin, for the pips. A fifth subscription and genuinely one
  // — on a player's screen nothing else reads it — and it is affordable for the reason
  // `visibleMarkers` states: it reads **no `tokenPositions` row, ever**, so it is off
  // the drag path entirely, and a game where nobody has ticked anything reads one empty
  // range and stops. On the DM's screen it is not even that, because `markersArgs` is
  // what makes `TokenMarkerControl` in the other pane name this same entry.
  const markers = useQuery(api.board.markers, markersArgs(code, dmCode))

  const isDm = dmCode !== null

  /**
   * Conditions by coin, keyed by token because the query is game-scoped and sends a row
   * only for a coin that carries something — a marked goblin in a two-hundred-coin game is
   * one entry here, and every other coin falls through to the shared empty array below.
   *
   * ⚠️ **Built out here rather than inside the join, and the reason is invariant 2.** That
   * memo depends on `positions`, which is re-pushed ten times a second for the whole of
   * anybody's drag — so a `Map` built in there was rebuilt at that rate for an input that
   * changes when somebody ticks a checkbox. The join still has to *depend* on this, which
   * is the accepted widening the note at its foot argues; what this stops is the rebuilding.
   */
  const marked = useMemo(
    () => new Map((markers ?? []).map((row) => [row.tokenId, row.markers])),
    [markers],
  )

  const joined = useMemo<BoardToken[]>(() => {
    if (!tokens) return []

    const at = new Map((positions ?? []).map((row) => [row.tokenId, { x: row.x, y: row.y }]))
    const rects = fog ?? []

    // Order is left alone — `TokenLayers` splits the tokens by layer and stacks them
    // by size, which is a drawing decision and belongs with the canvas.
    return tokens.map((token) => ({
      ...token,
      position: at.get(token._id) ?? null,
      // The DM moves anything on their own board, including a claimed hero:
      // dragging the party through a door is a normal thing for them to do. A
      // player moves a token their seat controls — the character they are playing,
      // plus whatever the DM has handed them — and nothing else. Zero controllers
      // means the DM alone, so every NPC on the board stays out of the party's hands
      // until the DM says otherwise.
      //
      // This mirrors `requireMovableToken` deliberately, and has to keep mirroring
      // it. It is not the check that matters — the server refuses regardless — but
      // a token the UI lets you pick up and the server then rejects is a worse
      // experience than one that never moved, so the two rules are written to agree.
      //
      // **It now agrees by reading rather than by re-deriving**, which is the whole
      // change. `controllerIds` is `effectiveControllersOf`'s output — the DM's
      // explicit grants unioned with the seat playing the character — so this is the
      // same fact the write path refuses on rather than a second implementation of
      // it, and it cannot drift. The walk it replaces (token → character → my
      // character) was not merely at risk of going stale: ADR 0005 predicted this
      // change and named the shape that breaks it, a pet the party shares, which has
      // no claimed character for such a walk to land on at all. The DM is never a
      // member of that array and does not need to be — being the DM is holding the
      // DM code (invariant 7), which is exactly what `isDm` says here.
      //
      // ⚠️ **There is a layer clause again, and the sentence that used to stand here
      // said there must never be one — so this is a correction rather than an
      // override of it.** That argument was that a non-DM never holds a token such a
      // clause could refuse, because `maySee` in convex/lib/board.ts filtered them
      // out of the payload and the controller sets are computed over the visible half
      // only. It was true of the GM layer and remains true of it. It is **false of
      // Background**, which players do receive, are drawn, and can click on: the old
      // clause's premise was that sight and interaction were one answer, and a third
      // layer exists precisely because they are not.
      //
      // What it is emphatically not is the old `token.layer === 'player'` restored.
      // That was a rule re-derived here, and re-deriving it is what the property
      // above forbids; `mayPlayersMove` is the shared predicate
      // `requireMovableToken` throws `TOKEN_NOT_MOVABLE` on, read rather than
      // restated, so the affordance and the refusal cannot come apart. The DM's own
      // view is untouched — a hero parked on the GM layer, or a rock the DM is
      // rearranging, is still draggable, because `isDm` is answered first.
      canMove:
        isDm ||
        (mayPlayersMove(token.layer) &&
          playerId !== null &&
          token.controllerIds.includes(playerId)),
      vitals: vitalsOf(token.characterId),
      // `requireEditableCharacter` restated, exactly as `canMove` restates
      // `requireMovableToken`: the DM may change anybody's hit points, a player may
      // change the character their seat has claimed, a seat the DM has granted
      // control of the token may change that creature's too — the shared pet is the
      // case that needs it — and a token with no character behind it has no hit
      // points for anyone to change.
      //
      // **Three clauses because there are two server rules, not one.** The claim
      // test mirrors `requireEditableCharacter`, which keys off the claim holder and
      // knows nothing about tokens; the controller test mirrors the token control
      // `canMove` reads. They overlap today by construction — the claim holder is
      // always in `controllerIds` — so keeping the claim clause costs nothing, and it
      // is what stops this quietly becoming wrong if the two server rules ever say
      // different things, which they may: a hero standing on no token at all still
      // has a sheet their player edits, and control is attached to a token.
      //
      // ⚠️ Still no `layer` clause, deliberately. Hit points belong to the
      // character, not to the token drawn for it, and the server's rule does not
      // mention one either. Adding one is not hypothetical damage — removing it is
      // what fixed a live bug, a hero whose token the DM had moved to the DM layer
      // being unable to reach their own hit points.
      //
      // The rules have to keep agreeing. Offering a `+` that the server then refuses
      // is a worse experience than not offering it, and the refusal a player would
      // get for somebody else's hero is worded for the case where they had to have
      // gone looking for it.
      canEditHp:
        token.characterId !== null &&
        (isDm ||
          token.characterId === myCharacterId ||
          (playerId !== null && token.controllerIds.includes(playerId))),
      // `isDm` first, so a player's board computes nothing: the question is *has the
      // party lost sight of this*, which is not a sentence about your own screen, and a
      // player's payload has already had the fogged rows taken out of it.
      hiddenFromParty: isDm && hiddenFromParty(token, at.get(token._id) ?? null, rects),
      // Read, never derived, and never filtered here. The server decided which coins'
      // rows travel — `visibleMarkers` runs `maySee`, so a GM-layer coin's conditions
      // are absent from a player's payload rather than dropped in this file
      // (CLAUDE.md invariant 1).
      markers: marked.get(token._id) ?? NO_MARKERS,
    }))
    // `vitalsOf` is stable until the vitals themselves change, at which point every
    // token object here is rebuilt and every coin reconciles. That is the trade, and
    // it is the right way round: damage lands a few times a round, whereas a pan
    // lands sixty times a second and touches none of these dependencies at all.
    //
    // `fog` joins that trade on the cheap side of it: a rectangle is drawn a handful of
    // times an evening, so rebuilding every token object when one lands costs a
    // reconciliation nobody can perceive — and the cue has to be exact at the moment the
    // fog moves, which is precisely when the DM is looking at it.
    //
    // `markers` is on the same side of that trade and in its own register: a condition is
    // ticked a few times a round, where a pan lands sixty times a second and touches none
    // of these dependencies at all. What it costs when one *is* ticked is every token
    // object rebuilt and every coin reconciled — the same charge damage already pays, for
    // an event that happens far less often than damage does.
  }, [tokens, positions, fog, marked, isDm, playerId, myCharacterId, vitalsOf])

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
    //
    // ⚠️ **Markers are not awaited either, and it is the same argument one step
    // smaller.** A coin drawn a frame before its pips is a coin; a coin drawn a frame
    // before its position is a coin in the wrong room. Holding the map behind a
    // skeleton for a pip would be paying for a pip with the map — and a marker is a
    // label that adjudicates nothing, so nothing at the table turns on seeing it in
    // the first frame rather than the second.
    loading:
      scene === undefined || tokens === undefined || (scene !== null && positions === undefined),
  }
}
