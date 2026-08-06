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

### A scene's second blob, and a storage guard that asks per field

The scene picker fetched the full 2560 px battle map for every row, which `SceneSelect`'s own
docblock had named and deferred: *a real derivative would mean a second blob per scene, generated
on upload and projected beside this one — a storage and payload change, and not one to make on the
way past.* It is made on purpose here. `scenes.thumbnailId` is a 320 px WebP at quality 0.7, derived
in the browser **from the already-downscaled map blob** so a 23-megapixel source is decoded once and
not twice.

⚠️ **The interesting part is not the thumbnail. It is that `storageGuard.test.ts` would have passed
on the commit that introduced the bug.** That guard derived one `…References…` predicate per
*table*, so once `scenes` had `sceneReferencesImage` a **second** blob column on the same table
satisfied it with nothing asking about those bytes — and `files.discard` would have cheerfully
deleted the picture the DM was looking at. Green build, green suite, live data loss.

So the derivation moved to the **field**: subject is the table minus a trailing `s`, object is the
column minus a trailing `Id`, capitalised. Three things about that are worth keeping.

- **It reproduces all four existing names exactly** and forces the fifth. No predicate was renamed
  to fit the rule.
- **It deletes a carve-out rather than adding one.** The old rule had to leave the suffix as `\w+`
  and explain in prose that `tracks` holds the one blob that is not a picture, so its predicate is
  `trackReferencesFile`. Under a field derivation the column is `fileId` and that name is what the
  rule *produces*. A guard that stops needing its own exception has usually started asking the right
  question.
- **The roadmap asked for a positive control that "fails today", and that has no committable
  form.** A red test cannot be committed, so the evidence would have lived in somebody's terminal.
  Both halves are kept instead: the superseded derivation is reproduced in the test file and the
  last test feeds both rules a synthetic two-blob table, asserting the old one is satisfied by an
  importer covering one column while the new one demands two; and the genuinely red run — the new
  guard against a `files.ts` with the predicate removed — is pasted into that commit's message,
  which is where a red run belongs.

`files.discard` takes `imageIds` now, capped at `MAX_DISCARD_IDS`. One catch is one transaction and
one round trip, which is half as many ways for an error path to be partly right. ⚠️ **A referenced id
refuses the whole call**, and the tempting alternative — delete the free ones, skip the held ones —
is the bug: the id the caller most needs to hear about is the one it would be told nothing about. The
transaction makes the *outcome* identical either way; what is being chosen is that the caller finds
out.

⚠️ **The orphaned-blob problem gets strictly worse and this milestone does not fix it.** A tab that
crashes between the POST and `scenes.create` now leaks **two** blobs instead of one. That sweeper is
still the game-editor milestone's, and it is named here rather than left implicit — the cap above
bounds what one *call* can delete, and nothing at all reclaims bytes no row ever adopted.

### `publicSceneValidator` forks, and it forked one commit before it had to

`scenes.active` is **ungated**: it is the one board the whole table is looking at, so every player
subscribes to it and anything on that validator is published to the table by construction. The
thumbnail did not have to fork it — a second signed URL is not a secret, only waste. Notes do.

So the projection split when the *cheap* field arrived rather than when the dangerous one did, and
that ordering is the decision. `dmSceneValidator` extends `publicSceneValidator` with
`thumbnailUrl`, and later with `notes` and `order`; its one consumer is `scenes.list`, which throws
for a non-DM. The two facts are one fact: **that query refuses everybody else, therefore that query
may say more.** A fork created for the field that needed it would have been a fork created in the
same commit as a DM's private prep notes, reviewed together, with the reviewer's attention on the
feature.

The key set of the *player's* payload is pinned by a test against a fixture that genuinely has a
thumbnail, for `games.list`'s reason: a subtractive spec across two audiences guarantees only the
fields it names, and a scan for an absent key passes trivially against a row that never had one.

⚠️ **The absent-thumbnail fallback is resolved in the projection**, which is `backgroundOf`'s
discipline applied to a URL. A client writing `thumbnailUrl ?? imageUrl` for itself is a client that
can disagree with the server about which picture a row shows, and there would be two of them the
moment a second surface drew a scene list. Every scene uploaded before this field existed is
permanently in that state, because nothing regenerates a derivative server-side.

### Two unconditional deletes, and two different fixes

A duplicated scene shares the map blob, because invariant 6 forbids copying four megabytes to make
a copy. That breaks two unconditional `ctx.storage.delete` calls — and **the roadmap says both
become conditional, which is right for one of them.**

