import { ConvexError, v, type Infer } from 'convex/values'

import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { normaliseDmCode, normaliseJoinCode, normaliseRecoveryPhrase } from './codes'

/**
 * Read bounds for the per-game lists. A D&D Lite table holds a handful of
 * seats and characters, so these are never reached in practice — they exist so
 * that no query in this app is unbounded, per the Convex guidelines. Use them
 * instead of `.collect()` when reading a game's seats or characters.
 */
export const MAX_SEATS_PER_GAME = 50
export const MAX_CHARACTERS_PER_GAME = 200
export const MAX_SCENES_PER_GAME = 25
export const MAX_TOKENS_PER_GAME = 200

/**
 * A read bound only, and never a write check — which is why `board.addToken`
 * enforces MAX_TOKENS_PER_GAME and nothing else.
 *
 * A token holds at most one placement per scene, so the placements on one scene
 * can never outnumber the tokens in the game, and that count is already capped.
 * The bound is structural, so a per-scene guard could not fire: it would imply a
 * risk that is not there and cost a read on every `addToken` to say so.
 *
 * It is still the correct and necessary bound on the `visiblePositions` read.
 * Placements per scene is the axis that query iterates, so bounding it by the
 * per-game token count would be bounding it by the wrong thing even though the
 * two numbers happen to agree. It simply can never truncate — and anyone raising
 * MAX_TOKENS_PER_GAME has to raise this with it to keep that true.
 */
export const MAX_PLACEMENTS_PER_SCENE = 200

/**
 * The two maintenance bounds on a sweep of the `games` table itself — bounds on the
 * *deployment* rather than on one game, and the only ones that can genuinely truncate.
 *
 * Everything above bounds a list one table holds a handful of, so none of them is
 * ever reached in practice. These bound the *deployment*, which grows by one game
 * every time `npm run test:smoke` runs and had reached seventy-one before anything
 * could delete one. Truncation here is therefore a real state rather than a
 * theoretical one, and `admin.listByPrefix` reports it as a flag rather than
 * quietly showing a short list: a purge tool that under-reports looks finished
 * when it is not.
 *
 * Two numbers rather than one, because the two reads cost wildly different things.
 * `MAX_GAMES_SWEPT` bounds a scan of small documents. `MAX_GAMES_LISTED` bounds how
 * many of the *matches* are counted, and a count is four bounded reads over four
 * tables — up to four hundred and seventy-five rows for one game. Fifty of those is
 * already the largest read anything in this application performs, and five hundred
 * of them would exceed what a single Convex query may read.
 *
 * ⚠️ **These two are still maintenance only, and nothing else may borrow them.**
 * `games.list` is the one player-facing read of more than one game, and it has its
 * own bound below precisely so that stays true: it reads only the small game
 * documents and counts nothing, so the expensive property these two exist to bound
 * — four bounded reads over four tables, per game — belongs to `admin.listByPrefix`
 * alone. A landing page reaching for `MAX_GAMES_LISTED` because the number looked
 * about right would inherit a bound sized for a completely different read.
 */
export const MAX_GAMES_SWEPT = 500
export const MAX_GAMES_LISTED = 50

/**
 * How many games the landing page publishes: the third bound on this table, and the
 * **first one a player's browser can reach**. The other two answer to a CLI run by
 * somebody holding deploy credentials; this one answers to anybody who loads the site.
 *
 * Thirty because truncation costs nothing here. A game that falls off the end is
 * still joinable by its code — which is exactly why the *Join with a code* panel
 * stays beside the list rather than being replaced by it — so the list is a
 * convenience for finding a game you already belong to, not the only door to one.
 *
 * That is also why there is **no `truncated` flag, no search and no pagination**,
 * and the contrast with `admin.listByPrefix` is the whole argument. There the flag
 * is not decoration: an operator deletes what they were shown, and a purge tool that
 * silently under-reports looks finished when it is not. Here an under-reporting list
 * costs a person one extra field to type, and the panel that takes it is already on
 * the screen. Adding machinery to close that gap would be paying for a problem the
 * layout already solves.
 *
 * ⚠️ Cheap in a way `MAX_GAMES_LISTED` is not, and the two must not be conflated.
 * That one bounds *counts* — four bounded reads over four tables for every game it
 * prints. This bounds a scan of small documents and counts nothing at all, which is
 * what makes a query every idle browser on the landing page subscribes to affordable.
 */
