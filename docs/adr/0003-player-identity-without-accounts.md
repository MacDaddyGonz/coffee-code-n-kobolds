# 3. Player identity without accounts: a seat is a name

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

[ADR 0002](0002-defer-user-accounts.md) removed user accounts and put characters inside the game
document. It also said browser local storage is a convenience with no data hanging off it. Both of
those are still right, and together they leave a question that had to be answered before the join
flow could be built: **with no accounts and nothing durable in storage, how is a player recognised
when they come back?**

The usage pattern from [ADR 0001](0001-platform-and-hosting.md) is the constraint. A few sessions a
year, months apart, means a cleared cache *between* sessions is likely rather than hypothetical —
new laptop, browser reinstall, privacy sweep, or simply a different browser. Whatever identity we
choose has to survive that, because the thing on the other end of it is a character sheet somebody
spent an evening filling in.

Two shapes were available. A client-generated id, stored in the browser and used as the player's
identity server-side — which is a session token by another name, and puts the character behind
exactly the storage ADR 0002 said nothing may depend on. Or identity by something the player can
reproduce from memory.

## Decision

**A player is a seat at the table, and the seat is identified by the display name.**

`players` rows are keyed within one game by `nameKey` — the display name trimmed,
whitespace-collapsed, truncated to 40 characters and lowercased. `players.join` is idempotent on
that key: if a seat with that key exists in that game it is returned, otherwise it is created. So
`Mike`, `mike` and ` Mike ` are all the same person walking back in.

The consequence that matters is that **"restore my session" and "join for the first time" are one
code path.** There is no session token, no server-side session record, and no client-generated id
stored on the server. A browser that has lost everything rejoins by retyping a name, and its
character claim is still attached to the seat it lands on.

### What browser storage holds

Only four things, and every one of them is recomputable by typing — the first three from memory, the
fourth by way of the recovery phrase below:

| Key | Purpose |
| --- | ------- |
| `ccnk.lastDisplayName` | Prefill for the name field on the home screen |
| `ccnk.lastGameCode` | Prefill for the join code field |
| `ccnk.displayName.<code>` | Which seat this browser is, in one game |
| `ccnk.dmCode.<code>` | The DM's bearer credential for one game |

The per-game display name is deliberate rather than one global name. A single global name would
bleed the name used in one game into another and silently create a second seat there — you would
arrive in a friend's game already seated as someone who has never played in it. The last-used name
is kept separately, as a prefill only, which is the right role for a global value.

Storage access is wrapped rather than used directly, because `localStorage` throws outright when the
browser has it disabled. A lobby that fails to render because of a browser preference is a worse bug
than a name field that forgets.

### The claim pointer runs one way

The link between a seat and a character is `players.characterId`. It is **never** a `playerId` on
the character. That direction is the mechanical guarantee behind ADR 0002's promise that nothing
breaks when storage is cleared: **deleting every seat in a game leaves the characters intact and
reclaimable.** `players.leave` deletes a seat and touches nothing else. A character is only ever
destroyed by an explicit, DM-gated `characters.remove`.

There is a secondary reason the claim lives on the seat. Convex rewrites a whole document on patch,
and Milestone 3 grows `characters` into the full D&D Lite sheet — six stats, saving throws, feats,
spells. Claiming and releasing a character should not rewrite a large document, and a seat is small
and stays small. This is the same reasoning as CLAUDE.md invariant 2, applied to a much lower-churn
field.

## The DM role

ADR 0002 left this as "the DM role needs *some* marker". The marker is a **bearer credential**: an
8-character DM code generated when the game is created, shown to the creator, cached in their
browser, and **re-verified server-side on every DM-only call** by `requireDm`.

Two things in the data model look like they could authorise something and must never be used that
way:

- **`players.isDm` is a display flag.** It drives a badge in the roster. Exactly one seat carries
  it, moved by `moveDmBadgeTo` after a successful code check, purely so the roster is honest about
  who is running the game.
- **`playerId` in a mutation's arguments is a routing argument.** It says *which seat to act on*,
  not *who is calling*. Anyone can pass any seat's id; `getSeatInGame` only checks that the id
  belongs to the game the caller named, which stops a stray id from another game being patched and
  nothing more.

**Stated as a rule for every milestone after this one: the DM code is the only thing in this
application that authorises anything.** This matters concretely and immediately. Milestone 2 has to
filter DM-layer map data *inside* the Convex query (CLAUDE.md invariant 1), and the tempting way to
write that filter is `if (player.isDm)`. That would defeat the invariant entirely — `isDm` is a
boolean on a document anyone can find, reached through a `playerId` anyone can pass, so the check
would amount to a player asking to be trusted. The filter must key off a verified DM code.

