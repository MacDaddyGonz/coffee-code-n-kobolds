import { memo } from 'react'
import type { ReactElement } from 'react'
import { SparklesIcon } from 'lucide-react'

import type { BoardToken } from '@/hooks/useBoard'
import type { Camera } from '@/lib/camera'
import { toScreenSpace } from '@/lib/camera'
import { WARD_COLOUR, healthLabel, temporaryHpOf } from '@/lib/health'
import { markerLabels } from '@/lib/markers'
import {
  COIN_STATS,
  COIN_STAT_COLOUR,
  COIN_STAT_LABELS,
  DEATH_SAVE_COLOUR,
  DEATH_SAVE_COLUMNS,
  DEATH_SAVE_LABELS,
  coinStatOf,
  deathSaveTicks,
  deathSavesOf,
  heroicInspirationOf,
  signed,
} from '@/lib/vitals'
import { cn } from '@/lib/utils'
import type { PublicSheet } from '@convex/lib/characters'
import type { PublicScene } from '@convex/lib/scenes'
import { initiativeBonusOf, speedOf } from '@convex/lib/sheet'

/** How far off the coin's rim the card sits, in screen pixels. */
const GAP_BESIDE_COIN = 14

export type TokenDetailCardProps = {
  /**
   * The coin the pointer is resting on, or the selected one — taken from the *smoothed*
   * board array so the card is anchored where the coin is drawn rather than where the
   * server last said it was.
   */
  token: BoardToken
  /** For the coin's size in image-space pixels — `gridSize` squares across. */
  scene: PublicScene
  camera: Camera
  /**
   * This creature's sheet, **or `null`, and the `null` is the whole of the access rule.**
   * `characters.sheet` answered it, so the decision about who may read one was made
   * server-side before this component existed. See the docblock.
   */
  sheet: PublicSheet | null
}

/**
 * WHAT THIS COIN IS, beside the coin — armour class, passive perception, initiative, speed,
 * its conditions in words, and a compact hit-point readout.
 *
 * ## ⚠️⚠️ WHICH OF THOSE A VIEWER SEES IS DECIDED ON THE SERVER, AND THIS FILE HAS NO SAY
 *
 * This is the paragraph to read before changing anything here, because the wrong fix is the
 * obvious one and it is the exact mistake CLAUDE.md invariant 1 exists to name.
 *
 * There are **two payloads** behind this card and they are gated separately:
 *
 * - **`token.vitals`** — the vitals row, which carries the armour class and the passive
 *   perception on **both** members of its union, because ADR 0014 published exactly those
 *   two to every player who can already see the coin. So every viewer who gets a card gets
 *   those. It also carries the hit points, the ward, the death-save tally and the
 *   inspiration flag on the `exact` member **only**: a player looking at a goblin holds the
 *   `band` variant, which has **nowhere to put a hit point** and nowhere to put any of the
 *   rest either.
 * - **`sheet`** — `characters.sheet`, which is `null` for an ordinary NPC, for another
 *   seat's hero, for a character in another game and for one that does not exist, all four
 *   being the same answer because an NPC's existence is itself a spoiler. **Initiative and
 *   speed come from here and from nowhere else**, and they are not published: ADR 0014 says
 *   a third published stat is a second decision needing its own ADR, so they ride on a
 *   payload that was already gated rather than being moved onto the vitals row.
 *
 * **So the rule this card uses is: draw what arrived, and draw nothing else.** There is no
 * `isDm` in this file, no `canMove`, no `canEditHp` and no layer test, and adding one would
 * be a bug rather than a feature — by the time a renderer could make that choice the secret
 * would already be in a bundle anybody can read. A viewer who may not know initiative
 * **has no `sheet`**, so this card has nothing to draw; it does not fetch the number and
 * then decline to print it, which is the wrong fix and the one somebody will reach for.
 *
 * ⚠️ **If you find yourself wanting a field added to `visibleVitals` to make a row appear
 * here, stop.** That is a decision about what this application publishes, with an author and
 * an ADR, not a rendering problem. `useCoinSheet` carries the same warning at the query end.
 *
 * ## What it is not
 *
 * ⚠️ **The conditions are words and nothing else.** No speed is halved by *restrained*, no
 * advantage is granted by *invisible*, no drag is refused by *grappled* and no band is
 * recomputed by *dead* — `markerGuard.test.ts` keeps that a promise on the server, and here
 * it is simply that `markerLabels` returns strings. ⚠️ **The death-save tally decides
 * nothing either**: three filled failure boxes is three filled boxes, and the line that
 * greys this card out at the third is a spec amendment and an ADR rather than a condition.
 *
 * ## Why it is HTML
 *
 * `TableViewBadge`'s precedent, and `TokenHpPopover`'s: Konva for what is drawn on the
 * stage, plain HTML for what has to be legible and reachable. A card of eight labelled
 * numbers as canvas text would have no line wrapping, no screen reader and no selectable
 * text, and would be re-rasterised with the whole layer on every frame of a pan. The three
 * overlay rules come with it — `pointer-events-none` throughout so nothing here can eat a
 * press aimed at a coin, movement by `transform` rather than `left`/`top`, and the memo.
 */
