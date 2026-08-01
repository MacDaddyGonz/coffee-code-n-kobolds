import { useMutation, useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'

export type TokenControlPanelProps = {
  code: string
  /** Present means this browser holds it; `board.setControllers` re-verifies it. */
  dmCode: string
  /** The coin being handed out. Absent from the panel entirely when there is none. */
  token: PublicToken
}

/**
 * Who else may drag this token, and — because control grants sight — who else may read
 * the sheet behind it.
 *
 * **The grant is of the token, not of the creature**, and the copy says so in as many
 * words. Control is stored on `tokens.controllerIds` and every rule that reads it starts
 * from a token: `requireMovableToken` refuses a drag, and `controlledCharacterIds` walks
 * *from the visible tokens* to the characters they are bound to. A second coin placed on
 * the same creature is a second thing to grant, which is the honest consequence of keying
 * the relation where the DM can see it rather than on a sheet nobody is looking at.
 *
 * ⚠️ **A grant on a DM-layer token reveals nothing, and that is correct rather than
 * broken.** Sight follows the token: `maySee` filters the DM layer out of a player's
 * payload before controllers are computed over what is left, so the player receives
 * neither the coin nor the sheet. The alert below says it because the alternative is a DM
 * ticking a box, watching nothing happen at the other end of the table, and concluding
 * the feature does not work.
 *
 * **That alert is the home of the standing fact, and it says all of it**: what a granted seat
 * is not sent — the coin, and with it the creature's sheet and its exact hit points — and
 * that the grant itself survives untouched rather than being revoked. Here rather than at the
 * layer control, because this panel is the one the DM's *Sheets* tab mounts on its own, where
 * nothing else on screen would ever say it. `TokenEditPanel` mounts this below its own layer
 * buttons and its alert there is deliberately the other half — the *act* of hiding a coin and
 * that the press reverses — so the two are on screen together without either restating the
 * other. Adding the standing half back to that one is how two alerts about one layer start
 * disagreeing.
 *
 * **Nothing here derives the rule.** `controllerIds` is the effective set and
 * `grantedPlayerIds` is exactly what is stored; the server sends both precisely so this
 * dialog can tell "granted" from "granted by playing the character" by comparing two
 * arrays rather than by re-implementing `effectiveControllersOf` in the browser — the
 * mistake ADR 0005 recorded in `useBoard`'s token → character walk. Every write goes back
 * as a modification of `grantedPlayerIds`, so the derived holder can never be
 * accidentally frozen into storage.
 *
 * The DM is not a row. Being the DM is holding the DM code (invariant 7), which is checked
 * on the request and is not a seat id in an array — so there is nothing here to tick, and
 * a sentence saying so is more honest than a permanently-checked box.
 */
export function TokenControlPanel({ code, dmCode, token }: TokenControlPanelProps) {
  // Exactly `{ code }`, matching `useSeat` and `Roster`: Convex keys a query by its
  // arguments, so the same shape is genuinely the same subscription over one socket.
  // Adding `dmCode` out of habit — the roster is public and nothing here is gated on it —
  // would make this a second subscription returning identical rows.
  const seats = useQuery(api.players.list, { code })
  const setControllers = useMutation(api.board.setControllers)
  const action = useLobbyAction()

  const busy = action.pending !== null

  function toggle(playerId: Id<'players'>, granted: boolean) {
    // ⚠️ Built from `grantedPlayerIds` and never from `controllerIds`. Writing the
    // effective set back would store the claim holder as an explicit grant, and the
    // relation would then survive the claim it was derived from — a hero reassigned to a
    // new player leaving the old seat still able to drag the token.
    const playerIds = granted
      ? token.grantedPlayerIds.filter((id) => id !== playerId)
      : [...token.grantedPlayerIds, playerId]

    void action.run(
      `grant:${playerId}`,
      `Could not change who controls ${token.name}.`,
      () => setControllers({ code, dmCode, tokenId: token._id, playerIds }),
      { report: 'field' },
    )
  }

  // The DM's own seat is filtered out rather than drawn as a ticked, disabled row: the
  // DM controls everything by holding the code, and a row implying it is a grant that
  // could be removed would be describing a rule that does not exist.
  const players = (seats ?? []).filter((seat) => !seat.isDm)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Controlled by
        </h3>
        <p className="text-muted-foreground text-xs">
          Who may drag <span className="font-medium">{token.name}</span>
          {token.characterId === null
            ? '. It carries no sheet, so there is nothing behind it to read'
            : ' — and read the sheet behind it'}
          . You control every token in the game by holding the DM code, so you are not on this
          list. The grant is of this token, not of the creature.
        </p>
      </div>

      {token.layer === 'dm' ? (
        // The *resting state* of a grant on a hidden coin, which is this panel's half of the
        // DM-layer copy — see the ⚠️ in the header. What is named depends on whether the coin
        // carries a sheet, for the reason the paragraph above varies: "and its exact hit
        // points" against an unbound coin is a consequence the DM cannot cause.
        <Alert>
          <AlertTitle>This token is on the DM layer</AlertTitle>
          <AlertDescription>
            Every grant below is stored exactly as you leave it and carries nothing while the
            coin is here. A granted seat is not sent the token
            {token.characterId === null
              ? ', and it stands for nothing, so there is nothing else they are missing'
              : ', the sheet behind it, or its exact hit points'}
            . Nothing is revoked and nothing needs re-ticking: move it to the player layer and
            everything ticked here takes effect in one write.
          </AlertDescription>
        </Alert>
      ) : null}

      {seats === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : players.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nobody else is at the table yet. Seats appear here as people join.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {players.map((seat) => {
            const granted = token.grantedPlayerIds.includes(seat._id)
            const controls = token.controllerIds.includes(seat._id)
            // In the effective set but not in the stored one: this seat plays the
            // character the token is bound to, so control comes with the claim and there
            // is nothing here to take away. The difference between the two arrays *is*
            // the derived half of the rule.
            const holder = controls && !granted

            return (
              <PickerRow
                key={seat._id}
                selected={controls}
                disabled={busy || holder}
                aria-label={
                  holder
                    ? `${seat.displayName} plays this character and always controls the token`
                    : granted
                      ? `Stop ${seat.displayName} controlling ${token.name}`
                      : `Let ${seat.displayName} control ${token.name}`
                }
                onClick={() => toggle(seat._id, granted)}
              >
                <span className="font-medium">{seat.displayName}</span>
                <span className="text-muted-foreground text-xs">
                  {holder
                    ? 'plays this character — always in control'
                    : granted
                      ? 'can move it and read its sheet'
                      : 'no control'}
                </span>
              </PickerRow>
            )
          })}
        </div>
      )}

      {/* Reported in the panel rather than as a toast: the rows stay on screen after a
          refusal, so there is something for the message to be about. */}
      <FieldError message={action.error} />
    </div>
  )
}
