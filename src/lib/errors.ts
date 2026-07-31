import { ConvexError } from 'convex/values'

type ConvexErrorPayload = { kind?: unknown; message?: unknown }

/**
 * Convex functions in this app throw `ConvexError({ kind, message })` so the UI
 * can show the server's own wording instead of "Uncaught Error".
 */
export function errorMessage(thrown: unknown, fallback: string): string {
  const payload = convexPayload(thrown)
  if (payload && typeof payload.message === 'string') return payload.message
  return fallback
}

function convexPayload(thrown: unknown): ConvexErrorPayload | null {
  if (!(thrown instanceof ConvexError)) return null
  return typeof thrown.data === 'object' && thrown.data !== null
    ? (thrown.data as ConvexErrorPayload)
    : null
}
