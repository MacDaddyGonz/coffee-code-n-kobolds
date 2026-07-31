// The vocabulary of the bestiary — challenge ratings, tiers, roles, tags and sizes.
// Keys, labels and the arithmetic on a rating, and **never a creature.**
//
// **This is the browser's half of the bestiary**, in exactly the relationship
// lib/classes.ts has to lib/library/: the corpus of ~130 stat blocks lives under
// lib/bestiary/ and is never imported by a client, because the server resolves a
// creature and sends a finished `NpcSheet` over the wire. What the picker actually
// needs to draw its filters is this file — ten ratings, five tiers, eight roles and a
// couple of dozen tags — and a DM-gated index query for the summaries. A test asserts
// the separation, the same way `bundleGuard.test.ts` asserts it for the library.
//
// **Per-entry data may never be added here.** Not one creature's hit points, not one
// creature's attack, not a lookup table keyed by creature. The moment a stat block can
// be reached from this module the bundle argument is lost, and it is lost quietly —
// nothing on screen changes, the download just grows. If something needs a number that
// varies per creature, it belongs under lib/bestiary/ and behind the resolver.
//
// Deliberately a strict runtime leaf: the only runtime import is `v` from
// convex/values. In particular it must not import values from lib/skills.ts. That
// module imports `abilityModifier` and `proficiencyBonus` from lib/sheet.ts at
// runtime, and lib/sheet.ts imports `crValidator` from here — so a value import into
// skills.ts would close the cycle sheet.ts → creatures.ts → skills.ts → sheet.ts,
// where every side is evaluated eagerly at module scope and one of them sees an empty
// object. That failure is documented on `skillProficienciesValidator` in lib/sheet.ts
// and again in the note in lib/skills.ts. If this file ever needs `SkillKey`, it takes
// it with `import type` and nothing else.

import { v } from 'convex/values'

// ---------------------------------------------------------------------------
// Challenge rating
// ---------------------------------------------------------------------------

/**
 * The ten ratings the bestiary covers, ascending. CR 6 is the ceiling because the
 * character library stops at level 5, so a creature tuned for a level 8 party has
 * nobody to fight.
 *
 * ⚠️ **A `cr` must never be passed through `Math.round`.** `Math.round(0.125)` is 0
 * and `Math.round(0.5)` is 1, so a single well-meaning rounding collapses three of
 * these ten rows on every write — a CR ⅛ stirge silently becomes CR 0 and a CR ½
 * hobgoblin becomes CR 1. The trap is a real one rather than a hypothetical, because
 * `normaliseOverrides` in lib/sheet.ts carries a doc comment insisting on **"every
 * number, not just the ones that seemed to need it"** — which is correct for every
 * other number on a sheet and exactly wrong here. A rating is a *selection*, like a
 * level or a class key: it is not repaired, it is checked for membership of this list
 * by `crIndex` and refused if it is not one of them.
 */
export const CR_VALUES = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6] as const
export type ChallengeRating = (typeof CR_VALUES)[number]

/**
 * Hand-written in parallel with the array above, which is this codebase's established
 * shape for a key union — `raceKeyValidator` and `classKeyValidator` both do it, and a
 * test pins the two halves in agreement. Convex has no way to build a literal union
 * validator from a `readonly` tuple without losing the literal types on the way, so
 * the duplication is real and is checked by machine rather than by memory.
 */
export const crValidator = v.union(
  v.literal(0),
  v.literal(0.125),
  v.literal(0.25),
  v.literal(0.5),
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
)

/**
 * Where this rating sits in `CR_VALUES`, or −1 for anything that is not one of the
 * ten.
 *
 * Total and never throws, so it doubles as the set-membership test a stored rating is
 * validated with: `crIndex(cr) >= 0` is the check, not a range comparison. A range
 * would accept CR 1.5, which is not a rating this bestiary has a benchmark row for.
 */
export function crIndex(cr: number): number {
  return (CR_VALUES as readonly number[]).indexOf(cr)
}

/**
 * How a rating is written on a sheet: `1/8`, `1/4`, `1/2`, or the whole number.
 *
 * Fractions rather than decimals because that is how every published stat block and
 * every DM says it out loud — "CR one-eighth", never "CR nought point one two five".
 * Used by the picker rows and by the CR banner on the assigned creature's sheet.
 */
