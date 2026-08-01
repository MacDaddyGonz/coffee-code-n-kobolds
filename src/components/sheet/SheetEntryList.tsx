import { Trash2 } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { SheetEntryPicker, spellLevelLabel } from '@/components/sheet/SheetEntryPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { CatalogueEntry } from '@convex/lib/rules'
import type { SheetEntry, SheetEntryCategory, SheetProblem } from '@convex/lib/sheet'
import {
  MAX_SHEET_ENTRIES,
  SHEET_ENTRY_CATEGORIES,
  SHEET_ENTRY_CATEGORY_LABELS,
  SHEET_ENTRY_ROLL_LABELS,
  categoryOf,
  isValidRoll,
  messageAtField,
  normaliseRoll,
  problemAtEntry,
  rollShapeOf,
  toHitOf,
  withoutUndefined,
} from '@convex/lib/sheet'

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
  /**
   * Show the list and nothing that changes it: no picker, no bin, and the roll as text.
   *
   * This is what a character built from the library gets. Their feats and spells are
   * read live out of `lib/library/` and reassembled on every level-up, so a box to edit
   * one in would be a box whose contents the next level silently discards — the
   * override that *does* survive is `extraFeats`, which is the DM's and is not this.
   */
  readOnly?: boolean
  onChange?: (entries: SheetEntry[]) => void
}

/**
 * One entry together with **where it sits in the array it came from**.
 *
 * ⚠️ The index is the whole reason this type exists. Sub-grouping the list means the
 * order things are drawn in is no longer the order they are stored in, and `remove` and
 * `replace` below address the *stored* list by position — so a row that carried its
 * position within its group would bin whatever happens to be third overall when the
 * third weapon's bin is clicked. The index is taken once, before anything is bucketed,
 * and travels with the entry from there.
 */
type PositionedEntry = { entry: SheetEntry; index: number }

/** Shared, because a read-only list needs the shape and never the contents. */
const EMPTY_TAKEN: ReadonlySet<string> = new Set()

