/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  CODE_ALPHABET,
  DM_CODE_LENGTH,
  JOIN_CODE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GAME_NAME_LENGTH,
  MAX_RECOVERY_PHRASE_LENGTH,
  MIN_RECOVERY_PHRASE_LENGTH,
} from './lib/codes'
import { MAX_GAMES_ON_LANDING, MAX_SEATS_PER_GAME } from './lib/games'

const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

const PHRASE = 'brass lantern'

async function createGame(
  t: Harness,
  overrides: { name?: string; dmName?: string; recoveryPhrase?: string } = {},
) {
  return await t.mutation(api.games.create, {
    name: overrides.name ?? 'Kobold Season',
    dmName: overrides.dmName ?? 'Mike',
    recoveryPhrase: overrides.recoveryPhrase ?? PHRASE,
  })
}

/** The stored row, DM secrets included — read directly so tests compare against reality. */
async function gameRow(t: Harness, code: string) {
  return await t.run(async (ctx) => {
    const game = await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
    if (!game) throw new Error(`no game stored under code ${code}`)
    return game
  })
}

async function seatsOf(t: Harness, code: string) {
  return await t.run(async (ctx) => {
    const game = await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
    if (!game) throw new Error(`no game stored under code ${code}`)
    return await ctx.db
      .query('players')
      .withIndex('by_gameId', (q) => q.eq('gameId', game._id))
      .collect()
  })
}

async function dmSeatNames(t: Harness, code: string) {
  const seats = await seatsOf(t, code)
  return seats.filter((seat) => seat.isDm).map((seat) => seat.displayName)
}

/** Takes a seat and hands back its id — elevateDm and recoverDmCode are given ids. */
async function join(t: Harness, code: string, displayName: string): Promise<Id<'players'>> {
  const { playerId } = await t.mutation(api.players.join, { code, displayName })
  return playerId
}

/** The id of an existing seat, for the creator's seat that `games.create` made. */
async function seatIdByName(t: Harness, code: string, displayName: string) {
  const seats = await seatsOf(t, code)
  const seat = seats.find((row) => row.displayName === displayName)
  if (!seat) throw new Error(`no seat called ${displayName} in game ${code}`)
  return seat._id
}

type ErrorKind =
  | 'BadInput'
  | 'NotDm'
  | 'BadRecoveryPhrase'
  | 'GameNotFound'
  | 'PlayerNotFound'
  | 'GameFull'

/**
 * convex-test rethrows the ConvexError itself, so the `{ kind, message }` payload
 * is readable on `.data`. A live client sees the same payload via `error.data`.
 */
async function expectRejection(promise: Promise<unknown>, kind: ErrorKind) {
  await expect(promise).rejects.toThrow()
  await expect(promise).rejects.toMatchObject({ data: { kind } })
}

/** Swaps the final character for its neighbour in the alphabet — same length, wrong code. */
function twiddleLast(code: string): string {
  const index = CODE_ALPHABET.indexOf(code[code.length - 1])
  const next = CODE_ALPHABET[(index + 1) % CODE_ALPHABET.length]
  return code.slice(0, -1) + next
}

function twiddleFirst(code: string): string {
  const index = CODE_ALPHABET.indexOf(code[0])
  const next = CODE_ALPHABET[(index + 1) % CODE_ALPHABET.length]
  return next + code.slice(1)
}

