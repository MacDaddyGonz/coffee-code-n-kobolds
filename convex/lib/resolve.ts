// Turning stored selections into a sheet. The one place the library, the races and
// the DM's overrides meet.
//
// **This module is why Milestone 4 was cheap.** `characterSheet` in lib/sheet.ts was
// already the single accessor for a character's sheet — nine call sites, every one
// going through it, because Milestone 3 made the stored field optional and needed
// one home for the default. Putting the resolution behind the same shape means
// `maySeeCharacter`, `visibleVitals`, `currentHpOf`, the health bands and
// `publicSheet` all kept working untouched: they ask for a `CharacterSheet` and they
// still get one.
//
// It is deliberately **synchronous and pure** — no `ctx`, no database read, no
// async — because the library is a static module rather than a table. That is what
// let the resolution slot in without changing the shape of a single caller.
//
// It lives here rather than in lib/sheet.ts for one reason: this file imports
// lib/library/, and lib/sheet.ts is imported by the browser. See the note at the top
// of lib/library/types.ts.

import { findClass, subclassOf, type ClassKey } from './classes'
import { librarySheet, type LibraryEntry } from './library'
import { race, type Race } from './races'
import type {
  AbilityScores,
  CharacterSheet,
  PcSheet,
  PresetOverrides,
  PresetSheet,
  SheetEntry,
  StoredSheet,
} from './sheet'
import {
  MAX_ENTRY_ID_LENGTH,
  SPEED_FEET,
  defaultPcSheet,
  noSkills,
} from './sheet'

/**
 * The sheet to display, roll and take hit points from, whatever the document holds.
 *
 * Replaces `characterSheet` at every call site inside `convex/`. A stored `pc` or
 * `npc` sheet passes through unchanged; a `preset` is built here.
 */
export function resolveSheet(doc: { sheet?: StoredSheet }): CharacterSheet {
  const stored = doc.sheet
  if (stored === undefined) return defaultPcSheet()
  if (stored.kind !== 'preset') return stored
  return resolvePreset(stored)
}

/** The stored selections, or null for a character that is not built from the library. */
export function presetOf(doc: { sheet?: StoredSheet }): PresetSheet | null {
  return doc.sheet?.kind === 'preset' ? doc.sheet : null
}

/**
 * The two things a premade sheet carries that a `PcSheet` has nowhere to put: the
 * fixed kit, and what changed at this level.
 *
 * They are returned beside the resolved sheet rather than folded into it,
 * deliberately. Neither is a rule — nothing rolls a kit and nothing computes with a
 * levelling note — so putting them on `PcSheet` would mean two more optional fields
 * on a type that a hand-built character shares, plus two more accessors, to carry
 * strings that only a premade character has. And it would have meant another pair of
 * fields the schema could not require, since the table already holds Milestone 3
 * sheets without them.
 *
 * They matter enough to carry: the kit is what requirements.md's "set equipment per
 * character" actually is, and the levelling note is the sentence a player reads when
 * the DM awards them a level — which is the moment this whole milestone exists for.
 */
export function presetExtras(
  doc: { sheet?: StoredSheet },
): { equipment: string; levellingNotes: string } | null {
  const preset = presetOf(doc)
  if (!preset) return null

  const found = librarySheet(preset.classKey, preset.subclassKey, preset.level)
  if (!found) return null
  return { equipment: found.equipment, levellingNotes: found.levellingNotes }
}

/**
 * Library, then race, then the DM. **The order is the design and cannot be
 * rearranged.**
 *
 * The library is race-agnostic by construction, so race has to come second or an
 * Elf's +2 would be part of a base the next level overwrites. The DM comes last
 * because an override is the final word — that is what makes "the DM can always
 * change a player's sheet" true against a character whose stats are read live, and
 * what makes an override survive a level-up rather than being quietly discarded by
 * the next lookup.
 */
