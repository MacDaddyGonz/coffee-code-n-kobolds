import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SeatPicker } from './SeatPicker'

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
 * All of the substance is in `SeatPicker`, which lists the seats already in the game
 * with a "that's me" button before it offers a free-text field, so someone returning
 * after a cache clear rejoins their existing seat instead of typing `Mikey` where
 * they once typed `Mike` and leaving a duplicate behind. See ADR 0003.
 *
 * What is left here is the card, and that is the whole reason the split exists: the
 * landing page's join dialog asks the same question inside a dialog, where a second
 * card would be a box inside a box. This route is a page, so it keeps the frame —
 * `Game.tsx` hands it the same four props it always did.
 */
export function NameGate({ code, busy, error, onTakeSeat }: NameGateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who are you?</CardTitle>
        <CardDescription>
          Use the same name each session and your character comes back with you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SeatPicker code={code} busy={busy} error={error} onTakeSeat={onTakeSeat} />
      </CardContent>
    </Card>
  )
}
