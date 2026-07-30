import { memo } from 'react'
import { Rect, Text } from 'react-konva'

import { BAND_COLOUR, healthFraction, healthLabel } from '@/lib/health'
import type { PublicVitals } from '@convex/lib/characters'
import { healthBand } from '@convex/lib/sheet'

/** Screen-pixel weights, divided by the scale so they hold at any zoom — as `TokenCoin` does. */
const BAR_HEIGHT = 12
const BAR_GAP = 5
const BAR_CORNER = 3
const BAR_EDGE = 1
const LABEL_FONT_SIZE = 9

/**
 * Below this many screen pixels across, a coin stops carrying anything written on
 * it: no name, and no health bar.
 *
 * The threshold was the name's first — a label wider than the coin it belongs to
 * turns a crowded map into a wall of overlapping text with the tokens lost behind
 * it — and a bar has exactly the same failure at exactly the same size, only worse,
 * because twenty of them stacked above twenty coins is a smear of colour rather than
 * a smear of letters. So there is one number and both readers take it.
 *
 * It lives here rather than in `TokenCoin` purely to keep the imports pointing one
 * way. `TokenCoin` already imports this module to draw the bar; exporting the
 * constant from there instead would close the loop, and a circular module whose
 * cycle is only survivable because both reads happen to be inside a render function
 * is not a thing to leave lying about for the next person.
 */
export const COIN_DETAIL_MIN_DIAMETER = 26

/** Dark enough that the four band colours all read against it on any map art. */
const TRACK_FILL = 'rgba(15, 23, 42, 0.85)'
const TRACK_STROKE = 'rgba(0, 0, 0, 0.6)'
/** One ink for all four bands. See the note beside the label for why not four. */
const LABEL_INK = '#ffffff'

export type TokenHealthBarProps = {
  /**
   * What the server was willing to tell **this** client about this creature.
   * Non-null: a token with no character behind it has no bar, and the caller
   * decides that rather than this component drawing an empty one.
   */
  vitals: PublicVitals
  /** The coin's radius, in image-space pixels. The bar spans the coin exactly. */
  radius: number
  /** The camera's scale, for the same reason `TokenCoin` needs it. */
  scale: number
}

/**
 * The health bar above a coin: `20/45` for a hero, `Bloodied` for a monster a
 * player is looking at.
 *
 * **There is no `isDm` here, and adding one would be a bug rather than a feature.**
 * The choice between exact numbers and a band was made in `visibleVitals` on the
 * server, which sends a payload with no numeric field in it at all when the answer
 * is a band — so this renders what arrived and never decides what to reveal. A
 * renderer that could make that choice would already have been handed the secret,
 * which is the whole of CLAUDE.md invariant 1. `@/lib/health` then owns the words,
 * the colours and the widths, because the character sheet draws the same bar in
 * HTML and two definitions of "bloodied yellow" is one definition too many.
 *
 * Drawn as a child of the token `Group`, so it travels with the coin for free —
 * including through the imperative node moves `useSmoothPositions` makes between
 * React renders, which write to the group and never to its children.
 *
 * Memoised, and every prop is a primitive or an identity the join in `useBoard`
 * holds still. Hit points change a few times a round; the camera changes sixty
 * times a second. This must not be the thing that makes a zoom expensive, so there
 * is nothing allocated per render — no dash arrays, no style objects, no arrays of
 * points — and `listening={false}` on all three nodes keeps the bar out of Konva's
 * hit graph entirely. A bar that could be clicked is a token you cannot pick up by
 * its head.
 */
export const TokenHealthBar = memo(function TokenHealthBar({
  vitals,
  radius,
  scale,
}: TokenHealthBarProps) {
  const height = BAR_HEIGHT / scale
  const width = radius * 2
  // Above the coin, where the requirements put it, and clear of the name — which
  // hangs below. The two never compete for the same strip of map.
  const top = -radius - BAR_GAP / scale - height
  const corner = BAR_CORNER / scale
  const fontSize = LABEL_FONT_SIZE / scale

  const fraction = healthFraction(vitals)
  // The band, worked out once and indexed twice — the bar's colour and the ink on
  // top of it have to be the same creature's answer, and `healthColour` would take
  // the same payload and arrive at the same band a second time to give back one of
  // them. `healthBand` is the server's own function rather than its two thresholds
  // copied into a canvas component; `@/lib/health` says at length why a second copy
  // of them is worse than a mismatched yellow.
  const band = vitals.kind === 'band' ? vitals.band : healthBand(vitals.current, vitals.max)

  return (
    <>
      <Rect
        x={-radius}
        y={top}
        width={width}
        height={height}
        cornerRadius={corner}
        fill={TRACK_FILL}
        stroke={TRACK_STROKE}
        strokeWidth={BAR_EDGE / scale}
        listening={false}
        perfectDrawEnabled={false}
      />

      {/*
        The fill is a second rectangle drawn over the track rather than the track
        clipped to a fraction. A Konva clip is a canvas save/clip/restore per coin
        per frame, which is real work on a busy board to achieve a rounded left-hand
        end nobody is looking at — and at zero it would still cost that, whereas a
        zero-width rectangle is simply not drawn.
      */}
      {fraction > 0 ? (
        <Rect
          x={-radius}
          y={top}
          width={width * fraction}
          height={height}
          cornerRadius={corner}
          fill={BAND_COLOUR[band]}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}

      {/*
        Centred inside the bar, and bounded by the coin's own width with `ellipsis`
        doing the truncating — the same decision the name made one file over, for the
        same reason. `Badly hurt` above a one-square goblin clips; six goblins in a
        doorway stay six legible bars instead of one illegible ribbon, and the exact
        state is a click away in the popover.
      */}
      <Text
        x={-radius}
        y={top}
        width={width}
        height={height}
        text={healthLabel(vitals)}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle="bold"
        fill={LABEL_INK}
        wrap="none"
        ellipsis
        // White with a dark halo, and the halo stays — an optimisation to remove it
        // was tried here and is recorded because the reasoning was tempting and
        // wrong.
        //
        // A blurred canvas shadow is the most expensive primitive on the board, and
        // `BoardStage` pans by dragging the stage itself, so every layer is
        // re-rasterised on every frame and this is paid once per creature per frame.
        // The coin's *name* has no way out of that charge because it sits on whatever
        // map art happens to be beneath it — but this label looked like it did, since
        // it sits on a track and a fill this file draws itself in one of exactly four
        // known colours. So the shadow came off and the ink was chosen per band.
        //
        // It sits on **both** of them at once. The label is centred across the whole
        // bar while the fill covers only `width * fraction` from the left, so at half
        // health the right-hand half of the word is over the dark track. The one band
        // light enough to need dark ink is the one where that puts near-black text on
        // a near-black background: half a word, invisible, exactly when somebody is
        // reading it to decide whether to keep attacking. A per-band ink cannot work
        // while there are two backdrops, and making the backdrop uniform costs more
        // than the blur it saves.
        shadowColor="#000000"
        shadowBlur={fontSize * 0.5}
        shadowOpacity={0.95}
        listening={false}
      />
    </>
  )
})
