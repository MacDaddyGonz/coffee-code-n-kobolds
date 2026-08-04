import type Konva from 'konva'

/**
 * The two things every hit-testable node on the board does with a pointer.
 *
 * Written four times before this module existed — on the coin, on the health bar, on the
 * grid grips and on the fog rectangles — which is three times too many for four lines of
 * code whose *reasons* are the long part. All four now call these.
 *
 * ⚠️ **Two call sites deliberately do not use `swallowLeftPress` and write `cancelBubble`
 * inline instead**, and that is a difference rather than an oversight: `GridHandlesLayer`'s
 * `onMouseDown` and `TokenHealthBar`'s `onClick` cancel the bubble for **every** button, not
 * just the left one. Folding them in here would let a right- or middle-press through to the
 * Stage, which is a pan starting under a gesture aimed at something else.
 */

/**
 * Set the cursor for as long as the pointer is over a node, and hand it back when it
 * leaves.
 *
 * The write goes to **Konva's own container**, which sits inside `BoardStage`'s div. That
 * div sets the resting cursor with a class and `cursor` is inherited, so an inline style
 * here overrides it while the pointer is on the node and clearing it — `style: ''` —
 * hands control straight back rather than hard-coding a guess at what the resting cursor
 * was. It is also what lets two nodes hand the cursor between them across a gap: the
 * health bar clears on `mouseleave` and the coin's own `mouseenter` reclaims it.
 */
export function setCursor(event: Konva.KonvaEventObject<MouseEvent>, style: string) {
  const container = event.target.getStage()?.container()
  if (container) container.style.cursor = style
}

/**
 * Keep a left press on this node from reaching the Stage.
 *
 * ⚠️ **Cancel the bubble or the draggable Stage pans under the gesture.** Konva binds
 * both its own drag start and the Stage's pan with a namespaced `mousedown` listener on
 * the ancestor node, so a press that is allowed to bubble means adjusting hit points
 * picks the creature up by its head, and erasing fog slides the map instead. It also
 * stops `stageOf` seeing the click on the way up, which would have `onBackgroundClick`
 * clear the selection every time somebody touched a bar or a grip — the same separation
 * the other way round, since aiming the arrow keys and editing a number are two different
 * intentions.
 *
 * Left button only: a right-click is not an edit, and a middle-drag belongs to the pan.
 */
export function swallowLeftPress(event: Konva.KonvaEventObject<MouseEvent>) {
  if (event.evt.button !== 0) return
  event.cancelBubble = true
}

/**
 * Take a right-press for an application menu of our own.
 *
 * Two halves, and both are needed: no native menu over a coin that has one of ours, and no
 * gesture on the Stage underneath it.
 *
 * ⚠️ **Only called when there really is a menu to open**, which is what makes *a player who
 * controls nothing gets no menu* honest rather than a lie. A right-click that suppresses
 * the browser's own menu and then produces nothing reads as a frozen application; leaving
 * the native menu alone is what right-clicking bare map already does, and it says nothing
 * about the game that the cursor has not said already.
 *
 * ⚠️ **`swallowLeftPress`'s left-button-only rule is what lets a right-press reach a coin at
 * all, and that is now load-bearing rather than incidental.** It returns early for button 2,
 * so a right-press landing on a health bar bubbles up the Konva node tree to the coin's own
 * `Group` and this fires with the coin it belongs to rather than with the bar.
 */
export function claimContextMenu(event: Konva.KonvaEventObject<PointerEvent>) {
  event.evt.preventDefault()
  event.cancelBubble = true
}
