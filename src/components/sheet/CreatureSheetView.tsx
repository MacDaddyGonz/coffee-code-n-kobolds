import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import { Minus, Plus, RotateCcw } from 'lucide-react'

import { FieldError } from '@/components/FieldError'
import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import type { PublicCreature } from '@/components/sheet/CreatureStatBlock'
import { CreatureStatBlock } from '@/components/sheet/CreatureStatBlock'
import { OverrideMark, OverrideNumberField, merge } from '@/components/sheet/PresetNumbers'
import { SheetEntryList } from '@/components/sheet/SheetEntryList'
import {
  SheetField,
  SheetTextArea,
  marksField,
  signed,
} from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { ChallengeRating } from '@convex/lib/creatures'
import { crLabel, findRole, stepCr } from '@convex/lib/creatures'
import { NPC_ACTIONS } from '@convex/lib/rules'
import type { BestiaryOverrides, BestiarySheet, NpcSheet, SheetProblem } from '@convex/lib/sheet'
import {
  MAX_NPC_NOTES_LENGTH,
  attackBonusOf,
  messageAtField,
  passivePerceptionOf,
  saveDcOf,
  speedOf,
  withoutUndefined,
} from '@convex/lib/sheet'
import { SKILLS } from '@convex/lib/skills'

export type CreatureSheetViewProps = {
  /** The draft. Only the overrides on it are edited here; the rating is `onSetCr`'s. */
  draft: BestiarySheet
  /** Which creature this is, at what rating, and everything about it that is words. */
  creature: PublicCreature
  /**
   * The resolved sheet with the draft's overrides laid over it, by the same
   * `withCreatureOverrides` the server finishes resolution with — see
   * `CharacterSheetEditor`. Three layers: the bestiary entry, the CR scale, then this.
   */
  resolved: NpcSheet
  problem: SheetProblem | null
  /** Whether this browser holds the DM code. Decides what is offered, never what is permitted. */
  isDm: boolean
  /** The game, and the code `bestiary.entry` re-verifies before it will hand over a stat block. */
  code: string
  dmCode: string | null
  disabled?: boolean
  onChange: (sheet: BestiarySheet) => void
  onSetCr: (cr: ChallengeRating) => void
  onReset: () => void
}

/**
 * A creature taken off the shelf: which one it is, what rating it is running at, and the
 * parts of it the DM has changed.
 *
 * **The same arrangement as a library character's Build pane and for the same reasons**,
 * one corpus over.
 * The numbers are read live out of the bestiary every time the document is resolved, so a
 * box the DM could type an armour class into would be a box the next CR shift silently
 * discards; the only edit that survives resolution is an *override*, which is what the
 * panel below offers. Nothing here is a form somebody fills in — it is a stat block with
 * three handles on it.
 *
 * ⚠️ **There is a third resolution layer here that a hero does not have, and the whole
 * design of this screen is about not letting it be silent.** A creature is the entry, then
 * the CR scale, then the overrides — and both of the first two are invisible in the
 * resolved sheet that arrives. So the banner says the shift out loud (`CR 3 → 5`) and
 * counts the pinned fields beside it, because the failure this prevents is specific and
 * likely: an override survives a shift by design, so a DM who bumped a boss's hit points
 * last week and steps the rating tonight watches hit points *not move* and reasonably
 * concludes the stepper is broken. Saying "two fields pinned" is the cheapest possible fix
 * for that, and there is no version of this panel where leaving it out is defensible.
 *
 * *View original* is the same problem in its other form. It used to mean one thing and now
 * means two — the entry at its own rating, and the entry at tonight's rating without the
 * DM's changes — so both are offered and **whichever is on screen says which it is.** That
 * ambiguity is the one genuine cost of the extra layer, and an unlabelled comparison panel
 * is worse than no comparison panel.
 *
 * A social NPC with no combat block gets **no statline and no control to invent one** —
 * here or in the comparison panel, both of which read the server's `hasCombat`. See
 * `NoStatline`.
 */
