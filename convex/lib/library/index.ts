// The premade character library: twelve classes, level 1 to 5, one archetype each.
// Sixty sheets — 12 × (levels 1 and 2, shared) plus 12 × (levels 3, 4 and 5) — which is
// the whole point: a beginner picks a species and a class and has a playable character
// without answering another question.
//
// Content only. The shape is in ./types.ts and the resolver is in ../resolve.ts.
// See the note at the top of ./types.ts for why nothing here reaches the browser, and
// for why a sheet's ability scores now have a background's increases already in them.

import { MAX_LIBRARY_LEVEL, MIN_LIBRARY_LEVEL, SUBCLASS_LEVEL, type ClassKey } from '../classes'
import { BARBARIAN } from './barbarian'
import { BARD } from './bard'
import { CLERIC } from './cleric'
import { DRUID } from './druid'
import { FIGHTER } from './fighter'
import { MONK } from './monk'
import { PALADIN } from './paladin'
import { RANGER } from './ranger'
import { ROGUE } from './rogue'
import { SORCERER } from './sorcerer'
import type { ClassLibrary, LibrarySheet } from './types'
import { WARLOCK } from './warlock'
import { WIZARD } from './wizard'

export type { ClassLibrary, LibraryEntry, LibrarySheet } from './types'

export const LIBRARY: Record<ClassKey, ClassLibrary> = {
  barbarian: BARBARIAN,
  bard: BARD,
  cleric: CLERIC,
  druid: DRUID,
  fighter: FIGHTER,
  monk: MONK,
  paladin: PALADIN,
  ranger: RANGER,
  rogue: ROGUE,
  sorcerer: SORCERER,
  warlock: WARLOCK,
  wizard: WIZARD,
}

/**
 * The premade sheet for a set of selections, or null.
 *
 * Three rules, and each one is a decision rather than a fallback:
 *
 * - **Below `SUBCLASS_LEVEL`, or with no archetype chosen, you get a sheet out of
 *   `base`.** Levels 1 and 2 are shared by every character of the class, so both are
 *   there and the lookup is exact. A character sitting at level 3 or above without
 *   having chosen is mid-decision, and showing them the level 2 sheet until they
 *   choose is more honest than inventing a level 4 the library does not contain —
 *   which is why the fallback is `base[MIN_LIBRARY_LEVEL]`'s neighbour rather than a
 *   guess.
 * - **Past level 5 you get the level 5 sheet.** The library stops there, and a
 *   character the DM has pushed beyond it stops gaining rather than falling back to
 *   nothing.
 * - **An unknown class or a retired archetype returns null**, and every caller has to
 *   cope. A subclass key is stored on a character, and eight of them have now actually
 *   been retired, so this is load-bearing rather than defensive — the same stance
 *   `catalogueEntry`, `subclassOf` and `species` take, for the same reason.
 */
export function librarySheet(
  classKey: ClassKey,
  subclassKey: string | null,
  level: number,
): LibrarySheet | null {
  const library = LIBRARY[classKey]
  if (!library) return null

  const wanted = Math.min(
    MAX_LIBRARY_LEVEL,
    Math.max(MIN_LIBRARY_LEVEL, Number.isFinite(level) ? Math.round(level) : MIN_LIBRARY_LEVEL),
  )
  // ⚠️ **`base` is now a record of two levels, so the miss has to be spelled out.**
  // `base[wanted]` is a sheet for levels 1 and 2 and `undefined` for 3, 4 and 5 — which
  // is exactly the mid-decision case: an archetype has not been chosen and the level is
  // already past the point one should have been. The level 1 sheet is the answer there,
  // for the reason it always was: the library does not contain an archetype-less level 4,
  // and showing the sheet it does contain is more honest than inventing one.
  if (wanted < SUBCLASS_LEVEL || subclassKey === null) {
    return library.base[wanted] ?? library.base[MIN_LIBRARY_LEVEL]
  }

  // `Object.hasOwn`, not a truthiness check on the lookup: `paths['toString']` and
  // `paths['__proto__']` are both truthy on a plain object, so a bare `if (!path)`
  // let three inherited names through the guard and returned the level 1 sheet where
  // the contract promises null. Unreachable through a write — `storedSheetProblem`
  // refuses any archetype `subclassOf` does not know — but `catalogueEntry` gets this
  // right by using a Map and `rules.test.ts` already pins those keys, so the same
  // hole here was an inconsistency waiting to be found rather than a decision.
  if (!Object.hasOwn(library.paths, subclassKey)) return null

  return library.paths[subclassKey]?.[wanted] ?? library.base[MIN_LIBRARY_LEVEL]
}
