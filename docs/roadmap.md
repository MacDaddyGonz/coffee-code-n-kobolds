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

**Numbering note.** Nine milestones have been inserted after the one before them shipped, and each
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
- **Milestones 11, 13 and 14 — tokens; maps, fog and barriers; character resources** — all three
  inserted after Milestone 10 shipped, and after reading how Roll20 does the same three jobs. They
  arrive together because they are one review of the board screen rather than three ideas, and they
  are three milestones rather than one because each is a separate decision with its own ADR: what a
  coin *is* once it is placed, what a map *is* beyond one image and one fog model, and whether the
  application counts what a roll spends. **This is the first insertion that fixes something already
  shipped rather than something about to be built** — `board.removeToken` has been complete and
  fully tested since Milestone 2, with no button anywhere in the application, which is a gap five
  milestones of new features walked straight past. (They were 11, 12 and 13 when they were written;
  the board-polishing milestone below was inserted between the first and the second.) ⚠️ **The third
  of those three is gone**, and it is the only entry in this list describing a milestone that was
  planned and then **replaced rather than shipped or deferred** — see the entry below it.
- **Milestone 14 is no longer the character-resources milestone.** It was planned as spell slots,
  limited uses and the short rest, and it is now the **5e 2024 conversion**, on the maintainer's
  instruction. This is a **replacement in place rather than a seventh insertion**, so it renumbers
  nothing at all: no heading below it moves and the table further down is untouched, which is the
  first time a change to this file's plan has cost even less than an insertion. What the old milestone
  planned is **absorbed** rather than dropped — the 2024 rules contain slots, limited uses and both
  rests — so nothing in the reversal trail below is undone. ⚠️ **Anything in this file that names it
  "the character-resources milestone" now points at a milestone that builds resources as one section
  of nine**, and the two places that matter are marked where they sit.
- **Milestone 12, board polishing**, inserted after Milestone 11 shipped and after twenty minutes of
  using it. It is the *second* insertion that fixes something already shipped, and the first that
  fixes something shipped **one milestone earlier** — the right-click menu's *Edit this coin* was
  wired to a handler that could not do what its own docblock promised. The rest is the same
  discovery the milestone before it made: four controls filed where nobody looks for them, three
  things too small or too clipped to read, and one missing die. ⚠️ **Two of its nine items are not
  polish at all** and are listed under its own heading as such — one publishes a number this
  codebase has withheld since Milestone 3, and one widens the dice grammar that CLAUDE.md
  invariant 10 calls the cap itself.

So rolls and dice went 4 → 5 → 6 → 7 → 8 → **9**, DM tooling 5 → 6 → 7 → 8 → 9 → **10**, tools and
polish 6 → 7 → 8 → 9 → 10 → 11 → 14 → **15**, and the game editor
7 → 8 → 9 → 10 → 11 → 12 → 15 → **16**. This
file is renumbered throughout. **The ADRs are not**, because an ADR is not edited after the fact —
read them against this table:

| Where the ADR says | It means | Read it as |
| --- | --- | --- |
| Milestone 4 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | rolls, feed and dice | 9 |
| Milestone 5 — [0004](adr/0004-board-authorisation-and-layers.md), [0005](adr/0005-character-sheets-and-hit-point-secrecy.md) | DM tooling, layers, fog of war | 10 |
| Milestone 5 — [0006](adr/0006-premade-character-library.md) | rolls, feed and dice | 9 |
| Milestone 6 — [0006](adr/0006-premade-character-library.md) | DM tooling, layers, fog of war | 10 |
| Milestone 6 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | rolls, feed and dice | 9 |
| Milestone 7 — [0004](adr/0004-board-authorisation-and-layers.md) | orphaned-blob sweeper, admin view | 16 |
| Milestone 7 — [0007](adr/0007-monster-bestiary-and-cr-scaling.md) | DM tooling, layers, fog of war | 10 |
| Milestone 8 — [0006](adr/0006-premade-character-library.md) | orphaned-blob sweeper | 16 |

[ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md),
[ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md),
[ADR 0010](adr/0010-the-way-in-and-the-dms-coins.md),
[ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md) and
[ADR 0012](adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md) have no rows, and that is
the discipline working rather than an omission: not one of them names a milestone number anywhere, so
the last four renumberings cost them nothing. They say "the dice milestone" and "the DM-tooling
milestone", which is the formulation that survives. **Nine in a row is the convention holding** —
which is now long enough that it is simply how an ADR is written here — and the table above stops
growing on the day the last numbered ADR is superseded.
[ADR 0013](adr/0013-a-coin-you-can-copy-place-and-label.md) has no row either, and was the first
written *knowing* the rule rather than happening to keep it: it says "the tools-and-polish milestone"
where it has to name the one that will want the word *marker* for a drawing pen. ADRs 0014, 0015 and
0016 name no number either — and 0014 is the first written under a renumbering that happened *to it*
rather than below it, since the milestone it belongs to was inserted above the two that had already
claimed 0014 and 0015 in this file's prose. That cost two words here and nothing at all in the ADRs,
which is the whole argument for the convention stated in one sentence.

⚠️ **ADR 0012 is the first one that had to name a *deployment* step rather than a milestone**, and it
is worth knowing the difference. Renaming the GM layer's stored value is a widen–migrate–narrow across
two deploys with a manual sweep between them, so the narrowing is a step somebody performs rather than
a thing a milestone contains. It is recorded in the Done block of the milestone below, not in the ADR,
because a runbook goes stale the moment it is followed and an ADR must not.

**This file no longer contains a forward reference by number, and that is the fix rather than a
tidy-up.** Three renumberings taught the lesson [ADR 0006](adr/0006-premade-character-library.md)
wrote down — *a comment that names a milestone number dates badly, and naming the feature survives* —
so every "still Milestone 6" in a completed section above now reads "still the rolls milestone", and
the same for the DM-tooling, tools and game-editor milestones. **Each insertion since has cost a heading
renumber and this table, and nothing else**, which is the prediction that sentence made being paid
out rather than a coincidence worth glossing over. The three inserted at once cost exactly the same —
two headings and two cells — which is the strongest version of that payout available, because three
insertions at once is where a numbering scheme that had not been fixed would have collapsed.

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
  to a name prefix, with no `--all`. **The admin view that deletes a game a person chose is still the
  game-editor milestone's** and this took nothing from it — there is deliberately no public mutation,
  because
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

🚫 **That last sentence is the one thing the 5e 2024 conversion deliberately gives up, and it is left
standing here rather than corrected.** After that milestone the SRD is the authority on **both**
questions and the corpus is a transcription of it, so an archetype is chosen at level 3, there are
twelve classes rather than eight, and *"a rules reference that disagrees with the corpus is describing a
different game"* inverts into *the corpus disagreeing with the SRD is a transcription bug.* Everything
above it survives: levels still stop at 5, backgrounds, inventory, multiclassing and experience points
are still excluded, and **the paragraph was correct for the eleven milestones it governed**. It is
marked rather than edited because a reduction this project chose on purpose, and then chose to stop
choosing, is exactly the kind of decision a roadmap edited into agreement with the code can no longer
show you.

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

⚠️ **Three of these five have now been answered the other way, and this list is the reason it is
possible to say which.** This milestone gave all five answers, and
[ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md) recorded them: **no slots at
all** for the first, **no spell save DC for a hero** for the second, and **no count per key and no
short rest** for the fourth. The **5e 2024 conversion** below reverses **1, 2 and 4**, at the
maintainer's instruction, with ADR 0016 superseding those three decisions. This list is left exactly as
it was written — the point of writing a decision down is that it can be found and overturned rather
than quietly drifted away from, and a list edited to agree with the code can no longer catch the code
being wrong.

**Decisions 3 and 5 are unchanged and still hold:** initiative is still one function over a stored
number and a derived one, and nothing *enforces* concentration or the action economy. ⚠️ **Read
decision 5 carefully after the conversion, because it is the one that looks reversed and is not.** A
2024 spell sheet prints a casting time and a duration that may read *Concentration, up to 1 minute*, so
the words arrive on screen — but nothing drops a spell when its caster takes damage and nothing counts
a bonus action. A field that says *concentration* is not a check that enforces it, which is the
distinction the condition pips already drew.

⚠️ **Decision 2 falls for a reason worth naming, because it is not the reason the other two fall.** 1
and 4 were reversed by instruction — the maintainer asked for slot counting. 2 falls **structurally**:
every 2024 caster has a spell save DC and a spell attack bonus, so declining them means shipping a
sheet the rules describe with two boxes empty. Its own answer above predicted the shape of the fix —
*"either they get derived at resolution (and the spellcasting ability per class becomes stored
content)"* — and that is exactly what the conversion does. **Nothing is compared to the DC**, then or
now, which is why this reverses a *field* and not a decision about adjudication.

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

## ✅ Milestone 10 — DM tooling

**Done.** The decisions are recorded in
[ADR 0012](adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md). Eight things it settled
differently from the section below, or found out by building it, so read them together:

- **The third layer was hard for a reason neither this file nor ADR 0004 named**, and both only said
  *`maySee` is a two-way test and a third layer does not extend it*. The reason is that `isDm || layer
  === 'player'` was doing **two jobs that merely coincided** — deciding what a client is *sent* and
  what it may *move*. A player-layer token is both, a GM-layer token neither, and **Background is the
  first row where those answers differ.** So it needed a *second* predicate rather than a wider first
  one, and no amount of widening produces two. `maySeeLayer` and `mayPlayersMove` in the new
  `convex/lib/layers.ts`, a `never` arm each; a fourth member now hits **five** compile-time refusals.
- **Fog hides a placement, not a row, and that is narrower than "the monsters were the secret"
  implies.** A fogged creature loses its position, its health band and its feed lines — but its coin's
  *name and art stay in `board.tokens`*, because filtering that query means reading `tokenPositions`
  and re-resolving up to two hundred signed URLs on every drag frame, which is exactly the cost
  ADR 0004 split the two board queries to avoid. **The GM layer stays the tool for "may not be known
  about"; fog is the tool for "cannot see into that corridor."**
- **The cascade cost nothing to build.** One `continue` in `boardCharacterAccess`'s existing loop
  takes the band and the feed line together, because ADR 0009 had already made `controlled ⊆ visible`
  structural. No fourth predicate, and no `playerId` back on `feed.list`.
- **Fog is pay-as-you-go, and one early return is the whole cost model.** A scene with no rectangles
  returns before the positions read, so a game that never draws one has read sets byte-identical to
  what they were before the feature existed.
- **Fog must never hide a token the table controls**, or a player who walks their hero into the dark
  loses their own coin with no way to select it back. That is a correctness requirement rather than a
  courtesy, and it is also what states plainly that fog hides *what the DM placed*.
- **The reveal replay was fixed by moving a timestamp, not by a heuristic.** `Date.now()` is
  forbidden in a Convex query, so a *mutation* stamps `games.revealedAt` and each feed row carries
  `predatesReveal`. ⚠️ **`characters.assign` was missing its stamp** — the second route by which a
  reserved hero is released — so the whole backlog would have flown over the map. Found within the
  milestone that wrote the warning about exactly that.
- **Two mount points mattered more than the filters did, and both compiled.** The fog test first went
  into `visibleTokens`, the one private helper everything funnels through, which silently applied it
  to a consumer with a completely different cost profile. Then the veil first went *above* the player
  token layer, which would have blacked out the hero the server had gone to trouble to keep sent.
  Neither was a bug in a predicate.
- **Non-square grid cells are declined, because the bullet asks for two incompatible things.** "Scale
  it on X and Y" and "no schema change" cannot both hold — `sizeSquares` stops meaning anything once
  cells are rectangular. A corner drag that stays square *is* the interface saying so.

**One thing this milestone did that no previous one has: it migrated a stored value.** The GM layer
is `gm` in the database, not `dm`, through widen → migrate → narrow. Convex refuses a schema push
that narrows a union while a non-conforming row survives, which makes the sequence self-enforcing: a
blocked pipeline rather than broken data.

✅ **The narrowing is done, and the runbook it replaced is left here in outline because the shape is
the deliverable rather than the steps.** This section used to say the narrowing commit was
deliberately not on that branch and was the one outstanding step; it ran as four steps — deploy the
widened schema, sweep production with `npm run relabel-layers`, confirm
`admin:gamesWithLegacyLayers` reports zero, then a `chore/` branch taking the widening back out.

What that last branch deleted, listed because the next migration copies this set: the fourth member
of the stored union, `storedTokenLayerValidator` and `layerOf` in `convex/lib/layers.ts`,
`relabelGmLayer` and `countLegacyLayers` in `convex/lib/board.ts`, `gamesWithLegacyLayers` and
`relabelDmLayer` in `convex/admin.ts`, `scripts/relabel-layers.mjs` and its npm script, the widening
assertion in `lib/layers.test.ts`, and the legacy-row instrument in `board.test.ts` — that last one
because a needle for a value the schema can no longer hold is a guard that cannot fail.

⚠️ **The one thing worth carrying forward is why the sequence is safe rather than merely careful.**
Convex refuses a push that narrows a union while a non-conforming row survives, so the narrow schema
*is* the proof the sweep landed. Nothing had to be trusted, and step 3 was a confirmation rather
than a gate.

**Acceptance, as met:** the DM switches scenes from a list of thumbnails and every client follows,
each restoring its own camera rather than jumping. An NPC dragged from the GM layer to the Player
layer appears for players at that moment and not before. A token placed on Background is visible to a
player, cannot be picked up by them — `TokenNotMovable`, deliberately *distinguishable* from
`TokenNotFound` because the coin is on their screen and there is no existence to oracle — and a grant
on it is inert. A pet granted to the party can be moved by two different players; the monster beside
it by neither. A player whose corridor is fogged has no position rows for what stands in it, no health
band for it and no feed lines from it; erasing the fog returns all three and announces none of them.
`npm test` passes **1399/1399** and `npm run test:smoke` passes against the real dev deployment,
including the three-member union as both an argument and a projected field, four float64s per
rectangle, and a negative extent coming back normalised.

**The original plan follows.**

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
- ~~DM can click any sheet item to roll on a player's behalf.~~ — **already finished by the rolls
  milestone**, which gave the DM's Sheets tab roll buttons on every ability, save, skill and entry of
  whichever creature is selected. Ticked rather than re-planned: the bullet was written before that
  tab existed and describes what it does.
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

