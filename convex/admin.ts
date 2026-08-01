// A MAINTENANCE TOOL, NOT A FEATURE. Nothing here is part of the application.
//
// Deleting a game belongs to the game editor and admin milestone (see
// `docs/roadmap.md` § "Milestone 12"), and it stays there. What this module is for is
// the litter: `npm run test:smoke` creates a throwaway game on every run and could
// only ever clean up the scene and tokens it made, because there was no delete path
// for a game document at all. The dev deployment had seventy-one games, thirty-five of
// them smoke runs. `scripts/prune-games.mjs` is the whole of the user interface, and
// there deliberately is not another one.
//
// ⚠️ **`internalQuery` and `internalMutation`, and that choice is the reason this can
// exist now rather than in Milestone 12.** A public `games.remove` would have to answer
// "who may delete a game" — the DM code alone? the DM code plus the recovery phrase? —
// and that is a real decision with an ADR behind it, not a line of code. An internal
// function sidesteps the question honestly rather than pretending it has an easy
// answer: internal functions are absent from the generated public API, are not
// reachable over the wire by any client, and can only be called by a caller who
// already holds the deployment's admin credentials — which is to say, by somebody who
// could delete the rows from the dashboard anyway. It grants nothing that was not
// already granted. **Do not add a public mutation here.** The moment deleting a game
// is something a browser can ask for, the authorisation question is back and it needs
// the ADR.
//
// One consequence of that framing worth stating: this module answers to no game code
// and no DM code, so `requireDm` appears nowhere below. That is not invariant 7 being
// relaxed — invariant 7 is about what authorises a *client*, and there is no client
// here. See the threat-model section of CLAUDE.md: the line is drawn at what a browser
// can reach.

import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { countTokensInGame, deleteTokensInGame } from './lib/board'
import { countCharactersInGame, deleteCharactersInGame } from './lib/characters'
import { MAX_GAMES_LISTED, MAX_GAMES_SWEPT, publicGameValidator } from './lib/games'
import { deleteSeatsInGame, listSeats } from './lib/players'
import { deleteScenesInGame, listScenes } from './lib/scenes'

/**
 * What goes with a game, so the confirmation says what is about to be destroyed
 * rather than how many rows are in a table somewhere.
 *
 * The same shape is the purge's receipt, deliberately: a dry run that promises
 * `3 scenes, 12 tokens` and a purge that reports the same four numbers can be read
 * against each other by eye, and a mismatch is the only sign anybody would get that
 * something was written to the game between the two calls.
 */
const purgeCountsValidator = v.object({
  scenes: v.number(),
  tokens: v.number(),
  characters: v.number(),
  seats: v.number(),
})

/**
 * A game as the purge tool prints it: enough to recognise, and no secret.
 *
 * ⚠️ **Derived from `publicGameValidator` rather than spelled out**, and that is the
 * whole of invariant 8 applied to a function no client can call. `dmCode`,
 * `dmRecoverySalt` and `dmRecoveryHash` are absent by construction here because they
 * are absent by construction there, so a fifth secret added to the `games` table
 * cannot arrive in this payload either — the one place the exclusion is written down
 * stays the one place. Being internal is not a reason to skip the validator; the
 * counts are what this function is for, and the secrets are not. A DM code printed to
 * a terminal and pasted into a chat window is a game handed over.
 *
 * `activeSceneId` and `status` are omitted because a game about to be deleted has no
 * interesting board and is not interestingly in a lobby, and `_creationTime` is kept
 * because it is how a person tells last night's session from a smoke run.
 */
const purgeCandidateValidator = publicGameValidator
  .omit('activeSceneId', 'status')
  .extend({ counts: purgeCountsValidator })

/**
 * Four bounded reads over four tables, and the largest read anything in this
 * application performs. `MAX_GAMES_LISTED` is what stops it running fifty times over.
 *
 * Every count comes from the module that owns the table — two of them because
 * `leakGuard.test.ts` insists, and the other two because a purge is exactly the sort
 * of code that grows a private copy of a table read when there is nowhere obvious to
 * put one.
 */
async function countsFor(ctx: QueryCtx, gameId: Id<'games'>) {
  return {
    scenes: (await listScenes(ctx, gameId)).length,
    tokens: await countTokensInGame(ctx, gameId),
    characters: await countCharactersInGame(ctx, gameId),
    seats: (await listSeats(ctx, gameId)).length,
  }
}

