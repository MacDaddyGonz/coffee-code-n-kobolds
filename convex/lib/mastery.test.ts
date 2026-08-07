import { describe, expect, test } from 'vitest'

import { WEAPON_MASTERIES, WEAPON_MASTERY_LABELS, weaponMasteryValidator } from './mastery'

/**
 * THE PINS THE COMPILER CANNOT PROVIDE.
 *
 * lib/mastery.ts has no predicate and therefore no `never` arm — nothing decides anything from
 * a mastery, which is the whole design and the only reason shipping `push`, `slow` and
 * `topple` lifts nothing from requirements.md's *no movement-detriment status effects*. So
 * this file carries proportionally more of the guard than `layers.test.ts` does, exactly as
 * `markers.test.ts` does for the same reason. What the compiler still gives is one thing:
 * `WEAPON_MASTERY_LABELS` is a `Record<WeaponMastery, string>`, so a member added to
 * `WEAPON_MASTERIES` fails `npm run lint` here.
 *
 * ⚠️ **That does not fire in the other direction, which is the dangerous one.** A literal
 * added to `weaponMasteryValidator` alone is a value the schema will accept and store — the
 * validator is inside `sheetEntryValidator` — and that nothing can label or draw, because
 * `WeaponMastery` is derived from the array and the record is keyed off the type. `masteryOf`
 * would meet it and drop it, so the property would be stored, accepted, and silently invisible
 * on every screen including the DM's.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it still can, which is why
 * the validator is hand-spelled rather than generated from the array: a generated one would
 * make the two agree by construction and delete the only check that can fail.
 */
describe('the mastery union is spelled twice and the two spellings agree', () => {
  /** The literals a `v.union` of `v.literal`s was built from, in declaration order. */
  const membersOf = (validator: unknown) =>
    (validator as { members: { kind: string; value: unknown }[] }).members

  test('the validator has exactly the members of WEAPON_MASTERIES, in order', () => {
    // Order and not just membership, because a picker offers this list and a reader scans it —
    // a ninth member appended rather than inserted alphabetically reorders a control somebody
    // has learned the shape of, which set equality would wave through.
    const members = membersOf(weaponMasteryValidator)
    expect(members.map((member) => member.value)).toEqual([...WEAPON_MASTERIES])
  })

  test('every member of the validator is a literal and not something else', () => {
    // Cheap, and it is what makes the assertion above mean what it says: `members` on a union
    // of anything else has a `value` of `undefined`, so a `v.string()` slipped in beside the
    // literals would read as a member with no value rather than as a hole in the vocabulary.
    const members = membersOf(weaponMasteryValidator)
    expect(members.map((member) => member.kind)).toEqual(WEAPON_MASTERIES.map(() => 'literal'))
  })

  test('there are exactly eight of them', () => {
    // The count is the SRD's rather than this application's — every one of its 38 weapons
    // carries exactly one of these — so it is pinned rather than derived. Nothing else in the
    // file notices one member quietly dropped and another added in the same commit:
    // membership, order, labels and the alphabetical check would all still pass.
    expect(WEAPON_MASTERIES).toHaveLength(8)
  })

  test('the list is alphabetical', () => {
    // A ninth member appended rather than inserted is the single most likely way this list
    // gets edited. Set equality says nothing about it; this does.
    expect([...WEAPON_MASTERIES]).toEqual([...WEAPON_MASTERIES].sort())
  })

  test('the three the exclusion names are all present, and named here on purpose', () => {
    // ⚠️ **These are the words requirements.md's movement-detriment exclusion describes**, and
    // the reason this project wrote an amendment rather than shipping quietly: Push shoves 10
    // feet, Slow cuts Speed by 10, and Topple knocks a creature Prone. What ships is the word.
    // Asserted by name so that a reader of this file meets the tension rather than discovering
    // it, and so that removing one to "avoid the exclusion" is a visible decision.
    for (const named of ['push', 'slow', 'topple']) {
      expect([...WEAPON_MASTERIES], named).toContain(named)
    }
  })
})

describe('every mastery is labelled, and nothing else is', () => {
  const labels = WEAPON_MASTERIES.map((mastery) => WEAPON_MASTERY_LABELS[mastery])

  test('no label names a mastery that does not exist', () => {
    // The forward direction is the compiler's: a `Record<WeaponMastery, string>` catches a
    // *missing* key. This is the reverse, which `layers.test.ts` and `markers.test.ts` both
    // state — a `Record` is satisfied by extra keys, so a label left behind after a member was
    // removed is invisible to `tsc` and would sit in the vocabulary forever, labelling nothing.
    expect(Object.keys(WEAPON_MASTERY_LABELS).sort()).toEqual([...WEAPON_MASTERIES].sort())
  })

  test('every label is non-empty and distinct', () => {
    for (const label of labels) expect(label.trim()).not.toBe('')
    expect(new Set(labels).size).toBe(labels.length)
  })

  test('a label is the word and never an explanation of what it does', () => {
    // ⚠️ The same decision `TOKEN_MARKER_LABELS` made. A sentence here describing that Topple
    // knocks a creature Prone would be the first line in `convex/` implying that something
    // here does it — and this module adjudicates nothing. One word, capitalised, and the
    // rulebook on the table has the rest.
    for (const label of labels) expect(label.split(/\s+/)).toHaveLength(1)
  })
})