## ✅ Milestone 11 — Tokens

**Done.** The decisions are recorded in
[ADR 0013](adr/0013-a-coin-you-can-copy-place-and-label.md). Seven things it settled differently from
the section below, or found out by building it, so read them together:

- ⚠️ **The naming rule's third sentence was one word wrong, and it produced two coins with one
  name.** The section below says the suffix is skipped when one coin is added and *nothing is
  numbered yet*. Both readings of that agree on the case it describes, which is why the difference
  is easy to miss — and under the narrow one, duplicating a lone `Goblin` gives a second coin **also
  called `Goblin`**, then a third, because nothing ever becomes numbered. Asking whether the base is
  on the board **at all** fixes it and keeps the described case exactly. It is also the honest
  statement of what separates the two surfaces: the add dialog passes a name it is about to create,
  the duplicate control passes one already standing there.
- **"Add five of these" and "duplicate five times" became one code path, and that is what makes the
  acceptance line reachable.** `Goblin 1 … Goblin 5` falls out of an *add* with nothing numbered
  yet; a *duplicate* of an existing `Goblin` correctly gives `Goblin 2 …`, because the source is
  never renamed. The section below reads as though one control had to produce both, and it cannot.
- ⚠️ **The third blob delete was already broken, not merely waiting.** `deleteTokensInGame` deleted
  one blob per row, so two coins sharing one meant deleting an id that had already gone — which
  throws and aborts the whole transaction. Confirmed against the dev deployment
  (`storage id … not found`). It was unreachable only because nothing could make a twin, and
  `board.addToken` has always accepted a blob another coin already owns. It is also the one of the
  three that **must not** ask the new predicate: on a purge the answer is `true` for a twin that is
  also about to go, and asking per row would be forty thousand document reads in one transaction. It
  deduplicates instead, which is a stronger statement rather than a weaker one.
- **A secret-bearing table arrived and cost no new machinery.** `tokenMarkers` joined `tokens` and
  `tokenPositions` on invariant 8's first row because its predicate is already there — `maySee`, same
  question, same function, same module. No new choke point and no fourth column. The test for whether
  a table belongs on that list turns out not to be "is it new?" but *does a row have a non-secret
  twin, and does a predicate already tell them apart?*
- ⚠️ **`normaliseMarkers` needed a home the plan did not name.** The roadmap puts the fail-closed
  intersection in the renderer, which is right and insufficient: `board.markers`' `returns:` validator
  is `v.array(tokenMarkerValidator)`, so a value from a newer deployment would make the **query throw
  for every caller** and take the whole table's conditions subscription down, where dropping it costs
  one undrawn pip. Three call sites, three different failures.
- **Radix's `ContextMenu` does take an `open` prop**, so "it is uncontrolled" was the wrong reason for
  the right decision. The real one is that the point it positions at lives in its trigger's own state
  with no prop supplying it, and its content omits `side`/`align` so it cannot be re-aimed. The
  canvas half of the argument stands: one `<canvas>`, no DOM node per coin.
- **A pre-existing bug fell out of building the menu.** `BoardStage`'s space-pan claimed *any* button,
  so with space held a right-press began a pan and then opened the menu. Nothing could reach it before
  the board had a right-click gesture, and that handler's own docblock had always described the
  intended behaviour correctly.
- ⚠️ **`npm run test:smoke` caught a regression this milestone introduced, and it is the file's own
  argument arriving from an unexpected direction.** Unifying add and duplicate meant running the
  DM's *typed* name through `duplicateNames` — and its skip case returns the **base**, so a DM
  typing `Kobold of the Arch 3` on a board with no kobolds got a coin called `Kobold of the Arch`,
  with no way to create a trailing number at all. Nothing local saw it: every test asserted the
  numbering, and the bug was in the typing. The rule that survives is the honest one — **a name
  somebody typed is not a copy of anything, so nothing rewrites it**; only the coins the DM did not
  name are numbered. Note what this says about that script: its usual job is values a real
  deployment refuses, and here it was a *behaviour* nobody had thought to assert.
- ⚠️ **The browser confirmed rather than corrected, and that is worth recording because it breaks the
  run.** Every milestone in this file has found at least one thing by opening the app that lint and
  the suite did not — the layout milestone's `forceMount` panel, the DM-tooling milestone's veil above
  the player layer. This one found nothing in the application. What it did find was **three bugs in
  the driver script**: a malformed PNG fixture, a create-game flow that needs *Enter game* pressed on
  the reveal panel, and a map that has to be put on the table before the board draws anything. Stated
  plainly rather than dressed up as a finding, because the honest version is the useful one — and
  because the *reason* is probably that this milestone is five small surfaces over machinery that
  already existed, where those two were new layout and a new render order. What the browser did earn
  is the arithmetic, seen rather than asserted: a one-square coin at 100% carrying four conditions
  draws **two pips and a `+2`**, which is `floor((40 + 2) / 12) = 3` slots with the last spent on the
  counter.

**Acceptance, as met:** the DM adds five Goblins in one press and gets `Goblin 1 … Goblin 5`, each
with its own sheet — damaging one moves one health bar and the other four stay full. Duplicating an
existing `Goblin` continues the run rather than colliding with it, and the source keeps its name. The
DM puts one on a second map from the Tokens tab without it leaving the first, and pressing the button
again does not move it. A coin marked *poisoned* draws a pip; four conditions on a coin at the detail
threshold draw one pip and a `+3`, and zooming in reveals the rest. A player right-clicking a monster
gets their browser's menu and nothing of ours; a player right-clicking their own hero gets conditions
and the sheet. A player inspecting network traffic sees no marker row for a GM-layer coin — asserted
with a positive control, and covered a second time for free by the enumeration sweep, which
`boardFixture` now marks the hidden coin to keep honest.

**The original plan follows.**

**Inserted after Milestone 10 shipped**, and it is the first insertion in this file that fixes
something already built rather than clearing the way for something about to be. Whatever gets built
in this milestone, the decisions go in **ADR 0013**.

The tell is one sentence: **`board.removeToken` has been complete, DM-gated and covered by its own
tests since Milestone 2, and nothing in `src/` has ever called it.** A DM cannot delete a coin from
the running application. Five milestones of new features walked past that, which is what a gap looks
like when every milestone is about the thing it is adding.

The reference for this milestone is Roll20's token system, and the useful part of reading it was not
the feature list. It was **where Roll20 gets it wrong**: its own documentation tells a GM that eight
identical goblins must have their hit-point bars *manually unlinked* from the character sheet, or
damaging one damages all eight, and the community wrote a script (`DupCharToken`) to work around it.
That is a trap this project can simply not build, because a copy that makes its own character
document costs one function.

### A coin the DM can get rid of

Wire the existing mutation to the Tokens tab and to the board. Nothing on the server changes except
the blob-sharing fix below, which is not optional and is not small — see the ⚠️ at the end.

The delete control lives in the **editor**, not on the row: a destructive control on a row in a
two-hundred-row list is one mis-click away from deleting the ambush. Its copy has to say what it does
**not** do — the bound creature's sheet stays, and is deleted from the Sheets tab. That asymmetry is
deliberate. A coin and a creature are different things, `characters.remove` already exists and
detaches every token pointing at what it deletes, and a *board* mutation reaching into the characters
choke point to destroy a sheet is the coupling `TokenAddDialog` already refuses in the other
direction.

### Placement becomes something the DM can perform

`MapSetupPanel` tells the DM today that "tokens belong to the game, not to this map, so one villain
can stand on several." **That is true of the schema and false of the application.** `board.addToken`
is the only thing that creates a placement, and `board.moveToken` is only ever called with the
*active* scene, so a coin created on map A can never be put on map B and can never be taken off map A
without being destroyed.

Three DM-only functions fix it — `board.placeOnScene`, `board.removeFromScene`, and a
`board.placements` query answering *which boards does this coin stand on*. Deciding which board a
creature stands on is `addToken`'s decision made a second time, and `scenes.list` is DM-only because
a list of scene names is a spoiler, so a player has no route to another scene's id anyway.

`placeOnScene` is **idempotent** — if the row is already there it returns without writing, so
pressing the button twice does not teleport a coin the DM had already positioned. `removeFromScene`
is a **no-op rather than a throw** when the coin is not there, for `files.discard`'s reason: the
client calls it from a menu that may be a frame stale, and a second removal should be nothing rather
than a second error.

⚠️ **`board.placements` is per token, and that is its whole cost model.** It reads by token, so it is
invalidated by moves of *one* coin rather than by every drag on the board, and it is subscribed only
while the Tokens tab has a coin selected. The obvious alternative — one game-wide map of coin →
boards, so the whole list could show it — puts every placement on every scene into the read set of a
panel that is open all session, which is exactly the read invariant 2's read-side rule exists to
refuse. That is why `TokensTab`'s comment says today that the list cannot answer this. **The comment
gets narrowed, not deleted**: the *list* still says nothing, and the *selected coin* gets an answer.

### Duplicate, and "add five of these"

One press produces `Goblin 1 … Goblin 5`, and **each one gets its own character document and its own
vitals row.** That is the whole feature and it is the thing Roll20 needs a community script for. Five
goblins sharing one hit-point pool is a bug that looks like a feature until the second one takes
damage.

The naming rule lives in one browser-shared function, so the dialog's preview and the write are the
same code rather than two implementations that agreed on the day they were written. Three sentences:
the **base** is the source name with one trailing ` <digits>` removed, so duplicating `Goblin 3`
continues the goblins rather than starting the `Goblin 3`s; `n` is the highest number already in use
among names matching the base, a bare base counting as 1; and the suffix is skipped entirely when one
coin is added and nothing is numbered yet, so adding a single `Goblin` gets `Goblin` and not
`Goblin 1`.

**The source is never renamed.** `Goblin 1 … Goblin 5` reads better if the first duplication renames
`Goblin` to `Goblin 1`, and it is refused: it is a write to a coin the DM did not ask to change, it
re-pushes `board.tokens` to the whole table, and on a bound coin it leaves the sheet's name
disagreeing with the coin's unless the rename cascades into the characters choke point. An
over-length numbered name **refuses rather than truncating** — Milestone 1 shipped exactly the bug a
truncation causes, and the smoke test exists because of it.

What a copy inherits, and what it does not:

| Field | Copied? | Why |
| --- | --- | --- |
| layer, size, tint | yes | it is the same creature, and five goblins prepared on the GM layer stay prepared |
| art | **yes** | five goblins with no picture is not the feature — and this is the change with teeth, below |
| the character | **no — a fresh one** | the entire point |
| granted controllers | **no** | a grant is a decision about a person and a coin; an unattached copy is the DM's, which is Milestone 2's correction reached by a new route |

**One transaction, not two.** `TokenAddDialog` argues the other way for the *client* creating a
character and then a token, and that argument does not transfer: there the client owns the sequence
and a refused token leaves a sheet the Sheets tab deletes in two clicks. Here the server owns both
halves, so N coins and N sheets arrive together or not at all. Twelve half-created goblins is not a
state anybody should have to clean up. The count is capped, and **both** caps are checked before
anything is written with **two different messages**, because "too many coins" and "too many sheets"
are two different reasons the DM is stuck and the fix differs.

⚠️ **This is the milestone that makes token art shareable, and three unconditional deletes have been
waiting for it since Milestone 2.** `board.removeToken`, `replaceTokenArt` and `deleteTokensInGame`
each delete a token's stored image with no check, each carrying a comment naming the other two and
saying that whatever makes art shareable has to make all three conditional **at the same time**.
Duplication copies the image id. So: one new predicate — *is this blob some **other** token's art?* —
and all three ask it in the same commit, or deleting one of five goblins strips the art off the other
four and `Goblin 2` becomes a purple disc mid-fight. It is a sibling of the existing predicate rather
than a parameter on it, because that one answers `files.discard`'s question (*is anything using
this?*) and this one answers the delete path's (*is anything else?*), and collapsing them gives the
discard guard an argument no caller ever wants to pass.

### Conditions on a coin

A fixed vocabulary of D&D conditions — poisoned, prone, stunned, restrained, concentrating, dead and
the rest — drawn as small pips on the coin, set by the DM **or by the coin's controller**.

⚠️ **They are labels and nothing else, and that sentence is the whole design.** Nothing in `convex/`
reads a marker: no roll consults one, no health band is computed from one, no drag is refused because
of one. That promise gets a **guard test** rather than a comment, in the shape `corpusGuard.test.ts`
already has — it greps `convex/` for a **quoted module specifier** and fails if any module outside the
schema, the choke point and the board's public functions imports the vocabulary. Matching a quoted
specifier rather than a bare path matters for the reason that test already gives: several files will
legitimately explain in prose that markers adjudicate nothing, and a guard that fails on the code
written most carefully to respect it is a guard that gets deleted.

⚠️ **`prone`, `grappled`, `restrained` and `paralysed` are named in
[requirements.md](requirements.md)'s Excluded list — *no movement-detriment status effects* — and
shipping them here lifts nothing.** What that entry excludes is the *effect*: the app halving a speed,
granting advantage, or refusing a drag. What ships is the *word on the coin*, which is the same
register as a bestiary creature's loot being a line of text and not an inventory. Because the
exclusion names the word, the clarification is **written into that file's amendments section** rather
than assumed — which is the only route by which an exclusion ever moves, and the discipline that
makes Milestone 4's two amendments mean anything.

**Their own table, not a field on `tokens`, and the reason is who writes it.** All six writers of the
`tokens` document today are DM-gated, so *what can a player cause to be written to the table that
holds `layer`?* answers **nothing**, and that emptiness is worth a table to keep. A marker is the
first row a non-DM may cause to exist on the board. The secondary reason is invariant 2 seen from the
read side: `board.tokens` resolves a signed storage URL per token, so a marker on that document would
re-mint up to two hundred URLs every time somebody ticks *poisoned* — the exact cost ADR 0004 split
the two board queries to avoid.

**The row's existence means *this coin has conditions*,** the way a placement row's existence means
*this coin is on that board*. Clearing the last marker deletes the row rather than storing an empty
array, so a game with two hundred coins and one poisoned goblin holds one row.

