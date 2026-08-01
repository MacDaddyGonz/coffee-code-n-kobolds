# 11. Announcing a roll rather than adjudicating one

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Three milestones stored roll specifications as validated strings and deliberately never parsed
one. `isValidRoll` and `ROLL_PATTERN` fixed the grammar; the character library, the catalogue and
the bestiary were all written against it; `SheetEntry` grew a category and a second roll
[for this work specifically](0008-one-shell-and-what-a-sheet-entry-is.md); and `sheetFocusOf`
[named the roll announcement as its predicted fourth reader](0009-who-plays-what-and-what-control-grants.md).
This is the milestone all of that was waiting for, and the first code in the project that
evaluates an expression.

The plan for it was a feature list, and a review found the list wanting. It said *what would
exist* and almost nothing about **how a sheet behaves when somebody clicks it** — and worse, three
of the things on it did not exist in the data model at all. Discovering that at implementation time
is how the shape of a roll path gets decided by whichever file happened to be open. So five
questions were named to be answered on the record first, and they are the first half of this
document.

The second half is what a *feed row* is, which turned out to be the milestone's real risk. A line
reading `Ancient Red Dragon attacks with their Bite` has exactly the shape of a line reading
`Chadius attacks with their Greatsword`, and the DM rolling an ambush must not publish the ambush.

## Decision

### The five gaps: announce, do not adjudicate

The same answer to all five, and the same answer this project has given every previous time —
CR scaling, the advisory lock, the per-rest tick.

1. **There are no spell slots and there will be none.** No table, no field, no counter. Clicking a
   spell rolls its dice and says *casts Cure Wounds*. The spell level stays on the sheet because it
   is a **label**, and nothing anywhere implies a resource was spent.
2. **A hero gets no spell save DC, and needed no spell attack bonus.** The attack bonus turned out
   to exist already and per entry: `toHit: '1d20+INT+PROF'` is written into the corpus, so there
   was nothing to derive. The save DC is declined, and cheaply — a resolved `PcSheet` stores
   `className` as a display name rather than a class key, so `8 + PROF + ability` would need a
   spellcasting ability added to `lib/classes.ts`, a new optional field written by `resolvePreset`,
   a new accessor and a seventh instance of the field-by-field rebuild trap, for a number nothing
   in this application ever compares a roll against. A hand-built hero has no class key at all and
   would get no DC regardless. The DM says *make a Dexterity save* and the player clicks their save.
3. **A hero's initiative bonus was already answered, in the milestone that built the reduced
   sheet.** `initiativeBonusOf` returns `abilityModifier(dex)` for a hero and the stored
   `initiativeBonus` for a creature. One function, both shapes, no new field — this one only had to
   be *found*.
4. **Limited-use resources stay exactly as coarse as they are.** No count per key, no short rest.
   `spentPerRest` continues to cover the two race traits it covers and nothing else. Rage twice a
   day is the table's to count.
5. **Concentration and the action economy are the table's, said out loud.** No field, no check,
   and — the part the review actually asked for — nothing on the sheet implies otherwise.

⚠️ **One of these is a genuine amendment and four are not.** *"Turns consist only of 1 action, 1
bonus action and 1 reaction"* is in the spec's **Included** list, which makes it the one place the
requirements name something this application deliberately will not adjudicate. That is recorded in
[requirements.md](../requirements.md)'s amendments section. The other four were never promised.

### Evaluation is server-side, and a test enforces it rather than a comment

`convex/lib/dice.ts` holds the arithmetic and the randomness. Nothing under `src/` may import it,
and `bundleGuard.test.ts` fails the build on any quoted specifier that tries — which is the actual
enforcement of *a roll the browser computes is a roll the browser can choose*. The browser can
render a row it was sent and has no way to produce one.

`convex/lib/roll.ts` is the other half and is deliberately browser-shared: the modes, the parts of
an entry, the shape of a result, the request shape a client may send, and the one sentence generated
from a row. No arithmetic, no randomness, nothing secret.

**A request names an identifier and never a number.** `feed.roll` takes an entry *id*, an ability
or a skill; the server reads the name, the category, the spell level, the text and the expression
off the stored sheet. So the only thing a request can be wrong about is *which* thing, and a wrong
id is a refusal. That is why the request type and the subject type are two types where one would
compile: reusing the subject as the argument would hand the client `name`, `category`, `level` and
`text` as *inputs*, and a mutation that writes what it was told has a feed that is whatever the
network tab says it is.

`crypto.getRandomValues` with rejection sampling, never `Math.random` — the rule
[ADR 0003](0003-player-identity-without-accounts.md) set for codes, applied to dice. 256 is not
divisible by 6, so a naive modulo would make a d6's 1 come up about 2% more often than its 5,
forever, on every damage roll in the game.

