// The Rogue: five premade sheets, level 1 to 5, Thief.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Criminal.** The standard array goes 15 Dexterity, 14 Constitution, 13
// Intelligence, 12 Wisdom, 10 Charisma, 8 Strength, and the Criminal background's **+2
// Dexterity and +1 Constitution** are already in the numbers below. Sleight of Hand and
// Stealth are the Criminal's two skills; Acrobatics, Deception, Investigation and
// Perception are the four the class chooses — six trained skills at level 1, which is
// more than anybody else at the table.
//
// ⚠️ **Cunning Strike is written with one of its three options.** Trip sets Prone and
// Withdraw is a move, and docs/requirements.md excludes movement-detriment status
// effects; Poison is the one that touches neither, so it is the one on the sheet. The
// same call fighter.ts made about two Battle Master manoeuvres for four milestones, and
// monk.ts makes about Open Hand Technique.
//
// ⚠️ **This file used to carry a second archetype, and Assassin appears in no SRD.** It is
// retired by name in `RETIRED_SUBCLASSES` in ../classes.ts along with seven others. A
// character holding the key keeps its class, its level and its hit points and is told
// which archetype needs choosing again; nothing was quietly converted into a Thief.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  sleightOfHand: true,
  stealth: true,
  acrobatics: true,
  deception: true,
  investigation: true,
  perception: true,
}

const SHORTSWORD: LibraryEntry = {
  name: 'Shortsword',
  text: 'Finesse and light, so Dexterity carries it, reach 5 feet. The weapon Sneak Attack is usually riding on.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'vex',
}

const SHORTBOW: LibraryEntry = {
  name: 'Shortbow',
  text: 'Two hands, 80 feet comfortably and 320 at a stretch. A ranged weapon carries Sneak Attack as happily as a finesse one, which is what makes shooting from the dark work.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'vex',
}

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry two. Light, finesse, and thrown 20 feet without trouble — which is the answer when the shortbow is in the other hand.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const EXPERTISE: LibraryEntry = {
  name: 'Expertise',
  text: 'Two of your trained skills are now doubly trained — Sleight of Hand and Stealth here — so you add twice your proficiency bonus to them rather than once.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const SNEAK_ATTACK: LibraryEntry = {
  name: 'Sneak Attack',
  text: 'Once a turn, extra damage on one hit with a finesse or ranged weapon — as long as you had advantage, or one of your friends is standing next to the target and you did not have disadvantage. Same damage type as the weapon.',
  roll: '1d6',
  level: null,
  catalogueKey: null,
  category: 'action',
}

const SNEAK_ATTACK_AT_3: LibraryEntry = { ...SNEAK_ATTACK, roll: '2d6' }
const SNEAK_ATTACK_AT_5: LibraryEntry = { ...SNEAK_ATTACK, roll: '3d6' }

