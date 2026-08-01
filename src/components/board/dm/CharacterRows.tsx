import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Dices, Eye, EyeOff } from 'lucide-react'

import { HpControls } from '@/components/HpControls'
import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRollControls } from '@/hooks/useRoll'
import { useHpActions, useVitals } from '@/hooks/useVitals'
import { cn } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicCharacter, PublicVitals } from '@convex/lib/characters'
import type { CharacterGroup } from '@convex/lib/sheet'
import { CHARACTER_GROUPS } from '@convex/lib/sheet'

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

export type CharactersByGroup = {
  /** True until the roster arrives. `DmCharacterRowsSkeleton` draws the gap. */
  loading: boolean
  /** Every character in the game, filed under the heading the server chose. */
  byGroup: Record<CharacterGroup, PublicCharacter[]>
  /**
   * The same characters by id, for the callers that are joining a name onto something
   * else — a coin's caption, or the creature a coin is bound to.
   *
   * Built here rather than at each of them because it is one `Map` over one payload, and
   * two of them is two things to keep memoised on the same array.
   */
  byId: Map<Id<'characters'>, PublicCharacter>
}

/**
 * The DM's roster, read once and filed two ways. **One subscription and no hit points.**
 *
 * ⚠️ **Split out of `useDmCharacterRows` because the Tokens tab needs the filing and not
 * the writing**, and taking the whole hook for it meant taking a `characters.vitals`
 * subscription with it: every point of damage anywhere in the game re-rendered up to two
 * hundred coin rows and the whole token editor to produce byte-identical output. During a
 * fight with the DM parked on that tab it is a handful of full reconciliations a round for
 * nothing. `useDmCharacterRows` consumes this, so the bucketing below is still written
 * exactly once.
 *
 * ⚠️ **The groups come from `group` and not from `kind`, and the two fields are not
 * interchangeable.** `kind` answers *may this caller know the character exists* — it is
 * the secrecy discriminator, resolved from `isMonsterSheet`, and it has two values where
 * the DM's headings have three. `group` answers *which heading is this printed under*,
 * and the server resolves it: placing a bestiary-linked creature means reading the corpus
 * category of the entry it points at, and the corpus is not in the bundle (invariant 8).
 * So the client sorts on a field it was handed and computes nothing.
 *
 * ⚠️ **`byGroup` is a record keyed on the union rather than three named arrays**, which is
 * the arrangement CLAUDE.md invariant 9 argues for one type over: three `filter` calls is
 * the formulation where a fourth group leaves a character stored, counted and invisible,
 * with no heading to find it under. Building the buckets from `CHARACTER_GROUPS` means the
 * selector renders whatever the union says exists, and a fourth member is a missing label
 * the compiler asks about rather than a row nobody can see.
 *
 * `{ code, dmCode }` exactly, so every caller shares one cache entry — one socket, one
 * server-side execution — which is the arrangement `Roster` documents for `players.list`.
 * Holding the code is not what authorises the list either: `characters.list` returns
 * creatures only when it is given a code it verifies server-side, so a browser with an
 * invented one gets the player characters and a refusal from every write (invariant 7).
 */
export function useCharactersByGroup(code: string, dmCode: string): CharactersByGroup {
  const characters = useQuery(api.characters.list, { code, dmCode })

  const byGroup = useMemo(() => {
    const buckets = Object.fromEntries(
      CHARACTER_GROUPS.map((group) => [group, [] as PublicCharacter[]]),
    ) as Record<CharacterGroup, PublicCharacter[]>
    // Creation order within each heading, because that is the order the list arrives in
    // and the order the DM built the encounter in.
    for (const character of characters ?? []) buckets[character.group].push(character)
    return buckets
  }, [characters])

  const byId = useMemo(() => {
    const map = new Map<Id<'characters'>, PublicCharacter>()
    for (const character of characters ?? []) map.set(character._id, character)
    return map
  }, [characters])

  return { loading: characters === undefined, byGroup, byId }
}

