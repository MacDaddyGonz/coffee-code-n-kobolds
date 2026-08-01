import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRollControls, useRollTarget } from '@/hooks/useRoll'
import { cn } from '@/lib/utils'
import type { RollRequest } from '@convex/lib/roll'
import { ROLL_MODE_LABELS } from '@convex/lib/roll'

/**
 * THE ONE CONTROL THAT SENDS A ROLL. Every clickable thing on a character sheet is
 * this component — the six ability modifiers, the six saving throws, the thirteen
 * skills and every part of every entry.
 *
 * **It sends an identifier and nothing else.** There is no `1d20` here, no `+`, and no
 * arithmetic of any kind: the request names an ability, a skill or an entry id, and the
 * server looks the expression up on the stored sheet and throws the dice. That is the
 * arrangement `convex/lib/dice.ts` is kept out of the bundle to protect — see the ⚠️ at
 * the top of `bundleGuard.test.ts` — and it is why this file imports `lib/roll.ts` for
 * three words of English and nothing else.
 *
 * ⚠️ **It reads the target itself rather than taking one as a prop, and renders nothing
 * when there is nothing to aim at.** `useRollTarget` is `null` for a token with no sheet
 * behind it and for a panel with nothing selected, and a roll button with nowhere to send
 * a roll must not exist. Folding that test in here is what keeps it out of `AbilityTable`,
 * `SkillList` and `SheetEntryList` — three components whose whole job is to print a sheet,
 * which would otherwise each grow a branch about whether dice are available.
 *
 * ⚠️ **Advantage is not a per-button concern and is still shown on every button.** The
 * mode lives in `RollProvider` and is sticky until somebody changes it, so the footgun is
 * a toggle nobody can see they set; the mitigation is that every control that would obey
 * it says so, in its accessible name and in its tooltip. It is deliberately *not* in the
 * visible label — a column of six numbers reading "+3 with advantage" is unreadable, and
 * `RollModeBar` is where the toggle itself is.
 *
 * **The note is silent on a passive and shown everywhere else**, and the asymmetry is the
 * line between what this component knows and what it would have to parse to know. A `use`
 * has no roll *by definition*, so promising advantage on one offers a choice that does not
 * exist. Everything else either definitely is a single d20 — a `toHit` by construction, and
 * a check, a save, a skill and an initiative through `toHitFromBonus` — or is genuinely
 * unknowable from here, which is a damage or effect roll: Fireball's `8d6` takes no
 * advantage and the Wizard's Spellcasting `1d20+INT+PROF` does, and telling them apart means
 * parsing an expression in the browser, which is the one thing this file may not do. So
 * those say what the toggle is *set to*, and `rollModeNote` on the feed row — keyed off
 * `dropped`, which is what actually happened — is where the table is told whether it did
 * anything. lib/roll.ts draws that distinction in as many words.
 */
export type RollButtonProps = {
  /** What to send. Identifiers only; see the note above. */
  request: RollRequest
  /**
   * The accessible name, less the mode — `Roll Athletics`, `Roll to hit for Greatsword`.
   *
   * Written out by the caller rather than composed from the request here, because the
   * three request kinds are three different sentences and the entry ones need a name this
   * component has not got. Passed as a whole clause so the mode can be appended to it.
   */
  says: string
  /**
   * What alt-click does instead, as a clause — `Read out Greatsword`.
   *
   * Absent on a check, a save and a skill, because none of them has a description to
   * send. It is only the *wording*: whether alt-click does anything different is decided
   * from the request's own kind below, so a caller cannot make the two disagree.
   */
  altSays?: string
  /**
   * ⚠️ **Whether the clickable thing is a figure or a word, which decides how it draws
   * AND what is left behind when there is nothing to aim at.** Those two look like
   * separate questions and are one: a `number` is a *fact on the sheet* that has to print
   * whether or not it can be rolled, and a `word` is the affordance itself, which has
   * nothing to say without a target. So the number survives as plain text and the word
   * disappears.
   */
  look?: 'number' | 'word'
  /** What it shows: the modifier, the bonus, or the part's label. */
  children: ReactNode
  /** The caller's own reason to be inert — a saving sheet. Nothing is added to it here. */
  disabled?: boolean
  className?: string
}

/**
 * A figure in a column of figures.
 *
 * `tabular-nums` and `text-sm` come with the `number` look rather than being passed in,
 * because that is what the look *means* — every caller is a cell in a grid of modifiers.
 * Weight is left to the caller, since the sheet does not currently print all of these at
 * the same weight.
 */
const FIGURE = 'text-sm tabular-nums'

