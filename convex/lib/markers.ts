// THE CONDITION VOCABULARY — the seventeen words a coin can be marked with, and the one
// function that turns a stored array into a drawable one. Shared verbatim by the Convex
// functions and the browser, like lib/grid.ts, lib/limits.ts and lib/layers.ts, and for
// the same reason: a condition the two sides each spell for themselves is two vocabularies,
// and the one that loses is the pip that stops being drawn.
//
// ⚠️ **They are labels and nothing else, and that sentence is the whole design.** Nothing
// in `convex/` *reads* a marker. No roll consults one, no health band is computed from one,
// no drag is refused because of one, and no query filters on one. A marker is a word the DM
// or the coin's controller wrote on a coin so the people at the table can see it, and the
// table adjudicates it exactly as it would if somebody had said it out loud.
//
// That promise is a **guard test rather than a comment**: `convex/markerGuard.test.ts`
// greps `convex/` for a quoted module specifier naming this module and fails if anything
// outside the schema, the choke point and the board's public functions imports it. Which is
// what makes the paragraph above a promise instead of an intention — a comment saying
// "nothing reads a marker" is true until the commit that makes it false, and this one fails
// the build on that commit. It matches a *quoted specifier* rather than a bare path for the
// reason `corpusGuard.test.ts` already gives: several files will legitimately explain in
// prose that markers adjudicate nothing, and a guard that fails on the code written most
// carefully to respect it is a guard that gets deleted.
//
// ⚠️ **There is no `never`-arm switch anywhere in this file, and that is honest rather than
// lazy.** CLAUDE.md invariant 9 asks a new union for an allow-list switch with a `never`
// arm — and there is **no predicate here**, because nothing decides anything from a marker,
// which is the entire point of the paragraph above. A switch written to satisfy the rule
// would answer a question no caller asks: a guard that cannot fail, which is precisely what
// ADR 0012 argued out of `fogRects`' leak-guard entry. Adding one would also be the first
// module in `convex/` to *read* a marker, so the guard test above would have to grant it an
// exemption — the rule would eat the promise it was invoked to protect.
//
// What the invariant actually protects is met three other ways, each of which *can* fail:
// `TOKEN_MARKER_LABELS` below is a `Record<TokenMarker, string>` and fails to compile for a
// member added to the list; a `Record` of pip glyphs on the client fails the same way in the
// one place the browser decides how to draw one; and `lib/markers.test.ts` pins the
// validator's members **and their order** against the list, which is the direction the
// compiler cannot see. Three refusals, no theatre.

import { v } from 'convex/values'

/**
 * The seventeen conditions a coin can carry, **alphabetically**, spelled once.
 *
 * 5e (2024)'s fifteen conditions, plus `concentrating` and `dead` — the two states a table
 * spends the most time asking each other about and neither of which is a condition in the
 * rules. Concentration is declined as a *rule* on the record (CLAUDE.md's rules scope: no
 * field, no check, nothing that breaks it), and this does not lift that: it is a pip saying
 * the wizard is concentrating, which is the same register as a bestiary creature's loot
 * being a line of text and not an inventory. Nothing here ends anybody's spell.
 *
 * The order is load-bearing. The renderer iterates this array and draws a pip per member it
 * finds, so **the array *is* the pip order** — an eighteenth member appended rather than
 * inserted alphabetically reorders the pips on every coin in the game, and the checkbox grid
 * the DM ticks them in stops reading alphabetically at the same moment. `normaliseMarkers`
 * below is what makes that true of *stored* rows as well as rendered ones.
 *
 * ⚠️ **The keys are AMERICAN — `paralyzed`, not `paralysed` — against this codebase's
 * British house style, and this is deliberate.** Every other identifier here is British
 * (`normalise`, `colour`, `authorise`), the surrounding prose is British, and the roadmap's
 * own paragraph about this feature writes `paralysed`. These are not, because the SRD this
 * project moves to later is American and a vocabulary that half-matches it is worse than one
 * that does not match at all. Exactly one word in the seventeen actually differs, which is
 * precisely why it is worth shouting about: the next contributor will read `paralyzed` as a
 * typo and fix it in a two-line commit that looks like tidying.
 *
 * **A stored key whose spelling changed is a marker that silently stops drawing.** These
 * strings are written into rows; renaming one does not migrate them. Every coin already
 * marked `paralyzed` keeps a value the union has never heard of, `normaliseMarkers` drops it
 * exactly as designed, and the pip disappears from a board mid-session with nothing failing
 * anywhere. `lib/markers.test.ts` asserts the American spelling in both the list and the
 * labels for that reason — a comment cannot fail a build, and this is the change that needs
 * one to.
 */
