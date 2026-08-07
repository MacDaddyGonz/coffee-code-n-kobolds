# Coffee, Code n' Kobolds

Browser-based virtual tabletop for playing D&D Lite. Desktop browsers only — no mobile layouts, no
SSR, no SEO.

Spec: [docs/requirements.md](docs/requirements.md). Build order:
[docs/roadmap.md](docs/roadmap.md). Decisions: [docs/adr/](docs/adr/).

## Branching — always work on a branch, and always ask before merging

**Never commit directly to `dev` or `main`.**

```
feature/xyz ──┐
              ├──(merge, once asked)──▶ dev ──(pull request)──▶ main
  fix/abc  ───┘
```

- Branch from `dev` for every change, however small.
- Prefixes: `feature/`, `fix/`, `chore/`, `docs/`.
- When the work is complete and working, **ask** — then merge the branch into `dev`.
- `main` only ever receives changes via pull request from `dev`. GitHub rejects direct pushes.

⚠️ **Claude may merge into `dev`, but only after asking, and never into `main`.** The two halves of
that sentence are separate rules:

- **Into `dev`:** finish the work, say it is ready, and *ask for permission to merge*. Wait for a
  yes. A green `npm run build`, a passing test run and a diff that looks obviously right are the
  things that make it worth asking — none of them is the answer. Permission is per merge: a yes on
  one branch says nothing about the next one, however similar.
- **Into `main`:** Claude opens a pull request from `dev` and stops there. The review and the merge
  are the maintainer's — no `gh pr merge`, no squash, no fast-forward, no "just this one is
  trivial". Deleting the branch afterwards is the maintainer's call too.

Commit messages: short imperative subject (`Add initiative tracker to DM panel`). Use the body to
explain *why* when the diff doesn't make it obvious.

## Stack

React + TypeScript + Vite (static SPA, **hash routing**) · Convex (database, realtime, file storage)
· react-konva (map canvas) · **@3d-dice/dice-box-threejs** · Tailwind + shadcn/ui · GitHub Pages via
Actions.

⚠️ **The dice library is the fork and not `@3d-dice/dice-box`**, which ADR 0001 named and
[ADR 0011](docs/adr/0011-announcing-a-roll-rather-than-adjudicating-one.md) supersedes. The original
rolls its own numbers with no way to override them, and this application's rolls are decided on the
server — so it could only ever show a table numbers that disagreed with the feed, or let the browser
choose them. The fork exists to keep predetermined rolling (`roll('2d20@18,4')`). It is loaded by
`await import()` so three.js stays in its own chunk, and its texture is reached through
`import.meta.env.BASE_URL` — the only reader of it in the codebase, and the place invariant 4 bites.

Rationale and rejected alternatives: [ADR 0001](docs/adr/0001-platform-and-hosting.md).

## Invariants — easy to get wrong, expensive to get wrong

1. **Filter DM-only data server-side, inside Convex queries.** This repo is public and the client
   bundle is readable. DM layer contents must never be sent to player clients, and exact NPC hit
   points must never be sent to players — send a percentage for the health bar instead. Hiding
   either in the client is not security.
2. **Don't write token positions to the database on every mouse-move.** Render drags locally,
   throttle writes to ~10/sec, commit on drop. Use Convex optimistic updates so it feels instant.
   Relatedly, **token position lives in `tokenPositions`**, separate from `tokens`, which holds the
   stable data (art, name, size, layer). Convex rewrites the whole document on every patch, so
   mixing high-churn position data into a document that also holds rarely-changing fields makes
   every drag contend with reads of all of it. Both ways of moving a token — mouse drag and arrow
   keys — commit through the one `board.moveToken` mutation, which **snaps server-side** on the
   settling write using `snapToGrid` in `convex/lib/grid.ts`, so no client bug can leave a token
   resting between squares. See [ADR 0004](docs/adr/0004-board-authorisation-and-layers.md).

   **Current hit points are split off the same way**, into `characterVitals`, but check
   [ADR 0005](docs/adr/0005-character-sheets-and-hit-point-secrecy.md) before citing this invariant
   as the reason: hit points change a few times a round, not ten times a second, so write contention
   alone would not have justified it. The decisive reason is the shape of the *subscription* — the
   board needs live hit points for every visible token, and a health-bar query that read character
   documents would be reading NPC sheets, which are the secret.

   ⚠️ **This invariant has a read side, and fog of war is where it first bites.** `tokenPositions` is
   written ten times a second, so **any query that reads it joins every drag's invalidation set** —
   which is the same contention from the other direction. Fog is a fact about a placement, so
   filtering on it means reading that table, and three early returns in `fogShape` (in
   `convex/lib/board.ts`; the prose name `foggedTokenIds` is from a version that had one function
   where there are now three) are what keep that affordable: the DM reads nothing at all, **a scene
   that is in the state it shipped in returns before the positions read**, and a token anybody
   controls is never fogged. The middle one is the whole cost model, and the rule to carry forward is
   unchanged: *before adding a read of `tokenPositions` to a query, work out what that query then
   costs during a drag, and give it a way to not pay.*

   ⚠️ **The middle early return used to say "a scene with no rectangles" and no longer can. This is
   the restatement the previous version of this paragraph asked for**, made in the commit that broke
   it. A scene now has a **base** — *lit, and you black areas out*, or *dark, and you light areas up*
   — and under the second one **no shapes is the most hidden a map can be**, so a covered scene with
   nothing drawn cannot return early. The free case is therefore *this scene is in the state it
   shipped in*, which is `!startsCovered(base) && shapes.length === 0`.

   **The property survives and the reason does not**, and both halves are worth holding:

   - Every game is still free until somebody uses the feature, because `fogBaseOf` answers `lit` for
     an absent field and every scene ever stored has it absent.
   - **Turning a scene to dark buys the positions read for the rest of the session, without drawing
     anything.** That is the new sentence, and it is the price of the feature rather than a
     regression — a covered map is one that has to be crossed against placements on every read.
   - What is *not* true either way is invalidation: an empty range read is invalidated only by an
     insert into that range, and the scene point-get only by a patch of that row. So a **drag**
     still invalidates nothing until fog is genuinely in use.

   ⚠️ **The base also added a `scenes` point-get to `characters.vitals` and `feed.list`, which did
   not read that table before.** A calibration drag patches the scene row at about ten writes a
   second, so those two subscriptions now re-push while the DM is aiming a grid — bounded, in setup
   rather than mid-encounter, and `scenes.active` already re-pushed on the same write. Recorded here
   rather than discovered in a profiler. See [ADR 0015](docs/adr/0015-a-map-that-starts-covered.md).

