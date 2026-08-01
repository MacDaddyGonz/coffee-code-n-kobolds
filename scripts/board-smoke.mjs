#!/usr/bin/env node
// Drives Milestone 2's board API and Milestone 3's character sheets against the
// REAL dev deployment.
//
// This exists because convex-test does not apply Convex's own value validation.
// Milestone 1 shipped a bug of exactly that shape: a truncated display name left
// a lone UTF-16 surrogate, which convex-test stored happily and a real deployment
// rejected. Everything here is therefore a genuine round trip — a real upload URL,
// a real POST of real bytes, real float64s through the position table — so a value
// the cloud refuses fails here rather than in front of the group on a Friday night.
//
// Milestone 3 gives a deployment far more to have an opinion about than Milestone 2
// did: a nested discriminated union in an optional field, arrays of objects at their
// forty-entry cap, emoji in prose a player typed, an optional field written as
// `undefined`, and NaN arriving where a whole number was expected. Every one of those
// is a value convex-test stores without comment.
//
// Milestone 4 adds a third member to that stored union, a nested object of optional
// fields inside it, and a new optional array of strings on the vitals row — and moves
// every number on a premade character out of the payload and into a library the
// client never sees. So the section for it asserts two things at once: that the
// deployment accepts the shapes, and that the numbers coming back are ones nobody
// sent. The library values it compares against are copied by hand for that reason.
//
// ⚠️ **Milestone 6 is the largest exposure the silently-dropped-field trap has had.**
// Two optional fields — `category` and `toHit` — landed on `sheetEntryValidator`, which
// is the one shape shared by a hero's feats, a hero's spells, a monster's actions and
// both override diffs: six array positions, all rebuilt field by field by a single
// `normaliseEntry`. That trap has shipped twice (`skillProficiencies`, then `speed`) and
// this script is the only thing that has ever caught it, because the dropped value
// round-trips through a validator that permits it to be absent and so the local suite
// stays green. Everything the entry sections below assert therefore comes in pairs: an
// entry sent WITH both fields that must come back with both, and a sibling sent with
// NEITHER that must come back with neither key present. Absence is a storable state on a
// real deployment or it is not, and only a real deployment can say.
//
// Milestone 7 adds three more optional stored fields — `NpcSheet.group`,
// `characters.reserved` and `tokens.controllerIds` — and one of them, `group`, goes
// through the same field-by-field rebuild the two above did. So sections 23 to 28 are
// written in the same pairs, and the last three of them are about a second thing only a
// real deployment settles: a **grant** is a door the DM opens onto this application's
// headline secret, so what has to be checked is not that it works but that it opens for
// exactly one seat. Every one of those scans has a positive control beside it, because a
// scan with nothing to find passes on a deployment that sent nobody anything.
//
//   node scripts/board-smoke.mjs
//
// Plain .mjs on purpose: no tsx, no new dependency, nothing to install.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ConvexHttpClient } from 'convex/browser'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The calibration of `Admittance [Gridded 16x12]`, with a deliberate offset. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680
const GRID = { gridSize: 140, gridOffsetX: 37.5, gridOffsetY: -12.25 }

/**
 * A 1×1 transparent PNG. Nothing server-side decodes it — `scenes.create` reads
 * only the stored size — but posting real image bytes to the real upload endpoint
 * is the point of this script, so it is a real PNG rather than random noise.
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

/**
 * Six catalogue entries, copied out of `convex/lib/rules.ts` word for word.
 *
 * Restated rather than imported for the reason `snapToGrid` below is restated: this
 * is plain .mjs on purpose, so it cannot import a .ts module, and a script that
 * derived its fixtures from the code under test would agree with a mangled
 * catalogue as readily as with a correct one. Copied text also means the round trip
 * below is over the real thing — em dashes, apostrophes and all — rather than over
 * `'x'.repeat(200)`.
 */
const CATALOGUE = {
  fireBolt: {
    key: 'fire-bolt',
    name: 'Fire Bolt',
    text: 'A mote of fire hurled at one target within 120 feet. On a hit it burns, and it sets light to anything flammable nobody is holding or wearing.',
    roll: '1d10',
    level: 0,
    // A spell that has to land before it burns anything, which is the shape a single
    // `roll` could not express and the reason `toHit` exists.
    category: 'weapon',
    toHit: '1d20+INT+PROF',
  },
  cureWounds: {
    key: 'cure-wounds',
    name: 'Cure Wounds',
    text: 'Touch a creature and restore hit points to it. Roll another 2d8 for each spell slot level above 1st.',
    roll: '2d8+WIS',
    level: 1,
    category: 'action',
  },
  fireball: {
    key: 'fireball',
    name: 'Fireball',
    text: 'A roaring sphere of flame fills a 20-foot radius around a point within 150 feet, going round corners to do it. Each creature there takes the damage, halved on a successful Dexterity saving throw. Another 1d6 per slot level above 3rd.',
    roll: '8d6',
    level: 3,
    category: 'action',
  },
  secondWind: {
    key: 'second-wind',
    name: 'Second Wind',
    text: 'A bonus action, once per rest, to catch your breath and regain hit points. Add your fighter level to the die.',
    roll: '1d10',
    level: null,
    category: 'action',
  },
  actionSurge: {
    key: 'action-surge',
    name: 'Action Surge',
    text: 'Once per rest, take one extra action on your turn — a whole second action, not a bonus action.',
    roll: null,
    level: null,
    category: 'passive',
  },
  // ⚠️ **The `+6 to hit` clause is gone from the prose and the number now lives in
  // `toHit`.** Recopied by hand from lib/rules.ts, along with the six other NPC weapons
  // that had the identical clause removed. A stale copy here would fail this script over
  // a change that was correct, and a smoke test that cries wolf is one the group learns
  // to ignore — which costs more than the coverage it was protecting.
  greatclub: {
    key: 'npc-greatclub',
    name: 'Greatclub',
    text: 'Melee attack, reach 5 feet, bludgeoning damage — an ogre with a tree trunk, and enough to fell a first-level character outright.',
    roll: '2d8+3',
    level: null,
    category: 'weapon',
    toHit: '1d20+6',
  },
  multiattack: {
    key: 'npc-multiattack',
    name: 'Multiattack',
    text: 'The creature takes two of its attacks on its turn instead of one. Roll each of them separately from its other entries.',
    roll: null,
    level: null,
    category: 'passive',
  },
}

/**
 * A catalogue entry copied onto a sheet, which is what the picker does: a copy, never a
 * pointer.
 *
 * `toHit` is spread conditionally rather than written as `undefined`, because
 * `undefined` is not a Convex value: naming the key and handing it that is a different
 * write from omitting the key, and only the second is what "this line does not roll to
 * hit" means. Getting this wrong here would make the key-absence checks below assert
 * nothing.
 */
function entryFrom(catalogue, id) {
  return {
    id,
    name: catalogue.name,
    text: catalogue.text,
    roll: catalogue.roll,
    level: catalogue.level,
    catalogueKey: catalogue.key,
    category: catalogue.category,
    ...(catalogue.toHit === undefined ? {} : { toHit: catalogue.toHit }),
  }
}

/**
 * A hand-typed entry, filled in by the caller. Everything the picker does not supply.
 *
 * ⚠️ **It deliberately supplies no `category`**, so an entry built by it is shaped
 * exactly like one written before Milestone 6 — which is the state every sheet in every
 * existing game is in, and the state this script has to prove a real deployment can
 * store. A caller that wants a category names one; the default is the legacy shape.
 */
function customEntry(fields) {
  return { roll: null, level: null, catalogueKey: null, ...fields }
}

/**
 * The sheet the round trip is asserted against.
 *
 * Deliberately awkward in the places a wire format is: an emoji and four scripts
 * worth of non-ASCII in one entry, a cantrip whose level is the number zero rather
 * than null, and mixed save proficiencies so a run of six booleans cannot come back
 * collapsed into one. Already normalised — no stray whitespace, rolls in the casing
 * `normaliseRoll` produces — so anything the deployment changes is a real change
 * rather than the server tidying up after us.
 *
 * ⚠️ **The feat list is now one of each category and one entry with no category at
 * all**, and the pairing is the whole design rather than variety for its own sake.
 * `firstDifference` reports `present on one side only`, so a `category` or a `toHit`
 * dropped by a field-by-field rebuild fails by name against the three that carry them —
 * and `feat-aether-bolt`, which carries neither, is what proves *absence* survives the
 * round trip rather than being filled in. Neither half means anything without the
 * other: the first passes on a deployment that materialised a category for everything,
 * the second on one that discarded every new field it was sent.
 */
const PC_NAME = 'Sköll Emberkin 🎲'
const PC_SHEET = {
  kind: 'pc',
  level: 9,
  className: 'Battle Skald',
  abilities: { str: 17, dex: 12, con: 15, int: 8, wis: 13, cha: 20 },
  saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: true },
  armourClass: 18,
  maxHp: 84,
  hitDice: { count: 7, faces: 10 },
  feats: [
    entryFrom(CATALOGUE.secondWind, 'feat-second-wind'),
    entryFrom(CATALOGUE.actionSurge, 'feat-action-surge'),
    // THE NEGATIVE. Neither new field, exactly as every entry written before
    // Milestone 6 is, and the one this script asserts comes back with neither key
    // present. See `LEGACY_FEAT_ID` and the check in section 6.
    customEntry({
      id: 'feat-aether-bolt',
      name: 'Æther Bolt 🜁🔥',
      text: 'Éclair d’æther — 2d8 de dégâts radiants, et la cible brille. ✨ 火 🐉',
      roll: '2d8+CHA',
    }),
    // THE POSITIVE CONTROL, and the hand-written weapon. Two rolls: one to land it and
    // one for what it does. Written out in full rather than built by a helper, because
    // a fixture derived from the code under test would agree with a mangled rebuild as
    // readily as with a correct one.
    {
      id: 'feat-runeblade',
      name: 'Runeblade of the Ember Skald',
      text: 'A two-handed blade cut with fire runes. Swung with Strength, and the runes take light on a hit.',
      roll: '2d6+STR',
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: '1d20+STR+PROF',
    },
    // The hand-written action: one roll, no to-hit, and it simply goes off.
    {
      id: 'feat-verse-of-mending',
      name: 'Verse of Mending',
      text: 'A sung stanza that closes a wound on an ally within thirty feet. Nothing is aimed and nothing is resisted.',
      roll: '1d8+CHA',
      level: null,
      catalogueKey: null,
      category: 'action',
    },
    // The hand-written passive: declared, not rolled.
    {
      id: 'feat-stone-stance',
      name: 'Stone Stance',
      text: 'Set your feet and you are not moved against your will while you hold the ground you are standing on.',
      roll: null,
      level: null,
      catalogueKey: null,
      category: 'passive',
    },
  ],
  spells: [
    entryFrom(CATALOGUE.fireBolt, 'spell-fire-bolt'),
    entryFrom(CATALOGUE.cureWounds, 'spell-cure-wounds'),
    entryFrom(CATALOGUE.fireball, 'spell-fireball'),
  ],
}

/**
 * The NPC the acceptance test is about. 271 and 137 are chosen to be searchable:
 * a scan of a player's payload for `45` would match half the ids in it, so the
 * numbers have to be ones a coincidence is unlikely to produce.
 *
 * A negative initiative bonus and an NPC whose vitals row therefore stores
 * `hitDiceRemaining: undefined` are both here on purpose — see the checks below.
 */
const NPC_NAME = 'Grendel of the Ford 🐉'
const NPC_MAX_HP = 271
const NPC_CURRENT_HP = 137
const NPC_SHEET = {
  kind: 'npc',
  armourClass: 17,
  maxHp: NPC_MAX_HP,
  initiativeBonus: -2,
  actions: [
    entryFrom(CATALOGUE.greatclub, 'npc-greatclub'),
    entryFrom(CATALOGUE.multiattack, 'npc-multiattack'),
  ],
  notes: 'Waits under the third arch. Surfaces on a failed Perception check. 🐉',
}

/**
 * The library numbers Milestone 4's section is asserted against, copied by hand out
 * of `convex/lib/library/rogue.ts`, `convex/lib/library/fighter.ts` and
 * `convex/lib/races.ts`.
 *
 * Copied for the reason the catalogue above is copied, and more sharply. The whole
 * claim of a premade character is that **none of this is ever sent to the server** —
 * a name and four selections go in, and a finished sheet comes back. A check that
 * read these out of the library it is testing would confirm only that some function
 * ran, and would agree with a mangled library exactly as readily as with a correct
 * one.
 *
 * `featCount` is the length of the library's own feat list. Every resolved sheet
 * carries one more than that, because a race always contributes its trait — see the
 * `+ 1` at each use, which is `applyRace` being asserted rather than assumed.
 */
const ROGUE_SKILLS = {
  athletics: false,
  acrobatics: true,
  sleightOfHand: true,
  stealth: true,
  arcana: false,
  investigation: true,
  animalHandling: false,
  insight: false,
  perception: true,
  deception: true,
  intimidation: false,
  performance: false,
  persuasion: true,
}
const ROGUE = {
  base: {
    abilities: { str: 8, dex: 15, con: 14, int: 13, wis: 12, cha: 10 },
    armourClass: 14,
    maxHp: 10,
    hitDice: { count: 1, faces: 8 },
    featCount: 5,
    /**
     * The Rogue's first weapon, copied by hand out of `convex/lib/library/rogue.ts`.
     *
     * ⚠️ **This is the only thing that proves the library's new field survives the two
     * copies resolution makes of every entry** — `withId`'s spread in lib/resolve.ts,
     * and the race overlay's rebuild of the feat list on top of it. A `toHit` dropped
     * by either would leave a weapon on a hero's sheet that announces an attack and
     * has nothing to roll for it, and no other check in this script would notice: the
     * feat *count* would still be right.
     *
     * `1d20+DEX+PROF` and not `1d20+STR+PROF`, which is the detail that makes it worth
     * copying rather than deriving. A rapier is a finesse weapon aimed with Dexterity,
     * and `DEX` is the one modifier token containing a `D` — the token `normaliseRoll`
     * has already destroyed once.
     */
    weapon: { name: 'Rapier', roll: '1d8+DEX', toHit: '1d20+DEX+PROF' },
  },
  thief2: { maxHp: 17, hitDice: { count: 2, faces: 8 }, featCount: 7 },
  thief3: { maxHp: 24, hitDice: { count: 3, faces: 8 }, featCount: 7 },
  thief4: { maxHp: 31, hitDice: { count: 4, faces: 8 }, featCount: 8 },
}
const FIGHTER = {
  base: { maxHp: 12, hitDice: { count: 1, faces: 10 } },
}

/** The three races that move a number, and the only three. */
const ELF_DEX_BONUS = 2
const DWARF_HP_PER_LEVEL = 1
const GOLIATH_SPEED = 45

/** The DM's thumb on the scale, in the one field this section overrides. */
const DM_ARMOUR_CLASS = 21

/** A stored `preset`: four selections, a lock flag, and nothing else. */
function presetSheet(fields) {
  return { kind: 'preset', subclassKey: null, level: 1, locked: false, ...fields }
}

/**
 * MILESTONE 5'S FIXTURES, hand-copied out of `convex/lib/bestiary/monstersLow.ts`,
 * `convex/lib/bestiary/social.ts` and `convex/lib/bestiary/benchmarks.ts`.
 *
 * Copied for the reason `ROGUE` above is copied, and the argument is sharper again here.
 * A creature stores **two fields** — a key and a challenge rating — and every number a
 * player will ever roll against comes back out of a corpus and a scaler that the request
 * never touched. A check that read these out of the code under test would confirm only
 * that some function ran, and would agree with a mangled corpus exactly as readily as
 * with a correct one.
 *
 * The benchmark rows this is worked out from, also copied by hand:
 *
 * ```
 * CR    hp   ac  atk  dmg  dc  skill
 *  1    26   13   4     8  12   2
 *  4    70   15   6    16  14   4
 *  6   120   16   7    25  15   5
 * ```
 *
 * `hp` and `damage` are **ratio** columns, so the creature's own figure is multiplied and
 * its deviation from its row is preserved. The four d20 columns are **deltas**, because
 * 1.23× of an armour class is not a statement about anything. Mixing the two up is the
 * single easiest way to get a scaler wrong, so both kinds are worked out separately below.
 *
 * ⚠️ **`toHit` IS WORKED FROM `atk` AS A DELTA, AND THE WORKING IS WRITTEN OUT** — because
 * reading it as a ratio gives three plausible-looking numbers that are all wrong, and a
 * fixture derived from `toHitFromBonus` would agree with a broken composition exactly as
 * readily as with a correct one.
 *
 *   The Dire Wolf is written at CR 1 with an attack bonus of 4. The benchmark `atk` at
 *   CR 1 is 4, so its deviation from its own row is 4 − 4 = 0, and the scaled bonus at
 *   any rating is that row's `atk` plus 0:
 *
 *     CR 1 → 4 + (4 − 4) = 4   → `1d20+4`
 *     CR 4 → 6 + (4 − 4) = 6   → `1d20+6`
 *     CR 6 → 7 + (4 − 4) = 7   → `1d20+7`
 *
 *   As a ratio it would have been 4 × 6/4 = 6 at CR 4 — which coincides — and
 *   4 × 7/4 = 7 at CR 6, which also coincides, *because this creature sits exactly on its
 *   row*. That coincidence is the trap: the two readings agree on every number here and
 *   would diverge on any creature with a deviation, so the arithmetic above is the one
 *   that is actually being asserted and it is written out so nobody re-derives it the
 *   other way. The `attackBonus` figures in the three statlines below are the same three
 *   numbers and have been since Milestone 5 — the to-hit is that bonus spelled as a roll,
 *   which is exactly the claim `toHitFromBonus` makes and exactly what is checked.
 */
