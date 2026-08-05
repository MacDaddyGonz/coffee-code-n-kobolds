# 13. A coin you can copy, place and label

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

Everything before this milestone was about getting something onto the board. This one is
about what a coin *is* once it is there, and it began from a gap rather than from an idea:
**`board.removeToken` had been complete, DM-gated and covered by its own tests since the
board existed, and nothing in `src/` had ever called it.** A DM could not delete a coin
from the running application. Five milestones of new features walked straight past that,
which is what a gap looks like when every milestone is about the thing it is adding.

Reading it properly turned up two more of the same shape, both of them the schema and the
application disagreeing:

- `MapSetupPanel` tells the DM that *tokens belong to the game, not to this map, so one
  villain can stand on several*. True of the schema — placements are keyed per
  *(scene, token)* and have been since the board existed — and **false of the application**,
  because `board.addToken` was the only thing that created a placement and `board.moveToken`
  is only ever called with the active scene. A coin made on map A could never reach map B,
  and could never leave A without being destroyed.
- Nothing could make a second coin of anything. The reference for this screen is Roll20, and
  the useful part of reading it was not the feature list but **where it gets this wrong**:
  its own documentation tells a GM that eight identical goblins must have their hit-point
  bars *manually unlinked* from the character sheet, or damaging one damages all eight, and
  the community wrote a script to work around it. That is a trap this project can simply
  not build, because a copy that makes its own character document costs one function.

The fourth thing is new rather than missing. A fixed vocabulary of D&D conditions, drawn as
pips on a coin — and the whole design of it is one sentence: **nothing reads a marker.**

## Decision

### Duplication made token art shareable, and three unconditional deletes had been waiting

`board.removeToken`, `replaceTokenArt` and `deleteTokensInGame` each reclaimed a token's
blob with no check at all. Each carried a comment naming the other two and saying that
whatever made art shareable had to convert **all three at the same time**, because a
partially converted set of three is the state in which somebody believes the problem is
solved. Duplication is that thing: a copy carries the source's `imageId`.

So a new predicate, `otherTokenReferencesImage`, is a **sibling** of the existing
`tokenReferencesImage` rather than a parameter on it. The two answer different callers'
questions and the difference is exactly one row: `files.discard` asks *is anything using
this?* and needs `true` for the token it is being asked about — that is what makes it
refuse to strip the art off a coin somebody is looking at — while a delete path asks *is
anything **else** using this?* and needs `false` for the row it is about to remove or
repoint. Collapsing them gives the discard guard an optional argument no caller ever wants
to pass, and which a future caller can get wrong in the one direction that blanks a live
coin.

**The third site is converted differently, and that is the part worth carrying forward.**
`deleteTokensInGame` must not ask the predicate, for two reasons that both matter. It would
answer the *wrong question* — a purge deletes every token in the game, so "is any other
token using this?" is `true` for a twin that is also about to go, and asked per row it
would keep the blob for ever or work only by accident of the loop's ordering. And it would
be O(n²): two hundred tokens means two hundred range reads of two hundred rows, forty
thousand document reads in one transaction, on the function that has to work on the largest
game in the deployment. So it deduplicates instead — which is a *stronger* statement than
the other two make, because the question they ask is answered `no` by construction for
every id.

### Placement is three functions, and their shapes are the decisions

`placeOnScene` is **idempotent**, and the value is in *not writing*: the early return sits
above `placeToken` rather than leaning on its upsert, which would patch the coordinates
back to the middle of the map. A DM who had already dragged the coin into the doorway and
pressed the button again would find it back in the centre.

It takes **no coordinates**. The DM is choosing a *board*, not a square — they have never
looked at this map, so there is no square they picked and no client coordinate worth
trusting. The centre is the one point guaranteed to be on the map, and it goes through
`freeCellNear` for `addToken`'s reason. Adding `x` and `y` here would make this `moveToken`
with a different gate.

`removeFromScene` is a **no-op rather than a throw** when the coin is not there, for
`files.discard`'s reason: the client calls it from a menu and a panel that may each be a
frame stale, and a second removal should be nothing rather than a second error on top of
the first. Taking the *last* board is not refused either — a coin on no board at all is a
legitimate state and is one of the three kinds the Tokens tab exists to reach.

