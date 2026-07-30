/**
 * Downscaling uploads, which is CLAUDE.md invariant 6 in code form.
 *
 * The whole app gets 1 GB of Convex file storage on the free plan, shared
 * between maps, token art, modal images and music — and ADR 0001 names music as
 * the thing most likely to eat it. So maps and tokens have to arrive small, and
 * "small" has to be enforced here rather than trusted to the DM, because the
 * files people actually have are enormous. The local sample maps are the
 * evidence: `farmershall_1stfloor.png` is 5040 × 4620 and 21.2 MB, and
 * `finalenemy_lvl03_nogrid_5320x7840.jpg` is 5320 × 7840. Twenty maps like that
 * is a fifth of the entire quota for one dungeon.
 *
 * Nothing here talks to Convex. It takes a file and hands back a smaller one,
 * so the upload panel can show the DM what it saved before anything is stored.
 */

// The same `Size` the grid maths and the camera use. A width and a height is a
// width and a height whichever side of the wire it is on, and a third local copy
// of the pair is a third thing to keep in step.
import type { Size } from '@convex/lib/grid'

/**
 * Long-edge caps, in pixels.
 *
 * 2560 for a map because that is about the widest a map is ever displayed at on
 * a desktop monitor, and the board zooms rather than relying on native
 * resolution. It is also chosen to leave the pre-gridded sample maps alone:
 * `Admittance [Gridded 16x12]` is 2240 × 1680 and the `High Security` pair are
 * 2520 × 1680, all under the cap, so they pass through byte-for-byte and their
 * grid stays exactly 140.00 px per square. Resampling them would put the
 * printed grid a fraction of a pixel off ours, which is precisely the error the
 * calibrator exists to avoid.
 *
 * 256 for a token because a token is drawn a square or two across — around 140
 * px at native zoom on those same maps — so 256 already carries a factor of two
 * for zooming in, and a token is a circle of art with no fine detail to lose.
 */
export const MAP_MAX_EDGE = 2560
export const TOKEN_MAX_EDGE = 256

/**
 * Lossy quality. Maps are photographic and forgiving, so 0.82 buys most of the
 * saving. Tokens are small enough that the extra bytes at 0.9 are irrelevant,
 * and their hard edges against transparency show artefacts far more readily.
 */
export const MAP_QUALITY = 0.82
export const TOKEN_QUALITY = 0.9

/**
 * The server's own limit, not a copy of it: `convex/lib/limits.ts` holds the one
 * definition and both sides import it, so the client cannot start refusing maps
 * the server would take — or spending uploads it is about to throw away. The
 * server check is still the real one; this only saves the round trip.
 *
 * Re-exported so an upload panel can take this and `downscaleMap` from the same
 * module, which is where the check and the resize belong together.
 */
export { MAX_SCENE_BYTES } from '@convex/lib/limits'

export type Downscaled = {
  blob: Blob
  width: number
  height: number
  originalBytes: number
  bytes: number
}

/**
 * Dimensions after applying a long-edge cap, preserving aspect ratio.
 *
 * Never upscales: a 100 × 100 token stays 100 × 100 rather than being blown up
 * to 256 and losing sharpness for extra bytes. An image already inside the cap
 * is returned unchanged, which is what makes the pre-gridded sample maps a
 * pass-through.
 *
 * Rounds to whole pixels, and never rounds an edge down to zero — a long, thin
 * map would otherwise produce a canvas with no area at all.
 */
export function targetSize(width: number, height: number, maxEdge: number): Size {
  const longEdge = Math.max(width, height)
  if (!Number.isFinite(longEdge) || longEdge <= 0) return { width, height }
  if (longEdge <= maxEdge) return { width: Math.round(width), height: Math.round(height) }

  const scale = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * The source's own dimensions, read without rasterising it.
 *
 * An `<img>` that is never inserted into the document is never painted, so the
 * browser parses the header for `naturalWidth` and stops there. That matters
 * because the only reason to know the size is to compute the resize target, and
 * `createImageBitmap(file)` without options would have decoded the full image
 * to tell us — the exact cost the next function is written to avoid.
 */
async function sourceSize(file: Blob): Promise<Size> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<Size>((resolve, reject) => {
      const probe = new Image()
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight })
      probe.onerror = () => reject(new Error('That file could not be read as an image.'))
      probe.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Re-encode as WebP, falling back to PNG.
 *
 * WebP for maps *and* tokens: one format to reason about, roughly 30% smaller
 * than JPEG at the same perceived quality, and unlike JPEG it keeps the alpha
 * channel that round token art needs to sit on a map without a square of
 * background around it.
 *
 * The fallback has to be detected rather than assumed. A canvas that cannot
 * encode WebP is specified to substitute PNG silently, so the returned blob
 * would be a PNG we then hand to Convex labelled `image/webp`; other engines
 * reject the call instead. Both paths end up here re-encoding explicitly, so
 * the blob's `type` is always the truth about its bytes.
 */
async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  try {
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality })
    if (webp.type === 'image/webp') return webp
  } catch {
    // No WebP encoder. Fall through.
  }
  return await canvas.convertToBlob({ type: 'image/png' })
}