3. **Hash routing only** (`/#/game/ABC123`). GitHub Pages has no rewrite rules, so a browser-path
   deep link 404s on refresh.
4. **Vite needs `base: '/coffee-code-n-kobolds/'`.** The site is served from a subpath; omitting
   this breaks asset loading in confusing ways.
5. **Characters live inside the game document**, not against a player identity — see
   [ADR 0002](docs/adr/0002-defer-user-accounts.md). There are no user accounts in v1; players join
   with a game code and a display name.
6. **Keep uploads small.** Convex free tier gives 1 GB of file storage for maps, tokens, modal
   images and music. Downscale images on upload — and **check the size server-side, against the
   stored blob**. The browser's downscaler is a courtesy that saves an upload; the enforcement is
   `scenes.create` and `board.addToken` reading `ctx.db.system.get('_storage', imageId)` and refusing
   anything over `MAX_SCENE_BYTES` / `MAX_TOKEN_BYTES` in `convex/lib/limits.ts`. A limit only the
   client applies is a limit a client bug removes. The refusing mutation cannot delete the blob it
   refused — one transaction — so that is `files.discard`'s job (ADR 0004).
7. **The DM code is the only thing that authorises anything.** A player is a seat identified by a
   display name, so a `playerId` argument is routing, not proof of identity, and `players.isDm` is a
   badge in the roster. DM-only queries and mutations take `dmCode` and re-verify it server-side
   every time — see `requireDm` in `convex/lib/games.ts` and
   [ADR 0003](docs/adr/0003-player-identity-without-accounts.md). Writing `if (player.isDm)` to
   decide what data to send would defeat invariant 1 completely.