describe('games.create', () => {
  test('issues codes of the right length from the confusable-free alphabet', async () => {
    const t = harness()
    for (let i = 0; i < 12; i += 1) {
      const created = await createGame(t, { name: `Game ${i}` })
      expect(created.code).toHaveLength(JOIN_CODE_LENGTH)
      expect(created.dmCode).toHaveLength(DM_CODE_LENGTH)
      for (const char of `${created.code}${created.dmCode}`) {
        expect(CODE_ALPHABET).toContain(char)
      }
      expect(`${created.code}${created.dmCode}`).not.toMatch(/[ILO01]/)
    }
  })

  test('gives consecutive games distinct join and DM codes', async () => {
    const t = harness()
    const codes = new Set<string>()
    const dmCodes = new Set<string>()
    for (let i = 0; i < 8; i += 1) {
      const created = await createGame(t, { name: `Game ${i}` })
      codes.add(created.code)
      dmCodes.add(created.dmCode)
    }
    expect(codes.size).toBe(8)
    expect(dmCodes.size).toBe(8)
  })

  test('seats the creator with the DM badge so the roster is never empty', async () => {
    const t = harness()
    const created = await createGame(t, { dmName: '  Mike  the   DM ' })
    const seats = await seatsOf(t, created.code)
    expect(seats).toHaveLength(1)
    expect(seats[0]).toMatchObject({
      displayName: 'Mike the DM',
      nameKey: 'mike the dm',
      isDm: true,
    })
  })

  test('records the creator display name on the game for the lobby header', async () => {
    const t = harness()
    const created = await createGame(t, { dmName: 'Mike' })
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.createdByName).toBe('Mike')
  })

  test('trims a game name of exactly the maximum length and accepts it', async () => {
    const t = harness()
    const name = 'K'.repeat(MAX_GAME_NAME_LENGTH)
    // The limit is applied after trimming, so the padding must not count towards it.
    const created = await createGame(t, { name: `   ${name}   ` })
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe(name)
  })

  test('rejects an over-long game name rather than truncating it', async () => {
    const t = harness()
    for (const length of [MAX_GAME_NAME_LENGTH + 1, MAX_GAME_NAME_LENGTH + 40]) {
      await expectRejection(createGame(t, { name: 'K'.repeat(length) }), 'BadInput')
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query('games').collect()).toHaveLength(0)
      expect(await ctx.db.query('players').collect()).toHaveLength(0)
    })
  })

  test('accepts a creator display name of exactly the limit and rejects one over', async () => {
    const t = harness()
    const atLimit = 'M'.repeat(MAX_DISPLAY_NAME_LENGTH)
    const created = await createGame(t, { dmName: `  ${atLimit}  ` })
    expect((await seatsOf(t, created.code))[0].displayName).toBe(atLimit)

    await expectRejection(
      createGame(t, { name: 'Second', dmName: 'M'.repeat(MAX_DISPLAY_NAME_LENGTH + 1) }),
      'BadInput',
    )
    await t.run(async (ctx) => {
      expect(await ctx.db.query('games').collect()).toHaveLength(1)
      expect(await ctx.db.query('players').collect()).toHaveLength(1)
    })
  })

  test('rejects a game name that is blank or only whitespace', async () => {
    const t = harness()
    for (const name of ['', ' ', '   ', '\t', '\n \t ']) {
      await expectRejection(createGame(t, { name }), 'BadInput')
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query('games').collect()).toHaveLength(0)
      expect(await ctx.db.query('players').collect()).toHaveLength(0)
    })
  })

  test('rejects a display name that is blank or only whitespace', async () => {
    const t = harness()
    for (const dmName of ['', ' ', '\t\n  ']) {
      await expectRejection(createGame(t, { dmName }), 'BadInput')
    }
  })

  test('rejects a recovery phrase shorter than the minimum after normalisation', async () => {
    const t = harness()
    const tooShort = [
      '',
      '        ',
      '\t\n  \t',
      'a'.repeat(MIN_RECOVERY_PHRASE_LENGTH - 1),
      `   ${'a'.repeat(MIN_RECOVERY_PHRASE_LENGTH - 1)}   `,
      '  a b c  ',
    ]
    for (const recoveryPhrase of tooShort) {
      await expectRejection(createGame(t, { recoveryPhrase }), 'BadInput')
    }
  })

  test('accepts a recovery phrase of exactly the minimum normalised length', async () => {
    const t = harness()
    const created = await createGame(t, {
      recoveryPhrase: 'a'.repeat(MIN_RECOVERY_PHRASE_LENGTH),
    })
    expect(created.code).toHaveLength(JOIN_CODE_LENGTH)
  })

  test('rejects an absurdly long recovery phrase', async () => {
    const t = harness()
    for (const length of [MAX_RECOVERY_PHRASE_LENGTH + 1, 5_000, 100_000]) {
      await expectRejection(createGame(t, { recoveryPhrase: 'a'.repeat(length) }), 'BadInput')
    }
  })

  test('accepts a recovery phrase of exactly the maximum length', async () => {
    const t = harness()
    const created = await createGame(t, {
      recoveryPhrase: 'a'.repeat(MAX_RECOVERY_PHRASE_LENGTH),
    })
    expect(created.dmCode).toHaveLength(DM_CODE_LENGTH)
  })

  test('never stores the recovery phrase itself', async () => {
    const t = harness()
    const created = await createGame(t, { recoveryPhrase: PHRASE })
    const row = await gameRow(t, created.code)
    expect(JSON.stringify(row)).not.toContain(PHRASE)
    expect(row.dmRecoverySalt).not.toHaveLength(0)
    expect(row.dmRecoveryHash).not.toHaveLength(0)
  })
})

