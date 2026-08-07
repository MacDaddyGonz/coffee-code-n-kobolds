import { memo, useEffect, useState } from 'react'
import { SparklesIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { WARD_COLOUR } from '@/lib/health'
import {
  DEATH_SAVE_COLOUR,
  DEATH_SAVE_COLUMNS,
  DEATH_SAVE_LABELS,
  deathSaveTicks,
  deathSavesOf,
  heroicInspirationOf,
  nextDeathSaveCount,
} from '@/lib/vitals'
import type { PublicVitals } from '@convex/lib/characters'
import { MAX_TEMPORARY_HP } from '@convex/lib/sheet'

export type TokenVitalsEditorProps = {
  /**
   * What the server was willing to tell this client. `null` while the subscription is in
   * flight, and a `band` row for a creature this seat may look at and not touch — both of
   * which render nothing at all. See the docblock.
   */
  vitals: PublicVitals | null
  onSetTemporaryHp: (temporaryHp: number) => void
  onSetDeathSaves: (successes: number, failures: number) => void
  onSetHeroicInspiration: (heroicInspiration: boolean) => void
  className?: string
}

/**
 * THE 2024 STATE A DM ACTUALLY TOUCHES MID-FIGHT: a ward, a death-save tally and a spark of
 * inspiration — under the `−`/`+` on the coin's hit point editor.
 *
 * ⚠️⚠️ **NOTHING HERE KILLS ANYBODY, GRANTS ADVANTAGE, HALVES A SPEED OR REFUSES A DRAG,
 * AND THIS IS THE SCREEN WHERE A READER IS MOST TEMPTED TO MAKE IT.** Three filled failure
 * pips is three filled pips. CLAUDE.md's *Rules scope* names *"no death save kills a
 * character"* and *"no condition does anything"* as standing exclusions that the 2024
 * conversion did **not** lift — it put death saving throws in at all only on the grounds
 * that the counter decides nothing, which is the same door a condition pip and a creature's
 * loot came through. The three lines that make the third failure set `dead`, grey the coin
 * or refuse a heal are a spec amendment and an ADR, not a branch in this file.
 *
 * **It renders nothing for a viewer holding a band, and there is nothing here to unlock.**
 * `publicVitalsValidator`'s `band` member has no `temporaryHp`, no death-save columns and no
 * inspiration flag — a player looking at a goblin was never sent any of them, so the early
 * return below is *there is nothing to draw*, not *this is hidden*. That is CLAUDE.md
 * invariant 1 held by the type: a renderer that could choose would already have the secret.
 * Which is also why there is no `isDm` here and no `canEdit` prop — the caller decides
 * whether to mount this at all from `canEditHp`, and every mutation behind it re-verifies
 * the question server-side through `requireEditableCharacter` on each press.
 *
 * **Three writes rather than one Save.** Each control lands the instant it is pressed,
 * because all three are things somebody says out loud at a table and then forgets — the same
 * register as the `−`/`+` above them, and the opposite of the sheet editor's drafted form.
 * The temporary hit point field is the one exception, because it is typed: it commits on
 * blur and on Enter, and its draft is local so a half-typed `1` is never sent as a ward of
 * one.
 */
export const TokenVitalsEditor = memo(function TokenVitalsEditor({
  vitals,
  onSetTemporaryHp,
  onSetDeathSaves,
  onSetHeroicInspiration,
  className,
}: TokenVitalsEditorProps) {
  const temporary = vitals?.kind === 'exact' ? vitals.temporaryHp : null
  const [draft, setDraft] = useState('')

  /**
   * The field follows the server whenever the server's answer changes, and holds whatever
   * has been typed in between.
   *
   * ⚠️ **Keyed on the server's number and not on the character**, which is what makes a ward
   * granted from the sheet panel appear here without wiping a number the DM is mid-way
   * through typing into the *same* control — the two cannot both be happening. Switching
   * coins goes through the same door for free: the popover is aimed by clicking a bar, so a
   * different creature is a different `temporaryHp` in all but the case where the two
   * happen to be equal, and in that case the field already reads the right number.
   */
  useEffect(() => {
    setDraft(temporary === null ? '' : String(temporary))
  }, [temporary])

  // One test for the whole block: an `exact` row is what carries every field below, so a
  // band and a still-loading subscription are the same answer — nothing to draw.
  if (vitals === null || vitals.kind !== 'exact') return null

  // Read through the accessors rather than off the row, so this surface and the hover card
  // cannot come to disagree about what an absent answer means.
  const saves = deathSavesOf(vitals)
  const inspiration = heroicInspirationOf(vitals)
  if (saves === null || inspiration === null) return null

  const commit = () => {
    // An empty field means nought rather than *leave it alone*: clearing the box is how
    // somebody says the ward is gone, and it is the gesture they reach for first.
    const parsed = draft.trim() === '' ? 0 : Number(draft)
    const next = Number.isFinite(parsed)
      ? Math.min(MAX_TEMPORARY_HP, Math.max(0, Math.round(parsed)))
      : temporary
    if (next === null) return
    // ⚠️ **Clamped to `MAX_TEMPORARY_HP` and never to the character's own maximum.**
    // Temporary hit points are not part of it — a character on 3 of 8 may legitimately hold
    // 20 — and `clampTemporaryHp` on the server has nowhere to pass a ceiling precisely so
    // that the obvious wrong edit is unwriteable there too. This is the affordance; that is
    // the enforcement.
    if (next !== temporary) onSetTemporaryHp(next)
    setDraft(String(next))
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: WARD_COLOUR }}
        />
        {/*
          A span rather than a `<label htmlFor>`, deliberately: an `id` here would be a
          document-global name on a component that has no reason to be unique, and the
          `aria-label` below already gives the field a better name than the abbreviation
          beside it does.
        */}
        <span aria-hidden className="text-muted-foreground shrink-0 text-[0.6875rem]">
          Temp HP
        </span>
        <Input
          // Not a `type="number"` spinner, for `HpControls`' reason: the arrow keys are how
          // a token is nudged around the board, and a focused spinner swallows them.
          inputMode="numeric"
          aria-label="Temporary hit points"
          className="h-7 w-16 text-center"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
        />

        {/*
          The spark, on the same row because it is the other one-press fact about a hero and
          the popover is narrow. A pressed state rather than a checkbox: it is a thing you
          either have or do not, and the button *is* the readout.
        */}
        <Button
          type="button"
          size="sm"
          variant={inspiration ? 'default' : 'outline'}
          className="ml-auto h-7 gap-1 px-2 text-[0.6875rem]"
          aria-pressed={inspiration}
          aria-label="Heroic inspiration"
          onClick={() => onSetHeroicInspiration(!inspiration)}
        >
          <SparklesIcon aria-hidden />
          Inspired
        </Button>
      </div>

      {/*
        THE TALLY. Two rows because there are two columns, iterated from
        `DEATH_SAVE_COLUMNS` rather than written out — CLAUDE.md invariant 9's renderer
        rule, which is the same reason `TOKEN_LAYERS` and `TOKEN_MARKERS` are iterated three
        components over. A third column arrives with a row instead of being stored, counted
        and invisible.

        ⚠️ **The pips are boxes and not a verdict.** Nothing counts them, nothing compares
        them to three, and filling the third failure does exactly one thing: it fills the
        third failure. See this component's docblock.
      */}
      <div className="flex flex-col gap-1">
        {DEATH_SAVE_COLUMNS.map((column) => (
          <div key={column} className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 shrink-0 text-[0.6875rem]">
              {DEATH_SAVE_LABELS[column]}
            </span>
            <div className="flex items-center gap-1">
              {deathSaveTicks(saves[column]).map((ticked, index) => (
                <button
                  key={index}
                  type="button"
                  aria-pressed={ticked}
                  aria-label={`${DEATH_SAVE_LABELS[column]} ${index + 1}`}
                  className="border-input size-4 rounded-full border transition-colors"
                  style={{ backgroundColor: ticked ? DEATH_SAVE_COLOUR[column] : 'transparent' }}
                  onClick={() => {
                    // Both columns every time, because the server takes them together — see
                    // `HpActions.setDeathSaves`. Spread over the key rather than a ternary
                    // naming the two columns: the vocabulary is iterated everywhere else in
                    // this block and a branch here would be the one place a third column
                    // silently did nothing.
                    const next = {
                      ...saves,
                      [column]: nextDeathSaveCount(saves[column], index),
                    }
                    onSetDeathSaves(next.successes, next.failures)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