8. **Give public queries a `returns:` validator — but know what it does and does not catch.** Built
   from a projection like `publicGameValidator` in `convex/lib/games.ts`, it makes Convex throw if a
   secret *field* is ever added to a payload by accident. That is what keeps the `games` document's
   DM code and recovery hash out of player payloads mechanically rather than by memory.

   It does **nothing** for a leaked *row*. A DM-layer token has the same shape as a player-layer
   token, so a validator would happily approve a payload full of them. The real guard is therefore
   structural: **one module reads the secret-bearing tables, and one predicate decides.**

   | Tables | The only module allowed to read them | The predicate | Where the predicate lives |
   | --- | --- | --- | --- |
   | `tokens`, `tokenPositions`, `tokenMarkers` | `convex/lib/board.ts` | `maySee(token, isDm)` | same module |
   | `characters`, `characterVitals` | `convex/lib/characters.ts` | `maySeeCharacter(character, isDm, controlled?)` | same module |
   | `feed` | `convex/lib/feed.ts` | `mayHearOf(character, isDm, visible)` | **`convex/lib/characters.ts`** |

   ⚠️ **`tokenMarkers` joined the first row rather than becoming a fourth, and that is the most
   useful thing this table has said in a while: a secret-bearing table arrived and cost no new
   machinery at all.** A marker row — the conditions on a coin — names a `tokenId`, so a row
   belonging to a GM-layer coin says a hidden coin exists, which is the oracle `TOKEN_NOT_FOUND` is
   written to close; and it is indistinguishable in type from a row about a hero, so no `returns:`
   validator can tell them apart. It is a leaked *row* of the first row's exact shape.

   What made it the **same** entry rather than a new one is that its predicate is already there:
   `maySee(token, isDm)`, the same question, answered by the same function, in the same module. So
   there is **no new predicate, no new reader and no fourth column** — one table name in one cell,
   and `leakGuard.test.ts` then sweeps `lib/characters.ts` and `lib/feed.ts` against it for free.
   **Contrast `fogRects`, below, which is absent for the opposite reason.** The test for which
   applies is not "is this table new?" but *does a row of it have a non-secret twin, and is there
   already a predicate that tells them apart?*

   ⚠️ **The fourth column exists because the third row's predicate is not in its own module, and
   this table used to imply it was.** `mayHearOf` lives in `convex/lib/characters.ts`, because it is
   a question about a *character document* — and that is the arrangement rather than an accident:
   `lib/feed.ts` is handed a `Set` of ids that has already been filtered, so it reads no other
   guarded table and no other module reads its one. Reader and predicate are separable, and for the
   feed they are separated deliberately.

   ⚠️ **`fogRects` is a table `lib/fog.ts` reads and is deliberately absent from this list.** Every
   shape goes to every client verbatim — a blacked-out map is the whole interface — so its rows
   have no non-secret twin to be confused with and there is no predicate for a reader to be the home
   of. An entry would *pass*, which is exactly why leaving it out is argued in that file rather than
   assumed; `leakGuard.test.ts` does not keep guards that cannot fail. What is genuinely confined is
   the `tokenPositions` read that turns a shape into a withheld token id, and the existing first
   row already covers it. **Per-player fog, reveal-as-you-walk or line of sight flips that** — any of
   them makes a shape a statement about one caller, and the table needs a fourth row that day.

   ⚠️ **A row of that table is a rectangle *or a polygon*, and the name is a misnomer that
   stays.** `fogRects` gained an optional `points`, the four numbers were reinterpreted as a
   **bounding box computed server-side**, and nothing above changed — the rows are still symmetric,
   still sent whole, still without a predicate. Renaming the table is a widen-migrate-narrow across
   two deploys and the whole of what it buys is a better word; the schema pushes in this project
   that were worth that are the ones where the old shape could publish a secret. So the word in
   prose is **shape**, the word in the schema is history, and `convex/schema.ts` says so where
   somebody would look. See [ADR 0015](docs/adr/0015-a-map-that-starts-covered.md).

   **The third row is the same shape as the first two and needed no new machinery, which is the
   point of having had the argument twice already.** `Ancient Red Dragon attacks with their Bite` is
   indistinguishable in type from a line about a hero, so a projection over that table would
   cheerfully approve an array made entirely of spoilers — one reader, one predicate, and the row is
   dropped whole. There is deliberately **no redacted variant of a feed row**.

   ⚠️ **`mayHearOf` is a new question and not a widening of `maySeeCharacter`**, and it composes it
   rather than replacing it. One decides whose *sheet* may be opened; the other decides whose *name
   may appear in a line saying they rolled something*, and the two genuinely differ: a player who can
   see a goblin's coin may hear that it attacked and still may not read its stat block. Collapsing
   them publishes stat blocks in one direction and silences the goblin everybody is watching in the
   other. `feed`'s two further reasons to withhold — a reserved character, and the DM's `dmOnly` —
   are `&&`-ed at the call site exactly as `isReservedCharacter` is.

   `isDm` comes from `resolveDmAccess` in `convex/lib/games.ts` in all three cases — never
   `players.isDm` (invariant 7). `leakGuard.test.ts` greps every Convex source and fails on a read
   outside the declared reader; `board.test.ts`, `vitals.test.ts` and `feed.test.ts` scan real
   player payloads for a secret, each with a positive control so the scan cannot pass on an empty
   fixture.

   **`maySeeCharacter` has a third argument now, and it is a second door rather than a hole.** A DM
   who hands the party a pet has decided those players may read its sheet, so `controlled` — the
   characters standing on tokens *this seat controls* — opens exactly those rows and nothing else.
   Three properties hold it in place:

   - **Optional, and absent means no grants.** Fail-closed by construction rather than by
     convention. `claim`, `assign` and `rename` pass nothing deliberately, which is how each of them
     says a grant must not widen it; adding the argument "for consistency" changes what all three
     mean.
   - **Composed with the existing rule, never substituted for it.** Both sets come out of
     `boardCharacterAccess` in `convex/lib/board.ts` — **the** crossing between the two choke
     points, in **one pass** over the board, handing back `{ visible, controlled }`. A `Set` of
     character ids leaves, never a `Doc<'tokens'>`. One pass is what makes the composition
     structural rather than coincidental: an id can only enter `controlled` on an iteration that
     already put it in `visible`, so a grant on a DM-layer token contributes nothing to a player —
     `visibleTokens` dropped that row before the loop began. Sight follows the token, and there is
     deliberately no second layer test inside it. `playerId === undefined` gives the empty set.
     (ADR 0005 calls the sight half `visibleCharacterIds`; that function is gone, because asking a
     second question about the same two hundred rows should not read them twice.)
   - **It carries hit points and stops at authorship.** `visibleVitals` sends a controller the
     `exact` variant rather than a band, and `requireEditableCharacter` takes an explicit
     `allowControl` — true on every write that changes what is true of a creature *during play*
     (hit points, temporary hit points, hit dice, the death-save tally, heroic inspiration, what is
     spent, what a rest gives back), false on `updateSheet`. ⚠️ **That used to read "the five
     hit-point paths" and the count was already wrong**; the docblock in `convex/lib/access.ts` now
     argues why the enumeration is not kept anywhere, and `characters.test.ts`' permission matrix is
     where a new mutation answers for itself. A granted pet takes
     damage; a granted monster is not a stat block a player rewrites.

   See [ADR 0009](docs/adr/0009-who-plays-what-and-what-control-grants.md). A **second, unrelated**
   reason to withhold a character row now exists — `isReservedCharacter` — and it is `&&`-ed at the
   call site rather than folded into either predicate, for the reasons that ADR gives.

   **Know which shape you have before picking a tool.** Milestone 3 has one of each, and they are
   not interchangeable — see [ADR 0005](docs/adr/0005-character-sheets-and-hit-point-secrecy.md):

   - An NPC's **sheet** is a leaked *row*, indistinguishable in type from a hero's, so it needs the
     choke point above.
   - An NPC's **hit points** are a leaked *field*, so `publicVitalsValidator` is a discriminated
     union whose player-facing variant has no numeric member at all. There is nowhere to put a hit
     point, and Convex throws if anyone ever adds one. That is the stronger guarantee, and it is
     available only because this particular secret happens to be a field.

   ⚠️ **That union now carries two numbers on *both* members, and the guarantee above is unchanged
   — know the difference before citing either.** `armourClass` and `passivePerception` are
   **published** to every audience by [ADR 0014](docs/adr/0014-what-a-coin-says-about-itself.md), so
   they sit on `exact` and on `band` alike. The promise the union exists for is *the player-facing
   variant has nowhere to put a hit point*, and it holds word for word: `band` still has no
   `current` and no `max`. A field on **both** members is not a discriminator question at all — the
   union has nothing to say about a fact both audiences get. So this is a published field added, not
   a guard loosened, and `vitals.test.ts` pins the real claim mechanically: **no member of the band
   variant is a bare `float64`**, which is exactly what `current: v.number()` would be, while both
   published fields are `v.union(v.number(), v.null())`.

   **The scope is what keeps it defensible, and it is server-side.** `visibleVitals` drops a
   creature the caller may not see *before* it assembles either variant, so a GM-layer or fogged
   creature contributes no row and therefore no armour class. `maySeeCharacter` is untouched, and
   `characters.sheet` still refuses an ordinary NPC. **The set of creatures a player hears about did
   not change** — only what a row for one of them says. Do not read this as licence to move another
   field onto that payload: a second one is a second decision and needs its own ADR.

   **There is a third shape, and it is a leaked *module*.** The two premade corpora —
   `convex/lib/library/` and `convex/lib/bestiary/` — are content nothing outside resolution has any
   business reading, and two different guards hold that:

   | Guard | Rule |
   | --- | --- |
   | `bundleGuard.test.ts` | nothing under `src/` may import either corpus, or `lib/resolve.ts`, which pulls both in behind it |
   | `corpusGuard.test.ts` | inside `convex/`, only `lib/resolve.ts`, `bestiary.ts` and `characters.ts` may import them |

   The first is about bytes: ~450 KB of stat blocks in a bundle already near a megabyte, for data no
   client reads. The second is about the choke point — it is what keeps `resolveSheet` the only door
   to a stat block, so a future module cannot read a creature's numbers around `maySeeCharacter`. Both
   match a **quoted module specifier** rather than a bare path, deliberately: several components
   legitimately explain in prose why the corpora are server-side, and a guard that fails on the code
   most carefully written to respect it is a guard that gets deleted.

   **The third entry on that allow-list is narrower than the other two, and the difference is the
   point.** `characters.ts` imports `bestiaryEntry` and nothing else: `requireUsableSheet` has to
   answer "is this the key of a creature that exists?" before a write, and `lib/sheet.ts` — where
   every other stored-sheet check lives — can never ask, because every function in that file also runs
   in the browser. So the rule is not "three modules may read a stat block"; it is **one module may
   read a stat block, one may resolve a summary, and one may ask whether a key exists.**
   `corpusGuard.test.ts` pins that by asserting the *imported names*, not just the importer — so
   `characters.ts` reaching for the scaler or a content file fails the build.

