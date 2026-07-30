import { useMutation, useQuery } from 'convex/react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

export type ClaimCharacterNoticeProps = {
  code: string
  playerId: Id<'players'>
}

/**
 * The way out of a lockout that tightening one default created.
 *
 * A player may only move the token of the character they are playing, and an
 * unattached token belongs to the DM — which is right, and stops the party shoving
 * the monsters around. But the board replaces the lobby once the DM presses Start,
 * and the character list lives in the lobby. So a player who arrives mid-session, or
 * who simply never got round to claiming, could move nothing at all and had no route
 * to fix it: the only remedy was the DM sending the whole table back to the lobby.
 *
 * Milestone 3's character sheet panel will subsume this, since claiming belongs next
 * to the sheet you are claiming. Until then this is the smallest thing that keeps the
 * stricter rule from being a trap, and it deliberately looks like a prompt rather than
 * a feature.
 *
 * Rendered only for a player with no character. The DM never sees it — they move
 * everything by holding the code, so there is nothing here for them to want.
 */
export function ClaimCharacterNotice({ code, playerId }: ClaimCharacterNoticeProps) {
  const characters = useQuery(api.characters.list, { code })
  const claim = useMutation(api.characters.claim)
  const action = useLobbyAction()

  // Undefined while the subscription is still resolving. Rendering the empty-handed
  // message first and then replacing it a frame later reads as a bug, so wait.
  if (characters === undefined) return null

  const free = characters.filter((character) => character.claimedByPlayerId === null)

  return (
    // Positioned by this component rather than by the slot it sits in. `Board`'s
    // children land in normal flow inside an `overflow-hidden` box, so anything that
    // does not take itself out of the flow is laid out under the canvas and clipped —
    // which is exactly what happened first time round. `ZoomControls` places itself
    // the same way, and the DM's panel takes the opposite corner.
    <Alert className="bg-background absolute top-3 left-3 z-10 max-w-sm shadow-md">
      <AlertTitle>You are not playing a character yet</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {free.length === 0 ? (
          <span>
            Every character in this game is taken. Ask whoever is running it to add one for you, or to
            hand one over.
          </span>
        ) : (
          <>
            <span>Pick one to play. You can only move your own character&rsquo;s token.</span>
            <div className="flex flex-wrap gap-2">
              {free.map((character) => (
                <Button
                  key={character._id}
                  size="xs"
                  variant="outline"
                  // Claiming refuses a character another seat already holds, so a
                  // second player tapping the same name at the same moment gets a
                  // message rather than quietly taking it (see characters.claim).
                  disabled={action.pending !== null}
                  onClick={() =>
                    void action.run(character._id, 'Could not claim that character.', () =>
                      claim({ code, playerId, characterId: character._id }),
                    )
                  }
                >
                  {character.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
