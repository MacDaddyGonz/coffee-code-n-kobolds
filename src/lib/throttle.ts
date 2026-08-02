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
 * Long enough that a DM typing "16" into the grid calibrator writes once rather
 * than once for the "1" as well, short enough that the grid feels like it follows
 * the number rather than lagging behind it.
 */
export const SETTINGS_DEBOUNCE_MS = 350

/**
 * How still a gesture has to be before what it landed on is written to local
 * storage — the camera's pan and zoom, the divider's width, the volume slider.
 *
 * `localStorage.setItem` is *synchronous* and disk-backed, and that — not the size
 * of the payload — is why the write cannot live where the value lands. A pan, a
 * wheel spin, a held arrow key and a slider drag all land a value up to sixty times
 * a second, so writing on arrival means sixty blocking round trips to disk a second
 * in the middle of the one loop that has 16 ms to finish in. A trailing timer
 * collapses a whole gesture into one write instead.
 *
 * Trailing rather than leading because nothing reads any of these until the next
 * visit, so there is no value in an early write; the "drags and immediately closes
 * the tab" case is covered by each reader's own flushes rather than by paying for it
 * on every frame.
 *
 * ⚠️ `useMusic` still declares its own copy of this number. Folding it in is the one
 * edit left, and it was left because that file was being changed elsewhere.
 */
export const PERSIST_DELAY_MS = 250

/**
 * Trailing only — the opposite end of `throttle` below, and a deliberately separate
 * function rather than a flag on it.
 *
 * A drag wants a leading call: the first frame should reach the other screens at
 * once, because a token that waits before it starts moving looks broken. A settings
 * field wants the opposite: the first keystroke of "16" is the number 1, which is a
 * *valid* calibration for a one-square-wide map, so sending it would redraw the grid
 * to something absurd on its way to the right answer. Waiting for the typing to stop
 * is the whole point.
 *
 * `flush()` applies a pending change now — for a discrete control like a checkbox,
 * where there is no run of input to wait out. `cancel()` drops it, for unmount.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  const send = () => {
    if (pending === null) return
    const args = pending
    cancel()
    fn(...args)
  }

  const debounced = (...args: A) => {
    pending = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(send, waitMs)
  }

  return Object.assign(debounced, { flush: send, cancel })
}

/**
 * Leading *and* trailing: the first call goes through immediately so a drag
 * starts moving on other screens at once, and the last call in any window is
 * always delivered so the token never comes to rest at a stale position.
 *
 * `cancel()` drops a pending call, and exists to fix an ordering bug rather
 * than to save a write. On drop the board sends the final, snapped position
 * directly. If an intermediate call were still sitting in the trailing timer it
 * would land *after* that final write and leave the token stranded between
 * squares, with the server having no way to tell it was stale. Cancelling first
 * makes the settled write unconditionally last.
 *
 * That cancel-then-settle pattern is the *only* way a run of moves is ended here,
 * for both input methods: a pointer drop and a keyup both cancel and then send the
 * settled position themselves. There is deliberately no `flush()` that would send
 * whatever was pending instead — the pending call carries an unsnapped, already
 * superseded position, so flushing it would be the very write cancel exists to
 * discard, merely delivered sooner.
 */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { cancel: () => void } {
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

  return Object.assign(throttled, { cancel })
}
