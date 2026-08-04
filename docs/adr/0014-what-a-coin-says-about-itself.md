# 14. What a coin says about itself

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

The milestone before this one made a coin something the DM could copy, place, label and
delete. Twenty minutes of actually running a table with it produced nine things — and seven
of them are polish in the ordinary sense: a control filed where nobody looks for it, a
circle too small to read, a name clipped at the zoom people play at, a menu entry that was
never wired up. Those are described where they were fixed and are not decisions.

Two are not polish, and this record exists for them. **One publishes a number this codebase
has withheld since the character sheets were built.** The other **widens the grammar that
CLAUDE.md invariant 10 calls the cap itself.** Both were put to the maintainer with the cost
stated, and both were chosen deliberately — which is the only door either of them gets to
come through, and is the same door
[ADR 0011](0011-announcing-a-roll-rather-than-adjudicating-one.md)'s two reversals came
through.

Two more are reversals of decisions recorded in code, small enough that nobody would think
to look for an ADR and consequential enough that the next reader should find one: a token's
name no longer being clamped to its own square, and the roll provider crossing a memo
boundary its own docblock warns against crossing.

## Decision

### 1. A creature's armour class and passive perception are published to everyone who can see its coin

This is the one that moves the threat-model line, so state exactly what moved.

**Before.** A creature's armour class reached no player, by any route. There are four
player-reachable payloads that could have carried it and none did: `characters.vitals`
(a discriminated union whose player-facing variant has no numeric member), `board.tokens`
(no sheet number of any kind), `characters.list` (monsters filtered out of a player's copy
entirely) and `characters.sheet` (gated by `maySeeCharacter`, which returns `null` for an
ordinary NPC — the same answer as *no such character*).
[ADR 0005](0005-character-sheets-and-hit-point-secrecy.md) uses *"`Ancient Red Dragon`,
armour class 22, with a breath weapon on it"* as **the** worked example of the row-shaped
secret. It was not an oversight that no player had it; it was the point.

**After.** Both numbers ride on `publicVitalsValidator`, on **both** members of the union,
so every player receives the armour class and passive perception of every creature they
already have a row for.

**What did not move, and this is the whole of why it is defensible.**

- `maySeeCharacter` is untouched. `characters.sheet` still refuses an ordinary NPC, so the
  attacks, the damage, the notes, the loot, the challenge rating and the hit points are
  exactly as unreachable as they were.
- `visibleVitals` still `continue`s past a creature the caller may not see **before** it
  assembles either variant. A GM-layer creature contributes no row, so it contributes no
  armour class; a fogged creature is dropped by `boardCharacterAccess`'s existing `continue`
  for the same reason. **The set of creatures a player hears about did not change** — only
  what a row for one of them says.
- The DM's number and the player's are the same number. There is no badge a DM sees and a
  player does not, which is what makes this a published fact rather than a second permission
  rule expressed as a missing circle.

`vitals.test.ts` and `board-smoke.mjs` each assert the scope directly, with a positive
control, because the scope *is* the argument: if the set of creatures a player hears about
ever widens, this badge starts announcing the armour class of the ambush.

#### Both variants, not `exact` only

The tempting narrower version is to put the two numbers on the `exact` variant alone. It is
wrong for what was asked. `exact` is what a hero and a *granted* creature get, so a party
would see their pet's armour class and not the goblin's standing beside it — which is not
"the number on the coin", it is an invisible permission rule that reads as a rendering bug.

#### The union's guarantee is intact, and the distinction is worth being precise about

`publicVitalsValidator` exists to make one mechanical promise: **the player-facing variant
has nowhere to put a hit point.** That promise is unchanged, word for word. `band` still has
no `current` and no `max`, and Convex still throws if a projection adds one.

A field present on **both** members is not a discriminator question at all — the union has
nothing to say about it, because both audiences get it. So this is not "the guard was
loosened"; it is "a published field was added, and the guard was never about published
fields". The test that pins it was rewritten to say so: it asserts that no member of the
band variant is a bare `float64`, which is precisely what `current: v.number()` would be,
and both new fields are `v.union(v.number(), v.null())`.

#### `null` is a real answer and must stay reachable

A hand-built goblin whose DM never recorded a passive perception has none.
`passivePerceptionOf` already refuses to answer 10 for that case, on the grounds that
printing 10 invents a statistic the DM never gave — and that argument is sharper now that
the answer is a blue circle on the board, because the table will act on it. Each badge is
omitted rather than defaulted.

Passive perception needed a new accessor to be askable at all: a hero's is **derived** from
Wisdom, the level and the Perception flag, all of which exist only on a `PcSheet`, and a
creature's is **stored** pre-calculated. `passivePerceptionFor` in `convex/lib/skills.ts` is
the one place both are answered, and it lives there rather than beside `passivePerceptionOf`
in `lib/sheet.ts` because that module imports only *types* from `skills.ts` — deliberately,
since `skills.ts` imports values from it. A function needing both can only sit on one side
without closing the loop.

