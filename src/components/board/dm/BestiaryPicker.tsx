import { useId, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { toast } from 'sonner'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { CrStepper } from '@/components/sheet/CreatureSheetView'
import { tagName } from '@/components/sheet/SheetFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PickerRow } from '@/components/ui/picker-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@convex/_generated/api'
import type { ChallengeRating, RoleKey, TagKey, TierNumber } from '@convex/lib/creatures'
import {
  CREATURE_ROLES,
  TIERS,
  crLabel,
  findRole,
  findTag,
  findTier,
} from '@convex/lib/creatures'

/**
 * One row of the index, taken from the query's own return type.
 *
 * ⚠️ Not restated here, and not imported from `lib/bestiary/` either — that module may never
 * be named by a specifier under `src/`, because the ~130 stat blocks behind it must not enter
 * the bundle and a list of creature names is itself a spoiler. The summaries arrive from a
 * DM-gated query, and this is how the browser knows their shape without knowing the corpus.
 */
type IndexRow = FunctionReturnType<typeof api.bestiary.index>[number]

/** What the picker settled on: which creature, and at what rating. */
export type CreatureChoice = {
  entryKey: string
  cr: ChallengeRating
  /** The bestiary's own name for it, which becomes the character's name. */
  name: string
}

export type BestiaryPickerProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
  /** The control that opens it, rendered `asChild`. Defaults to a plain outline button. */
  trigger?: ReactNode
  /**
   * **Absent means the picker adds the creature itself** — one `characters.create` and a
   * toast, which is what the NPCs panel wants.
   *
   * Present means it only *reports* the choice, which is what the token dialog wants: that
   * dialog already creates a character and then a token in two transactions, in that order,
   * because `board.addToken` takes a character id and so the character has to exist first.
   * Handing it a choice rather than a created character is what keeps that ordering intact —
   * a picker that created eagerly would leave a stray creature behind every time the DM
   * changed their mind about the token.
   */
  onPick?: (choice: CreatureChoice) => void
}

/**
 * The bestiary, filtered down to the one creature the DM wants, at the rating they want it.
 *
 * **Built to `SheetEntryPicker`'s recipe**, deliberately and down to the class strings: a
 * dialog, a strip of tabs, a search box and a scrolling column of `<button>` rows with
 * badges. That picker's header explains why one component serves feats, spells and NPC
 * actions; this is a second dialog rather than a fifth caller of it because what a *row*
 * means here is different — a creature is not a line on a sheet, it is a document to be
 * created — but the shape a DM's hands already know is the same, and there is no reason for
 * the two to look or behave unlike each other.
 *
 * **Filtering is client-side over about 130 rows, and that is the whole design.** The query
 * hands over every summary once; every chip below is then a predicate on an array rather
 * than a round trip, so a DM narrowing to Tier III and then changing their mind pays
 * nothing. Chips rather than selects for the same reason — filtering to a tier should be
 * one click, and a `<select>` is three.
 *
 * **Picking is two steps and the second one is the point.** A row *selects* a creature and
 * seeds the stepper with the entry's own rating; the button below adds it. That is what lets
 * a Troll go onto the board at CR 2 in one visit rather than being added at CR 5 and then
 * stepped down on its own sheet — and it is why the stepper cannot be a control at the top
 * of the dialog, since "the entry's own rating" is not a value until an entry is chosen.
 *
 * A row with no combat block says so, in the one badge here that is coloured. Picking an
 * innkeeper while expecting a statline is the obvious mistake this dialog can cause, and it
 * is not one a DM finds out about until the fight starts.
 */
