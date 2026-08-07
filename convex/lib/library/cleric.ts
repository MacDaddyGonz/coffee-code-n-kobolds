// The Cleric: five premade sheets, level 1 to 5, Life Domain.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Acolyte.** The standard array goes 15 Wisdom, 14 Constitution, 13
// Strength, 12 Charisma, 10 Dexterity, 8 Intelligence, and the Acolyte background's
// **+2 Wisdom and +1 Charisma** are already in the numbers below. Insight and Religion
// are the Acolyte's two skills; Medicine and Persuasion are the class's own.
//
// **Divine Order: Protector**, which is the choice a beginner is better served by —
// martial weapons and heavy armour training, against Thaumaturge's extra cantrip. The
// starting package is still a chain shirt and a shield, so the armour class on these
// sheets is 15 and the heavier armour is something to buy.
//
// ⚠️ **Channel Divinity is ONE entry rather than three, and that is the shared-pool
// problem being avoided rather than solved.** Divine Spark, Turn Undead and Preserve Life
// all spend the same two uses, and this application has no way for a child entry to spend
// a parent's — the roadmap keeps that open deliberately, because a pointer to a
// resolver-minted id orphans its children at the next level-up. So the uses live on one
// line that names all three effects, and Preserve Life sits beside it as a passive whose
// text says which pool it draws on. Three entries with two uses each would be the app
// quietly tripling the feature.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  insight: true,
  religion: true,
  medicine: true,
  persuasion: true,
}

const MACE: LibraryEntry = {
  name: 'Mace',
  text: 'A flanged head on a short haft, reach 5 feet. It is not why anybody brought you, but it is what you swing when the spells run out.',
  roll: '1d6+STR',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+STR+PROF',
  mastery: 'sap',
}

