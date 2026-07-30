import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicVitals } from '@convex/lib/characters'
import { errorMessage } from '@/lib/errors'

/**
 * The arguments `characters.vitals` is subscribed with.
 *
 * Built here rather than inline at each call site for the same reason `tokensArgs`
 * is: Convex keys a query by its arguments, so a DM and a player watching the same
 * game hold genuinely different subscriptions, and the optimistic update below has
 * to name the *same* cache entry the component is reading. Patching the wrong one
 * shows up as a health bar that flicks to the new number and then back again a
 * tenth of a second later.
 *
 * `dmCode` is omitted rather than passed as `undefined` when there is none, because
 * `undefined` is not a Convex value: the two spellings are the same request on the
 * wire but not necessarily the same object here.
 */
export function vitalsArgs(code: string, dmCode: string | null) {
  return dmCode === null ? { code } : { code, dmCode }
}

export type Vitals = PublicVitals

export type VitalsByCharacter = {
  /**
   * What this client is allowed to know about each character's hit points, which is
   * either exact numbers or one of four bands. **Which of the two arrives is decided
   * on the server** — see `publicVitalsValidator`. There is nothing to unlock here
   * and no numbers hiding behind the band: for an NPC on a player's screen the exact
   * values were never sent.
   */
  of: (characterId: Id<'characters'> | null) => Vitals | null
  loading: boolean
}

/**
 * Everyone's hit points, as one subscription for the whole screen.
 *
 * Separate from `board.tokens` deliberately. Hit points change several times a
 * round while signed art URLs change almost never, so a shared query would
 * re-resolve every piece of token art each time somebody took damage — the same
 * reasoning that split positions off the token document (CLAUDE.md invariant 2).
 */
export function useVitals(code: string, dmCode: string | null): VitalsByCharacter {
  const rows = useQuery(api.characters.vitals, vitalsArgs(code, dmCode))

  const byCharacter = useMemo(() => {
    const map = new Map<Id<'characters'>, Vitals>()
    for (const row of rows ?? []) map.set(row.characterId, row)
    return map
  }, [rows])

  const of = useCallback(
    (characterId: Id<'characters'> | null) =>
      characterId === null ? null : byCharacter.get(characterId) ?? null,
    [byCharacter],
  )

  return { of, loading: rows === undefined }
}

export type HpActions = {
  /** Damage is negative, healing positive. Clamped server-side against max HP. */
  adjust: (characterId: Id<'characters'>, delta: number) => Promise<void>
  /**
   * Deliberately no `set`. `characters.setHp` exists and is tested, but nothing on
   * screen types an absolute number — the controls are `−`, an amount and `+` — and
   * a method nobody calls still costs a `useMutation` on every mount of every
   * component that takes these actions. It goes back in when something needs it.
   */
  /** Spend a hit die on a rest, or hand them back. */
  adjustHitDice: (characterId: Id<'characters'>, delta: number) => Promise<void>
  /** The last refusal, for the caller to toast. Cleared on the next successful call. */
  error: string | null
}

/**
 * The three writes that change how a character is doing.
 *
 * `adjust` sends a **delta** rather than a value, and that is worth stating because
 * it looks like a needless indirection next to `set`. A mutation is one
 * transaction, so the DM and a player both clicking `−5` on the same goblin take
 * ten hit points off it; two clients each sending "set it to 32" would race and one
 * of the hits would vanish.
 *
 * Nothing here authorises anything. `playerId` is a routing argument and `dmCode` is
 * re-verified server-side on every call — the mutation decides whether this caller
 * may touch that character, and refuses with the same error for an NPC as for a
 * character that does not exist.
 */
export function useHpActions(args: {
  code: string
  dmCode: string | null
  playerId: Id<'players'> | null
}): HpActions {
  const { code, dmCode, playerId } = args

  const rawAdjustHp = useMutation(api.characters.adjustHp)

  /**
   * Built once and held, not rebuilt on every render.
   *
   * `useMutation` is memoised inside convex/react, but `.withOptimisticUpdate` runs
   * `createMutation` again and hands back a *new* function — so calling it in the
   * render body allocates a fresh mutation and a fresh closure over `code` and
   * `dmCode` every time. This hook is called from `Board`, which re-renders on every
   * camera commit, so that was sixty allocations a second through a pan. Worse than
   * the garbage: the identity changed every render, which made `adjust` and its
   * siblings unstable and defeated memoisation everywhere downstream of them.
   * `useTokenMove` wraps its commit for exactly this reason.
   */
  const adjustHp = useMemo(
    () =>
      rawAdjustHp.withOptimisticUpdate((store, mutationArgs) => {
        const key = vitalsArgs(code, dmCode)
        const current = store.getQuery(api.characters.vitals, key)
        if (!current) return

        store.setQuery(
          api.characters.vitals,
          key,
          current.map((row) => {
            if (row.characterId !== mutationArgs.characterId) return row
            // Only an `exact` row can be moved locally, and that is not a limitation
            // worth working around: a band is computed from a maximum this client
            // was never sent, so guessing which band the new value falls in would be
            // inventing the very number the server refused to disclose. A band
            // simply updates when the server answers, a tenth of a second later.
            if (row.kind !== 'exact') return row
            const next = Math.min(row.max, Math.max(0, row.current + mutationArgs.delta))
            return { ...row, current: next }
          }),
        )
      }),
    [rawAdjustHp, code, dmCode],
  )

  const adjustHitDiceMutation = useMutation(api.characters.adjustHitDice)

  const [error, setError] = useState<string | null>(null)

  // Every call reports the same way, so a caller wires one toast rather than three.
  // Cleared first, so a second identical failure is still a state change and still
  // reaches whoever is watching.
  const run = useCallback(async (fallback: string, call: () => Promise<unknown>) => {
    setError(null)
    try {
      await call()
    } catch (thrown) {
      setError(errorMessage(thrown, fallback))
    }
  }, [])

  /**
   * The two optional arguments every one of these mutations takes, built inside the
   * callbacks rather than once above them so the memo dependencies are the two
   * primitives themselves instead of a fresh object each render.
   *
   * Each is omitted rather than passed as `undefined` when absent, for the reason on
   * `vitalsArgs`: `undefined` is not a Convex value.
   */
  const caller = useMemo(
    () => ({
      ...(playerId === null ? {} : { playerId }),
      ...(dmCode === null ? {} : { dmCode }),
    }),
    [dmCode, playerId],
  )

  const adjust = useCallback(
    (characterId: Id<'characters'>, delta: number) =>
      run('Could not change those hit points.', () =>
        adjustHp({ code, characterId, delta, ...caller }),
      ),
    [adjustHp, caller, code, run],
  )

  const adjustHitDice = useCallback(
    (characterId: Id<'characters'>, delta: number) =>
      run('Could not change those hit dice.', () =>
        adjustHitDiceMutation({ code, characterId, delta, ...caller }),
      ),
    [adjustHitDiceMutation, caller, code, run],
  )

  return { adjust, adjustHitDice, error }
}
