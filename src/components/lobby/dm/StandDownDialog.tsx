import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { Button } from '@/components/ui/button'

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
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Stand down
        </Button>
      }
      title="Stand down as DM?"
      description={
        'This only makes this browser forget the DM code. The game, the seats and the characters ' +
        "are untouched, and nobody else becomes the DM. To pick the badge back up you'll need to " +
        'paste the code again, or use your recovery phrase.'
      }
      confirmLabel="Forget the code here"
      cancelLabel="Stay the DM"
      confirmVariant="default"
      onConfirm={onStandDown}
    />
  )
}
