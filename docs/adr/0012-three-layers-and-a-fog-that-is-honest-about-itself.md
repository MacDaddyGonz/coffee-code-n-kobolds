# 12. Three layers, and a fog that is honest about what it hides

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Two of the things in this milestone are ordinary DM tooling — a scene switcher that is not a bare
`<select>`, a handout the DM can hold up, a track to play under the session, drag handles on the
grid. One of them is the change this codebase has been pointing at and flinching from for four
milestones, and one of them is the first guard the project has knowingly shipped incomplete.

**The layer union is the counter-example this repository keeps citing.** When the bestiary milestone
widened `storedSheetValidator` it called that widening "additive and safe" and then, in the same
breath, named the exception: *"that is not true of every union in this schema — the DM-tooling
milestone's third `layer` member is the counter-example."*
[ADR 0004](0004-board-authorisation-and-layers.md) had already said the same thing more precisely,
under *What this ADR does not decide*: adding the member is a one-line schema change, and the work
is that `maySee` is a two-way test that a third layer is not something it extends to by itself.
Both were right, and neither said *why* — which is the first thing this record has to fix, because
"revisit every read path" is a instruction and not a reason.

The reason is that **sight and interaction gave the same answer while there were two layers, and
Background separates them.** `isDm || layer === 'player'` was doing two jobs that happened to
coincide: deciding what a client is *sent*, and deciding what a client may *move*. A player-layer
token is both seen and movable; a GM-layer token is neither. Background is seen by everybody and
movable by nobody but the DM, so it is the first row for which those two questions have different
answers — and no amount of widening one predicate produces two.

**Fog of war is a scope addition and appears nowhere in [requirements.md](../requirements.md).** It
is also the first thing this project has built while knowing it does not fully work. The map image
stays fully downloaded; a determined player can read the unfogged floor plan out of devtools. That
was decided in advance and for a good reason — hiding the map means tiling or masking it
server-side, which multiplies storage against a 1 GB ceiling and complicates both zoom and
calibration — but a partial guard needs saying out loud, in the register
[ADR 0011](0011-announcing-a-roll-rather-than-adjudicating-one.md) established when it gave the
threat model its first *paid* guard beside all the free ones.

## Decision

### Three layers, two predicates, and where each one lives

`tokens.layer` becomes `background | player | gm`, bottom to top. The two questions are now two
functions, in `convex/lib/layers.ts`:

- `maySeeLayer(layer, isDm)` — Background and Player are public, GM is the secret.
- `mayPlayersMove(layer)` — Player alone.

Each has a `never` arm in the house style, and there is a `Record<TokenLayer, string>` of labels
beside them, so a fourth member fails `npm run lint` in three places in that file before anything
runs. The client keeps two more records — one for how a layer is drawn, one for the warning a DM is
shown when they pick it — which brings the compile-time refusals to five.

**`maySee` stays in `convex/lib/board.ts`, and the split is not a loosening of the choke point.**
What moved into `lib/layers.ts` is a function of a *string*: three literals, two `switch`es and a
label, none of which any caller can turn back into a row. What stayed is every predicate that takes
a `Doc<'tokens'>`. CLAUDE.md invariant 8's table still names the right module, and *does this leak?*
is still answered by reading one file.

The split pays for itself on the client, where a `Record<TokenLayer, …>` is what makes a fourth
layer fail to compile in the two places the browser decides how to draw and label one. Keying a
record off `PublicToken['layer']` needs the type's *name*, and reaching for it in `lib/board.ts`
would have meant value-importing the choke point into the bundle.

**The `isDm` short-circuit sits above the layer question rather than inside it.** Folding the DM in
would put `isDm ||` in every arm and force the `never` arm to decide what a DM sees — a second
question inside a discriminator, which is the failure `isReservedCharacter` is written the way it is
to avoid. So `maySee` answers *who is asking*, `lib/layers.ts` answers *what this layer is*, and a
fourth layer changes exactly one of those two files.

### The scenery refusal is deliberately distinguishable, which inverts ADR 0004's rule

[ADR 0004](0004-board-authorisation-and-layers.md) made every board refusal throw the same
`TokenNotFound`, because telling "you may not move that" apart from "no such token" is an existence
oracle: a player who can enumerate the GM layer by guessing ids has had the ambush spoiled whether
or not they can see it. That reasoning is untouched and a GM-layer token still throws it.

