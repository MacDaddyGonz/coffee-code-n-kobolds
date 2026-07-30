import { RotateCcw } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { DerivedStat, NumberInput, SheetField } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { HitDice, PcSheet, PresetOverrides, SheetProblem } from '@convex/lib/sheet'
import { HIT_DIE_FACES, messageAtField, speedOf } from '@convex/lib/sheet'

export type PresetNumbersProps = {
  /**
   * The sheet as it currently stands: the library's numbers with the race applied and
   * the *draft* overrides on top, so a field the DM is halfway through typing is
   * already reflected everywhere else on the panel.
   */
  sheet: PcSheet
  overrides: PresetOverrides | undefined
  problem: SheetProblem | null
  disabled?: boolean
  /** Absent means the numbers are printed rather than typed in. Players get no handle. */
  onChange?: (overrides: PresetOverrides | undefined) => void
}

/**
 * The stored numbers on a character built from the library, and the DM's thumb on the
 * scale.
 *
 * **A player sees only the armour class here**, and that is not a permission being
 * applied — it is that everything else in this block already appears somewhere better
 * on the same panel. Maximum hit points are the right-hand half of `20/45` at the top,
 * and the hit dice complement is the `/5` beside it. Printing either a second time in
 * a box captioned differently is how `HitDiceControls` describes going wrong, and its
 * comment is worth taking twice.
 *
 * The DM gets the four an override exists for, because "the DM can always change a
 * player's sheet" has to stay literally true against a character whose stats are read
 * live out of the library. An override survives a level-up by design — bumping a
 * boss-fight armour class should not be undone by the DM awarding a level five minutes
 * later — which is exactly why each one is marked and why there is a way back to the
 * library value. A field with no mark on it is one nobody has touched.
 *
 * ⚠️ **What is deliberately not shown is which number the library would have given.**
 * The server sends the resolved sheet, and resolution has already folded the override
 * in; the original is not on the wire and could only be recovered by shipping the 72
 * stat blocks to the browser, which is the one thing `lib/library/` is kept out of `src/`
 * to prevent. So a mark says "you changed this" rather than "this was 15", and the
 * reset button is how a DM finds out what it was.
 */
