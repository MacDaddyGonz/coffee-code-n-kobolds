import { useId } from 'react'
import { useQuery } from 'convex/react'

import { CodeInput } from '@/components/CodeInput'
import { DialogFormFooter } from '@/components/DialogFormFooter'
import { VerdictLine } from '@/components/VerdictLine'
import { Label } from '@/components/ui/label'
import { dmVerdictMessage, dmVerdictOf, isCompleteDmCode } from '@/lib/joinDoor'
import { api } from '@convex/_generated/api'
import { DM_CODE_LENGTH } from '@convex/lib/codes'

export type DmCodeStepProps = {
  /** The server's spelling of the join code, resolved by the step before this one. */
  code: string
  typed: string
  onTyped: (value: string) => void
  /** The code checked out. The caller writes it down and leaves. */
  onVerified: () => void
  onCancel: () => void
  /** The caller is navigating away. Everything goes dead rather than firing twice. */
  busy: boolean
}

/**
 * The DM door's second and last question, and the reason `games.checkDmCode` exists.
 *
 * Without a check here the only way to find out whether a DM code is right is
 * `elevateDm`, which needs a seat — so a mistyped code seats you as a player,
 * `useDm`'s restore effect quietly discards the code it could not use, and you land
 * on the board with the ordinary player's tabs and nothing on screen saying why.
 * That is the failure this whole milestone exists to remove, and asking the question
 * before anybody sits down is what lets the answer appear under the field the code
 * was typed into.
 *
 * ⚠️ **`checkDmCode` is a query, and a `true` from it authorises nothing.** It is not
 * carried anywhere, not stored, and not presented as proof of anything — every
 * DM-only call re-verifies the code server-side through `requireDm` (CLAUDE.md
 * invariant 7). What it buys is a sentence under a field.
 *
 * ⚠️ **The four states and their four sentences are `dmVerdictOf`'s and
 * `dmVerdictMessage`'s, not this component's**, which is the same division
 * `JoinCodeStep` makes with `verdictOf`. They were a nested ternary here, and being a
 * ternary here meant they were the one set of messages on this screen that no test
 * could reach — including the "checking" line, whose agreement with the `'skip'`
 * condition below is the thing most worth being sure of. See `src/lib/joinDoor.ts`.
 *
 * ⚠️ **A known asymmetry, pre-existing and left alone:** `CodeInput` normalises
 * through `normaliseJoinCode`, which *drops* characters outside the code alphabet,
 * while the server's `normaliseDmCode` only trims and uppercases. So a DM code
 * pasted as `AB-CD-EF-GH` is silently repaired by this field and would have been
 * refused had the same string reached the server. `ElevateDialog` has done this since
 * the DM code field existed; it is generous in the player's favour and never the
 * other way round, so it is recorded rather than changed.
 */
export function DmCodeStep({ code, typed, onTyped, onVerified, onCancel, busy }: DmCodeStepProps) {
  const fieldId = useId()
  const verdictId = useId()

  // 'skip' until the field is the right length, so every keystroke on the way to
  // eight characters is not a lookup that answers false. `checkDmCode` takes the
  // *resolved* join code rather than anything still being typed — the step before
  // this one settled which game we are talking about.
  //
  // `isCompleteDmCode` rather than a length test written out here, because
  // `dmVerdictOf` answers `incomplete` from that same function: the skip condition and
  // the line that says a lookup is in flight are one fact, and two spellings of it is
  // how a field comes to sit saying "Checking that code…" about a request nobody made.
  const verified = useQuery(
    api.games.checkDmCode,
    isCompleteDmCode(typed) ? { code, dmCode: typed } : 'skip',
  )

  const verdict = dmVerdictOf({ typed, verified })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        // Guarded as well as disabled: Enter submits a form whatever its buttons say,
        // and this is the branch that decides whether a DM code gets written down.
        if (busy || verdict.kind !== 'ok') return
        onVerified()
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={fieldId}>DM code</Label>
        <CodeInput
          id={fieldId}
          value={typed}
          onChange={onTyped}
          length={DM_CODE_LENGTH}
          placeholder=""
          disabled={busy}
          aria-describedby={verdictId}
          aria-invalid={verdict.kind === 'wrongCode'}
        />
        {/*
          All four sentences are `dmVerdictMessage`'s, including the one on success —
          which the join code step deliberately does not have, for the reason that
          function's docblock gives. The fixed height and the live region are
          `VerdictLine`'s, shared with the join code field this step follows — and with
          the card below the list until that card stopped having a field of its own.

          `wrongCode` is the only arm that is a refusal, so it is the only one in the
          destructive colour: the unfinished state is *not yet* and the success state
          is *that one*, and neither is an error.
        */}
        <VerdictLine
          id={verdictId}
          message={dmVerdictMessage(verdict)}
          tone={verdict.kind === 'wrongCode' ? 'destructive' : 'muted'}
        />
      </div>

      <DialogFormFooter
        busy={busy}
        canSubmit={verdict.kind === 'ok'}
        submitLabel="Enter game"
        onCancel={onCancel}
      />
    </form>
  )
}
