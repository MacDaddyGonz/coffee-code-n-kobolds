import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Create a game: game name, your display name, DM recovery phrase (+ confirm).
 * On success, reveal the join code and the DM code with copy buttons and a
 * save-this-somewhere warning, then offer "Enter game".
 *
 * TODO(wave-2): implement. Contract: no props; calls api.games.create, stores
 * the returned dmCode with rememberDmCode() and the name with
 * rememberDisplayName(), then navigates to /game/:code.
 */
export function CreateGamePanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a game</CardTitle>
        <CardDescription>You run it. Everyone else joins with the code.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Not built yet.</CardContent>
    </Card>
  )
}
