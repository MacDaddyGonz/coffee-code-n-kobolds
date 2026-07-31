import { useCallback, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import type { Downscaled } from '@/lib/images'
import { MAX_SCENE_BYTES, downscaleMap, downscaleToken, formatBytes } from '@/lib/images'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

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
 * shared by the map upload dialog and by the token dialog's optional art.
 *
 * Its own module rather than living beside either of them: two sibling dialogs
 * reaching through one of them for the other's helper couples the pair through an
 * export path, so deleting or splitting the map dialog would break the token one
 * for no reason either file names.
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
