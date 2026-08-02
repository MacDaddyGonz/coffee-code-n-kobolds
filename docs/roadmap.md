# Roadmap

The order features get built, and why that order. Full feature detail lives in
[requirements.md](requirements.md) — this file is about **sequencing**.

Two principles drive the ordering:

1. **Risky things first.** The live token sync and the DM-layer security model are the parts most
   likely to force a redesign. Build them before there's a lot of code sitting on top of them.
2. **Reach a playable session early.** Milestones 1–9 are the minimum to actually run a game.
   Everything after that makes it nicer. For a game played a few times a year, a rough playable
   version beats a polished half.

Each milestone is a branch (or a few), merged to `dev`, then promoted to `main` when it's worth
deploying. Acceptance criteria are written so you can tell "done" from "mostly done".

**Numbering note.** Five milestones have been inserted after the one before them shipped, and each
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
- **Milestone 8, getting to the table**, inserted after Milestone 7 shipped and after five minutes of
  using it. A fifth instance, and the least theoretical of them: the roll announcement and the feed
  are written against who is at the table and what they are holding, and **the DM could not reach DM
  mode without being told where to look.** The front door being in the wrong place is not something
  to fix after building three more rooms.

So rolls and dice went 4 → 5 → 6 → 7 → 8 → **9**, DM tooling 5 → 6 → 7 → 8 → 9 → **10**, tools and
polish 6 → 7 → 8 → 9 → 10 → **11**, and the game editor 7 → 8 → 9 → 10 → 11 → **12**. This file is
renumbered throughout. **The ADRs are not**, because an ADR is not edited after the fact — read them
against this table:

| Where the ADR says | It means | Read it as |
| --- | --- | --- |
| Milestone 4 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | rolls, feed and dice | 9 |
| Milestone 5 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | DM tooling, layers, fog of war | 10 |
| Milestone 5 — [0006](adr/0006-premade-character-library.md) | rolls, feed and dice | 9 |
| Milestone 6 — [0006](adr/0006-premade-character-library.md) | DM tooling, layers, fog of war | 10 |
| Milestone 6 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | rolls, feed and dice | 9 |
| Milestone 7 — [0004](adr/0004-board-authorisation-and-layers.md) | orphaned-blob sweeper, admin view | 12 |
| Milestone 7 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | DM tooling, layers, fog of war | 10 |
| Milestone 8 — [0006](adr/0006-premade-character-library.md) | orphaned-blob sweeper | 12 |

[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md),
[ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md),
[ADR 0010](adr/0010-the-way-in-and-the-dms-coins.md) and
[ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md) have no rows, and that is the
discipline working rather than an omission: not one of them names a milestone number anywhere, so the
fourth and fifth renumberings cost them nothing. They say "the dice milestone" and "the DM-tooling
milestone", which is the formulation that survives. **Four in a row is the convention holding** —
which is now long enough that it is simply how an ADR is written here — and the table above stops
growing on the day the last numbered ADR is superseded.

**This file no longer contains a forward reference by number, and that is the fix rather than a
tidy-up.** Three renumberings taught the lesson [ADR 0006](adr/0006-premade-character-library.md)
wrote down — *a comment that names a milestone number dates badly, and naming the feature survives* —
so every "still Milestone 6" in a completed section above now reads "still the rolls milestone", and
the same for the DM-tooling, tools and game-editor milestones. **Each insertion since has cost a heading
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

## ✅ Milestone 7 — Seats, sheets and control

**Done.** The decisions are recorded in
[ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md). Five things it settled that the
section below planned differently or did not plan at all, so read them together:

- **Control granting sight is half a feature without hit points**, and the section below only asked
  for the sheet. `HpControls` renders its `−`/`+` **only** against the `exact` variant of
  `publicVitalsValidator`, on the stated grounds that a caller who may edit hit points is always
  sent them — so a granted seat receiving a band would get the party's wolf with a sheet, a health
  bar and no way to take damage on it. `visibleVitals` therefore takes the controlled set as well,
  as a third term on the existing condition rather than a second branch, and the price is that
  `characters.vitals` now keys on `playerId`: two seats at one table hold two subscriptions where
  they used to share one.
- **Selection had to be two primitives and not one token id.** A character routinely has no token —
  the bestiary shelf creates a creature and never places one, and neither does the DM's
  new-character form — so writing only a token id would leave the *previous* coin selected and the
  previous creature on screen, which is the exact confusion lifting selection out of `Board` was
  meant to end. Two `useState` calls in `GameShell`, three `useCallback([])` handlers, and nothing
  crossing the memo boundary that is not primitive.
