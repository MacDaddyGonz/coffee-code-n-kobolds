// The Fighter: five premade sheets, level 1 to 5, Champion.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Soldier.** The standard array goes 15 Strength, 14 Constitution, 13
// Dexterity, 12 Wisdom, 10 Charisma, 8 Intelligence, and the Soldier background's **+2
// Strength and +1 Constitution** are already in the numbers below. Athletics and
// Intimidation are the Soldier's two skills; Perception and Survival are the class's own.
//
// **Two of the class's own choices are made here and are worth knowing.** The Fighting
// Style is **Defense**, which is a real SRD feat and is therefore keyed to the catalogue
// rather than written out — the +1 is already in the 17 on every sheet. The starting
// package is option A: chain mail and a greatsword, so there is no shield anywhere on
// this sheet and the armour class does not move between level 1 and level 5.
//
// ⚠️ **This file used to carry a second archetype, and Battle Master appears in no SRD.**
// It is retired by name in `RETIRED_SUBCLASSES` in ../classes.ts along with seven others,
// and the manoeuvres it used to hold are gone with it. Nothing was converted into a
// Champion feature: a Battle Master is not a Champion, and a character holding the key
// keeps its class, its level and its hit points and is told which archetype needs
// choosing again.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  athletics: true,
  intimidation: true,
  perception: true,
  survival: true,
}

const GREATSWORD: LibraryEntry = {
  name: 'Greatsword',
  text: 'Both hands, and the heaviest damage dice any weapon rolls. Reach 5 feet. Graze means a miss still costs the target your Strength in damage.',
  roll: '2d6+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'graze',
}

const FLAIL: LibraryEntry = {
  name: 'Flail',
  text: 'One-handed, reach 5 feet, and the weapon you draw when you want a free hand. Sap is what it is for.',
  roll: '1d8+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'sap',
}

const JAVELIN: LibraryEntry = {
  name: 'Javelin',
  text: 'Eight of them, thrown 30 feet comfortably and 120 at a stretch. What you do about the thing you cannot reach yet.',
  roll: '1d6+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'slow',
}

const DEFENCE: LibraryEntry = {
  name: 'Defense',
  text: 'Fighting Style feat. A +1 bonus to Armour Class while you are wearing light, medium or heavy armour.',
  roll: null,
  level: null,
  catalogueKey: 'defense',
  category: 'passive',
}

const SECOND_WIND: LibraryEntry = {
  name: 'Second Wind',
  text: 'A bonus action to catch your breath and take back this roll plus your fighter level in hit points. Two of them between long rests, and one comes back on a short rest.',
  roll: '1d10',
  level: null,
  catalogueKey: null,
  category: 'action',
  uses: { max: 2, recharge: 'long', regainOnShortRest: 1 },
}

const SECOND_WIND_AT_4: LibraryEntry = {
  ...SECOND_WIND,
  text: 'A bonus action to catch your breath and take back this roll plus your fighter level in hit points. Three of them between long rests now, and one comes back on a short rest.',
  uses: { max: 3, recharge: 'long', regainOnShortRest: 1 },
}

const WEAPON_MASTERY: LibraryEntry = {
  name: 'Weapon Mastery',
  text: 'You use the mastery property of three kinds of weapon — Greatsword, Flail and Javelin here, so Graze, Sap and Slow. After a long rest you can swap one of the three.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const WEAPON_MASTERY_AT_4: LibraryEntry = {
  ...WEAPON_MASTERY,
  text: 'You use the mastery property of four kinds of weapon now rather than three. After a long rest you can swap one of them for another weapon you are proficient with.',
}

const SAVAGE_ATTACKER: LibraryEntry = {
  name: 'Savage Attacker',
  text: 'Origin feat. Once a turn, when you hit with a weapon, reroll the damage dice and keep whichever total you prefer.',
  roll: null,
  level: null,
  catalogueKey: 'savage-attacker',
  category: 'passive',
}

const ACTION_SURGE: LibraryEntry = {
  name: 'Action Surge',
  text: 'Once between rests, take one extra action on your turn — a whole second action, not a bonus action, and not a spell. It comes back on a short rest as well as a long one.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'short' },
}

