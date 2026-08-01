import type { ReactElement } from 'react'
import { useCallback, useId, useRef, useState } from 'react'

import { GameHeader } from '@/components/shell/GameHeader'
import { MapPane } from '@/components/shell/MapPane'
import { PaneResizer } from '@/components/shell/PaneResizer'
import { RightPane } from '@/components/shell/RightPane'
import type { Dm } from '@/hooks/useDm'
import { usePaneWidth } from '@/hooks/usePaneWidth'
import type { PublicGame } from '@/hooks/useSeat'
import type { Id } from '@convex/_generated/dataModel'

export type GameShellProps = {
  code: string
  game: PublicGame
  dm: Dm
  /** The seated route only. `Game.tsx` decides that; this component assumes it. */
  playerId: Id<'players'>
  displayName: string | null
  characterId: Id<'characters'> | null
  characterName: string | null
  /** Rename this seat, storage included. Owned by useSeat. */
  onRenameSeat: (displayName: string) => Promise<void>
  /** Give up this seat and drop back to the name gate. Owned by useSeat. */
  onLeaveSeat: () => Promise<void>
}

/**
 * The seated game screen: a header, a map, a panel, and the divider between them.
 *
 * **The non-scrolling shell is this route's own property and is declared on this
 * element**, which is the thing to understand before changing anything about it.
 * There is deliberately no edit to `index.css`, `main.tsx` or `index.html`: `h-dvh`
 * is viewport-relative, so it needs no height on `html`, `body` or `#root`, and a
 * global `body { overflow: hidden }` would break the home screen and the pre-seat
 * states, which are supposed to scroll. One route wanting to be exactly one screen
 * tall is not a reason to make every route unable to grow.
 *
 * `h-dvh` rather than `h-screen` because `dvh` does not lie. The two are identical on
 * a desktop browser — which is the only thing this application targets, by
 * [ADR 0001](docs/adr/0001-platform-and-hosting.md) — but `vh` is defined against the
 * *largest* viewport, so anywhere a toolbar can retract it describes a box taller than
 * the one you can see, and the bottom of the panel is under the chrome. Choosing the
 * unit that means what it says costs nothing.
 *
 * ⚠️ **`min-h-0` runs down six links from here and every one of them is load-bearing.**
 * A flex item's default `min-height` is `auto`, meaning "at least as tall as my
 * content", so a single omission converts *scroll inside a fixed height* into *grow
 * and push* — and the symptom appears levels away from the cause, which is why each
 * one is commented with what specifically breaks. They are: the body row below,
 * `MapPane`, the `<aside>`, the `Tabs` root, each `TabsContent`, and `TabPane`.
 *
 * ⚠️ **Selection lives here, and it is passed down as primitives — never as an
 * object.** Both panes are `memo`'d, and the memos are load-bearing: the divider's
 * width is state on this component too, and a drag sets it sixty times a second
 * while neither pane reads it. A `{ tokenId, characterId }` prop would be a fresh
 * object on every one of those frames, defeating both memos at once and reconciling
 * the whole board and the whole panel to produce byte-identical output. The symptom
 * is a slow divider and there is nothing in the profiler pointing at the cause, so
 * the rule is written down in three places rather than discovered again.
 */
