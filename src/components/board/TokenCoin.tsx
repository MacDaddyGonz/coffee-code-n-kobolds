import { Circle, Group, Text } from 'react-konva'
import type Konva from 'konva'

import { useCanvasImage } from './SceneImage'
import type { PublicToken } from '@convex/lib/board'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * What a coin needs of a token, which is `BoardToken` from `@/hooks/useBoard`
 * spelled out structurally rather than imported.
 *
 * The two are the same type by construction, so a `BoardToken` passes here without
 * a cast. Declaring it locally keeps the canvas independent of the hook that feeds
 * it: these components can be rendered from a DM preview, or from a test, with a
 * hand-written token and no subscription behind it.
 */
export type CoinToken = PublicToken & {
  /** Image-space centre of the token, or null when it is not on this scene. */
  position: Point | null
  /** An affordance only — the server re-checks every move. */
  canMove: boolean
}

/** Screen-pixel weights, divided by the scale so they hold at any zoom. */
const EDGE_WIDTH = 2
const SELECTION_WIDTH = 2
const SELECTION_GAP = 4
const NAME_FONT_SIZE = 12
const NAME_MIN_HALF_WIDTH = 60

/**
 * Below this many screen pixels across, a coin's name is wider than the coin and a
 * crowded map turns into a wall of overlapping labels with the tokens lost behind
 * them. The name goes away and the tint carries the identity until you zoom in.
 */
const NAME_MIN_COIN_DIAMETER = 26

/** White dashes on a dark shadow, so the ring reads on any map art. */
const SELECTION_COLOUR = '#ffffff'

export type TokenCoinProps = {
  token: CoinToken
  scene: PublicScene
  /** The camera's scale. Needed for the same reason GridOverlay needs it. */
  scale: number
  selected: boolean
  draggable: boolean
  onSelect: () => void
  onDragStart?: () => void
  /** Image-space centre, mid-drag. Throttle the writes; see CLAUDE.md invariant 2. */
  onDragMove?: (point: Point) => void
  onDragEnd?: (point: Point) => void
}

/**
 * One token: a round coin, as the requirements ask for, with its art clipped into
 * the circle or its tint and initials when there is no art to draw.
 *
 * Its size comes from the scene rather than from the art — `sizeSquares` squares
 * across, in image-space pixels — which is what makes an ogre four squares wide on
 * every screen at the table regardless of what its picture happens to be.
 *
 * There is no permission logic here, and there is nothing to hide. A DM-layer token
 * reaches this component only on the DM's own screen, because `convex/lib/board.ts`
 * never put one in anybody else's payload. Deciding visibility in a renderer is
 * precisely what CLAUDE.md invariant 1 forbids: the bundle is public, so a client
 * that has been sent a secret has already leaked it whether or not it draws it.
 */
export function TokenCoin({
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

  // A token in the game's library but not on this scene has nothing to draw. The
  // hook above still runs, so the rule against conditional hooks holds.
  const position = token.position
  if (!position) return null

  const diameter = token.sizeSquares * scene.gridSize
  const radius = diameter / 2
  const edge = EDGE_WIDTH / scale
  const nameFontSize = NAME_FONT_SIZE / scale
  const showName = diameter * scale >= NAME_MIN_COIN_DIAMETER

  // Half the width the label is centred in: wide enough for a name on a small coin,
  // and never narrower than the coin itself.
  const nameHalfWidth = Math.max(radius, NAME_MIN_HALF_WIDTH / scale)

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
      // Load-bearing, not decoration. `useSmoothPositions` interpolates a remote
      // token by writing this node's position sixty times a second, and it reaches
      // the node with `stage.findOne('#' + tokenId)` — there is no other route,
      // because the drag handlers below hand out a point rather than a node. Remove
      // this and nothing breaks loudly: remote tokens simply step once per write
      // instead of sliding, which is the one thing this milestone's smoothness
      // criterion is about. Dropping a token back on the square it came from would
      // also leave the coin visually off-centre, because react-konva sees `x`/`y`
      // props that have not changed and so leaves the node where the drag left it.
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
        onSelect()
      }}
      onMouseEnter={(event) => cursor(event, draggable ? 'grab' : 'pointer')}
      onMouseLeave={(event) => cursor(event, '')}
      onDragStart={(event) => {
        cursor(event, 'grabbing')
        onDragStart?.()
      }}
      // Konva owns the node's position for the duration of a drag, so these read it
      // back off the node rather than tracking the pointer themselves. A throttled
      // write echoing back mid-drag lands as a new `x`/`y` prop, which trails the
      // same pointer and so is invisible.
      onDragMove={(event) => onDragMove?.({ x: event.target.x(), y: event.target.y() })}
      onDragEnd={(event) => {
        cursor(event, draggable ? 'grab' : '')
        onDragEnd?.({ x: event.target.x(), y: event.target.y() })
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
          dash={[6 / scale, 4 / scale]}
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
}

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
