import { useQuery } from 'convex/react'

import { sheetArgs } from '@/hooks/useCharacterSheet'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicSheet } from '@convex/lib/characters'

/**
 * One coin's sheet, read-only, for the hover card.
 *
 * ⚠️ **A second hook over `characters.sheet` rather than `useCharacterSheet`, and the
 * difference is six `useMutation`s.** That hook exists to *edit* a sheet: it builds save,
 * rename, level, unlock, scale and reset on every mount, and the card presses none of them.
 * Mounting it on hover would allocate six mutation closures every time somebody rested the
 * pointer on a goblin. The read is the same read — the **same `sheetArgs` builder**, so when
 * the right-hand panel is already open on the same creature the two name one cache entry
 * rather than holding two subscriptions to one query.
 *
 * ⚠️⚠️ **WHAT ARRIVES HERE IS DECIDED ENTIRELY BY THE SERVER, AND THIS IS THE PARAGRAPH TO
 * READ BEFORE CHANGING THE CARD.** `characters.sheet` answers through
 * `findEditableCharacter` with `allowControl: true` — so it returns `null` for an ordinary
 * NPC, for another seat's hero, for a character in another game and for one that does not
 * exist, **all four as the same answer**, because an NPC's existence is itself a spoiler
 * (`CHARACTER_NOT_FOUND` in convex/lib/characters.ts). The card therefore has nothing to
 * draw rather than something to hide, which is CLAUDE.md invariant 1 as a *shape* rather
 * than as a condition somebody remembered to write.
 *
 * **That set is narrower than the vitals row's, on purpose, and the asymmetry is honest.**
 * A player receives the `exact` vitals variant for *every* hero at the table — the party's
 * hit points are nobody's secret — while this refuses a teammate's sheet, because a sheet is
 * whose character it is. So a player hovering a friend's coin reads its armour class and its
 * hit points and not its speed. The alternative is a **new field on `visibleVitals`**, which
 * is a decision about what this application publishes and needs an ADR of its own; it is
 * emphatically not something a hover card reaches for on the way past.
 *
 * `playerId` is routing and never proof of identity (CLAUDE.md invariant 7): the server
 * re-derives the claim and the grant from its own tables on every execution, and passing
 * somebody else's seat id buys exactly what the threat model says it buys.
 */
export function useCoinSheet(args: {
  code: string
  characterId: Id<'characters'> | null
  playerId: Id<'players'> | null
  dmCode: string | null
}): PublicSheet | null {
  const { code, characterId, playerId, dmCode } = args

  // Skipped outright when there is no creature behind the coin — a scenery marker, a summon
  // nobody wrote a sheet for — rather than asked about nothing. "No character" is not a set
  // of arguments, which is why `sheetArgs` takes the id non-null.
  const sheet = useQuery(
    api.characters.sheet,
    characterId === null ? 'skip' : sheetArgs({ code, characterId, playerId, dmCode }),
  )

  // A pending query and a refusal are one answer here, unlike `useCharacterSheet` which
  // separates them for a panel that has a skeleton to show. The card is a tooltip: a line
  // that appears a beat late is right, and a line that says *loading* over a map is not.
  return sheet ?? null
}
