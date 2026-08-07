import { Sparkles } from 'lucide-react'

import { HpControls } from '@/components/HpControls'
import { NumberInput } from '@/components/sheet/SheetFields'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PublicVitals } from '@convex/lib/characters'
import { findClass, subclassLabel, subclassOf } from '@convex/lib/classes'
import { lineageOf, species as speciesByKey, speciesKeyOf, speciesLabel } from '@convex/lib/species'
import { passivePerception } from '@convex/lib/skills'
import type { PcSheet, PresetSheet } from '@convex/lib/sheet'
import {
  MAX_DEATH_SAVES,
  MAX_TEMPORARY_HP,
  initiativeBonusOf,
  proficiencyBonus,
  skillProficienciesOf,
  speedOf,
} from '@convex/lib/sheet'

export type CharacterHeaderProps = {
  /** The resolved sheet. Every number below is read off it or derived from it. */
  sheet: PcSheet
  /**
   * The stored selections, or null for a hand-built hero.
   *
   * The header's first line is the one place a *selection* is printed rather than a
   * resolved number, and the two genuinely differ: a resolved sheet carries `className`
   * as free text, so a library character's species, lineage and archetype are only
   * knowable from what was chosen. A hand-built hero has none of that and gets the
   * class name it was typed with.
   */
  preset: PresetSheet | null
  /** What the server was willing to tell this client. Null while it is still loading. */
  vitals: PublicVitals | null
  disabled?: boolean
  onAdjustHp: (delta: number) => void
  onSetTemporaryHp: (temporaryHp: number) => void
  onSetDeathSaves: (successes: number, failures: number) => void
  onSetHeroicInspiration: (heroicInspiration: boolean) => void
}

/**
 * WHAT IS TRUE OF THIS CHARACTER RIGHT NOW, pinned above the three sub-tabs so it is
 * readable from all of them.
 *
 * That is the whole of why it exists as a separate block rather than as the top of the
 * Play pane. Hit points, temporary hit points and the death-save tally are the things a
 * player looks at *while doing something else* — reading a spell, checking a skill — and a
 * header that scrolled away with the Play pane would send somebody back a tab to find out
 * how hurt they are. The panes below are divided by *when* you read them; this block is
 * the part with no answer to that question.
 *
 * ⚠️ **NOTHING HERE ADJUDICATES ANYTHING, and this is the screen where the temptation is
 * strongest.** Three ticked failures is three ticked boxes: nobody dies, no heal is
 * refused, no health band is recomputed, nothing is announced, and the character is
 * exactly as alive at three failures as at none. Temporary hit points are a number beside
 * a number and are never subtracted from a hit for you. Heroic Inspiration is a flag that
 * rerolls nothing. The table adjudicates all three, which is what it has always done —
 * see the note on `MAX_DEATH_SAVES` in convex/lib/sheet.ts, where the reversal of a stated
 * *never* is argued out, and ADR 0016.
 *
 * **Two things a real 2024 sheet prints are absent, and both are absences on the server
 * rather than decisions here.** A hero has no stored *size* — `Species` carries a speed
 * and its traits and no size at all — so there is nothing to print, and inventing `M`
 * would be a statistic nobody wrote, which is `passivePerceptionOf`'s stance one field
 * over. And a character's *conditions* are markers on a **coin**, in `tokenMarkers`, keyed
 * by a token id this panel has never had: the sheet is opened from a list as often as from
 * the board, and a character can have two coins or none. Threading one in is a real change
 * with a real question behind it — *which* coin — and it belongs to whoever owns the board.
 */
