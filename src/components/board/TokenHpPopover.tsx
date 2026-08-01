import { memo, useCallback } from 'react'

import { HpControls } from '@/components/HpControls'
import type { BoardToken } from '@/hooks/useBoard'
import type { Camera } from '@/lib/camera'
import { toScreenSpace } from '@/lib/camera'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicVitals } from '@convex/lib/characters'
import type { PublicScene } from '@convex/lib/scenes'

/**
 * How far below the coin's edge the control sits, in screen pixels.
 *
 * Below rather than above, even though the bar it adjusts is above: the bar is the
 * one thing on the board you are watching while you apply damage, and a panel
 * covering it would hide the answer to the question you just asked. Deep enough to
 * clear the name, which hangs directly under the coin at `NAME_FONT_SIZE`.
 */
const GAP_BELOW_COIN = 24

export type TokenHpPopoverProps = {
  /**
   * The token whose health bar was clicked, taken from the *smoothed* board array
   * so the control is anchored where the coin is drawn rather than where the server
   * last said it was.
   */
  token: BoardToken
  /** For the coin's size in image-space pixels — `gridSize` squares across. */
  scene: PublicScene
  camera: Camera
  /** Damage negative, healing positive. Refused server-side if this seat may not. */
  onAdjust: (characterId: Id<'characters'>, delta: number) => void
}

/**
 * The `+`/`−` controls requirements.md asks for on a health bar — as HTML over the
 * canvas, opened by clicking the bar they belong to.
 *
 * Both halves of that are decisions worth defending.
 *
 * **HTML, not Konva.** The obvious reading of "health bars have +/- controls" is two
 * little shapes drawn on every coin, and on a board with forty creatures on it that
 * is eighty new hit targets a click has to be tested against, eighty more nodes in
 * the layer, and a pair of two-pixel buttons at a fitted zoom that nobody can hit
 * anyway. It also has no keyboard and no screen reader, so the DM's only route to a
 * goblin's hit points would be the mouse. One HTML control gives real buttons, the
 * number field the stepper needs, and focus behaviour nobody has to write.
 *
 * **One at a time, and opened by the bar rather than by the selection.** Still one
 * panel — two would overlap and neither would obviously belong to a creature — but
 * it is now aimed by clicking the thing it edits. Selecting a token is how you pick
 * it up to move it, and following the selection meant this appeared under a
 * creature the instant you touched it, covering the squares you were dragging
 * towards, on every drag whether or not anybody had asked about hit points. The
 * bar is the smallest target that unambiguously names both the creature and the
 * intention. `useHpTarget` holds the choice; `TokenHealthBar` answers the ADR that
 * rejected the shapes-on-the-coin reading, which this is not.
 *
 * The cost of positioning HTML over a canvas is that this element has to move with
 * the camera, so it re-renders on every frame of a pan while the popover is open —
 * which is why it moves by `transform` rather than by `left`/`top`. A transform is
 * a composite; a `left` is a layout of the board's whole subtree, sixty times a
 * second, to slide one small box.
 *
 * That leaves the *other* half of the same cost, which is why the card below is a
 * separate memoised component rather than the markup it looks like it wants to be.
 * Cheap layout is not the same as no work: reconciling the card means two shadcn
 * `Button`s and an `Input` each resolving their variants and running `cn()` — clsx
 * plus tailwind-merge, over the whole class string — and two lucide icon trees, all
 * of it to arrive at exactly the markup already on screen. Only the wrapper's
 * transform actually changes during a pan, so only the wrapper re-renders.
 *
 * Nothing here authorises anything. The caller decides whether to render it from
 * `canEditHp`, which is an affordance mirroring `requireEditableCharacter`, and the
 * mutation behind `onAdjust` re-checks the same question on every click.
 */
export function TokenHpPopover({ token, scene, camera, onAdjust }: TokenHpPopoverProps) {
  const characterId = token.characterId

  // Bound to the character rather than the token, because hit points belong to the
  // character — the same token dropped on a different scene is the same creature.
  const adjust = useCallback(
    (delta: number) => {
      if (characterId !== null) onAdjust(characterId, delta)
    },
    [characterId, onAdjust],
  )

  const position = token.position
  // A token that has left the board, or a coin with no character behind it, has
  // nothing to anchor to and nothing to adjust. After the hook, so the rule against
  // conditional hooks holds.
  if (!position || characterId === null) return null

  // Image space is what the database stores and what every position on this board is
  // expressed in; the popover lives in the browser's pixels. `toScreenSpace` is the
  // one conversion between them — see the note at the top of `@/lib/camera` for what
  // goes wrong when the two are confused, which is nothing at all at 100% zoom and
  // then everything as soon as anybody scrolls the wheel.
  const centre = toScreenSpace(camera, position)
  const radius = (token.sizeSquares * scene.gridSize * camera.scale) / 2

  return (
    // `pointer-events-none` on the wrapper, `auto` on the card. The wrapper is a
    // zero-size anchor here rather than a full-bleed layer, so it swallows very
    // little either way — but the failure it guards against has been paid for once
    // already on this board and is worth restating rather than citing: anything
    // laid over the canvas that eats a click is a token the DM cannot pick up, and
    // it fails silently, because a transparent box has nothing on screen to explain
    // why the map has stopped responding. Every overlay here opts *out* of the
    // pointer by default and opts back in only where it draws something to click.
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{
        // The second translate is a proportion of this element's own width, which is
        // what centres a box whose width depends on its contents without measuring
        // it. Order matters: the percentage must be applied after the pixels.
        transform: `translate(${centre.x}px, ${centre.y + radius + GAP_BELOW_COIN}px) translate(-50%, 0)`,
      }}
    >
      <HpCard vitals={token.vitals} onAdjust={adjust} />
    </div>
  )
}

/**
 * The card itself, held still while the wrapper above it moves.
 *
 * Two props, and both are identities somebody upstream keeps on purpose — which is
 * the whole of whether this memo is worth having, because a single fresh arrow or
 * object literal at the call site would turn it into a comparison that always fails
 * plus the cost of making it. `vitals` arrives by reference from the vitals
 * subscription, through the join in `useBoard` and the spread in
 * `useSmoothPositions`, so it changes when somebody's hit points do and not before.
 * `onAdjust` is `TokenHpPopover`'s own `useCallback` over `useHpActions.adjust`,
 * which is built once and held for the same reason — a mutation re-wrapped with an
 * optimistic update in a render body is a new function every render, and `Board`
 * renders on every camera commit.
 *
 * `HpControls` keeps the stepper's typed amount in its own state. It survives this,
 * because a memo that skips a render leaves the tree exactly as it was — a number
 * half typed into the field is not lost by panning the map away from the token.
 */
const HpCard = memo(function HpCard({
  vitals,
  onAdjust,
}: {
  vitals: PublicVitals | null
  onAdjust: (delta: number) => void
}) {
  return (
    <div className="bg-background/95 pointer-events-auto w-64 rounded-lg border px-2 py-1.5 shadow-lg backdrop-blur">
      <HpControls vitals={vitals} onAdjust={onAdjust} />
    </div>
  )
})
