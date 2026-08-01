import { useMemo, useState } from 'react'

import { FieldError } from '@/components/FieldError'
import { HpControls } from '@/components/HpControls'
import type { BuilderSelections } from '@/components/sheet/CharacterBuilder'
import { CharacterBuilder } from '@/components/sheet/CharacterBuilder'
import { CreatureSheetForm } from '@/components/sheet/CreatureSheetForm'
import { CreatureEntryMissing, CreatureSheetView } from '@/components/sheet/CreatureSheetView'
import { EditorBody, EditorFooter } from '@/components/sheet/EditorColumn'
import { HitDiceControls } from '@/components/sheet/HitDiceControls'
import { PcSheetForm } from '@/components/sheet/PcSheetForm'
import { PresetSheetView } from '@/components/sheet/PresetSheetView'
import { RestControls } from '@/components/sheet/RestControls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { PublicSheet, PublicVitals } from '@convex/lib/characters'
import { MAX_CHARACTER_NAME_LENGTH, collapseWhitespace } from '@convex/lib/codes'
import type { ChallengeRating } from '@convex/lib/creatures'
import { perRestAbilities } from '@convex/lib/races'
import type { NpcSheet, PcSheet, StoredSheet } from '@convex/lib/sheet'
import {
  normaliseStoredSheet,
  sheetProblem,
  storedSheetProblem,
  withCreatureOverrides,
  withOverrides,
  withoutUndefined,
} from '@convex/lib/sheet'

export type CharacterSheetEditorProps = {
  /** The game, for the one panel below that has a query of its own to run. */
  code: string
  /** The sheet as the server last sent it. The draft below is edited against this. */
  saved: PublicSheet
  /** What this client was told about the character's hit points. Null while loading. */
  vitals: PublicVitals | null
  /**
   * The DM code, if this browser holds one.
   *
   * It decides what is *offered* and never what is permitted: every mutation reached
   * from here re-verifies the code server-side through `requireDm` or
   * `resolveDmAccess`, and a browser that lied about this gets a panel full of controls
   * and a refusal from each one.
   *
   * The value rather than a boolean, because the creature panel has a query to run —
   * `bestiary.entry`, for *View original* — and a query takes the code rather than a
   * claim about holding one. `isDm` below is derived from it in one place; two props
   * carrying the same fact would be two places for them to disagree.
   */
  dmCode: string | null
  onAdjustHp: (delta: number) => void
  /** −1 spends a hit die, +1 hands one back. Floored and capped server-side. */
  onAdjustHitDice: (delta: number) => void
  /** Both resolve to the server's own wording, or null on success. */
  onSave: (sheet: StoredSheet) => Promise<string | null>
  onRename: (name: string) => Promise<string | null>
  /** DM only. Immediate rather than drafted — see `LevelControl`. Refusals toast. */
  onSetLevel: (level: number) => void
  onSetLocked: (locked: boolean) => void
  /**
   * The creature counterparts, and immediate for the same reason: a rating is a selection
   * like a level, not a field of a form. `onResetCreature` also throws the overrides away,
   * which is why `CreatureSheetView` puts a confirmation in front of it.
   */
  onSetCreatureCr: (cr: ChallengeRating) => void
  onResetCreature: () => void
  onSetPerRest: (key: string, spent: boolean) => void
  onLongRest: () => void
}

/**
 * The sheet, saved by one button — and, since Milestone 4, the sheet chosen by three
 * dropdowns as well.
 *
 * **There is no read-only mode, and that is a property of the query rather than an
 * omission here.** `characters.sheet` answers through `requireEditableCharacter` — the
 * same gate `characters.updateSheet` uses — so a sheet that arrived at this component
 * is one this caller may also change. Another seat's hero, and every creature the DM has
 * neither the code for nor a grant on, come back as `null` and never reach it.
 *
 * What `isDm` buys is therefore not access but *authorship*: a character built from the
 * library holds selections rather than numbers, and the rule about who may change which
 * part of one lives in `applyPresetPermissions` on the server. Everything this
 * component does with the flag is decide which controls to draw.
 *
 * ⚠️ **The draft is a `StoredSheet` and the thing it is compared against is not.**
 * `saved.sheet` is the *resolved* sheet — for a library character, the class's numbers
 * with the race applied and the DM's overrides on top; for a creature off the bestiary
 * shelf, the entry scaled to its rating with the same treatment — while `saved.preset`
 * and `saved.creature` say what the document actually holds. Only the stored form can be
 * sent back, because resolving needs the corpora, which must never reach the browser. So
 * the draft is seeded through `storedOf`, and every comparison below is between two
 * stored shapes.
 *
 * Saved explicitly rather than on every keystroke, unlike a token's position. The trade
 * is the opposite one: a drag is continuous and has to look instant, so `moveToken` is
 * throttled and optimistic; a sheet is a form somebody fills in, and writing a
 * half-typed armour class of `1` to every screen at the table on the way to `18` would
 * be worse than a button.
 *
 * Three things deliberately do *not* wait for that button — the selections behind
 * Confirm, the level, and anything on the vitals row. Each is an event rather than an
 * edit: a decision made once, a level awarded to the whole party, a rest taken. Putting
 * a Save between the decision and the six people waiting for it would be the wrong
 * shape for all three.
 */
