import { useCallback, useId, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { FieldError } from '@/components/FieldError'
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
import type { Downscaled } from '@/lib/images'
import { MAX_SCENE_BYTES, downscaleMap, downscaleToken, formatBytes } from '@/lib/images'
import { cn } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_SCENE_NAME_LENGTH } from '@convex/lib/codes'

/** What `commit` hands the mutation: the stored blob and the size it was stored at. */
export type StoredImage = { imageId: Id<'_storage'>; width: number; height: number }

export type ImageUpload = {
  /** The downscaled blob waiting to be stored, or null when nothing is chosen. */
  prepared: Downscaled | null
  /** The chosen file's own name, for the before-and-after line. */
  fileName: string | null
  /** What is in flight — shrinking the file, or sending it. */
  stage: 'preparing' | 'uploading' | null
  /** A problem with the file itself, ready for <FieldError>. */
  error: string | null
  /** Take a file from the picker and start shrinking it. Null clears the choice. */
  choose: (file: File | null) => void
  reset: () => void
  /**
   * Store the prepared blob and hand its id to `create`.
   *
   * If `create` rejects, the blob is discarded before the rejection is re-thrown.
   * That belongs here rather than in each caller because it cannot be skipped
   * from here: a mutation is a transaction, so `scenes.create` and
   * `board.addToken` cannot delete the file they just refused — the delete rolls
   * back with the throw. `files.discard` is the only call that can, and a caller
   * that forgot it would leak a full map against the 1 GB free tier every time
   * (CLAUDE.md invariant 6).
   */
  commit: <T>(create: (image: StoredImage) => Promise<T>) => Promise<T>
}

/**
 * Choosing a file, shrinking it, and getting it into Convex file storage —
 * shared by the map upload below and by the token dialog's optional art.
 *
 * Downscaling happens here, before the network, which is what makes invariant 6
 * a thing the DM watches happen rather than a promise in a comment: the sample
 * map `farmershall_1stfloor.png` is 21.2 MB and leaves as roughly 1.4 MB. The
 * server checks the stored blob's size again, and that check is the real one —
 * this only saves the DM an upload they were going to be refused for.
 */
export function useImageUpload(args: {
  code: string
  dmCode: string
  kind: 'map' | 'token'
}): ImageUpload {
  const { code, dmCode, kind } = args
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const discard = useMutation(api.files.discard)

  const [prepared, setPrepared] = useState<Downscaled | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [stage, setStage] = useState<'preparing' | 'uploading' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Only the most recent choice may write to state. Decoding a 23 megapixel map
  // takes long enough that a DM who picks the wrong file and immediately picks
  // the right one would otherwise watch the first one's result land on top of
  // the second's.
  const latest = useRef(0)

  const reset = useCallback(() => {
    latest.current += 1
    setPrepared(null)
    setFileName(null)
    setStage(null)
    setError(null)
  }, [])

  const choose = useCallback(
    (file: File | null) => {
      const mine = (latest.current += 1)
      setPrepared(null)
      setError(null)
      setFileName(file?.name ?? null)
      if (!file) {
        setStage(null)
        return
      }

      setStage('preparing')
      void (async () => {
        try {
          const downscaled = kind === 'map' ? await downscaleMap(file) : await downscaleToken(file)
          if (latest.current !== mine) return
          // Refused before the upload rather than after it. The server refuses the
          // same blob, so spending the bytes first would only make the failure slower.
          if (downscaled.bytes > MAX_SCENE_BYTES) {
            setError(
              `That is still ${formatBytes(downscaled.bytes)} once shrunk, and the limit is ${formatBytes(MAX_SCENE_BYTES)}. Try a smaller image.`,
            )
            return
          }
          setPrepared(downscaled)
        } catch (thrown) {
          if (latest.current !== mine) return
          // Not a ConvexError — nothing has reached the server yet — so the message
          // comes from images.ts, which says what actually went wrong with the file.
          setError(
            thrown instanceof Error ? thrown.message : 'That file could not be read as an image.',
          )
        } finally {
          if (latest.current === mine) setStage(null)
        }
      })()
    },
    [kind],
  )

  const commit = useCallback(
    async <T,>(create: (image: StoredImage) => Promise<T>): Promise<T> => {
      if (!prepared) throw new Error('Choose an image first.')
      setStage('uploading')
      try {
        const url = await generateUploadUrl({ code, dmCode })
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': prepared.blob.type },
          body: prepared.blob,
        })
        if (!response.ok) throw new Error('The upload did not go through. Try again.')
        const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }

        try {
          return await create({
            imageId: storageId,
            width: prepared.width,
            height: prepared.height,
          })
        } catch (thrown) {
          // Best effort, and deliberately swallowed: a failure to tidy up must not
          // replace the refusal the DM actually needs to read.
          try {
            await discard({ code, dmCode, imageId: storageId })
          } catch {
            // Nothing to say. The blob outlives us; the real error matters more.
          }
          throw thrown
        }
      } finally {
        setStage(null)
      }
    },
    [code, discard, dmCode, generateUploadUrl, prepared],
  )

  return { prepared, fileName, stage, error, choose, reset, commit }
}

