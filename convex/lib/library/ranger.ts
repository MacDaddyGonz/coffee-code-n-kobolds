// The Ranger: five premade sheets, level 1 to 5, Hunter.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Soldier.** The standard array goes 15 Dexterity, 14 Wisdom, 13
// Constitution, 12 Strength, 10 Intelligence, 8 Charisma, and the Soldier background's
// **+2 Dexterity and +1 Constitution** are already in the numbers below. Athletics and
// Intimidation are the Soldier's two skills; Perception, Stealth and Survival are the
// three the class chooses.
//
// ⚠️ **The Fighting Style is Archery, and the longbow's to-hit carries the +2 from level
// 2 onward — which is why that weapon has two entries and the melee ones do not.** Archery
// applies to ranged attack rolls only, so writing the bonus into the shared to-hit would
// hand it to the scimitar as well. `1d20+DEX+PROF+2` is what `ROLL_PATTERN` calls a
// trailing term and is the only place in this corpus where a fighting style reaches a
// stored roll.
//
// The alternative was Druidic Warrior, which trades the +2 for two Druid cantrips. It
// lost because this build's whole plan is the bow: an archer who is +2 to hit at every
// range beats an archer with Guidance.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  athletics: true,
  intimidation: true,
  perception: true,
  stealth: true,
  survival: true,
}

const LONGBOW: LibraryEntry = {
  name: 'Longbow',
  text: 'Two hands, 150 feet comfortably and 600 at a stretch, twenty arrows in the quiver. This is what the class is for.',
  roll: '1d8+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'slow',
}

/** Archery's +2, from level 2, and on the ranged weapon only. See the header. */
const LONGBOW_WITH_ARCHERY: LibraryEntry = { ...LONGBOW, toHit: '1d20+DEX+PROF+2' }

const SHORTSWORD: LibraryEntry = {
  name: 'Shortsword',
  text: 'Finesse and light, so Dexterity carries it and a second one can be swung off a bonus action. Reach 5 feet, for whatever got past the bow.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'vex',
}

const SCIMITAR: LibraryEntry = {
  name: 'Scimitar',
  text: 'The other half of the pair. Light and finesse like the shortsword, and Nick is what makes carrying both worth it.',
  roll: '1d6+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const FAVORED_ENEMY: LibraryEntry = {
  name: 'Favored Enemy',
  text: 'Hunter\'s Mark is always prepared and never counts against your list, and twice between long rests you cast it without spending a slot at all.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long' },
}

const FAVORED_ENEMY_AT_5: LibraryEntry = { ...FAVORED_ENEMY, uses: { max: 3, recharge: 'long' } }

const WEAPON_MASTERY: LibraryEntry = {
  name: 'Weapon Mastery',
  text: 'You use the mastery property of two kinds of weapon — the Longbow and the Shortsword here, so Slow and Vex. After a long rest you can swap either for another weapon you are proficient with.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const SAVAGE_ATTACKER: LibraryEntry = {
  name: 'Savage Attacker',
  text: 'Origin feat. Once a turn, when you hit with a weapon, reroll the damage dice and keep whichever total you prefer.',
  roll: null,
  level: null,
  catalogueKey: 'savage-attacker',
  category: 'passive',
}

const DEFT_EXPLORER: LibraryEntry = {
  name: 'Deft Explorer',
  text: 'One of your trained skills is now doubly trained — Survival, on this sheet — so you add twice your proficiency bonus to it. Two more languages come with it.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ARCHERY: LibraryEntry = {
  name: 'Archery',
  text: 'Fighting Style feat. A +2 bonus to the attack rolls you make with ranged weapons.',
  roll: null,
  level: null,
  catalogueKey: 'archery',
  category: 'passive',
}

