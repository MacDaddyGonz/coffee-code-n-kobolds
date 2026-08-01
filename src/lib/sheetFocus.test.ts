import { describe, expect, test } from 'vitest'

import { sheetFocusOf } from '@/lib/sheetFocus'
import type { Id } from '@convex/_generated/dataModel'

/**
 * Convex ids are branded strings, and nothing here reads one — the function only
 * ever compares against null and copies the value through. So a cast is honest:
 * a real id would make the assertions harder to read and would test the database
 * rather than the five rules.
 */
const character = (name: string) => name as Id<'characters'>
const token = (name: string) => name as Id<'tokens'>

const MINE = character('mine')
const THEIRS = character('theirs')
const PICKED = character('picked')
const COIN = token('coin')

/** Nothing selected, nothing held, not the DM. Each test names only what it changes. */
const NOTHING = {
  selectedCharacterId: null,
  selectedTokenId: null,
  selectedTokenCharacterId: null,
  myCharacterId: null,
  isDm: false,
}

describe('sheetFocusOf', () => {
  test('nothing selected and nothing held is nothing on screen', () => {
    expect(sheetFocusOf(NOTHING)).toEqual({ kind: 'none' })
    expect(sheetFocusOf({ ...NOTHING, isDm: true })).toEqual({ kind: 'none' })
  })

  test('a direct pick from the selector is what is shown', () => {
    expect(sheetFocusOf({ ...NOTHING, isDm: true, selectedCharacterId: PICKED })).toEqual({
      kind: 'character',
      characterId: PICKED,
    })
  })

  // The defect this whole two-primitive arrangement exists to prevent: a creature
  // with no token, chosen while a token from an earlier click is still selected.
  test('a direct pick beats a stale token bound to somebody else', () => {
    expect(
      sheetFocusOf({
        selectedCharacterId: PICKED,
        selectedTokenId: COIN,
        selectedTokenCharacterId: THEIRS,
        myCharacterId: null,
        isDm: true,
      }),
    ).toEqual({ kind: 'character', characterId: PICKED })
  })

  test('a direct pick beats the seat’s own character', () => {
    expect(
      sheetFocusOf({ ...NOTHING, selectedCharacterId: PICKED, myCharacterId: MINE }),
    ).toEqual({ kind: 'character', characterId: PICKED })
  })

  test('a selected token shows whatever it is bound to', () => {
    expect(
      sheetFocusOf({
        ...NOTHING,
        selectedTokenId: COIN,
        selectedTokenCharacterId: THEIRS,
        isDm: true,
      }),
    ).toEqual({ kind: 'character', characterId: THEIRS })
  })

  // The player's half of acceptance criterion 4: select the wolf, see the wolf.
  test('a selected token beats the player’s own character', () => {
    expect(
      sheetFocusOf({
        ...NOTHING,
        selectedTokenId: COIN,
        selectedTokenCharacterId: THEIRS,
        myCharacterId: MINE,
      }),
    ).toEqual({ kind: 'character', characterId: THEIRS })
  })

  test('a player who deselects lands back on their own character', () => {
    expect(sheetFocusOf({ ...NOTHING, myCharacterId: MINE })).toEqual({
      kind: 'character',
      characterId: MINE,
    })
  })

  // The asymmetry, stated as a test because it is the one rule a reader would
  // assume runs both ways: a DM who is also playing a character still lands on
  // nothing, because the DM's panel is about the creature they were looking at.
  test('a DM who deselects lands on nothing even holding a character', () => {
    expect(sheetFocusOf({ ...NOTHING, myCharacterId: MINE, isDm: true })).toEqual({ kind: 'none' })
  })

  test('a DM selecting a token that carries no sheet gets the token', () => {
    expect(sheetFocusOf({ ...NOTHING, selectedTokenId: COIN, isDm: true })).toEqual({
      kind: 'tokenWithoutSheet',
      tokenId: COIN,
    })
  })

  // Rule 3 runs before rule 4, so a player clicking a scenery marker is not shown
  // an explanation of the marker — they keep their own sheet, which is the thing
  // their panel is for.
  test('a player selecting a token that carries no sheet keeps their own sheet', () => {
    expect(
      sheetFocusOf({ ...NOTHING, selectedTokenId: COIN, myCharacterId: MINE }),
    ).toEqual({ kind: 'character', characterId: MINE })
  })

  test('a player with no character selecting a sheetless token gets nothing', () => {
    expect(sheetFocusOf({ ...NOTHING, selectedTokenId: COIN })).toEqual({ kind: 'none' })
  })
})
