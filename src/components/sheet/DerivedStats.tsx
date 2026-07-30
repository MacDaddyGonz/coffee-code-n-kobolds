import { DerivedStat, signed } from '@/components/sheet/SheetFields'
import { passivePerception } from '@convex/lib/skills'
import type { PcSheet } from '@convex/lib/sheet'
import {
  SPEED_FEET,
  initiativeBonusOf,
  proficiencyBonus,
  skillProficienciesOf,
  speedOf,
} from '@convex/lib/sheet'

/**
 * The four numbers a hero's sheet works out rather than stores.
 *
 * Shared by the hand-built form and by the panel for a character built from the
 * library, because a derived number does not care where the sheet it was derived from
 * came from — and because two copies of this row is exactly how one of them would end
 * up quietly missing Passive Perception.
 *
 * **Speed is read through `speedOf` and is no longer a constant on the page.** It was
 * one, with a comment saying a character whose speed differs is one the rules say
 * cannot exist. That was true of the whole rule set until the Goliath arrived at 45
 * feet (ADR 0006), so the number now comes from the sheet and `SPEED_FEET` is merely
 * what everybody else gets. The hint says which of the two a reader is looking at,
 * because 45 with no explanation beside it reads as a bug on a page where every other
 * character says 35.
 *
 * The hint says *faster or slower than the usual number* rather than naming a cause,
 * and that is the whole of what this component can honestly claim. It said "your race
 * is faster", which was true while a race was the only thing that could move the
 * number — but speed is an override too now, an override can be *slower*, and a DM who
 * sets 25 would otherwise have "your race is faster" printed under a 25. Which of the
 * two moved it is not on the wire: the resolved sheet carries one number, with the
 * race and the DM already folded in, and telling them apart would mean shipping the
 * library. So the hint compares against `SPEED_FEET`, which is the one thing it can
 * see, and the DM's own mark in `PresetNumbers` is where "you changed this" is said.
 */
export function DerivedStats({ sheet }: { sheet: PcSheet }) {
  const speed = speedOf(sheet)

  return (
    <div className="bg-muted/40 grid grid-cols-4 gap-3 rounded-lg border p-3">
      <DerivedStat label="Proficiency" value={signed(proficiencyBonus(sheet.level))} />
      <DerivedStat label="Initiative" value={signed(initiativeBonusOf(sheet))} hint="Dexterity" />
      <DerivedStat
        label="Speed"
        value={`${speed} ft`}
        hint={
          speed === SPEED_FEET
            ? 'the usual'
            : `${speed > SPEED_FEET ? 'faster' : 'slower'} than the usual ${SPEED_FEET}`
        }
      />
      <DerivedStat
        label="Passive Perception"
        value={String(
          passivePerception(sheet.abilities, sheet.level, skillProficienciesOf(sheet)),
        )}
        hint="without looking"
      />
    </div>
  )
}
