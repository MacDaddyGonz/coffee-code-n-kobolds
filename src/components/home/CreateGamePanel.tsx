import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { useNavigate } from 'react-router'
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react'

import { CopyButton } from '@/components/CopyButton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { getLastDisplayName, rememberDisplayName, rememberDmCode } from '@/lib/session'
import { api } from '@convex/_generated/api'
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GAME_NAME_LENGTH,
  MAX_RECOVERY_PHRASE_LENGTH,
  MIN_RECOVERY_PHRASE_LENGTH,
  normaliseDisplayName,
  normaliseRecoveryPhrase,
} from '@convex/lib/codes'

type Created = { code: string; dmCode: string }

type FieldErrors = {
  name?: string
  dmName?: string
  phrase?: string
  confirm?: string
}

/** Keeps the two states the same height, so the swap does not shift the page. */
const PANEL_BODY = 'flex min-h-80 flex-col gap-3'

/**
 * Create a game, then reveal the two codes it produced.
 *
 * Both states live in one card of a fixed minimum height, because the reveal
 * replaces the form in place and a card that jumps as it swaps reads as an error.
 */
export function CreateGamePanel() {
  const navigate = useNavigate()
  const create = useMutation(api.games.create)

  const [name, setName] = useState('')
  const [dmName, setDmName] = useState(getLastDisplayName)
  const [phrase, setPhrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [revealPhrase, setRevealPhrase] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const found = validate(name, dmName, phrase, confirm)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return

    const displayName = normaliseDisplayName(dmName)
    setBusy(true)
    try {
      const result = await create({ name: name.trim(), dmName, recoveryPhrase: phrase })
      // Written before the reveal renders rather than behind "Enter game", so a
      // DM who closes the tab here still comes back seated and elevated.
      rememberDisplayName(result.code, displayName)
      rememberDmCode(result.code, result.dmCode)
      setCreated(result)
    } catch (thrown) {
      setFailure(errorMessage(thrown, 'Could not create the game.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{created ? 'Your game is ready' : 'Start a game'}</CardTitle>
        <CardDescription>
          {created
            ? 'Share the join code. Keep the DM code.'
            : 'You run it. Everyone else joins with the code.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {created ? (
          <Reveal
            code={created.code}
            dmCode={created.dmCode}
            onEnter={() => void navigate(`/game/${created.code}`)}
          />
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className={PANEL_BODY} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-name">Game name</Label>
              <Input
                id="create-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_GAME_NAME_LENGTH}
                placeholder="Tomb of the Coffee Lich"
                autoComplete="off"
                disabled={busy}
                aria-invalid={errors.name !== undefined}
                aria-describedby={errors.name ? 'create-name-error' : undefined}
              />
              {errors.name ? (
                <p id="create-name-error" className="text-destructive text-xs">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-dm-name">Your display name</Label>
              <Input
                id="create-dm-name"
                value={dmName}
                onChange={(event) => setDmName(event.target.value)}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                placeholder="Mike"
                autoComplete="off"
                disabled={busy}
                aria-invalid={errors.dmName !== undefined}
                aria-describedby={errors.dmName ? 'create-dm-name-error' : undefined}
              />
              {errors.dmName ? (
                <p id="create-dm-name-error" className="text-destructive text-xs">
                  {errors.dmName}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="create-phrase">DM recovery phrase</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setRevealPhrase(!revealPhrase)}
                  aria-pressed={revealPhrase}
                >
                  {revealPhrase ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                  {revealPhrase ? 'Hide' : 'Show'}
                </Button>
              </div>
              <Input
                id="create-phrase"
                // Masked by default because a game is often set up on a shared
                // screen and this phrase hands over the DM role. The toggle and
                // the confirm field are both here because masking hides typos.
                type={revealPhrase ? 'text' : 'password'}
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                maxLength={MAX_RECOVERY_PHRASE_LENGTH}
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={errors.phrase !== undefined}
                aria-describedby={
                  errors.phrase ? 'create-phrase-hint create-phrase-error' : 'create-phrase-hint'
                }
              />
              <p id="create-phrase-hint" className="text-muted-foreground text-xs">
                How you get your DM code back if this browser forgets it.
              </p>
              {errors.phrase ? (
                <p id="create-phrase-error" className="text-destructive text-xs">
                  {errors.phrase}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-phrase-confirm">Confirm recovery phrase</Label>
              <Input
                id="create-phrase-confirm"
                type={revealPhrase ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                maxLength={MAX_RECOVERY_PHRASE_LENGTH}
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={errors.confirm !== undefined}
                aria-describedby={errors.confirm ? 'create-phrase-confirm-error' : undefined}
              />
              {errors.confirm ? (
                <p id="create-phrase-confirm-error" className="text-destructive text-xs">
                  {errors.confirm}
                </p>
              ) : null}
            </div>

            {failure ? (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden />
                <AlertTitle>{failure}</AlertTitle>
              </Alert>
            ) : null}

            <Button type="submit" disabled={busy} className="mt-auto">
              {busy ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : null}
              {busy ? 'Creating…' : 'Create game'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Validated with the same functions the mutation uses, so the client and the
 * server never disagree about whether a phrase is long enough or two phrases
 * match — the server compares them lowercased and whitespace-collapsed.
 */
function validate(name: string, dmName: string, phrase: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {}

  if (!name.trim()) errors.name = 'Give the game a name.'
  if (!normaliseDisplayName(dmName)) errors.dmName = 'Enter your display name.'

  const normalised = normaliseRecoveryPhrase(phrase)
  if (normalised.length < MIN_RECOVERY_PHRASE_LENGTH) {
    errors.phrase = `At least ${MIN_RECOVERY_PHRASE_LENGTH} characters.`
  } else if (normaliseRecoveryPhrase(confirm) !== normalised) {
    errors.confirm = 'The two phrases do not match.'
  }

  return errors
}

/**
 * The codes, once. The join code is the loud one because it is the one that gets
 * read out; the DM code is deliberately styled as a secret so the two are not
 * confused when copying, and so handing a player the wrong one looks wrong.
 */
function Reveal({ code, dmCode, onEnter }: { code: string; dmCode: string; onEnter: () => void }) {
  return (
    <div className={PANEL_BODY}>
      <div className="bg-muted space-y-1 rounded-lg p-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <UsersIcon aria-hidden className="size-3.5" />
          Join code — give this to your players
        </div>
        <div className="flex items-center gap-2">
          <code className="font-mono text-3xl font-semibold tracking-[0.2em]">{code}</code>
          <CopyButton value={code} label="join code" />
        </div>
      </div>

      <div className="border-destructive/40 space-y-1 rounded-lg border border-dashed p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          <KeyRoundIcon aria-hidden className="size-3.5" />
          DM code — this is what makes you the DM
          <Badge variant="destructive">Yours only</Badge>
        </div>
        <div className="flex items-center gap-2">
          <code className="font-mono text-xl tracking-[0.2em]">{dmCode}</code>
          <CopyButton value={dmCode} label="DM code" />
        </div>
      </div>

      <p className="text-muted-foreground flex gap-2 text-xs">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Save the DM code somewhere outside this browser. If it is lost, your recovery phrase is
          the way back.
        </span>
      </p>

      <Button type="button" onClick={onEnter} className="mt-auto">
        Enter game
        <ArrowRightIcon aria-hidden />
      </Button>
    </div>
  )
}
