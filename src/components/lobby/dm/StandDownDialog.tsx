import { useState } from 'react'

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

type StandDownDialogProps = {
  onStandDown: () => void
}

/**
 * Confirms forgetting the DM code on this browser.
 *
 * Nothing about the game changes, so the wording avoids destructive language —
 * but the code is needed again to come back, and a browser that has also lost
 * the recovery phrase does not come back at all. Worth one click to confirm.
 */
export function StandDownDialog({ onStandDown }: StandDownDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Stand down
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stand down as DM?</DialogTitle>
          <DialogDescription>
            This only makes this browser forget the DM code. The game, the seats and the characters
            are untouched, and nobody else becomes the DM. To pick the badge back up you'll need to
            paste the code again, or use your recovery phrase.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Stay the DM
          </Button>
          <Button
            type="button"
            onClick={() => {
              setOpen(false)
              onStandDown()
            }}
          >
            Forget the code here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
