import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'

export type DialogFormFooterProps = {
  /** Something is in flight. Disables both buttons — Cancel included, see below. */
  busy: boolean
  /** The form's own validity. Kept separate from `busy` so the label can still change. */
  canSubmit: boolean
  submitLabel: string
  onCancel: () => void
}

/**
 * Cancel and submit, for a dialog that is a form.
 *
 * Cancel is disabled while a call is in flight rather than left live, and that is
 * the one opinion in here. Both dialogs using this upload a file first and then
 * ask the server to accept it, and closing between the two steps would leave the
 * DM with no idea whether the thing they were adding exists — so the dialog stays
 * put until it knows.
 */
export function DialogFormFooter({
  busy,
  canSubmit,
  submitLabel,
  onCancel,
}: DialogFormFooterProps) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || !canSubmit}>
        {submitLabel}
      </Button>
    </DialogFooter>
  )
}
