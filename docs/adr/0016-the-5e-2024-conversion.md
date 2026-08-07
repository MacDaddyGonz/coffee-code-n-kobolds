# 16. The 5e 2024 conversion

- **Status:** Accepted
- **Date:** 2026-08-07
- **Supersedes in part:** [0005](0005-character-sheets-and-hit-point-secrecy.md),
  [0006](0006-premade-character-library.md), [0007](0007-monster-bestiary-and-cr-scaling.md),
  [0011](0011-announcing-a-roll-rather-than-adjudicating-one.md) — see *What was superseded, and what
  was not*, which says of each whether the **numbers** went or the **machinery** did.

> **Written as the milestone landed**, one section per branch, in the register
> [ADR 0015](0015-a-map-that-starts-covered.md) set. Several of the decisions below exist only
> because building it produced them — a deploy that refused a schema push over a character created
> months ago, a benchmark guard whose wording was false in a way no test could see, an id minted from
> a name that made 86 creature sheets unstorable at once. None of those is in the plan.
>
> ⚠️ **What had landed when this was written, and what had not.** The vocabulary rename, the
> fail-soft species lookup, the schema widening, the nine species, the resource shape, weapon
> mastery, the 183 spells, the 10 feats and the 283 creatures are in the tree. **The twelve classes,
> the sixty library sheets, the migration and the panels are not**, and two consequences of that are
> visible in the code as this is written: `SPEED_FEET` is still 35, and `SUBCLASS_LEVEL` is still 2.
> Both move with the content that makes them true — a rename that also breaks the library is not one
> reviewable commit — and both are recorded below as decisions rather than as descriptions of the
> tree. A record written mid-milestone that does not say which is which is a record that lies.

## Context

Eleven milestones built **D&D Lite**: a deliberately reduced subset of 5e (2024), assembled by
cherry-picking. Eight races with one trait each, thirteen skills, sixteen entries in a list called
`FEATS`, twenty-four spells, one hundred and twenty-nine hand-written creatures, seventy-two premade
sheets across eight classes and sixteen archetypes. Every number in it was chosen by somebody for
this application, calibrated against the other numbers in it, and defensible only as a whole.

That was the right shape for eleven milestones and it has two problems that do not get better.

**The corpus is its own authority and cannot be checked against anything.** ADR 0007 says so in as
many words: the bestiary's balance is *"a judgement calibrated against `convex/lib/library/` rather
than against published CR maths — which is defensible and is also unverifiable by any test."* The
rules milestone wrote the rule down: *consult the 2024 rules for how a cherry-picked feature works,
never for what a character has — the corpus is the authority on the second question.* That sentence
was correct for eleven milestones and it means there is no external answer to *is this right?*, for
any number in the application.

**And the sixteen archetypes, eight of the second ones, appear in no SRD at all.** Battle Master,
Assassin, Oath of Vengeance, College of Valour, Light Domain, Path of the Wild Heart, School of
Divination and Beast Master were written from general knowledge. So were six of the sixteen `FEATS`.
A public repository of content written from memory of a rulebook is a different object from one built
on a published, openly licensed document, and the second one has been available since SRD 5.2.1 was
released under CC BY 4.0.

So this milestone **deletes D&D Lite** and puts **SRD 5.2.1 at character levels 1–5** in its place.
The relationship between the application and the rules inverts: the SRD becomes the authority on both
*how a feature works* and *what a character has*, and the corpora become a transcription of it. Seven
things are kept, named below, and everything else is either a consequence of the SRD or an exclusion
that survived it.

Nothing about the board, the feed, the seats, the fog, the coins or any guard in CLAUDE.md changes.
This reaches every sheet-shaped surface in the application and nothing else, which is the payout on
eleven milestones of keeping rules out of the board.

### The reference, and the one that must not be used

