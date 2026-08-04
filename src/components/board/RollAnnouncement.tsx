import type { ReactElement } from 'react'
import { memo } from 'react'

import { ProfileIcon } from '@/components/ProfileIcon'
import { CRIT_LABEL, critColour } from '@/lib/crit'
import { cn } from '@/lib/utils'
import type { FeedSubject, RollResult } from '@convex/lib/roll'
import { rollModeNote, rollSentence } from '@convex/lib/roll'

export type RollAnnouncementProps = {
  /**
   * The four facts a line needs, as four props rather than one object.
   *
   * ⚠️ **Primitives and stable references, never a `{ actorName, subject, roll }`
   * literal**, which is the discipline `MapPaneProps` states two files up and the reason
   * the memo below is worth having at all. `subject` and `roll` arrive by reference off
   * the feed row, so they change when the roll does and not before; a fresh object
   * assembled at the call site would be a changed prop every time the token subscription
   * pushed, which is precisely the render this component is memoised against.
   *
   * All four are `null` between rolls, which is a real state and not a missing one — see
   * the note on the layer below for why this component renders even then.
   */
  actorName: string | null
  subject: FeedSubject | null
  /** `null` for a passive being declared or an alt-clicked description. No total, no dice. */
  roll: RollResult | null
  /**
   * The roller's token art, or `null` to fall back to the generated disc.
   *
   * ⚠️ **Resolved by the caller and deliberately not looked up here.** `TableEffects`
   * holds the token subscription because this component is unmounted for most of a
   * session — a `useQuery` in here would drop and re-establish the subscription around
   * every single roll.
   */
  artUrl: string | null
  /** The dice have settled, so the total may appear. See the sequencing in `TableEffects`. */
  revealed: boolean
  /** Fading out. Still mounted, because an element cannot animate its own removal. */
  leaving: boolean
}

/**
 * ⚠️ **A roll that supersedes another swaps the words in place and does not fade in again**,
 * which is a consequence of the class-driven animation rather than a decision taken
 * separately: the pill keeps the same DOM element and the same `kk-announce-in` class, so
 * nothing restarts. It is left that way on purpose. Adding `key={nonce}` would replay the
 * fade — and would also remount the `<img>` behind the roller's coin, which is a blank frame
 * on the one element that has to load from the network. A hard swap also reads correctly: the
 * line has been *replaced*, which is exactly what happened. See the newest-wins note in
 * `TableEffects`.
 */

/**
 * WHO ROLLED AND WHAT THEY GOT, floating over the map.
 *
 * **This is the only confirmation the person who clicked gets, which is the whole reason
 * it exists.** The feed and the character sheet share one right-hand panel, so somebody
 * rolling off their own sheet cannot see the feed line they just created — and the DM
 * rolling a monster's attack out of the Sheets selector is the case with the most on
 * screen and the least confirmation of it. So the sentence goes where everybody is already
 * looking, and it plays on every screen rather than only the roller's.
 *
 * ⚠️ **The wording is `rollSentence` and there is not a second copy of it here.** One
 * template per shape and no copy per entry is what ADR 0008 added the category for, and
 * the line over the map and the line in the feed must agree about what happened — two
 * generators would eventually disagree, over exactly the same row. `convex/lib/roll.ts` is
 * browser-shared for this reason and says so at the top; the evaluator next door to it is
 * not, and `bundleGuard.test.ts` is what keeps the two apart.
 *
 * **The total alone, never the arithmetic.** `rollResultValidator` divides the three
 * readers on this point: the feed prints the total *and* the working, the announcement
 * prints the total, and the dice show the faces. `18 + 5` under a glowing line that is on
 * screen for two seconds is a number nobody reads and one more thing over the map.
 *
 * ## The three rules this inherits from `TokenHpPopover`
 *
 * 1. **`pointer-events-none` by default, `auto` only where something is clickable.** The
 *    failure that rule exists for has been paid for once on this board already: anything
 *    laid over the canvas that eats a click is a token the DM cannot pick up, and it fails
 *    *silently*, because a transparent box has nothing on screen to explain why the map
 *    stopped responding. This layer is full-bleed, which makes it the worst possible
 *    offender — and there is nothing on it to click, so it never opts back in. No `auto`
 *    appears in this file.
 * 2. **Move by `transform`, never by `left`/`top`.** The keyframes in `index.css` animate
 *    `opacity` and `transform` and nothing else, so the fade is a composite rather than a
 *    layout of the board's subtree.
 * 3. **Split the moving wrapper from a memoised card.** ⚠️ **Inherited and then
 *    deliberately not applied, which is worth stating because a reader will look for the
 *    split.** That rule is about an element anchored to a *token*, which has to re-render
 *    on every frame of a pan to stay over the coin. This layer **reads the camera not at
 *    all** — it is centred against the pane, not against a position in image space — so
 *    there is no per-frame wrapper to separate, and a pan re-renders nothing here. That is
 *    the cheaper arrangement rather than a shortcut past the rule, and it is why the
 *    announcement can be full-bleed without costing anything during a drag.
 *
 * The memo is still worth having, for the other reason: `TableEffects` holds the token
 * subscription, so it re-renders when anybody's art or name changes, and the four props
 * above are all stable across that.
 */
