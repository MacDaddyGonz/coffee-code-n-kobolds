// Tier IV and Tier V monsters — challenge rating 4 to 6. Eleven creatures for a party at
// level 4 or 5, and nine written to be the whole fight on their own.
//
// ⚠️ **Editing an entry here changes every creature in every game that already links to
// it.** A character assigned from the bestiary stores the entry's `key` and resolves
// through it, so raising the troll's hit points raises them in somebody's session that is
// halfway through the encounter. This is the exact opposite of how lib/rules.ts behaves —
// a catalogue entry is *copied* onto a sheet, so editing one leaves every existing sheet
// alone — and the difference is invisible from inside either file. If a change is meant to
// be a variant rather than a correction, it is a new entry with a new key.
//
// How the numbers were balanced. Every creature is a deliberate deviation from its own
// benchmark row, because the deviation is what the CR scaler carries across when a DM
// steps the creature up or down: a brute sits above its row on hit points and damage and
// below it on armour class, a tank the other way about, and a boss well above the row on
// both. A creature written *on* its row scales into an average nothing, which is the one
// outcome the role vocabulary exists to prevent.
//
// The row is emphatically not the answer at Tier V. A creature read straight off the CR 6
// row has 120 hit points and dies in a round and a half to a level 5 party, so the nine
// boss entries sit near twice that and around half again the row's damage. Three of the
// nine are deliberately *not* solo bosses — see the comments on the wyvern, the medusa and
// the cyclops — and they are the entries a DM puts in front of a level 5 party with
// company.
//
// The one thing to understand before editing an ability: **`scalesWithCr` marks a payload,
// not a pace.** The test is what the roll represents, and nothing else — not how large it
// is, and not whether the ability reads as an action or as a standing rule. **If the number
// is damage arriving on a target, the flag is set**: a breath weapon, an area blast, a
// charge's bonus damage, venom, a drain, a hide that burns whoever punches it, a snatch that
// ends in a fall. A breath weapon is most of a dragon's output, so it must move when the
// dragon does or a CR 6 dragon stepped down to CR 2 still ends a level 2 party in one
// action; the same argument applies with less drama to every other payload, which is why
// none of them is exempt for being small.
//
// **Two rolls in this file are deliberately unflagged, and both are the creature recovering
// rather than the party losing hit points**: the troll's Regeneration, which is a pace and
// has a long comment of its own, and the flesh golem's Drinks Lightning, which is a heal
// wearing a die. Doubling either makes a creature unkillable instead of harder. Everything
// made of words — the wraith's habit of walking through walls, an aura of light, a weakness
// to water — has no roll at all and so cannot be flagged either way.
//
// The corpus test refuses an ability whose average damage exceeds its own row's
// damage-per-round figure without the flag, so it catches a forgotten opt-in on the biggest
// abilities. It cannot tell a small payload from a pace, so that half is caught only by
// reading this paragraph.
//
// Prose here never names a die or a to-hit number, because a CR shift changes the numbers
// and cannot change the words. It also writes around every movement-impairing condition:
// D&D Lite excludes them, so a hydra sweeps its tail *through* people, a chuul *drags its
// victim closer*, and a medusa's gaze is described as the end of that character's fight
// rather than as something done to how far they can walk.

import type { BestiaryAbility, BestiaryFile } from './types'

// ---------------------------------------------------------------------------
// Shared values
// ---------------------------------------------------------------------------

/** Tier IV is aimed squarely at a level 4–5 party, so the pair repeats eleven times. */
const TIER_IV_MIN = 4
const TIER_IV_MAX = 5

/** Tier V is the level 5 boss slot, top and bottom the same number. */
const TIER_V_LEVEL = 5

/** Every young dragon here walks, but a DM will be moving the flying figure. */
const YOUNG_DRAGON_SPEED = 80

/**
 * An elemental owns nothing, so the loot line is about the room rather than the corpse.
 * Shared by all four rather than reworded four times.
 */
const ELEMENTAL_LOOT =
  'Nothing it carried, because it carried nothing. What is left is the state it left the room in.'

/**
 * All three young dragons get this, word for word. It is the moment a dragon fight starts
 * badly: somebody freezes, and the party is a person down before anyone has rolled damage.
 */
const FRIGHTFUL_PRESENCE: BestiaryAbility = {
  name: 'Frightful Presence',
  text: 'The dragon rears, fixes on the party and lets them understand what it is. Anyone who cannot hold their nerve spends the next while unable to make themselves close with it, and attacks anything else instead. A character who shakes it off is done being afraid of this dragon for the rest of the fight.',
  roll: null,
}

/**
 * The undead trait that changes how a room is fought in rather than how much damage lands.
 * Shared by the banshee and the wraith; the ghost has its own, stranger version.
 */
const PASSES_THROUGH_WALLS: BestiaryAbility = {
  name: 'Passes Through Walls',
  text: 'Stone is no obstacle to it. It leaves through the floor, crosses under the room and comes up behind whoever was guarding the door, so barricading a corridor against it accomplishes nothing at all.',
  roll: null,
}