// The landing page's payload, and the only query in this application a browser can
// call holding no credential at all. Every test here scans a real query's serialised
// output, and every negative has a positive control standing beside it in the same
// test — a payload this list truncated to nothing would satisfy any number of
// `not.toContain`s.
describe('games.list', () => {
  // CLAUDE.md invariant 1, against the same three secrets `getByCode` is scanned for
  // **plus the join code**, which is a secret from *this* audience and not from that one —
  // the whole point of there being a third audience. All four are read out of the database
  // so they are the real stored strings rather than what a test hoped was stored.
  test('carries no join code, no DM code, no recovery salt and no recovery hash', async () => {
    const t = harness()
    const first = await createGame(t, { name: 'Kobold Season', dmName: 'Mike' })
    const second = await createGame(t, {
      name: 'Copper Deep',
      dmName: 'Ada',
      recoveryPhrase: 'copper kettle',
    })
    const rows = [await gameRow(t, first.code), await gameRow(t, second.code)]

    const listing = await t.query(api.games.list, {})
    const payload = JSON.stringify(listing)

    // The positive control, and it is in this test rather than a neighbouring one
    // deliberately: the eight string scans below all pass over an empty array, and they
    // pass just as happily over a payload the cap truncated to nothing. Two rows, both
    // names and a creator name prove the thing being scanned is the real list.
    expect(listing).toHaveLength(2)
    expect(payload).toContain('Kobold Season')
    expect(payload).toContain('Copper Deep')
    expect(payload).toContain('Ada')

    for (const row of rows) {
      // The join code's scan is the *weaker* of the two assertions guarding it, and it is
      // here rather than in a test of its own because the other one — the exact key set
      // pinned below — is what actually holds. Six characters from a 31-letter alphabet,
      // scanned against a payload containing `_id`s over an overlapping alphabet, can fire
      // by coincidence: the same class of trap as `containsNumber` in vitals.test.ts, where
      // a bare `toContain('271')` passed or failed on the clock. Kept anyway, because a
      // coincidence here is a false failure rather than a false pass, and because a
      // stringify scan catches the code arriving under a *name* nobody thought to pin.
      expect(payload).not.toContain(row.code)
      expect(payload).not.toContain(row.dmCode)
      expect(payload).not.toContain(row.dmRecoverySalt)
      expect(payload).not.toContain(row.dmRecoveryHash)
    }
    expect(payload).not.toContain('dmCode')
    expect(payload).not.toContain('dmRecovery')
  })

  // The pin behind `publicGameListingValidator` being derived with `.omit()`.
  // Subtraction only promises the two named fields are gone; a new *non-secret* field
  // added to `publicGameValidator` for the audience holding a join code would arrive
  // here silently and widen an audience holding nothing at all. This is the test that
  // fails when that happens, and it is the reason the derivation is safe.
  //
  // It is also the **stronger** half of the join code's guard, and the reason the scan for
  // it upstairs is only a scan: a field that is absent from this list cannot leak whatever
  // its value happened to be, coincidences of alphabet or not.
  test('has exactly the five keys the landing page needs and no sixth', async () => {
    const t = harness()
    await createGame(t)
    const listing = await t.query(api.games.list, {})
    expect(listing).toHaveLength(1)
    expect(Object.keys(listing[0]).sort()).toEqual(
      ['_creationTime', '_id', 'createdByName', 'name', 'status'].sort(),
    )
  })

  test('lists the newest game first', async () => {
    const t = harness()
    for (const name of ['Oldest', 'Middle', 'Newest']) {
      await createGame(t, { name })
    }
    const listing = await t.query(api.games.list, {})
    expect(listing.map((row) => row.name)).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  test('stops at MAX_GAMES_ON_LANDING and drops the oldest games', async () => {
    const t = harness()
    const total = MAX_GAMES_ON_LANDING + 4
    for (let i = 0; i < total; i += 1) {
      await createGame(t, { name: `Game ${i}` })
    }

    const listing = await t.query(api.games.list, {})
    const names = listing.map((row) => row.name)
    expect(listing).toHaveLength(MAX_GAMES_ON_LANDING)
    // Truncation costs nothing because `Game 0` is still joinable by its code, which
    // is why the *Join with a code* panel stays beside the list.
    expect(names).not.toContain('Game 0')
    expect(names[0]).toBe(`Game ${total - 1}`)
  })

  test('returns an empty array rather than throwing when there are no games', async () => {
    const t = harness()
    expect(await t.query(api.games.list, {})).toEqual([])
  })
})

describe('games.getByCode', () => {
  test('returns null for an unknown code', async () => {
    const t = harness()
    await createGame(t)
    expect(await t.query(api.games.getByCode, { code: 'ZZZZZZ' })).toBeNull()
  })

  test('returns null for a code of the wrong length', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const code of ['', 'A', created.code.slice(0, JOIN_CODE_LENGTH - 1), `${created.code}Q`]) {
      expect(await t.query(api.games.getByCode, { code })).toBeNull()
    }
  })

  test('ignores case, surrounding whitespace and separators in the code', async () => {
    const t = harness()
    const created = await createGame(t)
    const spaced = created.code.split('').join(' ')
    for (const code of [created.code.toLowerCase(), `  ${created.code}  `, spaced]) {
      const game = await t.query(api.games.getByCode, { code })
      expect(game?.code).toBe(created.code)
    }
  })

  // CLAUDE.md invariant 1. The whole payload is stringified rather than checking
  // named fields, so a future field carrying a secret under any name still trips
  // this. Secrets are read from the database so they are the real stored values.
  test('leaks neither the DM code nor the recovery salt or hash to players', async () => {
    const t = harness()
    const created = await createGame(t)
    const row = await gameRow(t, created.code)
    expect(row.dmCode).toBe(created.dmCode)

    for (const code of [created.code, created.code.toLowerCase(), `  ${created.code} `]) {
      const payload = JSON.stringify(await t.query(api.games.getByCode, { code }))
      expect(payload).toContain('Kobold Season')
      expect(payload).not.toContain(created.dmCode)
      expect(payload).not.toContain(row.dmCode)
      expect(payload).not.toContain(row.dmRecoverySalt)
      expect(payload).not.toContain(row.dmRecoveryHash)
      expect(payload).not.toContain('dmCode')
      expect(payload).not.toContain('dmRecovery')
    }
  })

  test('leaks nothing after the recovery phrase is rotated', async () => {
    const t = harness()
    const created = await createGame(t)
    await t.mutation(api.games.setRecoveryPhrase, {
      code: created.code,
      dmCode: created.dmCode,
      recoveryPhrase: 'copper kettle nine',
    })
    const row = await gameRow(t, created.code)
    const payload = JSON.stringify(await t.query(api.games.getByCode, { code: created.code }))
    expect(payload).not.toContain(row.dmRecoverySalt)
    expect(payload).not.toContain(row.dmRecoveryHash)
    expect(payload).not.toContain(row.dmCode)
  })
})