export function RollButton({
  request,
  says,
  altSays,
  look = 'word',
  children,
  disabled,
  className,
}: RollButtonProps) {
  const characterId = useRollTarget()
  const { mode, roll } = useRollControls()

  if (characterId === null) {
    // See the ⚠️ on `look`. A number is a fact and stays; a button is an affordance and
    // goes. Both branches take `className`, which is what makes the printed form
    // byte-identical to the cell that was there before any of this was clickable.
    return look === 'number' ? <span className={cn(FIGURE, className)}>{children}</span> : null
  }

  /**
   * `with advantage`, `with disadvantage`, or nothing.
   *
   * ⚠️ **Derived from `ROLL_MODE_LABELS` rather than from a second `Record` of sentence
   * fragments here.** Those three words already exist in exactly one place, and
   * `rollModeNote` in lib/roll.ts already produces this exact wording for the feed line —
   * so a local table of fragments would be a third copy free to disagree with the row the
   * click ends up producing. Lowercasing a label to put it inside a sentence is a
   * transformation of the one copy rather than a rival to it, and a fourth mode gets a
   * note automatically instead of a blank one.
   *
   * ⚠️ **Silent on a `use`, because a passive rolls nothing at all.** *"Use Rage with
   * advantage"* offers a reader a choice that does not exist, and the row it produces will
   * carry `roll: null` — so this is not a guess about the expression, it is the one part
   * whose whole definition is that there is no die to take the higher of. Every other part
   * is left alone deliberately: a `toHit` is a d20 by construction (`TO_HIT_PREFIX`), and a
   * check, a save, a skill and an initiative all come from `toHitFromBonus`, so the note is
   * simply true there. A `roll` is the one genuinely unknown case — Fireball's `8d6` takes
   * no advantage and the Wizard's Spellcasting `1d20+INT+PROF` does — and answering it would
   * mean parsing an expression in the browser, which is the one thing this component may not
   * do. So it stays shown, and `rollModeNote` on the resulting feed row is the authority on
   * whether the toggle did anything: it keys off the die that was actually dropped.
   */
  const note =
    mode === 'flat' || (request.kind === 'entry' && request.part === 'use')
      ? null
      : `with ${ROLL_MODE_LABELS[mode].toLowerCase()}`
  const name = note === null ? says : `${says} ${note}`

  /**
   * ⚠️ **Alt-click sends the description instead of the roll**, which is what the spec
   * asks a sheet item to be able to do without a second button per row.
   *
   * Decided from the request's *kind* rather than from whether `altSays` was passed, so
   * the gesture and its wording cannot come apart. On a check, a save or a skill there is
   * no description to send — the subject is an ability and not a line of text — so
   * alt-click simply rolls. That is documented rather than invented into some other
   * meaning: a modifier key that does something different on three of four control types
   * and something *surprising* on the fourth is worse than one that does nothing.
   */
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    roll(
      characterId,
      event.altKey && request.kind === 'entry' ? { ...request, part: 'text' } : request,
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="xs"
          // A number stays a number: `ghost` gives it no border and no colour of its own,
          // so the column still reads as six figures and grows a background only under the
          // pointer. `link` was the other candidate and was rejected for the opposite
          // reason — it tints every modifier on the sheet `text-primary`, which turns a
          // stat block into a list of hyperlinks and makes the one number a reader is
          // scanning for the hardest thing on the panel to scan for. An entry's part is a
          // word rather than a figure and is the control this whole milestone exists for,
          // so it gets `outline`: the same weight the creature sheet's own chips use.
          variant={look === 'number' ? 'ghost' : 'outline'}
          className={look === 'number' ? cn('px-1.5', FIGURE, className) : className}
          // ⚠️ **The caller's own reason only, and deliberately never `rolls.pending`.**
          // That flag is the panel's count of *every* roll in flight, so reading it here
          // greys out every control on the sheet for the length of a round trip — and a
          // weapon is two clicks in a second, which `TableEffects` names as the ordinary
          // case rather than a corner one. The second click would land on a disabled
          // button and be silently dropped, which is the exact failure the initiative die
          // in `CharacterRows` records as its own correction, in the same words. There is
          // nothing to protect against either: a second roll is a second feed line and
          // both are wanted, the mutation is one transaction per click, and the tray and
          // the announcement are both newest-wins by construction. `disabled` stays,
          // because a sheet mid-save is a real reason.
          disabled={disabled}
          // Always, and not only when the control is icon-only. `+3` is not a name, and
          // `To hit` does not say which of a hero's four weapons it belongs to.
          aria-label={name}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      {/* What it will roll, spelled out, because none of the visible labels can say it —
          a figure says nothing at all and a part's label says nothing about which line it
          is on. `flex-col items-start` because the alt-click hint is a second line; the
          primitive centres a single row of content. */}
      <TooltipContent className="flex-col items-start gap-0.5">
        <span>{name}</span>
        {altSays === undefined ? null : (
          <span className="opacity-70">Alt-click: {altSays}</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