export function PresetNumbers({
  sheet,
  overrides,
  problem,
  disabled,
  onChange,
}: PresetNumbersProps) {
  if (!onChange) {
    return (
      <div className="bg-muted/40 rounded-lg border p-3">
        <DerivedStat label="Armour class" value={String(sheet.armourClass)} />
      </div>
    )
  }

  const set = (patch: Partial<PresetOverrides>) => onChange(merge(overrides, patch))
  const marks = (path: string) => problem?.path === path

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Your changes to this character</h3>
        <p className="text-muted-foreground text-xs">
          Anything you set here wins over the library and stays put when the character
          levels up. Everything else moves with them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SheetField
          id="preset-ac"
          label="Armour class"
          hint={
            <OverrideMark
              overridden={overrides?.armourClass !== undefined}
              disabled={disabled}
              onReset={() => set({ armourClass: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-ac"
            value={sheet.armourClass}
            invalid={marks('armourClass')}
            disabled={disabled}
            onChange={(armourClass) => set({ armourClass })}
          />
        </SheetField>

        <SheetField
          id="preset-max-hp"
          label="Maximum hit points"
          hint={
            <OverrideMark
              overridden={overrides?.maxHp !== undefined}
              disabled={disabled}
              onReset={() => set({ maxHp: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-max-hp"
            value={sheet.maxHp}
            invalid={marks('maxHp')}
            disabled={disabled}
            onChange={(maxHp) => set({ maxHp })}
          />
        </SheetField>

        <SheetField
          id="preset-speed"
          label="Speed (feet)"
          hint={
            <OverrideMark
              overridden={overrides?.speed !== undefined}
              disabled={disabled}
              onReset={() => set({ speed: undefined })}
            />
          }
        >
          <NumberInput
            id="preset-speed"
            value={speedOf(sheet)}
            disabled={disabled}
            // Emptying the box drops the override rather than storing the `NaN` an
            // empty numeric field produces. Speed is the one number here with no bound
            // in `sheetProblem` to catch that on the way past, and clearing a field to
            // mean "go back to what it was" is the same thing the reset button does —
            // so it does the same thing rather than quietly writing a value that would
            // read back as 35 anyway.
            onChange={(speed) => set({ speed: Number.isFinite(speed) ? speed : undefined })}
          />
        </SheetField>

        <SheetField
          id="preset-hit-dice"
          label="Hit dice"
          hint={
            <OverrideMark
              overridden={overrides?.hitDice !== undefined}
              disabled={disabled}
              onReset={() => set({ hitDice: undefined })}
            />
          }
        >
          <div className="flex items-center gap-2">
            <NumberInput
              id="preset-hit-dice"
              className="w-14"
              value={sheet.hitDice.count}
              invalid={marks('hitDice.count')}
              disabled={disabled}
              onChange={(count) => set({ hitDice: { ...sheet.hitDice, count } })}
            />
            <span className="text-muted-foreground">×</span>
            <NativeSelect
              aria-label="Hit die size"
              value={String(sheet.hitDice.faces)}
              disabled={disabled}
              onChange={(event) =>
                set({
                  hitDice: {
                    ...sheet.hitDice,
                    // Narrowing a string back to the four literals the options were
                    // built from, rather than asserting anything the list does not
                    // already guarantee. `sheetProblem` checks the value regardless.
                    faces: Number(event.target.value) as HitDice['faces'],
                  },
                })
              }
            >
              {HIT_DIE_FACES.map((faces) => (
                <option key={faces} value={faces}>
                  d{faces}
                </option>
              ))}
            </NativeSelect>
          </div>
        </SheetField>
      </div>

      <FieldError message={messageAtField(problem, 'armourClass', 'maxHp', 'hitDice')} />
    </section>
  )
}

/**
 * Whether a field is the library's or the DM's, and the way back.
 *
 * Exported because the ability scores are overridden through `AbilityTable` — they are
 * shown to everybody and merely become editable for the DM, rather than living in the
 * block above — and one mark drawn two ways is one mark that could come to mean two
 * things.
 */
export function OverrideMark({
  overridden,
  disabled,
  onReset,
}: {
  overridden: boolean
  disabled?: boolean
  onReset: () => void
}) {
  if (!overridden) {
    return <span className="text-muted-foreground text-xs">from the library</span>
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">yours</Badge>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcw />
        Use the library’s
      </Button>
    </span>
  )
}

/**
 * The library's numbers with a set of overrides laid over them, worked out in the
 * browser.
 *
 * A deliberate second implementation of the last third of `resolvePreset`, and the
 * duplication is the point rather than an oversight: the real resolution needs
 * `lib/library/`, which must never reach `src/` (72 stat blocks in a bundle already
 * near a megabyte), so the browser cannot re-resolve a sheet and has to be handed one.
 * What it *can* do is apply the DM's own overrides to the sheet it was last handed,
 * because overrides come last in the resolver — nothing downstream of them would change
 * the answer.
 *
 * That buys two things worth the twenty lines. Every derived number on the panel moves
 * as the DM types rather than after a round trip, and `sheetProblem` can be run over
 * the result so Save goes dead with the same sentence `characters.updateSheet` would
 * have thrown — which `storedSheetProblem` alone cannot manage, since a preset's stored
 * form holds no armour class to be out of range.
 *
 * It is an approximation in exactly one direction and only while a draft is unsaved:
 * a field whose override has just been *cleared* still shows the old value until the
 * server answers, because the library's own number never came over the wire. That
 * moves a field towards a value the library guarantees is in range, so it can only ever
 * be pessimistic about whether Save should be enabled.
 */
export function previewOverrides(
  sheet: PcSheet,
  overrides: PresetOverrides | undefined,
): PcSheet {
  if (!overrides) return sheet

  return {
    ...sheet,
    abilities: overrides.abilities ?? sheet.abilities,
    saveProficiencies: overrides.saveProficiencies ?? sheet.saveProficiencies,
    skillProficiencies: overrides.skillProficiencies ?? sheet.skillProficiencies,
    armourClass: overrides.armourClass ?? sheet.armourClass,
    maxHp: overrides.maxHp ?? sheet.maxHp,
    hitDice: overrides.hitDice ?? sheet.hitDice,
    speed: overrides.speed ?? sheet.speed,
    // The entry lists are left alone. `extraFeats` and `extraSpells` are appended by
    // the resolver rather than replacing anything, and nothing in this milestone's UI
    // edits them — so appending them here would show the DM's additions twice the
    // moment something does.
  }
}

/**
 * Merge a patch into an override set, dropping anything set back to absent.
 *
 * The stripping is not tidiness. `undefined` is not a Convex value, so an object
 * carrying `armourClass: undefined` is a *different write* from one that omits the key,
 * and the difference is the one `insertCharacter` in convex/lib/characters.ts spells
 * out — a class of bug convex-test does not catch, because it does not apply Convex's
 * own value validation. An empty result collapses to `undefined` for the same reason:
 * a character nobody has overridden should hold no `overrides` field at all, so that
 * `requirePresetChangeAllowed`'s comparison of before and after sees nothing changed.
 */
function merge(
  overrides: PresetOverrides | undefined,
  patch: Partial<PresetOverrides>,
): PresetOverrides | undefined {
  const merged: Record<string, unknown> = { ...overrides, ...patch }
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key]
  }
  return Object.keys(merged).length === 0 ? undefined : (merged as PresetOverrides)
}