A Background token throws a new and **distinct** `TokenNotMovable`, and inverting the rule needs the
argument rather than the exemption. The oracle argument is about a row the caller was *never sent*.
A Background token is in the player's payload — it is drawn on their screen, they clicked on it, and
they watched it not move. There is no existence to confirm and nothing to enumerate. Answering *that
token is not on this board* about a coin somebody is looking at is not discretion; it is a lie, and
it reads as a bug in the application rather than as a rule of the game.

It is a separate constant rather than a reuse of `TokenNotYours` because that message ends *ask the
DM to hand it to you*, and here that is untrue: the DM cannot hand over a Background token without
first moving it off Background.

**Where the check sits in `requireMovableToken` is most of what it means.** It is below the
`if (isDm) return token`, because the DM rearranges their own scenery — the requirement is that
scenery cannot be picked up *by them*. And it is above the claim-and-grant read, so **a grant cannot
open a layer**: a seat the DM has granted a Background token to is still refused, making the grant
*inert* rather than dangerous, which is exactly what `board.setControllers` already said about the
GM layer and is now true of two layers by one line instead of two. It is also the cheaper order on a
handler that runs ten times a second — a drag on scenery is refused with no index read at all.

### Fog hides a placement, not a row, and the difference is a cost model

A fogged token loses **its position row, its health band and its feed lines**. It does not lose its
token row: a player's `board.tokens` payload still carries the coin's name and art.

That is a narrowing of what "hide it" first meant, and the reason is invalidation rather than taste.
Fog is a fact about a *placement*, so any query that filters on it must read `tokenPositions` — the
table written ten times a second during a drag. `board.tokens` resolves a signed storage URL per
token, and [ADR 0004](0004-board-authorisation-and-layers.md) split the two board queries precisely
so that a drag does not re-resolve two hundred of them. Putting fog into that query would spend the
exact cost that split exists to avoid, to close a leak the layer model already answers properly.

So the line drawn is:

| Tool | Hides |
| --- | --- |
| **GM layer** | everything: the row, the placement, the band, the feed line, the sheet. Absolute. |
| **Fog** | where it is standing, how hurt it is, and what it just rolled. Not that a coin by that name exists, and not what condition it is in. |
| **Background** | nothing. Seen by all, moved by none but the DM. |

⚠️ **The fog row gained its last clause when conditions arrived on a coin**, and it is this
table's own argument reaching a second thing rather than a new exception. A condition is a
fact about a *row*, so filtering it would mean putting a `tokenPositions` read into a query
whose whole virtue is being off the drag path — the cost this section is about — and what it
would buy is closing a devtools leak of exactly the kind already accepted, one line above,
for a fogged coin's name. Recorded here rather than only in the newer record, because a
table that stops being true is worse than one that was never written. The standing answer is
unchanged: a creature that must not be known about goes on the GM layer.

The residual is that devtools shows an `Ambush Skeleton` exists somewhere in the game. That is the
same exposure an unplaced player-layer token has had since the board existed, and the honest summary
is that **fog is a map tool and the GM layer is the secrecy tool.** A DM who needs a creature not to
be known about puts it on the GM layer, where no arithmetic decides anything.

### One filter, three consequences, by a property that was already there

The fog test is `&&`-ed at two call sites and folded into `maySee` at neither:

```
visiblePositions      →  the placement goes
boardCharacterAccess  →  the band and the feed line go
```

The second is one `continue` in a loop that already existed. `boardCharacterAccess` iterates the
board once and returns `{ visible, controlled }`, and
[ADR 0009](0009-who-plays-what-and-what-control-grants.md) established that `controlled ⊆ visible`
*by construction* because an id can only enter the second on an iteration that has already put it in
the first. A fogged token is skipped before either, so the creature loses its health band through
`visibleVitals` and its feed lines through `mayHearOf` in the same write, and cannot be granted
around. **The cascade is not new machinery; it is the machinery that was already load-bearing,
paying out.**

`&&`-ed rather than merged, following `isReservedCharacter` beside `maySeeCharacter`, for two
reasons. `maySee` is a function of a **row** and fog of a **(scene, position)** pair, so folding it
in means handing that predicate a set it cannot verify was built for the same caller and the same
scene — the hazard `readableCharacterIds` documents, where two `ReadonlySet`s the compiler cannot
tell apart differ by one publishing everything. And the two reasons must stay separately statable,
because the DM's own screen has to explain *which* of them is hiding a coin.

