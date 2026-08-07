// The Sorcerer: five premade sheets, level 1 to 5, Draconic Sorcery. **New with the
// 5e (2024) conversion** — one of the four classes this library did not have.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Acolyte.** The standard array goes 15 Charisma, 14 Constitution, 13
// Dexterity, 12 Wisdom, 10 Intelligence, 8 Strength, and the Acolyte background's **+2
// Charisma and +1 Wisdom** are already in the numbers below. Insight and Religion are the
// Acolyte's two skills; Arcana and Persuasion are the class's own. Acolyte is the only
// one of the four SRD backgrounds that touches Charisma — see bard.ts, which says why
// that is a fact about a four-row table rather than a preference.
//
// ⚠️ **The armour class jumps from 11 to 14 at level 3, and that is Draconic Resilience
// rather than a slip.** A sorcerer wears nothing at all, so levels 1 and 2 really are 10
// plus Dexterity; the subclass then replaces it with 10 plus Dexterity plus Charisma,
// which on this build is the single largest defensive step any class in this library
// takes. The hit point maximum moves for the same reason — +3 at level 3 and one more
// per level after — which is why the numbers below are not a flat six a level.
//
// **Sorcery Points recharge on a LONG rest and Sorcerous Restoration is a separate
// entry**, not a `regainOnShortRest` on the pool. The feature hands back half your level
// in points on a short rest but only **once between long rests**, and
// `regainOnShortRest` means *every* short rest — writing it there would have the
// application quietly returning points at every stop. See ../rest.ts, which sets out why
// restoring too much is the worse of the two errors.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  insight: true,
  religion: true,
  arcana: true,
  persuasion: true,
}

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry two, and you will not be using them if anything else is available. Light and finesse, thrown 20 feet without trouble.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const INNATE_SORCERY: LibraryEntry = {
  name: 'Innate Sorcery',
  text: 'A bonus action lets the magic in you off the leash for a minute: your spell save DC goes up by 1 and every attack roll you make with a sorcerer spell is rolled with advantage. Twice between long rests.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long' },
}

const MAGIC_INITIATE: LibraryEntry = {
  name: 'Magic Initiate',
  text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: 'magic-initiate',
  category: 'passive',
}

/**
 * Sorcery Points — equal to your Sorcerer level from level 2, so a literal per sheet.
 *
 * Long rest, and deliberately no `regainOnShortRest`: see the header. Metamagic and
 * spell-slot creation both spend out of this one pool, which is the shared-pool shape
 * cleric.ts describes — the count lives on one line and the others say what they cost.
 */
const FONT_OF_MAGIC: LibraryEntry = {
  name: 'Font of Magic',
  text: 'A well of raw magic measured in Sorcery Points, all of it back on a long rest. Spend a spell slot to gain points equal to its level, or spend points on a bonus action to make a slot — 2 points for a level 1 slot, 3 for a level 2, 5 for a level 3. Made slots vanish on a long rest.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long' },
}

const FONT_OF_MAGIC_AT_3: LibraryEntry = { ...FONT_OF_MAGIC, uses: { max: 3, recharge: 'long' } }
const FONT_OF_MAGIC_AT_4: LibraryEntry = { ...FONT_OF_MAGIC, uses: { max: 4, recharge: 'long' } }
const FONT_OF_MAGIC_AT_5: LibraryEntry = { ...FONT_OF_MAGIC, uses: { max: 5, recharge: 'long' } }

