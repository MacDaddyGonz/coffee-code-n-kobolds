import { useState } from 'react'
import { Lock, LockOpen, Minus, Plus } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { SheetField } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { ClassKey } from '@convex/lib/classes'
import {
  CLASSES,
  MAX_LIBRARY_LEVEL,
  SUBCLASS_LEVEL,
  findClass,
  subclassOf,
} from '@convex/lib/classes'
import type { SpeciesKey } from '@convex/lib/species'
import { SPECIES, lineageOf, species as speciesByKey } from '@convex/lib/species'
import type { PresetSheet, SheetProblem } from '@convex/lib/sheet'
import { MAX_LEVEL, MIN_LEVEL, storedSheetProblem } from '@convex/lib/sheet'

/** What the dropdowns come to. Everything else about a preset is not chosen here. */
export type BuilderSelections = {
  race: SpeciesKey
  /** Null for the four species with no lineage table, and for one nobody has picked from. */
  lineageKey: string | null
  classKey: ClassKey
  subclassKey: string | null
}

export type CharacterBuilderProps = {
  /**
   * The selections as the server last sent them, or null for a character that has not
   * been built from the library yet. Deliberately the *saved* value rather than a
   * draft — see the note on the local state below.
   */
  preset: PresetSheet | null
  /** The level to show. From the preset, or from a hand-built sheet's own level. */
  level: number
  /** Whether this browser holds the DM code. Decides what is offered, never what is permitted. */
  isDm: boolean
  /** A save is in flight. Everything goes dead rather than queueing a second one. */
  busy?: boolean
  /** Writes the three selections and locks them, in one go. */
  onConfirm: (selections: BuilderSelections) => void
  /** DM only, and null when there is no preset for `characters.setLevel` to act on. */
  onSetLevel: ((level: number) => void) | null
  /** DM only. Clearing the lock is the whole of what a DM does to let a rebuild happen. */
  onSetLocked: (locked: boolean) => void
}

/**
 * Choosing a character, rather than filling one in.
 *
 * This is what a beginner meets first, and every decision below is in service of it
 * being obvious without instructions. Up to four dropdowns, each carrying the one-line
 * blurb the catalogue was written with, so the choice can be made from the page rather
 * than from knowing D&D; every one of the species' traits spelled out in full the moment
 * it is picked; and one button that commits.
 *
 * ⚠️ **Two of the four are conditional, and both are absent rather than disabled.** The
 * archetype is drawn from level `SUBCLASS_LEVEL` and the lineage only for the five
 * species that print a table — a greyed-out control reads as a thing the player failed
 * to fill in, which a Halfling with no lineage has not done.
 *
 * **The selections are local state and only `Confirm` writes them, while the DM's
 * overrides go through the panel's draft and its Save button.** Two paths for two
 * genuinely different actions rather than an inconsistency: picking a species is a
 * decision somebody browses their way to — flicking between Dwarf and Goliath to read
 * what each does is the point of the blurbs — and half of that browsing must not reach
 * the table. An armour class the DM types is an edit, and edits are what Save is for.
 * Carrying half-made selections in the shared draft would also mean the panel's
 * "unsaved changes" line lighting up because somebody read the Tiefling entry.
 *
 * `locked` is a courtesy and is described as one. It stops a player rebuilding their
 * character by accident mid-session; it is not a defence, because `playerId` is routing
 * rather than identity (ADR 0003), and `characters.updateSheet` re-checks the whole
 * rule server-side regardless of what this component chose to grey out.
 *
 * **The species traits are given a box of their own rather than a line in a list.** They
 * are the first thing that makes a character feel unlike anybody else's at the table, and
 * on a page that is otherwise numbers they are the only part a child will read twice.
 */
