import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PublicVitals } from '@convex/lib/characters'
import type { HitDice } from '@convex/lib/sheet'

export type HitDiceControlsProps = {
  /** What the server was willing to tell this client. Null while it is still loading. */
  vitals: PublicVitals | null
  /**
   * The die size. It comes from the stored sheet rather than from `vitals`, because
   * hit dice ride with hit points precisely so that a rest does not rewrite a spell
   * list — which means the vitals row carries the two numbers that move and nothing
   * that does not. `d10` is part of the build, so it is read from the build.
   */
  faces: HitDice['faces']
  /** −1 spends one, +1 hands one back. Floored and capped server-side. */
  onAdjust: (delta: number) => void
  className?: string
}

/**
 * How many hit dice a character has left, and the three ways that number moves.
 *
 * The pairing with hit points is the server's own and is worth keeping visible here.
 * `publicVitalsValidator` sends hit dice alongside current hit points because both
 * are *how the character is doing* rather than *what the character is*: a rest
 * changes them, an edit to the build does not. So this control sits in the panel's
 * top block beside the health bar, and the `n × d10` the sheet stores stays down in
 * the form with the rest of the build.
 *
 * Standing the two numbers next to each other was the obvious first layout and the
 * wrong one. `3` and `5` a centimetre apart, both captioned "hit dice", is a puzzle
 * rather than a sheet — and the reading that a player lands on first ("I have three
 * of five somethings") is the one that makes the editable box below look broken when
 * it says 5. Separating them by *what kind of fact each is*, and having each caption
 * point at the other, costs a few centimetres of travel and removes the question
 * entirely.
 *
 * **Spending a die does not roll it and heals nobody.** Milestone 4 owns rolling, and
 * a stepper that quietly applied `1d10+CON` would be a rules engine hiding in a
 * button — no dice on screen, nothing in the feed, and no way for the DM to see what
 * the number was. Until then this records that a die was used, which is the half of a
 * short rest a table cannot keep in its head.
 */
export function HitDiceControls({ vitals, faces, onAdjust, className }: HitDiceControlsProps) {
  // Loading and "this payload carries no hit dice" deliberately collapse into one
  // rendering — an em dash and dead buttons — instead of one of them being an error
  // state. An NPC never reaches this component, because the editor mounts it only for
  // a hero and the reduced sheet has no hit dice to show; so in practice the null
  // that `publicVitalsValidator` allows is only ever the moment before the
  // subscription answers, and it should look like a value on its way rather than like
  // something having gone wrong.
  const exact = vitals?.kind === 'exact' ? vitals : null
  const remaining = exact?.hitDiceRemaining ?? null
  const count = exact?.hitDiceCount ?? null

  // Nothing below is arithmetic the server also performs: `adjustHitDice` floors at
  // zero and caps at the sheet's count regardless of what arrives, so these tests
  // only decide whether a click would be a no-op. "All back" sends the whole
  // complement rather than the difference for the same reason — the cap is what makes
  // it land exactly on the ceiling, so this cannot disagree with the server about how
  // many a full night's rest is worth.
  const canSpend = remaining !== null && remaining > 0
  const canRestore = remaining !== null && count !== null && remaining < count

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* This component owns its caption where the health bar does not, and the
          difference is not an inconsistency: `HpControls` is shared with the popover
          over a selected token, where a stacked caption would be wrong, so its label
          belongs to each call site. Hit dice appear on the sheet and nowhere else. */}
      <span className="text-muted-foreground text-xs font-medium">Hit dice left</span>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Spend a hit die"
          disabled={!canSpend}
          onClick={() => onAdjust(-1)}
        >
          <Minus />
        </Button>

        <span className="font-heading text-base leading-none font-medium tabular-nums">
          {remaining !== null && count !== null ? `${remaining}/${count}` : '—'}
        </span>
        <span className="text-muted-foreground text-sm">d{faces}</span>

        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Take a spent hit die back"
          disabled={!canRestore}
          onClick={() => onAdjust(1)}
        >
          <Plus />
        </Button>

        <Button
          type="button"
          size="xs"
          variant="outline"
          // Not labelled "Long rest", though that is when it gets pressed. A real
          // long rest also refills hit points, and a button promising one that only
          // hands the dice back would be read as broken the first time somebody
          // pressed it at one hit point. It says what it does.
          aria-label="Give every hit die back"
          disabled={!canRestore}
          onClick={() => onAdjust(count ?? 0)}
        >
          All back
        </Button>
      </div>

      <span className="text-muted-foreground text-xs">
        Spent on a short rest. The sheet below sets how many there are; a long rest hands them
        all back.
      </span>
    </div>
  )
}
