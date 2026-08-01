import { describe, expect, test } from 'vitest'

import { whenCreated } from '@/lib/when'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * `now` is an argument to `whenCreated` precisely so this file needs no fake
 * timers, so every case here is written as an offset back from one fixed instant.
 *
 * The instant is built from **local** components rather than an ISO string or an
 * epoch literal, because the far branch prints a day and a month read through
 * `getDate()` / `getMonth()`, which are local. A UTC literal would make these
 * assertions pass in Greenwich and fail in Sydney.
 */
const NOW = new Date(2026, 7, 1, 12, 0, 0).getTime() // 1 August 2026, midday

/** Reads as the row does: "created this long before now". */
const ago = (elapsed: number) => whenCreated(NOW - elapsed, NOW)

describe('whenCreated', () => {
  test('anything under a minute old is just now', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(1)).toBe('just now')
    expect(ago(MINUTE - 1)).toBe('just now')
  })

  // A browser whose clock is a few seconds behind the deployment's produces one of
  // these on every freshly created game, so `in -3 minutes` is a real risk rather
  // than a hypothetical. It falls out of the ordering rather than needing a branch.
  test('a timestamp in the future is just now rather than negative', () => {
    expect(whenCreated(NOW + 5 * MINUTE, NOW)).toBe('just now')
  })

  test('minutes, singular at one and plural after', () => {
    expect(ago(MINUTE)).toBe('1 minute ago')
    expect(ago(5 * MINUTE)).toBe('5 minutes ago')
    // Floored, not rounded: 59 minutes and change has not been an hour yet, and a
    // row that says "1 hour ago" the moment it passes 30 minutes is lying earlier
    // than it needs to.
    expect(ago(59 * MINUTE + 59_999)).toBe('59 minutes ago')
  })

  test('hours, from the crossover at one to the last one before a day', () => {
    expect(ago(HOUR)).toBe('1 hour ago')
    expect(ago(2 * HOUR)).toBe('2 hours ago')
    expect(ago(23 * HOUR)).toBe('23 hours ago')
    expect(ago(DAY - 1)).toBe('23 hours ago')
  })

  // Elapsed time rather than calendar dates — see the docblock. The consequence
  // asserted here is the one a reader would want to check: the whole of the second
  // day is "yesterday", including 47 hours, and the third day is not.
  test('the second day is yesterday, all of it', () => {
    expect(ago(DAY)).toBe('yesterday')
    expect(ago(DAY + 13 * HOUR)).toBe('yesterday')
    expect(ago(2 * DAY - 1)).toBe('yesterday')
  })

  test('days, up to the last one before the date takes over', () => {
    expect(ago(2 * DAY)).toBe('2 days ago')
    expect(ago(3 * DAY)).toBe('3 days ago')
    expect(ago(7 * DAY - 1)).toBe('6 days ago')
  })

  test('a week old and older is a date, and the year is dropped in the same year', () => {
    // 1 August minus 7 days is 25 July, and both are 2026, so no year is printed.
    expect(ago(7 * DAY)).toBe('25 July')
    expect(whenCreated(new Date(2026, 2, 2, 9, 30, 0).getTime(), NOW)).toBe('2 March')
  })

  // The landing page shows the thirty most recent games however old they are, so a
  // table that has been quiet since the year before last would otherwise print a
  // bare `2 March` that reads as this year's.
  test('a date in another year keeps its year', () => {
    expect(whenCreated(new Date(2024, 10, 19, 20, 0, 0).getTime(), NOW)).toBe('19 November 2024')
  })
})
