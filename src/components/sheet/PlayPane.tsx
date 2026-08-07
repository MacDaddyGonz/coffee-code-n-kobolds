import { HitDiceControls } from '@/components/sheet/HitDiceControls'
import { RestControls } from '@/components/sheet/RestControls'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import { Separator } from '@/components/ui/separator'
import type { PublicVitals } from '@convex/lib/characters'
import type { RestKind } from '@convex/lib/rest'
import { FEATS } from '@convex/lib/rules'
import type { PerRestAbility } from '@convex/lib/species'
import type { PcSheet, SheetEntry, SheetProblem } from '@convex/lib/sheet'

export type PlayPaneProps = {
  sheet: PcSheet
  problem: SheetProblem | null
  disabled?: boolean
  /** What the server was willing to tell this client. Null while it is still loading. */
  vitals: PublicVitals | null
  /** Everything this character's species lets them spend once between long rests. */
  perRest: PerRestAbility[]
  /**
   * Absent means the list is printed rather than edited — which is what a character built
   * from the library gets, because its feats are read live out of the corpus and
   * reassembled on every level-up, so a box to edit one in is a box the next level
   * silently empties.
   */
  onFeats?: (entries: SheetEntry[]) => void
  onAdjustHitDice: (delta: number) => void
  onSetUses: (key: string, spent: number) => void
  onRest: (kind: RestKind) => void
}

/**
 * EVERYTHING YOU TOUCH IN A ROUND, which is why it is the pane that opens first.
 *
 * The split across the three sub-tabs is by *when* a thing is read rather than by what it
 * is: the attacks, the features and their counters are pressed several times a fight, and
 * the six ability scores behind them are set once and then left alone. So the arithmetic
 * lives on Build and the buttons live here.
 *
 * **The attacks are the top of this list rather than a section of their own**, and that is
 * `SHEET_ENTRY_CATEGORIES`' order doing the work: the vocabulary is `weapon`, `action`,
 * `passive`, shortest fuse first, so a hero's greatsword is already above their Second Wind
 * and their Darkvision without this file naming any of the three. Filtering the weapons out
 * into a separate list would be the three-`filter` spelling CLAUDE.md invariant 9 exists to
 * refuse, and it would put a fourth category nowhere.
 *
 * **The hit dice and the two rests are here rather than in the pinned header**, which is a
 * change from where the dice used to sit. The header answers *how am I doing* and has to
 * stay short enough to leave a pane underneath it; spending a die is a decision somebody
 * makes deliberately, at the point they are already reading which features come back. The
 * *readout* stays in the header, so the question "is a short rest worth it" is answerable
 * without changing tab.
 *
 * ⚠️ **Nothing on this pane adjudicates anything.** A use counter at zero does not grey out
 * the button beside it, spending a hit die rolls nothing and heals nobody, a mastery is a
 * word, and a rest is a button somebody presses rather than a state the application enters.
 */
export function PlayPane({
  sheet,
  problem,
  disabled,
  vitals,
  perRest,
  onFeats,
  onAdjustHitDice,
  onSetUses,
  onRest,
}: PlayPaneProps) {
  const exact = vitals?.kind === 'exact' ? vitals : null

  return (
    <div className="flex flex-col gap-5">
      <SheetEntryList
        title="Attacks and features"
        description={
          onFeats
            ? 'What this character can do that is not a spell. Press a name to announce the roll.'
            : 'What your class and your species give you, and anything the DM has handed over.'
        }
        noun="feat"
        entries={sheet.feats}
        catalogue={FEATS}
        path="feats"
        problem={problem}
        disabled={disabled}
        readOnly={onFeats === undefined}
        onChange={onFeats}
        // The counters, which is the whole reason a resource shape exists. A `null` here
        // is a subscription that has not landed and draws the counter dead; passing
        // nothing at all is what a list nobody plays from does.
        spentUses={exact?.spentUses ?? null}
        onSetUses={onSetUses}
      />

      <Separator />

      <HitDiceControls
        vitals={vitals}
        // From the sheet rather than from the vitals row: `hitDiceCount` rides with hit
        // points because it changes when somebody rests, and `d10` is part of the build.
        faces={sheet.hitDice.faces}
        onAdjust={onAdjustHitDice}
      />

      <RestControls
        abilities={perRest}
        spentUses={exact?.spentUses ?? null}
        disabled={disabled}
        onSetUses={onSetUses}
        onRest={onRest}
      />
    </div>
  )
}