export function CreatureSheetView({
  draft,
  creature,
  resolved,
  problem,
  isDm,
  code,
  dmCode,
  disabled,
  onChange,
  onSetCr,
  onReset,
}: CreatureSheetViewProps) {
  const fieldId = useId()
  const [comparing, setComparing] = useState<Comparison>('off')

  const overrides = draft.overrides
  const setOverrides = (next: BestiaryOverrides | undefined) => {
    // `withoutUndefined` rather than `overrides: next`, for the reason `merge` in
    // PresetNumbers.tsx gives at length: `undefined` is not a Convex value, so a document
    // naming the field and giving it that is a different write from one omitting it, and
    // the dirty check downstream serialises both sides.
    onChange(withoutUndefined({ ...draft, overrides: next }))
  }
  const set = (patch: Partial<BestiaryOverrides>) => setOverrides(merge(overrides, patch))

  const shifted = draft.cr !== creature.libraryCr

  // The bestiary's own copy, fetched only while somebody is looking at it — a comparison
  // nobody asked for is 130 stat blocks' worth of server work per open sheet. The rating
  // is the whole point of the two buttons: `library` is the entry as it is written, and
  // `current` is that entry scaled to tonight's rating with none of the DM's changes.
  const originalCr = comparing === 'library' ? creature.libraryCr : draft.cr
  const original = useQuery(
    api.bestiary.entry,
    comparing === 'off' || dmCode === null
      ? 'skip'
      : { code, dmCode, key: creature.entryKey, cr: originalCr },
  )

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg border p-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            {/* The name from the bestiary rather than the character's own, which the DM
                may well have changed to "the innkeeper" — this line is about which entry
                the sheet is reading, and the character's name is already in the header
                above it.

                **Already a heading, and deliberately a smaller one than that header.**
                The character's name at the top of the panel is the answer to "whose sheet
                am I looking at" and now reads as the panel's title; this is the answer to
                "and where are its numbers coming from", which is a section of that sheet
                rather than a rival title for it. So it stays at the `text-sm` weight
                every other `<h3>` in this file uses. Nothing here is an editable name, so
                there is no captioned-field problem to fix — the one that had it is
                `CharacterSheetEditor`. */}
            <h3 className="font-heading text-sm font-medium">
              {creature.name}{' '}
              <span className="text-muted-foreground font-normal tabular-nums">
                {shifted
                  ? `· CR ${crLabel(creature.libraryCr)} → ${crLabel(draft.cr)}`
                  : `· CR ${crLabel(draft.cr)}`}
              </span>
              {creature.overriddenFields.length > 0 ? (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {pinned(creature.overriddenFields.length)}
                </span>
              ) : null}
            </h3>
            <p className="text-muted-foreground text-xs">
              {shifted
                ? // Said here rather than only in the header, because this is the sentence
                  // that stops the pinned count reading as a warning about nothing.
                  'Scaled from the bestiary’s own rating. Anything you have pinned below stayed where you put it.'
                : 'Read live from the bestiary. Step the rating to scale every number at once.'}
            </p>
          </div>

          <CrStepper cr={draft.cr} isDm={isDm} busy={disabled} onSetCr={onSetCr} />
        </header>

        {isDm ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant={comparing === 'library' ? 'default' : 'outline'}
              aria-pressed={comparing === 'library'}
              disabled={disabled}
              onClick={() => setComparing(comparing === 'library' ? 'off' : 'library')}
            >
              {shifted ? `Original at CR ${crLabel(creature.libraryCr)}` : 'View original'}
            </Button>

            {/* Offered only when the two differ. Unshifted, "at tonight's rating" and "at
                its own rating" are the same request, and two buttons for one answer is a
                DM wondering what the difference is. */}
            {shifted ? (
              <Button
                type="button"
                size="xs"
                variant={comparing === 'current' ? 'default' : 'outline'}
                aria-pressed={comparing === 'current'}
                disabled={disabled}
                onClick={() => setComparing(comparing === 'current' ? 'off' : 'current')}
              >
                Original at CR {crLabel(draft.cr)}
              </Button>
            ) : null}

            <ConfirmDialog
              trigger={
                <Button type="button" size="xs" variant="ghost" disabled={disabled}>
                  <RotateCcw />
                  Reset to the bestiary
                </Button>
              }
              title={`Put the bestiary’s ${creature.name} back?`}
              description={
                `The rating goes back to CR ${crLabel(creature.libraryCr)}` +
                (creature.overriddenFields.length > 0
                  ? ` and every one of your ${creature.overriddenFields.length} pinned ` +
                    'field is discarded. Anything you typed over the bestiary — hit points, ' +
                    'armour class, notes — is gone, and there is no undo.'
                  : '. Nothing else on this sheet is pinned, so nothing else changes.')
              }
              confirmLabel="Reset the creature"
              busy={disabled}
              onConfirm={onReset}
            />
          </div>
        ) : null}
      </section>

      {comparing === 'off' ? null : (
        <section className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex min-w-0 flex-col">
            <h3 className="font-heading text-sm font-medium">
              {/* **Which of the two is on screen, in words, every time.** The one thing a
                  comparison panel must never do is leave a reader guessing which column
                  they are looking at. */}
              {comparing === 'library'
                ? `The bestiary’s ${creature.name}, at its own CR ${crLabel(creature.libraryCr)}`
                : `The bestiary’s ${creature.name}, scaled to CR ${crLabel(draft.cr)}`}
            </h3>
            <p className="text-muted-foreground text-xs">
              {comparing === 'library'
                ? 'The entry exactly as it is written, with neither the scale nor your changes applied.'
                : 'Tonight’s rating, with none of your changes applied.'}
            </p>
          </div>

          {original === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : original === null ? (
            <p className="text-muted-foreground text-xs">
              The bestiary has no entry under that key any more. The sheet above still
              works — it is the numbers the last resolution produced.
            </p>
          ) : creature.hasCombat ? (
            // The same component the sheet below draws, which is most of what makes *View
            // original* worth having: two grids assembled separately would eventually
            // disagree about which fields exist or how a missing one reads, and a
            // comparison whose rows do not line up with the sheet's is one nobody can make.
            // No labels, because they are the same creature's and are printed once, above.
            <CreatureStatBlock sheet={original.sheet} labels={null} />
          ) : (
            // The same answer the sheet below gives, from the same boolean. This drew the
            // grid unconditionally and so filled an innkeeper's comparison with the very
            // stand-in figures the panel underneath deliberately refuses to print.
            <NoStatline />
          )}
        </section>
      )}

      <Separator />

      {creature.hasCombat ? (
        <>
          <CreatureStatBlock sheet={resolved} labels={creature} />

          {isDm ? (
            <CreatureOverrides
              sheet={resolved}
              idPrefix={fieldId}
              overrides={overrides}
              problem={problem}
              disabled={disabled}
              onChange={set}
            />
          ) : null}

          <Separator />

          <SheetEntryList
            title="Attacks and abilities"
            // The one attack bonus, above the list rather than on each row — `attackLine`
            // carries the reasoning.
            description={attackLine(resolved)}
            noun="action"
            entries={resolved.actions}
            catalogue={NPC_ACTIONS}
            path="actions"
            problem={problem}
            readOnly
          />
        </>
      ) : (
        // No statline, and **no control to make one.** See the header note.
        <NoStatline />
      )}

      <Separator />

      <CreatureLabels creature={creature} />

      {/* Editable, unlike every other line above it, and the difference is what each one
          is for: the loot and the blurb are sentences the bestiary wrote *about* the
          creature, whereas the notes are where tonight's plan goes. A hand-built monster
          has always had this box, and a creature from the shelf losing it would be the
          shelf costing the DM something they had.

          Printed rather than greyed out for anybody without the code — a disabled textarea
          reads as "you may not edit this yet", which invites somebody to go looking for the
          permission that would unlock it. `DerivedStat` carries the full argument. */}
      {isDm ? (
        <>
          <SheetField
            id={`${fieldId}-notes`}
            label="Notes"
            hint={
              <OverrideMark
                overridden={overrides?.notes !== undefined}
                disabled={disabled}
                onReset={() => set({ notes: undefined })}
                source="bestiary"
              />
            }
          >
            <SheetTextArea
              id={`${fieldId}-notes`}
              value={resolved.notes}
              maxLength={MAX_NPC_NOTES_LENGTH}
              aria-invalid={problem?.path === 'notes' || undefined}
              disabled={disabled}
              rows={4}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </SheetField>
          <FieldError message={messageAtField(problem, 'notes')} />
        </>
      ) : resolved.notes ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">Notes</span>
          <p className="text-xs whitespace-pre-line">{resolved.notes}</p>
        </div>
      ) : null}

      {creature.social ? <CreatureSocial social={creature.social} /> : null}
    </div>
  )
}

