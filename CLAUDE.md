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
3. **Hash routing only** (`/#/game/ABC123`). GitHub Pages has no rewrite rules, so a browser-path
   deep link 404s on refresh.
4. **Vite needs `base: '/coffee-code-n-kobolds/'`.** The site is served from a subpath; omitting
   this breaks asset loading in confusing ways.
5. **Characters live inside the game document**, not against a player identity — see
   [ADR 0002](docs/adr/0002-defer-user-accounts.md). There are no user accounts in v1; players join
   with a game code and a display name.
6. **Keep uploads small.** Convex free tier gives 1 GB of file storage for maps, tokens, modal
   images and music. Downscale images on upload.
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
   structural: `convex/lib/board.ts` is the **only** module in `convex/` that reads `tokens` or
   `tokenPositions`, every read goes through its one `maySee(token, isDm)` predicate, and `isDm` comes
   from `resolveDmAccess` in `convex/lib/games.ts` — never `players.isDm` (invariant 7). Two tests
   hold it there: `leakGuard.test.ts` greps the sources for reads outside that module, and
   `board.test.ts` scans a player payload for a DM-layer token's id. Exact NPC hit points in
   Milestone 3 are the same shape of problem — see
   [ADR 0004](docs/adr/0004-board-authorisation-and-layers.md).

## Rules scope

D&D Lite is a deliberately reduced subset of 5e (2024). Before adding a rules feature, check
[docs/requirements.md](docs/requirements.md) — things like racial abilities, background skills,
inventory and movement-impairing conditions are **excluded by design**, not missing.

## Commands

```powershell
npm run dev          # Vite dev server (frontend)
npm run dev:backend  # convex dev — watches convex/ and pushes to the dev deployment
npm run build        # tsc --noEmit && vite build (same command CI runs)
npm run lint         # typecheck only — both src/ and convex/
npm test             # vitest run — the convex-test suites in convex/*.test.ts
```

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
