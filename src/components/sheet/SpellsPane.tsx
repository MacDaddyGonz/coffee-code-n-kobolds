import { signed } from '@/lib/vitals'
import { DerivedStat, StatGrid } from '@/components/sheet/SheetFields'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { SlotTrack } from '@/components/sheet/SlotTrack'
import { Separator } from '@/components/ui/separator'
import type { PublicVitals } from '@convex/lib/characters'
import { SPELLS } from '@convex/lib/rules'
import { spellSlotsFor } from '@convex/lib/slots'
import type { PcSheet, PresetSheet, SheetEntry, SheetProblem } from '@convex/lib/sheet'
import {
  ABILITY_NAMES,
  abilityModifier,
  spellAttackBonusOf,
  spellSaveDcOf,
  spellcastingAbilityOf,
} from '@convex/lib/sheet'

export type SpellsPaneProps = {
  sheet: PcSheet
  problem: SheetProblem | null
  disabled?: boolean
  /** What the server was willing to tell this client. Null while it is still loading. */
  vitals: PublicVitals | null
  /**
   * The stored selection, for the slot derivation. Null for a hand-built sheet, which
   * stores a class NAME rather than a class key and therefore has no track to derive —
   * argued in `SlotTrack`.
   */
  preset: PresetSheet | null
  /** Spend or hand back a slot of one level. Absent means the pips are printed. */
  onSetSlots?: (level: number, spent: number) => void
  /** Absent means the list is printed rather than edited — see `PlayPane`. */
  onSpells?: (entries: SheetEntry[]) => void
  onSetUses: (key: string, spent: number) => void
}

/**
 * A CASTER'S OWN PAGE: the four numbers every 2024 caster prints, and the spells by level.
 *
 * ⚠️ **This pane is ABSENT for a non-caster rather than empty or disabled** — the decision
 * is `panesFor` in src/lib/sheetPanes.ts, where the three clauses that make somebody a
 * caster are argued out. It is the same rule the builder keeps for the archetype control
 * below level 3: a greyed tab reads as a thing the player failed to fill in, and a Fighter
 * has not failed to become a Wizard.
 *
 * ⚠️ **THE SAVE DC IS PRINTED BESIDE A RESULT NOTHING COMPARES IT TO, and this is the
 * single most tempting line in the application to break.** No roll anywhere is checked
 * against this number, nothing decides whether a save succeeded, and no effect is applied.
 * It is on the sheet so the person at the table can say *"DC 15"* out loud — which is
 * exactly what ADR 0011 means by announcing rather than adjudicating. ADR 0011's decision 2
 * declined a hero's spell save DC outright and ADR 0016 reversed it on the record; what was
 * reversed is *a field*, not the line. Comparing a d20 to what `spellSaveDcOf` returns is a
 * rules engine and needs an amendment and an ADR of its own.
 *
 * Nothing is stored for any of the four. `spellcastingAbilityOf` is the one field on the
 * sheet, copied off the class at resolution, and the modifier, the attack bonus and the DC
 * all fall out of it — so they cannot disagree with the ability score they come from, and
 * **none of them appears on any of the sixty library sheets.**
 */
export function SpellsPane({
  sheet,
  problem,
  disabled,
  vitals,
  preset,
  onSetSlots,
  onSpells,
  onSetUses,
}: SpellsPaneProps) {
  const exact = vitals?.kind === 'exact' ? vitals : null
  const ability = spellcastingAbilityOf(sheet)
  const saveDc = spellSaveDcOf(sheet)
  const attack = spellAttackBonusOf(sheet)
  // Derived in the browser from the stored selection, which is already on the payload.
  // `spellSlotsOf` in lib/resolve.ts is the server-side twin and cannot be reached from
  // here — bundleGuard keeps that module out of the bundle, and it pulls both corpora in.
  const slots = preset === null ? null : spellSlotsFor(preset.classKey, preset.level)

  return (
    <div className="flex flex-col gap-5">
      {ability === null ? (
        // Not a grid of dashes. A character with no spellcasting ability does not have a
        // save DC the reader is being kept from — there is nothing to derive one from, and
        // four boxes reading `—` would be four statistics implied and then withheld.
        // `DerivedStat`'s own note carries this argument at length.
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
          Nothing on this sheet says which ability this character casts with, so there is no
          spell save DC and no spell attack bonus to work out. The spells below still roll.
        </p>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex min-w-0 flex-col">
            <h3 className="font-heading text-sm font-medium">Spellcasting</h3>
            <p className="text-muted-foreground text-xs">
              Read out loud, never compared. Nothing here decides whether a spell landed.
            </p>
          </div>
          <StatGrid>
            <DerivedStat label="Ability" value={ABILITY_NAMES[ability]} />
            <DerivedStat
              label="Modifier"
              value={signed(abilityModifier(sheet.abilities[ability]))}
            />
            <DerivedStat
              label="Attack"
              value={attack === null ? '—' : signed(attack)}
              hint="added to the roll"
            />
            <DerivedStat
              label="Save DC"
              // ⚠️ **Nothing on either side of this number reads it.** The temptation a
              // reader will feel here is to compare a saving throw in the feed against it
              // and print a hit or a miss. That is the one thing this application does not
              // do — see the header of this file and ADR 0011.
              value={saveDc === null ? '—' : String(saveDc)}
              hint="the DM reads it out"
            />
          </StatGrid>
        </section>
      )}

      {/*
        The seam this pane shipped with, now filled. `SlotTrack` carries the two warnings
        that stood here — no cast is refused at zero, and `feed.roll` spends nothing — at
        the place a reader would break them rather than in a comment above the component
        that would.
      */}
      <SlotTrack slots={slots} spent={exact?.spentSlots ?? null} onSetSlots={onSetSlots} disabled={disabled} />

      <Separator />

      <SheetEntryList
        title="Spells"
        description={
          onSpells
            ? 'Cantrips through 3rd level. Your copy is yours to change.'
            : 'Everything your class knows at this level.'
        }
        noun="spell"
        entries={sheet.spells}
        catalogue={SPELLS}
        path="spells"
        problem={problem}
        disabled={disabled}
        readOnly={onSpells === undefined}
        onChange={onSpells}
        // ⚠️ **By level, which is the one place in the application a list of entries is not
        // grouped by the shape of its roll.** A caster reads their spells by level because
        // that is the shape of the resource they are spent from; a hero reads their feats
        // by what happens when they press one. Both orders are total — see `groupBy`.
        groupBy="level"
        spentUses={exact?.spentUses ?? null}
        onSetUses={onSetUses}
      />
    </div>
  )
}
