/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * The structural half of CLAUDE.md invariant 8.
 *
 * `publicGameValidator` makes a leaked *field* throw, because a DM code does not
 * fit the shape a public game payload is declared to have. A DM-layer token is a
 * leaked *row* of exactly the same shape as a player-layer one, so no `returns:`
 * validator can ever catch it. The only guard that works is that there is exactly
 * one reader: every read of `tokens` and `tokenPositions` lives in
 * `convex/lib/board.ts`, and this test greps the sources to prove it.
 *
 * Reading the modules as text rather than importing them is the point — an import
 * tells you what a module exports, and what matters here is what its code does.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The one file allowed to touch the two secret-bearing tables. */
const READER = './lib/board.ts'

/**
 * Both quote styles for each entry point into the tables. `.query('tokens'` is
 * the index/scan path and `db.get('tokens'` the by-id path; a leak needs only one
 * of them, so the guard has to cover all of them rather than the idiomatic one.
 */
const FORBIDDEN = [
  ".query('tokens'",
  '.query("tokens"',
  ".query('tokenPositions'",
  '.query("tokenPositions"',
  "db.get('tokens'",
  'db.get("tokens"',
  "db.get('tokenPositions'",
  'db.get("tokenPositions"',
]

/**
 * Test files are excluded because they read the stored rows on purpose — that is
 * how the other suites compare a payload against reality rather than against
 * another projection. `_generated/` is excluded because it is machine-written.
 */
function isScanned(path: string): boolean {
  return !path.endsWith('.test.ts') && !path.includes('/_generated/')
}

const scanned = Object.entries(sources).filter(([path]) => isScanned(path))

describe('token reads are confined to one module', () => {
  /**
   * If `?raw` ever stops resolving under the edge-runtime environment the globs
   * come back empty and every assertion below passes for the wrong reason. Check
   * the input first: a guard that cannot fail is not a guard.
   */
  test('the source scan actually loaded the convex modules', () => {
    expect(scanned.length).toBeGreaterThan(8)
    const paths = scanned.map(([path]) => path)
    expect(paths).toContain('./schema.ts')
    expect(paths).toContain('./lib/games.ts')
    expect(paths).toContain(READER)
    for (const [path, text] of scanned) {
      expect(typeof text, `${path} did not load as text`).toBe('string')
      expect(text.length, `${path} loaded empty`).toBeGreaterThan(0)
    }
  })

  /**
   * The other half of "not vacuous": the guard only means something if the reader
   * really is reading the tables. Were `lib/board.ts` to stop querying them, the
   * sweep below would pass over a codebase where nobody reads tokens at all.
   */
  test('lib/board.ts is genuinely the reader', () => {
    const reader = sources[READER]
    expect(reader, 'convex/lib/board.ts is missing').toBeTypeOf('string')
    const used = FORBIDDEN.filter((needle) => reader.includes(needle))
    expect(used.length, 'lib/board.ts reads neither table — the guard is vacuous').toBeGreaterThan(0)
    expect(
      used.some((needle) => needle.includes('tokenPositions')),
      'lib/board.ts never reads tokenPositions',
    ).toBe(true)
  })

  /**
   * One sweep, and the offender list carries the file name and the needle that
   * matched — so a failure reads as "convex/foo.ts contains .query('tokens'"
   * without a second per-file test restating the same thing.
   */
  test('no other convex module reads tokens or tokenPositions', () => {
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (path === READER) continue
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) offenders.push(`${path} contains ${needle}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