export function BestiaryPicker({ code, dmCode, trigger, onPick }: BestiaryPickerProps) {
  const createCharacter = useMutation(api.characters.create)
  const action = useLobbyAction()

  // `useId` rather than fixed ids, for the reason `NpcSheetFields` gives: two of these can
  // be mounted at once — the NPCs panel is over the board while the token dialog is open on
  // top of it — and two labels pointing at one input is a label that focuses the wrong box.
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category>('all')
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState<TierNumber | null>(null)
  const [role, setRole] = useState<RoleKey | null>(null)
  const [tag, setTag] = useState<TagKey | null>(null)
  const [chosen, setChosen] = useState<{ entryKey: string; cr: ChallengeRating } | null>(null)

  // ⚠️ **Subscribed only while the dialog is open**, which is the pattern
  // `CharacterSheetDrawer` sets and `CreatureSheetView` follows for its comparison. The NPCs
  // tab renders this picker in a card header, so without the skip merely selecting that tab
  // fetches every summary on the shelf and builds a row element for each — about 130 of
  // both — for a dialog nobody has opened.
  const index = useQuery(api.bestiary.index, open ? { code, dmCode } : 'skip')

  /**
   * What the chips and the search box are narrowing, memoised.
   *
   * The `useMemo` is not about the cost of `?? []` — it is that a fresh array every render
   * is a fresh dependency every render, so the two memos below each had to suppress
   * `exhaustive-deps` and explain themselves. One line here removes both suppressions and
   * both explanations; the awkwardness was upstream of where it was being apologised for.
   */
  const rows = useMemo(() => index ?? [], [index])

  /** The chips and the search box, back to nothing. Shared with the Clear filters button. */
  function clearFilters() {
    setSearch('')
    setTier(null)
    setRole(null)
    setTag(null)
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      // Everything the filters own, plus the two things they do not: the tab and the
      // selection are state the dialog holds rather than filters, so closing clears them
      // here and the button below leaves them alone — pressing Clear filters should widen
      // the list, not put a DM back on the All tab and lose the creature they had picked.
      clearFilters()
      setCategory('all')
      setChosen(null)
      action.clearError()
    }
  }

  // Only the tags something in the corpus actually carries, which is both shorter and more
  // honest than all twenty-three: a chip that can only ever narrow the list to nothing is a
  // chip a DM presses once and distrusts afterwards. Ordered by `TAG_KEYS` by construction,
  // because that is the order the rows carry them in.
  const tags = useMemo(() => {
    const seen = new Set<TagKey>()
    for (const row of rows) for (const key of row.tags) seen.add(key)
    return [...seen]
  }, [rows])

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (category === 'all' || row.category === category) &&
        (tier === null || row.tier === tier) &&
        (role === null || row.role === role) &&
        (tag === null || row.tags.includes(tag)) &&
        // Name, creature type and blurb. A DM at the table remembers what a thing *is* —
        // "undead", "that thing in the swamp" — at least as reliably as what it is called,
        // which is the same argument `SheetEntryPicker` makes for searching descriptions.
        (needle === '' ||
          row.name.toLowerCase().includes(needle) ||
          row.creatureType.toLowerCase().includes(needle) ||
          row.blurb.toLowerCase().includes(needle)),
    )
  }, [rows, category, search, tier, role, tag])

  const filtered = tier !== null || role !== null || tag !== null || search.trim() !== ''
  const selected = chosen === null ? null : (rows.find((row) => row.key === chosen.entryKey) ?? null)
  const busy = action.pending !== null

  async function add() {
    if (chosen === null || selected === null) return

    if (onPick) {
      onPick({ entryKey: chosen.entryKey, cr: chosen.cr, name: selected.name })
      changeOpen(false)
      return
    }

    const done = await action.run(
      'create',
      'Could not add that creature.',
      () =>
        createCharacter({
          code,
          dmCode,
          // The bestiary's own name. The DM renames it on the sheet when tonight's owlbear
          // is called something — a name typed into this dialog would be a fourth thing to
          // fill in before the party finishes opening the door.
          name: selected.name,
          sheet: { kind: 'bestiary', entryKey: chosen.entryKey, cr: chosen.cr },
        }),
      { report: 'field' },
    )
    if (!done) return

    changeOpen(false)
    // The rating is named in the toast because it is the one thing about this that was a
    // decision rather than a lookup, and it is the thing a DM would want to catch having
    // got wrong before the party walks in.
    toast.success(
      `${selected.name} is yours to run at CR ${crLabel(chosen.cr)}. Nobody else can see the sheet.`,
    )
  }

  // One list, shown four ways. The tabs choose which slice of it is on screen, so the body
  // below is a single element mounted at whichever of the four is active — Radix renders
  // only that one — rather than four bodies that could drift apart.
  const body = (
    <div className="flex flex-col gap-3">
      <Label htmlFor={`${fieldId}-search`} className="sr-only">
        Search the bestiary
      </Label>
      <Input
        id={`${fieldId}-search`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name, type or description…"
        autoComplete="off"
      />

      <div className="flex flex-col gap-1.5">
        <ChipRow label="Difficulty">
          {TIERS.map((row) => (
            <Chip
              key={row.tier}
              on={tier === row.tier}
              onClick={() => setTier(tier === row.tier ? null : row.tier)}
            >
              {row.name}
              <span className="text-muted-foreground">{row.partyLevel}</span>
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label="Does what">
          {CREATURE_ROLES.map((row) => (
            <Chip
              key={row.key}
              on={role === row.key}
              title={row.blurb}
              onClick={() => setRole(role === row.key ? null : row.key)}
            >
              {row.name}
            </Chip>
          ))}
        </ChipRow>

        {tags.length > 0 ? (
          <ChipRow label="Tagged">
            {tags.map((key) => (
              <Chip
                key={key}
                on={tag === key}
                // The tag's sentence, matching the role chips beside it. It was the tag's
                // *name*, which is the chip's own visible label — a tooltip that repeats
                // what it is hovering over — while the twenty-three blurbs the vocabulary
                // carries were rendered by nothing at all. Both halves were dead, in
                // opposite directions.
                title={findTag(key)?.blurb}
                onClick={() => setTag(tag === key ? null : key)}
              >
                {tagName(key)}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {index === undefined
            ? 'Reading the shelf…'
            : `${matches.length} of ${rows.length} creatures`}
        </span>
        {filtered ? (
          <Button type="button" size="xs" variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* Scrolls inside itself, further than the sheet pickers do: this is a list of about
          130 rows with a sentence each, and a dialog that grew to fit them would take its
          own footer off the bottom of the screen. */}
      <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
        {index === undefined ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : matches.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nothing on the shelf matches that. Clear a filter, or build one by hand instead.
          </p>
        ) : (
          matches.map((row) => (
            <CreatureRow
              key={row.key}
              row={row}
              on={chosen?.entryKey === row.key}
              onSelect={() => setChosen({ entryKey: row.key, cr: row.cr })}
            />
          ))
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="outline">
            From the bestiary
          </Button>
        )}
      </DialogTrigger>

      {/* Capped and scrollable as well as having a scrolling list inside it, because the
          chrome around that list is not small — a search box, three rows of chips, a count
          and the footer — and `DialogContent` is positioned from the centre with no maximum
          height of its own. On a short window the two together would put the Add button
          below the bottom of the screen, which is the one failure a dialog must not have. */}
      <DialogContent className="max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take a creature off the shelf</DialogTitle>
          <DialogDescription>
            Everything here is yours alone — the server refuses this list to anybody without
            the DM code, because knowing there is a dragon is most of what a dragon was for.
            Pick one, set the rating it should run at, and every number scales to match.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={category} onValueChange={(next) => setCategory(next as Category)}>
          <TabsList className="w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="monster">Monsters</TabsTrigger>
            <TabsTrigger value="enemy">Enemies</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
          </TabsList>

          {CATEGORIES.map((value) => (
            <TabsContent key={value} value={value}>
              {body}
            </TabsContent>
          ))}
        </Tabs>

        <FieldError message={action.error} />

        {selected === null ? (
          <p className="text-muted-foreground text-xs">
            Choose a creature above and its own rating comes with it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{selected.name}</span>
              <span className="text-muted-foreground text-xs">
                {chosen !== null && chosen.cr !== selected.cr
                  ? `Scaled from the bestiary’s CR ${crLabel(selected.cr)}.`
                  : 'At the rating the bestiary gives it.'}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* The creature sheet's own stepper, which carries the note about why the
                  clamp asks `stepCr` where a step would land rather than comparing bounds.
                  This had a second copy of all of it, down to the two `aria-label`s, and
                  only the sheet's carried the reasoning. Always `isDm`: without the code
                  there is no shelf to be looking at. */}
              <CrStepper
                cr={chosen?.cr ?? null}
                isDm
                busy={busy}
                onSetCr={(cr) => setChosen((was) => (was === null ? was : { ...was, cr }))}
              />

              <Button type="button" size="sm" disabled={busy} onClick={() => void add()}>
                {onPick ? 'Use this one' : busy ? 'Adding…' : 'Add to the game'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The four tabs, and the union the tab value is narrowed back to.
 *
 * `all` is not a category on a row — it is the absence of the filter — which is why this is
 * spelled out here rather than taken from the server's `BestiaryCategory`. The other three
 * are compared against `row.category` and would fail the typecheck if they drifted.
 */
const CATEGORIES = ['all', 'monster', 'enemy', 'social'] as const
type Category = (typeof CATEGORIES)[number]

/** A labelled row of filter chips, wrapping. */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground w-16 shrink-0 text-xs font-medium">{label}</span>
      {children}
    </div>
  )
}

/**
 * One filter, on or off.
 *
 * A `Button` rather than a `Badge`, because it is pressed: `aria-pressed` is what tells a
 * screen reader that this is a toggle and not a link to somewhere, and the button's own
 * focus ring is the only reason this row is usable from the keyboard at all.
 */
function Chip({
  on,
  title,
  children,
  onClick,
}: {
  on: boolean
  title?: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={on ? 'default' : 'outline'}
      aria-pressed={on}
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * One creature, as a row somebody scanning at speed can read.
 *
 * The badges are in the order a DM asks the questions in: how hard is it, what party is it
 * for, what does it do in a fight, what *is* it. The blurb underneath is the sentence the
 * corpus wrote for exactly this moment.
 *
 * **The social-only badge is the one coloured thing on the row**, and that is deliberate.
 * Picking an innkeeper because the name sounded dangerous is the mistake this dialog is most
 * likely to cause, and it is not a mistake anybody notices until the fight starts and there
 * is no stat block. Everything else here is a label; this one is a warning.
 */
function CreatureRow({
  row,
  on,
  onSelect,
}: {
  row: IndexRow
  on: boolean
  onSelect: () => void
}) {
  const role = findRole(row.role)
  // Both off the tier's own row. The bare numeral is the fallback for the reason `findTier`
  // tolerates an unknown tier at all: the number is stored on every entry, so a table
  // retired from `TIERS` has to leave everything that named it readable. "Levels 2–3" is
  // beside "Tier III" because the numeral means nothing to somebody who has not read the
  // difficulty table, and the party level is the whole of what they wanted to know.
  const tier = findTier(row.tier)

  return (
    <PickerRow selected={on} onClick={onSelect}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{row.name}</span>
        <Badge variant="secondary" className="tabular-nums">
          CR {crLabel(row.cr)}
        </Badge>
        <Badge variant="outline">{tier?.name ?? `Tier ${row.tier}`}</Badge>
        {tier ? <Badge variant="ghost">{tier.partyLevel}</Badge> : null}
        {role ? <Badge variant="outline">{role.name}</Badge> : null}
        <Badge variant="ghost">{row.creatureType}</Badge>
        {row.hasCombat ? null : <Badge variant="destructive">no stat block</Badge>}
      </span>
      <span className="text-muted-foreground text-xs">{row.blurb}</span>
    </PickerRow>
  )
}
