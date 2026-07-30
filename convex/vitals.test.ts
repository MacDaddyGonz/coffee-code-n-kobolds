/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { publicVitalsValidator } from './lib/characters'
import type { PublicVitals } from './lib/characters'
import type { HealthBand, NpcSheet, PcSheet } from './lib/sheet'
import schema from './schema'

/**
 * MILESTONE 3'S ACCEPTANCE TEST, MECHANISED.
 *
 * > A player inspecting network traffic sees no exact NPC HP.
 *
 * "Inspecting network traffic" is the operative phrase, so this suite scans the
 * *serialised* payload of every query a player's client can issue rather than
 * checking the fields a component happens to read. A length check or a property
 * assertion keeps passing when a secret arrives nested inside a legitimate row —
 * an expanded sheet, a debugging echo of the arguments, a sibling field somebody
 * added for a health bar. A substring scan does not.
 *
 * Two different guards are being exercised here, because Milestone 3 ships two
 * leaks of different shapes (CLAUDE.md invariant 8):
 *
 * - Exact hit points are a leaked **field**, caught by `publicVitalsValidator`'s
 *   discriminated union, whose player-facing variant has nowhere to put a number.
 *   `describe('the union is doing real work')` is that half.
 * - An NPC's sheet, and the *existence* of an NPC at all, are leaked **rows** of
 *   the same shape as a hero's. Those are caught by the one-reader choke point in
 *   `lib/characters.ts`, which `leakGuard.test.ts` holds structurally and the
 *   payload scan below holds behaviourally.
 *
 * The fixtures duplicate `board.test.ts`'s rather than sharing them, deliberately:
 * every safe home for a shared helper is either deployed as a Convex module or
 * swept by the leak guard, so duplication is the cheaper of the two costs.
 */
const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

/** `Admittance [Gridded 16x12]` at its stored size, as board.test.ts uses. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

const TINT = '#c0392b'

/**
 * DELIBERATELY DISTINCTIVE NUMBERS. A monster on `12/20` would make this suite
 * lie in both directions: `20` occurs in a default ability score, in a grid
 * offset and in the middle of a timestamp, so a scan for it either fires on
 * nothing or fires on everything. Three digits that appear nowhere else in the
 * fixture mean a hit is a leak and a miss is silence.
 */
const NPC_MAX_HP = 271
const NPC_CURRENT_HP = 137

/**
 * Four separate spoilers, so a partial leak cannot pass as a clean one. The
 * character's name, its DM-only notes, an action's name and that action's roll
 * string are each independently enough to tell the party what they are about to
 * walk into.
 */
const NPC_NAME = 'Wyrmfang the Unseen'
const NPC_NOTES = 'Swallows the Wyrmglass shard whole and bolts for the western vault.'
const NPC_ACTION_NAME = 'Sundering Wyrmbreath'
const NPC_ACTION_ROLL = '19d12+CHA'

/**
 * The token standing on that character carries a name of its own, and it is a
 * different one on purpose: the coin is on the player layer, so a player is
 * *supposed* to see `Huge Shadow`. Reusing the character's name for it would make
 * the scan below unable to tell a leak from the thing it is meant to allow.
 */
const NPC_TOKEN_NAME = 'Huge Shadow'

/** requirements.md wants `20/45` above a hero's token, for everybody at the table. */
const PC_NAME = 'Thorin Ironfist'
const PC_MAX_HP = 45
const PC_CURRENT_HP = 20

type ErrorData = { kind: string; message: string }

/** The `{ kind, message }` a refusal carried, for tests that compare two refusals. */
async function refusalOf(call: Promise<unknown>): Promise<ErrorData> {
  const thrown = (await call.then(
    () => new Error('the call resolved, but it was expected to be refused'),
    (error: unknown) => error,
  )) as unknown
  expect(thrown).toBeInstanceOf(ConvexError)
  const data = (thrown as ConvexError<{ kind: string; message: string }>).data
  expect(typeof data.kind).toBe('string')
  expect(typeof data.message).toBe('string')
  return { kind: data.kind, message: data.message }
}

async function expectKind(call: Promise<unknown>, kind: string) {
  const refusal = await refusalOf(call)
  expect(refusal.kind).toBe(kind)
  expect(refusal.message.length).toBeGreaterThan(0)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function npcSheet(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return {
    kind: 'npc',
    armourClass: 22,
    maxHp: NPC_MAX_HP,
    initiativeBonus: 3,
    actions: [
      {
        id: 'breath',
        name: NPC_ACTION_NAME,
        text: 'A cone of powdered glass and fire, out to sixty feet.',
        roll: NPC_ACTION_ROLL,
        level: null,
        catalogueKey: null,
      },
    ],
    notes: NPC_NOTES,
    ...overrides,
  }
}

function pcSheet(overrides: Partial<PcSheet> = {}): PcSheet {
  return {
    kind: 'pc',
    level: 3,
    className: 'Fighter',
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
    saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
    armourClass: 17,
    maxHp: PC_MAX_HP,
    hitDice: { count: 3, faces: 10 },
    feats: [],
    spells: [],
    ...overrides,
  }
}

async function makeGame(t: Harness, name = 'Kobold Season', dmName = 'Mike') {
  return await t.mutation(api.games.create, { name, dmName, recoveryPhrase: 'brass lantern' })
}

async function makeSeat(t: Harness, code: string, displayName: string) {
  const { playerId } = await t.mutation(api.players.join, { code, displayName })
  return playerId
}

async function makePc(t: Harness, code: string, name: string, sheet = pcSheet()) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet })
  return characterId
}

