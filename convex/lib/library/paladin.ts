// The Paladin: five premade sheets, level 1 to 5, Oath of Devotion.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Acolyte.** The standard array goes 15 Strength, 14 Charisma, 13
// Constitution, 12 Wisdom, 10 Dexterity, 8 Intelligence, and the Acolyte background's
// **+2 Charisma and +1 Wisdom** are already in the numbers below. Insight and Religion
// are the Acolyte's two skills; Athletics and Persuasion are the class's own.
//
// ⚠️ **Divine Smite is a SPELL in 2024, and the catalogue key resolves.** It used to be a
// class feature this corpus wrote out by hand and `lib/rules.ts` listed among things it
// called feats; the 2024 conversion made it a level 1 Paladin spell, so the entry below
// is keyed at `divine-smite` and matches the picker on name, level and category. Paladin's
// Smite is the *feature* that keeps it prepared and pays for one cast a day — a different
// line, with the use count on it.
//
// **Sacred Weapon spends a Channel Divinity use** and carries none of its own, for the
// reason cleric.ts sets out at length: nothing in this application lets a child entry
// spend a parent's pool, so the uses live on one line and the others say which pool they
// draw on.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  insight: true,
  religion: true,
  athletics: true,
  persuasion: true,
}

const LONGSWORD: LibraryEntry = {
  name: 'Longsword',
  text: 'One hand on the hilt, the other behind a shield, reach 5 feet. Two-handed it would roll a d10, but the shield is worth more than the die.',
  roll: '1d8+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'sap',
}

const JAVELIN: LibraryEntry = {
  name: 'Javelin',
  text: 'Six of them, thrown 30 feet comfortably and 120 at a stretch. What a paladin in plate does about the thing that will not come closer.',
  roll: '1d6+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'slow',
}

const LAY_ON_HANDS: LibraryEntry = {
  name: 'Lay On Hands',
  text: 'A pool of healing worth five hit points per paladin level, refilled on a long rest. A bonus action and a touch spends any part of it; five points from the pool instead ends the Poisoned condition, healing nothing.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const WEAPON_MASTERY: LibraryEntry = {
  name: 'Weapon Mastery',
  text: 'You use the mastery property of two kinds of weapon — the Longsword and the Javelin here, so Sap and Slow. After a long rest you can swap either for another weapon you are proficient with.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const MAGIC_INITIATE: LibraryEntry = {
  name: 'Magic Initiate',
  text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: 'magic-initiate',
  category: 'passive',
}

const DEFENCE: LibraryEntry = {
  name: 'Defense',
  text: 'Fighting Style feat. A +1 bonus to Armour Class while you are wearing light, medium or heavy armour.',
  roll: null,
  level: null,
  catalogueKey: 'defense',
  category: 'passive',
}

const PALADINS_SMITE: LibraryEntry = {
  name: "Paladin's Smite",
  text: 'Divine Smite is always prepared and never counts against your list — and once between long rests you cast it without spending a slot at all. Everything after that costs a slot like anything else.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'long' },
}

const CHANNEL_DIVINITY: LibraryEntry = {
  name: 'Channel Divinity: Divine Sense',
  text: 'Twice between rests, and one back on a short one. A bonus action opens your awareness for ten minutes: you know where every celestial, fiend and undead within 60 feet is and what it is, and whether anything nearby has been consecrated or desecrated.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long', regainOnShortRest: 1 },
}

const SACRED_WEAPON: LibraryEntry = {
  name: 'Sacred Weapon',
  text: 'A second thing to spend a Channel Divinity use on, taken as you attack. For ten minutes your melee weapon adds your Charisma to its attack rolls, deals radiant damage instead of its own if you like, and lights the room for twenty feet.',
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
  text: 'When you take the Attack action you attack twice instead of once. Two chances a turn to land the swing you want to smite on.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FAITHFUL_STEED: LibraryEntry = {
  name: 'Faithful Steed',
  text: 'Find Steed is always prepared and never counts against your list, and once between long rests you cast it without spending a slot.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'long' },
}

// --- spells ---------------------------------------------------------------
//
// A paladin casts off Charisma, and the catalogue's healing entries name Wisdom because
// that is the commonest caster of them. The roll on a keyed entry is tailorable for
// exactly this — see lib/rules.ts — so Cure Wounds reads `+CHA` here.

