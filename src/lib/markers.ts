// How a condition is drawn on a coin, in one place: the letter, the colour, and how
// many of them fit under a disc of a given size on screen.
//
// The vocabulary itself is server-side — `@convex/lib/markers` owns the list and the
// words — and this module owns nothing but appearance, which is `health.ts`'s
// arrangement applied to conditions. Nothing here decides anything: a marker is a
// label, no roll consults one, no band is computed from one, no drag is refused
// because of one. That promise is the whole design of the feature and it is kept on
// the server; this file is what a client is allowed to know about it.
//
// Deliberately free of React and Konva imports, like `camera.ts` and `health.ts`, so
// the pips can be drawn on the canvas and the same colours reused in HTML — and so
// this is testable as arithmetic rather than through a rendered component.

import { normaliseMarkers } from '@convex/lib/markers'
import type { TokenMarker } from '@convex/lib/markers'

/**
 * The five families a condition can belong to, as colours.
 *
 * Named constants rather than seventeen literals in the record below, because the
 * reasoning is about the *family* and belongs in one place: the colour is what a
 * reader actually decodes at this size, and the letter only disambiguates within
 * whichever family the colour already picked out. Seventeen inline hexes would be
 * seventeen chances for a family to quietly acquire two shades of amber.
 *
 * Red is *cannot act at all*, which is the one a player has to see from across the
 * table; amber is *impaired but still playing*; blue is *movement*, which is the
 * family the requirements exclude the mechanics of and include the word for; violet
 * is a *state* that is neither a penalty nor a restriction; and near-black is dead,
 * alone, because it is not a degree of anything.
 */
export const PIP_CANNOT_ACT = '#dc2626'
export const PIP_IMPAIRED = '#d97706'
export const PIP_MOVEMENT = '#2563eb'
export const PIP_STATE = '#7c3aed'
export const PIP_DEAD = '#111827'

/**
 * One white ink for all five fills.
 *
 * This is `TokenHealthBar`'s argument for one label ink over four, and it transfers
 * cleanly: the five fills above are chosen dark enough that white reads on every one
 * of them — run each through `readableInk` in `@/lib/avatar` and all five answer
 * white, with the lightest (amber) at a luma of 0.53 against a 0.6 threshold — so a
 * per-fill ink would be a second table to keep in step with the first for no gain,
 * and its failure mode is a pip that has gone invisible on exactly one condition.
 */
export const PIP_INK = '#ffffff'

/**
 * The letter and the colour for each condition.
 *
 * ⚠️ **A pip is a reminder, not a label.** A single letter at seven screen pixels
 * cannot be authoritative and is not asked to be: the colour separates the five
 * families and the glyph disambiguates *within* one, so `P` amber and `N` blue are
 * telling you which of two words you already half-expected. The **authoritative**
 * reading is in words, twice — the DM's editor section and the board menu's checkbox
 * list both print `TOKEN_MARKER_LABELS` — and it is that second surface which makes
 * one hand-picked letter defensible rather than sloppy. Nobody has to learn this
 * alphabet to play; they have to be able to tell *poisoned* from *prone* at a glance
 * once they have ticked one of them.
 *
 * **Hand-picked, because first letters collide four ways.** `P` alone wants
 * paralyzed, petrified, poisoned and prone; `C` wants charmed and concentrating; `D`
 * wants dead and deafened; `I` wants incapacitated and invisible. So the rule is: the
 * most-used member of a colliding set keeps its initial, and the others take a
 * distinctive letter from inside the word rather than a digraph or a symbol — one
 * character is all the room there is.
 *
 * | marker | glyph | why not the initial |
 * | --- | --- | --- |
 * | blinded | `B` | uncontested |
 * | charmed | `C` | keeps `C`; the more common of the pair |
 * | concentrating | `O` | c-**o**-ncentrating, and a ring is the shape of the thing |
 * | dead | `D` | keeps `D`; the one nobody may misread |
 * | deafened | `A` | de-**a**-fened |
 * | exhaustion | `X` | e-**x**-haustion |
 * | frightened | `F` | uncontested |
 * | grappled | `G` | uncontested |
 * | incapacitated | `I` | keeps `I` |
 * | invisible | `V` | in-**v**-isible |
 * | paralyzed | `Z` | paraly-**z**-ed |
 * | petrified | `E` | p-**e**-trified |
 * | poisoned | `P` | keeps `P` — the most-used of the four contenders |
 * | prone | `N` | pro-**n**-e |
 * | restrained | `R` | uncontested |
 * | stunned | `S` | uncontested |
 * | unconscious | `U` | uncontested |
 *
 * All seventeen are distinct, and the test asserts that rather than trusting the
 * table above to have been read carefully — a repeated letter is the one error here
 * that looks entirely fine in a diff.
 */