export type ImagePickerProps = {
  id: string
  label: string
  upload: ImageUpload
  /** Extra line under the field, for what this particular image is for. */
  hint?: string
  /** Defaults to `upload.choose`; override to do something else with the file too. */
  onChoose?: (file: File | null) => void
  disabled?: boolean
  className?: string
}

/**
 * A file field that reports what the downscaler saved — "21.2 MB → 1.4 MB".
 *
 * The saving is on screen because it is the one place a DM can see invariant 6
 * being kept, and because a 21 MB source takes a visible moment to decode: with
 * nothing to read, the pause looks like a hung dialog rather than work.
 */
export function ImagePicker({
  id,
  label,
  upload,
  hint,
  onChoose,
  disabled = false,
  className,
}: ImagePickerProps) {
  const { prepared, fileName, stage, error } = upload
  const choose = onChoose ?? upload.choose

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept="image/*"
        disabled={disabled || stage !== null}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

      {stage === 'preparing' ? (
        <p className="text-muted-foreground text-xs">Shrinking {fileName ?? 'the image'}…</p>
      ) : stage === 'uploading' ? (
        <p className="text-muted-foreground text-xs">Uploading…</p>
      ) : prepared ? (
        <p className="text-xs tabular-nums">
          <span className="text-muted-foreground">{fileName} — </span>
          {formatBytes(prepared.originalBytes)} → {formatBytes(prepared.bytes)}
          <span className="text-muted-foreground">
            {' '}
            · {prepared.width} × {prepared.height}
          </span>
        </p>
      ) : null}

      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

export type SceneUploadDialogProps = {
  code: string
  dmCode: string
}

/** Filenames carry the useful part of a map's name — `Admittance [Gridded 16x12].jpg`. */
function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '').slice(0, MAX_SCENE_NAME_LENGTH)
}

/**
 * Turn an image on the DM's disk into a board.
 *
 * Three steps, in this order and no other: shrink, store, then ask the server to
 * accept the stored blob as a scene. The last step can refuse — a full game, or
 * a blob still over the limit — and `useImageUpload.commit` discards the file
 * when it does.
 */
export function SceneUploadDialog({ code, dmCode }: SceneUploadDialogProps) {
  const createScene = useMutation(api.scenes.create)
  const upload = useImageUpload({ code, dmCode, kind: 'map' })
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setError(null)
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
    if (saving || !upload.prepared) return
    setError(null)
    setSaving(true)
    try {
      await upload.commit((image) =>
        createScene({
          code,
          dmCode,
          name,
          imageId: image.imageId,
          imageWidth: image.width,
          imageHeight: image.height,
        }),
      )
    } catch (thrown) {
      setError(errorMessage(thrown, 'Could not add that map.'))
      return
    } finally {
      setSaving(false)
    }
    changeOpen(false)
    toast.success(`${name.trim()} is ready. Check the grid lines up.`)
  }

  const busy = saving || upload.stage !== null

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
          <ImagePicker
            id={`${fieldId}-file`}
            label="Map image"
            upload={upload}
            onChoose={choose}
            hint="A battle map, a floor plan, a photo of a whiteboard — anything you can play on."
            disabled={saving}
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
            <Button type="submit" disabled={busy || upload.prepared === null || name.trim() === ''}>
              {upload.stage === 'uploading' ? 'Uploading…' : 'Add the map'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
