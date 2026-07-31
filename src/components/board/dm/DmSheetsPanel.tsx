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
import {
  CharacterRow,
  CharacterSection,
  DmCharacterRowsSkeleton,
  NpcCharacterSection,
  useDmCharacterRows,
} from './CharacterRows'
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
 * numeric field in it at all. So `HpControls` inside each row is handed whichever of the
 * two turned up and formats it; there is nothing hidden behind the bar for a client to
 * reveal, which is the difference between CLAUDE.md invariant 1 being kept and being
 * claimed.
 *
 * NPCs appear in this list for the same reason and by the same means: `characters.
 * list` only returns them when it is given a DM code that verifies. Rendering this
 * panel on the strength of holding one authorises nothing (invariant 7) — a browser
 * with a stale or invented code gets a list of player characters and refusals on
 * every write, which is exactly what it should get.
 *
 * **This is the whole table, and `DmNpcPanel` is the creatures.** The two lists overlap on
 * purpose rather than by accident: this one answers "who is in this game and how is
 * everybody doing", which is the question during a fight, and the NPCs tab answers "what am
 * I putting in front of them", which is the question before one. The monsters appear in both
 * because a DM adjusting a goblin's hit points mid-round should not have to work out which
 * tab a goblin lives on. The NPC half of it is literally the same section, from
 * `NpcCharacterSection`, so the two cannot drift; what this tab adds is the heroes above it.
 *
 * The subscriptions, the filters and the delete are all `useDmCharacterRows`, which carries
 * the notes about why there are two of them and why no seat id appears in any of it.
 */
export function DmSheetsPanel({ code, dmCode, className }: DmSheetsPanelProps) {
  const rows = useDmCharacterRows(code, dmCode)

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
        {rows.loading ? (
          <DmCharacterRowsSkeleton />
        ) : (
          <>
            {/* The heroes are this tab's own, and they get no Delete: a player's character
                is theirs, and the button beside a monster is for clearing away an encounter
                that is over. */}
            <CharacterSection title="Player characters" empty="Nobody has made a character yet.">
              {rows.players.map((character) => (
                <CharacterRow key={character._id} {...rows.rowProps(character)} />
              ))}
            </CharacterSection>

            <Separator />

            <NpcCharacterSection
              rows={rows}
              title="NPCs"
              empty="No NPCs yet. Take one off the shelf on the NPCs tab, or add one straight from the token dialog on the Map tab."
            />
          </>
        )}

        {/* Already merged by the hook, which carries the note about why a refused `−5`
            reports rather than throwing. */}
        <FieldError message={rows.error} />
      </CardContent>
    </Card>
  )
}
