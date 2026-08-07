// The shape of a premade sheet, and nothing else. Content lives one file per class
// beside this one.
//
// **Nothing under lib/library/ may ever be imported by the browser.** The server
// resolves a character and sends a finished `PcSheet` over the wire, so a client
// needs `lib/classes.ts` and `lib/species.ts` for its two dropdowns and none of this.
// Sixty stat blocks is a meaningful slice of a bundle that is already close to a
// megabyte, for data no client ever reads. A test asserts the separation, because it
// is exactly the sort of thing one convenient import quietly undoes.

import type { ClassKey } from '../classes'
import type { AbilityScores, ContentEntry, HitDice, SaveProficiencies } from '../sheet'
import type { SkillProficiencies } from '../skills'

/**
 * An entry on a premade sheet.
 *
 * `id` is absent because it is per-character: the resolver mints stable ids when it
 * builds the sheet, so two characters of the same class do not share a React key or
 * a roll target. Everything else is the `SheetEntry` the rest of the app already
 * knows — no new entry type, and therefore no second roll path when the dice land.
 *
 * That is now `ContentEntry`, which is the same thing with the **category answered**
 * rather than left to a default. See the note on it in lib/sheet.ts: the stored field
 * has to be optional because the table already holds entries without one, and content
 * has no such history — so requiring it here is what makes the type checker list
 * every entry that still has to be decided.
 */
export type LibraryEntry = ContentEntry

export type LibrarySheet = {
  /** 1 to 5. Held on the sheet as well as in its position, so a test can catch a misfile. */
  level: number
  /**
   * The standard array — 15 14 13 12 10 8 — allocated for the class, **with the
   * build's background ability increases already applied**, and without considering
   * species.
   *
   * ⚠️⚠️ **READ THIS BEFORE CONCLUDING THAT BACKGROUNDS WERE LIFTED, BECAUSE THE
   * EXCLUSION IS WHAT FORCES THE ABSORPTION.** In 5e (2024) a species grants **no
   * ability score increase at all**; a background grants three named abilities with a
   * `+2/+1` or `+1/+1/+1` spread, plus an Origin feat, plus two skill proficiencies.
   * docs/requirements.md excludes backgrounds and that exclusion **still stands** —
   * which removes the *source* of the spread and of half the skill proficiencies, and
   * would leave every premade character two points and two skills short of the book.
   *
   * The resolution is **absorption, not addition**, and it costs nothing structural
   * because the shape was already right. This field has always been a finished array
   * that the premade sheet is the authority on; it now stores one with the chosen
   * background's increases in it, the two skill proficiencies land in
   * `skillProficiencies` the same way, and the Origin feat lands in `feats`.
   *
   * ⭐ **CLAUDE.md's *"no second source of proficiency can ever exist"* survives this,
   * and stating why is the point.** There is still **no background on a character**, no
   * background list, no background field and **no second grant** — nothing in the schema
   * knows a background exists. What arrives is the premade sheet being the authority on a
   * fixed set of numbers, which is what it has always been, and ADR 0006's
   * stored-link-and-override model is untouched. A reader who concludes "backgrounds were
   * lifted" has read it backwards. *"The +2 came from somewhere"* is the next reader's
   * first question, and this paragraph is the answer.
   *
   * ⭐ **The *"without considering species"* half is now true by CONSTRUCTION rather than
   * by discipline.** It used to be a promise every one of seventy-two sheets had to keep
   * so that a race's `+2` could be added on top at resolution; since no 2024 species
   * touches a score, `applySpecies` has no ability arithmetic left to do and there is
   * nothing on top to add. The clause survives as a statement about *which* numbers are
   * here rather than as a rule anybody can break.
   *
   * Level 4 and up carry one ability score improvement, which is +2 over the level 3
   * sheet and never a score going down.
   */
  abilities: AbilityScores
  /**
   * ⚠️ **The two the SRD's Core Traits table prints for the class, and nothing else adds
   * one.** A background grants no saving throw proficiency and neither does a species, so
   * unlike `abilities` and `skillProficiencies` below there is nothing absorbed here —
   * which is worth stating precisely because those two fields *do* absorb, and a reader
   * working down the type will be expecting a third.
   */
  saveProficiencies: SaveProficiencies
  /**
   * The class's own choices **plus the absorbed background's two**. See `abilities`
   * above: there is no second source of proficiency, because a background is not a
   * thing a character has — it is a thing whoever wrote this sheet decided once.
   *
   * ⚠️ **Every content file builds this by spreading `noSkills()`, and that is a change
   * of house style worth knowing about.** The old corpus wrote all thirteen flags out on
   * all seventy-two sheets; change 4 of the conversion took the vocabulary to eighteen,
   * and eighteen booleans on sixty sheets is a thousand lines in which the interesting
   * fact — *which four* — is invisible, and in which a correction gets made on four sheets
   * out of five. Every sheet still carries all eighteen flags, because the spread produces
   * them, and `library.test.ts` asserts exactly that against `SKILL_KEYS`.
   */
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
 * One class's whole progression: levels 1 and 2 shared, then one archetype from level 3.
 *
 * ⚠️ **`base` is a RECORD of levels rather than one sheet, and `paths` holds exactly one
 * key.** Both halves are `SUBCLASS_LEVEL` moving from 2 to 3. An archetype is chosen at
 * level 3 in every 2024 class, so levels 1 and 2 are shared by everybody and need a sheet
 * each; and no SRD contains more than one subclass per class, so `paths` has one entry —
 * see the tuple on `CharacterClass.subclasses`, which is where that fact is enforced
 * rather than merely observed.
 *
 * Keyed by subclass rather than listed, so a lookup is a map access and a missing
 * archetype is a missing key rather than an index nobody checked.
 */
export type ClassLibrary = {
  classKey: ClassKey
  /** Levels 1 and 2, before any archetype exists to choose. */
  base: Record<number, LibrarySheet>
  /** Subclass key → its levels 3 to 5. The class's one archetype, always. */
  paths: Record<string, Record<number, LibrarySheet>>
}
