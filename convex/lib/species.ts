// The eight races, and the only place a race changes a number.
//
// **This is a deliberate change to the rules subset.** docs/requirements.md said
// "No racial abilities", and that exclusion was lifted for Milestone 4 — see
// ADR 0006. It is worth knowing what that bought and what it cost: a race is now the
// second thing a beginner picks and the first thing that makes their character feel
// unlike anybody else's, and in exchange three of the eight touch arithmetic that
// the resolver has to apply in the right order and exactly once.
//
// Shared with the browser, and deliberately free of any `lib/library/` import: the
// picker needs these eight names and blurbs, and nothing else about them. See the
// note at the top of lib/classes.ts for why that separation matters to the bundle.

import { v } from 'convex/values'

import type { AbilityKey, ContentEntry } from './sheet'

export const SPECIES_KEYS = [
  'human',
  'elf',
  'dwarf',
  'halfling',
  'half-orc',
  'tiefling',
  'dragonborn',
  'goliath',
] as const
export type SpeciesKey = (typeof SPECIES_KEYS)[number]

export const speciesKeyValidator = v.union(
  v.literal('human'),
  v.literal('elf'),
  v.literal('dwarf'),
  v.literal('halfling'),
  v.literal('half-orc'),
  v.literal('tiefling'),
  v.literal('dragonborn'),
  v.literal('goliath'),
)

/**
 * An ability the character may spend once between long rests.
 *
 * Tracked rather than merely described, because these are precisely the things a
 * table forgets: Heroic Inspiration goes unused for three sessions and the Half-Orc's
 * one free survival gets spent twice in the same fight. The flag lives in
 * `characterVitals` beside hit points and hit dice, because it is **state** — a rest
 * changes it, an edit does not (ADR 0005).
 *
 * The app never enforces the effect. It remembers whether it has been spent, which is
 * the whole of what is being asked for and stops well short of a rules engine.
 */
export type PerRestAbility = {
  key: string
  name: string
  text: string
}

export type Species = {
  key: SpeciesKey
  name: string
  /** One line for the dropdown, written for somebody who has never played. */
  blurb: string
  /** The full trait, always shown on the sheet whether or not it does anything mechanical. */
  traitName: string
  traitText: string
  /** Added to the library sheet's scores. Absent for the five that change no numbers. */
  abilityBonus?: Partial<Record<AbilityKey, number>>
  /** Extra maximum hit points per character level. The Dwarf, and only the Dwarf. */
  hpPerLevel?: number
  /** Feet added to the base 35. The Goliath, and only the Goliath. */
  speedBonus?: number
  // Both `ContentEntry` — the sheet entry with its **category answered**. Taken from
  // lib/sheet.ts rather than from lib/library/types.ts, which declares the same alias:
  // this module is imported by the browser for its dropdown, and `bundleGuard` and
  // `corpusGuard` both refuse a specifier naming a corpus directory. The shared type
  // lives in the module both sides may already see.
  /** Spells this race hands over for free, appended to the sheet's spell list. */
  grantedSpells?: ContentEntry[]
  /** Feats and abilities handed over for free, appended to the sheet's feat list. */
  grantedFeats?: ContentEntry[]
  /** Spendable once per long rest. Empty for the six that have nothing to spend. */
  perRest?: PerRestAbility[]
}

