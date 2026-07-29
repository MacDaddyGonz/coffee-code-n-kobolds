import { PencilIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from './ConfirmDialog'
import type { LobbyCharacter } from './lobbyTypes'

type LobbyCharacterDmActionsProps = {
  character: LobbyCharacter
  busy: boolean
  /** True while this character's delete is the call in flight. */
  removing: boolean
  onRename: () => void
  onRemove: () => Promise<boolean>
}

/** Rename and delete, shown per character only to an elevated DM. */
export function LobbyCharacterDmActions({
  character,
  busy,
  removing,
  onRename,
  onRemove,
}: LobbyCharacterDmActionsProps) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        aria-label={`Rename ${character.name}`}
        title={`Rename ${character.name}`}
        onClick={onRename}
      >
        <PencilIcon aria-hidden />
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Delete ${character.name}`}
            title={`Delete ${character.name}`}
          >
            <Trash2Icon aria-hidden />
          </Button>
        }
        title={`Delete ${character.name}?`}
        description={
          `${character.name} is gone for good, along with anything hanging off the ` +
          'character. There is no undo.'
        }
        confirmLabel={`Delete ${character.name}`}
        busy={removing}
        onConfirm={onRemove}
      />
    </>
  )
}