/**
 * A list of lines on a sheet: the feats, the spells, or what a monster does.
 *
 * **One component for all three.** `sheetEntryValidator` is one shape, and the
 * argument for that is written out on the validator itself — the two sheet variants
 * differ in what they hold, not in what a line is. Writing this three times is how
 * the reduced NPC sheet would have turned into a second copy of everything.
 *
 * **The lists themselves did not change when the category arrived**, and that is worth
 * saying because it is the question a reader asks first. A hero still has Feats and
 * Spells and a monster still has Actions, because those are the things a sheet holds;
 * the category says what *shape of roll* a line is, which is a different question with a
 * different answer for every line. So each list sub-groups under Weapons, Actions and
 * Passives rather than the categories replacing the lists.
 *
 * The rolls milestone makes each row clickable to send a roll to the feed, and
 * alt-click sends the description instead. Nothing here rolls anything: the id on each
 * entry is what that will aim at, which is why `sheetProblem` refuses a sheet with a
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
  readOnly,
  onChange,
}: SheetEntryListProps) {
  // Only the picker asks which catalogue keys are already here, and a read-only list
  // has no picker — so three of this component's five call sites were building a map,
  // a filter and a set over up to forty entries on every keystroke in an unrelated
  // field, for a value nothing then read. `EMPTY_TAKEN` rather than a fresh set, so
  // the cheap branch allocates nothing either.
  const taken = readOnly
    ? EMPTY_TAKEN
    : new Set(
        entries.map((entry) => entry.catalogueKey).filter((key): key is string => key !== null),
      )

  const replace = (index: number, entry: SheetEntry) =>
    onChange?.(entries.map((existing, at) => (at === index ? entry : existing)))

  const remove = (index: number) => onChange?.(entries.filter((_, at) => at !== index))

  // Bucketed in one pass, keyed by the union itself rather than by three names written
  // out here — see the render below for why that matters.
  const buckets = new Map<SheetEntryCategory, PositionedEntry[]>(
    SHEET_ENTRY_CATEGORIES.map((category) => [category, []]),
  )
  entries.forEach((entry, index) => {
    // `categoryOf` rather than `entry.category`, which is optional and absent on every
    // line written before the category existed. One accessor, one default.
    buckets.get(categoryOf(entry))?.push({ entry, index })
  })

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">
            {title}{' '}
            <span className="text-muted-foreground font-normal tabular-nums">
              {/* The ceiling is only worth showing to somebody who can add to the
                  list. On a library character it is a limit on a number nobody here
                  controls, which reads as a warning about nothing. */}
              {readOnly ? entries.length : `${entries.length}/${MAX_SHEET_ENTRIES}`}
            </span>
          </h3>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {readOnly ? null : (
          <SheetEntryPicker
            noun={noun}
            catalogue={catalogue}
            taken={taken}
            full={entries.length >= MAX_SHEET_ENTRIES}
            disabled={disabled}
            onAdd={(entry) => onChange?.([...entries, entry])}
          />
        )}
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
        // ⚠️ **Driven by `SHEET_ENTRY_CATEGORIES`, and never by three sections written
        // out in the markup.** The three-`filter` spelling of this is the formulation
        // that fails *silently* if a fourth category is ever added: the entry would be
        // stored, would count against `MAX_SHEET_ENTRIES`, and would have no row — so no
        // bin to click and no way to reach it again. Every other place the union is
        // switched on refuses to compile in that case, by the `never` arm in
        // `rollShapeOf` and by `SHEET_ENTRY_CATEGORY_LABELS` being a `Record` keyed by
        // it; the one screen the entries are actually seen on should not be the
        // exception that says nothing.
        SHEET_ENTRY_CATEGORIES.map((category) => {
          const rows = buckets.get(category) ?? []
          // No heading for a category nothing is in. A hero with no weapons should not
          // be told they have a Weapons section that is empty.
          if (rows.length === 0) return null

          return (
            <div key={category} className="flex flex-col gap-1">
              <h4 className="text-muted-foreground text-xs font-medium">
                {SHEET_ENTRY_CATEGORY_LABELS[category]}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {rows.map(({ entry, index }) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    index={index}
                    category={category}
                    path={path}
                    problem={problem}
                    disabled={disabled}
                    readOnly={readOnly}
                    replace={replace}
                    remove={remove}
                  />
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}

function EntryRow({
  entry,
  index,
  category,
  path,
  problem,
  disabled,
  readOnly,
  replace,
  remove,
}: {
  entry: SheetEntry
  /** Its position in the *stored* list, not in the group it is drawn under. */
  index: number
  category: SheetEntryCategory
  path: string
  problem: SheetProblem | null
  disabled?: boolean
  readOnly?: boolean
  replace: (index: number, entry: SheetEntry) => void
  remove: (index: number) => void
}) {
  // `problemAtEntry` rather than a `startsWith` written out here, and the
  // reason is on the function: the obvious spelling of this test matches
  // `feats[10].name` against row 1, so a long list lights up the wrong row.
  const entryPath = `${path}[${index}]`
  const rowProblem = problemAtEntry(problem, path, index) ? problem : null

  const roll = entry.roll
  // `toHitOf` rather than `entry.toHit`, which is optional and — on anything that is
  // not a weapon — a value nothing should read even if a document carries one.
  const toHit = toHitOf(entry)
  const shape = rollShapeOf(category)

  // Two reasons a box is marked, and both are wanted. The grammar check is immediate
  // and needs no round trip through `sheetProblem`; the path check is what catches the
  // arity refusals, which are about a value being *absent* and so can never fail a
  // grammar test on the text that is there.
  const rollInvalid =
    (roll !== null && !isValidRoll(roll)) || messageAtField(problem, `${entryPath}.roll`) !== null
  const toHitInvalid =
    (toHit !== null && !isValidRoll(toHit)) || messageAtField(problem, `${entryPath}.toHit`) !== null

  /**
   * Change what shape of thing this line is.
   *
   * ⚠️ **Through `withoutUndefined`, and the difference is a stored field.** Turning a
   * weapon into an action has to *remove* the to-hit, not set it to `undefined`:
   * `undefined` is not a Convex value, this object goes straight into a mutation's
   * arguments, and naming a key and handing it that is a different write from omitting
   * the key — which is exactly what `entriesProblem` then refuses, on a line the user
   * cannot see anything wrong with.
   *
   * The house rule the backend states, in one sentence: a **conditional spread** where an
   * object is rebuilt field by field, and `withoutUndefined` where it is built by
   * spreading an existing one. This is the second, because it is `...entry` plus a
   * change.
   *
   * `roll: null` for the same reason in the other direction: a category that rolls
   * nothing must say so with the value `roll` already uses for none, because that field
   * is required and null is what it means.
   */
  const setCategory = (next: SheetEntryCategory) =>
    replace(
      index,
      withoutUndefined({
        ...entry,
        category: next,
        toHit: rollShapeOf(next).toHit ? entry.toHit : undefined,
        roll: rollShapeOf(next).roll ? entry.roll : null,
      }),
    )

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border p-2">
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
            {/* Meaningless on a library character: every line there arrived
                from somewhere other than the picker, so the badge would sit
                on all of them and distinguish nothing. */}
            {entry.catalogueKey === null && !readOnly ? (
              <Badge variant="outline">yours</Badge>
            ) : null}
          </span>
          {entry.text ? (
            <p className="text-muted-foreground text-xs whitespace-pre-line">{entry.text}</p>
          ) : null}
        </div>

        {readOnly ? null : (
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
        )}
      </div>

      {/* The one part of a copied entry that stays editable, and the
          catalogue depends on it: Sneak Attack's own text says "a rogue
          adds another die every two levels — edit your copy as you level",
          and Second Wind's says to add your fighter level. Neither is an
          ability token, so neither can be written down once in rules.ts.
          Without a box to change the dice in, those entries would be
          instructions nobody could follow. */}
      {readOnly ? (
        // Two labelled values on a weapon and one on an action, rather than a single
        // "Roll" carrying whichever happens to exist. The rolls milestone announces
        // "attacks with their" against the first and prints a number against the
        // second, so a reader who cannot tell them apart here cannot check what they
        // are about to click. A passive shows neither, because it has neither — and
        // then the row omits the line rather than leaving an empty one spacing itself
        // out below the description.
        toHit === null && roll === null ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {toHit === null ? null : <ReadOnlyRoll label="To hit" value={toHit} />}
            {roll === null ? null : <ReadOnlyRoll label={SHEET_ENTRY_ROLL_LABELS[category]} value={roll} />}
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label
            htmlFor={`category-${entry.id}`}
            className="text-muted-foreground text-xs font-medium"
          >
            Kind
          </label>
          <NativeSelect
            id={`category-${entry.id}`}
            className="h-7"
            value={category}
            disabled={disabled}
            onChange={(event) => setCategory(event.target.value as SheetEntryCategory)}
          >
            {/* The plural labels verbatim, reading a little oddly for one line and kept
                anyway: they name the heading this row moves under, which is what
                choosing one actually does. A singular form would be a second place a
                category is named, derived by trimming an `s` off the first — which is a
                rule that holds for these three words and for no reason. */}
            {SHEET_ENTRY_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {SHEET_ENTRY_CATEGORY_LABELS[option]}
              </option>
            ))}
          </NativeSelect>

          {shape.toHit ? (
            <>
              <label
                htmlFor={`tohit-${entry.id}`}
                className="text-muted-foreground text-xs font-medium"
              >
                To hit
              </label>
              <Input
                id={`tohit-${entry.id}`}
                value={toHit ?? ''}
                // The same `normaliseRoll`-on-every-keystroke treatment the damage box
                // gets, for the same reason: a typed `1d20 + str` and a picked
                // `1d20+STR` have to be byte-identical rather than merely equivalent.
                onChange={(event) => {
                  const next = normaliseRoll(event.target.value)
                  replace(
                    index,
                    // `withoutUndefined` again, for the same reason as the category
                    // flip: emptying the box has to leave the key *absent*.
                    withoutUndefined({ ...entry, toHit: next === '' ? undefined : next }),
                  )
                }}
                aria-invalid={toHitInvalid || undefined}
                disabled={disabled}
                placeholder="1d20+STR+PROF"
                className="h-7 max-w-40 font-mono"
                autoComplete="off"
              />
            </>
          ) : null}

          <label htmlFor={`roll-${entry.id}`} className="text-muted-foreground text-xs font-medium">
            {SHEET_ENTRY_ROLL_LABELS[category]}
          </label>
          {/* Shown on a passive too, which reads like an oversight and is not. The
              refusal a passive with a roll gets says "Clear the roll, or make it an
              action" — advice that needs a box to clear it in. A document written by a
              newer deployment is exactly how one arrives, and hiding the field would
              leave the only instruction on screen impossible to follow. `setCategory`
              nulls it on the way in, so in practice it is empty. */}
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
            aria-invalid={rollInvalid || undefined}
            disabled={disabled}
            placeholder={shape.roll ? '1d8+STR' : 'nothing to roll'}
            className="h-7 max-w-40 font-mono"
            autoComplete="off"
          />
        </div>
      )}

      <FieldError message={rowProblem?.message} />
    </li>
  )
}

/** One labelled roll on a row nobody may edit. */
function ReadOnlyRoll({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </span>
  )
}