⚠️ **`board.placements` is per token, and that is its whole cost model.** It reads by
`by_tokenId`, so it is invalidated by writes to *one* coin's placements rather than by every
drag on the board, and the panel holding it is mounted only while a coin is selected. The
obvious alternative — one game-wide map of coin → boards, so every row in the list could
carry a badge — puts every placement on every scene into the read set of a panel that is
open all session, which is exactly the read invariant 2's read-side rule exists to refuse.
It hands back **bare scene ids**: the panel needs the maps the coin is *not* on as well, so
it holds `scenes.list` regardless, and a projection carrying names would be a second door
onto a DM-only list for no saving.

`MAX_PLACEMENTS_PER_SCENE` stays a read bound and gains no write check. The structural
argument survives — a token holds at most one placement per scene, enforced twice here —
but the ceiling has stopped being theoretical: a DM may now deliberately put all two
hundred coins on all twenty-five boards, which makes the constant's pairing note
load-bearing rather than a courtesy.

### Add-N and duplicate are one act with two sources for the fields

`board.addToken` takes an optional `count`; `board.duplicateToken` runs the same
naming / character / free-cell path with a source row instead of typed arguments. That is
also what makes the acceptance line reachable at all: adding five `Goblin`s to a board with
none gives `Goblin 1 … Goblin 5`, while duplicating a `Goblin` already standing there gives
`Goblin 2 …` — **because the source is never renamed.**

Renaming it reads better and is refused three times over: it is a write to a coin the DM did
not ask to change, it re-pushes `board.tokens` to the whole table, and on a bound coin it
leaves the sheet's name disagreeing with the coin's unless the rename cascades into the
characters choke point.

**One transaction**, and `TokenAddDialog`'s argument for two does not transfer. There the
*client* owns the sequence and a refused token leaves a sheet the Sheets tab deletes in two
clicks; here the server owns both halves, so N coins and N sheets arrive together or not at
all. Both caps are checked before anything is written, with **two messages** — same kind,
because a client acts on the message — since "too many coins" and "too many sheets" are two
different reasons the DM is stuck and the fix is in two different tabs. An over-length
numbered name **refuses rather than truncating**: a `slice` on a UTF-16 boundary leaves a
lone surrogate that convex-test stores happily and a real deployment rejects, which is a bug
this project has already shipped once.

A copy inherits layer, size, tint and art. It does **not** inherit granted controllers — a
grant is a decision about a person and a coin, and an unattached copy is the DM's, which is
the correction the first real session forced, reached by a new route. It does **not**
inherit condition markers either: a marker is what has happened to that creature in this
fight, the same register as its current hit points, and the copy is explicitly a fresh
character at full health. Five goblins arriving already poisoned is the same class of error
as five arriving on 3 hit points.

### Conditions get their own table, and the reason is who writes it

All six writers of the `tokens` document are DM-gated, so *what can a player cause to be
written to the table that holds `layer`?* answers **nothing** — and that emptiness is worth
a table to keep. A marker is the first row a non-DM may cause to exist on the board. The
second reason is invariant 2 read from the other side: `board.tokens` resolves a signed
storage URL per token, so a marker living on that document would re-mint up to two hundred
URLs every time somebody ticked *poisoned*, which is the cost
[ADR 0004](0004-board-authorisation-and-layers.md) split the two board queries to avoid.

**The row's existence means *this coin has conditions*,** the way a placement row's
existence means *this coin is on that board*. Clearing the last marker deletes the row.

**The gate is the existing `requireMovableToken`, and reusing it is a decision rather than a
shortcut.** [ADR 0012](0012-three-layers-and-a-fog-that-is-honest-about-itself.md) separated
`maySeeLayer` from `mayPlayersMove` because sight and interaction genuinely differ. Marking
is not a third question: a player may mark the coins they may drag, and must not mark
scenery they can see and cannot touch. Because it is the same question it gets the same
function, and three correct refusals fall out with **no new constants and no new existence
oracles** — Background refuses `TokenNotMovable`, the GM layer `TokenNotFound`, an ungranted
player-layer coin `TokenNotYours`. The tripwire is in the docblock: the day *may mark* and
*may move* differ is the day `lib/layers.ts` gains a third predicate.

⚠️ **The marker union has no `never`-arm switch, and that is honest rather than lax.**
Invariant 9 asks a new union for an allow-list switch — but **there is no predicate here**,
because nothing decides anything from a marker, which is the entire point. A switch written
to satisfy the rule would be a guard that cannot fail, which is precisely what ADR 0012
argued out of `fogRects`' leak-guard entry. What the invariant protects is met three other
ways that *can* fail: a `Record` of labels on the server, a `Record` of pip glyphs on the
client, and a test pinning the validator's members **and order** against the list.

