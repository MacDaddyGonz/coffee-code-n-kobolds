# Roadmap

The order features get built, and why that order. Full feature detail lives in
[requirements.md](requirements.md) — this file is about **sequencing**.

Two principles drive the ordering:

1. **Risky things first.** The live token sync and the DM-layer security model are the parts most
   likely to force a redesign. Build them before there's a lot of code sitting on top of them.
2. **Reach a playable session early.** Milestones 1–8 are the minimum to actually run a game.
   Everything after that makes it nicer. For a game played a few times a year, a rough playable
   version beats a polished half.

Each milestone is a branch (or a few), merged to `dev`, then promoted to `main` when it's worth
deploying. Acceptance criteria are written so you can tell "done" from "mostly done".

**Numbering note.** Four milestones have been inserted after the one before them shipped, and each
insertion pushed everything below it down one.

- **Milestone 4, the character library**, inserted after Milestone 3 shipped.
- **Milestone 5, the monster and NPC library**, inserted after Milestone 4 shipped — for the reason
  that milestone gives: an NPC's sheet feeds the roll path as much as a hero's does, so the bestiary
  gets written before the dice rather than retro-fitted to them.
- **Milestone 6, the screen and the sheet taxonomy**, inserted after Milestone 5 shipped and after
  the first look at the deployed app. It is the same argument a third time: **the feed needs a home
  and the roll path needs to know what kind of thing it is rolling**, and both are cheap to settle
  before the dice exist and expensive to retrofit afterwards.
- **Milestone 7, seats, sheets and control**, inserted after Milestone 6 shipped and after reviewing
  it. Same argument a fourth time, and the sharpest instance of it: **the roll path has to know who
  is rolling and on whose sheet**, and the shell built in Milestone 6 answers that question wrongly
  — it offers the DM a character to play and gives the players' sheet panel no way to show anything
  but their own. Every one of those is a fixture the feed would then be written against.

So rolls and dice went 4 → 5 → 6 → 7 → **8**, DM tooling 5 → 6 → 7 → 8 → **9**, tools and polish
6 → 7 → 8 → 9 → **10**, and the game editor 7 → 8 → 9 → 10 → **11**. This file is renumbered
throughout. **The ADRs are not**, because an ADR is not edited after the fact — read them against
this table:

| Where the ADR says | It means | Read it as |
| --- | --- | --- |
| Milestone 4 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | rolls, feed and dice | 8 |
| Milestone 5 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | DM tooling, layers, fog of war | 9 |
| Milestone 5 — [0006](adr/0006-premade-character-library.md) | rolls, feed and dice | 8 |
| Milestone 6 — [0006](adr/0006-premade-character-library.md) | DM tooling, layers, fog of war | 9 |
| Milestone 6 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | rolls, feed and dice | 8 |
| Milestone 7 — [0004](adr/0004-board-authorisation-and-layers.md) | orphaned-blob sweeper, admin view | 11 |
| Milestone 7 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | DM tooling, layers, fog of war | 9 |
| Milestone 8 — [0006](adr/0006-premade-character-library.md) | orphaned-blob sweeper | 11 |

[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md) has no row, and that is the discipline
working rather than an omission: it names no milestone number anywhere, so the fourth renumbering
cost it nothing.

**This file no longer contains a forward reference by number, and that is the fix rather than a
tidy-up.** Three renumberings taught the lesson [ADR 0006](adr/0006-premade-character-library.md)
wrote down — *a comment that names a milestone number dates badly, and naming the feature survives* —
so every "still Milestone 6" in a completed section above now reads "still the rolls milestone", and
the same for the DM-tooling, tools and game-editor milestones. **The fourth insertion cost a heading
renumber and this table, and nothing else**, which is the prediction that sentence made being paid
out rather than a coincidence worth glossing over.

Source comments carry the same drift and have **not** been swept, though Milestone 5 stopped adding to
it: nothing written in that milestone names a number. Older comments naming one are read against the
table above and get corrected as those files are touched, because a twenty-file rename is a diff
nobody reviews properly.

---

## ✅ Milestone 0 — Pipeline

**Done.** Vite + React + TypeScript + Convex, deploying to GitHub Pages on push to `main`. A
live-sync smoke test proves the whole path end to end.

The `pings` table and `convex/ping.ts` were scaffolding to prove that path. **Both are gone**,
removed in Milestone 1 along with the smoke-test screen they backed.

---

## ✅ Milestone 1 — Games and players

**Done.** Create a game, join it with a code, and a live lobby showing who is in and which character
each of them has claimed. No map yet.

- `games` table: name, join code, creator's display name, DM code, and a per-game salt plus SHA-256
  of the DM recovery phrase. The phrase itself is never stored.
- `players` table — a **seat at the table**, not a user. Identified within a game by `nameKey` (the
  display name normalised and lowercased), so `players.join` is idempotent and a cleared browser
  rejoins by retyping the same name. See [ADR 0003](adr/0003-player-identity-without-accounts.md).
- `characters` stored inside the game, with the claim pointer running seat → character
  (`players.characterId`) and never the reverse — so deleting every seat leaves the characters
  intact. [ADR 0002](adr/0002-defer-user-accounts.md).
- Join codes from an alphabet with no `I`, `L`, `O`, `0` or `1`, normalised identically on the
  client and the server from one shared module.
- DM role: a **bearer credential**, re-verified server-side on every DM-only call. `players.isDm` is
  a badge and `playerId` is a routing argument — **neither authorises anything.** DM-gated
  operations are forcing (`characters.assign`), destroying (`characters.remove`), renaming the game,
  and anything that hands back the DM code. Seat operations are not gated, because a seat is
  identified by a name anyone with the join code can type.
- DM recovery: game code + recovery phrase exchanges for the DM code in-app, so a cleared browser
  months later is a nuisance rather than a lockout. No failed-attempt lockout, deliberately — see
  ADR 0003.
- `publicGameValidator` as a `returns:` validator on every public game query, so a DM secret added
  to a projection by accident throws at runtime instead of shipping. CLAUDE.md invariant 1.
- Routes: home screen (create game / join with code) and `/#/game/:code` with a name gate and the
  lobby.
- Browser storage holds prefills, the per-game display name and the per-game DM code — nothing that
  cannot be retyped.

**Two things deliberately not done here:**

- **No `activeSceneId` and no game status field on `games`.** A `v.id('scenes')` field needs a
  `scenes` table, and an empty forward-reference table is worse than a one-line schema addition
  later. Milestone 2 adds the table and both fields together.
- **No presence or online-now tracking.** The lobby shows the durable roster of who has joined,
  which is what the acceptance test needs. Heartbeats are exactly the high-churn data that belongs
  in its own table (CLAUDE.md invariant 2), so live presence — if it turns out to be wanted at all —
  comes later with a table of its own.

**Acceptance:** two browsers join the same code, each picks a name, and each sees the other appear
in the lobby without a refresh. Clearing site data and retyping the same display name lands on the
same seat with the same character still claimed. A player cannot delete a character or take one off
another seat without the DM code.

---

## ✅ Milestone 2 — Map and tokens

**Done.** A map on screen with tokens on it, moving live between browsers, with the DM layer absent
from a player's payload rather than hidden in their client. The riskiest milestone, and the decisions
it took are recorded in [ADR 0004](adr/0004-board-authorisation-and-layers.md).

- `scenes` table: background image, the stored image's dimensions, grid size, grid offset and a
  `gridVisible` flag for maps that already have a grid printed on them. `games.activeSceneId` and
  `games.status` (`'lobby' | 'playing'`) landed with it, as Milestone 1 said they would — both
  optional in the schema, because adding a required field to a table that already has rows fails the
  push, and read through `gameStatus` so the default lives in one place.
- **Two token tables**, deliberately split: `tokens` for the stable data (art, name, size, layer,
  owning character) and `tokenPositions` for position alone. Convex rewrites a whole document on
  patch, which is why a throttled drag write touches four fields and contends with nothing. CLAUDE.md
  invariant 2. Placements are keyed per **(scene, token)**, so the row's existence is what puts a
  token on a board, each scene remembers its own layout, and one token can stand on several.
- **One choke point, not a validator.** `convex/lib/board.ts` is the only module in `convex/` that
  reads either token table, and every read goes through one `maySee(token, isDm)` predicate fed by
  `resolveDmAccess`. Two tests keep it honest: `leakGuard.test.ts` greps every Convex source and
  fails if any other module queries those tables, and `board.test.ts` scans the serialised payload of
  every public board and scene query fetched without a DM code for a DM-layer token's id, name or art
  URL — with a positive control so it cannot pass on an empty fixture. The `returns:` validator that
  guards the `games` document catches a leaked *field*; a DM-layer token is a leaked *row* of the same
  shape, so it needed a structural guard instead.
- **Refusals are indistinguishable.** `board.moveToken` on a DM-layer token without the DM code
  returns the same `TokenNotFound` as a fabricated id — a distinct refusal is an existence oracle, and
  an ambush is spoiled by knowing it exists.
- **Two ways to move a token, one write path.** Drag and drop, or select and nudge with the arrow
  keys, both commit through `board.moveToken` with a shared throttle at ~10 writes/sec and a Convex
  optimistic update. `settle: true` makes the **server** snap, using `snapToGrid` from
  `convex/lib/grid.ts` — the same function the client imports through `@convex`, so a dropped token
  cannot rest between squares even if the client's arithmetic were wrong. Remote positions are
  interpolated over ~120 ms, so the far screen glides rather than steps.
- **Roll20-style pan and zoom** — wheel zoom about the pointer, presets, fit, and pan by empty-drag,
  middle-drag, space-drag or arrow keys with nothing selected. The camera is **never written to
  Convex**: it is a view, not shared state, so it costs zero database traffic and is remembered per
  game and scene in local storage.
- **Upload with a downscale on the client and a size guard on the server** — 2560 px long edge for
  maps, 256 px for tokens, WebP, and both `scenes.create` and `board.addToken` read the stored blob
  and refuse an oversize one outright, each against its own limit in `convex/lib/limits.ts` — a
  client-side cap the server does not check is a cap a bug removes. CLAUDE.md invariant 6. The
  refusal cannot also delete the blob it refused, because a mutation is one transaction; the client's
  catch calls `files.discard` for that, and that call refuses a blob a scene or a token still points
  at so a mis-sequenced catch cannot strip the art off the board. The full library editor is still
  the game-editor milestone.
