// The eight races, and the only place a race changes a number.
//
// **This is a deliberate change to the rules subset.** docs/requirements.md said
// "No racial abilities", and that exclusion was lifted for Milestone 4 — see
// ADR 0006. It is worth knowing what that bought and what it cost: a race is now the
// second thing a beginner picks and the first thing that makes their character feel
// unlike anybody else's, and in exchange three of the eight touch arithmetic that
// the resolver has to apply in the right order and exactly once.
//
// Shared with the browser, and deliberately free of any `lib/library/` import: the
// picker needs these eight names and blurbs, and nothing else about them. See the
// note at the top of lib/classes.ts for why that separation matters to the bundle.

import { v } from 'convex/values'

import type { AbilityKey, ContentEntry, PresetSheet } from './sheet'

export const SPECIES_KEYS = [
  'human',
  'elf',
  'dwarf',
  'halfling',
  'half-orc',
  'tiefling',
  'dragonborn',
  'goliath',
] as const
export type SpeciesKey = (typeof SPECIES_KEYS)[number]

export const speciesKeyValidator = v.union(
  v.literal('human'),
  v.literal('elf'),
  v.literal('dwarf'),
  v.literal('halfling'),
  v.literal('half-orc'),
  v.literal('tiefling'),
  v.literal('dragonborn'),
  v.literal('goliath'),
)

/**
 * The union **as it may still be found in the database**: every narrow literal above, plus
 * the ones this application used to offer and no longer will.
 *
 * ⚠️ **Today its membership is identical to `speciesKeyValidator`'s, and that is the whole
 * point of writing it now.** `'half-orc'` is still in `SPECIES_KEYS` because retiring the
 * *content* is the species branch's job, not this one's — this commit builds the road it
 * drives down. On the day that branch removes `'half-orc'` from the narrow union, the two
 * spellings part company: the narrow one is what every argument takes, so no new character
 * can be built as a Half-Orc, and this one is what the *stored* field is validated against,
 * so every character who already is one survives the push.
 *
 * ⚠️ **The push is the first failure and the lookup is the second, and they are not the same
 * bug.** `species()` above already returns null rather than dereferencing `undefined`, which
 * is the second one fixed. But Convex validates existing documents on a schema push, so
 * removing a literal from the union a stored field is declared with makes `npx convex deploy`
 * *fail* against any deployment holding a row that uses it — before a single line of that
 * function runs. `storedTokenLayerValidator` in lib/layers.ts is the precedent this is copied
 * from, down to the ⚠️ TRANSITION comment it will earn once the narrowing is in sight.
 *
 * ⚠️ **Used by `presetSheetValidator.species` and by nothing else.** That is the same
 * discipline `storedTokenLayerValidator` keeps — one stored field, spelled wide; every
 * argument and every projection spelled narrow. There is one honest difference from that
 * precedent and it is worth stating rather than discovering: `characters.create` and
 * `characters.updateSheet` take `storedSheetValidator` *as their argument validator*, so a
 * stored union on this type widens the write path as well as the read path. That is why
 * `race` beside it is deliberately left on the narrow union and why this one is optional —
 * absent is what every existing row says, and a retired key can only ever arrive here from
 * the migration that writes it, never from a builder.
 */
export const storedSpeciesKeyValidator = v.union(
  v.literal('human'),
  v.literal('elf'),
  v.literal('dwarf'),
  v.literal('halfling'),
  // ⚠️ The member that will still be here when it has gone from the union above. Retired by
  // the 2024 conversion — 2024 has no Half-Orc — and kept readable for the characters who
  // chose one. See `RETIRED_SPECIES` below, which is what such a row is labelled with.
  v.literal('half-orc'),
  v.literal('tiefling'),
  v.literal('dragonborn'),
  v.literal('goliath'),
)

/**
 * An ability the character may spend once between long rests.
 *
 * Tracked rather than merely described, because these are precisely the things a
 * table forgets: Heroic Inspiration goes unused for three sessions and the Half-Orc's
 * one free survival gets spent twice in the same fight. The flag lives in
 * `characterVitals` beside hit points and hit dice, because it is **state** — a rest
 * changes it, an edit does not (ADR 0005).
 *
 * The app never enforces the effect. It remembers whether it has been spent, which is
 * the whole of what is being asked for and stops well short of a rules engine.
 */
