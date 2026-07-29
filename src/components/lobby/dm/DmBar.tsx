import type { Dm } from '@/hooks/useDm'

export type DmBarProps = {
  code: string
  displayName: string
  dm: Dm
}

/**
 * Game-level DM controls, and the way into them.
 *
 * When this browser is not elevated: an unobtrusive "I'm the DM" button opening
 * a dialog that takes the DM code — with an "I've lost it" path that takes the
 * recovery phrase instead and hands the code back (api.games.recoverDmCode).
 *
 * When it is elevated: a DM badge, "change recovery phrase", and "stand down"
 * (which only forgets the local code — it changes nothing about the game).
 *
 * Per-seat DM actions live in <Lobby>, next to the rows they act on.
 *
 * TODO(wave-2): implement against the props above.
 */
export function DmBar(_props: DmBarProps) {
  return null
}
