// THE THIRD CHOKE POINT. This module is the only place in `convex/` allowed to read or
// write the `feed` table, and `leakGuard.test.ts` greps the sources to keep it that way —
// the same arrangement `lib/board.ts` has for the two token tables and `lib/characters.ts`
// has for the two character ones, enforced by the same sweep.
//
// It is worth saying why a feed row needs *this* guard rather than a validator, because
// the milestone this belongs to has one of each shape and CLAUDE.md invariant 8 is about
// telling them apart.
//
// `Ancient Red Dragon attacks with their Bite` is a leaked **row**. It has exactly the
// shape of `Chadius attacks with their Greatsword` — a name, a subject, a total — so no
// `returns:` validator can ever distinguish one from the other, and a projection over
// this table would cheerfully approve an array made entirely of spoilers. There is
// therefore **no redacted variant of a feed row and there must not be one**: a row this
// caller may not hear about is dropped whole, in one place, by one predicate. Contrast
// `publicVitalsValidator` next door, which *is* a discriminated union precisely because
// exact hit points are a leaked **field** and a union can leave nowhere to put one. One
// tool for each shape, and getting them the wrong way round is the mistake invariant 8
// exists to prevent.
//
// **The predicate is not this module's**, which is the other half of the arrangement:
// `mayHearOf` and `readableCharacterIds` live in lib/characters.ts because they are
// questions about a character document, and what crosses into this file is a `Set` of ids
// that has already been filtered. So this module reads no other guarded table and no other
// module reads this one.

import { v, type Infer } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { MAX_FEED_ROWS_LISTED, MAX_FEED_ROWS_SWEPT } from './games'
import { feedSubjectValidator, rollResultValidator } from './roll'
import type { FeedSubject, RollResult } from './roll'

/**
 * One line of the feed, as it travels.
 *
 * The stored row minus `gameId`, which the caller supplied and so is told nothing by, and
 * plus `createdAt` — the projected `_creationTime`, which is this codebase's existing
 * convention for a document's own timestamp reaching a client (`publicCharacterValidator`
 * does the same).
 *
 * ⚠️ **`dmOnly` travels, and it is not the information the flag exists to withhold.** A
 * player never receives a row that carries `true`, because `visibleFeed` has already
 * dropped it — so the only caller who can read this field is the DM, for whom it is the
 * difference between a line the table saw and a line only they did. That is the identical
 * argument `publicCharacterValidator.reserved` makes: the DM's own control has to be a
 * *state* and not a command, or the panel can say what pressing the button would do and
 * never what is currently true.
 *
 * ⚠️ **`characterId` travels too, and it is a pointer rather than a name.** The row it
 * points at is one this caller may already read — that is what `readable` decided — and
 * what the client wants it for is the roller's token on screen and its portrait beside the
 * line. Sending the id rather than making the browser match on `actorName` is the same
 * choice `publicTokenValidator` makes for control: when the server already knows the
 * answer, the server sends the answer.
 */
export const publicFeedValidator = v.object({
  _id: v.id('feed'),
  createdAt: v.number(),
  characterId: v.union(v.id('characters'), v.null()),
  actorName: v.string(),
  subject: feedSubjectValidator,
  roll: v.union(rollResultValidator, v.null()),
  dmOnly: v.boolean(),
})
export type PublicFeedRow = Infer<typeof publicFeedValidator>