- **`publicCharacterValidator` needed `reserved` projected**, which reads at first like sending a
  player information they do not need — it is always `false` in their payload, because the row is
  dropped entirely. It travels because the DM's hide control has to be a **state and not a
  command**: without the field the button can say what pressing it would do and never what is
  currently true, which for a flag whose whole purpose is "somebody must not see this" is the one
  thing the DM needs to read off the screen.
- **The roster was a second way a reserved name shipped.** `characters.list` is not the only payload
  carrying a character's name; `playerCharacterNames` builds what `players.list` prints as
  `characterName` in the lobby and the strip over the board. Withholding a row from one and naming
  it in the other publishes exactly the spoiler — a name attached to a seat nobody is sitting in.
  Both filters exist, and `players.ts` nulls the id together with the name rather than beside it.
- **The last slide-out went, and its primitive now has no caller at all.**
  `CharacterSheetDrawer` was the one panel the shell milestone did not notice it had left behind,
  and it left with `DmSheetsPanel` and `DmNpcPanel` — two views of one list, each with a paragraph
  explaining why the other existed. `ui/sheet.tsx` is kept anyway, with a header saying so: an
  unmodified member of the shadcn set is cheaper to keep than to re-add, and a `<Sheet>` appearing
  in a future diff should prompt the question "why is this not a tab?".

**Acceptance, as met:** the DM's panel has a Sheets tab and no Character tab, and a player's has the
reverse. Choosing a row in the DM's selector shows that sheet and selects its token; clicking a
different token on the map moves the selector to it, and both write the one piece of shell state. A
token bound to nothing names itself and says it carries no sheet rather than silently keeping the
last one. A player selects their own token and sees their own sheet; granted the party's wolf, they
see the wolf's sheet and its exact hit points and may take damage on it but not rewrite it; clicking
empty map returns them to their own sheet. A player who has **not** been granted the wolf sees no
trace of it in any payload — name, notes, actions or hit-point numbers, scanned as text and as
numbers, with a positive control beside the scan — and a grant written onto a **DM-layer** token
reveals nothing until the token moves to the player layer, asserted both in `characters.test.ts` and
against the real deployment. A character the DM marks reserved is absent from every player's
character list *and* from the roster, `claim` refuses it as unfindable, and `assign` clears the flag
as it hands it over. Creating a character, an NPC and a monster are three buttons in one tab, and
`characters.create` refuses every one of them without the DM code. `npm run lint` is clean, 1,136
tests pass, and `npm run test:smoke` passes 135/135 against the real dev deployment.

**Amendments to [requirements.md](requirements.md) written**, as the three before them were: *Player
mode*'s "only their assigned character token", *Accounts and games*' logged-in user creating
characters, and the *DM panel* tab list. None of the three is a rule-set change, and the entry says
so.

**The original plan follows.**

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

## ✅ Milestone 8 — Getting to the table, and the DM's tokens

**Done.** The decisions are recorded in
[ADR 0010](adr/0010-the-way-in-and-the-dms-coins.md). Six things it settled that the section below
planned differently or did not plan at all, so read them together:

- **The seat list at the door needed no new payload, and deleting one was the actual win.**
  The section below treats "show the seats that already exist" as a new audience to check, and
  `players.list` already carried every field it wanted — including the character each seat holds,
  already filtered through `playerCharacterNames`. What the check found instead was that the name
  gate had been mounting `players.listNames { code }` beside a hook already holding
  `players.list { code }`: different arguments, so a second cache entry, a second socket and a second
  server execution, for a strict subset of rows already on the wire. One seat-picker component
  serves both doors from one subscription, `listNames` is gone, and the creature-and-reserved filter
  now has one place to keep applying rather than two — where it is also, now, the thing stopping the
  **front page of the site** naming a monster.
- **Editing a coin is four mutations and not one.** The section below asks for a Tokens tab with
  rebind, art, controllers, layer, size and tint, which reads as one form and therefore one absolute
  write. Two of those six fields decide what players may know, and folding them in means every
  rename carries a layer and a binding — so a client sending a stale one would reveal an ambush as a
  side effect of fixing a typo. `updateToken` takes the cosmetics; `setLayer`, `setCharacter` and
  `setArt` each say in their name what they moved.
- **Two existing assertions were working around the missing layer mutation, and both said so in a
  comment.** The convex-test case that flips a granted token's layer moved it with a raw database
  patch under a docblock reading *"no mutation changes it"*, and `board-smoke.mjs` § 28 added a
  **second token** under a comment saying *"there is no mutation that re-layers a token"*. Both were
  true when written. [ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md) promises that
  property is asserted twice, in the two places this project asserts secrets; only now is it the
  **same round trip** in both, driven through the public API rather than around it.