- **Grid calibration by squares-across**, with an arrow-key offset nudge against a live overlay.
  Changes **apply as they are made** rather than sitting behind a Save button: calibrating a grid is
  aiming at a target you can see, and a commit step between each adjustment and its overlay makes the
  aiming worse. `gridSize` is a float, so 2240 / 16 is exactly 140 rather than a rounded 139 that
  drifts a whole square out by the far edge.
- **Token control corrected after the first real session.** `requireMovableToken` used to let a
  player move any token with no character attached, which sounded reasonable and was not: every NPC
  the DM adds is unattached, so the whole table could shove the monsters around. It now refuses
  unless the calling seat has claimed the token's character — control is granted, never assumed, and
  an unattached token or an unclaimed character is the DM's. The ceiling is unchanged and still
  honest: a `playerId` is routing, so this stops a misclick, not the network tab. Accounts were
  reconsidered here and declined again — [ADR 0002](adr/0002-defer-user-accounts.md) and
  [ADR 0004](adr/0004-board-authorisation-and-layers.md).
- Scene names are DM-only: `scenes.list` requires the DM code because a list of names is a spoiler,
  and players get only the active scene.

**Deliberately not done here:**

- **No layer toggle and no moving tokens between layers** — the DM-tooling milestone. The choke point supports
  the move; the schema supports only two layers, and that milestone's third one is a union change.
- **No tabbed DM panel and no polished scene-switch UX** — the DM-tooling milestone. `scenes.setActive` exists and
  is DM-gated, driven by a bare `<select>` in the DM setup panel.
- **No marker or ruler tools** — the tools milestone. `convex/lib/grid.ts` gives it the cell arithmetic to
  build on (`cellOf`, `centreOfCell`), but nothing distance-related is written yet — a shared module
  is the most expensive place to park code nothing calls.
- **No character sheets and no token health bars** — Milestone 3. `tokens.characterId` links a token
  to a character, and nothing else about a character is on the board yet.
- **No token or map libraries** — the game-editor milestone. Uploads go straight onto the board.
- **No orphaned-blob sweeper** — the game-editor milestone. A refused or abandoned upload can leave a file in
  storage: the refusal cannot delete it, `files.discard` is the client's good-citizen path but a
  crashed tab never calls it, and `files.generateUploadUrl` can mint a blob nothing ever references.
  Bounded by needing the DM code, and recorded in
  [ADR 0004](adr/0004-board-authorisation-and-layers.md) — which calls it Milestone 7, see the
  numbering note.

**Acceptance:** the DM drags a token and the player sees it move smoothly, not in jumps. A player
opening devtools and reading the network payload **cannot** see DM-layer tokens. Tokens land on grid
squares, not between them — by mouse and by arrow key, at any zoom level, because the server snaps on
settle.

---

## ✅ Milestone 3 — Character sheets

**Done.** Sheets for heroes and monsters, hit points on the board, and exact NPC numbers that are
*absent* from a player's payload rather than hidden in it. The decisions are recorded in
[ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md).

- **Two shapes of secret, two different guards** — and getting this distinction right was the whole
  risk of the milestone. An NPC's **sheet** is a leaked *row* indistinguishable in type from a
  hero's, so `convex/lib/characters.ts` became a second choke point with one `maySeeCharacter`
  predicate, and `leakGuard.test.ts` was generalised from one hard-coded reader to a table of
  table→reader pairs. An NPC's **hit points** are a leaked *field*, so `publicVitalsValidator` is a
  discriminated union whose player-facing variant has **no numeric member at all** — there is
  nowhere to put a hit point, and Convex throws if anyone ever adds one. CLAUDE.md invariant 8 used
  to predict these were the same problem; they are not, and it now says so.
- **A band, not a percentage.** Players get `healthy | bloodied | critical | down`. A percentage
  fails the requirement it appears to meet: 82.2% of a guessable maximum hands `37/45` straight back.
  Four states leak about two bits and still tell the party whether to press the attack. A creature
  that is alive is never `down`.
- **A player is told about a monster only when its token is already on their board.** Sending a band
  for every NPC in the game would publish a *count* — twelve rows is twelve prepared monsters, the
  same spoiler as a scene name. `characters.vitals` composes the two choke points:
  `visibleCharacterIds` in `lib/board.ts` answers "whose tokens may this caller see?" and returns
  nothing but ids.
- **`characterVitals`, split from the sheet** — but not for the reason invariant 2 usually gives.
  Hit points change a few times a round, not ten times a second, so write contention alone would not
  have justified a table. The decisive reason is the shape of the *subscription*: a health-bar query
  that read character documents would be reading NPC sheets, which are the secret. `maxHp` stays on
  the sheet, because copying it would make two documents authoritative for the number the band is
  computed from.
- **NPC-ness is stored, never inferred.** Deriving it from "has any seat claimed this?" is the exact
  shape of the Milestone 2 bug, and would fail in both directions.
- **The reduced NPC sheet shares one `SheetEntry` type** with the full one, across a PC's feats, a
  PC's spells and a monster's actions — which is what stops "two shapes" becoming two of everything,
  and gives the rolls milestone one roll path rather than a fork.
- **The catalogue is content, and a character stores a copy.** `convex/lib/rules.ts` holds 24 spells,
  16 feats and 12 NPC actions; `catalogueKey` is a breadcrumb, not a foreign key, so retiring an
  entry leaves every sheet that has it working. Roll specs (`1d8+WIS`) are **validated in shape now
  and evaluated when rolling lands** — storing them unvalidated would be a migration over every sheet the
  moment something first parses one.
- `ClaimCharacterNotice` is gone, subsumed by the sheet panel as Milestone 2 said it would be.

**Deliberately not done here:** rolling anything (the rolls milestone — the roll specs are stored and
validated but never evaluated), temporary hit points and death saves (absent from
[requirements.md](requirements.md), so out of the rules subset by the same discipline as the
exclusions), a read-only view of another player's sheet, and the five-section DM panel — the Sheets
tab is deliberately the seam the DM-tooling milestone grows from, not an attempt at it.

**Acceptance:** create a character, edit its HP from the sheet and from the token, and see both
update everywhere at once. A player inspecting network traffic sees no exact NPC HP — asserted by
`vitals.test.ts` with a positive control, and by `board-smoke.mjs` against the real deployment.

---

## ✅ Milestone 4 — Character library, races and skills

**Done.** The character sheet stops being a blank form and becomes something you **choose**: pick a
race, pick a class, pick an archetype at level 2, and the DM sets the level. A library of 72 premade
sheets supplies everything else. The decisions are recorded in
[ADR 0006](adr/0006-premade-character-library.md).

The problem it solves is decision paralysis, not missing features. Before it, somebody had to know
5e well enough to allocate six ability scores, pick two saving throws and choose a spell list before
a character existed at all — and the audience for this app is beginners and children.

- **72 premade sheets**: eight classes at level 1, then two archetypes each across levels 2 to 5, in
  `convex/lib/library/`. Every level is written out in full rather than derived from the one below,
  because the reader is somebody comparing level 3 to level 4 and wanting to see both. The archetype
  pairings are the two most popular per class, chosen so a beginner picking blind cannot pick badly.
- **A character stores its selections, not its sheet.** The `characters` document holds a `preset` —
  race, class, archetype, level, a lock and an optional override diff — and no numbers whatsoever.
  `resolveSheet` builds the sheet on every read. Awarding a level is therefore **one number
  changing**, and a correction to the library reaches every character that already has it with no
  migration. The costs of that live link are stated plainly in the ADR.
- **Resolution went behind the accessor that already existed**, and that is why the milestone was
  cheap. `characterSheet` was already the single home for a character's sheet across nine call sites,
  so substituting `resolveSheet` left `maySeeCharacter`, `visibleVitals`, the health bands and
  `publicSheet` untouched. It stays **synchronous and pure** — the library is a static module rather
  than a table — which is the only reason it was a substitution rather than an async refactor of
  every read path and both of Milestone 3's choke points.
- **Library, then race, then the DM — an order that cannot be rearranged.** The library's standard
  array is race-agnostic by construction, so race must come second or an Elf's +2 would sit in a base
  the next level overwrites. The DM comes last because an override is the final word: that is what
  keeps "the DM can always change a player's sheet" true against a live link, and what makes an
  override **survive a level-up**.
- **The library never reaches the browser.** The server sends a finished sheet; the client imports
  only `lib/classes.ts` and `lib/races.ts` for its dropdowns — names and one line of help each. That
  keeps ~150 KB of stat blocks out of a bundle already near 964 KB, and leaves no second
  implementation of the resolution order to drift from the server's. A test holds the separation,
  the way `leakGuard.test.ts` holds the read choke points.
- **Two exclusions in [requirements.md](requirements.md) were lifted, by amendment rather than by
  edit.** Racial abilities are in — eight races, three of which touch a number. Skills are in —
  thirteen of them, with proficiency coming from the character's *class* and nowhere else;
  **backgrounds are still excluded**, which is the difference between lifting an exclusion and
  abandoning one. The original lists in requirements.md are untouched and an amendment section
  underneath them records what changed and when, because a spec quietly edited to match the code can
  no longer catch the code being wrong.
- **Race is applied at resolution rather than written into the library**, which is what keeps 72
  sheets from becoming 576. The trait always appears on the sheet even when it changes no number — a
  Halfling's Lucky is the whole of what makes them a Halfling.
- **Speed became a field.** It defaults to 35 and is read through one accessor, because the Goliath
  moves 45. Every other character in the game still moves 35 and nothing offers a control to change
  it.
- **Per-rest abilities and the long rest live in `characterVitals`**, for exactly the reason hit
  points do (ADR 0005): whether a Human's Heroic Inspiration has been spent is *state*, not build. A
  rest clears it, an edit does not. Spent abilities are stored as keys rather than a count, so a race
  that gains a second one needs no migration. `characters.longRest` restores hit points, hit dice and
  per-rest abilities in one mutation, and returns *all* the hit dice rather than 5e's half, because
  "you get everything back" is a rule a child can hold.
