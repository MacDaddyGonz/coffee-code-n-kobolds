# 4. Board authorisation, layers and where a token's position lives

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

Milestone 2 puts a map on screen with tokens on it, and every visual feature after it sits on top
of what this milestone decided. Two of those decisions are the reason the roadmap calls it the
riskiest one.

The first is secrecy. [ADR 0001](0001-platform-and-hosting.md) established that this repository is
public, so the client bundle is readable and the DM layer has to be filtered inside the Convex
query. Milestone 1 solved a *similar* problem for the `games` document with `publicGameValidator`,
and it is worth being precise about why that solution does not transfer: it catches a leaked
**field**, because `dmCode` has a distinct name and a projection that omits it is checkable by
machine. A DM-layer token is a leaked **row**, of exactly the same shape as the player-layer token
beside it. Nothing in the type distinguishes an ambush from a hero.

The second is movement. [ADR 0001](0001-platform-and-hosting.md) also warned that token positions
must not be written on every mouse-move, and CLAUDE.md invariant 2 turned that into a rule. Where
a position *lives*, and what a coordinate *means*, both fall out of that constraint rather than
being free choices.

Underneath both sits [ADR 0003](0003-player-identity-without-accounts.md), which said the DM code
is the only thing in this application that authorises anything. The requirements say a player may
only move their own character's token. Those two statements are in tension, and this record is
where the tension is resolved rather than quietly ignored.

## Decision

### The layer is a hard boundary; ownership is advisory

**A DM-layer row requires a DM code verified on the request.** That is the whole of the security
model for the board, and it keys off nothing else — not `players.isDm`, which ADR 0003 fixed as a
roster badge, and not a `playerId` argument, which says which seat to act on rather than who is
calling. `resolveDmAccess` in `convex/lib/games.ts` produces the boolean and is the only thing
that may.

**Ownership cannot be enforced, so it is not claimed to be.** `requireMovableToken` does check
that a player-layer token whose character another seat has claimed is refused with
`TokenNotYours`, and that check is genuinely useful — it stops a misclick and it tells the truth
about whose token it is. But anyone can pass another seat's `playerId` and walk straight past it,
because a `playerId` is routing and not proof of identity. It is table manners rendered
server-side, in the same honesty bracket as ungated `players.leave`.

**This is acceptable only because nothing behind that check is a secret.** A player-layer token is
already drawn on every screen in the game; its name, art and position are public by construction.
The worst outcome of a spoofed `playerId` is a rude move that everybody watched happen, and the
party can say so out loud. The refusal that *does* guard a secret — the DM layer — gets no such
latitude, and is decided by the DM code alone.

### One choke point, not a validator

Because the leak would be a row rather than a field, the guard is **structural**.
`convex/lib/board.ts` is the only module in `convex/` permitted to read the `tokens` and
`tokenPositions` tables. Every read passes through a single predicate, `maySee(token, isDm)`, and
any future query wanting token data has to come to that module to get it.

Two tests hold it in place, and they are the mechanical equivalent of what `publicGameValidator`
does for fields:

- `convex/leakGuard.test.ts` reads every file under `convex/` as source text and asserts that
  queries and gets against those two tables appear only in `lib/board.ts`. This catches the next
  contributor, not merely this one.
- `convex/board.test.ts` scans the serialised payload of every public board and scene query
  fetched without a DM code, and asserts it contains no DM-layer token's id, name or art URL —
  with a positive control asserting the correct DM code *does* return them, so the scan cannot
  pass because the fixture was empty.

A signed storage URL is never minted for a hidden token either. Signed URLs are unguessable but
not permission-checked, so resolving one for a DM-layer token would leak the art even with the row
withheld. Filtering happens before projection, so this falls out of the ordering rather than
needing anybody to remember it.

`publicTokenValidator` still exists as a `returns:` validator. It is belt to the structural
braces — worth having, but the thing keeping DM rows off player screens is the module boundary and
the two tests, not the validator.

### Refusals are deliberately indistinguishable

`board.moveToken` on a DM-layer token without a valid DM code throws the **same** `TokenNotFound`
error as a completely fabricated id, and as a token belonging to another game. Distinguishing "you
may not move that" from "no such token" would confirm the DM layer's contents to anyone willing to
enumerate ids: a leak through the error channel, opened immediately after the payload channel was
closed. **An ambush is spoiled by knowing it exists, not only by seeing it.** The error object is
a shared constant so the three refusals cannot drift apart under maintenance, and a test asserts
the parity.

### Position lives in its own table, keyed per (scene, token)

`tokenPositions` holds four fields — `sceneId`, `tokenId`, `x`, `y` — and nothing else. The
reasoning behind invariant 2 is the primary cause: Convex rewrites a whole document on patch, so a
throttled drag write that shared a document with art, name, size and layer would make every drag
contend with reads of all of it.

