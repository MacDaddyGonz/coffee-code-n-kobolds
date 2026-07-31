// The bestiary: around 130 creatures across five content files, plus the lookups the
// resolver needs. Content lives in the files beside this one; the shape is in ./types.ts and
// the resolver is in ../resolve.ts.
//
// See the note at the top of ./types.ts for why nothing under this directory may be reached
// from the browser, and why the reason is stronger here than it was for the character
// library: a list of creature names is a spoiler, so the corpus is DM-only in a way a list of
// premade heroes never was.

import { ENEMIES } from './enemies'
// ⚠️ **camelCase, not kebab-case, and that is a deployment constraint rather than a style
// choice.** Convex refuses a module whose path component contains a hyphen —
// `lib/bestiary/monsters-high.js is not a valid path to a Convex module` — so the corpus
// was briefly unpushable while `npm run lint` and the whole test suite passed. Nothing but
// `npm run dev:backend` can catch it, which is the same reason `npm run test:smoke` exists:
// a real deployment applies rules the local tooling does not know about. The premade
// character library never met this because every class happens to be one word.
import { MONSTERS_HIGH } from './monstersHigh'
import { MONSTERS_LOW } from './monstersLow'
import { MONSTERS_MID } from './monstersMid'
import { SOCIAL } from './social'
import type { BestiaryEntry, BestiaryFile } from './types'

export type {
  BestiaryAbility,
  BestiaryAttack,
  BestiaryCategory,
  BestiaryCombat,
  BestiaryEntry,
  BestiaryFile,
  BestiarySocial,
} from './types'

/**
 * The five content files, in the order a picker with no filter applied should list them:
 * monsters ascending by tier, then humanoid enemies, then the people.
 *
 * Split by tier rather than by creature type because that is how a DM chooses — "something
 * for a level 2 party" is the question, not "something with scales" — and because three
 * moderate files are easier to review in a diff than one enormous one. All three are
 * `category: 'monster'`, which is what the picker's tabs read.
 */
export const BESTIARY_FILES: readonly BestiaryFile[] = [
  MONSTERS_LOW,
  MONSTERS_MID,
  MONSTERS_HIGH,
  ENEMIES,
  SOCIAL,
]

/** Every entry, flattened in file order. */
export const BESTIARY: readonly BestiaryEntry[] = BESTIARY_FILES.flatMap((file) => file.entries)

/**
 * ⚠️ **A `Map`, and it was built as one from the start rather than converted later.**
 *
 * The obvious implementation is a plain object keyed by creature key, and lib/library/index.ts
 * records what that costs at line 63: `paths['__proto__']` and `paths['toString']` are both
 * truthy on a plain object, so a bare truthiness check let three inherited names past a guard
 * whose contract promised null, and the fix there was `Object.hasOwn`. A `Map` has no
 * prototype chain to inherit from, so `get` on an unknown key is `undefined` whatever the key
 * spells — which makes the whole class of bug unexpressible instead of guarded against. That
 * lookup was fixed after the fact; this one starts correct.
 *
 * `ROLE_BY_KEY` and `TAG_BY_KEY` in lib/creatures.ts are typed `ReadonlyMap` for a second
 * reason that applies here too: this is module state, and a Convex isolate outlives the
 * request that warmed it, so a caller that reached in and set a key would redefine a creature
 * for every later query until the next deploy.
 */
const BY_KEY: ReadonlyMap<string, BestiaryEntry> = new Map(
  BESTIARY.map((entry) => [entry.key, entry]),
)

/**
 * The entry for a key, or undefined.
 *
 * **An unknown key is refused on write and tolerated on read**, and the asymmetry is
 * deliberate rather than an inconsistency. A character *stores* this key, so retiring an
 * entry has to leave every character that named it readable — resolution runs inside
 * `characters.list`, and a throw here would blank the party panel for the whole table rather
 * than affect the one creature nobody can look up. Nobody should be able to *choose* a
 * retired creature now, which is `requireUsableSheet`'s job on the way in. This is the stance
 * `catalogueEntry`, `subclassOf` and `librarySheet` all take, for the reason `librarySheet`'s
 * doc comment gives.
 */
export function bestiaryEntry(key: string): BestiaryEntry | undefined {
  return BY_KEY.get(key)
}

// A per-key category lookup and a category → entries index both lived here and neither had
// a production caller. `BESTIARY_SUMMARIES` in convex/bestiary.ts walks `BESTIARY_FILES` and
// takes the category off the file, and its doc comment argues at length for doing exactly
// that rather than looking one up per row — so the lookups existed for the test that was
// reading them. A grouping is one `filter` over `BESTIARY_FILES`, which is what that test
// does now: `BestiaryFile.category` is where a category is declared, and one place is enough.

/**
 * How many distinct keys the corpus actually has. **Exported so a test can catch a
 * collision, because this module deliberately does not.**
 *
 * Two files declaring the same key is a content bug, and the `Map` above silently keeps one
 * of them — which is the wrong behaviour and the right failure mode. Throwing at module
 * scope would be honest and catastrophic: this module is imported by ../resolve.ts, which is
 * imported by `characters.list`, so a duplicated key in a content file nobody had reviewed
 * yet would take down every query that paints a screen, for every game, until it was
 * reverted. A collision costs one creature; a module that will not evaluate costs the
 * application.
 *
 * So the corpus test asserts `BESTIARY.length === BESTIARY_KEY_COUNT` and fails the build
 * instead. **That test is the enforcement**; this constant is only the thing it can see.
 */
export const BESTIARY_KEY_COUNT = BY_KEY.size
