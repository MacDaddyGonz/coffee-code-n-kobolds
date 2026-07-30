import { useState } from 'react'

import { FieldError } from '@/components/FieldError'
import { HpControls } from '@/components/HpControls'
import { HitDiceControls } from '@/components/sheet/HitDiceControls'
import { NpcSheetForm } from '@/components/sheet/NpcSheetForm'
import { PcSheetForm } from '@/components/sheet/PcSheetForm'
import { SheetField } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SheetFooter } from '@/components/ui/sheet'
import type { PublicSheet, PublicVitals } from '@convex/lib/characters'
import { MAX_CHARACTER_NAME_LENGTH, collapseWhitespace } from '@convex/lib/codes'
import type { CharacterSheet } from '@convex/lib/sheet'
import { normaliseSheet, sheetProblem } from '@convex/lib/sheet'

export type CharacterSheetEditorProps = {
  /** The sheet as the server last sent it. The draft below is edited against this. */
  saved: PublicSheet
  /** What this client was told about the character's hit points. Null while loading. */
  vitals: PublicVitals | null
  onAdjustHp: (delta: number) => void
  /** −1 spends a hit die, +1 hands one back. Floored and capped server-side. */
  onAdjustHitDice: (delta: number) => void
  /** Both resolve to the server's own wording, or null on success. */
  onSave: (sheet: CharacterSheet) => Promise<string | null>
  onRename: (name: string) => Promise<string | null>
}

/**
 * The sheet, editable in place, saved by one button.
 *
 * **There is no read-only mode, and that is a property of the query rather than an
 * omission here.** `characters.sheet` answers through `requireEditableCharacter` —
 * the same gate `characters.updateSheet` uses — so a sheet that arrived at this
 * component is one this caller may also change. Another seat's hero and every NPC
 * without the DM code come back as `null` and never reach it. Which is also why
 * there is no client-side permission logic in this file: there is nothing left to
 * decide, and deciding it here would be the affordance-mistaken-for-a-permission
 * that CLAUDE.md invariant 1 is about.
 *
 * Saved explicitly rather than on every keystroke, unlike a token's position. The
 * trade is the opposite one: a drag is continuous and has to look instant, so
 * `moveToken` is throttled and optimistic; a sheet is a form somebody fills in, and
 * writing a half-typed armour class of `1` to every screen at the table on the way
 * to `18` would be worse than a button. It is also a whole-document write — the
 * sheet is a discriminated union with no coherent per-field patch — so batching the
 * edits into one is what `updateSheet` was built for.
 */
