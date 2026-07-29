import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { JOIN_CODE_LENGTH, normaliseJoinCode } from '@convex/lib/codes'

type CodeInputProps = {
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
  autoFocus?: boolean
  disabled?: boolean
  'aria-describedby'?: string
}

/**
 * Join code field. Normalises on every keystroke through the same function the
 * server uses, so `abc-123` visibly becomes `ABC23` as you type and there is no
 * disagreement about what the code is. Characters outside the alphabet are
 * dropped rather than rejected — `0`, `1`, `I`, `L` and `O` never appear in a
 * real code, so typing one is always a mistake.
 */
export function CodeInput({ value, onChange, className, ...props }: CodeInputProps) {
  return (
    <Input
      {...props}
      value={value}
      onChange={(event) => onChange(normaliseJoinCode(event.target.value))}
      inputMode="text"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={JOIN_CODE_LENGTH}
      placeholder="ABC234"
      className={cn('font-mono text-lg tracking-[0.3em] uppercase', className)}
    />
  )
}
