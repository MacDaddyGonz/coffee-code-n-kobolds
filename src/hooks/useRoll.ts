import type { ReactNode } from 'react'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { RollMode, RollRequest } from '@convex/lib/roll'

/**
 * PRESSING A ROLL, from anywhere in the right-hand panel.
 *
 * Three contexts rather than props, and the reason is the shape of the tree rather than a
 * preference for context. A roll button lives on an ability row, a skill row and an entry
 * row — `AbilityTable`, `SkillList` and `SheetEntryList` — and each of those is three or
 * four components below the panel: `SheetTab` or `SheetsTab`, then `CharacterSheetView`,
 * then `CharacterSheetEditor`, then one of four sheet panels. Threading a `roll` callback
 * plus a mode plus a character id down all of that would be four props through a dozen
 * components, most of which have no business knowing that dice exist — and every one of
 * those components is heavily commented about what it *does* care about, so the diff would
 * be noise in exactly the files worth reading.
 *
 * ⚠️ **Every provider is mounted inside `RightPane`'s memo boundary, and that is not
 * incidental.** The divider sets state in `GameShell` sixty times a second and `RightPane`
 * is memoised against it; a context whose value is a fresh object per render is fine
 * *inside* that boundary and would be a disaster crossing it. Same rule the pane already
 * states for `SheetFocus` and the tokens array: what must stay primitive is what crosses
 * *into* the memo, not what is built within it. Two of the three are mounted at the top of
 * that pane; the target is mounted by `CharacterSheetView`, which is further down the tree
 * and still comfortably inside the boundary.
 *
 * ⚠️ **Three and not one, because React context has no selector.** A consumer re-renders
 * when the context *value* changes, whatever part of it that consumer actually reads — so
 * anything held in one object has its churn paid for by every reader of the object. These
 * three change on three genuinely different clocks: the controls when somebody presses a
 * control, the target when the selection moves, and the pending flag **twice per roll**, on
 * the click and again on the acknowledgement.
 *
 * That third clock is the one that forced the split, and it was measured rather than
 * guessed. `pending` used to sit in the controls, where its two flips per roll re-rendered
 * `RollModeBar`, `DiceComposer`, every one of the thirty-odd `RollButton`s on the sheet —
 * a `Tooltip` and a `Button` each — and `useDmCharacterRows`, whose caller `SheetsTab` draws
 * up to two hundred un-memoised `CharacterRow`s. `RightPane` `forceMount`s the sheet tab, so
 * all of that happened while the DM was reading the feed. One boolean in a context of its
 * own is read by the one control that wants it, and the senders are stable for the session
 * (see the refs on the provider) — so pressing a die now re-renders `DiceComposer` and
 * nothing else.
 *
 * **Nothing here rolls anything.** There is no arithmetic in this file and no `d20`: it
 * sends an identifier and a toggle, and the result arrives back over the `feed.list`
 * subscription like everybody else's. That is the whole of the arrangement `lib/dice.ts`
 * is kept out of the bundle to protect, and `bundleGuard.test.ts` fails the build if a
 * future edit here reaches for it.
 */

// ---------------------------------------------------------------------------
// The controls
// ---------------------------------------------------------------------------

export type RollControls = {
  /** Normal, advantage or disadvantage — sticky until changed. */
  mode: RollMode
  setMode: (mode: RollMode) => void
  /** The DM's *just for me*. Always false for a browser with no DM code. */
  dmOnly: boolean
  setDmOnly: (dmOnly: boolean) => void
  /** Whether to offer the private toggle at all. A display decision; the server re-decides. */
  mayRollPrivately: boolean
  /** Roll something off a character's sheet. Fire and forget; failures toast. */
  roll: (characterId: Id<'characters'>, request: RollRequest) => void
  /** Roll a typed expression, attributed to this seat rather than to a character. */
  rollDice: (expression: string) => void
}

/**
 * ⚠️ **The default is inert rather than a throw**, which is the opposite of what a context
 * usually wants and is right here. A sheet component rendered outside the provider — in a
 * test, or in some future panel — should print its numbers and offer no dice, not crash the
 * panel. `mayRollPrivately: false` and two no-op senders is exactly "there is nowhere to
 * send a roll", which is a state the UI can render.
 */
const INERT: RollControls = {
  mode: 'flat',
  setMode: () => {},
  dmOnly: false,
  setDmOnly: () => {},
  mayRollPrivately: false,
  roll: () => {},
  rollDice: () => {},
}

const RollContext = createContext<RollControls>(INERT)

/** The mode, the private toggle and the two senders. */
export function useRollControls(): RollControls {
  return useContext(RollContext)
}

// ---------------------------------------------------------------------------
// Whose sheet the buttons on screen belong to
// ---------------------------------------------------------------------------