- **A no-op unbind would have invalidated the whole table's board.** The binding writer's
  suppression compares `(token.characterId ?? null)` against the argument rather than the raw stored
  field. Without the normalisation, re-submitting an unbind on an already-unbound token patches
  `undefined` over `undefined` — a write, therefore an invalidation of `board.tokens` for every
  client at the table, from a form submission that changed nothing.
- **A comment claimed a security property the codebase does not have.** `checkDmCode`'s first draft
  justified its single failure shape as what stops join codes being enumerated. `games.getByCode`
  has always been exactly that oracle, because a join code is not a secret — it is the credential
  everybody at the table holds. A comment asserting a defence that does not exist is worse than no
  comment, because whoever next weakens the thing it describes will read it and believe they are
  covered.
- **The Tokens tab cannot say where a coin stands, and the absence is more awkward than predicted.**
  Deliberate — a placement field would fold `tokenPositions` into the low-churn subscription and
  invert invariant 2 — but for a DM with two scenes, a row reading *bound to nothing · 1 square* is
  genuinely ambiguous about whether the coin is on a map at all. **Left as an open question**, with
  the shape of the answer noted: a per-token *count*, no coordinates, in a query of its own.

**Acceptance, as met:** a returning DM opens the site, sees their game listed with its creator and
its age, clicks *Join as DM*, enters the game code and then the DM code, and lands on the board
already elevated — no visit to Settings, and Settings still holds both controls. A mistyped DM code
reports itself under the field it was typed into rather than on a board that has silently demoted
you. A code that opens a *different* game is refused even when the two games share a name, because
the check compares `_id`. A returning player picks their own seat off a list showing the character
each one holds. A new player claims an unclaimed character, is returned to the Character tab, and
chooses its race and class there with no rule changed. The DM opens Tokens, sees every coin including
the unbound ones and the DM-layer ones, rebinds one, swaps its art and grants it to a second seat
without going near the map. The name at the top of a sheet reads as a title and appears exactly once.

`games.list` carries no join code — asserted by key set as well as by substring, because a
six-character code from a 31-letter alphabet can occur by chance inside an `_id` — no DM code, no
salt and no recovery hash, each with a positive control that the payload is not simply empty. A
rebind moves sight with the token: the granted seat that could read the old creature's sheet cannot
afterwards, reads the new one's, receives the `exact` variant of its hit points, and **nothing was
written to `controllerIds`** to make any of it true. `npm run lint` is clean, **1207 tests pass**,
and `npm run test:smoke` passes **156/156** against the real dev deployment across three consecutive
runs, leaving no orphaned upload behind — the art swap being the first operation in this project that
could strip a blob of its last reference.

**Amendments to [requirements.md](requirements.md) written**, as the four before them were: *Accounts
and games*' joining-by-code-alone, and the new player selecting their race and class. Neither is a
rule-set change and the entry says so. The threat model in [CLAUDE.md](../CLAUDE.md) gained a **third
audience** — it reasoned about join-code holders and DM-code holders, and the set reachable with no
credential at all used to be empty.

**The original plan follows.**

**Inserted after playing with the deployed seats-and-sheets build**, and it is the same shape of
correction the last one was: the model is now right and the *way in* to it is not. Three of the four
items below were found in the first five minutes of using it, which is the argument for doing them
before the dice rather than after.

**Why it goes before the dice and not after.** Two reasons, and only the first is the usual one.
The dice milestone puts a roll announcement on screen and a feed in a panel, and both are written
against *who is at the table and what they are holding* — so the door people come in through is a
fixture the feed gets written against, exactly as the sheet panel was. The second reason is blunter:
**the DM cannot currently get into DM mode without being told to look in Settings.** That is not a
polish item, it is the front door being in the wrong place, and everything the dice milestone adds
for the DM sits behind it.

### The way in, and why it is currently wrong

Today the whole of joining is: type a game code you already have, type a display name, land on the
board. A returning DM then has to notice that *Settings* holds an elevate control and paste their DM
code into it — after they are already sitting at the table as a player. Every part of that is
discoverable only if somebody tells you.

⚠️ **The elevate control is in Settings for a good reason and must stay there as well.**
[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md) moved `DmBar` out of the lobby precisely
because a DM whose browser lost its code mid-campaign previously had *no way back in* — the lobby
was a screen you left. The fix here is therefore **both doors, not the door moved back**: the
landing page is where a returning DM says who they are, and Settings stays as the recovery path for
somebody already seated.

