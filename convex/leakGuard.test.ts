/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * The structural half of CLAUDE.md invariant 8 — now for all three of this
 * application's same-shape secrets rather than one of them.
 *
 * `publicGameValidator` makes a leaked *field* throw, because a DM code does not
 * fit the shape a public game payload is declared to have. A DM-layer token is a
 * leaked *row* of exactly the same shape as a player-layer one, so no `returns:`
 * validator can ever catch it. The only guard that works is that there is exactly
 * one reader: every read of `tokens` and `tokenPositions` lives in
 * `convex/lib/board.ts`, and this test greps the sources to prove it.
 *
 * Milestone 3 adds a second secret of precisely that shape, which is why this file
 * is now a table of pairs instead of one hard-coded reader. An NPC's character
 * document — a name, an armour class, a list of things it does — is
 * indistinguishable in *type* from a hero's, so a projection over `characters`
 * would cheerfully approve an array made entirely of spoilers. `characterVitals`
 * is the same problem one table over: a monster's row and a hero's row differ only
 * in which character they point at. So `convex/lib/characters.ts` is the only
 * module allowed to read either of them, by the same arrangement and enforced by
 * the same sweep.
 *
 * Running the sweep per pair buys a second thing that a single merged list would
 * not: each reader is swept against every *other* entry's tables. `lib/board.ts` may
 * not read `characters`, `lib/characters.ts` may not read `tokens`, and neither of
 * them may read `feed` — the choke points meet only through narrow crossings, a set
 * of ids and never a `Doc`, which is what `boardCharacterAccess` hands to
 * `lib/characters.ts` and what `readableCharacterIds` hands to `lib/feed.ts`. (ADR 0005 knows that crossing by the name of
 * its sight half alone, `visibleCharacterIds`; a grant gave it a second question to
 * answer about the same rows, and answering both in one pass retired the name.)
 *
 * Note which half of Milestone 3 this is. An NPC's *sheet* is a leaked row and
 * needs a choke point; an NPC's exact *hit points* are a leaked field, and are
 * caught mechanically by the discriminated union in `publicVitalsValidator`
 * instead. One tool for each shape of leak — `vitals.test.ts` exercises the other.
 *
 * Reading the modules as text rather than importing them is the point — an import
 * tells you what a module exports, and what matters here is what its code does.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

type Guard = {
  /** The secret-bearing tables that share one reader. */
  tables: string[]
  /** The one file allowed to touch them. */
  reader: string
}

/**
 * ⚠️ **Milestone 9 adds a third pair, and a feed row is the same shape of secret as the
 * two above rather than a new one.** `Ancient Red Dragon attacks with their Bite` is a
 * leaked *row*: it has precisely the shape of a line about a hero, so a projection over
 * `feed` would approve an array made entirely of spoilers and no `returns:` validator
 * could tell. Hence the same arrangement — one reader, `lib/feed.ts`, swept by the same
 * loop.
 *
 * Two things about this entry are worth knowing before editing it.
 *
 * **It is the first pair whose *writes* matter as much as its reads.** The needles below
 * only find reads, and that is deliberate rather than an oversight — `lib/board.ts`
 * already inserts and deletes rows in `tokens` and nothing mechanical stops a second
 * writer being written next door. The discipline is that the reasoning about what a row
 * publishes belongs beside the predicate that decides it; the guard is not what is
 * holding that.
 *
 * **`./feed.ts` is deliberately absent from the load check below, and it exists.** The
 * sweep is a deny-list of every module *but* the declared reader, so that file has been
 * checked against all seven tables since the moment it was written, with no entry here — which
 * is the argument the `convex/bestiary.ts` note below makes at length. Naming it would only
 * add a second assertion that the glob loaded, which `./schema.ts` and `./lib/games.ts`
 * already provide.
 */
/**
 * ⚠️ **`tokenMarkers` joins the first pair rather than getting an entry of its own, and
 * that is the argued call rather than the convenient one.**
 *
 * `fogRects` was left out of this table because its rows have no non-secret twin — every
 * rectangle goes to every client verbatim, so an entry would pass and this project does
 * not keep guards that cannot fail. A marker row is the opposite: **a marker row for a
 * GM-layer coin is exactly as much of a leak as a position row for one**, because it names
 * a `tokenId` and so says that a hidden coin exists — the oracle `TOKEN_NOT_FOUND` is
 * written to close — and it is indistinguishable in type from a row about a hero, so no
 * `returns:` validator can tell them apart.
 *
 * What makes it the *same* entry rather than a fourth is that its predicate is
 * `maySee(token, isDm)`: the same question, answered by the same function, in the same
 * module. A separate entry would claim a separate reader and a separate predicate, and
 * neither exists. So this milestone added a secret-bearing table and needed **no new
 * choke point and no fourth column** in CLAUDE.md invariant 8's table.
 */
const GUARDS: Guard[] = [
  { tables: ['tokens', 'tokenPositions', 'tokenMarkers'], reader: './lib/board.ts' },
  { tables: ['characters', 'characterVitals'], reader: './lib/characters.ts' },
  { tables: ['feed'], reader: './lib/feed.ts' },
]

/**
 * Both quote styles for each entry point into a table. `.query('tokens'` is the
 * index/scan path and `db.get('tokens'` the by-id path; a leak needs only one of
 * them, so the guard has to cover all of them rather than the idiomatic one.
 */
