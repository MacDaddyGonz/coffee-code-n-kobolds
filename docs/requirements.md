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
