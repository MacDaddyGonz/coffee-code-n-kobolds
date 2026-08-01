import { useId } from 'react'
import { useQuery } from 'convex/react'

import { CodeInput } from '@/components/CodeInput'
import { DialogFormFooter } from '@/components/DialogFormFooter'
import { Label } from '@/components/ui/label'
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
 * ⚠️ **A known asymmetry, pre-existing and left alone:** `CodeInput` normalises
 * through `normaliseJoinCode`, which *drops* characters outside the code alphabet,
 * while the server's `normaliseDmCode` only trims and uppercases. So a DM code
 * pasted as `AB-CD-EF-GH` is silently repaired by this field and would have been
 * refused had the same string reached the server. `ElevateDialog` has done this since
 * the DM code field existed; it is generous in the player's favour and never the
 * other way round, so it is recorded rather than changed.
 *
 * The wording of the failure is `requireDm`'s own, so the door and the in-game
 * elevate control do not describe the same rejection two ways.
 */
export function DmCodeStep({ code, typed, onTyped, onVerified, onCancel, busy }: DmCodeStepProps) {
  const fieldId = useId()
  const verdictId = useId()

  // 'skip' until the field is the right length, so every keystroke on the way to
  // eight characters is not a lookup that answers false. `checkDmCode` takes the
  // *resolved* join code rather than anything still being typed — the step before
  // this one settled which game we are talking about.
  const verified = useQuery(
    api.games.checkDmCode,
    typed.length === DM_CODE_LENGTH ? { code, dmCode: typed } : 'skip',
  )

  const complete = typed.length === DM_CODE_LENGTH

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        // Guarded as well as disabled: Enter submits a form whatever its buttons say,
        // and this is the branch that decides whether a DM code gets written down.
        if (busy || verified !== true) return
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
          aria-invalid={verified === false}
        />
        {/*
          Fixed height so the dialog does not jump between the four states, and
          `aria-live` so the rejection is announced without moving focus off the
          field somebody is about to correct.

          This line does say something on success, where the join code step
          deliberately says nothing, and the difference is not inconsistency: there,
          a success line would only repeat what the button going live already says.
          Here it reports a *consequence* the person cannot otherwise see — that the
          code is about to be written into this browser's storage — which is the whole
          of what this door promises and the one thing a DM on somebody else's laptop
          would want to have been told.
        */}
        <p
          id={verdictId}
          aria-live="polite"
          className={`min-h-5 text-sm ${
            verified === false ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {!complete
            ? 'The code shown when the game was created.'
            : verified === undefined
              ? 'Checking that code…'
              : verified
                ? 'That is your game. This browser will remember the code.'
                : 'That DM code is not right for this game.'}
        </p>
      </div>

      <DialogFormFooter
        busy={busy}
        canSubmit={verified === true}
        submitLabel="Enter game"
        onCancel={onCancel}
      />
    </form>
  )
}
