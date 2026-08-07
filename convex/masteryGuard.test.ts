/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * **NOTHING IN `convex/` READS A MASTERY.**
 *
 * Every one of the SRD's 38 weapons carries exactly one of eight mastery properties, and
 * three of them — **Push**, **Slow** and **Topple** — are movement-detriment effects by any
 * reading. docs/requirements.md excludes *"movement-detriment status effects (prone, stand
 * up, difficult terrain, etc.)"* and that exclusion still stands. What ships is the **word on
 * the weapon**: nothing shoves anybody, nothing halves a speed, nothing sets Prone, no drag is
 * refused, and no roll consults a mastery. The effect is still the table's, exactly as a
 * condition pip's is.
 *
 * A promise like that cannot live in a comment, because the way it gets broken is somebody
 * writing three reasonable lines in `lib/dice.ts` — *if the weapon has Vex, roll the next
 * attack with advantage* — which is small, correct-looking, and turns an announcement into an
 * adjudication on the one module CLAUDE.md invariant 10 exists to keep the browser out of. So
 * it lives here, in the shape `markerGuard.test.ts` established and `corpusGuard.test.ts`
 * before it: an allow-list of the modules that may name a mastery at all, and a sweep of
 * every other module in `convex/` for a quoted import of the vocabulary.
 *
 * ⚠️ **What this guard does and does not reach**, in `leakGuard.test.ts`'s honest register.
 * It bounds *which modules may name a mastery*. It cannot stop `lib/sheet.ts` — which is on
 * the list because it has to be, since `sheetEntryValidator` stores one — from one day
 * computing something from it. That discipline is prose, exactly as `markerGuard.test.ts`
 * says of `lib/board.ts`. What the guard does catch is the actual failure mode: a *new*
 * module, in a later milestone, quietly importing the vocabulary to make a decision.
 *
 * ⚠️ **The list here is SHORTER than the marker guard's, and that is the vocabulary being
 * more confined rather than the guard being weaker.** A marker is stored on a table of its
 * own, so the schema, the choke point and the public functions each have to name it. A
 * mastery lives inside `sheetEntryValidator`, so `schema.ts` reaches it through
 * `storedSheetValidator` and never spells it — one module, and the sweep is tighter for it.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The one module that may name a mastery value, and what it is allowed to do with it.
 *
 * The list is the promise. What lib/sheet.ts does with a mastery is **store one and refuse
 * one on the wrong category** — a field on a validator, a conditional spread in a
 * normaliser, and an arity rule that says only a weapon carries one. Not one of those
 * consults a mastery to decide anything about a roll, a speed, a condition or a drag.
 */
const READERS: Record<string, string> = {
  './lib/sheet.ts':
    'the entry validator that stores one, the accessor that reads it back, and the arity rule that refuses it on anything but a weapon',
}

/**
 * A **quoted module specifier** ending in `/mastery`, with the separator required.
 *
 * ⚠️ **The `/` is what separates a module specifier from a bare word, and without it this
 * guard fails on the code written most carefully to respect it.** `mastery` is also the
 * *field name* on an entry (`mastery: v.optional(...)`), the path in a refusal message, and
 * the noun every one of these files uses in prose to explain that a mastery adjudicates
 * nothing. `markerGuard.test.ts` and `corpusGuard.test.ts` both have this history: a
 * discriminator or a field name never contains a path separator and a module specifier always
 * does.
 *
 * Quoted rather than bare for the reason those tests state outright: several modules here
 * legitimately discuss weapon mastery in a docblock — lib/mastery.ts' own header is four
 * paragraphs of it — and a guard that fails on documentation is a guard somebody deletes.
 */