const HUNTERS_LORE: LibraryEntry = {
  name: "Hunter's Lore",
  text: 'While something is marked by your Hunter\'s Mark you know what it is immune to, what it resists and what it is vulnerable to — all of it, or that it has none.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const COLOSSUS_SLAYER: LibraryEntry = {
  name: 'Colossus Slayer',
  text: 'Once a turn, when a weapon of yours hits something that is already wounded, it takes this much extra damage. Anything the party has already hit once qualifies, which in practice is everything.',
  roll: '1d8',
  level: null,
  catalogueKey: null,
  category: 'action',
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
  text: 'When you take the Attack action you attack twice instead of once — two arrows a turn, each of them carrying Hunter\'s Mark and Colossus Slayer.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

// --- spells ---------------------------------------------------------------

const HUNTERS_MARK: LibraryEntry = {
  name: "Hunter's Mark",
  text: 'A bonus action marks one creature you can see for an hour. Every weapon attack of yours that hits it deals this much extra force damage, and the mark moves to a new target with a bonus action when the first one drops.',
  roll: '1d6',
  level: 1,
  catalogueKey: 'hunters-mark',
  category: 'action',
}

const CURE_WOUNDS: LibraryEntry = {
  name: 'Cure Wounds',
  text: 'A hand laid on somebody within reach, and the wound closes. You are the only healing some parties have.',
  roll: '2d8+WIS',
  level: 1,
  catalogueKey: 'cure-wounds',
  category: 'action',
}

const GOODBERRY: LibraryEntry = {
  name: 'Goodberry',
  text: 'Ten berries that each heal 1 hit point and feed somebody for a day. They keep for a day, and ten small heals handed round the camp is worth more than one big one.',
  roll: null,
  level: 1,
  catalogueKey: 'goodberry',
  category: 'passive',
}

const FOG_CLOUD: LibraryEntry = {
  name: 'Fog Cloud',
  text: 'A 20-foot sphere of fog within 120 feet, for an hour while you concentrate. Nobody in it can see anything, which is a fight cancelled or an escape made.',
  roll: null,
  level: 1,
  catalogueKey: 'fog-cloud',
  category: 'passive',
}

const SPIKE_GROWTH: LibraryEntry = {
  name: 'Spike Growth',
  text: 'A 20-foot radius of ground within 150 feet sprouts thorns and hard spikes for ten minutes. Anything crossing it takes this much piercing damage for every five feet it covers, and it is hard to spot without a Perception check.',
  roll: '2d4',
  level: 2,
  catalogueKey: 'spike-growth',
  category: 'action',
}

const PASS_WITHOUT_TRACE: LibraryEntry = {
  name: 'Pass without Trace',
  text: 'You and everybody within 30 feet get +10 on every Stealth check for an hour and leave no tracks. It is the single largest bonus any level 2 spell hands out.',
  roll: null,
  level: 2,
  catalogueKey: 'pass-without-trace',
  category: 'passive',
}

const LESSER_RESTORATION: LibraryEntry = {
  name: 'Lesser Restoration',
  text: 'A touch ends one condition on a creature: blinded, deafened, paralyzed or poisoned.',
  roll: null,
  level: 2,
  catalogueKey: 'lesser-restoration',
  category: 'passive',
}

const EQUIPMENT =
  'Studded leather armour, a scimitar, a shortsword, a longbow with twenty arrows and a quiver, a druidic focus and an explorer\'s pack, plus the soldier\'s spear, healer\'s kit, gaming set and travelling clothes.'

const HIT_DIE = 10

export const RANGER: ClassLibrary = {
  classKey: 'ranger',
  base: {
    1: {
      level: 1,
      // Dexterity first because the bow, the armour class and two of the five skills all
      // come off it; Wisdom second for the spells and Perception. Charisma is dumped.
      abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
      saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 15,
      maxHp: 12,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [LONGBOW, SHORTSWORD, SCIMITAR, FAVORED_ENEMY, WEAPON_MASTERY, SAVAGE_ATTACKER],
      spells: [HUNTERS_MARK, CURE_WOUNDS, GOODBERRY],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: five trained skills, more than anybody else at level 1, a longbow that reaches across any room you will ever fight in, and Hunter\'s Mark twice a day for free on top of your slots.',
    },
    2: {
      level: 2,
      abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
      saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
      skillProficiencies: SKILLS,
      armourClass: 15,
      maxHp: 20,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        LONGBOW_WITH_ARCHERY,
        SHORTSWORD,
        SCIMITAR,
        FAVORED_ENEMY,
        WEAPON_MASTERY,
        DEFT_EXPLORER,
        ARCHERY,
        SAVAGE_ATTACKER,
      ],
      spells: [HUNTERS_MARK, CURE_WOUNDS, GOODBERRY, FOG_CLOUD],
      equipment: EQUIPMENT,
      levellingNotes:
        'Archery puts +2 on every bow shot for the rest of your career — look at the longbow\'s roll, it is already in there. Deft Explorer doubles your proficiency in Survival.',
    },
  },
  paths: {
    hunter: {
      3: {
        level: 3,
        abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 15,
        maxHp: 28,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          LONGBOW_WITH_ARCHERY,
          SHORTSWORD,
          SCIMITAR,
          FAVORED_ENEMY,
          WEAPON_MASTERY,
          DEFT_EXPLORER,
          ARCHERY,
          HUNTERS_LORE,
          COLOSSUS_SLAYER,
          SAVAGE_ATTACKER,
        ],
        spells: [HUNTERS_MARK, CURE_WOUNDS, GOODBERRY, FOG_CLOUD, SPIKE_GROWTH],
        equipment: EQUIPMENT,
        levellingNotes:
          'You are a Hunter. Colossus Slayer adds a d8 to one hit a turn against anything already wounded, which stacks on top of Hunter\'s Mark, and Hunter\'s Lore tells you what the thing you marked is made of.',
      },
      4: {
        level: 4,
        // The improvement goes into Dexterity: 17 → 19. It buys a point of Armour Class,
        // a point on every attack roll and a point of damage on every arrow at once —
        // which is why no feat was taken instead.
        abilities: { str: 12, dex: 19, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 16,
        maxHp: 36,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          LONGBOW_WITH_ARCHERY,
          SHORTSWORD,
          SCIMITAR,
          FAVORED_ENEMY,
          WEAPON_MASTERY,
          DEFT_EXPLORER,
          ARCHERY,
          HUNTERS_LORE,
          COLOSSUS_SLAYER,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [
          HUNTERS_MARK,
          CURE_WOUNDS,
          GOODBERRY,
          FOG_CLOUD,
          SPIKE_GROWTH,
          PASS_WITHOUT_TRACE,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Dexterity goes from 17 to 19, so the armour class, every shot and every arrow\'s damage all improve together. Pass without Trace makes the whole party almost impossible to find.',
      },
      5: {
        level: 5,
        abilities: { str: 12, dex: 19, con: 14, int: 10, wis: 14, cha: 8 },
        saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: false },
        skillProficiencies: SKILLS,
        armourClass: 16,
        maxHp: 44,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          LONGBOW_WITH_ARCHERY,
          SHORTSWORD,
          SCIMITAR,
          FAVORED_ENEMY_AT_5,
          WEAPON_MASTERY,
          DEFT_EXPLORER,
          ARCHERY,
          HUNTERS_LORE,
          COLOSSUS_SLAYER,
          EXTRA_ATTACK,
          ABILITY_SCORE_IMPROVEMENT,
          SAVAGE_ATTACKER,
        ],
        spells: [
          HUNTERS_MARK,
          CURE_WOUNDS,
          GOODBERRY,
          FOG_CLOUD,
          SPIKE_GROWTH,
          PASS_WITHOUT_TRACE,
          LESSER_RESTORATION,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Extra Attack: two arrows a turn, both carrying Hunter\'s Mark, and one of them carrying Colossus Slayer as well. A third free Hunter\'s Mark, and level 2 slots to spend it from.',
      },
    },
  },
}
