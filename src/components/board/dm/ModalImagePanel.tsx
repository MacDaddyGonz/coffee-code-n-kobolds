import { useMutation, useQuery } from 'convex/react'
import { ImageIcon } from 'lucide-react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { PublicModalImage } from '@convex/lib/modalImages'
import { ModalImageUploadDialog } from './ModalImageUploadDialog'

export type ModalImagePanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

/**
 * The DM's handouts: what there is to show, and which one is up.
 *
 * Two subscriptions, and the second is not redundant. `list` is the DM's own shelf, whose
 * names are a spoiler and which nobody else may read; `open` is the one image the whole
 * table is looking at, and it is the same query `ModalImageViewer` subscribes to — so the
 * *Showing* badge here cannot disagree with what is actually on screen, because both are
 * reading the one pointer. A local "which one did I click" flag would be a second source
 * of truth for a fact the server already publishes, and it would be wrong the moment a DM
 * had two browsers open.
 */
export function ModalImagePanel({ code, dmCode }: ModalImagePanelProps) {
  const images = useQuery(api.modalImages.list, { code, dmCode })
  const open = useQuery(api.modalImages.open, { code })
  const show = useMutation(api.modalImages.show)
  const hide = useMutation(api.modalImages.hide)
  const remove = useMutation(api.modalImages.remove)
  const action = useLobbyAction()

  const openId = open?._id ?? null
  const busy = action.pending !== null

  const showIt = (image: PublicModalImage) =>
    void action.run(`show:${image._id}`, `Could not show ${image.name}.`, () =>
      show({ code, dmCode, modalImageId: image._id }),
    )

  const hideIt = () =>
    void action.run('hide', 'Could not close the handout.', () => hide({ code, dmCode }))

  const removeIt = (image: PublicModalImage) =>
    action.run(`remove:${image._id}`, `Could not delete ${image.name}.`, () =>
      remove({ code, dmCode, modalImageId: image._id }),
    )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Images</CardTitle>
        <CardDescription>
          Show one and it opens on everybody's screen at once. Only you can see this list,
          and only you can take an image back down for the whole table.
        </CardDescription>
        <CardAction>
          <ModalImageUploadDialog code={code} dmCode={dmCode} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {images === undefined || open === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : images.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Add a letter, a portrait or a map of the docks, and hold it up
            when the moment comes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {images.map((image) => (
              <ModalImageRow
                key={image._id}
                image={image}
                showing={image._id === openId}
                busy={busy}
                pending={action.pending}
                onShow={() => showIt(image)}
                onHide={hideIt}
                onRemove={() => removeIt(image)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

type ModalImageRowProps = {
  image: PublicModalImage
  /** This is the one the table is looking at, straight off `modalImages.open`. */
  showing: boolean
  /** Any call is in flight — every button on every row waits, as one call at a time. */
  busy: boolean
  /** Which call, so the confirm dialog can show its own progress and not a neighbour's. */
  pending: string | null
  onShow: () => void
  onHide: () => void
  onRemove: () => Promise<boolean>
}

/**
 * One handout: a thumbnail to recognise it by, the name, and the two things a DM does
 * with it.
 *
 * A local component rather than a file of its own, for the reason `LayerTools` is one
 * inside `MapSetupPanel`: it is a row belonging to exactly one list, and the panel above
 * is the only thing that will ever render it.
 */
function ModalImageRow({
  image,
  showing,
  busy,
  pending,
  onShow,
  onHide,
  onRemove,
}: ModalImageRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-md border p-2">
      {image.imageUrl === null ? (
        // The blob has gone from under the row. Said with an icon rather than a broken
        // image, and the row still offers Delete — which is the only useful thing left.
        <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded">
          <ImageIcon className="size-4" aria-hidden />
        </span>
      ) : (
        // `loading="lazy"` for `TokenSwatch`'s reason: twenty-five handouts is twenty-five
        // signed URLs and twenty-five decodes the moment this tab is opened, most of them
        // below the fold. `alt=""` because the name is right beside it in the same row.
        <img
          src={image.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-10 shrink-0 rounded object-cover"
        />
      )}

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{image.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {image.imageWidth} × {image.imageHeight}
        </span>
      </div>

      {showing ? <Badge variant="secondary">On screen</Badge> : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showing ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onHide}>
            Close it
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={onShow}>
            Show
          </Button>
        )}

        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="ghost" disabled={busy}>
              Delete
            </Button>
          }
          title={`Delete ${image.name}?`}
          description={
            showing
              ? 'The image goes, and this cannot be undone. The table is looking at it right now, so it closes on everybody’s screen as it goes.'
              : 'The image goes, and this cannot be undone. Nothing else in the game refers to it, so nothing else changes.'
          }
          confirmLabel="Delete the image"
          busy={pending === `remove:${image._id}`}
          onConfirm={onRemove}
        />
      </div>
    </li>
  )
}