async function makeNpc(
  t: Harness,
  code: string,
  dmCode: string,
  name: string,
  sheet = npcSheet(),
) {
  const { characterId } = await t.mutation(api.characters.create, { code, name, sheet, dmCode })
  return characterId
}

async function setHp(
  t: Harness,
  code: string,
  dmCode: string,
  characterId: Id<'characters'>,
  currentHp: number,
) {
  await t.mutation(api.characters.setHp, { code, dmCode, characterId, currentHp })
}

/** Distinct bytes per label: convex-test derives a stored file's URL from its hash. */
async function storeImage(t: Harness, label: string, bytes = 64): Promise<Id<'_storage'>> {
  const body = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i += 1) body[i] = (label.charCodeAt(i % label.length) + i) % 256
  return await t.run(async (ctx) => await ctx.storage.store(new Blob([body])))
}

async function makeScene(
  t: Harness,
  code: string,
  dmCode: string,
  name = 'Admittance',
): Promise<Id<'scenes'>> {
  const imageId = await storeImage(t, `scene-${name}`)
  const { sceneId } = await t.mutation(api.scenes.create, {
    code,
    dmCode,
    name,
    imageId,
    imageWidth: MAP_WIDTH,
    imageHeight: MAP_HEIGHT,
  })
  return sceneId
}

type AddTokenOptions = {
  name?: string
  layer?: 'player' | 'dm'
  characterId?: Id<'characters'>
  x?: number
  y?: number
}

async function addToken(
  t: Harness,
  code: string,
  dmCode: string,
  sceneId: Id<'scenes'>,
  options: AddTokenOptions = {},
): Promise<Id<'tokens'>> {
  const { tokenId } = await t.mutation(api.board.addToken, {
    code,
    dmCode,
    sceneId,
    name: options.name ?? 'Guard',
    layer: options.layer ?? 'player',
    sizeSquares: 1,
    tint: TINT,
    ...(options.characterId === undefined ? {} : { characterId: options.characterId }),
    x: options.x ?? 500,
    y: options.y ?? 500,
  })
  return tokenId
}

/** A structurally valid `characters` id that points at nothing at all. */
async function vanishedCharacterId(t: Harness, code: string): Promise<Id<'characters'>> {
  return await t.run(async (ctx) => {
    const game = await ctx.db
      .query('games')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()
    const characterId = await ctx.db.insert('characters', { gameId: game!._id, name: 'Ghost' })
    await ctx.db.delete('characters', characterId)
    return characterId
  })
}

function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

/**
 * One hero the party is playing and one monster they are looking at.
 *
 * The monster's coin is on the **player** layer, which is the case that makes
 * this suite worth writing. Hiding it on the DM layer would make every assertion
 * below pass for the wrong reason — the token choke point would already have
 * dropped it, and the vitals union would never be asked a hard question. A
 * creature the party can see is exactly the creature whose hit points the DM is
 * still keeping.
 */
async function vitalsFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  const seat = await makeSeat(t, game.code, 'Ana')

  const pc = await makePc(t, game.code, PC_NAME)
  await t.mutation(api.characters.claim, { code: game.code, playerId: seat, characterId: pc })
  await setHp(t, game.code, game.dmCode, pc, PC_CURRENT_HP)
  const pcToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: PC_NAME,
    layer: 'player',
    characterId: pc,
    x: 300,
    y: 300,
  })

  const npc = await makeNpc(t, game.code, game.dmCode, NPC_NAME)
  await setHp(t, game.code, game.dmCode, npc, NPC_CURRENT_HP)
  const npcToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: NPC_TOKEN_NAME,
    layer: 'player',
    characterId: npc,
    x: 700,
    y: 500,
  })

  return { ...game, sceneId, seat, pc, pcToken, npc, npcToken }
}

/**
 * Every payload a player's client can fetch, keyed by name so a failure says
 * which query leaked rather than which array index did.
 *
 * The wrong-DM-code variants are here because a player *can* send a `dmCode`
 * argument — it is optional, not absent — and a gate that keyed off the argument
 * being present rather than being correct would pass every other test in this file.
 */
