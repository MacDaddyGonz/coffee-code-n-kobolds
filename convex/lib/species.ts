// The nine species of SRD 5.2.1, their thirty-three traits, and their twenty-four
// lineages.
//
// **This replaces the eight races of Milestone 4 rather than extending them.** That list
// was written from general knowledge and lifted requirements.md's *"No racial abilities"*
// exclusion to do it (ADR 0006); this one is a transcription of `character-origins.md`,
// and the exclusion stays lifted for a different reason — a species trait is now SRD text
// rather than something this project invented.
//
// ⚠️ **Three things about the 2024 rules make this a different shape from what it
// replaced, and each of them deleted code rather than adding it.**
//
//  1. **No species grants an ability score increase.** In 2024 those come from a
//     *background*, which requirements.md excludes and which stays excluded — its numbers
//     are absorbed into the premade sheet's stored `abilities`. So `abilityBonus` is gone,
//     and `applySpecies` in lib/resolve.ts has no arithmetic on abilities left to get
//     wrong. A reader who concludes backgrounds were lifted has it backwards: the
//     exclusion is what forces the absorption.
//  2. **A species is no longer one trait.** `traitName`/`traitText`, singular, became
//     `traits` — five for the Dragonborn and the Elf, three for the Human. The resolver
//     appends one `passive` entry per trait.
//  3. **Speed is printed, not adjusted.** `baseSpeed` is an **absolute** and the resolver
//     *sets* it. `speedBonus: 10` on the Goliath meant writing `+5` twice once the base
//     moved to 30, and invited the next reader to add it to something. Store what the SRD
//     prints.
//
// ⚠️ **`SPEED_FEET` in lib/sheet.ts is still 35 and this file does not depend on it.**
// Flipping that constant to 30 is a *stored-value* change — every sheet written before it
// has the field absent, so `speedOf` would silently slow every existing character by five
// feet — and it belongs to the migration branch. That is why `baseSpeed` is spelled out on
// all nine species rather than left absent on the eight that match a default: this module
// must produce the right speed whatever that constant currently says.
//
// Shared with the browser, and deliberately free of any `lib/library/` import: the picker
// needs these nine names and blurbs, and nothing else about them. See the note at the top
// of lib/classes.ts for why that separation matters to the bundle.

import { v } from 'convex/values'

import type { ContentEntry } from './sheet'

export const SPECIES_KEYS = [
  'dragonborn',
  'dwarf',
  'elf',
  'gnome',
  'goliath',
  'halfling',
  'human',
  'orc',
  'tiefling',
] as const
export type SpeciesKey = (typeof SPECIES_KEYS)[number]

/**
 * The narrow union every argument takes. Hand-spelled, and pinned against
 * `SPECIES_KEYS` by a test — the direction the compiler cannot see is a literal added
 * *here alone*, which the schema would then store and nothing could resolve.
 *
 * ⚠️ **`half-orc` is deliberately absent, and that is the whole of the refusal on
 * write.** A retired key is tolerated on read (`species()` answers null) and refused
 * here, which is the asymmetry `subclassOf`, `catalogueEntry` and `librarySheet`
 * already keep. `storedSpeciesKeyValidator` is the widened one that lets an existing
 * document survive a schema push; this one is what stops a new character being built
 * with a species that no longer exists.
 */
export const speciesKeyValidator = v.union(
  v.literal('dragonborn'),
  v.literal('dwarf'),
  v.literal('elf'),
  v.literal('gnome'),
  v.literal('goliath'),
  v.literal('halfling'),
  v.literal('human'),
  v.literal('orc'),
  v.literal('tiefling'),
)

/**
 * An ability the character may spend once between long rests.
 *
 * Tracked rather than merely described, because these are precisely the things a
 * table forgets: Heroic Inspiration goes unused for three sessions and the Orc's
 * one free survival gets spent twice in the same fight. The flag lives in
 * `characterVitals` beside hit points and hit dice, because it is **state** — a rest
 * changes it, an edit does not (ADR 0005).
 *
 * The app never enforces the effect. It remembers whether it has been spent, which is
 * the whole of what is being asked for and stops well short of a rules engine.
 *
 * ⚠️ **A boolean, so only a once-per-rest ability belongs here.** The 2024 species are
 * full of counts — Breath Weapon, Stonecunning, Giant Ancestry and Adrenaline Rush are
 * each *"a number of times equal to your Proficiency Bonus"* — and a count is a
 * different shape with a maximum and a recharge period. That shape is the schema
 * step's, not this one's, and writing a count as a boolean would tell a level 5
 * Dragonborn they had one breath when they have three.
 */
