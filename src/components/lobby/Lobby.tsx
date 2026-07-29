import type { Id } from '@convex/_generated/dataModel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Dm } from '@/hooks/useDm'

export type LobbyProps = {
  code: string
  playerId: Id<'players'>
  displayName: string
  dm: Dm
}

/**
 * The lobby: who has joined, and which character each of them is playing.
 *
 * Two live subscriptions — api.players.list and api.characters.list — so a
 * second browser joining, or claiming a character, appears here without a
 * refresh. That is the milestone's headline acceptance test.
 *
 * Owns the per-seat and per-character DM affordances too (assign a character to
 * a seat, remove a seat, delete a character), shown only when `dm.isDm`, and
 * passing `dm.dmCode` to the mutations that require it. Renders <DmBar> for the
 * game-level DM controls.
 *
 * TODO(wave-2): implement against the props above.
 */
export function Lobby(_props: LobbyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lobby</CardTitle>
        <CardDescription>Who is here and what they are playing.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Not built yet.</CardContent>
    </Card>
  )
}
