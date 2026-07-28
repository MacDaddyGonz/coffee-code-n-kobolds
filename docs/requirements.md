# Coffee, Code n' Kobolds — Requirements

> Original requirements as captured at project inception. Kept verbatim in substance; formatted as
> Markdown for readability.

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