/**
 * Everything the DM's sheet list needs, wired once: the roster above, plus the writes a row
 * offers — a `−5`, a delete, an eye and a die — and the hit points it prints.
 *
 * Two subscriptions, deliberately separate. The roster changes when somebody is created or
 * claimed; the hit points change several times a round. Folding them together would
 * re-push the whole list on every point of damage, which is the split `characterVitals`
 * exists to make possible in the first place (CLAUDE.md invariant 2).
 *
 * ⚠️ **Take this only if you are drawing hit points or offering one of the writes.** The
 * `characters.vitals` subscription is the expensive half and a caller that reads
 * `byGroup` alone pays for it in re-renders — `useCharactersByGroup` is that caller's hook.
 *
 * No `playerId` anywhere in here. A seat id is a routing argument rather than proof of
 * anything (ADR 0003), and the DM code is what these mutations actually check — so sending
 * one would be decoration that looked like authority. It is left off the vitals
 * subscription for the same reason and one more: `playerId` there decides whether a
 * *granted* creature's numbers arrive exactly, and the DM is already sent every number in
 * the game.
 *
 * ⚠️ **And passing it would no longer split the cache even if somebody did**, which is
 * worth knowing before "tidying" the `null` away or adding a seat back. `vitalsArgs`
 * drops the seat whenever a DM code is present, so this list, `useBoard`'s health bars
 * and the DM's own `CharacterSheetView` all read one entry — and, crucially, `hp.adjust`
 * below patches that same one. They used not to: the board passed its seat and this hook
 * did not, so a `−5` typed here moved the row instantly and left the coin on the map
 * waiting for the round trip.
 *
 * Holding the code is likewise not what authorises the list: `characters.list`
 * returns creatures only when it is given a code it verifies server-side, so a browser
 * with an invented one gets the player characters and a refusal from every write, which is
 * exactly what it should get (invariant 7).
 */