export type PerRestAbility = {
  key: string
  name: string
  text: string
}

/**
 * One of a species' special traits, exactly as the SRD prints it.
 *
 * A name and a sentence, and nothing else. **A trait becomes a `passive` sheet entry by
 * construction**, so there is nowhere on this type to put a roll — a species whose trait
 * genuinely rolls something grants a feat or a spell instead, which is what the
 * Dragonborn's Breath Weapon does through its ancestry. See `applySpecies`.
 */
export type SpeciesTrait = {
  name: string
  text: string
}

export type Species = {
  key: SpeciesKey
  name: string
  /** One line for the dropdown, written for somebody who has never played. */
  blurb: string
  /**
   * Every special trait the SRD lists, in its order. One `passive` entry each on the
   * resolved sheet.
   *
   * ⚠️ **A trait's name must never equal the name of anything in `grantedFeats` or
   * `grantedSpells`.** The Dragonborn shipped exactly that collision for a milestone —
   * a trait called `Breath Weapon` beside a granted feat called `Breath Weapon`, one
   * rollable and one not, on every Dragonborn's sheet. Five traits is five chances at
   * it instead of one, so `species.test.ts` pins it; and the resolver now mints both
   * under the **same `race` prefix**, so a collision is a duplicate id that
   * `sheetProblem` refuses outright rather than a cosmetic duplication nothing notices.
   */
  traits: readonly SpeciesTrait[]
  /**
   * The speed the SRD prints, in feet. **An absolute that the resolver sets**, never a
   * bonus it adds. Present on all nine — see the note at the top of this file about
   * `SPEED_FEET`.
   */
  baseSpeed?: number
  /**
   * The sixth thing the builder asks for, on the five species that have one. Absent
   * means there is nothing to choose and the control is not drawn at all.
   */
  lineages?: readonly Lineage[]
  /** Extra maximum hit points per character level. The Dwarf, and only the Dwarf. */
  hpPerLevel?: number
  // Both `ContentEntry` — the sheet entry with its **category answered**. Taken from
  // lib/sheet.ts rather than from lib/library/types.ts, which declares the same alias:
  // this module is imported by the browser for its dropdown, and `bundleGuard` and
  // `corpusGuard` both refuse a specifier naming a corpus directory. The shared type
  // lives in the module both sides may already see.
  /** Spells this species hands over for free, appended to the sheet's spell list. */
  grantedSpells?: ContentEntry[]
  /** Feats and abilities handed over for free, appended to the sheet's feat list. */
  grantedFeats?: ContentEntry[]
  /** Spendable once per long rest. Absent for the seven that have nothing to spend. */
  perRest?: PerRestAbility[]
}

/**
 * A lineage, legacy or ancestry — the choice five of the nine species make on top of
 * themselves.
 *
 * ⚠️ **This is a builder field rather than something absorbed into the build, and the
 * roadmap's own acceptance criterion is what decided it.** *"A Wood Elf moves 35 and a
 * Human moves 30"* is unsatisfiable if Wood Elf cannot be chosen, and the Elf, the
 * Gnome, the Tiefling, the Dragonborn and the Goliath each print a table the player
 * picks from. Absorbing them into the premade sheets — which is what change 1 does with
 * a background's numbers — would mean twenty-four times the library rather than one more
 * dropdown.
 *
 * `traitName`/`traitText` are **singular here and plural on `Species`**, and that is the
 * shape the SRD has rather than an inconsistency: every lineage grants exactly one named
 * benefit at level 1. What varies is what comes *with* it, which is what the granted
 * lists are for.
 */