export type PerRestAbility = {
  key: string
  name: string
  text: string
}

export type Species = {
  key: SpeciesKey
  name: string
  /** One line for the dropdown, written for somebody who has never played. */
  blurb: string
  /** The full trait, always shown on the sheet whether or not it does anything mechanical. */
  traitName: string
  traitText: string
  /** Added to the library sheet's scores. Absent for the five that change no numbers. */
  abilityBonus?: Partial<Record<AbilityKey, number>>
  /** Extra maximum hit points per character level. The Dwarf, and only the Dwarf. */
  hpPerLevel?: number
  /** Feet added to the base 35. The Goliath, and only the Goliath. */
  speedBonus?: number
  // Both `ContentEntry` — the sheet entry with its **category answered**. Taken from
  // lib/sheet.ts rather than from lib/library/types.ts, which declares the same alias:
  // this module is imported by the browser for its dropdown, and `bundleGuard` and
  // `corpusGuard` both refuse a specifier naming a corpus directory. The shared type
  // lives in the module both sides may already see.
  /** Spells this race hands over for free, appended to the sheet's spell list. */
  grantedSpells?: ContentEntry[]
  /** Feats and abilities handed over for free, appended to the sheet's feat list. */
  grantedFeats?: ContentEntry[]
  /** Spendable once per long rest. Empty for the six that have nothing to spend. */
  perRest?: PerRestAbility[]
}

export const SPECIES: readonly Species[] = [
  {
    key: 'human',
    name: 'Human',
    blurb: 'Adaptable, and lucky when it counts',
    traitName: 'Heroic Inspiration',
    traitText:
      'Once between long rests you may reroll any d20 you have just rolled, and must use the new result. Spending it is the whole cost — nobody has to be asked.',
    perRest: [
      {
        key: 'heroic-inspiration',
        name: 'Heroic Inspiration',
        text: 'Reroll a d20 you have just rolled. Once per long rest.',
      },
    ],
  },
  {
    key: 'elf',
    name: 'Elf',
    blurb: 'Quick, keen-eyed, sees in the dark',
    traitName: 'Darkvision',
    traitText:
      'You see in dim light as though it were bright, and in darkness as though it were dim, out to 60 feet — in shades of grey rather than colour.',
    // The one race that moves an ability score. Applied to the library's standard
    // array, which is allocated without considering race precisely so that this can
    // be added on top rather than multiplying the library by eight.
    abilityBonus: { dex: 2 },
  },
  {
    key: 'dwarf',
    name: 'Dwarf',
    blurb: 'Hardy — harder to knock down than anyone',
    traitName: 'Dwarven Toughness',
    traitText:
      'Your maximum hit points rise by one for every level you have. It is quiet, and by level five it is the difference between standing and not.',
    hpPerLevel: 1,
  },
  {
    key: 'halfling',
    name: 'Halfling',
    blurb: 'Small, cheerful, impossible to pin down',
    traitName: 'Lucky',
    traitText:
      'When you roll a 1 on a d20 test, roll again and use the new result. Always on — there is nothing to spend and nothing to remember.',
    // Deliberately not a per-rest ability. It is a standing rule rather than a
    // resource, so there is no flag to track and none is offered.
  },
  {
    key: 'half-orc',
    name: 'Half-Orc',
    blurb: 'Refuses to go down',
    traitName: 'Relentless Endurance',
    traitText:
      'When you would drop to 0 hit points and are not killed outright, you drop to 1 instead. Once per long rest.',
    perRest: [
      {
        key: 'relentless-endurance',
        name: 'Relentless Endurance',
        text: 'Drop to 1 hit point instead of 0. Once per long rest.',
      },
    ],
  },
  {
    key: 'tiefling',
    name: 'Tiefling',
    blurb: 'Infernal blood, and a knack for the uncanny',
    traitName: 'Infernal Legacy',
    traitText:
      'You know the Thaumaturgy cantrip, and it costs you nothing to keep. It appears on your spell list already.',
    grantedSpells: [
      {
        name: 'Thaumaturgy',
        text: 'A harmless show of supernatural power within 30 feet — your voice booms, flames change colour, the ground trembles, a door slams. Up to a minute, and worth far more at a table than in a fight.',
        roll: null,
        level: 0,
        catalogueKey: null,
        // Nothing is rolled and nothing is aimed — the cantrip is declared and it is
        // up, which is the definition of a passive rather than a judgement made here.
        category: 'passive',
      },
    ],
  },
  {
    key: 'dragonborn',
    name: 'Dragonborn',
    blurb: 'Draconic, and breathes fire',
    // Named for the ancestry rather than the weapon, because the weapon itself is
    // granted below as a rollable entry — and a trait sharing a name with a granted
    // feat put "Breath Weapon" on every Dragonborn's sheet twice, with only one of
    // the two rollable. The uniqueness check in `sheetProblem` did not catch it: the
    // ids differ (`race:dragonborn` against `race-dragonborn:breath-weapon`), so the
    // sheet saved cleanly and the duplication was purely something a player saw.
    traitName: 'Draconic Ancestry',
    traitText:
      'Draconic blood runs in you, and shows: scales, a colour, and the breath that comes with it. The Breath Weapon below is yours from the moment you draw one.',
    grantedFeats: [
      {
        name: 'Breath Weapon',
        text: 'Exhale energy in a 15-foot cone. Dexterity saving throw for half. Recharges on a short or long rest.',
        roll: '2d6',
        level: null,
        catalogueKey: null,
        // An `action` despite the name: the cone simply goes off and the target saves
        // against it, so there is nothing to land first and therefore no to-hit. A
        // `weapon` here would promise the dice work a second roll that does not exist.
        category: 'action',
      },
    ],
  },
  {
    key: 'goliath',
    name: 'Goliath',
    blurb: 'Enormous, and faster than you would think',
    traitName: "Giant's Might",
    traitText:
      'You count as Large. Your speed is 10 feet higher than everyone else, and you have Advantage on Strength checks.',
    speedBonus: 10,
  },
]

