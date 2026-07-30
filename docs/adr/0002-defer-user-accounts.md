# 2. Defer user accounts; characters belong to the game

- **Status:** Accepted
- **Date:** 2026-07-29

## Context

[docs/requirements.md](../requirements.md) specifies that users create an account with an email
address, and that characters belong to users. That is the right shape for a real multi-user product.

It is not the right shape for the actual situation: two people, one of whom is the site owner,
playing a few times a year. Full account infrastructure — sign-up, email delivery, session
handling, password or magic-link flows, a user management surface — is a meaningful slice of work
that stands between us and a playable game, and it protects nothing that needs protecting when the
entire user base sits in the same office.

Convex Auth was the natural candidate if we did want accounts, but it is still beta, ships no UI
components, and has no user management dashboard. Clerk's free tier would cover it properly at the
cost of a third service to configure.

## Decision

**No user accounts in v1.** A player joins a game with a game code and a display name, then picks
which character in that game they are playing.

**Characters are stored inside the game document, not against a player identity.** The DM can
reassign any character to any player at any time.

Browser local storage remembers your last display name and character selection as a convenience
only. No data hangs off it.

## Consequences

### Good

- Removes the largest non-game feature from the v1 build. Sign-up, email sending and session
  management all disappear.
- **Nothing breaks when browser storage is cleared.** This is the real reason for putting characters
  in the game document rather than keying them to a local player ID. Across a quarterly play
  cadence, a cleared cache between sessions is likely rather than hypothetical, and it would
  otherwise orphan a character permanently.
- Characters are implicitly portable between devices and browsers, because they were never tied to
  one.
- The **admin dashboard** requirement shrinks to a "delete old games" screen, which the game editor
  covers anyway.

### Costs and constraints we are accepting

- **Anyone holding a game code can join as any character**, including the DM's own. Acceptable with
  two known players; not acceptable if this were ever shared more widely.
- **No per-user data ownership**, so no "my characters" library spanning games. A character exists
  in the game it was made in. Reusing one across campaigns means copying it.
- **This deviates from the captured requirements.** Deliberate, not an oversight.
- The DM role needs *some* marker. Simplest workable version: whoever created the game holds the DM
  role, tracked on the game document and recoverable via a DM code shown at creation.

### If we add accounts later

Convex Auth or Clerk bolts on without restructuring the app. The migration is small but real:
characters gain an optional owning-user field while continuing to live under the game, so existing
games keep working unchanged. Game codes stay as the join mechanism either way.

That change should be recorded as a new ADR superseding this one.

## Revisited after Milestone 2's first session — the decision stands

Playing the board for the first time put the question properly: players could move any token that had
no character attached, so was the best-quality fix to build real identity after all? No. "A player may
only move their own token" is two goals sharing one sentence. Correct behaviour **at the table** is
delivered completely by a server-side refusal, which the board now has; correct behaviour **against
an adversary** needs to know who is calling, and that is the only one accounts would buy. The players
are a handful of colleagues, so the second goal is not wanted, and declining accounts is therefore the
higher-quality answer rather than the cheaper one — quality includes not carrying sign-up, sessions
and a user-management surface that this table has no use for.

The trigger that reverses it is an audience, not a feature: **the game being played with people
outside the trusted group.** Full reasoning, and what the board's refusal does and does not
guarantee, is in [ADR 0004](0004-board-authorisation-and-layers.md).
