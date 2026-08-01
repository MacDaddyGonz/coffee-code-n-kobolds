import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CODE_ALPHABET, JOIN_CODE_LENGTH, normaliseJoinCode } from '@convex/lib/codes'

/**
 * Everything a person could type into a code field. Not derived from anything, because
 * it is not a fact about this application — it is the set of keys on the keyboard that
 * `CODE_ALPHABET` is a subset of.
 */
const TYPEABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * The characters a real code never contains, listed for a person to read.
 *
 * **Derived from `CODE_ALPHABET` rather than written out**, because the sentence is a
 * restatement of that constant and there is no reason for a second copy of it to
 * exist. There were two hand-written copies of this line — the dialog's code step and
 * the *Join with a code* panel, both on the landing page — and a hand-written reading
 * of a constant is a sentence that stays on the screen after the constant it describes
 * has changed. `normaliseJoinCode` already drops exactly these characters as they are
 * typed, so the field and its hint now come from one source.
 *
 * > **Amended later.** That panel no longer has a code field at all — it opens the join
 * > dialog, which owns the one join code field on the landing page — so this constant is
 * > down to a single reader. It stays derived regardless: the argument was never about
 * > how many copies exist today, it was that a hand-read of a constant outlives the
 * > constant, and the two copies were identical when they were written too.
 *
 * A third, longer variant of the same fact lives in `Game.tsx`'s "no such game"
 * screen; it reads differently on purpose, being a sentence of advice rather than a
 * field hint, and is left alone.
 */
export const CODE_ALPHABET_HINT = alphabetHint()

function alphabetHint(): string {
  const excluded = [...TYPEABLE].filter((char) => !CODE_ALPHABET.includes(char))
  // "I, L, O, 0 or 1" — an Oxford-comma-free list, matching the sentence it replaced.
  const listed = `${excluded.slice(0, -1).join(', ')} or ${excluded.at(-1)}`
  return `Codes never contain ${listed}.`
}

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