async function playerPayloads(
  t: Harness,
  fixture: Awaited<ReturnType<typeof vitalsFixture>>,
): Promise<Record<string, unknown>> {
  const { code, sceneId, seat, npc } = fixture
  const wrong = twiddle(fixture.dmCode)

  return {
    'characters.vitals': await t.query(api.characters.vitals, { code }),
    'characters.vitals (wrong dm code)': await t.query(api.characters.vitals, {
      code,
      dmCode: wrong,
    }),
    'characters.vitals (empty dm code)': await t.query(api.characters.vitals, {
      code,
      dmCode: '',
    }),
    'characters.list': await t.query(api.characters.list, { code }),
    'characters.list (wrong dm code)': await t.query(api.characters.list, { code, dmCode: wrong }),
    'characters.sheet (npc)': await t.query(api.characters.sheet, { code, characterId: npc }),
    'characters.sheet (npc, another seat’s id)': await t.query(api.characters.sheet, {
      code,
      characterId: npc,
      playerId: seat,
    }),
    'characters.sheet (npc, wrong dm code)': await t.query(api.characters.sheet, {
      code,
      characterId: npc,
      dmCode: wrong,
    }),
    'board.tokens': await t.query(api.board.tokens, { code }),
    'board.tokens (wrong dm code)': await t.query(api.board.tokens, { code, dmCode: wrong }),
    'board.positions': await t.query(api.board.positions, { code, sceneId }),
    'scenes.active': await t.query(api.scenes.active, { code }),
    'games.getByCode': await t.query(api.games.getByCode, { code }),
    'players.list': await t.query(api.players.list, { code }),
    'players.listNames': await t.query(api.players.listNames, { code }),
  }
}

/**
 * `271` as a number in the payload, rather than `271` sitting in the middle of a
 * document id or a millisecond timestamp.
 *
 * A plain `toContain('271')` would be flaky in the worst possible direction: it
 * fires on a `_creationTime` of `1782713400000` and so passes or fails on the
 * clock. Requiring a non-word, non-decimal character on both sides matches
 * `"max":271` and `[271,` while never matching inside `a271b` or `1782713400000`.
 */
function containsNumber(serialised: string, value: number): boolean {
  return new RegExp(`(?<![\\w.])${value}(?![\\w.])`).test(serialised)
}

function rowFor(rows: PublicVitals[], characterId: Id<'characters'>): PublicVitals | undefined {
  return rows.find((row) => row.characterId === characterId)
}

/** The band a player is told, straight out of the real query. */
async function bandOf(
  t: Harness,
  code: string,
  characterId: Id<'characters'>,
): Promise<HealthBand> {
  const rows = await t.query(api.characters.vitals, { code })
  const row = rowFor(rows, characterId)
  expect(row, 'no vitals row at all for that character').toBeDefined()
  if (row!.kind !== 'band') throw new Error(`expected a band, got ${JSON.stringify(row)}`)
  return row!.band
}

// ---------------------------------------------------------------------------
// (a) The payload scan
// ---------------------------------------------------------------------------