export function CharacterHeader({
  sheet,
  preset,
  vitals,
  disabled,
  onAdjustHp,
  onSetTemporaryHp,
  onSetDeathSaves,
  onSetHeroicInspiration,
}: CharacterHeaderProps) {
  const exact = vitals?.kind === 'exact' ? vitals : null

  return (
    <div className="flex flex-col gap-2">
      <IdentityLine sheet={sheet} preset={preset} />

      <div className="flex items-center gap-2">
        <HpControls vitals={vitals} onAdjust={onAdjustHp} className="min-w-0 flex-1" />
        {exact ? (
          <TemporaryHp
            value={exact.temporaryHp}
            disabled={disabled}
            onChange={onSetTemporaryHp}
          />
        ) : null}
      </div>

      <StatLine sheet={sheet} vitals={exact} />

      {exact ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <DeathSaves
            successes={exact.deathSaveSuccesses}
            failures={exact.deathSaveFailures}
            disabled={disabled}
            onChange={onSetDeathSaves}
          />
          <HeroicInspiration
            on={exact.heroicInspiration}
            disabled={disabled}
            onChange={onSetHeroicInspiration}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * `Wood Elf · Ranger (Hunter) · Level 3`, and the proficiency bonus beside it.
 *
 * ⚠️ **A retired species or archetype prints its stored label and says to choose again**,
 * which is the read-tolerant half of the asymmetry `species()`, `subclassOf` and
 * `speciesLabel` all keep: a character built before the 2024 conversion opens, keeps its
 * name and its hit points, and is told plainly what needs picking. A blank where a species
 * used to be reads as a bug; the old name reads as a decision the rules took back, which
 * is what it is. The control that fixes it is the builder on the Build pane — this line
 * only has to avoid throwing and avoid lying.
 *
 * The lineage is folded into the species word rather than given a clause of its own,
 * because *Wood Elf* is what a player calls themselves. `CharacterBuilder` takes the same
 * position when it lists a lineage's trait among the species' own.
 */
function IdentityLine({ sheet, preset }: { sheet: PcSheet; preset: PresetSheet | null }) {
  const chosenSpecies = preset === null ? null : speciesByKey(speciesKeyOf(preset))
  const lineage = lineageOf(chosenSpecies, preset?.lineageKey ?? null)
  const chosenClass = preset === null ? null : findClass(preset.classKey)
  const chosenSubclass =
    preset === null ? null : subclassOf(preset.classKey, preset.subclassKey)

  // Both retirements read the same way and are worked out the same way: the stored key
  // resolved to nothing, and there is a label for it anyway.
  const retiredSpecies =
    preset !== null && chosenSpecies === null ? speciesLabel(speciesKeyOf(preset)) : null
  const retiredSubclass =
    preset !== null && preset.subclassKey !== null && chosenSubclass === null
      ? subclassLabel(preset.classKey, preset.subclassKey)
      : null

  const speciesWord =
    retiredSpecies ??
    (chosenSpecies === null
      ? null
      : lineage === null
        ? chosenSpecies.name
        : `${lineage.name} ${chosenSpecies.name}`)

  // A library character's class name comes from the catalogue; a hand-built one's is the
  // free text on its own sheet. `className` is the resolved sheet's field either way, so
  // it is the honest fallback rather than a placeholder.
  const classWord = chosenClass?.name ?? (sheet.className || null)
  const pathWord = retiredSubclass ?? chosenSubclass?.name ?? null

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-muted-foreground min-w-0 text-xs">
        {speciesWord ? <span className="text-foreground font-medium">{speciesWord}</span> : null}
        {speciesWord && classWord ? ' · ' : null}
        {classWord ? (
          <span className="text-foreground font-medium">
            {classWord}
            {pathWord ? ` (${pathWord})` : ''}
          </span>
        ) : null}
        {speciesWord || classWord ? ' · ' : null}
        Level {sheet.level}
        {retiredSpecies || retiredSubclass ? (
          // One sentence covering both, because a character can have lost either and being
          // told twice reads as two faults. It names the pane rather than the control,
          // since the control is a dropdown two taps away and the pane is the thing to press.
          <span className="text-destructive"> · choose again on Build</span>
        ) : null}
      </p>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        PB +{proficiencyBonus(sheet.level)}
      </span>
    </div>
  )
}

/**
 * The four numbers a reader glances at mid-turn, plus what is left of the hit dice.
 *
 * A dense line of chips rather than the reference sheet's boxes, because the pane is
 * divider-width and four boxes with captions is most of the vertical budget. The hit-dice
 * *controls* are on the Play pane where the rest buttons are; this is the readout, so that
 * somebody deciding whether to take a short rest can see the answer without changing tab.
 *
 * Speed carries no *"faster than the usual"* hint, unlike the three other screens that
 * print one, and the reason is now purely one of space: this is a divider-width line of
 * chips with no room under any of them. ⚠️ **The reason it used to give is gone** — it
 * said `speedHint` compared against a `SPEED_FEET` of 35 while the nine species printed
 * 30, so every character would read *slower than the usual 35*. The migration commit moved
 * the constant to 30 and that caption is correct everywhere it appears; leaving it off
 * here is a layout decision and no longer a workaround.
 */
function StatLine({ sheet, vitals }: { sheet: PcSheet; vitals: PublicVitals | null }) {
  const exact = vitals?.kind === 'exact' ? vitals : null
  const hitDice =
    exact && exact.hitDiceRemaining !== null && exact.hitDiceCount !== null
      ? `${exact.hitDiceRemaining}/${exact.hitDiceCount} d${sheet.hitDice.faces}`
      : null

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <Stat label="AC" value={String(sheet.armourClass)} />
      <Stat label="Init" value={signedShort(initiativeBonusOf(sheet))} />
      <Stat label="Speed" value={`${speedOf(sheet)} ft`} />
      <Stat
        label="Passive"
        value={String(
          passivePerception(sheet.abilities, sheet.level, skillProficienciesOf(sheet)),
        )}
      />
      {hitDice ? <Stat label="HD" value={hitDice} /> : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-medium">{label}</span>
      <span className="text-foreground font-heading font-medium tabular-nums">{value}</span>
    </span>
  )
}

/**
 * `+3` with a true minus sign, and no em dash for a non-finite value.
 *
 * `signed` in SheetFields.tsx is the shared one and this is deliberately not a second
 * copy of it — it is the same function with the chip's own answer for a value that cannot
 * be printed. A header chip has no room for a fallback, and every input here is derived
 * from stored integers, so `0` is the only honest thing left.
 */
function signedShort(value: number): string {
  if (!Number.isFinite(value)) return '+0'
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`
}

/**
 * Temporary hit points, which are **not part of the maximum and are not healing.**
 *
 * A box of their own beside the bar rather than a second segment inside it, for the reason
 * `clampTemporaryHp` exists separately from `clampHp`: full health with fifteen temporary
 * hit points is a real state, and a bar that folded them in would either overflow or lie.
 * Nothing subtracts damage from them — the person at the table does that, and then presses
 * `−` on the bar for whatever got through.
 *
 * Absent rather than zero is not a state this field has: the server stores a number and
 * `temporaryHpOf` answers 0 for a row written before the field existed, so an empty box is
 * a value being typed rather than a fact. `NaN` is therefore read as 0 on the way out.
 */
function TemporaryHp({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <NumberInput
        id="temporary-hp"
        aria-label="Temporary hit points"
        className="h-7 w-14"
        value={value}
        disabled={disabled}
        onChange={(next) =>
          onChange(Number.isFinite(next) ? Math.min(MAX_TEMPORARY_HP, Math.max(0, next)) : 0)
        }
      />
      <span className="text-muted-foreground text-xs">temp</span>
    </span>
  )
}

/**
 * Two rows of three boxes, and **that is the entirety of the feature.**
 *
 * ⚠️ **The third failure does nothing.** No hit point moves, no marker is set, no line is
 * written to the feed, no band is recomputed, and no heal is refused — putting death saving
 * throws into this application at all reversed a stated *never* on precisely the grounds
 * that the counter decides nothing (ADR 0016). The three lines that would make this kill
 * somebody are a spec amendment and an ADR, not an edit to this component.
 *
 * Clicking pip *n* sets the count to *n*, except that clicking the highest one already
 * filled clears it — which is how a row of pips is undone without a second control beside
 * it, and is the gesture every star rating in the world uses.
 *
 * Both columns go in one call because they are one tally on one row of boxes; `setDeathSaves`
 * takes both for the same reason, so a sheet can never show this round's successes beside
 * last round's failures.
 */
function DeathSaves({
  successes,
  failures,
  disabled,
  onChange,
}: {
  successes: number
  failures: number
  disabled?: boolean
  onChange: (successes: number, failures: number) => void
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium">Death saves</span>
      <PipRow
        label="death saving throw successes"
        filled={successes}
        tone="text-emerald-500"
        disabled={disabled}
        onSet={(next) => onChange(next, failures)}
      />
      <span className="text-muted-foreground text-xs">/</span>
      <PipRow
        label="death saving throw failures"
        filled={failures}
        tone="text-destructive"
        disabled={disabled}
        onSet={(next) => onChange(successes, next)}
      />
    </span>
  )
}

function PipRow({
  label,
  filled,
  tone,
  disabled,
  onSet,
}: {
  label: string
  filled: number
  tone: string
  disabled?: boolean
  onSet: (count: number) => void
}) {
  // `MAX_DEATH_SAVES` rather than a literal 3, and the constant is the bound the mutation
  // clamps to — so a row of pips and the value the server will accept cannot disagree.
  const pips = Array.from({ length: MAX_DEATH_SAVES }, (_, index) => index + 1)

  return (
    <span className="flex items-center gap-0.5">
      {pips.map((pip) => {
        const on = pip <= filled
        return (
          <button
            key={pip}
            type="button"
            // The whole clause, because `3` is not a name and the two rows are otherwise
            // indistinguishable to anybody not looking at the colours.
            aria-label={`${pip} ${label}`}
            aria-pressed={on}
            disabled={disabled}
            className={cn(
              'size-3.5 rounded-full border leading-none transition-colors',
              'focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              on ? cn('bg-current', tone) : 'border-input',
            )}
            onClick={() => onSet(pip === filled ? pip - 1 : pip)}
          />
        )
      })}
    </span>
  )
}

/**
 * One flag, and **nothing in this application reads it.**
 *
 * The 2024 rule lets a character with Heroic Inspiration reroll a d20; no die here
 * consults the flag, no roll is repeated, and pressing this changes no number anywhere. It
 * is remembered because it is exactly the sort of thing a table forgets it has — which is
 * the same argument the once-per-rest abilities are tracked on, and the same register as a
 * condition pip on a coin.
 *
 * A long rest deliberately does **not** clear or grant it: regaining Heroic Inspiration on
 * a long rest is a Human species trait rather than a property of resting, and doing it here
 * would invent a rule for the eight species that do not have it. `characters.longRest`
 * leaves it alone for the same reason and says so.
 */
function HeroicInspiration({
  on,
  disabled,
  onChange,
}: {
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant={on ? 'default' : 'outline'}
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onChange(!on)}
        >
          <Sparkles />
          Inspiration
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {on
          ? 'Heroic Inspiration in hand. Spending it to reroll is yours to do at the table — nothing here rerolls anything.'
          : 'No Heroic Inspiration. Tick it when the DM hands you one.'}
      </TooltipContent>
    </Tooltip>
  )
}
