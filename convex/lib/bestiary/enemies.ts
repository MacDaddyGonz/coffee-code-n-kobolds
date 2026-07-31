// Humanoid enemies: thirty people who fight, from a bored town guard to a warlord.
//
// Content only — the shape is in ./types.ts, and the note at the top of that file explains
// why nothing under lib/bestiary/ may ever be imported by the browser.
//
// **Editing an entry here changes that creature in every game that already links to it.**
// The corpus is *linked*, not copied: a character document stores a `key` and the server
// resolves the stat block on read, so lowering a Knight's armour class lowers it for a
// campaign that met one three sessions ago. That is the exact opposite of how lib/rules.ts
// behaves — a catalogue entry is copied onto a sheet at the moment it is added, and editing
// the catalogue leaves every existing sheet alone — and the difference is invisible from
// inside either file. Rename nothing; a changed `key` orphans a creature mid-campaign.
//
// **How these were balanced, and why this file differs from the monster files.** A humanoid
// enemy is the party's mirror: it is the only kind of creature whose statline a player will
// hold up against their own sheet, so every entry is written as a person with training
// rather than an animal with numbers. A Veteran is a Fighter who chose differently. Two
// consequences fall out of that:
//
//   - Numbers are set as a *deviation from the entry's own challenge-rating row*, by role.
//     A tank sits above its row on armour class and below it on damage; a brute is the
//     reverse. The scaler carries the deviation across, so a scaled-up Knight is still
//     unusually hard to hit rather than becoming the average creature of its new rating.
//   - `saveDc` is non-null on sixteen of the thirty, which is far more than a monster file
//     would want. A spellcaster, controller or support enemy that forces no saving throw
//     has nothing to do on its turn but swing, and swinging is what the brutes are for.
//
// **The reduced sheet has no ability scores**, so every roll here carries flat numbers in
// the shared grammar — the same asymmetry `NPC_ACTIONS` in lib/rules.ts documents. There is
// also no spell list on a creature: a mage's Fireball is an ability with a roll on it, and
// the four casters are held to a short, combat-facing handful each, because an enemy has one
// fight to be interesting in and no use for Detect Magic.
//
// **Prose here never names a number.** Not a die, not a bonus to hit. A challenge-rating
// shift changes the numbers and cannot change the words, so "for a hefty swing" survives the
// stepper and a spelled-out figure goes stale the first time a DM presses it. Descriptions
// also step around the movement-impairing conditions D&D Lite excludes, which bites hardest
// exactly here: a shield bash, a wrestler's hold and a thrown net are the natural signature
// moves of a guard, a thug and a scout, and all three are written as what the victim *feels*
// — winded, hauled off balance, unable to shake a grip — rather than as a condition the
// rules do not have.

import type { BestiaryAbility, BestiaryFile } from './types'

/** An unencumbered person on foot. Every entry in this file, deliberately. */
const ON_FOOT = 30

const MELEE = 'melee'
const SHORTBOW_RANGE = '80/320 ft.'
const LONGBOW_RANGE = '150/600 ft.'
const HAND_CROSSBOW_RANGE = '30/120 ft.'
const THROWN_RANGE = '20/60 ft.'

/**
 * Shared by the Thug and the Zealot: the reason either is dangerous is that there are
 * six of them. Written once so the two cannot drift apart.
 */
const MOB_TACTICS: BestiaryAbility = {
  name: 'Mob Tactics',
  text: 'Fights best in a crowd. While one of its own is already beside the same target, it swings with the confidence of somebody who expects that target to be looking the other way, and lands far more often than it should.',
  roll: null,
}

/** Shared by the Town Guard and the Sellsword — the same drill, two pay grades. */
const SHIELD_WALL: BestiaryAbility = {
  name: 'Shield Wall',
  text: 'Braces behind the shield and gives ground to nobody. While it holds its place and throws no attack of its own, blows aimed at it or at whoever is standing beside it are noticeably harder to land.',
  roll: null,
}