describe('a player inspecting network traffic sees no exact NPC hit points', () => {
  test('no payload fetched without the DM code contains the numbers, the sheet or the notes', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const payloads = await playerPayloads(t, fixture)

    for (const [name, payload] of Object.entries(payloads)) {
      const serialised = JSON.stringify(payload) ?? ''

      expect(containsNumber(serialised, NPC_MAX_HP), `${name} leaked the NPC's maximum`).toBe(false)
      expect(
        containsNumber(serialised, NPC_CURRENT_HP),
        `${name} leaked the NPC's current hit points`,
      ).toBe(false)
      expect(serialised, `${name} leaked the NPC's name`).not.toContain(NPC_NAME)
      expect(serialised, `${name} leaked the NPC's notes`).not.toContain(NPC_NOTES)
      expect(serialised, `${name} leaked an NPC action`).not.toContain(NPC_ACTION_NAME)
      expect(serialised, `${name} leaked an NPC action's roll`).not.toContain(NPC_ACTION_ROLL)
      // The discriminator itself. `characters.list` filters NPC rows out and
      // `characters.sheet` refuses one, so no player payload has a reason to
      // carry the word at all — the way board.test.ts sweeps for `"dm"`.
      expect(serialised, `${name} leaked the npc discriminator`).not.toContain('"npc"')
    }
  })

  /**
   * The scan above is only meaningful if the fixture is not empty, and "not
   * empty" has to mean two separate things here.
   *
   * The player really is being served: they can see the monster's coin, and they
   * do get a health bar for it. And the secrets really are in the database: the
   * same fetches with the correct DM code hand back every string and every number
   * the loop above hunted for. Without both halves this suite passes on a game
   * with nothing in it.
   */
  test('positive control: the player sees the coin and a band, and the DM sees the numbers', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    // Half one — the player is genuinely being served this creature.
    const tokens = await t.query(api.board.tokens, { code: fixture.code })
    expect(tokens.map((token) => token.name).sort()).toEqual([NPC_TOKEN_NAME, PC_NAME])
    expect(tokens.map((token) => token.characterId).sort()).toEqual([fixture.npc, fixture.pc].sort())
    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    expect(rowFor(asPlayer, fixture.npc)).toBeDefined()

    // Half two — the secrets exist, and the DM code fetches every one of them.
    const dmVitals =
      JSON.stringify(
        await t.query(api.characters.vitals, { code: fixture.code, dmCode: fixture.dmCode }),
      ) ?? ''
    expect(containsNumber(dmVitals, NPC_MAX_HP)).toBe(true)
    expect(containsNumber(dmVitals, NPC_CURRENT_HP)).toBe(true)

    const dmSheet =
      JSON.stringify(
        await t.query(api.characters.sheet, {
          code: fixture.code,
          characterId: fixture.npc,
          dmCode: fixture.dmCode,
        }),
      ) ?? ''
    expect(dmSheet).toContain(NPC_NAME)
    expect(dmSheet).toContain(NPC_NOTES)
    expect(dmSheet).toContain(NPC_ACTION_NAME)
    expect(dmSheet).toContain(NPC_ACTION_ROLL)
    expect(dmSheet).toContain('"npc"')
    expect(containsNumber(dmSheet, NPC_MAX_HP)).toBe(true)

    const dmList =
      JSON.stringify(
        await t.query(api.characters.list, { code: fixture.code, dmCode: fixture.dmCode }),
      ) ?? ''
    expect(dmList).toContain(NPC_NAME)
    expect(dmList).toContain('"npc"')
  })

  /**
   * The scan's own instrument, checked. `containsNumber` is the only reason the
   * loop above is not a `toContain`, so a bug in it would silently turn every
   * numeric assertion in this file into a no-op.
   */
  test('the number scan matches a JSON number and not a timestamp or an id', () => {
    expect(containsNumber('{"max":271}', 271)).toBe(true)
    expect(containsNumber('[271,4]', 271)).toBe(true)
    expect(containsNumber('{"n":"271"}', 271)).toBe(true)
    expect(containsNumber('{"_creationTime":1782713400000}', 271)).toBe(false)
    expect(containsNumber('{"_id":"kg271abc"}', 271)).toBe(false)
    expect(containsNumber('{"x":3.271}', 271)).toBe(false)
    expect(containsNumber('{"x":2710}', 271)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (b) The union is doing real work
// ---------------------------------------------------------------------------

describe('the vitals union is doing real work', () => {
  /**
   * The KEY SET, not the values. `current: undefined` would satisfy every
   * assertion about the number being absent, and would still be a field the
   * moment anything reflected over the object — and `publicVitalsValidator`'s
   * whole claim is that a player's NPC row has nowhere to put a hit point.
   */
  test('a player’s row for an NPC is a band with no numeric member at all', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    const npcRow = rowFor(asPlayer, fixture.npc)
    expect(npcRow, 'the player was told nothing about a creature they can see').toBeDefined()
    expect(Object.keys(npcRow!).sort()).toEqual(['band', 'characterId', 'kind'])
    expect(npcRow).not.toHaveProperty('current')
    expect(npcRow).not.toHaveProperty('max')
    expect(npcRow).not.toHaveProperty('maxHp')
    expect(npcRow!.kind).toBe('band')
  })

  /**
   * The union asserted as a declaration rather than through a payload.
   *
   * Every other test here proves that today's projection does not put a number in
   * a player's NPC row. This one proves that it *could not*, which is the stronger
   * claim `publicVitalsValidator` is there to make — and it is not decorative:
   * `convex-test` applies `returns:` validators, so a future edit that added
   * `current` to the band branch would throw here rather than ship. (Shape only.
   * The UTF-16 and float64 cases a real deployment rejects are still `npm run
   * test:smoke`'s job.)
   *
   * Reading the validator's own members is deliberate. Asserting on a payload
   * cannot distinguish "the field is absent" from "the field is absent today".
   */
  test('the band variant of publicVitalsValidator has nowhere to put a hit point', () => {
    type Field = { kind: string; value?: unknown }
    type Member = { kind: string; fields: Record<string, Field> }
    const union = publicVitalsValidator as unknown as { kind: string; members: Member[] }

    expect(union.kind).toBe('union')
    expect(union.members).toHaveLength(2)

    const variantNamed = (name: string) =>
      union.members.find((member) => member.fields.kind?.value === name)

    const band = variantNamed('band')
    expect(band, 'no `band` variant in the vitals union').toBeDefined()
    expect(Object.keys(band!.fields).sort()).toEqual(['band', 'characterId', 'kind'])
    expect(
      Object.entries(band!.fields).filter(([, field]) => field.kind === 'float64'),
      'the player-facing variant declares a number',
    ).toEqual([])

    // The control: the DM-facing variant does declare two, so the assertion above
    // is about this branch rather than about numbers being impossible.
    const exact = variantNamed('exact')
    expect(exact, 'no `exact` variant in the vitals union').toBeDefined()
    expect(
      Object.entries(exact!.fields)
        .filter(([, field]) => field.kind === 'float64')
        .map(([name]) => name)
        .sort(),
    ).toEqual(['current', 'max'])
  })

  /** requirements.md asks for `20/45` above a hero's token — for both audiences. */
  test('a player character is exact for the player and for the DM alike', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const exact = {
      kind: 'exact',
      characterId: fixture.pc,
      current: PC_CURRENT_HP,
      max: PC_MAX_HP,
      // The hero's fixture sheet is 3d10, and none have been spent — a character is
      // created with its full complement. Hit dice ride with hit points rather than
      // with the sheet because a rest changes them and an edit does not.
      hitDiceCount: 3,
      hitDiceRemaining: 3,
    }

    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    expect(Object.keys(rowFor(asPlayer, fixture.pc)!).sort()).toEqual([
      'characterId',
      'current',
      'hitDiceCount',
      'hitDiceRemaining',
      'kind',
      'max',
    ])
    expect(rowFor(asPlayer, fixture.pc)).toEqual(exact)

    const asDm = await t.query(api.characters.vitals, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(rowFor(asDm, fixture.pc)).toEqual(exact)
    // And the DM's own row for the monster is the exact variant, so the two
    // payloads differ in the NPC row and in nothing else.
    expect(rowFor(asDm, fixture.npc)).toEqual({
      kind: 'exact',
      characterId: fixture.npc,
      current: NPC_CURRENT_HP,
      max: NPC_MAX_HP,
      hitDiceCount: null,
      hitDiceRemaining: null,
    })
  })
})

// ---------------------------------------------------------------------------
// (c) Band thresholds, through the real query
// ---------------------------------------------------------------------------

describe('the bands a player is told, through characters.vitals', () => {
  /**
   * Asserted through the query rather than against `healthBand` directly. The
   * pure function has its own tests; what is unproven without this is that the
   * query hands it `current` and `max` the right way round, and from the right
   * two documents — `characterVitals.currentHp` and `sheet.maxHp` live in
   * different tables, which is exactly the wiring a unit test of the function
   * cannot check.
   *
   * A maximum of 40 makes half and a quarter whole numbers, so the two boundaries
   * are asserted exactly rather than near.
   */
  test('healthy above half, bloodied at exactly half, critical at exactly a quarter, down at nought', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const brute = await makeNpc(
      t,
      fixture.code,
      fixture.dmCode,
      'Cellar Brute',
      npcSheet({ maxHp: 40, notes: '', actions: [] }),
    )
    await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
      name: 'Brute',
      layer: 'player',
      characterId: brute,
      x: 1100,
      y: 900,
    })

    const table: [number, HealthBand][] = [
      [40, 'healthy'],
      [21, 'healthy'],
      [20, 'bloodied'],
      [11, 'bloodied'],
      [10, 'critical'],
      [1, 'critical'],
      [0, 'down'],
    ]

    for (const [currentHp, band] of table) {
      await setHp(t, fixture.code, fixture.dmCode, brute, currentHp)
      expect(await bandOf(t, fixture.code, brute), `${currentHp}/40`).toBe(band)

      // The DM's exact row moved with it, so the band is a summary of the stored
      // number rather than a constant that happens to look right.
      const asDm = await t.query(api.characters.vitals, {
        code: fixture.code,
        dmCode: fixture.dmCode,
      })
      expect(rowFor(asDm, brute)).toEqual({
        kind: 'exact',
        characterId: brute,
        current: currentHp,
        max: 40,
        // Null on both counts, and that is the reduced NPC sheet showing through:
        // a monster carries no hit dice to spend on a rest it will never take.
        hitDiceCount: null,
        hitDiceRemaining: null,
      })
    }
  })

  /**
   * `down` is the one band the party acts on immediately, so it has to mean what
   * it says rather than being where the arithmetic rounded to. A dragon on one
   * hit point out of nine hundred is at 0.11% and is emphatically still standing.
   */
  test('a creature on 1 hit point out of 900 is critical, never down', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const colossus = await makeNpc(
      t,
      fixture.code,
      fixture.dmCode,
      'The Slow Colossus',
      npcSheet({ maxHp: 900, notes: '', actions: [] }),
    )
    await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
      name: 'Colossus',
      layer: 'player',
      characterId: colossus,
      x: 1500,
      y: 1200,
    })

    await setHp(t, fixture.code, fixture.dmCode, colossus, 1)
    expect(await bandOf(t, fixture.code, colossus)).toBe('critical')

    // And the control on the other side of the same line.
    await setHp(t, fixture.code, fixture.dmCode, colossus, 0)
    expect(await bandOf(t, fixture.code, colossus)).toBe('down')
  })

  /**
   * The clamp is server-side, so the band cannot be pushed outside its range by a
   * client asking for a number the sheet does not allow. Healing past full reads
   * as full rather than as a ratio above one; beating a corpse reads as `down`.
   */
  test('a request past either end of the sheet still lands in a real band', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    await setHp(t, fixture.code, fixture.dmCode, fixture.npc, NPC_MAX_HP + 5000)
    expect(await bandOf(t, fixture.code, fixture.npc)).toBe('healthy')

    await setHp(t, fixture.code, fixture.dmCode, fixture.npc, -5000)
    expect(await bandOf(t, fixture.code, fixture.npc)).toBe('down')
  })
})

