import { memo, useMemo } from 'react'
import { Circle, Group, Text } from 'react-konva'
import type Konva from 'konva'

import { useCanvasImage } from '@/hooks/useCanvasImage'
// The board's token type, imported rather than restated. A structural copy of it
// lived here to keep the canvas independent of the hook that feeds it — but this
// is `import type`, which is erased, so there is no runtime dependency to be
// independent of and nothing stopping a test rendering a hand-written token.
import type { BoardToken } from '@/hooks/useBoard'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/** Screen-pixel weights, divided by the scale so they hold at any zoom. */
const EDGE_WIDTH = 2
const SELECTION_WIDTH = 2
const SELECTION_GAP = 4
const NAME_FONT_SIZE = 12

/**
 * Below this many screen pixels across, a coin's name is wider than the coin and a
 * crowded map turns into a wall of overlapping labels with the tokens lost behind
 * them. The name goes away and the tint carries the identity until you zoom in.
 */
const NAME_MIN_COIN_DIAMETER = 26

/** White dashes on a dark shadow, so the ring reads on any map art. */
const SELECTION_COLOUR = '#ffffff'

export type TokenCoinProps = {
  token: BoardToken
  scene: PublicScene
  /** The camera's scale. Needed for the same reason GridOverlay needs it. */
  scale: number
  selected: boolean
  draggable: boolean
  /**
   * The token comes back out with every callback, so the parent can pass one
   * function for the whole layer instead of closing a fresh one over each coin.
   * That is what lets the memo below actually skip anything: react-konva compares
   * `on*` props by reference and answers a new function by unbinding the old
   * listener and binding the new one, so a per-coin arrow was four detach/attach
   * pairs per coin per render of a board that had not changed.
   */
  onSelect: (token: BoardToken) => void
  onDragStart?: (token: BoardToken) => void
  /** Image-space centre, mid-drag. Throttle the writes; see CLAUDE.md invariant 2. */
  onDragMove?: (token: BoardToken, point: Point) => void
  onDragEnd?: (token: BoardToken, point: Point) => void
}

/**
 * One token: a round coin, as the requirements ask for, with its art clipped into
 * the circle or its tint and initials when there is no art to draw.
 *
 * Its size comes from the scene rather than from the art — `sizeSquares` squares
 * across, in image-space pixels — which is what makes an ogre four squares wide on
 * every screen at the table regardless of what its picture happens to be.
 *
 * Memoised, and every prop above is either a primitive or an identity its parent
 * holds still on purpose. A pan changes the stage's transform and nothing else, so
 * with this in place a pan reconciles no coins at all — where without it a
 * twenty-token board spent every frame of every pan rebuilding eighty Konva event
 * bindings to arrive back where it started.
 *
 * There is no permission logic here, and there is nothing to hide. A DM-layer token
 * reaches this component only on the DM's own screen, because `convex/lib/board.ts`
 * never put one in anybody else's payload. Deciding visibility in a renderer is
 * precisely what CLAUDE.md invariant 1 forbids: the bundle is public, so a client
 * that has been sent a secret has already leaked it whether or not it draws it.
 */
