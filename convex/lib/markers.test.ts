import { describe, expect, test } from 'vitest'

import {
  TOKEN_MARKERS,
  TOKEN_MARKER_LABELS,
  normaliseMarkers,
  tokenMarkerValidator,
} from './markers'

/**
 * THE PINS THE COMPILER CANNOT PROVIDE.
 *
 * lib/markers.ts has no predicate and therefore no `never` arm — nothing decides anything
 * from a marker, which is the whole design — so this file carries proportionally more of the
 * guard than `layers.test.ts` does. What the compiler still gives is one thing:
 * `TOKEN_MARKER_LABELS` is a `Record<TokenMarker, string>`, so a member added to
 * `TOKEN_MARKERS` fails `npm run lint` here and again at the client's record of pip glyphs.
 *
 * ⚠️ **Neither of those fires in the other direction, which is the dangerous one.** A
 * literal added to `tokenMarkerValidator` alone is a value the schema will accept and store,
 * that the marker mutation will take as an argument, and that nothing can label, draw or
 * normalise — because `TokenMarker` is derived from the array and both records are keyed off
 * the type. `normaliseMarkers` would meet it and drop it, so the condition would be stored,
 * accepted, and silently invisible on every screen including the DM's.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it still can, which is
 * why the validator is hand-spelled rather than generated from the array: a generated one
 * would make the two agree by construction and delete the only check that can fail.
 */
describe('the marker union is spelled twice and the two spellings agree', () => {
  /** The literals a `v.union` of `v.literal`s was built from, in declaration order. */
  const membersOf = (validator: unknown) =>
    (validator as { members: { kind: string; value: unknown }[] }).members

  test('the validator has exactly the members of TOKEN_MARKERS, in order', () => {
    // Order and not just membership, because the renderer iterates the vocabulary and draws
    // a pip per member it finds — the array *is* the pip order, and the DM's checkbox grid
    // is laid out from the same list. A reordering is a visual change to every coin in the
    // game, which set equality would wave through.
    const members = membersOf(tokenMarkerValidator)
    expect(members.map((member) => member.value)).toEqual([...TOKEN_MARKERS])
  })

  test('every member of the validator is a literal and not something else', () => {
    // Cheap, and it is what makes the assertion above mean what it says: `members` on a
    // union of anything else has a `value` of `undefined`, so a `v.string()` slipped in
    // beside the literals would read as a member with no value rather than as a hole in
    // the vocabulary.
    const members = membersOf(tokenMarkerValidator)
    expect(members.map((member) => member.kind)).toEqual(TOKEN_MARKERS.map(() => 'literal'))
  })

  test('there are exactly seventeen of them', () => {
    // The count is a decision — 5e (2024)'s fifteen conditions plus `concentrating` and
    // `dead` — so it is pinned rather than derived. Nothing else in the file notices one
    // member quietly dropped and another added in the same commit: membership, order,
    // labels and the alphabetical check would all still pass.
    expect(TOKEN_MARKERS).toHaveLength(17)
  })

  test('the list is alphabetical', () => {
    // An eighteenth member appended rather than inserted is a reordering of every coin's
    // pips and of the DM's checkbox grid, and it is the single most likely way this list
    // gets edited. Set equality says nothing about it; this does.
    expect([...TOKEN_MARKERS]).toEqual([...TOKEN_MARKERS].sort())
  })
})

