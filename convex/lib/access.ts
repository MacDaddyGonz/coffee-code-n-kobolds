import { ConvexError } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { controlledCharacterIds } from './board'
import { CHARACTER_NOT_FOUND, findVisibleCharacter } from './characters'
import { findClaimHolder, listSeats } from './players'

// THE EDIT RULE, and why it is a module of its own rather than three functions inside
// `convex/characters.ts`, where it was written.
//
// It has a second caller now: rolling a die off a sheet asks exactly the question editing
// one asks — the DM may roll anything, a player may roll their own claimed character and
// anything the DM has granted them — and `convex/feed.ts` needs the same answer
// `convex/characters.ts` needs. A `convex/*.ts` module exports only Convex functions in
// this codebase (`convex/players.ts` keeps `seatValidator` private for the same reason),
// so the rule could not be reached from there without either exporting a helper out of a
// function module or spelling the rule twice. Neither is acceptable for a rule that
// decides who may touch whose sheet.
//
// **This file reads neither guarded table**, which is what keeps `leakGuard.test.ts`
// satisfied without a fourth entry in its table: `findVisibleCharacter` comes from
// lib/characters.ts and `controlledCharacterIds` from lib/board.ts, and each returns a
// document or a `Set` of ids that the owning module has already filtered. So this is the
// **crossing** between the two choke points for one named character, exactly as
// `boardCharacterAccess` is the crossing for a whole board — and, like it, nothing wider
// than an id or an already-filtered document passes through.
//
// Nothing about the rule itself changed when it moved. The comments below are the ones it
// was written with, because the reasoning is the artefact.

/**
 * What the rule below answered: the character, or which of three refusals it was.
 *
 * A verdict rather than a throw, because there are two callers wanting two shapes of the
 * one rule — see `findEditableCharacter` and `requireEditableCharacter`. The refusing
 * variants carry only what the wording needs, so the *query* form can discard all of it
 * and answer `null` without a `try` wide enough to swallow a genuine fault as well.
 *
 * `unseen` and `noSeat` are deliberately different verdicts even though both end as a
 * refusal: `unseen` is the shared `CHARACTER_NOT_FOUND`, which an NPC's existence
 * requires, and `noSeat` is an ordinary "only the DM can do that" about a hero the caller
 * can perfectly well see.
 */
type EditVerdict =
  | { ok: true; character: Doc<'characters'> }
  /** No such character, one in another game, or a creature this caller may not see. */
  | { ok: false; reason: 'unseen' }
  /** Visible, but the caller sent no `playerId`, so no claim can speak for them. */
  | { ok: false; reason: 'noSeat' }
  /** Visible, and somebody else's — `holder` is null when nobody is playing it. */
  | { ok: false; reason: 'notYours'; holder: Doc<'players'> | null }

/**
 * THE EDIT RULE, in one place, asked once and shaped twice.
 *
 * Refuses an NPC to anybody without the DM code **or a grant**, with the same error a
 * fabricated id gets — an NPC's existence is a spoiler, so the error channel gets no
 * more latitude than the payload channel did (ADR 0004's reasoning, applied to the other
 * secret).
 *
 * For a player character the rule is Milestone 2's, restated for sheets: control is
 * granted, never assumed. The seat that has claimed the character may change it,
 * the DM may change anything, and a character nobody is playing is the DM's.
 *
 * ⚠️ **`allowControl` splits the write paths in two, and the split is the decision
 * rather than a knob.** A grant gives a seat **sight and hit points, not authorship**:
 *
 * - `true` for `adjustHp`, `setHp`, `adjustHitDice`, `longRest` and `setPerRest`, for
 *   the `characters.sheet` query, and for `feed.roll`. A granted pet takes damage from the player holding its
 *   lead, which is the entire point of handing it to them; a grant that could not spend a
 *   hit point would be a sheet to look at, and `HpControls` would render no `−`/`+`
 *   beside it. `adjustHitDice` is the odd one of the five and says `true` anyway: a
 *   granted creature has no hit dice at all — `changeHitDiceRemaining` returns zero for
 *   anything that is not a `pc` — so the grant reaches a path with nothing on the other
 *   side of it, and saying so keeps the five hit-point writes one rule rather than four
 *   and an exception.
 * - `false` for `updateSheet`. A granted monster is not a stat block a player rewrites.
 *   Nothing about lending somebody a wolf for a fight says they may change what a wolf
 *   is, and the DM's own numbers on it are the DM's.
 *
 * **`feed.roll` is the sixth `true` and it needed no new rule**, which is the whole reason
 * the rolls work reaches for this function rather than writing its own gate. Rolling a
 * granted pet's claw is the same act as spending its hit points: the DM handed the lead
 * over, and a sheet you may read and damage but not roll would be a stranger arrangement
 * than either of the two this parameter already describes. It is emphatically not
 * authorship — the mutation reads the entry's name, category, level, text and roll *off
 * the stored sheet* and takes nothing rollable from the caller, so a granted seat can
 * throw a creature's dice and still cannot change what those dice are.
 *
 * It is a required parameter with no default because a default is the thing that gets
 * inherited by the next write path without anybody deciding. `setLevel`, `setUnlocked`,
 * `setCreatureCr` and `resetCreature` do not come through here at all — they are flat DM
 * gates, which is the third answer and the one that needed no parameter.
 *
 * **The ceiling is the same one, and it is advisory.** `playerId` is a routing
 * argument, so anybody can pass another seat's id and walk straight past the checks
 * below; they stop a misclick and say whose sheet it is, and they are not a defence
 * against somebody with the network tab open. That is acceptable here for the same
 * reason it is acceptable for moving a token — a hero's sheet is not a secret from
 * the party, and the worst outcome is a rude edit everybody can see.
 *
 * ⚠️ **What is no longer true is that the refusal guarding a secret keys off the DM code
 * alone**, which is what this comment used to say. A grant is a second door, and the
 * residual hole now reaches through it: a player passing another seat's id gets whatever
 * was granted to *that* seat, which can be a creature's stat block rather than only a
 * hero's. That is a fourth decline of accounts rather than an oversight — the door was
 * opened deliberately by the DM, and closing the residual needs identity rather than
 * another check. See ADR 0002 and the threat model in CLAUDE.md.
 */
