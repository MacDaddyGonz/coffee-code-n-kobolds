import { useId, useState } from 'react'
import { useMutation } from 'convex/react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { MAX_SCENE_NAME_LENGTH } from '@convex/lib/codes'
import type { DmScene } from '@convex/lib/scenes'

export type SceneSelectProps = {
  code: string
  dmCode: string
  /**
   * `DmScene` and not `PublicScene`, which is the type saying what the payload says: this
   * list comes from `scenes.list`, which throws for anybody without the DM code, and it
   * carries a thumbnail URL no player's client is ever sent.
   */
  scenes: DmScene[]
  activeSceneId: Id<'scenes'> | null
}

/**
 * Which map the table is looking at, what each one looks like, and the two ways to
 * change one: rename it, or delete it.
 *
 * **This is the panel the native select was standing in for.** What used to be here
 * called itself "deliberately the plainest thing that works" and named the three things
 * the DM-tooling milestone owed it: tabs, thumbnails, and a switch that does not make
 * everyone's camera jump. The tabs are `DmToolsTab`'s. The thumbnails are below. The
 * camera was already fixed and is the interesting one — see the ⚠️ two paragraphs down.
 *
 * A list of rows rather than a combobox, and the deciding fact is that a row can carry
 * more than a string. A `<select>` can hold a scene's *name* and nothing else, so the
 * picture — the one thing that actually tells two battle maps apart at a glance — had
 * nowhere to go, and every act other than switching had to be a control beside the
 * select operating on whatever it happened to be showing. `MAX_SCENES_PER_GAME` is 25,
 * which is a list rather than a search problem, so the combobox `native-select.tsx`
 * anticipated is not what this wanted after all.
 *
 * ✅ **The thumbnail is a real derivative now, and this is where the paragraph saying it
 * was not used to be.** What stood here described the cost — `publicSceneValidator`
 * carried one `imageUrl` and twenty-five rows were twenty-five full 2560 px battle maps to
 * fetch and decode — and said a real one would mean a second blob per scene, generated on
 * upload and projected beside this one, which is a storage and payload change and not one
 * to make on the way past. It was made on purpose instead: `scenes.thumbnailId` is a 320 px
 * WebP the browser derives from the map it is about to store, and `dmScene` resolves
 * `thumbnailUrl` for it.
 *
 * Two things survive that change and are worth not deleting with the paragraph. The
 * fallback is **resolved on the server**, so this component never asks whether a scene has
 * a derivative — every row uploaded before the field existed simply has the map's own URL
 * in `thumbnailUrl`, and those rows are permanent because nothing regenerates one. And the
 * two mitigations below stay: the list is a bounded scroll box and every image is
 * `loading="lazy"`, which is what keeps a game of pre-thumbnail maps behaving the way it
 * did rather than getting worse.
 *
 * ⚠️ **Nothing here touches the camera, and that is the finding rather than an
 * omission.** `useBoardCamera` already remembers pan and zoom per `(code, sceneId)` in
 * local storage and, on every scene change, restores what this browser last chose or
 * fits the map if it has never opened it — `useBoardCamera.ts:222-236`, the
 * restore-or-fit effect. So the promise that switching maps does not make everyone's
 * camera jump was kept by the board a milestone before this panel was asked to keep it,
 * and the only thing this file could add is a second opinion about where somebody is
 * looking. Switching writes `activeSceneId` and nothing else.
 *
 * Changing the selection changes what every client is rendering, immediately, so it is
 * `scenes.setActive` on the press rather than a local selection with an Apply button —
 * the same call the select made, for the same reason. The list itself comes from
 * `scenes.list`, which is DM-only and *throws* for a player — a list of scene names is a
 * spoiler, and that refusal is the design rather than an oversight. Every thumbnail is
 * therefore a picture no player has been sent either, except the one on the table.
 *
 * **Delete moved from *the active map* to *every row*, and it is the same button.** The
 * select could only ever name one scene, so a Delete beside it could only ever offer
 * that one; a list names all of them. `ConfirmDialog`, the wording and the mutation are
 * unchanged, and the wording already covered both cases — it says what happens *if* the
 * table is looking at the map being deleted, because `scenes.remove` clears the pointer
 * rather than guessing at a replacement.
 */
