import { AbilityTable } from '@/components/sheet/AbilityTable'
import type { BuilderSelections } from '@/components/sheet/CharacterBuilder'
import { CharacterBuilder } from '@/components/sheet/CharacterBuilder'
import { DerivedStats } from '@/components/sheet/DerivedStats'
import { OverrideMark, PresetNumbers, merge } from '@/components/sheet/PresetNumbers'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { SkillList } from '@/components/sheet/SkillList'
import { Separator } from '@/components/ui/separator'
import { FEATS, SPELLS } from '@convex/lib/rules'
import type { PcSheet, PresetOverrides, PresetSheet, SheetProblem } from '@convex/lib/sheet'
import { withoutUndefined } from '@convex/lib/sheet'

export type PresetSheetViewProps = {
  /** The draft. Only the overrides on it are edited here; the selections are Confirm's. */
  draft: PresetSheet
  /** The selections as the server last sent them, or null while the first save lands. */
  saved: PresetSheet | null
  /**
   * The resolved sheet with the draft's overrides laid over it, by the same
   * `withOverrides` the server finishes resolution with — see `CharacterSheetEditor`.
   */
  sheet: PcSheet
  /**
   * The fixed kit and the note on what changed at this level, or null when the library
   * has neither for these selections. Assembled server-side and sent beside the sheet:
   * both are strings out of `lib/library/`, which the browser never sees.
   */
  extras: { equipment: string; levellingNotes: string } | null
  problem: SheetProblem | null
  /** Whether this browser holds the DM code. Decides what is offered, never what is permitted. */
  isDm: boolean
  disabled?: boolean
  onChange: (preset: PresetSheet) => void
  onConfirm: (selections: BuilderSelections) => void
  onSetLevel: (level: number) => void
  onSetLocked: (locked: boolean) => void
}

/**
 * A character built from the library: what they chose, what that came to, and the only
 * parts of it anybody may change.
 *
 * **Nothing on this page is a form a player fills in, and that is the whole point of
 * building from the library rather than typing a sheet.** The numbers are read live out
 * of `lib/library/` every time the document is resolved, so awarding a level is one
 * number moving on the server and every one of them improves at once. A box a player
 * could type an armour class into would be a box whose contents the next level-up
 * silently discards — the only edit that survives resolution is an *override*, which is
 * the DM's by design (`applyPresetPermissions`).
 *
 * So the same sheet is drawn once and three things are handed a control: the three
 * selections behind `Confirm`, the level and the lock for the DM, and the overrides for
 * the DM. Everything else is printed. There is no second read-only component and no
 * `disabled` copy of the editor, because a page that is mostly output is not an editor
 * with the pens taken away.
 *
 * Rests are **not** among them, and used to be. `RestControls` sat here, which quietly
 * made taking a long rest a property of how a character happens to be *stored* — a
 * hand-built hero, which this milestone deliberately still supports, could never take
 * one from the UI even though `characters.longRest` works on any character. It is drawn
 * by `CharacterSheetEditor` for every resolved player character now, which is what the
 * badge beside the name already does and for the same reason.
 *
 * The three-way split of *where* an edit goes is worth holding on to while reading
 * this: selections commit through `Confirm`, hit points and rests and the level write
 * the instant they are pressed, and only the DM's overrides wait for Save. Each of
 * those is what the thing being changed actually is — a decision, an event at the
 * table, and an edit.
 */
export function PresetSheetView({
  draft,
  saved,
  sheet,
  extras,
  problem,
  isDm,
  disabled,
  onChange,
  onConfirm,
  onSetLevel,
  onSetLocked,
}: PresetSheetViewProps) {
  const overrides = draft.overrides
  const setOverrides = (next: PresetOverrides | undefined) => {
    // `withoutUndefined` rather than `overrides: next`, for the reason `merge` in
    // PresetNumbers.tsx gives at length: `undefined` is not a Convex value, so a
    // document naming the field and giving it that is a different write from one
    // omitting it.
    onChange(withoutUndefined({ ...draft, overrides: next }))
  }

  return (
    <div className="flex flex-col gap-5">
      <CharacterBuilder
        preset={saved}
        level={draft.level}
        isDm={isDm}
        busy={disabled}
        onConfirm={onConfirm}
        // Non-null: this view only exists for a character that already stores a preset,
        // which is exactly the condition `characters.setLevel` refuses without.
        onSetLevel={onSetLevel}
        onSetLocked={onSetLocked}
      />

      {/* Two sentences rather than a section, because neither of these is a rule:
          nothing rolls a kit and nothing computes with a levelling note, so a heading, a
          border and a row of tick boxes would give both the weight of the numbers below
          and invite somebody to manage them. The kit is what requirements.md's "set
          equipment per character" amounts to and is deliberately not an inventory —
          requirements.md excludes those — and the levelling note is the sentence a
          player reads at the one moment this whole milestone exists for, when the DM
          has awarded a level and the sheet under it has silently changed.

          Each line is dropped when its string is empty rather than printed as a bare
          caption. `LibrarySheet` requires both fields but nothing asserts either is
          non-blank across all 72 stat blocks, and "You carry" followed by nothing reads
          as a character who lost their gear. */}
      {extras && (extras.equipment || extras.levellingNotes) ? (
        <div className="flex flex-col gap-1.5 text-xs">
          {extras.equipment ? (
            <p>
              <span className="text-muted-foreground">You carry </span>
              {extras.equipment}
            </p>
          ) : null}
          {extras.levellingNotes ? (
            <p>
              <span className="text-muted-foreground">What changed at this level: </span>
              {extras.levellingNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      <Separator />

      <DerivedStats sheet={sheet} />

      <PresetNumbers
        sheet={sheet}
        overrides={overrides}
        problem={problem}
        disabled={disabled}
        onChange={isDm ? setOverrides : undefined}
      />

      <div className="flex flex-col gap-1">
        {/* The ability scores are overridden in place rather than in the block above,
            because they are the one overridable group everybody needs to *read*. A
            second six-row grid for the DM to type into would have the panel showing
            Strength twice, a centimetre apart, with only one of them live. */}
        {isDm ? (
          <span className="flex justify-end">
            <OverrideMark
              overridden={overrides?.abilities !== undefined}
              disabled={disabled}
              onReset={() => setOverrides(merge(overrides, { abilities: undefined }))}
            />
          </span>
        ) : null}
        <AbilityTable
          sheet={sheet}
          problem={problem}
          disabled={disabled}
          // Scores yes, saving throws no. A save proficiency is what the class grants
          // and there is no story at the table about needing to move one; an ability
          // score is what a DM reaches for when a premade hero is a point off what a
          // player pictured. `presetOverridesValidator` carries a field for the saves
          // too, so this is a decision about what to offer rather than a limit.
          onScores={
            isDm
              ? (abilities) => setOverrides({ ...overrides, abilities })
              : undefined
          }
        />
      </div>

      <SkillList
        sheet={sheet}
        note="Your class and level decide these. They keep up as you go."
      />

      <Separator />

      <SheetEntryList
        title="Feats and traits"
        description="What your class and your race give you, and anything the DM has handed over."
        noun="feat"
        entries={sheet.feats}
        catalogue={FEATS}
        path="feats"
        problem={problem}
        readOnly
      />

      <SheetEntryList
        title="Spells"
        description="Everything your class knows at this level."
        noun="spell"
        entries={sheet.spells}
        catalogue={SPELLS}
        path="spells"
        problem={problem}
        readOnly
      />
    </div>
  )
}
