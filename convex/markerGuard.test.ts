/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * **NOTHING IN `convex/` READS A MARKER.**
 *
 * A condition on a coin is a *label*: no roll consults one, no health band is computed
 * from one, no drag is refused because of one, and no sheet changes because a creature is
 * prone. That is not a gap waiting to be filled in — it is the whole design, and it is the
 * only reason shipping `prone`, `grappled`, `restrained` and `paralyzed` lifts nothing
 * from requirements.md's *no movement-detriment status effects*. What ships is the word on
 * the coin; the effect is still the table's.
 *
 * A promise like that cannot live in a comment, because the way it gets broken is somebody
 * writing three reasonable lines in `lib/dice.ts`. So it lives here, in the shape
 * `corpusGuard.test.ts` established: an allow-list of the modules that may name a marker
 * value at all, and a sweep of every other module in `convex/` for a quoted import of the
 * vocabulary.
 *
 * ⚠️ **What this guard does and does not reach**, in `leakGuard.test.ts`'s honest register.
 * It bounds *which modules may name a marker*. It cannot stop `lib/board.ts` — which is on
 * the list because it has to be, since it owns the table — from one day computing something
 * from one. That discipline is prose, exactly as that file's note about its needles finding
 * only reads is prose. What the guard does catch is the actual failure mode: a *new*
 * module, in a later milestone, quietly importing the vocabulary to make a decision.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The three modules that may name a marker value, and what each is allowed to do with it.
 *
 * The list is the promise. Every one of these is plumbing — a validator, a reader, a
 * writer — and not one of them consults a marker to decide anything.
 */
const READERS: Record<string, string> = {
  './schema.ts': 'the table that stores them — the field validator, and nothing else',
  './lib/board.ts':
    'the choke point: the one reader and the one writer of the row, plus the normaliser',
  './board.ts':
    'the public query and mutation — the argument validator and the vocabulary’s own size',
}

/**
 * A **quoted module specifier** ending in `/markers`, with the separator required.
 *
 * ⚠️ **The `/` is what separates a module specifier from a bare word, and without it this
 * guard fails on the code written most carefully to respect it.** `markers` is also the
 * *field name* on the row (`markers: v.array(...)`), the argument name on the mutation, and
 * the noun every one of these files uses in prose to explain that markers adjudicate
 * nothing. `corpusGuard.test.ts` has the same history: its first needle flagged
 * `lib/sheet.ts` for spelling `v.literal('bestiary')`, because a discriminator never
 * contains a path separator and a module specifier always does.
 *
 * Quoted rather than bare for the reason that test states outright: several modules here
 * will legitimately discuss markers in a docblock, and a guard that fails on documentation
 * is a guard somebody deletes.
 */