**The gate is the existing `requireMovableToken`, and reusing it is a decision rather than a
shortcut.** [ADR 0012](adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md) separated
`maySeeLayer` from `mayPlayersMove` because sight and interaction genuinely differ. Marking is not a
third question: a player may mark the coins they may drag, and must not mark scenery they can see and
cannot touch. Because it is the same question it gets the same function — so a Background coin
refuses with `TokenNotMovable` (right: the player is looking at it, there is no existence to oracle),
a GM-layer coin refuses with `TokenNotFound` (right: parity preserved), and an ungranted player-layer
coin refuses with `TokenNotYours`. **Three refusals, no new constants, no new oracles.** The tripwire
goes in the docblock: the day *may mark* and *may move* differ is the day `lib/layers.ts` gets a third
predicate, and it will look exactly like the one ADR 0012 describes.

⚠️ **A marker union with no `never` arm, and that is honest rather than lax.** Invariant 9 asks a new
union for an allow-list switch with a `never` arm — but **there is no predicate here**, because
nothing decides anything from a marker, which is the entire point. A switch written to satisfy the
rule would be a guard that cannot fail, which is precisely what ADR 0012 argued out of `fogRects`'
leak-guard entry. What the invariant protects is met three other ways that *can* fail: a `Record` of
labels on the server, a `Record` of pip glyphs on the client, and a test pinning the validator's
members and order against the list — the direction the compiler cannot see. And the fail-closed
*runtime* behaviour is real and has a home: **the renderer iterates the vocabulary and intersects with
the stored array**, rather than mapping over the stored array, so a value written by a newer
deployment is not drawn rather than crashing a `Record` lookup in JSX across the whole board.

⚠️ **Fog does not hide a coin's conditions**, and that is `board.tokens`' argument rather than an
omission: filtering them means a `tokenPositions` read in a query whose whole virtue is being off the
drag path. What it would buy is closing a devtools leak *of exactly the kind ADR 0012 already accepted
for a fogged coin's name*. So that ADR's Hides table gains a clause — fog takes where it is, how hurt
it is and what it just rolled, **not that a coin by that name exists and not what condition it is
in** — and the standing answer is unchanged: a creature that must not be known about goes on the GM
layer, where the guard is whole.

### A context menu on the board

Right-click a coin: edit, layer, duplicate, take off this map, delete. Built on the Radix dropdown
primitive rather than hand-rolled, for the boring reasons — submenus, keyboard navigation, Escape,
outside-click and focus return, none of which is worth writing again over a canvas.

Right-clicking must **not** change the selection: the menu names the coin it opened on, and hijacking
the selection would move the arrow keys as a side effect of asking a question.

⚠️ **A player who does not control the coin gets no menu at all**, not a menu of greyed-out items. A
list of the things you may not do is an inventory of the game's furniture, and on a Background coin it
reads as the application being broken. ADR 0012's argument for a *distinguishable* refusal is about a
write somebody attempted; it is not a licence to volunteer the list. A player who *does* control the
coin gets exactly two entries — conditions, and open the sheet — both things they can already reach,
which is the smallest thing that is not nothing.

**Deliberately not done here:**

- **A Delete key on the board.** `useBoardKeys` owns Escape and the arrows, and adding an
  irreversible, undo-less destroy to a canvas the DM's hands are already on the keyboard for is how a
  session loses an ambush. If anything earns a key later it is *take off this map*, which is
  reversible.
- **Multi-select.** Declined on the record in `useTokenSelection`, and the argument is untouched: the
  arrow keys have to be aimed somewhere, and a batch move would have to answer what happens when the
  server refuses half of it. Worth noting that **duplicate is the feature multi-select was mostly
  wanted for** — five goblins in one press — so this reduces the pressure rather than deferring it a
  third time.
- **Deleting a coin deleting its creature.** Duplicating five times creates five sheets; deleting the
  five coins leaves five sheets, to be deleted from the Sheets tab.
- **A DM-only marker on a coin the party can see.** That is a second reason to withhold on a
  per-*field* basis, which needs `publicVitalsValidator`'s treatment — a discriminated union whose
  player variant has no member for it. Nobody has asked, and it is a whole design.
- **Z-order and rotation.** Both are cosmetics with no secrecy question, and `TokenLayers` already
  sorts big-under-small deliberately, so a z-order field would have to argue with it first.
- **Anything at all that reads a marker.** The guard test is what makes that a promise rather than an
  intention.

**Acceptance:** the DM adds five Goblins in one press and gets `Goblin 1 … Goblin 5`, each with its
own sheet — damaging one moves one health bar and four stay full. The DM puts one of them on a second
map from the Tokens tab without it leaving the first, marks it poisoned, right-clicks it and deletes
it, and **the other four still have their art.** A player right-clicking a monster gets nothing; a
player right-clicking their own hero gets two entries and can mark it concentrating. A player
inspecting network traffic sees no marker row for a GM-layer coin — asserted with a positive control,
like every other payload scan in the suite. `npm run test:smoke` round-trips the marker union as both
an argument and a projected field, and compares a duplicated coin against its source field by field.

---

## ✅ Milestone 12 — Board polishing

**Done.** The decisions are in [ADR 0014](adr/0014-what-a-coin-says-about-itself.md). Five things it
settled differently from the section below, or found out by building it:

- ⚠️ **The name clamp was reversed rather than tuned, and the *box* stayed.** The section below says
  the name renders at its natural width; dropping the `width` outright would have left every label
  left-aligned against the coin's centre, because Konva's `align` means nothing without one. Keeping
  the box and deleting only `ellipsis` is the whole change: Konva measures the line, centres it in
  the box, and a line wider than the box overflows *symmetrically*. Two characters, not a
  measurement problem.
- **The coin's annotation scheme survived being extended and then had to be corrected by looking at
  a coin.** `TokenCoin` has claimed since the pips landed that its marks are *disjoint by
  construction*, and the two new badges were placed by consulting that sentence — upper-left and
  lower-left at 45°, mirroring the hidden-from-party pip. That is six distinct *positions* and it is
  **not** a proof that no two touch: a disc centred on the rim has half of itself outside it, and
  the health bar spans the coin's full width, so at 45° the armour-class badge grazed the bar's left
  end. Flattened to 30°. Visible in a browser and in nothing else, which is the entry that most
  earns this list.
- ⚠️ **Fifty dice in the physics engine works, and that was genuinely unknown.** The renderer has no
  count cap of its own, so the grammar is the rigid-body count — and the section below says that if
  it turned out to be unusable the fix was a *renderer* cap and never a second grammar. It did not:
  50d20 settles in about eight seconds and every face is readable. The dice do cover most of a
  fitted map on the way down, which is a thing to know rather than a thing to fix.
- **The `RollProvider` hoist was safe for a reason the warning against it already named.**
  `useRoll.ts` said a context whose value is a fresh object per render must not cross `RightPane`'s
  memo boundary. Both of its values are memoised on human-action dependencies and its senders are
  session-stable, so it satisfies that condition rather than being an exception to it — and the
  warning is kept, because it is still right about the general case.
- ⚠️ **A duplicate React key, introduced by this milestone and caught only in a browser.** The grid
  calibrator and the new background picker are siblings, and both were keyed on `active._id` so that
  switching maps remounts them — which is two children with the same key, whose documented
  behaviour is that a child may be *duplicated or omitted*. Nothing looked wrong on screen; it was a
  console warning during a scripted run. A key only has to be unique among siblings, so a word each
  fixed it. Worth recording because the tests could not have found it and neither could the eye.

**The original plan follows.**

**Inserted after Milestone 11 shipped**, and after twenty minutes of using it. The decisions go in
**ADR 0014**.

Nine things, found by opening the board rather than by reading it. Seven are polish in the ordinary
sense — a control filed where nobody looks for it, a circle too small to read, a name clipped at the
zoom people actually play at. **Two are not**, and they are named first so nothing further down this
section reads as though they were:

| Not polish | What it actually is |
| --- | --- |
| **Armour class and passive perception on a coin** | The first amendment in this project that **lifts a secrecy guarantee** rather than a rules exclusion. A creature's armour class reaches no player today, and [ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md) uses it as *the* worked example of the row-shaped secret. |
| **d2, and fifty dice** | Widening `ROLL_PATTERN`, which CLAUDE.md invariant 10 calls the cap itself: *"the die-count cap is load-bearing and is the grammar rather than a separate check."* |

Both were put to the maintainer with the cost stated, and both were chosen deliberately. That is the
door [ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md)'s two reversals came
through, and it is the only door either of these gets to come through either.

### The defect

**Right-clicking a coin and choosing *Edit this coin* does nothing at all.** Both it and *Open the
sheet* are wired to the same handler, and that handler only selects — nothing switches the
right-hand tab, because the tab is local state inside `RightPane` with no way in from outside. Two
prop docblocks in `BoardTokenMenu` promise a tab switch that cannot happen.

⚠️ **This shipped one milestone ago, in the commit whose own plan called the menu "a surface over
five things that already work".** Five of the six entries were; this one was a surface over
something that did not exist, and nothing caught it because there is no test that can — the wiring
compiles, the mutation is never reached, and the failure is a tab that stays where it was. It is
worth naming as the shape of bug this project's guard tests are structurally unable to find: they
prove what a *server* will not send, and this is a client that asks for nothing.

The fix lifts the tab to `GameShell` beside `selectedTokenId`, `clearSelection` and `forgetToken` —
which is where it should have been the moment the board needed to point at a panel. `showTab` crosses
`RightPane`'s memo boundary, so it is a stable `useCallback` for the reason that pane's header
already gives about the divider.

### Where things live

- **The Add Token button and the layer picker move to the Tokens tab.** They are under DM Tools →
  Map today, which is where you set up a *map*. Nothing is re-implemented: `TokenAddDialog` needs a
  scene, and `scenes.active` is the **same cache entry** `useBoard` already holds, so this costs one
  more reader of an existing socket and no server execution.
- **The roll-mode buttons, the ad-hoc dice and the DM's grid adjuster become one toolbar on the
  map.** `RollModeBar` and `CalibrateToggle` **move** rather than being copied, and `DiceComposer`
  gives up its five presets — which have moved and grown to eight faces plus a count — while keeping
  the typed-expression field pinned under the feed, where typing belongs. The feed gains the height.

  ⚠️ **This is the one item with an architectural cost, and it is worth stating rather than
  discovering.** A toolbar on the map that sets the roll mode forces `RollProvider` out of
  `RightPane` and up to `GameShell`, which `useRoll.ts` explicitly warns against: *"a context whose
  value is a fresh object per render is fine inside that boundary and would be a disaster crossing
  it."* It is safe here for a reason the docblock has to be rewritten to say rather than left to
  imply — both values are memoised on deps that move only on a human action, and the senders are
  stable for the session by construction — and *"it turned out to be fine"* is not the same sentence
  as *"the warning was wrong"*. The warning is still right about the general case.

### What a coin says about itself

- **A bound coin shows its armour class in a red circle and its passive perception in a blue one.**
  See the table at the top: this publishes armour class, and the scope is the whole of what makes it
  defensible. A player receives both **only for coins they already see** — a GM-layer coin is not
  sent at all and a fogged one is already dropped by `boardCharacterAccess`. Nothing else on the
  stat block moves, and `maySeeCharacter` is untouched, so `characters.sheet` still refuses an
  ordinary NPC. The numbers ride on **both** variants of `publicVitalsValidator`, which leaves that
  union's actual guarantee — *the player-facing variant has nowhere to put a hit point* — true
  word for word.

  ⚠️ **Passive perception needs a derivation that does not exist yet.** `passivePerceptionOf`
  returns `null` for every hero, because a hero's is computed from ability scores, level and the
  Perception flag while a creature's is stored pre-calculated. One accessor answering it for both
  sheet variants is new code, and `null` must stay `null` — a hand-built goblin has no recorded
  passive perception, and printing 10 would invent a statistic the DM never gave.

- **The name is no longer clipped to the coin's width.** That clamp was deliberate and its reason —
  names smearing over each other at low zoom — is real; the maintainer was shown the trade and chose
  the overlap. The docblock keeps the argument and records which way it went, because the next
  reader should find a decision rather than an absence.

- **The condition pips get bigger**, to the size of the new circles, which is what makes *"like the
  AC example"* literally true. ⚠️ They are coupled to `COIN_DETAIL_MIN_DIAMETER` by an assertion in
  `markers.test.ts` — a pip row must fit two pips at the threshold — so the threshold rises with
  them and **coin detail now appears at slightly higher zoom.** That is a real behaviour change and
  it is in the acceptance criteria so it cannot be quietly reverted.

- **The DM gets the conditions submenu too.** It exists already, in the non-DM branch only. One
  extraction, no new mutation and no new gate: `setMarkers` already admits a DM.

### The map's own colour

A scene gets a background colour, so the area around the map is not always white.
`convex/lib/scenes.ts` states the licence in as many words — *"Nothing in a scene is a secret"* — so
this collides with nothing, and it follows `gridVisible`'s pattern step for step with **one
difference**: `gridVisible` could be required because it shipped with the table, and `scenes` is now
populated, so the field is optional and read through exactly one accessor.

⚠️ **`TINT_PATTERN` must become shared rather than copied.** It is a module-private `const` in
`convex/board.ts`, and its own reason — *"a CSS colour function or a `url(...)` would be a string the
browser interprets on every other player's screen, put there by whoever runs the game"* — applies
with **more** force to something painting the whole viewport than to a coin. One regex, in
`convex/lib/`, or this milestone ships the second copy that agreed once.

### The dice

Eight faces — d2, d4, d6, d8, d10, d12, d20, d100 — and a count from 1 to 50. Only **d2** is new to
the face allow-list, and the count is the part that moves invariant 10.

`MAX_ROLL_DICE`'s own docblock names what has to move with it: *"the regex is the copy that decides…
when one moves, both move."* Six sites, plus CLAUDE.md. **The consequence to state rather than
discover** is that the sheet grammar and the ad-hoc grammar are one grammar, so a sheet entry may now
legitimately say `30d6`. That is the price of not having two caps that agreed once, and it was
chosen over the alternative with that sentence in front of it.

⚠️ **The renderer has no count cap of its own, so raising the grammar raises the rigid-body count
directly.** Fifty dice in the physics engine is the one number in this milestone that nothing but a
browser can answer. If it is unusable the fix is a *renderer* cap that shows a subset and says so —
**never** a second grammar.

