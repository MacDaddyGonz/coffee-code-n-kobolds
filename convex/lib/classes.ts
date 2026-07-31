// The eight classes and their two archetypes each — names, keys and one line of
// help apiece.
//
// **Deliberately just the labels.** The 72 premade sheets live in `lib/library/`
// and are never imported by the browser: the server resolves a character and sends
// a finished sheet over the wire, so all a client needs to draw the two dropdowns
// is this file and `lib/races.ts`. Keeping the two apart is what stops ~150 KB of
// stat blocks landing in a bundle that is already close to a megabyte, for data no
// client ever reads.
//
// The pairings are the spec's — the two most popular subclasses per class — chosen
// so that a beginner picking blind cannot pick badly.

import { v } from 'convex/values'

export const CLASS_KEYS = [
  'barbarian',
  'bard',
  'cleric',
  'fighter',
  'paladin',
  'ranger',
  'rogue',
  'wizard',
] as const
export type ClassKey = (typeof CLASS_KEYS)[number]

export const classKeyValidator = v.union(
  v.literal('barbarian'),
  v.literal('bard'),
  v.literal('cleric'),
  v.literal('fighter'),
  v.literal('paladin'),
  v.literal('ranger'),
  v.literal('rogue'),
  v.literal('wizard'),
)

export type Subclass = {
  key: string
  name: string
  /** One line, written for somebody who has never played. */
  blurb: string
}

export type CharacterClass = {
  key: ClassKey
  name: string
  blurb: string
  /**
   * The die a character of this class takes at each level. Held here as well as on
   * every library sheet so `library.test.ts` can assert the two agree — a d6 rogue
   * is the sort of typo that survives a hundred readings.
   */
  hitDieFaces: 6 | 8 | 10 | 12
  /** Exactly two, chosen at level 2 and never afterwards without the DM. */
  subclasses: readonly [Subclass, Subclass]
}

export const CLASSES: readonly CharacterClass[] = [
  {
    key: 'barbarian',
    name: 'Barbarian',
    blurb: 'Tough melee warrior',
    hitDieFaces: 12,
    subclasses: [
      { key: 'berserker', name: 'Berserker', blurb: 'Rage harder, hit more often' },
      { key: 'wild-heart', name: 'Wild Heart', blurb: 'Borrow the strengths of beasts' },
    ],
  },
  {
    key: 'bard',
    name: 'Bard',
    blurb: 'Performer and support',
    hitDieFaces: 8,
    subclasses: [
      { key: 'lore', name: 'College of Lore', blurb: 'Knows a little of everything' },
      { key: 'valour', name: 'College of Valour', blurb: 'Sings from the front rank' },
    ],
  },
  {
    key: 'cleric',
    name: 'Cleric',
    blurb: 'Healer and holy magic',
    hitDieFaces: 8,
    subclasses: [
      { key: 'life', name: 'Life Domain', blurb: 'The strongest healer in the game' },
      { key: 'light', name: 'Light Domain', blurb: 'Fire, radiance and blazing damage' },
    ],
  },
  {
    key: 'fighter',
    name: 'Fighter',
    blurb: 'Master of weapons',
    hitDieFaces: 10,
    subclasses: [
      { key: 'champion', name: 'Champion', blurb: 'Simple, sturdy, crits more often' },
      { key: 'battle-master', name: 'Battle Master', blurb: 'Clever tricks in a fight' },
    ],
  },
  {
    key: 'paladin',
    name: 'Paladin',
    blurb: 'Holy warrior',
    hitDieFaces: 10,
    subclasses: [
      { key: 'devotion', name: 'Oath of Devotion', blurb: 'The shining knight' },
      { key: 'vengeance', name: 'Oath of Vengeance', blurb: 'Hunts down the wicked' },
    ],
  },
  {
    key: 'ranger',
    name: 'Ranger',
    blurb: 'Archer and wilderness expert',
    hitDieFaces: 10,
    subclasses: [
      { key: 'hunter', name: 'Hunter', blurb: 'Straightforward and deadly' },
      { key: 'beast-master', name: 'Beast Master', blurb: 'Fights beside an animal companion' },
    ],
  },
  {
    key: 'rogue',
    name: 'Rogue',
    blurb: 'Sneaky and skilled',
    hitDieFaces: 8,
    subclasses: [
      { key: 'thief', name: 'Thief', blurb: 'Fast hands and faster feet' },
      { key: 'assassin', name: 'Assassin', blurb: 'Devastating on the first strike' },
    ],
  },
  {
    key: 'wizard',
    name: 'Wizard',
    blurb: 'Powerful spellcaster',
    hitDieFaces: 6,
    subclasses: [
      { key: 'evocation', name: 'School of Evocation', blurb: 'Fireballs, and lots of them' },
      { key: 'divination', name: 'School of Divination', blurb: 'Bends luck and sees ahead' },
    ],
  },
]

const CLASS_BY_KEY = new Map(CLASSES.map((entry) => [entry.key, entry]))

/**
 * The class, or null for one that has been retired.
 *
 * `ClassKey` makes an unknown key unconstructable *in new code*, which is not the
 * same as unconstructable — a character stores its class, so removing an entry from
 * `CLASS_KEYS` leaves every character who chose it holding a key nothing resolves.
 * An earlier version of this asserted the key must exist, and the resolver then read
 * `.name` off the undefined it got back: retiring a class was a one-line edit that
 * turned `characters.list` into a `TypeError` for the **whole party**, not just for
 * the character concerned.
 *
 * So this returns null and callers cope, which is the stance `catalogueEntry` and
 * `subclassOf` already take for the same reason.
 */
export function findClass(key: string): CharacterClass | null {
  return CLASS_BY_KEY.get(key as ClassKey) ?? null
}

/**
 * The archetype, or null.
 *
 * Returns null rather than throwing for an unknown key, because a subclass key is
 * stored on a character and this file is content: retiring or renaming an archetype
 * must leave the characters that chose it readable rather than breaking their sheet.
 * The same stance `catalogueEntry` takes in lib/rules.ts, for the same reason.
 */
export function subclassOf(key: ClassKey, subclassKey: string | null): Subclass | null {
  if (subclassKey === null) return null
  return findClass(key)?.subclasses.find((entry) => entry.key === subclassKey) ?? null
}

/** The level at which an archetype is chosen, and below which none exists. */
export const SUBCLASS_LEVEL = 2

/** The levels the library covers. Beyond this a character stops gaining anything. */
export const MIN_LIBRARY_LEVEL = 1
export const MAX_LIBRARY_LEVEL = 5
