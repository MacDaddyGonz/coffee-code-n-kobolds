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
  characterId: Id<'characters'>
  /** Routing, not identity — see `useCharacterSheet`. Null where nothing is being routed. */
  playerId: Id<'players'> | null
  /** Present means this browser holds it; every call inside re-verifies it server-side. */
  dmCode: string | null
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
 * column: its fields claim `flex-1` and scroll within it, and Save sits in an
 * `EditorFooter` pinned to the bottom, because a Save button below the fold of a long
 * form is the failure that arrangement exists to prevent. It gets neither half of that
 * from a container that grows to fit its contents. And the width has to beat the
 * primitive's phone-sized default: six ability scores with a save column and a
 * derived bonus beside each will not fold into `sm:max-w-sm`, and this application is
 * desktop-only by requirement. The `sm:max-w-xl` below is the same 576 pixels as
 * `MIN_RIGHT_PANE`, which is that measurement made into the panel's floor — the sheet
 * is the same shape in a tab as it is here.
 *
 * **One caller now, and knowing which one it is explains both choices above.** The
 * player's own sheet is no longer a drawer at all — it is the Character tab in the
 * shell's right-hand panel, which is a fixed-height column already and needs no
 * primitive to make it one. What is left is `DmCharacterSheet`, opened from a row of
 * the DM's character lists, and those lists live in that same right-hand panel. So
 * this component is now one thing only: the DM pulling up a single character's sheet
 * over the map, from a row in DM tools. It is always handed a character id, which is
 * why there is no empty state to draw.
 *
 * **From the left, which is the only edge that is free.** The right-hand panel owns
 * that side of the screen, so a drawer on that edge would slide over the very list
 * that opened it. From the left, that panel and the middle of the map both stay on
 * screen — which matters because a DM reaching for a monster's stat block is doing it
 * with the party standing on that monster.
 *
 * That the content is mounted only while open is what keeps `CharacterSheetView`'s
 * two subscriptions from being held for every character nobody is looking at — a
 * party of six and their monsters cost a button apiece when closed. The Character tab
 * is the deliberate exception to that and carries its own reasoning: an editor
 * unmounted while a draft is half typed loses the draft, so it is force-mounted. See
 * `RightPane`.
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
}: CharacterSheetDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>

      <SheetContent side="left" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <CharacterSheetView
          code={code}
          characterId={characterId}
          playerId={playerId}
          dmCode={dmCode}
        />
      </SheetContent>
    </Sheet>
  )
}
