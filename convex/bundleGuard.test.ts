/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * **`convex/lib/library/` must never be imported by the browser.**
 *
 * The library is seventy-two hand-written stat blocks — around 300 KB of source
 * — in a bundle that is already close to a megabyte, and not one byte of it is
 * data a client reads. The server resolves a character and sends a finished
 * `PcSheet` over the wire, so all the picker needs to draw its two dropdowns is
 * `lib/classes.ts` and `lib/races.ts`: eight class names, eight race names and a
 * blurb each. Both of those files say so at the top, and `lib/library/types.ts`
 * says in as many words that "a test asserts the separation, because it is
 * exactly the sort of thing one convenient import quietly undoes".
 *
 * This is that test, and it is modelled on `leakGuard.test.ts` for the same
 * reason that suite gives: reading the sources as text rather than importing
 * them, because an import tells you what a module exports and what matters here
 * is what its code *does*. The mechanism is identical even though the stake is
 * not — a leak here costs kilobytes rather than a secret.
 *
 * `lib/resolve.ts` is swept alongside it and is not an afterthought: it is the
 * one module in `convex/` that imports `lib/library/`, so importing *it* from
 * the browser pulls the whole library in behind it. A guard that named only the
 * library would be trivially defeated by the import that looks most reasonable.
 *
 * The glob is rooted at `/src` rather than written relative, because this file
 * lives in `convex/` and Vite resolves a leading slash against the project root.
 */
const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const scanned = Object.entries(sources)

/**
 * A **quoted module specifier** naming either forbidden module, in any
 * spelling: `'@convex/lib/library'`, `'@convex/lib/library/wizard'`,
 * `"../../convex/lib/resolve"`. The alias and the relative form both have to be
 * covered — the app is set up to write the alias, but nothing stops a file
 * under `src/` reaching `../../convex/lib/resolve`, and a guard that only knew
 * the tidy spelling would pass over the untidy one.
 *
 * **Matching the quotes rather than the bare path is the whole of what makes
 * this usable**, and it was not the first thing tried. Four modules under
 * `src/` discuss `lib/library/` in their doc comments — they are the sheet
 * components, and explaining why the stat blocks are on the server is exactly
 * what they *should* be doing. A needle of `lib/library` flagged all four, which
 * is a guard that fails on the code most carefully written to respect it. An
 * import specifier is always quoted and prose about a path is not, so the quote
 * is the thing that distinguishes them.
 */
const FORBIDDEN = /['"][^'"\n]*lib\/(?:library|resolve)(?:\/[^'"\n]*)?['"]/

describe('convex/lib/library is kept out of the browser bundle', () => {
  /**
   * The anti-vacuity check, copied in intent from `leakGuard.test.ts`: if
   * `?raw` ever stops resolving under the edge-runtime environment the glob
   * comes back empty and the sweep below passes for the wrong reason. A guard
   * that cannot fail is not a guard.
   *
   * Named files as well as a count, because a glob that resolved to something
   * unexpected — a single barrel file, say — would still clear a count.
   */
  test('the source scan actually loaded the client modules', () => {
    expect(scanned.length).toBeGreaterThan(20)
    const paths = scanned.map(([path]) => path)
    expect(paths).toContain('/src/main.tsx')
    expect(paths.some((path) => path.endsWith('.tsx'))).toBe(true)
    for (const [path, text] of scanned) {
      expect(typeof text, `${path} did not load as text`).toBe('string')
      expect(text.length, `${path} loaded empty`).toBeGreaterThan(0)
    }
  })

  /**
   * The other half of "not vacuous", and the half `leakGuard.test.ts` had to
   * invent: the sweep only means anything if `src/` genuinely imports from
   * `convex/` at all. A client that had stopped using the `@convex/…` alias
   * entirely would sail through the sweep below while proving nothing, and that
   * is also the state in which somebody is about to reintroduce the imports by
   * hand.
   */
  test('the client really does import from convex/lib, so the sweep has something to sweep', () => {
    const importers = scanned.filter(([, text]) => text.includes('@convex/lib/'))
    expect(importers.length, 'no client module imports @convex/lib at all').toBeGreaterThan(0)
    // And the two modules it is *supposed* to reach for are reached for: the
    // picker's dropdowns come from these, which is the whole argument for the
    // library being separate from them.
    const text = scanned.map(([, body]) => body).join('\n')
    expect(text).toContain('@convex/lib/classes')
    expect(text).toContain('@convex/lib/races')
  })

  test('no module under src/ imports the library or the resolver', () => {
    // Every match rather than the first, so one run names every specifier that
    // has to go rather than one per file per run.
    const every = new RegExp(FORBIDDEN.source, 'g')
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      for (const hit of text.matchAll(every)) offenders.push(`${path} imports ${hit[0]}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * The needle, tested directly. The sweep above is a `for` loop that currently
   * finds nothing, which is indistinguishable from a `for` loop that *can* find
   * nothing — so the pattern is exercised against the imports it must catch and
   * against the ones it must not.
   *
   * The false-positive half is the one with history: the guard's first version
   * matched the bare path and flagged four sheet components for discussing
   * `lib/library/` in a comment. Those cases are pinned below so the fix cannot
   * be undone by somebody widening the pattern to be safe.
   */
  test('the needle matches every spelling of the import and nothing else', () => {
    const imports = [
      "import { LIBRARY } from '@convex/lib/library'",
      "import { WIZARD } from '@convex/lib/library/wizard'",
      "import type { LibrarySheet } from '@convex/lib/library/types'",
      "import { resolveSheet } from '@convex/lib/resolve'",
      'import { resolveSheet } from "@convex/lib/resolve"',
      "import { resolveSheet } from '../../convex/lib/resolve'",
      "const lazy = await import('@convex/lib/library')",
      "export * from '@convex/lib/library/types'",
      "vi.mock('@convex/lib/resolve')",
    ]
    for (const line of imports) {
      expect(FORBIDDEN.test(line), line).toBe(true)
    }

    const innocent = [
      "import { CLASSES } from '@convex/lib/classes'",
      "import { RACES } from '@convex/lib/races'",
      "import { SKILLS } from '@convex/lib/skills'",
      "import { sheetProblem } from '@convex/lib/sheet'",
      // Prose, which is what four of the sheet components legitimately contain.
      ' * stat blocks, which is the one thing `lib/library/` is kept out of `src/` for.',
      ' * read live out of lib/library/ and reassembled on every level-up.',
      '// resolve.ts applies the library, then the race, then the overrides.',
    ]
    for (const line of innocent) {
      expect(FORBIDDEN.test(line), line).toBe(false)
    }
  })
})