**A landing page that lists the games.** Name, creator, and when it was created, with **Join as
player** and **Join as DM** beside each. Choosing either asks for the game code — so the code is
still what admits you, and the list is only what tells you the game exists.

- **A player** who gives the right code is then shown **the seats that already exist**, each with the
  character it is holding, and picks their own name off the list. That is the whole of "restore my
  session" today, done by retyping a name from memory and hoping the normalisation matches
  ([ADR 0003](adr/0003-player-identity-without-accounts.md)); showing the list makes the idempotence
  visible instead of hoping for it.
- **A DM** who gives the right code is then asked for the **DM code**, and lands on the board already
  elevated. No seat-then-settings two-step.
- **A new player** takes the *new player* route: a display name, and then their character.

⚠️ **That last clause reverses a decision made one milestone ago, and the reversal has to be
deliberate or not happen.** [ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md) settled
that **the DM creates characters and players claim them**, and rewrote `characters.create` to require
the DM code on every path. "A new player provides their name and selects their starting level 1 race
and class" reads as a player creating a character again.

There are two readings and this milestone has to pick one on the record:

| Reading | What it costs |
| --- | --- |
| **The player builds, on a character the DM already made.** They claim an unclaimed slot and then choose race and class on it. | Nothing. This is already how the code behaves — `applyPresetPermissions` lets a player set race, class and archetype while the sheet is unlocked, and only the DM may unlock it once locked. It needs a *screen*, not a rule change. |
| **The player creates the character outright.** | A superseding ADR. It reopens `characters.create`, and with it the reason it was closed: an ungated create is what let the character list grow sideways, and it is one of the two doors invariant 9 is about. |

**The first reading is almost certainly what is wanted** and costs nothing, so it is the default
unless the DM-creates rule turns out to be wrong at the table. Say which, in the ADR, before building
either.

⚠️ **Listing every game on the landing page publishes the name and creator of every game to anybody
who loads the site**, and that is a genuine change rather than a screen. Today a join code is the
only way to learn a game *exists*: `games.getByCode` is a point lookup and there is no list query at
all. The threat model in [CLAUDE.md](../CLAUDE.md) scopes this — the audience is a small group of
trusted colleagues, and a game *name* is not a secret the way a scene name or a creature name is —
but it is the first thing this app would publish without a code, so it wants a line in an ADR and an
amendment to [requirements.md](requirements.md) rather than being slipped in behind a UI change.
Three specific things to settle there: whether the list is every game or only recent ones, whether
`createdByName` is published beside it, and what a `games.list` payload may carry — it must be built
from a projection like `publicGameValidator`, because that document holds the DM code and the
recovery hash.

### The DM's Tokens tab

**The token-list bullet moves forward out of the DM-tooling milestone**, the way the control bullet
moved into the last one, and for a related reason: the seats-and-sheets milestone gave the DM a
selector that reaches every *sheet* in the game, and left the *coins* reachable only by finding them
on the map. A creature with no token, or a token on a layer that is not being shown, is currently
unreachable.

A **Tokens** tab beside Sheets, listing every token in the game with:

- which character, NPC or monster it is bound to, and the control to **rebind or unbind** it
- its **art**, and the control to change it
- which **seats control it** — the same relation the Sheets tab's grant panel writes, read the other
  way round, from the token rather than from the creature
- its layer, size and tint

⚠️ **The grant relation must not get a second writer.** `board.setControllers` is the one mutation,
and `effectiveControllersOf` in `convex/lib/board.ts` is the one rule; a Tokens tab that computed
"who controls this" for itself would be the second implementation ADR 0009 spent the milestone
removing. Read `controllerIds` and `grantedPlayerIds` off the payload, as the grant panel does.

### Two small things found by using it

- **The name at the top of the Sheets and Character panels is body text and should be a title.**
  It is the answer to "whose sheet am I looking at", which is the question the whole panel exists to
  answer, and it currently reads at the same weight as the fields under it.
- ~~**Nothing deletes a game.**~~ **Done, and done as a tool rather than as the feature this bullet
  imagined.** The dev deployment had seventy-one games, thirty-five of them left by
  `npm run test:smoke`. The condition above — worth doing here only if the authorisation question is
  genuinely one line — turned out to be answerable by *not asking it*: `convex/admin.ts` holds an
  `internalQuery` and an `internalMutation`, which are absent from the generated public API and
  reachable only by a caller already holding deploy credentials, so there is no "who may delete a
  game" to answer. `npm run prune-games` is the whole of the interface, dry-run by default, filtered
  to a name prefix, with no `--all`. **The admin view that deletes a game a person chose is still
  Milestone 12** and this took nothing from it — there is deliberately no public mutation, because
  that is where the authorisation question comes back and it wants an ADR. The smoke script was left
  calling `ConvexHttpClient` only: wiring the purge into its cleanup would make a test depend on
  deploy credentials it does not otherwise need, so it prints a pointer at the broom instead.