export function CharacterBuilder({
  preset,
  level,
  isDm,
  busy,
  onConfirm,
  onSetLevel,
  onSetLocked,
}: CharacterBuilderProps) {
  const [chosen, setChosen] = useState(() => selectionsOf(preset))
  const [echoed, setEchoed] = useState(preset)

  // Follow the server, but only when there is nothing half-chosen to lose — the same
  // rule, for the same reason, that `CharacterSheetEditor` applies to the draft it
  // holds. The DM awarding a level while somebody is reading the Dwarf blurb should
  // not throw away what they were part-way through picking.
  //
  // Adjusting state during render is React's documented alternative to an effect for
  // deriving state from a prop, and it re-renders before anything reaches the screen
  // rather than showing the stale value for a frame.
  if (echoed !== preset) {
    setEchoed(preset)
    if (!changed(chosen, echoed)) setChosen(selectionsOf(preset))
  }

  const locked = preset?.locked ?? false
  const readOnly = locked && !isDm
  const disabled = busy || readOnly

  const chosenRace = chosen.race === null ? null : speciesByKey(chosen.race)
  const chosenLineage = lineageOf(chosenRace, chosen.lineageKey)
  const chosenClass = chosen.classKey === null ? null : findClass(chosen.classKey)
  const chosenSubclass =
    chosen.classKey === null ? null : subclassOf(chosen.classKey, chosen.subclassKey)

  // Built and checked with the same function `characters.updateSheet` throws from, so
  // the button goes dead with the wording the server would have used. It is a courtesy
  // either way: the mutation re-runs the check and refuses regardless.
  const candidate = candidateOf(chosen, level)
  const problem: SheetProblem | null = candidate ? storedSheetProblem(candidate) : null

  const confirmable =
    candidate !== null &&
    problem === null &&
    !busy &&
    // Nothing to do when the selections are already saved *and* already locked.
    // Unlocked, Confirm still has a job: locking them is what it is for.
    (preset === null || !preset.locked || changed(chosen, preset))

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">
            {preset === null ? 'Build a character' : 'Species and class'}
          </h3>
          <p className="text-muted-foreground text-xs">
            {preset === null
              ? 'Pick a species and a class and everything else — hit points, skills, feats and spells — is filled in for you, and stays right as you level up.'
              : 'Everything on this sheet is worked out from these choices and your level.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LevelControl level={level} isDm={isDm} busy={busy} onSetLevel={onSetLevel} />
          {preset !== null && isDm ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onSetLocked(!locked)}
            >
              {locked ? <LockOpen /> : <Lock />}
              {locked ? 'Unlock' : 'Lock'}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <SheetField
          id="builder-race"
          label="Species"
          hint={chosenRace?.blurb ?? 'What your character is.'}
        >
          <NativeSelect
            id="builder-race"
            className="w-full"
            value={chosen.race ?? ''}
            disabled={disabled}
            onChange={(event) =>
              // The lineage goes with the species it belonged to, for the reason the
              // archetype goes with its class one control down: a Goliath holding an
              // Elf's `wood` would resolve to nothing at all, and the control that
              // would have explained it is about to be redrawn with different options.
              setChosen({
                ...chosen,
                race: event.target.value as SpeciesKey,
                lineageKey: null,
              })
            }
          >
            <option value="" disabled>
              Choose a species…
            </option>
            {SPECIES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name} — {entry.blurb}
              </option>
            ))}
          </NativeSelect>
        </SheetField>

        <SheetField
          id="builder-class"
          label="Class"
          hint={chosenClass?.blurb ?? 'What your character does.'}
        >
          <NativeSelect
            id="builder-class"
            className="w-full"
            value={chosen.classKey ?? ''}
            disabled={disabled}
            onChange={(event) =>
              // The archetype goes with the class it belonged to. Keeping it would
              // leave a Rogue holding a Wizard's school, which `storedSheetProblem`
              // refuses — correctly, but with an error about a control the person
              // never touched.
              setChosen({
                ...chosen,
                classKey: event.target.value as ClassKey,
                subclassKey: null,
              })
            }
          >
            <option value="" disabled>
              Choose a class…
            </option>
            {CLASSES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name} — {entry.blurb}
              </option>
            ))}
          </NativeSelect>
        </SheetField>
      </div>

      {/* ⚠️ **Absent rather than disabled for the four species with no lineage table**,
          which is the rule the archetype control below follows and for the same reason: a
          greyed-out dropdown reads as a thing the player failed to fill in, and a Halfling
          has not failed to choose a lineage — a Halfling has none. Drawn the moment the
          species has one, at every level, because a lineage is a level 1 choice unlike an
          archetype. */}
      {chosenRace !== null && chosenRace.lineages !== undefined ? (
        <SheetField
          id="builder-lineage"
          label="Lineage"
          hint={
            chosenLineage?.blurb ??
            `Your ${chosenRace.name} picks one of ${chosenRace.lineages.length}, and it comes with magic of its own.`
          }
        >
          <NativeSelect
            id="builder-lineage"
            className="w-full"
            value={chosen.lineageKey ?? ''}
            disabled={disabled}
            onChange={(event) =>
              setChosen({ ...chosen, lineageKey: event.target.value || null })
            }
          >
            <option value="">Not chosen yet</option>
            {chosenRace.lineages.map((lineage) => (
              <option key={lineage.key} value={lineage.key}>
                {lineage.name} — {lineage.blurb}
              </option>
            ))}
          </NativeSelect>
        </SheetField>
      ) : null}

      {/* Absent below level 2, because below level 2 there is nothing to have chosen.
          An archetype already stored is not shown down there either — `characters.
          setLevel` clears one on the way down, so anything drawn here would be a value
          the server has already discarded. */}
      {chosenClass !== null && level >= SUBCLASS_LEVEL ? (
        <SheetField
          id="builder-subclass"
          label="Archetype"
          hint={
            chosenSubclass?.blurb ??
            `Your ${chosenClass.name} picks one of two paths at level ${SUBCLASS_LEVEL}.`
          }
        >
          <NativeSelect
            id="builder-subclass"
            className="w-full"
            value={chosen.subclassKey ?? ''}
            disabled={disabled}
            onChange={(event) =>
              setChosen({ ...chosen, subclassKey: event.target.value || null })
            }
          >
            <option value="">Not chosen yet</option>
            {chosenClass.subclasses.map((subclass) => (
              <option key={subclass.key} value={subclass.key}>
                {subclass.name} — {subclass.blurb}
              </option>
            ))}
          </NativeSelect>
        </SheetField>
      ) : null}

      {/* ⚠️ **Every trait, not the first one.** A 2024 species has between three and five
          and the interesting one is rarely first — a Dwarf's Darkvision leads and their
          Toughness is the number that keeps them alive. Iterated over `traits` rather than
          three or four lines of JSX for the reason the sheet iterates
          `SHEET_ENTRY_CATEGORIES`: a species whose fifth trait had no row would be
          invisible here and on the resolved sheet nowhere, which is a content bug with no
          symptom. The lineage's own trait joins the same list rather than getting a second
          box, because a Wood Elf's 35 feet is a species trait as far as the reader is
          concerned. */}
      {chosenRace ? (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-medium">What a {chosenRace.name} can do</span>
            <Badge variant="secondary">
              {chosenRace.traits.length + (chosenLineage ? 1 : 0)} traits
            </Badge>
          </span>
          {[
            ...chosenRace.traits,
            ...(chosenLineage
              ? [{ name: chosenLineage.traitName, text: chosenLineage.traitText }]
              : []),
          ].map((trait) => (
            <p key={trait.name} className="text-muted-foreground text-xs">
              <span className="text-foreground font-medium">{trait.name}. </span>
              {trait.text}
            </p>
          ))}
        </div>
      ) : null}

      <FieldError message={problem?.message} />

      {readOnly ? (
        <p className="text-muted-foreground text-xs">
          Your species, class and archetype are set. Ask whoever is running the game to unlock
          them if you want to change something.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {preset === null
              ? 'Confirming replaces whatever is typed in below with the library’s numbers.'
              : 'Confirming locks these in. The DM can unlock them again at any time.'}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!confirmable}
            onClick={() =>
              candidate &&
              onConfirm({
                // Narrow at the boundary rather than in the type: `confirmable` is false unless the
                // dropdown holds one of the nine, so by here it genuinely is a `SpeciesKey`.
                race: candidate.race as SpeciesKey,
                lineageKey: candidate.lineageKey ?? null,
                classKey: candidate.classKey,
                subclassKey: candidate.subclassKey,
              })
            }
          >
            {preset === null ? 'Build this character' : 'Confirm'}
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * Level, shown to everybody and changed only by the DM.
 *
 * Not part of the draft and not part of Confirm: `characters.setLevel` is its own
 * mutation and this writes through it straight away, because a level is *awarded*
 * rather than edited — the DM says the party has gone up and every sheet in the game
 * moves. Routing it through a form with a Save button would put a second step between
 * the decision and the six people waiting for it.
 */
function LevelControl({
  level,
  isDm,
  busy,
  onSetLevel,
}: {
  level: number
  isDm: boolean
  busy?: boolean
  onSetLevel: ((level: number) => void) | null
}) {
  if (!isDm || onSetLevel === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs font-medium">Level</span>
        <span className="font-heading text-base leading-none font-medium tabular-nums">
          {level}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">Level</span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label="Take a level away"
        disabled={busy || level <= MIN_LEVEL}
        onClick={() => onSetLevel(level - 1)}
      >
        <Minus />
      </Button>
      <span className="font-heading w-4 text-center text-base leading-none font-medium tabular-nums">
        {level}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        // Past the levels the library covers a character simply stops gaining new
        // things, which is a limit worth naming rather than a bug worth hiding — the
        // sheet keeps working and the DM keeps the level they asked for.
        aria-label={
          level >= MAX_LIBRARY_LEVEL
            ? `Award a level. The library covers up to level ${MAX_LIBRARY_LEVEL}; past that a character gains nothing new.`
            : 'Award a level'
        }
        disabled={busy || level >= MAX_LEVEL}
        onClick={() => onSetLevel(level + 1)}
      >
        <Plus />
      </Button>
    </div>
  )
}

type PartialSelections = {
  /**
   * ⚠️ **A `string`, not a `SpeciesKey`, because a STORED species may have been retired.**
   * `presetSheetValidator` takes the widened `storedSpeciesKeyValidator` so a character built
   * before the 2024 conversion still validates on a schema push, and this is the first place
   * that key is read by a person. Narrowing here would be the compiler agreeing with a
   * comfortable fiction — the same one `species()` used to rest on.
   *
   * `speciesLabel` renders it either way; the dropdown offers only the nine that resolve, so
   * choosing again is the only thing a retired key can become.
   */
  race: string | null
  lineageKey: string | null
  classKey: ClassKey | null
  subclassKey: string | null
}

function selectionsOf(preset: PresetSheet | null): PartialSelections {
  return preset === null
    ? { race: null, lineageKey: null, classKey: null, subclassKey: null }
    : {
        race: preset.race,
        // Absent and null both mean "nothing chosen" — see `presetSheetValidator` — and
        // this is where the two are flattened, so nothing above has to know that a
        // character stored before the field existed is not a character who declined.
        lineageKey: preset.lineageKey ?? null,
        classKey: preset.classKey,
        subclassKey: preset.subclassKey,
      }
}

function changed(chosen: PartialSelections, against: PresetSheet | null): boolean {
  const saved = selectionsOf(against)
  return (
    chosen.race !== saved.race ||
    chosen.lineageKey !== saved.lineageKey ||
    chosen.classKey !== saved.classKey ||
    chosen.subclassKey !== saved.subclassKey
  )
}

/**
 * The preset these selections would make, or null while one of the two required
 * dropdowns is still empty.
 *
 * The archetype is dropped below `SUBCLASS_LEVEL` rather than merely hidden, because
 * the select above is hidden there and a value the person cannot see is one they cannot
 * be shown an error about.
 *
 * **The lineage is dropped for a species with no lineage table, for the same reason.**
 * It is a weaker case than the archetype's — `lineageOf` is asked with the resolved
 * species and would answer null for a Halfling holding `wood` anyway, so nothing would
 * misresolve — but a stored key that resolves to nothing is a value on the document that
 * no screen in the application will ever show, and this is the one place that can decline
 * to write it.
 */
function candidateOf(chosen: PartialSelections, level: number): PresetSheet | null {
  // ⚠️ **A RETIRED species is not a candidate, which is the whole of ''says plainly which
  // species it needs choosing again''.** The character keeps the key it has — nothing here
  // rewrites it — and simply cannot be confirmed until the player picks one of the nine. That
  // is the same refusal `storedSheetProblem` would give, reached before anything is sent.
  if (chosen.race === null || chosen.classKey === null) return null
  if (speciesByKey(chosen.race) === null) return null
  const hasLineages = speciesByKey(chosen.race)?.lineages !== undefined
  return {
    kind: 'preset',
    race: chosen.race as SpeciesKey,
    lineageKey: hasLineages ? chosen.lineageKey : null,
    classKey: chosen.classKey,
    subclassKey: level >= SUBCLASS_LEVEL ? chosen.subclassKey : null,
    level,
    locked: true,
  }
}
