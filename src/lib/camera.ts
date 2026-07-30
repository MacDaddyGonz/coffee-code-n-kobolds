// The board camera: the one place that knows about screen pixels.
//
// Everything stored about the board — token positions, grid offsets, image
// dimensions — is in **image-space pixels**, the coordinate system of the
// uploaded map at its natural size. That system is the same for everybody at the
// table regardless of where each of them happens to be looking, which is exactly
// why it is the one the database holds. The camera is a per-viewer projection on
// top of it, and `toImageSpace` is the only correct way to turn a pointer
// position into a position that may be stored.
//
// Using screen coordinates instead is a memorable bug rather than an obvious
// one. At 100% zoom with the map sitting at the origin the two systems coincide,
// so a dropped token lands exactly under the cursor and the code looks right.
// The error then grows in proportion to the zoom and the pan everywhere else, and
// presents as tokens settling a square or two away from where they were dropped —
// which reads as a broken snap, sending you to `@convex/lib/grid`, which is fine.
//
// Pure by design: no React, no Konva. The camera is never written to Convex, so
// there is no server half of this to keep in step and nothing here needs a
// rendered component to test.

import type { Point } from '@convex/lib/grid'

/**
 * `scale` is image pixels to screen pixels; `x`/`y` are where the image's origin
 * sits on screen. Deliberately the same three numbers Konva's `Stage` takes as
 * `scaleX`/`scaleY`/`x`/`y`, so the stage can be driven straight from this
 * without a translation layer in between to get wrong.
 */
export type Camera = { scale: number; x: number; y: number }

export type Size = { width: number; height: number }

/**
 * Zoom limits. The floor is generous because a 5040×4620 battle map is 20 times
 * the height of a browser viewport; the ceiling is where map art stops carrying
 * any more detail and starts being a wall of blur.
 */
export const MIN_SCALE = 0.1
export const MAX_SCALE = 4

/** What the −/+ buttons step through and the dropdown offers. */
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4]

/** Per wheel notch. 10% a notch is roughly what Roll20 and Google Maps feel like. */
export const WHEEL_STEP = 1.1

/** Tolerance for "is this scale already that preset", in scale units. */
const PRESET_EPSILON = 1e-4

/** How much of the viewport `clampCamera` insists the map keeps covering, per axis. */
const MIN_COVERED_FRACTION = 0.25

export function clampScale(scale: number): number {
  // A NaN scale is reachable from an empty number input and from dividing by a
  // zero viewport during the first layout pass, and it survives every comparison
  // silently — so it is turned back into a usable camera here rather than being
  // allowed to poison every position derived from it afterwards.
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Screen point → image space. The ONLY correct way to turn a pointer into a position. */
export function toImageSpace(camera: Camera, screen: Point): Point {
  return {
    x: (screen.x - camera.x) / camera.scale,
    y: (screen.y - camera.y) / camera.scale,
  }
}

export function toScreenSpace(camera: Camera, image: Point): Point {
  return {
    x: image.x * camera.scale + camera.x,
    y: image.y * camera.scale + camera.y,
  }
}

/** Zoom so the image point currently under `screen` stays under `screen`. */
export function zoomAbout(camera: Camera, screen: Point, factor: number): Camera {
  return zoomTo(camera, screen, camera.scale * factor)
}

/**
 * The anchored zoom, and the detail that decides whether the board feels right.
 *
 * The image point under the cursor is read *before* the scale changes, then the
 * origin is moved so that same point projects back to the same screen position
 * afterwards. Skip it and the zoom pulls towards the top-left corner of the map,
 * so getting to a corridor means alternating zoom and pan instead of pointing at
 * the corridor and spinning the wheel.
 */
export function zoomTo(camera: Camera, screen: Point, scale: number): Camera {
  const next = clampScale(scale)
  const anchor = toImageSpace(camera, screen)
  return {
    scale: next,
    x: screen.x - anchor.x * next,
    y: screen.y - anchor.y * next,
  }
}

/**
 * Scale and centre so the whole image fits `viewport` with a small margin.
 *
 * This is what a scene opens at, because a freshly uploaded map at 100% is a
 * wall of pixels: `farmershall_1stfloor.png` is 5320×7840, so a 1200-px viewport
 * shows about 3% of it and gives no clue which direction the rest is in.
 *
 * The fitted scale deliberately ignores `MIN_SCALE`. That map needs about 0.10
 * across and 0.096 down, and honouring the floor would leave the bottom of it
 * off screen — which is the one thing Fit exists to prevent. User-driven zoom
 * still holds the floor, via `clampScale`.
 */
export function fitCamera(image: Size, viewport: Size, margin = 24): Camera {
  const usableWidth = viewport.width - margin * 2
  const usableHeight = viewport.height - margin * 2

  // Before the first layout pass the viewport is 0×0 and the scene image may not
  // have loaded, so every ratio below is Infinity or NaN. Sitting at 100% for one
  // frame is a better answer than committing a broken camera the caller then
  // persists.
  if (
    !(image.width > 0) ||
    !(image.height > 0) ||
    !(usableWidth > 0) ||
    !(usableHeight > 0)
  ) {
    return { scale: 1, x: 0, y: 0 }
  }

  const scale = Math.min(
    MAX_SCALE,
    Math.min(usableWidth / image.width, usableHeight / image.height),
  )

  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
  }
}

