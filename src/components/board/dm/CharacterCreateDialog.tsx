import { useMutation } from 'convex/react'

import { CreateDialog } from '@/components/board/dm/CreateDialog'
import { api } from '@convex/_generated/api'

export type CharacterCreateDialogProps = {
  code: string
  /** Present means this browser holds it; `characters.create` re-verifies it. */
  dmCode: string
}

/**
 * A new player character: a name, and nothing else.
 *
 * **One field, deliberately, and the asymmetry with the creature dialog beside it is the
 * point.** A goblin is three numbers the DM wants on the board before the party finishes
 * opening the door, so that dialog asks for all three; a hero is a thing somebody spends
 * an evening building, and every part of that building happens on the sheet — the premade
 * library, the race, the level, the entries. Asking for an armour class here would be
 * asking the DM to guess at a number the player is about to choose.
 *
 * That asymmetry is now the *whole* of the difference between the two, which is what
 * `CreateDialog` exists to make visible: this component passes no `fields` and no
 * `problem`, and everything else — the state, the reset, the refusal line, the skeleton —
 * is shared rather than written out twice and left to drift.
 *
 * **This is the form that used to sit in the lobby's footer, and it moved rather than being
 * copied.** `characters.create` now takes the DM code on every path (there is no un-gated
 * branch left in it at all), so a control any seat could type into would only ever be
 * refused — and a refusal arriving from the network with nothing on screen explaining it
 * is worse than no control. Creating is the DM's; claiming is what the lobby and the Table
 * tab are for.
 *
 * `sheet` is left off the call rather than sent as a hand-built default. `characters.create`
 * fills in `defaultSheetFor('pc')` itself, and a second idea of what a blank hero is would
 * be a second thing to keep in step with the library.
 */
export function CharacterCreateDialog({ code, dmCode }: CharacterCreateDialogProps) {
  const createCharacter = useMutation(api.characters.create)

  return (
    <CreateDialog
      triggerLabel="New character"
      title="Add a character"
      description={
        <>
          It appears in everybody&rsquo;s list straight away, for whoever is playing it to pick
          up. Building one for a player who has not arrived yet? Add it, then hide it with the
          eye beside its row.
        </>
      }
      placeholder="Thorin"
      submitLabel="Add the character"
      fallbackError="Could not add that character."
      onCreate={(name) => createCharacter({ code, dmCode, name })}
      // Named because the next thing the DM does is tell somebody to pick it up, and the
      // toast is where the name they should say is confirmed.
      toastFor={(name) => `${name} is on the table. Anybody at it can pick the character up.`}
    />
  )
}