| Call site | What goes wrong | The fix |
| --- | --- | --- |
| `scenes.remove` | Another scene survives holding the blob, so deleting the original blanks the copy | **Conditional.** `otherSceneReferencesImage` / `…Thumbnail` |
| `deleteScenesInGame` | Every scene goes, so nothing survives to hold it — the failure is a **second `ctx.storage.delete` of the same id** | **Deduplication.** One set, rows then blobs |

The purge must *not* be made conditional, and the reason is worth reading twice because "finish the
job" is the obvious next commit. *Is another scene using this map?* is `true` for a duplicate that is
also about to be deleted, so asked per row it keeps the blob for ever, or works only by accident of
the order the loop runs in. It would also be O(n²). Deduplication is the **stronger** statement:
the question `scenes.remove` asks is answered *no* by construction for every id, because no scene
survives to own one.

⚠️ **The purge's bug is not about sharing at all.** A second delete of the same id throws a plain
`Error` and not a `ConvexError`, so it aborts the whole transaction — confirmed against a real
deployment when `deleteTokensInGame` hit it. From the moment one press can copy a map, a purge of
any game containing a copy would have failed outright and `admin.purgeGame` would have had no way
left to clean it up.

**One set for both columns**, not one per column: a blob a mis-sequenced client stored as one
scene's map and another's thumbnail is exactly as undeletable-twice as a shared map.

⚠️ **"Conditional" must not become an optional parameter on the existing predicate**, and
`otherTokenReferencesImage` in `lib/board.ts` already spends a paragraph on why. `files.discard`
asks *is anything using this?* and needs `true` for the row being examined; a delete path asks *is
anything **else**?* and needs `false` for the row it is removing. One function with an `exclude`
gives the discard guard an argument no caller wants to pass and a future caller can get wrong in the
one direction that blanks a live map. So there are four predicates over the `scenes` table now, and
the `_id` comparison — not the ordering of two adjacent lines — is what makes each call site correct.

**Landed one commit ahead of duplication**, deliberately: the bug is a property of the delete path
rather than of the feature that trips it, so the fix is reviewable without the feature in the diff.
The tests insert a second scene row on one blob directly, which is exactly what `duplicate` will
write. It is worth noticing that two milestones in a row have found the same latent bug: **an
unconditional delete is a bet that nothing will ever share the thing, and this project has now lost
that bet twice.**

### Notes, and the hazard the roadmap did not mention

The roadmap asks for *notes (DM-only, per scene)* and says nothing else about them, which reads as
the smallest item in the milestone. It is the one that could have shipped a leak.

`scenes.active` is **ungated** — it is the one board the whole table is looking at, so every player
subscribes to it — and `lib/scenes.ts` said in as many words that *nothing in a scene is a secret;
the background image is what every player is looking at.* That sentence stopped being true the
moment a scene could carry *the lich behind the altar is invisible until somebody casts detect
magic*. A `notes` field on `publicSceneValidator` is CLAUDE.md invariant 1 broken by one line, in a
milestone whose entire subject is what players may know.

The split is described above and landed a commit early on purpose. What is worth adding here is the
*test*: a fixture whose notes contain a distinctive string, scanned out of a real player payload,
with the DM's own list as the positive control — `board.test.ts`'s and `feed.test.ts`'s shape,
because a scan for an absent key passes trivially against a row that never had one.

