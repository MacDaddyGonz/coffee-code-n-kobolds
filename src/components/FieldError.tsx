type FieldErrorProps = {
  message: string | null | undefined
  /** Give this to the input's `aria-describedby` so focus reaches the message too. */
  id?: string
}

/**
 * The one shape for a validation message under a field.
 *
 * `role="alert"` on every one of them, matching the `Alert` primitive, so a
 * message that appears after a submit is announced there and then rather than
 * only when the field is next focused.
 */
export function FieldError({ message, id }: FieldErrorProps) {
  if (!message) return null

  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}
