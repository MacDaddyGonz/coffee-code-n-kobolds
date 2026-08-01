import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  DM_CODE_LENGTH,
  JOIN_CODE_LENGTH,
  generateCode,
  recoveryPhraseProblem,
} from './lib/codes'
import { requireDisplayName, requireGameName } from './lib/names'
import {
  MAX_GAMES_ON_LANDING,
  dmCodeMatches,
  findGameByCode,
  getGameByCode,
  hashRecoveryPhrase,
  moveDmBadgeTo,
  publicGame,
  publicGameListing,
  publicGameListingValidator,
  publicGameValidator,
  randomSalt,
  recoveryPhraseMatches,
  requireDm,
} from './lib/games'
import { getSeatInGame, joinSeat } from './lib/players'

/**
 * The join code has to be unique. Nine attempts against a 31^6 space with a
 * handful of live games is astronomically more than enough; the loop exists so
 * a collision fails loudly rather than silently overwriting.
 */
const CODE_ATTEMPTS = 9

/**
 * The minimum is measured on the normalised phrase and the maximum on the raw
 * argument, deliberately. Padding must not buy its way past the minimum, because
 * that is the length the phrase is worth guessing against; the maximum is there
 * to bound what gets handed to the hash, which is the raw string.
 */
/**
 * Defers to the same predicate both "choose a phrase" forms use, so the client
 * cannot accept a phrase this is about to reject. The phrase stands in as its own
 * confirmation, which leaves only the two length rules — there is no second field
 * to compare on this side of the wire.
 */
function requireRecoveryPhrase(raw: string) {
  const problem = recoveryPhraseProblem(raw, raw)
  if (problem) throw new ConvexError({ kind: 'BadInput', message: problem.message })
}

export const create = mutation({
  args: {
    name: v.string(),
    dmName: v.string(),
    recoveryPhrase: v.string(),
  },
  returns: v.object({ code: v.string(), dmCode: v.string() }),
  handler: async (ctx, args) => {
    const name = requireGameName(args.name)
    const dmName = requireDisplayName(args.dmName, 'Enter your display name.')
    requireRecoveryPhrase(args.recoveryPhrase)

    let code: string | null = null
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateCode(JOIN_CODE_LENGTH)
      const taken = await ctx.db
        .query('games')
        .withIndex('by_code', (q) => q.eq('code', candidate))
        .unique()
      if (!taken) {
        code = candidate
        break
      }
    }
    if (!code) {
      throw new ConvexError({
        kind: 'CodeExhausted',
        message: 'Could not allocate a join code. Try again.',
      })
    }

    const dmCode = generateCode(DM_CODE_LENGTH)
    const dmRecoverySalt = randomSalt()

    const gameId = await ctx.db.insert('games', {
      name,
      code,
      createdByName: dmName,
      dmCode,
      dmRecoverySalt,
      dmRecoveryHash: await hashRecoveryPhrase(dmRecoverySalt, args.recoveryPhrase),
      // Written explicitly rather than left to `gameStatus`'s default, so the
      // default only ever covers games created before Milestone 2.
      status: 'lobby',
    })

    // The creator gets a seat straight away, so the lobby is never empty and the
    // DM appears in the roster like anyone else — which is why it goes through
    // the same joinSeat every other arrival uses rather than its own insert.
    const { playerId } = await joinSeat(ctx, gameId, dmName)
    const seat = await getSeatInGame(ctx, gameId, playerId)
    await moveDmBadgeTo(ctx, seat)

    return { code, dmCode }
  },
})

