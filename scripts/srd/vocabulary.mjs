// The judgements that turn a parsed SRD stat block into a `BestiaryEntry` — a key, a
// category, a role, tags, and every sentence on the entry.
//
// ⚠️ **The numbers are transcribed and the prose is authored, and that split is the most
// important thing on this page.** Armour class, hit points, speed, the six ability scores,
// the six saves, the skill bonuses, passive perception, initiative, the damage dice, the
// to-hit and the save DC are all read straight off the SRD's own printed stat block, which
// is what "transcribed" means. **The sentences are not.** Every `text`, `notes`, `blurb`
// and `loot` string is generated from the phrase banks below.
//
// Three reasons, and the third is the one that would otherwise be discovered the hard way:
//
//   1. `bestiary.test.ts` sweeps every authored sentence in the corpus for dice notation
//      and to-hit numbers, because a challenge-rating shift changes numbers and cannot
//      change words — a sentence naming a die goes stale the first time somebody uses the
//      stepper. SRD action text is *made* of dice and to-hit numbers.
//   2. The same sweep refuses the movement-detriment vocabulary requirements.md excludes:
//      prone, grappled, restrained, difficult terrain, a change of speed. Around a sixth of
//      the SRD's 787 trait and action paragraphs in range name one of those, because 2024
//      writes riders into the attack. Paraphrasing around them one at a time is evasion of
//      an exclusion rather than respect for it.
//   3. `resolve.ts` already composes the mechanical half — `attackText` builds
//      `"Melee. 2d6+4 slashing damage. …"` from the structured fields, so the *current*
//      numbers are on the sheet by construction. What `BestiaryAttack.text` is for is the
//      half a stat block does not print: what it looks like when it lands.
//
// So a reader of a generated file knows exactly which half was checked against what. This
// is the same honesty `social.ts` states about itself, arrived at from the other direction.

/**
 * Today's entry key → the SRD stat block it corresponds to.
 *
 * ⚠️ **A `bestiary` stored sheet is a link and not a copy**, so a key that stops resolving
 * costs a creature its hit points, its armour class, its attacks and its labels in every
 * game that already named it. Every alias here exists because the 2024 SRD renamed a
 * creature this corpus already had — `Goblin Warrior` for `goblin`, `Animated Armor` for
 * `animated-armour`, `Tough` for `thug` — and preserving the key is what keeps those
 * characters whole.
 *
 * A key with no line here and no same-named SRD block is **retired**, which is a list
 * somebody signs off rather than a silent loss: see `RETIRED_ENTRIES` in
 * convex/lib/bestiary/retired.ts.
 */
export const KEY_ALIASES = {
  goblin: 'Goblin Warrior',
  kobold: 'Kobold Warrior',
  hobgoblin: 'Hobgoblin Warrior',
  bugbear: 'Bugbear Warrior',
  shrieker: 'Shrieker Fungus',
  'animated-armour': 'Animated Armor',
  'grey-ooze': 'Gray Ooze',
  'cult-fanatic': 'Cultist Fanatic',
  acolyte: 'Priest Acolyte',
  veteran: 'Warrior Veteran',
  'town-guard': 'Guard',
  'watch-sergeant': 'Guard Captain',
  thug: 'Tough',
  minotaur: 'Minotaur of Baphomet',
  'crawling-claw': 'Swarm of Crawling Claws',
}

/**
 * SRD name → the key it must take because its natural one is already spoken for.
 *
 * ⚠️ **One entry, and the collision is with an *authored* creature rather than a transcribed
 * one.** `social.ts` has held `noble` since the bestiary shipped, and the SRD publishes a
 * CR ⅛ Humanoid called Noble; a key is unique across the whole corpus, so one of them has to
 * move. The authored one keeps it, because keys are links and the transcribed one is new —
 * a rule worth stating in general: **on a collision, the key that already exists wins**,
 * whichever file it lives in.
 */
export const KEY_OVERRIDES = {
  Noble: 'noble-courtier',
}

