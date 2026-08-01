# 10. The way in, and the DM's coins

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The model of who is at the table and what they are holding is now right. The way *in* to it was not,
and everything below was found in the first five minutes of using the deployed build rather than by
reading the code.

The DM could not reach DM mode without being told where to look. You typed a game code, typed a
display name, landed on the board as a player, and then had to discover that *Settings* holds an
elevate control — after you were already seated as somebody else. The roster made it worse by showing
a `DM` badge beside your name the whole time, which is display only ([ADR 0003](0003-player-identity-without-accounts.md))
and looks very much as though it did something.

Joining was retyping a name from memory. `players.join` is idempotent on the normalised display name,
which is the whole of how a cleared browser comes back to its own seat — and the idempotence was
completely invisible, so getting the name slightly wrong created a second seat and said nothing. The
mechanism [ADR 0003](0003-player-identity-without-accounts.md) built to make a cleared cache cost a
retyped name only works if the person retyping can see what they are aiming at.

And there was no way to find a game you had already made. `games.getByCode` is a point lookup, there
was no list query of any kind, and the code was therefore the only route to knowing a game existed at
all.

One thing was wrong in the other half of the app for a related reason. The previous record gave the DM
a selector reaching every *sheet* in the game and left the *coins* reachable only by finding them on
the map — so a token bound to nothing, or standing on a layer that is not currently being shown, was
unreachable. Nothing had ever edited a token after it was created except its controllers.

Why this went before the dice: the roll announcement and the feed are written against who is at the
table and what they are holding, so the door people come in through is a fixture the feed would
otherwise be written against — the same argument the previous four insertions made. The second reason
is blunter and is not really an argument about sequencing at all. The front door was in the wrong
place, and everything the dice add for the DM sits behind it.

## Decision

### The site publishes a list of games, and that is the first thing it publishes without a code

A landing page lists games — name, who created it, when — with *Join as player* and *Join as DM*
beside each. Choosing either **asks for the game code**, so the list only ever says that a game
exists and the code is still the thing that admits you.

That is a real change rather than a screen, and it is worth being exact about which sentence stopped
being true. Before this, the set of things reachable from this application with **no credential at
all** was empty: every query needed a join code, and a join code is a bearer credential everybody at
one table shares. After it, that set is a game's name, its creator's display name, its creation time
and whether it is in play, for the thirty most recently created games. Three things were settled
deliberately rather than falling out of a UI change:

**Recent, not all.** `MAX_GAMES_ON_LANDING` is thirty, newest first, with no search, no pagination
and no `truncated` flag. Truncation is a real state — the deployment had seventy-one games before
anything could delete one — and it costs nothing here, because a game that falls off the end is still
joinable by its code. That is exactly why the *Join with a code* panel stays beside the list instead
of being replaced by it: it is the escape hatch that makes the cap free, which makes it load-bearing
rather than vestigial. The contrast with `admin.listByPrefix` is the whole argument for the missing
flag. There, an operator deletes what they were shown, so a tool that silently under-reports looks
finished when it is not. Here an under-reporting list costs one extra field to type, into a panel
already on the screen.

**The creator's name travels.** A row reads *name · run by X · when*. This is a publication of a
colleague's display name to anybody who loads the site, and the threat model scopes it rather than
excusing it — the audience is a small group of trusted colleagues, and a game name is not a secret
the way a scene name or a creature name is. It is recorded here and amended into
[requirements.md](../requirements.md) precisely because it is the kind of thing that should not
arrive behind a UI change.

**The payload is a projection, and it is derived rather than spelled out.**
`publicGameListingValidator` is `publicGameValidator.omit('code', 'activeSceneId')`, for the reason
`admin.ts`'s `purgeCandidateValidator` is derived the same way: the three DM secrets on the `games`
document are absent by construction there, so they are absent by construction here too, and a fourth
secret added to that table cannot reach this payload either. That is invariant 8 working as intended.

⚠️ **But `.omit()` is a subtractive spec, and here it subtracts across two different audiences.**
`publicGameValidator` says what a caller **holding the join code** may see; this says what a caller
holding **nothing** may see. Subtraction only guarantees that the fields named are gone, so a new
*non-secret* field added upstream for the code-holding audience would arrive here silently and widen
the second one. The guard for that is not the validator. It is a test pinning `Object.keys(row)` to
exactly five names, and it is not optional — it is the only thing between an upstream addition and a
wider audience than anybody chose.

