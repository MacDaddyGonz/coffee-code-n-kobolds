/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * EVERY TABLE HOLDING A BLOB IS ASKED BEFORE THE BLOB IS DELETED.
 *
 * `leakGuard.test.ts`'s sibling, and written in the same spirit for a different kind of
 * invisible invariant. That one is about a *secret* travelling to somebody who may not have
 * it; this one is about bytes disappearing from under somebody who is looking at them.
 *
 * `files.discard` exists because a Convex mutation is one transaction, so a mutation that
 * refuses an upload cannot delete the file it just refused (ADR 0004). The client's catch
 * calls `discard` instead — from an error path, with an id it may have mis-sequenced — and
 * `discard` therefore has to refuse a blob anything still points at. Its guard is a list of
 * `…References…` predicates, one per table in the schema that holds a `v.id('_storage')`.
 *
 * ⚠️ **The failure mode of forgetting one is silent, and that is why this file exists.** A
 * new table with a blob in it and no matching predicate does not break a build, fail a type
 * check or throw at runtime. It produces a `discard` that cheerfully deletes the bytes of a
 * handout somebody is looking at, or the audio of the track that is playing, because nothing
 * asked that table. Nothing in the code says the list is meant to be exhaustive — the
 * exhaustiveness *is* the invariant, and it is spelled nowhere a compiler can read it. Both
 * ends of the pairing say so in prose (`convex/schema.ts` beside `tracks`, and the docblock
 * on `discard`), and prose is what this test turns into a machine check.
 *
 * **Data-driven off the schema, never off a list kept here.** A hard-coded list of four
 * tables would be a fifth place to forget the fifth table, which is the whole failure being
 * guarded against. So the tables are discovered by scanning `convex/schema.ts` for the
 * storage-id validator, and the predicate name each one implies is derived rather than
 * written down.
 *
 * Reading the modules as text rather than importing them is deliberate, as it is next door:
 * an import tells you what a module exports, and what matters here is which predicates one
 * particular handler actually reaches for.
 */
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Where the tables are declared, and the one module allowed to delete a blob by id. */
const SCHEMA = './schema.ts'
const DISCARDER = './files.ts'

/** The validator that makes a column a pointer at bytes. */
const STORAGE_ID = "v.id('_storage')"

/**
 * The source with its prose removed.
 *
 * ⚠️ **Not tidiness — without it this guard reports a table that holds no blob at all.**
 * `convex/schema.ts` explains the pairing in a comment that quotes `v.id('_storage')`
 * verbatim, twice, and that comment sits *inside* the block a naïve scan would attribute to
 * the table above it. A guard that fails on the documentation written to respect it is a
 * guard that gets deleted, which is the same carve-out `corpusGuard.test.ts` makes for the
 * components that explain in prose why the corpora are server-side.
 */
function withoutComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

type TableBlock = { table: string; body: string }

/**
 * Every `name: defineTable({` in the schema, with the text that follows it up to the next
 * one. Crude on purpose: a real parse of the schema would be a second implementation of
 * Convex's own, and what is needed here is only "which declaration does this line belong
 * to?".
 */
function tableBlocks(schema: string): TableBlock[] {
  const source = withoutComments(schema)
  const pattern = /^ {2}(\w+): defineTable\(\{/gm
  const starts: { table: string; at: number }[] = []
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    starts.push({ table: match[1], at: match.index })
  }
  return starts.map(({ table, at }, index) => ({
    table,
    body: source.slice(at, starts[index + 1]?.at ?? source.length),
  }))
}

/** The tables whose own fields hold a blob — the list `files.discard` has to cover. */
function tablesHoldingBlobs(schema: string): string[] {
  return tableBlocks(schema)
    .filter((block) => block.body.includes(STORAGE_ID))
    .map((block) => block.table)
}

/**
 * The names one module imports, `as` aliases resolved to whatever the local name is —
 * because the local name is what a call site can reach.
 */
function importedNames(source: string): string[] {
  const names: string[] = []
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from/g
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    for (const clause of match[1].split(',')) {
      const local = clause.trim().split(/\s+as\s+/).pop()?.trim()
      if (local) names.push(local)
    }
  }
  return names
}

/**
 * The predicate a table's name implies: `modalImages` → something called
 * `modalImageReferences…`.
 *
 * ⚠️ **The suffix is deliberately not pinned to `Image`.** `tracks` holds the one blob in
 * this schema that is not a picture, and its predicate is `trackReferencesFile` — named for
 * a file rather than an image because the upload path forks on exactly that fact (see the
 * ⚠️ on `fileId` in the schema). A guard that demanded `…ReferencesImage` would have forced
 * that predicate to lie about what it asks, so what is required is the *subject* and the
 * verb: this table, and whether it references the blob.
 */
function predicateFor(table: string, imported: string[]): string | undefined {
  const subject = table.replace(/s$/, '')
  const pattern = new RegExp(`^${subject}References\\w+$`)
  return imported.find((name) => pattern.test(name))
}

const schema = sources[SCHEMA]
const discarder = sources[DISCARDER]
const blobTables = schema === undefined ? [] : tablesHoldingBlobs(schema)
const imported = discarder === undefined ? [] : importedNames(discarder)

