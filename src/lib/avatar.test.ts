import { describe, expect, test } from 'vitest'

import { AVATAR_TINTS, initialsOf, readableInk, tintForName } from '@/lib/avatar'
import { nameKeyFor } from '@convex/lib/codes'

/** Names of the shape people actually type at this table. */
const SAMPLE_NAMES = ['Mike', 'Sam', 'Ada Lovelace', 'DM', 'kobold wrangler', '🐉', 'Zoë']

/**
 * The three tints light enough to need dark ink, pinned by hand rather than
 * re-derived from the luma formula — a test that recomputes what it is testing
 * agrees with the bug as readily as with the code.
 */
const LIGHT_TINTS = ['#f59e0b', '#eab308', '#84cc16']

describe('tintForName', () => {
  test('is deterministic', () => {
    for (const name of SAMPLE_NAMES) {
      expect(tintForName(name)).toBe(tintForName(name))
    }
  })

  test('always answers with a tint from the list', () => {
    for (let index = 0; index < 500; index += 1) {
      expect(AVATAR_TINTS).toContain(tintForName(`seat ${index}`))
    }
  })

  // The seat, not the spelling: ADR 0003 makes these one player, so they are one
  // disc. A player fixing their own capitalisation must not change colour.
  test('ignores case and surrounding whitespace, as nameKeyFor does', () => {
    const variants = ['Mike', 'mike', 'MIKE', '  Mike  ', 'Mike']
    for (const variant of variants) {
      expect(nameKeyFor(variant)).toBe(nameKeyFor('Mike'))
      expect(tintForName(variant)).toBe(tintForName('Mike'))
    }
  })

  test('a name that collapses to two words is keyed on the collapsed form', () => {
    expect(tintForName('Ada   Lovelace')).toBe(tintForName('Ada Lovelace'))
  })

  // Not a claim that any particular name lands anywhere — only that no tint in the
  // list is unreachable, which is what a broken hash (a `*` instead of `Math.imul`,
  // or a signed remainder) shows up as.
  test('every tint in the list is reachable', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 2000; index += 1) {
      seen.add(tintForName(`player ${index}`))
    }
    expect([...seen].sort()).toEqual([...AVATAR_TINTS].sort())
  })

  test('spreads short names rather than clustering them by length', () => {
    // Twenty-six one-letter names over sixteen tints: a hash that had lost its low
    // bits would answer with a handful of tints here, which is the failure the
    // `Math.imul` note in the module describes.
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('')
    const seen = new Set(letters.map((letter) => tintForName(letter)))
    expect(seen.size).toBeGreaterThanOrEqual(8)
  })
})

describe('readableInk', () => {
  test('picks dark ink on the light tints and white on the rest', () => {
    for (const tint of AVATAR_TINTS) {
      expect(readableInk(tint), tint).toBe(LIGHT_TINTS.includes(tint) ? '#111111' : '#ffffff')
    }
  })

  // The guards exist for the DM's half-typed colour picker, not for anything this
  // module generates.
  test('falls back to white on a colour that is not six hex digits', () => {
    expect(readableInk('#ff')).toBe('#ffffff')
    expect(readableInk('')).toBe('#ffffff')
    expect(readableInk('#gggggg')).toBe('#ffffff')
    expect(readableInk('rebeccapurple')).toBe('#ffffff')
  })

  test('reads a colour with or without its hash', () => {
    expect(readableInk('eab308')).toBe(readableInk('#eab308'))
  })
})

describe('initialsOf', () => {
  test('answers a placeholder for an empty name', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })

  test('takes one letter from a one-word name', () => {
    expect(initialsOf('Mike')).toBe('M')
    expect(initialsOf('mike')).toBe('M')
  })

  test('takes the first two words and no more', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('Mary Anne St John')).toBe('MA')
    expect(initialsOf('  Ada   Lovelace  ')).toBe('AL')
  })

  // Split by code point, so a name that is one emoji comes back as that emoji
  // rather than half of a surrogate pair.
  test('survives an emoji name', () => {
    expect(initialsOf('🐉')).toBe('🐉')
    expect(initialsOf('🐉 Wrangler')).toBe('🐉W')
  })
})