9. **A fourth stored sheet kind is one predicate away from publishing every monster in the game.**
   `characters.sheet` holds a union — `pc`, `npc`, `preset`, `bestiary` — and whether a document is a
   monster is decided by `isMonsterSheet` in `convex/lib/sheet.ts` and nowhere else.

   It is an **allow-list of the kinds that may be published, not a deny-list of the ones that must
   not be**, and that inversion is the whole reason it exists. The formulation it replaced was
   `sheet?.kind === 'npc'`, written in three places, and it was the only kind-test in the codebase
   whose wrongness was invisible to the compiler: add a member to the union and it keeps compiling,
   keeps passing, and answers `false` — publishing the new kind to every player at the table. Of all
   the tests that could have had that property, it was the one guarding the secret.

   Two properties to preserve if you ever add a fifth member. The `never` assignment in the default
   branch makes `npm run lint` fail until the question is answered, and the **runtime** default is
   `true`, which is fail-closed: a schema push is not atomic, so a document written by a newer
   deployment can be read by an older one, and in that window a secret must read as a secret.

   **There is now a second discriminated union on the same type, and it got the same treatment.**
   `SheetEntry.category` is `weapon | action | passive`, and `rollShapeOf` in `convex/lib/sheet.ts`
   is the one place it is switched on — an allow-list with a `never` arm, beside a
   `Record<SheetEntryCategory, string>` of labels that fails to compile for a fourth member too.
   Two mechanical refusals is the right number for a union a whole milestone turns on. Nothing here
   guards a secret, so unlike `isMonsterSheet` the runtime default is unreachable and says so; the
   compile-time refusal is the whole of the guard. **The renderer iterates
   `SHEET_ENTRY_CATEGORIES` rather than naming three categories in JSX**, because three `filter`
   calls is the formulation where a fourth category leaves an entry stored, counted against
   `MAX_SHEET_ENTRIES`, and invisible with no row to delete it.

   **One convention this settled, worth knowing before adding a tenth optional field.** A `SheetEntry`
   now spells "none" two ways, and which one is not a preference: `roll`, `level` and `catalogueKey`
   use `null` because they are *required*, and a required field needs a value meaning none;
   `category` and `toHit` use *absence* because the schema push forced them optional, and an optional
   field already has a spelling for none. Adding a second is two states for one meaning, which every
   field-by-field rebuild then has to agree about and which `board-smoke.mjs` reports as
   `present on one side only`. See [ADR 0008](docs/adr/0008-one-shell-and-what-a-sheet-entry-is.md).

   **There is a third union on this type, and knowing why its default is safe is the point of
   mentioning it.** `CharacterGroup` — `character | npc | monster` — decides which heading the DM's
   sheet selector prints a row under, and `groupOf` in `convex/lib/resolve.ts` is the one place it
   is answered. That is **three mechanical refusals** on this type now, because `groupOf` has a
   `never` arm too, and the renderer iterates `CHARACTER_GROUPS` through a `Record` rather than
   naming three sections in JSX for the same reason `rollShapeOf`'s does.

   ⚠️ **But `CharacterGroup` is a display discriminator and `isMonsterSheet` is a security one, and
   they must not be merged.** Both values `groupOf` can return for a creature are DM-only — a player
   receives neither, because `maySeeCharacter` refused the whole row before anybody asked which
   heading it went under — so a wrong answer misfiles a row and can never publish one. That is why
   an unanswered hand-built sheet may default to `'npc'` and a retired entry key may fall back to
   `'monster'` rather than throwing inside the query that paints the DM's whole panel.
   `isMonsterSheet` defaults to `true` for the opposite reason: getting *that* one wrong publishes a
   dragon. Do not copy this one's tolerance across to that one.

   ⚠️ **`tokens.layer` is a fourth union on this schema, and it is the one this file kept naming as
   the counter-example — so read what actually made it hard.** It is now `background | player | gm`,
   and the difficulty was never the extra member. It was that `isDm || layer === 'player'` was doing
   **two jobs that happened to coincide**: deciding what a client is *sent*, and deciding what a
   client may *move*. A player-layer token is both; a GM-layer token is neither. **Background is seen
   by everybody and moved by nobody but the DM**, so it is the first row for which those answers
   differ — and no amount of widening one predicate produces two.

   So there are two, in `convex/lib/layers.ts`: `maySeeLayer` and `mayPlayersMove`, a `never` arm
   each, both fail-closed, with `TOKEN_LAYER_LABELS` beside them. **A fourth member hits five
   compile-time refusals** — those three plus a `Record` on each of the two client surfaces that draw
   and label a layer — and `lib/layers.test.ts` pins the hand-spelled validator against
   `TOKEN_LAYERS` for the direction the compiler cannot see: a literal added to the *validator*
   alone, which the schema would then store and nothing could filter or draw.

   ⚠️ **`maySee` did not move and must not.** What lives in `lib/layers.ts` is a function of a
   *string*; what stays in `lib/board.ts` is every predicate that takes a `Doc<'tokens'>`, so the
   table above is still correct and *does this leak?* is still answered by reading one file. The
   `isDm` short-circuit sits **above** the layer switch rather than inside it, so the `never` arm
   never has to decide what a DM sees — a second question inside a discriminator is the failure
   `isReservedCharacter` is written the way it is to avoid.

   ⚠️ **There is now a union on this schema with NO `never`-arm switch, and reading why is the
   point of this paragraph — it is the exception that says what the rule is actually for.**
   `TokenMarker` is the seventeen conditions a coin can carry, in `convex/lib/markers.ts`, and
   nothing switches on it anywhere. That is not an oversight to be corrected: **there is no
   predicate**, because nothing in `convex/` decides anything from a marker — no roll consults one,
   no health band is computed from one, no drag is refused because of one. A switch written to
   satisfy this invariant would be a guard that cannot fail, which is exactly what
   [ADR 0012](docs/adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md) argued out of
   `fogRects`' leak-guard entry, and this project does not keep those.

   What the invariant protects is met three other ways that *can* fail: `TOKEN_MARKER_LABELS` on the
   server, a `Record` of pip glyphs on the client, and `lib/markers.test.ts` pinning the validator's
   members **and their order** against the `as const` list — the direction the compiler cannot see,
   which is the one `lib/layers.ts` already exists to cover. Order, because the renderer iterates
   the vocabulary, so the array *is* the pip order.

   **The fail-closed runtime behaviour is real and has a home, in three places rather than one.**
   `normaliseMarkers` iterates the vocabulary and intersects with the stored array — never maps over
   it — on the write path, in the **server projection**, and in the renderer. The middle one is the
   one that would be missed and matters most: `board.markers`' `returns:` is
   `v.array(tokenMarkerValidator)`, so a row written by a newer deployment during a non-atomic push
   would make that query **throw for every caller** and take the whole table's conditions
   subscription down, where dropping it costs one undrawn pip. That is `maySeeLayer`'s composition
   argument reaching a second union.

   **So the rule to carry forward is not "every union gets a `never` arm".** It is: *find the place
   a wrong answer does damage, and make the compiler refuse there.* For `isMonsterSheet` that is a
   predicate and the arm is the guard. For `TokenMarker` there is no such place, and two `Record`s
   and an order-pinning test are the whole of it.

   **Fog is a second, unrelated reason to withhold, `&&`-ed at the call site** exactly as
   `isReservedCharacter` is beside `maySeeCharacter`. It is a fact about a *(scene, position)* pair
   rather than about a row, so folding it into `maySee` would hand that predicate a set it cannot
   verify was built for the same caller and the same scene. It is applied in `visiblePositions` and
   in **one `continue`** inside `boardCharacterAccess`'s existing loop — which costs a fogged
   creature its health band and its feed lines together, by the subset property ADR 0009 already
   made structural. Deliberately **not** applied in `publicTokens`: see the threat model.

