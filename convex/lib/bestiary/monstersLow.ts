// Monsters, Tier I and Tier II — the twenty-eight creatures a level 1 or level 2 party
// meets. Content only; the shape is in ./types.ts, and the note at the top of that file
// explains why nothing here may ever be imported by the browser.
//
// **These entries are linked, not copied.** A character assigned a creature stores its
// `key` and reads this file through the resolver, so editing an entry below changes that
// creature in every game that already links to it — including games in progress. That is
// the opposite of how lib/rules.ts behaves, where a catalogue entry is copied onto a sheet
// at the moment it is added and later edits never reach it. The difference is invisible
// from inside either file, so it is written down here: rename nothing, and treat a number
// change as a change to somebody's session.
//
// How the numbers were chosen. Every creature is measured as a **deviation from its own
// challenge rating's benchmark row**, and the deviation is the creature's character — that
// is what the CR stepper carries across when a DM moves a creature up or down. A Tank sits
// well above its row on armour class and below it on damage; a Brute is the reverse. A
// creature written exactly on its row scales into an average nothing, so nothing here is.
// The Zombie is the clearest case and reads wrong at a glance: its armour class is *below*
// its row rather than above it, because what makes a zombie a tank is hit points and the
// refusal to die, not being hard to hit. Stepped up, it stays easy to hit and awful to
// finish, which is correct.
//
// Two constraints bite hardest at this end of the corpus and are worth stating before
// anybody edits a number:
//
//   - **A challenge rating of 0 gets one die.** One attack, one die, four or six faces, no
//     flat modifier at all. The Rat, the Raven and the Crawling Claw are the three that
//     live under that rule, and there is no room in it for a second attack.
//   - **Damage is summed over every attack listed**, not taken per attack. That is why most
//     of these creatures have exactly one attack: listing a kobold's dagger beside its
//     sling doubles its measured output for a turn on which it only ever uses one of them.
//     Where two attacks are listed — the Brown Bear, the Goblin Boss — the creature really
//     does make both in a turn, and the sum is the honest figure.
//
// Roles are spread on purpose. Every role except Boss appears at least twice across the
// twenty-eight, and Boss appears exactly once, on the Goblin Boss, which is the only entry
// here built to be a whole fight on its own. A corpus where every weak monster is a Brute
// is a corpus where the CR scaler has nothing to preserve.
//
// Prose rule that catches everybody: **no dice and no to-hit numbers in any description.**
// A CR shift changes the numbers and cannot change the words, so a sentence naming a die is
// a sentence that goes stale the first time somebody uses the stepper. Say what an attack
// does. Movement-impairing effects are excluded by design too (docs/requirements.md), which
// is why the Giant Spider's web is "strands that take a moment to tear through" and the
// Ghoul's touch leaves a limb "slow to answer".

import type { BestiaryAbility, BestiaryFile } from './types'

/** Tier I is written for a level 1 party, with a little headroom at level 2. */
const TIER_I_PARTY = { recommendedPartyLevelMin: 1, recommendedPartyLevelMax: 2 } as const

/** Tier II spans a party's first two or three levels. */
const TIER_II_PARTY = { recommendedPartyLevelMin: 1, recommendedPartyLevelMax: 3 } as const

/**
 * A beast owns nothing, and saying so once is better than nine variations on "no loot".
 * `loot` is a line of text and not an inventory — nothing counts it and nothing picks it up.
 */
const BEAST_LOOT = 'Nothing carried and nothing hidden. A beast owns only itself.'

/** Shared by the pack hunters, because it is one rule and they all use it identically. */
const PACK_TACTICS: BestiaryAbility = {
  name: 'Pack Tactics',
  text: 'It fights far better with one of its own already beside the target, and a pack will always try to get two onto one rather than spread out.',
  roll: null,
}

/** Shared by the animals that find the party before the party finds them. */
const KEEN_SMELL: BestiaryAbility = {
  name: 'Keen Smell',
  text: 'It finds things by nose long before it sees them, so blood, food and a hiding creature are all equally hard to keep from it.',
  roll: null,
}