export const RollAnnouncement = memo(function RollAnnouncement({
  actorName,
  subject,
  roll,
  artUrl,
  revealed,
  leaving,
}: RollAnnouncementProps): ReactElement {
  /**
   * ⚠️ **Gated on `revealed`, so the glow arrives *with* the number and never before it.**
   *
   * This was measured in a browser rather than reasoned about, and the measurement is the
   * whole argument. The halo used to be tinted from `roll.crit` as soon as the line
   * appeared — and the gap between the line and the total is not the `MINIMUM_BEAT_MS`
   * floor it looks like from here, it is however long the dice take to settle: **2.4 to 2.6
   * seconds**, every time. In that window the pill glowed green or red while the die was
   * still tumbling on faces that were not the answer, which is long enough to read the
   * colour, register it and say it out loud before the number lands.
   *
   * That inverts what the sequence is for. The one thing a table cares about on a d20 is
   * *did it come up 20*, so a coloured halo answers the interesting question and leaves the
   * arithmetic as the punchline — a tell dressed as a tease. `CritEffect` was already
   * sequenced against the reveal for exactly this reason; this is the same rule applied to
   * the glow that sits inside the announcement, so the wash, the sparks, the word and the
   * halo now all arrive on the same frame as the total.
   *
   * The cost is a plainer two and a half seconds, which is the correct amount of nothing:
   * the sentence's job in that window is to say *who did what*, and it still does.
   */
  const crit = revealed ? (roll?.crit ?? null) : null
  // `critColour` rather than the record and a `=== null` test written out here, twice: the
  // narrowing from `Crit` to the two that happened is `@/lib/crit`'s job, and the feed row
  // this line is about takes its tint from the same call.
  const colour = critColour(crit)
  const note = roll ? rollModeNote(roll) : null

  return (
    /**
     * ⚠️ **Mounted even when there is nothing to announce, and that is the accessibility
     * half of the design rather than laziness.** A live region has to exist in the
     * document *before* its contents change for a screen reader to announce the change —
     * a region that appears already populated is frequently read as nothing at all. So the
     * region is permanent and its contents come and go, which also means `TableEffects`
     * renders this unconditionally and has one less branch.
     *
     * `polite` and not `assertive`: a roll is worth hearing about and is never urgent
     * enough to interrupt whatever the reader is in the middle of.
     *
     * `top-0` with `items-start` rather than centred in the pane: the roster sits at
     * `bottom-3 right-3` and the zoom controls at `bottom-3 left-3`, so the top strip is
     * the one band over the map with nothing already in it.
     */
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none absolute inset-0 flex items-start justify-center pt-4"
    >
      {subject === null || actorName === null ? null : (
        <div
          className={cn(
            'flex flex-col items-center gap-2',
            leaving ? 'kk-announce-out' : 'kk-announce-in',
          )}
        >
          <div
            // A backdrop rather than a bare glow, because the thing behind this is an
            // uploaded map and could be any colour at all — text with a shadow reads on a
            // dungeon floor and vanishes on a snowfield. The glow is the ring and the
            // shadow around the pill; the words sit on `bg-background/85`, so they read in
            // both themes over anything.
            className="bg-background/85 flex max-w-[36rem] items-center gap-2.5 rounded-full py-1.5 pr-5 pl-1.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-sm"
            style={
              // Only a crit tints the glow, and only once the total is on screen beside it —
              // `crit` above is gated on `revealed` and says at length why. A plain roll
              // gets `shadow-2xl` and nothing else, so the coloured halo means something
              // both when it appears and when it does not.
              colour === null ? undefined : { boxShadow: `0 0 34px -4px ${colour}` }
            }
          >
            {artUrl === null ? (
              // ⚠️ **The silent fallback, and it is a secrecy decision rather than a
              // tidy default.** A roller may have no token at all, or a token on the DM
              // layer that `maySee` dropped from this viewer's payload — and an
              // announcement must never be the thing that reveals a token exists. So
              // "no art" and "no token you may know about" are one indistinguishable
              // case, drawn as the same generated disc, with nothing anywhere that says
              // which. `ProfileIcon` rather than a second disc, so the same actor is the
              // same colour and the same letters here as in the header and the roster.
              <ProfileIcon name={actorName} size="md" />
            ) : (
              <img
                src={artUrl}
                // Decorative: the actor's name is the first thing in the sentence beside
                // it, so alt text would be a screen reader reading the same name twice.
                // The same argument `ProfileIcon` makes for its own `aria-hidden`.
                alt=""
                aria-hidden
                className="size-10 shrink-0 rounded-full object-cover ring-1 ring-black/20"
              />
            )}

            <span className="text-base leading-tight font-semibold">
              {rollSentence(actorName, subject, roll?.expression ?? null)}
              {note === null ? null : (
                // ⚠️ **`rollModeNote` and not the mode**, which is the distinction that
                // function exists to make: `mode` is what was asked for and `dropped` is
                // what happened, and they differ every time somebody leaves a sticky
                // advantage toggle on and rolls damage with it. Printed here rather than
                // left to the feed because two d20s are about to land on the table and
                // nothing else on this screen says why there are two.
                <span className="text-muted-foreground ml-1.5 text-sm font-normal">{note}</span>
              )}
            </span>
          </div>

          {/*
            The result, a beat later — and nothing at all for a roll that has none. A
            passive being declared and an alt-clicked description both arrive with
            `roll === null`, and the sentence *is* the whole announcement for them: there
            is no total, and `TableEffects` throws no dice either.
          */}
          {revealed && roll !== null ? (
            <div className="bg-background/85 kk-announce-in flex items-center gap-3 rounded-full px-5 py-1.5 shadow-2xl ring-1 ring-white/15 backdrop-blur-sm">
              <span className="text-3xl leading-none font-bold tabular-nums">{roll.total}</span>
              {crit === null ? null : (
                // ⚠️ **The one part of a crit that survives `prefers-reduced-motion`.**
                // The shake, the pulse and the sparks are all motion and all suppressed
                // for a reader who has asked for less of it; this is static text in both
                // modes, and it is what guarantees they still know they rolled a 20. See
                // `@/lib/crit` and `CritEffect`.
                <span
                  className="text-sm font-semibold tracking-wide uppercase"
                  // `?? undefined` rather than a second narrowing: `crit` being non-null is
                  // what put this element on screen, so the colour beside it is non-null too
                  // — and inheriting the ordinary ink is the right answer if it ever is not.
                  style={{ color: colour ?? undefined }}
                >
                  {CRIT_LABEL[crit]}
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
})
