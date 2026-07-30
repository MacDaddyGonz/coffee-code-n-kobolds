import { FieldError } from '@/components/FieldError'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import {
  DerivedStat,
  NumberInput,
  SheetField,
  SheetTextArea,
} from '@/components/sheet/SheetFields'
import { Separator } from '@/components/ui/separator'
import { NPC_ACTIONS } from '@convex/lib/rules'
import type { NpcSheet, SheetProblem } from '@convex/lib/sheet'
import { MAX_NPC_NOTES_LENGTH, SPEED_FEET } from '@convex/lib/sheet'

export type NpcSheetFormProps = {
  sheet: NpcSheet
  problem: SheetProblem | null
  disabled?: boolean
  onChange: (sheet: NpcSheet) => void
}

/**
 * A monster's sheet: armour class, hit points, an initiative bonus, notes, and a
 * list of things it does.
 *
 * The reduction is the design rather than a corner cut, and two of the fields here
 * only make sense in that light. `initiativeBonus` is **typed in** because there is
 * no Dexterity score to derive it from — that is the cost of the reduction, paid in
 * one field, and `initiativeBonusOf` is where the fork lives. A monster that needs a
 * saving throw gets an *action* whose roll is `1d20+3`, which is why the catalogue
 * carries three of them and why they are the escape hatch rather than an oversight.
 *
 * Nothing on this form ever reaches a player's browser. Not because it is hidden
 * here — `characters.sheet` refuses an NPC to anybody without the DM code, with the
 * same answer a fabricated id gets, so a player's client is never sent one to hide
 * (CLAUDE.md invariant 1, ADR 0004). `notes` is DM-only by that construction rather
 * than by a flag on the field.
 */
export function NpcSheetForm({ sheet, problem, disabled, onChange }: NpcSheetFormProps) {
  const set = (patch: Partial<NpcSheet>) => onChange({ ...sheet, ...patch })

  const marks = (path: string) => problem?.path === path
  const messageFor = (...paths: string[]) =>
    problem && paths.some((path) => problem.path === path) ? problem.message : null

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <SheetField id="npc-ac" label="Armour class">
          <NumberInput
            id="npc-ac"
            value={sheet.armourClass}
            invalid={marks('armourClass')}
            disabled={disabled}
            onChange={(armourClass) => set({ armourClass })}
          />
        </SheetField>

        <SheetField id="npc-max-hp" label="Maximum hit points">
          <NumberInput
            id="npc-max-hp"
            value={sheet.maxHp}
            invalid={marks('maxHp')}
            disabled={disabled}
            onChange={(maxHp) => set({ maxHp })}
          />
        </SheetField>

        <SheetField id="npc-initiative" label="Initiative bonus">
          <NumberInput
            id="npc-initiative"
            value={sheet.initiativeBonus}
            invalid={marks('initiativeBonus')}
            disabled={disabled}
            onChange={(initiativeBonus) => set({ initiativeBonus })}
          />
        </SheetField>
      </div>
      <FieldError message={messageFor('armourClass', 'maxHp', 'initiativeBonus')} />

      {/* A monster moves 35 feet like everybody else. Shown rather than left out, so
          the DM does not have to remember whether the reduced sheet dropped it. */}
      <div className="bg-muted/40 rounded-lg border p-3">
        <DerivedStat label="Speed" value={`${SPEED_FEET} ft`} hint="everyone, always" />
      </div>

      <SheetField
        id="npc-notes"
        label="Notes"
        hint="Tactics, weaknesses, what it says when it dies. Only you can read this."
      >
        <SheetTextArea
          id="npc-notes"
          value={sheet.notes}
          maxLength={MAX_NPC_NOTES_LENGTH}
          aria-invalid={marks('notes') || undefined}
          disabled={disabled}
          rows={4}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </SheetField>
      <FieldError message={messageFor('notes')} />

      <Separator />

      <SheetEntryList
        title="Actions"
        description="What it does on its turn. The presets carry flat numbers, because a monster has no ability scores to work one out from — edit the copy to make it tougher."
        noun="action"
        entries={sheet.actions}
        catalogue={NPC_ACTIONS}
        path="actions"
        problem={problem}
        disabled={disabled}
        onChange={(actions) => set({ actions })}
      />
    </div>
  )
}
