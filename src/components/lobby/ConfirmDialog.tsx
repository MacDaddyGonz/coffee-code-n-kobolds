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
  trigger: ReactNode
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
}

/** Second click for the lobby actions that are worth confirming. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'destructive',
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
