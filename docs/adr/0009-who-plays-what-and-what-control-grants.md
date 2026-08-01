# 9. Who plays what, and what control grants

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The shell that replaced the floating panels got the screen right and the people at the table wrong.
It is one room now, with a map on the left and a strip of tabs on the right, and every panel that
used to compete with the canvas for a corner has somewhere to live. What it also did, by putting
everything in one place, was state out loud what this application thinks the participants are — and
what it stated was wrong in three separate ways.

The DM was offered a character to pick up. The sheet tab rendered for everybody, with a branch in it
explaining to a DM that they did not *need* a character but could have one, which is the clearest
possible statement of a model where the person running the game is a player who happens to hold a
code. The DM's route to a monster was three clicks inside a tab named *DM tools*, which is the tab
for the DM's plumbing, holding the DM's most-used act. And the sheet panel could show exactly one
sheet, the seat's own, so clicking a creature on the board changed a ring on the map and nothing
beside it — including for the DM, who has no other way of saying which creature they are talking
about.

Underneath all three sits a vocabulary that had gone soft. *NPC* meant a shopkeeper, a wolf, a
dragon, and any sheet the DM owned; *character* meant a hero, a document in a table, and sometimes a
token. Component names, copy and comments each picked a sense and none of them agreed. That is
tolerable in a codebase nothing new is being written against, and this is the opposite situation:
the next milestone is the dice, and the first question the roll path asks is *who is rolling, and
off which sheet.* The announcement it produces is literally a sentence built from a character and an
entry. Every fixture the feed gets written against comes from here — which tab a roll was clicked
in, whose sheet was on screen, whether the person clicking was allowed to be looking at it — so
these are settled first or unpicked later in the one file where three milestones' worth of behaviour
meets.

One thing moved forward to join them. Many-to-many token control was DM polish scheduled with the
DM-tooling work, on the reasoning that it only decided who may drag a coin. It is not polish here,
because **control is what decides which sheet a player is shown**, and that makes it a secrecy
question. A secrecy question belongs beside the choke points rather than three tabs away from them,
so it moved.

## Decision

### The DM does not play a character, and every other word here follows from that

The vocabulary is settled, written down, and the code changed to match it rather than the reverse.

| Word | What it is | What it is not |
| --- | --- | --- |
| **Account** | a person using the site | not a thing that exists — a browser plus a display name is the whole of it ([ADR 0002](0002-defer-user-accounts.md)). The word is reserved so nothing has to be renamed the day accounts land |
| **Player** | a person playing as a non-DM. Zero to many per game | not a character, and not a token |
| **DM** | the person running the game. Exactly one | not a player, and **does not play a character** |
| **Character** | one player character in one game, assigned to one player | not a template, and not owned by an identity |
| **NPC** | one non-combat or ally creature. DM only | not a character, and not assignable to a seat |
| **Monster** | one hostile creature. DM only | as above |
| **Token** | a coin on the board, optionally bound to one of the above | **not the creature.** A token is where something stands; the sheet is what it is |

The bolded line is the one that pays for the rest. A player sees a **Character** tab; the DM sees a
**Sheets** tab *instead of* it, not as well. A tab offering the DM a character is a tab offering
something the model says they cannot have, and it is exactly where the old *Pick a character* button
came from. If the person running the game also wants to play one, they run two seats, which the app
already supports and which nothing here has to know about.

Both tabs keep the Radix value `sheet`. Only the trigger's label and the mounted component differ,
so the force-mount arrangement [ADR 0008](0008-one-shell-and-what-a-sheet-entry-is.md) introduced —
one panel kept in the DOM so switching tabs cannot discard a half-edited sheet — stays one panel
with one `data-state` selector, rather than becoming two of everything for a split that is really a
branch.

### Control grants sight, and it is a second door composed with the first, never substituted for it

A DM who hands the party a pet has decided the party may read the pet's sheet. So `maySeeCharacter`
gains a third argument: the set of characters standing on tokens **this seat controls**.