### Fog is pay-as-you-go, and one early return is the whole cost model

Three returns before any read, in `foggedTokenIds`:

- **The DM reads nothing.** Not an optimisation: a `fogRects` read in the DM's transaction would put
  the scene's fog into the read set of every board query belonging to the one client that is
  *drawing* the fog, so each rectangle would re-execute the lot. The same reasoning
  `readableCharacterIds` uses to skip the board entirely for a DM.
- **A scene with no rectangles returns before the positions read.** So a game that never uses fog
  has read sets byte-identical to what they were before fog existed — which is every game until
  somebody draws one. This is the line that makes the feature free until it is used, and it is the
  reason the design is affordable at all.
- **A token anybody at the table controls is never fogged.** See below.

What a game *with* fog pays is that `characters.vitals` and `feed.list` join the drag's invalidation
set, so a drag re-pushes the feed alongside the positions it already re-pushes. Roughly double the
drag traffic for a table using fog, against a subscription that was already re-running on every roll.
Accepted, and named here so it is not discovered from a profiler.

### Fog never hides a token somebody controls, and this is correctness rather than courtesy

`board.positions` takes no seat and must not — that is the per-seat cache split the feed milestone
deliberately walked away from — so fog is one answer for every non-DM at the table.

Without an exclusion, a player who drags their own hero into a fogged corridor loses their own coin
from their own screen, with no way to select it back, no way to undo, and no recourse but asking the
DM. So `foggedTokenIds` skips any token with a non-empty `effectiveControllersOf`, which is heroes
and granted pets.

The rule also states what fog is *for*: it hides what the DM placed. A hero belongs to the table.

It costs a bounded `players` read, which `visiblePositions`'s docblock previously forbade
unconditionally. That docblock is corrected rather than overridden, because the cost it named is
real and unchanged — every join, rename and claim re-executing the position query. What changed is
that the read now sits behind a rectangle existing, so a game without fog still pays exactly nothing,
and `players` is the lowest-churn table in a live session anyway: joins and claims happen in the
lobby, before anybody has drawn a rectangle.

### A centre point, not a footprint

Whether a token is in a rectangle is decided by its stored centre, through `rectCovers` in
`convex/lib/grid.ts` — half-open on the far edges so abutting rectangles tile without a seam.

A footprint-overlap test is the more obvious answer and is worse three times. It needs `sizeSquares`
**and `gridSize`**, so `foggedTokenIds` would have to read the scene *document* rather than take a
scene id. It inherits the half-square parity offset `cellOf` carries — an even-sized token centres on
a grid *intersection* — so an uncalibrated or zero `gridSize` produces a `NaN` half-extent and
silently unfogs the entire map. And it is unstable at the boundary, where a 2×2 ogre one pixel over
the line vanishes from the party's screen while three-quarters of it stands in the lit room. The
stored coordinate already *is* the centre, so no grid enters the question at all.

⚠️ **`rectCovers` fails *open* on a non-finite coordinate**, because every `NaN` comparison is false.
`requireFinite` guards every write that could produce one, but `convex-test` does not apply Convex's
own value validation, so the test suite is precisely where such a row can exist. Left fail-open
deliberately: a token standing nowhere is not standing in the fog, and the secret a DM actually
relies on is held by the layer. It is the only fail-open branch in the design, and it is where fog
being a convenience rather than a guarantee is written into the code instead of into this document.

### `requireMovableToken` does not test fog

The oracle argument does not apply — the only tokens a non-DM can reach past `maySee`,
`mayPlayersMove` and `effectiveControllersOf` are ones whose existence they were already told about.
And the read would land on the wrong path: a `fogRects` range read on a handler that runs ten times
a second would turn every rectangle the DM draws into an OCC conflict against every in-flight drag,
on the one write path invariant 2 exists for.

It is also right on its own terms. A monster walking into the dark is what the DM is doing on
purpose; refusing the write would be enforcing a *view* on *board state*.

### `fogRects` gets no leak-guard entry, and the omission is argued

Every other "one module reads this table" note in this codebase is enforced by `leakGuard.test.ts`,
because each of those tables holds rows that are secrets *of the same shape as non-secrets*. A fog
rectangle is not like that: every row goes to every client verbatim, because a blacked-out map is the
whole user interface. There is no non-secret twin to be confused with and no predicate for a reader
to be the single home of.

