# 15. A map that starts covered

- **Status:** Accepted
- **Date:** 2026-08-06

> ⚠️ **This record is being written as the milestone lands.** The fog base is decided and built;
> the sections below it arrive with the commits they record. That is deliberate — the decisions
> worth writing down here are the ones building it forced, and several of them were not visible
> from the plan.

## Context

[ADR 0012](0012-three-layers-and-a-fog-that-is-honest-about-itself.md) shipped a fog that is honest
about itself: real for tokens, polite for the map, and a map tool rather than a secrecy tool. The
honest thing it does not do is the one thing a dungeon crawl needs — **start covered.** The DM paints
darkness onto a lit map, which means "the party has seen none of this yet" has to be approximated one
rectangle at a time and can never quite be complete. Roll20's model, and every published dungeon
workflow, is the inverse: the page is dark and the GM opens it room by room.

The feature is one field. Almost everything interesting about it is a consequence.

## Decision

### A scene has a base, and it is a two-member union with two accessors

`scenes.fogBase` is `lit | dark`, optional in the schema, and `convex/lib/fogBase.ts` holds the whole
vocabulary: the array, the validator, the labels, and the two predicates. It is a function-of-strings
module in `lib/layers.ts`'s register — the *decision* about whether a given token is hidden stays in
`lib/board.ts`, behind the choke point CLAUDE.md invariant 8 names, and what moved out is a question
no caller can turn into a row.

⚠️ **Two defaults, meaning opposite things, and both are right.** This is the single most confusing
thing in the feature and the thing a future reader will try to reconcile:

| Question | Answer | Why |
| --- | --- | --- |
| The field is **absent** (`fogBaseOf`) | **lit** | Absence is *history*. Every scene stored before this field was calibrated under the lit model and its fog was drawn *as darkness*, so answering `dark` would black out every map in every game on the schema push. |
| The field says something **unrecognised** (`startsCovered`) | **dark** | A schema push is not atomic. A scene written by a newer deployment can be read by an older one, and in that window a map must read as *more* hidden. `isMonsterSheet`'s terms, emphatically not `groupOf`'s tolerant ones. |

They are answering different questions, so neither is a default for the other, and both docblocks say
so pointing at each other.

⚠️ **`fogBaseOf` takes the stored value rather than the `Doc<'scenes'>`, unlike `backgroundOf` beside
it — and that is forced rather than chosen.** `lib/board.ts` has to ask the question, and
`lib/scenes.ts` already imports `deleteScenePlacements` *from* `lib/board.ts`. An accessor over the
document would close that cycle; a function of a string closes nothing. `layerOf` took a raw value
for exactly this reason.

### The early return inverts, and that is the whole cost model

Fog was affordable because a scene with no rectangles returned before the `tokenPositions` read.
Under a covered base, **no shapes is the most hidden a map can be**, so that return cannot fire. The
free case is now *this scene is in the state it shipped in*.

**The property CLAUDE.md invariant 2 names survives and its reason does not**, and the invariant was
restated in the commit that made it false, as the previous version of that paragraph instructed. The
new sentence is the price of the feature said out loud: **turning a scene to dark buys the positions
read for the rest of the session, without drawing anything.**

What survives either way is the invalidation half, which is the part that actually protects a drag:
an empty range read is invalidated only by an insert into that range, and a point get only by a patch
of that row. So a **drag** still invalidates nothing until fog is genuinely in use.

⚠️ **A cost the plan did not predict.** The base lives on the scene *document*, and `fogVeil` took a
scene *id*. So `characters.vitals` and `feed.list` now read the `scenes` table, which they did not
before — and a calibration drag patches that row at about ten writes a second, so those two
subscriptions re-push while the DM is aiming a grid. Bounded, in setup rather than mid-encounter, and
`scenes.active` already re-pushed on the same write. The rejected alternative was threading a whole
`Doc<'scenes'>` down through three public queries, which spends the same read three times and widens
three signatures.

The refactor that carried it deleted a duplicated read on the way past: `visiblePositions` asked for
`sceneFog` and then called a veil builder that asked for the same range again. Same read set, so no
extra invalidation edge — but a second execution of the query on the hottest read path in the
application. The reader is now `fogShape` and the two functions above it, `fogVeil` and `veiled`, are
pure.

### The reveal stamp inverts, and it is the highest-value catch in the milestone

`convex/fog.ts`'s header used to state the rule directly: *two of these functions widen an audience
and one narrows it, which is why the reveal timestamp is on `erase` and `clear` and deliberately not
on `draw`.* **That is a statement about a lit base and is exactly backwards under a dark one**, where
a shape is a hole in the darkness — drawing one is the reveal, and rubbing one out covers somebody
back up.

Get it wrong and **rubbing out a reveal replays a session's worth of rolls across the map** — the
failure ADR 0012 built the timestamp to prevent, arriving through the mechanism it built.

One predicate, in one place: `fogActReveals(act, base)`, a `switch` over the base with a `never` arm
beside a `Record<FogBase, Record<FogAct, boolean>>` of six cells. Both compile-time refusals live in
the table — a third base needs a row, a fourth act needs a cell in every row — and there is one
runtime default rather than the three a nested switch would have given.

