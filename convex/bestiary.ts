import { v, type Infer } from 'convex/values'

import { query } from './_generated/server'
import { BESTIARY_FILES, bestiaryEntry } from './lib/bestiary'
import { creatureLabels, creatureLabelsValidator } from './lib/characters'
import {
  creatureSizeValidator,
  crValidator,
  roleKeyValidator,
  tagKeyValidator,
  tierValidator,
  type TagKey,
} from './lib/creatures'
import { requireDm } from './lib/games'
import { creatureExtras, resolveBestiaryAt } from './lib/resolve'
import { npcSheetValidator } from './lib/sheet'

// The DM's shelf. Both queries here take `dmCode` and re-verify it server-side, like
// every DM-only query in this application (CLAUDE.md invariant 7) — a `playerId` is
// routing and `players.isDm` is a badge in the roster, so neither may gate anything.
//
// **The reasoning is `scenes.list`'s, and it is worth restating because the first half
// of it sounds like an argument for leaving these open.** The library is not a secret:
// a Monster Manual is a book anyone can buy, and nothing in this corpus is a fact the
// group could not look up. What is secret is *which twelve of them the DM has put in
// this game*, which is twelve prepared monsters' worth of spoiler — the same category
// as a scene called `Dragon's Lair`, and the same category as the count that
// `visibleVitals` refuses to publish by sending a band for every NPC. So the gate is on
// the browser rather than on the shelf, and the picker is the DM's panel and nobody
// else's.
//
// **The corpus is never sent whole.** `index` returns summaries and a stat block is
// only ever resolved server-side, one creature at a time. That is what keeps ~280 entries
// out of a bundle already close to a megabyte — the argument
// lib/bestiary/types.ts makes at the top of the corpus, enforced from this end by these
// two functions being the only way in.
//
// Not one row of `characters` or `characterVitals` is read here, and that is a rule
// rather than a coincidence of what these two queries happen to need: invariant 8 gives
// those tables exactly one reader, and a source-grep guard sweeps for anybody else. If
// the picker ever wants an "already in this game" marker beside a row, that read goes
// through lib/characters.ts and comes back as a set of keys.

/**
 * One picker row. **Deliberately not a stat block**, and the `returns:` validator below
 * is the right tool for holding that line — which is worth saying, because one file over
 * the same tool would be useless.
 *
 * A summary and a resolved creature have genuinely different shapes: there is nowhere in
 * here to put an armour class, a hit point total or an attack, so a projection that tried
 * to widen a row into the whole entry makes Convex throw at runtime rather than shipping
 * ~280 stat blocks to the client. Contrast the row-shaped secret in lib/characters.ts,
 * where an NPC's document is indistinguishable in type from a hero's and no validator can
 * ever tell them apart.
 *
 * `hasCombat` and `hasSocial` are booleans rather than the blocks themselves, for exactly
 * that reason: the picker needs to know an innkeeper offers no CR stepper and a monster
 * has nothing to ask it about, and neither question needs the contents.
 */
const bestiarySummaryValidator = v.object({
  key: v.string(),
  name: v.string(),
  /** Which tab it belongs under. Declared on the content file, not on the entry. */
  category: v.union(v.literal('monster'), v.literal('enemy'), v.literal('social')),
  cr: crValidator,
  tier: tierValidator,
  role: roleKeyValidator,
  tags: v.array(tagKeyValidator),
  creatureType: v.string(),
  size: creatureSizeValidator,
  blurb: v.string(),
  /** Whether there is a statline at all — false for a social NPC not expected to fight. */
  hasCombat: v.boolean(),
  hasSocial: v.boolean(),
  recommendedPartyLevelMin: v.number(),
  recommendedPartyLevelMax: v.number(),
})

/** Read off the validator, so the projection below cannot come to disagree with the wire. */
type BestiarySummary = Infer<typeof bestiarySummaryValidator>

/**
 * Every creature in the bestiary, as a row.
 *
 * **The whole corpus in one answer, and no filtering server-side.** ~280 rows of a dozen
 * short fields is a few tens of kilobytes on a query the DM's panel subscribes to once,
 * and narrowing it by tier, role or a typed search term is a client-side `filter` over an
 * array already in memory. Doing it here would mean a distinct cache entry per
 * combination of filters and a round trip on every keystroke, in exchange for nothing a
 * DM would be able to perceive.
 *
 * It reads no table but `games`, and only to check the code. **That is not the same as never
 * re-running**, which this comment claimed until somebody traced the read set: the `games`
 * document is patched by every scene upload, activation and deletion, and by a rename, a DM
 * code rotation and `games.start`. So activating a map invalidates this subscription. The
 * answer is that there is nothing left to recompute when it does — see `BESTIARY_SUMMARIES`.
 */
export const index = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.array(bestiarySummaryValidator),
  handler: async (ctx, args) => {
    // The whole handler, and `requireDm` is the only reason it has a `ctx` at all.
    await requireDm(ctx, args.code, args.dmCode)
    return BESTIARY_SUMMARIES
  },
})