#### The cost, stated honestly

Neither number is a new read: `visibleVitals` already calls `resolveSheet` per character for
the kind test and for `maxHp`. What they are is **sheet facts on a vitals channel**, and
that channel re-runs on every point of damage, per seat. So a hit re-pushes two constants
that change roughly never. The alternative is a sixth subscription in `useBoard` that idles
all session, and that is not worth a socket. This is worth knowing rather than worth fixing.

### 2. The dice grammar admits d2 and fifty dice

`ROLL_PATTERN` in `convex/lib/sheet.ts` is not a validation helper — CLAUDE.md invariant 10
says *"the die-count cap is load-bearing and is the grammar rather than a separate check"*,
and `MAX_ROLL_DICE`'s own docblock says *"the regex is the copy that decides… when one
moves, both move."* So widening it is a decision about that invariant and not a constant
bump.

The ask was an ad-hoc dice tray offering d2 through d100 and a 1×–50× count. Of the eight
faces only **d2** was new to the allow-list; the count is the part that matters.

**One grammar, not two.** The considered alternative was to leave sheet entries capped at 20
and give the ad-hoc roller its own wider bound. It was refused for the reason
`MAX_ROLL_DICE`'s docblock gives about its own two copies: two caps are two things that
agree on the day they are written. The consequence, which is the price and is stated rather
than discovered, is that **a sheet entry may now legitimately say `30d6`** — a monster's
damage expression is checked by the same regex as somebody typing in the tray.

**What is unchanged.** Nothing is adjudicated. The cap still exists and is still the
grammar; it is a different number. `MAX_ROLL_LENGTH` needed no change, because `50d100+CHA`
is shorter than `1d6+1+1+1…` was already allowed to be. Rejection sampling and
`crypto.getRandomValues` are untouched.

**The residual, and it is a rendering one.** The physics engine has **no die-count cap of
its own**, so raising the grammar raises the rigid-body count directly — fifty dice is fifty
bodies in cannon-es. If that turns out to be unusable the fix is a *renderer* cap that shows
a subset and says so in the feed line. It is **not** a second grammar, for the reason above.

### 3. A token's name is no longer clamped to its own square

Reversed, not corrected. The clamp was `nameHalfWidth = radius` with `ellipsis`, and its
argument is real and is kept in the code rather than deleted: before it, the box was about
two and a half squares wide and two coins standing next to each other overprinted their
names into an unreadable smear, with a huddle of six worse.

What it cost is the case people actually hit. At the zoom where a whole map fits, the coin
is small in *screen* pixels and the clamp is the coin's drawn width — so **every** name on
the board becomes an ellipsis and a letter. A board of `Gob…` `Gob…` `Gob…` is the same
information loss as an overlap with none of the width.

The overlap was chosen with that trade in front of it. **If it becomes intolerable the fix
is not to reinstate the clamp** — that is the arrangement this replaced. It is to show the
full name only for the hovered or selected coin, which was offered as a third option and not
taken.

### 4. `RollProvider` crosses `RightPane`'s memo boundary

The roll modes moved onto the map, which forces the provider up to `GameShell` — and
`useRoll.ts` explicitly warns against exactly that: *"a context whose value is a fresh object
per render is fine inside that boundary and would be a disaster crossing it."*

It is safe here, and the reason is written into that docblock rather than left implied.
Both context values are `useMemo`'d on dependencies that move only on a human action, and
the two senders are stable for the session by construction (the refs the provider keeps). So
when the divider re-renders `GameShell` sixty times a second the memos return the same
objects and no consumer re-renders; and when the mode flips, the provider re-renders with an
unchanged `children` element reference, so React bails out and only consumers reconcile.

**The warning was right about the general case and is kept.** What changed is that this
particular value satisfies the condition the warning names, which is a different sentence
from the warning having been wrong.

## Consequences

- A player looking at a visible monster learns its armour class and its passive perception.
  Nothing else about it. This is the first time this project has published something it was
  deliberately withholding, and `docs/requirements.md` records it as the first amendment that
  lifts a **secrecy guarantee** rather than a rules exclusion.
- The threat model's line is unchanged in shape and moved by one act: *not sending a secret
  is nearly free, so it is required* still holds for every secret that has not been
  deliberately published. Read this as licence to ship other DM data to players and you have
  inverted it, exactly as ADR 0009's grant paragraph says.
- `ROLL_PATTERN` is the one grammar for sheets and for the tray, at 1–50 dice over eight
  faces. A future change to either is a change to both, on purpose.
- Coin detail appears at a slightly higher zoom, because the condition pips grew to match the
  new badges and `COIN_DETAIL_MIN_DIAMETER` is coupled to them by an assertion. The two sides
  of that assertion are now *equal* rather than slack, so the next person to enlarge a pip is
  told in the same commit.
- The coin's annotation scheme is six places rather than four, still disjoint by
  construction. There is no seventh obvious place, so a seventh annotation is a layout
  decision rather than a position to pick.
