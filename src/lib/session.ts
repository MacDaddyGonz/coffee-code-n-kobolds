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
import type { TokenLayer } from '@convex/lib/layers'
import { TOKEN_LAYERS } from '@convex/lib/layers'

/**
 * Whether the DM is looking at the board the way the table is, or at all of it.
 *
 * Declared here rather than in `useBoardLayers` because this is the module that has to
 * *validate* it, and a hook importing storage while storage imported the hook is a cycle
 * for a two-member union. `TokenLayer` comes the other way for the opposite reason: it is
 * the server's union and neither side of the wire may spell it twice.
 */
export type LayerView = 'player' | 'all'
const LAYER_VIEWS: readonly LayerView[] = ['player', 'all']

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
  // Per game and deliberately **not** per scene, which is `paneWidthFor`'s reasoning
  // rather than `cameraFor`'s. A camera is where you were looking at one map, so it
  // belongs to that map; which layer you are working on and whether you are previewing
  // the table's view are *tools*, and a tool you set stays set when you change maps —
  // a DM who is building scenery does not want to be put back on the player layer by
  // switching to the next room.
  layerViewFor: (code: string) => `ccnk.layerView.${code}`,
  activeLayerFor: (code: string) => `ccnk.activeLayer.${code}`,
  // Per game, and per game for the layer tools' reason rather than the camera's: how loud
  // you want the music is a *tool setting*, not where you were looking, so it survives
  // changing scenes and follows the table it belongs to. One game you run with an ambient
  // loop under everything and another you sit in with headphones on.
  musicVolumeFor: (code: string) => `ccnk.musicVolume.${code}`,
  musicMutedFor: (code: string) => `ccnk.musicMuted.${code}`,
} as const

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * `false` when the browser refused the write, which is the whole of what a caller
 * can learn about storage being off.
 *
 * ⚠️ **A return value rather than a `storageAvailable()` probe, and the difference is
 * not stylistic.** A probe answers a question about a *different* write — a test key
 * written at some other moment — and the two can disagree: Safari's private mode has
 * historically allowed `setItem` and thrown only once a quota is reached, an
 * extension can revoke access between the probe and the real call, and a quota that
 * is nearly full fails on a long value and not on a short one. The truth wanted here
 * is *did this write land*, and the only moment that is knowable is the moment it
 * happens.
 *
 * Every existing caller ignores it and is meant to: forgetting a camera position or
 * a pane width is not worth a sentence on screen. The two callers that do read it
 * are the ones where the forgetting is *visible later and confusing then* — a DM who
 * lands as a plain player, a player who is asked their name again after picking their
 * own seat off a list — and being told at the door is what turns either into an
 * explanation rather than a bug.
 */
