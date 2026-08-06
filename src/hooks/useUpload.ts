import { useCallback, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import type { Downscaled } from '@/lib/images'
import {
  downscaleMap,
  downscaleModal,
  downscaleThumbnail,
  downscaleToken,
  formatBytes,
} from '@/lib/images'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Size } from '@convex/lib/grid'
import {
  MAX_MODAL_BYTES,
  MAX_MUSIC_BYTES,
  MAX_SCENE_BYTES,
  MAX_TOKEN_BYTES,
} from '@convex/lib/limits'

/** The four things a DM can put into this game's slice of Convex file storage. */
export type UploadKind = 'map' | 'token' | 'modal' | 'music'

/** A file made ready to send: what will actually be stored, and what it cost. */
export type Prepared = {
  blob: Blob
  /**
   * The stored blob's pixel size, or **null for a kind that has none**.
   *
   * Null rather than a zero pair, because *no dimensions* and *a zero-by-zero image* are
   * different answers and only one of them is a bug. `UploadPicker` reads it to decide
   * whether to print `· W × H`, so the union is what stops a track being described as
   * nought by nought pixels of music.
   */
  dimensions: Size | null
  originalBytes: number
  bytes: number
  /**
   * A second, smaller blob to store beside the first — or **null for the three kinds that
   * have none**, which is all of them but `map`.
   *
   * ⚠️ **Produced at `choose` time and not at `commit` time**, which is the same decision
   * `prepare` already makes and for the same reason: the derivative is made from a decoded
   * image, that costs real milliseconds on a 2560 px map, and doing it during `commit`
   * would put it between the DM pressing the button and the first byte leaving. It also
   * means a browser that cannot encode one fails in the picker, where there is a field to
   * say so in, rather than half way through an upload.
   *
   * `bytes` above deliberately does **not** include it. That number is what the kind's
   * ceiling is checked against and what the picker prints as *21.2 MB → 1.4 MB*, and a
   * thumbnail is neither — it is tens of kilobytes the server checks against a ceiling of
   * its own (`MAX_THUMB_BYTES`).
   */
  derived: Blob | null
}

/**
 * Everything that differs between the four kinds, in **one record**.
 *
 * ⚠️ **This exists because the arrangement it replaces had a live bug, and the bug is the
 * argument.** `useImageUpload` took `kind: 'map' | 'token'`, chose a downscaler with a
 * ternary, and then checked the result against `MAX_SCENE_BYTES` — for *both*. The server
 * enforces `MAX_TOKEN_BYTES` on token art (`board.addToken`, and `MAX_TOKEN_BYTES` is an
 * eighth of `MAX_SCENE_BYTES`), so a DM could be told a 3 MB token was fine, spend the whole
 * upload, and read a refusal from the server about a file this hook had already approved.
 * The client and the server disagreeing about a limit is exactly what
 * `convex/lib/limits.ts` says at the top it exists to prevent, and a second `kind`-shaped
 * ternary is how the disagreement got in.
 *
 * A `Record` keyed by the union makes it **unspellable**: there is one place a kind's limit
 * is written, it sits beside that kind's `prepare`, and a fifth kind fails to compile rather
 * than quietly inheriting a map's ceiling. The numbers are imported from
 * `convex/lib/limits.ts` and never re-spelled, which is the same rule one level up.
 */
type UploadSpec = {
  /** The file field's `accept`, so the picker offers the right files to begin with. */
  accept: string
  /** The server's own ceiling for this kind. Checked here to save a doomed upload. */
  maxBytes: number
  /**
   * File in, blob to store out.
   *
   * ⚠️ **Audio has no shrink step and the signature is shaped around that rather than
   * around images.** There is no lossless-enough transcode a browser can do to a track, so
   * the music arm hands the file back untouched and only *measures* it — which is why this
   * returns `dimensions: Size | null` and not a `Downscaled`. `MAX_MUSIC_BYTES` carries the
   * long version: for audio the server's check is the whole of the enforcement, and the
   * client contributes a courtesy rather than a second defence.
   */
  prepare: (file: File) => Promise<Prepared>
  /**
   * A second blob to store beside the first, made from **the blob `prepare` produced**.
   *
   * ⚠️ **Optional, and set on the `map` arm alone — which is why it is a field on the
   * record rather than an argument to `imageSpec`.** Three of the four kinds are built by
   * that helper, so a `derive` parameter on it would be a parameter three call sites pass
   * `undefined` to and a fifth kind could inherit by copying the wrong line. Spelled once,
   * on the one arm that has one, it is a fact about maps rather than a capability of
   * uploads: a token is already 256 px and a handout is looked at whole, so neither has a
   * list of twenty-five rows to fetch.
   *
   * Fed `Prepared.blob` and never the file the DM picked. `downscaleThumbnail`'s own
   * docblock carries that argument — the original may be 23 megapixels and decoding it
   * twice is the cost the whole downscaler is written to avoid.
   */
  derive?: (blob: Blob) => Promise<Blob>
  /**
   * What `prepare` is doing, in the present participle, for the line the picker shows while
   * it runs. Per kind because it is the difference between the truth and a euphemism: a
   * 21 MB map genuinely is being *shrunk*, over the seconds where saying nothing makes the
   * dialog look hung, and a track is only being *read*.
   */
  preparing: string
  /** What to say when the prepared blob is still over `maxBytes`. */
  tooBig: (bytes: number) => string
}

