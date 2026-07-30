// The D&D Lite catalogue: the spells, feats and NPC actions the editor offers as a
// starting point. Content only — no validators, no arithmetic, no Convex `ctx`.
// `lib/sheet.ts` owns the shape of a sheet entry and every rule about what is
// storable; this file owns nothing but the words and the dice, so that adding a
// spell is a change a person can make without reading a line of validation code.
// The import below is type-only for the same reason it is in `lib/grid.ts`: this
// module has no runtime dependency on anything, which keeps it importable from the
// browser and from a test without dragging the sheet module along behind it.
//
// The roadmap left "hard-code the spell list or make it editable" open. This is the
// answer, and it is both: the catalogue is hard-coded, but a character stores a
// **copy** of the entry rather than a reference to it. `catalogueKey` is a
// breadcrumb recording where a copy came from, not a foreign key — nothing joins on
// it, a player is free to edit the copy on their sheet, and a key retired from this
// file leaves the characters that already have it working exactly as before. That is
// why `catalogueEntry` returns `undefined` rather than throwing, and why callers must
// treat a miss as ordinary rather than as corruption.
//
// The text is paraphrased for a DM reading it at the table, deliberately rather than
// lifted from the SRD. It is a prompt to remind someone of a rule they know, not a
// substitute for the rulebook, and it is short because it renders inside a sheet
// panel next to a dozen others.
//
// Nothing here reaches outside the D&D Lite subset in docs/requirements.md. Feats
// that would normally mention difficult terrain or being knocked prone have those
// clauses left out, because movement-impairing conditions are excluded by design and
// a catalogue entry describing one would be the first place they crept back in.

import type { SheetEntry } from './sheet'

/** A catalogue entry is a SheetEntry template: everything except the per-character `id`. */
export type CatalogueEntry = Omit<SheetEntry, 'id' | 'catalogueKey'> & { key: string }

/**
 * The spells, cantrips through 3rd level.
 *
 * Each entry carries one roll, and where an entry has a choice the roll is the
 * damage or the healing rather than the attack. A to-hit is the same shape for
 * everything — a d20 plus an ability and proficiency, which the sheet already knows
 * how to build — whereas the dice a spell actually deals are the part only the
 * catalogue can tell you. The description names the save or the attack so the
 * distinction is visible at the table.
 *
 * Rolls use ability tokens (`2d8+WIS`) instead of baked-in numbers wherever the
 * modifier genuinely belongs to the caster, because Milestone 4 resolves those
 * tokens against the sheet holding the entry and a number frozen here would be wrong
 * for everyone but the character it was written for. Where a spell is cast by
 * classes keyed off different abilities — Cure Wounds is as much a paladin's as a
 * cleric's — the entry names the commonest one. That is not a claim about the rules;
 * it is the least-editing default, and the copy on the sheet is editable precisely
 * so a paladin can change it to CHA.
 */
