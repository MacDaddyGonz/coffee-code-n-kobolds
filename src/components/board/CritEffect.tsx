import type { CSSProperties, ReactElement, RefObject } from 'react'
import { useEffect } from 'react'

import type { CritKind } from '@/lib/crit'
import { CRIT_COLOUR } from '@/lib/crit'

/**
 * The class that shakes the map pane, and the length of the animation behind it.
 *
 * ⚠️ **The two have to agree, and they are declared in two files, so this is the join.**
 * The keyframe and the timing live in `index.css` — a keyframe cannot live anywhere else,
 * see the block comment there — and the class is taken off again here once it has played,
 * so the pane is not left carrying a spent animation.
 */
const SHAKE_CLASS = 'kk-crit-shake'
const SHAKE_MS = 480

/**
 * Fixed burst origins, as a fraction of the pane, and the sparks each one throws.
 *
 * Built once at module scope rather than per render, and fixed rather than random: three
 * bursts across the upper half read as fireworks over the map, whereas positions rerolled
 * on every crit read as three unrelated things happening. Nothing here is a rules value or
 * a number anybody checks, so a hard-coded arrangement chosen by eye is the honest form.
 *
 * Ten sparks each, at 36° apart, alternating between two distances so the ring does not
 * read as a mechanical circle. Thirty absolutely-positioned spans is nothing next to a
 * board of forty Konva coins, and every one of them animates `transform` and `opacity`
 * only — so the whole effect is compositor work and never touches layout.
 */
const SPARKS_PER_BURST = 10

type Spark = { angle: number; reach: number; delay: number }

const BURSTS: { left: string; top: string; delay: number; sparks: Spark[] }[] = [
  { left: '30%', top: '32%', delay: 0 },
  { left: '52%', top: '20%', delay: 170 },
  { left: '72%', top: '40%', delay: 330 },
].map((burst) => ({
  ...burst,
  sparks: Array.from({ length: SPARKS_PER_BURST }, (_unused, index) => ({
    angle: (360 / SPARKS_PER_BURST) * index,
    reach: index % 2 === 0 ? 72 : 46,
    // A few milliseconds of stagger within a burst, so the ten do not leave as one
    // rigid wheel. Three groups rather than ten distinct delays, because the eye reads
    // "slightly ragged" and cannot count.
    delay: burst.delay + (index % 3) * 26,
  })),
}))

export type CritEffectProps = {
  /**
   * The crit to draw, or `null` for the overwhelmingly common roll that is neither.
   *
   * A prop rather than a mount/unmount, so the shake effect below can key off it together
   * with the nonce and there is no second component lifecycle to reason about.
   */
  crit: CritKind | null
  /**
   * Which roll this crit belongs to. Two natural 20s in a row are the same `crit` value,
   * so this is the only thing that tells the effect below to play again.
   */
  nonce: number
  /**
   * ⚠️ **The map pane, because the shake must move the map and nothing else.** A transform
   * on `<body>` would carry the header and the right-hand panel with it, and on a
   * `position: fixed` / `h-dvh` shell that does not read as a die landing badly — it reads
   * as the application breaking. `MapPane` owns the element and hands it over; it also
   * carries `overflow-hidden` so that nothing *inside* the pane escapes while it moves.
   */
  paneRef: RefObject<HTMLElement | null>
}

/**
 * A natural 1 or a natural 20, felt rather than read.
 *
 * A red pulse and a shake of the map for a critical miss; a green flash and fireworks for
 * a critical hit. The roadmap asks for exactly those two, and this is the whole of what
 * they are — no library, no canvas, no dependency. Thirty spans and four keyframes.
 *
 * **Fired when the dice settle, not when the sentence appears.** `TableEffects` only
 * mounts this with a non-null `crit` once the throw has finished, so the celebration lands
 * on the moment the 20 becomes visible on the table rather than a second before it. That
 * ordering is the only reason the effect is worth having: fireworks over a die that is
 * still tumbling are fireworks for a number nobody has seen yet.
 *
 * ## `prefers-reduced-motion`
 *
 * ⚠️ **Suppressed by substitution and never by hiding, because somebody who has asked for
 * less motion still needs to know they rolled a 20.** Three of the four parts change and
 * the rules are in `index.css` next to the keyframes, where the cascade can reach them:
 *
 * - The **wash** stops pulsing and becomes a *held* colour — red or green, for as long as
 *   the effect is on screen. It works because its resting opacity is the visible one and
 *   the animation is what overrides it, which is the inversion of the usual way round and
 *   is written down there.
 * - The **shake** goes. There is no static substitute for a shake, and inventing one would
 *   be a second way of saying what the held wash already says.
 * - The **sparks** go, and this is the one place `display: none` is right: a firework with
 *   its motion removed is thirty dots in a ring, which is noise on top of the wash that is
 *   already carrying the message.
 * - The **words** do not change at all. `RollAnnouncement` prints `CRIT_LABEL` beside the
 *   total in both modes, and that is the guarantee the information survives rather than
 *   the wash, which is atmosphere.
 *
 * ⚠️ **Which is why the shake is applied by adding a class and never by writing
 * `style.animation`.** An inline style beats a media query in the cascade, so an
 * imperatively-styled shake would go on shaking for the one reader who had asked it not to,
 * and no amount of care in this file could override it. A class is a thing the stylesheet
 * can refuse.
 *
 * **Entirely `aria-hidden` and entirely `pointer-events-none`.** It is decoration over a
 * canvas: the fact it decorates is in the announcement's live region and in the feed, and
 * an overlay that eats a click is a token the DM cannot pick up — the rule
 * `TokenHpPopover` states and that this layer, being full-bleed, would break worst.
 */
