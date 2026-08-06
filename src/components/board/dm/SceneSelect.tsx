import { useState } from 'react'
import { useMutation } from 'convex/react'

import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { DmScene } from '@convex/lib/scenes'
import { SceneReplaceDialog } from './SceneReplaceDialog'
import { SceneRow } from './SceneRow'

export type SceneSelectProps = {
  code: string
  dmCode: string
  /**
   * `DmScene` and not `PublicScene`, which is the type saying what the payload says: this
   * list comes from `scenes.list`, which throws for anybody without the DM code, and it
   * carries a thumbnail, an order and the DM's private notes that no player's client is
   * ever sent.
   */
  scenes: DmScene[]
  activeSceneId: Id<'scenes'> | null
}

/**
 * Which map the table is looking at, and the seven things the DM can do to one.
 *
 * **This is the panel the native select was standing in for.** What used to be here called
 * itself "deliberately the plainest thing that works" and named the three things the
 * DM-tooling milestone owed it: tabs, thumbnails, and a switch that does not make everyone's
 * camera jump. All three are done — the tabs are `DmToolsTab`'s, the thumbnails became a
 * real derivative in this milestone, and the camera was already fixed by `useBoardCamera`,
 * which remembers pan and zoom per `(code, sceneId)` and restores or fits on every scene
 * change. **Nothing here touches the camera, and that is the finding rather than an
 * omission**: the only thing this file could add is a second opinion about where somebody is
 * looking.
 *
 * A list of rows rather than a combobox, and the deciding fact is that a row can carry more
 * than a string. `MAX_SCENES_PER_GAME` is 25, which is a list rather than a search problem —
 * and it is also why reordering is two arrows rather than a drag; `SceneRow` carries that
 * argument.
 *
 * ⚠️ **This file owns the list and `SceneRow` owns a row, and the split is about where the
 * state is rather than about line count.** Every mutation, the single `useLobbyAction` and
 * the one replace dialog live here; a row is handed callbacks and knows nothing about its
 * neighbours except whether it has any. Twenty-five rows each holding their own
 * `useMutation` and their own pending flag would be twenty-five answers to *is something
 * happening?*, which is how two acts end up in flight at once against one list.
 *
 * Changing the selection changes what every client is rendering, immediately, so it is
 * `scenes.setActive` on the press rather than a local selection with an Apply button — the
 * same call the select made, for the same reason. The list itself comes from `scenes.list`,
 * which is DM-only and *throws* for a player: a list of scene names is a spoiler, and that
 * refusal is the design rather than an oversight. Every thumbnail is therefore a picture no
 * player has been sent either, except the one on the table — and so are the notes.
 */
export function SceneSelect({ code, dmCode, scenes, activeSceneId }: SceneSelectProps) {
  const setActive = useMutation(api.scenes.setActive)
  const renameScene = useMutation(api.scenes.rename)
  const removeScene = useMutation(api.scenes.remove)
  const setNotes = useMutation(api.scenes.setNotes)
  const reorderScenes = useMutation(api.scenes.reorder)
  const duplicateScene = useMutation(api.scenes.duplicate)
  const action = useLobbyAction()

  // Which map the replace dialog is aimed at. An id rather than the row, so a re-render
  // from the subscription hands the dialog the *current* scene rather than the snapshot it
  // was opened with — the pixel size it prints has to be the one the server will compare.
  const [replacingId, setReplacingId] = useState<Id<'scenes'> | null>(null)
  const replacing = scenes.find((scene) => scene._id === replacingId) ?? null

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

  /**
   * ⚠️ **One press sends the WHOLE list, reordered — see `scenes.reorder`.** The swap is
   * computed here because the array on screen is the order the DM is looking at, and the
   * mutation validates it is a permutation of the game's scenes rather than trusting it.
   * Sending *move this one up* instead would spread one intention across N transactions.
   */
  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction
    if (to < 0 || to >= scenes.length) return

    const order = scenes.map((scene) => scene._id)
    ;[order[index], order[to]] = [order[to], order[index]]

    void action.run(`${scenes[index]._id}:move`, 'Could not reorder the maps.', () =>
      reorderScenes({ code, dmCode, sceneIds: order }),
    )
  }

  /**
   * The part of `action.pending` that belongs to this row, or null.
   *
   * Keys are `${sceneId}:${act}` so one `useLobbyAction` can say *which* row is busy as well
   * as that something is — which is what lets a row spin its own Delete button while every
   * other control in the list is merely disabled.
   */
  const pendingOn = (sceneId: Id<'scenes'>): string | null =>
    action.pending?.startsWith(`${sceneId}:`) ? action.pending.slice(sceneId.length + 1) : null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Maps</h3>

      {/* `max-h-96` is a taller ceiling than the DM's other two lists use, because a row
          with its notes open is several times the height of one without — and it does the
          same second job the old bound did: `loading="lazy"` only defers what is out of
          view, so the bound is what stops a game with twenty-five maps fetching
          twenty-five thumbnails at once. The panel below — the calibrator, the token
          dialog — stays reachable without scrolling past the whole library to find it. */}
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {scenes.map((scene, index) => (
          <SceneRow
            key={scene._id}
            scene={scene}
            active={scene._id === activeSceneId}
            busy={busy}
            pending={pendingOn(scene._id)}
            canMoveUp={index > 0}
            canMoveDown={index < scenes.length - 1}
            onSwitchTo={() => switchTo(scene)}
            onMove={(direction) => move(index, direction)}
            onRename={(name) =>
              action.run(`${scene._id}:rename`, `Could not rename ${scene.name}.`, () =>
                renameScene({ code, dmCode, sceneId: scene._id, name }),
              )
            }
            onSetNotes={(notes) =>
              action.run(`${scene._id}:notes`, `Could not save the notes for ${scene.name}.`, () =>
                setNotes({ code, dmCode, sceneId: scene._id, notes }),
              )
            }
            onDuplicate={(includeContents) =>
              action.run(`${scene._id}:duplicate`, `Could not duplicate ${scene.name}.`, () =>
                duplicateScene({ code, dmCode, sceneId: scene._id, includeContents }),
              )
            }
            onReplaceImage={() => setReplacingId(scene._id)}
            onRemove={() =>
              action.run(`${scene._id}:remove`, `Could not delete ${scene.name}.`, () =>
                removeScene({ code, dmCode, sceneId: scene._id }),
              )
            }
          />
        ))}
      </ul>

      {/* Mounted beside the list rather than inside a row — see the ⚠️ on the dialog. */}
      <SceneReplaceDialog
        code={code}
        dmCode={dmCode}
        scene={replacing}
        onClose={() => setReplacingId(null)}
      />
    </div>
  )
}