### Deliberately not done here

- **A per-player or per-coin choice of which badges show.** Two circles is what was asked for; a
  preferences model is a whole design and nobody has asked.
- **Anything else off the stat block on the coin.** Attacks, damage, saves and notes stay where they
  are. The argument above is specifically about two numbers, and it does not generalise.
- **A second dice grammar for ad-hoc rolls.** Considered and refused above.
- **Exporting or screenshotting the board.** The background colour is painted in the DOM rather than
  in Konva, so it would not appear in a canvas export — which nothing does today, and which is the
  cheaper trade than putting a full-viewport rectangle into the per-pan-frame rasterisation path.

**Acceptance:** right-clicking a coin and choosing *Edit this coin* selects it and lands on the
Tokens tab, and *Open the sheet* lands on the sheet — they are no longer the same handler. Add Token
and the layer picker are on the Tokens tab and DM Tools → Map carries neither. The DM sets a map's
background colour and every player sees it after a reload. A bound coin shows a red AC circle and a
blue passive-perception circle; an unbound coin shows neither; a hand-built goblin with no recorded
passive perception shows the red one **and no blue one**. A player sees **no AC badge on a GM-layer
or fogged creature**, asserted with a positive control, because the whole defence of publishing it is
that the scope did not widen. `Venerable Sapphire Dragon` reads in full at the zoom where the board
fits. Roll modes, all eight dice, the 1×–50× count and the grid adjuster are on the map, and the mode
still tints loudly when it is not Normal. `1d2` rolls and shows a d2, `50d6` rolls, and `51d6` is
refused with the grammar's own message.

---

## ✅ Milestone 13 — Maps, fog and barriers

**Done.** The decisions are recorded in
[ADR 0015](adr/0015-a-map-that-starts-covered.md). Seven things it settled that the section below
planned differently or did not plan at all, so read them together:

- **The reveal stamp inverted, and it would have shipped as the failure ADR 0012 built the timestamp
  to prevent.** The section below predicted this and it was still the highest-value catch:
  `convex/fog.ts`' header stated *draw narrows, erase and clear widen* as a fact about fog rather
  than as a fact about a **lit** base. One predicate, `fogActReveals`, and its runtime default is
  **stamp** — the opposite direction from every other fail-closed default in this codebase, because
  a stamp too many costs one flourish and a stamp too few replays an evening.
- ⚠️ **"Both deletes become conditional" was right for one of the two, and the other needed the
  opposite fix.** `deleteScenesInGame` removes *every* scene in the game, so `otherSceneReferences…`
  answers `true` for a duplicate that is also on its way out — it would keep the blob for ever. Its
  real failure is a **second `ctx.storage.delete` of the same id**, which throws a plain `Error` and
  aborts the whole purge; `deleteTokensInGame` had already hit that and documented it. Deduplication,
  not a condition.
- 🚨 **Scene notes were one line away from an invariant-1 leak that this section does not mention.**
  `scenes.active` is ungated and every player subscribes to it, so `notes` on `publicSceneValidator`
  publishes the DM's prep to the table — in the milestone whose whole subject is what players may
  know. The projection is split, and a positive-control test scans a real player payload for it.
- ⚠️ **The arrow-key promise below is false as written.** *"Intermediate positions are unchecked"*
  plus a **leading-edge** throttle means the first keypress of a run fires an unchecked write
  immediately, that write crosses the wall, and the settling write then measures `from` from the far
  side and accepts. Arrow keys walked through walls entirely until `nudge` learned to suppress its
  intermediate write for a blocked step.
- **A third gesture hook was unavoidable, and the reason is a doorway.** A wall needs a *two*-point
  minimum and must not drop a trailing duplicate of the first vertex — which for a polyline is how a
  DM seals a room. Reusing `usePolygonDraw` would have put an invisible gap in every sealed room.
- ⚠️ **`storageGuard.test.ts`'s "positive control is that it fails today" has no committable form**,
  because a red test cannot be committed. Delivered as both halves: an instrument test that keeps the
  superseded table-level derivation and feeds both a synthetic two-blob table, and the failing run
  pasted into the commit body.
- ⚠️ **Three parallel branches left three gaps that only the merge could close**, and they are worth
  naming because the next milestone is larger and will be built the same way: `copySceneFog` and
  `scaleSceneFog` did not know about polygons, `scenes.duplicate` did not copy walls and
  `replaceImage` did not scale them, and `MAX_FOG_POLYGON_POINTS` sat behind `requireDm` where the
  browser could not reach it. **`npm run test:smoke` caught two stale `fog:draw` call sites that
  `npm run lint` and `npm test` were both green over** — the sixth outing of that class, and the
  first where the staleness was created by two branches rather than by a rebuild.

**Acceptance, as met:** `convex/fog.test.ts`'s existing 1270 lines pass **untouched**, which is a
mechanical check rather than a promise — every fixture in that file creates its scene with `fogBase`
absent. A scene set to dark withholds a DM-placed creature's position row, health band and feed
lines with **no shape drawn at all**, each asserted in the suite that owns that payload and each with
its positive control. A polygon spelling out a rectangle answers **identically to `rectCovers`** at
all four edges, all four corners and ±0.001, in both windings, and a rectangle abutting a polygon has
exactly one of them claim every point on the seam. A player cannot drag a token across a wall and the
DM can, **and the advisory ceiling is asserted as a positive** — the identical move unsettled is
accepted, because a documented hole no test names becomes a bug report. Duplicating a map and
deleting the original leaves the copy's image intact, and `purgeGame` over two scenes sharing a blob
deletes it exactly once. 1682 tests over 42 files; **`npm run test:smoke` passes 312/312 against the
real dev deployment**, including the fog base, both shape kinds, the fixture pair in both directions,
and walls.

⚠️ **One acceptance item is NOT met and is outstanding: nothing has been driven in a browser.**
Every canvas-facing claim in this milestone — the `destination-out` punch-out under a covered base,
overlapping shapes, the polygon and polyline gestures, the trace box, the table-view badge — is held
by reasoning and by hand-written argument, and **there is nothing in `npm test` that can look at a
canvas**. Every previous milestone found something by opening the app. This one has not been opened.

**The original plan follows.**

**Inserted after Milestone 10 shipped.** The decisions go in **ADR 0015**.

[ADR 0012](adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md) shipped a fog that is
honest about itself: real for tokens, polite for the map, and a map tool rather than a secrecy tool.
The honest thing it does not do is the one thing a dungeon crawl needs — **start covered.** Today the
DM paints darkness onto a lit map; Roll20's model, and every published dungeon workflow, is the
inverse: the page is dark and the GM opens it up room by room. Everything else here is the map tooling
that stops at one image: a scene cannot be reordered, duplicated, annotated or re-imaged, and the
picker downloads twenty-five full battle maps to draw twenty-five thumbnails the size of a postage
stamp.

**And there are no walls.** Roll20's Dynamic Lighting is a ray-tracer with per-token vision, explorer
mode and a performance page telling you which browsers it works in. ⚠️ **None of that is built here,
and the omission is load-bearing rather than a matter of budget.** What ships is Roll20's *barriers*
with only their movement half: a token cannot be dragged through a wall, and nothing about a wall
decides what anybody can **see**. The reason is written into [CLAUDE.md](../CLAUDE.md) already —
per-player fog, reveal-as-you-walk and line of sight each make a stored row *a statement about what
one caller may know*, and that is the day invariant 8's reader/predicate table needs a fourth row.
This milestone is specified so that day does not arrive.

### Fog that starts covered

A scene gains a base — **lit, and you black areas out**, or **dark, and you light areas up** — and
under the second one a drawn shape is a hole in the dark rather than the dark itself. Everything else
about fog is unchanged: the same shapes, the same eraser, the same server-side filtering of positions,
health bands and feed lines.

⚠️ **Two defaults, meaning opposite things, and both are right.** An *absent* base means lit, because
every scene stored before this exists was calibrated under that model and defaulting them to dark
would black out every map in every game on the schema push — absence is history. An *unrecognised*
base means dark, fail-closed on `isMonsterSheet`'s terms and emphatically not `groupOf`'s tolerant
ones, because a schema push is not atomic and a row written by a newer deployment must read as *more*
hidden by an older one. Both are read through one accessor apiece.

⚠️ **The early return inverts, and it is the whole cost model.** Fog is affordable today because a
scene with no shapes returns before the positions read. Under a covered base, *no shapes* is the most
hidden a map can be. So the free case is no longer "nobody has drawn a rectangle" — it is **"this
scene is in the state it shipped in"**, which is still every game until somebody uses the feature, so
the property invariant 2 names survives. What does not survive is the *reason*, and that invariant's
own wording has to be corrected in the commit that makes it false. The new sentence to add: **turning
a scene to dark buys the positions read for the rest of the session, without drawing anything.**

The rule that a coin anybody at the table controls is never veiled stops being a courtesy and becomes
load-bearing twice over: under a dark map with nothing revealed yet, *everything* is hidden, so
without it every player loses their own hero on the first click of the toggle.

⚠️⚠️ **The reveal stamp inverts, and this is the highest-value catch in the milestone.**
`convex/fog.ts`'s own header states the rule — two of these functions widen an audience and one
narrows it, which is why the reveal timestamp is on `erase` and `clear` and deliberately not on
`draw`. **That is a statement about a lit base and is exactly backwards under a dark one.** Get it
wrong and rubbing out a reveal replays a session's worth of rolls across the map — the failure ADR
0012 built the timestamp to prevent, arriving through the mechanism it built. One small predicate, one
place, and a fourth union with a `never` arm whose runtime default is **the opposite direction from
every other fail-closed default in the codebase**: it defaults to *stamp*, because a stamp too many
costs one missing flourish and a stamp too few replays an evening. Both docblocks must say why the two
defaults point opposite ways, or somebody will "fix" one of them. `feed.test.ts`'s per-mutation
assertion grows a second axis: **per act × per base.**

Flipping the base **must not delete the shapes**. Inverting a map exactly — what was dark is now lit —
is arguably a feature and definitely a surprise, so the confirm dialog says it in words; deleting is
what *clear* is for, and a flip that destroyed an afternoon's drawing with no undo is unforgivable.

⚠️ **Two client inversions will be missed if they are not written down.** The DM's crossed-disc
"hidden from the party" cue on a coin has its own early return and its own skip of the positions
query, and both invert; and the fog layer's *nothing drawn, draw nothing* early return inverts into
*nothing drawn, paint the whole map*. A half-inverted fog is a map that lies, which is why the base
lands as **one commit** covering the server, both, and the tools panel — where the Clear button's
label and its destructive confirm must also become a function of the base, since under a dark map
"clear all fog" *darkens everything* and a destructive confirm saying the opposite of what it does is
the worst copy bug available here.

### Shapes that are not rectangles

Rectangle and polygon, which is exactly what Roll20 offers and there is no third. Stored on the
existing shape row with the four numbers **reinterpreted as the bounding box**, computed server-side
and never taken from the client — a client-supplied box that is wrong is a shape drawn on every screen
that hides nothing.

**The box is the whole reason a polygon is cheap.** The existing rectangle test rejects a polygon in
one comparison unless the point is inside its box, so the ray-cast runs for the handful of shapes that
could possibly contain the point and never for two hundred.

⚠️ **The point-in-polygon edge convention has to agree with the rectangle one exactly**, and it does:
half-open in one axis, one edge inclusive and the opposite exclusive. So a polygon spelling out a
rectangle answers *identically at all four edges*, and two abutting shapes of different kinds tile
with no seam and without both claiming the line. **That equivalence is a test, not a paragraph**, and
it is the keystone of the milestone's geometry.

⚠️ And the one documented soft spot changes meaning. The containment test fails open on a non-finite
coordinate, which ADR 0012 calls "the only fail-open branch in the fog design". **Under a covered base
that fail-open inverts to fail-closed** — a token with a broken position is withheld rather than
published — so ADR 0015 has to say so rather than leaving a reader to trust ADR 0012's sentence.

The draw mutation takes a **discriminated union** of the two shapes rather than flat numbers plus an
optional point list. It costs three call-site edits and it buys a `never` arm; the additive
alternative accepts a call carrying both spellings and silently prefers one, which is two states for
one meaning and the failure [ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md) settled.

### Walls that stop a token, and nothing else

The DM draws a polyline on a scene; a token may not be dragged along a path that crosses it. Decided
on the **centre path**, for the reason fog uses a centre and not a footprint: no token size and no grid
size enter the arithmetic, so an uncalibrated grid cannot silently switch it off.

**The enforcement is split, and the split is the design.**

- **The client is where the feel is.** The drag tests each frame against the *last accepted* point and
  simply does not accept a blocked one — the token slides up to the wall and stops, which is what
  Roll20 does and is the entire user-facing feature. Testing against the last accepted point rather
  than the drag origin is what makes walking round a wall work, and makes the block path-dependent,
  which is what a person expects. Skipped for the DM.
- **The server is a backstop on the settling write only**, `&&`-ed at the call site and never folded
  into `requireMovableToken` — whose docblock's argument against a `fogRects` read applies word for
  word, because that handler runs ten times a second and a range read there turns every wall the DM
  draws into a conflict against every in-flight drag. A drag produces roughly twenty unchecked writes
  and exactly one checked one.

⚠️ **What that leaves advisory, written out rather than glossed.** Intermediate positions are
unchecked, stored and broadcast, so a client that never settles can park a token anywhere and everyone
watches it walk through the wall; and because those unchecked writes move the *from* point, a client
that wants to cross a wall crosses it in unchecked steps and the settling check then sees a legal hop.
Large tokens are tested by their centre, so a 2×2 ogre's body can overlap a wall its centre missed.

⭐ **Checked against the threat model this is clean rather than a compromise, and the sentence is the
one that matters: unlike `playerId`, and unlike fog, nothing behind a wall is a secret.** A wall
withholds no row, no field and no payload, so invariant 1 does not enter at all and the advisory
ceiling costs nothing in the register where cost is measured. *"Server-side refusals that stop a
misclick are worth having and are not claimed to be more than that"* is already the written rule, and
this is the first feature to which it applies with no residual worth arguing about.

Three questions, answered:

