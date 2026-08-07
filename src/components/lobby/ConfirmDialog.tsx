import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type ConfirmDialogProps = {
  /**
   * The thing that opens it. Optional, because a caller may open this from something
   * that is not a button of its own — see the controlled pair below.
   */
  trigger?: ReactNode
  /**
   * Controlled open state, for a caller that has to open this from somewhere the
   * trigger cannot live.
   *
   * ⚠️ **The board's right-click menu is the case, and it is a real constraint rather
   * than a preference.** A Radix `DialogTrigger` rendered inside a `DropdownMenuItem`
   * is unmounted by the menu closing on select, so the dialog it was going to open
   * never appears. The menu therefore asks its parent to open a dialog mounted
   * *beside* it. Both props or neither; passing one is a controlled component with no
   * way to close.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  /** Defaults to 'Cancel'. */
  cancelLabel?: string
  /** `default` for a confirmation that undoes nothing, like standing down as DM. */
  confirmVariant?: 'default' | 'destructive'
  busy?: boolean
  /**
   * Resolves false when the call failed, which keeps the dialog open to retry. A
   * synchronous handler cannot fail, so the dialog just closes.
   */
  onConfirm: () => Promise<boolean> | void
  /**
   * One control between the description and the buttons, for a confirmation that has a
   * *choice* in it as well as a yes.
   *
   * ⚠️ **Deliberately not a general slot for a form.** Duplicating a map is the case, and it
   * is one checkbox: *also copy the tokens and the fog.* Everything else about the copy is
   * decided by the sentence in the description, which is what keeps this a confirm rather
   * than a dialog with an OK button. The moment something here needs two fields and a
   * validation message it wants its own `Dialog`, like `SceneUploadDialog` — and the tell is
   * that `onConfirm` takes no arguments, so the caller has to hold the state itself.
   */
  children?: ReactNode
}

/** Second click for the lobby actions that are worth confirming. */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'destructive',
  busy = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  // Uncontrolled unless the caller supplies both halves, so the six existing callers
  // that pass a trigger and nothing else are unchanged.
  const [uncontrolled, setUncontrolled] = useState(false)
  const isOpen = open ?? uncontrolled
  const setOpen = onOpenChange ?? setUncontrolled

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={busy}
            onClick={() => {
              void Promise.resolve(onConfirm()).then((done) => {
                if (done !== false) setOpen(false)
              })
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
