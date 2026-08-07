// The Bard: five premade sheets, level 1 to 5, College of Lore.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Acolyte.** The standard array goes 15 Charisma, 14 Dexterity, 13
// Constitution, 12 Wisdom, 10 Intelligence, 8 Strength, and the Acolyte background's
// **+2 Charisma and +1 Wisdom** are already in the numbers below. Insight and Religion
// are the Acolyte's two skills; Deception, Performance and Persuasion are the three the
// class chooses freely, and College of Lore adds three more at level 3.
//
// ⚠️ **Acolyte is the only one of the SRD's four backgrounds that touches Charisma**, so
// every Charisma class in this library takes it — Bard, Cleric, Paladin, Sorcerer and
// Warlock. That is a fact about a four-row table rather than a preference, and it is
// worth knowing before somebody "diversifies" one of the five into a build two points
// worse at the thing it exists to do.
//
// **The spell list is a selection, not the whole prepared list.** The SRD says *choose
// four level 1 spells* and this sheet is one such choice; nothing in this application
// counts prepared spells, and a sheet carrying all nine a level 5 Bard may prepare is a
// sheet nobody reads. `library.test.ts` bounds the count per level and says so.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  insight: true,
  religion: true,
  deception: true,
  performance: true,
  persuasion: true,
}

/** College of Lore's Bonus Proficiencies at level 3: three more, chosen for a scholar. */
const SKILLS_AT_3 = { ...SKILLS, arcana: true, history: true, investigation: true }

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry two. Quick and finesse, so they use Dexterity rather than Strength, and either can be thrown 20 feet without trouble.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

/**
 * Bardic Inspiration, with the count stated as a literal per level rather than derived.
 *
 * The SRD says *a number of times equal to your Charisma modifier*, which is 3 while
 * Charisma is 17 and 4 once level 4 raises it to 19 — and because a library sheet is
 * written per level, a literal is exact and cannot drift. That is the same argument the
 * roadmap makes about proficiency-bonus-many counts, reaching a second kind of
 * derivation and holding.
 */
const BARDIC_INSPIRATION: LibraryEntry = {
  name: 'Bardic Inspiration',
  text: 'A bonus action, and a word or a bar of music to somebody within 60 feet who can see or hear you. For the next hour, once, they may roll this die after a failed d20 test and add it — which often turns the failure into a success.',
  roll: '1d6',
  level: null,
  catalogueKey: null,
  category: 'action',
  uses: { max: 3, recharge: 'long' },
}

const BARDIC_INSPIRATION_AT_4: LibraryEntry = {
  ...BARDIC_INSPIRATION,
  uses: { max: 4, recharge: 'long' },
}

/** Level 5 does two things to it at once: a bigger die, and Font of Inspiration's rest. */
const BARDIC_INSPIRATION_AT_5: LibraryEntry = {
  ...BARDIC_INSPIRATION,
  roll: '1d8',
  uses: { max: 4, recharge: 'short' },
}

const MAGIC_INITIATE: LibraryEntry = {
  name: 'Magic Initiate',
  text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: 'magic-initiate',
  category: 'passive',
}

const EXPERTISE: LibraryEntry = {
  name: 'Expertise',
  text: 'Two of your trained skills are now doubly trained — Performance and Persuasion here — so you add twice your proficiency bonus to them rather than once.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const JACK_OF_ALL_TRADES: LibraryEntry = {
  name: 'Jack of All Trades',
  text: 'Any ability check that uses a skill you are not trained in gets half your proficiency bonus, rounded down. You are passable at everything and nobody has to ask why.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const BONUS_PROFICIENCIES: LibraryEntry = {
  name: 'Bonus Proficiencies',
  text: 'College of Lore trains you in three more skills — Arcana, History and Investigation on this sheet. It is the widest single grant of proficiency in the game.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const CUTTING_WORDS: LibraryEntry = {
  name: 'Cutting Words',
  text: 'A reaction, spending a use of Bardic Inspiration, when something you can see within 60 feet rolls damage or succeeds on a check or an attack. Roll and subtract — which can turn the success back into a failure.',
  roll: '1d6',
  level: null,
  catalogueKey: null,
  category: 'action',
}

const CUTTING_WORDS_AT_5: LibraryEntry = { ...CUTTING_WORDS, roll: '1d8' }

