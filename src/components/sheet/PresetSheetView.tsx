import { AbilityTable } from '@/components/sheet/AbilityTable'
import type { BuilderSelections } from '@/components/sheet/CharacterBuilder'
import { CharacterBuilder } from '@/components/sheet/CharacterBuilder'
import { DerivedStats } from '@/components/sheet/DerivedStats'
import { OverrideMark, PresetNumbers } from '@/components/sheet/PresetNumbers'
import { RestControls } from '@/components/sheet/RestControls'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { SkillList } from '@/components/sheet/SkillList'
import { Separator } from '@/components/ui/separator'
import { FEATS, SPELLS } from '@convex/lib/rules'
import type { PublicVitals } from '@convex/lib/characters'
import { perRestAbilities } from '@convex/lib/races'
import type { PcSheet, PresetOverrides, PresetSheet, SheetProblem } from '@convex/lib/sheet'

export type PresetSheetViewProps = {
  /** The draft. Only the overrides on it are edited here; the selections are Confirm's. */
  draft: PresetSheet
  /** The selections as the server last sent them, or null while the first save lands. */
  saved: PresetSheet | null
  /** The resolved sheet with the draft's overrides laid over it — see `previewOverrides`. */
  sheet: PcSheet
  problem: SheetProblem | null
  /** Whether this browser holds the DM code. Decides what is offered, never what is permitted. */
  isDm: boolean
  disabled?: boolean
  /** What this client was told about the character's hit points. Null while loading. */
  vitals: PublicVitals | null
  onChange: (preset: PresetSheet) => void
  onConfirm: (selections: BuilderSelections) => void
  onSetLevel: (level: number) => void
  onSetLocked: (locked: boolean) => void
  onSetPerRest: (key: string, spent: boolean) => void
  onLongRest: () => void
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
 * the DM's by design (`requirePresetChangeAllowed`).
 *
 * So the same sheet is drawn once and four things are handed a control: the three
 * selections behind `Confirm`, the level and the lock for the DM, the once-per-rest
 * abilities for whoever is playing, and the overrides for the DM. Everything else is
 * printed. There is no second read-only component and no `disabled` copy of the editor,
 * because a page that is mostly output is not an editor with the pens taken away.
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
  problem,
  isDm,
  disabled,
  vitals,
  onChange,
  onConfirm,
  onSetLevel,
  onSetLocked,
  onSetPerRest,
  onLongRest,
}: PresetSheetViewProps) {
  const overrides = draft.overrides
  const setOverrides = (next: PresetOverrides | undefined) => {
    // Spread rather than `overrides: next`, for the reason `merge` in PresetNumbers.tsx
    // gives at length: `undefined` is not a Convex value, so a document naming the field
    // and giving it that is a different write from one omitting it.
    const { overrides: _dropped, ...rest } = draft
    onChange(next === undefined ? rest : { ...rest, overrides: next })
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

      <RestControls
        abilities={perRestAbilities(draft.race)}
        // Which abilities a character *has* comes from their race, which this client
        // looks up itself; only which ones are gone has to travel. A band payload
        // carries none, which is a state a hero's own sheet never reaches — a player
        // character is exact for everybody.
        spent={vitals?.kind === 'exact' ? vitals.spentPerRest : null}
        disabled={disabled}
        onSetPerRest={onSetPerRest}
        onLongRest={onLongRest}
      />

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
              onReset={() => setOverrides(without(overrides, 'abilities'))}
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

/** An override set with one field dropped, collapsing to absent when it was the last. */
function without(
  overrides: PresetOverrides | undefined,
  field: keyof PresetOverrides,
): PresetOverrides | undefined {
  if (!overrides) return undefined
  const { [field]: _dropped, ...rest } = overrides
  return Object.keys(rest).length === 0 ? undefined : rest
}