/**
 * An image's spec, given its downscaler and its ceiling. Three of the four kinds differ
 * only in those two things, so writing the third out again would be three chances to pair
 * the wrong limit with the wrong resize — which is the mistake this whole record exists to
 * make impossible.
 */
function imageSpec(downscale: (file: Blob) => Promise<Downscaled>, maxBytes: number): UploadSpec {
  return {
    accept: 'image/*',
    maxBytes,
    prepare: async (file) => {
      const shrunk = await downscale(file)
      return {
        blob: shrunk.blob,
        dimensions: { width: shrunk.width, height: shrunk.height },
        originalBytes: shrunk.originalBytes,
        bytes: shrunk.bytes,
        // Filled in by `choose`, which is the only place that knows whether this kind has a
        // `derive`. Null here rather than left off, so `Prepared` has one shape.
        derived: null,
      }
    },
    preparing: 'Shrinking',
    tooBig: (bytes) =>
      `That is still ${formatBytes(bytes)} once shrunk, and the limit is ${formatBytes(maxBytes)}. Try a smaller image.`,
  }
}

const UPLOAD_SPECS: Record<UploadKind, UploadSpec> = {
  // The one kind with a derivative — see the ⚠️ on `UploadSpec.derive` for why it is
  // written here and not threaded through `imageSpec`.
  map: {
    ...imageSpec(downscaleMap, MAX_SCENE_BYTES),
    derive: downscaleThumbnail,
  },
  token: imageSpec(downscaleToken, MAX_TOKEN_BYTES),
  modal: imageSpec(downscaleModal, MAX_MODAL_BYTES),
  music: {
    accept: 'audio/*',
    maxBytes: MAX_MUSIC_BYTES,
    // Measured and passed straight through. The file the DM chose is the file that gets
    // stored, byte for byte, which is the honest consequence of there being nothing a
    // browser can usefully do to an audio file first.
    prepare: (file) =>
      Promise.resolve({
        blob: file,
        dimensions: null,
        originalBytes: file.size,
        bytes: file.size,
        derived: null,
      }),
    preparing: 'Reading',
    // No "once shrunk", because nothing was, and the advice has to be about the file rather
    // than about this browser: a track over the limit is one the DM has to re-encode.
    tooBig: (bytes) =>
      `That track is ${formatBytes(bytes)} and the limit is ${formatBytes(MAX_MUSIC_BYTES)}. Nothing here can shrink audio, so try a shorter loop or a lower bitrate.`,
  },
}

/**
 * What `commit` hands the mutation: the stored blob and, for the kinds that have one, the
 * size it was stored at.
 *
 * `imageId` rather than `storageId` because that is what every mutation taking one calls its
 * argument, and the two numbers are flattened rather than left as a `Size | null` because
 * the three mutations that read them — all of them image mutations — would each need the
 * same null branch for a case their kind cannot produce.
 */
export type StoredUpload = {
  imageId: Id<'_storage'>
  /**
   * The derivative's id, or **null for the three kinds with no `derive`**.
   *
   * Null rather than absent, for `Prepared.dimensions`' reason one level up: *this kind has
   * none* and *this one failed to make one* would otherwise be spelled the same, and only
   * one of those is a bug. `scenes.create` takes it as an optional argument and the three
   * mutations that do not take it at all simply never read this field.
   */
  thumbnailId: Id<'_storage'> | null
  /** Zero for a kind with no pixels. Nothing branches on it; audio's mutation reads neither. */
  width: number
  height: number
}

export type Upload = {
  /** The prepared blob waiting to be stored, or null when nothing is chosen. */
  prepared: Prepared | null
  fileName: string | null
  accept: string
  /** What the picker says while `prepare` runs — see `UploadSpec.preparing`. */
  preparing: string
  /** What is in flight — preparing the file, or sending it. */
  stage: 'preparing' | 'uploading' | null
  /** A problem with the file itself, ready for <FieldError>. */
  error: string | null
  /** Take a file from the picker and start preparing it. Null clears the choice. */
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
   *
   * ⚠️ **This sequence is why there is one hook and not one per kind.** Generate a URL,
   * POST the bytes, do it again for a derivative if this kind has one, call the mutation,
   * discard everything stored on refusal — a fixed order, most of which is identical for
   * every kind, and the last step is the one holding invariant 6 up. A `useAudioUpload`
   * written beside this because audio needs no downscaler would be a second copy of the
   * discard path, and the copy that gets it wrong is the one nobody notices until the
   * storage quota is gone. What genuinely differs between kinds is a limit, an `accept`, a
   * `prepare` and now a `derive`, and all four are data in `UPLOAD_SPECS` rather than
   * control flow here.
   *
   * ⚠️ **A map stores two blobs, so the cleanup is one call with a list rather than two
   * calls.** Two `discard`s would be two transactions and two chances for the second to be
   * skipped by a `return` added to the first one's catch — which is the shape of bug this
   * whole hook exists to have exactly one copy of.
   */
  commit: <T>(create: (stored: StoredUpload) => Promise<T>) => Promise<T>
}