An entry naming `lib/fog.ts` would in fact **pass**, which is exactly why omitting it has to be
argued rather than left implicit — that file says in as many words that this project does not keep
guards that cannot fail. What is genuinely guarded is one step downstream: turning rectangles into
withheld ids requires reading `tokenPositions`, and that read is confined by the existing entry with
no edit at all. `lib/fog.ts` is instead named in that test's *load check*, so it is still swept
against every table it must not read.

⚠️ **What flips this:** per-player fog, reveal-as-you-walk, or line of sight. Any one of those makes
a rectangle a statement about what *one caller* may know, the rows become secrets of the same shape
as non-secrets, and the table needs an entry that day.

### The GM layer's stored value is migrated, not aliased

`dm` becomes `gm` in the database, through widen → migrate → narrow. The alternative — store `dm`,
say "GM" on screen — is cheaper by two deploys and was rejected because a codebase where the schema
and every screen disagree about the name of the same thing spends that saving back over and over, on
a field whose whole job is to be unambiguous about a secret.

The sequence works because **Convex validates existing documents against a pushed schema**, so the
narrowing push is *refused* while a legacy row survives. That is a blocked pipeline rather than
broken data, and it is the safety net the whole plan rests on. It is also why the relabel code ships
in the widening commit: the code that performs the patch has to be pushable *while* `dm` rows exist,
and after the narrowing it no longer is.

Two properties make the window safe rather than merely short. The public projection carries the
**narrow** union and normalises on the way out, so no `dm` ever leaves the server and the browser
never learns the transition happened. And both argument validators take the narrow union, so no new
`dm` row can be created from the widening deploy forward, however many are still stored. The set of
legacy rows is therefore fixed and only shrinks.

`@convex-dev/migrations` was considered and declined. It would be this application's first Convex
component — a mount point, a generated component API and a new dependency — and what it buys is
cursor-driven batching across a table too large for one transaction. `MAX_TOKENS_PER_GAME` is 200,
so one transaction per game is the natural unit and is already `purgeGame`'s. `prune-games.mjs`
states the register: no tsx, no new dependency, nothing to install.

### A reveal is stamped by a mutation, because a query may not read a clock

Fog created a problem it did not invent. A feed row can arrive at a client because the **audience
widened** rather than because somebody rolled, and `TableEffects` announces the newest unseen row
over the map — so revealing a creature replays every roll it made while hidden. Moving a coin between
layers made that rare; erasing a rectangle makes it routine.

The comment that was there ruled out the obvious fix and was right to: an age test would compare
`createdAt`, a **server** timestamp, against the *client's* clock, so a browser a minute out of step
would silently announce nothing for the rest of the session — a silent total failure traded for a
loud occasional one.

The fix is to put both operands in server-clock space, and the constraint that shapes it is that
`Date.now()` is **forbidden inside a Convex query**: a query's result is cached and re-derived on
invalidation, so a wall-clock read is stale by construction. Passing `now` as an argument is worse
still — `feedArgs` exists so the whole table shares two cache entries, and a ticking argument mints
one per tick per browser on the highest-churn subscription in the application.

So a **mutation** writes `games.revealedAt`, where the clock is legal, and `visibleFeed` computes
`predatesReveal: row._creationTime < revealedAt` per row. `feed.list` keeps its array shape, which is
why this touches two literals rather than thirty-five call sites. The client's guard becomes one
line, and it still advances its watermark so newest-wins survives.

Two limits are accepted rather than hidden. **Coverage is discipline, not construction** — nothing
makes a future widening path call `stampReveal`, so `feed.test.ts` asserts `predatesReveal` per
widening mutation and a new path without a stamp fails a test that already exists. And **the clock
is game-wide**, so a genuinely fresh roll made a second before an unrelated reveal loses its
flourish. A per-token stamp would be exact at the price of a character → timestamp map crossing
`lib/board.ts`'s boundary, and a missing animation is the right thing to trade for that.

⚠️ **The rows themselves still arrive.** Erasing fog releases the withheld lines into the scrollback,
because the player genuinely has not been told about them and the alternative needs per-seat read
state on the feed — a new table and a per-seat cache entry on the subscription the dice milestone
deliberately collapsed to two. What is suppressed is the flourish, not the history.

### Non-square grid cells are declined

