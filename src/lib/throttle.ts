/**
 * Rate-limiting the one write in this app that a user can trigger hundreds of
 * times a second.
 *
 * CLAUDE.md invariant 2 and ADR 0001 both say the same thing: token positions
 * must not be written to the database on every mouse-move. Konva emits
 * `dragmove` at the display's frame rate, so a two-second drag across a map is
 * well over a hundred mutations, each of which Convex fans out to every
 * connected client. Throttling is not an optimisation here, it is the difference
 * between a working board and one that stutters.
 *
 * Kept separate from React on purpose. It carries *both* ways a token moves — a
 * pointer drag and a held arrow key repeating at roughly 30/sec — and neither
 * should have to know how the other is smoothed.
 */

/**
 * Roughly ten position writes a second, the figure ADR 0001 settled on. Fast
 * enough that other players see a drag as motion rather than teleporting, slow
 * enough that a long drag is tens of writes rather than hundreds.
 */
export const MOVE_THROTTLE_MS = 100

/**
 * Leading *and* trailing: the first call goes through immediately so a drag
 * starts moving on other screens at once, and the last call in any window is
 * always delivered so the token never comes to rest at a stale position.
 *
 * `flush()` sends a pending call now — for when the caller knows this is the
 * end, such as a keyup ending a run of arrow-key repeats.
 *
 * `cancel()` drops a pending call, and exists to fix an ordering bug rather
 * than to save a write. On drop the board sends the final, snapped position
 * directly. If an intermediate call were still sitting in the trailing timer it
 * would land *after* that final write and leave the token stranded between
 * squares, with the server having no way to tell it was stale. Cancelling first
 * makes the settled write unconditionally last.
 */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  // A live timer *is* the "inside a window" flag, which is why a trailing call
  // opens a fresh one: continuous input then settles into one call per window
  // instead of alternating between immediate and delayed.
  const openWindow = () => {
    timer = setTimeout(() => {
      timer = null
      if (pending === null) return
      const args = pending
      pending = null
      openWindow()
      fn(...args)
    }, waitMs)
  }

  const throttled = (...args: A) => {
    if (timer === null) {
      openWindow()
      fn(...args)
      return
    }
    // Only the newest arguments matter — an intermediate drag position that was
    // never sent is of no interest once a later one exists.
    pending = args
  }

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  const flush = () => {
    if (pending === null) return
    const args = pending
    cancel()
    fn(...args)
  }

  return Object.assign(throttled, { flush, cancel })
}
