/**
 * THE SURFACE EVERY CONTROL FLOATING OVER THE MAP IS DRAWN ON.
 *
 * ⚠️ **One constant because it was three copies, and the third one arrived with a set of
 * utilities to cancel the second.** `ZoomControls` and `CalibrateToggle` each carried this
 * string character for character; when the toolbar became a third, `CalibrateToggle` was
 * mounted *inside* it and had to be handed
 * `border-none bg-transparent p-0 shadow-none backdrop-blur-none` to undo the surface it
 * draws for itself. Four negating utilities is what a duplicated surface costs, and a
 * negation that goes stale is invisible — the border stays after the toolbar's is changed,
 * and nothing says why.
 *
 * So the surface is named once and applied by whoever is the outermost floating thing.
 * `CalibrateToggle` no longer draws one at all: it is a tooltip and a button, and the bar
 * around it is the surface — which is the same correction `RollModeBar` took when it gave up
 * its `border-b` and its padding on the way onto the map.
 *
 * `backdrop-blur` with `bg-background/90` rather than an opaque fill, because a map is
 * underneath and a control that hid a square of it would be a control the DM moves the
 * board to see past.
 */
export const BOARD_OVERLAY_SURFACE =
  'bg-background/90 rounded-lg border shadow-sm backdrop-blur'
