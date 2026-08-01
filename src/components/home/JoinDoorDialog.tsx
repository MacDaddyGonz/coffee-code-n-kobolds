import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { SeatPicker } from '@/components/lobby/SeatPicker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type Door, type StepKind, currentStep, nextStep } from '@/lib/joinDoor'
import { getLastGameCode, rememberDisplayName, rememberDmCode } from '@/lib/session'
import { normaliseJoinCode } from '@convex/lib/codes'
import { DmCodeStep } from './DmCodeStep'
import type { GameListing } from './GameListRow'
import { JoinCodeStep } from './JoinCodeStep'

export type JoinDoorDialogProps = {
  /**
   * The row that was clicked and the door that was clicked on it, or null — which is
   * how this dialog is closed.
   *
   * One prop rather than two, because the two facts are never separately known: a
   * click names both at once, so a `door` of its own would need a value invented for
   * every frame in which nothing is open — and `door` is the field that decides which
   * credential gets asked for. It is also exactly the object the caller already holds.
   *
   * ⚠️ **`game` is nullable and `opening` is nullable, and they mean two different
   * things.** `opening === null` is *no door is open*. `opening.game === null` is *a
   * door is open with no row behind it* — the `Join with a code` card, where somebody
   * typed a code for a game that is not in the list, or is not on it any more. The
   * consequence runs all the way through this dialog: with no row there is no expected
   * game for the code to be checked against (`verdictOf` takes `null` and says why that
   * is a legitimate state rather than a bypass), and there is nothing to name in the
   * header until the code has resolved.
   */
  opening: { game: GameListing | null; door: Door } | null
  onClose: () => void
}

/**
 * The conversation between clicking a door on the landing page and arriving at the
 * table.
 *
 * **Two callers, and the second one is the same conversation with its first
 * identifying step removed.** `GameList` opens it from a row, which names the game
 * before a word is typed; `JoinGamePanel` opens it with no row at all, for a game that
 * has fallen off the end of a list capped at thirty. Nothing forks in the step machine
 * for that — the player door's questions are `gameCode` then `seat` either way, which
 * is the entire reason that card stopped owning a code lookup, a verdict line and a
 * name field of its own. What does fork is the header, because with no row there is
 * nothing to name until the code has resolved. See `promptFor`.
 *
 * **Two or three states in one dialog, and no route for any of them.** `/` stays the
 * only pre-game location. A step is not worth a URL: none of them is a place you
 * would bookmark, none is worth a back button, and every one of them is *invalidated
 * by the code that has not been typed yet* — a link to "the DM code step of game
 * ABC234" would land on a screen that cannot know which game it is about, because
 * the thing that establishes that is the field on the step before. Routing these
 * would be building a history for a sequence whose earlier answers are its only
 * context. This is the same reading the two neighbouring components already made:
 * `CreateGamePanel` swaps form for reveal in place because a card that jumps as it
 * swaps reads as an error, and `ElevateDialog` is one dialog showing one of two
 * secret-taking paths at a time because whoever is in there already knows which one
 * they want.
 *
 * **The two doors, exactly as shipped:**
 *
 * - **Player** — join code → seat picker → `rememberDisplayName` → `/game/CODE`.
 * - **DM** — join code → DM code → `rememberDmCode` → `/game/CODE`. Two steps, not
 *   three.
 *
 * ⚠️ **The DM door deliberately never writes a display name.** It never asks for one,
 * and a name is not a field that can be guessed at on somebody's behalf:
 * `players.join` is idempotent on the normalised name (ADR 0003), so a name invented
 * here either lands on an existing seat that is not yours or creates a phantom one
 * the real DM then has to find and tidy. The seat question is settled on arrival
 * instead, and it works from either starting point — verified in `useSeat` and
 * `useDm` rather than assumed:
 *
 * - If storage already holds a name for this game, `useSeat`'s `pendingRejoin` reads
 *   it at mount and rejoins silently; `useDm`'s restore effect then elevates that
 *   seat.
 * - If it holds nothing, the name gate asks first, and the restore effect fires when
 *   the seat resolves — because that effect returns early on `!playerId` **before**
 *   it touches its `restoredFor` ref, so the frames spent on the gate do not burn
 *   the one restore attempt, and it reads `getDmCode(code)` *inside* the effect, so a
 *   code written milliseconds before `navigate()` is picked up rather than captured
 *   stale.
 *
 * This is `CreateGamePanel`'s already-proven pattern: it writes both keys before its
 * reveal renders and lets the game route pick them up, for the same reason.
 *
 * ⚠️ **Storage refused is reported by a toast, not by a line in here**, which is the
 * one place this deviates from the obvious shape. The rule is that a browser with
 * storage off is still let through — the milestone's both-doors principle, and true:
 * `DmBar` in Settings elevates just as well as this door does (ADR 0008 put it
 * there so a DM who lost the code mid-campaign had a way back). But a message
 * rendered in a dialog that unmounts on the same tick as the navigation is a message
 * nobody reads. The `Toaster` is mounted outside the router in `main.tsx`, so a toast
 * survives the route change and is still on screen at the place its instructions
 * apply to. Both doors get a sentence, because the consequence differs and both are
 * confusing unexplained: the DM lands as a plain player, and the player is asked
 * which seat they are all over again having just picked it off a list.
 */
