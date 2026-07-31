import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { MOVE_THROTTLE_MS, SETTINGS_DEBOUNCE_MS, debounce, throttle } from './throttle'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('throttle', () => {
  test('the leading call goes through immediately', () => {
    const sent = vi.fn()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    move(1)

    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent).toHaveBeenLastCalledWith(1)
  })

  test('a frame-rate drag inside one window coalesces to one trailing call with the last position', () => {
    const sent = vi.fn<(x: number) => void>()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    // Sixty dragmove events in the space of one window, as Konva would emit.
    for (let x = 0; x < 60; x++) {
      move(x)
      vi.advanceTimersByTime(1)
    }

    expect(sent.mock.calls).toEqual([[0]])
    vi.advanceTimersByTime(MOVE_THROTTLE_MS)
    expect(sent.mock.calls).toEqual([[0], [59]])
  })

  test('a held arrow key repeating faster than the window still commits once per window', () => {
    const sent = vi.fn()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    // ~30 repeats a second for a second, which is 30 calls over ten windows.
    for (let i = 0; i < 30; i++) {
      move(i)
      vi.advanceTimersByTime(1000 / 30)
    }

    expect(sent.mock.calls.length).toBeLessThanOrEqual(1 + 1000 / MOVE_THROTTLE_MS)
  })

  test('a call after the window has passed is leading again', () => {
    const sent = vi.fn()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    move('a')
    vi.advanceTimersByTime(MOVE_THROTTLE_MS + 1)
    move('b')

    expect(sent.mock.calls).toEqual([['a'], ['b']])
  })

  test('cancel drops a pending call, so a settled write cannot be overtaken', () => {
    const sent = vi.fn()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    move('drag start')
    move('mid drag')
    move.cancel()
    // This is the drop: the board writes the snapped position itself.
    sent('snapped')
    vi.advanceTimersByTime(MOVE_THROTTLE_MS * 5)

    expect(sent.mock.calls).toEqual([['drag start'], ['snapped']])
  })

  test('cancel is harmless with nothing pending', () => {
    const sent = vi.fn()
    const move = throttle(sent, MOVE_THROTTLE_MS)

    move.cancel()

    expect(sent).not.toHaveBeenCalled()
  })
})

describe('debounce', () => {
  // The whole reason this is a separate function from `throttle` rather than a flag
  // on it. `throttle`'s first assertion above is that the leading call goes through
  // at once; here the opposite has to hold, because the first keystroke of "16" is
  // the number 1 — a valid one-square calibration that would redraw the grid to
  // something absurd on the way to the right answer.
  test('nothing fires before the wait has elapsed', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply(1)
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS - 1)

    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(save.mock.calls).toEqual([[1]])
  })

  test('a run of rapid calls collapses to one call with the last arguments', () => {
    const save = vi.fn<(across: number) => void>()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    // Typing "16" into the square count, then nudging it with the arrow keys.
    for (const across of [1, 16, 17, 18]) {
      apply(across)
      vi.advanceTimersByTime(40)
    }
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)

    expect(save.mock.calls).toEqual([[18]])
  })

  // A DM holding an arrow key repeats slower than the wait would be a fresh cycle
  // each time, but nudge-and-look is faster than that. The timer restarting is what
  // makes "never idle for a full wait" mean "one write at the end" rather than one
  // write per keystroke.
  test('each call restarts the timer, so a steady stream fires only once the input stops', () => {
    const save = vi.fn<(offset: number) => void>()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    for (let offset = 0; offset < 10; offset++) {
      apply(offset)
      vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS - 10)
    }

    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)

    expect(save.mock.calls).toEqual([[9]])
  })

  test('flush sends the pending call at once and leaves no later duplicate', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply('visible')
    apply.flush()

    expect(save.mock.calls).toEqual([['visible']])

    // The moment the timer would have expired had the flush not consumed it.
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS * 2)

    expect(save.mock.calls).toEqual([['visible']])
  })

  test('flush is harmless with nothing pending', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply.flush()
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS * 2)

    expect(save).not.toHaveBeenCalled()
  })

  test('cancel drops a pending call so it never fires', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply('half typed')
    // What unmounting the calibrator does.
    apply.cancel()
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS * 2)

    expect(save).not.toHaveBeenCalled()
  })

  test('cancel is harmless with nothing pending', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply.cancel()

    expect(save).not.toHaveBeenCalled()
  })

  // `cancel` has to clear the pending arguments, not merely the timer — otherwise an
  // unmount followed by a flush would still reach a mutation for a dead component.
  test('flush after cancel does nothing', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply('half typed')
    apply.cancel()
    apply.flush()

    expect(save).not.toHaveBeenCalled()
  })

  test('a call after a completed cycle starts a fresh one', () => {
    const save = vi.fn()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply('first')
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)
    apply('second')

    expect(save.mock.calls).toEqual([['first']])

    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)

    expect(save.mock.calls).toEqual([['first'], ['second']])
  })

  // Each field of the calibrator shares one debounced `apply`, but the panel as a
  // whole must not share state with anything else that debounces.
  test('two debounced functions do not interfere with each other', () => {
    const saveGrid = vi.fn()
    const saveOther = vi.fn()
    const applyGrid = debounce(saveGrid, SETTINGS_DEBOUNCE_MS)
    const applyOther = debounce(saveOther, SETTINGS_DEBOUNCE_MS)

    applyGrid('grid')
    applyOther('other')
    applyOther.cancel()
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)

    expect(saveGrid.mock.calls).toEqual([['grid']])
    expect(saveOther).not.toHaveBeenCalled()
  })

  // The calibrator's actual shape. Typed fields call `apply()` with no arguments and
  // let it read the newest values off a ref; the checkbox passes its value explicitly
  // and flushes, because the flush beats React's re-render. So a no-arg call already
  // sitting in the timer must be *replaced* by the argument call, not merged with it
  // or allowed to win — and the pair must deliver exactly one write.
  test('a no-arg call then an argument call then a flush delivers the argument version once', () => {
    const save = vi.fn<(override?: { gridVisible: boolean }) => void>()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply()
    apply({ gridVisible: false })
    apply.flush()
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS * 2)

    expect(save.mock.calls).toEqual([[{ gridVisible: false }]])
  })

  test('a typed field calling with no arguments passes no arguments through', () => {
    const save = vi.fn<(override?: { gridVisible: boolean }) => void>()
    const apply = debounce(save, SETTINGS_DEBOUNCE_MS)

    apply()
    vi.advanceTimersByTime(SETTINGS_DEBOUNCE_MS)

    expect(save.mock.calls).toEqual([[]])
  })
})
