import type { ReactNode } from 'react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicCharacter } from '@convex/lib/characters'
import type { PublicToken } from '@convex/lib/board'
import { useMutation } from 'convex/react'

export type TokenDeleteDialogProps = {
  code: string
  dmCode: string
  token: PublicToken
  /**
   * What the coin stands for, or null. Resolved by the caller rather than looked up
   * here, because both call sites already hold the roster — the Tokens tab joins it
   * for every row, and the board joins it for the health bars.
   */
  bound: PublicCharacter | null
  /** Uncontrolled: the editor passes a button and lets this own the open state. */
  trigger?: ReactNode
  /** Controlled: the board menu sets these and passes no trigger. See `ConfirmDialog`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * After the server has confirmed. The caller decides what the selection does — the
   * shell's `forgetToken`, in both cases, which is a no-op for a coin that was not the
   * selected one.
   */
  onDeleted?: (tokenId: Id<'tokens'>) => void
}

/**
 * The confirmation, and the sentence about what deleting a coin does **not** do.
 *
 * Split out so the wording is one string rather than one per call site — and it is the
 * *only* place either caller says it, including the panel, which paraphrased it once and
 * had drifted within a commit.
 *
 * ⚠️ **Saying what survives is the whole job of this copy.** A coin and a creature are
 * different things and the application treats them that way — `characters.remove`
 * already exists, already detaches every token pointing at what it deletes, and lives
 * on the Sheets tab. A board mutation reaching into the characters choke point to
 * destroy a sheet is the coupling `TokenAddDialog` refuses in the other direction. So
 * the asymmetry is deliberate, and a DM who expects one press to take both is a DM who
 * will not find the sheet again.
 *
 * ⚠️ **Three states, not two, and the third is why this signature changed.** *Bound and
 * named*, *bound but the name is not to hand*, and *bound to nobody* are different
 * sentences — and a two-state version forced a caller who merely lacked the roster to
 * assert the third. The board's menu is exactly that caller: it holds no
 * `characters.list`, passed `bound={null}`, and so told the DM that a goblin standing on
 * a sheet *stands for no creature and there is no sheet to worry about* — wrong copy, on
 * the one irreversible control in the application, in the sentence written to reassure.
 * `token.characterId` is on the payload every caller already has, so the question is
 * answerable without a subscription.
 */
export function tokenDeleteCopy(
  token: PublicToken,
  bound: PublicCharacter | null,
): { title: string; description: string } {
  const gone =
    'The coin comes off every map it is standing on and its picture is deleted. There is no undo.'
  const survives =
    'the sheet, the hit points and everything written on it stay in the game, and are deleted from the Sheets tab if you want them gone too'

  const description = bound
    ? `${gone} ${bound.name} is not touched — ${survives}.`
    : token.characterId !== null
      ? `${gone} The creature it stands for is not touched — ${survives}.`
      : `${gone} It stands for no creature, so there is no sheet to worry about.`

  return { title: `Delete ${token.name}?`, description }
}

/**
 * Delete one coin.
 *
 * **The only client caller of `board.removeToken`**, which had been complete, DM-gated
 * and covered by its own tests since the board existed with nothing in `src/` calling
 * it at all. Five milestones of new features walked past that.
 *
 * Mounted twice — once in the token editor, once from the board's right-click menu —
 * and one component rather than two so the copy above cannot come apart. The editor
 * hands it a trigger; the menu hands it `open`, because a `DialogTrigger` inside a menu
 * item dies when the menu closes on select.
 *
 * `report: 'toast'` rather than `'field'`: the dialog closes on success, so there is
 * nothing left on screen for a field message to sit under. A refusal resolves `false`,
 * which is what `ConfirmDialog` already keys off to stay open for a retry.
 */
export function TokenDeleteDialog({
  code,
  dmCode,
  token,
  bound,
  trigger,
  open,
  onOpenChange,
  onDeleted,
}: TokenDeleteDialogProps) {
  const removeToken = useMutation(api.board.removeToken)
  const action = useLobbyAction()
  const { title, description } = tokenDeleteCopy(token, bound)

  return (
    <ConfirmDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel="Delete the coin"
      busy={action.pending === 'remove'}
      onConfirm={async () => {
        const done = await action.run('remove', `Could not delete ${token.name}.`, () =>
          removeToken({ code, dmCode, tokenId: token._id }),
        )
        if (done) onDeleted?.(token._id)
        return done
      }}
    />
  )
}
