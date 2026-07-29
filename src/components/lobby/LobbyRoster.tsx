import { useState } from 'react'
import { useMutation } from 'convex/react'
import { PencilIcon, UserMinusIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Dm } from '@/hooks/useDm'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_DISPLAY_NAME_LENGTH } from '@convex/lib/codes'
import { ConfirmDialog } from './ConfirmDialog'
import { LobbyAssignDialog } from './LobbyAssignDialog'
import { LobbyRenameForm } from './LobbyRenameForm'
import { LobbyRow, LobbyRows, LobbyRowSkeletons } from './LobbyRow'
import type { LobbyCharacter, LobbySeat } from './lobbyTypes'
import { useLobbyAction } from './useLobbyAction'

type LobbyRosterProps = {
  code: string
  playerId: Id<'players'>
  seats: LobbySeat[] | undefined
  characters: LobbyCharacter[] | undefined
  dm: Dm
  onRenameSeat: (displayName: string) => Promise<void>
  onLeaveSeat: () => Promise<void>
}

/** Who is at the table, in join order, and what each of them is playing. */
export function LobbyRoster({
  code,
  playerId,
  seats,
  characters,
  dm,
  onRenameSeat,
  onLeaveSeat,
}: LobbyRosterProps) {
  const removeSeat = useMutation(api.players.leave)
  const assignCharacter = useMutation(api.characters.assign)
  const action = useLobbyAction()
  const [renaming, setRenaming] = useState(false)
  const busy = action.pending !== null

  // useSeat owns our own rename, because the display name is this browser's
  // identity key (ADR 0003) and storage has to move with it.
  const submitRename = (displayName: string) =>
    action.run('rename', 'Could not change that name.', () => onRenameSeat(displayName))

  // useSeat owns the seat, so it does the leaving: it forgets the name and resets
  // its own state, which brings the name gate back without a reload.
  const leave = () => action.run('leave', 'Could not leave the game.', onLeaveSeat)

  const remove = (seat: LobbySeat) =>
    action.run(`remove:${seat._id}`, `Could not remove ${seat.displayName}.`, () =>
      removeSeat({ code, playerId: seat._id }),
    )

  const assign = (seat: LobbySeat, dmCode: string, characterId: Id<'characters'> | null) =>
    action.run(`assign:${seat._id}`, 'Could not assign that character.', () =>
      assignCharacter({ code, dmCode, playerId: seat._id, characterId }),
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>At the table</CardTitle>
        <CardDescription>
          Everyone who has joined, oldest seat first. New arrivals appear here on their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {seats === undefined ? (
          <LobbyRowSkeletons rows={3} />
        ) : seats.length === 0 ? (
          <p className="text-muted-foreground">Nobody is at this table yet.</p>
        ) : (
          <LobbyRows>
            {seats.map((seat) => {
              const isYou = seat._id === playerId

              return (
                <LobbyRow key={seat._id}>
                  {isYou && renaming ? (
                    <LobbyRenameForm
                      label="Your display name"
                      initial={seat.displayName}
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      busy={action.pending === 'rename'}
                      onCancel={() => setRenaming(false)}
                      onSubmit={submitRename}
                    />
                  ) : (
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{seat.displayName}</span>
                        {isYou ? (
                          <span className="text-muted-foreground text-xs">(you)</span>
                        ) : null}
                        {seat.isDm ? <Badge variant="secondary">DM</Badge> : null}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {seat.characterName ?? 'no character yet'}
                      </span>
                    </div>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {isYou && !renaming ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setRenaming(true)}
                      >
                        <PencilIcon aria-hidden />
                        Rename
                      </Button>
                    ) : null}

                    {isYou ? (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="ghost" size="sm" disabled={busy}>
                            Leave
                          </Button>
                        }
                        title="Leave this game?"
                        description={
                          'Your seat goes away and any character you hold becomes free. ' +
                          'Rejoining with the same name gives you a fresh seat.'
                        }
                        confirmLabel="Leave the game"
                        busy={action.pending === 'leave'}
                        onConfirm={leave}
                      />
                    ) : null}

                    {dm.dmCode !== null && !isYou ? (
                      <RosterDmActions
                        seat={seat}
                        dmCode={dm.dmCode}
                        characters={characters ?? []}
                        busy={busy}
                        pending={action.pending}
                        onAssign={assign}
                        onRemove={remove}
                      />
                    ) : null}
                  </div>
                </LobbyRow>
              )
            })}
          </LobbyRows>
        )}

        {seats !== undefined && seats.length === 1 ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Nobody else has joined yet. Give them the join code above.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

type RosterDmActionsProps = {
  seat: LobbySeat
  dmCode: string
  characters: LobbyCharacter[]
  busy: boolean
  pending: string | null
  onAssign: (
    seat: LobbySeat,
    dmCode: string,
    characterId: Id<'characters'> | null,
  ) => Promise<boolean>
  onRemove: (seat: LobbySeat) => Promise<boolean>
}

function RosterDmActions({
  seat,
  dmCode,
  characters,
  busy,
  pending,
  onAssign,
  onRemove,
}: RosterDmActionsProps) {
  return (
    <>
      <LobbyAssignDialog
        seatName={seat.displayName}
        seatCharacterId={seat.characterId}
        characters={characters}
        busy={busy}
        onAssign={(characterId) => onAssign(seat, dmCode, characterId)}
      />
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Remove ${seat.displayName}`}
            title={`Remove ${seat.displayName}`}
          >
            <UserMinusIcon aria-hidden />
          </Button>
        }
        title={`Remove ${seat.displayName}?`}
        description={
          `${seat.displayName} drops back to the name gate and has to rejoin. ` +
          'Any character they hold becomes free again.'
        }
        confirmLabel={`Remove ${seat.displayName}`}
        busy={pending === `remove:${seat._id}`}
        onConfirm={() => onRemove(seat)}
      />
    </>
  )
}