export const TokenDetailCard = memo(function TokenDetailCard({
  token,
  scene,
  camera,
  sheet,
}: TokenDetailCardProps): ReactElement | null {
  const position = token.position
  if (!position) return null

  const centre = toScreenSpace(camera, position)
  const radius = (token.sizeSquares * scene.gridSize * camera.scale) / 2

  return (
    // Beside the coin rather than under it, because under it is taken: the hit point editor
    // hangs there, and the two are open together every time somebody clicks a bar on a coin
    // they were already pointing at. The `translate(0, -50%)` centres a box whose height
    // depends on its contents without measuring it, exactly as the popover's `-50%, 0`
    // centres one whose width does; order matters, and the percentage must follow the pixels.
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{
        transform: `translate(${centre.x + radius + GAP_BESIDE_COIN}px, ${centre.y}px) translate(0, -50%)`,
      }}
    >
      <CardBody token={token} sheet={sheet} />
    </div>
  )
})

/**
 * The card, held still while the wrapper above it moves.
 *
 * `TokenHpPopover`'s split, for its reason: the wrapper re-renders on every frame of a pan
 * to stay beside the coin, and reconciling this body means walking a dozen `cn()` calls to
 * arrive at exactly the markup already on screen. Both props are identities somebody upstream
 * holds on purpose — `token` comes off the join in `useBoard` through `useSmoothPositions`,
 * and `sheet` off a Convex subscription by reference.
 */