The important half is that it is *composed*. The set arrives from `controlledCharacterIds` in
`lib/board.ts`, and that function is built from `visibleTokens` — the already-filtered set — rather
than from a fresh read of the table. Two properties fall out structurally rather than by anybody
remembering to check for them:

- **Sight follows the token.** A grant written onto a DM-layer token contributes nothing to a
  player's set, because the token was filtered out one line above. Move it to the player layer and
  the sheet arrives with it; move it back and the sheet goes. There is deliberately **no second
  layer test** inside `controlledCharacterIds`, and adding one would be the signal that the
  composition had been broken somewhere above it.
- **Nothing ungranted moves an inch.** Every creature the DM has not handed over is refused by the
  same predicate in the same module it always was.

That first property is asserted twice, in the two places this project asserts secrets: a
convex-test case that grants a DM-layer token and then flips it to the player layer, and a section
of `board-smoke.mjs` doing the same round trip against the real deployment. Both scan a genuine
player payload for the creature's name, notes and hit-point numbers, and both have a positive
control beside them so the scan cannot pass on an empty fixture.

`controlledCharacterIds` is the **second narrow crossing** out of `lib/board.ts`, beside
`visibleCharacterIds`. Both return a `Set` of character ids and never a `Doc<'tokens'>`, which is
what lets `lib/characters.ts` widen what a granted player may read without either choke point
reading the other's tables. One module answers *whose coins may this caller move*; the other decides
what that entitles them to read.

### The seat argument is optional, and absent means no grants

`maySeeCharacter(character, isDm, controlled?)` — and the third parameter is fail-closed by
construction rather than by convention. A caller with no seat in hand writes nothing and gets the
pre-grant rule; a caller who genuinely has a set has one because it went and read the board for it.
`controlledCharacterIds` itself returns the empty set for `playerId === undefined`, on the same
reasoning: a caller with no seat is an anonymous client, not a caller who controls everything, and
this is the argument that widens access to a secret, so its absent case is the refusing one.

Three call sites pass nothing, and each of them means it. `characters.claim` and `characters.assign`
both call `requireVisibleCharacter` with `isDm` hard-coded `false`, deliberately, so that neither
the DM code nor a grant can make a monster a playable hero. `characters.rename` is a write that was
never meant to widen with a grant. Adding the argument to any of the three "for consistency" would
change what all three of them mean, so the omission is documented at the function rather than left
looking like an oversight.

### A grant carries hit points, and stops at authorship

Sight alone would have been half a feature. `visibleVitals` therefore takes the controlled set as
well, and a granted creature falls through to the **`exact`** variant of `publicVitalsValidator`
rather than the band a player gets for everything else. The grant is a third term on the existing
condition rather than a second branch, so one expression still decides and the losing side still
assembles no number anywhere.

The write side is split by an explicit parameter. `requireEditableCharacter` takes
`{ allowControl }` with no default, because a default is the thing the next write path inherits
without anybody deciding:

- **`true`** on `adjustHp`, `setHp`, `adjustHitDice`, `longRest` and `setPerRest`. A granted pet
  takes damage from the player holding its lead. A grant that could not spend a hit point would be a
  sheet to look at.
- **`false`** on `updateSheet`. A granted monster is not a stat block a player rewrites. Lending
  somebody a wolf for a fight does not say they may change what a wolf is, and the DM's own numbers
  on it are the DM's.

`setLevel`, `setUnlocked`, `setCreatureCr` and `resetCreature` do not come through that function at
all — they are flat DM gates, which is the third answer and the one that needed no parameter.

### Reserved means absent, and it is a second predicate composed at the call site

The DM builds next month's new player a character and does not want tonight's party reading it. A
disabled row still publishes a name, and **the name is the spoiler** — `Seraphine, Cleric of the
Grave` greyed out in a list tells the table exactly as much as a live row does. So a reserved
character is absent from a player's payload entirely, which makes it a leaked *row* of precisely the
shape CLAUDE.md invariant 8 is about, and it goes through `lib/characters.ts` with everything else.

⚠️ It is a **second predicate**, `&&`-ed where the payload is built, and both of the places it could
have been folded into were considered and refused.

