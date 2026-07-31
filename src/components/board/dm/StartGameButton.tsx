import { useMutation } from 'convex/react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import type { PublicGame } from '@/hooks/useSeat'
import { api } from '@convex/_generated/api'

export type StartGameButtonProps = {
  code: string
  dmCode: string
  /**
   * Taken from the game payload's own type rather than re-spelled as a union. This
   * button is the only thing that writes the field, so it is the last place that
   * should be able to disagree with the server about what the values are.
   */
  status: PublicGame['status']
  /** Whether the game has an active scene. `games.start` refuses without one. */
  hasScene: boolean
}

/**
 * The switch between the lobby and the board, for everybody at once.
 *
 * `status` lives on the game document precisely so this is one write rather than a
 * message per client: everyone is already subscribed to the game, so they all turn
 * over together. That is worth saying on the button, because "start" reads like a
 * personal action and this one moves five other people mid-sentence.
 *
 * Only the return is behind a confirmation, and the asymmetry is deliberate.
 * Starting is what the DM came here to do and lands everyone somewhere useful;
 * returning yanks a table off a board they are playing on, so it earns a second
 * click. Nothing is lost either way — scenes, tokens and positions all survive, so
 * this is a view for the group rather than a reset.
 */
export function StartGameButton({ code, dmCode, status, hasScene }: StartGameButtonProps) {
  const start = useMutation(api.games.start)
  const returnToLobby = useMutation(api.games.returnToLobby)
  const action = useLobbyAction()

  const busy = action.pending !== null

  if (status === 'playing') {
    return (
      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            Back to the lobby
          </Button>
        }
        title="Send everyone back to the lobby?"
        description={
          'Everyone at the table leaves the board, not just you. The map, the tokens and where they are all standing are untouched, so starting again puts the game back exactly as it is now.'
        }
        confirmLabel="Everyone back to the lobby"
        confirmVariant="default"
        busy={action.pending === 'returnToLobby'}
        onConfirm={() =>
          action.run('returnToLobby', 'Could not return to the lobby.', () =>
            returnToLobby({ code, dmCode }),
          )
        }
      />
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={busy || !hasScene}
        onClick={() =>
          void action.run('start', 'Could not start the game.', () => start({ code, dmCode }))
        }
      >
        Start the game
      </Button>
      {/* The refusal is enforced server-side; this only spares the DM finding out by
          being told no. Saying which step is missing matters — a disabled button with
          no explanation reads as a broken app rather than an unfinished setup. */}
      <p className="text-muted-foreground text-xs">
        {hasScene
          ? 'Everyone at the table moves to the map together.'
          : 'Add a map and put it on the table first.'}
      </p>
    </div>
  )
}
