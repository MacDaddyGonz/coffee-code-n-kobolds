import { useId, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'

import { FieldError } from '@/components/FieldError'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_CHARACTER_NAME_LENGTH } from '@convex/lib/codes'
import { MAX_TOKEN_SQUARES, MIN_TOKEN_SQUARES, isUsableTokenSize } from '@convex/lib/grid'
import type { PublicScene } from '@convex/lib/scenes'
import { ImagePicker, useImageUpload } from './SceneUploadDialog'

export type TokenAddDialogProps = {
  code: string
  dmCode: string
  scene: PublicScene
}

type Layer = 'player' | 'dm'

/** A default that is legible on a map without being either team's colour. */
const DEFAULT_TINT = '#8b5cf6'

const SELECT_CLASS =
  'border-input h-8 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30'

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
 */
export function TokenAddDialog({ code, dmCode, scene }: TokenAddDialogProps) {
  const addToken = useMutation(api.board.addToken)
  const characters = useQuery(api.characters.list, { code })
  const upload = useImageUpload({ code, dmCode, kind: 'token' })
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [layer, setLayer] = useState<Layer>('player')
  const [size, setSize] = useState('1')
  const [tint, setTint] = useState(DEFAULT_TINT)
  const [characterId, setCharacterId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setLayer('player')
      setSize('1')
      setTint(DEFAULT_TINT)
      setCharacterId('')
      setError(null)
      upload.reset()
    }
  }

  const sizeSquares = size.trim() === '' ? Number.NaN : Number(size)
  const busy = saving || upload.stage !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)

    // Dropped in the middle of the map, because that is the one place guaranteed to
    // be on it. The server snaps this to a square on the way in, so the token is on
    // the grid from the moment it exists rather than from its first drag.
    const base = {
      code,
      dmCode,
      sceneId: scene._id,
      name,
      layer,
      sizeSquares,
      tint,
      characterId: characterId === '' ? undefined : (characterId as Id<'characters'>),
      x: scene.imageWidth / 2,
      y: scene.imageHeight / 2,
    }

    setSaving(true)
    try {
      // Only the art path needs the discard-on-refusal dance, so a token with no
      // art never generates an upload URL at all.
      if (upload.prepared) {
        await upload.commit((image) => addToken({ ...base, imageId: image.imageId }))
      } else {
        await addToken(base)
      }
    } catch (thrown) {
      setError(errorMessage(thrown, 'Could not add that token.'))
      return
    } finally {
      setSaving(false)
    }
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
            disabled={saving}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-character`}>Character (optional)</Label>
            <select
              id={`${fieldId}-character`}
              className={SELECT_CLASS}
              value={characterId}
              disabled={busy}
              onChange={(event) => setCharacterId(event.target.value)}
            >
              <option value="">Nobody — an NPC</option>
              {(characters ?? []).map((character) => (
                <option key={character._id} value={character._id}>
                  {character.name}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              Attaching a character is what lets the player holding it move this token. Table
              manners rather than a lock — see ADR 0004 — but it is what stops a misclick.
            </p>
          </div>

          <FieldError message={error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || name.trim() === '' || !isUsableTokenSize(sizeSquares)}
            >
              {upload.stage === 'uploading' ? 'Uploading…' : 'Add the token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