**`normaliseMarkers` runs in three places and each catches a different failure.** On the
write path, so what is stored is canonical and the browser's optimistic value and the
server's are the same bytes. In the **server projection**, because `board.markers`' returns
validator is `v.array(tokenMarkerValidator)` — so a row written by a newer deployment during
a non-atomic push would make the query **throw for every caller** and take the whole table's
conditions subscription down, rather than costing one pip. And in the renderer, so an
unknown value is simply not drawn rather than crashing a `Record` lookup in JSX. The second
of those is the composition `maySeeLayer`'s docblock already calls load-bearing: because the
value is dropped, the `returns:` validator never sees it.

⚠️ **`tokenMarkers` joins `tokens` and `tokenPositions` under `lib/board.ts` in the leak
guard, and needed no new machinery.** A marker row names a `tokenId`, so a row for a
GM-layer coin says a hidden coin exists — the oracle `TOKEN_NOT_FOUND` is written to close —
and it is indistinguishable in type from a row about a hero. What makes it the *same* entry
rather than a fourth is that its predicate is `maySee(token, isDm)`: the same question,
answered by the same function, in the same module. So a secret-bearing table was added and
invariant 8's table needed **no new predicate and no fourth column**.

⚠️ **Fog does not hide a coin's conditions**, and that is `board.tokens`' argument reached by
a second route rather than an omission: filtering them means a `tokenPositions` read in a
query whose whole virtue is being off the drag path, and what it would buy is closing a
devtools leak *of exactly the kind ADR 0012 already accepted for a fogged coin's name*. That
ADR's Hides table gains the clause, and the standing answer is unchanged: a creature that
must not be known about goes on the GM layer, where the guard is whole.

### Nothing reads a marker, and a guard test is what makes that a promise

`markerGuard.test.ts` greps `convex/` for a **quoted module specifier** reaching the
vocabulary and allows exactly three importers — the schema, the choke point and the board's
public functions — plus a second sweep for the helper names, because a module could import
nothing and still reach `visibleMarkers` off `lib/board.ts` to compute a rule.

Quoted, and with the path separator required, for the reason `corpusGuard.test.ts` records:
`markers` is also the field name, the argument name and the noun every one of these files
uses in prose to explain that markers adjudicate nothing. A guard that fails on the
documentation written to respect it is a guard that gets deleted — and this one had that
failure before it had a passing run, on `schema.ts` and on the vocabulary module itself.

The guard is what makes shipping `prone`, `grappled`, `restrained` and `paralyzed` lift
nothing from requirements.md's *no movement-detriment status effects*. What ships is the
**word on the coin**; the effect is still the table's.

### The menu is a controlled dropdown, and a non-controller gets none

Radix's `ContextMenu` is the obvious primitive and is the wrong one. It does take an `open`
prop — that much was checked rather than assumed — but **opening it is only half of
controlling it**: the point it positions at lives in `ContextMenuTrigger`'s own state,
written only by that trigger's own `contextmenu` handler and fed to the anchor as a virtual
ref, with no prop that supplies it. Radix warns about exactly this misuse in development,
and `side`, `sideOffset` and `align` are omitted from its content props and hard-coded. The
board is a single Konva `<canvas>`, so there is no DOM node per coin for such a trigger to
be, and which coin was hit is Konva's hit test rather than the DOM's. So: a controlled
`DropdownMenu`, anchored to a zero-size element the board moves to the pointer — which is
the idiom `TokenHpPopover` already uses.

⚠️ **A player who does not control the coin gets no application menu at all**, not a menu of
greyed-out items. A list of the things you may not do is an inventory of the game's
furniture, and on a Background coin it reads as the application being broken. ADR 0012's
argument for a *distinguishable* refusal is about a write somebody attempted; it is not a
licence to volunteer the list. The browser's own menu is allowed through, because a
right-click that produces literally nothing reads as a frozen application, and suppressing
it is a promise to handle right-click that is then not kept.

### One vocabulary is spelled the way the SRD spells it

