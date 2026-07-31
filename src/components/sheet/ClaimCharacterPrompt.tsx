import { useMutation, useQuery } from 'convex/react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

export type ClaimCharacterPromptProps = {
  code: string
  playerId: Id<'players'>
  /** Only changes the wording. Claiming needs no DM code and grants none. */
  isDm: boolean
}

/**
 * The way out of a lockout that tightening one default created, now living where it
 * belongs.
 *
 * A player may only move the token of the character they are playing, and an
 * unattached token belongs to the DM — which is right, and stops the party shoving
 * the monsters around. But the board replaces the lobby once the DM presses Start,
 * and the character list lived in the lobby. So a player who arrived mid-session, or
 * who simply never got round to claiming, could move nothing at all and had no route
 * to fix it: the only remedy was the DM sending the whole table back to the lobby.
 * Milestone 2 shipped a standing alert on the board as the smallest thing that kept
 * the stricter rule from being a trap, and said the sheet panel would subsume it.
 * This is that — claiming a character belongs next to the sheet you are claiming.
 *
 * The one thing lost in the move is that an alert announces itself and a panel does
 * not, so `CharacterSheetPanel` labels its button "Play a character" while a seat
 * holds none. That is the whole of what keeps this discoverable.
 *
 * `characters.list` is asked **without** the DM code even when this browser holds
 * one, and that is deliberate rather than an oversight: a seat plays a hero, and
 * `characters.claim` refuses an NPC to everybody including the DM — so the list
 * without NPCs in it is exactly the list of things that can be picked up. Asking for
 * more would only be able to offer something the mutation would then refuse.
 */
export function ClaimCharacterPrompt({ code, playerId, isDm }: ClaimCharacterPromptProps) {
  const characters = useQuery(api.characters.list, { code })
  const claim = useMutation(api.characters.claim)
  const action = useLobbyAction()

  if (characters === undefined) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  const free = characters.filter((character) => character.claimedByPlayerId === null)

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-muted-foreground">
        {isDm
          ? 'You run this game by holding the DM code, so you do not need a character — but you can pick one up if you are playing as well.'
          : 'Pick one to play. You can only move your own character’s token, and this is where their sheet will be.'}
      </p>

      {free.length === 0 ? (
        <p className="text-muted-foreground">
          Every character in this game is taken. Ask whoever is running it to add one for you, or
          to hand one over.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {free.map((character) => (
            <Button
              key={character._id}
              variant="outline"
              className="justify-start"
              // Disabled from the last frame's data, which is not the guard: two
              // players tapping the same name at the same moment both reach the
              // server, and `characters.claim` refuses the second with the name of
              // whoever won rather than quietly handing the character over twice.
              disabled={action.pending !== null}
              onClick={() =>
                void action.run(character._id, `Could not pick up ${character.name}.`, () =>
                  claim({ code, playerId, characterId: character._id }),
                )
              }
            >
              {character.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
