// ─── TRANSITION ONLY ────────────────────────────────────────────────────────────────
//
// The **migrate** half of Milestone 14's widen → migrate → narrow, and nothing else.
// Every function here exists to make one stored document agree with a schema that has
// already moved, and the whole module is deleted once every deployment has been swept.
// Nothing new should be built on it.
//
// ⚠️ **THE NARROWING AND THIS SWEEP CANNOT LAND ON A DEPLOYMENT IN ONE PUSH, AND THAT
// IS THE MOST IMPORTANT SENTENCE IN THIS FILE.** Convex validates **existing rows** on a
// schema push — the fact ADR 0016 records `npx convex deploy` discovering over a
// character created months ago — so a deployment holding one unswept row refuses the
// narrowed schema outright, before any handler runs. The order is therefore:
//
//   1. push a build whose schema is still **wide** and which carries `convex/admin.ts`'s
//      `listUnmigrated` and `migrateGame`;
//   2. run `node scripts/migrate-sheets.mjs --yes` against it until it reports nothing
//      left;
//   3. push the **narrowed** schema.
//
// Steps 1 and 3 are two deploys of two different commits. A single push carrying both
// halves is refused by every deployment that has ever stored a character, which is not
// a failure mode this module can defend against and is the reason it says so here rather
// than in a commit message somebody reads once.
//
// **Everything below is pure.** No table is read, no document is written, nothing is
// async, and no `ctx` appears — which is what lets one planner serve both the dry run
// (an `internalQuery`, structurally unable to write) and the real thing (an
// `internalMutation`). A dry run that promised one set of numbers and a run that applied
// a different set would be the one bug a migration tool must not have, and the guard
// against it is that there is only one function.
//
// ⚠️ **The casts in this file are the job rather than a shortcut, and they are written to
// survive the narrowing rather than to be edited by it.** Every widened local type below is
// named `…AsFound` and says which field the narrowing takes away, so this module compiles
// and behaves identically on both sides of it — which is what lets the sweep commit deploy
// on its own and the narrowing commit change nothing here. A migration whose input type has
// already been narrowed past the field it reads is a migration that compiles into a no-op.

import { v } from 'convex/values'

import { SUBCLASS_LEVEL, subclassOf } from './classes'
import type { PcSheet, PresetSheet, StoredSheet } from './sheet'
import { noSkills } from './sheet'
// Type-only, so no runtime edge is added between this module and lib/skills.ts — the
// import-direction rule `skillProficienciesValidator` states at length.
import type { SkillProficiencies } from './skills'

/**
 * The speed a hand-built sheet with no `speed` field has always meant — **35, spelled
 * out here rather than read from `SPEED_FEET`, and that is the whole of item 4.**
 *
 * `speedOf` answers the constant for every sheet whose `speed` is absent, and every
 * sheet stored before the 2024 conversion has it absent. So moving `SPEED_FEET` from 35
 * to 30 is a **stored-value change wearing a constant's clothes**: it silently slows a
 * DM-typed goblin by five feet, in the same commit, with nothing on screen to say it
 * happened.
 *
 * The sweep therefore *pins* those sheets to what they already meant, and then the
 * constant moves. ⚠️ **Written as a literal because the pin runs in the commit that
 * moves the constant.** `speed: SPEED_FEET` here would write 30, the pin would be a
 * no-op, and the change would be invisible and permanent — which is exactly the failure
 * the ordering exists to prevent, achieved by importing the wrong number.
 *
 * ⚠️ **A `preset` sheet is deliberately not pinned.** It stores no speed at all:
 * `resolvePreset` writes the constant into the *resolved* sheet, and a 2024 species
 * carries an absolute `baseSpeed` that overwrites it. So flipping the constant
 * re-resolves every premade character correctly — Goliaths and Wood Elves included — and
 * a pin would freeze them at a number the SRD does not print.
 *
 * ⚠️⚠️ **THE PIN CANNOT TELL A LEGACY SHEET FROM A NEW ONE, AND THIS IS THE ONE PLACE
 * THIS SWEEP IS KNOWINGLY APPROXIMATE.** `characters.create` with no sheet writes
 * `defaultPcSheet()`, which carries no `speed` — deliberately, because absent means *the
 * default*. That is also precisely what a sheet typed before the conversion looks like,
 * and there is nothing else to go on. So a blank hero made five minutes ago is pinned to
 * 35 too, and two things follow: a character created between the deploy and the run gains
 * five feet nobody asked for, and **this tool does not converge to nothing-left on a
 * deployment somebody is still playing on.** Run it promptly after the deploy; it is
 * transition code rather than a cron job. `admin.test.ts` asserts this behaviour rather
 * than hiding it, and names the creation-time cutoff that would fix it if this is ever run
 * months late.
 */
