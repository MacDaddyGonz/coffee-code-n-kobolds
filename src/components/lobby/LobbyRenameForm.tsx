import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LobbyRenameFormProps = {
  label: string
  initial: string
  maxLength: number
  busy: boolean
  onCancel: () => void
  /** Resolves false when the server refused, which keeps the field open to fix. */
  onSubmit: (value: string) => Promise<boolean>
}

/** The inline rename used by both a seat and a character. */
export function LobbyRenameForm({
  label,
  initial,
  maxLength,
  busy,
  onCancel,
  onSubmit,
}: LobbyRenameFormProps) {
  const inputId = useId()
  const [value, setValue] = useState(initial)

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(value).then((done) => {
          if (done) onCancel()
        })
      }}
    >
      <Label htmlFor={inputId} className="sr-only">
        {label}
      </Label>
      <Input
        id={inputId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={maxLength}
        autoComplete="off"
        autoFocus
        className="h-7 w-48"
      />
      <Button type="submit" size="sm" disabled={busy}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}
