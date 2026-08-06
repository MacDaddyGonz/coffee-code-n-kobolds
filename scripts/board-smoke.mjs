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
// Seats, sheets and control add three more optional stored fields — `NpcSheet.group`,
// `characters.reserved` and `tokens.controllerIds` — and one of them, `group`, goes
// through the same field-by-field rebuild the two above did. So sections 23 to 28 are
// written in the same pairs, and the last three of them are about a second thing only a
// real deployment settles: a **grant** is a door the DM opens onto this application's
// headline secret, so what has to be checked is not that it works but that it opens for
// exactly one seat. Every one of those scans has a positive control beside it, because a
// scan with nothing to find passes on a deployment that sent nobody anything.
//
// Getting to the table adds no stored field at all, and still lands squarely here, because
// what it adds is **four ways to edit a coin that already exists** and one query a browser
// may call holding nothing whatsoever. Section 29 is those four writes, and each of them is
// something the local suite cannot be asked:
//
//   - `setArt` **destroys a blob**, and convex-test's file storage is an in-memory stub
//     keyed on the content hash — so the same seventy-byte PNG uploaded twice is *one*
//     entry there, and a swap that deleted the wrong blob, or the right one twice, or
//     neither, all look identical. There are no signed URLs to stop resolving either, and
//     "that bearer link is dead now" is the whole claim.
//   - `updateToken` is the **Milestone 1 bug on a third field**: a lone surrogate in a
//     token's name is refused by Convex's own *argument* validation, before any handler
//     runs, which is precisely the mechanism this script exists to reach.
//   - `setCharacter` clears a binding with `null`, and `undefined` is not a Convex value —
//     so whether *none* comes back as a present key or as no key is a real round trip's
//     question. Beside it, `controllerIds` changes with nothing written to the token.
//   - `games:list` reads **every game in the deployment**. Locally that is a two-row
//     fixture; here it is seventy-odd real games, and the row being looked for was inserted
//     by this run.
//
// It also **removes a workaround rather than adding a section**. Section 28 used to add a
// second coin because no mutation re-layered one; `board.setLayer` exists now, so one coin
// is driven dm → player → dm and ADR 0009's "asserted in both places" is the same round
// trip in both places for the first time.
//
// ⚠️ **Rolls and the feed store the deepest nested value this application has, and section
// 30 is that.** A feed row is a six-member `v.union` of objects beside an object holding a
// `v.array(v.object(…))`, with two `number | null` unions inside that — five levels of
// validator in one write, where everything before it was an object of scalars in an optional
// field. `v.union` next to `v.array(v.object(…))` is exactly the shape convex-test waves
// through and a deployment has an opinion about. It also inverts the absence pair the
// sections above are built on: `roll` and `subject.text` are **present keys holding null**
// rather than absent ones, because a brand-new table got the stronger spelling — so the
// checks that assert a key is *there* and the ones that assert a key is *gone* are now each
// other's control.
//
// It is also the first section whose writes cannot all be undone. See the note in `finally`:
// a line naming a character leaves with that character, and a dice-tray line names a seat,
// so it stays until `npm run prune-games` sweeps it.
//
// ⚠️ **The DM's tools are the widest set of things convex-test structurally cannot judge that
// this script has been asked about at once, and sections 31 to 35 are them.** Five distinct
// shapes, and none of them is logic the suite already covers:
//
//   - **A three-member union, as an argument validator *and* as a projected field.** The
//     stored union is one member wider than the canonical one while the GM layer's rename
//     from `dm` to `gm` is in flight, so `board:addToken`'s narrow `tokenLayerValidator` is
//     the *only* thing stopping a legacy value being created from here forward. Whether
//     `'background'` and `'gm'` round-trip as themselves, and whether `'dm'` is refused at
//     the function boundary, are three facts about Convex's own value validation and nothing
//     else — the local suite reaches the schema directly and so cannot be asked any of them.
//   - **Four fresh float64s per fog rectangle, through a table that is new.** Floats through
//     a real deployment are this script's oldest speciality, and the interesting ones here
//     are **negative** extents: three quarters of all rubber-band drags produce one, and
//     `normaliseFogRect` has to have converted it *before* the insert. A row stored
//     unnormalised is fog that is drawn on every screen and hides nothing whatever, which is
//     the worst failure this feature has and the one a DM would never think to check for.
//   - **A new optional field on a *populated* table, twice over.** `games.openImageId` and
//     `games.activeTrackId` are pointers on the one document every client in a game
//     subscribes to, and "nothing is open" is spelled by the key's **absence** — a Convex
//     patch of `undefined`. So both come in the pairs every trap in this file comes in: shown
//     then hidden, selected then cleared, with `firstDifference` naming a `null` that should
//     have been an absent key. `games.revealedAt` is the third, and it is readable only
//     through `predatesReveal` on a feed row — section 30 owns the `board:setLayer` half of
//     that claim, so section 32 asserts the **fog** half and the true/false pair in one
//     payload rather than repeating it.
//   - **Two new `v.id('_storage')` tables, and `files.discard`'s refusals over them.** Every
//     table holding a storage id owes that mutation a predicate, and forgetting one is silent
//     until somebody's upload deletes somebody else's file. `storageGuard.test.ts` pins that
//     the predicate is *imported*; only a deployment can say that the refusal fires, that a
//     real blob is really deleted afterwards, and that the bearer URL captured beforehand has
//     stopped resolving.
//   - **An audio blob, which is the first non-image upload this application has ever made.**
//     There is no lossless-enough transcode a browser can do to audio, so the downscaler that
//     makes an oversized map impossible in practice has no equivalent — `blob.size >
//     MAX_MUSIC_BYTES` on the server is the *whole* of the enforcement, and convex-test's
//     file storage is an in-memory stub that never had a byte count to check. So the
//     over-limit refusal below POSTs ten megabytes and one byte of real bytes at a real
//     upload URL, because that is the only way to find out that the check is there.
//
// ⚠️ **The tokens milestone adds three things whose whole content is a round trip, and
// sections 36 to 38 are them.** None is new logic the suite has not covered; all three are
// questions convex-test is structurally unable to be asked.
//
//   - **A placement that is asserted by what did *not* change.** `board.placeOnScene`
//     returns `null` whether it wrote or returned early, so idempotence has no return value
//     to test: the only way to ask is to settle a coin at a known point, press the button
//     again and read the coordinate back off the wire. The upsert formulation — the bug the
//     early return exists to prevent — puts the coin back in the middle of the map, which is
//     a coordinate and therefore something only a real placement row can report.
//   - **A seventeen-member `v.union` as an argument validator and inside a `returns:`
//     one.** `board.setMarkers` takes `v.array(tokenMarkerValidator)` and `board.markers`
//     projects it, so the vocabulary crosses Convex's own value validation in both
//     directions — and the refusal of a word the union has never heard of comes from the
//     **function boundary**, before any handler runs, which is precisely the mechanism this
//     script exists to reach and the one the local suite cannot reproduce. Beside it, an
//     empty array **deletes the row** rather than storing `[]`, so the assertion is the
//     absence of a row in a real payload rather than the emptiness of one.
//   - **N coins and N sheets in one transaction, and a blob four of them share.**
//     `copyTokenRow` **spreads** its two optional fields rather than writing
//     `imageId: undefined`, and that line exists for this script: `undefined` is not a
//     Convex value, so naming a key and handing it that is a different write from omitting
//     the key, it passes the whole local suite, and it is exactly what the field-by-field
//     comparison below reports as `present on one side only`. The delete is the sharper
//     half — convex-test's file storage is an in-memory stub keyed on the content hash, so
//     five copies of one seventy-byte PNG are *one* entry there and a delete of the wrong
//     blob, the right blob twice, or neither all look identical. `and the other four still
//     have their art` is a sentence only a bearer URL that still returns bytes can settle.
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
 * Seven catalogue entries, copied out of `convex/lib/rules.ts` word for word.
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
  // ⚠️ **Re-copied when `FEATS` was rebuilt from the 2024 SRD.** These two used to be
  // `second-wind` and `action-surge`, which were never feats at all — they are class
  // features and left the catalogue with six others. A stale copy would fail this
  // script over a change that was correct, which is the trap the greatclub comment
  // below already records.
  //
  // ⚠️ **One shape of round trip went with them and is worth naming rather than
  // quietly losing: a `level: null` entry that carries a roll and NO to-hit.**
  // `second-wind` was that shape, and there is no replacement in `FEATS`, because not
  // one of the ten SRD feats reachable at levels 1–5 rolls dice — every one of them
  // grants a proficiency, a bonus, or permission. `npc-fire-breath` is the same shape
  // and could be added here if that coverage is ever wanted back; it is left out
  // because this fixture is a sheet somebody could plausibly have, and a hero does not
  // have Fire Breath.
  alert: {
    key: 'alert',
    name: 'Alert',
    text: 'Origin feat. You add your proficiency bonus to initiative, and once the order is rolled you may swap your place in it with a willing ally\'s — neither of you being incapacitated at the time.',
    roll: null,
    level: null,
    category: 'passive',
  },
  savageAttacker: {
    key: 'savage-attacker',
    name: 'Savage Attacker',
    text: 'Origin feat. Once a turn, when you hit with a weapon, reroll the damage dice and keep whichever total you prefer.',
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
 *
 * ⚠️ **THE SEVENTH OUTING OF THE FIELD-BY-FIELD REBUILD TRAP, AND ITS LARGEST SURFACE.**
 * The 2024 conversion adds five optional fields to this sheet, two to an entry, two to a
 * creature and two to a preset — and CLAUDE.md records that **only `npm run test:smoke`
 * has ever caught this trap**, four times over. So the pairing above is repeated for every
 * one of them: this sheet carries all five, `BARE_PC_SHEET` below carries none, and
 * `feat-runeblade` carries a mastery and a use count while `feat-aether-bolt` carries
 * neither. The presence half fails as `present on one side only`; the absence half is
 * asserted on the KEY, because a deployment that materialised an empty array for every
 * missing list would satisfy the first perfectly.
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
  // THE 2024 FIVE. `spellcastingAbility` is the only one of them the sheet *derives*
  // anything from — the spell save DC and the spell attack bonus are pure functions of it
  // and neither is stored, which is the half of the acceptance criterion a round trip can
  // check: if either turned up on the way back, something is storing it.
  spellcastingAbility: 'cha',
  // Three lists rather than one, so a rebuild that named two of the three fails on the
  // third. Non-ASCII in one of them on purpose — a damage type is free text and the SRD's
  // own phrases run long.
  resistances: ['fire', 'cold'],
  immunities: ['poison'],
  vulnerabilities: ['bludgeoning from nonmagical attacks — 🜁'],
  senses: 'Darkvision 60 ft., Blindsight 10 ft.',
  feats: [
    entryFrom(CATALOGUE.alert, 'feat-alert'),
    entryFrom(CATALOGUE.savageAttacker, 'feat-savage-attacker'),
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
      // The mastery and the use count, on the one entry that already carries every other
      // new field. `graze` rather than `push`, `slow` or `topple` — the three the
      // movement-detriment exclusion names are asserted by `lib/mastery.test.ts`, and what
      // this round trip is about is a *literal inside a union inside an optional field*
      // surviving a real deployment.
      mastery: 'graze',
      // The 2024 normal case, spelled out: three uses, back on a long rest, one of them
      // handed back by a short one. It is a nested object inside an optional field inside
      // an array of objects — one level deeper than anything on this sheet before it.
      uses: { max: 3, recharge: 'long', regainOnShortRest: 1 },
    },
    // The hand-written action: one roll, no to-hit, and it simply goes off.
    //
    // ⚠️ **A use count and NO mastery**, which is the pair that stops the two fields being
    // asserted as one. Only a weapon carries a mastery — `entriesProblem` refuses one
    // anywhere else — but any category may be limited, so an entry with `uses` and without
    // `mastery` is the shape that proves the two travel independently. And its `uses` has
    // no `regainOnShortRest`, so absence is checked one level down as well.
    {
      id: 'feat-verse-of-mending',
      name: 'Verse of Mending',
      text: 'A sung stanza that closes a wound on an ally within thirty feet. Nothing is aimed and nothing is resisted.',
      roll: '1d8+CHA',
      level: null,
      catalogueKey: null,
      category: 'action',
      uses: { max: 2, recharge: 'short' },
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
 * THE NEGATIVE HALF OF THE PAIR: the same hero shaped exactly as every `pc` sheet in every
 * existing game is — five fields poorer, and none of them spelled at all.
 *
 * ⚠️ **Built by naming what it keeps rather than by deleting from `PC_SHEET`**, and that is
 * the whole reason it is a separate literal. A `const { senses, ...rest } = PC_SHEET` would
 * drop the five *this list knows about today*, so a sixth field added to `PC_SHEET` next
 * milestone would silently ride into the negative fixture and the absence check would start
 * asserting nothing. Written out, a sixth field has to be *chosen* into this one.
 *
 * Its feats are the two that carry neither `mastery` nor `uses`, for the same reason: a
 * legacy sheet is legacy all the way down.
 */
const BARE_PC_NAME = 'Marrow Quillfeather'
const BARE_PC_SHEET = {
  kind: 'pc',
  level: 3,
  className: 'Hedge Warden',
  abilities: { str: 11, dex: 16, con: 13, int: 14, wis: 15, cha: 9 },
  saveProficiencies: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
  armourClass: 15,
  maxHp: 22,
  hitDice: { count: 3, faces: 8 },
  feats: PC_SHEET.feats.filter((each) =>
    ['feat-aether-bolt', 'feat-stone-stance'].includes(each.id),
  ),
  spells: [],
}

/** Every field the 2024 conversion added to a `pc` sheet, for the absence half of the pair. */
const NEW_PC_SHEET_FIELDS = [
  'spellcastingAbility',
  'resistances',
  'immunities',
  'vulnerabilities',
  'senses',
]

/** The same for an entry, and for a creature. */
const NEW_ENTRY_FIELDS = ['mastery', 'uses']
const NEW_NPC_SHEET_FIELDS = ['abilities', 'saveProficiencies']
/** And for a preset, whose two are the species rename and the sixth pick. */
const NEW_PRESET_FIELDS = ['species', 'lineageKey']

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
  // ⚠️ **AN ADDITION AND NOT A REPLACEMENT.** A 2024 stat block prints six scores *and* an
  // initiative modifier, an attack bonus and a passive perception, and this creature carries
  // all of them at once on purpose — the round trip below is what would notice if
  // `normaliseSheet` had been "simplified" to derive the four from the six. `initiativeBonus`
  // is negative and would be +1 if it were derived from this Dexterity, which is what makes
  // that a check rather than a coincidence.
  abilities: { str: 19, dex: 12, con: 17, int: 6, wis: 11, cha: 8 },
  // Mixed on purpose, so a run of six booleans cannot come back collapsed into one — the
  // same reason `saveProficiencies` on the hero above is mixed.
  saveProficiencies: { str: true, dex: false, con: true, int: false, wis: true, cha: false },
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
 * ⚠️ **`+ ELF_TRAIT_ENTRIES` at each use, and it used to be `+ 1`.** That one was the single
 * trait a Milestone 4 race contributed — a Halfling's Lucky, an Elf's Fey Ancestry — and a
 * 2024 species has up to five. The Elf has five, so the sum is the library's own feat list
 * plus every trait the species appends, which is `applySpecies` being asserted rather than
 * assumed. If a species ever grants a feat as well as its traits this stops being one number.
 */
const ELF_TRAIT_ENTRIES = 5
const ROGUE_SKILLS = {
  athletics: false,
  acrobatics: true,
  sleightOfHand: true,
  stealth: true,
  arcana: false,
  investigation: true,
  history: false,
  nature: false,
  religion: false,
  animalHandling: false,
  insight: false,
  perception: true,
  medicine: false,
  survival: false,
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

/**
 * The species that move a number, and what they move.
 *
 * ⚠️ **`ELF_DEX_BONUS` is gone, and its absence is the sharpest single statement of the 2024
 * conversion.** No species grants an ability score increase any more — the spread comes from a
 * *background*, which stays excluded and whose numbers are absorbed into the premade sheet. The
 * assertion that used to read `base.dex + 2` now reads `base.dex`, which looks like a weaker
 * test and is the stronger one: it says the library's number reaches the sheet **untouched**,
 * which is what "allocated without considering species" became true *by construction* rather
 * than by discipline.
 *
 * The Goliath moved 45 (35 + a 10 bonus) and now moves 35 (an absolute base). Same species,
 * same reason it exists, different arithmetic — `speedBonus` became `baseSpeed` so that a
 * number the SRD prints is stored rather than computed.
 */
const DWARF_HP_PER_LEVEL = 1
const GOLIATH_SPEED = 35

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
 * MILESTONE 8'S FIXTURES. No new stored field, and a new kind of exposure anyway.
 *
 * The DM's Tokens tab is four mutations that edit a coin after it exists, and the two
 * constants below are both about the one of them that takes a string.
 *
 * `MAX_TOKEN_NAME_LENGTH` is copied by hand out of `convex/lib/codes.ts`, where it is
 * `MAX_CHARACTER_NAME_LENGTH` — a token borrows the character-name limit rather than
 * inventing a fourth one, which is `requireTokenAppearance`'s stated position. Copied for
 * the reason every other number in this file is copied: a fixture derived from the code
 * under test agrees with a mangled limit exactly as readily as with a correct one.
 *
 * ⚠️ **`EDITED_TOKEN_NAME` is exactly forty UTF-16 code units and thirty-five code
 * points, and the gap between those two numbers is the whole point.** `requireText`
 * measures `value.length`, which counts code units, deliberately, so that it agrees with
 * the `maxLength` the browser applies — so a name at the limit made of astral characters
 * is a name sitting on the boundary in one counting and well inside it in the other. Five
 * surrogate pairs is where a server that measured code points would accept fifty units, and
 * where a client that cut to length with `slice` would leave the lone surrogate this whole
 * script exists for. The length is asserted at the check rather than trusted, because an
 * innocent edit to the string is exactly how a boundary test stops being one.
 *
 * The tint is uppercase on purpose. `TINT_PATTERN` is case-insensitive and nothing
 * normalises the case, so `#A1B2C3` has to come back as `#A1B2C3` — a deployment or a
 * writer that helpfully lowercased it would be changing a value the DM chose, and
 * `firstDifference` names that rather than shrugging at it.
 */
const MAX_TOKEN_NAME_LENGTH = 40
const EDITED_TOKEN_NAME = 'Wyrmshadow 🐉🐉 of the Ninth Arch 🎲🐺🔥'
const EDITED_TOKEN_TINT = '#A1B2C3'
/** The top of `isUsableTokenSize`'s range, so the round trip is over a bound rather than a 2. */
const EDITED_TOKEN_SIZE = 8

/**
 * MILESTONE 9'S FIXTURES. No new field on a character, and **the deepest nested value this
 * application has ever asked a real deployment to store.**
 *
 * A feed row carries a `subject` that is a **six-member `v.union` of objects** and a `roll`
 * that is an object holding a `v.array(v.object(...))` — so one write crosses a union, an
 * object, an array of objects, two nested unions of `number | null` and a three-member
 * literal union, all in one document. Every other stored shape in this script is one level
 * shallower than that, and `v.union` beside `v.array(v.object(…))` is exactly where a shape
 * convex-test waves through is refused for real.
 *
 * ⚠️ **The absence half is the other reason this belongs here rather than in the suite.** A
 * passive and an alt-clicked description both store `roll: null`, and the three non-`text`
 * parts of an entry store `subject.text: null` — and `null` is a *value* on this table
 * rather than an absent key, deliberately, because `writeFeedRow` requires every field of
 * the caller and spells the two that can be empty as `null`. Whether a real deployment
 * hands those back as present keys or drops them is a question only a round trip settles,
 * and it is the difference between a client reading `row.roll === null` and one reading
 * `row.roll === undefined` for ever afterwards. `firstDifference` reports
 * `present on one side only`; a value check cannot tell the two apart.
 *
 * The hero below exists to hold **one entry per distinct expression shape**, so that the
 * eight shapes the three corpora actually contain each cross the wire once. Its ability
 * scores are chosen to make every resolved modifier a *different* number — STR +4, DEX +1,
 * CON +2, INT +0, WIS +3, CHA +5 and PROF +4 at level 9 — because a run of identical
 * modifiers is a run in which a token resolved to the wrong one still adds up.
 */
const ROLL_HERO_NAME = 'Thessaly Vane of the Ninth Arch 🎲'
const ROLL_HERO_LEVEL = 9
/**
 * Worked out by hand, and the working is the point — every modifier below is a number
 * nobody sends, resolved server-side out of the stored sheet at the moment of rolling.
 *
 *   18 → +4 (STR)   12 → +1 (DEX)   14 → +2 (CON)
 *   10 → +0 (INT)   16 → +3 (WIS)   20 → +5 (CHA)
 *   level 9 → PROF +4 (2 plus one per four levels above the first)
 *
 * INT is 10 on purpose: it makes the Arcana roll below a bonus of exactly zero, which is
 * `toHitFromBonus`'s one special case — a bare `1d20` rather than the `1d20+0` the grammar
 * would have accepted.
 */
const ROLL_HERO_ABILITIES = { str: 18, dex: 12, con: 14, int: 10, wis: 16, cha: 20 }
const ROLL_WEAPON_NAME = 'Coil-Breaker'
/** Alt-clicked, so this whole string has to travel on the row. Non-ASCII on purpose. */
const ROLL_WEAPON_TEXT =
  'A blade cut with coil-runes — swung with Strength, and the runes take light on a hit. 🜁🔥'
const ROLL_PASSIVE_NAME = 'Ninth-Arch Stance'
const ROLL_CANTRIP_NAME = 'Reading of the Coil'

/** All thirteen, so the sheet is a realistic one. Arcana stays false — see `ROLL_HERO_ABILITIES`. */
const ROLL_HERO_SKILLS = {
  athletics: true,
  acrobatics: false,
  sleightOfHand: false,
  stealth: false,
  arcana: false,
  investigation: false,
  animalHandling: false,
  insight: false,
  perception: true,
  deception: false,
  intimidation: false,
  performance: true,
  persuasion: true,
}

/**
 * EVERY DISTINCT EXPRESSION SHAPE THE GRAMMAR PRODUCES, one entry each.
 *
 * Not variety for its own sake: these are the eight shapes the 763 entries in three corpora
 * come in, and the interesting thing about each is a different part of `parseRoll` —
 * an empty term list, a bare integer term, one token, a token beside `PROF`, a token beside
 * an integer, four terms at once, a die count above one on a d20, and a d20 arriving in the
 * *damage* slot rather than the to-hit one.
 *
 * ⚠️ **`count` and `faces` are the fixture's and only the values are copied off the row.**
 * That is what makes `expectedRollOf` able to name a missing die as `present on one side
 * only` rather than agreeing with whatever came back, and it is the whole reason this table
 * carries three numbers per shape instead of just the string.
 *
 * The expressions are hand-written here *and* hand-written on the sheet below, which is two
 * copies on purpose: the first check of section 30 diffs the two, so a fixture that drifted
 * fails by name before anything is rolled.
 */
const ROLL_SHAPES = [
  { label: 'no modifier at all', entryId: 'roll-plain', part: 'roll', expression: '2d6', count: 2, faces: 6, modifier: 0 },
  { label: 'a flat modifier', entryId: 'roll-flat', part: 'roll', expression: '1d8+3', count: 1, faces: 8, modifier: 3 },
  { label: 'one ability token', entryId: 'roll-token', part: 'roll', expression: '1d8+STR', count: 1, faces: 8, modifier: 4 },
  { label: 'a token and PROF', entryId: 'roll-weapon', part: 'toHit', expression: '1d20+STR+PROF', count: 1, faces: 20, modifier: 8 },
  { label: 'a token and a flat', entryId: 'roll-weapon', part: 'roll', expression: '1d8+STR+2', count: 1, faces: 8, modifier: 6 },
  { label: 'the four-term shape', entryId: 'roll-fourterm', part: 'toHit', expression: '1d20+STR+CHA+PROF', count: 1, faces: 20, modifier: 13 },
  { label: 'more than one d20', entryId: 'roll-portent', part: 'roll', expression: '2d20', count: 2, faces: 20, modifier: 0 },
  { label: 'a d20 in the damage slot', entryId: 'roll-cantrip', part: 'roll', expression: '1d20+WIS+PROF', count: 1, faces: 20, modifier: 7 },
]

/**
 * The sheet holding all eight, plus the passive that rolls nothing.
 *
 * The two weapons are what make `entry` × all four parts reachable off one document: a
 * weapon offers `toHit` and `roll`, the passive offers `use`, and `text` is the alt-click
 * that works on everything. `roll-fourterm`'s damage is a plain `1d6` because the shape
 * being asserted on that entry is its *to-hit*, and a second copy of a shape already in the
 * table would make the predicates below ambiguous about which row they found.
 */
const ROLL_HERO_SHEET = {
  kind: 'pc',
  level: ROLL_HERO_LEVEL,
  className: 'Coil-Reader',
  abilities: ROLL_HERO_ABILITIES,
  saveProficiencies: { str: true, dex: true, con: false, int: false, wis: false, cha: true },
  skillProficiencies: ROLL_HERO_SKILLS,
  armourClass: 16,
  maxHp: 66,
  hitDice: { count: 9, faces: 8 },
  feats: [
    {
      id: 'roll-plain',
      name: 'Hurled Ford-Stone',
      text: 'A stone off the bank, thrown hard. Nothing is aimed and nothing is added.',
      roll: '2d6',
      level: null,
      catalogueKey: null,
      category: 'action',
    },
    {
      id: 'roll-flat',
      name: 'Sling of the Ford',
      text: 'A leather sling with a fixed bonus somebody wrote on the sheet by hand.',
      roll: '1d8+3',
      level: null,
      catalogueKey: null,
      category: 'action',
    },
    {
      id: 'roll-token',
      name: 'Bare Fist',
      text: 'One token and nothing else, which is the shape most of the library is in.',
      roll: '1d8+STR',
      level: null,
      catalogueKey: null,
      category: 'action',
    },
    {
      id: 'roll-weapon',
      name: ROLL_WEAPON_NAME,
      text: ROLL_WEAPON_TEXT,
      roll: '1d8+STR+2',
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: '1d20+STR+PROF',
    },
    {
      id: 'roll-fourterm',
      name: 'Verse and Blade',
      text: 'Sung and swung together, which is why its to-hit names two abilities.',
      roll: '1d6',
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: '1d20+STR+CHA+PROF',
    },
    {
      id: 'roll-passive',
      name: ROLL_PASSIVE_NAME,
      text: 'Set your feet under the arch and nothing moves you off the stone you are on.',
      roll: null,
      level: null,
      catalogueKey: null,
      category: 'passive',
    },
  ],
  spells: [
    // `level: 0` rather than null — a cantrip, so `rollSentence` says *casts* and the
    // subject carries the number zero rather than an absent field.
    {
      id: 'roll-cantrip',
      name: ROLL_CANTRIP_NAME,
      text: 'A read of the coil that leaves a mark on whatever it was read against.',
      roll: '1d20+WIS+PROF',
      level: 0,
      catalogueKey: null,
      category: 'action',
    },
    {
      id: 'roll-portent',
      name: 'Portent of the Ninth Arch',
      text: 'Two d20s at once, deliberately: a roll with no single die to be the die.',
      roll: '2d20',
      level: 3,
      catalogueKey: null,
      category: 'action',
    },
  ],
}

/**
 * THE CREATURE THE SECRECY HALF IS ABOUT, and every number on it is chosen to be
 * unmistakable in a scan.
 *
 * `113` and `117` are the two modifiers, for the reason 271 and 137 are what they are one
 * fixture block up: a hero's totals in this game top out in the thirties, no die in the
 * grammar has more than a hundred faces, and a document id is redacted before the substring
 * scan runs — so a `113` anywhere in a player's payload is this creature's to-hit and
 * nothing else. `holdsNumber` walks every number at every depth, which is the half that
 * catches one arriving as a number in a field nobody thought to look at.
 *
 * ⚠️ **A negative initiative bonus**, because `toHitFromBonus` spells one `1d20-7` and a
 * naive `` `1d20+${bonus}` `` spells it `1d20+-7`. That function's own ⚠️ says so, and this
 * is the one place the sentence crosses a wire.
 */
const FEED_CREATURE_NAME = 'Thing That Rolls Under the Arch 🐍'
const FEED_CREATURE_ENTRY_NAME = 'Sundering Coil'
const FEED_CREATURE_TO_HIT = '1d20+113'
const FEED_CREATURE_TO_HIT_BONUS = 113
const FEED_CREATURE_DAMAGE = '4d8+117'
const FEED_CREATURE_DAMAGE_BONUS = 117
const FEED_CREATURE_INITIATIVE = -7
const FEED_CREATURE_SHEET = {
  kind: 'npc',
  armourClass: 19,
  maxHp: 313,
  initiativeBonus: FEED_CREATURE_INITIATIVE,
  actions: [
    {
      id: 'feed-coil',
      name: FEED_CREATURE_ENTRY_NAME,
      text: 'Melee. The coil closes and the arch takes the noise.',
      roll: FEED_CREATURE_DAMAGE,
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: FEED_CREATURE_TO_HIT,
    },
  ],
  notes: 'Rolls its own dice, and nobody at the table hears a thing until the coin is out.',
}

/** The DM's private ad-hoc roll. 199 is a needle for the same reason 113 and 117 are. */
const DM_ONLY_ROLL = '1d4+199'
const DM_ONLY_BONUS = 199

/**
 * `1d6` plus twenty `+1` terms: forty-three characters, and **a roll the grammar accepts.**
 *
 * `ROLL_PATTERN`'s trailing term group has no repetition cap, so this is the one bound in
 * the whole roll grammar that the pattern cannot express and `MAX_ROLL_LENGTH` inside
 * `rollProblem` is the only thing closing — which is exactly why `feed.rollDice` calls that
 * function rather than a bare `isValidRoll`. Built rather than typed out so the arithmetic
 * is visible: an innocent edit is how a boundary test stops sitting on a boundary.
 */
const MAX_ROLL_LENGTH = 40
const OVERLONG_ROLL = `1d6${'+1'.repeat(20)}`

/**
 * The die-count ceiling, copied by hand out of `convex/lib/sheet.ts`.
 *
 * Enforced by `ROLL_PATTERN`'s own `(?:[1-9]|[1-4]\d|50)` rather than by a comparison, which
 * is why one over it and a wildly-over-it are both worth sending: `51d6` is the shape a
 * regex that had been loosened by one character would accept, and `99d20` is the shape a
 * physics engine is asked to render.
 *
 * ⚠️ **Twenty until [ADR 0014](../docs/adr/0014-what-a-coin-says-about-itself.md) widened it
 * for the ad-hoc dice tray, and the hand copy is what caught this file up.** The check
 * below is written as `MAX_ROLL_DICE + 1` rather than as a literal, so moving the number
 * here moved the assertion — and the run that failed on `21d6` was this fixture doing
 * exactly its job: telling a person that the deployment now accepts something the script
 * still believed was refused. That is the whole argument for copying constants by hand
 * rather than importing them.
 */
const MAX_ROLL_DICE = 50

/**
 * THE KEY SETS, hand-spelled out of `publicFeedValidator`, `rollResultValidator`,
 * `dieValidator` and `feedSubjectValidator`.
 *
 * Copied by hand for the reason every other fixture here is copied, and the argument is at
 * its sharpest on a key set: a check that read the validator's own `fields` would agree with
 * a field silently discarded on write exactly as readily as with a correct payload, because
 * both sides would have moved together. **A field discarded on the way in is the thing this
 * whole script exists to find**, and the only instrument that finds it is a list of names
 * written down somewhere the code under test cannot reach.
 */
const FEED_ROW_KEYS = '_id,actorName,characterId,createdAt,dmOnly,predatesReveal,roll,subject'
const FEED_ROLL_KEYS = 'crit,dice,dropped,expression,mode,modifier,total'
const FEED_DIE_KEYS = 'faces,value'
const FEED_SUBJECT_KEYS = {
  entry: 'category,kind,level,name,part,text',
  check: 'ability,kind',
  save: 'ability,kind',
  skill: 'kind,skill',
  initiative: 'kind',
  dice: 'kind',
}

/** The name on the DM's own seat, and the `createdByName` the landing page prints. */
const SMOKE_DM_NAME = 'Smoke DM'

/**
 * A join code for a game that does not exist, for `games:checkDmCode`'s third answer.
 *
 * Six characters of the join alphabet, so it is refused for being unknown rather than for
 * being malformed — the interesting case is a well-formed code that opens nothing, which is
 * what a person mistyping one produces.
 */
const UNKNOWN_JOIN_CODE = 'ZZZZZZ'

/**
 * MILESTONE 10'S FIXTURES — the DM's tools.
 *
 * Three new tables, one widened union and three new optional fields on the game document.
 * Every name below is deliberately unlike every other name in this file, for the reason
 * sections 10, 20, 27 and 30 all give: a coin's name is public by design and a creature's is
 * the spoiler, so a scan that reused one would be unable to tell a leak from the thing it is
 * meant to allow.
 */

/**
 * A coin on the Background layer, which is the layer that separates **sight** from
 * **interaction** for the first time: everybody is sent it and nobody but the DM may move it.
 * So this name is expected to appear in a player's payload, which makes section 31 the one
 * secrecy check in this script that asserts *presence*.
 */
const SCENERY_COIN_NAME = 'Fallen Arch Stones'

/**
 * THE CREATURE THE FOG IS DRAWN OVER, and every number on it is a needle for the reason 271,
 * 113 and 117 are: a hero's totals in this game top out in the thirties and a document id is
 * redacted before the substring scan runs, so a `419` in a player's payload is this creature
 * and nothing else.
 *
 * ⚠️ **Its coin goes on the *player* layer, which is the whole point of testing fog at all.**
 * A GM-layer creature is already withheld by `maySee`, so fogging one would assert nothing
 * new. What fog has to be able to do is take back a creature every client has *already been
 * sent* — its placement, its health band and its feed lines — while leaving the coin's own row
 * in `board:tokens` alone, because that scope is documented and deliberate.
 */
const FOG_CREATURE_NAME = 'Thing in the Culvert 🕯️'
const FOG_CREATURE_COIN_NAME = 'Something Under the Water'
const FOG_CREATURE_MAX_HP = 419
const FOG_CREATURE_CURRENT_HP = 211
const FOG_CREATURE_ENTRY_NAME = 'Drowning Grip'
const FOG_CREATURE_DAMAGE = '3d10+167'
const FOG_CREATURE_DAMAGE_BONUS = 167
const FOG_CREATURE_NOTES = 'Comes up out of the culvert once they are halfway across the ford.'
const FOG_CREATURE_SHEET = {
  kind: 'npc',
  armourClass: 15,
  maxHp: FOG_CREATURE_MAX_HP,
  initiativeBonus: 3,
  actions: [
    {
      id: 'fog-grip',
      name: FOG_CREATURE_ENTRY_NAME,
      text: 'It takes an ankle and does not let go while it is still in the water.',
      roll: FOG_CREATURE_DAMAGE,
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: '1d20+9',
    },
  ],
  notes: FOG_CREATURE_NOTES,
}

/**
 * The half-extent of every rectangle drawn below, in image-space pixels.
 *
 * Thirty against a `gridSize` of 140, so a rectangle centred on one token's stored placement
 * cannot reach the centre of the coin in the next square along — `foggedTokenIds` tests the
 * **centre point** rather than the footprint, so a sloppier box would fog its neighbours and
 * turn every count below into a question about which coins happened to be nearby.
 */
const FOG_REACH = 30

/**
 * The key sets, hand-spelled out of `publicFogValidator`, `publicModalImageValidator` and
 * `publicTrackValidator`.
 *
 * Copied by hand for the reason `FEED_ROW_KEYS` is, and the argument is the same one at its
 * sharpest: a check that read a validator's own `fields` would agree with a field silently
 * discarded on write exactly as readily as with a correct payload, because both sides would
 * have moved together.
 */
const FOG_RECT_KEYS = '_id,height,width,x,y'
const MODAL_IMAGE_KEYS = '_id,imageHeight,imageUrl,imageWidth,name'
const TRACK_KEYS = '_id,name,url'
/**
 * `publicTokenMarkersValidator`, hand-spelled — two keys and no more.
 *
 * The same argument as the three above, with one extra edge: a marker row is the first row
 * in this application a **non-DM** can cause to exist, so a field added here would be a
 * field a player writes. Two keys is what says the row carries a coin's conditions and
 * nothing about who ticked them.
 */
const MARKER_ROW_KEYS = 'markers,tokenId'

/**
 * THE HANDOUT. Named the way `modalImages.list`'s docblock names the risk, because the whole
 * argument for that query being DM-only is that the *names* are the spoiler — so the name in
 * this script is one a scan of a player's payload can find.
 *
 * The dimensions are odd numbers on purpose: 1920×1081 is not a ratio anything would produce
 * by accident, so a deployment that helpfully rounded, swapped or defaulted either of them is
 * named by `firstDifference` rather than agreed with.
 */
const HANDOUT_NAME = 'The Duke’s Real Face 🖼️'
const HANDOUT_WIDTH = 1920
const HANDOUT_HEIGHT = 1081

/** The track, named for the same reason and asserted the same way. */
const TRACK_NAME = 'Dragon’s Lair (loop) 🎵'

/**
 * `MAX_MUSIC_BYTES`, copied by hand out of `convex/lib/limits.ts`.
 *
 * Copied rather than imported for the reason every other number in this file is: this is plain
 * .mjs on purpose and cannot import a .ts module, and a fixture derived from the code under
 * test would agree with a mangled limit exactly as readily as with a correct one. It is also
 * the one upload limit in this application that is genuinely the **only** defence — there is
 * no browser-side downscaler for audio — so the refusal one byte over it is the whole of what
 * stops a ten-megabyte-a-time leak against the 1 GB the free tier allows.
 */
const MAX_MUSIC_BYTES = 10 * 1024 * 1024

/**
 * A tiny audio file: an ID3v2 header declaring a zero-length tag, one MPEG-1 Layer III frame
 * header, and enough zero bytes after it to look like a frame.
 *
 * ⚠️ **These bytes do not have to be playable, and saying so is the point rather than an
 * apology.** Nothing server-side decodes them: `music.create` reads `blob.size` and
 * `blob.contentType` off the stored file and nothing else, exactly as `scenes.create` reads
 * only the size of a map. The reason it is a real MPEG frame header anyway is the reason
 * `PNG_BASE64` above is a real PNG — posting real bytes of the real kind to the real upload
 * endpoint is what this script is for, and the day something *does* sniff the file is the day
 * a buffer of random noise would fail here for a reason nobody could read.
 */
const MP3_BYTES = Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  Buffer.from([0xff, 0xfb, 0x90, 0x64]),
  Buffer.alloc(413),
])

/**
 * MILESTONE 11'S FIXTURES — tokens.
 *
 * One new vocabulary, one new naming rule and one new limit, all restated by hand for the
 * reason every number above is restated: this is plain .mjs on purpose, it cannot import a
 * .ts module, and a fixture derived from the code under test agrees with a broken rule
 * exactly as readily as with a correct one.
 */

/**
 * THE SEVENTEEN CONDITIONS, alphabetically, copied out of `convex/lib/markers.ts`.
 *
 * ⚠️ **The spellings are AMERICAN — `paralyzed` — against this codebase's British house
 * style, and copying them faithfully is the whole point of this constant.** Exactly one of
 * the seventeen actually differs, the surrounding prose is British, and the next reader will
 * see `paralyzed` as a typo. A stored key whose spelling changes is a marker that silently
 * stops drawing: `normaliseMarkers` drops the value it has never heard of, exactly as
 * designed, and the pip disappears from a board mid-session with nothing failing anywhere.
 * This array is a second place, outside `convex/`, where that change fails a check.
 *
 * The **order** is load-bearing too, and it is asserted rather than merely relied on: the
 * canonical order is what `normaliseMarkers` produces, so the round trip below sends the
 * list backwards and diffs what comes back against this one element by element.
 */
const ALL_MARKERS = [
  'blinded',
  'charmed',
  'concentrating',
  'dead',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]

/**
 * A subset sent out of order **and with one member repeated**, and the array the vocabulary
 * puts it back as.
 *
 * ⚠️ **The repeat is here rather than on the seventeen, and the deployment is what decided
 * that.** `setMarkers` refuses an array longer than the vocabulary before it reads anything —
 * an argument-only bound, so a call that will be refused on its arguments alone costs no I/O
 * to refuse — which means *the whole vocabulary plus a repeat* is not a payload a client can
 * send at all. So the two claims are split: the seventeen prove the **order**, at the cap,
 * and this proves the **deduplication**. A double-clicked checkbox is what sends the repeat,
 * and it never sends more than seventeen boxes.
 */
const SUBSET_SENT = ['unconscious', 'charmed', 'prone', 'blinded', 'charmed']
const SUBSET_CANONICAL = ['blinded', 'charmed', 'prone', 'unconscious']

/** `MAX_DUPLICATE_COUNT`, copied by hand out of `convex/lib/limits.ts`. */
const MAX_DUPLICATE_COUNT = 10

/**
 * THE COIN THE NAMING RULE IS ASSERTED OVER, and the emoji is inside the base on purpose.
 *
 * The rule is three sentences: the **base** is the source name with one trailing
 * ` <digits>` group removed, `n` is the highest number already in use among names matching
 * that base — a bare base counting as 1 — and the copies are `base n+1 …`. So a source
 * called `Kobold of the Arch 🐉 3` duplicates to `… 🐉 4`, `… 🐉 5`, `… 🐉 6`.
 *
 * ⚠️ **The emoji sits before the number rather than after it, and that is the fixture doing
 * its job rather than a decoration.** `NUMBERED_NAME` is anchored — a name counts as
 * numbered only when it *ends* in a space and digits — so `Kobold of the Arch 3 🐉` has no
 * trailing sequence number at all, its base is the whole string and its copies would be
 * numbered from 2. Both readings are correct behaviour; only this one puts a surrogate pair
 * in the middle of a string the server slices a number off the end of, which is the
 * Milestone 1 bug class arriving at a new field. The name is asserted to hold an astral
 * character at the check, so an innocent edit that ASCII-fies it fails rather than quietly
 * testing nothing.
 *
 * ⚠️ **And a coin called `… 🐉 3` cannot be made by typing that name, which is a fact about
 * the deployment and not about this fixture.** `addToken` runs the DM's typed name through
 * the *same* `duplicateNames` a duplication uses, so asking for one coin called `… 🐉 3` on
 * a board with no kobolds hits the skip case and stores `… 🐉` with the number **stripped** —
 * and every claim below about the base rule would then have been about a different string.
 * So the source is made by adding **three** coins on the bare base, which numbers them 1, 2
 * and 3, and the third one is the source. That is asserted on the way past rather than
 * assumed, because it is the fact the rest of the section rests on.
 */
const KOBOLD_BASE = 'Kobold of the Arch 🐉'
const KOBOLD_COIN_NAME = `${KOBOLD_BASE} 3`
const KOBOLD_TINT = '#C0FFEE'
const KOBOLD_SIZE = 3
const KOBOLD_MAX_HP = 353
/** Damage to exactly one copy. 111 of 353 leaves 242 — three numbers no other fixture uses. */
const KOBOLD_DAMAGE = 111
/**
 * The source's sheet: a `pc`, because `setReserved` refuses anything else and *reserved
 * travels to the copy* is one of the claims below. Small on purpose — the diff is copy
 * against source rather than against this, so what matters is that every field is one a
 * field-by-field rebuild could drop.
 */
const KOBOLD_SHEET = {
  kind: 'pc',
  level: 5,
  className: 'Warden of the Arch',
  abilities: { str: 13, dex: 19, con: 11, int: 7, wis: 15, cha: 9 },
  saveProficiencies: { str: false, dex: true, con: false, int: false, wis: true, cha: false },
  armourClass: 16,
  maxHp: KOBOLD_MAX_HP,
  hitDice: { count: 5, faces: 8 },
  feats: [
    {
      id: 'kobold-arch-lore',
      name: 'Arch-Lore 🜁',
      text: 'Knows which of the nine arches the water goes under first, and says so at length.',
      roll: null,
      level: null,
      catalogueKey: null,
      category: 'passive',
    },
  ],
  spells: [],
}

/**
 * Exactly forty UTF-16 code units and no trailing digits, so numbering one copy off it
 * would take the name to forty-two and `duplicateNamesProblem` refuses the batch.
 *
 * The length is asserted at the check rather than trusted, for `EDITED_TOKEN_NAME`'s reason:
 * an innocent edit to the string is exactly how a boundary test stops sitting on the
 * boundary. It borrows `MAX_TOKEN_NAME_LENGTH` above rather than declaring a second
 * constant, because the limit `duplicateNamesProblem` applies *is* the character-name limit
 * — one number in `convex/lib/codes.ts`, and two names for it here would be one more place
 * for a copy to go stale.
 */
const OVERLONG_SOURCE_NAME = 'Kobold Sergeant of the Ninth Arch Bridge'

/** A base nothing on the board uses, for *add five of these*. */
const SWARM_NAME = 'Culvert Rat'

/** The coin section 36 walks between two boards. Distinct from every other name here. */
const TRAVELLER_COIN_NAME = 'Lantern-Bearer of the Undercroft'

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

/**
 * `critOf` restated, for the reason `snapToGrid` below is restated: this is plain .mjs on
 * purpose and cannot import a .ts module, and a fixture derived from the code under test
 * would agree with a broken rule exactly as readily as with a correct one.
 *
 * The rule is **exactly one d20 among the kept dice**, which is why `2d20` fires no
 * fireworks and neither does an 8 on a d8. Reads the kept dice, so advantage crits on the
 * die that survived and never on the one in `dropped`.
 */
function critFor(dice) {
  const twenties = dice.filter((die) => die.faces === 20)
  if (twenties.length !== 1) return null
  if (twenties[0].value === 20) return 'success'
  return twenties[0].value === 1 ? 'failure' : null
}

/**
 * THE ROLL THIS SCRIPT EXPECTED, built so that `firstDifference` can name whatever moved.
 *
 * ⚠️ **The one thing here taken off the row is the face each die came up on**, because it is
 * the only thing on a real roll a script cannot predict. Everything else — the expression,
 * the mode, the die count, the face count of each die, the resolved modifier, the total and
 * the crit — is the fixture's or is worked out from the dice, so a deployment that returned
 * the wrong number of dice, a die with the wrong faces, a total that is not the sum plus the
 * modifier, or a roll object missing a key is *named* rather than agreed with.
 *
 * The die count comes from `shape.count` and never from the row, which is the detail that
 * makes that true: copying the array's length across would make an extra or a missing die
 * invisible, whereas indexing into a shorter array leaves the expected die carrying no
 * `value` key at all and `firstDifference` reports `present on one side only`.
 *
 * `total` is floored at zero here because `evaluateRoll` floors it there — a heavily
 * penalised roll reads `0` rather than `-2`, and that is a claim worth asserting rather than
 * a detail worth mirroring quietly.
 */
function expectedRollOf(row, shape) {
  const dice = row && row.roll ? row.roll.dice : []
  const rolled = dice.reduce((sum, die) => sum + die.value, 0)
  return {
    expression: shape.expression,
    mode: shape.mode ?? 'flat',
    dice: Array.from({ length: shape.count }, (unused, index) => ({
      faces: shape.faces,
      ...(index < dice.length ? { value: dice[index].value } : {}),
    })),
    dropped: null,
    modifier: shape.modifier,
    total: Math.max(0, rolled + shape.modifier),
    crit: critFor(dice),
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

/**
 * A real signed upload URL, a real POST, real bytes in real storage.
 *
 * ⚠️ **The content type is the caller's, and it is not decoration.** `music.create` refuses a
 * blob whose stored `contentType` does not begin `audio/` — honestly labelled as the header
 * the *browser* chose, because nothing reads a byte of the file — so the only way to reach
 * that refusal, or to get past it, is for the POST this script makes to declare one. It is the
 * one fact about an upload that travels with the blob rather than with the mutation, so it can
 * only be set here.
 */
async function uploadBlob(client, code, dmCode, contentType, body) {
  const uploadUrl = await client.mutation('files:generateUploadUrl', { code, dmCode })
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
  if (!response.ok) {
    throw new Error(`upload POST failed: ${response.status} ${await response.text()}`)
  }
  const { storageId } = await response.json()
  if (!storageId) throw new Error('upload POST returned no storageId')
  return storageId
}

async function uploadPng(client, code, dmCode) {
  return await uploadBlob(client, code, dmCode, 'image/png', Buffer.from(PNG_BASE64, 'base64'))
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
  // ⚠️ **Every coin this run ticks a condition on, and it is swept before the token loop
  // rather than after it.** A marker row hangs off a coin, so clearing one on a coin
  // `board:removeToken` has already taken means `TokenNotFound` — and `quietly` would report
  // a failed cleanup step for a run that went perfectly, which is the one thing a cleanup
  // path must never do. `removeToken` calls `deleteTokenMarkers` itself, so the ordering
  // buys nothing except a receipt that tells the truth. Section 37 empties this list inline
  // where the clearing is itself an assertion, exactly as sections 25, 33 and 34 do; what is
  // left here is a run that failed halfway.
  const markedTokens = []
  // ⚠️ **A whole second game, and it exists for one refusal.** `board:placements` has to
  // answer *a coin at another table* and *a coin that no longer exists* identically, and a
  // fabricated id cannot ask that question — a string that is not a `tokens` id at all is
  // refused by Convex's argument validation at the function boundary, which is a different
  // refusal from a different layer. So the foreign token is a real row in a real game, and
  // that game's own scene, coin and blob are swept below. The game document itself is named
  // with this run's `Board Smoke ` prefix so that `npm run prune-games` reaches it exactly as
  // it reaches the main one.
  const foreignGames = []
  // ⚠️ **Three more registries, and the two `_storage`-backed ones are the reason the sweep at
  // the bottom of this file has an order at all.** A handout and a track each own a blob, and
  // `files.discard` refuses any blob a live row still points at — so a run that fails between
  // creating one and deleting it must delete the *row* before the upload list is swept, or the
  // sweep reports a failed cleanup step for a blob that was doing its job. Both loops therefore
  // sit above the `uploads` loop in `finally`, and the note there says so.
  //
  // Sections 33 and 34 empty these on the way past, exactly as section 25 empties
  // `reservedCharacters`: the removal *is* one of the assertions, so leaving the id here would
  // make a run that went perfectly report a failed cleanup step. What is left behind is the
  // reason the registry exists — a run that failed halfway.
  const createdHandouts = []
  const createdTracks = []
  // A second map, for the one fog check that needs a board nobody is looking at. Separate from
  // `sceneId` rather than folded into it, because every other section in this file means *the
  // active scene* by that name and a second one would silently change what forty checks are
  // about.
  const extraScenes = []
  // ⚠️ **Every blob this run POSTs, whether or not anything ever adopted it.** The four
  // registries above are all *rows*, and a row is reclaimed by the mutation that deletes the
  // thing it hangs off — `scenes:remove` takes the map's bytes with it and
  // `board:removeToken` takes the coin's. Section 29 breaks that arrangement, because an art
  // swap is the first operation here that can leave bytes in storage with **no row pointing
  // at them at all**: a run that fails between `uploadPng` and `board:setArt` has uploaded a
  // file nothing in the application will ever mention again, and nothing else in this
  // cleanup path could find it. So the ids are collected as they are minted rather than
  // where they are used, and swept last — see the loop in `finally` for why the order
  // matters and why sweeping the whole list is safe.
  const uploads = []
  let code = null
  let dmCode = null
  let sceneId = null

  try {
    // Named rather than inlined, because section 29 looks this string up in `games:list` —
    // and two literals of the same name is one place for a scan to quietly start matching
    // nothing, which is the care section 13 takes over `RESERVED_NAME`.
    const gameName = `Board Smoke ${new Date().toISOString()}`
    const game = await client.mutation('games:create', {
      name: gameName,
      dmName: SMOKE_DM_NAME,
      recoveryPhrase: 'brass lantern smoke',
    })
    code = game.code
    dmCode = game.dmCode
    check('games:create issued a join code and a DM code', Boolean(code && dmCode), code)

    // 1. A real upload URL, a real POST, real bytes in real storage.
    const imageId = await uploadPng(client, code, dmCode)
    uploads.push(imageId)
    check('files:generateUploadUrl accepted a POST and returned a storageId', Boolean(imageId))

    // A SECOND BLOB FOR THE SAME ROW, which is what makes this the interesting upload in the
    // file rather than a repeat of the one above. `scenes.thumbnailId` is a *new optional
    // column on a populated table*, and that is the shape of change this script exists for:
    // convex-test does not apply Convex's own value validation, so an insert that spells the
    // field with an explicit `undefined` rather than omitting it passes the whole suite and
    // is a different write against a real deployment.
    const thumbnailId = await uploadPng(client, code, dmCode)
    uploads.push(thumbnailId)

    const scene = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'Admittance',
      imageId,
      thumbnailId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    sceneId = scene.sceneId
    check('scenes:create stored a scene', Boolean(sceneId))

    // 1b. THE PROJECTION SPLIT, ASSERTED AS A PAIR AGAINST THE REAL DEPLOYMENT. `scenes:list`
    // is DM-only and carries a signed URL for the derivative; `scenes:active` is ungated and
    // must carry no trace of it, because every player at the table subscribes to it. Either
    // half alone proves nothing — a payload with no thumbnail anywhere would satisfy the
    // second, so the first is the positive control for it.
    const dmScenes = await client.query('scenes:list', { code, dmCode })
    const listedScene = dmScenes.find((row) => row._id === sceneId)
    const tableScene = await client.query('scenes:active', { code })
    check(
      'scenes:list gave the DM a thumbnail URL, and scenes:active gave the table none',
      listedScene &&
        typeof listedScene.thumbnailUrl === 'string' &&
        listedScene.thumbnailUrl !== listedScene.imageUrl &&
        tableScene !== null &&
        !Object.prototype.hasOwnProperty.call(tableScene, 'thumbnailUrl'),
      listedScene
        ? `DM keys ${Object.keys(listedScene).length}, table keys ${tableScene ? Object.keys(tableScene).length : 0}`
        : 'the DM’s list did not contain the scene it just made',
    )
    // AND THE OTHER HALF OF `files.discard`'s NEW COLUMN. `sceneReferencesThumbnail` is the
    // predicate `storageGuard.test.ts` had to be rewritten per-field to force into existence;
    // without it this call would delete the bytes of a picture the picker is drawing.
    await refuses('files:discard refused a blob a scene holds as its thumbnail', () =>
      client.mutation('files:discard', { code, dmCode, imageIds: [thumbnailId] }),
    )

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
    uploads.push(openArt)
    const secretArt = await uploadPng(client, code, dmCode)
    uploads.push(secretArt)

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
      layer: 'gm',
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
    // ⚠️ **The DM code on this call is a deliberate change and not a tidy-up.** Creating
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

    // ⚠️ **THE 2024 PAIRS, AND THE REASON THEY ARE ON THIS COMMIT RATHER THAN AFTER THE
    // CONTENT.** `firstDifference` above already names a field the rebuild dropped — that is
    // the presence half, and it fires for all five sheet fields and both entry fields for
    // free. What it cannot do is tell a deployment that stores an omitted optional field as
    // omitted from one that materialises it, and a materialised `resistances: []` or
    // `uses: { max: 0 }` would look exactly like a correct round trip everywhere else in this
    // script. So the absence half is asserted on the KEY, against fixtures built to carry
    // none of them.
    const legacyEntryClean =
      legacyFeat && NEW_ENTRY_FIELDS.every((field) => !(field in legacyFeat))
    check(
      'an entry sent with neither a mastery nor a use count came back with neither key',
      legacyEntryClean,
      legacyFeat ? `keys: ${Object.keys(legacyFeat).sort().join(', ')}` : 'no legacy feat came back',
    )
    const mendingFeat = storedFeats.find((entry) => entry.id === 'feat-verse-of-mending')
    check(
      'its two siblings came back with exactly what each was sent, one field apart',
      weaponFeat &&
        weaponFeat.mastery === 'graze' &&
        weaponFeat.uses &&
        weaponFeat.uses.max === 3 &&
        weaponFeat.uses.recharge === 'long' &&
        weaponFeat.uses.regainOnShortRest === 1 &&
        // ⚠️ The pair that stops the two fields being asserted as one: only a weapon carries
        // a mastery, but any category may be limited — so this one has `uses` and no
        // `mastery`, and its `uses` has no `regainOnShortRest`, which checks absence one
        // level deeper than any other assertion in this script.
        mendingFeat &&
        !('mastery' in mendingFeat) &&
        mendingFeat.uses &&
        mendingFeat.uses.max === 2 &&
        mendingFeat.uses.recharge === 'short' &&
        !('regainOnShortRest' in mendingFeat.uses),
      weaponFeat
        ? `positive control — got mastery ${JSON.stringify(weaponFeat.mastery)} and uses ${JSON.stringify(weaponFeat.uses)}`
        : 'no weapon feat came back',
    )

    // The sheet-level five, and the negative built by naming what it keeps rather than by
    // deleting from `PC_SHEET` — see `BARE_PC_SHEET`.
    const barePc = await client.mutation('characters:create', {
      code,
      dmCode,
      name: BARE_PC_NAME,
      sheet: BARE_PC_SHEET,
    })
    createdCharacters.push(barePc.characterId)
    const bareBack = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: barePc.characterId,
    })
    const bareDrift = bareBack
      ? firstDifference(BARE_PC_SHEET, bareBack.sheet, 'bareSheet')
      : 'no sheet came back'
    check(
      'a hero sent without any of the 2024 five came back without any of them',
      bareBack &&
        bareDrift === null &&
        NEW_PC_SHEET_FIELDS.every((field) => !(field in bareBack.sheet)),
      bareDrift ?? `keys: ${Object.keys(bareBack.sheet).sort().join(', ')}`,
    )
    check(
      'and its sibling carried all five across, lists and prose alike',
      storedPc &&
        storedPc.sheet.spellcastingAbility === 'cha' &&
        Array.isArray(storedPc.sheet.resistances) &&
        storedPc.sheet.resistances.length === 2 &&
        storedPc.sheet.immunities.length === 1 &&
        // Non-ASCII in a damage label, because a list of free text is exactly where the
        // UTF-16 failure this whole script exists for would next appear.
        storedPc.sheet.vulnerabilities[0].includes('🜁') &&
        storedPc.sheet.senses === PC_SHEET.senses &&
        // ⚠️ **And NOTHING derived came back stored.** The acceptance criterion is that a
        // caster's sheet *prints* a spell save DC and a spell attack bonus and that neither
        // is written down; this is the half a round trip can check.
        !('spellSaveDc' in storedPc.sheet) &&
        !('spellAttackBonus' in storedPc.sheet),
      storedPc
        ? `positive control — without it the check above passes on a deployment that discarded everything; senses ${JSON.stringify(storedPc.sheet.senses)}`
        : 'no sheet came back',
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
    // ⚠️ **THE BAND VARIANT GAINED NOTHING, AND FIVE NEW FIELDS AT ONCE IS THE PRESSURE THAT
    // ASSERTION EXISTS AGAINST.** Two of the five are not numbers at all —
    // `heroicInspiration` is a boolean and `spentUses` an array — so `publicVitalsValidator`'s
    // *no bare float64 on the band member* guarantee, which `vitals.test.ts` pins, does not
    // reach either of them. This does, against a real deployment's serialisation.
    const bandForbidden = [
      'temporaryHp',
      'deathSaveSuccesses',
      'deathSaveFailures',
      'heroicInspiration',
      'spentUses',
    ]
    const dmExactRow = (await client.query('characters:vitals', { code, dmCode })).find(
      (row) => row.characterId === npc.characterId,
    )
    check(
      'none of the five 2024 state fields reached a player’s band row, and all five reached the DM’s',
      npcVitals &&
        bandForbidden.every((field) => !(field in npcVitals)) &&
        // The positive control, and it is the load-bearing half: without it this passes on a
        // deployment that stopped sending any of them to anybody, which would also be wrong.
        dmExactRow &&
        dmExactRow.kind === 'exact' &&
        bandForbidden.every((field) => field in dmExactRow),
      npcVitals
        ? `band keys: ${Object.keys(npcVitals).sort().join(', ')} — positive control included`
        : 'no row for the NPC',
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
    // ⚠️ **Written out rather than spread from `NPC_SHEET`, and it is the negative half of
    // the creature pair.** This is a creature shaped exactly as every `kind: 'npc'` sheet in
    // every existing game is — no ability scores and no save column — so the absence check
    // below has something real to be about. A spread of `NPC_SHEET` would inherit both fields
    // and the pair would be two positives.
    const hidden = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Wyrmling in the Rafters',
      sheet: {
        kind: 'npc',
        armourClass: 13,
        maxHp: 33,
        initiativeBonus: 1,
        actions: [],
        notes: '',
      },
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

    // ⚠️ **THE CREATURE HALF OF THE 2024 FIXTURE PAIR.** `firstDifference` names a *dropped*
    // field; nothing but this names a *materialised* one, and a deployment that helpfully
    // filled in six tens would satisfy every other assertion in this script. Asserted on the
    // KEY, because `abilities: {}` is not how absence is said.
    const hiddenBack = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: hidden.characterId,
    })
    const statted = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: npc.characterId,
    })
    check(
      'a creature sent without ability scores came back without them, and its statted sibling kept all four pre-calculated numbers',
      hiddenBack &&
        NEW_NPC_SHEET_FIELDS.every((field) => !(field in hiddenBack.sheet)) &&
        // The positive control, and it is the load-bearing half: without it this passes on a
        // deployment that discarded everything it was sent. It also asserts the thing the
        // roadmap's "simplification" would have deleted — the scores arrived *beside* the
        // four printed numbers, not instead of them, and `initiativeBonus` is still the −2
        // the DM wrote rather than the +1 this Dexterity would derive.
        statted &&
        statted.sheet.abilities.str === 19 &&
        statted.sheet.saveProficiencies.wis === true &&
        statted.sheet.initiativeBonus === NPC_SHEET.initiativeBonus,
      hiddenBack
        ? `bare keys: ${Object.keys(hiddenBack.sheet).sort().join(', ')}`
        : 'no sheet came back',
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

    // ⚠️ **THE PRESET HALF OF THE 2024 FIXTURE PAIR — the fourth stored kind, and the one
    // whose two new fields carry a rename across.** `species` is `race` under its 2024 name
    // and is what the migration will backfill; `lineageKey` is the sixth pick. The Elf above
    // is the negative: it was created the way every existing character was, so neither key
    // may come back on it.
    const woodElf = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Faelar of the Deep Wood',
      sheet: presetSheet({
        race: 'elf',
        species: 'elf',
        lineageKey: 'wood',
        classKey: 'rogue',
        subclassKey: 'thief',
        level: 3,
      }),
    })
    createdCharacters.push(woodElf.characterId)
    const woodElfBack = await readSheet(woodElf.characterId)
    check(
      'a preset carrying a species and a lineage round-tripped both, and the one without carried neither',
      woodElfBack &&
        woodElfBack.preset &&
        woodElfBack.preset.species === 'elf' &&
        woodElfBack.preset.lineageKey === 'wood' &&
        // The negative half. A deployment that materialised `species` from `race` would look
        // entirely correct on the row above and would make `speciesKeyOf` answer from the new
        // field for every character in every game before the migration had run.
        elfAtOne &&
        elfAtOne.preset &&
        NEW_PRESET_FIELDS.every((field) => !(field in elfAtOne.preset)),
      woodElfBack
        ? `preset ${JSON.stringify(woodElfBack.preset)} against ${JSON.stringify(elfAtOne && elfAtOne.preset)}`
        : 'no sheet came back',
    )

    // ⚠️ **`null` is a THIRD state on `lineageKey` and it has to survive as one.** Absent
    // means *nobody was ever asked*; `null` means *asked, and this species has no lineage to
    // pick*. A deployment that dropped the key, or the client library turning it into an
    // absent field, collapses two facts into one — and `firstDifference` reports exactly that
    // as `present on one side only`, which is why the check is on the key rather than on the
    // value.
    const askedElf = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Ilyra, Asked and Answered',
      sheet: presetSheet({ race: 'elf', species: 'elf', lineageKey: null, classKey: 'rogue' }),
    })
    createdCharacters.push(askedElf.characterId)
    const askedBack = await readSheet(askedElf.characterId)
    check(
      'an explicit null lineage came back as a null rather than as an absent key',
      askedBack &&
        askedBack.preset &&
        'lineageKey' in askedBack.preset &&
        askedBack.preset.lineageKey === null,
      askedBack ? `preset ${JSON.stringify(askedBack.preset)}` : 'no sheet came back',
    )

    // None of this was sent in. `characters:create` was given a name, a race, a
    // class and a level; the scores, the armour class, the hit dice, the thirteen
    // skill flags and every feat below came back out of the library.
    const built = elfAtOne ? elfAtOne.sheet : null
    // ⚠️ The library's abilities, UNCHANGED — see the note on `DWARF_HP_PER_LEVEL` above. An
    // Elf used to arrive with +2 Dexterity on top of this; no 2024 species touches a score, so
    // a drift of even one point here means something reintroduced a species ability bonus.
    const abilityDrift = built
      ? firstDifference({ ...ROGUE.base.abilities }, built.abilities, 'abilities')
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
        built.feats.length === ROGUE.base.featCount + ELF_TRAIT_ENTRIES,
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
      'each species landed on the library sheet exactly once',
      built &&
        built.abilities.dex === ROGUE.base.abilities.dex &&
        dwarfSheet &&
        dwarfSheet.sheet.maxHp === wantedDwarfHp &&
        goliathSheet &&
        goliathSheet.sheet.speed === GOLIATH_SPEED,
      `elf dex ${built ? built.abilities.dex : '—'} of ${ROGUE.base.abilities.dex} unchanged, dwarf ${dwarfSheet ? dwarfSheet.sheet.maxHp : '—'} hp of ${wantedDwarfHp}, goliath ${goliathSheet ? goliathSheet.sheet.speed : '—'} feet`,
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
        atTwoThief.sheet.feats.length === ROGUE.thief2.featCount + ELF_TRAIT_ENTRIES,
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
        atFour.sheet.feats.length === ROGUE.thief4.featCount + ELF_TRAIT_ENTRIES &&
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
    // ⚠️ **`characters:setPerRest` is now `characters:setUses` and takes a COUNT**, and the
    // returned array is objects rather than strings — a nested `v.object` inside a `v.array`
    // inside an optional field, which is the shape convex-test waves through and a real
    // deployment has opinions about.
    const usesBack = await client.mutation('characters:setUses', {
      code,
      dmCode,
      characterId: human.characterId,
      key: 'heroic-inspiration',
      spent: 1,
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
        hurt.spentUses.length === 1 &&
        hurt.spentUses[0].key === 'heroic-inspiration' &&
        hurt.spentUses[0].spent === 1 &&
        usesBack.spentUses.length === 1,
      hurt
        ? `${hurt.current}/${hurt.max}, ${hurt.hitDiceRemaining} of ${hurt.hitDiceCount} hit dice, spent ${JSON.stringify(hurt.spentUses)}`
        : 'no vitals row',
    )

    await client.mutation('characters:longRest', { code, dmCode, characterId: human.characterId })
    const afterRest = await dmVitalsFor(human.characterId)
    check(
      'characters:longRest reset hit points, hit dice, the per-rest array and the 2024 state in one call',
      afterRest &&
        afterRest.kind === 'exact' &&
        afterRest.current === FIGHTER.base.maxHp &&
        afterRest.hitDiceRemaining === FIGHTER.base.hitDice.count &&
        afterRest.spentPerRest.length === 0 &&
        afterRest.spentUses.length === 0 &&
        afterRest.temporaryHp === 0 &&
        afterRest.deathSaveSuccesses === 0 &&
        afterRest.deathSaveFailures === 0,
      afterRest
        ? `${afterRest.current}/${afterRest.max}, ${afterRest.hitDiceRemaining} hit dice, spent ${JSON.stringify(afterRest.spentUses)}`
        : 'no vitals row',
    )

    // ⚠️ **THE SHORT REST, AS ONE POSITIVE AND TWO NEGATIVES.** It does not heal and does not
    // return hit dice — *spending* hit dice is what a short rest is for — and a check that
    // only asserted the restoration would pass on a mutation that reset the whole row. All
    // three in one place, because any one of them alone is satisfied by the wrong mutation.
    await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: human.characterId,
      delta: -4,
    })
    await client.mutation('characters:adjustHitDice', {
      code,
      dmCode,
      characterId: human.characterId,
      delta: -1,
    })
    await client.mutation('characters:setUses', {
      code,
      dmCode,
      characterId: human.characterId,
      key: 'heroic-inspiration',
      spent: 1,
    })
    await client.mutation('characters:shortRest', { code, dmCode, characterId: human.characterId })
    const afterShort = await dmVitalsFor(human.characterId)
    check(
      'characters:shortRest healed nobody, returned no hit dice, and left a long-rest ability spent',
      afterShort &&
        afterShort.kind === 'exact' &&
        afterShort.current === FIGHTER.base.maxHp - 4 &&
        afterShort.hitDiceRemaining === FIGHTER.base.hitDice.count - 1 &&
        // The positive control for the pair above: the rest ran and had something to do. A
        // Human's Heroic Inspiration comes back on a *long* rest, so it must still be spent —
        // a short rest that restored it would be the app inventing a rule, which is the same
        // failure as a Wizard getting slots back from one.
        afterShort.spentUses.length === 1 &&
        afterShort.spentUses[0].key === 'heroic-inspiration',
      afterShort
        ? `${afterShort.current}/${afterShort.max}, ${afterShort.hitDiceRemaining} hit dice, spent ${JSON.stringify(afterShort.spentUses)}`
        : 'no vitals row',
    )
    await client.mutation('characters:longRest', { code, dmCode, characterId: human.characterId })

    // Checked against the character's own species and its own sheet rather than taken as
    // given, so the stored array cannot fill with keys nothing will ever clear. A Human has
    // no Relentless Endurance to spend.
    await refuses('characters:setUses refused a key this character does not have', () =>
      client.mutation('characters:setUses', {
        code,
        dmCode,
        characterId: human.characterId,
        key: 'relentless-endurance',
        spent: 1,
      }),
    )
    // ⚠️ **And handing one back is still allowed**, which is the asymmetry the mutation keeps
    // deliberately: a DM who changes a character's species leaves whatever the old one had
    // spent still marked, and a check that applied here too would make it unclearable by
    // anything short of a long rest.
    const handedBack = await client.mutation('characters:setUses', {
      code,
      dmCode,
      characterId: human.characterId,
      key: 'relentless-endurance',
      spent: 0,
    })
    check(
      'characters:setUses allowed a hand-back of the same key it refused a spend of',
      handedBack && handedBack.spentUses.length === 0,
      handedBack ? JSON.stringify(handedBack.spentUses) : 'no answer came back',
    )
    // A count that is not one. `NaN` and `Infinity` are perfectly valid Convex float64s, so
    // this is exactly the class of value convex-test stores without a word.
    for (const spent of [Number.NaN, Number.POSITIVE_INFINITY, -1, 21]) {
      await refuses(`characters:setUses refused a spend of ${spent}`, () =>
        client.mutation('characters:setUses', {
          code,
          dmCode,
          characterId: human.characterId,
          key: 'heroic-inspiration',
          spent,
        }),
      )
    }

    // 16. Selections the deployment has to refuse. The first two are the argument
    // validator's — a race and a class are unions of literals, so a key that is not
    // one of the eight never reaches a handler. The rest are `storedSheetProblem`'s,
    // and every one of them is a value convex-test would store without a word.
    //
    // ⚠️ **Every one of them sends the DM code**, which is the creation gate rather than
    // decoration. `storedSheetProblem` runs *after* `requireDm`, so an archetype refusal
    // written without a code would be refused as `NotDm` — passing the `refuses` check
    // while asserting nothing at all about archetypes. The two argument-validator cases
    // above it would still refuse for the right reason, and they carry the code anyway so
    // that the whole block is refused by the bound it names rather than by the gate.
    // ⚠️ **The probe was `gnome`, which is now a real species.** It has to be a key the narrow
    // validator genuinely refuses, and the interesting one is `half-orc`: it is the key this
    // application *used to* accept, so it is the one somebody reintroduces — from an old
    // fixture, an old comment, or a stored validator widened "for compatibility". A made-up
    // string would refuse for a reason nothing is under pressure to break.
    await refuses('characters:create refused the retired half-orc species', () =>
      client.mutation('characters:create', {
        code,
        dmCode,
        name: 'Uninvited Half-Orc',
        sheet: presetSheet({ race: 'half-orc', classKey: 'rogue' }),
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
        untouched.sheet.feats.length === ROGUE.base.featCount + ELF_TRAIT_ENTRIES,
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
              // The fourth stored kind's turn at the 2024 entry pair, reached through its
              // override diff — the sixth array position `sheetEntryValidator` occupies and
              // the only one where these two fields cross the wire on a `bestiary` document.
              // `topple` deliberately: it is one of the three the movement-detriment
              // exclusion names, and nothing in the codebase reads it. Nobody is knocked
              // down, and this check is that the *word* survives a CR shift.
              mastery: 'topple',
              uses: { max: 2, recharge: 'short' },
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
    // ⚠️ **THE 2024 ENTRY PAIR, ON THE FOURTH STORED KIND AND ACROSS TWO CR SHIFTS.** The
    // corpus's own attacks are the negative — nothing in `lib/bestiary/` declares a mastery
    // or a use count today — and the DM's own entry is the positive. A CR shift rebuilds
    // every attack the corpus contributes and appends the DM's untouched, so this is the one
    // place in the script where the two new fields have to survive a *resolution* rather than
    // only a write.
    check(
      "the DM's entry kept its mastery and its use count across two shifts, and the corpus's own attacks grew neither",
      dmWeapon &&
        dmWeapon.mastery === 'topple' &&
        dmWeapon.uses &&
        dmWeapon.uses.max === 2 &&
        dmWeapon.uses.recharge === 'short' &&
        !('regainOnShortRest' in dmWeapon.uses) &&
        // The negative, and it is what makes this a pair: a resolver that materialised a
        // mastery on every weapon it built would satisfy the positive perfectly.
        corpusAttacks.length > 0 &&
        corpusAttacks.every((entry) => NEW_ENTRY_FIELDS.every((field) => !(field in entry))),
      dmWeapon
        ? `${JSON.stringify(dmWeapon.mastery)} / ${JSON.stringify(dmWeapon.uses)} against ${corpusAttacks.length} corpus attacks carrying neither`
        : 'no DM action came back',
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
    // The projected flag, which is what lets the DM's control show what is *true* rather
    // than only what pressing it would do. It is `false` in every player row by
    // construction — a reserved row is dropped before anything can project it — so the
    // second half here is not a restatement of the filter above: it is the claim that
    // makes shipping the field at all harmless, and a `true` reaching a player is exactly
    // what it would catch.
    check(
      'the DM’s row carries reserved: true, and every player row carries false',
      dmListAfterReserve.find((row) => row._id === goliath.characterId)?.reserved === true &&
        listAfterReserve.every((row) => row.reserved === false),
      `DM ${JSON.stringify(
        dmListAfterReserve.find((row) => row._id === goliath.characterId)?.reserved,
      )}, player ${JSON.stringify([...new Set(listAfterReserve.map((row) => row.reserved))])}`,
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

    // 28. A GRANT ON A DM-LAYER TOKEN REVEALS NOTHING, AND THE COIN IS WHAT DECIDES —
    // ONE COIN, DRIVEN dm → player → dm.
    //
    // `boardCharacterAccess` builds `controlled` from `visibleTokens` in one pass, so an id
    // cannot enter it on an iteration that did not already put it into `visible`: sight of
    // the token is the precondition for sight of the sheet, structurally rather than by
    // anybody remembering to test the layer. The grant itself is deliberately allowed on a
    // hidden coin — preparing an ambush and handing it over before revealing it is a
    // reasonable order to work in — so what is asserted is not that the write is refused but
    // that it is *inert* until the coin is shown.
    //
    // ⚠️ **This used to add a SECOND coin on the player layer, under a comment saying no
    // mutation re-layered a token. `board.setLayer` exists now, and the rewrite is not
    // tidiness.** Two coins and two grants assert a weaker thing: that a grant on a visible
    // token means something and a grant on a hidden one does not. Two rows can differ in
    // ways nobody wrote down, so the interesting question goes unasked. One coin asks it —
    // **the same row, the same grant, the same bytes in `controllerIds`** — changing what a
    // player may read three times because one unrelated field moved, and nothing else was
    // written anywhere. That the stored grant is untouched in both directions is
    // `setTokenLayer`'s stated contract, and it is what makes the round trip usable rather
    // than destructive.
    //
    // ADR 0009 promises this round trip is "asserted twice, in the two places this project
    // asserts secrets". Until this milestone the two places were asserting two different
    // things, and the local suite's half flipped the layer behind the API with
    // `ctx.db.patch`. It is the **same round trip in both** now: `characters.test.ts` drives
    // it through `board.setLayer` too.
    //
    // The third state is the one only a round trip settles, and it is the reason the trip
    // has three legs rather than two. A revealed creature's sheet has been **on the wire**
    // to that seat; hiding the coin again has to take it back off, and "already sent" is not
    // a state convex-test has any opinion about — its queries are function calls, not
    // subscriptions somebody is still holding.
    const hiddenToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Shadow Under the Arch',
      layer: 'gm',
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

    // Every reading taken the same way at each of the three states, in one closure, so that
    // nothing but the layer differs between them — a state read two different ways at two
    // different points is a comparison of two questions rather than of two answers. The
    // granted seat's sheet and its vitals row are what the grant is *for*; the player-layer
    // token list and the placement list are what `setTokenLayer` claims go with it; and the
    // serialised grant is the thing that must not move at all.
    const layerState = async () => {
      const row = await tokensOf(hiddenToken.tokenId)
      const vitals = await vitalsFor(seatA.playerId)
      const asPlayer = await client.query('board:tokens', { code })
      const placements = await client.query('board:positions', { code, sceneId })
      return {
        layer: row ? row.layer : null,
        // Serialised rather than compared element by element, because the claim is
        // byte-identity across three states rather than set membership at each of them.
        granted: JSON.stringify(row ? row.grantedPlayerIds : null),
        sheet: await client.query('characters:sheet', {
          code,
          playerId: seatA.playerId,
          characterId: ambush.characterId,
        }),
        // Not merely a band: an unseen creature contributes no row at all, because the
        // *length* of that array is itself a count of how many monsters are waiting.
        row: vitals.find((entry) => entry.characterId === ambush.characterId) ?? null,
        rows: vitals.length,
        visible: asPlayer.some((entry) => entry._id === hiddenToken.tokenId),
        placed: placements.some((entry) => entry.tokenId === hiddenToken.tokenId),
      }
    }

    const onDmLayer = await layerState()
    check(
      'a grant on a DM-layer coin gave the granted seat nothing — not a sheet, not a row',
      onDmLayer.sheet === null && onDmLayer.row === null && !onDmLayer.visible && !onDmLayer.placed,
      `sheet ${JSON.stringify(onDmLayer.sheet)}, ${onDmLayer.rows} vitals rows, coin visible ${onDmLayer.visible}, placed ${onDmLayer.placed}`,
    )
    // The DM's own view of the same token, so the check above is not passing because the
    // grant was never written in the first place.
    check(
      'the grant was really there — the DM sees it on the hidden coin',
      onDmLayer.layer === 'gm' && onDmLayer.granted === JSON.stringify([seatA.playerId]),
      `positive control — granted ${onDmLayer.granted} on the ${onDmLayer.layer} layer`,
    )

    await client.mutation('board:setLayer', {
      code,
      dmCode,
      tokenId: hiddenToken.tokenId,
      layer: 'player',
    })
    const onPlayerLayer = await layerState()
    check(
      'board:setLayer to the player layer brought the coin, the placement, the sheet and the numbers',
      onPlayerLayer.layer === 'player' &&
        onPlayerLayer.visible &&
        onPlayerLayer.placed &&
        onPlayerLayer.sheet &&
        onPlayerLayer.sheet.name === AMBUSH_NAME &&
        onPlayerLayer.row &&
        onPlayerLayer.row.kind === 'exact' &&
        onPlayerLayer.row.max === AMBUSH_MAX_HP,
      onPlayerLayer.sheet && onPlayerLayer.row
        ? `${onPlayerLayer.row.current}/${onPlayerLayer.row.max} — one field moved, and nothing else was written`
        : `sheet ${JSON.stringify(onPlayerLayer.sheet)}, vitals ${JSON.stringify(onPlayerLayer.row)}`,
    )

    await client.mutation('board:setLayer', {
      code,
      dmCode,
      tokenId: hiddenToken.tokenId,
      layer: 'gm',
    })
    const backOnDmLayer = await layerState()
    check(
      'and back: hiding the coin again took the sheet, the row and the placement off the wire',
      backOnDmLayer.layer === 'gm' &&
        backOnDmLayer.sheet === null &&
        backOnDmLayer.row === null &&
        !backOnDmLayer.visible &&
        !backOnDmLayer.placed,
      `sheet ${JSON.stringify(backOnDmLayer.sheet)}, ${backOnDmLayer.rows} vitals rows against ${onPlayerLayer.rows} while it was shown`,
    )
    // ⚠️ **THE CLAIM THE WHOLE SECTION IS FOR.** Three different answers to "what may this
    // seat read", and one unchanged array of grants behind all three. A deployment that
    // migrated `controllerIds` on a layer change — revoking on the way out, restoring on the
    // way in — would pass every check above and fail this one, and it is the bug that turns
    // "prepare the ambush, hand over the pet, then reveal it" into a grant the DM has to
    // write twice.
    check(
      'the stored grant was byte-identical in all three states — the coin moved, the grant did not',
      onDmLayer.granted === onPlayerLayer.granted &&
        onPlayerLayer.granted === backOnDmLayer.granted &&
        // The positive control: without it three nulls, or three empty arrays from a
        // deployment that never wrote the grant, would agree with each other perfectly.
        onDmLayer.granted === JSON.stringify([seatA.playerId]),
      `${onDmLayer.granted} → ${onPlayerLayer.granted} → ${backOnDmLayer.granted}`,
    )

    // 29. THE DM'S TOKENS TAB: THE FOUR WRITES THAT EDIT A COIN AFTER IT EXISTS.
    //
    // Nothing edited a token before this milestone. `board.addToken` created one and
    // `board.setControllers` handed it round, so a name typed wrong, art at the wrong crop, a
    // coin bound to nothing and a coin on a layer nobody is looking at were all permanent —
    // the DM's only repair was to delete the row and make another. Four mutations fix that,
    // split by **what kind of fact each write is** rather than gathered into one: cosmetics
    // in `updateToken`, the two secrecy fields in `setLayer` and `setCharacter` one at a
    // time, and `setArt` on its own because it is the only token write that destroys data
    // outside the row it patches. Section 28 above is the whole of `setLayer`'s round trip,
    // so this section is the other three, plus the one query in this application a browser
    // may call holding **no credential at all**.
    //
    // ⚠️ **What only a deployment can settle, write by write.** Three of the four are things
    // convex-test cannot be asked rather than things it merely was not asked:
    //
    //   - **`setArt` destroys a blob, and convex-test's file storage is an in-memory stub
    //     keyed on the content hash.** Every upload in this script is the same seventy
    //     bytes, so locally they are *one* entry — and a swap that deleted the wrong blob,
    //     the right blob twice, or neither, all look identical against a store that never
    //     had two. There are no signed URLs to stop resolving either, and "that bearer link
    //     is dead now" is the entire claim being made.
    //   - **`updateToken` is the Milestone 1 bug on a third field.** A lone UTF-16 surrogate
    //     in a token's name is refused by Convex's own *argument* validation, at the
    //     function boundary, before `requireTokenAppearance` ever runs — which is why
    //     `requireText` deliberately carries no surrogate check of its own, and why the
    //     local suite structurally cannot reproduce the refusal. A fractional size and a NaN
    //     are the other half of the same point: both are perfectly ordinary float64s that
    //     survive the boundary and are refused by the handler, and this is where they
    //     actually cross a wire.
    //   - **`setCharacter` clears a binding with `null`, beside an array nobody wrote.**
    //     `undefined` is not a Convex value, so whether *none* comes back as a present key
    //     holding null or as no key at all is a question only a real round trip settles —
    //     and this is the one place in the app where the distinction is real rather than
    //     stylistic. Next to it, `controllerIds` changes with **nothing written to the
    //     token**, which is exactly the derived-value drift this script's field-by-field
    //     comparison exists to name.
    //   - **`games:list` reads every game in the deployment.** Locally that is a fixture
    //     with two rows in it. Here it is seventy-odd real games made by real runs, and the
    //     row this run looks for is one this run inserted — which is also the only way to
    //     find out that a truncated list is truncated from the wrong end.

    // (a) A BLOB THAT IS REALLY GONE.
    //
    // Two real uploads: a real signed URL each time and a real POST of real bytes. The first
    // check is the one the content-hash stub makes unaskable — the same seventy bytes
    // uploaded twice are two blobs with two ids and two URLs — and every claim below is a
    // statement about exactly one of them, so without it they are statements about nothing.
    const firstArt = await uploadPng(client, code, dmCode)
    uploads.push(firstArt)
    const secondArt = await uploadPng(client, code, dmCode)
    uploads.push(secondArt)
    check(
      'the same bytes uploaded twice became two distinct blobs',
      Boolean(firstArt) && Boolean(secondArt) && firstArt !== secondArt,
      `${firstArt} against ${secondArt}`,
    )

    const editable = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Coin the DM Is Still Editing',
      layer: 'player',
      sizeSquares: 1,
      tint: '#8e44ad',
      imageId: firstArt,
      x: 300,
      y: 1500,
    })
    created.push(editable.tokenId)

    // Captured off `board:tokens` as the DM, which is the only place a signed URL is minted
    // — `setArt` deliberately returns null rather than handing one back, because a mutation
    // that minted one would be minting outside the filter that decides who may have it.
    const artBefore = await tokensOf(editable.tokenId)
    const oldArtUrl = artBefore ? artBefore.artUrl : null
    const oldArtFetch = oldArtUrl ? await fetch(oldArtUrl) : null
    check(
      'the coin came back with a signed art URL that resolves',
      oldArtFetch !== null && oldArtFetch.ok,
      oldArtFetch ? `${oldArtFetch.status} from the URL the DM was sent` : 'no art URL came back',
    )

    await client.mutation('board:setArt', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      imageId: secondArt,
    })
    const artAfter = await tokensOf(editable.tokenId)
    const newArtUrl = artAfter ? artAfter.artUrl : null
    const newArtFetch = newArtUrl ? await fetch(newArtUrl) : null
    check(
      'board:setArt pointed the coin at a different URL, and that one resolves',
      newArtUrl !== null && newArtUrl !== oldArtUrl && newArtFetch !== null && newArtFetch.ok,
      newArtFetch
        ? `${newArtFetch.status} from a URL that differs: ${newArtUrl !== oldArtUrl}`
        : 'no new art URL came back',
    )
    // ⚠️ **THE CHECK NOTHING BUT A DEPLOYMENT CAN MAKE.** The URL captured before the swap
    // is a bearer link, unguessable but not permission-checked, and the promise
    // `replaceTokenArt` makes is that the bytes behind it are gone rather than merely
    // unreferenced. A 404 is that promise kept. Anything else — a 200, a 403, a redirect —
    // means a swap left a live copy of the DM's old art behind for whoever had the string,
    // and no local suite can tell the difference because no local suite ever had a URL.
    const staleArtFetch = oldArtUrl ? await fetch(oldArtUrl) : null
    check(
      'the blob it replaced is really gone — the URL captured before the swap now 404s',
      staleArtFetch !== null && staleArtFetch.status === 404,
      staleArtFetch ? `${staleArtFetch.status} from the stale URL` : 'no stale URL to re-fetch',
    )
    // And the reference moved with the pointer, which is what makes the delete above the only
    // one that was ever permitted: `files.discard` refuses a blob a token still points at,
    // through `tokenReferencesImage`, so the only transaction allowed to delete the outgoing
    // art is the one that stopped referencing it.
    await refuses('files:discard refused the new blob, because the coin now references it', () =>
      client.mutation('files:discard', { code, dmCode, imageIds: [secondArt] }),
    )
    // The other half of that, and the property the cleanup registry at the bottom of this
    // file rests on: `discard` returns early when the blob is not in storage, so discarding
    // one `setArt` has already deleted is a no-op rather than a second error on top of the
    // first. Asserted through what it did *not* disturb, because "it did not throw" is a
    // claim the run's own catch already makes.
    await client.mutation('files:discard', { code, dmCode, imageIds: [firstArt] })
    const artAfterDiscard = await tokensOf(editable.tokenId)
    const liveArtFetch = newArtUrl ? await fetch(newArtUrl) : null
    check(
      'discarding the blob setArt had already deleted was a no-op, and left the live art alone',
      artAfterDiscard &&
        artAfterDiscard.artUrl === newArtUrl &&
        liveArtFetch !== null &&
        liveArtFetch.ok,
      liveArtFetch
        ? `${liveArtFetch.status} from the live URL afterwards — this is what makes sweeping the whole upload list safe`
        : 'no live URL to re-fetch',
    )

    // (b) `board:setCharacter`: THE DERIVED HALF, AND THE `null` KEY.
    //
    // The coin is granted to seat B first, so that the two arrays on the payload are
    // genuinely different arrays throughout: `grantedPlayerIds` is what the DM wrote down and
    // `controllerIds` is the rule computed from it, and a rebind moves the second without
    // touching the first. A derived value changing with no write behind it is precisely what
    // `firstDifference`'s field-by-field naming exists to catch — and the reason the stored
    // half must not be migrated is written out at `setTokenCharacter`: a token still listing
    // the seat that played the creature it is no longer bound to is a stale grant that
    // authorises a real drag.
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      playerIds: [seatB.playerId],
    })
    grantedTokens.push(editable.tokenId)
    await client.mutation('board:setCharacter', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      characterId: human.characterId,
    })
    const boundToHero = await tokensOf(editable.tokenId)
    const grantWritten = boundToHero ? JSON.stringify(boundToHero.grantedPlayerIds) : 'no row'
    check(
      'binding a coin to a claimed hero composed the holder into controllerIds and into no grant',
      boundToHero &&
        boundToHero.characterId === human.characterId &&
        boundToHero.controllerIds.length === 2 &&
        boundToHero.controllerIds.includes(seatA.playerId) &&
        boundToHero.controllerIds.includes(seatB.playerId) &&
        grantWritten === JSON.stringify([seatB.playerId]),
      boundToHero
        ? `effective ${JSON.stringify(boundToHero.controllerIds)} against granted ${grantWritten}`
        : 'no token row came back',
    )

    await client.mutation('board:setCharacter', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      characterId: grantedCreature.characterId,
    })
    const rebound = await tokensOf(editable.tokenId)
    check(
      'the rebind dropped the holder from controllerIds while the stored grant did not move',
      rebound &&
        rebound.characterId === grantedCreature.characterId &&
        JSON.stringify(rebound.controllerIds) === JSON.stringify([seatB.playerId]) &&
        JSON.stringify(rebound.grantedPlayerIds) === grantWritten,
      rebound
        ? `effective ${JSON.stringify(rebound.controllerIds)} against granted ${JSON.stringify(rebound.grantedPlayerIds)}, unchanged from ${grantWritten}`
        : 'no token row came back',
    )

    // ⚠️ **`characterId: null` AS A PRESENT KEY.** `undefined` is not a Convex value, so a
    // cleared binding has to become *something* on the way out — `publicTokens` spells it
    // `?? null` for that reason, and the stored document spells it as an absent field. This
    // is the one place in the app where the difference between those two spellings is
    // observable, and only a real round trip can say which one arrives: a payload that
    // dropped the key instead would leave every client reading `token.characterId` as
    // `undefined` and comparing it against `null` for ever afterwards.
    await client.mutation('board:setCharacter', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      characterId: null,
    })
    const unbound = await tokensOf(editable.tokenId)
    check(
      'unbinding came back as a present characterId key holding null, with the grant unmoved',
      unbound &&
        'characterId' in unbound &&
        unbound.characterId === null &&
        JSON.stringify(unbound.grantedPlayerIds) === grantWritten &&
        JSON.stringify(unbound.controllerIds) === JSON.stringify([seatB.playerId]),
      unbound
        ? `keys: ${Object.keys(unbound).sort().join(', ')}, characterId ${JSON.stringify(unbound.characterId)}`
        : 'no token row came back',
    )

    // (c) `board:updateToken`, AND THE MILESTONE 1 BUG CLASS ON A THIRD FIELD.
    //
    // The accepted write first, so the refusals after it have something to have left alone.
    // Compared field by field rather than field at a time, because a rename, a resize and a
    // re-tint are one absolute write — the `scenes.updateGrid` shape — and `firstDifference`
    // names *which* of the three moved instead of reporting that something did.
    const editedAppearance = {
      name: EDITED_TOKEN_NAME,
      sizeSquares: EDITED_TOKEN_SIZE,
      tint: EDITED_TOKEN_TINT,
    }
    const appearanceOf = (token) =>
      token === null
        ? null
        : { name: token.name, sizeSquares: token.sizeSquares, tint: token.tint }

    await client.mutation('board:updateToken', {
      code,
      dmCode,
      tokenId: editable.tokenId,
      ...editedAppearance,
    })
    const renamed = await tokensOf(editable.tokenId)
    const appearanceDrift = renamed
      ? firstDifference(editedAppearance, appearanceOf(renamed), 'appearance')
      : 'no token row came back'
    check(
      `board:updateToken round-tripped a name at exactly ${MAX_TOKEN_NAME_LENGTH} code units, astral pairs and all`,
      appearanceDrift === null &&
        // Asserted rather than trusted: an innocent edit to the fixture is exactly how a
        // boundary test stops sitting on the boundary, and the two counts differing is the
        // whole reason this name is the one being sent.
        EDITED_TOKEN_NAME.length === MAX_TOKEN_NAME_LENGTH &&
        [...EDITED_TOKEN_NAME].length < MAX_TOKEN_NAME_LENGTH,
      appearanceDrift ??
        `${EDITED_TOKEN_NAME.length} code units, ${[...EDITED_TOKEN_NAME].length} code points, ${EDITED_TOKEN_SIZE} squares, tint ${renamed.tint}`,
    )

    // THE MILESTONE 1 BUG ITSELF. A lone high surrogate is a perfectly ordinary
    // one-character string to `requireText` — which is why that function deliberately does
    // not test for one — so this refusal comes from Convex's argument validation at the
    // function boundary, before any handler runs. Nothing in the local suite can produce it.
    await refuses('board:updateToken refused a lone UTF-16 surrogate in the name', () =>
      client.mutation('board:updateToken', {
        code,
        dmCode,
        tokenId: editable.tokenId,
        ...editedAppearance,
        name: 'Half an emoji: \uD800',
      }),
    )
    // And the other mechanism, on the field beside it. 1.5 and NaN are both perfectly good
    // float64s, so both sail through the argument validator and are refused by
    // `isUsableTokenSize` instead — which tests `Number.isInteger`, already false for NaN,
    // which is why `updateToken` carries no `requireFinite` of its own. A suite that does not
    // apply value validation cannot tell those two refusals apart from each other or from
    // the one above; this is where all three actually cross a wire.
    for (const [label, sizeSquares] of [
      ['a fractional token size', 1.5],
      ['NaN as a token size', Number.NaN],
    ]) {
      await refuses(`board:updateToken refused ${label}`, () =>
        client.mutation('board:updateToken', {
          code,
          dmCode,
          tokenId: editable.tokenId,
          ...editedAppearance,
          sizeSquares,
        }),
      )
    }
    const survivingAppearance = await tokensOf(editable.tokenId)
    const survivorDrift = survivingAppearance
      ? firstDifference(editedAppearance, appearanceOf(survivingAppearance), 'appearance')
      : 'no token row came back'
    check(
      'every refused edit left the coin exactly as the accepted one had left it',
      survivorDrift === null,
      survivorDrift ?? `still ${survivingAppearance.sizeSquares} squares, tint ${survivingAppearance.tint}`,
    )

    // (d) `games:list` AND `games:checkDmCode`: THE FIRST READS A BROWSER MAKES HOLDING
    // NOTHING AT ALL.
    //
    // Every other query in this file is scoped to one game by a code somebody typed.
    // `games:list` takes **no arguments**, reads across the whole deployment, and is
    // subscribed to by every idle browser that loads the site — so it is the first payload in
    // this application whose audience is *anyone*, and the only cross-game read available
    // with no credential of any kind. That makes it worth a real round trip twice over: the
    // rows it returns were written by other runs and other people rather than by a fixture,
    // and the `returns:` validator that keeps the three DM secrets out of it is derived by
    // subtraction from a projection built for a different audience.
    const seatsBeforeCheck = await client.query('players:list', { code })
    const listing = await client.query('games:list', {})
    const listedRow = listing.find((row) => row.name === gameName) ?? null
    check(
      'games:list carried this run’s own game, named and attributed',
      listedRow !== null &&
        listedRow.createdByName === SMOKE_DM_NAME &&
        listedRow.status === 'lobby',
      listedRow
        ? `positive control — ${listing.length} rows, this one run by ${JSON.stringify(listedRow.createdByName)}`
        : `not among ${listing.length} rows, so either the list is truncated from the wrong end or this run's game is not in it`,
    )
    // ⚠️ **THE KEY SET IS WHAT HOLDS, AND THE SUBSTRING SCAN IS THE WEAKER HALF.** A join
    // code is six characters out of a thirty-one letter alphabet, so it can occur by chance
    // inside a document id — the same class of trap `OPAQUE_KEYS` exists for, which is why
    // the scan below runs over the redacted copy. What actually forbids a code is the *shape*
    // of the row, and the shape is a subtraction: `publicGameListingValidator` is
    // `publicGameValidator.omit('code', 'activeSceneId')`, so a new **non-secret** field
    // added upstream for the audience that holds a join code would arrive here silently and
    // widen the audience that holds nothing. Pinning the five names is the only thing
    // standing between an upstream addition and an audience nobody chose.
    const listingKeys = listedRow ? Object.keys(listedRow).sort().join(',') : 'no row'
    check(
      'a landing-page row carries exactly five keys, and `code` is not one of them',
      listingKeys === '_creationTime,_id,createdByName,name,status',
      `keys: ${listingKeys}`,
    )
    const listingSerialised = JSON.stringify(redactOpaque(listing))
    check(
      'no join code, DM code, salt or recovery hash appears anywhere in the landing payload',
      !listing.some((row) => 'code' in row || 'dmCode' in row) &&
        !listingSerialised.includes(code) &&
        !listingSerialised.includes(dmCode) &&
        !listingSerialised.includes('dmRecovery') &&
        // The positive control, and it is the load-bearing half: without it every scan here
        // passes on an empty array, which is exactly what a broken query returns.
        listingSerialised.includes(gameName),
      `${listing.length} rows scanned for ${code} and for an eight-character DM code — positive control included`,
    )

    // `checkDmCode` is a new oracle and answers a bare boolean, which is the whole of its
    // design: no game, no code, no seat, nothing a caller could mistake for proof. A `true`
    // authorises nothing — `requireDm` re-checks the code on every single call it gates
    // (CLAUDE.md invariant 7) — and it expires the moment it is read.
    const twiddledDmCode = `${dmCode[0] === 'A' ? 'B' : 'A'}${dmCode.slice(1)}`
    const verdicts = {
      right: await client.query('games:checkDmCode', { code, dmCode }),
      twiddled: await client.query('games:checkDmCode', { code, dmCode: twiddledDmCode }),
      unknownGame: await client.query('games:checkDmCode', { code: UNKNOWN_JOIN_CODE, dmCode }),
    }
    check(
      'games:checkDmCode said true for the code, and false for a twiddle and an unknown game',
      verdicts.right === true &&
        verdicts.twiddled === false &&
        verdicts.unknownGame === false &&
        // Bare booleans rather than anything truthy: the return validator is `v.boolean()`
        // and a caller writing `if (verdict)` must not be able to be handed a payload.
        Object.values(verdicts).every((verdict) => typeof verdict === 'boolean'),
      `${JSON.stringify(verdicts)} — the twiddle is the same length and the same alphabet, one character out`,
    )
    // ⚠️ **AND IT CREATED NO SEAT.** A query cannot write, which is exactly why this is a
    // query: the DM badge follows a seat, this call is made before anybody has chosen a
    // display name, and `elevateDm` stays the only thing that moves the badge. That is a
    // statement about every future edit to the function rather than about today's body, and
    // the deployment is what enforces it — so the roster is compared before and after,
    // unredacted, because a seat created and a seat renamed are both changes worth failing on.
    const seatsAfterCheck = await client.query('players:list', { code })
    check(
      'asking three times created no seat and renamed none',
      JSON.stringify(seatsBeforeCheck) === JSON.stringify(seatsAfterCheck) &&
        // The positive control: two empty rosters would agree perfectly. This game has the
        // DM's own seat and the three this run joined.
        seatsBeforeCheck.length > 1,
      `${seatsBeforeCheck.length} seats before, ${seatsAfterCheck.length} after — positive control included`,
    )

    // 30. ROLLS AND THE FEED: THE DEEPEST NESTED VALUE THIS APPLICATION STORES, AND THE
    // FIRST ROWS IT CANNOT TAKE BACK.
    //
    // Every stored shape before this one is at most an object of scalars inside an optional
    // field. A feed row is **a six-member `v.union` of objects beside an object holding a
    // `v.array(v.object(…))`**, with two nested `number | null` unions and a three-member
    // literal union inside that — one write crossing five levels of validator, twenty-two
    // times over in this section. `v.union` next to `v.array(v.object(…))` is precisely where
    // a value convex-test stores without comment is refused by a real deployment, so the job
    // here is round trips through genuine value validation rather than logic coverage.
    //
    // ⚠️ **The absence half is what this section is really for, and it comes in pairs like
    // every other trap this script has caught.** `roll: null` on a passive and on an
    // alt-clicked description, and `subject.text: null` on the three parts of an entry that
    // are not the description, are **values on this table rather than absent keys** —
    // deliberately, because `writeFeedRow` demands every field of its caller and spells the
    // two that can be empty as `null`. That is the stronger convention and it is only worth
    // having if a deployment actually honours it: a payload that dropped the key instead
    // leaves every client in the application reading `row.roll === undefined` and comparing
    // it against `null` for ever afterwards. `firstDifference` reports
    // `present on one side only`; a value check cannot tell the two apart, which is why the
    // round trips below are diffs rather than comparisons.
    //
    // ⚠️ **NOTHING THIS SECTION WRITES TO THE FEED IS SWEPT BY THE CLEANUP BELOW, AND THAT
    // IS A DECISION RATHER THAN A GAP.** A feed row is the first thing this script creates
    // with no delete path a client can reach. Two thirds of it does go: `characters.remove`
    // calls `deleteFeedForCharacter`, so every line naming the hero or the creature made
    // below leaves with them on the registry that already exists. What stays is the
    // **ad-hoc** rolls — a dice-tray line names a seat and no character, so there is no
    // document for its removal to hang off. `purgeGame` in `convex/admin.ts` would take
    // them, and it is an `internalMutation` on purpose: reaching it means holding deploy
    // credentials this script deliberately does not use, because it authenticates with a
    // game code over `ConvexHttpClient` like any other client. Inventing a public delete
    // mutation to tidy up after a test would put "who may erase what the table saw" back on
    // the table, and that question wants an ADR. So the litter is swept by the broom:
    // `npm run prune-games` counts `feed line(s)` now, and the note in `finally` says so.

    // (a) THE TWO SHEETS, AND A COIN NOBODY IS LOOKING AT.
    //
    // The creature's coin goes on the **DM layer**, which is the state the secrecy half of
    // this section is about: `mayHearOf` admits a creature whose token the caller can already
    // see and refuses one it cannot, so a prepared encounter rolls nothing the table hears
    // about until the coin is out. Created before any rolling so that every row written below
    // is written against a board in one known state.
    const roller = await client.mutation('characters:create', {
      code,
      dmCode,
      name: ROLL_HERO_NAME,
      sheet: ROLL_HERO_SHEET,
    })
    createdCharacters.push(roller.characterId)
    const feedCreature = await client.mutation('characters:create', {
      code,
      dmCode,
      name: FEED_CREATURE_NAME,
      sheet: FEED_CREATURE_SHEET,
    })
    createdCharacters.push(feedCreature.characterId)
    const feedToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Deliberately not the character's name, for the reason sections 10, 20 and 27 all
      // give: what is written on a coin is public by design, so reusing the name would make
      // the scan below unable to tell a leak from the thing it is meant to allow.
      name: 'Something Coiled',
      layer: 'gm',
      sizeSquares: 3,
      tint: '#145a32',
      characterId: feedCreature.characterId,
      x: 1200,
      y: 300,
    })
    created.push(feedToken.tokenId)

    // The eight expressions read back off the stored document rather than off the fixture,
    // which is the half that makes `roll.expression` assertable at all: the claim below is
    // that what came back is what was *stored*, and a fixture compared against itself would
    // be a claim about nothing.
    const rollerStored = await readSheet(roller.characterId)
    const rollerEntries = rollerStored
      ? [...rollerStored.sheet.feats, ...rollerStored.sheet.spells]
      : []
    const expressionsFor = (source) =>
      Object.fromEntries(
        ROLL_SHAPES.map((shape) => {
          const entry = source.find((candidate) => candidate.id === shape.entryId)
          return [
            `${shape.entryId}.${shape.part}`,
            entry === undefined
              ? null
              : shape.part === 'toHit'
                ? entry.toHit ?? null
                : entry.roll,
          ]
        }),
      )
    const expressionDrift = rollerStored
      ? firstDifference(
          Object.fromEntries(
            ROLL_SHAPES.map((shape) => [`${shape.entryId}.${shape.part}`, shape.expression]),
          ),
          expressionsFor(rollerEntries),
          'stored',
        )
      : 'no sheet came back'
    check(
      `all ${ROLL_SHAPES.length} expression shapes survived onto the stored sheet, byte for byte`,
      expressionDrift === null,
      expressionDrift ??
        `read back off the document, so the rolls below are asserted against what is stored rather than against the fixture`,
    )

    // (b) ONE ROLL OF EVERY EXPRESSION SHAPE, AND EVERY OTHER ROLL THIS SECTION NEEDS.
    //
    // Written first and read once. Twenty-two mutations then one query, rather than a query
    // after each, because `visibleFeed`'s window is the newest sixty rows and every row this
    // section wants is inside it — so a single read is a cheaper *and* stricter statement:
    // the assertions below are about a whole feed rather than about whatever the last call
    // happened to return.
    const rollEntry = (entryId, part, extra = {}) =>
      client.mutation('feed:roll', {
        code,
        dmCode,
        characterId: roller.characterId,
        request: { kind: 'entry', entryId, part },
        mode: 'flat',
        dmOnly: false,
        ...extra,
      })
    const rollRequest = (characterId, request, extra = {}) =>
      client.mutation('feed:roll', {
        code,
        dmCode,
        characterId,
        request,
        mode: 'flat',
        dmOnly: false,
        ...extra,
      })
    const trayRoll = (expression, extra = {}) =>
      client.mutation('feed:rollDice', {
        code,
        expression,
        mode: 'flat',
        dmOnly: false,
        playerId: seatA.playerId,
        ...extra,
      })

    for (const shape of ROLL_SHAPES) {
      await rollEntry(shape.entryId, shape.part)
    }
    // The two parts that roll nothing: a passive being declared, and the alt-click that is
    // the description arriving.
    await rollEntry('roll-passive', 'use')
    await rollEntry('roll-weapon', 'text')
    // The four shapes built by `toHitFromBonus` off the sheet rather than read out of it.
    // Arcana is the interesting one: INT 10 and no proficiency is a bonus of exactly zero,
    // which that function spells as a bare `1d20` rather than the `1d20+0` the grammar would
    // have accepted.
    await rollRequest(roller.characterId, { kind: 'check', ability: 'con' })
    await rollRequest(roller.characterId, { kind: 'save', ability: 'dex' })
    await rollRequest(roller.characterId, { kind: 'skill', skill: 'arcana' })
    await rollRequest(roller.characterId, { kind: 'initiative' })
    // Initiative on a creature, which is the one of the four a reduced sheet can answer —
    // and it answers it from a stored bonus of −7, so this is `1d20-7` crossing a wire.
    await rollRequest(feedCreature.characterId, { kind: 'initiative' })
    // The creature's own two clicks, still behind a DM-layer coin.
    await rollRequest(feedCreature.characterId, { kind: 'entry', entryId: 'feed-coil', part: 'toHit' })
    await rollRequest(feedCreature.characterId, { kind: 'entry', entryId: 'feed-coil', part: 'roll' })
    // Advantage, which is the only way `dropped` is ever a number rather than a null.
    await rollEntry('roll-weapon', 'toHit', { mode: 'advantage' })
    // The dice tray, twice over: one accepted expression and one that has to be normalised
    // on the way in. Both under a player's seat, because an ad-hoc roll is announced as the
    // person and there is no version of that sentence with the seat missing.
    await trayRoll('4d6+2')
    await trayRoll('2d6 + 3')
    // The DM's private line, which nobody else may ever be told about. Rolled under the DM's
    // own seat, which `games:create` made in the same transaction as the game — a dice-tray
    // line is announced as the *person*, so it needs a seat where a sheet roll does not.
    const dmSeat = (await client.query('players:list', { code })).find((row) => row.isDm) ?? null
    check(
      'the DM has a seat of their own to roll the tray under',
      dmSeat !== null,
      dmSeat ? `${dmSeat.displayName}, carrying the badge` : 'no seat carried isDm',
    )
    if (dmSeat) {
      await client.mutation('feed:rollDice', {
        code,
        dmCode,
        expression: DM_ONLY_ROLL,
        mode: 'flat',
        dmOnly: true,
        playerId: dmSeat._id,
      })
    }

    const dmFeed = await client.query('feed:list', { code, dmCode })
    // The feed comes back **oldest first**, so the row a roll wrote is the newest match.
    // Matched on the subject and the expression rather than by position, because a row a
    // caller may not read still occupied a place in the window it was taken from — which is
    // the whole reason `visibleFeed` takes its sixty before it filters.
    const lastRow = (rows, predicate) => [...rows].reverse().find(predicate) ?? null

    for (const shape of ROLL_SHAPES) {
      const row = lastRow(
        dmFeed,
        (candidate) =>
          candidate.subject.kind === 'entry' &&
          candidate.subject.part === shape.part &&
          candidate.roll !== null &&
          candidate.roll.expression === shape.expression &&
          candidate.roll.mode === 'flat',
      )
      const drift = row
        ? firstDifference(expectedRollOf(row, shape), row.roll, 'roll')
        : 'no row came back'
      check(
        `feed:roll landed ${shape.label} — ${shape.expression}`,
        drift === null,
        drift ??
          `${shape.count}d${shape.faces} on [${row.roll.dice.map((die) => die.value).join(', ')}] ${
            shape.modifier < 0 ? '−' : '+'
          } ${Math.abs(shape.modifier)} = ${row.roll.total}`,
      )
    }

    // (c) THE EXACT KEY SETS, WHICH ARE THE POINT AND NOT THE VALUES.
    //
    // ⚠️ **A field silently discarded on write is what this whole script exists to find**,
    // and a value check cannot see one: a row missing `crit` still has a plausible total, and
    // a subject missing `level` still names the right spell. So the shape is pinned by name
    // at all three depths — the row, the roll inside it, and one die inside that — against
    // lists hand-copied out of the four validators. Compared as sorted strings so a failure
    // prints both sides.
    const damageShape = ROLL_SHAPES.find((shape) => shape.expression === '1d8+STR+2')
    const damageRow = lastRow(
      dmFeed,
      (row) => row.roll !== null && row.roll.expression === damageShape.expression,
    )
    const rowKeys = damageRow ? Object.keys(damageRow).sort().join(',') : 'no row'
    const rollKeys = damageRow && damageRow.roll ? Object.keys(damageRow.roll).sort().join(',') : 'no roll'
    const dieKeys =
      damageRow && damageRow.roll && damageRow.roll.dice.length > 0
        ? Object.keys(damageRow.roll.dice[0]).sort().join(',')
        : 'no die'
    check(
      'a feed row carries exactly eight keys, its roll seven of its own, and a die exactly two',
      rowKeys === FEED_ROW_KEYS && rollKeys === FEED_ROLL_KEYS && dieKeys === FEED_DIE_KEYS,
      `row: ${rowKeys} · roll: ${rollKeys} · die: ${dieKeys}`,
    )

    // AND THE WHOLE ROW AS ONE DIFF, which is the instrument that caught the
    // discarded-field bug twice. `_id` and `createdAt` are copied across for the reason
    // `OPAQUE_KEYS` exists — a document id and a creation timestamp are the two fields on
    // this row nothing but the deployment can know — and every other field, at every depth,
    // is this script's own.
    const wantedDamageRow = damageRow && {
      _id: damageRow._id,
      createdAt: damageRow.createdAt,
      characterId: roller.characterId,
      actorName: ROLL_HERO_NAME,
      dmOnly: false,
      // Every widening this run performs — a coin off the GM layer, a character bound to a
      // visible one, a reservation lifted — happens in an earlier section than this one, so
      // a roll made here is newer than the game's reveal clock and says so. The other half
      // of the claim is asserted at the reveal itself further down: the coin comes off the
      // GM layer and the three lines it publishes all come back `true`.
      predatesReveal: false,
      subject: {
        kind: 'entry',
        part: 'roll',
        name: ROLL_WEAPON_NAME,
        category: 'weapon',
        level: null,
        text: null,
      },
      roll: expectedRollOf(damageRow, damageShape),
    }
    const rowDrift = damageRow
      ? firstDifference(wantedDamageRow, damageRow, 'feed')
      : 'no row came back'
    check(
      'a whole feed row round-tripped field for field, five levels of validator deep',
      rowDrift === null,
      rowDrift ?? `${ROLL_HERO_NAME} rolling ${damageShape.expression} for their ${ROLL_WEAPON_NAME}`,
    )

    // EVERY SUBJECT KIND THROUGH THE UNION, each diffed rather than sampled — so
    // `subject.text: null` on the three parts of an entry that are not the description is
    // asserted **by name** on every one of them, and a `level` of the number zero is
    // distinguished from a level that never arrived.
    const subjectCases = [
      {
        label: 'entry × toHit',
        actorName: ROLL_HERO_NAME,
        expression: '1d20+STR+PROF',
        subject: {
          kind: 'entry',
          part: 'toHit',
          name: ROLL_WEAPON_NAME,
          category: 'weapon',
          level: null,
          text: null,
        },
      },
      {
        label: 'entry × roll, a weapon’s damage',
        actorName: ROLL_HERO_NAME,
        expression: '1d8+STR+2',
        subject: {
          kind: 'entry',
          part: 'roll',
          name: ROLL_WEAPON_NAME,
          category: 'weapon',
          level: null,
          text: null,
        },
      },
      {
        // The cantrip, and the reason it is here rather than folded into the row above: a
        // spell level of **the number zero** is the one value on this union that a
        // deployment treating null and absent as interchangeable would get right by luck.
        label: 'entry × roll, a cantrip at level 0',
        actorName: ROLL_HERO_NAME,
        expression: '1d20+WIS+PROF',
        subject: {
          kind: 'entry',
          part: 'roll',
          name: ROLL_CANTRIP_NAME,
          category: 'action',
          level: 0,
          text: null,
        },
      },
      {
        label: 'entry × use',
        actorName: ROLL_HERO_NAME,
        subject: {
          kind: 'entry',
          part: 'use',
          name: ROLL_PASSIVE_NAME,
          category: 'passive',
          level: null,
          text: null,
        },
      },
      {
        // The one part that carries prose, so the whole string has to travel — non-ASCII,
        // em dash and all.
        label: 'entry × text, the alt-click',
        actorName: ROLL_HERO_NAME,
        subject: {
          kind: 'entry',
          part: 'text',
          name: ROLL_WEAPON_NAME,
          category: 'weapon',
          level: null,
          text: ROLL_WEAPON_TEXT,
        },
      },
      {
        label: 'check',
        actorName: ROLL_HERO_NAME,
        expression: '1d20+2',
        subject: { kind: 'check', ability: 'con' },
      },
      {
        // Proficient in Dexterity saves: +1 for the score and +4 for the level.
        label: 'save',
        actorName: ROLL_HERO_NAME,
        expression: '1d20+5',
        subject: { kind: 'save', ability: 'dex' },
      },
      {
        // A bare `1d20`, which is `toHitFromBonus`'s zero branch: `ROLL_PATTERN` would have
        // accepted `1d20+0`, so the grammar is not what forbids it.
        label: 'skill',
        actorName: ROLL_HERO_NAME,
        expression: '1d20',
        subject: { kind: 'skill', skill: 'arcana' },
      },
      {
        label: 'initiative, on a hero',
        actorName: ROLL_HERO_NAME,
        expression: '1d20+1',
        subject: { kind: 'initiative' },
      },
      {
        // The same subject on a creature, off a stored bonus rather than a Dexterity score,
        // and negative — so this is the one row in the game whose expression has a minus in
        // it.
        label: 'initiative, on a creature',
        actorName: FEED_CREATURE_NAME,
        expression: '1d20-7',
        subject: { kind: 'initiative' },
      },
      {
        label: 'dice, from the tray',
        actorName: 'Smoke Player A',
        expression: '4d6+2',
        subject: { kind: 'dice' },
      },
    ]
    const subjectProblems = subjectCases
      .map((wanted) => {
        const row = lastRow(
          dmFeed,
          (candidate) =>
            candidate.actorName === wanted.actorName &&
            candidate.subject.kind === wanted.subject.kind &&
            (wanted.subject.part === undefined ||
              candidate.subject.part === wanted.subject.part) &&
            (wanted.expression === undefined ||
              (candidate.roll !== null && candidate.roll.expression === wanted.expression)),
        )
        if (!row) return `${wanted.label}: no row came back`
        const keys = Object.keys(row.subject).sort().join(',')
        if (keys !== FEED_SUBJECT_KEYS[wanted.subject.kind]) {
          return `${wanted.label}: subject keys ${keys}, wanted ${FEED_SUBJECT_KEYS[wanted.subject.kind]}`
        }
        return firstDifference(wanted.subject, row.subject, `${wanted.label}.subject`)
      })
      .filter((problem) => problem !== null)
    check(
      `all six subject kinds came back, over ${subjectCases.length} rows, with the exact key set each one’s branch of the union names`,
      subjectProblems.length === 0,
      subjectProblems.length > 0
        ? JSON.stringify(subjectProblems)
        : `entry × four parts, check, save, skill, initiative on a hero and on a creature, and the tray`,
    )

    // (d) `roll: null` AS A PRESENT KEY — THE OTHER HALF OF THE TRAP.
    //
    // ⚠️ Asserted on the **key** rather than on the value, exactly as sections 6 and 23 do
    // for `category`, `toHit` and `group`, and for the opposite reason: those three are
    // absent when they are empty and this one is present holding null, so the two families
    // of check are each other's control. `row.roll === null` is also true of a key that
    // never arrived, which is why the eight-key set is re-asserted on both rows beside it.
    const useRow = lastRow(dmFeed, (row) => row.subject.kind === 'entry' && row.subject.part === 'use')
    const textRow = lastRow(dmFeed, (row) => row.subject.kind === 'entry' && row.subject.part === 'text')
    check(
      'a declared passive and an alt-clicked description both came back with a present roll key holding null',
      useRow &&
        'roll' in useRow &&
        useRow.roll === null &&
        Object.keys(useRow).sort().join(',') === FEED_ROW_KEYS &&
        textRow &&
        'roll' in textRow &&
        textRow.roll === null &&
        Object.keys(textRow).sort().join(',') === FEED_ROW_KEYS,
      useRow && textRow
        ? `use: ${JSON.stringify(useRow.roll)} over ${Object.keys(useRow).length} keys, text: ${JSON.stringify(textRow.roll)} over ${Object.keys(textRow).length}`
        : `use ${JSON.stringify(useRow)}, text ${JSON.stringify(textRow)}`,
    )

    // AND `dropped` AS A NUMBER, which is the only state that union's other member ever
    // takes. Advantage keeps the higher of two d20s and reports the other, so the kept die
    // is never below the dropped one and the total is the kept die plus the modifier — three
    // statements about one row that a deployment storing the wrong die would fail.
    const advantageRow = lastRow(dmFeed, (row) => row.roll !== null && row.roll.mode === 'advantage')
    const advantageDice = advantageRow ? advantageRow.roll.dice : []
    check(
      'advantage kept one d20 and reported the other in dropped, as a number',
      advantageRow &&
        advantageDice.length === 1 &&
        advantageDice[0].faces === 20 &&
        typeof advantageRow.roll.dropped === 'number' &&
        advantageRow.roll.dropped >= 1 &&
        advantageRow.roll.dropped <= 20 &&
        advantageDice[0].value >= advantageRow.roll.dropped &&
        advantageRow.roll.total === advantageDice[0].value + 8 &&
        advantageRow.roll.crit === critFor(advantageDice),
      advantageRow
        ? `kept ${advantageDice[0].value}, dropped ${advantageRow.roll.dropped}, total ${advantageRow.roll.total}, crit ${JSON.stringify(advantageRow.roll.crit)}`
        : 'no advantage row came back',
    )

    // (e) THE AMBUSH, AGAINST THE REAL THING.
    //
    // Three fetches that hold nothing, one that holds a wrong guess, and a positive control
    // — because a scan with nothing to find passes on a deployment that sent nobody anything,
    // which is the discipline every secrecy check in this file keeps. The needles are the
    // creature's name, the name of the entry that was clicked and both of its expressions;
    // 113 and 117 are scanned as text over the redacted copy *and* as numbers at every depth,
    // for the reason section 10 gives.
    const feedNeedles = [
      FEED_CREATURE_NAME,
      FEED_CREATURE_ENTRY_NAME,
      FEED_CREATURE_TO_HIT,
      FEED_CREATURE_DAMAGE,
    ]
    const uncredentialled = [
      ['no credential at all', await client.query('feed:list', { code })],
      ['an empty dmCode', await client.query('feed:list', { code, dmCode: '' })],
      ['a well-formed wrong dmCode', await client.query('feed:list', { code, dmCode: 'not-the-dm-code' })],
      // No fourth credential shape naming a seat: `feed:list` does not accept one, because a
      // grant cannot widen the feed beyond sight and a seat therefore cannot change the
      // answer. See `mayHearOf`. Passing one here would be an argument-validation refusal
      // rather than a payload to scan.
    ]
    const feedLeaks = uncredentialled.flatMap(([label, rows]) => {
      const serialised = JSON.stringify(redactOpaque(rows))
      return [
        ...feedNeedles.filter((needle) => serialised.includes(needle)).map((needle) => `${label}: ${needle}`),
        ...[FEED_CREATURE_TO_HIT_BONUS, FEED_CREATURE_DAMAGE_BONUS]
          .filter((number) => serialised.includes(String(number)) || holdsNumber(rows, number))
          .map((number) => `${label}: ${number}`),
      ]
    })
    const dmSerialised = JSON.stringify(redactOpaque(dmFeed))
    check(
      'not one line about the hidden creature reached a caller without the DM code',
      feedLeaks.length === 0 &&
        // The positive control, and the load-bearing half: without it every scan above
        // passes on a query that returned an empty array to everybody.
        feedNeedles.every((needle) => dmSerialised.includes(needle)) &&
        holdsNumber(dmFeed, FEED_CREATURE_DAMAGE_BONUS),
      feedLeaks.length > 0
        ? `leaked ${JSON.stringify(feedLeaks)}`
        : `${uncredentialled.length} payloads scanned for four needles and two numbers, against a DM feed of ${dmFeed.length} rows that holds all six`,
    )

    // ⚠️ **THE ASSERTION THAT PROVES THE RULE IS LIVE RATHER THAN ALWAYS-FALSE.** Everything
    // above would pass identically against a `feed:list` that answered the empty array for
    // anyone but the DM. One write to the coin's layer — nothing touched on the character,
    // nothing rewritten on the rows — and the same three lines are readable by a browser
    // holding no credential whatsoever, because `mayHearOf` follows the token. This is
    // `board.setLayer` and the feed's visibility rule meeting for the first time.
    await client.mutation('board:setLayer', {
      code,
      dmCode,
      tokenId: feedToken.tokenId,
      layer: 'player',
    })
    const revealedFeed = await client.query('feed:list', { code })
    const revealedRows = revealedFeed.filter((row) => row.actorName === FEED_CREATURE_NAME)
    const revealedSerialised = JSON.stringify(redactOpaque(revealedFeed))
    check(
      'showing the coin published the three lines it had already rolled, to a caller holding nothing',
      revealedRows.length === 3 &&
        feedNeedles.every((needle) => revealedSerialised.includes(needle)),
      `${revealedRows.length} lines: ${JSON.stringify(revealedRows.map((row) => (row.roll ? row.roll.expression : null)))}`,
    )

    // ⚠️ **AND THAT THEY ARRIVED MARKED AS HISTORY, WHICH IS THE ONE FIELD ONLY A REAL
    // DEPLOYMENT CAN JUDGE.** `predatesReveal` is a comparison between two wall-clock
    // readings taken minutes apart by the *server* — `_creationTime` when the dice were
    // rolled, and `games.revealedAt` when `board:setLayer` stamped it — so it is exactly the
    // shape of claim this script exists for and the local suite has to fake a clock to make.
    // Without it `TableEffects` throws dice over the map for every roll a creature made
    // while it was hidden, at the moment it stops being hidden.
    //
    // ⚠️ **The whole payload flips, hero's lines included, and that is the coarse clock
    // working rather than a bug.** One stamp per game, not one per token: a roll made in the
    // second before an unrelated reveal loses its flourish, which is a missing animation and
    // never a wrong one. So the negative control cannot be a row in *this* payload — it is
    // the whole-row diff further up, taken off `dmFeed` before any of this and pinning
    // `predatesReveal: false` field for field. A flag stuck at either value fails one of the
    // two.
    check(
      'every line the reveal published came back marked as predating it',
      revealedRows.length === 3 && revealedRows.every((row) => row.predatesReveal === true),
      `${revealedRows.length} lines marked ${JSON.stringify(revealedRows.map((row) => row.predatesReveal))}`,
    )

    // And back off again, which is the leg only a round trip settles: those lines have been
    // **on the wire** to that browser, and hiding the coin has to take them back off.
    // Section 28 makes the same three-legged trip over a sheet and its hit points.
    await client.mutation('board:setLayer', {
      code,
      dmCode,
      tokenId: feedToken.tokenId,
      layer: 'gm',
    })
    const rehiddenFeed = await client.query('feed:list', { code })
    const rehiddenSerialised = JSON.stringify(redactOpaque(rehiddenFeed))
    check(
      'hiding it again took all three back off the wire, and left every other line alone',
      !rehiddenFeed.some((row) => row.actorName === FEED_CREATURE_NAME) &&
        !feedNeedles.some((needle) => rehiddenSerialised.includes(needle)) &&
        // The positive control: an empty feed would satisfy both scans above perfectly.
        rehiddenSerialised.includes(ROLL_HERO_NAME),
      `${revealedFeed.length} rows while it was shown, ${rehiddenFeed.length} after — positive control included`,
    )

    // (f) A PRIVATE ROLL, WHICH IS AN UNRELATED QUESTION ABOUT THE ROW RATHER THAN ABOUT THE
    // CHARACTER ON IT.
    //
    // `dmOnly` travels on the payload, deliberately — it is the difference between a line the
    // table saw and a line only the DM did, and a player never receives a row carrying `true`
    // because `visibleFeed` dropped it. Both halves are asserted: the flag is absent from
    // every player row, and it is `true` on the DM's own copy.
    const playerFeed = await client.query('feed:list', { code })
    const privateRow = lastRow(dmFeed, (row) => row.roll !== null && row.roll.expression === DM_ONLY_ROLL)
    const playerSerialised = JSON.stringify(redactOpaque(playerFeed))
    check(
      'the DM’s private roll reached the DM as dmOnly: true and reached no player at all',
      privateRow &&
        privateRow.dmOnly === true &&
        privateRow.characterId === null &&
        !playerSerialised.includes(DM_ONLY_ROLL) &&
        !holdsNumber(playerFeed, DM_ONLY_BONUS) &&
        playerFeed.every((row) => row.dmOnly === false) &&
        // The positive control again: an empty player feed would pass all three scans.
        playerSerialised.includes(ROLL_HERO_NAME),
      privateRow
        ? `${privateRow.actorName} rolled ${privateRow.roll.expression} for ${privateRow.roll.total}; ${playerFeed.length} player rows, all dmOnly false`
        : 'no private row came back to the DM',
    )
    await refuses('feed:rollDice refused a private roll to a seat with no DM code', () =>
      client.mutation('feed:rollDice', {
        code,
        expression: '1d6',
        mode: 'flat',
        dmOnly: true,
        playerId: seatA.playerId,
      }),
    )

    // (g) THE BOUNDS, AGAINST REAL VALUE VALIDATION.
    //
    // The dice tray is the **one place in this application where a roll expression arrives
    // from a human** rather than from content that has already been through
    // `entriesProblem`, so it is the only place the length hole is reachable at all — and
    // `OVERLONG_ROLL` is a roll `ROLL_PATTERN` accepts, which is why `rollProblem` and not a
    // bare `isValidRoll` is what closes it.
    await refuses(
      `feed:rollDice refused a ${OVERLONG_ROLL.length}-character roll the grammar itself accepts`,
      () => trayRoll(OVERLONG_ROLL),
    )
    await refuses(`feed:rollDice refused ${MAX_ROLL_DICE + 1}d6, one die over the cap`, () =>
      trayRoll(`${MAX_ROLL_DICE + 1}d6`),
    )
    await refuses('feed:rollDice refused 99d20, which is a physics engine and not a roll', () =>
      trayRoll('99d20'),
    )
    await refuses('feed:rollDice refused a sentence somebody typed into the box', () =>
      trayRoll('two dice and a good feeling'),
    )
    // ⚠️ The refusal that is a *decision* rather than a bound. An ad-hoc roll has no
    // character, so `1d8+STR` has nothing to resolve against — and `+0` would be a lie the
    // feed then spells out in full beside a total nobody's Strength contributed to.
    await refuses(
      'feed:rollDice refused an ad-hoc roll naming STR, which has no character to resolve it',
      () => trayRoll('1d8+STR'),
    )

    // AND THE TWO IT ACCEPTS. `2d6 + 3` is the same roll as `2d6+3` typed by somebody who
    // uses spaces, normalised by the function the tray's own field runs on every keystroke —
    // so what is asserted is the *stored* expression rather than the fact that it was
    // accepted.
    const trayRow = lastRow(dmFeed, (row) => row.roll !== null && row.roll.expression === '4d6+2')
    const normalisedRow = lastRow(dmFeed, (row) => row.roll !== null && row.roll.expression === '2d6+3')
    check(
      'feed:rollDice accepted 4d6+2 and stored `2d6 + 3` as `2d6+3`',
      trayRow &&
        trayRow.roll.dice.length === 4 &&
        trayRow.roll.dice.every((die) => die.faces === 6) &&
        trayRow.characterId === null &&
        normalisedRow &&
        normalisedRow.roll.expression === '2d6+3' &&
        normalisedRow.roll.modifier === 3 &&
        normalisedRow.roll.dice.length === 2,
      trayRow && normalisedRow
        ? `${trayRow.roll.expression} on ${trayRow.roll.dice.length} d6, and the spaced one stored as ${JSON.stringify(normalisedRow.roll.expression)}`
        : `tray ${JSON.stringify(trayRow)}, normalised ${JSON.stringify(normalisedRow)}`,
    )

    // (h) WHAT `feed:roll` REFUSES, AND THE PARITY THAT MATTERS MORE THAN ANY OF THEM.
    await refuses('feed:roll refused an entry id that is not on the sheet', () =>
      rollEntry('no-such-entry-at-all', 'roll'),
    )
    // The part gate. Without it a client asks for a passive's to-hit, `toHitOf` answers null
    // because that category carries none, and the line announces an attack that cannot exist.
    await refuses('feed:roll refused a to-hit on a passive', () => rollEntry('roll-passive', 'toHit'))
    await refuses(
      'feed:roll refused an ability check on a creature, which has no ability scores to roll from',
      () => rollRequest(feedCreature.characterId, { kind: 'check', ability: 'str' }),
    )

    // ⚠️ **THE REFUSAL PARITY, WHICH IS THE ONLY ONE OF THESE THAT GUARDS A SECRET.** A
    // fabricated character and the DM's hidden creature have to be **one answer**, word for
    // word, or the error channel is an existence oracle for tonight's ambush — ask for a
    // roll on every id you can think of and the ones that come back differently are the ones
    // that exist. `requireEditableCharacter` is where that is made properly, and this is the
    // claim that it is still true over a real wire.
    //
    // The ghost is **made and unmade** rather than invented, because a string that is not a
    // `characters` id at all is refused by Convex's argument validation at the function
    // boundary — a different refusal from a different layer, and not the one being compared.
    const ghost = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Ghost of a Deleted Sheet',
      sheet: ROLL_HERO_SHEET,
    })
    await client.mutation('characters:remove', { code, dmCode, characterId: ghost.characterId })
    // Refused to the **DM** as well, which is worth its own line: the id is well formed, it
    // belonged to this game a moment ago, and the whole of what is wrong with it is that the
    // document is gone. That is the state a second browser tab is in the instant after a
    // delete, so it is a real click rather than a hostile one.
    await refuses('feed:roll refused a character id that no longer resolves, even to the DM', () =>
      rollRequest(ghost.characterId, { kind: 'initiative' }),
    )
    const refusalOf = async (fn) => {
      try {
        await fn()
        return null
      } catch (error) {
        const data = error && error.data
        return data && typeof data === 'object'
          ? { kind: data.kind ?? null, message: data.message ?? null }
          : { kind: null, message: describeError(error) }
      }
    }
    const ghostRefusal = await refusalOf(() =>
      client.mutation('feed:roll', {
        code,
        playerId: seatB.playerId,
        characterId: ghost.characterId,
        request: { kind: 'initiative' },
        mode: 'flat',
        dmOnly: false,
      }),
    )
    const hiddenRefusal = await refusalOf(() =>
      client.mutation('feed:roll', {
        code,
        playerId: seatB.playerId,
        characterId: feedCreature.characterId,
        request: { kind: 'initiative' },
        mode: 'flat',
        dmOnly: false,
      }),
    )
    check(
      'a character that never existed and a creature behind a DM-layer coin are one refusal, word for word',
      ghostRefusal !== null &&
        hiddenRefusal !== null &&
        JSON.stringify(ghostRefusal) === JSON.stringify(hiddenRefusal) &&
        ghostRefusal.kind === 'CharacterNotFound',
      `${JSON.stringify(ghostRefusal)} against ${JSON.stringify(hiddenRefusal)}`,
    )

    // 31. THREE LAYERS: A UNION AS AN ARGUMENT VALIDATOR, AS A STORED VALUE AND AS A
    // PROJECTED FIELD — AND THE ONE SECRECY CHECK IN THIS SCRIPT THAT ASSERTS PRESENCE.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE.** The stored layer union is **one member
    // wider than the canonical one**: `schema.ts` still admits the legacy `dm` spelling so a
    // row written before the GM layer was renamed keeps validating, while `board:addToken`'s
    // and `board:setLayer`'s arguments take the narrow three-member `tokenLayerValidator`. That
    // arrangement is a widen-migrate-narrow, and the *only* thing holding its second half is
    // Convex's own argument validation at the function boundary. The local suite writes through
    // the schema, so it can be asked whether the wide union stores a `dm` — which it must — and
    // structurally cannot be asked the question that matters here: whether a client can still
    // *create* one. So the refusal below is not a duplicate of anything in `board.test.ts`; it
    // is the half of the migration that has no other guard.
    //
    // The round trips beside it are the same point from the other end. `'background'` and
    // `'gm'` are two literals of a union that has three, in a field this application both
    // stores and projects, and a deployment that narrowed, re-tagged or defaulted either would
    // be invisible to a suite whose fixtures and payloads move together.
    //
    // ⚠️ **And the assertions come in a pair that is the *opposite* way round from every other
    // secrecy check in this file.** Background separates sight from interaction for the first
    // time — everybody is sent it, nobody but the DM may move it — so what has to be asserted
    // about the scenery coin is that it **is** in a player's payload, in both halves of it, the
    // coin and its placement row. Beside it, the GM coin must be in neither. Either check alone
    // means nothing: the presence half passes on a deployment that published everything, the
    // absence half on one that sent nobody anything, and only the two together say the filter
    // is a filter.
    const scenery = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Public by design, and asserted to be public, which is why this one name in the script
      // is *meant* to appear in a player's payload. Distinct from every character name for the
      // usual reason: a needle that matches two things cannot fail usefully.
      name: SCENERY_COIN_NAME,
      layer: 'background',
      sizeSquares: 2,
      tint: '#7f8c8d',
      x: 1600,
      y: 700,
    })
    created.push(scenery.tokenId)

    const layersForDm = await client.query('board:tokens', { code, dmCode })
    const layersForPlayer = await client.query('board:tokens', { code })
    const sceneryForDm = layersForDm.find((row) => row._id === scenery.tokenId) ?? null
    const sceneryForPlayer = layersForPlayer.find((row) => row._id === scenery.tokenId) ?? null
    const gmForDm = layersForDm.find((row) => row._id === secret.tokenId) ?? null
    check(
      'board:addToken stored background as `background` and gm as `gm`, and the DM got both back',
      sceneryForDm &&
        sceneryForDm.layer === 'background' &&
        sceneryForDm.name === SCENERY_COIN_NAME &&
        gmForDm &&
        gmForDm.layer === 'gm',
      sceneryForDm && gmForDm
        ? `${JSON.stringify(sceneryForDm.layer)} beside ${JSON.stringify(gmForDm.layer)}, over ${layersForDm.length} coins`
        : `scenery ${JSON.stringify(sceneryForDm)}, gm ${JSON.stringify(gmForDm)}`,
    )
    // THE PRESENCE HALF AND THE ABSENCE HALF, in one check because neither is worth having on
    // its own. `every(layer !== 'gm')` rather than a substring scan for `"gm"`, deliberately:
    // a signed storage URL is base64 and would match that needle every few runs, which is the
    // flakiness `OPAQUE_KEYS` exists to avoid — and the decoded field is the exact question
    // anyway.
    check(
      'a player got the Background coin, as background, and no gm coin at all',
      sceneryForPlayer &&
        sceneryForPlayer.layer === 'background' &&
        sceneryForPlayer.name === SCENERY_COIN_NAME &&
        !layersForPlayer.some((row) => row._id === secret.tokenId) &&
        layersForPlayer.every((row) => row.layer !== 'gm') &&
        // The positive control, and it is load-bearing in both directions: without it the
        // absence half passes on a deployment that sent an empty board, and the presence half
        // would be a claim about a payload nobody checked was smaller than the DM's.
        layersForDm.some((row) => row.layer === 'gm') &&
        layersForPlayer.length < layersForDm.length,
      `${layersForPlayer.length} coins to a player against ${layersForDm.length} to the DM — positive control included`,
    )
    // The second half of a player's board, which is the half that would leak the useful part:
    // a placement row says *something is standing there*, so scenery that arrived as a coin
    // with no row would be drawn nowhere, and a GM coin with a row would be an outline of
    // tonight's ambush.
    const playerPlacements = await client.query('board:positions', { code, sceneId })
    check(
      'the Background coin is in both halves of a player’s board, and the gm coin in neither',
      playerPlacements.some((row) => row.tokenId === scenery.tokenId) &&
        !playerPlacements.some((row) => row.tokenId === secret.tokenId),
      `${playerPlacements.length} placements, scenery among them and the ambush not`,
    )

    // ⚠️ **THE REFUSAL THAT IS DELIBERATELY *DISTINGUISHABLE*, WHICH INVERTS THIS CODEBASE'S
    // USUAL RULE — so it is asserted as an inequality rather than as a parity.** Everywhere
    // else, telling "you may not" from "no such thing" is an existence oracle: guess ids, read
    // the errors back, and the ones that answer differently are the ones that exist. That
    // argument holds for the GM coin and it still throws `TokenNotFound`. It does **not** hold
    // for scenery, because the coin **is in the player's payload** — they can see it, they
    // clicked it, and they can see it did not move. Answering "that token is not on this board"
    // about a coin somebody is looking at is not discretion, it is a lie that reads as a bug in
    // the application. `TOKEN_NOT_MOVABLE`'s docblock in `convex/lib/board.ts` argues this at
    // length; what is asserted here is that both kinds survive a real wire *and differ*, so a
    // future reader who "fixes" the asymmetry for consistency fails a check that says why.
    const shoveScenery = () =>
      client.mutation('board:moveToken', {
        code,
        sceneId,
        tokenId: scenery.tokenId,
        x: 240,
        y: 240,
        settle: true,
        playerId: seatA.playerId,
      })
    const sceneryRefusal = await refusalOf(shoveScenery)
    const gmRefusal = await refusalOf(() =>
      client.mutation('board:moveToken', {
        code,
        sceneId,
        tokenId: secret.tokenId,
        x: 240,
        y: 240,
        settle: true,
        playerId: seatA.playerId,
      }),
    )
    check(
      'a player’s shove of the scenery was refused as TokenNotMovable, and of the ambush as TokenNotFound — two answers, on purpose',
      sceneryRefusal !== null &&
        gmRefusal !== null &&
        sceneryRefusal.kind === 'TokenNotMovable' &&
        gmRefusal.kind === 'TokenNotFound' &&
        sceneryRefusal.message !== gmRefusal.message,
      `${JSON.stringify(sceneryRefusal)} against ${JSON.stringify(gmRefusal)}`,
    )
    // ⚠️ **AND A GRANT CANNOT OPEN A LAYER**, which is a fact about the *order* of two lines in
    // `requireMovableToken` and therefore exactly the kind of thing that survives a refactor
    // silently. The scenery refusal sits above the claim-and-grant read, so handing the party a
    // Background coin is inert rather than dangerous — the same thing `board.setControllers`
    // already promises about the GM layer, now true of two layers by one line instead of two.
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: scenery.tokenId,
      playerIds: [seatA.playerId],
    })
    grantedTokens.push(scenery.tokenId)
    const grantedSceneryRefusal = await refusalOf(shoveScenery)
    const grantedScenery = await tokensOf(scenery.tokenId)
    check(
      'granting the scenery to a seat changed nothing — the same TokenNotMovable, with the grant really written',
      grantedSceneryRefusal !== null &&
        grantedSceneryRefusal.kind === 'TokenNotMovable' &&
        // The positive control: without it this passes on a deployment that discarded the grant.
        grantedScenery &&
        grantedScenery.grantedPlayerIds.includes(seatA.playerId) &&
        grantedScenery.controllerIds.includes(seatA.playerId),
      grantedScenery
        ? `granted ${JSON.stringify(grantedScenery.grantedPlayerIds)} and still ${grantedSceneryRefusal.kind}`
        : 'no token row came back',
    )

    // AND THE DM'S IDENTICAL CALL LANDS, snapped server-side. The same mutation, the same
    // token, the same scene — one argument different — because "the DM rearranges scenery
    // freely" is half of what `mayPlayersMove` means and a refusal that applied to everybody
    // would satisfy every check above.
    //
    // The target is fractional so the snap is arithmetic over real float64s rather than a
    // rounding of two integers, and it is `snapToGrid` restated at the top of this file that
    // says where the coin should land — a prediction, so a server that stored the point it was
    // given fails here.
    const sceneryTarget = { x: 1590.5, y: 690.25 }
    const scenerySnapped = snapToGrid(sceneryTarget, GRID, 2)
    await client.mutation('board:moveToken', {
      code,
      dmCode,
      sceneId,
      tokenId: scenery.tokenId,
      ...sceneryTarget,
      settle: true,
    })
    const sceneryRests = (await client.query('board:positions', { code, sceneId, dmCode })).find(
      (row) => row.tokenId === scenery.tokenId,
    ) ?? null
    check(
      'the DM’s identical move landed, and the server snapped it to the square this script predicted',
      sceneryRests &&
        sceneryRests.x === scenerySnapped.x &&
        sceneryRests.y === scenerySnapped.y,
      sceneryRests
        ? `${sceneryRests.x} / ${sceneryRests.y} against a predicted ${scenerySnapped.x} / ${scenerySnapped.y}, from ${sceneryTarget.x} / ${sceneryTarget.y}`
        : 'no placement came back',
    )

    // ⚠️ **THE NARROW VALIDATOR, WHICH IS THE HALF OF THE MIGRATION WITH NO OTHER GUARD.** A
    // `dm` row must remain *readable* and must not be *creatable*, and only Convex's own
    // argument validation enforces the second — nothing in either handler asks. Both writes are
    // refused because both take the narrow union, which is what makes the wide one in
    // `schema.ts` safe to keep until the relabel has run.
    await refuses('board:addToken refused the legacy `dm` layer at the function boundary', () =>
      client.mutation('board:addToken', {
        code,
        dmCode,
        sceneId,
        name: 'Coin From Before the Rename',
        layer: 'dm',
        sizeSquares: 1,
        tint: '#2c3e50',
        x: 400,
        y: 400,
      }),
    )
    await refuses('board:setLayer refused the legacy `dm` layer too', () =>
      client.mutation('board:setLayer', {
        code,
        dmCode,
        tokenId: scenery.tokenId,
        layer: 'dm',
      }),
    )
    await refuses('board:addToken refused a layer that has never existed', () =>
      client.mutation('board:addToken', {
        code,
        dmCode,
        sceneId,
        name: 'Coin On No Layer At All',
        layer: 'overlay',
        sizeSquares: 1,
        tint: '#2c3e50',
        x: 400,
        y: 400,
      }),
    )

    // 32. FOG OF WAR: FOUR FRESH FLOAT64S A ROW, AND THE ONE THAT ARRIVES BACKWARDS.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE, AND THE HIGHEST-VALUE CHECK IN THIS WHOLE
    // FILE IS IN HERE.** `fogRects` is a new table of four float64s, and floats through real
    // value validation are this script's oldest speciality. What makes these four different
    // from the position table's two is that three quarters of all real gestures produce a
    // **negative** extent: a rubber-band drag goes in one of four directions, and only one of
    // them yields a positive width and height. `normaliseFogRect` has to have converted it
    // *before* the insert, because a row stored with a negative width silently fails every
    // containment test — `rectCovers` answers false for every point inside it, since the far
    // edge is behind the near one — and the result is fog that is drawn on every screen, that
    // the DM believes in, and that hides nothing at all. That is the worst failure this feature
    // has and the one a DM would never think to check for.
    //
    // So the backwards rectangle below is asserted **twice, in two different ways**: the stored
    // geometry is diffed field by field against the canonical box, and the creature standing in
    // it has to leave a player's payload. A deployment or a writer that skipped normalisation
    // fails both, and a normalisation that was subtly wrong — say, an absolute value without
    // the corner shift — fails the second even if the first were somehow satisfied.
    //
    // ⚠️ **Every rectangle here is built around a placement read back off `tokenPositions`**
    // rather than around the point `addToken` was given, and that is not fussiness: `addToken`
    // both snaps *and* displaces through `freeCellNear`, so a box centred on the requested point
    // is a flaky secrecy test — flaking in the direction where the monster is visible.
    //
    // The withholding itself is three separate queries' worth of consequence from one filter,
    // which is why each is read rather than one standing in for the others: a placement row
    // says something is standing there, a health band says how it is doing, and a feed line
    // says its name out loud. The coin's own row in `board:tokens` deliberately stays, because
    // that query resolves a signed URL per token and putting fog into it would re-resolve two
    // hundred of them on every drag frame. Asserted, so the scope is a decision on the record
    // rather than a gap.
    const fogCreature = await client.mutation('characters:create', {
      code,
      dmCode,
      name: FOG_CREATURE_NAME,
      sheet: FOG_CREATURE_SHEET,
    })
    createdCharacters.push(fogCreature.characterId)
    await client.mutation('characters:setHp', {
      code,
      dmCode,
      characterId: fogCreature.characterId,
      currentHp: FOG_CREATURE_CURRENT_HP,
    })
    const fogToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      // Not the character's name, for the reason sections 10, 20, 27 and 30 all give.
      name: FOG_CREATURE_COIN_NAME,
      layer: 'player',
      sizeSquares: 1,
      tint: '#1abc9c',
      characterId: fogCreature.characterId,
      x: 500,
      y: 700,
    })
    created.push(fogToken.tokenId)
    // Two lines rolled while the map is still lit, so there is history for the fog to take
    // back. Both through the DM's own path, because a player cannot roll a creature they have
    // not been granted — section 30's refusal parity is what says so.
    await rollRequest(fogCreature.characterId, { kind: 'initiative' })
    await rollRequest(fogCreature.characterId, { kind: 'entry', entryId: 'fog-grip', part: 'roll' })

    const placementOf = async (tokenId) =>
      (await client.query('board:positions', { code, sceneId, dmCode })).find(
        (row) => row.tokenId === tokenId,
      ) ?? null
    const fogSpot = await placementOf(fogToken.tokenId)
    // Every reading taken the same way at each state, in one closure, for section 28's reason:
    // a state read two different ways at two points is a comparison of two questions rather
    // than of two answers.
    const fogState = async () => {
      const placements = await client.query('board:positions', { code, sceneId })
      const vitals = await vitalsFor(seatA.playerId)
      const lines = await client.query('feed:list', { code })
      const coins = await client.query('board:tokens', { code })
      const scannable = [placements, vitals, lines]
      return {
        placed: placements.some((row) => row.tokenId === fogToken.tokenId),
        band: vitals.find((row) => row.characterId === fogCreature.characterId) ?? null,
        lines: lines.filter((row) => row.characterId === fogCreature.characterId).length,
        feed: lines,
        coin: coins.some((row) => row._id === fogToken.tokenId),
        // Scanned twice over, for the reason section 10 gives: the substring scan catches a
        // secret that arrived as text, and `holdsNumber` walks every number at every depth and
        // catches one that arrived as a number in a field nobody thought to look at.
        leaked:
          JSON.stringify(redactOpaque(scannable)).includes(FOG_CREATURE_NAME) ||
          holdsNumber(scannable, FOG_CREATURE_MAX_HP) ||
          holdsNumber(scannable, FOG_CREATURE_DAMAGE_BONUS),
      }
    }

    const litUp = await fogState()
    check(
      'before any fog, the creature is placed, banded and heard from — and its coin is on the board',
      litUp.placed &&
        litUp.band &&
        litUp.band.kind === 'band' &&
        litUp.lines === 2 &&
        litUp.coin &&
        fogSpot !== null,
      fogSpot
        ? `positive control — without it every check below passes on a deployment that sent nobody anything; standing at ${fogSpot.x} / ${fogSpot.y} with ${litUp.lines} lines`
        : 'no placement came back for the creature',
    )

    const overCreature = {
      x: fogSpot ? fogSpot.x - FOG_REACH : 0,
      y: fogSpot ? fogSpot.y - FOG_REACH : 0,
      width: FOG_REACH * 2,
      height: FOG_REACH * 2,
    }
    const drawn = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId,
      shape: { kind: 'rect', ...overCreature },
    })
    const darkened = await fogState()
    check(
      'the rectangle took the placement, the band and both lines off the wire — and left the coin where it was',
      !darkened.placed &&
        darkened.band === null &&
        darkened.lines === 0 &&
        !darkened.leaked &&
        // The documented scope, asserted rather than assumed: `board.tokens` is not a caller of
        // `foggedTokenIds`, so the coin's name is still public and the GM layer is the tool for
        // hiding that.
        darkened.coin,
      `${darkened.lines} lines, band ${JSON.stringify(darkened.band)}, coin still listed ${darkened.coin}`,
    )
    // AND THE RECTANGLE ITSELF, which is the one thing on this table that is **not** a secret:
    // every row goes to every client verbatim, because a player who cannot see that the
    // corridor is dark does not experience suspense, they wonder whether the app is broken.
    // Diffed against a hand-written box rather than value-compared, so a deployment that
    // rounded a float or dropped a key is named — and the key set is spelled out because a
    // sixth field arriving here would be a field nothing in the application asked for.
    const fogForPlayer = await client.query('fog:list', { code, sceneId })
    const fogForDm = await client.query('fog:list', { code, sceneId, dmCode })
    const drawnRow = fogForPlayer.find((row) => row._id === drawn.fogId) ?? null
    const drawnDrift = drawnRow
      ? firstDifference({ _id: drawn.fogId, ...overCreature }, drawnRow, 'fogRect')
      : 'no rectangle came back to the player'
    check(
      'the rectangle came back verbatim to a caller holding no DM code, with exactly five keys',
      drawnDrift === null &&
        drawnRow &&
        Object.keys(drawnRow).sort().join(',') === FOG_RECT_KEYS &&
        fogForDm.some((row) => row._id === drawn.fogId),
      drawnDrift ?? `keys: ${Object.keys(drawnRow).sort().join(',')} — reading fog is ungated by design`,
    )

    // (b) ERASING IT, AND THE REVEAL CLOCK.
    //
    // ⚠️ **`predatesReveal` is section 30's claim and this is deliberately not a second copy of
    // it.** That section proves the flag over `board:setLayer`, with three lines that all come
    // back `true`, and the `false` case is pinned by its whole-row diff. What is new here is the
    // **fog** stamp — `fog.erase` calling `stampReveal` is discipline rather than construction,
    // which `stampReveal`'s own ⚠️ admits is the design's soft spot — and the **pair inside one
    // payload**: two lines written before the erase and one written after it, so a flag stuck at
    // either value fails whichever half it is stuck against. Only a deployment can be asked at
    // all, because both operands are wall-clock times the server wrote and a query may not
    // sample its own.
    await client.mutation('fog:erase', { code, dmCode, fogId: drawn.fogId })
    await rollRequest(fogCreature.characterId, { kind: 'entry', entryId: 'fog-grip', part: 'toHit' })
    const lifted = await fogState()
    const liftedLines = lifted.feed.filter((row) => row.characterId === fogCreature.characterId)
    check(
      'erasing it brought the placement, the band and the lines back',
      lifted.placed &&
        lifted.band &&
        lifted.band.kind === 'band' &&
        lifted.lines === 3,
      `${lifted.lines} lines, placed ${lifted.placed}, vitals row ${JSON.stringify(lifted.band && lifted.band.kind)}`,
    )
    check(
      'fog:erase stamped the game: the two lines it published came back as history, the one rolled after it as news',
      liftedLines.length === 3 &&
        liftedLines[0].predatesReveal === true &&
        liftedLines[1].predatesReveal === true &&
        // The other half of the pair, and each half is the other's control: all-true passes on a
        // deployment that hard-coded the flag, all-false on one that never stamped.
        liftedLines[2].predatesReveal === false,
      `${JSON.stringify(liftedLines.map((row) => row.predatesReveal))} over ${liftedLines.length} lines, oldest first`,
    )

    // (c) THE RECTANGLE DRAGGED THE OTHER WAY. **The highest-value check in this section.**
    //
    // Same corner-to-corner box as the one above, expressed as the drag a DM makes three times
    // out of four: start at the bottom-right, finish at the top-left, and hand the server a
    // negative width and a negative height. The canonical form is what has to come back, and
    // the creature has to disappear — two independent failures, so a normalisation that was
    // removed, inverted or written as a bare `Math.abs` without the corner shift is caught by
    // at least one of them.
    const dragged = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId,
      shape: {
        kind: 'rect',
        x: overCreature.x + overCreature.width,
        y: overCreature.y + overCreature.height,
        width: -overCreature.width,
        height: -overCreature.height,
      },
    })
    const draggedRow =
      (await client.query('fog:list', { code, sceneId })).find((row) => row._id === dragged.fogId) ??
      null
    const draggedDrift = draggedRow
      ? firstDifference({ _id: dragged.fogId, ...overCreature }, draggedRow, 'draggedRect')
      : 'no rectangle came back'
    const backwards = await fogState()
    check(
      'a rectangle dragged bottom-right to top-left was normalised before it was stored, and it hides what it covers',
      draggedDrift === null &&
        !backwards.placed &&
        backwards.band === null &&
        backwards.lines === 0 &&
        !backwards.leaked,
      draggedDrift ??
        `stored ${draggedRow.x} / ${draggedRow.y} + ${draggedRow.width} × ${draggedRow.height} from a drag of −${overCreature.width} × −${overCreature.height}, and the creature left the wire`,
    )
    await client.mutation('fog:erase', { code, dmCode, fogId: dragged.fogId })

    // (d) A RECTANGLE OVER A CLAIMED HERO HIDES NOTHING, and the two boxes are drawn **at once**
    // so that one payload carries both answers.
    //
    // This is a correctness requirement rather than a courtesy. `board.positions` takes no seat
    // and must not — that is the per-seat cache split the feed deliberately walked away from —
    // so fog is one answer for every non-DM, and without the controller exclusion a player who
    // drags their own hero into a dark corridor loses their own coin from their own screen, with
    // nothing to select and no way to undo. Drawing both rectangles together is what makes the
    // positive control free: the creature's row is the proof that a box of exactly this shape,
    // on exactly this scene, does hide a coin.
    const heroSpot = await placementOf(heroToken.tokenId)
    const overHero = {
      x: heroSpot ? heroSpot.x - FOG_REACH : 0,
      y: heroSpot ? heroSpot.y - FOG_REACH : 0,
      width: FOG_REACH * 2,
      height: FOG_REACH * 2,
    }
    const overHeroRect = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId,
      shape: { kind: 'rect', ...overHero },
    })
    const alsoOverCreature = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId,
      shape: { kind: 'rect', ...overCreature },
    })
    const bothDrawn = await client.query('board:positions', { code, sceneId })
    check(
      'fog over a claimed hero hid nothing, while the identical box over an unclaimed creature hid it',
      heroSpot !== null &&
        bothDrawn.some((row) => row.tokenId === heroToken.tokenId) &&
        // The positive control, and it is the same gesture rather than an argument about one.
        !bothDrawn.some((row) => row.tokenId === fogToken.tokenId),
      heroSpot
        ? `the hero stands at ${heroSpot.x} / ${heroSpot.y} under fog and is still on the wire; the creature under the same box is not`
        : 'no placement came back for the hero',
    )
    await client.mutation('fog:erase', { code, dmCode, fogId: overHeroRect.fogId })
    await client.mutation('fog:erase', { code, dmCode, fogId: alsoOverCreature.fogId })

    // (e) WHAT `fog:draw` REFUSES, against real value validation.
    const badRect = ({ dmCode: badDm, ...fields }) =>
      client.mutation('fog:draw', {
        code,
        dmCode: badDm ?? dmCode,
        sceneId,
        shape: { kind: 'rect', x: 200, y: 200, width: 300, height: 200, ...fields },
      })
    // A zero-area rectangle looks like a usability refusal and is a data one: it covers no
    // point, so it hides nothing — and there is nothing on screen to click, so the DM cannot
    // erase it either. It would sit on the scene for ever, counting against the bound, reachable
    // only by clearing the whole map.
    await refuses('fog:draw refused a rectangle with no width', () => badRect({ width: 0 }))
    await refuses('fog:draw refused a rectangle with no height', () => badRect({ height: 0 }))
    // ⚠️ **The non-finite half is the worse of the two, and it is exactly the class of value
    // convex-test stores without comment.** NaN and Infinity are perfectly ordinary float64s
    // that survive the argument boundary, and they arrive from a division by a grid size of zero
    // rather than from anything anybody typed. `rectCovers` fails **open** on a NaN, so an
    // unrefused row of this shape is fog drawn on every screen that hides nothing whatever —
    // the same failure as an unnormalised rectangle, reached by a different route.
    await refuses('fog:draw refused a NaN corner', () => badRect({ x: Number.NaN }))
    await refuses('fog:draw refused an infinite extent', () =>
      badRect({ width: Number.POSITIVE_INFINITY }),
    )
    await refuses('fog:draw refused a well-formed wrong DM code', () =>
      badRect({ dmCode: 'not-the-dm-code' }),
    )
    await refuses('fog:erase refused a caller without the DM code', () =>
      client.mutation('fog:erase', { code, dmCode: 'not-the-dm-code', fogId: drawn.fogId }),
    )
    await refuses('fog:erase refused a rectangle that has already gone', () =>
      client.mutation('fog:erase', { code, dmCode, fogId: drawn.fogId }),
    )

    // (f) A BOARD NOBODY IS LOOKING AT.
    //
    // Fog is not a secret on the map in front of the table and **is** a room-by-room sketch of
    // one the party has not reached, so a non-DM may only ask about the active scene. It costs
    // nothing in practice — `scenes.list` is DM-only, so a player has no route to another
    // scene's id — which is exactly why it needs asserting: a guard that never fires in normal
    // use is one a refactor can delete without anybody noticing.
    const otherMapArt = await uploadPng(client, code, dmCode)
    uploads.push(otherMapArt)
    const otherMap = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'A Map the Party Has Not Reached',
      imageId: otherMapArt,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    extraScenes.push(otherMap.sceneId)
    const otherFog = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId: otherMap.sceneId,
      shape: { kind: 'rect', x: 200, y: 200, width: 400, height: 300 },
    })
    const otherForPlayer = await client.query('fog:list', { code, sceneId: otherMap.sceneId })
    const otherForDm = await client.query('fog:list', { code, sceneId: otherMap.sceneId, dmCode })
    check(
      'a non-DM asking about a scene nobody is looking at got nothing, and the DM got the rectangle',
      otherForPlayer.length === 0 &&
        // Two positive controls, because one is not enough: the rectangle exists for the DM, and
        // the same caller with the same absence of a DM code can still read the *active* scene's
        // fog — so this is a scope check rather than `fog:list` being broken for players.
        otherForDm.some((row) => row._id === otherFog.fogId) &&
        fogForPlayer.length > 0,
      `${otherForPlayer.length} rows to a player, ${otherForDm.length} to the DM, against ${fogForPlayer.length} readable on the active board`,
    )
    // The second map is not made active by `scenes.create` — only a *first* map is, because a
    // game with no board is unplayable — so the check above is about the scope and not about
    // which scene happens to be in front of the table.
    const stillActive = await client.query('scenes:active', { code })
    check(
      'creating a second map did not move the table onto it',
      stillActive && stillActive._id === sceneId,
      stillActive ? `still on ${JSON.stringify(stillActive.name)}` : 'no active scene came back',
    )

    // One rectangle left standing on the active board on purpose, so section 35's `fog:clear`
    // has something to count. Placed in a corner no coin's centre is in, because a rectangle
    // that fogged something would make every check between here and there a question about
    // which coins happened to be nearby.
    await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId,
      shape: { kind: 'rect', x: 2100, y: 1600, width: 100, height: 60 },
    })

    // 33. HANDOUTS: A NEW `v.id('_storage')` TABLE, AND AN OPTIONAL POINTER ON A POPULATED ONE.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE.** Two things, and they are different in kind.
    //
    // The first is `games.openImageId`, which is a **new optional field on the one document
    // every client in a game subscribes to** — the field-by-field trap that has shipped twice in
    // this project and that this script is the only thing to have ever caught. "Nothing is open"
    // is spelled by the key's *absence*, written by patching `undefined`, because `undefined` is
    // not a Convex value and there is no member of the union that means none. So this comes in
    // the pair every trap here comes in: shown, and then hidden, with the second read asserted
    // to be `null` rather than a stale pointer or a row with an empty name. Either alone is
    // meaningless — the first passes on a deployment that materialised a default, the second on
    // one that discarded the write.
    //
    // The second is `files.discard`. Every table holding a `v.id('_storage')` owes it a
    // predicate, and forgetting one is silent until somebody's error path deletes somebody
    // else's file. `storageGuard.test.ts` greps the schema and asserts the predicate is
    // *imported*, which is the strongest thing a local test can say; only a deployment can say
    // that the refusal fires, that `modalImages.remove` really deleted the bytes, and that the
    // bearer URL captured beforehand has stopped resolving. convex-test's file storage is an
    // in-memory stub keyed on the content hash, so it never had two blobs to tell apart and has
    // no URLs at all.
    const handoutBlob = await uploadPng(client, code, dmCode)
    uploads.push(handoutBlob)
    const handout = await client.mutation('modalImages:create', {
      code,
      dmCode,
      name: HANDOUT_NAME,
      imageId: handoutBlob,
      imageWidth: HANDOUT_WIDTH,
      imageHeight: HANDOUT_HEIGHT,
    })
    createdHandouts.push(handout.modalImageId)

    // ⚠️ **NOT OPENED ON UPLOAD, and the contrast with `scenes.create` is why this is asserted
    // rather than assumed.** A first map goes straight onto the table because a game with no
    // board is unplayable and there is only one thing the DM can have meant. A handout is held
    // up at a moment of the DM's choosing, and preparing one mid-session is ordinary — putting
    // it on everybody's screen the instant the upload finished would be the app choosing that
    // moment for them. This is also the absent-key half of the pair: `openImageId` is not on the
    // document at all.
    const openBeforeShow = await client.query('modalImages:open', { code })
    const handoutList = await client.query('modalImages:list', { code, dmCode })
    const listedHandout = handoutList.find((row) => row._id === handout.modalImageId) ?? null
    const handoutsBefore = handoutList.length
    check(
      'modalImages:create stored the handout and did not open it, and the DM’s list has it with exactly five keys',
      openBeforeShow === null &&
        listedHandout &&
        listedHandout.name === HANDOUT_NAME &&
        listedHandout.imageWidth === HANDOUT_WIDTH &&
        listedHandout.imageHeight === HANDOUT_HEIGHT &&
        Object.keys(listedHandout).sort().join(',') === MODAL_IMAGE_KEYS,
      listedHandout
        ? `open ${JSON.stringify(openBeforeShow)}, keys: ${Object.keys(listedHandout).sort().join(',')}`
        : 'no handout came back to the DM',
    )
    // The list is DM-only on `scenes.list`'s argument: the *names* are the spoiler, and `The
    // Duke's Real Face` sitting in a payload tells the table what the next two hours hold
    // whether or not a client renders it. Both refusals are worth having and they fire in
    // different places — the first at Convex's own argument validation, before the handler runs,
    // and the second inside `requireDm`.
    await refuses('modalImages:list refused a call with no dmCode argument at all', () =>
      client.query('modalImages:list', { code }),
    )
    await refuses('modalImages:list refused a well-formed wrong DM code', () =>
      client.query('modalImages:list', { code, dmCode: 'not-the-dm-code' }),
    )
    await refuses('modalImages:create refused a blank name', () =>
      client.mutation('modalImages:create', {
        code,
        dmCode,
        name: '   ',
        imageId: handoutBlob,
        imageWidth: HANDOUT_WIDTH,
        imageHeight: HANDOUT_HEIGHT,
      }),
    )

    // SHOWN. `modalImages:open` takes the join code and nothing else, which is the whole
    // feature rather than a relaxation: the act of opening one *is* the authorisation, so a
    // player's payload and the DM's are the same five fields and what differs is which rows each
    // may ask for. Diffed field by field against a hand-written object, because only a diff can
    // tell a dropped key from a null.
    await client.mutation('modalImages:show', {
      code,
      dmCode,
      modalImageId: handout.modalImageId,
    })
    const shown = await client.query('modalImages:open', { code })
    const shownDrift = shown
      ? firstDifference(
          {
            _id: handout.modalImageId,
            name: HANDOUT_NAME,
            imageWidth: HANDOUT_WIDTH,
            imageHeight: HANDOUT_HEIGHT,
            // The one field a script cannot predict, taken off the row for the reason
            // `expectedRollOf` takes each die's face off the row: it is minted by the
            // deployment. That it *resolves* is the claim below, and it is a real HTTP GET.
            imageUrl: shown.imageUrl,
          },
          shown,
          'handout',
        )
      : 'nothing was open'
    const handoutFetch = shown && shown.imageUrl ? await fetch(shown.imageUrl) : null
    check(
      'a player with only the join code got the shown handout, field for field, behind a URL that resolves',
      shownDrift === null && handoutFetch !== null && handoutFetch.ok,
      shownDrift ??
        `${handoutFetch.status} from the signed URL, ${HANDOUT_WIDTH}×${HANDOUT_HEIGHT}`,
    )

    // HIDDEN — the absence half. `hide` takes no image id and clears whatever is open, so the
    // patch writes `undefined` and the key leaves the document. `null` coming back here rather
    // than a stale pointer is the round trip; a present key holding null would be a second
    // spelling of none on a field that already has one, which is the convention ADR 0008
    // settled.
    await client.mutation('modalImages:hide', { code, dmCode })
    const openAfterHide = await client.query('modalImages:open', { code })
    const listAfterHide = await client.query('modalImages:list', { code, dmCode })
    check(
      'hiding it took it off every screen and left the handout itself alone',
      openAfterHide === null &&
        // The positive control: without it this passes on a deployment where `hide` deleted the
        // row, or where `show` had never written the pointer in the first place.
        listAfterHide.some((row) => row._id === handout.modalImageId),
      `open ${JSON.stringify(openAfterHide)}, and the handout is one of ${listAfterHide.length} still in the game — positive control included`,
    )

    // `files.discard` REFUSES A BLOB A LIVE HANDOUT POINTS AT. Being DM-gated bounds *who* can
    // call this and does nothing to make the call correct: the DM's own client invokes it, from
    // an error path, with an id it may have mis-sequenced. Without `modalImageReferencesImage`
    // this deletes the bytes out from under an image the table is looking at, and the row
    // survives pointing at nothing.
    //
    // Captured with `refusalOf` rather than asserted with `refuses`, because the interesting
    // claim is a **pair**: this exact call refuses now and accepts once the row has gone. Either
    // half alone is meaningless — a `discard` that refused unconditionally would satisfy the
    // first, and one that never asked any table would satisfy the second.
    const discardWhileLive = await refusalOf(() =>
      client.mutation('files:discard', { code, dmCode, imageIds: [handoutBlob] }),
    )
    check(
      'files:discard refused the blob while the handout still pointed at it',
      discardWhileLive !== null && discardWhileLive.kind === 'BadInput',
      discardWhileLive ? discardWhileLive.message : 'the deployment deleted a live handout’s bytes',
    )

    // AND THE OTHER SIDE OF IT. Shown again first, so the delete also has to repair the pointer
    // — `remove` clears `openImageId` *before* deleting the row, because every client at the
    // table is resolving it and relying on `open`'s defensive null branch is how that branch
    // stops being defensive.
    await client.mutation('modalImages:show', {
      code,
      dmCode,
      modalImageId: handout.modalImageId,
    })
    const handoutUrl = shown ? shown.imageUrl : null
    await client.mutation('modalImages:remove', {
      code,
      dmCode,
      modalImageId: handout.modalImageId,
    })
    // Removed as part of the assertions, so the registry entry would make a run that went
    // perfectly report a failed cleanup step — section 25 empties `reservedCharacters` for the
    // same reason. What the registry is for is a run that fails between the create and here.
    createdHandouts.length = 0
    const openAfterRemove = await client.query('modalImages:open', { code })
    const listAfterRemove = await client.query('modalImages:list', { code, dmCode })
    const deadHandoutFetch = handoutUrl ? await fetch(handoutUrl) : null
    check(
      'removing the open handout closed it for everybody and took its bytes with it',
      openAfterRemove === null &&
        !listAfterRemove.some((row) => row._id === handout.modalImageId) &&
        // ⚠️ The claim nothing but a deployment can make: the URL captured while it was open is
        // a bearer link, unguessable but not permission-checked, and the promise is that the
        // bytes behind it are *gone* rather than merely unreferenced. A 404 is that promise kept.
        deadHandoutFetch !== null &&
        deadHandoutFetch.status === 404,
      deadHandoutFetch
        ? `${deadHandoutFetch.status} from the URL the table was looking at, ${listAfterRemove.length} handouts left`
        : 'no URL to re-fetch',
    )
    // And the other half of the pair: the refusal is gone with the row. `remove` took the bytes,
    // so `discard` now returns early on a blob that is not in storage — the idempotent no-op
    // branch rather than a second delete, which is precisely the property that makes sweeping the
    // whole upload list in `finally` safe rather than a list of guesses about which uploads
    // survived a run that failed halfway.
    const discardAfterRemove = await refusalOf(() =>
      client.mutation('files:discard', { code, dmCode, imageIds: [handoutBlob] }),
    )
    check(
      'the same files:discard call accepted once the handout was gone',
      discardAfterRemove === null &&
        // The positive control, and it is the other half of this pair: the identical call threw a
        // moment ago, so this is a predicate answering a question rather than a mutation that
        // never refuses anything.
        discardWhileLive !== null,
      `refused as ${discardWhileLive ? discardWhileLive.kind : 'nothing'} while the row lived, accepted after it went`,
    )

    // 34. MUSIC: THE FIRST NON-IMAGE UPLOAD THIS APPLICATION HAS EVER MADE.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE, AND THIS IS WHERE INVARIANT 6 GETS ITS
    // SHARPEST TEST.** An image is checked three times: the browser downscales it, the browser
    // measures the result, and the server measures the stored blob. There is no
    // lossless-enough transcode a browser can do to audio, so **the first of those does not
    // exist** — `blob.size > MAX_MUSIC_BYTES` on the server is the whole of the enforcement
    // rather than the last of three, and convex-test's file storage is an in-memory stub that
    // never had a byte count to check. So the refusal below POSTs ten megabytes and one byte of
    // real bytes to a real upload URL, because there is no cheaper way to find out that the only
    // guard this feature has is there at all.
    //
    // The content type is the other half, and it can *only* be tested from here: it travels with
    // the blob rather than with the mutation, so the header this script sets on its POST is the
    // exact thing `music.create` reads back. It is honestly labelled in that handler as the
    // header the browser chose, catching a DM who picked a PDF out of their downloads folder and
    // nothing else — but a check that fires on the wrong file is worth having, and it has no
    // other place to be exercised.
    //
    // `games.activeTrackId` is the third optional pointer on the game document, and gets
    // `openImageId`'s pair treatment for the same reason: `music.select(null)` clears it by
    // patching `undefined`, so "no music" is an absent key and `current` returning `null` rather
    // than a stale pointer is a round trip somebody has to make.
    const trackBlob = await uploadBlob(client, code, dmCode, 'audio/mpeg', MP3_BYTES)
    uploads.push(trackBlob)
    const track = await client.mutation('music:create', {
      code,
      dmCode,
      name: TRACK_NAME,
      // `fileId`, not `imageId`: the blob is not an image, the stored field says so, and this is
      // the one mutation in the application taking a storage id under a different name.
      fileId: trackBlob,
    })
    createdTracks.push(track.trackId)

    const currentBeforeSelect = await client.query('music:current', { code })
    const trackList = await client.query('music:list', { code, dmCode })
    const listedTrack = trackList.find((row) => row._id === track.trackId) ?? null
    const tracksBefore = trackList.length
    check(
      'music:create stored the track and did not put it on, and the DM’s list has it with exactly three keys',
      currentBeforeSelect === null &&
        listedTrack &&
        listedTrack.name === TRACK_NAME &&
        Object.keys(listedTrack).sort().join(',') === TRACK_KEYS,
      listedTrack
        ? `current ${JSON.stringify(currentBeforeSelect)}, keys: ${Object.keys(listedTrack).sort().join(',')}`
        : 'no track came back to the DM',
    )
    await refuses('music:list refused a call with no dmCode argument at all', () =>
      client.query('music:list', { code }),
    )
    await refuses('music:list refused a well-formed wrong DM code', () =>
      client.query('music:list', { code, dmCode: 'not-the-dm-code' }),
    )

    // ⚠️ **THE ONLY DEFENCE, EXERCISED.** Ten megabytes and one byte, POSTed for real, refused
    // on the stored size — which is read off the blob rather than taken as an argument, because
    // the byte count is the one fact about an upload the client cannot be trusted to report: it
    // is the client being checked. The rejected blob stays in storage on purpose, because a
    // mutation is a transaction and a `ctx.storage.delete` on the way out of a throwing handler
    // is rolled back with the rest of it — so the upload registry at the bottom of this file is
    // the only thing that can reclaim it, and this is a ten-megabyte instance of exactly the
    // leak `files.discard` exists to close.
    const oversizedBlob = await uploadBlob(
      client,
      code,
      dmCode,
      'audio/mpeg',
      Buffer.alloc(MAX_MUSIC_BYTES + 1),
    )
    uploads.push(oversizedBlob)
    await refuses(
      `music:create refused ${MAX_MUSIC_BYTES + 1} bytes of audio, one byte over the only limit this feature has`,
      () => client.mutation('music:create', { code, dmCode, name: 'Too Long a Loop', fileId: oversizedBlob }),
    )
    // And the wrong kind of file entirely, which is a refusal on the header the browser chose at
    // upload time. Reachable from nowhere else: nothing in a Convex mutation can set a stored
    // blob's content type, so the POST this script makes is the whole of the setup.
    const notAudioBlob = await uploadPng(client, code, dmCode)
    uploads.push(notAudioBlob)
    await refuses('music:create refused a blob the browser labelled image/png', () =>
      client.mutation('music:create', { code, dmCode, name: 'A Screenshot, By Mistake', fileId: notAudioBlob }),
    )
    await refuses('music:create refused a blank name', () =>
      client.mutation('music:create', { code, dmCode, name: ' ', fileId: trackBlob }),
    )

    // ON THE TABLE. What `select` broadcasts is a **pointer and nothing else** — no playhead, no
    // started-at, no listener count — because a browser will not begin audio without a gesture
    // in that browser, so a field claiming a track was playing would be a lie on every screen
    // where nobody had pressed anything. The three-key payload is that absence, asserted.
    await client.mutation('music:select', { code, dmCode, trackId: track.trackId })
    const playing = await client.query('music:current', { code })
    const playingDrift = playing
      ? firstDifference(
          {
            _id: track.trackId,
            name: TRACK_NAME,
            // Taken off the row for `imageUrl`'s reason above: the deployment mints it.
            url: playing.url,
          },
          playing,
          'track',
        )
      : 'nothing was playing'
    const trackFetch = playing && playing.url ? await fetch(playing.url) : null
    check(
      'a player with only the join code got the selected track, field for field, behind a URL that resolves',
      playingDrift === null && trackFetch !== null && trackFetch.ok,
      playingDrift ?? `${trackFetch.status} from the signed URL over ${MP3_BYTES.length} bytes of audio`,
    )

    // TAKEN OFF — the absence half, and the reason the argument is a union rather than an
    // optional id: a mutation that means "no music" should say so, where an absent argument means
    // "unchanged" in every other mutation in this codebase.
    await client.mutation('music:select', { code, dmCode, trackId: null })
    const currentAfterClear = await client.query('music:current', { code })
    const listAfterClear = await client.query('music:list', { code, dmCode })
    check(
      'music:select(null) took the music off and left the track in the game',
      currentAfterClear === null &&
        // The positive control: without it this passes on a deployment where `select(null)`
        // deleted the row, or where `select` had never written the pointer at all.
        listAfterClear.some((row) => row._id === track.trackId),
      `current ${JSON.stringify(currentAfterClear)}, and the track is one of ${listAfterClear.length} still loaded — positive control included`,
    )

    // `files.discard` REFUSES A REFERENCED TRACK'S BLOB, and this is the one refusal there where
    // the blob could be ten megabytes — which is the other half of why `discard` matters more to
    // `music.create` than to the two mutations it copies.
    await refuses('files:discard refused the audio while the track still pointed at it', () =>
      client.mutation('files:discard', { code, dmCode, imageIds: [trackBlob] }),
    )

    // AND THE DELETE, with the track put back on first so the pointer repair is exercised too.
    // Cleared rather than moved on to another track, for `scenes.remove`'s reason about the
    // board: choosing what the table hears next is the DM's decision, and every client would
    // follow this one silently.
    await client.mutation('music:select', { code, dmCode, trackId: track.trackId })
    const trackUrl = playing ? playing.url : null
    await client.mutation('music:remove', { code, dmCode, trackId: track.trackId })
    // Emptied for the reason `createdHandouts` is: the removal is one of the assertions.
    createdTracks.length = 0
    const currentAfterRemove = await client.query('music:current', { code })
    const tracksAfterRemove = await client.query('music:list', { code, dmCode })
    const deadTrackFetch = trackUrl ? await fetch(trackUrl) : null
    check(
      'removing the playing track took the music off every screen and took its bytes with it',
      currentAfterRemove === null &&
        !tracksAfterRemove.some((row) => row._id === track.trackId) &&
        deadTrackFetch !== null &&
        deadTrackFetch.status === 404,
      deadTrackFetch
        ? `${deadTrackFetch.status} from the URL the table was listening to, ${tracksAfterRemove.length} tracks left`
        : 'no URL to re-fetch',
    )

    // 35. THE RECEIPT: WHAT THE CLIENT-REACHABLE DELETES LEAVE BEHIND.
    //
    // ⚠️ **`admin.purgeGame` is deliberately not called here, and this section is what stands in
    // for it.** That function is an `internalMutation` on purpose — it did not have to answer
    // "who may delete a game" ahead of the milestone that owns the question — so reaching it
    // means holding deploy credentials, and this script authenticates with a game code over
    // `ConvexHttpClient` like any other client. Wiring it into a test's cleanup path would make
    // that test depend on credentials it does not otherwise need, and inventing a public
    // mutation to tidy up after a smoke run would put the authorisation question back on the
    // table. See the note in section 30 and the one in `finally`.
    //
    // So what is asserted is the claim a client *can* make: that the three tools this milestone
    // added leave **nothing** behind once the DM has deleted what they made. That is worth a
    // deployment's opinion because each of the three deletes cascades differently — `fog.clear`
    // sweeps a range and reports a count, `modalImages.remove` and `music.remove` each take a
    // blob with them and repair a pointer on the game document — and the residue this run does
    // knowingly leave is a short, named list rather than whatever happened to survive.
    const fogBeforeClear = await client.query('fog:list', { code, sceneId, dmCode })
    const cleared = await client.mutation('fog:clear', { code, dmCode, sceneId })
    const fogAfterClear = await client.query('fog:list', { code, sceneId, dmCode })
    check(
      'fog:clear counted exactly what was standing and left the board lit',
      fogBeforeClear.length > 0 &&
        cleared.removed === fogBeforeClear.length &&
        fogAfterClear.length === 0,
      `${cleared.removed} removed against ${fogBeforeClear.length} standing — positive control included, and the receipt is a number the panel can print`,
    )
    // The creature that spent this section being fogged is back on every screen, which is the
    // check that says `clear` lifted the fog rather than deleting the coins under it.
    const afterClear = await fogState()
    check(
      'the creature under the last rectangle is placed, banded and heard from again',
      afterClear.placed && afterClear.band && afterClear.lines === 3,
      `${afterClear.lines} lines, placed ${afterClear.placed}, vitals row ${JSON.stringify(afterClear.band && afterClear.band.kind)} — clear lifted the fog rather than deleting what was under it`,
    )
    const handoutsLeft = await client.query('modalImages:list', { code, dmCode })
    const tracksLeft = await client.query('music:list', { code, dmCode })
    const stillOpen = await client.query('modalImages:open', { code })
    const stillPlaying = await client.query('music:current', { code })
    check(
      'the handout and the track left no row, no blob and no pointer behind',
      handoutsLeft.length === 0 &&
        tracksLeft.length === 0 &&
        stillOpen === null &&
        stillPlaying === null &&
        // The positive controls, and they are the whole of what makes four empty answers mean
        // anything: each list held exactly one row before the delete, so these are not four
        // queries that have always answered emptily.
        handoutsBefore === 1 &&
        tracksBefore === 1,
      `${handoutsBefore} handout and ${tracksBefore} track created, ${handoutsLeft.length} and ${tracksLeft.length} left, both pointers null`,
    )
    // ⚠️ **What this run does leave behind, stated rather than implied**, because a receipt that
    // claimed everything was gone would be the wrong kind of reassuring. The game document
    // stays, and section 30's ad-hoc feed lines with it; `npm run prune-games` is the broom, and
    // the console lines under the cleanup below say so. Everything else this script made — every
    // scene, coin, character, seat, rectangle, handout, track and blob — is reclaimed by a
    // mutation an ordinary client can call.
    // ⚠️ **The one thing this section asserts *about* the purge, which is that it cannot be
    // reached.** CLAUDE.md's instruction is emphatic — do not give `purgeGame` a public mutation,
    // because that puts "who may erase a game" back on the table and that question wants an ADR
    // — and the only mechanism enforcing it is that an `internalMutation` is absent from the
    // generated public API. That is a property of a deployed backend and of nothing else: the
    // local suite calls internal functions directly through `t.mutation`, by design, so it
    // structurally cannot tell an internal function from a public one.
    //
    // The refusal is checked for what it is rather than merely that it happened. A missing public
    // function is a transport error naming the function; an argument-validation error would name
    // the *field* — so a `purgeGame` that had quietly become public and merely disliked this id
    // fails here instead of passing.
    const purgeRefusal = await refusalOf(() =>
      client.mutation('admin:purgeGame', { gameId: 'not-a-game-id-at-all' }),
    )
    const purgeMessage = purgeRefusal ? String(purgeRefusal.message ?? '') : ''
    check(
      'admin:purgeGame is not on the public API at all, so no client can reach it',
      purgeRefusal !== null &&
        purgeRefusal.kind === null &&
        purgeMessage.includes('purgeGame') &&
        !purgeMessage.includes('gameId'),
      purgeRefusal ? purgeMessage : 'the deployment accepted a call to an internal mutation',
    )

    // 36. PLACEMENT: ONE COIN ON TWO BOARDS, AND AN IDEMPOTENCE THAT IS OBSERVED RATHER THAN
    // DECLARED.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE.** Three things, and the first is the one
    // worth the section.
    //
    //   - **Idempotence, seen from outside.** `placeOnScene` answers `null` whether it wrote
    //     a placement or returned having touched nothing, so there is no return value to
    //     assert on and no way to ask the question except by watching a **coordinate**. The
    //     formulation the early return exists to prevent — leaning on `placeToken`'s upsert —
    //     is not an error and not a missing row: it silently patches the coin back to the
    //     middle of the map, which the DM experiences as a coin teleporting out of the
    //     doorway they had just dragged it into. So the coin is settled somewhere it did not
    //     land, the button is pressed a second time, and the placement is read back and
    //     diffed field by field. **That is the check that fails if the early return is ever
    //     replaced by the upsert**, and nothing else here is.
    //   - **A no-op that is genuinely not an error.** `removeFromScene` twice has to be one
    //     removal and then nothing, for `files.discard`'s reason: the menu that calls it may
    //     be a frame stale, and a second press should be nothing rather than a second error
    //     on top of the first. "It did not throw" is worth having only when the throw would
    //     have crossed a real transport.
    //   - **`placements` projects bare ids.** Its `returns:` validator is
    //     `v.array(v.id('scenes'))`, and this query is the obvious place for a scene *name*
    //     to be helpfully added — which `scenes.list` is DM-only precisely to avoid, because
    //     a list of map names is a spoiler. So what comes back is compared as a sorted array
    //     of the two ids this run made, and nothing else is allowed to be on it.
    //
    // ⚠️ **And the refusal parity, which is the one thing in this section guarding
    // anything.** `requireDmToken` shares `TOKEN_NOT_FOUND` with every other board function,
    // so a coin at another table and a coin that has gone must be one answer word for word.
    // Both operands are made rather than fabricated, for the reason section 30's ghost is
    // made and unmade: an id that is not a `tokens` id is refused at the function boundary,
    // which is a refusal from a different layer and not the one being compared.
    const secondBoardArt = await uploadPng(client, code, dmCode)
    uploads.push(secondBoardArt)
    const secondBoard = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'The Undercroft, One Floor Down',
      imageId: secondBoardArt,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    extraScenes.push(secondBoard.sceneId)

    const traveller = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: TRAVELLER_COIN_NAME,
      layer: 'player',
      sizeSquares: 1,
      tint: '#d35400',
      x: 1000,
      y: 300,
    })
    created.push(traveller.tokenId)

    const boardsOf = (tokenId) => client.query('board:placements', { code, dmCode, tokenId })
    const sortedIds = (ids) => [...ids].sort()

    const onOneBoard = await boardsOf(traveller.tokenId)
    check(
      'a new coin stands on exactly the board it was added to',
      Array.isArray(onOneBoard) && onOneBoard.length === 1 && onOneBoard[0] === sceneId,
      `${JSON.stringify(onOneBoard)} — the positive control every count below rests on`,
    )

    await client.mutation('board:placeOnScene', {
      code,
      dmCode,
      sceneId: secondBoard.sceneId,
      tokenId: traveller.tokenId,
    })
    const onBoth = await boardsOf(traveller.tokenId)
    const wantedBoards = sortedIds([sceneId, secondBoard.sceneId])
    check(
      'board:placeOnScene put the coin on a second board without taking it off the first',
      JSON.stringify(sortedIds(onBoth)) === JSON.stringify(wantedBoards),
      `${JSON.stringify(sortedIds(onBoth))} against ${JSON.stringify(wantedBoards)} — ids and never names, because a map's name is a spoiler`,
    )

    // THE IDEMPOTENCE, AND IT IS A COORDINATE RATHER THAN A COUNT.
    //
    // The target is fractional so the settling write is arithmetic over real float64s, and
    // where the coin lands is not predicted here: the second board's grid is whatever
    // `scenes.create` defaults to, and this section is about a row that does not move rather
    // than about the snap that section 31 already asserts. What makes it an assertion is the
    // pair — the cell `placeOnScene` chose, and the cell the DM dragged it to, being
    // different — because the upsert formulation would put it back in the first.
    const spotOnSecondBoard = async () =>
      (
        await client.query('board:positions', { code, sceneId: secondBoard.sceneId, dmCode })
      ).find((row) => row.tokenId === traveller.tokenId) ?? null

    const landedAt = await spotOnSecondBoard()
    await client.mutation('board:moveToken', {
      code,
      dmCode,
      sceneId: secondBoard.sceneId,
      tokenId: traveller.tokenId,
      x: 320.5,
      y: 1240.75,
      settle: true,
    })
    const settledAt = await spotOnSecondBoard()
    await client.mutation('board:placeOnScene', {
      code,
      dmCode,
      sceneId: secondBoard.sceneId,
      tokenId: traveller.tokenId,
    })
    const afterSecondPress = await spotOnSecondBoard()
    const idempotenceDrift =
      settledAt && afterSecondPress
        ? firstDifference(settledAt, afterSecondPress, 'placement')
        : 'no placement came back off the second board'
    check(
      'pressing place a second time wrote nothing — the coin is still where the DM settled it',
      idempotenceDrift === null &&
        // The positive control, and it is half the assertion: without it this passes on a
        // deployment where the drop never landed either, which is exactly what the upsert
        // formulation looks like when both writes go to the same cell.
        landedAt !== null &&
        (landedAt.x !== settledAt.x || landedAt.y !== settledAt.y),
      idempotenceDrift ??
        `placed at ${landedAt.x} / ${landedAt.y}, settled at ${settledAt.x} / ${settledAt.y}, and unmoved by the second press`,
    )

    await client.mutation('board:removeFromScene', {
      code,
      dmCode,
      sceneId: secondBoard.sceneId,
      tokenId: traveller.tokenId,
    })
    const afterFirstRemoval = await boardsOf(traveller.tokenId)
    await client.mutation('board:removeFromScene', {
      code,
      dmCode,
      sceneId: secondBoard.sceneId,
      tokenId: traveller.tokenId,
    })
    const afterSecondRemoval = await boardsOf(traveller.tokenId)
    check(
      'taking the coin off the second board twice was one removal and then nothing at all',
      JSON.stringify(afterFirstRemoval) === JSON.stringify([sceneId]) &&
        JSON.stringify(afterSecondRemoval) === JSON.stringify([sceneId]),
      `${JSON.stringify(afterFirstRemoval)} then ${JSON.stringify(afterSecondRemoval)} — the second call is the no-op, and it crossed a real transport to be one`,
    )

    // AND THE LAST BOARD OFF, which is a legitimate state and deliberately not refused: a
    // coin on no map at all is what the schema means by *tokens belong to the game, not to
    // this map*, it keeps its row, its sheet and its grants, and one press puts it back.
    await client.mutation('board:removeFromScene', {
      code,
      dmCode,
      sceneId,
      tokenId: traveller.tokenId,
    })
    const onNoBoard = await boardsOf(traveller.tokenId)
    const stillACoin = await tokensOf(traveller.tokenId)
    check(
      'taking the last board off left the coin standing on none — and left the coin',
      onNoBoard.length === 0 &&
        stillACoin !== null &&
        stillACoin.name === TRAVELLER_COIN_NAME &&
        stillACoin.layer === 'player',
      stillACoin
        ? `${onNoBoard.length} boards, and ${JSON.stringify(stillACoin.name)} is still in board:tokens`
        : 'the coin went with its last placement',
    )

    await refuses('board:placements refused a well-formed wrong DM code', () =>
      client.query('board:placements', {
        code,
        dmCode: 'not-the-dm-code',
        tokenId: traveller.tokenId,
      }),
    )

    // THE SECOND GAME. Named with this run's own prefix so `npm run prune-games` sweeps it,
    // and its scene, coin and blob are all reclaimed in `finally` by mutations an ordinary
    // client can call — see the registry's note.
    const otherTable = await client.mutation('games:create', {
      name: `${gameName} (the other table)`,
      dmName: SMOKE_DM_NAME,
      recoveryPhrase: 'brass lantern smoke',
    })
    foreignGames.push(otherTable)
    otherTable.imageId = await uploadPng(client, otherTable.code, otherTable.dmCode)
    const otherTableScene = await client.mutation('scenes:create', {
      code: otherTable.code,
      dmCode: otherTable.dmCode,
      name: 'Somebody Else’s Map',
      imageId: otherTable.imageId,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    otherTable.sceneId = otherTableScene.sceneId
    const otherTableToken = await client.mutation('board:addToken', {
      code: otherTable.code,
      dmCode: otherTable.dmCode,
      sceneId: otherTableScene.sceneId,
      name: 'A Coin at Another Table',
      layer: 'player',
      sizeSquares: 1,
      tint: '#34495e',
      x: 400,
      y: 400,
    })
    otherTable.tokenId = otherTableToken.tokenId

    // Made and unmade, for section 30's reason, and reused by section 37 further down: this
    // is the state a second browser tab is in the instant after a delete, so it is a real
    // click rather than a hostile one.
    const vanishing = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Coin That Is About to Go',
      layer: 'player',
      sizeSquares: 1,
      tint: '#95a5a6',
      x: 1200,
      y: 200,
    })
    await client.mutation('board:removeToken', { code, dmCode, tokenId: vanishing.tokenId })

    const foreignRefusal = await refusalOf(() => boardsOf(otherTable.tokenId))
    const vanishedRefusal = await refusalOf(() => boardsOf(vanishing.tokenId))
    check(
      'a coin at another table and a coin that has gone are one refusal, word for word',
      foreignRefusal !== null &&
        vanishedRefusal !== null &&
        JSON.stringify(foreignRefusal) === JSON.stringify(vanishedRefusal) &&
        foreignRefusal.kind === 'TokenNotFound',
      `${JSON.stringify(foreignRefusal)} against ${JSON.stringify(vanishedRefusal)}`,
    )

    // 37. CONDITIONS: A SEVENTEEN-MEMBER UNION AS AN ARGUMENT AND AS A PROJECTED FIELD, AND A
    // ROW WHOSE EXISTENCE IS THE FACT.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE.** The vocabulary is a seventeen-member
    // `v.union` of literals, and it crosses Convex's own value validation **twice per call**:
    // once as `v.array(tokenMarkerValidator)` on the way in, and once inside
    // `publicTokenMarkersValidator` on the way out. The local suite writes through the schema
    // and reads a return value the harness never validates, so neither crossing exists there.
    // Three consequences, and each is a check below:
    //
    //   - **A word the union has never heard of is refused at the function boundary**, before
    //     `setMarkers`' handler runs and before `normaliseMarkers` gets a chance to drop it.
    //     That is a *transport* refusal rather than a handler one — no `kind`, because it is
    //     not a `ConvexError` — and section 35 already tells those two apart this way.
    //   - **The canonical order and the deduplication are what is stored**, not what the
    //     caller sent, so the whole vocabulary goes out backwards and has to come back
    //     forwards. Diffed element by element rather than compared as a set, so a member that
    //     came back re-tagged, dropped or reordered is *named*. ⚠️ **The repeat is asserted
    //     on the subset below rather than on the seventeen, because the deployment refused
    //     the other arrangement**: `setMarkers` bounds the array at the vocabulary's own
    //     length before it reads anything, so *all seventeen plus a duplicate* is eighteen
    //     values and not a payload any client can send. That refusal is checked too.
    //   - **An empty array deletes the row.** The row's existence *is* the fact, the way a
    //     placement row's is, so what has to be observed is a payload with **no row in it**
    //     rather than a row holding `[]` — which is a distinction a value comparison cannot
    //     make and an empty local fixture would satisfy either way.
    //
    // ⚠️ **And the presence half and the absence half are one check**, for section 31's
    // reason: a player must receive the player-layer coin's conditions and no row whatever
    // for the GM-layer one. Either alone means nothing — the first passes on a deployment
    // that published everything, the second on one that sent nobody anything.
    const markersSeenBy = (extra) => client.query('board:markers', { code, ...extra })
    const markerRowFor = async (tokenId) =>
      (await markersSeenBy({ dmCode })).find((row) => row.tokenId === tokenId) ?? null

    // Backwards, and exactly at the cap — a coin carrying every condition in the book is the
    // largest array this table ever stores, so the round trip is over a bound as well as over
    // an order.
    await client.mutation('board:setMarkers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      markers: [...ALL_MARKERS].reverse(),
    })
    markedTokens.push(heroToken.tokenId)
    const everyCondition = await markerRowFor(heroToken.tokenId)
    const markerDrift = everyCondition
      ? firstDifference(ALL_MARKERS, everyCondition.markers, 'markers')
      : 'no marker row came back at all'
    check(
      'all seventeen conditions, sent backwards, came back forwards in the vocabulary’s order',
      markerDrift === null &&
        everyCondition &&
        Object.keys(everyCondition).sort().join(',') === MARKER_ROW_KEYS &&
        // Asserted rather than assumed, because the vocabulary is copied by hand and a
        // truncated copy would agree with a truncated payload.
        ALL_MARKERS.length === 17,
      markerDrift ??
        `${everyCondition.markers.length} conditions back, keys: ${Object.keys(everyCondition).sort().join(',')}`,
    )
    // AND ONE MORE THAN THE VOCABULARY HOLDS, which is the argument-only bound: refused
    // before `resolveDmAccess`, before the token is read, and before `normaliseMarkers` would
    // have squeezed the repeat out anyway. What it stops is a caller buying an unbounded array
    // with one argument, and it is why the repeat is asserted on the subset below.
    const tooManyRefusal = await refusalOf(() =>
      client.mutation('board:setMarkers', {
        code,
        dmCode,
        tokenId: heroToken.tokenId,
        markers: [...ALL_MARKERS, 'poisoned'],
      }),
    )
    check(
      'an eighteenth entry was refused as BadInput, even though it repeats a condition already there',
      tooManyRefusal !== null && tooManyRefusal.kind === 'BadInput',
      tooManyRefusal
        ? JSON.stringify(tooManyRefusal)
        : `the deployment accepted ${ALL_MARKERS.length + 1} entries for a ${ALL_MARKERS.length}-word vocabulary`,
    )

    await client.mutation('board:setMarkers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      markers: SUBSET_SENT,
    })
    const subsetRow = await markerRowFor(heroToken.tokenId)
    const subsetDrift = subsetRow
      ? firstDifference(SUBSET_CANONICAL, subsetRow.markers, 'markers')
      : 'no marker row came back'
    check(
      'a subset sent out of order and with one repeat came back deduplicated, in the vocabulary’s order',
      subsetDrift === null &&
        // Asserted rather than trusted: an edit that drops the duplicate leaves this checking
        // only the ordering, which the seventeen above already cover.
        SUBSET_SENT.length === SUBSET_CANONICAL.length + 1,
      subsetDrift ??
        `${JSON.stringify(SUBSET_SENT)} was stored as ${JSON.stringify(subsetRow.markers)}`,
    )

    // ⚠️ **THE ROW'S EXISTENCE IS THE FACT**, so this asserts an absence rather than an empty
    // array — a deployment that stored `[]` would satisfy every value comparison and leave a
    // game with two hundred coins holding two hundred rows.
    await client.mutation('board:setMarkers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      markers: [],
    })
    const clearedRows = await markersSeenBy({ dmCode })
    check(
      'clearing the last condition deleted the row rather than storing an empty array',
      !clearedRows.some((row) => row.tokenId === heroToken.tokenId) &&
        // The positive control, and it is the read one call earlier rather than an argument
        // about one: without it this passes on a deployment that never stored anything.
        subsetRow !== null &&
        subsetRow.markers.length === SUBSET_CANONICAL.length,
      `${clearedRows.length} rows left in the game, none of them this coin’s — and it carried ${subsetRow ? subsetRow.markers.length : 0} one call ago`,
    )

    // THE ARGUMENT VALIDATOR, which is the mechanism this whole script exists to reach.
    // `exhausted` is the mistake somebody actually makes — the vocabulary's word is
    // `exhaustion` — and it is refused before any handler runs, so `normaliseMarkers` never
    // sees it and the refusal names the field rather than the value's meaning.
    //
    // ⚠️ **Caught here rather than through `refusalOf`, and the reason is the reporter rather
    // than the refusal.** `describeError` trims a message to 110 code points so that one check
    // stays one line — and a real deployment spends the first seventy of an
    // `ArgumentValidationError` on a request id and the error class, so the *path* falls off
    // the end. This is the one assertion in this file about the tail of a message, so it reads
    // the untrimmed one. `kind` is still the thing that separates a transport refusal from a
    // handler's `ConvexError`, exactly as in section 35.
    let unknownKind = 'the deployment accepted it'
    let unknownMessage = ''
    try {
      await client.mutation('board:setMarkers', {
        code,
        dmCode,
        tokenId: heroToken.tokenId,
        markers: ['prone', 'exhausted'],
      })
    } catch (error) {
      const data = error && error.data
      unknownKind = data && typeof data === 'object' ? (data.kind ?? null) : null
      unknownMessage = String((error && error.message) ?? error)
        .trim()
        .replace(/\s+/g, ' ')
    }
    check(
      'a condition the vocabulary has never heard of was refused by Convex’s own argument validation, naming the field',
      unknownKind === null && unknownMessage.includes('markers'),
      unknownMessage
        ? unknownMessage.slice(0, 180)
        : 'the deployment stored a condition nothing can label, draw or normalise',
    )

    // THE PRESENCE HALF AND THE ABSENCE HALF, in one check because neither is worth having
    // alone.
    await client.mutation('board:setMarkers', {
      code,
      dmCode,
      tokenId: heroToken.tokenId,
      markers: ['concentrating', 'poisoned'],
    })
    await client.mutation('board:setMarkers', {
      code,
      dmCode,
      tokenId: secret.tokenId,
      markers: ['invisible'],
    })
    markedTokens.push(secret.tokenId)
    const markersToPlayer = await markersSeenBy({})
    const markersToDm = await markersSeenBy({ dmCode })
    check(
      'a player got the player-layer coin’s conditions and no row at all for the GM-layer coin',
      markersToPlayer.some((row) => row.tokenId === heroToken.tokenId) &&
        !markersToPlayer.some((row) => row.tokenId === secret.tokenId) &&
        // `invisible` is on the ambush and on nothing else, so the scan is a needle rather
        // than a word that might legitimately be in the payload.
        !JSON.stringify(redactOpaque(markersToPlayer)).includes('invisible') &&
        // Both positive controls: the DM has the row the player does not, and the DM's
        // payload is longer — without them the absence half passes on an empty answer.
        markersToDm.some((row) => row.tokenId === secret.tokenId) &&
        markersToDm.length > markersToPlayer.length,
      `${markersToPlayer.length} rows to a player against ${markersToDm.length} to the DM — positive control included`,
    )

    // THE THREE REFUSALS, OVER A REAL WIRE AND WITH A REAL SEAT — and the write that has to
    // land first, because three refusals prove nothing on a deployment that refuses
    // everything. A player may mark the coins they may drag, which is `requireMovableToken`
    // reused deliberately rather than a third predicate.
    await client.mutation('board:setMarkers', {
      code,
      playerId: seatA.playerId,
      tokenId: heroToken.tokenId,
      markers: ['concentrating'],
    })
    const markedByPlayer = await markerRowFor(heroToken.tokenId)
    check(
      'the seat playing the hero marked its own coin, holding no DM code',
      markedByPlayer && JSON.stringify(markedByPlayer.markers) === JSON.stringify(['concentrating']),
      markedByPlayer
        ? `${JSON.stringify(markedByPlayer.markers)} — the positive control for the three refusals below`
        : 'no marker row came back after a player wrote one',
    )

    const markAs = (tokenId) => () =>
      client.mutation('board:setMarkers', {
        code,
        playerId: seatA.playerId,
        tokenId,
        markers: ['prone'],
      })
    const ungrantedMarkRefusal = await refusalOf(markAs(fogToken.tokenId))
    const sceneryMarkRefusal = await refusalOf(markAs(scenery.tokenId))
    const gmMarkRefusal = await refusalOf(markAs(secret.tokenId))
    const goneMarkRefusal = await refusalOf(markAs(vanishing.tokenId))
    check(
      'three coins, three different refusals — and the GM-layer one is a vanished coin’s word for word',
      ungrantedMarkRefusal !== null &&
        ungrantedMarkRefusal.kind === 'TokenNotYours' &&
        sceneryMarkRefusal !== null &&
        sceneryMarkRefusal.kind === 'TokenNotMovable' &&
        gmMarkRefusal !== null &&
        gmMarkRefusal.kind === 'TokenNotFound' &&
        goneMarkRefusal !== null &&
        // Parity where a secret is behind it, and a deliberate difference where the player is
        // looking straight at the coin — section 31's inversion, reached by a second route.
        JSON.stringify(gmMarkRefusal) === JSON.stringify(goneMarkRefusal) &&
        gmMarkRefusal.message !== sceneryMarkRefusal.message,
      `${ungrantedMarkRefusal && ungrantedMarkRefusal.kind} / ${sceneryMarkRefusal && sceneryMarkRefusal.kind} / ${gmMarkRefusal && gmMarkRefusal.kind}, and the ambush's refusal is ${JSON.stringify(gmMarkRefusal)}`,
    )

    // Cleared here rather than in `finally`, because the clearing is itself the assertion —
    // sections 25, 33 and 34 empty their registries on the way past for the same reason.
    for (const tokenId of [heroToken.tokenId, secret.tokenId]) {
      await client.mutation('board:setMarkers', { code, dmCode, tokenId, markers: [] })
    }
    const noMarkersLeft = await markersSeenBy({ dmCode })
    check(
      'both coins were cleared, and the table holds no row for either',
      !noMarkersLeft.some(
        (row) => row.tokenId === heroToken.tokenId || row.tokenId === secret.tokenId,
      ) &&
        // The positive control again, from the read two calls ago.
        markersToDm.length >= 2,
      `${noMarkersLeft.length} rows left, down from ${markersToDm.length}`,
    )
    markedTokens.length = 0

    // 38. DUPLICATE: N COINS AND N SHEETS IN ONE TRANSACTION, COMPARED FIELD BY FIELD — AND
    // THE BLOB FOUR OF THEM SHARE.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE, and the last of the three is the reason
    // this section is here rather than in the suite.**
    //
    //   - **The field-by-field rebuild, which is this file's oldest trap on a new writer.**
    //     `copyTokenRow` **spreads** `imageId` and `characterId` rather than writing
    //     `imageId: undefined`, and that line exists for this comparison: `undefined` is not
    //     a Convex value, so naming a key and handing it that is a *different write* from
    //     omitting the key, it round-trips through a validator that permits the field to be
    //     absent, and the whole local suite stays green. `firstDifference` reports
    //     `present on one side only`; nothing else in this project ever has.
    //   - **N coins and N sheets in one transaction**, asserted as an observation rather than
    //     read off a docblock: the over-length refusal below is made to fire and the token
    //     and character counts are compared across it, so a writer that inserted before it
    //     validated leaves evidence.
    //   - ⚠️ **THE CHECK NOTHING BUT A DEPLOYMENT CAN MAKE.** convex-test's file storage is
    //     an in-memory stub keyed on the **content hash**, and every upload in this script is
    //     the same seventy bytes — so the four twins are *one* entry there, and a delete of
    //     the wrong blob, of the right blob twice, or of neither are indistinguishable.
    //     There are no bearer URLs to keep resolving either. `board.removeToken`'s delete
    //     became conditional in the commit that first allowed a twin to exist, and *the other
    //     four still have their art* is the acceptance sentence: a URL captured before the
    //     delete, fetched after it, returning the bytes.
    const koboldArt = await uploadPng(client, code, dmCode)
    uploads.push(koboldArt)
    const koboldCharacter = await client.mutation('characters:create', {
      code,
      dmCode,
      name: KOBOLD_COIN_NAME,
      sheet: KOBOLD_SHEET,
    })
    createdCharacters.push(koboldCharacter.characterId)
    // ⚠️ **Three coins on the bare base rather than one coin with a 3 typed on the end**, and
    // the deployment is what decided that: `addToken` runs the DM's typed name through the
    // same numbering rule a duplicate uses, so asking for `… 🐉 3` on a board with no kobolds
    // stores `… 🐉` with the number stripped. Adding three numbers them 1, 2 and 3, and the
    // third is the source every claim below is about. One `imageId` and one `characterId`
    // across the batch, which is `addToken`'s documented answer — *five coins of that
    // creature*, not five creatures — and it makes the shared blob three coins wide before a
    // single copy exists.
    const koboldBatch = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: KOBOLD_BASE,
      layer: 'player',
      sizeSquares: KOBOLD_SIZE,
      tint: KOBOLD_TINT,
      imageId: koboldArt,
      characterId: koboldCharacter.characterId,
      x: 1000,
      y: 1400,
      count: 3,
    })
    for (const tokenId of koboldBatch.tokenIds) created.push(tokenId)
    const kobold = { tokenId: koboldBatch.tokenIds[2] }
    const boardAfterBatch = await client.query('board:tokens', { code, dmCode })
    const batchNames = koboldBatch.tokenIds.map((tokenId) => {
      const row = boardAfterBatch.find((entry) => entry._id === tokenId)
      return row ? row.name : null
    })
    const batchDrift = firstDifference(
      [1, 2, 3].map((n) => `${KOBOLD_BASE} ${n}`),
      batchNames,
      'names',
    )
    check(
      'three coins added on a base with an astral character in it were numbered 1, 2 and 3',
      batchDrift === null,
      batchDrift ?? `${JSON.stringify(batchNames)} — the third of them is the source below`,
    )

    // Granted before the copy is made, so *grants are dropped* is a claim about a grant that
    // really existed rather than about an empty array staying empty.
    await client.mutation('board:setControllers', {
      code,
      dmCode,
      tokenId: kobold.tokenId,
      playerIds: [seatA.playerId],
    })
    grantedTokens.push(kobold.tokenId)

    const koboldRow = await tokensOf(kobold.tokenId)
    const copies = await client.mutation('board:duplicateToken', {
      code,
      dmCode,
      sceneId,
      tokenId: kobold.tokenId,
      count: 3,
    })
    for (const tokenId of copies.tokenIds) created.push(tokenId)
    const copyNames = [4, 5, 6].map((n) => `${KOBOLD_BASE} ${n}`)
    const sourceAfterCopy = await tokensOf(kobold.tokenId)
    const nameDrift = firstDifference(copyNames, copies.names, 'names')
    check(
      'three copies were numbered on from the source, and the source was not renamed',
      nameDrift === null &&
        copies.tokenIds.length === 3 &&
        sourceAfterCopy &&
        sourceAfterCopy.name === KOBOLD_COIN_NAME &&
        // Asserted rather than trusted: a fixture edited down to ASCII would make the base
        // rule cross the wire over a string nothing interesting could happen to.
        KOBOLD_COIN_NAME.length > [...KOBOLD_COIN_NAME].length,
      nameDrift ??
        `${JSON.stringify(copies.names)} beside a source still called ${JSON.stringify(sourceAfterCopy.name)}, ${KOBOLD_COIN_NAME.length} code units and ${[...KOBOLD_COIN_NAME].length} code points`,
    )

    const boardAfterCopies = await client.query('board:tokens', { code, dmCode })
    const copyRows = copies.tokenIds.map(
      (tokenId) => boardAfterCopies.find((row) => row._id === tokenId) ?? null,
    )
    for (const copy of copyRows) {
      if (copy && copy.characterId) createdCharacters.push(copy.characterId)
    }

    // FIELD BY FIELD AGAINST THE SOURCE. Six of the nine keys are substituted with what the
    // copy is *supposed* to hold — its own id, its numbered name, its own art URL, its own
    // character, and two empty arrays because a grant does not travel — so what is left
    // compared verbatim is `layer`, `sizeSquares` and `tint`, which is exactly the row the
    // rebuild has to carry. A key the rebuild forgot arrives here as
    // `present on one side only`.
    let copyDrift = null
    for (const [index, copy] of copyRows.entries()) {
      if (!copy) {
        copyDrift = `copy${index + 1}: did not come back off the board at all`
        break
      }
      const expected = {
        ...koboldRow,
        _id: copy._id,
        name: copyNames[index],
        artUrl: copy.artUrl,
        characterId: copy.characterId,
        controllerIds: [],
        grantedPlayerIds: [],
      }
      copyDrift = firstDifference(expected, copy, `copy${index + 1}`)
      if (copyDrift) break
      if (copy.artUrl === null) {
        copyDrift = `copy${index + 1}.artUrl: the copy came back with no art`
        break
      }
      if (copy.characterId === null || copy.characterId === koboldRow.characterId) {
        copyDrift = `copy${index + 1}.characterId: ${JSON.stringify(copy.characterId)} against the source's ${JSON.stringify(koboldRow.characterId)} — a copy must not share a sheet`
        break
      }
    }
    check(
      'every copy matched the source field by field — layer, size and tint carried, art shared, grants dropped, a sheet of its own',
      copyDrift === null &&
        // The positive control on the substitution: the source really was granted, so the
        // two empty arrays above are a grant being dropped rather than one never existing.
        koboldRow &&
        koboldRow.grantedPlayerIds.includes(seatA.playerId),
      copyDrift ??
        `3 copies at ${koboldRow.sizeSquares} squares on ${koboldRow.layer}, tint ${koboldRow.tint}, from a source granted to ${JSON.stringify(koboldRow.grantedPlayerIds)}`,
    )

    // AND THE SHEET, which is the other half of the transaction. `_id` and `name` come off
    // because those are the two things a copy is *meant* to differ in; everything else — the
    // resolved sheet, the selections, the extras, the creature labels — has to be the same
    // document.
    const sheetBodyOf = (payload) => {
      const body = { ...payload }
      delete body._id
      delete body.name
      return body
    }
    const sourceSheet = await client.query('characters:sheet', {
      code,
      dmCode,
      characterId: koboldCharacter.characterId,
    })
    let sheetDrift = sourceSheet === null ? 'no sheet came back for the source' : null
    if (sheetDrift === null) {
      for (const [index, copy] of copyRows.entries()) {
        const copySheet = await client.query('characters:sheet', {
          code,
          dmCode,
          characterId: copy.characterId,
        })
        sheetDrift =
          copySheet === null
            ? `copy${index + 1}Sheet: no sheet came back`
            : firstDifference(sheetBodyOf(sourceSheet), sheetBodyOf(copySheet), `copy${index + 1}Sheet`)
        if (sheetDrift) break
      }
    }
    check(
      'each copy’s sheet is the source’s, field for field, under a name of its own',
      sheetDrift === null,
      sheetDrift ??
        `${sourceSheet.sheet.kind} sheet at ${sourceSheet.sheet.maxHp} hp, copied three times`,
    )

    // ⚠️ **THE ROLL20 TRAP, ASSERTED.** Roll20's own documentation tells a GM that eight
    // identical goblins have to have their hit-point bars manually unlinked or damaging one
    // damages all eight. One point of damage to one copy, and the other three rows have to
    // be untouched — which is a claim about four documents and is meaningless with fewer.
    await client.mutation('characters:adjustHp', {
      code,
      dmCode,
      characterId: copyRows[0].characterId,
      delta: -KOBOLD_DAMAGE,
    })
    const vitalsAfterDamage = await client.query('characters:vitals', { code, dmCode })
    const vitalsOf = (characterId) =>
      vitalsAfterDamage.find((row) => row.characterId === characterId) ?? null
    const hurtCopy = vitalsOf(copyRows[0].characterId)
    const unhurtTwins = [
      koboldCharacter.characterId,
      copyRows[1].characterId,
      copyRows[2].characterId,
    ].map(vitalsOf)
    check(
      'damaging one copy moved one health bar — the source and the other two are still at full',
      hurtCopy &&
        hurtCopy.kind === 'exact' &&
        hurtCopy.current === KOBOLD_MAX_HP - KOBOLD_DAMAGE &&
        hurtCopy.max === KOBOLD_MAX_HP &&
        unhurtTwins.every(
          (row) =>
            row && row.kind === 'exact' && row.current === KOBOLD_MAX_HP && row.max === KOBOLD_MAX_HP,
        ),
      `${hurtCopy ? hurtCopy.current : 'no row'} of ${KOBOLD_MAX_HP} on the one that was hit, ${JSON.stringify(unhurtTwins.map((row) => row && row.current))} on the other three`,
    )

    // RESERVED TRAVELS, AND IT IS FAIL-CLOSED. A hero the DM has withheld from the table must
    // not become visible by being copied — so the flag is carried, and the copy is absent
    // from a player's list exactly as its source is.
    await client.mutation('characters:setReserved', {
      code,
      dmCode,
      characterId: koboldCharacter.characterId,
      reserved: true,
    })
    reservedCharacters.push(koboldCharacter.characterId)
    const reservedCopy = await client.mutation('board:duplicateToken', {
      code,
      dmCode,
      sceneId,
      tokenId: kobold.tokenId,
      count: 1,
    })
    created.push(reservedCopy.tokenIds[0])
    const reservedCopyRow = await tokensOf(reservedCopy.tokenIds[0])
    if (reservedCopyRow && reservedCopyRow.characterId) {
      createdCharacters.push(reservedCopyRow.characterId)
      reservedCharacters.push(reservedCopyRow.characterId)
    }
    const charactersToDm = await client.query('characters:list', { code, dmCode })
    const charactersToPlayer = await client.query('characters:list', { code })
    const reservedCopyId = reservedCopyRow ? reservedCopyRow.characterId : null
    const reservedCopyListing = charactersToDm.find((row) => row._id === reservedCopyId) ?? null
    check(
      'the copy of a reserved hero is reserved too, and absent from a player’s list',
      reservedCopyListing !== null &&
        reservedCopyListing.reserved === true &&
        !charactersToPlayer.some((row) => row._id === reservedCopyId) &&
        // The positive control, and it is the copies made *before* the reservation: they are
        // unreserved and they are in a player's list, so this is a flag travelling rather
        // than the whole list being withheld.
        charactersToDm.find((row) => row._id === copyRows[1].characterId)?.reserved === false &&
        charactersToPlayer.some((row) => row._id === copyRows[1].characterId),
      reservedCopyListing
        ? `${JSON.stringify(reservedCopyListing.name)} reserved, absent from ${charactersToPlayer.length} player-visible rows of ${charactersToDm.length}`
        : 'the copy did not appear in the DM’s list',
    )

    // ⚠️ **THE CHECK NOTHING BUT A DEPLOYMENT CAN MAKE.** The URL is captured before the
    // delete and fetched after it: the bytes have to still be there, because four other
    // coins point at the same blob. An unconditional `ctx.storage.delete` here is the failure
    // the roadmap names — `Goblin 2` becoming a purple disc mid-fight — and it is invisible
    // to a store that never held two copies of one file.
    const sharedArtUrl = koboldRow.artUrl
    const doomedCopy = copyRows[0]
    await client.mutation('board:removeToken', { code, dmCode, tokenId: doomedCopy._id })
    // Off the cleanup list the instant it is gone, or a run that went perfectly reports a
    // failed cleanup step for a coin this section deleted on purpose.
    created.splice(created.indexOf(doomedCopy._id), 1)
    const artAfterDelete = sharedArtUrl ? await fetch(sharedArtUrl) : null
    const bytesBack =
      artAfterDelete && artAfterDelete.ok ? (await artAfterDelete.arrayBuffer()).byteLength : 0
    const survivingCopy = await tokensOf(copyRows[1]._id)
    check(
      'deleting one copy left the blob its twins share — the URL still resolves and still returns the bytes',
      artAfterDelete !== null &&
        artAfterDelete.ok &&
        bytesBack === Buffer.from(PNG_BASE64, 'base64').byteLength &&
        // The positive control on *shared*: the same blob means the same URL, so a copy that
        // had quietly been given art of its own would make this a claim about nothing.
        survivingCopy !== null &&
        survivingCopy.artUrl === sharedArtUrl,
      artAfterDelete
        ? `${artAfterDelete.status} and ${bytesBack} bytes from the URL captured before the delete, still shared by ${copyRows.length} of the copies`
        : 'no art URL to re-fetch',
    )

    // THE COUNT BOUND, at the function boundary and just past it. Zero and eleven are the two
    // ends; 2.5 is the one a spinner produces and the one `Number.isInteger` is there for.
    for (const [label, count] of [
      ['no copies at all', 0],
      ['a fractional count', 2.5],
      ['one more than the cap', MAX_DUPLICATE_COUNT + 1],
    ]) {
      const countRefusal = await refusalOf(() =>
        client.mutation('board:duplicateToken', {
          code,
          dmCode,
          sceneId,
          tokenId: kobold.tokenId,
          count,
        }),
      )
      check(
        `board:duplicateToken refused ${label} as BadInput`,
        countRefusal !== null && countRefusal.kind === 'BadInput',
        countRefusal ? JSON.stringify(countRefusal) : `the deployment accepted a count of ${count}`,
      )
    }

    // THE OVER-LENGTH REFUSAL, AND THE ONE-TRANSACTION CLAIM AS AN OBSERVATION. The DM never
    // typed `… 2` — the app added it — so there is no field whose `maxLength` could have
    // stopped it on the way in, and truncating instead is the Milestone 1 bug exactly: a
    // `slice` counts UTF-16 code units and can leave half an emoji behind.
    const tokensBeforeRefusal = (await client.query('board:tokens', { code, dmCode })).length
    const charactersBeforeRefusal = (await client.query('characters:list', { code, dmCode })).length
    await client.mutation('board:updateToken', {
      code,
      dmCode,
      tokenId: kobold.tokenId,
      name: OVERLONG_SOURCE_NAME,
      sizeSquares: KOBOLD_SIZE,
      tint: KOBOLD_TINT,
    })
    const overlongRefusal = await refusalOf(() =>
      client.mutation('board:duplicateToken', {
        code,
        dmCode,
        sceneId,
        tokenId: kobold.tokenId,
        count: 1,
      }),
    )
    const tokensAfterRefusal = (await client.query('board:tokens', { code, dmCode })).length
    const charactersAfterRefusal = (await client.query('characters:list', { code, dmCode })).length
    check(
      'numbering a name already at the limit was refused, and neither a coin nor a sheet was written',
      overlongRefusal !== null &&
        overlongRefusal.kind === 'BadInput' &&
        tokensAfterRefusal === tokensBeforeRefusal &&
        charactersAfterRefusal === charactersBeforeRefusal &&
        // The boundary, asserted rather than trusted — an innocent edit to the string is how
        // a boundary test stops sitting on the boundary.
        OVERLONG_SOURCE_NAME.length === MAX_TOKEN_NAME_LENGTH,
      overlongRefusal
        ? `${JSON.stringify(overlongRefusal.message)} — ${tokensAfterRefusal} coins and ${charactersAfterRefusal} sheets, unchanged`
        : 'the deployment numbered a copy past the limit',
    )

    // AND *ADD FIVE OF THESE*, FROM SCRATCH, which is the acceptance line: nothing called
    // `Culvert Rat` exists, so `n` is 0 and the run starts at 1 — where duplicating an
    // existing coin continues past what is on the board. The difference is entirely that the
    // source is never renamed, and both are correct. Read back off `board:tokens` rather than
    // off the mutation's own answer, so the names asserted are the names stored.
    const swarm = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: SWARM_NAME,
      layer: 'player',
      sizeSquares: 1,
      tint: '#7f8c8d',
      x: 200,
      y: 200,
      count: 5,
    })
    for (const tokenId of swarm.tokenIds) created.push(tokenId)
    const boardAfterSwarm = await client.query('board:tokens', { code, dmCode })
    const swarmNames = swarm.tokenIds.map((tokenId) => {
      const row = boardAfterSwarm.find((entry) => entry._id === tokenId)
      return row ? row.name : null
    })
    const swarmDrift = firstDifference(
      [1, 2, 3, 4, 5].map((n) => `${SWARM_NAME} ${n}`),
      swarmNames,
      'names',
    )
    check(
      'adding five coins to a board with none gave X 1 … X 5, and the first of them is the returned tokenId',
      swarmDrift === null &&
        swarm.tokenIds.length === 5 &&
        swarm.tokenId === swarm.tokenIds[0],
      swarmDrift ?? JSON.stringify(swarmNames),
    )

    // 39. THE MAP'S OWN COLOUR: AN OPTIONAL COLUMN THAT NO CLIENT EVER SEES AS OPTIONAL,
    // AND A STRING THE BROWSER WILL INTERPRET.
    //
    // Two things here that convex-test genuinely cannot answer. The first is the **shape of
    // the projection**: `publicSceneValidator` declares `backgroundColour` as a required
    // `v.string()` over a column the schema had to make optional, so a deployment that
    // returned the raw field for a scene nobody has coloured would fail its own `returns:`
    // validation — and the suite, which does not apply that validation, would pass. This
    // scene has been on the table for the whole run without ever being coloured, so it is
    // the real *absent* case rather than one arranged for the assertion.
    //
    // The second is the refusal. `<input type="color">` cannot emit any of the strings
    // below, which is exactly why the check has to be somewhere a client cannot reach — the
    // value goes to a CSS `background-color` on every screen at the table.
    const sceneBeforeColour = await client.query('scenes:active', { code })
    check(
      'scenes:active carries a background colour for a scene nobody has coloured',
      sceneBeforeColour !== null &&
        typeof sceneBeforeColour.backgroundColour === 'string' &&
        /^#[0-9a-f]{6}$/i.test(sceneBeforeColour.backgroundColour),
      sceneBeforeColour ? JSON.stringify(sceneBeforeColour.backgroundColour) : 'no active scene',
    )

    const CHOSEN_BACKGROUND = '#3B0A0A'
    await client.mutation('scenes:setBackground', {
      code,
      dmCode,
      sceneId,
      backgroundColour: CHOSEN_BACKGROUND,
    })
    // Read back through the **ungated** query, which is the point rather than convenience:
    // a scene's colour is not a secret, so a caller holding no DM code gets it.
    const sceneAsPlayer = await client.query('scenes:active', { code })
    check(
      'scenes:setBackground round-tripped the colour verbatim, to a caller with no DM code',
      sceneAsPlayer !== null && sceneAsPlayer.backgroundColour === CHOSEN_BACKGROUND,
      sceneAsPlayer ? JSON.stringify(sceneAsPlayer.backgroundColour) : 'no active scene',
    )

    for (const [label, backgroundColour] of [
      ['a CSS colour function', 'rgb(0,0,0)'],
      ['a url()', 'url(https://example.test/x.png)'],
      ['a named colour', 'red'],
      ['the three-digit shorthand', '#123'],
      ['an empty string', ''],
    ]) {
      const colourRefusal = await refusalOf(() =>
        client.mutation('scenes:setBackground', { code, dmCode, sceneId, backgroundColour }),
      )
      check(
        `scenes:setBackground refused ${label} as BadInput`,
        colourRefusal !== null && colourRefusal.kind === 'BadInput',
        colourRefusal
          ? JSON.stringify(colourRefusal)
          : `the deployment stored ${JSON.stringify(backgroundColour)}`,
      )
    }

    const sceneAfterRefusals = await client.query('scenes:active', { code })
    check(
      'none of the refused colours reached the scene',
      sceneAfterRefusals !== null && sceneAfterRefusals.backgroundColour === CHOSEN_BACKGROUND,
      sceneAfterRefusals ? JSON.stringify(sceneAfterRefusals.backgroundColour) : 'no active scene',
    )

    await refuses('scenes:setBackground refused a well-formed wrong DM code', () =>
      client.mutation('scenes:setBackground', {
        code,
        dmCode: 'not-the-dm-code',
        sceneId,
        backgroundColour: '#123456',
      }),
    )

    // 40. THE TWO PUBLISHED SHEET NUMBERS, AND THE SCOPE THAT MAKES PUBLISHING THEM
    // DEFENSIBLE.
    //
    // ⚠️ **A creature's armour class used to reach no player and now reaches every player
    // who can see its coin.** ADR 0014 records the decision; what is checked here is the
    // *scope*, because the scope is the whole of the argument: the number goes to people
    // already being told the creature exists, and to nobody else.
    //
    // What only a deployment can answer is the **shape**. `publicVitalsValidator` declares
    // both fields on both members of a union, as `number | null`, and `returns:` validation
    // is exactly what convex-test does not apply — so a projection that put one on one
    // member and forgot the other passes the suite and is rejected here.
    const vitalsToDm = await client.query('characters:vitals', { code, dmCode })
    const vitalsToPlayer = await client.query('characters:vitals', { code })

    const hasBothFields = (rows) =>
      rows.length > 0 &&
      rows.every(
        (row) =>
          'armourClass' in row &&
          'passivePerception' in row &&
          (row.armourClass === null || typeof row.armourClass === 'number') &&
          (row.passivePerception === null || typeof row.passivePerception === 'number'),
      )

    check(
      'characters:vitals carries armourClass and passivePerception on every row, to both audiences',
      hasBothFields(vitalsToDm) && hasBothFields(vitalsToPlayer),
      `${vitalsToDm.length} rows to the DM, ${vitalsToPlayer.length} to a player`,
    )

    // ⚠️ **Both variants, asserted as variants.** The `band` rows are the player's view of a
    // creature and the `exact` rows are a hero's — a deployment that had put the two fields
    // on `exact` only would satisfy the DM's payload entirely and fail here.
    const playerBands = vitalsToPlayer.filter((row) => row.kind === 'band')
    check(
      'a player’s band rows carry an armour class and still carry no hit point',
      playerBands.length > 0 &&
        playerBands.every(
          (row) =>
            typeof row.armourClass === 'number' &&
            !('current' in row) &&
            !('max' in row),
        ),
      `${playerBands.length} band rows, keys ${JSON.stringify(Object.keys(playerBands[0] ?? {}).sort())}`,
    )

    // THE SCOPE. The GM-layer coin created in section 3 stands for no character, so this
    // section makes its own: a creature on the GM layer with an armour class that appears
    // nowhere else in the game.
    const RAFTERS_AC = 29
    const rafters = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'The Thing In The Rafters',
      sheet: {
        kind: 'npc',
        armourClass: RAFTERS_AC,
        maxHp: 33,
        initiativeBonus: 0,
        actions: [],
        notes: '',
      },
    })
    createdCharacters.push(rafters.characterId)
    const raftersToken = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId,
      name: 'Rafters',
      layer: 'gm',
      sizeSquares: 1,
      tint: '#1f2937',
      characterId: rafters.characterId,
      x: 500,
      y: 500,
    })
    created.push(raftersToken.tokenId)

    // A word-boundary scan, so 29 is not found inside 129 or inside a document id.
    const containsWholeNumber = (haystack, value) =>
      new RegExp(`(?<![\\w.])${value}(?![\\w.])`).test(haystack)

    const afterRaftersToPlayer = JSON.stringify(
      await client.query('characters:vitals', { code }),
    )
    const afterRaftersToDm = JSON.stringify(
      await client.query('characters:vitals', { code, dmCode }),
    )
    check(
      'a GM-layer creature’s armour class is absent from a player’s vitals payload, and present in the DM’s',
      !containsWholeNumber(afterRaftersToPlayer, RAFTERS_AC) &&
        !afterRaftersToPlayer.includes(rafters.characterId) &&
        // The positive control. Without it this passes on a payload that failed to build.
        containsWholeNumber(afterRaftersToDm, RAFTERS_AC) &&
        afterRaftersToDm.includes(rafters.characterId),
      `${RAFTERS_AC} ${containsWholeNumber(afterRaftersToDm, RAFTERS_AC) ? 'reached' : 'did not reach'} the DM and ${containsWholeNumber(afterRaftersToPlayer, RAFTERS_AC) ? 'reached' : 'did not reach'} the player`,
    )

    // AND THE `null` CASE, which is the one a wrong implementation gets wrong by printing
    // 10. This creature's sheet records no passive perception, so its row must carry null
    // rather than a number — for the DM, who is the audience that can see it at all.
    const raftersRowToDm = (await client.query('characters:vitals', { code, dmCode })).find(
      (row) => row.characterId === rafters.characterId,
    )
    check(
      'a creature with no recorded passive perception travels as null rather than as 10',
      raftersRowToDm !== undefined &&
        raftersRowToDm.passivePerception === null &&
        raftersRowToDm.armourClass === RAFTERS_AC,
      raftersRowToDm ? JSON.stringify(raftersRowToDm) : 'no row for the rafters at all',
    )

    // 41. THE WIDENED DICE GRAMMAR, AT BOTH ITS NEW EDGES.
    //
    // `feed:rollDice` is the one place an expression legitimately arrives from a person, so
    // it is where the grammar is reachable as an *argument* rather than as a stored field.
    // What a deployment adds over the suite here is the whole round trip: fifty dice have to
    // be generated, validated on the way out through `feed:list`'s own `returns:` validator,
    // and come back as fifty entries — a projection that capped the array somewhere would
    // pass convex-test and fail here.
    // Any seat this run has already made. An ad-hoc roll is announced as the *person*, so
    // it needs one — and there is no reason for this section to create a third.
    const feedRoller = seats[0]
    if (feedRoller) {
      const beforeRoll = (await client.query('feed:list', { code })).length
      await client.mutation('feed:rollDice', {
        code,
        playerId: feedRoller,
        expression: '50d6',
        mode: 'flat',
        dmOnly: false,
      })
      const afterRoll = await client.query('feed:list', { code })
      const fiftyRow = afterRoll.find((row) => row.roll && row.roll.expression === '50d6')
      check(
        'feed:rollDice accepted fifty dice and the line came back with fifty of them',
        afterRoll.length === beforeRoll + 1 &&
          fiftyRow !== undefined &&
          Array.isArray(fiftyRow.roll.dice) &&
          fiftyRow.roll.dice.length === 50 &&
          // Every face in range, so this is fifty real d6 rather than a padded array.
          fiftyRow.roll.dice.every((die) => die.faces === 6 && die.value >= 1 && die.value <= 6),
        fiftyRow ? `${fiftyRow.roll.dice.length} dice, total ${fiftyRow.roll.total}` : 'no line',
      )

      await client.mutation('feed:rollDice', {
        code,
        playerId: feedRoller,
        expression: '1d2',
        mode: 'flat',
        dmOnly: false,
      })
      const afterD2 = await client.query('feed:list', { code })
      const d2Row = afterD2.find((row) => row.roll && row.roll.expression === '1d2')
      check(
        'feed:rollDice accepted the new d2 and rolled a 1 or a 2',
        d2Row !== undefined &&
          d2Row.roll.dice.length === 1 &&
          d2Row.roll.dice[0].faces === 2 &&
          [1, 2].includes(d2Row.roll.dice[0].value),
        d2Row ? JSON.stringify(d2Row.roll.dice) : 'no line',
      )

      // The far side of both edges. `d3` is the case that says d2 was added to an
      // allow-list rather than the allow-list being abandoned.
      for (const [label, expression] of [
        ['one more die than the cap', '51d6'],
        ['a die the allow-list still refuses', '1d3'],
      ]) {
        const rollRefusal = await refusalOf(() =>
          client.mutation('feed:rollDice', {
            code,
            playerId: feedRoller,
            expression,
            mode: 'flat',
            dmOnly: false,
          }),
        )
        check(
          `feed:rollDice refused ${label} as BadInput`,
          rollRefusal !== null && rollRefusal.kind === 'BadInput',
          rollRefusal ? JSON.stringify(rollRefusal) : `the deployment rolled ${expression}`,
        )
      }
    }

    // 42. MANAGING THE MAPS: TWO OPTIONAL COLUMNS ON A POPULATED TABLE, A SHARED BLOB, AND
    // A REWRITE OF EVERY COORDINATE ON A BOARD.
    //
    // ⚠️ **Worked on a scene of its own rather than on `sceneId`**, and that is not tidiness:
    // `scenes:replaceImage` multiplies every placement and every fog rectangle on the board
    // it is given, so running it on the run's main scene would move the coins forty earlier
    // checks are about. The scene made here is pushed to `extraScenes` and swept in `finally`.
    //
    // What the suite cannot answer, in the order the checks come:
    //
    //   - **`notes` and `order` are new optional columns on a populated table**, and
    //     `dmSceneValidator` declares both as *required* over them. A deployment that
    //     returned the raw fields for a scene nobody has written notes on or reordered would
    //     fail its own `returns:` validation, and convex-test does not apply it.
    //   - **The leak.** `scenes:active` is ungated and every player subscribes to it, so the
    //     notes are scanned for out of a real payload fetched with no DM code at all, with
    //     the DM's own list as the positive control.
    //   - **A duplicate shares the map blob**, so deleting one map must not blank the other —
    //     the bug that made two unconditional `ctx.storage.delete` calls conditional. Asserted
    //     by re-fetching the copy's signed URL after the original goes, which is the only
    //     version of that claim a real deployment can make.
    //   - **Real float64s through the rescale.** The grid offsets here are fractional on
    //     purpose, so the multiplication is arithmetic over the same doubles the position
    //     table stores rather than over integers that would survive any bug.
    const mapAdminImage = await uploadPng(client, code, dmCode)
    uploads.push(mapAdminImage)
    const mapAdminThumb = await uploadPng(client, code, dmCode)
    uploads.push(mapAdminThumb)
    const managed = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'The Sunken Chapel',
      imageId: mapAdminImage,
      thumbnailId: mapAdminThumb,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    extraScenes.push(managed.sceneId)

    const listedAs = async (id) =>
      (await client.query('scenes:list', { code, dmCode })).find((row) => row._id === id) ?? null

    const beforeNotes = await listedAs(managed.sceneId)
    check(
      'scenes:list declares notes and order as required over two absent columns',
      beforeNotes !== null &&
        beforeNotes.notes === '' &&
        Number.isInteger(beforeNotes.order) &&
        beforeNotes.order >= 0,
      beforeNotes
        ? `notes ${JSON.stringify(beforeNotes.notes)}, order ${beforeNotes.order}`
        : 'not listed',
    )

    const PREP = 'the lich behind the altar is invisible until somebody casts detect magic'
    await client.mutation('scenes:setNotes', { code, dmCode, sceneId: managed.sceneId, notes: PREP })
    await client.mutation('scenes:setActive', { code, dmCode, sceneId: managed.sceneId })

    const asTheTable = await client.query('scenes:active', { code })
    const asTheDm = await listedAs(managed.sceneId)
    check(
      'the DM’s prep reached the DM and reached nobody else',
      asTheDm !== null &&
        asTheDm.notes === PREP &&
        asTheTable !== null &&
        !JSON.stringify(asTheTable).includes('lich') &&
        !Object.prototype.hasOwnProperty.call(asTheTable, 'notes'),
      asTheDm ? `${asTheDm.notes.length} characters to the DM, ${Object.keys(asTheTable ?? {}).length} keys to the table` : 'not listed',
    )
    // Put the table back on the board every other section is about, before anything below
    // starts moving this one around.
    await client.mutation('scenes:setActive', { code, dmCode, sceneId })

    // REORDER: THE WHOLE LIST, ONE TRANSACTION. A permutation check the deployment performs
    // over its own rows, which is why the refusal below is worth a round trip.
    const allSceneIds = (await client.query('scenes:list', { code, dmCode })).map((row) => row._id)
    const reversed = [...allSceneIds].reverse()
    await client.mutation('scenes:reorder', { code, dmCode, sceneIds: reversed })
    const afterReorder = (await client.query('scenes:list', { code, dmCode })).map((row) => row._id)
    check(
      'scenes:reorder stored the whole ordering and the list came back in it',
      JSON.stringify(afterReorder) === JSON.stringify(reversed),
      `${afterReorder.length} maps, reversed`,
    )
    await refuses('scenes:reorder refused a partial list', () =>
      client.mutation('scenes:reorder', { code, dmCode, sceneIds: [managed.sceneId] }),
    )

    // DUPLICATE: THE SHARED BLOB, AND THE DELETE THAT MUST NOT RECLAIM IT.
    const copy = await client.mutation('scenes:duplicate', {
      code,
      dmCode,
      sceneId: managed.sceneId,
      includeContents: false,
    })
    extraScenes.push(copy.sceneId)
    const copyRow = await listedAs(copy.sceneId)
    check(
      'scenes:duplicate copied the notes and the grid and did not go on the table',
      copyRow !== null &&
        copyRow.name === 'The Sunken Chapel (copy)' &&
        copyRow.notes === PREP &&
        copyRow._id !== (await client.query('scenes:active', { code }))?._id,
      copyRow ? copyRow.name : 'the copy is not in the list',
    )

    // Deleting the original: the copy's picture has to survive, and the only honest way to
    // ask a deployment that is to fetch the bytes.
    await client.mutation('scenes:remove', { code, dmCode, sceneId: managed.sceneId })
    extraScenes.splice(extraScenes.indexOf(managed.sceneId), 1)
    const copyAfterDelete = await listedAs(copy.sceneId)
    const sharedFetch = copyAfterDelete?.imageUrl ? await fetch(copyAfterDelete.imageUrl) : null
    check(
      'deleting the original left the duplicate’s shared map image in storage',
      sharedFetch !== null && sharedFetch.ok,
      sharedFetch ? `${sharedFetch.status} from the copy’s image URL` : 'no image URL to fetch',
    )

    // REPLACE: ONE FACTOR THROUGH THE GRID, THE PLACEMENTS AND THE FOG.
    await client.mutation('scenes:updateGrid', {
      code,
      dmCode,
      sceneId: copy.sceneId,
      gridSize: GRID.gridSize,
      gridOffsetX: GRID.gridOffsetX,
      gridOffsetY: GRID.gridOffsetY,
      gridVisible: true,
    })
    await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId: copy.sceneId,
      shape: { kind: 'rect', x: 101.5, y: 202.25, width: 303.75, height: 404.5 },
    })
    // ⚠️ **A polygon as well, because the box and the outline are two representations of one
    // shape and `replaceImage` has to move both.** Scaling the four numbers and leaving the
    // vertices gives a correctly-sized bounding box around the old map's outline — a shape that
    // hides the wrong part of the map, and one that looks like a rendering bug from either
    // chair. Fractional on purpose: these are real float64s through a real deployment.
    await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId: copy.sceneId,
      shape: {
        kind: 'polygon',
        points: [
          { x: 600.5, y: 300.25 },
          { x: 800.25, y: 340.5 },
          { x: 700.75, y: 520.5 },
        ],
      },
    })

    const differentShape = await uploadPng(client, code, dmCode)
    uploads.push(differentShape)
    await refuses('scenes:replaceImage refused a map of a different shape', () =>
      client.mutation('scenes:replaceImage', {
        code,
        dmCode,
        sceneId: copy.sceneId,
        imageId: differentShape,
        imageWidth: MAP_HEIGHT,
        imageHeight: MAP_WIDTH,
      }),
    )

    const doubled = await uploadPng(client, code, dmCode)
    uploads.push(doubled)
    await client.mutation('scenes:replaceImage', {
      code,
      dmCode,
      sceneId: copy.sceneId,
      imageId: doubled,
      imageWidth: MAP_WIDTH * 2,
      imageHeight: MAP_HEIGHT * 2,
    })
    const scaledMap = await listedAs(copy.sceneId)
    const scaledFog = await client.query('fog:list', { code, dmCode, sceneId: copy.sceneId })
    const scaledRect = scaledFog.find((row) => row.points === undefined) ?? null
    const scaledPolygon = scaledFog.find((row) => row.points !== undefined) ?? null
    check(
      'scenes:replaceImage put one factor through the grid and the fog, in real float64s',
      scaledMap !== null &&
        scaledMap.imageWidth === MAP_WIDTH * 2 &&
        scaledMap.gridSize === GRID.gridSize * 2 &&
        scaledMap.gridOffsetX === GRID.gridOffsetX * 2 &&
        scaledMap.gridOffsetY === GRID.gridOffsetY * 2 &&
        scaledFog.length === 2 &&
        scaledRect !== null &&
        scaledRect.x === 203 &&
        scaledRect.y === 404.5 &&
        scaledRect.width === 607.5 &&
        scaledRect.height === 809,
      scaledMap
        ? `grid ${scaledMap.gridSize} / ${scaledMap.gridOffsetX} / ${scaledMap.gridOffsetY}, fog ${JSON.stringify(scaledRect)}`
        : 'the copy is not in the list',
    )

    // ⚠️ **The polygon's vertices moved by the same factor as its box, in real float64s.**
    // Compared field for field rather than value-compared, so a deployment that scaled the box
    // and left the outline is *named* rather than reported as an inequality — which is the one
    // failure this whole fixture pair exists for, and the one that reads as a rendering bug
    // rather than as a data bug from either chair.
    const polygonScaleDrift = scaledPolygon
      ? firstDifference(
          {
            _id: scaledPolygon._id,
            x: 1201,
            y: 600.5,
            width: 399.5,
            height: 440.5,
            points: [
              { x: 1201, y: 600.5 },
              { x: 1600.5, y: 681 },
              { x: 1401.5, y: 1041 },
            ],
          },
          scaledPolygon,
          'scaledPolygon',
        )
      : 'no polygon came back'
    check(
      'a polygon’s vertices scaled with its box, and both are the same one factor',
      polygonScaleDrift === null,
      polygonScaleDrift ?? JSON.stringify(scaledPolygon),
    )

    // 43. A MAP THAT STARTS COVERED, AND A SHAPE THAT IS NOT A RECTANGLE.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE, and there are three things here rather than
    // one.**
    //
    //   - **An optional field whose absence has a meaning.** `scenes.fogBase` is absent on every
    //     row this deployment already holds, and `fogBaseOf` answers `lit` for it. The local
    //     suite creates its scenes through the same mutation, so it proves the *default* and
    //     structurally cannot prove that a row written *before the field existed* still reads as
    //     lit — because it has no such rows. This script talks to the deployment that does.
    //   - **A discriminated union as an argument validator.** `fog:draw` takes `rect | polygon`
    //     and Convex's own value validation is the only thing refusing a call that carries
    //     neither, or both. `convex-test` does not apply it.
    //   - **An array of float64 objects through a new optional column.** `points` is the first
    //     nested array of records this schema stores, and floats through a real deployment are
    //     this script's oldest speciality.
    const baseSceneArt = await uploadPng(client, code, dmCode)
    uploads.push(baseSceneArt)
    const baseScene = await client.mutation('scenes:create', {
      code,
      dmCode,
      name: 'Board Smoke — The Covered Vault',
      imageId: baseSceneArt,
      imageWidth: MAP_WIDTH,
      imageHeight: MAP_HEIGHT,
    })
    extraScenes.push(baseScene.sceneId)

    // (a) THE ABSENT FIELD, RESOLVED BY THE SERVER. A brand-new scene is written with no
    // `fogBase` at all, and the projection must still carry a real base — because the browser
    // must never spell the absent-means-lit default a second time. A client that disagreed with
    // the server about whether a map is covered is a client that paints the party a floor plan.
    const freshScenes = await client.query('scenes:list', { code, dmCode })
    const freshRow = freshScenes.find((row) => row._id === baseScene.sceneId) ?? null
    check(
      'a scene created with no fogBase comes back as lit, resolved server-side',
      freshRow !== null && freshRow.fogBase === 'lit',
      freshRow ? `fogBase ${JSON.stringify(freshRow.fogBase)}` : 'the new scene did not come back',
    )

    // (b) A POLYGON ROUND TRIP. Five points, deliberately not axis-aligned and deliberately
    // fractional, so a deployment that rounded a coordinate or dropped the array is named. The
    // bounding box is **computed server-side and never taken from the client**, so the four
    // numbers that come back are an answer rather than an echo — which is the whole reason the
    // union has two members instead of one shape with an optional point list.
    const pentagon = [
      { x: 300.5, y: 400.25 },
      { x: 520.75, y: 360.5 },
      { x: 610.25, y: 560.75 },
      { x: 450.5, y: 700.25 },
      { x: 280.75, y: 590.5 },
    ]
    const polygon = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId: baseScene.sceneId,
      shape: { kind: 'polygon', points: pentagon },
    })
    const polygonRows = await client.query('fog:list', { code, sceneId: baseScene.sceneId, dmCode })
    const polygonRow = polygonRows.find((row) => row._id === polygon.fogId) ?? null
    // The box the server should have computed, spelled out by hand rather than derived from the
    // same helper the server used — a shared helper would agree with itself.
    const expectedBox = { x: 280.75, y: 360.5, width: 329.5, height: 339.75 }
    const polygonDrift = polygonRow
      ? firstDifference(
          { _id: polygon.fogId, ...expectedBox, points: pentagon },
          polygonRow,
          'polygon',
        )
      : 'no polygon came back'
    check(
      'a five-point polygon round-tripped with its points intact and a server-computed box',
      polygonDrift === null,
      polygonDrift ?? `stored ${JSON.stringify(polygonRow)}`,
    )

    // ⚠️ **THE FIXTURE PAIR.** `points` is optional, so the trap this script exists for is a
    // rebuild that drops it — or, in the other direction, one that writes `points: undefined`
    // onto a rectangle. `firstDifference` reports a key present on one side only, so a rectangle
    // sent with no points must come back with **no `points` key at all**.
    const alsoRect = await client.mutation('fog:draw', {
      code,
      dmCode,
      sceneId: baseScene.sceneId,
      shape: { kind: 'rect', x: 1200, y: 900, width: 240, height: 180 },
    })
    const rectRow =
      (await client.query('fog:list', { code, sceneId: baseScene.sceneId, dmCode })).find(
        (row) => row._id === alsoRect.fogId,
      ) ?? null
    const rectDrift = rectRow
      ? firstDifference(
          { _id: alsoRect.fogId, x: 1200, y: 900, width: 240, height: 180 },
          rectRow,
          'rect',
        )
      : 'no rectangle came back'
    check(
      'a rectangle sent with no points came back with no points key — the fixture pair',
      rectDrift === null,
      rectDrift ?? `stored ${JSON.stringify(rectRow)}`,
    )

    // (c) WHAT THE UNION REFUSES. Neither member, both members, and a polygon below the three
    // points a region needs — each refused by Convex's own validation or by the argument check
    // in front of every read, and none of them reachable from the local suite.
    for (const [label, shape] of [
      ['a shape naming neither member', { x: 0, y: 0, width: 10, height: 10 }],
      ['a shape naming both spellings', { kind: 'rect', x: 0, y: 0, width: 10, height: 10, points: pentagon }],
      ['a polygon of two points', { kind: 'polygon', points: pentagon.slice(0, 2) }],
      ['a polygon with a NaN vertex', { kind: 'polygon', points: [{ x: Number.NaN, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 5 }] }],
    ]) {
      await refuses(`fog:draw refused ${label}`, () =>
        client.mutation('fog:draw', { code, dmCode, sceneId: baseScene.sceneId, shape }),
      )
    }

    // (d) THE BASE, FLIPPED — and the property the confirm dialog promises in words: **nothing
    // is deleted.** Two shapes are on this scene; both must survive the flip and the flip back,
    // which is what makes "flipping back returns it exactly as it is now" true rather than
    // hopeful.
    const beforeFlip = JSON.stringify(
      await client.query('fog:list', { code, sceneId: baseScene.sceneId, dmCode }),
    )
    await client.mutation('scenes:setFogBase', {
      code,
      dmCode,
      sceneId: baseScene.sceneId,
      fogBase: 'dark',
    })
    const darkRow =
      (await client.query('scenes:list', { code, dmCode })).find(
        (row) => row._id === baseScene.sceneId,
      ) ?? null
    const afterFlip = JSON.stringify(
      await client.query('fog:list', { code, sceneId: baseScene.sceneId, dmCode }),
    )
    check(
      'flipping a map to dark kept both shapes byte for byte',
      darkRow !== null && darkRow.fogBase === 'dark' && afterFlip === beforeFlip,
      darkRow ? `base ${darkRow.fogBase}, shapes ${afterFlip === beforeFlip}` : 'no scene row',
    )

    await refuses('scenes:setFogBase refused a caller without the DM code', () =>
      client.mutation('scenes:setFogBase', {
        code,
        dmCode: 'not-the-dm-code',
        sceneId: baseScene.sceneId,
        fogBase: 'lit',
      }),
    )
    await refuses('scenes:setFogBase refused a base that is not one of the two', () =>
      client.mutation('scenes:setFogBase', {
        code,
        dmCode,
        sceneId: baseScene.sceneId,
        fogBase: 'candlelit',
      }),
    )

    // 44. WALLS: A NEW TABLE, AN ARRAY OF RECORDS, AND A REFUSAL ON THE SETTLING WRITE ONLY.
    //
    // ⚠️ **WHAT ONLY A REAL DEPLOYMENT CAN SETTLE.** Three things, and the third is the one
    // that matters:
    //
    //   - **A brand-new table whose only column is an array of float64 records.** `points` is
    //     required here — the table is new, so the pressure that makes a field optional in this
    //     schema never applied — and a polyline of real fractional coordinates through real
    //     value validation is this script's oldest speciality.
    //   - **A refusal kind that is deliberately NOT `TokenNotFound`.** Every wall goes to every
    //     client, so a blocked player has been sent the thing that blocked them and there is
    //     nothing to enumerate — answering *not found* about a coin on their own screen would
    //     be a lie that reads as a bug. The suite asserts the kind; this asserts that a real
    //     deployment carries it across the wire as a `ConvexError` payload rather than as a
    //     generic server error.
    //   - ⚠️ **THE SPLIT: the backstop fires on the settling write and on nothing else.** That
    //     is the whole design — `requireMovableToken` runs ten times a second and a range read
    //     there would turn every wall the DM draws into a conflict against every in-flight
    //     drag — and it means an *unsettled* move through a wall is accepted. That is the
    //     advisory ceiling, and it is asserted here as a **positive** rather than described,
    //     because a documented hole no test names becomes a bug report.
    const wallScene = baseScene.sceneId
    const wallSeat = await client.mutation('players:join', {
      code,
      displayName: 'Board Smoke Wall Walker',
    })
    seats.push(wallSeat.playerId)
    const wallChar = await client.mutation('characters:create', {
      code,
      dmCode,
      name: 'Board Smoke Wall Walker',
    })
    createdCharacters.push(wallChar.characterId)
    await client.mutation('characters:claim', {
      code,
      playerId: wallSeat.playerId,
      characterId: wallChar.characterId,
    })
    const walker = await client.mutation('board:addToken', {
      code,
      dmCode,
      sceneId: wallScene,
      name: 'Wall Walker',
      layer: 'player',
      sizeSquares: 1,
      tint: '#2c3e50',
      characterId: wallChar.characterId,
      x: 400,
      y: 400,
    })
    created.push(walker.tokenId)

    // A wall straight down the map between where the coin stands and where it is sent.
    const wall = await client.mutation('walls:add', {
      code,
      dmCode,
      sceneId: wallScene,
      points: [
        { x: 700.5, y: 100.25 },
        { x: 700.5, y: 1500.75 },
      ],
    })
    const wallRows = await client.query('walls:list', { code, dmCode, sceneId: wallScene })
    const wallRow = wallRows.find((row) => row._id === wall.wallId) ?? null
    const wallDrift = wallRow
      ? firstDifference(
          {
            _id: wall.wallId,
            points: [
              { x: 700.5, y: 100.25 },
              { x: 700.5, y: 1500.75 },
            ],
          },
          wallRow,
          'wall',
        )
      : 'no wall came back'
    check(
      'a two-point wall round-tripped with its fractional coordinates intact',
      wallDrift === null,
      wallDrift ?? JSON.stringify(wallRow),
    )

    // ⚠️ **Ungated, but only about the board in front of you** — `fog.list`'s guard restated
    // rather than borrowed, and closing the same hole for a different payload. Every wall on
    // the *active* scene goes to every client, because the client cannot block a drag against
    // geometry it does not have. A wall sketch of a map the party has not reached is a floor
    // plan, and that is withheld. This scene is not the active one, so a player gets nothing.
    check(
      'a wall on a board nobody is looking at reached the DM and not the table',
      wallRow !== null &&
        (await client.query('walls:list', { code, sceneId: wallScene })).length === 0,
      `${wallRows.length} to the DM`,
    )

    // THE BACKSTOP. A settling move from one side of the wall to the other, as the seat rather
    // than as the DM, because walls do not block the DM.
    const blocked = await refusalOf(() =>
      client.mutation('board:moveToken', {
        code,
        playerId: wallSeat.playerId,
        sceneId: wallScene,
        tokenId: walker.tokenId,
        x: 1100,
        y: 400,
        settle: true,
      }),
    )
    check(
      'board:moveToken refused a settling move across a wall, as WallBlocks and not TokenNotFound',
      blocked !== null && blocked.kind === 'WallBlocks',
      blocked ? JSON.stringify(blocked) : 'the deployment let the coin through',
    )

    // ⚠️ **THE ADVISORY CEILING, ASSERTED AS A POSITIVE.** The same move unsettled is accepted:
    // the check is on the settling write only, so a client that never settles can park a coin
    // anywhere. That is written into ADR 0015's costs, and a hole nobody tests is a hole
    // somebody reports.
    const unsettled = await refusalOf(() =>
      client.mutation('board:moveToken', {
        code,
        playerId: wallSeat.playerId,
        sceneId: wallScene,
        tokenId: walker.tokenId,
        x: 1100,
        y: 400,
        settle: false,
      }),
    )
    check(
      'and accepted the identical move unsettled — the advisory ceiling, on the record',
      unsettled === null,
      unsettled ? JSON.stringify(unsettled) : 'the unsettled write went through, as designed',
    )

    // The DM is not blocked. They place creatures inside sealed rooms and drag the party
    // through a door they have just narrated open.
    const asDm = await refusalOf(() =>
      client.mutation('board:moveToken', {
        code,
        dmCode,
        sceneId: wallScene,
        tokenId: walker.tokenId,
        x: 1400,
        y: 400,
        settle: true,
      }),
    )
    check(
      'a wall does not block the DM',
      asDm === null,
      asDm ? JSON.stringify(asDm) : 'the DM crossed it',
    )

    await refuses('walls:add refused a one-point wall', () =>
      client.mutation('walls:add', {
        code,
        dmCode,
        sceneId: wallScene,
        points: [{ x: 10, y: 10 }],
      }),
    )
    await refuses('walls:add refused a NaN vertex', () =>
      client.mutation('walls:add', {
        code,
        dmCode,
        sceneId: wallScene,
        points: [
          { x: Number.NaN, y: 10 },
          { x: 20, y: 20 },
        ],
      }),
    )
    await refuses('walls:add refused a caller without the DM code', () =>
      client.mutation('walls:add', {
        code,
        dmCode: 'not-the-dm-code',
        sceneId: wallScene,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      }),
    )
    await refuses('walls:remove refused a caller without the DM code', () =>
      client.mutation('walls:remove', { code, dmCode: 'not-the-dm-code', wallId: wall.wallId }),
    )

    const wallsCleared = await client.mutation('walls:clear', { code, dmCode, sceneId: wallScene })
    check(
      'walls:clear swept the scene and said how many',
      wallsCleared.removed === 1 &&
        (await client.query('walls:list', { code, sceneId: wallScene })).length === 0,
      JSON.stringify(wallsCleared),
    )
  } catch (error) {
    const data = error && error.data ? ` ${JSON.stringify(error.data)}` : ''
    record('the run completed without an unexpected error', false, `${error.message ?? error}${data}`)
  } finally {
    // Best effort, and each step is guarded on its own rather than the batch: an
    // assertion that fails halfway leaves the rest to be cleaned up, and a run that
    // abandoned two forty-entry sheets every time it failed would be a slow leak
    // into the same budget the upload limits exist to protect. The scene, its blob,
    // the tokens and the characters are what can go from here.
    //
    // ⚠️ **The game document is still left behind, and that is now a decision rather
    // than a missing API.** `convex/admin.ts` can delete one — but it is an
    // `internalMutation`, deliberately, so that it did not have to answer "who may
    // delete a game" ahead of the milestone that owns the question. Reaching it means
    // holding the deployment's admin credentials and shelling out to the Convex CLI,
    // and this script needs neither: it authenticates with a game code and a DM code
    // like any other client, over `ConvexHttpClient`. Wiring it up here would make the
    // *cleanup* path of a test depend on deploy credentials it does not otherwise use,
    // to save a call to `npm run prune-games` that sweeps every run at once. So the
    // litter is swept by the broom rather than by each run, and the line below says so.
    //
    // ⚠️ **Section 30's ad-hoc feed lines are left behind for the same reason, and they are
    // the first rows this script creates that no client can delete.** Two thirds of what it
    // writes does go: `characters.remove` calls `deleteFeedForCharacter`, so every line
    // naming the roll hero or the hidden creature leaves on the character loop below. A
    // **dice-tray** line names a seat and no character, so there is no document for a
    // removal to hang off — and inventing a public mutation to erase what the table saw is
    // not a thing a smoke test gets to decide. `purgeGame` would take them and is an
    // `internalMutation` deliberately, exactly as above. `npm run prune-games` counts them:
    // its receipt reads `feed line(s)` beside the tokens, characters and seats.
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
      // ⚠️ **Between the grants and the coins, and the position is worked out rather than
      // chosen.** A marker row hangs off a coin, so clearing one on a coin the loop below has
      // already removed throws `TokenNotFound` and `quietly` reports a failed cleanup step
      // for a run that went perfectly — the one thing a cleanup path must never do.
      // `removeToken` calls `deleteTokenMarkers` itself, so this buys no reclamation at all;
      // what it buys is a receipt that tells the truth. Section 37 empties the list on the way
      // past, exactly as sections 25, 33 and 34 do, so on a run that finishes this is a no-op.
      for (const tokenId of markedTokens) {
        await quietly(() =>
          client.mutation('board:setMarkers', { code, dmCode, tokenId, markers: [] }),
        )
      }
      for (const tokenId of created) {
        await quietly(() => client.mutation('board:removeToken', { code, dmCode, tokenId }))
      }
      for (const characterId of createdCharacters) {
        await quietly(() => client.mutation('characters:remove', { code, dmCode, characterId }))
      }
      // ⚠️ **The handouts and the tracks go here, and the position is worked out from one fact
      // rather than chosen: `files.discard` refuses a blob a live row still points at.** So each
      // of these rows has to be deleted *before* the upload sweep below, exactly as a scene and
      // a token do — otherwise the sweep reports a failed cleanup step for every blob that was
      // doing its job, which is the failure the ordering note on that loop already describes.
      // Both mutations take their blob with them in the same transaction, so after these loops
      // the two ids on the upload list are the harmless no-op case rather than live references.
      //
      // Above the scene rather than below it only because neither points at one: a handout and a
      // track belong to the *game*, not to a board, so nothing here depends on the scene
      // surviving and nothing in `scenes:remove` reaches them. Sections 33 and 34 empty these
      // lists on the way past, so on a run that finishes both loops are no-ops — what they are
      // for is a run that failed between creating one of these rows and deleting it.
      for (const modalImageId of createdHandouts) {
        await quietly(() => client.mutation('modalImages:remove', { code, dmCode, modalImageId }))
      }
      for (const trackId of createdTracks) {
        await quietly(() => client.mutation('music:remove', { code, dmCode, trackId }))
      }
      if (sceneId) await quietly(() => client.mutation('scenes:remove', { code, dmCode, sceneId }))
      // Section 32's second map, which exists only so that "a board nobody is looking at" is a
      // real board. It takes its own fog and its own blob with it, as any scene does.
      for (const extraSceneId of extraScenes) {
        await quietly(() =>
          client.mutation('scenes:remove', { code, dmCode, sceneId: extraSceneId }),
        )
      }
      // The seats go too, which they did not before: `players.leave` has always existed
      // and the note here used to say otherwise. It is also the mutation that revokes a
      // departing seat's grants, so this sweep is a second, blunter exercise of
      // `revokeControlForSeat` on whatever the loop above did not reach.
      for (const playerId of seats) {
        await quietly(() => client.mutation('players:leave', { code, playerId }))
      }
      // ⚠️ **The uploads go LAST, and the ordering is the whole reason this loop is a loop
      // rather than a line beside each upload.** `files.discard` refuses any blob a scene or
      // a token still references — that is what stops a mis-sequenced catch handler blanking
      // the map out from under the table — so running it before the removals above would
      // report a failed cleanup step for every blob that was doing its job.
      //
      // After them, every id on this list is one of three things: consumed and already
      // deleted with its row, deleted by `replaceTokenArt` when section 29 swapped the art,
      // or an **orphan** — bytes from a run that failed between the POST and the mutation
      // that would have adopted them. `discard` returns early on a blob that is not in
      // storage, so it is a no-op on the first two, and it is the only thing in the
      // application that can reclaim the third. That idempotence is exactly what makes
      // running it over the whole list safe rather than a list of guesses about which
      // uploads survived a run that failed halfway.
      for (const imageId of uploads) {
        await quietly(() => client.mutation('files:discard', { code, dmCode, imageIds: [imageId] }))
      }
      console.log(
        `\n  cleaned up ${1 + extraScenes.length} scenes, ${created.length} tokens, ${createdCharacters.length} characters and ${seats.length} seats, and swept ${uploads.length} uploads`,
      )
      console.log(
        '  the fog, the handout and the track went with them — sections 33, 34 and 35 delete their own rows, and the two loops above are for a run that did not get that far',
      )
      console.log(
        `  the game itself remains, and section 30's ad-hoc feed lines with it: ${code} — \`npm run prune-games\` sweeps these up, and counts the feed lines`,
      )
    } else {
      console.log('\n  nothing to clean up: the game was never created')
    }
    // ⚠️ **Section 36's second game, swept under its own codes.** Every step here is an
    // ordinary client mutation authenticated with that game's join code and DM code, in the
    // same order the loops above use and for the same reason: `files.discard` refuses a blob
    // a live row still points at, so the coin and the scene go first. The game *document*
    // stays, as this run's own does, and `npm run prune-games` reaches it because its name
    // starts with the same `Board Smoke ` prefix.
    for (const foreign of foreignGames) {
      if (foreign.tokenId) {
        await quietly(() =>
          client.mutation('board:removeToken', {
            code: foreign.code,
            dmCode: foreign.dmCode,
            tokenId: foreign.tokenId,
          }),
        )
      }
      if (foreign.sceneId) {
        await quietly(() =>
          client.mutation('scenes:remove', {
            code: foreign.code,
            dmCode: foreign.dmCode,
            sceneId: foreign.sceneId,
          }),
        )
      }
      if (foreign.imageId) {
        await quietly(() =>
          client.mutation('files:discard', {
            code: foreign.code,
            dmCode: foreign.dmCode,
            imageIds: [foreign.imageId],
          }),
        )
      }
      console.log(
        `  the other table's scene, coin and blob went too: ${foreign.code} — its game document is swept by the same broom`,
      )
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
