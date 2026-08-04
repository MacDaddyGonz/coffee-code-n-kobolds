import { FieldError } from '@/components/FieldError'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Upload } from '@/hooks/useUpload'
import { formatBytes } from '@/lib/images'
import { cn } from '@/lib/utils'

export type UploadPickerProps = {
  id: string
  label: string
  upload: Upload
  /** Extra line under the field, for what this particular file is for. */
  hint?: string
  /** Defaults to `upload.choose`; override to do something else with the file too. */
  onChoose?: (file: File | null) => void
  disabled?: boolean
  className?: string
}

/**
 * A file field that reports what preparing the file saved — "21.2 MB → 1.4 MB".
 *
 * The saving is on screen because it is the one place a DM can see invariant 6
 * being kept, and because a 21 MB source takes a visible moment to decode: with
 * nothing to read, the pause looks like a hung dialog rather than work.
 *
 * Paired with `useUpload` and takes the whole thing, so the two are one feature to reach
 * for. It lives beside the other shared field components rather than inside any of the
 * dialogs that use it, for the reason on that hook.
 *
 * ⚠️ **Neither the `accept` nor the dimensions are this component's to decide**, which is
 * what let it stop being `ImagePicker`. The filter comes off the kind's `UploadSpec`, so a
 * music field offers tracks without this file knowing music exists; and the `· W × H` span
 * is drawn only when there is a size, because `prepare` returns `null` for a kind that has
 * none. A track is a length of bytes and no pixels, and printing `0 × 0` after it would be
 * this component inventing a fact about a file it never opened.
 */
export function UploadPicker({
  id,
  label,
  upload,
  hint,
  onChoose,
  disabled = false,
  className,
}: UploadPickerProps) {
  const { prepared, fileName, accept, preparing, stage, error } = upload
  const choose = onChoose ?? upload.choose

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled || stage !== null}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

      {stage === 'preparing' ? (
        <p className="text-muted-foreground text-xs">
          {preparing} {fileName ?? 'the file'}…
        </p>
      ) : stage === 'uploading' ? (
        <p className="text-muted-foreground text-xs">Uploading…</p>
      ) : prepared ? (
        <p className="text-xs tabular-nums">
          <span className="text-muted-foreground">{fileName} — </span>
          {formatBytes(prepared.originalBytes)} → {formatBytes(prepared.bytes)}
          {prepared.dimensions === null ? null : (
            <span className="text-muted-foreground">
              {' '}
              · {prepared.dimensions.width} × {prepared.dimensions.height}
            </span>
          )}
        </p>
      ) : null}

      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}
