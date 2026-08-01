import { describe, expect, test } from 'vitest'

import {
  type DmCodeVerdict,
  currentStep,
  dmVerdictMessage,
  dmVerdictOf,
  isCompleteDmCode,
  nextStep,
  stepsFor,
  verdictMessage,
  verdictOf,
} from '@/lib/joinDoor'
import type { Id } from '@convex/_generated/dataModel'
import { DM_CODE_LENGTH } from '@convex/lib/codes'

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

/**
 * Names for the two games, and they are the two from the dead end that put the payload
 * on the `wrongGame` arm: a DM whose own game was not on the capped list clicked the one
 * row whose creator they recognised and pasted a perfectly good code into it.
 *
 * ⚠️ **`verdictOf` reads a name now, and every test below is arranged so that no
 * assertion can pass because of one.** The name goes in and comes back out on the
 * refusing arm; what must never happen is a name deciding anything, and the same-name
 * case is what pins that.
 */
const THIS_NAME = 'Gonz Game'
const ANOTHER_NAME = 'Test game'

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
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: ANOTHER_NAME },
      }),
    ).toEqual({ kind: 'wrongGame', opened: { code: OTHER_CODE, name: ANOTHER_NAME } })
  })

  /**
   * The payload on the refusal, which is the whole of what this arm gained: the refusal
   * was always correct and was a dead end anyway, because the one fact that resolves the
   * confusion — *which game does this code open, then?* — had already been fetched and was
   * being discarded.
   *
   * Both fields are asserted rather than only the name. The name is what the message
   * prints; the **code** is what the caller navigates with when somebody takes the escape
   * hatch, and it must be the server's spelling for the same reason `ok`'s is — so the
   * typed casing below is deliberately wrong and must not survive into the payload.
   */
  test('wrongGame carries the game the code actually opened, in the server’s spelling', () => {
    const verdict = verdictOf({
      typed: 'xyz789',
      expectedGameId: THIS_GAME,
      resolved: { _id: ANOTHER_GAME, code: 'XYZ789', name: ANOTHER_NAME },
    })

    expect(verdict).toEqual({ kind: 'wrongGame', opened: { code: 'XYZ789', name: ANOTHER_NAME } })
    // Stated separately, because `toEqual` on the whole verdict would pass just as well if
    // the arm handed back `typed` and the two happened to be equal.
    expect(verdict.kind === 'wrongGame' && verdict.opened.code).toBe('XYZ789')
  })

  // The payload names the game the **code** opened and never the row it was refused
  // against — the two are always different games here, so a payload built from the wrong
  // one would be the single most confusing thing this screen could say.
  test('the name carried is the resolved game’s, not the row’s', () => {
    const verdict = verdictOf({
      typed: OTHER_CODE,
      expectedGameId: THIS_GAME,
      resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: ANOTHER_NAME },
    })

    expect(verdict.kind === 'wrongGame' && verdict.opened.name).toBe(ANOTHER_NAME)
    expect(verdict.kind === 'wrongGame' && verdict.opened.name).not.toBe(THIS_NAME)
  })

  // ⚠️ The test that justifies comparing `_id` rather than the name. Nothing stops
  // two games sharing a title, and a name comparison would pass this: same name,
  // valid code, different game — somebody landing in a stranger's table that looked
  // exactly like the one they clicked.
  //
  // ⚠️ **This test used to argue that the mistake was unavailable because no name reached
  // `verdictOf` at all. That is no longer true, and the case matters more for it.** The
  // refusal carries a name now, so a name *is* an argument — it is simply never read by
  // the comparison. Both documents below are called *Tomb of the Coffee Lich*, on both
  // sides of every assertion, so every name in play is the identical string: the *only*
  // thing separating the refusal from the acceptance is the id. A comparison that reached
  // for the name it is now handed would fail the first assertion here, and this is the
  // one place in the suite where that reach is even possible.
  test('a code opening a different game with the SAME name is still refused', () => {
    const SHARED_NAME = 'Tomb of the Coffee Lich'

    // Refused, and the message it produces names *Tomb of the Coffee Lich* — the game the
    // code opens, which is a different game from the identically titled one on the row.
    // This is exactly the case where naming the game cannot help the reader, and it is
    // still the honest thing to print: the string is the string.
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: THIS_GAME,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: SHARED_NAME },
      }),
    ).toEqual({ kind: 'wrongGame', opened: { code: OTHER_CODE, name: SHARED_NAME } })

    // The positive control, so the refusal above cannot be passing because
    // *everything* is refused. Same code, same name, same resolved document — one id
    // changed.
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: ANOTHER_GAME,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: SHARED_NAME },
      }),
    ).toEqual({ kind: 'ok', code: OTHER_CODE })

    // ⚠️ **Both sides of the nullable switch, in the one test, because this is the
    // case a careless nullable breaks.** The identical arguments with `null` in place
    // of the row are *accepted*, and that is correct rather than a leak: with no row
    // nothing claimed which game this was, so there is no contradiction available. If
    // the two assertions above ever agree with this one, the wrong-game arm has been
    // skipped for the caller that must never skip it.
    expect(
      verdictOf({
        typed: OTHER_CODE,
        expectedGameId: null,
        resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: SHARED_NAME },
      }),
    ).toEqual({ kind: 'ok', code: OTHER_CODE })

    // And the sentence, in the case where a name-based message could mislead: it names the
    // game the *code* opens. There is no way to tell from the words that this is not the
    // row's own game — which is the cost of two games sharing a title, paid by the
    // refusal being an `_id` comparison so that nobody is ever *admitted* on the strength
    // of a shared name.
    expect(
      verdictMessage({ kind: 'wrongGame', opened: { code: OTHER_CODE, name: SHARED_NAME } }),
    ).toBe('That code opens Tomb of the Coffee Lich, not this game.')
  })

  test('the right code for the right game is ok', () => {
    expect(
      verdictOf({
        typed: CODE,
        expectedGameId: THIS_GAME,
        resolved: { _id: THIS_GAME, code: CODE, name: THIS_NAME },
      }),
    ).toEqual({ kind: 'ok', code: CODE })
  })

  // The verdict carries the server's spelling, not the one that was typed. They can
  // differ — `CodeInput` uppercases as you go, but the value that reaches storage
  // and the URL should be the server's, and this is what makes the typed one
  // unreachable from the result.
  //
  // The accepting arm carries **no name**, and the asymmetry with `wrongGame` is
  // deliberate rather than an omission: the caller that accepts already has the resolved
  // document in hand and reads the name off it directly, whereas the refusing arm is the
  // one whose whole point is that the caller was about to throw that document away.
  test('ok carries the server’s code, not the typed one', () => {
    expect(
      verdictOf({
        typed: 'abc234',
        expectedGameId: THIS_GAME,
        resolved: { _id: THIS_GAME, code: 'ABC234', name: THIS_NAME },
      }),
    ).toEqual({ kind: 'ok', code: 'ABC234' })
  })

  /**
   * The *Join with a code* card, which has no row to compare against — see the ⚠️ in
   * `verdictOf` on why that is a legitimate state and not a bypass.
   *
   * The point of asserting the other three arms here as well as the accepting one is
   * that `null` must weaken *exactly* the id comparison and nothing else. A nullable
   * written as an early `return { kind: 'ok' }` would pass the first test below and
   * turn a mistyped six-character code into a navigation to a game that does not
   * exist — which is the failure the code step was built to keep off the game screen.
   */
  describe('with no row behind the code', () => {
    test('any game the code opens is the right game', () => {
      // The same resolved document that is refused against `THIS_GAME` above.
      expect(
        verdictOf({
          typed: OTHER_CODE,
          expectedGameId: null,
          resolved: { _id: ANOTHER_GAME, code: OTHER_CODE, name: ANOTHER_NAME },
        }),
      ).toEqual({ kind: 'ok', code: OTHER_CODE })

      // And still the server's spelling rather than the typed one, since that is what
      // reaches `localStorage` and the URL from here.
      expect(
        verdictOf({
          typed: 'abc234',
          expectedGameId: null,
          resolved: { _id: THIS_GAME, code: 'ABC234', name: THIS_NAME },
        }),
      ).toEqual({ kind: 'ok', code: 'ABC234' })
    })

    test('a complete code that resolves to nothing is still no such game', () => {
      expect(verdictOf({ typed: CODE, expectedGameId: null, resolved: null })).toEqual({
        kind: 'noSuchGame',
      })
    })

    test('a lookup still out is still checking, and a half-typed code still incomplete', () => {
      expect(verdictOf({ typed: CODE, expectedGameId: null, resolved: undefined })).toEqual({
        kind: 'checking',
      })
      expect(verdictOf({ typed: 'ABC', expectedGameId: null, resolved: undefined })).toEqual({
        kind: 'incomplete',
      })
    })

    // The arm that cannot be reached without a row, stated as an absence: there is no
    // combination of arguments that produces it, because the only thing that can
    // contradict a resolved game is a row saying it should have been a different one.
    //
    // This is also what pins the escape hatch as *not a new flow*. Taking it continues
    // with the code and no row, which is this state — so the path somebody lands on after
    // being refused is the same path the *Join with a code* card has always used, and it
    // has no wrong-game arm to be refused by a second time.
    test('never answers wrongGame', () => {
      const resolvedShapes = [
        undefined,
        null,
        { _id: THIS_GAME, code: CODE, name: THIS_NAME },
        { _id: ANOTHER_GAME, code: OTHER_CODE, name: ANOTHER_NAME },
      ]

      for (const resolved of resolvedShapes) {
        for (const typed of ['', 'ABC', CODE, OTHER_CODE]) {
          expect(verdictOf({ typed, expectedGameId: null, resolved }).kind).not.toBe('wrongGame')
        }
      }
    })
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
    expect(
      verdictMessage({ kind: 'wrongGame', opened: { code: OTHER_CODE, name: ANOTHER_NAME } }),
    ).toBe('That code opens Test game, not this game.')
  })

  /**
   * ⚠️ **The wrong-game sentence names the game, and this is where that wording is
   * pinned.** What it replaced — *That code is not for this game* — was a correct refusal
   * and a dead end: it stated the one thing that was not true and nothing that was, while
   * the name of the game the code opens was already in the component's hands. The
   * assertion is on the whole sentence rather than on a substring, because "contains the
   * name" would pass for a sentence that named it and still said nothing useful.
   */
  test('the wrong-game sentence names the game the code opens', () => {
    expect(
      verdictMessage({ kind: 'wrongGame', opened: { code: OTHER_CODE, name: ANOTHER_NAME } }),
    ).toBe('That code opens Test game, not this game.')

    // A different game gives a different sentence, so the name is genuinely read from the
    // payload rather than being a constant that happens to match one fixture.
    expect(verdictMessage({ kind: 'wrongGame', opened: { code: CODE, name: THIS_NAME } })).toBe(
      'That code opens Gonz Game, not this game.',
    )
  })
})