const FONT_OF_INSPIRATION: LibraryEntry = {
  name: 'Font of Inspiration',
  text: 'Every use of Bardic Inspiration comes back on a short rest as well as a long one — and you can spend a spell slot to buy one back at any time, no action needed.',
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

// --- spells ---------------------------------------------------------------
//
// ⚠️ **A bard heals and mocks off Charisma, and the catalogue says Wisdom.** The roll on
// a keyed entry is deliberately tailorable for exactly this — lib/rules.ts writes the
// commonest caster's ability into the picker's copy and says so — so Cure Wounds and
// Healing Word read `+CHA` here and are correct on both sides.

const DANCING_LIGHTS: LibraryEntry = {
  name: 'Dancing Lights',
  text: 'Four hovering lights, or one faint humanoid shape made of light, out to 120 feet. You move them about with a thought while you keep concentrating.',
  roll: null,
  level: 0,
  catalogueKey: 'dancing-lights',
  category: 'passive',
}

const VICIOUS_MOCKERY: LibraryEntry = {
  name: 'Vicious Mockery',
  text: 'An insult barbed with magic at something within 60 feet that can hear you. It makes a Wisdom save; on a failure it takes psychic damage and rolls its next attack with disadvantage.',
  roll: '1d6',
  level: 0,
  catalogueKey: 'vicious-mockery',
  category: 'action',
}

/** Cantrip damage steps up at level 5 — the one place a cantrip's numbers move in range. */
const VICIOUS_MOCKERY_AT_5: LibraryEntry = { ...VICIOUS_MOCKERY, roll: '2d6' }

const MINOR_ILLUSION: LibraryEntry = {
  name: 'Minor Illusion',
  text: 'A sound, or an object no bigger than five feet across, within 30 feet. It does not move, and a hand passes straight through it — but nobody has to put a hand through it.',
  roll: null,
  level: 0,
  catalogueKey: 'minor-illusion',
  category: 'passive',
}

const HEALING_WORD: LibraryEntry = {
  name: 'Healing Word',
  text: 'A bonus action and one shouted word, out to 60 feet. Small healing, but it reaches across the room and it costs you almost nothing on your turn.',
  roll: '2d4+CHA',
  level: 1,
  catalogueKey: 'healing-word',
  category: 'action',
}

const CURE_WOUNDS: LibraryEntry = {
  name: 'Cure Wounds',
  text: 'A hand laid on somebody within reach, and the wound closes. More healing than Healing Word, but you have to be standing next to them and it costs your action.',
  roll: '2d8+CHA',
  level: 1,
  catalogueKey: 'cure-wounds',
  category: 'action',
}

const DISSONANT_WHISPERS: LibraryEntry = {
  name: 'Dissonant Whispers',
  text: 'A melody only one creature within 60 feet can hear, and it is horrible. Wisdom save; on a failure it takes the full psychic damage and turns to run, on a success half and it stands its ground.',
  roll: '3d6',
  level: 1,
  catalogueKey: 'dissonant-whispers',
  category: 'action',
}

const CHARM_PERSON: LibraryEntry = {
  name: 'Charm Person',
  text: 'One humanoid within 30 feet makes a Wisdom save, with advantage if you or your friends are fighting it. On a failure it is charmed for an hour and treats you as a friend — and knows it was charmed afterwards.',
  roll: null,
  level: 1,
  catalogueKey: 'charm-person',
  category: 'passive',
}

const HEROISM: LibraryEntry = {
  name: 'Heroism',
  text: 'A creature you touch cannot be frightened while you concentrate, and gains temporary hit points equal to your Charisma at the start of each of its turns.',
  roll: null,
  level: 1,
  catalogueKey: 'heroism',
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

const INVISIBILITY: LibraryEntry = {
  name: 'Invisibility',
  text: 'A creature you touch is unseen for an hour, along with whatever it is carrying. It ends the moment they attack or cast a spell.',
  roll: null,
  level: 2,
  catalogueKey: 'invisibility',
  category: 'passive',
}

const SUGGESTION: LibraryEntry = {
  name: 'Suggestion',
  text: 'A sentence or two of reasonable-sounding course of action to one creature within 30 feet that can hear and understand you. Wisdom save; on a failure it spends up to eight hours doing it.',
  roll: null,
  level: 2,
  catalogueKey: 'suggestion',
  category: 'passive',
}

const HYPNOTIC_PATTERN: LibraryEntry = {
  name: 'Hypnotic Pattern',
  text: 'A drifting pattern of colour in a 30-foot cube within 120 feet. Everything that sees it makes a Wisdom save; on a failure it is charmed and does nothing at all until somebody shakes it or hurts it.',
  roll: null,
  level: 3,
  catalogueKey: 'hypnotic-pattern',
  category: 'passive',
}

const DISPEL_MAGIC: LibraryEntry = {
  name: 'Dispel Magic',
  text: 'Ends one spell of level 3 or lower on a creature, object or effect within 120 feet outright. Anything higher needs a check against your spellcasting ability.',
  roll: null,
  level: 3,
  catalogueKey: 'dispel-magic',
  category: 'passive',
}

const EQUIPMENT =
  'Leather armour, two daggers, a musical instrument and an entertainer\'s pack, plus an acolyte\'s: calligrapher\'s supplies, a book of prayers, a holy symbol, parchment and a robe.'

const HIT_DIE = 8
const ARMOUR_CLASS = 13

export const BARD: ClassLibrary = {
  classKey: 'bard',
  base: {
    1: {
      level: 1,
      // Charisma first, because everything the class does runs off it — the spells, the
      // save DC, the inspiration die's count and half the skills. Dexterity second,
      // because leather armour is the only armour a bard gets.
      abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: true, con: false, int: false, wis: false, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 9,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [DAGGER, BARDIC_INSPIRATION, MAGIC_INITIATE],
      spells: [
        DANCING_LIGHTS,
        VICIOUS_MOCKERY,
        HEALING_WORD,
        CURE_WOUNDS,
        DISSONANT_WHISPERS,
        CHARM_PERSON,
      ],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: two cantrips, four spells, and a die you hand to somebody else three times between long rests. You are the only character at the table who makes everybody else better at their own job.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: true, con: false, int: false, wis: false, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 15,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [DAGGER, BARDIC_INSPIRATION, EXPERTISE, JACK_OF_ALL_TRADES, MAGIC_INITIATE],
      spells: [
        DANCING_LIGHTS,
        VICIOUS_MOCKERY,
        HEALING_WORD,
        CURE_WOUNDS,
        DISSONANT_WHISPERS,
        CHARM_PERSON,
        HEROISM,
      ],
      equipment: EQUIPMENT,
      levellingNotes:
        'Expertise doubles your proficiency in Performance and Persuasion, and Jack of All Trades quietly gives you half of it in everything you are not trained in. The two together make you the party\'s answer to almost any check.',
    },
  },
  paths: {
    lore: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 13, cha: 17 },
        saveProficiencies: { str: false, dex: true, con: false, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 21,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          DAGGER,
          BARDIC_INSPIRATION,
          EXPERTISE,
          JACK_OF_ALL_TRADES,
          BONUS_PROFICIENCIES,
          CUTTING_WORDS,
          MAGIC_INITIATE,
        ],
        spells: [
          DANCING_LIGHTS,
          VICIOUS_MOCKERY,
          HEALING_WORD,
          CURE_WOUNDS,
          DISSONANT_WHISPERS,
          CHARM_PERSON,
          HEROISM,
          SHATTER,
          INVISIBILITY,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'You join the College of Lore. Three more trained skills, level 2 spells, and Cutting Words — a reaction that spends an inspiration die to take a chunk off somebody else\'s roll after you have seen it.',
      },
      4: {
        level: 4,
        // The improvement goes into Charisma: 17 → 19. It is the only score on this sheet
        // that pays twice, raising the spell save DC and the number of inspiration dice
        // in the same step.
        abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: true, con: false, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 27,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          DAGGER,
          BARDIC_INSPIRATION_AT_4,
          EXPERTISE,
          JACK_OF_ALL_TRADES,
          BONUS_PROFICIENCIES,
          CUTTING_WORDS,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          DANCING_LIGHTS,
          VICIOUS_MOCKERY,
          MINOR_ILLUSION,
          HEALING_WORD,
          CURE_WOUNDS,
          DISSONANT_WHISPERS,
          CHARM_PERSON,
          HEROISM,
          SHATTER,
          INVISIBILITY,
          SUGGESTION,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Charisma goes from 17 to 19, which raises your spell save DC and hands you a fourth inspiration die at the same time. A third cantrip and another level 2 spell come with it.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: true, con: false, int: false, wis: false, cha: true },
        skillProficiencies: SKILLS_AT_3,
        armourClass: ARMOUR_CLASS,
        maxHp: 33,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          DAGGER,
          BARDIC_INSPIRATION_AT_5,
          EXPERTISE,
          JACK_OF_ALL_TRADES,
          BONUS_PROFICIENCIES,
          CUTTING_WORDS_AT_5,
          FONT_OF_INSPIRATION,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          DANCING_LIGHTS,
          VICIOUS_MOCKERY_AT_5,
          MINOR_ILLUSION,
          HEALING_WORD,
          CURE_WOUNDS,
          DISSONANT_WHISPERS,
          CHARM_PERSON,
          HEROISM,
          SHATTER,
          INVISIBILITY,
          SUGGESTION,
          HYPNOTIC_PATTERN,
          DISPEL_MAGIC,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'The inspiration die grows to a d8 and Font of Inspiration hands all four back on a short rest, so you stop hoarding them. Level 3 spells arrive, and Vicious Mockery doubles its dice.',
      },
    },
  },
}
