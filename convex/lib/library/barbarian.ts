// The Barbarian: five premade sheets, level 1 to 5, Path of the Berserker.
//
// Content only — the shape is in ./types.ts and the words are paraphrased from the
// 5e (2024) SRD for somebody reading them at the table, never lifted from it.
//
// **The build: Soldier.** The standard array goes 15 Strength, 14 Dexterity, 13
// Constitution, 12 Wisdom, 10 Charisma, 8 Intelligence, and the Soldier background's
// **+2 Strength and +1 Constitution** are already in the numbers below — see the note on
// `LibrarySheet.abilities` in ./types.ts before concluding that backgrounds were lifted.
// Athletics and Intimidation are the Soldier's two skills; Perception and Survival are
// the class's own.
//
// ⚠️ **Fast Movement is deliberately absent, and it is the one level 1–5 feature this
// class does not get.** It raises the character's Speed, and `speed` on a resolved sheet
// is set by the species and lineage layers in lib/resolve.ts and by nothing else — so a
// class entry that also moved it would be a second authority for one number, and the two
// would disagree the moment either changed. That is the rule the Fighter's file has
// stated since Milestone 4; this is the first class for which it costs a named SRD
// feature rather than a turn of phrase. `library.test.ts` sweeps every sheet for the word.
//
// Rage's *duration* rules are summarised rather than reproduced: nothing here counts a
// round, and the ten-minute cap is the table's to keep.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

/**
 * The four this build is trained in, at levels 1 and 2.
 *
 * Spread over `noSkills()` rather than eighteen literals per sheet, which is a change of
 * house style worth one paragraph. The old corpus wrote all thirteen flags out on all
 * seventy-two sheets; five skills arrived with the 2024 conversion, and eighteen booleans
 * × sixty sheets is a thousand lines in which the interesting fact — *which four* — is
 * invisible. Every sheet still carries all eighteen flags, because the spread produces
 * them; what has gone is the repetition, and with it the failure mode where a correction
 * is made on four sheets out of five.
 */
const SKILLS = {
  ...noSkills(),
  athletics: true,
  intimidation: true,
  perception: true,
  survival: true,
}

/** Primal Knowledge at level 3 adds one more from the class's own list. */
const SKILLS_AT_3 = { ...SKILLS, nature: true }

// ---------------------------------------------------------------------------
// The entries, named once and listed by every level that has them.
//
// ⚠️ **This is the one place this corpus stopped writing every level out in full, and
// the reason is the opposite of brevity.** The old files repeated an entry's whole
// literal at every level that carried it — the Fighter's Longsword nine times, word for
// word — so a correction to one description was a correction in nine places, and the
// nine were only ever as consistent as the last person to edit them. Naming the entry
// and listing it makes the *difference* between two levels the thing a reader sees,
// which is what "somebody comparing level 3 to level 4" actually wanted. A level whose
// numbers genuinely change gets its own constant beside the first, as `FRENZY` and the
// two Rage counts do below.
// ---------------------------------------------------------------------------

const GREATAXE: LibraryEntry = {
  name: 'Greataxe',
  text: 'Two hands on the haft and a swing that comes down through the shoulder. Reach 5 feet. While your Rage is up, add 2 more damage on top.',
  roll: '1d12+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'cleave',
}

const HANDAXE: LibraryEntry = {
  name: 'Handaxe',
  text: 'Light enough to throw — 20 feet comfortably, 60 at a stretch — and you carry four. The Rage bonus applies to these as well.',
  roll: '1d6+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'vex',
}

const UNARMOURED_DEFENCE: LibraryEntry = {
  name: 'Unarmored Defense',
  text: 'You wear no armour and do not need any: your Armour Class is 10 plus your Dexterity and your Constitution, which is the 14 on this sheet. A shield would still work if you picked one up.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const WEAPON_MASTERY: LibraryEntry = {
  name: 'Weapon Mastery',
  text: 'You use the mastery property of two kinds of weapon — the Greataxe and the Handaxe here, so Cleave and Vex. After a long rest you can swap one of the two for another weapon you are proficient with.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

/** Level 4 widens it to three kinds. The SRD's Weapon Mastery column, per level. */
const WEAPON_MASTERY_AT_4: LibraryEntry = {
  ...WEAPON_MASTERY,
  text: 'You use the mastery property of three kinds of weapon now rather than two. After a long rest you can swap one of them for another weapon you are proficient with.',
}

/**
 * Rage, with the SRD's own recharge: one use back on a short rest and all of them on a
 * long one. That shape is `resourceValidator`'s `regainOnShortRest` and is the absorbed
 * character-resources milestone's decision reversed — see lib/rest.ts, which argues it.
 */
const RAGE: LibraryEntry = {
  name: 'Rage',
  text: 'A bonus action, out of heavy armour. While it lasts you resist bludgeoning, piercing and slashing damage, you roll Strength checks and Strength saves with advantage, and every Strength attack that lands deals 2 more damage. You cannot cast or concentrate on a spell. It runs to the end of your next turn and keeps going as long as you keep swinging.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long', regainOnShortRest: 1 },
}

const RAGE_AT_3: LibraryEntry = { ...RAGE, uses: { max: 3, recharge: 'long', regainOnShortRest: 1 } }