const METAMAGIC: LibraryEntry = {
  name: 'Metamagic',
  text: 'Two ways of bending a spell as you cast it, paid for out of your Sorcery Points, and one of them per spell. **Quickened**: 2 points turns an action-cast spell into a bonus action. **Twinned**: 1 point aims a single-target spell at a second creature as well.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const DRACONIC_RESILIENCE: LibraryEntry = {
  name: 'Draconic Resilience',
  text: 'Scales come up across your skin. Your hit point maximum rises by 3, and by 1 more at every level after this — and while you wear no armour your Armour Class is 10 plus your Dexterity and your Charisma, which is the number on this sheet.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Charisma.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

const SORCEROUS_RESTORATION: LibraryEntry = {
  name: 'Sorcerous Restoration',
  text: 'Once between long rests, a short rest hands back spent Sorcery Points — up to half your sorcerer level, rounded down, which is two at level 5.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'long' },
}

// --- spells ---------------------------------------------------------------

const LIGHT: LibraryEntry = {
  name: 'Light',
  text: 'An object you touch, no bigger than ten feet across, sheds bright light for 20 feet and dim light 20 feet past that. A colour of your choosing, and it goes out when you say so.',
  roll: null,
  level: 0,
  catalogueKey: 'light',
  category: 'passive',
}

const PRESTIDIGITATION: LibraryEntry = {
  name: 'Prestidigitation',
  text: 'A minute of small magic: a puff of flame, a mark cleaned off or put on, a trinket conjured, a taste changed. Never damage, and never anything anybody saves against.',
  roll: null,
  level: 0,
  catalogueKey: 'prestidigitation',
  category: 'passive',
}

const MAGE_HAND: LibraryEntry = {
  name: 'Mage Hand',
  text: 'A spectral hand within 30 feet that lifts, opens, pours and fetches up to ten pounds. It cannot attack and it cannot carry a weapon, and it solves more problems than either would.',
  roll: null,
  level: 0,
  catalogueKey: 'mage-hand',
  category: 'passive',
}

const SHOCKING_GRASP: LibraryEntry = {
  name: 'Shocking Grasp',
  text: 'Lightning off your hand at something within reach, with advantage if it is wearing metal. On a hit it takes lightning damage and cannot take reactions until its next turn — so you can walk away.',
  roll: '1d8',
  level: 0,
  catalogueKey: 'shocking-grasp',
  category: 'weapon',
  toHit: '1d20+CHA+PROF',
}

const SHOCKING_GRASP_AT_5: LibraryEntry = { ...SHOCKING_GRASP, roll: '2d8' }

const SORCEROUS_BURST: LibraryEntry = {
  name: 'Sorcerous Burst',
  text: 'Raw magic at something within 120 feet, in a damage type you pick each time you cast it. Roll the maximum on a die and you add another — up to your Charisma in extra dice.',
  roll: '1d8',
  level: 0,
  catalogueKey: 'sorcerous-burst',
  category: 'weapon',
  toHit: '1d20+CHA+PROF',
}

const SORCEROUS_BURST_AT_5: LibraryEntry = { ...SORCEROUS_BURST, roll: '2d8' }

const BURNING_HANDS: LibraryEntry = {
  name: 'Burning Hands',
  text: 'A sheet of flame in a 15-foot cone from your fingertips. Dexterity save for half, and anything flammable and unattended catches.',
  roll: '3d6',
  level: 1,
  catalogueKey: 'burning-hands',
  category: 'action',
}

const MAGIC_MISSILE: LibraryEntry = {
  name: 'Magic Missile',
  text: 'Three darts of force at whatever you can see within 120 feet, split between targets however you like. There is no attack roll and no saving throw: they simply hit.',
  roll: '3d4+3',
  level: 1,
  catalogueKey: 'magic-missile',
  category: 'action',
}

const DETECT_MAGIC: LibraryEntry = {
  name: 'Detect Magic',
  text: 'For ten minutes you see magic within 30 feet — an aura on anything enchanted, and the school it belongs to if you spend an action studying it. It reaches through anything thin.',
  roll: null,
  level: 1,
  catalogueKey: 'detect-magic',
  category: 'passive',
}

const CHROMATIC_ORB: LibraryEntry = {
  name: 'Chromatic Orb',
  text: 'A four-inch sphere of acid, cold, fire, lightning, poison or thunder — you choose as you throw it — at something up to 90 feet away. On a hit, roll the damage; on a maximum it leaps to a second creature nearby.',
  roll: '3d8',
  level: 1,
  catalogueKey: 'chromatic-orb',
  category: 'weapon',
  toHit: '1d20+CHA+PROF',
}

const DRAGONS_BREATH: LibraryEntry = {
  name: "Dragon's Breath",
  text: 'A creature you touch — including you — can breathe a 15-foot cone of acid, cold, fire, lightning or poison as an action, once a turn for a minute. Dexterity save for half.',
  roll: '3d6',
  level: 2,
  catalogueKey: 'dragons-breath',
  category: 'action',
}

const SCORCHING_RAY: LibraryEntry = {
  name: 'Scorching Ray',
  text: 'Three rays of fire at things within 120 feet, aimed however you like. Each ray is rolled separately, so this is the damage one of them does.',
  roll: '2d6',
  level: 2,
  catalogueKey: 'scorching-ray',
  category: 'weapon',
  toHit: '1d20+CHA+PROF',
}

const FIREBALL: LibraryEntry = {
  name: 'Fireball',
  text: 'A bead of fire to a point within 150 feet, and a 20-foot sphere of flame. Dexterity save for half. The most damage a level 3 slot can buy, and it does not care who is standing in it.',
  roll: '8d6',
  level: 3,
  catalogueKey: 'fireball',
  category: 'action',
}

const FLY: LibraryEntry = {
  name: 'Fly',
  text: 'A creature you touch flies for ten minutes while you concentrate. It ends where the creature is standing on nothing, so keep an eye on the clock.',
  roll: null,
  level: 3,
  catalogueKey: 'fly',
  category: 'passive',
}

const EQUIPMENT =
  'A spear, two daggers, a crystal as an arcane focus and a dungeoneer\'s pack, plus the acolyte\'s calligrapher\'s supplies, book of prayers, holy symbol, parchment and robe.'

const HIT_DIE = 6

export const SORCERER: ClassLibrary = {
  classKey: 'sorcerer',
  base: {
    1: {
      level: 1,
      // Charisma first because it is the spells, the save DC, the attack rolls and — from
      // level 3 — half the armour class. Constitution second, because a d6 of hit points
      // and no armour is the thinnest character in this library.
      abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
      skillProficiencies: SKILLS,
      armourClass: 11,
      maxHp: 8,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [DAGGER, INNATE_SORCERY, MAGIC_INITIATE],
      spells: [LIGHT, PRESTIDIGITATION, SHOCKING_GRASP, SORCEROUS_BURST, BURNING_HANDS, MAGIC_MISSILE],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: four cantrips — more than any other caster — and two spells. Armour class 11 and eight hit points, so stand at the back. Innate Sorcery twice a day makes a minute of your magic considerably harder to dodge.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
      skillProficiencies: SKILLS,
      armourClass: 11,
      maxHp: 14,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [DAGGER, INNATE_SORCERY, FONT_OF_MAGIC, METAMAGIC, MAGIC_INITIATE],
      spells: [
        LIGHT,
        PRESTIDIGITATION,
        SHOCKING_GRASP,
        SORCEROUS_BURST,
        BURNING_HANDS,
        MAGIC_MISSILE,
        DETECT_MAGIC,
      ],
      equipment: EQUIPMENT,
      levellingNotes:
        'Sorcery Points, and the two ways of spending them that make this class unlike any other caster: Quickened Spell for a spell off a bonus action, Twinned Spell to aim one at two creatures at once.',
    },
  },
  paths: {
    draconic: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
        saveProficiencies: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 14,
        maxHp: 23,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          DAGGER,
          INNATE_SORCERY,
          FONT_OF_MAGIC_AT_3,
          METAMAGIC,
          DRACONIC_RESILIENCE,
          MAGIC_INITIATE,
        ],
        spells: [
          LIGHT,
          PRESTIDIGITATION,
          SHOCKING_GRASP,
          SORCEROUS_BURST,
          BURNING_HANDS,
          MAGIC_MISSILE,
          DETECT_MAGIC,
          CHROMATIC_ORB,
          DRAGONS_BREATH,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Draconic Sorcery, and the biggest defensive jump in this library: scales take your armour class from 11 to 14 and add 3 to your hit points on the spot. Chromatic Orb and Dragon\'s Breath are prepared for free.',
      },
      4: {
        level: 4,
        // The improvement goes into Charisma: 17 → 19. It is paid four times over here —
        // the save DC, every spell attack roll, the armour class through Draconic
        // Resilience, and Sorcerous Burst's extra dice.
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 30,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          DAGGER,
          INNATE_SORCERY,
          FONT_OF_MAGIC_AT_4,
          METAMAGIC,
          DRACONIC_RESILIENCE,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          LIGHT,
          PRESTIDIGITATION,
          MAGE_HAND,
          SHOCKING_GRASP,
          SORCEROUS_BURST,
          BURNING_HANDS,
          MAGIC_MISSILE,
          DETECT_MAGIC,
          CHROMATIC_ORB,
          DRAGONS_BREATH,
          SCORCHING_RAY,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Charisma goes from 17 to 19, which raises the save DC, every spell attack, the armour class through your scales, and how many extra dice Sorcerous Burst can roll. A fifth cantrip and Scorching Ray on top.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: false, con: true, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 37,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          DAGGER,
          INNATE_SORCERY,
          FONT_OF_MAGIC_AT_5,
          METAMAGIC,
          DRACONIC_RESILIENCE,
          SORCEROUS_RESTORATION,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          LIGHT,
          PRESTIDIGITATION,
          MAGE_HAND,
          SHOCKING_GRASP_AT_5,
          SORCEROUS_BURST_AT_5,
          BURNING_HANDS,
          MAGIC_MISSILE,
          DETECT_MAGIC,
          CHROMATIC_ORB,
          DRAGONS_BREATH,
          SCORCHING_RAY,
          FIREBALL,
          FLY,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Fireball. Fly beside it, both from the dragon, and both cantrips double their dice. Sorcerous Restoration buys two Sorcery Points back on a short rest, once between long ones.',
      },
    },
  },
}