const MASTERY_IMPORT = /['"][^'"\n]*\/mastery(?:\/[^'"\n]*)?['"]/

/**
 * The helper that reaches a mastery *without* naming the vocabulary module.
 *
 * The import sweep bounds who may spell `'./mastery'`; this bounds who may reach the value
 * behind it. Both are needed, and neither implies the other — a module could import nothing
 * and still `import { masteryOf } from './lib/sheet'` to decide something from what came back,
 * which is exactly the thing this file exists to refuse and is the *more* plausible of the two
 * because it looks like an ordinary read of an ordinary accessor.
 *
 * ⚠️ **Matched as a *call* and not as a mention**, for the reason the specifier above is
 * matched quoted: `markerGuard.test.ts`' first version of this sweep flagged two modules for
 * explaining in prose what their own normaliser was for, and had that failure before it had a
 * passing run.
 */
const MASTERY_HELPERS = ['masteryOf']

/** `name(`, allowing whitespace — a call or a declaration, never a sentence. */
function callsHelper(text: string, helper: string): boolean {
  return new RegExp(`\\b${helper}\\s*\\(`).test(text)
}

/**
 * Test files are excluded because they read the vocabulary on purpose — that is how
 * `lib/mastery.test.ts` pins it. `_generated/` is machine-written.
 */
function isScanned(path: string): boolean {
  return !path.endsWith('.test.ts') && !path.includes('/_generated/')
}

const scanned = Object.entries(sources).filter(([path]) => isScanned(path))

describe('nothing in convex reads a weapon mastery', () => {
  /**
   * If `?raw` ever stops resolving under the edge-runtime environment the globs come back
   * empty and every assertion below passes for the wrong reason. Check the input first,
   * exactly as `leakGuard.test.ts`, `corpusGuard.test.ts` and `markerGuard.test.ts` do.
   */
  test('the source scan actually loaded the convex modules', () => {
    expect(scanned.length).toBeGreaterThan(8)
    const paths = scanned.map(([path]) => path)
    expect(paths).toContain('./schema.ts')
    expect(paths).toContain('./lib/mastery.ts')
    // ⚠️ **The module this guard exists for, named so that a failure here reads as "the sweep
    // stopped covering the file that matters" rather than as a missing glob.** `lib/dice.ts`
    // would grant advantage for Vex, halve a speed for Slow, or add a die for Graze;
    // `lib/board.ts` would refuse a drag for Topple; `lib/feed.ts` would announce a shove.
    expect(paths).toContain('./lib/dice.ts')
    expect(paths).toContain('./lib/board.ts')
    expect(paths).toContain('./lib/feed.ts')
    for (const key of Object.keys(READERS)) {
      expect(paths, `${key} is not in the scan, so its allow-list entry means nothing`).toContain(
        key,
      )
    }
  })

  /**
   * The other half of "not vacuous". The sweep below only means something if the module on
   * the list really does import the vocabulary — otherwise it would pass over a codebase
   * where weapon mastery had been deleted entirely, or never landed.
   */
  test('the one reader genuinely imports the vocabulary', () => {
    for (const key of Object.keys(READERS)) {
      const module = sources[key]
      expect(module, `convex/${key.slice(2)} is missing`).toBeTypeOf('string')
      expect(
        MASTERY_IMPORT.test(module),
        `${key} does not import the vocabulary, so the needle is untested against a real line`,
      ).toBe(true)
    }
  })

  /**
   * And that it is doing the job the list says it is, so the allow-list describes the code
   * rather than merely permitting it.
   */
  test('the reader does what the allow-list says it does', () => {
    const sheet = sources['./lib/sheet.ts']
    expect(sheet).toContain('weaponMasteryValidator')
    expect(sheet).toContain('mastery: v.optional(weaponMasteryValidator)')
    // The arity rule — only a weapon carries one — which is the *refusal* half of what this
    // module is allowed to do with the vocabulary.
    expect(sheet).toContain('Only a weapon carries a mastery property')
  })

  test('no other convex module imports the mastery vocabulary', () => {
    const every = new RegExp(MASTERY_IMPORT.source, 'g')
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (path in READERS) continue
      for (const hit of text.matchAll(every)) offenders.push(`${path} imports ${hit[0]}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * The second sweep, and it is not a duplicate of the first. A module that imported no
   * vocabulary could still reach `masteryOf` off lib/sheet.ts and decide something from what
   * came back — which is the failure in its most plausible form.
   */
  test('no other convex module calls the mastery accessor', () => {
    // The one that legitimately does: lib/sheet.ts, where it is declared.
    const owners = new Set(['./lib/sheet.ts'])
    const offenders: string[] = []
    for (const [path, text] of scanned) {
      if (owners.has(path)) continue
      for (const helper of MASTERY_HELPERS) {
        if (callsHelper(text, helper)) offenders.push(`${path} calls ${helper}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /** The call needle, tested the way the specifier needle is. */
  test('the helper needle matches a call and not a sentence about one', () => {
    expect(callsHelper('  const mastery = masteryOf(entry)', 'masteryOf')).toBe(true)
    expect(callsHelper('export function masteryOf(entry: SheetEntry) {', 'masteryOf')).toBe(true)
    expect(callsHelper(' * `masteryOf` returns a word and nothing happens.', 'masteryOf')).toBe(
      false,
    )
    expect(callsHelper(' * See masteryOf for why this is a label.', 'masteryOf')).toBe(false)
  })

  /**
   * The needle tested directly, against the spellings that must match and the ones that must
   * not. Without this the two sweeps above are assertions about a regex nobody has checked —
   * and the `innocent` half is the important one here, because every line in it is something a
   * file in this codebase either already contains or plausibly will.
   */
  test('the needle matches every spelling of the import and nothing else', () => {
    const imports = [
      "import { weaponMasteryValidator } from './mastery'",
      "import { WEAPON_MASTERIES } from './lib/mastery'",
      'import type { WeaponMastery } from "../mastery"',
      "import { WEAPON_MASTERY_LABELS, weaponMasteryValidator } from './mastery'",
      "const lazy = await import('./lib/mastery')",
      "export * from './mastery'",
      "export { WEAPON_MASTERIES } from '../lib/mastery'",
    ]
    const innocent = [
      '  mastery: v.optional(weaponMasteryValidator),',
      'const stored = entry.mastery',
      "expect(entry).toHaveProperty('mastery')",
      "      return { path: `${path}.mastery`, message: 'Only a weapon carries a mastery property.' }",
      "import { masteryOf } from './lib/sheet'",
      "import { TOKEN_MARKERS } from './markers'",
      ' * ⚠️ Nothing in convex/ reads a mastery: no roll consults one, nothing shoves anybody.',
      '// Push, Slow and Topple are words on a weapon, and lib/dice.ts may never import them.',
      ' * a mastery is a label, so the movement-detriment exclusion still stands.',
    ]

    for (const line of imports) {
      expect(MASTERY_IMPORT.test(line), `should have matched: ${line}`).toBe(true)
    }
    for (const line of innocent) {
      expect(MASTERY_IMPORT.test(line), `should NOT have matched: ${line}`).toBe(false)
    }
  })
})
