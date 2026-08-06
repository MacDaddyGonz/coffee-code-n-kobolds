/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest'

/**
 * EVERY FIELD HOLDING A BLOB IS ASKED ABOUT BEFORE THE BLOB IS DELETED.
 *
 * `leakGuard.test.ts`'s sibling, and written in the same spirit for a different kind of
 * invisible invariant. That one is about a *secret* travelling to somebody who may not have
 * it; this one is about bytes disappearing from under somebody who is looking at them.
 *
 * `files.discard` exists because a Convex mutation is one transaction, so a mutation that
 * refuses an upload cannot delete the file it just refused (ADR 0004). The client's catch
 * calls `discard` instead — from an error path, with ids it may have mis-sequenced — and
 * `discard` therefore has to refuse a blob anything still points at. Its guard is a list of
 * `…References…` predicates, one per **column** in the schema that holds a `v.id('_storage')`.
 *
 * ⚠️ **The failure mode of forgetting one is silent, and that is why this file exists.** A
 * new blob column with no matching predicate does not break a build, fail a type check or
 * throw at runtime. It produces a `discard` that cheerfully deletes the bytes of a handout
 * somebody is looking at, or the audio of the track that is playing, because nothing asked
 * about that column. Nothing in the code says the list is meant to be exhaustive — the
 * exhaustiveness *is* the invariant, and it is spelled nowhere a compiler can read it. Both
 * ends of the pairing say so in prose (`convex/schema.ts` beside each blob column, and the
 * docblock on `discard`), and prose is what this test turns into a machine check.
 *
 * ⚠️ **IT USED TO DERIVE PER TABLE, AND THAT WAS A HOLE RATHER THAN A SIMPLIFICATION.** The
 * question it asked was *does `files.ts` import something called `sceneReferences…`?* — so
 * once `scenes` had `sceneReferencesImage` for its map, a **second** blob column on the same
 * table satisfied the guard with nothing at all asking about those bytes. That is not a
 * hypothetical: `scenes.thumbnailId` is exactly that column, and the milestone that added it
 * had to rewrite this file first. The per-table derivation would have passed, in green, on
 * the commit that introduced the bug.
 *
 * The replacement asks one question per field: **subject** is the table with a trailing `s`
 * removed, **object** is the column with a trailing `Id` removed and capitalised, and the
 * predicate is `${subject}References${object}`. It reproduces all four names that already
 * existed — `sceneReferencesImage`, `tokenReferencesImage`, `modalImageReferencesImage`,
 * `trackReferencesFile` — and forces the fifth.
 *
 * ⚠️ **That last one is the pleasing part and worth reading twice.** The old derivation had
 * to leave the suffix as `\w+` and carve out an exception in prose, because `tracks` holds
 * the one blob in this schema that is not a picture and its predicate is named for a *file*.
 * Under a field derivation there is no exception at all: the column is `fileId`, so the name
 * `trackReferencesFile` is what the rule *produces*. A guard that stops needing its own
 * carve-out is usually a guard that has started asking the right question.
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
 * `convex/schema.ts` explains the pairing in comments that quote `v.id('_storage')`
 * verbatim, several times, and those comments sit *inside* the block a naïve scan would
 * attribute to the table above them. A guard that fails on the documentation written to
 * respect it is a guard that gets deleted, which is the same carve-out `corpusGuard.test.ts`
 * makes for the components that explain in prose why the corpora are server-side.
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

/** A blob-holding column, and the table it is declared in. */
type BlobField = { table: string; field: string }

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

/**
 * Every column whose own validator is a storage id — the list `files.discard` has to cover.
 *
 * `v.optional(...)` is unwrapped rather than excluded, and that is load-bearing: three of
 * the five blob columns in this schema are optional, including both of the ones that arrived
 * after their table did. A scan that only saw required columns would find `tokens.imageId`
 * absent and report the schema as clean.
 */
function blobFieldsIn(block: TableBlock): BlobField[] {
  const pattern = /(\w+):\s*(?:v\.optional\(\s*)?v\.id\('_storage'\)/g
  const fields: BlobField[] = []
  for (let match = pattern.exec(block.body); match !== null; match = pattern.exec(block.body)) {
    fields.push({ table: block.table, field: match[1] })
  }
  return fields
}

function blobFieldsOf(schema: string): BlobField[] {
  return tableBlocks(schema).flatMap(blobFieldsIn)
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
      const local = clause
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (local) names.push(local)
    }
  }
  return names
}

