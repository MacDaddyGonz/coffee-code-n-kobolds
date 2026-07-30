# 5. Character sheets, where current hit points live, and two shapes of secret

- **Status:** Accepted
- **Date:** 2026-07-30

## Context

Milestone 3 adds the thing a game is actually played on. Most of it is data modelling and forms and
needs no record. Two parts of it do, because both are decisions that later milestones will sit on
top of and both are easy to get wrong in a way that is invisible until it matters.

The first is secrecy, again, but not the same secrecy.
[ADR 0004](0004-board-authorisation-and-layers.md) settled how a DM-layer *token* is kept off a
player's screen, and was careful to explain why `publicGameValidator` could not do that job: a
validator catches a leaked **field**, and a DM-layer token is a leaked **row** of exactly the same
shape as the hero beside it. Milestone 3's headline requirement — *exact NPC hit points must never
reach a player client* — looks like the same problem and is not. It is the other one.

The second is where current hit points live. CLAUDE.md invariant 2 exists because Convex rewrites a
whole document on every patch, and it is the reason `tokens` and `tokenPositions` are separate
tables. Current hit points change during play and the `characters` table was about to grow into a
full sheet, so the question is obviously in scope. What is less obvious is whether the usual
argument actually carries.

## Decision

### Milestone 3 has one leak of each shape, and they get different guards

Applying one tool to both would leave a hole, so the two are separated explicitly.

**Exact NPC hit points are a leaked field.** A payload carrying them is a payload that legitimately
exists — the party's own hit points travel the same route to the same health bar — and the thing
that must not appear has a name. That is precisely the case a `returns:` validator catches, so
`publicVitalsValidator` in `convex/lib/characters.ts` is a **discriminated union** whose
player-facing variant has no numeric member at all:

```ts
v.union(
  v.object({ kind: v.literal('exact'), characterId, current, max }),
  v.object({ kind: v.literal('band'),  characterId, band }),
)
```

Declared as the `returns:` of `characters.vitals`, this makes the leak *structurally impossible*
rather than merely absent: there is nowhere to put a hit point in the shape a player receives, and a
future edit that tries makes Convex throw at runtime. This is the same mechanical guarantee
`publicGameValidator` gives the DM code, and it needs no test to keep it honest.

**An NPC's sheet is a leaked row.** `Ancient Red Dragon`, armour class 22, with a breath weapon on
it, has exactly the shape of a hero's document. No validator can tell one from the other, so the
guard has to be structural: `convex/lib/characters.ts` is the only module in `convex/` permitted to
read `characters` and `characterVitals`, every read passes through one `maySeeCharacter(character,
isDm)` predicate, and `isDm` comes from `resolveDmAccess` and nothing else.

`leakGuard.test.ts` was generalised from one hard-coded reader to a table of table→reader pairs
rather than copied. There are now two secrets of this shape and there will be a third — fog of war
hides rows the same way — so the guard is stated as a rule instead of as a special case.

### An NPC is an NPC because the document says so

`sheet.kind` is stored, and is never inferred.

The tempting derivation is "a character no seat has claimed is an NPC", which needs no field and is
wrong in both directions. A hero whose player has not joined yet would have their hit points hidden
from their own party; an NPC the DM handed to somebody would have its stat block published to the
table. It is also the precise shape of the bug Milestone 2 shipped and had to correct, where a token
with no character attached was treated as nobody's and therefore everybody's. Control is granted,
never assumed — and so is secrecy.

### Current hit points live in `characterVitals`, and the usual reason is not the reason

The reflex argument is invariant 2: hit points change on every hit, so split them out. That argument
is real here but **weaker than it was for token positions**, and saying so matters more than
reaching the same conclusion. A drag writes ten times a second; a fight changes hit points a few
times a round. Write contention alone would not have justified a table.

The decisive reason is the **shape of the subscription**, not the cost of the write.

The board needs a live hit-point feed for every visible token. Were current HP a field on the
character document, that feed would have to read whole sheets — which for an NPC *is the secret this
milestone exists to keep* — and would re-run every time somebody edited a spell list. In the other
direction, one point of damage would re-push every feat and every spell to everyone with a sheet
panel open. A four-field row makes the health-bar subscription **structurally incapable of carrying
a sheet**, which is the same class of guarantee the token split bought, arrived at from a different
direction.

