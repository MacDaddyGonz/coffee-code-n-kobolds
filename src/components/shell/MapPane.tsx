import type { ReactElement } from 'react'
import { memo, useRef } from 'react'

import { Board } from '@/components/board/Board'
import { TableEffects } from '@/components/board/TableEffects'
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
  /**
   * The shell's selection, threaded through to the board. ⚠️ **Two primitives and
   * stable callbacks, never a selection object** — see the memo note below and the
   * one in `GameShell`.
   */
  selectedTokenId: Id<'tokens'> | null
  onSelectToken: (tokenId: Id<'tokens'>) => void
  onClearSelection: () => void
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
 * being defeated by a fresh object. `dm` is the one that had to be made so: `useDm`
 * returns a fresh object per render, and `Game` re-renders on every join, rename and
 * claim because `useSeat` subscribes to the roster — so before it was memoised, one
 * person joining reconciled the whole board and the whole panel. A drag never did,
 * which is why this held for its stated purpose while quietly failing for another. The board's own `ResizeObserver` is what makes
 * the canvas follow the divider, and it needs no render of this component to do it.
 *
 * ⚠️ **Selection is the second piece of `GameShell` state and must not defeat that
 * memo.** It arrives as a token id and two callbacks built with `useCallback([])`,
 * so the id changes only when the selection genuinely does and the callbacks never
 * change at all. A `{ tokenId, characterId }` object would be a new prop on every
 * frame of a divider drag, and the symptom — the whole board tree reconciling sixty
 * times a second — would read as a performance regression with no obvious cause.
 */
export const MapPane = memo(function MapPane({
  code,
  game,
  dm,
  playerId,
  characterId,
  selectedTokenId,
  onSelectToken,
  onClearSelection,
}: MapPaneProps): ReactElement {
  const playing = game.status === 'playing' && game.activeSceneId !== null

  /**
   * The pane itself, for the one effect that has to move it rather than something in it.
   *
   * A critical miss shakes the map, and the thing that must *not* move is the header and
   * the right-hand panel — a transform on `<body>` would take both with it, and on a
   * `h-dvh` shell that reads as the application breaking rather than as a die landing
   * badly. So `CritEffect` is handed this element and adds a class to it. A ref costs no
   * render, which is what lets it happen behind the memo below rather than through it.
   */
  const paneRef = useRef<HTMLDivElement>(null)

  return (
    // ⚠️ **`overflow-hidden` is here for the shake and for nothing else.** The pane is
    // transformed a few pixels for half a second on a critical miss, and without this its
    // contents would slide out over the divider and the right-hand panel on the way. It
    // clips nothing today — `Board` is already its own `overflow-hidden` box and the roster
    // is inset — and any panel that has to escape the pane is a portal (every shadcn
    // dialog, sheet and tooltip in this app already is), so the class is free in both
    // directions.
    <div ref={paneRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {playing ? (
        // `min-h-0` again on the board itself: it is a flex item of this column and a
        // scroll container of its own, and without it the canvas's own height becomes
        // the pane's floor rather than the other way round.
        <Board
          code={code}
          dm={dm}
          playerId={playerId}
          myCharacterId={characterId}
          selectedTokenId={selectedTokenId}
          onSelectToken={onSelectToken}
          onClearSelection={onClearSelection}
          className="min-h-0 flex-1"
        />
      ) : (
        <MapPanePlaceholder isDm={dm.dmCode !== null} runBy={game.createdByName} />
      )}

      {/* The caller passes the placement, which is this file's job and not the
          roster's — see its own note about what it deliberately does not decide. */}
      <Roster code={code} className="absolute right-3 bottom-3" />

      {/*
        WHAT HAPPENS WHEN SOMEBODY ROLLS — the floating announcement, the 3D dice and the
        crit effects, mounted once.

        **Outside both branches above, for the same reason the roster is.** A roll made off
        a sheet before the DM presses Start still has to be confirmed to whoever made it,
        and the person who clicked is looking at their own sheet in the right-hand panel and
        cannot see the feed line they just created — that is the whole reason this exists,
        and it does not stop being true in the lobby.

        ⚠️ **No new props on `MapPaneProps`, and it subscribes for itself.** The memo note
        above is the reason: every prop this pane takes is stable on purpose, because the
        divider sets the pane width sixty times a second. `TableEffects` is handed only the
        three primitives that were already here plus a ref, and holds its own `feed.list`
        and `board.tokens` subscriptions — the second of which shares a cache entry with
        `Board` and `RightPane` rather than opening a third.

        Last of the three children, so the dice and the announcement paint over the board
        and the roster. All three of its layers are `pointer-events-none`, so nothing here
        can be the overlay that silently swallows a click meant for a token.
      */}
      <TableEffects code={code} dmCode={dm.dmCode} playerId={playerId} paneRef={paneRef} />
    </div>
  )
})