// The door's verdict on a DM code, asked before anybody is seated. The corpus of
// wrong codes is the one `games.elevateDm` is tested against — the same `twiddleFirst`
// and `twiddleLast` helpers — because a code this accepts and `requireDm` refuses, or
// the other way round, is precisely the bug that would seat a DM as a player with
// nothing on screen saying why.
describe('games.checkDmCode', () => {
  test('accepts the right DM code in any case and with surrounding whitespace', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const dmCode of [
      created.dmCode,
      created.dmCode.toLowerCase(),
      `  ${created.dmCode}  `,
      `\t${created.dmCode.toLowerCase()}\n`,
    ]) {
      expect(await t.query(api.games.checkDmCode, { code: created.code, dmCode })).toBe(true)
    }
  })

  /**
   * Every class of wrong DM code, in one table over one game.
   *
   * This was three tests — same length, different length, internal whitespace — with the
   * same body three times over: a harness, a game, a loop of bad codes, and in two of them
   * the identical positive control. Three names and three fixtures for one property. The
   * **label on each row buys the names back**, which is the only thing the separate tests
   * were providing: a failure still says which class of bad code got through, and the
   * corpus keeps every input it had.
   *
   * One positive control at the end rather than one per class, for the reason it existed
   * in the first place — it proves the comparison is working rather than the query broken,
   * and that is one statement about one game.
   */
  test('refuses every class of wrong DM code', async () => {
    const t = harness()
    const created = await createGame(t)

    // Worth a sentence rather than only a label. The DM code goes through
    // `normaliseDmCode`, which trims and uppercases and nothing else — deliberately not
    // `normaliseJoinCode`, which would drop the space and quietly accept this. The join
    // field is the forgiving one; the check on the app's only bearer secret is not.
    const split = `${created.dmCode.slice(0, 4)} ${created.dmCode.slice(4)}`

    // The right-length rows and the wrong-length ones sit in one corpus deliberately: the
    // compare behind this is hand-written and length-independent, so a prefix, a suffix and
    // a doubled code are the same kind of question as a twiddled character rather than a
    // separate concern. It is `elevateDm`'s corpus, per the note on the describe.
    const wrong: [label: string, dmCode: string][] = [
      ['last character twiddled', twiddleLast(created.dmCode)],
      ['first character twiddled', twiddleFirst(created.dmCode)],
      ['right length, one repeated letter', 'A'.repeat(DM_CODE_LENGTH)],
      ['one character short', created.dmCode.slice(0, DM_CODE_LENGTH - 1)],
      ['first character only', created.dmCode.slice(0, 1)],
      ['a suffix, with the first character dropped', created.dmCode.slice(1)],
      ['one character too long', `${created.dmCode}A`],
      ['the whole code doubled', `${created.dmCode}${created.dmCode}`],
      ['empty', ''],
      ['whitespace only', '   '],
      ['broken up by internal whitespace', split],
    ]

    for (const [label, dmCode] of wrong) {
      expect(await t.query(api.games.checkDmCode, { code: created.code, dmCode }), label).toBe(
        false,
      )
    }

    // Positive control: the same call with the real code still answers true, so every
    // false above is the comparison working rather than the query broken.
    expect(
      await t.query(api.games.checkDmCode, { code: created.code, dmCode: created.dmCode }),
    ).toBe(true)
  })

  test('refuses a DM code that is valid for a different game', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', dmName: 'Mike' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })
    expect(await t.query(api.games.checkDmCode, { code: b.code, dmCode: a.dmCode })).toBe(false)
    expect(await t.query(api.games.checkDmCode, { code: a.code, dmCode: b.dmCode })).toBe(false)
    // Each code still opens its own game, so neither false above is a game that went
    // missing between the two calls.
    expect(await t.query(api.games.checkDmCode, { code: a.code, dmCode: a.dmCode })).toBe(true)
    expect(await t.query(api.games.checkDmCode, { code: b.code, dmCode: b.dmCode })).toBe(true)
  })

  // An unknown join code answers rather than throws, the way `getByCode` returns null:
  // the caller is a form with a field to render the verdict beside. It also must not
  // distinguish *no such game* from *wrong code*, so that this cannot be used to
  // enumerate which join codes are real.
  test('answers false for an unknown join code rather than throwing', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const code of ['ZZZZZZ', '', 'A', created.code.slice(0, JOIN_CODE_LENGTH - 1)]) {
      expect(await t.query(api.games.checkDmCode, { code, dmCode: created.dmCode })).toBe(false)
    }
  })

  // There was a test here asserting `typeof` the answer is `'boolean'`, and it is gone
  // rather than moved: `returns: v.boolean()` on the query makes that mechanically true,
  // and the `true` / `false` values it also checked are already asserted by every test
  // above. A guard that cannot fail dilutes the rule everywhere else — see the note in
  // `convex/lib/names.ts`, where the same reasoning removed a lone-surrogate check. The
  // intent it recorded, that nothing but a boolean travels, lives in `checkDmCode`'s own
  // docblock beside the validator that enforces it.

  // A query cannot write, so this asserts the property that turning `checkDmCode` into
  // a mutation would break rather than a behaviour anybody had to implement. It is
  // worth pinning anyway: the badge follows a seat, this call has none, and
  // `elevateDm` stays the only thing that moves it.
  test('creates no seat and does not move the DM badge, however often it is called', async () => {
    const t = harness()
    const created = await createGame(t)
    const dmCodes = [
      created.dmCode,
      twiddleFirst(created.dmCode),
      created.dmCode.toLowerCase(),
      '',
      `${created.dmCode}A`,
      created.dmCode,
    ]
    for (const dmCode of dmCodes) {
      await t.query(api.games.checkDmCode, { code: created.code, dmCode })
    }

    const seats = await seatsOf(t, created.code)
    expect(seats.map((seat) => seat.displayName)).toEqual(['Mike'])
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
  })
})

