# 7. A monster bestiary, and scaling a creature by challenge rating

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

[ADR 0006](0006-premade-character-library.md) made a hero something you **choose**: pick a race and a
class, and 72 premade sheets supply everything else. It solved decision paralysis for the players and
left the DM exactly where they were — a monster was still a blank reduced sheet somebody typed an
armour class, a hit point total and three actions into, once per creature in the encounter. Preparing a
fight was eight forms.

So this milestone is the DM's half of that one: a corpus of finished creatures, picked rather than
typed. Three questions fall out of it, and the third was not in the original brief at all.

The first is **where the numbers live**, and it looks settled until you read what the source spec
actually asks for. [monster-library-spec.md](../monster-library-spec.md)'s Library Linking section wants
a **campaign copy** of each creature plus `libraryVersion`, `isModified` and `modifiedFields[]`, with
View Original, Compare Changes and Reset to Library Defaults built on top of them. That is precisely
the design ADR 0006 rejected for player characters, and `modifiedFields[]` is the tell.

The second is **what a reduced sheet can carry.** The spec asks for up to four skills and a passive
perception on every combat creature. A monster has no Dexterity, no Wisdom and no level, so
`skillBonus` and `passivePerception` in `convex/lib/skills.ts` have nothing to compute from.

The third arrived after the spec was written and is now the feature the milestone is really about.
**A DM who wants a Troll in front of a level 2 party should be able to say so**, rather than retuning
eight fields by hand and getting one of them wrong. That is a stepper, and a stepper that changes eight
numbers at once is a small feature with a large number of ways to be subtly wrong.

## Decision

### The spec's Library Linking section is overruled: a stored link and an override diff

A character stores a **fourth kind of sheet** — a bestiary key, a challenge rating and an optional
override diff — and `resolveSheet` turns it into an ordinary `NpcSheet` on every read. The same shape
ADR 0006 chose for a preset hero, for the same reason.

A stored copy **cannot tell the DM's numbers from the library's**, which is why the spec has to carry a
hand-maintained list of which fields somebody touched: a diff reconstructed after the fact because the
diff was thrown away at the moment of copying, and therefore a list that goes stale the first time a
write forgets to append to it. Keeping the distinction in the data instead means every feature the spec
wanted falls out rather than being built:

| The spec wants | Where it comes from |
| --- | --- |
| View Original | resolve the entry at its own rating with the overrides skipped |
| Compare Changes | the CR shift and the override object **are** the change |
| Reset to Library Defaults | return the rating, delete the override |
| `isModified`, `modifiedFields[]` | `overrides === undefined`, and its keys |
| Detect newer library versions | nothing to detect — the library ships with the code, so there is exactly one version and it is the deployed one |

The cost is the one ADR 0006 already accepted, restated because it now applies to the DM's content too:
**editing the library edits live creatures.** Correcting a goblin's damage die mid-campaign changes the
goblins in every game that already has one. That is the feature and the hazard in the same sentence,
and the two corpora now have opposite storage strategies for the third time — `lib/rules.ts` is
**copied** onto a sheet and safe to edit, `lib/library/` and `lib/bestiary/` are **linked** and are
not. The difference is invisible from inside any of the three files, so each says so at the top.

### A shifted rating is a *selection*, and resolution has three layers whose order cannot move

```
bestiary entry  →  CR scale  →  the DM's overrides
```

The rating is stored **beside the key, not in the override diff**. This is ADR 0006's rule applied to
the thing it was written for: level, class, archetype and race are selections and are changed by
changing them, and putting one in the override object as well is two ways to say the same thing and two
places for them to disagree. CR is to a bestiary creature exactly what level is to a preset hero — the
index the library is looked up at.

**The scale reads the entry's own baseline every time, never the previously scaled result.** So CR
3 → 6 → 3 returns the original sheet byte for byte. That is guaranteed **structurally rather than by
discipline**: `bestiarySheetValidator` has no `maxHp`, no `armourClass`, no `attackBonus`, no
`initiativeBonus` and no `saveDc` field, so there is nowhere on the document for a scaled number to be
persisted and used as the next shift's baseline. Non-compounding is enforced by the validator.

Two consequences of that worth stating separately, because they read like one guarantee and are two:

- **The sheet round-trips exactly.** `scaleCombat(entry, cr, cr)` is the identity — with both rows the
  same, IEEE-754 division of a value by itself is exactly `1.0` and subtraction of a value from itself
  is exactly `+0`, so every formula reduces to the identity on integer input. It is deliberately **not**
  short-circuited with `if (from === to) return combat`, because that would make the requirement true
  by construction and thereby make the test of it worthless — it would pass over an arithmetically
  broken scaler, which is the scaler the test exists to catch.
