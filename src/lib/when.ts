/**
 * When something happened, in words — how long ago, and what the clock said.
 *
 * ⚠️ **The one place under `src/` that formats a date or a time.** This file used to
 * say there was no other and that it therefore set the house style; `FeedRow.tsx`
 * then grew a private `shortTime` of its own, which is the drift that sentence was
 * written to prevent. `clockTime` below is that function, moved rather than
 * reimplemented, so the reasoning about locales is stated once and the tests for it
 * are in `when.test.ts` beside everything else here.
 *
 * `whenCreated` is written here rather than inline in the row that prints it, for one
 * reason: `now` is an **argument**. A function that reaches for `Date.now()` itself can
 * only be tested by faking the clock, which means either a fake-timer harness in
 * a project that has none or a test that quietly asserts nothing because every
 * boundary is minutes away from whenever it happens to run. Passing the instant in
 * makes each threshold a plain comparison of two numbers, so the interesting cases
 * — the crossover at an hour, the crossover into `yesterday` — are reachable
 * without any machinery at all. The one caller pays for that with a `Date.now()`
 * in its render, which is correct as well as cheap: the string is a rough age, not
 * a clock, and nothing subscribes to it ticking over.
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
 * Built once at module scope rather than per call, which is not micro-optimisation:
 * `toLocaleTimeString` constructs a fresh `Intl.DateTimeFormat` on **every** call, and
 * the caller is a feed row — sixty of them re-rendering together whenever anybody
 * rolls. One formatter reused is the documented way to pay that cost once, and it is
 * safe to share because formatting is a pure function of the instant handed in.
 *
 * `undefined` as the locale rather than a fixed one, so a table spread across two
 * countries each reads its own convention. That is the opposite of `MONTHS` above and
 * deliberately so: a date in a list is compared with other dates and wants one
 * unambiguous spelling, while a clock time is read on its own and wants to look like
 * the clock the reader is sitting next to. It is also why the assertions in
 * `when.test.ts` for this one are written as an equivalence rather than as literals.
 */
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * The clock time, short and local — `4:20 pm`.
 *
 * **No date, and that is a property of the one caller.** The feed is one evening long
 * and a scrollback of sixty lines never reaches yesterday, so a date on every row
 * would be the same date sixty times. `whenCreated` above is the function for
 * something that might be a week old.
 *
 * Takes the epoch milliseconds rather than a `Date`, because `format` accepts them
 * directly — so a row that only ever prints a time allocates nothing to do it.
 */
export function clockTime(at: number): string {
  return CLOCK.format(at)
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
