# 8. One shell instead of floating panels, and what a sheet entry is

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

This milestone was inserted after the first look at the deployed app, and it does two apparently
unrelated jobs. They belong together because they share one cause: **the next milestone is the
dice**, and both of these are cheap to settle before it and expensive to retrofit afterwards.

The screen was a map capped at `max-w-4xl` with three panels floating over it — the DM's tools top
right, the character sheet's trigger top left, the zoom bar bottom left — each with its own open
state and its own `pointer-events` discipline for not swallowing a click meant for the canvas. The
game feed has to go somewhere. Add it as a fourth overlay and the layout change moves it again a
milestone later.

The sheet entry was a bigger problem and a quieter one. `SheetEntry` carried one
`roll: string | null`, so a greatsword's to-hit lived inside its `text` as the sentence *"Roll 1d20
plus Strength and proficiency to hit"* — prose, in 763 places, in a field nothing parses. And
nothing on an entry distinguished *casts Cure Wounds* from *attacks with their Greatsword* from
*uses Divine Smite*, which is exactly the sentence the roll announcement has to produce. An
evaluator landing against that shape would learn a model where every clickable line rolls once.

`SheetEntry` is also the type [ADR 0005](0005-character-sheets-and-hit-point-secrecy.md) was
careful about: one shape shared by a hero's feats, a hero's spells and a monster's actions, which is
the saving that stopped two sheet variants becoming two of everything. Widening it is spending that
saving, so it needs recording.

## Decision

### A category describes the rolling, not the fiction

`SheetEntry` gains `category: 'weapon' | 'action' | 'passive'` and, on a weapon, a second roll.

- **`weapon`** — two rolls: a to-hit and then a damage. This is the shape `roll: string | null`
  could not express, and the only reason `toHit` exists.
- **`action`** — one roll. Divine Smite, Cure Wounds, a dragon's breath.
- **`passive`** — no roll. Lay on Hands, Rage, a race trait.

**The categories are about the roll and not about what the thing is**, and the spells are what
force that. Fire Bolt is a `weapon` because you have to land it before it burns anything; Fireball
is an `action` because it simply goes off; Shield is a `passive` because you declare it and it is
up. Sorting by what a thing *is* would put all twenty-four spells in one bucket and tell the roll
path nothing. The announcement wording next milestone reads the category *and* the spell level, so
a spell still announces as a spell whichever category it is in.

`roll` keeps meaning the damage or the effect, unchanged, and `toHit` is the new field. Renaming
`roll` would have been a rewrite of every entry in three corpora to say the same thing.

### The default is derived, because the alternative breaks the sheets that already exist

Both fields are `v.optional`, because `characters.sheet` already holds entries without them and a
required field on a populated table fails the schema push — the fourth time this project has met
that, after `games.status`, `skillProficiencies`/`speed`, and the NPC sheet's five. So they are read
through one accessor each, `categoryOf` and `toHitOf`, exactly as those were.

What is new is that **`categoryOf`'s default is derived rather than constant**:
`roll === null ? 'passive' : 'action'`.

That is not a convenience. An entry written before this milestone already records the one fact the
category turns on — whether it rolls anything — so the derivation restates a stored fact rather than
inventing one. And it is the only default under which every entry that already exists satisfies the
coherence rules below. A constant breaks half the legacy corpus whichever constant it is: `'action'`
makes Rage, Action Surge and Lay on Hands into things that announce "uses" and roll nothing, and
makes every sheet holding one **unsaveable on its next edit** — a failure that would first appear
to a DM mid-session. `'passive'` makes Fireball unclickable.

**`weapon` can never be a default.** It is the only category that asserts a second field exists, so
defaulting to it would promise a `toHit` no legacy entry has, and every consumer would have to
re-check — at which point the category has stopped being a discriminator and become a hint. It
cannot be derived even in principle: nothing distinguishes a greatsword's `1d8+STR` from Cure
Wounds' `2d8+WIS`, so a guess would announce a heal as an attack.

### Exact arity is validation, not content

`entriesProblem` refuses a weapon with no to-hit, a to-hit on anything that is not a weapon, a
weapon or action with no roll, and a passive that carries one.

