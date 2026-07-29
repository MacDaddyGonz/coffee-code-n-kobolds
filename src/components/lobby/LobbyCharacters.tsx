import { useState } from 'react'
import { useMutation } from 'convex/react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

/** The characters in this game, in creation order, and who is playing each. */
export function LobbyCharacters({ code, playerId, characters, dm }: LobbyCharactersProps) {
  const createCharacter = useMutation(api.characters.create)
  const renameCharacter = useMutation(api.characters.rename)
  const claimCharacter = useMutation(api.characters.claim)
  const releaseCharacter = useMutation(api.characters.release)
  const removeCharacter = useMutation(api.characters.remove)
  const action = useLobbyAction()

  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<Id<'characters'> | null>(null)

  const busy = action.pending !== null
  // Narrowed once here, so the row callbacks close over the code itself rather
  // than handing it to a presentational component to hand straight back.
  const dmCode = dm.dmCode

  const add = () =>
    void action
      .run('create', 'Could not add that character.', () =>
        createCharacter({ code, name: newName }),
      )
      .then((done) => {
        if (done) setNewName('')
      })

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
          Anyone can add one. Characters belong to the game, so they are still here next session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {characters === undefined ? (
          <LobbyRowSkeletons rows={2} />
        ) : characters.length === 0 ? (
          <p className="text-muted-foreground">
            No characters yet. Add one below and anybody at the table can pick it up.
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
      <CardFooter>
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <Label htmlFor="new-character" className="sr-only">
            Character name
          </Label>
          <Input
            id="new-character"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={MAX_CHARACTER_NAME_LENGTH}
            autoComplete="off"
            placeholder="Add a character…"
            className="h-7 max-w-64"
          />
          <Button type="submit" size="sm" disabled={busy || newName.trim() === ''}>
            Add character
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