/**
 * The games on the landing page: the most recent handful, newest first.
 *
 * ⚠️ **The only query in this application a browser can call with no credential of
 * any kind**, which is why `publicGameListingValidator` is a narrower shape than
 * `publicGameValidator` and why the reasoning for every field it drops lives beside
 * that projection rather than here. There is no join code in the payload: a row says
 * a game exists, and the code is still what admits you to it.
 *
 * `order('desc')` on the implicit `by_creation_time` index, so this is an **index
 * scan and not a sort** — the newest thirty rows are the first thirty the scan walks,
 * and it stops there. No new index is needed, which matters because `games` carries
 * only `by_code` and adding a second would be paid for by every write to the table.
 * Reversing this into "oldest first" would be the same read; sorting the whole table
 * in JavaScript to get either would not.
 *
 * **No arguments at all** — no limit, no prefix, no cursor — and that is a deliberate
 * choice rather than a feature not yet written. Every argument is an axis of the query
 * cache key, so a `limit` a client picked would fragment one shared subscription into
 * one entry per distinct value a browser happened to send. `{}` is a single cache
 * entry and a single server execution shared by every browser sitting on the landing
 * page, which is the right shape for a query that is identical for all of them. The
 * bound therefore lives on the server, as `MAX_GAMES_ON_LANDING`, where the client
 * cannot move it.
 */
export const list = query({
  args: {},
  returns: v.array(publicGameListingValidator),
  handler: async (ctx) => {
    const games = await ctx.db.query('games').order('desc').take(MAX_GAMES_ON_LANDING)
    return games.map(publicGameListing)
  },
})

/**
 * Returns null rather than throwing so an unknown code renders as a message.
 * The `returns` validator is what keeps the DM secrets out of the payload.
 */
export const getByCode = query({
  args: { code: v.string() },
  returns: v.union(publicGameValidator, v.null()),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    return game ? publicGame(game) : null
  },
})

/**
 * Is this DM code right for this game? Asked at the door, before anybody sits down.
 *
 * It exists because without it the only way to find out is `elevateDm`, which needs a
 * seat — so a mistyped code seats you, the client's restore effect quietly discards
 * the code it could not use, and you land on the board as a plain player with nothing
 * on screen saying why. That is the failure this door was built to remove, and doing
 * it this way lets the message appear under the field where the code was typed.
 *
 * ⚠️ **A query and not a mutation, and that is the load-bearing half of it.** The DM
 * badge follows a *seat*, and this call has no seat — it is asked before a display
 * name has been chosen, and answering it must not create one or move a badge to one.
 * `elevateDm` stays the only thing that moves the badge. Being a query makes that
 * structural rather than remembered: a query cannot write, so no later edit here can
 * quietly acquire a side effect on the roster. Anything that would need one belongs in
 * `elevateDm`, not in a second writer.
 *
 * ⚠️ **It hands back no game, no code and no seat.** `resolveDmAccess` returns the
 * game document beside the verdict and this deliberately drops it, keeping the return
 * to a bare boolean. A caller that received the game alongside the answer would be one
 * refactor away from treating the payload as *proof* — and it is not proof of
 * anything. Holding the DM code is what authorises a call, re-checked by `requireDm`
 * on every single one (CLAUDE.md invariant 7); a `true` from here authorises nothing
 * and expires the moment it is read.
 *
 * An unknown join code answers `false` rather than throwing, for the same reason
 * `getByCode` returns null: the caller is a form with a field to render the answer
 * beside, and a rejection is the same sentence either way. It does **not** distinguish
 * *no such game* from *wrong code*, and the reason is worth stating precisely, because
 * the tempting one is wrong: this is **not** what stops join codes being enumerated.
 * `getByCode` already answers that question directly and always has — a join code is
 * the credential everybody at the table holds, not a secret. The reason is smaller and
 * real: by the time this is asked the caller has *already* resolved the game one step
 * earlier, so a second failure shape would carry no information it does not have and
 * would only invite a caller to branch on it.
 *
 * ⚠️ **This is a new oracle and says so plainly.** Testing a DM code no longer needs a
 * seat in the game. The friction that removes is close to nil — `players.join` is
 * ungated, so anybody holding the join code could already take a seat and loop
 * `elevateDm` against it — and ADR 0003's no-lockout reasoning applies verbatim: the
 * codes come from `crypto.getRandomValues` over a 31^8 space and cannot be enumerated,
 * while a failed-attempt lockout would let anyone holding the *join* code lock the real
 * DM out of their own game. What genuinely changes is that a wrong guess now leaves no
 * seat behind in the roster, so the DM does not see the attempt. Against an audience of
 * trusted colleagues that is a cosmetic loss; it is written down because the sentence
 * that stops being true is the one worth recording.
 */