`maxHp` deliberately **stays on the sheet.** The band a player sees is computed server-side from
current over max, so the maximum never has to leave the server for an NPC. Copying it onto the
vitals row would make two documents authoritative for the one number that decides what a player is
told — the denormalisation ADR 0004 rejected for `layer`, in a new place. `gameId` *is* copied onto
the row and is not the same thing: a character never changes game, so that pointer cannot go stale,
and it buys one bounded read where the alternative is a lookup per character.

### The band is four states, not a percentage

Requirements.md says players "can estimate the percentage, but not the exact numbers". A percentage
does not satisfy that. `82.2%` of a plausible maximum hands `37/45` straight back to anyone willing
to try the small fractions, so a bar that estimates to one decimal place has published the number
the DM was keeping. Rounding to five-point steps narrows the leak without closing it.

Four states — `healthy`, `bloodied`, `critical`, `down` — leak about two bits and still tell the
party the one thing they act on. A creature that is alive is never `down`, even at one hit point out
of nine hundred: `down` is the band that changes what people do, so it means what it says rather
than being where the arithmetic rounded to.

### A player is told about an NPC only when its token is already on their board

The obvious implementation of the vitals query sends a band for every NPC in the game. That
quietly publishes a **count**: a player reading twelve entries knows the DM has twelve monsters
prepared for tonight, which is the same category of spoiler as the scene names ADR 0004 refused to
send.

So `characters.vitals` composes the two choke points rather than re-deciding anything.
`visibleCharacterIds` in `convex/lib/board.ts` answers "whose tokens may this caller see?" and
returns nothing but a set of ids; `visibleVitals` in `convex/lib/characters.ts` projects against it.
Each module still reads only its own tables, and a hidden creature contributes nothing at all — not
a row, not a band, not a number in a length.

Player characters are exact for everybody, which is not an exception to any of this. Requirements.md
asks for `20/45` above a hero's token, and a party knowing its own hit points has never been a
secret in any edition.

### The reduced NPC sheet shares one entry type with the full one

A monster gets armour class, hit points, an initiative bonus and a list of things it does. It gets
no ability scores, no hit dice, no level and no spell list, because filling those in for a goblin is
work with no play in it.

The cost of two shapes is two of everything to maintain, and the thing that keeps that from
happening is that **`SheetEntry` is one type shared by a PC's feats, a PC's spells and an NPC's
actions.** The variants differ in what they hold; they do not differ in what a *line* is. So
Milestone 4 gets one roll path rather than a fork, and the picker, the list and the editor are each
written once.

`initiativeBonus` is stored on the NPC variant precisely because there is no Dexterity score to
derive it from — that is the cost of the reduction, paid in one field. A monster that needs a saving
throw gets an action whose roll is `1d20+3`, which is the escape hatch that stops the reduction
becoming a ceiling.

### The catalogue is content, and a character stores a copy

The roadmap left "hard-code the spell list or make it editable" open. It is both.
`convex/lib/rules.ts` holds a curated D&D Lite catalogue, and a character stores a **copy** of the
entry it picked rather than a reference to it. `catalogueKey` is a breadcrumb, not a foreign key:
nothing joins on it, the copy on a sheet is freely editable, and retiring an entry from the
catalogue leaves every character that already had it working exactly as before.

Roll specs (`1d8+WIS`, `1d20+PROF`) are **validated in shape now and evaluated in Milestone 4**.
That split is deliberate rather than half a feature: a roll string stored unvalidated today is a
migration over every sheet in every game the moment something first tries to parse one. Fixing the
grammar while there is nothing to migrate costs one regular expression.

## Consequences

### Good

- **Exact NPC hit points cannot be leaked by accident**, because the shape a player receives has
  nowhere to put one. That is a stronger guarantee than the DM layer has, and it is available here
  only because this secret happens to be a field.
- **"Does this leak?" is still answered by reading one file** — now two files, each with one
  predicate, each held in place by the same generalised test.
- **A health bar costs a sheet read of nothing.** The board draws hit points without ever touching a
  character document.
- **A player cannot count the monsters**, which is the failure mode that would have survived every
  obvious test of the requirement as written.
- **Milestone 4 has one roll path**, despite two sheet shapes.

### Costs and constraints we are accepting

