import type { ReactElement } from 'react'
import { memo } from 'react'
import { EyeOffIcon } from 'lucide-react'

import { ProfileIcon } from '@/components/ProfileIcon'
import { Badge } from '@/components/ui/badge'
import type { PublicFeedRow } from '@/hooks/useFeed'
import { CRIT_LABEL, critColour } from '@/lib/crit'
import { entryCaptions } from '@/lib/rollDetail'
import { cn } from '@/lib/utils'
import { clockTime } from '@/lib/when'
import type { RollResult } from '@convex/lib/roll'
import { droppedDie, rollModeNote, rollSentence, rollWorking } from '@convex/lib/roll'

// One line of what happened at the table.
//
// Rows arrive already filtered — one predicate on the server dropped every line this
// browser may not hear about (CLAUDE.md invariant 1), and nothing in this file decides
// anything about who may see what. The arithmetic is on the server too, so what is here is
// a readout of numbers that arrived over a subscription and never a source of them.
//
// ⚠️ **Nothing in this file derives anything, and each of the three things it used to derive
// went somewhere with a second reader.** The colours and the words are in `@/lib/crit`, the
// crit narrowing with them; the clock time is `clockTime` in `@/lib/when`, beside the only
// other date formatting under `src/`; the discarded d20 is `droppedDie` in lib/roll.ts,
// which is also what the 3D tray asks. Every one of them was a private helper here first,
// and every one of them acquired a second caller within a milestone — which is the argument
// this file's own header used to make about the crit colours and is now the pattern.

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
  // The die advantage threw away, already carrying the `faces: 20` that only lib/roll.ts
  // should be asserting. The tray over the map asks the same function for the same die.
  const dropped = droppedDie(result)

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
        {/*
          The working, spelled out beside the total: the number somebody shouts across the
          table is the total, and this is the one they check when it looks wrong. The `=`
          is added here rather than inside `rollWorking` because that function has a second
          reader with no total beside it to point at.

          ⚠️⚠️ **NOTHING IN THIS BLOCK COMPARES THE TOTAL TO ANYTHING, AND THIS IS THE LINE
          WHERE A READER WILL WANT TO.** The obvious next edit is an armour class or a save
          DC printed here with a ✓ or a ✗ against it — and that is the one thing this
          application does not do. ADR 0011 decided it and CLAUDE.md's *Rules scope* keeps
          it: this application **announces and counts**, and the table **adjudicates**. So a
          DC, when a row ever carries one, is printed **beside** the result as a second
          number and never as a verdict — no colour, no tick, no *hit*, no *saved*.

          ⚠️ **A feed row carries no DC today.** `feedSubjectValidator` in
          `convex/lib/roll.ts` has six members and none of them has a field for one, so
          there is nothing to print and this comment is the whole of what stands here. That
          module is browser-shared and is not this component's to change: adding a `dc` is a
          server decision, made where the roll is decided, in the same transaction that read
          the sheet the DC came off.
        */}
        <span className="text-muted-foreground text-xs tabular-nums">
          = {rollWorking(result)}
        </span>
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
      <div
        className="flex flex-wrap items-center gap-1"
        // ⚠️ **`dropped` and not `mode`**, which is the distinction `rollModeNote` exists to
        // make: the group is only announced as a pair when a die was genuinely discarded, so
        // a `2d6` rolled with a sticky advantage toggle on is not described as two d20s.
        role={dropped === null ? undefined : 'group'}
        aria-label={dropped === null ? undefined : `Rolled two d20 ${note ?? ''}`.trim()}
      >
        {result.dice.map((die, index) => (
          <DieChip key={`${index}-${die.faces}`} faces={die.faces} value={die.value} />
        ))}
        {/* The discarded d20, if the toggle did anything. The face count comes with it: it
            is 20 by construction — advantage only ever applies to a single d20, which
            `TO_HIT_PREFIX` and `RollMode` between them guarantee — and `droppedDie` is where
            that construction fact is stated, so this file and the 3D tray cannot disagree
            about what landed.

            ⚠️ **Struck through and *kept*, never omitted, and now with a word beside it.**
            The whole visible point of advantage is that two dice landed and one was
            discarded — that is what the 3D tray shows over the map, and a feed row that
            printed one die would be describing a different event from the one the table just
            watched. The chip is what says which of the two survived. */}
        {dropped === null ? null : (
          <>
            <span aria-hidden className="text-muted-foreground/60 text-[0.6875rem]">
              ·
            </span>
            <DieChip faces={dropped.faces} value={dropped.value} dropped />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * ONE LINE OF THE FEED: who did what, and what it came out as.
 *
 * ⚠️ **`memo`'d with a comparator on `_id`, and the comparator is what makes the memo work
 * at all.** The list re-renders on every roll anybody at the table makes, and sixty rows
 * reconciling to produce exactly what was already there is waste on the frame where the 3D
 * tray is also starting an animation — each one costs a `rollSentence`, a `rollWorking`, a
 * `toISOString` and a formatted clock time.
 *
 * The default shallow comparator could not prevent any of it: `useQuery` deserialises the
 * payload afresh from the socket, so **every** row object has a new identity after **every**
 * roll and `prev.row === next.row` is false sixty times. This file asserted the opposite for
 * a while, which is the failure a memo has — it goes on looking correct while doing nothing.
 *
 * `_id` is sound as the whole of the comparison because **a feed row is never patched, only
 * inserted**: the wording is generated on the way to the screen rather than stored
 * (lib/roll.ts says so), the result is written once by the mutation that rolled it, and
 * nothing anywhere updates a row of this table. So identical ids means identical content, and
 * the one row whose content is new is the one whose id is new.
 *
 * ⚠️ **All the English comes from `rollSentence` and there is no second copy of it here.**
 * Six shapes of thing can be rolled and the wording for each is generated from the facts on
 * the row, in one function, on the server side of a module the browser is allowed to read —
 * which is what makes the line in this panel and the announcement over the map incapable of
 * disagreeing about what happened. That is also why nothing here prints a part's own label
 * — `partLabel`, which the sheet's buttons use: "To hit" beside *attacks with their
 * Greatsword* is the same sentence twice, and the second copy is the one that goes stale.
 *
 * **Three shapes of row, and the third is a required behaviour rather than a fallback:**
 *
 * - A roll — the block above.
 * - A `'text'` part, which is what an alt-click sends. The description **is** the payload, so
 *   it is printed where a result would go and there is no result.
 * - A `null` roll with nothing else: a passive being declared, which rolls no dice on purpose
 *   because the point of pressing it is that the table is told. **No result block at all** —
 *   not a `0`, not an empty tray. A zero here would be a number nobody rolled.
 *
 * ⚠️ **The caption between the sentence and the result is a fourth thing and not a fourth
 * shape.** It qualifies every one of the three above when the subject is a sheet entry, and
 * it is empty for the five subjects that are not — see `entryCaptions`.
 *
 * ⚠️⚠️ **NOTHING IN THIS FILE COMPARES A ROLL TO ANYTHING**, and `RollResultBlock` carries
 * that warning at the exact line where somebody would add the comparison. A difficulty class
 * beside a total is a second number; a difficulty class with a tick against it is this
 * application adjudicating, which ADR 0011 declined and CLAUDE.md's *Rules scope* keeps
 * declined.
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

  /**
   * WHERE THE ROLL CAME FROM: `Level 2 spell · Action`, or nothing at all.
   *
   * ⚠️ **The row already carried both facts and neither reached the screen**, which is what
   * the 2024 conversion made worth fixing: a feed full of `casts Cure Wounds` says nothing
   * about which slot went, and the conversion turned a spell's level from a label into a
   * counted resource. `entryCaptions` is where the wording lives and where the `Record` over
   * the category union sits, so a fourth category fails to compile rather than printing an
   * empty chip on every row that carries it.
   *
   * ⚠️ **It is a caption and not an accounting.** Printing *Level 2 spell* consults no slot
   * and spends none; the slot is the mutation's business, server-side, in the transaction
   * that rolled. A feed row is what happened.
   */
  const captions = entryCaptions(subject)

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

          {/* The machine-readable instant beside the human one, which is what `<time>` is
              for: the visible text is a local clock with no date in it, and this is the whole
              timestamp for anything reading the document rather than looking at it. */}
          <time
            dateTime={new Date(row.createdAt).toISOString()}
            className="text-muted-foreground ml-auto shrink-0 text-[0.6875rem] tabular-nums"
          >
            {clockTime(row.createdAt)}
          </time>
        </div>

        {/*
          Under the sentence and above the result, because it qualifies the sentence: it
          says what *Cure Wounds* was, not what it came out as. Joined with a middot rather
          than drawn as badges — a busy feed is a column of these, and two pill outlines per
          row would out-shout the total they sit above.
        */}
        {captions.length === 0 ? null : (
          <p className="text-muted-foreground text-[0.6875rem] leading-none">
            {captions.join(' · ')}
          </p>
        )}

        {roll !== null ? <RollResultBlock result={roll} /> : null}

        {description !== null ? (
          <p className="text-muted-foreground text-xs leading-snug whitespace-pre-line">
            {description}
          </p>
        ) : null}
      </div>
    </li>
  )
},
// See the ⚠️ above. Two rows with the same id are the same row, because nothing in this
// application ever writes to a feed document twice.
(previous, next) => previous.row._id === next.row._id,
)