const TACTICAL_MIND: LibraryEntry = {
  name: 'Tactical Mind',
  text: 'Fail an ability check and you may spend a use of Second Wind to add a d10 to it instead of healing. If it still fails, the use is not spent — so there is nothing to lose by trying.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const IMPROVED_CRITICAL: LibraryEntry = {
  name: 'Improved Critical',
  text: 'A 19 on the d20 is a critical hit for you as well as a 20, so you land them twice as often as anybody else. On a critical, roll the weapon\'s damage dice twice and add them together.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const REMARKABLE_ATHLETE: LibraryEntry = {
  name: 'Remarkable Athlete',
  text: 'Trouble never catches you standing about: you roll initiative and Athletics checks with advantage. And immediately after a critical hit you may give ground — up to half your usual distance — without anyone getting a free swing at you.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Strength.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

const EXTRA_ATTACK: LibraryEntry = {
  name: 'Extra Attack',
  text: 'When you take the Attack action you attack twice instead of once. Roll each swing separately — and with Action Surge on top, that is four in one turn.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const TACTICAL_SHIFT: LibraryEntry = {
  name: 'Tactical Shift',
  text: 'Whenever you use Second Wind on a bonus action you may also step away — up to half your usual distance — without anyone getting a free swing at you as you go.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const EQUIPMENT =
  'Chain mail, a greatsword, a flail, eight javelins and a dungeoneer\'s pack, plus the soldier\'s spear, shortbow and twenty arrows, healer\'s kit, gaming set and travelling clothes.'

const HIT_DIE = 10
const ARMOUR_CLASS = 17

export const FIGHTER: ClassLibrary = {
  classKey: 'fighter',
  base: {
    1: {
      level: 1,
      // Strength first, Constitution second: the fighter hits things and then gets hit
      // back, and Intelligence is the one score nothing on these sheets consults.
      abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 12,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [
        GREATSWORD,
        FLAIL,
        JAVELIN,
        DEFENCE,
        SECOND_WIND,
        WEAPON_MASTERY,
        SAVAGE_ATTACKER,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: the heaviest armour anybody wears, the heaviest damage dice anybody rolls, and Second Wind twice between rests to patch yourself up mid-fight. Three weapons, three mastery properties.',
    },
    2: {
      level: 2,
      abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 20,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        GREATSWORD,
        FLAIL,
        JAVELIN,
        DEFENCE,
        SECOND_WIND,
        WEAPON_MASTERY,
        ACTION_SURGE,
        TACTICAL_MIND,
        SAVAGE_ATTACKER,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Action Surge hands you an entire extra action once between rests — and it comes back on a short one. Tactical Mind turns a spare Second Wind into a rescued ability check, and costs nothing if it fails.',
    },
  },
  paths: {
    champion: {
      3: {
        level: 3,
        abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 28,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          GREATSWORD,
          FLAIL,
          JAVELIN,
          DEFENCE,
          SECOND_WIND,
          WEAPON_MASTERY,
          ACTION_SURGE,
          TACTICAL_MIND,
          IMPROVED_CRITICAL,
          REMARKABLE_ATHLETE,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'You are a Champion. Critical hits land on a 19 as well as a 20, which on a greatsword is four extra dice twice as often, and Remarkable Athlete rolls your initiative and your Athletics with advantage.',
      },
      4: {
        level: 4,
        // The improvement goes into Strength: 17 → 19. A feat was the alternative and lost
        // on tracking — this sheet already has Second Wind, Action Surge and a crit range
        // to remember, and a beginner is better served by the numbers getting quietly
        // better than by a fourth thing to spend.
        abilities: { str: 19, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 36,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          GREATSWORD,
          FLAIL,
          JAVELIN,
          DEFENCE,
          SECOND_WIND_AT_4,
          WEAPON_MASTERY_AT_4,
          ACTION_SURGE,
          TACTICAL_MIND,
          IMPROVED_CRITICAL,
          REMARKABLE_ATHLETE,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Strength goes from 17 to 19 — +1 to hit and +1 damage on every swing and every javelin. A third Second Wind, and the mastery property of a fourth kind of weapon.',
      },
      5: {
        level: 5,
        abilities: { str: 19, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 44,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          GREATSWORD,
          FLAIL,
          JAVELIN,
          DEFENCE,
          SECOND_WIND_AT_4,
          WEAPON_MASTERY_AT_4,
          ACTION_SURGE,
          TACTICAL_MIND,
          IMPROVED_CRITICAL,
          REMARKABLE_ATHLETE,
          EXTRA_ATTACK,
          TACTICAL_SHIFT,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Extra Attack: every Attack action is two swings rather than one, which makes Action Surge worth four. Tactical Shift lets you catch your breath and step out of reach in the same bonus action.',
      },
    },
  },
}