const SPECIES_BY_KEY = new Map(SPECIES.map((entry) => [entry.key, entry]))

/**
 * The species, or null for one that has been retired.
 *
 * ⚠️ **This used to end `SPECIES_BY_KEY.get(key)!` under the comment *"Non-null: `SpeciesKey`
 * is derived from the same list, so an unknown key cannot exist."* That comment was true when
 * it was written and is the exact shape of a landmine.**
 *
 * A key being unconstructable *in new code* is not the same as unconstructable. A character
 * **stores** its species, so removing an entry from `SPECIES_KEYS` leaves every character who
 * chose it holding a key nothing resolves — and the resolver then reads `.name` off the
 * `undefined` it got back. `findClass` in lib/classes.ts is the same lookup with the same
 * comment, and its docblock records what happened when a class was retired against it:
 * retiring one was a one-line edit that turned `characters.list` into a `TypeError` **for the
 * whole party**, not just for the character concerned. One player's stale key took everybody's
 * sheet list down.
 *
 * That pair has been one-fixed-one-not since; this is the other one, fixed **before** anything
 * is retired rather than after. Half-Orc is not a 2024 species and is going, so the comment
 * above was about to become false in the same commit that made it matter.
 *
 * ⚠️ **Returning null is necessary and NOT sufficient.** `speciesKeyValidator` is in the stored
 * schema, and Convex validates existing documents on a push — so removing `'half-orc'` from
 * that union makes `npx convex deploy` *fail* against any deployment holding one, before this
 * function is ever called. The lookup is the second failure; the push is the first.
 * `storedSpeciesKeyValidator` is what carries the retired key across, exactly as
 * `storedTokenLayerValidator` carried `dm`.
 *
 * Takes a `string` rather than a `SpeciesKey`, like `findClass`, because a caller holding a
 * *stored* key by definition holds something the narrow type says cannot exist.
 */