export function JoinDoorDialog({ opening, onClose }: JoinDoorDialogProps) {
  const navigate = useNavigate()

  /**
   * The question this dialog last decided to ask. What is *rendered* is
   * `currentStep`'s answer below, which corrects two things this cannot know on its
   * own — see there.
   */
  const [storedStep, setStoredStep] = useState<StepKind>('gameCode')
  /**
   * What is in the join code field, or `null` for *nothing has been typed into it yet*
   * — which is not the same state as an empty field and is the one the prefill applies
   * in.
   *
   * ⚠️ **The two spellings of "no code" are load-bearing here rather than the sloppiness
   * CLAUDE.md invariant 9 warns about.** A code-only join opens with the field prefilled
   * from `getLastGameCode()`, and clearing that field has to leave it cleared — if `''`
   * and "untouched" were one state the prefill would come straight back on the next
   * render and the field could not be emptied. So `null` means untouched and `''` means
   * emptied, and only the first of them prefills.
   *
   * Derived at the render below rather than written in through an effect on `opening`,
   * because the prefill depends on a prop this component cannot observe changing: the
   * dialog is mounted for the whole life of its card and only its content comes and
   * goes, so a `useState` initialiser runs once — long before any door is open — and an
   * effect would be a second source of truth for a field somebody is typing into.
   */
  const [typedGameCode, setTypedGameCode] = useState<string | null>(null)
  const [typedDmCode, setTypedDmCode] = useState('')
  /**
   * The game the join code opened: the server's spelling of the code, and the name it
   * has for it.
   *
   * One piece of state rather than a code beside a name, for the reason `opening` is one
   * prop rather than two — the two facts are never separately known, since both arrive
   * from the one step that resolved them. The name is here at all because with no row
   * the header has nothing else to name the game with, and `null` is *the first question
   * has not been answered yet*, which is what `currentStep` reads as `hasCode: false`.
   */
  const [resolvedGame, setResolvedGame] = useState<{ code: string; name: string } | null>(null)
  /**
   * A one-way latch, set when the navigation is handed off and never cleared — the
   * reset on close is what clears it. There is nothing asynchronous to wait for here
   * (both writes are synchronous and the two checks are subscriptions rather than
   * calls), so what this covers is the frames between the click and this whole tree
   * unmounting with the route: long enough for a second click, and a second click on
   * the seat step would write a second name.
   */
  const [leaving, setLeaving] = useState(false)

  /**
   * The step actually on screen, which is not quite the one in state.
   *
   * ⚠️ **The corrections live in `joinDoor.ts`, and that is the point of the split.**
   * They used to be a two-branch ternary here, and one of those branches disagreed
   * with the tested module about what a step this door does not ask should do —
   * `nextStep` answers `'done'`, this answered "start again". Two answers to one
   * question, in a decision that picks which credential field is on screen, with the
   * untestable copy winning. `currentStep` is now the only place either correction is
   * made and both are asserted; `null` here means there is no door open to ask about.
   */
  const step: StepKind | null =
    opening === null
      ? null
      : currentStep({
          door: opening.door,
          stored: storedStep,
          hasCode: resolvedGame !== null,
        })

  /**
   * What goes in the join code field.
   *
   * ⚠️ **Prefilled from `getLastGameCode()` only when there is no row**, and the
   * asymmetry is the whole point. With a row, *this* game is named on screen and last
   * game's code is the one answer that is certainly wrong — prefilling it would open the
   * dialog already complaining. With no row there is nothing on screen saying which game
   * this is about, and last game's code is very often exactly the one being retyped: that
   * prefill is behaviour the card this dialog replaced already had, and a returning
   * visitor relies on it.
   *
   * The `??` short-circuits, so storage is read only while the field is untouched rather
   * than on every keystroke.
   */
  const gameCode =
    typedGameCode ??
    (opening !== null && opening.game === null ? normaliseJoinCode(getLastGameCode()) : '')

  /** Nothing typed into this dialog outlives it. See `ElevateDialog.forgetInput`. */
  function reset() {
    // The same value the state above initialises to, and the first question of both
    // doors. Which of those two facts is doing the work does not matter, because
    // neither is observable: `currentStep` answers with this door's first step for any
    // stored value at all while no code has resolved, which is always true right after
    // a reset.
    setStoredStep('gameCode')
    // Back to *untouched* rather than to an empty string, which is what lets the next
    // open of a code-only door prefill itself again. Whether it does is decided at the
    // render — see `gameCode` above — because the answer depends on the next `opening`
    // and this runs against the one being closed.
    setTypedGameCode(null)
    setTypedDmCode('')
    setResolvedGame(null)
    setLeaving(false)
  }

  /**
   * The one way out, and every route to it comes through here: Cancel on each step,
   * Escape, the overlay and the corner cross. The reset has to live at this junction
   * rather than in `onOpenChange` alone, because Radix only reports the closes *it*
   * causes — a Cancel button calling `onClose` directly would flip `opening` to null and
   * never tell Radix anything, so a reset written only in that handler would run for
   * three of the four ways out.
   *
   * Unmounting the content drops `DmCodeStep`'s `checkDmCode` subscription too, which
   * is the one carrying the typed DM code as an argument.
   */
  function close() {
    reset()
    onClose()
  }

  /**
   * Move to the next question, or leave. `'done'` says only that there is nothing
   * left to *ask*: each step has already written its own answer down by the time it
   * calls this, which is why a `'done'` arriving from a step this door never asks
   * cannot have invented a credential on the way.
   */
  function advance(from: StepKind, code: string) {
    // Only a mounted step calls this, so there is always a door — the test is here
    // because the door now travels with the game in one prop rather than beside it.
    if (opening === null) return

    const next = nextStep(opening.door, from)
    if (next !== 'done') {
      setStoredStep(next)
      return
    }
    setLeaving(true)
    void navigate(`/game/${code}`)
  }

  /**
   * ⚠️ **This does not join, and `SeatPicker`'s prop name says "take seat" because
   * its other caller does.** At the door there is no seat to take yet: the game route
   * is not mounted, `useSeat` does not exist, and calling `players.join` from here
   * would be a second joiner racing the one on arrival. So this writes the name to
   * storage and navigates, and `useSeat`'s `pendingRejoin` — initialised from that
   * very key at mount — performs the actual `players.join` a moment later. Same
   * mutation, same idempotence on the name, one caller.
   *
   * The name arrives already normalised: `SeatPicker` passes either a seat's own
   * `displayName` straight off the server's roster or the field's value through
   * `normaliseDisplayName`, which is the same function `players.join` keys on.
   */
  function takeSeat(displayName: string) {
    if (leaving || resolvedGame === null) return
    // The answer is about the *per-game* key alone, which is the one this sentence
    // describes: it is what `useSeat` reads at mount, so losing it is the seat question
    // being asked again. `rememberDisplayName` also writes two prefills and deliberately
    // says nothing about them — folding them in made this warning fire for a browser
    // that had remembered the seat perfectly.
    if (!rememberDisplayName(resolvedGame.code, displayName)) {
      toast.warning(
        'This browser has storage turned off, so you will be asked which seat you are again when you arrive.',
      )
    }
    advance('seat', resolvedGame.code)
  }

  /**
   * The whole of the DM door's last step: write the verified code down and leave.
   *
   * ⚠️ **One key, and the absence of the second one is the decision.** A
   * `rememberDisplayName` here would look like tidiness — the player door writes one,
   * after all — and it would be a guess at somebody's identity, which is the one field
   * that cannot be guessed at: the name *is* the seat (ADR 0003), so an invented one
   * either takes a seat that is not this person's or leaves a phantom for the real DM
   * to clean up. The DM door never asked, so it never answers.
   *
   * This is `CreateGamePanel`'s pattern with one key instead of two, and it works for
   * the same reason: the write lands before the navigation, and `useDm`'s restore
   * effect reads the key back rather than being handed the code.
   */
  function keepDmCode() {
    if (leaving || resolvedGame === null) return
    if (!rememberDmCode(resolvedGame.code, typedDmCode)) {
      toast.warning(
        'This browser has storage turned off, so you will need to enter your DM code from Settings once you are in.',
      )
    }
    advance('dmCode', resolvedGame.code)
  }

  const prompt =
    opening === null || step === null
      ? null
      : promptFor(opening.door, step, {
          // Two names and not one coalesced value, because which of them the header has
          // is *what* it is allowed to say — see `promptFor`. `row` is null for a
          // code-only join and `opened` is null until the first step answers, so the two
          // are null together on exactly one screen: the code field of a code-only join,
          // which is the one place nothing can be named.
          //
          // Both are passed unconditionally, including on the path where they name the
          // same game. `promptFor` compares them, and it can only do that if it is handed
          // both — a `row` suppressed here on the grounds that `opened` is more specific
          // would take the comparison away from the one function positioned to make it.
          row: opening.game?.name ?? null,
          opened: resolvedGame?.name ?? null,
        })

  return (
    <Dialog
      open={opening !== null}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      {/* Mounted only while there is a game, so a closed dialog holds no step, no
          subscription and no typed code.

          All three tests say the same thing — `step` and `prompt` are non-null exactly
          when `opening` is — and all three are here because TypeScript cannot narrow one
          local from the *value* of another. Naming them is what lets the branches below
          take a `StepKind` and a `Prompt` rather than working around a maybe. Note that
          `opening.game` is *not* one of the maybes being cleared up: it is legitimately
          null for a code-only join and stays that way all the way down. */}
      {opening !== null && step !== null && prompt !== null ? (
        // Wider on the seat step, and only there. `DialogContent`'s default
        // `sm:max-w-sm` is right for a single code field and too narrow for the seat
        // list, which puts a name field and its button side by side and a roster row
        // above them. Two widths for two shapes of question, rather than one width
        // that squeezes the roster or leaves a code field floating in air. The roster
        // can also grow past the viewport with enough seats, so it scrolls inside the
        // dialog — the same treatment `BestiaryPicker` gives its shelf.
        <DialogContent
          className={
            step === 'seat' ? 'max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-lg' : undefined
          }
        >
          <DialogHeader>
            <DialogTitle>{prompt.title}</DialogTitle>
            <DialogDescription>{prompt.description}</DialogDescription>
          </DialogHeader>

          {/*
            The second half of this test is redundant with `step`, which is already
            `'gameCode'` whenever there is no resolved game. It is here because
            TypeScript cannot narrow `resolvedGame` from the *value* of another
            variable, and the narrowing is what lets the two branches below take a
            plain `string` — no `?? ''` standing in for a code, and therefore no
            subscription opened for a game that does not exist.
          */}
          {step === 'gameCode' || resolvedGame === null ? (
            <JoinCodeStep
              // Null for a code-only join, which is the whole of what this step does
              // differently: with no row there is no `_id` for the typed code to be
              // checked against, and any game it opens is the right one.
              game={opening.game}
              typed={gameCode}
              onTyped={setTypedGameCode}
              onResolved={(resolved) => {
                setResolvedGame(resolved)
                advance('gameCode', resolved.code)
              }}
              onCancel={close}
            />
          ) : step === 'dmCode' ? (
            <DmCodeStep
              // The server's spelling, never what was typed — `verdictOf` hands back
              // `resolved.code` for exactly this reason.
              code={resolvedGame.code}
              typed={typedDmCode}
              onTyped={setTypedDmCode}
              onVerified={keepDmCode}
              onCancel={close}
              busy={leaving}
            />
          ) : (
            <SeatPicker
              code={resolvedGame.code}
              busy={leaving}
              // No join happens at this door, so there is no join failure to put
              // under the field. The one thing that can go wrong is the storage
              // write, and its message is about the screen you are arriving at
              // rather than about this field, so it leaves as a toast instead.
              error={null}
              onTakeSeat={takeSeat}
              footer={
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={leaving} onClick={close}>
                    Cancel
                  </Button>
                </DialogFooter>
              }
            />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

type Prompt = { title: string; description: string }

/**
 * Which name the header is in a position to print, and where it came from.
 *
 * ⚠️ **Two fields rather than one coalesced name, because they are not interchangeable
 * facts about the same string.** `row` is a name the person has *already seen and
 * clicked*; `opened` is a name the server handed back for a code they typed, and printing
 * it is a piece of information — *this is the game that code opens* — delivered at the
 * last moment before they commit to walking into it. Collapsing the two into
 * `row ?? opened` would lose which of those two sentences the header is entitled to say,
 * and the copy for the row's doors would silently change the day the fallback fired.
 *
 * ⚠️ **They can now disagree with a row present, which is what makes keeping both load
 * bearing rather than merely tidy.** `JoinCodeStep`'s wrong-game escape hatch continues
 * with the game a typed code opened after a row claimed a different one, so *the row that
 * was clicked* and *the game this is about* are two facts that a single field would have
 * had to choose between — and either choice is wrong on one of the two paths. Holding both
 * is what lets `promptFor` ask whether they differ.
 */
type Naming = {
  /** The clicked row's name, or null for a code-only join. */
  row: string | null
  /** The resolved game's name, or null until the code step has answered. */
  opened: string | null
}

/**
 * What the first step's header says, per door.
 *
 * ⚠️ **A `Record` keyed on `Door` rather than `door === 'dm' ? … : …`**, for the reason
 * `DOOR_STEPS` in `joinDoor.ts` is one and the reason CLAUDE.md invariant 9 gives: an
 * else-branch is an allow-list of one member with room for any number, so a third door
 * would silently arrive wearing the player's heading — *Join* rather than *Run*, which
 * is the one pair on this screen that must not read alike, since it is all that tells
 * somebody mid-sequence which door they walked through. A `Record` fails to compile
 * until the new door has been given words of its own.
 *
 * **Each door now spells its heading twice, because this is the one step that can run
 * with nothing named.** A code-only join has no row above it and no resolved game yet,
 * so there is no game to put in a title — and *Join* against *Run* still has to be the
 * thing the title says, which is why the code-less spelling is per door and not one
 * shared sentence. ⚠️ The DM half of that is unreachable today: nothing opens this
 * dialog with `{ game: null, door: 'dm' }`, and `JoinGamePanel` says why no card
 * offers to. It is written anyway for the same reason the `Record` is a `Record` — the
 * moment somebody adds that card, the words have already been chosen by somebody who
 * was thinking about them.
 *
 * Only this step forks by door. The two later ones are asked by one door each.
 */
const GAME_CODE_PROMPTS: Record<Door, (gameName: string | null) => Prompt> = {
  dm: (gameName) => ({
    title: gameName === null ? 'Run a game by code' : `Run ${gameName}`,
    description: 'Two codes: the join code for the game, then the DM code for it.',
  }),
  player: (gameName) => ({
    title: gameName === null ? 'Join with a code' : `Join ${gameName}`,
    description:
      gameName === null
        ? // Says what a code buys somebody whose game is not on the list: the code is
          // both the credential and the only thing identifying the game.
          'The code from whoever is running it — for a game that is not in the list.'
        : // Says why a list that already names the game still asks for a code.
          'The code from whoever is running it — the one thing the list cannot tell you.',
  }),
}

/**
 * What the header says, per door and per step.
 *
 * Here rather than inline so the headings can be read together — they are the only thing
 * telling somebody mid-sequence which of the two doors they walked through, and the pair
 * that must not read alike is *Join* against *Run*.
 *
 * ⚠️ **The seat step names the game whenever the game it is about is not the one the row
 * named**, which is the one place a `Naming` with two fields earns its keep. Two ways for
 * that to be true, and they arrive from opposite directions:
 *
 * - **No row at all.** Nothing on screen has ever said which game this is — the old
 *   *Join with a code* card said it in a line under the code field, and saying it here
 *   instead says it later and better, immediately before the seat is committed to.
 * - **A row that was overridden.** `JoinCodeStep`'s wrong-game escape hatch continues
 *   with the game the *code* opened rather than the game the row claimed, so the row is
 *   no longer what this dialog is about. Without this, somebody who took that way out
 *   would pick a seat under a header still implying the row they clicked — which is
 *   precisely the confusion the escape hatch was built to end, reappearing one screen
 *   later.
 *
 * **One rule covers both, and it is a comparison rather than a null test.** Print
 * `opened` when there is an `opened` and it differs from `row`. The no-row case satisfies
 * that because `row` is null; the override case satisfies it because the two names are
 * genuinely different games' names. Arriving normally from a row, the two strings are
 * equal and the line stays away — that path's copy is byte-identical to what it has always
 * been, which is the property worth keeping, since the game was already named on the row
 * and again in the title of the step before.
 *
 * ⚠️ **This compares names, and that is safe here for the one reason it is never safe in
 * `verdictOf`.** Two games may share a title, so an override between same-named games
 * leaves this saying nothing extra — and *saying nothing extra is right*, because the
 * string it would print is the string already above it. Nothing is decided by the
 * comparison: the identity question was settled by `_id` one step earlier, and all that
 * hangs on this is whether a heading repeats a word. The `_id` needed to be exact and this
 * needs only to be about the *text*, which is why widening `resolvedGame` to carry an id
 * for the sake of it would be precision bought for a decision that has no use for any.
 *
 * The `opened !== null` half also keeps the fallback the right way round for the
 * unreachable case where both names are absent — this step does not render until a code
 * has resolved, and a heading with a hole where a name should be is worse than a heading
 * that says one thing less.
 */
function promptFor(door: Door, step: StepKind, naming: Naming): Prompt {
  switch (step) {
    case 'gameCode':
      return GAME_CODE_PROMPTS[door](naming.row)
    case 'dmCode':
      return {
        title: 'Your DM code',
        description: 'The code shown when the game was created. This browser will remember it.',
      }
    case 'seat':
      return {
        title: 'Which seat is yours?',
        description:
          naming.opened !== null && naming.opened !== naming.row
            ? `Joining ${naming.opened}. Use the same name as last time and your character comes back with you.`
            : 'Use the same name as last time and your character comes back with you.',
      }
  }
}