The roadmap asks for handles that "scale it on X and Y like a box in an image editor" and, in the
same bullet, for **no schema change**. Those cannot both be had: `Grid` is a single `gridSize` and
seven functions divide by it, so independent axes would need all seven plus the public scene
validator, `updateGrid`'s arguments, `isUsableGrid`, and `sizeSquares` token footprints — where a
"2×2 ogre" stops meaning anything at all.

No schema change is the binding half, so the gesture set serves the intent inside one number: a
corner resizes with the opposite corner pinned and **stays square**, an edge resizes from one axis
alone with the opposite edge pinned, and the body translates the offset. The box staying square under
a corner drag *is* the visible statement that cells cannot be rectangular.

### The handout and the track are pointers, not transports

Both are `v.optional(v.id(...))` on the game document, given `activeSceneId`'s treatment rather than
`status`'s: a pointer's absence already means none, so there is no default for an accessor to
centralise.

⚠️ **`music.select` broadcasts which track, and nothing else.** No `play`, no `pause`, no position,
no `startedAt`, and nothing anywhere records whether a person is listening. Synced play state is a
later milestone, and the absence of those three fields is what stops this quietly becoming half of
it. It is also what the platform enforces anyway: a browser will not start audio without a gesture,
so every client presses play for itself regardless of what the server says.

**Audio sharpens invariant 6 rather than weakening it.** An image gets three defences — the browser
downscales it, the browser checks the result, the server checks the stored blob. There is no
transcode a browser can do to an audio file, so the first does not exist and the client's check saves
the DM only the upload. `blob.size > MAX_MUSIC_BYTES` on the server is the whole of the enforcement,
which is the invariant's own sentence — *a limit only the client applies is a limit a client bug
removes* — reaching the case where the client was never applying one.

`files.discard` now asks four questions instead of two, and the real invariant is invisible: *every
table holding a `v.id('_storage')` is asked*. A test greps the schema for storage ids and asserts a
matching predicate is imported there, because the failure otherwise is a good-citizen discard
deleting the bytes out from under a handout somebody is looking at.

## Consequences

### Good

- **A third layer cost one predicate and a `Record`, and a fourth would cost five compile errors.**
  The thing four milestones flinched from turned out to be tractable once the reason it was hard was
  named: sight and interaction had to be separated, and everything else followed.
- **The fog cascade is one `continue`.** A creature in the dark loses its placement, its health band
  and its feed lines from a single filter, because `boardCharacterAccess`'s subset property was
  already structural. No fourth predicate, no `playerId` back on `feed.list`.
- **A game that never draws a rectangle is unchanged, byte for byte, in every read set.**
- **A grant still cannot widen anything it should not.** Inert on Background as it already was on
  GM, by a check placed above the grant read rather than by a second rule.
- **No `dm` layer value ever reaches a client during the migration**, so the rename is invisible to
  every browser and the relabel can be run whenever is convenient after the deploy.
- **The reveal flourish became correct rather than heuristic**, by moving one timestamp to the side
  of the wire that owns the clock.

### Costs and constraints we are accepting

- **Fog does not hide the map, and a determined player can read the floor plan out of devtools.**
  The first knowingly partial guard in this project. Stated in the threat model, not only here.
- **Fog does not hide that a coin exists** — only where it is, how hurt it is and what it rolled. A
  DM who needs more must use the GM layer, and nothing in the interface says so except the copy on
  the layer picker.
- **A table using fog pays roughly double drag traffic**, because `characters.vitals` and
  `feed.list` join the invalidation set of the position table. Bounded by nobody drawing a rectangle
  until they want one.
- **Erasing fog backfills the scrollback.** The flourish is suppressed; the lines still arrive, all
  at once.
- **The reveal stamp is game-wide and its coverage is a convention**, held by a test rather than by
  the compiler.
- **Two deploys and a manual step to rename one field.** The narrowing push is refused until the
  relabel has run against that deployment, which is a blocked pipeline for anybody who forgets.
- **Grid cells cannot be rectangular**, and a map photographed at an angle is still calibrated by
  eye against a single square size.
- **Music is per client and starts paused.** Two people who both press play are seconds apart and
  stay that way.

## What this ADR does not decide

- **Non-token objects on a layer.** Requirements.md's map-layer list mentions images and doors;
  ADR 0004 deferred them and so does this. A Background layer that can hold a token is not a
  Background layer that can hold an image, and the second needs the same choke point.
