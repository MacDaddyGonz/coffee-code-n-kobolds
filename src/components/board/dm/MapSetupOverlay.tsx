import { useState } from 'react'

import { MapSetupPanel } from '@/components/board/dm/MapSetupPanel'
import { Button } from '@/components/ui/button'

export type MapSetupOverlayProps = {
  code: string
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string
}

/**
 * The DM's map panel, over the board, behind one button.
 *
 * It exists because the setup the panel does is not all setup. A grid that lines up
 * on the DM's monitor at the size they calibrated it and drifts by half a square by
 * the far wall is something you notice once tokens are standing on it — and with
 * the panel only in the lobby, fixing it meant sending the whole table off the board
 * to do it. Adding a map mid-session and switching to it is the same story.
 *
 * Collapsed by default, and the wrapper is `pointer-events-none` so that the empty
 * space it reserves is not a hole in the map: only the button and the open panel
 * take the pointer. That matters more here than anywhere else in the app, because
 * anything that swallows a click over the canvas is a token the DM cannot pick up
 * and no visible reason why.
 */
export function MapSetupOverlay({ code, dmCode }: MapSetupOverlayProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-none absolute top-3 right-3 bottom-3 flex w-full max-w-md flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant={open ? 'default' : 'outline'}
        aria-expanded={open}
        className="pointer-events-auto bg-background/90 shadow-sm backdrop-blur"
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Hide map setup' : 'Map setup'}
      </Button>

      {open ? (
        // Scrolls inside itself rather than growing past the bottom of the board:
        // the calibrator and both dialogs' triggers together are taller than a short
        // viewport, and a panel running off the canvas takes its Save button with it.
        <div className="pointer-events-auto min-h-0 w-full overflow-y-auto">
          <MapSetupPanel
            code={code}
            dmCode={dmCode}
            className="bg-background/95 shadow-lg backdrop-blur"
          />
        </div>
      ) : null}
    </div>
  )
}
