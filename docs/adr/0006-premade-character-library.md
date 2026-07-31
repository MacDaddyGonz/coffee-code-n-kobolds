# 6. A premade character library, and resolving a sheet from stored selections

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

Milestone 3 built a character sheet you fill in. It works, and for this audience it is the wrong
shape of thing: before a character existed, somebody had to know 5e well enough to allocate six
ability scores, decide which two saving throws a class is proficient in, and choose a spell list.
The people this is for are beginners and children. A blank form is where a session stalls before it
starts, and "ask the DM to build it for you" turns one person's evening into eight character sheets.

So Milestone 4 makes a character something you **choose**: a race, a class, an archetype at level 2,
and a level the DM sets. Everything else comes out of a library of 72 premade sheets — eight classes
at level 1, then two archetypes each across levels 2 to 5.

Three questions fall out of that, and each of them is easy to answer in a way that is expensive
later.

The first is **where the numbers live**. A premade sheet can be copied onto the character when it is
created, or looked up every time the character is read. That single choice decides what awarding a
level costs, whether a correction to the library ever reaches a character that already exists, and
whether a DM's edit and a library's numbers can still be told apart afterwards.

The second is **what it does to the rules subset**. [requirements.md](../requirements.md) excludes
racial abilities and skills, and a library of real character sheets cannot be written without both.
That file is the thing that catches the code being wrong, so it cannot simply be edited to agree
with the code.

The third is **the bundle**. [ADR 0001](0001-platform-and-hosting.md) put this on GitHub Pages as a
static SPA; the built bundle is already around 964 KB, and the library is roughly 350 KB of source
that no browser has any need to read.

## Decision

### The exclusions are lifted in the spec, not merely in the code

Two entries on requirements.md's excluded list are now false, and one entry on its included list is
now only a default. The record of that is an **amendment section in requirements.md itself**, which
leaves the original lists untouched and states underneath them what changed, when, and pointing
here. Rewriting the lists in place would have been tidier and would have destroyed the only thing
the file is for: a specification quietly edited to match its implementation can no longer catch the
implementation being wrong.

Precisely what moved:

- **Racial abilities are in.** Eight races, one trait each, five of which change no number.
- **Skills are in; backgrounds are not.** Thirteen skills with a proficiency flag each, granted by
  the character's *class* and by the DM's override, and by nothing else. That distinction is the
  difference between a lifted exclusion and an abandoned one — there is no background on a
  character, so there is no second source a proficiency can arrive from.
- **Speed is a field defaulting to 35** rather than a constant, because the Goliath moves 45.
- **Equipment is unchanged.** The fixed kit on each premade sheet is a line of text, which is what
  *"No inventory — set equipment per character"* already permitted. No inventory model was added.

`convex/lib/races.ts` and `convex/lib/skills.ts` each open with a header saying they are a
deliberate change to the subset rather than an implementation of it. An exclusion should be
difficult to lift and impossible to lift by accident; the cost of lifting one is a paragraph in two
places, which is about right.

### A character stores its selections, and the sheet is resolved when it is read

The `characters` document holds a third kind of sheet: a `preset`, which is a race, a class, an
archetype, a level, a lock flag and an optional override diff. It holds **no ability scores, no
armour class, no hit points, no skills, no feats and no spells.** Those are read live out of
`convex/lib/library/` by `resolveSheet` every time the character is looked at.

This is a **live link rather than a copy**, and everything good and bad about the milestone follows
from it.

Awarding a level is one number changing. `characters.setLevel` writes `level` and nothing else, and
the hit points, hit dice, features and spells that go with it fall out of the next read. There is no
sheet to rewrite, no diff to compute and no way for a level-up to half-apply. A correction to the
library — a damage die that was wrong, a feature described badly — reaches every character that
already has it, with no migration.

The costs are real and are accepted rather than argued away; they are in the consequences below.

### `resolveSheet` goes behind the accessor that already existed

This is why the milestone was cheap, and it is the part worth copying next time.

`characterSheet` in `convex/lib/sheet.ts` was already the **single accessor** for a character's
sheet — nine call sites, every one of them going through it, because Milestone 3 made the stored
field optional and needed one home for the default. Putting resolution behind the same shape meant
the substitution was one import: `maySeeCharacter`, `visibleVitals`, `currentHpOf`, the health bands
and `publicSheet` all ask for a `CharacterSheet` and all still get one. **A whole character-building
system changed no read path, no secrecy guard and no leak-guard test.**

That was only available because resolution is **synchronous and pure** — no `ctx`, no database read,
no `async`. The library is a static module rather than a table, so `resolveSheet(doc)` has the same
signature as the accessor it replaced. Had the library been a table, every one of those nine call
sites would have become async and the two choke points of ADR 0005 would have been rewritten to
carry a context they did not previously need.