/** Which of the two originals is on screen, if either. See the header note. */
type Comparison = 'off' | 'library' | 'current'

/**
 * What the panel says for a creature whose bestiary entry has been retired.
 *
 * **This branch is the difference between a sentence and a blank panel**, which is the
 * failure the bestiary sheet was added to fix in the first place. `characters.sheet` sends
 * `creature: null` when the stored key names nothing in the corpus — deliberately, and the
 * read-tolerant half of `requireUsableSheet`'s asymmetry is why the character still resolves
 * at all — so there is no rating to step, no entry to compare against and no labels to
 * print. Without something here the panel would fall through every branch to nothing, above
 * a live Save button.
 *
 * The character is still perfectly usable, and that is what this says: the name, the hit
 * points and the health bar on the board are all on other documents, and only the numbers it
 * was *borrowing* are gone. `resolveBestiary` stands the defaults in for them rather than
 * throwing, because a content bug that threw would blank the party panel for the whole table.
 */
export function CreatureEntryMissing({ entryKey }: { entryKey: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
      <h3 className="font-heading text-sm font-medium">
        This creature is no longer on the shelf
      </h3>
      <p className="text-muted-foreground text-xs">
        The bestiary has no entry under <span className="font-mono">{entryKey}</span> any more,
        so there is nothing to scale and nothing to compare against. The character itself is
        fine — its name, its hit points and its token all still work — and it is running on
        stand-in numbers rather than the ones it was borrowing. Add a fresh creature from the
        shelf if you want a stat block back.
      </p>
    </div>
  )
}

