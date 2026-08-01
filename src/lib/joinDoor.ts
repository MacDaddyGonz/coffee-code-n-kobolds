import type { Id } from '@convex/_generated/dataModel'
import { DM_CODE_LENGTH, isCompleteJoinCode } from '@convex/lib/codes'

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
 * check, and every rule here is checked in `joinDoor.test.ts`.
 *
 * ⚠️ **Both doors' verdicts live here, and the second one was the point of saying
 * "everything".** The DM door's four messages were once a nested ternary in JSX with
 * a colour rule of their own, which made them the only unasserted copy on the screen
 * — and the drift `verdictOf` warns about below, between a skip condition and the
 * line that says a lookup is in flight, was live and unguarded in exactly the half
 * nothing tested. A decision that reaches a field is either in this file or it is not
 * checked.
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
 * Both fields on this screen are a code with a lookup behind it, and both say this
 * while the lookup is out. One constant rather than two identical literals: the two
 * doors ask for different credentials but the *waiting* is the same waiting, and a
 * reword that reached one of them and not the other would read as two different
 * things happening.
 */
const CHECKING_MESSAGE = 'Checking that code…'

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
      return CHECKING_MESSAGE
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
 * What the DM code typed at the second step of the DM door currently means.
 *
 * Built the same way as `CodeVerdict` — one discriminated union for one field, so the
 * caller renders exactly one line of text for whichever state it is in — and
 * deliberately a *second* union rather than arms added to that one: this field is
 * checked by `games.checkDmCode`, which answers
 * a bare boolean, so there is no row to compare and neither `noSuchGame` nor
 * `wrongGame` has anything to mean here. Sharing the type would put two arms on
 * screen that this field can never reach, and an `ok` carrying a `code` it has no
 * server spelling of.
 *
 * ⚠️ **`ok` carries nothing, and that is the same decision `games.checkDmCode`
 * makes.** A `true` from that query authorises nothing and expires the moment it is
 * read — every DM-only call re-verifies the code server-side through `requireDm`
 * (CLAUDE.md invariant 7). A verdict carrying a token, a game document or anything
 * else would be one refactor from being treated as proof.
 */
export type DmCodeVerdict =
  /** Not eight characters yet, so not worth asking the server about. */
  | { kind: 'incomplete' }
  /** Eight characters, and `checkDmCode` is in flight. */
  | { kind: 'checking' }
  /** The server says this is not the DM code for this game. */
  | { kind: 'wrongCode' }
  | { kind: 'ok' }

/**
 * Is the DM code field long enough to be worth asking the server about?
 *
 * Exported because the caller has to answer the same question one moment earlier than
 * `dmVerdictOf` does — it decides whether to subscribe at all — and the two answers
 * have to be one answer. This is the DM code's counterpart to `isCompleteJoinCode`,
 * which `JoinCodeStep` and `verdictOf` already share for exactly that reason, and the
 * field it guards used to compute the same length test twice in one component.
 *
 * There is nothing to normalise on the way: `CodeInput` caps the field at
 * `DM_CODE_LENGTH` as it is typed. Note that it caps it with `normaliseJoinCode`,
 * which is more forgiving than the server's `normaliseDmCode` — a pre-existing
 * asymmetry recorded in `DmCodeStep`'s docblock, and generous only in the DM's favour.
 */
export function isCompleteDmCode(typed: string): boolean {
  return typed.length === DM_CODE_LENGTH
}

/**
 * Does the DM code typed at the door run this game?
 *
 * Here rather than in `DmCodeStep`'s JSX for the reason at the top of this file, and
 * for one specific to this field: **the skip condition and the "checking" line are
 * the same fact and used to be computed twice.** The step subscribes `checkDmCode`
 * only once the field is the right length, so `verified` is `undefined` both while a
 * real lookup is out *and* while nothing has been asked at all — exactly the hazard
 * `verdictOf` states above, and the failure it produces is a field sitting saying
 * "Checking that code…" about a request nobody made. Answering `incomplete` first,
 * from the same length test the caller reads back to decide whether to subscribe,
 * is what makes the two unable to disagree.
 *
 * `verified` is `boolean | undefined` because that is what `useQuery` returns — a
 * plain shape, so the test needs no Convex.
 */
export function dmVerdictOf(args: { typed: string; verified: boolean | undefined }): DmCodeVerdict {
  const { typed, verified } = args

  // Asked first, and the order matters for the reason `verdictOf` gives: the caller
  // skips the query while the field is short, so `verified` is `undefined` then too.
  if (!isCompleteDmCode(typed)) return { kind: 'incomplete' }

  if (verified === undefined) return { kind: 'checking' }
  return verified ? { kind: 'ok' } : { kind: 'wrongCode' }
}

