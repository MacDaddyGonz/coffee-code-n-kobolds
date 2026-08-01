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
  /**
   * Called once **this seat's own claim has actually succeeded**, and for nothing else.
   *
   * It exists because picking a character up is not the end of the act — a character the
   * DM made is a blank `pc` sheet, and the race and class that turn it into somebody are
   * chosen on the Character tab. Somebody has to send the reader there, and the list
   * cannot: it has no idea it is inside a tab. So the caller says what "done" leads to,
   * which is `RightPane`'s `setTab('sheet')`.
   *
   * ⚠️ **Required, and it was optional.** There is one caller, it always passes one, and
   * the failure the optionality allowed is the exact bug this callback was shipped to fix:
   * a wire dropped anywhere along the two hops from `RightPane` would type-check and leave
   * a player on a list whose job is done, with no idea the race and class are somewhere
   * else. A hypothetical second caller with nowhere to send anybody can pass a no-op and
   * say so in one line; the compiler cannot ask about an argument nobody has to give.
   *
   * ⚠️ **Success only, and only for a claim.** `useLobbyAction.run` resolves `false` once
   * the refusal is on screen, so a claim two people fired at once must not move the
   * reader off the list that is explaining why they lost it. Release, rename and delete
   * do not fire it either, and neither does the DM's *assign* — that lives in
   * `LobbyRoster`, acts on somebody else's seat, and would be steering the wrong
   * browser's tabs even if it could.
   */
  onClaimed: () => void
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
export function LobbyCharacters({
  code,
  playerId,
  characters,
  dm,
  onClaimed,
}: LobbyCharactersProps) {
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

  // The boolean `run` already resolves is what gates the callback — the same shape
  // `RosterDmActions`' `onAssign` hands its dialog so it knows whether to close. Nothing
  // is inferred from the mutation's own return value: `claim` may be refused for reasons
  // this browser's last frame could not know about, and `run` is where that lands.
  //
  // The boolean is not handed back, unlike the three row actions below: the one call site
  // is `void claim(character)`, and a resolved value nobody reads is a promise somebody
  // eventually feels obliged to wire something to.
  const claim = (character: LobbyCharacter) =>
    action
      .run(`claim:${character._id}`, `Could not pick up ${character.name}.`, () =>
        claimCharacter({ code, playerId, characterId: character._id }),
      )
      .then((done) => {
        if (done) onClaimed()
      })

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