export const MONSTERS_HIGH: BestiaryFile = {
  category: 'monster',
  entries: [
    // -----------------------------------------------------------------------
    // Tier IV — challenge rating 4 to 5
    // -----------------------------------------------------------------------

    // The troll is the entry the CR stepper is tested against, so it is worth reading
    // before editing. A DM takes it from CR 5 down to CR 2 to put it in front of a level 2
    // party: the hit points, the two claws and the armour class all move, and
    // **Regeneration must come out the other side unchanged.**
    //
    // That is why `scalesWithCr` is deliberately absent from it rather than set to false.
    // Regeneration is a *pace* — the rate at which the fight goes wrong if the party never
    // gets fire or acid onto the thing — and a pace does not belong to a challenge rating.
    // Doubling the die on the way up produces a troll that out-heals a level 5 party's
    // whole output and so cannot be killed at all, which is a different and much worse
    // encounter than a harder troll. Halving it on the way down deletes the only reason a
    // troll is memorable and leaves a large man with claws. The claws are the payload and
    // they scale; the regeneration is the character and it does not.
    {
      key: 'troll',
      name: 'Troll',
      creatureType: 'Giant',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['giant', 'cave'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['cave', 'swamp', 'mountain'],
      combat: {
        maxHp: 110,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 1,
        passivePerception: 12,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 7 },
          { key: 'perception', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Claw',
            damage: '2d8+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'A long arm comes round in a flat arc and the claws go in under whatever the target is holding up. It is not fast and it does not need to be.',
          },
          {
            name: 'Raking Claw',
            damage: '2d8+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'The other arm follows the first without a pause, so a troll that reaches someone reaches them twice. Rake this one against the same target unless another is closer.',
          },
        ],
        abilities: [
          {
            name: 'Regeneration',
            text: 'Wounds close while the party watch. At the start of each of its turns it knits itself back together, and it will get up from apparently dead unless the killing damage was fire or acid. A troll put down without either is a troll standing behind the party a minute later.',
            roll: '1d10',
            // No `scalesWithCr` — see the note above the entry. Deliberate, and the whole
            // point of the entry.
          },
          {
            name: 'Keen Smell',
            text: 'It smells the party through a closed door and around two corners, so there is no sneaking up on one in its own tunnel. Announce that it already knows where they are.',
            roll: null,
          },
        ],
      },
      loot: 'A gnawed helmet, a rope of knotted tendon and a hoard of bones stacked with obvious care.',
      notes: 'Fights the nearest warm thing and never retreats, because it has no reason to learn caution. Keep a torch or a flask of acid in the room somewhere the party can reach it, or the fight has no ending.',
      blurb: 'Relentless brute that gets back up unless it is burned.',
    },

    {
      key: 'ettin',
      name: 'Ettin',
      creatureType: 'Giant',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['giant', 'mountain'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['mountain', 'cave'],
      combat: {
        maxHp: 85,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 15,
        speed: 40,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 4 },
          { key: 'intimidation', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Battleaxe',
            damage: '2d8+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'The left head picks a target and the left arm chops at it, once, hard, with an axe the size of a door.',
          },
          {
            name: 'Morningstar',
            damage: '2d8+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'The right head has chosen someone else entirely, and the spiked club goes that way in the same turn. The two heads rarely agree on a target, which is worth playing.',
          },
        ],
        abilities: [
          {
            name: 'Two Heads',
            text: 'Two sets of eyes and two arguing opinions. It is very hard to surprise, and hard to talk into anything, because whatever one head is persuaded of the other immediately disputes.',
            roll: null,
          },
          {
            name: 'Wakeful',
            text: 'One head sleeps while the other keeps watch, so an ettin camp has no unguarded hour. A party planning to creep past a sleeping giant should be told, once, that it is only half asleep.',
            roll: null,
          },
        ],
      },
      loot: 'Two mismatched boots, a sack of stolen livestock bells and about forty gold in loose coin.',
      notes: 'Bullies whatever lives nearby into feeding it and keeps a filthy cave on a hillside. In a fight it splits its attention between two characters rather than focusing, which is the mercy that keeps it survivable.',
      blurb: 'Two-headed giant that swings at two people at once and argues with itself.',
    },

    {
      key: 'ghost',
      name: 'Ghost',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Any',
      role: 'controller',
      tags: ['undead', 'ruins'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['ruins', 'urban'],
      combat: {
        maxHp: 58,
        armourClass: 14,
        attackBonus: 6,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 40,
        saveDc: 14,
        skills: [
          { key: 'stealth', bonus: 6 },
          { key: 'perception', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Withering Touch',
            damage: '3d6+2',
            damageType: 'necrotic',
            range: 'melee',
            text: 'A hand goes into the target rather than onto them, and something goes out of them with it. There is no wound afterwards, which the party will find worse than one.',
          },
        ],
        abilities: [
          {
            name: 'Horrifying Visage',
            text: 'It shows a character how it died. Anyone who cannot master themselves ages years in a moment — greying hair, a shaking hand — and will not willingly look at it again. Restoring the lost years takes magic the party probably has to go and find.',
            roll: null,
          },
          {
            name: 'Steps Out of the World',
            text: 'It leaves for the place just beside this one, where nothing the party has can reach it, and returns a moment later somewhere else in the room. Cornering a ghost is not a thing that can be done.',
            roll: null,
          },
          {
            name: 'Possession',
            text: 'It steps into a character who fails to shut it out and wears them. The player keeps their sheet and loses their say: run the character as the ghost for a round or two, attacking their own party, until they throw it out or it is driven out.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing on the ghost. Somewhere in the building is the thing it will not leave — a ring, a letter, a small grave.',
      notes: 'Haunts one place and wants one thing, and will usually say what if anybody asks between attacks. Settling the unfinished business ends the encounter more cleanly than damage ever will, so put the answer somewhere findable.',
      blurb: 'Restless dead that ages what it touches and takes a body when it can.',
    },

    {
      key: 'banshee',
      name: 'Banshee',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'spellcaster',
      tags: ['undead', 'forest'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['forest', 'ruins'],
      combat: {
        maxHp: 50,
        armourClass: 14,
        attackBonus: 6,
        initiativeBonus: 4,
        passivePerception: 12,
        speed: 40,
        saveDc: 14,
        skills: [
          { key: 'insight', bonus: 4 },
          { key: 'intimidation', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Corrupting Touch',
            damage: '4d6+2',
            damageType: 'necrotic',
            range: 'melee',
            text: 'Thin hands close on a face and the life goes grey under them. She does this almost absently, between screams.',
          },
        ],
        abilities: [
          {
            // The wail averages well above the CR 4 row's damage per round, so it is the
            // creature's output rather than a flourish and it carries the flag. A banshee
            // stepped down to CR 1 whose scream still emptied a low-level party would be
            // the dragon-breath mistake in a smaller dress.
            name: 'Wail',
            text: 'Once in a fight she opens her mouth and grief comes out of it. Everyone who can hear her and is still alive takes the damage even if they never saw her, and anyone already badly hurt should be told plainly that this may be the thing that kills them.',
            roll: '6d8',
            scalesWithCr: true,
          },
          {
            name: 'Detect Life',
            text: 'She knows where every living thing within a bowshot is standing, through walls and in the dark. Splitting the party does not divide her attention; it just tells her where to go second.',
            roll: null,
          },
          PASSES_THROUGH_WALLS,
        ],
      },
      loot: 'A tarnished silver circlet and a mirror she smashed a very long time ago.',
      notes: 'Was beautiful, knows she is not, and hates anything that still is. She haunts the ruin she was betrayed in and will not leave it, so a party that withdraws out of earshot has genuinely escaped her.',
      blurb: 'Screaming undead noblewoman whose voice can end a fight in one round.',
    },

    {
      key: 'fire-elemental',
      name: 'Fire Elemental',
      creatureType: 'Elemental',
      size: 'large',
      alignment: 'Neutral',
      role: 'skirmisher',
      tags: ['elemental'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['cave', 'desert'],
      combat: {
        maxHp: 76,
        armourClass: 16,
        attackBonus: 7,
        initiativeBonus: 4,
        passivePerception: 12,
        speed: 50,
        saveDc: null,
        skills: [{ key: 'athletics', bonus: 6 }],
        attacks: [
          {
            name: 'Fiery Touch',
            damage: '2d6+3',
            damageType: 'fire',
            range: 'melee',
            text: 'A limb of flame reaches out and rests on someone for a moment. Cloth goes first, then everything under it.',
          },
          {
            name: 'Flaring Touch',
            damage: '2d6+3',
            damageType: 'fire',
            range: 'melee',
            text: 'It swells and touches a second time in the same instant, usually a second target, because it moves faster than anyone in armour can turn.',
          },
        ],
        abilities: [
          {
            name: 'Fire Form',
            text: 'It is made of fire all the way through. Anyone who hits it with a fist or ends up inside its reach burns for it, and it walks through a door rather than opening one, setting the frame alight on the way past.',
            roll: '1d10',
            scalesWithCr: true,
          },
          {
            name: 'Lights the Room',
            text: 'Nothing hides from it and nothing hides near it: it throws bright light for a good distance in every direction, which ruins any plan involving darkness — the party\'s plan included.',
            roll: null,
          },
          {
            name: 'Water Undoes It',
            text: 'A bucket, a stream, a burst waterskin — water hurts it badly, and standing in water blunts it. A prepared party fights this in the one room with a fountain, and should be allowed to notice the fountain.',
            roll: null,
          },
        ],
      },
      loot: ELEMENTAL_LOOT,
      notes: 'Summoned or shaken loose from a fire that burned somewhere it should not have. It has no interest in the party beyond their being flammable, and it will chase whatever is nearest through a burning building without noticing the building.',
      blurb: 'Living bonfire that burns everything it touches and sets the room alight.',
    },

    {
      key: 'water-elemental',
      name: 'Water Elemental',
      creatureType: 'Elemental',
      size: 'large',
      alignment: 'Neutral',
      role: 'brute',
      tags: ['elemental', 'aquatic'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['aquatic', 'swamp'],
      combat: {
        maxHp: 112,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: 30,
        saveDc: 14,
        skills: [
          { key: 'athletics', bonus: 7 },
          { key: 'stealth', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Slam',
            damage: '2d8+4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A wall of water arrives with the weight of a wave behind it and folds a character over. Water is heavy, and this is all of it at once.',
          },
          {
            name: 'Surging Slam',
            damage: '2d8+4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'It gathers and breaks a second time before the first has finished draining off the floor.',
          },
        ],
        abilities: [
          {
            name: 'Whelm',
            text: 'It sweeps a character up into itself and holds them there, under the surface, unable to breathe and unable to get clear without help. Allies can reach in and pull them out; the character alone will need luck. Anyone inside it takes damage each round they stay there.',
            roll: '2d8+3',
            scalesWithCr: true,
          },
          {
            name: 'Pours Through Any Gap',
            text: 'A closed door with a finger\'s width under it is not a closed door. It goes through grates, keyholes and cracks in masonry and reassembles on the other side, so it is never shut out of anywhere.',
            roll: null,
          },
          {
            name: 'Freezes Badly',
            text: 'Cold does real harm to it. A frost spell leaves it brittle and slow to gather itself, and a DM should let the party feel that they found the answer rather than got lucky.',
            roll: null,
          },
        ],
      },
      loot: ELEMENTAL_LOOT,
      notes: 'Rises out of a river, a cistern or a flooded hold and goes after whatever is standing in the water with it. It fights best where it can pull people under, so put the encounter on a jetty, a ford or a ship\'s deck.',
      blurb: 'Wave with intent that drags people under and holds them there.',
    },

    {
      key: 'air-elemental',
      name: 'Air Elemental',
      creatureType: 'Elemental',
      size: 'large',
      alignment: 'Neutral',
      role: 'skirmisher',
      tags: ['elemental', 'flying'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['mountain', 'desert'],
      combat: {
        maxHp: 74,
        armourClass: 16,
        attackBonus: 7,
        initiativeBonus: 5,
        passivePerception: 12,
        speed: 90,
        saveDc: 14,
        skills: [
          { key: 'acrobatics', bonus: 7 },
          { key: 'stealth', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Slam',
            damage: '2d8+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A hard column of air hits like a thrown shield and is gone again before anyone can swing back at where it was.',
          },
          {
            name: 'Buffeting Slam',
            damage: '2d6+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A second pressure from a completely different direction, because it is on all sides of the party at once.',
          },
        ],
        abilities: [
          {
            // Read as a payload even though the sentence is about where people end up:
            // the roll is what the column does to everyone it passes through, and it is
            // this elemental's signature action. Frozen, a Whirlwind would be the one
            // thing about a scaled air elemental that had not moved.
            name: 'Whirlwind',
            text: 'It becomes a spinning column and passes straight through the party. Everyone in the way is picked up, spun and put down somewhere they did not choose, which scatters a careful formation in one action.',
            roll: '3d8+3',
            scalesWithCr: true,
          },
          {
            name: 'Air Form',
            text: 'There is nothing to it but moving air. It goes through a portcullis, a barred window or a crowd without slowing, and a weapon swung at it often finds nothing there.',
            roll: null,
          },
          {
            name: 'Heard Coming',
            text: 'It howls. The party always know it is on its way, which is the one concession this creature makes — they simply cannot do much with the warning.',
            roll: null,
          },
        ],
      },
      loot: ELEMENTAL_LOOT,
      notes: 'Loose on a ridgeline or in a broken tower, and it fights in three dimensions while the party fights in two. Use height: it does its best work above a party with no answer to something in the air.',
      blurb: 'Screaming wind that scatters a formation and cannot be cornered.',
    },

    {
      key: 'earth-elemental',
      name: 'Earth Elemental',
      creatureType: 'Elemental',
      size: 'large',
      alignment: 'Neutral',
      role: 'tank',
      tags: ['elemental', 'cave'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['cave', 'mountain'],
      combat: {
        maxHp: 120,
        armourClass: 18,
        attackBonus: 6,
        initiativeBonus: 0,
        passivePerception: 12,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 8 },
          { key: 'stealth', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Slam',
            damage: '2d6+3',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A fist of packed stone comes down slowly and lands anyway, because it has all day and the target has to keep moving.',
          },
          {
            name: 'Hurled Boulder',
            damage: '1d8+2',
            damageType: 'bludgeoning',
            range: '60/120 ft.',
            text: 'It pulls a lump of the floor out of the floor and throws it at whoever has stayed out of reach.',
          },
        ],
        abilities: [
          {
            name: 'Earth Glide',
            text: 'It sinks into rock and travels through it as easily as the party walk down a corridor, leaving no tunnel behind and no sign of where it went. It listens through the stone, then comes up under the character doing the talking.',
            roll: null,
          },
          {
            name: 'Breaks Buildings',
            text: 'Walls, doors, pillars and floors give way to it far faster than flesh does. It will happily go through the room rather than around it, and a DM should be ready for the roof.',
            roll: null,
          },
        ],
      },
      loot: ELEMENTAL_LOOT,
      notes: 'Bound to a place, usually by somebody long dead, and patient about it. It is slow and hits softly for its size, so the danger is that it cannot be avoided, outrun or shut out — it simply keeps arriving.',
      blurb: 'Walking bedrock that swims through stone and cannot be shut out.',
    },

    // Roles are aims rather than formulae, and the golem is the entry where the aim and
    // the fiction disagree. It is a `tank` because it is impossible to finish, not because
    // it is hard to hit — a stitched corpse is a large slow target — so the armour class
    // sits well below the row while the hit points sit well above it, and the tanking is
    // carried by an ability instead of a number.
    {
      key: 'flesh-golem',
      name: 'Flesh Golem',
      creatureType: 'Construct',
      size: 'medium',
      alignment: 'Neutral',
      role: 'tank',
      tags: ['construct'],
      cr: 5,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['ruins', 'urban'],
      combat: {
        maxHp: 150,
        armourClass: 13,
        attackBonus: 7,
        initiativeBonus: 0,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'athletics', bonus: 6 }],
        attacks: [
          {
            name: 'Slam',
            damage: '2d8+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'It puts a hand through someone the way a labourer puts a hand through rotten board. There is no technique in it at all.',
          },
          {
            name: 'Backhand',
            damage: '1d8+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'The other arm comes back across on the return, catching whoever stepped into the gap.',
          },
        ],
        abilities: [
          {
            name: 'Ordinary Weapons Barely Mark It',
            text: 'Swords and arrows open seams that do not bleed and do not slow it. Magic weapons, fire and acid work properly; a party with none of those should be encouraged to leave the room and think.',
            roll: null,
          },
          {
            name: 'Drinks Lightning',
            text: 'A lightning spell does it good. It straightens up, the stitches pull tight, and it comes back stronger than it was — so the wizard should be told what happened, once, before they do it again.',
            roll: '2d8',
          },
          {
            name: 'Berserk',
            text: 'Badly damaged, it stops obeying anyone, including its maker, and attacks the closest living thing without preference. If the maker is in the room this is the party\'s best moment; play it.',
            roll: null,
          },
        ],
      },
      loot: 'Surgeon\'s wire, a brass collar with a name filed off, and whatever its maker left on the bench.',
      notes: 'Somebody built this and somebody is probably still giving it orders. It is slow, stupid and nearly unkillable by ordinary means, so the interesting fight is against the person holding its leash.',
      blurb: 'Stitched corpse that shrugs off steel and grows stronger on lightning.',
    },

    {
      key: 'black-pudding',
      name: 'Black Pudding',
      creatureType: 'Ooze',
      size: 'large',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['ooze', 'cave'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['cave', 'ruins'],
      combat: {
        maxHp: 88,
        armourClass: 11,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 10,
        speed: 20,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 5 }],
        attacks: [
          {
            name: 'Pseudopod',
            damage: '2d8+3',
            damageType: 'acid',
            range: 'melee',
            text: 'A black limb rises out of it and lays itself across an arm or a face. What it touches goes on dissolving after it has let go.',
          },
          {
            name: 'Engulfing Slap',
            damage: '2d6+3',
            damageType: 'acid',
            range: 'melee',
            text: 'It heaves part of its bulk over someone standing too close. Mostly weight, and entirely acid.',
          },
        ],
        abilities: [
          {
            // A corrosive hide reads like a standing rule, and the roll on it is not one:
            // it is acid arriving on whoever swung. The rule against a *pace* scaling is
            // about regeneration, not about damage that happens to be passive.
            name: 'Corrosive Body',
            text: 'Every part of it eats. Hitting it with a weapon pits the blade, punching it costs a hand, and the floor under it is a shallow scar afterwards. A character who fights it barehanded regrets it for the rest of the dungeon.',
            roll: '1d8',
            scalesWithCr: true,
          },
          {
            name: 'Splits',
            text: 'Cut it and you have two smaller puddings, each still hungry and each still corrosive. Fire and cold are the only damage that does not multiply the problem — the party will work this out, and the working out is the encounter.',
            roll: null,
          },
          {
            name: 'Amorphous',
            text: 'It pours through a gap an inch wide and reforms on the other side, so it follows the party under a barred door and down a drain. Closing something behind you does not help.',
            roll: null,
          },
        ],
      },
      loot: 'Half-eaten coins, a belt buckle and the metal parts of somebody who came this way first.',
      notes: 'Has no mind and no plan: it drips off a ceiling onto the second person in the line and eats whatever is still there. Best used as a hazard in a corridor rather than a fight in a room, because a party that simply walks away has beaten it.',
      blurb: 'Mindless acid that ruins gear, splits when cut and follows under doors.',
    },

    {
      key: 'chuul',
      name: 'Chuul',
      creatureType: 'Aberration',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'controller',
      tags: ['aberration', 'swamp'],
      cr: 4,
      tier: 4,
      recommendedPartyLevelMin: TIER_IV_MIN,
      recommendedPartyLevelMax: TIER_IV_MAX,
      environmentTags: ['swamp', 'aquatic', 'ruins'],
      combat: {
        maxHp: 62,
        armourClass: 16,
        attackBonus: 6,
        initiativeBonus: 1,
        passivePerception: 14,
        speed: 30,
        saveDc: 14,
        skills: [
          { key: 'perception', bonus: 4 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Pincer',
            damage: '2d6+3',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A claw the size of a shield closes on an arm and drags its victim closer, in towards the mouth parts, whether they wanted to come or not.',
          },
        ],
        abilities: [
          {
            name: 'Tentacles',
            text: 'The fronds around its mouth work over anyone it has pulled in. A character who cannot resist them goes rigid and silent for a round or two, aware of everything and able to do nothing about any of it, while the chuul decides what to do with them.',
            roll: null,
          },
          {
            name: 'At Home in Water',
            text: 'It breathes water and air equally, and it hunts the shallows where a party in armour is at its worst. It will retreat into deep water and come back when the party have relaxed.',
            roll: null,
          },
          {
            name: 'Senses Magic',
            text: 'It smells enchantment the way a dog smells meat and goes straight for whoever is carrying the strongest magic item in the party. Something older than it wants that item, and it remembers being told so.',
            roll: null,
          },
        ],
      },
      loot: 'A silted cache of magical trinkets it has collected and never used, and a great many crab-picked bones.',
      notes: 'Guards a sunken ruin for a master it has not seen in an age, and takes prisoners rather than kills them. It goes for the party member with the best magic first, which makes it one of the few monsters at this tier with a target-selection quirk worth telegraphing.',
      blurb: 'Armoured lobster-thing that hauls victims in and leaves them helpless.',
    },

    // -----------------------------------------------------------------------
    // Tier V — challenge rating 6, the level 5 boss slot
    //
    // Six of the nine are `role: 'boss'` and sit near twice the CR 6 row on hit points
    // and half again on damage, which is what it takes to survive more than two rounds
    // against a level 5 party. The wyvern, the medusa and the cyclops are not solo
    // bosses and say so on their entries.
    // -----------------------------------------------------------------------

    {
      key: 'young-white-dragon',
      name: 'Young White Dragon',
      creatureType: 'Dragon',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'boss',
      tags: ['dragon', 'arctic', 'flying', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['arctic', 'mountain', 'cave'],
      combat: {
        maxHp: 255,
        armourClass: 18,
        attackBonus: 9,
        initiativeBonus: 3,
        passivePerception: 18,
        speed: YOUNG_DRAGON_SPEED,
        saveDc: 15,
        skills: [
          { key: 'perception', bonus: 8 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d10+5',
            damageType: 'piercing',
            range: 'melee',
            text: 'It takes a character across the shoulder and shakes once. The cold coming off its teeth does as much harm as the teeth.',
          },
          {
            name: 'Claw',
            damage: '2d6+5',
            damageType: 'slashing',
            range: 'melee',
            text: 'A foreleg pins and rakes in the same motion, opening armour along the seams.',
          },
          {
            name: 'Tail',
            damage: '2d6+5',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'The tail comes round behind it and catches whoever thought the back of a dragon was the safe end.',
          },
        ],
        abilities: [
          {
            // Breath weapons carry `scalesWithCr` without exception. This one averages
            // well over twice the CR 6 row's damage per round, so it *is* the dragon in
            // damage terms; frozen at CR 6 while the claws stepped down to CR 2, it would
            // end a level 2 party in one action and the stepper would be a trap.
            name: 'Cold Breath',
            text: 'It draws breath and empties a cone of killing cold down the room. Everything caught takes the damage, halved for anyone who gets clear in time, and it can do this again after a few rounds — so a party that spent the first breath badly must plan for the second.',
            roll: '10d8',
            scalesWithCr: true,
          },
          FRIGHTFUL_PRESENCE,
          {
            name: 'Ice Walk',
            text: 'Sheet ice, packed snow and a frozen lake are all the same footing to it, and it climbs a glacier face as though it were a staircase. The party will be picking their way across ground it crosses without a thought.',
            roll: null,
          },
        ],
      },
      loot: 'A frozen hoard: perhaps nine hundred gold in coin and plate, a sled\'s worth of furs, and two frost-cracked gemstones.',
      notes: 'The stupidest and most vicious of the dragons, and the least interested in talking. It fights in its own lair on ice it trusts and the party do not, breaks off to circle when hurt, and comes back the moment its breath has returned.',
      blurb: 'Boss dragon of the ice: brutal, wordless, and deadly on ground the party cannot stand on.',
    },

    {
      key: 'young-black-dragon',
      name: 'Young Black Dragon',
      creatureType: 'Dragon',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'boss',
      tags: ['dragon', 'swamp', 'flying', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['swamp', 'ruins'],
      combat: {
        maxHp: 245,
        armourClass: 18,
        attackBonus: 9,
        initiativeBonus: 4,
        passivePerception: 18,
        speed: YOUNG_DRAGON_SPEED,
        saveDc: 15,
        skills: [
          { key: 'perception', bonus: 8 },
          { key: 'stealth', bonus: 6 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d10+4',
            damageType: 'piercing',
            range: 'melee',
            text: 'Teeth and a wash of acid together, so the wound keeps opening after the jaws have let go.',
          },
          {
            name: 'Claw',
            damage: '2d6+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'It hooks a claw into a shield and pulls it aside, then does the obvious thing about the gap.',
          },
          {
            name: 'Tail',
            damage: '2d8+4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A whip of muscle out of the water behind it, aimed at the character standing in the shallowest place.',
          },
        ],
        abilities: [
          {
            name: 'Acid Breath',
            text: 'A line of acid, spat rather than exhaled, that goes the length of a hall and through anyone standing in it. Getting clear halves it; nothing avoids it entirely at close range, and it recharges after a few rounds.',
            roll: '11d8',
            scalesWithCr: true,
          },
          FRIGHTFUL_PRESENCE,
          {
            name: 'Fights From the Water',
            text: 'It breathes water as easily as air and spends the fight mostly submerged, showing an eye and a nostril. The party get one round of it in the open for every two of it under the surface, unless they can drain the place or make it come out.',
            roll: null,
          },
        ],
      },
      loot: 'A hoard silted into a drowned temple: around a thousand gold, a corroded crown, and letters somebody paid a great deal to have lost.',
      notes: 'Cruel and patient, and it enjoys the part where the party realise they are in its water. It will pick off a straggler, retreat, and let them wonder for an hour — a black dragon fight is three short fights rather than one long one.',
      blurb: 'Boss dragon of the swamp: ambushes from the water and spits acid down a corridor.',
    },

    {
      key: 'young-green-dragon',
      name: 'Young Green Dragon',
      creatureType: 'Dragon',
      size: 'large',
      alignment: 'Lawful Evil',
      role: 'boss',
      tags: ['dragon', 'forest', 'flying', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['forest', 'ruins'],
      combat: {
        maxHp: 250,
        armourClass: 19,
        attackBonus: 9,
        initiativeBonus: 3,
        passivePerception: 19,
        speed: YOUNG_DRAGON_SPEED,
        saveDc: 16,
        skills: [
          { key: 'perception', bonus: 9 },
          { key: 'deception', bonus: 6 },
          { key: 'persuasion', bonus: 6 },
          { key: 'stealth', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d10+5',
            damageType: 'piercing',
            range: 'melee',
            text: 'The jaws close and the poison in its mouth goes to work immediately, so the bite is worse an hour later than it was at the time.',
          },
          {
            name: 'Claw',
            damage: '2d6+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'It steps in with all the weight on one foreleg and opens somebody up almost politely.',
          },
          {
            name: 'Tail',
            damage: '2d8+3',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A backhanded sweep through the undergrowth that catches whoever is trying to circle behind it.',
          },
        ],
        abilities: [
          {
            name: 'Poison Breath',
            text: 'A rolling cloud of stinging green gas that fills the clearing and does not clear quickly. Everyone in it takes the damage, halved for those who hold their breath and get out, and it will do this again in a few rounds.',
            roll: '12d6',
            scalesWithCr: true,
          },
          FRIGHTFUL_PRESENCE,
          {
            name: 'Honeyed Words',
            text: 'It talks. It will offer a deal, name a rival, praise the paladin\'s armour and ask, sweetly, what the party actually want — and it means none of it. Let it negotiate: a green dragon that learns what a character wants has found the weapon it prefers.',
            roll: null,
          },
        ],
      },
      loot: 'A hoard of about twelve hundred gold, an emerald the size of a plum, and a signed agreement nobody should honour.',
      notes: 'The schemer of the three, and the only one that would rather the party worked for it than died. It fights in its own forest with the canopy between it and the archers, and it lies fluently right up to the first round of combat and afterwards too.',
      blurb: 'Boss dragon of the deep wood: a liar with a poison cloud and a plan for the party.',
    },

    {
      key: 'chimera',
      name: 'Chimera',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'boss',
      tags: ['monstrosity', 'flying', 'mountain', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['mountain', 'cave'],
      combat: {
        maxHp: 240,
        armourClass: 17,
        attackBonus: 8,
        initiativeBonus: 1,
        passivePerception: 18,
        speed: 60,
        saveDc: 15,
        skills: [{ key: 'perception', bonus: 8 }],
        attacks: [
          {
            name: 'Bite',
            damage: '2d8+5',
            damageType: 'piercing',
            range: 'melee',
            text: 'The lion\'s head takes someone by the leg and does not let go while the other two heads work.',
          },
          {
            name: 'Horns',
            damage: '2d6+5',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'The goat\'s head comes in low and drives its horns into whoever is bracing against the lion.',
          },
          {
            name: 'Claws',
            damage: '2d6+5',
            damageType: 'slashing',
            range: 'melee',
            text: 'Both forelegs rake at once while it holds a character down with its weight.',
          },
        ],
        abilities: [
          {
            // Over the CR 6 row's damage per round, so the flag is mandatory — and it is
            // the same case as a dragon's, which is why the wording matches.
            name: 'Fire Breath',
            text: 'The dragon\'s head opens and a gout of fire goes down whatever line the party have formed. Anyone caught takes the damage, halved for getting clear, and it comes back in a few rounds.',
            roll: '7d8',
            scalesWithCr: true,
          },
          {
            name: 'Battering Charge',
            text: 'It gets a run at somebody and puts all three heads and both forelegs into the arrival, driving them back into whatever was behind them.',
            roll: '2d10+3',
            scalesWithCr: true,
          },
          {
            name: 'Three Minds',
            text: 'Three heads facing three ways, and none of them trusts the others. Nothing sneaks up on a chimera, and nothing distracts all of it at once — but the three rarely coordinate, so it wastes a turn now and again arguing with itself.',
            roll: null,
          },
        ],
      },
      loot: 'A cliff-ledge nest of bones, a shepherd\'s bell, and about three hundred gold in shiny things it liked.',
      notes: 'Nests high, hunts what it can carry, and comes down out of the sun. It is greedy and short-tempered rather than clever, and a party who offer it easier food than themselves can genuinely buy an hour.',
      blurb: 'Three-headed boss monster with a lion, a goat and a mouthful of fire.',
    },

    {
      key: 'hydra',
      name: 'Hydra',
      creatureType: 'Monstrosity',
      size: 'huge',
      alignment: 'Unaligned',
      role: 'boss',
      tags: ['monstrosity', 'aquatic', 'swamp', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['swamp', 'aquatic'],
      combat: {
        maxHp: 260,
        armourClass: 15,
        attackBonus: 8,
        initiativeBonus: 4,
        passivePerception: 16,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'perception', bonus: 8 },
          { key: 'athletics', bonus: 8 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d10+5',
            damageType: 'piercing',
            range: 'melee',
            text: 'One head strikes out on a long neck, takes a character somewhere painful and pulls back out of reach.',
          },
          {
            name: 'Snapping Bite',
            damage: '2d8+4',
            damageType: 'piercing',
            range: 'melee',
            text: 'A second head answers from an angle nobody was watching, because there is always a head nobody was watching.',
          },
          {
            name: 'Tail Sweep',
            damage: '2d6+4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'The tail comes through the whole line at once, aimed at everyone standing in the shallows in front of it.',
          },
        ],
        abilities: [
          {
            // Every head at once averages far above the CR 6 row, so it is a payload and
            // takes the flag for the same reason a breath weapon does. Compare Heads Grow
            // Back below, which is a pace and takes nothing.
            name: 'Every Head at Once',
            text: 'Once in a while every neck strikes in the same instant and the party are bitten from five directions. Split the damage between however many characters are in reach, or put all of it into one and end them — the DM chooses, and choosing one is what makes a hydra frightening.',
            roll: '8d8+8',
            scalesWithCr: true,
          },
          {
            // A pace, not a payload, and it has no roll to scale in any case. This is the
            // troll's Regeneration wearing a different hat: the die that matters is the
            // one that stops it, and cauterising is a decision rather than a number.
            name: 'Heads Grow Back',
            text: 'Cut a head off and two grow where it was by the end of the round, and it bites more often for it. Fire or acid on the stump stops that, so the party need somebody willing to spend their turn burning a neck instead of doing damage — which is the whole puzzle of the encounter.',
            roll: null,
          },
          {
            name: 'Too Many Eyes',
            text: 'It cannot be surprised and it cannot be flanked: some head is always looking at the character who thought they were behind it.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing it owns. In the silt around its pool: rusted mail, a boat\'s brass fittings, and roughly two hundred gold that has been there some time.',
      notes: 'Sits in one pool for decades and eats whatever comes to drink. It never pursues far from water, so a party who withdraw are safe — and a party who keep hacking heads off without burning them are in an encounter that gets worse every round.',
      blurb: 'Many-headed boss that grows two heads for every one the party cut off.',
    },

    // Not a solo boss, and deliberately so — the wyvern is the Tier V entry a DM uses in a
    // pair, or with a rider on its back, which is why it sits nearer its row than the six
    // bosses do. Its threat is the sting rather than the hit points.
    {
      key: 'wyvern',
      name: 'Wyvern',
      creatureType: 'Dragon',
      size: 'large',
      alignment: 'Unaligned',
      role: 'skirmisher',
      tags: ['dragon', 'flying', 'mountain', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['mountain', 'cave'],
      combat: {
        maxHp: 130,
        armourClass: 17,
        attackBonus: 8,
        initiativeBonus: 5,
        passivePerception: 16,
        speed: 80,
        saveDc: 15,
        skills: [
          { key: 'perception', bonus: 6 },
          { key: 'stealth', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Bite',
            damage: '2d6+4',
            damageType: 'piercing',
            range: 'melee',
            text: 'It snaps on the way past rather than settling in to fight, and is out of reach again before anyone answers.',
          },
          {
            name: 'Claws',
            damage: '2d6+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'Both hind claws rake down a character\'s back as it goes over them.',
          },
          {
            name: 'Sting',
            damage: '1d6+4',
            damageType: 'piercing',
            range: 'melee',
            text: 'The tail whips over its own shoulder and puts the barb in. The wound itself is nothing much, which is the point.',
          },
        ],
        abilities: [
          {
            // The venom is the wyvern's actual output — the sting that delivers it does
            // almost no damage on its own — so it averages above the CR 6 row and must
            // carry the flag. A CR 2 wyvern whose venom still did CR 6 damage would read
            // as a manageable flying beast and kill somebody outright.
            name: 'Venom',
            text: 'Whatever the barb went into, the poison follows. A character who cannot fight it off takes serious harm a moment later, and a character already hurt should be told this may be what finishes them. It is the reason a wyvern is dangerous at all.',
            roll: '8d6',
            scalesWithCr: true,
          },
          {
            name: 'Snatch and Climb',
            text: 'It closes its claws on somebody light, beats hard for height, and opens them. Anyone dropped from that far takes the fall badly, and the party get a round of watching it happen.',
            roll: '2d10',
            scalesWithCr: true,
          },
          {
            name: 'Dim and Single-Minded',
            text: 'It is an animal with a temper. It picks the target that hurt it most recently and keeps going back to them, which a party can use — and it never fights on when there is easier food nearby.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing carried. Its ledge holds cracked bones, a saddle somebody fitted and regretted, and a scatter of coin from a previous meal.',
      notes: 'Hunts from height and never lands if it can avoid it, so a party with no ranged answer will spend the fight being harassed. Some hobgoblin and orc chiefs keep one; a saddled wyvern is a very different encounter from a wild one.',
      blurb: 'Flying hunter whose sting carries venom bad enough to kill outright.',
    },

    // A `controller` rather than a boss, and the numbers say so: her hit points are just
    // above the row and her damage well below it. What makes her a Tier V encounter is the
    // gaze, which no amount of hit points would substitute for. Give her guards.
    {
      key: 'medusa',
      name: 'Medusa',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'controller',
      tags: ['monstrosity', 'ruins', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['ruins', 'cave'],
      combat: {
        maxHp: 140,
        armourClass: 16,
        attackBonus: 8,
        initiativeBonus: 4,
        passivePerception: 16,
        speed: 30,
        saveDc: 16,
        skills: [
          { key: 'perception', bonus: 6 },
          { key: 'deception', bonus: 6 },
          { key: 'stealth', bonus: 6 },
          { key: 'insight', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Snake Hair',
            damage: '2d6+3',
            damageType: 'piercing',
            range: 'melee',
            text: 'The serpents on her head strike on their own account at anyone who comes within arm\'s length of her, several at once and from odd angles.',
          },
          {
            name: 'Longbow',
            damage: '1d8+3',
            damageType: 'piercing',
            range: '150/600 ft.',
            text: 'She shoots calmly from the far end of her hall, because she would much rather the party came to her.',
          },
        ],
        abilities: [
          {
            // No roll, so rule 13 has nothing to measure and the flag would be
            // meaningless — but note that this is still the creature's main output in
            // every sense that matters at the table. A DM should read the gaze as the
            // encounter and the arrows as scenery.
            name: 'Petrifying Gaze',
            text: 'Anyone who meets her eyes feels themselves starting to set — fingers first, then the arm. Hold your nerve and it passes; fail twice and that character is a statue, and getting them back needs magic the party will have to go and find. Fighting her with eyes averted costs the party accuracy every round, and she will do everything she can to be looked at.',
            roll: null,
          },
          {
            // Poison that both hurts and hinders, resolved towards the damage: the roll is
            // what the venom takes off a character, and the weakening is the words around
            // it. Where the two readings compete, the payload one wins.
            name: 'Snake Venom',
            text: 'Her hair carries poison as well as fangs, so a character she has reached goes on weakening after they have stepped back out of range.',
            roll: '4d6',
            scalesWithCr: true,
          },
          {
            name: 'A Hall of Statues',
            text: 'Her lair is full of figures in mid-gesture: an adventurer with a raised shield, a merchant shielding his face. Every one of them was a person, and describing three of them before she appears is worth more than any warning the DM could give.',
            roll: null,
          },
        ],
      },
      loot: 'What her statues were carrying when she caught them: two good swords, a ring of keys, and perhaps six hundred gold between them.',
      notes: 'Was a person once, remembers it, and hates being seen while wanting to be looked at. She fights in her own hall behind mirrors and lamplight, and she talks from the shadows first — a party who never see her have not yet lost anybody.',
      blurb: 'Her stare ends a character\'s fight permanently; the arrows are an afterthought.',
    },

    // A `brute` rather than a boss, and the low attack bonus is not a typo — a cyclops
    // misjudges distance, which is exactly what its role wants: enormous damage that a
    // party can play around. It pairs with a Tier IV creature or two rather than fighting
    // alone.
    {
      key: 'cyclops',
      name: 'Cyclops',
      creatureType: 'Giant',
      size: 'huge',
      alignment: 'Chaotic Neutral',
      role: 'brute',
      tags: ['giant', 'mountain', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['mountain', 'cave'],
      combat: {
        maxHp: 150,
        armourClass: 14,
        attackBonus: 6,
        initiativeBonus: 1,
        passivePerception: 12,
        speed: 30,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 9 },
          { key: 'intimidation', bonus: 6 },
        ],
        attacks: [
          {
            name: 'Greatclub',
            damage: '3d8+5',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A tree with the branches taken off, brought down two-handed. Anything it lands on properly is finished, armour or not.',
          },
          {
            name: 'Thrown Rock',
            damage: '2d10+5',
            damageType: 'bludgeoning',
            range: '60/240 ft.',
            text: 'It hefts a boulder off the scree and throws it the length of a valley at whoever is out of club range.',
          },
        ],
        abilities: [
          {
            name: 'Poor Depth Perception',
            text: 'One eye and no judgement of distance. Anything it throws goes wide more often than it should, and it consistently misjudges the last step before a swing — which is the only reason a level 5 party survive being hit by that club.',
            roll: null,
          },
          {
            name: 'Brings Down the Ceiling',
            text: 'Cornered indoors, it hits a pillar instead of a person. Rubble comes down across whatever part of the room it chose, burying anyone standing there and cutting the party in half for the rest of the fight.',
            roll: '4d10',
            scalesWithCr: true,
          },
          {
            name: 'One Fixation',
            text: 'It settles on one character early — usually whoever insulted it or whoever it has eaten something like before — and will not be talked out of them. Everyone else is scenery until that one is down.',
            roll: null,
          },
        ],
      },
      loot: 'A herdsman\'s hoard: three hundred gold in old coin, a bronze cauldron, and a great deal of cheese.',
      notes: 'Keeps goats on a mountainside, resents visitors, and eats them by preference rather than principle. It can be bargained with by anyone willing to be very patient and very loud, and it will honour a bargain it understood.',
      blurb: 'One-eyed giant that throws boulders, misses often and flattens what it hits.',
    },

    {
      key: 'wraith',
      name: 'Wraith',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'boss',
      tags: ['undead', 'ruins', 'boss'],
      cr: 6,
      tier: 5,
      recommendedPartyLevelMin: TIER_V_LEVEL,
      recommendedPartyLevelMax: TIER_V_LEVEL,
      environmentTags: ['ruins', 'cave', 'urban'],
      combat: {
        maxHp: 200,
        armourClass: 17,
        attackBonus: 9,
        initiativeBonus: 6,
        passivePerception: 15,
        speed: 60,
        saveDc: 15,
        skills: [
          { key: 'stealth', bonus: 8 },
          { key: 'intimidation', bonus: 7 },
          { key: 'perception', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Life Drain',
            damage: '4d8+4',
            damageType: 'necrotic',
            range: 'melee',
            text: 'A hand of cold nothing closes on a character\'s chest and something of them goes into it. They come away older, thinner and harder to heal than they were.',
          },
          {
            name: 'Shadow Reach',
            damage: '2d8+4',
            damageType: 'necrotic',
            range: 'melee',
            text: 'Its cloak lengthens across the floor and takes a second character on the way, without the wraith appearing to move at all.',
          },
        ],
        abilities: [
          {
            // Above the CR 6 row, so the flag is mandatory. Contrast Passes Through Walls
            // in the same block, which is a standing rule and takes nothing.
            name: 'Soul Harvest',
            text: 'It spreads out into a spill of darkness that covers the room and takes something from everyone in it at once. This is the round a wraith fight is decided in, and a party who let it happen twice are unlikely to finish the fight.',
            roll: '6d8',
            scalesWithCr: true,
          },
          {
            name: 'Makes More of Itself',
            text: 'Anything it kills does not stay dead. The corpse gets up as a lesser shadow under its command within a minute, so a long fight means fighting the party\'s own casualties.',
            roll: null,
          },
          PASSES_THROUGH_WALLS,
        ],
      },
      loot: 'Nothing on it. The tomb it will not leave holds a black iron circlet, a sealed casket and roughly eight hundred gold in grave goods.',
      notes: 'Was somebody who chose this, which is what separates it from a ghost — there is no unfinished business to settle and no bargain to strike. Sunlight weakens it badly, so it will not follow a party out of the ruin, and that is the only mercy in the encounter.',
      blurb: 'Boss undead that drains the whole party at once and raises what it kills.',
    },
  ],
}
