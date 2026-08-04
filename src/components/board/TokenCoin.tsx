import { memo, useMemo } from 'react'
import { Circle, Group, Line, Text } from 'react-konva'

import { claimContextMenu, setCursor } from './konvaPointer'
import { COIN_DETAIL_MIN_DIAMETER, TokenHealthBar } from './TokenHealthBar'
import { TokenMarkerPips } from './TokenMarkerPips'
import { TokenStatBadges } from './TokenStatBadges'
import { useCanvasImage } from '@/hooks/useCanvasImage'
// How tall a row of pips is, imported rather than re-derived. The coupling between the
// name's `y` here and the row `TokenMarkerPips` draws is a named constant for the same
// reason `COIN_DETAIL_MIN_DIAMETER` above is one: two files agreeing by arithmetic agree
// until one of them is edited, and the symptom is a name printed through the pips on
// every coin that carries a condition.
import { MARKER_ROW_SCREEN_HEIGHT } from '@/lib/markers'
// The tint and the letters on an art-less coin, shared with the HTML profile icon
// that draws a seat the same way — one function of a name, so a person is the same
// disc on the board as in the roster. See `@/lib/avatar`.
import { initialsOf, readableInk } from '@/lib/avatar'
// The board's token type, imported rather than restated. A structural copy of it
// lived here to keep the canvas independent of the hook that feeds it — but this
// is `import type`, which is erased, so there is no runtime dependency to be
// independent of and nothing stopping a test rendering a hand-written token.
import type { BoardToken } from '@/hooks/useBoard'
import type { Id } from '@convex/_generated/dataModel'
import type { Point } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'

/** Screen-pixel weights, divided by the scale so they hold at any zoom. */
const EDGE_WIDTH = 2
const SELECTION_WIDTH = 2
const SELECTION_GAP = 4
const NAME_FONT_SIZE = 12

/** White dashes on a dark shadow, so the ring reads on any map art. */
const SELECTION_COLOUR = '#ffffff'

/**
 * The hidden-from-the-party mark: a small dark disc with a stroke through it, pinned to
 * the coin's upper-right shoulder.
 *
 * ⚠️ **Deliberately nothing like the selection ring.** That is a dashed white circle
 * *outside* the coin meaning "the arrow keys will move this", and the two would be read as
 * one thing if this were also a ring — a DM who thought the marked coins were the selected
 * ones would have exactly the wrong picture of their own board. A filled pip inside the
 * coin's outline, in the universal shape for *not*, cannot be confused with it.
 *
 * A mark rather than a word, and rather than dimming the coin: the GM layer already
 * spends opacity (`GM_LAYER_OPACITY`), the bar is above the coin and the name below it, so
 * this is the one place left that is quiet and unoccupied.
 *
 * Screen-pixel sizes over the scale, like every other annotation here — an eight-pixel
 * pip stays an eight-pixel pip on a one-square goblin and on a four-square dragon, which
 * is what keeps it subtle on the creature it matters most for.
 */