**Deliberately not done here:**

- **No accounts.** The landing page lists games and asks for codes; it does not know who you are.
  [ADR 0002](adr/0002-defer-user-accounts.md) is unchanged and this is not a step towards it — a
  list of games plus a code is still a bearer credential, not an identity.
- **No rolling.** Still the next milestone, including the initiative control below.
- **No layer rework and no fog of war** — still the DM-tooling milestone, even though the Tokens tab
  will make the missing layer control obvious.

**Acceptance:** a returning DM opens the site, sees their game in the list, clicks *Join as DM*,
enters the game code and then the DM code, and lands on the board **already in DM mode** — no visit
to Settings. A returning player picks their own name off the list of seats rather than retyping it,
and lands on the same seat with the same character. A new player joins, gets a character and chooses
its race and class. The DM opens the Tokens tab, rebinds a coin from one creature to another, changes
its art, and grants it to a second player without going near the map.

**Amend [requirements.md](requirements.md)** for the games list, if it lands as described: the
*Accounts and games* section describes joining by code alone.

---

## ✅ Milestone 9 — Rolls, feed and dice

**Done.** The decisions are recorded in
[ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md). Seven things it settled
differently from the plan below, or found out by building it, so read them together:

- **The plan's own corpus count was wrong, and regenerating it is what caught that.** It says 27
  distinct roll expressions across the bestiary. `roll:` is used only by creature *abilities* — an
  attack's damage is in `damage:` — so the real figure at each creature's own rating is **61**, and
  **194** once every creature is resolved at every rating through the scaler. The union across all
  three corpora is **227**. An evaluator satisfied against the 27 would have met the other 34 in
  front of the group. This section's own ⚠️ said to regenerate rather than trust the table; that is
  what it was for.
- **`20d6+455` is not reachable, and the extremes are tested synthetically instead.** Challenge
  ratings only span 0 to 6, so the steepest ratio in play tops out at twelve dice and a `+18`
  modifier. The scaler *can* emit the wider shape, so the grammar's extremes are exercised with a
  note saying they are synthetic — leaving them out would leave the evaluator unchecked at exactly
  the point a wider range first reaches it.
- **The dice library had to change, and ADR 0001 is superseded on that one row.**
  `@3d-dice/dice-box` cannot be told what numbers to display — it rolls its own — which is
  irreconcilable with the server deciding every roll. `@3d-dice/dice-box-threejs` is the same
  author's fork that exists to keep predetermined rolling. Proven from the bundle's source (it swaps
  the face's material index *after* the physics settles and reads the value back off the mesh
  normals) and then in headless Chrome, with an unpinned roll beside it as the control. It uses
  cannon-es rather than an ammo.js WASM blob, so the risk flagged below largely evaporated — but its
  **d100 is a tens die**, so a server-decided 47 cannot be rendered at all.
- **A grant cannot widen the feed, and the parameter that said it could was pure cost.**
  `boardCharacterAccess` adds to `controlled` only on an iteration that already added to `visible`,
  so the grant disjunct could admit nothing sight had not. It was still putting `playerId` on
  `feed.list` and splitting the highest-churn subscription in the app into one cache entry per seat.
  Found by the agent writing the leak tests — the second time in this milestone that a test found the
  *reasoning* wrong rather than the code.
- **`visibleFeed`'s window-before-filter comment argued for the opposite of what the code does.** It
  claimed filtering first would leak a count; it is the other way round. The bounded read is the real
  reason and the count inference is a cost, and both now say so — including in the threat model,
  which gains its first *paid* guard beside all the free ones.
- **The five open questions all resolved to "announce, do not adjudicate", and one of them was
  already answered.** A hero's initiative bonus needed no new field: `initiativeBonusOf` has answered
  for both sheet kinds since the sheets milestone and only had to be found.
- **Three bugs survived 1,314 green tests, a clean lint and a 187/187 real-deployment smoke run, and
  a browser found all three.** That is now true of every milestone. The worst was a double-click on a
  weapon **losing the damage roll every time** — `RollButton` disabled itself on a panel-wide
  `pending` count, so the first click greyed out the button beside it. To-hit-then-damage is the
  interaction this milestone exists for, and the identical correction had already been written for
  the initiative die one file over. The dice canvas also did not follow the pane divider (the engine
  resizes on a `window` resize and nothing else), and the crit halo lit up **2.5 seconds** before the
  total — long enough to read the colour and call the crit before the die landed.

