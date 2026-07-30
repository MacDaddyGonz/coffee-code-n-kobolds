import { ScrollText } from 'lucide-react'

import { CharacterSheetDrawer } from '@/components/sheet/CharacterSheetDrawer'
import { ClaimCharacterPrompt } from '@/components/sheet/ClaimCharacterPrompt'
import { Button } from '@/components/ui/button'
import type { Id } from '@convex/_generated/dataModel'

export type CharacterSheetPanelProps = {
  code: string
  playerId: Id<'players'>
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string | null
  /** The character this seat is playing, or null. */
  characterId: Id<'characters'> | null
}

/**
 * The character sheet, over the board, behind one button.
 *
 * Rendered for players and for the DM alike, and the DM getting one is not a
 * loosening of anything: a DM is a seat like any other and may be playing a
 * character alongside running the game. What the DM code actually buys — every
 * sheet in the game, NPCs included, in a tabbed panel — belongs to the DM's own
 * panel, and nothing here anticipates it.
 *
 * The button's label changes with what the seat holds, which is the one piece of
 * discoverability the old standing alert had and a collapsed panel does not: a
 * player who has never claimed a character is told to pick one rather than being
 * offered a sheet that does not exist yet. Which is also why a seat with no character
 * still gets a drawer — the claim prompt goes inside it, in the place the sheet will
 * be the moment they have one.
 *
 * The drawer itself, and why it is pinned to the left edge at that width, is
 * `CharacterSheetDrawer`. Both call sites for one had grown their own copy of that
 * reasoning, and the reasoning is about `CharacterSheetEditor`'s layout rather than
 * about either caller, so it now lives in one place.
 */
export function CharacterSheetPanel({
  code,
  playerId,
  dmCode,
  characterId,
}: CharacterSheetPanelProps) {
  const hasCharacter = characterId !== null

  return (
    <CharacterSheetDrawer
      // Top left, because ZoomControls has the bottom left and the DM's map setup
      // owns the whole right-hand edge. This is where the claim notice used to sit.
      // Positioned on the button rather than on a wrapper around it: a button
      // shrink-wraps itself, so there is no column being reserved over the canvas.
      trigger={
        <Button
          type="button"
          size="sm"
          variant={hasCharacter ? 'outline' : 'default'}
          className="bg-background/90 absolute top-3 left-3 z-10 shadow-sm backdrop-blur"
        >
          <ScrollText />
          {hasCharacter ? 'Character sheet' : 'Play a character'}
        </Button>
      }
      title={hasCharacter ? 'Character sheet' : 'Play a character'}
      description={
        hasCharacter
          ? 'Changes are saved when you press Save. Hit points save straight away.'
          : 'You are not playing a character yet.'
      }
      code={code}
      characterId={characterId}
      playerId={playerId}
      dmCode={dmCode}
      empty={<ClaimCharacterPrompt code={code} playerId={playerId} isDm={dmCode !== null} />}
    />
  )
}
