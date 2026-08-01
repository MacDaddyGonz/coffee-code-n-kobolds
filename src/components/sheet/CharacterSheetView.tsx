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
  const { sheet, loading, save, rename, setLevel, setLocked, setCreatureCr, resetCreature } =
    useCharacterSheet({
      code,
      characterId,
      playerId,
      dmCode,
    })
  // The seat, not just the game: a creature this player has been granted control of
  // comes back with exact hit points rather than a band, and `HpControls` offers its
  // `−`/`+` only on the exact form. The same three arguments reach `useHpActions`
  // below, whose optimistic update has to name this very cache entry.
  const vitals = useVitals(code, dmCode, playerId)
  const hp = useHpActions({ code, dmCode, playerId })

  // A toast rather than a line in the panel: by the time a refused `−5` is reported
  // the bar has already snapped back to what the server says, so there is nothing
  // left on screen for a permanent message to attach itself to. The board takes the
  // same stance with a refused move.
  useEffect(() => {
    if (hp.error) toast.error(hp.error)
  }, [hp.error])

  // The level and the lock report the same way, and for the same reason the hit-point
  // controls do: both are written the instant a button is pressed, so a refusal has no
  // half-filled form left on screen to attach a message to. The panel's own footer is
  // for the things that wait for Save.
  const announce = (refusal: Promise<string | null>) =>
    void refusal.then((message) => {
      if (message) toast.error(message)
    })

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
            the wire — an unknown id, another seat's hero, an ungranted creature and any
            creature at all come back as null so that this query cannot be used to find
            out which. A creature's existence is itself the spoiler (ADR 0004).

            ⚠️ **The copy needed a second clause once control began granting sight.** It
            named only the claim reason — *somebody else has picked it up* — and that is
            no longer the common case: a player who selects a creature the DM has not
            handed them lands here too, and the old sentence sent them to ask a player who
            does not exist. Both reasons now, still without saying which. */}
        <p>
          That sheet is not yours to read. Somebody else may have picked the character up, or the
          DM may not have handed you the creature — either way, ask whoever is running the game.
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
      code={code}
      saved={sheet}
      vitals={vitals.of(characterId)}
      // The DM code, which decides what the panel offers and nothing more — every mutation
      // behind those controls re-verifies it server-side (CLAUDE.md invariant 7). The value
      // rather than a boolean because the creature panel has a query of its own to run, and
      // a query takes the code rather than a claim about holding one.
      dmCode={dmCode}
      onAdjustHp={(delta) => void hp.adjust(characterId, delta)}
      // Reported through the same `hp.error`, and so through the same toast above.
      // `useHpActions` clears and sets one error for all of its writes precisely so a
      // caller wires one message rather than one per mutation.
      onAdjustHitDice={(delta) => void hp.adjustHitDice(characterId, delta)}
      onSave={save}
      onRename={rename}
      onSetLevel={(level) => announce(setLevel(level))}
      onSetLocked={(locked) => announce(setLocked(locked))}
      // Announced the same way and for the same reason: both land the instant the control is
      // used, so a refusal has no half-filled form left on screen to attach a message to.
      onSetCreatureCr={(cr) => announce(setCreatureCr(cr))}
      onResetCreature={() => announce(resetCreature())}
      onSetPerRest={(key, spent) => void hp.setPerRest(characterId, key, spent)}
      onLongRest={() => void hp.longRest(characterId)}
    />
  )
}
