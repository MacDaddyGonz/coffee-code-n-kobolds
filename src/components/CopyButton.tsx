import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

type CopyButtonProps = {
  value: string
  label: string
  size?: 'default' | 'sm' | 'icon' | 'icon-sm'
}

/**
 * Copies to the clipboard and says so for a moment. The clipboard API rejects
 * without a user gesture or over plain HTTP, so failure is silent-but-visible:
 * the tick simply does not appear.
 */
export function CopyButton({ value, label, size = 'icon-sm' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => setCopied(false))
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      {size === 'default' || size === 'sm' ? (copied ? 'Copied' : 'Copy') : null}
    </Button>
  )
}
