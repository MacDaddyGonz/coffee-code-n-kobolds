import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  DM_CODE_LENGTH,
  JOIN_CODE_LENGTH,
  MAX_GAME_NAME_LENGTH,
  MAX_RECOVERY_PHRASE_LENGTH,
  MIN_RECOVERY_PHRASE_LENGTH,
  generateCode,
  nameKeyFor,
  normaliseDisplayName,
  normaliseRecoveryPhrase,
} from './lib/codes'
import {
  findGameByCode,
  gameError,
  getGameByCode,
  hashRecoveryPhrase,
  moveDmBadgeTo,
  publicGame,
  publicGameValidator,
  randomSalt,
  recoveryPhraseMatches,
  requireDm,
} from './lib/games'
import { joinSeat } from './lib/players'

/**
 * The join code has to be unique. Nine attempts against a 31^6 space with a
 * handful of live games is astronomically more than enough; the loop exists so
 * a collision fails loudly rather than silently overwriting.
 */
const CODE_ATTEMPTS = 9

export const create = mutation({
  args: {
    name: v.string(),
    dmName: v.string(),
    recoveryPhrase: v.string(),
  },
  returns: v.object({ code: v.string(), dmCode: v.string() }),
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, MAX_GAME_NAME_LENGTH)
    if (!name) throw new ConvexError({ kind: 'BadInput', message: 'Give the game a name.' })

    const dmName = normaliseDisplayName(args.dmName)
    if (!dmName) throw new ConvexError({ kind: 'BadInput', message: 'Enter your display name.' })

    const phrase = normaliseRecoveryPhrase(args.recoveryPhrase)
    if (phrase.length < MIN_RECOVERY_PHRASE_LENGTH) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `The recovery phrase needs at least ${MIN_RECOVERY_PHRASE_LENGTH} characters.`,
      })
    }
    if (args.recoveryPhrase.length > MAX_RECOVERY_PHRASE_LENGTH) {
      throw new ConvexError({ kind: 'BadInput', message: 'That recovery phrase is too long.' })
    }

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
    })

    // The creator gets a seat straight away, so the lobby is never empty and the
    // DM appears in the roster like anyone else.
    await ctx.db.insert('players', {
      gameId,
      displayName: dmName,
      nameKey: nameKeyFor(dmName),
      isDm: true,
    })

    return { code, dmCode }
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
 * A browser that holds the DM code says so; the badge moves to its seat. Real
 * DM authority is not granted here — it is re-checked from the code on every
 * DM-only call. This only keeps the roster honest about who is running things.
 */
export const elevateDm = mutation({
  args: { code: v.string(), dmCode: v.string(), displayName: v.string() },
  returns: v.object({ playerId: v.id('players') }),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)
    const { playerId } = await joinSeat(ctx, game._id, args.displayName)
    await moveDmBadgeTo(ctx, playerId)
    return { playerId }
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
  args: { code: v.string(), recoveryPhrase: v.string(), displayName: v.string() },
  returns: v.object({ dmCode: v.string(), playerId: v.id('players') }),
  handler: async (ctx, args) => {
    const game = await getGameByCode(ctx, args.code)
    if (!(await recoveryPhraseMatches(game, args.recoveryPhrase))) {
      throw gameError('BadRecoveryPhrase', 'That recovery phrase does not match.')
    }
    const { playerId } = await joinSeat(ctx, game._id, args.displayName)
    await moveDmBadgeTo(ctx, playerId)
    return { dmCode: game.dmCode, playerId }
  },
})

export const setRecoveryPhrase = mutation({
  args: { code: v.string(), dmCode: v.string(), recoveryPhrase: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await requireDm(ctx, args.code, args.dmCode)

    const phrase = normaliseRecoveryPhrase(args.recoveryPhrase)
    if (phrase.length < MIN_RECOVERY_PHRASE_LENGTH) {
      throw new ConvexError({
        kind: 'BadInput',
        message: `The recovery phrase needs at least ${MIN_RECOVERY_PHRASE_LENGTH} characters.`,
      })
    }
    if (args.recoveryPhrase.length > MAX_RECOVERY_PHRASE_LENGTH) {
      throw new ConvexError({ kind: 'BadInput', message: 'That recovery phrase is too long.' })
    }

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
    const name = args.name.trim().slice(0, MAX_GAME_NAME_LENGTH)
    if (!name) throw new ConvexError({ kind: 'BadInput', message: 'Give the game a name.' })
    await ctx.db.patch('games', game._id, { name })
    return null
  },
})