- **The vitals row does not.** Current hit points are reconciled by *fraction*, and a creature on 3 of
  200 scaled down and back up does not land on 3 again. That is lossy by design; see below.

**Overrides come last**, so a shift never undoes the DM's thumb on the scale — the same reason an
override survives a level-up. A boss-fight armour class somebody bumped stays bumped through a shift,
and a shift after an override changes every number *except* the one that was pinned.

### Scaling is a benchmark table that preserves each creature's deviation from its row

`CR_BENCHMARKS` holds one row per rating — 0, ⅛, ¼, ½, 1, 2, 3, 4, 5, 6 — carrying target hit points,
armour class, attack bonus, damage per round, save DC and a skill bonus. A percentage applied to the
numbers already on the sheet is the obvious implementation and is wrong twice over: it compounds across
repeated shifts, and it cannot express that hit points roughly quadruple from CR 1 to CR 6 while armour
class moves by three. Ten readable rows of tunable content can.

**`hp` and `damage` are ratio columns; `armourClass`, `attackBonus`, `saveDc` and `skillBonus` are
delta columns**, and which is which is not a matter of taste. Hit points span thirty-fold across the
table, so "tanky" means proportionally more meat and an additive transform would flatten a 4 hit point
CR 0 creature and a 10 hit point one into the same CR 6 creature. Armour class lives on a d20, where the
meaningful deviation is "+4 above its row" and never "×1.3" — multiplying would put a CR 0 creature at
armour class 17 up to 25, past anything a d20 can express.

**Preserving the deviation is what stops scaling homogenising the corpus.** A Tank sits above its row on
armour class and below it on damage; a Brute is the reverse. Reading absolute figures off the target row
would turn every CR 4 creature into the same statline wearing a different name, which is a worse outcome
than not having the feature. Because the additive columns are integers, the gap between two creatures at
the same rating is *exactly* invariant under scaling, which is what the test asserts.

**There is no initiative or passive-perception column, and that falls out of the arithmetic rather than
being a shortcut.** Both are additive against `skillBonus` and `10 + skillBonus`, and in an additive
transform the constant cancels: `pp_new = (10 + s_to) + (pp_old − (10 + s_from)) = pp_old + (s_to −
s_from)`. Initiative, passive perception and every skill bonus all take the same integer shift.

**Damage scales inside the existing roll grammar.** `1d6+2` becomes `2d6+4`, not a bare number the dice
evaluator would have to special-case, and the output has to satisfy `isValidRoll`. Die **faces never
change** — a d8 creature is a d8 creature, and swapping faces to dodge the twenty-dice cap would change
what the creature *is* rather than how big it is — so the count moves proportionally and the flat
modifier absorbs the remainder. The `damage` column is pinned so that CR 1 → CR 4 is exactly 2.0×, which
makes the spec's own illustration a literal test fixture rather than a hand-wave.

**A solo CR 6 creature read straight off the row dies in a round and a half** against a level 5 party —
120 hit points against about 80 a round. That is intended: the boss uplift comes from a Boss-role entry's
own deviation above the row, not from the row, because inflating `hp[6]` inflates every CR 6 mook with
it. It is written into the table's own comment, because it is exactly the "fix" the next tuner will
reach for.

### One exception to "abilities do not scale", and it is opt-in

The spec says a shift leaves special abilities alone. For almost every ability that is right — a Troll's
Regeneration is a *pace* rather than a payload, and doubling it would make a scaled Troll unkillable
instead of harder.

It is wrong for a dragon's breath weapon, which is most of what the dragon does. Frozen while the claws
scale, a CR 6 dragon stepped down to CR 2 reads as a tier-III threat and its first action still kills a
level 2 party. That is not a scaled creature, it is a mis-labelled one — and the feature exists so a DM
can scale *safely*.

So `BestiaryAbility.scalesWithCr` **defaults to off**, leaving the spec's rule as what happens when
nobody thinks about it, and the corpus test **refuses** an ability whose average damage exceeds its
rating's benchmark unless the flag is set. The rule is therefore not "abilities never scale" but "an
ability that is a payload scales; an ability that is a rule does not", and which of the two an ability
is, is checked by machine rather than remembered. Recorded as an addition to the spec rather than an
edit of it.

### Current hit points are reconciled by fraction, and the floor is load-bearing

