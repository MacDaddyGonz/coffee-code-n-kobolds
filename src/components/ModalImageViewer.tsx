import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ImageIcon } from 'lucide-react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicModalImage } from '@convex/lib/modalImages'

export type ModalImageViewerProps = {
  code: string
  /**
   * Present means this browser holds the DM code, which buys one extra button. It is a
   * display decision and not a guard: `modalImages.hide` re-verifies it server-side
   * (CLAUDE.md invariant 7).
   */
  dmCode: string | null
}

/**
 * The handout pop-up: whatever the DM is holding up, on everybody's screen at once.
 *
 * Mounted once by `GameShell` rather than by whatever opened it, because *nothing* in
 * this browser opens it — the DM's click lands on another machine and arrives here as a
 * change to `modalImages.open`. There is no trigger to hang it off, so it hangs off the
 * screen the whole table is looking at.
 *
 * ⚠️ **Dismissal is local and closing is the DM's, and those are two different acts.**
 * The obvious reading of "the DM closes it for everyone" is a dialog nobody else may
 * shut, and it is wrong in a way that only shows up at a real table: a DM who opens a
 * map of the docks and then goes to make coffee leaves five people staring at it, unable
 * to play, with the only remedy on the other side of the room. So the X dismisses this
 * browser's copy and nothing else, a chip offers it back, and `hide` — the DM's alone —
 * is what takes it down for the group. Nobody is trapped and nobody can un-show a
 * handout for the rest of the table.
 *
 * ⚠️ **Escape reaches this dialog and not the board, and it was worth checking rather
 * than assuming.** `Board.tsx` says a portalled dialog answers Escape first; the
 * mechanism is actually `useBoardKeys`, which ignores every key unless the board
 * container contains `document.activeElement` — and a Radix modal traps focus inside
 * itself, in a portal under `document.body`. So the press dismisses the handout and does
 * not also clear the selected token. The claim holds; the reason is the focus gate.
 *
 * The dialog is modal, which does mean the board is inert while a handout is up. That is
 * the right default for something the DM is asking the table to look at, and it is the
 * reason the DM's own *close for everyone* button is **in here** rather than only in the
 * panel behind: with focus trapped, a DM whose handout is open could not otherwise reach
 * the panel that takes it down.
 */
export function ModalImageViewer({ code, dmCode }: ModalImageViewerProps) {
  const image = useQuery(api.modalImages.open, { code })
  const hide = useMutation(api.modalImages.hide)
  const action = useLobbyAction()

  /**
   * The handout this browser has put away, if any.
   *
   * Held as an id rather than a boolean so that the DM opening a *different* image
   * re-opens the dialog: a stale `true` would silently swallow the next three things the
   * DM held up, and they would have no way of knowing.
   */
  const [dismissed, setDismissed] = useState<Id<'modalImages'> | null>(null)

  // `undefined` while the subscription is still loading, `null` for nothing open — two
  // spellings of the same nothing to draw, flattened once here rather than at every place
  // below that would otherwise have to spell both.
  const handout = image ?? null
  const openId = handout?._id ?? null

  // The other half of the reset, and the case the id comparison alone misses: hiding a
  // handout and showing the same one again is a second act of presentation, so it has to
  // reach a browser that dismissed the first. Passing through "nothing open" is what
  // distinguishes it from a dialog that was never dismissed at all.
  useEffect(() => {
    if (openId === null) setDismissed(null)
  }, [openId])

  const visible = openId !== null && dismissed !== openId

  /**
   * What the dialog draws, which is not quite what the subscription says.
   *
   * Radix keeps the content mounted for the hundred milliseconds it animates out, and by
   * then `hide` has already told every client that nothing is open — so rendering straight
   * off the query would fade out an empty title bar and no picture. The last handout is
   * held for exactly that frame. A ref rather than state because nothing should re-render
   * on account of it: it is only ever read alongside a value that has just changed.
   */
  const lastShown = useRef<PublicModalImage | null>(null)
  if (handout !== null) lastShown.current = handout
  const shown = handout ?? lastShown.current

  const closeForEveryone = () => {
    if (!dmCode) return
    void action.run('hide', 'Could not close the handout.', () => hide({ code, dmCode }))
  }

  return (
    <>
      <Dialog
        open={visible}
        onOpenChange={(next) => {
          // Every route out of a Radix dialog arrives here — the X, Escape, a click on the
          // overlay — and all three mean the same modest thing: *this* browser has put the
          // handout away. Nothing is sent to the server.
          if (!next && openId !== null) setDismissed(openId)
        }}
      >
        {/* No `DialogTrigger`: what opens this is a mutation on somebody else's machine.

            `sm:max-w-[90vw]` as well as `max-w-[90vw]`, because the base content is
            `sm:max-w-sm` — a width for a form — and tailwind-merge keeps a modifier and
            its unprefixed twin side by side, so leaving the `sm:` one out would give a
            handout a 24rem box on every screen wide enough to matter. `p-0` for the same
            reason: the padding is a form's, and a picture wants the frame. */}
        <DialogContent
          className="flex max-h-[90vh] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw]"
          // Radix asks for a description or an explicit statement that there is none, and
          // there is none: the image *is* the content, and a second sentence describing it
          // would be a caption the DM never wrote.
          aria-describedby={undefined}
        >
          {/* Radix will not render a dialog without a title, and the stored name is
              already doing that job — see the schema note on `modalImages.name`, which is
              deliberately one string for the label, the title and the alt text. `pr-12`
              keeps a long name from running under the close button. */}
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle>{shown?.name ?? ''}</DialogTitle>
          </DialogHeader>

          {shown === null ? null : shown.imageUrl === null ? (
            // The blob has gone from under the row, which should not happen. Said plainly
            // rather than rendered as a broken image, because the DM is the only person
            // who can do anything about it and a missing picture looks like a slow one.
            <p className="text-muted-foreground flex items-center gap-2 px-4 py-8 text-sm">
              <ImageIcon className="size-4" aria-hidden />
              This handout's image is missing. The file it was made from is no longer in
              storage.
            </p>
          ) : (
            <img
              src={shown.imageUrl}
              alt={shown.name}
              // The stored dimensions, so the browser reserves the right box before the
              // bytes arrive and the dialog does not jump the moment it decodes. The
              // classes still win on size — these only give the aspect ratio.
              width={shown.imageWidth}
              height={shown.imageHeight}
              decoding="async"
              className="min-h-0 w-auto max-w-full flex-1 self-center object-contain"
            />
          )}

          {/* The DM's own way out, and the one that means it for everybody. `mx-0 mb-0`
              undoes the footer's negative margins, which exist to bleed it to the edges of
              a dialog with `p-4` — this one has none to bleed past. */}
          {dmCode ? (
            <DialogFooter className="mx-0 mb-0">
              <Button
                type="button"
                variant="outline"
                disabled={action.pending !== null}
                onClick={closeForEveryone}
              >
                Close it for everyone
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* The way back in, and the thing that makes dismissal safe to offer at all: put a
          handout away and it is one click back, so nobody has to ask the DM to show it
          again. Only ever on screen while something *is* open, so it disappears of its own
          accord when the DM takes the handout down — there is no state here to clear up
          afterwards.

          Bottom centre, which is the one corner of this screen nothing else has claimed:
          the zoom controls sit bottom left of the map and sonner puts its toasts bottom
          right, where a refused move is reported. */}
      {handout !== null && !visible ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 shadow-md"
          onClick={() => setDismissed(null)}
        >
          <ImageIcon aria-hidden />
          Show {handout.name} again
        </Button>
      ) : null}
    </>
  )
}