export type Lineage = {
  key: string
  name: string
  /** One line for the dropdown, in the same register as a species' blurb. */
  blurb: string
  traitName: string
  traitText: string
  /**
   * An absolute, exactly as `Species.baseSpeed` is, and applied after it. The Wood Elf,
   * and only the Wood Elf.
   */
  speed?: number
  /**
   * ⚠️ **Deliberately empty on every lineage today, and the reason is a collision rather
   * than an oversight.** Six of the eight lineage cantrips would be a second row with the
   * same name as something a class already grants — a Tiefling Wizard would carry two
   * `Fire Bolt`s and a Forest Gnome Ranger two `Speak with Animals` — which is the exact
   * duplication the Dragonborn's `Breath Weapon` bug produced and which
   * `species.test.ts` refuses. A granted cantrip wants a `catalogueKey` so that there is
   * one description of it in the application, and the spell corpus is where that arrives.
   * Until then the cantrip is named in `traitText`, where it reads as a fact about the
   * lineage rather than as a duplicate spell.
   */
  grantedSpells?: ContentEntry[]
  /** What the choice actually hands you to roll: a breath weapon, a giant's boon. */
  grantedFeats?: ContentEntry[]
  /**
   * ⚠️ **Declared and populated nowhere, on purpose.** No lineage in the SRD grants a
   * once-per-long-rest boolean: every giant ancestry and every lineage spell is *"a
   * number of times equal to your Proficiency Bonus"*, which is a count and belongs to
   * the resource shape the schema step adds. The field is here because `perRestAbilities`
   * is keyed by species alone and would need a second argument the day one of these is
   * a boolean — naming the gap is cheaper than discovering it.
   */
  perRest?: PerRestAbility[]
}