/**
 * The games whose name starts with `prefix`, with what would go with each.
 *
 * A prefix rather than a pattern, and no "everything" case at all: `Board Smoke ` is
 * the litter that actually exists, and a maintenance tool whose default blast radius
 * is the whole deployment is a tool that eventually deletes a real game. The CLI has
 * no `--all` flag for the same reason.
 *
 * Matched in JavaScript rather than through an index, because there is no index on
 * `name` and adding one to serve a tool nobody runs twice a month would be a schema
 * change paid for by every write to the table. The scan is bounded instead.
 *
 * ⚠️ **`truncated` is not decoration.** Both bounds can genuinely be reached here, and
 * a deletion tool that silently showed the first fifty matches would look finished
 * when it was not — the operator deletes what they were shown, sees an empty list next
 * time they think to check, and concludes the deployment is clean. The flag is true
 * when the scan filled its window *or* when more matched than could be counted, and
 * the CLI turns it into one sentence: run it again.
 */
export const listByPrefix = internalQuery({
  args: { prefix: v.string() },
  returns: v.object({
    truncated: v.boolean(),
    games: v.array(purgeCandidateValidator),
  }),
  handler: async (ctx, args) => {
    const swept = await ctx.db.query('games').take(MAX_GAMES_SWEPT)
    const matched = swept.filter((game) => game.name.startsWith(args.prefix))

    // Counted only for the games that will be printed. The scan above is cheap; this
    // is not, and running it over every game in the deployment to throw most of the
    // answers away is how a bounded query becomes an expensive one.
    const listed = matched.slice(0, MAX_GAMES_LISTED)

    return {
      truncated: swept.length === MAX_GAMES_SWEPT || matched.length > listed.length,
      games: await Promise.all(
        listed.map(async (game) => ({
          _id: game._id,
          _creationTime: game._creationTime,
          name: game.name,
          code: game.code,
          createdByName: game.createdByName,
          counts: await countsFor(ctx, game._id),
        })),
      ),
    }
  },
})

/**
 * Delete one game and everything that belongs to it.
 *
 * ⚠️ **The order is chosen so that nothing dangling exists at any point the
 * transaction could be read**, which is the same rule `characters.remove` states and
 * the reverse of the order a reader might expect. A row is deleted before the row it
 * points at, never after:
 *
 *  1. **Tokens and their placements.** A token points at a character and at the seats
 *     the DM granted it; a placement points at a token and at a scene. Everything here
 *     points outwards, so it goes first. Its art goes with it.
 *  2. **Seats.** A seat points at a character. It comes after the tokens so that no
 *     surviving token holds a grant naming a seat that has gone — which is the exact
 *     residue `revokeControlForSeat` exists to prevent, avoided here by ordering
 *     instead of by repair.
 *  3. **Characters and their vitals.** Nothing points at a character any more.
 *  4. **Scenes and their placements.** Their placements went with the tokens; the
 *     sweep is kept for the pathological row whose token had already vanished.
 *  5. **The game document**, which the scenes pointed at and which points at one of
 *     them through `activeSceneId`. That mutual pointer is why it is last and why
 *     nothing bothers clearing `activeSceneId` on the way through.
 *
 * Inside one transaction none of this is observable, which is precisely why it is
 * written down: the reason to get the order right is the next reader, and the day
 * somebody has to split this across transactions because a game got too big for one.
 *
 * Takes a `gameId` rather than a code. Codes are how a person reaches a game and ids
 * are how a machine does; the CLI reads the id off `listByPrefix`, so the thing being
 * deleted is the thing that was printed, with no second lookup in between that could
 * resolve to a different row.
 */
export const purgeGame = internalMutation({
  args: { gameId: v.id('games') },
  returns: v.object({
    name: v.string(),
    code: v.string(),
    counts: purgeCountsValidator,
  }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get('games', args.gameId)
    if (!game) {
      // Thrown rather than shrugged off, even though a missing game is the state this
      // is trying to produce. The id came off a listing taken moments earlier, so its
      // absence means the listing and the purge disagree about the deployment, and a
      // tool deleting things is the wrong place to guess about that.
      throw new ConvexError({ kind: 'GameNotFound', message: 'No game with that id.' })
    }

    const tokens = await deleteTokensInGame(ctx, game._id)
    const seats = await deleteSeatsInGame(ctx, game._id)
    const characters = await deleteCharactersInGame(ctx, game._id)
    const scenes = await deleteScenesInGame(ctx, game._id)
    await ctx.db.delete('games', game._id)

    // The name and the code are read off the document before it goes, so the receipt
    // names the game rather than an id nobody can read back.
    return { name: game.name, code: game.code, counts: { scenes, tokens, characters, seats } }
  },
})
