// A MAINTENANCE TOOL, NOT A FEATURE. Nothing here is part of the application.
//
// Deleting a game belongs to the game editor and admin milestone (see
// `docs/roadmap.md`), and it stays there. What this module is for is
// the litter: `npm run test:smoke` creates a throwaway game on every run and could
// only ever clean up the scene and tokens it made, because there was no delete path
// for a game document at all. The dev deployment had seventy-one games, thirty-five of
// them smoke runs. `scripts/prune-games.mjs` is the whole of the user interface, and
// there deliberately is not another one.
//
// ⚠️ **`internalQuery` and `internalMutation`, and that choice is the reason this can
// exist now rather than in the game-editor milestone.** A public `games.remove` would
// have to answer
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
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'

import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { countTokensInGame, deleteTokensInGame } from './lib/board'
import {
  countCharactersInGame,
  deleteCharactersInGame,
  migrateCharactersInGame,
  needsMigration,
  planCharacterMigration,
} from './lib/characters'
import { countFeedInGame, deleteFeedInGame } from './lib/feed'
import { migrationCountsValidator } from './lib/migrate'
import { MAX_GAMES_LISTED, MAX_GAMES_SWEPT, publicGameValidator } from './lib/games'
import { deleteModalImagesInGame, listModalImages } from './lib/modalImages'
import { deleteTracksInGame, listTracks } from './lib/music'
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
  // ⚠️ **Counted rather than folded into `scenes`, because a handout is a thing a person
  // recognises.** A placement is bookkeeping and goes unmentioned; `2 handouts` is a line
  // an operator can read against what they remember uploading, which is the whole job of
  // this receipt. It is also the second number here that stands for deleted *blobs*, and
  // twenty-five of them is 50 MB — a number worth seeing before the confirmation.
  modalImages: v.number(),
  // ⚠️ **The number on this receipt that stands for the most bytes**, which is the reason
  // it is counted separately rather than left implied. Ten tracks at `MAX_MUSIC_BYTES` is
  // 100 MB going in one transaction — the largest single thing a purge destroys — and
  // audio is the one blob in this schema the browser never shrank on the way in.
  tracks: v.number(),
  // ⚠️ **The only one of the seven that is not bounded by a limit the application
  // enforces**, which is what makes it the one number here that can be large and the one
  // sweep that can come up short. `MAX_FEED_ROWS_SWEPT` carries that argument, and
  // `countFeedInGame` carries what it costs this query.
  feed: v.number(),
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
 * Seven bounded reads over seven tables, and the largest read anything in this
 * application performs. `MAX_GAMES_LISTED` is what stops it running fifty times over.
 *
 * Every count comes from the module that owns the table — three of them because
 * `leakGuard.test.ts` insists, and the rest because a purge is exactly the sort
 * of code that grows a private copy of a table read when there is nowhere obvious to
 * put one.
 *
 * ⚠️ **The feed is the term that could break this, and it is bounded rather than
 * excluded.** The other six count tables the application itself caps, so each is a few
 * hundred rows at worst; nothing caps the feed. `countFeedInGame` is where the cost, and
 * the reason the mitigation is the prefix rather than a smaller bound, is written down.
 */
async function countsFor(ctx: QueryCtx, gameId: Id<'games'>) {
  return {
    scenes: (await listScenes(ctx, gameId)).length,
    tokens: await countTokensInGame(ctx, gameId),
    characters: await countCharactersInGame(ctx, gameId),
    seats: (await listSeats(ctx, gameId)).length,
    // Listed rather than counted, because `MAX_MODAL_IMAGES_PER_GAME` is twenty-five and
    // a count helper for a read that small would be a second function saying `.length`.
    modalImages: (await listModalImages(ctx, gameId)).length,
    // Listed rather than counted for the reason above, and more so: the bound is ten.
    tracks: (await listTracks(ctx, gameId)).length,
    feed: await countFeedInGame(ctx, gameId),
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
 *  3. **Feed rows.** A feed row points at a character too, and it is the one thing in
 *     this list that is history rather than state — which changes nothing about where it
 *     goes. `characters.remove` puts it in the same position for the same reason.
 *  4. **Characters and their vitals.** Nothing points at a character any more.
 *  5. **Scenes and their placements.** Their placements went with the tokens; the
 *     sweep is kept for the pathological row whose token had already vanished.
 *  6. **Handouts.** Nothing points at one except the game document, through
 *     `openImageId`, so this could sit anywhere before the last step — it is here
 *     because it is the same shape of thing as a scene: a row, its image, and a pointer
 *     on the game that goes away with the game.
 *  7. **Tracks.** The same shape again — a row, its blob, and a pointer on the game
 *     through `activeTrackId` — so it sits beside the handouts for the same reason. Its
 *     blobs are the largest, which affects nothing about the order and is worth knowing
 *     if this ever has to be split across transactions.
 *  8. **The game document**, which the scenes, handouts and tracks pointed at and which
 *     points back at one of each through `activeSceneId`, `openImageId` and
 *     `activeTrackId`. Those mutual pointers are why it is last and why nothing bothers
 *     clearing any of them on the way through.
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
    const feed = await deleteFeedInGame(ctx, game._id)
    const characters = await deleteCharactersInGame(ctx, game._id)
    const scenes = await deleteScenesInGame(ctx, game._id)
    const modalImages = await deleteModalImagesInGame(ctx, game._id)
    const tracks = await deleteTracksInGame(ctx, game._id)
    await ctx.db.delete('games', game._id)

    // The name and the code are read off the document before it goes, so the receipt
    // names the game rather than an id nobody can read back. ⚠️ A `feed` count equal to
    // MAX_FEED_ROWS_SWEPT means the sweep filled its window and rows were left behind
    // that nothing can reach afterwards — the one way this receipt can be short.
    return {
      name: game.name,
      code: game.code,
      counts: { scenes, tokens, characters, seats, modalImages, tracks, feed },
    }
  },
})