export const PRE_2024_SPEED_FEET = 35

/**
 * What one pass changed, one number per kind of change rather than one per document.
 *
 * ⚠️ **Six numbers and not a total**, because the two failure modes of a sweep are
 * *it did not run* and *it ran and missed one*, and only a per-kind receipt tells them
 * apart. A single `47 documents` would read identically whether the override diffs were
 * swept or silently skipped.
 *
 * The shape is the dry run's answer **and** the real run's receipt, deliberately — the
 * arrangement `purgeCountsValidator` next door states at length. A dry run promising
 * `12 species` and a run reporting `9` is the only sign an operator would get that
 * something wrote to the game between the two calls.
 */
export const migrationCountsValidator = v.object({
  /** `preset` sheets whose `race` was folded into `species` and then dropped. */
  species: v.number(),
  /** `preset` sheets whose archetype no longer resolves: cleared, and unlocked. */
  archetypes: v.number(),
  /** `pc` sheets whose thirteen skill flags became eighteen. */
  skills: v.number(),
  /** The same five flags inside a `preset`'s override diff — the place a sweep forgets. */
  overrideSkills: v.number(),
  /** Hand-built `pc` and `npc` sheets pinned to the speed they already meant. */
  speeds: v.number(),
  /** `characterVitals` rows whose `spentPerRest` was folded into `spentUses`. */
  uses: v.number(),
})
export type MigrationCounts = typeof migrationCountsValidator.type

/** Six zeroes, a fresh object each call — see the note on `defaultPcSheet` in lib/sheet.ts. */
export function noMigrationCounts(): MigrationCounts {
  return { species: 0, archetypes: 0, skills: 0, overrideSkills: 0, speeds: 0, uses: 0 }
}

/**
 * Field by field, so a seventh kind of change fails to compile here rather than being
 * silently dropped from every total in the tool.
 */
export function addMigrationCounts(a: MigrationCounts, b: MigrationCounts): MigrationCounts {
  return {
    species: a.species + b.species,
    archetypes: a.archetypes + b.archetypes,
    skills: a.skills + b.skills,
    overrideSkills: a.overrideSkills + b.overrideSkills,
    speeds: a.speeds + b.speeds,
    uses: a.uses + b.uses,
  }
}

/**
 * How many changes a receipt describes. **Nought is the whole of the idempotence
 * claim**: a second pass over a swept deployment answers zero here for every game, so
 * the tool has nothing to write and says so.
 */
