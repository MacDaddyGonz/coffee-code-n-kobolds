import { useId, useState } from 'react'

import { CodeInput } from '@/components/CodeInput'
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
import { Separator } from '@/components/ui/separator'
import type { Dm } from '@/hooks/useDm'
import { DM_CODE_LENGTH, MAX_RECOVERY_PHRASE_LENGTH } from '@convex/lib/codes'

type ElevateDialogProps = {
  dm: Dm
  /**
   * The recovered code is worth showing once, and the reveal cannot live here: a
   * successful recovery flips <DmBar> to its elevated branch, which unmounts this
   * dialog along with any state in it. The caller already holds the same code as
   * `dm.dmCode`, so this only says "one was just recovered".
   */
  onRecovered: () => void
}

/**
 * Takes the DM badge on this browser, by DM code or by recovery phrase.
 *
 * The two paths are one at a time rather than two fields in one form: whoever is
 * in here already knows whether they have the code or have lost it, and showing
 * both invites pasting the wrong secret into the wrong field.
 */
export function ElevateDialog({ dm, onRecovered }: ElevateDialogProps) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [lostCode, setLostCode] = useState(false)
  const [dmCode, setDmCode] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Neither secret should outlive the dialog it was typed into.
  function forgetInput() {
    setDmCode('')
    setPhrase('')
    setError(null)
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setLostCode(false)
      forgetInput()
    }
  }

  /** The two paths differ only in which call they make and what follows a success. */
  async function submit(
    event: React.FormEvent,
    attempt: () => Promise<string | null>,
    onSuccess?: () => void,
  ) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const failure = await attempt()
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    changeOpen(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          I'm the DM
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lostCode ? 'Recover your DM code' : 'Take the DM badge'}</DialogTitle>
          <DialogDescription>
            {lostCode
              ? 'The phrase you chose when you created the game hands the DM code back.'
              : 'The DM code was shown when the game was created. This browser will remember it.'}
          </DialogDescription>
        </DialogHeader>

        {lostCode ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => void submit(event, () => dm.recover(phrase), onRecovered)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-phrase`}>Recovery phrase</Label>
              <Input
                id={`${fieldId}-phrase`}
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                maxLength={MAX_RECOVERY_PHRASE_LENGTH}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                aria-describedby={error ? `${fieldId}-error` : undefined}
              />
              <p className="text-muted-foreground text-xs">
                Capitals and extra spaces don't matter.
              </p>
            </div>
            <FieldError id={`${fieldId}-error`} message={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setLostCode(false)
                  forgetInput()
                }}
              >
                I have the code after all
              </Button>
              <Button type="submit" disabled={busy || phrase.trim() === ''}>
                Recover the code
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => void submit(event, () => dm.elevate(dmCode))}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-code`}>DM code</Label>
              <CodeInput
                id={`${fieldId}-code`}
                value={dmCode}
                onChange={setDmCode}
                length={DM_CODE_LENGTH}
                placeholder=""
                aria-describedby={error ? `${fieldId}-error` : undefined}
              />
            </div>
            <FieldError id={`${fieldId}-error`} message={error} />
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                disabled={busy}
                onClick={() => {
                  setLostCode(true)
                  forgetInput()
                }}
              >
                I've lost my DM code
              </Button>
              <Button type="submit" disabled={busy || dmCode.length !== DM_CODE_LENGTH}>
                Take the badge
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