Keying the row per **(scene, token)** rather than per token buys four more things:

- **The row's existence is what places a token on a board.** A token with no row on the active
  scene simply is not on that board, so there is no `placed: boolean` to keep in sync with
  anything.
- **Each scene remembers its own layout**, which is exactly what a DM pre-positioning an ambush
  three scenes ahead needs.
- **Switching scenes destroys nothing.** Changing `activeSceneId` changes which position rows the
  board query returns; the old scene's rows are untouched, so switching back restores the layout.
- **One token can stand on several boards at once** — a recurring villain — because nothing on
  the token document mentions a scene.

Deleting a scene cascades to its placements and leaves every `tokens` row intact, which is the
same one-way-pointer discipline ADR 0003 applied to seats and characters.

### Positions are image-space pixel floats, not grid cells

Coordinates are floats in the space of the **stored** (post-downscale) image, measuring the
token's centre. Storing grid cells instead would have been tidier and would have deduplicated
intermediate drag writes for free — but the far screen would then see the token hop cell to cell,
which is precisely the "in jumps" the acceptance criterion rules out. Pixel floats let the
throttled writes carry continuous motion, and cells are derived when something actually wants one.

**The snap happens once, on settle, and the server applies it.** `board.moveToken` takes a
`settle` flag: false writes the coordinates as given, and true writes the position through
`snapToGrid` with the scene's grid and the token's size. So a dropped token cannot come to rest
between squares even if a client's arithmetic were wrong or its snap were skipped entirely — the
guarantee lives where it cannot be bypassed.

Both input methods commit through that one mutation. Dragging with the mouse and nudging with the
arrow keys share the mutation, the throttle and the snap function, so there is no second code path
that could snap differently or miss the server check — and a player pressing an arrow key at a
DM-layer token gets the same `TokenNotFound` as everything else. `snapToGrid`, `cellOf` and
`moveByCells` live in `convex/lib/grid.ts` and are imported by the browser through the `@convex`
alias, exactly the way join-code normalisation is already shared from `convex/lib/codes.ts`. One
implementation, so an optimistic value and a committed value cannot disagree about which square a
token landed on.

`gridSize` is calibrated against the stored image too, so whatever the downscaler decided is
invisible to every consumer of a coordinate.

### The camera is per-client and never in the database

Pan and zoom are a **view**, not shared state. The DM zoomed into a corridor while a player
watches the whole floor is correct behaviour rather than drift, it is how Roll20 behaves, and it
is what people already have muscle memory for. Consequently zoom and pan generate **zero**
database traffic, and none of invariant 2 applies to them.

The camera is remembered per game and per scene in `localStorage`
(`ccnk.camera.<code>.<sceneId>`, through the existing wrapper in `src/lib/session.ts`). A camera is
the most recomputable thing in the application — one scroll gesture — so it sits comfortably
inside ADR 0003's rule that browser storage holds only conveniences. A scene with no remembered
camera opens fitted to the viewport.

### Scene names are DM-only

`scenes.list` requires the DM code. **A list of scene names is a spoiler** — `Dragon's Lair` tells
a player what is coming three rooms early — so players get `scenes.active` and nothing else. This
is the same shape of secret as the DM layer, one level up: the background layer everyone can see
is public, but the *set* of boards the DM has prepared is not.

## What this ADR does not decide

Named so that Milestone 5 is not boxed in by silence:

- **Moving tokens between layers.** Bringing an NPC in from the DM layer is a patch of `layer` on
  a low-churn document, and nothing here forbids it. What it must not do is acquire a second place
  to record the layer — see the rejected denormalisation below.
- **Scene-switching UX.** `scenes.setActive` exists and is DM-gated; the tabbed DM panel,
  thumbnails and the polished switch remain Milestone 5's.
- **Images on layers.** `tokens.layer` has two members rather than the requirements' three,
  because the background layer is the scene image and no token lives on it. Non-token objects on a
  layer are a later addition, and they will need the same choke point.

## Consequences

### Good

- **A player client is never sent a DM-layer row**, so there is nothing for devtools to reveal and
  nothing for a client-side toggle to un-hide. The DM layer is *absent* from a player's payload,
  not merely undrawn.
- **The guard is checkable by machine, in one place.** "Does this leak?" is answered by reading
  one file, and a contributor who forgets is caught by a test rather than by a review.
- **A dropped token is always on a square**, because the server puts it there. No client bug can
  leave one straddling a line.
- **Movement feels instant and costs almost nothing.** A two-second drag is around twenty mutation
  calls against a one-million-per-month allowance, and pan and zoom cost none at all.
- **Scene layouts survive everything** — switching away, switching back, and deleting a different
  scene.
- **Nothing about identity had to be invented.** The board's authorisation is ADR 0003's DM code,
  reused unchanged.

### Costs and constraints we are accepting