**Acceptance, as met:** a player clicks a saving throw and both screens show the same dice faces, the
same floating announcement and the same feed line, with the roller seeing it **without leaving their
sheet tab**. A weapon is two clicks and two lines. A passive adds a line and throws no dice. Alt-click
sends the description. A natural 1 shakes the map pane and flashes red on every screen that received
the row, a natural 20 celebrates, and both are suppressed under `prefers-reduced-motion` — where a
*held* wash and the crit in words replace them, rather than nothing. The DM rolls a DM-layer creature
and the player's window shows **nothing at all**; the coin moves to the player layer and the line
appears, while its sheet stays refused. `npm run test:smoke` passes 187/187 against the real dev
deployment, including every subject kind through the union, the exact key set at three depths, and
`roll: null` coming back as a present key rather than a missing one.

**The original plan follows.**

The bit that makes it feel like a game.

- `feed` table + game feed panel, filling the tab the previous milestone left empty.
- Click a sheet item → roll pushed to the feed. **Alt-click** → the item's text description instead.
- Advantage / disadvantage toggle, for both sheet rolls and ad-hoc dice.
- Ad-hoc dice roller in the game tools.
- 3D dice via `@3d-dice/dice-box`, visible to everyone, with the roller's token shown on screen.
- d20 crit handling: screen shake + red alarm on a 1, celebration + fireworks on a 20.
- **Initiative, rolled from the Sheets selector rather than from a sheet.** A roll control on each
  row of the DM's grouped selector — the same rows that already carry hit points — so rolling
  initiative for six goblins is six clicks in one list instead of six sheets opened and closed.
  This is the `HpControls`-on-a-row idea applied to the other thing a DM does to a whole encounter
  at once, and it is cheap because the row and its subscription already exist. It wants somewhere to
  *put* the number, which is the initiative tracker on the tools milestone — until that lands the
  roll goes to the feed like any other, which is still faster than what it replaces.
- **A weapon rolls twice** — a to-hit and a damage — which is the shape the sheet-taxonomy milestone
  put on `SheetEntry` for exactly this reason. An action rolls once. A passive is declared and rolls nothing,
  so clicking one announces it and pushes to the feed without any dice.

### ⚠️ The list above is a feature list, not a specification — read this before starting

**Reviewed before building, and the review found the section wanting.** Everything above says *what
will exist*. Almost none of it says **how a sheet behaves when somebody clicks it**, and that is the
entire milestone. Specifically it never says how an ability check, a saving throw, a skill check, an
initiative roll, a weapon's to-hit and damage, a spell attack, a spell save DC, a spell slot, a
limited-use class feature or a passive actually work — nor which of those this app adjudicates and
which it merely announces.

That gap is not a documentation problem. Three of the things in that list **do not exist in the data
model at all**, and discovering them at implementation time is how the shape of the roll path gets
decided by whichever file was open at the time. They are named below so they are decided on the record
first.

### The rules surface is fixed, and that is the whole reason this is tractable

The sheets are **fixed and cherry-picked** — a deliberate constraint from the character-library and
bestiary milestones, and the thing that stops this being an implementation of 2024 D&D. Nothing needs
to work in general; a bounded, countable list needs to work exactly. As it stands:

| The corpus | Count |
| --- | --- |
| Premade hero sheets (`convex/lib/library/`) | 72 — eight classes, two archetypes each, levels 1–5 |
| Creatures (`convex/lib/bestiary/`) | 140 |
| Catalogue entries (`convex/lib/rules.ts`) | 52, of which the library actually references **29** |
| **Distinct damage/effect roll expressions in the library** | **32** |
| **Distinct to-hit expressions in the library** | **7** |
| Distinct roll expressions across the bestiary | 27 |

So the evaluator has **fewer than sixty distinct expressions** to satisfy, every one of which already
passes `isValidRoll` and is therefore already in the grammar. The 29 catalogue keys the library leans
on are the complete set of spells and class features that need behaviour:

> `action-surge` `aid` `bardic-inspiration` `bless` `burning-hands` `counterspell` `cure-wounds`
> `detect-magic` `dispel-magic` `divine-smite` `fire-bolt` `fireball` `guidance` `guiding-bolt`
> `healing-word` `hold-person` `lightning-bolt` `lay-on-hands` `mage-hand` `magic-missile`
> `misty-step` `rage` `revivify` `sacred-flame` `scorching-ray` `second-wind` `shield`
> `sneak-attack` `spiritual-weapon`

