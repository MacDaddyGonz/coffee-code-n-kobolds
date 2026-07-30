import { useMutation, useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { HpControls } from '@/components/HpControls'
import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { CharacterSheetView } from '@/components/sheet/CharacterSheetView'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useHpActions, useVitals } from '@/hooks/useVitals'
import { cn } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { PublicCharacter, PublicVitals } from '@convex/lib/characters'
import { NpcCreateDialog } from './NpcCreateDialog'

export type DmSheetsPanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
  /** So the board can position this without this file knowing where. */
  className?: string
}

/**
 * Everyone in the game, with their hit points, in front of the person running it.
 *
 * The DM sees exact numbers for a monster and a player does not, and that asymmetry
 * is not drawn here — it arrives already decided. `characters.vitals` sends an
 * `exact` row or a `band` row depending on a `dmCode` it re-checks against the game
 * document, and `publicVitalsValidator` makes the player's variant a shape with no
 * numeric field in it at all. So `HpControls` below is handed whichever of the two
 * turned up and formats it; there is nothing hidden behind the bar for a client to
 * reveal, which is the difference between CLAUDE.md invariant 1 being kept and being
 * claimed.
 *
 * NPCs appear in this list for the same reason and by the same means: `characters.
 * list` only returns them when it is given a DM code that verifies. Rendering this
 * panel on the strength of holding one authorises nothing (invariant 7) — a browser
 * with a stale or invented code gets a list of player characters and refusals on
 * every write, which is exactly what it should get.
 *
 * Two subscriptions, deliberately separate. The roster changes when somebody is
 * created or claimed; the hit points change several times a round. Folding them
 * together would re-push the whole list on every point of damage, which is the split
 * `characterVitals` exists to make possible in the first place (invariant 2).
 */
export function DmSheetsPanel({ code, dmCode, className }: DmSheetsPanelProps) {
  const characters = useQuery(api.characters.list, { code, dmCode })
  const vitals = useVitals(code, dmCode)
  // No `playerId`. A seat id is a routing argument rather than proof of anything
  // (ADR 0003), and the DM code is what these mutations actually check — so sending
  // one here would be decoration that looked like authority.
  const hp = useHpActions({ code, dmCode, playerId: null })
  const removeCharacter = useMutation(api.characters.remove)
  const action = useLobbyAction()

  const players = characters?.filter((character) => character.kind === 'pc') ?? []
  const npcs = characters?.filter((character) => character.kind === 'npc') ?? []

  const remove = (character: PublicCharacter) =>
    action.run(`remove:${character._id}`, `Could not delete ${character.name}.`, () =>
      removeCharacter({ code, dmCode, characterId: character._id }),
    )

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle>Characters</CardTitle>
        <CardDescription>
          Everyone at the table, and the monsters only you can see. Their exact hit points reach
          this screen because you hold the DM code, and no other screen at all.
        </CardDescription>
        <CardAction>
          <NpcCreateDialog code={code} dmCode={dmCode} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {characters === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <Section title="Player characters" empty="Nobody has made a character yet.">
              {players.map((character) => (
                <CharacterRow
                  key={character._id}
                  code={code}
                  dmCode={dmCode}
                  character={character}
                  vitals={vitals.of(character._id)}
                  onAdjust={(delta) => void hp.adjust(character._id, delta)}
                />
              ))}
            </Section>

            <Separator />

            <Section
              title="NPCs"
              empty="No NPCs yet. Add one here, or straight from the token dialog on the Map tab."
            >
              {npcs.map((character) => (
                <CharacterRow
                  key={character._id}
                  code={code}
                  dmCode={dmCode}
                  character={character}
                  vitals={vitals.of(character._id)}
                  onAdjust={(delta) => void hp.adjust(character._id, delta)}
                  actions={
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={action.pending !== null}
                          aria-label={`Delete ${character.name}`}
                        >
                          Delete
                        </Button>
                      }
                      title={`Delete ${character.name}?`}
                      description={
                        `${character.name}'s sheet and hit points are gone for good, and any ` +
                        'token standing on the board for it is cut loose rather than deleted — ' +
                        'it keeps its art and its square, and simply stops having a health bar. ' +
                        'There is no undo.'
                      }
                      confirmLabel={`Delete ${character.name}`}
                      busy={action.pending === `remove:${character._id}`}
                      onConfirm={() => remove(character)}
                    />
                  }
                />
              ))}
            </Section>
          </>
        )}

        {/* Both failure channels land here: a refused delete through the shared
            action hook, and a refused `−5` through the hit-point hook, which reports
            rather than throwing so that a mis-click during a fight cannot take the
            panel down with it. */}
        <FieldError message={action.error ?? hp.error} />
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </div>
  )
}

