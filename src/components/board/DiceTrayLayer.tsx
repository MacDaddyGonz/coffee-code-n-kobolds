import { useEffect, useRef, useState } from 'react'

import type { DiceTray } from '@/lib/dice/diceBox'
import { createDiceTray } from '@/lib/dice/diceBox'
import type { ShownDie } from '@/lib/dice/notation'

/**
 * The shortest the total is allowed to be withheld, in milliseconds.
 *
 * The roadmap asks for the sentence and then the result **a beat later**, and this is
 * the beat. It is a floor rather than the timing itself: on a browser with a working
 * tray the dice take most of a second to settle and this expires long before they do,
 * and on a browser with no tray at all it is the whole of the pause. So the sequence
 * looks the same either way, which is the point — a table with one WebGL-less laptop in
 * it should not be able to tell which screen is which by the rhythm of the numbers.
 */
const MINIMUM_BEAT_MS = 850

/**
 * The longest the total is allowed to be withheld.
 *
 * ⚠️ **A number the server has already decided must never be trapped behind an
 * animation.** `diceBox.ts` is careful that a superseded `show` resolves promptly and
 * that nothing there rejects, so this cap should be unreachable — but it is the one
 * failure that would be indistinguishable from the roll having been lost, on the screen
 * of the person who clicked it, which is the exact confirmation this whole layer exists
 * to provide. Cheap insurance against a physics engine that stops answering.
 */
const MAXIMUM_WAIT_MS = 2600

/**
 * How many frames to wait for the container to be laid out before giving up.
 *
 * `createDiceTray` reads `clientWidth`/`clientHeight` to build the physics world's walls
 * and **refuses a container with no size**, permanently — its only resize path is a
 * `window` listener, which a container growing inside a stable window never fires. So
 * asking too early does not produce a small tray, it produces no tray for the rest of the
 * session. About a second of frames, which is far more than the one or two a flex layout
 * settling actually needs.
 */
const LAYOUT_FRAME_BUDGET = 60

export type DiceTrayLayerProps = {
  /**
   * The dice to throw for the current roll, or an empty array for a roll that has none.
   *
   * Empty is a real instruction and not "nothing to do": `DiceTray.show` clears the table
   * when handed no dice, which is what stops a passive ability announcing itself over the
   * previous roll's dice still lying there. `null` is the different case of *no roll yet*,
   * and is what `nonce === 0` means below.
   *
   * ⚠️ **Must be referentially stable for the life of one roll.** It is an effect
   * dependency, and a fresh array per render would re-throw the same dice on every render
   * of the parent. `TableEffects` memoises it against the feed row.
   */
  dice: readonly ShownDie[]
  /**
   * Which roll these dice belong to. `0` means *nothing has been rolled on this screen
   * yet*, and is the one value that throws nothing and settles nothing.
   *
   * A counter rather than the row's id, because the id is a string this component has no
   * use for and because an incrementing number makes "is this still the throw I started?"
   * a comparison rather than a lookup.
   */
  nonce: number
  /**
   * Called once per `nonce` when the dice for it are finished — settled, superseded,
   * unrenderable, or thrown on a browser with no tray at all.
   *
   * ⚠️ **It is a promise that this fires, and that is the contract that matters.** The
   * announcement over the map withholds the total until it does, so a path through this
   * component that could fail to call it is a total that never appears. Every branch
   * below ends in a call, including the ones where nothing was drawn.
   *
   * Must be stable — it is an effect dependency.
   */
  onSettled: (nonce: number) => void
}

/**
 * The 3D dice, as a full-bleed canvas over the map.
 *
 * **This component owns one question and answers it for everybody: when are the dice for
 * this roll done?** That is a slightly larger job than "draw the dice", and deliberately
 * so — the alternative was for `TableEffects` to race a timer against a callback from
 * here, which puts half of one piece of timing in each of two files. Everything that
 * knows how long dice take is in this one, including the beat that has to be observed
 * when there are no dice and the cap that has to be observed when they never land.
 *
 * ⚠️ **The dice are the flourish and the feed is the readout, in that order.** That
 * ordering is stated at the top of `@/lib/dice/diceBox` and is the reason
 * `createDiceTray` answers `null` rather than throwing: WebGL unavailable, the chunk
 * failing to load, the texture 404ing under a wrong base path. Every one of those ends
 * with this component rendering an empty div, `onSettled` firing on the beat, and the
 * announcement and the feed carrying on exactly as they would have. A graphics problem
 * must not stop a game.
 *
 * **Nothing here decides a number.** The faces come from `RollResult.dice`, which the
 * server rolled — `@/lib/dice/notation` explains at length why the engine's own
 * arithmetic is never used and why a die the engine cannot express is dropped rather than
 * rounded. This component is a readout of a decision made elsewhere.
 *
 * **It never takes the pointer.** `TokenHpPopover` states the rule this inherits: an
 * overlay over the board that eats a click is a token the DM cannot pick up, and it fails
 * *silently*, because a transparent box has nothing on screen to explain why the map has
 * stopped responding. A full-bleed dice canvas draws nothing clickable, so it never opts
 * back in — `pointer-events-none` on the container here, and `diceBox.ts` sets the same
 * on the canvas the engine creates, because the element that has to opt out is the one
 * this component does not own.
 */