export const MAX_GAMES_ON_LANDING = 30

/**
 * How many feed lines a client is sent: the newest sixty, which is the scrollback the
 * rolls panel renders.
 *
 * **Bounded at the read, like every read in this application.** `visibleFeed` in
 * lib/feed.ts takes this many in `desc` order and never calls `.collect()`. That is the
 * whole of the mechanism, and the two things it deliberately does *not* do are worth
 * more words than the number is.
 *
 * ⚠️ **Nothing trims the table on the write path, and that is invariant 2 applied
 * rather than ignored.** The tempting shape is a count-and-delete beside every insert,
 * so that the table stays sixty rows long for ever — and that is precisely a range read
 * in a hot write path, which is the thing invariant 2 exists to forbid. Every roll at
 * the table would put the game's whole feed range into its transaction's read set, so
 * two players rolling at once would conflict over rows neither of them wrote. Note
 * which half of invariant 2 that is: a feed is a few rolls a minute, not the ten writes
 * a second a drag makes, so the *rate* is not the concern here — the **growth** is, and
 * growth and rate want different answers. Bounding the read answers growth and costs the
 * write nothing at all.
 *
 * The growth is affordable to leave alone. A row is a subject, an expression, a handful
 * of dice and two short strings — a few hundred bytes — so a year of weekly sessions is
 * single-digit megabytes, and it goes with the game when `admin.purgeGame` takes it
 * (`npm run prune-games`).
 *
 * ⚠️ **No `truncated` flag**, for `MAX_GAMES_ON_LANDING`'s stated reason and against
 * `admin.listByPrefix`'s. There the flag is not decoration, because an operator deletes
 * what they were shown. Here sixty lines is a **scrollback and not a search**: nobody
 * acts on the end of it, so an under-reporting list costs a reader nothing, while a flag
 * no component renders is one more field to keep in step with the projection. Paging
 * back through a session's history would need a cursor and a screen to put one on;
 * neither exists, and half of one built here is how a field arrives that nothing reads.
 */
export const MAX_FEED_ROWS_LISTED = 60

/**
 * The second bound on the same table, and a maintenance one: how many feed rows
 * `admin.purgeGame` sweeps, and how many `countFeedInGame` counts for its receipt.
 *
 * One number serving both reads deliberately, so the dry run and the purge cannot
 * disagree about what is there — the relationship `MAX_TOKENS_PER_GAME` already has to
 * `countTokensInGame` and `deleteTokensInGame`. A receipt that promises a number the
 * sweep does not reach is the only sign anybody would get that something was written to
 * the game between the two calls, which is what `purgeCountsValidator` is for.
 *
 * ⚠️ **It is the one bound in `purgeGame` that can genuinely truncate, and truncation
 * there leaves residue nothing can name.** Every other count in that receipt is bounded
 * by a limit the application itself enforces — two hundred tokens, two hundred
 * characters — so those sweeps cannot come up short. Nothing caps the feed, by the
 * decision above, so a game with more rows than this loses its game document and keeps
 * its feed, and no query can reach the leftovers afterwards. Two thousand is far more
 * than a smoke run (which writes none at all) or a real session (a few hundred rolls)
 * produces, and a count that comes back at exactly this number is the signal to look.
 *
 * The alternative was a delete that loops across transactions, and it is refused here
 * rather than judged unnecessary: that is what a genuine per-game delete path needs, and
 * Milestone 12 owns that decision together with the question of *who may ask for it*
 * (see the header of `convex/admin.ts`). A maintenance script does not get to invent it.
 *
 * ⚠️ **Nothing player-facing may borrow this number.** `MAX_FEED_ROWS_LISTED` above is
 * the bound a browser reaches, and it is sized for a panel rather than for a sweep —
 * exactly the distinction the two `MAX_GAMES_*` bounds keep against
 * `MAX_GAMES_ON_LANDING`.
 */
export const MAX_FEED_ROWS_SWEPT = 2000

/**
 * Whether the group is still gathering or already on the board, spelled once.
 *
 * The schema, the public projection and `gameStatus` below all need this union, and
 * three copies of a two-member union is three places to forget the third member a
 * later milestone adds. `GameStatus` is the same statement as a TypeScript type, so
 * the two cannot drift either.
 */
export const gameStatusValidator = v.union(v.literal('lobby'), v.literal('playing'))
export type GameStatus = Infer<typeof gameStatusValidator>