**Primary and authoritative:
[`downfallx/dnd-5e-srd-markdown`](https://github.com/downfallx/dnd-5e-srd-markdown), branch
`master`** — genuinely SRD 5.2.1, organised by topic. It is read from a path **outside this
repository** and no SRD file is copied in: a vendored copy is a second source of truth that drifts,
and what this repository ships is paraphrase rather than source text.

🚫 **[`sycarion/5e-2024-SRD`](https://github.com/sycarion/5e-2024-SRD) must not be used**, and the
reason is recorded so nobody wires it in later on the strength of its name: despite the title it is
the **2014 SRD 5.1**. Its own changelog carries *"Update material to reflect 5.2.1 SRD"* as an
unchecked to-do beside *"Rename Races to Species"*, and the content confirms it — Fighter gains a
Martial Archetype and no Weapon Mastery, Monk spends Ki Points, `Races/` contains Half-Elf and
Half-Orc. Reaching for it as a "second opinion" converts this application to the **previous edition**
one file at a time.

## Decision

### The seven things that survive

Named first, because everything else is a consequence of the SRD.

| Kept | After the conversion | What keeping it cost |
| --- | --- | --- |
| The **builder**: Level + Name + Species + Class + Archetype | Survives, with one field renamed, one gated and **one added** | `race` → `species` throughout; the archetype step is **absent** below level 3, because 2024 chooses a subclass at 3; and **lineage is a sixth field** rather than something the build absorbs — see below |
| A **premade library of popular builds, levels 1–5** | Survives, rebuilt | 72 hand-written sheets become 60, and every number on all 60 is re-derived from the SRD |
| **Levels 1–5 only** | Survives, and is the scope lever the whole milestone rests on | Caps a spell at level 3 and a prepared creature at CR 6 |
| **CR scaling up and down** | Survives, unchanged in design | `benchmarks.ts`' ten rows were fitted to a corpus that is being deleted, so they are re-derived from the SRD's own stat blocks |
| **The ad-hoc dice tray** | Survives untouched | **Nothing.** It arrived one milestone early, in [ADR 0014](0014-what-a-coin-says-about-itself.md), and this milestone must not re-add it |
| **No inventory**; equipment issued per class | Survives, and gets *more* precise | The SRD's starting-equipment packages, reduced to the line of text `LibrarySheet.equipment` already held |
| **No weight, no encumbrance, no XP, no money, no biography fields** | Survives; most were never built | The two that *were* — a spell's level as a label, and speed's default — both move |

### Where the arithmetic moves, and three of the plan's answers were wrong

The plan named six places numbers move and called one of the six a simplification. Building it
corrected three of them, and all three corrections run the same way: **the SRD is more detailed than
the plan assumed, and the existing machinery was better than the plan credited.**

#### Correction 1 — "monsters gain ability scores" is an ADDITION, not a simplification

The plan reasoned that a 2024 stat block carries all six scores, therefore
`BestiaryCombat`'s pre-calculated `attackBonus`, `initiativeBonus`, `passivePerception`, `saveDc` and
per-skill bonuses become derivable and can go. **That is wrong twice, and taking it would have
deleted the scaler.**

- **`scaleCombat` operates on exactly those fields.** ADR 0007's design is that a creature keeps its
  *offset* from its own CR row, and the benchmark table's **delta** columns are what make offset
  preservation work. Derive the five and there is nothing left to take an offset of — the scaler
  would have to scale the *scores*, which collides with `scalesWithCr` and with ADR 0007's whole
  argument.
- **Change 6's own rule points the other way.** *Derive what the SRD derives, store what the SRD
  prints* — and a 2024 stat block **prints** an armour class, `Initiative +1 (11)`, six scores with
  MOD *and* SAVE columns, explicit `Skills` bonuses and a Passive Perception.

So `abilityScores` and `saveBonuses` are **added beside** the existing fields, untouched by the
scaler exactly as `speed` is, and read by nothing yet — the same one-sided bet
`recommendedPartyLevelMin` took. Two details of the naming and shape are decisions rather than
spellings. The field is `abilityScores` and not `abilities`, because **`BestiaryCombat.abilities` was
already the ability *list*** — a creature's special abilities — and one word meaning two things on
one type is how a field-by-field rebuild copies the wrong one. And `saveBonuses` holds **printed
bonuses rather than proficiency flags**, because the SAVE column is not always MOD plus proficiency:
the Aboleth prints Dexterity −1 with a save of +3, and a flag has no way to spell that.

#### Correction 2 — in the 2024 SRD, initiative and passive perception do not track challenge rating

`benchmarks.ts` measured both against `10 + row.skillBonus`, and the argument beside them was that
initiative, passive perception and every skill bonus take the same integer shift under an additive
transform, because the constant cancels.

**The argument about *change* is still true and the scaler still relies on it. The claim about
*level*, which sat beside it, was false.** Across CR 0–6 in SRD 5.2.1 the median *printed* skill bonus
moves +3.7 → +5.9, while median passive perception moves 11.5 → 14.7 and median initiative moves
+0.9 → +3.3. They neither start together nor grow together, and the reason is structural rather than
statistical: a `Skills` line lists only **trained** skills, while passive perception is ten plus a raw
Wisdom modifier for two thirds of the corpus. The old bound fails on 45 perfectly ordinary creatures.

Both are now bounded against their own SRD-derived absolute range, separately, and `benchmarks.ts`
says why. ⚠️ **This is the most valuable thing the re-fit produced**, because it is a guard whose
wording was wrong in a direction no test could report: it passed for a hand-written corpus that had
been built to satisfy it.

A second casualty of the same re-fit, recorded because its going is a finding: **the three-column
parallel did not survive.** In 2024 the offensive and defensive columns gain their points at
different ratings, so no single offset holds across all three. It is replaced by bands and spans that
can still fail rather than deleted, which is this project's rule about guards that cannot fail
applied to a guard that had stopped being able to.

#### Correction 3 — `benchmarks.ts` kept three things *regardless* of what the SRD says

The rows are now the SRD's own medians at each rating. Three cells are not medians and were kept
deliberately, because the argument behind each of them is about **arithmetic or about a test
fixture**, and neither is a thing a source document gets a vote on.

| Kept | Why it is not the SRD's number |
| --- | --- |
| `hp[0] = 4`, where a fit to the SRD would say **3** | An **anti-amplification floor**. These are the smallest denominators in the table and therefore the largest amplifiers — every scale *from* CR 0 divides by them. The SRD's 1-hit-point Bat is exactly the input the floor exists to survive: at `hp[0] = 1`, one hit point of difference between two CR 0 creatures becomes 120 hit points at CR 6. Four makes the quantum 25% |
| `damage[0] = 2`, where a fit would say **1** | The same argument on the other column, with a sharper bottom end: at `damage[0] = 1` the smallest roll the grammar permits is `1d2`, averaging 1.5, which is a 1.5× deviation before anything has been scaled |
| `damage[1] : damage[4] = 1 : 2` **exactly** | A **test-fixture anchor**. `1d6+2 → 2d6+4` is the specification's own worked illustration, and an exact 2.0× is what keeps it a literal fixture rather than a hand-wave. The cells moved from 8/16 to **10/20** — the SRD's medians are 9 and 24, so a pair had to satisfy the fit *and* the ratio, and 10/20 sits within about 10% of the median at CR 1 and 20% at CR 4 while being exactly 2.0×. **The cells moved and the ratio did not**, and a tuner may have 12/24 or 9/18 but not a pair whose ratio is 2.4 |

⚠️ **`hp[0]` is the cell a re-derivation will reach for first, with the SRD in hand and a good
argument.** It is still the wrong one, and the file says so in those words.

Two shapes survived the re-fit **without being aimed at**, which is the best evidence ADR 0007's
design was describing something real rather than fitting itself: hit points still roughly quadruple
from CR 1 to CR 6 (4.3×), and armour class still moves by exactly three across the whole table.

#### The other three, which the plan got right

**Ability scores come from a background, which is excluded, so they are absorbed.** No 2024 species
grants an ability score increase; a background grants a `+2/+1` or `+1/+1/+1` spread, two skill
proficiencies and an Origin feat. Excluding backgrounds removes the *source*, and the resolution is
that the premade sheet stores the finished numbers — which is what a premade sheet has always been
for. `LibrarySheet.abilities` already carried the note *"the standard array, allocated for the class
and without considering race"*, and that clause becomes **true by construction rather than by
discipline**: with no species touching a score, the apply-species-on-top step loses its arithmetic
entirely. `abilityBonus` is gone from `Species` and `applySpecies` has nothing left to get wrong. The
test that proved an Elf's +2 was applied exactly once is **inverted rather than deleted** — no species
changes an ability score, on any class, at any level.

⚠️ **CLAUDE.md's *no second source of proficiency can ever exist* survives this, and it survives it
by being the mechanism rather than a casualty of it.** There is still no background on a character,
no background list and no second grant. What arrived is the premade sheet being the authority on a
fixed set of numbers. A reader who concludes backgrounds were lifted has it backwards: **the
exclusion is what forces the absorption.**

**The archetype is chosen at level 3.** `SUBCLASS_LEVEL` moves 2 → 3 and the SRD is unanimous, which
is worth knowing because 2014 was not. `ClassLibrary.base` becomes a **level-indexed record** covering
levels 1–2, with one `paths` key covering 3–5, replacing one base sheet plus two paths over 2–5. The
builder's archetype control is **absent** below level 3 rather than disabled, because a greyed
dropdown reads as a thing the player failed to fill in. And `CharacterClass.subclasses` is
`readonly [Subclass]` — a **one-tuple, not an array** — so a second archetype cannot arrive without a
decision. That is a licensing fact and not a design one: no SRD, 2014 or 2024, contains more than one
subclass per class.

**Thirteen skills become eighteen** — History, Nature and Religion in the Intelligence block, Medicine
and Survival in the Wisdom one, added in ability order because that is the order the list has always
been in. The five are **optional** on `skillProficienciesValidator`, which is the widen half of a
widen → migrate → narrow: every `pc` sheet stored since Milestone 3 carries thirteen booleans, and
requiring eighteen fails the push. `skillProficienciesOf` spreads over `noSkills()` so nothing
downstream of the accessor ever sees an absent flag. ⚠️ The third hand-spelled copy is the one worth
naming: `skillKeyValidator` in `lib/roll.ts` is **stored** — a feed row carries a subject — and
widening a stored union is the one direction it can move without a migration.

**Counts stated as "equal to your Proficiency Bonus" keep the literal model.** Draconic Breath
Weapon, Stonecunning, Giant Ancestry and Adrenaline Rush are all proficiency-bonus-many uses per long
rest, which is a *derived* count where the absorbed milestone planned per-sheet literals. The literal
survives and needed no redesign: a library sheet is written **per level**, the proficiency bonus is +2
at levels 1–4 and +3 at level 5, so a literal on a per-level sheet is exact and never drifts. This is
the absorbed milestone's own argument about ability-modifier-derived counts, reaching a second kind of
derivation and holding.

**The creature skill cap is 6, not 4, and it was read off the corpus rather than off the old
constant.** Six is the largest number of skills any SRD creature at CR 0–6 lists — **one creature
reaches it, two reach five, three reach four** — so the cap is exactly tight rather than comfortable.
Attacks and abilities stay at 3: for attacks that is genuinely enough, and for abilities it is a
*selection*, with damaging ones kept first, because `scalesWithCr` means nothing on an ability with no
roll.

### The species: nine, and it is not "eight minus one plus one"

⚠️ **The SRD species is the Orc, not the Half-Orc.** Half-Orc is retired, and **Gnome and Orc both
arrive** — 8 − 1 + 2 = 9. The plan said "Half-Orc retired, Gnome added", which is one species short of
what actually happens, and the difference is not a counting error: it is that Half-Orc's replacement
is a species with the same flavour and a different name, so a reader checking *did we lose anything?*
gets the wrong answer from the plan.

Three further things about the nine, each of which **deleted code rather than adding it**:

- **No species grants an ability score increase**, as above.
- **A species is no longer one trait.** `traitName`/`traitText` became `traits`, and the resolver
  appends one passive per trait — **thirty-three across the nine**, with a per-species count asserted
  against a hand-written table rather than derived from the thing it is checking.
- **Speed is printed rather than adjusted.** `speedBonus: 10` became `baseSpeed`, an absolute the
  resolver sets, spelled out on all nine. `SPEED_FEET` moves 35 → 30 in the migration commit and not
  before, because it is a **stored-value change wearing a constant's clothes**: `speedOf` answers the
  constant for every sheet with the field absent, and every stored sheet has it absent, so flipping it
  alone silently slows every existing character by five feet — correct for eight species and wrong for
  the Goliaths.

#### Lineages became a fourth builder field, and the plan's own acceptance criterion is what decided it

The plan recommends the build **absorb** the lineage and ancestry choices — Drow/High/Wood,
Forest/Rock, three fiendish legacies, ten draconic ancestries, six giant ancestries — on the grounds
that it is consistent with the archetype being one option per class.

**Its own acceptance criterion overrules that.** *"A Wood Elf moves 35 and a Human moves 30, from
species content rather than from a constant"* is unsatisfiable if Wood Elf cannot be chosen. So
`lineageKey` is a sixth stored selection, twenty-four lineages across five species, applied **after
the species and before the DM's overrides** — because *"your Speed increases to 35"* only means
anything against a printed 30, and because an override is still the final word.

Two consequences worth knowing. **A lineage grants no spell entry**: six of the eight lineage
cantrips are already on some class's spell list, so granting them would put two Fire Bolts on a
Tiefling Wizard, and the cantrip is named in the lineage's trait text instead. And **lineage keys are
unique only within a species** — `fire` is a giant ancestry and a fiendish legacy — which is safe
because every lookup takes the species and the key together.

#### Retiring Half-Orc was a DEPLOY blocker before it was a `TypeError`, and the layer precedent does not transfer

This is the most useful thing the milestone found, and neither half of it is in the plan.

**`convex/lib/species.ts` ended `SPECIES_BY_KEY.get(key)!`** under the comment *"Non-null:
`SpeciesKey` is derived from the same list, so an unknown key cannot exist."* That comment was true
when it was written and is the exact shape of a landmine, because a key being unconstructable *in new
code* is not the same as unconstructable: a character **stores** its species. `findClass` is the same
lookup with the same comment and its docblock records what happened when a class was retired against
it — a one-line edit turned `characters.list` into a `TypeError` **for the whole party**, not merely
for the character concerned. That pair had been one-fixed-one-not ever since. `species()` got the
`findClass` treatment **before** anything was retired rather than after.

⚠️ **And returning `null` is necessary and not sufficient, which only a real deployment could say.**
`npx convex deploy` **refused the push** — *Document … in table "characters" does not match the
schema* — over a character created months ago holding `race: "half-orc"`. **Convex validates existing
rows on a push**, so removing a literal from a stored union is a deploy failure long before it is a
lookup failure. The lookup is the second failure; the push is the first. Found by `npx convex dev`,
not by the type checker and not by 1711 green tests.

The fix is `storedSpeciesKeyValidator` — the nine plus every retired key — on
`storedTokenLayerValidator`'s pattern, second instance, one milestone later.

⚠️⚠️ **But that precedent does NOT transfer cleanly, and this is the paragraph to read before reusing
it a third time.** A layer had **two unions**: the wide one on the schema and the narrow one on
`board.addToken`'s argument, so a legacy value could be *stored* and not *created*. **A sheet has no
such split.** `characters.create` and `characters.updateSheet` take `storedSheetValidator` — the very
union the schema takes — so widening for the push widened the **write path** with it, and a brand-new
Half-Orc became creatable. `characters.test.ts`'s argument-boundary probe caught it: it expected a
bare `Error` from the validator and got a `NotDm` from the handler.

So the write-side refusal moved into **`storedSheetProblem`**, on the path every write already takes.
The rejected alternative was a second sheet union for arguments — **four validators instead of two**,
and two more places for a field to be added to one and not the other. The result at the table is what
the acceptance criterion asked for: a Half-Orc character created before this milestone opens, keeps
its name, class, level and hit points, renders its stored key rather than a blank, and cannot be saved
again until somebody picks one of the nine.

### The resource shape, and the reversal of the absorbed milestone's boolean-only design

The character-resources milestone that stood in this slot is **absorbed rather than cancelled**:
everything it planned is built here, because the 2024 rules contain all of it. Almost all of its
reasoning survives — one shape covering discrete uses, dice pools and point pools; *absent, never
zero*; the declaration optional on content with an allow-list test on both sides; a spend on the first
part a category offers and never twice for one cast; the spend after the dice are evaluated;
`convex/feed.ts` still reading no guarded table; and the band variant of the vitals payload still
having nowhere to put a number.

🚫 **One of its decisions does not survive contact with the SRD.** It said that a feature which
partially recovers on a short rest would be **written as long-rest**, deliberately, because expressing
partial recovery needs an *amount* as well as a period — which turns a boolean into a number and a
comparison into arithmetic.

That was a defensible reduction against a corpus where the pattern appeared **once**. In 2024 it is
**the normal case**: Second Wind, Wild Shape and Superiority-style pools all say *"regain one expended
use on a short rest, all on a long rest"*, so writing them long-rest-only would under-restore most of
the martial classes at every short rest in the game. **The resource shape therefore carries a maximum,
a recharge period, and an amount returned by the shorter rest.** The direction-of-error argument is
unchanged and is still the safety net; it is no longer the design.

`convex/lib/rest.ts` holds **one union doing two jobs** — which rest was taken, and the shortest rest
that fully restores a thing — because two unions over the same two members need a converter and drift
the day a third period arrives. `restores` is where the two readings meet, and ⚠️ **its `never` arm is
fail-*conservative*, not fail-closed, and must not be "fixed" to match `isMonsterSheet`.** Nothing here
guards a secret, so the question is which mistake a person can see and undo: restoring too little
costs one click on a counter anybody can edit, and restoring too much is the application handing out a
resource nobody asked for.

Three smaller decisions came with it. **`characters.shortRest` does not heal and does not return hit
dice** — spending hit dice is what a short rest is *for* — and both rests read their label and their
explanation out of `REST_LABELS`, with a test pinning the wording, because `HitDiceControls` once
shipped a button labelled *Long rest* that only returned dice and read as broken the first time
somebody pressed it at 1 hp. **`characters.setPerRest` becomes `characters.setUses` and takes a
count**, keeping the validate-a-spend-never-a-hand-back asymmetry. And `setPerRestSpent` is **deleted
rather than kept beside its successor**: two writers against one fact is how the legacy array and the
counted one would come to disagree, and with one writer `spentPerRest` only ever shrinks — which makes
the narrowing a deletion rather than a migration. `spentUsesOf` folds the legacy array in as *every key
is one spent use*, because a row written by an older deployment has to keep meaning what it meant.

**Divine Sense's *"a few times a day"* closes for free** — it is a 2014-ism that 2024 replaces with a
real number. **Shared pools stay open**, for exactly the reason the absorbed milestone gave: a
child-to-parent pointer is a reference to a resolver-minted id, and renaming the parent in content
orphans the children at the next level-up. Twelve archetypes instead of sixteen makes the exposure
smaller, not different.

### Death saves, which reverse a stated never

The absorbed milestone recorded death saving throws as **"never in scope"**. They are built here, and
they get their own paragraph rather than a line in a list, because a reversal that arrives inside a
feature branch is indistinguishable from one nobody noticed.

**Three successes and three failures is a counter.** Nothing decides whether the character dies: no
heal is refused, no health band is recomputed, nothing is announced to the feed, and no die anywhere
rolls differently. Three ticked boxes is three ticked boxes — the register of a condition pip and a
creature's loot, in the place everybody is already looking. The test that decided the four declined
gaps is the test this passes: *does something now change a number a player rolls against without a
person asking it to?* A tally that the person at the table ticks changes nothing at all.

Temporary hit points, heroic inspiration and a hero's **spell save DC and spell attack bonus** arrive
on the same terms. The two casting numbers are **pure accessors over a stored spellcasting ability**,
which is what makes the acceptance criterion — *a level 5 Cleric's sheet prints both, and neither
appears on any of the sixty sheets* — true by construction rather than by discipline. Resistances,
immunities, vulnerabilities and senses are labels: nothing computes damage, so nothing applies one.

Every field this adds to the schema is **optional**, and not one of them is optional because absence is
a meaningful state. They are optional because a schema push against a populated table fails otherwise
— the trap `games.status`, `speed` and `skillProficiencies` each hit in turn — so each is read through
exactly one accessor and the narrowing commit has one call site to simplify.

### Weapon mastery is a word, and its guard is narrower than the one it copies

Every one of the SRD's weapons carries exactly one of eight **mastery properties** — Cleave, Graze,
Nick, Push, Sap, Slow, Topple, Vex — and three of the eight name effects
[requirements.md](../requirements.md) excludes: **Push** shoves a creature ten feet, **Slow** reduces
its Speed by ten, **Topple** knocks it Prone. `convex/lib/mastery.ts` holds the eight strings, a
hand-spelled validator and a `Record` of labels that are **capitalised words with no effect
description on them**, and `SheetEntry.mastery` is an optional field refused on anything but a weapon.

**Nothing shoves, nothing halves a speed, nothing sets Prone, and no roll consults a mastery.** The
promise is held by `masteryGuard.test.ts` rather than by that sentence, on `markerGuard.test.ts`'
pattern: a grep of `convex/` for a quoted specifier plus a second sweep for the helper name, because a
module could import nothing and still reach the value through the accessor. ⚠️ **Its allow-list has
one entry where the marker guard's has three** — `./lib/sheet.ts`, the validator that stores one, the
accessor that reads it back and the arity rule that refuses it anywhere else — and the module it
exists to keep out is `convex/lib/dice.ts`, because the way this exclusion breaks is somebody writing
three reasonable lines that grant advantage for Vex, and a comment there would not stop them.

⚠️ **There is no `never`-arm switch in that file, and it is declined explicitly rather than
forgotten.** CLAUDE.md invariant 9's rule is *find the place a wrong answer does damage and make the
compiler refuse there*; for a mastery there is no such place, because a switch would be the first
module in `convex/` to **read** one. That is `TokenMarker`'s argument reaching a second vocabulary,
and the two `Record`s plus the guard are the whole of it.

**Casting time and concentration are the same register and are not even fields.** A spell prints
`Action · Concentration, up to 1 minute.` as the leading clause of its `text`, because the rulebook
prints it; nothing parses it, nothing drops a spell when its caster takes damage, and nothing counts a
bonus action. **ADR 0011's decision 5 stands.**

### The corpora, and four things generating them produced

183 spells (27 cantrips, and 57/57/42 at levels 1–3 — every spell a character capped at level 5 can
reach), 10 feats, 283 creatures. **The plan said 15 cantrips and 171 spells; the source says 27 and
183, counted twice**, and the plan's own instruction was to regenerate rather than trust its table.

**The mechanical half is generated and the prose is authored**, and the generated files say so at the
top of each of them. `scripts/srd/` reads the SRD from a path outside this repository and emits
TypeScript here; it lives in `scripts/` because that is the one directory outside both existing
sweeps by construction — `bundleGuard`'s needle is rooted at `/src` and `corpusGuard`'s at `convex/`
— and the price of that freedom is one new needle saying the directory is a dead end in the other
direction. Nothing imports it, no CI step runs it, and re-running it after a hand edit would discard
the edit.

⚠️ **`FEATS` going 16 → 10 is a SPLIT and not a deletion**, and it is the most useful line in the
plan's own table. Eight of the sixteen were never feats: Second Wind, Action Surge, Rage, Sneak
Attack, Divine Smite, Lay on Hands, Bardic Inspiration and Wild Shape are **class features**, which
belong on the library sheet for the level that grants them, where the number of uses can be exact. Six
more were genuine feats appearing in no SRD. What is left is the ten the SRD offers at levels 1–5 —
four Origin, four Fighting Style, two General. **`divine-smite` is the one key that did not retire but
MOVED**, because 2024 makes Divine Smite a level 1 Paladin spell.

**No migration was needed for any of that, and it is the copy-not-link design paying out at scale for
the first time.** A sheet holds a *copy* of a catalogue entry ([ADR 0005](0005-character-sheets-and-hit-point-secrecy.md));
so every character already carrying Rage still has Rage, with its text, its category and its dice. The
picker stops offering it and `catalogueEntry` answers `undefined` for the badge. **`lib/library/` is
linked and `lib/rules.ts` is copied**, opposite storage strategies, and this is the milestone where
that difference was worth the paragraph each file carries about it.

Four things building the corpora produced that reading the code would not have:

- ⚠️ **`entryId` mints a sheet entry's id from its NAME and deliberately ignores the index**, so that
  a challenge-rating shift — which rewrites the damage on every attack — does not renumber the list
  and make React read it as wholly replaced. Expanding a Multiattack into two `Rend` lines therefore
  gives both the id `atk:rend`, and `sheetProblem` refuses the **whole sheet**: **86 creatures failed
  at all ten ratings at once.** The repeats are named — `Rend`, `Second Rend`, `Third Rend` — which
  turns out to be the better sheet as well, since a DM can see that the creature attacks twice where
  the SRD only says so in a paragraph of prose. A *content* choice and a *validation* rule interacting
  across two files that do not mention each other, found by generating the corpus rather than by
  reading either.
- ⚠️ **`MAX_ENTRY_TEXT_LENGTH` stayed at 600, and spell prose is therefore paraphrased.** SRD spell
  text routinely runs past 600 characters, so a corpus that copied the source would have raised a
  bound **on every sheet in every game** to hold a paragraph nobody reads at the table. Paraphrasing
  keeps a second promise the bundle was already making in a new register: no SRD byte in the bundle,
  and now **no SRD prose either**. `lib/rules.ts` already did this on the record; this is the same
  decision at seven times the scale.
- ⚠️ **An excluded word was published through the one route that looked as though it could not.** The
  Bugbear Stalker's bonus action is called *Quick Grapple* — a name, not a sentence — and the phrase
  banks written specifically to avoid movement-detriment vocabulary do not police names. `EXCLUDED_PROSE`
  applies the corpus test's own rule at generation time as a courtesy; **the test wins by
  construction** if the two ever disagree, which is why the enforcement is not in the generator.
- **`TAG_KEYS` gained Celestial and Fey**, the only two additions that list has ever taken. Twenty-two
  creatures in range are one or the other, and 2024 moved goblins, hobgoblins and bugbears out of
  Humanoid into Fey. Safe without touching a construction site because nothing builds a `Record` over
  `TagKey` — the opposite of `SkillProficiencies`, and the difference is what a mistake costs: a
  missing skill is a wrong bonus on a sheet, a missing tag is a filter chip nobody pressed.

#### 24 keys retired, with a reason each, and a ledger that fails if one goes missing

A `bestiary` sheet is a **link and not a copy**, so a key that stops resolving costs a live creature
its hit points, armour class, attacks and labels **mid-session, silently**. Of the 129 previously
published keys, **105 still resolve** — 75 transcribed creatures kept their key through `KEY_ALIASES`
and all 30 authored ones were untouched — and the remaining 24 are listed in
`convex/lib/bestiary/retired.ts` with a reason each: above CR 6, absent from SRD 5.2.1, or written for
this application and dropped with the hand-written corpus. `bestiary.test.ts` holds the ledger of all
129 and fails if one is neither resolvable nor listed.

**The thirty authored townspeople are the one part of the corpus with no SRD source at all** — the SRD
has no innkeeper — and are therefore the only entries checked against nothing but their own content
rules. Every file says which of the two it is at the top, because *which creatures were checked
against what* is the first question anybody auditing this will ask.

#### `SPELLS` is now bigger than a sheet, which is a first

**183 spells against `MAX_SHEET_ENTRIES` of 40**: this is the first corpus in the project that cannot
be taken onto a sheet wholesale. Nothing breaks — a character was never going to hold every spell —
but two things follow that the picker's design did not have to think about before. The catalogue is
**browser-shared on purpose** — `src/` imports `FEATS` and `SPELLS` from `lib/rules.ts`, because a
copy means the picker has to hold the thing being copied — so **the corpus that grew 7× is the one
corpus `bundleGuard` was never written to keep out.** It confines `lib/library/`, `lib/bestiary/`,
`lib/resolve.ts` and `lib/dice.ts`, and `lib/rules.ts` is not on that list and cannot be, which is
worth knowing before anybody reads the guard as covering *the content*. And a picker over 183 rows is
a different interaction from a picker over 24; that is the panels branch's problem, named here so it
is not discovered there.

### ⚠️ The field-by-field rebuild trap, sixth outing, by a route it had not used before

CLAUDE.md records this firing on `skillProficiencies`, `speed`, five NPC fields and `group`, and that
**only `npm run test:smoke` has ever caught it.** This milestone adds five optional fields and
rebuilds two entire corpora through the same entry normaliser, so the smoke assertions were written
**before** the content — every new optional field has one sheet or entry carrying it and one carrying
none, across all four stored kinds.

**The interesting failure was none of those.** Two `lineageKey` lines landed in one rebuild, from two
branches that could not see each other, and **the later and weaker one won** — so a blank key was
stored as `'   '`. That is the trap by a route it had not used before: not a field *forgotten*, but a
field written **twice with the wrong copy last**. The rebuild was correct on both branches; the merge
is where it stopped being.

Two other stale-fixture findings from the same class, both caught by the smoke script rather than by
1711 green tests: `ROGUE_SKILLS` listed thirteen flags where a resolved sheet now carries eighteen
(`firstDifference` reported `skillProficiencies.history: present on one side only`), and a `+ 1` at
four use sites meant *one species trait*, which a 2024 species is not — the Elf has five.

### 🚫 What was superseded, and what was not

⚠️ **This is the section to read before rebuilding anything.** Four records are superseded in part and
**every one of them keeps its machinery**. A reader who concludes that the override model, the
resolution order or the choke points were replaced will rebuild something that already works — so
each row says which column the change is in.

| Record | Superseded — **numbers and content** | Untouched — **machinery** |
| --- | --- | --- |
| [**0006**](0006-premade-character-library.md) | 72 sheets → 60; 8 races → 9 species; one trait each → up to five plus a lineage; a species applying an ability bonus → **none does**; archetype at level 2 → level 3; `ClassLibrary.base` as one sheet → a **level-indexed record**; speed defaulting to 35 → 30 | The **stored link plus override diff**; the **library → species → DM** ordering; resolution **synchronous and pure** behind the accessor that already existed; the library never reaching the browser; a **retired selection degrading rather than throwing**; per-rest state living in `characterVitals`; the **advisory** lock; and *optional field, one accessor, always populated on a resolved sheet* |
| [**0007**](0007-monster-bestiary-and-cr-scaling.md) | 129 entries → 283; **every value in the ten benchmark rows**; the four-skill cap → six; and *"a reduced sheet has nothing to derive from"* as the **reason** the five numbers are stored — they are stored now because the SRD **prints** them | The stored link + CR + override diff; the **three-layer order**; **ratio vs delta** columns; **offset preservation**; non-compounding **enforced by the validator's absences**; `reconcileHp`'s fraction rule and both its floors; `scalesWithCr` as an opt-in; **TypeScript not JSON**; social as a *variant* and not a third shape; `isMonsterSheet` as an **allow-list**; the three-module corpus allow-list |
| [**0011**](0011-announcing-a-roll-rather-than-adjudicating-one.md) | Decision **1** (no spell slots); decision **2** (a hero now gets a spell save DC **and** an attack bonus); decision **4** (no per-key counts, no short rest) | Decisions **3** and **5**; **announce, do not adjudicate**; server-side evaluation held by `bundleGuard`; **a request names an identifier and never a number**; a feed row as a leaked **row** with no redacted variant; retention, bounded at the read |
| [**0005**](0005-character-sheets-and-hit-point-secrecy.md) | The reduced NPC sheet carrying **no ability scores** | **Both leak shapes and both guards**; the `characterVitals` split and its **subscription** argument; the four bands; `SheetEntry` shared across variants; the catalogue **copied** onto a sheet |
| [**0014**](0014-what-a-coin-says-about-itself.md) | **Nothing** | Both published stats and — the load-bearing half — **their scope**; one grammar for two callers |

⚠️ **ADR 0011's own amendment block forward-references "ADR 0015" for its two reversals, and that
number went to the fog milestone. This record — 0016 — is the reasoning it points at.** The pointer is
left in place there rather than corrected, per [the ADR convention](README.md); this sentence is what
closes the loop, and it is a small worked example of why that convention says to name the *feature*
rather than the number.

⚠️ **What did not move at all, stated because a reader of a 283-creature conversion will assume
otherwise.** Nothing about `maySeeCharacter`, `maySee`, `mayHearOf` or `boardCharacterAccess` changes.
**CLAUDE.md invariant 8's table gains no table, no reader and no predicate; invariant 9's union gains
no member; invariant 10's guards are true word for word.** Every guard keeps its exact meaning because
**none of them reads a rule** — they read a layer, a control grant and a document kind. A conversion
that changed one of them would be doing something other than converting. Every field this milestone
added is a **label on a DM-only sheet**, a number **the DM's own stepper moves**, or a count **a person
ticks**.

## Consequences

### Good

- **There is now an external answer to *is this number right?*** For the first time, every species
  trait, spell, feat, creature statline and benchmark row can be checked against a published document
  rather than against the rest of the corpus. ADR 0007's *"unverifiable by any test"* stops being a
  property of the design and becomes a property of the thirty authored townspeople alone.
- **The content is openly licensed and the repository says so.** SRD 5.2.1 is CC BY 4.0; the notice is
  in [README.md](../../README.md) and in [requirements.md](../requirements.md)'s amendment.
- **Two corpora were replaced with no migration and no schema push between them**, because a catalogue
  entry is copied and a species trait is resolved. Every existing character kept every number it was
  carrying.
- **A whole rule set changed and no security surface did.** Nine species, eighteen skills, 183 spells,
  283 creatures, a resource shape and a short rest, and the diff touches no choke point, no predicate
  and no leak-guard test.
- **`benchmarks.ts` is now measured against something.** Its rows are SRD medians, its three
  non-median cells each carry the argument for why, and two of ADR 0007's design shapes reappeared
  without being aimed at.
- **The vocabulary rename went first and alone**, which is what made every branch after it reviewable.

### Costs and constraints we are accepting

- ⚠️ **The migration is the load-bearing commit and it is the last one.** Every stored character
  points at a vocabulary that moved: a retired species key, one of eight retired archetype keys, a
  class with a different level table, an absent `speed` whose default changed under it, and catalogue
  copies whose keys may no longer exist. **A hand-built sheet needs nothing and a premade one changes
  under its owner** — both behaviours are correct, and the plan must say which characters get which.
- **A stored `race` key is now a `string` on the builder**, because a stored species may be retired.
  That is a widened type in the one place a narrow one would have been nicer, bought by a character
  that opens instead of a screen that throws.
- **`storedSheetValidator` is the write path and the schema at once**, so the write-side refusal for a
  retired species lives in `storedSheetProblem` rather than at the function boundary. It is one more
  check on a path that already runs, and it is one more place a future kind of stored selection has to
  remember to be refused.
- **The catalogue is 7× larger and it ships to the browser**, because a copy needs the thing being
  copied. `bundleGuard` keeps `lib/library/` and `lib/bestiary/` out and never covered `lib/rules.ts`.
- **A picker over 183 spells is a different interaction from a picker over 24**, and nothing in this
  milestone addresses it.
- **Eight archetypes and six feats are retired by name**, and a character holding one degrades rather
  than throwing. That is ADR 0006's *retired selection* branch, **reachable in anger for the first
  time** rather than hypothetically.
- **`SPEED_FEET`, `SUBCLASS_LEVEL` and the library are stale in the tree** as this is written,
  deliberately: 35, 2, and 72 sheets across 16 archetypes. The classes, the sixty sheets and the
  migration are what make them true, and anything read out of the code before those land is reading a
  half-converted application. ⚠️ The same applies to a handful of **docblocks that still say
  "thirteen skills"** where the list is eighteen — `lib/skills.ts`' header,
  `creatureSkillsValidator`'s and `bestiary/types.ts`' — and to `README.md`, which advertised a fixed
  35-foot speed until this record's own commit.
- **`preset.race` is still called `race` in the stored document.** `speciesKeyOf` answers
  `preset.species ?? preset.race`, which is the widen half of a rename that has not narrowed, and
  `storedSheetProblem` still reports its refusal at the path `race`. One more thing the migration
  owes.
- **Levels 6–20 are still out**, and the level cap is the scope lever the whole milestone rests on:
  extending it costs 12 sheets per level and reopens spell levels 4–9.
- **The thirty authored townspeople have no source**, and the corpus is now two kinds of content in
  one directory. Each file says which it is.
- **Nothing is adjudicated, and that is now a much larger promise.** No roll is compared to an armour
  class or a save DC, no damage is applied, no resistance is halved, no condition does anything, no
  mastery pushes anybody, no concentration breaks, no death save kills a character and no cast is
  refused. ⭐ **This is the line that made a full-ruleset conversion possible at all**, and it is
  ADR 0011's line unchanged: the application *announces and counts*, and the table *adjudicates*.

## Alternatives considered

Most of the interesting alternatives here were argued out in
[ADR 0006](0006-premade-character-library.md) and
[ADR 0007](0007-monster-bestiary-and-cr-scaling.md), and this milestone **re-declines them by
pointing rather than by re-arguing** — which is the point of having written them down. A conversion
seven times the size of the corpus that prompted them is the strongest evidence available that they
were right, and re-litigating each one here would suggest the decision was closer than it is.

- **A stored copy of a resolved sheet, or a `modifiedFields[]` list** — re-declined; ADR 0006's
  *Resolving once and storing the finished sheet* and ADR 0007's *A campaign copy with
  `modifiedFields[]`*. The link plus the diff is what let 60 sheets and 283 creatures replace 72 and
  129 with no migration.
- **The library or the bestiary as a Convex table** — re-declined; both records reject it, and the
  argument gets stronger with the corpus size, not weaker: a table makes `resolveSheet` async and
  rewrites nine call sites and two choke points.
- **JSON instead of TypeScript** — re-declined; ADR 0007's *TypeScript, not JSON*. A generated corpus
  makes the type checker's work larger, not smaller.
- **Resolving in the browser** — re-declined; ADR 0006. A second implementation of library → species →
  lineage → DM is a second thing to keep in step, and there are four layers now rather than three.
- **Backgrounds along with skills** — re-declined; ADR 0006's *Backgrounds along with skills*. The
  argument is unchanged and its conclusion is now the mechanism the conversion runs on. Adding
  backgrounds as an entity puts the second source of proficiency back on the day it lands.
- **A lock that actually holds, and experience points** — re-declined; ADR 0006, ADR 0002.

Three that are new to this milestone:

### Absorbing the lineage into the build — rejected

The plan's recommendation, and consistent with the archetype being one option. Rejected because the
plan's own acceptance criterion requires a Wood Elf, and a Wood Elf that cannot be chosen is not one.
The cost is a sixth stored selection and one more resolution layer.

### A second sheet union for function arguments — rejected

The clean way to keep a retired species storable and uncreatable: a wide union on the schema and a
narrow one on `characters.create` and `characters.updateSheet`, which is exactly what
`storedTokenLayerValidator` does for a layer. Rejected because a sheet union is **large**: it would be
four validators instead of two, and two more places for a field to be added to one and not the other —
paid on every future sheet field, to save one check on a path every write already takes.

### Deriving a creature's five pre-calculated numbers from its new ability scores — rejected

The plan calls this the milestone's one simplification. Rejected because `scaleCombat` measures a
creature's **offset** against precisely those five fields, so deriving them would not simplify the
scaler — it would delete it — and because the SRD **prints** all five, which is the rule the plan
itself supplies.