export const SPECIES: readonly Species[] = [
  {
    key: 'dragonborn',
    name: 'Dragonborn',
    blurb: 'Dragon-blooded, and breathes what its ancestor breathed',
    baseSpeed: 30,
    traits: [
      {
        name: 'Draconic Ancestry',
        text: 'Your line runs back to a dragon. Choose which kind: the choice decides the damage your Breath Weapon deals and the damage you shrug off, and it is what the ancestry dropdown is for.',
      },
      {
        name: 'Breath Weapon',
        text: 'In place of one attack, exhale energy in a 15-foot cone or a 30-foot line five feet wide. Everyone caught in it makes a Dexterity saving throw against DC 8 plus your Constitution modifier and proficiency bonus, and takes half on a success. You may do this a number of times equal to your proficiency bonus, and a long rest returns them all.',
      },
      {
        name: 'Damage Resistance',
        text: 'You have Resistance to the damage type your Draconic Ancestry names — half damage from it, always, with nothing to spend and nothing to remember.',
      },
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
      },
      {
        name: 'Draconic Flight',
        text: 'From character level 5, a bonus action sprouts spectral wings that last ten minutes and give you a flying speed equal to your speed. Once per long rest.',
      },
    ],
    lineages: [
      draconic('black', 'Black Dragon', 'Acid'),
      draconic('blue', 'Blue Dragon', 'Lightning'),
      draconic('brass', 'Brass Dragon', 'Fire'),
      draconic('bronze', 'Bronze Dragon', 'Lightning'),
      draconic('copper', 'Copper Dragon', 'Acid'),
      draconic('gold', 'Gold Dragon', 'Fire'),
      draconic('green', 'Green Dragon', 'Poison'),
      draconic('red', 'Red Dragon', 'Fire'),
      draconic('silver', 'Silver Dragon', 'Cold'),
      draconic('white', 'White Dragon', 'Cold'),
    ],
  },
  {
    key: 'dwarf',
    name: 'Dwarf',
    blurb: 'Hardy, sees a long way in the dark, and shrugs off poison',
    baseSpeed: 30,
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 120 feet — twice as far as almost anybody.',
      },
      {
        name: 'Dwarven Resilience',
        text: 'You have Resistance to Poison damage, and Advantage on saving throws made to avoid or end the Poisoned condition.',
      },
      {
        name: 'Dwarven Toughness',
        text: 'Your maximum hit points rise by one for every level you have. It is quiet, and by level five it is the difference between standing and not.',
      },
      {
        name: 'Stonecunning',
        text: 'A bonus action gives you Tremorsense out to 60 feet for ten minutes, so long as you are on or touching stone — worked or natural. A number of times equal to your proficiency bonus, back on a long rest.',
      },
    ],
    hpPerLevel: 1,
  },
  {
    key: 'elf',
    name: 'Elf',
    blurb: 'Keen-eyed, hard to charm, and magical down the bloodline',
    baseSpeed: 30,
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
      },
      {
        name: 'Elven Lineage',
        text: 'You belong to one of three lineages — Drow, High Elf or Wood Elf — and it grants magic of its own at levels 1, 3 and 5. Choose one from the lineage dropdown.',
      },
      {
        name: 'Fey Ancestry',
        text: 'You have Advantage on saving throws made to avoid or end the Charmed condition.',
      },
      {
        name: 'Keen Senses',
        text: 'You are proficient in the Insight, Perception or Survival skill — pick one when you make the character.',
      },
      {
        name: 'Trance',
        text: 'You do not need to sleep and magic cannot put you to sleep. Four hours of trancelike meditation, awake throughout, finishes a long rest.',
      },
    ],
    lineages: [
      {
        key: 'drow',
        name: 'Drow',
        blurb: 'Darkvision out to 120 feet, and the Dancing Lights cantrip',
        traitName: 'Elven Lineage: Drow',
        traitText:
          'The range of your Darkvision increases to 120 feet, and you know the Dancing Lights cantrip. At character levels 3 and 5 you learn Faerie Fire and then Darkness, each castable once per long rest without a spell slot.',
      },
      {
        key: 'high',
        name: 'High Elf',
        blurb: 'The Prestidigitation cantrip, swappable on every long rest',
        traitName: 'Elven Lineage: High Elf',
        traitText:
          'You know the Prestidigitation cantrip, and may swap it for another Wizard cantrip whenever you finish a long rest. At character levels 3 and 5 you learn Detect Magic and then Misty Step, each castable once per long rest without a spell slot.',
      },
      {
        key: 'wood',
        name: 'Wood Elf',
        blurb: 'Thirty-five feet of speed, and the Druidcraft cantrip',
        traitName: 'Elven Lineage: Wood Elf',
        traitText:
          'Your speed increases to 35 feet, and you know the Druidcraft cantrip. At character levels 3 and 5 you learn Longstrider and then Pass without Trace, each castable once per long rest without a spell slot.',
        speed: 35,
      },
    ],
  },
  {
    key: 'gnome',
    name: 'Gnome',
    blurb: 'Small, clever, and slippery about anything magical',
    baseSpeed: 30,
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
      },
      {
        name: 'Gnomish Cunning',
        text: 'You have Advantage on Intelligence, Wisdom and Charisma saving throws — the three that most often decide whether something dreadful happens to your mind.',
      },
      {
        name: 'Gnomish Lineage',
        text: 'You are either a Forest Gnome or a Rock Gnome, and the choice brings magic with it. Choose one from the lineage dropdown.',
      },
    ],
    lineages: [
      {
        key: 'forest',
        name: 'Forest Gnome',
        blurb: 'The Minor Illusion cantrip, and a word with the animals',
        traitName: 'Gnomish Lineage: Forest Gnome',
        traitText:
          'You know the Minor Illusion cantrip, and always have Speak with Animals prepared — castable without a spell slot a number of times equal to your proficiency bonus, and back on a long rest.',
      },
      {
        key: 'rock',
        name: 'Rock Gnome',
        blurb: 'Mending and Prestidigitation, and little clockwork devices',
        traitName: 'Gnomish Lineage: Rock Gnome',
        traitText:
          'You know the Mending and Prestidigitation cantrips. Ten minutes of casting Prestidigitation also builds a tiny clockwork device — a toy, a fire starter, a music box — that anybody can set off with a touch. Three at a time, and each falls apart after eight hours.',
      },
    ],
  },
  {
    key: 'goliath',
    name: 'Goliath',
    blurb: 'Giant-blooded — enormous, and faster than you would think',
    // The one species that is not 30, and the reason a speed field exists at all.
    baseSpeed: 35,
    traits: [
      {
        name: 'Giant Ancestry',
        text: 'You are descended from giants, and one giant kind’s boon is yours. Choose it from the ancestry dropdown; you may use it a number of times equal to your proficiency bonus, and a long rest returns them all.',
      },
      {
        name: 'Large Form',
        text: 'From character level 5, a bonus action makes you Large for ten minutes if there is room for it: Advantage on Strength checks, and ten more feet of speed. Once per long rest.',
      },
      {
        name: 'Powerful Build',
        text: 'You have Advantage on any ability check made to escape a grapple, and you carry as though you were one size larger than you are.',
      },
    ],
    lineages: [
      // ⚠️ **Hill's Tumble sets Prone and Frost's Chill reduces a speed, and both are
      // words on a sheet rather than rules.** requirements.md excludes movement-detriment
      // status effects; nothing here shoves, halves a speed or sets a condition, exactly
      // as a weapon mastery, a condition pip and a creature's loot are labels. The roll
      // is the damage die the SRD prints and nothing consults the sentence beside it.
      {
        key: 'cloud',
        name: 'Cloud Giant',
        blurb: 'Cloud’s Jaunt — blink thirty feet as a bonus action',
        traitName: 'Giant Ancestry: Cloud Giant',
        traitText: 'Your boon is Cloud’s Jaunt, below.',
        grantedFeats: [
          {
            name: 'Cloud’s Jaunt',
            text: 'As a bonus action, teleport up to 30 feet to an unoccupied space you can see.',
            roll: null,
            level: null,
            catalogueKey: null,
            category: 'passive',
          },
        ],
      },
      {
        key: 'fire',
        name: 'Fire Giant',
        blurb: 'Fire’s Burn — extra fire damage when you land a hit',
        traitName: 'Giant Ancestry: Fire Giant',
        traitText: 'Your boon is Fire’s Burn, below.',
        grantedFeats: [
          {
            name: 'Fire’s Burn',
            text: 'When you hit a target with an attack roll and damage it, you can also deal 1d10 Fire damage to it.',
            roll: '1d10',
            level: null,
            catalogueKey: null,
            category: 'action',
          },
        ],
      },
      {
        key: 'frost',
        name: 'Frost Giant',
        blurb: 'Frost’s Chill — extra cold damage, and a slower target',
        traitName: 'Giant Ancestry: Frost Giant',
        traitText: 'Your boon is Frost’s Chill, below.',
        grantedFeats: [
          {
            name: 'Frost’s Chill',
            text: 'When you hit a target with an attack roll and damage it, you can also deal 1d6 Cold damage to it and reduce its speed by 10 feet until the start of your next turn.',
            roll: '1d6',
            level: null,
            catalogueKey: null,
            category: 'action',
          },
        ],
      },
      {
        key: 'hill',
        name: 'Hill Giant',
        blurb: 'Hill’s Tumble — knock what you hit off its feet',
        traitName: 'Giant Ancestry: Hill Giant',
        traitText: 'Your boon is Hill’s Tumble, below.',
        grantedFeats: [
          {
            name: 'Hill’s Tumble',
            text: 'When you hit a Large or smaller creature with an attack roll and damage it, you can give that target the Prone condition.',
            roll: null,
            level: null,
            catalogueKey: null,
            category: 'passive',
          },
        ],
      },
      {
        key: 'stone',
        name: 'Stone Giant',
        blurb: 'Stone’s Endurance — a reaction that soaks a blow',
        traitName: 'Giant Ancestry: Stone Giant',
        traitText: 'Your boon is Stone’s Endurance, below.',
        grantedFeats: [
          {
            name: 'Stone’s Endurance',
            text: 'When you take damage, a reaction rolls 1d12. Add your Constitution modifier and reduce the damage by that total.',
            roll: '1d12',
            level: null,
            catalogueKey: null,
            category: 'action',
          },
        ],
      },
      {
        key: 'storm',
        name: 'Storm Giant',
        blurb: 'Storm’s Thunder — thunder damage back at an attacker',
        traitName: 'Giant Ancestry: Storm Giant',
        traitText: 'Your boon is Storm’s Thunder, below.',
        grantedFeats: [
          {
            name: 'Storm’s Thunder',
            text: 'When a creature within 60 feet damages you, a reaction deals 1d8 Thunder damage back to it.',
            roll: '1d8',
            level: null,
            catalogueKey: null,
            category: 'action',
          },
        ],
      },
    ],
  },
  {
    key: 'halfling',
    name: 'Halfling',
    blurb: 'Small, cheerful, impossible to pin down',
    baseSpeed: 30,
    traits: [
      {
        name: 'Brave',
        text: 'You have Advantage on saving throws made to avoid or end the Frightened condition.',
      },
      {
        name: 'Halfling Nimbleness',
        text: 'You can move through the space of any creature at least one size larger than you. You simply cannot stop there.',
      },
      {
        name: 'Luck',
        text: 'When you roll a 1 on the d20 of a d20 test, roll again and use the new result. Always on — there is nothing to spend and nothing to remember.',
      },
      {
        name: 'Naturally Stealthy',
        text: 'You can take the Hide action even when the only thing obscuring you is a creature at least one size larger than you.',
      },
    ],
  },
  {
    key: 'human',
    name: 'Human',
    blurb: 'Adaptable, and lucky when it counts',
    baseSpeed: 30,
    traits: [
      {
        name: 'Resourceful',
        text: 'You gain Heroic Inspiration whenever you finish a long rest: one reroll of a d20 you have just taken, and you must use the new result. Spending it is the whole cost — nobody has to be asked.',
      },
      {
        name: 'Skillful',
        text: 'You are proficient in one skill of your choice, on top of whatever your class already gave you.',
      },
      {
        name: 'Versatile',
        text: 'You gain an Origin feat of your choice. Skilled is the recommended pick if nothing else appeals.',
      },
    ],
    perRest: [
      {
        key: 'heroic-inspiration',
        name: 'Heroic Inspiration',
        text: 'Reroll a d20 you have just rolled. Back on every long rest.',
      },
    ],
  },
  {
    key: 'orc',
    name: 'Orc',
    blurb: 'Refuses to go down, and outruns what it will not fight',
    baseSpeed: 30,
    traits: [
      {
        name: 'Adrenaline Rush',
        text: 'You can take the Dash action as a bonus action, and gain temporary hit points equal to your proficiency bonus when you do. A number of times equal to your proficiency bonus, back on a short or a long rest.',
      },
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 120 feet — twice as far as almost anybody.',
      },
      {
        name: 'Relentless Endurance',
        text: 'When you would drop to 0 hit points and are not killed outright, you drop to 1 instead. Once per long rest.',
      },
    ],
    // ⚠️ **Carried over from the Half-Orc under the same key**, and that is what makes
    // retiring that species cheap: a character who had already spent their survival keeps
    // the flag `characterVitals` stored for it. `setPerRest` validates a spend against
    // this list and deliberately does not validate handing one back, so nothing is
    // stranded either way.
    perRest: [
      {
        key: 'relentless-endurance',
        name: 'Relentless Endurance',
        text: 'Drop to 1 hit point instead of 0. Once per long rest.',
      },
    ],
  },
  {
    key: 'tiefling',
    name: 'Tiefling',
    blurb: 'Fiend-touched, with a legacy and a knack for the uncanny',
    baseSpeed: 30,
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
      },
      {
        name: 'Fiendish Legacy',
        text: 'Something fiendish is in your line — Abyssal, Chthonic or Infernal — and it grants a resistance and magic of its own at levels 1, 3 and 5. Choose one from the legacy dropdown.',
      },
      {
        name: 'Otherworldly Presence',
        text: 'You know the Thaumaturgy cantrip, and it costs you nothing to keep. It appears on your spell list already.',
      },
    ],
    grantedSpells: [
      {
        name: 'Thaumaturgy',
        text: 'A harmless show of supernatural power within 30 feet — your voice booms, flames change colour, the ground trembles, a door slams. Up to a minute, and worth far more at a table than in a fight.',
        roll: null,
        level: 0,
        catalogueKey: null,
        // Nothing is rolled and nothing is aimed — the cantrip is declared and it is
        // up, which is the definition of a passive rather than a judgement made here.
        category: 'passive',
      },
    ],
    lineages: [
      {
        key: 'abyssal',
        name: 'Abyssal',
        blurb: 'Resistance to poison, and the Poison Spray cantrip',
        traitName: 'Fiendish Legacy: Abyssal',
        traitText:
          'You have Resistance to Poison damage, and you know the Poison Spray cantrip. At character levels 3 and 5 you learn Ray of Sickness and then Hold Person, each castable once per long rest without a spell slot.',
      },
      {
        key: 'chthonic',
        name: 'Chthonic',
        blurb: 'Resistance to necrotic, and the Chill Touch cantrip',
        traitName: 'Fiendish Legacy: Chthonic',
        traitText:
          'You have Resistance to Necrotic damage, and you know the Chill Touch cantrip. At character levels 3 and 5 you learn False Life and then Ray of Enfeeblement, each castable once per long rest without a spell slot.',
      },
      {
        key: 'infernal',
        name: 'Infernal',
        blurb: 'Resistance to fire, and the Fire Bolt cantrip',
        traitName: 'Fiendish Legacy: Infernal',
        traitText:
          'You have Resistance to Fire damage, and you know the Fire Bolt cantrip. At character levels 3 and 5 you learn Hellish Rebuke and then Darkness, each castable once per long rest without a spell slot.',
      },
    ],
  },
]

