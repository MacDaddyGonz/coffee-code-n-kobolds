import { FieldError } from '@/components/FieldError'
import { CreatureGroupToggle } from '@/components/sheet/CreatureGroupToggle'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import {
  DerivedStat,
  NumberInput,
  SheetField,
  SheetTextArea,
  marksField,
  speedHint,
} from '@/components/sheet/SheetFields'
import { Separator } from '@/components/ui/separator'
import { NPC_ACTIONS } from '@convex/lib/rules'
// ⚠️ `NpcSheet`, `NPC_ACTIONS` and `MAX_NPC_NOTES_LENGTH` keep their names deliberately.
// `kind: 'npc'` is the stored discriminator — the member name in `storedSheetValidator`
// and the literal in every DM creature document in every game — so the backend type is
// named for the value on the wire. This file is named for what a DM reads, and the two
// words are no longer the same word: an NPC and a monster are both creatures, and `group`
// is the field that says which.
import type { NpcSheet, SheetProblem } from '@convex/lib/sheet'
import { MAX_NPC_NOTES_LENGTH, creatureGroupOf, messageAtField, speedOf } from '@convex/lib/sheet'

export type CreatureSheetFormProps = {
  sheet: NpcSheet
  problem: SheetProblem | null
  disabled?: boolean
  onChange: (sheet: NpcSheet) => void
}

/**
 * A hand-built creature's sheet: which list it belongs in, armour class, hit points, an
 * initiative bonus, notes, and a list of things it does.
 *
 * The reduction is the design rather than a corner cut, and two of the fields here
 * only make sense in that light. `initiativeBonus` is **typed in** because there is
 * no Dexterity score to derive it from — that is the cost of the reduction, paid in
 * one field, and `initiativeBonusOf` is where the fork lives. A creature that needs a
 * saving throw gets an *action* whose roll is `1d20+3`, which is why the catalogue
 * carries three of them and why they are the escape hatch rather than an oversight.
 *
 * Nothing on this form ever reaches an ungranted player's browser. Not because it is
 * hidden here — `characters.sheet` refuses one of the DM's creatures to anybody without
 * the DM code or control of a token bound to it, with the same answer a fabricated id
 * gets, so such a client is never sent one to hide (CLAUDE.md invariant 1, ADR 0004).
 * `notes` is DM-only by that construction rather than by a flag on the field.
 */
export function CreatureSheetForm({ sheet, problem, disabled, onChange }: CreatureSheetFormProps) {
  const set = (patch: Partial<NpcSheet>) => onChange({ ...sheet, ...patch })

  // The same pair the hero's form uses, and both are shared with it — see the note on
  // `marksField`. This form's own copy of the *message* matcher tested for an exact path
  // only, so the first nested field the reduced sheet ever grew would have reddened a box
  // and printed nothing beside it.
  const marks = (path: string) => marksField(problem, path)

  const speed = speedOf(sheet)

  // What the document says, or what `creatureGroupOf` reads out of its silence — the same
  // accessor `groupOf` answers with on the server, so this form and the DM's sheet list
  // cannot draw one creature two ways. A creature built before the field existed, or by
  // any rebuild with nobody to ask, stores no group at all, and showing that as *no*
  // button pressed would invite the DM to "fix" a row that is already filed correctly.
  // Pressing one writes a real value, so the absence is only ever displayed and is never
  // round-tripped as `undefined`, which is not a Convex value.
  const group = creatureGroupOf(sheet)

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ **The one control on this form that is not a number, and the reason it is
          here at all.** The two dialogs that build a creature ask this question once, at
          creation; with no control on the full editor a creature answered wrongly — or
          answered by default before anybody thought about it — could never be re-filed,
          and a misfiled row is invisible until the DM goes looking for an owlbear under
          NPCs.

          It is a *display* discriminator and not a secrecy one: both values are DM-only,
          so a wrong answer moves a heading and never publishes a stat block. Compare
          `isMonsterSheet`, which decides whether a document is refused to a player at
          all, is answered from `kind` and is untouched by this control.

          The control is shared with the create dialogs — same buttons, same wording, one
          copy — and iterates the union rather than naming its members; see
          `CreatureGroupToggle`. */}
      <CreatureGroupToggle
        value={group}
        disabled={disabled}
        onChange={(next) => set({ group: next })}
      />

      <div className="grid grid-cols-3 gap-3">
        <SheetField id="creature-ac" label="Armour class">
          <NumberInput
            id="creature-ac"
            value={sheet.armourClass}
            invalid={marks('armourClass')}
            disabled={disabled}
            onChange={(armourClass) => set({ armourClass })}
          />
        </SheetField>

        <SheetField id="creature-max-hp" label="Maximum hit points">
          <NumberInput
            id="creature-max-hp"
            value={sheet.maxHp}
            invalid={marks('maxHp')}
            disabled={disabled}
            onChange={(maxHp) => set({ maxHp })}
          />
        </SheetField>

        <SheetField id="creature-initiative" label="Initiative bonus">
          <NumberInput
            id="creature-initiative"
            value={sheet.initiativeBonus}
            invalid={marks('initiativeBonus')}
            disabled={disabled}
            onChange={(initiativeBonus) => set({ initiativeBonus })}
          />
        </SheetField>
      </div>
      <FieldError message={messageAtField(problem, 'armourClass', 'maxHp', 'initiativeBonus')} />

      {/* Shown rather than left out, so the DM does not have to remember whether the
          reduced sheet dropped it.

          **Read through `speedOf` rather than printed as `SPEED_FEET`.** It was the
          constant, with a comment saying a creature has no race to move it and gets an
          action saying it is fast instead. That stopped being true when the bestiary gave
          every creature a stored speed — a Dire Wolf moves 50 and a Zombie moves 20, and
          the difference is most of what makes them feel unlike each other on a grid — so
          the number was on the document and this form was quietly discarding it on display.
          The hint is `speedHint`, shared with the hero's derived row and the creature
          statline, because 20 with no explanation beside it reads as a bug on a page where
          every other creature says 35.

          Still printed rather than typed: a hand-built creature's speed is not a field this
          form offers, and one taken from the shelf is overridden on its own sheet. */}
      <div className="bg-muted/40 rounded-lg border p-3">
        <DerivedStat label="Speed" value={`${speed} ft`} hint={speedHint(speed)} />
      </div>

      <SheetField
        id="creature-notes"
        label="Notes"
        hint="Tactics, weaknesses, what it says when it dies. Only you can read this."
      >
        <SheetTextArea
          id="creature-notes"
          value={sheet.notes}
          maxLength={MAX_NPC_NOTES_LENGTH}
          aria-invalid={marks('notes') || undefined}
          disabled={disabled}
          rows={4}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </SheetField>
      <FieldError message={messageAtField(problem, 'notes')} />

      <Separator />

      <SheetEntryList
        title="Actions"
        description="What it does on its turn. The presets carry flat numbers, because a hand-built creature has no ability scores to work one out from — edit the copy to make it tougher."
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