export const TokenCoin = memo(function TokenCoin({
  token,
  scene,
  scale,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: TokenCoinProps) {
  const art = useCanvasImage(token.artUrl)

  // Held still across renders that did not change the zoom. A fresh array is a
  // fresh prop identity to Konva, which sets the attribute and asks for a redraw
  // of the layer whether or not the two dashes in it differ.
  const selectionDash = useMemo(() => [6 / scale, 4 / scale], [scale])

  // A token in the game's library but not on this scene has nothing to draw. The
  // hooks above still run, so the rule against conditional hooks holds.
  const position = token.position
  if (!position) return null

  const diameter = token.sizeSquares * scene.gridSize
  const radius = diameter / 2
  const edge = EDGE_WIDTH / scale
  const nameFontSize = NAME_FONT_SIZE / scale
  const showName = diameter * scale >= NAME_MIN_COIN_DIAMETER

  // Half the width the label is centred in — and it is the coin's own half-width,
  // deliberately, with `ellipsis` below doing the truncating.
  //
  // It used to be `max(radius, 60 / scale)`, which at a fitted zoom made the box
  // around two and a half squares wide. Two tokens standing next to each other then
  // overprinted their names into an unreadable smear, and a huddle of six was worse.
  // A label that cannot leave its own square cannot collide with its neighbour, so
  // the board stays readable exactly when it is busiest — which is the case that
  // matters. The price is a clipped name on a one-square coin; the full name is a
  // hover away, and the tint and art carry the identity in the meantime.
  const nameHalfWidth = radius

  const cursor = (event: Konva.KonvaEventObject<MouseEvent>, style: string) => {
    // Konva's own container, which sits inside BoardStage's div. That div sets the
    // resting cursor with a class and `cursor` is inherited, so writing an inline
    // style here overrides it while the pointer is on a coin and clearing it hands
    // control straight back.
    const container = event.target.getStage()?.container()
    if (container) container.style.cursor = style
  }

  return (
    <Group
      // Load-bearing, not decoration: it is how `useSmoothPositions` finds this node
      // to interpolate it, and removing it degrades silently rather than breaking.
      // The mechanism and the two symptoms are documented once, in useTokenMove.ts.
      id={token._id}
      x={position.x}
      y={position.y}
      draggable={draggable}
      onMouseDown={(event) => {
        // Selecting on press rather than on release, so a drag starts on a token
        // that is already selected and the arrow keys are aimed at it the instant
        // you touch it. Left button only: a right-click is not a selection, and a
        // middle-drag never reaches Konva because BoardStage claims it for panning.
        if (event.evt.button !== 0) return
        onSelect(token)
      }}
      onMouseEnter={(event) => cursor(event, draggable ? 'grab' : 'pointer')}
      onMouseLeave={(event) => cursor(event, '')}
      onDragStart={(event) => {
        cursor(event, 'grabbing')
        onDragStart?.(token)
      }}
      // Konva owns the node's position for the duration of a drag, so these read it
      // back off the node rather than tracking the pointer themselves. A throttled
      // write echoing back mid-drag lands as a new `x`/`y` prop, which trails the
      // same pointer and so is invisible.
      onDragMove={(event) => onDragMove?.(token, { x: event.target.x(), y: event.target.y() })}
      onDragEnd={(event) => {
        cursor(event, draggable ? 'grab' : '')
        onDragEnd?.(token, { x: event.target.x(), y: event.target.y() })
      }}
    >
      {selected ? (
        // Outside the coin and dashed, not a recolouring of the coin's own edge:
        // "this is what the arrow keys will move" has to be unmistakable even when
        // the token's tint happens to be white.
        <Circle
          radius={radius + SELECTION_GAP / scale}
          stroke={SELECTION_COLOUR}
          strokeWidth={SELECTION_WIDTH / scale}
          dash={selectionDash}
          shadowColor="#000000"
          shadowBlur={3 / scale}
          shadowOpacity={0.9}
          listening={false}
        />
      ) : null}

      <Circle
        radius={radius}
        // The tint shows through as the fill whenever the art is missing, still
        // loading or failed to load — one fallback for all three, so a coin is
        // never an invisible hole on the map.
        fill={art ? undefined : token.tint}
        {...fillPattern(art, diameter)}
        stroke={token.tint}
        strokeWidth={edge}
        // A soft drop shadow is what lifts a coin off busy map art. Excluding the
        // stroke from it is both cheaper and no visible loss, since the fill covers
        // the whole circle and casts the same halo.
        shadowColor="#000000"
        shadowBlur={6 / scale}
        shadowOpacity={0.45}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
      />

      {art ? null : (
        <Text
          text={initialsOf(token.name)}
          x={-radius}
          y={-radius}
          width={diameter}
          height={diameter}
          align="center"
          verticalAlign="middle"
          fontSize={radius * 0.9}
          fontStyle="bold"
          fill={readableInk(token.tint)}
          listening={false}
        />
      )}

      {showName ? (
        <Text
          text={token.name}
          x={-nameHalfWidth}
          y={radius + edge * 2}
          width={nameHalfWidth * 2}
          align="center"
          fontSize={nameFontSize}
          fill="#ffffff"
          wrap="none"
          ellipsis
          shadowColor="#000000"
          shadowBlur={nameFontSize * 0.4}
          shadowOpacity={0.95}
          listening={false}
        />
      ) : null}
    </Group>
  )
})

/**
 * Fill the circle with the art, whatever shape the art is.
 *
 * Konva applies a fill pattern in the shape's own coordinate system, where a circle
 * is centred on the origin, and it applies the offset in *pattern* space — before
 * the scale. So the offset is half the image's natural size, not half the coin's:
 * miss that and the art lands with its top-left corner in the middle of the coin,
 * at whatever size the file happened to be.
 *
 * The scale is uniform and keyed off the image's shorter edge, which is a CSS
 * `cover`: the short edge spans the diameter exactly, the long one overflows and is
 * clipped away by the circle. Scaling each axis independently would fit the whole
 * picture in and squash every portrait token into an oval.
 */
function fillPattern(art: HTMLImageElement | null, diameter: number) {
  const width = art?.naturalWidth ?? 0
  const height = art?.naturalHeight ?? 0
  if (!art || width <= 0 || height <= 0) return {}

  const cover = diameter / Math.min(width, height)

  return {
    fillPatternImage: art,
    fillPatternOffset: { x: width / 2, y: height / 2 },
    fillPatternScale: { x: cover, y: cover },
    fillPatternRepeat: 'no-repeat',
  }
}

/** Up to two initials for an art-less coin. Split by code point, so an emoji name survives. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * Ink that can be read on the tint. The server already validates a tint as
 * `#rrggbb`, so the guards here are only for a value that arrived some other way —
 * a preview in the DM's panel with a half-typed colour in it.
 */
function readableInk(tint: string): string {
  const hex = tint.replace('#', '')
  if (hex.length !== 6) return '#ffffff'

  const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((pair) =>
    Number.parseInt(pair, 16),
  )
  if (channels.some((channel) => Number.isNaN(channel))) return '#ffffff'

  // Rec. 601 luma, which is close enough for a two-way choice and needs no gamma.
  const [red, green, blue] = channels as [number, number, number]
  const luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luma > 0.6 ? '#111111' : '#ffffff'
}
