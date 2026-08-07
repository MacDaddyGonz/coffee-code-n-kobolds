// The Warlock: five premade sheets, level 1 to 5, Fiend Patron. **New with the 5e (2024)
// conversion** — one of the four classes this library did not have.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Acolyte.** The standard array goes 15 Charisma, 14 Constitution, 13
// Dexterity, 12 Wisdom, 10 Intelligence, 8 Strength, and the Acolyte background's **+2
// Charisma and +1 Wisdom** are already in the numbers below. Insight and Religion are the
// Acolyte's two skills; Arcana and Deception are the class's own.
//
// ⚠️⚠️ **PACT MAGIC IS THE ONE CASTER WHOSE SLOTS COME BACK ON A SHORT REST, AND THAT IS
// THE WHOLE REASON THIS CLASS WAS WORTH BUILDING FIRST.** The absorbed
// character-resources milestone reasoned from a corpus with no Warlock in it and
// concluded that *"the 2024 rules describe eight resource shapes and this corpus contains
// three"*. This is the shape it did not have: a tiny bank of slots — **one at level 1 and
// two thereafter** — that grows in slot *level* rather than in count, and that returns in
// full on a short rest. `restKindValidator`'s `'short'` is what expresses it, and
// `usesProblem` refuses a `regainOnShortRest` beside it, because a resource that already
// comes back in full has nothing partial to hand back.
//
// ⚠️ **Eldritch Blast's damage roll is PER BEAM and stops growing at level 5.** Agonizing
// Blast adds your Charisma to each beam from level 2, which is why the roll changes there;
// level 5 adds a *second beam* rather than a second die, and two beams are two separate
// attack rolls with the same expression. A `2d10+CHA` would be wrong twice over — it would
// roll one attack where the rules roll two, and it would add Charisma once where the rules
// add it to each.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  insight: true,
  religion: true,
  arcana: true,
  deception: true,
}

