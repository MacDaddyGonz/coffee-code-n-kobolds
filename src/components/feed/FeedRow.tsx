import type { ReactElement } from 'react'
import { memo } from 'react'
import { EyeOffIcon } from 'lucide-react'

import { ProfileIcon } from '@/components/ProfileIcon'
import { Badge } from '@/components/ui/badge'
import type { PublicFeedRow } from '@/hooks/useFeed'
import { CRIT_COLOUR, CRIT_LABEL } from '@/lib/crit'
import { cn } from '@/lib/utils'
import type { Crit, RollResult } from '@convex/lib/roll'
import { rollModeNote, rollSentence, rollWorking } from '@convex/lib/roll'

// One line of what happened at the table.
//
// Rows arrive already filtered — one predicate on the server dropped every line this
// browser may not hear about (CLAUDE.md invariant 1), and nothing in this file decides
// anything about who may see what. The arithmetic is on the server too, so what is here is
// a readout of numbers that arrived over a subscription and never a source of them.

/**
 * The colour for a crit, or null when the roll was ordinary.
 *
 * ⚠️ **The colours and the words used to live here and now live in `@/lib/crit`**, which is
 * this comment's own instruction being carried out rather than a change of mind: it said
 * they should move the day a second file imported them, and the day arrived within the hour
 * — the announcement over the map flashes the same event this line tints. `health.ts` is
 * the shape that module copies, and the argument is the same one: a green picked on each
 * side is two greens the moment one of them is adjusted, and the whole promise of a crit
 * is that the alarm over the map and the line in the feed are obviously about the same die.
 *
 * The narrowing stays here because `Crit` includes `null` — the *absence* of a crit — and
 * `CRIT_COLOUR` is deliberately total over the two that happened rather than carrying a
 * third entry for "no crit", which is not a colour.
 */
function critColour(crit: Crit): string | null {
  return crit === null ? null : CRIT_COLOUR[crit]
}

/**
 * The clock time, short and local.
 *
 * `undefined` as the locale rather than a fixed one, so a table spread across two countries
 * each reads its own convention. There is no date: the feed is one evening long, and a
 * scrollback of sixty lines never reaches yesterday.
 */
function shortTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * One die and the face it settled on, as a chip.
 *
 * The faces are worth printing beside the value because the same `4` means something very
 * different on a d4 and on a d20 — and because these are the numbers the 3D dice on the
 * table are showing, so a reader comparing the two is comparing like with like.
 */
function DieChip({ faces, value, dropped }: { faces: number; value: number; dropped?: boolean }) {
  return (
    <span
      // A dropped die is struck through rather than omitted, which is the whole point of it
      // travelling: `dropped` is how a row says the advantage toggle actually did something,
      // and a discarded 3 beside a kept 18 is the most legible form that fact has.
      title={dropped ? `A d${faces} rolled ${value}, dropped` : `d${faces} rolled ${value}`}
      className={cn(
        'border-border/70 inline-flex items-baseline gap-0.5 rounded border px-1 text-[0.6875rem] tabular-nums',
        dropped ? 'text-muted-foreground/70 line-through' : 'text-muted-foreground',
      )}
    >
      <span>d{faces}</span>
      <span className="text-foreground/80 font-semibold">{value}</span>
    </span>
  )
}

/**
 * THE RESULT — the total big, the arithmetic small beside it, the mode note, and the dice.
 *
 * The total is what somebody shouts across the table and the working is what they check when
 * it looks wrong, which is why `rollWorking` sits *beside* the total rather than instead of
 * it. Neither is computed here: both come out of the shared vocabulary module, over a result
 * the server decided.
 *
 * ⚠️ **`rollModeNote(result)` rather than the mode.** That function keys off `dropped` — what
 * happened — and not off `mode`, which is what was asked for, and the two differ every time
 * somebody leaves a sticky toggle on and rolls damage with it. Printing the mode would be the
 * feed asserting a rule the evaluator deliberately did not apply to a `2d6`.
 */