- **The lock is advisory and says so.** Level is the DM's, overrides are the DM's, and race, class
  and archetype lock once chosen — a player may set the lock, only the DM may clear it. Each rule
  stops a misclick; none survives the network tab, because `playerId` is routing and not identity
  ([ADR 0004](adr/0004-board-authorisation-and-layers.md)). That is the right amount of enforcement
  for something where nothing behind the check is a secret.
- **A resolved preset is validated as well as its selections.** `storedSheetProblem` covers the four
  choices; the resolution is then put through `sheetProblem` too, which is what catches a library
  entry with a malformed roll spec or a race bonus that pushes an ability past 30. The library is
  content, and content drifts.
- **A retired archetype degrades rather than throwing.** `librarySheet` returns null, the character
  keeps its level, name and hit points, and loses only the numbers it was borrowing. Choosing a
  retired archetype is refused on write while reading one is tolerated — the same asymmetry
  `subclassOf` and `catalogueEntry` already have.
- **Two more optional fields**, `skillProficiencies` and `speed`, because the table already holds
  Milestone 3 sheets without them and adding a required field to a populated table fails the schema
  push. Third time this project has met that trap, so it is now a pattern rather than a surprise:
  optional in the schema, one accessor, always populated on a resolved sheet.

**Deliberately not done here:**

- **No rolling.** Still the rolls milestone. The library's entries carry roll specs as validated strings and
  nothing evaluates one.
- **No backgrounds, no inventory, no subraces, no multiclassing and no experience points** — see the
  amendment section in [requirements.md](requirements.md) for which of those are excluded by design
  and which were lifted. The fixed equipment kit on each premade sheet is *not* an inventory; it is
  the line of text "set equipment per character" already asked for.
- **Nothing past level 5.** The library ends there, and a character the DM pushes beyond it stops
  gaining rather than falling back to nothing. Their proficiency bonus still rises with level.
- **No preview of an unsaved character.** Choosing is done from a one-line blurb, and the numbers
  appear once the choice is saved. A preview needs a query of its own and nothing has asked for one.
- **No rules enforcement.** The app remembers whether a once-per-rest ability has been spent, which
  is the part a table forgets, and adjudicates nothing — a rules engine is what D&D Lite exists to
  not be.
- **No premade NPCs.** The library is player characters only; a monster is still the reduced sheet
  from Milestone 3. The bestiary is **Milestone 5**, immediately next, and it was moved there from
  the game editor precisely because a monster's sheet feeds the roll path as much as a hero's does.

**Acceptance:** somebody who has never played D&D picks a race and a class and has a complete,
playable sheet — abilities, saving throws, skills, armour class, hit points, hit dice, features,
spells and a kit — without answering another question. The DM awards a level and every one of those
numbers moves, with no sheet rewritten and any override the DM had made still in place. A Goliath's
speed reads 45 and a Dwarf's maximum hit points are one higher per level. No stat block from
`convex/lib/library/` appears in the client bundle.

---

## ✅ Milestone 5 — Monster, enemy and NPC library

**Done.** The decisions are recorded in
[ADR 0007](adr/0007-monster-bestiary-and-cr-scaling.md). Four things it settled that the section below
planned differently or did not plan at all, so read them together:

- **An ability may opt in to scaling.** The source spec's "special abilities are unchanged by a shift"
  is right for a Troll's Regeneration and wrong for a dragon's breath weapon, which is most of what the
  dragon does — frozen, a CR 6 dragon stepped down to CR 2 still kills a level 2 party with its first
  action. `scalesWithCr` defaults to off so the spec's rule is what happens by default, and the corpus
  test refuses an ability whose average damage exceeds its rating's benchmark without it. Recorded as a
  **fourth overrule** in the spec's additions section.
- **One attack bonus per creature, not one per attack.** `sheetEntryValidator` is the shape shared with
  a hero's feats and spells, and widening it for a monster-only concern would fork the single roll path
  the dice milestone depends on. Also an addition to the spec.
- **The union widening was the dangerous part, and it was not free.** The section below calls widening
  `storedSheetValidator` "additive and safe". It is — *provided the compiler names every site that
  switches on it*, which it did not: an audit found three critical holes, all invisible to `tsc`, all
  the same fact spelled three times. `kindOf` failing open published every creature in the game to every
  player. See invariant 9 in [CLAUDE.md](../CLAUDE.md) and the ADR.
- **The 1,300-sheet loop below is necessary and not sufficient.** A clamp turns an out-of-range value
  into an in-range one, so a CR 6 Tank whose armour class wants to be 43 is pinned at 40 and the loop
  goes green while the content is wrong. A second loop recomputes every field unclamped and asserts it
  equals the clamped result.

Two of its open questions are answered below rather than left open.

**The original plan follows.** A hero is now something you choose from a library of 72 premade
sheets; a monster is still a blank reduced sheet somebody types an armour class, a hit point total and
three actions into, at the rate of one per creature in the encounter. This milestone gives the DM the
same thing the players got: a corpus of finished creatures, picked rather than typed.

**Why it goes here and not in the game editor, where it started.** An NPC's actions carry the same
roll specs a hero's spells do, and the rolls milestone evaluates all of them through one path. A bestiary
written *after* the dice exist is a corpus retro-fitted to whatever the evaluator happened to accept;
written before, it is 150 more entries that the evaluator has to satisfy on the day it lands — which
is the same argument Milestone 3 made for validating roll specs it could not yet evaluate. The
secrecy work is also already done: `maySeeCharacter` and the health bands do not care where a
monster's numbers came from, so this milestone adds content and a picker, not a security surface.

The source spec is [monster-library-spec.md](monster-library-spec.md), kept verbatim in the same way
[requirements.md](requirements.md) is. **Three of its sections are overruled** — Library Linking,
Output, and one design goal — and each gets its reasons below rather than an edit upstairs; **one
feature is added to it**, CR scaling, recorded in that file's additions section for the same reason. The
rest is taken as written. Whatever this milestone actually decides gets an ADR of its own when it lands,
the way [ADR 0006](adr/0006-premade-character-library.md) records Milestone 4's.

### Content

- **Roughly 110–150 entries** in `convex/lib/bestiary/`: 60–80 monsters, 25–35 humanoid enemies,
  25–35 social NPCs. Twice the character library's entry count and a fraction of its bulk, because
  each one is a *reduced* sheet — no six ability scores, no saving throws, no spell progression.
- **Five difficulty tiers, CR 0 to CR 6, and nothing above it.** Tier I (CR 0–¼) for a level 1 party
  up to Tier V (CR 6) as a level 5 boss. The same ceiling the character library has, for the same
  reason: the library stops at level 5, so a creature tuned for level 8 has nobody to fight.
- **Balanced against `convex/lib/library/`, not copied from the Monster Manual.** This is the part
  that would have been guesswork before Milestone 4 and is now arithmetic — the expected hit points,
  armour class and damage output of a level 3 party are 72 hand-written sheets sitting in the next
  directory. Official CR maths assumes a full 5e character; a D&D Lite one has a reduced spell list, no
  inventory and an Extra Attack or 3rd-level spells at level 4, and the tuning follows that curve
  rather than the published one.
- **One role and a set of searchable tags per creature** — Brute, Tank, Skirmisher, Archer,
  Controller, Spellcaster, Support, Boss; Undead, Beast, Dragon, Fiend, Forest, Cave, Urban, Boss.
- **Loot as a line of text**, exactly as a premade hero's kit is. That is what keeps *"no inventory"*
  true rather than sneaking an item model in behind a treasure table.
- **DM notes**, one or two sentences on behaviour, tactics or habitat — the field the reduced sheet
  already has.
- **Spellcasters capped at 2 cantrips and 4 levelled spells**, combat-facing rather than utility. An
  enemy has no use for Detect Magic; it has one fight to be interesting in.

The spec's *"fits on a single mobile phone screen"* is taken as **"fits on one screen without
scrolling"**, which is the useful half of it. There are no mobile layouts in this project
([ADR 0001](adr/0001-platform-and-hosting.md)) and there will not be.

### A stored link and an override diff — the spec's Library Linking section is overruled

The spec asks for a **campaign copy** of each creature, plus `libraryVersion`, `isModified`,
`modifiedFields[]`, and four features built on them: View Original, Compare Changes, Reset to Library
Defaults, and detecting a newer library version.

That is precisely the design [ADR 0006](adr/0006-premade-character-library.md) rejected for player
characters, and `modifiedFields[]` is the tell. A stored copy **cannot tell the DM's numbers from the
library's**, so it has to carry a hand-maintained list of which fields somebody touched — a diff
reconstructed after the fact because the diff was thrown away at the moment of copying, and therefore
a list that goes stale the first time a write forgets to append to it.

Milestone 4 already keeps that distinction in the data, so the same shape is used again: a **fourth
stored sheet kind** on `characters`, holding a bestiary key, a CR, and an optional override diff,
resolved on read by `resolveSheet`. Every feature the spec wanted falls out of it rather than being
built:

| The spec wants | Where it comes from |
| --- | --- |
| View Original | resolve the entry at its own CR with the overrides skipped |
| Compare Changes | the CR shift and the override object **are** the change |
| Reset to Library Defaults | return the CR, delete the override |
| `isModified`, `modifiedFields[]` | `overrides === undefined`, and its keys |
| Detect newer library versions | nothing to detect — the library ships with the code, so there is exactly one version and it is the deployed one |

The cost is the one ADR 0006 already accepted and is worth restating because it now applies to the
DM's content too: **editing the library edits live creatures.** Correcting a goblin's damage die
mid-campaign changes the goblins in every game that already has one. That is the feature and the
hazard in the same sentence, and the two corpora now have opposite storage strategies for the third
time — `lib/rules.ts` is copied onto a sheet and safe to edit, `lib/library/` and `lib/bestiary/` are
linked and are not.

### Shifting a creature's CR, and why that is a selection rather than an override

**The DM can move an assigned creature's CR up and down, and every number on the sheet scales with
it.** A Troll is Tier IV; a level 2 party wants one anyway; the DM drops it on the board and steps its
CR from 5 down to 2 rather than retuning eight fields by hand and getting one of them wrong. That is
the feature, and it is what makes ~130 entries behave like several hundred — every creature covers a
range of party levels instead of one.

