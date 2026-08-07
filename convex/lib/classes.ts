// The twelve classes and their one archetype each — names, keys, one line of help
// apiece, and the ability a caster casts with.
//
// **Deliberately just the labels.** The sixty premade sheets live in `lib/library/`
// and are never imported by the browser: the server resolves a character and sends
// a finished sheet over the wire, so all a client needs to draw the two dropdowns
// is this file and `lib/species.ts`. Keeping the two apart is what stops ~150 KB of
// stat blocks landing in a bundle that is already close to a megabyte, for data no
// client ever reads.
//
// ⚠️ **The archetype stopped being a choice between two, and that is a LICENSING fact
// rather than a design one.** This file used to carry two archetypes per class, described
// as "the two most popular subclasses" and written from general knowledge — and no SRD,
// 2014 or 2024, contains more than one subclass per class. The eight second archetypes
// therefore appeared in no source at all, and they are retired by name in
// `RETIRED_SUBCLASSES` below. What arrives instead is the twelve that are licensed.
//
// The consequence for the *type* is the part worth reading: `subclasses` stays a **tuple**
// — `readonly [Subclass]` rather than `readonly Subclass[]` — because the mechanical
// refusal is worth more than the flexibility. A second archetype cannot be appended
// without changing that line, which is a decision somebody has to make on the record
// rather than something a content file does on the way past.

import { v } from 'convex/values'

// Type-only, and it has to stay that way: lib/sheet.ts imports `SUBCLASS_LEVEL`,
// `classKeyValidator` and `subclassOf` from this module at runtime, so a value import
// back would close a cycle at module scope where both sides are evaluated eagerly. That
// is the relationship lib/skills.ts has to lib/sheet.ts, documented there for the same
// reason.
import type { AbilityKey } from './sheet'

export const CLASS_KEYS = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
] as const
export type ClassKey = (typeof CLASS_KEYS)[number]

/**
 * The same twelve as a Convex validator, **hand-spelled rather than derived from the
 * array above**, on the convention `tokenLayerValidator`, `restKindValidator` and
 * `weaponMasteryValidator` all state at length: a generated union would make the two
 * agree by construction and delete the only guard that can fail, which is a literal
 * added to the *validator* alone — a class the schema would store and that `findClass`
 * could not resolve.
 *
 * ⚠️ **Widening a stored union is additive and safe, and no class was retired**, which is
 * why the four new members needed no migration and no `storedClassKeyValidator`. Half-Orc
 * one file over is the counter-example: *removing* a literal from a stored union makes
 * `npx convex deploy` fail against a deployment holding a row that uses it, before any
 * lookup is ever reached. Adding one cannot, because every existing row still validates.
 */
export const classKeyValidator = v.union(
  v.literal('barbarian'),
  v.literal('bard'),
  v.literal('cleric'),
  v.literal('druid'),
  v.literal('fighter'),
  v.literal('monk'),
  v.literal('paladin'),
  v.literal('ranger'),
  v.literal('rogue'),
  v.literal('sorcerer'),
  v.literal('warlock'),
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
  /**
   * WHICH ABILITY THIS CLASS CASTS WITH. Absent on the four that cast nothing.
   *
   * ⚠️ **This is the only thing stored, and the two numbers a 2024 sheet prints beside
   * it are derived.** `spellSaveDcOf` and `spellAttackBonusOf` in lib/sheet.ts are pure
   * functions of the resolved sheet's ability, its score and its level, and **neither
   * number appears on any of the sixty library sheets**. A stored copy would be a copy
   * to keep in step with the score it comes from, which is `passivePerception`'s argument
   * reaching a second pair of numbers.
   *
   * It lives on the class rather than on `LibrarySheet` because it is a fact about the
   * *class* and not about the level: a Cleric casts off Wisdom at level 1 and at level 5,
   * so five sheets repeating it would be five places for it to disagree. `resolvePreset`
   * reads it here and puts it on the resolved sheet.
   */
  spellcastingAbility?: AbilityKey
  /**
   * ⚠️ **Exactly one, granted at `SUBCLASS_LEVEL`, and a TUPLE rather than an array.**
   *
   * `readonly [Subclass]` and not `readonly Subclass[]`, deliberately. The array spelling
   * compiles for zero archetypes and for five, and both are wrong: a class with none is a
   * class whose levels 3–5 have no sheets at all, and a class with two is this file's own
   * history — eight archetypes written from general knowledge, permitted by a type that
   * asked no questions. The tuple makes a second one an edit to this line.
   */
  subclasses: readonly [Subclass]
}