async function resolveEditableCharacter(
  ctx: QueryCtx,
  game: Doc<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  playerId: Id<'players'> | undefined,
  { allowControl }: { allowControl: boolean },
): Promise<EditVerdict> {
  // The DM's path is one point get and nothing else. `maySeeCharacter` returns true for
  // the DM before it looks at a grant, so a roster read here would be a range read whose
  // answer is discarded — and `characters.sheet` is force-mounted, so putting the whole
  // `players` range and the whole `tokens` range into its read set made every join,
  // rename, claim, release, `addToken` and `setControllers` re-push the entire sheet to
  // the DM. That is precisely the re-push splitting hit points off this query prevented.
  if (isDm) {
    const character = await findVisibleCharacter(ctx, game._id, characterId, true)
    return character ? { ok: true, character } : { ok: false, reason: 'unseen' }
  }

  // ⚠️ **Two point gets, concurrently, and the common path stops here.** A player
  // clicking `−1` on their own hero is the case this ordering is for: the claim is the
  // rule that says whose character this *is*, it is answerable from one indexed lookup,
  // and building the grant set first — as this used to — meant a `listSeats` range read
  // and a `tokens` range read on every one of the five hit-point mutations, in a fight,
  // discarded a line later. What is left in that transaction's read set is two documents,
  // so a concurrent join, rename, `addToken` or `setControllers` no longer conflicts with
  // an in-flight hit-point write.
  //
  // Concurrent because neither read depends on the other: `findClaimHolder` is indexed on
  // the character id the caller supplied, not on the document it resolves to.
  const [seen, holder] = await Promise.all([
    findVisibleCharacter(ctx, game._id, characterId, false),
    findClaimHolder(ctx, characterId),
  ])

  // ⚠️ `holder !== null` rather than `holder?._id === playerId`, which is the same
  // comparison with one wrong answer in it: for a caller who sent no `playerId`, asking an
  // unclaimed hero, both sides are `undefined` and the character is theirs. The seat has
  // to exist for a claim to mean anything.
  if (seen && holder !== null && holder._id === playerId) return { ok: true, character: seen }

  // The grant, consulted after the claim, and now *read* after it too. Reaching the board
  // is the expensive half of this function and it can only ever widen the answer, so it
  // happens on fall-through and only where it could change one: an authorship path is not
  // widened by a grant, and a caller with no seat has nothing for a grant to be attached
  // to (`boardCharacterAccess` would fail closed and hand back the empty set anyway).
  //
  // The cost, when it is paid, is a bounded `listSeats` range read *and* a bounded
  // `tokens` range read in the transaction's read set — so a concurrent join, rename,
  // claim, `addToken` or `setControllers` becomes an OCC conflict against this write. That
  // is the trade `requireMovableToken` explicitly refuses to make, and the difference is
  // the write rate: a drag commits ten times a second and invariant 2 is about exactly
  // that, whereas a grant path is a player poking a shared pet. Retrying that is free.
  if (allowControl && playerId !== undefined) {
    const controlled = await controlledCharacterIds(
      ctx,
      game._id,
      // ⚠️ **No scene, so fog is not consulted on this path — and the first draft passed one.**
      //
      // The reasoning for passing it was that control carries a creature's sheet and its
      // exact hit points, so a grant on something the party cannot see would be a door onto
      // a secret fog had just closed. That reasoning also contained its own refutation:
      // `fogVeil` never veils a token with an effective controller, so a *granted* creature
      // is never fogged and the argument provably changes no answer.
      //
      // What it cost was not nothing. This runs inside **five hit-point mutations and
      // `feed.roll`**, so a real `sceneId` puts a `tokenPositions` range read into a *write*
      // transaction's read set — the table committed ten times a second — and every granted
      // seat's hit-point write would then OCC-conflict against any drag on that scene.
      // `requireMovableToken` refuses exactly this trade one module over, on the same table,
      // for the same reason. Paying it for an inert argument was the wrong side of it.
      //
      // If the controller exclusion is ever narrowed, this is the call site to revisit —
      // named here rather than pre-paid.
      null,
      false,
      await listSeats(ctx, game._id),
      playerId,
    )

    // Re-asked with the set in hand only when the pre-grant answer was "no such
    // character", because a granted creature is invisible *without* it —
    // `maySeeCharacter` refuses a wolf before anybody gets as far as asking who is
    // holding its lead. A hero was already visible, so there is nothing to re-decide.
    const character =
      seen ?? (await findVisibleCharacter(ctx, game._id, characterId, false, controlled))

    if (character && controlled.has(character._id)) return { ok: true, character }
    if (!character) return { ok: false, reason: 'unseen' }
    // The refusal names the holder rather than the grant, which is the useful half for
    // the player who hit it.
    return { ok: false, reason: 'notYours', holder }
  }

  // Visibility is refused ahead of everything else, so an NPC and a fabricated id stay one
  // answer even for a caller who has no seat to be refused for.
  if (!seen) return { ok: false, reason: 'unseen' }
  if (playerId === undefined) return { ok: false, reason: 'noSeat' }
  return { ok: false, reason: 'notYours', holder }
}