export function GameShell({
  code,
  game,
  dm,
  playerId,
  displayName,
  characterId,
  characterName,
  onRenameSeat,
  onLeaveSeat,
}: GameShellProps): ReactElement {
  // The body row is what the two panes divide between them, so it is what gets
  // measured — not the window. Anything that changes the header's height changes this
  // number without the window having moved at all.
  const bodyRef = useRef<HTMLDivElement>(null)
  const pane = usePaneWidth({ code, containerRef: bodyRef })

  // Generated rather than a literal, because `aria-controls` has to point at a real
  // element and a hard-coded id is a duplicate waiting for the second shell on a page.
  const paneId = useId()

  /**
   * What the table is currently talking about, in two pieces.
   *
   * **A token id alone is not enough**, which is the whole reason there are two.
   * A character routinely has no token at all — the bestiary shelf creates a
   * creature and never places one, and so does the DM's new-character form — so
   * choosing such a row with only a token id to write would leave the *previous*
   * token selected and the previous creature on screen, which is exactly the
   * confusion lifting selection up here was meant to end.
   *
   * They are two `useState` calls rather than one object for the memo reason in the
   * comment above: what crosses the pane boundary has to be primitive, and building
   * an object here to take apart at the other end would be the same fresh identity
   * with an extra step.
   */
  const [selectedTokenId, setSelectedTokenId] = useState<Id<'tokens'> | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = useState<Id<'characters'> | null>(null)

  /**
   * The three ways the selection changes. All `useCallback([])` — the setters are
   * stable, so these are too, and a pane's memo sees the same three functions for
   * the life of the game.
   */

  // A click on a coin. Clearing the direct pick is what makes the map able to take
  // over from the selector: without it, a creature chosen from the DM's list would
  // keep winning `sheetFocusOf`'s first rule and the next click on the board would
  // move a ring while the panel went on showing the old sheet.
  const selectToken = useCallback((tokenId: Id<'tokens'>) => {
    setSelectedTokenId(tokenId)
    setSelectedCharacterId(null)
  }, [])

  // A choice from the DM's sheet selector. The token is whatever that creature has
  // on this scene, or null — and null is a real answer, not a missing one, so the
  // caller passes it explicitly rather than leaving the argument off.
  const selectCharacter = useCallback(
    (characterId: Id<'characters'>, tokenId: Id<'tokens'> | null) => {
      setSelectedCharacterId(characterId)
      setSelectedTokenId(tokenId)
    },
    [],
  )

  // Both, always. Half a selection is the state that produces a panel pointing at
  // one creature and a ring drawn around another.
  const clearSelection = useCallback(() => {
    setSelectedTokenId(null)
    setSelectedCharacterId(null)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <GameHeader
        name={game.name}
        runBy={game.createdByName}
        code={game.code}
        displayName={displayName}
        characterName={characterName}
      />

      {/* `min-h-0`: without it this row is at least as tall as the taller of its two
          panes, the column above grows past the viewport, and the bottom of the
          right-hand panel becomes unreachable — the Save button included, on a screen
          that has `overflow-hidden` and so cannot be scrolled to it. */}
      <div ref={bodyRef} className="flex min-h-0 flex-1">
        <MapPane
          code={code}
          game={game}
          dm={dm}
          playerId={playerId}
          characterId={characterId}
          selectedTokenId={selectedTokenId}
          onSelectToken={selectToken}
          onClearSelection={clearSelection}
        />

        {/* ⚠️ A sibling of the map pane, never a child of it. `useBoardKeys` gates its
            shortcuts on the board container holding focus, so a resizer inside that
            container would have every arrow press pan the map *and* move the divider.
            See `PaneResizer`. */}
        <PaneResizer
          width={pane.width}
          min={pane.min}
          max={pane.max}
          controls={paneId}
          onResize={pane.setWidth}
          onReset={pane.reset}
        />

        {/* `min-h-0` again, for the sharpest version of the failure: this is the
            column `CharacterSheetEditor` pins its footer to the bottom of, so without
            it the fields stop scrolling, the column grows to fit them and Save goes
            below the fold — which is precisely what the pinned footer exists to
            prevent. `shrink-0` because the width is the divider's to decide; letting
            flex negotiate it would make a wide map quietly overrule the drag. */}
        <aside
          id={paneId}
          style={{ width: pane.width }}
          className="flex min-h-0 shrink-0 flex-col border-l"
        >
          <RightPane
            code={code}
            game={game}
            dm={dm}
            playerId={playerId}
            characterId={characterId}
            selectedTokenId={selectedTokenId}
            selectedCharacterId={selectedCharacterId}
            onSelectToken={selectToken}
            onSelectCharacter={selectCharacter}
            onClearSelection={clearSelection}
            onRenameSeat={onRenameSeat}
            onLeaveSeat={onLeaveSeat}
          />
        </aside>
      </div>
    </div>
  )
}
