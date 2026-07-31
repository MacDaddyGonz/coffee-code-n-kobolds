import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { healthColour, healthFraction, healthLabel } from '@/lib/health'
import { cn } from '@/lib/utils'
import type { PublicVitals } from '@convex/lib/characters'

export type HpControlsProps = {
  /** What the server was willing to tell this client. Null while it is still loading. */
  vitals: PublicVitals | null
  /** Damage is negative, healing positive. Undefined means this caller may not edit. */
  onAdjust?: (delta: number) => void
  className?: string
}

/** The amount a click applies, if nobody types anything else. */
const DEFAULT_STEP = 1
const MAX_STEP = 999

/**
 * A health bar with `−` and `+` beside it, used on the character sheet and in the
 * popover over a selected token.
 *
 * The stepper exists because requirements.md asks for controls that adjust health
 * "easily", and a single-point `+`/`−` is not that: a hit for twelve is twelve
 * clicks. Typing the number and pressing `−` once is the common case at a table.
 *
 * The component is told what to draw and never works out what to hide. For an NPC
 * on a player's screen `vitals` is a band with no numbers in it, because the server
 * never sent any — deciding that here would be exactly the client-side filtering
 * CLAUDE.md invariant 1 forbids, and by the time a renderer could make the choice
 * the secret would already be in the bundle's hands.
 */
export function HpControls({ vitals, onAdjust, className }: HpControlsProps) {
  const [step, setStep] = useState(String(DEFAULT_STEP))

  const amount = Math.min(MAX_STEP, Math.max(1, Math.round(Number(step) || DEFAULT_STEP)))
  // A band carries no numbers to move, so there is nothing to offer even the DM —
  // and a caller who may edit is always sent the exact form anyway.
  const editable = onAdjust !== undefined && vitals?.kind === 'exact'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {editable ? (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={`Take ${amount} hit points off`}
          onClick={() => onAdjust(-amount)}
        >
          <Minus />
        </Button>
      ) : null}

      <div className="min-w-0 flex-1">
        <div
          className="bg-muted relative h-4 w-full overflow-hidden rounded-full border"
          role="img"
          aria-label={vitals ? `Hit points: ${healthLabel(vitals)}` : 'Hit points loading'}
        >
          {vitals ? (
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${healthFraction(vitals) * 100}%`,
                backgroundColor: healthColour(vitals),
              }}
            />
          ) : null}
          <span className="absolute inset-0 flex items-center justify-center text-[0.7rem] font-semibold tracking-tight text-white mix-blend-plus-lighter">
            {vitals ? healthLabel(vitals) : '—'}
          </span>
        </div>
      </div>

      {editable ? (
        <>
          <Input
            // Not a `type="number"` spinner: the arrow keys are how a token is
            // nudged around the board, and a focused spinner swallows them.
            inputMode="numeric"
            aria-label="How much to change hit points by"
            className="h-7 w-14 text-center"
            value={step}
            onChange={(event) => setStep(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Heal ${amount} hit points`}
            onClick={() => onAdjust(amount)}
          >
            <Plus />
          </Button>
        </>
      ) : null}
    </div>
  )
}