**A shifted CR is a *selection*, stored beside the bestiary key, not a field in the override diff.**
This is [ADR 0006](adr/0006-premade-character-library.md)'s rule applied to the thing it was written
for: level, class, archetype and race are selections and are changed by changing them, and putting one
in the override object as well is two ways to say the same thing and two places for them to disagree.
CR is to a bestiary creature exactly what level is to a preset hero — the index the library is looked
up at — so it is stored the same way and shifting it is one number changing.

**Resolution becomes three layers, and none of them can move.**

```
bestiary entry  →  CR scale  →  the DM's overrides
```

- **The scale reads the entry's own baseline every time, never the previously scaled result.** So
  3 → 6 → 3 returns the original sheet byte for byte. Compounding is the bug this ordering exists to
  make impossible, and idempotence is the test that proves it: scaling to the entry's own CR must be
  the identity function.
- **Overrides come last, so a shift never undoes the DM's thumb on the scale.** Same reason an
  override survives a level-up. A boss-fight armour class somebody bumped stays bumped through a CR
  shift, and a shift after an override changes every number *except* the one that was pinned.

**Scaling is a benchmark table, not a multiplier.** `CR_BENCHMARKS` in `convex/lib/bestiary/` holds one
row per CR — 0, ⅛, ¼, ½, 1, 2, 3, 4, 5, 6 — carrying the target hit points, armour class, attack
bonus, damage per round, save DC and skill/initiative/perception bonus for a creature at that rating.
A percentage applied to the numbers already on the sheet is the obvious implementation and is wrong
twice over: it compounds across repeated shifts, and it cannot express that hit points roughly
quadruple from CR 1 to CR 6 while armour class moves by three. Ten readable rows of tunable content
can.

**The creature's offset from its own row is carried across, which is what stops scaling from
homogenising the bestiary.** A Tank sits above its row on armour class and below it on damage; a Brute
is the reverse. The scaler moves the creature between rows and **preserves its deviation**, so a
scaled-up Tank is still tanky and a scaled-down Brute is still glassy. Reading absolute values off the
target row instead would turn every CR 4 creature in the game into the same statline wearing a
different name, which is a worse outcome than not having the feature.

**Most of the sheet does not scale, and that is deliberate.** Name, creature type, size, alignment,
role, tags, speed, loot, DM notes, every special ability's text, and the *number* of attacks all stay
exactly as written. A CR 6 goblin is a goblin who has been lifting — it is not a goblin that has grown
a second head. Anything made of words is content; the ten or so numbers move.

**Damage scales inside the existing roll grammar.** `1d6+2` becomes `2d6+4`, not a bare number the
evaluator would have to special-case: the scaler's output has to satisfy `isValidRoll` from
`convex/lib/sheet.ts`, which is a constraint worth having rather than one to work around. It keeps a
scaled attack rollable through the one path everything else uses, and it means the die
count stays inside the cap that stops a client asking the physics engine for 99,999 dice.

**Clamped at both ends, to CR 0 and CR 6.** Pressing the button eight times does not produce a CR 14
creature, for the same reason `librarySheet` clamps a level to the library's range: the ceiling is
where the content stops being balanced against anything.

**The shift is shown, never silent.** The sheet and the picker both read `Owlbear · CR 3 → 5`, because
a DM who has forgotten they scaled something is a DM whose encounter maths is quietly wrong. *Reset to
library defaults* clears the shift and the override together, and *View Original* has to say which of
the two it is showing — the one genuine cost of a third layer is that "original" now means two things.

**Current hit points are reconciled in the same mutation, and this edge is not theoretical.** `maxHp`
is on the sheet and current hit points are in `characterVitals` ([ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md)), so
the obvious use — scaling a creature mid-session — would otherwise leave current above the new maximum
or leave a full-health creature reading `critical` the instant it was scaled up. **The fraction is
preserved rather than the number**, then put through `clampHp`: a creature on half its hit points is on
half of the new maximum, and an untouched one stays untouched.

**Scaling needs a library baseline, so it is offered on a bestiary-linked creature and not on a
hand-built one.** A hand-typed NPC sheet has no CR row to deviate from, and inventing one by
guessing at its rating would be a worse answer than the greyed-out control. The escape hatch is the
same one-way door ADR 0006 gave a preset hero: save it as a plain `npc` sheet and it stops scaling,
because it has stopped being linked.

**Only the DM ever sees any of this**, and it needs no new guard. The whole NPC sheet is refused to
players by `maySeeCharacter`, and the fact that a creature *was* scaled is itself a spoiler about how
hard the fight is meant to be — so it lives on a document that never reaches a player payload.

⚠️ **The benchmark table is content, and content drifts.** It gets the treatment the library already
gets, and the test is worth naming because it is cheap and catches the whole failure class: **every
entry, scaled to every CR in range, must still pass `sheetProblem`.** That is roughly 1,300 resolved
sheets checked in one loop, and it is what catches a table row that lifts an armour class past 40,
produces a fractional hit point total, or emits a damage expression the roll grammar refuses.

### The numbers a reduced sheet has nothing to derive from

The spec asks for skills (maximum four) and passive perception on every combat creature. A monster
has no Dexterity, no Wisdom and no level, so neither can be calculated — `skillBonus` and
`passivePerception` in `convex/lib/skills.ts` both need an ability score and a proficiency bonus.

So both are **stored as pre-calculated bonuses**, which is the same trade `initiativeBonus` made in
Milestone 3 and the same reasoning: that field is stored precisely because there is no Dexterity score
to derive it from, and this is the second and third instance rather than a new decision. The
consequence to be aware of is that a monster's skills are a **sparse map of skill → bonus**, not the
thirteen booleans a hero carries, so the two are not interchangeable and the sheet renders them
differently.

**Only the thirteen D&D Lite skills**, from `SKILL_KEYS`. No fourteenth, no monster-only skill, and no
second module — a creature with a talent the list has no name for gets an ability entry describing it
instead.

### Attacks and special abilities are `SheetEntry`s, and the caps are content rules

Maximum three attacks and maximum three special abilities, per the spec. Both are lists of the
existing `sheetEntryValidator` — the one shape shared across a hero's feats, a hero's spells and a
monster's actions, which is what gives the rolls milestone one roll path instead of a fork
([ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md)).

Those caps are enforced in the **bestiary's own test**, not in the schema. `MAX_SHEET_ENTRIES` is 40
and stays 40: three is a rule about what makes a *library entry* fast to run at the table, and a DM
hand-building a boss with five legendary actions is not doing anything wrong. A content rule checked
against the content is a content rule; the same rule in the schema is a refusal aimed at the wrong
person.

### Social NPCs are a variant, not a third shape

Occupation, three personality keywords, useful skills, what they know, and optional quest hooks.
Combat statistics **only if the NPC is expected to fight** — so the combat block is optional on the
entry rather than a separate `kind`. Milestone 3's whole discipline was that two sheet shapes cost
one shared entry type and no more; a third shape for the innkeeper would spend that saving.

The social sheet is **DM-only in its entirety**, and for a sharper reason than the combat one: what
the innkeeper knows *is* the plot. It goes through `maySeeCharacter` with everything else and needs no
new guard.

### The picker is DM-gated, and a list of creature names is a spoiler

The bestiary browser takes `dmCode` and re-verifies it server-side, like every DM-only query
(invariant 7). The reasoning is the one `scenes.list` already uses: the *library* is not a secret — a
Monster Manual is a book anyone can buy — but a list of what the DM has added to **this game** is
twelve prepared monsters' worth of spoiler, which Milestone 3 established when it refused to publish a
health band for every NPC in the game.

The picker needs to show 150 creatures with a CR, a role and a set of tags to filter on, and the
obvious way to do that is to import the corpus into the browser. It must not: **a DM-only index query
returns the summary** — id, name, CR, tier, role, tags — and the stat block is only ever resolved
server-side. Same reasoning as ADR 0006's bundle argument, and the same test holds it.

### TypeScript, not JSON — the spec's Output section is overruled

The spec says JSON is the single source of truth. The character library is **typed TypeScript
modules**, and the type checker is doing real work there: a missing field, a malformed roll spec or a
hit die that is not one of `6 | 8 | 10 | 12` fails `npm run lint` before anything runs. JSON gets none
of that and would need a parser plus a runtime validator to arrive back at the same place, having lost
editor completion on the way.

So the corpus is `convex/lib/bestiary/*.ts` behind a `types.ts`, exactly like `convex/lib/library/`,
and the spec's "generate Markdown from the JSON if required" becomes a script over the typed corpus if
anybody ever wants a printable list.

### Encounter metadata is stored and nothing consumes it yet

`recommendedPartyLevelMin`, `recommendedPartyLevelMax`, `encounterRole`, `difficultyTier`,
`challengeRating`, `environmentTags` — on the **library entry**, not on the character, because they
describe the template and not the goblin currently standing on square F7.

Stored now, unread until something wants them, which is the same bet Milestone 3 made on roll specs
and for the same reason: adding a field to 150 hand-written entries later is 150 edits, and writing it
while the entry is being written is free.

### No exclusion in requirements.md is lifted by this

Worth stating, because Milestone 4 lifted two and the discipline is what makes that meaningful. Every
field this milestone adds — creature type, size, alignment, role, CR, tier, tags, loot, DM notes — is
a **label on a DM-only sheet**, not a rule anything adjudicates. Loot is a line of text and not an
inventory. Nothing is rolled that Milestone 3's grammar did not already describe.

CR scaling is the one thing here that deserves a second look, because it *does* move numbers a player
rolls against. It is still not a rule: it is arithmetic the DM performs on the DM's own sheet, with a
visible before and after, and the app adjudicates nothing with it — a stepper that changes eight fields
at once is the same act as typing into eight fields, done in one motion. Compare the DM override in
Milestone 4, which has exactly this character and needed no amendment either.

No amendment to [requirements.md](requirements.md) is therefore needed, and the test for whether that
stays true is simple: the moment one of these fields changes a number a player rolls against **without
the DM asking it to**, it needs one.

**Deliberately not done here:**

- **No encounter generator.** The metadata exists so one is possible; nothing builds an encounter,
  budgets a fight or suggests a party-appropriate group.
- **No rolling a monster's attack.** The rolls milestone, along with everything else that touches dice.
- **No experience budget and no computed CR.** There are no experience points in D&D Lite. Note the
  line this draws against the feature above: the app **scales a creature to a CR the DM picks** and
  never **works out what CR a creature is**. The first is a lookup in a benchmark table; the second is
  the encounter-budget maths that CR exists for in 5e, and it is the DM's judgement.
