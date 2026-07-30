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

import type { Camera } from '@/lib/camera'

const KEY = {
  lastDisplayName: 'ccnk.lastDisplayName',
  lastGameCode: 'ccnk.lastGameCode',
  // Per game rather than global. A single global name would silently bleed the
  // name you used in one game into another and create a second seat there.
  displayNameFor: (code: string) => `ccnk.displayName.${code}`,
  dmCodeFor: (code: string) => `ccnk.dmCode.${code}`,
  // Per scene as well as per game: the zoom you want on a 16×12 tavern is not the
  // one you want on a seven-storey hall.
  cameraFor: (code: string, sceneId: string) => `ccnk.camera.${code}.${sceneId}`,
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

/**
 * Where this browser was last looking at one scene.
 *
 * The camera is per-viewer and never goes to Convex: the DM zoomed into a
 * corridor while a player watches the whole floor is the intended behaviour, not
 * drift, so there is nothing to synchronise. It belongs here because it fits the
 * rule at the top of this file exactly — losing it costs one scroll gesture.
 *
 * Whatever is under this key is user-editable text that has also outlived however
 * many deploys, so it is checked field by field rather than trusted. A camera with
 * a NaN scale does not throw, it silently projects every token to the same point,
 * which is a much harder bug to recognise than a board that opened fitted.
 */
export function getCamera(code: string, sceneId: string): Camera | null {
  const stored = read(KEY.cameraFor(code, sceneId))
  if (stored === null) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { scale, x, y } = parsed as Record<string, unknown>
    if (!Number.isFinite(scale) || !Number.isFinite(x) || !Number.isFinite(y)) return null
    return { scale: scale as number, x: x as number, y: y as number }
  } catch {
    return null
  }
}

export function rememberCamera(code: string, sceneId: string, camera: Camera) {
  write(KEY.cameraFor(code, sceneId), JSON.stringify(camera))
}