const SICKLE: LibraryEntry = {
  name: 'Sickle',
  text: 'A light curved blade, reach 5 feet. Carried because the pact came with one, not because you intend to use it.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const DAGGER: LibraryEntry = {
  name: 'Dagger',
  text: 'You carry two. Light and finesse, thrown 20 feet without trouble — and still worse than a cantrip in every situation you will meet.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

/**
 * Pact Magic — one slot at level 1, two thereafter, and **back on a short rest**.
 *
 * The slot *level* is what rises rather than the count: level 1 slots at character levels
 * 1–2, level 2 at 3–4, level 3 at 5. Every Warlock spell is cast at that level whatever
 * its own is, which is why the text says so on every sheet.
 */
const PACT_MAGIC: LibraryEntry = {
  name: 'Pact Magic',
  text: 'One spell slot, of level 1, and it comes back on a short rest as well as a long one. Every spell you cast is cast at that slot\'s level whatever level the spell itself is — so a level 1 Charm Person is cast as a level 1 spell here.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'short' },
}

const PACT_MAGIC_AT_2: LibraryEntry = {
  ...PACT_MAGIC,
  text: 'Two spell slots now, both of level 1, and both back on a short rest as well as a long one. Every spell you cast is cast at that slot\'s level whatever level the spell itself is.',
  uses: { max: 2, recharge: 'short' },
}

const PACT_MAGIC_AT_3: LibraryEntry = {
  ...PACT_MAGIC_AT_2,
  text: 'Two spell slots, and they are level 2 slots from now on. Every spell you cast is cast at that level whatever level the spell itself is — so Hex and Charm Person are both cast as level 2 spells, for free.',
}

const PACT_MAGIC_AT_5: LibraryEntry = {
  ...PACT_MAGIC_AT_2,
  text: 'Two spell slots, and they are level 3 slots from now on. Every spell you cast is cast at that level whatever level the spell itself is — so a level 1 spell out of one of these is a level 3 spell, and both come back on a short rest.',
}

const ELDRITCH_INVOCATIONS: LibraryEntry = {
  name: 'Eldritch Invocations',
  text: 'One piece of forbidden knowledge to begin with: **Pact of the Tome**, a Book of Shadows holding three cantrips from any list, which count as Warlock spells for you. You may swap an invocation whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const ELDRITCH_INVOCATIONS_AT_2: LibraryEntry = {
  ...ELDRITCH_INVOCATIONS,
  text: 'Three now: **Pact of the Tome** for a Book of Shadows of three extra cantrips, **Agonizing Blast** to add your Charisma to every beam of Eldritch Blast — it is already in the roll — and **Devil\'s Sight**, which lets you see 120 feet in any darkness, magical or otherwise.',
}

const ELDRITCH_INVOCATIONS_AT_5: LibraryEntry = {
  ...ELDRITCH_INVOCATIONS,
  text: 'Five now. The three you had, plus **Eldritch Spear**, which takes Eldritch Blast out to 300 feet, and **Mask of Many Faces**, which casts Disguise Self at will and costs you nothing at all.',
}

const MAGIC_INITIATE: LibraryEntry = {
  name: 'Magic Initiate',
  text: 'Origin feat. Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list, cast with an ability you choose when you take this. The 1st-level spell can be cast once a day without a slot, or with any slot you have. Swap one of the three whenever you gain a level.',
  roll: null,
  level: null,
  catalogueKey: 'magic-initiate',
  category: 'passive',
}

const MAGICAL_CUNNING: LibraryEntry = {
  name: 'Magical Cunning',
  text: 'A minute of quiet rite, once between long rests, and half your Pact Magic slots come back — rounded up, so one of the two. It is a short rest\'s worth of casting without the short rest.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 1, recharge: 'long' },
}

const DARK_ONES_BLESSING: LibraryEntry = {
  name: "Dark One's Blessing",
  text: 'Every time an enemy drops to 0 hit points — dropped by you, or by anybody within 10 feet of you — you gain temporary hit points equal to your Charisma plus your warlock level. It happens over and over in a long fight.',
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

const ELDRITCH_BLAST: LibraryEntry = {
  name: 'Eldritch Blast',
  text: 'A beam of crackling force at something up to 120 feet away. It is the best attack cantrip in the game and it is the one you will use most turns.',
  roll: '1d10',
  level: 0,
  catalogueKey: 'eldritch-blast',
  category: 'weapon',
  toHit: '1d20+CHA+PROF',
}

/** Agonizing Blast, from level 2: your Charisma on every beam. */
const ELDRITCH_BLAST_AT_2: LibraryEntry = { ...ELDRITCH_BLAST, roll: '1d10+CHA' }

/** Level 5 adds a second beam rather than a second die. See the header. */
const ELDRITCH_BLAST_AT_5: LibraryEntry = {
  ...ELDRITCH_BLAST_AT_2,
  text: 'Two beams of crackling force now, out to 120 feet, aimed at one target or two. Each is rolled separately and each does the damage below, so roll this twice.',
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

const HEX: LibraryEntry = {
  name: 'Hex',
  text: 'A bonus action curses one creature you can see for an hour. Every attack of yours that hits it deals this much extra necrotic damage, and it rolls one ability of your choosing with disadvantage.',
  roll: '1d6',
  level: 1,
  catalogueKey: 'hex',
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

const HELLISH_REBUKE: LibraryEntry = {
  name: 'Hellish Rebuke',
  text: 'A reaction, taken the moment something within 60 feet hurts you: flames wrap it. Dexterity save for half, and out of a level 3 slot this is a great deal of damage for a reaction.',
  roll: '2d10',
  level: 1,
  catalogueKey: 'hellish-rebuke',
  category: 'action',
}

const BURNING_HANDS: LibraryEntry = {
  name: 'Burning Hands',
  text: 'A sheet of flame in a 15-foot cone from your fingertips. Dexterity save for half, and anything flammable and unattended catches.',
  roll: '3d6',
  level: 1,
  catalogueKey: 'burning-hands',
  category: 'action',
}

const COMMAND: LibraryEntry = {
  name: 'Command',
  text: 'One word at a creature within 60 feet that understands you — approach, drop, flee, grovel, halt. Wisdom save; on a failure it spends its whole next turn doing exactly that.',
  roll: null,
  level: 1,
  catalogueKey: 'command',
  category: 'passive',
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

const SUGGESTION: LibraryEntry = {
  name: 'Suggestion',
  text: 'A sentence or two of reasonable-sounding course of action to one creature within 30 feet that can hear and understand you. Wisdom save; on a failure it spends up to eight hours doing it.',
  roll: null,
  level: 2,
  catalogueKey: 'suggestion',
  category: 'passive',
}

const MISTY_STEP: LibraryEntry = {
  name: 'Misty Step',
  text: 'A bonus action and a wisp of silver mist, and you are standing somewhere else within 30 feet that you can see. Through a grate, over a chasm, out of a closing circle.',
  roll: null,
  level: 2,
  catalogueKey: 'misty-step',
  category: 'passive',
}

const FIREBALL: LibraryEntry = {
  name: 'Fireball',
  text: 'A bead of fire to a point within 150 feet, and a 20-foot sphere of flame. Dexterity save for half. The most damage a level 3 slot can buy, and it does not care who is standing in it.',
  roll: '8d6',
  level: 3,
  catalogueKey: 'fireball',
  category: 'action',
}

const STINKING_CLOUD: LibraryEntry = {
  name: 'Stinking Cloud',
  text: 'A 20-foot sphere of retching yellow gas within 90 feet. Everything that starts its turn in it makes a Constitution save or spends the turn heaving and does nothing else at all.',
  roll: null,
  level: 3,
  catalogueKey: 'stinking-cloud',
  category: 'passive',
}

const EQUIPMENT =
  'Leather armour, a sickle, two daggers, an orb as an arcane focus, a book of occult lore and a scholar\'s pack, plus the acolyte\'s calligrapher\'s supplies, book of prayers, holy symbol, parchment and robe.'

const HIT_DIE = 8
const ARMOUR_CLASS = 12

export const WARLOCK: ClassLibrary = {
  classKey: 'warlock',
  base: {
    1: {
      level: 1,
      // Charisma first — the pact is written in it, and so is every spell, every spell
      // attack and the save DC. Constitution second: a warlock in leather armour with a
      // 60-foot cantrip is going to be shot at.
      abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 10,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [SICKLE, DAGGER, PACT_MAGIC, ELDRITCH_INVOCATIONS, MAGIC_INITIATE],
      spells: [ELDRITCH_BLAST, PRESTIDIGITATION, HEX, CHARM_PERSON],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: one spell slot — and it comes back every short rest, which no other caster\'s does. Eldritch Blast is what you do the rest of the time, and it never runs out.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
      saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 17,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        SICKLE,
        DAGGER,
        PACT_MAGIC_AT_2,
        ELDRITCH_INVOCATIONS_AT_2,
        MAGICAL_CUNNING,
        MAGIC_INITIATE,
      ],
      spells: [ELDRITCH_BLAST_AT_2, PRESTIDIGITATION, HEX, CHARM_PERSON, HELLISH_REBUKE],
      equipment: EQUIPMENT,
      levellingNotes:
        'A second slot, two more invocations, and Agonizing Blast — which puts your Charisma on every beam of Eldritch Blast for the rest of your career. Magical Cunning buys a slot back without a rest.',
    },
  },
  paths: {
    fiend: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 17 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 24,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          SICKLE,
          DAGGER,
          PACT_MAGIC_AT_3,
          ELDRITCH_INVOCATIONS_AT_2,
          MAGICAL_CUNNING,
          DARK_ONES_BLESSING,
          MAGIC_INITIATE,
        ],
        spells: [
          ELDRITCH_BLAST_AT_2,
          PRESTIDIGITATION,
          HEX,
          CHARM_PERSON,
          HELLISH_REBUKE,
          BURNING_HANDS,
          COMMAND,
          SCORCHING_RAY,
          SUGGESTION,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Your patron is a fiend, and four spells come with it for free. Both slots are level 2 slots now — everything you cast is cast at level 2 — and Dark One\'s Blessing hands you temporary hit points every time something drops nearby.',
      },
      4: {
        level: 4,
        // The improvement goes into Charisma: 17 → 19. Every beam of Eldritch Blast, the
        // save DC, every spell attack and Dark One's Blessing all move together.
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 31,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          SICKLE,
          DAGGER,
          PACT_MAGIC_AT_3,
          ELDRITCH_INVOCATIONS_AT_2,
          MAGICAL_CUNNING,
          DARK_ONES_BLESSING,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          ELDRITCH_BLAST_AT_2,
          PRESTIDIGITATION,
          MAGE_HAND,
          HEX,
          CHARM_PERSON,
          HELLISH_REBUKE,
          BURNING_HANDS,
          COMMAND,
          SCORCHING_RAY,
          SUGGESTION,
          MISTY_STEP,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Charisma goes from 17 to 19: every beam of Eldritch Blast, every spell attack, the save DC and Dark One\'s Blessing all improve at once. A third cantrip and Misty Step come with it.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 13, con: 14, int: 10, wis: 13, cha: 19 },
        saveProficiencies: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 38,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          SICKLE,
          DAGGER,
          PACT_MAGIC_AT_5,
          ELDRITCH_INVOCATIONS_AT_5,
          MAGICAL_CUNNING,
          DARK_ONES_BLESSING,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          ELDRITCH_BLAST_AT_5,
          PRESTIDIGITATION,
          MAGE_HAND,
          HEX,
          CHARM_PERSON,
          HELLISH_REBUKE,
          BURNING_HANDS,
          COMMAND,
          SCORCHING_RAY,
          SUGGESTION,
          MISTY_STEP,
          FIREBALL,
          STINKING_CLOUD,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Eldritch Blast fires two beams instead of one, both slots become level 3 slots, and Fireball arrives from the fiend — cast twice between short rests, which no other class in the game can say.',
      },
    },
  },
}