export function CharacterSheetEditor({
  code,
  saved,
  vitals,
  dmCode,
  onAdjustHp,
  onAdjustHitDice,
  onSave,
  onRename,
  onSetLevel,
  onSetLocked,
  onSetCreatureCr,
  onResetCreature,
  onSetPerRest,
  onLongRest,
}: CharacterSheetEditorProps) {
  // What the panel *offers*, and nothing more — see the note on the prop.
  const isDm = dmCode !== null

  const [draft, setDraft] = useState<StoredSheet>(() => storedOf(saved))
  const [name, setName] = useState(saved.name)
  const [echoed, setEchoed] = useState(saved)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Normalised first and then checked, always and on both sides — the order
  // `normaliseSheet`'s own comment insists on. A class name of "  Fire  Mage " is a
  // value that needs tidying rather than a validation failure, and tidying it in the
  // shared module is what stops this form's idea of "already valid" drifting away from
  // the mutation's.
  //
  // Memoised because every one of these runs on every render, and a render here is a
  // keystroke. `normaliseStoredSheet` clones every entry on a hand-built sheet, so a
  // hero at the forty-feat, forty-spell ceiling was cloning eighty of them and
  // serialising the result several times over per character typed.
  const normalised = useMemo(() => normaliseStoredSheet(draft), [draft])

  // The library's numbers with the *draft's* overrides laid over them, which is the
  // closest a browser can get to what the server will resolve. Null for anything that is
  // not a library character, and for the impossible pairing of a preset draft against a
  // resolved sheet that is somehow a monster.
  //
  // **`withOverrides` is the server's own last stage, not a copy of it.** The browser
  // cannot re-resolve a sheet — that needs `lib/library/`, 72 stat blocks that must
  // never reach `src/` — so it has to be handed one. But only the *library lookup* is
  // server-only: overrides land on an already-resolved `PcSheet`, so the merge itself
  // touches nothing the browser does not already have, and it lives in
  // convex/lib/sheet.ts for exactly this. A hand-maintained second copy sat here until
  // the reasoning was checked, and this codebase has twice shipped a bug where a field
  // was added to a validator and one of two field-by-field rebuilds missed it.
  //
  // That buys two things. Every derived number on the panel moves as the DM types rather
  // than after a round trip, and `sheetProblem` runs over the result, so Save goes dead
  // with the same sentence `characters.updateSheet` would have thrown — which
  // `storedSheetProblem` alone cannot manage, since a preset's stored form holds no
  // armour class to be out of range.
  //
  // It stays an approximation in one direction and only while a draft is unsaved: a
  // field whose override has just been *cleared* shows the old value until the server
  // answers, because the library's own number never came over the wire. That moves a
  // field towards a value the library guarantees is in range, so it can only be
  // pessimistic about whether Save should be lit.
  const resolved: PcSheet | null = saved.sheet.kind === 'pc' ? saved.sheet : null
  const resolvedCreature: NpcSheet | null = saved.sheet.kind === 'npc' ? saved.sheet : null
  const preview = useMemo(() => {
    if (draft.kind !== 'preset' || !resolved) return null
    // The two appended lists are held back, and this is the one place the browser's
    // input genuinely differs from the server's. `withOverrides` *appends* extraFeats
    // and extraSpells rather than replacing anything — but the sheet being passed in
    // has already been through resolution once, so it is carrying the saved override's
    // entries already, and appending the draft's would show every one of them twice and
    // trip `sheetProblem`'s duplicate-id check with a sentence nobody could act on.
    // Nothing in this milestone's UI edits either list, so today the draft's are always
    // absent; this is what stops the first control that does from being a bug report.
    const { extraFeats: _feats, extraSpells: _spells, ...editable } = draft.overrides ?? {}
    return withOverrides(resolved, editable)
  }, [draft, resolved])

  // The same thing for a creature, through the counterpart function and for the identical
  // reasons — `withCreatureOverrides` is the server's own last stage, the CR scale and the
  // corpus lookup being the only server-only parts of resolution.
  //
  // `extraActions` is held back for the reason `extraFeats` is above: the sheet coming in
  // has already been resolved once, so it is carrying the saved override's actions already,
  // and appending the draft's would show every one of them twice and trip `sheetProblem`'s
  // duplicate-id check with a sentence nobody could act on.
  const creaturePreview = useMemo(() => {
    if (draft.kind !== 'bestiary' || !resolvedCreature) return null
    const { extraActions: _actions, ...editable } = draft.overrides ?? {}
    return withCreatureOverrides(resolvedCreature, editable)
  }, [draft, resolvedCreature])

  // **Two checks, mirroring `requireUsableSheet` on the server.** `storedSheetProblem`
  // covers what the document holds, which for a preset is only the four selections and for
  // a creature only the key, the rating and the override diff; the numbers either one
  // resolves to are checked separately, because neither has any until it is resolved.
  // Getting this wrong in the obvious way — checking the stored form alone — would leave
  // Save lit up for an armour class of 999 and the refusal arriving from the network
  // instead.
  //
  // At most one of the two previews is ever non-null: they are keyed on the draft's kind,
  // and the draft has one.
  const problem = useMemo(() => {
    const shown = preview ?? creaturePreview
    return storedSheetProblem(normalised) ?? (shown ? sheetProblem(shown) : null)
  }, [normalised, preview, creaturePreview])

  // Whether the draft would store identically to what the server last sent.
  //
  // Both sides are normalised before being serialised, and that is about key order
  // rather than about values: `JSON.stringify` is only a fair comparison when one
  // constructor wrote both objects, and resting a "you have unsaved changes" indicator
  // on Convex having preserved the order a document was written in is not something to
  // do. The saved side is keyed on `echoed`, which moves only when the server pushes an
  // edit — so the expensive half of this happens a handful of times a session rather
  // than on every keystroke alongside the draft.
  const draftJson = useMemo(() => JSON.stringify(normalised), [normalised])
  const savedJson = useMemo(() => JSON.stringify(normaliseStoredSheet(storedOf(echoed))), [echoed])

  const sheetDirty = draftJson !== savedJson
  const nameDirty = collapseWhitespace(name) !== echoed.name
  const dirty = sheetDirty || nameDirty
  const nameProblem = collapseWhitespace(name) === '' ? 'Give the character a name.' : null

  // Somebody else edited this character while the panel was open — the DM fixing a
  // player's armour class or awarding a level, most likely. Follow the server, but only
  // when there is nothing local to lose: overwriting half-typed edits with a push nobody
  // asked for is the way this sort of form usually goes wrong. When there *is* local
  // work, the draft stands and Save will overwrite theirs, which is the same
  // last-write-wins the rest of the app has and is the right answer for a table of
  // colleagues.
  //
  // `dirty` is read here rather than recomputed, and it is the right value to read: it
  // was worked out against `echoed`, which at this point is still the *previous*
  // payload, so it answers "has anything been typed since that one arrived" — which is
  // exactly the question.
  //
  // Adjusting state during render is React's documented alternative to an effect for
  // deriving state from a prop, and it re-renders before anything reaches the screen
  // rather than showing the stale value for a frame.
  if (echoed !== saved) {
    setEchoed(saved)
    if (!dirty) {
      setDraft(storedOf(saved))
      setName(saved.name)
    }
  }

  /**
   * The one write path, shared by Save and by the builder's Confirm.
   *
   * The name goes first because it is the cheaper failure to recover from: if the
   * rename is refused there is nothing to undo, whereas a sheet written under a name
   * that was then rejected would leave the two halves disagreeing about whether the
   * save happened at all.
   */
  const commit = async (next: StoredSheet) => {
    if (saving) return
    setSaving(true)
    setFailure(null)

    const renameRefusal = nameDirty ? await onRename(name) : null
    const refusal = renameRefusal ?? (await onSave(next))

    if (refusal === null) {
      // Adopt what was sent rather than waiting for the echo. The server stores exactly
      // these values — it runs the same normaliser — so this makes the form clean
      // immediately, and the push that arrives a moment later is then recognised as
      // "nothing local to lose" by the sync above rather than being refused as a
      // conflict with our own write.
      setDraft(next)
      setName(collapseWhitespace(name))
    }
    setFailure(refusal)
    setSaving(false)
  }

  const save = () => {
    if (problem || nameProblem || !dirty) return
    void commit(normalised)
  }

  /**
   * Committing a character's race, class and archetype, and locking them behind it.
   *
   * Written here rather than in the builder because it has to merge with whatever else
   * the draft is carrying: a DM who has typed an armour class and *then* changed the
   * class should not lose one to the other. The result goes through `withoutUndefined`
   * because a preset nobody has overridden must hold no `overrides` field at all —
   * `undefined` is not a Convex value, so naming the key and giving it that is a
   * different write from omitting it.
   *
   * The level comes from whatever the character already had — the preset's when there is
   * one, and a hand-built sheet's own level when this is the conversion from a typed
   * sheet to a library one, so a level-three hero does not silently restart at one.
   */
  const confirm = (selections: BuilderSelections) => {
    if (nameProblem) {
      setFailure(nameProblem)
      return
    }

    const built: StoredSheet = {
      kind: 'preset',
      race: selections.race,
      classKey: selections.classKey,
      subclassKey: selections.subclassKey,
      level: levelOf(draft),
      overrides: draft.kind === 'preset' ? draft.overrides : undefined,
      locked: true,
    }
    void commit(normaliseStoredSheet(withoutUndefined(built)))
  }

  /**
   * Stepping a creature's rating — **and moving the draft with it.**
   *
   * `characters.setCreatureCr` writes immediately, exactly as `setLevel` does, so the
   * document's rating changes while the panel may be holding half-typed overrides. Without
   * the local patch the draft would still be carrying the *old* rating, the sync below
   * would hold it back because there is local work to lose, and pressing Save would
   * quietly step the creature back down. That failure exists for a preset's level too and
   * is invisible there because nothing on the panel reads the level back; here the rating
   * is on screen in two places, so it is worth the one line to keep them the same number.
   */
  const setCreatureCr = (cr: ChallengeRating) => {
    setDraft((was) => (was.kind === 'bestiary' ? { ...was, cr } : was))
    onSetCreatureCr(cr)
  }

  /**
   * Putting the bestiary's own numbers back, and **handing the draft to the server to do
   * it.** What a reset produces is the server's business — it clears the overrides and the
   * shift together — so guessing at the result here would mean a draft that disagrees with
   * the answer by exactly one field, and a footer reading "unsaved changes" about a reset
   * nobody has edited since.
   *
   * Re-seeding from `echoed` is what avoids the guess: it makes the panel clean, so the
   * push that answers the reset is recognised by the sync below as "nothing local to lose"
   * and the draft is rebuilt from whatever the server actually wrote. The unsaved overrides
   * it drops are the ones being reset anyway.
   */
  const resetCreature = () => {
    setDraft(storedOf(echoed))
    onResetCreature()
  }

  /**
   * Which of the four panels this sheet gets.
   *
   * ⚠️ **A `switch` on the draft's kind rather than a chain of ternaries, and the
   * difference is a whole class of blank screen.** The chain mixed two questions — which
   * kind is this, and is its preview ready — into one condition each, so
   * `draft.kind === 'preset' && preview` could fail on its *second* half and then fall
   * through the bestiary arm, the `pc` arm and out of the bottom to `: null`. That is a
   * panel with nothing in it above a live Save button, which is exactly the failure the
   * creature arm's own comment insists must not happen, arriving one case over. Here every
   * kind owns its own not-ready state, and the `never` default means the compiler refuses a
   * fifth stored kind that nobody has written a panel for.
   *
   * Deliberately **not** a registry of view modules keyed by kind. The four take genuinely
   * different props — one takes a builder's confirm handler, one a creature's rating
   * stepper, one nothing but the draft — so a registry would buy indirection by giving up
   * the exhaustiveness check that is the point of writing it this way.
   */
  function sheetBody() {
    switch (draft.kind) {
      // The stored discriminator, untouched: `kind: 'npc'` is what every hand-built
      // creature document in every game holds, and it covers both of the DM's headings.
      // Which one a particular creature sits under is `group`, a field on the sheet that
      // `CreatureSheetForm` is the control for.
      case 'npc':
        return (
          <CreatureSheetForm sheet={draft} problem={problem} disabled={saving} onChange={setDraft} />
        )

      case 'preset':
        // The preview is the library's numbers with the draft laid over them, and it is
        // null only while `saved.sheet` is not yet the hero this preset resolves to — the
        // gap between a conversion being saved and the server's answer landing.
        return preview ? (
          <PresetSheetView
            draft={draft}
            saved={saved.preset}
            sheet={preview}
            extras={saved.extras}
            problem={problem}
            isDm={isDm}
            disabled={saving}
            onChange={setDraft}
            onConfirm={confirm}
            onSetLevel={onSetLevel}
            onSetLocked={onSetLocked}
          />
        ) : (
          <SheetBodyPending />
        )

      case 'bestiary':
        // Both halves or a sentence. `saved.creature` is null when the stored key names
        // nothing in the corpus any more, and `creaturePreview` is null only for the
        // impossible pairing of a bestiary draft against a resolved sheet that is somehow
        // a hero — so the fallback covers a retired entry rather than a state to be
        // engineered around.
        return saved.creature && creaturePreview ? (
          <CreatureSheetView
            draft={draft}
            creature={saved.creature}
            resolved={creaturePreview}
            problem={problem}
            isDm={isDm}
            code={code}
            dmCode={dmCode}
            disabled={saving}
            onChange={setDraft}
            onSetCr={setCreatureCr}
            onReset={resetCreature}
          />
        ) : (
          <CreatureEntryMissing entryKey={draft.entryKey} />
        )

      case 'pc':
        return (
          <>
            {/* The offer comes first, because for anybody making their first character
                it is the whole answer and the form below is the escape hatch. A
                hand-built sheet is still supported — a hero brought from another table,
                or one made before the library existed — so it is offered rather than
                replaced. */}
            <CharacterBuilder
              preset={null}
              level={draft.level}
              isDm={isDm}
              busy={saving}
              onConfirm={confirm}
              // There is no preset for `characters.setLevel` to act on yet, so the level
              // is the form's own field below and this shows it rather than changing it.
              onSetLevel={null}
              onSetLocked={onSetLocked}
            />
            <Separator />
            <PcSheetForm sheet={draft} problem={problem} disabled={saving} onChange={setDraft} />
          </>
        )

      default: {
        // Unreachable while the four cases above cover `StoredSheet`. If a fifth kind is
        // added this stops compiling here rather than blanking a panel at the table.
        const exhaustive: never = draft
        return exhaustive
      }
    }
  }

  return (
    <>
      <EditorBody>
        <div className="flex flex-col gap-3">
          {/* **This is the panel's title, and the question it answers is "whose sheet am
              I looking at" — the one question the whole panel exists to answer.** It used
              to be a `SheetField`, so the name read at exactly the weight of the armour
              class three rows down, and both the player's Character tab and the DM's
              Sheets tab inherited that: a list of fields with a name somewhere in it
              rather than a sheet belonging to somebody.

              ⚠️ **Do not tidy this back into a labelled field, and do not add a heading
              above one either.** The name has to appear exactly once — a heading over a
              small captioned box below it is the same string twice, two things to keep in
              step, and the shorter of the two is the one that would go stale. So the
              input keeps every bit of its behaviour and gives up only its chrome: the
              border goes transparent (rather than away, so the row does not move by a
              pixel when it is there), the fill goes, the padding shrinks to almost
              nothing, and the type becomes the `font-heading` idiom one step up from the
              `text-sm` `<h3>`s further down the sheet and one step below `GameHeader`'s
              `text-xl`.

              What it deliberately does **not** give up is the focus ring or
              `aria-invalid`. A box that reads as text and can still be typed into is only
              honest if it says so the moment you reach it with the keyboard, and an empty
              name still has to be able to turn red — `nameProblem` disables Save, and the
              field it is about is this one.

              Not a real `<h2>` wrapped round the input, either: a heading whose entire
              content is a form control is a heading with no accessible name, and it would
              trade a working label for markup that only looks more correct. The `Name`
              label therefore stays and goes `sr-only`, which is what keeps the input's
              accessible name — `LobbyRenameForm` and `BestiaryPicker`'s search box take
              the same position, for the same reason. `htmlFor` was always the part doing
              the work; the visible caption never was. */}
          <div className="flex items-center gap-2">
            <Label htmlFor="character-name" className="sr-only">
              Name
            </Label>
            <Input
              id="character-name"
              // `md:text-lg` as well as `text-lg`, because `Input`'s own class list drops
              // to `md:text-sm` at the breakpoint this app is always past.
              className="font-heading h-auto border-transparent px-1 py-0.5 text-lg font-semibold disabled:bg-transparent md:text-lg dark:bg-transparent dark:disabled:bg-transparent"
              value={name}
              maxLength={MAX_CHARACTER_NAME_LENGTH}
              aria-invalid={nameProblem !== null || undefined}
              disabled={saving}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
            {/* The *resolved* kind, because that is the one a reader means. A preset
                resolves to a hero, and a badge reading "preset" would name the storage
                form rather than the character.

                **"Creature" rather than "NPC" or "Monster", and the vagueness is
                deliberate.** `kind` has two values where the DM's headings have three,
                and the field that tells an innkeeper from an owlbear is `group`, which
                a *resolved* sheet does not carry — a linked creature is grouped by the
                corpus category of its entry, which is read on the server and never
                travels. Printing one of the two names here would therefore be a guess
                that is wrong about half the DM's shelf, and copy that guesses is worse
                than copy that does not. The control that does answer it is on the form
                below. */}
            <Badge variant={saved.sheet.kind === 'npc' ? 'secondary' : 'outline'}>
              {saved.sheet.kind === 'npc' ? 'Creature' : 'Player character'}
            </Badge>
          </div>
          <FieldError message={nameProblem} />

          {/* Hit points are not part of the sheet and are not saved with it. They live
              in `characterVitals` and are written the instant a button is pressed,
              because damage during a fight is the one number that has to be on
              everyone's screen immediately — and because keeping them out of the sheet
              document is what lets the board draw a health bar without ever reading one.
              Requirements.md asks for the controls in both places. */}
          <div className="flex flex-col gap-1">
            {/* A caption rather than a `<label for>`: the bar is a group of controls
                with their own labels, not one field to point at. */}
            <span className="text-muted-foreground text-xs font-medium">Hit points</span>
            <HpControls vitals={vitals} onAdjust={onAdjustHp} />
          </div>

          {/* Beside the hit points rather than beside the `n × d10` on the form below,
              because that is the distinction the two numbers actually have: this block
              is how the character is doing right now and is written the instant a button
              is pressed, while everything under it is what the character is and waits
              for Save. The server draws the same line — hit dice are on the vitals row
              for it.

              A creature gets nothing here, and the test is the resolved sheet's kind
              rather than a null in the payload. The reduced sheet has no hit dice to have
              spent, so there is no state to show, no permission being applied and nothing
              the creature's DM is being kept from.

              The faces come from `saved` and not from the draft: `hitDiceCount` was read
              off the stored sheet, so pairing it with a die size somebody is halfway
              through changing would print a complement that has never existed — `3/5 d12`
              while the stored sheet still says d8. */}
          {resolved ? (
            <HitDiceControls
              vitals={vitals}
              faces={resolved.hitDice.faces}
              onAdjust={onAdjustHitDice}
            />
          ) : null}
        </div>

        {/* Every player character, not only one built from the library — and the test is
            the *resolved* kind, exactly as the badge above is, because a rest is
            something a character does and not a property of how their sheet happens to
            be stored. This lived inside `PresetSheetView` and so was unreachable for a
            hand-built hero, which this milestone still supports on purpose, even though
            `characters.longRest` has always worked on any character.

            A creature gets nothing, which is the same call `HitDiceControls` makes: the
            reduced sheet has no hit dice to hand back and no race to have spent
            anything, so there is no state to show rather than a permission being
            applied.

            Which abilities a character *has* comes from their race, which this client
            looks up itself out of `lib/races.ts`; only which ones are gone has to
            travel. A hand-built sheet stores no race and so has none to spend — the
            empty list is a case `RestControls` already handles, because six of the eight
            races have nothing either and the button belongs to all of them. A band
            payload carries no spent keys, which is a state a hero's own sheet never
            reaches: a player character is exact for everybody. */}
        {resolved ? (
          <RestControls
            abilities={draft.kind === 'preset' ? perRestAbilities(draft.race) : []}
            spent={vitals?.kind === 'exact' ? vitals.spentPerRest : null}
            disabled={saving}
            onSetPerRest={onSetPerRest}
            onLongRest={onLongRest}
          />
        ) : null}

        {sheetBody()}
      </EditorBody>

      <EditorFooter>
        <span className="text-muted-foreground min-w-0 flex-1 text-xs">
          {failure ? (
            <span className="text-destructive" role="alert">
              {failure}
            </span>
          ) : dirty ? (
            'Unsaved changes.'
          ) : (
            'Everything is saved.'
          )}
        </span>
        <Button
          type="button"
          // Disabled with the *same wording* the server would have thrown, because both
          // sides call `storedSheetProblem`. The button being unavailable is a courtesy;
          // `updateSheet` re-runs the check and refuses regardless.
          disabled={saving || !dirty || problem !== null || nameProblem !== null}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save sheet'}
        </Button>
      </EditorFooter>
    </>
  )
}

