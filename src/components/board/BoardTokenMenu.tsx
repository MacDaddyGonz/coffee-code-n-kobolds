import { memo } from 'react'
import { useMutation } from 'convex/react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { BoardToken } from '@/hooks/useBoard'
import { PIP_INK, TOKEN_MARKER_PIPS } from '@/lib/markers'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { TOKEN_LAYERS, TOKEN_LAYER_LABELS } from '@convex/lib/layers'
import { TOKEN_MARKERS, TOKEN_MARKER_LABELS, toggleMarker } from '@convex/lib/markers'
import type { TokenMarker } from '@convex/lib/markers'
import type { PublicScene } from '@convex/lib/scenes'

export type BoardTokenMenuProps = {
  code: string
  /** Present means this browser holds it. Every call behind the menu re-verifies it. */
  dmCode: string | null
  /** Which seat this browser is sitting in, for the writes a player may make. */
  playerId: Id<'players'> | null
  /**
   * The coin, **re-read from the live board by the caller** rather than snapshotted when
   * the menu opened — see `Board`. A coin deleted from under an open menu unmounts it with
   * no effect to correct.
   */
  token: BoardToken
  /** The board on the table: what *take it off this map* means, and where copies land. */
  scene: PublicScene
  /**
   * Where to draw it, in **container pixels**.
   *
   * ⚠️ Deliberately not a `Point`. That type means image space everywhere else on this
   * board, and `@/lib/camera`'s header is entirely about what goes wrong when the two
   * systems are confused — which is nothing at all at 100% zoom and then everything.
   *
   * ⚠️ **Two numbers rather than one object, and that is what makes the `memo` below mean
   * anything.** This menu is deliberately `modal={false}` so the board keeps zooming
   * underneath it, and `Board` re-renders on every frame of that zoom — an object literal
   * at the call site would reconcile the whole portalled subtree, seventeen checkbox items
   * included, sixty times a second. `ZoomControls` takes a scale rather than a camera for
   * exactly this reason.
   */
  atX: number
  atY: number
  onClose: () => void
  /**
   * Select the coin and send the reader to the panel that edits it.
   *
   * ⚠️ **These two were the same function, and both docblocks said this anyway.** The tab
   * was `useState` inside `RightPane`, so nothing on the board could move it; `Board`
   * passed one handler to both props, and it selected the coin and stopped. Two entries
   * with two labels did one thing, and the thing neither of them did is the half these
   * sentences describe. `GameShell` owns the tab now. Kept as two props rather than
   * collapsed into one, because two menu items that mean two things is the fact — and a
   * single prop is how they came to be one function in the first place.
   */
  onEdit: (tokenId: Id<'tokens'>) => void
  /** Select the coin and send the reader to the sheet behind it. See the ⚠️ above. */
  onOpenSheet: (tokenId: Id<'tokens'>) => void
  /** Ask the board to open the duplicate dialog. See the ⚠️ below. */
  onDuplicate: (tokenId: Id<'tokens'>) => void
  /** Ask the board to open the delete confirmation. Same reason. */
  onDelete: (tokenId: Id<'tokens'>) => void
}

/**
 * Right-click a coin.
 *
 * **A surface over five things that already work**, which is why it is the last thing that
 * milestone built: every entry here routes to a mutation or a panel that has its own tests
 * and its own copy. Nothing is decided in this file.
 *
 * ⚠️ **That was true of five of the six, and the sixth shipped broken for a whole
 * milestone.** *Edit this coin* routed to a panel that exists, on a tab nothing here could
 * reach — see the ⚠️ on `onEdit`. Worth leaving as a note on the sentence rather than
 * quietly correcting it: *a surface over things that already work* is only a safe thing to
 * say once somebody has checked that the surface can actually reach them, and the shape of
 * bug it hides is invisible to every guard in this repo. Those prove what a server will not
 * send; this was a client asking for nothing at all.
 *
 * ⚠️ **The label naming the coin is not decoration — it is what makes leaving the selection
 * alone possible.** Right-clicking deliberately does not select: hijacking the selection
 * would move the arrow keys as a side effect of asking a question, and `TokenCoin`'s
 * `onMouseDown` already returns early for anything but the left button. But a menu about
 * an unspecified goblin is useless, so the coin says its own name at the top.
 *
 * ⚠️ **The two destructive-ish entries ask the board to open a dialog rather than hosting
 * one.** A Radix `DialogTrigger` rendered inside a `DropdownMenuItem` is unmounted by the
 * menu closing on select, so the dialog it was going to open never appears. `Board` mounts
 * both dialogs as siblings of this menu and these items set their open state — which is
 * why `ConfirmDialog` grew a controlled pair.
 *
 * **Who gets what.** The DM gets five entries; a seat that controls the coin gets two.
 * Anybody else gets nothing at all — and that decision lives one level up, in the handler
 * that decides whether to open this at all, because the honest way to give somebody no menu
 * is to never suppress their browser's own.
 */
