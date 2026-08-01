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
 * ⚠️ **For a player, `playerId` is part of the key, and leaving it off is not a
 * shortcut — it is a different answer.** `characters.vitals` sends *exact* hit points
 * for a creature this seat has been granted control of and a *band* for one it has
 * not, and it cannot know which seat is asking unless it is told. A subscription built
 * without the id gets bands for the party's pet, and `HpControls` draws no `−`/`+`
 * on a band — so the granted player is handed a sheet they may write to and no
 * control to write with. The id authorises nothing (invariant 7); the server
 * re-derives the grant from the token table either way.
 *
 * ⚠️ **For the DM it is dropped, and that is a correctness fix rather than a saving.**
 * `visibleVitals` short-circuits every per-seat term on `isDm` — the visible-NPC set
 * and the granted set are both behind `!isDm` — so a DM's answer is byte-identical
 * whichever seat is named, and naming one only mints a second cache entry holding the
 * same rows. Two entries is two socket subscriptions and two server executions per
 * point of damage in the browser that causes most of it, but the sharp end is the
 * optimistic update: `useDmCharacterRows` and the DM's `CharacterSheetView` pass no
 * seat, so a `−5` from the sheet list used to patch one entry while the map's health
 * bar read the other and sat still until the round trip landed. This builder exists
 * precisely so the writer and the reader cannot disagree about arguments, and it was
 * being satisfied *within* each hook and violated *between* them. Deciding here means
 * every caller agrees by construction and none of them has to know the rule.
 *
 * Both optional arguments are **omitted rather than passed as `undefined`** when
 * absent, because `undefined` is not a Convex value: the two spellings are the same
 * request on the wire but not necessarily the same object here. And the key order is
 * fixed by this one builder, which is the other half of why it exists — `useQuery`
 * memoises on `JSON.stringify`, which is order-sensitive.
 */
export function vitalsArgs(code: string, dmCode: string | null, playerId: Id<'players'> | null) {
  if (dmCode !== null) return { code, dmCode }
  return playerId === null ? { code } : { code, playerId }
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
 *
 * `playerId` is which seat is asking, and `null` means *ask as nobody in
 * particular*. Anywhere a seat is reading its own screen, pass the seat: see
 * `vitalsArgs` for what the omission actually costs a player. A DM may pass either —
 * the builder drops it, because the DM code has already opened every row and a second
 * cache entry holding identical rows is the only thing the seat would buy.
 */
export function useVitals(
  code: string,
  dmCode: string | null,
  playerId: Id<'players'> | null,
): VitalsByCharacter {
  const rows = useQuery(api.characters.vitals, vitalsArgs(code, dmCode, playerId))

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
  /**
   * A long rest: hit points to full, every hit die back, every once-per-rest ability
   * unspent. All three in one call because they are one thing that happens at the
   * table, and a rest that restored two of the three would be a rules bug somebody has
   * to notice.
   */
  longRest: (characterId: Id<'characters'>) => Promise<void>
  /** Mark a once-per-long-rest ability spent, or hand it back if it was a misclick. */
  setPerRest: (characterId: Id<'characters'>, key: string, spent: boolean) => Promise<void>
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
        // ⚠️ The same three arguments the reading component passed, through the same
        // builder, or this patches an entry nobody is watching. `playerId` joining the
        // key is exactly the kind of change that breaks this silently — the bar simply
        // stops moving until the server answers — and a DM writing from one panel while
        // reading in another is how it actually happened. The builder is what makes the
        // two agree; calling it is not optional here.
        const key = vitalsArgs(code, dmCode, playerId)
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
    [rawAdjustHp, code, dmCode, playerId],
  )

  const adjustHitDiceMutation = useMutation(api.characters.adjustHitDice)
  // Neither of these gets an optimistic update, and the reason is the same for both:
  // what they move is a whole row rather than one number a client can predict. A long
  // rest sets hit points to a maximum this client holds only for a character it can see
  // exactly, and clears a list; a per-rest toggle returns the resulting set. Guessing
  // either would be inventing a value to be corrected a tenth of a second later, which
  // is a flicker rather than a saving — the reason `adjustHp` earns one is that a
  // health bar moves on every hit of every round.
  const longRestMutation = useMutation(api.characters.longRest)
  const setPerRestMutation = useMutation(api.characters.setPerRest)

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

  const longRest = useCallback(
    (characterId: Id<'characters'>) =>
      run('Could not take that rest.', () => longRestMutation({ code, characterId, ...caller })),
    [longRestMutation, caller, code, run],
  )

  const setPerRest = useCallback(
    (characterId: Id<'characters'>, key: string, spent: boolean) =>
      run('Could not change that ability.', () =>
        setPerRestMutation({ code, characterId, key, spent, ...caller }),
      ),
    [setPerRestMutation, caller, code, run],
  )

  return { adjust, adjustHitDice, longRest, setPerRest, error }
}