**Not into `isMonsterSheet`.** That is an allow-list answering exactly one question — which stored
kinds may be published — and invariant 9 exists because the formulation it replaced kept compiling,
kept passing, and answered `false` the moment a member was added to the union. Reserving is not a
kind of sheet. A second question asked inside a discriminator is how the discriminator stops being
one question and becomes the place a leak hides.

**Not into `maySeeCharacter`.** This one is easy to verify and easy to miss. Because `claim` and
`assign` pass `isDm` hard-coded false, a reserved character invisible *through that predicate* would
be a character **the DM cannot assign** — and being assignable to the player it was built for is the
one thing reserving it was for. So the two predicates meet at the call sites that have both
questions in view: composed where the character list is built, and read on its own where `claim`
refuses.

**The roster was a second way the name shipped.** `characters.list` is not the only payload carrying
a character's name; `playerCharacterNames` builds the map `players.list` prints as `characterName`
in the lobby and in the strip over the board. Withholding a row from one and naming it in the other
publishes exactly the thing reserving it was meant to withhold — a name attached to a seat nobody is
sitting in. Both filters exist, and the second is unreachable through the supported routes, which is
the same standing the NPC filter beside it has always had and the same reason it is written anyway:
the filter belongs where the payload is built, not where the writes happen to be careful.

Two routes out of the state, one outcome. `characters.setReserved` hands it back, and
`characters.assign` clears the flag in the same transaction as the claim — so "held and reserved" is
a state nothing can produce, and the DM handing a character to the player it was built for does not
have to un-hide it first and leave a window in which the row is visible to everybody and held by
nobody. `setReserved` refuses a claimed character in **both** directions for the same reason, which
is one line fewer and one state fewer.

### A linked creature derives its group, and a hand-built one stores it

The DM's selector needs three headings — Characters, NPCs, Monsters — and the schema has four sheet
*kinds* that do not map onto them: `pc` and `preset` are both characters, and `npc` and `bestiary`
are each either of the other two.

The split is the one the character library and the bestiary already made about every other number on
these sheets. A bestiary-linked creature is grouped by the corpus category of the entry it points
at — `social` is an NPC, `monster` and `enemy` are monsters — resolved in `lib/resolve.ts`, which is
one of the three modules allowed to read the corpus at all. A hand-built sheet has nothing to derive
from, so the dialog asks and the answer is stored in `NpcSheet.group`. `publicCharacterValidator`
carries the resolved answer and the client never computes it, which it could not do anyway: the
mapping reads a corpus that is deliberately not in the bundle.

⚠️ **`CharacterGroup` is a display discriminator and `isMonsterSheet` is a security one, and that
difference is what makes the defaults here safe.** Both values `groupOf` can return for a creature
are DM-only — a player receives neither, because `maySeeCharacter` refused the whole row before
anybody asked which heading it went under — so a wrong answer misfiles a row and can never publish
one. That is why an unanswered hand-built sheet may simply default to `'npc'`, and why a retired
entry key may fall back to `'monster'` rather than throwing inside the query that paints the DM's
whole panel. `isMonsterSheet`'s default is `true` for the opposite reason: getting *that* one wrong
publishes a dragon. The two questions must not be merged, and this one's tolerance must not be
copied across to that one.

`groupOf` is exhaustive with a `never` arm anyway, which makes three mechanical refusals on this
type — `isMonsterSheet`, `rollShapeOf`, and now this. The renderer iterates `CHARACTER_GROUPS`
through a `Record` of headings rather than writing three sections in JSX, for the reason the sheet
taxonomy settled: three hand-written sections is the arrangement where a fourth group leaves a
character stored, counted, and with no heading to find it under.

### Creating a character became the DM's, and players claim

`characters.create` demands the DM code on every path, for all three kinds, with the ternary that
used to let a `pc` past **removed rather than a check added**. That ternary was where a hole lived
once already: when it read `wanted.kind === 'npc'`, a player who knows the game code — which is in
the URL — could post a `bestiary` sheet and take the un-gated branch. With no un-gated branch left
there is no kind-test in the mutation at all, which is the strongest form of that repair: a test
that does not exist cannot come to disagree with `isMonsterSheet`.

