import { FieldError } from '@/components/FieldError'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { BestiaryPicker } from './BestiaryPicker'
import {
  DmCharacterRowsSkeleton,
  NpcCharacterSection,
  useDmCharacterRows,
} from './CharacterRows'
import { NpcCreateDialog } from './NpcCreateDialog'

export type DmNpcPanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
  /** So the board can position this without this file knowing where. */
  className?: string
}

/**
 * The creatures in this game, and the two ways to add another.
 *
 * **Both routes in one place, which is the whole reason this tab exists apart from the
 * Sheets tab.** A DM populating an encounter is choosing between two quite different acts —
 * take something off the shelf at the rating that suits the party, or type three numbers for
 * a thing that only needs to be hittable — and until now only the second was offered
 * anywhere. Putting the bestiary beside the hand-built dialog is what makes the choice
 * visible; hiding the shelf behind a tab labelled "sheets" would have left half the DMs at
 * the table never finding it.
 *
 * The list overlaps the Sheets tab on purpose and its own header says why: that tab answers
 * "how is everybody doing", which is the mid-fight question, and this one answers "what am I
 * putting in front of them", which is the question before one.
 *
 * Nothing here is a permission being applied. `characters.list` returns monsters only when it
 * is given a DM code it verifies, and `bestiary.index` refuses the shelf outright without one
 * — a list of creature names is itself a spoiler, because a party who knows there is a dragon
 * has had the dragon spoiled whether or not they can read its armour class. This panel being
 * on screen is a consequence of holding the code rather than a substitute for it (CLAUDE.md
 * invariant 7).
 *
 * The list itself is `useDmCharacterRows` and `NpcCharacterSection`, shared with the Sheets
 * tab, so the two tabs differ in their heading and their prose and in nothing else.
 */
export function DmNpcPanel({ code, dmCode, className }: DmNpcPanelProps) {
  const rows = useDmCharacterRows(code, dmCode)

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle>NPCs and monsters</CardTitle>
        <CardDescription>
          Everything you are running, and the shelf to take more off. None of it reaches another
          screen — not the stat blocks, and not the names.
        </CardDescription>
        {/* Both routes to a creature, side by side, which is the point of the tab. The shelf
            comes first because for most encounters it is the whole answer, and the
            hand-built dialog is the escape hatch — the same order `CharacterSheetEditor`
            puts the character builder and the blank sheet in, for the same reason. */}
        <CardAction className="flex flex-wrap items-center gap-2">
          <BestiaryPicker code={code} dmCode={dmCode} />
          <NpcCreateDialog code={code} dmCode={dmCode} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rows.loading ? (
          <DmCharacterRowsSkeleton />
        ) : (
          <NpcCharacterSection
            rows={rows}
            title="In this game"
            // What the panel is *for*, said where a DM who has just opened it is looking.
            // "Nothing here yet" would be true and useless.
            empty="Nothing yet. Take a creature off the bestiary shelf above — pick a difficulty tier and a role, and every number scales to the rating you choose — or build one by hand for something that only needs to be hittable."
          />
        )}

        <Separator />

        {/* The difference between the two buttons above, said once. It is not obvious from
            their labels and it is the thing a DM needs to know before choosing: the link is
            what makes the rating a control rather than a number somebody typed. */}
        <p className="text-muted-foreground text-xs">
          A creature off the shelf keeps its link to the bestiary — its rating is a control on
          its own sheet, and stepping it rescales every number at once. One built by hand is
          three numbers you own outright.
        </p>

        {/* Already merged by the hook, which carries the note about why a refused `−5`
            reports rather than throwing. The picker reports its own, inside the dialog that
            is still open on top of this one. */}
        <FieldError message={rows.error} />
      </CardContent>
    </Card>
  )
}
