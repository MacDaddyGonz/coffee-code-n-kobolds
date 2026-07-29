import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
 *
 * TODO(wave-2): implement against the props above.
 */
export function NameGate(_props: NameGateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who are you?</CardTitle>
        <CardDescription>
          Use the same name each session and your character comes back with you.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Not built yet.</CardContent>
    </Card>
  )
}
