import type { ReactNode } from 'react'
import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/errors'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { RollMode, RollRequest } from '@convex/lib/roll'

/**
 * PRESSING A ROLL, from anywhere in the right-hand panel.
 *
 * Two contexts rather than props, and the reason is the shape of the tree rather than a
 * preference for context. A roll button lives on an ability row, a skill row and an entry
 * row — `AbilityTable`, `SkillList` and `SheetEntryList` — and each of those is three or
 * four components below the panel: `SheetTab` or `SheetsTab`, then `CharacterSheetView`,
 * then `CharacterSheetEditor`, then one of four sheet panels. Threading a `roll` callback
 * plus a mode plus a character id down all of that would be four props through a dozen
 * components, most of which have no business knowing that dice exist — and every one of
 * those components is heavily commented about what it *does* care about, so the diff would
 * be noise in exactly the files worth reading.
 *
 * ⚠️ **Both providers are mounted inside `RightPane`'s memo boundary, and that is not
 * incidental.** The divider sets state in `GameShell` sixty times a second and `RightPane`
 * is memoised against it; a context whose value is a fresh object per render is fine
 * *inside* that boundary and would be a disaster crossing it. Same rule the pane already
 * states for `SheetFocus` and the tokens array: what must stay primitive is what crosses
 * *into* the memo, not what is built within it. Both values are `useMemo`'d anyway, so a
 * consumer only re-renders when the mode, the pending flag or the target genuinely change.
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
  /** A roll is in flight. For disabling a control, not for hiding the result. */
  pending: boolean
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
  pending: false,
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
 * ⚠️ **A second context, deliberately, because it changes on a different clock.** The
 * controls above change when somebody sets advantage; the target changes when the selection
 * moves. Folding the character id into `RollControls` would put both in one object, so
 * picking a different creature in the DM's selector would re-render the feed's composer and
 * the mode bar, and setting advantage would re-render every row of the sheet. Two contexts
 * is two `useMemo`s and no such coupling.
 *
 * `null` is a real answer and not a missing one: the panel shows a token with no sheet
 * behind it, or nothing at all, and a roll button with nothing to aim at must not render.
 * `sheetFocusOf` in `lib/sheetFocus.ts` is what decides it, and this is that answer carried
 * down to the rows rather than re-derived at each of them.
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
  const [mode, setMode] = useState<RollMode>('flat')
  const [dmOnly, setDmOnly] = useState(false)
  const [pending, setPending] = useState(0)

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
   */
  const roll = useCallback(
    (characterId: Id<'characters'>, request: RollRequest) => {
      void send('That roll did not land. Try again.', () =>
        rollMutation({
          code,
          characterId,
          request,
          mode,
          // Never sent as `true` by a browser with no DM code — the server refuses it with
          // `NotDm` rather than downgrading it, so a stale flag is an error and not a
          // private roll quietly published to the table.
          dmOnly: dmCode === null ? false : dmOnly,
          playerId,
          ...(dmCode === null ? {} : { dmCode }),
        }),
      )
    },
    [send, rollMutation, code, mode, dmOnly, dmCode, playerId],
  )

  const rollDice = useCallback(
    (expression: string) => {
      void send('Those dice did not roll. Check the notation.', () =>
        rollDiceMutation({
          code,
          expression,
          mode,
          dmOnly: dmCode === null ? false : dmOnly,
          playerId,
          ...(dmCode === null ? {} : { dmCode }),
        }),
      )
    },
    [send, rollDiceMutation, code, mode, dmOnly, dmCode, playerId],
  )

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
      pending: pending > 0,
    }),
    [mode, dmOnly, dmCode, roll, rollDice, pending],
  )

  return createElement(RollContext.Provider, { value: controls }, children)
}
