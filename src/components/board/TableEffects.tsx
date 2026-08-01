import type { ReactElement, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'

import { CritEffect } from '@/components/board/CritEffect'
import { DiceTrayLayer } from '@/components/board/DiceTrayLayer'
import { RollAnnouncement } from '@/components/board/RollAnnouncement'
import { tokensArgs } from '@/hooks/useBoard'
import type { PublicFeedRow } from '@/hooks/useFeed'
import { useFeed } from '@/hooks/useFeed'
import type { ShownDie } from '@/lib/dice/notation'
import { api } from '@convex/_generated/api'

/** How long the total stays up once the dice have settled. */
const HOLD_MS = 2200

/**
 * How long the line takes to fade out.
 *
 * ⚠️ **Must match `kk-announce-out` in `index.css`.** An element cannot animate its own
 * removal, so the line stays mounted through the fade and this is the timer that finally
 * takes it away. Shorter than the animation and it disappears mid-fade; much longer and
 * there is a stretch where a fully transparent overlay is still in the tree.
 */
const FADE_MS = 260

/**
 * What is on screen, as one value rather than three flags.
 *
 * A single state field with a three-way phase, deliberately: every transition here is
 * "this roll has moved on" or "a newer roll has replaced it", and both are one assignment.
 * Separate `revealed` / `leaving` booleans beside a row would make the impossible states
 * — leaving before revealed, revealed with no row — representable, and each of them would
 * be a stuck announcement rather than a visible bug.
 *
 * - **`sentence`** — the line is up and the dice are in the air.
 * - **`result`** — the dice have settled, so the total is beside it. Also the phase a crit
 *   fires in, which is why it is not folded into the one above.
 * - **`leaving`** — fading, still mounted.
 */
type Shown = {
  row: PublicFeedRow
  /** Monotonic, and the identity every timer and every callback here compares against. */
  nonce: number
  phase: 'sentence' | 'result' | 'leaving'
}

export type TableEffectsProps = {
  code: string
  /**
   * Present means this browser holds the DM code. Passed to the subscription because it
   * changes **which rows arrive** — a DM hears their own private rolls and the monsters'.
   * It authorises nothing here (invariant 7); the server re-derives everything.
   */
  dmCode: string | null
  /** The map pane, for the crit shake. See `CritEffectProps.paneRef`. */
  paneRef: RefObject<HTMLElement | null>
}

/**
 * WHAT HAPPENS OVER THE MAP WHEN SOMEBODY ROLLS — the announcement, the dice and the crit,
 * driven from one subscription.
 *
 * Mounted once by `MapPane`, as a sibling of the board rather than inside it, so it
 * survives the lobby as well as a running game: a roll made off a sheet before the DM
 * presses Start still has to be confirmed to whoever made it.
 *
 * **One subscription, one record of what has already played, one place the sequencing
 * lives.** Three components each reading `feed.list` would be three cache entries of the
 * same rows and, worse, three independent answers to "have I played this row yet" — which
 * is the state where the dice throw for a line the announcement has already faded out.
 *
 * ## Why there is no visibility check in this file
 *
 * ⚠️ **It reacts to rows the server sent *this* client, and that is the whole of the
 * secrecy.** `feed.list` has already dropped every row this caller may not hear about —
 * `visibleFeed` in convex/lib/feed.ts, over the set of character ids
 * `readableCharacterIds` built, keyed off the DM code and off control grants and never off
 * `players.isDm` (invariant 7). So a DM-layer creature's attack roll simply never arrives
 * here: nothing animates, no dice are thrown, and there is no ambush to spoil. A reader
 * will look for a `maySee` in this file and there deliberately is not one — a second,
 * weaker copy of a decision already made properly on the server is how invariant 1 gets
 * broken by a component that thought it was helping.
 *
 * The same argument covers the DM's private roll from the other direction: a row with
 * `dmOnly: true` reaches exactly one browser, so it animates there and nowhere else,
 * without this file knowing the flag exists.
 *
 * ## Two rolls in a second: the newest wins
 *
 * ⚠️ **Not a queue, and the reason is that the dice cannot queue.** `diceBox.ts` holds a
 * generation counter and says why at length: an older `show` that kept adding dice into a
 * newer throw would leave dice on screen no feed line explains, and queueing instead would
 * make the dice fall further and further behind the feed. A weapon is *two* clicks in a
 * second, so this is the ordinary case rather than a corner one.
 *
 * Given the tray behaves that way, an announcement that queued would be strictly worse
 * than one that does not: the line would say *attacks with their Greatsword* while the dice
 * on the table were the damage. Newest-wins in both places means the sentence over the map
 * always names the roll whose dice are lying under it, and it means that by construction
 * rather than by two timings happening to agree.
 *
 * What it costs is real and worth stating: a very fast second click cuts the first
 * sentence short, sometimes after a fraction of a second. The feed has both lines in full,
 * which is the readout; this is the flourish, and a flourish that lies about which roll it
 * belongs to would be worse than one that is brief.
 */
export function TableEffects({
  code,
  dmCode,
  paneRef,
}: TableEffectsProps): ReactElement {
  /**
   * The feed, through the panel's own hook rather than an arguments object of this
   * component's own.
   *
   * ⚠️ **`useFeed` and never a second builder**, which is the point of it being exported.
   * `useQuery` memoises on `JSON.stringify(convexToJson(args))`, so an object of the same
   * *shape* as the panel's is genuinely the same subscription — one cache entry, one socket,
   * one server-side execution of a query that reads sixty rows and every character in the
   * game — while a different key order, or an explicit `undefined` where the panel omits a
   * key, would be a **second** one holding identical rows. `feedArgs` fixes the order and
   * the omissions in one place for both readers; this component reaches for the hook that
   * wraps it rather than reproducing either.
   *
   * That is worth more here than at the other two call sites of the same pattern
   * (`tokensArgs`, `vitalsArgs`): the panel and this component are the feed's two readers on
   * one screen, so a mismatch means the dice tumble for a row the panel has not been told
   * about yet.
   */
  const rows = useFeed(code, dmCode)

  /**
   * The board's tokens, for the roller's coin.
   *
   * ⚠️ **`tokensArgs` and not a literal.** `useBoard` and `RightPane` are both already
   * subscribed with exactly this shape, so this shares their cache entry rather than
   * opening a third — the arrangement `RightPane` documents at length and `Roster.tsx`
   * documents for `players.list`.
   *
   * **Not skipped in the lobby**, unlike `RightPane`'s copy of the same query, and that is
   * a deliberate small cost. Skipping would need `game.status`, which means a prop, and
   * `MapPaneProps` is closed on purpose — the pane is memoised against a divider that sets
   * state sixty times a second and every prop on it is stable by design. What the
   * subscription buys before Start is an almost always empty array; what a fourth reader of
   * `game.status` would cost is the memo note in `MapPane` becoming a thing somebody has to
   * re-verify.
   */
  const tokens = useQuery(api.board.tokens, tokensArgs(code, dmCode))

  const [shown, setShown] = useState<Shown | null>(null)

  /**
   * The newest `createdAt` this browser has already accounted for, or `null` before the
   * first payload arrives.
   *
   * ⚠️ **This is what stops the app replaying an hour of history on every refresh.** The
   * feed sends the newest sixty lines, so without a baseline, opening a game would fire
   * twenty announcements and twenty crit flashes for rolls made before anybody arrived. The
   * first payload therefore establishes the mark and animates nothing; only rows newer than
   * it are new.
   *
   * A ref rather than state, because nothing renders from it and a set must not schedule a
   * render — the effect below reads and writes it in the same pass.
   *
   * **`createdAt` rather than the row's id**, which is the other obvious spelling. An id
   * needs an `indexOf` over the window and has no answer at all once the row it names has
   * scrolled out of the sixty; a timestamp is a comparison that stays correct when the
   * window has moved on entirely. `_creationTime` is a float in milliseconds, so a genuine
   * tie between two rows is possible in principle — the consequence is one skipped
   * *flourish*, never a lost line, because the feed is the readout and it has both.
   */
  const seenUpToRef = useRef<number | null>(null)
  const nonceRef = useRef(0)

  // A different game is a different history. Declared before the effect that reads the
  // baseline so it runs first on the commit where `code` changes, though in practice the
  // new subscription answers `undefined` for a render anyway and the effect below returns
  // early on that.
  useEffect(() => {
    seenUpToRef.current = null
    setShown(null)
  }, [code])

  useEffect(() => {
    if (rows === undefined) return

    // Oldest first — `visibleFeed` reverses server-side precisely so no client has to — so
    // the newest line is the last one.
    const newest = rows.length === 0 ? null : rows[rows.length - 1]

    if (seenUpToRef.current === null) {
      // The first payload is history. `0` for an empty feed, so the very first roll of a
      // brand-new game is still newer than the mark.
      seenUpToRef.current = newest === null ? 0 : newest.createdAt
      return
    }

    if (newest === null || newest.createdAt <= seenUpToRef.current) return

    // Newest wins — see the note on this component. A subscription update can carry several
    // new rows at once (the DM rolling initiative down a list of goblins, or the socket
    // batching), and the last of them is the one whose dice are about to be on the table.
    seenUpToRef.current = newest.createdAt
    nonceRef.current += 1
    setShown({ row: newest, nonce: nonceRef.current, phase: 'sentence' })
  }, [rows])

  /**
   * The dice have finished for a roll, so the total may appear.
   *
   * The functional form of `setShown` rather than a dependency on `shown`, which is what
   * lets this be built once and held for the life of the component — `DiceTrayLayer` takes
   * it as an effect dependency, and a fresh arrow per render would re-throw the dice on
   * every render of this component, including the ones caused by the token subscription.
   *
   * The two guards are both load-bearing. The nonce check drops a settle belonging to a
   * roll that has already been superseded; the phase check makes it idempotent, so a
   * `result` that has already been reached is not knocked back into `result` and its hold
   * timer restarted.
   */
  const onSettled = useCallback((settled: number) => {
    setShown((current) =>
      current !== null && current.nonce === settled && current.phase === 'sentence'
        ? { ...current, phase: 'result' }
        : current,
    )
  }, [])

  // The two timed steps after the dice. `sentence` sets no timer at all, deliberately:
  // there is nothing to wait for except the throw, and `DiceTrayLayer` guarantees it
  // answers — on the beat when there is no tray, and against a cap when the engine stops
  // responding. A timer here as well would be a second, unowned copy of that guarantee.
  useEffect(() => {
    if (shown === null || shown.phase === 'sentence') return

    const nonce = shown.nonce
    const next = shown.phase === 'result' ? 'leaving' : null
    const delay = shown.phase === 'result' ? HOLD_MS : FADE_MS

    const timer = window.setTimeout(() => {
      setShown((current) => {
        // A newer roll has taken over, so this timer is about a line that is already gone.
        if (current === null || current.nonce !== nonce) return current
        return next === null ? null : { ...current, phase: next }
      })
    }, delay)

    return () => window.clearTimeout(timer)
  }, [shown])

  // Held apart from `shown` so the memo below sees a stable reference across a phase
  // change: the row is the same object throughout one roll, and only the phase moves.
  const row = shown?.row ?? null

  /**
   * The faces to put on the table.
   *
   * ⚠️ **On advantage the dropped die is thrown too, and that is the whole visible point of
   * the toggle.** `RollResult.dice` holds only the d20 that was *kept* and `dropped` holds
   * the other, so throwing `dice` alone would put a single d20 on the table for a roll made
   * with advantage — identical to a flat roll, which would make the toggle invisible on the
   * one screen where it is supposed to be obvious. Two d20s lying there is what tells the
   * table what happened, and the announcement's `rollModeNote` says which of the two
   * counted.
   *
   * `dropped` is keyed off rather than `mode` for the reason `rollModeNote` gives: `mode` is
   * what was asked for and `dropped` is what happened, and they differ every time somebody
   * rolls damage with a sticky advantage toggle still set. A second d20 beside a `2d6` would
   * be the dice asserting a rule the evaluator deliberately did not apply.
   *
   * The dropped die is `faces: 20` by construction and not by assumption — advantage only
   * ever applies to a single d20, which lib/roll.ts states as the reason `dropped` exists at
   * all.
   *
   * An empty array for a roll with no dice, which is an instruction and not a gap: it clears
   * the tray, so a passive announcing itself does not do so over the last roll's dice. See
   * `DiceTrayLayerProps.dice`.
   */
  const dice = useMemo<readonly ShownDie[]>(() => {
    const roll = row?.roll ?? null
    if (roll === null) return []
    if (roll.dropped === null) return roll.dice
    return [...roll.dice, { faces: 20, value: roll.dropped }]
  }, [row])

  /**
   * The roller's token art, or `null` for the generated disc.
   *
   * ⚠️ **A miss is silent and indistinguishable, which is a secrecy property rather than a
   * fallback.** A roller may have no token on the board, or a token this viewer's payload
   * never contained — `maySee` drops the DM layer server-side — and an announcement must
   * never be the thing that reveals a token exists. Both cases arrive here as "not found"
   * and leave as the same disc, with nothing anywhere saying which it was.
   *
   * Matched on `characterId` rather than on the name: the row carries the pointer precisely
   * so the browser does not have to match on `actorName`, and the row it points at is one
   * this caller may already read — that is what `readableCharacterIds` decided.
   */
  const artUrl = useMemo(() => {
    const characterId = row?.characterId ?? null
    if (characterId === null) return null
    return tokens?.find((token) => token.characterId === characterId)?.artUrl ?? null
  }, [tokens, row])

  // The crit lands with the total and not with the sentence, so the fireworks are over a
  // die somebody has actually seen. `sentence` therefore reports no crit even when the row
  // carries one, and `leaving` still does — by which point the wash and the sparks have
  // played themselves out and only the announcement is still fading.
  const crit = shown === null || shown.phase === 'sentence' ? null : (row?.roll?.crit ?? null)

  return (
    <>
      {/*
        Order is paint order and there is no `z-index` anywhere in these three: the dice go
        over the map, the announcement over the dice so its words stay readable, and the
        crit wash over everything in the pane, which is what makes it read as the pane
        flashing rather than as a rectangle between two layers. Every one of them is
        `pointer-events-none`, so the stack is invisible to the mouse however it is ordered.
      */}
      <DiceTrayLayer dice={dice} nonce={shown?.nonce ?? 0} onSettled={onSettled} />
      <RollAnnouncement
        actorName={row?.actorName ?? null}
        subject={row?.subject ?? null}
        roll={row?.roll ?? null}
        artUrl={artUrl}
        revealed={shown !== null && shown.phase !== 'sentence'}
        leaving={shown?.phase === 'leaving'}
      />
      <CritEffect crit={crit} nonce={shown?.nonce ?? 0} paneRef={paneRef} />
    </>
  )
}