/**
 * One row of the SRD's Draconic Ancestors table.
 *
 * ⚠️ **This is where the Dragonborn's rollable Breath Weapon lives, and it moved here on
 * purpose.** The species' `Breath Weapon` *trait* describes the cone, the line and the
 * saving throw and is a `passive` by construction; the ancestry is what decides the
 * damage type, so the ancestry is what can name the entry. That also settles the
 * duplicate-name defect this file records twice: `Acid Breath` and `Breath Weapon` are
 * two different rows saying two different things, where `Breath Weapon` and
 * `Breath Weapon` were one thing printed twice with only one of them rollable.
 *
 * Written as a helper because ten rows of the same shape hand-typed is ten chances to
 * give one of them the wrong damage type, and the table is the only thing that varies.
 * The die does not: 1d10 at levels 1–4 and 2d10 from level 5, which the text says and
 * which nothing scales, exactly as a library spell's prose names the upgrade its `roll`
 * field does not carry.
 */
function draconic(key: string, name: string, damage: string): Lineage {
  const lower = damage.toLowerCase()
  return {
    key,
    name,
    blurb: `${damage} — breathe it, and shrug it off`,
    traitName: `Draconic Ancestry: ${name}`,
    traitText: `Your Breath Weapon deals ${damage} damage, and you have Resistance to ${damage} damage.`,
    grantedFeats: [
      {
        name: `${damage} Breath`,
        text: `Exhale ${lower} in a 15-foot cone or a 30-foot line. Dexterity saving throw for half. 1d10 to start with, and 2d10 from character level 5.`,
        roll: '1d10',
        level: null,
        catalogueKey: null,
        // An `action` rather than a `weapon`: the breath simply goes off and the target
        // saves against it, so there is nothing to land first and therefore no to-hit. A
        // `weapon` here would promise the dice work a second roll that does not exist.
        category: 'action',
      },
    ],
  }
}