export const ENEMIES: BestiaryFile = {
  category: 'enemy',
  entries: [
    // -----------------------------------------------------------------------
    // Tier I — CR 1/8 to 1/4. What a level 1 party meets in the first hour.
    // -----------------------------------------------------------------------
    {
      key: 'town-guard',
      name: 'Town Guard',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'tank',
      tags: ['humanoid', 'urban'],
      cr: 0.125,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['urban'],
      combat: {
        maxHp: 11,
        armourClass: 14,
        attackBonus: 2,
        initiativeBonus: 0,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 2 },
          { key: 'athletics', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Spear Jab',
            damage: '1d4',
            damageType: 'piercing',
            range: MELEE,
            text: 'A short, careful jab over the top of the shield. It is not trying to kill anyone — it is trying to keep you at arm\'s length until help arrives.',
          },
        ],
        abilities: [
          SHIELD_WALL,
          {
            name: 'Whistle for the Watch',
            text: 'Two sharp blasts on a tin whistle. More guards arrive within a couple of rounds, which makes killing this one the worst available answer.',
            roll: null,
          },
        ],
      },
      loot: 'A tin whistle, a ring of gate keys and eight copper pieces in a boot.',
      notes: 'Holds a doorway or a gate mouth and shouts for help rather than chasing. Will accept a bribe, a story or an obvious excuse if it means not fighting four armed strangers.',
      blurb: 'Gate-keeper in a padded coat who would much rather blow a whistle than fight.',
    },
    {
      key: 'bandit',
      name: 'Bandit',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'skirmisher',
      tags: ['humanoid', 'forest', 'urban'],
      cr: 0.125,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['forest', 'urban'],
      combat: {
        maxHp: 7,
        armourClass: 12,
        attackBonus: 3,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'stealth', bonus: 2 },
          { key: 'deception', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Scimitar',
            damage: '1d6',
            damageType: 'slashing',
            range: MELEE,
            text: 'A wide, showy slash meant to frighten a merchant into handing over the strongbox. It still opens a forearm if you let it land.',
          },
        ],
        abilities: [
          {
            name: 'Cut and Run',
            text: 'Steps back out of reach the moment its blade lands, so it is never quite where you last swung. Cornering one takes two people and a wall.',
            roll: null,
          },
        ],
      },
      loot: 'A stolen purse with eleven silver in it, a length of rope and half a wheel of somebody else\'s cheese.',
      notes: 'Works a roadside in groups of four to eight and demands the goods before drawing steel. Breaks and scatters as soon as two of its own go down.',
      blurb: 'Roadside robber in mismatched leather — brave in a group, gone on its own.',
    },
    {
      key: 'cultist',
      name: 'Cultist',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'support',
      tags: ['humanoid', 'ruins', 'urban'],
      cr: 0.125,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['ruins', 'urban'],
      combat: {
        maxHp: 7,
        armourClass: 12,
        attackBonus: 2,
        initiativeBonus: 0,
        passivePerception: 10,
        speed: ON_FOOT,
        saveDc: 10,
        skills: [
          { key: 'deception', bonus: 2 },
          { key: 'intimidation', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Ritual Dagger',
            damage: '1d4',
            damageType: 'slashing',
            range: MELEE,
            text: 'A thin ceremonial blade used badly. The cut is shallow; the look on the cultist\'s face while it makes the cut is the memorable part.',
          },
        ],
        abilities: [
          {
            name: 'Droning Chant',
            text: 'Rather than fight, it keeps up a low chant. Every other cultist that can hear it presses the attack harder, and anyone standing too close and trying to concentrate must hold their nerve or lose the thread.',
            roll: null,
          },
        ],
      },
      loot: 'A robe with something unpleasant stitched inside the hem, a stub of black candle and a folded page of names.',
      notes: 'Never the threat on its own — it stands at the back keeping the chant going while the fanatics do the killing. Silence it first and the rest of the room gets easier.',
      blurb: 'Robed believer who chants from the back rank and makes everything else worse.',
    },
    {
      key: 'thug',
      name: 'Thug',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'brute',
      tags: ['humanoid', 'urban'],
      cr: 0.25,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['urban'],
      combat: {
        maxHp: 16,
        armourClass: 10,
        attackBonus: 3,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'intimidation', bonus: 3 },
          { key: 'athletics', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Mace',
            damage: '1d6+2',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'An overhand swing with a lump of iron on a stick. No technique at all, and it does not need any.',
          },
        ],
        abilities: [
          MOB_TACTICS,
          {
            name: 'Take Hold',
            text: 'Gets two fists into a coat and hauls its victim off balance, close enough to smell the beer. Shaking the grip off costs a real effort and everything else that turn.',
            roll: null,
          },
        ],
      },
      loot: 'A cosh, a debt ledger with four names crossed out and a fistful of coppers.',
      notes: 'Collects debts for somebody who never appears in person. Comes in twos and threes, works the target into a corner and stops the moment it is paid.',
      blurb: 'Hired muscle with a mace and no armour worth mentioning.',
    },
    {
      key: 'bandit-archer',
      name: 'Bandit Archer',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'archer',
      tags: ['humanoid', 'forest'],
      cr: 0.25,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['forest', 'mountain'],
      combat: {
        maxHp: 9,
        armourClass: 12,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 3 },
          { key: 'stealth', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Shortbow',
            damage: '1d6+1',
            damageType: 'piercing',
            range: SHORTBOW_RANGE,
            text: 'An arrow out of the treeline before anyone has worked out which tree. Aimed at whoever is carrying the money.',
          },
        ],
        abilities: [
          {
            name: 'Shoot and Shift',
            text: 'Looses, then slides two trunks along the treeline before anyone looks up. Working out where it is shooting from takes most of a round.',
            roll: null,
          },
        ],
      },
      loot: 'Nine arrows, a bowstring wound in oiled cloth and a whistle carved from a deer bone.',
      notes: 'Never in the open. Sits in cover twenty or thirty paces off the road and shoots while the others do the shouting. Folds instantly if anyone reaches it.',
      blurb: 'Arrow from the treeline — deadly at range, hopeless in reach.',
    },
    {
      key: 'acolyte',
      name: 'Acolyte',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'spellcaster',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 0.25,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 9,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: 11,
        skills: [
          { key: 'insight', bonus: 2 },
          { key: 'persuasion', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Sacred Flame',
            damage: '1d6+1',
            damageType: 'radiant',
            range: '60 ft.',
            text: 'A column of pale light drops on one target with no roll to hit — cover is no help. It must throw itself aside or take the burn.',
          },
        ],
        abilities: [
          {
            name: 'Healing Word',
            text: 'A single word across the room puts a wounded ally back on their feet. Cheap, quick, and the reason a fight with three acolytes lasts twice as long as it should.',
            roll: '1d6',
          },
        ],
      },
      loot: 'A holy symbol on a leather thong, a vial of consecrated water and the temple\'s petty-cash tin.',
      notes: 'A junior temple servant, not a warrior — it heals whoever is doing the fighting and runs for a senior priest at the first real injury. Two of them are far worse than four.',
      blurb: 'Junior temple servant with one healing word and a light that ignores cover.',
    },

    // -----------------------------------------------------------------------
    // Tier II — CR 1/2 to 1. The first fights a party can lose.
    // -----------------------------------------------------------------------
    {
      key: 'scout',
      name: 'Scout',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'archer',
      tags: ['humanoid', 'forest', 'mountain'],
      cr: 0.5,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['forest', 'mountain'],
      combat: {
        maxHp: 13,
        armourClass: 12,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 15,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 5 },
          { key: 'stealth', bonus: 4 },
          { key: 'animalHandling', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Longbow',
            damage: '1d8+2',
            damageType: 'piercing',
            range: LONGBOW_RANGE,
            text: 'A long, flat shot from further away than anyone expected, put through the gap in whatever the target is hiding behind.',
          },
        ],
        abilities: [
          {
            name: 'Keen Eyes and Ears',
            text: 'Notices the party long before the party notices it, which usually means the fight starts with an arrow already in the air.',
            roll: null,
          },
          {
            name: 'Weighted Net',
            text: 'A throw of knotted, weighted cord that tangles arms to a torso. Tearing free is a full effort and the target can do nothing else while it works at the knots.',
            roll: null,
          },
        ],
      },
      loot: 'A hand-drawn map of the valley, a coil of snare wire and three days of dried meat.',
      notes: 'Tracks the party for a day before it decides anything. Fights from distance, retreats uphill and into cover, and would rather report back than die proving a point.',
      blurb: 'Woodland tracker who sees you first and shoots from further off than you can answer.',
    },
    {
      key: 'watch-sergeant',
      name: 'Watch Sergeant',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0.5,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban'],
      combat: {
        maxHp: 15,
        armourClass: 13,
        attackBonus: 3,
        initiativeBonus: 1,
        passivePerception: 13,
        speed: ON_FOOT,
        saveDc: 11,
        skills: [
          { key: 'intimidation', bonus: 3 },
          { key: 'perception', bonus: 2 },
          { key: 'insight', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Cudgel',
            damage: '1d6+1',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A businesslike crack across a shoulder or a shin, delivered by somebody who has done it a thousand times and is not angry about it.',
          },
        ],
        abilities: [
          {
            name: 'Form Up',
            text: 'One bellowed order and every guard who can hear it closes ranks. While the sergeant lives, the guards around it are harder to hit and much harder to frighten off.',
            roll: null,
          },
          {
            name: 'You Are Under Arrest',
            text: 'A parade-ground roar with the full weight of the law behind it. Anyone it is aimed at must steady themselves or spend the moment arguing instead of swinging.',
            roll: null,
          },
        ],
      },
      loot: 'A brass rank badge, a warrant with the party\'s descriptions on it and the keys to the cells.',
      notes: 'Never fought alone — it arrives with four guards and its value is entirely in making them dangerous. Drop the sergeant and the patrol goes to pieces.',
      blurb: 'Barking patrol leader who turns four ordinary guards into a real problem.',
    },
    {
      key: 'zealot',
      name: 'Zealot',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['humanoid', 'ruins'],
      cr: 0.5,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['ruins', 'urban'],
      combat: {
        maxHp: 22,
        armourClass: 10,
        attackBonus: 3,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'intimidation', bonus: 3 },
          { key: 'athletics', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Heavy Flail',
            damage: '2d4+3',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A chained head swung in a full circle with the zealot\'s whole weight behind it. It does not defend itself while it does this and does not appear to care.',
          },
        ],
        abilities: [
          MOB_TACTICS,
          {
            name: 'No Fear of Death',
            text: 'Cannot be frightened, will not surrender, and the first time a blow should put it down it stays upright long enough for one more swing.',
            roll: null,
          },
        ],
      },
      loot: 'A flail with a scripture line filed into the haft, and nothing else worth carrying.',
      notes: 'Walks straight at the nearest party member and keeps swinging until it dies. Useful for a DM who wants pressure on the back rank without any tactics to run.',
      blurb: 'Unarmoured believer with a flail who cannot be frightened and will not stop.',
    },
    {
      key: 'goblin-boss',
      name: 'Goblin Boss',
      creatureType: 'Humanoid (goblinoid)',
      size: 'small',
      alignment: 'Neutral Evil',
      role: 'boss',
      tags: ['humanoid', 'cave', 'forest', 'boss'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['cave', 'forest'],
      combat: {
        maxHp: 57,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'stealth', bonus: 6 },
          { key: 'intimidation', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Notched Scimitar',
            damage: '1d6+3',
            damageType: 'slashing',
            range: MELEE,
            text: 'A stolen blade kept sharp on one edge only, swung with far more skill than the goblins behind it can manage.',
          },
          {
            name: 'Off-Hand Dagger',
            damage: '1d4+3',
            damageType: 'piercing',
            range: MELEE,
            text: 'The second, quieter blade, worked in low while the scimitar holds attention high.',
          },
        ],
        abilities: [
          {
            name: 'Redirect Attack',
            text: 'Shoves whichever of its underlings is nearest into the blow meant for it. The goblin takes the hit; the boss does not even break stride.',
            roll: null,
          },
          {
            name: 'Loudest in the Warren',
            text: 'While it is alive and shouting, every goblin that can hear it fights well above itself. Kill it and the warren remembers it has somewhere else to be.',
            roll: null,
          },
        ],
      },
      loot: 'A chieftain\'s chain of mismatched rings, forty silver in a sack and a stolen officer\'s cloak worn as a cape.',
      notes: 'Never met alone — bring six goblins with it, because Redirect Attack is only funny when there is somebody to redirect onto. Stays at the back until the numbers turn, then bolts.',
      blurb: 'Warren chief who fights well and lets its underlings absorb the hits.',
    },
    {
      key: 'hedge-witch',
      name: 'Hedge Witch',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'controller',
      tags: ['humanoid', 'forest', 'swamp'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['forest', 'swamp'],
      combat: {
        maxHp: 22,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: 13,
        skills: [
          { key: 'arcana', bonus: 4 },
          { key: 'insight', bonus: 3 },
          { key: 'perception', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Thorn Lash',
            damage: '1d6+2',
            damageType: 'piercing',
            range: '30 ft.',
            text: 'A whip of bramble uncoils out of nowhere and opens a line across the face. It withers to ash a moment after it lands.',
          },
        ],
        abilities: [
          {
            name: 'Hex',
            text: 'Points at one target and names something it is bad at. Until the witch loses interest, that target fumbles anything asking for a steady hand — unless it can shake the words off outright.',
            roll: null,
          },
          {
            // The sentence is about the coughing and the roll is not: it is what the dust
            // does to a lung. Flagged on the damage reading, as with every ability here
            // that hinders and hurts at the same time.
            name: 'Choking Pollen',
            text: 'A puff of yellow dust fills the air around two or three people. Anyone breathing it spends the round coughing too hard to give an order or finish a spell.',
            roll: '1d6',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'Nine jars of things in brine, a bundle of dried herbs and a hand-copied book of charms worth a little to the right buyer.',
      notes: 'Fights from behind a hedge, a stream or anything else awkward to cross. Hexes the party member with the biggest sword first, then leans on the pollen to break up whoever is casting.',
      blurb: 'Backwoods charm-worker who hexes the strongest fighter and chokes the caster.',
    },
    {
      key: 'spy',
      name: 'Spy',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'skirmisher',
      tags: ['humanoid', 'urban'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban'],
      combat: {
        maxHp: 21,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 4,
        passivePerception: 15,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'deception', bonus: 5 },
          { key: 'stealth', bonus: 5 },
          { key: 'insight', bonus: 4 },
          { key: 'perception', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Stiletto',
            damage: '2d4+3',
            damageType: 'piercing',
            range: MELEE,
            text: 'A narrow blade slipped in under the ribs from behind, in a room where nobody had noticed a fourth person.',
          },
        ],
        abilities: [
          {
            name: 'Practised Ambush',
            text: 'A habit rather than a trick: when the target has not seen it coming, or is busy with somebody else, the blade goes somewhere that matters. Extra damage every single time the opening exists.',
            roll: '2d6',
            scalesWithCr: true,
          },
          {
            name: 'Another Name, Another Face',
            text: 'Has been in the room for an hour and had three plausible reasons to be. Fights only when the cover is gone, and would still rather talk its way out.',
            roll: null,
          },
        ],
      },
      loot: 'Two sets of papers in different names, a coded notebook and a key that fits a house nobody in the party has visited yet.',
      notes: 'Meant to be discovered rather than defeated — it runs at the first chance and takes what it has learned with it. If cornered it goes for whoever is weakest and least watched.',
      blurb: 'Well-dressed informant with a hidden blade and four ways out of the building.',
    },
    {
      key: 'sellsword',
      name: 'Sellsword',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'tank',
      tags: ['humanoid', 'urban'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 34,
        armourClass: 16,
        attackBonus: 4,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 4 },
          { key: 'intimidation', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Longsword',
            damage: '1d8+2',
            damageType: 'slashing',
            range: MELEE,
            text: 'A short, economical cut from behind a raised shield. Nothing flashy — it is being paid by the day, not by the corpse.',
          },
        ],
        abilities: [
          SHIELD_WALL,
          {
            name: 'Paid Up Front',
            text: 'Fights hard while the contract holds and negotiates the moment it obviously does not. An offer made after its employer falls is an offer it will genuinely consider.',
            roll: null,
          },
        ],
      },
      loot: 'A battered shield with three employers\' arms painted over one another, and a purse of twenty-five silver.',
      notes: 'Hired to guard a door, a wagon or a person, and it will do exactly that and no more. Excellent for a fight the DM wants the party to be able to end with money.',
      blurb: 'Professional guard in mail and shield — hard to shift, easy to buy.',
    },

    // -----------------------------------------------------------------------
    // Tier III — CR 2 to 3. Officers, veterans and the first real casters.
    // -----------------------------------------------------------------------
    {
      key: 'bandit-captain',
      name: 'Bandit Captain',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'boss',
      tags: ['humanoid', 'forest', 'urban', 'boss'],
      cr: 2,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 3,
      environmentTags: ['forest', 'urban'],
      combat: {
        maxHp: 86,
        armourClass: 16,
        attackBonus: 6,
        initiativeBonus: 4,
        passivePerception: 13,
        speed: ON_FOOT,
        saveDc: 13,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'deception', bonus: 4 },
          { key: 'intimidation', bonus: 4 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Officer\'s Scimitar',
            damage: '2d6+3',
            damageType: 'slashing',
            range: MELEE,
            text: 'A good blade, kept better than anything else in the camp, and swung by somebody who trained with one before they took to the roads.',
          },
          {
            name: 'Parrying Dagger',
            damage: '1d4+3',
            damageType: 'piercing',
            range: MELEE,
            text: 'The off-hand blade, used to turn a sword aside and then punched in through the gap it leaves.',
          },
        ],
        abilities: [
          {
            name: 'Parry',
            text: 'Once each round it turns one incoming blow aside with the flat of the dagger. The hit simply does not arrive, which is maddening for a party counting on the arithmetic.',
            roll: null,
          },
          {
            name: 'On My Word',
            text: 'Calls a target and the whole band goes for it. Whoever is named must hold their nerve or spend the round reacting instead of acting.',
            roll: null,
          },
        ],
      },
      loot: 'A captain\'s sash, a locked strongbox with two hundred gold in it and a letter from somebody respectable.',
      notes: 'Runs a camp of eight to twelve bandits and fights like an officer — names a target, keeps a blade between itself and the party, and cuts a deal the instant the fight stops going its way.',
      blurb: 'Deserter officer turned road captain: parries, gives orders and bargains hard.',
    },
    {
      key: 'berserker',
      name: 'Berserker',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'brute',
      tags: ['humanoid', 'mountain', 'forest'],
      cr: 2,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 3,
      environmentTags: ['mountain', 'forest', 'arctic'],
      combat: {
        maxHp: 47,
        armourClass: 12,
        attackBonus: 5,
        initiativeBonus: 1,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'intimidation', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Greataxe',
            damage: '2d8+4',
            damageType: 'slashing',
            range: MELEE,
            text: 'Both hands, full shoulder turn, straight down through whatever is in the way. Shields do not help as much as their owners hope.',
          },
        ],
        abilities: [
          {
            name: 'Reckless',
            text: 'Throws every attack with no thought for what comes back. It hits far more often than it should, and so does everyone swinging at it.',
            roll: null,
          },
          {
            name: 'Blood Up',
            text: 'Once it has been wounded it stops defending itself entirely. Hurting a berserker is not obviously an improvement on leaving it alone.',
            roll: null,
          },
        ],
      },
      loot: 'A notched greataxe, a bearskin and a bag of teeth that are not all animal.',
      notes: 'Charges the first thing it sees and never disengages. The fight is a race: the party has to drop it before the axe finds a squishy target twice.',
      blurb: 'Half-armoured axeman who trades defence for damage and never backs off.',
    },
    {
      key: 'cult-fanatic',
      name: 'Cult Fanatic',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'boss',
      tags: ['humanoid', 'ruins', 'urban', 'boss'],
      cr: 2,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 3,
      environmentTags: ['ruins', 'urban'],
      combat: {
        maxHp: 78,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 13,
        speed: ON_FOOT,
        saveDc: 13,
        skills: [
          { key: 'deception', bonus: 5 },
          { key: 'persuasion', bonus: 5 },
          { key: 'intimidation', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Sacrificial Dagger',
            damage: '1d4+2',
            damageType: 'slashing',
            range: MELEE,
            text: 'A curved blade drawn across whatever it can reach, held like a tool rather than a weapon.',
          },
          {
            name: 'Inflict Wounds',
            damage: '3d8',
            damageType: 'necrotic',
            range: MELEE,
            text: 'It lays a hand flat on someone and the flesh under the palm goes grey and cold. Easily the worst thing in the room, and it needs to touch you to do it.',
          },
        ],
        abilities: [
          {
            name: 'Command',
            text: 'One word, spoken with total conviction. The target must resist it or waste the turn doing exactly as it was told — drop the sword, walk away, kneel.',
            roll: null,
          },
          {
            name: 'Lead the Faithful',
            text: 'Every cultist in earshot fights harder while the fanatic is on its feet, and none of them will run while it lives.',
            roll: null,
          },
        ],
      },
      loot: 'A gilded holy symbol of something with too many eyes, a ritual knife and a ledger of donors.',
      notes: 'The one in the middle of the chanting circle. Put it in a room with four cultists: it commands whoever is armoured, then walks through the gap to lay hands on a caster.',
      blurb: 'Charismatic cult leader whose bare hand is worse than anyone\'s sword.',
    },
    {
      key: 'priest',
      name: 'Priest',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 2,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 31,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: 13,
        skills: [
          { key: 'insight', bonus: 5 },
          { key: 'persuasion', bonus: 4 },
          { key: 'perception', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Mace',
            damage: '1d6+2',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A ceremonial mace used as a mace. Competent, unhurried, and not what the priest is here to do.',
          },
          {
            name: 'Sacred Flame',
            damage: '1d6',
            damageType: 'radiant',
            range: '60 ft.',
            text: 'Light falls straight down on one target with no roll to hit. Hiding behind a pillar buys nothing at all.',
          },
        ],
        abilities: [
          {
            name: 'Blessing',
            text: 'Three allies fight with a steadiness that is plainly not theirs — every swing and every effort to hold their nerve comes a little easier while the priest keeps it up.',
            roll: null,
          },
          {
            name: 'Healing Word',
            text: 'A word from across the room and a wounded ally is standing again. The priest can do this while also swinging the mace, which is what makes it the target.',
            roll: '1d8+2',
          },
        ],
      },
      loot: 'A silvered holy symbol, a censer, three vials of holy water and the keys to the crypt.',
      notes: 'Kill it first and the encounter halves; ignore it and the fight never ends. It stays behind its guards, blesses them and undoes the party\'s best round with one word.',
      blurb: 'Temple senior who blesses the front rank and heals whatever the party drops.',
    },
    {
      key: 'archer',
      name: 'Archer',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'archer',
      tags: ['humanoid', 'urban', 'forest'],
      cr: 3,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 4,
      environmentTags: ['urban', 'forest', 'ruins'],
      combat: {
        maxHp: 37,
        armourClass: 14,
        attackBonus: 8,
        initiativeBonus: 4,
        passivePerception: 16,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 6 },
          { key: 'stealth', bonus: 6 },
          { key: 'acrobatics', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Longbow',
            damage: '2d8+5',
            damageType: 'piercing',
            range: LONGBOW_RANGE,
            text: 'Two arrows in the time anyone else manages one, both into the same handspan of chest. This is somebody who shoots for a living.',
          },
        ],
        abilities: [
          {
            name: 'Third Arrow',
            text: 'If it holds its ground rather than repositioning, one more arrow goes into the target it has already found. Standing still is a choice it makes often.',
            roll: '1d8+2',
            scalesWithCr: true,
          },
          {
            name: 'Eyes on the Field',
            text: 'Picks the target that matters — the caster, the healer, the one carrying the thing. Never the closest, and never the armoured one.',
            roll: null,
          },
        ],
      },
      loot: 'A tall yew bow, two dozen fletched arrows, a bracer worn shiny and forty gold in an oilcloth.',
      notes: 'Wants a rooftop, a gallery or a ridge and thirty paces of clear air. Put it above the fight and give the party a reason not to simply walk to it.',
      blurb: 'Professional marksman who puts two arrows in your caster from a rooftop.',
    },
    {
      key: 'knight',
      name: 'Knight',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'tank',
      tags: ['humanoid', 'urban'],
      cr: 3,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 4,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 69,
        armourClass: 17,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 13,
        speed: ON_FOOT,
        saveDc: 13,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'intimidation', bonus: 4 },
          { key: 'insight', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Longsword',
            damage: '1d10+4',
            damageType: 'slashing',
            range: MELEE,
            text: 'A two-handed cut from a fighter in full plate who has all day. It comes in on the same line every time and is still difficult to answer.',
          },
        ],
        abilities: [
          {
            name: 'Shield Slam',
            text: 'Drives the rim of the shield into a chest and knocks the wind clean out of whoever is behind it. Anyone who fails to brace spends the next moment trying to breathe rather than fight.',
            roll: '1d6+2',
            scalesWithCr: true,
          },
          {
            name: 'Unshakeable',
            text: 'Cannot be frightened while it can see one of its own household still standing. Duty is doing most of the work here, and armour is doing the rest.',
            roll: null,
          },
        ],
      },
      loot: 'Full plate with a house device on the breast, a warhorse\'s tack and a signet ring somebody will want back.',
      notes: 'Steps into the doorway and dares the party through it. Slow, hard to hurt and hard to get past — the right enemy for a fight the DM wants to last, and the wrong one for a chase.',
      blurb: 'Armoured household knight who holds a doorway and will not be moved.',
    },
    {
      key: 'veteran',
      name: 'Veteran',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'brute',
      tags: ['humanoid', 'urban', 'mountain'],
      cr: 3,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 4,
      environmentTags: ['urban', 'mountain', 'ruins'],
      combat: {
        maxHp: 64,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'perception', bonus: 4 },
          { key: 'intimidation', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Longsword',
            damage: '2d8+4',
            damageType: 'slashing',
            range: MELEE,
            text: 'Twenty years of the same cut, thrown at the join in the armour rather than the middle of the shield.',
          },
          {
            name: 'Shortsword',
            damage: '1d6+2',
            damageType: 'piercing',
            range: MELEE,
            text: 'The second blade, brought up underneath while the long one is still coming down.',
          },
        ],
        abilities: [
          {
            name: 'Practised Footwork',
            text: 'Has been in enough fights to see one coming. Once per fight a hit that should have landed squarely turns into a graze along the ribs instead.',
            roll: null,
          },
          {
            name: 'Knows Where to Cut',
            text: 'Goes for the wounded rather than the fresh, and for the one already fighting somebody else. Never the biggest threat — always the cheapest kill.',
            roll: null,
          },
        ],
      },
      loot: 'Worn chain mail, two good swords, a soldier\'s discharge paper and sixty gold saved carefully.',
      notes: 'A Fighter who chose differently — same training, no party. Two swords, hard hands and no armour to speak of. Fields well in pairs, and a pair will absolutely gang up on the weakest character.',
      blurb: 'Old soldier with two blades who hits hard and picks off the wounded.',
    },
    {
      key: 'illusionist',
      name: 'Illusionist',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'controller',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 3,
      tier: 3,
      recommendedPartyLevelMin: 2,
      recommendedPartyLevelMax: 4,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 45,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 4,
        passivePerception: 13,
        speed: ON_FOOT,
        saveDc: 14,
        skills: [
          { key: 'arcana', bonus: 6 },
          { key: 'deception', bonus: 6 },
          { key: 'sleightOfHand', bonus: 4 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Phantasmal Blade',
            damage: '2d6+3',
            damageType: 'psychic',
            range: '60 ft.',
            text: 'A sword that is not there opens a wound that is. The victim bleeds because it believes it should.',
          },
        ],
        abilities: [
          {
            name: 'Mirror Selves',
            text: 'Three more of it step out of the air and copy every movement exactly. Most attacks aimed at the illusionist pop one of the copies instead, and it will not say which is which.',
            roll: null,
          },
          {
            name: 'Blinding Colours',
            text: 'A wash of impossible colour across two or three faces. Anyone who cannot look away is left seeing nothing but shapes for a moment, and swinging accordingly.',
            roll: '2d6',
            scalesWithCr: true,
          },
          {
            name: 'Not Where You Left It',
            text: 'Vanishes from sight entirely and reappears somewhere unhelpful. Reliably somewhere with a wall between it and the party\'s archer.',
            roll: null,
          },
        ],
      },
      loot: 'A silver hand mirror, a bag of coloured sand and a spellbook with half the pages written in the wrong direction.',
      notes: 'A fight against an illusionist is a fight against the party\'s own certainty. Run the copies honestly, make them roll for the real one, and let the misses feel expensive.',
      blurb: 'Trickster mage who fights behind three copies of itself and blinding light.',
    },

    // -----------------------------------------------------------------------
    // Tier IV — CR 4 to 5. Warchiefs, inquisitors and the best of the pit.
    // -----------------------------------------------------------------------
    {
      key: 'orc-warchief',
      name: 'Orc Warchief',
      creatureType: 'Humanoid (orc)',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'boss',
      tags: ['humanoid', 'cave', 'mountain', 'boss'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: 3,
      recommendedPartyLevelMax: 5,
      environmentTags: ['cave', 'mountain'],
      combat: {
        maxHp: 154,
        armourClass: 17,
        attackBonus: 7,
        initiativeBonus: 2,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: 14,
        skills: [
          { key: 'athletics', bonus: 8 },
          { key: 'intimidation', bonus: 7 },
          { key: 'perception', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Chieftain\'s Greataxe',
            damage: '2d12+5',
            damageType: 'slashing',
            range: MELEE,
            text: 'An axe with a haft as thick as a forearm, swung in a flat arc that takes in everything at chest height. A single connection will end a lightly armoured character\'s afternoon.',
          },
          {
            name: 'Spear',
            damage: '1d6+5',
            damageType: 'piercing',
            range: THROWN_RANGE,
            text: 'Thrown hard and flat at whoever is trying to stay out of reach of the axe. It resents being out-ranged.',
          },
        ],
        abilities: [
          {
            name: 'Battle Cry',
            text: 'A roar the whole cave hears. Every orc in earshot fights with real ferocity for the rest of the round, and anyone the roar is aimed at must steady themselves or lose their nerve entirely.',
            roll: null,
          },
          {
            name: 'Warchief\'s Fury',
            text: 'Once it is badly wounded it stops pacing itself and puts everything into one more swing. This is the round that kills somebody, and it is telegraphed one round early.',
            roll: '1d12+5',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'A tusked helm, a chieftain\'s axe worth real money, a chest of three hundred gold and a war-banner of stitched hide.',
      notes: 'The tribe is the encounter and this is the reason it holds together. Bring four orcs, keep the warchief at the front, and telegraph Warchief\'s Fury so the party can choose whether to spend everything stopping it.',
      blurb: 'Tusked war-leader with an enormous axe and a roar that lifts the whole tribe.',
    },
    {
      key: 'druid',
      name: 'Druid',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'spellcaster',
      tags: ['humanoid', 'forest'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: 3,
      recommendedPartyLevelMax: 5,
      environmentTags: ['forest', 'swamp', 'mountain'],
      combat: {
        maxHp: 49,
        armourClass: 14,
        attackBonus: 6,
        initiativeBonus: 2,
        passivePerception: 17,
        speed: ON_FOOT,
        saveDc: 15,
        skills: [
          { key: 'animalHandling', bonus: 7 },
          { key: 'perception', bonus: 7 },
          { key: 'insight', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Thorn Whip',
            damage: '1d6+3',
            damageType: 'piercing',
            range: '30 ft.',
            text: 'A vine of black thorn lashes out, opens a hand or a cheek, and hauls the target a stride closer whether it wants to come or not.',
          },
          {
            name: 'Moonbeam',
            damage: '2d10',
            damageType: 'radiant',
            range: '120 ft.',
            text: 'A pillar of cold silver light stands in one place and burns everything inside it. The druid can walk the pillar across the battlefield without casting again.',
          },
        ],
        abilities: [
          {
            name: 'Swarm of Insects',
            text: 'A boiling cloud of biting flies fills a stretch of ground. Anything inside it fights half-blind and swatting, and stepping out is the only sensible answer.',
            roll: '2d8',
            scalesWithCr: true,
          },
          {
            name: 'Barkskin',
            text: 'Its skin roughens to grey bark. Blows that would have opened a robe come away with splinters instead, and this holds for the whole fight.',
            roll: null,
          },
          {
            name: 'Call the Pack',
            text: 'Two wolves arrive out of the treeline within a round and fight until the druid falls. They were never far away.',
            roll: null,
          },
        ],
      },
      loot: 'A sickle of cold iron, a mistletoe sprig bound in silver wire and a pouch of seeds from nowhere nearby.',
      notes: 'Fights on ground it has chosen and will not be drawn off it. Opens with the swarm to break up the front rank, walks the moonbeam onto whoever stays put, and keeps the wolves between itself and the party.',
      blurb: 'Circle druid who fights with light, biting swarms and two wolves on call.',
    },
    {
      key: 'inquisitor',
      name: 'Inquisitor',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'controller',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: 3,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 60,
        armourClass: 15,
        attackBonus: 6,
        initiativeBonus: 3,
        passivePerception: 18,
        speed: ON_FOOT,
        saveDc: 16,
        skills: [
          { key: 'insight', bonus: 8 },
          { key: 'intimidation', bonus: 7 },
          { key: 'investigation', bonus: 6 },
          { key: 'perception', bonus: 6 },
        ],
        attacks: [
          {
            name: 'Warhammer',
            damage: '2d6+4',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A flat-headed hammer brought down without any apparent anger, in the manner of somebody filling in a form.',
          },
        ],
        abilities: [
          {
            name: 'Compel the Truth',
            text: 'Asks one question in a voice that expects an answer. A target who cannot hold out blurts the truth and spends the rest of the round appalled at itself, acting last and badly.',
            roll: null,
          },
          {
            // Two effects, one roll. The accuracy the mark hands out is words and does not
            // scale; the roll is the brand burning, which is damage on a person, so it
            // does. Read the other way this would be the only inquisitor ability frozen at
            // its library figure.
            name: 'Mark of Guilt',
            text: 'Brands a sigil in the air over one person. Until it fades, every attack against that target finds its mark more easily, and the brand itself burns steadily the whole time.',
            roll: '1d8',
            scalesWithCr: true,
          },
          {
            name: 'Weight of Judgement',
            text: 'The air around one target thickens with something like shame. Anyone who cannot shrug it off finds every swing going wide and every word coming out wrong.',
            roll: null,
          },
        ],
      },
      loot: 'A branding iron, a sheaf of signed confessions, a writ of authority and a purse of temple gold.',
      notes: 'Never in a hurry and never alone — put two knights in front of it. It marks the party\'s strongest fighter for its own guards to hit and talks the whole time it does it.',
      blurb: 'Cold temple interrogator who marks a target and makes everyone else worse.',
    },
    {
      key: 'swashbuckler',
      name: 'Swashbuckler',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'skirmisher',
      tags: ['humanoid', 'urban'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: 3,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'aquatic'],
      combat: {
        maxHp: 56,
        armourClass: 16,
        attackBonus: 8,
        initiativeBonus: 6,
        passivePerception: 15,
        speed: ON_FOOT,
        saveDc: null,
        skills: [
          { key: 'acrobatics', bonus: 8 },
          { key: 'persuasion', bonus: 6 },
          { key: 'deception', bonus: 6 },
          { key: 'sleightOfHand', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Rapier',
            damage: '2d6+4',
            damageType: 'piercing',
            range: MELEE,
            text: 'A single clean thrust in past the guard, delivered with a running commentary the target would rather not hear.',
          },
          {
            name: 'Main Gauche',
            damage: '1d4+3',
            damageType: 'piercing',
            range: MELEE,
            text: 'The off-hand blade, used to catch a sword and then put a hole in the wrist holding it.',
          },
        ],
        abilities: [
          {
            name: 'Fancy Footwork',
            text: 'After it attacks somebody, that somebody cannot take a free swing at it as it leaves. It uses this to cross the room and murder the person you were protecting.',
            roll: null,
          },
          {
            name: 'Lucky Escape',
            text: 'Once a fight, something that should have ended it does not — a chandelier, a table edge, a rail to go over backwards. It lands fine and grins about it.',
            roll: null,
          },
        ],
      },
      loot: 'A fine rapier with a swept hilt, a plumed hat, a deck of marked cards and an IOU signed by a duke.',
      notes: 'Will not stand and trade blows. It crosses the room, kills whoever is undefended and is gone again before the fighters have turned round. Give it furniture to work with.',
      blurb: 'Duellist who talks constantly, moves freely and goes straight for your caster.',
    },
    {
      key: 'gladiator',
      name: 'Gladiator',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'brute',
      tags: ['humanoid', 'urban'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: 4,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban'],
      combat: {
        maxHp: 110,
        armourClass: 14,
        attackBonus: 7,
        initiativeBonus: 2,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: 14,
        skills: [
          { key: 'athletics', bonus: 8 },
          { key: 'performance', bonus: 7 },
          { key: 'intimidation', bonus: 7 },
        ],
        attacks: [
          {
            name: 'Spear',
            damage: '2d8+5',
            damageType: 'piercing',
            range: MELEE,
            text: 'A hard, straight thrust from behind the shield, thrown from the hip with the whole body behind it. The crowd came to see this.',
          },
          {
            name: 'Shield Slam',
            damage: '2d6+5',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'Drives the shield rim up under a jaw. Anyone who fails to set themselves is left gasping and swinging at nothing for a moment.',
          },
        ],
        abilities: [
          {
            name: 'Brave',
            text: 'Has fought in front of ten thousand people and is not going to be frightened by four. Nothing the party can say or conjure shakes it.',
            roll: null,
          },
          {
            name: 'Playing to the Crowd',
            text: 'Fights better with an audience. In front of a shouting arena it swings harder and takes stupid risks; alone in an alley it is noticeably less impressive.',
            roll: null,
          },
        ],
      },
      loot: 'A crested helm, a decorated shield, a champion\'s purse of two hundred gold and a manumission document not yet signed.',
      notes: 'A pit champion, and often not actually an enemy — plenty of them fight because somebody owns them. Two attacks a round, an armour class it never bothered raising, and a great deal of hit points to chew through.',
      blurb: 'Arena champion with spear and shield who hits twice and soaks punishment.',
    },
    {
      key: 'war-priest',
      name: 'War Priest',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'support',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: 4,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'ruins', 'mountain'],
      combat: {
        maxHp: 74,
        armourClass: 16,
        attackBonus: 6,
        initiativeBonus: 1,
        passivePerception: 16,
        speed: ON_FOOT,
        saveDc: 15,
        skills: [
          { key: 'insight', bonus: 8 },
          { key: 'persuasion', bonus: 7 },
          { key: 'perception', bonus: 6 },
        ],
        attacks: [
          {
            name: 'Maul',
            damage: '2d6+5',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A two-handed hammer swung by somebody who trained with it before they took orders. Unhurried and extremely heavy.',
          },
        ],
        abilities: [
          {
            name: 'Shield of Faith',
            text: 'A haze of pale light settles over three of its own. While it holds, blows aimed at any of them slide off far more often than they should.',
            roll: null,
          },
          {
            name: 'Mass Healing Word',
            text: 'One word and every wounded ally in the room straightens up at once. This is the ability that turns a won fight back into an unwon one.',
            roll: '3d4+3',
          },
          {
            name: 'Word of Wrath',
            text: 'Names the party as enemies of its god. Everyone who cannot hold their nerve is scorched where they stand and left rattled for the round.',
            roll: '2d8',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'A war maul, a heavy silver symbol, a reliquary finger-bone and the temple militia\'s pay chest.',
      notes: 'The heart of a militant temple guard. It hangs back one rank, shields the front, and undoes a whole round of the party\'s work with Mass Healing Word — so make sure they can reach it if they think to try.',
      blurb: 'Armoured militant cleric who shields its guards and heals all of them at once.',
    },

    // -----------------------------------------------------------------------
    // Tier V — CR 6. A level 5 party's boss fight, three ways.
    // -----------------------------------------------------------------------
    {
      key: 'mage',
      name: 'Mage',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'spellcaster',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: 4,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 84,
        armourClass: 15,
        attackBonus: 7,
        initiativeBonus: 4,
        passivePerception: 15,
        speed: ON_FOOT,
        saveDc: 15,
        skills: [
          { key: 'arcana', bonus: 9 },
          { key: 'investigation', bonus: 7 },
          { key: 'insight', bonus: 5 },
          { key: 'perception', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Fire Bolt',
            damage: '4d10',
            damageType: 'fire',
            range: '120 ft.',
            text: 'A mote of fire crosses the room faster than anyone can duck and sets light to whatever it touches. This is the thing the mage does when it is being careful.',
          },
          {
            name: 'Shocking Grasp',
            damage: '2d8',
            damageType: 'lightning',
            range: MELEE,
            text: 'It takes hold of an arm and lets go of a great deal of stored lightning. Whoever it touches cannot get a free swing at it afterwards, which is exactly the point.',
          },
        ],
        abilities: [
          {
            // The dragon-breath case, in a robe: Fireball is more than a round's
            // worth of output on its own, so it MUST move when the challenge rating
            // moves. A mage stepped down to CR 2 with a frozen Fireball still
            // deletes a level 2 party from across the room.
            name: 'Fireball',
            text: 'A bead of flame thrown into the middle of the party, which blossoms into a room-filling roar of fire. Everything caught in it burns; throwing yourself flat only halves it. The single most dangerous thing at this challenge rating.',
            roll: '8d6',
            scalesWithCr: true,
          },
          {
            name: 'Counterspell',
            text: 'Snaps its fingers as one of the party casts and the spell simply does not happen. Nothing is lost but the round, and the round was the plan.',
            roll: null,
          },
          {
            name: 'Shield',
            text: 'A disc of force appears between it and an incoming blow. Attacks the party had every right to expect to land come away with nothing.',
            roll: null,
          },
        ],
      },
      loot: 'A spellbook worth more than the house it was found in, three ink-stained wands, a component pouch and a ring of keys to a tower.',
      notes: 'A glass cannon and meant to be one — it dies fast if the party reaches it, so give it a locked door, a balcony or two guards. Lead with Fireball on the round the party is still clustered together.',
      blurb: 'Tower mage with a Fireball that can end a level 5 party\'s first round.',
    },
    {
      key: 'warlord',
      name: 'Warlord',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'boss',
      tags: ['humanoid', 'urban', 'ruins', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: 4,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'ruins', 'mountain'],
      combat: {
        // A boss carries roughly twice its row's hit points, and at this rating that
        // is the whole design: a CR 6 solo sitting on the row's 120 dies in a round
        // and a half to a level 5 party, which is not a boss fight, it is an
        // interruption with a name.
        maxHp: 264,
        armourClass: 18,
        attackBonus: 9,
        initiativeBonus: 5,
        passivePerception: 17,
        speed: ON_FOOT,
        saveDc: 16,
        skills: [
          { key: 'athletics', bonus: 9 },
          { key: 'intimidation', bonus: 9 },
          { key: 'perception', bonus: 6 },
          { key: 'insight', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Warlord\'s Greatsword',
            damage: '4d6+6',
            damageType: 'slashing',
            range: MELEE,
            text: 'An enormous blade swung in a long diagonal that takes in two people if they are standing badly. It has killed better parties than this one.',
          },
          {
            name: 'Iron Gauntlet',
            damage: '3d8+6',
            damageType: 'bludgeoning',
            range: MELEE,
            text: 'A backhand from a fist in articulated steel, thrown into a face while the sword is still recovering.',
          },
        ],
        abilities: [
          {
            name: 'Break Them',
            text: 'Picks one character out and tells the room, with complete certainty, that they are already finished. Anyone who cannot hold their nerve against that is rattled for the rest of the fight.',
            roll: null,
          },
          {
            name: 'Second Line, Forward',
            text: 'A guard steps in and takes a blow meant for the warlord. It has never once thanked one of them for it.',
            roll: null,
          },
          {
            name: 'Ruthless Momentum',
            text: 'The moment somebody drops in front of it, the sword is already moving at whoever is next. Finishing a fight it is in the middle of is dangerous.',
            roll: '2d6+6',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'A greatsword with a name filed into the blade, plate armour worth a small estate, a campaign chest of six hundred gold and orders from somebody worse.',
      notes: 'The end of a campaign arc, and built to be fought alone with two or three guards to feed into Second Line, Forward. Twice the hit points of its rating, which is what stops a level 5 party ending it in two rounds.',
      blurb: 'Armoured commander with twice a boss\'s staying power and a sword that ends turns.',
    },
    {
      key: 'assassin',
      name: 'Assassin',
      creatureType: 'Humanoid (any race)',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'skirmisher',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: 4,
      recommendedPartyLevelMax: 5,
      environmentTags: ['urban', 'ruins'],
      combat: {
        maxHp: 96,
        armourClass: 17,
        attackBonus: 9,
        initiativeBonus: 8,
        passivePerception: 16,
        speed: ON_FOOT,
        saveDc: 15,
        skills: [
          { key: 'stealth', bonus: 9 },
          { key: 'acrobatics', bonus: 8 },
          { key: 'deception', bonus: 7 },
          { key: 'perception', bonus: 6 },
        ],
        attacks: [
          {
            name: 'Poisoned Shortsword',
            damage: '3d6+6',
            damageType: 'piercing',
            range: MELEE,
            text: 'A short blade with something black dried along the edge, put in under the arm. The wound is bad; what is on the blade is worse, and shaking that off takes real constitution.',
          },
          {
            name: 'Blowpipe Dart',
            damage: '2d8+3',
            damageType: 'poison',
            range: HAND_CROSSBOW_RANGE,
            text: 'A dart from somewhere across the room, from somebody nobody has spotted yet. The sting is minor and the hour afterwards is not.',
          },
        ],
        abilities: [
          {
            // Assassinate is a payload rather than a habit — it is most of this
            // creature's output in the round it fires, so the flag has to be on or a
            // stepped-down assassin still deletes a character with the opener.
            name: 'Assassinate',
            text: 'The first strike against somebody who has not seen it coming goes exactly where it was aimed. This is the round the assassin was hired for, and a character caught by it may simply not get a turn.',
            roll: '8d6',
            scalesWithCr: true,
          },
          {
            name: 'Vanish',
            text: 'Steps behind a curtain, a pillar or a group of frightened bystanders and is not there any more. Finding it again costs the party a round it cannot spare.',
            roll: null,
          },
        ],
      },
      loot: 'Two poisoned blades, a blowpipe, four vials in a padded case, a contract naming somebody the party knows and a hundred and fifty gold in advance.',
      notes: 'Built for the opening round: it strikes first, from cover, at whoever has the fewest hit points, and it is entirely reasonable for that character to be down before initiative reaches them. Give the party a hint one scene early.',
      blurb: 'Contract killer whose opening strike can drop a character before their first turn.',
    },
  ],
}
