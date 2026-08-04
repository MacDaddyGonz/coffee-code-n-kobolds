import type { ReactElement } from 'react'
import { memo, useState } from 'react'

import { MinusIcon, PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useRollControls } from '@/hooks/useRoll'
import { MAX_ROLL_DICE, ROLL_FACES, normaliseRoll, rollProblem } from '@convex/lib/sheet'

/**
 * The counts offered, which is not one through fifty.
 *
 * ⚠️ **A stepper rather than fifty buttons, and coarse rather than every integer.** The
 * ask was a 1×–50× selector; the useful values are the small ones, so `−`/`+` walks by one
 * and the row of shortcuts jumps. Somebody who genuinely wants 37 dice types `37d6` into
 * the tray under the feed, which is what that field is for and why it stayed.
 */
const COUNT_SHORTCUTS: readonly number[] = [1, 2, 4, 8, 20, MAX_ROLL_DICE]

/**
 * THE AD-HOC DICE, on the map.
 *
 * **Moved out of `DiceComposer` rather than copied**, and grown from five presets to eight
 * faces plus a count. The typed-expression field stayed under the feed, because typing
 * `2d6+3` belongs with the scrollback that will answer it and a text input on a floating
 * toolbar over a canvas is a keyboard trap waiting to be found. What moved is the part
 * that is one press.
 *
 * ⚠️ **Nothing here rolls anything, and that is the rule the whole dice arrangement
 * protects.** There is no arithmetic in this file: it builds a string like `8d6` and sends
 * it, and the faces come back decided by the server. `bundleGuard.test.ts` fails the build
 * if anything under `src/` reaches for the evaluator.
 *
 * ⚠️ **`MAX_ROLL_DICE` and never a literal fifty.** The grammar is the cap, and a stepper
 * that stopped at its own number would be exactly the second copy that constant's docblock
 * is about — it would go on offering fifty the day the grammar went back to twenty, and the
 * only symptom would be a refusal toast.
 *
 * **Validated before sending, like the composer.** That buys a round trip rather than
 * authorising anything; `feed.rollDice` runs the same `rollProblem` on what arrives and
 * refuses on its own answer. It is here because a count and a face can only produce a legal
 * string if both constants agree with the regex, and *checking* is cheaper than asserting
 * that they do.
 *
 * Memoised for `ZoomControls`' reason: it sits over a board that re-renders on every frame
 * of a pan and takes no props at all, so every one of those frames would otherwise
 * reconcile fourteen buttons to produce what was already there.
 */
export const DiceBar = memo(function DiceBar(): ReactElement {
  const { rollDice } = useRollControls()

  const [count, setCount] = useState(1)

  /**
   * ⚠️ **No `useRollPending` here, and its absence is the point.** That flag counts *every*
   * roll in flight, and its own docblock says in as many words not to reach for it to
   * disable a roll button — a sheet that did greys out thirty controls for one round trip.
   * Eight dice on a toolbar is the same mistake at a smaller size, and it would also
   * subscribe this bar to a context that flips twice on every roll anybody at the table
   * makes. `DiceComposer` is the one intended reader, for its submit button.
   *
   * Validated before sending for `DiceComposer`'s reason: it buys a round trip and
   * authorises nothing, since `feed.rollDice` runs the same `rollProblem` on what arrives.
   * It is worth doing rather than asserting because a legal string here depends on two
   * constants agreeing with the regex, and checking is cheaper than proving.
   */
  const send = (faces: number) => {
    const expression = normaliseRoll(`${count}d${faces}`)
    if (rollProblem(expression) !== null) return
    rollDice(expression)
  }

  return (
    <div role="group" aria-label="Roll dice" className="flex flex-wrap items-center gap-1">
      {/*
        The count first, because it is read as an adjective on the buttons after it: `8×`
        then `d6` is "eight d6", and the same two controls in the other order are not.
      */}
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="One fewer die"
          // The `disabled` attributes are the whole bound, and the accessible signal as
          // well — a `Math.max` beside them would be a second guard on a press that cannot
          // happen, and two bounds is how one of them comes to disagree with the other.
          disabled={count <= 1}
          onClick={() => setCount((n) => n - 1)}
        >
          <MinusIcon aria-hidden />
        </Button>
        {/* `tabular-nums` so the strip does not shift width between 9× and 10×, which on a
            control this small reads as the toolbar twitching. */}
        <span className="w-8 text-center text-xs font-medium tabular-nums" aria-live="polite">
          {count}×
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="One more die"
          disabled={count >= MAX_ROLL_DICE}
          onClick={() => setCount((n) => n + 1)}
        >
          <PlusIcon aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-0.5">
        {COUNT_SHORTCUTS.map((n) => (
          <Button
            key={n}
            type="button"
            size="xs"
            variant={count === n ? 'default' : 'ghost'}
            aria-pressed={count === n}
            className="px-1.5"
            onClick={() => setCount(n)}
          >
            {n}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      <div className="flex flex-wrap items-center gap-0.5">
        {ROLL_FACES.map((faces) => (
          <Button
            key={faces}
            type="button"
            size="xs"
            variant="outline"
            // ⚠️ **Labelled without the count and rolled with it**, which is the deliberate
            // mismatch `DiceComposer`'s presets already made and for the same reason: the
            // grammar requires a count and nobody at a table says "one d twenty". The `n×`
            // beside it is what says how many, so repeating it on eight buttons would be
            // the same fact twice and would double their width.
            onClick={() => send(faces)}
          >
            d{faces}
          </Button>
        ))}
      </div>
    </div>
  )
})