- **No "scale to match my party" button.** It would have to read the party's levels out of the
  character library and decide what a fair fight is, which is an encounter generator with one control.
  The DM knows what their party can take; the stepper is for acting on that, not for replacing it.
- **No scaling of the number of attacks or the abilities themselves.** A CR 6 version of a CR 1
  creature does not acquire Multiattack, and a scaled Wolf does not lose Pack Tactics. Deciding which
  abilities a rating deserves is a rules engine, and the numbers are the part that actually needed
  automating.
- **No campaign-copy version tracking**, for the reasons above. There is one library version and it is
  the one that is deployed.
- **No player-facing bestiary.** This is not a compendium players browse; it is the DM's shelf.
- **No creature art and no token library.** A bestiary entry is numbers and words. Art still arrives
  by upload, and the token library is the game-editor milestone.
- **Nothing above CR 6 and nothing tuned past a level 5 party**, matching the character library's
  ceiling exactly.
- **No editable-in-app library.** Same call ADR 0006 made: content ships with the code, is reviewed
  with it, and a table would mean seeding, migrating and eventually an editor nobody asked for.

⚠️ **The one thing that decides what this milestone costs.** It is cheap if resolution stays
**synchronous and pure** — a fourth branch in `resolveSheet`, a fourth member on
`storedSheetValidator`, and every existing read path untouched, which is the whole reason Milestone 4
was cheap. It is expensive the moment the bestiary becomes a Convex table, because then `resolveSheet`
needs a `ctx`, and both of ADR 0005's choke points plus nine call sites become async. Widening the
stored-sheet union is additive and safe; that is not true of every union in this schema — the DM-tooling milestone's
third `layer` member is the counter-example.

**Acceptance:** the DM filters the bestiary to Tier III, adds an Owlbear, and has a creature on the
board with an armour class, hit points, an initiative bonus, two attacks and Keen Smell without typing
a number. Dropping that Owlbear's hit points for tonight's fight leaves the library entry untouched and
every other game's Owlbear unchanged, and clearing the override puts the library's number back.

**The DM steps a Tier IV Troll down to CR 2 and puts it in front of a level 2 party**, and its hit
points, armour class, attack bonus, damage, initiative and skill bonuses all move together while its
name, its speed, its Regeneration and its two claw attacks do not. Stepping it back to CR 5 returns the
sheet it started with, exactly — not approximately. Doing that to a Troll already on half its hit points
leaves it on half of the new maximum rather than dead or fully healed. An armour class the DM had
overridden survives both shifts unchanged.

A player inspecting network traffic sees no bestiary entry, no list of creature names, no exact NPC hit
point and no sign that anything was scaled — Milestone 3's assertions, extended to the new queries with
the same positive controls. A social NPC has no combat block and offers no control to invent one, and a
hand-built NPC offers no CR stepper.

---

## ✅ Milestone 6 — The screen, and what a sheet entry is

**Done.** The decisions are recorded in
[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md). Six things it settled that the section
below planned differently or did not plan at all, so read them together:

- **The bestiary needed no content edits at all.** The section below says "every attack and ability
  across the 129 entries", and that turned out to be work the corpus had already done: it separates
  `attacks` from `abilities`, so an attack is a `weapon`, an ability with a roll is an `action` and
  one without is a `passive`, all read off the structure in `lib/resolve.ts`. 159 hand edits avoided,
  and with them 159 chances to disagree.
- **A creature's to-hit is composed from its one `attackBonus`, after the DM's overrides are
  merged** — and that ordering is not a detail. `resolveBestiary` built its actions *before* calling
  `withCreatureOverrides`, which patches `attackBonus` and leaves `actions` alone, so composing in
  the original order gives a creature whose sheet reads +12 and whose every weapon rolls +4. Both
  come from the same payload, so nothing on screen looks wrong. Found by reading the plan
  adversarially before any code existed.
- **The category is required on content and optional in the database**, and that asymmetry is what
  made the bulk work tractable. The schema push forces optional; content has no history, so
  requiring it there turned "recategorise everything" into a list `npm run lint` prints. It printed
  763 entries and the job was done when the list was empty.
- **`categoryOf`'s default is derived, not constant**, and a constant would have made every
  hand-built sheet in every existing game unsaveable on its next edit — a failure that first appears
  to a DM mid-session. See invariant 9 in [CLAUDE.md](../CLAUDE.md) and the ADR.
- **A to-hit is validated as a d20 roll**, which the shared grammar does not say. The field was
  documented as `1d20+STR+PROF` and checked only against the grammar every damage expression shares,
  so `2d6+STR` saved cleanly. A contract stated in a comment and enforced nowhere, found by the
  agent writing the tests rather than the one writing the code.
- **`forceMount` does not hide a Radix tab.** The plan asserted an elaborate CSS specificity trap
  that does not exist; what actually happens is that `forceMount` makes `present` always true, so
  `hidden` is never applied and the panel simply stays on screen. The character sheet rendered below
  the feed on every tab, with lint clean and 1,082 tests green. **Found by opening the app in a
  browser**, which has now been true of every milestone.

**Acceptance, as met:** the map canvas measures exactly its pane at 1280×800, 1920×1080 and
2560×1440, follows the divider live, and the page does not scroll. The divider holds its position
across a reload, clamps at 576 px and at the window less 480. Every seat appears bottom-right with
its character's name under a coloured initial derived from `nameKeyFor`. A fighter's sheet lists
thirteen skills alphabetically and splits its feats under Weapons, Actions and Passives, with the
longsword showing `1d20+STR+PROF` and `1d8+STR+2` separately and no to-hit left in its prose.
Clicking a token selects it and does not open the hit-point editor; clicking its health bar opens
the editor and does not move the token. `npm run test:smoke` passes 109/109 against the real dev
deployment, including an entry sent with neither new field coming back with neither, and its
positive control.

**The original plan follows.**

**Inserted after the first look at the deployed app**, and it is two jobs in one milestone because
both are prerequisites for the dice rather than polish that could follow them.

The tell that these are not cosmetics: **the game feed has nowhere to live, and the roll path cannot
tell a sword from a prayer.** Build the feed into a panel of its own and the layout change moves it
afterwards. Let the evaluator land against today's `SheetEntry` and it learns a shape where a
greatsword has one roll, when a weapon needs two — a to-hit *and* a damage — and where nothing
distinguishes "casts Cure Wounds" from "attacks with their Greatsword" from "uses Divine Smite",
which is exactly the wording the roll announcement has to produce. Both are cheap now and a rewrite
later.

### The screen

One shell, replacing the current stack of overlay panels.

- **A top header bar**: game title, *Run by …*, the join code, the signed-in display name, the
  character that seat is playing, and a profile icon.
- **A left panel holding the map**, its zoom and fit controls, and — when it lands in the tools
  milestone — the DM's marker and ruler palette. **The map fills the panel**, which is what the
  current fixed-aspect board does not do.
- **A right tabbed panel**: Game feed · Character sheet · DM tools (itself several tabs) · settings
  and whatever else earns a tab. The existing `MapSetupOverlay` tabs move here wholesale rather than
  being rebuilt — Map, Sheets and NPCs become DM-tools tabs.
- **A vertical resizer** between the two, remembered per game in local storage. The camera is already
  a view rather than shared state and is stored the same way ([ADR 0004](adr/0004-board-authorisation-and-layers.md));
  a pane width is the same kind of fact and gets the same treatment, so it costs no database traffic.
- **A bottom-right roster**: a profile icon per seat including the DM, with the character's name
  underneath and the real display name on hover. That inversion is deliberate — at the table you
  address the character and need the person's name only occasionally.

**Profile icons come from the display name, not from an upload.** `TokenCoin` already draws a tinted
coin with initials when a token has no art, so a seat's icon is that same function of `nameKey` — a
colour and one or two letters, deterministic, identical on every screen, costing nothing against the
1 GB storage ceiling (invariant 6) and needing no upload UI, no cropping and no moderation. Real
uploaded pictures are a library feature and belong with the other upload-backed libraries in the
game-editor milestone, where the orphaned-blob sweeper already has to exist.

One board behaviour changes with it: **the health-bar editor stops appearing on token select and
appears when the floating health bar itself is clicked.** Selecting a token to move it is not asking
to edit its hit points, and the controls currently cover the squares you are trying to drag to.

### What a sheet entry is

`SheetEntry` is the one shape shared by a hero's feats, a hero's spells and a monster's actions —
the saving [ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md) made so that two sheet
variants did not become two of everything. It grows **one discriminator and one field**, and the
milestone's whole risk is that this is that shared type.

- **A category**: `weapon` | `action` | `passive`.
  - A **weapon** is a sword or an axe: a **to-hit roll paired with a damage roll**. Two rolls, which
    is why `roll: string | null` cannot express one.
  - An **action** is Divine Smite: something that rolls dice when you use it. One roll.
  - A **passive** is Lay on Hands or Giant's Might: you declare it and do it. No roll.
- **A second roll on a weapon**, so a to-hit and a damage are separate targets rather than one string
  a parser has to split.

Then the content, which is the bulk of it: **recategorise every entry in `convex/lib/rules.ts` (24
spells, 16 feats, 12 NPC actions), every entry across the 72 sheets in `convex/lib/library/`, and
every attack and ability across the 129 entries in `convex/lib/bestiary/`.** The bestiary is already
half-done — it separates `attacks` from `abilities` and its attacks already carry a damage roll and a
per-creature attack bonus, so `weapon` is close to the shape it has. A hero's greatsword is the one
that genuinely gains a field.

The sheet also stops grouping skills by ability. **Thirteen skills listed alphabetically, each
annotated with its ability — `Athletics (STR)`.** The grouping was there so a player could find "what
do I roll for sneaking" by scanning the Dexterity block; alphabetical with the ability in brackets
answers the same question without making the reader know the grouping first.

