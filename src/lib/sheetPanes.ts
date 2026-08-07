import type { PcSheet } from '@convex/lib/sheet'
import { spellcastingAbilityOf } from '@convex/lib/sheet'

/**
 * THE THREE SUB-TABS A HERO'S SHEET IS DIVIDED INTO, and the rule that decides which of
 * them a particular character gets.
 *
 * The division is forced by the pane rather than chosen for its own sake. A real 2024
 * character sheet is three portrait columns; this panel is the width of a divider — 576
 * pixels at its narrowest, and the shell lets it grow only so far — so the columns become
 * sub-tabs. **Do not re-flow this into three columns** on the strength of a wide monitor:
 * the pane is resizable and the narrow end is the one that has to work.
 *
 * The split itself is by *when* a thing is read. **Play is what you touch in a round** and
 * is therefore the default: attacks, features, the counters on them, hit dice and the two
 * rests. **Build is what you set up once** — the six abilities with their saves and skills,
 * the proficiencies, the senses, the numbers the DM may push around. **Spells** is the
 * caster's own page, which is a page and not a section for the ordinary reason that 183
 * spells exist and a character can hold forty.
 *
 * What is deliberately *not* here is the pinned header. Hit points, conditions and the
 * death-save tally are read while doing any of the three, so they sit above the strip and
 * belong to no pane — see `CharacterHeader`.
 */
export const SHEET_PANES = ['play', 'build', 'spells'] as const
export type SheetPane = (typeof SHEET_PANES)[number]

/**
 * The word on each tab.
 *
 * A `Record` keyed by the union rather than three triggers written out in JSX, which is
 * CLAUDE.md invariant 9's rule applied to a renderer: three hand-written triggers is the
 * arrangement where a fourth pane exists, holds content, and has no tab to reach it by.
 * A missing key here fails to compile, and that refusal is the whole of the guard.
 */
export const SHEET_PANE_LABELS: Record<SheetPane, string> = {
  play: 'Play',
  build: 'Build',
  spells: 'Spells',
}

/**
 * WHETHER A PANE APPLIES TO THIS CHARACTER AT ALL — one predicate per pane, keyed by the
 * union so a fourth pane cannot arrive without somebody answering the question for it.
 *
 * ⚠️ **A pane that does not apply is ABSENT, never disabled**, which is the rule
 * `CharacterBuilder` already keeps for the archetype control below `SUBCLASS_LEVEL` and
 * for the lineage control on a species with no lineage table. A greyed-out tab reads as a
 * thing the player failed to fill in, and a Fighter has not failed to become a caster.
 *
 * **`spells` has three clauses and each of them is doing work.** A stored spellcasting
 * ability is the authoritative answer for a character built from the library, because
 * `resolvePreset` copies it off the class — that is what makes a Cleric a caster and a
 * Fighter not one, with nothing here having to know which classes cast. A character with
 * spells on the sheet and no such ability gets the tab too, because the alternative is
 * rows that are stored, counted against `MAX_SHEET_ENTRIES` and unreachable — the exact
 * failure `SheetEntryList` iterates `SHEET_ENTRY_CATEGORIES` to avoid. And an *editable*
 * spell list always gets it, because adding the first spell is how a hand-built sheet
 * becomes a caster at all, and a tab that appears only once you have used it is a tab you
 * cannot use.
 */
const PANE_APPLIES: Record<SheetPane, (sheet: PcSheet, editable: boolean) => boolean> = {
  play: () => true,
  build: () => true,
  spells: (sheet, editable) =>
    spellcastingAbilityOf(sheet) !== null || sheet.spells.length > 0 || editable,
}

/** The panes this character has, in `SHEET_PANES` order. Never empty — Play always applies. */
export function panesFor(sheet: PcSheet, editable: boolean): readonly SheetPane[] {
  return SHEET_PANES.filter((pane) => PANE_APPLIES[pane](sheet, editable))
}

/**
 * The pane to show, given the one somebody last chose.
 *
 * A character can stop being a caster while the panel is open — the DM removes the last
 * spell from a hand-built sheet, or rebuilds a Wizard as a Barbarian — and the selected
 * tab is local state that knows nothing about it. Falling back to the first surviving pane
 * is what stops that showing an empty body under a tab strip that no longer has the tab
 * highlighted.
 */
export function paneOrFirst(panes: readonly SheetPane[], chosen: SheetPane): SheetPane {
  return panes.includes(chosen) ? chosen : (panes[0] ?? 'play')
}
