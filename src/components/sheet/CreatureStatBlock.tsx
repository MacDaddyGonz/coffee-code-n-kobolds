import { signed } from '@/lib/vitals'
import { Badge } from '@/components/ui/badge'
import { DerivedStat, StatGrid, speedHint, tagName } from '@/components/sheet/SheetFields'
import type { PublicSheet } from '@convex/lib/characters'
import { CREATURE_SIZE_NAMES, crLabel, findRole, findTier } from '@convex/lib/creatures'
import { SKILLS } from '@convex/lib/skills'
import type { AbilityKey, NpcSheet } from '@convex/lib/sheet'
import {
  ABILITY_KEYS,
  ABILITY_NAMES,
  abilityAbbreviation,
  abilityModifier,
  abilitiesOf,
  attackBonusOf,
  creatureSaveProficienciesOf,
  creatureSkillsOf,
  passivePerceptionOf,
  saveDcOf,
  speedOf,
} from '@convex/lib/sheet'

/**
 * Everything about a linked creature that is not a number on its statline — taken from the
 * payload's own type rather than restated here, so a field added to `publicSheetValidator`
 * cannot arrive with this file still describing the old shape.
 */
export type PublicCreature = NonNullable<PublicSheet['creature']>

export type CreatureStatBlockProps = {
  /** The resolved sheet. Every number below is read off it through an accessor. */
  sheet: NpcSheet
  /**
   * What the bestiary says about the creature, or null for one somebody typed in.
   *
   * ⚠️ **Null is the ordinary case for a hand-built creature and is not a degraded one.**
   * A hand-typed innkeeper has no creature type, no size, no alignment and no challenge
   * rating, because nothing ever asked for them — so those lines are absent rather than
   * printed as `—`, which would imply a field somebody had failed to fill in.
   */
  labels: PublicCreature | null
}

/**
 * A CREATURE'S STAT BLOCK — **a different document from a character sheet, not a character
 * sheet with fields hidden.**
 *
 * That distinction is the whole reason this component exists. A hero's sheet is six scores
 * you derive everything from; a stat block is a list of numbers the source *prints*, some of
 * which happen to look derived and are not — the SRD says a creature's initiative is
 * *"typically equal to its Dexterity modifier"* and explicitly permits it to differ, and its
 * SAVE column is not always MOD plus proficiency. So the numbers here are read through
 * `attackBonusOf`, `saveDcOf`, `passivePerceptionOf` and `speedOf`, every one of which
 * answers **null rather than a number** for a creature nobody recorded one for. A printed 10
 * would be a statistic the table acts on that nobody wrote.
 *
 * ⚠️ **A hand-typed `npc` and a creature off the bestiary shelf render through this ONE
 * component, and that is a display decision rather than a schema one.** The stored union is
 * still `pc | npc | preset | bestiary` and `isMonsterSheet` is untouched — what made the two
 * the same *document* is that ability scores arrived on the type they share. `CHARACTER_GROUPS`
 * stays at three for the same reason in reverse: filing an innkeeper apart from a dragon is a
 * question about the DM's picker, not about how either one is drawn.
 *
 * ⚠️ **`SkillList` — now `AbilityBlock` — is not this and must not be reused here.** A hero's
 * skills are eighteen booleans from which a bonus is worked out with a score, a level and a
 * proficiency bonus; a creature has none of those three, so its bonuses are stored
 * pre-calculated and the map is *sparse*. The two answer the same question with incompatible
 * data, `creatureSkillsOf` in convex/lib/sheet.ts carries the same warning, and nothing
 * converts between them in either direction. The server refuses a `skill` roll request against
 * a creature outright, which is why these are badges and not buttons: a clickable one would be
 * a control whose only outcome is a toast.
 *
 * Nothing here is editable. The overrides a DM may type live beside this on the bestiary
 * panel, and a hand-typed creature's numbers are typed on its own form — both of which draw
 * this to show the result.
 */
export function CreatureStatBlock({ sheet, labels }: CreatureStatBlockProps) {
  const attackBonus = attackBonusOf(sheet)
  const saveDc = saveDcOf(sheet)
  const passive = passivePerceptionOf(sheet)
  const speed = speedOf(sheet)

  return (
    <div className="flex flex-col gap-3">
      {labels ? <CreatureLine labels={labels} /> : null}

      <StatGrid>
        <DerivedStat label="Armour class" value={String(sheet.armourClass)} />
        <DerivedStat label="Hit points" value={String(sheet.maxHp)} />
        <DerivedStat label="Initiative" value={signed(sheet.initiativeBonus)} />
        <DerivedStat label="Speed" value={`${speed} ft`} hint={speedHint(speed)} />
        <DerivedStat label="Attack" value={attackBonus === null ? '—' : signed(attackBonus)} />
        {/* ⚠️ **Printed beside a result nothing compares it to.** No roll in this
            application is checked against a creature's save DC, nothing decides whether a
            saving throw succeeded, and no effect is applied — the DM reads the number out.
            This is the line ADR 0011 draws, on the screen where breaking it is a two-line
            change. */}
        <DerivedStat label="Save DC" value={saveDc === null ? '—' : String(saveDc)} />
        <DerivedStat label="Passive Perception" value={passive === null ? '—' : String(passive)} />
      </StatGrid>

      <CreatureAbilities sheet={sheet} />
      <CreatureSkills sheet={sheet} />
    </div>
  )
}

