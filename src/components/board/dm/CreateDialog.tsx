import type { ReactNode } from 'react'
import { useId, useState } from 'react'
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
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'

export type CreateDialogProps = {
  /** The button that opens it, which is what the DM reads on the toolbar. */
  triggerLabel: string
  title: string
  description: ReactNode
  /** The example name in the field. Not a label — the `Label` is always "Name". */
  placeholder: string
  submitLabel: string
  /** What the refusal reads when the server has no words of its own. */
  fallbackError: string
  /** The create call. Rejecting is how it fails, and the message is the server's. */
  onCreate: (name: string) => Promise<unknown>
  /** The success sentence, given the trimmed name. */
  toastFor: (name: string) => string
  /**
   * Whatever this caller collects besides a name, between the field and the error line.
   *
   * A function of `busy` rather than a node, because the two halves of that sentence
   * live on opposite sides of the boundary: the fields are the caller's and the
   * in-flight state is this component's. Passing `children` and leaving them live during
   * a submit is the version of this that looks fine until somebody edits an armour class
   * while the mutation carrying the old one is in the air.
   */
  fields?: (busy: boolean) => ReactNode
  /**
   * A reason the caller's own fields are not yet submittable. Shares the single error
   * line with the server's refusal — they are the same sentence either way, because a
   * caller computing one runs the mutation's own validator — and blocks submit beside
   * the empty-name test.
   */
  problem?: string | null
  /** Reset whatever `fields` owns. Called on every close, exactly as the name is. */
  onReset?: () => void
}

/**
 * A dialog that creates one thing from a name, plus whatever else that thing needs.
 *
 * **Extracted because there were two of these and they were written by different
 * hands.** `CharacterCreateDialog` and `CreatureCreateDialog` had the same import block,
 * the same `useMutation`/`useLobbyAction`/`useId` trio, the same `open`+`name` state, the
 * same `changeOpen`, the same `submit` shape and the same JSX skeleton down to the
 * `maxLength` — around ninety lines each, differing in the copy, one extra field set and
 * one extra error term. They had **already drifted**: one merged the typed-in problem
 * into the error line and the other, having no problem to merge, simply did not, which
 * is the shape a third copy would have inherited from whichever it was cloned from.
 *
 * One component with two thin wrappers rather than one component with a `variant`, and
 * the reason is what each side owns. Everything generic here is genuinely generic — a
 * name is bounded by `MAX_CHARACTER_NAME_LENGTH` whatever is being named — while the
 * creature's three stats are *state*, with a default, a reset and a validator, and a
 * `variant` prop would mean this file holding a creature's fields for a caller that does
 * not want them. `fields` and `onReset` are the whole of the seam.
 *
 * ⚠️ **`name` lives here and is handed to `onCreate`, untrimmed.** The trim is the
 * server's job — `requireCharacterName` bounds and trims it — and there is deliberately
 * no client-side rule to duplicate; the only trimming done here is for the toast, which
 * is repeating a name back at the DM rather than storing one.
 */
export function CreateDialog({
  triggerLabel,
  title,
  description,
  placeholder,
  submitLabel,
  fallbackError,
  onCreate,
  toastFor,
  fields,
  problem,
  onReset,
}: CreateDialogProps) {
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      onReset?.()
      action.clearError()
    }
  }

  const busy = action.pending !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    // Read before the close below empties the field, so the toast names what was
    // actually created rather than an empty string.
    const created = name.trim()

    const done = await action.run('create', fallbackError, () => onCreate(name), {
      report: 'field',
    })
    if (!done) return

    changeOpen(false)
    toast.success(toastFor(created))
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
              placeholder={placeholder}
              disabled={busy}
            />
          </div>

          {fields?.(busy)}

          {/* One line for both refusals. The server's own words when it has spoken,
              otherwise the caller's reason its fields are not ready — they are the same
              sentence either way, since a caller computing one runs the mutation's
              validator to get it, so a second slot would only ever show the DM the same
              message twice. A caller with no fields passes no `problem` and this is the
              server's line alone. */}
          <FieldError message={action.error ?? problem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={name.trim() !== '' && (problem ?? null) === null}
            submitLabel={submitLabel}
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
