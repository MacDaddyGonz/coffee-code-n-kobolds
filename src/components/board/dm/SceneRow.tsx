import { useId, useState } from 'react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { MAX_SCENE_NAME_LENGTH } from '@convex/lib/codes'
import type { DmScene } from '@convex/lib/scenes'
import { SceneNotes } from './SceneNotes'

export type SceneRowProps = {
  scene: DmScene
  active: boolean
  busy: boolean
  /** Which act on *this* row is in flight, or null. Drives one spinner rather than five. */
  pending: string | null
  /** False on the first row and the last, so the arrows cannot walk off either end. */
  canMoveUp: boolean
  canMoveDown: boolean
  onSwitchTo: () => void
  onMove: (direction: -1 | 1) => void
  onRename: (name: string) => Promise<boolean>
  onSetNotes: (notes: string) => Promise<boolean>
  onDuplicate: (includeContents: boolean) => Promise<boolean>
  onReplaceImage: () => void
  onRemove: () => Promise<boolean>
}

/**
 * One map in the DM's list, and the seven things that can be done to it.
 *
 * ⚠️ **Its own file because `SceneSelect` was 316 lines with three sub-components and this
 * milestone adds four acts to every row.** Growing it would have produced a seven-hundred-line
 * module where the thing a reader is looking for — *which of these controls is DM-only, and
 * why* — is buried under markup. The split is along the line the data already draws:
 * `SceneSelect` owns the list, the mutations and the one open-editor-at-a-time state;
 * this owns a row and knows nothing about its neighbours except whether it has any.
 *
 * **Every act is a callback and none of them is a mutation.** A row that called
 * `useMutation` for itself would be twenty-five subscriptions to the same five functions,
 * and — worse — twenty-five copies of `useLobbyAction`, so two rows could be mid-flight at
 * once and the panel would have no single answer to *is something happening?*. The parent
 * holds one of each, which is why `busy` and `pending` arrive as props.
 *
 * ⚠️ **The reorder control is two buttons rather than a drag, and that is a decision.**
 * `MAX_SCENES_PER_GAME` is 25, which is a list and not a canvas: drag-and-drop needs a
 * pointer-sensor library, a keyboard fallback that duplicates the arrows anyway, and a drop
 * animation, to move a row somebody could have moved with two clicks. It also has to answer
 * *what happens when a drag is dropped mid-flight*, which the arrows do not — each press is
 * one `reorder` call carrying the whole list, so the last one wins and nothing interleaves.
 *
 * At most one editor is open at a time, and the parent decides which: two half-typed drafts
 * in one list is two states to reason about and no way to tell which the Enter key belongs
 * to. `renaming` and `editingNotes` are therefore derived from `pending`-shaped props rather
 * than held here.
 */