It lives in `convex/lib/resolve.ts` rather than in `lib/sheet.ts` for one reason: it imports
`lib/library/`, and `lib/sheet.ts` is imported by the browser.

### Library, then race, then the DM — and the order is the design

`resolvePreset` applies three layers in a fixed order, and none of the three can be moved.

**The library is race-agnostic by construction.** Its standard array is allocated for the class
without considering race, which is what allows race to be applied on top. If race were applied first
or baked in, an Elf's +2 Dexterity would be part of a base that the next level's lookup overwrites.

**The DM comes last, because an override is the final word.** That is what keeps "the DM can always
change a player's sheet" literally true against a character whose numbers are read live, and it is
what makes an override **survive a level-up** — bumping a boss-fight armour class should not be
undone by the DM awarding a level five minutes later.

Overrides are a **diff, not a replacement sheet**. `PresetOverrides` has every field optional and is
deliberately not every field of `PcSheet`: level, class, archetype and race are *selections* and are
changed by changing them. Putting them in the override object too would be two ways to say the same
thing and two places for them to disagree. Entry lists are the exception to "replace": `extraFeats`
and `extraSpells` **append**, so a plot item the DM handed out survives the next level's lookup
instead of being overwritten by it.

### The library never reaches the browser

The server resolves a character and sends a finished `PcSheet` over the wire. The client imports
`lib/classes.ts` and `lib/races.ts` — eight class names, sixteen archetype names, eight races, and
one line of help each — and nothing at all from `lib/library/`.

Two things buy: roughly 150 KB of stat blocks stay out of a bundle already near a megabyte, for data
no client ever reads; and there is **no second implementation of the resolution order** to drift from
the server's. A browser that assembled sheets itself would have to apply race before overrides in
its own copy of that rule, and the server would have to validate the result anyway.

The separation is held by a test rather than by memory, because it is exactly the sort of thing one
convenient import quietly undoes.

### Race is applied at resolution rather than written into the library

Eight races across 72 sheets is 576 hand-written stat blocks, and every future correction to a class
multiplied by eight. Race is instead a small diff applied by `applyRace`: an ability bonus, hit
points per level, a speed bonus, and entries appended to the feat and spell lists.

The **trait entry always appears**, whether or not it changes a number. A Halfling's Lucky is the
whole of what makes them a Halfling and would otherwise be invisible on their own sheet.

### Per-rest state lives in `characterVitals`, for ADR 0005's reason

A Human's Heroic Inspiration and a Half-Orc's Relentless Endurance are spendable once between long
rests. Which abilities a character *has* is build and comes from the race; **whether they have been
spent is state**, so it lives beside current hit points and hit dice in `characterVitals`. A rest
changes it and an edit does not — the same test [ADR 0005](0005-character-sheets-and-hit-point-secrecy.md)
applied to hit points, giving the same answer.

Spent abilities are stored as **keys rather than a count**, so a race with two of them tracks both
independently and a race that gains one later needs no migration: an absent key is unspent.

The app never enforces any of these effects. It remembers whether one has been used, which is the
part a table actually forgets — Heroic Inspiration goes unused for three sessions, and Relentless
Endurance gets spent twice in the same fight. Adjudicating the reroll is the part the table enjoys,
and building that is a rules engine this project has no intention of owning.

`characters.longRest` restores hit points, hit dice and per-rest abilities in **one mutation and one
button**, because that is one thing that happens at the table; a rest that healed a character but
left their hit dice spent would be a bug somebody has to notice. It returns *all* hit dice, which is
more generous than 5e's half, because "you get everything back" is a rule a child can hold.

### The lock is advisory, and that is the right amount of enforcement for what it guards

Three rules decide who may change what about a premade character, and each has a reason at the table
rather than a security one:

- **Level is the DM's.** Levels are awarded. There is no experience in D&D Lite.
- **Race, class and archetype lock once chosen.** Rebuilding a character mid-session is almost
  always a misclick; when it is genuinely wanted, the DM clears the lock and it takes two seconds. A
  player may set the lock — committing is theirs — and only the DM may clear it. That asymmetry is
  the whole mechanic.
- **Overrides are the DM's**, because they are the DM's own thumb on the scale.

**None of these survives the network tab**, because `playerId` is a routing argument and not proof
of identity ([ADR 0003](0003-player-identity-without-accounts.md),
[ADR 0004](0004-board-authorisation-and-layers.md)). Stated plainly rather than glossed: this stops a
misclick and says whose character it is. It is acceptable for the same reason moving a token is —
**nothing behind the lock is a secret.** A premade hero's sheet is already shown to the party, and
the worst outcome of a spoofed id is a rebuilt character everybody watched happen and the DM can put
back. The refusal that guards a real secret — an NPC's sheet — keys off the DM code alone and gets no
such latitude.