- **Per-player fog, reveal-as-you-walk, and line of sight.** Named above as the change that would
  make `fogRects` a secret-bearing table.
- **Synced music play state**, and with it whether the server ever learns that anybody is listening.
- **A handout library**, with browsing and reuse, which belongs with the other upload-backed
  libraries and the orphaned-blob sweeper.
- **Whether the reveal stamp should ever become per token.** Recorded as the exact price of making
  it exact.

## What building it found, recorded because the reasoning was wrong first

### The fog filter went in one function too high, and the wrong option compiled perfectly

The first implementation put the fog test inside `visibleTokens`, which is the obvious place: it
is the private filter every read path goes through, and one line there filters everything. That is
the *wider* option — the one weighed and declined — and nothing about it looks wrong. Both consumers
kept compiling, every existing test passed, and the payload got strictly smaller.

What it silently bought was a `tokenPositions` read inside `board.tokens`, because `visibleTokens`
feeds `publicTokens` as well as `boardCharacterAccess`. That is the query that resolves a signed
storage URL per token, so every drag frame would have re-resolved up to two hundred of them for
every client at a table with fog on the map.

**The lesson is about where a shared private helper is filtered, not about fog.** A predicate added
to the one function everything funnels through applies to consumers whose cost profiles have nothing
in common, and the compiler is no help at all — the two callers wanted opposite answers and both
type-checked. The filter now sits at the two call sites that want it, which reads as duplication and
is not.

### `maySeeLayer` took an `isDm` it ignored, and its own test found it

`maySee` short-circuits the DM above the layer switch, for the good reason recorded above — so the
layer function's `isDm` parameter had nothing left to do, and the body voided it. The logic was
correct everywhere it was called and the signature was a lie: `maySeeLayer('gm', true)` reads as *may
the DM see the GM layer?* and answered `false`.

Nothing would have caught it in review, because every existing call site passed the parameter that
was ignored and got the right answer anyway. What caught it was writing the predicate's truth table
out as a test with a DM column — at which point the second column was wrong for one row and
obviously so.

The fix was to delete the parameter, and the result is better than the thing it replaced: both
predicates are now questions about what a **player** may do, with no DM case in either, which is what
makes them read as a pair rather than as one function and a helper.

### The stamp was missing on the second release path, in the milestone that introduced it

`stampReveal` carries a warning that its coverage is **discipline rather than construction** —
nothing makes a future widening path call it. That warning turned out to describe the present rather
than the future: `characters.assign` releases a reserved character as a side effect of handing it to
a seat, and did not stamp. Releasing one publishes every line that hero has ever rolled, so the whole
backlog would have arrived at the table as fresh announcements.

Worth recording precisely because of who missed it and where. The obvious release path,
`characters.setReserved`, was stamped immediately; this one is a single guarded line in the middle of
a claim, and it reads as bookkeeping rather than as publication. **A convention held by a test is
held; a convention held by remembering is not** — which is why `feed.test.ts` now asserts
`predatesReveal` per widening mutation, and why that section states plainly how far the mitigation
reaches: it catches a stamp *removed*, never a stamp never written on a path invented later.

### The veil goes under the coins, and "fog is a layer" is what made that non-obvious

The plan said to paint the fog rectangles between the player and the GM token layers, which is
what the phrase *a layer between Player and GM* naturally means and what an image editor would do.

It is wrong here, for a reason that only appears with the server's rule in front of you.
`foggedTokenIds` deliberately **never** fogs a token the table controls — that exclusion exists so
that a player who walks their hero into a dark corridor does not lose their own coin with no way to
select it back. An **opaque** rectangle painted above the player layer takes that coin away again,
visually, having gone to real trouble on the server not to. The feature would have looked correct in
every test, because the tests assert payloads.

Underneath, nothing leaks. Every coin a player can have inside a rectangle is one their table
controls, because the server dropped the rest before the payload was built. So the veil is a wash on
the map, the party's own figures stand on top of it, and the DM — who sees it at partial opacity —
reads their own coins against the dark.

**This is the second time in this milestone that the mount point mattered more than the filter**, and
the two are the same mistake in different registers: the filter in the wrong function bought a cost,
and the veil in the wrong layer bought a lie. Both compiled, and neither was a bug in the predicate.

### The fog bound had to be a write check, because a read bound would be non-deterministic