`maxHp` is on the sheet and current hit points are in `characterVitals`
([ADR 0005](0005-character-sheets-and-hit-point-secrecy.md)), so the obvious use — scaling a creature
mid-session — would otherwise leave current above the new maximum or leave a full-health creature
reading `critical` the instant it was scaled up. `reconcileHp` preserves the **fraction**: a creature on
half its hit points is on half of the new maximum, and an untouched one stays untouched exactly.

Two rules in it are decisions rather than arithmetic. **A creature on 0 stays on 0**, branched before
any floor, because adjusting the difficulty of tonight's fight must not resurrect a corpse. And **a
creature with hit points left never lands on 0**: 1 of 200 scaled to a maximum of 20 rounds to zero, and
`healthBand` promises in writing that a creature which is alive is never `down`. The accepted cost at
the other end is that 199 of 200 rounds up to full, over-healing by a point; capping a hurt creature at
`newMax − 1` fixes that and breaks at `newMax === 1`, and a special case in a promise is not a promise.

**The fraction rule applies to the CR-shift path only, not to every sheet write**, and the distinction
is principled: a level-up is *growth*, where 5e adds the new hit points to current and keeping current
unchanged is closest to that; a CR shift is *rescaling the same creature*. One shared helper so the
arithmetic exists once, two callers choosing which question they are asking.

### Two numbers a reduced sheet has nothing to derive from are stored

`skills` — a **sparse list of skill → bonus**, not the thirteen booleans a hero carries — and
`passivePerception` are stored as pre-calculated figures, which is the same trade `initiativeBonus` made
and the second and third instance of it rather than a new decision. `attackBonus` and `saveDc` join them.

All five are `v.optional` on `npcSheetValidator`, and none is optional in the domain: a resolved
bestiary creature always has them. They are optional because **the `characters` table already holds
`npc` sheets without them**, and adding a required field to a populated table fails the schema push.
That is now the fourth occasion, so the treatment is a standing pattern: optional in the schema, one
accessor each, always populated on a resolved sheet.

The two skill shapes are **not interchangeable**, and `skillProficienciesOf` must not be repurposed for
the creature map. It is an ordered array of pairs rather than a record because Convex record keys cannot
be a union of literals — a record would accept a fourteenth skill and a misspelled `steath`, which is
exactly the guarantee `creatureSkillsValidator` exists to hold — and because display order matters and a
duplicate key is only a checkable condition if duplicates can be expressed.

### One attack bonus per creature, not one per attack

The spec asks for an attack bonus on each attack. It is stored once for the whole creature instead, and
the reason is not about the bestiary: an attack on a resolved sheet is a `SheetEntry`, the single shape
shared by a hero's feats, a hero's spells and a monster's actions. That sharing is what kept two sheet
variants from becoming two of everything and is why the dice work gets one roll path rather than a fork.
Widening it for a monster-only concern would also widen a type whose field-by-field rebuilds have twice
silently discarded a newly added field.

The cost, stated rather than hidden: a creature whose bite is more accurate than its claws cannot say so.

### `isMonsterSheet` is an allow-list, and the union widening is the dangerous part

Widening `storedSheetValidator` is additive and safe *only if the compiler names every site that
switches on it*. An adversarial audit of the obvious implementation found **three critical holes**,
each invisible to `tsc` because the expression type-checks perfectly against a fourth member:

- **`kindOf` failed open.** `sheet?.kind === 'npc'` answers `false` for a kind it has never heard of,
  which inverts `maySeeCharacter` — the whole of invariant 8's row-shaped guard. The chain was complete:
  `characters.list` without a DM code yields the creature's id and name, `claim` succeeds, and
  `characters.sheet` returns the full stat block including `notes`, which for a social NPC *is the plot*.
- **`characters.create` gated the DM check on the same expression**, so a player who knows the game code
  could create monsters with no DM code at all.
- **`updateSheet`'s monster-ness guard did too**, letting any client overwrite a hero's whole stored
  sheet with a three-field bestiary link — irreversibly, and making the character vanish from its own
  player's screen.

All three were the same fact spelled three times. They are now one predicate, `isMonsterSheet`, and it
is an **allow-list of the kinds that may be published rather than a deny-list of the ones that must
not be.** Adding a member to the union is the common operation; adding one to the *published* set has to
be the deliberate one. A `never` assignment in the default branch makes a fifth member fail
`npm run lint`, and the **runtime** default is `true` — fail closed — because a schema push is not
atomic and a document written by a newer deployment can be read by an older one.

### The picker is DM-gated, and the corpus never reaches the browser

The bestiary browser takes `dmCode` and re-verifies it server-side like every DM-only query. The
reasoning is `scenes.list`'s: the *library* is not a secret — a Monster Manual is a book anyone can buy
— but a list of what the DM has added to **this game** is twelve prepared monsters' worth of spoiler.

