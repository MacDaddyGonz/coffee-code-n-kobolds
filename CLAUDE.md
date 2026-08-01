# Coffee, Code n' Kobolds

Browser-based virtual tabletop for playing D&D Lite. Desktop browsers only — no mobile layouts, no
SSR, no SEO.

Spec: [docs/requirements.md](docs/requirements.md). Build order:
[docs/roadmap.md](docs/roadmap.md). Decisions: [docs/adr/](docs/adr/).

## Branching — always work on a branch

**Never commit directly to `dev` or `main`.**

```
feature/xyz ──┐
              ├──▶ dev ──(pull request)──▶ main
  fix/abc  ───┘
```

- Branch from `dev` for every change, however small.
- Prefixes: `feature/`, `fix/`, `chore/`, `docs/`.
- Merge the branch into `dev` when it's complete and working.
- `main` only ever receives changes via pull request from `dev`. GitHub rejects direct pushes.

Commit messages: short imperative subject (`Add initiative tracker to DM panel`). Use the body to
explain *why* when the diff doesn't make it obvious.

## Stack

React + TypeScript + Vite (static SPA, **hash routing**) · Convex (database, realtime, file storage)
· react-konva (map canvas) · @3d-dice/dice-box · Tailwind + shadcn/ui · GitHub Pages via Actions.

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

   | Tables | The only module allowed to read them | The predicate |
   | --- | --- | --- |
   | `tokens`, `tokenPositions` | `convex/lib/board.ts` | `maySee(token, isDm)` |
   | `characters`, `characterVitals` | `convex/lib/characters.ts` | `maySeeCharacter(character, isDm)` |

   `isDm` comes from `resolveDmAccess` in `convex/lib/games.ts` in both cases — never `players.isDm`
   (invariant 7). `leakGuard.test.ts` greps every Convex source and fails on a read outside the
   declared reader; `board.test.ts` and `vitals.test.ts` scan real player payloads for a secret,
   each with a positive control so the scan cannot pass on an empty fixture.

   **Know which shape you have before picking a tool.** Milestone 3 has one of each, and they are
   not interchangeable — see [ADR 0005](docs/adr/0005-character-sheets-and-hit-point-secrecy.md):

   - An NPC's **sheet** is a leaked *row*, indistinguishable in type from a hero's, so it needs the
     choke point above.
   - An NPC's **hit points** are a leaked *field*, so `publicVitalsValidator` is a discriminated
     union whose player-facing variant has no numeric member at all. There is nowhere to put a hit
     point, and Convex throws if anyone ever adds one. That is the stronger guarantee, and it is
     available only because this particular secret happens to be a field.

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
[ADR 0002](docs/adr/0002-defer-user-accounts.md) has now declined twice —
[ADR 0004](docs/adr/0004-board-authorisation-and-layers.md) records why advisory enforcement is the
whole of what this table wants. Server-side refusals that stop a misclick are worth having and are
not claimed to be more than that.

The line: **not sending a secret is nearly free, so it is required; proving who is asking is not, so
it is out of scope.** Read this as licence to ship DM data to players and you have inverted it. What
would move the line is an audience, not a feature — the game being played outside the trusted group.

## Rules scope

D&D Lite is a deliberately reduced subset of 5e (2024). Before adding a rules feature, check
[docs/requirements.md](docs/requirements.md) **including its amendments section** — the exclusion
lists there are the originals, and two entries have since been lifted on the record.

What Milestone 4 changed, precisely:

- **Races are in.** Eight of them, one trait each; three change a number (Elf, Dwarf, Goliath).
- **Skills are in — from the class, not from a background.** Thirteen skills with a proficiency flag
  each, granted by the character's premade sheet and by the DM's override, and by no third thing.
  **Backgrounds are still excluded**, and keeping that distinction is what stops a second source of
  proficiency ever existing.
- **Speed is no longer fixed.** It is a stored field defaulting to 35, read through `speedOf`,
  because the Goliath moves 45.

Still excluded, and still by design: **backgrounds, inventory, multiclassing, experience points and
movement-impairing conditions.** The fixed equipment kit on a premade sheet is not an inventory —
it is a line of text, which is exactly what *"No inventory — set equipment per character"* asked
for.

Everything else on those lists is **excluded by design, not missing.** Lifting one is a spec
amendment with an ADR behind it — see [ADR 0006](docs/adr/0006-premade-character-library.md) — not
something a feature branch does on the way past.

**The monster bestiary lifted none of them, and that is worth stating** because it is the discipline
that makes Milestone 4's two amendments mean something. Every field it added — creature type, size,
alignment, role, challenge rating, tier, tags, loot, DM notes — is a **label on a DM-only sheet**, not
a rule anything adjudicates. Loot is a line of text and not an inventory. Nothing is rolled that the
existing grammar did not already describe.

CR scaling deserves the second look, because it *does* move numbers a player rolls against. It is
still not a rule: it is arithmetic the DM performs on the DM's own sheet, with a visible before and
after, and the app adjudicates nothing with it — a stepper that changes eight fields at once is the
same act as typing into eight fields, done in one motion. The DM override has exactly this character
and needed no amendment either. The test for whether that stays true is simple: **the moment one of
these fields changes a number a player rolls against without the DM asking it to, it needs one.**

**The sheet taxonomy lifted no exclusion either, and the amendment it did write is not to the rule
set at all.** `SheetEntry` gained a category — `weapon | action | passive` — and a weapon gained a
to-hit, which sounds like a rule and is the opposite: it is the spec's own sentence *"clicking an
item on a character sheet sends the roll to the game feed"* made precise enough to implement, since
three kinds of item behave differently and the spec assumed one. **A to-hit that was already written
into 763 descriptions as prose became a field**, and nothing new is adjudicated, evaluated or
rolled. The two amendments in [docs/requirements.md](docs/requirements.md) record a change to the
*screen* — the sheet and DM panels stop being slide-outs — and a clarification of what a sheet item
is. See [ADR 0008](docs/adr/0008-one-shell-and-what-a-sheet-entry-is.md).

## Commands

```powershell
npm run dev          # Vite dev server (frontend)
npm run dev:backend  # convex dev — watches convex/ and pushes to the dev deployment
npm run build        # tsc --noEmit && vite build (same command CI runs)
npm run lint         # typecheck only — both src/ and convex/
npm test             # vitest run — the convex-test suites in convex/*.test.ts
npm run test:smoke   # scripts/board-smoke.mjs — the board API against the REAL dev deployment
```

`npm run test:smoke` is not a second copy of `npm test`, and the difference is the point:
**convex-test does not apply Convex's own value validation.** A write it accepts locally can still be
rejected by a real deployment — Milestone 1 shipped exactly that bug, a truncated display name
leaving a lone UTF-16 surrogate that the suite stored happily and the cloud refused. The smoke script
does genuine round trips against the dev deployment (a real upload URL, a real POST of real bytes,
real float64s through the position table), so that class of failure surfaces here rather than in
front of the group. It needs `.env.local` (or `VITE_CONVEX_URL`), which `npm run dev:backend`
writes, and it creates a throwaway game each run, deleting the scene and tokens it made on the way
out — the game document itself stays, because there is no delete API for one before Milestone 7.

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
