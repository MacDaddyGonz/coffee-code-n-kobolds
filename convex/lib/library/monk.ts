// The Monk: five premade sheets, level 1 to 5, Warrior of the Open Hand. **New with the
// 5e (2024) conversion** — one of the four classes this library did not have.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Criminal.** The standard array goes 15 Dexterity, 14 Wisdom, 13
// Constitution, 12 Strength, 10 Intelligence, 8 Charisma, and the Criminal background's
// **+2 Dexterity and +1 Constitution** are already in the numbers below. Sleight of Hand
// and Stealth are the Criminal's two skills; Acrobatics and Insight are the class's own.
//
// ⚠️ **Focus Points are the first SHORT-REST pool this corpus has ever held.** They come
// back in full on a short rest as well as a long one, which is `restKindValidator`'s
// `'short'` and needs no partial hand-back — see `resourceValidator` in ../rest.ts, which
// refuses a `regainOnShortRest` beside one for exactly that reason. The count is *equal
// to your Monk level*, written as a literal per sheet because a sheet is per level.
//
// ⚠️ **Two features are absent and both are deliberate.**
//
// **Unarmored Movement** raises the character's Speed, and `speed` on a resolved sheet is
// set by the species and lineage layers in lib/resolve.ts and by nothing else — a class
// entry that also moved it would be a second authority for one number. That is the rule
// barbarian.ts states at length for Fast Movement, and it costs the Monk its level 2
// movement bonus in the same way.
//
// **Open Hand Technique is written with one of its three options.** Push shoves a
// creature 15 feet and Topple sets Prone, and docs/requirements.md excludes
// movement-detriment status effects; Addle is the one that does not touch either, so it
// is the one on the sheet. The same call fighter.ts made about two Battle Master
// manoeuvres for four milestones.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  sleightOfHand: true,
  stealth: true,
  acrobatics: true,
  insight: true,
}

const UNARMED_STRIKE: LibraryEntry = {
  name: 'Unarmed Strike',
  text: 'A fist, an elbow, a knee or a heel, reach 5 feet. Martial Arts lets it roll the die below instead of the flat 1 anybody else would get, and swing off Dexterity rather than Strength. A bonus action buys you a second one.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
}

const UNARMED_STRIKE_AT_5: LibraryEntry = { ...UNARMED_STRIKE, roll: '1d8+DEX' }

const SPEAR: LibraryEntry = {
  name: 'Spear',
  text: 'A monk weapon, so Dexterity carries it and it rolls your Martial Arts die. Reach 5 feet, or thrown 20 feet comfortably.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'sap',
}

const SPEAR_AT_5: LibraryEntry = { ...SPEAR, roll: '1d8+DEX' }

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry five. Light and finesse, thrown 20 feet without trouble, and a monk weapon like the spear.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const MARTIAL_ARTS: LibraryEntry = {
  name: 'Martial Arts',
  text: 'Unarmed and out of armour, or holding a simple melee weapon or a light martial one: your strikes roll a d6 instead of their usual damage, they swing off Dexterity, and a bonus action buys you one more unarmed strike every turn.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const MARTIAL_ARTS_AT_5: LibraryEntry = {
  ...MARTIAL_ARTS,
  text: 'Unarmed and out of armour, or holding a simple melee weapon or a light martial one: your strikes roll a d8 now rather than a d6, they swing off Dexterity, and a bonus action buys you one more unarmed strike every turn.',
}

const UNARMOURED_DEFENCE: LibraryEntry = {
  name: 'Unarmored Defense',
  text: 'No armour and no shield, and your Armour Class is 10 plus your Dexterity and your Wisdom — which is the number on this sheet. The whole class is built on it, so do not put armour on.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ALERT: LibraryEntry = {
  name: 'Alert',
  text: 'Origin feat. You add your proficiency bonus to initiative, and once the order is rolled you may swap your place in it with a willing ally\'s — neither of you being incapacitated at the time.',
  roll: null,
  level: null,
  catalogueKey: 'alert',
  category: 'passive',
}

/**
 * Focus Points — a **short-rest** pool, and the first one this corpus has held.
 *
 * The count is *equal to your Monk level*, so it is a literal that is exact on each
 * sheet: two at level 2, three at level 3, and so on. `regainOnShortRest` is absent and
 * has to be — a short-rest resource already returns in full, and `usesProblem` in
 * lib/sheet.ts refuses the pairing as two rules about the same rest that disagree.
 */
const MONKS_FOCUS: LibraryEntry = {
  name: "Monk's Focus",
  text: 'A well of energy you spend a point at a time, and all of it comes back on a short rest. **Flurry of Blows**: 1 point for two unarmed strikes as a bonus action. **Patient Defense**: Disengage as a bonus action, or 1 point for Disengage and Dodge together. **Step of the Wind**: Dash as a bonus action, or 1 point for Dash and Disengage together.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'short' },
}

const MONKS_FOCUS_AT_3: LibraryEntry = { ...MONKS_FOCUS, uses: { max: 3, recharge: 'short' } }
const MONKS_FOCUS_AT_4: LibraryEntry = { ...MONKS_FOCUS, uses: { max: 4, recharge: 'short' } }
const MONKS_FOCUS_AT_5: LibraryEntry = { ...MONKS_FOCUS, uses: { max: 5, recharge: 'short' } }

const UNCANNY_METABOLISM: LibraryEntry = {
  name: 'Uncanny Metabolism',
  text: 'Once between long rests, as initiative is rolled: every spent Focus Point comes back, and you heal this roll plus your monk level. The best possible start to a fight you were not ready for.',
  roll: '1d6',
  level: null,
  catalogueKey: null,
  category: 'action',
  uses: { max: 1, recharge: 'long' },
}

