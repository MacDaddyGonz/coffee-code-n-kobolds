import type { ReactElement, ReactNode } from 'react'
import { useId, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNumber } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { PublicToken } from '@convex/lib/board'
import { MAX_DUPLICATE_COUNT } from '@convex/lib/limits'
import { duplicateNames, duplicateNamesProblem } from '@convex/lib/names'
import type { PublicScene } from '@convex/lib/scenes'

export type TokenDuplicateDialogProps = {
  code: string
  dmCode: string
  token: PublicToken
  /** Where the copies land. The control is not offered when there is none. */
  scene: PublicScene
  /**
   * Every coin's name in the game, for the preview — read off the `board.tokens` array
   * the caller already holds, so the preview and the write take the same three inputs.
   */
  existingNames: readonly string[]
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * How many names are printed in full before the run is summarised, and how many of the
 * head survive the summary.
 *
 * Six and three, and the pair is chosen rather than tuned: `MAX_DUPLICATE_COUNT` is ten, so
 * the summary is reachable in exactly the top four of the range and the full list covers
 * everything a DM does on a normal press. Three plus an ellipsis plus the last is what makes
 * a summarised run still answer the two questions the preview exists for — *where does the
 * numbering start* and *where does it end* — which a bare count would not.
 */
const PREVIEW_IN_FULL = 6
const PREVIEW_HEAD = 3

/**
 * The run as it is printed: every name up to `PREVIEW_IN_FULL`, and past that the first
 * three, an ellipsis and the last.
 *
 * It never *elides* the last name, which is the one property worth stating. The end of the
 * run is the half a DM cannot work out for themselves — the start they can read off the
 * board — so a summary that dropped it would be a preview of the thing that is already
 * known.
 */
function summariseNames(names: readonly string[]): string[] {
  if (names.length <= PREVIEW_IN_FULL) return [...names]
  return [...names.slice(0, PREVIEW_HEAD), '…', names[names.length - 1]]
}

/**
 * *They will be called **Goblin 4 · Goblin 5 · Goblin 6***.
 *
 * ⚠️ **Exported and mounted by both dialogs, because there is one naming rule and there
 * must be one sentence about it.** `TokenAddDialog` and this file ask `duplicateNames` the
 * same question with the same three inputs — a source name, every name in the game, a count
 * — and the whole point of that function being browser-shared is that what the DM is shown
 * is what the transaction stores. Two spellings of the preview is the drift
 * `TokenAppearanceFields` was extracted to stop, one level smaller: two components that
 * summarise a run differently are two answers to *what am I about to create*. A file of its
 * own for one `<p>` is the alternative, and this is the file that owns the rule's copy.
 *
 * `null` means *not known yet* rather than *nothing*, and the distinction is
 * `TokenPlacementControl`'s discipline about `board.placements`: the numbering is computed
 * from a subscription, and printing `Goblin` at a DM whose board already holds five of them
 * — for the frame before `board.tokens` lands — is a preview that is confidently wrong. An
 * empty array is the genuinely empty case (no name typed yet) and renders nothing at all.
 */
export function CopyNamesPreview({
  names,
}: {
  names: readonly string[] | null
}): ReactElement | null {
  if (names !== null && names.length === 0) return null

  return (
    <p className="text-muted-foreground text-xs">
      They will be called{' '}
      {names === null ? (
        '…'
      ) : (
        <span className="text-foreground font-medium">{summariseNames(names).join(' · ')}</span>
      )}
    </p>
  )
}

/**
 * Copy one coin, N times.
 *
 * **Each copy gets a sheet of its own**, which is the entire feature: Roll20's own
 * documentation tells a GM that eight identical goblins must have their hit-point bars
 * manually unlinked or damaging one damages all eight, and the community wrote a script to
 * work around it. `board.duplicateToken` writes N tokens, N characters and N vitals rows in
 * one transaction, so there is no half-created batch to clean up and no shared pool to
 * discover mid-fight.
 *
 * ⚠️ **The preview is the feature, and it is the same function the server writes from.**
 * `duplicateNames(source, everyNameInTheGame, count)` is pure, total and browser-shared for
 * exactly this reason — see `convex/lib/names.ts`. Nothing here re-implements the base, the
 * numbering or the skip, and nothing here decides the refusal either: `duplicateNamesProblem`
 * is the same predicate `requireBatchNames` throws with, so a batch this dialog offers is a
 * batch the mutation takes, and a batch it refuses is refused with the message that names the
 * fix. The one thing that can differ is *when*: this browser's `board.tokens` subscription
 * can be a frame behind the transaction, which is why the toast is built from the names the
 * server reports rather than from the run on screen.
 *
 * ⚠️ **No `onDuplicated` prop, and the selection deliberately does not move.** Three
 * reasons, and each is on its own enough:
 *
 * - The copies land stacked around the source, so a selection moved to *one of five
 *   identical coins* aims the arrow keys at a pile with nothing on screen saying which of
 *   them is about to move.
 * - The selection is the shell's. `GameShell` owns it precisely so that the board, the
 *   Tokens tab and the delete path cannot disagree about what is selected, and a dialog
 *   reaching up to write it would be a fourth writer of one piece of state.
 * - `TokenAddDialog` does not select what it creates either, and *add five of these* and
 *   *duplicate this five times* are the same act with a different source of the fields. Two
 *   answers to what a press leaves selected is worse than either answer.
 *
 * Controlled or uncontrolled, in `TokenDeleteDialog`'s shape: the editor hands it a trigger
 * and lets it own its open state, and the pair is here for a caller that has to open it from
 * somewhere a `DialogTrigger` cannot live.
 */
export function TokenDuplicateDialog({
  code,
  dmCode,
  token,
  scene,
  existingNames,
  trigger,
  open,
  onOpenChange,
}: TokenDuplicateDialogProps): ReactElement {
  const duplicateToken = useMutation(api.board.duplicateToken)
  const action = useLobbyAction()
  // Not a literal: this dialog is mounted inside the editor, which can be on screen beside
  // the add dialog, and two number fields sharing an id is a label that focuses the wrong
  // control.
  const fieldId = useId()

  // Uncontrolled unless the caller supplies both halves — `ConfirmDialog`'s arrangement.
  const [uncontrolled, setUncontrolled] = useState(false)
  const isOpen = open ?? uncontrolled
  const setOpen = onOpenChange ?? setUncontrolled

  // A **string**, which is what an `<input type="number">` holds: a half-deleted field is
  // `''` and has to stay `''` rather than becoming a 0 the DM has to delete again. The same
  // shape `TokenAppearanceFields` uses for the size, parsed at the one edge that needs a
  // number.
  const [howMany, setHowMany] = useState('1')

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setHowMany('1')
      action.clearError()
    }
  }

  const count = parseNumber(howMany)
  const usable = Number.isInteger(count) && count >= 1 && count <= MAX_DUPLICATE_COUNT
  const busy = action.pending !== null

  // Recomputed on every keystroke, including for a count the write is about to refuse — a
  // preview has to show whatever the control currently says, which is why `duplicateNames`
  // is total and the cap is enforced by the mutation rather than inside it.
  const names = useMemo(
    () => duplicateNames(token.name, existingNames, count),
    [token.name, existingNames, count],
  )
  // The server's own refusal, asked here so the DM reads it before pressing rather than
  // after. Numbering is what makes it reachable at all: the DM never typed `Goblin 10`, the
  // app did, so no field's `maxLength` could have stopped it on the way in.
  const problem = duplicateNamesProblem(names)

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    // What the transaction actually wrote, captured out of the call rather than read off
    // the preview — see the ⚠️ above. `useLobbyAction.run` reports success and not a value,
    // which is the whole of why this is a closed-over variable.
    let written: string[] = []

    const done = await action.run(
      'duplicate',
      `Could not copy ${token.name}.`,
      async () => {
        const result = await duplicateToken({
          code,
          dmCode,
          sceneId: scene._id,
          tokenId: token._id,
          count,
        })
        written = result.names
      },
      // A field rather than a toast: this dialog stays open on a refusal, so there is
      // something for the message to sit under — and the message a DM sees most often here
      // is the over-length one, whose fix is to go and shorten the coin's name.
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    toast.success(
      written.length === 1
        ? `${written[0]} is on ${scene.name}.`
        : `${written[0]} … ${written[written.length - 1]} are on ${scene.name}.`,
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy {token.name}</DialogTitle>
          <DialogDescription>
            The copies land beside it on {scene.name}, on empty squares. They go on that map
            and no other — put them on the rest afterwards, from{' '}
            <span className="font-medium">Which maps it is on</span>.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-count`}>How many copies</Label>
            <Input
              id={`${fieldId}-count`}
              type="number"
              min={1}
              max={MAX_DUPLICATE_COUNT}
              step={1}
              value={howMany}
              onChange={(event) => setHowMany(event.target.value)}
              className="tabular-nums"
              disabled={busy}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">
              Up to {MAX_DUPLICATE_COUNT} at a time. Every copy is a coin, a sheet and a
              hit-point row, so a bigger batch is two presses rather than one.
            </p>

            <CopyNamesPreview names={names} />
          </div>

          {/* ⚠️ **The first sentence is told the truth about *this* coin rather than about
              the feature.** A sheet of its own is the whole point of duplicating a goblin
              and is nothing at all when the source stands for nobody — `duplicateToken`
              copies a character only when there is one to copy — and a barrel promising the
              DM five hit-point pools is copy that will be believed once and never again.
              The second sentence holds either way: a grant is a decision about a person and
              a coin, so it is not copied, which is Milestone 2's *an unattached coin is the
              DM's* reached by a new route. */}
          <p className="text-muted-foreground text-xs">
            {token.characterId === null ? (
              <>
                Each copy gets this coin's layer, size, colour and picture. This one stands for
                nobody, so the copies do too — there is no sheet to split and nothing to
                damage.
              </>
            ) : (
              <>
                Each copy gets this coin's layer, size, colour and picture —{' '}
                <span className="text-foreground font-medium">and a sheet of its own</span>, so
                damaging one leaves the rest at full health.
              </>
            )}{' '}
            Nobody you have handed this coin to gets the copies: an unattached copy is yours
            until you say otherwise.
          </p>

          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">{token.name} is not renamed.</span> A
            new run continues past what is on the board, so the coin you pressed on keeps the
            name it has and the copies take the numbers after it.
          </p>

          <FieldError message={action.error ?? problem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={usable && problem === null}
            // The count, so the button says what the press does — `TokenAddDialog`'s own
            // rule for the same field.
            submitLabel={
              busy
                ? 'Copying…'
                : usable && count > 1
                  ? `Make ${count} copies`
                  : 'Make a copy'
            }
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