export const SPELLS: readonly CatalogueEntry[] = [
  {
    key: 'fire-bolt',
    name: 'Fire Bolt',
    text: 'A mote of fire hurled at one target within 120 feet. Make a ranged spell attack; on a hit it burns, and it sets light to anything flammable nobody is holding or wearing.',
    roll: '1d10',
    level: 0,
  },
  {
    key: 'sacred-flame',
    name: 'Sacred Flame',
    text: 'Radiance falls on one creature within 60 feet, which takes the damage unless it succeeds on a Dexterity saving throw. Cover does not help it.',
    roll: '1d8',
    level: 0,
  },
  {
    key: 'eldritch-blast',
    name: 'Eldritch Blast',
    text: 'A beam of crackling force at one creature within 120 feet, on a ranged spell attack. A higher-level warlock fires more beams, each aimed and rolled separately.',
    roll: '1d10',
    level: 0,
  },
  {
    key: 'mage-hand',
    name: 'Mage Hand',
    text: 'A spectral hand appears within 30 feet and can fetch, carry or fiddle with something light — a key, a lever, a lantern. It cannot attack or wield a weapon.',
    roll: null,
    level: 0,
  },
  {
    key: 'guidance',
    name: 'Guidance',
    text: 'Touch a willing creature. Once within the next minute it adds the die to an ability check of its choice.',
    roll: '1d4',
    level: 0,
  },
  {
    key: 'cure-wounds',
    name: 'Cure Wounds',
    text: 'Touch a creature and restore hit points to it. Roll another 2d8 for each spell slot level above 1st.',
    roll: '2d8+WIS',
    level: 1,
  },
  {
    key: 'healing-word',
    name: 'Healing Word',
    text: 'A bonus action that restores hit points to a creature within 60 feet — the spell for getting someone back on their feet mid-fight. Another 2d4 per slot level above 1st.',
    roll: '2d4+WIS',
    level: 1,
  },
  {
    key: 'magic-missile',
    name: 'Magic Missile',
    text: 'Three darts of force that hit automatically: no attack roll and no saving throw. Each deals 1d4+1 and they can be split between targets however you like.',
    roll: '3d4+3',
    level: 1,
  },
  {
    key: 'shield',
    name: 'Shield',
    text: 'A reaction, taken when you are hit or targeted by Magic Missile. Your Armour Class rises by 5 until your next turn and the triggering attack may miss because of it.',
    roll: null,
    level: 1,
  },
  {
    key: 'burning-hands',
    name: 'Burning Hands',
    text: 'A sheet of flame in a 15-foot cone from your fingertips. Every creature caught in it takes the damage, or half on a successful Dexterity saving throw.',
    roll: '3d6',
    level: 1,
  },
  {
    key: 'guiding-bolt',
    name: 'Guiding Bolt',
    text: 'A lance of light on a ranged spell attack against one creature within 120 feet. The next attack made against that creature before your next turn has advantage.',
    roll: '4d6',
    level: 1,
  },
  {
    key: 'thunderwave',
    name: 'Thunderwave',
    text: 'A wave of force bursts out 15 feet around you with a thunderclap. Creatures caught in it take the damage and are shoved 10 feet away, or take half and hold their ground on a successful Constitution saving throw.',
    roll: '2d8',
    level: 1,
  },
  {
    key: 'bless',
    name: 'Bless',
    text: 'Up to three creatures add the die to every attack roll and every saving throw they make for the next minute, while you concentrate.',
    roll: '1d4',
    level: 1,
  },
  {
    key: 'detect-magic',
    name: 'Detect Magic',
    text: 'For ten minutes you sense magic within 30 feet, and a moment spent on an aura tells you which school it belongs to.',
    roll: null,
    level: 1,
  },
  {
    key: 'misty-step',
    name: 'Misty Step',
    text: 'A bonus action: you vanish in a puff of silver mist and reappear in an unoccupied space you can see up to 30 feet away.',
    roll: null,
    level: 2,
  },
  {
    key: 'scorching-ray',
    name: 'Scorching Ray',
    text: 'Three rays of fire, aimed at one target or split between several, each needing its own ranged spell attack. The damage listed is for a single ray.',
    roll: '2d6',
    level: 2,
  },
  {
    key: 'aid',
    name: 'Aid',
    text: 'Three creatures gain 5 hit points, to both their current and their maximum, for eight hours. Another 5 for each slot level above 2nd.',
    roll: null,
    level: 2,
  },
  {
    key: 'hold-person',
    name: 'Hold Person',
    text: 'One humanoid within 60 feet is held rigid — unable to move, act or speak — while you concentrate, and repeats its Wisdom saving throw at the end of each of its turns. Attacks made against it from within five feet are critical hits.',
    roll: null,
    level: 2,
  },
  {
    key: 'spiritual-weapon',
    name: 'Spiritual Weapon',
    text: 'A bonus action conjures a floating spectral weapon for a minute. On this turn and each turn after, a bonus action moves it 20 feet and attacks with it.',
    roll: '1d8+WIS',
    level: 2,
  },
  {
    key: 'fireball',
    name: 'Fireball',
    text: 'A roaring sphere of flame fills a 20-foot radius around a point within 150 feet, going round corners to do it. Each creature there takes the damage, halved on a successful Dexterity saving throw. Another 1d6 per slot level above 3rd.',
    roll: '8d6',
    level: 3,
  },
  {
    key: 'counterspell',
    name: 'Counterspell',
    text: 'A reaction that interrupts a spell you can see being cast within 60 feet. The caster makes a Constitution saving throw, and on a failure the spell does nothing and the slot is spent anyway.',
    roll: null,
    level: 3,
  },
  {
    key: 'revivify',
    name: 'Revivify',
    text: 'Touch a creature that died within the last minute and it returns to life with 1 hit point. It does not regrow anything it lost, and the diamond you spend is gone.',
    roll: null,
    level: 3,
  },
  {
    key: 'lightning-bolt',
    name: 'Lightning Bolt',
    text: 'A stroke of lightning 100 feet long and 5 feet wide leaps from your hand. Everything in the line takes the damage, halved on a successful Dexterity saving throw.',
    roll: '8d6',
    level: 3,
  },
  {
    key: 'dispel-magic',
    name: 'Dispel Magic',
    text: 'End one spell on a creature, an object or an area. Anything of 3rd level or lower ends outright; for a higher one, make a spellcasting ability check against a DC of 10 plus that spell\'s level.',
    roll: null,
    level: 3,
  },
]

