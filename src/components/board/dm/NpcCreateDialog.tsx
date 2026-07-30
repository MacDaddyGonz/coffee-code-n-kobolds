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
import { NpcSheetFields, defaultNpcStats, npcSheetFrom, npcStatsProblem } from './NpcSheetFields'

export type NpcCreateDialogProps = {
  code: string
  /** Present means this browser holds it; `characters.create` re-verifies it. */
  dmCode: string
}

/**
 * A new monster: a name, an armour class and a number of hit points.
 *
 * One round trip, because `characters.create` takes the whole sheet. The lobby's
 * character form still creates a bare player character and fills the sheet in
 * afterwards, and the difference is not an inconsistency: a hero is a thing a
 * player spends an evening building, whereas a goblin is three numbers the DM wants
 * on the board before the party finishes opening the door.
 *
 * **The DM code is what makes this an NPC at all.** `characters.create` demands it
 * whenever the sheet's `kind` is `npc` and checks it against the game document, so
 * this dialog being on screen is a consequence of holding the code rather than a
 * substitute for it — CLAUDE.md invariant 7. A player who posted the same arguments
 * without the code would be refused by the mutation, which is where the rule lives.
 */
export function NpcCreateDialog({ code, dmCode }: NpcCreateDialogProps) {
  const createCharacter = useMutation(api.characters.create)
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [stats, setStats] = useState(defaultNpcStats)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setStats(defaultNpcStats())
      action.clearError()
    }
  }

  const problem = npcStatsProblem(stats)
  const busy = action.pending !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const done = await action.run(
      'create',
      'Could not add that NPC.',
      () => createCharacter({ code, dmCode, name, sheet: npcSheetFrom(stats) }),
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
          New NPC
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New NPC</DialogTitle>
          <DialogDescription>
            The sheet is yours alone — the server refuses an NPC to anyone without the DM code, with
            the same answer it gives for a character that does not exist.
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

          <NpcSheetFields stats={stats} onChange={setStats} disabled={busy} />

          {/* The typed-in problem and the server's refusal share this one line. They
              are the same sentence either way — `npcStatsProblem` runs the mutation's
              own validator — so a second slot for one of them would only ever show
              the DM the same message twice. */}
          <FieldError message={action.error ?? problem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={name.trim() !== '' && problem === null}
            submitLabel="Add the NPC"
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
