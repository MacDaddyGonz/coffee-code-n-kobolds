import { useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@convex/_generated/api'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'

export type CharacterCreateDialogProps = {
  code: string
  /** Present means this browser holds it; `characters.create` re-verifies it. */
  dmCode: string
}

/**
 * A new player character: a name, and nothing else.
 *
 * **One field, deliberately, and the asymmetry with the creature dialog beside it is the
 * point.** A goblin is three numbers the DM wants on the board before the party finishes
 * opening the door, so that dialog asks for all three; a hero is a thing somebody spends
 * an evening building, and every part of that building happens on the sheet — the premade
 * library, the race, the level, the entries. Asking for an armour class here would be
 * asking the DM to guess at a number the player is about to choose.
 *
 * **This is the form that used to sit in the lobby's footer, and it moved rather than being
 * copied.** `characters.create` now takes the DM code on every path (there is no un-gated
 * branch left in it at all), so a control any seat could type into would only ever be
 * refused — and a refusal arriving from the network with nothing on screen explaining it
 * is worse than no control. Creating is the DM's; claiming is what the lobby and the Table
 * tab are for.
 *
 * `sheet` is left off the call rather than sent as a hand-built default. `characters.create`
 * fills in `defaultSheetFor('pc')` itself, and a second idea of what a blank hero is would
 * be a second thing to keep in step with the library.
 */
export function CharacterCreateDialog({ code, dmCode }: CharacterCreateDialogProps) {
  const createCharacter = useMutation(api.characters.create)
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      action.clearError()
    }
  }

  const busy = action.pending !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const done = await action.run(
      'create',
      'Could not add that character.',
      () => createCharacter({ code, dmCode, name }),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    // Named because the next thing the DM does is tell somebody to pick it up, and the
    // toast is where the name they should say is confirmed.
    toast.success(`${name.trim()} is on the table. Anybody at it can pick the character up.`)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          New character
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a character</DialogTitle>
          <DialogDescription>
            It appears in everybody&rsquo;s list straight away, for whoever is playing it to
            pick up. Building one for a player who has not arrived yet? Add it, then hide it
            with the eye beside its row.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-name`}>Name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_CHARACTER_NAME_LENGTH}
              autoComplete="off"
              placeholder="Thorin"
              disabled={busy}
            />
          </div>

          {/* The server's refusal, in its own words. There is no client-side check to
              share the line with: the only rule about a name is `requireCharacterName`,
              which trims and bounds it, and the button below already refuses an empty
              one. */}
          <FieldError message={action.error} />

          <DialogFormFooter
            busy={busy}
            canSubmit={name.trim() !== ''}
            submitLabel="Add the character"
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