10. **A roll is decided on the server, and a test rather than a comment is what keeps it there.**
    All the arithmetic and all the randomness live in `convex/lib/dice.ts`, and **nothing under
    `src/` may import it** — `bundleGuard.test.ts` fails the build on any quoted specifier that
    tries. That guard *is* the rule: a roll the browser computes is a roll the browser can choose,
    and an evaluator in the bundle is an evaluator a player can call with a source of their own and
    a total of their own, on a screen everybody else is reading.

    `convex/lib/roll.ts` is the browser-shared half and holds the vocabulary — the modes, the parts
    of an entry, the shape of a result, the request a client may send, and the one sentence generated
    from a row. No arithmetic, no randomness, nothing secret. So a client renders a row it was *sent*
    and has no way to produce one.

    ⚠️ **A roll request names an identifier and never a number.** `feed.roll` takes an entry *id*, an
    ability or a skill, and the server reads the name, the category, the spell level, the text and
    the expression off the stored sheet — which is why the request type and the stored subject type
    are two types where one would compile. Reusing the subject as the argument would hand the client
    `name`, `category`, `level` and `text` as *inputs*, and a mutation that writes what it was told
    has a feed that is whatever the network tab says it is. `feed.rollDice` is the one place an
    expression legitimately arrives from a person, and it is therefore the only place
    `ROLL_PATTERN`'s uncapped trailing term group is reachable — so it must go through `rollProblem`
    and never bare `isValidRoll`, because only the former enforces `MAX_ROLL_LENGTH`.

    Randomness is `crypto.getRandomValues` with rejection sampling, never `Math.random`
    (ADR 0003's rule, applied to dice). 256 is not divisible by 6, so a naive modulo would make a
    d6's 1 come up about 2% more often than its 5, forever, on every damage roll in the game.

    The **die-count cap is load-bearing** and is the grammar rather than a separate check:
    `ROLL_PATTERN` admits **1–50 dice over eight faces — d2, d4, d6, d8, d10, d12, d20, d100** —
    and `MAX_ROLL_DICE` is that fact named, so a client cannot ask the physics engine for 99,999
    dice. A scaled creature's damage already goes through it.

    ⚠️ **It was 1–20 over seven faces, and it moved by decision rather than by drift.** The ad-hoc
    dice tray wanted a d2 and a 1×–50× count;
    [ADR 0014](docs/adr/0014-what-a-coin-says-about-itself.md) records it and
    [docs/requirements.md](docs/requirements.md) carries the amendment. Two things to know before
    touching it again:

    - **It is one grammar for two callers**, and that was the contested part. A sheet entry and a
      string somebody types in the tray are checked by this one expression, with no second bound
      anywhere — so the price, taken knowingly, is that a stored damage expression may now
      legitimately read `30d6`. Two caps are two things that agree on the day they are written; if
      this has to be re-narrowed, narrow it *here*, for both.
    - **`MAX_ROLL_DICE`'s docblock is the checklist** and it was used as one. Moving the number
      moves the regex, the constant, both `clamp` calls in `lib/dice.ts`, the CR scaler that reads
      it to bound its multiplication, `ORDINARY_FACES` in `src/lib/dice/notation.ts` — the
      renderer's own face list, which nothing checks against the grammar — and this paragraph.

    ⚠️ **The renderer has no die-count cap at all, so the grammar is also the rigid-body count.**
    Fifty dice is fifty bodies in the physics engine. If that turns out to be unusable the fix is a
    *renderer* cap that shows a subset and says so — **never** a second grammar.

### Threat model — what the invariants above are for, and where the line is

The audience is a small group of trusted colleagues. That **scopes** the invariants rather than
softening them, and the distinction matters in both directions, because there are two opposite ways
to get this wrong.

**Cheap structural guards stay, and invariant 1 is absolute.** Filtering DM data inside the query is
a predicate in one module — it costs nothing, and it is the only reason an ambush is actually a
surprise. So there is no trade-off to make here: never send a client a secret it must not have, and
never "hide" one in the browser instead. Free things do not get weighed against convenience.

**Expensive machinery to close the residual holes does not get built.** A `playerId` is routing and
not identity (invariant 7), so a player with the network tab open can still pass another seat's id
and move a token that is not theirs. Closing that needs real user accounts, which
[ADR 0002](docs/adr/0002-defer-user-accounts.md) has now declined four times —
[ADR 0004](docs/adr/0004-board-authorisation-and-layers.md) records why advisory enforcement is the
whole of what this table wants. Server-side refusals that stop a misclick are worth having and are
not claimed to be more than that.

⚠️ **One sentence that used to sit here is no longer true, and it is sharpened rather than
softened.** This section used to say that the residual is acceptable because a refusal *guarding a
secret* keys off the DM code alone, so nothing behind one is reachable by passing somebody else's
seat id. Since control grants sight ([ADR 0009](docs/adr/0009-who-plays-what-and-what-control-grants.md)),
a grant is a **second door onto a secret** — a granted seat receives that creature's sheet and its
exact hit points. So the residual now reaches a monster's stat block, not only a rude shove of a
hero everybody can already see.

State the change precisely, because both of the sloppy readings are wrong. The **layer filter still
keys off the DM code alone**: `maySee` consults nothing else and must not. What widened is one
predicate, by exactly one act, and that act has an author — the DM ticked a box. Nothing ungranted
moved, a grant on a DM-layer token is inert, and `controlledCharacterIds` returns the empty set for
a caller with no seat. **The line moved by one deliberate act, not by a relaxation**, and it is
written into `requireMovableToken` and `requireEditableCharacter` as well as here so the next reader
does not have to discover it.

⚠️ **There is now a third audience, and until recently there were two.** Everything above reasons
about a caller holding the join code (a bearer credential the whole table shares) or the DM code. The
set of things reachable with **no credential at all** used to be empty, and is now exactly this: for
the thirty most recently created games, the game's **name**, its creator's **display name**, its
creation time and whether it is in play — `games.list`, which is the one query in this application a
browser may call having typed nothing. Every other field of that document, the **join code included**,
is absent from the payload by construction, which is why the projection is derived from
`publicGameValidator` and why the test pinning its exact key set is not optional (invariant 8 — a
subtractive spec across two audiences only guarantees the fields it names). Scoped rather than
excused: a game name is not a secret the way a scene name or a creature name is. See
[ADR 0010](docs/adr/0010-the-way-in-and-the-dms-coins.md). **Anything else that would be readable
with no credential is a new decision and needs one**, because this is the boundary where "the code
still admits you" either holds or has quietly stopped holding.

⚠️ **The feed adds one residual, and it is a *count* rather than a content leak.** `feed.list` reads
the newest sixty rows and then filters, because "the newest sixty a player may hear" is not a bounded
read at all — whether a row is readable is a decision about a *character*, so no index can carry it
and honouring it first means scanning until sixty survive, over the one table in a game that nothing
caps. The cost is that a player's window is shortened by the DM's private lines and by a hidden
creature's, so somebody who has counted the public rolls can learn **how many** lines they are not
being shown once a game passes sixty. Their content is never reachable and neither is the name of
whatever made them.

Scoped rather than excused, and worth contrasting with the count leak `boardCharacterAccess`
*refuses*: that one was a health band per NPC in the game, and scoping it to the creatures already on
the board cost nothing at all, so it was required by the rule below. This one costs the bound. **A
free guard is mandatory and a paid one is weighed** — which is the same line, applied where it
actually bites for the first time.

⚠️ **Fog of war is the first guard this project has knowingly shipped incomplete, and it is a third
register again — not free, not merely paid, but *partial*.** The two above are whole guards whose
cost is weighed. This one works completely for the thing it was built for and not at all for the
thing beside it, and both halves are deliberate:

- **Real for tokens.** A creature standing in a fogged rectangle is filtered server-side, so a
  player is sent no position row, no health band and no feed line for it. Absent from the payload,
  the way the GM layer is.
- **Polite for the map.** The background image is fully downloaded, so devtools recovers the
  unfogged floor plan. Closing that means tiling or masking the map server-side, which multiplies
  storage against the 1 GB ceiling and complicates zoom and calibration. The monsters were the
  secret, not the floor plan.
- **And it does not hide that a coin exists.** A fogged creature's *name and art stay in
  `board.tokens`*, because filtering that query would put a `tokenPositions` read into it and make
  every drag frame re-resolve two hundred signed storage URLs — the cost ADR 0004 split the two
  board queries to avoid. What fog takes is where something is, how hurt it is, and what it just
  rolled.

So: **the GM layer is the secrecy tool and fog is a map tool.** A creature that must not be known
about goes on the GM layer, where no arithmetic decides anything and the guard is whole. Reaching
for fog to hide the existence of something is using the wrong one, and the interface says so only in
the copy on the layer picker. **A partial guard described as a whole one is worse than no guard**,
because somebody plans an ambush around it — which is why this paragraph exists rather than a
sentence saying fog hides monsters.

⚠️ **A fourth register, and it is the only one where this project has taken a secret it was keeping
and given it away.** A creature's **armour class and passive perception** are now sent to every
player who can see its coin — see [ADR 0014](docs/adr/0014-what-a-coin-says-about-itself.md) and the
amendment in [docs/requirements.md](docs/requirements.md), which is the first in that section to lift
a *secrecy guarantee* rather than a rules exclusion. ADR 0005 used a dragon's armour class as **the**
worked example of the row-shaped secret, and that clause is struck through in place there.

Be precise about what moved, because both sloppy readings are wrong. **What did not move is the
scope:** `visibleVitals` drops a creature the caller may not see before it builds a row, so a
GM-layer or fogged creature publishes nothing — the set of creatures a player hears about is the same
set it was. `maySeeCharacter` is untouched and the rest of the stat block is exactly as unreachable.
**What moved is one payload's contents, by one deliberate act with an author** — the maintainer was
shown that the number was withheld and chose to publish it. The GM layer is still where a creature
that must not be known about goes.

The line: **not sending a secret is nearly free, so it is required; proving who is asking is not, so
it is out of scope.** That still holds exactly as written for every secret nobody has deliberately
published — such a secret is still not sent, and never hidden in the browser instead. Read either
this paragraph or the one above it as licence to ship DM data to players and you have inverted them
both: a published fact is one somebody decided to publish, on the record, and everything else is a
secret. What would move the line itself is an audience, not a feature — the game being played outside
the trusted group.

## Rules scope

This application plays **D&D 5e (2024), SRD 5.2.1, at character levels 1–5.** It used to play a
cherry-picked subset called *D&D Lite*, and Milestone 14 did not extend that subset — it **replaced**
it. Where a number, a list or a name here disagrees with SRD 5.2.1, **the SRD is right and this
application is wrong.** See [ADR 0016](docs/adr/0016-the-5e-2024-conversion.md).

⚠️ **Before adding a rules feature, check [docs/requirements.md](docs/requirements.md) *including its
amendments section*.** The two `DnD Lite rule set` lists at the top of that file are the originals and
are kept verbatim on purpose: a spec quietly edited to match the code can no longer catch the code
being wrong. They are now a record of the game this application was **asked for**, and the amendments
below them are the record of the game it **plays**. Reading the lists alone will tell you that races,
skills and spell slots are excluded, all three of which are false and each of which was lifted on the
record with an ADR behind it.

**The level cap is the whole of what is reduced.** Levels 1–5, which caps a spell at level 3 and a
prepared creature at challenge rating 6. Everything else is either the SRD, or an exclusion below.

### What is out, and it is still most of what was ever out

**Backgrounds as an entity, inventory, weight, encumbrance, experience points, money, languages,
multiclassing, every biography field, levels 6–20, magic items and attunement, the action economy,
and concentration as a check.**

Two of those are load-bearing rather than merely absent.

- ⚠️ **Background is excluded, and that exclusion is what forces the absorption** — read this before
  concluding it was lifted. In 2024 the *background* grants the ability spread, two skill
  proficiencies and an Origin feat, and the species grants none of them. Excluding backgrounds
  removes the **source**, so the premade sheet stores the finished numbers, which is what a premade
  sheet has always been for. There is still **no background on a character, no background list, and
  no second source of proficiency** — one authority for a fixed set of numbers, plus the DM's
  override, and nothing third. Adding backgrounds as an entity puts the second source back the day it
  lands.
- **Equipment is still a line of text.** An SRD starting-equipment package reduced to
  `LibrarySheet.equipment` is exactly what *"No inventory — set equipment per character"* permitted
  for the hand-written kits, and it has now governed two entirely different rule sets without a word
  changing.

Everything on those lists is **excluded by design, not missing.** Lifting one is a spec amendment
with an ADR behind it — not something a feature branch does on the way past.

### A label is not a rule, and this is the seventh time the line has been drawn

The distinction that makes a full-ruleset conversion possible at all: this application **announces
and counts**, and the table **adjudicates**. A field that prints a word the rules use is not a rule
that enforces it.

| # | The label | The rule it is not |
| - | --- | --- |
| 1 | A premade sheet's **equipment kit** | an inventory |
| 2 | A creature's **loot** | an inventory |
| 3 | A creature's **type, size, alignment, role, tier, tags and DM notes** | anything adjudicated |
| 4 | A coin's **condition pips** — seventeen of them, `prone` and `restrained` among them | a speed halved, advantage granted, a drag refused |
| 5 | A creature's **armour class and passive perception** on its coin | a roll compared to either, or a creature noticing anybody |
| 6 | A weapon's **mastery** — Cleave, Graze, Nick, **Push**, Sap, **Slow**, **Topple**, Vex | anything shoved ten feet, any speed reduced by ten, anybody knocked Prone |
| 7 | A spell's **casting time and duration**, including `Concentration, up to 1 minute` | a bonus action counted, a spell dropped when its caster takes damage |

⚠️ **Rows 6 and 7 arrived with the conversion and both are near-misses on a live exclusion**, which
is why each has an amendment rather than a comment: *"No movement-detriment status effects (prone,
stand up, difficult terrain, etc.)"* names three of the eight masteries by their exact effect, and
**an unrecorded near-miss is indistinguishable from a quiet lifting.** Two Goliath ancestries brush
the same exclusion for the same reason — *Hill's Tumble* sets Prone and *Frost's Chill* reduces a
Speed — and are named in the amendment for it.