const SPECIES_BY_KEY = new Map(SPECIES.map((entry) => [entry.key, entry]))

/**
 * The species, or null for one that has been retired.
 *
 * ⚠️ **This used to end `SPECIES_BY_KEY.get(key)!` under the comment *"Non-null: `SpeciesKey`
 * is derived from the same list, so an unknown key cannot exist."* That comment was true when
 * it was written and is the exact shape of a landmine.**
 *
 * A key being unconstructable *in new code* is not the same as unconstructable. A character
 * **stores** its species, so removing an entry from `SPECIES_KEYS` leaves every character who
 * chose it holding a key nothing resolves — and the resolver then reads `.name` off the
 * `undefined` it got back. `findClass` in lib/classes.ts is the same lookup with the same
 * comment, and its docblock records what happened when a class was retired against it:
 * retiring one was a one-line edit that turned `characters.list` into a `TypeError` **for the
 * whole party**, not just for the character concerned. One player's stale key took everybody's
 * sheet list down.
 *
 * That pair has been one-fixed-one-not since; this is the other one, fixed **before** anything
 * was retired rather than after. ⭐ **Half-Orc has now actually gone**, so the comment above
 * would be false today and this function is the reason nothing broke.
 *
 * ⚠️ **Returning null is necessary and NOT sufficient.** `speciesKeyValidator` is in the stored
 * schema, and Convex validates existing documents on a push — so removing `'half-orc'` from
 * that union makes `npx convex deploy` *fail* against any deployment holding one, before this
 * function is ever called. The lookup is the second failure; the push is the first.
 * `storedSpeciesKeyValidator` is what carries the retired key across, exactly as
 * `storedTokenLayerValidator` carried `dm`.
 *
 * Takes a `string` rather than a `SpeciesKey`, like `findClass`, because a caller holding a
 * *stored* key by definition holds something the narrow type says cannot exist.
 */
