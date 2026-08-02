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
import { formatBytes, nameFromFile } from '@/lib/images'
import { api } from '@convex/_generated/api'
import { MAX_SCENE_NAME_LENGTH } from '@convex/lib/codes'
import { MAX_MUSIC_BYTES } from '@convex/lib/limits'

export type TrackUploadDialogProps = {
  code: string
  dmCode: string
}

/**
 * Turn an audio file on the DM's disk into a track this game can put on.
 *
 * `SceneUploadDialog`'s three steps minus the first: store, then ask the server to accept
 * the stored blob. ⚠️ **There is no shrink step and there cannot be one** — no browser can
 * usefully re-encode audio — so the size line under the field reads the same number twice
 * and the ceiling is the whole of what this dialog can enforce before spending the upload.
 * The server checks the stored blob and *that* check is the real one, which is true of
 * every upload in this application and is only load-bearing here. See `MAX_MUSIC_BYTES`.
 *
 * The refusal is reported in the form rather than as a toast for the reason that dialog
 * gives: this stays open on failure with the name and the file still in it, and a message
 * that fades while the DM is reading the field it was about is the wrong shape.
 */
export function TrackUploadDialog({ code, dmCode }: TrackUploadDialogProps) {
  const createTrack = useMutation(api.music.create)
  const upload = useUpload({ code, dmCode, kind: 'music' })
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
    // Only fills a name the DM has not typed over, so re-picking a file after renaming the
    // track does not silently undo the rename.
    if (file && name.trim() === '') setName(nameFromFile(file.name))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!upload.prepared) return

    const done = await action.run(
      'create',
      'Could not add that track.',
      () =>
        // `stored.imageId` onto `fileId`: the hook names its storage id after the three
        // uploads that are images, and this is the one that is not. The mapping is one line
        // here rather than a rename that would make the schema's deliberate `fileId` read
        // like a mistake.
        upload.commit((stored) => createTrack({ code, dmCode, name, fileId: stored.imageId })),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    toast.success(`${name.trim()} is ready. Put it on when you want it.`)
  }

  const busy = action.pending !== null || upload.stage !== null

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add a track</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a track</DialogTitle>
          <DialogDescription>
            Audio cannot be shrunk in a browser the way a map can, so the file is uploaded as
            it is and has to be under {formatBytes(MAX_MUSIC_BYTES)} — about ten minutes at a
            sensible bitrate, which is a loop rather than an album.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <UploadPicker
            id={`${fieldId}-file`}
            label="Audio file"
            upload={upload}
            onChoose={choose}
            hint="An ambient loop for a tavern, a dungeon, a chase — MP3, OGG or M4A."
            disabled={action.pending !== null}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-name`}>Track name</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_SCENE_NAME_LENGTH}
              autoComplete="off"
              placeholder="The Farmer's Hall, quietly"
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              Only you see this list. The name of whatever you actually put on does reach the
              table — it sits beside the play button in everybody's header, which is how they
              know there is music to turn on.
            </p>
          </div>

          <FieldError message={action.error} />

          <DialogFormFooter
            busy={busy}
            canSubmit={upload.prepared !== null && name.trim() !== ''}
            submitLabel={upload.stage === 'uploading' ? 'Uploading…' : 'Add the track'}
            onCancel={() => changeOpen(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