/** Eight characters, which is what `CodeInput` caps the DM field at. */
const DM_CODE = 'ABCD2345'

describe('dmVerdictOf', () => {
  test('a half-typed code is incomplete, not a lookup in flight', () => {
    // The same trap `verdictOf`'s first test covers, and the reason this function
    // exists: the caller skips `checkDmCode` while the field is short, so `verified`
    // is undefined then for a completely different reason than while a real lookup is
    // out. The order of the tests inside `dmVerdictOf` is all that keeps them apart,
    // and getting it wrong puts "Checking that code…" under a field nobody has
    // finished typing into.
    expect(dmVerdictOf({ typed: '', verified: undefined })).toEqual({ kind: 'incomplete' })
    expect(dmVerdictOf({ typed: 'ABCD', verified: undefined })).toEqual({ kind: 'incomplete' })
  })

  // The field is capped at eight by `CodeInput`, so this is unreachable through the
  // UI — and it is the arm that would be wrong if the length test were ever written
  // as `>=` or as `length > 0`.
  test('an over-long code is incomplete too', () => {
    expect(dmVerdictOf({ typed: `${DM_CODE}9`, verified: undefined })).toEqual({
      kind: 'incomplete',
    })
  })

  test('a complete code with the lookup still out is checking', () => {
    expect(dmVerdictOf({ typed: DM_CODE, verified: undefined })).toEqual({ kind: 'checking' })
  })

  test('the server’s verdict is passed through both ways', () => {
    expect(dmVerdictOf({ typed: DM_CODE, verified: true })).toEqual({ kind: 'ok' })
    expect(dmVerdictOf({ typed: DM_CODE, verified: false })).toEqual({ kind: 'wrongCode' })
  })

  // ⚠️ `ok` carries nothing, and that is `checkDmCode`'s own decision restated: a
  // `true` authorises nothing and expires as it is read, because every DM-only call
  // re-verifies the code server-side (invariant 7). A verdict with a payload is one
  // refactor from being treated as proof.
  test('ok carries no payload at all', () => {
    expect(Object.keys(dmVerdictOf({ typed: DM_CODE, verified: true }))).toEqual(['kind'])
  })
})

