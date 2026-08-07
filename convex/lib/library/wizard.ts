// The Wizard: five premade sheets, level 1 to 5, Evoker.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Sage.** The standard array goes 15 Intelligence, 14 Constitution, 13
// Dexterity, 12 Wisdom, 10 Charisma, 8 Strength, and the Sage background's **+2
// Intelligence and +1 Constitution** are already in the numbers below. Arcana and History
// are the Sage's two skills; Insight and Investigation are the class's own.
//
// ⚠️ **The armour class is a flat 11 at every level and Mage Armor is NOT in it.** A
// wizard wears nothing, so 10 plus Dexterity is the honest number; Mage Armor is a spell
// on the list below that raises it to 14 when it is up, and whether it is up is a fact
// about the last hour rather than about the sheet. Baking it in would make the panel
// print a number that is wrong every time somebody has not cast it — which is exactly the
// kind of stored copy this project keeps deriving instead.
//
// ⚠️ **This file used to carry a second archetype, and School of Divination appears in no
// SRD.** It is retired by name in `RETIRED_SUBCLASSES` in ../classes.ts along with seven
// others. A character holding the key keeps its class, its level and its hit points and
// is told which archetype needs choosing again.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  arcana: true,
  history: true,
  insight: true,
  investigation: true,
}

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry two, and Fire Bolt is better than either of them at every range including this one. Light and finesse, thrown 20 feet without trouble.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const RITUAL_ADEPT: LibraryEntry = {
  name: 'Ritual Adept',
  text: 'Any spell in your book with the Ritual tag can be cast as a ritual — ten minutes longer, and no slot spent at all. It need not be prepared; you simply read it out of the book.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ARCANE_RECOVERY: LibraryEntry = {
  name: 'Arcane Recovery',
  text: 'Once between long rests, a short rest spent reading your spellbook returns spell slots worth half your wizard level in levels, rounded up — one level 2 slot at level 4, or two level 1 slots.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'long' },
}

const MAGIC_INITIATE: LibraryEntry = {
  name: 'Magic Initiate',
  text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: 'magic-initiate',
  category: 'passive',
}