⚠️ **Its runtime default is *stamp*, which is the opposite direction from every other fail-closed
default in this codebase, and that is not an oversight.** Every other one defaults to *withhold*
because a wrong answer publishes a secret. This one publishes nothing at all: `revealedAt` decides
whether a feed row arrives with a flourish over the map or arrives quietly, and every one of those
rows was already readable or already withheld before the predicate was asked. So the two costs are
**a stamp too many, which is one missing flourish**, and **a stamp too few, which replays an
evening**. There is no version of this where withholding is the cautious answer.

The two defaults sit in one file and each docblock names the other, because otherwise somebody
"fixes" one of them for consistency. `lib/fogBase.test.ts` asserts both directions side by side under
a test name that says why.

### Flipping the base does not delete anything, and always stamps

Inverting a map exactly — what was dark is now lit — is arguably a feature and is definitely a
surprise, so the confirm dialog says it in words. Deleting is what `fog.clear` is for, and a flip that
destroyed an afternoon's drawing with no undo is unforgivable.

⚠️ **`scenes.setFogBase` is the one write in the fog surface `fogActReveals` cannot answer for**, and
it stamps unconditionally. A flip widens and narrows **at once** — every shape that was covering is
now revealing and vice versa — so the predicate has nothing to say about it, and by its own
cost argument the cheap side wins. It is no-op guarded, because re-stamping for a press that changed
nothing would retire the flourish on every line older than it.

### Every sentence in the DM's panel is a function of the base

The same three tools do opposite things on the two bases, so a label that does not invert is a label
that lies. `MODE_LABELS`, the card description, the count line, the flip confirms and — the one that
matters — the **destructive confirm** are all `Record<FogBase, …>`. On a lit map *Clear all fog* lifts
the fog; on a dark one the same mutation takes every revealed area away and covers the whole board,
so it reads *Cover the whole map* and its dialog describes covering.

**A destructive confirm saying the opposite of what it does is the worst copy bug available here**,
and it is the reason the base lands as one commit covering the server, both client cues and the panel
rather than as a server change with the UI to follow.

### The two client inversions that would have been missed

Named because neither is in the server module and neither fails a test:

- **`hiddenFromParty`** — the DM's crossed-disc cue, which mirrors `veiled` clause for clause. Half
  inverting it makes the cue say the opposite of what the party's screen is doing, which is worse
  than not having the cue: the DM plans an ambush around it.
- **`FogLayer`'s *nothing drawn, draw nothing* early return** — right for a lit map, and on a covered
  one it means **paint the whole map black**.

⚠️ **The paint inversion is the one thing in this milestone no test can assert.** Under a covered
base the whole image is painted and each shape is punched out with Konva's `destination-out`, which
composites against the layer's own canvas — which is why `DM_FOG_OPACITY` stays on the `Layer` and
not on the shapes. Konva's **hit graph does not apply composite operations**, so a revealed area
still answers the pointer as its own rectangle; that is exactly what the eraser wants and it looks
like it should be the other way round. Verified by hand in two browsers, both bases, with
overlapping shapes. The rejected alternative — computing complement rectangles — is O(n²) in the
shape count and is the layers-of-paint model the roadmap declines under per-shape hide-or-reveal.

### The one documented fail-open branch inverts, and ADR 0012's sentence no longer covers both cases

`rectCovers` answers `false` for a non-finite coordinate, because every NaN comparison is false.
ADR 0012 calls that *"the only fail-open branch in the fog design"* — a token with a broken position
is inside no shape and is therefore published.

**Under a covered base the same answer withholds it**, because being inside no shape is being in the
dark. Neither is a bug and neither is a choice made anywhere: it is one behaviour read through two
bases. Recorded here so a reader does not carry ADR 0012's half of it across.

## Consequences

### Good

- A dungeon crawl works the way every published one does, and "the party has seen none of this" is
  one press rather than an approximation drawn rectangle by rectangle.
- The whole inversion is **four predicates and one boolean on a veil**. Nothing about layers,
  control, the choke points, the roll path or the feed's shape changed.
- `convex/fog.test.ts`'s existing 1270 lines passed **untouched**, which is the acceptance criterion
  for the absent-base default stated as a mechanical check rather than a promise.

### Costs and constraints we are accepting

- **A covered scene pays the positions read for the session.** Stated in CLAUDE.md invariant 2 rather
  than left for a profiler.
- **`characters.vitals` and `feed.list` read `scenes` now**, so a calibration drag re-pushes them.
- **The paint inversion is held by a hand check.** There is nothing in `npm test` that can look at a
  canvas.
- **Fog is still a map tool and not a secrecy tool**, and a covered map does not change that. The
  background image is still fully downloaded, and a creature's *name and art* still travel in
  `board.tokens` — what fog takes is where something is, how hurt it is and what it just rolled. A
  creature that must not be known about goes on the GM layer. ADR 0012's *partial guard described as
  a whole one is worse than no guard* is unchanged and now has a second base to be true of.