export function DiceTrayLayer({ dice, nonce, onSettled }: DiceTrayLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * State rather than a ref, because the throw effect below has to *re-run* when the tray
   * finishes starting: the engine takes a few hundred milliseconds to load its chunk and
   * its texture, which is comfortably long enough for the first roll of the evening to
   * arrive first. A ref would be read once, find `null`, and silently drop that throw.
   */
  const [tray, setTray] = useState<DiceTray | null>(null)

  useEffect(() => {
    /**
     * ⚠️ **Two races, and they are different races with one flag between them.** The
     * first is the ordinary unmount-during-await: `createDiceTray` is asynchronous, so a
     * pane that closes while the chunk is loading would otherwise leave a live WebGL
     * context and a `window` resize listener the engine gives no handle on. The second is
     * React 19's StrictMode, which mounts, unmounts and mounts again in development —
     * without this the first engine is orphaned rather than disposed, and browsers cap
     * how many GL contexts a page may hold.
     *
     * The flag is checked *after* the await as well as before, because the tray can
     * finish starting after the cleanup has already run. In that window there is no
     * component left to hand it to, so it is disposed on the spot rather than stored.
     */
    let cancelled = false
    let started: DiceTray | null = null

    void (async () => {
      const container = containerRef.current
      if (!container) return

      // The container is `absolute inset-0` inside a pane that is itself a flex item, so
      // it has a size as soon as the pane does — but "as soon as" is not "already", and
      // the cost of asking early is a session with no dice. See the budget's own note.
      const sized = await waitForLayout(container, () => cancelled)
      if (!sized || cancelled) return

      const created = await createDiceTray(container)
      if (cancelled) {
        created?.dispose()
        return
      }

      started = created
      setTray(created)
    })()

    return () => {
      cancelled = true
      started?.dispose()
      setTray(null)
    }
  }, [])

  useEffect(() => {
    /**
     * Nothing to throw. Two different situations, and the guard is worth having for the
     * second rather than the first:
     *
     * - Nothing has been rolled on this screen yet. Not a clear either — a fresh tray is
     *   already empty, and calling `clear` here would fire on every mount for no reason.
     * - ⚠️ **The announcement this throw belonged to has already left.** `TableEffects`
     *   drops the nonce back to `0` when it clears the line, and this effect re-runs when
     *   the *tray* finally arrives as well as when the nonce changes — so on a slow
     *   connection, where 545 KB of engine can take longer to load than a whole
     *   announcement takes to play, this is what stops the dice for a finished roll landing
     *   on an empty map with no line to explain them. That is the exact failure
     *   `diceBox.ts` arranges its generation counter to avoid, arriving from the one
     *   direction the counter cannot see.
     */
    if (nonce === 0) return

    /**
     * ⚠️ **Settles exactly once, and the guard is here rather than in the caller.** Three
     * things can end a throw — the dice landing, the beat expiring with no tray, and the
     * cap firing — and two of them can happen in either order. A second call would move
     * an announcement that had already moved on, and the nonce comparison upstream would
     * not catch it because it is the *same* nonce.
     */
    let done = false
    const settle = () => {
      if (done) return
      done = true
      onSettled(nonce)
    }

    const capTimer = window.setTimeout(settle, MAXIMUM_WAIT_MS)
    let beatTimer = 0
    const beat = new Promise<void>((resolve) => {
      beatTimer = window.setTimeout(resolve, MINIMUM_BEAT_MS)
    })

    // `show` never rejects — see `DiceTray` — so there is nothing to catch, and a browser
    // with no tray is `Promise.resolve()` and the beat alone.
    const thrown = tray ? tray.show(dice) : Promise.resolve()

    // `all` rather than `race`: the total appears when the dice have settled **and** the
    // beat has been observed, so a very short throw still gets the pause the roadmap asks
    // for and a long one is not cut off before the dice stop moving.
    void Promise.all([thrown, beat]).then(settle)

    return () => {
      // Not `settle()`: this roll has been superseded by a newer one, whose own effect
      // will settle in its own time. Marking it done is what stops the throw we are
      // walking away from resolving later and advancing an announcement about a
      // different roll.
      done = true
      window.clearTimeout(capTimer)
      window.clearTimeout(beatTimer)
    }
  }, [nonce, dice, tray, onSettled])

  useEffect(() => {
    // The dice leave when the announcement does. `TableEffects` drops the nonce back to
    // `0` when it clears the line, so this is that transition and not a mount: the map is
    // left clean rather than holding the last roll's dice indefinitely, and the two halves
    // of one flourish appear and disappear together.
    if (nonce !== 0) return
    tray?.clear()
  }, [nonce, tray])

  return <div ref={containerRef} className="pointer-events-none absolute inset-0" />
}

/**
 * Resolve once the element has a non-zero box, or `false` if it never gets one.
 *
 * An `rAF` loop rather than a `ResizeObserver`, which is the more obvious tool and the
 * more awkward one here: an observer has to be created, observed, disconnected on three
 * different exits and bridged into a promise, all to answer a question that is settled on
 * the first or second frame in every real case. The frame budget makes the failure finite
 * and reportable instead of a listener nobody remembers is attached.
 *
 * `cancelled` is passed as a function rather than a boolean so this reads the caller's
 * *current* flag rather than the value it had when the loop began.
 */
async function waitForLayout(
  element: HTMLElement,
  cancelled: () => boolean,
): Promise<boolean> {
  for (let frame = 0; frame < LAYOUT_FRAME_BUDGET; frame += 1) {
    if (cancelled()) return false
    if (element.clientWidth > 0 && element.clientHeight > 0) return true
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  return false
}