export function useDmCharacterRows(code: string, dmCode: string) {
  const roster = useCharactersByGroup(code, dmCode)
  const vitals = useVitals(code, dmCode, null)
  const hp = useHpActions({ code, dmCode, playerId: null })
  const removeCharacter = useMutation(api.characters.remove)
  const setReserved = useMutation(api.characters.setReserved)
  const action = useLobbyAction()

  /**
   * The dice, which are the one write here this hook does not wire itself. `RollProvider`
   * in `RightPane` holds the code, the seat, the mode and the private toggle, so there is
   * no mutation to call for and nothing to re-verify — what the bundle below adds is the
   * *request*, so no call site restates `{ kind: 'initiative' }`.
   *
   * ⚠️ **Read once here rather than in each button**, so a two-hundred-row selector holds
   * one context subscription instead of two hundred. The only thing taken off it is `roll`,
   * whose identity is stable for as long as the mode and the private toggle are — so
   * changing either re-renders this hook's caller once, and pressing a die re-renders
   * nothing at all. That last part is the point: see `initiativeProps` below for why the
   * button deliberately does **not** read `pending`, and why a die that greyed itself out
   * mid-encounter would have spent the whole feature it exists to provide.
   *
   * A refused roll is **not** merged into `error` below, and that is `useRoll.ts`'s decision
   * rather than an omission: it toasts, because the row a failed roll would have appeared on
   * does not exist and there is nothing on screen to hang a message under.
   */
  const rolls = useRollControls()

  const remove = (character: PublicCharacter) =>
    action.run(`remove:${character._id}`, `Could not delete ${character.name}.`, () =>
      removeCharacter({ code, dmCode, characterId: character._id }),
    )

  // Reported as a toast rather than into the card's error line, which is the split
  // `ActionReport` describes: this control acts the instant it is pressed and leaves no
  // form on screen for a message to sit under. The two refusals the server can give —
  // a creature, and a character a seat is already holding — are both sentences telling
  // the DM what to do instead, so they are worth reading whole.
  const reserve = (character: PublicCharacter, reserved: boolean) =>
    action.run(
      `reserve:${character._id}`,
      `Could not change who can see ${character.name}.`,
      () => setReserved({ code, dmCode, characterId: character._id, reserved }),
    )

  return {
    // `loading`, `byGroup` and `byId` handed straight on rather than re-derived: this hook
    // adds the writes and the hit points and nothing about how the list is filed.
    ...roster,
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
    /** And for the eye that takes a character off every player's list. */
    reserveProps: (character: PublicCharacter) => ({
      character,
      busy: action.pending !== null,
      pending: action.pending === `reserve:${character._id}`,
      onSet: (reserved: boolean) => reserve(character, reserved),
    }),
    /**
     * And for the die. **No `busy`/`pending` pair, unlike the two above — and no `pending`
     * at all, which is the correction rather than an omission.**
     *
     * ⚠️ **A die that disables while a roll is in flight defeats the only thing this control
     * is for.** The feature is *"rolling initiative for six goblins is six clicks in one
     * list"*, and `rolls.pending` is the panel's count of every roll in flight — so the
     * first click would grey out all six buttons until the round trip returned, and clicks
     * two through six would land on disabled buttons and be silently dropped. A DM going
     * down a list at the speed of a list is precisely the case, not an edge one.
     *
     * There is nothing to protect against either, which is what makes this safe rather than
     * merely nicer. A second roll is a second feed line and both are wanted; the mutation is
     * one transaction per click; and the two guards that matter are elsewhere — the *delete*
     * beside it disables because deleting twice is a refusal, and `Reserve` because it is a
     * toggle whose second press undoes the first. A die is neither. The other two bundles
     * keep their flags for exactly those reasons.
     */
    initiativeProps: (character: PublicCharacter) => ({
      character,
      onRoll: () => rolls.roll(character._id, { kind: 'initiative' }),
    }),
  }
}

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
  /**
   * Anything that belongs beside the name — a die and a Delete, typically. Rendered in a
   * flex row of its own, so several controls sit on the name's line rather than growing the
   * row by one line each; the ⚠️ below is why they must be *beside* the name button and not
   * inside it.
   */
  actions?: ReactNode
  /**
   * Whether this row is the one the whole shell is currently talking about. Drawn as
   * the row's own selected state *and* announced with `aria-pressed`, for the reason
   * `PickerRow` gives: a row that looks picked and does not say so is a row a screen
   * reader reads as an ordinary button.
   */
  selected?: boolean
  /** Absent leaves the row inert, which is what a list nobody is selecting from wants. */
  onSelect?: () => void
}

// ⚠️ **There is deliberately no CR banner on a row, and it is a gap in the payload rather
// than a decision.** `characters.list` sends `publicCharacterValidator` — an id, a name, a
// kind, a group and who has claimed it — and nothing about which bestiary entry a creature
// is reading or at what rating. The rating is on `characters.sheet`, which is one query per
// character and is subscribed to only for the sheet on screen, so putting a badge here
// would mean either a subscription per row or a second copy of the rating maintained
// somewhere it can go stale. The banner lives on the sheet, one click away, until the list
// payload carries a summary.

/**
 * One character, selectable.
 *
 * ⚠️ **The name is a button and the row is not**, which is the whole of the markup
 * decision here. A row carrying `HpControls` already has two buttons and a text input
 * inside it, and a `<button>` wrapped around all of that is invalid HTML that browsers
 * resolve by unnesting it — so the `−` would land outside the control the DM thinks they
 * pressed. Making the name line the button keeps one clickable thing per gesture and
 * leaves the hit-point controls able to be used without changing what is on screen
 * beside them.
 */