⭐ **One entry left this table by becoming a rule, and that is the most instructive thing in it.** A
spell's **level** was row 0 for three milestones — *"the spell level stays on the sheet because it is
a label, and nothing anywhere implies a resource was spent"* — and it is a **resource** now: slots
are counted, spent and returned by a rest. It moved by going through the door below, on the record,
with an amendment and an ADR. Nothing else in the table has moved, and nothing moves by a branch
deciding it is obvious.

### The test that decides the next one, unchanged

**The moment something changes a number a player rolls against without a person asking it to, it
needs an amendment and an ADR.**

That sentence has now decided everything: CR scaling passed it (a stepper that changes eight fields
at once is the same act as typing into eight fields, done in one motion), the DM override passed it,
the four gaps below were declined by it, and **both reversals came back through it** rather than
arriving inside a feature branch. Keep it exactly as written — it is the door.

Applied to the conversion itself, at its full size: counting a slot compares nothing, refuses
nothing, and changes no die of damage; a death-save tally decides whether nobody dies; a resource
that recharges on a rest recharges when somebody presses *rest*. **No roll is compared to an armour
class or a save DC, no damage is applied, no resistance is halved, no condition does anything, no
mastery pushes anybody, no concentration breaks, no death save kills a character and no cast is
refused.**

