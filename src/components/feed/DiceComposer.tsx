import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { DicesIcon } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRollControls, useRollPending } from '@/hooks/useRoll'
import { MAX_ROLL_LENGTH, normaliseRoll, rollProblem } from '@convex/lib/sheet'

/**
 * THE DICE TRAY: somebody **types** `2d6+3` and the whole table watches it land.
 *
 * Pinned under the scrollback like a chat input, which is what it is — the roll goes off, the
 * line comes back over the same subscription everybody else is reading, and the 3D dice
 * tumble for about a second while the round trip completes.
 *
 * ⚠️ **The one-tap presets used to be a row above this field and are now `DiceBar` on the
 * map.** They were five buttons producing five legal expressions, and the reason they existed
 * is unchanged and worth carrying forward: the audience includes children and people who have
 * never played, and *"type some dice"* is not an instruction those readers can act on. What
 * changed is that five became eight faces and a count, and that a control pressed while
 * looking at the board belongs on the board. **The typed field stayed here** — typing an
 * expression belongs with the scrollback that will answer it, and a text input on a floating
 * toolbar over a canvas is a keyboard trap waiting to be found. The deliberate two-character
 * mismatch went with them and is restated there: a button says `d20` and sends `1d20`,
 * because `ROLL_PATTERN` requires a count and nobody at a table says "one d twenty".
 *
 * ⚠️ **Nothing here rolls anything.** There is no arithmetic in this file and no `d20` being
 * evaluated: it sends a string, and the faces come back decided. That is the rule the
 * evaluator module is kept out of this bundle to protect, and `bundleGuard.test.ts` fails the
 * build if a future edit here reaches for it.
 *
 * ⚠️ **The validation below is the client half of a server check and not the check itself.**
 * `feed.rollDice` runs `normaliseRoll` and then `rollProblem` on what arrives, from the same
 * module, and refuses on its own answer — so what this buys is a round trip saved and a
 * message shown *under the field* instead of arriving as a toast with the field still holding
 * the bad value. It authorises nothing and it is not trusted: the mutation would refuse
 * exactly the same strings with a browser that had never run this code.
 *
 * **`rollProblem` and never a bare `isValidRoll`.** The grammar caps the dice and not the
 * length — its trailing term group repeats without limit, so `1d6+1+1+1…` a thousand times
 * over is a *valid* roll — and only `MAX_ROLL_LENGTH` inside `rollProblem` closes that. The
 * `maxLength` on the input makes it unreachable by typing, which is a courtesy and not the
 * guard; a paste is what the function is for.
 *
 * **One refusal this file deliberately does not duplicate:** an ad-hoc roll has no character,
 * so `1d8+STR` has nothing to resolve against and the mutation refuses it by name. That
 * sentence is written once, on the server, and a copy here would be a second wording of one
 * rule — the toast carries the real one. The placeholder is what steers somebody away from
 * trying.
 */
export function DiceComposer(): ReactElement {
  const { rollDice } = useRollControls()
  /**
   * ⚠️ **A context of its own, and this is its only reader in the application.** The flag
   * flips twice per roll — on the click and on the acknowledgement — so held in
   * `RollControls` beside the mode it re-rendered the mode bar, every roll button on the
   * sheet and the DM's two-hundred-row selector, twice, for a value only this form reads.
   * `useRoll.ts` carries the long version.
   */
  const pending = useRollPending()
  const fieldId = useId()
  const errorId = `${fieldId}-error`

  /**
   * Held already-normalised, so `2d6 + wis` typed by hand and `2d6+WIS` pasted from somewhere
   * are byte-identical rather than merely equivalent by the time anything judges either of
   * them. `normaliseRoll` is written to run on every keystroke — it cannot throw — and the
   * sheet entry picker's roll fields do exactly this.
   */
  const [expression, setExpression] = useState('')

  // Empty is not a problem, it is *nothing typed yet* — so the field is quiet until there is
  // something to be wrong about, and the button is disabled instead. The same pair the entry
  // picker uses for its two roll boxes.
  const problem = expression === '' ? null : rollProblem(expression)
  const canRoll = expression !== '' && problem === null && !pending

  /**
   * Send it, and clear.
   *
   * ⚠️ **Cleared on *send* rather than on success, because `rollDice` hands back nothing to
   * wait on.** The provider deliberately swallows the promise and toasts a failure — a roll
   * is fire-and-forget, since the result arrives over the feed subscription like everybody
   * else's rather than as a return value. So the field empties immediately, which is also the
   * behaviour a chat input has: on the rare refusal the toast carries the reason and the
   * expression is two keystrokes to retype.
   *
   * The guard is re-tested here rather than trusted from the disabled button, because Enter
   * reaches a form submit by a route that never touches the button at all.
   */
  const send = (candidate: string) => {
    const normalised = normaliseRoll(candidate)
    if (normalised === '' || rollProblem(normalised) !== null || pending) return
    rollDice(normalised)
    setExpression('')
  }

  return (
    <form
      // `shrink-0` so the tray keeps its height while the scrollback above takes the rest —
      // a composer that could be squeezed is the first thing to vanish in a busy feed.
      className="flex shrink-0 flex-col gap-1.5 border-t p-2"
      onSubmit={(event) => {
        // Enter in the field lands here. A real `<form>` rather than an `onKeyDown` on the
        // input, so Enter, the button and a screen reader's submit gesture are one path.
        event.preventDefault()
        send(expression)
      }}
    >
      <div className="flex gap-1.5">
        <Input
          id={fieldId}
          value={expression}
          // Normalised on every keystroke — see the note on the state above.
          onChange={(event) => setExpression(normaliseRoll(event.target.value))}
          // The grammar's own ceiling, so the length refusal is not reachable by typing. The
          // function still asks, because a paste is not typing.
          maxLength={MAX_ROLL_LENGTH}
          aria-invalid={problem !== null || undefined}
          aria-describedby={problem === null ? undefined : errorId}
          aria-label="Dice to roll"
          placeholder="2d6+3"
          className="font-mono"
          autoComplete="off"
          // ⚠️ **Deliberately live while a roll is in flight.** `pending` counts every roll
          // anybody in this panel has sent, including a weapon clicked on a sheet, so a
          // disabled field here would eat the keystrokes of somebody typing their next roll
          // during a round trip they did not start. The *send* is what gets held back.
        />
        <Button type="submit" size="sm" disabled={!canRoll}>
          <DicesIcon aria-hidden />
          Roll
        </Button>
      </div>

      {/* Under the field, with `aria-describedby` pointing at it, so the message reaches
          somebody who arrived at the box with the keyboard. The sentence is `rollProblem`'s
          own — the field and the mutation are not allowed to disagree about what is wrong
          with a roll, and a hand copy stops matching the moment the grammar grows a term. */}
      <FieldError id={errorId} message={problem} />
    </form>
  )
}
