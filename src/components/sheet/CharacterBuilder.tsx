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
import { SPECIES, species as speciesByKey } from '@convex/lib/species'
import type { PresetSheet, SheetProblem } from '@convex/lib/sheet'
import { MAX_LEVEL, MIN_LEVEL, storedSheetProblem } from '@convex/lib/sheet'

/** What the three dropdowns come to. Everything else about a preset is not chosen here. */
export type BuilderSelections = {
  race: SpeciesKey
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
 * being obvious without instructions. Three dropdowns, each carrying the one-line blurb
 * the catalogue was written with, so the choice can be made from the page rather than
 * from knowing D&D; the race's trait spelled out in full the moment it is picked; and
 * one button that commits.
 *
 * **The selections are local state and only `Confirm` writes them, while the DM's
 * overrides go through the panel's draft and its Save button.** Two paths for two
 * genuinely different actions rather than an inconsistency: picking a race is a
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
 * **The race trait is given a box of its own rather than a line in a list.** It is the
 * first thing that makes a character feel unlike anybody else's at the table, and on a
 * page that is otherwise numbers it is the only part a child will read twice.
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
            {preset === null ? 'Build a character' : 'Race and class'}
          </h3>
          <p className="text-muted-foreground text-xs">
            {preset === null
              ? 'Pick a race and a class and everything else — hit points, skills, feats and spells — is filled in for you, and stays right as you level up.'
              : 'Everything on this sheet is worked out from these three choices and your level.'}
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
          label="Race"
          hint={chosenRace?.blurb ?? 'What your character is.'}
        >
          <NativeSelect
            id="builder-race"
            className="w-full"
            value={chosen.race ?? ''}
            disabled={disabled}
            onChange={(event) =>
              setChosen({ ...chosen, race: event.target.value as SpeciesKey })
            }
          >
            <option value="" disabled>
              Choose a race…
            </option>
            {SPECIES.map((race) => (
              <option key={race.key} value={race.key}>
                {race.name} — {race.blurb}
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

      {chosenRace ? (
        <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-medium">{chosenRace.traitName}</span>
            <Badge variant="secondary">{chosenRace.name}</Badge>
          </span>
          <p className="text-muted-foreground text-xs">{chosenRace.traitText}</p>
        </div>
      ) : null}

      <FieldError message={problem?.message} />

      {readOnly ? (
        <p className="text-muted-foreground text-xs">
          Your race, class and archetype are set. Ask whoever is running the game to unlock
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
                race: candidate.race,
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
  race: SpeciesKey | null
  classKey: ClassKey | null
  subclassKey: string | null
}

function selectionsOf(preset: PresetSheet | null): PartialSelections {
  return preset === null
    ? { race: null, classKey: null, subclassKey: null }
    : { race: preset.race, classKey: preset.classKey, subclassKey: preset.subclassKey }
}

function changed(chosen: PartialSelections, against: PresetSheet | null): boolean {
  const saved = selectionsOf(against)
  return (
    chosen.race !== saved.race ||
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
 */
function candidateOf(chosen: PartialSelections, level: number): PresetSheet | null {
  if (chosen.race === null || chosen.classKey === null) return null
  return {
    kind: 'preset',
    race: chosen.race,
    classKey: chosen.classKey,
    subclassKey: level >= SUBCLASS_LEVEL ? chosen.subclassKey : null,
    level,
    locked: true,
  }
}