export const BoardTokenMenu = memo(function BoardTokenMenu({
  code,
  dmCode,
  playerId,
  token,
  scene,
  atX,
  atY,
  onClose,
  onEdit,
  onOpenSheet,
  onDuplicate,
  onDelete,
}: BoardTokenMenuProps) {
  const setLayer = useMutation(api.board.setLayer)
  const removeFromScene = useMutation(api.board.removeFromScene)
  const setMarkers = useMutation(api.board.setMarkers)
  const action = useLobbyAction()

  const isDm = dmCode !== null

  const toggle = (marker: TokenMarker) => {
    // Absolute, like every other writer of this array, and built by the one shared
    // function so this surface and the DM's panel cannot produce different orderings for
    // the same tick — see its docblock.
    const next = toggleMarker(token.markers, marker)
    void action.run('markers', `Could not change ${token.name}'s conditions.`, () =>
      setMarkers({
        code,
        tokenId: token._id,
        markers: next,
        ...(dmCode === null ? {} : { dmCode }),
        ...(playerId === null ? {} : { playerId }),
      }),
    )
  }

  return (
    // The wrapper is a zero-size anchor moved to the pointer, and it opts out of the
    // pointer entirely — `TokenHpPopover`'s rule, which every overlay on this board keeps:
    // anything laid over the canvas that eats a click is a token the DM cannot pick up,
    // and it fails silently because a transparent box has nothing on screen to explain
    // why the map stopped responding. The menu itself is portalled and brings its own.
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{ transform: `translate(${atX}px, ${atY}px)` }}
    >
      <DropdownMenu
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        // ⚠️ **Not modal.** A modal dropdown puts `pointer-events: none` on the body and
        // claims the scroll, which freezes the board behind it — the exact failure the
        // overlay rule above exists to prevent, arriving from a library instead of from
        // us. The board's wheel is the zoom.
        modal={false}
      >
        {/*
          ⚠️ **The trigger must live inside the board's container**, and this is the one
          thing here that fails silently if moved. `useBoardKeys` gates every shortcut on
          the container holding focus; Radix returns focus to the trigger on close, so a
          trigger outside it would leave the board without its arrow keys after every
          right-click. Zero-size and hidden from the accessibility tree, because it is an
          anchor rather than a control — nobody ever operates it.
        */}
        <DropdownMenuTrigger aria-hidden tabIndex={-1} className="block size-0" />
        <DropdownMenuContent align="start" side="bottom" sideOffset={0} className="w-56">
          <DropdownMenuLabel className="truncate">{token.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isDm ? (
            <>
              <DropdownMenuItem onSelect={() => onEdit(token._id)}>Edit this coin</DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Who can see it</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {/*
                    Iterated rather than three items written out, which is CLAUDE.md
                    invariant 9's formulation: a fourth layer is a compiler question here
                    rather than a layer with no way to reach it.

                    ⚠️ No warning copy, and that is a real narrowing rather than an
                    oversight. `LAYER_NOTES` lives beside a control that stays on screen,
                    and a menu that closes on the press cannot carry a sentence about what
                    the press did. *Edit this coin* is named first for exactly that reason:
                    the full copy is one press away.
                  */}
                  {TOKEN_LAYERS.map((layer) => (
                    <DropdownMenuCheckboxItem
                      key={layer}
                      checked={token.layer === layer}
                      onSelect={() => {
                        if (token.layer === layer) return
                        void action.run('layer', `Could not move ${token.name}.`, () =>
                          setLayer({ code, dmCode, tokenId: token._id, layer }),
                        )
                      }}
                    >
                      {TOKEN_LAYER_LABELS[layer]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onSelect={() => onDuplicate(token._id)}>
                Duplicate…
              </DropdownMenuItem>

              {/*
                No confirmation, and the copy on the placement panel is why: the coin is
                only off *that* map, it keeps its sheet and its grants, and one press puts
                it back. The toast names the map because from the board the only other
                feedback is the coin vanishing.
              */}
              <DropdownMenuItem
                onSelect={() => {
                  void action.run(
                    'removeFromScene',
                    `Could not take ${token.name} off ${scene.name}.`,
                    async () => {
                      await removeFromScene({
                        code,
                        dmCode,
                        sceneId: scene._id,
                        tokenId: token._id,
                      })
                    },
                  )
                }}
              >
                Take it off this map
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(token._id)}>
                Delete this coin…
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Conditions</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                  {TOKEN_MARKERS.map((marker) => (
                    <DropdownMenuCheckboxItem
                      key={marker}
                      checked={token.markers.includes(marker)}
                      // Ticking three conditions should be one opening rather than three
                      // right-clicks, so the menu is told not to close on select.
                      onSelect={(event) => {
                        event.preventDefault()
                        toggle(marker)
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: TOKEN_MARKER_PIPS[marker].fill, color: PIP_INK }}
                      >
                        {TOKEN_MARKER_PIPS[marker].glyph}
                      </span>
                      {TOKEN_MARKER_LABELS[marker]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/*
                Omitted for a coin standing for nobody, which is the honest answer rather
                than a disabled row — there is no sheet to open. A controller of an
                unattached coin therefore gets a menu of one, which is still not nothing.
              */}
              {token.characterId === null ? null : (
                <DropdownMenuItem onSelect={() => onOpenSheet(token._id)}>
                  Open the sheet
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
