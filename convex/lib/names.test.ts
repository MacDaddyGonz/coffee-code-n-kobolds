import { describe, expect, test } from 'vitest'

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_SCENE_NAME_LENGTH,
  MAX_SCENE_NOTES_LENGTH,
  hasLoneSurrogate,
} from './codes'
import {
  duplicateBase,
  duplicateNames,
  duplicateNamesProblem,
  highestNumbered,
  requireSceneNotes,
  sceneCopyName,
} from './names'

/**
 * THE NAMING RULE BEHIND *DUPLICATE* AND *ADD FIVE OF THESE*.
 *
 * Everything here is pure: no harness, no fixture, no deployment. That is the property
 * under test as much as any single answer — the dialog renders a live preview from
 * `duplicateNames` and `board.duplicateToken` writes from the same call, so a rule that
 * needed a `ctx` would be two rules within a milestone.
 *
 * The suite is written against the three sentences in the roadmap rather than against the
 * implementation, because the two functions that could drift — what a *base* is and what
 * counts towards *n* — share one regular expression precisely so they cannot. If that
 * sharing is ever unpicked, the cases about seven digits and about `Goblin 3 4` are the
 * ones that fail.
 */

describe('the base a copy continues from', () => {
  test('a name with no trailing number is its own base', () => {
    expect(duplicateBase('Goblin')).toBe('Goblin')
  })

  test('one trailing number comes off, so duplicating the third goblin continues the goblins', () => {
    // The whole reason a base exists. Without it, duplicating `Goblin 3` starts a run of
    // `Goblin 3 1`, `Goblin 3 2` beside the goblins it was copied from.
    expect(duplicateBase('Goblin 3')).toBe('Goblin')
  })

  test('exactly one group comes off and not every trailing number', () => {
    // A DM on their fourth `Goblin 3` meant that. Stripping greedily would fold two runs
    // the board shows as separate into one, and no later function could tell them apart.
    expect(duplicateBase('Goblin 3 4')).toBe('Goblin 3')
  })

  test('whitespace is collapsed before the number is looked for', () => {
    // A trailing space is not part of any name this app stores, and a base carrying one
    // would go on to produce `Goblin  4` with two spaces in it.
    expect(duplicateBase('Goblin 3  ')).toBe('Goblin')
    expect(duplicateBase('  Goblin   3 ')).toBe('Goblin')
  })

  test('a seven-digit trailing group is part of the name and not a sequence number', () => {
    // The cap decides what a sequence number *is*, and it keeps `Longsword 1000000` called
    // what the DM called it. Six digits is the last number that is one.
    expect(duplicateBase('Longsword 1000000')).toBe('Longsword 1000000')
    expect(duplicateBase('Longsword 999999')).toBe('Longsword')
  })

  test('a name that is only digits is its own base', () => {
    // Nothing precedes the digits, so there is no name to number. The `\S` in the pattern
    // is what makes this true rather than yielding a nameless creature numbered three.
    expect(duplicateBase('12')).toBe('12')
    expect(duplicateBase(' 3 ')).toBe('3')
  })

  test('digits on both sides of the space split like any other name', () => {
    // Not a special case, and asserted so nobody adds one: `1 2` is a base of `1` numbered
    // 2, exactly as `Goblin 2` is. A rule that treated all-digit names specially would need
    // to say where the line is, and there isn't one.
    expect(duplicateBase('1 2')).toBe('1')
  })
})

describe('the highest number already in use', () => {
  test('nothing matching at all is nothing', () => {
    expect(highestNumbered('Goblin', [])).toBe(0)
    expect(highestNumbered('Goblin', ['Kobold', 'Kobold 4'])).toBe(0)
  })

  test('a bare base counts as one, so the next goblin is the second', () => {
    expect(highestNumbered('Goblin', ['Goblin'])).toBe(1)
  })

  test('a numbered name counts as its number', () => {
    expect(highestNumbered('Goblin', ['Goblin 7'])).toBe(7)
  })

  test('it is the highest and never the first free, so gaps are not filled', () => {
    // Reusing the number of a goblin the DM has just deleted puts a dead creature's name on
    // a live one mid-fight. The initiative order is the last place to have to work out
    // which `Goblin 3` is which.
    expect(highestNumbered('Goblin', ['Goblin 1', 'Goblin 5'])).toBe(5)
  })

  test('matching is exact, so a longer name that merely starts the same contributes nothing', () => {
    expect(highestNumbered('Goblin', ['Goblin King 4', 'Goblinoid 2', 'Goblins 9'])).toBe(0)
  })

  test('matching is case-sensitive, which is where a coin differs from a seat', () => {
    // `nameKeyFor` is forgiving about case because `Mike` and `mike` are one person
    // rejoining. A DM who typed `goblin 3` beside `Goblin 3` was distinguishing two
    // creatures, and renumbering across that merges two runs they can see are separate.
    expect(highestNumbered('Goblin', ['goblin 9', 'goblin'])).toBe(0)
    expect(highestNumbered('goblin', ['Goblin 9', 'goblin 2'])).toBe(2)
  })

  test('a trailing group too long to be a sequence number is not counted as one', () => {
    // The pair with the `duplicateBase` case above, and the reason both functions read one
    // pattern: a name this declined to strip must not come back as a number to count past.
    expect(highestNumbered('Longsword', ['Longsword 1000000'])).toBe(0)
  })

  test('names are collapsed before they are matched, and so is the base', () => {
    expect(highestNumbered('Goblin', ['Goblin  4 '])).toBe(4)
    expect(highestNumbered(' Goblin ', ['Goblin 4'])).toBe(4)
  })

  test('a padded number is the number it reads as', () => {
    // Nobody types this, but `Number` is the parser and it is worth pinning what it does
    // rather than discovering it the first time a DM pastes a name in.
    expect(highestNumbered('Goblin', ['Goblin 007'])).toBe(7)
  })
})

