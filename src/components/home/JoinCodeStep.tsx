import { useId } from 'react'
import { useQuery } from 'convex/react'

import { CODE_ALPHABET_HINT, CodeInput } from '@/components/CodeInput'
import { DialogFormFooter } from '@/components/DialogFormFooter'
import { VerdictLine } from '@/components/VerdictLine'
import { Label } from '@/components/ui/label'
import { verdictMessage, verdictOf } from '@/lib/joinDoor'
import { api } from '@convex/_generated/api'
import { isCompleteJoinCode } from '@convex/lib/codes'
import type { GameListing } from './GameListRow'

export type JoinCodeStepProps = {
  /**
   * The row that was clicked and whose `_id` the typed code is checked against, or
   * `null` when there was no row — the *Join with a code* card, where the code is the
   * only thing identifying the game and any game it opens is therefore the right one.
   * `verdictOf`'s ⚠️ has the argument; this prop is just where the absence arrives.
   */
  game: GameListing | null
  typed: string
  onTyped: (value: string) => void
  /**
   * Called with the game the code opened: the **server's** spelling of the code, and
   * the name the server has for it.
   *
   * The name is handed up rather than looked up again because the caller has a header
   * to write and no other way to know what it opened — with no row there is nothing
   * above the dialog naming the game, and re-subscribing `getByCode` there to find out
   * would be a second cache entry for a document this component is already holding.
   * Deliberately the two fields and not the whole document: the caller needs a code to
   * navigate with and a name to print, and handing it a `PublicGame` would invite it to
   * treat the payload as a `GameListing` it is not.
   */
  onResolved: (game: { code: string; name: string }) => void
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
 * **The check is `games.getByCode`, and this is now the only component that holds it.**
 * ⚠️ That sentence used to weigh the cost of *two* subscriptions to it: the *Join with
 * a code* panel had a lookup of its own, and the two shared a cache entry only while
 * both fields happened to hold the same string, because a Convex cache key includes
 * the argument *values*. That panel is now a button that opens this dialog, so the
 * second lookup is gone along with the second copy of the verdict ladder and the
 * second name field. The reason it is recorded rather than deleted is that the pull
 * back the other way is real — a card that wants to say something about a code before
 * committing to a dialog is a card that reaches for `getByCode`, and doing that would
 * put a lookup back on the landing page for every idle browser sitting on it.
 *
 * `'skip'` until the code could plausibly match something, so half-typed codes are not
 * a stream of lookups all answering "no such game".
 *
 * ⚠️ **The verdict is `verdictOf`'s and not this component's**, and that is where
 * the interesting rule lives: the resolved game is compared by `_id` against the row
 * that was clicked, never by name, because two games may share a title and a code
 * that opens a *different* one of them is exactly the mistake worth catching here.
 * With no row there is no such comparison to make — nothing claimed which game this
 * was, so nothing can contradict the answer — and that arm is `verdictOf`'s too rather
 * than a second ladder written out here. It used to be a second ladder, in the *Join
 * with a code* card, and the drift that followed was the wording: two of the three
 * sentences under that card's field were hand-copied from this one.
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
  // `null` for the no-row case rather than a fabricated id: `verdictOf` reads it as
  // "nobody claimed which game this is" and skips exactly the comparison that has
  // nothing to compare, which a stand-in id would instead fail every time.
  const verdict = verdictOf({ typed, expectedGameId: game?._id ?? null, resolved })
  const message = verdictMessage(verdict)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        // Guarded as well as disabled, because Enter in a text field submits a form
        // whatever its buttons are doing — and this is the branch that decides which
        // code the rest of the flow is about.
        //
        // The second half of the test is redundant with the first — `verdictOf` cannot
        // answer `ok` for a `resolved` that is null or in flight — and it is here
        // because TypeScript cannot narrow one local from the *value* of another. The
        // narrowing is what lets the name go up as a `string` rather than as a `?? ''`
        // standing in for a game's name. Same reason as the two tests in
        // `JoinDoorDialog`'s JSX.
        if (verdict.kind !== 'ok' || !resolved) return
        onResolved({ code: verdict.code, name: resolved.name })
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
        {/* One sentence derived from `CODE_ALPHABET` rather than written out here —
            see `CODE_ALPHABET_HINT`. This is its only reader now that the card below
            the list has no field of its own, and it stays derived for the reason it was
            written: a hand-read of a constant outlives the constant. */}
        <p id={alphabetHintId} className="text-muted-foreground text-xs">
          {CODE_ALPHABET_HINT}
        </p>
        {/*
          `VerdictLine` reserves the height and carries the live region, so the dialog
          does not jump as the message appears and a screen reader hears the answer
          without focus moving off the field.

          The message is deliberately the *only* thing this line ever says: there is no
          "that's the right code" reassurance, because the Continue button going live is
          that, and a field that congratulates you on typing six characters is noise.
          `verdictMessage` returns null for both of the states with nothing to report,
          and the reserved height is why that costs no movement.

          `checking` is the one arm that is not a refusal, so it is the one arm that is
          not in the destructive colour — the two null-message arms could be either.
        */}
        <VerdictLine
          id={verdictId}
          message={message}
          tone={verdict.kind === 'checking' ? 'muted' : 'destructive'}
        />
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