Two smaller decisions came with the column. **Blank removes it** rather than storing `''`, so there
is one stored spelling of "none" (ADR 0008's convention) and `notesOf` is the one reader. And
`requireSceneNotes` is **not** `requireText`: it allows a blank, and it does not collapse
whitespace, because prose written in paragraphs is what the field is for and
`collapseWhitespace` would flatten it to a line. It still rejects rather than truncating, and still
measures UTF-16 units.

### Order is stored, but the number a client is sent is the index

`scenes.order` is optional and **absent sorts last**, because every scene in every game is in that
state until the DM first drags one — a default of 0 would make the first reorder invert everything
behind it. `orderOf` answers `Infinity`, `compareScenes` breaks ties on `_creationTime`, and the
sort lives inside `listScenes` so there is one answer rather than one per query.

⚠️ **The projected `order` is deliberately not `orderOf`'s answer.** `Infinity` is a perfectly good
float64 that Convex stores and transmits, and a nonsense thing to hand a browser; it is also the
wrong question, because whether a row has been dragged is a storage detail. What the DM's screen can
use is *where this row came in the order the server already computed*, so `scenes.list` passes the
index and the field is always 0…n-1.

`reorder` takes the **whole ordered list** and validates it is a permutation of this game's scenes —
`board.setControllers`' argument for a second table. The DM means *this order*, and a loop of N
"move up" calls is that intention spread across N transactions, where a refresh in the middle shows
a list nobody chose. A prefix is refused rather than accepted, because the unnamed rows would keep
whatever numbers they had; a repeat is refused because two rows at one index puts the tie-break in
charge.

### Duplicate: one choice, and a shared blob

*A wall is a property of the map; a placement and a fog shape are where things are tonight.* That
sentence decides the split, and it is one boolean rather than three checkboxes because it answers
every case a DM actually has: the same room laid out again, or the same room empty.

The image and the thumbnail are **shared**, which invariant 6 requires and which is what broke the
two deletes above. The **tokens** are shared too and only their placements are copied — a duplicated
map has the same recurring villain standing on it, and renaming it renames both, which is what
copying an encounter means. A copy does not become active and does not stamp.

⚠️ **`${name} (copy)` can overflow `MAX_SCENE_NAME_LENGTH`, and this is the third appearance of the
Milestone 1 lone-surrogate bug — the first where the *app* supplies the over-long part.** No field's
`maxLength` could have caught it, because nobody typed it. `sceneCopyName` reserves the suffix's
budget and spends the rest through `truncateCodePoints`, which measures UTF-16 units while stepping
whole code points: the same unit `requireSceneName` counts in, and no split surrogate. Cutting the
whole result instead would take the suffix off and produce a second map called almost what the first
one is.

### Replace: one factor, or a refusal

Every coordinate in this application is in the stored image's pixel space, so replacing the blob
moves everything. The rejected alternatives are a schema migration of every position row in every
game to store normalised coordinates, and doing nothing — which silently puts an afternoon of
calibration and fog in the wrong place with no error anywhere.

⚠️ **An aspect-ratio change beyond ~1% is refused**, because a different shape needs two scale
factors and two factors shear every square the DM aligned against a printed grid. `k === 1` skips
every rewrite, which is the common case rather than an optimisation: re-exporting a map at the same
size after redrawing a room is what a DM does, and multiplying two hundred placements by 1 is two
hundred writes that change nothing and re-push the board to the whole table.

⚠️ **The scaled `gridSize` can leave `isUsableGrid`, the roadmap does not say what to do, and the
answer is REFUSE rather than clamp.** A calibration silently pinned to `MIN_GRID_SIZE` is a grid that
no longer lines up with the map, discovered mid-session by a DM with no way to know the app changed
their number — and a "successful" replace is exactly the state in which nobody looks. A refusal names
the reason and leaves the old map in place, which is something they can act on. It is the same
principle as the aspect refusal one paragraph up: **where this mutation cannot preserve the
relationship, it declines rather than asserting a new one.** Placements are not re-snapped afterwards
for the mirror of that reason — the grid moved by the same factor, so a coin centred on a square
still is, and a snap would quietly correct the drift that would have told the DM something was wrong.

### One thing this milestone put in the wrong file on purpose

`copySceneFog` and `scaleSceneFog` read and write `fogRects` from `lib/scenes.ts`, and `lib/fog.ts`'s
header says it is the only reader of that table. Nothing is leaked — that confinement is a
convention rather than a guard, argued at length in both that file and `leakGuard.test.ts`, because a
fog rectangle goes to every client verbatim and has no non-secret twin. They are misfiled because the
fog-shape work was in flight on a parallel branch and a second author in that file is a merge
conflict rather than a design.

⚠️ **The merge that moves them has one thing to fix.** A `fogRects` row today is four numbers. The
shape work adds polygons with a `points` array, and neither function touches it — so a duplicated
polygon would arrive unscaled, and `replaceImage` would move every rectangle and leave every polygon
at the old map's scale. It is written into the code as well as here, because the two commits cannot
see each other and the merge is the one place somebody can fix it.

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
- **A crashed tab now leaks two blobs instead of one.** Still the game-editor milestone's sweeper,
  and named rather than left implicit.
- **`copySceneFog` and `scaleSceneFog` are in `lib/scenes.ts` and belong in `lib/fog.ts`**, and
  neither handles a polygon's `points`. Both are marked in the code; the merge with the shape work
  is the commit that owes the fix.
- **`scenes.list` now resolves up to two signed URLs per row instead of one**, for a query only the
  DM subscribes to. A scene with no thumbnail still resolves exactly one.
- **Fog is still a map tool and not a secrecy tool**, and a covered map does not change that. The
  background image is still fully downloaded, and a creature's *name and art* still travel in
  `board.tokens` — what fog takes is where something is, how hurt it is and what it just rolled. A
  creature that must not be known about goes on the GM layer. ADR 0012's *partial guard described as
  a whole one is worse than no guard* is unchanged and now has a second base to be true of.
