// WHICH TOOL THE DM IS HOLDING OVER THE MAP — one cell, one union, one armed thing.
//
// ⚠️⚠️ **THIS REPLACES THREE MODULE-LEVEL CELLS THAT COULD ALL BE ARMED AT ONCE, AND THAT WAS
// A BUG RATHER THAN AN UNTIDINESS.** `useFogMode`, `useGridTrace` and `useWallMode` each said
// whether *their* tool was out, and each of the three mounts a Konva draw surface spanning the
// whole image. Whichever is rendered last takes every press, so a DM with the grid tracer and
// the fog brush both lit could drag all afternoon and get a blue measuring box every time,
// with two buttons on screen insisting the fog tool was in their hand. `useBoardLayers`'
// docblock already argued the shape of this: *two `useState`s seeded from the same key are two
// pieces of state that agree only until somebody presses something — a toggle that hides
// nothing, which is worse than no toggle.*
//
// One cell holding one value makes arming one tool disarm the others **by construction**,
// rather than by three effects agreeing to. There is nothing left to keep in step.
//
// **Why this file and not `src/hooks/`, where the three cells it replaces lived.** The
// vocabulary and the store are pure, and vitest runs the client project in a plain `node`
// environment with no renderer — so a hook is not testable here and a module is. `useBoardTool`
// next door is the three lines of `useSyncExternalStore` that subscribe to it. That split is
// what lets `boardTool.test.ts` assert the thing a reader most wants asserted: that arming one
// really does disarm the rest, and that the vocabulary and the `Record`s over it agree.
//
// **Nothing is written to `localStorage`**, which is `useFogMode`'s departure from
// `useBoardLayers` and is inherited whole: a layer preference is worth remembering across a
// reload, and an armed eraser is one click from deleting the ambush the DM spent the afternoon
// drawing. Off is the only safe thing to open at.

/**
 * Every tool that can take the pointer away from the coins.
 *
 * ⚠️ **`grid` is one member where the fog and wall tools are three and two, and the asymmetry
 * is deliberate.** The other two unions are *modes* — a rectangle, a polygon and an eraser are
 * three different gestures, and which one is armed decides what pressing the map does. The grid
 * has two tools as well, `handles` and `trace`, but that choice is a **preference** the DM sets
 * in `GridCalibrator` and it does not arm anything: the button in the board's own toolbar is
 * what puts the chosen tool on the map, and that panel's copy says so in as many words. Folding
 * the choice in here would give the toolbar button two things to mean and leave the picker
 * silently arming the board. So `GridTool` stays in `useGridTrace` beside the box it measures,
 * and what lives here is the one bit that says the grid tool is out.
 *
 * The order is the order the members were built in, and nothing iterates this array for
 * display — each panel iterates its own subset below, because a fog panel offering a wall
 * eraser would be worse than a fog panel that has to be kept in step.
 */
export type BoardTool =
  | 'off'
  | 'fog-draw'
  | 'fog-polygon'
  | 'fog-erase'
  | 'grid'
  | 'wall-draw'
  | 'wall-erase'

export const BOARD_TOOLS: readonly BoardTool[] = [
  'off',
  'fog-draw',
  'fog-polygon',
  'fog-erase',
  'grid',
  'wall-draw',
  'wall-erase',
]

/**
 * Which overlay a press on the map belongs to while a given tool is armed. `none` is the board
 * behaving normally — coins are pickable and every overlay is deaf.
 *
 * This exists so that `Board` can decide which layer is mounted **by looking a tool up** rather
 * than by naming members in JSX. Three `tool === 'fog-…'` comparisons is the formulation where
 * a new member arrives, compiles, passes, and mounts nothing at all — a lit button that does
 * nothing when the map is pressed. CLAUDE.md invariant 9's rule stated as *find the place a
 * wrong answer does damage, and make the compiler refuse there*: for this union that place is
 * the mount, and a `Record` keyed by the union is the refusal.
 *
 * It is a `Record` and not a `switch` with a `never` arm because nothing here guards a secret
 * and there is no runtime default worth having — `lib/markers.ts` reaches the same conclusion
 * about its own vocabulary, and for the same reason: the compile-time refusal is the whole of
 * the guard, and `boardTool.test.ts` pins the direction the compiler cannot see.
 */
export type BoardSurface = 'none' | 'fog' | 'grid' | 'wall'

export const BOARD_TOOL_SURFACE: Record<BoardTool, BoardSurface> = {
  off: 'none',
  'fog-draw': 'fog',
  'fog-polygon': 'fog',
  'fog-erase': 'fog',
  grid: 'grid',
  'wall-draw': 'wall',
  'wall-erase': 'wall',
}