`publicGameValidator` exists to make the leak guard mechanical rather than a matter of vigilance:
it is the only shape a public query may return a game in, and `dmCode`, `dmRecoverySalt` and
`dmRecoveryHash` are absent from it by construction, so Convex throws at runtime if one is ever
added to a projection by accident.

### Where the line sits

DM-gated: `characters.assign` (force a character onto a seat, taking it from whoever held it),
`characters.remove` (delete a character), `games.rename`, `games.setRecoveryPhrase`, and
`games.elevateDm` / `games.recoverDmCode`, which hand back the code itself.

The principle: **the DM code gates forcing, destroying, and anything that reveals the DM code.**

Seat operations — `join`, `rename`, `leave` — and the ordinary `characters.claim` / `release` are
not gated. A seat is identified by a display name that anyone holding the join code can type, so
gating operations on seats would be theatre: it would inconvenience the DM without stopping anybody.
`claim` refuses a character another seat already holds, which is contention handling rather than
authorisation; `assign` is the same operation with the force to take it away, which is why *that*
one needs the code.

## Recovery

The DM code lives in one browser's local storage. Across a quarterly cadence that browser will
sometimes be gone, so there is an in-app way back.

At creation the DM sets a **recovery phrase**. The game stores a per-game random 16-byte salt and a
SHA-256 of `salt:phrase` — never the phrase itself. `games.recoverDmCode` takes the join code plus
the phrase, and on a match returns the DM code and moves the badge to the calling seat.
`setRecoveryPhrase` rotates the salt as well as the hash, so the new stored value cannot be compared
against the old one.

Two things to be honest about:

- **This creates a second secret of equal power.** Anything that can be exchanged for the DM code
  *is* the DM code. The recovery phrase does not add a layer of security; it adds a second door of
  the same width. That is the price of an in-app recovery path, and the alternative was worse in
  practice: looking the code up in the Convex dashboard, which means the answer to "I've lost DM
  access mid-session" is "wait while I log into a database console".
- **There is deliberately no failed-attempt lockout.** A lockout would let anyone holding the join
  code lock the real DM out of their own game by guessing wrong a few times — a denial of service
  against the one person who cannot be replaced, triggered by the credential everybody at the table
  already has. That is a worse failure than brute force against a phrase nobody can enumerate,
  guessed against an endpoint that also needs a valid join code. Comparisons are still done with a
  length-independent compare, which is cheap insurance rather than a meaningful defence at this
  threat model.

## Consequences

### Good

- **A cleared cache costs a retyped name.** Nothing else. The character claim, the seat and the
  game are all still there. This is ADR 0002's central promise made mechanical rather than
  aspirational.
- **Characters are portable across devices and browsers**, because they were never tied to one. The
  same name typed on a different laptop lands on the same seat.
- **No session infrastructure at all** — no tokens, no expiry, no refresh, no server-side session
  table, and nothing to debug when it goes stale after four months of dormancy.
- **DM lockout is recoverable in-app**, without a database console.
- The name gate can list the seats already in the game before anyone commits to a name, because the
  roster is not privileged. Someone returning after a cache clear picks their existing seat rather
  than reconstructing it from memory.

### Costs and constraints we are accepting

- **Two people who choose the same display name share one seat**, and therefore contend for one
  character claim. With no identity there is nothing to distinguish them by, so this is not solved —
  it is not detectable. The mitigation is visibility: the name gate shows the roster before you
  commit, so a name already in use is on screen when you pick.
- **Anyone with the join code can take any seat by typing its name, including the DM's.** ADR 0002
  already accepted this; identity-by-name makes it concrete rather than theoretical. They do not
  get DM powers — those need the code — but they can sit in the DM's chair in the roster and take
  the character it had claimed.
- **A player who renames changes their own identity key.** `players.rename` rewrites `nameKey`, so
  the browser must store the new name or the next visit creates a fresh, empty seat. The rename path
  handles this; anything else that changes a display name must too.
- **Display names are truncated to 40 characters**, so two names differing only past that point
  collapse onto one seat. Not a realistic problem, but it is a real property of the key.
- **A stray seat is easy to create and only tidied by hand.** Typing a name that differs from last
  session leaves a duplicate in the roster holding no character. `players.leave` is ungated
  precisely so anyone can clear one up.

### If we add accounts later

Seats gain an optional owning-user field, and the name key becomes the fallback for seats without
one — existing games keep working, because a seat with no owner behaves exactly as it does today.
Game codes stay as the join mechanism either way.

That change would supersede **both this ADR and ADR 0002**, and should be recorded as a new record
rather than by editing either of them.