export function species(key: string): Species | null {
  return SPECIES_BY_KEY.get(key as SpeciesKey) ?? null
}

/**
 * The lineage, legacy or ancestry, or null.
 *
 * **`subclassOf`'s stance, for `subclassOf`'s reason**, and deliberately the same three
 * lines: a lineage key is stored on a character and this file is content, so retiring or
 * renaming one must leave the characters that chose it readable rather than breaking their
 * sheet. Null for an unknown key, null for a species that has no lineages at all, and null
 * when nothing has been chosen yet — which is the level 1 case for every one of the five,
 * and the same shape as an archetype below `SUBCLASS_LEVEL`.
 *
 * ⚠️ **Scoped to the species rather than global**, which is what stops a stored `wood` on a
 * Goliath meaning anything. Lineage keys are only unique *within* a species — `fire` is a
 * giant ancestry and nothing else — and this signature is what makes that safe.
 */
export function lineageOf(chosen: Species | null, key: string | null): Lineage | null {
  if (chosen === null || key === null) return null
  return chosen.lineages?.find((entry) => entry.key === key) ?? null
}

/**
 * A stored species key rendered for a person, whether or not it still resolves.
 *
 * `classLabel`'s treatment in lib/resolve.ts: a retired key is shown as itself rather than
 * thrown away, so a character built before the conversion still says *what it was* on a sheet
 * whose numbers it has lost. A blank where a species used to be reads as a bug; the key reads
 * as a choice that needs making again, which is what it is.
 */
