import { diceNotation, type ShownDie } from './notation'

/**
 * The one module in this application that knows which 3D dice library it uses.
 *
 * Everything above it sees `DiceTray`: a thing you can show dice on, clear and throw
 * away. That seam is worth having for a specific reason rather than on principle — this
 * project is on its *second* dice library already. `@3d-dice/dice-box` is the package
 * named in ADR 0001, CLAUDE.md and the roadmap, and it cannot be told what numbers to
 * display, which makes it unusable here: the hard rule of the rolls work is that the server
 * evaluates every roll, so the dice must show numbers that were decided elsewhere.
 * `@3d-dice/dice-box-threejs` is the same author's fork that exists to preserve exactly
 * that (three.js + cannon-es rather than Babylon + an ammo.js WASM blob). A third
 * migration should touch this file and nothing else.
 *
 * No React, no hooks, no `@/components`. Plain DOM and the library, so the component
 * that eventually mounts it is free to decide when — and so this module can be reasoned
 * about without a render tree.
 *
 * ## What matters more than the dice
 *
 * ⚠️ **The feed and the announcement are the authoritative readout; the dice are the
 * flourish.** A table whose browser cannot run WebGL, or whose dice assets 404, must
 * still be able to play — so `createDiceTray` answers **`null`** rather than throwing,
 * and every caller is expected to carry on without a tray. Getting that ordering
 * backwards would mean a graphics problem stopping a game, which is a far worse failure
 * than silent dice. The same ordering is why `show` never rejects: a die the engine
 * cannot render is dropped by `diceNotation`, and the number is in the feed regardless.
 */

/**
 * A tray of dice over the map.
 *
 * `show` resolves when the dice have settled, so a caller can sequence an announcement
 * against it. It never rejects — see the note above.
 */
export type DiceTray = {
  show(dice: readonly ShownDie[]): Promise<void>
  clear(): void
  /**
   * Re-measure the container and rebuild the physics world to match it.
   *
   * ⚠️ **The engine only ever resizes itself on a `window` resize, and the pane this sits
   * in resizes without one.** `resizeWorld` registers exactly one listener on `window`, so
   * dragging the divider — which changes this container's width sixty times a second inside
   * a window that never changes at all — leaves the canvas and the physics walls at
   * whatever size they were built at. Found in a browser, and the symptom is the reason it
   * is worth a method: widen the map after narrowing it and the dice can only ever land in
   * the left half, narrow it after widening and half the throwing area is outside the pane
   * and clipped away. Either reads as *"the dice have stopped working"*, with nothing on
   * screen to explain it, and a reload silently fixes it.
   *
   * **Calling the engine's own `setDimensions` rather than tearing the tray down and
   * building another.** A rebuild is a WebGL context, a texture load and a physics world
   * for a change of width, it drops any dice mid-throw, and it would have to settle the
   * `show` promise the announcement is sequenced against — three problems in place of the
   * one being solved. This is the same call the engine's own listener makes, with the same
   * arguments, reached by a different route.
   *
   * Inert after `dispose`, which neutralises `setDimensions` for its own reasons — so a
   * late observer callback costs nothing.
   */
  resize(): void
  dispose(): void
}

/**
 * The dice's look, and the reason it is three constants rather than a call-site object.
 *
 * ⚠️ **`DICE_TEXTURE` names a file that has to exist in `public/dice/textures/`, and
 * changing it without copying the file gives a table with no dice at all.** The engine
 * resolves a colourset's texture through `assetPath + 'textures/<name>.webp'`, and
 * `initialize` rejects when that image fails to load — which `createDiceTray` turns
 * into `null`. So the texture name and the committed asset are one decision, and this
 * is where a reader looking at either half will find the other. `marble` was chosen
 * because it is a single 51 KB file with no bump map, and its material (`glass`) is
 * already the default.
 */
const DICE_COLOURSET = 'white'
const DICE_TEXTURE = 'marble'
const DICE_SURFACE = 'green-felt'

/**
 * Where the dice assets live, built from `import.meta.env.BASE_URL`.
 *
 * ⚠️ **This is the whole point of the spike, and a leading-slash literal is the bug it
 * exists to find.** This app is served from `https://<user>.github.io/coffee-code-n-kobolds/`
 * — CLAUDE.md invariant 4 — so `'/dice/textures/marble.webp'` resolves to
 * `https://<user>.github.io/dice/…`, which 404s, and the failure surfaces as *the dice
 * do not appear* with nothing in the UI to explain it. `BASE_URL` is Vite's own
 * answer to the same question and is inlined at build time (`'/coffee-code-n-kobolds/'`
 * in this project, `'/'` under `npm run dev`).
 *
 * The engine concatenates `assetPath + 'textures/…'` with **no separator inserted**, so
 * the value has to end in a slash. Vite normalises `base` to a trailing slash and
 * `BASE_URL` therefore already has one — but the test below is here rather than a
 * comment saying so, because a doubled `//` is another 404 on some static hosts and the
 * cost of not assuming is one conditional.
 *
 * `public/` is copied verbatim into `dist/` by `vite build` with no base prefix applied,
 * so a file at `public/dice/textures/marble.webp` is served at
 * `/coffee-code-n-kobolds/dice/textures/marble.webp` — which is exactly what this
 * produces.
 */
