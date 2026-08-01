/**
 * How long ago something happened, in words.
 *
 * Written here rather than inline in the row that prints it, for one reason:
 * `now` is an **argument**. A function that reaches for `Date.now()` itself can
 * only be tested by faking the clock, which means either a fake-timer harness in
 * a project that has none or a test that quietly asserts nothing because every
 * boundary is minutes away from whenever it happens to run. Passing the instant in
 * makes each threshold a plain comparison of two numbers, so the interesting cases
 * — the crossover at an hour, the crossover into `yesterday` — are reachable
 * without any machinery at all. The one caller pays for that with a `Date.now()`
 * in its render, which is correct as well as cheap: the string is a rough age, not
 * a clock, and nothing subscribes to it ticking over.
 *
 * There is no date formatting anywhere else under `src/`, so there is no house
 * style to follow and this one sets it.
 */

/**
 * Spelled out rather than taken from `toLocaleDateString`, deliberately. A locale
 * lookup returns whatever the browser is set to — `03/02/2026` in one place and
 * `2/3/2026` in another, which are the same nine characters meaning two different
 * days — and it makes the assertions in `when.test.ts` depend on the machine that
 * runs them. A game list wants one unambiguous spelling, and `2 March` is it.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * `1754006400000, Date.now()` → `just now`, `5 minutes ago`, `2 hours ago`,
 * `yesterday`, `3 days ago`, or `2 March` once it is a week old.
 *
 * **Elapsed time, not calendar days, and that is a choice.** "Yesterday" properly
 * means *the previous calendar date in the viewer's zone*, which needs local date
 * arithmetic, breaks across a daylight-saving boundary, and would make a row read
 * differently on two laptops side by side in different zones. What this row is
 * actually answering is *how stale is this game*, so the crude reading — anything
 * between one and two days old is yesterday — is both good enough and the same
 * everywhere. The one visible consequence is that something 25 hours old says
 * `yesterday` even if the clock has not long turned midnight, which is true in the
 * ordinary case and never misleading in the odd one.
 *
 * A `creationTime` in the future falls out as `just now` rather than needing a
 * branch of its own: a negative elapsed is below every threshold. That is not a
 * hypothetical — a browser whose clock is a few seconds behind the deployment's
 * will produce one on every fresh row, and `in -3 minutes` would be a bug report.
 */
export function whenCreated(creationTime: number, now: number): string {
  const elapsed = now - creationTime

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${plural(Math.floor(elapsed / MINUTE), 'minute')} ago`
  if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), 'hour')} ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${plural(Math.floor(elapsed / DAY), 'day')} ago`

  return dateOf(creationTime, now)
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/**
 * The day and the month, plus the year only when it is not this one.
 *
 * The year is dropped in the common case because it is noise — a game from last
 * month is `2 March` and reading `2 March 2026` in 2026 tells nobody anything. It
 * is *added* in the uncommon case because the landing page shows the thirty most
 * recent games however old they are, and a table that has been quiet for eighteen
 * months would otherwise print a bare `2 March` that reads as this year's.
 *
 * The getters here are the local-time ones on purpose: a date shown to a person is
 * the date in the zone they are standing in, and the UTC equivalents would print
 * yesterday's date all evening for anyone east of Greenwich.
 */
function dateOf(at: number, now: number): string {
  const date = new Date(at)
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === new Date(now).getFullYear()
    ? day
    : `${day} ${date.getFullYear()}`
}
