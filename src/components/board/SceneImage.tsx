import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'

import type { PublicScene } from '@convex/lib/scenes'

/**
 * Load a URL into something Konva can draw, or null while it cannot be drawn yet.
 *
 * This is the `useImage` hook every Konva tutorial reaches for a dependency for,
 * which is not worth a package: a window.Image and one piece of state is the whole
 * of it. Loading and failing collapse into the same `null` deliberately — both the
 * map and a token coin have a sensible thing to draw without art, so no caller has
 * ever needed to tell the two apart, and a status enum nobody reads is a state
 * machine to keep correct for nothing.
 *
 * `crossOrigin` is left unset on purpose. Convex hands out signed URLs on its own
 * domain, and asking for a CORS-clean image would make the draw depend on response
 * headers we do not control. Nothing here reads pixels back out of the canvas, so
 * a "tainted" canvas costs us nothing.
 *
 * It lives in this file rather than its own because TokenCoin is the only other
 * caller and a shared one-hook module would have been a seventh file.
 */
export function useCanvasImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!url) {
      setImage(null)
      return
    }

    // Cleared first, so switching scenes shows empty space rather than the
    // previous map stretched to the new one's dimensions for a beat.
    setImage(null)

    const loading = new window.Image()
    let live = true
    loading.onload = () => {
      if (live) setImage(loading)
    }
    loading.onerror = () => {
      if (live) setImage(null)
    }
    loading.src = url

    return () => {
      live = false
    }
  }, [url])

  return image
}

export type SceneImageProps = {
  scene: PublicScene
}

/**
 * The background layer: the map, at its natural size, with its top-left corner on
 * the image-space origin. Everything else on the board is positioned in that same
 * space, so this node is what all the arithmetic is relative to.
 *
 * Drawn at the scene's *stored* dimensions rather than the loaded file's, because
 * those are the numbers the grid was calibrated against and the ones every token
 * position was computed from. Should the two ever disagree — a map re-uploaded at a
 * different size under the same row — stretching the art is the right failure: the
 * grid and the tokens stay consistent with each other, which is recoverable, where
 * shifting them all by a fraction of a square is not.
 */
export function SceneImage({ scene }: SceneImageProps) {
  const image = useCanvasImage(scene.imageUrl)

  // Nothing to draw until the bytes arrive, and nothing to draw ever if the blob
  // has gone. The grid still renders over the empty space, which is a far better
  // clue that something is wrong than a blank canvas.
  if (!image) return null

  return (
    <KonvaImage
      image={image}
      x={0}
      y={0}
      width={scene.imageWidth}
      height={scene.imageHeight}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