/**
 * The **exact** predicate name a column implies: `scenes.thumbnailId` →
 * `sceneReferencesThumbnail`.
 *
 * Exact rather than a pattern, which is the whole difference from what this replaced. A
 * pattern is what let one predicate stand in for two columns; a name that has to be spelled
 * letter for letter cannot.
 *
 * A column not ending in `Id` keeps its whole name as the object, so a future `poster` would
 * want `sceneReferencesPoster`. That is a guess about a spelling nobody has needed yet, and
 * it is the forgiving direction: it asks for the obvious name rather than refusing to
 * derive one.
 */
function predicateFor({ table, field }: BlobField): string {
  const subject = table.replace(/s$/, '')
  const bare = field.replace(/Id$/, '')
  return `${subject}References${bare[0].toUpperCase()}${bare.slice(1)}`
}

/**
 * ⚠️ **THE SUPERSEDED DERIVATION, KEPT SOLELY SO THE INSTRUMENT CAN STATE THE DIFFERENCE.**
 *
 * Nothing above uses this and nothing should. It is here because the claim this rewrite
 * rests on — *the table-level rule demanded one predicate where the field-level rule demands
 * two* — is a claim about two functions, and a claim about two functions that only quotes one
 * of them is prose. The last test in this file feeds both a synthetic table holding two
 * blobs and asserts they disagree in exactly that way.
 *
 * ⚠️ **"Its positive control is that it fails today" is not a committable form**, which is
 * the trap this function exists to get out of. The roadmap asked for a guard whose evidence
 * is that the old one passes and the new one does not — and a red test cannot be committed,
 * so the evidence would have to live in somebody's terminal. Reproducing the old rule beside
 * the new one turns that evidence into an assertion that runs on every push, and the
 * genuinely red run is recorded where a red run belongs: in the commit message of the change
 * that made it green.
 */
function tableLevelPredicateFor(table: string, imported: string[]): string | undefined {
  const subject = table.replace(/s$/, '')
  const pattern = new RegExp(`^${subject}References\\w+$`)
  return imported.find((name) => pattern.test(name))
}

const schema = sources[SCHEMA]
const discarder = sources[DISCARDER]
const blobFields = schema === undefined ? [] : blobFieldsOf(schema)
const imported = discarder === undefined ? [] : importedNames(discarder)

/** `scenes.imageId`, for a failure message a person can act on. */
function label({ table, field }: BlobField): string {
  return `${table}.${field}`
}

