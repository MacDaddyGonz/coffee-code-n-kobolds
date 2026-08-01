// Turning stored selections into a sheet. The one place the character library, the
// races, the bestiary, the CR scale and the DM's overrides meet.
//
// Two of the four stored sheet kinds are *selections* and are resolved here — a
// `preset` hero out of lib/library/ and a `bestiary` creature out of lib/bestiary/ —
// and the second was cheap because the first had already established the shape. Both
// arrive at an ordinary `PcSheet` or `NpcSheet`, so everything downstream keeps the
// type it already had.
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

import {
  bestiaryCategoryOf,
  bestiaryEntry,
  type BestiaryAbility,
  type BestiaryAttack,
  type BestiaryCombat,
  type BestiarySocial,
} from './bestiary'
import { scaleCombat } from './bestiary/scale'
import { findClass, subclassOf, type ClassKey } from './classes'
import {
  tierOf,
  type ChallengeRating,
  type CreatureSize,
  type RoleKey,
  type TagKey,
  type TierNumber,
} from './creatures'
import { librarySheet } from './library'
import { race, type Race } from './races'
import type {
  AbilityScores,
  BestiarySheet,
  CharacterGroup,
  CharacterKind,
  CharacterSheet,
  ContentEntry,
  CreatureSkills,
  NpcSheet,
  PcSheet,
  PresetSheet,
  SheetEntry,
  StoredSheet,
} from './sheet'
import {
  MAX_ENTRY_ID_LENGTH,
  SPEED_FEET,
  attackBonusOf,
  categoryForRoll,
  creatureGroupOf,
  defaultNpcSheet,
  defaultPcSheet,
  isMonsterSheet,
  noSkills,
  toHitFromBonus,
  withCreatureOverrides,
  withOverrides,
  withoutUndefined,
} from './sheet'

/**
 * The sheet to display, roll and take hit points from, whatever the document holds.
 *
 * Replaces `characterSheet` at every call site inside `convex/`. A stored `pc` or
 * `npc` sheet passes through unchanged; a `preset` and a `bestiary` creature are both
 * built here.
 *
 * Written as one positive test per resolvable kind rather than as `!== 'preset'`,
 * which is what it used to be and which was the one type error in the tree the moment
 * a second selection shape existed: that test read "one selection kind and everything
 * else", so a `bestiary` sheet fell into the branch that returns the stored value as a
 * finished `CharacterSheet`. `normaliseStoredSheet` in lib/sheet.ts had already been
 * corrected for exactly this and its comment says so.
 */
export function resolveSheet(doc: { sheet?: StoredSheet }): CharacterSheet {
  const stored = doc.sheet
  if (stored === undefined) return defaultPcSheet()
  if (stored.kind === 'preset') return resolvePreset(stored)
  if (stored.kind === 'bestiary') return resolveBestiary(stored)
  return stored
}

/**
 * Whether this character is a monster — **without resolving anything.**
 *
 * This exists for two reasons and the second is the important one.
 *
 * The cheap one: `resolveSheet(doc).kind` was the answer, and it costs a library
 * lookup, several object copies and an id derivation over every feat and spell, all
 * of it thrown away except one four-character string. `publicCharacters` paid that
 * twice per character across up to two hundred of them, on a query that re-runs
 * whenever anybody joins, claims or renames.
 *
 * The one that matters: `maySeeCharacter` is the predicate deciding whether an NPC's
 * sheet reaches a player, and it was reaching through 13,000 lines of hand-written
 * library content to get its answer. A content bug that made resolution throw would
 * have taken `characters.list` and `characters.vitals` down for the whole table —
 * and the premade library fixed one instance of exactly that, where a retired class
 * dereferenced an undefined. **A security predicate should read one stored field**,
 * and every resolving branch states its `kind` unconditionally — `resolvePreset`
 * always returns `pc`, `resolveBestiary` always returns `npc` — so that field is all
 * the answer ever depended on.
 *
 * ⚠️ **The decision itself is `isMonsterSheet` in lib/sheet.ts and is deliberately
 * not spelled out here.** This function used to read `doc.sheet?.kind === 'npc'`,
 * which is a deny-list of the one secret kind, and adding the bestiary member to the
 * union made it answer `'pc'` for a creature nobody was allowed to see — while
 * compiling cleanly and passing every test. The chain was complete: `characters.list`
 * without a DM code hands back the creature's id and name, `claim` succeeds because
 * `requireVisibleCharacter` no longer refuses it, and `characters.sheet` returns the
 * whole stat block including `notes`, which for a social NPC is the plot.
 *
 * So the question is asked in one place, as an allow-list of the kinds that may be
 * published, with a `never` assignment that makes the next union member fail
 * `npm run lint` rather than fail silently. Do not re-inline the comparison here for
 * the sake of saving a call: the cost of this indirection is nothing, and the cost of
 * the two copies disagreeing is every prepared creature in the game.
 */