export function species(key: string): Species | null {
  return SPECIES_BY_KEY.get(key as SpeciesKey) ?? null
}

/**
 * A stored species key rendered for a person, whether or not it still resolves.
 *
 * `classLabel`'s treatment in lib/resolve.ts: a retired key is shown as itself rather than
 * thrown away, so a character built before the conversion still says *what it was* on a sheet
 * whose numbers it has lost. A blank where a species used to be reads as a bug; the key reads
 * as a choice that needs making again, which is what it is.
 */
export function speciesLabel(key: string): string {
  return species(key)?.name ?? RETIRED_SPECIES[key] ?? key
}

/**
 * The species this application used to have and no longer does, with what to call them.
 *
 * ⚠️ **A retired key is tolerated on READ and refused on WRITE**, which is the asymmetry
 * `subclassOf`, `catalogueEntry` and `librarySheet` already keep. A character holding one opens,
 * keeps its name and its hit points, and is told plainly that its species needs choosing again;
 * nothing lets a *new* character be built with one, because `speciesKeyValidator` — the narrow
 * union every argument takes — does not contain it.
 */
export const RETIRED_SPECIES: Record<string, string> = {
  // ⚠️ **Listed here BEFORE it leaves `SPECIES`, deliberately, and it is the one entry in
  // this record whose key currently resolves.** `speciesLabel` asks `species()` first, so
  // while the content is still present this line is unreachable and answers the same word
  // the entry does. That is the widen half of widen → migrate → narrow applied to a *label*:
  // the name a retired Half-Orc will be shown by exists, is spelled once, and is already
  // wired into the one function that prints a stored key — so the species branch retires the
  // content in one edit rather than in one edit plus a bug report from whoever opens the
  // first orphaned character.
  //
  // Capitalised as the entry spells it, because the two are the same word to a reader and a
  // sheet that changed its mind about the hyphen on the day the species left would look like
  // the migration had mangled it.
  'half-orc': 'Half-Orc',
}

/**
 * WHICH SPECIES A STORED PRESET IS, whichever of the two fields it happens to carry.
 *
 * ⚠️ **The only place `species` and `race` are ever both read**, which is the whole of what
 * makes a two-field transition survivable. `presetSheetValidator` carries `race` (required,
 * every row has one) and `species` (optional, nothing writes one yet), because renaming a
 * stored field in Convex is widen → migrate → narrow and this is the widen: the new name
 * exists, one accessor answers the question, and every caller is already reading through it
 * by the time the migration starts writing.
 *
 * **`species` wins when both are present.** That is the direction that makes the migration
 * idempotent and interruptible — a run that stops half way leaves half the rows answering
 * from the new field and half from the old, and both are right. The other order would make
 * the migration's own writes invisible until the narrowing commit deleted `race`, which is
 * exactly the window a migration wants to be able to verify.
 *
 * **Returns `string` and not `SpeciesKey`**, like `species()` and `findClass` take one: a
 * caller holding a *stored* key by definition holds something the narrow type says cannot
 * exist. Every consumer already goes through `species()` or `speciesLabel`, both of which
 * take a `string` and neither of which throws on a key that has been retired.
 */
export function speciesKeyOf(preset: PresetSheet): string {
  return preset.species ?? preset.race
}

/**
 * Every once-per-rest ability a race brings. Flat, because the sheet shows one list
 * and a race with two of them should not need the caller to know that.
 */
export function perRestAbilities(key: string): PerRestAbility[] {
  // Copied, not handed out. `SPECIES` is module state and a Convex isolate outlives
  // the request that warmed it, so a caller that sorted or pushed to this array
  // would corrupt the species definition for every later query until the next deploy.
  // Nothing does today; `defaultPcSheet` and `noSkills` both build fresh objects for
  // exactly this reason and have a test pinning it.
  //
  // A retired key has nothing to spend, which is the right answer rather than a fallback:
  // `characters.setPerRest` validates a *spend* against this list and deliberately does not
  // validate handing one back, so a character whose species went keeps whatever it had spent
  // clearable and gains nothing new to spend.
  return [...(species(key)?.perRest ?? [])]
}
