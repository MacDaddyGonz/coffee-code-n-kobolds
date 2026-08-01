import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { CODE_ALPHABET_HINT, CodeInput } from '@/components/CodeInput'
import { VerdictLine } from '@/components/VerdictLine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type CodeVerdict, verdictMessage } from '@/lib/joinDoor'
import { getLastDisplayName, getLastGameCode, rememberDisplayName } from '@/lib/session'
import { api } from '@convex/_generated/api'
import {
  MAX_DISPLAY_NAME_LENGTH,
  isCompleteJoinCode,
  normaliseDisplayName,
  normaliseJoinCode,
} from '@convex/lib/codes'

/**
 * Join a game: code (via CodeInput) and display name, prefilled from
 * getLastGameCode() / getLastDisplayName().
 *
 * The code is checked here, before navigating, so a mistyped code reports itself
 * next to the field it was typed into rather than on a game screen that says the
 * game does not exist.
 *
 * ⚠️ **Load-bearing rather than vestigial, now that `<GameList>` sits above it.** The
 * list is capped server-side at `MAX_GAMES_ON_LANDING` — thirty — and the dev
 * deployment already holds seventy-one games, so truncation is an ordinary state and
 * not an edge case. This panel is what makes the cap costless: a game off the end of
 * the list is still perfectly joinable, because the join code was always the thing
 * that admits you and the list publishes none. It is also the only way in to a game
 * whose row you are not meant to be reading off a shared screen at all.
 *
 * It keeps its own `getByCode` subscription and its own name field rather than
 * borrowing the dialog's steps, and that is the right call for a shape that is
 * genuinely different: here the code is the *only* thing identifying the game, so
 * there is no row's `_id` to check it against and nothing for `verdictOf`'s
 * wrong-game arm to compare. One form with two fields is the correct amount of
 * screen for that.
 *
 * ⚠️ **That argument is about the *shape* of the verdict and never licensed its own
 * copy of the wording.** The two sentences this line shares with the dialog's code
 * step — the one about waiting and the one about no such game — were written out here
 * a second time, and `joinDoor.test.ts` pins the helper's versions: a reword there
 * passed CI and left this card, on the same page and often visible at the same moment,
 * saying the old sentence. So the states are built as a `CodeVerdict` below and the
 * strings come from `verdictMessage`. Only the found-a-game line is this panel's own,
 * because it is the one thing the dialog never needs to say — there, a row above the
 * dialog already named the game.
 */
export function JoinGamePanel() {
  const navigate = useNavigate()

  const [code, setCode] = useState(() => normaliseJoinCode(getLastGameCode()))
  const [name, setName] = useState(getLastDisplayName)

  const codeId = useId()
  const nameId = useId()
  const alphabetHintId = useId()
  const lookupId = useId()

  // 'skip' until the code could plausibly match something, so half-typed codes
  // are not a stream of lookups that all report "no such game".
  const complete = isCompleteJoinCode(code)
  const game = useQuery(api.games.getByCode, complete ? { code } : 'skip')

  const displayName = normaliseDisplayName(name)
  const canSubmit = Boolean(game) && displayName.length > 0

  const verdict = lookupVerdict(complete, game)
  // The one sentence on this line that is not a verdict's. A game the code opens is
  // *always* the right game here — there is no row it could have been the wrong one
  // for — so this arm answers with what was found rather than with nothing.
  const found = game ? `${game.name}, run by ${game.createdByName}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join with a code</CardTitle>
        <CardDescription>
          For a game that is not in the list — the code is all you need.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return
            rememberDisplayName(code, displayName)
            void navigate(`/game/${code}`)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={codeId}>Join code</Label>
            <CodeInput
              id={codeId}
              value={code}
              onChange={setCode}
              aria-describedby={`${alphabetHintId} ${lookupId}`}
            />
            {/* Derived from `CODE_ALPHABET` and shared with the dialog's code step,
                which used to hold a second hand-written copy of this sentence. */}
            <p id={alphabetHintId} className="text-muted-foreground text-xs">
              {CODE_ALPHABET_HINT}
            </p>
            {/* The same reserved height and live region as the dialog's two code
                fields, from the one component — see `VerdictLine`. */}
            <VerdictLine
              id={lookupId}
              message={found ?? verdictMessage(verdict)}
              tone={verdict.kind === 'noSuchGame' ? 'destructive' : 'muted'}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Your display name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="nickname"
              placeholder="Mike"
            />
          </div>

          <Button type="submit" disabled={!canSubmit} className="self-start">
            Join game
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * `verdictOf`'s ladder with the wrong-game arm removed, in the order that function
 * asks its questions.
 *
 * ⚠️ **Not `verdictOf` itself, and not `verdictOf` with a widened argument.** That
 * function takes a required `expectedGameId` and compares it, which is the whole of
 * what makes a code opening a *different* game with the same name catchable at the
 * dialog. There is no such id here, so making the argument optional to reuse the
 * function would put the one caller that must never skip that comparison one keystroke
 * away from skipping it. Three states written out, reusing the *type* and therefore
 * `verdictMessage`'s wording, is the trade in the right direction.
 *
 * This is a ladder rather than a ternary in the JSX for the reason `DmCodeStep` stopped
 * being one: the states are a decision and the JSX is a rendering of it.
 */
function lookupVerdict(
  complete: boolean,
  /** `undefined` = in flight or skipped, `null` = no such game. `useQuery`'s own shape. */
  game: FunctionReturnType<typeof api.games.getByCode> | undefined,
): CodeVerdict {
  if (!complete) return { kind: 'incomplete' }

  if (game === undefined) return { kind: 'checking' }
  if (game === null) return { kind: 'noSuchGame' }
  return { kind: 'ok', code: game.code }
}