`code` is dropped because a row says a game exists and the code still admits you; printing it beside
the name would make the list a directory of open doors. `activeSceneId` is dropped because a scene id
means nothing off the board. `status` is kept, because *in play* against *in the lobby* is the one
thing a person wants to know before opening a game.

### Both doors, and the second one is a query so that it cannot move a badge

A DM who gives the right game code is then asked for the **DM code**, and lands on the board already
elevated. ⚠️ **The elevate control stays in Settings as well.**
[ADR 0008](0008-one-shell-and-what-a-sheet-entry-is.md) moved `DmBar` out of the lobby precisely
because a DM whose browser lost its code mid-campaign previously had no way back in — the lobby was a
screen you left. So the fix is **both doors, not the door moved back**: the landing page is where a
returning DM says who they are, and Settings remains the recovery path for somebody already seated.
The recovery *phrase* is deliberately only in Settings, because `recoverDmCode` needs a seat and the
door has none.

**`games.checkDmCode` is a new query returning a bare boolean**, and it exists because the failure it
prevents is the exact failure this record was written to remove. `games.elevateDm` needs a seat, and
the client's restore effect discards a code the server rejects — *silently*. Without a way to check
first, a DM who mistypes their code at the door is seated, quietly de-elevated, and lands on the board
as a plain player with nothing on screen saying why. The join-code field already established the
governing precedent in its own comment: the code is checked before navigating, so a mistyped one
reports itself next to the field it was typed into rather than on a game screen that says the game
does not exist. The DM code deserves the same.

Three properties hold it in place:

- **A query, not a mutation, and that is the load-bearing half.** The DM badge follows a *seat*, and
  this call is made before a display name has been chosen. `elevateDm` stays the only thing that
  moves the badge, and being a query makes that structural rather than remembered: a query cannot
  write, so no later edit here can quietly acquire a side effect on the roster.
- **It hands back a boolean and nothing else.** `resolveDmAccess` returns the game document beside
  the verdict and this deliberately drops it. A caller receiving the game alongside the answer would
  be one refactor from treating the payload as *proof*, and it is not proof of anything: holding the
  DM code is what authorises a call, re-checked by `requireDm` on every one of them (invariant 7). A
  `true` from here authorises nothing and expires the moment it is read.
- **The comparison is now one function.** `dmCodeMatches` is shared by `resolveDmAccess`, `requireDm`
  and this, so the normalisation and the length-independent compare exist once. That matters more
  than it looks: the check on this application's only bearer secret goes through `normaliseDmCode`,
  which trims and uppercases and forgives nothing else, and **not** `normaliseJoinCode`, which drops
  out-of-alphabet characters. Written out three times, that distinction is three places for one of
  them to reach for the wrong normaliser.

⚠️ **It is a new oracle and this record says so plainly rather than letting it pass as a screen.**
Testing a DM code no longer requires a seat in the game. The friction that removes is close to nil —
`players.join` is ungated, so anybody holding the join code could already take a seat and loop
`elevateDm` against it — and ADR 0003's no-lockout reasoning applies verbatim: the codes come from
`crypto.getRandomValues` over a 31^8 space and cannot be enumerated, while a failed-attempt lockout
would let anyone holding the *join* code lock the real DM out of their own game. What genuinely
changes is that a wrong guess now leaves no seat behind, so the DM does not see the attempt. Against
this audience that is a cosmetic loss; it is written down because the sentence that stops being true
is the one worth recording.

One thing that is **not** a defence and used to read like one. Answering `false` for an unknown join
code as well as for a wrong DM code is not what stops join codes being enumerated — `games.getByCode`
already answers that question directly and always has, because a join code is the credential
everybody at the table holds rather than a secret. The real reason is smaller: by the time this is
asked, the caller resolved the game one step earlier, so a second failure shape would carry no
information it does not already have and would only invite somebody to branch on it.

### The seat list at the door is the payload that already existed