**Advantage is a toggle applied to a single d20 and inert everywhere else** — `TO_HIT_PREFIX`'s
existing decision honoured rather than re-taken. Inert rather than *refused*: a roller with a sticky
toggle set from the last saving throw who now rolls `2d6` is not making a mistake worth stopping,
and refusing would be the app adjudicating a rule nobody asked it to. `dropped` on the result is
how a row says whether the toggle did anything, and `rollModeNote` keys off that rather than off the
mode, so the feed can never claim advantage on a roll the evaluator did not touch.

### A feed row is a leaked row, so the guard drops the row

`convex/lib/feed.ts` is the third choke point, declared in `leakGuard.test.ts` beside the two token
tables and the two character ones. There is **no redacted variant of a feed row and there must not
be one**: a creature's line is indistinguishable in type from a hero's, so no `returns:` validator
could ever tell them apart, and a projection over this table would cheerfully approve an array made
entirely of spoilers. Contrast `publicVitalsValidator` next door, which *is* a discriminated union
precisely because exact hit points are a leaked **field** and a union can leave nowhere to put one.
One tool for each shape — invariant 8's distinction, met for the third time.

A row carries: the game, the character (or `null` for an ad-hoc roll), the actor's **name as it was**,
a six-member subject union, the result or `null`, and `dmOnly`. Every field is required and spells
"none" as `null`, which is worth stating because every neighbouring table carries the opposite
comment: a field is optional in this schema *only* because adding a required one to a populated
table fails the push, and `feed` is new. **This milestone adds no field to any populated table**,
which is the precise reason the field-by-field rebuild trap does not bite.

`actorName` is stored rather than looked up — the `catalogueKey` breadcrumb argument applied to
history. It is the **character's** name for a sheet roll, because the DM rolling on a player's
behalf must announce the character, and the **seat's** display name for an ad-hoc roll, because
that names a person and not a creature.

**Whether a row may be heard is a new question with a new name.** `mayHearOf` composes
`maySeeCharacter` and never substitutes for it, and it is not folded into it, for the reason
`isReservedCharacter` gives at length one function up: `maySeeCharacter` decides whose *sheet* may
be opened, and this decides whose *name may appear in a line saying they rolled something*. Ask the
sheet question about a feed row and `Goblin Archer attacks with their Shortbow` is suppressed for
the very players watching the arrow land; widen the sheet question to admit what the feed admits and
that goblin's armour class and the DM's notes go out with the line.

The sight disjunct is honest rather than lax: `board.tokens` has **already** published that
goblin's name to that player. A creature on the DM layer, or one with no token at all, is in neither
set — `boardCharacterAccess` filtered it before its loop began — so the ambush rolls nothing anybody
hears about until the coin is on the board, and reveals both in one write to `layer`. Two further
reasons to withhold, a reserved character and `dmOnly`, are `&&`-ed at the call site and folded into
nothing.

### A grant cannot widen the feed, and the parameter that said otherwise is gone

The first version took a `controlled` set, on the reasonable-sounding ground that a creature the DM
has handed a seat is one whose lines that seat may read. **That is false, and provably so.**
`boardCharacterAccess` adds an id to `controlled` only on an iteration that has already added it to
`visible`, so `controlled ⊆ visible` holds by construction — every id the grant disjunct could admit,
sight has already admitted.

It was not free to leave in. A parameter that changes no answer still *asserts* a rule, and this one
put `playerId` on `feed.list` and split the highest-churn subscription in the application into one
cache entry per seat, each re-executing on every roll at the table to compute identical rows.
Removing both makes the answer a function of the DM code alone — two entries for a whole table, and
no roster in the read set, so a join or a rename no longer re-pushes the feed to everybody.

**What is lost is a hook, and losing it is the point.** If control is ever meant to let a seat hear
about a creature it cannot see, that is a new decision — a grant on a DM-layer token doing something,
which ADR 0009 deliberately made inert — and it should arrive as a signature change somebody has to
write rather than as a parameter already implying the rule is in place.

### Retention: bounded at the read, swept with the game, and not trimmed

`feed.list` takes the newest sixty off a descending index. **Nothing trims on the write path**,
deliberately: invariant 2's actual lesson is *do not put a range read in a hot write path*, and a
count-and-delete on every insert is exactly that. A feed is a few rolls a minute, not the ten writes
a second a drag makes — the *growth* is the concern and the *rate* is not, and they want opposite
answers. Rows are a few hundred bytes, so a year of weekly play is single-digit megabytes. A deleted
character's lines go with it, and `admin.purgeGame` takes the rest.

