import type { ReactElement } from 'react'
import { memo } from 'react'

import { Board } from '@/components/board/Board'
import { MapPanePlaceholder } from '@/components/shell/MapPanePlaceholder'
import { Roster } from '@/components/shell/Roster'
import type { Dm } from '@/hooks/useDm'
import type { PublicGame } from '@/hooks/useSeat'
import type { Id } from '@convex/_generated/dataModel'

export type MapPaneProps = {
  code: string
  /** Taken whole: the pane needs both the status and whether there is a scene. */
  game: PublicGame
  dm: Dm
  playerId: Id<'players'>
  /** The character this seat is playing, which decides which token it may drag. */
  characterId: Id<'characters'> | null
}

/**
 * The left pane: the map, or the reason there is not one, with the roster over it.
 *
 * **The `relative` here is load-bearing** — it is the positioning ancestor the roster
 * is placed against, and the roster deliberately positions nothing itself so that the
 * one component knowing where it goes is the one that knows what it is over. That is
 * also why the roster sits outside the two branches below rather than inside each:
 * the seats stay exactly where they are when the DM presses Start, and the map slides
 * in underneath them.
 *
 * **The start condition moved here out of the route**, and it is still two tests
 * rather than one. `games.start` refuses without an active scene, but a scene deleted
 * mid-game would otherwise leave the whole table on a blank canvas with the way back
 * three clicks deep in a panel only the DM can see. Everyone is already subscribed to
 * the game document, so the DM's click on Start turns the whole table over on this one
 * condition rather than on a message each.
 *
 * `min-w-0` is the other class that has to be here and is easy to lose: a `flex-1`
 * item will not shrink below its content's intrinsic width, and the Konva `<canvas>`
 * carries an explicit `width` attribute — so without it, dragging the divider left
 * pushes the canvas out of the pane instead of shrinking it, and the board's
 * `ResizeObserver` never hears about the smaller box.
 *
 * ⚠️ **Memoised, and the divider is the reason.** The pane width lives in state in
 * `GameShell`, and a drag sets it on every pointer move — so without this, sixty
 * frames a second each reconcile the whole board tree and the whole right-hand panel
 * to produce byte-identical output, because neither pane reads the width. Every prop
 * here is stable across the parent's re-renders (the game document comes from a
 * subscription, the rest from the route), so the memo actually holds rather than
 * being defeated by a fresh object. The board's own `ResizeObserver` is what makes
 * the canvas follow the divider, and it needs no render of this component to do it.
 */
export const MapPane = memo(function MapPane({
  code,
  game,
  dm,
  playerId,
  characterId,
}: MapPaneProps): ReactElement {
  const playing = game.status === 'playing' && game.activeSceneId !== null

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {playing ? (
        // `min-h-0` again on the board itself: it is a flex item of this column and a
        // scroll container of its own, and without it the canvas's own height becomes
        // the pane's floor rather than the other way round.
        <Board
          code={code}
          dm={dm}
          playerId={playerId}
          myCharacterId={characterId}
          className="min-h-0 flex-1"
        />
      ) : (
        <MapPanePlaceholder isDm={dm.dmCode !== null} runBy={game.createdByName} />
      )}

      {/* The caller passes the placement, which is this file's job and not the
          roster's — see its own note about what it deliberately does not decide. */}
      <Roster code={code} className="absolute right-3 bottom-3" />
    </div>
  )
})