const THIEVES_CANT: LibraryEntry = {
  name: "Thieves' Cant",
  text: 'The private argot of the underworld — signs chalked on a doorway, a turn of phrase that means something else. You know it and one other language besides.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const WEAPON_MASTERY: LibraryEntry = {
  name: 'Weapon Mastery',
  text: 'You use the mastery property of two kinds of weapon — the Shortsword and the Dagger here, so Vex and Nick. After a long rest you can swap either for another weapon you are proficient with.',
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

const CUNNING_ACTION: LibraryEntry = {
  name: 'Cunning Action',
  text: 'Dash, Disengage or Hide off a bonus action, every turn, for nothing. It is the feature that makes a rogue impossible to pin down and the reason you always act before anybody else has finished thinking.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const STEADY_AIM: LibraryEntry = {
  name: 'Steady Aim',
  text: 'A bonus action gives you advantage on your next attack roll this turn — which is Sneak Attack guaranteed. You must not have moved yet this turn, and you stay where you are until the end of it.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FAST_HANDS: LibraryEntry = {
  name: 'Fast Hands',
  text: 'A bonus action either picks a lock, disarms a trap or lifts a pocket with your thieves\' tools, or uses an object — including a magic item that would ordinarily cost your whole action.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const SECOND_STORY_WORK: LibraryEntry = {
  name: 'Second-Story Work',
  text: 'You climb as easily as you walk, and your running jump is worked out from Dexterity rather than Strength. Between the two there is very little you cannot get on top of.',
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

const CUNNING_STRIKE: LibraryEntry = {
  name: 'Cunning Strike',
  text: 'Give up one of your Sneak Attack dice before rolling and add **Poison** instead: the target makes a Constitution save against your save DC or is poisoned for a minute, repeating the save at the end of each of its turns. You need a poisoner\'s kit on you.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const UNCANNY_DODGE: LibraryEntry = {
  name: 'Uncanny Dodge',
  text: 'A reaction when something you can see hits you: halve the damage, rounded down. Once a turn, every turn, for nothing at all.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const EQUIPMENT =
  'Leather armour, two daggers, a shortsword, a shortbow with twenty arrows and a quiver, thieves\' tools and a burglar\'s pack, plus the criminal\'s crowbar, two pouches and travelling clothes.'

const HIT_DIE = 8

export const ROGUE: ClassLibrary = {
  classKey: 'rogue',
  base: {
    1: {
      level: 1,
      // Dexterity first because every weapon, the armour class, Stealth, Acrobatics and
      // Sleight of Hand all come off it. Intelligence third rather than dumped: it is a
      // saving throw proficiency and Investigation is one of the six trained skills.
      abilities: { str: 8, dex: 17, con: 15, int: 13, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 14,
      maxHp: 10,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [
        SHORTSWORD,
        SHORTBOW,
        DAGGER,
        EXPERTISE,
        SNEAK_ATTACK,
        THIEVES_CANT,
        WEAPON_MASTERY,
        ALERT,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: six trained skills, two of them doubled, and Sneak Attack — which turns one hit a turn into far more damage than anybody else at level 1 can manage.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 17, con: 15, int: 13, wis: 12, cha: 10 },
      saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 14,
      maxHp: 17,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        SHORTSWORD,
        SHORTBOW,
        DAGGER,
        EXPERTISE,
        SNEAK_ATTACK,
        THIEVES_CANT,
        WEAPON_MASTERY,
        CUNNING_ACTION,
        ALERT,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Cunning Action: Dash, Disengage or Hide off a bonus action every single turn. It costs nothing and it changes how every fight you are in reads.',
    },
  },
  paths: {
    thief: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 17, con: 15, int: 13, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 14,
        maxHp: 24,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          SHORTSWORD,
          SHORTBOW,
          DAGGER,
          EXPERTISE,
          SNEAK_ATTACK_AT_3,
          THIEVES_CANT,
          WEAPON_MASTERY,
          CUNNING_ACTION,
          STEADY_AIM,
          FAST_HANDS,
          SECOND_STORY_WORK,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'You are a Thief. Sneak Attack doubles to 2d6, Steady Aim buys you advantage — and therefore Sneak Attack — any turn you stand still, and Fast Hands puts your thieves\' tools on a bonus action.',
      },
      4: {
        level: 4,
        // The improvement goes into Dexterity: 17 → 19. Armour class, every attack roll,
        // every damage roll and three of the six trained skills all move at once, which
        // is why no feat was taken instead.
        abilities: { str: 8, dex: 19, con: 15, int: 13, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 31,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          SHORTSWORD,
          SHORTBOW,
          DAGGER,
          EXPERTISE,
          SNEAK_ATTACK_AT_3,
          THIEVES_CANT,
          WEAPON_MASTERY,
          CUNNING_ACTION,
          STEADY_AIM,
          FAST_HANDS,
          SECOND_STORY_WORK,
          ABILITY_SCORE_IMPROVEMENT,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Dexterity goes from 17 to 19. Armour class 15, +1 on every attack and every damage roll, and a better Stealth, Acrobatics and Sleight of Hand into the bargain.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 19, con: 15, int: 13, wis: 12, cha: 10 },
        saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 38,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          SHORTSWORD,
          SHORTBOW,
          DAGGER,
          EXPERTISE,
          SNEAK_ATTACK_AT_5,
          THIEVES_CANT,
          WEAPON_MASTERY,
          CUNNING_ACTION,
          STEADY_AIM,
          FAST_HANDS,
          SECOND_STORY_WORK,
          CUNNING_STRIKE,
          UNCANNY_DODGE,
          ABILITY_SCORE_IMPROVEMENT,
          ALERT,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Sneak Attack reaches 3d6, and Cunning Strike lets you trade one of those dice for poison. Uncanny Dodge halves the damage of one hit a turn, every turn — which is what finally makes a rogue hard to kill.',
      },
    },
  },
}