/**
 * The next preset above or below the current scale, for the −/+ buttons and keys.
 *
 * Works from an arbitrary scale rather than an index into `ZOOM_PRESETS`, because
 * the wheel leaves you between presets far more often than on one, and a button
 * that jumped back to wherever you last clicked would feel like it had lost
 * track. Off the end it returns the hard limit, so pressing − at the floor is a
 * no-op rather than a wrap-around — except below the lowest preset, where a
 * fitted map can legitimately sit under `MIN_SCALE` and being nudged *in* by a
 * zoom-out would be plainly wrong.
 */
export function nextPreset(scale: number, direction: 1 | -1): number {
  const from = Number.isFinite(scale) ? scale : 1

  if (direction === 1) {
    const up = ZOOM_PRESETS.find((preset) => preset > from + PRESET_EPSILON)
    return up ?? MAX_SCALE
  }

  const down = ZOOM_PRESETS.filter((preset) => preset < from - PRESET_EPSILON).pop()
  return down ?? Math.min(from, MIN_SCALE)
}

/**
 * Soft bound: keeps at least ~25% of the viewport covered by map.
 *
 * Soft in two senses. It bounds the pan only, never the scale, so it cannot
 * argue with a zoom; and it stops the camera at the edge rather than springing it
 * back, so a gesture that reaches the bound just stops instead of snatching the
 * map out from under the cursor. Its whole job is that the board cannot be flung
 * into empty space, leaving a blank canvas and no hint of which way to drag.
 *
 * Apply it where the camera lands, not inside the per-event maths — a bound
 * re-projected part-way through a fast gesture is how anchored zoom loses its
 * anchor.
 */
export function clampCamera(camera: Camera, image: Size, viewport: Size): Camera {
  const width = image.width * camera.scale
  const height = image.height * camera.scale
  if (!(width > 0) || !(height > 0) || !(viewport.width > 0) || !(viewport.height > 0)) {
    return camera
  }

  // A map smaller on screen than the margin we are asking for can only be
  // required to keep all of itself in view, hence the `min`.
  const neededX = Math.min(width, viewport.width * MIN_COVERED_FRACTION)
  const neededY = Math.min(height, viewport.height * MIN_COVERED_FRACTION)

  return {
    scale: camera.scale,
    x: Math.min(viewport.width - neededX, Math.max(neededX - width, camera.x)),
    y: Math.min(viewport.height - neededY, Math.max(neededY - height, camera.y)),
  }
}
