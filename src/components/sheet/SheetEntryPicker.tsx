import { useId, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { SheetTextArea } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { PickerRow } from '@/components/ui/picker-row'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CatalogueEntry } from '@convex/lib/rules'
import type { SheetEntry, SheetEntryCategory } from '@convex/lib/sheet'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  SHEET_ENTRY_CATEGORIES,
  SHEET_ENTRY_CATEGORY_LABELS,
  SHEET_ENTRY_ROLL_LABELS,
  normaliseRoll,
  rollProblem,
  rollShapeOf,
  toHitProblem,
} from '@convex/lib/sheet'

export type SheetEntryPickerProps = {
  /** What the button says, and what the dialog is titled: "spell", "feat", "action". */
  noun: string
  catalogue: readonly CatalogueEntry[]
  /**
   * Catalogue keys already on this sheet, so the same line is not offered twice.
   * A key rather than a name, because two entries may legitimately share a name once
   * one of them has been edited.
   */
  taken: ReadonlySet<string>
  /** The list is at `MAX_SHEET_ENTRIES`. Adding is refused rather than hidden. */
  full: boolean
  disabled?: boolean
  onAdd: (entry: SheetEntry) => void
}

/**
 * Where a line gets onto a sheet: pick one out of the D&D Lite catalogue, or write
 * your own.
 *
 * **One picker for feats, spells and NPC actions**, because `sheetEntryValidator`
 * is one shape for all three and says so at length. The two sheet variants differ in
 * what they hold; they do not differ in what a *line* is. A second copy of this for
 * monsters would be the point at which the reduced NPC sheet stopped being a
 * reduction and started being a parallel implementation.
 *
 * A picked entry is stored as a **copy** with a fresh id and `catalogueKey` set —
 * never a reference. convex/lib/rules.ts settles why: a copy means editing or
 * retiring a catalogue entry never rewrites a character that already has it, and a
 * hand-typed line is byte-identical in shape to one that came from the list. The key
 * is a breadcrumb for a badge and for the "already have it" test below, and nothing
 * joins on it.
 *
 * The dialog stays open after an add, because picking spells happens in threes.
 */
