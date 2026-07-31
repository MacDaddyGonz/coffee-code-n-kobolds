// Tier III monsters — twenty-two creatures at CR 2 and CR 3, for a party of level 2 to 3.
//
// This is the tier a DM reaches for most often, because a game played a few times a year
// spends most of its life at levels 2 and 3. So the entries here are chosen to play
// *differently* from one another rather than to fill a list: a wall of acid that cannot be
// fought so much as got past, a monster that threatens the party's gear instead of their
// hit points, a lizard that removes a character rather than killing one, and two bosses
// that are a whole encounter on their own.
//
// **Editing an entry here changes every creature in every game that already links to it.**
// The corpus is *linked*, not copied — a character document stores the entry's `key` and
// the resolver reads these numbers every time the sheet is opened. That is the opposite of
// how lib/rules.ts behaves, where a catalogue entry is copied onto a character at the
// moment it is added and later edits never reach it, and the difference is invisible from
// inside either file. So a tweak to the Ogre's club retunes every ogre ever placed, and a
// change to a `key` orphans them.
//
// How the numbers were balanced: every value is a deliberate *deviation* from the
// creature's own CR benchmark row, in the direction its `role` asks for — a brute above the
// row on damage and below it on armour class, a tank the reverse, a boss well above on both
// hit points and damage. The deviation is the point: the CR scaler carries it across when a
// DM steps a creature up or down, so a creature written exactly on its row scales into an
// average nothing. Where an entry departs from its role's shape on purpose (the Gelatinous
// Cube's armour class, the Ankylosaurus tanking on hit points alone) there is a comment
// saying so.
//
// Two constraints a future editor will otherwise trip over:
//
//   * **No dice notation and no to-hit numbers in any prose.** A CR shift changes the
//     numbers and cannot change the words, so "for two dice of fire" would go stale the
//     first time somebody used the stepper. Say what an attack does; the `damage` field
//     says what it rolls.
//   * **D&D Lite excludes the movement-impairing conditions** (see docs/requirements.md),
//     and this tier is full of creatures that are natural to describe with them — an
//     engulfing cube, a sticky mimic, a charging minotaur, a harpoon on a rope. Every one
//     of them is written around the excluded vocabulary instead: "stuck fast", "drags them
//     towards the water", "force their way clear". Check the exclusion list before
//     rewording an ability here.

import type { BestiaryAbility, BestiaryFile } from './types'

/** CR 2 sits squarely in front of a level 2–3 party. Spread into every CR 2 entry. */
const LEVELS_2_3 = { recommendedPartyLevelMin: 2, recommendedPartyLevelMax: 3 }

/** CR 3 is the top of this tier, so it is a fair fight at 3 and a fair fight at 4. */
const LEVELS_3_4 = { recommendedPartyLevelMin: 3, recommendedPartyLevelMax: 4 }

/**
 * Written once and shared, because two descriptions of the same weakness is exactly the
 * drift this project avoids — and a DM who has read it on one undead should recognise the
 * wording on the next.
 */
const SUNLIGHT_SENSITIVITY: BestiaryAbility = {
  name: 'Sunlight Sensitivity',
  text: 'In direct sunlight it fights badly and hates every moment of it: everything it swings at and everything it has to look at goes against it. It will not come out by day if it has any choice.',
  roll: null,
}

