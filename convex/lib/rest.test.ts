import { describe, expect, test } from 'vitest'

import { REST_KINDS, REST_LABELS, restKindValidator, restores } from './rest'

/**
 * ONE UNION DOING TWO JOBS, AND THE ONE FUNCTION WHERE THEY MEET.
 *
 * `RestKind` is both *which rest was taken* and *the shortest rest that fully restores this
 * resource*. Two unions with the same two members would compile and would need a converter,
 * and the day somebody added a third period to one of them the two would disagree about what
 * a rest is. `restores` is where the two readings meet, and its whole body is that meeting —
 * so it is where the interesting assertions are.
 */
describe('the rest union is spelled twice and the two spellings agree', () => {
  const membersOf = (validator: unknown) =>
    (validator as { members: { kind: string; value: unknown }[] }).members

  test('the validator has exactly the members of REST_KINDS, in order', () => {
    // ⚠️ The direction the compiler cannot see. Every refusal in lib/rest.ts fires when a
    // member is added to `REST_KINDS`; none fires when a literal is added to the *validator*
    // alone — and this validator is inside `sheetEntryValidator`, so the schema would accept
    // and store a recharge period `restores` has never heard of and `REST_LABELS` cannot name.
    const members = membersOf(restKindValidator)
    expect(members.map((member) => member.value)).toEqual([...REST_KINDS])
    expect(members.map((member) => member.kind)).toEqual(REST_KINDS.map(() => 'literal'))
  })

  test('shortest first, because the array is the order a control offers them', () => {
    expect([...REST_KINDS]).toEqual(['short', 'long'])
  })
})

describe('restores', () => {
  test('a short-rest resource comes back on either rest', () => {
    expect(restores('short', 'short')).toBe(true)
    expect(restores('short', 'long')).toBe(true)
  })

  test('a long-rest resource comes back only on a long rest', () => {
    // ⚠️ **The negative is the load-bearing half**, and it is the acceptance criterion in
    // miniature: a Warlock takes a short rest and gets both Pact Magic slots back while the
    // Wizard beside them gets none. A short rest that restored the Wizard's slots would be the
    // application inventing a rule.
    expect(restores('long', 'short')).toBe(false)
    expect(restores('long', 'long')).toBe(true)
  })

  test('every pair of the vocabulary has an answer, and only one pair is false', () => {
    // Driven by the vocabulary rather than by four literals, so a third rest period arrives
    // here as a failing count rather than as three quietly unasked questions.
    const answers = REST_KINDS.flatMap((recharge) =>
      REST_KINDS.map((taken) => restores(recharge, taken)),
    )
    expect(answers).toHaveLength(REST_KINDS.length ** 2)
    expect(answers.filter((answer) => answer === false)).toHaveLength(1)
  })

  test('an unrecognised recharge period restores nothing', () => {
    // ⚠️ **FAIL-CONSERVATIVE, not fail-closed, and the difference matters before anybody
    // "fixes" it to match `isMonsterSheet`.** Nothing here guards a secret. Restoring too
    // little costs one click on a counter the sheet lets anybody edit directly; restoring too
    // much is the application handing out a resource nobody asked for, silently, on a screen
    // the whole table is reading. The second is worse.
    //
    // The scenario is not hypothetical: a schema push is not atomic, so a row written by a
    // newer deployment can be read by an older one for the seconds in between. Expressible
    // only through a cast, which is what the `never` arm means.
    expect(restores('dawn' as 'short', 'long')).toBe(false)
    expect(restores('dawn' as 'short', 'short')).toBe(false)
  })
})

describe('what the two rests say about themselves', () => {
  test('every rest has a label and an explanation, both non-empty and distinct', () => {
    const labels = REST_KINDS.map((kind) => REST_LABELS[kind])
    for (const { label, explanation } of labels) {
      expect(label.trim()).not.toBe('')
      expect(explanation.trim()).not.toBe('')
    }
    expect(new Set(labels.map((entry) => entry.label)).size).toBe(REST_KINDS.length)
    expect(new Set(labels.map((entry) => entry.explanation)).size).toBe(REST_KINDS.length)
  })

  test('no label names a rest that does not exist', () => {
    // The reverse of what the `Record` gives for free — it is satisfied by extra keys, so an
    // entry left behind after a member was removed is invisible to `tsc`.
    expect(Object.keys(REST_LABELS).sort()).toEqual([...REST_KINDS].sort())
  })

  test('the short rest’s explanation says plainly that nothing is healed for you', () => {
    // ⚠️ **`HitDiceControls`' history, refused mechanically.** It shipped a button labelled
    // *"Long rest"* that only returned hit dice, and it read as broken the first time somebody
    // pressed it at 1 hit point — the label promised the thing the button did not do. The
    // short rest is that trap pointing the other way: it does not heal and does not return hit
    // dice, because *spending* hit dice is what it is for. A comment cannot fail a build; this
    // can.
    expect(REST_LABELS.short.explanation).toContain('nothing is healed for you')
    expect(REST_LABELS.short.explanation).toContain('hit dice')
  })
})
