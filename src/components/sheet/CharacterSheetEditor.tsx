import { useMemo, useState } from 'react'

import { FieldError } from '@/components/FieldError'
import { HpControls } from '@/components/HpControls'
import type { BuilderSelections } from '@/components/sheet/CharacterBuilder'
import { CharacterBuilder } from '@/components/sheet/CharacterBuilder'
import { HitDiceControls } from '@/components/sheet/HitDiceControls'
import { NpcSheetForm } from '@/components/sheet/NpcSheetForm'
import { PcSheetForm } from '@/components/sheet/PcSheetForm'
import { PresetSheetView } from '@/components/sheet/PresetSheetView'
import { previewOverrides } from '@/components/sheet/PresetNumbers'
import { SheetField } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SheetFooter } from '@/components/ui/sheet'
import type { PublicSheet, PublicVitals } from '@convex/lib/characters'
import { MAX_CHARACTER_NAME_LENGTH, collapseWhitespace } from '@convex/lib/codes'
import type { PcSheet, StoredSheet } from '@convex/lib/sheet'
import { normaliseStoredSheet, sheetProblem, storedSheetProblem } from '@convex/lib/sheet'

export type CharacterSheetEditorProps = {
  /** The sheet as the server last sent it. The draft below is edited against this. */
  saved: PublicSheet
  /** What this client was told about the character's hit points. Null while loading. */
  vitals: PublicVitals | null
  /**
   * Whether this browser holds the DM code.
   *
   * It decides what is *offered* and never what is permitted: every mutation reached
   * from here re-verifies the code server-side through `requireDm` or
   * `resolveDmAccess`, and a browser that lied about this gets a panel full of controls
   * and a refusal from each one.
   */
  isDm: boolean
  onAdjustHp: (delta: number) => void
  /** −1 spends a hit die, +1 hands one back. Floored and capped server-side. */
  onAdjustHitDice: (delta: number) => void
  /** Both resolve to the server's own wording, or null on success. */
  onSave: (sheet: StoredSheet) => Promise<string | null>
  onRename: (name: string) => Promise<string | null>
  /** DM only. Immediate rather than drafted — see `LevelControl`. Refusals toast. */
  onSetLevel: (level: number) => void
  onSetLocked: (locked: boolean) => void
  onSetPerRest: (key: string, spent: boolean) => void
  onLongRest: () => void
}

/**
 * The sheet, saved by one button — and, since Milestone 4, the sheet chosen by three
 * dropdowns as well.
 *
 * **There is no read-only mode, and that is a property of the query rather than an
 * omission here.** `characters.sheet` answers through `requireEditableCharacter` — the
 * same gate `characters.updateSheet` uses — so a sheet that arrived at this component
 * is one this caller may also change. Another seat's hero and every NPC without the DM
 * code come back as `null` and never reach it.
 *
 * What `isDm` buys is therefore not access but *authorship*: a character built from the
 * library holds selections rather than numbers, and the rule about who may change which
 * part of one lives in `requirePresetChangeAllowed` on the server. Everything this
 * component does with the flag is decide which controls to draw.
 *
 * ⚠️ **The draft is a `StoredSheet` and the thing it is compared against is not.**
 * `saved.sheet` is the *resolved* sheet — for a library character, the class's numbers
 * with the race applied and the DM's overrides on top — while `saved.preset` is what
 * the document actually holds. Only the latter can be sent back, because resolving
 * needs `lib/library/`, which must never reach the browser. So the draft is seeded from
 * `saved.preset ?? saved.sheet`, and every comparison below is between two stored
 * shapes.
 *
 * Saved explicitly rather than on every keystroke, unlike a token's position. The trade
 * is the opposite one: a drag is continuous and has to look instant, so `moveToken` is
 * throttled and optimistic; a sheet is a form somebody fills in, and writing a
 * half-typed armour class of `1` to every screen at the table on the way to `18` would
 * be worse than a button.
 *
 * Three things deliberately do *not* wait for that button — the selections behind
 * Confirm, the level, and anything on the vitals row. Each is an event rather than an
 * edit: a decision made once, a level awarded to the whole party, a rest taken. Putting
 * a Save between the decision and the six people waiting for it would be the wrong
 * shape for all three.
 */