A player who gives the right code is shown **the seats that already exist**, each with the character
it is holding, and picks their own name off the list. That is the whole of "restore my session"
today, done by retyping a name and hoping the normalisation matches; showing the list makes ADR 0003's
idempotence visible instead of hoping for it. The name field stays, underneath, for somebody genuinely
new — and **the seats come first**, because putting the free-text field first is exactly what makes a
person type `Mikey` where they once typed `Mike` and silently acquire a second seat.

The interesting part is that this needed no new payload. `players.list` already carries the character
each seat holds, and it already runs that name through `playerCharacterNames`, which withholds a
creature's name and a reserved character's name and nulls the `characterId` **together with** the
name. That filter was written for the roster; it turns out to be exactly what a door needs.

So `players.listNames` is **deleted**, and that is not tidiness. The name gate mounted
`players.listNames { code }` while the hook on the same screen already held `players.list { code }` —
different arguments, therefore a second cache entry, a second socket and a second server execution,
for a strict subset of rows already on the wire. One seat-picker component reading `players.list`
serves the in-game gate and the door from one subscription, and there is now one place the
creature-and-reserved filter has to keep applying rather than two.

⚠️ The consequence to notice is where that filter now sits. `playerCharacterNames` was the thing
stopping a monster's name appearing beside a seat in the roster. It is now also the thing stopping a
monster's name appearing on **the front page of the site**.

> **Amended shortly after, and it is this record's own sentence being finished rather than a new
> decision.** "Joining was retyping a name from memory" was written about *this* landing page, and
> the seat list removed it from the two doors on the list — while leaving it in place on the *Join
> with a code* card beside them, which still asked for a code and a display name together and then
> navigated. So the one path that had the original problem was the one the paragraph above never
> mentioned. That card now opens the same dialog with the same player-door sequence, `gameCode` then
> `seat`, and holds no lookup, no verdict line and no name field of its own.
>
> The only thing that had to change to allow it is that `verdictOf`'s `expectedGameId` became
> nullable. The comparison it guards is a *contradiction* between a row and a code — a row plus a
> code is a claim that can be wrong, and a code alone cannot be — so `null` means "nothing was
> claimed" and the wrong-game arm still applies in full wherever a row exists. Both sides of that
> switch are asserted, because a nullable written as an early `ok` would turn a mistyped code into a
> navigation to a game that does not exist.
>
> One thing deliberately *not* done: there is no DM-by-code door. `JoinCodeStep` no longer needs a
> row, so it is a button away — and a returning DM whose game has fallen off a list of thirty comes
> in as a player and elevates from Settings, which is exactly the second door this record kept. Who
> the front page invites to try a DM code is a decision, and it would want a record of its own.

### A player claims a character and then builds on it

There were two readings of "a new player provides their name and selects their race and class", and
they are not close. **The reading taken is that the player claims a character the DM has already made
and then chooses race and class on it.** `characters.create` still demands the DM code on every path
and [ADR 0009](0009-who-plays-what-and-what-control-grants.md) is unchanged.

This costs nothing, and that is the argument. `applyPresetPermissions` already lets a player set race,
class and archetype while the sheet is unlocked, and only the DM may unlock it once locked — so the
whole feature is a *screen*, not a rule. The path existed end to end already: the empty state on the
Character tab points at the table, the table lists unclaimed characters, claiming one puts an unlocked
`pc` sheet on screen, and that sheet's builder offers Race and Class. Two things were missing and both
were small. Nothing returned the player to the Character tab after claiming, so the claim and the
build were two screens with no thread between them; and the empty-state copy named only half the job,
pointing at the table without saying that the race and class get chosen on the way back.

The rejected reading would have reopened `characters.create` to an ungated path and with it the reason
it was closed — an ungated create is what let the character list grow sideways, and it is one of the
two doors invariant 9 is about. Superseding a record one milestone old to save a redirect and a
sentence of copy would have been a bad trade.

### Editing a coin is four mutations, because two of them are secrecy writes

Nothing had ever edited a token after `addToken` except `setControllers`. The DM's Tokens tab needs
name, size, tint, layer, binding and art, and the obvious shape is one `updateToken` taking all of
them. It is four:

