import { useEffect } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { DialogFormFooter } from '@/components/DialogFormFooter'
import { FieldError } from '@/components/FieldError'
import { UploadPicker } from '@/components/UploadPicker'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpload } from '@/hooks/useUpload'
import { api } from '@convex/_generated/api'
import type { DmScene } from '@convex/lib/scenes'

export type SceneReplaceDialogProps = {
  code: string
  dmCode: string
  /** The map being replaced, or null when the dialog is closed. */
  scene: DmScene | null
  onClose: () => void
}

/**
 * Swap the picture under a map that already has a grid, fog and coins on it.
 *
 * ⚠️ **ONE DIALOG FOR THE WHOLE LIST, NOT ONE PER ROW.** `useUpload` holds four pieces of
 * state and two `useMutation` subscriptions; mounted inside `SceneRow` it would be
 * twenty-five of each, and — the part that actually breaks — twenty-five independent
 * `stage` values, so a DM could have a 23-megapixel decode running against one row while
 * pressing the button on another. The list holds *which map is being replaced* and this is
 * mounted beside it, which is the same arrangement `ConfirmDialog`'s controlled pair exists
 * for.
 *
 * ⚠️ **`kind: 'map'` and not a fifth `UploadKind`.** A replacement is a map: it gets the
 * same 2560 px cap, the same `MAX_SCENE_BYTES` ceiling and — the reason this matters — the
 * same `derive`, so the new picture arrives with its own thumbnail. A dedicated kind would
 * be a second place to keep those four facts in step, which is precisely what `UPLOAD_SPECS`
 * was restructured to make unspellable.
 *
 * The refusals the DM will actually meet are the server's and are worth knowing before
 * pressing the button, which is why the description says both: a map of a **different
 * shape** is refused outright, and a map of the same shape at a different size moves the
 * grid, the coins and the fog with it. Neither is a message this component composes —
 * `scenes.replaceImage` words them, and `report: 'field'` puts them under the picker where
 * the file still is.
 */
export function SceneReplaceDialog({ code, dmCode, scene, onClose }: SceneReplaceDialogProps) {
  const replaceImage = useMutation(api.scenes.replaceImage)
  const upload = useUpload({ code, dmCode, kind: 'map' })
  const action = useLobbyAction()

  // Cleared when the dialog closes *or* when it reopens on a different map. Without the
  // second half, a file prepared for one map would still be sitting in the picker when the
  // DM opened this on another — and pressing the button would silently replace the wrong
  // one's image with it.
  useEffect(() => {
    upload.reset()
    action.clearError()
    // `upload` and `action` are recreated every render; keying on the scene is the whole
    // intent, and adding them would run this on every keystroke elsewhere in the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?._id])

  const busy = action.pending !== null || upload.stage !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!scene || !upload.prepared) return

    const done = await action.run(
      'replace',
      'Could not replace that map’s image.',
      () =>
        upload.commit((image) =>
          replaceImage({
            code,
            dmCode,
            sceneId: scene._id,
            imageId: image.imageId,
            thumbnailId: image.thumbnailId ?? undefined,
            imageWidth: image.width,
            imageHeight: image.height,
          }),
        ),
      { report: 'field' },
    )
    if (!done) return

    onClose()
    toast.success(`${scene.name} has a new image. Check the grid still lines up.`)
  }

  return (
    <Dialog open={scene !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace the image for {scene?.name ?? 'this map'}</DialogTitle>
          <DialogDescription>
            The grid, the fog and everywhere the coins are standing all stay, scaled to the new
            image. A map of a different shape is refused rather than squashed — add that one as a
            new map instead.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <UploadPicker
            id="scene-replace-file"
            label="New map image"
            upload={upload}
            onChoose={upload.choose}
            hint={
              scene
                ? `The current image is ${scene.imageWidth} × ${scene.imageHeight}. The same size skips the rescale entirely.`
                : undefined
            }
            disabled={action.pending !== null}
          />

          <FieldError message={action.error} />

          <DialogFormFooter
            busy={busy}
            canSubmit={upload.prepared !== null}
            submitLabel={upload.stage === 'uploading' ? 'Uploading…' : 'Replace the image'}
            onCancel={onClose}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