describe('the keys and labels are American, against the house style', () => {
  /**
   * ⚠️ **This is a test rather than a comment, and the difference is the whole reason it is
   * here.** Every other identifier in this codebase is British — `normalise`, `colour`,
   * `authorise` — and the roadmap's own paragraph about this feature writes `paralysed`. The
   * keys are American because the SRD this project moves to later is American, and exactly
   * one word in the seventeen actually differs. That makes it look like a typo, and the
   * comment in lib/markers.ts saying it is not cannot fail a build.
   *
   * What it costs to get wrong is not a compile error either, which is the point. These
   * strings are written into rows: renaming the key does not migrate them, so every coin
   * already marked `paralyzed` keeps a value the union no longer contains,
   * `normaliseMarkers` drops it exactly as designed, and the pip vanishes mid-session with
   * nothing failing anywhere. A "tidying" commit is the likeliest author of that, and this
   * test is the only thing standing in front of it.
   */
  const labels = Object.values(TOKEN_MARKER_LABELS)

  test('the key is paralyzed and never paralysed', () => {
    expect([...TOKEN_MARKERS]).toContain('paralyzed')
    expect([...TOKEN_MARKERS]).not.toContain('paralysed')
  })

  test('the label is Paralyzed and never Paralysed', () => {
    // Asserted separately from the key, because the label is what the DM reads and is
    // therefore where a British correction looks most obviously right.
    expect(labels).toContain('Paralyzed')
    expect(labels).not.toContain('Paralysed')
  })
})

describe('every marker is labelled, and nothing else is', () => {
  const labels = TOKEN_MARKERS.map((marker) => TOKEN_MARKER_LABELS[marker])

  test('no label names a marker that does not exist', () => {
    // The forward direction is the compiler's: a `Record<TokenMarker, string>` catches a
    // *missing* key. This is the reverse, which is `layers.test.ts`'s own stated reason for
    // the same assertion — a `Record` is satisfied by extra keys, so a label left behind
    // after a member was removed is invisible to `tsc` and would sit in the vocabulary
    // forever, labelling nothing.
    expect(Object.keys(TOKEN_MARKER_LABELS).sort()).toEqual([...TOKEN_MARKERS].sort())
  })

  test('every label is non-empty and distinct', () => {
    // A `Record` says nothing about a key left blank or two keys sharing a word, and two
    // checkboxes reading the same thing is a control nobody can use — with seventeen rows in
    // one grid, that is a real prospect rather than a theoretical one. `roll.test.ts` makes
    // this assertion of `ROLL_MODE_LABELS`; `TOKEN_LAYER_LABELS` has no equivalent, which is
    // defensible at three members and would not be at seventeen.
    for (const label of labels) expect(label.trim()).not.toBe('')
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('normaliseMarkers is a filter over the vocabulary, not a map over the input', () => {
  test('it deduplicates', () => {
    expect(normaliseMarkers(['poisoned', 'poisoned'])).toEqual(['poisoned'])
  })

  test('it reorders into vocabulary order', () => {
    // Handed the vocabulary backwards, it gives the vocabulary. That is the property the
    // renderer leans on: pips are in the same order on every coin regardless of the order
    // the conditions were ticked in.
    expect(normaliseMarkers([...TOKEN_MARKERS].reverse())).toEqual([...TOKEN_MARKERS])
  })

  test('it drops a value the vocabulary has never heard of', () => {
    // ⚠️ The case the whole function exists for, and it is expressible **only** because the
    // parameter is `readonly string[]` rather than `TokenMarker[]`. A `TokenMarker[]`
    // signature would make this line need a cast, and a guard whose one real scenario can
    // only be written by lying to the compiler is a guard that gets deleted as dead code.
    //
    // The scenario is not hypothetical: a schema push is not atomic, so a row written by a
    // newer deployment can be read by an older one for the seconds in between. Dropping the
    // value here is what stops it reaching `visibleMarkers`' `v.array(tokenMarkerValidator)`
    // and turning a stale read into a thrown query for every caller at the table.
    expect(normaliseMarkers(['poisoned', 'exhausted'])).toEqual(['poisoned'])
  })

  test('an empty list normalises to an empty list', () => {
    // The row's existence means *this coin has conditions*, so this is the value the write
    // path tests against to decide whether to delete the row rather than store an empty
    // array.
    expect(normaliseMarkers([])).toEqual([])
  })

  test('a list of nothing but unknowns is empty rather than passed through', () => {
    expect(normaliseMarkers(['paralysed', 'hasted', ''])).toEqual([])
  })
})
