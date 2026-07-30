import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNumber } from '@/lib/utils'
import type { NpcSheet } from '@convex/lib/sheet'
import {
  MAX_ARMOUR_CLASS,
  MAX_MAX_HP,
  MIN_ARMOUR_CLASS,
  MIN_MAX_HP,
  defaultNpcSheet,
  normaliseSheet,
  sheetProblem,
} from '@convex/lib/sheet'

/**
 * The two numbers a monster needs before it can stand on the board, as typed.
 *
 * Strings rather than numbers, for the reason `parseNumber` exists: a half-deleted
 * field is `''`, `Number('')` is 0, and an armour class of zero passes every range
 * check on its way to being stored. Keeping the raw text here means the empty field
 * stays empty until somebody finishes typing in it.
 */
export type NpcStats = { armourClass: string; maxHp: string }

/**
 * Seeded from the server's own default sheet rather than from a pair of literals,
 * so the numbers the DM is handed to correct are the numbers `defaultNpcSheet`
 * says a new monster starts on. Two copies of "12 and 10" would drift the first
 * time either side was tuned.
 */
export function defaultNpcStats(): NpcStats {
  const sheet = defaultNpcSheet()
  return { armourClass: String(sheet.armourClass), maxHp: String(sheet.maxHp) }
}

/**
 * A whole NPC sheet from the two fields above.
 *
 * Everything else — the initiative bonus, the actions list, the notes — comes from
 * `defaultNpcSheet()` untouched, which is what keeps this from becoming a second,
 * partial idea of what a monster is. Milestone 3's sheet editor fills the rest in;
 * this only has to produce something the DM can drop on a map and hit.
 */
export function npcSheetFrom(stats: NpcStats): NpcSheet {
  return {
    ...defaultNpcSheet(),
    armourClass: parseNumber(stats.armourClass),
    maxHp: parseNumber(stats.maxHp),
  }
}

/**
 * What is wrong with these two fields, in the server's own words, or null.
 *
 * It runs the *same* `normaliseSheet` and `sheetProblem` the mutation runs rather
 * than re-stating the bounds as a pair of `>=` comparisons here. That is the whole
 * reason lib/sheet.ts is free of `ctx` and reachable through `@convex/…`: a form
 * that decides validity for itself is a form that eventually offers a save the
 * server is about to refuse, and the wording of the refusal drifts too. Nothing
 * here authorises the write — `characters.create` validates again, because a bound
 * only the client applies is a bound a client bug removes.
 */
export function npcStatsProblem(stats: NpcStats): string | null {
  return sheetProblem(normaliseSheet(npcSheetFrom(stats)))?.message ?? null
}

export type NpcSheetFieldsProps = {
  stats: NpcStats
  onChange: (stats: NpcStats) => void
  disabled?: boolean
}

/**
 * Armour class and maximum hit points, side by side.
 *
 * Shared by the Sheets tab's New NPC dialog and by the token dialog's inline
 * create, because those two are the same act reached from two directions — the DM
 * who is populating an encounter, and the DM who is halfway through adding a coin
 * and realises it needs to be hittable. A copy in each would be two ideas of what
 * the minimum monster is, and the token dialog's copy is the one that would quietly
 * stop matching after the first tweak.
 *
 * `useId` rather than fixed ids: both call sites can be mounted at once — the panel
 * is over the board while a dialog is open on top of it — and two labels pointing at
 * the same input is a label that focuses the wrong field.
 */
export function NpcSheetFields({ stats, onChange, disabled }: NpcSheetFieldsProps) {
  const fieldId = useId()

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-ac`}>Armour class</Label>
        <Input
          id={`${fieldId}-ac`}
          type="number"
          min={MIN_ARMOUR_CLASS}
          max={MAX_ARMOUR_CLASS}
          step={1}
          value={stats.armourClass}
          onChange={(event) => onChange({ ...stats, armourClass: event.target.value })}
          className="tabular-nums"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-hp`}>Hit points</Label>
        <Input
          id={`${fieldId}-hp`}
          type="number"
          min={MIN_MAX_HP}
          max={MAX_MAX_HP}
          step={1}
          value={stats.maxHp}
          onChange={(event) => onChange({ ...stats, maxHp: event.target.value })}
          className="tabular-nums"
          disabled={disabled}
        />
        {/* Its maximum, and where it starts: `insertCharacter` writes the vitals row
            on full health in the same transaction, so there is no second number to
            ask for here. */}
        <p className="text-muted-foreground text-xs">It starts on full.</p>
      </div>
    </div>
  )
}
