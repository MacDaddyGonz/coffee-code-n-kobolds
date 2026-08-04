/**
 * Types for `@3d-dice/dice-box-threejs`, which ships none of its own.
 *
 * ⚠️ **Hand-written, deliberately partial, and the narrowness is the point.** The
 * package publishes one bundled `dist/dice-box-threejs.es.js` with a `main` field, no
 * `types`, no `exports` and no `@types/…` on npm, so without this file
 * `await import('@3d-dice/dice-box-threejs')` is a TS2307 and `npm run lint` fails. The
 * alternative was a `@ts-expect-error` over the import and an `any` downstream, which
 * would have typed the *import* and left every call to the engine unchecked — the
 * opposite of the trade worth making, since the calls are where a wrong argument
 * silently produces dice showing the wrong numbers.
 *
 * Only what `diceBox.ts` actually calls is declared. Everything else the class offers —
 * `reroll`, `remove`, `updateConfig`, the Star Wars dice, the colour picker — is
 * absent on purpose: an unused declaration is a claim about a version of a package
 * nobody checked, and the surface this app depends on is small enough to keep honest by
 * hand. Two members exist here *only* so `dispose` can neutralise them; their
 * docblocks say why.
 *
 * Pinned against version **0.0.12**. The shapes below were read out of that bundle,
 * not out of the README.
 */
declare module '@3d-dice/dice-box-threejs' {
  /**
   * What the engine reports when a throw settles.
   *
   * ⚠️ **`total` and `modifier` are declared and must never be used.** They are the
   * engine doing arithmetic, and this application's numbers are decided by the server
   * — see the note at the top of `notation.ts`. They are named here so a reader who
   * finds them in the console knows they exist and are deliberately ignored, and so
   * `unknown` does not tempt anybody into casting the whole payload.
   */
  export type DiceBoxResults = {
    notation: string
    sets: readonly {
      num: number
      type: string
      sides: number
      rolls: readonly { type: string; sides: number; id: number; value: number }[]
      total: number
    }[]
    modifier: number
    total: number
  }

  export type DiceBoxConfig = {
    /**
     * Prefix for every texture and sound URL, concatenated as `assetPath + 'textures/…'`
     * with no separator inserted — so it **must** end in a slash. Defaults to `'./'`.
     * This is the whole reason the spike exists: see `diceBox.ts`.
     */
    assetPath?: string
    framerate?: number
    sounds?: boolean
    volume?: number
    shadows?: boolean
    theme_surface?: string
    theme_colorset?: string
    theme_texture?: string
    theme_material?: string
    gravity_multiplier?: number
    light_intensity?: number
    baseScale?: number
    strength?: number
    onRollComplete?: (results: DiceBoxResults) => void
  }

  export default class DiceBox {
    /**
     * ⚠️ **The first argument is a CSS selector string, not an element.** The
     * constructor runs `document.querySelector` on it. `createDiceTray` takes an
     * element like every other overlay in this codebase and bridges the difference.
     */
    constructor(containerSelector: string, config?: DiceBoxConfig)

    initialize(): Promise<void>

    /** Throws the notation. Rejects nothing; resolves with the settled faces. */
    roll(notation: string): Promise<DiceBoxResults>

    /** Adds more dice to the throw already on the tray, honouring its own `@` values. */
    add(notation: string): Promise<unknown>

    clearDice(): void

    /**
     * Declared only so `dispose` can replace it with a no-op. `resizeWorld` registers a
     * `window` resize listener around an unstored closure, so the listener can never be
     * removed — neutralising what it calls is the only way to stop a disposed tray
     * resizing itself.
     */
    setDimensions(dimensions: { x: number; y: number }): void

    /**
     * three.js' renderer. Declared for the same reason as `setDimensions`: the canvas
     * has to come out of the DOM and the GL context has to be released, and there is no
     * `dispose` on the engine itself to do it.
     */
    renderer?: {
      domElement: HTMLCanvasElement
      render: (...args: unknown[]) => void
      dispose: () => void
      forceContextLoss: () => void
    }
  }
}