The four neighbouring gaps, with their marks brought up to date:

- ✅ **Spell slots — reversed and built.** A spell's level is a resource. ⚠️ **A *person* spends one,
  and `convex/feed.ts` deducts nothing** — announcing a spell consumes no slot, refuses no cast and
  picks no slot level, because a level 1 spell may legitimately be cast with a level 3 one and the
  application has no way to know which. ADR 0011's supersede table says *"a roll spends one"* and that
  clause is wrong; ADR 0016's resource-shape section is the record. This closes ADR 0011's
  decision **1**, superseded in place there.
- ✅ **A hero's spell save DC and spell attack bonus — reversed and built.** Every 2024 caster has
  both, derived from a stored spellcasting ability plus the proficiency bonus, so declining them
  ships a sheet with two boxes the rules describe left empty. ⚠️ **This reverses a *field*, not the
  decision to announce rather than adjudicate** — nothing compares a roll to either. This closes
  ADR 0011's decision **2**, which stood until the conversion and does not now.
- ✅ **Limited-use abilities — reversed and built.** Counted per key, with a maximum, a recharge
  period and an amount returned by the shorter rest, and there is a short rest. This closes ADR 0011's
  decision **4**.
- ✅ **Concentration and the action economy — still declined, and still the right call.** No field
  and no check, and nothing on the sheet implies otherwise: a spell row printing *Concentration* is
  row 7 above. Enforcing an action economy means knowing whose turn it is, which means an initiative
  tracker that owns the round, which means the app adjudicating the one thing this project exists to
  leave to the people at the table. **ADR 0011's decision 5 stands.**

See [ADR 0011](docs/adr/0011-announcing-a-roll-rather-than-adjudicating-one.md) — decisions 1 and 4
are struck through in place there, decision 2 is superseded by the conversion, and 3 and 5 stand.
⚠️ That record's status line points forward at *"ADR 0015"* for the reasoning behind its reversals;
**that number went to the fog milestone, and [ADR 0016](docs/adr/0016-the-5e-2024-conversion.md) is
the record.** Left uncorrected there, because ADRs are not edited after the fact.

### Two guard tests, because two of these exclusions are held by machinery rather than by prose

**Conditions on a coin lifted nothing either, and this is the first entry where a guard *test* is
what makes that true rather than a promise.** A coin carries a fixed vocabulary of seventeen D&D
conditions — `prone`, `grappled`, `restrained` and `paralyzed` among them, all four named or implied
by requirements.md's *no movement-detriment status effects*. What ships is the **word on the coin**:
no speed is halved, no advantage is granted, no drag is refused, no band is recomputed, and nothing
on a sheet changes. The same register as loot being a line of text.

