# Coffee, Code n' Kobolds — Requirements

> Original requirements as captured at project inception. Kept verbatim in substance; formatted as
> Markdown for readability. Where the build has since been allowed to differ, that is recorded in
> [Amendments to the rule set](#amendments-to-the-rule-set) below rather than folded into the text
> above.

## Concept

A web app to play games of **"Dungeons and Dragons Lite"** — a more basic form of the D&D 5e (2024)
rules. A combination of the **Roll20** game board and the **D&D Beyond** character sheet screens.

Intended to be played on a desktop browser, not a phone.

## DnD Lite rule set

Included:

- Stat checks
- Saving throws
- Armour Class
- Initiative
- 35 speed for all characters
- Hit points
- Hit dice
- Limited / basic list of feats and traits
- Limited / basic list of spells
- Turns consist only of 1 action, 1 bonus action and 1 reaction

Excluded:

- No racial abilities
- No skills from backgrounds / proficiencies
- No inventory — set equipment per character
- No movement-detriment status effects (prone, stand up, difficult terrain, etc.)

### Amendments to the rule set

> **Not part of the original.** The two lists above are as they were captured and are deliberately
> left that way. A spec quietly edited to match the code is a spec that can no longer catch the code
> being wrong, so a rule the build no longer follows is recorded here — with a date and a decision
> behind it — instead of being corrected upstairs.

#### Milestone 4 — 2026-07-31 — [ADR 0006](adr/0006-premade-character-library.md)

A library of 72 premade character sheets, chosen by picking a race and a class rather than by
filling in a form. Two exclusions could not survive it, and one inclusion became a default. Nothing
else on either list moved.

**"No racial abilities" — lifted.** Eight races exist (Human, Elf, Dwarf, Halfling, Half-Orc,
Tiefling, Dragonborn, Goliath), each with one trait that is always shown on the sheet. Five of the
eight change no number at all and are words on a page; three touch arithmetic — the Elf's +2
Dexterity, the Dwarf's extra hit point per level and the Goliath's extra 10 feet of speed. The
Human's and the Half-Orc's traits are spendable once per long rest and the app remembers whether
they have been, which is tracking rather than enforcement: no racial ability is adjudicated by the
software. Still excluded: subraces, racial languages and racial tool or weapon proficiencies. Race
is one dropdown with one trait behind it.

**"No skills from backgrounds / proficiencies" — half lifted, and the half matters.** Thirteen
skills now exist, each with a proficiency flag and a bonus derived from its ability and the
character's proficiency bonus. **Backgrounds are still excluded**, and that is the point of stating
it precisely: a proficiency comes from the character's *class* — from the premade sheet the class
supplies — and from the DM's override, and there is no third source. There is no background on a
character, no background list to maintain and nowhere for a second grant of the same skill to come
from. The exclusion that was lifted is "no skills"; the exclusion that stands is "no backgrounds".

**"35 speed for all characters" — now the default rather than the rule.** Speed is a stored field
on the sheet, absent on every character that has not been given a reason to differ, and read
through one accessor that answers 35 when it is absent. The reason it exists at all is the Goliath,
who moves 45. Every other character in the game still moves 35, and nothing offers a control to
change it — the DM's override is the only route to a different number.

**Equipment — no change, and worth saying so.** Each premade sheet carries a fixed kit as a line of
text ("chain mail, a shield, a longsword, two javelins…"). That is not a new inclusion sneaking
past the list: it is exactly what *"No inventory — set equipment per character"* already permitted.
There is no inventory model, no slots, no weights, no encumbrance and nothing to pick up or drop.

**Everything else on both lists stands**, and so does everything the lists never had to name:
backgrounds, inventory, multiclassing and experience points are all out, and the DM awards levels
rather than the app counting them. The exclusion of movement-detriment status effects in particular
is a live constraint rather than a stale one — two of the Battle Master's best-known manoeuvres,
Trip Attack and Pushing Attack, were left out of the library because of it, and their dice went to
manoeuvres that do the same job without knocking anybody prone.

#### The screen and the sheet taxonomy — 2026-08-01 — [ADR 0008](adr/0008-one-shell-and-what-a-sheet-entry-is.md)

Two amendments, and neither is to the rule set — which is why they are stated separately from the
one above. The first corrects a description of the **screen**; the second names a distinction the
spec always relied on and never wrote down.

**"Slide-out panel" — no longer true of either panel.** The *Game board screen* section above lists
the player character sheet panel and the DM panel as *slide-out* panels, and the *Player mode*
section says a player "can toggle the character sheet panel". Both are now **tabs in a persistent
right-hand panel**, beside the game feed and the DM's tools, with a draggable divider between that
panel and the map.

The reason is the feed. The spec asks for a game feed *and* a character sheet, and a player who
clicks a roll on their sheet is the one person at the table who cannot see the feed line they just
created — because the two now share a panel. That is a real cost, and it is paid deliberately: the
alternative is a third floating overlay competing with the map for the same corner. What buys it
back is the floating roll announcement over the map, which the dice work adds and which everyone
sees, including the person who rolled. So this is one requirement's presentation changed to make
another requirement work, rather than a preference.

Nothing in the lists of *what the panels contain* moved. The DM panel is still tabbed and still
holds what it held; the character sheet still shows a character sheet.

**A sheet item is one of three things, and the spec assumed it without saying so.** *"Clicking an
item on a character sheet sends the roll to the game feed"* is written as though every item has one
roll. Three do not behave that way: a **weapon** is a to-hit *and* a damage — two rolls — an
**action** rolls once, and a **passive** is declared and rolls nothing at all. Every entry now
records which it is, and a weapon carries its to-hit as a second field rather than as a sentence a
parser would have to find inside its description.

This is not a rule being added. Nothing is adjudicated with it, no roll is evaluated, and the dice
are still the next milestone's work — it is the spec's own sentence made precise enough to
implement, and the wording of the roll announcement is generated from it rather than written per
entry.

**Skills are listed alphabetically now**, thirteen of them, each annotated with its ability —
`Athletics (STR)` — rather than grouped under ability headings. The grouping made a reader learn
the grouping before they could find a skill; the annotation answers the same question in place.

#### Seats, sheets and control — 2026-08-01 — [ADR 0009](adr/0009-who-plays-what-and-what-control-grants.md)

Three amendments, and **none of them is a change to the rule set** — which is why, like the entry
above, they are stated apart from the Milestone 4 one. Nothing was added to the *Included* list and
nothing was lifted from the *Excluded* list. Two of these correct a description of the **screen**
and one records a consequence of [ADR 0002](adr/0002-defer-user-accounts.md) that the original text
could not have anticipated, because it assumed accounts. Nothing new is adjudicated, evaluated or
rolled.

**"Can only interact with and move their assigned character token" — widened, one deliberate act at
a time.** *Player mode* above says a player may move their own character's token and nothing else.
That is still the **default**, and it is still what a player gets without the DM doing anything. But
the DM may now hand any token to any seats, and a granted seat may move that token **and read the
sheet behind it, including its exact hit points**. The wolf the party is fighting alongside is the
case this exists for: a pet a player cannot damage is a sheet to look at. Two limits keep this from
being a hole rather than a feature. The grant is of the **token**, so a grant on a DM-layer token
shows a player nothing at all — the coin is absent from their board and the sheet is absent with it.
And it grants **sight and hit points, not authorship**: a granted creature is not a stat block a
player may rewrite. Everything the DM has *not* handed over is refused exactly as before, by the
same predicate in the same module.

**"When logged in, users can … Create a 'Character' (or many characters)" — in this version the DM
creates and players claim.** *Accounts and games* above describes character creation as something a
logged-in person does with their own characters, which presumes the accounts ADR 0002 declined. With
no accounts, the question of who may create one had to be answered some other way, and the answer is
the DM: `characters.create` requires the DM code on every path, for heroes, NPCs and monsters alike.
A player picks up an unclaimed character from the table instead. **This is a further consequence of
ADR 0002 rather than a new decision** — a character still belongs to the game and not to an
identity, the pointer still runs seat → character, and deleting every seat still leaves the
characters standing for somebody else to claim. Only the typing moved. A character may additionally
be **reserved** by the DM, which means absent from every player's payload rather than greyed out in
it: a disabled row still publishes a name, and for a character built for a player who has not
arrived yet, the name is the spoiler.

**The DM panel's five-tab list — no longer that arrangement.** *DM mode* above describes a tabbed
panel of *All player character sheets*, *All NPC character sheets*, *Token list*, *Modal image
library* and *Background music*. The first two were two views of one list and are now a single
selector, grouped into **Characters, NPCs and Monsters**, at the top of the DM's *Sheets* tab beside
the sheet it selects — with all three creation routes above it. The remaining three are unbuilt and
belong to the game editor, so the *DM tools* tab currently holds the map controls and nothing else.
**Everything the list said the DM can do, the DM can still do**; what changed is that the sheets are
no longer inside a tab named for the DM's plumbing. One further split falls out of the same
correction: **the DM does not play a character**, so where a player sees a *Character* tab the DM
sees the *Sheets* tab instead of it, not as well.

#### Getting to the table — 2026-08-01 — [ADR 0010](adr/0010-the-way-in-and-the-dms-coins.md)

Two amendments, and **neither is a change to the rule set** — nothing was added to the *Included*
list and nothing was lifted from the *Excluded* list. The first is the only entry in this section
that records something the application now **publishes**, which is why it is stated at length rather
than as a line. The second corrects a description of the **screen**. Nothing new is adjudicated,
evaluated or rolled, and no ADR is superseded.

**"Games are joined with a Game code" — still true, and no longer the only way to learn a game
exists.** *Accounts and games* below describes joining as an exchange of a code and nothing else, and
that was literally the whole of it: `games.getByCode` was a point lookup, there was no list query of
any kind, and a game you had made but whose code you had lost was unreachable. A landing page now
lists the **thirty most recently created** games — name, who created it, and when — with a *Join as
player* and a *Join as DM* button beside each.

⚠️ **The code still admits you, and that distinction is the whole of the change.** Choosing either
button asks for the game code first, so a row on the landing page says only that a game *exists*. The
join code is deliberately **absent from that payload** — printing it beside the name would make the
list a directory of open doors rather than a list of games — as is the DM code, the recovery salt and
the recovery hash, which are excluded by construction rather than by anybody remembering.

What is genuinely new is the audience. Before this, everything this application would tell you needed
a join code, and a join code is a bearer credential shared by everybody at one table. **After it, a
game's name, its creator's display name, its age and whether it is in play are readable by anybody who
loads the site with no credential at all.** The threat model in [CLAUDE.md](../CLAUDE.md) scopes that
rather than excusing it — the audience is a small group of trusted colleagues, and a game name is not
a secret the way a scene name or a creature name is — but it is recorded here because it is the first
thing this app has ever published without a code, and because the way that sort of thing arrives
unnoticed is behind a screen.

Two smaller consequences of the same page. A returning player now **picks their seat off a list**,
each row showing the character it holds, rather than retyping a display name from memory and hoping
the normalisation matches — which is [ADR 0003](adr/0003-player-identity-without-accounts.md)'s
idempotence made visible instead of merely true. And a returning DM enters their DM code **at the
door** and lands already elevated; the elevate and recovery controls stay in *Settings* as well,
because a DM whose browser loses its code mid-campaign needs a way in that is not a screen they have
already left.

**"A new player provides their name and selects their race and class" — the DM makes the character
and the player builds on it.** Read on its own, that sentence describes a player creating a character,
which the entry above has the DM doing. Both are true in the order they happen: the DM creates the
character, the player claims an unclaimed one from the table, and **then** chooses its race and class
on the sheet, which they may do for as long as it is unlocked. Nothing about who may *create* one
changed, `characters.create` still demands the DM code on every path, and no ADR was superseded to
make this work — the permission to choose a race and a class on an unlocked sheet was already there.

#### Rolls, the feed and the dice — 2026-08-02 — [ADR 0011](adr/0011-announcing-a-roll-rather-than-adjudicating-one.md)

**One amendment, and it is to the *Included* list rather than the Excluded one** — which makes it the
first entry in this section that narrows what the application does with a rule the spec asked for,
rather than lifting one it had ruled out. Everything else the dice work touched needed no amendment,
and the reason is worth stating: nothing new is adjudicated. A roll is evaluated and announced; no
result is compared to an Armour Class or a save DC, no damage is applied, and nothing decides whether
an attack hit. That is the same discipline the last three entries here record, for the fourth time.

**"Turns consist only of 1 action, 1 bonus action and 1 reaction" — the rule is played and the app
does not enforce it.** The *DnD Lite rule set* list above includes the turn structure, and it is the
one inclusion this application deliberately declines to adjudicate. Nothing stores whose turn it is,
nothing counts what a character has spent, and clicking two things in a round is refused by nobody.
The table keeps the turn, exactly as it keeps who is standing where before a map is loaded.

Stated here rather than left as an absence, because an absence reads as an oversight and this is a
decision: enforcing an action economy means knowing whose turn it is, which means an initiative
tracker that owns the round, which means the app adjudicating the one thing D&D Lite exists to leave
to the people at the table. The same reasoning covers **concentration**, which the lists never named
— no spell records it and nothing drops it.

⚠️ **Four neighbouring gaps were closed the same way and needed no amendment, because the lists never
promised them. Two of the four have since been reopened deliberately, so read the marks.**

- 🚫 **Spell slots** — *decision reversed; not yet built.* There are none anywhere today, and the
  level printed beside a spell is still a label rather than a resource. The character-resources
  milestone in [roadmap.md](roadmap.md) builds slot counting, and it lands with an amendment of its
  own in this section. **Do not read this bullet as a rule to preserve.**
- ✅ **Spell save DC** — still declined for a hero. A creature has one because the bestiary wrote
  one, and nothing in this application compares a roll to either.
- 🚫 **Limited-use abilities stay as coarse as they were** — *decision reversed; not yet built.*
  Today the app remembers whether a per-long-rest trait has been spent and counts nothing else, and
  there is no short rest. Same milestone, same amendment, same instruction.
- ✅ **Initiative** — needed nothing new at all: a hero's bonus comes from Dexterity and a creature's
  is stored, through one accessor that already existed.

⚠️ **The two reversals change what the app *counts* and not what it *adjudicates*, which is why they
are amendments rather than a change of character.** No roll is compared to anything, no cast is
refused, and casting at a higher slot level changes no die of damage. The turn structure above and
concentration are **not** reopened, and the reasoning that keeps them out is the reasoning that
survived: enforcing them means the app owning the round.

**Two smaller notes on the *screen*, neither a rule.** *"When a clicked sheet item involves a dice
roll, that character's token appears on screen for everyone and a 3D dice roll plays"* is met as
written — the announcement over the map carries the character's token art where the viewer can see
that token, and a deterministic tinted disc otherwise, because a roll can come from a creature with no
token or one this viewer may not see, and an announcement must never be the thing that reveals a coin
exists. And **"a red warning alarm"** on a critical failure is rendered as a red pulse and a screen
shake with no sound: audio would be the first asset this application serves itself, and it needs a
mute control and the browser autoplay dance to go with it.

#### DM tooling, layers and fog of war — 2026-08-02 — [ADR 0012](adr/0012-three-layers-and-a-fog-that-is-honest-about-itself.md)

**The first amendment in this section that *adds* a feature rather than lifting an exclusion**, and
that inversion is the reason it is here at all. Every entry above records a rule the build stopped
following. This one records a thing the build does that the specification never asked for, which is
the same hazard pointing the other way: a feature nobody wrote down is a feature nobody agreed to.

**Fog of war — added, and it appears nowhere above.** The DM blacks out rectangles of the map, and
what that hides is deliberately partial:

- **Real for tokens.** A creature standing inside a fogged rectangle is filtered out *server-side*,
  so a player is not sent its position, not sent its health band, and not sent the feed line saying
  what it just rolled. It is absent from their payload rather than hidden in their client, exactly as
  the GM layer already is.
- **Polite for the map.** The background image stays fully downloaded, so somebody reading devtools
  can recover the unfogged floor plan. Hiding that too means tiling or masking the map server-side,
  which multiplies storage against the 1 GB ceiling
  [ADR 0001](adr/0001-platform-and-hosting.md) accepts and complicates both zoom and calibration.
  The monsters were the secret, not the floor plan.
- **And it does not hide that a coin exists.** A player's token payload still carries a fogged
  creature's name and art; what fog takes is *where it is, how hurt it is and what it did*. That is a
  cost decision rather than an oversight, and it is why **the GM layer remains the tool for "must not
  be known about"** — that one is absolute, and fog is not.

⚠️ **This is the first guard this project has knowingly shipped incomplete**, so it is recorded in the
register the threat model in [CLAUDE.md](../CLAUDE.md) uses rather than described as finished. A
partial guard described as a whole one is worse than no guard, because somebody plans around it.

**The map layers are now built as written — with one word changed.** The *Map layers* section above
asks for Background, Player and DM, and until now only two of them existed; the third layer is built,
and a token on Background is seen by every player and movable by none of them. The stored value for
the third is `gm` rather than `dm`, Roll20's name for the same thing, because "DM" is the name of a
*person holding a code* everywhere else in this codebase and a layer sharing that word reads as one
only the DM may **see** rather than one only the DM may **touch**. Both are true of it; only one is
what the field decides. Nothing about the layer's behaviour differs from the section above.

**Two DM-mode bullets are now met and needed no amendment**, noted here only because their absence
from this entry would look like an omission: *"toggle an image from the game library into the modal
image pop-up… and close it for everyone"* and *"Background music — select from the game music
library"* are both in the specification already. The *libraries* they name are still the game-editor
milestone's, so an upload goes straight to use — which is what maps and token art have done since the
board existed. **The music selector broadcasts which track and nothing else:** no play, no pause, no
position, and nothing that records whether anybody is listening. Shared play state is a later
milestone, and a browser will not start audio without a gesture in any case.

**Nothing was lifted from the Excluded list, and nothing was added to the Included one.** Four
milestones in a row now. A layer is a permission, a rectangle is a region, a handout is a picture and
a track is a file — none of them is a rule, none is adjudicated, and nothing here changes a number a
player rolls against.

#### Tokens: copying, placing and labelling a coin — 2026-08-04 — [ADR 0013](adr/0013-a-coin-you-can-copy-place-and-label.md)

**One amendment, and it lifts nothing.** It is written down only because the exclusion it comes
closest to **names the words this milestone puts on screen**, and an entry that looked like a
lifting and was never recorded would be indistinguishable from one that quietly happened.

**"No movement-detriment status effects (prone, stand up, difficult terrain, etc.)" — stands exactly
as written.** A coin can now carry a fixed vocabulary of D&D conditions, drawn as small pips, set by
the DM or by whoever may drag that coin. Four of them — `prone`, `grappled`, `restrained` and
`paralyzed` — are named or implied by that exclusion, which is precisely why this paragraph exists.

What the exclusion rules out is the **effect**, and none of it is built:

- No speed is halved and no speed is read when a coin is marked. `speedOf` does not know markers
  exist.
- No advantage or disadvantage is granted, and no roll consults a condition. `lib/dice.ts` does not
  import the vocabulary and is forbidden from doing so.
- No drag is refused because of one. `requireMovableToken` gates *writing* a marker and never reads
  one.
- No health band, no save, no armour class and no sheet changes because a creature is prone.

What ships is the **word on the coin** — the same register as a bestiary creature's loot being a line
of text rather than an inventory, and as a spell's level being a label rather than a resource. It is
a note the table keeps for itself, in the place everybody is already looking.

⚠️ **That promise is held by a guard test rather than by this paragraph.** `markerGuard.test.ts`
greps `convex/` for a quoted import of the condition vocabulary and allows exactly three modules —
the schema that stores it, the one module that reads the table, and the two public functions. It
sweeps the helper names as well, because a module could import nothing and still reach the row
through the choke point. The reason it is a test and not a comment is that the way this exclusion
gets broken is somebody writing three reasonable lines in the dice module.

**`concentrating` is on that list too, and it touches a different declined decision.** The rolls
amendment above records concentration as **still declined** — *no field and no check, and nothing on
the sheet implies otherwise* — and that is unchanged: nothing records what a character is
concentrating on, nothing drops it when they take damage, and no spell knows the word. What exists is
a pip a person ticks and unticks, on a coin, for the same reason they might put a die on the table
next to a miniature. Named here so it is not later mistaken for the rule arriving.

**Nothing else moved.** A copy of a coin is a coin, a placement is a row saying which map something
stands on, and deleting a coin deletes a coin — the creature's sheet survives, and is deleted from
the Sheets tab. Nothing was added to the *Included* list, nothing was lifted from the *Excluded* one,
and nothing here changes a number a player rolls against. **Five milestones in a row.**

## Accounts and games

- Users create an account by providing an email address.
- Data is persisted by the web app (needs some sort of database).
- When logged in, users can:
  - **Create a "Game"** (used by DMs, the person that runs a game). This issues a **Game code**
    which players can join.
  - **Create a "Character"** (or many characters).
  - **Join a "Game"** using a Game code.
  - **Start a "Game"** — players join with their character, the DM joins to run the game.
- When a game is running, all players and the DM see the game board screen.

## Game board screen

Five primary components:

1. **Game map** — pannable visual of the game board with player and NPC tokens on it.
2. **Game feed** — chat panel showing the history of dice rolls and abilities performed.
3. **Player character sheet panel** — slide-out panel showing player character sheets.
4. **DM panel** — slide-out panel used by the DM to run the game.
5. **Game tools** — dice for ad-hoc rolls, ruler, and marker tools to draw on the map.

Plus a **modal image pop-up**, toggleable by the DM to show an image to the group (such as a
character they are currently describing).

When the players and DM are all in a started game they share this screen, and token movements sync
live across everyone's screens.

### Map layers

Lowest number is the bottom layer:

1. **Background layer** — generally where the map image is placed. Players can see it but not
   interact with it.
2. **Player layer** — players can see this and interact with tokens and certain objects on it
   (like doors).
3. **DM layer** — players cannot see or interact with this. The DM uses it to pre-position tokens
   and images, and transfers them to/from the player layer during the game (e.g. bringing in enemy
   NPC tokens).

### DM mode

- Can shift the currently visible game board (scene) to a different one in the library, for
  everyone in the game.
- Can toggle their screen between layers to move tokens and images on the map and between layers.
- Can move items between layers (tokens, images, etc.).
- Can move tokens on all layers, including any player tokens.
- Can use the multi-colour marker / eraser tool on the board.
- Can toggle an image from the game library into the modal image pop-up for the players, and close
  it for everyone when done.

**DM panel** — a tabbed panel with:

- **All player character sheets** — the DM can click items on a sheet to send rolls to the game
  feed (useful for rolling on behalf of a player).
- **All NPC character sheets** — added through the game editor; clickable to send rolls to the feed.
- **Token list** — added through the game editor; the DM can drag and drop new tokens onto the
  player or DM layer.
- **Modal image library** — to bring up the modal image panel.
- **Background music** — select from the game music library, added through the game editor.

### Player mode

- Can only see the player layer.
- Can only interact with and move their assigned character token.
- Can toggle the character sheet panel to see their own character sheet.
- Cannot use the multi-colour marker tool on the board.

### Both modes

- DM and players can toggle **advantage / disadvantage** when performing a roll, for both ad-hoc
  dice and character sheet rolls.
- Maps have a **grid**; tokens **snap** to the grid.
- Game tools allow ad-hoc dice rolls and use of the **ruler** to measure distance
  (1 square = 5 feet).
- Clicking an item on a character sheet sends the roll to the game feed automatically (similar to
  how D&D Beyond sends rolls to Roll20 via the browser extension). **Alt-click** sends the item's
  text description to the feed instead.
- When a clicked sheet item involves a dice roll, that character's token appears on screen for
  everyone and a **3D dice roll** plays showing the result. On a d20:
  - **Critical failure (1)** — shaking screen and a red warning alarm.
  - **Critical success (20)** — celebration screen and magical fireworks.
- **Character tokens** show a health bar above them with current/max health (e.g. `20/45`).
- **NPC tokens** show a health bar above them, but the numeric values are visible only to the DM.
  Players see the bar and can estimate the percentage, but not the exact numbers.
- Health bars have **+/- controls** to adjust health up and down easily. Current health can also be
  adjusted on the character sheet.

## Game editor (for DMs)

A game consists of:

- A library of game boards / maps
- A library of images (for the modal image pop-up)
- A library of tokens
- A library of NPC character sheets
- A library of music files (for the background music player)

Also:

- Can upload images for the maps and tokens.
- Tokens are round (like coins).
- Maps have a grid for tokens to move on; tokens snap to the grid.

## Character editor

For DMs on behalf of players, or for the players themselves. Can edit a character sheet.

## Admin dashboard

For the site owner, to manage:

- Accounts
- All games
- All characters