// ---------------------------------------------------------------------------
// TRANSITION ONLY — Milestone 14's sweep
// ---------------------------------------------------------------------------
//
// The **migrate** half of widen → migrate → narrow, driven by
// `scripts/migrate-sheets.mjs`. `convex/lib/migrate.ts` carries the six changes, the
// argument for each, and the two-deploy ordering that is the only way this lands at all.
//
// The pair below is `listByPrefix`/`purgeGame`'s shape a second time, and deliberately so
// — an `internalQuery` that says what would happen and an `internalMutation` that does it
// to one game. ⚠️ **Neither gets a public mutation**, for the reason the header of this
// file gives about `purgeGame`: an internal function does not have to answer *who* may
// run it, and a public face puts that question back where it needs an ADR rather than a
// line of code. Rewriting every character sheet in a deployment is if anything the
// stronger case for staying internal.
//
// ⚠️ **This module still reads no guarded table.** Every character and every vitals row
// is reached through `lib/characters.ts`, which hands back a `MigrationCounts` and never
// a row — the same discipline `countsFor` above keeps, arriving at a module whose whole
// job is rewriting the rows it may not look at.

/**
 * A game the sweep has work to do on: enough to recognise, no secret, and what would
 * change.
 *
 * Derived from `publicGameValidator` with the same two omissions `purgeCandidateValidator`
 * makes, and for the same reasons — a DM code printed to a terminal and pasted into a chat
 * window is a game handed over, and a game about to be swept has no interesting board.
 * Sharing the derivation rather than the constant, because the two tools print different
 * counts and nothing else.
 */
const migrationCandidateValidator = publicGameValidator
  .omit('activeSceneId', 'status')
  .extend({ counts: migrationCountsValidator })

/**
 * Every game with unswept documents in it, a page at a time.
 *
 * ⚠️ **Paginated where `listByPrefix` is not, and the difference is that there is no
 * prefix to be had.** That tool matches a name and counts only what it will print;
 * this one cannot know whether a game needs work without reading its characters, so
 * *every* game in the deployment is examined and the expensive half is unavoidable. At
 * `MAX_CHARACTERS_PER_GAME` of 200 that is up to 400 rows per game, so a fixed
 * `MAX_GAMES_SWEPT` of 500 would ask a single query for two hundred thousand documents
 * and be refused. The caller chooses the page size and drives the cursor; the CLI keeps
 * asking until `isDone`.
 *
 * **Filtered after the page rather than before it**, which is why a page can come back
 * empty while `isDone` is false. That is correct and the CLI is written for it: there is
 * no index on *needs migrating*, and there could not be — it is a question about the
 * contents of a `sheet` field.
 *
 * ⚠️ **A `QueryCtx` all the way down.** `planCharacterMigration` cannot write, because a
 * query cannot write, which is what makes the dry run's promise structural rather than a
 * flag somebody eventually defaults wrongly.
 */
export const listUnmigrated = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(migrationCandidateValidator),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('games').paginate(args.paginationOpts)

    const examined = await Promise.all(
      page.page.map(async (game) => ({
        _id: game._id,
        _creationTime: game._creationTime,
        name: game.name,
        code: game.code,
        createdByName: game.createdByName,
        counts: await planCharacterMigration(ctx, game._id),
      })),
    )

    return { ...page, page: examined.filter((game) => needsMigration(game.counts)) }
  },
})

/**
 * Sweep one game's characters and vitals, and hand back what changed.
 *
 * **One game per transaction**, matching `purgeGame` above and for its reason: a game
 * that refuses does not roll back the ones that worked, and the loop can report which one
 * it was instead of leaving the whole pass in doubt.
 *
 * ⚠️ **Safe to run twice, and the tests run it twice to prove it.** Every planner in
 * lib/migrate.ts answers null for a document that already agrees with the narrowed
 * schema, so a second pass writes nothing at all and returns six zeroes. That is what
 * makes this runnable against a deployment somebody is playing on — a game swept while a
 * session was in progress can simply be swept again.
 *
 * Takes a `gameId` rather than a code, for `purgeGame`'s reason: the CLI reads the id off
 * the listing, so the thing being written is the thing that was printed.
 */
export const migrateGame = internalMutation({
  args: { gameId: v.id('games') },
  returns: v.object({
    name: v.string(),
    code: v.string(),
    counts: migrationCountsValidator,
  }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get('games', args.gameId)
    if (!game) {
      // `purgeGame`'s stance, for `purgeGame`'s reason: the id came off a listing taken
      // moments earlier, so its absence means the listing and the deployment disagree,
      // and a tool rewriting documents is the wrong place to guess about that.
      throw new ConvexError({ kind: 'GameNotFound', message: 'No game with that id.' })
    }

    return {
      name: game.name,
      code: game.code,
      counts: await migrateCharactersInGame(ctx, game._id),
    }
  },
})
