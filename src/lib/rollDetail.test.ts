import { describe, expect, it } from 'vitest'

import { entryCaptions, spellLevelLabel } from '@/lib/rollDetail'
import type { FeedSubject } from '@convex/lib/roll'
import { SHEET_ENTRY_CATEGORIES, SHEET_ENTRY_CATEGORY_LABELS } from '@convex/lib/sheet'

function entry(overrides: Partial<Extract<FeedSubject, { kind: 'entry' }>> = {}): FeedSubject {
  return {
    kind: 'entry',
    part: 'roll',
    name: 'Cure Wounds',
    category: 'action',
    level: 1,
    text: null,
    ...overrides,
  }
}

describe('spellLevelLabel', () => {
  it('tells a cantrip apart from a thing that is not a spell', () => {
    // `0` is *a spell, and it is free*; `null` is *not a spell*. `rollSentence` on the server
    // makes the same distinction in the other direction — it says "casts" for anything with
    // a level and "uses" for anything without one.
    expect(spellLevelLabel(0)).toBe('Cantrip')
    expect(spellLevelLabel(null)).toBeNull()
  })

  it('names the level for a levelled spell', () => {
    expect(spellLevelLabel(3)).toBe('Level 3 spell')
  })
})

describe('entryCaptions', () => {
  it('is empty for every subject that is not a sheet entry', () => {
    // The five other shapes describe themselves entirely through `rollSentence`, so a
    // caption under them would be a second sentence saying less.
    const others: FeedSubject[] = [
      { kind: 'check', ability: 'str' },
      { kind: 'save', ability: 'dex' },
      { kind: 'skill', skill: 'stealth' },
      { kind: 'initiative' },
      { kind: 'dice' },
    ]
    for (const subject of others) expect(entryCaptions(subject), subject.kind).toEqual([])
  })

  it('names the level first and the category second', () => {
    // The level is the more specific of the two, and a reader scanning a busy feed is
    // looking for which slot went rather than for the fact that it was an action.
    expect(entryCaptions(entry({ level: 2 }))).toEqual(['Level 2 spell', 'Action'])
  })

  it('names the category alone for anything that is not a spell', () => {
    expect(entryCaptions(entry({ level: null, category: 'weapon' }))).toEqual(['Weapon'])
  })

  it('captions an alt-clicked description too', () => {
    // The part is what changed, not what was pressed: "Weapon" under "Chadius describes
    // their Greatsword" is the same true sentence it is under a damage roll.
    expect(entryCaptions(entry({ part: 'text', level: null, category: 'weapon' }))).toEqual([
      'Weapon',
    ])
  })

  it('has a caption for every category the union admits', () => {
    // The direction the compiler cannot see from here: `FEED_CATEGORY_LABELS` is a `Record`
    // so a fourth *member* fails to build, but a member whose label was left blank would
    // print an empty chip on every row carrying it.
    for (const category of SHEET_ENTRY_CATEGORIES) {
      const captions = entryCaptions(entry({ category, level: null }))
      expect(captions, category).toHaveLength(1)
      expect(captions[0], category).toBeTruthy()
    }
  })

  it('captions one entry in the singular, not with the sheet section heading', () => {
    // ⚠️ `SHEET_ENTRY_CATEGORY_LABELS` in lib/sheet.ts is `Weapons`/`Actions`/`Passives` —
    // headings over a list. A feed row about one greataxe captioned `Weapons` reads as a
    // category of things rather than as what this one was, which is the whole reason
    // `FEED_CATEGORY_LABELS` exists beside it.
    for (const category of SHEET_ENTRY_CATEGORIES) {
      const [caption] = entryCaptions(entry({ category, level: null }))
      expect(caption, category).not.toBe(SHEET_ENTRY_CATEGORY_LABELS[category])
      expect(caption?.endsWith('s'), category).toBe(false)
    }
  })
})
