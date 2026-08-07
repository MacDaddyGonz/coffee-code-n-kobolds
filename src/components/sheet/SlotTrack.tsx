import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SPELL_SLOT_TRACK_LABELS,
  spellSlotBars,
  type SpellSlots,
  type SpentSlot,
} from '@convex/lib/slots'

export type SlotTrackProps = {
  /** What the character has, from `spellSlotsFor`. Null for a non-caster — render nothing. */
  slots: SpellSlots | null
  /** What is gone, from the vitals payload. Null while it is loading or on a band row. */
  spent: readonly SpentSlot[] | null
  /** Absent means the pips are printed rather than pressable. */
  onSetSlots?: (level: number, spent: number) => void
  disabled?: boolean
}

/**
 * A CASTER'S SLOTS, AS PIPS SOMEBODY PRESSES.
 *
 * ⚠️ **THE ONE THING THIS MUST NEVER DO IS REFUSE A CAST.** A caster on nought slots is a
 * caster who can still press every spell on the list, exactly as a feature with no uses left
 * is still a feature you can press. Nothing here is read by a roll, no row is greyed out at
 * zero, and no button anywhere is disabled *because* of a count. Counting a slot compares
 * nothing and changes no die of damage, which is the entire reason ADR 0011's decision 1
 * could be reversed at all — see ADR 0016's resource-shape section. Greying a spell out at
 * zero is the edit that turns this pane into a rules engine, and it needs an amendment and
 * an ADR rather than a condition on a button.
 *
 * ⚠️ **`feed.roll` spends nothing, and this is the control that makes that liveable.** The
 * application cannot know which slot a cast used: a level 1 spell may legitimately be cast
 * with a level 2 or 3 slot, and upcasting is how half the 2024 list scales. So there is no
 * right answer to deduct automatically, and the person who knows presses the pip. ADR 0011's
 * supersede table says *"a roll spends one"*; that clause is wrong and ADR 0016 is the record.
 *
 * ⚠️ **Both directions, and the hand-back is not a nicety.** Clicking a spent pip returns it.
 * A tally nobody can correct downwards is a tally that goes wrong once and stays wrong for
 * the evening, which is `nextDeathSaveCount`'s argument on the board reaching a second
 * counter — and the mutation permits `spent: 0` from any caller the permission rule already
 * admits, precisely so this works.
 *
 * **The track is drawn from the derivation, never from the stored row.** `spellSlotBars`
 * iterates what `spellSlotsFor` says the character has and looks the spent count up against
 * it, so a stored row naming a level the character no longer reaches — a DM who dropped
 * somebody from 5 to 3 — contributes nothing rather than drawing a phantom row. The maximum
 * lives nowhere in the database for the same reason: levelling up rewrites no vitals row.
 *
 * The heading comes out of `SPELL_SLOT_TRACK_LABELS` rather than a ternary, so a Warlock's
 * Pact Magic is captioned as itself — a third track fails to compile at the `Record` rather
 * than silently printing a Wizard's word over somebody else's slots.
 */
export function SlotTrack({ slots, spent, onSetSlots, disabled }: SlotTrackProps) {
  // Absent rather than an empty box. A non-caster reaching this pane at all is already the
  // exceptional case `panesFor` allows for — a hand-built sheet carrying spells — and a
  // heading over no rows reads as a track that failed to load.
  if (slots === null) return null

  const bars = spellSlotBars(slots, spent ?? [])
  if (bars.length === 0) return null

  const { label, explanation } = SPELL_SLOT_TRACK_LABELS[slots.track]

  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">{label}</h3>
        <p className="text-muted-foreground text-xs">{explanation}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {bars.map((bar) => (
          <div key={bar.level} className="flex items-center gap-3">
            <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
              Level {bar.level}
            </span>

            <div className="flex flex-wrap items-center gap-1">
              {/*
                One pip per slot, indexed from one so the nth pip means "the nth slot".
                Pressing pip n sets the spent count to n when it is unspent and to n − 1 when
                it is already spent — so a click fills up to where you clicked and a click on
                the last filled pip hands exactly one back. That is `UseCounter`'s gesture on
                SheetEntryList, kept identical on purpose: two counters on one sheet that
                behaved differently would be a thing to learn twice.
              */}
              {Array.from({ length: bar.max }, (_, index) => {
                const nth = index + 1
                const isSpent = nth <= bar.spent
                return (
                  <Button
                    key={nth}
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || onSetSlots === undefined}
                    aria-pressed={isSpent}
                    aria-label={`Level ${bar.level} slot ${nth} of ${bar.max}`}
                    onClick={() => onSetSlots?.(bar.level, isSpent ? nth - 1 : nth)}
                    className={cn(
                      'size-5 rounded-full border p-0',
                      isSpent ? 'bg-muted-foreground/60 border-transparent' : 'bg-transparent',
                    )}
                  />
                )
              })}
            </div>

            <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
              {bar.remaining} / {bar.max}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