const WOLF = {
  key: 'dire-wolf',
  entryName: 'Dire Wolf',
  libraryCr: 1,
  blurb: 'Horse-sized wolf that hunts in twos and does not tire.',
  loot: 'Nothing carried and nothing hidden. A beast owns only itself.',
  /** The entry as written. CR 1 → CR 1 is the exact identity and is not short-circuited. */
  atCr1: {
    maxHp: 31,
    armourClass: 12,
    attackBonus: 4,
    initiativeBonus: 2,
    passivePerception: 13,
    speed: 50,
    skills: { perception: 3, stealth: 4 },
    damage: '2d6+3',
    toHit: '1d20+4',
    // Every attack in the corpus is a weapon by construction — the entry separates
    // `attacks` from `abilities`, and an attack is the thing that has to land before its
    // damage applies. Asserted rather than assumed, because it is read off the structure
    // rather than declared on a hundred and fifty-nine hand-written attacks.
    category: 'weapon',
  },
  /** 31 × 70/26 = 83.46… → 83, and +2 on every d20 column. Damage 16/8 = 2.0× exactly. */
  atCr4: {
    maxHp: 83,
    armourClass: 14,
    attackBonus: 6,
    initiativeBonus: 4,
    passivePerception: 15,
    speed: 50,
    skills: { perception: 5, stealth: 6 },
    damage: '4d6+6',
    toHit: '1d20+6',
    category: 'weapon',
  },
  /** 31 × 120/26 = 143.07… → 143, and +3 on every d20 column. Damage 25/8 = 3.125×. */
  atCr6: {
    maxHp: 143,
    armourClass: 15,
    attackBonus: 7,
    initiativeBonus: 5,
    passivePerception: 16,
    speed: 50,
    skills: { perception: 6, stealth: 7 },
    damage: '6d6+10',
    toHit: '1d20+7',
    category: 'weapon',
  },
  /** The composed opening of the resolved Bite at each rating, from `attackText`. */
  biteAtCr1: 'Melee. 2d6+3 piercing damage.',
  biteAtCr6: 'Melee. 6d6+10 piercing damage.',
}

/** The creature's own name in the game, which is neither the entry's nor the token's. */
const WOLF_CHARACTER_NAME = 'Wyrmshadow at the Ford 🐺'
/** 89 of 143. Distinctive digits, for the reason 271 and 137 are. */
const WOLF_CURRENT_HP = 89

/**
 * A social NPC with **no combat block at all** — twenty-two of the thirty are like this
 * — whose `knows` string is the plot. Copied in full, because a fragment would not prove
 * the whole sentence stayed off a player's wire.
 */
const INNKEEPER = {
  key: 'innkeeper',
  entryName: 'Innkeeper',
  characterName: 'Maergan Tolt',
  /** CR ⅛: the only rating in the ten a payload cannot produce by coincidence. */
  shiftedCr: 0.125,
  loot: "A jar of thin old silver under the bar, the week's takings in a locked box and a very good bread knife.",
  knows:
    'Three of her regulars have been paying in thin old silver of the Verrow mint, coin nobody has struck in four generations, and all three of them work the deep shift at the Hallow Delve. She keeps a jar of it under the bar and has told nobody, because the Ledger House in Greyhallow would want to know where it came from and so would the revenue.',
}

/** The DM's thumb on a creature, in the two fields section 19 overrides. */
const DM_CREATURE_ARMOUR_CLASS = 25
/**
 * ⚠️ **The second override, and the one this script exists for.**
 *
 * A creature carries **one** `attackBonus` for the whole of itself and every attack's
 * to-hit is composed *from* it, so the two are one number spelled twice — and a merge
 * that patches the field while the composition has already happened gives a sheet
 * reading +12 whose every weapon rolls +7. Nothing on screen looks wrong enough to
 * investigate: both readings come back on the same payload, from the same query, and the
 * DM sees a consistent-looking creature that hits eight points softer than its own
 * statline says.
 *
 * 12 rather than a round number for the reason 271 and 137 are what they are: it cannot
 * be produced by coincidence out of the benchmark table, whose `atk` column runs 4, 6, 7.
 */
const DM_CREATURE_ATTACK_BONUS = 12
const DM_CREATURE_TO_HIT = '1d20+12'

/**
 * MILESTONE 7'S FIXTURES. Three new stored fields, and every one of them optional.
 *
 * `NpcSheet.group`, `characters.reserved` and `tokens.controllerIds` are the sixth,
 * seventh and eighth optional fields this schema has grown, for the reason all the
 * others were: a required field cannot be added to a populated table in one push. That
 * makes all three the exact shape this script exists for — a field a validator permits
 * to be absent, dropped by a rebuild, written happily by convex-test and silently
 * discarded by nothing anybody would notice.
 *
 * ⚠️ **`group` is the one to watch**, because it is the only one of the three that goes
 * through a field-by-field rebuild: `normaliseSheet` reconstructs an `NpcSheet` field by
 * field and carries this one by conditional spread. That is the fifth outing of the trap
 * that shipped `skillProficiencies` and then `speed`, and this script is the only thing
 * that has ever caught it. So section 23 sends a creature **with** the field and a
 * sibling **without** it, and neither half means anything alone: the first passes on a
 * deployment that materialised a group for everything, the second on one that discarded
 * every new field it was sent. ADR 0008 § "Two things found by building it" is where that
 * lesson is written down.
 *
 * The two creatures are also the fixtures for the grant sections. 293 and 157 are chosen
 * to be searchable, for the reason 271 and 137 are: a scan of a player's payload for `45`
 * would match half the ids in it, so a leaked hit point has to be a number a coincidence
 * is unlikely to produce.
 */
const GRANTED_NAME = 'Bell of the Ninth Arch 🐕'
const GRANTED_MAX_HP = 293
const GRANTED_CURRENT_HP = 157
/** DM-only prose on a DM-only sheet, scanned for alongside the two numbers. */
const GRANTED_NOTES =
  'Answers to whoever is holding the lead, and to the smell of the deep shift coming off a coat. 🐕'
const GRANTED_SHEET = {
  kind: 'npc',
  armourClass: 15,
  maxHp: GRANTED_MAX_HP,
  initiativeBonus: 3,
  actions: [entryFrom(CATALOGUE.greatclub, 'npc-greatclub')],
  notes: GRANTED_NOTES,
  // THE POSITIVE HALF OF THE PAIR. A hand-built creature has no corpus to derive a
  // heading from, so the dialog asks and the answer is stored — which is the only
  // reason this field exists at all.
  group: 'monster',
}

/**
 * THE NEGATIVE HALF, and the creature the DM-layer section hides.
 *
 * ⚠️ **It deliberately carries no `group` key**, so it is shaped exactly like every
 * creature typed in before this milestone — which is the state every hand-built NPC in
 * every existing game is in, and the state a real deployment has to prove it can store.
 * `defaultNpcSheet` omits the field for the same reason, and `groupOf` reads the absence
 * as `'npc'` in one place.
 */
const AMBUSH_NAME = 'Thing Beneath the Third Arch'
const AMBUSH_MAX_HP = 181
const AMBUSH_SHEET = {
  kind: 'npc',
  armourClass: 16,
  maxHp: AMBUSH_MAX_HP,
  initiativeBonus: 1,
  actions: [],
  notes: 'Does not surface while the ford is busy. Waits for one of them to come back alone.',
}

/** The hero the DM sets aside for a player who has not arrived. Section 25's fixture. */
const RESERVED_NAME = 'Vaan of the Long Stride'

/**
 * The eight numbers a rating shift moves, pulled off a resolved sheet in one shape so
 * `firstDifference` can name the one that drifted.
 *
 * `damage` is read off the first action's `roll` rather than its `text`, because the roll
 * is what Milestone 6 will aim dice at and the text is the sentence a person reads. Both
 * are asserted; only one of them is a value.
 *
 * ⚠️ **`toHit` and `category` travel here rather than being checked on their own**, so a
 * change to either is *named* by `firstDifference` — `statline.toHit: stored "1d20+7",
 * wanted "1d20+12"` — instead of collapsing into a boolean that says a shift went wrong
 * somewhere. That naming is the whole reason a statline object exists at all, and the
 * to-hit is now the number in it most likely to move on its own: it is the only one
 * derived from another field rather than scaled from a benchmark row.
 */
function statlineOf(sheet) {
  const first = sheet.actions[0]
  return {
    maxHp: sheet.maxHp,
    armourClass: sheet.armourClass,
    attackBonus: sheet.attackBonus,
    initiativeBonus: sheet.initiativeBonus,
    passivePerception: sheet.passivePerception,
    speed: sheet.speed,
    skills: sheet.skills,
    damage: first && first.roll,
    toHit: first && first.toHit,
    category: first && first.category,
  }
}

const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function check(name, condition, detail = '') {
  record(name, Boolean(condition), detail)
  return Boolean(condition)
}

/**
 * A check whose assertion is the refusal.
 *
 * Awaiting a call that must not succeed is the only way to test a bound the
 * *deployment* applies. A bound this script checked on the way in would be this
 * script's bound, which is precisely the mistake CLAUDE.md invariant 6 is about.
 */
async function refuses(name, fn) {
  try {
    await fn()
  } catch (error) {
    return check(name, true, describeError(error))
  }
  return check(name, false, 'the deployment accepted it')
}

/** A ConvexError's own message where there is one, trimmed to fit a line of output. */
function describeError(error) {
  const data = error && error.data
  const raw =
    data && typeof data === 'object' && typeof data.message === 'string'
      ? data.message
      : String((error && error.message) ?? error)
  // One check, one line: a raw deployment error arrives with its request id on a
  // line of its own, and a result list that reflows is a result list nobody reads.
  const message = raw.trim().replace(/\s+/g, ' ')
  // Cut by code point rather than by code unit. Slicing a string mid-surrogate is
  // the bug this whole script exists for, and doing it in the failure reporter
  // would be a poor way to find that out.
  const points = [...message]
  return points.length > 110 ? `${points.slice(0, 109).join('')}…` : message
}

/**
 * Where two values first differ, or null.
 *
 * A round trip that comes back subtly wrong — a null turned into an absent field,
 * a nested union re-tagged, an emoji re-encoded — is exactly what this script is
 * for, so a failure has to name the field rather than print two sheets side by side.
 */
function firstDifference(a, b, path = 'sheet') {
  if (a === b) return null
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path}: stored ${JSON.stringify(b)}, wanted ${JSON.stringify(a)}`
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`

  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const child = Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`
    if (!(key in a) || !(key in b)) return `${child}: present on one side only`
    const found = firstDifference(a[key], b[key], child)
    if (found) return found
  }
  return null
}

/**
 * Whether a number appears anywhere in a decoded payload, at any depth.
 *
 * Run alongside a substring scan of the serialised form rather than instead of it.
 * The substring scan catches a hit point that reached the client as text; this
 * catches one that reached it as a number in a field nobody thought to look at.
 */
function holdsNumber(value, wanted) {
  if (typeof value === 'number') return value === wanted
  if (Array.isArray(value)) return value.some((item) => holdsNumber(item, wanted))
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => holdsNumber(item, wanted))
  }
  return false
}

/**
 * The fields that cannot carry a hit point but can spell one by accident: a
 * document id and a thirteen-digit creation timestamp are both made of digits, so a
 * substring scan for `271` over a raw payload trips over one every hundred runs or
 * so. A smoke test that cries wolf is one the group learns to ignore, which costs
 * more than three digits of coverage — and `holdsNumber` above still looks at every
 * number in the payload including these, so nothing is actually exempted.
 */
const OPAQUE_KEYS = new Set(['_id', 'tokenId', 'characterId', 'claimedByPlayerId', 'createdAt'])

function redactOpaque(value) {
  if (Array.isArray(value)) return value.map(redactOpaque)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) =>
        OPAQUE_KEYS.has(key) ? [key, '<opaque>'] : [key, redactOpaque(item)],
      ),
    )
  }
  return value
}

/** A cleanup step that reports its own failure rather than abandoning the ones after it. */
async function quietly(fn) {
  try {
    await fn()
  } catch (error) {
    console.log(`  cleanup step did not finish: ${describeError(error)}`)
  }
}

/** Reads VITE_CONVEX_URL out of .env.local, which `convex dev` writes. */
function deploymentUrl() {
  const fromEnv = process.env.VITE_CONVEX_URL
  if (fromEnv) return fromEnv

  const path = resolve(ROOT, '.env.local')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `Cannot read ${path}. Run \`npm run dev:backend\` once — it writes VITE_CONVEX_URL there.`,
    )
  }
  const match = text.match(/^\s*VITE_CONVEX_URL\s*=\s*(.+?)\s*$/m)
  if (!match) throw new Error(`No VITE_CONVEX_URL in ${path}.`)
  return match[1].replace(/^["']|["']$/g, '')
}

/** The exact snap the server and the client share, restated so this script is independent of both. */
function snapToGrid(point, grid, sizeSquares) {
  const half = sizeSquares / 2
  const col = Math.round((point.x - grid.gridOffsetX) / grid.gridSize - half)
  const row = Math.round((point.y - grid.gridOffsetY) / grid.gridSize - half)
  return {
    x: grid.gridOffsetX + (col + half) * grid.gridSize,
    y: grid.gridOffsetY + (row + half) * grid.gridSize,
  }
}

async function uploadPng(client, code, dmCode) {
  const uploadUrl = await client.mutation('files:generateUploadUrl', { code, dmCode })
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.from(PNG_BASE64, 'base64'),
  })
  if (!response.ok) {
    throw new Error(`upload POST failed: ${response.status} ${await response.text()}`)
  }
  const { storageId } = await response.json()
  if (!storageId) throw new Error('upload POST returned no storageId')
  return storageId
}