export const TOKEN_MARKER_PIPS: Record<TokenMarker, { glyph: string; fill: string }> = {
  blinded: { glyph: 'B', fill: PIP_IMPAIRED },
  charmed: { glyph: 'C', fill: PIP_IMPAIRED },
  concentrating: { glyph: 'O', fill: PIP_STATE },
  dead: { glyph: 'D', fill: PIP_DEAD },
  deafened: { glyph: 'A', fill: PIP_IMPAIRED },
  exhaustion: { glyph: 'X', fill: PIP_IMPAIRED },
  frightened: { glyph: 'F', fill: PIP_IMPAIRED },
  grappled: { glyph: 'G', fill: PIP_MOVEMENT },
  incapacitated: { glyph: 'I', fill: PIP_CANNOT_ACT },
  invisible: { glyph: 'V', fill: PIP_STATE },
  paralyzed: { glyph: 'Z', fill: PIP_CANNOT_ACT },
  petrified: { glyph: 'E', fill: PIP_CANNOT_ACT },
  poisoned: { glyph: 'P', fill: PIP_IMPAIRED },
  prone: { glyph: 'N', fill: PIP_MOVEMENT },
  restrained: { glyph: 'R', fill: PIP_MOVEMENT },
  stunned: { glyph: 'S', fill: PIP_CANNOT_ACT },
  unconscious: { glyph: 'U', fill: PIP_CANNOT_ACT },
}

/**
 * Screen pixels, divided by the scale at the point of drawing so they hold at any
 * zoom — the discipline `TokenCoin` and `TokenHealthBar` already keep, and for the
 * same reason: a pip that scaled with the coin would be a speck on a goblin and a
 * saucer on a dragon, when what it has to be is legible on both.
 *
 * The row sits **below** the coin, between the rim and the name, which is the last
 * unoccupied strip: the bar owns the space above (`BAR_GAP`), the hidden-from-party
 * mark owns the upper-right shoulder, and the name owns what is below the row.
 *
 * ⚠️ **These grew, and `COIN_DETAIL_MIN_DIAMETER` had to grow with them.** They shipped at
 * 10 px with a 7 px glyph, which is legible on a screenshot and not across a table — and
 * the request that moved them was to make a condition read like the armour-class circle
 * beside it, so they are now the same size as one. What that costs is spelled out under
 * `pipCapacity`: the threshold at which a coin shows any detail at all rises from 26 to 30,
 * so detail appears at a slightly higher zoom than it used to. That is a real behaviour
 * change rather than a rounding, and it is an acceptance criterion so it cannot be quietly
 * put back.
 */
export const PIP_DIAMETER = 14
export const PIP_GAP = 2
/** Coin rim → row top. */
export const PIP_ROW_GAP = 3
/** Row bottom → name top. */
export const PIP_NAME_GAP = 2
export const PIP_FONT_SIZE = 9
export const PIP_STROKE = 1

/**
 * How much vertical room a row of pips takes, in screen pixels.
 *
 * Exported so `TokenCoin` can push the name down by exactly this, and the coupling
 * between the two files is a named constant rather than two arithmetic expressions
 * that agreed on the day they were written. A row that grew here and not there is a
 * name printed through the pips, on every coin with a condition on it.
 */
export const MARKER_ROW_SCREEN_HEIGHT = PIP_ROW_GAP + PIP_DIAMETER + PIP_NAME_GAP

/**
 * Centre-to-centre spacing: a pip plus the gap that follows it.
 *
 * Exported for the same reason MARKER_ROW_SCREEN_HEIGHT is: the renderer needs the step
 * between two pips, and deriving it there from the two constants separately is the
 * two-files-agreeing-by-arithmetic failure this module argues against four lines above.
 */
export const PIP_UNIT = PIP_DIAMETER + PIP_GAP

