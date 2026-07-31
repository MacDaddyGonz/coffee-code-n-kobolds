// The shape of a bestiary entry, and nothing else. Content lives one file per category
// beside this one.
//
// **Nothing under lib/bestiary/ may ever be imported by the browser.** The server
// resolves a creature and sends a finished `NpcSheet` over the wire, so a client needs
// none of this: the picker gets its rows from a DM-gated index query returning summaries,
// and its filter vocabulary — ratings, tiers, roles, tags, sizes — from lib/creatures.ts.
// Around 130 stat blocks is a meaningful slice of a bundle that is already close to a
// megabyte, for data no client ever reads. A test asserts the separation, because it is
// exactly the sort of thing one convenient import quietly undoes.
//
// There is a second reason here that the premade character library did not have, and it
// is the stronger one. A list of creature names is a **spoiler**: the party knowing there
// is a dragon has had the dragon spoiled whether or not they can read its armour class,
// which is why the picker query re-verifies the DM code server-side like every DM-only
// query. A corpus in the bundle would hand every player the whole shelf, and no amount of
// gating on the query would matter.
//
// Runtime imports: none, deliberately. Types only.

import type { SkillKey } from '../skills'
import type { ChallengeRating, CreatureSize, RoleKey, TagKey, TierNumber } from '../creatures'

// Nothing is imported from ../sheet, and that is worth a line. An entry is the *input* to
// resolution rather than a sheet: the resolver turns its attacks and abilities into
// `SheetEntry`s, mints their ids, and assembles the `NpcSheet` the rest of the application
// reads. The one place the two shapes have to agree is `BestiaryAttack.damage` and
// `BestiaryAbility.roll`, which are strings in the shared roll grammar — and the corpus
// test is what holds them to it, by putting every one through `isValidRoll`. A type import
// could not have checked that anyway, since both are `string`.

/**
 * One of a creature's attacks. Maximum three per entry, per the spec.
 *
 * `damage` is a roll spec in the grammar `ROLL_PATTERN` describes, and it is **the only
 * field on an attack the CR scaler touches** — `1d6+2` becomes `2d6+4` on the way up,
 * inside the grammar rather than as a bare number the dice milestone would have to
 * special-case. Everything else here is words, and words do not scale: a CR 6 goblin is a
 * goblin who has been lifting, not one that has grown a second head.
 *
 * There is deliberately **no per-attack `attackBonus`** — one number covers the whole
 * creature. See the note on `npcSheetValidator` in lib/sheet.ts for what that reduction
 * buys and what it costs.
 */
export type BestiaryAttack = {
  name: string
  /** A roll spec: `1d8+3`, `2d6`. Validated against the shared grammar by the corpus test. */
  damage: string
  /** `slashing`, `fire`, `necrotic`. A label for the sheet; nothing adjudicates resistance. */
  damageType: string
  /** `melee`, `30 ft.`, `60/120 ft.` Empty for an attack where range never comes up. */
  range: string
  /** One or two sentences, beginner-facing. What it looks like when it lands. */
  text: string
}

/**
 * A special ability. Maximum three per entry, and mostly made of words.
 */
export type BestiaryAbility = {
  name: string
  text: string
  /** A roll spec when the ability rolls something, null when it is a standing rule. */
  roll: string | null
  /**
   * Whether a CR shift moves this ability's own numbers. **Defaults to false**, so the
   * source spec's rule — abilities are unchanged by a shift — is what happens when nobody
   * thinks about it.
   *
   * The opt-in exists because freezing every ability makes some scaled creatures not
   * actually scaled. A dragon's breath weapon is most of its damage output; leaving that at
   * the CR 6 figure while scaling the claws down to CR 2 produces a creature that reads as
   * a CR 2 threat and kills a level 2 party in one breath. Regeneration's die, by contrast,
   * stays exactly where it is: it is a pace, not a payload, and doubling it would make a
   * scaled-up troll unkillable rather than harder.
   *
   * The corpus test refuses an ability whose average damage exceeds its own CR row's
   * without this flag set, so "I forgot to opt in" is caught by machine rather than by a
   * session going wrong.
   */
  scalesWithCr?: boolean
}

/**
 * The combat block. Absent on a social NPC who is not expected to fight.
 *
 * Every number here is **pre-calculated**, which is the trade the reduced sheet made when
 * it stored `initiativeBonus`: a creature has no ability scores, no level and no
 * proficiency bonus, so `skillBonus` and `passivePerception` in lib/skills.ts have nothing
 * to work from. This is the second and third instance of that decision rather than a new
 * one.
 */
