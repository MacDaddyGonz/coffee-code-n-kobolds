import { Minus, Plus, Trash2 } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { RollButton } from '@/components/sheet/RollButton'
import { SheetEntryPicker, spellLevelLabel } from '@/components/sheet/SheetEntryPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { FeedPart } from '@convex/lib/roll'
import { partLabel, partsFor } from '@convex/lib/roll'
import { REST_LABELS } from '@convex/lib/rest'
import type { Resource } from '@convex/lib/rest'
import type { CatalogueEntry } from '@convex/lib/rules'
import { WEAPON_MASTERY_LABELS } from '@convex/lib/mastery'
import type { SheetEntry, SheetEntryCategory, SheetProblem } from '@convex/lib/sheet'
import {
  MAX_SHEET_ENTRIES,
  SHEET_ENTRY_CATEGORIES,
  SHEET_ENTRY_CATEGORY_LABELS,
  SHEET_ENTRY_ROLL_LABELS,
  categoryOf,
  isValidRoll,
  masteryOf,
  messageAtField,
  normaliseRoll,
  problemAtEntry,
  rollShapeOf,
  toHitOf,
  usesOf,
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
  /**
   * WHICH HEADING EACH ROW GOES UNDER — the shape of the roll, or the spell level.
   *
   * ⚠️ **This is deliberately not a discriminated union with a `never` arm, and knowing
   * why is what stops somebody adding one.** CLAUDE.md invariant 9's rule is *find the
   * place a wrong answer does damage and make the compiler refuse there*; here a wrong
   * answer prints a row under the wrong heading and nothing else, because **both modes
   * are total**. `'category'` walks `SHEET_ENTRY_CATEGORIES` and `categoryOf` answers one
   * of them for every entry; `'level'` derives its buckets from the entries themselves, so
   * a bucket exists exactly when something is in it. No entry can be stored, counted
   * against `MAX_SHEET_ENTRIES` and left with no row in either mode, which is the failure
   * the category iteration exists to prevent and the only thing at stake.
   *
   * `'level'` is the spell page's, and it is a different question rather than a nicer
   * one: a caster's spells are read *by level* because that is the shape of the resource
   * they are spent from, where a hero's feats are read by what happens when you press
   * them. Both orders are right for their list.
   */
  groupBy?: 'category' | 'level'
  /**
   * How many uses of each key have already gone, or null while the vitals subscription is
   * still answering.
   *
   * Read off the vitals payload's `spentUses`, which is the counted successor to
   * the retired `spentPerRest` and still has a legacy array folded into it server-side — so a
   * caller passing this one alone is correct for both.
   *
   * Absent entirely on a list nobody is playing from: a creature's actions and the DM's
   * comparison panel show what a thing *is* rather than what is left of it.
   */
  spentUses?: readonly { key: string; spent: number }[] | null
  /** Absent means the counters are printed rather than stepped. */
  onSetUses?: (key: string, spent: number) => void
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
 * **A spell list groups by level instead**, which is the one exception and is a `groupBy`
 * rather than a fork — see that prop, where the argument for why it needs no `never` arm
 * lives. Both modes are total: every entry lands under exactly one heading either way, so
 * neither can leave a row stored, counted against `MAX_SHEET_ENTRIES` and unreachable.
 *
 * **A row with a limited-use resource carries a counter**, which is the whole of what the
 * 2024 resource shape produces on screen. ⚠️ It counts and refuses nothing: the roll button
 * beside it does not decrement it, no cast is blocked at zero, and a feature with none left
 * is still one you can press. See `UseCounter`.
 *
 * **Each row is clickable now, and what it offers comes out of `partsFor`.** A weapon
 * shows two buttons, an action one, a passive one, and alt-click on any of them sends the
 * description instead. Nothing here rolls anything: the id on each entry is what the
 * request aims at, which is why `sheetProblem` refuses a sheet with a duplicate or a
 * missing one, and the expression behind it is read off the stored sheet by the server.
 *
 * ⚠️ **The buttons go in the row header, and that placement is what makes one
 * implementation serve both branches of this component.** The body of a row is two things
 * depending on `readOnly` — a pair of printed rolls for a library character or a creature,
 * a row of `<Input>`s for a hand-built sheet — so an affordance built onto either of them
 * would have to be built twice, and the second copy is the one that gets forgotten. The
 * header is the one part of the row that is the same shape on every sheet.
 *
 * The `ReadOnlyRoll` line underneath is left exactly as it was, deliberately: it is what a
 * reader checks *before* clicking, and its own comment says so. A `1d20+STR+PROF` that had
 * become the button would be an affordance and a value in one place, which is the state in
 * which nobody can tell what they are about to send.
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
  groupBy = 'category',
  spentUses,
  onSetUses,
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

  // The index is taken once, here, before anything is bucketed — see `PositionedEntry`.
  const positioned = entries.map((entry, index) => ({ entry, index }))
  const buckets = groupBy === 'level' ? byLevel(positioned) : byCategory(positioned)

  // A `Map` rather than a scan per row: a hero at the forty-entry ceiling with a dozen
  // counted features would otherwise be a quadratic sweep on every keystroke elsewhere on
  // the panel.
  const spent = new Map((spentUses ?? []).map((row) => [row.key, row.spent]))

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
        buckets.map((bucket) => (
          <div key={bucket.key} className="flex flex-col gap-1">
            <h4 className="text-muted-foreground text-xs font-medium">{bucket.heading}</h4>
            <ul className="flex flex-col gap-1.5">
              {bucket.rows.map(({ entry, index }) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  path={path}
                  problem={problem}
                  disabled={disabled}
                  readOnly={readOnly}
                  // `null` and *no counter at all* are two different states and the second
                  // is the absent prop: a list nobody is playing from passes neither, a
                  // list whose subscription has not landed passes `null`, and the counter
                  // is drawn dead in the second case rather than not drawn.
                  spent={
                    spentUses === undefined
                      ? undefined
                      : spentUses === null
                        ? null
                        : (spent.get(entry.id) ?? 0)
                  }
                  onSetUses={onSetUses}
                  replace={replace}
                  remove={remove}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

/** A heading and the rows under it, already positioned against the stored array. */
type Bucket = { key: string; heading: string; rows: PositionedEntry[] }

/**
 * ⚠️ **Driven by `SHEET_ENTRY_CATEGORIES`, and never by three sections written out in
 * the markup.** The three-`filter` spelling of this is the formulation that fails
 * *silently* if a fourth category is ever added: the entry would be stored, would count
 * against `MAX_SHEET_ENTRIES`, and would have no row — so no bin to click and no way to
 * reach it again. Every other place the union is switched on refuses to compile in that
 * case, by the `never` arm in `rollShapeOf` and by `SHEET_ENTRY_CATEGORY_LABELS` being a
 * `Record` keyed by it; the one screen the entries are actually seen on should not be the
 * exception that says nothing.
 *
 * `categoryOf` rather than `entry.category`, which is optional and absent on every line
 * written before the category existed. One accessor, one default.
 *
 * A category nothing is in gets no heading. A hero with no weapons should not be told they
 * have a Weapons section that is empty.
 */
function byCategory(positioned: PositionedEntry[]): Bucket[] {
  const buckets = new Map<SheetEntryCategory, PositionedEntry[]>(
    SHEET_ENTRY_CATEGORIES.map((category) => [category, []]),
  )
  for (const row of positioned) buckets.get(categoryOf(row.entry))?.push(row)

  return SHEET_ENTRY_CATEGORIES.filter((category) => (buckets.get(category)?.length ?? 0) > 0).map(
    (category) => ({
      key: category,
      heading: SHEET_ENTRY_CATEGORY_LABELS[category],
      rows: buckets.get(category) ?? [],
    }),
  )
}

/**
 * Cantrips, then level 1, then level 2, then level 3 — **derived from the entries rather
 * than from a range**, which is what makes it total without a vocabulary to iterate.
 *
 * A spell level is a number on a row and not a union, so there is nothing to be
 * exhaustive against and nothing that could go missing: a bucket exists exactly when
 * something is in it. That is also why the ceiling is not `MAX_SPELL_LEVEL` — this
 * application caps a character at level 5 and therefore a spell at level 3, but a DM's
 * override can put anything on a sheet, and a page that walked 0–3 would hide it.
 *
 * `level: null` is a real state on this list, because a hand-typed entry is not made to
 * declare one, and its rows go last under their own heading rather than being read as
 * cantrips. Sorting the numbered levels ascending rather than by first appearance, because
 * the order a spell page is read in is the order the slots are spent in.
 */
function byLevel(positioned: PositionedEntry[]): Bucket[] {
  const buckets = new Map<number, PositionedEntry[]>()
  const unlevelled: PositionedEntry[] = []

  for (const row of positioned) {
    const level = row.entry.level
    if (level === null || !Number.isFinite(level)) {
      unlevelled.push(row)
      continue
    }
    const rows = buckets.get(level)
    if (rows) rows.push(row)
    else buckets.set(level, [row])
  }

  const levelled = [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((level) => ({
      key: `level-${level}`,
      heading: spellLevelLabel(level),
      rows: buckets.get(level) ?? [],
    }))

  return unlevelled.length === 0
    ? levelled
    : [...levelled, { key: 'unlevelled', heading: 'No level given', rows: unlevelled }]
}

/**
 * THE SENTENCE A SCREEN READER HEARS ON EACH ROLL BUTTON.
 *
 * A `Record` keyed by `FeedPart` rather than a switch or a ternary chain, which is this
 * codebase's rule for a discriminated union and earns the usual refusal: a fifth part fails
 * to compile here instead of leaving a control with no accessible name.
 *
 * ⚠️ **The visible *label* is deliberately not here, and it used to be.** Each part carried
 * a `label` thunk beside its `says`, and three of the four returned a constant out of
 * lib/roll.ts while the fourth reached for the category's word — a table restating a rule
 * that module already owns, and the one place where two names for one roll could come apart.
 * `partLabel(part, category)` is that rule, in the file that has both sources in front of it,
 * so the buttons below and the `ReadOnlyRoll` line beneath them cannot disagree. The `text`
 * entry's label went with them and is not mourned: `partsFor` never returns `'text'`, so it
 * was never called.
 *
 * What is left is the part that is genuinely this component's, because it needs a value only
 * this component has: the accessible name needs the **entry's name**, since `To hit` alone
 * does not say which of a hero's four weapons a button belongs to. `RollButton` appends the
 * mode to it. The `text` row survives here for a reason it does not survive above — alt-click
 * is a modifier on a gesture rather than a fifth button, and its wording is the tooltip's
 * hint, which is what stops the exhaustiveness check costing a dead field.
 */
const PART_SAYS: Record<FeedPart, (name: string) => string> = {
  toHit: (name) => `Roll to hit for ${name}`,
  roll: (name) => `Roll for ${name}`,
  use: (name) => `Use ${name}`,
  text: (name) => `Read out ${name}`,
}

function EntryRow({
  entry,
  index,
  path,
  problem,
  disabled,
  readOnly,
  spent,
  onSetUses,
  replace,
  remove,
}: {
  entry: SheetEntry
  /** Its position in the *stored* list, not in the group it is drawn under. */
  index: number
  path: string
  problem: SheetProblem | null
  disabled?: boolean
  readOnly?: boolean
  /** Undefined offers no counter at all; null is one whose subscription has not landed. */
  spent?: number | null
  onSetUses?: (key: string, spent: number) => void
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
  // Asked here rather than passed down from the bucket, because the two answers came
  // apart the moment a list could be grouped by spell level: the heading a row sits under
  // is a display choice, and the shape of its roll is a fact about the entry. Every reader
  // below wants the second.
  const category = categoryOf(entry)
  const shape = rollShapeOf(category)
  // `masteryOf` and `usesOf` rather than the raw fields, for `toHitOf`'s reason: both are
  // optional, both fail closed against a value written by a deployment this one has not
  // heard of, and a mastery stored on something that is not a weapon is a value nothing
  // should print.
  const mastery = masteryOf(entry)
  const uses = usesOf(entry)

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
            {/* ⚠️ **A WORD, AND IT DOES NOTHING.** Push shoves nobody ten feet, Slow
                reduces no speed, Topple sets nobody Prone, and no roll anywhere consults
                a mastery — `WEAPON_MASTERY_LABELS` is a `Record` of capitalised words
                with no effect description on them, and `masteryGuard.test.ts` is what
                makes that a promise rather than an intention. It is printed because a
                2024 weapon prints it and the table applies it, which is the same register
                as a condition pip on a coin and a creature's loot being a line of text.
                See ADR 0016. */}
            {mastery ? <Badge variant="ghost">{WEAPON_MASTERY_LABELS[mastery]}</Badge> : null}
          </span>
          {entry.text ? (
            <p className="text-muted-foreground text-xs whitespace-pre-line">{entry.text}</p>
          ) : null}
        </div>

        {/* ⚠️ **Driven by `partsFor(category)` and by nothing else.** That function is
            composed out of `rollShapeOf`, which is the one place `SheetEntryCategory` is
            answered — so a fourth category arrives here with buttons already decided,
            rather than falling through a category switch written a second time in a
            component. CLAUDE.md invariant 9 exists because of exactly that shape of test.
            It is also why there is no "only if the expression is filled in" condition: a
            weapon offers a to-hit because it is a weapon, and a half-typed one is a
            refusal the server words, not a button this component quietly withholds.

            `shrink-0` so the group keeps its width against a long entry name, and the
            controls sit in the order `partsFor` returns them — to hit before damage,
            because that is the order they are pressed in. */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Before the roll buttons rather than after, so the question *have I any left*
              is answered on the way to the button that spends one. Absent unless the entry
              declares a resource AND this list is one somebody plays from — see the note
              on `spentUses`. */}
          {uses && spent !== undefined ? (
            <UseCounter
              uses={uses}
              spent={spent}
              disabled={disabled}
              onSet={onSetUses && ((next) => onSetUses(entry.id, next))}
              name={entry.name}
            />
          ) : null}

          {partsFor(category).map((part) => (
            <RollButton
              key={part}
              request={{ kind: 'entry', entryId: entry.id, part }}
              says={PART_SAYS[part](entry.name)}
              altSays={PART_SAYS.text(entry.name)}
              disabled={disabled}
            >
              {partLabel(part, category)}
            </RollButton>
          ))}

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
        // "Roll" carrying whichever happens to exist. The announcement says "attacks
        // with their" against the first and prints a number against the second, so a
        // reader who cannot tell them apart here cannot check what they are about to
        // click. A passive shows neither, because it has neither — and then the row
        // omits the line rather than leaving an empty one spacing itself out below
        // the description.
        //
        // ⚠️ **Both labels come from the shared vocabulary and neither is a literal**,
        // which used to be true of only one of them. This line sits directly beneath
        // the roll buttons in the header, and those ask `partLabel` for their words — so
        // the to-hit asks it too, with the part named rather than the word spelled, and a
        // hard-coded `"To hit"` a centimetre from the button that reads it properly is
        // the drift that would have shown up as one row calling the same roll two things.
        toHit === null && roll === null ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {toHit === null ? null : (
              <ReadOnlyRoll label={partLabel('toHit', category)} value={toHit} />
            )}
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

/**
 * How many uses are left of a limited thing, and the two buttons that move the tally.
 *
 * ⚠️ **NOTHING SPENDS THIS AND NOTHING IS REFUSED AT ZERO.** The roll buttons a centimetre
 * to the right do not decrement it, no mutation checks it before a roll, and a feature with
 * none left is a feature you can still press — `resourceValidator`'s own note says so, and
 * it is the same line the whole application draws: it announces and counts, and the table
 * adjudicates. Wiring the button beside this one to the counter is the edit that makes this
 * a rules engine, and it needs an amendment and an ADR rather than three reasonable lines.
 *
 * The readout is `left of max` rather than `spent of max`, because *how many have I got*
 * is the question being asked mid-fight; the stored fact is the other one, which is why
 * `onSet` sends a spend count and this subtracts.
 *
 * The recharge is a tooltip rather than a caption, because it is read once when somebody
 * wonders whether a short rest is worth taking and never again. `REST_LABELS` supplies both
 * words, so a counter and the rest button below cannot describe the same rest differently.
 */
function UseCounter({
  uses,
  spent,
  disabled,
  name,
  onSet,
}: {
  uses: Resource
  /** Null while the vitals subscription is still answering: shown, and dead. */
  spent: number | null
  disabled?: boolean
  name: string
  onSet?: (spent: number) => void
}) {
  const gone = Math.min(uses.max, Math.max(0, spent ?? 0))
  const left = uses.max - gone
  const live = onSet !== undefined && spent !== null && !disabled

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Use ${name}`}
            disabled={!live || left === 0}
            onClick={() => onSet?.(gone + 1)}
          >
            <Minus />
          </Button>
          <span
            className={cn(
              'font-heading min-w-8 text-center text-xs leading-none font-medium tabular-nums',
              left === 0 && 'text-muted-foreground',
            )}
          >
            {spent === null ? '—' : `${left}/${uses.max}`}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Take a use of ${name} back`}
            disabled={!live || gone === 0}
            onClick={() => onSet?.(gone - 1)}
          >
            <Plus />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {`${left} of ${uses.max} left. Back on a ${REST_LABELS[uses.recharge].label.toLowerCase()}` +
          (uses.regainOnShortRest
            ? `, and a short rest returns ${uses.regainOnShortRest}.`
            : '.')}
      </TooltipContent>
    </Tooltip>
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