⚠️ **Enumerate before implementing.** Regenerate those counts and that list from the corpus rather
than trusting this table — it is a snapshot, and the corpus is content. The instruction that matters
is the shape of the work: *go and read what is actually there, then make exactly that work.* Anything
built for the general case is built for content this project does not have and will not add.

⚠️ **And the reduced rules stay reduced.** The library is a **modified** 2024 subset — an archetype is
chosen at **level 2** rather than level 3, for every class; levels stop at 5; backgrounds, inventory,
multiclassing and experience points are excluded by design. Consult the 2024 rules for how a
cherry-picked feature *works*, never for what a character *has*. The corpus is the authority on the
second question, and a rules reference that disagrees with it is describing a different game.

### Five things the data model does not have, and each one is a decision

None of these is a gap to fill quietly on the way past. Each changes what the roll path is.

1. **There are no spell slots anywhere.** No field, no table, no accessor. A `spells` entry is a
   `SheetEntry` with an optional `level`, and nothing tracks casting. So "clicking a spell casts it"
   currently cannot mean "and spends a slot". Decide whether slots exist at all — a table of them per
   class and level is real content, and the alternative (the app announces the cast and the table
   tracks slots on paper, as it already does for most things) is entirely consistent with a project
   whose stated purpose is to not be a rules engine.
2. **A hero has no spell attack bonus and no spell save DC.** A *creature* has both — `attackBonus`
   and `saveDc` on the reduced sheet — and a hero has neither, because a hero's are derived from the
   spellcasting ability plus proficiency. So either they get derived at resolution (and the
   spellcasting ability per class becomes stored content) or they get stored per sheet across 72
   files.
3. **A hero has no initiative bonus.** A creature stores one; a hero derives it from DEX. The
   initiative-from-the-selector feature above rolls for both, so it needs one answer that covers a
   stored number and a derived one.
4. **Limited-use resources are coarser than the features need.** `characterVitals` holds
   `spentPerRest: string[]` — a set of *keys*, so a thing is spent or it is not — plus
   `hitDiceRemaining`. That cannot express Rage twice a day, Channel Divinity twice a rest, or Second
   Wind once a *short* rest, and the corpus contains features of all three shapes. A count per key, a
   short-rest versus long-rest distinction, or a deliberate decision not to track them: pick one, and
   note that `characters.longRest` currently restores everything.
5. **Nothing expresses concentration or the action economy.** No field says a spell needs
   concentration, and nothing knows an action from a bonus action from a reaction. The reduced rule
   set never promised either. Say so explicitly rather than leaving the absence to be read as an
   oversight — and if the answer is that the table tracks them, the sheet should not imply otherwise.

**The likely right answer to most of these is "announce, do not adjudicate"** — which is what
[requirements.md](requirements.md) means by D&D Lite and what the bestiary milestone already decided
about CR scaling. But it is an answer that has to be given, because the opposite reading builds a
rules engine by accident, one feature at a time.

### Reference material, and what each is good for