describe('games.elevateDm', () => {
  test('moves the badge to the seat the caller identifies by id', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')

    const result = await t.mutation(api.games.elevateDm, {
      code: created.code,
      dmCode: created.dmCode,
      playerId: sam,
    })
    expect(result).toBeNull()
    expect(await dmSeatNames(t, created.code)).toEqual(['Sam'])
  })

  test('creates no seat — the caller is already seated by the time it asks', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')

    await t.mutation(api.games.elevateDm, {
      code: created.code,
      dmCode: created.dmCode,
      playerId: sam,
    })

    const seats = await seatsOf(t, created.code)
    expect(seats.map((seat) => seat.displayName).sort()).toEqual(['Mike', 'Sam'])
    expect(seats.find((seat) => seat._id === sam)?.isDm).toBe(true)
  })

  // The reason elevateDm takes an id rather than a display name: a name held in
  // client state goes stale the moment the seat is renamed, and elevating under
  // it used to badge a brand new phantom seat under the old name.
  test('badges the renamed seat, not a phantom seat under the old name', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')
    await t.mutation(api.players.rename, {
      code: created.code,
      playerId: sam,
      displayName: 'Samwise',
    })

    await t.mutation(api.games.elevateDm, {
      code: created.code,
      dmCode: created.dmCode,
      playerId: sam,
    })

    const seats = await seatsOf(t, created.code)
    expect(seats.map((seat) => seat.displayName).sort()).toEqual(['Mike', 'Samwise'])
    expect(await dmSeatNames(t, created.code)).toEqual(['Samwise'])
  })

  test('leaves exactly one seat carrying the DM badge after repeated elevations', async () => {
    const t = harness()
    const created = await createGame(t)
    const seatIds = new Map<string, Id<'players'>>()
    for (const displayName of ['Sam', 'Ada', 'Jo']) {
      seatIds.set(displayName, await join(t, created.code, displayName))
    }
    // Rejoining the creator's name lands on the seat games.create already made.
    seatIds.set('Mike', await join(t, created.code, 'Mike'))

    for (const displayName of ['Sam', 'Ada', 'Mike', 'Sam', 'Jo']) {
      await t.mutation(api.games.elevateDm, {
        code: created.code,
        dmCode: created.dmCode,
        playerId: seatIds.get(displayName)!,
      })
      expect(await dmSeatNames(t, created.code)).toEqual([displayName])
    }
    const seats = await seatsOf(t, created.code)
    expect(seats).toHaveLength(4)
    expect(seats.filter((seat) => seat.isDm)).toHaveLength(1)
  })

  test('elevating the creator’s own seat keeps that one seat and its badge', async () => {
    const t = harness()
    const created = await createGame(t)
    // A rejoin under different casing is the same seat, so this is the DM's own.
    const mike = await join(t, created.code, '  mIKe  ')
    await t.mutation(api.games.elevateDm, {
      code: created.code,
      dmCode: created.dmCode,
      playerId: mike,
    })
    const seats = await seatsOf(t, created.code)
    expect(seats).toHaveLength(1)
    expect(seats[0]).toMatchObject({ displayName: 'mIKe', isDm: true })
  })

  test('accepts a DM code with surrounding whitespace and in lower case', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')
    for (const dmCode of [
      created.dmCode.toLowerCase(),
      `  ${created.dmCode}  `,
      `\t${created.dmCode.toLowerCase()}\n`,
    ]) {
      await t.mutation(api.games.elevateDm, {
        code: created.code,
        dmCode,
        playerId: sam,
      })
      expect(await dmSeatNames(t, created.code)).toEqual(['Sam'])
    }
  })

  test('rejects a wrong DM code of the same length and changes nothing', async () => {
    const t = harness()
    const created = await createGame(t)
    const intruder = await join(t, created.code, 'Intruder')
    for (const dmCode of [
      twiddleLast(created.dmCode),
      twiddleFirst(created.dmCode),
      'A'.repeat(DM_CODE_LENGTH),
      created.dmCode.split('').reverse().join(''),
    ]) {
      await expectRejection(
        t.mutation(api.games.elevateDm, {
          code: created.code,
          dmCode,
          playerId: intruder,
        }),
        'NotDm',
      )
    }
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
    const seats = await seatsOf(t, created.code)
    expect(seats.map((seat) => seat.displayName)).toEqual(['Mike', 'Intruder'])
  })

  // The hand-written length-independent compare must not let a prefix, a suffix
  // or an extended code through.
  test('rejects a wrong DM code of a different length, including a prefix', async () => {
    const t = harness()
    const created = await createGame(t)
    const intruder = await join(t, created.code, 'Intruder')
    for (const dmCode of [
      created.dmCode.slice(0, DM_CODE_LENGTH - 1),
      created.dmCode.slice(0, 1),
      created.dmCode.slice(1),
      `${created.dmCode}A`,
      `${created.dmCode}${created.dmCode}`,
      '',
      '   ',
    ]) {
      await expectRejection(
        t.mutation(api.games.elevateDm, {
          code: created.code,
          dmCode,
          playerId: intruder,
        }),
        'NotDm',
      )
    }
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
  })

  test('rejects a DM code broken up by internal whitespace', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    const split = `${created.dmCode.slice(0, 4)} ${created.dmCode.slice(4)}`
    await expectRejection(
      t.mutation(api.games.elevateDm, {
        code: created.code,
        dmCode: split,
        playerId: mike,
      }),
      'NotDm',
    )
  })

  test('rejects an unknown game code before looking at the DM code', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    await expectRejection(
      t.mutation(api.games.elevateDm, {
        code: 'ZZZZZZ',
        dmCode: created.dmCode,
        playerId: mike,
      }),
      'GameNotFound',
    )
  })

  test('rejects a playerId that belongs to a different game', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', dmName: 'Mike' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })
    const outsider = await join(t, b.code, 'Outsider')

    await expectRejection(
      t.mutation(api.games.elevateDm, {
        code: a.code,
        dmCode: a.dmCode,
        playerId: outsider,
      }),
      'PlayerNotFound',
    )
    expect(await dmSeatNames(t, a.code)).toEqual(['Mike'])
    expect(await dmSeatNames(t, b.code)).toEqual(['Sam'])
    expect(await seatsOf(t, a.code)).toHaveLength(1)
  })

  test('rejects a playerId for a seat that has already left', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')
    await t.mutation(api.players.leave, { code: created.code, playerId: sam })

    await expectRejection(
      t.mutation(api.games.elevateDm, {
        code: created.code,
        dmCode: created.dmCode,
        playerId: sam,
      }),
      'PlayerNotFound',
    )
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
  })

  // The seat cap and the grant-before-revoke order together: a game holding the
  // maximum number of seats can never be left with zero DM badges.
  test('keeps exactly one DM badge in a game that is at the seat cap', async () => {
    const t = harness()
    const created = await createGame(t)
    // Deliberately fills the game to MAX_SEATS_PER_GAME — the cap is the point.
    let last: Id<'players'> | null = null
    for (let i = 0; i < MAX_SEATS_PER_GAME - 1; i += 1) {
      last = await join(t, created.code, `Filler ${i}`)
    }
    expect(await seatsOf(t, created.code)).toHaveLength(MAX_SEATS_PER_GAME)
    await expectRejection(join(t, created.code, 'One Too Many'), 'GameFull')

    await t.mutation(api.games.elevateDm, {
      code: created.code,
      dmCode: created.dmCode,
      playerId: last!,
    })
    const seats = await seatsOf(t, created.code)
    expect(seats.filter((seat) => seat.isDm)).toHaveLength(1)
    expect(await dmSeatNames(t, created.code)).toEqual([`Filler ${MAX_SEATS_PER_GAME - 2}`])
  })
})

