# 1. Convex backend, Vite SPA on GitHub Pages

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

This is a virtual tabletop for playing D&D Lite with one workmate. The usage pattern is the
dominant constraint on every technical choice here:

- **Played a few times per year.** Long dormant stretches — months — between sessions.
- **Two to three concurrent users**, ever. Scale is a non-issue.
- **Must be free**, or as close to it as possible.
- **Minimum possible setup and maintenance effort.** The goal is to be playing, not administering
  infrastructure. Time spent configuring hosting is time not spent building the game.

Technically the app needs live state sync (token positions, dice rolls, HP, scene changes), a
database, file storage for maps / token art / modal images / music, and a static frontend. It is
desktop-browser only, so there is no need for SSR, SEO, or mobile layouts.

## Decision

| Layer | Choice |
| ----- | ------ |
| Frontend | React + TypeScript + Vite — a static SPA, **hash routing** |
| Backend, database, realtime, file storage | **Convex** |
| Map canvas | **react-konva** |
| 3D dice | **@3d-dice/dice-box** |
| Styling / components | Tailwind + shadcn/ui |
| Hosting | **GitHub Pages**, deployed by GitHub Actions |

This means exactly one new service account (Convex). No servers, no containers, no VPS.

**Convex** was chosen because it collapses the single largest chunk of work in this app. Its
database is reactive: every query is a live subscription, so token movement, the game feed, the
initiative order and HP changes propagate to all connected clients with no WebSocket code written
by us. It also covers file storage and scheduled functions in the same service.

**GitHub Pages** was chosen because the repository is already on GitHub and the repo is public, so
Pages is free with no additional signup. The build output is static files on a CDN — nothing to
wake up, no cold start.

**react-konva** was chosen because Konva models *layers* as a first-class concept, which maps
directly onto the background / player / DM layer requirement, and gives us drag, hit-testing, grid
snapping and freehand drawing (for the marker tool) without building them.

## Consequences

### Good

- No realtime infrastructure to write, deploy or debug — the hardest part of the app is a
  library feature.
- Nothing sleeps or pauses. A session in October and the next in March both start instantly.
- Total recurring cost: $0.
- Deploys are `git push`. No release process to remember between infrequent sessions.

### Costs and constraints we are accepting

- **1 GB Convex file storage on the free plan.** Ample for maps, tokens and modal images; music is
  the risk. Downscale map images on upload and keep the music library small. If it becomes a real
  ceiling, point the music player at external URLs rather than paying for headroom.
- **0.5 GB database and 1M function calls/month.** Unreachable at this usage level.
- **Do not write token positions to the database on every mouse-move.** Render drags locally,
  throttle position writes to roughly 10/sec, and commit on drop. Convex optimistic updates keep it
  feeling instant.
- **Hash routing** (`/#/game/ABC123`) because GitHub Pages has no rewrite rules, so a deep link to
  a client-side route 404s on refresh. Uglier URLs, but zero moving parts versus the `404.html`
  copy trick.
- **Vite needs `base: '/coffee-code-n-kobolds/'`** since the site is served from a subpath. Omitting
  this breaks asset loading in confusing ways.
- **A GitHub Actions workflow is required** to build and deploy. This is the one place GitHub Pages
  costs more setup than Cloudflare Pages, which needs no file at all. It is written once.
- **`VITE_CONVEX_URL` is baked into the bundle at build time**, so it lives in a repo *variable*
  (it is a public endpoint, not a secret). The Convex **deploy key** is a genuine secret and lives
  in Actions secrets.
- **Convex is a less common platform** than Postgres, so there is less community material and less
  model training data to lean on, and the data model is not portable to a plain SQL database
  without rewriting the backend.

### Security note that follows from the public repo

The repository is public, so the application code — including exactly how it queries Convex — is
readable by anyone. Two requirements therefore **must** be enforced inside Convex queries on the
server, never by filtering in the client:

1. DM layer contents must not be sent to player clients.
2. Exact NPC hit point numbers must not be sent to player clients — send a percentage for the
   health bar instead.

Client-side hiding of either would be defeated by opening devtools.

Uploaded assets are unaffected: maps, tokens and music live in Convex file storage, not in the
repository. Only the code is public.

## Alternatives considered

### Supabase — rejected

The obvious default, and the best-documented option. Rejected because **the free tier pauses any
project after 7 days without database activity.** At a few sessions per year, every single session
would begin by logging into a dashboard and waiting for a restore, and projects left paused long
enough are eventually deleted. This can be worked around with a GitHub Actions cron pinging the
database weekly, but that is permanent upkeep to fix a problem another platform does not have.
Removing the pausing requires Supabase Pro at **$25/month** — $300/year for an app used three times
a year.

Supabase's `broadcast` channels are genuinely the better primitive for high-frequency token drags,
which is the one real thing we give up.

### Firebase — rejected

Firestore, Auth and Hosting are still free and nothing pauses. Rejected because **Cloud Storage for
Firebase has required the paid Blaze plan and a linked billing account since 3 February 2026**, even
at zero usage. File storage is a hard requirement, so this fails the "free" constraint on a
technicality that cannot be designed around.

### Cloudflare (Workers + D1 + R2 + Durable Objects) — rejected

Technically excellent for this: nothing sleeps, 10 GB of free file storage, and Durable Objects are
close to a perfect fit for per-game rooms. Rejected purely on setup effort — `wrangler`
configuration, service bindings, and a hand-rolled auth and realtime layer. It is the most work of
the three viable options, and effort was the deciding criterion.

Cloudflare Pages remains a reasonable fallback for *hosting alone* if GitHub Pages becomes awkward.

### Paying for hosting — considered and rejected

Explicitly evaluated whether a small monthly fee would reduce effort. It does not. Paid tiers sell
headroom, not convenience: Convex Professional ($25/developer/month) is the same product with
larger numbers and identical setup, and the cheaper options (Render, Railway, Fly, a VPS at roughly
$5/month) all *increase* the work by handing us back the WebSocket server, auth, uploads and OS
maintenance. No amount of money removes a configuration step at this scale.

## References

- [Supabase free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Convex limits](https://docs.convex.dev/production/state/limits)
- [Cloud Storage for Firebase billing changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