function needlesFor(table: string): string[] {
  return [
    `.query('${table}'`,
    `.query("${table}"`,
    `db.get('${table}'`,
    `db.get("${table}"`,
  ]
}

function needlesForGuard(guard: Guard): string[] {
  return guard.tables.flatMap(needlesFor)
}

/**
 * Test files are excluded because they read the stored rows on purpose — that is
 * how the other suites compare a payload against reality rather than against
 * another projection. `_generated/` is excluded because it is machine-written.
 */
function isScanned(path: string): boolean {
  return !path.endsWith('.test.ts') && !path.includes('/_generated/')
}

const scanned = Object.entries(sources).filter(([path]) => isScanned(path))

for (const guard of GUARDS) {
  describe(`${guard.tables.join(' and ')} reads are confined to ${guard.reader}`, () => {
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
      expect(paths).toContain(guard.reader)
      /**
       * ⚠️ **`convex/bestiary.ts` is named here rather than given a `GUARDS` entry of
       * its own**, and the distinction is the point.
       *
       * The sweep below is already over *every* module but the declared reader, so
       * Milestone 5's two picker queries are checked against `characters` and
       * `characterVitals` — and against `tokens` and `tokenPositions` — with no edit at
       * all. That is the arrangement working as designed: the guard is a deny-list of
       * readers rather than an allow-list of files to remember.
       *
       * What the sweep cannot notice is a module that is not in the glob. So the one
       * thing worth asserting is that this file *is* being swept, because
       * `convex/bestiary.ts` is the module where a leak would be least visible: it
       * reads no table today, so nothing about it looks like a reader, and the obvious
       * future feature — an "already in this game" marker beside a picker row — is a
       * read of `characters` that a reviewer would wave straight through. Its own
       * header says that read has to go through `lib/characters.ts` and come back as a
       * set of keys.
       *
       * It deliberately gets no `GUARDS` entry: the corpus is a static module, nothing
       * anywhere does `.query('bestiary')`, and the "is genuinely the reader" test
       * below would then fail by construction. `corpusGuard.test.ts` is the guard for
       * the corpus, and it is a guard about imports rather than about queries.
       */
      expect(paths, 'convex/bestiary.ts is not being swept for table reads').toContain(
        './bestiary.ts',
      )
      /**
       * ⚠️ **`convex/lib/fog.ts` is named here for exactly `bestiary.ts`'s reason, and
       * deliberately gets no `GUARDS` entry of its own.** The argument is written out at
       * length in that file's header: every `fogRects` row goes to every client verbatim,
       * because a blacked-out corridor *is* the feature, so those rows have no non-secret
       * twin to be confused with and there is no predicate for a choke point to be the home
       * of. An entry below would assert a confinement protecting nothing — it would pass,
       * which is precisely why omitting it has to be argued rather than left implicit, and
       * this project does not keep guards that cannot fail.
       *
       * What *is* guarded sits one step downstream. Turning a rectangle into a set of
       * withheld token ids needs `tokenPositions`, and `foggedTokenIds` therefore lives in
       * `lib/board.ts` under the first entry above, with no edit to it at all. So the one
       * thing worth asserting is that this module is in the glob: until per-player fog,
       * reveal-as-you-walk or line of sight flips the argument, it is still swept against
       * every table it must not read.
       */
      expect(paths, 'convex/lib/fog.ts is not being swept for table reads').toContain(
        './lib/fog.ts',
      )
      for (const [path, text] of scanned) {
        expect(typeof text, `${path} did not load as text`).toBe('string')
        expect(text.length, `${path} loaded empty`).toBeGreaterThan(0)
      }
    })

    /**
     * The other half of "not vacuous": the guard only means something if the reader
     * really is reading the tables. Were `lib/board.ts` to stop querying them, the
     * sweep below would pass over a codebase where nobody reads tokens at all — and
     * the same trap is waiting for `lib/characters.ts`, whose whole job could be
     * refactored one function at a time into somewhere the sweep does not look.
     *
     * Asserted per table rather than per pair, because a reader that had quietly
     * stopped touching one of its two tables is exactly the state in which that
     * table's real reader has moved somewhere unguarded.
     */
    test(`${guard.reader} is genuinely the reader of each of its tables`, () => {
      const reader = sources[guard.reader]
      expect(reader, `convex/${guard.reader.slice(2)} is missing`).toBeTypeOf('string')

      for (const table of guard.tables) {
        const used = needlesFor(table).filter((needle) => reader.includes(needle))
        expect(
          used.length,
          `${guard.reader} never reads ${table} — the guard for it is vacuous`,
        ).toBeGreaterThan(0)
      }
    })

    /**
     * One sweep per pair, and the offender list carries the file name and the needle
     * that matched — so a failure reads as "convex/foo.ts contains .query('tokens'"
     * without a second per-file test restating the same thing.
     *
     * Every other module is swept, including the *other* pair's reader: a choke
     * point that reached across into the neighbouring tables would be as much of a
     * hole as an ordinary query doing it, and harder to notice.
     */
    test(`no other convex module reads ${guard.tables.join(' or ')}`, () => {
      const needles = needlesForGuard(guard)
      const offenders: string[] = []
      for (const [path, text] of scanned) {
        if (path === guard.reader) continue
        for (const needle of needles) {
          if (text.includes(needle)) offenders.push(`${path} contains ${needle}`)
        }
      }
      expect(offenders).toEqual([])
    })
  })
}