/**
 * The feed this caller may read, oldest line first.
 *
 * **Three reasons to withhold a row, `&&`-ed here and folded into nothing**, which is the
 * composition discipline the two predicates next door already keep:
 *
 * - **Whose line it is.** `readable` is the set from `readableCharacterIds`, so a creature
 *   nobody at this seat can see contributes no line. `characterId === null` is an ad-hoc
 *   roll, which names nobody and is therefore everybody's.
 * - **A reserved character**, handled upstream inside that set rather than again here. The
 *   DM rolling initiative down the Sheets selector is what makes that reachable.
 * - **`dmOnly`**, which is an unrelated question about the row rather than about the
 *   character on it — the DM's private roll for a hero the whole table can see is still
 *   private. Folding it into `mayHearOf` would put a fact about a feed row inside a
 *   predicate about a character document, which is how a predicate stops being one
 *   question.
 *
 * ⚠️ **A row whose character no longer exists is dropped for everybody, the DM included,
 * and that is fail-closed by construction rather than by a clause anybody has to
 * remember.** A deleted character's id is simply not in `readable`, because that set is
 * built from the characters that exist — so the refusing behaviour is what the absence of
 * a row *means*, with nothing written here to produce it. `deleteFeedForCharacter` below
 * is what actually removes those lines, which makes this a backstop rather than the
 * design: it is the state between a delete and its sweep, and the reason the sweep can
 * afford to be the only thing that tidies up.
 *
 * ⚠️ **The window is taken before the filter, so this is the visible part of the last
 * sixty lines rather than the last sixty visible lines.** Deliberate: reading until sixty
 * survive is a bound that moves with how much the DM is hiding, and a scrollback whose
 * depth advertises how many private rolls have been made is a *count* leak of exactly the
 * kind `boardCharacterAccess` refuses for monsters. A short feed costs a player nothing.
 *
 * **Returned oldest-first**, which is one `reverse` on the server against one on every
 * client, per render. The index gives newest-first because that is the only order in which
 * "the newest sixty" is a bounded read at all; a chat panel renders top to bottom, so the
 * order it wants is the other one, and deciding that here means no component has to
 * remember to flip an array it was handed.
 */
export async function visibleFeed(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  isDm: boolean,
  readable: ReadonlySet<Id<'characters'>>,
): Promise<PublicFeedRow[]> {
  const rows = await ctx.db
    .query('feed')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .order('desc')
    .take(MAX_FEED_ROWS_LISTED)

  // Filter first, project second, for the reason `publicTokens` gives: the projection only
  // ever runs over rows the caller may have. Nothing here is as sharp as a signed storage
  // URL, but the habit is what makes the order un-rearrangeable.
  return rows
    .filter(
      (row) =>
        (row.characterId === null || readable.has(row.characterId)) && (isDm || !row.dmOnly),
    )
    .reverse()
    .map((row) => ({
      _id: row._id,
      createdAt: row._creationTime,
      characterId: row.characterId,
      actorName: row.actorName,
      subject: row.subject,
      roll: row.roll,
      dmOnly: row.dmOnly,
    }))
}

/**
 * Append one line. **The only writer**, and the reason `convex/feed.ts` can hold the
 * gate without holding the table.
 *
 * Every field is required of the caller, with `null` for the two that can be absent, which
 * is the schema's own convention here rather than this function's preference — see the
 * comment on the table. There is nothing to spread in and no `undefined` to avoid, which
 * is the practical payoff of a brand-new table having got the stronger spelling.
 *
 * **Checks nothing it cannot know**, the same split the four token writers in lib/board.ts
 * keep. Whether this caller may roll for this character is `requireEditableCharacter`'s
 * question and is answered in `convex/feed.ts`, where the game and the DM code arrive;
 * whether `subject.text` is populated only for a `'text'` part is that module's too,
 * because it is the one place a subject is *built* — lib/roll.ts records that coherence as
 * an invariant with a test rather than a validator, since no validator can express it.
 * A writer that half-checked either would be a second, weaker copy of a check that already
 * exists somewhere it can be made properly.
 */
export async function writeFeedRow(
  ctx: MutationCtx,
  row: {
    gameId: Id<'games'>
    characterId: Id<'characters'> | null
    actorName: string
    subject: FeedSubject
    roll: RollResult | null
    dmOnly: boolean
  },
): Promise<Id<'feed'>> {
  return await ctx.db.insert('feed', row)
}

