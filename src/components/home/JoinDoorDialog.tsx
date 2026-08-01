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
import { rememberDisplayName, rememberDmCode } from '@/lib/session'
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
   */
  opening: { game: GameListing; door: Door } | null
  onClose: () => void
}

/**
 * The conversation between clicking a door on a game row and arriving at the table.
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
  const [typedGameCode, setTypedGameCode] = useState('')
  const [typedDmCode, setTypedDmCode] = useState('')
  const [resolvedCode, setResolvedCode] = useState<string | null>(null)
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
          hasCode: resolvedCode !== null,
        })

  /** Nothing typed into this dialog outlives it. See `ElevateDialog.forgetInput`. */
  function reset() {
    // The same value the state above initialises to, and the first question of both
    // doors. Which of those two facts is doing the work does not matter, because
    // neither is observable: `currentStep` answers with this door's first step for any
    // stored value at all while no code has resolved, which is always true right after
    // a reset.
    setStoredStep('gameCode')
    // Not prefilled from `getLastGameCode()`, unlike the panel below the list: a row
    // names *this* game, so last game's code is the one answer that is certainly
    // wrong, and prefilling it would open the dialog already complaining.
    setTypedGameCode('')
    setTypedDmCode('')
    setResolvedCode(null)
    setLeaving(false)
  }

  /**
   * The one way out, and every route to it comes through here: Cancel on each step,
   * Escape, the overlay and the corner cross. The reset has to live at this junction
   * rather than in `onOpenChange` alone, because Radix only reports the closes *it*
   * causes — a Cancel button calling `onClose` directly would flip `game` to null and
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
    if (leaving || resolvedCode === null) return
    // The answer is about the *per-game* key alone, which is the one this sentence
    // describes: it is what `useSeat` reads at mount, so losing it is the seat question
    // being asked again. `rememberDisplayName` also writes two prefills and deliberately
    // says nothing about them — folding them in made this warning fire for a browser
    // that had remembered the seat perfectly.
    if (!rememberDisplayName(resolvedCode, displayName)) {
      toast.warning(
        'This browser has storage turned off, so you will be asked which seat you are again when you arrive.',
      )
    }
    advance('seat', resolvedCode)
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
    if (leaving || resolvedCode === null) return
    if (!rememberDmCode(resolvedCode, typedDmCode)) {
      toast.warning(
        'This browser has storage turned off, so you will need to enter your DM code from Settings once you are in.',
      )
    }
    advance('dmCode', resolvedCode)
  }

  const prompt =
    opening === null || step === null ? null : promptFor(opening.door, step, opening.game.name)

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
          take a `StepKind` and a `GameListing` rather than working around a maybe. */}
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
            `'gameCode'` whenever there is no resolved code. It is here because
            TypeScript cannot narrow `resolvedCode` from the *value* of another
            variable, and the narrowing is what lets the two branches below take a
            plain `string` — no `?? ''` standing in for a code, and therefore no
            subscription opened for a game that does not exist.
          */}
          {step === 'gameCode' || resolvedCode === null ? (
            <JoinCodeStep
              game={opening.game}
              typed={typedGameCode}
              onTyped={setTypedGameCode}
              onResolved={(code) => {
                setResolvedCode(code)
                advance('gameCode', code)
              }}
              onCancel={close}
            />
          ) : step === 'dmCode' ? (
            <DmCodeStep
              // The server's spelling, never what was typed — `verdictOf` hands back
              // `resolved.code` for exactly this reason.
              code={resolvedCode}
              typed={typedDmCode}
              onTyped={setTypedDmCode}
              onVerified={keepDmCode}
              onCancel={close}
              busy={leaving}
            />
          ) : (
            <SeatPicker
              code={resolvedCode}
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
 * Only this step forks. The two later ones are asked by one door each, so their headings
 * are the same sentence whoever is reading them.
 */
const GAME_CODE_PROMPTS: Record<Door, (gameName: string) => Prompt> = {
  dm: (gameName) => ({
    title: `Run ${gameName}`,
    description: 'Two codes: the join code for the game, then the DM code for it.',
  }),
  player: (gameName) => ({
    title: `Join ${gameName}`,
    // Says why a list that already names the game still asks for a code.
    description: 'The code from whoever is running it — the one thing the list cannot tell you.',
  }),
}

/**
 * What the header says, per door and per step.
 *
 * Here rather than inline so the four headings can be read together — they are the
 * only thing telling somebody mid-sequence which of the two doors they walked
 * through, and the pair that must not read alike is *Join* against *Run*.
 */
function promptFor(door: Door, step: StepKind, gameName: string): Prompt {
  switch (step) {
    case 'gameCode':
      return GAME_CODE_PROMPTS[door](gameName)
    case 'dmCode':
      return {
        title: 'Your DM code',
        description: 'The code shown when the game was created. This browser will remember it.',
      }
    case 'seat':
      return {
        title: 'Which seat is yours?',
        description: 'Use the same name as last time and your character comes back with you.',
      }
  }
}