/**
 * The only shape of a game a public query may return.
 *
 * `dmCode`, `dmRecoverySalt` and `dmRecoveryHash` are absent by construction.
 * Declaring this as a query's `returns:` validator means Convex throws at
 * runtime if one of them is ever added to a projection by accident — the leak
 * guard for CLAUDE.md invariant 1 is mechanical, not vigilance.
 */
export const publicGameValidator = v.object({
  _id: v.id('games'),
  _creationTime: v.number(),
  name: v.string(),
  code: v.string(),
  createdByName: v.string(),
  // Which board everyone is on, and whether the game has started. Neither is a
  // secret — every client needs both to know what to render — and note what they
  // are not: the *contents* of that scene still go through lib/board.ts, which is
  // where the DM layer is filtered out. Naming a scene reveals nothing.
  activeSceneId: v.union(v.id('scenes'), v.null()),
  status: gameStatusValidator,
})

export function publicGame(game: Doc<'games'>) {
  return {
    _id: game._id,
    _creationTime: game._creationTime,
    name: game.name,
    code: game.code,
    createdByName: game.createdByName,
    // Normalised to null rather than left undefined: `undefined` is not a Convex
    // value, so an optional field has to become something on the way out.
    activeSceneId: game.activeSceneId ?? null,
    status: gameStatus(game),
  }
}

/**
 * The shape of a game on the landing page, for a caller who has typed nothing.
 *
 * Derived with `.omit()` rather than spelled out, for the reason `admin.ts`'s
 * `purgeCandidateValidator` is: the three DM secrets are absent by construction
 * there, so they are absent by construction here too, and a fourth secret added to
 * the `games` table cannot arrive in this payload either.
 *
 * ⚠️ **But `.omit()` is a subtractive spec, and here it subtracts across two
 * different audiences.** `publicGameValidator` says what a caller **holding the join
 * code** may see. This says what a caller holding **nothing at all** may see — every
 * browser that loads the site, with no credential of any kind. Subtraction only
 * guarantees the fields named are gone; a new *non-secret* field added upstream for
 * the code-holding audience arrives here silently and widens the second one. The
 * guard for that is the key-set test in `games.test.ts`, which pins
 * `Object.keys(row).sort()` to exactly five names, and it is **not optional** — it is
 * the only thing standing between an upstream addition and a wider audience than
 * anybody chose.
 *
 * Field by field, since a projection whose reasoning is not written down is a
 * projection somebody widens:
 *
 * - `code` is **dropped**. A row on the landing page says a game exists; the code is
 *   still what admits you to it, and printing it beside the name would make the list
 *   a directory of open doors rather than a list of games.
 * - `activeSceneId` is **dropped**. A scene id means nothing off the board — there is
 *   no canvas on this page to point it at, and nothing here can render one.
 * - `status` is **kept**. "In play" against "in the lobby" is what tells a person
 *   whether they are late, which is the one thing about a game they want to know
 *   before opening it.
 */
export const publicGameListingValidator = publicGameValidator.omit('code', 'activeSceneId')

export function publicGameListing(game: Doc<'games'>) {
  return {
    _id: game._id,
    _creationTime: game._creationTime,
    name: game.name,
    createdByName: game.createdByName,
    status: gameStatus(game),
  }
}

/**
 * The only place the stored `status` is read.
 *
 * The field is optional in the schema because adding a required one to a table
 * that already has rows fails the schema push, and widen–migrate–narrow costs two
 * deploys to delete one `??` from a game with three players. `games.create` has
 * written it since Milestone 2, so the default only ever applies to games made
 * before then.
 */
export function gameStatus(game: Doc<'games'>): GameStatus {
  return game.status ?? 'lobby'
}

/** Returns null for an unknown code — for queries that render "no such game". */
export async function findGameByCode(
  ctx: QueryCtx,
  rawCode: string,
): Promise<Doc<'games'> | null> {
  return await ctx.db
    .query('games')
    .withIndex('by_code', (q) => q.eq('code', normaliseJoinCode(rawCode)))
    .unique()
}

/** Throws for an unknown code — for mutations, where there is nothing to render. */
export async function getGameByCode(ctx: QueryCtx, rawCode: string): Promise<Doc<'games'>> {
  const game = await findGameByCode(ctx, rawCode)
  if (!game) throw new ConvexError({ kind: 'GameNotFound', message: 'No game with that code.' })
  return game
}

