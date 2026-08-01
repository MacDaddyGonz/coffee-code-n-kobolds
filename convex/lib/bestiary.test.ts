import { describe, expect, test } from 'vitest'

import {
  BESTIARY,
  BESTIARY_FILES,
  BESTIARY_KEY_COUNT,
  bestiaryEntry,
  type BestiaryCategory,
  type BestiaryCombat,
  type BestiaryEntry,
} from './bestiary'
import { CR_BENCHMARKS, benchmarkFor, type CrBenchmark } from './bestiary/benchmarks'
import { scaleCombat, scaleCombatUnclamped } from './bestiary/scale'
import {
  CREATURE_SIZES,
  CR_VALUES,
  ROLE_KEYS,
  TAG_KEYS,
  tierOf,
  type ChallengeRating,
} from './creatures'
import { bestiaryOf, creatureExtras, kindOf, resolveBestiaryAt, resolveSheet } from './resolve'
import { SKILL_KEYS } from './skills'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  MAX_NPC_NOTES_LENGTH,
  MAX_ROLL_DICE,
  MAX_SPEED,
  MIN_SPEED,
  SHEET_ENTRY_CATEGORIES,
  attackBonusOf,
  categoryOf,
  isMonsterSheet,
  isValidRoll,
  normaliseRoll,
  rollShapeOf,
  sheetProblem,
  storedSheetProblem,
  toHitFromBonus,
  toHitOf,
} from './sheet'
import type { NpcSheet, SheetEntry, StoredSheet } from './sheet'

// ---------------------------------------------------------------------------
// The corpus, enumerated once.
//
// Every loop below walks this list rather than naming a creature, because the
// failure this file exists to catch is the one stat block out of a hundred and
// twenty-nine that nobody re-read. A per-creature test would only ever be as
// good as the creatures somebody remembered to write one for.
//
// This is `library.test.ts`'s architecture applied to the bestiary, and the
// anti-vacuity gate it opens with is load-bearing for the same reason: a corpus
// that had quietly lost a content file would make every loop here pass while
// asserting a fifth less.
// ---------------------------------------------------------------------------

/** How many creatures the corpus is supposed to hold, and how many files it is spread over. */
const EXPECTED_ENTRIES = 129
const EXPECTED_FILES = 5

/** The ten ratings, as the array every loop steps through. */
const RATINGS: readonly ChallengeRating[] = CR_VALUES

type Placed = {
  entry: BestiaryEntry
  /** `goblin`, so a failure names the creature rather than an index. */
  label: string
}

const ENTRIES: Placed[] = BESTIARY.map((entry) => ({ entry, label: entry.key }))

type Fighter = Placed & { combat: BestiaryCombat }

/** The creatures with a combat block — everything §3 and §7 measure. */
const FIGHTERS: Fighter[] = ENTRIES.flatMap(({ entry, label }) =>
  entry.combat ? [{ entry, label, combat: entry.combat }] : [],
)

/** The row a creature is judged against. Present for every rating in `CR_VALUES`. */
function rowFor(cr: ChallengeRating): CrBenchmark {
  const row = benchmarkFor(cr)
  if (!row) throw new Error(`no benchmark row for CR ${cr}`)
  return row
}

// ---------------------------------------------------------------------------
// Rolls
//
// Deliberately stricter than `ROLL_PATTERN`: the shared grammar admits d20,
// d100 and ability tokens, and content rule 8 admits neither. `isValidRoll` is
// asserted alongside this rather than replaced by it — a copied regex that was
// the whole check would keep passing after the real grammar tightened.
// ---------------------------------------------------------------------------

const CORPUS_ROLL = /^\d{1,2}d(4|6|8|10|12)([+-]\d{1,3})?$/
const ROLL_PARTS = /^(\d{1,2})d(4|6|8|10|12)([+-]\d{1,3})?$/

type Roll = { count: number; faces: number; modifier: number }

function parseRoll(raw: string): Roll | null {
  const match = ROLL_PARTS.exec(raw)
  if (!match) return null
  return {
    count: Number(match[1]),
    faces: Number(match[2]),
    modifier: match[3] === undefined ? 0 : Number(match[3]),
  }
}

/** `count × (faces + 1) / 2 + modifier`, the figure the benchmark table's `damage` is. */
function averageOf(roll: Roll): number {
  return (roll.count * (roll.faces + 1)) / 2 + roll.modifier
}

/** Every roll on a combat block: an attack's damage, and an ability's when it has one. */
function rollsOf(combat: BestiaryCombat): { where: string; roll: string }[] {
  return [
    ...combat.attacks.map((attack) => ({ where: `attack ${attack.name}`, roll: attack.damage })),
    ...combat.abilities.flatMap((ability) =>
      ability.roll === null ? [] : [{ where: `ability ${ability.name}`, roll: ability.roll }],
    ),
  ]
}

/**
 * Content rule 6 — the per-rating cap on the dice in a *single* roll.
 *
 * This is what makes the scaler's twenty-dice cap provably unreachable, which is
 * why §7 can assert the clamped and unclamped scalers agree.
 */
const DICE_CAP: Record<number, number> = {
  0: 1,
  0.125: 2,
  0.25: 3,
  0.5: 4,
  1: 6,
  2: 8,
  3: 10,
  4: 12,
  5: 16,
  6: 20,
}

/** The stored selection for a creature at a rating, with no overrides. */
function stored(entryKey: string, cr: ChallengeRating): StoredSheet {
  return { kind: 'bestiary', entryKey, cr }
}

function resolvedAt(entryKey: string, cr: ChallengeRating): NpcSheet {
  return resolveSheet({ sheet: stored(entryKey, cr) }) as NpcSheet
}

// ---------------------------------------------------------------------------
// 1. The completeness gate
// ---------------------------------------------------------------------------