/** `Large Dragon, chaotic evil · CR 5 · Brute`, and the tags under it. */
function CreatureLine({ labels }: { labels: PublicCreature }) {
  const role = findRole(labels.role)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium">
          {CREATURE_SIZE_NAMES[labels.size]} {labels.creatureType}
        </span>
        {labels.alignment ? `, ${labels.alignment}` : null}
        {' · '}
        <span className="text-foreground font-medium tabular-nums">CR {crLabel(labels.cr)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* The bare numeral as the fallback for the same reason `findTier` tolerates an
            unknown one at all: a tier is stored on every entry, so a table retired from
            `TIERS` has to leave everything that named it readable rather than printing
            `undefined` into a badge mid-fight. */}
        <Badge variant="outline">{findTier(labels.tier)?.name ?? `Tier ${labels.tier}`}</Badge>
        {role ? <Badge variant="outline">{role.name}</Badge> : null}
        {labels.tags.map((tag) => (
          <Badge key={tag} variant="ghost">
            {tagName(tag)}
          </Badge>
        ))}
      </div>
    </div>
  )
}

/**
 * The six scores a 2024 stat block prints, and which of them the creature is proficient in
 * saving with.
 *
 * ⚠️ **Absent is a real answer and is stated rather than filled in with tens.** A creature
 * typed in before the 2024 conversion has no recorded scores, and `abilitiesOf` answers
 * null rather than inventing six statistics — `passivePerceptionOf`'s stance applied to six
 * numbers at once. The block is dropped entirely rather than drawn as six dashes: six empty
 * columns read as a permission somebody is being kept from, and there is nothing behind them.
 *
 * ⚠️ **The SAVE column shows a tick and not a bonus, and that is a gap in the stored shape
 * rather than a rendering choice.** `NpcSheet.saveProficiencies` is six booleans, which is
 * the hero's shape; the SRD prints a creature's save column as a *number* that is not always
 * MOD plus proficiency — the Aboleth prints Dexterity −1 with a save of +3 — and a creature
 * has no level and therefore no proficiency bonus to add. `BestiaryCombat.saveBonuses` holds
 * the printed figures for exactly that reason and does not reach this type. So a tick is what
 * can honestly be drawn: computing one would be inventing the number the corpus was careful
 * to store verbatim.
 *
 * Iterated over `ABILITY_KEYS` rather than six rows in the markup, which is the same rule
 * `AbilityBlock` follows one document over.
 */
function CreatureAbilities({ sheet }: { sheet: NpcSheet }) {
  const scores = abilitiesOf(sheet)
  if (scores === null) return null
  const saves = creatureSaveProficienciesOf(sheet)

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-heading text-sm font-medium">Ability scores</h3>
      <div className="grid grid-cols-6 gap-1.5">
        {ABILITY_KEYS.map((ability) => (
          <AbilityCell
            key={ability}
            ability={ability}
            score={scores[ability]}
            proficient={saves?.[ability] ?? false}
          />
        ))}
      </div>
    </section>
  )
}

function AbilityCell({
  ability,
  score,
  proficient,
}: {
  ability: AbilityKey
  score: number
  proficient: boolean
}) {
  return (
    <div className="bg-muted/40 flex flex-col items-center gap-0.5 rounded-lg border p-1.5">
      {/* The abbreviation, which has to equal the token spellings the roll grammar uses —
          `abilityAbbreviation` is written once beside those tokens for that reason. */}
      <span className="text-muted-foreground text-[0.65rem] font-medium">
        <abbr title={ABILITY_NAMES[ability]} className="no-underline">
          {abilityAbbreviation(ability)}
        </abbr>
      </span>
      <span className="font-heading text-sm leading-none font-medium tabular-nums">{score}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {signed(abilityModifier(score))}
      </span>
      {proficient ? (
        <span className="text-[0.65rem] font-medium" title="Proficient in this saving throw">
          save
        </span>
      ) : null}
    </div>
  )
}

/**
 * The two or three things a creature is good at, as skill and bonus.
 *
 * Only what is present, in the order `SKILLS` lists them. Eighteen rows mostly reading `+0`
 * would be noise on a stat block meant to fit a screen, and a creature that is good at two
 * things should read as a creature that is good at two things. The corpus caps a creature at
 * six listed skills, which is the largest number any SRD creature at CR 0–6 carries.
 */
function CreatureSkills({ sheet }: { sheet: NpcSheet }) {
  const skills = creatureSkillsOf(sheet)
  const listed = SKILLS.filter((skill) => skills[skill.key] !== undefined)
  if (listed.length === 0) return null

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-heading text-sm font-medium">Skills</h3>
      <ul className="flex flex-wrap gap-1.5">
        {listed.map((skill) => (
          <li key={skill.key}>
            <Badge variant="outline" className="tabular-nums">
              {skill.name} {signed(skills[skill.key] ?? 0)}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
