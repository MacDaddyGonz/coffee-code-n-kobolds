import type { ReactNode } from 'react'

import { CharacterSheetView } from '@/components/sheet/CharacterSheetView'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { Id } from '@convex/_generated/dataModel'

export type CharacterSheetDrawerProps = {
  /** The control that opens it. Rendered `asChild`, so pass a `Button`, not a label. */
  trigger: ReactNode
  title: string
  description: ReactNode
  code: string
  /** Null when there is no character to show a sheet for; `empty` is drawn instead. */
  characterId: Id<'characters'> | null
  /** Routing, not identity — see `useCharacterSheet`. Null where nothing is being routed. */
  playerId: Id<'players'> | null
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string | null
  /** What to draw when `characterId` is null — the claim prompt, typically. */
  empty?: ReactNode
}

/**
 * A character sheet in a slide-out panel, behind a trigger.
 *
 * ⚠️ Both senses of the word meet in this file. `Sheet`, `SheetContent` and the rest
 * are shadcn's slide-out drawer; the *character* sheet is `CharacterSheetView` and
 * everything it renders. ui/sheet.tsx carries the full note.
 *
 * **The two choices below are load-bearing rather than styling, which is why this
 * shell is a component and not two paragraphs of Tailwind repeated at each call
 * site.** `CharacterSheetEditor` is written as the body and footer of a fixed-height
 * column: its fields claim `flex-1` and scroll within it, and Save sits in a
 * `SheetFooter` pinned to the bottom, because a Save button below the fold of a long
 * form is the failure that primitive exists to prevent. It gets neither half of that
 * from a container that grows to fit its contents. And the width has to beat the
 * primitive's phone-sized default: six ability scores with a save column and a
 * derived bonus beside each will not fold into `sm:max-w-sm`, and this application is
 * desktop-only by requirement.
 *
 * **From the left, which is the only edge that is free.** The DM's tools own the
 * right-hand side of the board, so a drawer on that edge would slide over the roster
 * that opened it. From the left, the roster, the tab strip and the middle of the map
 * all stay on screen — which matters because a DM reaching for a monster's stat block
 * is doing it with the party standing on that monster. The player's own sheet opens
 * from the same edge for the mirror-image reason: the DM's panel is over there.
 *
 * Nothing here is added to the pointer-events trap `MapSetupOverlay` documents. All
 * this puts inside the board is the trigger; the drawer is a Radix portal, fixed to
 * the viewport and mounted only while it is open, so it is never an invisible
 * rectangle lying over the canvas waiting to swallow a drag. That the content is
 * mounted only while open is also what keeps `CharacterSheetView`'s two subscriptions
 * from being held for every character nobody is looking at — a party of six and their
 * monsters cost a button apiece when closed.
 *
 * Uncontrolled: nothing outside needs to know whether a sheet is open, so Radix holds
 * that state and a caller does not have to carry a `useState` whose only reader is
 * this component.
 */
export function CharacterSheetDrawer({
  trigger,
  title,
  description,
  code,
  characterId,
  playerId,
  dmCode,
  empty,
}: CharacterSheetDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>

      <SheetContent side="left" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {characterId === null ? (
          empty
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