`MAX_FOG_RECTS_PER_SCENE` was going to be a read bound like `MAX_PLACEMENTS_PER_SCENE` beside it,
which cannot fire because a token holds at most one placement per scene and tokens are already
capped.

Nothing structurally caps rectangles. A DM sweeping out a corridor with a small brush produces one
row per gesture, all evening — and a scene past the read window would hold fog that `foggedTokenIds`
sees only part of, with `take` free to return a different subset on different passes. **A secrecy
filter that hides a token on some reads and not others is worse than one that refuses**, because the
failure looks like a rendering glitch and gets explained away. So `fog.draw` enforces it, and the
refusal names both ways out rather than being a dead end mid-session.

## Alternatives considered

### Fogging the token row as well — rejected

The first instinct, and it is what "hide it" sounds like it should mean. Rejected because
`board.tokens` resolves a signed storage URL per token: with fog in that query, every drag frame
re-executes it and re-pushes up to two hundred fresh URLs to every client at the table. That is
exactly the cost [ADR 0004](0004-board-authorisation-and-layers.md) split the two board queries to
avoid, and it would be spent closing a name-in-devtools leak that the GM layer already answers
completely.

### Fogging only the position row — rejected as not worth having

The roadmap's own acceptance criterion, and genuinely free: `visiblePositions` already reads the
placements. Rejected because a fogged creature's health bar would keep ticking on the party's
screens and `Ancient Red Dragon attacks with their Bite` would still land in their feed. A fog that
hides where a monster is and announces what it does is not a feature.

### Folding fog into `maySee` — rejected

One predicate reads better than two `&&`-ed at call sites. Rejected because `maySee` takes a row and
fog is a fact about a placement on a named scene, so the merged function would take a set it cannot
verify was built for the same caller and the same scene — two `ReadonlySet`s the compiler cannot
tell apart, one of which publishes everything, which is a failure `readableCharacterIds` already
documents having nearly shipped. And the DM's screen has to be able to say which of the two reasons
is hiding a coin, which a merged answer cannot.

### A `sceneId` argument on `board.tokens`, `characters.vitals` and `feed.list` — rejected

The obvious way to get a scene into the queries that need one. Rejected because it mints a cache
entry per scene on three subscriptions, one of which is already split per seat, for a value that is
provably the same one every time: `scenes.list` is DM-only, so a player has no route to a scene id
other than the active one. Reading it off the game document costs nothing — every one of those
queries already reads that document, so no read and no invalidation edge is added.

### A per-seat fog answer — rejected

It would let a player keep sight of their own hero in the dark without the controller exclusion, and
it is what an argument-based design falls into naturally. Rejected because it puts `playerId` back on
the board queries and splits them per seat — the design the dice milestone removed from `feed.list`
after finding the parameter provably changed no answer. The controller exclusion gets the same
outcome for one bounded read that only a fogged game pays.

### Storing `dm` and displaying "GM" — rejected

Two deploys cheaper and no manual step. Rejected because it leaves the schema and every screen
disagreeing permanently about the name of the same thing, on the one field in this schema whose job
is to be unambiguous about a secret. Every future reader pays a small tax to save a one-off cost
once.

### `@convex-dev/migrations` — rejected

Considered seriously and declined: it would be this application's first Convex component, and the
batching it provides is for tables too large for one transaction. Two hundred rows per game is not
that, and one transaction per game is already `purgeGame`'s unit.

### An age test in the browser for the reveal replay — rejected, again

The comment in `TableEffects.tsx` had already rejected it and the reasoning stands: it compares a
server timestamp against a client clock, so a skewed browser fails silently and totally. What
changed is that the missing operand turned out to be storable — a reveal is an *event a mutation
witnesses*, not a clock a query has to read.

### Returning the server's time alongside the feed rows — rejected

The other way to get two timestamps from one clock, and the first design tried. Rejected on two
counts: `Date.now()` in a query is forbidden by the vendored Convex guidelines because a cached
query derived from a wall clock is stale by construction, and changing `feed.list` from an array to
an object would touch roughly thirty-five call sites across the hook, three components, the test
suite and the smoke script. The per-row boolean touches two literals.

### Independent X and Y grid sizes — rejected

What the roadmap bullet literally asks for. Rejected because the same bullet forbids a schema
change, and because `sizeSquares` — a token's footprint in squares — has no meaning once cells are
not square. The gesture set delivers the intent within one number, and a corner drag that stays
square is the interface saying so.