export function CharacterRow({
  character,
  vitals,
  onAdjust,
  actions,
  selected,
  onSelect,
}: CharacterRowProps) {
  // The caption is the same either way, so it is written once and placed by whichever
  // of the two branches below renders it.
  const caption =
    character.claimedByName !== null
      ? `${character.claimedByName} is playing this`
      : // The *group* and not the kind, because this is a caption and not a
        // permission. Both spellings would answer the same today; the one that
        // says "this is a creature the DM runs" is the one whose meaning does not
        // depend on remembering that `kind: 'npc'` covers monsters too.
        character.group !== 'character'
        ? 'yours to run — no player sees it'
        : 'nobody is playing this yet'

  const name = (
    <>
      <p className="truncate font-medium">{character.name}</p>
      <p className="text-muted-foreground truncate text-xs">{caption}</p>
    </>
  )

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-2 transition-colors',
        selected && 'border-primary bg-muted',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {onSelect ? (
          <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            // Negative margin and matching padding, so the focus ring and the hover
            // wash reach the edges of the space the text already occupied rather than
            // drawing a smaller box inside the row.
            className="focus-visible:ring-ring/50 hover:bg-muted/60 -m-1 min-w-0 flex-1 rounded-md p-1 text-left focus-visible:ring-3 focus-visible:outline-none"
          >
            {name}
          </button>
        ) : (
          <div className="min-w-0">{name}</div>
        )}
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <HpControls vitals={vitals} onAdjust={onAdjust} />
    </li>
  )
}

/**
 * Rolling initiative from the list, without opening the sheet.
 *
 * **This is the one control here that exists because of where it is.** Everything else on a
 * row is also on the sheet a click away; initiative is the roll a DM makes for *every*
 * creature at once, and on the sheets that is six selections, six panels and six scrolls to
 * find the same button six times. Beside the name it is six clicks in one list, with the
 * panel below never changing.
 *
 * ⚠️ **It cannot show the modifier it is about to roll, and must not pretend to.**
 * `publicCharacterValidator` carries an id, a name, a kind, a group, who has claimed it and
 * whether it is reserved — there is no initiative bonus in a row payload, and putting one
 * there means a `characters.sheet` subscription per row, which is the objection the CR
 * banner note above already records. The number is resolved server-side by
 * `initiativeBonusOf`, so this button says *what* is being rolled and never what it comes
 * to; the answer arrives in the feed like everybody else's.
 *
 * ⚠️ **One path serves a hero and a monster, and a reader expecting two will go looking for
 * the missing one.** `feed.roll`'s `initiative` arm asks `initiativeBonusOf`, which answers
 * `abilityModifier(dex)` for a `pc` sheet and the stored `initiativeBonus` for a creature —
 * a reduced sheet has no Dexterity to consult. So nothing here branches on
 * `character.group`, and nothing should: this is the same button in all three sections, and
 * that is a property of the server's arithmetic rather than a simplification made here.
 *
 * **Offered on a reserved row too, deliberately.** Hiding a character from the players does
 * not hide it from the DM, and a creature built for somebody who has not arrived is exactly
 * the sort of thing whose initiative gets rolled with everybody else's;
 * `readableCharacterIds` keeps the resulting line out of the players' feed without this
 * control having to know it does.
 */
