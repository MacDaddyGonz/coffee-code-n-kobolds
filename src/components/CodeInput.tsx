import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { JOIN_CODE_LENGTH, normaliseJoinCode } from '@convex/lib/codes'

type CodeInputProps = {
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
  /** Defaults to a join code. Pass `DM_CODE_LENGTH` for the DM code field. */
  length?: number
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  'aria-describedby'?: string
}

/**
 * The field for a code — the join code, or the DM code in <ElevateDialog>.
 *
 * Normalises on every keystroke through the same function the server uses, so
 * `abc-123` visibly becomes `ABC23` as you type and there is no disagreement
 * about what the code is. Characters outside the alphabet are dropped rather than
 * rejected — `0`, `1`, `I`, `L` and `O` never appear in a real code of either
 * kind, so typing one is always a mistake.
 */
export function CodeInput({
  value,
  onChange,
  className,
  length = JOIN_CODE_LENGTH,
  placeholder = 'ABC234',
  ...props
}: CodeInputProps) {
  return (
    <Input
      {...props}
      value={value}
      onChange={(event) => onChange(normaliseJoinCode(event.target.value).slice(0, length))}
      inputMode="text"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={length}
      placeholder={placeholder}
      className={cn('font-mono text-lg tracking-[0.3em] uppercase', className)}
    />
  )
}