| Mutation | Writes | Why it is on its own |
| --- | --- | --- |
| `updateToken` | `name`, `sizeSquares`, `tint` | Cosmetics. Nothing secret turns on any of them, so one absolute write is right. |
| `setLayer` | `layer` | ⚠️ A secrecy write. |
| `setCharacter` | `characterId` | ⚠️ A secrecy write. |
| `setArt` | `imageId`, and a blob delete | The only token write that destroys data outside the row. |

**An absolute multi-field write is safe for cosmetics and dangerous for the two fields that decide
what players may know.** With `layer` folded into `updateToken`, every rename carries a layer value,
and a client that sent a stale one would reveal an ambush as a side effect of fixing a typo. The same
for `characterId`, which moves sheets and exact hit points between seats: it must be a call whose name
says that is what it did.

The absent-versus-null problem was **designed out rather than documented**. `characters.assign`
already takes `characterId: v.union(v.id('characters'), v.null())` as a *required* argument where
`null` means none, so nothing here is `v.optional` and there is exactly one spelling of none. The
"two spellings" convention only bites when a field is optional *and* nullable, which is a state no
argument below reaches.

Two checks were hoisted out of `addToken` so the old path and the new ones cannot drift — the
appearance triple and the blob pair — and every refusal message is byte-identical to what it was,
which is what lets one shared corpus of bad names, sizes and tints test both validators. Two copies
that were identical when written is precisely how two validators come to disagree.

### What a rebind and a layer flip actually do

Both write one field and move a secret, and both say so at the mutation, at the writer, and on the
DM's screen.

`boardCharacterAccess` builds `{ visible, controlled }` in one pass over the already-filtered token
list, keyed on `token.characterId`. So a rebind on a player-layer token, in a single write: takes the
old creature's id out of both sets, so its sheet stops resolving for the granted seats and its
health-bar row disappears; and puts the new creature's id into both, so those same seats gain its
sheet, the **`exact`** variant of its hit points and the controls to spend them.

⚠️ **Rebinding a granted token onto a monster publishes that monster's stat block and its exact hit
points to the granted seats in the same write, with no second confirmation anywhere.** That is the
most consequential write in the tab and the panel's copy says it.

A layer flip is the same relation read the other way. Moving a token to the DM layer removes the coin
from every player's board, removes its placements, and — because sight of the token is structurally
the precondition for sight of the sheet — takes the bound creature's sheet and hit points with it.
Moving it back restores all of it. Stored grants are untouched in both directions and simply go inert
on the DM layer, which is why writing one there is allowed: preparing an ambush and granting it before
revealing it is a reasonable order to work in.

⚠️ **A rebind must not touch `controllerIds`, and that is not an oversight.** Grants are of the token;
the claim holder is composed in by `effectiveControllersOf` from whatever the token points at *now*.
Migrating the array on a rebind would write the derived half down — the denormalisation
[ADR 0004](0004-board-authorisation-and-layers.md) refused — and the bug that follows is a token
still listing the seat that played the creature it is no longer bound to. Two consequences fall out
and are stated rather than left to be discovered: rebinding away from a claimed hero **silently
withdraws that seat's derived control**, and it is visible on screen only because
`publicTokenValidator` carries the effective set and the stored set as two different fields; and
unbinding entirely collapses a claim-only token to the empty array, which is the Milestone 2
correction — *an unattached token is the DM's* — reached by a new route.

The grant relation itself gained **no second writer**. `board.setControllers` is still the one
mutation and `effectiveControllersOf` the one rule; the Tokens tab reuses the panel that already
writes it and reads the two arrays off the payload rather than computing either. That duplication is
what the previous record spent a milestone removing.

### Art is replaced inside the transaction that stops referencing it

`files.discard` refuses a blob a token still points at. So swapping a token's art cannot be
discard-then-repoint — the discard would be refused while the token still holds the id — and the
delete has to live inside the repointing mutation, exactly as `removeToken`'s does. Hence
`replaceTokenArt` rather than `setArt`: the old blob does not survive.

