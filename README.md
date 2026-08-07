# Coffee, Code n' Kobolds

A lightweight, browser-based virtual tabletop for playing **"Dungeons & Dragons Lite"** — a
streamlined subset of the D&D 5e (2024) rules — with a small group over their laptops.

Think **Roll20's shared game board** crossed with **D&D Beyond's character sheets**, minus the
complexity neither of them lets you skip.

## What it does

- **Shared, live game board** — a pannable grid map where everyone sees token movement in sync.
- **Character sheets that roll** — click an item on your sheet to push the roll into the game feed,
  with 3D dice everyone can watch (and suitably dramatic crit / fumble effects).
- **DM tooling** — layered maps (background / player / DM), scene switching, NPC sheets, a token
  library, modal image reveals, and background music.
- **D&D 5e (2024), at character levels 1–5** — the SRD 5.2.1 subset: nine species, twelve classes
  with one subclass each, eighteen skills, 183 spells and a shelf of transcribed creatures. No
  backgrounds, no inventory, no multiclassing, no experience points.
- **It announces and counts; it never adjudicates.** No roll is compared to an armour class or a
  save DC, no damage is applied, no condition does anything and no cast is refused. The table
  decides; the app does the arithmetic and remembers what was spent.

Full spec: [docs/requirements.md](docs/requirements.md). Build order:
[docs/roadmap.md](docs/roadmap.md).

## Status

🚧 **Playable.** A game runs end to end: create it, join with a code, put a map on the table with a
grid and fog, move coins live, open a character sheet and click something on it to roll 3D dice into
a feed everyone watches.

The milestone in flight converts the rules from a hand-written subset to the **5e (2024) SRD 5.2.1**
at levels 1–5. Progress and what is left: [the roadmap](docs/roadmap.md).

**v1 scope note:** there are no user accounts. You join a game with a game code and a display name,
and characters live inside the game rather than against a user. This is a deliberate deviation from
the requirements — see [ADR 0002](docs/adr/0002-defer-user-accounts.md). Identity is your display
name: a player is a seat at the table, found by the name you type, so clearing your browser costs
you a retyped name and never a character — see
[ADR 0003](docs/adr/0003-player-identity-without-accounts.md).

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Frontend | React + TypeScript + Vite — static SPA, hash routing |
| Backend, database, realtime, file storage | [Convex](https://convex.dev) |
| Map canvas | react-konva |
| 3D dice | [@3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) — the fork, deliberately: rolls are decided on the server, and the original insists on rolling its own numbers ([ADR 0011](docs/adr/0011-announcing-a-roll-rather-than-adjudicating-one.md)) |
| Styling / components | Tailwind + shadcn/ui |
| Hosting | GitHub Pages, deployed via GitHub Actions |

One external service, no servers, $0/month. The reasoning — and the alternatives rejected, including
why not Supabase or Firebase — is in [ADR 0001](docs/adr/0001-platform-and-hosting.md).

Two rules that follow from this repo being public, and that are easy to get wrong: **DM layer
contents and exact NPC hit points must be filtered server-side in Convex queries**, never hidden in
the client.

## Getting started

Requires Node.js 24+.

```bash
npm install
npx convex dev     # first run only: signs in and provisions your dev deployment
```

After that, local development needs **two terminals**:

```bash
npm run dev          # Vite dev server → http://localhost:5173/coffee-code-n-kobolds/
npm run dev:backend  # convex dev — watches convex/ and syncs functions
```

`npm run dev:backend` writes `.env.local`, which supplies the `VITE_CONVEX_URL` the frontend needs —
so the frontend will not start cleanly until it has run at least once.

```bash
npm run build   # tsc --noEmit && vite build — the same command CI runs
npm run lint    # typecheck only
npm test        # vitest run — Convex function tests via convex-test
```

Deploys happen automatically on push to `main`. Decisions made so far are recorded in
[docs/adr/](docs/adr/).

## Contributing

Branch strategy and workflow live in [CONTRIBUTING.md](CONTRIBUTING.md). The short version:
work on a feature branch, merge into `dev`, and promote `dev` → `main` via pull request.

## Licence and attribution

This work includes material taken from the System Reference Document 5.2 ("SRD 5.2") by Wizards of
the Coast LLC, available at <https://www.dndbeyond.com/srd>. The SRD 5.2 is licensed under the
Creative Commons Attribution 4.0 International License, available at
<https://creativecommons.org/licenses/by/4.0/legalcode>.

The species, class, spell and creature content under `convex/lib/` is derived from **SRD 5.2.1**.
Numbers — ability scores, armour classes, hit points, damage expressions, challenge ratings — are
transcribed; **every description is paraphrased rather than copied**, so no SRD prose ships in this
repository and no SRD file is vendored into it. See
[ADR 0016](docs/adr/0016-the-5e-2024-conversion.md).
