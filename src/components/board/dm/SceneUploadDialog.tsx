import { useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { UploadPicker } from '@/components/UploadPicker'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
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
import { useUpload } from '@/hooks/useUpload'
import { nameFromFile } from '@/lib/images'
import { api } from '@convex/_generated/api'
import { MAX_SCENE_NAME_LENGTH } from '@convex/lib/codes'

export type SceneUploadDialogProps = {
  code: string
  dmCode: string
}

/**
 * Turn an image on the DM's disk into a board.
 *
 * Three steps, in this order and no other: shrink, store, then ask the server to
 * accept the stored blob as a scene. The last step can refuse — a full game, or
 * a blob still over the limit — and `useUpload.commit` discards the file
 * when it does.
 *
 * The refusal is reported in the form rather than as a toast, because this dialog
 * stays open on failure with the name and the file still in it: a message that
 * fades while the DM is reading the field it was about is the wrong shape. That is
 * what `report: 'field'` on `useLobbyAction` is for — one pending-and-error
 * mechanism across every DM control rather than a hand-rolled second one here.
 */
export function SceneUploadDialog({ code, dmCode }: SceneUploadDialogProps) {
  const createScene = useMutation(api.scenes.create)
  const upload = useUpload({ code, dmCode, kind: 'map' })
  const action = useLobbyAction()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      action.clearError()
      upload.reset()
    }
  }

  function choose(file: File | null) {
    upload.choose(file)
    // Only fills a name the DM has not typed over, so re-picking a file after
    // renaming the scene does not silently undo the rename.
    if (file && name.trim() === '') setName(nameFromFile(file.name))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!upload.prepared) return

    const done = await action.run(
      'create',
      'Could not add that map.',
      () =>
        upload.commit((image) =>
          createScene({
            code,
            dmCode,
            name,
            imageId: image.imageId,
            // `?? undefined` rather than passing the null through: the argument is
            // `v.optional`, and Convex's optional means *absent* rather than *null*.
            // `useUpload` spells "this kind has none" as null because a union is the only
            // way to tell it apart from a failure; the wire spells it by omission.
            thumbnailId: image.thumbnailId ?? undefined,
            imageWidth: image.width,
            imageHeight: image.height,
          }),
        ),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    toast.success(`${name.trim()} is ready. Check the grid lines up.`)
  }

  const busy = action.pending !== null || upload.stage !== null

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add a map</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a map</DialogTitle>
          <DialogDescription>
            The image is shrunk to 2560 px on its long edge in this browser before it is uploaded,
            so a 20 MB map costs the game a megabyte or two. Your original file is untouched.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <UploadPicker
            id={`${fieldId}-file`}
            label="Map image"
            upload={upload}
            onChoose={choose}
            hint="A battle map, a floor plan, a photo of a whiteboard — anything you can play on."
            disabled={action.pending !== null}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-name`}>Scene name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_SCENE_NAME_LENGTH}
              autoComplete="off"
              placeholder="The Farmer's Hall"
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              Only you ever see this. Scene names are DM-only, because a list with{' '}
              <span className="font-medium">Dragon's Lair</span> in it tells the table what is
              coming.
            </p>
          </div>

          <FieldError message={action.error} />

          <DialogFormFooter
            busy={busy}
            canSubmit={upload.prepared !== null && name.trim() !== ''}
            submitLabel={upload.stage === 'uploading' ? 'Uploading…' : 'Add the map'}
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