/**
 * Does this string authorise the caller as this game's DM? The comparison itself,
 * with nothing else attached.
 *
 * Extracted because three callers need the same answer and only two of them want the
 * same *shape* around it: `resolveDmAccess` wants it beside the game document,
 * `requireDm` wants it as a throw, and `games.checkDmCode` wants the bare boolean and
 * deliberately nothing else. Written out three times, the normalisation and the
 * compare are three places for a later change — a different normaliser, a longer
 * code — to be applied twice.
 *
 * `normaliseDmCode` and not `normaliseJoinCode`, which is the whole reason the pair
 * travels together rather than each caller reaching for whichever it remembers: the
 * join field forgives out-of-alphabet characters, and the check on the app's only
 * bearer secret must not.
 *
 * `undefined` answers `false` rather than being an error, because a player's client
 * genuinely has no code to send and that is the ordinary case, not a mistake.
 */
export function dmCodeMatches(game: Doc<'games'>, rawDmCode: string | undefined): boolean {
  if (rawDmCode === undefined) return false
  return secretsMatch(normaliseDmCode(rawDmCode), game.dmCode)
}

/**
 * The app's only authorisation primitive.
 *
 * A `playerId` argument is routing, not identity, and `players.isDm` is a
 * display flag — neither may ever gate access to anything. Holding the DM code
 * is what makes you the DM, and it is re-checked on every DM-only call. See
 * ADR 0003.
 *
 * This is the answering form, for a query that must serve both audiences from
 * one subscription: return the DM layer when `isDm`, omit it otherwise. `dmCode`
 * is optional because a player's client has none to send. `requireDm` below is
 * the same check with a throw, defined in terms of this one so the two can never
 * disagree about what a valid code is.
 */
export async function resolveDmAccess(
  ctx: QueryCtx,
  rawCode: string,
  dmCode?: string,
): Promise<{ game: Doc<'games'>; isDm: boolean }> {
  const game = await getGameByCode(ctx, rawCode)
  return { game, isDm: dmCodeMatches(game, dmCode) }
}

/** The demanding form, for the DM-only mutations. */
export async function requireDm(
  ctx: QueryCtx,
  rawCode: string,
  dmCode: string,
): Promise<Doc<'games'>> {
  const { game, isDm } = await resolveDmAccess(ctx, rawCode, dmCode)
  if (!isDm) {
    throw new ConvexError({ kind: 'NotDm', message: 'That DM code is not right for this game.' })
  }
  return game
}

/**
 * Length-independent compare. Cheap insurance rather than a meaningful defence
 * — the DM code is short and the threat model is two people in one office —
 * but there is no reason to leak a prefix match through timing.
 */
function secretsMatch(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0')
  }
  return out
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/**
 * The recovery phrase itself is never stored — only a salted SHA-256 of it, so
 * the database never holds the thing that hands over the DM code.
 */
export async function hashRecoveryPhrase(salt: string, phrase: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${salt}:${normaliseRecoveryPhrase(phrase)}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return toHex(new Uint8Array(digest))
}

export async function recoveryPhraseMatches(
  game: Doc<'games'>,
  phrase: string,
): Promise<boolean> {
  const candidate = await hashRecoveryPhrase(game.dmRecoverySalt, phrase)
  return secretsMatch(candidate, game.dmRecoveryHash)
}

/**
 * Exactly one seat carries the DM badge. Called after a successful DM code or
 * recovery-phrase check; the badge is cosmetic, so this is bookkeeping for the
 * roster rather than a privilege grant.
 */
export async function moveDmBadgeTo(ctx: MutationCtx, player: Doc<'players'>) {
  // Grant before revoking. The seat list is read with a bound, and if the target
  // ever fell outside that window a revoke-then-grant order would clear the old
  // badge and never set the new one — leaving the game with no DM at all while
  // reporting success. This order can at worst leave two badges briefly; it can
  // never leave zero.
  if (!player.isDm) {
    await ctx.db.patch('players', player._id, { isDm: true })
  }

  const seats = await ctx.db
    .query('players')
    .withIndex('by_gameId', (q) => q.eq('gameId', player.gameId))
    .take(MAX_SEATS_PER_GAME)

  for (const seat of seats) {
    if (seat._id !== player._id && seat.isDm) {
      await ctx.db.patch('players', seat._id, { isDm: false })
    }
  }
}
