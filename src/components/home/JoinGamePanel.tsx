import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from 'convex/react'

import { CodeInput } from '@/components/CodeInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
            <p id={alphabetHintId} className="text-muted-foreground text-xs">
              Codes never contain I, L, O, 0 or 1.
            </p>
            <p id={lookupId} aria-live="polite" className="min-h-5 text-sm">
              {!complete ? null : game === undefined ? (
                <span className="text-muted-foreground">Checking that code…</span>
              ) : game === null ? (
                <span className="text-destructive">No game with that code.</span>
              ) : (
                <span className="text-muted-foreground">
                  {game.name}, run by {game.createdByName}
                </span>
              )}
            </p>
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