export type BestiaryCombat = {
  maxHp: number
  armourClass: number
  /** One number for the whole creature, not one per attack. */
  attackBonus: number
  initiativeBonus: number
  passivePerception: number
  /** Feet. Read through `speedOf` once it is on a sheet, like a hero's. */
  speed: number
  /** Null for a creature that forces no saving throws — most of them. */
  saveDc: number | null
  /**
   * Up to four skills, **an ordered array of pairs rather than a record**, and the choice
   * is load-bearing three times over.
   *
   * Convex record keys cannot be a union of literals — `v.record` takes `v.string()` for
   * its keys, so a record would accept a fourteenth skill, a misspelled `steath` and any
   * key a client cared to invent, which is precisely the guarantee `creatureSkillsValidator`
   * in lib/sheet.ts exists to hold. Display order matters, because a creature is listed
   * with the thing it is best at first and an object's key order is not something to lean
   * on. And an array makes a duplicate or an unknown key a *checkable* condition: the
   * corpus test can say "no entry lists Stealth twice" and "every key is one of the
   * thirteen", neither of which is expressible over a record whose keys are already
   * whatever they are.
   *
   * `SkillKey` rather than a string, so a fourteenth skill fails `npm run lint` before it
   * fails a test.
   */
  skills: { key: SkillKey; bonus: number }[]
  /** Maximum three. The cap is a content rule, checked by the corpus test. */
  attacks: BestiaryAttack[]
  /** Maximum three, same treatment. */
  abilities: BestiaryAbility[]
}

/**
 * The social block. Absent on a monster.
 *
 * **DM-only in its entirety, and for a sharper reason than a monster's statline**: what
 * the innkeeper knows *is* the plot. It rides on the same document and goes through
 * `maySeeCharacter` with everything else, so it needs no new guard.
 */
export type BestiarySocial = {
  occupation: string
  /**
   * Exactly three keywords, and the tuple type is the enforcement rather than a comment
   * plus a test. `['gruff', 'loyal', 'thirsty']`.
   */
  personality: readonly [string, string, string]
  /** What this NPC is worth asking about. From the thirteen, no fourteenth. */
  usefulSkills: SkillKey[]
  /** The important knowledge: what they can tell the party, in a sentence or two. */
  knows: string
  /** Optional, because not every innkeeper has an errand. */
  questHooks?: string
}

/**
 * One creature. A monster, a humanoid enemy or a social NPC — **one shape for all three.**
 *
 * A social NPC is a **variant rather than a third kind**: the combat block is optional on
 * the entry instead of the innkeeper getting a shape of their own. That is the discipline
 * the two sheet kinds already established — two variants cost one shared `SheetEntry` type
 * and no more — and a third shape here would spend the saving on the least interesting
 * creature in the corpus. `category` on the file it lives in is what distinguishes them
 * for the picker's tabs; the type is one type.
 *
 * A social NPC who *is* expected to fight simply has both blocks, which is what the spec
 * asks for and is unexpressible if the innkeeper is a different kind.
 */
export type BestiaryEntry = {
  /** The spec's Library ID. Stable — a character stores it, so a rename orphans a creature. */
  key: string
  name: string
  /** `Humanoid (goblinoid)`, `Undead`, `Beast`. A label, not a rules category. */
  creatureType: string
  size: CreatureSize
  /** `Chaotic Evil`, `Unaligned`. Flavour; nothing reads it. */
  alignment: string
  /** Exactly one, and it is what stops CR scaling homogenising the corpus. See `CREATURE_ROLES`. */
  role: RoleKey
  tags: readonly TagKey[]
  cr: ChallengeRating
  /** Derivable from `cr` by `tierOf`, and stored anyway so a misfiled entry fails a test. */
  tier: TierNumber

  // ---------------------------------------------------------------------------
  // Encounter metadata — **stored, and deliberately read by nothing yet.**
  //
  // The spec asks for it and no feature consumes it: there is no encounter generator, no
  // budgeting and no "scale to match my party" button, and none of those is being built.
  // It is written now because the arithmetic on the cost is one-sided — adding a field to
  // ~130 hand-written entries afterwards is ~130 edits, and filling it in while the entry
  // is being written is free. The same bet roll specs took when they were validated a
  // milestone before anything could evaluate one.
  //
  // `encounterRole`, `difficultyTier` and `challengeRating` from the spec's list are `role`,
  // `tier` and `cr` above rather than three more fields: two names for one value is two
  // places for it to disagree.
  // ---------------------------------------------------------------------------
  recommendedPartyLevelMin: number
  recommendedPartyLevelMax: number
  /** Where it is found. Drawn from the same tag vocabulary — see the note on `TAG_KEYS`. */
  environmentTags: readonly TagKey[]

  /** Absent on a social NPC who is not expected to fight. */
  combat?: BestiaryCombat
  /** Absent on a monster. */
  social?: BestiarySocial

  /** A line of text, not an inventory — exactly what a premade hero's kit is. */
  loot: string
  /** One or two sentences on behaviour, tactics or habitat. Becomes `NpcSheet.notes`. */
  notes: string
  /** One line for the picker row, written for a DM choosing at speed. */
  blurb: string
}

export type BestiaryCategory = 'monster' | 'enemy' | 'social'

/**
 * What a content file exports.
 *
 * Declaring the category on the file rather than on every entry means the index can
 * register a module without naming each creature in it, and a whole file cannot be filed
 * under two categories by a typo in one entry.
 */
export type BestiaryFile = {
  category: BestiaryCategory
  entries: readonly BestiaryEntry[]
}