const MARKER_IMPORT = /['"][^'"\n]*\/markers(?:\/[^'"\n]*)?['"]/

/**
 * The helpers that reach a marker *without* naming the vocabulary module.
 *
 * The import sweep bounds who may spell `'./markers'`; this bounds who may reach the row
 * behind it. Both are needed, and neither implies the other — a module could import
 * nothing and still `import { visibleMarkers } from './lib/board'` to compute a rule from
 * a creature's conditions, which is exactly the thing this file exists to refuse.
 *
 * ⚠️ **Matched as a *call* and not as a mention**, for the reason the specifier above is
 * matched quoted: the first version of this sweep flagged `schema.ts` and `lib/markers.ts`
 * for explaining in prose what `normaliseMarkers` is for. A guard that fails on the
 * documentation written to respect it is a guard that gets deleted, and this file had that
 * failure before it had a passing run.
 */
const MARKER_HELPERS = ['visibleMarkers', 'setTokenMarkers', 'deleteTokenMarkers', 'normaliseMarkers']

/** `name(`, allowing whitespace — a call or a declaration, never a sentence. */
function callsHelper(text: string, helper: string): boolean {
  return new RegExp(`\\b${helper}\\s*\\(`).test(text)
}

/**
 * Test files are excluded because they read the vocabulary on purpose — that is how
 * `lib/markers.test.ts` pins it. `_generated/` is machine-written.
 */
function isScanned(path: string): boolean {
  return !path.endsWith('.test.ts') && !path.includes('/_generated/')
}

const scanned = Object.entries(sources).filter(([path]) => isScanned(path))

describe('nothing in convex reads a marker', () => {
  /**
   * If `?raw` ever stops resolving under the edge-runtime environment the globs come back
   * empty and every assertion below passes for the wrong reason. Check the input first,
   * exactly as `leakGuard.test.ts` and `corpusGuard.test.ts` do.
   */
  test('the source scan actually loaded the convex modules', () => {
    expect(scanned.length).toBeGreaterThan(8)
    const paths = scanned.map(([path]) => path)
    expect(paths).toContain('./schema.ts')
    expect(paths).toContain('./lib/games.ts')
    expect(paths).toContain('./lib/markers.ts')
    // The modules most likely to grow a rule from a condition, named so that a failure
    // here reads as "the sweep stopped covering the file that matters" rather than as a
    // missing glob. `lib/dice.ts` would halve a speed; `lib/sheet.ts` would grant
    // advantage; `lib/feed.ts` would announce it.
    expect(paths).toContain('./lib/dice.ts')
    expect(paths).toContain('./lib/sheet.ts')
    expect(paths).toContain('./lib/feed.ts')
    for (const key of Object.keys(READERS)) {
      expect(paths, `${key} is not in the scan, so its allow-list entry means nothing`).toContain(
        key,
      )
    }
  })

  /**
   * The other half of "not vacuous". The sweep below only means something if the three
   * modules on the list really do import the vocabulary — otherwise it would pass over a
   * codebase where markers had been deleted entirely.
   */
  test('all three readers genuinely import the vocabulary', () => {
    for (const key of Object.keys(READERS)) {
      const module = sources[key]
      expect(module, `convex/${key.slice(2)} is missing`).toBeTypeOf('string')
      expect(
        MARKER_IMPORT.test(module),
        `${key} does not import the vocabulary, so the needle is untested against a real line`,
      ).toBe(true)
    }
  })

  /**
   * And that each is doing the job the list says it is, so the allow-list describes the
   * code rather than merely permitting it.
   */
  test('each reader does what the allow-list says it does', () => {
    expect(sources['./schema.ts']).toContain('tokenMarkerValidator')
    expect(sources['./lib/board.ts']).toContain('normaliseMarkers')
    expect(sources['./lib/board.ts']).toContain(".query('tokenMarkers')")
    expect(sources['./board.ts']).toContain('tokenMarkerValidator')
    expect(sources['./board.ts']).toContain('TOKEN_MARKERS.length')
  })

  test('no other convex module imports the marker vocabulary', () => {
    const every = new RegExp(MARKER_IMPORT.source, 'g')
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (path in READERS) continue
      for (const hit of text.matchAll(every)) offenders.push(`${path} imports ${hit[0]}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * The second sweep, and it is not a duplicate of the first. A module that imported no
   * vocabulary could still reach `visibleMarkers` off the choke point and decide something
   * from what came back — which is the failure in its most plausible form, because it looks
   * like an ordinary read of an ordinary helper.
   */
  test('no other convex module calls the marker helpers', () => {
    // The three that legitimately do: the choke point owns them, the public functions call
    // them, and the vocabulary module is where `normaliseMarkers` is declared.
    const owners = new Set(['./lib/board.ts', './board.ts', './lib/markers.ts'])
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (owners.has(path)) continue
      for (const helper of MARKER_HELPERS) {
        if (callsHelper(text, helper)) offenders.push(`${path} calls ${helper}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /** The call needle, tested the way the specifier needle is. */
  test('the helper needle matches a call and not a sentence about one', () => {
    expect(callsHelper('  await setTokenMarkers(ctx, gameId, tokenId, next)', 'setTokenMarkers')).toBe(
      true,
    )
    expect(callsHelper('export function normaliseMarkers(raw) {', 'normaliseMarkers')).toBe(true)
    expect(callsHelper(' * `normaliseMarkers` runs here as well as in the renderer.', 'normaliseMarkers')).toBe(
      false,
    )
    expect(callsHelper(' * See visibleMarkers for the full cost model.', 'visibleMarkers')).toBe(false)
  })

  /**
   * The needle tested directly, against the spellings that must match and the ones that
   * must not. Without this the two sweeps above are assertions about a regex nobody has
   * checked — and the `innocent` half is the important one here, because every line in it
   * is something a file in this codebase either already contains or plausibly will.
   */
  test('the needle matches every spelling of the import and nothing else', () => {
    const imports = [
      "import { tokenMarkerValidator } from './lib/markers'",
      "import { TOKEN_MARKERS } from './markers'",
      'import type { TokenMarker } from "../markers"',
      "import { normaliseMarkers, tokenMarkerValidator } from './markers'",
      "const lazy = await import('./lib/markers')",
      "export * from './markers'",
      "export { TOKEN_MARKERS } from '../lib/markers'",
    ]
    const innocent = [
      '  markers: v.array(tokenMarkerValidator),',
      'const stored = row.markers',
      "expect(row).toHaveProperty('markers')",
      "import { normaliseMarkers } from './lib/board'",
      "import { TOKEN_LAYERS } from './layers'",
      ' * ⚠️ Nothing in convex/ reads a marker: no roll consults one.',
      '// The marker vocabulary adjudicates nothing, and a guard test says so.',
      ' * markers are labels, so lib/dice.ts may never import them.',
      "await setTokenMarkers(ctx, game._id, token._id, normaliseMarkers(args.markers))",
    ]

    for (const line of imports) {
      expect(MARKER_IMPORT.test(line), `should have matched: ${line}`).toBe(true)
    }
    for (const line of innocent) {
      expect(MARKER_IMPORT.test(line), `should NOT have matched: ${line}`).toBe(false)
    }
  })
})
