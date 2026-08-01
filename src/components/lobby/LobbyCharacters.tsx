import { useState } from 'react'
import { useMutation } from 'convex/react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Dm } from '@/hooks/useDm'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'
import { LobbyCharacterDmActions } from './LobbyCharacterDmActions'
import { LobbyRenameForm } from './LobbyRenameForm'
import { LobbyRow, LobbyRowSkeletons, LobbyRows } from './LobbyRow'
import type { LobbyCharacter } from './lobbyTypes'
import { useLobbyAction } from './useLobbyAction'

type LobbyCharactersProps = {
  code: string
  playerId: Id<'players'>
  characters: LobbyCharacter[] | undefined
  dm: Dm
}

/**
 * The characters in this game, in creation order, and who is playing each.
 *
 * **This card no longer creates one, and that is a rule rather than a tidy-up.**
 * `characters.create` takes the DM code on every path, so the footer form that any seat
 * could type into would now only ever be refused — a control that cannot succeed is worse
 * than no control, because the refusal arrives from the network with nothing on screen
 * explaining it. Creating is the DM's, from the Sheets tab; what happens here is a player
 * picking up one of the characters the DM has made.
 *
 * The DM's per-row rename and delete stay. They are gated by the code in the same way and
 * they are the two things worth being able to do from the lobby, before anybody has opened
 * the board.
 */
export function LobbyCharacters({ code, playerId, characters, dm }: LobbyCharactersProps) {
  const renameCharacter = useMutation(api.characters.rename)
  const claimCharacter = useMutation(api.characters.claim)
  const releaseCharacter = useMutation(api.characters.release)
  const removeCharacter = useMutation(api.characters.remove)
  const action = useLobbyAction()

  const [renamingId, setRenamingId] = useState<Id<'characters'> | null>(null)

  const busy = action.pending !== null
  // Narrowed once here, so the row callbacks close over the code itself rather
  // than handing it to a presentational component to hand straight back.
  const dmCode = dm.dmCode

  const claim = (character: LobbyCharacter) =>
    action.run(`claim:${character._id}`, `Could not pick up ${character.name}.`, () =>
      claimCharacter({ code, playerId, characterId: character._id }),
    )

  const release = (character: LobbyCharacter) =>
    action.run(`release:${character._id}`, `Could not put ${character.name} down.`, () =>
      releaseCharacter({ code, playerId }),
    )

  const rename = (character: LobbyCharacter, name: string) =>
    action.run(`rename:${character._id}`, `Could not rename ${character.name}.`, () =>
      renameCharacter({ code, characterId: character._id, name }),
    )

  const remove = (character: LobbyCharacter, dmCode: string) =>
    action.run(`remove:${character._id}`, `Could not delete ${character.name}.`, () =>
      removeCharacter({ code, dmCode, characterId: character._id }),
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Characters</CardTitle>
        <CardDescription>
          The DM makes these; pick one up to play as it. Characters belong to the game, so they
          are still here next session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {characters === undefined ? (
          <LobbyRowSkeletons rows={2} />
        ) : characters.length === 0 ? (
          <p className="text-muted-foreground">
            No characters yet. The DM makes them, and they turn up here for anybody at the table
            to pick up.
          </p>
        ) : (
          <LobbyRows>
            {characters.map((character) => {
              const mine = character.claimedByPlayerId === playerId
              const takenByOther = character.claimedByPlayerId !== null && !mine

              return (
                <LobbyRow key={character._id}>
                  {renamingId === character._id ? (
                    <LobbyRenameForm
                      label={`New name for ${character.name}`}
                      initial={character.name}
                      maxLength={MAX_CHARACTER_NAME_LENGTH}
                      busy={action.pending === `rename:${character._id}`}
                      onCancel={() => setRenamingId(null)}
                      onSubmit={(name) => rename(character, name)}
                    />
                  ) : (
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{character.name}</span>
                      {takenByOther ? null : (
                        <span className="text-muted-foreground text-xs">
                          {mine ? 'you are playing this' : 'nobody is playing this yet'}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {mine ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Stop playing ${character.name}`}
                        onClick={() => void release(character)}
                      >
                        Release
                      </Button>
                    ) : takenByOther ? (
                      // Disabled from the last frame's data, so the server can
                      // still refuse a claim two people fired at once.
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="max-w-56"
                      >
                        <span className="min-w-0 truncate">
                          {character.claimedByName} is playing this
                        </span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        aria-label={`Play as ${character.name}`}
                        onClick={() => void claim(character)}
                      >
                        Play as this
                      </Button>
                    )}

                    {dmCode !== null ? (
                      <LobbyCharacterDmActions
                        character={character}
                        busy={busy}
                        removing={action.pending === `remove:${character._id}`}
                        onRename={() => setRenamingId(character._id)}
                        onRemove={() => remove(character, dmCode)}
                      />
                    ) : null}
                  </div>
                </LobbyRow>
              )
            })}
          </LobbyRows>
        )}
      </CardContent>
    </Card>
  )
}