const HIDDEN_RADIUS = 7
const HIDDEN_FILL = 'rgba(2, 6, 23, 0.92)'
const HIDDEN_INK = '#e2e8f0'
const HIDDEN_STROKE = 1.5
/** Where on the rim it sits: up and to the right, at 45°. */
const HIDDEN_ANGLE = Math.SQRT1_2

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
  /**
   * Passed straight through to the health bar, which is the only thing here that
   * opens the hit point editor. An id rather than the token, because it crosses one
   * more component boundary than the callbacks above and the note about stable
   * identities applies the whole way down.
   */
  onOpenHp: (tokenId: Id<'tokens'>) => void
  /**
   * A right-click on this coin, in **client** pixels — the board converts them, because it
   * is the one holding the container's rectangle.
   *
   * ⚠️ **Only fired when this caller has a menu to be given**, which is `token.canMove`:
   * the DM everywhere, a seat on the coins it controls, and nobody else. That test lives
   * here rather than in the menu because *no menu at all* has to mean the browser's own
   * menu appears — and suppressing it and then showing nothing is what reads as a broken
   * application. `canMove` is already the affordance mirroring `requireMovableToken`, which
   * is also what gates the marker write, so this is one rule on a third surface rather than
   * a fourth predicate.
   */
  onContextMenu?: (token: BoardToken, at: { clientX: number; clientY: number }) => void
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
  onOpenHp,
  onContextMenu,
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
  // One test for both things written on a coin — the name below and the health bar
  // above — and for the two things marked on it, the hidden-from-party pip and the
  // row of conditions, so a zoom-out drops all four together rather than leaving a
  // board of bars and pips over anonymous discs. The threshold and the argument for
  // it live with the bar; see `COIN_DETAIL_MIN_DIAMETER`, and see `pipCapacity` for
  // the coupling that makes the same number guarantee a row has room for two pips.
  const showDetail = diameter * scale >= COIN_DETAIL_MIN_DIAMETER

  // ⚠️ **THE NAME IS NO LONGER CLAMPED, AND THAT REVERSES A DECISION RATHER THAN
  // CORRECTING AN OVERSIGHT. Read both halves before changing it back.**
  //
  // It was `radius` with `ellipsis` below, so a label could never leave its own square.
  // The argument for that was real and is worth keeping written down: before it, the box
  // was `max(radius, 60 / scale)` — around two and a half squares wide at a fitted zoom —
  // and two coins standing next to each other overprinted their names into an unreadable
  // smear, with a huddle of six worse. A label that cannot leave its square cannot collide
  // with its neighbour, so the board stayed readable exactly when it was busiest.
  //
  // What that cost was the case people actually hit: at the zoom where a whole map fits,
  // *every* name on the board is an ellipsis and a letter, because the clamp is the coin's
  // drawn width and the coin is small. A board of `Gob…` `Gob…` `Gob…` is not more readable
  // than an overlap — it is the same information loss with none of the width. The
  // maintainer was shown the trade and chose the overlap.
  //
  // So there is no `width` and no `ellipsis` on the `Text` below at all: Konva measures the
  // string and centres it on the coin. Names overlap when creatures stand shoulder to
  // shoulder, and that is the accepted cost. **If it becomes intolerable, the fix is not to
  // reinstate this clamp** — that is the arrangement this replaced — it is to show the full
  // name only for the hovered or selected coin, which was the third option and was not
  // chosen. Recorded in ADR 0014.
  //
  // The box itself stays, because it is what centres the label — see the ⚠️ on the `Text`.
  const nameHalfWidth = radius

  // ⚠️ **The name yields to the pips.** Nothing else can: the bar owns the strip above
  // the rim, the hidden mark owns the upper-right shoulder, and the row has to sit
  // against the coin it is about — a row hung *below* the name would be an annotation
  // about whichever creature is standing underneath. So the name drops by exactly the
  // row's height when there is one and sits where it always did when there is not.
  //
  // The condition is the stored array rather than what `markerRow` actually draws,
  // which is a deliberate approximation: a coin marked *only* with a value this bundle
  // has never heard of reserves a strip for a row it then draws nothing in, and the
  // symptom is a few pixels of gap under one coin during the seconds of a non-atomic
  // schema push. The alternative is a second `markerRow` call per coin per frame of
  // every pan, to be exact about a gap nobody can see.
  const hasMarkers = token.markers.length > 0
  const nameTop = hasMarkers ? MARKER_ROW_SCREEN_HEIGHT / scale : edge * 2

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
      onMouseEnter={(event) => setCursor(event, draggable ? 'grab' : 'pointer')}
      onMouseLeave={(event) => setCursor(event, '')}
      onContextMenu={(event) => {
        // ⚠️ **Nothing happens for a caller with no menu, and that is the feature rather
        // than a missing branch.** The browser's own menu is then left alone, which is what
        // right-clicking bare map already does; suppressing it and showing nothing is what
        // reads as the application having frozen. `canMove` is the same affordance the
        // drag and the marker write use, so this is one rule on a third surface.
        if (!onContextMenu || !token.canMove) return
        claimContextMenu(event)
        onContextMenu(token, { clientX: event.evt.clientX, clientY: event.evt.clientY })
      }}
      onDragStart={(event) => {
        setCursor(event, 'grabbing')
        onDragStart?.(token)
      }}
      // Konva owns the node's position for the duration of a drag, so these read it
      // back off the node rather than tracking the pointer themselves. A throttled
      // write echoing back mid-drag lands as a new `x`/`y` prop, which trails the
      // same pointer and so is invisible.
      onDragMove={(event) => onDragMove?.(token, { x: event.target.x(), y: event.target.y() })}
      onDragEnd={(event) => {
        setCursor(event, draggable ? 'grab' : '')
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

      {/*
        Rendered only when there is something to draw, and the condition is the
        token's own `vitals` rather than anything this component works out. A coin
        for a character carries a bar, a scenery marker does not, and whether the bar
        says `20/45` or `Bloodied` was settled on the server long before the payload
        reached this bundle (CLAUDE.md invariant 1).

        `vitals` is an object, so it would defeat the memo above if it were rebuilt
        each render — it is not: it comes from the vitals subscription by reference,
        through the join in `useBoard`, and changes only when somebody's hit points
        actually do.
      */}
      {showDetail && token.vitals ? (
        <TokenHealthBar
          vitals={token.vitals}
          radius={radius}
          scale={scale}
          // The bar is the way in to the hit point editor, so it needs both the id
          // to hand back and the affordance that decides whether it listens at all.
          // Both are primitives off a token this component already has.
          tokenId={token._id}
          canEditHp={token.canEditHp}
          onOpenHp={onOpenHp}
        />
      ) : null}

      {/*
        THE DM'S CUE, and it is required rather than decorative. Fog is a veil on the
        DM's own screen — they see straight through it — so nothing else on this board
        says that the party has stopped seeing this creature, and nothing else says that
        the rectangle just dragged over the corridor also covered somebody in it.

        `hiddenFromParty` is false for every client but the DM's, and the coins it is true
        of are the ones `foggedTokenIds` withheld from the party's board entirely — the
        same three clauses, sharing `anyRectCovers` rather than restating it, so the mark
        and the withholding cannot come apart. A hero or a granted pet is deliberately
        never marked: the server does not fog one, so a mark would be a lie about the one
        thing the DM would act on.

        Behind `showDetail` with the bar, the conditions and the name, so a zoom-out drops
        the coin's four annotations together rather than leaving pips over anonymous discs.
      */}
      {showDetail && token.hiddenFromParty ? (
        <Group
          x={radius * HIDDEN_ANGLE}
          y={-radius * HIDDEN_ANGLE}
          listening={false}
        >
          <Circle
            radius={HIDDEN_RADIUS / scale}
            fill={HIDDEN_FILL}
            stroke={HIDDEN_INK}
            strokeWidth={HIDDEN_STROKE / scale}
            perfectDrawEnabled={false}
          />
          <Line
            points={[
              (-HIDDEN_RADIUS * 0.5) / scale,
              (HIDDEN_RADIUS * 0.5) / scale,
              (HIDDEN_RADIUS * 0.5) / scale,
              (-HIDDEN_RADIUS * 0.5) / scale,
            ]}
            stroke={HIDDEN_INK}
            strokeWidth={HIDDEN_STROKE / scale}
            lineCap="round"
            perfectDrawEnabled={false}
          />
        </Group>
      ) : null}

      {/*
        WHAT THE CREATURE IS: armour class in red, passive perception in blue, on the two
        left shoulders.

        ⚠️ **These publish a number that was a secret until ADR 0014**, and the reason that
        is safe is not in this file. `token.vitals` is null for a creature the caller may
        not see, because `visibleVitals` drops it before assembling a row — so a GM-layer or
        fogged creature has no numbers here for the same reason it has no health bar. There
        is no `isDm` in the component below and there must not be, exactly as there is none
        in `TokenHealthBar`.

        Behind `showDetail` with everything else, so a zoom-out drops the coin's annotations
        together. The disc is the size of a condition pip on purpose — see the component.
      */}
      {showDetail ? (
        <TokenStatBadges vitals={token.vitals} radius={radius} scale={scale} />
      ) : null}

      {/*
        THE CONDITIONS, and they are labels and nothing else — no roll consults one, no
        health band is computed from one, no drag is refused because of one, and
        `markerGuard.test.ts` on the server is what makes that a promise rather than a
        comment. `token.markers` is read off the payload exactly as `vitals` is; this
        component decides nothing about which of them arrived.

        ⚠️ **Fog does not take these away**, unlike a coin's position, its health band and
        its feed lines. That is `board.tokens`' argument reached by a second route and
        argued in full on the field in `useBoard`: filtering conditions means reading
        `tokenPositions` in a query whose whole virtue is being off the drag path. A
        creature that must not be known about goes on the GM layer, where the row never
        reaches this bundle at all.

        **The composition of a coin, which is disjoint by construction:** the bar occupies
        the strip above the rim, the name the strip below, the hidden-from-party pip the
        upper-right shoulder at 45°, the two stat badges the two *left* shoulders at 45°,
        and this row the strip between the rim and the name — which is why `nameTop` above
        exists and why it is the *name* that yields. **Six annotations, six places**, and no
        two of them can ever be asked to share one.

        ⚠️ **It was four, and the badges were placed by consulting this sentence.** The
        scheme is only worth anything if the next person adding a mark reads it first and
        takes a place nothing else has, rather than putting a badge where it happens to look
        right on the coin in front of them. The left shoulders were what was left; there is
        no seventh obvious place, so a seventh annotation is a layout decision rather than a
        position.
      */}
      {/*
        ⚠️ **Gated on `hasMarkers` as well as `showDetail`, and the second test is not
        redundant with the component's own early return.** `scale` is a prop here, so a
        wheel-zoom busts this memo on every frame — which without the gate meant mounting
        two hundred `TokenMarkerPips`, each missing its `useMemo` on the changed `scale`
        and running a seventeen-member intersection to conclude that nothing is ticked. It
        renders `null` either way; the gate is about not asking. `hasMarkers` is already
        computed above for `nameTop`, so it costs nothing.
      */}
      {showDetail && hasMarkers ? (
        <TokenMarkerPips markers={token.markers} radius={radius} scale={scale} />
      ) : null}

      {showDetail ? (
        <Text
          text={token.name}
          x={-nameHalfWidth}
          y={radius + nameTop}
          width={nameHalfWidth * 2}
          align="center"
          // ⚠️ **`ellipsis` is gone and the box has stayed** — see the long note above
          // `nameHalfWidth`, which is where the reversal is argued. Keeping the box is what
          // makes this a two-character change rather than a measurement problem: with
          // `wrap="none"` and nothing to truncate, Konva measures the line and centres it
          // inside the box, so a line wider than the box overflows *symmetrically* and the
          // name stays centred on the coin. Dropping the width instead would left-align
          // every name against the coin's centre, because `align` means nothing without one.
          fontSize={nameFontSize}
          fill="#ffffff"
          wrap="none"
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