Two details worth having written down. The early return when the new id equals the stored one is a
**data-loss guard rather than an optimisation**: re-submitting the same id would otherwise patch the
row to point at a blob and then delete that blob, leaving a token drawing nothing with no way to
explain why. And the delete is **unconditional**, matching the two sites that already are, because
today an upload makes exactly one token and there is no route to pick an existing blob. A *partially*
conditional set of three deletes is the state in which somebody believes the shared-library problem is
solved; three unconditional deletes and one caveat naming all three is the honest shape.

### The name on a sheet is the panel's title

The creature's name at the top of the sheet panel was a captioned field, so it read at exactly the
weight of the armour class three rows below it — and both the player's tab and the DM's inherited
that: a list of fields with a name somewhere in it, rather than a sheet belonging to somebody. It is
the answer to *whose sheet am I looking at*, which is the one question the whole panel exists to
answer.

It is now a title, and the name appears **exactly once**. A heading above a small captioned box below
it would be the same string twice, two things to keep in step, and the shorter of the two is the one
that goes stale. So the input keeps every bit of its behaviour and gives up only its chrome. It is
deliberately not a real heading wrapped round the input either: a heading whose entire content is a
form control is a heading with no accessible name, which trades a working label for markup that only
looks more correct. The label stays and goes visually hidden, which is what keeps the input's
accessible name — `htmlFor` was always the part doing the work and the visible caption never was.

## Consequences

### Good

- **A returning DM gets in through the front door.** Two codes and no seat-then-Settings two-step,
  and Settings is still there for the browser that lost its code mid-campaign. The badge in the roster
  is finally telling the truth about a state you can reach on purpose.
- **ADR 0003's idempotence is visible.** The mechanism that makes a cleared cache cost a retyped name
  only ever worked if you could see what to retype; now you pick it off a list, with the character it
  holds printed under it.
- **One seat-list payload, one filter.** Deleting `players.listNames` collapsed two subscriptions to
  the same roster into one and left a single place where a creature's name and a reserved character's
  name are withheld.
- **The DM can reach a coin that is not on screen.** A token bound to nothing, or on a layer that is
  not being shown, was unreachable; the token list reaches every one of them, and the four writes mean
  a coin is no longer effectively immutable after the moment it was created.
- **The two secrecy writes are named as such** in the mutation, in the writer and in the DM's copy,
  rather than being three fields in one form that happen to include the two that matter.

### Costs and constraints we are accepting

- **The site publishes something with no credential.** A game's name, its creator, its age and its
  status, for thirty games. Scoped by the threat model, amended into the spec, and the first thing
  this application has ever published without a code. The bound is thirty rows of small documents with
  no counting, which is why it is affordable as a subscription every idle browser on the landing page
  holds.
- **A DM code can be tested without leaving a seat behind.** Stated above. The friction removed is
  near nil and the loss is that the DM cannot see the attempt.
- **A rebind is a publication.** The single most consequential write in the app now sits behind a
  dropdown. It is DM-gated, it is announced in the panel, and it is asserted by a test that scans a
  real player payload — but it is one click.
- **The token list is not a map.** It deliberately carries no position and does not say which scene a
  coin stands on, because a placement field would fold the ten-writes-a-second table into the
  low-churn subscription and invert invariant 2. "Where does this coin stand" is a question the map
  answers and this list does not.
- **A grant is still of the token rather than of the creature**, so a second coin on the same creature
  is a second thing to grant — unchanged, and now visible from two directions instead of one.
- **The landing page's components are not unit-tested.** There is no client component test
  infrastructure and adding one to cover a dialog would be the wrong trade, so the pure logic was
  extracted into modules that are tested and the components rest on the manual two-browser pass.

## Things found by building it

**A no-op unbind would have invalidated the whole table's board.** The no-op suppression on the
binding writer compares `(token.characterId ?? null)` against the argument rather than the raw stored
field. Without the normalisation, re-submitting an unbind on an already-unbound token patches
`undefined` over `undefined` — a write, therefore an invalidation of `board.tokens` for every client
at the table, from a form submission that changed nothing. The same class of bug as the one
`revokeControlForSeat` already guards, found because the guard existed to be copied.