const HEROISM: LibraryEntry = {
  name: 'Heroism',
  text: 'A creature you touch cannot be frightened while you concentrate, and gains temporary hit points equal to your Charisma at the start of each of its turns.',
  roll: null,
  level: 1,
  catalogueKey: 'heroism',
  category: 'passive',
}

const DIVINE_SMITE: LibraryEntry = {
  name: 'Divine Smite',
  text: 'A bonus action taken straight after a melee weapon lands, and the blow flares with radiance for this much extra damage. Fiends and undead take an extra d8 on top.',
  roll: '2d8',
  level: 1,
  catalogueKey: 'divine-smite',
  category: 'action',
}

const SEARING_SMITE: LibraryEntry = {
  name: 'Searing Smite',
  text: 'A bonus action after a hit: the target takes this in fire damage and keeps burning for the same each turn until it or somebody near it puts the flames out with an action.',
  roll: '1d6',
  level: 1,
  catalogueKey: 'searing-smite',
  category: 'action',
}

const CURE_WOUNDS: LibraryEntry = {
  name: 'Cure Wounds',
  text: 'A hand laid on somebody within reach, and the wound closes. Slower than Lay on Hands and worth considerably more per slot.',
  roll: '2d8+CHA',
  level: 1,
  catalogueKey: 'cure-wounds',
  category: 'action',
}

const PROTECTION_FROM_EVIL_AND_GOOD: LibraryEntry = {
  name: 'Protection from Evil and Good',
  text: 'A creature you touch is warded for ten minutes against aberrations, celestials, elementals, fey, fiends and undead: they attack it with disadvantage and cannot charm or frighten it.',
  roll: null,
  level: 1,
  catalogueKey: 'protection-from-evil-and-good',
  category: 'passive',
}

const SHIELD_OF_FAITH: LibraryEntry = {
  name: 'Shield of Faith',
  text: 'A bonus action and a shimmer around somebody within 60 feet: +2 Armour Class for ten minutes while you concentrate.',
  roll: null,
  level: 1,
  catalogueKey: 'shield-of-faith',
  category: 'passive',
}

const BLESS: LibraryEntry = {
  name: 'Bless',
  text: 'Three creatures within 30 feet add this to every attack roll and every saving throw they make while you concentrate. Unglamorous, and the best level 1 spell in the game.',
  roll: '1d4',
  level: 1,
  catalogueKey: 'bless',
  category: 'action',
}

const SHINING_SMITE: LibraryEntry = {
  name: 'Shining Smite',
  text: 'A bonus action after a hit: extra radiant damage, and the target sheds light and cannot hide while you concentrate — so everything attacking it rolls with advantage.',
  roll: '2d6',
  level: 2,
  catalogueKey: 'shining-smite',
  category: 'action',
}

const AID: LibraryEntry = {
  name: 'Aid',
  text: 'Three creatures within 30 feet gain 5 hit points and 5 more of maximum for eight hours. It is healing that arrives before the fight rather than during it.',
  roll: null,
  level: 2,
  catalogueKey: 'aid',
  category: 'passive',
}

const ZONE_OF_TRUTH: LibraryEntry = {
  name: 'Zone of Truth',
  text: 'A 15-foot sphere within 60 feet, for ten minutes. Everything inside that fails a Charisma save cannot say anything it knows to be false — though it can still decline to answer.',
  roll: null,
  level: 2,
  catalogueKey: 'zone-of-truth',
  category: 'passive',
}

const FIND_STEED: LibraryEntry = {
  name: 'Find Steed',
  text: 'A spirit in the shape of a horse, a pony or something stranger, bonded to you and intelligent. It comes when you call, and it goes rather than dies.',
  roll: null,
  level: 2,
  catalogueKey: 'find-steed',
  category: 'passive',
}

const EQUIPMENT =
  'Chain mail, a shield, a longsword, six javelins, a holy symbol and a priest\'s pack, plus the acolyte\'s calligrapher\'s supplies, book of prayers, parchment and robe.'

const HIT_DIE = 10