/**
 * The picker's rows, projected **once at import** rather than per call.
 *
 * The corpus is static, so this array can only ever have one value — but the subscription
 * above does re-run (the doc comment there says when), and rebuilding ~280 objects with a
 * fresh `tags` array each, on every scene activation, for a value that cannot have changed,
 * is work with no reader.
 *
 * Walked file by file rather than over the flattened `BESTIARY`, which yields the identical
 * order and takes the category straight off the file that declares it — a lookup keyed by
 * creature could only ever answer `BestiaryCategory | undefined`, and the `undefined` would
 * then need either a non-null assertion or a fallback category, neither of which is honest
 * about a creature. Read from the file it came out of, an entry cannot be uncategorised.
 * That is also why no such lookup exists: this was the only caller it would ever have had.
 *
 * Declaration order is the order the content files are written in, so the picker's rows stay
 * where the DM last saw them rather than reshuffling on a render.
 *
 * ⚠️ **The arrays are frozen rather than copied per call**, which is the one thing that
 * changes when a per-request projection becomes a shared one. The corpus is module state on
 * an isolate that outlives the request, so handing a caller an array it could sort in place
 * would change every later query until the next deploy — the hazard `ROLE_BY_KEY` is a
 * `ReadonlyMap` against. Copying defended against it 130 times a call; freezing defends
 * against it once, and against the shared array itself as well.
 *
 * The casts are what a `readonly` runtime guarantee costs at the type level: `Object.freeze`
 * widens to `readonly`, and a query's `returns:` validator describes the mutable array
 * Convex will serialise. The frozen thing is the real one; the type is the lie the runtime
 * makes true, rather than the other way round.
 */
const BESTIARY_SUMMARIES = Object.freeze(
  BESTIARY_FILES.flatMap((file) =>
    file.entries.map(
      (entry): BestiarySummary =>
        Object.freeze({
          key: entry.key,
          name: entry.name,
          category: file.category,
          cr: entry.cr,
          tier: entry.tier,
          role: entry.role,
          tags: Object.freeze([...entry.tags]) as TagKey[],
          creatureType: entry.creatureType,
          size: entry.size,
          blurb: entry.blurb,
          hasCombat: entry.combat !== undefined,
          hasSocial: entry.social !== undefined,
          recommendedPartyLevelMin: entry.recommendedPartyLevelMin,
          recommendedPartyLevelMax: entry.recommendedPartyLevelMax,
        }),
    ),
  ),
) as BestiarySummary[]

/**
 * One creature, resolved and **with no overrides applied** — the library's own copy.
 *
 * Two features out of one function, which is why `cr` is optional rather than required.
 * Omitted, this is the source spec's *View Original*: the entry at its own rating, which
 * is what the DM compares a creature they have been editing against. Supplied, it is the
 * picker's preview — the same creature shown at the rating the stepper is currently on,
 * before anybody has committed to adding it.
 *
 * The roadmap notes the one genuine cost of a third resolution layer: "original" now means
 * two things, the entry's rating and the DM's chosen one. This function answers both and
 * the caller says which it asked for, rather than the ambiguity being resolved somewhere
 * it cannot be seen.
 *
 * Null for a key the corpus does not know, rather than a throw. A character *stores* a
 * key, so a retired entry has to leave the panel that opens it rendering something — the
 * read-tolerant half of the asymmetry `requireUsableSheet` writes out in full.
 *
 * `npcSheetValidator` rather than the wider `sheetValidator`, because a creature resolves
 * to a monster's sheet and nothing else: a validator that also accepted a `PcSheet` here
 * would be approving a payload this function has no way to produce.
 */
export const entry = query({
  args: {
    code: v.string(),
    dmCode: v.string(),
    key: v.string(),
    cr: v.optional(crValidator),
  },
  returns: v.union(
    v.object({ sheet: npcSheetValidator, extras: creatureLabelsValidator }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireDm(ctx, args.code, args.dmCode)

    // **One condition, asked once.** Whether the corpus knows this key is decided here, and
    // it is decided for the default rating as well — there is no rating to fall back on
    // without an entry to read one off.
    const found = bestiaryEntry(args.key)
    if (!found) return null
    const cr = args.cr ?? found.cr

    // Asked through the same accessor a character's panel uses, against a selection sheet
    // built here rather than read from a document. One code path answers "what does the
    // library say about this creature", so the picker's preview and the assigned
    // creature's header cannot come to disagree about a label or a recommended party
    // level. `overriddenFields` is not among them: there is nothing to override on a
    // library copy, which is the whole point of this query.
    const sheet = resolveBestiaryAt(args.key, cr)
    const extras = creatureExtras({ sheet: { kind: 'bestiary', entryKey: args.key, cr } })

    // Both are unreachable given the check above — each is null for a key the corpus does
    // not know, and it knows this one. Written as one guard rather than two because they
    // are one condition already answered, kept only because both signatures say `| null`.
    if (!sheet || !extras) return null

    return { sheet, extras: creatureLabels(extras) }
  },
})
