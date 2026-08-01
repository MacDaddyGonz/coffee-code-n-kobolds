import type { ReactElement } from 'react'
import { MapIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type MapPanePlaceholderProps = {
  /**
   * Which sentence to show, and nothing more. Whether the reader can actually do
   * anything about it is settled by the DM code on every mutation they attempt, so a
   * player who forced this to true would win a different paragraph and no powers.
   */
  isDm: boolean
  /** Who the table is waiting on, so a player is told a name rather than "the DM". */
  runBy: string
}

/**
 * What fills the left pane before the game starts.
 *
 * **This is what replaces the lobby as a screen**, and that is the thing to
 * understand about it rather than the words on the card. Everything the lobby did is
 * still here and is simply somewhere else: the roster is the seats bottom-right of
 * this very pane, the character list is the Table tab, map setup and Start are the DM
 * tools tab. So what is left for the middle of the screen is one sentence saying why
 * there is no map yet — and the roster drawn over this placeholder is deliberately
 * the same roster that will be drawn over the map a moment later, so the people at
 * the table do not appear, disappear and reappear somewhere else when the DM presses
 * Start.
 *
 * ⚠️ **Distinct from `BoardEmpty`, which answers a different question.** That one is
 * shown *inside* a running board when a scene's image blob has gone — a thing that
 * should never happen — and mistaking the two would either raise an alarm about a
 * game that simply has not started, or quietly report a lost map as though it were
 * the normal state of a table five minutes early.
 */
export function MapPanePlaceholder({ isDm, runBy }: MapPanePlaceholderProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon aria-hidden />
            {isDm ? 'Nothing on the table yet' : 'The game has not started yet'}
          </CardTitle>
          <CardDescription>
            {isDm
              ? 'The map appears here, on your screen and on everybody else’s at once.'
              : `${runBy} is running this game and has not started it.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          {isDm
            ? 'Add a map under DM tools → Map, put it on the table, then press Start the game.'
            : 'Everyone who is here is shown in the corner. The map will appear on its own — there is nothing you need to do or refresh.'}
        </CardContent>
      </Card>
    </div>
  )
}