The tempting precedent points the other way: `MAX_SHEET_ENTRIES` stays at forty in the schema while
*"at most three attacks"* lives in the bestiary's own test, because a cap describes what makes a
library entry fast to run at the table and a DM building a five-action boss is not doing anything
wrong. This is not a cap. A passive carrying a roll is a value the roll path will never read, and a
weapon with no to-hit is a category lying about its shape to the one function that switches on it —
two stored fields contradicting each other, which is what `storedSheetProblem` already refuses for
an archetype below level 2.

A to-hit is additionally required to be a **d20** roll, which the shared grammar does not say. That
was found by the test agent as a contract stated in a doc comment and enforced nowhere: `2d6+STR`
passed, and the dice work would have thrown two d6 at an armour class. Two d20s are refused as well,
because advantage is a toggle at the moment of rolling and not a second die written permanently into
somebody's content.

### The category is required on content and optional in the database, and that asymmetry did the work

`ContentEntry` — declared in `lib/sheet.ts` so `lib/races.ts` can take it without either corpus
guard objecting — is `SheetEntry` with the category *answered*. `CatalogueEntry` and `LibraryEntry`
both derive from it.

This is the single highest-value line in the change. The stored field must be optional; content has
no history, so making it required turned "recategorise every entry in three corpora" from a job
somebody has to remember into a list `npm run lint` prints. It printed 763 of them, one per entry,
and the work was finished when the list was empty. `toHit` stays optional on content, because six
hundred literals saying `toHit: undefined` is noise and every entry in all three corpora already
goes through `entriesProblem` in an existing test loop.

### The bestiary derives both fields and composes the to-hit from the one attack bonus

**None of the 129 bestiary entries was edited.** The corpus already separates `attacks` from
`abilities`, which is the distinction the category makes first-class: an attack is a `weapon`, an
ability with a roll is an `action`, one without is a `passive`. That is read off the structure in
`resolve.ts` rather than declared on 159 hand-written attacks — which would have been 159 edits and
159 chances to disagree.

The to-hit is composed from the creature's single `attackBonus` through `toHitFromBonus`.
[ADR 0007](0007-monster-bestiary-and-cr-scaling.md) decided there is one attack bonus per creature
and never one per attack, precisely to avoid widening this type, and left a clause inviting a
revisit "if the dice work wants a to-hit roll badly enough". This is that revisit, and **the answer
keeps the decision rather than reversing it**: there is still exactly one attack bonus per creature,
and this is that bonus spelled as a roll. Nothing is stored per attack, so there is still nowhere
for a claw and a bite to disagree — and a CR shift moves every weapon's to-hit because it moves the
one number they are all built from.

⚠️ **The composition happens after the DM's overrides are merged, and that ordering is the whole
of it.** `resolveBestiary` used to build the actions and *then* call `withCreatureOverrides`, which
patches `attackBonus` and leaves `actions` alone. Composing in the original order produces a
creature whose sheet reads `attackBonus 12` and whose every weapon rolls `1d20+4` — the "two
spellings of one number" ADR 0007 went out of its way not to create, arriving through the back door,
and invisible on screen because both readings come from the same payload. Found by an adversarial
read of the plan before any code was written; now asserted in the corpus test and in
`board-smoke.mjs` against a real deployment.

### One shell: panes, not overlays

The floating panels become a header bar, a left pane holding the map, a divider, and a right pane of
tabs — Feed, Character, Table, DM tools, Settings. `MapSetupOverlay`'s three tabs moved into DM
tools wholesale; `Lobby` was split three ways and deleted, because a lobby is no longer a *screen*
you leave but a state in which the left pane has no map yet.

Two things fall out that are worth naming as gains rather than side effects. **DM elevation and
recovery are reachable during a running game**, which they were not: `DmBar` was mounted only by the
lobby, so a DM whose browser lost its code mid-campaign had no way back in. And **a player can claim
a character at any time**, because the character list is a tab that is always present — which
deleted `ClaimCharacterPrompt`, a component that existed only because the board used to replace the
lobby.

**The non-scrolling shell is the game route's own property**, declared on its own root element with
`h-dvh`. There is deliberately no change to `index.css` or `main.tsx`: a global `body { overflow:
hidden }` would break the home screen and the pre-seat states, which are supposed to scroll. One
route wanting to be exactly one screen tall is not a reason to make every route unable to grow.