// ---------------------------------------------------------------------------
// (d) The count leak
// ---------------------------------------------------------------------------

describe('a player cannot count the DM’s prepared monsters', () => {
  /**
   * The subtlest requirement in this milestone, because the obvious
   * implementation passes every other test in this file. Sending a band for every
   * NPC in the game hides the numbers perfectly and still publishes a *count*: a
   * player reading twelve entries knows twelve monsters are waiting tonight, which
   * is the same category of spoiler as the scene names ADR 0004 refused to send.
   *
   * So the assertion is on the array itself, not on its contents. No row, no
   * band, no id, and no contribution to the length.
   */
  test('an unplaced NPC and a DM-layer NPC produce no row at all', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    const unplaced = await makeNpc(
      t,
      fixture.code,
      fixture.dmCode,
      'Unplaced Horror',
      npcSheet({ maxHp: 300, notes: '', actions: [] }),
    )
    const hidden = await makeNpc(
      t,
      fixture.code,
      fixture.dmCode,
      'Cellar Lurker',
      npcSheet({ maxHp: 301, notes: '', actions: [] }),
    )
    await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
      name: 'Lurker',
      layer: 'dm',
      characterId: hidden,
      x: 1500,
      y: 1000,
    })

    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    expect(asPlayer.map((row) => row.characterId).sort()).toEqual([fixture.pc, fixture.npc].sort())
    expect(asPlayer).toHaveLength(2)

    // Not by id either — a row keyed on a character they should not know exists
    // is a leak whether or not it carries a number.
    const serialised = JSON.stringify(asPlayer) ?? ''
    expect(serialised).not.toContain(unplaced)
    expect(serialised).not.toContain(hidden)

    // The DM sees all four, so the filtering is the caller's and not the data's.
    const asDm = await t.query(api.characters.vitals, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(asDm.map((row) => row.characterId).sort()).toEqual(
      [fixture.pc, fixture.npc, unplaced, hidden].sort(),
    )
    expect(asDm.every((row) => row.kind === 'exact')).toBe(true)
  })

  /**
   * The same thing said as a derivative, because a length that is merely *wrong*
   * is far less alarming than a length that *moves*. Preparing an encounter must
   * not change a single byte of what any player is subscribed to.
   */
  test('preparing eight more monsters does not change the player’s payload at all', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const before = JSON.stringify(await t.query(api.characters.vitals, { code: fixture.code })) ?? ''
    const listBefore = JSON.stringify(await t.query(api.characters.list, { code: fixture.code })) ?? ''

    for (let i = 0; i < 8; i += 1) {
      const monster = await makeNpc(
        t,
        fixture.code,
        fixture.dmCode,
        `Ambusher ${i}`,
        npcSheet({ maxHp: 30 + i, notes: '', actions: [] }),
      )
      // Half of them go on the board's hidden layer, half are not placed at all —
      // the two ways a monster can be waiting.
      if (i % 2 === 0) {
        await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
          name: `Ambusher ${i}`,
          layer: 'dm',
          characterId: monster,
          x: 200 + i * 60,
          y: 1400,
        })
      }
    }

    expect(JSON.stringify(await t.query(api.characters.vitals, { code: fixture.code })) ?? '').toBe(
      before,
    )
    expect(JSON.stringify(await t.query(api.characters.list, { code: fixture.code })) ?? '').toBe(
      listBefore,
    )
    // And the DM's own view did move, or the loop above did nothing.
    const asDm = await t.query(api.characters.vitals, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(asDm).toHaveLength(10)
  })

  /**
   * The honest limit of the rule above, recorded rather than left to be found.
   *
   * "Visible" means *on the player layer*, and `board.tokens` is scoped to the
   * game rather than to the active scene — so a monster the DM has pre-placed on
   * the player layer of a map the party has not reached yet is already in their
   * token payload by name and by art, and its band comes with it. The DM layer is
   * the mechanism for hiding a creature; a future scene is not one. Anyone
   * changing that should change `visibleCharacterIds` and this test together.
   */
  test('the player layer is what hides a creature — a future scene is not', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const later = await makeScene(t, fixture.code, fixture.dmCode, 'The Vault')
    const ambusher = await makeNpc(
      t,
      fixture.code,
      fixture.dmCode,
      'Vault Sentinel',
      npcSheet({ maxHp: 60, notes: '', actions: [] }),
    )
    await addToken(t, fixture.code, fixture.dmCode, later, {
      name: 'Sentinel',
      layer: 'player',
      characterId: ambusher,
      x: 400,
      y: 400,
    })

    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    expect(rowFor(asPlayer, ambusher)?.kind).toBe('band')

    // Its position is not sent for a scene it does not stand on, which is the one
    // thing scene scoping does buy.
    const here = await t.query(api.board.positions, {
      code: fixture.code,
      sceneId: fixture.sceneId,
    })
    expect(here.map((row) => row.tokenId)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// (e) Refusals are indistinguishable
// ---------------------------------------------------------------------------

describe('refusing an NPC is indistinguishable from it not existing', () => {
  /**
   * Once the payload channel is closed, the remaining way to enumerate the DM's
   * bestiary is to guess ids and read the error back. A distinct "you may not see
   * that one" confirms a character sits behind the id, and a player who knows
   * there is a dragon has had the dragon spoiled whether or not they can read its
   * armour class. The same stance `TOKEN_NOT_FOUND` takes one module over.
   */
  test('characters.sheet answers identically for an NPC, a vanished id and another game’s hero', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makePc(t, other.code, 'Their Hero')
    const ghost = await vanishedCharacterId(t, fixture.code)

    const ask = (characterId: Id<'characters'>, playerId?: Id<'players'>) =>
      t.query(api.characters.sheet, {
        code: fixture.code,
        characterId,
        ...(playerId === undefined ? {} : { playerId }),
      })

    const npcAnswer = await ask(fixture.npc)
    expect(npcAnswer).toBeNull()
    expect(await ask(ghost)).toEqual(npcAnswer)
    expect(await ask(theirs)).toEqual(npcAnswer)

    // And with a seat id attached, which is the shape a real client sends.
    const npcSeated = await ask(fixture.npc, fixture.seat)
    expect(npcSeated).toBeNull()
    expect(await ask(ghost, fixture.seat)).toEqual(npcSeated)
    expect(await ask(theirs, fixture.seat)).toEqual(npcSeated)
  })

  test('characters.claim refuses an NPC, a vanished id and another game’s hero identically', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makePc(t, other.code, 'Their Hero')
    const ghost = await vanishedCharacterId(t, fixture.code)
    const ben = await makeSeat(t, fixture.code, 'Ben')

    const claim = (characterId: Id<'characters'>) =>
      t.mutation(api.characters.claim, { code: fixture.code, playerId: ben, characterId })

    const npcRefusal = await refusalOf(claim(fixture.npc))
    expect(npcRefusal.kind).toBe('CharacterNotFound')
    expect(await refusalOf(claim(ghost))).toEqual(npcRefusal)
    expect(await refusalOf(claim(theirs))).toEqual(npcRefusal)

    // Nothing was claimed on the way past.
    const roster = await t.query(api.players.list, { code: fixture.code })
    expect(roster.find((seat) => seat._id === ben)?.characterId).toBeNull()
  })

  test('characters.assign refuses the same three identically, DM code and all', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const other = await makeGame(t, 'Other Table', 'Sam')
    const theirs = await makePc(t, other.code, 'Their Hero')
    const ghost = await vanishedCharacterId(t, fixture.code)
    const ben = await makeSeat(t, fixture.code, 'Ben')

    const assign = (characterId: Id<'characters'>) =>
      t.mutation(api.characters.assign, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        playerId: ben,
        characterId,
      })

    // Refused even to the DM: the rule is about what a seat may play, not about
    // who is asking. Holding the code does not make a monster a playable hero.
    const npcRefusal = await refusalOf(assign(fixture.npc))
    expect(npcRefusal.kind).toBe('CharacterNotFound')
    expect(await refusalOf(assign(ghost))).toEqual(npcRefusal)
    expect(await refusalOf(assign(theirs))).toEqual(npcRefusal)

    // The control: a real hero does go onto the seat, so the refusals above are
    // about the character and not about `assign` being broken.
    await assign(fixture.pc)
    const roster = await t.query(api.players.list, { code: fixture.code })
    expect(roster.find((seat) => seat._id === ben)?.characterId).toBe(fixture.pc)
  })

  /**
   * The mutation return value is a read channel too, and `adjustHp` is the one
   * that would hand back a number. `delta: 0` is the attack: a read dressed as a
   * write, which changes nothing and would report the exact hit points if the
   * refusal keyed off the size of the change rather than off the character.
   */
  test('a player cannot read an NPC’s hit points back out of a write', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    for (const delta of [0, -5, 5]) {
      await expectKind(
        t.mutation(api.characters.adjustHp, {
          code: fixture.code,
          characterId: fixture.npc,
          delta,
          playerId: fixture.seat,
        }),
        'CharacterNotFound',
      )
    }
    await expectKind(
      t.mutation(api.characters.setHp, {
        code: fixture.code,
        characterId: fixture.npc,
        currentHp: 1,
        playerId: fixture.seat,
      }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.adjustHitDice, {
        code: fixture.code,
        characterId: fixture.npc,
        delta: -1,
        playerId: fixture.seat,
      }),
      'CharacterNotFound',
    )
    await expectKind(
      t.mutation(api.characters.rename, {
        code: fixture.code,
        characterId: fixture.npc,
        name: 'Kitten',
      }),
      'CharacterNotFound',
    )

    // And none of it moved the monster, which is the other half of a refusal.
    const asDm = await t.query(api.characters.vitals, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(rowFor(asDm, fixture.npc)).toEqual({
      kind: 'exact',
      characterId: fixture.npc,
      current: NPC_CURRENT_HP,
      max: NPC_MAX_HP,
      hitDiceCount: null,
      hitDiceRemaining: null,
    })
  })
})