/**
 * What stands where the statline would be for a creature that is not written to fight.
 *
 * **One component because two places ask the question**, and they are the two places that
 * had come apart. The sheet reads `creature.hasCombat` and the *comparison* panel used to
 * read nothing at all, so an innkeeper's "View original" drew a grid of the stand-in
 * armour class, hit points and initiative that `npcSheetValidator` requires of every
 * resolved sheet — precisely the numbers the panel below it refuses to show. Both now read
 * the one boolean the server sends, and both print this when it is false.
 *
 * Not a disabled grid and not a row of blanks: an innkeeper does not have an armour class
 * the DM is being kept from, and a greyed-out box reads as a permission rather than an
 * absence. `DerivedStat` carries the full argument.
 */
function NoStatline() {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
      This one is not written to fight. There is no stat block, which is the entry being
      what it is rather than something missing from it.
    </p>
  )
}

/**
 * `Attacks · +7 to hit`, and what follows it.
 *
 * The bonus goes **once, above the list**, because that is what the sheet stores: one
 * number for the whole creature rather than one per attack — see the note on
 * `npcSheetValidator`. Printing `+7` on every row would be inventing a per-attack figure
 * and then repeating it three times, and it is the shape a reader would then expect to be
 * able to edit one of.
 */
function attackLine(sheet: NpcSheet): string {
  const bonus = attackBonusOf(sheet)
  const lead = bonus === null ? '' : `Attacks · ${signed(bonus)} to hit. `
  return `${lead}What it does on its turn, read live from the bestiary at this rating.`
}