/**
 * ⚠️ **Its own context, deliberately, because it changes on a different clock.** The
 * controls above change when somebody sets advantage; the target changes when the selection
 * moves. Folding the character id into `RollControls` would put both in one object, so
 * picking a different creature in the DM's selector would re-render the feed's composer and
 * the mode bar, and setting advantage would re-render every row of the sheet. A context of
 * its own is one more `createContext` and no such coupling.
 *
 * ⚠️ **Mounted by `CharacterSheetView` and not by `RightPane`, which is where it used to
 * be.** That component takes the character id as a prop already and is the sole ancestor of
 * every `RollButton` in the application — `AbilityTable`, `SkillList` and `SheetEntryList`
 * are reached only through `CharacterSheetEditor`, which only it renders. The pane was
 * therefore re-deriving `focus.kind === 'character' ? focus.characterId : null` for a
 * provider whose whole subtree already had the answer, in a file that otherwise does not
 * need to know rolls have a target at all.
 *
 * ⚠️ **`null` is the default rather than a state the panel reaches, and the difference is
 * worth knowing before deleting anything that handles it.** It used to be the answer for *a
 * token with no sheet behind it* and *nothing selected*; both of those arms of `sheetFocusOf`
 * render prose instead of a sheet, so since the provider moved down there is no button
 * mounted under either. What is left is a `RollButton` rendered with no provider above it at
 * all — a sheet in a test, or some future panel with no dice in it — which prints its numbers
 * and offers no controls. That is `INERT`'s decision applied to the target, and the ⚠️ on
 * `RollButton` says why the branch is kept rather than claimed as a live case.
 */
const RollTargetContext = createContext<Id<'characters'> | null>(null)

/** The character the buttons on screen would roll for, or null. */
export function useRollTarget(): Id<'characters'> | null {
  return useContext(RollTargetContext)
}

export function RollTargetProvider(props: {
  characterId: Id<'characters'> | null
  children: ReactNode
}) {
  // `createElement` rather than JSX so this stays a `.ts` file beside the other hooks
  // rather than becoming the one `.tsx` in `src/hooks/`.
  return createElement(RollTargetContext.Provider, { value: props.characterId }, props.children)
}

// ---------------------------------------------------------------------------
// Whether a roll is in flight
// ---------------------------------------------------------------------------

/**
 * ⚠️ **One boolean, in a context of its own, read by exactly one control.** This is the
 * field whose clock is fastest and whose audience is smallest: it flips `0 → 1` when
 * anybody presses anything and back again when the mutation returns, and the only component
 * that wants it is `DiceComposer`, which holds back its *send* while a round trip is in
 * flight. Held in `RollControls` it was two re-renders per roll for every consumer of the
 * controls — see the ⚠️ at the top of this file for the list, which is long.
 *
 * **`false` is the honest default outside a provider**, exactly as `INERT`'s two no-op
 * senders are: a panel with nowhere to send a roll has no roll in flight either.
 */
const RollPendingContext = createContext(false)

/**
 * Whether a roll this panel sent is still in flight.
 *
 * ⚠️ **For holding back a control, never for hiding a result.** A roll's result arrives over
 * the `feed.list` subscription like everybody else's, so there is nothing here to wait for
 * and nothing to reveal. And **do not reach for it to disable a roll button**: it counts
 * *every* roll in flight, so a sheet that read it would grey out all thirty of its controls
 * for the length of one round trip — `RollButton` and `CharacterRows`' initiative die both
 * record that correction in their own words.
 */
export function useRollPending(): boolean {
  return useContext(RollPendingContext)
}

// ---------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------

export type RollProviderProps = {
  code: string
  /** This seat. Required, because an ad-hoc roll is announced as the person. */
  playerId: Id<'players'>
  /**
   * Present means this browser holds the DM code. Every call inside re-verifies it
   * server-side (invariant 7), so this decides what is *offered* and never what is allowed.
   */
  dmCode: string | null
  children: ReactNode
}

