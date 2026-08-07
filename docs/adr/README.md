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
| [0005](0005-character-sheets-and-hit-point-secrecy.md) | Character sheets, where current hit points live, and two shapes of secret | Accepted — one **content** claim (the reduced NPC sheet carrying no ability scores) superseded by [0016](0016-the-5e-2024-conversion.md); both leak shapes and both guards stand |
| [0006](0006-premade-character-library.md) | A premade character library, and resolving a sheet from stored selections | Accepted — its **numbers and content** superseded by [0016](0016-the-5e-2024-conversion.md); the stored link, the override diff and the resolution order stand |
| [0007](0007-monster-bestiary-and-cr-scaling.md) | A monster bestiary, and scaling a creature to a challenge rating | Accepted — its **numbers and content** superseded by [0016](0016-the-5e-2024-conversion.md); the scaler, the ratio/delta split and offset preservation stand |
| [0008](0008-one-shell-and-what-a-sheet-entry-is.md) | One shell instead of floating panels, and what a sheet entry is | Accepted |
| [0009](0009-who-plays-what-and-what-control-grants.md) | Who plays what, and what control grants | Accepted |
| [0010](0010-the-way-in-and-the-dms-coins.md) | The way in, and the DM's coins | Accepted |
| [0011](0011-announcing-a-roll-rather-than-adjudicating-one.md) | Announcing a roll rather than adjudicating one | Accepted — 🚫 decisions **1** (no spell slots), **2** (no spell save DC for a hero) and **4** (no per-key counts, no short rest) superseded by [0016](0016-the-5e-2024-conversion.md); decisions 3 and 5 and the rest of the record stand. ⚠️ That record's own status line points forward at "ADR 0015" for the reasoning — **that number went to the fog milestone; 0016 is the record** |
| [0012](0012-three-layers-and-a-fog-that-is-honest-about-itself.md) | Three layers, and a fog that is honest about itself | Accepted |
| [0013](0013-a-coin-you-can-copy-place-and-label.md) | A coin you can copy, place and label | Accepted |
| [0014](0014-what-a-coin-says-about-itself.md) | What a coin says about itself | Accepted — ⚠️ publishes a creature's armour class, which [0005](0005-character-sheets-and-hit-point-secrecy.md) had used as its worked example of the row-shaped secret |
| [0015](0015-a-map-that-starts-covered.md) | A map that starts covered | Accepted — ⚠️ inverts two sentences [0012](0012-three-layers-and-a-fog-that-is-honest-about-itself.md) states as rules: which fog act owes a reveal stamp, and which direction the non-finite containment test fails in |
| [0016](0016-the-5e-2024-conversion.md) | The 5e 2024 conversion | Accepted — ⚠️ replaces D&D Lite with **SRD 5.2.1 at levels 1–5**, and supersedes parts of [0005](0005-character-sheets-and-hit-point-secrecy.md), [0006](0006-premade-character-library.md), [0007](0007-monster-bestiary-and-cr-scaling.md) and [0011](0011-announcing-a-roll-rather-than-adjudicating-one.md). **Numbers and content, not machinery** — its supersedes table says which is which, per record |
