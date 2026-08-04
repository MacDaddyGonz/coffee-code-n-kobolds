import { ConvexError } from 'convex/values'

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GAME_NAME_LENGTH,
  MAX_SCENE_NAME_LENGTH,
  collapseWhitespace,
} from './codes'

/**
 * Trims, collapses whitespace, and **rejects** anything blank or over-length
 * rather than truncating it.
 *
 * Rejecting rather than slicing matters for three reasons:
 *
 * 1. A truncated display name is an identity collision. `nameKey` is how a seat
 *    is found, so two players whose names differ only past the cut-off would
 *    land on one seat and the second would silently inherit the first's
 *    character. The identity key is meant to be forgiving about the same person,
 *    never about different people.
 * 2. `String.prototype.slice` counts UTF-16 code units, so cutting mid-emoji
 *    leaves a lone surrogate. Convex requires stored strings to be valid Unicode,
 *    and convex-test does not enforce that — so it would pass locally and fail
 *    against a real deployment.
 * 3. `trim()` before a slice can still leave a trailing space, which quietly
 *    breaks the normalisation contract this function exists to provide.
 *
 * The client sets `maxLength` from the same constants, so a rejection is
 * unreachable through the UI and only fires for input that would corrupt data.
 */
export function requireText(
  raw: string,
  options: { max: number; blank: string; tooLong: string },
): string {
  const value = collapseWhitespace(raw)
  if (!value) {
    throw new ConvexError({ kind: 'BadInput', message: options.blank })
  }
  // UTF-16 length, matching the HTML maxLength the client applies, so the two
  // agree exactly on where the limit is.
  if (value.length > options.max) {
    throw new ConvexError({ kind: 'BadInput', message: options.tooLong })
  }
  // No lone-surrogate check here, and the absence is deliberate rather than an
  // oversight. One was added and then removed: `npm run test:smoke` demonstrated
  // that Convex's **argument** validation rejects a malformed string at the function
  // boundary, before any handler runs, so the check could never fire. This codebase
  // does not keep guards that cannot fail — `leakGuard.test.ts` has two tests whose
  // whole job is proving that point about itself.
  //
  // The place the check is worth having is the browser, where it can say something
  // useful before a round trip: see `hasLoneSurrogate` in lib/codes.ts and its use
  // in `sheetProblem`. And the place the bug actually gets *created* is a client
  // cutting a string to length, which is what `truncateCodePoints` is for.
  return value
}

/**
 * Every user-facing name in the app goes through one of these, so the limit and
 * the wording live in one place rather than being re-inlined at each call site.
 *
 * `blank` is overridable only because creating your own game says "your display
 * name" where joining someone else's says "a display name".
 */
