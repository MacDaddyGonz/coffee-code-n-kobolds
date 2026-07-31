import { useState } from 'react'
import { IdCardIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Id } from '@convex/_generated/dataModel'
import type { LobbyCharacter } from './lobbyTypes'

type LobbyAssignDialogProps = {
  seatName: string
  seatCharacterId: Id<'characters'> | null
  characters: LobbyCharacter[]
  busy: boolean
  onAssign: (characterId: Id<'characters'> | null) => Promise<boolean>
}

/**
 * The DM's forcing version of "play as this": any character onto any seat, taken
 * off whoever held it. Stands in for a select — there is no select primitive in
 * this shadcn set, and a list of rows has room for the current holder.
 */
export function LobbyAssignDialog({
  seatName,
  seatCharacterId,
  characters,
  busy,
  onAssign,
}: LobbyAssignDialogProps) {
  const [open, setOpen] = useState(false)

  const choose = (characterId: Id<'characters'> | null) => {
    void onAssign(characterId).then((done) => {
      if (done) setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Assign a character to ${seatName}`}
          title={`Assign a character to ${seatName}`}
        >
          <IdCardIcon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a character to {seatName}</DialogTitle>
          <DialogDescription>
            The character comes off whoever is holding it. Only you can do this.
          </DialogDescription>
        </DialogHeader>

        {characters.length === 0 ? (
          <p className="text-muted-foreground">
            There are no characters in this game yet. Add one below the roster first.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {characters.map((character) => (
              <li key={character._id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="w-full justify-between"
                  disabled={busy || character._id === seatCharacterId}
                  onClick={() => choose(character._id)}
                >
                  <span className="truncate">{character.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {character._id === seatCharacterId
                      ? 'already assigned'
                      : character.claimedByName
                        ? `with ${character.claimedByName}`
                        : 'free'}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={busy || seatCharacterId === null}
          onClick={() => choose(null)}
        >
          Leave {seatName} without a character
        </Button>
      </DialogContent>
    </Dialog>
  )
}