function diceAssetPath(): string {
  const base = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}dice/`
}

/**
 * Used to build the CSS selector the engine insists on. See the note in `createDiceTray`.
 */
let trayCount = 0

/**
 * Start a dice tray inside `container`, or answer `null` if it cannot be started.
 *
 * ⚠️ **The dynamic `import` is inside this function on purpose.** three.js and cannon-es
 * are ~700 KB of the library's bundled ES module, and the main chunk of this app is
 * already near a megabyte. A static import at the top of a file that any board
 * component imports would put all of it in the entry chunk, for a feature that does
 * nothing until somebody clicks a roll. Keeping the import here is what makes Rollup
 * split it into its own lazily-loaded chunk — verify that in the build output rather
 * than trusting it, because a stray static import anywhere in the module graph silently
 * undoes it.
 *
 * ⚠️ **`container` must already be laid out.** The engine reads `clientWidth` and
 * `clientHeight` in its constructor and builds the physics world's walls from them, so
 * a container with no size yields a degenerate box the dice fall out of. That is refused
 * here — with a console error naming the cause, since a silently empty tray is the
 * failure this whole module is arranged to avoid — rather than papered over with a default
 * size. `resize` on the returned tray corrects one that exists; nothing can correct one
 * that was never built, and the engine's own resize path is a `window` listener that a
 * container growing inside a stable window never fires.
 *
 * Everything that can fail is caught and answered as `null`: WebGL unavailable, the
 * chunk failing to load, the texture 404ing under a wrong base path. None of them is a
 * reason a table cannot play.
 */
export async function createDiceTray(container: HTMLElement): Promise<DiceTray | null> {
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    console.error('Dice tray: container has no size yet, so no tray was created.')
    return null
  }

  try {
    // `default` because the package exports the class as a default and nothing else.
    const { default: DiceBox } = await import('@3d-dice/dice-box-threejs')

    // The engine's constructor runs `document.querySelector` on its first argument, so
    // an element has to be turned back into a selector that finds it. Borrowing the
    // element's own id when it has one keeps the DOM tidy in dev tools; minting one
    // otherwise is what lets a caller hand over an anonymous `<div>` — which every
    // overlay in this codebase currently is. `CSS.escape` because an id chosen upstream
    // is not guaranteed to be a bare CSS identifier.
    if (!container.id) container.id = `dice-tray-${++trayCount}`
    const selector = `#${CSS.escape(container.id)}`

    const box = new DiceBox(selector, {
      assetPath: diceAssetPath(),
      theme_colorset: DICE_COLOURSET,
      theme_texture: DICE_TEXTURE,
      theme_surface: DICE_SURFACE,
      // ⚠️ **Sounds stay off, and that is an asset decision rather than a taste one.**
      // Turning them on makes the engine fetch 79 mp3 files (~620 KB) whose exact names
      // depend on the surface *and* on the colourset's material, and `initialize`
      // rejects if any of them 404s — so it would need all of them committed, not a
      // chosen few. Audio at the table is the DM-tooling milestone's music selector, which will
      // decide where sound comes from; until then this is 620 KB of git history for a
      // flourish on a flourish.
      sounds: false,
      shadows: true,
    })

    await box.initialize()

    const canvas = box.renderer?.domElement
    if (canvas) {
      // ⚠️ **The canvas must never eat a click.** This layer sits over the map, and
      // `TokenHpPopover` states the failure it causes: anything laid over the board
      // that swallows a pointer event is a token the DM cannot pick up, and it fails
      // *silently*, because a transparent box has nothing on screen to explain why the
      // map stopped responding. Every overlay here opts out of the pointer by default
      // and opts back in only where it draws something to click — and a full-bleed dice
      // canvas draws nothing clickable at all, so it never opts back in.
      canvas.style.pointerEvents = 'none'
      canvas.style.display = 'block'
    }

    return makeTray(box, container)
  } catch (error) {
    // Deliberately swallowed down to a console line. See the ordering note at the top:
    // the roll has already happened on the server and is already in the feed, so
    // nothing about this is worth a toast, a retry or a thrown error.
    console.error('Dice tray: could not start the 3D dice.', error)
    return null
  }
}

/**
 * The engine instance's type, named without importing the package.
 *
 * `typeof import(…)` in *type* position is erased completely, so this costs nothing at
 * runtime — which matters, because a real top-level `import` here would put three.js
 * back in the entry chunk and undo the whole point of the dynamic import above.
 */
type DiceBoxEngine = InstanceType<(typeof import('@3d-dice/dice-box-threejs'))['default']>