/**
 * The rule above as a question: the character this caller may change, or null.
 *
 * For queries, which paint a screen — the same finding/requiring pairing this codebase
 * already keeps for `findVisibleCharacter`/`requireVisibleCharacter` and
 * `findSceneInGame`/`getSceneInGame`. One rule, two shapes.
 *
 * Every refusal collapses to the same `null`, which is the point: an unknown id, another
 * seat's hero and an ungranted NPC must be indistinguishable, and the *reason* the
 * verdict carries is for the throwing form's wording rather than for a caller to branch
 * on. Written as a verdict rather than by catching what `requireEditableCharacter` throws
 * because a `try` wide enough to swallow every refusal is also wide enough to swallow a
 * genuine fault and report it as "no such character".
 */
export async function findEditableCharacter(
  ctx: QueryCtx,
  game: Doc<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  playerId: Id<'players'> | undefined,
  options: { allowControl: boolean },
): Promise<Doc<'characters'> | null> {
  const verdict = await resolveEditableCharacter(ctx, game, characterId, isDm, playerId, options)
  return verdict.ok ? verdict.character : null
}

/**
 * The same rule as a demand: the character this caller may change, or a throw.
 *
 * For mutations, which have nothing to render, so a refusal should fail loudly and say
 * which refusal it was. The wording is the whole of what this adds — see `EditVerdict`
 * for why `unseen` is the shared `CHARACTER_NOT_FOUND` while the other two are not.
 */
export async function requireEditableCharacter(
  ctx: QueryCtx,
  game: Doc<'games'>,
  characterId: Id<'characters'>,
  isDm: boolean,
  playerId: Id<'players'> | undefined,
  options: { allowControl: boolean },
): Promise<Doc<'characters'>> {
  const verdict = await resolveEditableCharacter(ctx, game, characterId, isDm, playerId, options)
  if (verdict.ok) return verdict.character

  switch (verdict.reason) {
    case 'unseen':
      throw new ConvexError(CHARACTER_NOT_FOUND)
    case 'noSeat':
      throw new ConvexError({
        kind: 'CharacterNotYours',
        message: 'Only the DM can change that character.',
      })
    case 'notYours':
      throw new ConvexError({
        kind: 'CharacterNotYours',
        message: verdict.holder
          ? `${verdict.holder.displayName} is playing that character.`
          : 'Nobody is playing that character yet, so only the DM can change it.',
      })
    default: {
      // Exhaustive on purpose: a fifth verdict added without wording fails `npm run lint`
      // here rather than falling through to a refusal nobody chose.
      const unknownReason: never = verdict
      void unknownReason
      throw new ConvexError(CHARACTER_NOT_FOUND)
    }
  }
}