const SAVAGE_ATTACKER: LibraryEntry = {
  name: 'Savage Attacker',
  text: 'Origin feat. Once a turn, when you hit with a weapon, reroll the damage dice and keep whichever total you prefer.',
  roll: null,
  level: null,
  catalogueKey: 'savage-attacker',
  category: 'passive',
}

const DANGER_SENSE: LibraryEntry = {
  name: 'Danger Sense',
  text: 'You feel trouble coming a moment before it arrives: every Dexterity saving throw is rolled with advantage unless something has already incapacitated you.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const RECKLESS_ATTACK: LibraryEntry = {
  name: 'Reckless Attack',
  text: 'Say so on your first attack roll of the turn and you throw defence away: every Strength attack you make until your next turn is rolled with advantage, and everything attacking you has advantage back.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const PRIMAL_KNOWLEDGE: LibraryEntry = {
  name: 'Primal Knowledge',
  text: 'One more trained skill — Nature, on this sheet. And while your Rage is up you may make an Acrobatics, Intimidation, Perception, Stealth or Survival check as a Strength check instead, because the power going through you is doing the work.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FRENZY: LibraryEntry = {
  name: 'Frenzy',
  text: 'Attack recklessly while raging and the first target you hit with a Strength attack that turn takes extra damage — a number of d6s equal to your Rage damage bonus, which is 2. Same damage type as the weapon.',
  roll: '2d6',
  level: null,
  catalogueKey: null,
  category: 'action',
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
  text: 'When you take the Attack action you attack twice instead of once. Roll each swing separately.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const EQUIPMENT =
  'A greataxe, four handaxes and an explorer\'s pack, plus a soldier\'s kit: a spear, a shortbow with twenty arrows and a quiver, a healer\'s kit, a gaming set and travelling clothes.'

const HIT_DIE = 12
const ARMOUR_CLASS = 14

export const BARBARIAN: ClassLibrary = {
  classKey: 'barbarian',
  base: {
    1: {
      level: 1,
      // Strength first and Constitution second: the barbarian hits things and then gets
      // hit back, and both halves of Unarmored Defense come off the second one.
      // Intelligence is the score nothing on this sheet consults.
      abilities: { str: 17, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 14,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [GREATAXE, HANDAXE, RAGE, UNARMOURED_DEFENCE, WEAPON_MASTERY, SAVAGE_ATTACKER],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: the biggest die of hit points in the game, no armour and no need for any, and two Rages between rests that make you hard to hurt and hard to stop.',
    },
    2: {
      level: 2,
      abilities: { str: 17, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
      saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 23,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        GREATAXE,
        HANDAXE,
        RAGE,
        UNARMOURED_DEFENCE,
        WEAPON_MASTERY,
        DANGER_SENSE,
        RECKLESS_ATTACK,
        SAVAGE_ATTACKER,
      ],
      spells: [],
      equipment: EQUIPMENT,
      levellingNotes:
        'Reckless Attack is the button you will press every round: advantage on everything you swing, at the cost of everything swinging back at you with advantage. Danger Sense quietly makes every Dexterity save better.',
    },
  },
  paths: {
    berserker: {
      3: {
        level: 3,
        abilities: { str: 17, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 32,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          GREATAXE,
          HANDAXE,
          RAGE_AT_3,
          UNARMOURED_DEFENCE,
          WEAPON_MASTERY,
          DANGER_SENSE,
          RECKLESS_ATTACK,
          PRIMAL_KNOWLEDGE,
          FRENZY,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'You walk the Path of the Berserker. Frenzy turns Reckless Attack into an extra 2d6 on the first thing you hit each turn, you get a third Rage, and Primal Knowledge trains you in Nature.',
      },
      4: {
        level: 4,
        // The level 4 improvement, spent on Strength: 17 → 19, which is +1 to hit and +1
        // damage on every swing. Constitution was the alternative and lost on arithmetic
        // — 14 → 16 buys one point of Armour Class and one hit point a level, where the
        // Strength buys something on every attack roll of the game.
        abilities: { str: 19, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 41,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          GREATAXE,
          HANDAXE,
          RAGE_AT_3,
          UNARMOURED_DEFENCE,
          WEAPON_MASTERY_AT_4,
          DANGER_SENSE,
          RECKLESS_ATTACK,
          PRIMAL_KNOWLEDGE,
          FRENZY,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Strength goes from 17 to 19 — +1 to hit and +1 damage on everything you throw or swing — and you take the mastery property of a third kind of weapon.',
      },
      5: {
        level: 5,
        abilities: { str: 19, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 50,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          GREATAXE,
          HANDAXE,
          RAGE_AT_3,
          UNARMOURED_DEFENCE,
          WEAPON_MASTERY_AT_4,
          DANGER_SENSE,
          RECKLESS_ATTACK,
          PRIMAL_KNOWLEDGE,
          FRENZY,
          EXTRA_ATTACK,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [],
        equipment: EQUIPMENT,
        levellingNotes:
          'Extra Attack: every Attack action is two swings rather than one, and Frenzy still fires on the first of them that lands. It is the biggest single jump a barbarian gets.',
      },
    },
  },
}
