/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * THE CONFINEMENT RULE *INSIDE* `convex/`, which is a different rule from the one
 * `bundleGuard.test.ts` holds and is easy to mistake for it.
 *
 * That guard is about **bytes**: `lib/library/` and `lib/bestiary/` are ~430 KB of
 * hand-written content between them, and a `src/` module importing either would ship
 * the lot to a browser that has no use for it. Its sweep is over `/src`.
 *
 * This one is about **the door**. Nothing here saves a byte — every module under
 * `convex/` is deployed either way. What it preserves is that `resolveSheet` is the
 * *only* way to turn a stored selection into a stat block, and that the stat block
 * therefore always arrives inside a `CharacterSheet` that has come out of
 * `lib/characters.ts` past `maySeeCharacter`. A future module that imported
 * `lib/bestiary/` directly could read an Ancient Red Dragon's armour class, its `notes`
 * and — for a social entry — its `knows` string, and put any of them in a payload
 * without the visibility predicate ever being asked. That is the same class of hole
 * `leakGuard.test.ts` closes for the two secret-bearing *tables*, so it is modelled on
 * that file: an eager `?raw` glob, a quoted-specifier needle, an allow-list, and both
 * halves of an anti-vacuity check.
 *
 * ⚠️ **The allow-list has three entries and the third one is deliberate.**
 * `convex/characters.ts` imports `bestiaryEntry`, and its own doc comment explains why
 * this is the only place it can: `requireUsableSheet` has to answer "is this the key of
 * a creature that exists?" on write, and `lib/sheet.ts` — where every other stored-sheet
 * check lives — may never import the corpus, because every function in that file also
 * runs in the browser. The crossing is narrow in the way that matters and the test below
 * pins that narrowness: `characters.ts` takes the **lookup** and never the scaler, so it
 * can see that a creature exists and what rating it is written at, and cannot read a
 * number off it.
 *
 * Reading the modules as text rather than importing them is the point, for
 * `leakGuard.test.ts`'s reason: an import tells you what a module exports, and what
 * matters here is what its code does.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The modules allowed to reach into a corpus, each with the reason it is on the list.
 * Anything not named here is swept.
 */
const READERS: Record<string, string> = {
  './lib/resolve.ts':
    'the resolver, and the only door to a stat block — it imports both corpora and the scaler',
  './bestiary.ts':
    'the DM-gated picker queries, which project summaries and resolve one creature at a time',
  './characters.ts':
    'the corpus-membership check on write, which lib/sheet.ts cannot make because it runs in the browser',
}

/**
 * A **quoted module specifier** with `library` or `bestiary` as a path segment, in any
 * spelling reachable from inside `convex/`: `'./lib/bestiary'`, `'./bestiary/scale'`,
 * `"../library"`, `'./lib/library/wizard'`.
 *
 * Quoted rather than bare, for the reason `bundleGuard.test.ts` records at length: this
 * codebase discusses both directories constantly in prose, and a needle of `lib/bestiary`
 * flags the files most carefully written to respect the rule. An import specifier is
 * always quoted and a sentence about a path is not.
 *
 * The segment has to be whole — a `/` on one side of it at least, and `/` or a quote on
 * the other — so `'./creatures'` and `'./bestiaryish'` are both untouched.
 * `bundleGuard.test.ts` carries the note on why that boundary is left strict rather than
 * widened.
 *
 * ⚠️ **A `/` on one side is required rather than optional, and the first version of this
 * needle got that wrong.** Written as `(?:[^'"\n]*\/)?(?:library|bestiary)`, it matched
 * the bare string `'bestiary'` — which is the stored sheet's own discriminator, and
 * appears five times in `lib/sheet.ts` as `v.literal('bestiary')` and `kind: 'bestiary'`.
 * So the guard flagged the module whose entire design is *not* importing the corpus, for
 * naming the union member the corpus exists behind. That is the same false positive
 * `bundleGuard.test.ts` had against prose, arriving through a different door: a module
 * specifier always contains a path separator and a discriminator never does.
 */
