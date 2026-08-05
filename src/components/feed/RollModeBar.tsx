import type { ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronsDownIcon, ChevronsUpIcon, DicesIcon, EyeOffIcon, MinusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useRollControls } from '@/hooks/useRoll'
import { cn } from '@/lib/utils'
import type { RollMode } from '@convex/lib/roll'
import { ROLL_MODES, ROLL_MODE_LABELS } from '@convex/lib/roll'

/**
 * A glyph per mode, so the strip can be read without reading it.
 *
 * A `Record` rather than a `switch`, which is `ROLL_MODE_LABELS`' own discipline one file
 * over and CLAUDE.md invariant 9's more generally: a fourth mode fails `npm run lint` here
 * instead of rendering a button with a gap where its icon should be. The pair of them is
 * why nothing below names a mode — the buttons come out of `ROLL_MODES`, so a fourth mode
 * cannot leave a control missing either.
 */
const MODE_ICONS: Record<RollMode, LucideIcon> = {
  flat: MinusIcon,
  advantage: ChevronsUpIcon,
  disadvantage: ChevronsDownIcon,
}

/**
 * HOW THE NEXT ROLL WILL BE MADE — normal, advantage or disadvantage, and the DM's
 * *just for me*.
 *
 * **No props: it reads `useRollControls()`.** The provider is mounted by `GameShell` around
 * both panes precisely so that this bar, the dice on the map and the sheet rows that send
 * rolls share one sticky mode, and threading it back down as props would be the same state
 * described twice.
 *
 * ⚠️ **It moved from the right-hand pane onto the map, which is what pushed the provider up
 * a level.** It used to sit above the six tab bodies — always on screen, because the mode is
 * sticky and a bar that only appeared on the two tabs that roll would let somebody set
 * advantage, glance at the Table and come back to a modifier they could no longer see they
 * had chosen. That argument is unchanged and is now better served: on the board it is
 * visible from wherever the reader is *and* from where their eyes already are. `BoardToolbar`
 * is its home and the height it gave up went to the feed.
 *
 * ⚠️ **The bar is loud when the mode is not Normal, and that loudness is the entire reason
 * it exists on every tab rather than only on the two that roll.** A sticky toggle that looks
 * like the default is the footgun: somebody sets advantage for a saving throw, glances at the
 * Table, comes back an hour later and rolls a greatsword with a modifier they can no longer
 * see they chose. So a non-`flat` mode tints the whole strip and rings it, on top of the
 * pressed button going solid — three signals, because one of them being subtle is how this
 * fails. `rollModeNote` on the feed line is the other half of the same mitigation: the row
 * records whether the toggle actually *did* anything, which for a damage roll it did not.
 *
 * **The tint is `primary` rather than a new amber**, deliberately. `avatar.ts` and
 * `health.ts` both argue that a colour invented beside the existing vocabulary is two
 * colours the moment one of them is adjusted, and advantage is not an error — a
 * `destructive` red would say the roller had done something wrong. What distinguishes this
 * from the app's ordinary accent is that in the `flat` state there is **no** tint at all, so
 * the difference a reader is asked to notice is presence against absence rather than one
 * shade against another.
 *
 * ⚠️ **No border, no padding of its own and no `shrink-0` any more**, and each of those was
 * load-bearing where it used to be: the pane is a fixed-height column, so a strip that could
 * grow would have taken the space the scrollback needed, and the bottom border was the line
 * between it and the tab body. Inside a toolbar it is one group among three, and the
 * surface, the padding and the separators belong to the bar. `flex-wrap` stays and matters
 * more, not less — the whole toolbar wraps at a narrow pane width and this group has to wrap
 * with it rather than growing a scrollbar.
 *
 * **Labelled as a group rather than captioned.** A visible "Rolling" would cost width the
 * three buttons want; `role="group"` with an `aria-label` gives a screen reader the same
 * thing for nothing, and the dice glyph says it to everybody else.
 */
export function RollModeBar(): ReactElement {
  const { mode, setMode, dmOnly, setDmOnly, mayRollPrivately } = useRollControls()

  // Named, because three classNames below ask it and a bar whose tint and whose ring
  // disagreed about what "not normal" means would be worse than having neither.
  const loud = mode !== 'flat'

  return (
    <div
      role="group"
      aria-label="Roll mode"
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-md px-1 py-0.5',
        loud && 'bg-primary/15 ring-primary/40 ring-1 ring-inset',
      )}
    >
      <DicesIcon
        aria-hidden
        className={cn('size-3.5 shrink-0', loud ? 'text-primary' : 'text-muted-foreground')}
      />

      {ROLL_MODES.map((candidate) => {
        const Icon = MODE_ICONS[candidate]
        const active = candidate === mode

        return (
          <Button
            key={candidate}
            type="button"
            size="xs"
            // The established toggle idiom: a solid `default` for the pressed one, a quiet
            // `ghost` for the rest, and `aria-pressed` so a screen reader is told this is a
            // toggle and not a link somewhere. All three stay live — pressing the current
            // one is a no-op, and a disabled button would only hide which is current from
            // anybody who cannot see colour, which is `LayerChoice`'s argument exactly.
            variant={active ? 'default' : 'ghost'}
            aria-pressed={active}
            onClick={() => setMode(candidate)}
          >
            <Icon aria-hidden />
            {ROLL_MODE_LABELS[candidate]}
          </Button>
        )
      })}

      {/* ⚠️ **Offered on `mayRollPrivately` and never on a badge in the roster.** That flag
          is `dmCode !== null` — this browser holding the code — which is the only thing that
          authorises anything (invariant 7). `feed.roll` re-verifies it and *refuses* an
          unauthorised `dmOnly` rather than downgrading it, so a control shown to somebody
          who cannot use it would produce a refusal instead of a public roll. Absent for a
          player, because there is nothing behind it for them. */}
      {mayRollPrivately ? (
        <Button
          type="button"
          size="xs"
          variant={dmOnly ? 'default' : 'ghost'}
          aria-pressed={dmOnly}
          title="Roll where only you can see the result"
          className="ml-auto"
          onClick={() => setDmOnly(!dmOnly)}
        >
          <EyeOffIcon aria-hidden />
          Just for me
        </Button>
      ) : null}
    </div>
  )
}