function write(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
    return true
  } catch {
    // Storage disabled. The app works; it just forgets.
    return false
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

/**
 * Which seat this browser is in one game, plus the two global prefills.
 *
 * ⚠️ **Returns whether the *per-game* key landed, and nothing about the other two.**
 * That key is the one with a consequence a person will notice: it is what `useSeat`
 * reads at mount, so losing it is being asked which seat you are all over again — which
 * is exactly the sentence the landing page's join door puts on screen when this answers
 * `false`. The two prefills are a saved keystroke on the next visit and nothing more, so
 * folding them into the answer made that sentence *wrong* in the one case it could
 * differ: a quota failure on `lastGameCode` alone warned somebody about a seat that had
 * in fact been remembered perfectly.
 *
 * All three are still attempted. The two prefills are called for their effect and their
 * result deliberately dropped, which is also what makes a short-circuiting `&&`
 * unavailable to a later edit: there is nothing left to combine.
 */
export function rememberDisplayName(code: string, displayName: string): boolean {
  const seat = write(KEY.displayNameFor(code), displayName)
  write(KEY.lastDisplayName, displayName)
  write(KEY.lastGameCode, code)
  return seat
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

/**
 * Returns whether the code was actually kept. The landing page's DM door reads it:
 * the door's entire promise is that you arrive already elevated, and this write is
 * the whole mechanism — `useDm`'s restore effect reads the key back once the seat
 * resolves. A browser that refused it lands the DM as a plain player, so the door
 * says so before navigating rather than leaving them to discover it.
 */
export function rememberDmCode(code: string, dmCode: string): boolean {
  return write(KEY.dmCodeFor(code), dmCode)
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

/**
 * Whether this browser was last previewing the table's view of the board, and which layer
 * it was working on. Two facts, one argument, so they are documented together.
 *
 * Both are the same kind of value as the camera and the pane width — a view rather than
 * shared state, never written to Convex (ADR 0004's reasoning, and the DM working the GM
 * layer while everybody looks at the map is the point rather than drift) — and losing
 * either costs one press.
 *
 * ⚠️ **Both getters check membership of the union rather than merely parsing a string**,
 * which is `getCamera`'s NaN-scale check applied to a discriminator: an unrecognised value
 * that typechecks as `TokenLayer` because a cast said so is a `Record` lookup returning
 * `undefined` and a layer nothing can label or draw.
 *
 * That has a concrete payoff beyond tidiness, and it is why this needed no migration of its
 * own. The GM layer was stored as `dm` before it was renamed, so a browser still holding
 * that value reads back as unrecognised, falls through to the default, and is written over
 * on the DM's next press — which is exactly the right outcome for a preference. The
 * database's half of the rename is a real widen-migrate-narrow in `convex/lib/layers.ts`;
 * this half is one line of validation, because nothing here is data.
 */
export function getLayerView(code: string): LayerView | null {
  const stored = read(KEY.layerViewFor(code))
  return LAYER_VIEWS.includes(stored as LayerView) ? (stored as LayerView) : null
}

export function rememberLayerView(code: string, view: LayerView) {
  write(KEY.layerViewFor(code), view)
}

/** Which layer the DM's next token lands on. See the note above for the validation. */
export function getActiveLayer(code: string): TokenLayer | null {
  const stored = read(KEY.activeLayerFor(code))
  return TOKEN_LAYERS.includes(stored as TokenLayer) ? (stored as TokenLayer) : null
}

export function rememberActiveLayer(code: string, layer: TokenLayer) {
  write(KEY.activeLayerFor(code), layer)
}

/**
 * How loud this browser plays the DM's music, and whether it is muted. Two facts, one
 * argument, so they are documented together the way the two layer tools above are.
 *
 * Both belong here by the rule at the top of this file: losing either costs one drag of a
 * slider. And both are *this browser's alone* — nothing about volume goes to Convex,
 * because the DM turning their own music down while the table listens is the point of the
 * control rather than drift to be synchronised away. Which track is on is shared state and
 * lives in `games.activeTrackId`; how loud it is here is not.
 *
 * ⚠️ **`getPaneWidth`'s `> 0` test would be exactly wrong here, and the contrast is worth
 * a sentence because the two functions otherwise look alike.** There, zero means a
 * collapsed panel with the Save button inside it, so a key emptied by a half-finished
 * storage clear — `Number('')` is **0** — has to read as "nothing remembered". Here zero is
 * a *legitimate* value a person can choose: silence. So the blank is rejected explicitly
 * and the range is checked at both ends instead, which is `getCamera`'s NaN-scale
 * discipline rather than a bound.
 */
export function getMusicVolume(code: string): number | null {
  const stored = read(KEY.musicVolumeFor(code))
  if (stored === null || stored.trim() === '') return null
  const volume = Number(stored)
  // Both ends, and not merely finiteness: `HTMLMediaElement.volume` throws outside 0..1,
  // so a hand-edited key would otherwise take the header down rather than sound wrong.
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : null
}

export function rememberMusicVolume(code: string, volume: number) {
  write(KEY.musicVolumeFor(code), String(volume))
}

/**
 * Mute is a third state and not the volume being zero, which is why it is a second key.
 * Somebody who mutes to take a phone call wants their volume back afterwards, and one
 * number cannot remember both. Checked against the two spellings it is ever written as,
 * for the reason the layer getters above check union membership.
 */
export function getMusicMuted(code: string): boolean | null {
  const stored = read(KEY.musicMutedFor(code))
  if (stored === 'true') return true
  if (stored === 'false') return false
  return null
}

export function rememberMusicMuted(code: string, muted: boolean) {
  write(KEY.musicMutedFor(code), String(muted))
}