function RollResultBlock({ result }: { result: RollResult }): ReactElement {
  const note = rollModeNote(result)
  const colour = critColour(result.crit)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className="text-xl leading-none font-semibold tabular-nums"
          // `undefined` for an ordinary roll, so it inherits the ordinary ink instead of
          // this file deciding a third colour for "not a crit".
          style={{ color: colour ?? undefined }}
        >
          {result.total}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{rollWorking(result)}</span>
        {note ? <span className="text-muted-foreground text-xs italic">{note}</span> : null}
        {result.crit !== null ? (
          <span className="text-xs font-semibold" style={{ color: colour ?? undefined }}>
            {CRIT_LABEL[result.crit]}
          </span>
        ) : null}
      </div>

      {/* The individual dice, which the total does not carry and the 3D tray is showing.
          Indexed keys because a result is immutable once written — the array never reorders,
          and two d6 that both came up 4 are genuinely indistinguishable. */}
      <div className="flex flex-wrap items-center gap-1">
        {result.dice.map((die, index) => (
          <DieChip key={`${index}-${die.faces}`} faces={die.faces} value={die.value} />
        ))}
        {/* The discarded d20, if the toggle did anything. Its face count is `1d20` by
            construction — advantage only ever applies to a single d20, which is the one
            thing `TO_HIT_PREFIX` and `RollMode` between them guarantee. */}
        {result.dropped !== null ? <DieChip faces={20} value={result.dropped} dropped /> : null}
      </div>
    </div>
  )
}

/**
 * ONE LINE OF THE FEED: who did what, and what it came out as.
 *
 * ⚠️ **`memo`'d, and that is not premature.** The list re-renders on every roll anybody at
 * the table makes, and sixty rows reconciling to produce exactly what was already there — the
 * dice chips of each of them included — is waste on the frame where the 3D tray is also
 * starting an animation. The row is keyed by `_id` and a feed row is never edited after it is
 * written, so the memo holds for every row but the new one.
 *
 * ⚠️ **All the English comes from `rollSentence` and there is no second copy of it here.**
 * Six shapes of thing can be rolled and the wording for each is generated from the facts on
 * the row, in one function, on the server side of a module the browser is allowed to read —
 * which is what makes the line in this panel and the announcement over the map incapable of
 * disagreeing about what happened. That is also why nothing here prints `FEED_PART_LABELS`:
 * "To hit" beside *attacks with their Greatsword* is the same sentence twice, and the second
 * copy is the one that goes stale.
 *
 * **Three shapes of row, and the third is a required behaviour rather than a fallback:**
 *
 * - A roll — the block above.
 * - A `'text'` part, which is what an alt-click sends. The description **is** the payload, so
 *   it is printed where a result would go and there is no result.
 * - A `null` roll with nothing else: a passive being declared, which rolls no dice on purpose
 *   because the point of pressing it is that the table is told. **No result block at all** —
 *   not a `0`, not an empty tray. A zero here would be a number nobody rolled.
 */
export const FeedRow = memo(function FeedRow({ row }: { row: PublicFeedRow }): ReactElement {
  const { roll, subject } = row

  // The expression is threaded in for the one subject that has nothing else to describe
  // itself — an ad-hoc roll is *only* its notation — and is `null` for every row with no
  // dice behind it, which is exactly what `rollSentence` tolerates.
  const sentence = rollSentence(row.actorName, subject, roll?.expression ?? null)

  // Populated only when the part is `'text'`, which is a coherence rule the one writer of a
  // subject keeps rather than a validator — so this reads the discriminator rather than
  // testing the field for emptiness.
  const description = subject.kind === 'entry' && subject.part === 'text' ? subject.text : null

  return (
    <li className="flex gap-2 px-2 py-1.5">
      {/* The same tinted disc this person is everywhere else in the app. `actorName` is the
          *character's* name on a sheet roll and the *seat's* on an ad-hoc one — the server
          decided which, and `tintForName` is deterministic from whatever arrived, so the
          feed agrees with the coin on the board and the row in the roster. */}
      <ProfileIcon name={row.actorName} size="sm" className="mt-px" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm leading-snug">{sentence}</span>

          {/* ⚠️ **Only a DM can ever be looking at this**, because `visibleFeed` dropped the
              row for everybody else before the payload was assembled. So the marker is not a
              secret being hidden in the browser — it is the difference between a line the
              table saw and a line only they did, which is a fact the DM needs and cannot
              otherwise get. */}
          {row.dmOnly ? (
            <Badge variant="secondary" className="gap-1">
              <EyeOffIcon aria-hidden />
              Only you
            </Badge>
          ) : null}

          <time
            dateTime={new Date(row.createdAt).toISOString()}
            className="text-muted-foreground ml-auto shrink-0 text-[0.6875rem] tabular-nums"
          >
            {shortTime(row.createdAt)}
          </time>
        </div>

        {roll !== null ? <RollResultBlock result={roll} /> : null}

        {description !== null ? (
          <p className="text-muted-foreground text-xs leading-snug whitespace-pre-line">
            {description}
          </p>
        ) : null}
      </div>
    </li>
  )
})