⚠️ **The field-by-field rebuild trap, for the fourth time.** `normaliseEntry`, `entriesProblem` and
every projection that touches a `SheetEntry` rebuild it field by field, and this codebase has twice
shipped a field added to a validator and not added to the rebuild — silently discarded on every
write, invisible to the local suite, found by `npm run test:smoke`. Two new fields on the most widely
shared type in the schema is the largest exposure that trap has had. The category must also be
**optional** in the schema, because the `characters` table already holds entries without it, and read
through one accessor that defaults it.

**Deliberately not done here:** no rolling — the second roll is stored and validated and nothing
evaluates it, which is the same split the roll grammar itself took a milestone before anything could
parse one. No marker or ruler tools, only the panel they will live in. No uploaded profile pictures.
No fog of war and no layer rework. No feed — the *tab* exists and is empty until the next milestone
fills it.

**Acceptance:** the board fills its panel at any window size, the resizer holds its position across a
reload, and every seat appears bottom-right with its character's name under a coloured initial that
is the same colour on every screen. A character sheet lists thirteen skills alphabetically and splits
its entries under Weapons, Actions and Passives, with a greatsword showing a to-hit and a damage
separately. No stat block or entry lost a field on save — asserted by `npm run test:smoke` against
the real deployment, because that is the only thing that has ever caught this.

**Amend [requirements.md](requirements.md)** on the way: that file describes the character sheet and
DM panels as *slide-out* panels, and they become tabs in a persistent right-hand panel. Recorded as
an amendment rather than an edit, like the two before it.

---

## Milestone 7 — Seats, sheets and control

**Inserted after reviewing the deployed shell**, and it is a correction rather than a feature: the
layout is right and the model underneath it is not. Milestone 6 moved every panel into one screen
and, in doing so, made the shell state what it thinks the people at the table are — and what it
states is wrong in three places. The DM is offered a character to pick up. The DM's route to a
monster is a slide-out drawer three clicks inside a tab, which is the one panel
[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md) missed. And the sheet panel can show
exactly one sheet, the seat's own, so selecting anything on the board changes nothing beside it.

**Why it goes before the dice rather than after.** The roll path's first question is *who is
rolling, and off which sheet* — the announcement in the next milestone is literally a sentence built
from a character and an entry. Every fixture the feed gets written against comes from here: which
tab a roll was clicked in, whose sheet was on screen, whether the clicker was allowed to be looking
at it. Land the feed first and each of those is a thing to unpick afterwards, in the one file where
three milestones' worth of behaviour meets. The same argument the three insertions before it made,
and the cheapest instance of it so far: nothing here is content, and nothing here is dice.

### The vocabulary, settled

Every word below has been used loosely somewhere in the codebase, and the looseness is the bug. This
table is the reference; where the code disagrees with it, the code is what changes.

| Word | What it is | What it is not |
| --- | --- | --- |
| **Account** | a person using the site | not a thing that exists in v1 — [ADR 0002](adr/0002-defer-user-accounts.md) still holds, and a browser plus a display name is the whole of it. The word is reserved so that the day accounts land, nothing else has to be renamed. |
| **Player** | a person playing the game as a non-DM. Zero to many per game | not a character, and not a token |
| **DM** | the person running the game. Exactly one per game | not a player, and **does not play a character** |
| **Character** | one player character in one game, assigned to one player | not a sheet template, and not owned by an identity ([ADR 0002](adr/0002-defer-user-accounts.md)) |
| **NPC** | one non-combat or ally creature in one game. DM only | not a character, and not something a player can be assigned |
| **Monster** | one hostile creature in one game. DM only | as above |
| **Token** | a coin on the board. May be bound to a character, an NPC, a monster, or to nothing at all | **not the creature.** A token is where something stands; the sheet is what it is |

Three relations, and every rule in this milestone is one of them read out loud:

- **A character is assigned to exactly one player**, and the DM assigns it. The player and the DM
  may edit it; the DM controls its level and its lock.
- **A token is bound to at most one character, NPC or monster** — the binding is optional in both
  directions, and a token bound to nothing is a perfectly good door marker.
- **A token is controlled by a set of seats.** The DM controls all of them. By default a player
  controls the token bound to their own character and nothing else. The DM may grant control of any
  token to one or many players.

### The tab strip, split by role

**A player sees a *Character* tab. The DM sees a *Sheets* tab instead.** Not as well — instead. The
DM does not play a character, so a Character tab is a tab offering them a thing they cannot have,
which is where today's *Pick a character* button in the DM's sheet panel came from.

**Player — the Character tab.**

- By default, their assigned character's sheet. This is what the tab already does.
- Select a token they control that is bound to a character, an NPC or a monster, and **that**
  creature's sheet appears here instead.
- Deselect and it returns to their own character. There is no third state and no history.
- If they have no character assigned yet, the tab says so and points at the Table tab, which is
  where an unclaimed character is picked up.

**DM — the Sheets tab.** Every sheet in the game, in one place.

- A **selector at the top**, grouped into Characters, NPCs and Monsters. Choosing a row shows that
  sheet **and selects its token on the board**, so the panel and the map agree about what is being
  talked about.
- **Selecting a token on the board shows its bound sheet here**, which is the same relation read the
  other way. Both directions write the one piece of selection state; neither is a special case.
- **All three creation routes live here**: a new character, a new NPC or monster off the bestiary
  shelf, and a hand-built one. Today the shelf and the hand-built dialog are inside *DM tools →
  NPCs*, which is a tab labelled for the DM's plumbing holding the DM's most-used act.
- A token bound to nothing selects nothing, and the panel says which token is selected and that it
  carries no sheet — rather than silently keeping the last one, which is how a DM ends up adjusting
  a goblin they are no longer looking at.

**What that costs elsewhere, and it is mostly deletion.** *DM tools* loses its **Sheets** and
**NPCs** sub-tabs entirely and keeps Map; `DmSheetsPanel` and `DmNpcPanel` were always two views of
one list, each with a paragraph explaining why the other existed, and the Sheets tab's selector is
the list both of them wanted to be — so the hit points those panels show move onto the selector rows
rather than into a third place. `CharacterSheetDrawer` goes with them. It is the last slide-out in
the app and the one ADR 0008 did not notice it had left behind.

### Selection is shell state, and it runs in both directions

`useTokenSelection` lives inside `Board` today, which is exactly right for the only thing selection
did in Milestone 2 — decide what the arrow keys move — and cannot express any rule above. It moves
up to `GameShell`, where both panes can see it: the map writes it on a click, the Sheets selector
writes it on a choice, and the sheet panel reads it.

⚠️ **`MapPane` and `RightPane` are both `memo`'d, and the memo is load-bearing** — the divider's
width is `GameShell` state and a drag sets it sixty times a second, which is why neither pane reads
it. Selection is the second piece of state to live up there and must not defeat that: **pass the
selected token *id* and stable callbacks, never a selection object**, or every frame of a divider
drag reconciles the whole board and the whole panel again. A fresh object per render is the entire
failure, and it will look like a performance regression with no obvious cause.

**One function answers "whose sheet is on screen", and it is the only place the question is asked.**
Given the selection, this seat's character and whether this browser holds the DM code, it returns a
character id or nothing. Three call sites reading the selection and each deciding for itself is how
the DM's panel and the player's panel drift apart, and the next milestone adds a fourth reader in
the announcement.

### Control, moved forward from the DM-tooling milestone

**The many-to-many token control bullet moves here**, out of the milestone below. It was DM polish
when control only decided who could drag a coin. It is not polish now: **control is what decides
which sheet a player is shown**, which makes it a secrecy question, and a secrecy question belongs
with the choke points rather than three tabs away from them.

The shape is the one that milestone already worked out, unchanged:

- An explicit **controllers relation keyed on seats**, not on characters. Granting the party a pet
  grants it to people, and a character is claimed by exactly one seat anyway.
- Plus a **derived default**, so the common case needs no DM action: the seat holding the token's
  character controls it. **Zero controllers and no claim means DM-only**, which is the correction
  Milestone 2 shipped after the first session.
- Keyed on `players` ids, which survive a cleared browser: `players.join` is idempotent on
  `nameKey` ([ADR 0003](adr/0003-player-identity-without-accounts.md)), so a grant does not
  evaporate when somebody's laptop restarts.
- `canMove` on the board is the client's copy and `requireMovableToken` is the enforcement, as
  before. The affordance and the refusal read the same relation; only one of them is a permission.

### Control grants sight, and that is the only new door in the fence

A DM who hands the party a pet has decided the party may read the pet's sheet — so
`maySeeCharacter` gains a second door: **this seat controls a token bound to this character.**

**Composed with the existing rule, not substituted for it.** The character must *also* be one this
caller can already see on the board, which is `visibleCharacterIds` in `lib/board.ts` — the same
composition `characters.vitals` already performs for health bands. Two consequences worth stating
before they are discovered:

- **Sight follows the token.** A grant on a DM-layer token reveals nothing, because the token itself
  is absent from that player's payload. Move it to the player layer and the sheet arrives with it.
- **Nothing ungranted moves an inch.** Every monster the DM has not handed over is refused exactly
  as it is today, by the same predicate in the same module.

⚠️ **`maySeeCharacter(character, isDm)` gains a seat argument, and it is a choke-point signature
change** — invariant 8's table, `leakGuard.test.ts` and the positive controls in `characters.test.ts`
all name that function. Widen it deliberately: a `maySeeCharacter` that takes an optional seat and
treats *absent* as "no grants" is fail-closed and reads correctly at the call sites that have no
seat to give it. `characters.sheet` moves from `holder._id === playerId` to **claim or control**, and
the test that a player cannot read another player's hero has to keep passing on the way through.

The residual hole is the accepted one and is not widened: a `playerId` is routing and not identity
(invariant 7), so a player with the network tab open could pass another seat's id and read a sheet
granted to *that* seat. It buys them a creature the DM has already published to the table. Closing it
is accounts, and [ADR 0002](adr/0002-defer-user-accounts.md) has now declined those three times.

### Who creates a character, and the reserved ones

**Creating a character becomes the DM's**, for all three kinds. Today `characters.create` lets any
seat add a player character — the lobby needed that in Milestone 1, when there was no DM panel to
add one from — and it is what makes the character list something players can grow sideways. The DM
creates; `requireDm` on every path.

**Players claim, and the DM assigns.** A player joining picks up an unclaimed character from the
Table tab, which is what that tab is already for. The DM may **unassign** a character from a seat
and hand it to another, which `characters.assign` mostly already does. Nothing about ADR 0002
changes: the pointer still runs seat → character, so deleting every seat still leaves the characters
intact.

