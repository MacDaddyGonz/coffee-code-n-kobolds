import type { ReactNode } from 'react'

import { AbilityBlock } from '@/components/sheet/AbilityBlock'
import { DerivedStat, StatGrid } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { WEAPON_MASTERIES, WEAPON_MASTERY_LABELS } from '@convex/lib/mastery'
import { passiveInsight, passiveInvestigation, passivePerception } from '@convex/lib/skills'
import type { SkillProficiencies } from '@convex/lib/skills'
import type { DamageTraits, PcSheet, SheetProblem } from '@convex/lib/sheet'
import type { AbilityScores, SaveProficiencies } from '@convex/lib/sheet'
import {
  damageTraitsOf,
  masteryOf,
  sensesOf,
  sheetEntriesOf,
  skillProficienciesOf,
} from '@convex/lib/sheet'

export type BuildPaneProps = {
  sheet: PcSheet
  problem: SheetProblem | null
  disabled?: boolean
  /**
   * The selections control: the library builder, or a hand-built sheet's level and class
   * fields.
   *
   * A slot rather than a discriminant, because the two are genuinely different controls
   * rather than two settings of one — a builder commits four dropdowns through its own
   * mutation and a form types two fields into the draft. A `kind` prop here would be a
   * union this component switched on to render one of two things it does not otherwise
   * know anything about, which is indirection bought with an exhaustiveness check nobody
   * needs: the caller already has a `switch` over the stored kind with a `never` arm.
   */
  selections: ReactNode
  /** The stored numbers: the DM's override panel, or the hand-built armour class and hit points. */
  numbers: ReactNode
  /**
   * The premade sheet's fixed kit and its note on what changed at this level, or null when
   * the library has neither. Both are strings assembled server-side — the corpus never
   * reaches the browser.
   */
  extras: { equipment: string; levellingNotes: string } | null
  /**
   * A note drawn immediately above the six abilities — in practice the DM's *yours / use
   * the library's* mark for an overridden ability block.
   *
   * ⚠️ **The scores are overridden in place rather than in the numbers block above,
   * because they are the one overridable group everybody needs to *read*.** A second
   * six-row grid for the DM to type into would have the panel showing Strength twice, a
   * centimetre apart, with only one of them live. The mark has to sit with them, and
   * `AbilityBlock` has no business knowing what an override is — so it arrives as a node.
   */
  abilityHint?: ReactNode
  /** Absent means the six scores are printed rather than typed in. */
  onScores?: (abilities: AbilityScores) => void
  /** Absent means the save ticks are printed rather than ticked. */
  onSaves?: (saves: SaveProficiencies) => void
  /** Absent means the skill ticks are printed rather than ticked. */
  onSkills?: (skills: SkillProficiencies) => void
}

/**
 * WHAT THIS CHARACTER IS, as opposed to what they are doing this round.
 *
 * Everything here is set once and then read: the selections behind the sheet, the numbers
 * the DM may push around, the six abilities with their saves and their skills, and the
 * labels a 2024 sheet prints and nothing computes with.
 *
 * ⚠️ **The species' traits are deliberately not repeated here.** They are resolved onto the
 * sheet as `passive` entries, so they are already rows on the Play pane with the rest of
 * what the character can do — and the builder above prints all of them again the moment a
 * species is selected, which is where somebody choosing one needs to read them. A third
 * copy under a heading of its own would be the same text in three places and two of them
 * going stale.
 *
 * **Two things a reference sheet has and this one does not, and both are absences on the
 * server rather than omissions here.** There is no field anywhere for **armour, weapon or
 * tool proficiencies** — the premade sheets encode what a class can use in the equipment
 * line and in the entries themselves — so there is nothing to print and a section of empty
 * chips would suggest one is coming. And **backgrounds, inventory, money, weight,
 * encumbrance, experience and every biography field are excluded by design**, which is why
 * the reference sheet's `EXP`, `Coins`, `CarryCap`, `Attuned` and `Background` boxes have no
 * counterpart here rather than a greyed-out one: absent, not disabled. Lifting one is a spec
 * amendment with an ADR behind it.
 */