describe('every field holding a storage id is asked about by files.discard', () => {
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
   * ⚠️ **THE ANTI-VACUITY ASSERTION, AND IT NOW HAS TO SAY THREE THINGS.**
   *
   * A scan that found *no* columns would make the loops below iterate zero times and pass in
   * silence — the exact failure a data-driven guard trades for not keeping a hard-coded
   * list. A scan that found *every* column would pass just as quietly while asserting
   * nothing, because a needle that matches everything is not a needle.
   *
   * The third thing is what this rewrite is for: **two columns of the same table are found
   * separately.** A field scan that collapsed to one entry per table would be the old guard
   * wearing the new one's name, and it would pass every other assertion in this file.
   *
   * `scenes.imageId` and `tokens.imageId` have held a blob since Milestone 2 and are the two
   * that cannot drift; `games`, `feed` and `tokenPositions` hold none and must not appear,
   * which is what proves the block-splitting attributes a column to the declaration it is
   * actually inside.
   */
  test('the scan finds the columns that hold a blob, and only those', () => {
    expect(
      blobFields.length,
      'no column in the schema holds a blob — the scan is broken',
    ).toBeGreaterThan(1)

    const found = blobFields.map(label)
    expect(found, 'a scene’s background image is a blob').toContain('scenes.imageId')
    expect(found, 'a token’s art is a blob').toContain('tokens.imageId')
    // The reason this file was rewritten: a second blob column on a table that already had
    // one has to be a second entry, not an alias of the first.
    expect(found, 'a scene’s thumbnail is a second blob on the same table').toContain(
      'scenes.thumbnailId',
    )
    expect(new Set(found).size, 'two columns collapsed into one entry').toBe(found.length)

    const tables = new Set(blobFields.map((field) => field.table))
    for (const table of ['games', 'players', 'characters', 'tokenPositions', 'fogRects', 'feed']) {
      expect([...tables], `${table} holds no storage id and must not be in the list`).not.toContain(
        table,
      )
    }
  })

  /**
   * The invariant itself: one predicate per column, imported by the module that does the
   * deleting.
   *
   * ⚠️ **The predicate is *imported* rather than defined here**, and that is the second half
   * of the arrangement rather than an accident of style. Each of these questions is asked of
   * the module that owns the table — `tokenReferencesImage` lives in `lib/board.ts` because
   * every read of `tokens` does, and `leakGuard.test.ts` greps the sources to keep it that
   * way — so only a boolean ever crosses the boundary. A `files.ts` that answered the
   * question itself would be a second reader of a guarded table.
   */
  test('files.ts imports the predicate each of them names', () => {
    const missing: string[] = []
    for (const field of blobFields) {
      const predicate = predicateFor(field)
      if (!imported.includes(predicate)) {
        missing.push(`${label(field)} → convex/files.ts imports no ${predicate}`)
      }
    }
    expect(missing).toEqual([])
  })

  /**
   * And each one is actually *asked*. An import with no call site is the same hole with a
   * tidier diff: `npm run lint` would object to an unused import, but a predicate imported
   * and then used in a comment, a log line or a dead branch would satisfy both the compiler
   * and the test above while asking nothing.
   */
  test('files.ts awaits every predicate it imports for those columns', () => {
    const unasked: string[] = []
    for (const field of blobFields) {
      const predicate = predicateFor(field)
      if (!imported.includes(predicate)) continue
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
  test('the derivation reproduces every real name and is not satisfied by a near miss', () => {
    // All four names that existed before thumbnails, derived rather than listed. The fourth
    // is the one that used to need a prose exception: `fileId` yields `File`, so the naming
    // rule *produces* `trackReferencesFile` instead of tolerating it.
    expect(predicateFor({ table: 'scenes', field: 'imageId' })).toBe('sceneReferencesImage')
    expect(predicateFor({ table: 'tokens', field: 'imageId' })).toBe('tokenReferencesImage')
    expect(predicateFor({ table: 'modalImages', field: 'imageId' })).toBe(
      'modalImageReferencesImage',
    )
    expect(predicateFor({ table: 'tracks', field: 'fileId' })).toBe('trackReferencesFile')
    // And the one it forces.
    expect(predicateFor({ table: 'scenes', field: 'thumbnailId' })).toBe('sceneReferencesThumbnail')

    // A near miss is still a miss, and the check is now equality rather than a pattern —
    // which is precisely what stops one predicate covering two columns.
    expect(imported).not.toContain('sceneReferencesImag')
    expect(imported).not.toContain('scenesReferencesImage')

    // The comment stripper does what the ⚠️ on it claims: a schema comment quoting the
    // validator does not turn its neighbour into a blob-holding column.
    expect(withoutComments(`  // a ${STORAGE_ID} in prose\n  name: v.string(),`)).not.toContain(
      STORAGE_ID,
    )
    expect(withoutComments(`  imageId: ${STORAGE_ID},`)).toContain(STORAGE_ID)
  })

  /**
   * ⚠️ **THE INSTRUMENT FOR THE REWRITE ITSELF, AND THE ONLY TEST HERE THAT ASSERTS A
   * DIFFERENCE RATHER THAN A FACT.**
   *
   * The synthetic table is the shape of the bug: one declaration, two blob columns, and an
   * importer that has written a predicate for exactly one of them. That is the state
   * `convex/schema.ts` was one commit away from being in, and it is the state the old
   * derivation calls clean.
   *
   * Synthetic rather than the real schema on purpose. Pointing this at `scenes` would make
   * it pass for two reasons at once — the derivation being right, and both predicates
   * happening to exist — so it would go on passing after somebody widened
   * `sceneReferencesImage` to cover both columns and deleted the second one. A fixture with
   * a known-wrong importer can only pass for the reason being claimed.
   */
  test('the field derivation demands two predicates where the table derivation demanded one', () => {
    const synthetic = [
      '  posters: defineTable({',
      "    gameId: v.id('games'),",
      "    imageId: v.id('_storage'),",
      "    thumbnailId: v.optional(v.id('_storage')),",
      '  }).index("by_gameId", ["gameId"]),',
    ].join('\n')

    // The scan sees both columns of the one declaration.
    const fields = blobFieldsOf(synthetic)
    expect(fields.map(label)).toEqual(['posters.imageId', 'posters.thumbnailId'])

    // An importer that covers the first column and not the second — the real hole.
    const halfCovered = ['posterReferencesImage']

    // ⚠️ The superseded rule is satisfied by it, twice over, because it only ever asked a
    // question about the table. This is the assertion the roadmap wanted a failing run for.
    expect(tableLevelPredicateFor('posters', halfCovered)).toBe('posterReferencesImage')

    // The rule this file now uses is not: the second column names a predicate nobody wrote.
    const demanded = fields.map(predicateFor)
    expect(demanded).toEqual(['posterReferencesImage', 'posterReferencesThumbnail'])
    expect(new Set(demanded).size, 'two columns must demand two distinct predicates').toBe(2)
    expect(demanded.filter((name) => !halfCovered.includes(name))).toEqual([
      'posterReferencesThumbnail',
    ])
  })
})
