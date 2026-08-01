import type { ReactElement } from 'react'
import { useId, useRef } from 'react'

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
            onRenameSeat={onRenameSeat}
            onLeaveSeat={onLeaveSeat}
          />
        </aside>
      </div>
    </div>
  )
}