/**
 * Feats and class traits, kept to the "limited / basic list" the requirements ask
 * for. `level` is null throughout — it means *spell* level, and a feat has none.
 *
 * Most of these are descriptive: what a feat usually changes is a number already on
 * the sheet, or permission to do something, neither of which is a roll. The handful
 * that do roll are the ones with dice of their own, and two of them scale with class
 * level, which is not an ability token and therefore cannot be written down here.
 * Those entries say so in their text and expect the player to edit their copy as they
 * level, which is the cost of the catalogue being a starting point rather than a
 * live rules engine.
 */
export const FEATS: readonly CatalogueEntry[] = [
  {
    key: 'second-wind',
    name: 'Second Wind',
    text: 'A bonus action, once per rest, to catch your breath and regain hit points. Add your fighter level to the die.',
    roll: '1d10',
    level: null,
  },
  {
    key: 'action-surge',
    name: 'Action Surge',
    text: 'Once per rest, take one extra action on your turn — a whole second action, not a bonus action.',
    roll: null,
    level: null,
  },
  {
    key: 'rage',
    name: 'Rage',
    text: 'A bonus action to rage for a minute: advantage on Strength checks and saving throws, extra damage on Strength weapon attacks, and resistance to bludgeoning, piercing and slashing damage. It ends early if a turn goes by in which you neither attack nor take damage.',
    roll: null,
    level: null,
  },
  {
    key: 'sneak-attack',
    name: 'Sneak Attack',
    text: 'Once a turn, extra damage on a hit with a finesse or ranged weapon, either when you have advantage or when an ally is beside the target and you do not have disadvantage. A rogue adds another die every two levels — edit your copy as you level.',
    roll: '1d6',
    level: null,
  },
  {
    key: 'divine-smite',
    name: 'Divine Smite',
    text: 'Spend a spell slot as you hit with a melee weapon to sear the target with radiant damage: 2d8 for a 1st-level slot, another 1d8 per level above that, and 1d8 more again against undead and fiends.',
    roll: '2d8',
    level: null,
  },
  {
    key: 'wild-shape',
    name: 'Wild Shape',
    text: 'A bonus action, twice per rest, to take the shape of a beast you have seen. You keep your mental scores and use the beast\'s physical ones, and snap back when its hit points run out.',
    roll: null,
    level: null,
  },
  {
    key: 'lay-on-hands',
    name: 'Lay on Hands',
    text: 'A pool of healing worth five hit points per paladin level, spent by touch in any amounts across the day. Five points from the pool can instead end one disease or one poison.',
    roll: null,
    level: null,
  },
  {
    key: 'bardic-inspiration',
    name: 'Bardic Inspiration',
    text: 'A bonus action hands an ally the die for the next ten minutes. They add it to one attack roll, ability check or saving throw, and may decide to spend it after seeing the d20 but before the result is called.',
    roll: '1d6',
    level: null,
  },
  {
    key: 'great-weapon-master',
    name: 'Great Weapon Master',
    text: 'Heavy melee weapons bite harder in your hands. Score a critical hit or drop a creature with one and you get a bonus-action attack with the same weapon.',
    roll: null,
    level: null,
  },
  {
    key: 'sharpshooter',
    name: 'Sharpshooter',
    text: 'Long range costs you no accuracy, cover counts for less against your ranged attacks, and you may trade accuracy for damage on a heavy shot.',
    roll: null,
    level: null,
  },
  {
    key: 'tough',
    name: 'Tough',
    text: 'Your hit point maximum rises by twice your level, and by 2 more every time you gain a level after taking this.',
    roll: null,
    level: null,
  },
  {
    key: 'alert',
    name: 'Alert',
    text: 'You add your proficiency bonus to initiative, and once the order is rolled you may swap your place in it with a willing ally\'s.',
    roll: null,
    level: null,
  },
  {
    key: 'lucky',
    name: 'Lucky',
    text: 'A few times per rest, reroll a d20 you have just rolled — your own attack, check or saving throw, or an attack made against you — and decide afterwards which of the two results stands.',
    roll: '1d20',
    level: null,
  },
  {
    key: 'savage-attacker',
    name: 'Savage Attacker',
    text: 'Once a turn, reroll the damage dice of a melee weapon attack and keep whichever total you prefer.',
    roll: null,
    level: null,
  },
  {
    key: 'mobile',
    name: 'Mobile',
    // The 5e feat also raises your speed by 10 feet, and that clause is dropped
    // rather than written down and ignored: requirements.md fixes speed at 35 for
    // every character, so `SPEED_FEET` is a constant with no field behind it and a
    // sheet that promised 45 would be promising something nothing in the app can
    // represent. What is left is the half D&D Lite can actually honour.
    text: 'A creature you attack in melee cannot make an opportunity attack against you for the rest of that turn.',
    roll: null,
    level: null,
  },
  {
    key: 'resilient',
    name: 'Resilient',
    text: 'Choose one ability: it rises by 1, and you become proficient in its saving throws.',
    roll: null,
    level: null,
  },
]