The difference from every previous "we declined to adjudicate it" entry is that this one is
**enforced**. `markerGuard.test.ts` greps `convex/` for a quoted import of the vocabulary and allows
exactly three modules — the schema, the choke point and the board's public functions — plus a second
sweep for the helper names, because a module could import nothing and still reach the row through
`lib/board.ts`. It is a test rather than a comment because the way this exclusion gets broken is
somebody adding three reasonable lines to `convex/lib/dice.ts`, and a comment there would not stop
them. See [ADR 0013](docs/adr/0013-a-coin-you-can-copy-place-and-label.md), and the amendment in
[docs/requirements.md](docs/requirements.md) — which is written down precisely because the exclusion
names the words now on screen, and an unrecorded near-miss is indistinguishable from a quiet lifting.

**`masteryGuard.test.ts` is that paragraph's sibling, and its allow-list is narrower — one module
where the marker guard's is three.** `convex/lib/mastery.ts` holds eight strings, a hand-spelled
validator and a `Record` of labels that are capitalised words with **no effect description on them**;
the one module permitted to reach any of it is `./lib/sheet.ts` — the validator that stores a mastery,
the accessor that reads it back, and the arity rule that refuses it on anything but a weapon. Same two
sweeps, same reason, and **the same module both guards exist to keep out**: `convex/lib/dice.ts`,
because the way *this* exclusion breaks is somebody writing three reasonable lines that grant
advantage for Vex.

⚠️ **There is no `never`-arm switch in `lib/mastery.ts`, and it is declined explicitly rather than
forgotten.** Invariant 9's rule is *find the place a wrong answer does damage and make the compiler
refuse there*; for a mastery there is no such place, because a switch would be the first module in
`convex/` to **read** one. That is `TokenMarker`'s argument reaching a second vocabulary, and two
`Record`s plus the guard are the whole of it.

### ⚠️ What the conversion did NOT change, which is nearly everything above this section

A reader who has just seen 283 creatures, 183 spells, nine species and eighteen skills arrive will
assume the guards moved with them. **They did not, and the assumption is the dangerous one**, because
acting on it means rebuilding machinery that already works or, worse, relaxing a choke point that was
never in the way.

- **Invariant 8's table gains no table, no reader and no predicate.** `maySeeCharacter`, `maySee`,
  `mayHearOf` and `boardCharacterAccess` are untouched. A monster's sheet is still a leaked *row*, its
  hit points a leaked *field*, and the two corpora a leaked *module* behind `bundleGuard` and
  `corpusGuard`. Every one of those guards keeps its exact meaning because **none of them reads a
  rule** — they read a layer, a control grant and a document kind.
- **Invariant 9's stored-sheet union gains no member.** It is still `pc | npc | preset | bestiary`,
  and `isMonsterSheet` is still the one allow-list that decides monster-ness.
- **Invariant 10's guards are true word for word.** All the arithmetic and all the randomness are
  still in `convex/lib/dice.ts`, nothing under `src/` may import it, a roll request still names an
  identifier and never a number, and `ROLL_PATTERN` still admits 1–50 dice over eight faces.

**Every field the conversion added is a label on a DM-only sheet, a number the DM's own stepper
moves, or a count a person ticks.** A conversion that changed one of the guards above would be doing
something other than converting.

⚠️ **One thing that *is* stale in the tree rather than settled**, and it is named so nobody reads it
as the decision: `SPEED_FEET` is still 35 and `SUBCLASS_LEVEL` is still 2, while the nine species
print 30 (35 for the Goliath) and the SRD chooses a subclass at 3. Both move in the migration commit,
because `speedOf` answers the constant for every sheet with `speed` absent and every stored sheet has
it absent — a **stored-value change wearing a constant's clothes**. Until then the application is
half-converted and the code is not the specification.

## Commands

```powershell
npm run dev          # Vite dev server (frontend)
npm run dev:backend  # convex dev — watches convex/ and pushes to the dev deployment
npm run build        # tsc --noEmit && vite build (same command CI runs)
npm run lint         # typecheck only — both src/ and convex/
npm test             # vitest run — the convex-test suites in convex/*.test.ts
npm run test:smoke   # scripts/board-smoke.mjs — the board API against the REAL dev deployment
npm run prune-games  # scripts/prune-games.mjs — deletes the games test:smoke leaves behind
```

`npm run test:smoke` is not a second copy of `npm test`, and the difference is the point:
**convex-test does not apply Convex's own value validation.** A write it accepts locally can still be
rejected by a real deployment — Milestone 1 shipped exactly that bug, a truncated display name
leaving a lone UTF-16 surrogate that the suite stored happily and the cloud refused. The smoke script
does genuine round trips against the dev deployment (a real upload URL, a real POST of real bytes,
real float64s through the position table), so that class of failure surfaces here rather than in
front of the group. It needs `.env.local` (or `VITE_CONVEX_URL`), which `npm run dev:backend`
writes, and it creates a throwaway game each run, deleting the scene, tokens, characters and seats
it made on the way out.

**The game document itself still stays, and `npm run prune-games` is what sweeps them up.** There is
now a delete path for a game — `purgeGame` in `convex/admin.ts` — but it is an `internalMutation`
and it is a **maintenance tool rather than a feature**: the admin view that deletes a game a person
chose is still the game-editor and admin milestone, and the reason this could be built ahead of it
is that an internal function does not have to answer *who* may delete a game. It is absent from the
generated public API and reachable only by a caller already holding deploy credentials, which is the
same authority as deleting the rows from the dashboard. ⚠️ **Do not give it a public mutation** —
that puts the authorisation question back, and that question wants an ADR. The smoke script
deliberately does *not* call it: it authenticates with a game code over `ConvexHttpClient` like any
other client, and wiring the purge into its cleanup path would make a test depend on deploy
credentials it does not otherwise need.

**`npm run dev:backend` is needed whenever you are changing anything under `convex/`** — it watches
those files and pushes them to the dev deployment. It also writes `.env.local`, which the frontend
needs for `VITE_CONVEX_URL`.

To *use* the app you only need `npm run dev`. The dev deployment lives in Convex's cloud and stays
up on its own, so a frontend pointed at it works with no second terminal. That is why testing a
lobby in two browsers needs one command, not two.

Deployment is automatic on push to `main` (see `.github/workflows/deploy.yml`). It deploys the
Convex backend and builds the frontend in one step so the two can't drift.

## Imports

- `@/…` → `src/…`
- `@convex/…` → `convex/…` (mainly `@convex/_generated/api`)

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
