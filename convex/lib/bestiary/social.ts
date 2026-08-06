// Social NPCs: thirty townspeople, villagers and dockhands a DM can drop into a scene.
//
// ⚠️ **THESE THIRTY ARE THE AUTHORED PART OF THE CORPUS, AND THE ONLY ONE.** The other two
// hundred and fifty-three creatures are transcribed from the D&D 5e (2024) SRD 5.2.1 by
// scripts/srd/creatures.mjs — every number on them is printed in that document and can be
// checked against it. **Nothing here can be.** The SRD has no innkeeper, no harbourmaster
// and no net-mender, so these were written for this application, and they are measured
// against the benchmark rows and the content rules in `bestiary.test.ts` and against nothing
// else.
//
// That is worth a paragraph rather than a footnote, because "which creatures were checked
// against what" is the first question anybody auditing this corpus will ask, and a file that
// looks exactly like the four generated ones beside it gives no clue. It is also why this
// file is **deliberately not regenerated**: the generator writes the four transcribed files
// and skips this one entirely, so a re-run cannot quietly invent a provenance these people
// do not have.
//
// Their eight combat blocks carry `abilityScores` and `saveBonuses` like every other
// creature, and those two are authored too — chosen to agree with the numbers already on the
// block, chiefly that a 2024 stat block's Initiative modifier is *"typically equal to its
// Dexterity modifier"*.
//
// Content only — the shape is in ./types.ts, and see the note at the top of that file for
// why nothing under this directory may ever be imported by the browser. The social block in
// particular is DM-only in its entirety, because what the innkeeper knows *is* the plot.
//
// **Editing an entry here changes that creature in every game that already links to it.**
// The corpus is linked rather than copied: a character document stores a `key` and the
// resolver reads this file at request time, so rewriting what the harbourmaster knows
// rewrites it in a campaign that met her three sessions ago. This is the opposite of how
// lib/rules.ts behaves — a catalogue entry is copied onto a sheet when it is added, and
// editing it afterwards changes nothing that already exists. Neither file can tell you
// which of the two it is from the inside, so: **rename rather than repurpose.** A new
// person is a new `key`; fixing a typo or sharpening a sentence is fine.
//
// ## Most of these have no combat block at all
//
// Twenty-two of the thirty are `social` only, with the `combat` key **omitted entirely** —
// not set to `undefined`, which is not a Convex value and is a different thing from absent.
// That is the whole reason `BestiaryCombat` is optional on the entry instead of the
// innkeeper having a shape of her own. The eight who do fight are the ones the source spec
// had in mind when it said combat statistics are included only if the NPC is expected to
// fight: a caravan guard, a hunter, a smith, a sailor in a taproom, a revenue man with two
// hired hands behind him. They sit between CR ⅛ and CR 1, because a townsperson is not a
// Tier IV threat, and their numbers are measured against the benchmark rows and pushed by
// role exactly as a monster's are.
//
// A non-combatant still carries `role`, `cr`, `tier`, the recommended party levels and both
// tag lists, because the picker sorts and filters on them whether or not there is a statline
// underneath. `cr: 0` with no combat block is unconstrained by the CR 0 content rules — they
// govern a statline, and there is no statline here to govern.
//
// ## They share a map on purpose, and it is deliberately unfinished
//
// Three places recur: the village of **Ashen Ford** on the Wain Road, the port of
// **Sallowquay** below it, and the city of **Greyhallow** above. Four loose threads run
// between them — thin old Verrow silver turning up in wages, something taking lambs off the
// high pasture, the *Cormorant* coming into harbour short-crewed, and a gallery the Hallow
// Delve sealed a generation ago and has evidently reopened. Pick three of these people and a
// DM gets a place rather than three strangers; pick one and nothing is presumed. There is no
// answer written down anywhere for what is in the gallery, and that is not an omission.
// Rename the places if the table already has its own — nothing reads them.

import type { BestiaryFile } from './types'

// ---------------------------------------------------------------------------
// Repeated values, factored out the way lib/library/wizard.ts factors its armour class.
// ---------------------------------------------------------------------------

const HUMAN = 'Humanoid (human)'
const DWARF = 'Humanoid (dwarf)'
const ELF = 'Humanoid (elf)'
const HALFLING = 'Humanoid (halfling)'
const GNOME = 'Humanoid (gnome)'

/**
 * A non-combatant suits any party, so the recommended range is the whole of the character
 * library's span rather than a narrower window that would only ever mislead a filter.
 */
const ANY_PARTY = { recommendedPartyLevelMin: 1, recommendedPartyLevelMax: 5 } as const

/** Ordinary people walk at the same rate. Nothing here rides, swims or flies. */
const ON_FOOT = 30