/**
 * The panel while its resolved half has not arrived.
 *
 * A shape rather than nothing, because the alternative is the blank-panel-above-a-live-Save
 * failure the dispatch above exists to make unreachable. The window it covers is narrow and
 * arguably unreachable — a preset draft is only ever seeded from a payload that already
 * resolves to a hero — but "arguably unreachable" is the reasoning that produced the
 * fall-through in the first place.
 */
function SheetBodyPending() {
  return <Skeleton className="h-40 w-full" />
}

/**
 * What the document holds, as opposed to what the panel displays.
 *
 * The one place the two are told apart, so that nothing below has to remember that
 * `sheet` on a library character or a creature off the bestiary shelf is a value the
 * server assembled and cannot be sent back.
 *
 * ⚠️ **The creature case has to come first, and getting that wrong is silent.** A linked
 * creature's `preset` is null and its `sheet` is a fully resolved `NpcSheet`, so
 * `preset ?? sheet` — which is what this was — handed back a hand-built monster: pressing
 * Save would have written the scaled numbers into the document as literals, discarding the
 * entry key, the rating and the override diff, with nothing refused and no error anywhere.
 * The creature simply stopped being linked. Both the draft seed and the dirty check go
 * through here, so a wrong answer here is the whole panel's notion of "what the document
 * holds" being wrong.
 *
 * The stored sheet is *reconstructed* from the payload's `creature` block rather than sent
 * whole, because that block is also carrying a dozen fields the document does not hold —
 * the name, the tier, the loot, the social block — and a `StoredSheet` with extra keys on
 * it is a write Convex refuses.
 *
 * The two spellings of "no overrides" have to be crossed on the way through, which is the
 * fiddly half of this. On the wire the field is nullable, because a `returns:` validator
 * cannot express an absent key; on the document it is *optional*, because `undefined` is
 * not a Convex value and a document naming the key and giving it that is a different write
 * from one omitting it. So the null becomes `undefined` and then `withoutUndefined` removes
 * the key altogether — and that is not tidiness, it is what makes the dirty check below
 * byte-exact for a creature nobody has overridden.
 */
function storedOf(sheet: PublicSheet): StoredSheet {
  const creature = sheet.creature
  if (creature) {
    return withoutUndefined({
      kind: 'bestiary',
      entryKey: creature.entryKey,
      cr: creature.cr,
      overrides: creature.overrides ?? undefined,
    })
  }
  return sheet.preset ?? sheet.sheet
}

/**
 * The level to carry across when a sheet is rebuilt from the library, which two of the four
 * stored kinds do not have.
 *
 * A hand-built creature has no level and neither does a linked one, so both read as 1. That
 * is not a default standing in for a missing value — it is the answer to "what level should the hero
 * this is about to become start at", and the only sheet in the game that could be converted
 * from either is one nobody has built yet.
 */
function levelOf(sheet: StoredSheet): number {
  return sheet.kind === 'npc' || sheet.kind === 'bestiary' ? 1 : sheet.level
}