Nothing about [ADR 0002](0002-defer-user-accounts.md) changes, and it is worth being precise about
that because it looks like ownership arriving. Characters still belong to the game rather than to
whoever typed them in; the pointer still runs seat → character and never the reverse; deleting every
seat still leaves the characters standing. What changed is who does the typing. The DM builds the
party's sheets, so a character that exists is one the DM meant to exist, and `reserved` is what
keeps one out of sight until the player it was built for arrives.

Players claim, from the Table tab, which is the list that already exists. The empty state on a
player's Character tab points at that list rather than offering a form — one place to pick a
character up, rather than two that can disagree about what is free.

### Selection is shell state, two primitives, and one function that reads it

`useTokenSelection` lived inside `Board`, which was right for the only thing selection did when it
arrived — decide what the arrow keys move — and cannot express any rule above. The id moved up to
`GameShell`, where both panes can see it: the map writes it on a click, the DM's selector writes it
on a choice, and the sheet panel reads it. What stayed in the hook is the half that has to know
about the board — resolving the id against the live token list and refusing one this browser may not
move.

⚠️ **Two primitives and three stable callbacks, never a selection object.** `MapPane` and
`RightPane` are both `memo`'d and the memos are load-bearing: the divider's width is state on the
same component and a drag sets it sixty times a second while neither pane reads it. A
`{ tokenId, characterId }` prop would be a fresh object on every one of those frames, defeating both
memos at once to produce byte-identical output. The symptom is a slow divider with nothing in the
profiler pointing at the cause, which is why the rule is written down in three places rather than
rediscovered.

**It has to be two.** A token id alone cannot express the selection, because a character routinely
has no token at all — the bestiary shelf creates a creature and never places one, and so does the
DM's new-character form. Choosing such a row with only a token id to write would leave the
*previous* token selected and the previous creature on screen, which is the exact confusion lifting
selection up here was meant to end.

**`sheetFocusOf` is the one place "whose sheet is on screen" is asked.** Five rules in order: a
direct pick from the DM's selector wins, then whatever the selected token is bound to, then — for a
player only — their own character, then — for the DM only — the token itself, then nothing. Rules
three and four are asymmetric on purpose, and that asymmetry is the only reason `isDm` is an
argument: a player who deselects wants their own sheet back, and a DM who deselects has finished
with that creature and should land on nothing. Nothing in the function is a permission and nothing
in it decides what may be *sent* to anybody; secrecy was settled server-side long before any of
these ids arrived. It is a function rather than an expression per call site because the readers are
already three — the pane that computes it, the player's tab and the DM's — and **the roll
announcement is the fourth.** Three call sites agreeing today is three that disagree the first time
one of them learns a new rule.

The `tokenWithoutSheet` arm is a real answer rather than a variety of *none*. A door marker or a
summoned wolf nobody wrote a sheet for is something the DM deliberately clicked on, and a panel that
names it beats one that silently keeps the last creature on screen — which is how a DM ends up
adjusting a goblin they are no longer looking at.

### The stored `npc` discriminator survived the rename

`DmNpcPanel`, `NpcCreateDialog`, `NpcSheetForm`, `NpcSheetFields` and half the copy used *NPC* for
every creature the DM runs, which is the confusion this whole record is about. All of it was swept.

⚠️ **`kind: 'npc'` in the stored union did not change, and neither did `npcSheetValidator`'s member
name.** That string is in every DM creature document in every game; renaming it is a data migration
dressed up as a tidy-up, and the non-atomic schema push behind that trap has caught this project
repeatedly — this record adds three more optional fields for exactly the same reason. **Rename what
is displayed; leave what is stored.** The consequence to live with is that one stored kind now backs
two displayed groups, which is precisely what `groupOf` exists to express.

### The residual hole now reaches a monster's stat block, and it is still not closed

A `playerId` is routing and not identity (invariant 7), so a player with the network tab open can
pass another seat's id and read whatever has been granted to *that* seat. That was true before and
is true now; what changed is the **class** of thing on the other side of it.

