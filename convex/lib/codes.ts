// Shared by the Convex functions and the browser. Deliberately free of any
// Convex or React imports so the join-code input field and the server agree on
// what "the same code" and "the same display name" mean — the client imports
// this through the `@convex/…` alias rather than keeping its own copy.

/**
 * No `I`, `L`, `O`, `0` or `1`. A join code gets read aloud across a desk and
 * typed by hand, and those are the characters people get wrong.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const JOIN_CODE_LENGTH = 6
export const DM_CODE_LENGTH = 8

export const MIN_RECOVERY_PHRASE_LENGTH = 8
export const MAX_RECOVERY_PHRASE_LENGTH = 200
export const MAX_DISPLAY_NAME_LENGTH = 40
export const MAX_GAME_NAME_LENGTH = 60
export const MAX_CHARACTER_NAME_LENGTH = 40

/**
 * `Math.random` is seeded per execution in Convex and is fine inside a
 * mutation. Codes are not secrets in the cryptographic sense — the DM code's
 * job is to stop a player who already has the join code from picking up DM
 * powers by accident, not to withstand an attack.
 */
export function generateCode(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/**
 * Uppercases and drops anything outside the alphabet, so `abc-123` becomes
 * `ABC23` — spaces, dashes and the excluded lookalikes all fall away. Applied
 * on every keystroke in the join field, which is why it must not throw.
 */
export function normaliseJoinCode(raw: string): string {
  let out = ''
  for (const char of raw.toUpperCase()) {
    if (CODE_ALPHABET.includes(char)) out += char
  }
  return out
}

export function isCompleteJoinCode(code: string): boolean {
  return normaliseJoinCode(code).length === JOIN_CODE_LENGTH
}

/** Trims and collapses runs of whitespace. Keeps the casing the player typed. */
export function normaliseDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_DISPLAY_NAME_LENGTH)
}

/**
 * The identity key for a seat at the table. `Mike`, `mike` and ` Mike  ` are
 * all the same person rejoining — see ADR 0003.
 */
export function nameKeyFor(raw: string): string {
  return normaliseDisplayName(raw).toLowerCase()
}

/** Recovery phrases are matched the same forgiving way display names are. */
export function normaliseRecoveryPhrase(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}