/**
 * Presets for the things a DM drops onto a goblin, an ogre or a wolf.
 *
 * These carry flat numbers — `1d6+2`, not `1d6+STR` — and the asymmetry with the
 * spell list above is deliberate rather than an oversight. An ability token is a
 * promise that something can resolve it, and the reduced NPC sheet has no ability
 * scores to resolve it against: a monster in D&D Lite is a name, an AC, hit points
 * and a list of things it does. So a monster's numbers have to be written into the
 * entry, and the DM edits them on the copy to make a stronger or weaker version of
 * the same creature. The numbers chosen are around CR 1 — a goblin's sword, an
 * ogre's club — because scaling up from a modest starting point is easier than
 * remembering to scale down.
 *
 * The three saving throws exist for the same reason. Without ability scores there is
 * nothing on a monster's sheet for "the ogre makes a Constitution save" to be built
 * from, so the escape hatch is an entry that simply *is* that roll, with the bonus
 * written in and meant to be edited. Only the three commonly called for are here;
 * anything rarer is a custom entry, which costs the DM one line of typing.
 */
export const NPC_ACTIONS: readonly CatalogueEntry[] = [
  {
    key: 'npc-claw',
    name: 'Claw',
    text: 'Melee attack, +4 to hit, reach 5 feet, slashing damage. The workhorse attack for a beast or anything that fights with its hands.',
    roll: '1d6+2',
    level: null,
  },
  {
    key: 'npc-bite',
    name: 'Bite',
    text: 'Melee attack, +4 to hit, reach 5 feet, piercing damage. Pack hunters get advantage when one of their own is already beside the target.',
    roll: '1d8+2',
    level: null,
  },
  {
    key: 'npc-slam',
    name: 'Slam',
    text: 'Melee attack, +5 to hit, reach 5 feet, bludgeoning damage — a construct, an ooze, or anything that swings its whole body at you.',
    roll: '2d6+3',
    level: null,
  },
  {
    key: 'npc-scimitar',
    name: 'Scimitar',
    text: 'Melee attack, +4 to hit, reach 5 feet, slashing damage. The standard swing of an armed goblin or a bandit.',
    roll: '1d6+2',
    level: null,
  },
  {
    key: 'npc-longbow',
    name: 'Longbow',
    text: 'Ranged attack, +4 to hit, piercing damage, out to 150 feet and 600 at long range with disadvantage.',
    roll: '1d8+2',
    level: null,
  },
  {
    key: 'npc-greatclub',
    name: 'Greatclub',
    text: 'Melee attack, +6 to hit, reach 5 feet, bludgeoning damage — an ogre with a tree trunk, and enough to fell a first-level character outright.',
    roll: '2d8+3',
    level: null,
  },
  {
    key: 'npc-javelin',
    name: 'Javelin',
    text: 'Thrown or melee attack, +4 to hit, piercing damage, 30 feet and 120 at long range. Gives a melee monster something to do on a turn it cannot close.',
    roll: '1d6+2',
    level: null,
  },
  {
    key: 'npc-fire-breath',
    name: 'Fire Breath',
    text: 'A cone of fire the creature can loose once every few rounds. Everything caught takes the damage, halved on a successful Dexterity saving throw. These dice suit a hell hound — add more for anything draconic.',
    roll: '6d6',
    level: null,
  },
  {
    key: 'npc-multiattack',
    name: 'Multiattack',
    text: 'The creature takes two of its attacks on its turn instead of one. Roll each of them separately from its other entries.',
    roll: null,
    level: null,
  },
  {
    key: 'npc-constitution-save',
    name: 'Constitution Save',
    text: 'A Constitution saving throw for a creature whose sheet has no ability scores to build one from. The bonus is a starting point: +2 suits an ordinary brute, +5 something genuinely tough.',
    roll: '1d20+2',
    level: null,
  },
  {
    key: 'npc-dexterity-save',
    name: 'Dexterity Save',
    text: 'A Dexterity saving throw for a creature whose sheet has no ability scores to build one from. +2 fits most things; drop it to zero for anything heavy and slow.',
    roll: '1d20+2',
    level: null,
  },
  {
    key: 'npc-wisdom-save',
    name: 'Wisdom Save',
    text: 'A Wisdom saving throw for a creature whose sheet has no ability scores to build one from. Beasts and constructs are usually worse at this than the bonus given here.',
    roll: '1d20+1',
    level: null,
  },
]

/** Every catalogue entry, for the integrity test and for a single lookup. */
export const CATALOGUE: readonly CatalogueEntry[] = [...SPELLS, ...FEATS, ...NPC_ACTIONS]

const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]))

/**
 * Look one up by key. Returns undefined for a key that has been retired — callers
 * must cope, because a character stores a COPY and may name a key that no longer
 * exists.
 */
export function catalogueEntry(key: string): CatalogueEntry | undefined {
  return BY_KEY.get(key)
}
