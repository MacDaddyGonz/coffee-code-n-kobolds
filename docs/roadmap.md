# Roadmap

The order features get built, and why that order. Full feature detail lives in
[requirements.md](requirements.md) — this file is about **sequencing**.

Two principles drive the ordering:

1. **Risky things first.** The live token sync and the DM-layer security model are the parts most
   likely to force a redesign. Build them before there's a lot of code sitting on top of them.
2. **Reach a playable session early.** Milestones 1–4 are the minimum to actually run a game.
   Everything after that makes it nicer. For a game played a few times a year, a rough playable
   version beats a polished half.

Each milestone is a branch (or a few), merged to `dev`, then promoted to `main` when it's worth
deploying. Acceptance criteria are written so you can tell "done" from "mostly done".

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

## Milestone 2 — Map and tokens

The riskiest milestone. Do it carefully; everything visual sits on it.

- `scenes` table: background image, grid size, grid offset. Add `games.activeSceneId` and a game
  status field at the same time — they were left out of Milestone 1 because a `v.id('scenes')` field
  needs this table to exist first.
- **Two token tables**, deliberately split: stable data (art, name, size, layer, owning character)
  separate from position. Convex rewrites a whole document on patch, so mixing high-churn position
  into the stable document makes every drag contend with reads of all of it. See CLAUDE.md
  invariant 2.
- Layers: background / player / DM. **DM layer contents are filtered inside the Convex query** —
  never sent to player clients. CLAUDE.md invariant 1.

  Milestone 1 left the seam for this, and it is worth using rather than rediscovering.
  `resolveDmAccess` in `convex/lib/games.ts` answers "is this caller the DM?" from an optional `dmCode`
  without throwing, which is what a query needs — `requireDm` is the throwing form, for mutations.
  Never branch on `players.isDm`; it is a roster badge, not authority (invariant 7).

  Note what does **not** transfer: the `returns:` validator that guards the `games` document catches
  a leaked *field*, and a DM-layer token is a leaked *row* of exactly the same shape. Put every token
  read behind one reader function that takes `isDm` and returns only permitted rows, and write a test
  asserting a player payload contains no DM-layer id. A validator will not catch this one.
- react-konva stage: pan, grid overlay, round tokens, snap-to-grid.
- Drag handling: render locally, throttle writes to ~10/sec, commit on drop, Convex optimistic
  updates for instant feel.
- Just enough upload to get one map and a few tokens in. The full library editor is Milestone 7.

**Acceptance:** the DM drags a token and the player sees it move smoothly, not in jumps. A player
opening devtools and reading the network payload **cannot** see DM-layer tokens. Tokens land on grid
squares, not between them.

---

## Milestone 3 — Character sheets

The largest milestone by volume, but low risk — it's mostly data modelling and forms.

- D&D Lite character schema: six stats, saving throws, AC, HP + max HP, hit dice, initiative,
  fixed 35ft speed, a limited feats/traits list, a limited spell list.
- Character editor (DM can edit on a player's behalf, per requirements).
- Player character sheet slide-out panel.
- HP adjustment: +/- controls on the sheet and on the token health bar.
- Token health bars: exact numbers for player characters; **percentage only for NPCs on player
  clients** — the real numbers must not be in the payload. CLAUDE.md invariant 1.

Check [requirements.md](requirements.md) before adding anything here. No racial abilities, no
background skills, no inventory, no movement-impairing conditions — those are **excluded by design**.

**Acceptance:** create a character, edit its HP from the sheet and from the token, and see both
update everywhere at once. A player inspecting network traffic sees no exact NPC HP.

---

## Milestone 4 — Rolls, feed and dice

The bit that makes it feel like a game.

- `feed` table + game feed panel showing roll and ability history.
- Click a sheet item → roll pushed to the feed. **Alt-click** → the item's text description instead.
- Advantage / disadvantage toggle, for both sheet rolls and ad-hoc dice.
- Ad-hoc dice roller in the game tools.
- 3D dice via `@3d-dice/dice-box`, visible to everyone, with the roller's token shown on screen.
- d20 crit handling: screen shake + red alarm on a 1, celebration + fireworks on a 20.

⚠️ **Known risk:** `dice-box` loads its physics WASM and dice assets at runtime, which interacts
badly with a non-root `base` path. Budget time to configure its asset path against
`/coffee-code-n-kobolds/`. This will not "just work".

**Acceptance:** a player clicks a saving throw; everyone sees the same 3D dice roll and the same
result lands in the feed. Rolling a 1 and a 20 each trigger their effect on every screen.

### 🎲 This is the first playable session

With Milestones 1–4 you can run a real game: a map with tokens, character sheets that roll, shared
dice, and a feed. The DM works around the missing tooling manually. **Consider actually playing here
before building more** — a session will tell you what's genuinely missing faster than guessing.

---

## Milestone 5 — DM tooling

- DM panel, tabbed: all player sheets, all NPC sheets, token list, modal image library, music.
- DM can click any sheet item to roll on a player's behalf.
- Scene switching — changes the visible board for everyone in the game.
- Layer toggle, and moving tokens/images between layers (bringing enemy NPCs in from the DM layer).
- DM can move any token on any layer, including player tokens.
- Modal image pop-up: DM opens an image for the whole group, and closes it for everyone.

**Acceptance:** the DM switches scenes and every client follows. The DM drags an NPC from the DM
layer to the player layer and it appears for players at that moment — not before.

---

## Milestone 6 — Tools and polish

- Ruler tool, measuring in squares (1 square = 5 feet).
- Multi-colour marker + eraser on the board. **DM only** — players must not have this.
- Background music player, synced play state across the group.
- Initiative tracker.

**Acceptance:** the DM measures a distance and draws on the map; players see both. A player has no
marker tool available.

---

## Milestone 7 — Game editor and admin

- Libraries: maps/boards, modal images, tokens, NPC sheets, music.
- Uploads for all of the above.
- **Downscale images on upload.** The Convex free tier gives 1 GB of file storage total, and music
  is the thing most likely to eat it. See [ADR 0001](adr/0001-platform-and-hosting.md).
- Admin view: delete old games. Small, because there are no user accounts to manage
  ([ADR 0002](adr/0002-defer-user-accounts.md)).

**Acceptance:** upload a 4 MB map photo and confirm what actually lands in Convex storage is
substantially smaller.

---

## Deliberately not planned

- **User accounts.** [ADR 0002](adr/0002-defer-user-accounts.md). If added later, it supersedes that
  ADR rather than editing it.
- **Mobile layouts, SSR, SEO.** Desktop browsers only.
- **Anything in the excluded rules list** in [requirements.md](requirements.md).

## Open questions

- How much of the D&D Lite spell and feat lists to hard-code versus make editable. Hard-coding is
  faster; editable avoids a code change every time you want a new spell.
- Whether NPC sheets need the full character schema or a reduced one. Reduced is less work but means
  two shapes to maintain. Milestone 1's `characters` table holds only `gameId` and `name`, so nothing
  built so far constrains the answer.
- Whether the initiative tracker belongs in Milestone 4 rather than 6 — a real session will answer
  this.