export const TOKEN_MARKERS = [
  'blinded',
  'charmed',
  'concentrating',
  'dead',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const
export type TokenMarker = (typeof TOKEN_MARKERS)[number]

/**
 * The same seventeen members as a Convex validator, **hand-spelled rather than derived from
 * the array above**, and the duplication is deliberate — `lib/layers.ts` makes this argument
 * about `tokenLayerValidator` and it transfers without amendment.
 *
 * A generated `v.union(...TOKEN_MARKERS.map(v.literal))` would make the two agree by
 * construction, which sounds strictly better and removes the only guard that catches the
 * dangerous direction. Every refusal in this file and on the client fires when a member is
 * added to `TOKEN_MARKERS`; none of them fires when a literal is added to the *validator*
 * alone — and that is the failure that matters, because the schema would then accept and
 * store a condition nothing can label, draw or normalise. `lib/markers.test.ts` pins the two
 * against each other for membership and order, so the duplication is checked by machine and
 * the check can fail.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it can still repeat in —
 * see the docblock on it in lib/sheet.ts.
 */
export const tokenMarkerValidator = v.union(
  v.literal('blinded'),
  v.literal('charmed'),
  v.literal('concentrating'),
  v.literal('dead'),
  v.literal('deafened'),
  v.literal('exhaustion'),
  v.literal('frightened'),
  v.literal('grappled'),
  v.literal('incapacitated'),
  v.literal('invisible'),
  v.literal('paralyzed'),
  v.literal('petrified'),
  v.literal('poisoned'),
  v.literal('prone'),
  v.literal('restrained'),
  v.literal('stunned'),
  v.literal('unconscious'),
)

/**
 * What the controls call each condition. One record, not several, for the reason
 * `TOKEN_LAYER_LABELS` and `CHARACTER_GROUP_LABELS` both give: two records make an
 * eighteenth member fail to compile in two files, and whichever is fixed first looks
 * finished.
 *
 * Short on purpose — these go in a checkbox grid and a context menu, both of which are
 * scanned rather than read, and seventeen rows of sentence is a control nobody uses twice.
 * The *explanation* of what a condition does belongs to the rulebook on the table and is
 * deliberately not here; this module adjudicates nothing, so a tooltip describing the
 * mechanical effect would be the first sentence in `convex/` implying that something does.
 *
 * ⚠️ **American here too**, and for the same reason as the keys — `Paralyzed`. The labels
 * are what a DM reads, so they are also where a well-meant British "fix" would look most
 * obviously correct.
 */
export const TOKEN_MARKER_LABELS: Record<TokenMarker, string> = {
  blinded: 'Blinded',
  charmed: 'Charmed',
  concentrating: 'Concentrating',
  dead: 'Dead',
  deafened: 'Deafened',
  exhaustion: 'Exhaustion',
  frightened: 'Frightened',
  grappled: 'Grappled',
  incapacitated: 'Incapacitated',
  invisible: 'Invisible',
  paralyzed: 'Paralyzed',
  petrified: 'Petrified',
  poisoned: 'Poisoned',
  prone: 'Prone',
  restrained: 'Restrained',
  stunned: 'Stunned',
  unconscious: 'Unconscious',
}

/**
 * A raw array of stored strings read as a canonical marker list: deduplicated, ordered by
 * the vocabulary, and containing nothing the vocabulary has never heard of.
 *
 * ⚠️ **It iterates `TOKEN_MARKERS` and intersects with `raw`. It never maps over `raw`.**
 * That is the implementation and not an implementation detail: one pass over a
 * seventeen-member list dedupes, canonically orders and drops the unknown together, and it
 * is the *fail-closed* direction — a value that is not in the vocabulary cannot survive a
 * filter whose source is the vocabulary. The mapping formulation gets dedup and ordering
 * wrong quietly and the unknown case wrong loudly, which is the wrong way round.
 *
 * ⚠️ **The parameter is `readonly string[]` and not `TokenMarker[]`, deliberately.** The
 * failure this function exists for is an older bundle or an older deployment meeting a value
 * its union has never heard of — a schema push is not atomic, so a row written by a newer
 * deployment can be read by an older one for the seconds in between. A `TokenMarker[]`
 * parameter makes that case unwriteable in a test: the only interesting input would need a
 * cast, and a guard whose one real scenario can only be expressed by lying to the compiler
 * is a guard nobody keeps honest. Callers holding a `TokenMarker[]` widen for free.
 *
 * ⚠️ **It runs in three places, and each one is a different failure it prevents.**
 *
 * 1. **On the write path**, so what lands in the row is canonical. Without it the same two
 *    conditions in two orders are two different stored arrays, and a client that ticks
 *    *poisoned* twice stores it twice.
 * 2. **In the server projection** — `visibleMarkers` in lib/board.ts — because that query's
 *    `returns:` validator is `v.array(tokenMarkerValidator)`. An unknown value reaching it
 *    would make Convex refuse the payload and the query **throw for every caller**, taking
 *    the whole table's conditions subscription down over one row written by a deployment
 *    thirty seconds newer. This is the composition `maySeeLayer`'s docblock calls
 *    load-bearing, arriving a second time: drop the value *before* the projection sees it,
 *    and a stale read stays a stale read instead of becoming an outage.
 * 3. **In the renderer**, so an unknown value is simply not drawn. The pip lookup is a
 *    `Record` keyed by the union, and a `Record` miss in JSX is not a missing pip — it is an
 *    exception thrown while painting the board, so one unrecognised condition on one goblin
 *    blanks the map for everybody.
 *
 * Belt and braces at all three, and the three are not the same brace: the first is about
 * what is stored, the second about what is sent, and the third about what is drawn. A row
 * can be wrong without ever having gone through the first — that is what the schema push
 * window *is*.
 */
export function normaliseMarkers(raw: readonly string[]): TokenMarker[] {
  const given = new Set(raw)
  return TOKEN_MARKERS.filter((marker) => given.has(marker))
}
