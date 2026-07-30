import { useState } from 'react'
import { ScrollText } from 'lucide-react'

import { CharacterSheetView } from '@/components/sheet/CharacterSheetView'
import { ClaimCharacterPrompt } from '@/components/sheet/ClaimCharacterPrompt'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
 * ⚠️ Two senses of "sheet" meet in this file. `Sheet`, `SheetContent` and the rest
 * are shadcn's slide-out drawer; the *character* sheet is everything named
 * `CharacterSheet*`. See the note at the top of ui/sheet.tsx.
 *
 * Rendered for players and for the DM alike, and the DM getting one is not a
 * loosening of anything: a DM is a seat like any other and may be playing a
 * character alongside running the game. What the DM code actually buys — every
 * sheet in the game, NPCs included, in a tabbed panel — is Milestone 5's, and
 * nothing here anticipates it.
 *
 * The button's label changes with what the seat holds, which is the one piece of
 * discoverability the old standing alert had and a collapsed panel does not: a
 * player who has never claimed a character is told to pick one rather than being
 * offered a sheet that does not exist yet.
 *
 * On not swallowing clicks over the canvas — the trap `MapSetupOverlay` documents.
 * The only thing this puts inside the board is the button: the panel itself is a
 * Radix portal, fixed to the viewport and mounted only while it is open, so it is
 * never an invisible rectangle over the map. The wrapper shrink-wraps the button for
 * the same reason, rather than reserving a column the way the DM's overlay has to.
 */
export function CharacterSheetPanel({
  code,
  playerId,
  dmCode,
  characterId,
}: CharacterSheetPanelProps) {
  const [open, setOpen] = useState(false)
  const hasCharacter = characterId !== null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Top left, because ZoomControls has the bottom left and the DM's map setup
          owns the whole right-hand edge. This is where the claim notice used to sit. */}
      <div className="absolute top-3 left-3 z-10">
        <SheetTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={hasCharacter ? 'outline' : 'default'}
            className="bg-background/90 shadow-sm backdrop-blur"
          >
            <ScrollText />
            {hasCharacter ? 'Character sheet' : 'Play a character'}
          </Button>
        </SheetTrigger>
      </div>

      {/* Wider than the primitive's default: six abilities, a save column and a
          derived bonus beside each do not fit in a phone-width drawer, and this
          application is desktop-only by requirement. Opens from the left so it does
          not fight the DM's panel on the right. */}
      <SheetContent side="left" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{hasCharacter ? 'Character sheet' : 'Play a character'}</SheetTitle>
          <SheetDescription>
            {hasCharacter
              ? 'Changes are saved when you press Save. Hit points save straight away.'
              : 'You are not playing a character yet.'}
          </SheetDescription>
        </SheetHeader>

        {characterId === null ? (
          <ClaimCharacterPrompt code={code} playerId={playerId} isDm={dmCode !== null} />
        ) : (
          <CharacterSheetView
            code={code}
            characterId={characterId}
            playerId={playerId}
            dmCode={dmCode}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
