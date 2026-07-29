import { useId, useState } from 'react'
import { useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
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
import { LobbyRow, LobbyRows } from './LobbyRow'

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
          <FieldError id={errorId} message={error} />
        </form>

        <Separator />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Already at this table</h2>
          <p className="text-muted-foreground text-sm">
            Played here before? Take your old seat — a name you have not used here starts a new,
            empty one.
          </p>
          {seats === undefined ? (
            <LobbyRows>
              <LobbyRow size="compact">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
              </LobbyRow>
              <LobbyRow size="compact">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-24" />
              </LobbyRow>
            </LobbyRows>
          ) : seats.length === 0 ? (
            <LobbyRows>
              <LobbyRow size="compact">
                <span className="text-muted-foreground text-sm">
                  Nobody has joined yet — you will be first.
                </span>
              </LobbyRow>
            </LobbyRows>
          ) : (
            <LobbyRows>
              {seats.map((seat) => (
                <LobbyRow key={seat.displayName} size="compact">
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
                </LobbyRow>
              ))}
            </LobbyRows>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