**Two existing assertions were working around the missing mutation, and both said so in a comment.**
The convex-test case that grants a DM-layer token and flips it to the player layer moved the layer with
a raw database patch under a docblock reading *"no mutation changes it"*, and the smoke script's
equivalent added a **second token** under a comment saying *"there is no mutation that re-layers a
token"*. Both were true when written and both stopped being true here. The previous record promises
this property is *asserted twice, in the two places this project asserts secrets*; only now is it the
same round trip in both of them, driven through the public API rather than around it.

**A comment claimed a security property the codebase did not have.** The first draft of
`checkDmCode`'s docblock justified its single failure shape as what stops join codes being enumerated.
`games.getByCode` has always been exactly that oracle, because a join code is not a secret. A comment
asserting a defence that does not exist is worse than no comment, because the next person to weaken
the thing it describes will read it and believe they are protected.

**A Cancel button inside a form is an implicit submit.** The seat picker takes an optional footer for
its caller's chrome, and rendering that slot inside the `<form>` — which is where it visually belongs —
would have made the dialog's Cancel take the seat on the way out.

## Alternatives considered

### Publishing the join code beside each game — rejected

The list already knows the code, and printing it would remove a whole step from both doors. Rejected
because it inverts what the list is for: a row would stop saying *this game exists* and start saying
*here is the way in*, and the code would stop being a credential at the moment it appeared on a page
anybody can load. The gate is the only thing standing between a public list and a public game.

### A route per step, like `/#/join/:gameId` — rejected

The steps are a conversation rather than a location. No step is worth a back button or a bookmark, and
every one of them is invalidated by the code not yet typed — a bookmarked DM-code step would restore
to a screen whose whole context is gone. It would also put a game id in a URL that means nothing
without the code, and multiply a router that is currently three lines. The create panel already swaps
form for reveal in place, and the elevate dialog already shows two secret-taking paths one at a time;
both are the precedent.

### Seat first, then elevate, with no `checkDmCode` — rejected

No new backend at all: take the seat, call `elevateDm`, and navigate only on success. Rejected on the
failure path rather than the happy one. It is the shape that produces the silent de-elevation this
record exists to remove, and it leaves a seat behind for every mistyped code. The cost of the
alternative is one query returning one boolean.

### One `updateToken` taking every field — rejected

Fewer surfaces, one DM gate, one validation block. Rejected because two of the six fields decide what
players may know, and folding them into an absolute multi-field write means a rename carries a layer
and a binding. A stale value in either would publish something, as a side effect of an edit about a
name. The three-way split costs three more mutations and buys a call whose name says what it moved.

### A new query for the token list — rejected

A `board.allTokens` would be a second per-game subscription resolving one signed storage URL per
token, server-side, for a payload byte-identical to the one the panel already holds. `board.tokens` is
game-scoped rather than scene-scoped, so for a DM it already carries tokens on the DM layer and tokens
placed on no scene at all — which is the entire requirement. The previous record weighs this cost when
it refuses a seat id on the character list, and there the extra entry at least bought a different
answer.

### `characterName` on the token payload — rejected

The tab wants the bound creature's name and the payload does not carry it, so the obvious fix is to
join it server-side. Rejected because that subscription already re-executes on roster churn, and
adding a second table to it would make every character rename re-push every signed art URL to every
client at the table. The join is done on the client against a list it is already subscribed to.

### Keeping `players.listNames` — rejected

It is a smaller payload, and a smaller payload for a pre-seat audience sounds like the careful choice.
Rejected because it was not smaller in practice: it was a *second* subscription to the same roster
sitting beside one that already carried a superset of its rows, so keeping it meant two cache entries,
two socket subscriptions and two places for the creature-and-reserved filter to be remembered — to
withhold a field the door actually needs.

### The player creating their character outright — rejected

The other reading of the same sentence. Rejected because it needs a record superseding one written a
milestone ago, and it reopens `characters.create` to an ungated path — which is what let the character
list grow sideways, and one of the two doors invariant 9 exists to talk about. The reading taken
delivers the same screen for the price of a redirect and a sentence of copy.

### A public `games.remove` so the smoke script could clean up after itself — rejected

Tempting, and already answered. Deleting a game is reachable through an internal function and a CLI
that needs deploy credentials, which is why there is no *who may delete a game* to answer. A public
mutation puts that question straight back, and it wants a record of its own.
