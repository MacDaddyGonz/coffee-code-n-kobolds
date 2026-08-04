import { useCallback, useMemo, useSyncExternalStore } from 'react'

import type { LayerView } from '@/lib/session'
import {
  getActiveLayer,
  getLayerView,
  rememberActiveLayer,
  rememberLayerView,
} from '@/lib/session'
import type { TokenLayer } from '@convex/lib/layers'
import { TOKEN_LAYERS, maySeeLayer } from '@convex/lib/layers'

export type BoardLayers = {
  /** Whether the DM is previewing the table's view or looking at all of it. */
  view: LayerView
  setView: (view: LayerView) => void
  /**
   * Which layers to paint. Derived from `view` and never stored, because two spellings of
   * one fact is how a toggle comes to disagree with the board it toggles.
   */
  shown: ReadonlySet<TokenLayer>
  /** Which layer the DM's next token lands on. */
  active: TokenLayer
  setActive: (layer: TokenLayer) => void
}

/** What a browser with nothing remembered opens at: everything shown, building for the party. */
const DEFAULT_VIEW: LayerView = 'all'
const DEFAULT_ACTIVE: TokenLayer = 'player'

type Tools = { view: LayerView; active: TokenLayer }
type Store = { tools: Tools; listeners: Set<() => void> }

/**
 * ⚠️ **A module-level store rather than `useState`, and the difference from `usePaneWidth`
 * — which this is otherwise shaped after — is the number of places that read it.**
 *
 * A pane width has one owner: the shell measures the row, renders the divider and hands the
 * number down. These two facts have two, in different halves of the screen. The DM's
 * controls live in `MapSetupPanel`, deep inside the right-hand pane; `shown` is read by
 * `TokenLayers`, inside the map pane; and `active` is read by `TokenAddDialog` between them.
 * Two `useState`s seeded from the same `localStorage` key are two pieces of state that agree
 * only until somebody presses something — a toggle that hides nothing, which is worse than
 * no toggle.
 *
 * The alternative was hoisting this to `GameShell` and threading it through both panes,
 * which is the arrangement `usePaneWidth` has and would be the right one if the shell owned
 * the board's tools. It does not: these are the board's, and routing them through the
 * component that arranges the two panes would put a board concern in the layout's props for
 * no gain over one subscribable cell.
 *
 * Keyed by game code so a browser that has been in two games does not carry the first one's
 * tools into the second, matching how every key in `lib/session.ts` is scoped.
 */
const stores = new Map<string, Store>()

function storeFor(code: string): Store {
  const existing = stores.get(code)
  if (existing) return existing

  // Read through once, on first use. Every later read is the cell, so a `localStorage`
  // hit is not on the path of a render that happens sixty times a second during a pan.
  const store: Store = {
    tools: {
      view: getLayerView(code) ?? DEFAULT_VIEW,
      active: getActiveLayer(code) ?? DEFAULT_ACTIVE,
    },
    listeners: new Set(),
  }
  stores.set(code, store)
  return store
}

/**
 * Replace the cell and tell everybody watching.
 *
 * The equality check is not tidiness: `useSyncExternalStore` re-renders every subscriber on
 * any notification, so pressing the layer you are already on would repaint the board.
 * `setTokenLayer` on the server declines the same no-op for the same reason.
 */
function setTools(code: string, next: Tools): void {
  const store = storeFor(code)
  if (store.tools.view === next.view && store.tools.active === next.active) return
  store.tools = next
  for (const listener of store.listeners) listener()
}

/**
 * The DM's two board tools for one game: what they are looking at, and what they are
 * working on.
 *
 * **Neither goes to Convex, deliberately, and it is ADR 0004's camera argument rather than
 * an omission.** A DM previewing the table's view while the table looks at the map is the
 * whole point of the control; a DM who hid their ambush from themselves and thereby hid it
 * from nobody would be synchronising a view as though it were board state. The layer a coin
 * is *on* is board state and is written by `board.addToken`; which layer the DM has selected
 * is not.
 *
 * ⚠️ **`shown` is a preference and never a permission.** It comes out of user-editable
 * storage, so nothing may depend on it to keep a secret: `TokenLayers` puts `dmOnly && !isDm`
 * underneath it precisely so the worst a hand-edited key can do is hide a layer. The rule
 * that actually keeps the GM layer off a player's screen is `maySee`, server-side, before
 * the payload is assembled (CLAUDE.md invariant 1).
 *
 * The player view is computed by asking `maySeeLayer` what a non-DM is sent rather than by
 * naming the GM layer here — the same discipline `useBoard` applies to `mayPlayersMove`. It
 * is what makes the one thing this toggle must not get wrong impossible to get wrong:
 * **Background is in the player view, because players see Background.** Written as a
 * `layer !== 'gm'` filter that would have been true by coincidence and one new layer away
 * from hiding scenery the table can see.
 */
export function useBoardLayers(code: string): BoardLayers {
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

  // Returns the cell itself, which is replaced rather than mutated on every write — so the
  // identity comparison React makes here is the right one and there is no snapshot to cache.
  const getSnapshot = useCallback(() => storeFor(code).tools, [code])

  const tools = useSyncExternalStore(subscribe, getSnapshot)

  const setView = useCallback(
    (view: LayerView) => {
      setTools(code, { ...storeFor(code).tools, view })
      rememberLayerView(code, view)
    },
    [code],
  )

  const setActive = useCallback(
    (active: TokenLayer) => {
      setTools(code, { ...storeFor(code).tools, active })
      rememberActiveLayer(code, active)
    },
    [code],
  )

  const shown = useMemo<ReadonlySet<TokenLayer>>(
    () => new Set(TOKEN_LAYERS.filter((layer) => tools.view === 'all' || maySeeLayer(layer))),
    [tools.view],
  )

  return { view: tools.view, setView, shown, active: tools.active, setActive }
}