The condition keys and labels are **American** — `paralyzed` — against a codebase whose every
other identifier is British (`normalise`, `colour`, `authorise`). Exactly one word actually
differs. The reason is that the SRD this project moves to later is American, and a stored
key whose spelling changes is a marker that silently stops drawing on every coin already
carrying it. It is pinned by a test rather than left to a comment, because the next
contributor will read it as a typo and fix it.

### The word *marker* is claimed twice, and the collision is recorded rather than resolved

The tools-and-polish milestone owns *marker* for a **drawing pen** — a multi-colour marker
and eraser on the board. These rows are condition labels. The roadmap's word is kept, because
renaming would make the specification and the code disagree, and the table is `tokenMarkers`
so it reads as *the markers of a token* beside `tokenPositions`. Whoever builds the pen finds
this paragraph rather than the collision.

## Consequences

### Good

- **The gap is closed, and two more like it.** A coin can be deleted, moved between maps and
  copied, all of which the schema had always allowed and nothing had ever offered.
- **Five goblins have five sheets**, so damaging one moves one bar. The trap Roll20 needs a
  community script for is one this codebase cannot express.
- **A secret-bearing table cost no new choke point.** `tokenMarkers` joined the existing leak
  guard entry because its predicate is the existing predicate.
- **Three refusals for markers fell out of `requireMovableToken`** with no new constants, no
  new predicate and no new existence oracle.
- **A live bug was found and fixed on the way.** `deleteTokensInGame` deleted one blob per
  row, so two coins sharing one meant deleting an id that had already gone — which throws,
  and would have aborted `admin.purgeGame` outright for any game containing duplicated coins.

### Costs and constraints we are accepting

- **A marker row says a coin exists, to anyone who may see that coin.** That is the same
  exposure the coin itself has and is filtered by the same predicate — but it is one more
  row shaped like a secret, and the day per-player conditions are wanted it needs
  `publicVitalsValidator`'s treatment rather than this one.
- **Fog does not hide a condition.** Stated in ADR 0012's Hides table rather than only here.
- **The pips are a reminder, not a label.** One hand-picked letter at seven screen pixels
  cannot be authoritative; colour separates four families and the glyph disambiguates within
  one, and the authoritative reading is the picker. At the detail threshold a coin two pips
  wide showing four conditions draws one and a `+3`.
- **A blob shared across *games* is invisible to every predicate here.** `tokenReferencesImage`,
  its new sibling and `sceneReferencesImage` all scope by `gameId`, while `board.addToken`
  accepts any storage id its DM can name. Pre-existing, unchanged by this milestone — a
  duplicate is always in the same game — and recorded so it is a known residual rather than a
  discovery.
- **`board.duplicateToken` stamps a reveal that can never publish a line.** The copies'
  creatures are made in the same transaction and have rolled nothing, so the stamp costs the
  flourish on rolls made in the last few minutes and buys nothing today. It mirrors
  `addToken`'s condition deliberately: a stamp too many costs one missing animation and a
  stamp too few replays an evening, and the day this learns to *reuse* the source's character
  the stamp is already correct.
- **A DM marks a coin from the board in two steps where a player marks it in one.** The DM's
  menu has five entries and conditions is not one of them; the route is *Edit this coin* and
  the picker in the panel. That is the specification read literally, and it is the asymmetry a
  reader will question first.
- **The convex test project's timeout is now thirty seconds.** A dozen suites fill a game to
  one of its caps because a bound and its write check can only be compared at the boundary;
  they sat just inside vitest's five-second default and began tipping over it once this
  milestone added two more of the same shape.

## What this ADR does not decide

- **A DM-only marker on a coin the party can see.** That is a second reason to withhold on a
  per-*field* basis, which needs `publicVitalsValidator`'s discriminated union rather than
  this table's row filter. Nobody has asked, and it is a whole design.
- **Anything that reads a marker.** Speed, advantage, a refused drag, a health band. The
  guard test is what makes that a decision rather than an intention.
- **Multi-select, z-order and rotation**, all declined on the record in the roadmap.
- **Whether `exhaustion` should carry a level.** It is a flat pip today, which is strictly
  less than the table needs and is the one member most likely to want a number — and that
  would be a schema change from `string[]` to something else.
- **A token library**, where one blob is deliberately shared across many coins by name rather
  than by duplication. The delete paths are now ready for it; nothing else is.

## What building it found, recorded because the reasoning was wrong first

### The naming rule's third sentence was one word wrong, and it produced two coins with one name

