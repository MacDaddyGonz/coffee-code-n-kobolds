import { useState } from 'react'
import { useMutation } from 'convex/react'

import { CreateDialog } from '@/components/board/dm/CreateDialog'
import { api } from '@convex/_generated/api'
import {
  CreatureSheetFields,
  creatureSheetFrom,
  creatureStatsProblem,
  defaultCreatureStats,
} from './CreatureSheetFields'

export type CreatureCreateDialogProps = {
  code: string
  /** Present means this browser holds it; `characters.create` re-verifies it. */
  dmCode: string
}

/**
 * A new creature by hand: a name, an armour class, a number of hit points, and whether
 * it is an NPC or a monster.
 *
 * One round trip, because `characters.create` takes the whole sheet. A character is
 * created bare and has its sheet filled in afterwards, and the difference is not an
 * inconsistency: a hero is a thing somebody spends an evening building, whereas a goblin
 * is three numbers the DM wants on the board before the party finishes opening the door.
 *
 * **The DM code is what makes this reachable at all.** `characters.create` demands it on
 * every path and checks it against the game document, so this dialog being on screen is a
 * consequence of holding the code rather than a substitute for it — CLAUDE.md invariant
 * 7. A player who posted the same arguments without the code would be refused by the
 * mutation, which is where the rule lives.
 *
 * **Everything that is not those three numbers is `CreateDialog`'s**, and the stats are
 * the reason the seam is where it is. They are state with a default, a reset and a
 * validator, so they stay here and cross as two props — `fields`, which is a function of
 * `busy` so the inputs go dead while the mutation carrying them is in the air, and
 * `problem`, which the shared dialog merges into the same line the server's refusal uses.
 * A `variant` flag on one component instead would put a creature's armour class in front
 * of a caller adding a hero.
 */
export function CreatureCreateDialog({ code, dmCode }: CreatureCreateDialogProps) {
  const createCharacter = useMutation(api.characters.create)

  // Held here rather than inside the dialog, and so surviving a close — which is why
  // `onReset` below is passed explicitly rather than being something the shared dialog
  // could do on its own.
  const [stats, setStats] = useState(defaultCreatureStats)

  return (
    <CreateDialog
      triggerLabel="Build a creature"
      title="Build a creature"
      description="The sheet is yours alone — the server refuses a creature to anyone without the DM code, with the same answer it gives for a character that does not exist."
      placeholder="Goblin archer"
      submitLabel="Add the creature"
      fallbackError="Could not add that creature."
      onCreate={(name) => createCharacter({ code, dmCode, name, sheet: creatureSheetFrom(stats) })}
      toastFor={(name) => `${name} is yours to run. Nobody else can see the sheet.`}
      fields={(busy) => <CreatureSheetFields stats={stats} onChange={setStats} disabled={busy} />}
      problem={creatureStatsProblem(stats)}
      onReset={() => setStats(defaultCreatureStats())}
    />
  )
}