A DM-only index query returns the **summary** — key, name, category, rating, tier, role, tags, blurb —
and a stat block is only ever resolved server-side. The browser gets its filter vocabulary from
`lib/creatures.ts`, which is the counterpart of `lib/classes.ts`: eight role names, a tag list and a
rating label function, and no entry data ever. Two guards hold it, and they guard different things:
`bundleGuard.test.ts` keeps both corpora out of `src/`, and a new `corpusGuard.test.ts` confines them
*within* `convex/` — which is what keeps `resolveSheet` the only door to a stat block, so a future
module cannot read a creature's numbers around `maySeeCharacter`.

That allow-list has **three** entries rather than the two the design expected, and the third is the
interesting one. `characters.ts` imports `bestiaryEntry`, because `requireUsableSheet` has to answer
"is this the key of a creature that exists?" before a write and `lib/sheet.ts` — where every other
stored-sheet check lives — can never ask, since every function in that file also runs in the browser.
So the guard asserts **imported names and not merely importers**: one module may read a stat block, one
may resolve a summary, and one may ask whether a key exists. `characters.ts` reaching for the scaler or
a content file fails the build.

### TypeScript, not JSON — the spec's Output section is overruled

The spec makes JSON the single source of truth. The character library is typed TypeScript modules and
the type checker is doing real work there: a missing field, a malformed roll spec or a hit die that is
not one of `6 | 8 | 10 | 12` fails `npm run lint` before anything runs. JSON gets none of that and would
need a parser plus a runtime validator to arrive back at the same place, having lost editor completion on
the way. So the corpus is `convex/lib/bestiary/*.ts` behind a `types.ts`, and "generate Markdown from the
JSON if required" becomes a script over the typed corpus if anybody ever wants a printable list.

### Social NPCs are a variant, not a third shape

Occupation, three personality keywords, useful skills, what they know and an optional quest hook, with
**combat statistics only if the NPC is expected to fight** — so the combat block is optional on the entry
rather than the innkeeper getting a `kind` of their own. ADR 0005's whole discipline was that two sheet
shapes cost one shared entry type and no more; a third shape would spend that saving on the least
interesting creature in the corpus. It also makes an NPC who *is* expected to fight expressible, which is
what the spec asks for and is impossible if the innkeeper is a different kind.

The social block is **DM-only in its entirety**, and for a sharper reason than a monster's statline: what
the innkeeper knows *is* the plot. It rides the same document through `maySeeCharacter` and needs no new
guard.

## Consequences

### Good

- **A prepared encounter is a search and a click.** Filter to Tier III, add an Owlbear, and there is a
  creature on the board with an armour class, hit points, an initiative bonus, two attacks and Keen Smell
  without a number being typed.
- **One creature covers the whole party-level range.** The stepper makes ~130 entries behave like well
  over a thousand statlines, which is what makes the corpus's size a judgement rather than a ceiling.
- **The milestone added no read path and no security surface.** Resolution went behind the accessor that
  already existed, exactly as ADR 0006's did, so `maySeeCharacter`, `visibleVitals`, the health bands and
  `publicSheet` all still ask for a `CharacterSheet` and still get one. What it *did* add was three
  latent holes in the union discriminator, which is the part to remember: the cheap milestone was cheap
  everywhere except the one predicate.
- **Every feature the spec's Library Linking section wanted exists** without `libraryVersion`,
  `isModified` or `modifiedFields[]` being stored.
- **No exclusion in requirements.md was lifted**, so that file can still catch the code being wrong.

### Costs and constraints we are accepting

- **Editing the library edits live creatures.** Third time this trade appears in this codebase, and the
  first time it applies to the DM's own content.
- **An override pins the field it touches, through a shift.** That is what makes "the DM can always
  change this sheet" true, and it means a DM who overrode `maxHp` last week and steps the rating today
  will see hit points not move. The sheet says so — the banner reads `CR 3 → 5 · 1 field pinned` — because
  the alternative is a bug report.
- **"Original" now means two things**: the entry at its own rating, and the entry at the current rating
  without overrides. *View Original* has to say which one it is showing. That is the one genuine cost of a
  third resolution layer.
- **One attack bonus per creature**, as above.
- **A hand-built NPC cannot be scaled.** It has no benchmark row to deviate from, and inventing one by
  guessing at its rating would be a worse answer than a greyed-out control. The escape hatch is the same
  one-way door ADR 0006 gave a preset hero: save it as a plain `npc` sheet and it stops scaling, because
  it has stopped being linked.