### A pane width is a view, so it is stored the way the camera is

The divider's position is remembered per game in local storage, through `lib/session.ts`, with the
same debounce-and-flush the camera uses. [ADR 0004](0004-board-authorisation-and-layers.md)
established that the camera is a view rather than shared state and therefore costs no database
traffic; a pane width is the same kind of fact and gets the same treatment. No schema change, no
mutation, nothing to subscribe to.

The divider is hand-rolled rather than `react-resizable-panels`, and the deciding reason is
storage: that library persists through its own `autoSaveId`, writing a key we do not name in a
format we do not control, read by code that does not wrap `localStorage` in the try/catch
`lib/session.ts` exists for. It also expresses sizes as percentages when the binding constraint is
576 pixels of ability grid. Below about 1056 px both minimums cannot be met and **the sheet wins**:
a cramped map is a cramped map, but a Save button below the fold is the failure the pinned footer
exists to prevent.

### Profile icons are a pure function of the seat's name key

`TokenCoin` already drew a tinted coin with initials for a token with no art, so `initialsOf` and
`readableInk` moved to `src/lib/avatar.ts` — the `lib/health.ts` of identity, shared by the Konva
renderer and the HTML one — and gained a hash from the display name to one of sixteen fixed tints.

Keyed on `nameKeyFor(displayName)` rather than the display name, because `Mike`, `mike` and ` Mike `
are one seat server-side ([ADR 0003](0003-player-identity-without-accounts.md)) and must therefore
be one disc. A fixed palette rather than a hue computed from the hash, because perceived hue is not
uniform: everything from 45° to 160° reads "greenish", so a hash collides *perceptually* far more
often than one-in-360 suggests, and the colliding pair is the pair nobody can tell apart at forty
pixels.

**Collision-freedom is not claimed.** Sixteen tints and six seats is about a 66% chance that some
pair shares a colour. Deduplicating within a game would fix that and is rejected, because the header
knows one name and the feed lines will know one name, so a tint that depends on who else is in the
game is a tint that changes when somebody leaves. **Determinism from the name alone beats
collision-freedom**, and determinism is what the acceptance criterion actually asked for — the same
colour on every screen. The identity is the pair (tint, initials), with the person's name in the
tooltip as the third leg.

Zero bytes against the 1 GB storage ceiling (CLAUDE.md invariant 6), no upload UI, no cropping and
no moderation. Real uploaded pictures belong with the other upload-backed libraries in the
game-editor milestone, where the orphaned-blob sweeper already has to exist.

### The health-bar editor opens on the health bar

Selecting a token to move it is not asking to edit its hit points, and the controls were covering
the squares you were dragging to. The track rectangle of `TokenHealthBar` now listens — one existing
shape made hit-testable, zero new nodes, and only when the caller may edit that token's hit points.

ADR 0005 rejected Konva `+`/`−` controls on every token for three reasons, and this is deliberately
answered against each rather than quietly reversing it. It adds **no** shapes, and the bar already
vanishes below `COIN_DETAIL_MIN_DIAMETER`. It does not compete with the drag gesture, because the
bar sits entirely *above* the circle: what it takes is pan-by-empty-drag over a twelve-pixel strip,
and `cancelBubble` on mousedown stops the press reaching the draggable group. And the handler is one
stable identity for the whole layer, threaded as a primitive token id, so it does not rebuild the
canvas event bindings `TokenCoin` was optimised to stop rebuilding.

Decoupling the editor from selection also closed a live bug: `canEditHp` has no layer clause while
`canMove` requires the player layer, and selection derived through `canMove` — so a hero whose token
the DM had put on the DM layer could not reach their own hit points from the board.

### Skills are alphabetical

Thirteen rows, each annotated `Athletics (STR)`, instead of five ability-headed groups. The grouping
made a reader learn the grouping before they could find a skill; the annotation answers the same
question in place. Sorted at the component — `SKILLS` in `lib/skills.ts` keeps its ability order,
which is deliberate and documented there.

## Consequences

### Good

- **The roll path knows what it is rolling before anything can roll.** A weapon has two targets, an
  action one, a passive none, and the announcement wording is one template per category rather than
  a line of copy per entry.
- **763 content entries were answered by the type checker rather than by memory.** Requiring the
  category on content and not in the database is what made a 763-item job mechanical.