const UNCANNY_METABOLISM_AT_5: LibraryEntry = { ...UNCANNY_METABOLISM, roll: '1d8' }

const DEFLECT_ATTACKS: LibraryEntry = {
  name: 'Deflect Attacks',
  text: 'A reaction when something hits you for bludgeoning, piercing or slashing damage: take this roll plus your monk level off the total. Reduce it to nothing and you may spend a Focus Point to throw the force back at somebody.',
  roll: '1d10+DEX',
  level: null,
  catalogueKey: null,
  category: 'action',
}

const OPEN_HAND_TECHNIQUE: LibraryEntry = {
  name: 'Open Hand Technique',
  text: 'Every strike from a Flurry of Blows that lands can also **Addle** its target: it makes no opportunity attacks until the start of its next turn. Walk away from it, or walk past it, and it can do nothing about either.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const SLOW_FALL: LibraryEntry = {
  name: 'Slow Fall',
  text: 'A reaction as you fall takes five times your monk level off the damage. At level 4 that is 20, which is most falls anybody survives anyway — and by level 10 it is most falls at all.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Dexterity.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

const EXTRA_ATTACK: LibraryEntry = {
  name: 'Extra Attack',
  text: 'When you take the Attack action you attack twice instead of once — and the bonus-action strike from Martial Arts is still on top of that, so three is an ordinary turn.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const STUNNING_STRIKE: LibraryEntry = {
  name: 'Stunning Strike',
  text: 'Once a turn, when a monk weapon or an unarmed strike lands, spend a Focus Point: the target makes a Constitution saving throw against your save DC or is stunned until the start of your next turn.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const EQUIPMENT =
  'A spear, five daggers, a set of artisan\'s tools and an explorer\'s pack, plus the criminal\'s thieves\' tools, crowbar, two pouches and travelling clothes.'

const HIT_DIE = 8

export const MONK: ClassLibrary = {
  classKey: 'monk',
  base: {
    1: {
      level: 1,
      // Dexterity and Wisdom, in that order, because Unarmored Defense adds both to the
      // Armour Class and the first of them also carries every attack. Constitution third
      // — a monk with no armour is going to be hit eventually.
      abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
      saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 15,
      maxHp: 10,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [UNARMED_STRIKE, SPEAR, DAGGER, MARTIAL_ARTS, UNARMOURED_DEFENCE, ALERT],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: no armour, an Armour Class of 15 anyway, and two attacks a turn from level 1 because Martial Arts gives you a free unarmed strike off your bonus action.',
    },
    2: {
      level: 2,
      abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
      saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 15,
      maxHp: 17,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        UNARMED_STRIKE,
        SPEAR,
        DAGGER,
        MARTIAL_ARTS,
        UNARMOURED_DEFENCE,
        MONKS_FOCUS,
        UNCANNY_METABOLISM,
        ALERT,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Focus Points arrive, and unlike almost everything else in the game they all come back on a short rest. Two of them buy a Flurry of Blows, a Patient Defense or a Step of the Wind whenever the turn calls for one.',
    },
  },
  paths: {
    'open-hand': {
      3: {
        level: 3,
        abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 24,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          UNARMED_STRIKE,
          SPEAR,
          DAGGER,
          MARTIAL_ARTS,
          UNARMOURED_DEFENCE,
          MONKS_FOCUS_AT_3,
          UNCANNY_METABOLISM,
          DEFLECT_ATTACKS,
          OPEN_HAND_TECHNIQUE,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'You are a Warrior of the Open Hand. Deflect Attacks takes a serious bite out of anything that hits you, and every Flurry of Blows strike can now stop its target making opportunity attacks.',
      },
      4: {
        level: 4,
        // The improvement goes into Dexterity: 17 → 19. It is the one score on this sheet
        // that is paid three times over — the Armour Class, every attack roll and every
        // damage roll all move together.
        abilities: { str: 12, dex: 19, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 16,
        maxHp: 31,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          UNARMED_STRIKE,
          SPEAR,
          DAGGER,
          MARTIAL_ARTS,
          UNARMOURED_DEFENCE,
          MONKS_FOCUS_AT_4,
          UNCANNY_METABOLISM,
          DEFLECT_ATTACKS,
          OPEN_HAND_TECHNIQUE,
          SLOW_FALL,
          ABILITY_SCORE_IMPROVEMENT,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Dexterity goes from 17 to 19, which raises your Armour Class to 16 and every attack and damage roll by one at the same time. A fourth Focus Point, and Slow Fall for the drop nobody planned.',
      },
      5: {
        level: 5,
        abilities: { str: 12, dex: 19, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 16,
        maxHp: 38,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          UNARMED_STRIKE_AT_5,
          SPEAR_AT_5,
          DAGGER,
          MARTIAL_ARTS_AT_5,
          UNARMOURED_DEFENCE,
          MONKS_FOCUS_AT_5,
          UNCANNY_METABOLISM_AT_5,
          DEFLECT_ATTACKS,
          OPEN_HAND_TECHNIQUE,
          SLOW_FALL,
          EXTRA_ATTACK,
          STUNNING_STRIKE,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Three things at once: Extra Attack, so an ordinary turn is three strikes; a Martial Arts die of d8; and Stunning Strike, which for one Focus Point can take a creature out of the fight until your next turn.',
      },
    },
  },
}
