import type { ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { HpControls } from '@/components/HpControls'
import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useHpActions, useVitals } from '@/hooks/useVitals'
import { api } from '@convex/_generated/api'
import type { PublicCharacter, PublicVitals } from '@convex/lib/characters'

// A character as the DM's sheet selector draws one: a name, who is playing it, its hit
// points and whatever belongs beside them — and, above, the wiring behind a whole list of
// them.
//
// **Extracted when there were two panels drawing the same list, and kept now there is
// one.** The delete confirmation is the sharpest reason: its wording promises something
// specific about what happens to a token standing on the character, and that promise is a
// property of the mutation rather than of whichever panel happened to offer the button.
// The subscriptions are the same argument — two of them, deliberately split, with the
// reasoning on the hook.
//
// `NpcCharacterSection` used to live here, and it went with the two panels rather than
// being renamed. It existed to stop one *section* being written out twice, hard-wiring the
// creature list and a Delete on every row; with three groups to draw and one caller
// drawing all of them, a component that names one group is a component the other two
// cannot use. `CharacterSection` plus a `map` is the same output with nothing hard-wired,
// and it is what the selector composes.

/**
 * Everything the DM's sheet list needs, wired once.
 *
 * Two subscriptions, deliberately separate. The roster changes when somebody is created or
 * claimed; the hit points change several times a round. Folding them together would
 * re-push the whole list on every point of damage, which is the split `characterVitals`
 * exists to make possible in the first place (CLAUDE.md invariant 2).
 *
 * ⚠️ **The three groups come from `group` and not from `kind`, and the two fields are not
 * interchangeable.** `kind` answers *may this caller know the character exists* — it is
 * the secrecy discriminator, resolved from `isMonsterSheet`, and it has two values where
 * the DM's headings have three. `group` answers *which heading is this printed under*,
 * and the server resolves it: placing a bestiary-linked creature means reading the corpus
 * category of the entry it points at, and the corpus is not in the bundle (invariant 8).
 * So the client sorts on a field it was handed and computes nothing.
 *
 * No `playerId` anywhere in here. A seat id is a routing argument rather than proof of
 * anything (ADR 0003), and the DM code is what these mutations actually check — so sending
 * one would be decoration that looked like authority. Holding the code is likewise not what
 * authorises the list: `characters.list` returns creatures only when it is given a code it
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
    characters: characters?.filter((character) => character.group === 'character') ?? [],
    npcs: characters?.filter((character) => character.group === 'npc') ?? [],
    monsters: characters?.filter((character) => character.group === 'monster') ?? [],
    /**
     * Both failure channels, already merged. A refused delete comes through the shared
     * action hook and a refused `−5` through the hit-point hook, which *reports* rather
     * than throwing so that a mis-click during a fight cannot take the panel down with it.
     * One sentence at the bottom of the card is where the panel puts this.
     */
    error: action.error ?? hp.error,
    /** Everything a row needs, so no caller restates it. */
    rowProps: (character: PublicCharacter) => ({
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

/** The roster's loading state. */
export function DmCharacterRowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
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
  character: PublicCharacter
  /** Null while the subscription is still loading. `HpControls` draws the gap. */
  vitals: PublicVitals | null
  onAdjust: (delta: number) => void
  /** Anything that belongs beside the name — a Delete, typically. */
  actions?: ReactNode
}

// ⚠️ **There is deliberately no CR banner on a row, and it is a gap in the payload rather
// than a decision.** `characters.list` sends `publicCharacterValidator` — an id, a name, a
// kind, a group and who has claimed it — and nothing about which bestiary entry a creature
// is reading or at what rating. The rating is on `characters.sheet`, which is one query per
// character and is subscribed to only for the sheet on screen, so putting a badge here
// would mean either a subscription per row or a second copy of the rating maintained
// somewhere it can go stale. The banner lives on the sheet, one click away, until the list
// payload carries a summary.

export function CharacterRow({ character, vitals, onAdjust, actions }: CharacterRowProps) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{character.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {character.claimedByName !== null
              ? `${character.claimedByName} is playing this`
              : // The *group* and not the kind, because this is a caption and not a
                // permission. Both spellings would answer the same today; the one that
                // says "this is a creature the DM runs" is the one whose meaning does not
                // depend on remembering that `kind: 'npc'` covers monsters too.
                character.group !== 'character'
                ? 'yours to run — no player sees it'
                : 'nobody is playing this yet'}
          </p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
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
