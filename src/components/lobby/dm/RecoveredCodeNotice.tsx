import { CopyButton } from '@/components/CopyButton'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type RecoveredCodeNoticeProps = {
  dmCode: string
  onDismiss: () => void
}

/**
 * Shown once, straight after a recovery.
 *
 * The only place in the app that prints the DM code without being asked to. It
 * earns that: someone who just used the recovery phrase demonstrably has no copy
 * of the code, and leaving them with it only in localStorage means the next cache
 * clear brings them right back here. Inline rather than a dialog so it survives a
 * stray Escape while they write the code down.
 */
export function RecoveredCodeNotice({ dmCode, onDismiss }: RecoveredCodeNoticeProps) {
  return (
    <Alert>
      <AlertTitle>You have the DM badge again</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          This browser has saved the code, so it won't ask again. Save it somewhere outside the
          browser too — clearing site data is what lost it last time.
        </span>
        <span className="flex items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 font-mono text-base tracking-[0.2em]">
            {dmCode}
          </code>
          <CopyButton value={dmCode} label="DM code" />
        </span>
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Saved it
        </Button>
      </AlertAction>
    </Alert>
  )
}