/**
 * Shrink and re-encode a file for upload.
 *
 * The target size goes to the *decode*, not to a draw afterwards, and that is
 * the point of this function rather than an incidental detail.
 * `farmershall_1stfloor.png` is 23 megapixels; decoding it at full size costs
 * around 93 MB of pixel buffer, and drawing that into a full-size canvas before
 * scaling doubles it to roughly 190 MB — for a result we are about to throw
 * away in favour of 2560 px. `resizeWidth` / `resizeHeight` let the decoder
 * produce the small bitmap directly, so nothing that large ever exists.
 *
 * `resizeQuality: 'high'` because the default is nearest-neighbour-ish and a
 * map's grid lines alias into a moiré pattern under it.
 *
 * The bitmap's pixels are then *moved* into the canvas rather than drawn into it.
 * `createImageBitmap` has already produced exactly the image we want, so a
 * `drawImage` into a 2d context would allocate a second RGBA buffer the same size
 * and blit the whole thing across for no change — around 24 MB of copy per map at
 * 2560 px. `transferFromImageBitmap` hands the existing buffer over instead, and
 * as a consequence *consumes* the bitmap: it comes back detached, with nothing
 * left to release, which is why only the fallback path closes it.
 *
 * The fallback matters. `bitmaprenderer` is the one context this needs and an
 * engine may not have it, so a null there drops back to the copying path rather
 * than failing the upload — and a browser with neither says so in the DM's words.
 * A 23 MP bitmap left for the collector is a genuine leak over a session where
 * the DM tries a dozen maps, so that path closes it whether the encode works or
 * not.
 */
export async function downscaleImage(
  file: Blob,
  options: { maxEdge: number; quality: number },
): Promise<Downscaled> {
  const source = await sourceSize(file)
  const target = targetSize(source.width, source.height, options.maxEdge)

  const bitmap = await createImageBitmap(file, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  })
  // Read before the transfer. A transferred bitmap is detached, so its own
  // `width` is no longer there to report as the stored scene's dimensions.
  const { width, height } = bitmap

  const canvas = new OffscreenCanvas(width, height)
  intoCanvas(canvas, bitmap)
  const blob = await encode(canvas, options.quality)

  return { blob, width, height, originalBytes: file.size, bytes: blob.size }
}

/**
 * Get the bitmap's pixels into the canvas, by transfer if the browser can and by
 * copy if it cannot. The canvas is the output; there is nothing to return.
 */
function intoCanvas(canvas: OffscreenCanvas, bitmap: ImageBitmap): void {
  const renderer = canvas.getContext('bitmaprenderer')
  if (renderer) {
    // Consumes the bitmap. Nothing to close afterwards, and closing it would be
    // a no-op on an already-detached object rather than a second release.
    renderer.transferFromImageBitmap(bitmap)
    return
  }

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare images for upload.')
    context.drawImage(bitmap, 0, 0)
  } finally {
    bitmap.close()
  }
}

export function downscaleMap(file: Blob): Promise<Downscaled> {
  return downscaleImage(file, { maxEdge: MAP_MAX_EDGE, quality: MAP_QUALITY })
}

export function downscaleToken(file: Blob): Promise<Downscaled> {
  return downscaleImage(file, { maxEdge: TOKEN_MAX_EDGE, quality: TOKEN_QUALITY })
}

const KB = 1024
const MB = 1024 * KB

/**
 * Bytes for a human, so the upload dialog can say "21.2 MB → 1.4 MB".
 *
 * Worth having purely so invariant 6 is something the DM watches happen rather
 * than a promise in a comment. Uses 1024-based units to match `MAX_SCENE_BYTES`,
 * which is written as 4 MB and must read back as 4 MB. The unit is picked after
 * rounding so nothing ever displays as "1024 KB".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const kb = bytes / KB
  if (kb < 1) return `${Math.round(bytes)} B`
  if (Math.round(kb) < KB) return `${Math.round(kb)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}