export function SheetEntryPicker({
  noun,
  catalogue,
  taken,
  full,
  disabled,
  onAdd,
}: SheetEntryPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // `useId` rather than fixed ids, for the reason `CreatureSheetFields` gives: two of
  // these are mounted at once on a hero's sheet — one for feats and one for spells —
  // and two labels pointing at the same input is a label that focuses the wrong box.
  const fieldId = useId()

  const [customName, setCustomName] = useState('')
  const [customText, setCustomText] = useState('')
  const [customRoll, setCustomRoll] = useState('')
  const [customToHit, setCustomToHit] = useState('')
  // An action by default, because that is what a hand-typed line with a roll already
  // was before the category existed — the same answer `categoryOf` derives for every
  // stored entry that has no category, arrived at the same way. A weapon can never be
  // the default here for the reason it can never be one there: it is the only category
  // that asserts a second field exists.
  const [customCategory, setCustomCategory] = useState<SheetEntryCategory>('action')

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return catalogue
    // Name and description both, so "fire" finds Fire Bolt and "cone" finds Burning
    // Hands. A DM at the table remembers what a thing does more reliably than what
    // it is called.
    return catalogue.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) || entry.text.toLowerCase().includes(needle),
    )
  }, [catalogue, search])

  // Empty means "no roll" — which the *category* now decides is allowed rather than it
  // being allowed on anything, so the emptiness is the arity guard's business below and
  // this pair only asks whether what was typed is a roll at all.
  //
  // ⚠️ **The two boxes ask different functions, and that is the correction rather than
  // an inconsistency.** A damage is any roll in the grammar; a to-hit is *one d20* and
  // its modifiers, which the shared grammar has no opinion about — so `2d6+STR` typed
  // into the to-hit box is a perfectly good roll and not a to-hit. Asking `rollProblem`
  // for both left this form enabling an Add on a value `sheetProblem` then refused,
  // which is the one thing a client-side check here exists to prevent.
  //
  // Checked here so the button is disabled rather than the save being refused later.
  //
  // Both sentences come from the shared module rather than being written out beside
  // the field, because they are the sentences `sheetProblem` throws for the same
  // values: the form and the mutation are not allowed to disagree about what is wrong
  // with a roll, and a hand copy of a message stops matching the moment the grammar
  // grows a term.
  const rollRefusal = customRoll === '' ? null : rollProblem(customRoll)
  const toHitRefusal = customToHit === '' ? null : toHitProblem(customToHit)

  const shape = rollShapeOf(customCategory)
  // `entriesProblem`'s four arity checks, restated as a condition on the button rather
  // than paraphrased: a weapon needs both rolls, an action needs one and may not have a
  // to-hit, a passive may have neither. Checked in *both* directions even though
  // `chooseCategory` below clears what the new category cannot hold, so the guard is the
  // rule itself and not a claim about what the state can currently be.
  const arityOk =
    (shape.roll ? customRoll !== '' : customRoll === '') &&
    (shape.toHit ? customToHit !== '' : customToHit === '')
  const canAddCustom =
    customName.trim() !== '' && rollRefusal === null && toHitRefusal === null && arityOk

  /**
   * Change what shape of thing is being written, and drop what the new shape cannot
   * hold.
   *
   * The same act `SheetEntryList`'s row performs, and deliberately not the same code:
   * that one rewrites a stored entry and has to be careful that a removed field is
   * *absent* rather than `undefined`, and this one only clears two strings of draft
   * state that the literal below already reads conditionally. Clearing rather than
   * merely hiding is what keeps the Add button's refusal honest — a hidden box holding
   * a value the guard is still testing is a button disabled for a reason nothing on
   * screen shows.
   */
  const chooseCategory = (next: SheetEntryCategory) => {
    const shapeOfNext = rollShapeOf(next)
    setCustomCategory(next)
    if (!shapeOfNext.roll) setCustomRoll('')
    if (!shapeOfNext.toHit) setCustomToHit('')
  }

  const addCustom = () => {
    if (!canAddCustom) return
    // ⚠️ **The client half of the field-by-field rebuild trap.** This literal names
    // every field of a `SheetEntry` by hand, so a field added to `sheetEntryValidator`
    // and forgotten here is not a type error — it is a value the form collects and the
    // save silently discards, which is the bug this codebase has now shipped twice. The
    // backend's `normaliseEntry` carries the same warning; both construction sites in
    // this file are the same shape of exposure and are kept next to each other for it.
    onAdd({
      id: newEntryId(),
      name: customName,
      text: customText,
      roll: customRoll === '' ? null : customRoll,
      // Null even on a spell. A spell level is a slot, and a line somebody wrote by
      // hand is a note about something their character can do — `sheetEntryValidator`
      // makes the field nullable precisely so it does not have to be invented here.
      level: null,
      catalogueKey: null,
      category: customCategory,
      // A conditional spread rather than `toHit: undefined`, which is the house rule for
      // an object rebuilt field by field — `undefined` is not a Convex value, so naming
      // the key and giving it that is a different write from omitting it, and
      // `entriesProblem` refuses a to-hit present on anything but a weapon.
      // (`withoutUndefined` is the other half of that rule, for a shape built by
      // spreading an existing one, which this is not.)
      ...(customToHit === '' ? {} : { toHit: customToHit }),
    })
    setCustomName('')
    setCustomText('')
    setCustomRoll('')
    setCustomToHit('')
    // The category deliberately survives. The dialog stays open because spells are
    // picked in threes, and a DM typing out a monster's three attacks would otherwise
    // re-choose Weapons for each of them — it is the mode the tab is in rather than
    // content belonging to the line just added.
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="outline" disabled={disabled || full}>
          <Plus />
          Add {noun}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a {noun}</DialogTitle>
          <DialogDescription>
            Anything you take from the list is copied onto the sheet, so you can change your copy
            without changing anyone else&rsquo;s.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="catalogue">
          <TabsList>
            <TabsTrigger value="catalogue">From the list</TabsTrigger>
            <TabsTrigger value="custom">Write your own</TabsTrigger>
          </TabsList>

          <TabsContent value="catalogue" className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-search`} className="sr-only">
              Search
            </Label>
            <Input
              id={`${fieldId}-search`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${catalogue.length} ${noun}s…`}
              autoComplete="off"
            />

            {/* Scrolls inside itself: the spell list is two dozen entries with a
                paragraph each, and a dialog that grows to fit them takes its own
                close button off the bottom of the screen. */}
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center">
                  Nothing matches that. The Write your own tab takes anything.
                </p>
              ) : (
                matches.map((entry) => {
                  const already = taken.has(entry.key)
                  return (
                    <PickerRow
                      key={entry.key}
                      disabled={already}
                      onClick={() =>
                        // ⚠️ The second construction site, and the same trap as
                        // `addCustom` above: a field on `CatalogueEntry` that is not
                        // copied across here is a field the catalogue declares and the
                        // sheet never receives. `category` is *required* on a
                        // `CatalogueEntry` precisely so that forgetting it here fails
                        // to compile rather than shipping every picked line as an
                        // action.
                        onAdd({
                          id: newEntryId(),
                          name: entry.name,
                          text: entry.text,
                          roll: entry.roll,
                          level: entry.level,
                          catalogueKey: entry.key,
                          category: entry.category,
                          // Conditional, so an entry with no to-hit arrives on the
                          // sheet with no `toHit` key at all rather than one holding
                          // `undefined` — which is not a Convex value and is a
                          // different document.
                          ...(entry.toHit === undefined ? {} : { toHit: entry.toHit }),
                        })
                      }
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{entry.name}</span>
                        {entry.level !== null ? (
                          <Badge variant="secondary">{spellLevelLabel(entry.level)}</Badge>
                        ) : null}
                        {entry.roll !== null ? (
                          <Badge variant="outline" className="font-mono">
                            {entry.roll}
                          </Badge>
                        ) : null}
                        {already ? <Badge variant="ghost">already on the sheet</Badge> : null}
                      </span>
                      <span className="text-muted-foreground text-xs">{entry.text}</span>
                    </PickerRow>
                  )
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${fieldId}-name`}>Name</Label>
              <Input
                id={`${fieldId}-name`}
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                maxLength={MAX_ENTRY_NAME_LENGTH}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${fieldId}-text`}>What it does</Label>
              <SheetTextArea
                id={`${fieldId}-text`}
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
                maxLength={MAX_ENTRY_TEXT_LENGTH}
                rows={4}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${fieldId}-category`}>Kind</Label>
              <NativeSelect
                id={`${fieldId}-category`}
                value={customCategory}
                onChange={(event) => chooseCategory(event.target.value as SheetEntryCategory)}
              >
                {/* Driven by `SHEET_ENTRY_CATEGORIES` for the reason the list's
                    sub-grouping is: a fourth category that never appears in this
                    dropdown is a category nobody can ever write by hand, which is a
                    failure with nothing to see. */}
                {SHEET_ENTRY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {SHEET_ENTRY_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-muted-foreground text-xs">
                A weapon is swung or aimed and rolls twice — once to hit and once for damage. An
                action is used and rolls once. A passive is declared and rolls nothing.
              </span>
            </div>

            {/* Shown only for the category that has one, which is the whole of what
                "only a weapon rolls to hit" looks like to somebody writing a line: the
                field is not there to fill in wrongly. */}
            {shape.toHit ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${fieldId}-tohit`}>Roll to hit</Label>
                <Input
                  id={`${fieldId}-tohit`}
                  value={customToHit}
                  onChange={(event) => setCustomToHit(normaliseRoll(event.target.value))}
                  aria-invalid={toHitRefusal !== null || undefined}
                  placeholder="1d20+STR+PROF"
                  className="font-mono"
                  autoComplete="off"
                />
                <FieldError message={toHitRefusal} />
              </div>
            ) : null}

            {/* And the damage box goes the same way for a passive. This is the one
                place the two components differ on purpose: a stored passive carrying a
                roll has to keep its box so the refusal telling the DM to clear it is
                followable, but nothing is stored here yet — `chooseCategory` has
                already emptied it, so there is nothing to strand. */}
            {shape.roll ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${fieldId}-roll`}>
                  {SHEET_ENTRY_ROLL_LABELS[customCategory]}
                </Label>
                <Input
                  id={`${fieldId}-roll`}
                  value={customRoll}
                  // Normalised on every keystroke, which is what `normaliseRoll` is
                  // written for — it cannot throw, and applying it here rather than at
                  // submit is what makes a typed `2d6 + wis` and a picked `2d6+WIS`
                  // byte-identical rather than merely equivalent.
                  onChange={(event) => setCustomRoll(normaliseRoll(event.target.value))}
                  aria-invalid={rollRefusal !== null || undefined}
                  placeholder="1d8+WIS"
                  className="font-mono"
                  autoComplete="off"
                />
                <FieldError message={rollRefusal} />
              </div>
            ) : null}

            <span className="text-muted-foreground text-xs">
              STR, DEX, CON, INT, WIS, CHA and PROF all work as terms in a roll — they are worked
              out from the sheet when the roll is made, so they stay right as the character
              changes.
            </span>

            <Button type="button" size="sm" disabled={!canAddCustom} onClick={addCustom}>
              Add to the sheet
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Cantrip' : `Level ${level}`
}

/**
 * A fresh id for a line on a sheet.
 *
 * It has to be unique within its list and at most `MAX_ENTRY_ID_LENGTH` characters,
 * and `sheetProblem` refuses a sheet that breaks either — because the id is a React
 * key today and the rolls milestone's roll target tomorrow, so a duplicate would make
 * clicking one entry roll another.
 *
 * The fallback is not superstition. `crypto.randomUUID` exists only in a secure
 * context, and a DM running `vite --host` so the table can reach their laptop over
 * the LAN is serving plain http to everyone but themselves — which is a realistic
 * way to play this and would otherwise throw on the first spell anybody added.
 */
function newEntryId(): string {
  const raw =
    crypto.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return raw.replace(/-/g, '').slice(0, MAX_ENTRY_ID_LENGTH)
}
