import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Join a game: code (via CodeInput) and display name, prefilled from
 * getLastGameCode() / getLastDisplayName().
 *
 * TODO(wave-2): implement. Contract: no props; verifies the code with
 * api.games.getByCode before navigating so an unknown code reports itself here
 * rather than on the game screen, remembers the name, then navigates to
 * /game/:code.
 */
export function JoinGamePanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a game</CardTitle>
        <CardDescription>You will need the code from whoever is running it.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Not built yet.</CardContent>
    </Card>
  )
}