const CardBody = memo(function CardBody({
  token,
  sheet,
}: {
  token: BoardToken
  sheet: PublicSheet | null
}): ReactElement {
  const vitals = token.vitals
  const conditions = markerLabels(token.markers)
  // Read through the accessors rather than off the row, so this card and the editor in the
  // popover cannot come to disagree about what an absent answer means. Each is `null` for a
  // viewer holding a band — which is *not sent*, not *hidden*. See the docblock.
  const temporary = vitals === null ? null : temporaryHpOf(vitals)
  const saves = vitals === null ? null : deathSavesOf(vitals)
  const inspired = vitals === null ? null : heroicInspirationOf(vitals)

  return (
    <div className="bg-background/95 w-56 rounded-lg border px-2.5 py-2 shadow-lg backdrop-blur">
      <p className="truncate text-sm leading-tight font-semibold">{token.name}</p>

      {/*
        The hit-point line: `20/45` for a hero, `Bloodied` for a monster a player is looking
        at. `healthLabel` is the same function the bar over the coin prints, so the card and
        the coin cannot describe the same creature differently — and it formats what arrived
        rather than choosing what to reveal.
      */}
      {vitals === null ? null : (
        <p className="mt-1 flex items-baseline gap-1.5 text-sm tabular-nums">
          <span className="font-semibold">{healthLabel(vitals)}</span>
          {temporary !== null && temporary > 0 ? (
            // ⚠️ **A separate chip in the ward's own colour, never appended to the number.**
            // `24/45 (+7)` reads as a heal that has overflowed; temporary hit points are not
            // part of the maximum and are not healing, and the coin's strip makes the same
            // distinction by geometry. `WARD_COLOUR` is shared so the strip and this chip
            // are visibly one fact.
            <span
              className="rounded px-1 text-[0.6875rem] font-semibold text-slate-950"
              style={{ backgroundColor: WARD_COLOUR }}
            >
              +{temporary} temp
            </span>
          ) : null}
          {inspired ? (
            <span
              className="text-muted-foreground ml-auto inline-flex items-center gap-0.5 text-[0.6875rem]"
              title="Heroic inspiration"
            >
              <SparklesIcon aria-hidden className="size-3" />
              Inspired
            </span>
          ) : null}
        </p>
      )}

      {/*
        THE PUBLISHED PAIR. Iterated from `COIN_STATS` rather than named, so a third
        published stat is a compile error rather than a row nobody drew — and it is the same
        array and the same colours the badges on the coin use, which is what makes the disc
        and the label one fact instead of two.

        A stat whose value is `null` is omitted rather than printed as a dash: a hand-built
        goblin whose DM never recorded a passive perception has none, and inventing 10 is a
        statistic the table would act on.
      */}
      {vitals === null ? null : (
        <dl className="mt-1.5 flex flex-col gap-0.5">
          {COIN_STATS.map((stat) => {
            const value = coinStatOf(vitals, stat)
            if (value === null) return null
            return (
              <Row
                key={stat}
                label={COIN_STAT_LABELS[stat]}
                value={String(value)}
                colour={COIN_STAT_COLOUR[stat]}
              />
            )
          })}

          {/*
            ⚠️ **INITIATIVE AND SPEED ARE NOT PUBLISHED, AND THIS IS WHERE THAT SHOWS.**
            They come off `sheet`, which the server answered with `null` for any creature
            this caller may not read — so for that viewer these two rows simply do not
            exist. There is deliberately **no `else`**: no dash, no "hidden", no lock icon.
            An empty row saying a number is being withheld is an oracle, and it would be one
            over exactly the creature the DM is keeping quiet about.
          */}
          {sheet === null ? null : (
            <>
              <Row label="Initiative" value={signed(initiativeBonusOf(sheet.sheet))} />
              <Row label="Speed" value={`${speedOf(sheet.sheet)} ft`} />
            </>
          )}
        </dl>
      )}

      {/*
        THE DEATH-SAVE TALLY, as boxes, iterated from `DEATH_SAVE_COLUMNS`.

        ⚠️ **Read-only here and it decides nothing.** The card is a readout; the editor in
        the hit point popover is where the boxes are pressed. Three filled failures is three
        filled boxes — see this file's docblock and `@/lib/vitals`' header, which is where a
        reader tempted to make the third one mean something will find the argument.

        Hidden entirely when nothing is ticked, because an empty tally is the ordinary state
        of every creature in the game and two rows of empty circles on every card would be
        the loudest thing on it.
      */}
      {saves !== null && saves.successes + saves.failures > 0 ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {DEATH_SAVE_COLUMNS.map((column) => (
            <div key={column} className="flex items-center gap-1.5">
              <span className="text-muted-foreground w-16 shrink-0 text-[0.6875rem]">
                {DEATH_SAVE_LABELS[column]}
              </span>
              <span
                className="flex items-center gap-1"
                role="img"
                aria-label={`${DEATH_SAVE_LABELS[column]}: ${saves[column]}`}
              >
                {deathSaveTicks(saves[column]).map((ticked, index) => (
                  <span
                    key={index}
                    aria-hidden
                    className={cn('border-input size-2.5 rounded-full border')}
                    style={{
                      backgroundColor: ticked ? DEATH_SAVE_COLOUR[column] : 'transparent',
                    }}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/*
        THE CONDITIONS, IN WORDS — the authoritative reading the pips on the coin explicitly
        are not. `markerLabels` iterates the vocabulary and intersects, so a condition this
        bundle has never heard of is dropped rather than printed as `undefined`; and there is
        no capacity to collapse against here, so all seventeen would fit.

        ⚠️ Labels. Nothing is halved, granted or refused. See the docblock.
      */}
      {conditions.length === 0 ? null : (
        <p className="text-muted-foreground mt-1.5 text-[0.6875rem] leading-snug">
          {conditions.join(' · ')}
        </p>
      )}
    </div>
  )
})

/**
 * One label-and-number line.
 *
 * The optional colour is a dot rather than coloured text: the two published stats are the
 * only rows that carry one, and a coloured *number* beside an uncoloured one reads as the
 * number itself meaning something — which for an armour class printed in red would be
 * precisely the wrong suggestion.
 */
function Row({
  label,
  value,
  colour,
}: {
  label: string
  value: string
  colour?: string
}): ReactElement {
  return (
    <div className="flex items-baseline gap-1.5">
      {colour === undefined ? null : (
        <span
          aria-hidden
          className="size-2 shrink-0 translate-y-px rounded-full"
          style={{ backgroundColor: colour }}
        />
      )}
      <dt className="text-muted-foreground text-[0.6875rem]">{label}</dt>
      <dd className="ml-auto text-xs font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
