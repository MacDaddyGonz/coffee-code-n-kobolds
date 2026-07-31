/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * **`convex/lib/library/` and `convex/lib/bestiary/` must never be imported by
 * the browser.**
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
 * `lib/resolve.ts` is swept alongside them and is not an afterthought: it is the
 * one module in `convex/` that imports both corpora, so importing *it* from the
 * browser pulls them in behind it. A guard that named only the content
 * directories would be trivially defeated by the import that looks most
 * reasonable.
 *
 * **Milestone 5 adds `lib/bestiary/`, and there the stake is both costs at once.**
 * It is another ~130 stat blocks of source, and unlike the character library it
 * is also a *secret*: a list of creature names is a list of the monsters a DM
 * might have prepared, which is why the corpus is reachable only through two
 * DM-gated queries. So a stray import here would ship kilobytes the client
 * cannot use **and** publish the shelf. The browser's half of that vocabulary is
 * `lib/creatures.ts` — ten ratings, five tiers, eight roles, two dozen tags, and
 * never a creature — which is exactly what the picker imports instead.
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
 * A **quoted module specifier** naming any of the three forbidden modules, in
 * any spelling: `'@convex/lib/library'`, `'@convex/lib/library/wizard'`,
 * `'@convex/lib/bestiary/monstersLow'`, `"../../convex/lib/resolve"`. The alias
 * and the relative form both have to be covered — the app is set up to write the
 * alias, but nothing stops a file under `src/` reaching
 * `../../convex/lib/resolve`, and a guard that only knew the tidy spelling would
 * pass over the untidy one.
 *
 * **Matching the quotes rather than the bare path is the whole of what makes
 * this usable**, and it was not the first thing tried. Four modules under
 * `src/` discuss `lib/library/` in their doc comments — they are the sheet
 * components, and explaining why the stat blocks are on the server is exactly
 * what they *should* be doing. A needle of `lib/library` flagged all four, which
 * is a guard that fails on the code most carefully written to respect it. An
 * import specifier is always quoted and prose about a path is not, so the quote
 * is the thing that distinguishes them. `BestiaryPicker.tsx` now does the same
 * for `lib/bestiary/`, in a comment whose entire subject is that it may never be
 * imported — so the false-positive half of this guard has grown a third
 * occurrence rather than becoming historical.
 *
 * ⚠️ **The word has to be followed by a `/` or a closing quote, so a module
 * named `lib/bestiaryIndex.ts` would slip straight through.** That is a real gap
 * and it is left open on purpose: relaxing the boundary to `lib\/bestiary` with
 * anything after it would start flagging any future `lib/librarian.ts` or
 * `lib/resolvers.ts` on a prefix match, and this guard's whole history is
 * false positives on files written to respect it. The gap is closed by naming
 * instead — the browser-safe vocabulary is `lib/creatures.ts`, which shares no
 * prefix with the corpus at all, and the negative test below pins that
 * distinction so nobody "fixes" it by widening the pattern.
 */
