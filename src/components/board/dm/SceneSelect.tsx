import { useId } from 'react'
import { useMutation } from 'convex/react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicScene } from '@convex/lib/scenes'

export type SceneSelectProps = {
  code: string
  dmCode: string
  scenes: PublicScene[]
  activeSceneId: Id<'scenes'> | null
}

/**
 * Which map the table is looking at, and a way to delete one.
 *
 * Deliberately the plainest thing that works: a native select and a delete
 * button. Milestone 5 owns the real DM panel — tabs, thumbnails, and a switch
 * that does not make everyone's camera jump — and building any of that here
 * would be building it twice. This exists so the DM can test with more than one
 * map before that panel arrives, which Milestone 2 needs and cannot get any other
 * way.
 *
 * Changing the select changes what every client is rendering, immediately, so it
 * is `scenes.setActive` rather than a local selection with an Apply button. The
 * list itself comes from `scenes.list`, which is DM-only and *throws* for a player
 * — a list of scene names is a spoiler, and that refusal is the design rather than
 * an oversight.
 */
export function SceneSelect({ code, dmCode, scenes, activeSceneId }: SceneSelectProps) {
  const setActive = useMutation(api.scenes.setActive)
  const removeScene = useMutation(api.scenes.remove)
  const action = useLobbyAction()
  // Not a literal: the panel is rendered from the lobby and can be rendered again
  // over the board, and two selects sharing an id break both labels.
  const fieldId = useId()

  const busy = action.pending !== null
  const active = scenes.find((scene) => scene._id === activeSceneId) ?? null

  const switchTo = (sceneId: Id<'scenes'>) =>
    void action.run('setActive', 'Could not switch to that map.', () =>
      setActive({ code, dmCode, sceneId }),
    )

  const remove = (scene: PublicScene) =>
    action.run(`remove:${scene._id}`, `Could not delete ${scene.name}.`, () =>
      removeScene({ code, dmCode, sceneId: scene._id }),
    )

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${fieldId}-scene`} className="text-xs">
          On the table
        </Label>
        <NativeSelect
          id={`${fieldId}-scene`}
          className="h-7 max-w-64 px-1.5"
          value={activeSceneId ?? ''}
          disabled={busy}
          onChange={(event) => switchTo(event.target.value as Id<'scenes'>)}
        >
          {/* Only reachable after deleting the active scene, which clears the
              pointer rather than guessing at a replacement. Picking anything here
              puts the table back on a map. */}
          {activeSceneId === null ? <option value="">No map on the table</option> : null}
          {scenes.map((scene) => (
            <option key={scene._id} value={scene._id}>
              {scene.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {active ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="sm" disabled={busy}>
              Delete this map
            </Button>
          }
          title={`Delete ${active.name}?`}
          description={
            'The map image and everywhere tokens were standing on it both go, and this cannot be undone. The tokens themselves survive — they belong to the game, so they are still there to drop onto another map. If the table is looking at this map, they will be looking at nothing until you pick another.'
          }
          confirmLabel="Delete the map"
          busy={action.pending === `remove:${active._id}`}
          onConfirm={() => remove(active)}
        />
      ) : null}
    </div>
  )
}