export const SOCIAL: BestiaryFile = {
  category: 'social',
  entries: [
    // -----------------------------------------------------------------------
    // Ashen Ford — the village at the crossing
    // -----------------------------------------------------------------------
    {
      key: 'innkeeper',
      name: 'Innkeeper',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Maergan Tolt keeps the Drowned Lamp, the only inn within a day of the ford at Ashen Ford.',
        personality: ['watchful', 'generous', 'tired'],
        usefulSkills: ['insight', 'perception', 'persuasion'],
        knows:
          'Three of her regulars have been paying in thin old silver of the Verrow mint, coin nobody has struck in four generations, and all three of them work the deep shift at the Hallow Delve. She keeps a jar of it under the bar and has told nobody, because the Ledger House in Greyhallow would want to know where it came from and so would the revenue.',
        questHooks:
          'A week of beds and board to anyone who will walk up to the Delve and find out which gallery the silver is coming out of.',
      },
      loot: 'A jar of thin old silver under the bar, the week\'s takings in a locked box and a very good bread knife.',
      notes:
        'Warm with anyone who buys a round and pays in copper. Goes quiet the moment the talk turns to coin, and will lie about the jar until someone makes it clear they already know about it.',
      blurb: 'The village inn — beds, gossip and a jar of coin she should not have.',
    },
    {
      key: 'barmaid',
      name: 'Barmaid',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Chaotic Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Nissa Crale carries the trays at the Drowned Lamp and has done since she was eleven.',
        personality: ['sharp', 'nosy', 'loyal'],
        usefulSkills: ['insight', 'deception', 'performance'],
        knows:
          'Who sat with whom, and for how long. She can name the two men who met a Greyhallow carter in the back corner on three separate nights and left before the bell, and she noticed that one of them never took his gloves off indoors, not even to eat.',
      },
      loot: 'A handful of copper in an apron pocket and a stub of chalk for the slate.',
      notes:
        'Talks freely to anyone who tips and treats her as a person, and stops dead if Maergan is within earshot. Repeats what she heard accurately and what she guessed in exactly the same tone, so it is worth asking her which is which.',
      blurb: 'Serving girl who remembers every conversation in the room.',
    },
    {
      key: 'farmer',
      name: 'Farmer',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban', 'forest'],
      social: {
        occupation:
          'Hob Wexley works forty acres of barley and turnips on the river side of Ashen Ford, with two sons and a mule.',
        personality: ['stubborn', 'practical', 'superstitious'],
        usefulSkills: ['animalHandling', 'athletics', 'insight'],
        knows:
          'He has lost four lambs off the Coldbarrow side in a fortnight, and whatever took them did not eat them where they fell — it carried them uphill. He also knows the miller has been short-weighting the village flour since spring and is too frightened of his mill debt to stop.',
        questHooks:
          'Wants the business on Coldbarrow settled before lambing, and will pay in food, a cart and the loan of the mule.',
      },
      loot: 'A worn scythe, a purse of mixed copper and a wheel of hard cheese.',
      notes:
        'Suspicious of strangers for about an hour and then talks without stopping. Will not go up onto Coldbarrow after dark for any money, and says so plainly instead of pretending otherwise.',
      blurb: 'Village farmer losing livestock, with a grudge against the miller.',
    },
    {
      // One of the eight who fight. A sling, two dogs and a wall she is not leaving:
      // archer numbers at the bottom of the ladder, and the dogs are an ability rather
      // than a second attack so the pair of them stay inside a CR ⅛ damage budget.
      key: 'shepherd',
      name: 'Shepherd',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'archer',
      tags: ['humanoid', 'mountain'],
      cr: 0.125,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['mountain', 'forest'],
      combat: {
        maxHp: 6,
        armourClass: 11,
        attackBonus: 3,
        initiativeBonus: 2,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 10, dex: 14, con: 10, int: 10, wis: 12, cha: 11 },
        saveBonuses: { str: 0, dex: 2, con: 0, int: 0, wis: 1, cha: 0 },
        skills: [
          { key: 'animalHandling', bonus: 4 },
          { key: 'perception', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Sling',
            damage: '1d4+1',
            damageType: 'bludgeoning',
            range: '30/120 ft.',
            text: 'A river stone whipped out of a leather cradle. She has brought down a fox at forty paces with one and can do it again in the dark.',
          },
        ],
        abilities: [
          {
            // The bite belongs to the dogs rather than to the shepherd, and it is flagged
            // anyway: it is damage arriving on whoever she pointed at, and it is the whole
            // of her threat. A shepherd stepped up whose dogs still bit for the CR ⅛ figure
            // would not have been stepped up at all.
            name: 'The Dogs',
            text: 'Two rough herding dogs answer her whistle and go for whatever she points them at, worrying at it until she calls them off.',
            roll: '1d4',
            scalesWithCr: true,
          },
          {
            name: 'Knows the Ground',
            text: 'She has walked every yard of the high pasture in the dark and knows where the wall is broken, where the drop is and where a frightened lamb hides.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Ilsa Coldbarrow grazes the village flock on the high pasture above Ashen Ford from spring to the first snow.',
        personality: ['solitary', 'blunt', 'fearless'],
        usefulSkills: ['animalHandling', 'perception', 'athletics'],
        knows:
          'Something comes down onto the high pasture at night and has done for three weeks. It takes one lamb and leaves the rest of the flock unbothered, which no wolf does. She has found the same narrow bare track twice, running from the broken pasture wall towards the old spoil heaps below the Hallow Delve.',
        questHooks:
          'She will guide anyone up to the wall and sit the whole night out with them, but she wants her flock watched by somebody while she does it.',
      },
      loot: 'A sling and a bag of river stones, a crook, a horn of small beer and a whistle carved from bone.',
      notes:
        'Slings first and asks afterwards at anything that comes over the wall in the dark. Trusts her dogs\' opinion of a stranger further than her own and will say so to the stranger\'s face.',
      blurb: 'Hill shepherd who fights for her flock and knows what is taking it.',
    },
    {
      key: 'miller',
      name: 'Miller',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Dunnet Ashe runs the water mill at the ford and holds the flour debt of half the village.',
        personality: ['anxious', 'greedy', 'ingratiating'],
        usefulSkills: ['deception', 'insight', 'investigation'],
        knows:
          'He owes the Ledger House in Greyhallow more than the mill is worth, and a man he will not name has been paying that debt down for him in old Verrow silver in exchange for the use of the mill loft two nights a month. He does not know what goes into the loft. He has never once gone up to look.',
        questHooks:
          'Would dearly like the arrangement ended without his creditors, his neighbours or the man himself learning that he said a word.',
      },
      loot: 'A ledger of village debts, a set of doctored weights and a purse far heavier than a miller\'s should be.',
      notes:
        'Agrees with whoever is in the room and changes his story the moment the pressure moves. Cracks quickly under a hard look and then immediately starts working out how to warn the other side.',
      blurb: 'Indebted miller renting out his loft to someone he will not name.',
    },
    {
      // Also one of the eight. Brute deviation, and note the armour class sits *below* the
      // benchmark row on purpose — he is easy to hit and the hammer is the point.
      key: 'blacksmith',
      name: 'Blacksmith',
      creatureType: DWARF,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'brute',
      tags: ['humanoid', 'urban'],
      cr: 0.5,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban', 'mountain'],
      combat: {
        maxHp: 22,
        armourClass: 10,
        attackBonus: 2,
        initiativeBonus: 0,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 16, dex: 10, con: 15, int: 11, wis: 12, cha: 10 },
        saveBonuses: { str: 3, dex: 0, con: 2, int: 0, wis: 1, cha: 0 },
        skills: [
          { key: 'athletics', bonus: 5 },
          { key: 'investigation', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Smith\'s Hammer',
            damage: '1d8+3',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A two-handed swing from a man who does this all day for a living. It lands like a falling gate and it does not need to land twice.',
          },
        ],
        abilities: [
          {
            name: 'Forge Grip',
            text: 'Hands used to holding hot iron steady. He can bend a bar, snap a weapon haft, or hold a door shut against two men leaning on it.',
            roll: null,
          },
          {
            name: 'Judge of Steel',
            text: 'One look and a thumbnail across the edge tells him what a blade is worth, who made it and whether it will survive the next fight.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Garrow Fenn keeps the forge at Ashen Ford and takes the Hallow Delve\'s ore in part trade.',
        personality: ['gruff', 'honest', 'proud'],
        usefulSkills: ['investigation', 'athletics', 'insight'],
        knows:
          'The ore out of the Delve changed about two months ago. The same seam is coming up with something in it that runs cold in the quench and will not hold a temper, and he has a bar of it on the wall to prove it. He wants to know which gallery it came from, because the miners have stopped answering that question.',
        questHooks:
          'Free shoeing, mending and sharpening for anyone who brings him a fist of ore out of the gallery the Delve boarded up.',
      },
      loot: 'A working forge, a rack of finished tools and a bar of dull ore on the wall that will not take an edge.',
      notes:
        'Works while he talks and does not stop for anybody. Swings whatever hammer is in his hand if a fight starts in his yard, and is perfectly willing to fill a doorway to end one.',
      blurb: 'Village smith who has noticed the mine\'s ore going wrong.',
    },
    {
      key: 'stablemaster',
      name: 'Stablemaster',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Peny Marrow keeps the yard and eleven stalls behind the Drowned Lamp and hires out horses by the day.',
        personality: ['brisk', 'shrewd', 'kind'],
        usefulSkills: ['animalHandling', 'perception', 'persuasion'],
        knows:
          'Every horse that has come through the ford in a decade and whose it was. She can tell the party that the two grey geldings stabled last week are Greyhallow city stock with the Serrast brand burned over into something else, and that the man who left them has not come back for them.',
      },
      loot: 'Tack, feed, a tally book of hires and a strongbox holding a fortnight\'s takings.',
      notes:
        'Warm with anyone who is decent to a horse and instantly cold with anyone who is not. Will not rent to a party she thinks means to ride an animal into a fight, and cannot be argued round on it.',
      blurb: 'Stable keeper who can trace any horse that has passed through.',
    },
    {
      key: 'healer',
      name: 'Healer',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Widow Sabbeth sets bones, stitches wounds and sits with the dying in Ashen Ford and the four farms around it.',
        personality: ['calm', 'unshockable', 'frank'],
        usefulSkills: ['insight', 'investigation', 'perception'],
        knows:
          'She has treated three miners in six weeks for the same two things: a grey rash on the hands and forearms that will not wash off, and a cough none of them had at midwinter. All three came off the same shift, and all three lied to her about which gallery they had been working.',
        questHooks:
          'She wants a bucket of the water they are drinking down there, carried up unspilled and unmixed, and she will treat the party free for a season for it.',
      },
      loot: 'A satchel of clean linen, needle and gut, a bottle of poppy syrup and a jar of leeches.',
      notes:
        'Will treat anyone, including whatever the party dragged in, and asks her questions while her hands are busy. Keeps everything a patient tells her, which cuts both ways.',
      blurb: 'Village healer treating three miners for something she cannot name.',
    },
    {
      key: 'herbalist',
      name: 'Herbalist',
      creatureType: GNOME,
      size: 'small',
      alignment: 'Chaotic Neutral',
      role: 'support',
      tags: ['humanoid', 'forest'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['forest', 'swamp'],
      social: {
        occupation:
          'Corin Thistlewood gathers and sells herbs, roots and less legal preparations from a cottage on the Mereholt wood side.',
        personality: ['eccentric', 'curious', 'evasive'],
        usefulSkills: ['arcana', 'investigation', 'perception'],
        knows:
          'Which plants in Mereholt have failed this year, and where the dead ring in the bracken is — a circle forty paces across, north of the charcoal burner\'s clearing, where nothing has come up since midwinter. He has taken soil out of the middle of it and it smells of the sea, which is impossible this far inland.',
      },
      loot: 'Bundles of drying herbs, three unlabelled bottles and a purse of silver he cannot account for.',
      notes:
        'Will talk for an hour about anything except where his rarer stock comes from. Trades willingly, extends credit to nobody, and is genuinely delighted by anyone who brings him a plant he has not seen before.',
      blurb: 'Woodland herbalist who has found a circle where nothing grows.',
    },
    {
      // One of the eight, and the archer of the pair: a bow above the row on attack bonus,
      // a knife for when something is already on top of him, and hit points well under it.
      key: 'hunter',
      name: 'Hunter',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'archer',
      tags: ['humanoid', 'forest'],
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
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 11, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
        saveBonuses: { str: 0, dex: 3, con: 1, int: 0, wis: 2, cha: 0 },
        skills: [
          { key: 'perception', bonus: 5 },
          { key: 'stealth', bonus: 5 },
          { key: 'animalHandling', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Hunting Bow',
            damage: '1d8+2',
            damageType: 'piercing',
            range: '150/600 ft.',
            text: 'A patient shot from cover, taken when the target turns its head. He picks the gap in the trees before he draws.',
          },
          {
            name: 'Long Knife',
            damage: '1d4',
            damageType: 'piercing',
            range: 'melee',
            text: 'A skinning knife, used the way a man uses one when something has got closer than he wanted.',
          },
        ],
        abilities: [
          {
            name: 'Reads the Ground',
            text: 'Give him a footprint and an hour and he will tell you the weight of the thing that made it, which way it went and whether it was carrying something.',
            roll: null,
          },
          {
            name: 'Marked Quarry',
            text: 'He chooses one target before the first shot and spends the whole fight on that one, following it through cover rather than switching to an easier mark.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Auld Rike traps and shoots for the Ashen Ford tables and takes hides down to Sallowquay twice a year.',
        personality: ['taciturn', 'patient', 'unsentimental'],
        usefulSkills: ['perception', 'stealth', 'animalHandling'],
        knows:
          'The narrow track off the high pasture is not a wolf\'s and not a man\'s: two feet, a long stride, no claw. It runs into the old spoil heaps below the Delve and does not come out the far side. He has followed it to the mouth twice and turned back both times, and he is not ashamed of either.',
        questHooks:
          'Will take a party to the mouth of the spoil heap for the price of a decent bow, and will wait outside it for one day and not two.',
      },
      loot: 'A good bow, a full quiver, two braces of rabbits and a roll of green hides.',
      notes:
        'Says as little as the situation allows and none of it wrong. Shoots from cover and moves after every shot, and will walk away from a fight he judges lost without any argument about it.',
      blurb: 'Woodsman and bowman who has tracked the thing taking the lambs.',
    },
    {
      key: 'gravedigger',
      name: 'Gravedigger',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban', 'ruins'],
      social: {
        occupation:
          'Tam Hollow digs and fills the yard behind the chapel at Ashen Ford and keeps the yard book.',
        personality: ['morbid', 'gentle', 'sleepless'],
        usefulSkills: ['investigation', 'perception', 'insight'],
        knows:
          'Two graves in his yard have been opened and refilled since the thaw — neatly, by somebody who knew the work — and both held men who died in the Delve thirty years ago. He has reported it to nobody, because the yard book is in his handwriting and he expects to be blamed.',
        questHooks:
          'He will open one of the two again if somebody will stand in the yard with a lantern while he does it.',
      },
      loot: 'A spade, a shuttered lantern, the yard book and a small tin of things he has found in the soil.',
      notes:
        'Grateful for company and talks far too much once he has any. Nervous of anyone official, and will produce the yard book unasked to prove he has done nothing wrong.',
      blurb: 'Gravedigger whose yard has been opened and tidily refilled.',
    },
    {
      key: 'mayor',
      name: 'Mayor',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'controller',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Ordric Vale is the elected reeve of Ashen Ford, which chiefly means he takes the road toll and answers to Greyhallow for it.',
        personality: ['cautious', 'vain', 'pragmatic'],
        usefulSkills: ['persuasion', 'deception', 'insight'],
        knows:
          'The toll returns he sends to Greyhallow have not matched what the ford actually takes for two years, because the Delve\'s ore carts cross at night and pay him directly. He knows exactly who arranged that and is waiting to see whether it turns out to be his problem or the mine\'s.',
      },
      loot: 'A chain of office worth rather more than the village, the toll box and two sets of accounts.',
      notes:
        'Receives strangers formally, at length, and in his front room. Helps generously the instant helping makes him look decisive, and drops a matter the instant it stops doing that.',
      blurb: 'Village reeve keeping two sets of toll accounts.',
    },
    {
      key: 'ferryman',
      name: 'Ferryman',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'aquatic', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic', 'urban'],
      social: {
        occupation:
          'Bost works the flat-bottomed ferry at Ashen Ford whenever the river runs too high to wade, which is most of spring.',
        personality: ['laconic', 'fair', 'immovable'],
        usefulSkills: ['athletics', 'perception', 'insight'],
        knows:
          'Everyone who has crossed the river in the past month and roughly what they were carrying, because he charges by weight and guesses well. He remembers the two men who paid double to cross in the dark with a long crate and would not let him take an end of it.',
      },
      loot: 'A pole, a coil of good rope and a wet purse of copper.',
      notes:
        'Says little, and will not cross for any amount of money when the water is up. Answers a direct question honestly and never volunteers a second sentence.',
      blurb: 'River ferryman who weighs everything that crosses.',
    },

    // -----------------------------------------------------------------------
    // Sallowquay — the port
    // -----------------------------------------------------------------------
    {
      key: 'harbourmaster',
      name: 'Harbourmaster',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'controller',
      tags: ['humanoid', 'aquatic', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic', 'urban'],
      social: {
        occupation:
          'Ysolde Kerr keeps the harbour book at Sallowquay: berths, tides, manifests and the fees on all three.',
        personality: ['exacting', 'incorruptible', 'overworked'],
        usefulSkills: ['investigation', 'insight', 'intimidation'],
        knows:
          'The Cormorant came in on the last tide three hands short of her manifest and with her hold at half the weight it should have been, and her master signed the book anyway. Ysolde has refused to clear the ship to sail, and the Ledger House in Greyhallow is leaning on her hard to change her mind.',
        questHooks:
          'She wants two outsiders aboard the Cormorant as harbour witnesses when she searches her at dawn, because she cannot trust her own men to be the ones who saw it.',
      },
      loot: 'The harbour book, a brass tide clock and a ring of keys to every warehouse on the quay.',
      notes:
        'Will not take a bribe, and will remember having been offered one for years. Gives a straight answer to a straight question and has no patience whatever for a party that will not come to the point.',
      blurb: 'Port official refusing to clear a ship that came in wrong.',
    },
    {
      key: 'fisherman',
      name: 'Fisherman',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'aquatic'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic'],
      social: {
        occupation:
          'Ovid Sark takes a two-man boat out of Sallowquay for herring and whatever else the season gives him.',
        personality: ['weathered', 'fatalistic', 'talkative'],
        usefulSkills: ['perception', 'athletics', 'animalHandling'],
        knows:
          'He pulled up a sealed cask off Gaunt Head that had no business being in the water, and there are more of them down there — he can put a boat within twenty yards of the spot. He also watched the Cormorant stand off the head for half a night with no lamp showing before she came in.',
      },
      loot: 'Nets, lines, a gutting knife and a sealed cask in his shed that he has not opened.',
      notes:
        'Talks the whole way out and the whole way back. Superstitious about what he hauls up, and will cut a line rather than land something he does not like the feel of.',
      blurb: 'Herring fisherman who knows where the casks went over.',
    },
    {
      // One of the eight: brute numbers, and the only one of them who starts the fight.
      key: 'sailor',
      name: 'Sailor',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'brute',
      tags: ['humanoid', 'aquatic'],
      cr: 0.25,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['aquatic', 'urban'],
      combat: {
        maxHp: 16,
        armourClass: 10,
        attackBonus: 2,
        initiativeBonus: 1,
        passivePerception: 11,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 14, dex: 12, con: 14, int: 10, wis: 12, cha: 11 },
        saveBonuses: { str: 2, dex: 1, con: 2, int: 0, wis: 1, cha: 0 },
        skills: [
          { key: 'athletics', bonus: 4 },
          { key: 'intimidation', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Belaying Pin',
            damage: '1d6+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A turned length of hardwood swung with a shoulder behind it. He has settled a great many arguments with one and expects to settle this one.',
          },
        ],
        abilities: [
          {
            name: 'Deck Brawler',
            text: 'He fights the way a crowded deck teaches: elbows, boots, a thumb in the eye, and no interest at all in whether it looks fair.',
            roll: null,
          },
          {
            name: 'Sure on a Wet Deck',
            text: 'Years of footing on a heaving ship. He keeps his feet on ice, on scree and halfway up a ladder, and is very hard to put on his back.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Hask Bellow is three weeks off the Cormorant and drinking his pay through the taprooms along the Sallowquay front.',
        personality: ['loud', 'reckless', 'superstitious'],
        usefulSkills: ['athletics', 'intimidation', 'perception'],
        knows:
          'Why the Cormorant is three hands short. They went over the side off Gaunt Head at night with the cargo, on the master\'s order, and Hask was on the line that lowered the last cask. He will not say a word of it sober and will say all of it drunk, and he is terrified that the master knows which.',
        questHooks:
          'Wants passage out of Sallowquay on anything going upriver, and will trade the whole story for it.',
      },
      loot: 'A month\'s pay mostly spent, a belaying pin he should not be carrying ashore and a lock of hair folded in oilcloth.',
      notes:
        'Cheerful until he is contradicted and then straight to his fists, and he fights to win rather than to make a point. Wakes up frightened and denies every word he said the night before.',
      blurb: 'Discharged sailor who knows what went over the side, and brawls.',
    },
    {
      key: 'shipwright',
      name: 'Shipwright',
      creatureType: DWARF,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['humanoid', 'aquatic', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic', 'urban'],
      social: {
        occupation:
          'Marda Trine owns the small yard at the top of the Sallowquay hard and repairs everything the port floats.',
        personality: ['blunt', 'precise', 'unbribable'],
        usefulSkills: ['investigation', 'athletics', 'insight'],
        knows:
          'The Cormorant\'s hull has been altered: a false floor forward, done well and done recently, and not in this yard. She can name which of the four yards along that coast has both the timber and the skill for that work, and she wants nothing at all to do with what is under it.',
      },
      loot: 'A yard of seasoned timber, a chest of shipwright\'s tools and a folio of hull drawings.',
      notes:
        'Answers questions about wood and workmanship at length and everything else in three words. Will not board another shipwright\'s work uninvited, and states that as though it were law rather than manners.',
      blurb: 'Dockyard shipwright who has seen the false floor in a hull.',
    },
    {
      key: 'lighthouse-keeper',
      name: 'Lighthouse Keeper',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'aquatic'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic'],
      social: {
        occupation:
          'Cleave Ondry keeps the light on Gaunt Head alone for nine months of the year and rows in for oil once a fortnight.',
        personality: ['isolated', 'meticulous', 'haunted'],
        usefulSkills: ['perception', 'insight', 'arcana'],
        knows:
          'He logs every hull that passes and the hour it passed. The Cormorant stood off the head from midnight to nearly dawn showing no lamp, and a small boat worked between her and the rocks the entire time. He wrote it all down because that is the job, and nobody has ever asked to read the log.',
        questHooks:
          'Somebody has put out his light on the seaward side twice this month, and he will not climb the stair after dark on his own again.',
      },
      loot: 'A cask of lamp oil, the light\'s log going back eleven years and an excellent brass glass.',
      notes:
        'Starved of company and reluctant to let a visitor leave. Precise about everything he has written down, vague about anything he has only felt, and scrupulously honest about which is which.',
      blurb: 'Lighthouse keeper whose log records the night in question.',
    },
    {
      key: 'net-mender',
      name: 'Net-Mender',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'support',
      tags: ['humanoid', 'aquatic', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['aquatic', 'urban'],
      social: {
        occupation:
          'Ma Weft mends nets on the Sallowquay front for a copper a fathom and has sat in the same spot for thirty years.',
        personality: ['garrulous', 'kindly', 'indiscreet'],
        usefulSkills: ['insight', 'perception', 'persuasion'],
        knows:
          'Every family on the front, every feud and who is sleeping where. She knows the chandler on Cable Street has taken on three men who are plainly not chandlers and has stopped selling to the boats, and she knows which of the Cormorant\'s missing hands had a wife.',
      },
      loot: 'A basket of twine, a netting needle worn smooth and a tin of boiled sweets.',
      notes:
        'Tells anyone anything, which makes her the best source on the front and a terrible person to confide in. Feeds any party that sits down beside her and is very hard to get away from.',
      blurb: 'Dockside net-mender who repeats everything she hears.',
    },

    // -----------------------------------------------------------------------
    // Greyhallow — the city, and the road between
    // -----------------------------------------------------------------------
    {
      key: 'merchant',
      name: 'Merchant',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Aldo Venn keeps a general warehouse on the Cinder Row in Greyhallow and runs two carts down to the ford and back each month.',
        personality: ['affable', 'calculating', 'indebted'],
        usefulSkills: ['persuasion', 'deception', 'investigation'],
        knows:
          'His carts have been carrying sealed crates for the Ledger House at four times the honest rate, off the manifest, between Greyhallow and a chandler on Cable Street in Sallowquay. He has never opened one. One of them was warm to the hand in a cold week, and he has thought about that a great deal.',
      },
      loot: 'Bolts of cloth, salt, lamp oil, nails, forty ells of rope and a strongbox of mixed coin.',
      notes:
        'Sells to anybody and haggles for the sport of it rather than the need. Genuinely likeable, and will give up a confidence to protect a contract without ever thinking of that as betrayal.',
      blurb: 'City merchant hauling crates he has never been allowed to open.',
    },
    {
      key: 'noble',
      name: 'Noble',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'controller',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Lady Ottiline Serrast holds the Serrast seat in Greyhallow and the mineral rights to the Hallow Delve.',
        personality: ['gracious', 'ruthless', 'bored'],
        usefulSkills: ['persuasion', 'deception', 'insight'],
        knows:
          'The Delve stopped sending her its assay reports four months ago, and her steward has been paying the mine\'s wages out of the house purse ever since without being able to explain why. She suspects the steward before she suspects the mine, and she has told nobody in the house that she suspects anything at all.',
        questHooks:
          'Will retain the party privately, well and in writing, to go to the Delve as her agents — on the condition that they come back to her before they go to anyone else.',
      },
      loot: 'Rings, a signet worth a small estate and a letter of credit drawn on the Ledger House.',
      notes:
        'Charming, and treats every conversation as a negotiation she is already ahead in. Pays generously, expects absolute discretion, and drops anyone who embarrasses her without a second thought.',
      blurb: 'City noble who owns the mine and has stopped hearing from it.',
    },
    {
      key: 'scholar',
      name: 'Scholar',
      creatureType: ELF,
      size: 'medium',
      alignment: 'Neutral',
      role: 'support',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban', 'ruins'],
      social: {
        occupation:
          'Magister Brann Ivory reads and catalogues at the Chapter House in Greyhallow, chiefly the pre-Verrow settlements of the upper river.',
        personality: ['pedantic', 'excitable', 'absent-minded'],
        usefulSkills: ['arcana', 'investigation', 'insight'],
        knows:
          'The Verrow mint closed because the seam behind it was abandoned, and the abandonment survives in one sentence of one survey: the lower workings were sealed, and the men who sealed them were paid for the rest of their lives never to describe what they had done. The workings named in that survey lie under the present Hallow Delve.',
        questHooks:
          'Will pay for a wax rubbing of any inscription at the sealed face, and would dearly love to be taken along, which would be a mistake.',
      },
      loot: 'Three borrowed volumes he should have returned, a case of rubbing wax and a purse of study stipend.',
      notes:
        'Answers the question he finds interesting rather than the one he was asked, and is worth waiting out for it. Believes a written record over a living witness every single time.',
      blurb: 'City scholar who can name what the mine sealed, and when.',
    },
    {
      key: 'scribe',
      name: 'Scribe',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Petrus Quill writes letters, wills and contracts for hire from a stall outside the Ledger House in Greyhallow.',
        personality: ['discreet', 'observant', 'fussy'],
        usefulSkills: ['investigation', 'insight', 'deception'],
        knows:
          'He has copied the same unusual clause into four separate carriage contracts this year — a fee payable only where the cargo is never described — and he can name all four merchants and the Ledger House clerk who dictated it to him word for word each time.',
      },
      loot: 'A writing case, good ink, a bundle of copy drafts he was told to burn and a purse of small silver.',
      notes:
        'Professionally silent about his clients until it is shown that somebody else has already talked, at which point he is thorough. Keeps drafts of everything, which is his single indiscretion and the most useful thing about him.',
      blurb: 'Public scribe who keeps the drafts he was told to burn.',
    },
    {
      key: 'toymaker',
      name: 'Toymaker',
      creatureType: HALFLING,
      size: 'small',
      alignment: 'Chaotic Good',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Fennick Pell carves toys, puzzle boxes and clockwork birds in a shop halfway along the Cinder Row in Greyhallow.',
        personality: ['whimsical', 'meticulous', 'lonely'],
        usefulSkills: ['sleightOfHand', 'investigation', 'performance'],
        knows:
          'He built the lock for a customer who paid in thin old silver and wanted a strongbox that could not be opened twice. He remembers the man\'s hands, his accent, and the fact that the box was to be delivered to a chandler\'s cellar on Cable Street in Sallowquay rather than collected.',
      },
      loot: 'A bench of half-finished toys, a set of very fine tools and a drawer of odd silver coin.',
      notes:
        'Delighted by visitors and impossible to hurry. Will make anything for anybody, and remembers every commission of the last forty years in rather more detail than the customer would like.',
      blurb: 'City toymaker and lockwright who remembers every commission.',
    },
    {
      key: 'beggar',
      name: 'Beggar',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Chaotic Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Sixpence sits at the Cinder Row gate in Greyhallow with a cup, and misses nothing that goes through it.',
        personality: ['watchful', 'wheedling', 'proud'],
        usefulSkills: ['perception', 'deception', 'stealth'],
        knows:
          'Which carts leave the Cinder Row gate after the bell and who waves them through. Three nights running it has been the same closed cart with a crest painted over on the door, going out empty and coming back heavy, and the same gate sergeant finding something else to look at.',
      },
      loot: 'Nine copper in a cup, a good blanket and a knife nobody would guess he had.',
      notes:
        'Sells what he has seen at a fair price and does not invent any of it, because one bad tale ends the trade for good. Will not be seen talking to anybody in front of the gate guards, and expects to be met round the corner instead.',
      blurb: 'Gate beggar who sells what he sees and never guesses.',
    },
    {
      key: 'moneylender',
      name: 'Moneylender',
      creatureType: HALFLING,
      size: 'small',
      alignment: 'Lawful Neutral',
      role: 'support',
      tags: ['humanoid', 'urban'],
      cr: 0,
      tier: 1,
      ...ANY_PARTY,
      environmentTags: ['urban'],
      social: {
        occupation:
          'Ezra Halt lends at interest from a shuttered room behind the Ledger House and holds paper on half the Cinder Row.',
        personality: ['soft-spoken', 'patient', 'merciless'],
        usefulSkills: ['insight', 'intimidation', 'investigation'],
        knows:
          'Thin Verrow silver has been crossing his counter for five months from three different hands, and he has been buying it quietly below face value because it is old, heavy and worth more melted. He knows to the week when it started and which of the three brought him the first of it.',
        questHooks:
          'Will forgive a debt — the miller\'s, if the party asks for that one — in exchange for knowing where the silver actually comes from before the Ledger House works it out for itself.',
      },
      loot: 'A book of debts, a strongbox, a set of jeweller\'s scales and a drawer of old silver bought under weight.',
      notes:
        'Perfectly courteous, and entirely without mercy about a due date. Deals straight with anyone who deals straight with him, and never threatens anybody, because he has never needed to.',
      blurb: 'Moneylender quietly buying up the old silver by weight.',
    },
    {
      // One of the eight, and the reason the spec allows for it: he does not fight, the two
      // men behind him do. Controller numbers — the cane is barely a weapon and the writ is
      // the actual threat — and the one save DC in this file.
      key: 'tax-collector',
      name: 'Tax Collector',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Lawful Neutral',
      role: 'controller',
      tags: ['humanoid', 'urban'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban'],
      combat: {
        maxHp: 22,
        armourClass: 13,
        attackBonus: 4,
        initiativeBonus: 2,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: 12,
        abilityScores: { str: 11, dex: 14, con: 12, int: 14, wis: 14, cha: 15 },
        saveBonuses: { str: 0, dex: 2, con: 1, int: 2, wis: 2, cha: 2 },
        skills: [
          { key: 'insight', bonus: 4 },
          { key: 'intimidation', bonus: 4 },
          { key: 'investigation', bonus: 2 },
        ],
        attacks: [
          {
            name: 'Weighted Cane',
            damage: '1d6+2',
            damageType: 'bludgeoning',
            range: 'melee',
            text: 'A gentleman\'s walking cane with lead run into the head of it, brought down on a wrist or a collarbone without any change of expression.',
          },
        ],
        abilities: [
          {
            name: 'The Weight of the Law',
            text: 'He reads the writ aloud and names the penalty for obstructing it. Anyone not already committed to the fight must make a Wisdom saving throw or spend their turn arguing with him instead of acting.',
            roll: null,
          },
          {
            name: 'Hired Sergeants',
            text: 'Two paid men stand behind him and do the actual violence. Roll this for whichever of them the fight has reached.',
            roll: '1d6+1',
            scalesWithCr: true,
          },
        ],
      },
      social: {
        occupation:
          'Volm Dreck assesses and collects for the Greyhallow revenue along the Wain Road, with two hired men and a writ under the city seal.',
        personality: ['humourless', 'thorough', 'vindictive'],
        usefulSkills: ['investigation', 'intimidation', 'insight'],
        knows:
          'The ford at Ashen Ford has been under-declaring its toll for two years and he can prove that much from the Greyhallow side alone. What he cannot yet prove is where the reeve\'s share comes from, and he has noticed that some of it is being paid in coin that has not been legal tender for four generations.',
        questHooks:
          'Will deputise the party, on paper and badly, to open the mill loft with him — which is a good deal more authority than he actually holds.',
      },
      loot: 'A writ under the city seal, a strapped chest of collected coin and a cane weighted at one end.',
      notes:
        'Arrives with the two hired men at his shoulder and lets them do the standing about. Cannot be talked out of an assessment, and will absolutely take a bribe if it is large enough to retire on and offered where nobody can hear it.',
      blurb: 'Revenue assessor with hired muscle and a case against the village.',
    },
    {
      // One of the eight, and the tank of them: high armour class, modest damage, and a
      // spear she is not going to leave the gap with.
      key: 'caravan-guard',
      name: 'Caravan Guard',
      creatureType: HUMAN,
      size: 'medium',
      alignment: 'Neutral Good',
      role: 'tank',
      tags: ['humanoid', 'urban'],
      cr: 0.5,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban', 'forest'],
      combat: {
        maxHp: 23,
        armourClass: 15,
        attackBonus: 4,
        initiativeBonus: 1,
        passivePerception: 12,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
        saveBonuses: { str: 2, dex: 1, con: 2, int: 0, wis: 1, cha: 0 },
        skills: [
          { key: 'athletics', bonus: 3 },
          { key: 'perception', bonus: 3 },
        ],
        attacks: [
          {
            name: 'Spear',
            damage: '1d6+1',
            damageType: 'piercing',
            range: 'melee or 20/60 ft.',
            text: 'A short, disciplined thrust over the top of the shield, taken back the moment it lands. She would rather hit four times than swing once.',
          },
        ],
        abilities: [
          {
            name: 'Holds the Line',
            text: 'She plants herself in the gap between the carts and stays in it. Anything that wants at the cargo has to deal with her before it deals with anyone else.',
            roll: null,
          },
          {
            name: 'Watch Rotation',
            text: 'On the road she sets the watches and takes the worst one herself, so a camp with her in it is very rarely caught asleep.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Beske Ardal hires out by the trip, walking merchants\' carts between Greyhallow, the ford and Sallowquay.',
        personality: ['steady', 'wry', 'underpaid'],
        usefulSkills: ['perception', 'insight', 'athletics'],
        knows:
          'Which stretches of the Wain Road are genuinely dangerous this season and which are only said to be. She has walked Aldo Venn\'s sealed crates down four times and can describe the men who take delivery at the Cable Street end, including the one who counts the crates aloud in a language she has never heard.',
      },
      loot: 'A spear, a battered shield, a helmet that does not match it and eight days\' wages.',
      notes:
        'Stands where the trouble is going to be and stays there, which is the whole of her tactics and quite enough. Will not break a contract she has taken, and says plainly at the start what she will not do.',
      blurb: 'Hired road guard who has walked the crates and looked at the buyers.',
    },
    {
      // One of the eight. A skirmisher because he has survived thirty years by leaving:
      // the ability that matters is the exit he picked on the way in.
      key: 'retired-adventurer',
      name: 'Retired Adventurer',
      creatureType: DWARF,
      size: 'medium',
      alignment: 'Chaotic Good',
      role: 'skirmisher',
      tags: ['humanoid', 'urban', 'ruins'],
      cr: 1,
      tier: 2,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 3,
      environmentTags: ['urban', 'ruins', 'cave'],
      combat: {
        maxHp: 21,
        armourClass: 14,
        attackBonus: 5,
        initiativeBonus: 3,
        passivePerception: 14,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 14, dex: 16, con: 13, int: 11, wis: 14, cha: 12 },
        saveBonuses: { str: 2, dex: 3, con: 1, int: 0, wis: 2, cha: 1 },
        skills: [
          { key: 'athletics', bonus: 4 },
          { key: 'perception', bonus: 4 },
          { key: 'insight', bonus: 4 },
        ],
        attacks: [
          {
            name: 'Old Sword',
            damage: '1d8+3',
            damageType: 'slashing',
            range: 'melee',
            text: 'Badly kept and beautifully used. He steps in on the wrong side of a guard, cuts once, and is out again before the answer comes.',
          },
        ],
        abilities: [
          {
            name: 'Seen It Before',
            text: 'Thirty years of other people\'s ambushes. The first time a fight turns unfair, he is already moving towards the exit he picked out when he walked in.',
            roll: null,
          },
          {
            // Unflagged, and not an oversight: the roll is hit points coming back to him,
            // not damage going out. A recovery does not belong to a challenge rating any
            // more than a troll's regeneration does.
            name: 'Old Habits',
            text: 'Once in a fight he can take a breath, spit, and shrug off enough of what has been done to him to keep going.',
            roll: '1d8',
          },
        ],
      },
      social: {
        occupation:
          'Halgrim Bones drinks at the Drowned Lamp and, thirty years ago, went down the Hallow Delve for the house that owned it.',
        personality: ['boastful', 'shrewd', 'frightened'],
        usefulSkills: ['insight', 'perception', 'arcana'],
        knows:
          'He was one of the men paid to seal the lower gallery, and he knows the way in that was left open — behind the spoil heaps, not through the working. He knows what was sealed in there by the sound it made rather than by sight, and he knows the thin Verrow silver in the village comes out of that gallery, which means somebody has opened it again.',
        questHooks:
          'Will draw the party a map of the lower workings for nothing, and can be talked into walking them as far as the spoil heaps and not one step past.',
      },
      loot: 'A good sword badly kept, a dwarf-made lantern and a purse holding two thin old silver coins he has never spent.',
      notes:
        'Tells the same three stories until somebody asks about the fourth, and then goes cold and sober in a moment. Fights well and briefly, and leaves the instant the odds turn, which is why he is the one still alive.',
      blurb: 'Old hand who helped seal the mine and knows the way back in.',
    },
    {
      // The last of the eight, and the weakest: a pick, a lamp and no armour worth the
      // name. Brute deviation still applies — the armour class is under the row.
      key: 'miner',
      name: 'Miner',
      creatureType: DWARF,
      size: 'medium',
      alignment: 'Neutral',
      role: 'brute',
      tags: ['humanoid', 'cave', 'mountain'],
      cr: 0.125,
      tier: 1,
      recommendedPartyLevelMin: 1,
      recommendedPartyLevelMax: 2,
      environmentTags: ['cave', 'mountain'],
      combat: {
        maxHp: 10,
        armourClass: 9,
        attackBonus: 1,
        initiativeBonus: 0,
        passivePerception: 10,
        speed: ON_FOOT,
        saveDc: null,
        abilityScores: { str: 13, dex: 10, con: 13, int: 9, wis: 10, cha: 9 },
        saveBonuses: { str: 1, dex: 0, con: 1, int: -1, wis: 0, cha: -1 },
        skills: [
          { key: 'athletics', bonus: 3 },
          { key: 'perception', bonus: 1 },
        ],
        attacks: [
          {
            name: 'Pick',
            damage: '1d6+1',
            damageType: 'piercing',
            range: 'melee',
            text: 'A short mining pick swung overhand in a tunnel too tight for anything longer. Nineteen years of the same motion have made it accurate.',
          },
        ],
        abilities: [
          {
            name: 'Sure in the Dark',
            text: 'He works by feel in complete darkness and never loses his bearings underground, and he hears bad rock in a ceiling before it goes.',
            roll: null,
          },
        ],
      },
      social: {
        occupation:
          'Cobb Tyne cuts stone in the Hallow Delve on the deep shift and has done for nineteen years.',
        personality: ['grim', 'tight-lipped', 'loyal'],
        usefulSkills: ['athletics', 'perception', 'investigation'],
        knows:
          'The deep shift broke into an older working two months ago, and the overseer had it boarded the same day and paid the eleven men on that shift in old silver to say nothing about it. Cobb took the silver. Three of the eleven now have a grey rash on their hands, and one of them has stopped coming to work at all.',
        questHooks:
          'He wants the man who stopped coming to work found, and he will not go looking himself while the overseer\'s brother is watching the gate.',
      },
      loot: 'A pick, a shuttered lamp, a bag of thin old silver and a fist of dull ore that will not take a temper.',
      notes:
        'Will not talk about the Delve inside the Delve, or anywhere the overseer\'s brother might hear him. Buys a round after the third question and answers on the fourth.',
      blurb: 'Deep-shift miner paid in old silver to keep quiet.',
    },
  ],
}
