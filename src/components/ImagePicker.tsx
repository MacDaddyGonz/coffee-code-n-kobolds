import { FieldError } from '@/components/FieldError'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ImageUpload } from '@/hooks/useImageUpload'
import { formatBytes } from '@/lib/images'
import { cn } from '@/lib/utils'

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
 *
 * Paired with `useImageUpload` and takes the whole thing, so the two are one
 * feature to reach for. It lives beside the other shared field components rather
 * than inside either dialog that uses it, for the reason on that hook.
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
