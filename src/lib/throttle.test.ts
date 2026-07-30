import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { MOVE_THROTTLE_MS, throttle } from './throttle'

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