type CharacterRowProps = {
  code: string
  dmCode: string
  character: PublicCharacter
  /** Null while the subscription is still loading. `HpControls` draws the gap. */
  vitals: PublicVitals | null
  onAdjust: (delta: number) => void
  actions?: React.ReactNode
}

function CharacterRow({ code, dmCode, character, vitals, onAdjust, actions }: CharacterRowProps) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{character.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {character.claimedByName !== null
              ? `${character.claimedByName} is playing this`
              : character.kind === 'npc'
                ? 'yours to run'
                : 'nobody is playing this yet'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CharacterSheetDrawer code={code} dmCode={dmCode} character={character} />
          {actions}
        </div>
      </div>
      <HpControls vitals={vitals} onAdjust={onAdjust} />
    </li>
  )
}

/**
 * One character's whole sheet, opened from its row.
 *
 * ⚠️ Both senses of the word meet here. `Sheet`, `SheetContent` and the rest are
 * shadcn's slide-out drawer; the *character* sheet is `CharacterSheetView` and
 * everything it renders. ui/sheet.tsx carries the full note.
 *
 * **A drawer rather than a section that unrolls inside the row, and the editor
 * settled it.** `CharacterSheetEditor` is written as the body and footer of a
 * fixed-height column: the fields claim `flex-1` and scroll within it, and Save sits
 * in a `SheetFooter` pinned to the bottom, because a Save button below the fold of a
 * long form is the failure that primitive exists to prevent. Inside a row of this
 * panel it would get neither half of that — the panel is itself a scrolling column
 * inside the overlay, so there is no height for the body to claim and no bottom for
 * the footer to stick to, and a full spell list would unroll inside a column too
 * narrow for six ability scores and their saves. The brief was to adapt the call site
 * rather than build a second editor, and handing it the container it was shaped for
 * is that adaptation.
 *
 * **From the left, which is the only edge free.** These tools already own the
 * right-hand side of the board, so a drawer on that edge would slide over the list
 * that opened it and over the Map tab beside it. From the left, the roster, the tab
 * strip and the middle of the map all stay on screen — which is the whole reason this
 * panel is over the board instead of back in the lobby, since a DM reaching for a
 * monster's stat block is doing it with the party standing on that monster. The
 * player's own sheet opens from the same edge, for the mirror-image reason.
 *
 * Nothing here is added to the pointer-events trap `MapSetupOverlay` documents. All
 * this puts inside the overlay's box is the button; the drawer is a Radix portal,
 * fixed to the viewport and mounted only while it is open, so it is never an
 * invisible rectangle lying over the canvas waiting to swallow a drag.
 *
 * One drawer per row, rather than one for the panel with the open character held in
 * state. Closed, a Radix dialog is its trigger and nothing more, so a party of six
 * and their monsters cost a button apiece — and it is what keeps the two
 * subscriptions inside `CharacterSheetView` from being held open for every character
 * nobody is looking at, which is the arrangement that component was written expecting
 * to be in.
 *
 * No `playerId`, for the reason the panel above gives: a seat id is routing rather
 * than proof of anything (ADR 0003), and it is the DM code that `characters.sheet`
 * re-checks before answering — through `requireEditableCharacter`, the same gate
 * `characters.updateSheet` writes through. Naming a seat here would add nothing but
 * the appearance of authority.
 */
function CharacterSheetDrawer({
  code,
  dmCode,
  character,
}: {
  code: string
  dmCode: string
  character: PublicCharacter
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Sheet
        </Button>
      </SheetTrigger>

      {/* Wider than the primitive's default, and the same width as the player's own
          panel: six abilities with a save column and a derived bonus beside each will
          not fold into a phone-width drawer, and this application is desktop-only by
          requirement. */}
      <SheetContent side="left" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{character.name}</SheetTitle>
          <SheetDescription>
            {character.kind === 'npc'
              ? 'A monster, so this stat block reaches no other screen. Changes are saved when you press Save; hit points save straight away.'
              : 'Changes are saved when you press Save; hit points save straight away.'}
          </SheetDescription>
        </SheetHeader>

        <CharacterSheetView
          code={code}
          characterId={character._id}
          playerId={null}
          dmCode={dmCode}
        />
      </SheetContent>
    </Sheet>
  )
}