### Two more optional fields, which is the third time this project has met that trap

`skillProficiencies` and `speed` are `v.optional` on `pcSheetValidator`, and neither is optional
because it is optional in the domain: a resolved sheet always carries both. They are optional because
**the `characters` table already holds Milestone 3 sheets without them**, and adding a required field
to an object that has stored instances fails the schema push.

That is now the third instance — `games.status`, then the `sheet` field itself, now these two — so
the treatment is a standing pattern rather than a decision to make again: declare it optional, read
it through exactly one accessor (`skillProficienciesOf`, `speedOf`) so the default lives in one
place, and make sure the resolved value is always populated so nothing downstream has to know.

### A retired archetype degrades instead of throwing

`librarySheet` returns null for an unknown class or an archetype the library no longer has, and
`resolvePreset` falls back to a sheet carrying the character's level, name, class label and hit dice.
The character keeps everything it *is* and loses only the numbers it was borrowing.

Writing an unknown archetype is refused, while reading one is tolerated. That asymmetry is
deliberate and is the stance `catalogueEntry` and `subclassOf` already take: nobody should be able to
choose a retired archetype now, and a character that chose one before it was retired must stay
readable — a thrown error inside a query that paints a screen is a blank screen.

### A resolved preset is validated as well as its selections

`storedSheetProblem` checks what the document holds, which for a preset is only the four selections.
So `characters.updateSheet` resolves the preset and runs `sheetProblem` over the result as well.
That second check is the one that earns its place: it catches a library entry with a malformed roll
spec, a race bonus that pushes an ability past 30, or a DM override that lands the armour class out
of range. The library is content, content drifts, and this is the gate that stops it drifting into
the database.

## Consequences

### Good

- **A beginner has a playable character after two dropdowns.** Six ability scores, saving throws,
  skills, armour class, hit points, hit dice, features, spells and a kit, without anybody having read
  a rulebook. That was the entire point of the milestone.
- **Awarding a level is one number.** Everything the level changes falls out of the next read, so
  there is no rewrite to get right and no way to level a character halfway.
- **Adding a character-building system changed no read path.** Because resolution went behind an
  accessor that already existed, ADR 0005's two choke points, the health bands, the vitals
  projection and every leak-guard test were untouched.
- **A fix to the library reaches characters that already exist**, with no migration and nothing to
  re-save.
- **The bundle did not grow by 150 KB**, and the client has no resolution logic that could disagree
  with the server's.
- **requirements.md can still catch the code being wrong**, because it was amended rather than
  edited to agree.

### Costs and constraints we are accepting

- **A player cannot tweak their own numbers.** A premade character's ability scores are the
  library's, and adjusting one is a DM override. There is a genuine escape hatch — a character can be
  saved as an ordinary hand-built `pc` sheet, which `updateSheet` allows because only monster-ness may
  not change — but taking it is effectively one-way: the numbers stop tracking the library and the
  character stops levelling by itself.
- **An override pins the field it touches.** `abilities` is overridden as a whole object, so nudging
  one score freezes all six against every future level. That is deliberate — six independent optional
  numbers is a worse thing to reason about than "this field is now the DM's" — but it means writing an
  override is a decision to stop tracking that field, and nothing on screen says so.
- **Nothing can take an entry away.** `extraFeats` and `extraSpells` append, and there is no
  mechanism to remove a spell the library granted. The DM can add and can pin, not subtract.
- **Editing the library edits live characters.** That is the feature, and it is also the hazard:
  correcting a damage die mid-campaign silently changes a character somebody has been playing for
  weeks. Note the trap for whoever maintains the content — `lib/rules.ts` is **copied** onto a sheet
  when it is picked (ADR 0005) and is therefore safe to edit, while `lib/library/` is **linked** and
  is not. Two corpora, opposite storage strategies, and the difference is invisible from inside
  either file.
- **Past level 5 a character stops gaining.** The library ends there. The DM may set a level up to
  20 and the proficiency bonus rises with it, so a level 8 character is a level 5 sheet with a better
  proficiency bonus. That is a limit, not a rule, and extending it is 24 more hand-written sheets per
  five levels.
- **72 sheets are maintained by hand**, around 350 KB of source, with every level written out in
  full rather than derived from the one below it. That is what makes them readable side by side when
  comparing level 3 to level 4, and it is also what makes a class-wide correction nine edits.
- **There is no preview.** Nothing exposes an unsaved resolution, so a player picks from a one-line
  blurb and sees the actual numbers once the choice is saved. A preview would be a query of its own,
  and it is not obvious yet that anyone wants one.