describe('isCompleteDmCode', () => {
  // Shared with `dmVerdictOf` so the caller's `'skip'` and the "checking" line cannot
  // disagree about whether a request was made. Asserted against the constant rather
  // than against the number eight.
  test('is exactly the length the server’s code has', () => {
    expect(isCompleteDmCode('A'.repeat(DM_CODE_LENGTH))).toBe(true)
    expect(isCompleteDmCode('A'.repeat(DM_CODE_LENGTH - 1))).toBe(false)
    expect(isCompleteDmCode('A'.repeat(DM_CODE_LENGTH + 1))).toBe(false)
    expect(isCompleteDmCode('')).toBe(false)
  })
})

describe('dmVerdictMessage', () => {
  // All four, and never null — unlike `verdictMessage`. The unfinished state says
  // where to find an eight-character code, and the success state reports the
  // consequence the person cannot otherwise see: that the code is about to be written
  // into this browser.
  test('every state has a sentence, including the two that are not failures', () => {
    expect(dmVerdictMessage({ kind: 'incomplete' })).toBe(
      'The code shown when the game was created.',
    )
    expect(dmVerdictMessage({ kind: 'ok' })).toBe(
      'That is your game. This browser will remember the code.',
    )
    expect(dmVerdictMessage({ kind: 'wrongCode' })).toBe(
      'That DM code is not right for this game.',
    )
  })

  // ⚠️ The one both doors say, and it is one constant behind both of them. Asserted
  // against `verdictMessage`'s rather than against a literal, so a reword of either
  // cannot leave the two fields on this screen describing the same wait two ways.
  test('waits with the same words the join code field waits with', () => {
    expect(dmVerdictMessage({ kind: 'checking' })).toBe(verdictMessage({ kind: 'checking' }))
  })

  test('has something to say for every arm of the union', () => {
    const kinds: DmCodeVerdict[] = [
      { kind: 'incomplete' },
      { kind: 'checking' },
      { kind: 'ok' },
      { kind: 'wrongCode' },
    ]
    for (const verdict of kinds) expect(dmVerdictMessage(verdict)).toBeTruthy()
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

describe('currentStep', () => {
  test('renders the stored step once a code has resolved', () => {
    expect(currentStep({ door: 'dm', stored: 'dmCode', hasCode: true })).toBe('dmCode')
    expect(currentStep({ door: 'player', stored: 'seat', hasCode: true })).toBe('seat')
    expect(currentStep({ door: 'player', stored: 'gameCode', hasCode: true })).toBe('gameCode')
  })

  // Both later steps are about a *specific game* — one subscribes `checkDmCode` with
  // its code, the other subscribes that game's roster — so neither has anything to say
  // until the first step has answered. This is what stops a subscription being opened
  // for a game that does not exist.
  test('asks for the code first whatever is stored, until one has resolved', () => {
    expect(currentStep({ door: 'dm', stored: 'dmCode', hasCode: false })).toBe('gameCode')
    expect(currentStep({ door: 'player', stored: 'seat', hasCode: false })).toBe('gameCode')
  })

  // ⚠️ The arm that used to disagree with `nextStep`. Both doors take the same
  // `StepKind`, so the compiler cannot stop one door being asked about the other's
  // step, and this half of the question had two answers in two places — `'done'` in
  // the tested module, "start again" in the dialog's JSX. There is only one now, and it
  // is not `'done'`: this function has to name a question to *render*, and `'done'` is
  // not a question. Restarting commits nothing, because a rendered field has written
  // nothing down.
  test('a step this door does not ask falls back to its first one', () => {
    expect(currentStep({ door: 'dm', stored: 'seat', hasCode: true })).toBe('gameCode')
    expect(currentStep({ door: 'player', stored: 'dmCode', hasCode: true })).toBe('gameCode')
  })

  // Whatever it answers is a step that door actually asks — the property the two arms
  // above exist to produce, stated once over every combination there is.
  test('never answers with a step outside the door it was asked about', () => {
    const doors = ['player', 'dm'] as const
    const steps = ['gameCode', 'dmCode', 'seat'] as const

    for (const door of doors) {
      for (const stored of steps) {
        for (const hasCode of [true, false]) {
          expect(stepsFor(door)).toContain(currentStep({ door, stored, hasCode }))
        }
      }
    }
  })
})