export function CharacterSheetEditor({
  saved,
  vitals,
  onAdjustHp,
  onAdjustHitDice,
  onSave,
  onRename,
}: CharacterSheetEditorProps) {
  const [draft, setDraft] = useState<CharacterSheet>(saved.sheet)
  const [name, setName] = useState(saved.name)
  const [echoed, setEchoed] = useState(saved)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Somebody else edited this character while the panel was open — the DM fixing a
  // player's armour class, most likely. Follow the server, but only when there is
  // nothing local to lose: overwriting half-typed edits with a push nobody asked for
  // is the way this sort of form usually goes wrong. When there *is* local work, the
  // draft stands and Save will overwrite theirs, which is the same last-write-wins
  // the rest of the app has and is the right answer for a table of colleagues.
  //
  // Adjusting state during render is React's documented alternative to an effect for
  // deriving state from a prop, and it re-renders before anything reaches the screen
  // rather than showing the stale value for a frame.
  if (echoed !== saved) {
    const untouched = sameSheet(draft, echoed.sheet) && collapseWhitespace(name) === echoed.name
    setEchoed(saved)
    if (untouched) {
      setDraft(saved.sheet)
      setName(saved.name)
    }
  }

  // Normalised first and then checked, always and on both sides — the order
  // `normaliseSheet`'s own comment insists on. A class name of "  Fire  Mage " is a
  // value that needs tidying rather than a validation failure, and tidying it in the
  // shared module is what stops this form's idea of "already valid" drifting away
  // from the mutation's.
  const normalised = normaliseSheet(draft)
  const problem = sheetProblem(normalised)

  const nameProblem = collapseWhitespace(name) === '' ? 'Give the character a name.' : null
  const sheetDirty = !sameSheet(draft, echoed.sheet)
  const nameDirty = collapseWhitespace(name) !== echoed.name
  const dirty = sheetDirty || nameDirty

  const save = async () => {
    if (problem || nameProblem || !dirty || saving) return
    setSaving(true)
    setFailure(null)

    // The name goes first because it is the cheaper failure to recover from: if the
    // rename is refused there is nothing to undo, whereas a sheet written under a
    // name that was then rejected would leave the two halves disagreeing about
    // whether the save happened at all.
    const renameRefusal = nameDirty ? await onRename(name) : null
    const refusal = renameRefusal ?? (sheetDirty ? await onSave(normalised) : null)

    if (refusal === null) {
      // Adopt what was sent rather than waiting for the echo. The server stores
      // exactly these values — it runs the same `normaliseSheet` — so this makes the
      // form clean immediately, and the push that arrives a moment later is then
      // recognised as "nothing local to lose" by the sync above rather than being
      // refused as a conflict with our own write.
      setDraft(normalised)
      setName(collapseWhitespace(name))
    }
    setFailure(refusal)
    setSaving(false)
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          <SheetField id="character-name" label="Name">
            <div className="flex items-center gap-2">
              <Input
                id="character-name"
                value={name}
                maxLength={MAX_CHARACTER_NAME_LENGTH}
                aria-invalid={nameProblem !== null || undefined}
                disabled={saving}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
              <Badge variant={draft.kind === 'npc' ? 'secondary' : 'outline'}>
                {draft.kind === 'npc' ? 'NPC' : 'Player character'}
              </Badge>
            </div>
          </SheetField>
          <FieldError message={nameProblem} />

          {/* Hit points are not part of the sheet and are not saved with it. They
              live in `characterVitals` and are written the instant a button is
              pressed, because damage during a fight is the one number that has to be
              on everyone's screen immediately — and because keeping them out of the
              sheet document is what lets the board draw a health bar without ever
              reading one. Requirements.md asks for the controls in both places. */}
          <div className="flex flex-col gap-1">
            {/* A caption rather than a `<label for>`: the bar is a group of controls
                with their own labels, not one field to point at. */}
            <span className="text-muted-foreground text-xs font-medium">Hit points</span>
            <HpControls vitals={vitals} onAdjust={onAdjustHp} />
          </div>

          {/* Beside the hit points rather than beside the `n × d10` on the form
              below, because that is the distinction the two numbers actually have:
              this block is how the character is doing right now and is written the
              instant a button is pressed, while everything under it is what the
              character is and waits for Save. The server draws the same line — hit
              dice are on the vitals row for it.

              An NPC gets nothing here, and the test is the sheet's own kind rather
              than a null in the payload. The reduced sheet has no hit dice to have
              spent, so there is no state to show, no permission being applied and
              nothing an NPC's DM is being kept from.

              The faces come from `saved` and not from the draft: `hitDiceCount` was
              read off the stored sheet, so pairing it with a die size somebody is
              halfway through changing would print a complement that has never
              existed — `3/5 d12` while the stored sheet still says d8. */}
          {saved.sheet.kind === 'pc' ? (
            <HitDiceControls
              vitals={vitals}
              faces={saved.sheet.hitDice.faces}
              onAdjust={onAdjustHitDice}
            />
          ) : null}
        </div>

        {draft.kind === 'npc' ? (
          <NpcSheetForm
            sheet={draft}
            problem={problem}
            disabled={saving}
            onChange={setDraft}
          />
        ) : (
          <PcSheetForm sheet={draft} problem={problem} disabled={saving} onChange={setDraft} />
        )}
      </div>

      <SheetFooter>
        <span className="text-muted-foreground min-w-0 flex-1 text-xs">
          {failure ? (
            <span className="text-destructive" role="alert">
              {failure}
            </span>
          ) : dirty ? (
            'Unsaved changes.'
          ) : (
            'Everything is saved.'
          )}
        </span>
        <Button
          type="button"
          // Disabled with the *same wording* the server would have thrown, because
          // both sides call `sheetProblem`. The button being unavailable is a
          // courtesy; `updateSheet` re-runs the check and refuses regardless.
          disabled={saving || !dirty || problem !== null || nameProblem !== null}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save sheet'}
        </Button>
      </SheetFooter>
    </>
  )
}

/**
 * Whether two sheets would store identically.
 *
 * Both sides are put through `normaliseSheet` before comparing, so the keys are in
 * the order that one constructor writes them and `JSON.stringify` is a fair test —
 * comparing a stored document against a draft directly would depend on Convex having
 * preserved key order, which is not something to rest a "you have unsaved changes"
 * indicator on.
 */
function sameSheet(a: CharacterSheet, b: CharacterSheet): boolean {
  return JSON.stringify(normaliseSheet(a)) === JSON.stringify(normaliseSheet(b))
}