describe('every table holding a storage id is asked by files.discard', () => {
  /**
   * If `?raw` ever stops resolving the globs come back empty and every assertion below
   * passes over nothing at all. Check the input first, exactly as `leakGuard.test.ts` does:
   * a guard that cannot fail is not a guard.
   */
  test('the two sources loaded as text', () => {
    expect(schema, 'convex/schema.ts did not load as text').toBeTypeOf('string')
    expect(discarder, 'convex/files.ts did not load as text').toBeTypeOf('string')
    expect(schema.length).toBeGreaterThan(0)
    expect(discarder.length).toBeGreaterThan(0)
    // The scan found the schema's declarations rather than one lucky regex match.
    expect(tableBlocks(schema).map((block) => block.table)).toContain('games')
  })

  /**
   * ⚠️ **THE ANTI-VACUITY ASSERTION, AND IT HAS TO SAY TWO THINGS.**
   *
   * A scan that found *no* tables would make the loop below iterate zero times and pass in
   * silence — the exact failure a data-driven guard trades for not keeping a hard-coded
   * list. And a scan that found *every* table would pass just as quietly while asserting
   * nothing, because a needle that matches everything is not a needle.
   *
   * So both ends are pinned. `scenes` and `tokens` have held a blob since Milestone 2 and
   * are the two that cannot drift; `games`, `feed` and `tokenPositions` hold none and must
   * not be in the list, which is what proves the block-splitting attributes a field to the
   * declaration it is actually inside.
   */
  test('the scan finds the tables that hold a blob, and only those', () => {
    expect(blobTables.length, 'no table in the schema holds a blob — the scan is broken').toBeGreaterThan(
      1,
    )

    expect(blobTables, 'a scene’s background image is a blob').toContain('scenes')
    expect(blobTables, 'a token’s art is a blob').toContain('tokens')

    for (const table of ['games', 'players', 'characters', 'tokenPositions', 'fogRects', 'feed']) {
      expect(blobTables, `${table} holds no storage id and must not be in the list`).not.toContain(
        table,
      )
    }
  })

  /**
   * The invariant itself: one predicate per table, imported by the module that does the
   * deleting.
   *
   * ⚠️ **The predicate is *imported* rather than defined here**, and that is the second half
   * of the arrangement rather than an accident of style. Each of these questions is asked of
   * the module that owns the table — `tokenReferencesImage` lives in `lib/board.ts` because
   * every read of `tokens` does, and `leakGuard.test.ts` greps the sources to keep it that
   * way — so only a boolean ever crosses the boundary. A `files.ts` that answered the
   * question itself would be a second reader of a guarded table.
   */
  test('files.ts imports a References predicate for each of them', () => {
    const missing: string[] = []
    for (const table of blobTables) {
      const found = predicateFor(table, imported)
      if (found === undefined) missing.push(`${table} → no ${table.replace(/s$/, '')}References… imported by convex/files.ts`)
    }
    expect(missing).toEqual([])
  })

  /**
   * And each one is actually *asked*. An import with no call site is the same hole with a
   * tidier diff: `npm run lint` would object to an unused import, but a predicate imported
   * and then used in a comment, a log line or a dead branch would satisfy both the compiler
   * and the test above while asking nothing.
   */
  test('files.discard calls every predicate it imports for those tables', () => {
    const unasked: string[] = []
    for (const table of blobTables) {
      const predicate = predicateFor(table, imported)
      if (predicate === undefined) continue
      if (!discarder.includes(`await ${predicate}(`)) {
        unasked.push(`${predicate} is imported by convex/files.ts but never awaited`)
      }
    }
    expect(unasked).toEqual([])
  })

  /**
   * THE INSTRUMENT. Both halves of the derivation are checked against inputs whose answers
   * are known, because a guard whose matcher silently accepts everything passes in silence —
   * which is `feed.test.ts`'s reasoning about `containsNumber`, applied to a string match
   * instead of a number one.
   */
  test('the derivation is not satisfied by any old name, and prose is not a field', () => {
    // A table nobody has written a predicate for is reported as missing rather than matched
    // by a neighbouring one.
    expect(predicateFor('unicorns', imported)).toBeUndefined()
    // A near miss is still a miss: the subject has to be this table's.
    expect(predicateFor('scenes', ['tokenReferencesImage'])).toBeUndefined()
    // And both real spellings are accepted, which is why the suffix is `\w+` and not `Image`.
    expect(predicateFor('scenes', ['sceneReferencesImage'])).toBe('sceneReferencesImage')
    expect(predicateFor('tracks', ['trackReferencesFile'])).toBe('trackReferencesFile')

    // The comment stripper does what the ⚠️ on it claims: a schema comment quoting the
    // validator does not turn its neighbour into a blob-holding table.
    expect(withoutComments(`  // a ${STORAGE_ID} in prose\n  name: v.string(),`)).not.toContain(
      STORAGE_ID,
    )
    expect(withoutComments(`  imageId: ${STORAGE_ID},`)).toContain(STORAGE_ID)
  })
})