// ---------------------------------------------------------------------------
// (f) characters.list
// ---------------------------------------------------------------------------

describe('characters.list', () => {
  test('hides NPCs with no DM code and with a wrong one, and shows them with the right one', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    const asPlayer = await t.query(api.characters.list, { code: fixture.code })
    expect(asPlayer.map((character) => character.name)).toEqual([PC_NAME])
    expect(asPlayer.every((character) => character.kind === 'pc')).toBe(true)

    // A `dmCode` argument is something a player's client can send; only a correct
    // one may change the answer.
    for (const dmCode of [twiddle(fixture.dmCode), '', '   ', 'ZZZZZZZZ']) {
      expect(
        await t.query(api.characters.list, { code: fixture.code, dmCode }),
        `dmCode ${JSON.stringify(dmCode)} changed a player's answer`,
      ).toEqual(asPlayer)
    }

    // Another table's DM code is not this table's.
    const other = await makeGame(t, 'Other Table', 'Sam')
    expect(
      await t.query(api.characters.list, { code: fixture.code, dmCode: other.dmCode }),
    ).toEqual(asPlayer)

    const asDm = await t.query(api.characters.list, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(asDm.map((character) => character.name).sort()).toEqual([NPC_NAME, PC_NAME].sort())
    expect(asDm.filter((character) => character.kind === 'npc')).toHaveLength(1)
  })

  /**
   * The roster is a query nobody thinks of as privileged, which is exactly why it
   * is worth checking: a seat holding a character resolves that character's name
   * for the lobby, and an NPC that reached a seat would be named there.
   */
  test('the lobby roster never names an NPC, even one written onto a seat behind the API', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const ben = await makeSeat(t, fixture.code, 'Ben')

    // `claim` and `assign` both refuse an NPC, so the only way into this state is
    // to write it directly — which is the point. The filter has to be where the
    // payload is built, not only at the two doors.
    await t.run(async (ctx) => {
      await ctx.db.patch('players', ben, { characterId: fixture.npc })
    })

    const roster = await t.query(api.players.list, { code: fixture.code })
    const seat = roster.find((row) => row._id === ben)
    expect(seat?.characterName).toBeNull()
    expect(JSON.stringify(roster) ?? '').not.toContain(NPC_NAME)
  })
})