/**
 * How many pips fit across a coin drawn this many screen pixels wide.
 *
 * `n` pips need `n * PIP_DIAMETER + (n - 1) * PIP_GAP` across, which rearranges to
 * the `+ PIP_GAP` in the numerator — the trailing gap that the last pip does not
 * need. So 30 px holds 2, 46 holds 3, 62 holds 4, 94 holds 6, 174 holds 11, and 270
 * holds all seventeen.
 *
 * ⚠️ **`capacity >= 2` is guaranteed at every size this is ever called at, and the
 * guarantee is a coupling between two constants in two files.** `TokenCoin` draws
 * none of this except behind `showDetail`, which is `diameter * scale >=
 * COIN_DETAIL_MIN_DIAMETER` — 30, exported from `TokenHealthBar.tsx` — and two pips
 * need 30. The dependency is therefore
 *
 *     COIN_DETAIL_MIN_DIAMETER >= 2 * PIP_DIAMETER + PIP_GAP     // 30 >= 30
 *
 * and `markers.test.ts` asserts it, so somebody lowering that threshold to 20 to get
 * names onto smaller coins finds out here rather than discovering a board of bare
 * `+4` counters. The arithmetic below still handles a capacity of one and of zero,
 * because a guaranteed precondition that is only guaranteed by a caller is one
 * refactor away from being false, and the answers are cheap.
 *
 * ⚠️ **It used to be 26 >= 22 and is now exactly equal, which is a tighter place to
 * sit and is deliberate.** The pips grew to match the armour-class circle, and the
 * threshold was raised to the smallest number that still holds two of them — rather
 * than to a comfortable 34, which would have hidden detail on coins that can perfectly
 * well carry it. The consequence of *equality* is that raising `PIP_DIAMETER` by one
 * more pixel now breaks the assertion immediately instead of after four, which is the
 * behaviour worth having: the next person to enlarge a pip is told in the same commit.
 */
export function pipCapacity(drawnDiameter: number): number {
  // A non-finite width reaches this from a zero viewport during the first layout
  // pass, the same way `clampScale` gets a NaN scale. Nothing to draw is the right
  // answer for one frame; `Math.floor(Infinity)` is not.
  if (!Number.isFinite(drawnDiameter) || drawnDiameter <= 0) return 0
  return Math.floor((drawnDiameter + PIP_GAP) / PIP_UNIT)
}

/**
 * What to draw on this coin, and how many conditions were left out of it.
 *
 * ⚠️ **The narrowing is `normaliseMarkers`, imported rather than rewritten — and this
 * used to be a second copy of it.** That function iterates the vocabulary and
 * intersects, never mapping over the stored array, and its own docblock says it runs in
 * three places: the write path, the server projection and **here**. A local
 * reimplementation made that sentence false the day it was written, and left two
 * spellings of one fail-closed rule to drift — which is exactly the failure the rule
 * exists to prevent, one level up.
 *
 * What it is for: an **older bundle reading a newer deployment**. GitHub Pages serves a
 * cached bundle, a Convex `returns:` validator has already approved a marker this
 * browser's union has never heard of, and it arrives in the array. Mapping the stored
 * array would take that string to a `TOKEN_MARKER_PIPS` lookup inside JSX, read
 * `undefined.glyph` and take down the whole board — every coin, not just the goblin
 * somebody ticked. Intersecting drops it silently, which is exactly right for a label
 * that adjudicates nothing.
 *
 * ⚠️ **`stored` is `readonly string[]` and not `TokenMarker[]`, deliberately** — the same
 * signature `normaliseMarkers` keeps, for the same reason. A `TokenMarker[]` parameter
 * would make the paragraph above unwriteable in a test, because the compiler would refuse
 * the one input the function exists to survive, and a guard with no failing case is a
 * guard that gets deleted.
 *
 * **The order is `TOKEN_MARKERS`' own, which is alphabetical.** So *which* markers
 * survive a collapse is arbitrary but **stable, and identical on every screen at the
 * table** — which is the property that matters. There is deliberately no severity
 * ranking: it would be a second ordering to define, defend and keep in step with the
 * vocabulary, and a DM and a player looking at the same goblin and seeing different
 * three pips is a worse table than an alphabetical choice nobody has to agree with.
 *
 * The overflow number is drawn by the caller as a `+n` counter occupying the last
 * slot, which is why a collapse shows `capacity - 1` pips rather than `capacity`.
 */
export function markerRow(
  stored: readonly string[],
  drawnDiameter: number,
): { shown: TokenMarker[]; overflow: number } {
  const present = normaliseMarkers(stored)
  if (present.length === 0) return { shown: [], overflow: 0 }

  const capacity = pipCapacity(drawnDiameter)
  if (capacity <= 0) return { shown: [], overflow: 0 }
  if (present.length <= capacity) return { shown: present, overflow: 0 }
  // One slot, and more than one condition to put in it: the counter takes it, and
  // `+3` is a truer thing to say than one arbitrary letter with the rest unmentioned.
  if (capacity <= 1) return { shown: [], overflow: present.length }

  const shown = present.slice(0, capacity - 1)
  return { shown, overflow: present.length - shown.length }
}
