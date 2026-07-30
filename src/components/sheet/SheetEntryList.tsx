import { Trash2 } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { SheetEntryPicker, spellLevelLabel } from '@/components/sheet/SheetEntryPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CatalogueEntry } from '@convex/lib/rules'
import type { SheetEntry, SheetProblem } from '@convex/lib/sheet'
import { MAX_SHEET_ENTRIES, isValidRoll, normaliseRoll, problemAtEntry } from '@convex/lib/sheet'

export type SheetEntryListProps = {
  title: string
  description: string
  /** Singular, for the Add button and the picker's title: "spell", "feat", "action". */
  noun: string
  entries: SheetEntry[]
  catalogue: readonly CatalogueEntry[]
  /**
   * What `sheetProblem` calls this list — `feats`, `spells` or `actions`. Used to
   * work out whether the sheet's one problem belongs to a row here, and which.
   */
  path: string
  /** The whole sheet's first problem, or null. Only the one that names a row is shown. */
  problem: SheetProblem | null
  disabled?: boolean
  onChange: (entries: SheetEntry[]) => void
}

/**
 * A list of lines on a sheet: the feats, the spells, or what a monster does.
 *
 * **One component for all three.** `sheetEntryValidator` is one shape, and the
 * argument for that is written out on the validator itself — the two sheet variants
 * differ in what they hold, not in what a line is. Writing this three times is how
 * the reduced NPC sheet would have turned into a second copy of everything.
 *
 * Milestone 4 makes each row clickable to send a roll to the feed, and alt-click
 * sends the description instead. Nothing here rolls anything: the id on each entry
 * is what that will aim at, which is why `sheetProblem` refuses a sheet with a
 * duplicate or a missing one.
 */
export function SheetEntryList({
  title,
  description,
  noun,
  entries,
  catalogue,
  path,
  problem,
  disabled,
  onChange,
}: SheetEntryListProps) {
  const taken = new Set(
    entries.map((entry) => entry.catalogueKey).filter((key): key is string => key !== null),
  )

  const replace = (index: number, entry: SheetEntry) =>
    onChange(entries.map((existing, at) => (at === index ? entry : existing)))

  const remove = (index: number) => onChange(entries.filter((_, at) => at !== index))

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">
            {title}{' '}
            <span className="text-muted-foreground font-normal tabular-nums">
              {entries.length}/{MAX_SHEET_ENTRIES}
            </span>
          </h3>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <SheetEntryPicker
          noun={noun}
          catalogue={catalogue}
          taken={taken}
          full={entries.length >= MAX_SHEET_ENTRIES}
          disabled={disabled}
          onAdd={(entry) => onChange([...entries, entry])}
        />
      </header>

      {/* The list-level problem — too many entries — as opposed to one belonging to
          a row. Reaching it needs forty-one of something, so it is here for
          completeness rather than as a thing anybody will see. */}
      <FieldError message={problem?.path === path ? problem.message : null} />

      {entries.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
          Nothing here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry, index) => {
            // `problemAtEntry` rather than a `startsWith` written out here, and the
            // reason is on the function: the obvious spelling of this test matches
            // `feats[10].name` against row 1, so a long list lights up the wrong row.
            const rowProblem = problemAtEntry(problem, path, index) ? problem : null
            const roll = entry.roll
            const rollProblem = roll !== null && !isValidRoll(roll)

            return (
              <li key={entry.id} className="flex flex-col gap-1.5 rounded-lg border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{entry.name}</span>
                      {entry.level !== null ? (
                        <Badge variant="secondary">{spellLevelLabel(entry.level)}</Badge>
                      ) : null}
                      {/* What `catalogueKey` is actually for. It is a breadcrumb
                          recording where the copy came from, not a pointer — see the
                          header of convex/lib/rules.ts. */}
                      {entry.catalogueKey === null ? (
                        <Badge variant="outline">yours</Badge>
                      ) : null}
                    </span>
                    {entry.text ? (
                      <p className="text-muted-foreground text-xs whitespace-pre-line">
                        {entry.text}
                      </p>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {/* The one part of a copied entry that stays editable, and the
                    catalogue depends on it: Sneak Attack's own text says "a rogue
                    adds another die every two levels — edit your copy as you level",
                    and Second Wind's says to add your fighter level. Neither is an
                    ability token, so neither can be written down once in rules.ts.
                    Without a box to change the dice in, those entries would be
                    instructions nobody could follow. */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`roll-${entry.id}`}
                    className="text-muted-foreground text-xs font-medium"
                  >
                    Roll
                  </label>
                  <Input
                    id={`roll-${entry.id}`}
                    value={roll ?? ''}
                    // Normalised on every keystroke, which `normaliseRoll` is
                    // written for — it cannot throw, and it is what makes a typed
                    // `2d6 + wis` and a picked `2d6+WIS` byte-identical.
                    onChange={(event) => {
                      const next = normaliseRoll(event.target.value)
                      replace(index, { ...entry, roll: next === '' ? null : next })
                    }}
                    aria-invalid={rollProblem || undefined}
                    disabled={disabled}
                    placeholder="nothing to roll"
                    className="h-7 max-w-40 font-mono"
                    autoComplete="off"
                  />
                </div>

                <FieldError message={rowProblem?.message} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