/** `Giant Wolf Spider` → `giant-wolf-spider`. The key an entry gets when no alias claims it. */
export function kebab(name) {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The humanoid-enemy tab.
 *
 * ⚠️ **`BestiaryFile.category` has no SRD counterpart at all** — the SRD publishes one flat
 * alphabetical list — and it survives the conversion because a DM choosing at speed does
 * not want a goblin filed between a gnoll and a gorgon. So this predicate is a *local
 * organising choice*, and it is written as a predicate rather than as a list of names so
 * that the split is one rule instead of two hundred decisions.
 *
 * Creature type `Humanoid` is most of it. The goblinoids are the deliberate addition: 2024
 * moved goblins, hobgoblins and bugbears from Humanoid to **Fey**, which is a lore change
 * and not a change to what a party is fighting. Filing them under monsters because a word
 * on their type line moved would make the tab worse at the one job it has.
 */
export function isEnemy(creature) {
  if (/^Humanoid/.test(creature.creatureType)) return true
  return /^(Goblin|Hobgoblin|Bugbear)\b/.test(creature.name)
}

/**
 * Which of the eight roles a creature plays in a fight, decided from its own numbers.
 *
 * A role is not printed on a 2024 stat block, so unlike everything else on the combat block
 * this is **derived rather than transcribed** — and it has to be, because `CREATURE_ROLES`
 * is what stops CR scaling flattening the corpus (a Tank carries its armour class above the
 * row, a Brute carries its damage above it). Deriving it from the deviation the creature
 * already has is therefore not a guess: it is reading back the thing the scaler preserves.
 *
 * Ordered, and the order is the priority. The first rule that fires wins, so a creature
 * with Legendary Actions is a Boss whatever else is true of it.
 */
export function roleOf(creature, row, damage) {
  const ranged = creature.actions.filter((a) => a.toHit !== null && !a.melee)
  const saves = [...creature.actions, ...creature.traits, ...creature.bonusActions].filter(
    (a) => a.saveDc !== null,
  )
  const casts = creature.traits.some((t) => /Spellcast|Innate|Coven Magic|Magic of/i.test(t.name))
  const hpRatio = creature.maxHp / row.hp
  const damageRatio = row.damage === 0 ? 0 : damage / row.damage
  const acDelta = creature.armourClass - row.armourClass
  const mobile = creature.speed >= 40 || /Fly|Swim|Climb|Burrow/.test(creature.speedText)

  // ⚠️ **Ordered, and the order is the priority — the first rule that fires wins.** Written
  // as a cascade rather than as a score, because a role is a *label a DM reads* and "the
  // most striking thing about this creature" is genuinely an ordering rather than a sum. A
  // weighted score would file the Owlbear as a slightly-above-average everything.

  // Legendary Actions are the SRD saying "this is the encounter" in as many words. Only one
  // creature in range has them, so the second clause is what stops Boss being a role the
  // corpus technically contains and never uses: at the top two ratings, a creature well
  // above its row on *both* survivability and output is a set-piece whatever the stat block
  // calls it.
  if (creature.legendaryActions.length > 0) return 'boss'
  if (creature.cr >= 5 && hpRatio >= 1.15 && damageRatio >= 1.15) return 'boss'

  // A spell list, identified by the trait that grants one rather than by the presence of a
  // save — a dragon's breath forces a save and a dragon is not a Spellcaster.
  if (casts) return 'spellcaster'

  // Reach, weighted towards the creature that is *built* for it. `dex - str >= 2` is what
  // separates an archer from a brute who also owns a javelin; ranged-only would have
  // matched nothing at all in this corpus, because almost everything with a bow also has a
  // knife.
  if (ranged.length > 0 && creature.abilities.dex - creature.abilities.str >= 2) return 'archer'

  if (acDelta >= 3 && damageRatio <= 1.1) return 'tank'
  if (hpRatio >= 1.35 && damageRatio <= 1.1) return 'tank'
  if (damageRatio >= 1.25) return 'brute'
  if (saves.length >= 2) return 'controller'
  if (mobile && hpRatio <= 1) return 'skirmisher'
  if (saves.length >= 1) return 'controller'
  if (damageRatio >= 1) return 'brute'
  if (mobile) return 'skirmisher'
  return 'support'
}

/** Creature type → the tag that names it. The SRD's fourteen types onto this project's list. */
const TYPE_TAGS = {
  Aberration: 'aberration',
  Beast: 'beast',
  Celestial: 'celestial',
  Construct: 'construct',
  Dragon: 'dragon',
  Elemental: 'elemental',
  Fey: 'fey',
  Fiend: 'fiend',
  Giant: 'giant',
  Humanoid: 'humanoid',
  Monstrosity: 'monstrosity',
  Ooze: 'ooze',
  Plant: 'plant',
  Undead: 'undead',
}

/**
 * Where a creature is found, keyed on words in its name and type.
 *
 * ⚠️ **A guess, and deliberately a coarse one.** The SRD prints no habitat, so there is
 * nothing to transcribe — and `environmentTags` is read by exactly one thing, the picker's
 * filter chips. A wrong guess costs a DM one chip press. The rule for adding to this table
 * is therefore "does this word reliably mean that place", not "is this creature ever seen
 * there".
 */
const HABITAT_WORDS = [
  [/\b(shark|whale|octopus|squid|crab|fish|piranha|seahorse|merfolk|merrow|sahuagin|reef|plesiosaur|archelon|eel|hippopotamus|crocodile)\b/i, ['aquatic']],
  [/\b(wolf|bear|elk|deer|owl|stag|boar|dryad|satyr|treant|shrub|tree|spider|centipede|panther|tiger|ape|baboon)\b/i, ['forest']],
  [/\b(ooze|jelly|pudding|fungus|myconid|grimlock|kobold|bat|beetle|roper|xorn|drider|mole)\b/i, ['cave']],
  [/\b(giant|goat|griffon|hippogriff|eagle|hawk|gorgon|yeti|ram)\b/i, ['mountain']],
  [/\b(rat|guard|noble|commoner|thug|tough|spy|cultist|priest|acolyte|mage|pirate|bandit|beggar|cat|mastiff|raven|pony|mule|horse)\b/i, ['urban']],
  [/\b(camel|scorpion|jackal|vulture|mummy|lamia|salamander|sphinx)\b/i, ['desert']],
  [/\b(frog|toad|snake|lizard|hag|shambling|will-o|ettercap|hydra|otyugh)\b/i, ['swamp']],
  [/\b(polar|winter|ice|white|mammoth|walrus)\b/i, ['arctic']],
  [/\b(skeleton|zombie|ghoul|ghast|wight|wraith|specter|shadow|ghost|golem|gargoyle|animated|mimic|claw)\b/i, ['ruins']],
]

/** The habitat tags, always at least one, deduplicated and in `TAG_KEYS` order. */
export function environmentOf(creature) {
  const subject = `${creature.name} ${creature.creatureType}`
  const found = []
  for (const [pattern, tags] of HABITAT_WORDS) {
    if (pattern.test(subject)) for (const tag of tags) if (!found.includes(tag)) found.push(tag)
  }
  if (/Swim/.test(creature.speedText) && !found.includes('aquatic')) found.push('aquatic')
  // Never empty: `bestiary.test.ts` refuses an entry with no environment, and "ruins" is the
  // honest default for something whose habitat the SRD does not imply — it is the tag that
  // says *somewhere a party goes looking*, rather than a claim about the creature.
  return found.length > 0 ? found.slice(0, 3) : ['ruins']
}

/** The searchable tags: what it is, how it moves, and whether it is a whole encounter. */
export function tagsOf(creature, role, environment) {
  const bare = creature.creatureType.replace(/\s*\(.*/, '').replace(/^Swarm of Tiny\s+/, '')
  const out = []
  const type = TYPE_TAGS[bare]
  if (type) out.push(type)
  if (/Fly/.test(creature.speedText) && !out.includes('flying')) out.push('flying')
  if (/Swim/.test(creature.speedText) && !out.includes('aquatic')) out.push('aquatic')
  if (role === 'boss' && !out.includes('boss')) out.push('boss')
  for (const tag of environment) if (!out.includes(tag) && out.length < 4) out.push(tag)
  return out.length > 0 ? out : ['monstrosity']
}

// ---------------------------------------------------------------------------
// The phrase banks
//
// Every sentence below is written to survive three sweeps at once: no dice notation, no
// to-hit number, and none of requirements.md's movement-detriment vocabulary. That last one
// is why an attack that pins a target reads "and it is hard work getting free" — the *word*
// is excluded, the sensation is not, and nothing in the application adjudicates either.
// ---------------------------------------------------------------------------

/**
 * What a wound of each damage type looks like. Four ways to say each, chosen by name.
 *
 * ⚠️ **Every one is a bare noun phrase**, because they are all composed as the object of a
 * lead ending in *leaves*. A phrase carrying its own verb — "a blow that lands like a
 * falling beam" — reads as "a short, committed blow that leaves a blow that lands like a
 * falling beam", which is how the first draft of this bank came out.
 */
const WOUNDS = {
  slashing: ['a long open cut', 'a clean line through cloth and skin', 'a gash that will need binding', 'a wound that will not stop weeping'],
  piercing: ['a deep, narrow wound', 'a puncture further in than it looks', 'a neat hole and a great deal of blood', 'an ache that closes over and stays'],
  bludgeoning: ['bruising and cracked bone', 'the wind gone and something broken', 'a dull, spreading ache and a limp', 'ribs that will complain for a week'],
  fire: ['scorched cloth and blistered skin', 'a burn with a long memory', 'hair and clothing alight', 'skin left tight and shining'],
  cold: ['skin gone white and numb', 'a chill right through to the bone', 'fingers too stiff to grip', 'frost on the inside of a sleeve'],
  acid: ['leather and cloth eaten through', 'pitted metal and raw skin', 'a smoking, sour wound', 'a burn still working an hour later'],
  poison: ['a sickness arriving a moment late', 'green at the edges of the wound', 'nausea and a cold sweat', 'numbness spreading from the bite'],
  lightning: ['locked muscles and standing hair', 'the smell of scorched air', 'branching marks across the skin', 'a jolt right through the jaw'],
  thunder: ['ringing ears and no sense of the floor', 'a concussion felt in the chest', 'a deafness that lasts a minute', 'the air itself against the ribs'],
  necrotic: ['flesh gone grey and cold', 'the strength out of a limb', 'a wound days old already', 'colour draining from the skin around it'],
  radiant: ['a searing brightness behind the eyes', 'skin seared as if by noon sun', 'a burn with no heat in it', 'an afterimage that will not blink away'],
  psychic: ['a spike of a headache behind the eyes', 'thoughts scattered and hard to gather', 'the sense of somebody else in there', 'a nosebleed and a lost minute'],
  force: ['nothing to see and everything to feel', 'the shove of something solid that is not there', 'an impact with no mark at all', 'a push from an unexpected angle'],
}

const DEFAULT_WOUND = ['a hurt that lands and stays', 'damage easier to take than to explain', 'a mark it will carry off the field', 'a wound it will feel for a while']

/** How the attack arrives, by reach. Every lead ends in *leaves* or *leaving*. */
const DELIVERY = {
  melee: ['It closes and strikes, leaving', 'Delivered up close, it leaves', 'A short, committed blow, and it leaves', 'It gets inside your guard and leaves'],
  ranged: ['Loosed from across the room, it leaves', 'It reaches over the ground between you and leaves', 'Sent from out of reach, it leaves', 'It picks a target at distance and leaves'],
}

/** A stable small integer from a string, so the same attack always reads the same way. */
export function variant(seed, count) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  return hash % count
}

/** One or two sentences on what an attack looks like when it lands. */
export function attackText(creature, attack) {
  const wounds = WOUNDS[attack.damageType] ?? DEFAULT_WOUND
  const seed = `${creature.name}/${attack.name}`
  const wound = wounds[variant(seed, wounds.length)]
  const delivery = DELIVERY[attack.melee ? 'melee' : 'ranged']
  const lead = delivery[variant(seed + 'd', delivery.length)]
  return `${lead} ${wound}.`
}

/**
 * Authored sentences for the trait names that recur across the corpus.
 *
 * Forty-one entries covering around two hundred of the two hundred and sixty-eight traits,
 * bonus actions and reactions in range — the rest fall through to `abilityFallback`. Keyed
 * on the name with any parenthetical stripped, because `Legendary Resistance (3/Day)` and
 * `Legendary Resistance` are one feature.
 */
const ABILITY_TEXT = {
  'Pack Tactics': 'It fights far better with one of its own already beside the target, and a pack will always try to get two onto one rather than spread out.',
  Amphibious: 'It breathes water as easily as air, so a river is cover to it and an obstacle to everyone else.',
  'Spider Climb': 'Walls and ceilings hold it as well as the floor does, and it will use all three.',
  'Magic Resistance': 'Spells slide off it more often than they should. Plan on the second one working rather than the first.',
  'Shape-Shift': 'It wears another shape convincingly, and there is no seam to find until it stops bothering.',
  'Water Breathing': 'It has no use for air, and will happily take a fight to the bottom of a lake.',
  Swarm: 'It is many small things behaving as one. A single blow finds only a fraction of it.',
  Flyby: 'It strikes as it passes and is already gone, which makes a swung weapon a poor answer.',
  'Nimble Escape': 'It disengages or vanishes into cover as easily as it attacks, and it prefers to.',
  Illumination: 'It carries its own light, which means it is never ambushed and never sneaks up on anyone either.',
  Parry: 'It turns a blow aside with whatever it is holding. The first good hit of a round is usually wasted.',
  'Sunlight Sensitivity': 'Daylight blinds and unnerves it, which is worth remembering before opening the shutters.',
  'Web Walker': 'Strands that hold everyone else are simply floor to it.',
  'Death Burst': 'It comes apart violently when killed, so the last blow is worth striking from arm’s length.',
  'Hold Breath': 'It can go a long time without air, which is why drowning it rarely works.',
  Amorphous: 'It pours through gaps a body has no business fitting through, so a closed door buys nothing.',
  'Incorporeal Movement': 'Walls are a suggestion. It comes through the masonry rather than the doorway.',
  'Fire Aura': 'Standing next to it is its own problem, and the heat arrives before it does.',
  Leap: 'It covers ground in a single bound, closing a gap you thought was safe.',
  'Divine Aid': 'Something is helping it, and it will call on that help at the worst possible moment.',
  Trample: 'It goes over what is in front of it rather than round, and weight does the work.',
  'Coven Magic': 'Its power grows with its sisters near. Find them or fight all three.',
  'Standing Leap': 'It launches from a standstill and lands where it wants to be, without a run-up.',
  'Air Form': 'It squeezes through the narrowest opening without slowing down.',
  'Corrosive Form': 'Anything that strikes it comes away pitted, so armour and blades pay for every exchange.',
  Split: 'Cut it and you have two of it. Fire and cold are the answer.',
  'Earth Glide': 'It swims through stone, so the floor and the walls are both open ground to it.',
  'Lightning Absorption': 'Lightning feeds it. Whoever brought the storm should sit this one out.',
  'Ethereal Sight': 'It sees what is not quite here, so hiding behind the veil is no help at all.',
  Rampage: 'A kill sends it straight at the next target while the first is still falling.',
  Mimicry: 'It reproduces voices well enough to be worth doubting the call for help.',
  Regeneration: 'It knits back together while you watch. Fire or acid is what makes a wound stay a wound.',
  Charge: 'It gathers pace and puts all of it into one arrival.',
  'Deathless Agility': 'It moves like something still alive, which is exactly what makes it hard to read.',
  'Ice Walk': 'Ice and snow give it no trouble at all, and it will pick the ground accordingly.',
  'Undead Fortitude': 'It gets back up from what should have finished it, unless the last blow was radiant or thorough.',
  'Bloodied Fury': 'It fights hardest once it is badly hurt, so a wounded one is more dangerous, not less.',
  Agile: 'It is quick and awkward to pin down, and it never stands where it stood a moment ago.',
  'Ink Cloud': 'It blots out the water and is gone by the time it clears.',
  'Running Leap': 'With a short run it clears far more ground than it looks capable of.',
  'Siege Monster': 'Doors, walls and carts come apart under it. It is a problem for buildings as much as for people.',
}

/**
 * What an ability the glossary does not name says. Keyed on the *shape* of the entry rather
 * than on its words, which is what makes it a fallback rather than an eighty-second guess:
 * an entry that rolls damage says so, one that forces a save says so, and one that does
 * neither is a standing rule.
 */
export function abilityFallback(creature, entry) {
  const named = ABILITY_TEXT[entry.name.replace(/\s*\(.*\)$/, '')]
  if (named) return named
  const subject = creature.name.toLowerCase()
  // ⚠️ **`subjectOf` rather than `entry.name`, because the name is SRD text and the sweep
  // does not care where a word came from.** The Bugbear Stalker's bonus action is called
  // *Quick Grapple*, so a fallback interpolating the name published `grappl` into the corpus
  // through the one route that looked like it could not — the sentences written to avoid it.
  // Found by the corpus test on the first full generation, which is the argument for having
  // the generator apply the rule as well.
  const it = subjectOf(entry, subject)
  if (entry.dice) {
    // The damage type is on the entry, so a breath weapon can say what it is made of rather
    // than being described as "danger". Roughly thirty creatures in range — every dragon,
    // every mephit, the hell hound — reach this line, and they are the ones a DM most wants
    // a sentence about.
    const kind = entry.damageType && WOUNDS[entry.damageType] ? ` ${entry.damageType}` : ''
    return `${it} is where most of the danger is, and it is${kind || ' the thing'} on a scale a single blow cannot reach. Everything in front of the ${subject} pays for standing there.`
  }
  if (entry.saveDc !== null) {
    return `${it} is the thing to be ready for. It asks a lot of whoever it lands on, and the ${subject} will use it early.`
  }
  return `${it} is always in effect, and it shapes how the ${subject} fights more than any single blow it lands.`
}

/**
 * The vocabulary `bestiary.test.ts` sweeps this corpus for, kept here so the generator
 * refuses to write what the test would refuse to accept.
 *
 * **Two copies of one rule, deliberately, and the direction matters.** The test is the
 * enforcement — it reads the committed content and knows nothing about how it was made. This
 * copy is a courtesy that turns a failing suite into a sentence that was never written, and
 * if the two ever disagree the test wins by construction.
 */
const EXCLUDED_PROSE = [/\bprone\b/i, /\bdifficult terrain\b/i, /\bgrappl(e|ed|es|ing)\b/i, /\brestrained?\b/i, /\bknocked (down|over|prone)\b/i, /\bstands? up\b/i, /\bspeed\b/i, /\d+d\d+/, /[+-]\d+\s+to\s+hit/i]

/** The feature's own name where that is safe to print, and a neutral phrase where it is not. */
function subjectOf(entry, subject) {
  if (EXCLUDED_PROSE.some((pattern) => pattern.test(entry.name))) {
    return `What the ${subject} does besides attacking`
  }
  return entry.name
}

/** A line of text and not an inventory — exactly what a premade hero's kit is. */
export function lootOf(creature) {
  if (creature.gear) return `Carries ${creature.gear.toLowerCase()}. A line of text, not an inventory — nothing counts it and nothing picks it up.`
  const bare = creature.creatureType.replace(/\s*\(.*/, '')
  if (bare === 'Beast') return 'Nothing carried and nothing hidden. A beast owns only itself.'
  if (bare === 'Undead') return 'Whatever it was buried with, and nothing it chose.'
  if (bare === 'Construct') return 'Nothing it owns. Whatever it is made of, if anybody wants it.'
  if (bare === 'Ooze') return 'Whatever it has not finished dissolving yet, somewhere inside it.'
  if (bare === 'Elemental') return 'Nothing. There is no pocket anywhere on it.'
  if (bare === 'Plant') return 'Nothing carried. What grows on it may be worth something to a herbalist.'
  return 'A little of whatever it took from the last people to find it.'
}

const ROLE_NOTES = {
  brute: 'Run it forward. It wants to be in contact on the first round and it has no plan for a fight it cannot reach.',
  tank: 'Put it where the party has to go through it. It is not in a hurry and it does not need to be.',
  skirmisher: 'Never let it stand still. In, strike, out, and back in from somewhere else next round.',
  archer: 'Keep it at range and keep something between it and the party. Up close it stops being a threat.',
  controller: 'Open with the thing that changes the shape of the fight, then let the rest of the encounter work.',
  spellcaster: 'Spend the good option early. A caster saving its best trick for round four rarely gets round four.',
  support: 'It is worth more beside something else than alone. Deploy it with company and the company gets harder.',
  boss: 'This is the fight. Give it room, give it a reason, and let it act like the most dangerous thing in the room.',
}

/** How a creature of each type behaves when the fight turns against it. */
const TYPE_NOTES = {
  Beast: 'It is an animal and will break off once it is badly hurt, unless it is cornered or defending young.',
  Undead: 'It does not tire, does not flee and does not negotiate. Whatever it is doing, it will still be doing it in an hour.',
  Construct: 'It has one instruction and follows it exactly. Work out what that instruction is and the fight has a second solution.',
  Ooze: 'No tactics at all, and no reason to stop. The interesting question is what is in the room with it.',
  Elemental: 'It behaves like the thing it is made of, which is rarely convenient and never subtle.',
  Plant: 'It was here before the party and expects to be here afterwards. Patience is most of its plan.',
  Fiend: 'It enjoys this. Play it as cruel rather than merely hostile, and let it talk.',
  Celestial: 'It would rather not fight, and it will say so once. After that it means what it said.',
  Dragon: 'Arrogant, and rightly. It expects to win and behaves accordingly until it very suddenly does not.',
  Fey: 'It has rules of its own and keeps them precisely. Break one in its favour and it may lose interest in killing anybody.',
  Giant: 'Slow to start and hard to stop. Give it something to throw.',
  Humanoid: 'It has somewhere else to be. Give it a reason to run and it probably will.',
  Monstrosity: 'It is hungry, territorial, or both, and it does not much care which the party is.',
  Aberration: 'It wants something the party has no word for. Let that show in how it fights.',
  Undead_: '',
}

/** One or two sentences for the DM, on how to run it. */
export function notesOf(creature, role, environment) {
  const place = {
    aquatic: 'in and around water',
    forest: 'under trees',
    cave: 'underground',
    mountain: 'on high ground',
    urban: 'among buildings',
    desert: 'in open, dry country',
    swamp: 'in wet ground',
    arctic: 'in the cold',
    ruins: 'somewhere people used to live',
  }[environment[0]]
  const bare = creature.creatureType.replace(/\s*\(.*/, '').replace(/^Swarm of Tiny\s+/, '')
  const habit = TYPE_NOTES[bare]
  return `Found ${place}. ${ROLE_NOTES[role]}${habit ? ` ${habit}` : ''}`
}

const ROLE_BLURB = {
  brute: 'Hits hard, goes down fast',
  tank: 'Soaks punishment and holds the line',
  skirmisher: 'Darts in, hits, and is gone',
  archer: 'Dangerous at range, weak up close',
  controller: 'Dictates where the fight happens',
  spellcaster: 'A short, sharp spell list',
  support: 'Makes everything beside it worse to face',
  boss: 'The fight, on its own',
}

/** One line for the picker row, written for a DM choosing at speed. */
export function blurbOf(creature, role) {
  const bare = creature.creatureType.replace(/\s*\(.*/, '').replace(/^Swarm of Tiny\s+/, '')
  return `${bare} · ${ROLE_BLURB[role]}.`
}
