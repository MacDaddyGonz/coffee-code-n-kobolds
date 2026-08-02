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
import { MODAL_MAX_EDGE } from '@/lib/images'
import { api } from '@convex/_generated/api'
import { MAX_SCENE_NAME_LENGTH, truncateCodePoints } from '@convex/lib/codes'

export type ModalImageUploadDialogProps = {
  code: string
  dmCode: string
}

/**
 * Filenames carry the useful part of a handout's name — `The Duke's Letter.png`.
 *
 * Cut by code point and not by `slice`, for the reason written out in full on
 * `SceneUploadDialog`'s copy of this: a filename with an emoji straddling the cut-off
 * yields a lone surrogate that the server's name check accepts — it is neither blank nor
 * over-length — and that a real deployment then refuses with a raw `Invalid arguments
 * provided`. `npm run test:smoke` is what finds that class of bug, because convex-test
 * cannot.
 */
function nameFromFile(fileName: string): string {
  return truncateCodePoints(fileName.replace(/\.[^./\\]+$/, ''), MAX_SCENE_NAME_LENGTH)
}

/**
 * Turn an image on the DM's disk into a handout.
 *
 * `SceneUploadDialog` in the same folder, with `kind: 'modal'` — and that is the whole
 * of the difference, because the three steps are the upload's rather than the map's:
 * shrink, store, then ask the server to accept the stored blob. The last step can refuse
 * — a game already holding twenty-five, or a blob still over `MAX_MODAL_BYTES` — and
 * `useUpload.commit` discards the file when it does, which is the one part of this no
 * caller may reinvent (CLAUDE.md invariant 6).
 *
 * The refusal is reported in the form rather than as a toast, because this dialog stays
 * open on failure with the name and the file still in it. That is what `report: 'field'`
 * on `useLobbyAction` is for.
 */
export function ModalImageUploadDialog({ code, dmCode }: ModalImageUploadDialogProps) {
  const createModalImage = useMutation(api.modalImages.create)
  const upload = useUpload({ code, dmCode, kind: 'modal' })
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
    // Only fills a name the DM has not typed over, so re-picking a file after renaming
    // the handout does not silently undo the rename.
    if (file && name.trim() === '') setName(nameFromFile(file.name))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!upload.prepared) return

    const done = await action.run(
      'create',
      'Could not add that image.',
      () =>
        upload.commit((image) =>
          createModalImage({
            code,
            dmCode,
            name,
            imageId: image.imageId,
            imageWidth: image.width,
            imageHeight: image.height,
          }),
        ),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    toast.success(`${name.trim()} is ready to show.`)
  }

  const busy = action.pending !== null || upload.stage !== null

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add an image</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an image</DialogTitle>
          <DialogDescription>
            Shrunk to {MODAL_MAX_EDGE} px on its long edge in this browser before it is
            uploaded — a full screen on a desktop monitor, which is what a handout is looked
            at on. Your original file is untouched.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <UploadPicker
            id={`${fieldId}-file`}
            label="Handout image"
            upload={upload}
            onChoose={choose}
            hint="A letter, a portrait, a symbol carved into a door — anything you want the table to see."
            disabled={action.pending !== null}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-name`}>Name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              // The server checks the same number through `requireModalImageName`, which
              // borrows the scene constant for the reason written there: the two sides
              // agreeing about the limit is what matters, not which name it is filed under.
              maxLength={MAX_SCENE_NAME_LENGTH}
              autoComplete="off"
              placeholder="The Duke's letter"
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              The list is yours alone — a handout called{' '}
              <span className="font-medium">The Duke's Real Face</span> would give the game
              away. But the name is the title on the pop-up, so the table reads it the moment
              you show it.
            </p>
          </div>

          <FieldError message={action.error} />

          <DialogFormFooter
            busy={busy}
            canSubmit={upload.prepared !== null && name.trim() !== ''}
            submitLabel={upload.stage === 'uploading' ? 'Uploading…' : 'Add the image'}
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