/** `2 fields pinned`, and `1 field pinned`. */
function pinned(count: number): string {
  return `${count} ${count === 1 ? 'field' : 'fields'} pinned`
}

/**
 * The DM's thumb on a creature's seven numbers — **the handles only, because the numbers
 * themselves are now `CreatureStatBlock`'s.**
 *
 * ⚠️ **This used to be one component with two modes and the split is the point.** It drew
 * the printed statline when it had no `onChange` and the override boxes when it did, which
 * was right while a creature's whole sheet *was* those seven numbers. It is not any more: a
 * stat block prints ability scores, a save column and a skill list beside them, none of
 * which is overridable, and none of which a comparison panel or a hand-typed creature's form
 * should have had to go through an override component to show. So the reading half moved to
 * the block every creature draws, and what is left here is the seven boxes and their marks.
 *
 * Three of the seven can be genuinely absent — `attackBonusOf`, `saveDcOf` and
 * `passivePerceptionOf` return null rather than a number, and `NumberInput` shows `NaN` as
 * an empty box. That is the truth for a creature nobody recorded one for, and it is why
 * emptying one of those boxes drops the override rather than storing a `NaN`: clearing a
 * field to mean *"go back to what it was"* is the same thing the reset mark does, so it does
 * the same thing. `PresetNumbers` takes this stance for `speed` and gives the reasoning;
 * here it applies to most of the grid.
 *
 * Driven from `STATLINE_FIELDS`, which is where the reasoning for the table lives.
 */
function CreatureOverrides({
  sheet,
  idPrefix,
  overrides,
  problem,
  disabled,
  onChange,
}: {
  sheet: NpcSheet
  /** `useId` upstream, because two statlines can be on screen at once. */
  idPrefix: string
  overrides: BestiaryOverrides | undefined
  problem: SheetProblem | null
  disabled?: boolean
  onChange: (patch: Partial<BestiaryOverrides>) => void
}) {
  // Absent stays absent when the box is emptied: `NaN` is a perfectly valid float64 and
  // would poison every comparison made against it afterwards.
  const finite = (value: number) => (Number.isFinite(value) ? value : undefined)

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col">
        <h3 className="font-heading text-sm font-medium">Your changes to this creature</h3>
        <p className="text-muted-foreground text-xs">
          Anything you set here wins over the bestiary and stays put when you step the
          rating. Everything else scales with it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {STATLINE_FIELDS.map((field) => (
          <OverrideNumberField
            key={field.key}
            id={`${idPrefix}-${field.id}`}
            label={field.label}
            value={field.read(sheet)}
            overridden={overrides?.[field.key] !== undefined}
            invalid={marksField(problem, field.key)}
            disabled={disabled}
            source="bestiary"
            onChange={(next) => onChange(patchOf(field.key, finite(next)))}
            onReset={() => onChange(patchOf(field.key, undefined))}
          />
        ))}
      </div>

      {/* The same seven paths, taken from the table rather than listed again. Written out
          by hand this was an eighth place a key had to be spelled correctly, and the only
          one whose being wrong showed up as a message that silently never appeared. */}
      <FieldError
        message={messageAtField(problem, ...STATLINE_FIELDS.map((field) => field.key))}
      />
    </section>
  )
}

/**
 * The override keys that hold a number, derived from the override set itself rather than
 * listed, so a field that stops being a number stops compiling here.
 */
type NumberOverride = {
  [K in keyof BestiaryOverrides]-?: NonNullable<BestiaryOverrides[K]> extends number ? K : never
}[keyof BestiaryOverrides]

type StatlineField = {
  /** The override key. Named **once**, which is the whole point of this table. */
  key: NumberOverride
  /** The element id's suffix, since two statlines can be on screen at once. */
  id: string
  label: string
  /** Null for a number the entry never recorded. `NumberInput` draws that as empty. */
  read: (sheet: NpcSheet) => number | null
}