export function RollProvider({ code, playerId, dmCode, children }: RollProviderProps) {
  const [mode, setModeState] = useState<RollMode>('flat')
  const [dmOnly, setDmOnlyState] = useState(false)
  const [pending, setPending] = useState(0)

  /**
   * The same two facts a second time, in refs the setters write on the way past.
   *
   * ⚠️ **Duplicated state, which this codebase normally refuses, and the reason is that the
   * senders below are what everything else memoises against.** `mode` and `dmOnly` are read
   * at the moment of *sending* and nowhere else inside the callbacks — so taking them from a
   * ref rather than from a dependency list makes `roll` and `rollDice` stable for as long as
   * the game, the seat and the DM code are, which is the whole session. That is what lets
   * `useDmCharacterRows` build a die per row off a callback whose identity never moves, and
   * it is the other half of *pressing a die re-renders nothing*.
   *
   * The pair cannot drift, because there is exactly one writer for each and it writes both
   * halves: nothing else assigns to these refs, and `setModeState` is not exported. The
   * rendered value stays the state — a ref read during render is not a subscription, and the
   * mode bar has to repaint when the mode changes.
   */
  const modeRef = useRef(mode)
  const dmOnlyRef = useRef(dmOnly)

  const setMode = useCallback((next: RollMode) => {
    modeRef.current = next
    setModeState(next)
  }, [])

  const setDmOnly = useCallback((next: boolean) => {
    dmOnlyRef.current = next
    setDmOnlyState(next)
  }, [])

  const rollMutation = useMutation(api.feed.roll)
  const rollDiceMutation = useMutation(api.feed.rollDice)

  /**
   * ⚠️ **No optimistic update, and that is the one design note worth reading here.**
   * `useVitals` gives `adjustHp` one and deliberately withholds one from the other three,
   * on the rule that a client may guess a value it can predict and must not invent one it
   * cannot. A roll is the purest case of the second: **nobody can predict a die.** An
   * optimistic feed line would have to make a number up and then be corrected a tenth of a
   * second later — which is not a flicker, it is the wrong result briefly displayed as the
   * right one, on a screen where the whole point is that everybody saw the same number.
   *
   * The latency cover is the dice themselves. They start tumbling when the row arrives and
   * take about a second to settle, so the round trip is hidden inside an animation that was
   * going to play anyway.
   */

  /**
   * A counter rather than a boolean, because two rolls can be in flight: a weapon is two
   * clicks and an impatient player makes both before the first returns. A boolean would be
   * cleared by whichever settled first and leave a control enabled mid-flight.
   */
  const send = useCallback(async (fallback: string, call: () => Promise<unknown>) => {
    setPending((count) => count + 1)
    try {
      await call()
    } catch (thrown) {
      // Toasted here rather than reported as state for a caller to render, which is the
      // split `CharacterSheetView` documents: a toast is for something written the instant
      // a control is pressed, because there is nothing on screen left to attach a message
      // to. A roll is exactly that — the row it would have appeared on does not exist.
      toast.error(errorMessage(thrown, fallback))
    } finally {
      setPending((count) => Math.max(0, count - 1))
    }
  }, [])

  /**
   * The two optional arguments, built inside the callbacks rather than above them, so the
   * dependencies are the primitives themselves rather than a fresh object per render — the
   * arrangement `useHpActions` uses and for the same reason. Each is omitted rather than
   * passed as `undefined`, because `undefined` is not a Convex value.
   *
   * ⚠️ **The mode and the private toggle come off the refs above and are deliberately not
   * dependencies.** Their values are wanted at the instant of sending, which is after every
   * render that could have changed them, so reading them here is reading the latest either
   * way — and it is what keeps this callback's identity still for the whole session.
   */
  const roll = useCallback(
    (characterId: Id<'characters'>, request: RollRequest) => {
      void send('That roll did not land. Try again.', () =>
        rollMutation({
          code,
          characterId,
          request,
          mode: modeRef.current,
          // Never sent as `true` by a browser with no DM code — the server refuses it with
          // `NotDm` rather than downgrading it, so a stale flag is an error and not a
          // private roll quietly published to the table.
          dmOnly: dmCode === null ? false : dmOnlyRef.current,
          playerId,
          ...(dmCode === null ? {} : { dmCode }),
        }),
      )
    },
    [send, rollMutation, code, dmCode, playerId],
  )

  const rollDice = useCallback(
    (expression: string) => {
      void send('Those dice did not roll. Check the notation.', () =>
        rollDiceMutation({
          code,
          expression,
          mode: modeRef.current,
          dmOnly: dmCode === null ? false : dmOnlyRef.current,
          playerId,
          ...(dmCode === null ? {} : { dmCode }),
        }),
      )
    },
    [send, rollDiceMutation, code, dmCode, playerId],
  )

  /**
   * ⚠️ **No `pending` here, and its absence is the fix.** Everything in this object changes
   * on a human action — pressing a mode button, standing down as DM — and the two senders do
   * not change at all, so a consumer of this context re-renders only when somebody has
   * deliberately changed how the next roll will be made. The flag that moved twice per roll
   * is one provider down.
   */
  const controls = useMemo<RollControls>(
    () => ({
      mode,
      setMode,
      // Forced false for a player, so a DM who stands down mid-session cannot leave a
      // stuck toggle behind that the server would then refuse every roll for.
      dmOnly: dmCode === null ? false : dmOnly,
      setDmOnly,
      mayRollPrivately: dmCode !== null,
      roll,
      rollDice,
    }),
    [mode, setMode, dmOnly, setDmOnly, dmCode, roll, rollDice],
  )

  // Nested rather than side by side, because the pending flag's audience is a subset of the
  // controls'. `children` is one unchanged element reference, so a flip of the inner value
  // notifies its own consumers and reconciles nothing else — which is the entire point of
  // the split.
  return createElement(
    RollContext.Provider,
    { value: controls },
    createElement(RollPendingContext.Provider, { value: pending > 0 }, children),
  )
}