describe('the names N new coins take', () => {
  test('one coin, nothing numbered: the suffix is skipped entirely', () => {
    // The roadmap says so outright — adding a single `Goblin` gets `Goblin`, not the lonely
    // `Goblin 1` that reads like the app expecting four more.
    expect(duplicateNames('Goblin', [], 1)).toEqual(['Goblin'])
  })

  test('three from scratch are Goblin 1 to Goblin 3, which is the acceptance line', () => {
    // `existingNames` does not contain the source: the add dialog passes the name it is
    // *about* to create, so nothing called `Goblin` is on the board yet, `n` is 0, and the
    // run starts where the roadmap says one press produces `Goblin 1 … Goblin 5`.
    expect(duplicateNames('Goblin', [], 3)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3'])
  })

  test('duplicating an existing Goblin four times starts at two, because the source is never renamed', () => {
    // The other half of the pair above, and the one that looks wrong until the reason is
    // said out loud: a bare base counts as 1, so the copies continue past the coin that is
    // already standing there. Renaming the source to `Goblin 1` to make the two cases match
    // is a write to a coin the DM did not ask to change.
    expect(duplicateNames('Goblin', ['Goblin'], 4)).toEqual([
      'Goblin 2',
      'Goblin 3',
      'Goblin 4',
      'Goblin 5',
    ])
  })

  test('the source keeps its own name, whatever the copies are called', () => {
    // Stated as its own assertion because it is a rule about the *write* that this pure
    // function is the only expression of: no output may collide with the coin that was
    // copied, or the DM ends up with two `Goblin 3`s and no way to tell them apart.
    expect(duplicateNames('Goblin 3', ['Goblin', 'Goblin 3'], 2)).not.toContain('Goblin 3')
  })

  test('duplicating Goblin 3 beside Goblin, Goblin 3 and Goblin 7 gives Goblin 8', () => {
    // Every rule at once: the base drops the 3, the bare `Goblin` counts as 1, `Goblin 7`
    // wins, and the skip does not apply because something matching the base is numbered.
    expect(duplicateNames('Goblin 3', ['Goblin', 'Goblin 3', 'Goblin 7'], 1)).toEqual(['Goblin 8'])
  })

  test('a gap in the run is not filled', () => {
    expect(duplicateNames('Goblin 1', ['Goblin 1', 'Goblin 5'], 1)).toEqual(['Goblin 6'])
  })

  test('a differently-cased run is a different run all the way through', () => {
    // The end-to-end version of the case-sensitivity rule: `goblin` continues the goblins
    // the DM spelled that way and leaves the capitalised ones alone.
    expect(duplicateNames('goblin 3', ['Goblin', 'Goblin 9', 'goblin 3'], 1)).toEqual(['goblin 4'])
  })

  test('the skip turns on whether the base is on the board at all, bare or numbered', () => {
    // ⚠️ **The two acts the one function serves, and the assertion that keeps them apart.**
    // The roadmap's sentence says the skip applies when "nothing is numbered yet", which is
    // a narrower question and a wrong one: under it, duplicating a lone `Goblin` would give
    // a second coin *also called `Goblin`*, and pressing again a third, because nothing ever
    // becomes numbered. Asking whether the base is used at all agrees with the roadmap on
    // the case it describes and fixes the case it did not consider.
    //
    // The add dialog passes a name it is about to create; the duplicate control passes one
    // already standing there. That is the whole difference, and it is what these two lines
    // are.
    expect(duplicateNames('Goblin', [], 1)).toEqual(['Goblin'])
    expect(duplicateNames('Goblin', ['Goblin'], 1)).toEqual(['Goblin 2'])

    // The skip is only ever about a single coin: five from scratch are still numbered, or
    // the DM would get one `Goblin` and four `Goblin 2…5`.
    expect(duplicateNames('Goblin', [], 5)).toEqual([
      'Goblin 1',
      'Goblin 2',
      'Goblin 3',
      'Goblin 4',
      'Goblin 5',
    ])
    // And one numbered coin anywhere is enough to end the skip, even at a count of one.
    expect(duplicateNames('Goblin', ['Goblin 1'], 1)).toEqual(['Goblin 2'])
  })

  /**
   * The property the rule above exists for, stated as a property rather than as an example:
   * a copy is never given a name that is already on the board. Nothing else in the batch
   * catches a skip rule that has drifted, because every other test asserts one exact list.
   */
  test('no name it produces is already in use, however many times it is pressed', () => {
    const board = ['Goblin']
    for (let press = 0; press < 6; press += 1) {
      const made = duplicateNames('Goblin', board, 1)
      expect(board).not.toContain(made[0])
      board.push(...made)
    }
    expect(new Set(board).size).toBe(board.length)
    expect(board).toEqual(['Goblin', 'Goblin 2', 'Goblin 3', 'Goblin 4', 'Goblin 5', 'Goblin 6', 'Goblin 7'])
  })

  test('a seven-digit name is duplicated as itself plus a number', () => {
    // The cap seen from the outside: the long number is part of the name, so the copies
    // number the whole thing rather than counting past a million.
    expect(duplicateNames('Longsword 1000000', ['Longsword 1000000'], 2)).toEqual([
      'Longsword 1000000 2',
      'Longsword 1000000 3',
    ])
  })

  test('it is total: no count and no name can make it throw', () => {
    // The contract the preview depends on. The stepper calls this on every press, including
    // the frame where a controlled input is empty or a DM has cleared the number, and a
    // dialog that throws on a keystroke is worse than one that shows nothing.
    expect(duplicateNames('Goblin', ['Goblin'], 0)).toEqual([])
    expect(duplicateNames('Goblin', ['Goblin'], -3)).toEqual([])
    // A blank name yields a blank base rather than an error; `requireCharacterName` in the
    // mutation is what refuses it, and it is the only thing that should.
    expect(duplicateNames('   ', [], 1)).toEqual([''])
  })

  test('the count is exactly the number asked for, and the numbers are consecutive', () => {
    // A cap belongs to the mutation, not here — a preview has to render whatever the
    // control currently says, including a number the write is about to refuse.
    const names = duplicateNames('Goblin', ['Goblin 40'], 12)
    expect(names).toHaveLength(12)
    expect(names[0]).toBe('Goblin 41')
    expect(names.at(-1)).toBe('Goblin 52')
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('over-length names are refused rather than cut', () => {
  /** As long as a stored name may be — the boundary is inclusive on both sides. */
  const atTheLimit = 'G'.repeat(MAX_CHARACTER_NAME_LENGTH)

  test('ordinary names are no problem', () => {
    expect(duplicateNamesProblem(['Goblin 2', 'Goblin 3'])).toBeNull()
    expect(duplicateNamesProblem([])).toBeNull()
  })

  test('a name exactly at the limit passes and one character more does not', () => {
    expect(duplicateNamesProblem([atTheLimit])).toBeNull()
    expect(duplicateNamesProblem([`${atTheLimit}G`])).not.toBeNull()
  })

  test('one bad name in a batch refuses the batch', () => {
    // Copies arrive together or not at all, so the refusal is about the batch. Numbering is
    // also where a batch straddles the limit: `Goblin 9` fits and `Goblin 10` does not.
    expect(duplicateNamesProblem(['Goblin 9', `${atTheLimit} 10`])).not.toBeNull()
  })

  test('the sentence names the fix rather than stating the limit and stopping', () => {
    // *That name is too long* is a dead end when the name the DM is looking at fits
    // perfectly well and it is the number the app added that does not.
    const problem = duplicateNamesProblem([`${atTheLimit} 2`])
    expect(problem).toContain(String(MAX_CHARACTER_NAME_LENGTH))
    expect(problem).toMatch(/shorter/i)
  })

  test('a source at the limit copies once and cannot be numbered — the case that matters', () => {
    // ⚠️ The two halves of this milestone's refusal disagree about the same name, which is
    // why the check is on the *result* and never on the source. The single unnumbered copy
    // is exactly the name that is already stored, so it fits by construction; the moment a
    // suffix is added, every name in the batch is two characters over and the DM has to be
    // told to shorten the coin rather than being handed a truncated one.
    expect(duplicateNamesProblem(duplicateNames(atTheLimit, [], 1))).toBeNull()
    expect(duplicateNamesProblem(duplicateNames(atTheLimit, [atTheLimit], 3))).not.toBeNull()
  })

  test('length is counted in UTF-16 units, which is what makes truncating unsafe', () => {
    // The same measure `requireText` uses and the same one the name field's `maxLength`
    // applies, so all three agree on where the limit is. Twenty dragons are forty units and
    // fit; twenty-one are forty-two and do not — and cutting them back to forty would leave
    // half a dragon, which is the Milestone 1 bug convex-test cannot see and a real
    // deployment rejects. Refusing is the whole point.
    const dragons = Math.floor(MAX_CHARACTER_NAME_LENGTH / 2)
    expect(duplicateNamesProblem(['🐉'.repeat(dragons)])).toBeNull()
    expect(duplicateNamesProblem(['🐉'.repeat(dragons + 1)])).not.toBeNull()
  })
})

/**
 * THE MAP-SHAPED HALVES OF THIS MODULE, WHICH BORROW NEITHER OF THE COIN RULES ABOVE.
 *
 * Both are pure for a different reason from `duplicateNames`': nothing renders a preview of
 * either, and they are here because this file is where a refusal about a name lives. What
 * they share with everything above is the unit — UTF-16 `.length`, which is what the
 * textarea's `maxLength` and Convex's own validation both count in.
 */
describe('the DM’s notes for a map', () => {
  test('a blank is legal, and is how notes are cleared', () => {
    // Unlike every `require…Name` above, which refuses one. A nameless row is unusable in a
    // list; a note nobody has written is the ordinary state of a map.
    expect(requireSceneNotes('')).toBe('')
    expect(requireSceneNotes('   \n  ')).toBe('')
  })

  test('the ends are trimmed and the middle is not collapsed', () => {
    // ⚠️ The difference from `requireText` that matters most. `collapseWhitespace` would
    // turn this into one line, and prose written in paragraphs is the whole of what the
    // field is for.
    expect(requireSceneNotes('  Two rooms.\n\nThe second is trapped.  ')).toBe(
      'Two rooms.\n\nThe second is trapped.',
    )
  })

  test('refuses past the limit rather than truncating, and counts UTF-16 units', () => {
    expect(requireSceneNotes('x'.repeat(MAX_SCENE_NOTES_LENGTH))).toHaveLength(
      MAX_SCENE_NOTES_LENGTH,
    )
    expect(() => requireSceneNotes('x'.repeat(MAX_SCENE_NOTES_LENGTH + 1))).toThrow()
    // Half the dragons, because each is two code units — the same measure the field applies.
    const dragons = Math.floor(MAX_SCENE_NOTES_LENGTH / 2)
    expect(requireSceneNotes('🐉'.repeat(dragons))).toHaveLength(MAX_SCENE_NOTES_LENGTH)
    expect(() => requireSceneNotes('🐉'.repeat(dragons + 1))).toThrow()
  })
})

describe('what a copy of a map is called', () => {
  test('a short name simply gains the suffix', () => {
    expect(sceneCopyName('Cellar')).toBe('Cellar (copy)')
  })

  test('a trailing number is kept, unlike a coin’s', () => {
    // ⚠️ The deliberate divergence from `duplicateBase` above. A DM with `Cellar 2` wants
    // `Cellar 2 (copy)` and not `Cellar 3`; a numbered run of maps is not a thing the scene
    // picker has, and borrowing the coin rule would silently rename the copy.
    expect(sceneCopyName('Cellar 2')).toBe('Cellar 2 (copy)')
  })

  test('a long name is cut to fit and still ends in the suffix', () => {
    const long = 'a'.repeat(MAX_SCENE_NAME_LENGTH)
    const copy = sceneCopyName(long)
    expect(copy).toHaveLength(MAX_SCENE_NAME_LENGTH)
    expect(copy.endsWith(' (copy)')).toBe(true)
    // The suffix's budget is reserved *before* the cut. Truncating the whole result instead
    // would take the suffix off and produce a second map called almost what the first is.
    expect(copy.startsWith('a'.repeat(MAX_SCENE_NAME_LENGTH - ' (copy)'.length))).toBe(true)
  })

  test('the cut never splits an emoji — the Milestone 1 bug, third occurrence', () => {
    // The app supplies the over-long part here, so no field's `maxLength` could have caught
    // it. A `slice` at this boundary leaves a lone surrogate that `requireSceneName` accepts
    // — it is neither blank nor over-length — and that a real deployment then refuses.
    for (let dragons = 1; dragons <= 6; dragons += 1) {
      const name = `${'a'.repeat(MAX_SCENE_NAME_LENGTH - 8)}${'🐉'.repeat(dragons)}`
      const copy = sceneCopyName(name)
      expect(copy.length).toBeLessThanOrEqual(MAX_SCENE_NAME_LENGTH)
      expect(hasLoneSurrogate(copy), `${dragons} dragons produced half a dragon`).toBe(false)
      expect(copy.endsWith(' (copy)')).toBe(true)
    }
  })
})
