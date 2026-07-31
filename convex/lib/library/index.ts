// The premade character library: eight classes, level 1 to 5, two archetypes each.
// Seventy-two sheets, which is the whole point — a beginner picks a race and a class
// and has a playable character without answering another question.
//
// Content only. The shape is in ./types.ts and the resolver is in ../resolve.ts.
// See the note at the top of ./types.ts for why nothing here reaches the browser.

import { MAX_LIBRARY_LEVEL, MIN_LIBRARY_LEVEL, SUBCLASS_LEVEL, type ClassKey } from '../classes'
import { BARBARIAN } from './barbarian'
import { BARD } from './bard'
import { CLERIC } from './cleric'
import { FIGHTER } from './fighter'
import { PALADIN } from './paladin'
import { RANGER } from './ranger'
import { ROGUE } from './rogue'
import type { ClassLibrary, LibrarySheet } from './types'
import { WIZARD } from './wizard'

export type { ClassLibrary, LibraryEntry, LibrarySheet } from './types'

export const LIBRARY: Record<ClassKey, ClassLibrary> = {
  barbarian: BARBARIAN,
  bard: BARD,
  cleric: CLERIC,
  fighter: FIGHTER,
  paladin: PALADIN,
  ranger: RANGER,
  rogue: ROGUE,
  wizard: WIZARD,
}

/**
 * The premade sheet for a set of selections, or null.
 *
 * Three rules, and each one is a decision rather than a fallback:
 *
 * - **Below level 2, or with no archetype chosen, you get the level 1 sheet.** The
 *   library has no archetype-less level 2, deliberately: a character sitting at
 *   level 2 without having chosen is mid-decision, and showing them level 1 until
 *   they choose is more honest than inventing a sheet the library does not contain.
 * - **Past level 5 you get the level 5 sheet.** The library stops there, and a
 *   character the DM has pushed beyond it stops gaining rather than falling back to
 *   nothing.
 * - **An unknown class or a retired archetype returns null**, and every caller has to
 *   cope. A subclass key is stored on a character, so renaming one must leave the
 *   characters that chose it readable — the same stance `catalogueEntry` and
 *   `subclassOf` take, for the same reason.
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
  if (wanted < SUBCLASS_LEVEL || subclassKey === null) return library.base

  // `Object.hasOwn`, not a truthiness check on the lookup: `paths['toString']` and
  // `paths['__proto__']` are both truthy on a plain object, so a bare `if (!path)`
  // let three inherited names through the guard and returned the level 1 sheet where
  // the contract promises null. Unreachable through a write — `storedSheetProblem`
  // refuses any archetype `subclassOf` does not know — but `catalogueEntry` gets this
  // right by using a Map and `rules.test.ts` already pins those keys, so the same
  // hole here was an inconsistency waiting to be found rather than a decision.
  if (!Object.hasOwn(library.paths, subclassKey)) return null

  return library.paths[subclassKey]?.[wanted] ?? library.base
}