export function kindOf(doc: { sheet?: StoredSheet }): CharacterKind {
  return isMonsterSheet(doc.sheet) ? 'npc' : 'pc'
}

/**
 * Which of the DM's three headings this character sits under: Characters, NPCs, Monsters.
 *
 * The schema has four stored *kinds* and they do not map onto three groups — `pc` and
 * `preset` are both characters, and `npc` and `bestiary` are each either of the other two
 * — so the mapping is this function and is asked nowhere else. The client never computes
 * it; `publicCharacterValidator` carries the resolved answer.
 *
 * **A linked creature derives its group and a hand-built one stores it**, which is the
 * same split every other number on these sheets already makes. A bestiary entry declares
 * its category on the *file* it lives in rather than on the entry (see
 * lib/bestiary/types.ts), so `social` is an NPC and `monster` or `enemy` is a monster; a
 * hand-typed sheet has no corpus to ask, so the dialog asks instead and the answer is
 * stored in `NpcSheet.group`.
 *
 * ⚠️ **This is a display discriminator and `kindOf` above is a security one, and the
 * difference is what makes the defaults here safe.** Both of the values this can return
 * for a creature are DM-only — a player receives neither, because `maySeeCharacter`
 * refused the whole row before anybody asked which heading it went under — so a wrong
 * answer misfiles a row and can never publish one. That is why an unanswered hand-built
 * sheet may simply default, and why a retired entry key may fall back to `'monster'`
 * rather than refusing. Compare `isMonsterSheet`, whose default is fail-closed because
 * getting *that* wrong publishes a dragon. Do not merge the two questions, and do not
 * copy this function's tolerance across to that one.
 *
 * Exhaustive, with a `never` arm, for the reason `kindOf` gives: a fifth stored kind
 * should fail `npm run lint` here rather than pick a heading by accident.
 */