const CORPUS_IMPORT =
  /['"](?:[^'"\n]*\/(?:library|bestiary)(?:\/[^'"\n]*)?|(?:library|bestiary)\/[^'"\n]*)['"]/

/**
 * Test files are excluded because they read the corpus on purpose — that is how
 * `lib/bestiary.test.ts` checks 129 entries against the content rules, and how
 * `lib/scaling.test.ts` compares the clamped scaler with the unclamped one.
 * `_generated/` is excluded because it is machine-written.
 *
 * **The corpus directories themselves are excluded too**, and that is not a loophole: a
 * content file importing `./types` from beside it is the corpus being a corpus, not
 * somebody reaching into one. The rule is about crossing the boundary from outside.
 */
function isScanned(path: string): boolean {
  return (
    !path.endsWith('.test.ts') &&
    !path.includes('/_generated/') &&
    !path.startsWith('./lib/bestiary/') &&
    !path.startsWith('./lib/library/')
  )
}

const scanned = Object.entries(sources).filter(([path]) => isScanned(path))

describe('the corpora are reachable from three modules and no others', () => {
  /**
   * If `?raw` ever stops resolving under the edge-runtime environment the glob comes
   * back empty and every assertion below passes for the wrong reason. Check the input
   * first: a guard that cannot fail is not a guard.
   *
   * Named files as well as a count, because a glob that resolved to something unexpected
   * — one barrel file, say — would still clear a count.
   */
  test('the source scan actually loaded the convex modules', () => {
    expect(scanned.length).toBeGreaterThan(8)
    const paths = scanned.map(([path]) => path)
    expect(paths).toContain('./schema.ts')
    expect(paths).toContain('./lib/games.ts')
    expect(paths).toContain('./lib/sheet.ts')
    expect(paths).toContain('./lib/creatures.ts')
    expect(paths).toContain('./lib/characters.ts')
    for (const reader of Object.keys(READERS)) {
      expect(paths, `${reader} is not in the scan, so its allow-list entry means nothing`).toContain(
        reader,
      )
    }
    for (const [path, text] of scanned) {
      expect(typeof text, `${path} did not load as text`).toBe('string')
      expect(text.length, `${path} loaded empty`).toBeGreaterThan(0)
    }
  })

  /**
   * THE OTHER HALF OF "NOT VACUOUS", and the one `leakGuard.test.ts` had to invent.
   *
   * The confinement only means something if `lib/resolve.ts` really is the door. Were
   * the resolution to be moved — a function at a time, into somewhere the sweep does not
   * look, which is exactly how this sort of rule dies — the sweep below would pass over
   * a codebase where the corpora were reached from nowhere at all, and prove nothing.
   *
   * Asserted per corpus, and for the scaler separately, because a resolver that had
   * quietly stopped touching one of the three is the state in which that one's real
   * reader has moved somewhere unguarded.
   */
  test('lib/resolve.ts genuinely imports both corpora and the scaler', () => {
    const resolver = sources['./lib/resolve.ts']
    expect(resolver, 'convex/lib/resolve.ts is missing').toBeTypeOf('string')

    expect(resolver, 'the resolver does not import the character library').toMatch(
      /from '\.\/library'/,
    )
    expect(resolver, 'the resolver does not import the bestiary').toMatch(/from '\.\/bestiary'/)
    expect(resolver, 'the resolver does not import the CR scaler').toMatch(
      /from '\.\/bestiary\/scale'/,
    )
    // And the needle really does fire on those lines, or the sweep below is testing a
    // pattern that matches nothing.
    expect(CORPUS_IMPORT.test(resolver)).toBe(true)
  })

  test('the two DM-gated picker queries genuinely read the bestiary', () => {
    const picker = sources['./bestiary.ts']
    expect(picker, 'convex/bestiary.ts is missing').toBeTypeOf('string')
    expect(picker).toMatch(/from '\.\/lib\/bestiary'/)
    expect(picker).toContain('requireDm')
  })

  test('no other convex module imports either corpus', () => {
    const every = new RegExp(CORPUS_IMPORT.source, 'g')
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (path in READERS) continue
      for (const hit of text.matchAll(every)) offenders.push(`${path} imports ${hit[0]}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * THE NARROWNESS OF THE THIRD ENTRY, pinned.
   *
   * `characters.ts` is on the allow-list for one question — *does this key name a
   * creature that exists, and at what rating is it written?* — and answering it needs
   * `bestiaryEntry` and nothing else. Taking `scaleCombat` or a content file's array
   * would give the mutation layer a route to a creature's numbers that does not pass
   * through `resolveSheet`, which is the exact thing the allow-list exists to prevent.
   *
   * Asserted as an allow-list of imported names rather than a deny-list, for
   * `isMonsterSheet`'s reason: a deny-list of the two names that are dangerous today
   * says nothing about the third one added tomorrow.
   */
  test('characters.ts takes the corpus lookup and never the scaler or a content file', () => {
    const module = sources['./characters.ts']
    expect(module, 'convex/characters.ts is missing').toBeTypeOf('string')

    const specifiers = [...module.matchAll(new RegExp(CORPUS_IMPORT.source, 'g'))].map(
      (hit) => hit[0],
    )
    expect(specifiers, 'characters.ts stopped importing the corpus at all').not.toEqual([])
    // The barrel, and only the barrel: never `./lib/bestiary/scale`, never a content file.
    expect(new Set(specifiers)).toEqual(new Set(["'./lib/bestiary'"]))

    const imported = /import \{([^}]*)\} from '\.\/lib\/bestiary'/.exec(module)
    expect(imported, 'the import of ./lib/bestiary is not in the expected form').not.toBeNull()
    expect(
      imported![1]
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    ).toEqual(['bestiaryEntry'])
  })

  /**
   * The two modules whose whole design rests on this rule, named individually.
   *
   * `lib/sheet.ts` and `lib/creatures.ts` are shared with the browser through the
   * `@convex/…` alias, so for them the confinement rule and the bundle rule are the same
   * rule reached from two directions — and `lib/creatures.ts` says so at the top, in as
   * many words: *"Per-entry data may never be added here. Not one creature's hit points,
   * not one creature's attack, not a lookup table keyed by creature."*
   *
   * They are swept by the loop above already. Naming them is worth the two lines because
   * an import into either is the one that would look most reasonable — `storedSheetProblem`
   * checking a key's membership where it checks the key's shape is precisely the edit
   * `requireUsableSheet` exists to have refused.
   */
  test('the two browser-shared modules reach neither corpus', () => {
    for (const path of ['./lib/sheet.ts', './lib/creatures.ts']) {
      const text = sources[path]
      expect(text, `convex${path.slice(1)} is missing`).toBeTypeOf('string')
      const hits = [...text.matchAll(new RegExp(CORPUS_IMPORT.source, 'g'))].map((hit) => hit[0])
      expect(hits, `${path} imports a corpus`).toEqual([])
    }
  })

  /**
   * The needle, tested directly. The sweep above is a `for` loop that currently finds
   * nothing, which is indistinguishable from a `for` loop that *can* find nothing.
   */
  test('the needle matches every spelling reachable inside convex and nothing else', () => {
    const imports = [
      "import { bestiaryEntry } from './lib/bestiary'",
      "import { BESTIARY } from './bestiary'",
      "import { scaleCombat } from './bestiary/scale'",
      "import { MONSTERS_LOW } from './lib/bestiary/monstersLow'",
      "import type { BestiaryEntry } from '../bestiary/types'",
      'import { librarySheet } from "./library"',
      "import { LIBRARY } from './lib/library/index'",
      "const lazy = await import('./lib/bestiary')",
      "export * from './bestiary/types'",
      "vi.mock('./lib/bestiary')",
    ]
    for (const line of imports) {
      expect(CORPUS_IMPORT.test(line), line).toBe(true)
    }

    const innocent = [
      // The browser-safe vocabulary, which shares no path segment with either corpus.
      "import { crValidator } from './creatures'",
      "import { crLabel } from './lib/creatures'",
      "import { findClass } from './classes'",
      "import { benchmarkFor } from './benchmarks'",
      "import { isValidRoll } from '../sheet'",
      // ⚠️ **The stored discriminator, which is the false positive this needle had.**
      // `lib/sheet.ts` names the union member five times and imports nothing; a needle
      // that flagged it would fail on the module written most carefully to respect the
      // rule, which is exactly the history `bundleGuard.test.ts` records for prose.
      "  kind: v.literal('bestiary'),",
      "  return doc.sheet?.kind === 'bestiary' ? doc.sheet : null",
      "    case 'bestiary':",
      "const sheet = { kind: 'bestiary', entryKey, cr }",
      "expect(serialised).not.toContain('\"bestiary\"')",
      // And the other one, for symmetry: `library` is an ordinary English word that
      // turns up in a string constant as readily as in a path.
      "const label = 'library'",
      // Prose. Both directories are discussed in comments throughout `convex/`, and the
      // files that discuss them most are the ones respecting the rule.
      '// It lives here rather than in lib/sheet.ts for one reason: this file imports',
      ' * lib/sheet.ts may never import lib/bestiary/, because every function in that file',
      ' * read live out of `lib/bestiary/` at resolution time and scaled to `cr`.',
      '// See the note at the top of ./types.ts for why nothing under lib/bestiary/ may be',
    ]
    for (const line of innocent) {
      expect(CORPUS_IMPORT.test(line), line).toBe(false)
    }
  })
})