/**
 * A creature's seven overridable numbers, in the order they are drawn.
 *
 * ⚠️ **The reason this is a table and not seven blocks of JSX is that each block named
 * its override key three times** — in the mark's test, in the reset patch and in the
 * change patch — plus twice more for the element ids and once again in the error path's
 * hand-written list, with nothing anywhere checking that the six agreed. Pairing the
 * save-DC key with the passive-perception row compiled, rendered, and reset the wrong
 * field. Every one of those readings now comes off one row.
 *
 * `read` rather than a key into the sheet, because three of the seven are not fields of
 * it: `attackBonusOf`, `saveDcOf` and `passivePerceptionOf` are the accessors, and they
 * return null rather than a number for a creature nobody recorded one for.
 *
 * The *printed* form of this grid stays longhand — see the note where it is drawn.
 */
const STATLINE_FIELDS: readonly StatlineField[] = [
  { key: 'armourClass', id: 'ac', label: 'Armour class', read: (sheet) => sheet.armourClass },
  { key: 'maxHp', id: 'max-hp', label: 'Hit points', read: (sheet) => sheet.maxHp },
  { key: 'attackBonus', id: 'attack', label: 'Attack bonus', read: attackBonusOf },
  {
    key: 'initiativeBonus',
    id: 'initiative',
    label: 'Initiative bonus',
    read: (sheet) => sheet.initiativeBonus,
  },
  {
    key: 'passivePerception',
    id: 'passive',
    label: 'Passive Perception',
    read: passivePerceptionOf,
  },
  { key: 'saveDc', id: 'save-dc', label: 'Save DC', read: saveDcOf },
  { key: 'speed', id: 'speed', label: 'Speed (feet)', read: speedOf },
]

/**
 * One override, as a patch — `undefined` being how a field is put back to the bestiary's.
 *
 * A function rather than an inline `{ [key]: value }` only so that the computed key is
 * checked against `NumberOverride` at the one place it is written.
 */
function patchOf(key: NumberOverride, value: number | undefined): Partial<BestiaryOverrides> {
  return { [key]: value }
}

/**
 * What the creature *is*, as opposed to what it can do — **the half of it that is not on
 * the stat block.**
 *
 * ⚠️ **The type, the size, the challenge rating, the tier, the role and the tags moved to
 * `CreatureStatBlock` and must not come back here.** They are the block's opening line, the
 * way an SRD entry prints *Large Dragon, chaotic evil* under the name — and having them in
 * two components meant a hand-typed creature's panel, which never had one, silently showed
 * none of them while the bestiary's showed all of them twice over once the block arrived.
 * What is left is the material a DM reads *around* a fight rather than during one.
 *
 * Printed rather than offered, all of it, and that is not an omission: these are the
 * bestiary's description of the creature, and changing one here would mean the sheet
 * disagreeing with the shelf it came off. A DM who wants a different creature picks one.
 *
 * The recommended party levels are stored and read by nothing else — there is no encounter
 * budgeting and none is being built — so this is the one place they surface, which is
 * exactly the point of having written them down.
 */
function CreatureLabels({ creature }: { creature: PublicCreature }) {
  const role = findRole(creature.role)

  return (
    <section className="flex flex-col gap-2">
      {role ? <p className="text-muted-foreground text-xs">{role.blurb}</p> : null}

      <div className="flex flex-col gap-1.5 text-xs">
        <p>
          <span className="text-muted-foreground">Suits a party of </span>
          {creature.recommendedPartyLevelMin === creature.recommendedPartyLevelMax
            ? `level ${creature.recommendedPartyLevelMin}`
            : `levels ${creature.recommendedPartyLevelMin}–${creature.recommendedPartyLevelMax}`}
        </p>
        {/* A line of text, and it reads as one. Nothing counts it, nothing manages it and
            there is no inventory for it to go into — requirements.md excludes those, and a
            premade hero's equipment kit is the same shape for the same reason. */}
        {creature.loot ? (
          <p>
            <span className="text-muted-foreground">It is carrying </span>
            {creature.loot}
          </p>
        ) : null}
        {creature.blurb ? <p className="text-muted-foreground">{creature.blurb}</p> : null}
      </div>
    </section>
  )
}