export function SceneSelect({ code, dmCode, scenes, activeSceneId }: SceneSelectProps) {
  const setActive = useMutation(api.scenes.setActive)
  const renameScene = useMutation(api.scenes.rename)
  const removeScene = useMutation(api.scenes.remove)
  const action = useLobbyAction()

  // Which row is showing its rename field, at most one. An id rather than a boolean per
  // row, so opening a second closes the first — two half-typed names in one list is two
  // drafts to reason about and no way to tell which the Enter key belongs to.
  const [renaming, setRenaming] = useState<Id<'scenes'> | null>(null)

  const busy = action.pending !== null

  const switchTo = (scene: DmScene) => {
    // The row that is already on the table does nothing. `setActive` would happily patch
    // the id that is already stored, and a patch is a write: every client at the table
    // would re-read the game document to learn that nothing had changed.
    if (scene._id === activeSceneId) return

    void action.run('setActive', `Could not put ${scene.name} on the table.`, () =>
      setActive({ code, dmCode, sceneId: scene._id }),
    )
  }

  const rename = (scene: DmScene, name: string) =>
    action.run(`rename:${scene._id}`, `Could not rename ${scene.name}.`, () =>
      renameScene({ code, dmCode, sceneId: scene._id, name }),
    )

  const remove = (scene: DmScene) =>
    action.run(`remove:${scene._id}`, `Could not delete ${scene.name}.`, () =>
      removeScene({ code, dmCode, sceneId: scene._id }),
    )

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Maps</h3>

      {/* `max-h-64` is the ceiling the DM's other two lists use, and here it does a
          second job: `loading="lazy"` only defers what is out of view, so the bound is
          what stops a game with twenty-five maps fetching twenty-five of them at once.
          The panel below — the calibrator, the token dialog — stays reachable without
          scrolling past the whole library to find it. */}
      <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {scenes.map((scene) => {
          const active = scene._id === activeSceneId

          return (
            <li
              key={scene._id}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-2 transition-colors',
                active && 'border-primary bg-muted',
              )}
            >
              <SceneThumbnail scene={scene} />

              {renaming === scene._id ? (
                <SceneRenameForm
                  scene={scene}
                  busy={busy}
                  onCancel={() => setRenaming(null)}
                  onSubmit={(name) =>
                    rename(scene, name).then((done) => {
                      // Closed only on success, so a refusal — a blank the server
                      // collapsed to nothing, a name past the limit — leaves the field
                      // open with the text still in it to fix.
                      if (done) setRenaming(null)
                      return done
                    })
                  }
                />
              ) : (
                <>
                  {/* The name is the button and the row is not, which is
                      `CharacterRow`'s decision for `CharacterRow`'s reason: this row
                      carries a Rename and a Delete, and a `<button>` wrapped round both
                      of them is invalid HTML that browsers resolve by unnesting it. */}
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => switchTo(scene)}
                    className="focus-visible:ring-ring/50 hover:bg-muted/60 -m-1 flex min-w-0 flex-1 flex-col items-start rounded-md p-1 text-left disabled:opacity-50 focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <span className="w-full truncate font-medium">{scene.name}</span>
                    {/* The stored pixel size, which is the one other fact the payload
                        carries and the one that tells *Cavern* from *Cavern 2* when the
                        DM has cropped one of them. Nothing here computes it. */}
                    <span className="text-muted-foreground truncate text-xs">
                      {scene.imageWidth} × {scene.imageHeight}
                    </span>
                  </button>

                  {/* The active marker, beside the acts rather than inside the button,
                      so it is not read out as part of the name. What it announces is
                      `aria-pressed` above; this is the same fact for people looking. */}
                  {active ? <Badge variant="secondary">On the table</Badge> : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Rename ${scene.name}`}
                    onClick={() => setRenaming(scene._id)}
                  >
                    Rename
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
                      'The map image and everywhere tokens were standing on it both go, and this cannot be undone. The tokens themselves survive — they belong to the game, so they are still there to drop onto another map. If the table is looking at this map, they will be looking at nothing until you pick another.'
                    }
                    confirmLabel="Delete the map"
                    busy={action.pending === `remove:${scene._id}`}
                    onConfirm={() => remove(scene)}
                  />
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
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
 * component cannot disagree with it — see the ⚠️ on that field. Reaching for `imageUrl` as
 * a "safety net" would put a second opinion about which picture a row shows into the one
 * place nobody would think to look for one.
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
 * Renaming a map in place. **The first caller `scenes.rename` has ever had.**
 *
 * ⚠️ **Not `LobbyRenameForm`, and the reason is one line of it.** That component is the
 * shared inline rename for a seat and a character, and its Save is live whatever is in
 * the field — a blank goes to the server and comes back as a toast. That is a defensible
 * answer for a seat; it is the wrong one *here*, because the other control that writes a
 * scene name is `SceneUploadDialog`, four inches up the same panel, and it will not
 * submit a blank. Two fields writing the same column through `requireSceneName` that
 * disagree about when the button is live is the kind of drift `PickerRow` and
 * `native-select.tsx` exist to prevent, one level down. So this is the same form with the
 * upload dialog's guard: `maxLength` from the same constant, and nothing sent that
 * `requireSceneName` is going to refuse for being empty.
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