- **Two documents per character**, and `characters.vitals` joins them to find `maxHp`. The join is
  the price of not having two authorities for the number the band is computed from — the same trade
  ADR 0004 made for `layer`, and made for the same reason.
- **A fourth live query per board client.** `board.tokens`, `board.positions`, `scenes.active` and
  now `characters.vitals`. Each is split from the others because they change at wildly different
  rates; the cost is that the screen assembles from four subscriptions and a health bar appears once
  its own has arrived.
- **A player can read another seat's hero sheet by passing that seat's `playerId`.** Unchanged from
  ADR 0004 and stated again because it will look like a bug to whoever finds it: `playerId` is
  routing, not identity, closing it needs accounts, and [ADR 0002](0002-defer-user-accounts.md) has
  now declined those three times. It is bounded to data the party already shares. **The refusal that
  guards a real secret — the NPC sheet — keys off the DM code alone and gets no such latitude.**
- **A player cannot read a hero's sheet before claiming it**, which makes choosing between two
  unclaimed characters a matter of asking the DM. The alternative was a second visibility rule for
  unclaimed player characters, and one rule that is occasionally inconvenient beat two rules that
  interact.
- **The band cannot be updated optimistically.** A player clicking nothing cannot move it, and the
  DM's own click updates their exact view instantly while the players' bands follow a round trip
  later. Guessing which band a new value falls in would mean the client inventing the maximum the
  server declined to send.
- **Renaming a player character is still ungated while editing its sheet is not**, which is an
  asymmetry a reader will trip over. It is deliberate: a character's name is already printed on its
  coin on every screen in the game, and its sheet is not. Renaming an *NPC* is refused like every
  other read or write of one.
- **The catalogue will drift from the sheet grammar unless a test holds them together**, which is
  why `rules.test.ts` validates every catalogue roll against `isValidRoll` itself rather than
  against a copy of the pattern.

## Alternatives considered

### A percentage instead of four bands — rejected

The obvious reading of "estimate the percentage". Rejected because it does not actually withhold the
number: with a guessable maximum, a percentage to any useful precision is the exact hit points in
disguise. Bucketing to five-point steps was considered as a middle way and dropped for being a
half-measure — narrower, still invertible, and no more useful at the table than four words.

### Current hit points on the character document — rejected

Fewer tables, one fewer subscription, and it would have been defensible on write cost alone. Rejected
because the board's health-bar query would then have to read sheet documents to draw a bar, which
puts the NPC secret on the hot path of the most-subscribed query in the application, and because
every point of damage would re-push a spell list to every open panel.

### `maxHp` copied onto the vitals row — rejected

It removes the join: the vitals query could compute the band without loading a sheet. Rejected for
exactly the reason ADR 0004 rejected denormalising `layer` — it creates two documents authoritative
for the field that decides what a player is told, and the bug that leaks is a maximum lowered on the
sheet whose stale copy still makes a dying creature read as healthy.

### A table-level union on `characters` — rejected

The tidier way to express two sheet shapes, and it is what a fresh schema would use. Rejected
because the table has held rows since Milestone 1 and those rows match neither member, so the push
fails. Recovering costs a widen–migrate–narrow across two deploys to save one `??`. The optional
field read through one accessor is the treatment `games.status` already gets, for the same reason.

### Deriving NPC-ness from "nobody has claimed it" — rejected

No field, no form control, and wrong in both directions. Covered above; recorded here because it is
the design that suggests itself first and the second time this project has been offered it.

### A full character schema for NPCs — rejected

One shape to maintain instead of two, and the roadmap's open question named it as the alternative.
Rejected because the work lands on the DM at the table: a goblin does not have a class, a level, six
ability scores or a spell list, and asking for them turns adding a monster mid-session into a form.
The cost of the reduction is contained by sharing `SheetEntry` across both variants, which is where
the duplication would otherwise have been.

### Konva `+`/`−` controls on every token — rejected

The literal reading of "health bars have +/- controls". Rejected because it puts two hit targets on
every coin on a crowded map, competes with the drag gesture that has to keep working, and rebuilds
canvas event bindings that `TokenCoin` was carefully optimised to stop rebuilding. The controls are
HTML, positioned over the canvas at the selected token, which also makes them keyboard-reachable for
free.