export const SPECIES: readonly Species[] = [
  {
    key: 'human',
    name: 'Human',
    blurb: 'Adaptable, and lucky when it counts',
    traitName: 'Heroic Inspiration',
    traitText:
      'Once between long rests you may reroll any d20 you have just rolled, and must use the new result. Spending it is the whole cost — nobody has to be asked.',
    perRest: [
      {
        key: 'heroic-inspiration',
        name: 'Heroic Inspiration',
        text: 'Reroll a d20 you have just rolled. Once per long rest.',
      },
    ],
  },
  {
    key: 'elf',
    name: 'Elf',
    blurb: 'Quick, keen-eyed, sees in the dark',
    traitName: 'Darkvision',
    traitText:
      'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
    // The one race that moves an ability score. Applied to the library's standard
    // array, which is allocated without considering race precisely so that this can
    // be added on top rather than multiplying the library by eight.
    abilityBonus: { dex: 2 },
  },
  {
    key: 'dwarf',
    name: 'Dwarf',
    blurb: 'Hardy — harder to knock down than anyone',
    traitName: 'Dwarven Toughness',
    traitText:
      'Your maximum hit points rise by one for every level you have. It is quiet, and by level five it is the difference between standing and not.',
    hpPerLevel: 1,
  },
  {
    key: 'halfling',
    name: 'Halfling',
    blurb: 'Small, cheerful, impossible to pin down',
    traitName: 'Lucky',
    traitText:
      'When you roll a 1 on a d20 test, roll again and use the new result. Always on — there is nothing to spend and nothing to remember.',
    // Deliberately not a per-rest ability. It is a standing rule rather than a
    // resource, so there is no flag to track and none is offered.
  },
  {
    key: 'half-orc',
    name: 'Half-Orc',
    blurb: 'Refuses to go down',
    traitName: 'Relentless Endurance',
    traitText:
      'When you would drop to 0 hit points and are not killed outright, you drop to 1 instead. Once per long rest.',
    perRest: [
      {
        key: 'relentless-endurance',
        name: 'Relentless Endurance',
        text: 'Drop to 1 hit point instead of 0. Once per long rest.',
      },
    ],
  },
  {
    key: 'tiefling',
    name: 'Tiefling',
    blurb: 'Infernal blood, and a knack for the uncanny',
    traitName: 'Infernal Legacy',
    traitText:
      'You know the Thaumaturgy cantrip, and it costs you nothing to keep. It appears on your spell list already.',
    grantedSpells: [
      {
        name: 'Thaumaturgy',
        text: 'A harmless show of supernatural power within 30 feet — your voice booms, flames change colour, the ground trembles, a door slams. Up to a minute, and worth far more at a table than in a fight.',
        roll: null,
        level: 0,
        catalogueKey: null,
        // Nothing is rolled and nothing is aimed — the cantrip is declared and it is
        // up, which is the definition of a passive rather than a judgement made here.
        category: 'passive',
      },
    ],
  },
  {
    key: 'dragonborn',
    name: 'Dragonborn',
    blurb: 'Draconic, and breathes fire',
    // Named for the ancestry rather than the weapon, because the weapon itself is
    // granted below as a rollable entry — and a trait sharing a name with a granted
    // feat put "Breath Weapon" on every Dragonborn's sheet twice, with only one of
    // the two rollable. The uniqueness check in `sheetProblem` did not catch it: the
    // ids differ (`race:dragonborn` against `race-dragonborn:breath-weapon`), so the
    // sheet saved cleanly and the duplication was purely something a player saw.
    traitName: 'Draconic Ancestry',
    traitText:
      'Draconic blood runs in you, and shows: scales, a colour, and the breath that comes with it. The Breath Weapon below is yours from the moment you draw one.',
    grantedFeats: [
      {
        name: 'Breath Weapon',
        text: 'Exhale energy in a 15-foot cone. Dexterity saving throw for half. Recharges on a short or long rest.',
        roll: '2d6',
        level: null,
        catalogueKey: null,
        // An `action` despite the name: the cone simply goes off and the target saves
        // against it, so there is nothing to land first and therefore no to-hit. A
        // `weapon` here would promise the dice work a second roll that does not exist.
        category: 'action',
      },
    ],
  },
  {
    key: 'goliath',
    name: 'Goliath',
    blurb: 'Enormous, and faster than you would think',
    traitName: "Giant's Might",
    traitText:
      'You count as Large. Your speed is 10 feet higher than everyone else, and you have Advantage on Strength checks.',
    speedBonus: 10,
  },
]

const SPECIES_BY_KEY = new Map(SPECIES.map((entry) => [entry.key, entry]))

/** Non-null: `SpeciesKey` is derived from the same list, so an unknown key cannot exist. */
export function species(key: SpeciesKey): Species {
  return SPECIES_BY_KEY.get(key)!
}

/**
 * Every once-per-rest ability a race brings. Flat, because the sheet shows one list
 * and a race with two of them should not need the caller to know that.
 */
export function perRestAbilities(key: SpeciesKey): PerRestAbility[] {
  // Copied, not handed out. `SPECIES` is module state and a Convex isolate outlives
  // the request that warmed it, so a caller that sorted or pushed to this array
  // would corrupt the race definition for every later query until the next deploy.
  // Nothing does today; `defaultPcSheet` and `noSkills` both build fresh objects for
  // exactly this reason and have a test pinning it.
  return [...(species(key).perRest ?? [])]
}