export const PALADIN: ClassLibrary = {
  classKey: 'paladin',
  base: {
    1: {
      level: 1,
      // Strength and Charisma, in that order, because the first swings the sword and the
      // second pays for every spell, the save DC, Lay on Hands and Sacred Weapon's bonus.
      // A paladin is the only class where both halves genuinely have to be paid for.
      abilities: { str: 15, dex: 10, con: 13, int: 8, wis: 13, cha: 16 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: 18,
      maxHp: 11,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [LONGSWORD, JAVELIN, LAY_ON_HANDS, WEAPON_MASTERY, MAGIC_INITIATE],
      spells: [HEROISM, DIVINE_SMITE],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: the highest Armour Class of anybody at level 1, a pool of healing you hand out a bonus action at a time, and Divine Smite to spend a slot on the moment a swing lands.',
    },
    2: {
      level: 2,
      abilities: { str: 15, dex: 10, con: 13, int: 8, wis: 13, cha: 16 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: 19,
      maxHp: 18,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        LONGSWORD,
        JAVELIN,
        LAY_ON_HANDS,
        WEAPON_MASTERY,
        DEFENCE,
        PALADINS_SMITE,
        MAGIC_INITIATE,
      ],
      spells: [HEROISM, DIVINE_SMITE, SEARING_SMITE],
      equipment: EQUIPMENT,
      levellingNotes:
        'The Defense fighting style takes your Armour Class to 19, which is very hard to land a hit on at level 2. Paladin\'s Smite keeps Divine Smite prepared for free and pays for one cast a day.',
    },
  },
  paths: {
    devotion: {
      3: {
        level: 3,
        abilities: { str: 15, dex: 10, con: 13, int: 8, wis: 13, cha: 16 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 19,
        maxHp: 25,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          LONGSWORD,
          JAVELIN,
          LAY_ON_HANDS,
          WEAPON_MASTERY,
          DEFENCE,
          PALADINS_SMITE,
          CHANNEL_DIVINITY,
          SACRED_WEAPON,
          MAGIC_INITIATE,
        ],
        spells: [
          HEROISM,
          DIVINE_SMITE,
          SEARING_SMITE,
          CURE_WOUNDS,
          PROTECTION_FROM_EVIL_AND_GOOD,
          SHIELD_OF_FAITH,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'You swear the Oath of Devotion. Channel Divinity twice between rests, Sacred Weapon to add your Charisma to every attack roll for ten minutes, and two oath spells prepared for nothing.',
      },
      4: {
        level: 4,
        // The improvement goes into Strength: 15 → 17. Charisma was the alternative and
        // lost by one point of Armour Class: 16 is already an even score, so +2 there buys
        // the save DC and nothing else, while the Strength buys every attack and every
        // damage roll on a class that swings twice from next level.
        abilities: { str: 17, dex: 10, con: 13, int: 8, wis: 13, cha: 16 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 19,
        maxHp: 32,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          LONGSWORD,
          JAVELIN,
          LAY_ON_HANDS,
          WEAPON_MASTERY,
          DEFENCE,
          PALADINS_SMITE,
          CHANNEL_DIVINITY,
          SACRED_WEAPON,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          HEROISM,
          DIVINE_SMITE,
          SEARING_SMITE,
          CURE_WOUNDS,
          PROTECTION_FROM_EVIL_AND_GOOD,
          SHIELD_OF_FAITH,
          BLESS,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Strength goes from 15 to 17 — +1 to hit and +1 damage on every swing — and Bless joins the list, which is the spell you cast before the fight rather than during it.',
      },
      5: {
        level: 5,
        abilities: { str: 17, dex: 10, con: 13, int: 8, wis: 13, cha: 16 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: 19,
        maxHp: 39,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          LONGSWORD,
          JAVELIN,
          LAY_ON_HANDS,
          WEAPON_MASTERY,
          DEFENCE,
          PALADINS_SMITE,
          CHANNEL_DIVINITY,
          SACRED_WEAPON,
          EXTRA_ATTACK,
          FAITHFUL_STEED,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          HEROISM,
          DIVINE_SMITE,
          SEARING_SMITE,
          CURE_WOUNDS,
          PROTECTION_FROM_EVIL_AND_GOOD,
          SHIELD_OF_FAITH,
          BLESS,
          SHINING_SMITE,
          AID,
          ZONE_OF_TRUTH,
          FIND_STEED,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Extra Attack, so there are two chances a turn to land the blow you want to smite on. Level 2 spells arrive with the oath\'s Aid and Zone of Truth, and Faithful Steed calls up a mount that is more of a person than a horse.',
      },
    },
  },
}