- **The rules are remembered, never enforced.** Nothing stops a Half-Orc using Relentless Endurance
  twice; the app knows it has been spent and says so.
- **Two more optional fields and two more accessors nobody may bypass**, which is two more places a
  future contributor can read a field directly and get `undefined`.
- **The milestone numbering shifted underneath the earlier records — twice.** Inserting this milestone
  moved the roadmap's old Milestones 4 to 7 down one; the monster library was then inserted as
  Milestone 5 and moved them down again. ADRs are not edited after the fact, so read the older ones by
  what they name rather than by the number: **rolls, feed and dice** is now Milestone 6, **DM tooling,
  layers and fog of war** is now Milestone 7, and the **orphaned-blob sweeper** is now Milestone 9.

  The lesson, recorded because it has now cost two sweeps of the source in one sitting: **a comment
  that names a milestone number dates badly.** Numbers move whenever anything is inserted, and the
  compiler cannot tell you. Where a comment needs to point forward, naming the *feature* — "when
  rolling lands", "the DM panel milestone" — survives renumbering and is what the next one of these
  should do.

## Alternatives considered

### Resolving once and storing the finished sheet — rejected

The obvious design, and the one that needs no resolver: build the sheet when the character is
created, store it, and rebuild it on a level-up. Rejected on three counts. Levelling becomes a
rewrite of a whole document rather than one field, and a rewrite has to be got right. A correction to
the library never reaches a character that already exists, which for content written in one pass by
one person is the failure most likely to actually happen. And, decisively, **a stored sheet cannot
tell the DM's numbers from the library's** — so a level-up would have to guess which of the values in
front of it were somebody's deliberate edit. The live link plus an explicit override diff keeps that
distinction in the data, where it can be applied rather than inferred.

### Race written into the library — rejected

Eight races × 72 sheets is 576 stat blocks to write and to keep consistent, and every correction to a
class multiplied by eight. Rejected for arithmetic. The library's standard array is allocated without
considering race precisely so that race can be a diff applied afterwards, and five of the eight races
change no number at all.

### The library as a Convex table — rejected

The instinct for a backend project, and wrong here. The library is content that ships with the code:
it is versioned with it, reviewed with it, and never edited by a user. A table means seeding it,
migrating it for every correction, and eventually an editor nobody asked for. It would also make
resolution **async and a database read** — which is exactly what would have forced the nine call
sites of `characterSheet` to change, and with them the two choke points ADR 0005 built. The whole
cheapness of this milestone came from resolution being a pure function.

### Resolving in the browser — rejected

The client already has the selections; it could fetch nothing and assemble the sheet itself.
Rejected because it puts ~150 KB of stat blocks into a bundle already close to a megabyte for data
that only ever gets rendered, and because it creates a second implementation of the library → race →
overrides ordering. The server would have to resolve anyway, to validate the result and to compute
the health band it does not send.

### Level, class and race as overridable fields — rejected

`PresetOverrides` could simply mirror every field of `PcSheet`. Rejected because level, class,
archetype and race are the *selections*: they are changed by changing them, and a second way to say
the same thing is a second place for the two to disagree — with the level in the override silently
winning over the level the library was indexed by.

### Experience points — rejected

Not in [requirements.md](../requirements.md), and the reason it is not is sound: tracking experience
is bookkeeping between sessions for a group that plays a few times a year. The DM setting a number is
one conversation and one dropdown.

### A lock that actually holds — rejected

Making the lock enforceable means knowing who is calling, which means accounts, which
[ADR 0002](0002-defer-user-accounts.md) has now declined for the fourth time. The reasoning is
unchanged and is the threat model in CLAUDE.md: not sending a secret is nearly free and therefore
required; proving who is asking is not, and nothing behind this lock is a secret in the first place.

### Enforcing racial abilities and per-rest effects — rejected

The app could apply the Halfling's reroll, refuse a second Relentless Endurance, and add the
Dragonborn's breath damage. Rejected as the beginning of a rules engine, which is the thing D&D Lite
exists to not be. The split taken instead is sharp and defensible: the app **remembers** what a table
forgets (whether a once-per-rest ability is spent) and **adjudicates** nothing.

### Backgrounds along with skills — rejected

Having lifted "no skills", lifting "no backgrounds" in the same breath would have been consistent.
Rejected because it adds a second source a proficiency can come from — and therefore a rule about
what happens when both grant Perception — plus a list of backgrounds to write, for a subset that
deliberately has no inventory, no downtime and no social system for a background to matter in. One
source, from the class, is the whole of what the premade sheets need.

### A widen–migrate–narrow to make the two new fields required — rejected

Same trade ADR 0005 refused for a table-level union on `characters`: two deploys and a migration over
every stored sheet, to save one `??` behind an accessor that already exists.