/**
 * Take a deleted character's lines with it.
 *
 * The same class of repair `detachCharacterFromTokens` performs one module over, and here
 * it is a delete rather than a patch because a feed row is *only* about the character it
 * names: a line with its pointer cleared would read `Chadius rolls initiative` with
 * nothing behind the name, which is history preserved into meaninglessness.
 *
 * It would also be **invisible litter**. `visibleFeed` drops a row whose id is not in
 * `readable`, and a deleted character is in nobody's set, so those lines are already
 * unreadable by every caller including the DM — they would simply sit in the table
 * occupying the sixty-row window that everybody else's lines have to fit into, which is
 * the one observable consequence of leaving them.
 *
 * **Indexed on `characterId` rather than scanning the game's rows**, which is why this
 * needs no `gameId`. The alternative was a range read of `by_gameId` filtered in
 * JavaScript, and it is the wrong trade twice over: the feed is the one table in a game
 * with no application-enforced cap, so a scan of it grows all evening, and it grows on a
 * *delete path* — precisely the shape this codebase argues against, and the reason
 * `detachCharacterFromTokens` and `deleteTokenPlacements` both carry an index of their own.
 * One line in the schema against a read that gets slower the longer the session runs.
 */
export async function deleteFeedForCharacter(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
): Promise<void> {
  const rows = await ctx.db
    .query('feed')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .take(MAX_FEED_ROWS_SWEPT)

  for (const row of rows) {
    await ctx.db.delete('feed', row._id)
  }
}

/**
 * Every feed row in a game. For the purge tool in `convex/admin.ts`, and for nothing a
 * client can reach.
 *
 * It lives here rather than there for the reason every read of a guarded table does:
 * `convex/admin.ts` is swept by `leakGuard.test.ts` like every other module, so it may not
 * query `feed` itself.
 *
 * ⚠️ **The one read of this table that does not consult `readable`, and it is safe for a
 * reason worth stating rather than assuming** — the same one `deleteTokensInGame` and
 * `deleteCharactersInGame` state for their own unfiltered sweeps. A purge is not a
 * question about contents: it must take the DM's private lines and the monsters' too,
 * since a deleted game's ambush is exactly the residue this exists to remove. What holds
 * invariant 8 is that **a number leaves this function and never a row.**
 */
export async function deleteFeedInGame(
  ctx: MutationCtx,
  gameId: Id<'games'>,
): Promise<number> {
  const rows = await ctx.db
    .query('feed')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_FEED_ROWS_SWEPT)

  for (const row of rows) {
    await ctx.db.delete('feed', row._id)
  }

  return rows.length
}

/**
 * Bounded count, so the purge tool's dry run can say what is about to be destroyed.
 *
 * The same bound the sweep above uses, deliberately, so the promise and the receipt cannot
 * disagree — see `MAX_FEED_ROWS_SWEPT`. A number leaves and never a row, which is the same
 * narrow crossing `countTokensInGame` and `countCharactersInGame` make.
 *
 * ⚠️ **This is the dominant term in `admin.listByPrefix`'s read, and the only one of that
 * query's five counts that is not bounded by a limit the application enforces.** Fifty
 * games of two hundred tokens and two hundred characters is a read that function's own
 * comment already calls the largest in the application; fifty games of two thousand feed
 * rows would dwarf it and could exceed what a single Convex query may read. The mitigation
 * is the *prefix* rather than a second, smaller bound: the tool exists to sweep
 * `Board Smoke ` litter, and a smoke run writes no feed rows at all. A second bound would
 * buy a cheaper listing at the price of a dry run that disagrees with the purge, which is
 * the one property `purgeCountsValidator` is there to provide.
 */
export async function countFeedInGame(ctx: QueryCtx, gameId: Id<'games'>): Promise<number> {
  const rows = await ctx.db
    .query('feed')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .take(MAX_FEED_ROWS_SWEPT)

  return rows.length
}
