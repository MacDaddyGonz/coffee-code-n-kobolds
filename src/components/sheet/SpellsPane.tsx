import { DerivedStat, StatGrid, signed } from '@/components/sheet/SheetFields'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { Separator } from '@/components/ui/separator'
import type { PublicVitals } from '@convex/lib/characters'
import { SPELLS } from '@convex/lib/rules'
import type { PcSheet, SheetEntry, SheetProblem } from '@convex/lib/sheet'
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
  onSpells,
  onSetUses,
}: SpellsPaneProps) {
  const exact = vitals?.kind === 'exact' ? vitals : null
  const ability = spellcastingAbilityOf(sheet)
  const saveDc = spellSaveDcOf(sheet)
  const attack = spellAttackBonusOf(sheet)

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
        ═════════════════════════════════════════════════════════════════════════════
        SPELL SLOTS GO HERE, AND NOTHING ELSE DOES.

        This is the seam, deliberately empty. Slot counting lands separately, in
        `convex/lib/slots.ts` and the vitals payload beside it, and a track invented here
        would be a second shape for the same fact — the failure this codebase records under
        "two `lineageKey` lines landed in one rebuild and the weaker one won".

        What goes in: one row per spell level the character has slots at, showing how many
        are left of how many, stepped the way `UseCounter` in SheetEntryList.tsx steps an
        entry's uses. It belongs *above* the list rather than beside each level's heading,
        because the question "have I a second-level slot" is asked before choosing which
        spell to cast rather than while reading one.

        ⚠️ What must NOT go in, whatever the slot shape turns out to be: **no cast is
        refused.** A spell with no slot left is still a spell you can press, exactly as a
        feature with no uses left is. Counting a slot compares nothing and changes no die of
        damage, which is the whole reason ADR 0011's decision 1 could be reversed at all
        (ADR 0016). Greying out a row at zero slots is the edit that turns this pane into a
        rules engine, and it needs an amendment and an ADR rather than a condition on a
        button.
        ═════════════════════════════════════════════════════════════════════════════
      */}

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
