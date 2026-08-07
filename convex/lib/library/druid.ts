// The Druid: five premade sheets, level 1 to 5, Circle of the Land. **New with the
// 5e (2024) conversion** — one of the four classes this library did not have.
//
// Content only — the shape is in ./types.ts, and see barbarian.ts for why an entry is
// named once and listed rather than written out at every level that carries it.
//
// **The build: Sage.** The standard array goes 15 Wisdom, 14 Constitution, 13 Dexterity,
// 12 Intelligence, 10 Charisma, 8 Strength, and the Sage background's **+2 Wisdom and
// +1 Constitution** are already in the numbers below. Arcana and History are the Sage's
// two skills; Nature and Perception are the class's own. **Primal Order: Magician**, for
// the third cantrip.
//
// ⚠️⚠️ **WILD SHAPE'S FOUR KNOWN FORMS ARE CONTENT, AND THAT IS A DELIBERATE REFUSAL TO
// READ THE BESTIARY.** The SRD says a druid's forms are Beast stat blocks of CR 1/4 or
// less without a Fly Speed, which is a **query against the creature corpus from a
// player-facing surface** — and `corpusGuard.test.ts` allows exactly three modules in
// `convex/` to import `lib/bestiary/`. A live lookup would need a fourth on that
// allow-list and an argument for it, and the argument is not available: the forms are
// four rows that change when the druid takes a long rest, which is a **choice**, and a
// choice belongs on the premade sheet exactly as the archetype does. So the Rat, the
// Riding Horse, the Spider and the Wolf are four `passive` entries written by hand here,
// with the numbers a DM needs to run them, and `lib/bestiary/` is not imported. **That
// directory staying byte-identical is the signal this was done right.**
//
// The forms are summaries rather than stat blocks: enough to play, and deliberately not
// enough to be a second copy of a corpus that already exists one directory over. A DM who
// wants the whole block looks the animal up in the bestiary panel, where it lives.
//
// ⚠️ **A wolf's bite knocks its target down and a spider's web holds it still**, and both
// are movement-detriment effects docs/requirements.md excludes. Neither is written into
// the forms below; what is written is the damage and the senses. That is the same line
// weapon mastery is admitted under — the word on the page, adjudicated at the table.

import { noSkills } from '../sheet'
import type { ClassLibrary, LibraryEntry } from './types'

const SKILLS = {
  ...noSkills(),
  arcana: true,
  history: true,
  nature: true,
  perception: true,
}

const QUARTERSTAFF: LibraryEntry = {
  name: 'Quarterstaff (Shillelagh)',
  text: 'Your druidic focus, and with Shillelagh up it swings off Wisdom rather than Strength and hits for a d8. Reach 5 feet. Without the cantrip it is a d6 and a bad idea.',
  roll: '1d8+WIS',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+WIS+PROF',
  mastery: 'topple',
}

const SICKLE: LibraryEntry = {
  name: 'Sickle',
  text: 'A light curved blade, reach 5 feet, finesse enough to swing off Dexterity. Mostly it cuts herbs.',
  roll: '1d4+DEX',
  level: null,
  catalogueKey: null,
  category: 'weapon',
  toHit: '1d20+DEX+PROF',
  mastery: 'nick',
}