export function BuildPane({
  sheet,
  problem,
  disabled,
  selections,
  numbers,
  extras,
  abilityHint,
  onScores,
  onSaves,
  onSkills,
}: BuildPaneProps) {
  const proficiencies = skillProficienciesOf(sheet)
  const senses = sensesOf(sheet)
  const traits = damageTraitsOf(sheet)
  const masteries = masteriesOn(sheet)

  return (
    <div className="flex flex-col gap-5">
      {selections}

      {/* Two sentences rather than a section, because neither is a rule: nothing rolls a
          kit and nothing computes with a levelling note, so a heading and a row of tick
          boxes would give both the weight of the numbers below and invite somebody to
          manage them. The kit is what requirements.md's "set equipment per character"
          amounts to and is deliberately **not an inventory** — the SRD's own
          starting-equipment package reduced to a line of text, which is what that field
          has held through two entirely different rule sets. The levelling note is the
          sentence a player reads at the one moment the library exists for, when the DM has
          awarded a level and the sheet under it has silently changed.

          Each line is dropped when its string is empty rather than printed as a bare
          caption: nothing asserts either field is non-blank across all sixty sheets, and
          "You carry" followed by nothing reads as a character who lost their gear. */}
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

      {numbers}

      <Separator />

      {abilityHint ? <div className="flex justify-end">{abilityHint}</div> : null}

      <AbilityBlock
        sheet={sheet}
        problem={problem}
        disabled={disabled}
        onScores={onScores}
        onSaves={onSaves}
        onSkills={onSkills}
      />

      {/* The three passive scores, derived and stored nowhere — ten plus a skill bonus the
          sheet already carries. ⚠️ **Nothing notices anybody with them.** No stealth roll
          is compared to a passive perception and no lie is checked against a passive
          insight; they are printed so the person running the game can read one out, which
          is the whole of what "announce rather than adjudicate" means here. */}
      <section className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">Passive scores</h3>
          <p className="text-muted-foreground text-xs">
            What this character notices without looking. Nothing here is compared to
            anything — the DM reads them out.
          </p>
        </div>
        <StatGrid>
          <DerivedStat
            label="Perception"
            value={String(passivePerception(sheet.abilities, sheet.level, proficiencies))}
          />
          <DerivedStat
            label="Insight"
            value={String(passiveInsight(sheet.abilities, sheet.level, proficiencies))}
          />
          <DerivedStat
            label="Investigation"
            value={String(passiveInvestigation(sheet.abilities, sheet.level, proficiencies))}
          />
        </StatGrid>
      </section>

      {senses ? (
        <section className="flex flex-col gap-1">
          <h3 className="font-heading text-sm font-medium">Senses</h3>
          {/* One line of prose, and the 60 in `Darkvision 60 ft.` is never parsed. Nothing
              in this application knows how far anybody can see. */}
          <p className="text-xs">{senses}</p>
        </section>
      ) : null}

      <DamageTraitList traits={traits} />

      {masteries.length === 0 ? null : (
        <section className="flex flex-col gap-1.5">
          <div className="flex min-w-0 flex-col">
            <h3 className="font-heading text-sm font-medium">Weapon mastery</h3>
            {/* ⚠️ **The sentence that keeps this a label.** Push shoves nobody, Slow
                reduces no speed, Topple sets nobody Prone, and no roll in this application
                consults a mastery — `masteryGuard.test.ts` allows exactly one module in
                `convex/` to name the vocabulary, and the module it exists to keep out is
                the dice evaluator. requirements.md excludes movement-detriment effects by
                name, and three of the eight masteries brush that exclusion, which is
                precisely why the word is printed and the effect is not. */}
            <p className="text-muted-foreground text-xs">
              The properties this character’s weapons carry. They are words on the sheet —
              nothing here shoves, slows or topples anybody, and the table applies them.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {masteries.map((mastery) => (
              <Badge key={mastery} variant="outline">
                {WEAPON_MASTERY_LABELS[mastery]}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Which masteries this character's weapons actually carry, in `WEAPON_MASTERIES`' order.
 *
 * ⚠️ **Filtered from the vocabulary rather than collected from the entries in the order
 * they happen to appear.** The order is then the one every other screen would use, and a
 * ninth mastery lands in the right place by having been added to the list — where a
 * hand-written row of eight chips is the arrangement in which the ninth is stored on a
 * weapon, printed on its row, and missing from the summary that claims to be complete.
 *
 * `sheetEntriesOf` rather than `sheet.feats`, because a spell can be a weapon too — Fire
 * Bolt is a `weapon` by category, since you have to land it before it burns anything — and
 * a summary that read one list would quietly be about half the character.
 */
function masteriesOn(sheet: PcSheet): readonly (typeof WEAPON_MASTERIES)[number][] {
  const carried = new Set(
    sheetEntriesOf(sheet)
      .map(masteryOf)
      .filter((mastery): mastery is (typeof WEAPON_MASTERIES)[number] => mastery !== null),
  )
  return WEAPON_MASTERIES.filter((mastery) => carried.has(mastery))
}

/**
 * WHAT THIS CHARACTER SHRUGS OFF — and **nothing computes damage, so nothing applies any
 * of it.**
 *
 * No total is ever compared to an armour class, no damage is subtracted from anybody, and
 * therefore there is no arithmetic for *"halve it"* to attach itself to. These are three
 * lists of words a sheet prints, in the same register as a creature's loot and a spell's
 * casting time. The server stores them as bare strings rather than a vocabulary union for
 * exactly that reason: half the SRD's own entries read *"bludgeoning from nonmagical
 * attacks"*, which no thirteen-member union could hold.
 *
 * ⚠️ **The three are iterated through a `Record` keyed by `DamageTraits`' own field names
 * rather than written out as three blocks.** A fourth kind of damage trait — the SRD has
 * no fourth today — would fail to compile at that record, where three hand-written blocks
 * is the arrangement in which it is stored, sent, and invisible. That is CLAUDE.md
 * invariant 9's rule reaching a shape that is an object type rather than a union.
 */
function DamageTraitList({ traits }: { traits: DamageTraits }) {
  const kinds = (Object.keys(DAMAGE_TRAIT_LABELS) as (keyof DamageTraits)[]).filter(
    (kind) => traits[kind].length > 0,
  )
  if (kinds.length === 0) return null

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Damage</h3>
        <p className="text-muted-foreground text-xs">
          Words on the sheet. Nothing in this application halves, ignores or doubles any
          damage — the table does.
        </p>
      </div>
      {kinds.map((kind) => (
        <div key={kind} className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            {DAMAGE_TRAIT_LABELS[kind]}
          </span>
          {traits[kind].map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      ))}
    </section>
  )
}

/** The caption on each of the three lists, and the order they are printed in. */
const DAMAGE_TRAIT_LABELS: Record<keyof DamageTraits, string> = {
  resistances: 'Resistant to',
  immunities: 'Immune to',
  vulnerabilities: 'Vulnerable to',
}