export const checkDmCode = query({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code)
    return game !== null && dmCodeMatches(game, args.dmCode)
  },
})

/**
 * A browser that holds the DM code says so; the badge moves to its seat. Real
 * DM authority is not granted here — it is re-checked from the code on every
 * DM-only call. This only keeps the roster honest about who is running things.
 */
export const elevateDm = mutation({
  args: { code: v.string(), dmCode: v.string(), playerId: v.id('players') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    // Takes the seat id rather than a display name: the caller is already seated
    // by the time it can ask for the badge, and a name held in client state goes
    // stale the moment that seat is renamed — which would badge a brand new
    // phantom seat under the old name instead of the caller.
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    await moveDmBadgeTo(ctx, seat)
    return null
  },
})

/**
 * The in-app recovery path: game code plus recovery phrase hands back the DM
 * code, so a cleared browser months later is a nuisance rather than a lockout.
 *
 * There is deliberately no failed-attempt lockout. A lockout would let anyone
 * holding the join code lock the real DM out of their own game, which is a
 * worse outcome than brute force against a code nobody can enumerate.
 */
export const recoverDmCode = mutation({
  args: { code: v.string(), recoveryPhrase: v.string(), playerId: v.id('players') },
  returns: v.object({ dmCode: v.string() }),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    if (!(await recoveryPhraseMatches(game, args.recoveryPhrase))) {
      throw new ConvexError({
        kind: 'BadRecoveryPhrase',
        message: 'That recovery phrase does not match.',
      })
    }
    const seat = await getSeatInGame(ctx, game._id, args.playerId)
    await moveDmBadgeTo(ctx, seat)
    return { dmCode: game.dmCode }
  },
})

export const setRecoveryPhrase = mutation({
  args: { code: v.string(), dmCode: v.string(), recoveryPhrase: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    requireRecoveryPhrase(args.recoveryPhrase)

    // New salt as well, so the stored hash cannot be compared against the old one.
    const dmRecoverySalt = randomSalt()
    await ctx.db.patch('games', game._id, {
      dmRecoverySalt,
      dmRecoveryHash: await hashRecoveryPhrase(dmRecoverySalt, args.recoveryPhrase),
    })
    return null
  },
})

export const rename = mutation({
  args: { code: v.string(), dmCode: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    await ctx.db.patch('games', game._id, { name: requireGameName(args.name) })
    return null
  },
})

/**
 * Moves the whole table from the lobby to the board. `status` is on the game
 * document precisely so this is one write rather than a message to each client:
 * everyone is already subscribed to `getByCode`, so they all turn over together
 * on the DM's click.
 *
 * Refused when there is no active scene. The DM would otherwise flip six people
 * to a blank canvas with no way back except finding the button again, and the
 * fault would look like a broken app rather than a missing map. A refusal names
 * the thing to do instead.
 */
export const start = mutation({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    if (!game.activeSceneId) {
      throw new ConvexError({
        kind: 'BadInput',
        message: 'Upload a map and make it the active scene before starting.',
      })
    }
    await ctx.db.patch('games', game._id, { status: 'playing' })
    return null
  },
})

/**
 * The way back, and unconditional — unlike `start`, which has a precondition. The
 * lobby renders from the roster alone, so there is no state in which returning to
 * it shows nothing, and it is also the escape hatch from a board that has gone
 * wrong. A guard here would be a guard on the recovery path.
 *
 * Nothing about the board is touched: scenes, tokens and their positions all
 * survive, so this is a view for the group rather than a reset of the game.
 */
export const returnToLobby = mutation({
  args: { code: v.string(), dmCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    await ctx.db.patch('games', game._id, { status: 'lobby' })
    return null
  },
})