- **A player can move another player's token by passing a different `playerId`.** Stated plainly
  because it will look like a bug to whoever finds it: it is not fixable without identity, and
  identity is what ADR 0002 and ADR 0003 deliberately deferred. It is bounded to public data.
- **`board.positions` re-runs when a token *document* changes**, not only when something moves,
  because each placement is hydrated back to its token so that one predicate decides visibility.
  The join is the price of a single source of truth for the field that decides secrecy.
- **Two live queries per board client instead of one.** `board.tokens` and `board.positions` are
  split so that a drag does not re-resolve signed art URLs ten times a second, which means the
  client renders the intersection of two subscriptions and a token appears only once it has both.
- **A DM and a player hold separate subscriptions** to the same logical data, because `dmCode` is
  part of the query arguments and Convex caches per-args. That is deliberate — there is no shared
  payload to filter down — but it does mean the DM's view is a different cache entry, and an
  optimistic update must be given the identical arguments object the component subscribes with or
  it patches an entry nobody is reading.
- **The error channel is deliberately unhelpful.** "That token is not on this board" is what a
  player sees when they attempt something genuinely impossible, and there is no way to tell them
  more without building the oracle. Support for the confused player is a person at the table, not
  a better message.
- **Cameras diverge and there is no "look here" button.** Everyone panning independently is the
  intended behaviour, so a DM who wants attention on a corridor has to say so. A shared-focus ping
  is a plausible later feature, not a fix for this.
- **A camera is forgotten when browser storage is cleared**, which costs one scroll gesture. This
  is the storage rule working as intended rather than a regression.
- **A rejected or abandoned upload can leave a blob in storage.** A Convex mutation is one
  transaction, so `scenes.create` cannot delete the file it just refused — the delete is rolled back
  with the throw, and `ctx.scheduler` is transactional too. `files.discard` is the good-citizen path
  and the client's catch calls it, but a browser that crashes or closes the tab first never does.
  `scenes.create` is not the boundary here in any case: `files.generateUploadUrl` can mint a blob
  that nothing ever references. What holds invariant 6 is the refusal itself — an oversized map
  never becomes a scene — and the real fix for the residue is a sweeper over `_storage` rows with no
  referencing scene or token, which belongs with the library editor and the admin view in
  Milestone 7.

## Alternatives considered

### A `returns:` validator as the leak guard — rejected

It is what Milestone 1 used, and it does not work here. A validator checks the *shape* of a
payload, and a DM-layer token has the same shape as a player-layer one, so a validator would
cheerfully approve an array made entirely of secrets. The validator is kept, because it still
catches a stray field, but it is not what is doing the work.

### Denormalising `layer` onto the position row — rejected

It removes a join: `board.positions` could then filter without hydrating each token. Rejected
because it creates **two documents authoritative for the single field that decides whether a row
is a secret**, and the bug that leaks is precisely a token moved to the DM layer whose stale
placements still say `player`. A denormalised copy also cannot be verified by reading
`lib/board.ts`, which is the entire point of having a choke point. One decision point is worth
more than the join, especially when Milestone 5's whole job is moving tokens between layers.

### `sceneId` on the token document — rejected

The obvious way to say which board a token is on. Rejected because a token could then only ever be
on one board, and moving it between scenes would destroy its position on the one it left. A
recurring villain would have to be duplicated per map.

### Position on the token document — rejected

Fewer tables, one fewer subscription, and directly against CLAUDE.md invariant 2: a throttled drag
write would rewrite the art reference, the name, the size and the layer on every tick, and every
read of any of those would contend with the drag. It would also make position per-token rather
than per-scene, which loses everything in the section above.

### Grid cells as the stored coordinate — rejected

Tidier, exactly on-grid by construction, and it would deduplicate intermediate drag writes for
free. Rejected because the receiving screen would see the token teleport square to square, which
is the "in jumps" the acceptance criterion explicitly rules out. Snapping once on settle gets the
same guarantee without the stepping.

### Snapping on the client only — rejected

The client has to snap anyway, so that the optimistic position is the final one and there is no
rubber-band on drop. Trusting that as the only snap was rejected because the client is where the
bug will be: a coordinate not converted out of screen space, or a settle that never fired, would
store a token between squares permanently. The server runs the same function on commit, so the
client's snap is a nicety and the server's is the guarantee.

### The camera in the database — rejected

It would let the DM drag everyone's view along, which sounds appealing until a player cannot look
at the door they are about to open. It is also the highest-churn write in the application — a
continuous stream during every wheel gesture — for a value that one gesture recreates. Per-client
and localStorage-backed costs nothing and is what every virtual tabletop already does.

### Gating scene names to players — rejected as insufficient

Sending the list and hiding it in the client was never on the table for the same reason as the DM
layer: the bundle is readable. Sending only the *count* was considered and dropped as pointless
half-measure — a count is not a spoiler, but it is not useful to a player either.
