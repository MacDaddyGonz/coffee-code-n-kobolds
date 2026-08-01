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
  // Per game rather than global, for the same reason the camera is: a game you run
  // wants the tools wide open and a game you play in wants the map.
  paneWidthFor: (code: string) => `ccnk.paneWidth.${code}`,
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

/**
 * How wide this browser last left the right-hand panel in one game.
 *
 * A pane width is the same kind of fact as the camera above — a view rather than
 * shared state, so it costs no database traffic and losing it costs one drag — and
 * it is stored the same way for that reason.
 *
 * ⚠️ **Deliberately not clamped here, and the omission is the interesting part.**
 * What counts as a legal width depends on how wide the window is *right now*: the
 * panel has a floor of its own, the map beside it has one too, and which of them
 * gives way is a question about the current layout. That is not a fact about
 * storage. Clamping here would bake one session's window size into the stored
 * number — a width chosen on a wide monitor, read back on a laptop, would be
 * written down shrunk and would never come back. So this validates the *shape* and
 * `usePaneWidth` enforces the *fit*, which is the same division `getCamera` makes
 * when it checks for a NaN scale and leaves the bounds to `clampCamera`.
 *
 * The `> 0` test is doing real work rather than being defensive about negatives.
 * `Number('')` and `Number(' ')` are both **0**, so a key that has been emptied by
 * a half-finished storage clear would otherwise read back as a perfectly finite
 * zero — which is a collapsed panel with the sheet's Save button inside it, not
 * "nothing remembered".
 */
export function getPaneWidth(code: string): number | null {
  const stored = read(KEY.paneWidthFor(code))
  if (stored === null) return null
  const width = Number(stored)
  return Number.isFinite(width) && width > 0 ? width : null
}

export function rememberPaneWidth(code: string, width: number) {
  write(KEY.paneWidthFor(code), String(width))
}
