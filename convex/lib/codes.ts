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
export const MAX_SCENE_NAME_LENGTH = 60

/**
 * Drawn from `crypto.getRandomValues`, not `Math.random`.
 *
 * The DM code is the app's only authorisation primitive, and ADR 0003 accepts
 * having no lockout on recovery attempts specifically because these codes cannot
 * be enumerated. A seeded PRNG would undercut that reasoning, so the generator
 * has to be the real thing — it costs nothing here.
 *
 * Bytes at or above the largest whole multiple of the alphabet length are
 * discarded rather than folded with `%`, which would otherwise bias the result
 * toward the first eight letters of the alphabet.
 */
export function generateCode(length: number): string {
  const ceiling = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (out.length === length) break
      if (byte >= ceiling) continue
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length]
    }
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

/**
 * The whole of what the server forgives in a DM code: case and surrounding
 * whitespace. Deliberately *not* `normaliseJoinCode` — dropping out-of-alphabet
 * characters would silently accept a code with whitespace or punctuation through
 * the middle of it, and the check on the app's only bearer secret should not be
 * that generous. The join field is more forgiving on purpose; this is not.
 */
export function normaliseDmCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Trims and collapses runs of whitespace. Keeps the casing the player typed. */
export function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Deliberately does NOT truncate. Over-length names are rejected server-side by
 * `requireText` instead, because `nameKey` is the identity key: two players
 * whose names differ only past a cut-off would silently land on the same seat,
 * and the second would inherit the first's character with `rejoined: true`
 * looking exactly like an ordinary cleared-cache rejoin. Slicing also cuts
 * surrogate pairs in half and stores invalid UTF-16. See ADR 0003.
 */
export function normaliseDisplayName(raw: string): string {
  return collapseWhitespace(raw)
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
  return collapseWhitespace(raw).toLowerCase()
}

/**
 * The check behind both "choose a recovery phrase" forms, in the order and the
 * words `games.create` and `games.setRecoveryPhrase` use: the minimum measured on
 * the normalised phrase, the maximum on what was actually typed, the confirmation
 * compared normalised. Shared so no form accepts a phrase the server is about to
 * reject, and so the two forms cannot drift apart from each other either.
 *
 * `field` says which of the two inputs the message belongs under; a form with a
 * single error line can ignore it.
 */
export function recoveryPhraseProblem(
  phrase: string,
  confirm: string,
): { field: 'phrase' | 'confirm'; message: string } | null {
  const normalised = normaliseRecoveryPhrase(phrase)
  if (normalised.length < MIN_RECOVERY_PHRASE_LENGTH) {
    return {
      field: 'phrase',
      message: `The recovery phrase needs at least ${MIN_RECOVERY_PHRASE_LENGTH} characters.`,
    }
  }
  if (phrase.length > MAX_RECOVERY_PHRASE_LENGTH) {
    return { field: 'phrase', message: 'That recovery phrase is too long.' }
  }
  if (normaliseRecoveryPhrase(confirm) !== normalised) {
    return { field: 'confirm', message: 'The two phrases do not match.' }
  }
  return null
}