/**
 * The line under the DM code field. Never null, unlike `verdictMessage`.
 *
 * The asymmetry is deliberate rather than an oversight in one of the two. The join
 * code step says nothing on success because the Continue button going live already
 * says it, and nothing while the field is unfinished because there is nothing to
 * report yet. Both of those hold here too — and this field still speaks in all four
 * states, because both of its quiet states have something the other field does not:
 * a DM code is eight characters of pasted noise, so the unfinished state says *where
 * to find it*, and the success state reports a **consequence** rather than a
 * congratulation — that the code is about to be written into this browser's storage,
 * which is the whole of what this door promises and the one thing a DM sitting at
 * somebody else's laptop would want to have been told.
 *
 * The rejection is `requireDm`'s own wording, so the door and the in-game elevate
 * control do not describe one refusal two ways.
 */
export function dmVerdictMessage(verdict: DmCodeVerdict): string {
  switch (verdict.kind) {
    case 'incomplete':
      return 'The code shown when the game was created.'
    case 'checking':
      return CHECKING_MESSAGE
    case 'ok':
      return 'That is your game. This browser will remember the code.'
    case 'wrongCode':
      return 'That DM code is not right for this game.'
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
export function stepsFor(door: Door): readonly StepKind[] {
  return DOOR_STEPS[door]
}

/**
 * ⚠️ **A `Record` keyed on `Door` rather than `door === 'dm' ? … : …`, for the reason
 * CLAUDE.md invariant 9 gives about `isMonsterSheet` and `rollShapeOf`.** An
 * else-branch is an implicit allow-list of one member with room for any number: add a
 * *spectator* door or a *resume-as-last-seat* door and a ternary keeps compiling,
 * keeps passing, and hands the new door the player's step sequence — which is the
 * sequence that asks for a display name and therefore **writes a seat**. A `Record`
 * over the union fails to compile until the new door's questions have been decided,
 * which is the only moment anybody is in a position to decide them.
 *
 * Nothing here guards a secret, so unlike `isMonsterSheet` there is no fail-closed
 * runtime default to get right: the compile-time refusal is the whole of the guard.
 */
const DOOR_STEPS: Record<Door, readonly StepKind[]> = {
  player: ['gameCode', 'seat'],
  dm: ['gameCode', 'dmCode'],
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

/**
 * Which question is actually on screen, given the one the dialog last stored.
 *
 * Two things can make the stored step the wrong one to render, and **they get one
 * rule between them: fall back to the first question this door asks.**
 *
 * - **No resolved join code yet.** Both later steps are *about a specific game* —
 *   one subscribes `checkDmCode` with its code, the other subscribes that game's
 *   roster — so neither has anything to say before the first step has answered.
 *   Deriving it here rather than widening the resolved code to `''` at the two call
 *   sites is what stops a subscription being opened for a game that does not exist.
 * - **A step this door does not ask**, which the types cannot catch: both doors take
 *   the same `StepKind`.
 *
 * ⚠️ **This deliberately does *not* answer `'done'` for the off-door case, and the
 * difference from `nextStep` is the question being asked rather than a disagreement.**
 * `nextStep` is asked *after* a step has been answered, so ending the conversation is
 * both available to it and the safe answer — nothing is left to ask and each step has
 * already written its own answer down. This is asked *while* a dialog is open and must
 * name a question to render; `'done'` is not a question, and there is no third answer
 * to give. Restarting at the first step is the only thing left, and it is harmless
 * here for the same reason it would be a loop with no exit there: nothing has been
 * committed by rendering a field.
 *
 * **In practice the off-door arm is unreachable through the current caller**, and it
 * lives here anyway. The dialog's stored step is only ever written by its reset or by
 * `nextStep`, and its door cannot change while it is open — so no sequence of clicks
 * produces a `'seat'` against the DM door today. It is reachable *in principle*
 * through this module's public contract, which is exactly the argument for the rule
 * being here rather than in JSX the client vitest project cannot reach: the caller
 * that makes it reachable is the next one, and the rule will already have been
 * decided and asserted by then.
 */
export function currentStep(args: { door: Door; stored: StepKind; hasCode: boolean }): StepKind {
  const { door, stored, hasCode } = args
  const steps = stepsFor(door)

  return hasCode && steps.includes(stored) ? stored : steps[0]
}
