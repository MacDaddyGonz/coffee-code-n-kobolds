import { BedDouble } from 'lucide-react'

import { SheetCheckbox } from '@/components/sheet/SheetFields'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PerRestAbility } from '@convex/lib/species'

export type RestControlsProps = {
  /** Everything this character's race lets them spend once between long rests. */
  abilities: PerRestAbility[]
  /** Keys already spent. Null while the vitals subscription is still answering. */
  spent: string[] | null
  disabled?: boolean
  onSetPerRest: (key: string, spent: boolean) => void
  onLongRest: () => void
}

/**
 * The once-per-long-rest abilities a race brings, and the button that hands them all
 * back.
 *
 * These are tracked rather than merely described because they are precisely the things
 * a table forgets: Heroic Inspiration goes unused for three sessions, and the
 * Half-Orc's one free survival gets spent twice in the same fight. The app never
 * enforces the effect of any of them — it remembers whether one has been used, which
 * is the half a group cannot keep in its head, and stops well short of a rules engine.
 *
 * **The button says all three things a long rest does**, and that wording is load
 * bearing rather than padding. `HitDiceControls` has a neighbouring button labelled
 * "All back" that deliberately does *not* claim to be a long rest, precisely because it
 * only returns the dice; this one restores hit points, hit dice and every ability
 * below in a single transaction, so it is the one allowed to use the words — and it
 * has to spell out the rest, or a player at one hit point will press "Long rest",
 * watch their health bar fill, and reasonably wonder whether the dice came back too.
 *
 * The whole block is drawn even for the six races that have nothing to spend, because
 * the rest button belongs to every character. A race with no per-rest abilities simply
 * has no rows under it.
 */
export function RestControls({
  abilities,
  spent,
  disabled,
  onSetPerRest,
  onLongRest,
}: RestControlsProps) {
  // Loading and "nothing spent" collapse into the same rendering rather than one of
  // them being an error state: an absent key means unspent on the server too, so an
  // unticked box is the right thing to show while the answer is on its way. The
  // controls stay dead until it lands, so a click cannot be sent against a set this
  // client has not seen.
  const spentKeys = new Set(spent ?? [])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">Rest</h3>
          <p className="text-muted-foreground text-xs">
            A long rest puts hit points back to full, hands back every hit die, and makes
            everything below ready to use again.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onLongRest}
        >
          <BedDouble />
          Long rest
        </Button>
      </div>

      {abilities.length === 0 ? null : (
        <ul className="flex flex-col gap-1.5">
          {abilities.map((ability) => {
            const used = spentKeys.has(ability.key)

            return (
              <li
                key={ability.key}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-2',
                  used && 'text-muted-foreground bg-muted/40',
                )}
              >
                <SheetCheckbox
                  id={`per-rest-${ability.key}`}
                  label={`${ability.name} used`}
                  checked={used}
                  disabled={disabled || spent === null}
                  className="mt-0.5"
                  onChange={(next) => onSetPerRest(ability.key, next)}
                />
                <label
                  htmlFor={`per-rest-${ability.key}`}
                  className="flex min-w-0 cursor-pointer flex-col gap-0.5"
                >
                  <span className="text-sm font-medium">
                    {ability.name}
                    <span className="text-muted-foreground font-normal">
                      {used ? ' — used' : ' — ready'}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">{ability.text}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
