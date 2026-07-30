# DnD Lite Monster, Enemy & NPC Library Specification

> **Source spec for [Milestone 5](roadmap.md#milestone-5--monster-enemy-and-npc-library), kept
> verbatim.** Written outside this repository and reproduced here unedited, on the same principle
> [requirements.md](requirements.md) follows: a spec quietly rewritten to agree with the build can no
> longer catch the build being wrong. **Three of its sections are overruled** — Library Linking,
> Output, and the mobile-screen design goal — and the reasons live in the Milestone 5 section of
> [roadmap.md](roadmap.md), not in edits to the text below. **One feature has been added** since it
> was written, and is recorded in [Additions to this spec](#additions-to-this-spec) at the bottom
> rather than folded into the sheet definitions above. Read this for what was asked for; read the
> roadmap for what is being built and why the difference.

## Purpose

Generate a complete library of Monsters, Humanoid Enemies and NPCs for
the DnD Lite application.

This library supports a streamlined DnD Lite ruleset where **player
characters progress from Levels 1--5 only**. The library should be
balanced specifically for this custom ruleset rather than reproducing
official D&D 5e monster statistics.

The library will act as the **master database** from which campaigns
create editable linked copies.

------------------------------------------------------------------------

# Design Goals

- Fast to run
- Beginner friendly
- Fits on a single mobile phone screen
- Minimal bookkeeping
- No rules lookups required
- Pre-calculated values
- Iconic fantasy creatures over obscure monsters

Do **not** attempt to recreate the full Monster Manual.

------------------------------------------------------------------------

# Library Size

### Monsters

Target: **60--80**

### Humanoid Enemies

Target: **25--35**

### Social NPCs

Target: **25--35**

------------------------------------------------------------------------

# Difficulty Structure

Maximum creature difficulty is approximately **CR 6**.

| Tier | CR | Intended Party |
| --- | --- | --- |
| I | 0--1/4 | Level 1 |
| II | 1/2--1 | Levels 1--2 |
| III | 2--3 | Levels 2--3 |
| IV | 4--5 | Levels 4--5 |
| V | 6 | Level 5 Boss Encounter |

Never generate creatures above CR 6.

------------------------------------------------------------------------

# Game Balance

The creature library **must be balanced against the DnD Lite Character
Library**.

Do **not** simply copy official D&D 5e statistics.

Balance creatures around the custom progression:

- Maximum player level 5
- Subclasses gained at Level 2
- Ability Score Improvement or Feat at Level 3
- Major power spike at Level 4 (Extra Attack or 3rd-level spells)
- Limited spell lists
- Simplified class abilities

Creature statistics should be tuned against the expected power level of
those character sheets.

When balancing creatures consider:

- Expected player HP
- Expected AC
- Average player damage output
- Typical feats
- Typical spell selections
- Action economy
- Number of attacks
- Special abilities

The objective is enjoyable encounters rather than mathematical adherence
to official CR calculations.

------------------------------------------------------------------------

# Combat Creature Sheet

Every combat creature should contain:

## Header

- Library ID
- Name
- Creature Type
- Size
- Alignment
- Role
- Challenge Rating (CR)
- Difficulty Tier
- Recommended Party Level

The CR, Tier and Recommended Party Level should be displayed prominently
on the character sheet.

------------------------------------------------------------------------

## Combat

- HP
- AC
- Speed
- Initiative
- Passive Perception

------------------------------------------------------------------------

## Attacks

Maximum three attacks.

Each attack contains:

- Name
- Attack Bonus
- Damage
- Damage Type
- Range (if applicable)

------------------------------------------------------------------------

## Skills

Use ONLY the DnD Lite skills:

- Athletics
- Acrobatics
- Sleight of Hand
- Stealth
- Arcana
- Investigation
- Animal Handling
- Insight
- Perception
- Deception
- Intimidation
- Performance
- Persuasion

Maximum four skills.

------------------------------------------------------------------------

## Special Abilities

Maximum three.

Use concise beginner-friendly wording.

Examples:

- Pack Tactics
- Regeneration
- Nimble Escape
- Breath Weapon
- Magic Resistance
- False Appearance
- Spellcasting (limited)

------------------------------------------------------------------------

## Loot

Generate sensible treasure.

Examples:

- Gold
- Weapon
- Potion
- Gem
- Map
- Key
- Quest Item

------------------------------------------------------------------------

## DM Notes

One or two sentences describing behaviour, tactics or habitat.

------------------------------------------------------------------------

# Social NPC Sheet

Contains:

- Library ID
- Name
- Occupation
- Personality (3 keywords)
- Useful Skills
- Important Knowledge
- Quest Hooks (optional)
- Inventory (optional)

Combat statistics are only included if the NPC is expected to fight.

------------------------------------------------------------------------

# Spellcasters

Maximum:

- 2 Cantrips
- 4 Levelled Spells

Prioritise:

- Combat magic (damage spells, character control/manipulation, buffs, debuffs, etc)
- Note: Unlike players, enemies dont really need utility / exploration / discovery spells like detect magic, etc

------------------------------------------------------------------------

# Roles

Every combat creature must have one role.

Examples:

- Brute
- Tank
- Skirmisher
- Archer
- Controller
- Spellcaster
- Support
- Boss

------------------------------------------------------------------------

# Tags

Include searchable tags.

Examples:

Undead, Humanoid, Beast, Dragon, Fiend, Construct, Elemental, Flying,
Aquatic, Forest, Cave, Urban, Desert, Boss

------------------------------------------------------------------------

# Encounter Metadata

Store metadata for encounter generation:

- recommendedPartyLevelMin
- recommendedPartyLevelMax
- encounterRole
- difficultyTier
- challengeRating
- environmentTags

------------------------------------------------------------------------

# Library Linking

The Monster Library is the canonical source.

When a creature is added to a campaign:

- Create a campaign copy.
- Store a reference to the master library record.
- Allow the DM to edit every field.

Edits must never modify the master library.

Recommended metadata:

- libraryId
- libraryVersion
- sourceLibrary
- isModified
- modifiedFields\[\]

The application should support:

- View Original
- Compare Changes
- Reset to Library Defaults
- Detect newer library versions

------------------------------------------------------------------------

# Suggested Monsters

Tier I: Goblin, Kobold, Bandit, Guard, Skeleton, Zombie, Wolf, Giant
Rat, Giant Spider, Stirge

Tier II: Orc, Hobgoblin, Bugbear, Dire Wolf, Ghoul, Harpy, Brown Bear,
Animated Armor

Tier III: Ogre, Mimic, Gelatinous Cube, Berserker, Priest, Owlbear,
Knight, Veteran, Minotaur, Hell Hound, Manticore

Tier IV: Troll, Ettin, Ghost, Banshee, Gladiator, Fire Elemental, Water
Elemental, Air Elemental, Earth Elemental

Tier V: Young White Dragon, Young Black Dragon, Young Green Dragon,
Chimera, Wyvern, Medusa, Hydra, Cyclops

------------------------------------------------------------------------

# Suggested Humanoid Enemies

Guard, Archer, Bandit, Thug, Veteran, Knight, Assassin, Cultist, Cult
Fanatic, Priest, Mage, Druid, Goblin Boss, Orc Warchief

------------------------------------------------------------------------

# Suggested Social NPCs

Merchant, Innkeeper, Farmer, Noble, Blacksmith, Hunter, Stablemaster,
Mayor, Sailor, Healer, Scholar, Miner, Fisherman

------------------------------------------------------------------------

# Output

Generate the library as structured JSON.

JSON is the single source of truth.

Generate Markdown documentation from the JSON if required.

------------------------------------------------------------------------

# Validation

Every entry must:

- Be balanced against the DnD Lite Character Library
- Have no more than 3 attacks
- Have no more than 3 special abilities
- Use only DnD Lite skills
- Be CR 6 or below
- Use pre-calculated values only
- Be written for beginners
- Avoid unnecessary D&D 5e complexity

------------------------------------------------------------------------

## Additions to this spec

> **Not part of the original.** Everything above is the spec as it arrived. A feature added afterwards
> is recorded here with a date behind it, on the same principle the sections above are left alone: a
> spec edited in place to match what was built can no longer be used to check what was built. The
> design and its reasoning live in the Milestone 5 section of [roadmap.md](roadmap.md); this is the
> statement of what was asked for.

### 2026-07-31 — CR scaling on an assigned creature

**In addition to editing an assigned creature's NPC sheet field by field, the DM can shift its
Challenge Rating up and down, and the sheet's statistics scale to match.**

The purpose is to make the tier structure above a starting point rather than a constraint. A DM who
wants a Troll — Tier IV, CR 5 — in front of a level 2 party should be able to drop it on the board and
step its CR down to 2, rather than recalculating hit points, armour class, attack bonus, damage,
initiative and four skill bonuses by hand and getting one of them wrong. The same in reverse: a Goblin
that has been the party's problem since level 1 can follow them up to CR 4 and still be a Goblin.

What is required of it:

- **A CR stepper on the assigned creature's sheet**, DM-only like the rest of that sheet, bounded by
  the CR 0–6 ceiling this spec already sets.
- **Scaling covers the numbers only** — HP, AC, attack bonus, damage, initiative, passive perception
  and skill bonuses. Name, creature type, size, alignment, role, tags, speed, loot, DM notes, special
  abilities and the number of attacks are unchanged by a shift.
- **A creature keeps its character across the shift.** A Tank scaled up is still unusually hard to hit;
  a Brute scaled down is still fragile for its rating. Scaling must not flatten every creature at a
  given CR into the same statline.
- **Reversible and non-compounding.** Shifting up and back down returns the original numbers exactly.
- **It does not overwrite the DM's own edits.** A field the DM has deliberately changed stays changed
  through a shift.
- **The shift is visible on the sheet**, alongside the creature's library CR, and can be reset.

Deliberately *not* asked for: automatic scaling to match the party, computing a creature's CR from its
statistics, encounter budgeting, or scaling the abilities and attack count rather than the numbers.
