import { useId, useState } from 'react'
import { useQuery } from 'convex/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { getLastDisplayName } from '@/lib/session'
import { api } from '@convex/_generated/api'
import { MAX_DISPLAY_NAME_LENGTH, normaliseDisplayName } from '@convex/lib/codes'

export type NameGateProps = {
  code: string
  busy: boolean
  error: string | null
  onTakeSeat: (displayName: string) => Promise<void>
}

/**
 * Asks which seat this browser is. Shown when nothing is remembered for this
 * game — a first join, or a browser whose storage was cleared.
 *
 * The important part is the second half: it lists the seats already in the game
 * (api.players.listNames) with a "that's me" button, so someone returning after
 * a cache clear rejoins their existing seat instead of typing `Mikey` where they
 * once typed `Mike` and leaving a duplicate behind. See ADR 0003.
 */
export function NameGate({ code, busy, error, onTakeSeat }: NameGateProps) {
  const seats = useQuery(api.players.listNames, { code })

  const [name, setName] = useState(getLastDisplayName)
  const nameId = useId()
  const errorId = useId()

  const displayName = normaliseDisplayName(name)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who are you?</CardTitle>
        <CardDescription>
          Use the same name each session and your character comes back with you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy || !displayName) return
            void onTakeSeat(displayName)
          }}
        >
          <Label htmlFor={nameId}>Display name</Label>
          <div className="flex items-start gap-2">
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
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
          {error ? (
            <p id={errorId} className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>

        <Separator />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Already at this table</h2>
          <p className="text-muted-foreground text-sm">
            Played here before? Take your old seat — a name you have not used here starts a new,
            empty one.
          </p>
          {seats === undefined ? (
            <SeatRows>
              <SeatRow>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
              </SeatRow>
              <SeatRow>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-24" />
              </SeatRow>
            </SeatRows>
          ) : seats.length === 0 ? (
            <SeatRows>
              <SeatRow>
                <span className="text-muted-foreground text-sm">
                  Nobody has joined yet — you will be first.
                </span>
              </SeatRow>
            </SeatRows>
          ) : (
            <SeatRows>
              {seats.map((seat) => (
                <SeatRow key={seat.displayName}>
                  <span className="flex items-center gap-2 text-sm">
                    {seat.displayName}
                    {seat.isDm ? <Badge variant="secondary">DM</Badge> : null}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    aria-label={`That's me — take the seat called ${seat.displayName}`}
                    onClick={() => void onTakeSeat(seat.displayName)}
                  >
                    That's me
                  </Button>
                </SeatRow>
              ))}
            </SeatRows>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function SeatRows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-border flex flex-col divide-y">{children}</ul>
}

/** Fixed row height, so loading, empty and populated do not shift the card. */
function SeatRow({ children }: { children: React.ReactNode }) {
  return <li className="flex h-11 items-center justify-between gap-3">{children}</li>
}