The specification said the suffix is skipped when a single coin is added and **nothing is
numbered yet**. Both readings of that agree on the case it describes — adding one `Goblin` to
a board with none gets `Goblin` rather than the lonely `Goblin 1` — which is why the
difference is easy to miss. They diverge on the act the sentence did not consider:
duplicating a lone `Goblin` would produce a second coin **also called `Goblin`**, and pressing
again a third, because nothing ever becomes numbered.

Asking whether the base is on the board **at all** fixes it and keeps the described case
exactly. It is also the honest statement of what separates the two surfaces: the add dialog
passes a name it is about to create, the duplicate control passes one already standing there,
and *is this base in use?* is precisely the question that tells them apart.

### The third delete site was already broken, and only a real deployment could say so

`ctx.storage.delete` on an id already deleted in the same transaction throws — confirmed
against the dev deployment as `Error: storage id … not found`, a plain `Error` and not a
`ConvexError`, so it aborts the whole mutation. convex-test reproduces it with a different
message, which is the unusual half: the asymmetry this project normally worries about runs
the other way.

That means `deleteTokensInGame` has been wrong since two tokens could share a blob — which
`board.addToken` has always permitted, since it checks that a blob exists and fits and asks
nothing about who else owns it. The state was reachable and nothing reached it.

### The guard test failed on its own documentation before it passed once

`markerGuard.test.ts`'s first helper sweep flagged `schema.ts` and the vocabulary module for
explaining in prose what `normaliseMarkers` is for. That is the failure `corpusGuard.test.ts`
already records having had — a needle that matches a bare word matches the comment written
most carefully to respect the rule — arriving a second time in a different disguise. Matching
a *call* rather than a mention is the fix, and it is the same shape as matching a *quoted*
specifier rather than a bare path.

### The pip capacity at the detail threshold was arithmetic nobody had done

The plan asserted that a coin at `COIN_DETAIL_MIN_DIAMETER` carrying four conditions would
draw a bare `+4`. It draws one pip and a `+3`: capacity at 26 screen pixels is two, so the
general rule applies and only a capacity of one reaches the counter-alone branch. Two
statements in the same paragraph, and the one that was checked was right.

### Three of seven reveal-stamp paths still have no test

`feed.test.ts`'s reveal section says its coverage is discipline rather than construction, and
counting is what it took to notice that `board.addToken`, `board.setCharacter` and
`characters.assign` are asserted by nothing at all — the third being the one ADR 0012 records
shipping unstamped. `duplicateToken` is covered because this milestone added its case. The
convention is held for four of seven paths, which is worth knowing before relying on it.

## Alternatives considered

### One predicate with an `exclude` parameter instead of a sibling — rejected

Cheaper by a function, and it gives `files.discard`'s guard an optional argument that no
caller ever wants to pass and that a future caller can get wrong in the one direction that
blanks a live coin. Two names for two questions.

### Making `deleteTokensInGame` ask the predicate too, for symmetry — rejected

It would answer the wrong question on that path and cost forty thousand document reads in one
transaction. The symmetry worth having is that no delete path can strip a twin's art, and
deduplication gives that more strongly rather than less.

### A `markers` field on the `tokens` document — rejected

The obvious place, and it fails on both axes: it would make a player the first non-DM writer
of the document that holds `layer`, and it would re-mint two hundred signed storage URLs
every time somebody ticked *poisoned*.

### A `never`-arm switch over the marker union, to satisfy invariant 9 — rejected

There is no predicate for it to be the home of, so it would be a guard that cannot fail. The
invariant's protection is real and is met by two `Record`s and an order-pinning test, all of
which can.

### A game-wide coin → boards map, so the Tokens list could badge every row — rejected

It puts every placement on every scene into the read set of a panel that is open all session,
which is exactly the read invariant 2's read-side rule exists to refuse. The list still says
nothing; the selected coin answers.

### A severity ranking for which pips survive the collapse — rejected

A second ordering to maintain, and it would let a DM and a player looking at the same goblin
see different three pips. Alphabetical is arbitrary and identical on every screen at the
table.

### Renaming the source on first duplication — rejected

`Goblin 1 … Goblin 5` reads better than `Goblin, Goblin 2 … Goblin 5`. It is a write to a coin
the DM did not ask to change, a re-push of `board.tokens` to the whole table, and a sheet name
that no longer matches its coin. Adding five from scratch gets the nicer run honestly.