const DIVINE_ORDER: LibraryEntry = {
  name: 'Divine Order: Protector',
  text: 'You took the fighting half of the calling: proficiency with martial weapons and training with heavy armour. The chain shirt and shield on this sheet are what you can afford; the heavy armour is what you are allowed.',
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

/**
 * Two uses, one back on a short rest and all on a long one — the SRD's own recharge,
 * expressible because `resourceValidator` carries an amount as well as a period.
 */
const CHANNEL_DIVINITY: LibraryEntry = {
  name: 'Channel Divinity',
  text: 'Power straight off the Outer Planes, twice between rests. **Divine Spark**: point your holy symbol at something within 30 feet and either heal it for the roll plus your Wisdom, or make it save against that much radiant or necrotic damage. **Turn Undead**: every undead within 30 feet saves or spends a minute frightened and fleeing.',
  roll: '1d8',
  level: null,
  catalogueKey: null,
  category: 'action',
  uses: { max: 2, recharge: 'long', regainOnShortRest: 1 },
}

const DISCIPLE_OF_LIFE: LibraryEntry = {
  name: 'Disciple of Life',
  text: 'Every spell you cast with a slot that restores hit points restores more: 2 extra, plus the level of the slot you spent. It applies to each creature the spell heals.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const PRESERVE_LIFE: LibraryEntry = {
  name: 'Preserve Life',
  text: 'A third thing to do with a Channel Divinity use, spending one from the pool above. Five hit points per cleric level, divided as you like among bloodied creatures within 30 feet — none of them healed past half their maximum.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Wisdom.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

/** A number of d8s equal to your Wisdom modifier, which is +4 once level 4 has been taken. */
const SEAR_UNDEAD: LibraryEntry = {
  name: 'Sear Undead',
  text: 'Turn Undead now burns as well as frightens. Every undead that fails its save against it takes this much radiant damage, and the damage does not break the fleeing.',
  roll: '4d8',
  level: null,
  catalogueKey: null,
  category: 'action',
}

// --- spells ---------------------------------------------------------------

const GUIDANCE: LibraryEntry = {
  name: 'Guidance',
  text: 'Touch a willing creature and, once in the next minute, they add this to one ability check of their choice. The cheapest good thing you can do for somebody.',
  roll: '1d4',
  level: 0,
  catalogueKey: 'guidance',
  category: 'action',
}

const SACRED_FLAME: LibraryEntry = {
  name: 'Sacred Flame',
  text: 'A column of light falls on something within 60 feet. Dexterity save for none, and cover does not help it — which is what makes this the cantrip you reach for when the target is behind something.',
  roll: '1d8',
  level: 0,
  catalogueKey: 'sacred-flame',
  category: 'action',
}

const SACRED_FLAME_AT_5: LibraryEntry = { ...SACRED_FLAME, roll: '2d8' }

/**
 * ⚠️ **Light rather than Thaumaturgy, and that is a NAME COLLISION rather than a
 * preference.** Thaumaturgy is the cantrip the SRD recommends for a Cleric, and it is
 * also the spell the Tiefling is granted — and `species.test.ts` refuses a library entry
 * named after a species trait or grant, because the two arrive on one sheet under
 * different id prefixes and read as the same line printed twice. A Tiefling Cleric is a
 * perfectly ordinary character, so the library is the half that moves.
 */
const LIGHT: LibraryEntry = {
  name: 'Light',
  text: 'An object you touch, no bigger than ten feet across, sheds bright light for 20 feet and dim light 20 feet past that. A colour of your choosing, and it goes out when you say so.',
  roll: null,
  level: 0,
  catalogueKey: 'light',
  category: 'passive',
}

const SPARE_THE_DYING: LibraryEntry = {
  name: 'Spare the Dying',
  text: 'A touch, or a gesture within 30 feet, at a creature on 0 hit points. It stops dying and stabilises. No healing — just an end to the death saves.',
  roll: null,
  level: 0,
  catalogueKey: 'spare-the-dying',
  category: 'passive',
}

const BLESS: LibraryEntry = {
  name: 'Bless',
  text: 'Three creatures within 30 feet add this to every attack roll and every saving throw they make while you concentrate, for a minute. Unglamorous, and the best level 1 spell in the game.',
  roll: '1d4',
  level: 1,
  catalogueKey: 'bless',
  category: 'action',
}

const CURE_WOUNDS: LibraryEntry = {
  name: 'Cure Wounds',
  text: 'A hand laid on somebody within reach, and the wound closes. Disciple of Life adds 2 more plus the level of the slot you spent.',
  roll: '2d8+WIS',
  level: 1,
  catalogueKey: 'cure-wounds',
  category: 'action',
}

const GUIDING_BOLT: LibraryEntry = {
  name: 'Guiding Bolt',
  text: 'A lance of light at something up to 120 feet away. On a hit it takes radiant damage and glimmers until your next turn ends, so the next attack against it is rolled with advantage.',
  roll: '4d6',
  level: 1,
  catalogueKey: 'guiding-bolt',
  category: 'weapon',
  toHit: '1d20+WIS+PROF',
}

const SHIELD_OF_FAITH: LibraryEntry = {
  name: 'Shield of Faith',
  text: 'A bonus action and a shimmer around somebody within 60 feet: +2 Armour Class for ten minutes while you concentrate. Put it on whoever is about to be hit the most.',
  roll: null,
  level: 1,
  catalogueKey: 'shield-of-faith',
  category: 'passive',
}

const AID: LibraryEntry = {
  name: 'Aid',
  text: 'Three creatures within 30 feet gain 5 hit points and 5 more of maximum for eight hours. It is healing that arrives before the fight rather than during it.',
  roll: null,
  level: 2,
  catalogueKey: 'aid',
  category: 'passive',
}

const LESSER_RESTORATION: LibraryEntry = {
  name: 'Lesser Restoration',
  text: 'A touch ends one condition on a creature: blinded, deafened, paralyzed or poisoned. The answer to the fight that has gone quietly wrong.',
  roll: null,
  level: 2,
  catalogueKey: 'lesser-restoration',
  category: 'passive',
}

const SPIRITUAL_WEAPON: LibraryEntry = {
  name: 'Spiritual Weapon',
  text: 'A bonus action calls up a floating weapon of light within 60 feet, and a bonus action each turn after that moves it and swings it. It lasts a minute and it costs you nothing else on your turn.',
  roll: '1d8+WIS',
  level: 2,
  catalogueKey: 'spiritual-weapon',
  category: 'weapon',
  toHit: '1d20+WIS+PROF',
}

const MASS_HEALING_WORD: LibraryEntry = {
  name: 'Mass Healing Word',
  text: 'A bonus action, one word, and up to six creatures within 60 feet are healed at once. Disciple of Life adds its bonus to every one of them.',
  roll: '2d4+WIS',
  level: 3,
  catalogueKey: 'mass-healing-word',
  category: 'action',
}

const REVIVIFY: LibraryEntry = {
  name: 'Revivify',
  text: 'A creature that died within the last minute comes back on 1 hit point. It does not regrow anything that is missing, and it costs 300 gold in diamonds every time.',
  roll: null,
  level: 3,
  catalogueKey: 'revivify',
  category: 'passive',
}

const EQUIPMENT =
  'A chain shirt, a shield, a mace, a holy symbol and a priest\'s pack, plus the acolyte\'s calligrapher\'s supplies, book of prayers, parchment and robe.'

const HIT_DIE = 8
const ARMOUR_CLASS = 15

export const CLERIC: ClassLibrary = {
  classKey: 'cleric',
  base: {
    1: {
      level: 1,
      // Wisdom first because every spell, the save DC and half the skills come off it;
      // Constitution second because a cleric in the front rank is a cleric being hit.
      // Dexterity is dumped deliberately — medium armour caps what it would buy anyway.
      abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 17, cha: 13 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 10,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [MACE, DIVINE_ORDER, MAGIC_INITIATE],
      spells: [GUIDANCE, SACRED_FLAME, LIGHT, BLESS, CURE_WOUNDS, GUIDING_BOLT],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: armour and a shield, three cantrips, and Bless — which quietly makes everybody at the table better at hitting things and better at not dying. Cure Wounds is the other half of the job.',
    },
    2: {
      level: 2,
      abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 17, cha: 13 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 17,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [MACE, DIVINE_ORDER, CHANNEL_DIVINITY, MAGIC_INITIATE],
      spells: [
        GUIDANCE,
        SACRED_FLAME,
        LIGHT,
        BLESS,
        CURE_WOUNDS,
        GUIDING_BOLT,
        SHIELD_OF_FAITH,
      ],
      equipment: EQUIPMENT,
      levellingNotes:
        'Channel Divinity: twice between rests you either heal or hurt with Divine Spark, or send every undead in the room running with Turn Undead. One use comes back on a short rest.',
    },
  },
  paths: {
    life: {
      3: {
        level: 3,
        abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 17, cha: 13 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 24,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          MACE,
          DIVINE_ORDER,
          CHANNEL_DIVINITY,
          DISCIPLE_OF_LIFE,
          PRESERVE_LIFE,
          MAGIC_INITIATE,
        ],
        spells: [
          GUIDANCE,
          SACRED_FLAME,
          LIGHT,
          BLESS,
          CURE_WOUNDS,
          GUIDING_BOLT,
          SHIELD_OF_FAITH,
          AID,
          LESSER_RESTORATION,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'The Life Domain. Every healing spell you cast does more from now on, Preserve Life gives you a third thing to spend Channel Divinity on, and the domain keeps Aid and Lesser Restoration permanently prepared for free.',
      },
      4: {
        level: 4,
        // The improvement goes into Wisdom: 17 → 19. It raises the spell save DC, every
        // healing roll, Sear Undead's dice and four skills at once — nothing else on this
        // sheet is paid for that many times.
        abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 19, cha: 13 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 31,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          MACE,
          DIVINE_ORDER,
          CHANNEL_DIVINITY,
          DISCIPLE_OF_LIFE,
          PRESERVE_LIFE,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          GUIDANCE,
          SACRED_FLAME,
          LIGHT,
          SPARE_THE_DYING,
          BLESS,
          CURE_WOUNDS,
          GUIDING_BOLT,
          SHIELD_OF_FAITH,
          AID,
          LESSER_RESTORATION,
          SPIRITUAL_WEAPON,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Wisdom goes from 17 to 19: a harder save DC, better healing and a better everything-else. A fourth cantrip, and Spiritual Weapon — a floating blade that attacks off a bonus action while you keep casting.',
      },
      5: {
        level: 5,
        abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 19, cha: 13 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 38,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          MACE,
          DIVINE_ORDER,
          CHANNEL_DIVINITY,
          DISCIPLE_OF_LIFE,
          PRESERVE_LIFE,
          SEAR_UNDEAD,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          GUIDANCE,
          SACRED_FLAME_AT_5,
          LIGHT,
          SPARE_THE_DYING,
          BLESS,
          CURE_WOUNDS,
          GUIDING_BOLT,
          SHIELD_OF_FAITH,
          AID,
          LESSER_RESTORATION,
          SPIRITUAL_WEAPON,
          MASS_HEALING_WORD,
          REVIVIFY,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Level 3 spells: Mass Healing Word picks the whole party up off a bonus action, and Revivify brings back somebody who died a minute ago. Sear Undead makes Turn Undead burn, and Sacred Flame doubles its dice.',
      },
    },
  },
}