**A character may be *reserved*, and reserved means hidden rather than greyed out.** The use case is
the one that decides the design: a DM builds next month's new player a character and does not want
tonight's party reading it. A disabled row in the list still publishes a name, and a name is the
spoiler — so a reserved character is **absent from a player's `characters.list` payload entirely**,
which makes it a leaked *row* of exactly the shape invariant 8 is about, and it goes through
`lib/characters.ts` with everything else. Unreserve it when the player arrives, or assign it to their
seat directly; either way it appears to exactly one more person than it did before.

⚠️ **Reserved-ness is a second reason to withhold a row, and it must be a second predicate.** Do not
fold it into `isMonsterSheet` — that function is an allow-list answering exactly one question, and
invariant 9 exists because the last formulation of that question failed open. Two predicates
composed at the call site; not one predicate that means two things.

⚠️ **And do not fold it into `maySeeCharacter` either, for a reason that is easy to verify and easy
to miss.** `characters.assign` and `characters.claim` both call `requireVisibleCharacter(…, false)`
with `isDm` hard-coded false, deliberately, so that holding the DM code cannot make a monster a
playable hero. A reserved character that is invisible *through that function* is therefore a
character **the DM cannot assign** — which is the one thing reserving it was for. Reserved filters
the player-facing list; the claim path refuses it separately, and the DM's assign path does not
consult it at all.

### Three groups, and how a creature knows which one it is in

The selector needs Characters, NPCs and Monsters, and the schema has four sheet *kinds* that do not
map onto them: `pc` and `preset` are characters, and `npc` and `bestiary` are both "DM creature".

**A linked creature derives its group and a hand-built one stores it**, which is the same split
Milestones 4 and 5 already made about every other number on those sheets. A bestiary-linked creature
is grouped by the corpus category it is linked to — `social` is an NPC, `monster` and `enemy` are
monsters — resolved in `lib/resolve.ts`, which is one of the three modules allowed to read the
corpus at all. A hand-built sheet has nothing to derive from, so the dialog asks and the answer is
stored, defaulting to NPC for the rows already in the table. `publicCharacterValidator` carries the
resolved group; the client never computes it.

**Both values are DM-only, so a wrong answer is a misfiled row and never a leak** — which is what
makes this a display discriminator rather than a security one, and why it is safe for it to have a
default at all. Compare `isMonsterSheet`, whose default is fail-closed because getting it wrong
publishes a dragon.

### The rename sweep, and the one name that must not change

`DmNpcPanel`, `NpcCreateDialog`, `NpcSheetForm`, `NpcSheetFields`, "NPCs" in half the copy — the
codebase uses *NPC* for every creature the DM runs, which is precisely the confusion this milestone
is about. Component names and user-facing copy get swept to the vocabulary above.

⚠️ **The stored `kind: 'npc'` discriminator does not change**, and neither does
`npcSheetValidator`'s member name in the union. That string is in every DM creature document in
every game; renaming it is a data migration dressed up as a tidy-up, and the schema push that
introduced this trap has already caught this project four times. Rename what is displayed; leave what
is stored.

**Deliberately not done here:**

- **No rolling.** Still the next milestone, and this one exists so that it can be written against a
  settled model.
- **No layers rework and no fog of war** — still the DM-tooling milestone. Control and layers
  interact (a grant on a DM-layer token is inert), and that interaction is noted above rather than
  built around.
- **No accounts.** The word is defined in the table above and nothing implements it.
- **No player-visible sheets of other players' heroes.** A player sees their own, plus anything they
  have been granted. Reading the fighter's spell list over their shoulder is not a feature anybody
  has asked for.
- **No per-entry or per-field sharing.** A sheet is granted whole or not at all.
- **No DM character.** If the person running the game also wants to play one, they are running two
  seats, which the app already supports and which nothing here needs to know about.

**Acceptance:** the DM's panel has a Sheets tab and no Character tab, and a player's has the
reverse. The DM picks a monster from the selector and its token highlights on the map; the DM clicks
a different token and the selector follows it. A player selects their own token and sees their own
sheet; the DM grants them the party's wolf, the player selects the wolf's token and sees the wolf's
sheet, clicks the map and is back on their own. A player who has **not** been granted the wolf sees
no wolf sheet in any payload — asserted the way every secret in this project is, by a test that scans
a real player payload and has a positive control beside it. A character the DM has marked reserved
appears in no player's character list at all. Creating a character, an NPC and a monster are three
buttons in one tab, and no player has any of them.

**Amend [requirements.md](requirements.md)** on the way, in the amendments section rather than by
editing the text, as the three amendments before it were:

- *Player mode* says a player "can only interact with and move their assigned character token" — now
  their own plus any token the DM has granted them.
- *Accounts and games* has a logged-in user creating characters. In v1 the DM creates them and
  players claim them, which is a further consequence of ADR 0002 rather than a new decision.
- The *DM panel* tab list describes tabs that no longer exist in that arrangement.

---

## Milestone 8 — Rolls, feed and dice

The bit that makes it feel like a game.

- `feed` table + game feed panel, filling the tab the previous milestone left empty.
- Click a sheet item → roll pushed to the feed. **Alt-click** → the item's text description instead.
- Advantage / disadvantage toggle, for both sheet rolls and ad-hoc dice.
- Ad-hoc dice roller in the game tools.
- 3D dice via `@3d-dice/dice-box`, visible to everyone, with the roller's token shown on screen.
- d20 crit handling: screen shake + red alarm on a 1, celebration + fireworks on a 20.
- **A weapon rolls twice** — a to-hit and a damage — which is the shape the previous milestone put on
  `SheetEntry` for exactly this reason. An action rolls once. A passive is declared and rolls nothing,
  so clicking one announces it and pushes to the feed without any dice.

### The roll announcement over the map, and why it is not decoration

**A floating glowing line naming who rolled and what they did, then the result under it a beat later.**
`Chadius casts Cure Wounds` · `Chadius attacks with their Greatsword` · `Chadius uses Divine Smite` ·
`Chadius performs a STR check` · `Chadius performs a STR saving throw` · `Chadius performs an
Athletics roll`.

This exists because of a consequence of the layout milestone that is easy to miss: **the feed and the
character sheet now share one panel**, so the person who clicked the roll is looking at their sheet and
cannot see the feed entry they just created. The milestone before this one sharpened that rather than
softening it — the DM's Sheets tab is in the same panel and now shows whichever creature is selected,
so the DM rolling a monster's attack is the case with the most on screen and the least confirmation. Without the announcement, the one player who most needs
confirmation that their click landed is the only player who gets none. It goes over the map, where
everybody is already looking, and it plays for every screen rather than only the roller's.

The wording is generated from the entry's **category**, which is why that field had to exist first: a
`weapon` announces "attacks with their", an `action` "uses", a spell "casts", and an ability check or
a saving throw has its own phrasing with no entry behind it at all. One category, one sentence
template, no per-entry copy to write.

⚠️ **Known risk:** `dice-box` loads its physics WASM and dice assets at runtime, which interacts
badly with a non-root `base` path. Budget time to configure its asset path against
`/coffee-code-n-kobolds/`. This will not "just work".

**Acceptance:** a player clicks a saving throw; everyone sees the same 3D dice roll, the same floating
announcement, and the same result in the feed. The roller sees the announcement **without switching
tabs away from their sheet**. Rolling a 1 and a 20 each trigger their effect on every screen. Clicking
a passive announces it and adds a feed line with no dice.

### 🎲 This is the first playable session

With Milestones 1–8 you can run a real game: a map with tokens, characters built by choosing rather
than by filling in a form, monsters picked off a shelf rather than typed in, sheets that roll, shared
dice, and a feed. The DM works around the missing tooling manually. **Consider actually playing here
before building more** — a session will tell you what's genuinely missing faster than guessing.

---

## Milestone 9 — DM tooling

The four bold items at the end were **requested after playing Milestone 2**. The rest was always
here — except the token-control bullet, which **moved forward into the seats-and-sheets milestone**
once control stopped being about dragging a coin and started deciding which sheets a player is sent.

- DM panel: the token list, the modal image library and the music selector. **Most of this bullet has
  already been built by the three milestones that grew into it**, and what is left is smaller than it
  reads. Milestone 3 left `Tabs` as a seam rather than a panel; Milestone 5 filled the NPC tab with the
  bestiary picker; the layout milestone moved the whole thing into the right-hand panel and split it
  into DM-tools tabs; the seats-and-sheets milestone then took the sheets and the creatures back out
  of it into a tab of their own. So this is three more tabs inside a panel that exists, not a panel.
- DM can click any sheet item to roll on a player's behalf.
- Scene switching — changes the visible board for everyone in the game.
- Modal image pop-up: DM opens an image for the whole group, and closes it for everyone.
- DM can move any token on any layer, including player tokens. The mutation already allows this, and
  the seats-and-sheets milestone gave the DM a selector that reaches a creature without finding its
  coin first; what is still missing is a way to reach a token bound to nothing on a layer that is not
  being shown.
- **Layers, done properly — Background, Player, GM, bottom to top.** They behave like an image
  editor's: an object belongs to one layer, and you see through the upper layers to what is below.
  Players see Background and Player, and may only interact with their own tokens on Player. The GM
  toggles between the player's two-layer view and all three, and sets an *active* layer to place
  onto — including dropping a token on Background, where players see it and can never interact with
  it. GM is the existing `'dm'` layer under Roll20's name for it; the new one is Background. **That
  needs a third member on the `layer` union in `convex/schema.ts`**, which today allows
  `'player' | 'dm'` and carries a comment saying no token lives on the background layer: the comment
  is as wrong as the union and both change together. Then every read path through
  `convex/lib/board.ts` needs revisiting, because `maySee` is a two-way test and a third layer is not
  something it extends to by itself.
- ~~**Many-to-many token control.**~~ **Moved forward into the seats-and-sheets milestone**, which
  carries the shape it had here unchanged: an explicit controllers relation keyed on seats, plus a
  derived default so the common case needs no DM action. What moved it was not urgency but category —
  once a grant decides which *sheets* a player is sent, it is a question for the choke points in
  `lib/characters.ts` rather than a control on a DM panel, and building it here would have meant
  writing that decision twice.
