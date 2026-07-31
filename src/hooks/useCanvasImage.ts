import { useEffect, useState } from 'react'

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
    let settled = false

    // Dropped as soon as the load is over, on the way to success as much as on the
    // way out. An `onload` closure is a reference to this whole effect scope, and
    // leaving it attached to an element that is now holding a 23-megapixel decoded
    // map keeps every local beside it alive for as long as the map is on screen.
    const detach = () => {
      loading.onload = null
      loading.onerror = null
    }

    loading.onload = () => {
      settled = true
      detach()
      if (live) setImage(loading)
    }
    loading.onerror = () => {
      settled = true
      detach()
      if (live) setImage(null)
    }
    loading.src = url

    return () => {
      live = false
      // A flag would only *ignore* the result. Clearing `src` asks the browser to
      // abandon the transfer and the decode, which is the difference between
      // switching scenes twice and downloading two full maps to look at one of
      // them. Only for a load still in flight: blanking the src of an element that
      // has already decoded would throw away pixels Konva may still be drawing
      // this frame.
      if (!settled) {
        detach()
        loading.src = ''
      }
    }
  }, [url])

  return image
}
