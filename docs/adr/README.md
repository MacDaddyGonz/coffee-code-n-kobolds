# Architecture Decision Records

Short records of significant technical decisions: what was chosen, why, and what it costs.

These are **not edited after the fact.** If a decision is reversed, add a new record that supersedes
the old one and mark the old one's status — the point is that the reasoning trail survives instead of
being overwritten.

⚠️ **One exception, and it is narrow: a superseded *requirement* gets struck through in place.** The
rule above protects the *reasoning*; it was never meant to leave a live instruction sitting in a
document that says "do this" when the project has since decided otherwise. So when a decision is
reversed, the sentence that tells somebody what to build is wrapped in `~~strikethrough~~`, prefixed
with 🚫 and a pointer to what replaced it, and **left in place** — never deleted. Both halves matter:
crossing it out is what stops the next reader implementing a rule that no longer holds, and keeping
the text is what stops the reversal erasing the argument. The status line at the top of the record
says which parts went, and a *What was superseded, and what was not* section says it in a table.

This exists because an ADR is the closest thing this project has to a specification, and a
contradicted specification is worse than none — a reader who finds two answers picks the wrong one
about half the time and has no way to know which.

| # | Decision | Status |
| - | -------- | ------ |
| [0001](0001-platform-and-hosting.md) | Convex backend, Vite SPA on GitHub Pages | Accepted — dice library superseded by [0011](0011-announcing-a-roll-rather-than-adjudicating-one.md) |
| [0002](0002-defer-user-accounts.md) | Defer user accounts; characters belong to the game | Accepted |
| [0003](0003-player-identity-without-accounts.md) | Player identity without accounts: a seat is a name | Accepted |
| [0004](0004-board-authorisation-and-layers.md) | Board authorisation, layers and where a token's position lives | Accepted |
| [0005](0005-character-sheets-and-hit-point-secrecy.md) | Character sheets, where current hit points live, and two shapes of secret | Accepted |
| [0006](0006-premade-character-library.md) | A premade character library, and resolving a sheet from stored selections | Accepted |
| [0007](0007-monster-bestiary-and-cr-scaling.md) | A monster bestiary, and scaling a creature to a challenge rating | Accepted |
| [0008](0008-one-shell-and-what-a-sheet-entry-is.md) | One shell instead of floating panels, and what a sheet entry is | Accepted |
| [0009](0009-who-plays-what-and-what-control-grants.md) | Who plays what, and what control grants | Accepted |
| [0010](0010-the-way-in-and-the-dms-coins.md) | The way in, and the DM's coins | Accepted |
| [0011](0011-announcing-a-roll-rather-than-adjudicating-one.md) | Announcing a roll rather than adjudicating one | Accepted — 🚫 decisions **1** (no spell slots) and **4** (no per-key counts, no short rest) superseded by the character-resources milestone; decisions 2, 3, 5 and the rest of the record stand |
| [0012](0012-three-layers-and-a-fog-that-is-honest-about-itself.md) | Three layers, and a fog that is honest about itself | Accepted |
| [0013](0013-a-coin-you-can-copy-place-and-label.md) | A coin you can copy, place and label | Accepted |
| [0014](0014-what-a-coin-says-about-itself.md) | What a coin says about itself | Accepted — ⚠️ publishes a creature's armour class, which [0005](0005-character-sheets-and-hit-point-secrecy.md) had used as its worked example of the row-shaped secret |
