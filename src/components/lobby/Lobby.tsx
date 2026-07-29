import { useQuery } from 'convex/react'

import { DmBar } from '@/components/lobby/dm/DmBar'
import type { Dm } from '@/hooks/useDm'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { LobbyCharacters } from './LobbyCharacters'
import { LobbyRoster } from './LobbyRoster'

export type LobbyProps = {
  code: string
  playerId: Id<'players'>
  dm: Dm
  /** Rename this seat, storage included. Owned by useSeat. */
  onRenameSeat: (displayName: string) => Promise<void>
  /** Give up this seat and drop back to the name gate. Owned by useSeat. */
  onLeaveSeat: () => Promise<void>
}

/**
 * The lobby: who has joined, and which character each of them is playing.
 *
 * Two live subscriptions — api.players.list and api.characters.list — so a
 * second browser joining, or claiming a character, appears here without a
 * refresh. That is the milestone's headline acceptance test.
 *
 * Owns the per-seat and per-character DM affordances too (assign a character to
 * a seat, remove a seat, delete a character), shown only when this browser holds
 * a `dm.dmCode`, and passing it to the mutations that require it. Renders
 * <DmBar> for the game-level DM controls.
 */
export function Lobby({ code, playerId, dm, onRenameSeat, onLeaveSeat }: LobbyProps) {
  const seats = useQuery(api.players.list, { code })
  const characters = useQuery(api.characters.list, { code })

  // The roster takes the character list too: the DM's assign dialog picks from
  // it, and a third subscription for the same rows would buy nothing.
  return (
    <div className="flex flex-col gap-6">
      <DmBar code={code} dm={dm} />
      <LobbyRoster
        code={code}
        playerId={playerId}
        seats={seats}
        characters={characters}
        dm={dm}
        onRenameSeat={onRenameSeat}
        onLeaveSeat={onLeaveSeat}
      />
      <LobbyCharacters code={code} playerId={playerId} characters={characters} dm={dm} />
    </div>
  )
}