- **Walls do not block the DM.** They place creatures inside sealed rooms, drag the party through a
  door they have just narrated open, and rearrange scenery. A wall the DM cannot cross is a wall the
  DM cannot use.
- **Background-layer tokens are moot, and that is the answer.** Players already may not move them, so
  nobody subject to walls can move one. **No new predicate and no change to `lib/layers.ts`** —
  scenery is placed, not walked.
- **The refusal is its own kind and is not an existence oracle.** Every wall goes to every client, so a
  blocked player has been sent the thing that blocked them and there is nothing to enumerate.
  Answering *not found* about a coin on their own screen would be a lie that reads as a bug — ADR
  0012's inversion argument, reused.

⚠️ **Walls are sent to everyone and drawn for the DM only.** The client cannot block a drag against
geometry it does not have, and a wall traced over the map's own drawn wall leaks nothing the fully
downloaded map does not already leak. The genuine residual is **a barrier where the map shows no
wall** — an invisible ward, a magically sealed door — which is information the image does not carry
and which devtools recovers. One sentence in the ADR's costs section and one in the wall panel's copy,
because a partial guard described as a whole one is worse than no guard.

### Scene management, and the second set of unconditional deletes

Notes (DM-only, per scene), reorder, duplicate, and **replace a scene's image without losing its grid,
its fog, its walls or where everything is standing**.

⚠️ **Every coordinate in this application is in the stored image's pixel space**, so replacing the blob
moves everything. The mutation refuses an aspect-ratio change beyond a whisker — *"that map is a
different shape; add it as a new map instead"* — and otherwise multiplies one scale factor through the
grid, every placement, every fog shape and every wall. A uniform similarity transform, so shapes
snapped to the old grid stay snapped to the new one. Same-size replacement, which is the common case,
skips every rewrite.

⚠️ **A duplicated scene shares the map blob, because invariant 6 forbids copying it — and that breaks
two unconditional deletes exactly as duplication broke three in the milestone before.** `scenes.remove`
and the game purge both delete a scene's image with no check. **Both become conditional in the same
commit**, or duplicating a map and then deleting the original blanks the copy. It is the same rule the
tokens milestone applies to a coin's art, arriving for a second table, and it is worth noticing that
two milestones in a row
found the same latent bug: **an unconditional delete is a bet that nothing will ever share the thing,
and this project has now lost that bet twice.**

What a duplicate always takes: the image, the grid, the fog base, the notes and **the walls**. What it
takes only on request: the token placements and the fog shapes. The sentence that decides the split is
worth keeping — *a wall is a property of the map; a placement and a fog shape are where things are
tonight.* One choice rather than three checkboxes, because that sentence answers every case a DM
actually has.

### Thumbnails, and the guard that does not catch them

The scene picker fetches the full battle map for every row. Generate a small derivative in the browser
**from the already-downscaled blob** so a 23-megapixel source is decoded once rather than twice, store
it, and fall back to the full map for every scene uploaded before this exists.

⚠️ **`storageGuard.test.ts` will pass and should not.** It derives one predicate per *table*, and
`scenes` already has one, so a second blob field on the same table sails through with those bytes
unprotected by `files.discard`. Closing that is part of the milestone: the guard scans for the storage
id **field names** and asserts the owning predicate mentions each — derived rather than listed, so it
cannot become the fifth place somebody forgets the fifth field. **Its positive control is that it
fails today**, against a predicate that only asks about the map.

A map upload now stores two blobs, so the client's discard path takes an array — one transaction, one
round trip, and half as many ways for a catch to be partly right.

⚠️ **The orphaned-blob problem gets worse, and this milestone does not fix it.** A crashed tab now
leaks two blobs instead of one. Still the game-editor milestone's, and named here rather than left
implicit.

### Align a grid by tracing

For a map that already has a grid printed on it: drag a box over a block of the map's *own* squares,
say how many squares it spans, and the app solves the size and both offsets.

**The offset falls out of a modulus**, which is the whole of the offset solve. The grid draws at
`offset + k × size` and walks back to the first line at or before zero, so any member of the
congruence class is equivalent, and the traced box's edge sits on a printed line. There is nothing to
iterate and nothing to fit.

⭐ **What replaces Roll20's missing independent X and Y is better than independent X and Y.** Roll20's
own blog calls their alignment tool "click, drag and pray" and says what it lacked was per-axis
scaling. Cells here are square and stay square — declined for the third time, because token size stops
meaning anything otherwise — so the size is the mean of the two measurements. **But the disagreement is
measured and shown**: `140.0 px across · 139.6 px down · 0.3% out`, and past a threshold it says
plainly that the map's squares are not square, that this application's are, and by how much. The app
tells the DM how wrong the assumption is, which is precisely what praying could not do, and it
delivers the *intent* of per-axis scaling inside one number rather than pretending the intent was
unreasonable.

It composes with the existing calibration handles by being a different object and saying so: the
handles box is square by construction and anchored to the grid origin, the trace box is free-aspect and
anchored anywhere, only one is ever on screen, and both write through the one existing grid write path
at its three rates.

⚠️ **The rubber-band gesture is about to be written a third time** — the fog layer has it, the trace box
needs it, the wall tool needs a variant. Extract it before the second copy exists, not after the third.

### The DM sees what the table sees

The existing "your view of the board" toggle shows the DM the player's *layers*. It must also apply the
*fog*, and it must be obvious that it is on — a persistent badge on the board rather than a control
buried in the right pane. Roll20's documentation says GMs get this wrong constantly, and a toggle you
cannot see from the map is why.

⚠️ **It is a preference and never a permission**, which is what that hook's docblock already says about
the layer half. The fog half inherits the sentence verbatim: it is this browser choosing what to paint
of a payload it is fully entitled to. It is not a filter and must never be described as one.

**Deliberately not done here:**

- **Per-shape hide-or-reveal.** It makes containment order-dependent — last shape wins — which turns a
  short-circuit into a full walk, turns the veil into a stencil composite, and hands the DM Roll20's
  famously confusing layers-of-paint model. **The trigger to revisit is a DM wanting a hole inside a
  reveal**, and not before.
- ⚠️ **Per-player fog, reveal-as-you-walk, and line of sight of any kind.** These are the three things
  [CLAUDE.md](../CLAUDE.md) names as needing a fourth row in the reader/predicate table, and the wall
  system is specified movement-only precisely so it does not become the third. A wall that blocked
  *sight* would make `walls` and `fogRects` secret-bearing tables the same day.
- **Doors, one-way barriers, wall groups and per-token exemptions.** Roll20 has all four and each is a
  small design of its own.
- **Footprint-based wall collision**, **freehand fog**, **automatic grid detection from the image**,
  **independent X and Y cells**, **server-side map tiling or masking**, and **undo** for any of it.
- **A cross-game scene library and blob deduplication.** Game-editor milestone, along with the sweeper
  the thumbnails make more urgent.

**Acceptance:** a scene set to dark hides every DM-placed creature from a player's payload with **no
shape drawn at all** — no position row, no health band, no feed line — and revealing one room brings
back exactly what is standing in it and announces none of it. A player cannot drag a token through a
drawn wall and the DM can. A traced box over three of a printed map's own squares lands the grid
exactly and prints how far out of square the map is. Duplicating a map and then deleting the original
leaves the copy's image intact. The scene picker draws twenty-five rows without fetching twenty-five
battle maps. `npm test`'s existing 1270 lines of fog assertions pass **untouched** — if any of them
needs editing, the absent-base default is wrong.

---

## Milestone 14 — The 5e 2024 conversion

**This milestone replaces the character-resources milestone that stood in this slot** — spell slots,
limited uses and the short rest. Replaced, and **absorbed rather than cancelled**: everything that
milestone planned still gets built here, because the 2024 rules contain all of it. What changes is
that it stops being the point. The decisions go in **ADR 0016**, which now supersedes a great deal
more than that milestone's ADR was going to.

⚠️ **Read this paragraph before any other. This is the first milestone that replaces a system rather
than extending one, and it is the largest in the project by every measure.** Eleven milestones have
added features to D&D Lite. This one **deletes D&D Lite** and puts the **5e (2024) SRD 5.2.1** in its
place at character levels 1–5, keeping seven named things from what is there now. Every milestone
before this could be described as *"and also"*; this one is *"instead"*. Nothing about the board, the
feed, the seats, the fog or the coins changes — this is a rules and content milestone that reaches
every sheet-shaped surface in the application and nothing else.

⚠️ **It should be several branches, and the ordering below is not decorative.** A single branch that
renames a vocabulary, rewrites two corpora, widens a schema and redraws four panels is a branch
nobody reviews. The sequence in *Ten steps, in this order* near the end is the deliverable's shape.

### The seven things that survive, and what each costs to keep

Named first, because everything below is either one of these or a consequence of the SRD.

| Kept | Status after conversion | What keeping it costs |
| --- | --- | --- |
| The **Level + Name + Species + Class + Archetype** builder | Survives, with one field changed and one gated | `race` becomes `species` throughout; the archetype step is **empty at levels 1–2** because 2024 chooses a subclass at level 3 |
| A **premade library of popular builds, levels 1–5** | Survives, rebuilt | 72 hand-written sheets become **60**, and every number on all 60 is re-derived from the SRD |
| **Levels 1–5 only** | Survives, and is now the main scope lever | Caps spell level at 3, so 156 of the SRD's 312 levelled spells are in range instead of all of them |
| **CR scaling up and down** | Survives, unchanged in design | `convex/lib/bestiary/benchmarks.ts`' ten rows must be **re-derived** from SRD stat blocks, because they were fitted to a hand-written corpus that is being replaced |
| **The ad-hoc dice tray** — d2, d4, d6, d8, d10, d12, d20, d100 | Survives untouched | **Nothing. It already arrived**, in the board-polishing milestone above — see the note under *What needs nothing at all* |
| **No inventory**; every character issued weapons and armour for its class and archetype | Survives, and gets *more* precise | The SRD's starting-equipment packages are the source, reduced to the line of text `LibrarySheet.equipment` already holds |
| **No weight, no encumbrance, no XP, no money, and none of the biography fields** | Survives; most were never built | The two that *were* — a spell's level as a pure label, and speed's default — both move, for reasons below |

**The biography exclusions are the cheapest thing in this milestone and are listed for completeness
rather than work.** No personality trait, ideal, bond, flaw, language, background, ally, organisation,
backstory, alignment, faith, gender, age, height, weight, eye or hair field exists in the schema today
and none is added. The only one with any reach is **background**, and it has a great deal of reach —
see the next-but-one section.

### The reference, and the one that must not be used

