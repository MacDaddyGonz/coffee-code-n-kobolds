import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicFog } from '@convex/lib/fog'
import type { Point, Rect } from '@convex/lib/grid'
import { anyRectCovers } from '@convex/lib/grid'
import { positionsArgs } from '@/hooks/useBoard'

// FOG OF WAR, in the browser: the rectangles, the tool the DM has armed, and who is
// standing in the dark.
//
// Nothing here decides what anybody may see. `fog.list` is ungated by design — a player
// who cannot see that the corridor is black does not experience suspense, they wonder
// where the monsters went — and the rows that *are* withheld were dropped by
// `foggedTokenIds` in convex/lib/board.ts before this bundle was handed a payload
// (CLAUDE.md invariant 1). So this file draws a picture and arms a tool, and the one
// predicate in it is a **cue for the DM about their own screen**, never a filter.
//
// ⚠️ **`positionsArgs` is imported from `useBoard`, which imports `useFog` back.** The
// cycle is deliberate and is between two hoisted function declarations that only call
// each other at render time, so there is no initialisation order to get wrong. The
// alternative was a second spelling of the `board.positions` argument object, which that
// builder's own docblock spends a paragraph forbidding: `useQuery` keys its cache on the
// serialised arguments, so a second spelling is a second socket subscription and a second
// server execution of the query the whole board already holds.

/**
 * The arguments `fog.list` is subscribed with. `tokensArgs`/`positionsArgs`' rule, and
 * the fourth member of that set — see `feedArgs` for the long version.
 *
 * Two readers name this entry on one screen, which is what makes the builder mandatory
 * rather than stylistic: `FogLayer` draws the rectangles and `FogTools` counts them, and
 * a mismatched spelling would give one of them a subscription of its own to a query the
 * other is already holding. `dmCode` is **omitted rather than passed as `undefined`**
 * when there is none, because `undefined` is not a Convex value — the two spellings are
 * the same request on the wire and not necessarily the same object here — and the key
 * order is fixed here because `JSON.stringify` is order-sensitive.
 */
export function fogArgs(code: string, sceneId: Id<'scenes'>, dmCode: string | null) {
  return dmCode === null ? { code, sceneId } : { code, sceneId, dmCode }
}

/** Held still so a game with no fog hands every consumer the same empty array. */
const NO_FOG: PublicFog[] = []

/**
 * Every rectangle on one scene, or `undefined` while the first answer is in flight.
 *
 * **Skipped until there is a scene**, exactly as `useBoard` skips `board.positions`:
 * `fog.list` insists the scene belongs to the game, so with no scene there is no id to
 * pass and nothing to ask. A game whose DM has not put a map on the table yet is not a
 * board with no fog on it, it is not a board.
 *
 * `undefined` travels rather than being flattened to an empty array, because the two
 * mean different things to a panel that wants to print a count — see `FogTools`.
 */
export function useFog(
  code: string,
  sceneId: Id<'scenes'> | null,
  dmCode: string | null,
): PublicFog[] | undefined {
  return useQuery(api.fog.list, sceneId === null ? 'skip' : fogArgs(code, sceneId, dmCode))
}

/** Which fog tool the DM has armed. `off` is the board behaving normally. */
export type FogMode = 'off' | 'draw' | 'erase'

/**
 * The modes, in the order they are offered. Iterated rather than three buttons written
 * out, for `TOKEN_LAYERS`' reason: a fourth mode arrives with a control rather than with
 * nowhere to be pressed.
 */
export const FOG_MODES: readonly FogMode[] = ['off', 'draw', 'erase']

type Store = { mode: FogMode; listeners: Set<() => void> }

/**
 * ⚠️ **A module-level store rather than `useState`, and it is `useBoardLayers`' argument
 * with the same two halves of the screen in it.** The controls are in `FogTools`, deep
 * inside the right-hand pane; the gesture they arm is in `FogLayer`, inside the Konva
 * tree in the map pane. Two `useState`s cannot be that, and hoisting the mode to
 * `GameShell` would thread a board concern through the component whose job is to arrange
 * two panes — the same trade that file makes and declines, for the same reason.
 *
 * Keyed by game code so a browser that has been in two games does not carry the first
 * one's armed eraser into the second.
 *
 * **Nothing is written to `localStorage`, and that is the one place this departs from
 * `useBoardLayers`.** A layer preference is worth remembering across a reload; an armed
 * eraser is one click from deleting the ambush the DM spent the afternoon drawing, and a
 * tool that is still armed after a refresh nobody remembers doing is exactly how that
 * click happens. Off is the only safe thing to open at.
 */