export function CritEffect({ crit, nonce, paneRef }: CritEffectProps): ReactElement | null {
  useEffect(() => {
    // Only a miss shakes. A hit is celebrated rather than felt as an impact, which is the
    // roadmap's own split — "screen shake + red alarm on a 1, celebration + fireworks on a
    // 20" — and shaking on both would make the two indistinguishable at a glance.
    if (crit !== 'failure') return

    const pane = paneRef.current
    if (!pane) return

    /**
     * Removed, then added on the next frame.
     *
     * ⚠️ **Adding a class that is already on the element restarts nothing**, and two
     * critical misses inside half a second is an ordinary thing at a busy table. The
     * usual fix is to force a reflow between the remove and the add by reading a layout
     * property; a frame is cleaner — it is one guaranteed style flush, it costs 16 ms
     * nobody can perceive against a 480 ms animation, and it does not depend on a bare
     * property read surviving a minifier.
     */
    pane.classList.remove(SHAKE_CLASS)

    let removeTimer = 0
    const frame = requestAnimationFrame(() => {
      pane.classList.add(SHAKE_CLASS)
      // Taken off again once it has played, so the pane is not left carrying a spent
      // animation — and so the next crit's `remove` has something to remove.
      removeTimer = window.setTimeout(() => pane.classList.remove(SHAKE_CLASS), SHAKE_MS)
    })

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(removeTimer)
      // ⚠️ The pane outlives this component, so the class has to come off on the way out.
      // A crit that unmounted mid-shake — the game ending, the route changing — would
      // otherwise leave a transform's stacking context on the pane for good.
      pane.classList.remove(SHAKE_CLASS)
    }
  }, [crit, nonce, paneRef])

  if (crit === null) return null

  const colour = CRIT_COLOUR[crit]

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
        The wash. A vignette rather than a flat fill: the middle of the map is where the
        tokens and the dice are, and a full-strength sheet of red over them hides the thing
        the alarm is about. `boxShadow: inset` draws the edge, which is what makes it read
        as the *pane* flashing rather than as a coloured rectangle sitting on it.

        Both colours come from `@/lib/crit`, which is also where the feed row's marker takes
        them from — one definition, because the alarm over the map and the line in the feed
        have to be obviously about the same die.
      */}
      <div
        className="kk-crit-wash absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 42%, transparent 26%, ${colour} 128%)`,
          boxShadow: `inset 0 0 0 4px ${colour}`,
        }}
      />

      {/*
        Fireworks, for a hit only. A critical miss gets the shake and the red wash, and
        adding sparks to it would celebrate the worst roll in the game.
      */}
      {crit === 'success'
        ? BURSTS.map((burst) => (
            <div
              key={burst.left}
              className="absolute size-0"
              style={{ left: burst.left, top: burst.top }}
            >
              {/* The flash at the centre of the burst, which is what makes the sparks look
                  thrown rather than merely present. */}
              <div
                className="kk-crit-burst absolute -top-6 -left-6 size-12 rounded-full"
                style={{
                  ...customProperties({ '--kk-delay': `${burst.delay}ms` }),
                  background: `radial-gradient(circle, ${colour} 0%, transparent 70%)`,
                }}
              />
              {burst.sparks.map((spark) => (
                <span
                  key={spark.angle}
                  // Placed at the burst's own origin and offset by half its own size, so
                  // `rotate()` turns about the centre of the burst. `index.css` explains
                  // why the keyframe rotates before it translates.
                  className="kk-crit-spark absolute -top-[3px] -left-[3px] size-1.5 rounded-full"
                  style={{
                    ...customProperties({
                      '--kk-angle': `${spark.angle}deg`,
                      '--kk-reach': `${spark.reach}px`,
                      '--kk-delay': `${spark.delay}ms`,
                    }),
                    // Alternating with white, because a shower in one flat green reads as
                    // a pattern and a shower with highlights in it reads as sparks.
                    backgroundColor: spark.angle % 72 === 0 ? '#ffffff' : colour,
                  }}
                />
              ))}
            </div>
          ))
        : null}
    </div>
  )
}

/**
 * CSS custom properties in a React `style` object, with the one cast that needs.
 *
 * `React.CSSProperties` is `csstype`'s property list and has no index signature, so a
 * `--kk-angle` key is a type error however it is written — React itself passes custom
 * properties straight through to `style.setProperty`, so this is a gap in the types rather
 * than a thing the runtime dislikes. One helper with one documented cast, rather than the
 * same `as unknown as` at four call sites where the next reader has to work out afresh
 * whether it is load-bearing.
 *
 * The alternative was to put the angles in the stylesheet as thirty pre-written classes,
 * which is thirty rules to keep in step with one array.
 */
function customProperties(properties: Record<string, string>): CSSProperties {
  return properties as unknown as CSSProperties
}