export function requireDisplayName(raw: string, blank = 'Enter a display name.'): string {
  return requireText(raw, {
    max: MAX_DISPLAY_NAME_LENGTH,
    blank,
    tooLong: `Keep your display name to ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
  })
}

export function requireGameName(raw: string): string {
  return requireText(raw, {
    max: MAX_GAME_NAME_LENGTH,
    blank: 'Give the game a name.',
    tooLong: `Keep the game name to ${MAX_GAME_NAME_LENGTH} characters or fewer.`,
  })
}

export function requireCharacterName(raw: string): string {
  return requireText(raw, {
    max: MAX_CHARACTER_NAME_LENGTH,
    blank: 'Give the character a name.',
    tooLong: `Keep the character name to ${MAX_CHARACTER_NAME_LENGTH} characters or fewer.`,
  })
}

/**
 * Insisting on a name for a board is not bureaucracy: the DM picks between scenes
 * by name in a list nobody else can see, and "Untitled" three times over is a
 * list that cannot be used.
 */
export function requireSceneName(raw: string): string {
  return requireText(raw, {
    max: MAX_SCENE_NAME_LENGTH,
    blank: 'Give the scene a name.',
    tooLong: `Keep the scene name to ${MAX_SCENE_NAME_LENGTH} characters or fewer.`,
  })
}

// ─── DUPLICATING A COIN ─────────────────────────────────────────────────────────────
// The naming rule behind *duplicate* and *add five of these*, and the first thing in this
// file the **browser** runs. Everything above is a server-side refusal that throws; the
// four functions below are pure, total and shared, because the add/duplicate dialog renders
// a live preview from `duplicateNames` and `board.duplicateToken` writes from the same
// call. One function, so the names the DM was shown are the names the transaction stores —
// rather than two implementations that agreed on the day they were written.

/**
 * A name ending in a **sequence number**: everything up to the last space, and the digits
 * after it.
 *
 * One pattern serves both `duplicateBase` and `highestNumbered`, and that is the point
 * rather than a saving. Rule one (what the base is) and rule two (what counts towards `n`)
 * have to agree exactly about which trailing digits are a sequence number, and two
 * spellings are two answers: the pair that drifted would either start a run at 1 beside an
 * identical one already on the board, or count towards `n` a name it had just declined to
 * strip.
 *
 * ⚠️ **Both halves of the shape are deliberate.**
 *
 * - The `\S` before the space means a base can be neither empty nor whitespace-ended, so
 *   ` 3` is a name in its own right and not a nameless creature numbered three. Names are
 *   collapsed before they reach this, so a run of spaces cannot smuggle one past it either.
 * - The **six-digit cap** is what decides that a seventh digit is part of the *name*:
 *   `Longsword 1000000` stays called what the DM called it, and `n + count` stays inside
 *   safe integers whatever is on the board. Uncapped, a name ending in twenty digits would
 *   parse to a float so large that `n + 1 === n`, and every copy in the batch would be
 *   named the same thing. A six-digit run is thousands of times `MAX_TOKENS_PER_GAME`, so
 *   nothing legitimate comes anywhere near the cap.
 */
const NUMBERED_NAME = /^(.*\S) (\d{1,6})$/

/**
 * The name a copy's numbering continues from: the source name with **one** trailing
 * ` <digits>` group removed.
 *
 * `Goblin 3` → `Goblin`, so duplicating the third goblin continues the goblins rather than
 * starting a run of `Goblin 3`s. `Goblin` → `Goblin`. `Goblin 3 4` → `Goblin 3`, because
 * exactly one group comes off and not all of them — a DM on their fourth `Goblin 3` meant
 * that, and stripping greedily would fold two runs the board shows as separate into one.
 *
 * Whitespace is collapsed first, so the base of `Goblin 3  ` is `Goblin` rather than
 * `Goblin 3`. A trailing space is not part of any name this app stores (`requireText`
 * above), and a base that carried one would produce `Goblin  4`.
 */
export function duplicateBase(name: string): string {
  const collapsed = collapseWhitespace(name)
  const match = NUMBERED_NAME.exec(collapsed)
  return match ? match[1] : collapsed
}

/**
 * The highest sequence number already in use among the names matching `base`.
 *
 * A name equal to `base` counts as **1** — a lone `Goblin` is the first goblin, so the next
 * one is `Goblin 2`. A name of the form `base <digits>` counts as those digits, anything
 * else counts as nothing, and nothing matching at all is 0. `base` is collapsed on the way
 * in like the names are, so a caller that did not come through `duplicateBase` gets the
 * same answer as one that did.
 *
 * ⚠️ **Matching is exact after `collapseWhitespace` and case-SENSITIVE**, which is the one
 * place naming a coin deliberately differs from naming a seat. `nameKeyFor` is forgiving
 * about case because `Mike` and `mike` are one person rejoining; a coin is not, because a
 * DM who typed `goblin 3` beside `Goblin 3` was distinguishing two creatures, and
 * renumbering across that merges two runs they can see are separate. Exactness cuts the
 * same way: `Goblin King 4` and `Goblinoid 2` contribute nothing to `Goblin`.
 *
 * It is the **highest** and never the first free, so gaps are not filled: with `Goblin 1`
 * and `Goblin 5` on the board the next is `Goblin 6`. Reusing the number of a goblin the DM
 * has just deleted puts a dead creature's name on a live one mid-fight, and the initiative
 * order is the last place anybody wants to work out which `Goblin 3` is which.
 */
export function highestNumbered(base: string, names: readonly string[]): number {
  const wanted = collapseWhitespace(base)
  let highest = 0
  for (const raw of names) {
    const name = collapseWhitespace(raw)
    if (name === wanted) {
      highest = Math.max(highest, 1)
      continue
    }
    const match = NUMBERED_NAME.exec(name)
    if (match && match[1] === wanted) highest = Math.max(highest, Number(match[2]))
  }
  return highest
}

/**
 * The names N new coins should take. **The one function the preview and the write share.**
 *
 * The roadmap's three sentences, in order: the base is the source name with one trailing
 * number removed (`duplicateBase`); `n` is the highest number already in use
 * (`highestNumbered`); and the numbering is **skipped entirely** when a single coin is
 * added and the base is not on the board at all, so adding one `Goblin` to a board that
 * has none gets `Goblin` and not `Goblin 1`.
 *
 * ⚠️ **That third sentence is one word away from what the roadmap wrote**, which said the
 * skip applies while nothing is *numbered*. See the note inside the body: both readings
 * give `Goblin` for the case the roadmap describes, and only this one avoids handing a
 * second coin the name the first one already has.
 *
 * ⚠️ **Adding N from scratch and duplicating an existing coin produce different first
 * numbers, and both are correct.** Nothing called `Goblin` exists yet when five are added,
 * so `n` is 0 and they are `Goblin 1 … Goblin 5` — the roadmap's acceptance line.
 * Duplicating a `Goblin` that is already standing there counts it as 1, so four copies are
 * `Goblin 2 … Goblin 5`. The difference is entirely that **the source is never renamed**:
 * a new run starts at 1, and an existing one continues past what is on the board. The rule
 * that gave `Goblin 1 … Goblin 5` in both cases would have to rename the source, which is a
 * write to a coin the DM did not ask to change, a re-push of `board.tokens` to the whole
 * table, and a bound sheet whose name no longer matches its coin.
 *
 * **Pure and total — no throw, no `ctx`, no read**, because the dialog calls it on every
 * press of the stepper and the mutation calls it once inside the transaction. A count of
 * zero or less yields no names rather than an error, and the cap is `MAX_DUPLICATE_COUNT`,
 * enforced by the mutation rather than here: a preview has to render whatever the control
 * currently says, including a number the write is about to refuse.
 */
export function duplicateNames(
  sourceName: string,
  existingNames: readonly string[],
  count: number,
): string[] {
  const base = duplicateBase(sourceName)

  const n = highestNumbered(base, existingNames)

  // ⚠️ **The skip asks whether anything matching the base is on the board at all — bare or
  // numbered — and the roadmap's wording said "nothing is numbered yet", which is a
  // different question and a wrong one.**
  //
  // Both readings agree on the case the roadmap describes, which is why the difference is
  // easy to miss: adding one coin called `Goblin` to a board that has none gets `Goblin`
  // and not the lonely `Goblin 1`, because nothing matches under either rule. They diverge
  // on the one act the roadmap did not think about, and there the narrower reading is
  // plainly broken: **duplicating a lone `Goblin` would produce a second coin also called
  // `Goblin`**, since nothing is numbered yet — and pressing duplicate again would produce
  // a third, because nothing ever becomes numbered. The run could never start from single
  // presses, and the DM would be left with three identical coins in the initiative order.
  //
  // `highestNumbered` is exactly the discriminator, and it needs no second scan: it counts
  // a bare base as 1, so it answers 0 only when the base is genuinely unused. Which is also
  // the honest statement of what separates the two acts — **the add dialog passes a name it
  // is about to create and the duplicate control passes a name that is already standing
  // there**, so "is this base on the board?" is precisely the question that tells them
  // apart, and the source never being renamed is what makes the answer stable.
  if (count === 1 && n === 0) return [base]

  return Array.from({ length: count }, (_, index) => `${base} ${n + index + 1}`)
}

/**
 * The over-length refusal for a batch of names, or `null`.
 *
 * Shared so both sides refuse the same set. A preview listing five names the write then
 * rejects is a dialog that lies; a preview refusing a batch the write would have taken is a
 * feature the DM cannot reach. One function, one answer.
 *
 * ⚠️ **It refuses rather than truncating**, and `requireText` at the top of this file
 * carries that argument in full — `String.prototype.slice` counts UTF-16 code units, so a
 * cut can leave half an emoji behind, Convex requires stored strings to be valid Unicode,
 * and convex-test does not enforce it. Milestone 1 shipped exactly that bug and
 * `npm run test:smoke` exists because of it. Numbering is what makes it live here rather
 * than theoretical: the DM never typed `Goblin 10`, the app did, so there is no field whose
 * `maxLength` could have stopped it on the way in.
 *
 * Length is UTF-16 `.length` for the same reason `requireText` measures it that way — the
 * name field's `maxLength`, this check and the server's refusal then agree exactly on where
 * the limit is.
 *
 * The message names the fix. *That name is too long* is a dead end when the name the DM is
 * looking at fits perfectly well and it is the number the app added that does not.
 */
export function duplicateNamesProblem(names: readonly string[]): string | null {
  if (!names.some((name) => name.length > MAX_CHARACTER_NAME_LENGTH)) return null
  return `Numbering the copies would take a name past ${MAX_CHARACTER_NAME_LENGTH} characters. Give the coin a shorter name first.`
}

/**
 * The names **`board.addToken`** will write, for a name somebody has **typed**.
 *
 * ⚠️ **A sibling of `duplicateNames` rather than a flag on it, and the divergence lives
 * here rather than in the mutation.** The two acts differ in one way that matters: a
 * duplicate derives its names from a coin already standing on the board, and an add is
 * given a name a person just wrote down. So **one coin keeps exactly what was typed** —
 * trailing number and all — and only a *batch* is numbered, because the second through
 * fifth of it are coins nobody named.
 *
 * `npm run test:smoke` is what found this: routing a typed name through `duplicateNames`
 * hits its skip case, which returns the *base*, so `Kobold of the Arch 3` was stored as
 * `Kobold of the Arch` and a trailing number could not be created at all.
 *
 * ⚠️ **The first fix put the `count === 1` branch inside the mutation, and that was the
 * wrong altitude — it is the reason this function exists.** `duplicateNames` claims to be
 * *the one function the preview and the write share*, and a branch on only one side of the
 * wire makes that false: the dialog went on previewing `Goblin 2` for an add the server
 * would store as `Goblin`, and `duplicateNamesProblem` could disable a submit for a batch
 * the server would have accepted. Both callers now ask this, so the sentence is true again.
 *
 * `collapseWhitespace` rather than the raw string, because that is what `requireText`
 * stores and a preview must show the name that will exist.
 */
export function addedNames(
  typedName: string,
  existingNames: readonly string[],
  count: number,
): string[] {
  if (count === 1) return [collapseWhitespace(typedName)]
  return duplicateNames(typedName, existingNames, count)
}
