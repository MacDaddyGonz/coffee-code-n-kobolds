import { cn } from '@/lib/utils'

type VerdictLineProps = {
  /** `null` prints nothing — and still occupies the line. See below. */
  message: string | null
  /** Give this to the field's `aria-describedby` so the answer reaches it too. */
  id?: string
  /**
   * `destructive` for the arms that mean the code is wrong, `muted` for the ones that
   * mean *not yet* or *that one*. Decided by the caller rather than derived from the
   * message, because the three fields using this have three different sets of arms
   * and only the caller knows which of its own verdicts is a refusal.
   */
  tone?: 'muted' | 'destructive'
}

/**
 * The answer under a code field: a live region of fixed height, printing whatever the
 * current verdict says.
 *
 * **Two things make this a component rather than three `<p>` tags**, and both are the
 * kind of contract that survives being centralised and does not survive being copied:
 *
 * - **`aria-live="polite"`.** The message changes as somebody types, and it changes
 *   *under* the field they are typing into. Announcing it without moving focus is the
 *   whole behaviour — a code field whose rejection is silent until the next tab stop
 *   is a field you correct by guessing.
 * - **`min-h-5`, always rendered.** The line holds its height while it says nothing,
 *   so the dialog does not jump as the answer lands. Drop it from one copy and that
 *   one dialog starts moving under the cursor — in the single place on the screen
 *   where the accessibility behaviour is the entire point of the element.
 *
 * ⚠️ **A second primitive beside `FieldError`, deliberately, and not a variant of
 * it.** They differ in both of the things that matter about a message under a field.
 * `FieldError` is `role="alert"` and renders nothing at all when there is no message:
 * that is right for a *validation failure after a submit*, which arrives once, must
 * interrupt, and reserves no space for a state that is normally absent. This is the
 * opposite on both counts — it changes on every keystroke, so `role="alert"` would be
 * a screen reader interrupting itself letter by letter, and its empty state is the
 * ordinary one, so a collapsing height would be motion on the common path. Folding
 * them into one component with two flags would hand the next caller a choice between
 * an announcement that interrupts and one that does not, which is the choice least
 * likely to be made on purpose.
 */
export function VerdictLine({ message, id, tone = 'muted' }: VerdictLineProps) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        'min-h-5 text-sm',
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {message}
    </p>
  )
}
