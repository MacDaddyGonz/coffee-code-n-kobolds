import { describe, expect, test } from 'vitest'

import { diceNotation, isShowable } from './notation'

describe('diceNotation', () => {
  test('nothing to roll produces no notation at all', () => {
    // A passive ability announces itself and rolls nothing. The caller should be able
    // to hand that straight in without a length test of its own, and must not get
    // `['']` back — the engine treats an empty notation as an error.
    expect(diceNotation([])).toEqual([])
  })

  test('a single die', () => {
    expect(diceNotation([{ faces: 20, value: 17 }])).toEqual(['1d20@17'])
  })

  test('two dice of one kind become one string, values in order', () => {
    // Advantage. The order matters on screen only in that the feed prints the same two
    // numbers; it matters here because reversing it would be invisible in a test that
    // only counted dice.
    expect(
      diceNotation([
        { faces: 20, value: 18 },
        { faces: 20, value: 4 },
      ]),
    ).toEqual(['2d20@18,4'])
  })

  test('mixed face counts are grouped, one string each', () => {
    expect(
      diceNotation([
        { faces: 6, value: 3 },
        { faces: 6, value: 5 },
        { faces: 8, value: 2 },
      ]),
    ).toEqual(['2d6@3,5', '1d8@2'])
  })

  test('groups are in order of first appearance, not ascending faces', () => {
    expect(
      diceNotation([
        { faces: 8, value: 2 },
        { faces: 6, value: 3 },
      ]),
    ).toEqual(['1d8@2', '1d6@3'])
  })

  test('the same face count appearing in two runs is still one group', () => {
    // The failure this pins is a `d6, d8, d6` roll producing three groups — which the
    // engine would render as three separate throws with the middle one out of order.
    expect(
      diceNotation([
        { faces: 6, value: 1 },
        { faces: 8, value: 7 },
        { faces: 6, value: 6 },
      ]),
    ).toEqual(['2d6@1,6', '1d8@7'])
  })

  test('every die D&D Lite rolls survives the round trip', () => {
    expect(
      diceNotation([
        { faces: 4, value: 4 },
        { faces: 6, value: 6 },
        { faces: 8, value: 8 },
        { faces: 10, value: 10 },
        { faces: 12, value: 12 },
        { faces: 20, value: 20 },
        { faces: 100, value: 100 },
      ]),
    ).toEqual(['1d4@4', '1d6@6', '1d8@8', '1d10@10', '1d12@12', '1d20@20', '1d100@100'])
  })

  test('a face count the engine cannot render is dropped, and the rest still rolls', () => {
    // A d3 exists in the engine as a novelty die and a d7 does not exist at all.
    // Neither is a die this app produces, and neither may take the feed line down with
    // it — the number is in the feed regardless, and the dice are the flourish.
    expect(
      diceNotation([
        { faces: 7, value: 5 },
        { faces: 6, value: 2 },
      ]),
    ).toEqual(['1d6@2'])
  })

  test('a roll made entirely of unrenderable dice produces no notation rather than throwing', () => {
    expect(diceNotation([{ faces: 7, value: 5 }])).toEqual([])
  })

  test('a value outside the die is dropped rather than shown wrong', () => {
    // `swapDiceFace` looks the wanted value up with `values.indexOf` and returns
    // silently when that misses, leaving the die showing whatever the physics rolled.
    // So a 25 on a d20 would be a die contradicting the feed, which is worse than a
    // die that does not appear.
    expect(diceNotation([{ faces: 20, value: 25 }])).toEqual([])
    expect(diceNotation([{ faces: 20, value: 0 }])).toEqual([])
    expect(diceNotation([{ faces: 6, value: 3.5 }])).toEqual([])
  })

  test("the engine's d100 is a tens die, so only multiples of ten can be shown on it", () => {
    expect(diceNotation([{ faces: 100, value: 40 }])).toEqual(['1d100@40'])
    expect(diceNotation([{ faces: 100, value: 47 }])).toEqual([])
    expect(diceNotation([{ faces: 100, value: 5 }])).toEqual([])
  })

  test('no modifier ever reaches the notation', () => {
    // There is nowhere in `ShownDie` to put one, which is the guard. This asserts the
    // consequence a reader would want to see stated: what comes out is faces and
    // values, so the engine's own `total` and `modifier` fields are never load-bearing
    // and the browser never adds anything up.
    for (const notation of diceNotation([
        { faces: 20, value: 11 },
        { faces: 6, value: 4 },
      ])) {
      expect(notation).toMatch(/^\d+d\d+@[\d,]+$/)
    }
  })
})

describe('isShowable', () => {
  test('answers the same question the notation asks', () => {
    expect(isShowable({ faces: 20, value: 1 })).toBe(true)
    expect(isShowable({ faces: 20, value: 21 })).toBe(false)
    expect(isShowable({ faces: 3, value: 2 })).toBe(false)
  })
})
