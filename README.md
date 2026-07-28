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
- **Streamlined rules** — stat checks, saving throws, AC, initiative, HP and hit dice. Fixed 35ft
  speed, one action + one bonus action + one reaction per turn, no inventory, no movement-impairing
  conditions.

Full spec: [docs/requirements.md](docs/requirements.md).

## Status

🚧 **Pre-alpha.** Requirements are captured and the stack is chosen. No application code yet —
scaffolding is the next step.

**v1 scope note:** there are no user accounts. You join a game with a game code and a display name,
and characters live inside the game rather than against a user. This is a deliberate deviation from
the requirements — see [ADR 0002](docs/adr/0002-defer-user-accounts.md).

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Frontend | React + TypeScript + Vite — static SPA, hash routing |
| Backend, database, realtime, file storage | [Convex](https://convex.dev) |
| Map canvas | react-konva |
| 3D dice | @3d-dice/dice-box |
| Styling / components | Tailwind + shadcn/ui |
| Hosting | GitHub Pages, deployed via GitHub Actions |

One external service, no servers, $0/month. The reasoning — and the alternatives rejected, including
why not Supabase or Firebase — is in [ADR 0001](docs/adr/0001-platform-and-hosting.md).

Two rules that follow from this repo being public, and that are easy to get wrong: **DM layer
contents and exact NPC hit points must be filtered server-side in Convex queries**, never hidden in
the client.

## Getting started

Nothing to run yet. Setup instructions land here once the project is scaffolded.

Decisions made so far are recorded in [docs/adr/](docs/adr/).

## Contributing

Branch strategy and workflow live in [CONTRIBUTING.md](CONTRIBUTING.md). The short version:
work on a feature branch, merge into `dev`, and promote `dev` → `main` via pull request.
