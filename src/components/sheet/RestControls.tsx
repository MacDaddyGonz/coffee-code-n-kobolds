import { BedDouble } from 'lucide-react'

import { SheetCheckbox } from '@/components/sheet/SheetFields'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RestKind } from '@convex/lib/rest'
import { REST_KINDS, REST_LABELS } from '@convex/lib/rest'
import type { PerRestAbility } from '@convex/lib/species'

export type RestControlsProps = {
  /** Everything this character's species lets them spend once between long rests. */
  abilities: PerRestAbility[]
  /**
   * How many uses of each key have gone, or null while the vitals subscription answers.
   *
   * The counted `spentUses` rather than the `spentPerRest` array it replaced: the
   * server folds the second into the first on read, so a client that takes this one alone
   * is already correct for a row written by an older deployment. A species ability is a
   * boolean either way — one use — so anything above zero reads as spent.
   */
  spentUses: readonly { key: string; spent: number }[] | null
  disabled?: boolean
  onSetUses: (key: string, spent: number) => void
  onRest: (kind: RestKind) => void
}

/**
 * The two rests, and the once-per-long-rest abilities a species brings.
 *
 * ⚠️ **Both buttons now, where there used to be one — and the wording of each comes out of
 * `REST_LABELS` rather than out of this file.** That is a correction with a history:
 * `HitDiceControls` once shipped a button labelled *Long rest* that only handed the dice
 * back, and it read as broken the first time somebody pressed it at one hit point. The
 * short rest is the same trap pointing the other way — it **does not heal and does not
 * return hit dice**, because spending hit dice is what a short rest is *for* — so a control
 * that said *Short rest* and quietly healed nobody would be read as broken by exactly the
 * same person. One record on the server holds both labels and both explanations, so a
 * button cannot promise something its mutation does not do.
 *
 * **Iterated over `REST_KINDS` rather than written out as two buttons**, which is
 * CLAUDE.md invariant 9's rule applied to a control: `REST_KINDS` is *shortest first*, and
 * that order is the order these appear on a character sheet. `lib/rest.ts` argues at
 * length that there is deliberately no third member — a dawn is not a rest anybody takes —
 * but if one ever arrives it arrives here with a button rather than being a period the
 * sheet counts and cannot restore.
 *
 * **Nothing here adjudicates a rest.** No clock runs, nothing checks that eight hours have
 * passed, nothing refuses a second short rest in a row, and no roll anywhere consults one.
 * The app remembers what came back, which is the half a group cannot keep in its head.
 *
 * The whole block is drawn even for the species with nothing to spend, because the rest
 * buttons belong to every character. A species with no per-rest abilities simply has no
 * rows under them — and most of what a 2024 character spends is a *counted* resource on a
 * sheet entry, which is a counter on its own row in `SheetEntryList` rather than a tick
 * here. These two lists are not rivals: one is keyed by species content and one by an
 * entry's own id, and `characters.setUses` takes them as two vocabularies sharing a
 * namespace for exactly that reason.
 */
export function RestControls({
  abilities,
  spentUses,
  disabled,
  onSetUses,
  onRest,
}: RestControlsProps) {
  // Loading and "nothing spent" collapse into the same rendering rather than one of them
  // being an error state: an absent key means unspent on the server too, so an unticked
  // box is the right thing to show while the answer is on its way. The controls stay dead
  // until it lands, so a click cannot be sent against a set this client has not seen.
  const spent = new Map((spentUses ?? []).map((row) => [row.key, row.spent]))

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-heading text-sm font-medium">Rest</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {REST_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onRest(kind)}
            >
              <BedDouble />
              {REST_LABELS[kind].label}
            </Button>
          ))}
        </div>
      </div>

      {/* The explanations under the buttons rather than in a tooltip on each, because the
          difference between the two rests is the thing a table argues about and a tooltip
          is not readable by two people at once. Both, always, so that the shorter one is
          not the one nobody discovers. */}
      <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        {REST_KINDS.map((kind) => (
          <li key={kind}>
            <span className="text-foreground font-medium">{REST_LABELS[kind].label}. </span>
            {REST_LABELS[kind].explanation}
          </li>
        ))}
      </ul>

      {abilities.length === 0 ? null : (
        <ul className="flex flex-col gap-1.5">
          {abilities.map((ability) => {
            const used = (spent.get(ability.key) ?? 0) > 0

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
                  disabled={disabled || spentUses === null}
                  className="mt-0.5"
                  // A count over the wire even though the control is a tick: the mutation
                  // takes a number, and `0` is what handing a once-per-rest ability back
                  // means. Translating here rather than at the hook keeps the one
                  // genuinely boolean control from widening every other caller.
                  onChange={(next) => onSetUses(ability.key, next ? 1 : 0)}
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