export const MONSTERS_MID: BestiaryFile = {
  category: 'monster',
  entries: [
    // -----------------------------------------------------------------------
    // CR 2
    // -----------------------------------------------------------------------
    {
      key: 'ogre',
      name: 'Ogre',
      creatureType: 'Giant',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['giant', 'cave', 'forest', 'mountain'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave', 'forest', 'mountain'],
      combat: {
        maxHp: 47,
        armourClass: 12,
        attackBonus: 4,
        initiativeBonus: -1,
        passivePerception: 11,
        speed: 40,
        saveDc: null,
        skills: [{ key: 'athletics', bonus: 6 }],
        attacks: [
          {
            name: 'Greatclub',
            damage: '2d8+4',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A tree-length club brought down in a flat arc. It is slow enough to see coming and heavy enough that seeing it coming barely helps.',
          },
          {
            name: 'Thrown Rock',
            damage: '1d8+2',
            damageType: 'bludgeoning',
            range: '30/120 ft.',
            text: 'The ogre picks up whatever is nearest — a boulder, a barrel, a cart wheel — and throws it at somebody out of reach.',
          },
        ],
        abilities: [
          {
            name: 'Long Reach',
            text: 'Its arms cover more ground than they look like they should, so anyone who thinks they are standing one step clear of it is not.',
            roll: null,
          },
          {
            name: 'Simple Grudge',
            text: 'It goes after whoever last hurt it and keeps going after them, however bad an idea that has become. A party that works this out can steer an ogre around a room.',
            roll: null,
          },
        ],
      },
      loot: 'A sack of spoiling meat, forty-odd copper coins and a bent silver candlestick it likes the shine of.',
      notes: 'Ogres camp near roads and eat what walks down them. One will fight anything it can reach and throw things at anything it cannot, and it never thinks about the fight it is in — only about the last thing that hurt it.',
      blurb: 'Enormous, stupid and lethal — one club swing can end a starting character.',
    },
    {
      key: 'ankheg',
      name: 'Ankheg',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['monstrosity', 'cave', 'forest', 'desert'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave', 'forest', 'desert'],
      combat: {
        maxHp: 45,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: 30,
        saveDc: 13,
        skills: [{ key: 'stealth', bonus: 5 }],
        attacks: [
          {
            name: 'Bite',
            damage: '2d8+4',
            damageType: 'slashing and acid',
            range: 'melee',
            text: 'Mandibles close around a limb and grind. The wound is scalded as well as torn — there is acid in its mouth.',
          },
        ],
        abilities: [
          {
            // The spray is a bigger payload than the whole CR 2 damage budget, so it opts
            // into scaling. Scaled down without the flag, an ankheg would still delete a
            // level 1 party with one spit.
            name: 'Acid Spray',
            text: 'Once every few rounds it rears up and spits a jet of acid in a long line. Everything caught takes the damage, halved on a successful Dexterity saving throw.',
            roll: '3d6',
            scalesWithCr: true,
          },
          {
            name: 'Comes Up Through the Floor',
            text: 'It tunnels under loose earth and arrives in the middle of the party. Its first round is spent surfacing, and nobody else gets to pick where that happens.',
            roll: null,
          },
        ],
      },
      loot: 'Whatever it swallowed and could not digest: belt buckles, a copper ring, three arrowheads.',
      notes: 'Hunts by feeling the ground shake, so a party holding still is a party it loses track of. It would rather drag one kill back down its tunnel than finish the fight, which is often the moment everyone else gets away.',
      blurb: 'Burrowing horror that erupts underfoot and spits acid in a line.',
    },
    {
      key: 'mimic',
      name: 'Mimic',
      creatureType: 'Monstrosity (shapechanger)',
      size: 'medium',
      alignment: 'Neutral',
      role: 'controller',
      tags: ['monstrosity', 'ruins', 'cave', 'urban'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['ruins', 'cave', 'urban'],
      combat: {
        maxHp: 40,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: 15,
        saveDc: 13,
        skills: [{ key: 'stealth', bonus: 8 }],
        attacks: [
          {
            name: 'Pseudopod',
            damage: '1d8+3',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A limb of entirely the wrong texture comes off what you thought was furniture, and hits you with the rest of the furniture.',
          },
        ],
        abilities: [
          {
            name: 'False Appearance',
            text: 'Motionless it is a chest, a door, a table — indistinguishable from the real thing until somebody touches it or it decides to move.',
            roll: null,
          },
          {
            name: 'Adhesive',
            text: 'Its surface holds fast to whatever touches it, weapons included. Pulling free takes a deliberate heave and a Strength check, and a sword left behind is a sword the mimic is still holding.',
            roll: null,
          },
          {
            // Read as a payload rather than as a pace, and the reading is arguable: it
            // ticks every round like a troll's regeneration does. The difference is where
            // the number lands — this one arrives on a character, so a mimic stepped up
            // whose skin still burned for its old figure would be a mis-rated mimic.
            name: 'Acid Skin',
            text: 'Bare skin against it burns. Anyone stuck to the mimic takes this at the end of each of their turns.',
            roll: '1d8',
            scalesWithCr: true,
          },
        ],
      },
      loot: 'The coins of everyone who has ever opened it, still inside: about sixty gold, and a key nobody can place.',
      notes: 'A mimic wants an ambush rather than a fight. It picks the room where treasure ought to be, waits for a hand to reach out, and then holds on to that person so the rest of the party has to come and get them.',
      blurb: 'The chest is the monster. Grabs the first person to touch it and holds on.',
    },
    {
      key: 'gelatinous-cube',
      name: 'Gelatinous Cube',
      creatureType: 'Ooze',
      size: 'large',
      alignment: 'Unaligned',
      role: 'tank',
      tags: ['ooze', 'cave', 'ruins'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave', 'ruins'],
      combat: {
        // A deliberate inversion of the tank shape: the armour class sits *below* its row
        // rather than above it, because a cube is the easiest thing in this file to hit and
        // still the slowest to kill. It tanks with the hit points and nothing else, and the
        // scaler carries that same lopsidedness upward, which is correct — a bigger cube is
        // a bigger sack of acid, not a nimbler one.
        maxHp: 58,
        armourClass: 11,
        attackBonus: 4,
        initiativeBonus: -1,
        passivePerception: 10,
        speed: 15,
        saveDc: 13,
        skills: [],
        attacks: [
          {
            name: 'Engulfing Surge',
            damage: '2d6',
            damageType: 'acid',
            range: 'melee',
            text: 'The cube pushes forward and its leading face goes through whoever was standing there. It is acid all the way to the middle.',
          },
        ],
        abilities: [
          {
            name: 'Almost Invisible',
            text: 'It is clear glass in dim light and makes no sound at all. Most parties find one by walking into it, and the first anybody knows is that the person at the front is inside it.',
            roll: null,
          },
          {
            // Same reasoning as the ankheg's spray: this is the cube's real output, so it
            // has to move when the creature does.
            name: 'Engulf',
            text: 'Anyone it touches is drawn inside and takes this at the end of each of their turns until they force their way clear with a Strength check. A friend hauling from the outside works just as well.',
            roll: '3d6',
            scalesWithCr: true,
          },
          {
            name: 'Nothing Left But Metal',
            text: 'Everything organic inside it is gone within the hour. Coins, blades and armour are not, which is why a cube is usually visible as a slow cloud of somebody else\'s belongings.',
            roll: null,
          },
        ],
      },
      loot: 'Suspended inside it: two hundred gold, a shortsword and a set of keys still on the ring.',
      notes: 'It fills a corridor and comes down it, and that is the whole encounter — the question is never how to kill it but whether the party can get past it. It has no tactics and no idea it is in a fight.',
      blurb: 'A corridor-filling wall of acid you cannot see until you are inside it.',
    },
    {
      key: 'rust-monster',
      name: 'Rust Monster',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'controller',
      tags: ['monstrosity', 'cave', 'ruins'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave', 'ruins'],
      combat: {
        // The one creature in the file whose threat is not measured in hit points at all,
        // which is why the damage sits at the bottom of the controller band. What it takes
        // off the party is their equipment, and a scaled-up one takes more of it.
        maxHp: 34,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 1,
        passivePerception: 11,
        speed: 40,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 3 }],
        attacks: [
          {
            name: 'Bite',
            damage: '1d8+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'It bites, and it would much rather bite the armour than the person wearing it.',
          },
        ],
        abilities: [
          {
            name: 'Iron Scent',
            text: 'It smells worked metal through a stone wall and will cross a room full of enemies to reach a suit of plate.',
            roll: null,
          },
          {
            name: 'Rusting Antennae',
            text: 'A brush of its feelers turns metal to red flakes. The DM ruins one weapon or one piece of armour per touch — drop the wearer\'s armour class by one for each piece gone. A wooden club is untouched, which is the joke.',
            roll: null,
          },
          {
            name: 'Eats the Ruin',
            text: 'It stops fighting to eat what it has ruined, so throwing it a spare dagger buys the party a round. Very often that is the right answer.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing it has not already eaten. A nest of rust flakes and one uneaten iron spike.',
      notes: 'The oldest and largest of its kind, about the size of a pony. It is not trying to kill anybody — it is hungry, and the party is wearing dinner. Fighting it with a good sword is how a party stops having a good sword.',
      blurb: 'Eats metal. Threatens the party\'s gear rather than their hit points.',
    },
    {
      key: 'grick',
      name: 'Grick',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Neutral',
      role: 'skirmisher',
      tags: ['monstrosity', 'cave'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave'],
      combat: {
        maxHp: 31,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 6 }],
        attacks: [
          {
            name: 'Tentacles',
            damage: '1d8+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'Four barbed arms come down off the ceiling at once and rake whoever is underneath them.',
          },
          {
            name: 'Beak',
            damage: '1d6+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'A hard beak in the middle of the tentacles, used on whatever the arms have already caught hold of.',
          },
        ],
        abilities: [
          {
            name: 'Stone Camouflage',
            text: 'Coiled against rock it is a fold in the wall. It does not have to do anything clever — it only has to hold still.',
            roll: null,
          },
          {
            name: 'Drops From Above',
            text: 'It waits on cave ceilings and lets the front of the party walk underneath before it comes down on the back of the line.',
            roll: null,
          },
        ],
      },
      loot: 'The picked-over remains of two earlier meals: a bone-handled knife and eleven silver.',
      notes: 'Fights from the dark and leaves the moment the fight turns, dragging a kill with it if it can. Light is the counter — seen coming, a grick is far less dangerous than it wants to be.',
      blurb: 'Ceiling ambusher that drops on the back of the party and is gone again.',
    },
    {
      key: 'merrow',
      name: 'Merrow',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'archer',
      tags: ['monstrosity', 'aquatic', 'swamp'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['aquatic', 'swamp'],
      combat: {
        maxHp: 30,
        armourClass: 13,
        attackBonus: 6,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: 20,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Harpoon',
            damage: '2d6+4',
            damageType: 'piercing',
            range: '30/60 ft.',
            text: 'A barbed iron harpoon on a rope, thrown hard from the shallows. It goes in easily and does not come out the same way.',
          },
        ],
        abilities: [
          {
            name: 'Hauls It In',
            text: 'There is a rope on the harpoon and the merrow is stronger than you are. It drags whoever it hit a few feet towards deep water each round, against a Strength check to hold ground.',
            roll: null,
          },
          {
            name: 'Belongs in the Water',
            text: 'It moves through water far more easily than over land and will not chase anybody far from the shore. Fighting one on dry ground is fighting it at its worst.',
            roll: null,
          },
        ],
      },
      loot: 'A coil of wet rope, a spare harpoon head and a pearl it has not decided what to do with.',
      notes: 'Merrow hunt from below at the edge of deep water: harpoon the nearest person, then pull. The danger is never really the wound — it is where the wound is taking them.',
      blurb: 'Aquatic raider that harpoons somebody from the shallows and hauls them in.',
    },
    {
      key: 'nothic',
      name: 'Nothic',
      creatureType: 'Aberration',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'spellcaster',
      tags: ['aberration', 'cave', 'ruins'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave', 'ruins'],
      combat: {
        maxHp: 28,
        armourClass: 13,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 30,
        saveDc: 13,
        skills: [
          { key: 'insight', bonus: 4 },
          { key: 'stealth', bonus: 5 },
          { key: 'arcana', bonus: 3 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Claws',
            damage: '1d6+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'Two long arms and a great many nails, thrown out from a crouch.',
          },
          {
            name: 'Rotting Gaze',
            damage: '2d6',
            damageType: 'necrotic',
            range: '30 ft.',
            text: 'It fixes its one eye on somebody and the flesh under their clothes starts to go bad. A Constitution saving throw shrugs it off.',
          },
        ],
        abilities: [
          {
            name: 'Weird Insight',
            text: 'It looks at somebody and knows a thing they have never told anyone, then says it out loud in front of the party. A nothic bargains with what it learns before it fights, and quite often that is the whole encounter.',
            roll: null,
          },
          {
            name: 'Sees Better in the Dark',
            text: 'Its eye works best with no light at all, so snuffing the torches helps it rather than the party.',
            roll: null,
          },
        ],
      },
      loot: 'A hoard of things it has traded for rather than taken: four gold rings, a bundle of letters and a child\'s shoe.',
      notes: 'A wizard who went looking for something and came back as this. It hoards secrets instead of treasure and will talk before it kills if the party has anything to tell it. Reach for it when the party needs unnerving rather than injuring.',
      blurb: 'One-eyed horror that trades in secrets and rots flesh with a look.',
    },
    {
      key: 'myconid-sovereign',
      name: 'Myconid Sovereign',
      creatureType: 'Plant',
      size: 'large',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['plant', 'cave'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['cave'],
      combat: {
        maxHp: 32,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: 20,
        saveDc: 13,
        skills: [
          { key: 'perception', bonus: 3 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Fist',
            damage: '1d8+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A slow, heavy swing from a stalk thicker than a man\'s leg. It does not want to be doing this.',
          },
        ],
        abilities: [
          {
            name: 'Animating Spores',
            text: 'It breathes a cloud over a fresh body and the body gets up and fights for the colony. One servant at a time, and it lasts the day — including, pointedly, anyone the party has just lost.',
            roll: null,
          },
          {
            name: 'Distress Spores',
            text: 'Hurt it and every myconid within a few hundred feet knows precisely where the fight is. Run this as the rest of the colony arriving in two or three rounds.',
            roll: null,
          },
          {
            name: 'Hallucination Spores',
            text: 'A cloud that makes its victim see things nobody else can. On a failed Wisdom saving throw they spend the fight swinging at something that is not there.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing it carries and nothing it wants. The bodies standing around it, though, still have their belongings.',
      notes: 'Myconids do not start fights and are bad at finishing them, which makes the sovereign a negotiation with a monster attached. It fights only over its colony, and it fights by making the party outnumbered.',
      blurb: 'Fungal patriarch that raises the party\'s dead and fills the room with spores.',
    },
    {
      key: 'peryton',
      name: 'Peryton',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'skirmisher',
      tags: ['monstrosity', 'flying', 'mountain', 'forest'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['mountain', 'forest'],
      combat: {
        maxHp: 33,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 14,
        speed: 20,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 5 }],
        attacks: [
          {
            name: 'Gore',
            damage: '1d8+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'Antlers first, out of the sun, aimed at a chest.',
          },
          {
            name: 'Beak',
            damage: '1d6+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'A stag\'s head with an eagle\'s beak set in it, used once the antlers have done the work.',
          },
        ],
        abilities: [
          {
            name: 'Dive',
            text: 'If it comes down from a height before it gores, add this to the damage.',
            roll: '1d8',
            scalesWithCr: true,
          },
          {
            name: 'Takes the Heart',
            text: 'A peryton kills for one heart and then leaves with it. It will break off a fight it is winning the moment it has what it came for — which is the mercy in this encounter and also the horror of it.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing on the creature. Its nest, a long way up, holds the gear of four earlier meals.',
      notes: 'Hunts from the air over open ground and casts the shadow of a stag rather than a bird, which is the only warning a party gets. It ignores everybody but its chosen target and cannot be talked out of that choice.',
      blurb: 'Antlered flyer that dives out of the sky for one victim\'s heart.',
    },
    {
      key: 'gargoyle',
      name: 'Gargoyle',
      creatureType: 'Elemental',
      size: 'medium',
      alignment: 'Chaotic Evil',
      role: 'tank',
      tags: ['elemental', 'flying', 'urban', 'ruins'],
      cr: 2,
      tier: 3,
      ...LEVELS_2_3,
      environmentTags: ['urban', 'ruins', 'mountain'],
      combat: {
        maxHp: 48,
        armourClass: 17,
        attackBonus: 4,
        initiativeBonus: 1,
        passivePerception: 10,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 4 }],
        attacks: [
          {
            name: 'Bite',
            damage: '1d6+1',
            damageType: 'piercing',
            range: 'melee',
            text: 'Stone teeth. It does not need to bite hard to open a wound.',
          },
          {
            name: 'Claws',
            damage: '1d4+1',
            damageType: 'slashing',
            range: 'melee',
            text: 'Two clawed hands of carved rock, raked across whatever is closest to it.',
          },
        ],
        abilities: [
          {
            name: 'False Appearance',
            text: 'Perched and still it is masonry, and it will hold the pose for years. Parties walk under gargoyles all the time.',
            roll: null,
          },
          {
            name: 'Made of Stone',
            text: 'Ordinary blades chip it and arrows glance off. Blunt weapons and magic do proper damage; everything else is a very long afternoon.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing. It has no use for anything and never has had.',
      notes: 'Bored, malicious and effectively unkillable by a party in a hurry. Gargoyles pick off stragglers on rooftops and battlements, then fly off the moment a fight stops being amusing.',
      blurb: 'Malicious stone flyer that shrugs off blades and waits on a roof for years.',
    },

    // -----------------------------------------------------------------------
    // CR 3
    // -----------------------------------------------------------------------
    {
      key: 'owlbear',
      name: 'Owlbear',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Unaligned',
      role: 'brute',
      tags: ['monstrosity', 'forest', 'cave'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['forest', 'cave'],
      combat: {
        maxHp: 62,
        armourClass: 12,
        attackBonus: 5,
        initiativeBonus: 1,
        passivePerception: 15,
        speed: 40,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 5 }],
        attacks: [
          {
            name: 'Beak',
            damage: '1d10+4',
            damageType: 'piercing',
            range: 'melee',
            text: 'It leads with the beak, and it goes for the face.',
          },
          {
            name: 'Claws',
            damage: '2d6+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'A bear\'s arms with an owl\'s grip on the end of them. This is the one that ends people.',
          },
        ],
        abilities: [
          {
            name: 'Keen Sight and Smell',
            text: 'It finds a hidden party by smell, in the dark, without slowing down. Once an owlbear has your scent there is no losing it.',
            roll: null,
          },
          {
            name: 'No Notion of Retreat',
            text: 'An owlbear does not withdraw, negotiate or reconsider. Once it is fighting, one side of the fight is going to stop existing.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing it owns. Its den holds a torn pack, a snapped bow and half a map.',
      notes: 'Territorial, deaf to reason and always hungry — the classic answer to a party grown too comfortable in the woods. No tactics and no mercy, and enough damage to drop a lightly armoured character in two swings.',
      blurb: 'Feathered bear that hits like a wall and never once backs off.',
    },
    {
      key: 'minotaur',
      name: 'Minotaur',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Chaotic Evil',
      role: 'brute',
      tags: ['monstrosity', 'ruins', 'cave'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['ruins', 'cave'],
      combat: {
        maxHp: 64,
        armourClass: 12,
        attackBonus: 5,
        initiativeBonus: 0,
        passivePerception: 14,
        speed: 40,
        saveDc: null,
        skills: [
          { key: 'athletics', bonus: 6 },
          { key: 'perception', bonus: 5 },
        ],
        attacks: [
          {
            name: 'Greataxe',
            damage: '2d8+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'A huge axe swung with both hands and the whole weight of the body behind it.',
          },
          {
            name: 'Gore',
            damage: '2d6+3',
            damageType: 'piercing',
            range: 'melee',
            text: 'Horns driven into a chest at a run. Given the room, it prefers to open with this.',
          },
        ],
        abilities: [
          {
            // Written as bonus damage rather than as the published shove, because the shove
            // lands on the excluded condition list. Same feel at the table, no rules debt.
            name: 'Running Start',
            text: 'If it covers open ground in a straight line before it gores, add this to the damage. Fighting a minotaur in a wide room is a choice.',
            roll: '2d8',
            scalesWithCr: true,
          },
          {
            name: 'Never Lost',
            text: 'It always knows exactly where it is and which way you went. Fleeing into a maze from a minotaur is running further into its house.',
            roll: null,
          },
        ],
      },
      loot: 'A gnawed bone, a bronze arm ring and the keys to three doors in its maze.',
      notes: 'Guards a place rather than a hoard, and the place is usually confusing on purpose. Fight it in the open and it charges; fight it in the corridors and it knows them while the party does not.',
      blurb: 'Axe-swinging horned brute that charges, and always knows the way back.',
    },
    {
      key: 'hell-hound',
      name: 'Hell Hound',
      creatureType: 'Fiend',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'skirmisher',
      tags: ['fiend', 'cave', 'mountain'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['cave', 'mountain'],
      combat: {
        // The bite is deliberately kept at, not above, the CR 3 damage row: the breath is
        // where this creature's output actually lives, and stacking both would make the
        // attacks look like the threat when they are the small half of it.
        maxHp: 45,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 15,
        speed: 50,
        saveDc: 13,
        skills: [{ key: 'perception', bonus: 5 }],
        attacks: [
          {
            name: 'Bite',
            damage: '2d8+3',
            damageType: 'piercing and fire',
            range: 'melee',
            text: 'Jaws already too hot to touch close on an arm. The wound is burnt shut as fast as it is opened.',
          },
        ],
        abilities: [
          {
            // The pattern the higher tiers copy: a breath weapon averages well over the CR 3
            // row on its own, so it MUST opt into scaling. Left off, a hell hound stepped
            // down to CR 1 keeps the full breath and kills a level 1 party outright.
            name: 'Fire Breath',
            text: 'It looses a cone of fire, once every few rounds. Everything caught takes the damage, halved on a successful Dexterity saving throw — and this, rather than the bite, is what a hell hound is for.',
            roll: '6d6',
            scalesWithCr: true,
          },
          {
            name: 'Hunts in a Pack',
            text: 'They come in threes. While one of its packmates is already on a target the hound\'s bite finds the gaps, so the pack circles and waits rather than charging in together.',
            roll: null,
          },
          {
            name: 'Fire Is No Trouble',
            text: 'It does not care about heat, its own or anybody else\'s, and it will happily keep fighting in a burning building it started.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing. Whoever sent it kept the collar.',
      notes: 'A devil\'s hunting dog: obedient, patient and used as a delivery system for fire. Run them in threes, keep them spread out, and breathe on the half of the party that has bunched up — a level 3 group will feel that.',
      blurb: 'Pack hunter from somewhere hotter, and the breath is the real attack.',
    },
    {
      key: 'manticore',
      name: 'Manticore',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Lawful Evil',
      role: 'archer',
      tags: ['monstrosity', 'flying', 'mountain', 'desert'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['mountain', 'desert'],
      combat: {
        maxHp: 40,
        armourClass: 14,
        attackBonus: 6,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 3 }],
        attacks: [
          {
            name: 'Tail Spikes',
            damage: '3d6+3',
            damageType: 'piercing',
            range: '100/200 ft.',
            text: 'It flicks its tail and a volley of long, iron-hard spikes goes at whoever it has decided is the problem.',
          },
          {
            name: 'Claws',
            damage: '1d6+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'Lion\'s claws, used only on something that has got close enough to be annoying.',
          },
        ],
        abilities: [
          {
            name: 'Spikes Regrow',
            text: 'It carries about two dozen spikes and grows them back overnight. A party that makes it spend the lot has taken the fight off it.',
            roll: null,
          },
          {
            name: 'Fights From the Air',
            text: 'It circles out of reach and throws spikes down, and only lands once the party has stopped being able to answer. Anything that can shoot back changes this encounter completely.',
            roll: null,
          },
        ],
      },
      loot: 'A scatter of its own spent spikes, and a signet ring caught in the fur of its mane.',
      notes: 'It talks, badly, and can be bribed with food or flattery. Left to itself it hunts open ground from a great height and will not come down for anyone — so it is a lesson about carrying ranged options rather than a slugging match.',
      blurb: 'Winged lion that shoots iron spikes from its tail and never lands.',
    },
    {
      key: 'ankylosaurus',
      name: 'Ankylosaurus',
      creatureType: 'Beast',
      size: 'huge',
      alignment: 'Unaligned',
      role: 'tank',
      tags: ['beast', 'forest', 'swamp'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['forest', 'swamp'],
      combat: {
        maxHp: 72,
        armourClass: 17,
        attackBonus: 5,
        initiativeBonus: -1,
        passivePerception: 12,
        speed: 30,
        saveDc: null,
        skills: [{ key: 'perception', bonus: 2 }],
        attacks: [
          {
            name: 'Tail',
            damage: '2d8+1',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A club of solid bone on the end of a very long tail, swung at knee height without the animal bothering to turn round.',
          },
        ],
        abilities: [
          {
            name: 'Armoured Back',
            text: 'Everything lands on the plating. Blows from above and arrows skid off it, and the DM can fairly rule the underside a much easier target for anybody willing to get down there.',
            roll: null,
          },
          {
            name: 'Not Actually Interested',
            text: 'It has no reason to want anyone dead and stops the moment it is left alone. A party that keeps hitting it has chosen this fight and can un-choose it at any point.',
            roll: null,
          },
        ],
      },
      loot: 'None. There is a great deal of meat, though, and hide worth carrying to a tanner.',
      notes: 'Enormous, placid and almost impossible to hurt in a hurry — the tank of this tier that tanks with bulk rather than cunning. Use it as an obstacle instead of an enemy: it holds a ford or a trail, and the interesting question is what the party does about that.',
      blurb: 'Armoured giant that soaks everything and swings a bone club at knee height.',
    },
    {
      key: 'basilisk',
      name: 'Basilisk',
      creatureType: 'Monstrosity',
      size: 'medium',
      alignment: 'Unaligned',
      role: 'controller',
      tags: ['monstrosity', 'cave', 'desert'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['cave', 'desert'],
      combat: {
        maxHp: 48,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: -1,
        passivePerception: 11,
        speed: 20,
        saveDc: 13,
        skills: [{ key: 'stealth', bonus: 3 }],
        attacks: [
          {
            name: 'Bite',
            damage: '2d6+3',
            damageType: 'piercing and poison',
            range: 'melee',
            text: 'It clamps on with an unpleasant number of teeth, and the bite goes septic fast.',
          },
        ],
        abilities: [
          {
            name: 'Petrifying Gaze',
            text: 'Meet its eyes and you begin to set. On a failed Constitution saving throw the victim is stiffening; a second failure at the end of their next turn and they are stone until somebody finds a cure. Looking away avoids it, and looking away is a poor way to fight.',
            roll: null,
          },
          {
            name: 'Its Own Reflection Counts',
            text: 'The gaze is not choosy about who it works on. A mirror held up at the right moment can end the encounter, and a party that thinks of that has earned it.',
            roll: null,
          },
        ],
      },
      loot: 'None on the creature. The stone figures around its lair still have their belongings, and one of them is holding a wand.',
      notes: 'Slow, stupid and dangerous for a reason that has nothing to do with damage: it removes party members rather than killing them. Put it in a cave full of statues and let the party work out what the statues are.',
      blurb: 'Sluggish lizard whose stare turns a party member into scenery.',
    },
    {
      key: 'displacer-beast',
      name: 'Displacer Beast',
      creatureType: 'Monstrosity',
      size: 'large',
      alignment: 'Lawful Evil',
      role: 'skirmisher',
      tags: ['monstrosity', 'forest', 'ruins'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['forest', 'ruins'],
      combat: {
        maxHp: 44,
        armourClass: 15,
        attackBonus: 6,
        initiativeBonus: 3,
        passivePerception: 13,
        speed: 40,
        saveDc: null,
        skills: [{ key: 'stealth', bonus: 4 }],
        attacks: [
          {
            name: 'Barbed Tentacles',
            damage: '2d6+2',
            damageType: 'piercing',
            range: 'melee',
            text: 'Two spined tentacles come over its shoulders and rake down. They reach a good deal further than the body suggests.',
          },
          {
            name: 'Claws',
            damage: '1d6+2',
            damageType: 'slashing',
            range: 'melee',
            text: 'A big cat\'s paws, used on whatever the tentacles have already brought within range.',
          },
        ],
        abilities: [
          {
            name: 'Displacement',
            text: 'It appears to be standing a few feet from where it actually is, so the first attack aimed at it each round hits empty air. The illusion drops for a moment whenever something does connect.',
            roll: null,
          },
          {
            name: 'Hunts in Pairs',
            text: 'One shows itself and the other comes from behind, and neither of them is where it looks like it is. That is what makes a pair much worse than two of anything else.',
            roll: null,
          },
        ],
      },
      loot: 'Nothing on it. Its lair is a scatter of bones and one intact set of saddlebags.',
      notes: 'Malicious, patient and very hard to land a first blow on. It works best against a party that trusts its own eyes, and it will stalk a group for a day before it picks the moment.',
      blurb: 'Tentacled panther that is never quite where you are swinging.',
    },
    {
      key: 'green-hag',
      name: 'Green Hag',
      creatureType: 'Fey',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'spellcaster',
      tags: ['monstrosity', 'forest', 'swamp'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['forest', 'swamp'],
      combat: {
        maxHp: 38,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 14,
        speed: 30,
        saveDc: 13,
        skills: [
          { key: 'deception', bonus: 6 },
          { key: 'insight', bonus: 4 },
          { key: 'perception', bonus: 4 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Claws',
            damage: '2d8+3',
            damageType: 'slashing',
            range: 'melee',
            text: 'Long green fingers with far more strength behind them than the old woman she was pretending to be.',
          },
          {
            name: 'Vicious Mockery',
            damage: '2d4',
            damageType: 'psychic',
            range: '60 ft.',
            text: 'She says the one true thing about you that hurts most, and it lands like a blow. A Wisdom saving throw shrugs it off.',
          },
        ],
        abilities: [
          {
            name: 'Illusory Appearance',
            text: 'She looks like whatever suits her — a lost child, a kind old woman, a wounded soldier — until somebody touches her or she drops it herself.',
            roll: null,
          },
          {
            name: 'Through the Wood Unseen',
            text: 'She vanishes into her own forest at will and steps back out of it somewhere else. She is only ever fought where she has decided the fight will be.',
            roll: null,
          },
          {
            name: 'Mimicry',
            text: 'She copies any voice she has heard. The crying that leads a party off the path is a voice one of them knows.',
            roll: null,
          },
        ],
      },
      loot: 'A hut full of jars, one of them worth a great deal to a wizard, and a bargain written on skin.',
      notes: 'Hags deal before they fight, and the deal is always worse than it sounds. Play her as a negotiation with a monster: she wants a favour, a name or a child, and she has every reason to keep the party alive until she has it.',
      blurb: 'Swamp witch who bargains, lies, and looks like whatever you want to help.',
    },
    {
      key: 'bearded-devil',
      name: 'Bearded Devil',
      creatureType: 'Fiend (devil)',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'support',
      tags: ['fiend', 'cave', 'ruins'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['cave', 'ruins'],
      combat: {
        maxHp: 44,
        armourClass: 15,
        attackBonus: 5,
        initiativeBonus: 2,
        passivePerception: 13,
        speed: 30,
        saveDc: 13,
        skills: [
          { key: 'intimidation', bonus: 4 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Glaive',
            damage: '1d10+3',
            damageType: 'slashing',
            range: 'melee',
            text: 'A long polearm held at exactly the distance the devil has decided the fight will happen at.',
          },
        ],
        abilities: [
          {
            name: 'Infernal Wound',
            text: 'A cut from its glaive does not close. The victim loses this at the start of each of their turns until somebody spends an action on the wound and succeeds at a Wisdom check, or until any magical healing reaches them.',
            roll: '1d6',
            scalesWithCr: true,
          },
          {
            name: 'Poison Beard',
            text: 'The beard is a nest of writhing barbs, and it uses them on anybody who steps inside the polearm. On a failed Constitution saving throw the poison keeps working after the wound closes.',
            roll: '1d8',
            scalesWithCr: true,
          },
          {
            name: 'Steadfast',
            text: 'It cannot be frightened while a devil that outranks it is watching — and in practice neither can the rank it is standing in. It is here to make the things beside it hold.',
            roll: null,
          },
        ],
      },
      loot: 'A glaive nobody sensible wants to carry, and an iron token stamped with somebody\'s name.',
      notes: 'The infantry of the lower planes: disciplined, unafraid and used to hold a line while something worse does the work. Alone it is a long grinding fight; in a rank of three it is the reason the encounter is dangerous.',
      blurb: 'Disciplined devil whose wounds never close and whose rank never breaks.',
    },
    {
      key: 'wight',
      name: 'Wight',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Neutral Evil',
      role: 'boss',
      tags: ['undead', 'ruins', 'cave', 'boss'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['ruins', 'cave'],
      combat: {
        // Boss numbers: hit points at roughly twice the CR 3 row and armour class above it,
        // because this is meant to be the entire encounter for a level 3 party rather than
        // one monster in a group of them.
        maxHp: 112,
        armourClass: 16,
        attackBonus: 6,
        initiativeBonus: 2,
        passivePerception: 13,
        speed: 30,
        saveDc: 13,
        skills: [
          { key: 'perception', bonus: 3 },
          { key: 'stealth', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Longsword',
            damage: '2d8+4',
            damageType: 'slashing',
            range: 'melee',
            text: 'A blade out of its own barrow, kept sharp for centuries out of nothing but habit.',
          },
          {
            name: 'Life Drain',
            damage: '2d6+4',
            damageType: 'necrotic',
            range: 'melee',
            text: 'It takes hold and something goes out of you. Lower the victim\'s maximum hit points by the damage dealt until they finish a long rest.',
          },
        ],
        abilities: [
          {
            name: 'Calls Up the Dead',
            text: 'Once a day it raises up to a dozen bodies within sight as zombies under its command — including anybody the party has already lost. This is the ability that makes it a whole encounter on its own.',
            roll: null,
          },
          {
            name: 'Crown of the Barrow',
            text: 'While the wight is on its feet, no undead in its barrow will break or flee. Put the wight down and the fight goes out of everything else in the room.',
            roll: null,
          },
          SUNLIGHT_SENSITIVITY,
        ],
      },
      loot: 'Grave goods worth about six hundred gold, a torc of twisted silver, and a sword with a name cut into it.',
      notes: 'A warlord who simply refused to stop. Run it in its own barrow, in the dark, with bodies on the floor for it to raise — a level 3 party that splits up in that room is going to lose somebody.',
      blurb: 'Undead warlord that raises the party\'s dead and holds a barrow together.',
    },
    {
      key: 'mummy',
      name: 'Mummy',
      creatureType: 'Undead',
      size: 'medium',
      alignment: 'Lawful Evil',
      role: 'boss',
      tags: ['undead', 'ruins', 'desert', 'boss'],
      cr: 3,
      tier: 3,
      ...LEVELS_3_4,
      environmentTags: ['ruins', 'desert'],
      combat: {
        // The other boss, and shaped as the opposite of the wight: the wight multiplies
        // itself and this one does not, so it is slower, hits harder in one place, and the
        // real cost of the encounter is the curse rather than the damage.
        maxHp: 104,
        armourClass: 16,
        attackBonus: 6,
        initiativeBonus: -1,
        passivePerception: 13,
        speed: 20,
        saveDc: 14,
        skills: [
          { key: 'intimidation', bonus: 4 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Rotting Fist',
            damage: '3d6+4',
            damageType: 'bludgeoning and necrotic',
            range: 'melee',
            text: 'A wrapped fist that hits like falling masonry and leaves the skin around the bruise dead.',
          },
          {
            name: 'Sweeping Wrappings',
            damage: '2d6+2',
            damageType: 'bludgeoning',
            range: '15 ft.',
            text: 'Loose linen whips out the length of the room, winds round an arm and drags whoever it caught back towards the mummy.',
          },
        ],
        abilities: [
          {
            name: 'Dreadful Glare',
            text: 'It looks at one creature and shows them what is going to happen to them. On a failed Wisdom saving throw they are frightened of it for the next minute, and too badly shaken to do anything useful on their first turn of that.',
            roll: null,
          },
          {
            name: 'Mummy Rot',
            text: 'Anybody struck by the fist carries a curse away with them: they cannot regain hit points at all, and their maximum drops a little every day until it is lifted. Nothing short of remove curse ends it.',
            roll: null,
          },
          {
            name: 'Dry as Kindling',
            text: 'Fire does far more to it than anything else in a party\'s hands. A group that works this out early halves the length of the fight.',
            roll: null,
          },
        ],
      },
      loot: 'The tomb it is standing in: eight hundred gold in grave goods, a jewelled scarab, and a sealed jar nobody should open.',
      notes: 'It does not hunt and it does not leave — it wakes because somebody came in. Run it slow and inevitable, let the party hear it moving two rooms away, and remember that the curse is the real price of the encounter rather than the damage.',
      blurb: 'Tomb guardian that terrifies with a look and curses whatever it touches.',
    },
  ],
}