- **[A beginner's guide to playing using D&D Beyond](https://www.anotherdndblog.com/d&d/preparation/session0/dm/lmop/starter/players/d&dbeyond/2020/07/08/a_beginners_guide_to_playing_using_dnd_beyond.html)**
  — the interaction model this project's sheets should feel like: which numbers are clickable and what
  each click rolls. Ability scores, saves and skills each roll a d20 plus their modifier; a weapon is
  **two separate clicks**, a to-hit then a damage; passive scores are printed and never rolled; a
  spell save DC is a printed number the caster does not roll; advantage rolls twice and takes the
  higher.
  ⚠️ **It is a beginner's guide and it is silent on precisely the hard parts** — it does not cover
  spell-slot consumption, concentration, limited-use resource tracking or action economy, which are
  four of the five open decisions above. Take the click-to-roll model from it; do not expect it to
  settle the rest.
- **2024 rules, per class and archetype** — for how a cherry-picked feature works, never for what a
  character has:

  | Class | Archetypes | Reference |
  | --- | --- | --- |
  | [Barbarian](http://dnd2024.wikidot.com/barbarian:main) | [Berserker](http://dnd2024.wikidot.com/barbarian:path-of-the-berserker) · [Wild Heart](http://dnd2024.wikidot.com/barbarian:path-of-the-wild-heart) | [feats](http://dnd2024.wikidot.com/feat:all) |
  | [Bard](http://dnd2024.wikidot.com/bard:main) | [Lore](http://dnd2024.wikidot.com/bard:college-of-lore) · [Valour](http://dnd2024.wikidot.com/bard:college-of-valor) | [spells](http://dnd2024.wikidot.com/bard:spell-list) |
  | [Cleric](http://dnd2024.wikidot.com/cleric:main) | [Life](http://dnd2024.wikidot.com/cleric:life-domain) · [Light](http://dnd2024.wikidot.com/cleric:light-domain) | [spells](http://dnd2024.wikidot.com/cleric:spell-list) |
  | [Fighter](http://dnd2024.wikidot.com/fighter:main) | [Champion](http://dnd2024.wikidot.com/fighter:champion) · [Battle Master](http://dnd2024.wikidot.com/fighter:battle-master) | [feats](http://dnd2024.wikidot.com/feat:all) |
  | [Paladin](http://dnd2024.wikidot.com/paladin:main) | [Devotion](http://dnd2024.wikidot.com/paladin:oath-of-devotion) · [Vengeance](http://dnd2024.wikidot.com/paladin:oath-of-vengeance) | [spells](http://dnd2024.wikidot.com/paladin:spell-list) |
  | [Ranger](http://dnd2024.wikidot.com/ranger:main) | [Hunter](http://dnd2024.wikidot.com/ranger:hunter) · [Beast Master](http://dnd2024.wikidot.com/ranger:beast-master) | [spells](http://dnd2024.wikidot.com/ranger:spell-list) |
  | [Rogue](http://dnd2024.wikidot.com/rogue:main) | [Thief](http://dnd2024.wikidot.com/rogue:thief) · [Assassin](http://dnd2024.wikidot.com/rogue:assassin) | [feats](http://dnd2024.wikidot.com/feat:all) |
  | [Wizard](http://dnd2024.wikidot.com/wizard:main) | [Evocation](http://dnd2024.wikidot.com/wizard:evoker) · [Divination](http://dnd2024.wikidot.com/wizard:diviner) | [spells](http://dnd2024.wikidot.com/wizard:spell-list) |

  Plus [all spells](http://dnd2024.wikidot.com/spell:all) and [all feats](http://dnd2024.wikidot.com/feat:all).

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

With Milestones 1–9 you can run a real game: a map with tokens, characters built by choosing rather
than by filling in a form, monsters picked off a shelf rather than typed in, sheets that roll, shared
dice, and a feed. The DM works around the missing tooling manually. **Consider actually playing here
before building more** — a session will tell you what's genuinely missing faster than guessing.

---

## Milestone 10 — DM tooling

The four bold items at the end were **requested after playing Milestone 2**. The rest was always
here — except two bullets that moved forward, both for the same kind of reason. The **token-control**
bullet went to the seats-and-sheets milestone once control stopped being about dragging a coin and
started deciding which sheets a player is sent; the **token list** went to the getting-to-the-table
milestone once the sheet selector made it the only thing in the game with no way to reach it.

- ~~DM panel: the token list~~ — **moved forward into the getting-to-the-table milestone.** What is
  left of this bullet is the modal image library and the music selector. **Most of it has already
  been built by the four milestones that grew into it**, and what remains is smaller than it reads.
  Milestone 3 left `Tabs` as a seam rather than a panel; Milestone 5 filled the NPC tab with the
  bestiary picker; the layout milestone moved the whole thing into the right-hand panel and split it
  into DM-tools tabs; the seats-and-sheets milestone took the sheets and the creatures back out of it
  into a tab of their own, leaving DM tools holding Map alone. So this is two more tabs inside a
  panel that exists, not a panel.
- DM can click any sheet item to roll on a player's behalf.
- Scene switching — changes the visible board for everyone in the game.
- Modal image pop-up: DM opens an image for the whole group, and closes it for everyone.
- DM can move any token on any layer, including player tokens. The mutation already allows this, the
  seats-and-sheets milestone gave the DM a selector that reaches a creature without finding its coin
  first, and the getting-to-the-table milestone's Tokens tab reaches a coin bound to nothing on a
  layer that is not being shown. **So what is left of this bullet is the moving**, not the reaching —
  which is the layer work below rather than a control of its own.
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

## Milestone 11 — Tools and polish

- Ruler tool, measuring in squares (1 square = 5 feet).
- Multi-colour marker + eraser on the board. **DM only** — players must not have this.
- Background music player, synced play state across the group.
- Initiative tracker.

**Acceptance:** the DM measures a distance and draws on the map; players see both. A player has no
marker tool available.

---

## Milestone 12 — Game editor and admin

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