describe('the bestiary is complete', () => {
  /**
   * The anti-vacuity check, and it has to come first. Every loop below runs over
   * `ENTRIES` or `FIGHTERS`; a corpus that had lost a content file would make all
   * of them pass while asserting a fifth less.
   */
  test('holds every creature across all five content files', () => {
    expect(BESTIARY_FILES).toHaveLength(EXPECTED_FILES)
    expect(BESTIARY).toHaveLength(EXPECTED_ENTRIES)
    expect(ENTRIES).toHaveLength(EXPECTED_ENTRIES)
    // Flattening the files by hand has to agree with the index's own flatten,
    // or a file registered twice would inflate one and not the other.
    expect(BESTIARY_FILES.reduce((sum, file) => sum + file.entries.length, 0)).toBe(
      EXPECTED_ENTRIES,
    )
    expect(FIGHTERS.length).toBeGreaterThan(90)
  })

  /**
   * **This is the duplicate-key test.** `index.ts` builds a `Map` and deliberately
   * does not throw at module scope on a collision, because a content bug that
   * refused to evaluate would take down every query that paints a screen. The
   * `Map` silently keeps one of the two, so the count is the only place the loss
   * is visible.
   */
  test('has no two creatures sharing a key', () => {
    expect(BESTIARY_KEY_COUNT).toBe(BESTIARY.length)
    const keys = BESTIARY.map((entry) => entry.key)
    const repeated = keys.filter((key, index) => keys.indexOf(key) !== index)
    expect(repeated).toEqual([])
  })

  test('every key is lowercase, hyphenated and short enough for a document to store', () => {
    const offenders: string[] = []
    for (const { entry } of ENTRIES) {
      if (!/^[a-z0-9-]+$/.test(entry.key)) offenders.push(`${entry.key}: not kebab-case`)
      if (entry.key !== entry.key.toLowerCase()) offenders.push(`${entry.key}: not lowercase`)
      if (entry.key.length > MAX_ENTRY_ID_LENGTH) {
        offenders.push(`${entry.key}: ${entry.key.length} > ${MAX_ENTRY_ID_LENGTH} characters`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('spreads its creatures across the three tabs in the proportions the spec asks for', () => {
    // Grouped from the files, because `BestiaryFile.category` is where a category is
    // declared — a whole file cannot be filed under two categories by a typo in one
    // creature. The index used to export this grouping and nothing in production read it.
    const counts = new Map<BestiaryCategory, number>(
      (['monster', 'enemy', 'social'] as const).map((category) => [
        category,
        BESTIARY_FILES.filter((file) => file.category === category).reduce(
          (sum, file) => sum + file.entries.length,
          0,
        ),
      ]),
    )

    expect(counts.get('monster')).toBeGreaterThanOrEqual(60)
    expect(counts.get('monster')).toBeLessThanOrEqual(80)
    expect(counts.get('enemy')).toBeGreaterThanOrEqual(25)
    expect(counts.get('enemy')).toBeLessThanOrEqual(35)
    expect(counts.get('social')).toBeGreaterThanOrEqual(25)
    expect(counts.get('social')).toBeLessThanOrEqual(35)

    // Every creature is under exactly one tab and none has been dropped — which, grouped
    // from the files, is the same statement as every file naming one of the three.
    expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(EXPECTED_ENTRIES)
  })

  test('looks every creature up by its own key', () => {
    for (const { entry } of ENTRIES) {
      expect(bestiaryEntry(entry.key), entry.key).toBe(entry)
    }
  })

  /**
   * The prototype-chain hazard `library/index.ts` records at line 63: on a plain
   * object `paths['__proto__']`, `paths['toString']` and `paths['constructor']`
   * are all truthy, so a bare truthiness guard let three inherited names past a
   * lookup whose contract promised nothing. The index here is `Map`-based
   * specifically so the whole class of bug is unexpressible — asserted, so that
   * nobody "simplifies" it back to an object literal.
   */
  test('returns nothing for a key nothing declares, inherited names included', () => {
    for (const key of ['', 'nope', '__proto__', 'toString', 'constructor']) {
      expect(bestiaryEntry(key), key).toBeUndefined()
    }
  })

  /** The table and the rating list are one fact written twice. `benchmarks.ts` asks for this. */
  test('has one benchmark row per rating, in order, each stating its own rating', () => {
    expect(CR_BENCHMARKS).toHaveLength(CR_VALUES.length)
    for (const [index, cr] of CR_VALUES.entries()) {
      expect(CR_BENCHMARKS[index].cr, `row ${index}`).toBe(cr)
      expect(benchmarkFor(cr), `CR ${cr}`).toBe(CR_BENCHMARKS[index])
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Shape and vocabulary
// ---------------------------------------------------------------------------

describe('every creature is described in the shared vocabulary', () => {
  test('names a role, a size and a rating the picker can filter on', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      if (!(ROLE_KEYS as readonly string[]).includes(entry.role)) {
        offenders.push(`${label}: role ${entry.role}`)
      }
      if (!(CREATURE_SIZES as readonly string[]).includes(entry.size)) {
        offenders.push(`${label}: size ${entry.size}`)
      }
      if (!(CR_VALUES as readonly number[]).includes(entry.cr)) {
        offenders.push(`${label}: cr ${entry.cr}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('draws every tag and environment tag from the one tag list, without repeating one', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      for (const [field, tags] of [
        ['tags', entry.tags],
        ['environmentTags', entry.environmentTags],
      ] as const) {
        if (tags.length === 0) offenders.push(`${label}.${field}: empty`)
        for (const tag of tags) {
          if (!(TAG_KEYS as readonly string[]).includes(tag)) {
            offenders.push(`${label}.${field}: unknown tag ${tag}`)
          }
        }
        const repeated = tags.filter((tag, index) => tags.indexOf(tag) !== index)
        if (repeated.length > 0) offenders.push(`${label}.${field}: repeats ${repeated.join(', ')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * `types.ts` says the tier is stored as well as derivable "so a misfiled entry
   * fails a test". This is that test: a Tier III creature filed at CR 5 is a
   * well-formed entry that a level 3 party would be shown, and nothing else here
   * would notice.
   */
  test('states the tier its rating actually falls in', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      if (entry.tier !== tierOf(entry.cr)) {
        offenders.push(`${label}: filed tier ${entry.tier}, CR ${entry.cr} is tier ${tierOf(entry.cr)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('recommends a party level range inside the library the party is built from', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      const { recommendedPartyLevelMin: min, recommendedPartyLevelMax: max } = entry
      if (!Number.isInteger(min) || min < 1 || min > 5) offenders.push(`${label}: min ${min}`)
      if (!Number.isInteger(max) || max < 1 || max > 5) offenders.push(`${label}: max ${max}`)
      if (min > max) offenders.push(`${label}: min ${min} above max ${max}`)
    }
    expect(offenders).toEqual([])
  })

  test('carries a name, a blurb, notes and a line of loot, all inside the stored bounds', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      const fields: [string, string, number][] = [
        ['name', entry.name, MAX_ENTRY_NAME_LENGTH],
        ['blurb', entry.blurb, MAX_NPC_NOTES_LENGTH],
        ['notes', entry.notes, MAX_NPC_NOTES_LENGTH],
        ['loot', entry.loot, MAX_NPC_NOTES_LENGTH],
        ['creatureType', entry.creatureType, MAX_ENTRY_NAME_LENGTH],
        ['alignment', entry.alignment, MAX_ENTRY_NAME_LENGTH],
      ]
      for (const [field, value, cap] of fields) {
        if (value.trim() === '') offenders.push(`${label}.${field}: empty`)
        if (value.length > cap) offenders.push(`${label}.${field}: ${value.length} > ${cap}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('is either something to fight or somebody to talk to, and often both', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      if (entry.combat === undefined && entry.social === undefined) {
        offenders.push(`${label}: neither a combat nor a social block`)
      }
    }
    expect(offenders).toEqual([])
    // Not vacuous in either direction: the corpus has monsters, people, and
    // people who fight.
    expect(ENTRIES.some(({ entry }) => entry.combat && !entry.social)).toBe(true)
    expect(ENTRIES.some(({ entry }) => entry.social && !entry.combat)).toBe(true)
    expect(ENTRIES.some(({ entry }) => entry.social && entry.combat)).toBe(true)
  })

  /**
   * ⚠️ `'combat' in entry` rather than `entry.combat === undefined`. The two are
   * different writes — `undefined` is not a Convex value, so a key present and
   * holding `undefined` is not the same document as a key omitted — and only the
   * first distinguishes them.
   */
  test('omits the combat key entirely rather than naming it and leaving it undefined', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      if (entry.combat === undefined && 'combat' in entry) {
        offenders.push(`${label}: combat present and undefined`)
      }
      if (entry.social === undefined && 'social' in entry) {
        offenders.push(`${label}: social present and undefined`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('gives every talkable creature three personality keywords and skills worth asking with', () => {
    const social = ENTRIES.flatMap(({ entry, label }) =>
      entry.social ? [{ label, social: entry.social }] : [],
    )
    expect(social.length).toBeGreaterThan(20)

    const offenders: string[] = []
    for (const { label, social: block } of social) {
      if (block.personality.length !== 3) {
        offenders.push(`${label}: ${block.personality.length} personality keywords`)
      }
      for (const [index, word] of block.personality.entries()) {
        if (typeof word !== 'string' || word.trim() === '') {
          offenders.push(`${label}: personality ${index} empty`)
        }
      }
      for (const key of block.usefulSkills) {
        if (!(SKILL_KEYS as readonly string[]).includes(key)) {
          offenders.push(`${label}: unknown useful skill ${key}`)
        }
      }
      const repeated = block.usefulSkills.filter(
        (key, index) => block.usefulSkills.indexOf(key) !== index,
      )
      if (repeated.length > 0) offenders.push(`${label}: repeats skill ${repeated.join(', ')}`)
      if (block.occupation.trim() === '') offenders.push(`${label}.occupation: empty`)
      if (block.knows.trim() === '') offenders.push(`${label}.knows: empty`)
      if (block.questHooks !== undefined && block.questHooks.trim() === '') {
        offenders.push(`${label}.questHooks: present and empty`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. The combat arithmetic
//
// Every check here computes the creature's deviation from its own benchmark row
// and asserts it is in range, and every one **collects all offenders before
// failing**. A failure has to say which creature and by how much, because the
// fix is a number in a content file and the arithmetic is what somebody needs to
// see to choose the new one.
// ---------------------------------------------------------------------------

describe('every fighting creature sits a sensible distance from its benchmark row', () => {
  test('has hit points between 0.40x and 2.60x of the row', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const row = rowFor(entry.cr)
      const ratio = combat.maxHp / row.hp
      if (ratio < 0.4 || ratio > 2.6) {
        offenders.push(
          `${label} (CR ${entry.cr}, ${entry.role}): maxHp ${combat.maxHp} is ${ratio.toFixed(2)}x row ${row.hp}, bound 0.40-2.60`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * ⚠️ **Summed over every attack, not per attack.** A three-attack creature
   * measured per attack reads three times under budget and every Multiattack
   * brute in the corpus passes; measured as a sum, the figure is what the party
   * actually takes in a round, which is what the row means.
   */
  test('deals between 0.50x and 2.20x of the row in a round, summed over its attacks', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const row = rowFor(entry.cr)
      let total = 0
      for (const attack of combat.attacks) {
        const roll = parseRoll(attack.damage)
        if (!roll) {
          offenders.push(`${label}: attack ${attack.name} damage ${attack.damage} is unparseable`)
          continue
        }
        total += averageOf(roll)
      }
      const ratio = total / row.damage
      if (ratio < 0.5 || ratio > 2.2) {
        offenders.push(
          `${label} (CR ${entry.cr}, ${entry.role}): ${combat.attacks.length} attack(s) average ${total} a round, ${ratio.toFixed(2)}x row ${row.damage}, bound 0.50-2.20`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  test('has an armour class from the row minus five to the row plus six', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const row = rowFor(entry.cr)
      const delta = combat.armourClass - row.armourClass
      if (delta < -5 || delta > 6) {
        offenders.push(
          `${label} (CR ${entry.cr}, ${entry.role}): armourClass ${combat.armourClass} is row ${row.armourClass} ${delta >= 0 ? '+' : ''}${delta}, bound -5..+6`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  test('has an attack bonus and a save DC from the row minus three to the row plus four', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const row = rowFor(entry.cr)
      const checks: [string, number, number][] = [
        ['attackBonus', combat.attackBonus, row.attackBonus],
        ...(combat.saveDc === null
          ? []
          : ([['saveDc', combat.saveDc, row.saveDc]] as [string, number, number][])),
      ]
      for (const [field, value, target] of checks) {
        const delta = value - target
        if (delta < -3 || delta > 4) {
          offenders.push(
            `${label} (CR ${entry.cr}, ${entry.role}): ${field} ${value} is row ${target} ${delta >= 0 ? '+' : ''}${delta}, bound -3..+4`,
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Initiative, every skill bonus and passive perception all move by the same
   * integer when a creature is scaled — see the note at the foot of
   * `benchmarks.ts` on why none of the three needs a column of its own. They are
   * therefore all measured against the one `skillBonus` figure, passive
   * perception as `10 + skillBonus` because that is what it is.
   */
  test('has initiative, skill bonuses and passive perception within -4 to +8 of the row', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const row = rowFor(entry.cr)
      const checks: [string, number][] = [
        ['initiativeBonus', combat.initiativeBonus - row.skillBonus],
        ['passivePerception', combat.passivePerception - (10 + row.skillBonus)],
        ...combat.skills.map(
          (skill) => [`skill ${skill.key}`, skill.bonus - row.skillBonus] as [string, number],
        ),
      ]
      for (const [field, delta] of checks) {
        if (delta < -4 || delta > 8) {
          offenders.push(
            `${label} (CR ${entry.cr}, ${entry.role}): ${field} deviates ${delta >= 0 ? '+' : ''}${delta} from row skillBonus ${row.skillBonus}, bound -4..+8`,
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The rule that makes the scaler's twenty-dice cap unreachable, and therefore
   * the rule §7 depends on. A CR 1 creature written with ten dice scales to
   * sixty at CR 6, the cap absorbs the excess into a flat modifier, and the
   * clamped and unclamped scalers stop agreeing.
   */
  test('keeps every single roll inside its rating dice cap', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const cap = DICE_CAP[entry.cr]
      for (const { where, roll } of rollsOf(combat)) {
        const parsed = parseRoll(roll)
        if (!parsed) continue
        if (parsed.count > cap) {
          offenders.push(`${label} (CR ${entry.cr}): ${where} ${roll} has ${parsed.count} dice, cap ${cap}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The bottom row is the largest amplifier in the table — every scale from CR 0
   * divides by `hp: 4` and `damage: 2` — so the content rule for CR 0 is tighter
   * than the general bounds and is checked separately.
   */
  test('keeps a CR 0 creature to one attack of one small die with no modifier', () => {
    const zeroes = FIGHTERS.filter(({ entry }) => entry.cr === 0)
    expect(zeroes.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const { label, combat } of zeroes) {
      if (combat.maxHp < 2 || combat.maxHp > 10) offenders.push(`${label}: maxHp ${combat.maxHp}, bound 2-10`)
      if (combat.attacks.length !== 1) offenders.push(`${label}: ${combat.attacks.length} attacks, must be 1`)
      for (const attack of combat.attacks) {
        const roll = parseRoll(attack.damage)
        if (!roll) continue
        if (roll.count !== 1) offenders.push(`${label}: ${attack.damage} has ${roll.count} dice, must be 1`)
        if (roll.faces !== 4 && roll.faces !== 6) {
          offenders.push(`${label}: ${attack.damage} uses d${roll.faces}, must be d4 or d6`)
        }
        if (roll.modifier !== 0) {
          offenders.push(`${label}: ${attack.damage} carries a flat modifier`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Both halves, and neither is redundant. `CORPUS_ROLL` is content rule 8 — one
   * die group, one optional modifier, no d20, no ability token — and
   * `isValidRoll` is the grammar the *database* will apply. `normaliseRoll`
   * being the identity is what stops an entry written `2d6 + 3` or `2D6+3`
   * reaching a sheet in a form the picker would never produce.
   */
  test('writes every roll in the corpus grammar, and in the form storage would keep', () => {
    const offenders: string[] = []
    let seen = 0
    for (const { label, combat } of FIGHTERS) {
      for (const { where, roll } of rollsOf(combat)) {
        seen += 1
        if (!CORPUS_ROLL.test(roll)) offenders.push(`${label}: ${where} ${roll} is not corpus grammar`)
        if (!isValidRoll(roll)) offenders.push(`${label}: ${where} ${roll} fails isValidRoll`)
        if (normaliseRoll(roll) !== roll) {
          offenders.push(`${label}: ${where} ${roll} normalises to ${normaliseRoll(roll)}`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(seen).toBeGreaterThan(120)
  })

  test('lists at most three attacks, three abilities and four distinct skills', () => {
    const offenders: string[] = []
    for (const { label, combat } of FIGHTERS) {
      if (combat.attacks.length > 3) offenders.push(`${label}: ${combat.attacks.length} attacks`)
      if (combat.abilities.length > 3) offenders.push(`${label}: ${combat.abilities.length} abilities`)
      if (combat.skills.length > 4) offenders.push(`${label}: ${combat.skills.length} skills`)
      for (const skill of combat.skills) {
        if (!(SKILL_KEYS as readonly string[]).includes(skill.key)) {
          offenders.push(`${label}: unknown skill ${skill.key}`)
        }
      }
      const keys = combat.skills.map((skill) => skill.key)
      const repeated = keys.filter((key, index) => keys.indexOf(key) !== index)
      // `creatureSkillsFrom` in resolve.ts silently keeps the later bonus for a
      // repeated key, and its comment says the corpus test is what catches it.
      if (repeated.length > 0) offenders.push(`${label}: repeats skill ${repeated.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  test('moves at a whole number of feet the board can draw', () => {
    const offenders: string[] = []
    for (const { label, combat } of FIGHTERS) {
      if (!Number.isInteger(combat.speed) || combat.speed < MIN_SPEED || combat.speed > MAX_SPEED) {
        offenders.push(`${label}: speed ${combat.speed}, bound ${MIN_SPEED}-${MAX_SPEED}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('gives every attack and ability a name and words inside the entry bounds', () => {
    const offenders: string[] = []
    for (const { label, combat } of FIGHTERS) {
      const lines = [
        ...combat.attacks.map((attack) => ({ name: attack.name, text: attack.text })),
        ...combat.abilities.map((ability) => ({ name: ability.name, text: ability.text })),
      ]
      for (const line of lines) {
        if (line.name.trim() === '') offenders.push(`${label}: an unnamed line`)
        if (line.name.length > MAX_ENTRY_NAME_LENGTH) {
          offenders.push(`${label}: ${line.name} is ${line.name.length} characters`)
        }
        if (line.text.trim() === '') offenders.push(`${label}: ${line.name} has no text`)
        if (line.text.length > MAX_ENTRY_TEXT_LENGTH) {
          offenders.push(`${label}: ${line.name} text is ${line.text.length} characters`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. The scaling opt-in
// ---------------------------------------------------------------------------

describe('an ability carrying most of a creature output opts in to scaling', () => {
  type Rolled = { label: string; cr: ChallengeRating; name: string; average: number; opted: boolean }

  const ROLLED: Rolled[] = FIGHTERS.flatMap(({ label, entry, combat }) =>
    combat.abilities.flatMap((ability) => {
      if (ability.roll === null) return []
      const parsed = parseRoll(ability.roll)
      if (!parsed) return []
      return [
        {
          label,
          cr: entry.cr,
          name: ability.name,
          average: averageOf(parsed),
          opted: ability.scalesWithCr === true,
        },
      ]
    }),
  )

  /**
   * The dragon-breath rule. An ability that is most of a creature's damage and
   * does not move when the creature is scaled produces a CR 6 dragon stepped
   * down to CR 2 that still one-shots a level 2 party — the flag is the fix, and
   * `types.ts` says in as many words that the corpus test is what catches a
   * forgotten one.
   */
  test('whenever its own average exceeds the row damage figure', () => {
    const offenders: string[] = []
    for (const rolled of ROLLED) {
      const row = rowFor(rolled.cr)
      if (rolled.average > row.damage && !rolled.opted) {
        offenders.push(
          `${rolled.label} (CR ${rolled.cr}): ${rolled.name} averages ${rolled.average} against row damage ${row.damage} and does not set scalesWithCr`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Vacuity in both directions, because the flag is only doing work if both
   * answers occur. A corpus where nothing opted in means the dragon case was
   * never written; a corpus where everything did means the freeze — Regeneration
   * staying exactly where it is — was never expressed.
   */
  test('and the flag is genuinely used both ways across the corpus', () => {
    expect(ROLLED.filter((rolled) => rolled.opted).length).toBeGreaterThanOrEqual(5)
    expect(ROLLED.filter((rolled) => !rolled.opted).length).toBeGreaterThanOrEqual(5)
  })
})

// ---------------------------------------------------------------------------
// 5. Prose
//
// ⚠️ **This sweeps the entry's own authored fields and nothing else.**
// `attackText` in resolve.ts deliberately composes `"Melee. 2d6+4 slashing
// damage. …"` from the structured fields, so a resolved `SheetEntry.text`
// carries the current, scaled damage by construction. Sweeping a resolved sheet
// for dice notation would fail on correct behaviour.
// ---------------------------------------------------------------------------

describe('the prose says what a creature does, never what it rolls', () => {
  /** Every authored sentence on an entry, labelled so a failure names the field. */
  function proseOf(entry: BestiaryEntry): [string, string][] {
    const out: [string, string][] = [
      ['notes', entry.notes],
      ['loot', entry.loot],
      ['blurb', entry.blurb],
    ]
    for (const attack of entry.combat?.attacks ?? []) out.push([`attack ${attack.name}`, attack.text])
    for (const ability of entry.combat?.abilities ?? []) {
      out.push([`ability ${ability.name}`, ability.text])
    }
    const social = entry.social
    if (social) {
      out.push(['social.occupation', social.occupation])
      out.push(['social.knows', social.knows])
      if (social.questHooks !== undefined) out.push(['social.questHooks', social.questHooks])
    }
    return out
  }

  /**
   * The sweeps below are only worth their green tick if they are reading anything
   * and would fail on a needle. A `proseOf` that quietly returned nothing — an
   * entry shape that renamed `notes`, say — makes both of them pass over a corpus
   * they never looked at.
   */
  test('over every authored sentence in the corpus, with patterns that do find a needle', () => {
    const swept = ENTRIES.flatMap(({ entry }) => proseOf(entry))
    expect(swept.length).toBeGreaterThan(500)
    for (const [, text] of swept) expect(typeof text).toBe('string')

    expect(/\d+d\d+/.test('It bites for 2d6+3 piercing damage.')).toBe(true)
    expect(/[+-]\d+\s+to\s+hit/i.test('Claw. +7 to hit, reach 5 ft.')).toBe(true)
    expect(EXCLUDED.some(([, pattern]) => pattern.test('It knocks the target prone.'))).toBe(true)
  })

  test('naming no dice and no to-hit number, because a CR shift cannot change words', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      for (const [where, text] of proseOf(entry)) {
        const dice = /\d+d\d+/.exec(text)
        if (dice) offenders.push(`${label} → ${where} names dice: ${dice[0]}`)
        const toHit = /[+-]\d+\s+to\s+hit/i.exec(text)
        if (toHit) offenders.push(`${label} → ${where} names a to-hit bonus: ${toHit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The same sweep `library.test.ts` runs over the seventy-two premade sheets,
   * over the corpus. Movement-impairing conditions are excluded by design rather
   * than unbuilt — two of the Battle Master's best-known manoeuvres were left out
   * of the character library over it — and a hundred and twenty-nine
   * hand-written stat blocks is the likeliest place one creeps back in. Speed is
   * on the list because a creature's is a stored number the sheet already shows;
   * prose promising a change to it promises something the app cannot represent.
   *
   * Word-bounded, so an innocent substring cannot fail the build.
   */
  const EXCLUDED: [string, RegExp][] = [
    ['prone', /\bprone\b/i],
    ['difficult terrain', /\bdifficult terrain\b/i],
    ['grappled/grappling', /\bgrappl(e|ed|es|ing)\b/i],
    ['restrained', /\brestrained?\b/i],
    ['knocked down', /\bknocked (down|over|prone)\b/i],
    ['stand up', /\bstands? up\b/i],
    ['speed', /\bspeed\b/i],
  ]

  test('and no excluded condition and no change of speed', () => {
    const offenders: string[] = []
    for (const { entry, label } of ENTRIES) {
      for (const [where, text] of proseOf(entry)) {
        for (const [name, pattern] of EXCLUDED) {
          if (pattern.test(text)) offenders.push(`${label} → ${where} mentions ${name}`)
        }
      }
    }
    // Reported in full rather than failing on the first, so one run says how much
    // content needs revisiting.
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 6. Everything resolves
// ---------------------------------------------------------------------------

describe('every creature at every rating resolves to a sheet the database would accept', () => {
  /**
   * **The most valuable test in the file**, and the reason the corpus is iterated
   * rather than sampled. Everything above checks one number against one bound;
   * this puts each of the hundred and twenty-nine through the real resolver at
   * each of the ten ratings and runs the function the mutation runs — 1,290
   * sheets, which is every creature this milestone can produce with no override
   * on it.
   */
  test('for all 129 creatures across all 10 ratings', () => {
    const problems: string[] = []
    let count = 0
    for (const { label, entry } of ENTRIES) {
      for (const cr of RATINGS) {
        count += 1
        const selection = stored(entry.key, cr)

        const onStored = storedSheetProblem(selection)
        if (onStored) problems.push(`${label} @ CR ${cr} (stored): ${onStored.path} — ${onStored.message}`)

        const problem = sheetProblem(resolveSheet({ sheet: selection }))
        if (problem) problems.push(`${label} @ CR ${cr}: ${problem.path} — ${problem.message}`)
      }
    }
    expect(problems).toEqual([])
    // Stated so a loop that silently shrank is visible rather than merely green.
    expect(count).toBe(EXPECTED_ENTRIES * RATINGS.length)
  })

  /**
   * ⚠️ **Unconditionally, on every branch.** `isMonsterSheet` decides whether an
   * NPC's sheet reaches a player, and it is only allowed to read one stored field
   * because `resolveBestiary` never contradicts it. A branch that returned `pc`
   * would publish a prepared creature — for a social NPC, `notes` is the plot.
   */
  test('and every resolved creature is a monster on every branch', () => {
    for (const { label, entry } of ENTRIES) {
      for (const cr of RATINGS) {
        expect(resolvedAt(entry.key, cr).kind, `${label} @ CR ${cr}`).toBe('npc')
      }
    }
    // The predicate itself, on the selection rather than the resolved sheet —
    // that is the whole of what `maySeeCharacter` gets to look at.
    expect(isMonsterSheet(stored('goblin', 1))).toBe(true)
    expect(kindOf({ sheet: stored('goblin', 1) })).toBe('npc')
    // Including a key the corpus no longer has: a retired creature is still a
    // secret, and fail-closed is the only acceptable direction here.
    expect(isMonsterSheet(stored('not-a-creature', 1))).toBe(true)
    expect(kindOf({ sheet: stored('not-a-creature', 1) })).toBe('npc')
  })

  test('and a creature the corpus no longer has still resolves to a usable sheet', () => {
    const sheet = resolvedAt('retired-creature', 3)
    expect(sheet.kind).toBe('npc')
    expect(sheetProblem(sheet)).toBeNull()
    expect(sheet.notes).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 7. The clamp as a tripwire
// ---------------------------------------------------------------------------

describe('no creature needs a bound to stay inside its bounds', () => {
  /**
   * ⚠️ **The reason this file matters.** A clamp turns an out-of-range value into
   * an in-range one, so a CR 6 Tank whose armour class wants to be 43 is pinned
   * at `MAX_ARMOUR_CLASS` and §6 goes green over a content bug nobody hears
   * about. `scaleCombatUnclamped` exists for this one comparison and shares one
   * body with `scaleCombat` through a `Bound` strategy, so the two cannot drift
   * by anything other than a bound.
   */
  test('so the clamped and unclamped scalers agree for every creature at every rating', () => {
    const offenders: string[] = []
    let count = 0
    for (const { label, entry, combat } of FIGHTERS) {
      for (const cr of RATINGS) {
        count += 1
        const clamped = scaleCombat(combat, entry.cr, cr)
        const free = scaleCombatUnclamped(combat, entry.cr, cr)
        if (JSON.stringify(clamped) === JSON.stringify(free)) continue

        // Named field by field, because "these two objects differ" is not
        // something anybody can fix.
        for (const field of [
          'maxHp',
          'armourClass',
          'attackBonus',
          'initiativeBonus',
          'passivePerception',
          'saveDc',
        ] as const) {
          if (clamped[field] !== free[field]) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): ${field} wants ${free[field]}, bound to ${clamped[field]}`,
            )
          }
        }
        for (const [index, skill] of free.skills.entries()) {
          if (clamped.skills[index]?.bonus !== skill.bonus) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): skill ${skill.key} wants ${skill.bonus}, bound to ${clamped.skills[index]?.bonus}`,
            )
          }
        }
        for (const [index, attack] of free.attacks.entries()) {
          if (clamped.attacks[index]?.damage !== attack.damage) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): attack ${attack.name} wants ${attack.damage}, bound to ${clamped.attacks[index]?.damage}`,
            )
          }
        }
        for (const [index, ability] of free.abilities.entries()) {
          if (clamped.abilities[index]?.roll !== ability.roll) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): ability ${ability.name} wants ${ability.roll}, bound to ${clamped.abilities[index]?.roll}`,
            )
          }
        }
      }
    }
    expect(offenders).toEqual([])
    expect(count).toBe(FIGHTERS.length * RATINGS.length)
  })

  /**
   * The other half of the same argument. The per-rating dice cap in the content
   * rules is supposed to make `MAX_ROLL_DICE` unreachable by scaling; this is the
   * check that it does. A scaled roll that hit twenty dice would have had its
   * excess absorbed into the flat modifier, which is how `20d10+40` happens — and
   * a two-digit ceiling on that modifier is what says it never did.
   */
  test('and no scaled roll reaches the die cap or grows a three-digit modifier', () => {
    const offenders: string[] = []
    for (const { label, entry, combat } of FIGHTERS) {
      const baselineDice = new Map(
        rollsOf(combat).map(({ where, roll }) => [where, parseRoll(roll)?.count ?? 0]),
      )
      for (const cr of RATINGS) {
        const scaled = scaleCombat(combat, entry.cr, cr)
        for (const { where, roll } of rollsOf(scaled)) {
          const parsed = parseRoll(roll)
          if (!parsed) {
            offenders.push(`${label} (CR ${entry.cr} → ${cr}): ${where} scaled to ${roll}, unparseable`)
            continue
          }
          const before = baselineDice.get(where) ?? 0
          if (parsed.count >= MAX_ROLL_DICE && before < MAX_ROLL_DICE) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): ${where} scaled from ${before} dice to ${parsed.count}, cap ${MAX_ROLL_DICE}`,
            )
          }
          if (Math.abs(parsed.modifier) > 99) {
            offenders.push(
              `${label} (CR ${entry.cr} → ${cr}): ${where} scaled to ${roll}, modifier is three digits`,
            )
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 8. Identity and the round trip
//
// **Nothing here mutates an entry.** Two content files factor shared abilities
// into file-local constants shared by object reference across creatures, and
// `scaleCombat` hands a non-scaling ability back by reference too — so a test
// that reached into an entry would corrupt other creatures in the same run.
// ---------------------------------------------------------------------------

describe('scaling a creature to the rating it is already at changes nothing', () => {
  /**
   * `scale.ts` records that `from === to` is deliberately **not**
   * short-circuited: `if (from === to) return combat` would make this true by
   * construction and thereby make the test worthless, since it would then pass
   * over an arithmetically broken scaler. So this exercises the real arithmetic.
   */
  test('for every creature in the corpus', () => {
    for (const { label, entry, combat } of FIGHTERS) {
      expect(scaleCombat(combat, entry.cr, entry.cr), label).toStrictEqual(combat)
    }
  })

  /**
   * Stronger than deep equality, and available because `scaleCombat` returns a
   * non-scaling ability by reference — which is what makes the freeze exactly
   * assertable rather than approximately.
   */
  test('and a frozen ability is handed back as the very same object', () => {
    let frozen = 0
    for (const { label, entry, combat } of FIGHTERS) {
      const scaled = scaleCombat(combat, entry.cr, 6)
      for (const [index, ability] of combat.abilities.entries()) {
        if (ability.scalesWithCr === true && ability.roll !== null) continue
        expect(Object.is(scaled.abilities[index], ability), `${label}: ${ability.name}`).toBe(true)
        frozen += 1
      }
    }
    expect(frozen).toBeGreaterThan(50)
  })

  test('and the resolver at the entry own rating matches the preview query', () => {
    for (const { label, entry } of ENTRIES) {
      expect(resolvedAt(entry.key, entry.cr), label).toStrictEqual(
        resolveBestiaryAt(entry.key, entry.cr),
      )
    }
    // Null for a key nothing declares, for the reason `bestiaryEntry` tolerates one.
    expect(resolveBestiaryAt('not-a-creature', 3)).toBeNull()
  })

  /**
   * The non-compounding guarantee, end to end. `bestiarySheetValidator` has
   * nowhere to put a scaled number, so the scaler reads the entry's own baseline
   * every time and a shift up and back down has to land byte for byte where it
   * started.
   */
  test('and stepping a creature up and back down returns the sheet it started with', () => {
    // One creature per rating rather than the first dozen in file order, which
    // would be twelve Tier I monsters and would never exercise a ratio steep
    // enough to round anywhere interesting.
    const spread = RATINGS.flatMap((cr) => {
      const found = FIGHTERS.find((fighter) => fighter.entry.cr === cr)
      return found ? [found.entry] : []
    })
    expect(spread).toHaveLength(RATINGS.length)

    for (const entry of spread) {
      for (const other of [0.25, 2, 6] as const) {
        if (other === entry.cr) continue
        const atA = resolvedAt(entry.key, entry.cr)
        const atB = resolvedAt(entry.key, other)
        const backAtA = resolvedAt(entry.key, entry.cr)
        expect(JSON.stringify(backAtA), `${entry.key} ${entry.cr} → ${other} → ${entry.cr}`).toBe(
          JSON.stringify(atA),
        )
        // **The mandatory positive control.** Without it a scaler that returned
        // its input unconditionally would pass every identity assertion above.
        expect(atB, `${entry.key} at CR ${other} should differ from CR ${entry.cr}`).not.toStrictEqual(
          atA,
        )
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 9. What travels beside the sheet
// ---------------------------------------------------------------------------

describe('the labels a creature carries beside its sheet', () => {
  test('are present for a bestiary creature and absent for every other kind', () => {
    for (const { label, entry } of ENTRIES) {
      const extras = creatureExtras({ sheet: stored(entry.key, entry.cr) })
      expect(extras, label).not.toBeNull()
      expect(extras?.name, label).toBe(entry.name)
      expect(extras?.libraryCr, label).toBe(entry.cr)
      // The social block leaves in the shape it travels in: a copy of every array, and
      // `questHooks` nullable rather than optional, because `undefined` is not a Convex
      // value. See `CreatureSocial`.
      expect(extras?.social, label).toStrictEqual(
        entry.social
          ? {
              occupation: entry.social.occupation,
              personality: [...entry.social.personality],
              usefulSkills: [...entry.social.usefulSkills],
              knows: entry.social.knows,
              questHooks: entry.social.questHooks ?? null,
            }
          : null,
      )
      expect(extras?.overriddenFields, label).toEqual([])
      expect(bestiaryOf({ sheet: stored(entry.key, entry.cr) }), label).not.toBeNull()
    }

    const others: { sheet?: StoredSheet }[] = [
      {},
      { sheet: { kind: 'pc', level: 1, className: 'Fighter' } as StoredSheet },
      { sheet: { kind: 'npc', notes: '' } as StoredSheet },
      {
        sheet: {
          kind: 'preset',
          race: 'human',
          classKey: 'fighter',
          subclassKey: null,
          level: 1,
          locked: false,
        } as StoredSheet,
      },
    ]
    for (const doc of others) {
      expect(creatureExtras(doc), doc.sheet?.kind ?? 'absent').toBeNull()
      expect(bestiaryOf(doc), doc.sheet?.kind ?? 'absent').toBeNull()
    }
  })

  /**
   * Per `CreatureExtras.tier`, this is the tier of the **resolved** rating rather
   * than the entry's — a DM who has scaled a creature to CR 5 should read Tier
   * IV. So the two agree only where the creature is unscaled, and asserting
   * `entry.tier` would be asserting the wrong thing.
   */
  test('and report the tier of the rating the creature is resolved at', () => {
    for (const { label, entry } of ENTRIES) {
      for (const cr of RATINGS) {
        const extras = creatureExtras({ sheet: stored(entry.key, cr) })
        // The resolved rating itself is not on the extras — it is the selection, and the
        // caller is holding it. See the warning on `CreatureExtras`.
        expect(extras?.libraryCr, `${label} @ CR ${cr}`).toBe(entry.cr)
        expect(extras?.tier, `${label} @ CR ${cr}`).toBe(tierOf(cr))
      }
      // Unscaled, and only then, the resolved tier is the entry's own.
      expect(creatureExtras({ sheet: stored(entry.key, entry.cr) })?.tier, label).toBe(entry.tier)
    }
  })

  /**
   * The spec's *Compare Changes* falls out of the data: the diff is the storage,
   * so the list of pinned fields is `Object.keys`. Empty when nothing is pinned,
   * rather than absent.
   */
  test('and list exactly the fields the DM has pinned', () => {
    const key = BESTIARY[0].key
    expect(creatureExtras({ sheet: { kind: 'bestiary', entryKey: key, cr: 1 } })?.overriddenFields).toEqual(
      [],
    )
    expect(
      creatureExtras({
        sheet: { kind: 'bestiary', entryKey: key, cr: 1, overrides: {} },
      })?.overriddenFields,
    ).toEqual([])
    expect(
      creatureExtras({
        sheet: {
          kind: 'bestiary',
          entryKey: key,
          cr: 1,
          overrides: { maxHp: 30, notes: 'Bloodied already.' },
        },
      })?.overriddenFields,
    ).toEqual(['maxHp', 'notes'])
  })

  /**
   * A retired key loses the labels and keeps the sheet. Inventing a creature type
   * for a creature nobody can look up would be worse than showing none, and the
   * panel still has numbers to draw.
   */
  test('and are absent for a retired creature whose sheet still resolves', () => {
    const doc = { sheet: stored('retired-creature', 5) }
    expect(creatureExtras(doc)).toBeNull()
    // The selection is still a bestiary selection — only the lookup failed.
    expect(bestiaryOf(doc)).not.toBeNull()
    expect(resolveSheet(doc).kind).toBe('npc')
    expect(sheetProblem(resolveSheet(doc))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 9. The entry taxonomy, which for this corpus is derived rather than authored
//
// ⚠️ **None of the 129 stat blocks was edited to add a category or a to-hit.**
// `resolve.ts` derives both structurally: an attack is a `weapon` because the
// corpus already separates `attacks` from `abilities`, an ability is an `action`
// or a `passive` according to whether it rolls anything, and every attack's
// to-hit is composed from the creature's one `attackBonus` through
// `toHitFromBonus`.
//
// That is a saving of a hundred and fifty-nine hand edits and a hundred and
// fifty-nine chances to disagree — and it is only sound if the structural claims
// it rests on are true. They are asserted here rather than trusted, at every one
// of the ten ratings, because a CR shift moves the attack bonus and the whole
// point of composing rather than storing is that every to-hit moves with it.
// ---------------------------------------------------------------------------

describe('a creature resolves to a sheet whose categories were never written down', () => {
  /** The lines the resolver built from `combat.attacks`, under their own prefix. */
  function attacksOf(sheet: NpcSheet): SheetEntry[] {
    return sheet.actions.filter((action) => action.id.startsWith('atk:'))
  }

  /** And from `combat.abilities`. The prefix is what keeps a Bite and a Bite apart. */
  function abilitiesOf(sheet: NpcSheet): SheetEntry[] {
    return sheet.actions.filter((action) => action.id.startsWith('abl:'))
  }

  /**
   * ⚠️ **The claim `attackEntry` rests on, and the one that proves the to-hit
   * tracks a CR shift.**
   *
   * Every attack is a `weapon` by construction, and its to-hit is the creature's
   * single `attackBonus` spelled as a roll. Asserted at all ten ratings rather than
   * at the entry's own, because scaling is exactly when the two could come apart:
   * the bonus is recomputed from the benchmark row on every shift, and a to-hit
   * composed once and cached — or composed from the wrong layer — would leave a
   * creature whose statline moves and whose attacks do not.
   *
   * The expected value is read through `attackBonusOf`, which is the one accessor
   * that decides what an absent bonus means, rather than off the sheet field
   * directly. That is the same routing `resolveBestiary` uses, so this is a test of
   * the composition rather than a restatement of it.
   */
  test('every attack is a weapon whose to-hit is the creature bonus, at all ten ratings', () => {
    const wrong: string[] = []
    let checked = 0
    for (const { entry, label } of FIGHTERS) {
      for (const cr of RATINGS) {
        const sheet = resolvedAt(entry.key, cr)
        const bonus = attackBonusOf(sheet)
        const expected = toHitFromBonus(bonus ?? 0)
        const attacks = attacksOf(sheet)
        // A combat block always states an attack bonus, so an absent one here is
        // itself the failure rather than a case to tolerate.
        if (bonus === null) wrong.push(`${label} @ CR ${cr}: no attack bonus on the sheet`)
        if (attacks.length !== (entry.combat?.attacks.length ?? 0)) {
          wrong.push(`${label} @ CR ${cr}: ${attacks.length} attack lines, corpus has ${entry.combat?.attacks.length}`)
        }
        for (const attack of attacks) {
          checked += 1
          const where = `${label} @ CR ${cr} → ${attack.name}`
          if (attack.category !== 'weapon') wrong.push(`${where} category ${attack.category}`)
          if (attack.toHit !== expected) wrong.push(`${where} toHit ${attack.toHit} ≠ ${expected}`)
          if (attack.roll === null) wrong.push(`${where} has no damage`)
        }
      }
    }
    expect(wrong).toEqual([])
    // Stated so a loop that silently shrank is visible rather than merely green.
    expect(checked).toBeGreaterThan(1000)
  })

  /**
   * ⚠️ **Asserted, not trusted** — `abilityEntry`'s comment says in as many words
   * that "no ability in the corpus is a weapon", and this is the assertion it defers
   * to. It matters because the derivation cannot express one: an ability's category
   * is read off `roll === null` and can only ever be `action` or `passive`, so a
   * creature whose ability genuinely has to land first would be silently published
   * as something that simply goes off. That is a content decision somebody has to
   * make, not a shape the resolver can guess, and the day it changes this test is
   * what asks the question.
   */
  test('and no ability resolves to a weapon at any rating', () => {
    const weapons: string[] = []
    let checked = 0
    for (const { entry, label } of FIGHTERS) {
      for (const cr of RATINGS) {
        for (const ability of abilitiesOf(resolvedAt(entry.key, cr))) {
          checked += 1
          if (ability.category === 'weapon') weapons.push(`${label} @ CR ${cr} → ${ability.name}`)
          // And therefore never carries a to-hit, which is the consequence that
          // would actually be visible: a line announcing "uses" with an attack roll
          // attached to it.
          if (ability.toHit !== undefined) {
            weapons.push(`${label} @ CR ${cr} → ${ability.name} carries a to-hit`)
          }
        }
      }
    }
    expect(weapons).toEqual([])
    expect(checked).toBeGreaterThan(1000)
  })

  /**
   * The whole resolved list, checked against the arity rule the validator enforces.
   * `every creature at every rating resolves to a sheet the database would accept`
   * already runs `sheetProblem` over these, but it stops at the first problem on a
   * sheet — this says which lines, all of them, and it reads the categories through
   * `categoryOf` and `toHitOf` so the accessors are exercised on real payloads
   * rather than on hand-built fixtures.
   */
  test('every resolved line carries exactly the rolls its category promises', () => {
    const wrong: string[] = []
    for (const { entry, label } of ENTRIES) {
      for (const cr of RATINGS) {
        const sheet = resolvedAt(entry.key, cr)
        for (const action of sheet.actions) {
          const category = categoryOf(action)
          const shape = rollShapeOf(category)
          const where = `${label} @ CR ${cr} → ${action.name} (${category})`
          expect(SHEET_ENTRY_CATEGORIES, where).toContain(category)
          if (shape.toHit !== (action.toHit !== undefined)) wrong.push(`${where} toHit`)
          if (shape.roll !== (action.roll !== null)) wrong.push(`${where} roll`)
          // `toHitOf` is the fail-closed read, and on a resolved sheet it must
          // agree with the stored field exactly — there is nothing here for it to
          // be protecting against.
          if (toHitOf(action) !== (action.toHit ?? null)) wrong.push(`${where} toHitOf disagrees`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  /**
   * ⚠️ **Never a zero term.** `ROLL_PATTERN` would accept `1d20+0` — `\d{1,3}`
   * matches `0` — so the grammar is not the guard, and a creature scaled down to no
   * bonus at all is exactly how one would be produced. A bare `1d20` is the right
   * answer; `1d20+0` and `1d20-0` are both a rendering somebody would file a bug
   * about, and `-0` is genuinely reachable because `Math.round(-0.3)` produces it.
   */
  test('and no composed to-hit ever names a zero bonus', () => {
    const offenders: string[] = []
    for (const { entry, label } of FIGHTERS) {
      for (const cr of RATINGS) {
        for (const attack of attacksOf(resolvedAt(entry.key, cr))) {
          const toHit = attack.toHit as string
          const where = `${label} @ CR ${cr} → ${attack.name}: ${toHit}`
          if (toHit.includes('+0') || toHit.includes('-0')) offenders.push(where)
          if (!isValidRoll(toHit)) offenders.push(`${where} is not a roll`)
          if (!toHit.startsWith('1d20')) offenders.push(`${where} is not a d20 roll`)
          // A monster has no ability scores and no level, so its to-hit is flat —
          // the same asymmetry `no NPC action references an ability token` asserts
          // about the catalogue, here on a corpus nobody typed the numbers into.
          if (/\b(STR|DEX|CON|INT|WIS|CHA|PROF)\b/.test(toHit)) {
            offenders.push(`${where} names a token a reduced sheet cannot resolve`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The positive control. Every assertion above is an empty-array comparison over a
   * loop, and an empty array is also what a loop that read nothing produces — a
   * `FIGHTERS` list that had lost its combat blocks, or an id prefix that changed.
   */
  test('and the sweeps above actually read attacks, on a corpus that has some', () => {
    expect(FIGHTERS.length).toBeGreaterThan(80)
    const sample = resolvedAt(FIGHTERS[0].entry.key, FIGHTERS[0].entry.cr)
    expect(attacksOf(sample).length).toBeGreaterThan(0)
    expect(attacksOf(sample).length).toBe(FIGHTERS[0].combat.attacks.length)
    // And the needle the zero-bonus sweep is looking for is one these patterns
    // would actually find.
    expect('1d20+0'.includes('+0')).toBe(true)
    expect(toHitFromBonus(0)).toBe('1d20')
  })
})

// ---------------------------------------------------------------------------
// 10. The ordering hazard
// ---------------------------------------------------------------------------

describe('an overridden attack bonus reaches the attacks as well as the statline', () => {
  /**
   * ⚠️ **THE TEST THIS SECTION EXISTS FOR.**
   *
   * `resolveBestiary` merges the DM's overrides *first* and builds the actions
   * *afterwards*, because every attack's to-hit is composed from `attackBonus` and
   * `withCreatureOverrides` patches that field while leaving `actions` alone.
   * Composing before the merge gives a creature whose sheet reads +12 and whose
   * every weapon rolls the unoverridden number.
   *
   * **That failure is invisible on screen**, which is the whole reason it needs a
   * test rather than a careful reading. Both numbers arrive in the same payload and
   * both render without complaint; the DM sees +12 beside the armour class, clicks
   * the scimitar, and the dice throw +4. Nothing errors, nothing is out of range,
   * and no validator has an opinion — `sheetProblem` is perfectly happy with a
   * to-hit that disagrees with the sheet it sits on, because it has no way to know
   * they were meant to be the same number.
   *
   * ADR 0007 kept one attack bonus per creature specifically so that a claw and a
   * bite could never disagree. This is that decision arriving through the back door,
   * with the sheet disagreeing with itself instead.
   */
  test('an overridden bonus is on the statline and on every attack, and they agree', () => {
    const doc = {
      sheet: {
        kind: 'bestiary',
        entryKey: 'goblin',
        cr: 1,
        overrides: { attackBonus: 12 },
      } as StoredSheet,
    }
    const sheet = resolveSheet(doc) as NpcSheet

    // Both halves, stated separately. Either one alone passes over the bug.
    expect(sheet.attackBonus).toBe(12)
    expect(sheet.actions[0].toHit).toBe('1d20+12')

    // And the override really moved something, so the two agreeing is not the
    // trivial agreement of nothing having happened.
    const unoverridden = resolvedAt('goblin', 1)
    expect(unoverridden.attackBonus).not.toBe(12)
    expect(unoverridden.actions[0].toHit).not.toBe('1d20+12')
    expect(unoverridden.actions[0].toHit).toBe(toHitFromBonus(unoverridden.attackBonus as number))
  })

  /**
   * The same, over every creature that fights and at a bonus chosen so that no
   * creature's own value could be it by coincidence. One creature agreeing could be
   * luck; a hundred and some cannot.
   */
  test('for every fighting creature, and at every rating', () => {
    const wrong: string[] = []
    for (const { entry, label } of FIGHTERS) {
      for (const cr of RATINGS) {
        const sheet = resolveSheet({
          sheet: { kind: 'bestiary', entryKey: entry.key, cr, overrides: { attackBonus: 17 } },
        }) as NpcSheet
        if (sheet.attackBonus !== 17) wrong.push(`${label} @ CR ${cr}: statline ${sheet.attackBonus}`)
        for (const action of sheet.actions) {
          if (!action.id.startsWith('atk:')) continue
          if (action.toHit !== '1d20+17') {
            wrong.push(`${label} @ CR ${cr} → ${action.name}: ${action.toHit}`)
          }
        }
      }
    }
    expect(wrong).toEqual([])
    // 17 is outside nothing's range by construction, so state that it is not simply
    // the number every creature already had.
    expect(FIGHTERS.every(({ combat }) => combat.attackBonus !== 17)).toBe(true)
  })

  /**
   * A negative override, which is the case `toHitFromBonus`'s sign handling exists
   * for — and a zero one, which is the case that must not render as `1d20+0`.
   */
  test('and a negative or zero override composes a sensible roll', () => {
    const negative = resolveSheet({
      sheet: { kind: 'bestiary', entryKey: 'goblin', cr: 1, overrides: { attackBonus: -3 } },
    }) as NpcSheet
    expect(negative.attackBonus).toBe(-3)
    expect(negative.actions[0].toHit).toBe('1d20-3')

    const zero = resolveSheet({
      sheet: { kind: 'bestiary', entryKey: 'goblin', cr: 1, overrides: { attackBonus: 0 } },
    }) as NpcSheet
    expect(zero.attackBonus).toBe(0)
    expect(zero.actions[0].toHit).toBe('1d20')
    expect(zero.actions[0].toHit).not.toContain('+0')
  })

  /**
   * The DM's own extra actions are **left exactly as written** — they are ordinary
   * sheet entries, the DM chose their category and their to-hit, and rewriting
   * either would be the resolver overruling the last layer of resolution. In
   * particular the creature's composed to-hit must not be stamped onto them.
   */
  test('but the DM’s own extra actions keep the category and to-hit they were given', () => {
    const extra: SheetEntry = {
      id: 'dm-1',
      name: 'Warhorn',
      text: 'A signal that brings two more goblins.',
      roll: null,
      level: null,
      catalogueKey: null,
      category: 'passive',
    }
    const sheet = resolveSheet({
      sheet: {
        kind: 'bestiary',
        entryKey: 'goblin',
        cr: 1,
        overrides: { attackBonus: 12, extraActions: [extra] },
      } as StoredSheet,
    }) as NpcSheet

    const mine = sheet.actions.find((action) => action.id === 'dm-1')
    expect(mine).toBeDefined()
    expect(mine?.category).toBe('passive')
    expect('toHit' in (mine as unknown as Record<string, unknown>)).toBe(false)
    // The creature's own attacks still took the override, so the two policies are
    // both in force on one sheet rather than one having replaced the other.
    expect(sheet.actions[0].toHit).toBe('1d20+12')
    // And the DM's line is last, after the corpus's attacks and abilities.
    expect(sheet.actions[sheet.actions.length - 1].id).toBe('dm-1')
    expect(sheetProblem(sheet)).toBeNull()
  })
})
