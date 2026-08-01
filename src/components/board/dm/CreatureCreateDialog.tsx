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
import {
  CreatureSheetFields,
  creatureSheetFrom,
  creatureStatsProblem,
  defaultCreatureStats,
} from './CreatureSheetFields'

export type CreatureCreateDialogProps = {
  code: string
  /** Present means this browser holds it; `characters.create` re-verifies it. */
  dmCode: string
}

/**
 * A new creature by hand: a name, an armour class, a number of hit points, and whether
 * it is an NPC or a monster.
 *
 * One round trip, because `characters.create` takes the whole sheet. A character is
 * created bare and has its sheet filled in afterwards, and the difference is not an
 * inconsistency: a hero is a thing somebody spends an evening building, whereas a goblin
 * is three numbers the DM wants on the board before the party finishes opening the door.
 *
 * **The DM code is what makes this reachable at all.** `characters.create` demands it on
 * every path and checks it against the game document, so this dialog being on screen is a
 * consequence of holding the code rather than a substitute for it — CLAUDE.md invariant
 * 7. A player who posted the same arguments without the code would be refused by the
 * mutation, which is where the rule lives.
 */
export function CreatureCreateDialog({ code, dmCode }: CreatureCreateDialogProps) {
  const createCharacter = useMutation(api.characters.create)
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [stats, setStats] = useState(defaultCreatureStats)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setStats(defaultCreatureStats())
      action.clearError()
    }
  }

  const problem = creatureStatsProblem(stats)
  const busy = action.pending !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const done = await action.run(
      'create',
      'Could not add that creature.',
      () => createCharacter({ code, dmCode, name, sheet: creatureSheetFrom(stats) }),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    toast.success(`${name.trim()} is yours to run. Nobody else can see the sheet.`)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Build a creature
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build a creature</DialogTitle>
          <DialogDescription>
            The sheet is yours alone — the server refuses a creature to anyone without the DM
            code, with the same answer it gives for a character that does not exist.
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
              placeholder="Goblin archer"
              disabled={busy}
            />
          </div>

          <CreatureSheetFields stats={stats} onChange={setStats} disabled={busy} />

          {/* The typed-in problem and the server's refusal share this one line. They
              are the same sentence either way — `creatureStatsProblem` runs the
              mutation's own validator — so a second slot for one of them would only ever
              show the DM the same message twice. */}
          <FieldError message={action.error ?? problem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={name.trim() !== '' && problem === null}
            submitLabel="Add the creature"
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