export function CharacterSheetEditor({
  saved,
  vitals,
  isDm,
  onAdjustHp,
  onAdjustHitDice,
  onSave,
  onRename,
  onSetLevel,
  onSetLocked,
  onSetPerRest,
  onLongRest,
}: CharacterSheetEditorProps) {
  const [draft, setDraft] = useState<StoredSheet>(() => storedOf(saved))
  const [name, setName] = useState(saved.name)
  const [echoed, setEchoed] = useState(saved)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Normalised first and then checked, always and on both sides — the order
  // `normaliseSheet`'s own comment insists on. A class name of "  Fire  Mage " is a
  // value that needs tidying rather than a validation failure, and tidying it in the
  // shared module is what stops this form's idea of "already valid" drifting away from
  // the mutation's.
  //
  // Memoised because every one of these runs on every render, and a render here is a
  // keystroke. `normaliseStoredSheet` clones every entry on a hand-built sheet, so a
  // hero at the forty-feat, forty-spell ceiling was cloning eighty of them and
  // serialising the result several times over per character typed.
  const normalised = useMemo(() => normaliseStoredSheet(draft), [draft])

  // The library's numbers with the *draft's* overrides laid over them, which is the
  // closest a browser can get to what the server will resolve — see `previewOverrides`
  // for why it cannot get closer and why that is fine. Null for anything that is not a
  // library character, and for the impossible pairing of a preset draft against a
  // resolved sheet that is somehow a monster.
  const resolved: PcSheet | null = saved.sheet.kind === 'pc' ? saved.sheet : null
  const preview = useMemo(
    () =>
      draft.kind === 'preset' && resolved ? previewOverrides(resolved, draft.overrides) : null,
    [draft, resolved],
  )

  // **Two checks, mirroring `requireUsableSheet` on the server.** `storedSheetProblem`
  // covers what the document holds, which for a preset is only the four selections; the
  // numbers a preset resolves to are checked separately, because a preset has none
  // until it is resolved. Getting this wrong in the obvious way — checking the stored
  // form alone — would leave Save lit up for an armour class of 999 and the refusal
  // arriving from the network instead.
  const problem = useMemo(
    () => storedSheetProblem(normalised) ?? (preview ? sheetProblem(preview) : null),
    [normalised, preview],
  )

  // Whether the draft would store identically to what the server last sent.
  //
  // Both sides are normalised before being serialised, and that is about key order
  // rather than about values: `JSON.stringify` is only a fair comparison when one
  // constructor wrote both objects, and resting a "you have unsaved changes" indicator
  // on Convex having preserved the order a document was written in is not something to
  // do. The saved side is keyed on `echoed`, which moves only when the server pushes an
  // edit — so the expensive half of this happens a handful of times a session rather
  // than on every keystroke alongside the draft.
  const draftJson = useMemo(() => JSON.stringify(normalised), [normalised])
  const savedJson = useMemo(() => JSON.stringify(normaliseStoredSheet(storedOf(echoed))), [echoed])

  const sheetDirty = draftJson !== savedJson
  const nameDirty = collapseWhitespace(name) !== echoed.name
  const dirty = sheetDirty || nameDirty
  const nameProblem = collapseWhitespace(name) === '' ? 'Give the character a name.' : null

  // Somebody else edited this character while the panel was open — the DM fixing a
  // player's armour class or awarding a level, most likely. Follow the server, but only
  // when there is nothing local to lose: overwriting half-typed edits with a push nobody
  // asked for is the way this sort of form usually goes wrong. When there *is* local
  // work, the draft stands and Save will overwrite theirs, which is the same
  // last-write-wins the rest of the app has and is the right answer for a table of
  // colleagues.
  //
  // `dirty` is read here rather than recomputed, and it is the right value to read: it
  // was worked out against `echoed`, which at this point is still the *previous*
  // payload, so it answers "has anything been typed since that one arrived" — which is
  // exactly the question.
  //
  // Adjusting state during render is React's documented alternative to an effect for
  // deriving state from a prop, and it re-renders before anything reaches the screen
  // rather than showing the stale value for a frame.
  if (echoed !== saved) {
    setEchoed(saved)
    if (!dirty) {
      setDraft(storedOf(saved))
      setName(saved.name)
    }
  }

  /**
   * The one write path, shared by Save and by the builder's Confirm.
   *
   * The name goes first because it is the cheaper failure to recover from: if the
   * rename is refused there is nothing to undo, whereas a sheet written under a name
   * that was then rejected would leave the two halves disagreeing about whether the
   * save happened at all.
   */
  const commit = async (next: StoredSheet) => {
    if (saving) return
    setSaving(true)
    setFailure(null)

    const renameRefusal = nameDirty ? await onRename(name) : null
    const refusal = renameRefusal ?? (await onSave(next))

    if (refusal === null) {
      // Adopt what was sent rather than waiting for the echo. The server stores exactly
      // these values — it runs the same normaliser — so this makes the form clean
      // immediately, and the push that arrives a moment later is then recognised as
      // "nothing local to lose" by the sync above rather than being refused as a
      // conflict with our own write.
      setDraft(next)
      setName(collapseWhitespace(name))
    }
    setFailure(refusal)
    setSaving(false)
  }

  const save = () => {
    if (problem || nameProblem || !dirty) return
    void commit(normalised)
  }

  /**
   * Committing a character's race, class and archetype, and locking them behind it.
   *
   * Written here rather than in the builder because it has to merge with whatever else
   * the draft is carrying: a DM who has typed an armour class and *then* changed the
   * class should not lose one to the other. Overrides are spread rather than assigned,
   * because `undefined` is not a Convex value and a preset nobody has overridden must
   * hold no `overrides` field at all.
   *
   * The level comes from whatever the character already had — the preset's when there is
   * one, and a hand-built sheet's own level when this is the conversion from a typed
   * sheet to a library one, so a level-three hero does not silently restart at one.
   */
  const confirm = (selections: BuilderSelections) => {
    if (nameProblem) {
      setFailure(nameProblem)
      return
    }

    const overrides = draft.kind === 'preset' ? draft.overrides : undefined
    void commit(
      normaliseStoredSheet({
        kind: 'preset',
        race: selections.race,
        classKey: selections.classKey,
        subclassKey: selections.subclassKey,
        level: levelOf(draft),
        ...(overrides === undefined ? {} : { overrides }),
        locked: true,
      }),
    )
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
              {/* The *resolved* kind, because that is the one a reader means. A preset
                  resolves to a hero, and a badge reading "preset" would name the storage
                  form rather than the character. */}
              <Badge variant={saved.sheet.kind === 'npc' ? 'secondary' : 'outline'}>
                {saved.sheet.kind === 'npc' ? 'NPC' : 'Player character'}
              </Badge>
            </div>
          </SheetField>
          <FieldError message={nameProblem} />

          {/* Hit points are not part of the sheet and are not saved with it. They live
              in `characterVitals` and are written the instant a button is pressed,
              because damage during a fight is the one number that has to be on
              everyone's screen immediately — and because keeping them out of the sheet
              document is what lets the board draw a health bar without ever reading one.
              Requirements.md asks for the controls in both places. */}
          <div className="flex flex-col gap-1">
            {/* A caption rather than a `<label for>`: the bar is a group of controls
                with their own labels, not one field to point at. */}
            <span className="text-muted-foreground text-xs font-medium">Hit points</span>
            <HpControls vitals={vitals} onAdjust={onAdjustHp} />
          </div>

          {/* Beside the hit points rather than beside the `n × d10` on the form below,
              because that is the distinction the two numbers actually have: this block
              is how the character is doing right now and is written the instant a button
              is pressed, while everything under it is what the character is and waits
              for Save. The server draws the same line — hit dice are on the vitals row
              for it.

              An NPC gets nothing here, and the test is the resolved sheet's kind rather
              than a null in the payload. The reduced sheet has no hit dice to have spent,
              so there is no state to show, no permission being applied and nothing an
              NPC's DM is being kept from.

              The faces come from `saved` and not from the draft: `hitDiceCount` was read
              off the stored sheet, so pairing it with a die size somebody is halfway
              through changing would print a complement that has never existed — `3/5 d12`
              while the stored sheet still says d8. */}
          {resolved ? (
            <HitDiceControls
              vitals={vitals}
              faces={resolved.hitDice.faces}
              onAdjust={onAdjustHitDice}
            />
          ) : null}
        </div>

        {draft.kind === 'npc' ? (
          <NpcSheetForm sheet={draft} problem={problem} disabled={saving} onChange={setDraft} />
        ) : draft.kind === 'preset' && preview ? (
          <PresetSheetView
            draft={draft}
            saved={saved.preset}
            sheet={preview}
            problem={problem}
            isDm={isDm}
            disabled={saving}
            vitals={vitals}
            onChange={setDraft}
            onConfirm={confirm}
            onSetLevel={onSetLevel}
            onSetLocked={onSetLocked}
            onSetPerRest={onSetPerRest}
            onLongRest={onLongRest}
          />
        ) : draft.kind === 'pc' ? (
          <>
            {/* The offer comes first, because for anybody making their first character
                it is the whole answer and the form below is the escape hatch. A
                hand-built sheet is still supported — a hero brought from another table,
                or one made before the library existed — so it is offered rather than
                replaced. */}
            <CharacterBuilder
              preset={null}
              level={draft.level}
              isDm={isDm}
              busy={saving}
              onConfirm={confirm}
              // There is no preset for `characters.setLevel` to act on yet, so the level
              // is the form's own field below and this shows it rather than changing it.
              onSetLevel={null}
              onSetLocked={onSetLocked}
            />
            <Separator />
            <PcSheetForm
              sheet={draft}
              problem={problem}
              disabled={saving}
              onChange={setDraft}
            />
          </>
        ) : null}
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
          // Disabled with the *same wording* the server would have thrown, because both
          // sides call `storedSheetProblem`. The button being unavailable is a courtesy;
          // `updateSheet` re-runs the check and refuses regardless.
          disabled={saving || !dirty || problem !== null || nameProblem !== null}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save sheet'}
        </Button>
      </SheetFooter>
    </>
  )
}

/**
 * What the document holds, as opposed to what the panel displays.
 *
 * The one place the two are told apart, so that nothing below has to remember that
 * `sheet` on a library character is a value the server assembled and cannot be sent
 * back.
 */
function storedOf(sheet: PublicSheet): StoredSheet {
  return sheet.preset ?? sheet.sheet
}

function levelOf(sheet: StoredSheet): number {
  return sheet.kind === 'npc' ? 1 : sheet.level
}