describe('games.recoverDmCode', () => {
  test('hands back the stored DM code for the correct phrase and moves the badge', async () => {
    const t = harness()
    const created = await createGame(t)
    const row = await gameRow(t, created.code)
    const sam = await join(t, created.code, 'Sam')

    const result = await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: PHRASE,
      playerId: sam,
    })
    expect(result.dmCode).toBe(row.dmCode)
    expect(await dmSeatNames(t, created.code)).toEqual(['Sam'])
  })

  test('returns only the DM code and creates no seat', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')

    const result = await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: PHRASE,
      playerId: mike,
    })
    expect(Object.keys(result)).toEqual(['dmCode'])
    expect(await seatsOf(t, created.code)).toHaveLength(1)
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
  })

  test('badges the renamed seat rather than a phantom seat under the old name', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')
    await t.mutation(api.players.rename, {
      code: created.code,
      playerId: sam,
      displayName: 'Samwise',
    })

    await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: PHRASE,
      playerId: sam,
    })

    const seats = await seatsOf(t, created.code)
    expect(seats.map((seat) => seat.displayName).sort()).toEqual(['Mike', 'Samwise'])
    expect(await dmSeatNames(t, created.code)).toEqual(['Samwise'])
  })

  test('matches the phrase across case and collapsed whitespace', async () => {
    const t = harness()
    const created = await createGame(t, { recoveryPhrase: 'Brass Lantern Nine' })
    const mike = await seatIdByName(t, created.code, 'Mike')
    const variants = [
      'brass lantern nine',
      'BRASS LANTERN NINE',
      '   Brass Lantern Nine   ',
      'Brass    Lantern\t\tNine',
      '\n Brass   LANTERN  nine \n',
    ]
    for (const recoveryPhrase of variants) {
      const result = await t.mutation(api.games.recoverDmCode, {
        code: created.code,
        recoveryPhrase,
        playerId: mike,
      })
      expect(result.dmCode).toBe(created.dmCode)
    }
  })

  test('rejects a wrong phrase without returning the DM code', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    const wrong = [
      'brass lanterns',
      'brasslantern',
      'brass lantern extra',
      'lantern brass',
      PHRASE.slice(0, -1),
      `${PHRASE}x`,
      '',
      'a'.repeat(MAX_RECOVERY_PHRASE_LENGTH),
    ]
    for (const recoveryPhrase of wrong) {
      await expectRejection(
        t.mutation(api.games.recoverDmCode, {
          code: created.code,
          recoveryPhrase,
          playerId: mike,
        }),
        'BadRecoveryPhrase',
      )
    }
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
    expect(await seatsOf(t, created.code)).toHaveLength(1)
  })

  test('rejects an unknown game code', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: 'ZZZZZZ',
        recoveryPhrase: PHRASE,
        playerId: mike,
      }),
      'GameNotFound',
    )
  })

  test('rejects a playerId that belongs to a different game', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', dmName: 'Mike' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })
    const outsider = await join(t, b.code, 'Outsider')

    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: a.code,
        recoveryPhrase: PHRASE,
        playerId: outsider,
      }),
      'PlayerNotFound',
    )
    expect(await dmSeatNames(t, a.code)).toEqual(['Mike'])
    expect(await dmSeatNames(t, b.code)).toEqual(['Sam'])
    expect(await seatsOf(t, a.code)).toHaveLength(1)
  })

  test('rejects a playerId for a seat that has already left', async () => {
    const t = harness()
    const created = await createGame(t)
    const sam = await join(t, created.code, 'Sam')
    await t.mutation(api.players.leave, { code: created.code, playerId: sam })

    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: created.code,
        recoveryPhrase: PHRASE,
        playerId: sam,
      }),
      'PlayerNotFound',
    )
    expect(await dmSeatNames(t, created.code)).toEqual(['Mike'])
  })
})

