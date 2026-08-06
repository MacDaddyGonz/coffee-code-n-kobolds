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

### A shape is a rectangle or a polygon, and the edge convention is the keystone

Roll20 offers two shapes and there is no third, so this does too. A polygon is stored on the
existing row: `points` is optional, and the four numbers `x/y/width/height` are **reinterpreted as
the bounding box, computed server-side by `boundsOf` and never taken from the client.**

⚠️⚠️ **THE POINT-IN-POLYGON EDGE CONVENTION HAS TO AGREE WITH THE RECTANGLE ONE EXACTLY, AND THAT
EQUIVALENCE IS A TEST RATHER THAN A PARAGRAPH.** `rectCovers` is half-open — top-left inclusive,
bottom-right exclusive — so that abutting shapes tile with no seam and without both claiming the
line between them. A polygon spelling out a rectangle has to answer **identically at all four edges
and all four corners**, and a polygon abutting a rectangle has to tile with it.

It does, and the reason is two details of the crossing-number rule that look arbitrary:

| Detail | What it buys |
| --- | --- |
| `(yi > py) !== (yj > py)` — a strict `>` on both ends | An edge whose *lower* vertex sits on the scan line counts as crossed and one whose *upper* vertex does not, so a ray passes through the top of a shape and under the bottom: **top-inclusive, bottom-exclusive**. |
| `px <` the intersection — strict | A point on a left edge has that edge to its right and is counted; one on a right edge has it to the left and is not: **left-inclusive, right-exclusive**. |

Neither is obvious by reading, and getting either wrong is quietly wrong for a year — a polygon
claiming one extra row of pixels hides a token the rectangle beside it also hides, and one claiming
one fewer opens a one-pixel corridor of visibility through a wall the DM believes is solid. Neither
is visible on a screen.

So `grid.test.ts` asserts the two functions **against each other** rather than against a list of
expected booleans: at all four edges, all four corners and a thousandth of a pixel either side, in
both winding directions, plus two abutting shapes of different kinds where exactly one claims every
point on the seam. The claim is the equivalence, so the equivalence is what is pinned — a
hand-written truth table would have to be got right by the same reasoning that could have got the
implementation wrong.

**The bounding box is what makes a polygon cheap, and that is why the client cannot supply it.**
`shapeCovers` runs `rectCovers` on the box *first*, so a scene of two hundred polygons costs two
hundred rectangle comparisons and a ray-cast for the handful whose box actually contains the point.
A box a client sent and got wrong is a shape drawn on every screen that hides nothing — which is
`normaliseFogRect`'s failure arriving through a second door — so there is no argument on `fog.draw`
that could carry one.

⚠️ **The bounds-first ordering is load-bearing for the fail-open branch as well, and that is the
second reason it is not merely a short-circuit.** A NaN never reaches the ray-cast, so there is
**one** fail-open branch in the fog design and not one per shape kind. The section above extends
unchanged: under a covered base it inverts to fail-*closed*, for every shape.

**The draw argument is a discriminated union and the stored row is not**, which sounds inconsistent
and is two different questions. A client states which of two gestures it made, and there the two
shapes have no field in common — so the union buys a `never` arm in `fog.draw` and a second in
`insertFogShape`, at the two places a wrong answer does damage: the checker that would let an
unknown kind past unvalidated, and the writer that would store it. A stored row is asked whether it
has a point list and either does or does not, which is CLAUDE.md invariant 9's optional-field
convention. The additive alternative — four numbers plus an optional `points` — accepts a call
carrying *both* spellings and silently prefers one, which is two states for one meaning and the
failure [ADR 0008](0008-one-shell-and-what-a-sheet-entry-is.md) settled.

**New cap: `MAX_FOG_POLYGON_POINTS = 32`.** The roadmap gives no number and the arithmetic is why
there has to be one — `200 shapes × 200 placements × vertices` of edge visits inside
`visiblePositions`, which is the query on the drag path. The constant's docblock carries the sum the
way `MAX_ROLL_DICE`'s does. Three is the floor, and it is a grammar rather than a courtesy: two
points are a line, `boundsOf` gives it a zero extent, and `rectCovers` then answers false for every
point in the plane.

⚠️ **Concave, collinear and self-intersecting outlines are accepted rather than refused**, and that
is a decision with a test on it. A DM tracing a cave wall produces all three by accident; the
even-odd rule answers all three coherently; and a validity check would refuse a gesture that works.
Winding order is not normalised either, because `polygonCovers` counts crossings rather than turns.

⚠️ **The table is still called `fogRects` and the name is now a misnomer.** Renaming a Convex table
is a widen-migrate-narrow across two deploys and the whole of what it buys is a better word. The
schema pushes in this project that were worth that are the ones where the old shape could publish a
secret; a table whose every row goes to every client verbatim has no such argument behind it. The
correction lives in the schema comment, in `lib/fog.ts`'s header and in CLAUDE.md.

⚠️ **The gesture is `usePolygonDraw`, a second hook over `useStagePointer` and deliberately not a
third setting of `useRubberBand`.** A band is press-drag-release with one commit; a polygon is an
unbounded sequence of clicks with a live segment and two ways to finish, and the mouse button is
down for none of it. Teaching the band about vertices would give both callers a `mode` and give the
fog tool an `onCommit` that fires on `mouseup` sometimes and on a double-click other times.
`useStagePointer`'s docblock predicted this split before either polygon or wall existed.

**This is the commit that spends the previous one's acceptance criterion, and it is spent
deliberately.** The section above records that `convex/fog.test.ts`'s existing 1270 lines passed
untouched. `fog.draw`'s argument is now a union, so six call sites across four suites moved to it —
`fog.test.ts`, `feed.test.ts`, `vitals.test.ts`, `board.test.ts` and two helpers. **The call sites
moved and not one assertion did**, which is the weaker claim that is still worth making: what the
union changed is how a shape is spelled on the way in, and nothing at all about what fog does.

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
- **A polygon costs a ray-cast that a rectangle does not**, bounded by
  `MAX_FOG_POLYGON_POINTS × MAX_FOG_RECTS_PER_SCENE` per placement in the pathological case where
  every box contains the point. The box is what keeps the ordinary case free, and the number is what
  keeps the bad case finite.
- **A polygon cannot be edited, only rubbed out and redrawn.** No vertex handles, no dragging a
  corner. `fog.erase` deletes a row and `fog.draw` writes one, which is the whole of the surface —
  editing wants a mutation, a hit target per vertex and an opinion about two DMs dragging the same
  corner, and none of that is what the milestone is for.
- **The table's name no longer describes its rows**, and the correction is three comments rather
  than a migration.