const FORBIDDEN = /['"][^'"\n]*lib\/(?:library|resolve|bestiary)(?:\/[^'"\n]*)?['"]/

describe('the server-only corpora are kept out of the browser bundle', () => {
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
    // And the modules it is *supposed* to reach for are reached for: the picker's
    // dropdowns come from these, which is the whole argument for the corpora
    // being separate from them.
    const text = scanned.map(([, body]) => body).join('\n')
    expect(text).toContain('@convex/lib/classes')
    expect(text).toContain('@convex/lib/races')
    // The bestiary's own browser half. Without this the sweep below would pass
    // over a client that had stopped drawing a CR stepper at all, which is also
    // the state in which somebody is about to reach for the corpus by hand.
    expect(text).toContain('@convex/lib/creatures')
  })

  test('no module under src/ imports either corpus or the resolver', () => {
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
      // The bestiary, in every one of the same spellings. Each of these is a real
      // route into a bundle and not a variation for its own sake: the barrel and
      // the content file, the type-only import that a bundler still follows for
      // side effects unless everything about it is erasable, the double-quoted
      // form a differently configured formatter produces, the relative path
      // somebody writes when the alias does not resolve in their editor, the
      // dynamic import that defers the cost without removing it, the re-export
      // that hides the specifier one file further away, and the test-double.
      "import { BESTIARY } from '@convex/lib/bestiary'",
      "import { MONSTERS_LOW } from '@convex/lib/bestiary/monstersLow'",
      "import { scaleCombat } from '@convex/lib/bestiary/scale'",
      "import type { BestiaryEntry } from '@convex/lib/bestiary/types'",
      'import { BESTIARY } from "@convex/lib/bestiary"',
      "import { bestiaryEntry } from '../../convex/lib/bestiary'",
      "const lazy = await import('@convex/lib/bestiary/benchmarks')",
      "export * from '@convex/lib/bestiary/types'",
      "vi.mock('@convex/lib/bestiary')",
    ]
    for (const line of imports) {
      expect(FORBIDDEN.test(line), line).toBe(true)
    }

    const innocent = [
      "import { CLASSES } from '@convex/lib/classes'",
      "import { RACES } from '@convex/lib/races'",
      "import { SKILLS } from '@convex/lib/skills'",
      "import { sheetProblem } from '@convex/lib/sheet'",
      // ⚠️ **The browser's half of the bestiary, which is the whole reason it is
      // not called `lib/bestiaryVocabulary.ts`.** `crLabel`, `stepCr`, `TIERS` and
      // `findRole` all run in the picker, so this import appears in eight modules
      // under `src/` and must never be flagged. A pattern widened to catch
      // `lib/bestiaryIndex` on a prefix match would be one edit away from catching
      // this one too.
      "import { crLabel, stepCr } from '@convex/lib/creatures'",
      "import type { ChallengeRating } from '@convex/lib/creatures'",
      "import { TIERS } from '../../convex/lib/creatures'",
      // Prose, which is what five components under `src/` legitimately contain —
      // four about the character library and, since Milestone 5,
      // `BestiaryPicker.tsx` about the corpus it deliberately does not import.
      ' * stat blocks, which is the one thing `lib/library/` is kept out of `src/` for.',
      ' * read live out of lib/library/ and reassembled on every level-up.',
      '// resolve.ts applies the library, then the race, then the overrides.',
      ' * ⚠️ Not restated here, and not imported from `lib/bestiary/` either — that module may never',
      '// The summaries come from the DM-gated index query, never from lib/bestiary/.',
    ]
    for (const line of innocent) {
      expect(FORBIDDEN.test(line), line).toBe(false)
    }
  })

  /**
   * THE GAP, PINNED RATHER THAN PAPERED OVER.
   *
   * `FORBIDDEN` requires a `/` or a closing quote straight after the word, so a
   * hypothetical `lib/bestiaryIndex.ts` or `lib/libraryOfBabel.ts` would not be
   * caught. Recorded as a test so that the next person to notice reads this
   * instead of widening the pattern and reintroducing the false positives this
   * guard already had once: `@convex/lib/creatures` is the specifier eight client
   * modules depend on, and it shares no prefix with either corpus precisely so
   * that the boundary can stay strict.
   *
   * The mitigation is therefore a naming rule — **nothing under `convex/lib/` may
   * be named with a forbidden directory as its prefix** — and it is checked here,
   * against the real tree, rather than trusted.
   */
  test('no module under convex/lib is named with a corpus directory as its prefix', () => {
    const convexModules = import.meta.glob('./lib/*.ts', { eager: false })
    const names = Object.keys(convexModules)
    expect(names.length, 'the convex/lib glob loaded nothing').toBeGreaterThan(5)
    expect(names).toContain('./lib/creatures.ts')
    expect(names).toContain('./lib/resolve.ts')

    const shadowing = names.filter((path) =>
      /\/(?:library|resolve|bestiary)[A-Za-z0-9]/.test(path),
    )
    expect(
      shadowing,
      'a module whose name begins with a forbidden directory would slip past FORBIDDEN',
    ).toEqual([])
  })
})