describe('games.setRecoveryPhrase', () => {
  test('requires a valid DM code and leaves the old phrase working when rejected', async () => {
    const t = harness()
    const created = await createGame(t)
    const before = await gameRow(t, created.code)
    const mike = await seatIdByName(t, created.code, 'Mike')

    for (const dmCode of [
      twiddleLast(created.dmCode),
      created.dmCode.slice(0, DM_CODE_LENGTH - 1),
      `${created.dmCode}A`,
      '',
    ]) {
      await expectRejection(
        t.mutation(api.games.setRecoveryPhrase, {
          code: created.code,
          dmCode,
          recoveryPhrase: 'attacker chosen phrase',
        }),
        'NotDm',
      )
    }

    const after = await gameRow(t, created.code)
    expect(after.dmRecoverySalt).toBe(before.dmRecoverySalt)
    expect(after.dmRecoveryHash).toBe(before.dmRecoveryHash)
    const result = await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: PHRASE,
      playerId: mike,
    })
    expect(result.dmCode).toBe(created.dmCode)
  })

  test('makes the new phrase recover and retires the old one', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    await t.mutation(api.games.setRecoveryPhrase, {
      code: created.code,
      dmCode: created.dmCode,
      recoveryPhrase: 'Copper Kettle Nine',
    })

    const result = await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: '  copper   kettle nine  ',
      playerId: mike,
    })
    expect(result.dmCode).toBe(created.dmCode)

    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: created.code,
        recoveryPhrase: PHRASE,
        playerId: mike,
      }),
      'BadRecoveryPhrase',
    )
  })

  test('rotates the salt as well as the hash, even for an unchanged phrase', async () => {
    const t = harness()
    const created = await createGame(t)
    const before = await gameRow(t, created.code)
    const mike = await seatIdByName(t, created.code, 'Mike')

    await t.mutation(api.games.setRecoveryPhrase, {
      code: created.code,
      dmCode: created.dmCode,
      recoveryPhrase: PHRASE,
    })

    const after = await gameRow(t, created.code)
    expect(after.dmRecoverySalt).not.toBe(before.dmRecoverySalt)
    expect(after.dmRecoveryHash).not.toBe(before.dmRecoveryHash)
    // Same phrase, so it must still recover under the new salt.
    const result = await t.mutation(api.games.recoverDmCode, {
      code: created.code,
      recoveryPhrase: PHRASE,
      playerId: mike,
    })
    expect(result.dmCode).toBe(created.dmCode)
  })

  test('enforces the same length rules as create, keeping the old phrase', async () => {
    const t = harness()
    const created = await createGame(t)
    const before = await gameRow(t, created.code)

    const bad = [
      '',
      '        ',
      'a'.repeat(MIN_RECOVERY_PHRASE_LENGTH - 1),
      `  ${'a'.repeat(MIN_RECOVERY_PHRASE_LENGTH - 1)}  `,
      'a'.repeat(MAX_RECOVERY_PHRASE_LENGTH + 1),
      'a'.repeat(5_000),
    ]
    for (const recoveryPhrase of bad) {
      await expectRejection(
        t.mutation(api.games.setRecoveryPhrase, {
          code: created.code,
          dmCode: created.dmCode,
          recoveryPhrase,
        }),
        'BadInput',
      )
    }

    const after = await gameRow(t, created.code)
    expect(after.dmRecoverySalt).toBe(before.dmRecoverySalt)
    expect(after.dmRecoveryHash).toBe(before.dmRecoveryHash)
  })

  test('accepts the minimum and maximum length phrases', async () => {
    const t = harness()
    const created = await createGame(t)
    const mike = await seatIdByName(t, created.code, 'Mike')
    for (const length of [MIN_RECOVERY_PHRASE_LENGTH, MAX_RECOVERY_PHRASE_LENGTH]) {
      const recoveryPhrase = 'b'.repeat(length)
      await t.mutation(api.games.setRecoveryPhrase, {
        code: created.code,
        dmCode: created.dmCode,
        recoveryPhrase,
      })
      const result = await t.mutation(api.games.recoverDmCode, {
        code: created.code,
        recoveryPhrase,
        playerId: mike,
      })
      expect(result.dmCode).toBe(created.dmCode)
    }
  })

  test('rejects an unknown game code', async () => {
    const t = harness()
    const created = await createGame(t)
    await expectRejection(
      t.mutation(api.games.setRecoveryPhrase, {
        code: 'ZZZZZZ',
        dmCode: created.dmCode,
        recoveryPhrase: 'copper kettle nine',
      }),
      'GameNotFound',
    )
  })
})