// ---------------------------------------------------------------------------
// (g) The advisory ceiling, stated honestly
// ---------------------------------------------------------------------------

describe('the advisory ceiling is real, and is not more than claimed', () => {
  /**
   * Recorded in a test on purpose, so that whoever finds it reads this instead of
   * filing it as a bug.
   *
   * A `playerId` is routing and not proof of identity (ADR 0003), so a player who
   * reads another seat's id out of `players.list` — which is public — can pass it
   * and open that seat's character sheet. Closing that needs real accounts, which
   * ADR 0002 has now declined twice. It is bounded to data that is not a secret: a
   * hero's sheet belongs to the party.
   *
   * What must NOT follow is the monster, and that is the assertion that matters
   * here. The refusal that guards a secret keys off the DM code alone.
   */
  test('another seat’s id opens that seat’s hero — and never an NPC', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const ben = await makeSeat(t, fixture.code, 'Ben')

    // Ben's own seat gets nothing: the hero is Ana's.
    expect(
      await t.query(api.characters.sheet, {
        code: fixture.code,
        characterId: fixture.pc,
        playerId: ben,
      }),
    ).toBeNull()

    // Ana's seat id, which Ben can read straight out of the public roster, does.
    const roster = await t.query(api.players.list, { code: fixture.code })
    const anaSeat = roster.find((row) => row.displayName === 'Ana')!._id
    expect(anaSeat).toBe(fixture.seat)
    const borrowed = await t.query(api.characters.sheet, {
      code: fixture.code,
      characterId: fixture.pc,
      playerId: anaSeat,
    })
    expect(borrowed?.name).toBe(PC_NAME)
    expect(borrowed?.sheet.kind).toBe('pc')

    // The same trick against the monster gets nothing — including with the DM's
    // own seat id, because the badge in the roster is not the code (invariant 7).
    const dmSeat = roster.find((row) => row.isDm)!._id
    for (const playerId of [ben, anaSeat, dmSeat]) {
      expect(
        await t.query(api.characters.sheet, {
          code: fixture.code,
          characterId: fixture.npc,
          playerId,
        }),
        'a seat id opened an NPC sheet',
      ).toBeNull()
    }

    // Nor does the badge move the vitals payload.
    const asDmSeat = await t.query(api.characters.vitals, { code: fixture.code })
    expect(rowFor(asDmSeat, fixture.npc)?.kind).toBe('band')
  })

  /**
   * The badge, pressed harder. `players.isDm` is display only, so setting it on a
   * seat must change nothing about what that seat is served — the boolean that
   * decides is the one `resolveDmAccess` computes from the code on the request.
   */
  test('wearing the DM badge changes nothing about what a seat is served', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const ben = await makeSeat(t, fixture.code, 'Ben')
    await t.run(async (ctx) => {
      await ctx.db.patch('players', ben, { isDm: true })
    })

    const vitals = await t.query(api.characters.vitals, { code: fixture.code })
    expect(rowFor(vitals, fixture.npc)?.kind).toBe('band')
    expect(await t.query(api.characters.list, { code: fixture.code })).toHaveLength(1)
    expect(
      await t.query(api.characters.sheet, {
        code: fixture.code,
        characterId: fixture.npc,
        playerId: ben,
      }),
    ).toBeNull()
  })
})
