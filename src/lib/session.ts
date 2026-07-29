/**
 * Browser storage, and what it is allowed to be.
 *
 * Every value here is a *convenience*: something the player could retype in
 * five seconds. Nothing durable hangs off it. Clearing site data costs you one
 * typed display name and, for the DM, one pasted code — never a character. That
 * constraint is the whole point of ADR 0002, and it is why the seat is keyed on
 * the display name server-side rather than on anything stored here.
 *
 * Wrapped rather than used directly because localStorage throws outright when
 * the browser has storage disabled, and a lobby that fails to render because
 * of a preference is a worse bug than a name field that forgets.
 */

const KEY = {
  lastDisplayName: 'ccnk.lastDisplayName',
  lastGameCode: 'ccnk.lastGameCode',
  // Per game rather than global. A single global name would silently bleed the
  // name you used in one game into another and create a second seat there.
  displayNameFor: (code: string) => `ccnk.displayName.${code}`,
  dmCodeFor: (code: string) => `ccnk.dmCode.${code}`,
} as const

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage disabled. The app works; it just forgets.
  }
}

/** Prefill for the display name field on the home screen. */
export function getLastDisplayName(): string {
  return read(KEY.lastDisplayName) ?? ''
}

/** Prefill for the join code field. */
export function getLastGameCode(): string {
  return read(KEY.lastGameCode) ?? ''
}

/** The display name this browser is using for one game — i.e. which seat it is. */
export function getDisplayNameForGame(code: string): string | null {
  return read(KEY.displayNameFor(code))
}

export function rememberDisplayName(code: string, displayName: string) {
  write(KEY.displayNameFor(code), displayName)
  write(KEY.lastDisplayName, displayName)
  write(KEY.lastGameCode, code)
}

export function forgetDisplayName(code: string) {
  write(KEY.displayNameFor(code), null)
}

/**
 * The DM code cached for one game, so the DM's own browser re-elevates without
 * being asked. Losing it is recoverable in-app with the recovery phrase.
 */
export function getDmCode(code: string): string | null {
  return read(KEY.dmCodeFor(code))
}

export function rememberDmCode(code: string, dmCode: string) {
  write(KEY.dmCodeFor(code), dmCode)
}

export function forgetDmCode(code: string) {
  write(KEY.dmCodeFor(code), null)
}
