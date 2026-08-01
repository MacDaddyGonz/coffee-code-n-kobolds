import type { ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { HpControls } from '@/components/HpControls'
import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { CharacterSheetDrawer } from '@/components/sheet/CharacterSheetDrawer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useHpActions, useVitals } from '@/hooks/useVitals'
import { api } from '@convex/_generated/api'
import type { PublicCharacter, PublicVitals } from '@convex/lib/characters'

// A character as the DM's panels draw one: a name, who is playing it, its hit points and
// the way into its sheet — and, below, the wiring behind a whole list of them.
//
// **Extracted because there are two panels now, not because it was long.** The Sheets tab
// lists everyone at the table and the NPCs tab lists the creatures with the bestiary beside
// them, and a row drawn twice is a row where one copy quietly loses the health bar or grows
// a second idea of what "yours to run" means. The delete confirmation is here for a sharper
// version of the same reason: its wording promises something specific about what happens to
// a token standing on the character, and that promise is a property of the mutation rather
// than of whichever panel happened to offer it.
//
// `useDmCharacterRows` and `NpcCharacterSection` are that argument applied one level up,
// because the *section* became the thing drawn twice: both panels wired the same five
// hooks, filtered the same list the same way, built the same delete closure with the same
// pending key, and restated the same note about where a refusal lands. What genuinely
// differs between the two tabs is a heading and a paragraph of prose, and now that is all
// that does.

/**
 * Everything both DM panels need to draw a list of characters, wired once.
 *
 * Two subscriptions, deliberately separate. The roster changes when somebody is created or
 * claimed; the hit points change several times a round. Folding them together would
 * re-push the whole list on every point of damage, which is the split `characterVitals`
 * exists to make possible in the first place (CLAUDE.md invariant 2).
 *
 * No `playerId` anywhere in here. A seat id is a routing argument rather than proof of
 * anything (ADR 0003), and the DM code is what these mutations actually check — so sending
 * one would be decoration that looked like authority. Holding the code is likewise not what
 * authorises the list: `characters.list` returns monsters only when it is given a code it
 * verifies server-side, so a browser with an invented one gets the player characters and a
 * refusal from every write, which is exactly what it should get (invariant 7).
 */
export function useDmCharacterRows(code: string, dmCode: string) {
  const characters = useQuery(api.characters.list, { code, dmCode })
  const vitals = useVitals(code, dmCode)
  const hp = useHpActions({ code, dmCode, playerId: null })
  const removeCharacter = useMutation(api.characters.remove)
  const action = useLobbyAction()

  const remove = (character: PublicCharacter) =>
    action.run(`remove:${character._id}`, `Could not delete ${character.name}.`, () =>
      removeCharacter({ code, dmCode, characterId: character._id }),
    )

  return {
    /** Undefined until the roster arrives. `DmCharacterRowsSkeleton` draws the gap. */
    loading: characters === undefined,
    players: characters?.filter((character) => character.kind === 'pc') ?? [],
    npcs: characters?.filter((character) => character.kind === 'npc') ?? [],
    /**
     * Both failure channels, already merged. A refused delete comes through the shared
     * action hook and a refused `−5` through the hit-point hook, which *reports* rather
     * than throwing so that a mis-click during a fight cannot take the panel down with it.
     * One sentence at the bottom of the card is where each panel puts this.
     */
    error: action.error ?? hp.error,
    /** Everything a row needs, so neither panel restates it. */
    rowProps: (character: PublicCharacter) => ({
      code,
      dmCode,
      character,
      vitals: vitals.of(character._id),
      onAdjust: (delta: number) => void hp.adjust(character._id, delta),
    }),
    /** The same for the Delete beside it: `busy` is any call, `pending` is this one's. */
    deleteProps: (character: PublicCharacter) => ({
      character,
      busy: action.pending !== null,
      pending: action.pending === `remove:${character._id}`,
      onConfirm: () => remove(character),
    }),
  }
}

export type DmCharacterRows = ReturnType<typeof useDmCharacterRows>

/** The roster's loading state, the same two bars on both tabs. */
export function DmCharacterRowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

/**
 * The NPC list, with a Delete on every row — the section both DM tabs show.
 *
 * The two tabs word it differently on purpose and that is the only thing they pass in: the
 * Sheets tab's list answers "how is everybody doing" mid-fight, and the NPCs tab's answers
 * "what am I putting in front of them" before one, so the empty state points somewhere
 * different in each. The rows themselves must not differ, which is why they are not
 * written out twice any more.
 */
export function NpcCharacterSection({
  rows,
  title,
  empty,
}: {
  rows: DmCharacterRows
  title: string
  empty: string
}) {
  return (
    <CharacterSection title={title} empty={empty}>
      {rows.npcs.map((character) => (
        <CharacterRow
          key={character._id}
          {...rows.rowProps(character)}
          actions={<DeleteCharacterButton {...rows.deleteProps(character)} />}
        />
      ))}
    </CharacterSection>
  )
}

export type CharacterSectionProps = {
  title: string
  /** Shown instead of the list when there is nothing in it. */
  empty: string
  children: ReactNode[]
}

/** A headed group of rows, or a sentence saying why there are none. */
export function CharacterSection({ title, empty, children }: CharacterSectionProps) {
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

export type CharacterRowProps = {
  code: string
  dmCode: string
  character: PublicCharacter
  /** Null while the subscription is still loading. `HpControls` draws the gap. */
  vitals: PublicVitals | null
  onAdjust: (delta: number) => void
  /** Anything else that belongs beside the Sheet button — a Delete, typically. */
  actions?: ReactNode
}

// ⚠️ **There is deliberately no CR banner on a row, and it is a gap in the payload rather
// than a decision.** `characters.list` sends `publicCharacterValidator` — an id, a name, a
// kind and who has claimed it — and nothing about which bestiary entry a creature is reading
// or at what rating. The rating is on `characters.sheet`, which is one query per character
// and is subscribed to only while a drawer is open, so putting a badge here would mean either
// a subscription per row or a second copy of the rating maintained somewhere it can go stale.
// The banner lives on the sheet, one click away, until the list payload carries a summary.

export function CharacterRow({
  code,
  dmCode,
  character,
  vitals,
  onAdjust,
  actions,
}: CharacterRowProps) {
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
          <DmCharacterSheet code={code} dmCode={dmCode} character={character} />
          {actions}
        </div>
      </div>
      <HpControls vitals={vitals} onAdjust={onAdjust} />
    </li>
  )
}

/**
 * Deleting a character, behind a second click.
 *
 * The wording is here rather than at each call site because it makes a specific promise
 * about a token standing on the creature — that it is cut loose rather than deleted, keeps
 * its art and its square, and simply stops having a health bar. That is a property of
 * `characters.remove` and not of whichever panel offered the button, so two copies of it
 * would be two chances to describe the mutation wrongly.
 */
export function DeleteCharacterButton({
  character,
  busy,
  pending,
  onConfirm,
}: {
  character: PublicCharacter
  /** Any call in flight, which disables the trigger. */
  busy: boolean
  /** This character's own call in flight, which puts the dialog's button to work. */
  pending: boolean
  onConfirm: () => Promise<boolean> | void
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
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
      busy={pending}
      onConfirm={onConfirm}
    />
  )
}

/**
 * One character's whole sheet, opened from its row.
 *
 * ⚠️ Both senses of the word meet here. `Sheet`, `SheetContent` and the rest are shadcn's
 * slide-out drawer; the *character* sheet is `CharacterSheetView` and everything it
 * renders. ui/sheet.tsx carries the full note.
 *
 * **A drawer rather than a section that unrolls inside the row, and the editor settled
 * it.** `CharacterSheetEditor` is written as the body and footer of a fixed-height column:
 * the fields claim `flex-1` and scroll within it, and Save sits in an `EditorFooter` pinned to
 * the bottom, because a Save button below the fold of a long form is the failure that
 * arrangement exists to prevent. Inside a row of one of these panels it would get neither half
 * of that — the panel is itself a scrolling column inside the DM tools tab, so there is no
 * height for the body to claim and no bottom for the footer to stick to, and a spell list would
 * unroll inside a column too narrow for six ability scores and their saves. Adapting the call
 * site was preferred to building a second editor, and handing it the container it was shaped
 * for is that adaptation.
 *
 * **It opens from the left, and the map is why.** These lists live in the DM tools tab of the
 * right-hand panel, so a drawer on that edge would slide over the list that opened it. From the
 * left, that panel and the middle of the map both stay on screen — which is what a DM reaching
 * for a monster's stat block needs, since they are doing it with the party standing on that
 * monster and the map is the thing they must not lose sight of. The player's own sheet is not a
 * drawer at all: it is the Character tab in this same panel, which is already the fixed-height
 * column the editor wants, so this is the one place a sheet is still drawn over the board.
 *
 * One drawer per row, rather than one for the panel with the open character held in state.
 * Closed, a Radix dialog is its trigger and nothing more, so a party of six and their
 * monsters cost a button apiece — and it is what keeps the two subscriptions inside
 * `CharacterSheetView` from being held open for every character nobody is looking at, which
 * is the arrangement that component was written expecting to be in.
 *
 * No `playerId`: a seat id is routing rather than proof of anything (ADR 0003), and it is the
 * DM code that `characters.sheet` re-checks before answering — through `requireEditableCharacter`,
 * the same gate `characters.updateSheet` writes through. Naming a seat here would add nothing
 * but the appearance of authority.
 */
function DmCharacterSheet({
  code,
  dmCode,
  character,
}: {
  code: string
  dmCode: string
  character: PublicCharacter
}) {
  return (
    <CharacterSheetDrawer
      trigger={
        <Button type="button" size="sm" variant="outline">
          Sheet
        </Button>
      }
      title={character.name}
      description={
        character.kind === 'npc'
          ? 'A monster, so this stat block reaches no other screen. Changes are saved when you press Save; hit points save straight away.'
          : 'Changes are saved when you press Save; hit points save straight away.'
      }
      code={code}
      characterId={character._id}
      playerId={null}
      dmCode={dmCode}
    />
  )
}
