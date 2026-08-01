import { useId, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { ImagePicker } from '@/components/ImagePicker'
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
import { useImageUpload } from '@/hooks/useImageUpload'
import { parseNumber } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'
import { MAX_TOKEN_SQUARES, MIN_TOKEN_SQUARES, isUsableTokenSize } from '@convex/lib/grid'
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

export type TokenAddDialogProps = {
  code: string
  dmCode: string
  scene: PublicScene
}

/**
 * Taken from the server's own token shape rather than spelled out again. This is
 * the field that decides secrecy, so a third literal of the union is the last thing
 * that should be able to drift from the one the mutation validates against.
 */
type Layer = PublicToken['layer']

/** A default that is legible on a map without being either team's colour. */
const DEFAULT_TINT = '#8b5cf6'

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
 * Put a creature on the board.
 *
 * The layer is the only field here that decides anything about secrecy, so it is
 * the only one given a whole paragraph and a colour: everything else is cosmetic
 * and can be fixed later, whereas a hero accidentally created on the DM layer is
 * invisible to the person playing it, and an ambush created on the player layer is
 * spoiled the instant it exists. Both mistakes are one click apart, so the two
 * choices say what happens rather than naming a layer.
 *
 * Art is optional. A token with none is drawn as a coloured coin with the name's
 * initials, which is enough to play with and saves an upload per goblin.
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
  const upload = useImageUpload({ code, dmCode, kind: 'token' })
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [layer, setLayer] = useState<Layer>('player')
  const [size, setSize] = useState('1')
  const [tint, setTint] = useState(DEFAULT_TINT)
  const [characterId, setCharacterId] = useState('')
  const [creatureName, setCreatureName] = useState('')
  const [creatureStats, setCreatureStats] = useState(defaultCreatureStats)
  const [creature, setCreature] = useState<CreatureChoice | null>(null)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setLayer('player')
      setSize('1')
      setTint(DEFAULT_TINT)
      setCharacterId('')
      setCreatureName('')
      setCreatureStats(defaultCreatureStats())
      setCreature(null)
      action.clearError()
      upload.reset()
    }
  }

  const sizeSquares = parseNumber(size)
  const makingCreature = characterId === NEW_CREATURE
  const fromBestiary = characterId === FROM_BESTIARY
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
    toast.success(
      layer === 'dm'
        ? `${name.trim()} is on your layer. Nobody else can see it.`
        : `${name.trim()} is on the map.`,
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
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-name`}>Name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_CHARACTER_NAME_LENGTH}
              autoComplete="off"
              placeholder="Goblin archer"
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Who can see it</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={layer === 'player' ? 'default' : 'outline'}
                aria-pressed={layer === 'player'}
                disabled={busy}
                onClick={() => setLayer('player')}
              >
                Everyone
              </Button>
              <Button
                type="button"
                variant={layer === 'dm' ? 'destructive' : 'outline'}
                aria-pressed={layer === 'dm'}
                disabled={busy}
                onClick={() => setLayer('dm')}
              >
                Only me — DM layer
              </Button>
            </div>
            {layer === 'dm' ? (
              <Alert variant="destructive">
                <AlertTitle>Nobody else will be sent this token at all</AlertTitle>
                <AlertDescription>
                  A DM-layer token is absent from every player's data, not merely undrawn — so an
                  ambush survives a player who reads the network tab. The cost of the same setting
                  chosen by mistake is a character nobody at the table can see or move, so check it
                  before you save.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-muted-foreground text-xs">
                Drawn on every screen at the table, and movable by whoever is playing the character
                it is attached to.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-size`}>Size in squares</Label>
              <Input
                id={`${fieldId}-size`}
                type="number"
                min={MIN_TOKEN_SQUARES}
                max={MAX_TOKEN_SQUARES}
                step={1}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="tabular-nums"
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                1 for a person, 2 for an ogre. Up to {MAX_TOKEN_SQUARES}.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-tint`}>Colour</Label>
              <Input
                id={`${fieldId}-tint`}
                type="color"
                value={tint}
                onChange={(event) => setTint(event.target.value)}
                className="h-8 px-1 py-1"
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                The coin's colour, and its ring when it has art.
              </p>
            </div>
          </div>

          <ImagePicker
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
                  setName((was) => (was.trim() === '' ? choice.name : was))
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

          <FieldError message={action.error ?? creatureProblem} />

          <DialogFormFooter
            busy={busy}
            canSubmit={
              name.trim() !== '' &&
              isUsableTokenSize(sizeSquares) &&
              creatureProblem === null &&
              // A shelf entry chosen, when the shelf is the answer. Refused rather than
              // silently adding a coin with no sheet, which is what the select's own empty
              // option is for and is not what was asked for here.
              (!fromBestiary || creature !== null)
            }
            submitLabel={upload.stage === 'uploading' ? 'Uploading…' : 'Add the token'}
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