const DRUIDIC: LibraryEntry = {
  name: 'Druidic',
  text: 'The secret language of druids, and hidden messages in it that only another druid spots. Learning it also left you able to talk to animals — you always have Speak with Animals prepared.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const PRIMAL_ORDER: LibraryEntry = {
  name: 'Primal Order: Magician',
  text: 'You took the scholarly half of the calling: one extra cantrip, and a bonus equal to your Wisdom on any Arcana or Nature check.',
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
 * Wild Shape, with the SRD's own recharge — one use back on a short rest and both on a
 * long one. `regainOnShortRest` is the field that made this expressible; lib/rest.ts
 * records that this pattern being *normal* in 2024 is what reversed the absorbed
 * milestone's long-rest-only reduction.
 */
const WILD_SHAPE: LibraryEntry = {
  name: 'Wild Shape',
  text: 'A bonus action turns you into one of the four beasts below for half your druid level in hours, or until you change back. You gain temporary hit points equal to your level, keep your own hit points, mind and class features, and cannot cast while you are in it.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
  uses: { max: 2, recharge: 'long', regainOnShortRest: 1 },
}

const WILD_COMPANION: LibraryEntry = {
  name: 'Wild Companion',
  text: 'Spend a spell slot or a use of Wild Shape to call up a nature spirit in animal form — Find Familiar, with no components needed. It is fey, and it goes when you take a long rest.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

// The four known forms. Written here rather than looked up — see the header.
const FORM_WOLF: LibraryEntry = {
  name: 'Wild Shape: Wolf',
  text: 'Armour Class 13, 11 hit points, Strength 14, Dexterity 15, Constitution 12. Bite for 2d4 piercing. Keen hearing and smell — advantage on Perception checks that use either. The form for a fight.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FORM_SPIDER: LibraryEntry = {
  name: 'Wild Shape: Spider',
  text: 'Armour Class 12, 4 hit points, Tiny. Bite for 1 piercing and a little poison. Climbs sheer walls and ceilings, and sees in the dark 30 feet. The form for getting somewhere nobody else can.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FORM_RAT: LibraryEntry = {
  name: 'Wild Shape: Rat',
  text: 'Armour Class 10, 1 hit point, Tiny. Bite for 1 piercing. Sees in the dark 30 feet and fits through anything a fist fits through. The form for scouting a room nobody is going to search.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const FORM_RIDING_HORSE: LibraryEntry = {
  name: 'Wild Shape: Riding Horse',
  text: 'Armour Class 11, 13 hit points, Large, Strength 16. Hooves for 1d6+3 bludgeoning. The form for covering ground, and for carrying somebody who cannot.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

const LANDS_AID: LibraryEntry = {
  name: "Land's Aid",
  text: 'Spend a use of Wild Shape and pick a point within 60 feet. Flowers and thorns bloom for a moment in a 10-foot sphere: everything you choose in it saves against your spell DC for half necrotic damage, and one creature you choose in there is healed for the same roll.',
  roll: '2d6',
  level: null,
  catalogueKey: null,
  category: 'action',
}

const ABILITY_SCORE_IMPROVEMENT: LibraryEntry = {
  name: 'Ability Score Improvement',
  text: 'General feat, from level 4. Raise one ability score by 2, or two of them by 1 each, to a maximum of 20. It can be taken again every time you are offered a feat. Taken here as +2 Wisdom.',
  roll: null,
  level: null,
  catalogueKey: 'ability-score-improvement',
  category: 'passive',
}

const WILD_RESURGENCE: LibraryEntry = {
  name: 'Wild Resurgence',
  text: 'Once on each of your turns, with no uses of Wild Shape left, spend a spell slot to buy one back. And once between long rests you can go the other way — a use of Wild Shape for a level 1 slot.',
  roll: null,
  level: null,
  catalogueKey: null,
  category: 'passive',
}

// --- spells ---------------------------------------------------------------

const SHILLELAGH: LibraryEntry = {
  name: 'Shillelagh',
  text: 'A bonus action, and your quarterstaff or club is wreathed in moonlight for a minute: it deals a d8 and it swings off Wisdom rather than Strength. The reason a druid can fight at all.',
  roll: null,
  level: 0,
  catalogueKey: 'shillelagh',
  category: 'passive',
}

const PRODUCE_FLAME: LibraryEntry = {
  name: 'Produce Flame',
  text: 'A flame in your palm that lights ten feet around you until you put it out — and can be thrown at something within 60 feet, which ends it.',
  roll: '1d8',
  level: 0,
  catalogueKey: 'produce-flame',
  category: 'weapon',
  toHit: '1d20+WIS+PROF',
}

const PRODUCE_FLAME_AT_5: LibraryEntry = { ...PRODUCE_FLAME, roll: '2d8' }

const DRUIDCRAFT: LibraryEntry = {
  name: 'Druidcraft',
  text: 'Small weather for the next day, a flower opened, a campfire lit or snuffed, a harmless puff of leaves. Nothing anybody rolls against, and the thing that makes you obviously a druid.',
  roll: null,
  level: 0,
  catalogueKey: 'druidcraft',
  category: 'passive',
}

const FIRE_BOLT: LibraryEntry = {
  name: 'Fire Bolt',
  text: 'A mote of fire thrown up to 120 feet. It sets light to anything flammable it hits and nobody is carrying.',
  roll: '1d10',
  level: 0,
  catalogueKey: 'fire-bolt',
  category: 'weapon',
  toHit: '1d20+WIS+PROF',
}

const FIRE_BOLT_AT_5: LibraryEntry = { ...FIRE_BOLT, roll: '2d10' }

const CURE_WOUNDS: LibraryEntry = {
  name: 'Cure Wounds',
  text: 'A hand laid on somebody within reach, and the wound closes.',
  roll: '2d8+WIS',
  level: 1,
  catalogueKey: 'cure-wounds',
  category: 'action',
}

const HEALING_WORD: LibraryEntry = {
  name: 'Healing Word',
  text: 'A bonus action and one shouted word, out to 60 feet. Small healing, but it reaches across the room and it costs you almost nothing on your turn.',
  roll: '2d4+WIS',
  level: 1,
  catalogueKey: 'healing-word',
  category: 'action',
}

const FAERIE_FIRE: LibraryEntry = {
  name: 'Faerie Fire',
  text: 'A 20-foot cube within 60 feet lights up. Everything in it that fails a Dexterity save is outlined in coloured light for a minute — cannot hide, and every attack against it is rolled with advantage.',
  roll: null,
  level: 1,
  catalogueKey: 'faerie-fire',
  category: 'passive',
}

const THUNDERWAVE: LibraryEntry = {
  name: 'Thunderwave',
  text: 'A wave of force out of you in a 15-foot cube. Constitution save for half, and everything unsecured in the area is blown away from you.',
  roll: '2d8',
  level: 1,
  catalogueKey: 'thunderwave',
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

const BLUR: LibraryEntry = {
  name: 'Blur',
  text: 'Your outline goes wrong for a minute while you concentrate. Everything that attacks you rolls with disadvantage unless it can see without eyes.',
  roll: null,
  level: 2,
  catalogueKey: 'blur',
  category: 'passive',
}

const MOONBEAM: LibraryEntry = {
  name: 'Moonbeam',
  text: 'A five-foot pillar of cold light in a 40-foot column within 120 feet, moved 60 feet with an action each turn. Anything that starts its turn in it, or walks into it, makes a Constitution save for half radiant damage.',
  roll: '2d10',
  level: 2,
  catalogueKey: 'moonbeam',
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

const CALL_LIGHTNING: LibraryEntry = {
  name: 'Call Lightning',
  text: 'A storm cloud 60 feet across overhead, and a bolt down out of it on your turn at a point you can see. Dexterity save for half, and a real storm above you makes it worse.',
  roll: '3d10',
  level: 3,
  catalogueKey: 'call-lightning',
  category: 'action',
}

const EQUIPMENT =
  'Leather armour, a shield, a sickle, a quarterstaff as a druidic focus, an explorer\'s pack and a herbalism kit, plus the sage\'s calligrapher\'s supplies, book of history, parchment and robe.'

const HIT_DIE = 8
const ARMOUR_CLASS = 14

export const DRUID: ClassLibrary = {
  classKey: 'druid',
  base: {
    1: {
      level: 1,
      // Wisdom first because the spells, the save DC and — through Shillelagh — the
      // quarterstaff all run off it. Constitution second, because a druid in a wolf's
      // shape keeps its own hit points and will be spending them.
      abilities: { str: 8, dex: 13, con: 15, int: 12, wis: 17, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 10,
      hitDice: { count: 1, faces: HIT_DIE },
      feats: [QUARTERSTAFF, SICKLE, DRUIDIC, PRIMAL_ORDER, MAGIC_INITIATE],
      spells: [SHILLELAGH, PRODUCE_FLAME, DRUIDCRAFT, CURE_WOUNDS, FAERIE_FIRE, THUNDERWAVE],
      equipment: EQUIPMENT,
      levellingNotes:
        'Where you start: three cantrips, three spells, and a staff that hits like a sword as long as Shillelagh is up. Faerie Fire is the one that wins fights — everything it catches is attacked with advantage by the whole party.',
    },
    2: {
      level: 2,
      abilities: { str: 8, dex: 13, con: 15, int: 12, wis: 17, cha: 10 },
      saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
      skillProficiencies: SKILLS,
      armourClass: ARMOUR_CLASS,
      maxHp: 17,
      hitDice: { count: 2, faces: HIT_DIE },
      feats: [
        QUARTERSTAFF,
        SICKLE,
        DRUIDIC,
        PRIMAL_ORDER,
        WILD_SHAPE,
        WILD_COMPANION,
        FORM_WOLF,
        FORM_SPIDER,
        FORM_RAT,
        FORM_RIDING_HORSE,
        MAGIC_INITIATE,
      ],
      spells: [
        SHILLELAGH,
        PRODUCE_FLAME,
        DRUIDCRAFT,
        CURE_WOUNDS,
        HEALING_WORD,
        FAERIE_FIRE,
        THUNDERWAVE,
      ],
      equipment: EQUIPMENT,
      levellingNotes:
        'Wild Shape. Twice between long rests — and one of them back on a short rest — you become the wolf, the spider, the rat or the riding horse listed below. Each form is a scouting problem or a fight solved.',
    },
  },
  paths: {
    land: {
      3: {
        level: 3,
        abilities: { str: 8, dex: 13, con: 15, int: 12, wis: 17, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 24,
        hitDice: { count: 3, faces: HIT_DIE },
        feats: [
          QUARTERSTAFF,
          SICKLE,
          DRUIDIC,
          PRIMAL_ORDER,
          WILD_SHAPE,
          WILD_COMPANION,
          FORM_WOLF,
          FORM_SPIDER,
          FORM_RAT,
          FORM_RIDING_HORSE,
          LANDS_AID,
          MAGIC_INITIATE,
        ],
        spells: [
          SHILLELAGH,
          PRODUCE_FLAME,
          DRUIDCRAFT,
          FIRE_BOLT,
          CURE_WOUNDS,
          HEALING_WORD,
          FAERIE_FIRE,
          THUNDERWAVE,
          BURNING_HANDS,
          BLUR,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'You join the Circle of the Land, swearing yourself to arid country: Fire Bolt, Burning Hands and Blur are permanently prepared and cost you nothing. Land\'s Aid spends a Wild Shape to hurt everything in a sphere and heal one thing in it.',
      },
      4: {
        level: 4,
        // The improvement goes into Wisdom: 17 → 19. The staff, the save DC, the healing
        // and four skills all move together, which nothing else on this sheet does.
        abilities: { str: 8, dex: 13, con: 15, int: 12, wis: 19, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 31,
        hitDice: { count: 4, faces: HIT_DIE },
        feats: [
          QUARTERSTAFF,
          SICKLE,
          DRUIDIC,
          PRIMAL_ORDER,
          WILD_SHAPE,
          WILD_COMPANION,
          FORM_WOLF,
          FORM_SPIDER,
          FORM_RAT,
          FORM_RIDING_HORSE,
          LANDS_AID,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          SHILLELAGH,
          PRODUCE_FLAME,
          DRUIDCRAFT,
          FIRE_BOLT,
          CURE_WOUNDS,
          HEALING_WORD,
          FAERIE_FIRE,
          THUNDERWAVE,
          BURNING_HANDS,
          BLUR,
          MOONBEAM,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Wisdom goes from 17 to 19, which is +1 to hit and +1 damage with the staff and a harder save DC on everything else. Moonbeam is the first spell you cast and then keep steering.',
      },
      5: {
        level: 5,
        abilities: { str: 8, dex: 13, con: 15, int: 12, wis: 19, cha: 10 },
        saveProficiencies: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
        skillProficiencies: SKILLS,
        armourClass: ARMOUR_CLASS,
        maxHp: 38,
        hitDice: { count: 5, faces: HIT_DIE },
        feats: [
          QUARTERSTAFF,
          SICKLE,
          DRUIDIC,
          PRIMAL_ORDER,
          WILD_SHAPE,
          WILD_COMPANION,
          FORM_WOLF,
          FORM_SPIDER,
          FORM_RAT,
          FORM_RIDING_HORSE,
          LANDS_AID,
          WILD_RESURGENCE,
          ABILITY_SCORE_IMPROVEMENT,
          MAGIC_INITIATE,
        ],
        spells: [
          SHILLELAGH,
          PRODUCE_FLAME_AT_5,
          DRUIDCRAFT,
          FIRE_BOLT_AT_5,
          CURE_WOUNDS,
          HEALING_WORD,
          FAERIE_FIRE,
          THUNDERWAVE,
          BURNING_HANDS,
          BLUR,
          MOONBEAM,
          FIREBALL,
          CALL_LIGHTNING,
        ],
        equipment: EQUIPMENT,
        levellingNotes:
          'Fireball, from the arid circle and free. Call Lightning beside it, both cantrips double their dice, and Wild Resurgence lets you trade spell slots for Wild Shapes in either direction.',
      },
    },
  },
}
