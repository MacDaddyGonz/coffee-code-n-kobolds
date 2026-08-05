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

import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  countLegacyLayers,
  countTokensInGame,
  deleteTokensInGame,
  relabelGmLayer,
} from './lib/board'
import { countCharactersInGame, deleteCharactersInGame } from './lib/characters'
import { countFeedInGame, deleteFeedInGame } from './lib/feed'
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
// TRANSITION ONLY — the `dm` → `gm` layer rename
// ---------------------------------------------------------------------------
//
// ⚠️ **Both functions below are scaffolding and are deleted once the sweep has run against
// every deployment**, together with the fourth member of the layer union in
// `convex/schema.ts`, `relabelGmLayer` and `countLegacyLayers` in `convex/lib/board.ts`, and
// `scripts/relabel-layers.mjs`. They are the middle step of widen–migrate–narrow: the schema
// already accepts both spellings and nothing can create the old one, so what is left is to
// rewrite the rows that predate the rename and then take the widening back out. The query
// exists to prove the narrowing is safe — it has to read zero on every deployment before that
// commit lands — and the mutation exists to make it so.
//
// ⚠️ **Neither may ever become a public mutation**, for the reason in this file's header, and
// with one extra edge to it: `relabelDmLayer` takes a `gameId` and no code of any kind, so a
// public version would be an unauthenticated write to any game in the deployment. It is safe
// only because internal functions are absent from the generated API and reachable only by a
// caller who already holds deploy credentials.
//
// The `tokens` reads live in `convex/lib/board.ts` where the choke point is, not here — a
// migration is not an exemption from invariant 8, and `leakGuard.test.ts` sweeps this module
// like every other. What stays on this side is the `internalQuery`/`internalMutation`
// wrapper, which is the same split `purgeGame` above makes.

/**
 * Every game still holding a token on the legacy `dm` layer, with how many.
 *
 * Games with none are omitted, so a clean deployment prints an empty list and the operator
 * is looking at the answer rather than at five hundred zeroes.
 *
 * ⚠️ **One pass covers every game it can see, and the contrast with `listByPrefix` above is
 * a real difference rather than an inconsistency.** There, matching is cheap and *counting*
 * is expensive, so it matches five hundred games and counts the first fifty — a page, and a
 * re-run after the deletions makes progress because the deleted games have left the window.
 * Here the expensive read **is** the predicate: whether a game needs relabelling cannot be
 * known without reading its tokens. A fixed window of fifty would therefore show the same
 * fifty games for ever, relabelled or not, and a game at position fifty-one could never be
 * reached at all — a migration tool that cannot finish.
 *
 * So the cost is stated instead of hidden. The scan is bounded by `MAX_GAMES_SWEPT` and each
 * count by `MAX_TOKENS_PER_GAME`, and the product of those two is above the number of
 * documents one Convex query may read. A deployment large enough to hit that gets a **failed
 * query rather than a short list**, which is the right failure for a tool whose entire job is
 * to prove a number is zero: an under-report here would retire the widening while rows still
 * carried the old spelling, and those rows would then fail validation on read. The dev and
 * production deployments hold tens of games of a handful of tokens each; the deployment where
 * this stops being true wants a cursor-driven migration, not a bigger number here.
 *
 * `truncated` is `listByPrefix`'s flag for `listByPrefix`'s reason — a tool that
 * under-reports looks finished when it is not — with only one of its two terms, because every
 * game that was swept is also counted and there is no second window to overflow.
 */
export const gamesWithLegacyLayers = internalQuery({
  args: {},
  returns: v.object({
    truncated: v.boolean(),
    games: v.array(
      v.object({
        _id: v.id('games'),
        name: v.string(),
        code: v.string(),
        legacy: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const swept = await ctx.db.query('games').take(MAX_GAMES_SWEPT)

    const counted = await Promise.all(
      swept.map(async (game) => ({
        _id: game._id,
        name: game.name,
        // The code is printed so the operator can open the game and look at the board
        // afterwards, which is the only way to confirm by eye that a relabelled token is
        // still where it was and still hidden.
        code: game.code,
        legacy: await countLegacyLayers(ctx, game._id),
      })),
    )

    return {
      truncated: swept.length === MAX_GAMES_SWEPT,
      games: counted.filter((game) => game.legacy > 0),
    }
  },
})

/**
 * Rewrite one game's `dm` layers to `gm`.
 *
 * One game per call, which makes the transaction a game: a run over thirty of them is thirty
 * transactions, so a game that refuses does not roll back the twenty-nine that worked and the
 * script can name the one that failed. `prune-games.mjs` makes the same choice for the same
 * reason, and `relabelGmLayer` carries the argument for why two hundred rows does not need
 * `@convex-dev/migrations` behind it.
 *
 * Takes a `gameId` rather than a code, like `purgeGame`: the CLI reads the id off the listing
 * above, so the game being rewritten is the game that was printed, with no second lookup in
 * between that could resolve to a different row.
 *
 * **Idempotent, and that is worth relying on.** `relabelGmLayer` patches only the rows that
 * still carry the old spelling, so a second run over a game that has already been swept writes
 * nothing at all and reports zero — which is what makes re-running the script after a partial
 * failure the obvious thing to do rather than a risk.
 */
export const relabelDmLayer = internalMutation({
  args: { gameId: v.id('games') },
  returns: v.object({
    name: v.string(),
    code: v.string(),
    relabelled: v.number(),
  }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get('games', args.gameId)
    if (!game) {
      // Thrown rather than shrugged off, for `purgeGame`'s reason: the id came off a listing
      // taken moments earlier, so its absence means the listing and this call disagree about
      // the deployment, and a tool doing a one-way rewrite is the wrong place to guess.
      throw new ConvexError({ kind: 'GameNotFound', message: 'No game with that id.' })
    }

    return {
      name: game.name,
      code: game.code,
      relabelled: await relabelGmLayer(ctx, game._id),
    }
  },
})
