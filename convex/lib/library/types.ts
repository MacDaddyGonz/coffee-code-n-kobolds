// The shape of a premade sheet, and nothing else. Content lives one file per class
// beside this one.
//
// **Nothing under lib/library/ may ever be imported by the browser.** The server
// resolves a character and sends a finished `PcSheet` over the wire, so a client
// needs `lib/classes.ts` and `lib/races.ts` for its two dropdowns and none of this.
// Seventy-two stat blocks is a meaningful slice of a bundle that is already close to
// a megabyte, for data no client ever reads. A test asserts the separation, because
// it is exactly the sort of thing one convenient import quietly undoes.

import type { ClassKey } from '../classes'
import type { AbilityScores, HitDice, SaveProficiencies, SheetEntry } from '../sheet'
import type { SkillProficiencies } from '../skills'

/**
 * An entry on a premade sheet.
 *
 * `id` is absent because it is per-character: the resolver mints stable ids when it
 * builds the sheet, so two characters of the same class do not share a React key or
 * a roll target. Everything else is the `SheetEntry` the rest of the app already
 * knows — no new entry type, and therefore no second roll path in Milestone 5.
 */
export type LibraryEntry = Omit<SheetEntry, 'id'>

export type LibrarySheet = {
  /** 1 to 5. Held on the sheet as well as in its position, so a test can catch a misfile. */
  level: number
  /**
   * The standard array — 15 14 13 12 10 8 — allocated for the class and **without
   * considering race**, which is what lets race be applied on top at resolution
   * instead of multiplying seventy-two sheets by eight.
   *
   * Levels 3 and up may differ by an ability score improvement, where that is the
   * better choice for the build than a feat.
   */
  abilities: AbilityScores
  saveProficiencies: SaveProficiencies
  skillProficiencies: SkillProficiencies
  armourClass: number
  maxHp: number
  hitDice: HitDice
  feats: LibraryEntry[]
  spells: LibraryEntry[]
  /** A fixed kit, not an inventory — requirements.md's "set equipment per character". */
  equipment: string
  /** What changed since the previous level, in a sentence or two. Shown on the sheet. */
  levellingNotes: string
}

/**
 * One class's whole progression: a shared level 1, then two archetypes from level 2.
 *
 * Keyed by subclass rather than listed, so a lookup is a map access and a missing
 * archetype is a missing key rather than an index nobody checked.
 */
export type ClassLibrary = {
  classKey: ClassKey
  /** Level 1, before any archetype exists to choose. */
  base: LibrarySheet
  /** Subclass key → its levels 2 to 5. Both archetypes of the class, always. */
  paths: Record<string, Record<number, LibrarySheet>>
}