export function crLabel(cr: number): string {
  switch (cr) {
    case 0.125:
      return '1/8'
    case 0.25:
      return '1/4'
    case 0.5:
      return '1/2'
    default:
      // Non-finite cannot arrive from behind `crValidator`, but this runs in the
      // browser against whatever a control produced, and `NaN` printed into a banner
      // is worse than a question mark.
      return Number.isFinite(cr) ? String(Math.trunc(cr)) : '?'
  }
}

/**
 * One press of the CR stepper, **clamped at both ends of `CR_VALUES`.**
 *
 * Pressing the button eight times does not produce a CR 14 creature, for the same
 * reason `librarySheet` clamps a level to the library's range: past the ceiling the
 * content has stopped being balanced against anything, and there is no benchmark row
 * to scale towards.
 *
 * Steps by *position* rather than by arithmetic, which is the whole reason this
 * exists — the gaps between the ten ratings are not equal, so `cr + 1` moves a CR ⅛
 * creature to a rating that does not exist.
 */
export function stepCr(cr: number, delta: number): ChallengeRating {
  const index = crIndex(cr)
  // Not one of the ten, so there is no position to step from. Handed back unchanged
  // rather than snapped to the nearest rating: a value this function cannot place is
  // one the validator is about to refuse anyway, and inventing a rating for it would
  // turn a refusal into a silently different creature. The assertion is a deliberate
  // lie about a value that was already lying about its type.
  if (index < 0) return cr as ChallengeRating

  const step = Number.isFinite(delta) ? Math.round(delta) : 0
  return CR_VALUES[Math.min(CR_VALUES.length - 1, Math.max(0, index + step))]
}

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

export type TierNumber = 1 | 2 | 3 | 4 | 5

export const tierValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
)

export type CreatureTier = {
  tier: TierNumber
  name: string
  /** Inclusive, and both bounds are members of `CR_VALUES`. */
  crMin: ChallengeRating
  crMax: ChallengeRating
  /** The party this tier is aimed at, as a phrase for the picker's tier heading. */
  partyLevel: string
}

/**
 * The spec's difficulty table, verbatim — five tiers from a level 1 party to a level 5
 * boss fight.
 *
 * A creature's tier is a *label on its rating* rather than a second thing to choose,
 * which is why `tierOf` derives it. It is stored on a bestiary entry as well, so the
 * corpus test can catch an entry filed under a tier its CR does not belong to — the
 * same trick `LibrarySheet.level` plays against a misfiled premade sheet.
 */
export const TIERS: readonly CreatureTier[] = [
  { tier: 1, name: 'Tier I', crMin: 0, crMax: 0.25, partyLevel: 'Level 1' },
  { tier: 2, name: 'Tier II', crMin: 0.5, crMax: 1, partyLevel: 'Levels 1–2' },
  { tier: 3, name: 'Tier III', crMin: 2, crMax: 3, partyLevel: 'Levels 2–3' },
  { tier: 4, name: 'Tier IV', crMin: 4, crMax: 5, partyLevel: 'Levels 4–5' },
  { tier: 5, name: 'Tier V', crMin: 6, crMax: 6, partyLevel: 'Level 5 boss' },
]

/**
 * The tier a rating falls in.
 *
 * Reads Tier I for anything outside the ten ratings, which is failing towards the
 * harmless answer: an unplaceable creature shown among the weakest is a DM noticing
 * something odd, whereas defaulting to Tier V would put it in front of a level 1 party
 * as a boss.
 */
export function tierOf(cr: number): TierNumber {
  return TIERS.find((tier) => cr >= tier.crMin && cr <= tier.crMax)?.tier ?? 1
}

/** A `ReadonlyMap` for the reason given on `ROLE_BY_KEY` below. */
export const TIER_BY_NUMBER: ReadonlyMap<TierNumber, CreatureTier> = new Map(
  TIERS.map((tier) => [tier.tier, tier]),
)

/**
 * The tier, or null for a number that is not one of the five.
 *
 * Takes a widened `number` and tolerates a miss, which is the stance `findRole` and
 * `findTag` take and for the reason `findRole`'s doc comment gives: a tier travels on a
 * payload and reaches a picker that may be filtering on a number it remembered from
 * yesterday, so a tier the table no longer describes must leave the caller rendering
 * something rather than dereferencing an undefined inside a query that paints a screen.
 *
 * It exists because the alternative was a `TIERS.find` written out per component, each with
 * its own fallback — which is the shape of every drift this codebase has had to correct:
 * not everywhere at once, but in whichever copy was edited last.
 */