export function RollInitiativeButton({
  character,
  onRoll,
}: {
  character: PublicCharacter
  onRoll: () => void
}) {
  // Names the character, because six dice in a list are six identical buttons to a screen
  // reader, and "Roll initiative" repeated six times is a list nobody can navigate. Reused
  // as the first half of the tooltip so the two cannot come to disagree.
  const label = `Roll initiative for ${character.name}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          onClick={(event) => {
            // ⚠️ **Stopped deliberately, and it is a guard rather than a fix.** This is the
            // class of bug the board settled last milestone — clicking a token selects it
            // and does not open the hit-point editor, clicking its health bar opens the
            // editor and does not move the token — and the row has the same two gestures:
            // pressing the name selects the character and swaps the sheet below, pressing
            // the die rolls without disturbing what the DM is looking at. Today the name is
            // a *sibling* button and the `<li>` carries no handler, so nothing would bubble
            // into either; the day the row itself becomes the click target — the obvious
            // next request for a list of sheets — an unguarded die would roll *and* pull the
            // panel onto a different creature, which is precisely the wrong moment to
            // discover that.
            event.stopPropagation()
            onRoll()
          }}
        >
          {/* Two dice rather than `Dice6`: at fourteen pixels a single pipped square reads
              as a rounded box with specks in it, and the plural silhouette is legible at the
              size an icon button actually draws it. It is not claiming two dice are thrown —
              the accessible name and the feed line both say initiative, and `aria-hidden`
              means the picture is never read out. */}
          <Dices aria-hidden />
        </Button>
      </TooltipTrigger>
      {/* The sentence rather than the label alone, on `ReserveCharacterButton`'s reasoning:
          the label is what the icon already says, and what a DM cannot see is where the
          number comes from — the row does not print it, so the tooltip says whose bonus is
          being added. */}
      <TooltipContent>
        {label} — a d20 and its own bonus, straight to the feed.
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Taking a character off every player's list, and putting it back.
 *
 * **Reserved means hidden, not greyed out**, and the copy has to say so: a disabled row
 * still publishes a name, and the name is the spoiler. The server drops a reserved
 * character out of `characters.list` for a player entirely, and out of `players.list`'s
 * roster line with it. The use case that decides the design is a character built for
 * somebody who has not arrived yet.
 *
 * ⚠️ **It reads `character.reserved` off the payload and holds no state of its own**, and
 * that is worth naming because the first version could not. The field was stored,
 * enforced and tested server-side but never projected, so a freshly-loaded panel did not
 * know which of the DM's characters were hidden and the control had to be drawn as a
 * *command* — an icon saying what pressing it would do, flipping only after a confirmed
 * write, and lying to the next browser to load. For a flag whose entire purpose is
 * "somebody must not see this", the state is the one thing the DM needs to read off the
 * screen, so `publicCharacterValidator` carries it. It is `false` in every player payload
 * by construction — a reserved row was dropped before it could be projected — so it
 * publishes nothing and invariant 8 has no objection.
 */
export function ReserveCharacterButton({
  character,
  busy,
  pending,
  onSet,
}: {
  character: PublicCharacter
  /** Any call in flight, which disables the control. */
  busy: boolean
  /** This character's own call in flight. */
  pending: boolean
  /** Resolves true once the server has accepted it. */
  onSet: (reserved: boolean) => Promise<boolean>
}) {
  const hidden = character.reserved

  const label = hidden
    ? `Show ${character.name} to players again`
    : `Hide ${character.name} from players entirely`

  return (
    <Button
      type="button"
      size="icon-sm"
      variant={hidden ? 'secondary' : 'ghost'}
      disabled={busy}
      aria-label={label}
      // The sentence rather than the label, because the label is what the icon already
      // says and the sentence is the thing a DM would otherwise have to find out by
      // trying it on the night the new player turns up.
      title={
        hidden
          ? `${character.name} is hidden: no player's list or roster names it. Show it to put it back.`
          : `Hides ${character.name} from every player — absent from their list, not greyed out. Unassign it first if somebody is playing it.`
      }
      onClick={() => void onSet(!hidden)}
    >
      {/* An open eye means hidden-press-to-show and a struck-through one means
          visible-press-to-hide, both read off the server's own answer. There is
          deliberately no optimistic flip: the subscription re-pushes the row within a
          round trip, and a control that showed the wrong state for a refused write is
          the failure this control exists to avoid. `pending` only softens the icon —
          `busy` above is what stops a second press, and a spinner for a call that
          resolves in a frame is a flicker rather than feedback. */}
      {hidden ? (
        <Eye className={pending ? 'opacity-50' : undefined} />
      ) : (
        <EyeOff className={pending ? 'opacity-50' : undefined} />
      )}
    </Button>
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
