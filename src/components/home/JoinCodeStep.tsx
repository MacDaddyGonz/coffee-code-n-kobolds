import { useId } from 'react'
import { useQuery } from 'convex/react'

import { CodeInput } from '@/components/CodeInput'
import { DialogFormFooter } from '@/components/DialogFormFooter'
import { Label } from '@/components/ui/label'
import { verdictMessage, verdictOf } from '@/lib/joinDoor'
import { api } from '@convex/_generated/api'
import { isCompleteJoinCode } from '@convex/lib/codes'
import type { GameListing } from './GameListRow'

export type JoinCodeStepProps = {
  /** The row that was clicked. Its `_id` is what the typed code is checked against. */
  game: GameListing
  typed: string
  onTyped: (value: string) => void
  /** Called with the **server's** spelling of the code, not the typed one. */
  onResolved: (code: string) => void
  onCancel: () => void
}

/**
 * The first question either door asks: what is the join code for this game?
 *
 * **Both doors ask it, and a row that already identifies the game is not a reason
 * to skip it.** `games.list` publishes no join code — the whole point of that
 * omission is that a row says a game *exists* while the code still admits you to it
 * — so this step is where the credential actually arrives. Without it the landing
 * page would be a list of games anyone could walk into.
 *
 * The check is `games.getByCode`, which the *Join with a code* panel beside the list
 * already holds with the same argument shape, so a browser that has both on screen
 * pays for one subscription. `'skip'` until the code could plausibly match
 * something, so half-typed codes are not a stream of lookups all answering "no such
 * game" — the same reasoning, and the same guard, as that panel.
 *
 * ⚠️ **The verdict is `verdictOf`'s and not this component's**, and that is where
 * the interesting rule lives: the resolved game is compared by `_id` against the row
 * that was clicked, never by name, because two games may share a title and a code
 * that opens a *different* one of them is exactly the mistake worth catching here.
 * See `src/lib/joinDoor.ts`.
 *
 * No `autoFocus` on the field: it is the first tabbable element inside
 * `DialogContent`, so Radix's focus scope lands on it when the dialog opens. Setting
 * one as well would be two mechanisms competing for the same outcome.
 */
export function JoinCodeStep({ game, typed, onTyped, onResolved, onCancel }: JoinCodeStepProps) {
  const codeId = useId()
  const alphabetHintId = useId()
  const verdictId = useId()

  const resolved = useQuery(
    api.games.getByCode,
    isCompleteJoinCode(typed) ? { code: typed } : 'skip',
  )
  const verdict = verdictOf({ typed, expectedGameId: game._id, resolved })
  const message = verdictMessage(verdict)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        // Guarded as well as disabled, because Enter in a text field submits a form
        // whatever its buttons are doing — and this is the branch that decides which
        // code the rest of the flow is about.
        if (verdict.kind !== 'ok') return
        onResolved(verdict.code)
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={codeId}>Join code</Label>
        <CodeInput
          id={codeId}
          value={typed}
          onChange={onTyped}
          aria-describedby={`${alphabetHintId} ${verdictId}`}
          aria-invalid={verdict.kind === 'noSuchGame' || verdict.kind === 'wrongGame'}
        />
        <p id={alphabetHintId} className="text-muted-foreground text-xs">
          Codes never contain I, L, O, 0 or 1.
        </p>
        {/*
          Fixed height and `aria-live`, so the dialog does not jump as the message
          appears and so a screen reader hears the answer without moving focus off
          the field. It is deliberately the *only* thing this line says: there is no
          "that's the right code" reassurance, because the Continue button going live
          is that, and a field that congratulates you on typing six characters is
          noise. `verdictMessage` returns null for both of the states with nothing
          to report.
        */}
        <p
          id={verdictId}
          aria-live="polite"
          className={`min-h-5 text-sm ${
            verdict.kind === 'checking' ? 'text-muted-foreground' : 'text-destructive'
          }`}
        >
          {message}
        </p>
      </div>

      <DialogFormFooter
        // Nothing is in flight that cancelling could interrupt. The lookup is a
        // subscription rather than a call, so there is no half-finished write to
        // protect the way the upload dialogs this footer was written for have.
        busy={false}
        canSubmit={verdict.kind === 'ok'}
        submitLabel="Continue"
        onCancel={onCancel}
      />
    </form>
  )
}