export function groupOf(doc: { sheet?: StoredSheet }): CharacterGroup {
  const stored = doc.sheet
  if (stored === undefined) return 'character'

  switch (stored.kind) {
    case 'pc':
    case 'preset':
      return 'character'
    case 'npc':
      // Absent means nobody was asked — every creature typed in before this field
      // existed, and `defaultNpcSheet`, which deliberately omits it. See that function.
      //
      // The default is `creatureGroupOf`'s rather than a `?? 'npc'` written out here,
      // because the two sheet forms have to draw the same answer and cannot call this
      // function: lib/resolve.ts imports both corpora, which `bundleGuard.test.ts`
      // forbids `src/` from reaching. lib/sheet.ts is the half of the question that is
      // safe in a browser.
      return creatureGroupOf(stored)
    case 'bestiary': {
      // A retired key resolves to a monster rather than throwing, exactly as
      // `resolveBestiary` keeps a retired creature readable: this runs inside
      // `characters.list`, and a throw here would blank the DM's whole panel over one
      // creature nobody can look up.
      const category = bestiaryCategoryOf(stored.entryKey)
      return category === 'social' ? 'npc' : 'monster'
    }
    default: {
      const unknownKind: never = stored
      void unknownKind
      return 'monster'
    }
  }
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

/** The stored selections, or null for a character that is not linked to the bestiary. */
export function bestiaryOf(doc: { sheet?: StoredSheet }): BestiarySheet | null {
  return doc.sheet?.kind === 'bestiary' ? doc.sheet : null
}

/**
 * Everything a creature carries that **is not a rule and has nowhere on `NpcSheet` to
 * live.**
 *
 * The same arrangement as `presetExtras` one function up, and its doc comment explains why
 * these are returned beside the resolved sheet rather than folded into it: none of them is
 * a rule — nothing rolls a creature type and nothing computes with an alignment — so
 * putting them on `NpcSheet` would mean a dozen more optional fields on a type a
 * hand-built monster shares, plus an accessor each, to carry strings only a
 * bestiary-linked creature has. And every one of them would be a field the schema could
 * not require, since the table already holds NPC sheets from before the bestiary existed.
 *
 * **`loot` is the same thing `equipment` is over there**: a line of text, not an
 * inventory. requirements.md excludes inventory and this does not lift that — nothing
 * tracks it, nothing spends it and nothing weighs it, exactly as the fixed kit on a
 * premade hero's sheet is a sentence rather than a bag.
 *
 * There is one field here with no counterpart on the preset side. **`overriddenFields`
 * is the keys of the override object**, and it is what makes the spec's *Compare Changes*
 * fall out of the data rather than being built: a stored copy of a sheet cannot tell the
 * DM's numbers from the library's and would need a hand-maintained list of what somebody
 * touched, which goes stale the first time a write forgets to append to it. The diff is
 * the storage, so the list is `Object.keys`.
 *
 * ⚠️ **The DM's own selections are deliberately absent.** `entryKey` and `cr` were both
 * here and were both a second spelling of something the caller is already holding — the
 * `BestiarySheet` it passed in — so `creaturePayload` reads them off that and never off
 * this. That is the rule `bestiaryOverridesValidator` states for `cr` in the override diff
 * and ADR 0006 states for a preset's level: a selection is changed by changing it, and a
 * second place to say it is a second place for it to disagree. `libraryCr` is not an
 * exception — it is the *entry's* rating, which is a fact about the corpus rather than
 * about the selection, and `tier` derives from the resolved one, which is why it stays.
 */
export type CreatureExtras = {
  name: string
  /** The rating the entry is written at. Half of `Owlbear · CR 3 → 5`. */
  libraryCr: ChallengeRating
  /**
   * The tier of the **resolved** rating rather than the entry's own, because a DM looking
   * at a creature they have scaled wants to know what it is now. The entry's own tier is
   * `tierOf(libraryCr)` and is one call away.
   */
  tier: TierNumber
  role: RoleKey
  tags: TagKey[]
  creatureType: string
  size: CreatureSize
  alignment: string
  /** A line of text, not an inventory. */
  loot: string
  blurb: string
  recommendedPartyLevelMin: number
  recommendedPartyLevelMax: number
  environmentTags: TagKey[]
  /**
   * Whether the entry has a combat block at all.
   *
   * **Stated rather than left to be inferred**, and the inference it replaces is worth
   * naming because it looked sound. A resolved sheet always has an armour class and hit
   * points — `npcSheetValidator` requires them — so "does this creature fight?" cannot be
   * read off the numbers. The nearest proxy is `attackBonusOf(sheet) !== null`, since that
   * field is optional and only a combat block sets it, and the panel did exactly that until
   * two consumers of the same fact disagreed: the main statline was correctly hidden for an
   * innkeeper while the *comparison* panel drew a grid of stand-in figures beside it. The
   * server has `entry.combat` in hand here and already ships this same boolean on the
   * picker's summary, so the fact travels once and both readers agree by construction.
   */
  hasCombat: boolean
  /** Null on a monster. DM-only in its entirety, like the rest of the sheet. */
  social: CreatureSocial | null
  /** The keys of the override diff, so the panel can mark a pinned field. */
  overriddenFields: string[]
}

/**
 * A social NPC's block as it leaves this module — **already the shape it travels in**,
 * rather than the corpus's `BestiarySocial`.
 *
 * The two differ in one field: `questHooks` is optional on an entry and nullable here,
 * because `undefined` is not a Convex value and an absent errand has to become something on
 * the way out. Converting here rather than one hop downstream is what lets `creatureLabels`
 * in lib/characters.ts be a rest-destructure of this type instead of a hand-written
 * projection — nothing between the two wanted the optional spelling.
 *
 * The arrays are plain rather than the entry's `readonly` tuple and list. The tuple type is
 * the enforcement of "exactly three keywords" and it stays where it can be enforced, on the
 * entry being written; what comes out of here is a copy the caller owns.
 */
export type CreatureSocial = {
  occupation: string
  personality: string[]
  usefulSkills: string[]
  knows: string
  questHooks: string | null
}

/**
 * ⚠️ **Every array here is copied, not shared, and this is the function where that
 * matters.** The corpus is module state and a Convex isolate outlives the request that
 * warmed it, so an array handed straight out of an entry is an array a caller could sort in
 * place and change for every later query until the next deploy. `RACES` copies its granted
 * abilities for precisely this reason, and `ROLE_BY_KEY` is a `ReadonlyMap` against the same
 * hazard.
 *
 * Because it is done *here*, nothing downstream has to do it again: this runs once per
 * request with nothing cached between, so a second copy in `creatureLabels` was protecting
 * an object that only this function had ever touched.
 */
export function creatureExtras(doc: { sheet?: StoredSheet }): CreatureExtras | null {
  const stored = bestiaryOf(doc)
  if (!stored) return null

  const entry = bestiaryEntry(stored.entryKey)
  // Null for a retired key, matching `presetExtras` against a retired archetype. The
  // creature's sheet still resolves — to defaults — so the panel has something to draw;
  // what it has lost is the labels, and inventing a creature type for a creature nobody
  // can look up would be worse than showing none.
  if (!entry) return null

  return {
    name: entry.name,
    libraryCr: entry.cr,
    tier: tierOf(stored.cr),
    role: entry.role,
    tags: [...entry.tags],
    creatureType: entry.creatureType,
    size: entry.size,
    alignment: entry.alignment,
    loot: entry.loot,
    blurb: entry.blurb,
    recommendedPartyLevelMin: entry.recommendedPartyLevelMin,
    recommendedPartyLevelMax: entry.recommendedPartyLevelMax,
    environmentTags: [...entry.environmentTags],
    hasCombat: entry.combat !== undefined,
    social: copySocial(entry.social),
    overriddenFields: Object.keys(stored.overrides ?? {}),
  }
}

/**
 * An entry resolved at a given rating **with the overrides skipped** — the spec's *View
 * Original*, and the picker's preview of what adding this creature would produce.
 *
 * Routed through `resolveBestiary` with an override-less selection rather than
 * reimplementing the first two layers, so a preview cannot drift from what an assignment
 * actually creates. Null for a key nothing declares, for the reason `bestiaryEntry`
 * tolerates one.
 */
export function resolveBestiaryAt(entryKey: string, cr: ChallengeRating): NpcSheet | null {
  if (bestiaryEntry(entryKey) === undefined) return null
  return resolveBestiary({ kind: 'bestiary', entryKey, cr })
}

/** Deep enough to own every array. See the note on `creatureExtras` above. */
function copySocial(social: BestiarySocial | undefined): CreatureSocial | null {
  if (social === undefined) return null
  const [first, second, third] = social.personality
  return {
    occupation: social.occupation,
    // Read by index rather than spread, so the entry's `readonly [string, string, string]`
    // is destructured against its tuple type — which is the whole enforcement of "exactly
    // three keywords", and which a spread would silently widen to `string[]` without
    // anybody having to be wrong about the count.
    personality: [first, second, third],
    usefulSkills: [...social.usefulSkills],
    knows: social.knows,
    // Nullable here, optional on the entry. See `CreatureSocial`.
    questHooks: social.questHooks ?? null,
  }
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

  // `withOverrides` lives in lib/sheet.ts rather than here, so the override panel in
  // the browser can run the identical merge instead of maintaining a second copy of
  // it. Only the library lookup above is server-only.
  return withOverrides(applyRace(base, race(preset.race), level), preset.overrides)
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
    // A trait is built from `traitName` and `traitText` and has no roll by
    // construction, so `passive` is the only coherent answer rather than a choice. A
    // race whose trait rolls something grants a feat or a spell instead — which is
    // what the Dragonborn's breath weapon already does.
    category: 'passive',
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

/**
 * Bestiary entry, then the CR scale, then the DM. **The order is the design and cannot
 * be rearranged**, exactly as it cannot in `resolvePreset` above.
 *
 * ```
 * bestiary entry  →  CR scale  →  the DM's overrides
 * ```
 *
 * **The scale reads the entry's own baseline every time, never a previously scaled
 * result.** That is what makes CR 3 → 6 → 3 return the original sheet byte for byte, and
 * it is guaranteed structurally rather than by everybody remembering to do it in this
 * order: `bestiarySheetValidator` in lib/sheet.ts has no `maxHp`, no `armourClass` and no
 * bonus field of any kind, so **there is nowhere on the stored document to put a scaled
 * number.** Compounding is unwriteable rather than merely avoided. Its doc comment records
 * that in full.
 *
 * **Overrides come last, so a shift never undoes the DM's thumb on the scale.** A
 * boss-fight armour class somebody bumped stays bumped through a CR shift, and a shift
 * after an override changes every number except the one that was pinned — the same reason
 * an override survives a level-up.
 *
 * ⚠️ **Both branches build a complete `NpcSheet` and both return `kind: 'npc'`
 * unconditionally**, and neither of those is tidiness. `resolvePreset`'s doc records that
 * its own not-found branch shipped without `skillProficiencies`, which made "a resolved
 * sheet always carries both" false for exactly the retired-selection case the branch exists
 * to survive; the same mistake here would be a creature with no `notes` field on a type
 * that requires one. And the unconditional `kind` is what `isMonsterSheet`'s correctness
 * rests on — a security predicate that reads one stored field is only sufficient because
 * this function never contradicts it.
 *
 * **It never throws.** This runs inside `characters.list`, so a content bug that threw
 * would blank the party panel for the whole table rather than misprint one creature.
 */
function resolveBestiary(stored: BestiarySheet): NpcSheet {
  const entry = bestiaryEntry(stored.entryKey)
  const combat = entry?.combat

  // Nothing to scale, for either of two reasons: a creature the bestiary no longer has, or a
  // social NPC who was never expected to fight. Both keep their name and their current hit
  // points and stand on the defaults — an innkeeper the DM has put on the board can still
  // take damage, and a retired creature loses only the numbers it was borrowing, while the
  // interesting half of a person travels in `creatureExtras`. `notes` is set explicitly
  // because this is the branch where neither the corpus nor an override need supply it.
  if (entry === undefined || combat === undefined) {
    return withCreatureOverrides(
      { ...defaultNpcSheet(), notes: entry?.notes ?? '' },
      stored.overrides,
    )
  }

  const scaled = scaleCombat(combat, entry.cr, stored.cr)

  // ⚠️ **The numbers are merged first and the actions are built afterwards, and that
  // ordering is load-bearing.** Every attack's to-hit is composed *from* `attackBonus`,
  // and `withCreatureOverrides` patches that field while leaving `actions` alone — so
  // composing before the merge would give a creature whose sheet reads +12 and whose
  // every weapon rolls 1d20+4. That is the "two spellings of one number" ADR 0007 went
  // out of its way not to create, arriving through the back door, and it would be
  // invisible on screen because both readings come from the same payload.
  //
  // Through `withoutUndefined` because `saveDc` is optional on both sides: most creatures
  // force no saving throws, and naming the key while handing it `undefined` is a different
  // write from omitting the key, since `undefined` is not a Convex value.
  const merged = withCreatureOverrides(
    withoutUndefined({
      kind: 'npc' as const,
      armourClass: scaled.armourClass,
      maxHp: scaled.maxHp,
      initiativeBonus: scaled.initiativeBonus,
      // Empty, so that the merge contributes the DM's `extraActions` and nothing else to
      // this field. The corpus's own go in front of them below, which is the order the
      // merge produced before and the order the sheet shows.
      actions: [],
      notes: entry.notes,
      speed: scaled.speed,
      passivePerception: scaled.passivePerception,
      attackBonus: scaled.attackBonus,
      saveDc: scaled.saveDc ?? undefined,
      skills: creatureSkillsFrom(scaled.skills),
    }),
    stored.overrides,
  )

  // Read through `attackBonusOf` rather than off the local, so the number on the entries
  // and the number on the statline come from the one accessor that decides what an absent
  // bonus means. A combat block always states one, so the fallback is unreachable from
  // here — and is the honest answer if it ever is not: a bare 1d20.
  const toHit = toHitFromBonus(attackBonusOf(merged) ?? 0)

  return {
    ...merged,
    // Attacks first, then abilities, under distinct prefixes. The prefix is what stops a
    // creature whose bite and whose Bite ability share a name colliding on one id, and
    // `entryId` derives the rest from the name rather than the position so that a CR shift
    // — which rewrites the damage on every attack — does not renumber the list and make
    // React read it as wholly replaced.
    actions: [
      ...scaled.attacks.map((attack, index) => withId(attackEntry(attack, toHit), 'atk', index)),
      ...scaled.abilities.map((ability, index) => withId(abilityEntry(ability), 'abl', index)),
      // The DM's own, contributed by the merge above and **left exactly as written**.
      // They are ordinary sheet entries: the DM chose their category and their to-hit,
      // and rewriting either would be this function overruling the last layer of
      // resolution.
      ...merged.actions,
    ],
  }
}

/**
 * One attack as a line on the sheet.
 *
 * `roll` is the damage expression, which is what the dice work will aim at; the composed
 * `text` is what a person reads. The two say the same thing on purpose, exactly as a
 * library spell's prose mentions the dice its `roll` field holds.
 *
 * **The attack bonus is deliberately not in the text.** It is one number for the whole
 * creature — a field on the sheet, not a property of an attack — so the panel renders it
 * once beside the armour class. Repeating it on each of three lines would be three places
 * for it to disagree with itself the moment a CR shift moves it, and it would read as
 * though the claw and the bite had separate bonuses, which is precisely the reduction
 * `npcSheetValidator` chose not to make.
 */
function attackEntry(attack: BestiaryAttack, toHit: string): ContentEntry {
  return {
    name: attack.name,
    text: attackText(attack),
    roll: attack.damage,
    // Not a spell, so no level; and not from the spell-and-feat catalogue in lib/rules.ts,
    // so no catalogue key. Putting the creature's key in that field would make the sheet's
    // badge claim this line came from somewhere it did not.
    level: null,
    catalogueKey: null,
    // **Every attack is a weapon by construction.** The corpus already separates
    // `attacks` from `abilities`, and an attack is exactly the thing that has to land
    // before its damage applies — so this is read off the structure rather than declared
    // on a hundred and fifty-nine hand-written attacks, which would be that many edits
    // and that many chances to disagree.
    category: 'weapon',
    // Composed by the caller from the creature's one `attackBonus` and passed in, never
    // stored per attack. The note above on why the bonus is not in the *text* applies
    // unchanged: there is still one number, and this is it spelled as a roll.
    toHit,
  }
}

function abilityEntry(ability: BestiaryAbility): ContentEntry {
  return {
    name: ability.name,
    text: ability.text,
    roll: ability.roll,
    level: null,
    catalogueKey: null,
    // Derived structurally, like `attackEntry`'s `weapon` above: an ability that rolls
    // something is an action and one that does not is a passive. **No ability in the
    // corpus is a weapon** — every one carrying a roll is a rider on a hit already
    // landed, a saving throw, or a burst — and the corpus test asserts that rather than
    // trusting it.
    //
    // Through `categoryForRoll` rather than spelled out here, because this *is*
    // `categoryOf`'s default and `entriesProblem`'s arity rule is anchored to it. A
    // copy that drifted would mint actions the validator then refuses, and it would
    // show up as a DM's creature failing to save rather than as a failing test.
    // `categoryOf` itself cannot be called: it takes a `SheetEntry` and this is
    // building a `ContentEntry`, which has no id yet.
    category: categoryForRoll(ability.roll),
  }
}

/**
 * `"melee. 2d6+4 slashing damage. It bites down and does not let go."`
 *
 * Every part is optional and an absent one leaves no trace — no stranded full stop, no
 * double space, and no second full stop after a range already written `30 ft.`
 */
function attackText(attack: BestiaryAttack): string {
  const damage = [attack.damage, attack.damageType]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ')

  const composed = [
    sentence(attack.range),
    damage === '' ? '' : sentence(`${damage} damage`),
    attack.text.trim(),
  ]
    .filter((part) => part !== '')
    .join(' ')

  // Capitalised here rather than in the content, because the leading word varies: it is the
  // range on most attacks, the damage on one with no range, and the flavour on one with
  // neither. A content author writing `range: 'Melee'` to get a capital would then read
  // oddly anywhere the field is shown on its own, and would still leave the other two cases
  // wrong. The resolver is what builds the sentence, so the resolver is what starts it.
  return composed === '' ? '' : composed[0].toUpperCase() + composed.slice(1)
}

/** Trimmed, and closed with a full stop unless it already ends in punctuation. */
function sentence(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/**
 * The entry's ordered array of pairs as the sparse record a sheet holds.
 *
 * The array is the corpus's shape because display order matters and because a duplicate or
 * an unknown key is then a checkable condition — see the note on `BestiaryCombat.skills`.
 * The sheet's shape is a record, because `creatureSkillsValidator` names the thirteen
 * fields and so refuses a fourteenth at the function boundary. Built in the array's order,
 * which JavaScript preserves for non-numeric keys, so the sheet lists a creature's best
 * skill first without depending on that for correctness.
 *
 * A key appearing twice would silently keep the later bonus. That is a content bug and the
 * corpus test is what catches it; repairing it here would hide it.
 */
function creatureSkillsFrom(skills: BestiaryCombat['skills']): CreatureSkills {
  const out: CreatureSkills = {}
  for (const skill of skills) out[skill.key] = skill.bonus
  return out
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
 * being replaced, and which Milestone 6 would read as every roll target moving.
 * `sheetProblem` insists ids are unique within a sheet, so the library's integrity
 * test asserts no sheet repeats a name.
 */
function withId(entry: ContentEntry, prefix: string, index: number): SheetEntry {
  return { ...entry, id: entryId(prefix, entry.name || String(index)) }
}

function entryId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}:${slug}`.slice(0, MAX_ENTRY_ID_LENGTH)
}