- **Interactive grid calibration.** Drag handles on the grid's corners and edges to scale it on X and
  Y like a box in an image editor, and click-drag the grid itself to shift the offset. The numeric
  fields stay as the fallback for a map whose square size is actually known. Self-contained canvas
  work, no schema change.
- **Fog of war**, a layer between Player and GM: the GM draws and erases rectangles to black out
  parts of the map. The hiding is **real for tokens, polite for the map.** A token standing inside a
  fogged rectangle is filtered out server-side in `convex/lib/board.ts` — the same choke point the DM
  layer already goes through — so a hidden monster is genuinely absent from a player's payload. The
  map image itself stays fully downloaded, so a determined player could read the unfogged floor plan
  out of devtools. Hiding that too means tiling or masking the map server-side, which multiplies
  storage against the 1 GB ceiling ([ADR 0001](adr/0001-platform-and-hosting.md)) and complicates
  both zoom and calibration; the monsters were the secret, not the floor plan. Note also that fog of
  war appears **nowhere in [requirements.md](requirements.md)** — a deliberate scope addition, not a
  requirement being met.

**Acceptance:** the DM switches scenes and every client follows. The DM drags an NPC from the GM
layer to the Player layer and it appears for players at that moment — not before. A token placed on
Background is visible to a player and cannot be picked up by them. A pet granted to the party can be
moved by two different players; the monster beside it can be moved by neither. A player whose view of
a corridor is fogged has no position rows for what is standing in it.

---

## Milestone 10 — Tools and polish

- Ruler tool, measuring in squares (1 square = 5 feet).
- Multi-colour marker + eraser on the board. **DM only** — players must not have this.
- Background music player, synced play state across the group.
- Initiative tracker.

**Acceptance:** the DM measures a distance and draws on the map; players see both. A player has no
marker tool available.

---

## Milestone 11 — Game editor and admin

- Libraries: maps/boards, modal images, tokens and music. **NPC sheets are no longer on this list** —
  the bestiary moved forward to Milestone 5, because a monster's sheet feeds the roll path as much as a
  hero's does. What is left here is the upload-backed libraries.
- Uploads for all of the above.
- **Downscale images on upload.** The Convex free tier gives 1 GB of file storage total, and music
  is the thing most likely to eat it. See [ADR 0001](adr/0001-platform-and-hosting.md).
- **Orphaned-blob sweeper.** `_storage` rows with no referencing scene, token or library entry, left
  behind by uploads that were refused or abandoned — a refusing mutation cannot delete its own blob,
  so the residue needs a pass that runs outside it. See
  [ADR 0004](adr/0004-board-authorisation-and-layers.md).
- Admin view: delete old games. Small, because there are no user accounts to manage
  ([ADR 0002](adr/0002-defer-user-accounts.md)).

**Acceptance:** upload a 4 MB map photo and confirm what actually lands in Convex storage is
substantially smaller.

---

## Deliberately not planned

- **User accounts.** [ADR 0002](adr/0002-defer-user-accounts.md), reconsidered after Milestone 2's
  first session and declined again, and reconsidered a third time in Milestone 7 when a grant of
  control began deciding which sheets a player is sent: what accounts would buy is enforcement
  against an adversary, and the players are colleagues. The word *account* is now defined in that
  milestone's vocabulary table precisely so the concept has a name before it has an implementation.
  If added later, it supersedes that ADR rather than editing it.
- **Anything that closes a hole only devtools can reach.** The threat model is written down in
  CLAUDE.md. Filtering secrets out of a payload stays absolute because it is free; proving who is
  asking is out of scope.
- **Mobile layouts, SSR, SEO.** Desktop browsers only.
- **Anything still in the excluded rules list** in [requirements.md](requirements.md). Milestone 4
  lifted two of those exclusions — racial abilities, and skills from the class rather than from a
  background — and did it by **amending** that file rather than editing its lists, which is the only
  route by which another one ever moves. Backgrounds, inventory, multiclassing, experience points and
  movement-detriment status effects are all still out. See
  [ADR 0006](adr/0006-premade-character-library.md). Milestone 5 lifts **none** of them: a creature's
  loot is a line of text and its CR is a label, which is why the bestiary needs no amendment at all.
- **An encounter generator, and CR arithmetic of any kind.** Milestone 5 stores the metadata one would
  need and deliberately reads none of it. Budgeting a fight is the DM's judgement, and a generator is
  the first step towards the rules engine D&D Lite exists to not be.

## Open questions

Two of the original three were answered by Milestone 3 and recorded in
[ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md); Milestone 4 gave the first of them a
second and opposite half, and raised two of its own. Milestone 5 is planned against the second answer
rather than reopening it, and raises two more. Milestone 7 answers none of them and raises four,
which is what a milestone that settles a vocabulary does — most of what it decides was previously
not disagreed about so much as never asked.

- ~~How much of the D&D Lite spell and feat lists to hard-code versus make editable.~~ **Both, and
  now the answer has two halves that behave differently.** The catalogue in `convex/lib/rules.ts` is
  hard-coded and a character stores a *copy* of the entry it picked, so retiring one never rewrites an
  existing sheet. The premade library in `convex/lib/library/` is hard-coded and a character stores a
  *link*, so editing one changes every character built from it. Both are right for what they are — a
  catalogue entry is a choice somebody made, a library sheet is a template a level indexes into — and
  the difference is worth knowing before editing either file
  ([ADR 0006](adr/0006-premade-character-library.md)).
- ~~Whether NPC sheets need the full character schema or a reduced one.~~ **Reduced**: armour class,
  hit points, an initiative bonus and a list of actions. The cost of two shapes is contained by
  sharing one `SheetEntry` type across both, which is where the duplication would otherwise have
  been. `initiativeBonus` is stored rather than derived precisely because there is no Dexterity score
  to derive it from. Milestone 4 did not disturb this: the library is player characters only, and a
  monster is still hand-built. **Milestone 5 tests the answer** rather than reopening it — a bestiary
  entry adds a stored skill bonus and a stored passive perception, both for exactly the reason
  `initiativeBonus` is stored, so the reduction now costs three fields instead of one. Three is still
  cheaper than six ability scores that no monster's player would ever roll.
- **Whether a DM's tweak to a creature should outlive the game it was made in.** An override is scoped
  to one character in one game, so the Ogre somebody made tougher last month has to be made tougher
  again. Fixing that means either a per-DM saved variant — with no accounts to hang it off
  ([ADR 0002](adr/0002-defer-user-accounts.md)) — or copying a game's creatures into the next one,
  which needs a game-to-game import nothing else wants yet.
- **Whether 110–150 hand-written creatures is the right size**, or whether 40 good ones and a
  reskinning habit would run a better table. The character library's 72 sheets are a fixed set the
  rules demand; a bestiary's size is a judgement about how often a DM wants something new, and nobody
  has run enough sessions to have an opinion. **CR scaling pushes the answer down rather than up** —
  one Owlbear that covers CR 1 to CR 6 is worth more at the table than six Owlbears, so the number to
  aim at is however many creatures are genuinely *different*, and the spec's targets may be measuring
  the wrong thing.
- **Whether the benchmark table should be per-role rather than global.** Scaling preserves a creature's
  offset from its own CR row, which keeps a Tank tanky — but it assumes every role's numbers grow along
  the same curve, and a Spellcaster's probably does not grow like a Brute's. Ten rows is content that
  can be tuned in place; ten rows per role is eighty, and nobody has yet scaled enough creatures to know
  whether the single curve reads wrong.
- Whether the initiative tracker belongs with the rolls rather than in tools and polish — a real
  session will answer this. **Still open**, and now three milestones away from being playable enough to
  ask it properly rather than one, which is the compounding price of three insertions and is worth
  naming rather than glossing. Written without numbers deliberately: this entry has been renumbered
  twice already.
- **Whether the layout should have come before the character library rather than after two libraries.**
  Worth recording as a judgement to check rather than a decision to defend. Building the shell first
  would have meant the sheet panel, the bestiary picker and the DM tabs each landing in their final home
  the first time, instead of being moved once. Against that: the shell's requirements were not knowable
  until there was something to put in it, and the markup that specifies it came from looking at a
  deployed app with two libraries in it. The cost paid is one move of panels that already worked; the
  cost avoided is designing a screen around features that did not exist yet.
- **Whether the library should go past level 5.** It stops there, and a character the DM pushes
  beyond it keeps its level and its proficiency bonus while its sheet stands still. Extending it is
  24 more hand-written sheets per five levels, and nobody has yet played long enough to want them.
- **Whether a player should be able to nudge their own numbers.** Today a premade character's stats
  are the library's, and changing one is a DM override that pins that field against every future
  level ([ADR 0006](adr/0006-premade-character-library.md)). That is the right default for beginners
  and may be the wrong one for the second campaign.
- **Whether the DM should ever be able to play a character.** Milestone 7 says no, and says it as a
  product decision rather than a security one — the DM code is still a bearer credential and the app
  cannot tell one person from two. Somebody running the game *and* playing a hero opens a second seat,
  which works today and which nothing has been built to make pleasant. A session with a DM who also
  wants a character in the fight is what decides whether that is fine or an obvious gap.
- **Whether control should grant sight per token or per character.** Milestone 7 grants it per
  character, reached through a token: control any token bound to the wolf and you read the wolf. The
  alternative — sight scoped to the particular coin — matters only if a creature is ever bound to two
  tokens on two scenes with different grants, which nothing yet does and which may never be worth the
  second relation.
- **Whether *reserved* wants to be a flag or a staging area.** A reserved character is a hidden row
  in the same list, which is the smallest thing that meets the case (a character built for a player
  who has not arrived). A DM planning three sessions ahead may instead want somewhere to keep drafts
  that is visibly separate from the party, and a flag scattered through one list is a poor answer to
  that. Ask again after a DM has reserved more than one.
- **Whether the NPC-or-monster group should be stored for both kinds rather than derived for one.**
  Milestone 7 derives it for a bestiary-linked creature and stores it for a hand-built one, which
  matches how every other number on those two sheets already works. The cost is that the one question
  has two implementations, and if a DM ever wants a bestiary monster filed under NPCs — a goblin they
  have decided is an ally — the derived half has no way to say so.