⚠️ **The window is taken before the filter, and the reason is the bound rather than secrecy.**
`readable` is a decision about a character and not something an index can be built on, so "the
newest sixty a player may hear" means reading until sixty survive — an unbounded scan of the one
table nothing caps. The cost is real and is stated as a cost: a player's window is shortened by the
DM's private lines, so somebody counting the public rolls can learn *how many* they are not being
shown once the game passes sixty. A count of private rolls and never their content, in a threat
model whose audience is a small group of trusted colleagues.

### The DM may roll privately, and the refusal is deliberately distinguishable

A *just for me* toggle on the dice tray, honoured only for a caller holding the DM code and
**refused** with `NotDm` for anybody else rather than quietly downgraded to `false`. The downgrade is
the worse failure in exactly the case the flag exists for: a DM whose browser has lost its code
clicks *roll privately* on tonight's dragon and has the line published to the whole table with the
toggle still lit. A refusal costs one confused moment; the downgrade costs the ambush.

This is the one distinguishable refusal in a module that otherwise works hard to make them
identical, and it is safe rather than an exception being made — it is asked before any character is
looked up, its answer is a fact the caller already knows (*do I hold this game's DM code?*), and
`games.checkDmCode` hands the same bit to anybody who asks. The reasoning is not "this leak is worth
it" but "there is no leak to weigh".

### One sentence, generated, never stored

`rollSentence` produces all six of the plan's example lines from the row's own facts, with a `never`
arm and a `Record` of labels. Storing the English would put a copy edit behind a migration over every
row of every game, and would let the line in the feed and the announcement over the map disagree
about what happened. **The spell/feature split keys off `level` and not off the category**, which is
what ADR 0008 predicted: Fire Bolt is a `weapon` and Shield is a `passive` and both are spells, so a
test that looked at the category would pass while announcing *Chadius uses Shield*.

`partsFor` is composed out of `rollShapeOf` rather than switching on the category a second time, so a
fourth `SheetEntryCategory` still fails in exactly one place.

### A second dice library, because the first cannot be told what to display

`@3d-dice/dice-box` is named in [ADR 0001](0001-platform-and-hosting.md), in CLAUDE.md and in the
roadmap, and **it rolls its own numbers with no way to override them.** That is irreconcilable with
the server deciding every roll: either the dice on screen disagree with the announced total, or the
browser chooses the number. `@3d-dice/dice-box-threejs` is the same author's fork that exists
specifically to preserve predetermined rolling — `roll('2d20@18,4')` lands the dice on given faces —
so **this supersedes ADR 0001's choice of dice library and nothing else in it.**

Proven from the bundle rather than the README: `rollDice` swaps the die's face material index *after*
the physics has settled and the reported value is read back off the mesh normals, so a returned value
is evidence about the rendered die rather than an echo of the input. Then confirmed in headless
Chrome, with an unpinned `6d20` beside it as the control.

Two consequences. It uses cannon-es rather than an ammo.js WASM blob, so the risk the plan flagged
largely evaporated — but the texture still has to resolve under `/coffee-code-n-kobolds/`, so this is
the codebase's first reader of `import.meta.env.BASE_URL`, and the 404 a leading-slash literal
produces is recorded as the control that found it (invariant 4). And its **d100 is a tens die**, so a
server-decided 47 cannot be rendered at all: `notation.ts` therefore tests the *value* rather than the
face count and drops what it cannot show rather than rounding it. No corpus expression uses d100; the
ad-hoc roller can type one, and the feed stays authoritative.

The engine is loaded by `await import()`, so three.js lands in its own 545 kB chunk.

## Consequences

### Good

- **The corpus is the specification, and the loop proves it.** 227 distinct expressions across the
  library, the catalogue and the bestiary resolved at every rating, each evaluated at its arithmetic
  minimum, its maximum, and for real. The bet the sheets milestone made — validate a grammar you
  cannot yet evaluate, so the evaluator lands on content already known to conform — was collected in
  full.
- **The secrecy claim holds from two directions and was checked visually.** The DM rolls a DM-layer
  creature and the player's screen shows nothing at all: no line, no dice, no row. The coin moves to
  the player layer and it appears. Sight of the line is still not sight of the stat block.
- **The dice show the server's faces.** Every screen at the table sees the same numbers on the same
  dice, which is the whole reason the library was changed.
- **The evaluator is one function with an injected die source**, so *advantage keeps the higher of
  two* is an assertion about a known pair rather than a statistical hope.

### Costs and constraints we are accepting

- **`SheetEntry` is now read by a roll path as well as three renderers.** ADR 0008 spent ADR 0005's
  saving to make this possible; the interest is that the type now has a fourth kind of consumer and
  the next field on it will be harder to justify again.
- **A count of the DM's private rolls is inferable** from a shortened window, as above.
- **A `playerId` is still routing and not identity.** Anybody can pass another seat's id and publish
  an ad-hoc line under that person's name. The privacy flag is *not* reachable that way, because it
  keys off the DM code alone. Accounts declined a fifth time.
- **Two and a half seconds of nothing between the sentence and the total**, which is however long
  the dice take. That is the sequence the plan asked for and it is longer than it sounds — see below.
- **The dice engine is 545 kB in its own chunk**, plus 35 MB of `node_modules` that ship nothing
  (the package bundles three.js and cannon-es into its own dist and declares them as dependencies
  anyway).
- **No audio.** *"A red warning alarm"* is rendered as a red pulse. Sound needs an asset, a mute
  control and the autoplay dance, none of which exists.

## Four things found by building it, recorded because the reasoning was wrong first

**The plan's own corpus count was wrong, and regenerating it was the instruction that caught it.**
It said 27 distinct roll expressions in the bestiary. `roll:` is used only by creature *abilities* —
an attack's damage is in `damage:` — and the true figure at each creature's own rating is **61**.
An evaluator satisfied against the 27 would have met the other 34 in front of the group. The plan
said to regenerate rather than trust the table, and this is what that instruction was for.

**`controlled` was inert and the docblock claimed the opposite**, as above. Found by the agent
writing the leak tests, which is the second time in this milestone that a test found the *reasoning*
wrong rather than the code.

**`visibleFeed`'s window-before-filter comment argued for the opposite of what the code does.** It
said filtering first would leak a count; it is the other way round. The wrong version read perfectly
well, which is why the correction is recorded rather than quietly replaced.

**Three bugs survived 1314 green tests, a clean lint and a 187/187 real-deployment smoke run, and a
browser found all three.** That is now true of every milestone in this project.

- **A double-click on a weapon lost the damage roll, every time.** `RollButton` disabled itself on
  `pending`, which counts every roll in flight from the *whole panel* — so the first click greyed
  out the button beside it and the second was silently dropped. To-hit-then-damage is the
  interaction this milestone exists for. The identical correction had already been written for the
  initiative die, in almost the same words, one file over.
- **The dice canvas did not follow the pane divider.** The engine resizes on a `window` resize and
  nothing else, and the divider changes the container inside a window that never changes — so one
  drag left the canvas at its build size for the session, dice clipped away or confined to half the
  map. It read as *"the dice have stopped working"* and a reload silently fixed it.
- **The crit halo spoiled its own reveal.** Tinted from `roll.crit` as the line appeared, and the
  gap to the total is not the 850 ms floor it looks like from the code — measured at 2.4 to 2.6
  seconds. Long enough to read the colour and call the crit before the number lands, which answers
  the only question a table cares about on a d20 and leaves the arithmetic as the punchline.

## Alternatives considered

### Spell slots, a save DC, per-use counts — rejected, and this is the milestone that had to say so

Each is a small, reasonable feature, and each is a rules engine arriving one feature at a time. The
test applied throughout: does the app *decide* anything, or does it announce what a person decided?
Nothing here compares a roll to an armour class or a DC, applies damage, or knows whose turn it is.
The moment one of those changes a number a player rolls against without somebody asking it to, it
needs an amendment and an ADR of its own.

### One mutation for ad-hoc and sheet rolls — rejected

Tempting, since both end in a feed row. Rejected because splitting them is what keeps **every**
argument of `feed.roll` an identifier: an ad-hoc roll is the one place an expression legitimately
arrives from a person, and it is therefore the one place `ROLL_PATTERN`'s uncapped term group is
reachable and `rollProblem` rather than `isValidRoll` is required. One mutation would have put a
free-text expression on the path that reads a stored sheet.

### `feed.list` with a `playerId`, kept for future-proofing — rejected

See above. A parameter that provably does nothing is worse than an absent one, because it describes
a rule that is not there.

### Trimming the feed on insert — rejected

A range read on the hot write path, which is the one thing invariant 2 is actually about.

### Keeping `@3d-dice/dice-box` and letting it choose the numbers — rejected

The obvious way to keep the named dependency. It puts the roll in the browser, which is the trap this
milestone was warned about in as many words.

### Rebuilding the dice tray on a divider drag — rejected

The straightforward fix for the resize bug: dispose and create. Rejected because it is a WebGL
context, a texture load and a physics world for a change of width, it drops dice mid-throw, and it
would have to settle the promise the announcement is sequenced against — three problems in place of
the one being solved. Calling the engine's own `setDimensions` is the same call its own listener
makes, reached by a different route.
