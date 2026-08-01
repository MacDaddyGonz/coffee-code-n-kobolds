import { useId, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { ProfileIcon } from '@/components/ProfileIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getLastDisplayName } from '@/lib/session'
import { api } from '@convex/_generated/api'
import { MAX_DISPLAY_NAME_LENGTH, normaliseDisplayName } from '@convex/lib/codes'
import { LobbyRow, LobbyRows, LobbyRowSkeletons } from './LobbyRow'

export type SeatPickerProps = {
  code: string
  /** A join is in flight. Everything goes dead rather than queueing a second. */
  busy: boolean
  /** The last attempt's failure, shown under the name field. */
  error: string | null
  /** Join or rejoin under this name. Idempotent server-side; the caller owns what follows. */
  onTakeSeat: (displayName: string) => void | Promise<void>
  /** Extra controls under the name field — a dialog's Cancel, for instance. */
  footer?: ReactNode
}

/**
 * Asks which seat this browser is: the seats already in the game, each with a
 * "that's me" button, and a free-text field underneath for somebody who has never
 * played here.
 *
 * **Seats first, name field second, and that order is the whole point.** ADR 0003
 * makes the display name the identity key and `players.join` idempotent on it, so
 * getting it slightly wrong is not an error — it silently creates a second, empty
 * seat, and the character you spent an evening on stays attached to the first one.
 * A free-text field at the top of the screen is an invitation to type from memory,
 * which is exactly how somebody types `Mikey` where they once typed `Mike`. Putting
 * the roster first makes the cheap, correct answer the one your eye lands on, and
 * demotes the field to what it actually is: the path for a genuinely new arrival.
 *
 * **It subscribes with exactly `{ code }` and nothing else.** `useSeat`, `Roster`,
 * `TableTab` and `TokenControlPanel` all hold `api.players.list` with those same
 * arguments, so Convex serves every one of them from one cache entry over one
 * socket. This screen used to hold a `players.listNames` subscription instead —
 * different arguments, therefore a second cache entry, a second socket and a second
 * server execution, for a strict subset of rows already on the wire. Adding an
 * argument here for any reason at all would recreate that.
 *
 * The sub-line is `characterName`, which `players.list` already resolves through
 * `playerCharacterNames` — a filter that withholds a creature's name and a reserved
 * character's name, and nulls `characterId` along with the name rather than beside
 * it. So the door names what each seat is playing without a second query and without
 * a second place a spoiler could ship from.
 *
 * **A bare fragment rather than a `Card`, and that is why `footer` exists.** There
 * are two callers with different chrome: `NameGate`, which is the in-game screen and
 * wraps this in a card of its own, and the landing page's join dialog, which is
 * already inside a dialog and needs a Cancel button beside the submit. Neither wants
 * the other's frame, so this component supplies neither.
 */
export function SeatPicker({ code, busy, error, onTakeSeat, footer }: SeatPickerProps) {
  const seats = useQuery(api.players.list, { code })

  const [name, setName] = useState(getLastDisplayName)
  const nameId = useId()
  const errorId = useId()

  const displayName = normaliseDisplayName(name)

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Already at this table</h2>
        <p className="text-muted-foreground text-sm">
          Played here before? Take your old seat — a name you have not used here starts a new,
          empty one.
        </p>
        {seats === undefined ? (
          <LobbyRowSkeletons rows={3} />
        ) : seats.length === 0 ? (
          <LobbyRows>
            <LobbyRow>
              <span className="text-muted-foreground text-sm">
                Nobody has joined yet — you will be first.
              </span>
            </LobbyRow>
          </LobbyRows>
        ) : (
          <LobbyRows>
            {/* Join order, oldest first — the server's own order, the same one the
                lobby roster and the board's seat strip print. Somebody looking for
                their own name is looking in the position they left it in. */}
            {seats.map((seat) => (
              <LobbyRow key={seat._id}>
                <div className="flex min-w-0 items-center gap-2">
                  <ProfileIcon name={seat.displayName} size="sm" />
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{seat.displayName}</span>
                      {seat.isDm ? <Badge variant="secondary">DM</Badge> : null}
                    </div>
                    {/* Copied verbatim from the lobby roster and the board strip,
                        wording included. Two spellings of one state is how they
                        drift, and this is the same state. */}
                    <span className="text-muted-foreground truncate text-xs">
                      {seat.characterName ?? 'no character yet'}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  // Verbatim from the name gate this replaced. The visible label is
                  // the same two words on every row, so the seat it belongs to has
                  // to be in the accessible name or the list is unusable without
                  // sight of the row it sits in.
                  aria-label={`That's me — take the seat called ${seat.displayName}`}
                  onClick={() => void onTakeSeat(seat.displayName)}
                >
                  That's me
                </Button>
              </LobbyRow>
            ))}
          </LobbyRows>
        )}
      </section>

      <Separator />

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || !displayName) return
          void onTakeSeat(displayName)
        }}
      >
        <Label htmlFor={nameId}>New here? Pick a display name</Label>
        <div className="flex items-start gap-2">
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            // The same constant the server rejects past, so the rejection is
            // unreachable through this field. It is a rejection and not a
            // truncation on purpose — see ADR 0003 on why a shortened name is an
            // identity collision waiting to happen.
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Mike"
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="max-w-64"
          />
          <Button type="submit" disabled={busy || !displayName}>
            {busy ? 'Taking your seat…' : 'Take my seat'}
          </Button>
        </div>
        {/*
          The error belongs under the field even when the failed attempt came from a
          "That's me" button, because there is nowhere else on this screen for it to
          go — and a join that failed is a join the person will retry by typing.
        */}
        <FieldError id={errorId} message={error} />
      </form>

      {/*
        Outside the `<form>`, deliberately. A `<button>` inside a form submits it
        unless it says otherwise, so a dialog passing its Cancel down here would take
        the seat on the way out — a trap that costs the caller nothing to fall into
        and everything to notice. It still renders under the field, which is all the
        slot ever promised.
      */}
      {footer}
    </div>
  )
}
