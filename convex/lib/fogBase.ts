// WHAT A SCENE STARTS AS — lit, and you black areas out, or dark, and you light areas up.
// The union a scene's `fogBase` field holds, and the two questions asked about it. Shared
// verbatim by the Convex functions and the browser, like lib/layers.ts and lib/grid.ts, and
// for the same reason: a base the two sides each spell for themselves is two unions.
//
// ⚠️ **What lives here is vocabulary and two pure predicates. The decision does not.**
// `veiled` — the function that reads a `Doc<'tokens'>` and a placement and answers whether
// this caller may be told where it is — stays in lib/board.ts, because that is the module
// CLAUDE.md invariant 8 names as the one reader of the two token tables. What is here is a
// function of a *string*, which no caller can turn into a row.
//
// ⚠️⚠️ **THIS FILE HOLDS TWO DEFAULTS THAT POINT IN OPPOSITE DIRECTIONS, AND BOTH ARE
// RIGHT.** They are the single most confusing thing about the fog base and the thing somebody
// will eventually "fix", so they are stated together here and again on each function:
//
//   - **An absent base means LIT** — `fogBaseOf` in lib/scenes.ts. Absence is *history*: every
//     scene stored before this feature existed was calibrated under the lit model, and
//     defaulting them to dark would black out every map in every game on the schema push.
//   - **An unrecognised base means DARK** — `startsCovered` below. A schema push is not
//     atomic, so a row written by a newer deployment can be read by an older one, and in that
//     window a scene must read as *more* hidden rather than less. `isMonsterSheet`'s terms,
//     emphatically not `groupOf`'s tolerant ones.
//   - **An unrecognised anything means STAMP** — `fogActReveals` below, which is the opposite
//     direction from every other fail-closed default in this codebase and has its own
//     argument on the function.
//
// *Absent* and *unrecognised* are different questions, which is why they get different
// answers and why they are two accessors rather than one.

import { v } from 'convex/values'

/**
 * The two bases a scene can have, spelled once.
 *
 * `lit` first because it is what every scene stored before this feature is, and because the
 * order is the one the DM's picker paints — a two-member vocabulary the renderer iterates,
 * so the array *is* the button order.
 */
export const FOG_BASES = ['lit', 'dark'] as const
export type FogBase = (typeof FOG_BASES)[number]

/**
 * The same two members as a Convex validator, **hand-spelled rather than derived from the
 * array above**, and the duplication is deliberate for `tokenLayerValidator`'s reason
 * exactly.
 *
 * Every refusal in this file and on the client fires when a member is added to `FOG_BASES`;
 * none of them fires when a literal is added to the *validator* alone — and that is the
 * failure that matters, because the schema would then accept and store a base nothing can
 * answer `startsCovered` for. `lib/fogBase.test.ts` pins the two against each other for
 * membership and order.
 */
export const fogBaseValidator = v.union(v.literal('lit'), v.literal('dark'))

/**
 * Whether a map starts lit or starts covered. **The only reader of the optional field**, and
 * the only place the default is spelled.
 *
 * ⚠️ **It takes the stored value rather than the `Doc<'scenes'>`, unlike `backgroundOf` beside
 * it in lib/scenes.ts, and that is forced rather than chosen.** `lib/board.ts` has to ask this
 * question — it is the module invariant 8 makes the sole reader of the token tables, and the
 * fog crossing happens there — while `lib/scenes.ts` already imports `deleteScenePlacements`
 * *from* `lib/board.ts`. An accessor over the document would close that cycle. A function of a
 * string closes nothing, which is the same reason `maySeeLayer` lives in lib/layers.ts and
 * `maySee` does not. `layerOf` took a raw value for exactly this reason too.
 *
 * ⚠️⚠️ **ABSENT MEANS LIT, AND THAT IS THE OPPOSITE ANSWER FROM `startsCovered`'s UNRECOGNISED
 * CASE — DELIBERATELY.** Absence is **history**: every scene stored before this field existed
 * was calibrated under the lit model, its fog was drawn as darkness, and defaulting them to
 * dark would black out every map in every game on the schema push. An unrecognised value is a
 * different question — a row from a deployment that is ahead of this one — and there the safe
 * answer is *more* hidden. Two questions, two answers, and neither is a default for the other.
 * The file header says this once more, at length.
 */
export function fogBaseOf(stored: FogBase | undefined): FogBase {
  return stored ?? 'lit'
}

