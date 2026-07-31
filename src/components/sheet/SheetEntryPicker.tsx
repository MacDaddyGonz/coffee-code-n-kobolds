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
import { PickerRow } from '@/components/ui/picker-row'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CatalogueEntry } from '@convex/lib/rules'
import type { SheetEntry } from '@convex/lib/sheet'
import {
  MAX_ENTRY_ID_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_TEXT_LENGTH,
  normaliseRoll,
  rollProblem,
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

  // `useId` rather than fixed ids, for the reason `NpcSheetFields` gives: two of
  // these are mounted at once on a hero's sheet — one for feats and one for spells —
  // and two labels pointing at the same input is a label that focuses the wrong box.
  const fieldId = useId()

  const [customName, setCustomName] = useState('')
  const [customText, setCustomText] = useState('')
  const [customRoll, setCustomRoll] = useState('')

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

  // Empty means "no roll", which is a perfectly ordinary entry — Mage Hand and
  // Action Surge both have one. Anything else has to satisfy the grammar, checked
  // here so the button is disabled rather than the save being refused later.
  //
  // The sentence comes from `rollProblem` rather than being written out beside the
  // field, because it is the sentence `sheetProblem` throws for the same value: the
  // form and the mutation are not allowed to disagree about what is wrong with a
  // roll, and a hand copy of a message is a copy that stops matching the moment the
  // grammar grows a term.
  const rollRefusal = customRoll === '' ? null : rollProblem(customRoll)
  const canAddCustom = customName.trim() !== '' && rollRefusal === null

  const addCustom = () => {
    if (!canAddCustom) return
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
    })
    setCustomName('')
    setCustomText('')
    setCustomRoll('')
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
                        onAdd({
                          id: newEntryId(),
                          name: entry.name,
                          text: entry.text,
                          roll: entry.roll,
                          level: entry.level,
                          catalogueKey: entry.key,
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
              <Label htmlFor={`${fieldId}-roll`}>Roll (optional)</Label>
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
              <span className="text-muted-foreground text-xs">
                Leave it empty if there is nothing to roll. STR, DEX, CON, INT, WIS, CHA and PROF
                all work as terms — they are worked out from the sheet when the roll is made, so
                they stay right as the character changes.
              </span>
            </div>

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
 * key today and Milestone 4's roll target tomorrow, so a duplicate would make
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
