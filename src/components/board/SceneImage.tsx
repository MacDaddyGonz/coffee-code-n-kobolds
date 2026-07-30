import { memo } from 'react'
import { Image as KonvaImage } from 'react-konva'

import { useCanvasImage } from '@/hooks/useCanvasImage'
import type { PublicScene } from '@convex/lib/scenes'

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
 *
 * Memoised on the scene, like the grid above it and for the same reason: neither a
 * pan nor a token moving changes anything about the map, and this one is holding a
 * decoded bitmap of up to 23 megapixels.
 */
export const SceneImage = memo(function SceneImage({ scene }: SceneImageProps) {
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
})