- **The corpus is maintained by hand**, about 130 entries, and its balance is a judgement calibrated
  against `convex/lib/library/` rather than against published CR maths — which is defensible and is also
  unverifiable by any test. The tests check that a creature's numbers are *in range* and that scaling
  preserves its character; whether a CR 3 fight is fun is a question only a session answers.
- **The benchmark table is one curve for eight roles.** Scaling preserves a creature's offset from its own
  row, which keeps a Tank tanky, but it assumes every role's numbers grow along the same curve and a
  Spellcaster's probably does not grow like a Brute's. Ten rows is content that can be tuned in place;
  ten rows per role is eighty, and nobody has scaled enough creatures to know whether the single curve
  reads wrong.
- **A DM's tweak does not outlive the game it was made in.** An override is scoped to one character in
  one game, so the Ogre somebody made tougher last month has to be made tougher again.
- **Scaling a long way *down* leaves a creature disproportionately dangerous for its new rating.** The
  roll scaler floors the die count at one and never changes faces, so `2d10+4` stepped from CR 3 to CR 0
  becomes `1d10` — 5.5 average against a CR 0 row of 2. Hit points and armour class have no equivalent
  floor, so the creature arrives fragile *and* hitting well above its band. Absorbing it would mean
  swapping die faces, which is ruled out above for a better reason than this one is a problem, and the
  case only bites across four or five rows of the table at once, which is not what the stepper is for. It
  is pinned by a test rather than left to be rediscovered at a table.
- **Encounter metadata is stored and nothing reads it.** Deliberate, and the same bet roll specs took
  when they were validated a milestone before anything could evaluate one: adding a field to ~130
  hand-written entries later is ~130 edits, and writing it now is free.

## Alternatives considered

### A campaign copy with `modifiedFields[]` — rejected

The spec's own design, and rejected for the reason ADR 0006 rejected it for heroes: a stored copy cannot
tell the DM's numbers from the library's, so the diff has to be reconstructed by hand and maintained by
every write. The failure mode is not dramatic — it is one write forgetting to append, after which Reset
to Library Defaults quietly resets the wrong fields.

### A percentage multiplier instead of a benchmark table — rejected

The obvious implementation, and wrong twice: it compounds across repeated shifts unless the baseline is
re-read anyway, and it cannot express two different growth curves at once. Hit points quadrupling while
armour class moves by three is not something one multiplier describes.

### Reading absolute values off the target row — rejected

Simpler, and it destroys the corpus. Every CR 4 creature becomes the same statline wearing a different
name, at which point the role field is decoration and the scaling feature has made the bestiary smaller
rather than larger.

### The bestiary as a Convex table — rejected

Same call ADR 0006 made, and the roadmap named it as the single thing deciding what this milestone costs.
A table makes `resolveSheet` need a `ctx`, which makes it async, which makes both of ADR 0005's choke
points and nine call sites async. Content that ships with the code is versioned with it, reviewed with it
and never edited by a user; a table means seeding, migrating and eventually an editor nobody asked for.

### Scaling the number of attacks and the abilities themselves — rejected

A CR 6 version of a CR 1 creature does not acquire Multiattack, and a scaled Wolf does not lose Pack
Tactics. Deciding which abilities a rating deserves is a rules engine; the numbers are the part that
actually needed automating. The `scalesWithCr` opt-in is the narrowest possible exception to this and is
about an ability's *own number*, not about which abilities exist.

### Computing a creature's CR from its statistics — rejected

Note the line this draws against the feature that was built: the app **scales a creature to a rating the
DM picks** and never **works out what rating a creature is**. The first is a lookup in a benchmark table;
the second is the encounter-budget maths CR exists for in 5e, and it is the DM's judgement.

### A "scale to match my party" button — rejected

It would have to read the party's levels out of the character library and decide what a fair fight is,
which is an encounter generator with one control. The DM knows what their party can take; the stepper is
for acting on that, not for replacing it.

### A per-attack `attackBonus` on `sheetEntryValidator` — rejected

Defensible, and it would let the dice work roll a to-hit through the same path as everything else.
Rejected because it widens the one shape shared across a hero's feats, a hero's spells and a monster's
actions for a monster-only concern, and because that type's field-by-field rebuilds have twice silently
dropped a newly added field. Revisit it if the dice work wants a to-hit roll badly enough to pay for it.

### A record for a creature's skills — rejected

`v.record(v.string(), v.number())` is the obvious shape for a sparse map and gives away the one thing
worth having: Convex record keys cannot be a union of literals, so it would accept a fourteenth skill and
any key a client cared to invent. "Only the thirteen D&D Lite skills" is a rule that can be enforced
mechanically or not at all.