export const MONSTERS_LOW: BestiaryFile = {
  category: 'monster',
  entries: [
    // -----------------------------------------------------------------------
    // Tier I — challenge rating 0 to 1/4, for a level 1 party.
    // -----------------------------------------------------------------------
    {
      key: 'rat',
      name: 'Rat',
      creatureType: 'Beast',
      size: 'tiny',
      alignment: 'Unaligned',
      role: 'skirmisher',
      tags: ['beast', 'urban', 'cave'],
      cr: 0,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['urban', 'cave', 'ruins'],
      combat: {
        maxHp: 3,
        armourClass: 11,
        attackBonus: 2,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 2 }],
        attacks: [
          {
            name: 'Bite',
            damage: '1d4',
            damageType: 'piercing',
            range: 'melee',
            text: 'A nip at an ankle or a reaching finger. It barely counts as a wound, but a dozen of them in a grain cellar is a real fight.',
          },
        ],
        abilities: [KEEN_SMELL],
      },
      loot: BEAST_LOOT,
      notes: 'Never alone. Run rats in handfuls of four or five so the party is swatting rather than duelling, and have them break for the walls the moment two are dead.',
      blurb: 'The cellar-and-sewer filler. Harmless alone, a nuisance in numbers.',
    },
    {
      key: 'raven',
      name: 'Raven',
      creatureType: 'Beast',
      size: 'tiny',
      alignment: 'Unaligned',
      role: 'support',
      tags: ['beast', 'flying', 'forest'],
      cr: 0,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['forest', 'urban', 'ruins'],
      combat: {
        maxHp: 3,
        armourClass: 12,
        attackBonus: 2,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 50,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 3 }],
        attacks: [
          {
            name: 'Beak',
            damage: '1d4',
            damageType: 'piercing',
            range: 'melee',
            text: 'A jab at the eyes, delivered from a shoulder or a fence post and gone again before an answer arrives.',
          },
        ],
        abilities: [
          {
            name: 'Mimicry',
            text: 'It copies a sound it has heard — a shouted name, a crossbow winding, a scream — and whoever hears it looks the wrong way. Anything hunting alongside the raven gets the opening.',
            roll: null,
          },
        ],
      },
      loot: BEAST_LOOT,
      notes: 'Almost never the whole encounter. A pair of ravens above a bandit camp is an alarm the party has to solve first, and a witch\'s raven is her eyes.',
      blurb: 'Watcher and mimic. Cheap eyes for something worse.',
    },
    {
      key: 'crawling-claw',
      name: 'Crawling Claw',
      creatureType: 'Undead',
      size: 'tiny',
      alignment: 'Neutral Evil',
      role: 'brute',
      tags: ['undead', 'ruins'],
      cr: 0,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['ruins', 'cave', 'urban'],
      combat: {
        maxHp: 8,
        armourClass: 12,
        attackBonus: 3,
        initiativeBonus: 1,
        passivePerception: 10,
        speed: 20,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 4 }],
        attacks: [
          {
            name: 'Clutching Grip',
            damage: '1d4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'It closes on a throat or a wrist and squeezes with all the strength the hand had in life, which is a great deal more than its size suggests.',
          },
        ],
        abilities: [
          {
            name: 'Still as Rubble',
            text: 'Lying among stones and old bones it is indistinguishable from either, and it will wait without moving for as long as it takes.',
            roll: null,
          },
        ],
      },
      loot: 'The ring it is still wearing, and nothing else.',
      notes: 'Scatter six across a tomb floor and let the party work out that the rubble is moving. One claw is a jump scare; six is an encounter.',
      blurb: 'A severed hand that still wants to throttle somebody.',
    },
    {
      key: 'kobold',
      name: 'Kobold',
      creatureType: 'Humanoid (kobold)',
      size: 'small',
      alignment: 'Lawful Evil',
      role: 'archer',
      tags: ['humanoid', 'cave'],
      cr: 0.125,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['cave', 'mountain', 'ruins'],
      combat: {
        maxHp: 6,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 9,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 3 }],
        attacks: [
          {
            name: 'Sling',
            damage: '1d4+1',
            damageType: 'bludgeoning',
            range: '30/120 ft.',
            text: 'A stone whipped out of cover at whoever looks least armoured. Kobolds shoot from behind something and keep shooting.',
          },
        ],
        abilities: [
          PACK_TACTICS,
          {
            name: 'Sunlight Sensitivity',
            text: 'Daylight makes it squint and miss. Fought in the open at noon a kobold is pitiable; fought in its own tunnels it is not.',
            roll: null,
          },
        ],
      },
      loot: 'A sling, a pouch of river stones and a scrap of dragon scale worn as a charm.',
      notes: 'Never fights fair and never fights alone. Kobolds prepare the ground first — a pit, a rope, a stack of loose rocks — and shoot from the far side of it.',
      blurb: 'Small, cowardly, and appalling in a tunnel it prepared.',
    },
    {
      key: 'stirge',
      name: 'Stirge',
      creatureType: 'Monstrosity',
      size: 'tiny',
      alignment: 'Unaligned',
      role: 'skirmisher',
      tags: ['monstrosity', 'flying', 'swamp'],
      cr: 0.125,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['swamp', 'cave', 'forest'],
      combat: {
        maxHp: 6,
        armourClass: 12,
        attackBonus: 3,
        initiativeBonus: 3,
        passivePerception: 9,
        speed: 40,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 3 }],
        attacks: [
          {
            name: 'Blood Drain',
            damage: '1d4+1',
            damageType: 'piercing',
            range: 'melee',
            text: 'A hollow beak driven in wherever skin is bare. The puncture itself is small; what follows it is the problem.',
          },
        ],
        abilities: [
          {
            name: 'Drinks Its Fill',
            text: 'Once the beak is in, it hangs there by four crooked legs and keeps drinking every round until somebody tears it away.',
            roll: '1d4',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'Nothing. It is a mouth with wings.',
      notes: 'Comes in fours or fives out of a cave roof, all at once. The tension is not the damage but which character has one hanging off them, and who is willing to stop fighting to help.',
      blurb: 'Flying bloodsucker that attaches and keeps drinking.',
    },
    {
      key: 'giant-rat',
      name: 'Giant Rat',
      creatureType: 'Beast',
      size: 'small',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['beast', 'urban', 'cave'],
      cr: 0.125,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['urban', 'cave', 'swamp'],
      combat: {
        maxHp: 10,
        armourClass: 10,
        attackBonus: 2,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 2 }],
        attacks: [
          {
            name: 'Bite',
            damage: '1d4+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'A dog-sized rat that goes for the calf and worries at it. The teeth are filthy and the bite tends to fester for a week.',
          },
        ],
        abilities: [PACK_TACTICS],
      },
      loot: BEAST_LOOT,
      notes: 'Almost always three to six of them, in a sewer, a cellar or a flooded barrow. They surround one character and ignore everybody else entirely.',
      blurb: 'Dog-sized, filthy, and it hunts with its friends.',
    },
    {
      key: 'giant-crab',
      name: 'Giant Crab',
      creatureType: 'Beast',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'tank',
      tags: ['beast', 'aquatic'],
      cr: 0.125,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['aquatic', 'swamp', 'cave'],
      combat: {
        maxHp: 11,
        armourClass: 15,
        attackBonus: 2,
        initiativeBonus: 1,
        passivePerception: 9,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 2 }],
        attacks: [
          {
            name: 'Claw',
            damage: '1d4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A pincer that closes hard on a shin or a forearm. It does very little through armour and a great deal without it.',
          },
        ],
        abilities: [
          {
            name: 'Shell',
            text: 'A blow that does not find a joint skates off the shell, so the thing is unreasonably hard to hurt for its size.',
            roll: null,
          },
          {
            name: 'Amphibious',
            text: 'It breathes air and water both. Wading in after it changes nothing, and neither does backing off into the shallows.',
            roll: null,
          },
        ],
      },
      loot: BEAST_LOOT,
      notes: 'The right first monster for a party that has been kicking in doors. They will hit it four times and achieve nothing, and then somebody will think of something.',
      blurb: 'A shell with pincers. Hard to hurt, slow to hurt you.',
    },
    {
      // Not a fight at all, and the only entry here that cannot move. It is in the corpus
      // as an alarm — the encounter is what the noise brings, which is why its own numbers
      // are beneath its row on every line except the one that matters.
      key: 'shrieker',
      name: 'Shrieker',
      creatureType: 'Plant',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'support',
      tags: ['plant', 'cave'],
      cr: 0.125,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['cave', 'swamp', 'ruins'],
      combat: {
        maxHp: 7,
        armourClass: 10,
        attackBonus: 1,
        initiativeBonus: -2,
        passivePerception: 8,
        speed: 0,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 4 }],
        attacks: [
          {
            name: 'Spore Puff',
            damage: '1d4',
            damageType: 'poison',
            range: '5 ft.',
            text: 'A cough of grey dust at anything that comes within arm\'s reach. It stings the eyes and turns the stomach.',
          },
        ],
        abilities: [
          {
            name: 'Shriek',
            text: 'Bring a light near it, or walk past it, and it wails like a kettle for as long as it takes. Everything in the cavern that hunts by sound now knows exactly where the party is.',
            roll: null,
          },
          {
            name: 'Rooted',
            text: 'It is fixed where it grew and cannot follow anybody. Walking away is always an option — the noise it makes is the reason walking away is not enough.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing, unless somebody in the party wants the caps for a pot.',
      notes: 'Not a fight — an alarm. Put one in the corridor before the ogre and the party has to choose between silence and time.',
      blurb: 'A fungus that screams and brings the whole cavern running.',
    },
    {
      key: 'goblin',
      name: 'Goblin',
      creatureType: 'Humanoid (goblinoid)',
      size: 'small',
      alignment: 'Neutral Evil',
      role: 'skirmisher',
      tags: ['humanoid', 'cave', 'forest'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['cave', 'forest'],
      combat: {
        maxHp: 11,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 11,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 6 }],
        attacks: [
          {
            name: 'Scimitar',
            damage: '1d6+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'A quick slash from a notched blade, thrown out and pulled back before anyone can answer it.',
          },
        ],
        abilities: [
          {
            name: 'Nimble Escape',
            text: 'The goblin ducks out of reach after it strikes, so cornering one takes two people.',
            roll: null,
          },
        ],
      },
      loot: 'A handful of copper, a stolen boot knife and something sticky in a rag.',
      notes: 'Fights in packs and runs the moment it is alone. Shoots from cover, then closes only when the odds look good.',
      blurb: 'Cowardly raider that swarms in numbers and bolts when outnumbered.',
    },
    {
      key: 'skeleton',
      name: 'Skeleton',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'archer',
      tags: ['undead', 'ruins'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['ruins', 'cave', 'urban'],
      combat: {
        maxHp: 9,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 2,
        // Deliberately a penalty. A skeleton notices nothing it was not told to watch
        // for, and the stored passive figure agrees with it rather than being set apart.
        passivePerception: 9,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'perception', bonus: -1 }],
        attacks: [
          {
            name: 'Shortbow',
            damage: '1d6+1',
            damageType: 'piercing',
            range: '80/320 ft.',
            text: 'It draws without hurry and without cover, standing in the open, because nothing about being shot back at concerns it.',
          },
        ],
        abilities: [
          {
            name: 'Brittle Bones',
            text: 'A hammer, a mace or a thrown stone does far more to it than an arrow or a sword, and one good swing can end one outright.',
            roll: null,
          },
          {
            name: 'Follows Its Last Order',
            text: 'It does what it was told and nothing else, so a skeleton set to guard a door will not chase anybody past the frame.',
            roll: null,
          },
        ],
      },
      loot: 'Rusted mail, a bow with a cracked stave and a quiver of arrows still worth reusing.',
      notes: 'Best used in a rank behind something else. Alone it is a target; standing behind a wall of bone with a bow, it teaches players to close the distance.',
      blurb: 'Bone archer with orders it cannot question.',
    },
    {
      key: 'zombie',
      name: 'Zombie',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'tank',
      tags: ['undead', 'ruins'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['ruins', 'swamp', 'urban'],
      combat: {
        maxHp: 20,
        armourClass: 9,
        attackBonus: 3,
        initiativeBonus: -2,
        passivePerception: 8,
        speed: 20,
        saveDc: null,
        skills: [{ key: 'athletics', bonus: 2 }],
        attacks: [
          {
            name: 'Slam',
            damage: '1d6',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A clumsy, heavy swing with a whole arm behind it. Easy to see coming and hard to stop once it has started.',
          },
        ],
        abilities: [
          {
            name: 'Keeps Coming',
            text: 'A blow that would finish anything living often does not finish this one. Unless the hit was holy or took the head off, the thing is not done and comes on again.',
            roll: null,
          },
          {
            name: 'Slow and Certain',
            text: 'It never runs, never flinches and never stops. A party can walk away from one all day, which is exactly the problem when there are nine of them across the only bridge.',
            roll: null,
          },
        ],
      },
      loot: 'The clothes it died in, and whatever is in the pockets nobody has wanted to empty.',
      notes: 'Cheap, easy to hit and infuriating to finish. Use four or more so the party feels the arithmetic of a fight that will not end.',
      blurb: 'Slow, stupid and very hard to put down for good.',
    },
    {
      key: 'wolf',
      name: 'Wolf',
      creatureType: 'Beast',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'skirmisher',
      tags: ['beast', 'forest'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['forest', 'arctic', 'mountain'],
      combat: {
        maxHp: 11,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 13,
        speed: 40,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 3 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d4',
            damageType: 'piercing',
            range: 'melee',
            text: 'Jaws that close on a forearm or a thigh and then shake. It is a genuine wound the first time a new character takes one.',
          },
        ],
        abilities: [
          KEEN_SMELL,
          {
            name: 'Cuts Out the Straggler',
            text: 'The pack works one target away from the others and takes it apart, so whoever wandered ahead of the marching order is the one in trouble.',
            roll: null,
          },
        ],
      },
      loot: BEAST_LOOT,
      notes: 'Three or four of them, from downwind, at dusk. Wolves ignore the armoured fighter and go for whoever is standing on their own.',
      blurb: 'Pack hunter that picks off whoever strayed.',
    },
    {
      key: 'giant-spider',
      name: 'Giant Spider',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Unaligned',
      role: 'controller',
      tags: ['monstrosity', 'cave'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['cave', 'forest', 'ruins'],
      combat: {
        maxHp: 11,
        armourClass: 14,
        attackBonus: 3,
        initiativeBonus: 3,
        passivePerception: 12,
        speed: 30,
        saveDc: 11,
        skills: [
          { key: 'stealth', bonus: 5 },
          { key: 'athletics', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '1d6',
            damageType: 'piercing',
            range: 'melee',
            text: 'Fangs into a shoulder, and then venom. The puncture is small, and the sick, shaking hour afterwards is what the party will remember.',
          },
        ],
        abilities: [
          {
            name: 'Web Line',
            text: 'It strings sticky strands across a doorway or between two trees. Anyone who walks into them takes a moment to tear through, and the spider spends that moment biting.',
            roll: null,
          },
          {
            name: 'Walks the Ceiling',
            text: 'It fights from overhead and drops onto whoever is watching the floor. Nothing about the room is safe ground.',
            roll: null,
          },
        ],
      },
      loot: 'A cocooned body up in the rafters with a purse of twenty gold still on it.',
      notes: 'Give it a room it has already spun. The fight is about where the party is able to stand, not about the bite.',
      blurb: 'Ceiling ambusher that decides where you are allowed to walk.',
    },
    {
      // The one caster this tier has, and not a kobold with a different weapon: its whole
      // value is the ability that hands its own warband a breath attack. Killed first, the
      // fight is ordinary. Ignored for a round, it is not.
      key: 'scale-sorcerer',
      name: 'Scale Sorcerer',
      creatureType: 'Humanoid (kobold)',
      size: 'small',
      alignment: 'Lawful Evil',
      role: 'spellcaster',
      tags: ['humanoid', 'dragon', 'cave'],
      cr: 0.25,
      tier: 1,
      ...TIER_I_PARTY,
      environmentTags: ['cave', 'mountain', 'ruins'],
      combat: {
        maxHp: 9,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: 12,
        skills: [
          { key: 'arcana', bonus: 3 },
          { key: 'deception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Scorching Ray',
            damage: '1d8',
            damageType: 'fire',
            range: '60 ft.',
            text: 'A thin line of dragonfire off a clawed fingertip. It leaves a scorch mark on stone and a much worse one on a person.',
          },
        ],
        abilities: [
          {
            name: 'Dragon\'s Breath',
            text: 'It touches a kobold beside it, and that kobold spits fire for the rest of the fight. Used on the first round, the party is suddenly facing four fire-breathers instead of one caster.',
            roll: '1d6',
            scalesWithCr: true,
          },
          {
            name: 'Scaled Ward',
            text: 'Scales run up its arms for a moment and blows glance away. It does this the first time somebody actually reaches it.',
            roll: null,
          },
        ],
      },
      loot: 'A wand of carved dragon bone, a chalk-marked spell scrap and eight gold in temple coin.',
      notes: 'The one kobold worth killing first, and the party will not know that until the second round. Keep it behind the others and behind cover.',
      blurb: 'Kobold caster that turns its whole warband into fire-breathers.',
    },

    // -----------------------------------------------------------------------
    // Tier II — challenge rating 1/2 to 1, for a party of level 1 to 3.
    // -----------------------------------------------------------------------
    {
      key: 'orc',
      name: 'Orc',
      creatureType: 'Humanoid (orc)',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['humanoid', 'mountain'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['mountain', 'cave', 'forest'],
      combat: {
        maxHp: 22,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: 1,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 4 },
          { key: 'intimidation', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Greataxe',
            damage: '1d12+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'A two-handed swing brought down from over the shoulder. One good hit takes a new character out of the fight, and the table feels it land.',
          },
        ],
        abilities: [
          {
            name: 'Aggressive',
            text: 'It crosses the ground between itself and the nearest enemy in one furious rush, so there is no round where the party gets to shoot at it for free.',
            roll: null,
          },
        ],
      },
      loot: 'A greataxe with a bone-wrapped haft, a hide cloak and fourteen gold in a knotted rag.',
      notes: 'The first monster that can drop somebody in a single blow, which is the whole reason to use one. Orcs charge the closest target and do not manoeuvre.',
      blurb: 'Charges straight in and hits hard enough to fell a hero outright.',
    },
    {
      key: 'hobgoblin',
      name: 'Hobgoblin',
      creatureType: 'Humanoid (goblinoid)',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'tank',
      tags: ['humanoid', 'forest'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['forest', 'ruins', 'mountain'],
      combat: {
        maxHp: 23,
        armourClass: 16,
        attackBonus: 3,
        initiativeBonus: 1,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 3 },
          { key: 'perception', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Longsword',
            damage: '1d8',
            damageType: 'slashing',
            range: 'melee',
            text: 'A disciplined cut from behind a shield, thrown out at the same moment as the one from the hobgoblin standing beside it.',
          },
        ],
        abilities: [
          {
            // Extra damage rather than a standing rule, so it is flagged to move with a
            // CR shift even though it sits under the row today. A frozen die here would
            // make a stepped-up hobgoblin a worse soldier than a stepped-up goblin.
            name: 'Martial Advantage',
            text: 'With one of its own already engaging the target, its blow lands in the gap and does considerably more. Two hobgoblins are far worse than twice one hobgoblin.',
            roll: '1d6',
            scalesWithCr: true,
          },
          {
            name: 'Shield Wall',
            text: 'It fights shoulder to shoulder and will not be drawn out of the line, which is why a corridor full of them is a problem and a field full of them is not.',
            roll: null,
          },
        ],
      },
      loot: 'Chain mail kept oiled, a shield with a unit mark painted on it and a written order nobody in the party can read.',
      notes: 'Run them in pairs, in formation, holding a doorway. A hobgoblin that fights like a goblin has been run wrong.',
      blurb: 'Armoured soldier, twice as dangerous with a friend beside it.',
    },
    {
      // Flagged ability, and the clearest case in this file: the burst is more than the
      // creature's whole round of ordinary output, so freezing it would leave a magmin
      // stepped down to a lower rating still killing a level 1 character on death.
      key: 'magmin',
      name: 'Magmin',
      creatureType: 'Elemental',
      size: 'small',
      alignment: 'Chaotic Neutral',
      role: 'controller',
      tags: ['elemental', 'cave'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['cave', 'mountain', 'desert'],
      combat: {
        maxHp: 15,
        armourClass: 14,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: 11,
        skills: [{ key: 'stealth', bonus: 3 }],
        attacks: [
          {
            name: 'Touch',
            damage: '1d6+1',
            damageType: 'fire',
            range: 'melee',
            text: 'A small hand of cracked stone with fire underneath it. What it touches chars, and what it touches twice catches light.',
          },
        ],
        abilities: [
          {
            name: 'Death Burst',
            text: 'Destroy it and it bursts. Everything close enough is scorched, and rope, robes, spellbooks and thatch all catch. Killing a magmin in the wrong room is worse than leaving it alive.',
            roll: '2d6',
            scalesWithCr: true,
          },
          {
            name: 'Ignited Body',
            text: 'It can flare into open flame, throwing light into every corner and leaving the party nowhere dark to stand.',
            roll: null,
          },
        ],
      },
      loot: 'A scatter of cooling slag and a lump of gold it had swallowed, worth about twenty-five.',
      notes: 'A monster whose point is the room rather than the fight. Put one in a granary, a library or on a rope bridge and the party has to decide how to kill it.',
      blurb: 'Little fire elemental that bursts and sets the room alight.',
    },
    {
      key: 'giant-wasp',
      name: 'Giant Wasp',
      creatureType: 'Beast',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'skirmisher',
      tags: ['beast', 'flying', 'forest'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['forest', 'swamp', 'desert'],
      combat: {
        maxHp: 14,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 3,
        passivePerception: 10,
        speed: 50,
        saveDc: 11,
        skills: [{ key: 'perception', bonus: 1 }],
        attacks: [
          {
            name: 'Sting',
            damage: '1d6+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'A barbed sting driven in as it passes. The hit itself is bad and the venom behind it is worse.',
          },
        ],
        abilities: [
          {
            name: 'Venom',
            text: 'The wound burns for hours and the victim is sick with it. A character who shrugs off the sting rarely shrugs off both.',
            roll: '1d6',
            scalesWithCr: true,
          },
          {
            name: 'Strikes From Above',
            text: 'It comes down, stings and lifts back out of reach in one movement, so a fighter with a sword gets roughly one chance in three to answer it.',
            roll: null,
          },
        ],
      },
      loot: BEAST_LOOT,
      notes: 'Two or three over open ground, or one nest defending a hollow tree. They will not stay in melee, which frustrates exactly the character it ought to.',
      blurb: 'Dives, stings, and is out of reach before you swing.',
    },
    {
      key: 'grey-ooze',
      name: 'Grey Ooze',
      creatureType: 'Ooze',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'tank',
      tags: ['ooze', 'cave'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['cave', 'ruins', 'swamp'],
      combat: {
        maxHp: 23,
        armourClass: 8,
        attackBonus: 3,
        initiativeBonus: -2,
        passivePerception: 8,
        speed: 10,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 4 }],
        attacks: [
          {
            name: 'Pseudopod',
            damage: '1d6+1',
            damageType: 'acid',
            range: 'melee',
            text: 'A slow arm of grey sludge laid across a leg or a breastplate. It does not hit hard; it keeps eating after it has landed.',
          },
        ],
        abilities: [
          {
            name: 'Eats Metal',
            text: 'A sword or an axe that strikes it comes away pitted and dull. Hit it enough times with the same blade and the DM should say so out loud.',
            roll: null,
          },
          {
            name: 'Looks Like Wet Stone',
            text: 'Until it moves it is a damp patch on the floor. Parties walk into one far more often than they choose to fight one.',
            roll: null,
          },
        ],
      },
      loot: 'Whatever it has not finished — a belt buckle, a few coins and a sword eaten down to the tang.',
      notes: 'The monster that teaches a party to look at the floor. Slow enough to walk away from, and hungry enough to be worth walking away from.',
      blurb: 'A puddle that eats armour and never has to chase you.',
    },
    {
      key: 'thri-kreen',
      name: 'Thri-kreen',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'archer',
      tags: ['monstrosity', 'desert'],
      cr: 0.5,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['desert', 'mountain', 'ruins'],
      combat: {
        maxHp: 13,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 12,
        speed: 40,
        saveDc: null,
        skills: [
          { key: 'stealth', bonus: 4 },
          { key: 'perception', bonus: 3 },
          { key: 'athletics', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Chatkcha',
            damage: '1d6+3',
            damageType: 'slashing',
            range: '30/60 ft.',
            text: 'A four-bladed throwing wedge flung flat and hard. It arrives from an angle nobody was watching.',
          },
        ],
        abilities: [
          {
            name: 'Returning Blade',
            text: 'The wedge curves back to its hand, so it never runs out of ammunition and never has to close the distance.',
            roll: null,
          },
          {
            name: 'Standing Leap',
            text: 'It clears a wagon or a dry gully from a standstill, so high ground is no defence against it.',
            roll: null,
          },
        ],
      },
      loot: 'Two chatkcha wedges, a long gythka polearm and a water gourd sealed with wax.',
      notes: 'A mantis-folk hunter of the deep desert — not evil, and it will talk if the party has water to trade. Shooting first is what turns it into a fight.',
      blurb: 'Insectile desert hunter with a throwing blade that comes back.',
    },
    {
      key: 'bugbear',
      name: 'Bugbear',
      creatureType: 'Humanoid (goblinoid)',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'skirmisher',
      tags: ['humanoid', 'cave', 'forest'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['cave', 'forest', 'ruins'],
      combat: {
        maxHp: 21,
        armourClass: 14,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'stealth', bonus: 6 },
          { key: 'intimidation', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Morningstar',
            damage: '2d8',
            damageType: 'piercing',
            range: 'melee',
            text: 'A spiked head on a long shaft, swung from further away than the party thought they were in danger from.',
          },
        ],
        abilities: [
          {
            name: 'Surprise Attack',
            text: 'If it strikes a creature that has not yet acted in the fight, the blow is very much worse. A bugbear opening an ambush can take a hero out on the first round.',
            roll: '2d6',
            scalesWithCr: true,
          },
          {
            name: 'Long Reach',
            text: 'It strikes from a step beyond where its arms look like they end, so giving ground by one pace gets nobody out of the fight.',
            roll: null,
          },
        ],
      },
      loot: 'A morningstar, a hide shirt and thirty gold in coin and filed teeth.',
      notes: 'Built for ambush and wasted otherwise. Have it wait in the dark, take one swing at whoever is scouting, and fade back into it.',
      blurb: 'Hulking ambusher whose first blow is the dangerous one.',
    },
    {
      key: 'dire-wolf',
      name: 'Dire Wolf',
      creatureType: 'Beast',
      size: 'large',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['beast', 'forest'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['forest', 'arctic', 'mountain'],
      combat: {
        maxHp: 31,
        armourClass: 12,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 13,
        speed: 50,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 3 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d6+3',
            damageType: 'piercing',
            range: 'melee',
            text: 'Jaws wide enough to take a shoulder. This is not an ordinary wolf with bigger numbers behind it; it is a wound that stops somebody fighting.',
          },
        ],
        abilities: [
          PACK_TACTICS,
          {
            name: 'Never Loses a Trail',
            text: 'Once it has a scent it does not tire and does not give up, so a party that runs from dire wolves is a party being followed.',
            roll: null,
          },
        ],
      },
      loot: BEAST_LOOT,
      notes: 'Two of them, with a goblin or an orc riding one. They circle, take the character on the edge of the light, and drag them away from it.',
      blurb: 'Horse-sized wolf that hunts in twos and does not tire.',
    },
    {
      key: 'ghoul',
      name: 'Ghoul',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'controller',
      tags: ['undead', 'ruins', 'urban'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['ruins', 'urban', 'cave'],
      combat: {
        maxHp: 22,
        armourClass: 12,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 10,
        speed: 30,
        saveDc: 12,
        skills: [
          { key: 'stealth', bonus: 4 },
          { key: 'perception', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Claws',
            damage: '1d8+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'Long grey fingers that open skin easily and leave behind a cold that has nothing to do with the cut.',
          },
        ],
        abilities: [
          {
            name: 'Chill of the Grave',
            text: 'A character who cannot shake off the cold finds their arms slow to answer for a moment — long enough for the ghoul, and for everything with it, to take a free swing.',
            roll: null,
          },
          {
            name: 'Feeds First',
            text: 'It will leave a fighter mid-swing to crouch over whoever has already gone down. That is either the party\'s chance or their friend\'s last round, and they have to choose which.',
            roll: null,
          },
        ],
      },
      loot: 'Rags, and a signet ring on a finger it has not got round to eating.',
      notes: 'Two or three in a crypt or a plague cellar. The threat is not the damage — it is that one bad roll takes a character out of the round while the others are still swinging.',
      blurb: 'Grave-eater whose cold touch leaves a hero unable to answer.',
    },
    {
      key: 'harpy',
      name: 'Harpy',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'controller',
      tags: ['monstrosity', 'flying', 'mountain'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['mountain', 'aquatic', 'ruins'],
      combat: {
        maxHp: 22,
        armourClass: 11,
        attackBonus: 3,
        initiativeBonus: 1,
        passivePerception: 10,
        speed: 40,
        saveDc: 11,
        skills: [
          { key: 'performance', bonus: 4 },
          { key: 'deception', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Claws',
            damage: '2d4+1',
            damageType: 'slashing',
            range: 'melee',
            text: 'Filthy talons raked across a face or a forearm as it passes overhead.',
          },
        ],
        abilities: [
          {
            name: 'Luring Song',
            text: 'It sings, and anybody who hears it and cannot shake it off wants very much to walk out towards the rocks it is sitting on. Players will argue about this at the table, which is rather the point.',
            roll: null,
          },
          {
            name: 'Fights From the Air',
            text: 'It never lands willingly. It drops, rakes and lifts away, and a party with no bows spends the fight throwing rocks.',
            roll: null,
          },
        ],
      },
      loot: 'A nest of picked bones with forty gold, three rings and a sailor\'s knife in the bottom of it.',
      notes: 'Best on a cliff, a wreck or a ruined tower where walking out towards the song costs something. Two harpies singing from opposite sides is a nasty problem.',
      blurb: 'Sings sailors onto the rocks, then fights only from the air.',
    },
    {
      key: 'brown-bear',
      name: 'Brown Bear',
      creatureType: 'Beast',
      size: 'large',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['beast', 'forest'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['forest', 'mountain', 'arctic'],
      combat: {
        maxHp: 34,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: 1,
        passivePerception: 13,
        speed: 40,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '1d8+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'It takes hold with its teeth and puts its whole weight behind them.',
          },
          {
            name: 'Claws',
            damage: '1d6+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'A swipe from a forelimb the thickness of a person\'s thigh, which comes in the same turn as the bite rather than instead of it.',
          },
        ],
        abilities: [KEEN_SMELL],
      },
      loot: BEAST_LOOT,
      notes: 'Not evil and not hunting the party — a bear is defending a kill, a cub or a cave mouth, and it will break off if the party gives it room. That makes it the best low-level monster for a table that always fights.',
      blurb: 'Angry animal, not a villain. Hits twice a turn and will let you leave.',
    },
    {
      key: 'animated-armour',
      name: 'Animated Armour',
      creatureType: 'Construct',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'tank',
      tags: ['construct', 'ruins'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['ruins', 'urban', 'cave'],
      combat: {
        maxHp: 34,
        armourClass: 18,
        attackBonus: 4,
        initiativeBonus: 0,
        passivePerception: 8,
        speed: 25,
        saveDc: null,
        skills: [{ key: 'athletics', bonus: 2 }],
        attacks: [
          {
            name: 'Gauntlet',
            damage: '1d6+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'An empty steel fist that swings on the same arc every time. It does not hit hard, and it will keep hitting until one of you is finished.',
          },
        ],
        abilities: [
          {
            name: 'Nobody Inside',
            text: 'There is no one in it. It does not tire, flinch, bleed or negotiate, and it cannot be frightened, bribed or reasoned with.',
            roll: null,
          },
          {
            name: 'Set to Guard One Room',
            text: 'Whoever animated it gave it a place, and it will not follow anybody past the threshold. Leaving is always allowed; getting past it is not.',
            roll: null,
          },
        ],
      },
      loot: 'A suit of plate worth real money to anybody willing to carry it out, and a maker\'s mark stamped on the breastplate.',
      notes: 'A hall the party has to cross rather than a monster they have to kill. The armour class is the whole design: low-level characters will miss it again and again and have to think of something else.',
      blurb: 'Empty plate guarding one doorway, and very hard to hit.',
    },
    {
      key: 'imp',
      name: 'Imp',
      creatureType: 'Fiend (devil)',
      size: 'tiny',
      alignment: 'Lawful Evil',
      role: 'spellcaster',
      tags: ['fiend', 'flying', 'urban'],
      cr: 1,
      tier: 2,
      ...TIER_II_PARTY,
      environmentTags: ['urban', 'ruins', 'cave'],
      combat: {
        maxHp: 18,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 11,
        speed: 40,
        saveDc: 11,
        skills: [
          { key: 'deception', bonus: 4 },
          { key: 'stealth', bonus: 5 },
          { key: 'insight', bonus: 3 },
          { key: 'persuasion', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Sting',
            damage: '1d4+3',
            damageType: 'poison',
            range: 'melee',
            text: 'A whip of the tail with a barb on the end of it. The poison is what does the real work.',
          },
          {
            name: 'Hellfire Mote',
            damage: '1d6+2',
            damageType: 'fire',
            range: '30 ft.',
            text: 'A bead of foul red fire flicked off a fingertip. It smells of burnt hair, and it is why an imp never has to come close.',
          },
        ],
        abilities: [
          {
            name: 'Slips Out of Sight',
            text: 'It vanishes in the middle of the fight and is somewhere else when it reappears — usually behind whoever has the fewest hit points left.',
            roll: null,
          },
          {
            name: 'Wears Another Shape',
            text: 'It can arrive as a rat, a raven or a spider, and has often been in the room for an hour before anybody realised.',
            roll: null,
          },
          {
            name: 'Sees in the Dark',
            text: 'Darkness, its own or anybody else\'s, hides nothing from it. Dousing the lantern helps the imp.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing of its own — whatever its master gave it to carry, and a contract it is not supposed to show anybody.',
      notes: 'A familiar and a spy first, a fighter a distant second. Use it to watch the party for three sessions and then have it turn up in a fight it can leave whenever it likes.',
      blurb: 'Invisible devil spy that fights at range and never commits.',
    },
  ],
}
