import { useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { FieldError } from '@/components/FieldError'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import {
  MAX_RECOVERY_PHRASE_LENGTH,
  MIN_RECOVERY_PHRASE_LENGTH,
  recoveryPhraseProblem,
} from '@convex/lib/codes'

type RecoveryPhraseDialogProps = {
  code: string
  dmCode: string
}

/**
 * Replaces the phrase that exchanges for the DM code.
 *
 * The old phrase is not asked for: holding the DM code is already the stronger
 * credential, and the server checks it. Validation goes through
 * `recoveryPhraseProblem`, the same rules the mutation applies, so the two never
 * disagree about whether a phrase is long enough.
 */
export function RecoveryPhraseDialog({ code, dmCode }: RecoveryPhraseDialogProps) {
  const setRecoveryPhrase = useMutation(api.games.setRecoveryPhrase)
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setPhrase('')
      setConfirm('')
      setError(null)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    const problem = recoveryPhraseProblem(phrase, confirm)
    if (problem) {
      setError(problem.message)
      return
    }

    setBusy(true)
    try {
      await setRecoveryPhrase({ code, dmCode, recoveryPhrase: phrase })
    } catch (thrown) {
      setError(errorMessage(thrown, 'Could not change the recovery phrase.'))
      return
    } finally {
      setBusy(false)
    }
    changeOpen(false)
    toast.success('Recovery phrase changed.')
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Change recovery phrase
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change recovery phrase</DialogTitle>
          <DialogDescription>
            This is what hands your DM code back if this browser ever forgets it. It replaces the
            phrase you set when you created the game.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-phrase`}>New recovery phrase</Label>
            <Input
              id={`${fieldId}-phrase`}
              type="password"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              maxLength={MAX_RECOVERY_PHRASE_LENGTH}
              autoComplete="new-password"
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              At least {MIN_RECOVERY_PHRASE_LENGTH} characters. Capitals and extra spaces don't
              matter.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-confirm`}>Type it again</Label>
            <Input
              id={`${fieldId}-confirm`}
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              maxLength={MAX_RECOVERY_PHRASE_LENGTH}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          <FieldError message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save phrase
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