export const CLASSES: readonly CharacterClass[] = [
  {
    key: 'barbarian',
    name: 'Barbarian',
    blurb: 'Tough melee warrior',
    hitDieFaces: 12,
    subclasses: [
      { key: 'berserker', name: 'Path of the Berserker', blurb: 'Rage harder, hit more often' },
    ],
  },
  {
    key: 'bard',
    name: 'Bard',
    blurb: 'Performer and support',
    hitDieFaces: 8,
    spellcastingAbility: 'cha',
    subclasses: [{ key: 'lore', name: 'College of Lore', blurb: 'Knows a little of everything' }],
  },
  {
    key: 'cleric',
    name: 'Cleric',
    blurb: 'Healer and holy magic',
    hitDieFaces: 8,
    spellcastingAbility: 'wis',
    subclasses: [{ key: 'life', name: 'Life Domain', blurb: 'The strongest healer in the game' }],
  },
  {
    key: 'druid',
    name: 'Druid',
    blurb: 'Nature magic, and the shape of a beast',
    hitDieFaces: 8,
    spellcastingAbility: 'wis',
    subclasses: [
      { key: 'land', name: 'Circle of the Land', blurb: 'Magic drawn from the country around you' },
    ],
  },
  {
    key: 'fighter',
    name: 'Fighter',
    blurb: 'Master of weapons',
    hitDieFaces: 10,
    subclasses: [{ key: 'champion', name: 'Champion', blurb: 'Simple, sturdy, crits more often' }],
  },
  {
    key: 'monk',
    name: 'Monk',
    blurb: 'Fast, unarmoured, hits with everything',
    hitDieFaces: 8,
    subclasses: [
      {
        key: 'open-hand',
        name: 'Warrior of the Open Hand',
        blurb: 'The best unarmed fighter there is',
      },
    ],
  },
  {
    key: 'paladin',
    name: 'Paladin',
    blurb: 'Holy warrior',
    hitDieFaces: 10,
    spellcastingAbility: 'cha',
    subclasses: [{ key: 'devotion', name: 'Oath of Devotion', blurb: 'The shining knight' }],
  },
  {
    key: 'ranger',
    name: 'Ranger',
    blurb: 'Archer and wilderness expert',
    hitDieFaces: 10,
    spellcastingAbility: 'wis',
    subclasses: [{ key: 'hunter', name: 'Hunter', blurb: 'Straightforward and deadly' }],
  },
  {
    key: 'rogue',
    name: 'Rogue',
    blurb: 'Sneaky and skilled',
    hitDieFaces: 8,
    subclasses: [{ key: 'thief', name: 'Thief', blurb: 'Fast hands and faster feet' }],
  },
  {
    key: 'sorcerer',
    name: 'Sorcerer',
    blurb: 'Magic in the blood, bent to fit',
    hitDieFaces: 6,
    spellcastingAbility: 'cha',
    subclasses: [
      { key: 'draconic', name: 'Draconic Sorcery', blurb: 'Dragon scales and dragon fire' },
    ],
  },
  {
    key: 'warlock',
    name: 'Warlock',
    blurb: 'A bargain with something enormous',
    hitDieFaces: 8,
    spellcastingAbility: 'cha',
    subclasses: [{ key: 'fiend', name: 'Fiend Patron', blurb: 'Fire, and a patron with plans' }],
  },
  {
    key: 'wizard',
    name: 'Wizard',
    blurb: 'Powerful spellcaster',
    hitDieFaces: 6,
    spellcastingAbility: 'int',
    subclasses: [{ key: 'evocation', name: 'Evoker', blurb: 'Fireballs, and lots of them' }],
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
 *
 * ⚠️ **Eight archetypes have now actually been retired, so this is what keeps those
 * characters openable — and it is only half of what they need.** This answers null,
 * `librarySheet` answers null beside it, and `resolvePreset` then keeps the character's
 * level, name and hit points while losing the numbers it was borrowing. What tells the
 * *player* which archetype has gone is `RETIRED_SUBCLASSES` below and not this: a blank
 * where an archetype used to be reads as a bug, and the name reads as a choice that needs
 * making again — which is what it is.
 */
export function subclassOf(key: ClassKey, subclassKey: string | null): Subclass | null {
  if (subclassKey === null) return null
  return findClass(key)?.subclasses.find((entry) => entry.key === subclassKey) ?? null
}

/**
 * The archetypes this application used to have and no longer does, with what to call them.
 *
 * ⚠️ **A retired key is tolerated on READ and refused on WRITE**, which is the asymmetry
 * `subclassOf`, `catalogueEntry`, `librarySheet` and `RETIRED_SPECIES` all keep. A character
 * holding one opens, keeps its class, its level and its hit points, and is told plainly that
 * its archetype needs choosing again; nothing lets a *new* character be built with one,
 * because `storedSheetProblem` refuses any archetype `subclassOf` does not recognise.
 *
 * **All eight appear in no SRD**, which is why this is a list of names rather than a mapping
 * onto survivors: a Battle Master is not silently converted into a Champion, because they are
 * not the same character. What such a character keeps is everything except the archetype half
 * of its sheet.
 *
 * ⚠️ **Four archetypes were RENAMED rather than retired, and are deliberately absent.**
 * `evocation` is now called *Evoker* and `berserker` *Path of the Berserker*; `lore`, `life`,
 * `devotion`, `hunter`, `thief` and `champion` kept both. No key moved, so nothing was
 * orphaned and there is nothing to say — and putting a renamed key here would tell a wizard
 * whose sheet still resolves perfectly that their school has gone.
 */
export const RETIRED_SUBCLASSES: Record<string, string> = {
  'battle-master': 'Battle Master',
  assassin: 'Assassin',
  vengeance: 'Oath of Vengeance',
  valour: 'College of Valour',
  light: 'Light Domain',
  'wild-heart': 'Path of the Wild Heart',
  divination: 'School of Divination',
  'beast-master': 'Beast Master',
}

/**
 * What to call a stored archetype key, whether or not it still exists.
 *
 * `speciesLabel` in lib/species.ts is the counterpart, written for the same reason: the
 * stored key is not thrown away, so a character built before the conversion still says
 * *what it was* on a sheet whose numbers it has lost.
 */
export function subclassLabel(key: ClassKey, subclassKey: string): string {
  return subclassOf(key, subclassKey)?.name ?? RETIRED_SUBCLASSES[subclassKey] ?? subclassKey
}

/**
 * The level at which an archetype is chosen, and below which none exists.
 *
 * ⚠️ **Three, not two, and the SRD is unanimous about it** — which is worth saying because
 * 2014 was not. Moving this constant is what made the library rebuild one commit rather than
 * two: every level-2 archetype sheet the old corpus held became unreachable the moment this
 * read 3, so the constant and the content had to travel together. `ClassLibrary` in
 * lib/library/types.ts carries the other half of the change — levels 1 **and 2** are shared,
 * and one path covers 3 to 5.
 */
export const SUBCLASS_LEVEL = 3

/** The levels the library covers. Beyond this a character stops gaining anything. */
export const MIN_LIBRARY_LEVEL = 1
export const MAX_LIBRARY_LEVEL = 5