export function findTier(tier: number): CreatureTier | null {
  return TIER_BY_NUMBER.get(tier as TierNumber) ?? null
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_KEYS = [
  'brute',
  'tank',
  'skirmisher',
  'archer',
  'controller',
  'spellcaster',
  'support',
  'boss',
] as const
export type RoleKey = (typeof ROLE_KEYS)[number]

export const roleKeyValidator = v.union(
  v.literal('brute'),
  v.literal('tank'),
  v.literal('skirmisher'),
  v.literal('archer'),
  v.literal('controller'),
  v.literal('spellcaster'),
  v.literal('support'),
  v.literal('boss'),
)

export type CreatureRole = {
  key: RoleKey
  name: string
  /** One line, written for a DM who has never run this creature before. */
  blurb: string
}

/**
 * The eight roles, one per combat creature.
 *
 * A role is what the creature *does in a fight*, and it earns its place twice: it is
 * how a DM picks (nobody wants a third Brute), and it is what stops CR scaling
 * flattening the bestiary. A Tank sits above its benchmark row on armour class and
 * below it on damage; a Brute is the reverse — the scaler carries that deviation
 * across, so a scaled-up Tank is still unusually hard to hit rather than becoming the
 * average creature of its new rating.
 */
export const CREATURE_ROLES: readonly CreatureRole[] = [
  { key: 'brute', name: 'Brute', blurb: 'Hits hard, goes down fast' },
  { key: 'tank', name: 'Tank', blurb: 'Soaks punishment and holds the line' },
  { key: 'skirmisher', name: 'Skirmisher', blurb: 'Darts in, hits, and is gone' },
  { key: 'archer', name: 'Archer', blurb: 'Dangerous at range, weak up close' },
  { key: 'controller', name: 'Controller', blurb: 'Dictates where the fight happens' },
  { key: 'spellcaster', name: 'Spellcaster', blurb: 'A short, sharp spell list' },
  { key: 'support', name: 'Support', blurb: 'Makes everything beside it worse to face' },
  { key: 'boss', name: 'Boss', blurb: 'The fight, on its own' },
]

/**
 * Typed as a `ReadonlyMap` rather than a `Map`, and that is not decoration. This is
 * module state, and a Convex isolate outlives the request that warmed it — a caller
 * that reached in and set a key would redefine a role for every later query until the
 * next deploy. `RACES` carries the same warning in prose; here the type says it.
 */
export const ROLE_BY_KEY: ReadonlyMap<RoleKey, CreatureRole> = new Map(
  CREATURE_ROLES.map((role) => [role.key, role]),
)

/**
 * The role, or null for one that has been retired.
 *
 * Takes a widened `string` and tolerates a miss, which is the stance `findClass` takes
 * and for the reason its doc comment gives: a role key is *stored* — on a bestiary
 * entry today, and reachable from a filter the browser remembered yesterday — so
 * removing an entry from `ROLE_KEYS` must leave everything that named it readable
 * rather than dereferencing an undefined inside a query that paints a screen.
 */
export function findRole(key: string): CreatureRole | null {
  return ROLE_BY_KEY.get(key as RoleKey) ?? null
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * Searchable labels, and deliberately generous — creature type, movement, habitat and
 * the boss marker all in one namespace.
 *
 * One list rather than three (a type list, a terrain list, a keyword list), because a
 * tag's only job is to narrow a picker of ~130 creatures and a DM typing "cave" does
 * not care which category the word came from. `BestiaryEntry` draws both its `tags` and
 * its `environmentTags` from here for the same reason: two vocabularies would mean two
 * places to add "swamp" and one of them being forgotten.
 */
export const TAG_KEYS = [
  'undead',
  'humanoid',
  'beast',
  'dragon',
  'fiend',
  'construct',
  'elemental',
  'aberration',
  'giant',
  'monstrosity',
  'plant',
  'ooze',
  'flying',
  'aquatic',
  'forest',
  'cave',
  'mountain',
  'urban',
  'desert',
  'swamp',
  'arctic',
  'ruins',
  'boss',
] as const
export type TagKey = (typeof TAG_KEYS)[number]

export const tagKeyValidator = v.union(
  v.literal('undead'),
  v.literal('humanoid'),
  v.literal('beast'),
  v.literal('dragon'),
  v.literal('fiend'),
  v.literal('construct'),
  v.literal('elemental'),
  v.literal('aberration'),
  v.literal('giant'),
  v.literal('monstrosity'),
  v.literal('plant'),
  v.literal('ooze'),
  v.literal('flying'),
  v.literal('aquatic'),
  v.literal('forest'),
  v.literal('cave'),
  v.literal('mountain'),
  v.literal('urban'),
  v.literal('desert'),
  v.literal('swamp'),
  v.literal('arctic'),
  v.literal('ruins'),
  v.literal('boss'),
)

export type CreatureTag = {
  key: TagKey
  name: string
  /** One line, for the tooltip on a filter chip. */
  blurb: string
}

export const CREATURE_TAGS: readonly CreatureTag[] = [
  { key: 'undead', name: 'Undead', blurb: 'Was alive once, and has not let it go' },
  { key: 'humanoid', name: 'Humanoid', blurb: 'People, and the trouble they cause' },
  { key: 'beast', name: 'Beast', blurb: 'Animals, ordinary and enormous' },
  { key: 'dragon', name: 'Dragon', blurb: 'Scales, breath and appalling confidence' },
  { key: 'fiend', name: 'Fiend', blurb: 'Out of somewhere worse than here' },
  { key: 'construct', name: 'Construct', blurb: 'Built rather than born' },
  { key: 'elemental', name: 'Elemental', blurb: 'Fire, water, earth or air, with intent' },
  { key: 'aberration', name: 'Aberration', blurb: 'Wrong in a way that is hard to name' },
  { key: 'giant', name: 'Giant', blurb: 'Enormous, and rarely subtle' },
  { key: 'monstrosity', name: 'Monstrosity', blurb: 'Nothing else fits it' },
  { key: 'plant', name: 'Plant', blurb: 'Growing, and unfriendly about it' },
  { key: 'ooze', name: 'Ooze', blurb: 'Shapeless, hungry, hard to hurt' },
  { key: 'flying', name: 'Flying', blurb: 'Ignores the ground and most of the map' },
  { key: 'aquatic', name: 'Aquatic', blurb: 'At home in water, and dangerous in it' },
  { key: 'forest', name: 'Forest', blurb: 'Woodland and the edges of it' },
  { key: 'cave', name: 'Cave', blurb: 'Underground, in the dark' },
  { key: 'mountain', name: 'Mountain', blurb: 'High ground, thin air, long falls' },
  { key: 'urban', name: 'Urban', blurb: 'Streets, cellars and rooftops' },
  { key: 'desert', name: 'Desert', blurb: 'Heat, sand and no cover' },
  { key: 'swamp', name: 'Swamp', blurb: 'Wet ground that slows everything down' },
  { key: 'arctic', name: 'Arctic', blurb: 'Snow, ice and the cold itself' },
  { key: 'ruins', name: 'Ruins', blurb: 'Somebody built it, and then left' },
  { key: 'boss', name: 'Boss', blurb: 'Built to be the whole encounter' },
]

/** A `ReadonlyMap` for the reason given on `ROLE_BY_KEY`. */
export const TAG_BY_KEY: ReadonlyMap<TagKey, CreatureTag> = new Map(
  CREATURE_TAGS.map((tag) => [tag.key, tag]),
)

/** The tag, or null for a retired one. Tolerant, for the reason `findRole` is. */
export function findTag(key: string): CreatureTag | null {
  return TAG_BY_KEY.get(key as TagKey) ?? null
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

/**
 * Five sizes, and it is a **label rather than a rule**: nothing in D&D Lite adjudicates
 * size, and a token's footprint on the board is `tokens.sizeSquares`, which the DM sets
 * when they place it. Keeping the two apart is what stops this becoming a rules feature
 * requirements.md never asked for — a Huge creature the DM wants on one square is a
 * choice, not an inconsistency to repair.
 */
export const CREATURE_SIZES = ['tiny', 'small', 'medium', 'large', 'huge'] as const
export type CreatureSize = (typeof CREATURE_SIZES)[number]

export const creatureSizeValidator = v.union(
  v.literal('tiny'),
  v.literal('small'),
  v.literal('medium'),
  v.literal('large'),
  v.literal('huge'),
)

/** Long names, so a picker row and a sheet header agree on the spelling. */
export const CREATURE_SIZE_NAMES: Record<CreatureSize, string> = {
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  huge: 'Huge',
}
