import { useState } from 'react'

import { ElevateDialog } from '@/components/lobby/dm/ElevateDialog'
import { RecoveredCodeNotice } from '@/components/lobby/dm/RecoveredCodeNotice'
import { RecoveryPhraseDialog } from '@/components/lobby/dm/RecoveryPhraseDialog'
import { StandDownDialog } from '@/components/lobby/dm/StandDownDialog'
import { Badge } from '@/components/ui/badge'
import type { Dm } from '@/hooks/useDm'

export type DmBarProps = {
  code: string
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
 */
export function DmBar({ code, dm }: DmBarProps) {
  // Survives the swap between the two branches below, which is the point: the
  // reveal is triggered by a recovery that immediately unmounts the dialog.
  const [showRecoveredCode, setShowRecoveredCode] = useState(false)

  // Branching on the code rather than the flag narrows it for the mutations that
  // take it; the two are the same condition.
  if (dm.dmCode === null) {
    return (
      <div className="flex justify-end">
        <ElevateDialog dm={dm} onRecovered={() => setShowRecoveredCode(true)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <Badge>DM</Badge>
        <p className="text-muted-foreground text-sm">
          This browser holds the DM code for this game, so you can run it from here.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <RecoveryPhraseDialog code={code} dmCode={dm.dmCode} />
          <StandDownDialog
            onStandDown={() => {
              setShowRecoveredCode(false)
              dm.standDown()
            }}
          />
        </div>
      </div>
      {showRecoveredCode ? (
        <RecoveredCodeNotice dmCode={dm.dmCode} onDismiss={() => setShowRecoveredCode(false)} />
      ) : null}
    </div>
  )
}