**Primary and authoritative: [`downfallx/dnd-5e-srd-markdown`](https://github.com/downfallx/dnd-5e-srd-markdown), branch `master`.**
Genuinely SRD 5.2.1, organised by topic. The files this milestone reads, with sizes, because the size
is what tells you whether a question is answerable by reading or needs a script:

| File | Size | What it settles |
| --- | --- | --- |
| `character-origins.md` | 17 KB | The nine species and the four backgrounds |
| `classes.md` | 298 KB | Twelve classes, their level tables, their one subclass each |
| `spells.md` | 326 KB | 15 cantrips and 312 levelled spells |
| `equipment.md` | 72 KB | 38 weapons with mastery properties, 12 armours and a shield |
| `feats.md` | 7.6 KB | Origin, General, Fighting Style and Epic Boon feats |
| `rules-glossary.md` | 73 KB | The fifteen conditions, and every defined term |
| `monsters.md` | 19 KB | The **anatomy** of a 2024 stat block |
| `monsters-A-Z.md` | 517 KB | 235 creatures |
| `animals.md` | 140 KB | 95 more |
| `playing-the-game.md` | 65 KB | The eighteen skills, and the D20 Test |

🚫 **[`sycarion/5e-2024-SRD`](https://github.com/sycarion/5e-2024-SRD) must not be used, and the reason
is recorded here so nobody wires it in later on the strength of its name.** Despite the repository
title it is the **2014 SRD 5.1**. Its own `Changelog.md` carries *"Update material to reflect 5.2.1
SRD"* as an unchecked to-do, beside *"Rename Races to Species"*; it is a June-2025 fork of a 2022
wiki. The content confirms it beyond argument — Fighter gains `Martial Archetype` and no Weapon
Mastery, Monk spends `Ki Points`, Ranger has `Favored Enemy` and `Natural Explorer`, there are six
in-class Fighting Styles rather than four feats, and `Races/` contains Half-Elf and Half-Orc. Reaching
for it as a "second opinion" converts this application to the **previous edition** one file at a time,
which is the failure mode a rejected reference exists to prevent.

⚠️ **This inverts the rule the dice milestone wrote down, and the inversion is the milestone.** That
milestone's instruction was: *consult the 2024 rules for how a cherry-picked feature works, never for
what a character has — the corpus is the authority on the second question.* After this milestone the
SRD is the authority on **both**, and the corpus is a *transcription* of it rather than a
cherry-picked subset with its own opinions. The sentence in that section is left standing and marked,
because it was correct for eleven milestones and is the thing being deliberately given up.

### Six numbers that decide the size of this milestone

⚠️ **Enumerate before implementing.** Every count below is a snapshot taken while this was written and
must be regenerated from the SRD files and from the corpus rather than trusted. The instruction that
matters is the *ratio*, not the figures.

| | Today | After | Δ |
| --- | --- | --- | --- |
| Classes | 8 | **12** | +4, each bringing a resource shape that does not exist yet |
| Archetypes | 16 (two per class, none from any SRD) | **12** (one per class, all SRD) | −4, and 8 retired by name |
| Species | 8 | **9** | Half-Orc **retired**, Gnome added |
| Skills | 13 | **18** | +5 — History, Medicine, Nature, Religion, Survival |
| Spells / catalogue entries | 52 total, of which 24 are spells | **171 spells** (15 cantrips + 156 of levels 1–3) | ~7× the spell corpus |
| Creatures | 129 | **253** in range (160 of 235 monsters and 93 of 95 animals, at CR 0–6) | ~2× |
| Premade sheets | 72 | **60** | 12 classes × (levels 1–2 shared) + 12 × 3 subclass levels |
| Feats | 16 hand-written, mixing feats with class features | **10** reachable at levels 1–5 (4 Origin, 4 Fighting Style, 2 General) | The SRD's feat list is *smaller* than ours, and the difference is that ours contains class features |

⭐ **That last row is the most useful line in the table, and it should be read twice.** `convex/lib/rules.ts`
today calls sixteen things `FEATS`, and only five of them are feats — Second Wind, Action Surge, Rage,
Sneak Attack, Divine Smite, Lay on Hands, Bardic Inspiration and Wild Shape are **class features**,
which is a different thing with a different home and a different recharge story. The conversion is
therefore not "add SRD feats to our feat list"; it is **splitting one list into two** and discovering
that the smaller half was already correct. Whoever builds this should expect the class-feature half to
be the whole job and the feat half to be an afternoon.

### Where the arithmetic actually moves — six changes, and only one is a simplification

Everything else in this milestone is transcription. These six change numbers, and each needs a line in
ADR 0016.

**1. ⚠️ Ability scores no longer come from species — they come from *background*, which is excluded.
This is the sharpest conflict in the whole conversion.** In 2024 a species grants **no ability score
increase at all**; a background grants three named abilities with a `+2/+1` or `+1/+1/+1` spread, plus
an **Origin feat**, plus **two skill proficiencies**, plus a tool proficiency and equipment. Excluding
background removes the *source* of the ability spread and of half the skill proficiencies.

The resolution is **absorption, not addition, and it costs nothing structural because the shape is
already right.** `LibrarySheet.abilities` already stores a finished array with the note *"the standard
array, allocated for the class and without considering race"*. After this it stores the standard array
**with the build's background increases already applied**, and the *"without considering race"* clause
becomes true by construction rather than by discipline — since no species touches a score, the
apply-race-on-top step loses its arithmetic entirely. The two skill proficiencies land in
`skillProficiencies` the same way, and the Origin feat lands in the entry list.

⭐ **CLAUDE.md's *"no second source of proficiency can ever exist"* survives this, and stating why is
the point.** There is still **no background on a character**, no background list, and no second grant.
What arrives is the *premade sheet* being the authority on a fixed set of numbers, which is what it
has always been — [ADR 0006](adr/0006-premade-character-library.md)'s stored-link-and-override model
is untouched. A reader who concludes "backgrounds were lifted" has read it backwards: the exclusion is
what forces the absorption. **The requirements amendment must say this in these words**, because "the
+2 came from somewhere" is the question the next reader will ask.

**2. 🚫 Speed's default is 30, not 35, and this reverses a Milestone 4 amendment.** Eight of the nine
species have `Speed: 30 feet`; the Goliath has 35, and a Wood Elf's lineage raises it to 35. So
`SPEED_FEET = 35` in `convex/lib/sheet.ts` becomes **30**, and Milestone 4's amendment — *"35 speed for
all characters — now the default rather than the rule"* — is superseded rather than refined. The
Goliath is still the reason the field exists; it is simply no longer the reason the *default* is what
it is. ⚠️ **`speedOf` answers 35 for every sheet with the field absent, and every stored sheet has it
absent**, so this is a **stored-value change disguised as a constant edit**: flipping the constant
silently slows every existing character by five feet, which is correct for eight species and wrong for
the Goliaths. It needs the migration in step 9, not a one-line commit.

**3. The archetype is chosen at level 3, not level 2, and levels 1–2 therefore have none.**
`SUBCLASS_LEVEL` moves from 2 to 3 for all twelve classes — the SRD is unanimous, which is worth
knowing because 2014 was not. The library's shape changes with it: today a class is `base` (level 1)
plus two paths covering levels 2–5. After this it is **levels 1 and 2 shared**, then one path covering
levels 3–5. `ClassLibrary` in `convex/lib/library/types.ts` needs `base` to become a level-indexed
record rather than one sheet, and the builder's archetype control must be **absent** rather than empty
below level 3 — a disabled dropdown reads as a thing the player failed to fill in.

⚠️ **The archetype step stops being a choice, and that is a licensing fact rather than a design one.**
No SRD, 2014 or 2024, contains more than one subclass per class. The eight second archetypes the
library ships — Battle Master, Assassin, Oath of Vengeance, College of Valour, Light Domain, Path of
the Wild Heart, School of Divination, Beast Master — appear in **no** SRD and were written from general
knowledge. They are **retired by name**, and every character holding one needs step 9. What arrives
instead is the twelve that are licensed: Path of the Berserker, College of Lore, Life Domain, Circle
of the Land, Champion, Warrior of the Open Hand, Oath of Devotion, Hunter, Thief, Draconic Sorcery,
Fiend Patron and Evoker.

**4. Thirteen skills become eighteen.** History, Medicine, Nature, Religion and Survival are missing
today, all of them Intelligence or Wisdom. `SKILL_KEYS` in `convex/lib/skills.ts` grows by five, and
so does everything derived from it: `SkillProficiencies` (a `Record` over the union, so the compiler
lists every construction site), `skillProficienciesValidator`, `creatureSkillsValidator`, `noSkills`,
and the sheet's skill list. ⚠️ **`BestiaryCombat.skills` caps at four and a 2024 stat block routinely
lists more** — the cap is a content rule checked by the corpus test, and re-deriving 253 creatures is
the commit that discovers it. Decide the new cap from the corpus rather than from the old constant.

**5. Counts stated as *"equal to your Proficiency Bonus"* are everywhere, and the literal model still
holds.** Draconic Breath Weapon, Stonecunning, Giant Ancestry and Adrenaline Rush are all
proficiency-bonus-many uses per long rest — a *derived* count, where the absorbed milestone planned
per-sheet literals. ⭐ **The literal survives, and checking that is worth one paragraph rather than a
redesign:** a library sheet is written per level, the proficiency bonus is +2 at levels 1–4 and +3 at
level 5, so a literal on a per-level sheet is *exact* and never drifts. This is the same argument the
absorbed milestone made about ability-modifier-derived counts, reaching a second kind of derivation
and holding.

**6. ⭐ Monsters gain ability scores, and this is the only simplification in the milestone.** A 2024
stat block carries all six scores with modifier *and* save columns, which deletes the reason the
reduced NPC sheet exists. Today `BestiaryCombat` pre-calculates `attackBonus`, `initiativeBonus`,
`passivePerception`, `saveDc` and per-skill bonuses **because there are no scores to derive them
from** — that is [ADR 0005](adr/0005-character-sheets-and-hit-point-secrecy.md)'s reduction, restated
three times in `convex/lib/bestiary/types.ts`. With scores present, all five become derivable by the
functions heroes already use, and `NPC_ACTIONS`' flat `1d6+2` numbers can become `1d6+STR` in the same
grammar as a hero's.

⚠️ **Take the simplification, but do not take it all the way, and know which of the two reasons you
are honouring.** A monster's stored `attackBonus` may become derived; a monster's stored **initiative**
must not, because the SRD prints an initiative modifier that is *"typically equal to its Dexterity
modifier"* and explicitly permits extras. The rule to carry forward: **derive what the SRD derives, and
store what the SRD prints.** And `passivePerception` stays *nullable* — the board draws it now, and
`passivePerceptionFor` in `convex/lib/skills.ts` already carries the argument that printing 10 for a
creature nobody gave one is inventing a statistic.

### What arrives on the sheet that is not on it today

The attached D&D Beyond sheets cross out what is excluded; **six things are left un-crossed that this
application does not currently have**, and they are listed here because an un-crossed box is an
instruction and an unlisted absence reads as an oversight.

| Arriving | Status today | Note |
| --- | --- | --- |
| **Spell save DC and spell attack bonus for a hero** | ADR 0011 decision **2** declines it | 🚫 **Reversed.** Every 2024 caster has both, derived from the spellcasting ability plus proficiency — so the spellcasting ability per class becomes stored content, exactly as the dice milestone's *"five things"* list predicted it would have to |
| **Temporary hit points** | No field | A second number beside current HP in `characterVitals`, with its own clamp. Not healing, and not part of the max |
| **Death saving throws** | 🚫 *"Never in scope"* in the milestone this one replaces | ⚠️ **Needs its own line in ADR 0016.** Three successes and three failures is a *counter*, not an adjudication — nothing decides whether the character dies. But it reverses a stated never, so it is recorded rather than slipped in |
| **Heroic Inspiration** | No field | A boolean. The 2024 Human regains it on every long rest, which is the one place it interacts with anything |
| **Resistances, immunities and vulnerabilities** | Creatures have them in prose; heroes have nothing | Labels on the sheet. **Nothing computes damage**, so nothing applies one |
| **Senses — darkvision and the passive scores** | Passive Perception exists; passive Insight and Investigation do not | Both derive from skills that exist after change 4, so they cost two accessors |

⚠️ **Languages are the one un-crossed box that stays out.** The *Proficiencies & Training* panel lists
Armour, Weapons, Tools **and Languages**, and languages are named in the exclusion list — so that box
keeps three of its four sections. Worth stating because the screenshot and the prose list disagree, and
the prose list is the instruction.

### The library: sixty sheets, and the shape of a class changes

Twelve classes, each with levels 1 and 2 shared and one archetype covering levels 3–5. The four new
classes are **Druid, Monk, Sorcerer and Warlock**, and they arrive with four resource shapes the
absorbed milestone explicitly said this corpus did not contain:

| Class | Resource | Shape at levels 1–5 | Recharge |
| --- | --- | --- | --- |
| Monk | **Focus Points** | Equal to Monk level, from level 2 (so 2→5) | Short rest |
| Sorcerer | **Sorcery Points** | Equal to level, from level 2 | Long rest, plus Sorcerous Restoration at level 5 |
| Warlock | **Pact Magic slots** | A *tiny* bank: 1 slot at level 1, 2 thereafter, rising in slot **level** rather than count | **Short rest** — the one caster whose slots come back before a long rest |
| Druid | **Wild Shape** | 2 uses at level 2 | One back on a short rest, all on a long rest |

⚠️ **Wild Shape is the one feature in the SRD that makes a hero's sheet read the bestiary.** Its known
forms are Beast stat blocks of CR ≤ 1/4 without a Fly Speed, which is a **query against the creature
corpus from a player-facing surface** — and `corpusGuard.test.ts` allows exactly three modules to
import `lib/bestiary/`. Decide this deliberately: the cheapest answer that keeps the guard whole is
that a druid's four forms are **content on the library sheet**, four entries like any other, rather
than a live lookup. A live lookup needs a fourth module on that allow-list and an argument for it.

⭐ **Warlock Pact Magic is why the absorbed milestone's slot model has to change, and it is worth
finding out now rather than at content time.** That milestone reasoned from a corpus with no Warlock:
*"There is no Warlock, so there is no Pact Magic and no slot bank that recharges on a short rest… the
2024 rules describe eight resource shapes and this corpus contains three."* After this milestone the
corpus contains **all of them**, and the sentence is deleted rather than qualified.

### The absorbed milestone, corrected in two places

Most of what the character-resources milestone planned still holds — one shape covering discrete uses,
dice pools and point pools; **absent, never zero**; the declaration optional on content with an
allow-list test on both sides; `convex/feed.ts` still reading no guarded table; and the band variant of
the vitals payload still having nowhere to put a number. Read that section in the git history of this
file before starting — it is not restated here because it was right.

🚫 **What did not survive is the automatic spend**, which this paragraph used to promise: *a spend on
the first part a category offers and never twice for one cast; the spend after the dice are evaluated.*
Nothing was built that way. A use and a slot both move because a **person** pressed the counter, and
`convex/feed.ts` deducts nothing — see the resource-shape section of
[ADR 0016](adr/0016-the-5e-2024-conversion.md), which argues it. The short version is that a cast
which silently consumes a resource is the application deciding an announcement *was* an action and
*succeeded*, and that for a spell slot it could not pick the right one anyway: a level 1 spell may be
cast with a level 2 or 3 slot, and upcasting is how half the 2024 list scales.

🚫 **One of its decisions does not survive contact with the SRD.** It said:

> **A feature that partially recovers on a short rest is written as long-rest, deliberately.** …
> expressing that needs an *amount* as well as a period, which turns a boolean into a number and a
> comparison into arithmetic.

That was a defensible reduction against a corpus where the pattern appeared once. In 2024 it is **the
normal case** — Second Wind, Wild Shape and Superiority-style pools all say *"regain one expended use
on a short rest, all on a long rest"* — so writing them as long-rest-only would under-restore most of
the martial classes at every short rest in the game. The resource shape therefore carries **a maximum,
a recharge period, and an amount returned by the shorter rest**. The direction-of-error argument is
unchanged and still the safety net; it is no longer the design.

⚠️ **Its two named incompletenesses both stay named.** Divine Sense's *"a few times a day"* is a
2014-ism that 2024 replaces with a real number, so that one **closes for free**. Shared pools — a
child entry spending a parent's uses — stays open for exactly the reason given: a child-to-parent
pointer is a reference to a resolver-minted id, and renaming the parent in content orphans the
children at the next level-up. With twelve archetypes instead of sixteen the exposure is smaller, not
different.

### The bestiary: a 2024 stat block, and the guards that already cover it

253 creatures at CR 0–6, transcribed into `BestiaryEntry` with the field changes from change 6 above.
The `BestiaryFile` category split (`monster` / `enemy` / `social`) is a **local organising choice with
no SRD counterpart** and should survive — the SRD has one flat list, and a DM choosing at speed does
not.

Three things this section does **not** get to skip:

- ⚠️ **`benchmarks.ts`' ten rows are fitted to a corpus that is being deleted.** CR scaling preserves a
  creature's offset from its own CR row, so the rows *are* the scaler. Re-derive them from the SRD's
  own CR 0–6 stat blocks, and expect `convex/lib/scaling.test.ts` to be the thing that tells you the
  old curve was wrong.
- **`social.ts`' thirty NPCs have no SRD source**, because the SRD has no innkeeper. They are the one
  part of the corpus that is authored rather than transcribed, and the plan should say so rather than
  leaving a reader to wonder which creatures were checked against what.
- ⚠️ **Nothing about `maySeeCharacter`, `maySee`, `mayHearOf` or `boardCharacterAccess` changes**, and
  that is the load-bearing sentence of the whole milestone. A monster's sheet is still a leaked *row*;
  its hit points are still a leaked *field*; the corpus is still a leaked *module*. Every guard in
  CLAUDE.md invariant 8 keeps its exact meaning because **none of them reads a rule** — they read a
  layer, a control grant and a document kind. A conversion that changed one of them would be doing
  something other than converting.

### What needs nothing at all, and why each is worth naming

⭐ **The condition vocabulary is already correct, and it was written knowing this milestone was
coming.** `convex/lib/markers.ts` holds the SRD's fifteen conditions plus `concentrating` and `dead`,
in American spelling, with a comment saying *"the SRD this project moves to later is American and a
vocabulary that half-matches it is worse than one that does not match at all."* That is the discipline
paying out: seventeen strings, zero edits, and `lib/markers.test.ts` pins the order.

⭐ **The dice tray is already correct too, and it arrived one milestone ago.** d2 through d100 with
`ROLL_PATTERN` widened to admit `d2` and up to fifty dice is the board-polishing milestone's work, not
this one's. **This milestone must not re-add it**, and CLAUDE.md invariant 10's cap sentence is already
rewritten there.

Also untouched: hash routing, the Vite base path, the upload limits, `snapToGrid`, the three layers,
fog, the feed's shape, the roll modes, the crit effects, `resolveDmAccess` and every leak-guard test.
**The board does not know a rules edition exists**, which is the payout on eleven milestones of keeping
rules out of it.

### Weapon mastery is the one 2024 feature that lands on a standing exclusion

Every one of the SRD's 38 weapons carries exactly one of eight **mastery properties** — Cleave, Graze,
Nick, Push, Sap, Slow, Topple, Vex — and a Fighter unlocks three of them at level 1. Three are
movement-detriment effects: **Push** shoves a creature 10 feet, **Slow** reduces its Speed by 10, and
**Topple** knocks it Prone. requirements.md excludes *"movement-detriment status effects (prone, stand
up, difficult terrain, etc.)"* and that exclusion still stands.

**So a mastery is a word on the weapon entry and nothing else** — the same register as a condition pip,
a creature's loot and a spell's level. Nothing shoves, nothing halves a speed, nothing sets Prone, and
`convex/lib/dice.ts` never learns the vocabulary. ⚠️ **This needs an amendment for the reason the
conditions one did:** the exclusion names the exact effects the labels describe, and a near-miss that
goes unrecorded is indistinguishable from a quiet lifting. If the vocabulary gets its own module, it
gets `markerGuard.test.ts`' treatment — a grep with a three-module allow-list — because the way this
exclusion breaks is somebody writing three reasonable lines in the dice module.

**Concentration and the action economy arrive as labels on the same terms.** The spell sheet shows a
casting time (`1A`, `1BA`, `1h`) and a duration that may read *Concentration, up to 1 minute*, and both
are printed and neither is checked. Nothing drops a spell when its caster takes damage and nothing
counts a bonus action. **ADR 0011's decision 5 therefore stands**, and the existing amendment about a
turn being one action, one bonus action and one reaction stands with it — a field that says
*concentration* is not a rule that enforces it, which is the distinction this project has now drawn
five times.

### The documents this milestone must write

- **ADR 0016** — the decisions. It supersedes
  [ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md)'s **decisions 1, 2 and 4** and
  leaves 3 and 5 standing, which is one more than the absorbed milestone was going to take (decision 2, the
  hero's spell save DC, goes because 2024 gives every caster one). It also substantially supersedes
  **[ADR 0006](adr/0006-premade-character-library.md)** on library shape and **[ADR 0007](adr/0007-monster-bestiary-and-cr-scaling.md)**
  on what a creature stores, while leaving both their *mechanisms* — stored link plus override diff,
  and offset-preserving CR scaling — completely intact. ⚠️ **Supersede the numbers, not the machinery**,
  and say which is which in a table, because a reader who concludes the override model was replaced
  will rebuild something that works.
- **[requirements.md](requirements.md)** — the largest amendment in that file, and the first that
  replaces the *rule set* rather than adjusting it. The `DnD Lite rule set` lists stay verbatim as
  always. The amendment must state, in this order: that the subset is replaced by SRD 5.2.1 at levels
  1–5; that **racial abilities and skills stay lifted** but for a new reason (a species trait is now
  SRD text, and a skill proficiency now comes from the premade sheet's absorbed background rather than
  from the class list); that **background remains excluded and its numbers are absorbed**; that
  **35 speed is superseded by 30**; that a spell's level stops being a label; that **backgrounds,
  inventory, weight, encumbrance, XP, money, languages, multiclassing, the biography fields, the action
  economy and concentration-as-a-check all stay out**; and that weapon mastery, casting times and
  concentration *labels* lift nothing.
- **[CLAUDE.md](../CLAUDE.md)** — a **rewrite of the *Rules scope* section, not an edit.** That section
  is currently the specification of D&D Lite, and D&D Lite is what this milestone removes. Its two
  🚫 reversal bullets close here; its two ✅ bullets change — the spell-save-DC one is reversed and the
  concentration one stands. ⚠️ **The invariants above it change far less than the section below it**, and
  the rewrite must not blur that: invariant 8's table, invariant 9's unions and invariant 10's guards
  are all still true word for word.

### Ten steps, in this order

The ordering is the risk ordering the roadmap's first principle asks for: the vocabulary rename touches
the most files and decides nothing, so it goes first and alone; the migration goes last because it
cannot be written until every rename is known.

1. **Vocabulary and constants.** `race` → `species` throughout, `SPEED_FEET` to 30, `SUBCLASS_LEVEL` to
   3, five new skills. No content, no behaviour, no new fields — one reviewable rename.
2. **`race()` is a landmine and this step is where it goes off.** `convex/lib/races.ts` ends with
   `RACE_BY_KEY.get(key)!` under the comment *"Non-null: `RaceKey` is derived from the same list, so an
   unknown key cannot exist."* ⚠️ **Retiring Half-Orc makes that comment false and every Half-Orc
   character reads `.name` off `undefined`** — which is precisely the bug `findClass` in
   `convex/lib/classes.ts` was rewritten to prevent, and whose docblock records that it turned
   `characters.list` into a `TypeError` *for the whole party*. `race()` is the one lookup in that pair
   that never got the fix. **Give it the `findClass` treatment before retiring anything.**
3. **Schema widening.** Temporary hit points, death saves, heroic inspiration, the resource shape, the
   spellcasting ability. All optional, all accessor-defaulted — widen → migrate → narrow, as always.
4. **The nine species**, with their full trait lists. ⚠️ **A species is no longer one trait.** The
   Dragonborn has four traits and a ten-row ancestry table; the Elf has five and a three-row lineage
   table; `Race` in `races.ts` holds `traitName` and `traitText`, singular. And **lineage and legacy
   choices are a sixth pick** — Drow/High/Wood, Forest/Rock, three fiendish legacies, ten draconic
   ancestries, six giant ancestries. Decide whether the build absorbs them (recommended, and consistent
   with the archetype being one option) or the builder grows a field.
5. **The twelve classes and their one archetype each**, with level tables for 1–5 only.
6. **The spell corpus** — 15 cantrips and 156 spells of levels 1–3. This is the largest single content
   job in the project's history and the one most worth generating-then-reviewing rather than typing.
7. **The library's sixty sheets**, on the new `ClassLibrary` shape.
8. **The creature corpus** — 253 entries, then re-derive `benchmarks.ts`, then let `scaling.test.ts`
   argue with you.
9. **The migration.** Every stored character points at a vocabulary that moved: a retired species key,
   one of eight retired archetype keys, a class with a different level table, an absent `speed` whose
   default changed under it, and catalogue copies whose keys may no longer exist. ⚠️ **The
   copy-versus-link split decides the blast radius and it runs both ways** — a stored *copy* of a
   catalogue entry survives a retired key by design ([ADR 0006](adr/0006-premade-character-library.md)),
   and a stored *link* to a library sheet resolves against whatever the library now says. So a hand-built
   sheet needs nothing and a premade one changes under its owner. Both behaviours are correct and the
   plan must say which characters get which.
10. **The panels.** `CharacterSheetView`, `PcSheetForm`, `PresetNumbers`, `SkillList`, `AbilityTable`,
    `SheetEntryList`, `CreatureSheetView`, `CharacterBuilder`, `BestiaryPicker` and the DM's sheet
    selector. ⚠️ **The renderer must keep iterating its vocabularies** rather than naming members in
    JSX — `SHEET_ENTRY_CATEGORIES`, `CHARACTER_GROUPS`, `SKILL_KEYS` — for the reason invariant 9 gives:
    naming five skills in markup is how the sixth arrives stored, counted and invisible.

### ⚠️ The field-by-field rebuild trap, sixth outing, and the largest surface it has ever had

CLAUDE.md records this firing on `skillProficiencies`, `speed`, five NPC fields and `group`, and that
**only `npm run test:smoke` has ever caught it.** This milestone adds five optional fields and rebuilds
two entire corpora through the same entry normaliser — a hero's feats, a hero's spells, a monster's
actions and both override diffs. ⚠️ **`resolvePreset`'s retired-class branch is now reachable in
anger**, because eight archetype keys and one species key are genuinely being retired rather than
hypothetically. Write the smoke assertions *before* the content, and make the deep key-set comparison
in `scripts/board-smoke.mjs` cover the new fields on the first commit that adds one.

**Deliberately not done:**

- **Levels 6–20.** The level cap is the scope lever the whole milestone rests on. Extending it later
  costs 12 sheets per level and reopens spell levels 4–9 — 156 more spells.
- **Backgrounds as an entity.** Their numbers are absorbed; the concept is not added. This is the
  exclusion doing work, not an omission.
- **Multiclassing, XP, money, weight, encumbrance, inventory, languages** and every biography field.
- **Any adjudication whatsoever.** No roll is compared to an AC or a save DC, no damage is applied, no
  resistance is halved, no condition does anything, no mastery pushes anybody, no concentration breaks,
  no death save kills a character and no cast is refused. ⭐ **This is the line that makes a
  full-ruleset conversion possible at all**, and it is the same line ADR 0011 drew: the application
  *announces and counts*, and the table *adjudicates*. Converting the rule set does not convert that.
- **Magic items, attunement, crafting, downtime, the 244 KB of `magic-items.md`** and everything in
  `gameplay-toolbox.md`.
- **A rules-text reader.** The SRD is a build-time source for content, not a document the application
  ships or searches. `bundleGuard.test.ts` and `corpusGuard.test.ts` keep every byte of it server-side,
  and a 1.9 MB corpus is the strongest argument those guards have ever had.

**Acceptance:** a player builds a level 1 Gnome Wizard with no archetype step on screen at all, levels
to 3, and is offered exactly one — Evoker — which the sheet then shows. A level 5 Cleric's sheet prints
a spell save DC and a spell attack bonus derived from Wisdom and the proficiency bonus, and neither is
stored on any of the sixty sheets. A Wood Elf moves 35 and a Human moves 30, from species content
rather than from a constant. A Warlock takes a short rest and gets both Pact Magic slots back while the
Wizard beside them gets none — asserted as one positive and one negative, because a short rest that
restored a Wizard's slots would be the app inventing a rule. A Fighter's greatsword shows `Graze` and
nothing in the codebase reads it: `grep` for the mastery vocabulary outside its own module and the
sheet renderer returns nothing, enforced by a guard test. A Half-Orc character created before this
milestone still opens, with a name, without a `TypeError`, and says plainly which species it needs
choosing again. `npm run test:smoke` compares a stored sheet's key set at depth against the real
deployment for all four sheet kinds, because it is the only thing that has ever caught the rebuild
trap. And a player inspecting network traffic sees no ability score, no resource count and no spell
save DC for any creature whose sheet they may not already read — the same scan, with the same positive
control, over a corpus twice the size.

### ⏸ Where this stopped, and what the remaining branches owe

The conversion is being built on an integration branch, `feature/m14-5e-2024`, which is **not merged
into `dev` and is not mergeable yet**. This section is the resume point. It is written here rather
than in a branch note because the thing a reader needs on picking this up is the *difference* between
what the ten steps above promise and what the branch currently does — and that difference is a fact
about the milestone, not about a working copy.

**Green on the branch as it stands:** `npm run lint`, `npm run build` and `npm test` (**1938 tests
over 49 files**). ⚠️ **`npm run test:smoke` has NOT been run since the schema last moved** — it needs
the new schema pushed to the dev deployment first, and that push has not happened. It is the single
biggest outstanding item and the reason this section still exists; see *What is left* below. No guard
test was
weakened, skipped or exempted to get there, which was the condition the whole fan-out was run under.
`leakGuard.test.ts`, `corpusGuard.test.ts`, `markerGuard.test.ts`, `storageGuard.test.ts`,
`lib/layers.test.ts` and `lib/markers.test.ts` are byte-identical to `dev`. `bundleGuard.test.ts` is
the only one that moved, and it moved in the two permitted directions: the `races` → `species` rename
its existing needles already carried, and one *addition* — the needle keeping `scripts/srd/` out of
the bundle, with both halves of its anti-vacuity pair. There is a new one beside it,
`masteryGuard.test.ts`, written from `markerGuard.test.ts` line for line, and the module it exists to
keep the mastery vocabulary out of is `convex/lib/dice.ts`.

**Landed:** steps 1 through 9, plus the documents. The vocabulary rename and the eighteen skills; the
`findClass` treatment for `species()`; the schema widening with the resource shape, the short rest and
weapon mastery as a label; the nine species with 33 traits and their lineages; the twelve classes at
one archetype each; 183 spells; 253 creatures with `benchmarks.ts` re-fitted to them; the sixty
library sheets. ADR 0016, the requirements amendment, the CLAUDE.md *Rules scope* rewrite and the SRD
attribution went in **ahead of** the content they describe, deliberately — an ADR that argues a
decision is worth more before the code than after it — which is why the next paragraph exists.

**The documents led the code on three things, and all three have now landed.** `SUBCLASS_LEVEL` is 3,
the library is sixty sheets, and **`SPEED_FEET` is 30** — the last of them, and the milestone's only
genuine stored-value change disguised as a constant edit. A `preset` sheet stores no speed —
`resolvePreset` writes the constant into the *resolved* sheet, so flipping it re-resolves correctly,
Goliaths included. What would have broken is every hand-built `pc` and `npc` sheet, whose
stored-absent field would silently turn a DM-typed goblin from 35 into 30. **The pin sweep ran first
and the constant moved after it**, in that order, in `chore/m14-migration`.

**Step 10 has landed, in two halves.** The sheet redesign — the pinned header, the Play / Build /
Spells sub-tabs, and the second renderer a hand-typed `npc` now shares with a `bestiary` creature —
and the board half: the coin's temporary-hit-point ward, the hover card, the feed row and the floating
announcement. ⚠️ **The card is where the guard bites**, and the answer is narrower than the design
asked for: armour class and passive perception are ADR 0014's two published stats and **initiative and
speed are on no vitals payload at all**, so the card reads those two off `characters.sheet`, which is
already gated by `findEditableCharacter`. The effect is that a player hovering a *teammate's* hero
sees armour class and hit points but not speed — strictly inside what the server already publishes,
and no field was added to `publicVitalsValidator`'s `band` variant. Putting initiative and speed on
that payload is a third published stat and needs its own ADR, which is exactly what ADR 0014 says.

**Three things were built that the ten steps do not name, and each closed a real gap.**

- **Spell slots.** CLAUDE.md's *Rules scope* claimed *"✅ Spell slots — reversed and built"* and
  nothing existed: `grep -rin slot convex/lib/` found the word only inside spell prose. A fourth
  docs-lead-code item, found by sweeping every *"built"* claim in the documents against the code.
  `convex/lib/slots.ts` derives them, with the Warlock's Pact Magic as a separate **short-rest** track.
- **The three vitals mutations.** `characterVitals` had carried `temporaryHp`, the death-save tally
  and `heroicInspiration` since the schema widened, readable by everyone and writable by nobody.
- **A creature's ability scores reaching its sheet.** The corpus had carried `abilityScores` and
  `saveBonuses` since transcription and `resolveBestiary` projected neither, so `abilitiesOf` answered
  `null` for every creature in the game and the new stat block's ability grid had nothing to draw.

⭐ **That last one found a `NaN` in the corpus.** The Will-o'-Wisp held its strength *modifier* in its
*score* column — `str: -5` where the SRD prints `STR 1 (−5)` — and a literal `NaN` in the save column
from transcribing `(-5)` through `Number`. Neither had ever been read: `scaleCombat` leaves both
untouched, and `scale.ts` writes its comparisons as `!(x > 0)` precisely so a `NaN` fails rather than
propagates, so what should have been a crash was a wrong number sitting still. **A field nothing reads
is a field nothing checks**, and the thing that caught it was the corpus test running the sheet
validator over all 283 creatures at all 10 ratings the moment the projection existed.

*`chore/m14-migration`* — last, because it could not be written until every rename was known, and it
is **two commits that deploy separately**. The first is the **sweep**: the pin and `SPEED_FEET`
above; clearing retired archetype keys to `null` with `locked: false` rather than remapping them,
because remapping changes a character nobody asked to change; rewriting `preset.race` to `species`
and back-filling five `false` skill booleans on every stored `pc` sheet and inside the preset
override diff; folding `characterVitals.spentPerRest` into `spentUses`; `convex/lib/migrate.ts`,
`admin.listUnmigrated`, `admin.migrateGame` and `npm run migrate-sheets`. The second is **three of
the four narrowings** — dropping `race`, making all eighteen booleans required, and dropping
`spentPerRest` — and it cannot be pushed until the sweep has run everywhere. **One widening is
deliberately never narrowed**: `rollResultValidator`'s optional multi-part array, because a feed row
is historical and must render forever.

🚫 **The fourth narrowing was planned and is declined, and the plan was wrong rather than the
branch.** `half-orc` **stays** in `storedSpeciesKeyValidator`, which is therefore ten literals for
nine species, permanently. The milestone's own acceptance criterion is that a Half-Orc character
created before this milestone *opens, with its name, and says plainly which species needs choosing
again* — which requires the key to remain **storable**, and no sweep can change that. Removing it
makes the schema push fail against any deployment holding one, which is how it was found the first
time. `RETIRED_SPECIES` exists for exactly this; the validator says so where somebody would look.

⚠️ **What the branch cannot do is land on a deployment in one push, and that is a property of Convex
rather than of the branch.** A schema push validates *existing* rows, so a deployment holding one
unswept character refuses the narrowed schema outright — and all three narrowings block it, since
every stored `preset` carries a `race`, every `pc` sheet with skills carries thirteen booleans, and
every vitals row that ever spent an ability carries a `spentPerRest`. **This is
`chore/narrow-token-layer`'s four steps a second time**, and the property that makes it safe rather
than merely careful is the same one recorded there: *the narrow schema is the proof the sweep
landed*, so step 4 cannot succeed early and nothing has to be trusted. The runbook lives in the
header of `scripts/migrate-sheets.mjs` — in the tool rather than in an ADR, for the reason this
file's own note about ADR 0012 gives: a runbook goes stale the moment it is followed.

⚠️ **Two hunks in the sweep commit are there for the *deploy* rather than for the feature**, and
both would look like tidying to somebody rebasing. `preset.race` becomes **optional**, because the
sweep writes rows with a `species` and no `race` and a validator that still required it would reject
the migration's own writes. And `longRest` stops writing `spentPerRest: []`, because a long rest
taken between the sweep and the narrowing push would otherwise put back the exact field that push
refuses.

### What is left, in the order it has to happen

1. ⚠️ **Push the sweep half to the dev deployment and run `npm run test:smoke`.** The schema has moved
   several times since it was last run — `spentSlots`, the three vitals fields, the ability-score
   projection — and it carries a **new, unexercised block**: a Wizard and a Warlock created side by
   side, both spending slots, both taking a short rest, asserting the Warlock's came back and the
   Wizard's did not. That block is written and has never executed. `test:smoke` is the only thing in
   this project that has ever caught the field-by-field rebuild trap, and this milestone is the
   largest surface it has ever had.
2. **Run `npm run migrate-sheets`** — dry first, then `--yes` — following the runbook in that
   script's header.
3. **Then, and only then, `chore/m14-narrowings`.** It is held off the integration branch on purpose,
   exactly as `chore/narrow-token-layer` was: a branch that cannot deploy until a sweep has run is a
   branch that does not sit on a branch somebody might deploy.
4. **Hand verification in two browsers** — a Gnome Wizard built from nothing to level 3, a Wood Elf's
   speed, a Warlock's short rest beside a Wizard's, a pre-conversion Half-Orc opening, and a full
   round played from both chairs.

**One thing worth carrying forward about how this was built.** Every defect the integration found was
at a **seam** rather than inside any one agent's work: four in Milestone 13, and here a duplicated
`lineageKey` line where two branches each added one and the weaker won; a stale
`storedSpeciesKeyValidator` listing the old eight species; a smoke script whose eight `fog:draw` call
sites still passed flat numbers after the signature became a discriminated union; two branches
independently wiring the same three hooks into `useVitals`; and `spentSlots` landing on the vitals
payload while the coin's branch was open, leaving both client fixtures a field short.

⚠️ **Only the last of those was caught by a compiler, and only because the field was required rather
than optional** — 1919 tests passed through it. The `fog:draw` one was invisible to lint *and* to the
whole vitest suite, because `convex-test` calls the typed API and the smoke script calls the real one.
Parallel branches do not usually break each other's code. They break the agreement between it, and the
only three things that have ever found that are reading the merge, running `npm run test:smoke`, and —
once — a required field.

⚠️ **And every one of the three step-10 worktrees was created from `main` rather than from the
integration branch.** All three agents noticed before writing a line, reset, and said so; that is a
systemic hazard rather than three coincidences, and it is the first thing to check if work against a
worktree ever reports that files which should exist do not.

---

## Milestone 15 — Tools and polish

- Ruler tool, measuring in squares (1 square = 5 feet).
- Multi-colour marker + eraser on the board. **DM only** — players must not have this. ⚠️ **The word
  *marker* is already taken** — the tokens milestone shipped `tokenMarkers`, the condition labels on
  a coin, and `convex/lib/markers.ts` is their vocabulary. This one is a **pen**, and naming it
  anything with `marker` in it will collide with a table, a query, a mutation and a guard test. See
  [ADR 0013](adr/0013-a-coin-you-can-copy-place-and-label.md), which records the collision rather
  than resolving it, because renaming the condition labels would have made the specification and the
  code disagree.
- Background music player, synced play state across the group.
- Initiative tracker.

**Acceptance:** the DM measures a distance and draws on the map; players see both. A player has no
marker tool available.

---

## Milestone 16 — Game editor and admin

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
  ⚠️ **The tokens milestone amends that file and lifts no exclusion**, which is worth stating because
  it looks as though it might. A condition pip is the *word* `prone` on a coin and never the effect —
  nothing halves a speed, grants advantage or refuses a drag — so *no movement-detriment status
  effects* stands exactly as written and the amendment is a clarification.

  🚫 **The 5e 2024 conversion is the exception to this whole bullet, and it is the only one there has
  ever been.** Every entry above records an exclusion *held*. That milestone replaces the excluded-rules
  list's parent — the D&D Lite subset itself — with SRD 5.2.1 at levels 1–5, so *"anything still in the
  excluded rules list"* stops being a description of what is out and becomes a description of **what
  survived a replacement**. What survives is most of it, and it is worth naming rather than trusting:
  **backgrounds as an entity, inventory, weight, encumbrance, experience points, money, languages,
  multiclassing, every biography field, the action economy and concentration-as-a-check are all still
  out.** What moves is that eight classes become twelve, thirteen skills become eighteen, an archetype
  is chosen at level 3, and a species trait is SRD text rather than a house paraphrase. ⚠️ **Background
  is the one worth reading twice**: it stays excluded, and its ability spread and two skill
  proficiencies are **absorbed into the premade sheet's stored numbers**, because in 2024 that is where
  they come from and there is nowhere else for them to be. No background exists on a character, and
  there is still no second source a proficiency can arrive from.

  And **counting adjudicates nothing**, before or after: no roll is compared to anything, no cast is
  refused, casting at a higher slot level changes no die, no weapon mastery pushes anybody, no
  resistance halves damage and no death save kills a character. That is the line ADR 0011 drew, and
  converting the rule set does not convert it.
- **Dynamic lighting, line of sight, and vision of any kind.** Roll20's is a ray-tracer with
  per-token vision, explorer mode and a documentation page listing which browsers it works in. The
  maps milestone takes its *barriers* and only their movement half, deliberately: a wall that decided
  what somebody could **see** would make every stored wall and every stored fog shape a statement
  about what one caller may know, which is the change CLAUDE.md invariant 8 names as needing a fourth
  row in the reader/predicate table. **Per-player fog and reveal-as-you-walk are the same decision
  wearing different clothes** and are declined with it.
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
  cheaper than six ability scores that no monster's player would ever roll. 🚫 **Reopened, and
  answered the other way, by the 5e 2024 conversion.** The last sentence assumed nobody would roll a
  monster's ability scores; a 2024 stat block *prints* all six with modifier and save columns, so the
  scores stop being a cost and become content that already exists. Storing them makes
  `attackBonus`, `saveDc`, the skill bonuses and `passivePerception` derivable by the functions heroes
  already use, and lets a monster's damage read `1d6+STR` in the grammar rather than a frozen `1d6+2`.
  ⭐ **The reduction was right for five milestones and is the one thing in this file that got cheaper by
  being reversed** — which is the argument for writing an answer down even when it looks obvious.
  ⚠️ **`initiativeBonus` stays stored** and is the boundary: derive what the SRD derives, store what
  the SRD prints.
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
  the wrong thing. ⚠️ **The 5e 2024 conversion answers this by not answering it**, and that is worth
  seeing clearly rather than reading the new number as a decision: transcribing every SRD creature at
  CR 0–6 takes the corpus from 129 to 253 because *the SRD has that many*, not because anybody judged
  253 to be the right size for a table. The question is therefore **wider open after the conversion
  than before it**, and the thing that would answer it is a season of play — not a count.
- **Whether the benchmark table should be per-role rather than global.** Scaling preserves a creature's
  offset from its own CR row, which keeps a Tank tanky — but it assumes every role's numbers grow along
  the same curve, and a Spellcaster's probably does not grow like a Brute's. Ten rows is content that
  can be tuned in place; ten rows per role is eighty, and nobody has yet scaled enough creatures to know
  whether the single curve reads wrong.
- Whether the initiative tracker belongs with the rolls rather than in tools and polish — a real
  session will answer this. **Still open**, and now six milestones away rather than three, which is
  the compounding price of six insertions and is worth naming rather than glossing. Written without
  numbers deliberately: this entry has been renumbered five times already, and has cost nothing each
  time, which is the whole argument for writing it that way.
- **Whether shared resource pools are worth a pointer between sheet entries.** A cleric's Channel
  Divinity options all spend one use, a bard's Cutting Words spends an Inspiration die, and a Monk
  spends Focus Points on three different things. The 5e 2024 conversion counts the *parent* and leaves
  the children counting nothing, because a child-to-parent pointer would be a reference to another
  entry's **resolver-minted id** — so renaming the parent in content silently orphans the children at
  the next level-up. That is a real incompleteness rather than a decision that has settled. ⚠️ **The
  conversion changes the exposure in both directions at once**, which is why this entry is not simply
  narrowed: retiring the Battle Master removes the worst offender, and the Monk arrives spending one
  pool three ways at level 2, which is a *more* central case than the one the entry was written about.
  Fewer archetypes, more shared pools.
- **Whether an unconditional stored-blob delete is ever the right default.** Two milestones in a row
  found the same latent bug: a token's art and a scene's map are each deleted with no check that
  anything else references them, which was true when exactly one thing could, and stops being true the
  moment anything can be copied. Both are fixed where they were found. The question left open is
  whether the *next* table holding a storage id should be written reference-counted from the start, or
  whether the comment-naming-its-siblings convention — which did work, twice — is genuinely enough.
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
  ⚠️ **The 5e 2024 conversion makes this the single most expensive open question in the file**, and
  changes what the cost is made of. It becomes **12 sheets per level** rather than 24 per five, and
  each level past 5 reopens a spell level — levels 6–9 alone add another 156 spells to transcribe,
  which is as much content again as the whole conversion's spell corpus. The level cap stops being a
  convenience and becomes **the scope lever the conversion rests on**, so answering this question is a
  milestone rather than a content pass.
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