describe('games.rename', () => {
  test('renames the game when the DM code is right', async () => {
    const t = harness()
    const created = await createGame(t)
    await t.mutation(api.games.rename, {
      code: created.code,
      dmCode: created.dmCode,
      name: '  Kobold Season Two  ',
    })
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe('Kobold Season Two')
  })

  test('rejects a blank name and leaves the old one in place', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const name of ['', '   ', '\t\n']) {
      await expectRejection(
        t.mutation(api.games.rename, { code: created.code, dmCode: created.dmCode, name }),
        'BadInput',
      )
    }
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe('Kobold Season')
  })

  test('changes nothing when the DM code is wrong', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const dmCode of [
      twiddleFirst(created.dmCode),
      created.dmCode.slice(0, DM_CODE_LENGTH - 1),
      `${created.dmCode}A`,
      '',
    ]) {
      await expectRejection(
        t.mutation(api.games.rename, { code: created.code, dmCode, name: 'Hacked' }),
        'NotDm',
      )
    }
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe('Kobold Season')
  })

  test('accepts a new name of exactly the maximum length', async () => {
    const t = harness()
    const created = await createGame(t)
    const name = 'N'.repeat(MAX_GAME_NAME_LENGTH)
    await t.mutation(api.games.rename, {
      code: created.code,
      dmCode: created.dmCode,
      name: `  ${name}  `,
    })
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe(name)
  })

  test('rejects an over-long new name and keeps the old one', async () => {
    const t = harness()
    const created = await createGame(t)
    for (const length of [MAX_GAME_NAME_LENGTH + 1, MAX_GAME_NAME_LENGTH + 25]) {
      await expectRejection(
        t.mutation(api.games.rename, {
          code: created.code,
          dmCode: created.dmCode,
          name: 'N'.repeat(length),
        }),
        'BadInput',
      )
    }
    const game = await t.query(api.games.getByCode, { code: created.code })
    expect(game?.name).toBe('Kobold Season')
  })
})

describe('cross-game isolation', () => {
  test('rejects a DM code that is valid for a different game', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', dmName: 'Mike' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })

    const sam = await seatIdByName(t, b.code, 'Sam')
    await expectRejection(
      t.mutation(api.games.rename, { code: b.code, dmCode: a.dmCode, name: 'Hacked' }),
      'NotDm',
    )
    await expectRejection(
      t.mutation(api.games.elevateDm, {
        code: b.code,
        dmCode: a.dmCode,
        playerId: sam,
      }),
      'NotDm',
    )
    await expectRejection(
      t.mutation(api.games.setRecoveryPhrase, {
        code: b.code,
        dmCode: a.dmCode,
        recoveryPhrase: 'attacker chosen phrase',
      }),
      'NotDm',
    )

    expect(await dmSeatNames(t, b.code)).toEqual(['Sam'])
    expect((await t.query(api.games.getByCode, { code: b.code }))?.name).toBe('Game B')
  })

  test('does not let a recovery phrase cross between games', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', recoveryPhrase: 'brass lantern' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })

    const seatInA = await seatIdByName(t, a.code, 'Mike')
    const seatInB = await seatIdByName(t, b.code, 'Sam')
    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: b.code,
        recoveryPhrase: 'brass lantern',
        playerId: seatInB,
      }),
      'BadRecoveryPhrase',
    )
    await expectRejection(
      t.mutation(api.games.recoverDmCode, {
        code: a.code,
        recoveryPhrase: 'copper kettle',
        playerId: seatInA,
      }),
      'BadRecoveryPhrase',
    )

    expect(await seatsOf(t, a.code)).toHaveLength(1)
    expect(await seatsOf(t, b.code)).toHaveLength(1)
  })

  test('stores a different salt per game so identical phrases hash differently', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', recoveryPhrase: PHRASE })
    const b = await createGame(t, { name: 'Game B', recoveryPhrase: PHRASE })
    const rowA = await gameRow(t, a.code)
    const rowB = await gameRow(t, b.code)
    expect(rowA.dmRecoverySalt).not.toBe(rowB.dmRecoverySalt)
    expect(rowA.dmRecoveryHash).not.toBe(rowB.dmRecoveryHash)
  })

  test('keeps the DM badge in one game from moving in the other', async () => {
    const t = harness()
    const a = await createGame(t, { name: 'Game A', dmName: 'Mike' })
    const b = await createGame(t, {
      name: 'Game B',
      dmName: 'Sam',
      recoveryPhrase: 'copper kettle',
    })

    const ada = await join(t, a.code, 'Ada')
    await t.mutation(api.games.elevateDm, {
      code: a.code,
      dmCode: a.dmCode,
      playerId: ada,
    })
    expect(await dmSeatNames(t, a.code)).toEqual(['Ada'])
    expect(await dmSeatNames(t, b.code)).toEqual(['Sam'])
    expect(await seatsOf(t, b.code)).toHaveLength(1)
  })
})
