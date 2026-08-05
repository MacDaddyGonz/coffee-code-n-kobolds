import type { ReactElement } from 'react'
import { useCallback, useId, useRef, useState } from 'react'

import { ModalImageViewer } from '@/components/ModalImageViewer'
import { GameHeader } from '@/components/shell/GameHeader'
import { MapPane } from '@/components/shell/MapPane'
import { PaneResizer } from '@/components/shell/PaneResizer'
import type { TabValue } from '@/components/shell/RightPane'
import { RightPane } from '@/components/shell/RightPane'
import type { Dm } from '@/hooks/useDm'
import { usePaneWidth } from '@/hooks/usePaneWidth'
import { RollProvider } from '@/hooks/useRoll'
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
   * The four ways the selection changes. All `useCallback([])` — the setters are
   * stable, so these are too, and a pane's memo sees the same four functions for
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

  /**
   * A coin that no longer exists, because the DM deleted it.
   *
   * ⚠️ **Deliberately not `clearSelection`, and the difference is which half stops
   * being true.** That one is a *gesture* — "I am done with this creature" — so it
   * clears both, for the reason above. This is a *fact*, and it clears exactly the
   * half the fact is about. A DM who picked the creature out of the Sheets selector
   * and then deleted its coin is still looking at that sheet, and
   * `{ characterId: X, tokenId: null }` is precisely the state `selectCharacter(X,
   * null)` already produces for a creature with no coin on this board.
   *
   * ⚠️ **And this is a genuinely new case rather than one `useTokenSelection` already
   * covers.** That hook resolves the ring against the live board every render and
   * gives three reasons a non-matching id is kept — positions arriving a beat late, a
   * scene switched away from and back, a character claimed and unclaimed — and every
   * one of them is *it might return*. A deleted coin cannot. Nor is leaving it set
   * inert: `sheetFocusOf`'s fourth rule fires for a DM holding a `selectedTokenId`
   * with no binding, so the Sheets panel would print *this token carries no sheet*
   * about a token that has ceased to exist.
   *
   * The functional update is load-bearing rather than stylistic. It is what keeps
   * this `useCallback([])` like the three above, so neither pane's memo is defeated by
   * a handler whose identity tracks the current selection — and it is what lets the
   * board hand this the id of a coin that was never selected, from a menu opened on
   * one coin while the ring sits on another.
   */
  const forgetToken = useCallback((tokenId: Id<'tokens'>) => {
    setSelectedTokenId((current) => (current === tokenId ? null : current))
  }, [])

  /**
   * WHICH TAB THE RIGHT-HAND PANE IS SHOWING — the third piece of shell state, and it
   * arrived the same way the selection did: because two panes needed to agree about it.
   *
   * ⚠️ **It was `useState` inside `RightPane`, and that is why the board's right-click
   * menu had two entries that did nothing.** *Edit this coin* and *Open the sheet* name
   * two panels under two different tabs; with the value held in the pane, `Board` could
   * reach neither, so both selected a coin and left the reader exactly where they were.
   * The two menu entries were literally the same function. Nothing caught it: the wiring
   * compiles, no mutation is involved, and the symptom is a tab that stays put.
   *
   * The default is the **sheet** rather than the feed, because the feed is empty until the
   * dice land and opening a game on an empty panel reads as a broken app.
   *
   * ⚠️ **And the sheet rather than the *table*, which is the improvement somebody will
   * reasonably try to make.** A brand-new player has no character, so this opens on the
   * Character tab's empty state — which looks like the wrong tab to have chosen and is the
   * right one: that empty state is one click from the list, and the claim comes straight
   * back to the sheet, so the whole route is *one* click away from what the reader wants.
   * Defaulting to Table makes it two, and does it by putting every returning player — who
   * has a character and came to look at it — on a roster they did not ask for.
   *
   * **What is deliberately not here is which tabs exist.** A DM who stands down loses two
   * of the six, and `RightPane`'s `onStrip` still answers that against its own
   * `DM_ONLY_TABS`. This holds an intention; the pane decides what is reachable. So a tab
   * asked for that this caller does not have falls back exactly as it did before.
   */
  const [tab, setTab] = useState<TabValue>('sheet')

  /**
   * The two board gestures that mean *take me to a panel*, and the whole of what they add
   * over `selectToken` is naming a tab.
   *
   * ⚠️ **Two functions rather than one with an argument**, because the call sites are two
   * menu entries with two labels and the failure being fixed is precisely that they were
   * one function. A `showToken(id, tab)` would compile with both call sites passing the
   * same second argument, which is the bug in a shape that still type-checks.
   *
   * Both compose `selectToken` rather than repeating its body — clearing the direct
   * character pick matters here for the same reason it matters there — and both stay
   * `useCallback` on stable deps, so neither pane's memo notices them.
   */
  const editToken = useCallback(
    (tokenId: Id<'tokens'>) => {
      selectToken(tokenId)
      setTab('tokens')
    },
    [selectToken],
  )

  const openTokenSheet = useCallback(
    (tokenId: Id<'tokens'>) => {
      selectToken(tokenId)
      setTab('sheet')
    },
    [selectToken],
  )

  return (
    /*
      ⚠️ **THE ROLL PROVIDER IS HERE AND USED TO BE INSIDE `RightPane`, WHICH `useRoll.ts`
      EXPLICITLY WARNS AGAINST. Read that note before moving it again.**

      It has to wrap everything that sends a roll. That used to be "two of the six tabs in
      one pane", so the pane was the right home; the roll modes are on the *map* now, so
      both panes need it and it belongs to the thing that owns both — the same reason the
      selection and the tab live here.

      What makes it safe is the property that warning names, and it holds by construction
      rather than by luck: both context values are `useMemo`'d on dependencies that move only
      on a human action, and the two senders are stable for the whole session because the
      provider reads the mode from refs. So the divider re-rendering this component sixty
      times a second produces the same two objects and re-renders no consumer; and a mode
      flip re-renders the provider with an unchanged `children` element reference, which
      React bails out of. Both panes' memos keep doing their job either way.

      The warning is still right about the general case and is still there. What changed is
      that this value satisfies the condition it names — a different sentence from the
      warning having been wrong.
    */
    <RollProvider code={code} playerId={playerId} dmCode={dm.dmCode}>
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
            onTokenGone={forgetToken}
            onEditToken={editToken}
            onOpenTokenSheet={openTokenSheet}
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
              tab={tab}
              onTabChange={setTab}
              selectedTokenId={selectedTokenId}
              selectedCharacterId={selectedCharacterId}
              onSelectToken={selectToken}
              onSelectCharacter={selectCharacter}
              onClearSelection={clearSelection}
              onTokenGone={forgetToken}
              onRenameSeat={onRenameSeat}
              onLeaveSeat={onLeaveSeat}
            />
          </aside>
        </div>

        {/* Here rather than in a panel, because nothing on this screen opens it: the DM's
            click happens on another machine and arrives as a change to `modalImages.open`.
            One mount for the whole route, so a handout cannot be shown twice at once. */}
        <ModalImageViewer code={code} dmCode={dm.dmCode} />
      </div>
    </RollProvider>
  )
}