export function speciesLabel(key: string): string {
  return species(key)?.name ?? RETIRED_SPECIES[key] ?? key
}

/**
 * The species this application used to have and no longer does, with what to call them.
 *
 * ⚠️ **A retired key is tolerated on READ and refused on WRITE**, which is the asymmetry
 * `subclassOf`, `catalogueEntry` and `librarySheet` already keep. A character holding one opens,
 * keeps its name and its hit points, and is told plainly that its species needs choosing again;
 * nothing lets a *new* character be built with one, because `speciesKeyValidator` — the narrow
 * union every argument takes — does not contain it.
 *
 * **Half-Orc is the first and only entry, and it is not the same edit as *"Half-Orc becomes
 * Orc"*.** The SRD species is Orc, with three traits of its own, 120 feet of Darkvision and a
 * bonus-action Dash the Half-Orc never had — so a Half-Orc is not silently converted into one.
 * What it keeps is its name, its class, its level, its hit points and its spent
 * `relentless-endurance` flag, and what it loses is the species half of its sheet until
 * somebody chooses again.
 */
export const RETIRED_SPECIES: Record<string, string> = {
  'half-orc': 'Half-Orc',
}

/**
 * Every once-per-rest ability a species brings. Flat, because the sheet shows one list
 * and a species with two of them should not need the caller to know that.
 */
export function perRestAbilities(key: string): PerRestAbility[] {
  // Copied, not handed out. `SPECIES` is module state and a Convex isolate outlives
  // the request that warmed it, so a caller that sorted or pushed to this array
  // would corrupt the species definition for every later query until the next deploy.
  // Nothing does today; `defaultPcSheet` and `noSkills` both build fresh objects for
  // exactly this reason and have a test pinning it.
  //
  // A retired key has nothing to spend, which is the right answer rather than a fallback:
  // `characters.setPerRest` validates a *spend* against this list and deliberately does not
  // validate handing one back, so a character whose species went keeps whatever it had spent
  // clearable and gains nothing new to spend.
  //
  // ⚠️ **Keyed by species alone, so a lineage's per-rest abilities would be invisible here.**
  // None has one — see `Lineage.perRest` — and the day one does this signature grows a second
  // argument and `convex/characters.ts` has to pass the stored `lineageKey` with it.
  return [...(species(key)?.perRest ?? [])]
}