/**
 * The fog panel's own row of buttons, in the order they are offered — the two draw tools
 * together and the eraser last, which is the order of the gesture rather than the order they
 * were built in.
 *
 * ⚠️ **A hand-spelled subset rather than a filter over `BOARD_TOOL_SURFACE`, and the reason is
 * the same one `TOKEN_LAYERS` is hand-spelled beside its validator.** A `filter` gives
 * `BoardTool[]`, so `Record<FogTool, …>` in `FogTools` would degrade to a partial map and stop
 * being a compile-time refusal — which is the only thing making a new fog mode arrive with
 * somewhere to be pressed. The price is that the subset and the surface map can disagree, and
 * that is exactly the direction `boardTool.test.ts` sweeps: both ways round, so a member added
 * to one and not the other fails.
 *
 * `off` is in both lists on purpose. It is the first button in each panel — the way out of a
 * mistake — and putting a tool down is a thing every panel has to be able to do.
 */
export const FOG_TOOLS = ['off', 'fog-draw', 'fog-polygon', 'fog-erase'] as const
export type FogTool = (typeof FOG_TOOLS)[number]

/** The wall panel's row. Two rather than fog's three: a wall has one shape. */
export const WALL_TOOLS = ['off', 'wall-draw', 'wall-erase'] as const
export type WallTool = (typeof WALL_TOOLS)[number]

const FOG_TOOL_SET = new Set<BoardTool>(FOG_TOOLS)
const WALL_TOOL_SET = new Set<BoardTool>(WALL_TOOLS)

/**
 * Is the armed tool one of this panel's? Needed because each panel indexes a `Record` over its
 * own subset, and the cell can perfectly well be holding somebody else's tool.
 *
 * A panel whose tool is not armed reads `off`, which is the honest answer: no button of *theirs*
 * is lit, and the hint under the row describes the board behaving normally, which from that
 * panel's point of view it is.
 */
export function isFogTool(tool: BoardTool): tool is FogTool {
  return FOG_TOOL_SET.has(tool)
}

export function isWallTool(tool: BoardTool): tool is WallTool {
  return WALL_TOOL_SET.has(tool)
}

type Store = { tool: BoardTool; listeners: Set<() => void> }

/**
 * Keyed by game code, so a browser that has been in two games does not carry the first one's
 * armed tool into the second — the scoping every cell in `lib/session.ts` uses and the three
 * cells this replaces each had.
 */
const stores = new Map<string, Store>()

function storeFor(code: string): Store {
  const existing = stores.get(code)
  if (existing) return existing

  const store: Store = { tool: 'off', listeners: new Set() }
  stores.set(code, store)
  return store
}

/** What this browser is holding over the given game's board. */
export function boardTool(code: string): BoardTool {
  return storeFor(code).tool
}

/** The overlay that owns the pointer right now, or `none`. */
export function boardSurface(code: string): BoardSurface {
  return BOARD_TOOL_SURFACE[boardTool(code)]
}

/**
 * Arm one tool, which puts down whatever was in the DM's hand. **The whole point of the file
 * is that this sentence needs no second clause.**
 *
 * The no-op guard is not tidiness: `useSyncExternalStore` re-renders every subscriber on any
 * notification, and one of the subscribers is a Konva layer over a map, so pressing the tool
 * you are already holding would repaint the board. `setTools` in `useBoardLayers` and
 * `setTokenLayer` on the server both decline the same no-op for the same reason.
 */
export function armBoardTool(code: string, next: BoardTool): void {
  const store = storeFor(code)
  if (store.tool === next) return
  store.tool = next
  for (const listener of store.listeners) listener()
}

/**
 * Put the tool down, but **only if the armed one belongs to this surface**.
 *
 * ⚠️ **The conditional is the whole of this function and it is what the merge made necessary.**
 * Each panel disarms itself when it unmounts, because `DmToolsTab`'s sub-tab strip is
 * uncontrolled and its subtree is not force-mounted — so arming the eraser, glancing at the
 * Feed and coming back used to reach an armed tool with no lit button anywhere on screen and
 * presses on the map deleting things. `FogTools` had three lines for that and `WallTools`
 * copied them.
 *
 * With three separate cells an unconditional `setMode('off')` was correct, because a panel
 * could only ever put down its own tool. With one cell it is not: leaving the Fog tab while the
 * *grid* tracer is out would disarm the tracer, from a component that has nothing to do with
 * it. So the caller names its surface and this asks whether it is the one holding the pointer.
 */
export function putDownBoardSurface(code: string, surface: BoardSurface): void {
  if (boardSurface(code) !== surface) return
  armBoardTool(code, 'off')
}

/** For `useSyncExternalStore`. Returns the unsubscriber. */
export function subscribeToBoardTool(code: string, listener: () => void): () => void {
  const store = storeFor(code)
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}