/**
 * Wraps a live engine in the three methods callers get.
 *
 * Split out of `createDiceTray` so that the closure state below — the generation
 * counter and the disposed flag — has one obvious scope, and so the `try` above covers
 * only the things that can actually fail.
 */
function makeTray(box: DiceBoxEngine, container: HTMLElement): DiceTray {
  /**
   * ⚠️ **A generation counter, not a promise queue.** Rolls arrive from a subscription
   * and can overlap: somebody rolls initiative while the last attack is still tumbling.
   * The engine's own answer is to clear the tray and start again, which is the right
   * behaviour — the newest roll is the one people are looking at. What must not happen
   * is the *older* `show` finishing its remaining `add` calls into the new throw, which
   * would leave dice on screen that no feed line explains. Queueing would instead make
   * every roll wait for the tumble before the last, which is worse: the dice would fall
   * further and further behind the feed. So a newer `show` wins outright, and the older
   * one checks its generation and stops.
   */
  let generation = 0
  let disposed = false

  /**
   * ⚠️ **The engine's promises never settle when a throw is superseded, so `show` has to
   * be let off the hook explicitly.** `roll` starts an animation loop guarded by
   * `this.running == <the timestamp it began with>`; a second `roll` overwrites
   * `running`, the first loop sees the mismatch and returns, and **its promise is
   * therefore never resolved or rejected**. Awaiting it would leave the superseded
   * `show` pending forever — which matters because the roll announcement over the map is
   * sequenced against this promise, so a stalled one is an announcement that never
   * appears. Racing each engine call against this resolver is what makes a superseded
   * `show` finish promptly instead.
   */
  let releaseSuperseded: (() => void) | null = null
  const supersede = () => {
    generation++
    releaseSuperseded?.()
    releaseSuperseded = null
  }

  return {
    async show(dice) {
      if (disposed) return

      const groups = diceNotation(dice)
      // A passive announces itself and rolls nothing. Clearing rather than leaving the
      // previous roll's dice sitting there is what stops the tray contradicting the feed.
      if (groups.length === 0) {
        supersede()
        box.clearDice()
        return
      }

      supersede()
      const mine = generation
      const superseded = new Promise<void>((resolve) => {
        releaseSuperseded = resolve
      })
      const settled = <T>(work: Promise<T>) => Promise.race([work, superseded])

      try {
        // One `roll` and then an `add` per remaining group, because the engine parses one
        // `@` per notation string — see the note on `diceNotation`. `roll` clears the tray
        // first; `add` appends to the throw it started.
        await settled(box.roll(groups[0]))
        for (const group of groups.slice(1)) {
          if (disposed || generation !== mine) return
          await settled(box.add(group))
        }
      } catch (error) {
        // Same ordering as `createDiceTray`: the number is already in the feed.
        console.error('Dice tray: a roll failed to render.', error)
      }
    },

    resize() {
      if (disposed) return

      const width = container.clientWidth
      const height = container.clientHeight
      // A pane collapsed to nothing is not a size to rebuild a world at, and it is what a
      // container measures while it is being unmounted. Left alone until it has one again.
      if (width === 0 || height === 0) return

      // The engine's own listener compares the canvas to the container before doing any
      // work, and so does this: a `ResizeObserver` fires for a change of one sub-pixel and
      // for a change that has already been applied, and rebuilding the world box and
      // calling `renderer.setSize` is not free.
      const canvas = box.renderer?.domElement
      if (canvas && canvas.width === width && canvas.height === height) return

      box.setDimensions({ x: width, y: height })
    },

    clear() {
      if (disposed) return
      // Superseding stops an in-flight `show` from adding its later groups to a tray
      // somebody has just asked to be empty — and releases the promise it is waiting on.
      supersede()
      box.clearDice()
    },

    dispose() {
      if (disposed) return
      disposed = true
      // Releases an in-flight `show` before the engine underneath it stops answering.
      supersede()

      // ⚠️ **Two of the engine's callbacks outlive it, and there is no `dispose` on the
      // engine to stop them, so they are replaced with no-ops before the context goes.**
      // `resizeWorld` registers a `window` resize listener around a closure it never
      // stores, so `removeEventListener` is impossible — and after this canvas is
      // detached the container measures zero, so the next window resize would rebuild
      // the physics world at zero size against a dead renderer. `clearDice` likewise
      // schedules a second render 100 ms later. Neutering what they call is the only
      // handle available on either.
      box.setDimensions = () => {}
      const renderer = box.renderer
      if (renderer) {
        renderer.render = () => {}
        renderer.domElement.remove()
        // `forceContextLoss` after `dispose` is three.js' own advice for a renderer that
        // is going away for good: `dispose` releases the programs, this releases the GL
        // context, and browsers cap how many of those a page may hold. A table that
        // navigates between scenes all evening would otherwise run out.
        renderer.dispose()
        renderer.forceContextLoss()
      }
    },
  }
}