export function migrationCountsTotal(counts: MigrationCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

/**
 * The eighteen skill flags **as the database may still hold them**: thirteen, because
 * the five 2024 additions did not exist when the row was written.
 *
 * `SkillProficiencies` says all eighteen are present, which is what the narrowing makes
 * true and what this sweep exists to earn. Reading a stored object through that type
 * would make the missing-key test below a comparison TypeScript rejects as impossible.
 */
type SkillsAsFound = Partial<SkillProficiencies>

/**
 * A `preset` sheet **as the database may still hold it**: the narrowed shape, plus the
 * field the narrowing takes away. Spelled here rather than read off `PresetSheet`, so the
 * planner reads the same way before and after the narrowing lands.
 *
 * ⚠️ **`race` is the reason a row needs sweeping, and `species` being absent is not.** A
 * row carrying both — one written by a half-finished earlier pass — still fails the
 * narrowed push, because `v.object` refuses a field it does not name. So the predicate
 * is *is `race` present?* and the repair is *write `species`, then drop `race`*, which is
 * also what makes the pass idempotent and interruptible.
 */
type PresetAsFound = Omit<PresetSheet, 'species'> & {
  species?: string
  race?: string
}

/**
 * Does this stored skill object predate one of the eighteen?
 *
 * Iterates `noSkills()` rather than naming the five 2024 additions, so a nineteenth skill
 * needs no edit here — the rule `skillProficienciesOf` already states for the read side,
 * applied to the write side, so the two cannot come to disagree about which keys exist.
 */
function missesASkill(stored: SkillsAsFound): boolean {
  return (Object.keys(noSkills()) as (keyof SkillProficiencies)[]).some(
    (key) => stored[key] === undefined,
  )
}

/** The stored flags with every missing one filled in as `false`. */
function allEighteen(stored: SkillsAsFound): SkillProficiencies {
  return { ...noSkills(), ...stored }
}

/**
 * What this sheet has to become, or null when it is already what the schema now says it
 * is.
 *
 * **Null means no write**, and it is what makes a second pass free rather than merely
 * harmless: `migrateGame` patches nothing for a game whose every sheet answers null, so
 * re-running the tool costs a read and writes no document at all. Every test of this
 * module runs it twice for that reason.
 *
 * ⚠️ **Built by spreading rather than field by field, on purpose.** CLAUDE.md's
 * field-by-field rebuild trap has fired six times in this project's history, and a
 * migration is exactly where it fires again: a preset carries `lineageKey`, an override
 * diff and a lock, and a rebuild that named the four fields this sweep cares about would
 * quietly delete the rest. The one field that *is* removed is removed by name.
 *
 * ⚠️ **And nothing here spells a key `undefined`.** `undefined` is not a Convex value, so
 * naming a field and handing it that is a *different write* from omitting the field —
 * which is why `race` leaves by destructuring rather than by assignment.
 */
export function planSheetMigration(
  sheet: StoredSheet,
): { next: StoredSheet; counts: MigrationCounts } | null {
  // A `bestiary` sheet is a key, a rating and an override diff. None of the six changes
  // reaches any of them: it stores no species, no archetype, no skill flags and no
  // speed, and its creature's speed comes out of the corpus on every resolution.
  if (sheet.kind === 'bestiary') return null

  if (sheet.kind === 'pc') return planPcMigration(sheet)
  if (sheet.kind === 'npc') {
    if (sheet.speed !== undefined) return null
    return {
      next: { ...sheet, speed: PRE_2024_SPEED_FEET },
      counts: { ...noMigrationCounts(), speeds: 1 },
    }
  }

  return planPresetMigration(sheet)
}

function planPcMigration(
  sheet: PcSheet,
): { next: StoredSheet; counts: MigrationCounts } | null {
  const counts = noMigrationCounts()
  let next = sheet

  // Filled only when the object is *there*. `skillProficiencies` itself stays optional
  // on `pcSheetValidator` — a Milestone 3 sheet that carries none is read through
  // `skillProficienciesOf`, which answers eighteen falses — so materialising one here
  // would write a document the schema never asked for and make every such character
  // look edited on the day the sweep ran.
  const stored: SkillsAsFound | undefined = sheet.skillProficiencies
  if (stored !== undefined && missesASkill(stored)) {
    next = { ...next, skillProficiencies: allEighteen(stored) }
    counts.skills = 1
  }

  if (next.speed === undefined) {
    next = { ...next, speed: PRE_2024_SPEED_FEET }
    counts.speeds = 1
  }

  return migrationCountsTotal(counts) === 0 ? null : { next, counts }
}

function planPresetMigration(
  sheet: PresetSheet,
): { next: StoredSheet; counts: MigrationCounts } | null {
  const counts = noMigrationCounts()
  // The one cast that matters, and the reason the `AsFound` naming exists: `sheet` is
  // typed as the narrowed shape and the row in hand may be the wide one.
  const found = sheet as PresetAsFound
  let next = sheet

  // ── 1. `race` → `species` ────────────────────────────────────────────────────────
  //
  // ⚠️ **`speciesKeyOf`'s rule, not a second copy of it.** That accessor answers
  // `species ?? race` — the new field wins — precisely so that a pass which stopped half
  // way leaves half the rows answering from each and both right. The `??` below is that
  // rule spelled once more because this module may not read a `PresetSheet` through an
  // accessor whose signature has already been narrowed past the field it is reading.
  if (found.race !== undefined) {
    const { race: _dropped, ...rest } = found
    next = { ...rest, species: found.species ?? found.race } as PresetSheet
    counts.species = 1
  }

  // ── 2. A retired archetype ───────────────────────────────────────────────────────
  //
  // ⚠️ **CLEARED, NEVER REMAPPED**, and `locked: false` is the half people forget.
  // Eight archetypes appear in no SRD and are retired by name in `RETIRED_SUBCLASSES`;
  // turning a Rogue's Assassin into a Thief would hand somebody a different character
  // than the one they built. Clearing plus unlocking is what lets the owner choose
  // again — and a locked sheet whose selection was cleared is a sheet nobody can fix,
  // because the builder refuses to save it and the DM is the only one who can unlock.
  //
  // The predicate is `subclassOf` answering null rather than a lookup in
  // `RETIRED_SUBCLASSES`, so a key that was never valid at all is swept by the same
  // rule. That is the same question `storedSheetProblem` refuses a *write* on, asked
  // once about the rows already stored.
  // ⚠️ **AND an archetype that still resolves but is now chosen too early, which is a
  // second cause with the same remedy.** `SUBCLASS_LEVEL` moved from 2 to 3 in this
  // conversion, so a premade character stored at level 2 holding a perfectly valid
  // `champion` or `thief` is a row nothing retired and nothing has repaired. It is not a
  // cosmetic difference: `storedSheetProblem` refuses that sheet on **every save**, with
  // *"An archetype is chosen at level 3, not before"* — so the owner cannot edit anything
  // at all, on a sheet they did not break, until somebody changes their level. That is
  // worse than the retired case, where at least the reason is visible on screen.
  //
  // Both causes are `||`-ed into one condition rather than written as two blocks, because
  // the remedy, the count and the argument for unlocking are identical, and two blocks
  // would be two places to keep the `locked: false` in step. What differs is only *why*
  // the key is no good, and neither answer is something the sweep tells anybody: the
  // builder says which archetype needs choosing again either way.
  //
  // The first predicate is `subclassOf` answering null rather than a lookup in
  // `RETIRED_SUBCLASSES`, so a key that was never valid at all is swept by the same rule.
  // Between them they are exactly what `storedSheetProblem` refuses a *write* on, asked
  // once about the rows already stored — which is the property to preserve if that
  // function ever grows a third reason to refuse an archetype.
  if (
    next.subclassKey !== null &&
    (subclassOf(next.classKey, next.subclassKey) === null || next.level < SUBCLASS_LEVEL)
  ) {
    next = { ...next, subclassKey: null, locked: false }
    counts.archetypes = 1
  }

  // ── 3. The five skill flags inside the override diff ─────────────────────────────
  //
  // ⚠️ **The second place these live, and the one a sweep forgets.** A DM who has typed
  // over a premade character's skills has a thirteen-key object on
  // `overrides.skillProficiencies`, which the narrowed `skillProficienciesValidator`
  // refuses exactly as it refuses one on a `pc` sheet. It is the same validator; a sweep
  // that only walked `pc` sheets would leave the push refused and no obvious reason why.
  const overrides = next.overrides
  const storedOverride: SkillsAsFound | undefined = overrides?.skillProficiencies
  if (overrides !== undefined && storedOverride !== undefined && missesASkill(storedOverride)) {
    next = {
      ...next,
      overrides: { ...overrides, skillProficiencies: allEighteen(storedOverride) },
    }
    counts.overrideSkills = 1
  }

  // No speed pin. A preset stores none — see `PRE_2024_SPEED_FEET`.
  return migrationCountsTotal(counts) === 0 ? null : { next, counts }
}