export function SceneRow({
  scene,
  active,
  busy,
  pending,
  canMoveUp,
  canMoveDown,
  onSwitchTo,
  onMove,
  onRename,
  onSetNotes,
  onDuplicate,
  onReplaceImage,
  onRemove,
}: SceneRowProps) {
  // Which of the two inline editors this row is showing, at most one. Local because it is a
  // fact about this row's markup and nothing above needs it — unlike the *list-wide* rule
  // that only one row may be editing, which is why the parent unmounts the others.
  const [editor, setEditor] = useState<'rename' | 'notes' | null>(null)

  return (
    <li
      className={cn(
        'flex flex-col rounded-lg border p-2 transition-colors',
        active && 'border-primary bg-muted',
      )}
    >
      <div className="flex items-center gap-2">
        <SceneThumbnail scene={scene} />

        {editor === 'rename' ? (
          <SceneRenameForm
            scene={scene}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSubmit={(name) =>
              onRename(name).then((done) => {
                // Closed only on success, so a refusal — a blank the server collapsed to
                // nothing, a name past the limit — leaves the field open with the text
                // still in it to fix.
                if (done) setEditor(null)
                return done
              })
            }
          />
        ) : (
          <>
            {/* The name is the button and the row is not, which is `CharacterRow`'s
                decision for `CharacterRow`'s reason: this row carries five other
                controls, and a `<button>` wrapped round all of them is invalid HTML
                that browsers resolve by unnesting it. */}
            <button
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={onSwitchTo}
              className="focus-visible:ring-ring/50 hover:bg-muted/60 -m-1 flex min-w-0 flex-1 flex-col items-start rounded-md p-1 text-left disabled:opacity-50 focus-visible:ring-3 focus-visible:outline-none"
            >
              <span className="w-full truncate font-medium">{scene.name}</span>
              {/* The stored pixel size, which is the one other fact the payload carries
                  and the one that tells *Cavern* from *Cavern 2* when the DM has cropped
                  one of them. Nothing here computes it. */}
              <span className="text-muted-foreground truncate text-xs">
                {scene.imageWidth} × {scene.imageHeight}
                {scene.notes === '' ? null : ' · has notes'}
              </span>
            </button>

            {/* The active marker, beside the acts rather than inside the button, so it is
                not read out as part of the name. What it announces is `aria-pressed`
                above; this is the same fact for people looking. */}
            {active ? <Badge variant="secondary">On the table</Badge> : null}

            {/* Arrows before the verbs, because they are the one pair a DM presses
                repeatedly and they should not move under the cursor as the row's other
                controls change width. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || !canMoveUp}
              aria-label={`Move ${scene.name} up`}
              onClick={() => onMove(-1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || !canMoveDown}
              aria-label={`Move ${scene.name} down`}
              onClick={() => onMove(1)}
            >
              ↓
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={editor === 'notes'}
              disabled={busy}
              aria-label={`Notes for ${scene.name}`}
              onClick={() => setEditor(editor === 'notes' ? null : 'notes')}
            >
              Notes
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Rename ${scene.name}`}
              onClick={() => setEditor('rename')}
            >
              Rename
            </Button>

            <SceneDuplicateDialog
              scene={scene}
              busy={busy}
              pending={pending === 'duplicate'}
              onDuplicate={onDuplicate}
            />

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Replace the image for ${scene.name}`}
              onClick={onReplaceImage}
            >
              Replace image
            </Button>

            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete ${scene.name}`}
                >
                  Delete
                </Button>
              }
              title={`Delete ${scene.name}?`}
              description={
                'The map image and everywhere tokens were standing on it both go, and this cannot be undone. The tokens themselves survive — they belong to the game, so they are still there to drop onto another map. If another map is a copy of this one they keep the picture, and it stays in storage for them. If the table is looking at this map, they will be looking at nothing until you pick another.'
              }
              confirmLabel="Delete the map"
              busy={pending === 'remove'}
              onConfirm={onRemove}
            />
          </>
        )}
      </div>

      {editor === 'notes' ? (
        <SceneNotes
          scene={scene}
          busy={busy}
          onCancel={() => setEditor(null)}
          onSubmit={(notes) =>
            onSetNotes(notes).then((done) => {
              if (done) setEditor(null)
              return done
            })
          }
        />
      ) : null}
    </li>
  )
}

/**
 * A map, drawn small.
 *
 * `object-cover` in a fixed box rather than a box that takes the map's aspect ratio: a
 * list whose rows are different heights is a list you cannot scan, and the crop loses
 * nothing a DM identifies a map by.
 *
 * **`alt=""` and no `aria-label`**, which is `TokenSwatch`'s reasoning: the name is
 * printed beside it, and a second announcement of the same word is noise. The picture is
 * a faster way to recognise a name you can already read.
 *
 * ⚠️ **`thumbnailUrl` and never `imageUrl`, and there is deliberately no `??` here.** The
 * fallback for a scene with no derivative is resolved in `dmScene` on the server, so this
 * component cannot disagree with it. Reaching for `imageUrl` as a "safety net" would put a
 * second opinion about which picture a row shows into the one place nobody would look for one.
 *
 * A null `thumbnailUrl` means the map's own blob has gone out from under the row —
 * `publicScene` says why that must not be an error — so the box is drawn empty rather than
 * the row being hidden. The scene still has a grid, and the DM can still delete it.
 */
function SceneThumbnail({ scene }: { scene: DmScene }) {
  return (
    <span className="bg-muted h-10 w-14 shrink-0 overflow-hidden rounded-md border">
      {scene.thumbnailUrl === null ? null : (
        <img
          src={scene.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

/**
 * Renaming a map in place.
 *
 * ⚠️ **Not `LobbyRenameForm`, and the reason is one line of it.** That component is the
 * shared inline rename for a seat and a character, and its Save is live whatever is in
 * the field — a blank goes to the server and comes back as a toast. That is a defensible
 * answer for a seat; it is the wrong one *here*, because the other control that writes a
 * scene name is `SceneUploadDialog`, and it will not submit a blank. Two fields writing the
 * same column through `requireSceneName` that disagree about when the button is live is the
 * kind of drift `PickerRow` and `native-select.tsx` exist to prevent, one level down. So this
 * is the same form with the upload dialog's guard: `maxLength` from the same constant, and
 * nothing sent that `requireSceneName` is going to refuse for being empty.
 *
 * The trim is a *guard* and not a normalisation — the raw value is what is sent, and
 * `requireText` collapses whitespace server-side. Trimming here as well would be a second
 * opinion about what the stored name is, which is how the two come to differ by a space.
 */
function SceneRenameForm({
  scene,
  busy,
  onCancel,
  onSubmit,
}: {
  scene: DmScene
  busy: boolean
  onCancel: () => void
  /** Resolves false when the server refused, which keeps the field open to fix. */
  onSubmit: (value: string) => Promise<boolean>
}) {
  // Not a literal: Radix can have the Map tab mounted more than once — a tab kept alive
  // behind the one on screen is still in the document — and two inputs sharing an id is a
  // label that focuses the wrong control.
  const fieldId = useId()
  const [value, setValue] = useState(scene.name)

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(value)
      }}
    >
      <Label htmlFor={fieldId} className="sr-only">
        Rename {scene.name}
      </Label>
      <Input
        id={fieldId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_SCENE_NAME_LENGTH}
        autoComplete="off"
        autoFocus
        className="h-7 min-w-0 flex-1"
      />
      <Button type="submit" size="sm" disabled={busy || value.trim() === ''}>
        Save
      </Button>
      {/* Escape would be the other way out, and it is deliberately not wired: this form
          is inside no dialog, so there is no key handler to hang it on that would not
          also be a document-level listener competing with the board's own. */}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

/**
 * Copying a map: one confirm, and **one choice inside it**.
 *
 * ⚠️ **A `ConfirmDialog` with a checkbox rather than three of them, and the roadmap's own
 * sentence is the reason: *a wall is a property of the map; a placement and a fog shape are
 * where things are tonight.*** Everything that describes the map — the picture, the grid,
 * the fog base, the notes, the colour — comes across regardless, because a copy that did not
 * take them is not a copy of that map. What is genuinely a question is whether the DM wants
 * *the same room laid out again* or *the same room empty*, and that is one question.
 *
 * The picture is shared rather than copied, and the copy says so: a DM who has just been
 * told a duplicate is free deserves to know that deleting either one leaves the other's map
 * alone, because the obvious fear is exactly the bug the commit before this one fixed.
 *
 * It is a plain `<input type="checkbox">` because there is no `Checkbox` in `components/ui`
 * and one control does not justify adding the primitive — see `native-select.tsx`, which
 * makes the same call in the other direction and says so.
 */
function SceneDuplicateDialog({
  scene,
  busy,
  pending,
  onDuplicate,
}: {
  scene: DmScene
  busy: boolean
  pending: boolean
  onDuplicate: (includeContents: boolean) => Promise<boolean>
}) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  // Defaults to taking the contents, because that is what "duplicate this encounter" means
  // and the empty copy is the deliberate act. Reset on open, so the last press does not
  // silently decide the next one.
  const [includeContents, setIncludeContents] = useState(true)

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setIncludeContents(true)
      }}
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={`Duplicate ${scene.name}`}
        >
          Duplicate
        </Button>
      }
      title={`Duplicate ${scene.name}?`}
      description={
        'The copy shares the map image with this one, so it costs the game no extra storage and deleting either map leaves the other’s picture alone. It takes the grid, the fog base, the notes and the background colour, and it does not go on the table.'
      }
      confirmLabel="Make the copy"
      confirmVariant="default"
      // `ConfirmDialog` closes itself on anything but `false`, through the
      // `onOpenChange` above — so a refusal keeps the dialog and the choice in it.
      busy={pending}
      onConfirm={() => onDuplicate(includeContents)}
    >
      <label htmlFor={fieldId} className="flex items-center gap-2 text-sm">
        <input
          id={fieldId}
          type="checkbox"
          className="size-4 accent-primary"
          checked={includeContents}
          onChange={(event) => setIncludeContents(event.target.checked)}
        />
        Also copy the tokens where they are standing, and the fog
      </label>
    </ConfirmDialog>
  )
}