const stores = new Map<string, Store>()

function storeFor(code: string): Store {
  const existing = stores.get(code)
  if (existing) return existing

  const store: Store = { mode: 'off', listeners: new Set() }
  stores.set(code, store)
  return store
}

/**
 * The fog tool this browser has armed, and the way to change it.
 *
 * ⚠️ **A view and never a permission, on ADR 0004's terms.** Arming the eraser paints a
 * cursor and makes the rectangles clickable on *this* screen; the refusal behind the
 * click is `requireDm` on every one of `fog.draw`, `fog.erase` and `fog.clear`
 * (CLAUDE.md invariant 7). A player who reached into this cell would arm a tool over a
 * layer that is not listening for them and get a refusal from the mutation if they got
 * past that.
 */
export function useFogMode(code: string): { mode: FogMode; setMode: (mode: FogMode) => void } {
  const subscribe = useCallback(
    (listener: () => void) => {
      const store = storeFor(code)
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    [code],
  )

  const mode = useSyncExternalStore(subscribe, useCallback(() => storeFor(code).mode, [code]))

  const setMode = useCallback(
    (next: FogMode) => {
      const store = storeFor(code)
      // Not tidiness: `useSyncExternalStore` re-renders every subscriber on any
      // notification, so pressing the tool you are already holding would repaint the
      // board. `setTools` next door declines the same no-op for the same reason.
      if (store.mode === next) return
      store.mode = next
      for (const listener of store.listeners) listener()
    },
    [code],
  )

  return { mode, setMode }
}

/**
 * The two fields the cue needs off a token, so both callers can pass what they have —
 * `BoardToken` from the canvas, `PublicToken` from the DM's coin list.
 *
 * `controllerIds` is the **effective** set the server computed in `effectiveControllersOf`
 * and put on the payload, never anything derived here; see the ⚠️ on
 * `publicTokenValidator`.
 */
export type FoggableToken = {
  _id: Id<'tokens'>
  controllerIds: readonly Id<'players'>[]
}

/**
 * WOULD THE PARTY HAVE LOST SIGHT OF THIS TOKEN? **`foggedTokenIds` in
 * convex/lib/board.ts, asked from the DM's chair**, and the reason it exists is that fog
 * is invisible in its effects on the one screen that draws every rectangle *and* every
 * coin: the DM sees through their own veil, so nothing on their board says the party has
 * stopped seeing the ogre behind it.
 *
 * ⚠️ **This is a cue and never a filter.** It answers about the DM's own payload, which
 * already contains everything; the withholding happened server-side, in the query, before
 * any of it was sent. A client that had to decide this for a *player* would already have
 * been sent the secret (CLAUDE.md invariant 1).
 *
 * Three clauses, and each is the server's own, in its order:
 *
 * - **`anyRectCovers`, imported and not re-implemented.** It is the same function the
 *   server ran, which is what makes the cue and the withholding one answer rather than
 *   two that agree until somebody edits one. Its half-open edges and its fail-open on a
 *   non-finite coordinate are argued in convex/lib/grid.ts and inherited whole.
 * - **The centre point, never the footprint.** The stored coordinate already *is* the
 *   centre, so no grid enters and a 2×2 ogre one pixel over the line does not vanish
 *   from the cue while most of it stands in the lit room. `foggedTokenIds` carries the
 *   full argument.
 * - ⚠️ **A token anybody at the table controls is never fogged.** Not a courtesy: the
 *   server excludes it, so a hero or a granted pet standing in a black corridor is
 *   *actually still visible* to the party. Without this clause the cue would tell the DM
 *   they had hidden a player's own hero when they had not, which is a lie about the one
 *   thing the DM would act on.
 *
 * A token standing nowhere — on another map, or on none — is not standing in the dark.
 */
export function hiddenFromParty(
  token: FoggableToken,
  position: Point | null,
  rects: readonly Rect[],
): boolean {
  if (position === null) return false
  if (token.controllerIds.length > 0) return false
  return anyRectCovers(rects, position)
}

/** Held still so a board with nothing in the dark hands every consumer the same empty set. */
const NONE_HIDDEN: ReadonlySet<Id<'tokens'>> = new Set()

/**
 * Whether two id sets hold the same members. A size test and one walk.
 *
 * This is the whole of what makes `useHiddenFromParty` cheap, so it is worth saying what it
 * is comparing: the *inputs* are rebuilt ten times a second while somebody is dragging, and
 * the *answer* changes only when a coin crosses a rectangle's edge. Everything between those
 * two facts is a list of two hundred rows re-rendering to say what it said a tenth of a
 * second ago.
 */
function sameIds(a: ReadonlySet<Id<'tokens'>>, b: ReadonlySet<Id<'tokens'>>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/**
 * The same cue for a list of coins rather than a board of them: `TokensTab`, which has
 * the tokens and none of the geometry.
 *
 * Three subscriptions and **not one of them is new to the screen** — `scenes.active` is
 * `MapSetupPanel`'s entry, and the other two are the ones `FogLayer` and `Board` already
 * hold — so this costs sockets and server executions nothing and costs renders something.
 * That something is the reason for the gate below.
 *
 * ⚠️ **`board.positions` is skipped until a rectangle exists, and that is the whole cost
 * model rather than a micro-optimisation.** Positions are written ten times a second
 * during a drag, and this tab's own ⚠️ says at length why a placement must not be folded
 * into its low-churn view of a coin (CLAUDE.md invariant 2). Gated on fog, a game that
 * never draws a rectangle re-renders this list exactly as often as it did before fog
 * existed — the same pay-as-you-go line `foggedTokenIds` draws on the server, for the
 * same reason. A game that *is* using fog pays a re-render of the list per position tick
 * while somebody is dragging, which is the honest price of a cue that is never stale, and
 * is recorded here rather than discovered.
 *
 * The DM gate is `dmCode`, not `players.isDm` (CLAUDE.md invariant 7). It costs nothing
 * — this tab is DM-only already — and it is what stops the cue ever being drawn on a
 * screen where "the party cannot see this" is not a sentence about somebody else.
 *
 * ⚠️ **The answer leaves rather than a closure over the inputs, and that is the difference
 * between paying for the cue once per rectangle and paying for it ten times a second.** This
 * used to hand back a `useCallback` whose dependencies were the position map and the
 * rectangles, so the *function* was a new identity on every position tick — which is every
 * hundred milliseconds for as long as anybody at the table is dragging a coin, for output
 * that is byte-identical until a creature crosses an edge. A set of ids is what the server
 * hands back from the same crossing (`foggedTokenIds`), and it can be compared: the set below
 * is replaced only when its contents differ, so a memoised row sees one changed prop when the
 * fog moves and none while the board is merely busy.
 *
 * The tokens have to arrive as an argument for that, because a set of *hidden* ids cannot be
 * built without them — `hiddenFromParty`'s second clause is about who controls a coin, and
 * splitting that off so this hook could answer from geometry alone would be two files
 * describing one predicate.
 */
export function useHiddenFromParty(
  code: string,
  dmCode: string | null,
  tokens: readonly FoggableToken[],
): ReadonlySet<Id<'tokens'>> {
  const scene = useQuery(api.scenes.active, { code })
  const sceneId = scene?._id ?? null

  const fog = useFog(code, sceneId, dmCode)
  const rects = fog ?? NO_FOG

  const positions = useQuery(
    api.board.positions,
    sceneId !== null && rects.length > 0 ? positionsArgs(code, sceneId, dmCode) : 'skip',
  )

  const at = useMemo(
    () =>
      new Map<Id<'tokens'>, Point>(
        (positions ?? []).map((row) => [row.tokenId, { x: row.x, y: row.y }]),
      ),
    [positions],
  )

  const isDm = dmCode !== null

  const built = useMemo(() => {
    // Nothing to be in the dark, and the early return is what keeps a game that never fogs
    // anything holding one shared empty set for the life of the session.
    if (!isDm || rects.length === 0) return NONE_HIDDEN

    const hidden = new Set<Id<'tokens'>>()
    for (const token of tokens) {
      if (hiddenFromParty(token, at.get(token._id) ?? null, rects)) hidden.add(token._id)
    }
    return hidden
  }, [isDm, at, rects, tokens])

  // ⚠️ **A ref written during render, which is the identity-collapsing escape hatch and not a
  // piece of state.** The value above is a pure function of the inputs, so a render that runs
  // twice — StrictMode, or a concurrent attempt that is thrown away — computes the same
  // members both times and whichever set survives is the same answer. The alternative was
  // `useState` plus an effect to copy into it, which is a second source of truth and a frame
  // of staleness for a cue whose whole job is to be exact at the moment the fog moves.
  const held = useRef(built)
  if (!sameIds(held.current, built)) held.current = built
  return held.current
}