function resolvePreset(preset: PresetSheet): PcSheet {
  const definition = findClass(preset.classKey)
  const subclass = subclassOf(preset.classKey, preset.subclassKey)
  const level = clampLevel(preset.level)
  const found = librarySheet(preset.classKey, preset.subclassKey, level)

  // A class or an archetype the library no longer has. The character keeps its
  // level, its name and its hit points and loses only the numbers it was borrowing
  // — which is far better than a thrown error on a query that paints a screen, and
  // is the reason `librarySheet` returns null rather than throwing.
  const base: PcSheet = found
    ? {
        kind: 'pc',
        level,
        className: classLabel(preset.classKey, subclass?.name ?? null),
        abilities: { ...found.abilities },
        saveProficiencies: { ...found.saveProficiencies },
        skillProficiencies: { ...found.skillProficiencies },
        armourClass: found.armourClass,
        maxHp: found.maxHp,
        hitDice: { ...found.hitDice },
        feats: found.feats.map((entry, index) => withId(entry, 'lib', index)),
        spells: found.spells.map((entry, index) => withId(entry, 'lib', index)),
        speed: SPEED_FEET,
      }
    : {
        ...defaultPcSheet(),
        level,
        className: classLabel(preset.classKey, subclass?.name ?? null),
        hitDice: { count: level, faces: definition?.hitDieFaces ?? 8 },
        // Set explicitly, because `defaultPcSheet` leaves it absent and this is the
        // one branch where neither the library nor an override would supply it —
        // which made "a resolved sheet always carries both" false for exactly the
        // retired-class case this branch exists to survive. Every reader goes through
        // `skillProficienciesOf`, so nothing broke; a promise with one exception in it
        // is still worth closing rather than qualifying.
        skillProficiencies: noSkills(),
        speed: SPEED_FEET,
      }

  return applyOverrides(applyRace(base, race(preset.race), level), preset.overrides)
}

function applyRace(sheet: PcSheet, chosen: Race, level: number): PcSheet {
  const abilities: AbilityScores = { ...sheet.abilities }
  for (const [key, bonus] of Object.entries(chosen.abilityBonus ?? {})) {
    abilities[key as keyof AbilityScores] += bonus
  }

  // The trait always appears, whether or not it changes a number — a Halfling's
  // Lucky is the whole of what makes them a Halfling and would otherwise be invisible
  // on their own sheet.
  const trait: SheetEntry = {
    id: entryId('race', chosen.key),
    name: chosen.traitName,
    text: chosen.traitText,
    roll: null,
    level: null,
    catalogueKey: null,
  }

  return {
    ...sheet,
    abilities,
    maxHp: sheet.maxHp + (chosen.hpPerLevel ?? 0) * level,
    speed: (sheet.speed ?? SPEED_FEET) + (chosen.speedBonus ?? 0),
    feats: [
      ...sheet.feats,
      trait,
      ...(chosen.grantedFeats ?? []).map((entry, index) => withId(entry, `race-${chosen.key}`, index)),
    ],
    spells: [
      ...sheet.spells,
      ...(chosen.grantedSpells ?? []).map((entry, index) => withId(entry, `race-${chosen.key}`, index)),
    ],
  }
}

function applyOverrides(sheet: PcSheet, overrides: PresetOverrides | undefined): PcSheet {
  if (!overrides) return sheet

  return {
    ...sheet,
    abilities: overrides.abilities ? { ...overrides.abilities } : sheet.abilities,
    saveProficiencies: overrides.saveProficiencies
      ? { ...overrides.saveProficiencies }
      : sheet.saveProficiencies,
    skillProficiencies: overrides.skillProficiencies
      ? { ...overrides.skillProficiencies }
      : sheet.skillProficiencies ?? noSkills(),
    armourClass: overrides.armourClass ?? sheet.armourClass,
    maxHp: overrides.maxHp ?? sheet.maxHp,
    hitDice: overrides.hitDice ? { ...overrides.hitDice } : sheet.hitDice,
    speed: overrides.speed ?? sheet.speed,
    // Appended rather than replacing, so a plot item the DM handed out survives the
    // next level's library lookup instead of being overwritten by it.
    feats: [...sheet.feats, ...(overrides.extraFeats ?? [])],
    spells: [...sheet.spells, ...(overrides.extraSpells ?? [])],
  }
}

/**
 * A retired class keeps its key as its label rather than throwing. Nobody wants to
 * read `barbarian` on a sheet, but it is a great deal better than the alternative
 * this used to do — reading `.name` off an undefined, inside `characters.list`,
 * which took the party panel down for everyone rather than for the one character.
 */
function classLabel(classKey: ClassKey, subclassName: string | null): string {
  const name = findClass(classKey)?.name ?? classKey
  return subclassName ? `${name} (${subclassName})` : name
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1
  return Math.min(20, Math.max(1, Math.round(level)))
}

/**
 * A stable id for a resolved entry.
 *
 * Derived from the entry's name rather than its position, so that levelling up does
 * not renumber a character's whole spell list — which React would read as every row
 * being replaced, and which Milestone 5 would read as every roll target moving.
 * `sheetProblem` insists ids are unique within a sheet, so the library's integrity
 * test asserts no sheet repeats a name.
 */
function withId(entry: LibraryEntry, prefix: string, index: number): SheetEntry {
  return { ...entry, id: entryId(prefix, entry.name || String(index)) }
}

function entryId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}:${slug}`.slice(0, MAX_ENTRY_ID_LENGTH)
}
