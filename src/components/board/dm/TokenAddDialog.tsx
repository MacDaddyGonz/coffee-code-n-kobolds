import type { ReactNode } from 'react'
import { useId, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { UploadPicker } from '@/components/UploadPicker'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { tokensArgs } from '@/hooks/useBoard'
import { useBoardLayers } from '@/hooks/useBoardLayers'
import { useUpload } from '@/hooks/useUpload'
import { parseNumber } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'
import type { TokenLayer } from '@convex/lib/layers'
import { maySeeLayer } from '@convex/lib/layers'
import { MAX_DUPLICATE_COUNT } from '@convex/lib/limits'
import { duplicateNames, duplicateNamesProblem } from '@convex/lib/names'
import type { PublicScene } from '@convex/lib/scenes'
import { crLabel } from '@convex/lib/creatures'
import type { CreatureChoice } from './BestiaryPicker'
import { BestiaryPicker } from './BestiaryPicker'
import {
  CreatureSheetFields,
  creatureSheetFrom,
  creatureStatsProblem,
  defaultCreatureStats,
} from './CreatureSheetFields'
import { LAYER_ALERT_TITLES, LayerChoice } from './LayerChoice'
import type { TokenAppearanceDraft } from './TokenAppearanceFields'
import { TokenAppearanceFields, isUsableAppearance } from './TokenAppearanceFields'
// The preview sentence, shared with the duplicate dialog rather than written twice — see
// the ⚠️ on `CopyNamesPreview`. One naming rule, one summary of a run.
import { CopyNamesPreview } from './TokenDuplicateDialog'

export type TokenAddDialogProps = {
  code: string
  dmCode: string
  scene: PublicScene
}

/** A default that is legible on a map without being either team's colour. */
const DEFAULT_TINT = '#8b5cf6'

/**
 * What the three appearance fields start at, and what closing the dialog puts them back to.
 *
 * A constant rather than three initialisers, so *reset* and *initial* cannot disagree — the
 * failure that shape prevents is a dialog that opens purple the first time and grey the
 * second.
 */
const EMPTY_APPEARANCE: TokenAppearanceDraft = { name: '', size: '1', tint: DEFAULT_TINT }

/**
 * The character select's third and fourth answers: make a sheet for this token as it is
 * added, either by typing two numbers or by taking a creature off the bestiary shelf.
 *
 * Sentinels in the same `<select>` rather than a separate mode switch, because "who is
 * this?" has exactly one answer and four shapes of it — nobody, somebody who exists,
 * somebody who does not yet, and something on the shelf. A select value is a string, so
 * these are compared *before* the value is ever treated as an id; the empty string keeps
 * its existing meaning of nothing attached. The leading underscores are not decoration:
 * a Convex id is base-32-ish and can never collide with either.
 */
const NEW_CREATURE = '__new-creature'
const FROM_BESTIARY = '__from-bestiary'

/**
 * What each layer means, **in this screen's words**, under the picker. Exhaustive by
 * construction — see CLAUDE.md invariant 9.
 *
 * ⚠️ **Per screen on purpose, and keyed by the union all the same.** The titles are one
 * fact and live beside the union in `LayerChoice`; these bodies are sentences about *this*
 * control — every one of them is about a mistake to catch **before saving**, where the
 * editor's are about a press that can be undone — which is the carve-out convex/lib/sheet.ts
 * already makes for a per-screen sentence. Centralising them would produce copy that fits
 * neither screen.
 */
const LAYER_NOTES: Record<TokenLayer, ReactNode> = {
  background: (
    <Alert>
      <AlertTitle>{LAYER_ALERT_TITLES.background}</AlertTitle>
      <AlertDescription>
        Scenery — a barricade, a brazier, a bloodstain. It is drawn on every screen at the
        table, and you are the only person who can drag it. So a creature put here by mistake
        is one the party can see and its own player cannot move, which reads as the app being
        broken rather than as a rule.
      </AlertDescription>
    </Alert>
  ),
  player: (
    <p className="text-muted-foreground text-xs">
      Drawn on every screen at the table, and movable by whoever is playing the character it is
      bound to.
    </p>
  ),
  gm: (
    <Alert variant="destructive">
      <AlertTitle>{LAYER_ALERT_TITLES.gm}</AlertTitle>
      <AlertDescription>
        A GM-layer token is absent from every player's data, not merely undrawn — so an
        ambush survives a player who reads the network tab. The cost of the same setting
        chosen by mistake is a character nobody at the table can see or move, so check it
        before you save.
      </AlertDescription>
    </Alert>
  ),
}

/**
 * Put a creature on the board.
 *
 * The layer is the only field here that decides anything about secrecy, so it is
 * the only one given a whole paragraph and a colour: everything else is cosmetic
 * and can be fixed later, whereas a hero accidentally created on the GM layer is
 * invisible to the person playing it, an ambush created on the player layer is
 * spoiled the instant it exists, and a creature left on Background is one the party
 * can see and its own player cannot drag. Each of those is one click from the right
 * answer, so the choices say what happens rather than naming a layer.
 *
 * Art is optional. A token with none is drawn as a coloured coin with the name's
 * initials, which is enough to play with and saves an upload per goblin.
 *
 * ⚠️ **The count makes this *add five of these*, and it is the same act
 * `TokenDuplicateDialog` performs from the other end** — one press, N coins, named by one
 * browser-shared function so the preview under the field and the write are the same code.
 * What it does **not** do is give each coin a sheet: the art is one blob and the character
 * is one document, both shared by the whole batch, because attaching a *named* creature to
 * five coins is the DM asking for five coins of that creature. Duplicate is where a copy
 * gets a sheet of its own, and the sentence under the field says so at the moment the
 * distinction starts to matter.
 *
 * So is a character, and that stays a real choice rather than an oversight: a token
 * with no character attached has no health bar, cannot be moved by anybody but the
 * DM, and is exactly the right thing for a barrel, a door marker or a crowd of
 * villagers nobody is going to hit. Only creatures that take damage need a sheet.
 *
 * When one does, the bestiary is reachable from here as well as from the Sheets tab, and
 * that is not duplication of the shelf but of the *route to it*: a DM who is halfway through
 * adding a coin and realises it needs a stat block should not have to abandon the layer, the
 * size and the art they have already set to go and fetch one. `CreatureSheetFields` makes
 * the same argument for the hand-built form — and it is what carries the NPC-or-monster
 * question into this dialog, so a creature built here is filed the same way as one built
 * from the Sheets tab rather than landing under NPCs whatever it is.
 */
export function TokenAddDialog({ code, dmCode, scene }: TokenAddDialogProps) {
  const addToken = useMutation(api.board.addToken)
  const createCharacter = useMutation(api.characters.create)
  // With the DM code, so the DM's creatures are in the list. Without it `characters.list`
  // answers with the player characters alone — a creature's *existence* is the spoiler,
  // which is why the filtering is the query's job and not a `.filter()` here.
  const characters = useQuery(api.characters.list, { code, dmCode })
  // ⚠️ **Every coin's name in the game, for the preview alone — and it costs no server
  // execution.** `tokensArgs(code, dmCode)` is the exact cache entry `RightPane` is already
  // holding for the Tokens tab while this dialog is open, so this is one more reader of an
  // existing socket rather than a second subscription: Convex keys a query by its arguments,
  // which is why the args are built by the shared function instead of spelled out here. It
  // has to be the DM's entry in any case — the numbering counts a name on the GM layer, and
  // a run that skipped the coins a player cannot see would collide with them.
  const tokens = useQuery(api.board.tokens, tokensArgs(code, dmCode))
  const upload = useUpload({ code, dmCode, kind: 'token' })
  const action = useLobbyAction()
  const fieldId = useId()

  // ⚠️ **The layer is a tool the DM sets, not a field of this form**, which is why it is
  // the one control here that comes from a hook rather than from local state. A DM laying
  // out a room places a dozen pieces of scenery in a row, and a dialog that reset to the
  // player layer on every close would make each of them a two-press job with a spoiled
  // ambush waiting for the press that is forgotten. It is shared with the picker in the
  // panel behind this dialog and remembered per game — see `useBoardLayers`.
  const { active: layer, setActive: setLayer } = useBoardLayers(code)

  const [open, setOpen] = useState(false)
  // One piece of state for the three cosmetic fields, because `TokenAppearanceFields` is
  // absolute over all three — and because a name, a size and a colour are one appearance,
  // which is the shape `board.updateToken` writes them in too.
  const [appearance, setAppearance] = useState<TokenAppearanceDraft>(EMPTY_APPEARANCE)
  // A **string** for the same reason the size is one — see `TokenAppearanceDraft`. Its own
  // piece of state rather than a fourth member of the appearance draft: how many coins to
  // make is not a fact about a coin, `board.updateToken` has nothing to do with it, and the
  // editor's copy of that form must never grow a count field.
  const [howMany, setHowMany] = useState('1')
  const [characterId, setCharacterId] = useState('')
  const [creatureName, setCreatureName] = useState('')
  const [creatureStats, setCreatureStats] = useState(defaultCreatureStats)
  const [creature, setCreature] = useState<CreatureChoice | null>(null)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setAppearance(EMPTY_APPEARANCE)
      // The layer is deliberately absent from this reset — see the note on `useBoardLayers`
      // above. Everything else here is a fact about one coin and goes back to nothing.
      //
      // The count included, and it is worth saying why it is not the layer's kind of
      // setting: laying out scenery is a run of presses on one layer, whereas five goblins
      // is one press about one encounter, and a dialog that reopened asking for five more of
      // whatever is typed next is a DM who has to notice a number they did not set.
      setHowMany('1')
      setCharacterId('')
      setCreatureName('')
      setCreatureStats(defaultCreatureStats())
      setCreature(null)
      action.clearError()
      upload.reset()
    }
  }

  // Taken apart once, because five things below name the coin and two send its size. The
  // draft above is what the fields write to; these are what the mutation and the copy read.
  const { name, tint } = appearance
  const sizeSquares = parseNumber(appearance.size)
  const count = parseNumber(howMany)
  const usableCount = Number.isInteger(count) && count >= 1 && count <= MAX_DUPLICATE_COUNT
  const makingCreature = characterId === NEW_CREATURE
  const fromBestiary = characterId === FROM_BESTIARY
  // Any of the select's three attaching answers. All of them produce **one** character on
  // **N** coins — see the sentence under the field — so the warning is about the select
  // having an answer at all rather than about which one it is.
  const attaching = characterId !== ''

  // The names the batch will take, from the one function `board.addToken` writes with:
  // `duplicateNames(what the DM typed, every name in the game, the count)`. Undefined names
  // means the subscription has not landed, which `CopyNamesPreview` prints as *not known
  // yet* rather than as a run starting from 1 — see the ⚠️ there.
  const existingNames = useMemo(() => tokens?.map((row) => row.name), [tokens])
  const names = useMemo(
    () => duplicateNames(name, existingNames ?? [], count),
    [name, existingNames, count],
  )
  // The server's own refusal, so the dialog offers exactly the batch the mutation takes.
  // Only asked once the names are real: a run computed from an empty board can be shorter
  // than the one that will be written, and refusing on that is a dialog that says no to
  // something it has not seen.
  const nameProblem = existingNames === undefined ? null : duplicateNamesProblem(names)
  // Only asked of the fields that are on screen. A blank armour class in a section
  // nobody opened is not a reason to refuse a barrel.
  const creatureProblem = makingCreature ? creatureStatsProblem(creatureStats) : null
  const busy = action.pending !== null || upload.stage !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const done = await action.run(
      'add',
      'Could not add that token.',
      async () => {
        // Two transactions, unavoidably: `board.addToken` takes a character id, so
        // the character has to exist before the token can point at it. The failure
        // that leaves is honest and small — a refused token (an oversize image, a
        // full game) can leave a sheet behind with nothing standing on it, and the
        // Sheets tab deletes it in two clicks. The alternative is a combined
        // mutation that knows about both tables, which buys atomicity for two
        // paths in four and couples the board's writes to the character editor's.
        //
        // **The bestiary path keeps that ordering rather than adding a third shape**,
        // which is why `BestiaryPicker` is asked to *report* a choice here instead of
        // creating the creature itself: the character is still written first, from this
        // one call, and a DM who changes their mind about the token leaves nothing
        // behind. The picker creating eagerly would have left a creature per cancelled
        // dialog.
        //
        // Four cases, one per line, and the select's value decides between them: a sheet
        // to be written from the shelf, a sheet to be written from two typed numbers, an
        // existing character to point at, or nothing at all. This was a three-deep ternary
        // that evaluated `fromBestiary && creature !== null` twice and disagreed with
        // itself about what the second `fromBestiary` was for.
        const chosenCreature = fromBestiary ? creature : null

        let attachTo: Id<'characters'> | undefined
        if (chosenCreature !== null || makingCreature) {
          const created = await createCharacter({
            code,
            dmCode,
            // The token's own name unless the DM typed a different one — a coin reading
            // `Goblin archer` over a sheet called something else is a confusion nobody
            // asked for. It holds for a creature off the shelf too, and buys something
            // extra there: three goblins from one entry want three names, and the sheet
            // still says which entry it is reading in its own banner.
            name: creatureName.trim() === '' ? name : creatureName,
            // A hand-built creature carries the NPC-or-monster answer the fields below
            // asked for; a linked one needs none, because `groupOf` reads it off the
            // corpus category of the entry the sheet points at.
            sheet:
              chosenCreature === null
                ? creatureSheetFrom(creatureStats)
                : { kind: 'bestiary', entryKey: chosenCreature.entryKey, cr: chosenCreature.cr },
          })
          attachTo = created.characterId
        } else if (characterId !== '' && !fromBestiary) {
          // A real id, which is the only value of the select that is one — the two
          // sentinels are compared before this and the empty string means nothing
          // attached.
          attachTo = characterId as Id<'characters'>
        }

        // Dropped in the middle of the map, because that is the one place guaranteed
        // to be on it. The server snaps this to a square on the way in, so the token
        // is on the grid from the moment it exists rather than from its first drag.
        const base = {
          code,
          dmCode,
          sceneId: scene._id,
          name,
          layer,
          sizeSquares,
          tint,
          characterId: attachTo,
          x: scene.imageWidth / 2,
          y: scene.imageHeight / 2,
          // ⚠️ **One character on N coins, and that is the server's behaviour rather than a
          // shortcut this dialog takes.** The creature branches above still create exactly
          // one sheet, because attaching a *named* creature to five coins is the DM asking
          // for five coins of that creature — and `board.duplicateToken` is where a copy
          // gets a sheet of its own. The upload is one blob shared by all N for the same
          // reason: five goblins with five copies of one picture is storage spent against
          // the 1 GB ceiling for nothing (invariant 6), and the delete paths already ask
          // whether a blob is some *other* token's art.
          count,
        }

        // Only the art path needs the discard-on-refusal dance, so a token with no
        // art never generates an upload URL at all.
        return upload.prepared
          ? await upload.commit((image) => addToken({ ...base, imageId: image.imageId }))
          : await addToken(base)
      },
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    // ⚠️ **A batch is counted and not named, and the asymmetry with `TokenDuplicateDialog`
    // is deliberate.** That one names the copies because `board.duplicateToken` reports what
    // it wrote; `board.addToken` answers with ids, so the only names available here are the
    // preview's — computed from this browser's `board.tokens` subscription, which can be a
    // frame behind the transaction. Naming five coins from it is the one place this dialog
    // could print a name the server did not write, and a count is true whatever the numbers
    // came out as.
    const subject = count > 1 ? `${count} coins are` : `${name.trim()} is`
    // The shared predicate again rather than a layer literal: what makes the second sentence
    // worth saying is that the coin was withheld, and that is the question `maySeeLayer`
    // answers. Scenery lands with the ordinary wording, which is true of it — everybody can
    // see it, and only the DM can move it, which the picker has just said in as many words.
    toast.success(
      maySeeLayer(layer)
        ? `${subject} on the map.`
        : `${subject} on your layer. Nobody else can see ${count > 1 ? 'them' : 'it'}.`,
    )
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add a token
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a token to {scene.name}</DialogTitle>
          <DialogDescription>
            It lands in the middle of the map, on a square. Drag it where it belongs.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          {/* The name, the size and the colour, shared with the editor — see that
              component for why they are one thing and not six inputs. The layer picker
              goes in its slot, so *who can see it* still sits between the name and the
              numbers: it is the only field here that decides anything about secrecy, and
              its place in the reading order is part of saying so. */}
          <TokenAppearanceFields
            draft={appearance}
            onChange={setAppearance}
            disabled={busy}
            namePlaceholder="Goblin archer"
          >
            <div className="flex flex-col gap-2">
              <Label>Who can see it</Label>
              <LayerChoice layer={layer} onChange={setLayer} disabled={busy} />
              {/* The titles are shared and these bodies are not — see the ⚠️ on
                  `LAYER_NOTES` and the one on `LAYER_ALERT_TITLES` next door. */}
              {LAYER_NOTES[layer]}
            </div>
          </TokenAppearanceFields>

          {/* Directly under the three appearance fields, because *how many* is a question
              about the name above it: the preview is the answer, and it moves on every
              keystroke in either field. Above the art and the character on purpose — both of
              those are shared by the whole batch, and a DM who reads the count first reads
              the two sentences about sharing in the right order. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-count`}>How many</Label>
            <Input
              id={`${fieldId}-count`}
              type="number"
              min={1}
              max={MAX_DUPLICATE_COUNT}
              step={1}
              value={howMany}
              onChange={(event) => setHowMany(event.target.value)}
              className="tabular-nums"
              disabled={busy}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">
              Up to {MAX_DUPLICATE_COUNT} at a time, each on an empty square of its own.
            </p>

            <CopyNamesPreview names={existingNames === undefined ? null : names} />

            {/* ⚠️ Said on screen because it is the one thing about a batch that is not
                obvious and is expensive to discover: the five coins share the creature, so
                the second one to take damage moves the same health bar as the first. It is
                the correct behaviour — attaching a *named* creature to five coins is the DM
                asking for five coins of that creature — and the route to the other reading
                is named in the same breath, because a DM who wanted five goblins wants
                Duplicate and has no way to know that from here. */}
            {usableCount && count > 1 && attaching ? (
              <p className="text-muted-foreground text-xs">
                All {count} coins will stand for the{' '}
                <span className="text-foreground font-medium">same creature</span> and share its
                hit points. Use <span className="text-foreground font-medium">Duplicate</span> on
                a coin to give each its own sheet.
              </p>
            ) : null}
          </div>

          <UploadPicker
            id={`${fieldId}-art`}
            label="Art (optional)"
            upload={upload}
            hint="Shrunk to 256 px here before uploading. Leave it empty for a coloured coin with initials."
            disabled={action.pending !== null}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-character`}>Character (optional)</Label>
            <NativeSelect
              id={`${fieldId}-character`}
              className="w-full"
              value={characterId}
              disabled={busy}
              onChange={(event) => setCharacterId(event.target.value)}
            >
              <option value="">Nothing — no sheet, no health bar</option>
              <option value={NEW_CREATURE}>New creature sheet…</option>
              <option value={FROM_BESTIARY}>From the bestiary…</option>
              {/* Grouped, because the two are chosen for different reasons: a hero is
                  picked so its player can move the coin, a creature so the DM can hit it.
                  Both lists come from one query — and the creatures are in it only
                  because that query was given a DM code it verified.

                  **One heading for the creatures rather than the selector's two**, and
                  the filter is still `kind` rather than `group`. `kind` is the field that
                  says a row is the DM's at all, which is the only question this select
                  asks; splitting NPCs from monsters is a *reading* aid for a list of
                  every sheet in the game, and here it would be two headings over what is
                  usually three goblins. */}
              <optgroup label="Player characters">
                {(characters ?? [])
                  .filter((character) => character.kind === 'pc')
                  .map((character) => (
                    <option key={character._id} value={character._id}>
                      {character.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Creatures">
                {(characters ?? [])
                  .filter((character) => character.kind === 'npc')
                  .map((character) => (
                    <option key={character._id} value={character._id}>
                      {character.name}
                    </option>
                  ))}
              </optgroup>
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              A character gives the token a health bar, and lets the player holding it move the
              coin. Table manners rather than a lock — see ADR 0004 — but it is what stops a
              misclick. Leave it as nothing for scenery and for a crowd nobody is going to hit.
            </p>
          </div>

          {makingCreature ? (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-creature-sheet-name`}>Creature name</Label>
                <Input
                  id={`${fieldId}-creature-sheet-name`}
                  value={creatureName}
                  onChange={(event) => setCreatureName(event.target.value)}
                  maxLength={MAX_CHARACTER_NAME_LENGTH}
                  autoComplete="off"
                  placeholder={name.trim() === '' ? 'Same as the token' : name}
                  disabled={busy}
                />
              </div>
              <CreatureSheetFields
                stats={creatureStats}
                onChange={setCreatureStats}
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                The sheet is yours alone. Players are sent a word for this creature's health —
                healthy, bloodied, badly hurt, down — and never the numbers.
              </p>
            </div>
          ) : null}

          {/* The coin and the creature in one flow, which is what a DM is actually doing when
              the party opens the door. The picker is asked to report a choice rather than
              create one — see the ordering note in `submit` — so nothing exists until this
              form is submitted and cancelling here leaves nothing behind.

              A dialog inside a dialog, which is unusual enough to be worth naming: both are
              Radix portals, so the picker sits over this one and hands focus back on close.
              The alternative was a mode switch that replaced this form, which would have
              thrown away the layer, the size and the art the DM had already set. */}
          {fromBestiary ? (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              {creature === null ? (
                <p className="text-muted-foreground text-xs">
                  Nothing chosen yet. The shelf is filtered by difficulty tier, by what a
                  creature does in a fight, and by search.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{creature.name}</span>
                    <Badge variant="secondary" className="tabular-nums">
                      CR {crLabel(creature.cr)}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Its sheet stays linked to the bestiary, so the rating is a control on it
                    rather than a number somebody typed.
                  </span>
                </div>
              )}

              <BestiaryPicker
                code={code}
                dmCode={dmCode}
                trigger={
                  <Button type="button" size="sm" variant="outline" disabled={busy}>
                    {creature === null ? 'Choose a creature' : 'Choose a different one'}
                  </Button>
                }
                onPick={(choice) => {
                  setCreature(choice)
                  // The token's name filled in from the creature, but only while it is still
                  // empty — a DM who has already typed `Guard #3` meant it, and three coins
                  // from one entry wanting three names is the normal case rather than the
                  // exception.
                  setAppearance((was) =>
                    was.name.trim() === '' ? { ...was, name: choice.name } : was,
                  )
                }}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-shelf-sheet-name`}>Sheet name (optional)</Label>
                <Input
                  id={`${fieldId}-shelf-sheet-name`}
                  value={creatureName}
                  onChange={(event) => setCreatureName(event.target.value)}
                  maxLength={MAX_CHARACTER_NAME_LENGTH}
                  autoComplete="off"
                  placeholder={name.trim() === '' ? 'Same as the token' : name}
                  disabled={busy}
                />
              </div>
            </div>
          ) : null}

          <FieldError message={action.error ?? creatureProblem ?? nameProblem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={
              // The shared predicate, so *what the server will accept* is asked in one
              // place for both the dialog and the editor.
              isUsableAppearance(appearance) &&
              // The count the mutation refuses past, from the constant the mutation reads.
              usableCount &&
              // And the numbering it refuses rather than truncates — `duplicateNamesProblem`
              // is the same function `requireBatchNames` throws with.
              nameProblem === null &&
              creatureProblem === null &&
              // A shelf entry chosen, when the shelf is the answer. Refused rather than
              // silently adding a coin with no sheet, which is what the select's own empty
              // option is for and is not what was asked for here.
              (!fromBestiary || creature !== null)
            }
            // The count, so the button says what the press does. A DM who typed 5 into a
            // field above a button reading *Add the coin* has been given two answers.
            submitLabel={
              upload.stage === 'uploading'
                ? 'Uploading…'
                : usableCount && count > 1
                  ? `Add ${count} coins`
                  : 'Add the coin'
            }
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