/**
 * Choosing a file, getting it ready, and getting it into Convex file storage — shared by
 * every upload in the application.
 *
 * Its own module rather than living beside any one of the dialogs that use it: sibling
 * dialogs reaching through one of them for the other's helper couples them through an export
 * path, so deleting or splitting the map dialog would break the token one for no reason
 * either file names.
 *
 * Preparation happens here, before the network, which is what makes invariant 6 a thing the
 * DM watches happen rather than a promise in a comment: the sample map
 * `farmershall_1stfloor.png` is 21.2 MB and leaves as roughly 1.4 MB. The server checks the
 * stored blob's size again, and **that check is the real one** — this only saves the DM an
 * upload they were going to be refused for. For music it is all this side can do at all; see
 * the ⚠️ on `UploadSpec.prepare`.
 */
export function useUpload(args: { code: string; dmCode: string; kind: UploadKind }): Upload {
  const { code, dmCode, kind } = args
  const spec = UPLOAD_SPECS[kind]
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const discard = useMutation(api.files.discard)

  const [prepared, setPrepared] = useState<Prepared | null>(null)
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
          const ready = await spec.prepare(file)
          if (latest.current !== mine) return
          // Refused before the upload rather than after it, against **this kind's** limit
          // — see the ⚠️ on `UploadSpec`. The server refuses the same blob, so spending
          // the bytes first would only make the failure slower.
          if (ready.bytes > spec.maxBytes) {
            setError(spec.tooBig(ready.bytes))
            return
          }
          // After the ceiling check, deliberately: there is no point deriving a thumbnail
          // of a map that is about to be refused. The derivative comes from `ready.blob`,
          // which is the blob that will actually be stored — see `downscaleThumbnail`.
          const derived = spec.derive ? await spec.derive(ready.blob) : null
          if (latest.current !== mine) return
          setPrepared({ ...ready, derived })
        } catch (thrown) {
          if (latest.current !== mine) return
          // Not a ConvexError — nothing has reached the server yet — so the message
          // comes from images.ts, which says what actually went wrong with the file.
          setError(thrown instanceof Error ? thrown.message : 'That file could not be read.')
        } finally {
          if (latest.current === mine) setStage(null)
        }
      })()
    },
    [spec],
  )

  const commit = useCallback(
    async <T>(create: (stored: StoredUpload) => Promise<T>): Promise<T> => {
      if (!prepared) throw new Error('Choose a file first.')
      setStage('uploading')

      // Everything this call has put into storage, in the order it went in. The catch below
      // hands the whole list to one `discard`, so a map and its thumbnail are cleaned up in
      // one transaction — see the ⚠️ on `files.discard`. Empty until the first POST returns,
      // which is what makes a failure of *that* POST need no cleanup at all.
      const stored: Id<'_storage'>[] = []

      const put = async (blob: Blob): Promise<Id<'_storage'>> => {
        const url = await generateUploadUrl({ code, dmCode })
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        })
        if (!response.ok) throw new Error('The upload did not go through. Try again.')
        const { storageId } = (await response.json()) as {
          storageId: Id<'_storage'>
        }
        stored.push(storageId)
        return storageId
      }

      try {
        const imageId = await put(prepared.blob)
        // ⚠️ **A failed thumbnail POST fails the whole upload rather than falling back to
        // no thumbnail, and that is the argued call.** The forgiving version stores a scene
        // with no derivative and says nothing, which is indistinguishable from a scene
        // uploaded before this feature existed — so a deployment where the second POST
        // always fails looks exactly like a game full of old maps, for ever. A refusal the
        // DM can retry is the only version anybody would notice.
        const thumbnailId = prepared.derived === null ? null : await put(prepared.derived)

        return await create({
          imageId,
          thumbnailId,
          width: prepared.dimensions?.width ?? 0,
          height: prepared.dimensions?.height ?? 0,
        })
      } catch (thrown) {
        // Best effort, and deliberately swallowed: a failure to tidy up must not
        // replace the refusal the DM actually needs to read.
        if (stored.length > 0) {
          try {
            await discard({ code, dmCode, imageIds: stored })
          } catch {
            // Nothing to say. The blobs outlive us; the real error matters more.
          }
        }
        throw thrown
      } finally {
        setStage(null)
      }
    },
    [code, discard, dmCode, generateUploadUrl, prepared],
  )

  return {
    prepared,
    fileName,
    accept: spec.accept,
    preparing: spec.preparing,
    stage,
    error,
    choose,
    reset,
    commit,
  }
}