The honest statement is that the bound did not move and the contents did. Before, the residual
bought a rude move of a coin everybody could already see, or a hero's sheet the party shares anyway.
Now it can buy a creature's stat block and its exact hit points — but only a creature the DM has
deliberately published to a seat at this table, standing on a token already drawn on every player's
board. It cannot reach an ungranted monster, a DM-layer token, or anything the grant machinery has
not been pointed at.

This is the **fourth** decline of user accounts, and it is a decline rather than an omission.
Closing the residual needs real identity; nothing short of that helps, because every cheaper check
is a check on an argument the caller supplies. The roadmap section this work was planned from
sanctions the position in as many words — *"it buys them a creature the DM has already published to
the table"* — and the comments on `requireMovableToken` and `requireEditableCharacter` now say it in
full rather than leaving the next reader to discover that the sentence *"the refusal guarding a
secret keys off the DM code alone"* had stopped being true.

## Consequences

### Good

- **The roll path has a settled model to be written against.** Who is rolling, on whose sheet, and
  whether they were allowed to be looking at it are each answered in exactly one place —
  `sheetFocusOf`, `maySeeCharacter`, `requireEditableCharacter` — before the first feed row exists.
- **Two panels cannot disagree about what is being talked about.** The DM's selector and the map
  write the same selection, and the player's tab and the DM's tab read the same focus.
- **Control became worth having.** It was a rule about dragging coins; it is now the mechanism by
  which a DM hands the party a pet, its sheet and its hit points in one click, and the mechanism is
  the one that was already there.
- **What it cost elsewhere was mostly deletion.** `DmSheetsPanel` and `DmNpcPanel` were two views of
  one list, each with a paragraph explaining why the other existed, and the Sheets tab's selector is
  the list both of them wanted to be. `CharacterSheetDrawer` went with them — **the last slide-out
  in the app**, and the one the shell milestone did not notice it had left behind. `ui/sheet.tsx`
  now has no caller at all and is kept only because an unmodified member of the shadcn set is
  cheaper to keep than to re-add.
- **The DM's most-used act is in the tab named for it.** All three creation routes — a character,
  the bestiary shelf, a hand-built creature — sit above the list they add to, rather than two of
  them being three clicks inside *DM tools* and the third being a form in the lobby footer.
- **A departing seat takes its grants with it.** `players.leave` sweeps them through
  `revokeControlForSeat`, so the DM's dialog never renders a row it cannot name.

### Costs and constraints we are accepting

- **The health-bar subscription is now a cache entry per seat.** `characters.vitals` takes a
  `playerId`, so two players at one table hold two subscriptions where they used to share one. That
  is the price of a grant meaning anything there — the answer genuinely differs per seat, and the
  alternative is sending every player the exact numbers and hiding them in the client, which is
  invariant 1 inverted. Bounded by the size of the table rather than by anything that grows.
- **`board.tokens` reads the roster.** It has to, because it carries who may move each token, so a
  join, rename, claim or release re-executes it for everyone. Correct for a claim, because a claim
  *is* control and the answer moved; merely cheap for the rest. `board.positions` deliberately does
  not do this, and must not: it is the ten-writes-a-second half.
- **The five hit-point paths put a bounded `listSeats` read into their transaction.** That makes a
  concurrent join or rename an OCC conflict against a hit-point write, which is exactly the trade
  `requireMovableToken` refuses. The difference is the write rate — hit points change a few times a
  round, and retrying that is free.
- **A grant is of the token, not of the creature.** A second coin on the same creature is a second
  thing to grant. That is the honest consequence of keying the relation where the DM can see it, and
  the panel's copy says so in as many words rather than letting a DM discover it.
- **`characters.list` still answers no grants.** A granted creature stays absent from that payload,
  because it is one per-game subscription the whole shell re-renders from and a `playerId` would
  split it per seat. A grant is answered where a grant is used — the board, and `characters.sheet`.
  Whoever adds the argument should be able to say which screen needed it.
- **One stored kind now backs two displayed groups**, so `kind: 'npc'` and `group: 'npc'` are
  different facts with the same spelling. Unavoidable without a migration, and the reason `groupOf`
  is the only place either question is answered.
