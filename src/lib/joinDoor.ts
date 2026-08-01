import type { Id } from '@convex/_generated/dataModel'
import { isCompleteJoinCode } from '@convex/lib/codes'

/**
 * What happens between clicking a door on the landing page and arriving at the
 * table: which questions get asked, in what order, and what the answer to the
 * first one means.
 *
 * Pure — no React, no Convex beyond the `Id` type, which is a branded string and
 * carries no runtime code with it. Everything here is a decision the join dialog
 * would otherwise make inline in JSX, where the client vitest project (node
 * environment, `src/**\/*.test.ts` only) cannot reach it. The dialog is left
 * holding state and chrome, which is the part a manual browser pass genuinely does
 * check, and the two rules worth being sure of are checked in `joinDoor.test.ts`.
 */

/** Which door was clicked on the row. Two, because a DM and a player want different things. */
export type Door = 'player' | 'dm'

/** One question the door asks. Not a route — see `stepsFor` below. */
export type StepKind = 'gameCode' | 'dmCode' | 'seat'

/**
 * What the join code typed at the door currently means.
 *
 * A discriminated union rather than a pair of booleans because five of these are
 * mutually exclusive states of one field and the caller has to render exactly one
 * line of text for whichever it is. `ok` carries the code so the caller cannot
 * reach for the typed one instead — see `verdictOf`.
 */
export type CodeVerdict =
  /** Not enough characters yet to be worth asking the server about. */
  | { kind: 'incomplete' }
  /** Complete, and the lookup is in flight. */
  | { kind: 'checking' }
  | { kind: 'noSuchGame' }
  /** A real game, but not the one whose row was clicked. */
  | { kind: 'wrongGame' }
  /** Verified. `code` is the **server's** spelling of it. */
  | { kind: 'ok'; code: string }

/**
 * Does the code typed at the door open the game whose row was clicked?
 *
 * ⚠️ **It compares `_id`, and must never compare the name.** Nothing stops two
 * games sharing a title — `games.create` has no uniqueness check on the name and
 * should not have one, because two people running *Tomb of the Coffee Lich* six
 * months apart is a normal thing to want. So a code that resolves to a *different*
 * game with the *same* name is precisely the mistake this step exists to catch, and
 * a name comparison would wave it through and drop somebody into a stranger's game
 * that looked exactly like the one they meant. `joinDoor.test.ts` pins that case
 * specifically, because it is the one an innocent-looking simplification breaks.
 *
 * ⚠️ **`ok` carries `resolved.code`, never `typed`.** They can differ:
 * `CodeInput` normalises on every keystroke through `normaliseJoinCode`, which
 * uppercases and drops out-of-alphabet characters, but the value that ends up in
 * `localStorage` and in the URL should be the one the server calls this game
 * rather than one the client derived and believes to be equivalent. Handing the
 * server's spelling out of here is what makes it impossible for a caller to reach
 * for the other one by accident, since the typed string is not in the result at all.
 *
 * `resolved` is deliberately a structural `{ _id, code }` rather than the query's
 * `PublicGame`: this function needs two fields, and asking for the whole document
 * would drag a Convex `FunctionReturnType` into the test for no gain.
 */
export function verdictOf(args: {
  typed: string
  expectedGameId: Id<'games'>
  /** `undefined` = in flight, `null` = no such game. Structural so the test needs no Convex. */
  resolved: { _id: Id<'games'>; code: string } | null | undefined
}): CodeVerdict {
  const { typed, expectedGameId, resolved } = args

  // Asked first, and the order matters. The caller skips the query while the field
  // is short, so `resolved` is `undefined` then too — reading it before this test
  // would report a half-typed code as a lookup in flight, and the field would sit
  // saying "Checking that code…" about a request nobody made.
  if (!isCompleteJoinCode(typed)) return { kind: 'incomplete' }

  if (resolved === undefined) return { kind: 'checking' }
  if (resolved === null) return { kind: 'noSuchGame' }
  if (resolved._id !== expectedGameId) return { kind: 'wrongGame' }

  return { kind: 'ok', code: resolved.code }
}

/**
 * The line to print under the code field, or null when there is nothing to say.
 *
 * `incomplete` and `ok` both answer null, and they are the same answer for
 * different reasons that happen to coincide: nothing is wrong yet, and nothing is
 * wrong at all. Neither wants a reassurance — the submit button going live is what
 * says the code is good, and a field that congratulates you on typing six
 * characters is noise. Keeping the mapping here rather than in the JSX is what lets
 * the wording be asserted at all, and the wrong-game sentence is the one worth
 * asserting: it is the only message on this screen that a reader would otherwise
 * assume said "no such game".
 */
export function verdictMessage(verdict: CodeVerdict): string | null {
  switch (verdict.kind) {
    case 'checking':
      return 'Checking that code…'
    case 'noSuchGame':
      return 'No game with that code.'
    case 'wrongGame':
      return 'That code is not for this game.'
    case 'incomplete':
    case 'ok':
      return null
  }
}

/**
 * The questions one door asks, in order.
 *
 * ⚠️ **The DM door has no seat step, and that is the load-bearing asymmetry of this
 * whole screen.** A DM code plus a display name looks like two halves of one
 * arrival, but writing a name here would create a *seat* — `players.join` is
 * idempotent on the normalised name (ADR 0003), so a name guessed at the door is
 * either somebody else's seat or a brand new empty one that the real DM then has to
 * find and tidy up. The DM door never asks for a name, so it never writes one:
 * `rememberDmCode` alone, and the seat question is settled on arrival by whatever
 * the browser already knows. If it knows a name, `useSeat`'s `pendingRejoin` uses
 * it and `useDm`'s restore effect elevates that seat; if it knows nothing, the name
 * gate asks, and the restore effect fires once the seat resolves. Two paths, one
 * credential, no phantom seat on either.
 *
 * The player door is the mirror image: a seat and no DM code.
 *
 * **These are steps and not routes**, so this returns a list rather than a set of
 * paths. `/` stays the only pre-game location — see `JoinDoorDialog`'s docblock for
 * why a step is not worth a URL.
 */
export function stepsFor(door: Door): StepKind[] {
  return door === 'dm' ? ['gameCode', 'dmCode'] : ['gameCode', 'seat']
}

/**
 * What follows `current` on this door, or `'done'` when the conversation is over.
 *
 * `'done'` is a verdict about the *questions*, not an instruction to commit
 * anything. Each step writes its own answer to storage as it is answered — the code
 * on the DM step, the name on the seat step — so the caller reaching `'done'` is
 * only being told there is nothing left to ask. That division is deliberate: it
 * means a step passed in that this door never asks (a `'seat'` against the DM door,
 * which the types cannot catch since both are `StepKind`) ends the dialog without a
 * credential having been invented for it. Ending is also the only safe answer
 * available — `indexOf` returns -1 for it, and letting that fall through to
 * `steps[0]` would restart the conversation forever.
 */
export function nextStep(door: Door, current: StepKind): StepKind | 'done' {
  const steps = stepsFor(door)
  const at = steps.indexOf(current)
  if (at === -1) return 'done'
  return steps[at + 1] ?? 'done'
}
