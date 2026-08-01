import { describe, expect, test } from 'vitest'

import { nextStep, stepsFor, verdictMessage, verdictOf } from '@/lib/joinDoor'
import type { Id } from '@convex/_generated/dataModel'

/**
 * Convex ids are branded strings and `verdictOf` only ever compares two of them
 * with `!==`, so a cast is honest here for the same reason it is in
 * `sheetFocus.test.ts`: a real id would need a deployment, and what would then be
 * under test is the database rather than the comparison.
 */
const game = (name: string) => name as Id<'games'>

const THIS_GAME = game('this-game')
const ANOTHER_GAME = game('another-game')

/** Six characters from the code alphabet, so `isCompleteJoinCode` is satisfied. */
const CODE = 'ABC234'
const OTHER_CODE = 'XYZ789'

describe('verdictOf', () => {
  test('a half-typed code is incomplete, not a lookup in flight', () => {
    // The caller skips the query until the code is complete, so `resolved` is
    // undefined here for the same reason it is while a real lookup is running. The
    // order of the tests inside verdictOf is the only thing keeping these apart.
    expect(verdictOf({ typed: 'ABC', expectedGameId: THIS_GAME, resolved: undefined })).toEqual({
      kind: 'incomplete',
    })
    expect(verdictOf({ typed: '', expectedGameId: THIS_GAME, resolved: undefined })).toEqual({
      kind: 'incomplete',
    })
  })

  test('a complete code with the lookup still out is checking', () => {
    expect(verdictOf({ typed: CODE, expectedGameId: THIS_GAME, resolved: undefined })).toEqual({
      kind: 'checking',
    })
  })

  test('a complete code that resolves to nothing is no such game', () => {
    expect(verdictOf({ typed: CODE, expectedGameId: THIS_GAME, resolved: null })).toEqual({
      kind: 'noSuchGame',
    })
  })

  test('a code for a different game is refused', () => {
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: THIS_GAME,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE },
      }),
    ).toEqual({ kind: 'wrongGame' })
  })

  // ⚠️ The test that justifies comparing `_id` rather than the name. Nothing stops
  // two games sharing a title, and a name comparison would pass this: same name,
  // valid code, different game — somebody landing in a stranger's table that looked
  // exactly like the one they clicked.
  //
  // Both documents below are called *Tomb of the Coffee Lich*, and the name appears
  // nowhere in this test because it appears nowhere in `verdictOf`'s arguments: the
  // mistake is unavailable rather than merely untaken. What this pins is that the
  // *only* thing separating the refusal from the acceptance is the id — the codes,
  // the shapes and the imagined names are otherwise interchangeable.
  test('a code opening a different game with the SAME name is still refused', () => {
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: THIS_GAME,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE },
      }),
    ).toEqual({ kind: 'wrongGame' })

    // The positive control, so the refusal above cannot be passing because
    // *everything* is refused.
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: ANOTHER_GAME,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE },
      }),
    ).toEqual({ kind: 'ok', code: OTHER_CODE })
  })

  test('the right code for the right game is ok', () => {
    expect(
      verdictOf({
        typed: CODE,
        expectedGameId: THIS_GAME,
        resolved: { _id: THIS_GAME, code: CODE },
      }),
    ).toEqual({ kind: 'ok', code: CODE })
  })

  // The verdict carries the server's spelling, not the one that was typed. They can
  // differ — `CodeInput` uppercases as you go, but the value that reaches storage
  // and the URL should be the server's, and this is what makes the typed one
  // unreachable from the result.
  test('ok carries the server’s code, not the typed one', () => {
    expect(
      verdictOf({
        typed: 'abc234',
        expectedGameId: THIS_GAME,
        resolved: { _id: THIS_GAME, code: 'ABC234' },
      }),
    ).toEqual({ kind: 'ok', code: 'ABC234' })
  })
})

describe('verdictMessage', () => {
  test('says nothing while the field is unfinished and nothing when it is right', () => {
    expect(verdictMessage({ kind: 'incomplete' })).toBeNull()
    expect(verdictMessage({ kind: 'ok', code: CODE })).toBeNull()
  })

  test('the three failures each have their own sentence', () => {
    expect(verdictMessage({ kind: 'checking' })).toBe('Checking that code…')
    expect(verdictMessage({ kind: 'noSuchGame' })).toBe('No game with that code.')
    // The one a reader would otherwise assume said "no game with that code", which
    // is why the wording is asserted rather than left to the JSX.
    expect(verdictMessage({ kind: 'wrongGame' })).toBe('That code is not for this game.')
  })
})

describe('stepsFor', () => {
  test('a player is asked for the code and then which seat they are', () => {
    expect(stepsFor('player')).toEqual(['gameCode', 'seat'])
  })

  // ⚠️ Two steps, not three. A name typed at the DM door would create a seat —
  // `players.join` is idempotent on the normalised name — so the door never asks,
  // and `useSeat` settles the seat question on arrival instead. See ADR 0003.
  test('a DM is asked for two codes and never for a name', () => {
    expect(stepsFor('dm')).toEqual(['gameCode', 'dmCode'])
    expect(stepsFor('dm')).not.toContain('seat')
  })
})

describe('nextStep', () => {
  test('walks each door to the end and then reports done', () => {
    expect(nextStep('player', 'gameCode')).toBe('seat')
    expect(nextStep('player', 'seat')).toBe('done')

    expect(nextStep('dm', 'gameCode')).toBe('dmCode')
    expect(nextStep('dm', 'dmCode')).toBe('done')
  })

  // Both doors take the same `StepKind`, so the compiler cannot stop a step from one
  // being asked about the other. `done` rather than `steps[0]`, because restarting
  // the conversation is a loop with no exit and nothing on screen to explain it —
  // and it commits nothing, since each step writes its own answer as it is answered.
  test('a step the door never asks ends the conversation rather than restarting it', () => {
    expect(nextStep('dm', 'seat')).toBe('done')
    expect(nextStep('player', 'dmCode')).toBe('done')
  })
})
