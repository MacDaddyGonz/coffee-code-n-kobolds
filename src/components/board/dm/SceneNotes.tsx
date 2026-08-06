import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_SCENE_NOTES_LENGTH } from '@convex/lib/codes'
import type { DmScene } from '@convex/lib/scenes'

export type SceneNotesProps = {
  scene: DmScene
  busy: boolean
  onCancel: () => void
  /** Resolves false when the server refused, which keeps the draft open to fix. */
  onSubmit: (notes: string) => Promise<boolean>
}

/**
 * The DM's prep for one board, edited in place under its row.
 *
 * ⚠️ **THE ONE FIELD IN THIS PANEL THAT NO PLAYER IS EVER SENT, AND THE COMPONENT CANNOT BE
 * WHAT MAKES THAT TRUE.** `scene.notes` arrives on `DmScene`, which comes from `scenes.list`
 * — a query that *throws* without the DM code. `scenes.active`, which every player at the
 * table subscribes to, carries `PublicScene` and has nowhere to put this. So the secrecy is
 * a property of the payload rather than of this file, which is the whole of CLAUDE.md
 * invariant 1: hiding it in the browser would not be security, and there is nothing here to
 * hide because there is nothing here to send.
 *
 * ⚠️ **A draft with an explicit Save, unlike the colour picker and the grid calibrator.**
 * Those two commit live because their intermediate values are something the DM is *watching*
 * — the lines moving, the swatch changing — and a round trip per keystroke is what
 * `useGridWrite` exists to throttle. Prose has no intermediate value worth looking at, and a
 * write per character would push the scene document to `scenes.list` a hundred times while
 * somebody types a sentence. `SceneRenameForm` beside this makes the same choice for the same
 * reason, one field over.
 *
 * The counter appears only near the limit. A number under everything the DM types is noise
 * for the 1990 characters where it says nothing, and the one thing it has to do — explain a
 * Save that is about to be refused — it can do in the last tenth.
 *
 * A blank is legal and is how notes are cleared: `requireSceneNotes` accepts it, and
 * `scenes.setNotes` removes the column rather than storing an empty string, so there is one
 * stored spelling of "none". That is why Save is live on an empty field where
 * `SceneRenameForm`'s is not.
 */
export function SceneNotes({ scene, busy, onCancel, onSubmit }: SceneNotesProps) {
  // Not a literal: Radix can have the Map tab mounted more than once — a tab kept alive
  // behind the one on screen is still in the document — and two fields sharing an id is a
  // label that focuses the wrong control. `SceneRenameForm` carries the same note.
  const fieldId = useId()
  const [value, setValue] = useState(scene.notes)

  const remaining = MAX_SCENE_NOTES_LENGTH - value.length
  const dirty = value !== scene.notes

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(value)
      }}
    >
      <Label htmlFor={fieldId} className="text-muted-foreground text-xs">
        Notes for {scene.name} — only you ever see these
      </Label>
      <Textarea
        id={fieldId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        // The same constant the server measures against, in the same unit, so the field
        // stops exactly where `requireSceneNotes` would have refused.
        maxLength={MAX_SCENE_NOTES_LENGTH}
        autoFocus
        className="max-h-64"
        placeholder="What is in this room, what the party has already seen, what happens when they open the door."
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !dirty}>
          Save notes
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {remaining <= MAX_SCENE_NOTES_LENGTH / 10 ? (
          <span className="text-muted-foreground text-xs">{remaining} characters left</span>
        ) : null}
      </div>
    </form>
  )
}