async function main() {
  const url = deploymentUrl()
  console.log(`\nBoard smoke test against ${url}\n`)
  const client = new ConvexHttpClient(url)

  const created = []
  const createdCharacters = []
  // Three more things this run makes that are *about somebody else's screen*, so each is
  // undone on the way out on its own rather than left to disappear with the token or the
  // character it hangs off. Every `quietly` step reports its own failure and the ones
  // after it still run, which is exactly why a run that fails halfway must not depend on
  // a later step to leave the game tidy.
  const grantedTokens = []
  const reservedCharacters = []
  const seats = []
  let code = null
  let dmCode = null
  let sceneId = null

  try {
    const game = await client.mutation('games:create', {
      name: `Board Smoke ${new Date().toISOString()}`,
      dmName: 'Smoke DM',
      recoveryPhrase: 'brass lantern smoke',
    })
    code = game.code
    dmCode = game.dmCode
    check('games:create issued a join code and a DM code', Boolean(code && dmCode), code)

    // 1. A real upload URL, a real POST, real bytes in real storage.
    const imageId = await uploadPng(client, code, dmCode)
    check('files:generateUploadUrl accepted a POST and returned a storageId', Boolean(imageId))

    const scene = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'Admittance',
      imageId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    sceneId = scene.sceneId
    check('scenes:create stored a scene', Boolean(sceneId))

    // 2. Non-integer floats through the real value validation. 37.5 and −12.25
    // are exact in binary; a deployment that mangled them would break every snap.
    await client.mutation('scenes:updateGrid', {
      code,
      dmCode,
      sceneId,
      gridSize: GRID.gridSize,
      gridOffsetX: GRID.gridOffsetX,
      gridOffsetY: GRID.gridOffsetY,
      gridVisible: true,
    })
    const active = await client.query('scenes:active', { code })
    check(
      'scenes:updateGrid round-tripped fractional offsets exactly',
      active &&
        active.gridSize === GRID.gridSize &&
        active.gridOffsetX === GRID.gridOffsetX &&
        active.gridOffsetY === GRID.gridOffsetY,
      active ? `${active.gridOffsetX} / ${active.gridOffsetY}` : 'no active scene',
    )

    // 3. One token on each layer, both with art of their own.
    const openArt = await uploadPng(client, code, dmCode)
    const secretArt = await uploadPng(client, code, dmCode)

    const open = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Village Guard',
      layer: 'player',
      sizeSquares: 1,
      tint: '#c0392b',
      imageId: openArt,
      x: 300,
      y: 300,
    })
    created.push(open.tokenId)
    const secret = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Ambush Skeleton',
      layer: 'dm',
      sizeSquares: 2,
      tint: '#2c3e50',
      imageId: secretArt,
      x: 900,
      y: 700,
    })
    created.push(secret.tokenId)
    check('board:addToken accepted a player-layer and a DM-layer token', created.length === 2)

    // 4. In-flight write, then the settling write. Both against the real validator.
    for (const [tokenId, sizeSquares] of [
      [open.tokenId, 1],
      [secret.tokenId, 2],
    ]) {
      const loose = { x: 1234.5, y: 777.25 }
      await client.mutation('board:moveToken', {
        code,
        dmCode,
        sceneId,
        tokenId,
        x: loose.x,
        y: loose.y,
        settle: false,
      })
      await client.mutation('board:moveToken', {
        code,
        dmCode,
        sceneId,
        tokenId,
        x: loose.x,
        y: loose.y,
        settle: true,
      })

      const positions = await client.query('board:positions', { code, sceneId, dmCode })
      const row = positions.find((entry) => entry.tokenId === tokenId)
      const want = snapToGrid(loose, GRID, sizeSquares)
      check(
        `board:moveToken settled a ${sizeSquares}×${sizeSquares} token on the grid`,
        row && row.x === want.x && row.y === want.y,
        row ? `got ${row.x},${row.y} want ${want.x},${want.y}` : 'no placement row',
      )
    }

    // 5. THE point of the milestone, against the real wire.
    const dmTokens = await client.query('board:tokens', { code, dmCode })
    const dmToken = dmTokens.find((token) => token._id === secret.tokenId)
    check('the DM can see their own DM-layer token', Boolean(dmToken))

    const playerTokens = await client.query('board:tokens', { code })
    const playerPositions = await client.query('board:positions', { code, sceneId })
    const playerScene = await client.query('scenes:active', { code })
    const payload = JSON.stringify([playerTokens, playerPositions, playerScene])

    check('a player payload does not contain the DM-layer token id', !payload.includes(secret.tokenId))
    check('a player payload does not contain the DM-layer token name', !payload.includes('Ambush Skeleton'))
    if (dmToken && typeof dmToken.artUrl === 'string') {
      check(
        'a player payload does not contain the DM-layer art URL',
        !payload.includes(dmToken.artUrl),
      )
    } else {
      record('a player payload does not contain the DM-layer art URL', false, 'no DM art URL to compare')
    }
    check(
      'a player payload does contain the player-layer token',
      payload.includes(open.tokenId),
      'positive control — the scan is not passing on an empty fixture',
    )

    // 6. Milestone 3's sheets. A nested discriminated union in an optional field,
    // through the real value validation, with real prose in it.
    //
    // ⚠️ **The DM code on this call is Milestone 7's change and not a tidy-up.** Creating
    // a hero used to be ungated — the ternary in `characters.create` sent a `pc` straight
    // to `getGameByCode` — and there is now no un-gated branch at all: a hero, a
    // hand-built creature and one off the bestiary shelf arrive through one gate. Every
    // `characters:create` below therefore sends it, including the ones whose *point* is
    // some other refusal, or they would be refused as `NotDm` and prove nothing about the
    // bound they were written for.
    const pc = await client.mutation('characters:create', {
      code,
      dmCode,
      name: PC_NAME,
      sheet: PC_SHEET,
    })
    createdCharacters.push(pc.characterId)
    check(
      'characters:create stored a player character with a full sheet',
      Boolean(pc.characterId),
      'the DM code is now required on every path, heroes included',
    )
    // The other half of that change, asserted rather than assumed. Characters still
    // belong to the game rather than to whoever typed them in (ADR 0002); what moved is
    // who does the typing, and a player's route to a character is `claim`.
    await refuses('characters:create refused a hero without the DM code', () =>
      client.mutation('characters:create', { code, name: 'Uninvited Hero', sheet: PC_SHEET }),
    )

    const storedPc = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    const drift = storedPc ? firstDifference(PC_SHEET, storedPc.sheet) : 'no sheet came back'
    check(
      'characters:sheet round-tripped every field, emoji and non-ASCII included',
      storedPc && storedPc.name === PC_NAME && drift === null,
      drift ?? `name ${JSON.stringify(storedPc.name)}`,
    )

    // ⚠️ **ABSENCE, ASSERTED AS ABSENCE.** `firstDifference` above already reports a
    // dropped field as `present on one side only`, which covers the three entries that
    // carry a category. What it cannot do on its own is tell a deployment that stores
    // an omitted optional field as omitted from one that helpfully materialises it —
    // both sides would have to differ for that to show, and a materialised `category`
    // on an entry the fixture sent without one *does* differ, but only if the fixture
    // is right about which entry is which. So the two are pulled out by id and asserted
    // directly, on the KEY rather than on the value: `entry.toHit === undefined` is true
    // of a stored empty string as well, and an empty string is not how absence is said.
    //
    // This is the half of the pair convex-test cannot answer at all. `undefined` is not
    // a Convex value, so whether the client library drops the key, the deployment
    // refuses the write, or the field comes back as `null` is a question only a real
    // round trip settles.
    const storedFeats = storedPc && storedPc.sheet.feats ? storedPc.sheet.feats : []
    const legacyFeat = storedFeats.find((entry) => entry.id === 'feat-aether-bolt')
    const weaponFeat = storedFeats.find((entry) => entry.id === 'feat-runeblade')
    check(
      'an entry sent with neither new field came back with neither key present',
      legacyFeat && !('category' in legacyFeat) && !('toHit' in legacyFeat),
      legacyFeat ? `keys: ${Object.keys(legacyFeat).sort().join(', ')}` : 'no legacy feat came back',
    )
    check(
      'its sibling, sent with both, came back with both',
      weaponFeat &&
        weaponFeat.category === 'weapon' &&
        weaponFeat.toHit === '1d20+STR+PROF' &&
        weaponFeat.roll === '2d6+STR',
      weaponFeat
        ? `positive control — without it the check above passes on a deployment that discarded everything; got ${JSON.stringify(weaponFeat.category)} / ${JSON.stringify(weaponFeat.toHit)}`
        : 'no weapon feat came back',
    )
    check(
      'the action and the passive kept their categories and neither grew a to-hit',
      storedFeats.some(
        (entry) =>
          entry.id === 'feat-verse-of-mending' &&
          entry.category === 'action' &&
          !('toHit' in entry),
      ) &&
        storedFeats.some(
          (entry) =>
            entry.id === 'feat-stone-stance' &&
            entry.category === 'passive' &&
            entry.roll === null &&
            !('toHit' in entry),
        ),
      `${storedFeats.length} feats, categories ${JSON.stringify(storedFeats.map((entry) => entry.category ?? null))}`,
    )

    // 7. The forty-entry cap, which is the largest thing this application asks a
    // document to hold. Convex has opinions about document size and nesting depth
    // that convex-test does not, and eighty objects inside a union inside an
    // optional field is where they would first be heard.
    // Every filler carries a category and alternate ones carry a to-hit as well, so the
    // deployment is asked to store eighty entries each two fields wider than the shape
    // that fitted before — which is the point of the section. Nesting depth and document
    // size are things Convex has opinions about and convex-test has none, and a list at
    // its cap is where a rounding error in either would first be heard.
    const filler = (prefix, index) =>
      customEntry(
        index % 2 === 0
          ? {
              id: `${prefix}-${index}`,
              name: `${prefix} ${index}`,
              text: 'Filler, so the deployment is asked to store a list at its cap.',
              roll: '1d6+2',
              category: 'weapon',
              toHit: '1d20+3',
            }
          : {
              id: `${prefix}-${index}`,
              name: `${prefix} ${index}`,
              text: 'Filler, so the deployment is asked to store a list at its cap.',
              roll: null,
              category: 'passive',
            },
      )
    const cappedFeats = Array.from({ length: 40 }, (_, index) => filler('feat', index))
    const cappedSpells = Array.from({ length: 40 }, (_, index) => filler('spell', index))
    const cappedSheet = { ...PC_SHEET, feats: cappedFeats, spells: cappedSpells }

    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: pc.characterId,
      sheet: cappedSheet,
    })
    const cappedBack = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    check(
      'characters:updateSheet stored forty feats and forty spells',
      cappedBack && cappedBack.sheet.feats.length === 40 && cappedBack.sheet.spells.length === 40,
      cappedBack ? `${cappedBack.sheet.feats.length} + ${cappedBack.sheet.spells.length}` : 'no sheet',
    )
    // And that the two extra fields survived at the cap rather than only in a list of
    // three. A document-size or nesting limit would not fail the length check above —
    // the write would simply have been refused, or a field quietly lost.
    const cappedEntries = cappedBack
      ? [...cappedBack.sheet.feats, ...cappedBack.sheet.spells]
      : []
    check(
      'every one of the eighty came back two fields wider, half of them with a to-hit',
      cappedEntries.length === 80 &&
        cappedEntries.every((entry) => entry.category === 'weapon' || entry.category === 'passive') &&
        cappedEntries.filter((entry) => entry.toHit === '1d20+3').length === 40 &&
        cappedEntries.filter((entry) => !('toHit' in entry)).length === 40,
      `${cappedEntries.filter((entry) => 'toHit' in entry).length} of ${cappedEntries.length} carry a to-hit`,
    )
    await refuses('the deployment refused a forty-first entry', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: { ...cappedSheet, feats: [...cappedFeats, filler('feat', 40)] },
      }),
    )

    // 8. An NPC. Creating one is the operation that decides what the rest of the
    // table is not allowed to see, so it is gated on the DM code and nothing else.
    //
    // It also writes a vitals row with `hitDiceRemaining: undefined`, because a
    // monster has no hit dice — and `undefined` is not a Convex value. Whether the
    // client library drops the key or the deployment refuses the write is not
    // something convex-test can answer, which is why this check is here rather than
    // in the suite.
    const npc = await client.mutation('characters:create', {
      code,
      dmCode,
      name: NPC_NAME,
      sheet: NPC_SHEET,
    })
    createdCharacters.push(npc.characterId)
    check(
      'characters:create stored an NPC, with `hitDiceRemaining: undefined` on its vitals row',
      Boolean(npc.characterId),
    )
    await refuses('characters:create refused an NPC without the DM code', () =>
      client.mutation('characters:create', { code, name: 'Uninvited Ogre', sheet: NPC_SHEET }),
    )

    // 9. Hit points. The clamp is the server's, and the number it returns is the
    // number it stored — a client that asked for −999 has to be told about 0.
    const beaten = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: -999,
    })
    const healed = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 999,
    })
    check(
      'characters:adjustHp clamped at zero and at the sheet maximum',
      beaten.currentHp === 0 && healed.currentHp === PC_SHEET.maxHp,
      `${beaten.currentHp} then ${healed.currentHp} of ${PC_SHEET.maxHp}`,
    )
    const typed = await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      currentHp: 41,
    })
    check('characters:setHp stored the number it was given', typed.currentHp === 41, `${typed.currentHp}`)

    const spent = await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: -3,
    })
    const rested = await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 100,
    })
    check(
      'characters:adjustHitDice spent three and capped a long rest at the sheet complement',
      spent.hitDiceRemaining === 4 && rested.hitDiceRemaining === PC_SHEET.hitDice.count,
      `${spent.hitDiceRemaining} then ${rested.hitDiceRemaining} of ${PC_SHEET.hitDice.count}`,
    )

    // 10. THE ACCEPTANCE TEST FOR THIS MILESTONE, against the real wire.
    //
    // The NPC's coin goes on the PLAYER layer, which is the case that matters: the
    // party can see the troll, so they get a health bar for it, and the health bar
    // must not be built out of its exact hit points. A DM-layer NPC is the easy
    // case — Milestone 2's filter already hides the token.
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: npc.characterId,
      currentHp: NPC_CURRENT_HP,
    })
    const npcToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Deliberately not the character's name. The coin's name is on the board for
      // everyone by design; the scan below is about `characters:list`, and giving
      // the two the same string would make it scan itself.
      name: 'Ford Guardian',
      layer: 'player',
      sizeSquares: 2,
      tint: '#7f8c8d',
      characterId: npc.characterId,
      x: 500,
      y: 500,
    })
    created.push(npcToken.tokenId)

    const playerVitals = await client.query('characters:vitals', { code })
    const npcVitals = playerVitals.find((row) => row.characterId === npc.characterId)
    check(
      'a player sees the NPC as a band, with no hit-point key on the row at all',
      npcVitals &&
        npcVitals.kind === 'band' &&
        !('current' in npcVitals) &&
        !('max' in npcVitals),
      npcVitals ? `keys: ${Object.keys(npcVitals).sort().join(', ')}` : 'no row for the NPC',
    )

    const playerList = await client.query('characters:list', { code })
    const playerNpcSheet = await client.query('characters:sheet', {
      code,
      characterId: npc.characterId,
    })
    // Scanned twice over. `holdsNumber` walks every number in the decoded payload,
    // which is exact; the substring scan over the serialised form catches a hit
    // point that arrived as text in some field nobody thought to look at, and runs
    // over the redacted copy for the reason given on OPAQUE_KEYS.
    const scannable = [playerVitals, playerList, playerNpcSheet]
    const serialised = JSON.stringify(redactOpaque(scannable))
    check(
      "the NPC's exact hit points appear nowhere in a player's payload",
      !serialised.includes(String(NPC_MAX_HP)) &&
        !serialised.includes(String(NPC_CURRENT_HP)) &&
        !holdsNumber(scannable, NPC_MAX_HP) &&
        !holdsNumber(scannable, NPC_CURRENT_HP),
      `${NPC_CURRENT_HP}/${NPC_MAX_HP} scanned as text and as numbers; its sheet came back ${JSON.stringify(playerNpcSheet)}`,
    )

    const dmVitals = await client.query('characters:vitals', { code, dmCode })
    const dmNpcVitals = dmVitals.find((row) => row.characterId === npc.characterId)
    check(
      'the same fetch with the DM code does carry them',
      dmNpcVitals &&
        dmNpcVitals.kind === 'exact' &&
        dmNpcVitals.current === NPC_CURRENT_HP &&
        dmNpcVitals.max === NPC_MAX_HP,
      'positive control — without it the scan above passes on an empty fixture',
    )
    check(
      'characters:list without the DM code names the hero and not the NPC',
      !JSON.stringify(playerList).includes(NPC_NAME) &&
        playerList.some((row) => row.name === PC_NAME),
      `${playerList.length} rows, positive control included`,
    )

    // 11. And the count, which is the leak that is easy to miss: a band for every
    // prepared monster tells a player how many are waiting even when it tells them
    // nothing else.
    const hidden = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Wyrmling in the Rafters',
      sheet: { ...NPC_SHEET, maxHp: 33, actions: [] },
    })
    createdCharacters.push(hidden.characterId)
    const vitalsAfterHidden = await client.query('characters:vitals', { code })
    const dmVitalsAfterHidden = await client.query('characters:vitals', { code, dmCode })
    check(
      'an NPC with no token on the board produces no row for a player at all',
      !vitalsAfterHidden.some((row) => row.characterId === hidden.characterId) &&
        dmVitalsAfterHidden.some((row) => row.characterId === hidden.characterId),
      `player ${vitalsAfterHidden.length} rows, DM ${dmVitalsAfterHidden.length} — positive control included`,
    )

    // 12. Values the local suite cannot judge, because convex-test does not apply
    // Convex's own value validation and this script is the only place that does.
    await refuses('characters:adjustHp refused NaN', () =>
      client.mutation('characters:adjustHp', {
        code,
        dmCode,
        characterId: pc.characterId,
        delta: Number.NaN,
      }),
    )
    await refuses('characters:adjustHp refused Infinity', () =>
      client.mutation('characters:adjustHp', {
        code,
        dmCode,
        characterId: pc.characterId,
        delta: Number.POSITIVE_INFINITY,
      }),
    )
    // A fraction is rounded rather than refused, which is `clampHp`'s stated
    // position and `snapToGrid`'s: a non-integer delta arrives from a client bug
    // rather than from anything anybody typed, and this application repairs a value
    // it can repair. What must never happen is a fraction reaching the database, so
    // that is what is asserted — 41 + 2.5 settles on a whole number.
    const fractional = await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: pc.characterId,
      delta: 2.5,
    })
    check(
      'characters:adjustHp rounded a fractional delta instead of storing one',
      Number.isInteger(fractional.currentHp) && fractional.currentHp === 44,
      `41 + 2.5 stored ${fractional.currentHp}`,
    )

    await refuses('characters:updateSheet refused a NaN ability score', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: { ...cappedSheet, abilities: { ...PC_SHEET.abilities, str: Number.NaN } },
      }),
    )
    // THE MILESTONE 1 BUG, restated for sheets. A lone high surrogate is a perfectly
    // ordinary one-character string to every bound in lib/sheet.ts, so nothing in
    // the application refuses it and nothing in the suite notices; only a real
    // deployment insists a stored string be valid Unicode.
    await refuses('characters:updateSheet refused a lone UTF-16 surrogate as an entry name', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: {
          ...cappedSheet,
          feats: [customEntry({ id: 'feat-surrogate', name: '\uD800', text: 'Half an emoji.' })],
        },
      }),
    )
    await refuses('characters:updateSheet refused a 601-character description', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: pc.characterId,
        sheet: {
          ...cappedSheet,
          feats: [customEntry({ id: 'feat-long', name: 'Windy', text: 'x'.repeat(601) })],
        },
      }),
    )
    // ⚠️ **THE ARITY RULE AND THE LITERAL UNION, AGAINST THE REAL BOUNDARY.** Every
    // one of the six below is a value convex-test would store without a word: `'trap'`
    // is an ordinary string, `'1d7'` is an ordinary string, and an entry carrying a
    // field its category does not admit is a perfectly well-typed object. Two different
    // mechanisms refuse them and it matters which is which — the first is Convex's own
    // argument validation refusing a member that is not in `sheetEntryCategoryValidator`,
    // which is the only thing that demonstrates the literal union actually reached the
    // deployment rather than merely being written down; the other five are
    // `entriesProblem` running server-side on a normalised sheet.
    const badEntrySheets = [
      [
        'a category that is not one of the three',
        customEntry({
          id: 'feat-trap',
          name: 'Pit Trap',
          text: 'A fourth category nobody declared.',
          roll: '1d6',
          category: 'trap',
        }),
      ],
      [
        'a to-hit on a die nobody owns',
        customEntry({
          id: 'feat-d7',
          name: 'Sevenfold Blade',
          text: 'Aimed with a die that does not exist.',
          roll: '1d6',
          category: 'weapon',
          toHit: '1d7',
        }),
      ],
      [
        'a passive carrying a roll',
        customEntry({
          id: 'feat-loud-passive',
          name: 'Stone Stance',
          text: 'Declared rather than rolled, and then rolling something.',
          roll: '1d6',
          category: 'passive',
        }),
      ],
      [
        'an action carrying a to-hit',
        customEntry({
          id: 'feat-aimed-action',
          name: 'Verse of Mending',
          text: 'Nothing is aimed, and it is aimed anyway.',
          roll: '1d8+CHA',
          category: 'action',
          toHit: '1d20+CHA+PROF',
        }),
      ],
      [
        'a weapon with no to-hit',
        customEntry({
          id: 'feat-blind-weapon',
          name: 'Runeblade',
          text: 'A weapon is the one category that asserts a second field exists.',
          roll: '2d6+STR',
          category: 'weapon',
        }),
      ],
      [
        // Distinct from the one above, and this is the pair that decides whether
        // absence has exactly one spelling. `normaliseEntry` drops an empty to-hit
        // before anything validates it, so this arrives at `entriesProblem` as the case
        // above — which is the intended behaviour, and is only *observable* through a
        // refusal. If it were ever stored instead, `toHitOf` would answer null on a
        // weapon while the stored document said otherwise.
        'a weapon whose to-hit is an empty string',
        customEntry({
          id: 'feat-empty-to-hit',
          name: 'Runeblade',
          text: 'An empty string is not how a field says it is absent.',
          roll: '2d6+STR',
          category: 'weapon',
          toHit: '',
        }),
      ],
    ]
    for (const [label, entry] of badEntrySheets) {
      await refuses(`characters:updateSheet refused ${label}`, () =>
        client.mutation('characters:updateSheet', {
          code,
          dmCode,
          characterId: pc.characterId,
          sheet: { ...cappedSheet, feats: [entry] },
        }),
      )
    }

    const survivor = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: pc.characterId,
    })
    check(
      'every refused sheet left the stored one exactly as it was',
      survivor &&
        survivor.sheet.feats.length === 40 &&
        survivor.sheet.abilities.str === 17 &&
        // The two new fields on the entry that was there before the refusals, so a
        // partial write that replaced the list with a one-entry sheet and then threw
        // cannot pass this by getting the length right.
        survivor.sheet.feats[0].category === 'weapon' &&
        survivor.sheet.feats[0].toHit === '1d20+3',
      survivor
        ? `${survivor.sheet.feats.length} feats, str ${survivor.sheet.abilities.str}, first ${JSON.stringify(survivor.sheet.feats[0].category)} / ${JSON.stringify(survivor.sheet.feats[0].toHit)}`
        : 'no sheet',
    )

    // 13. MILESTONE 4, WHICH IS THE MOST THIS APPLICATION HAS EVER ASKED A
    // DEPLOYMENT TO HAVE AN OPINION ABOUT.
    //
    // A third member added to a stored discriminated union; a nested object of
    // optional fields inside it, itself optional; and a new optional array of
    // strings on the vitals row. convex-test stores all three without comment,
    // which is the entire reason this section exists rather than another suite.
    //
    // Read the checks as one claim: a name and four selections go in, and every
    // number that comes back was assembled server-side out of a library the client
    // never sees.
    const readSheet = (characterId) =>
      client.query('characters:sheet', { code, dmCode, characterId })
    const dmVitalsFor = async (characterId) =>
      (await client.query('characters:vitals', { code, dmCode })).find(
        (row) => row.characterId === characterId,
      )

    const elf = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Nightingale of the Ninth Step',
      sheet: presetSheet({ race: 'elf', classKey: 'rogue' }),
    })
    createdCharacters.push(elf.characterId)

    const elfAtOne = await readSheet(elf.characterId)
    check(
      'characters:sheet carried the resolved sheet and the stored selections together',
      elfAtOne &&
        elfAtOne.sheet.kind === 'pc' &&
        elfAtOne.preset !== null &&
        elfAtOne.preset.kind === 'preset' &&
        elfAtOne.preset.race === 'elf' &&
        elfAtOne.preset.classKey === 'rogue' &&
        elfAtOne.preset.subclassKey === null &&
        elfAtOne.preset.level === 1 &&
        elfAtOne.preset.locked === false,
      elfAtOne ? `preset ${JSON.stringify(elfAtOne.preset)}` : 'no sheet came back',
    )

    // None of this was sent in. `characters:create` was given a name, a race, a
    // class and a level; the scores, the armour class, the hit dice, the thirteen
    // skill flags and every feat below came back out of the library.
    const built = elfAtOne ? elfAtOne.sheet : null
    const abilityDrift = built
      ? firstDifference(
          { ...ROGUE.base.abilities, dex: ROGUE.base.abilities.dex + ELF_DEX_BONUS },
          built.abilities,
          'abilities',
        )
      : 'no sheet came back'
    const skillDrift = built
      ? firstDifference(ROGUE_SKILLS, built.skillProficiencies, 'skillProficiencies')
      : 'no sheet came back'
    check(
      'the library resolved a whole sheet out of four selections',
      built &&
        abilityDrift === null &&
        skillDrift === null &&
        built.className === 'Rogue' &&
        built.armourClass === ROGUE.base.armourClass &&
        built.maxHp === ROGUE.base.maxHp &&
        built.hitDice.count === ROGUE.base.hitDice.count &&
        built.hitDice.faces === ROGUE.base.hitDice.faces &&
        built.feats.length === ROGUE.base.featCount + 1,
      abilityDrift ??
        skillDrift ??
        (built
          ? `${built.className}, AC ${built.armourClass}, ${built.maxHp} hp, ${built.hitDice.count}d${built.hitDice.faces}, ${built.feats.length} feats`
          : 'no sheet came back'),
    )

    // ⚠️ **THE LIBRARY'S OWN TO-HIT, THROUGH TWO REBUILDS.** A premade hero's feats are
    // copied by `withId`'s spread in lib/resolve.ts and then copied again by the race
    // overlay, which rebuilds the list to append the racial trait. A field added to the
    // library's entry type and dropped by either copy leaves a weapon on the sheet that
    // announces an attack and has nothing to roll for it — and no other check here would
    // notice, because the feat *count* would still be right. Compared against a value
    // copied out of `convex/lib/library/rogue.ts` by hand for the reason every other
    // library number in this section is.
    const libraryWeapon = built
      ? built.feats.find((entry) => entry.name === ROGUE.base.weapon.name)
      : null
    check(
      "the library's weapon reached the resolved sheet with its own to-hit",
      libraryWeapon &&
        libraryWeapon.category === 'weapon' &&
        libraryWeapon.toHit === ROGUE.base.weapon.toHit &&
        libraryWeapon.roll === ROGUE.base.weapon.roll,
      libraryWeapon
        ? `${libraryWeapon.name}: ${JSON.stringify(libraryWeapon.toHit)} / ${JSON.stringify(libraryWeapon.roll)}, wanted ${JSON.stringify(ROGUE.base.weapon.toHit)} / ${JSON.stringify(ROGUE.base.weapon.roll)}`
        : `no ${ROGUE.base.weapon.name} among ${built ? built.feats.map((entry) => entry.name).join(', ') : '—'}`,
    )
    // The race's own contribution, which is the entry the overlay *adds* rather than
    // copies — and a passive by construction, since a trait is built from two strings
    // and has no roll. Without this the check above passes on an overlay that dropped
    // the category from everything it appended.
    check(
      'the racial trait arrived as a passive with no roll and no to-hit',
      built &&
        built.feats.some(
          (entry) =>
            entry.id.startsWith('race:') &&
            entry.category === 'passive' &&
            entry.roll === null &&
            !('toHit' in entry),
        ),
      built
        ? `race entries ${JSON.stringify(built.feats.filter((entry) => entry.id.startsWith('race:')).map((entry) => [entry.id, entry.category ?? null]))}`
        : 'no sheet came back',
    )

    // THE ARITHMETIC THAT IS EASY TO APPLY TWICE. A race is added on top of a
    // library sheet that was written without one in mind, so a resolver that
    // applied it in both the base and the overlay would give this Elf a Dexterity
    // of 19 and nothing on screen would look obviously wrong.
    const dwarf = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Hrada Stoneminder',
      sheet: presetSheet({ race: 'dwarf', classKey: 'rogue', subclassKey: 'thief', level: 3 }),
    })
    createdCharacters.push(dwarf.characterId)
    // Named through the constant because section 25 reserves this one and scans a
    // player's payload for the name — two literals of the same string is one place for
    // that scan to quietly start matching nothing.
    const goliath = await client.mutation('characters:create', {
      code,
      dmCode,
      name: RESERVED_NAME,
      sheet: presetSheet({ race: 'goliath', classKey: 'rogue' }),
    })
    createdCharacters.push(goliath.characterId)

    const dwarfSheet = await readSheet(dwarf.characterId)
    const goliathSheet = await readSheet(goliath.characterId)
    const wantedDwarfHp = ROGUE.thief3.maxHp + DWARF_HP_PER_LEVEL * 3
    check(
      'each race landed on the library sheet exactly once',
      built &&
        built.abilities.dex === ROGUE.base.abilities.dex + ELF_DEX_BONUS &&
        dwarfSheet &&
        dwarfSheet.sheet.maxHp === wantedDwarfHp &&
        goliathSheet &&
        goliathSheet.sheet.speed === GOLIATH_SPEED,
      `elf dex ${built ? built.abilities.dex : '—'} of ${ROGUE.base.abilities.dex}+${ELF_DEX_BONUS}, dwarf ${dwarfSheet ? dwarfSheet.sheet.maxHp : '—'} hp of ${wantedDwarfHp}, goliath ${goliathSheet ? goliathSheet.sheet.speed : '—'} feet`,
    )

    // Levelling up. Nothing below sends a sheet except the one call that supplies
    // the archetype, which is a selection rather than a number.
    await client.mutation('characters:setLevel', {
      code,
      dmCode,
      characterId: elf.characterId,
      level: 2,
    })
    const atTwo = await readSheet(elf.characterId)
    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: elf.characterId,
      sheet: presetSheet({ race: 'elf', classKey: 'rogue', subclassKey: 'thief', level: 2 }),
    })
    const atTwoThief = await readSheet(elf.characterId)
    check(
      'a level 2 with no archetype held the level 1 sheet until one was chosen',
      atTwo &&
        atTwo.sheet.level === 2 &&
        atTwo.sheet.maxHp === ROGUE.base.maxHp &&
        atTwo.sheet.hitDice.count === ROGUE.base.hitDice.count &&
        atTwoThief &&
        atTwoThief.sheet.className === 'Rogue (Thief)' &&
        atTwoThief.sheet.maxHp === ROGUE.thief2.maxHp &&
        atTwoThief.sheet.hitDice.count === ROGUE.thief2.hitDice.count &&
        atTwoThief.sheet.feats.length === ROGUE.thief2.featCount + 1,
      atTwo && atTwoThief
        ? `undecided ${atTwo.sheet.maxHp} hp, then ${atTwoThief.sheet.maxHp} hp and ${atTwoThief.sheet.feats.length} feats as a ${atTwoThief.sheet.className}`
        : 'no sheet came back',
    )

    await client.mutation('characters:setLevel', {
      code,
      dmCode,
      characterId: elf.characterId,
      level: 4,
    })
    const atFour = await readSheet(elf.characterId)
    check(
      'setLevel alone moved hit points, hit dice and the feat list — no sheet was sent',
      atFour &&
        atTwoThief &&
        atFour.sheet.maxHp === ROGUE.thief4.maxHp &&
        atFour.sheet.maxHp !== atTwoThief.sheet.maxHp &&
        atFour.sheet.hitDice.count === ROGUE.thief4.hitDice.count &&
        atFour.sheet.feats.length === ROGUE.thief4.featCount + 1 &&
        atFour.sheet.feats.some((entry) => entry.name === 'Uncanny Dodge'),
      atFour
        ? `${atFour.sheet.maxHp} hp, ${atFour.sheet.hitDice.count} hit dice, ${atFour.sheet.feats.length} feats`
        : 'no sheet came back',
    )

    // An override is the DM's last word, and the whole point of it is that awarding
    // a level five minutes later does not quietly undo it.
    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: elf.characterId,
      sheet: presetSheet({
        race: 'elf',
        classKey: 'rogue',
        subclassKey: 'thief',
        level: 4,
        overrides: { armourClass: DM_ARMOUR_CLASS },
      }),
    })
    await client.mutation('characters:setLevel', {
      code,
      dmCode,
      characterId: elf.characterId,
      level: 1,
    })
    const backAtOne = await readSheet(elf.characterId)
    check(
      'dropping below level 2 cleared the archetype in the stored document',
      backAtOne &&
        backAtOne.preset &&
        backAtOne.preset.level === 1 &&
        backAtOne.preset.subclassKey === null &&
        backAtOne.sheet.maxHp === ROGUE.base.maxHp,
      backAtOne
        ? `subclassKey ${JSON.stringify(backAtOne.preset && backAtOne.preset.subclassKey)}, ${backAtOne.sheet.maxHp} hp`
        : 'no sheet came back',
    )
    check(
      "the DM's armour class override survived the level change",
      backAtOne &&
        backAtOne.preset &&
        backAtOne.preset.overrides &&
        backAtOne.preset.overrides.armourClass === DM_ARMOUR_CLASS &&
        backAtOne.sheet.armourClass === DM_ARMOUR_CLASS,
      backAtOne
        ? `stored ${JSON.stringify(backAtOne.preset && backAtOne.preset.overrides)}, resolved AC ${backAtOne.sheet.armourClass} against the library's ${ROGUE.base.armourClass}`
        : 'no sheet came back',
    )

    // 14. The lock, which needs a seat to be a real test: refusing a player who
    // holds no claim would be `requireEditableCharacter` talking rather than the
    // lock. The seat is a real one, joined the way a player joins.
    const seat = await client.mutation('players:join', { code, displayName: 'Smoke Player' })
    seats.push(seat.playerId)
    const bramble = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Bramblefoot Tosscobble',
      sheet: presetSheet({ race: 'halfling', classKey: 'rogue', locked: true }),
    })
    createdCharacters.push(bramble.characterId)
    await client.mutation('characters:claim', {
      code,
      playerId: seat.playerId,
      characterId: bramble.characterId,
    })

    await refuses('characters:updateSheet refused a locked race change by the seat holding it', () =>
      client.mutation('characters:updateSheet', {
        code,
        playerId: seat.playerId,
        characterId: bramble.characterId,
        sheet: presetSheet({ race: 'elf', classKey: 'rogue', locked: true }),
      }),
    )
    await client.mutation('characters:setUnlocked', {
      code,
      dmCode,
      characterId: bramble.characterId,
      locked: false,
    })
    await client.mutation('characters:updateSheet', {
      code,
      playerId: seat.playerId,
      characterId: bramble.characterId,
      sheet: presetSheet({ race: 'elf', classKey: 'rogue', locked: false }),
    })
    const unlocked = await readSheet(bramble.characterId)
    check(
      'characters:setUnlocked let the same change straight through',
      unlocked && unlocked.preset && unlocked.preset.race === 'elf' && !unlocked.preset.locked,
      unlocked && unlocked.preset
        ? `race ${unlocked.preset.race}, locked ${unlocked.preset.locked}`
        : 'no sheet came back',
    )
    await refuses('characters:setLevel refused a level without the DM code', () =>
      client.mutation('characters:setLevel', {
        code,
        dmCode: 'not-the-dm-code',
        characterId: bramble.characterId,
        level: 2,
      }),
    )

    // 15. A long rest, which is three writes the table thinks of as one thing —
    // and `spentPerRest` is a field that did not exist on the vitals row until this
    // milestone, on a table whose rows were written without it.
    const human = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Aldis Fenwake',
      sheet: presetSheet({ race: 'human', classKey: 'fighter' }),
    })
    createdCharacters.push(human.characterId)

    await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: human.characterId,
      delta: -5,
    })
    await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: human.characterId,
      delta: -1,
    })
    const perRestBack = await client.mutation('characters:setPerRest', {
      code,
      dmCode,
      characterId: human.characterId,
      key: 'heroic-inspiration',
      spent: true,
    })
    const hurt = await dmVitalsFor(human.characterId)
    check(
      'damage, a spent hit die and a spent Heroic Inspiration all showed on one vitals row',
      hurt &&
        hurt.kind === 'exact' &&
        hurt.max === FIGHTER.base.maxHp &&
        hurt.current === FIGHTER.base.maxHp - 5 &&
        hurt.hitDiceCount === FIGHTER.base.hitDice.count &&
        hurt.hitDiceRemaining === 0 &&
        hurt.spentPerRest.length === 1 &&
        hurt.spentPerRest[0] === 'heroic-inspiration' &&
        perRestBack.spentPerRest.length === 1,
      hurt
        ? `${hurt.current}/${hurt.max}, ${hurt.hitDiceRemaining} of ${hurt.hitDiceCount} hit dice, spent ${JSON.stringify(hurt.spentPerRest)}`
        : 'no vitals row',
    )

    await client.mutation('characters:longRest', { code, dmCode, characterId: human.characterId })
    const afterRest = await dmVitalsFor(human.characterId)
    check(
      'characters:longRest reset hit points, hit dice and the per-rest array in one call',
      afterRest &&
        afterRest.kind === 'exact' &&
        afterRest.current === FIGHTER.base.maxHp &&
        afterRest.hitDiceRemaining === FIGHTER.base.hitDice.count &&
        afterRest.spentPerRest.length === 0,
      afterRest
        ? `${afterRest.current}/${afterRest.max}, ${afterRest.hitDiceRemaining} hit dice, spent ${JSON.stringify(afterRest.spentPerRest)}`
        : 'no vitals row',
    )
    // Checked against the character's own race rather than taken as given, so the
    // stored array cannot fill with keys nothing will ever clear. A Human has no
    // Relentless Endurance to spend.
    await refuses('characters:setPerRest refused a key this character’s race does not have', () =>
      client.mutation('characters:setPerRest', {
        code,
        dmCode,
        characterId: human.characterId,
        key: 'relentless-endurance',
        spent: true,
      }),
    )

    // 16. Selections the deployment has to refuse. The first two are the argument
    // validator's — a race and a class are unions of literals, so a key that is not
    // one of the eight never reaches a handler. The rest are `storedSheetProblem`'s,
    // and every one of them is a value convex-test would store without a word.
    //
    // ⚠️ **Every one of them sends the DM code**, which is Milestone 7's gate rather than
    // decoration. `storedSheetProblem` runs *after* `requireDm`, so an archetype refusal
    // written without a code would be refused as `NotDm` — passing the `refuses` check
    // while asserting nothing at all about archetypes. The two argument-validator cases
    // above it would still refuse for the right reason, and they carry the code anyway so
    // that the whole block is refused by the bound it names rather than by the gate.
    await refuses('characters:create refused a race that is not one of the eight', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Uninvited Gnome',
        sheet: presetSheet({ race: 'gnome', classKey: 'rogue' }),
      }),
    )
    await refuses('characters:create refused a class that is not one of the eight', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Uninvited Artificer',
        sheet: presetSheet({ race: 'human', classKey: 'artificer' }),
      }),
    )
    await refuses('characters:create refused an archetype belonging to another class', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Champion Rogue',
        sheet: presetSheet({
          race: 'human',
          classKey: 'rogue',
          subclassKey: 'champion',
          level: 2,
        }),
      }),
    )
    await refuses('characters:create refused an archetype chosen at level 1', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Premature Thief',
        sheet: presetSheet({ race: 'human', classKey: 'rogue', subclassKey: 'thief', level: 1 }),
      }),
    )
    // NaN and Infinity are perfectly ordinary float64s, so both survive the argument
    // validator and are refused by the bound instead — which is exactly the shape of
    // value a suite that does not apply value validation would let through.
    for (const [label, level] of [
      ['0', 0],
      ['21', 21],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ]) {
      await refuses(`characters:setLevel refused level ${label}`, () =>
        client.mutation('characters:setLevel', {
          code,
          dmCode,
          characterId: elf.characterId,
          level,
        }),
      )
    }
    // An override is a place a bad roll spec enters as easily as a feat list does,
    // and it is the one place a sheet entry arrives from outside the picker.
    await refuses('characters:updateSheet refused an override entry with an invalid roll', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: elf.characterId,
        sheet: presetSheet({
          race: 'elf',
          classKey: 'rogue',
          overrides: {
            armourClass: DM_ARMOUR_CLASS,
            extraFeats: [
              customEntry({
                id: 'dm-ninth-blade',
                name: 'Blade of the Ninth Step',
                text: 'A gift from the DM, on a die that does not exist.',
                roll: '1d7',
              }),
            ],
          },
        }),
      }),
    )

    const untouched = await readSheet(elf.characterId)
    check(
      'every refused selection left the stored preset exactly as it was',
      untouched &&
        untouched.preset &&
        untouched.preset.level === 1 &&
        untouched.preset.subclassKey === null &&
        untouched.preset.overrides &&
        untouched.preset.overrides.armourClass === DM_ARMOUR_CLASS &&
        untouched.preset.overrides.extraFeats === undefined &&
        untouched.sheet.feats.length === ROGUE.base.featCount + 1,
      untouched
        ? `${JSON.stringify(untouched.preset)}, ${untouched.sheet.feats.length} feats`
        : 'no sheet came back',
    )

    // 17. AND THE MILESTONE 3 GUARANTEE, CONFIRMED RATHER THAN ASSUMED.
    //
    // Every read of every character now goes through `resolveSheet`, so the band a
    // player gets for an NPC is computed from a sheet that is assembled rather than
    // stored — and five premade heroes have been added to the game since the scan
    // in section 10 ran. Both are reasons to look again rather than to trust that
    // the earlier pass still stands.
    const vitalsNow = await client.query('characters:vitals', { code })
    const listNow = await client.query('characters:list', { code })
    const npcNow = vitalsNow.find((row) => row.characterId === npc.characterId)
    const scannedNow = [vitalsNow, listNow]
    const serialisedNow = JSON.stringify(redactOpaque(scannedNow))
    check(
      'the Milestone 3 guarantee still holds with every sheet resolved server-side',
      npcNow &&
        npcNow.kind === 'band' &&
        !('current' in npcNow) &&
        !serialisedNow.includes(String(NPC_MAX_HP)) &&
        !serialisedNow.includes(String(NPC_CURRENT_HP)) &&
        !holdsNumber(scannedNow, NPC_MAX_HP) &&
        !holdsNumber(scannedNow, NPC_CURRENT_HP) &&
        !serialisedNow.includes(NPC_NAME) &&
        listNow.some((row) => row.name === PC_NAME),
      `${vitalsNow.length} rows a player may see, positive control included`,
    )

    // 18. And the start gate, which is what flips every client to the board.
    await client.mutation('games:start', { code, dmCode })
    const started = await client.query('games:getByCode', { code })
    check('games:start moved the game to playing', started && started.status === 'playing')
    await client.mutation('games:returnToLobby', { code, dmCode })

    // 19. MILESTONE 5. A FOURTH MEMBER OF THE STORED UNION, A LITERAL UNION OF TEN
    // FLOAT64S IN IT, AND A SECOND OPTIONAL OBJECT OF OPTIONAL FIELDS BESIDE IT.
    //
    // Read the section as one claim, the same shape as Milestone 4's: **a name, a
    // creature key and a challenge rating go in, and every number that comes back was
    // assembled server-side out of a corpus the client never sees.** Then two things only
    // a real deployment can answer:
    //
    //   - `crValidator` is a union of ten *literals*, three of which are fractions. CR 1.5
    //     and 0.3 are perfectly ordinary float64s, so they survive everything convex-test
    //     applies and are refused at the function boundary here — which is the whole
    //     reason `normaliseStoredSheet` is allowed not to round a rating.
    //   - `bestiaryOverridesValidator` is a second optional object of ten optional fields
    //     nested inside an optional member of a union. Convex has opinions about that
    //     shape; convex-test has none.
    //
    // ⚠️ **Both of this repo's silently-dropped-field bugs were found here**, and the
    // shape of each was a field-by-field rebuild that a validator permitted to be absent.
    // `withCreatureOverrides` and `normaliseCreatureOverrides` are two more of those
    // rebuilds, over ten fields each, so the override round trip below is not ceremony.
    const wolf = await client.mutation('characters:create', {
      code,
      dmCode,
      name: WOLF_CHARACTER_NAME,
      sheet: { kind: 'bestiary', entryKey: WOLF.key, cr: WOLF.libraryCr },
    })
    // Pushed before anything is asserted about it, so the `finally` reclaims it however
    // the checks below go.
    createdCharacters.push(wolf.characterId)
    check(
      'characters:create stored a creature as two fields and a rating',
      Boolean(wolf.characterId),
    )

    const wolfAtOne = await readSheet(wolf.characterId)
    const storedSelections = wolfAtOne && wolfAtOne.creature
    check(
      'characters:sheet carried the selections and the library’s labels together',
      storedSelections &&
        storedSelections.entryKey === WOLF.key &&
        storedSelections.cr === WOLF.libraryCr &&
        storedSelections.libraryCr === WOLF.libraryCr &&
        storedSelections.name === WOLF.entryName &&
        storedSelections.blurb === WOLF.blurb &&
        storedSelections.loot === WOLF.loot &&
        storedSelections.overrides === null &&
        storedSelections.overriddenFields.length === 0 &&
        storedSelections.social === null &&
        wolfAtOne.preset === null &&
        wolfAtOne.extras === null,
      storedSelections ? JSON.stringify(storedSelections) : 'no creature payload came back',
    )

    // None of this was sent in. A key and a rating went out; the hit points, the armour
    // class, the four d20 bonuses, the two skill bonuses and the damage expression all
    // came back off the corpus and through the scaler.
    const oneDrift = wolfAtOne
      ? firstDifference(WOLF.atCr1, statlineOf(wolfAtOne.sheet), 'statline')
      : 'no sheet came back'
    check(
      'the corpus resolved a whole statline out of a key and a rating',
      wolfAtOne &&
        oneDrift === null &&
        wolfAtOne.sheet.kind === 'npc' &&
        wolfAtOne.sheet.actions.length === 3 &&
        wolfAtOne.sheet.actions[0].id === 'atk:bite' &&
        wolfAtOne.sheet.actions[0].text.startsWith(WOLF.biteAtCr1),
      oneDrift ??
        (wolfAtOne
          ? `${wolfAtOne.sheet.maxHp} hp, AC ${wolfAtOne.sheet.armourClass}, ${wolfAtOne.sheet.actions.length} actions`
          : 'no sheet came back'),
    )
    check(
      'the vitals row was seeded from the corpus maximum, not from a default',
      (await dmVitalsFor(wolf.characterId)) &&
        (await dmVitalsFor(wolf.characterId)).max === WOLF.atCr1.maxHp,
      `${JSON.stringify(await dmVitalsFor(wolf.characterId))} against ${WOLF.atCr1.maxHp}`,
    )

    // ONE FIELD IN, EIGHT NUMBERS OUT.
    const serialisedAtOne = wolfAtOne ? JSON.stringify(wolfAtOne.sheet) : ''
    await client.mutation('characters:setCreatureCr', {
      code,
      dmCode,
      characterId: wolf.characterId,
      cr: 4,
    })
    const wolfAtFour = await readSheet(wolf.characterId)
    const fourDrift = wolfAtFour
      ? firstDifference(WOLF.atCr4, statlineOf(wolfAtFour.sheet), 'statline')
      : 'no sheet came back'
    check(
      'characters:setCreatureCr moved eight numbers and left the words alone',
      wolfAtOne &&
        wolfAtFour &&
        fourDrift === null &&
        wolfAtFour.creature.cr === 4 &&
        wolfAtFour.creature.libraryCr === WOLF.libraryCr &&
        // The tier is the *resolved* rating's, so a DM who scaled something reads what it
        // is now — CR 4 is Tier IV.
        wolfAtFour.creature.tier === 4 &&
        // The ids do not renumber, because they are derived from the name rather than the
        // position: React would otherwise read the whole list as replaced.
        wolfAtFour.sheet.actions.map((entry) => entry.id).join(',') ===
          wolfAtOne.sheet.actions.map((entry) => entry.id).join(','),
      fourDrift ?? `CR ${wolfAtFour ? wolfAtFour.creature.cr : '—'}, tier ${wolfAtFour ? wolfAtFour.creature.tier : '—'}`,
    )
    // Nothing scaled was persisted: there is nowhere on the stored document to put a
    // number, which is what makes the round trip below non-compounding by construction.
    check(
      'the shift wrote the rating and nothing else',
      wolfAtFour &&
        wolfAtFour.creature.overrides === null &&
        wolfAtFour.creature.overriddenFields.length === 0,
      wolfAtFour ? JSON.stringify(wolfAtFour.creature.overrides) : 'no creature payload',
    )

    // AND BACK. Byte-identical, or the scaler is reading a previously scaled result.
    await client.mutation('characters:setCreatureCr', {
      code,
      dmCode,
      characterId: wolf.characterId,
      cr: WOLF.libraryCr,
    })
    const wolfBack = await readSheet(wolf.characterId)
    check(
      'CR 1 → 4 → 1 came back byte-identical, and the shift itself was real',
      wolfBack &&
        wolfAtFour &&
        JSON.stringify(wolfBack.sheet) === serialisedAtOne &&
        // The positive control. Without it a scaler that returned its input
        // unconditionally would pass the assertion above.
        serialisedAtOne !== JSON.stringify(wolfAtFour.sheet),
      wolfBack && wolfAtFour
        ? `${wolfBack.sheet.maxHp} hp of ${WOLF.atCr1.maxHp}, against ${wolfAtFour.sheet.maxHp} at CR 4`
        : 'no sheet came back',
    )

    // THE FRACTION, THROUGH A REAL ROUND TRIP. `maxHp` lives on the resolved sheet and
    // current hit points live in `characterVitals`, so a shift is two writes in one
    // transaction — and the number that has to survive it is a ratio rather than a value.
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: wolf.characterId,
      currentHp: 15,
    })
    await client.mutation('characters:setCreatureCr', {
      code,
      dmCode,
      characterId: wolf.characterId,
      cr: 4,
    })
    const rescaled = await dmVitalsFor(wolf.characterId)
    check(
      'a creature on half its hit points came out on half of the new maximum',
      // round(15 × 83/31) = round(40.16) = 40 of 83. Neither dead nor healed.
      rescaled && rescaled.current === 40 && rescaled.max === WOLF.atCr4.maxHp,
      rescaled ? `${rescaled.current}/${rescaled.max}, wanted 40/${WOLF.atCr4.maxHp}` : 'no vitals row',
    )

    // An override is the DM's last word, and the scale happens before it — so a boss-fight
    // armour class stays bumped through a shift while everything unpinned moves.
    //
    // ⚠️ **`attackBonus` is overridden alongside it, and that is the ordering bug nothing
    // else in this repo would catch.** Every attack's to-hit is composed *from* this one
    // field, and `withCreatureOverrides` patches the field while leaving `actions`
    // untouched — so composing the to-hit before the merge rather than after gives a
    // creature whose sheet reads +12 and whose every weapon rolls +7. The local suite
    // cannot see it: both numbers come back on the same payload, from the same query, and
    // the panel draws a creature that looks entirely self-consistent. The DM finds out
    // when the boss misses all night.
    //
    // The armour class is what makes the check a pair. It is overridden *and* not derived
    // from anything, so it proves the merge ran at all — without it, a resolver that
    // ignored the whole override object would pass the to-hit assertion by leaving the
    // corpus's +7 in both places and agreeing with itself.
    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: wolf.characterId,
      sheet: {
        kind: 'bestiary',
        entryKey: WOLF.key,
        cr: 4,
        overrides: {
          armourClass: DM_CREATURE_ARMOUR_CLASS,
          attackBonus: DM_CREATURE_ATTACK_BONUS,
          // The sixth and last array position `sheetEntryValidator` occupies, and the
          // only one where a *hand-written* weapon reaches a creature. Two things are
          // being asked at once: that a DM's own entry round-trips both new fields
          // through `normaliseCreatureOverrides`, and that resolution leaves it exactly
          // as written rather than composing over it. The second is the interesting
          // one — the corpus's attacks all take the creature's one bonus, and a
          // resolver that rewrote every weapon on the sheet rather than every weapon it
          // built would silently retune a line the DM typed a number into.
          extraActions: [
            {
              id: 'dm-witchfire-brand',
              name: 'Witchfire Brand',
              text: 'A brand the DM handed this one for tonight, aimed on its own bonus rather than the creature’s.',
              roll: '3d8+2',
              level: null,
              catalogueKey: null,
              category: 'weapon',
              toHit: '1d20+9',
            },
          ],
        },
      },
    })
    await client.mutation('characters:setCreatureCr', {
      code,
      dmCode,
      characterId: wolf.characterId,
      cr: 6,
    })
    const wolfAtSix = await readSheet(wolf.characterId)
    const sixDrift = wolfAtSix
      ? firstDifference(
          {
            ...WOLF.atCr6,
            armourClass: DM_CREATURE_ARMOUR_CLASS,
            attackBonus: DM_CREATURE_ATTACK_BONUS,
            toHit: DM_CREATURE_TO_HIT,
          },
          statlineOf(wolfAtSix.sheet),
          'statline',
        )
      : 'no sheet came back'
    check(
      "the DM's pinned numbers survived a shift while the rest of the statline moved",
      wolfAtSix &&
        sixDrift === null &&
        wolfAtSix.creature.overrides &&
        wolfAtSix.creature.overrides.armourClass === DM_CREATURE_ARMOUR_CLASS &&
        wolfAtSix.creature.overrides.attackBonus === DM_CREATURE_ATTACK_BONUS &&
        wolfAtSix.creature.overriddenFields.length === 3 &&
        wolfAtSix.creature.overriddenFields.includes('armourClass') &&
        wolfAtSix.creature.overriddenFields.includes('attackBonus') &&
        wolfAtSix.creature.overriddenFields.includes('extraActions') &&
        wolfAtSix.sheet.actions[0].text.startsWith(WOLF.biteAtCr6),
      sixDrift ??
        (wolfAtSix
          ? `AC ${wolfAtSix.sheet.armourClass} against the corpus's ${WOLF.atCr6.armourClass}, ${wolfAtSix.sheet.maxHp} hp, pinned ${JSON.stringify(wolfAtSix.creature.overriddenFields)}`
          : 'no sheet came back'),
    )
    // ⚠️ **THE SAME NUMBER, READ IN BOTH PLACES, ASSERTED TO AGREE.** Stated on its own
    // rather than left inside the statline drift above, because this is the failure that
    // would otherwise be reported as "some field moved" — and because the claim is not
    // that either value is right, it is that the two are **one number spelled twice** and
    // moved together. A creature carries exactly one `attackBonus` (ADR 0007), and every
    // weapon on its sheet is that bonus written as a roll. `1d20+12` against a stated +12
    // is the whole of what is being checked; the arithmetic is `toHitFromBonus`'s and is
    // deliberately not restated here, only the agreement is.
    //
    // Every attack the corpus contributed, not merely the first: `statlineOf` reads
    // `actions[0]`, so a resolver that composed the first attack from the merged bonus
    // and the rest from the scaled one would sail past everything above. Honest about
    // the reach of that — a Dire Wolf has exactly one attack, so the `every` below is
    // one entry wide today and is written this way because the *next* fixture is not.
    // What is genuinely more than one wide is the discrimination: the DM's own weapon is
    // on this sheet too and must be left alone, which is the check after it.
    const corpusAttacks = wolfAtSix
      ? wolfAtSix.sheet.actions.filter((entry) => entry.id.startsWith('atk:'))
      : []
    check(
      "the creature's attack bonus and every attack's to-hit moved together",
      wolfAtSix &&
        wolfAtSix.sheet.attackBonus === DM_CREATURE_ATTACK_BONUS &&
        corpusAttacks.length > 0 &&
        corpusAttacks.every(
          (entry) => entry.category === 'weapon' && entry.toHit === DM_CREATURE_TO_HIT,
        ) &&
        // The positive control, and it is not ceremony: without it this passes on a
        // deployment where the override was ignored entirely and both readings sat at
        // the corpus's +7, agreeing with each other and with nothing else.
        WOLF.atCr6.toHit !== DM_CREATURE_TO_HIT,
      wolfAtSix
        ? `sheet ${wolfAtSix.sheet.attackBonus}, ${corpusAttacks.length} attacks rolling ${JSON.stringify([...new Set(corpusAttacks.map((entry) => entry.toHit))])}, against the unoverridden ${WOLF.atCr6.toHit}`
        : 'no sheet came back',
    )
    // And the DM's own entry, left exactly as written. `+9` is neither the creature's
    // overridden `+12` nor the corpus's scaled `+7`, so a resolver that recomposed every
    // weapon it found — rather than every weapon it built — changes this and nothing
    // else on the sheet.
    const dmWeapon = wolfAtSix
      ? wolfAtSix.sheet.actions.find((entry) => entry.id === 'dm-witchfire-brand')
      : null
    check(
      "the DM's own weapon kept the to-hit the DM typed, not the creature's",
      dmWeapon &&
        dmWeapon.category === 'weapon' &&
        dmWeapon.toHit === '1d20+9' &&
        dmWeapon.roll === '3d8+2' &&
        // Appended after the corpus's own, which is the order the sheet shows.
        wolfAtSix.sheet.actions[wolfAtSix.sheet.actions.length - 1].id === 'dm-witchfire-brand',
      dmWeapon
        ? `${JSON.stringify(dmWeapon.toHit)} against the creature's ${DM_CREATURE_TO_HIT}`
        : `no DM action among ${wolfAtSix ? wolfAtSix.sheet.actions.map((entry) => entry.id).join(', ') : '—'}`,
    )
    const rescaledAgain = await dmVitalsFor(wolf.characterId)
    check(
      'the fraction survived the second shift too',
      // round(40 × 143/83) = round(68.92) = 69 of 143.
      rescaledAgain && rescaledAgain.current === 69 && rescaledAgain.max === WOLF.atCr6.maxHp,
      rescaledAgain
        ? `${rescaledAgain.current}/${rescaledAgain.max}, wanted 69/${WOLF.atCr6.maxHp}`
        : 'no vitals row',
    )

    // 20. THE ACCEPTANCE TEST, EXTENDED TO THE SHELF. The creature's coin goes on the
    // PLAYER layer, because that is the case that matters — the party can see the thing
    // in the reeds, so they get a health bar for it, and the bar must not be built out of
    // its exact hit points. A DM-layer creature is the easy case.
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: wolf.characterId,
      currentHp: WOLF_CURRENT_HP,
    })
    const wolfToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Deliberately neither the entry's name nor the character's: a player is *supposed*
      // to see what is written on a coin, so reusing either would make the scan below
      // unable to tell a leak from the thing it is meant to allow.
      name: 'Shape in the Reeds',
      layer: 'player',
      sizeSquares: 2,
      tint: '#34495e',
      characterId: wolf.characterId,
      x: 1100,
      y: 700,
    })
    created.push(wolfToken.tokenId)

    // And a person, whose social block is the other half of what a creature carries. It
    // has no combat statistics at all, so nothing here is a statline — what is secret is
    // what she knows.
    const innkeeper = await client.mutation('characters:create', {
      code,
      dmCode,
      name: INNKEEPER.characterName,
      sheet: { kind: 'bestiary', entryKey: INNKEEPER.key, cr: 0 },
    })
    createdCharacters.push(innkeeper.characterId)
    await client.mutation('characters:setCreatureCr', {
      code,
      dmCode,
      characterId: innkeeper.characterId,
      cr: INNKEEPER.shiftedCr,
    })
    const innkeeperToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Someone Behind the Bar',
      layer: 'player',
      sizeSquares: 1,
      tint: '#d35400',
      characterId: innkeeper.characterId,
      x: 1500,
      y: 300,
    })
    created.push(innkeeperToken.tokenId)
    const innkeeperSheet = await readSheet(innkeeper.characterId)
    check(
      'a fractional challenge rating round-tripped exactly, on a creature with no statline',
      innkeeperSheet &&
        innkeeperSheet.creature.cr === INNKEEPER.shiftedCr &&
        innkeeperSheet.creature.libraryCr === 0 &&
        innkeeperSheet.creature.social &&
        innkeeperSheet.creature.social.knows === INNKEEPER.knows &&
        innkeeperSheet.creature.social.personality.length === 3 &&
        innkeeperSheet.sheet.actions.length === 0,
      innkeeperSheet
        ? `cr ${innkeeperSheet.creature.cr} of ${INNKEEPER.shiftedCr}`
        : 'no sheet came back',
    )

    const creatureVitals = await client.query('characters:vitals', { code })
    const wolfBand = creatureVitals.find((row) => row.characterId === wolf.characterId)
    check(
      'a player sees the creature as a band, with no hit-point key on the row at all',
      wolfBand && wolfBand.kind === 'band' && !('current' in wolfBand) && !('max' in wolfBand),
      wolfBand ? `keys: ${Object.keys(wolfBand).sort().join(', ')}` : 'no row for the creature',
    )

    const creatureList = await client.query('characters:list', { code })
    const wolfAsPlayer = await client.query('characters:sheet', {
      code,
      characterId: wolf.characterId,
    })
    const personAsPlayer = await client.query('characters:sheet', {
      code,
      characterId: innkeeper.characterId,
    })
    // Scanned twice over, for the reason section 10 gives: `holdsNumber` walks every
    // number in the decoded payload, which is exact, and the substring scan over the
    // redacted form catches one that arrived as text in a field nobody thought to look at.
    // One catches 143 hiding in a string; the other catches it as a float64 in an object.
    const shelfScannable = [creatureVitals, creatureList, wolfAsPlayer, personAsPlayer]
    const shelfSerialised = JSON.stringify(redactOpaque(shelfScannable))
    const shelfNeedles = [
      WOLF.key,
      WOLF.entryName,
      WOLF_CHARACTER_NAME,
      WOLF.blurb,
      WOLF.loot,
      INNKEEPER.key,
      INNKEEPER.entryName,
      INNKEEPER.characterName,
      INNKEEPER.loot,
      // The one that is not a statistic and matters most. What the innkeeper knows is the
      // plot, and the whole social block is DM-only for that reason.
      INNKEEPER.knows,
    ]
    const leaked = shelfNeedles.filter((needle) => shelfSerialised.includes(needle))
    check(
      "nothing off the DM's shelf appears in a player's payload",
      leaked.length === 0 &&
        !shelfSerialised.includes(String(WOLF.atCr6.maxHp)) &&
        !shelfSerialised.includes(String(WOLF_CURRENT_HP)) &&
        !shelfSerialised.includes(String(INNKEEPER.shiftedCr)) &&
        !holdsNumber(shelfScannable, WOLF.atCr6.maxHp) &&
        !holdsNumber(shelfScannable, WOLF_CURRENT_HP) &&
        !holdsNumber(shelfScannable, INNKEEPER.shiftedCr),
      leaked.length > 0
        ? `leaked ${JSON.stringify(leaked)}`
        : `${WOLF_CURRENT_HP}/${WOLF.atCr6.maxHp} and CR ${INNKEEPER.shiftedCr} scanned as text and as numbers`,
    )

    // THE POSITIVE CONTROL, in three parts because the needles live in three payloads —
    // and without it the scan above passes on a game with no creature in it, which is the
    // failure mode this repo has written down twice.
    const shelf = await client.query('bestiary:index', { code, dmCode })
    const shelfText = JSON.stringify(shelf)
    check(
      'bestiary:index hands the DM 129 summary rows and no stat block',
      shelf.length === 129 &&
        shelfText.includes(WOLF.key) &&
        shelfText.includes(WOLF.entryName) &&
        shelfText.includes(WOLF.blurb) &&
        shelfText.includes(INNKEEPER.key) &&
        !shelfText.includes('"maxHp":') &&
        !shelfText.includes('"armourClass":') &&
        !shelfText.includes('"notes":') &&
        !shelfText.includes('"loot":') &&
        !shelfText.includes('"knows":'),
      `${shelf.length} rows, positive control included`,
    )
    const original = await client.query('bestiary:entry', { code, dmCode, key: WOLF.key })
    check(
      "bestiary:entry is the library's own copy, with the DM's override skipped",
      original &&
        original.sheet.armourClass === WOLF.atCr1.armourClass &&
        original.sheet.maxHp === WOLF.atCr1.maxHp &&
        original.extras.loot === WOLF.loot &&
        // View Original: the creature in the game is pinned at 25 and at CR 6, and none
        // of that reaches the library's copy.
        original.sheet.armourClass !== DM_CREATURE_ARMOUR_CLASS,
      original
        ? `AC ${original.sheet.armourClass}, ${original.sheet.maxHp} hp at CR ${original.extras.libraryCr}`
        : 'no entry came back',
    )
    const dmWolfSheet = JSON.stringify(await readSheet(wolf.characterId))
    const dmWolfVitals = await dmVitalsFor(wolf.characterId)
    check(
      'the same fetches with the DM code do carry every one of them',
      dmWolfSheet.includes(WOLF.key) &&
        dmWolfSheet.includes(WOLF_CHARACTER_NAME) &&
        dmWolfSheet.includes(WOLF.loot) &&
        JSON.stringify(innkeeperSheet).includes(INNKEEPER.knows) &&
        dmWolfVitals &&
        dmWolfVitals.kind === 'exact' &&
        dmWolfVitals.current === WOLF_CURRENT_HP &&
        dmWolfVitals.max === WOLF.atCr6.maxHp,
      'positive control — without it the scan above passes on an empty fixture',
    )

    // 21. Reset to library defaults, which is one patch rather than two: the rating goes
    // back, the override is deleted by simply not being named on the rebuilt object, and
    // hit points are reconciled by the same write.
    await client.mutation('characters:resetCreature', {
      code,
      dmCode,
      characterId: wolf.characterId,
    })
    const reset = await readSheet(wolf.characterId)
    const resetDrift = reset
      ? firstDifference(WOLF.atCr1, statlineOf(reset.sheet), 'statline')
      : 'no sheet came back'
    const resetVitals = await dmVitalsFor(wolf.characterId)
    check(
      'characters:resetCreature cleared the rating and the override together',
      reset &&
        resetDrift === null &&
        reset.creature.cr === WOLF.libraryCr &&
        reset.creature.overrides === null &&
        reset.creature.overriddenFields.length === 0 &&
        // round(89 × 31/143) = round(19.29) = 19 of 31.
        resetVitals &&
        resetVitals.current === 19 &&
        resetVitals.max === WOLF.atCr1.maxHp,
      resetDrift ??
        (resetVitals
          ? `CR ${reset.creature.cr}, ${resetVitals.current}/${resetVitals.max}, wanted 19/${WOLF.atCr1.maxHp}`
          : 'no vitals row'),
    )

    // 22. Values the local suite cannot judge. Every one of these is a shape convex-test
    // stores or accepts without a word.
    await refuses('characters:create refused a creature without the DM code', () =>
      client.mutation('characters:create', {
        code,
        name: 'Uninvited Dire Wolf',
        sheet: { kind: 'bestiary', entryKey: WOLF.key, cr: WOLF.libraryCr },
      }),
    )
    await refuses('characters:create refused a creature key the corpus does not have', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Invented Beast',
        sheet: { kind: 'bestiary', entryKey: 'no-such-beast', cr: 1 },
      }),
    )
    // ⚠️ **THIS IS WHERE CONVEX'S OWN ARGUMENT VALIDATION EARNS ITS PLACE.** `crValidator`
    // is a union of ten literals rather than a range, and 1.5, 0.3, NaN and Infinity are
    // all perfectly ordinary float64s — so every one of them survives the local suite and
    // is refused at the function boundary here. That refusal is the entire reason
    // `normaliseStoredSheet` is allowed to leave a rating unrounded, which it must,
    // because `Math.round` collapses CR ⅛, ¼ and ½ onto other ratings.
    for (const [label, cr] of [
      ['1.5', 1.5],
      ['0.3', 0.3],
      ['7', 7],
      ['-1', -1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ]) {
      await refuses(`characters:setCreatureCr refused CR ${label}`, () =>
        client.mutation('characters:setCreatureCr', {
          code,
          dmCode,
          characterId: wolf.characterId,
          cr,
        }),
      )
    }
    // The three fractional ratings that a rounding would have destroyed are all accepted,
    // so the refusals above are set membership rather than "no fractions allowed".
    for (const cr of [0.125, 0.25, 0.5]) {
      await client.mutation('characters:setCreatureCr', {
        code,
        dmCode,
        characterId: wolf.characterId,
        cr,
      })
      const stored = await readSheet(wolf.characterId)
      check(
        `characters:setCreatureCr stored CR ${cr} without rounding it`,
        stored && stored.creature.cr === cr,
        stored ? `stored ${stored.creature.cr}` : 'no sheet came back',
      )
    }
    await refuses('bestiary:index refused a caller with no DM code', () =>
      client.query('bestiary:index', { code }),
    )
    await refuses('bestiary:index refused a well-formed wrong DM code', () =>
      client.query('bestiary:index', { code, dmCode: 'not-the-dm-code' }),
    )
    await refuses('bestiary:entry refused a well-formed wrong DM code', () =>
      client.query('bestiary:entry', { code, dmCode: 'not-the-dm-code', key: WOLF.key }),
    )
    // The override object is the other new shape, and it is a place a bad value enters as
    // easily as a hand-built sheet is — with one difference that makes it worse: the same
    // merge runs in the browser, so a preview agrees with the server exactly and nothing
    // on screen looks wrong.
    await refuses('characters:updateSheet refused a NaN inside a creature override', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: wolf.characterId,
        sheet: {
          kind: 'bestiary',
          entryKey: WOLF.key,
          cr: 1,
          overrides: { armourClass: Number.NaN },
        },
      }),
    )
    await refuses('characters:updateSheet refused an out-of-range creature save DC', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: wolf.characterId,
        sheet: { kind: 'bestiary', entryKey: WOLF.key, cr: 1, overrides: { saveDc: 0 } },
      }),
    )
    // THE MILESTONE 1 BUG, restated for the newest string field on the newest object. A
    // lone high surrogate is an ordinary one-character string to every bound in
    // lib/sheet.ts, so nothing in the application refuses it and nothing in the suite
    // notices; only a real deployment insists a stored string be valid Unicode.
    await refuses('characters:updateSheet refused a lone surrogate in override notes', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: wolf.characterId,
        sheet: {
          kind: 'bestiary',
          entryKey: WOLF.key,
          cr: 1,
          overrides: { notes: 'Half an emoji: \uD800' },
        },
      }),
    )
    await refuses('characters:updateSheet refused a creature becoming a hero', () =>
      client.mutation('characters:updateSheet', {
        code,
        dmCode,
        characterId: wolf.characterId,
        sheet: presetSheet({ race: 'human', classKey: 'fighter' }),
      }),
    )
    await refuses('characters:claim refused a creature to a seat', () =>
      client.mutation('characters:claim', {
        code,
        playerId: seat.playerId,
        characterId: wolf.characterId,
      }),
    )
    const survivingCreature = await readSheet(wolf.characterId)
    check(
      'every refused write left the creature exactly as it was',
      survivingCreature &&
        survivingCreature.creature.entryKey === WOLF.key &&
        survivingCreature.creature.cr === 0.5 &&
        survivingCreature.creature.overrides === null,
      survivingCreature
        ? JSON.stringify(survivingCreature.creature.overrides) +
            ` at CR ${survivingCreature.creature.cr}`
        : 'no sheet came back',
    )

    // 23. MILESTONE 7'S FIRST NEW STORED FIELD, AND THE TRAP IT WALKS STRAIGHT INTO.
    //
    // `NpcSheet.group` is the sixth optional field on that validator, and it is the only
    // one of this milestone's three that passes through a **field-by-field rebuild**:
    // `normaliseSheet` reconstructs a creature field by field and carries this one by
    // conditional spread. That is the fifth outing of the bug that shipped
    // `skillProficiencies` and then `speed`, and this script is the only thing that has
    // ever caught it — because a dropped optional field round-trips through a validator
    // that permits it to be absent, so the local suite stays green and only a real
    // deployment can say whether absence is a storable state.
    //
    // The pair below is the whole of the check. Neither half is optional: the positive
    // passes on a deployment that materialised a group for everything, the negative on
    // one that discarded every new field it was sent. See ADR 0008 § "Two things found by
    // building it", which is where that lesson was written down.
    const grantedCreature = await client.mutation('characters:create', {
      code,
      dmCode,
      name: GRANTED_NAME,
      sheet: GRANTED_SHEET,
    })
    createdCharacters.push(grantedCreature.characterId)
    const ambush = await client.mutation('characters:create', {
      code,
      dmCode,
      name: AMBUSH_NAME,
      sheet: AMBUSH_SHEET,
    })
    createdCharacters.push(ambush.characterId)

    const grantedStored = await readSheet(grantedCreature.characterId)
    const ambushStored = await readSheet(ambush.characterId)
    // Read off the *resolved* sheet, which for a hand-built creature is the stored one:
    // `resolveSheet` returns an `npc` document unchanged, so what comes back here is
    // genuinely what the deployment holds rather than something assembled over the top.
    check(
      'a creature sent with a group came back with it',
      grantedStored && grantedStored.sheet.group === 'monster',
      grantedStored
        ? `positive control — without it the check below passes on a deployment that discarded everything; got ${JSON.stringify(grantedStored.sheet.group)}`
        : 'no sheet came back',
    )
    // ABSENCE, ASSERTED AS ABSENCE — on the KEY rather than on the value, exactly as
    // section 6 does for `category` and `toHit`. `sheet.group === undefined` is also true
    // of a stored empty string, and an empty string is not how a field says it is absent.
    check(
      'its sibling, sent without one, came back with no group key at all',
      ambushStored && !('group' in ambushStored.sheet),
      ambushStored
        ? `keys: ${Object.keys(ambushStored.sheet).sort().join(', ')}`
        : 'no sheet came back',
    )
    // AND BACK, which is the half a create alone cannot ask. `writeSheet` patches the
    // whole `sheet` field, so omitting the key has to *remove* a value that is already
    // there — a deployment that merged rather than replaced would leave `monster` behind
    // on a document the DM had just refiled as an NPC, and nothing on screen would say so.
    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: ambush.characterId,
      sheet: { ...AMBUSH_SHEET, group: 'npc' },
    })
    const ambushRefiled = await readSheet(ambush.characterId)
    await client.mutation('characters:updateSheet', {
      code,
      dmCode,
      characterId: ambush.characterId,
      sheet: AMBUSH_SHEET,
    })
    const ambushCleared = await readSheet(ambush.characterId)
    check(
      'a group written onto a creature that had none, and then taken off again',
      ambushRefiled &&
        ambushRefiled.sheet.group === 'npc' &&
        ambushCleared &&
        !('group' in ambushCleared.sheet),
      ambushRefiled && ambushCleared
        ? `${JSON.stringify(ambushRefiled.sheet.group)} then keys ${Object.keys(ambushCleared.sheet).sort().join(', ')}`
        : 'no sheet came back',
    )

    // 24. THE HEADING, ON EVERY KIND OF SHEET THE SCHEMA HAS.
    //
    // `characters.list` now carries `group` beside `kind`, and the two answer different
    // questions on the same row: `kind` decides whether a caller may know the character
    // exists, `group` decides which of the DM's three headings it is printed under. Four
    // stored kinds do not map onto three groups, which is why one field cannot do both
    // jobs — so this checks all five cases the mapping actually has to distinguish.
    //
    // The bestiary pair is the interesting one and the reason this is worth a round trip
    // rather than a unit test: a linked creature's heading is read off the *file* its
    // entry lives in, so `dire-wolf` and `innkeeper` are one stored kind and two
    // headings, resolved server-side out of a corpus the client never sees.
    const groupedList = await client.query('characters:list', { code, dmCode })
    const rowFor = (characterId) => groupedList.find((row) => row._id === characterId) ?? null
    const groupings = [
      ['a hand-built hero', pc.characterId, 'pc', 'character'],
      ['a premade hero', elf.characterId, 'pc', 'character'],
      // No group stored — section 23 took it back off — so this is `groupOf`'s default
      // being asserted rather than a value anybody sent.
      ['a hand-built creature with no group', ambush.characterId, 'npc', 'npc'],
      ['a bestiary monster', wolf.characterId, 'npc', 'monster'],
      ['a bestiary social NPC', innkeeper.characterId, 'npc', 'npc'],
    ]
    const misfiled = groupings.filter(([, characterId, kind, group]) => {
      const row = rowFor(characterId)
      return !row || row.kind !== kind || row.group !== group
    })
    check(
      'characters:list filed all five kinds of sheet under the right heading',
      misfiled.length === 0,
      misfiled.length > 0
        ? `misfiled ${JSON.stringify(
            misfiled.map(([label, characterId, kind, group]) => {
              const row = rowFor(characterId)
              return [label, row ? [row.kind, row.group] : 'no row', [kind, group]]
            }),
          )}`
        : `${groupings.length} rows, including the two bestiary kinds that share a stored kind and differ`,
    )
    // And the claim the whole default rests on: **only the DM ever receives a group that
    // is not `'character'`**. That is what makes a wrong answer a misfiled row rather than
    // a published dragon, and it is asserted rather than assumed because it is the licence
    // `groupOf` takes to have a tolerant default at all.
    const playerGrouped = await client.query('characters:list', { code })
    check(
      "a player's rows are all 'character', which is what makes the default safe",
      playerGrouped.length > 0 &&
        playerGrouped.every((row) => row.group === 'character' && row.kind === 'pc'),
      `${playerGrouped.length} rows, groups ${JSON.stringify([
        ...new Set(playerGrouped.map((row) => row.group)),
      ])} — positive control included`,
    )

    // 25. RESERVED: A HERO THE DM HAS BUILT FOR SOMEBODY WHO IS NOT HERE YET.
    //
    // The second new stored field, and the second optional one. Reserved means **absent
    // from a player's payload rather than greyed out in it**, because a disabled row still
    // publishes a name and the name is the spoiler — so it is a second filter composed
    // with `maySeeCharacter` at two call sites rather than folded into it.
    const seatA = await client.mutation('players:join', { code, displayName: 'Smoke Player A' })
    seats.push(seatA.playerId)
    const seatB = await client.mutation('players:join', { code, displayName: 'Smoke Player B' })
    seats.push(seatB.playerId)

    await client.mutation('characters:setReserved', {
      code,
      dmCode,
      characterId: goliath.characterId,
      reserved: true,
    })
    reservedCharacters.push(goliath.characterId)

    const listAfterReserve = await client.query('characters:list', { code })
    const dmListAfterReserve = await client.query('characters:list', { code, dmCode })
    check(
      'a reserved hero is absent from a player’s character list, name and all',
      !listAfterReserve.some((row) => row._id === goliath.characterId) &&
        !JSON.stringify(listAfterReserve).includes(RESERVED_NAME) &&
        // The positive control, and it is the load-bearing half: without it this passes
        // on a deployment that lost the character altogether.
        dmListAfterReserve.some((row) => row._id === goliath.characterId),
      `player ${listAfterReserve.length} rows, DM ${dmListAfterReserve.length} — positive control included`,
    )
    // ⚠️ **The roster half of this is asserted at the only point it is reachable, and that
    // is worth saying rather than faking.** `playerCharacterNames` withholds a reserved
    // character's name from `players.list`, so a seat holding one would show a blank label
    // — but "held and reserved" is a state nothing can produce: `claim` refuses a reserved
    // character, `setReserved` refuses a held one, and `assign` clears the flag as it hands
    // it over. So the reachable statement is the weak one below, and the strong one is the
    // pair after it: `assign` clears the flag, and the roster then *does* print the name.
    // Constructing the unreachable state would need a write this API does not have.
    const rosterAfterReserve = await client.query('players:list', { code })
    check(
      'no seat’s roster row names the reserved hero',
      !rosterAfterReserve.some((row) => row.characterName === RESERVED_NAME),
      `${rosterAfterReserve.length} seats — reserved-and-held is unreachable through this API, so this is the weak half of the pair`,
    )

    await refuses('characters:claim refused a reserved hero to a seat', () =>
      client.mutation('characters:claim', {
        code,
        playerId: seatA.playerId,
        characterId: goliath.characterId,
      }),
    )
    // Both refusals on the mutation itself, and both are the DM being told their click
    // would not do what they think rather than a secret being kept — which is why these
    // messages are helpful where `claim`'s is deliberately indistinguishable from "no such
    // character".
    await refuses('characters:setReserved refused a monster', () =>
      client.mutation('characters:setReserved', {
        code,
        dmCode,
        characterId: wolf.characterId,
        reserved: true,
      }),
    )
    await refuses('characters:setReserved refused a hero a seat is already playing', () =>
      client.mutation('characters:setReserved', {
        code,
        dmCode,
        characterId: bramble.characterId,
        reserved: true,
      }),
    )
    await refuses('characters:setReserved refused a caller without the DM code', () =>
      client.mutation('characters:setReserved', {
        code,
        dmCode: 'not-the-dm-code',
        characterId: goliath.characterId,
        reserved: false,
      }),
    )

    // THE HANDOVER, which is one of the two routes out of the reserved state the design
    // names and the only one that is a single click. The flag is cleared in the same
    // transaction as the claim, so there is no window in which the roster is refusing to
    // name a character a seat is holding.
    await client.mutation('characters:assign', {
      code,
      dmCode,
      playerId: seatB.playerId,
      characterId: goliath.characterId,
    })
    // Reserving is over: `assign` cleared the flag, and `setReserved` refuses a character
    // a seat is holding — so leaving this on the cleanup list would make a run that went
    // perfectly report a failed cleanup step.
    reservedCharacters.length = 0

    const listAfterAssign = await client.query('characters:list', { code })
    const rosterAfterAssign = await client.query('players:list', { code })
    const assignedRow = rosterAfterAssign.find((row) => row._id === seatB.playerId) ?? null
    check(
      'characters:assign cleared the reservation, and the roster named the hero again',
      listAfterAssign.some((row) => row._id === goliath.characterId) &&
        assignedRow &&
        assignedRow.characterId === goliath.characterId &&
        assignedRow.characterName === RESERVED_NAME,
      assignedRow
        ? `${listAfterAssign.length} player-visible rows, seat B holding ${JSON.stringify(assignedRow.characterName)}`
        : 'no roster row for seat B',
    )

    // 26. THE THIRD NEW STORED FIELD, AND THE ONE FACT ON THE PAYLOAD THAT IS DERIVED.
    //
    // `board.tokens` now carries two arrays, and they are not redundant: `grantedPlayerIds`
    // is exactly what `tokens.controllerIds` holds, and `controllerIds` is the *rule* —
    // the grants union the seat playing the token's character. The dialog edits the first
    // and `canMove` reads the second, and the difference between the two arrays is the
    // derived half, which is why both travel rather than the browser subtracting one back
    // out of the other.
    //
    // ⚠️ **The asymmetry is the design and is checked on its own.** A claim holder appears
    // in `controllerIds` and must never appear in `grantedPlayerIds`: a claim lives on the
    // seat (ADR 0002, seat → character and never the reverse), so writing it into the token
    // as well would make two documents authoritative for one relation — and the bug that
    // follows is a hero reassigned to a new player whose old token still lists the seat
    // that left.
    await client.mutation('characters:claim', {
      code,
      playerId: seatA.playerId,
      characterId: human.characterId,
    })
    const heroToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Aldis on the Causeway',
      layer: 'player',
      sizeSquares: 1,
      tint: '#16a085',
      characterId: human.characterId,
      x: 700,
      y: 1100,
    })
    created.push(heroToken.tokenId)

    const tokensOf = async (tokenId) =>
      (await client.query('board:tokens', { code, dmCode })).find(
        (token) => token._id === tokenId,
      ) ?? null

    const claimedOnly = await tokensOf(heroToken.tokenId)
    check(
      'the claim holder arrived in controllerIds and in no grant',
      claimedOnly &&
        claimedOnly.controllerIds.length === 1 &&
        claimedOnly.controllerIds[0] === seatA.playerId &&
        claimedOnly.grantedPlayerIds.length === 0,
      claimedOnly
        ? `effective ${JSON.stringify(claimedOnly.controllerIds)} against granted ${JSON.stringify(claimedOnly.grantedPlayerIds)}`
        : 'no token row came back',
    )

    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      playerIds: [seatB.playerId],
    })
    grantedTokens.push(heroToken.tokenId)
    const claimedAndGranted = await tokensOf(heroToken.tokenId)
    check(
      'a grant came back verbatim in grantedPlayerIds and unioned into controllerIds',
      claimedAndGranted &&
        claimedAndGranted.grantedPlayerIds.length === 1 &&
        claimedAndGranted.grantedPlayerIds[0] === seatB.playerId &&
        claimedAndGranted.controllerIds.length === 2 &&
        claimedAndGranted.controllerIds.includes(seatA.playerId) &&
        claimedAndGranted.controllerIds.includes(seatB.playerId),
      claimedAndGranted
        ? `effective ${JSON.stringify(claimedAndGranted.controllerIds)} against granted ${JSON.stringify(claimedAndGranted.grantedPlayerIds)}`
        : 'no token row came back',
    )

    // Revoking everything is expressible because the list is absolute rather than a pair
    // of add/remove calls — and it is stored as an empty array rather than patched away to
    // `undefined`, which is one shape of write and therefore one fewer thing for a
    // field-by-field comparison to call `present on one side only`.
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      playerIds: [],
    })
    const revoked = await tokensOf(heroToken.tokenId)
    check(
      'revoking to an empty list came back as an empty list, with the claim untouched',
      revoked &&
        revoked.grantedPlayerIds.length === 0 &&
        revoked.controllerIds.length === 1 &&
        revoked.controllerIds[0] === seatA.playerId,
      revoked
        ? `effective ${JSON.stringify(revoked.controllerIds)} against granted ${JSON.stringify(revoked.grantedPlayerIds)}`
        : 'no token row came back',
    )

    // A grant on a token with no character behind it — the DM handing the party a cart to
    // push — where the effective set and the stored one are the same array. The duplicate
    // is deliberate: a double-click is the ordinary way for the dialog to send one, and a
    // seat listed twice would render as one player with two checkboxes.
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: open.tokenId,
      playerIds: [seatA.playerId, seatA.playerId, seatB.playerId],
    })
    grantedTokens.push(open.tokenId)
    const unattached = await tokensOf(open.tokenId)
    check(
      'a duplicated grant was squeezed out, and an unattached token derives nothing',
      unattached &&
        unattached.grantedPlayerIds.length === 2 &&
        unattached.grantedPlayerIds.includes(seatA.playerId) &&
        unattached.grantedPlayerIds.includes(seatB.playerId) &&
        JSON.stringify([...unattached.controllerIds].sort()) ===
          JSON.stringify([...unattached.grantedPlayerIds].sort()),
      unattached
        ? `effective ${JSON.stringify(unattached.controllerIds)} against granted ${JSON.stringify(unattached.grantedPlayerIds)}`
        : 'no token row came back',
    )

    await refuses('board:setControllers refused a well-formed wrong DM code', () =>
      client.mutation('board:setControllers', {
        code,
        dmCode: 'not-the-dm-code',
        tokenId: heroToken.tokenId,
        playerIds: [seatA.playerId],
      }),
    )
    // ⚠️ **THIS IS CONVEX'S OWN ARGUMENT VALIDATION EARNING ITS PLACE AGAIN.** A document
    // id is a string, and a `characters` id is a perfectly ordinary one — so it survives
    // everything convex-test applies and is refused at the function boundary here, because
    // `v.id('players')` checks the table the id actually belongs to. Nothing in the handler
    // asks, and nothing would: `getSeatInGame` would look it up as a seat and find none,
    // which is the right refusal for the wrong reason and only by luck.
    await refuses('board:setControllers refused an id from the wrong table', () =>
      client.mutation('board:setControllers', {
        code,
        dmCode,
        tokenId: heroToken.tokenId,
        playerIds: [pc.characterId],
      }),
    )

    // 27. CONTROL GRANTS SIGHT, AND ONLY TO THE GRANTED SEAT.
    //
    // The acceptance test for the grant, and the same shape as sections 10 and 20: the
    // creature's coin goes on the PLAYER layer, because that is the case that matters —
    // both seats can see the thing standing there, and exactly one of them may read what
    // it is. A DM-layer creature is the easy case and is section 28.
    //
    // ⚠️ **A grant is a second door onto this milestone's headline secret**, opened by the
    // DM deliberately: control carries the creature's sheet and its exact hit points to
    // the granted seat, because a granted pet that could not take damage would be a sheet
    // to look at. What must not move is anybody else's payload, and that is what the scan
    // below is for — with a positive control, because without one it passes on a
    // deployment that sent nobody anything.
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: grantedCreature.characterId,
      currentHp: GRANTED_CURRENT_HP,
    })
    const grantedToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Deliberately not the character's name. What is written on a coin is public by
      // design, so reusing the name would make the scan below unable to tell a leak from
      // the thing it is meant to allow — the same care sections 10 and 20 take.
      name: 'A Dog on a Lead',
      layer: 'player',
      sizeSquares: 1,
      tint: '#9b59b6',
      characterId: grantedCreature.characterId,
      x: 1900,
      y: 1100,
    })
    created.push(grantedToken.tokenId)
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: grantedToken.tokenId,
      playerIds: [seatA.playerId],
    })
    grantedTokens.push(grantedToken.tokenId)

    const sheetFor = (playerId) =>
      client.query('characters:sheet', {
        code,
        playerId,
        characterId: grantedCreature.characterId,
      })
    const vitalsFor = (playerId) => client.query('characters:vitals', { code, playerId })

    const seenByA = await sheetFor(seatA.playerId)
    const vitalsForA = await vitalsFor(seatA.playerId)
    const rowForA = vitalsForA.find((row) => row.characterId === grantedCreature.characterId)
    check(
      'the granted seat got the creature’s sheet and its exact hit points',
      seenByA &&
        seenByA.name === GRANTED_NAME &&
        seenByA.sheet.maxHp === GRANTED_MAX_HP &&
        rowForA &&
        rowForA.kind === 'exact' &&
        rowForA.current === GRANTED_CURRENT_HP &&
        rowForA.max === GRANTED_MAX_HP,
      seenByA && rowForA
        ? `positive control — without it the scan below passes on a deployment that sent nobody anything; ${rowForA.current}/${rowForA.max}`
        : `sheet ${JSON.stringify(seenByA)}, vitals ${JSON.stringify(rowForA)}`,
    )

    const seenByB = await sheetFor(seatB.playerId)
    const vitalsForB = await vitalsFor(seatB.playerId)
    const rowForB = vitalsForB.find((row) => row.characterId === grantedCreature.characterId)
    check(
      'the ungranted seat got null and a band, with no hit-point key on the row',
      seenByB === null &&
        rowForB &&
        rowForB.kind === 'band' &&
        !('current' in rowForB) &&
        !('max' in rowForB),
      rowForB
        ? `sheet ${JSON.stringify(seenByB)}, keys: ${Object.keys(rowForB).sort().join(', ')}`
        : 'no row for the creature',
    )

    // AND B'S WHOLE PAYLOAD, scanned twice over for the reason section 10 gives:
    // `holdsNumber` walks every number in the decoded payload, which is exact, and the
    // substring scan over the redacted form catches one that arrived as text in a field
    // nobody thought to look at. `characters:list` is in the scan because it takes no
    // `playerId` and therefore cannot answer a grant at all — a creature that turned up in
    // it would be one every client at the table had already been sent.
    const grantScannable = [vitalsForB, await client.query('characters:list', { code }), seenByB]
    const grantSerialised = JSON.stringify(redactOpaque(grantScannable))
    const grantNeedles = [GRANTED_NAME, GRANTED_NOTES]
    const grantLeaked = grantNeedles.filter((needle) => grantSerialised.includes(needle))
    check(
      'nothing about the granted creature reached the seat it was not granted to',
      grantLeaked.length === 0 &&
        !grantSerialised.includes(String(GRANTED_MAX_HP)) &&
        !grantSerialised.includes(String(GRANTED_CURRENT_HP)) &&
        !holdsNumber(grantScannable, GRANTED_MAX_HP) &&
        !holdsNumber(grantScannable, GRANTED_CURRENT_HP),
      grantLeaked.length > 0
        ? `leaked ${JSON.stringify(grantLeaked)}`
        : `${GRANTED_CURRENT_HP}/${GRANTED_MAX_HP} scanned as text and as numbers over ${grantScannable.length} payloads`,
    )

    // 28. A GRANT ON A DM-LAYER TOKEN REVEALS NOTHING, AND THE COIN IS WHAT DECIDES.
    //
    // `controlledCharacterIds` is built from `visibleTokens`, so a grant written onto a
    // hidden coin contributes nothing to a player's set — sight of the token is the
    // precondition for sight of the sheet, structurally rather than by anybody remembering
    // to test the layer. The write itself is deliberately allowed: preparing an ambush and
    // granting it before revealing it is a reasonable order to work in.
    //
    // ⚠️ **Two tokens rather than one moved between layers, because there is no mutation
    // that re-layers a token.** `board.addToken` takes `layer` and `board.moveToken` takes
    // coordinates; nothing else writes that field. A second coin on the player layer is the
    // same input to the composition being asserted — the creature becomes visible, so the
    // grant starts to mean something — and it is what the API actually allows, so it is
    // what is done rather than pretending a re-layer exists.
    const hiddenToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Shadow Under the Arch',
      layer: 'dm',
      sizeSquares: 2,
      tint: '#2c3e50',
      characterId: ambush.characterId,
      x: 1900,
      y: 1500,
    })
    created.push(hiddenToken.tokenId)
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: hiddenToken.tokenId,
      playerIds: [seatA.playerId],
    })
    grantedTokens.push(hiddenToken.tokenId)

    const ambushAsA = () =>
      client.query('characters:sheet', {
        code,
        playerId: seatA.playerId,
        characterId: ambush.characterId,
      })
    const hiddenSheet = await ambushAsA()
    const hiddenVitals = await vitalsFor(seatA.playerId)
    check(
      'a grant on a DM-layer coin gave the granted seat nothing — not a sheet, not a row',
      hiddenSheet === null &&
        // Not merely a band: an unseen creature contributes no row at all, because the
        // *length* of that array is itself a count of how many monsters are waiting.
        !hiddenVitals.some((row) => row.characterId === ambush.characterId),
      `sheet ${JSON.stringify(hiddenSheet)}, ${hiddenVitals.length} vitals rows`,
    )
    // The DM's own view of the same token, so the check above is not passing because the
    // grant was never written.
    const hiddenAsDm = await tokensOf(hiddenToken.tokenId)
    check(
      'the grant was really there — the DM sees it on the hidden coin',
      hiddenAsDm &&
        hiddenAsDm.layer === 'dm' &&
        hiddenAsDm.grantedPlayerIds.length === 1 &&
        hiddenAsDm.grantedPlayerIds[0] === seatA.playerId,
      hiddenAsDm
        ? `positive control — granted ${JSON.stringify(hiddenAsDm.grantedPlayerIds)} on the ${hiddenAsDm.layer} layer`
        : 'no token row came back',
    )

    const shownToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Something Under the Arch',
      layer: 'player',
      sizeSquares: 2,
      tint: '#34495e',
      characterId: ambush.characterId,
      x: 1900,
      y: 1900,
    })
    created.push(shownToken.tokenId)
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: shownToken.tokenId,
      playerIds: [seatA.playerId],
    })
    grantedTokens.push(shownToken.tokenId)

    const revealedSheet = await ambushAsA()
    const revealedVitals = await vitalsFor(seatA.playerId)
    const revealedRow = revealedVitals.find((row) => row.characterId === ambush.characterId)
    check(
      'the same grant on a player-layer coin brought the sheet and the numbers with it',
      revealedSheet &&
        revealedSheet.name === AMBUSH_NAME &&
        revealedRow &&
        revealedRow.kind === 'exact' &&
        revealedRow.max === AMBUSH_MAX_HP,
      revealedSheet && revealedRow
        ? `${revealedRow.current}/${revealedRow.max} — the grant did not change, the coin did`
        : `sheet ${JSON.stringify(revealedSheet)}, vitals ${JSON.stringify(revealedRow)}`,
    )
  } catch (error) {
    const data = error && error.data ? ` ${JSON.stringify(error.data)}` : ''
    record('the run completed without an unexpected error', false, `${error.message ?? error}${data}`)
  } finally {
    // Best effort, and each step is guarded on its own rather than the batch: an
    // assertion that fails halfway leaves the rest to be cleaned up, and a run that
    // abandoned two forty-entry sheets every time it failed would be a slow leak
    // into the same budget the upload limits exist to protect. There is no API for
    // deleting a game — that is Milestone 7's admin view — so the scene, its blob,
    // the tokens and the characters are what can go.
    if (code && dmCode) {
      // Grants and reservations first, and on their own rather than left to disappear with
      // the token or the character they hang off. Both are state *about somebody else's
      // screen*, both are undoable through an ordinary mutation, and each `quietly` step
      // is guarded separately — so a run that fails between reserving a hero and handing
      // it over does not depend on the removal below succeeding to leave the game tidy.
      for (const tokenId of grantedTokens) {
        await quietly(() =>
          client.mutation('board:setControllers', { code, dmCode, tokenId, playerIds: [] }),
        )
      }
      for (const characterId of reservedCharacters) {
        await quietly(() =>
          client.mutation('characters:setReserved', {
            code,
            dmCode,
            characterId,
            reserved: false,
          }),
        )
      }
      for (const tokenId of created) {
        await quietly(() => client.mutation('board:removeToken', { code, dmCode, tokenId }))
      }
      for (const characterId of createdCharacters) {
        await quietly(() => client.mutation('characters:remove', { code, dmCode, characterId }))
      }
      if (sceneId) await quietly(() => client.mutation('scenes:remove', { code, dmCode, sceneId }))
      // The seats go too, which they did not before: `players.leave` has always existed
      // and the note here used to say otherwise. It is also the mutation that revokes a
      // departing seat's grants, so this sweep is a second, blunter exercise of
      // `revokeControlForSeat` on whatever the loop above did not reach.
      for (const playerId of seats) {
        await quietly(() => client.mutation('players:leave', { code, playerId }))
      }
      console.log(
        `\n  cleaned up the scene, ${created.length} tokens, ${createdCharacters.length} characters and ${seats.length} seats`,
      )
      console.log(`  the game itself remains: ${code} (no delete API before Milestone 7)`)
    } else {
      console.log('\n  nothing to clean up: the game was never created')
    }
  }

  const passed = results.length - failures
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${passed}/${results.length} checks passed\n`)
  if (failures > 0) {
    for (const result of results.filter((entry) => !entry.ok)) {
      console.log(`  failed: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
    }
    console.log('')
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`\nFAIL — ${error.message ?? error}\n`)
  process.exit(1)
})
