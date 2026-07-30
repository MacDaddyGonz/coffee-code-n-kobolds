import { useEffect } from 'react'
import { toast } from 'sonner'

import { CharacterSheetEditor } from '@/components/sheet/CharacterSheetEditor'
import { Skeleton } from '@/components/ui/skeleton'
import { useCharacterSheet } from '@/hooks/useCharacterSheet'
import { useHpActions, useVitals } from '@/hooks/useVitals'
import type { Id } from '@convex/_generated/dataModel'

export type CharacterSheetViewProps = {
  code: string
  characterId: Id<'characters'>
  /** Routing, not identity — see `useCharacterSheet`. */
  playerId: Id<'players'> | null
  /** Present means this browser holds it; every call re-verifies it server-side. */
  dmCode: string | null
}

/**
 * One character's sheet: the two subscriptions it needs, and what to draw before
 * they answer.
 *
 * Two rather than one, and the split is the same one the board makes for the same
 * reason (CLAUDE.md invariant 2). A sheet changes when somebody edits their build;
 * hit points change several times a round. Folding them together would re-push a
 * whole spell list to everyone with the panel open each time the party took damage.
 *
 * Mounted only while the panel is open — Radix renders no content for a closed
 * dialog — so a table of six is not holding six idle subscriptions each.
 */
export function CharacterSheetView({
  code,
  characterId,
  playerId,
  dmCode,
}: CharacterSheetViewProps) {
  const { sheet, loading, save, rename } = useCharacterSheet({
    code,
    characterId,
    playerId,
    dmCode,
  })
  const vitals = useVitals(code, dmCode)
  const hp = useHpActions({ code, dmCode, playerId })

  // A toast rather than a line in the panel: by the time a refused `−5` is reported
  // the bar has already snapped back to what the server says, so there is nothing
  // left on screen for a permanent message to attach itself to. The board takes the
  // same stance with a refused move.
  useEffect(() => {
    if (hp.error) toast.error(hp.error)
  }, [hp.error])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="text-muted-foreground p-4">
        {/* Every refusal reads the same here because every refusal *is* the same on
            the wire — an unknown id, another seat's hero and any NPC all come back as
            null so that this query cannot be used to find out which. An NPC's
            existence is itself the spoiler (ADR 0004). */}
        <p>
          That character is not available to you. If somebody else has picked it up, ask them or
          whoever is running the game.
        </p>
      </div>
    )
  }

  return (
    <CharacterSheetEditor
      // Remounted when the character changes, so a half-typed draft can never carry
      // across from the last one. `MapSetupPanel` keys its calibrator on the scene
      // for exactly the same reason.
      key={sheet._id}
      saved={sheet}
      vitals={vitals.of(characterId)}
      onAdjustHp={(delta) => void hp.adjust(characterId, delta)}
      // Reported through the same `hp.error`, and so through the same toast above.
      // `useHpActions` clears and sets one error for all of its writes precisely so a
      // caller wires one message rather than one per mutation.
      onAdjustHitDice={(delta) => void hp.adjustHitDice(characterId, delta)}
      onSave={save}
      onRename={rename}
    />
  )
}