- **The residual hole reaches further than it did.** Stated above, sanctioned, and written into the
  two functions it flows through rather than left in this file alone.

## Two things found by building it

**`visibleVitals` needed the controlled set, and control granting sight without hit points is half a
feature.** The plan treated the sheet and the health bar as separate concerns, which they are
everywhere else in this schema — that separation is the whole of ADR 0005. Here they are one act:
`HpControls` renders its `−`/`+` only against the `exact` variant, on the stated grounds that a
caller who may edit hit points is always sent them. So a granted player receiving a band would get
the party's wolf with a sheet, a health bar, and no way to take damage on it — a feature that looks
broken rather than restricted, and a bug that would have been reported as "the buttons are missing"
rather than as anything to do with grants.

**`publicCharacterValidator` needed `reserved` projected, or the DM's control could only ever be a
command.** Reserving withholds a row, so the field carries no information a player did not already
have from the row's presence — which reads at first like a reason not to send it. It has to travel
anyway, because without it the hide button can say what pressing it *would* do and never what is
currently true. For a flag whose entire purpose is "somebody must not see this", the state is the
one thing the DM needs to be able to read off the screen. The field is therefore always `false` in a
player's payload by construction, and that is the point rather than a weakness.

## Alternatives considered

### A `tokenControllers` table — rejected

The normalised shape: one row per token per seat, indexed both ways. Rejected because the relation
is small, bounded by the seats in one game, and read on the token's own document by three callers
that already have it in hand — `requireMovableToken`, `publicTokens` and `controlledCharacterIds`.
A table would add a range read to the board's low-churn query and a second document to keep in step
with a token's deletion, in exchange for an index nothing needs. The stored array is optional on
`tokens` and read through one accessor, which is the fifth time that arrangement has answered a
field added to a populated table.

### Folding reserved into `maySeeCharacter` — rejected

The tidier-looking option: one visibility predicate, two reasons inside it. Rejected because `claim`
and `assign` call the predicate with `isDm` hard-coded false on purpose, so a reserved character
hidden there is one **the DM cannot assign** — the single thing reserving it was for. Folding it
into `isMonsterSheet` instead was rejected for the reason invariant 9 exists: that function is an
allow-list answering one question, and its previous formulation failed open.

### `characters.list` taking a `playerId` — rejected

It would let an assignee see a still-reserved character before the DM assigns it, and would let a
granted creature appear in the list rather than only through `characters.sheet`. Rejected on the
subscription shape: `characters.list` is one per-game entry shared by every client and re-rendered
by the whole shell, and a seat id in its arguments splits it into a cache entry per seat on the
noisiest query in the app. The use case it serves is also already served — assigning clears the
reservation, so the moment the character is theirs it is visible.

### Control granting full sheet edit — rejected

The simpler rule: a grant means the seat may do anything the claim holder may do. Rejected because
the two halves of a sheet are not the same kind of fact. Hit points are play and change several
times a round; the stat block is authorship and is the DM's own work on the DM's own creature.
Lending the party a wolf for a fight says nothing about who decides what a wolf is. The split costs
one required parameter with no default, and the parameter is required precisely so the next write
path has to answer the question rather than inherit an answer.

### A Character tab for the DM as well — rejected

Keep the player's tab on the DM's strip, so a DM who is also playing has both. Rejected because it
is the model this record exists to correct: the DM does not play a character, and a DM who wants to
play one runs a second seat, which the app already supports. Retaining the tab would have retained
the *Pick a character* button, which is the artefact that made the wrongness visible in the first
place. It also costs a second force-mounted panel and a stored tab value meaning different things to
different people.

### A single token-id selection in the shell — rejected

One `selectedTokenId` and derive the rest. Rejected because a character routinely has no token: the
bestiary shelf creates a creature and never places one. Choosing such a row would leave the previous
token selected and the previous creature on screen — the precise confusion lifting selection out of
`Board` was meant to end. Two primitives cost one extra `useState` and keep everything crossing the
memo boundary primitive, which is the constraint that actually binds here.