/**
 * Does this base start the map hidden? **The predicate the whole feature turns on.**
 *
 * Under `lit`, a drawn shape *is* the darkness and everything else is visible — the model
 * fog shipped with. Under `dark` the map begins covered and a drawn shape is a **hole** in
 * it, which is Roll20's model and what a dungeon crawl actually wants.
 *
 * ⚠️ **The runtime default is fail-closed: covered.** Same direction as `maySeeLayer`'s
 * `false` and `isMonsterSheet`'s `true`, and for the same operational reason. A schema push
 * is not atomic across a deployment: a scene written by a newer deployment can be read by an
 * older one for the seconds in between, and in that window this function is handed a base it
 * has never heard of. Getting it wrong this way costs a map that is dark for a few seconds;
 * getting it wrong the other way publishes the position, the health band and the feed lines
 * of everything the DM had hidden.
 *
 * ⚠️ **Read the file header before changing this to match `fogBaseOf`.** That accessor
 * answers *lit* and this one answers *dark*, and they are not inconsistent — they are
 * answering "the field is absent" and "the field says something I do not recognise", which
 * are different questions with different safe answers.
 */
export function startsCovered(base: FogBase): boolean {
  switch (base) {
    case 'lit':
      return false
    case 'dark':
      return true
    default: {
      const unknownBase: never = base
      void unknownBase
      return true
    }
  }
}

/** The three writes that change what is covered. `fogActReveals` is a question about these. */
export const FOG_ACTS = ['draw', 'erase', 'clear'] as const
export type FogAct = (typeof FOG_ACTS)[number]

/**
 * Which acts make **more** of the map hidden, per base — the whole inversion in six cells.
 *
 * Under a lit base a shape is the dark, so drawing one covers. Under a covered base a shape
 * is a hole in the dark, so drawing one reveals and rubbing one out covers back up. `clear`
 * follows `erase` because it is `erase` applied to everything at once.
 *
 * A `Record<FogBase, Record<FogAct, boolean>>` rather than a nested `switch`, because it puts
 * **both** compile-time refusals in one place: a third base needs a row and a fourth act needs
 * a cell in every row, and `npm run lint` names them. A nested switch would give the same
 * guarantee and three copies of the same runtime default, which is three places to get the
 * direction wrong.
 */
const COVERS: Record<FogBase, Record<FogAct, boolean>> = {
  lit: { draw: true, erase: false, clear: false },
  dark: { draw: false, erase: true, clear: true },
}

/**
 * Does this act **widen** what the table may know, and therefore owe a `stampReveal`?
 *
 * ⚠️⚠️ **THE HIGHEST-VALUE INVERSION IN THE FOG BASE, AND THE EASIEST TO GET BACKWARDS.**
 * `convex/fog.ts` used to state the rule directly in its header: two of these functions widen
 * an audience and one narrows it, so the reveal timestamp is on `erase` and `clear` and
 * deliberately not on `draw`. **That is a statement about a lit base and is exactly backwards
 * under a dark one.** Get it wrong and rubbing out a reveal replays a session's worth of rolls
 * across the map — the failure ADR 0012 built the timestamp to prevent, arriving through the
 * mechanism it built.
 *
 * ⚠️ **Both runtime defaults here point at STAMP, which is the opposite direction from every
 * other fail-closed default in this codebase, and that is not an oversight.** Every other one
 * defaults to *withhold*, because a wrong answer publishes a secret. This one publishes
 * nothing at all: `revealedAt` decides whether a feed row arrives with a flourish over the map
 * or arrives quietly, and every one of those rows was already readable or already withheld
 * before this function was asked. So the two costs are **a stamp too many, which is one
 * missing flourish**, and **a stamp too few, which replays an evening**. There is no version
 * of this where withholding is the cautious answer.
 *
 * Do not "fix" this to match `startsCovered` above. They guard different things and the file
 * header says so.
 */
export function fogActReveals(act: FogAct, base: FogBase): boolean {
  switch (base) {
    case 'lit':
    case 'dark':
      // `?? false` for an act the table has never heard of: not-covering reads as revealing,
      // which lands on the stamp — the same direction as the arm below.
      return !(COVERS[base][act] ?? false)
    default: {
      const unknownBase: never = base
      void unknownBase
      return true
    }
  }
}

/**
 * What the DM's controls call each base, and what each one warns about.
 *
 * One record, not several, for the reason `TOKEN_LAYER_LABELS` gives: a third base should fail
 * to compile in one place rather than in three, whichever of them somebody fixes first.
 *
 * `hint` is the sentence beside the control rather than a per-screen aside, because there is
 * only one screen that switches a base and the warning — *flipping does not delete anything* —
 * is a fact about the mutation rather than about the panel.
 */
export const FOG_BASE_LABELS: Record<FogBase, { label: string; hint: string }> = {
  lit: {
    label: 'Lit',
    hint: 'The map is visible and the areas you draw are blacked out.',
  },
  dark: {
    label: 'Dark',
    hint: 'The map starts covered and the areas you draw are revealed.',
  },
}
