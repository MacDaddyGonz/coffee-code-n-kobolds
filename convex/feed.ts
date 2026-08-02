import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireEditableCharacter } from './lib/access'
import { readableCharacterIds } from './lib/characters'
import { NO_MODIFIERS, cryptoDice, evaluateRoll, modifiersFor } from './lib/dice'
import { publicFeedValidator, visibleFeed, writeFeedRow } from './lib/feed'
import { findGameByCode, resolveDmAccess } from './lib/games'
import { getSeatInGame } from './lib/players'
import { resolveSheet } from './lib/resolve'
import { partsFor, rollModeValidator, rollRequestValidator } from './lib/roll'
import type { FeedSubject, RollRequest } from './lib/roll'
import type { CharacterSheet, PcSheet, SheetEntry } from './lib/sheet'
import {
  ROLL_MODIFIER_TOKENS,
  abilityModifier,
  categoryOf,
  initiativeBonusOf,
  normaliseRoll,
  rollProblem,
  savingThrowBonus,
  sheetEntriesOf,
  skillProficienciesOf,
  toHitFromBonus,
  toHitOf,
} from './lib/sheet'
import { skillBonus } from './lib/skills'

// Not one row of the `feed` table is read or written in this file. Every read goes
// through lib/feed.ts, because `Ancient Red Dragon attacks with their Bite` has exactly
// the shape of a line about a hero and so no `returns:` validator can catch a leaked row
// — only a single reader handed a set of ids that has already been filtered can
// (CLAUDE.md invariant 8). A test greps these sources to keep it that way.
//
// What this file holds instead is the two things that module deliberately does not: the
// **gate**, because this is where the game code and the DM code arrive, and the place a
// `FeedSubject` is **built**, because a subject is assembled from the stored sheet and
// from nothing the caller sent. lib/roll.ts records the coherence rule that follows from
// being the one builder — `subject.text` is populated only when the part is `'text'` —
// as an invariant with a test, since no validator can express it.
//
// Nor is one row of `characters` or `tokens` read here. `readableCharacterIds` and
// `visibleCharacterIds` are the two narrow crossings, and a `Set` of character ids is
// the widest thing that comes back from either.

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * A private roll needs the DM code. **An explicit refusal rather than a silent
 * downgrade**, and the one distinguishable refusal in this file on purpose.
 *
 * The alternative — quietly treating an unauthorised `dmOnly` as `false` — is the worse
 * failure in exactly the case the flag exists for. A DM whose browser has lost its code
 * (a refresh in a private window, a recovery not yet done) clicks *roll privately* on
 * tonight's dragon and has the line published to the whole table, with the interface
 * still showing the toggle they set. A refusal costs them one confused moment; the
 * downgrade costs them the ambush.
 *
 * ⚠️ **Distinguishable, and that is safe here rather than an exception being made.** The
 * surrounding code goes to considerable lengths to make refusals *in*distinguishable —
 * `TOKEN_NOT_FOUND` and `CHARACTER_NOT_FOUND` are shared constants precisely so that a
 * caller cannot use the error channel as an existence oracle for the DM layer. Nothing
 * sits behind this one: it is asked before any character is looked up, its answer is a
 * fact the caller already knows (*do I hold this game's DM code?*), and it reveals
 * nothing whatever about what is in the game. `games.checkDmCode` hands out the same
 * bit to anyone who asks for it. So the reasoning is not "this refusal is worth the
 * leak" but "there is no leak to weigh".
 */
function requirePrivacyAllowed(isDm: boolean, dmOnly: boolean): void {
  if (dmOnly && !isDm) {
    throw new ConvexError({
      kind: 'NotDm',
      message: 'Only the DM can roll privately. Check the DM code is still in this browser.',
    })
  }
}

/**
 * The hero this roll needs, or a refusal the DM can act on.
 *
 * `check`, `save` and `skill` are the three requests that read numbers a reduced sheet
 * does not have: a creature carries no ability scores, no saving-throw proficiencies and
 * no level, so `abilityModifier`, `savingThrowBonus` and `skillBonus` have nothing to
 * work from. Refused rather than answered with a zero, which is the one thing that must
 * not happen — `+0` is a number the feed then prints as though somebody had rolled it.
 *
 * Contrast `modifiersFor`, which *does* answer zero for a token on a creature and says
 * why: there the expression is stored content and the roll is happening regardless, so
 * `1d8+0` spelled out in full is the honest report of a content bug. Here there is no
 * expression yet and no roll to salvage, so the honest answer is that the button should
 * not have been pressed.
 *
 * The message names the way forward rather than the missing field, because the caller is
 * the DM: a creature's numbers are on its own actions, and anything else is the dice
 * tray.
 */
function requireHeroSheet(sheet: CharacterSheet, missing: string): PcSheet {
  if (sheet.kind === 'pc') return sheet
  throw new ConvexError({
    kind: 'BadInput',
    message: `A creature's sheet has no ${missing}. Roll one of its actions, or type the dice into the tray.`,
  })
}

/**
 * A roll the entry was supposed to carry, or a refusal.
 *
 * **A backstop rather than a path.** `entriesProblem` refuses a weapon with no to-hit
 * and an action with no roll on the *write* path, where a person is present to be told,
 * and both corpora go through it — so a stored entry reaching here without the
 * expression its category promises is a document written by a deployment this one has
 * not heard of, or a schema push read mid-rollout. Written anyway because the
 * alternative is `evaluateRoll(null)` and a crash inside the mutation a click fires.
 */
function requiredRoll(expression: string | null, entry: SheetEntry, missing: string): string {
  if (expression !== null) return expression
  throw new ConvexError({
    kind: 'BadInput',
    message: `${entry.name} has no ${missing} on it.`,
  })
}

// ---------------------------------------------------------------------------
// What was clicked, resolved against what is stored
// ---------------------------------------------------------------------------

/** The two things a request resolves to. `expression` is null for a line with no dice. */
type PlannedRoll = { subject: FeedSubject; expression: string | null }

/**
 * WHAT THE CALLER ASKED FOR, ANSWERED OFF THE SHEET — the one place a `FeedSubject` is
 * built, and the whole of the asymmetry lib/roll.ts describes between a request and a
 * subject.
 *
 * A request names an entry by its **id** and says which part was clicked, and nothing
 * else; everything that reaches the table — the name, the category, the spell level, the
 * text, the expression itself — is read out of the stored sheet here. So there is no
 * field a client can use to announce a weapon it does not have, roll a die the sheet does
 * not carry, or put words in a creature's mouth.
 *
 * ⚠️ **One `switch` with a `never` arm**, which is CLAUDE.md invariant 9's discipline
 * applied to the fifth union this codebase turns on. A sixth request kind fails
 * `npm run lint` here rather than reaching `writeFeedRow` as a subject nobody chose. The
 * runtime default is unreachable and says so, exactly as `rollShapeOf`'s does: nothing
 * behind this discriminator is a secret — `requireEditableCharacter` refused the whole
 * character before anybody asked what was clicked on it — so the compile-time refusal is
 * the whole of the guard.
 *
 * ⚠️ **Every d20 is built by `toHitFromBonus`, and it is reused rather than reinvented.**
 * Four of the five arms need `1d20` plus a bonus, and the naive
 * `` `1d20+${bonus}` `` is wrong twice: a negative bonus becomes `1d20+-2`, and a zero
 * becomes `1d20+0`, which `ROLL_PATTERN` **accepts** — `\d{1,3}` matches `0` — so the
 * grammar is not the guard there. That function's own ⚠️ says so and `scaleRoll` refuses
 * `+0` at the identical point for the identical reason. Reusing it also means the roll a
 * hero's sheet displays and the roll the server evaluates come out of one function.
 *
 * **`initiative` deliberately serves a creature as well as a hero, and that is Milestone
 * 9's third open decision answered by Milestone 3.** `initiativeBonusOf` already knows
 * both answers — Dexterity for a `pc`, the stored `initiativeBonus` for a creature,
 * because a reduced sheet has no Dexterity to consult — so there is nothing here to
 * decide and no reason to refuse the DM the one roll they make for every monster in the
 * game. Note the contrast with the three arms above it: those are refused *because* the
 * number does not exist on a creature, and this one is allowed *because* it does.
 */
function planRoll(sheet: CharacterSheet, request: RollRequest): PlannedRoll {
  switch (request.kind) {
    case 'entry':
      return planEntryRoll(sheet, request)
    case 'check': {
      const hero = requireHeroSheet(sheet, 'ability scores')
      return {
        subject: { kind: 'check', ability: request.ability },
        expression: toHitFromBonus(abilityModifier(hero.abilities[request.ability])),
      }
    }
    case 'save': {
      const hero = requireHeroSheet(sheet, 'saving throws')
      return {
        subject: { kind: 'save', ability: request.ability },
        expression: toHitFromBonus(savingThrowBonus(hero, request.ability)),
      }
    }
    case 'skill': {
      // A creature *does* have skill bonuses — pre-computed ones, in `creatureSkills`,
      // because it has no ability score or level to derive them from. So the refusal
      // names what is missing rather than the skills: there is nothing here to roll
      // *from*, and the number the DM wants is already printed on the sheet.
      const hero = requireHeroSheet(sheet, 'ability scores to roll a skill from')
      return {
        subject: { kind: 'skill', skill: request.skill },
        expression: toHitFromBonus(
          skillBonus(hero.abilities, hero.level, skillProficienciesOf(hero), request.skill),
        ),
      }
    }
    case 'initiative':
      return {
        subject: { kind: 'initiative' },
        expression: toHitFromBonus(initiativeBonusOf(sheet)),
      }
    default: {
      // A sixth request kind fails `npm run lint` here. Unreachable at runtime, and the
      // throw is what an unreachable branch about a write should be.
      const unknownRequest: never = request
      void unknownRequest
      throw new ConvexError({
        kind: 'BadInput',
        message: 'That is not something this game knows how to roll.',
      })
    }
  }
}

/**
 * The `entry` arm, which is long enough to be its own function and is the only arm that
 * reads a document rather than arithmetic.
 *
 * ⚠️ **The entry is found on the *stored* sheet, by id, and a miss is a refusal.** A DM
 * editing a creature while a player's cursor is on one of its actions is the real case,
 * not a hostile one: the row the client is holding was deleted a second ago, the id it
 * sends resolves to nothing, and the honest answer is to say so rather than to write a
 * line naming an entry that no longer exists. Note which sheet is searched —
 * `sheetEntriesOf(resolveSheet(character))`, so a premade hero's library feats and a
 * scaled creature's abilities are found too, since for those the resolved sheet *is* the
 * one the client was shown.
 *
 * ⚠️ **The part gate is a real gate rather than a formality.** Without it a client can
 * ask for a `toHit` on a passive, `toHitOf` answers `null` because that category carries
 * no to-hit, and the line either crashes or announces an attack that cannot exist. So
 * the part has to be one the category actually offers, decided by `partsFor` — which is
 * itself composed out of `rollShapeOf` rather than switching on the category again, so a
 * fourth category is answered in one place.
 *
 * `'text'` is exempt because alt-click works on everything: it is a modifier on a
 * gesture rather than a fourth button, which is exactly why `partsFor` leaves it out of
 * every category's list. `FEED_PARTS` has four members and `partsFor` never returns more
 * than two of them.
 *
 * **`categoryOf(entry)`, never `entry.category`.** The field is optional and absent on
 * every line written before the category existed, and that accessor is the one place its
 * default is derived. Reading the raw field here would make a legacy weapon into a
 * passive on one screen and an action on another.
 */
function planEntryRoll(
  sheet: CharacterSheet,
  request: Extract<RollRequest, { kind: 'entry' }>,
): PlannedRoll {
  const entry = sheetEntriesOf(sheet).find((candidate) => candidate.id === request.entryId)
  if (!entry) {
    throw new ConvexError({ kind: 'BadInput', message: 'That is no longer on this sheet.' })
  }

  const category = categoryOf(entry)
  if (request.part !== 'text' && !partsFor(category).includes(request.part)) {
    throw new ConvexError({
      kind: 'BadInput',
      message: `${entry.name} has no such roll on it.`,
    })
  }

  // Built once and shared by all four parts, because the only field that differs between
  // them is `text` — and that difference is the coherence rule lib/roll.ts records: an
  // alt-click *is* the description, so it travels, while a roll does not carry six
  // hundred characters of prose on every line of a busy feed.
  const subject: FeedSubject = {
    kind: 'entry',
    part: request.part,
    name: entry.name,
    category,
    level: entry.level,
    text: request.part === 'text' ? entry.text : null,
  }

  switch (request.part) {
    case 'toHit':
      return { subject, expression: requiredRoll(toHitOf(entry), entry, 'roll to hit') }
    case 'roll':
      return { subject, expression: requiredRoll(entry.roll, entry, 'roll') }
    case 'use':
    case 'text':
      // No dice, and that is the point of both: a passive being declared is the table
      // being told, and an alt-click is the description arriving. `writeFeedRow` takes a
      // null roll for exactly these.
      return { subject, expression: null }
    default: {
      // A fifth part fails `npm run lint` here rather than announcing nothing.
      const unknownPart: never = request.part
      void unknownPart
      return { subject, expression: null }
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * The rolls panel. Every line this caller may be told about, oldest first.
 *
 * **The board, then the character choke point, then the payload** — the shape
 * `characters.vitals` established for a question about the same rows, so that a caller
 * shown a creature's health bar and denied its feed line (or the reverse) is not looking at
 * two rules that were identical when they were written.
 *
 * What differs is the last predicate, deliberately: `mayHearOf` inside
 * `readableCharacterIds` admits a creature whose token the caller can already see, because
 * `board.tokens` has *already* published that goblin's name and its coin — so withholding
 * the line would be secrecy theatre against a client that can read the name off its own
 * board. `maySeeCharacter` still decides the *sheet*. The ambush case is untouched: a
 * DM-layer token is in neither set, so a prepared encounter rolls nothing anybody hears
 * about until the coin is on the board.
 *
 * ⚠️ **There is no `playerId`, and the answer is a function of the DM code alone.** A grant
 * cannot widen this query — `controlled` is a subset of `visible` by construction, so the
 * disjunct `mayHearOf` used to take could admit nothing sight had not — and a per-seat
 * argument would have split the one subscription that re-runs on every roll at the table
 * into a cache entry per person, for identical rows. `mayHearOf` carries the proof. The
 * alternative of sending everybody every line and letting the client hide some is invariant
 * 1 inverted, and is not on the table.
 *
 * Empty for an unknown code rather than a throw, because this paints a screen —
 * `findGameByCode` is the finding form for exactly that reason.
 */
export const list = query({
  args: {
    code: v.string(),
    dmCode: v.optional(v.string()),
  },
  returns: v.array(publicFeedValidator),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    if (!game) return []

    const { isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)

    const readable = await readableCharacterIds(ctx, game._id, isDm)
    return await visibleFeed(ctx, game._id, isDm, readable)
  },
})

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Click something on a sheet and tell the table what happened.
 *
 * The order of operations below is load-bearing and each step earns its place:
 *
 * 1. **`resolveDmAccess`** — which is `getGameByCode` plus the code comparison, so an
 *    unknown code throws here as a mutation should, and `isDm` comes from the DM code
 *    and from nothing else (invariant 7).
 * 2. **The privacy refusal**, before any character is read. See `requirePrivacyAllowed`.
 * 3. **`requireEditableCharacter` with `allowControl: true`** — and **no check of its
 *    own**. That function is the sixth `true` and its docblock already names this
 *    caller: rolling a granted pet's claw is the same act as spending its hit points,
 *    and it is emphatically not authorship, because everything rollable is read off the
 *    stored sheet below. It also hands over **refusal parity for free** — a DM-layer
 *    creature, another seat's hero and a fabricated id are one `CharacterNotFound`, so
 *    this mutation is not an existence oracle for the DM's bestiary. A second check here
 *    would be a weaker copy of a rule that is already made properly one module over.
 * 4. **`resolveSheet`, then `modifiersFor`** — the resolved sheet, because a premade hero
 *    stores a class and a level rather than numbers, and a creature stores a key and a
 *    rating. `1d8+WIS` is stored with the token and resolved at the moment of rolling,
 *    which is the whole reason `ROLL_MODIFIER_TOKENS` exists.
 * 5. **`planRoll`**, which is where the caller's request meets the document.
 * 6. **`evaluateRoll`** with `cryptoDice`, on the server, because a roll the browser
 *    computes is a roll the browser can choose.
 *
 * ⚠️ **`actorName` is the character's name and never the seat's**, and the two genuinely
 * differ here: the DM rolling on a player's behalf has to announce *the character*,
 * which is what the DM panel is for and what all six of the roadmap's example sentences
 * do. It is **stored** rather than looked up on the way out — the `catalogueKey`
 * breadcrumb argument — so a rename an hour later does not rewrite history. That is also
 * why `playerId` is optional on this mutation and required on `feed.rollDice`: here the
 * seat is only routing.
 */
export const roll = mutation({
  args: {
    code: v.string(),
    characterId: v.id('characters'),
    request: rollRequestValidator,
    mode: rollModeValidator,
    dmOnly: v.boolean(),
    playerId: v.optional(v.id('players')),
    dmCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    requirePrivacyAllowed(isDm, args.dmOnly)

    const character = await requireEditableCharacter(
      ctx,
      game,
      args.characterId,
      isDm,
      args.playerId,
      { allowControl: true },
    )

    const sheet = resolveSheet(character)
    const { subject, expression } = planRoll(sheet, args.request)
    const roll =
      expression === null
        ? null
        : evaluateRoll(expression, modifiersFor(sheet), args.mode, cryptoDice)

    await writeFeedRow(ctx, {
      gameId: game._id,
      characterId: args.characterId,
      actorName: character.name,
      subject,
      roll,
      dmOnly: args.dmOnly,
    })
    return null
  },
})

/**
 * The dice tray: somebody types `2d6` and the table watches it land.
 *
 * ⚠️ **`playerId` is required here and optional on `feed.roll`, and the asymmetry is the
 * decision rather than an inconsistency.** A sheet roll is announced as the *character*,
 * so the seat is only routing and the mutation has a name without it. An ad-hoc roll
 * names nobody — there is no character to read a name off — so it is announced as the
 * *person*, and a person is a seat. `rollSentence`'s `dice` arm is `Ana rolls 2d6`, and
 * there is no version of that sentence with the seat missing.
 *
 * Which is the same advisory ceiling as everything else, stated rather than left to be
 * discovered: a `playerId` is routing and not identity (ADR 0003), so somebody can roll
 * under another seat's display name. Nothing is protected by it — an ad-hoc roll reads
 * no document, touches no sheet and reveals nothing — so the worst outcome is a rude
 * line everybody watched appear, which is exactly the residual `requireMovableToken`
 * accepts for a shove.
 *
 * ⚠️ **`rollProblem`, and never a bare `isValidRoll`.** `ROLL_PATTERN`'s trailing term
 * group has **no repetition cap**, so `1d6+1+1+1…` a thousand times over is a *valid*
 * roll and only `MAX_ROLL_LENGTH` inside `rollProblem` closes it. This is the one place
 * in the application where a roll expression arrives from a human rather than from
 * content — everything on a sheet went through `entriesProblem`, which asks the same
 * question — so it is the only place that hole is reachable at all. It is also why the
 * message comes back from that function rather than being written here: the tray's field
 * and this mutation have to agree about what a roll is and about how to say so.
 */
export const rollDice = mutation({
  args: {
    code: v.string(),
    expression: v.string(),
    mode: rollModeValidator,
    dmOnly: v.boolean(),
    playerId: v.id('players'),
    dmCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { game, isDm } = await resolveDmAccess(ctx, args.code, args.dmCode)
    requirePrivacyAllowed(isDm, args.dmOnly)

    // The seat, for the name. `getSeatInGame` refuses an id from another game, which is
    // all a routing argument can be checked for.
    const seat = await getSeatInGame(ctx, game._id, args.playerId)

    // Normalised first, and by the same function the tray's field runs on every
    // keystroke, so `2d6 + wis` typed by hand and `2d6+WIS` offered by a picker are
    // byte-identical before anything judges either of them.
    const expression = normaliseRoll(args.expression)
    const problem = rollProblem(expression)
    if (problem) throw new ConvexError({ kind: 'BadInput', message: problem })

    // ⚠️ **A modifier token is refused rather than resolved to nothing.** There is no
    // character here, so `1d8+STR` has nothing to resolve against, and `+0` would be a
    // lie the feed then prints in full — `rollWorking` spells out the arithmetic, so the
    // row would read `4 + 0` beside a total nobody's Strength contributed to. Note that
    // this is the opposite call from `modifiersFor`'s, deliberately: there the roll is
    // stored content and is happening regardless, so a visible `+0` is the best available
    // report of a content bug; here the roll has not started and a person is present to
    // be told.
    //
    // A substring test is exact enough because the grammar's terms are either digits or
    // one of these seven literals — there is no valid expression in which `STR` appears
    // as part of something else. The refusal names the token, because "type the number
    // instead" is only actionable if the reader knows which one.
    const token = ROLL_MODIFIER_TOKENS.find((candidate) => expression.includes(candidate))
    if (token !== undefined) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `An ad-hoc roll has no character, so it cannot use ${token}. Type the number instead.`,
      })
    }

    await writeFeedRow(ctx, {
      gameId: game._id,
      characterId: null,
      actorName: seat.displayName,
      subject: { kind: 'dice' },
      // `NO_MODIFIERS` is **provably unused by this point** rather than a plausible
      // default: the refusal above has established that the expression contains none of
      // the seven tokens, so `parseRoll` will never index into it. Passing the shared
      // frozen set says that in one word, where an object literal of seven zeros would
      // read as a fallback somebody might one day be tempted to populate.
      roll: evaluateRoll(expression, NO_MODIFIERS, args.mode, cryptoDice),
      dmOnly: args.dmOnly,
    })
    return null
  },
})