- **The bestiary cost nothing.** Both fields are derived from a distinction the corpus already drew.
- **The feed has a home**, and so does everything else the DM-tooling milestone adds: a tab is a
  cheap thing to add and an overlay is not.
- **Two long-standing gaps closed as a by-product** — DM recovery during a running game, and hit
  points on a DM-layer hero's token.

### Costs and constraints we are accepting

- **`SheetEntry` is wider, and it is still one type.** ADR 0005's saving is spent but not lost: the
  picker, the list and the editor are each still written once, and both sheet variants still share a
  line. The next field will be harder to justify than this one was.
- **The feed and the character sheet share a pane**, so the person who clicks a roll cannot see the
  feed line they created. That is a real cost, paid deliberately, and the floating roll announcement
  in the next milestone is what buys it back — which is why that announcement is not decoration.
- **Two spellings of "none" now exist on one type.** `roll`, `level` and `catalogueKey` say it with
  `null` because they are required; `category` and `toHit` say it with absence because the schema
  push forced them optional. The rule is written down in `lib/sheet.ts` so the third addition does
  not have to rediscover it.
- **One more low-churn subscription is held open**, because the Character tab stays mounted while
  hidden. Without that, switching to the feed for two seconds silently discards a half-edited sheet.
- **Profile icons collide.** Two seats at a table of six will often share a tint. Accepted, for the
  determinism argument above.
- **`games.returnToLobby` keeps a name that no longer describes a screen.** It is an API and its
  meaning is unchanged; only the words a person reads were renamed.

## Two things found by building it, recorded because the reasoning was wrong first

**`forceMount` does not hide anything.** The plan asserted that Radix renders a force-mounted
inactive tab as `<div hidden>`, and that a Tailwind display utility on the same element would
out-specify the user-agent `[hidden]` rule — an elaborate trap that does not exist. Radix computes
`present = forceMount || isSelected` and renders `hidden={!present}`, so with `forceMount` set the
attribute is **never** applied and the panel is simply left on screen. The character sheet rendered
below the feed on every tab. It is now hidden explicitly off the `data-state` Radix does set, which
is the sturdier arrangement anyway.

Worth recording for the general point: this milestone was almost entirely visual, `npm run lint` and
1,082 tests were green, and this was found by opening the app in a browser. That has now been true
of every milestone.

**The 1,300-sheet loops and the local suite could both stay green over a total field discard**,
because both new fields are optional and every entry fixture in the suite is a partial literal. The
repair is assertions about *presence and absence* rather than values, plus `board-smoke.mjs` sending
one entry with neither field, one with both, and asserting each comes back as sent. The positive
control is the load-bearing half: without it the negative passes on a deployment that discarded
everything, which is precisely the failure this script exists to catch.

## Alternatives considered

### A discriminated-union content type — rejected

`ContentEntry` as a three-member union would put the arity rule in the compiler for all 763
literals, which is genuinely tempting. Rejected because `Omit` does not distribute over a union, so
`CatalogueEntry` would need a `DistributiveOmit` helper and stop being readable — and it buys
nothing the tests do not already give, since every entry in all three corpora runs through
`entriesProblem` in loops that already exist.

### Per-attack attack bonuses on the bestiary — rejected, again

The obvious way to give each attack a to-hit. Rejected for the reason ADR 0007 gave and this
milestone re-tested: one number per creature is the reduction that keeps a claw and a bite from
disagreeing, and composing the roll from it costs one function.

### Three flat sections on a hero's sheet — rejected

Dropping the Feats and Spells headings and showing one list split three ways reads closer to the
acceptance wording. Rejected because the editor would then have to decide which underlying list a
newly added entry belongs to, and the two pickers would have to merge. The category nests inside the
existing lists instead, which changed no data and no mutation.

### `react-resizable-panels` — rejected

A tested keyboard implementation, which is the honest thing it would have bought: about fifteen
lines of ARIA are now hand-written. Rejected on storage, on pixels-versus-percentages, and on adding
a dependency to a bundle already near a megabyte for one divider between exactly two panes that
never collapse and never nest.

### Uploaded profile pictures — rejected for now

What people expect. Deferred to the game-editor milestone, with the other upload-backed libraries
and the orphaned-blob sweeper that has to exist before any of them are safe.