/**
 * The social block: who they are, what they are like, and what they know.
 *
 * **DM-only in its entirety and for a sharper reason than a statline** — what the innkeeper
 * knows *is* the plot. It needs no guard of its own: it rides on the character document and
 * goes through `maySeeCharacter` with everything else, so it never reaches a player's
 * browser to be hidden in the first place.
 *
 * The three personality keywords are badges rather than a sentence because that is what
 * they are for. A DM glances at `gruff · loyal · thirsty` a second before speaking, which
 * is not a thing a paragraph supports.
 */
function CreatureSocial({ social }: { social: NonNullable<PublicCreature['social']> }) {
  const skills = social.usefulSkills
    .map((key) => SKILLS.find((skill) => skill.key === key)?.name ?? key)
    .join(', ')

  return (
    <>
      <Separator />
      <section className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-heading text-sm font-medium">Playing them</h3>
          <p className="text-muted-foreground text-xs">{social.occupation}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {social.personality.map((trait) => (
            <Badge key={trait} variant="secondary">
              {trait}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 text-xs">
          {skills ? (
            <p>
              <span className="text-muted-foreground">Worth asking with </span>
              {skills}
            </p>
          ) : null}
          <p>
            <span className="text-muted-foreground">They know </span>
            {social.knows}
          </p>
          {social.questHooks ? (
            <p>
              <span className="text-muted-foreground">Hook </span>
              {social.questHooks}
            </p>
          ) : null}
        </div>
      </section>
    </>
  )
}

/**
 * The challenge rating, shown to everybody and stepped only by the DM.
 *
 * Not part of the draft and not part of Save: `characters.setCreatureCr` is its own
 * mutation and this writes through it straight away, for the reason `LevelControl` gives
 * about a level. A rating is a decision about the encounter rather than an edit to a form,
 * and the party is usually standing on the creature by the time it is made.
 *
 * Bounded by `stepCr` at both ends rather than by an arithmetic comparison, and the
 * difference is the whole reason that function exists: the ten ratings are not evenly
 * spaced, so `cr + 1` moves a CR ⅛ creature to a rating the bestiary has no benchmark row
 * for. Asking `stepCr` where it would land and comparing that to where it is now is also
 * how the two buttons know they are at an end — one source of truth for the clamp instead
 * of a copy of the bounds here.
 *
 * **Exported because the bestiary picker steps a rating too**, and had grown its own copy
 * of all of the above — down to the two `aria-label`s and the width of the readout — with
 * only this one carrying the note about the clamp. The picker's genuine difference is that
 * it steps a rating for a creature *not yet chosen*, so `cr` is nullable: null prints `—`
 * and puts both buttons out of reach, since there is nothing to make easier yet.
 */
export function CrStepper({
  cr,
  isDm,
  busy,
  onSetCr,
}: {
  /** Null before anything is selected — the picker's case. Prints `—`. */
  cr: ChallengeRating | null
  isDm: boolean
  busy?: boolean
  onSetCr: (cr: ChallengeRating) => void
}) {
  const label = cr === null ? '—' : crLabel(cr)

  if (!isDm) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs font-medium">CR</span>
        <span className="font-heading text-base leading-none font-medium tabular-nums">
          {label}
        </span>
      </div>
    )
  }

  const down = cr === null ? null : stepCr(cr, -1)
  const up = cr === null ? null : stepCr(cr, 1)

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">CR</span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label="Make it easier"
        disabled={busy || down === null || down === cr}
        onClick={() => down !== null && onSetCr(down)}
      >
        <Minus />
      </Button>
      <span className="font-heading w-6 text-center text-base leading-none font-medium tabular-nums">
        {label}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label="Make it harder"
        disabled={busy || up === null || up === cr}
        onClick={() => up !== null && onSetCr(up)}
      >
        <Plus />
      </Button>
    </div>
  )
}
