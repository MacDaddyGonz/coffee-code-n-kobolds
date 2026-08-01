import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Door } from '@/lib/joinDoor'
import { JoinDoorDialog } from './JoinDoorDialog'

/**
 * The way in to a game that is not in the list: type its code, then pick your seat.
 *
 * ⚠️ **Load-bearing rather than vestigial, now that `<GameList>` sits above it.** The
 * list is capped server-side at `MAX_GAMES_ON_LANDING` — thirty — and the dev
 * deployment already holds seventy-one games, so truncation is an ordinary state and
 * not an edge case. This card is what makes the cap costless: a game off the end of
 * the list is still perfectly joinable, because the join code was always the thing
 * that admits you and the list publishes none. It is also the only way in to a game
 * whose row you are not meant to be reading off a shared screen at all.
 *
 * **What it is now: the row's player door with the row's identifying step removed.**
 * It used to own a `getByCode` subscription, a verdict line, a code field and a name
 * field, and then navigate — which meant the one path left on this screen still asked
 * somebody to retype a display name from memory, the exact thing the seat picker
 * removed from both doors on the list. ADR 0003's whole mechanism for a cleared cache
 * is that `players.join` is idempotent on the normalised name, and that only helps
 * somebody who can *see* what they are aiming at. So the sequence here is `gameCode`
 * then `seat`, identical to the player door's, with the "new here, type a name"
 * fallback under the roster where `SeatPicker` already puts it.
 *
 * ⚠️ **The old argument for the two-field form was about `verdictOf`'s shape and it no
 * longer holds.** It said a code typed with no row had no `_id` for the wrong-game arm
 * to compare, so the dialog's steps did not fit. True, and the fix was to make that
 * comparison optional rather than to keep a second implementation of it: a row plus a
 * code is a claim that can be wrong, a code alone cannot be, and `verdictOf` now says
 * so in one place. What that duplication actually cost was wording — two of the three
 * sentences under this card's field were hand-copied from the dialog's code step, and
 * a reword there passed CI while leaving this card, on the same page, saying the old
 * sentence.
 */
export function JoinGamePanel() {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join with a code</CardTitle>
        <CardDescription>
          For a game that is not in the list — the code is all you need.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Not a second copy of the card's own title, which would be the same three
            words twice a centimetre apart. The title says what the card is for and the
            button says what pressing it does. */}
        <Button type="button" onClick={() => setOpen(true)}>
          Enter a code
        </Button>
      </CardContent>

      {/*
        ⚠️ **Its own instance rather than state hoisted up to `Home`.** `GameList` holds
        one of these too, and the tempting tidy-up is one dialog at the route with both
        cards reporting into it. Rejected on both counts it would have to earn: each card
        stays self-contained, and only one dialog can be open at a time *by construction*
        rather than by agreement, because each is opened by its own trigger inside its own
        card and neither can see the other's state. Hoisting would thread join state
        through a route component that currently holds none at all — `Home` is a header
        and three children — and would make two cards' business one component's.

        A closed dialog costs a `<Dialog open={false}>`: no step, no subscription and no
        typed code, because `DialogContent` is only mounted while something is open.
      */}
      <JoinDoorDialog opening={open ? CODE_ONLY_OPENING : null} onClose={() => setOpen(false)} />
    </Card>
  )
}

/**
 * The one opening this card ever makes: no row, and the player's door.
 *
 * A module constant rather than an object literal in the JSX so that the prop's identity
 * is stable across renders — nothing depends on that today, and a fresh object every
 * render is exactly the kind of thing a later `opening !== previous` check would be
 * quietly defeated by.
 *
 * ⚠️ **`player` and deliberately never `dm`, and the mechanism now supports both.**
 * `JoinCodeStep` no longer needs a row, so a *Run a game by code* button here is one
 * word and one `<Button>` away — and it is not being offered. A returning DM whose game
 * has fallen off the list can come in through this card as a player and elevate from
 * Settings, which ADR 0010 keeps precisely as the second door for a browser that has
 * lost its code; putting a code-only DM door on the front page is a decision about who
 * this site invites to try a DM code, and that wants a record rather than a keystroke.
 */
const CODE_ONLY_OPENING: { game: null; door: Door } = { game: null, door: 'player' }