const SCHOLAR: LibraryEntry = {
  name: 'Scholar',
  text: 'One of your trained skills is now doubly trained — Arcana, on this sheet — so you add twice your proficiency bonus to it rather than once.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const EVOCATION_SAVANT: LibraryEntry = {
  name: 'Evocation Savant',
  text: 'Two Evocation spells of level 2 or lower go into your spellbook for nothing, and one more every time a new level of spell slot opens up. Scorching Ray and Shatter are the two taken here.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const POTENT_CANTRIP: LibraryEntry = {
  name: 'Potent Cantrip',
  text: 'Your damaging cantrips do half damage even when they miss or the target saves. Fire Bolt stops being a coin flip and starts being a floor.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Intelligence.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

const MEMORIZE_SPELL: LibraryEntry = {
  name: 'Memorize Spell',
  text: 'Every short rest, swap one prepared spell of level 1 or higher for another out of your spellbook. You stop having to guess what today needs before it starts.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

// --- spells ---------------------------------------------------------------

const FIRE_BOLT: LibraryEntry = {
  name: 'Fire Bolt',
  text: 'A mote of fire thrown up to 120 feet. It sets light to anything flammable it hits and nobody is carrying, and it never runs out.',
  roll: '1d10',
  level: 0,
  catalogueKey: 'fire-bolt',
  category: 'weapon',
  toHit: '1d20+INT+PROF',
}

const FIRE_BOLT_AT_5: LibraryEntry = { ...FIRE_BOLT, roll: '2d10' }

const LIGHT: LibraryEntry = {
  name: 'Light',
  text: 'An object you touch, no bigger than ten feet across, sheds bright light for 20 feet and dim light 20 feet past that. A colour of your choosing, and it goes out when you say so.',
  roll: null,
  level: 0,
  catalogueKey: 'light',
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

const PRESTIDIGITATION: LibraryEntry = {
  name: 'Prestidigitation',
  text: 'A minute of small magic: a puff of flame, a mark cleaned off or put on, a trinket conjured, a taste changed. Never damage, and never anything anybody saves against.',
  roll: null,
  level: 0,
  catalogueKey: 'prestidigitation',
  category: 'passive',
}

const MAGIC_MISSILE: LibraryEntry = {
  name: 'Magic Missile',
  text: 'Three darts of force at whatever you can see within 120 feet, split between targets however you like. There is no attack roll and no saving throw: they simply hit.',
  roll: '3d4+3',
  level: 1,
  catalogueKey: 'magic-missile',
  category: 'action',
}

const MAGE_ARMOR: LibraryEntry = {
  name: 'Mage Armor',
  text: 'Eight hours of shimmering force on a creature wearing no armour. Its Armour Class becomes 13 plus its Dexterity — 14 for you — which is the first thing you cast every morning.',
  roll: null,
  level: 1,
  catalogueKey: 'mage-armor',
  category: 'passive',
}

const SHIELD: LibraryEntry = {
  name: 'Shield',
  text: 'A reaction, taken after you see the attack roll and before you hear whether it hit: +5 Armour Class until your next turn, and Magic Missile cannot touch you at all.',
  roll: null,
  level: 1,
  catalogueKey: 'shield',
  category: 'passive',
}

const THUNDERWAVE: LibraryEntry = {
  name: 'Thunderwave',
  text: 'A wave of force out of you in a 15-foot cube. Constitution save for half, and everything unsecured in the area is blown away from you. What you cast when something has got too close.',
  roll: '2d8',
  level: 1,
  catalogueKey: 'thunderwave',
  category: 'action',
}

const SCORCHING_RAY: LibraryEntry = {
  name: 'Scorching Ray',
  text: 'Three rays of fire at things within 120 feet, aimed however you like. Each ray is rolled separately, so this is the damage one of them does.',
  roll: '2d6',
  level: 2,
  catalogueKey: 'scorching-ray',
  category: 'weapon',
  toHit: '1d20+INT+PROF',
}

const MISTY_STEP: LibraryEntry = {
  name: 'Misty Step',
  text: 'A bonus action and a wisp of silver mist, and you are standing somewhere else within 30 feet that you can see. It is the spell that keeps a wizard alive.',
  roll: null,
  level: 2,
  catalogueKey: 'misty-step',
  category: 'passive',
}

const SHATTER: LibraryEntry = {
  name: 'Shatter',
  text: 'A ringing note bursts in a 10-foot sphere within 60 feet. Everything in it makes a Constitution save for half. Objects and anything made of stone or metal take it worse.',
  roll: '3d8',
  level: 2,
  catalogueKey: 'shatter',
  category: 'action',
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
  'Two daggers, a quarterstaff as an arcane focus, a robe, your spellbook and a scholar\'s pack, plus the sage\'s calligrapher\'s supplies, book of history and parchment.'

const HIT_DIE = 6
const ARMOUR_CLASS = 11

export const WIZARD: ClassLibrary = {
  classKey: 'wizard',
  base: {
    1: {
      level: 1,
      // Intelligence first because it is every spell, the save DC, every spell attack and
      // three of the four trained skills. Constitution second, because a d6 of hit points
      // in no armour is the other thin character in this library.
      abilities: { str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 8,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [DAGGER, RITUAL_ADEPT, ARCANE_RECOVERY, MAGIC_INITIATE],
      spells: [FIRE_BOLT, LIGHT, MAGE_HAND, MAGIC_MISSILE, MAGE_ARMOR, SHIELD],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: three cantrips that never run out, Magic Missile that never misses, and two spells that keep you standing — Mage Armor before the day starts, Shield after you have seen the attack roll.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 14,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [DAGGER, RITUAL_ADEPT, ARCANE_RECOVERY, SCHOLAR, MAGIC_INITIATE],
      spells: [FIRE_BOLT, LIGHT, MAGE_HAND, MAGIC_MISSILE, MAGE_ARMOR, SHIELD, THUNDERWAVE],
      equipment: EQUIPMENT,
      levellingNotes:
        'Scholar doubles your proficiency in Arcana, and Thunderwave is the answer to something standing next to you — damage, and it goes backwards whether it saves or not.',
    },
  },
  paths: {
    evocation: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 20,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          DAGGER,
          RITUAL_ADEPT,
          ARCANE_RECOVERY,
          SCHOLAR,
          EVOCATION_SAVANT,
          POTENT_CANTRIP,
          MAGIC_INITIATE,
        ],
        spells: [
          FIRE_BOLT,
          LIGHT,
          MAGE_HAND,
          MAGIC_MISSILE,
          MAGE_ARMOR,
          SHIELD,
          THUNDERWAVE,
          SCORCHING_RAY,
          MISTY_STEP,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'You are an Evoker. Potent Cantrip makes Fire Bolt do half damage even on a miss, which over a campaign is a great deal of damage, and Evocation Savant puts two spells in your book for free.',
      },
      4: {
        level: 4,
        // The improvement goes into Intelligence: 17 → 19. Every spell attack, the save DC
        // and three of the four trained skills move together, which nothing else here does.
        abilities: { str: 8, dex: 13, con: 15, int: 19, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 26,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          DAGGER,
          RITUAL_ADEPT,
          ARCANE_RECOVERY,
          SCHOLAR,
          EVOCATION_SAVANT,
          POTENT_CANTRIP,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          FIRE_BOLT,
          LIGHT,
          MAGE_HAND,
          PRESTIDIGITATION,
          MAGIC_MISSILE,
          MAGE_ARMOR,
          SHIELD,
          THUNDERWAVE,
          SCORCHING_RAY,
          MISTY_STEP,
          SHATTER,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Intelligence goes from 17 to 19: a harder save DC and +1 on every spell attack roll. A fourth cantrip, and Shatter for the room with four things in it.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 13, con: 15, int: 19, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 32,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          DAGGER,
          RITUAL_ADEPT,
          ARCANE_RECOVERY,
          SCHOLAR,
          EVOCATION_SAVANT,
          POTENT_CANTRIP,
          MEMORIZE_SPELL,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          FIRE_BOLT_AT_5,
          LIGHT,
          MAGE_HAND,
          PRESTIDIGITATION,
          MAGIC_MISSILE,
          MAGE_ARMOR,
          SHIELD,
          THUNDERWAVE,
          SCORCHING_RAY,
          MISTY_STEP,
          SHATTER,
          FIREBALL,
          FLY,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Fireball, which is the spell everybody is waiting for, and Fly beside it. Fire Bolt doubles its dice, and Memorize Spell lets you swap a prepared spell on every short rest rather than guessing at dawn.',
      },
    },
  },
}
