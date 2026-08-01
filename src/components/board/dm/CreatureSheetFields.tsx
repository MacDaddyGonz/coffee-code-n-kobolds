import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNumber } from '@/lib/utils'
// ⚠️ `NpcSheet` and `defaultNpcSheet` keep their names on purpose, and the mismatch with
// this file's is the point rather than an oversight. `kind: 'npc'` is the stored
// discriminator — it is the member name in `storedSheetValidator` and the literal in every
// DM creature document in every game — so the backend type is named for the value on the
// wire. What is renamed here is what a DM *reads*: an NPC and a monster are two different
// things at the table, and `group` is the field that tells them apart.
import type { CreatureGroup, NpcSheet } from '@convex/lib/sheet'
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
 * What a creature needs before it can stand on the board, as typed: two numbers and
 * which of the DM's two lists it belongs in.
 *
 * The numbers are strings rather than numbers, for the reason `parseNumber` exists: a
 * half-deleted field is `''`, `Number('')` is 0, and an armour class of zero passes
 * every range check on its way to being stored. Keeping the raw text here means the
 * empty field stays empty until somebody finishes typing in it.
 *
 * `group` is not a string, because it is a choice out of two rather than something
 * typed — there is no half-finished state for it to be in.
 */
export type CreatureStats = { armourClass: string; maxHp: string; group: CreatureGroup }

/**
 * Seeded from the server's own default sheet rather than from a pair of literals,
 * so the numbers the DM is handed to correct are the numbers `defaultNpcSheet`
 * says a new creature starts on. Two copies of "12 and 10" would drift the first
 * time either side was tuned.
 *
 * The group cannot come from there — `defaultNpcSheet()` deliberately omits it, because
 * on a *document* absent means "nobody was asked" — so it is stated here as `'npc'`,
 * matching what `groupOf` reads an absent field as. The default the DM is shown and the
 * default the server would have applied are therefore the same answer, which is the only
 * arrangement in which leaving the control alone is not a surprise.
 */
export function defaultCreatureStats(): CreatureStats {
  const sheet = defaultNpcSheet()
  return { armourClass: String(sheet.armourClass), maxHp: String(sheet.maxHp), group: 'npc' }
}

/**
 * A whole creature sheet from the three fields above.
 *
 * Everything else — the initiative bonus, the actions list, the notes — comes from
 * `defaultNpcSheet()` untouched, which is what keeps this from becoming a second,
 * partial idea of what a creature is. Milestone 3's sheet editor fills the rest in;
 * this only has to produce something the DM can drop on a map and hit.
 *
 * ⚠️ **This is a field-by-field rebuild, which is the shape this codebase has twice
 * shipped a dropped field in.** A new member of `NpcSheet` that a form here asks about
 * has to be named on this object or the answer is discarded in silence — nothing throws,
 * nothing is refused, and the DM finds out when the row is under the wrong heading.
 *
 * **`group` is written unconditionally, and that is not a contradiction of
 * `defaultNpcSheet`'s omitting it.** That rebuild omits the field because it has nobody
 * to ask, and an absent `group` is how a document spells "unanswered" — which `groupOf`
 * then reads as NPC. This rebuild *does* ask, so it always has an answer to write,
 * including when the answer is the default one: a DM who saw the control and left it on
 * NPC has answered. Spelling that as absence as well would be a second way to say one
 * thing, which is the convention ADR 0008 settled against. The conditional spread still
 * belongs in `normaliseSheet`, which carries a value that genuinely may be absent.
 */
export function creatureSheetFrom(stats: CreatureStats): NpcSheet {
  return {
    ...defaultNpcSheet(),
    armourClass: parseNumber(stats.armourClass),
    maxHp: parseNumber(stats.maxHp),
    group: stats.group,
  }
}

/**
 * What is wrong with these fields, in the server's own words, or null.
 *
 * It runs the *same* `normaliseSheet` and `sheetProblem` the mutation runs rather
 * than re-stating the bounds as a pair of `>=` comparisons here. That is the whole
 * reason lib/sheet.ts is free of `ctx` and reachable through `@convex/…`: a form
 * that decides validity for itself is a form that eventually offers a save the
 * server is about to refuse, and the wording of the refusal drifts too. Nothing
 * here authorises the write — `characters.create` validates again, because a bound
 * only the client applies is a bound a client bug removes.
 */
export function creatureStatsProblem(stats: CreatureStats): string | null {
  return sheetProblem(normaliseSheet(creatureSheetFrom(stats)))?.message ?? null
}

export type CreatureSheetFieldsProps = {
  stats: CreatureStats
  onChange: (stats: CreatureStats) => void
  disabled?: boolean
}

/**
 * Armour class, maximum hit points, and whether this is an NPC or a monster.
 *
 * Shared by the Sheets tab's new-creature dialog and by the token dialog's inline
 * create, because those two are the same act reached from two directions — the DM
 * who is populating an encounter, and the DM who is halfway through adding a coin
 * and realises it needs to be hittable. A copy in each would be two ideas of what
 * the minimum creature is, and the token dialog's copy is the one that would quietly
 * stop matching after the first tweak.
 *
 * ⚠️ **The group question lives here rather than in either dialog for exactly that
 * reason.** There are two callers, and a question asked in only one of them files every
 * creature made from the other under NPCs whatever it is — silently, because a wrong
 * group is a misfiled row rather than an error. Asking it once, in the component both
 * callers already render, is what makes "both dialogs ask" true by construction.
 *
 * `useId` rather than fixed ids: both call sites can be mounted at once — the panel
 * is over the board while a dialog is open on top of it — and two labels pointing at
 * the same input is a label that focuses the wrong field.
 */
export function CreatureSheetFields({ stats, onChange, disabled }: CreatureSheetFieldsProps) {
  const fieldId = useId()

  return (
    <div className="flex flex-col gap-3">
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

      {/* Two buttons rather than a select, matching the layer control the token dialog
          draws a few fields above this one: a choice between two things reads better as
          two things than as a list with one of them hidden.

          Nothing about secrecy turns on the answer — both values are DM-only, and a
          player is sent neither — so a wrong one is a row under the wrong heading and
          never a published stat block. That is what makes a default safe here at all;
          compare the layer control, where the two answers differ by whether an ambush
          survives, and which is why that one has an alert under it and this has a
          sentence. */}
      <div className="flex flex-col gap-2">
        <Label>Is this an NPC or a monster?</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={stats.group === 'npc' ? 'default' : 'outline'}
            aria-pressed={stats.group === 'npc'}
            disabled={disabled}
            onClick={() => onChange({ ...stats, group: 'npc' })}
          >
            NPC
          </Button>
          <Button
            type="button"
            variant={stats.group === 'monster' ? 'default' : 'outline'}
            aria-pressed={stats.group === 'monster'}
            disabled={disabled}
            onClick={() => onChange({ ...stats, group: 'monster' })}
          >
            Monster
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Which of your two lists it sits under — an innkeeper is an NPC, an owlbear is a
          monster. Neither reaches a player either way, and it can be moved later from its
          own sheet.
        </p>
      </div>
    </div>
  )
}
