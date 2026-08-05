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

// ---------------------------------------------------------------------------
// Milestone 5's fixtures: two creatures off the DM's shelf
//
// Declared beside the others because `playerPayloads` below reaches the two bestiary
// queries, and those take a **required** `dmCode` — so the keys are needed before the
// section that scans for them.
//
// ⚠️ **Every string is hand-copied out of the corpus**, and the numbers out of the
// benchmark table with the arithmetic written beside them. Reading either through
// `bestiaryEntry` here would make the scan agree with a mangled corpus exactly as
// readily as with a correct one.
// ---------------------------------------------------------------------------

/** A monster, scaled — three ratings above where the corpus writes it. */
const CREATURE_KEY = 'dire-wolf'
const CREATURE_ENTRY_NAME = 'Dire Wolf'
/** The character document's own name, which is not the entry's and not the token's. */
const CREATURE_NAME = 'Wyrmshadow at the Ford'
/** 31 × 120/26 = 143.07… → 143, the maximum at CR 6. Distinctive on purpose. */
const CREATURE_MAX_HP = 143
const CREATURE_CURRENT_HP = 89
const CREATURE_BLURB = 'Horse-sized wolf that hunts in twos and does not tire.'
const CREATURE_LOOT = 'Nothing carried and nothing hidden. A beast owns only itself.'

/**
 * A social NPC, whose `knows` string **is the plot** — and the one creature in this
 * fixture whose shifted rating is a number worth scanning for.
 *
 * CR ⅛ is the only rating in the ten that a payload could not produce by coincidence:
 * `4` and `6` occur in an ability score, a die face and a grid offset, so a scan for
 * either fires on everything. `0.125` occurs nowhere else in this fixture, which is
 * the same reasoning `NPC_MAX_HP` is 271 for.
 */
const PERSON_KEY = 'innkeeper'
const PERSON_ENTRY_NAME = 'Innkeeper'
const PERSON_NAME = 'Maergan Tolt'
const PERSON_SHIFTED_CR = 0.125
const PERSON_BLURB = 'The village inn — beds, gossip and a jar of coin she should not have.'
const PERSON_LOOT =
  "A jar of thin old silver under the bar, the week's takings in a locked box and a very good bread knife."
const PERSON_KNOWS =
  'Three of her regulars have been paying in thin old silver of the Verrow mint, coin nobody has struck in four generations, and all three of them work the deep shift at the Hallow Delve. She keeps a jar of it under the bar and has told nobody, because the Ledger House in Greyhallow would want to know where it came from and so would the revenue.'

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

/**
 * The two published sheet numbers, for the fixtures below. **Written out rather than
 * imported or derived**, for `MAX_SCENE_BYTES`' reason in `scenes.test.ts`: these are what
 * the payload must say, and a test that recomputed them with `passivePerceptionFor` would
 * agree with that function about anything, including a mistake.
 *
 * - The hero's armour class is on its sheet. Its passive perception is **derived**: Wisdom
 *   11 is a modifier of 0, the fixture grants no Perception proficiency, so it is 10 + 0.
 * - The creature's armour class is on its sheet. Its passive perception is `null`, because
 *   `npcSheet` records none — which is the case worth having in the fixture, since the
 *   tempting wrong answer is 10.
 */
const PC_ARMOUR_CLASS = 17
const PC_PASSIVE_PERCEPTION = 10
const NPC_ARMOUR_CLASS = 22
const NPC_PASSIVE_PERCEPTION = null

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

/**
 * ⚠️ **Takes the DM code, because creating a character is the DM's on every path
 * now** — including a hero's.
 *
 * That is worth a line here rather than only in `characters.test.ts`, because this
 * suite is about who may *read* what, and a fixture that needs the DM code to build a
 * hero could be misread as saying the hero is a secret. It is not: the code decides who
 * may create, and the sheet decides who may see. Every assertion below still runs
 * against a payload fetched with no code at all.
 */
async function makePc(t: Harness, code: string, dmCode: string, name: string, sheet = pcSheet()) {
  const { characterId } = await t.mutation(api.characters.create, { code, dmCode, name, sheet })
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
  layer?: 'background' | 'player' | 'gm'
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

  const pc = await makePc(t, game.code, game.dmCode, PC_NAME)
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
 * A payload, or a marker for the refusal that came instead.
 *
 * `bestiary.index` and `bestiary.entry` take a **required** `dmCode`, so a player's
 * client has three shapes available and only two of them reach a handler: a wrong
 * code and an empty one are refused by `requireDm`, and no code at all is refused by
 * Convex's own argument validation before the handler runs.
 *
 * All three belong in the scan, because **the error channel is a read channel too** —
 * a refusal that named the creature would be as much of a leak as a payload carrying
 * it, which is the reasoning `CHARACTER_NOT_FOUND` is one shared constant for.
 *
 * A `ConvexError`'s `data` is swept; anything else is reduced to a marker rather than
 * having its message swept, and that is deliberate. Convex's argument-validation
 * message quotes the arguments it was sent — including the entry key this file asks
 * about — so scanning it would find the test's own request and report it as a leak.
 */
async function attempt(call: Promise<unknown>): Promise<unknown> {
  return await call.then(
    (value) => value,
    (error: unknown) =>
      error instanceof ConvexError ? { refused: error.data } : { refused: 'argument validation' },
  )
}

/**
 * Bestiary arguments as a client could actually send them, past the type system.
 *
 * "Sent no `dmCode` at all" is not expressible in the generated types, because the
 * field is required — and it is exactly the case that has to be swept, since it is
 * what a player's client would produce if the picker leaked into the player build.
 */
function asBestiaryArgs(args: Record<string, unknown>): {
  code: string
  dmCode: string
  key: string
} {
  return args as unknown as { code: string; dmCode: string; key: string }
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
    'bestiary.index (no dm code)': await attempt(
      t.query(api.bestiary.index, asBestiaryArgs({ code })),
    ),
    'bestiary.index (empty dm code)': await attempt(
      t.query(api.bestiary.index, { code, dmCode: '' }),
    ),
    'bestiary.index (wrong dm code)': await attempt(
      t.query(api.bestiary.index, { code, dmCode: wrong }),
    ),
    'bestiary.entry (no dm code)': await attempt(
      t.query(api.bestiary.entry, asBestiaryArgs({ code, key: CREATURE_KEY })),
    ),
    'bestiary.entry (empty dm code)': await attempt(
      t.query(api.bestiary.entry, { code, dmCode: '', key: CREATURE_KEY }),
    ),
    'bestiary.entry (wrong dm code)': await attempt(
      t.query(api.bestiary.entry, { code, dmCode: wrong, key: CREATURE_KEY }),
    ),
    'bestiary.entry (wrong dm code, the social one)': await attempt(
      t.query(api.bestiary.entry, { code, dmCode: wrong, key: PERSON_KEY }),
    ),
    'characters.vitals': await t.query(api.characters.vitals, { code }),
    /**
     * ⚠️ **The seat id matters to this query now, so the sweep has to send one.**
     * `characters.vitals` takes a `playerId` and answers `exact` for a creature that
     * seat has been granted — which means the no-seat payload alone stopped being the
     * whole of what a player's client can fetch. No grant is written in this fixture,
     * so the answer must still be a band; the granted direction is section (j).
     */
    'characters.vitals (the seat’s own id)': await t.query(api.characters.vitals, {
      code,
      playerId: seat,
    }),
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
    /**
     * ⚠️ **The one query in the sweep that is not scoped to this game, and it is here
     * as a replacement rather than an addition.** `players.listNames` used to hold this
     * slot; it is gone, because the name gate mounted it beside `players.list {code}`
     * for a strict subset of the same rows. Deleting the line would have shrunk the
     * sweep silently, which is the failure mode a sweep exists to prevent — so the new
     * public query a client can reach with **no credential at all** takes its place.
     *
     * `games.list` reads *every* game in the deployment rather than the one this fixture
     * built, so the scan now also proves the cross-game read carries nothing: the
     * creature's name and its hit points are in a game whose join code this caller is
     * not even supplying, and a projection that leaked a field would leak it from all
     * thirty rows at once.
     */
    'games.list': await t.query(api.games.list, {}),
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

/**
 * ⚠️ **RE-SCOPED, NOT RELAXED: everything below is about an *ungranted* creature.**
 *
 * Control now widens this milestone's headline secret — a seat the DM has handed a
 * creature receives its **exact** hit points rather than a band — so "a player sees no
 * exact NPC hit points" is no longer the whole rule, and a suite that went on asserting
 * it without saying which player would be asserting something false by omission.
 *
 * What is asserted here is the half that did not move, and it is the larger half:
 * **nothing about the grant machinery reaches a creature nobody was granted.** No grant
 * is written anywhere in `vitalsFixture`, and the payloads are swept with a seat id as
 * well as without one, because the seat id is the argument that changed.
 *
 * The other direction is section (j) at the foot of this file, and it is not optional:
 * a grant that quietly did nothing would pass every scan in this section and be
 * discovered at the table.
 */
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
    // ⚠️ The key list gained two, and the three `not.toHaveProperty` lines below are the
    // part that matters and are untouched: a creature's *hit points* are still absent from
    // a player's payload. Its armour class is now present, on purpose — see ADR 0014.
    expect(Object.keys(npcRow!).sort()).toEqual([
      'armourClass',
      'band',
      'characterId',
      'kind',
      'passivePerception',
    ])
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
   *
   * ⚠️ **The band variant carries two numbers now, and the claim below is still the same
   * claim — read the `float64` assertion, not the key list.** Armour class and passive
   * perception are published on both variants deliberately (see the ⚠️ on
   * `publicVitalsValidator` and ADR 0014), and they are declared as
   * `v.union(v.number(), v.null())`. So the guarantee this test exists to make holds
   * unchanged and mechanically: **no member of the band variant is a bare `float64`**, which
   * is what `current: v.number()` and `max: v.number()` are, so adding either still fails
   * here. What weakened is nothing about hit points; what changed is that this variant is no
   * longer empty of numbers, and the two it has are named in the key list on purpose so that
   * a third one cannot arrive unremarked.
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
    expect(Object.keys(band!.fields).sort()).toEqual([
      'armourClass',
      'band',
      'characterId',
      'kind',
      'passivePerception',
    ])
    // THE ASSERTION THIS TEST IS FOR. Both published numbers are `number | null` unions, so
    // a bare `float64` on this variant is still exactly what a hit point would have to be.
    expect(
      Object.entries(band!.fields).filter(([, field]) => field.kind === 'float64'),
      'the player-facing variant declares a bare number',
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
      // Milestone 4 adds the once-per-long-rest abilities already spent, on the same
      // row and for the same reason: it is state a rest clears, not something the
      // character is. Empty here, and empty is the common case.
      spentPerRest: [],
      // Published to both audiences. See ADR 0014 — the hero's was never a secret; what
      // this row proves is that the badge's number is on the payload rather than derived
      // in the browser, which is the half that matters for a creature.
      armourClass: PC_ARMOUR_CLASS,
      passivePerception: PC_PASSIVE_PERCEPTION,
    }

    const asPlayer = await t.query(api.characters.vitals, { code: fixture.code })
    expect(Object.keys(rowFor(asPlayer, fixture.pc)!).sort()).toEqual([
      'armourClass',
      'characterId',
      'current',
      'hitDiceCount',
      'hitDiceRemaining',
      'kind',
      'max',
      'passivePerception',
      'spentPerRest',
    ])
    expect(rowFor(asPlayer, fixture.pc)).toEqual(exact)

    const asDm = await t.query(api.characters.vitals, {
      code: fixture.code,
      dmCode: fixture.dmCode,
    })
    expect(rowFor(asDm, fixture.pc)).toEqual(exact)
    // And the DM's own row for the monster is the exact variant, so the two
    // payloads differ in the NPC row and in nothing else.
    //
    // ⚠️ **"and in nothing else" is now literally true of these two fields**, which is the
    // point of publishing them: the DM's armour class for the monster and the player's are
    // the same number, so the badge is not a thing a DM sees and a player does not.
    expect(rowFor(asDm, fixture.npc)).toEqual({
      kind: 'exact',
      characterId: fixture.npc,
      current: NPC_CURRENT_HP,
      max: NPC_MAX_HP,
      hitDiceCount: null,
      hitDiceRemaining: null,
      spentPerRest: [],
      armourClass: NPC_ARMOUR_CLASS,
      passivePerception: NPC_PASSIVE_PERCEPTION,
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
        spentPerRest: [],
        armourClass: NPC_ARMOUR_CLASS,
        passivePerception: NPC_PASSIVE_PERCEPTION,
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
      layer: 'gm',
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
          layer: 'gm',
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
    const theirs = await makePc(t, other.code, other.dmCode, 'Their Hero')
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
    const theirs = await makePc(t, other.code, other.dmCode, 'Their Hero')
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
    const theirs = await makePc(t, other.code, other.dmCode, 'Their Hero')
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
      armourClass: NPC_ARMOUR_CLASS,
      passivePerception: NPC_PASSIVE_PERCEPTION,
      hitDiceCount: null,
      hitDiceRemaining: null,
      spentPerRest: [],
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

// ---------------------------------------------------------------------------
// (h) Milestone 4: the same guarantee, now that a sheet is assembled server-side
// ---------------------------------------------------------------------------
//
// RE-PROVEN RATHER THAN ASSUMED, and it is worth saying why the re-proof is not
// ceremony. Milestone 3's guarantee rested on a stored `sheet` field whose `kind`
// decided everything. Milestone 4 puts a *resolver* between the document and every
// consumer of it: `maySeeCharacter`, `visibleVitals` and the health bands all now
// read a sheet that was built out of a static library, a race and the DM's
// overrides a moment ago rather than one that was read off the row.
//
// That is exactly the sort of change that quietly moves a discriminator. So the
// three questions are asked again against the new machinery: a premade character
// cannot be a monster, a premade hero's numbers are still exact for the whole
// party, and a monster's are still a band with a resolver in the path.

/** The selections a premade character stores. A level 3 Human Fighter by default. */
function presetSheet(
  overrides: Partial<{
    race: 'human' | 'elf' | 'dwarf' | 'halfling' | 'half-orc' | 'tiefling' | 'dragonborn' | 'goliath'
    classKey: 'barbarian' | 'bard' | 'cleric' | 'fighter' | 'paladin' | 'ranger' | 'rogue' | 'wizard'
    subclassKey: string | null
    level: number
    locked: boolean
  }> = {},
) {
  return {
    kind: 'preset' as const,
    race: 'human' as const,
    classKey: 'fighter' as const,
    subclassKey: 'champion' as string | null,
    level: 3,
    locked: false,
    ...overrides,
  }
}

/** A level 3 Champion Fighter out of the library: 28 hit points on 3d10. */
const PRESET_MAX_HP = 28
const PRESET_HIT_DICE = 3
const PRESET_NAME = 'Brannoc Emberhand'
/**
 * The same character's two published sheet numbers, and neither is stored anywhere: a
 * `preset` document holds a race, a class, a subclass and a level. Both come out of
 * `resolveSheet`, which is what makes them worth asserting on a *premade* hero rather than
 * only on a hand-built one — the passive perception is derived from ability scores the
 * library supplied, through a chain that never touches the stored document.
 */
const PRESET_ARMOUR_CLASS = 18
const PRESET_PASSIVE_PERCEPTION = 13

describe('Milestone 4: resolution runs server-side, and Milestone 3’s guarantee holds', () => {
  /**
   * A PREMADE CHARACTER CANNOT BE A MONSTER, and there is no route to one.
   *
   * The stored union has three members and only two of them resolve: `preset` is a
   * set of selections over the *player-character* library, so `resolveSheet` returns
   * `kind: 'pc'` for every one of them. Which means the reduced NPC sheet — the
   * thing `maySeeCharacter` keys off — is unreachable from a preset by construction
   * rather than by a check somebody has to remember.
   *
   * Asserted through the API in all four directions: creating one, creating one
   * while holding the DM code, converting a monster into one, and converting one
   * into a monster.
   */
  test('a preset NPC is impossible: every route to one is refused or resolves to a hero', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode } = fixture

    // (1) Creating one takes the DM code, like every other create — and what comes out
    // is a hero to a caller who has none. ⚠️ This used to read "needs no DM code,
    // because it is not a monster"; the code now decides *who may create* rather than
    // *what is created*, and the second half is what is asserted here.
    const { characterId: hero } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: PRESET_NAME,
      sheet: presetSheet(),
    })
    expect(
      (await t.query(api.characters.list, { code })).find((row) => row._id === hero)?.kind,
    ).toBe('pc')

    // (2) A second one, built the same way and listed the same way, so the assertion
    // below is about two heroes rather than about one that happened to work.
    const { characterId: alsoHero } = await t.mutation(api.characters.create, {
      code,
      name: 'Second Opinion',
      sheet: presetSheet({ race: 'dwarf' }),
      dmCode,
    })
    const asPlayer = await t.query(api.characters.list, { code })
    expect(asPlayer.map((row) => row._id).sort()).toEqual([fixture.pc, hero, alsoHero].sort())
    expect(asPlayer.every((row) => row.kind === 'pc')).toBe(true)

    // (3) The monster cannot become one, so a spoiler cannot be published by an
    // edit — and (4) the hero cannot become a monster, so a hero's numbers cannot
    // be taken away from the party by one either.
    for (const [characterId, sheet] of [
      [fixture.npc, presetSheet()],
      [hero, npcSheet({ maxHp: 9, notes: '', actions: [] })],
    ] as const) {
      const refusal = await refusalOf(
        t.mutation(api.characters.updateSheet, { code, characterId, sheet, dmCode }),
      )
      expect(refusal.kind).toBe('BadInput')
      expect(refusal.message).toBe(
        'A character cannot change between a player character and an NPC.',
      )
    }

    // Nothing moved: the monster is still hidden and still exact only to the DM.
    expect(await t.query(api.characters.list, { code })).toHaveLength(3)
    expect(rowFor(await t.query(api.characters.vitals, { code }), fixture.npc)?.kind).toBe('band')

    // And the two mutations that only a premade character has refuse the monster
    // outright, rather than treating it as one.
    for (const call of [
      t.mutation(api.characters.setLevel, { code, dmCode, characterId: fixture.npc, level: 4 }),
      t.mutation(api.characters.setUnlocked, {
        code,
        dmCode,
        characterId: fixture.npc,
        locked: false,
      }),
    ]) {
      await expectKind(call, 'BadInput')
    }
  })

  /**
   * requirements.md asks for `20/45` above a hero's token for everybody at the
   * table, and a hero assembled out of the library is no different — the party
   * knowing its own hit points is not a secret in any edition.
   *
   * The numbers are the library's, so this also proves the vitals row was seeded
   * from the *resolved* sheet at insert time. A `preset` document holds no maximum
   * at all, so a row written from the stored shape would have had nothing to read.
   */
  test('a premade hero’s exact hit points are exact for the player, the party and the DM', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode } = fixture
    const ben = await makeSeat(t, code, 'Ben')

    const { characterId: hero } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: PRESET_NAME,
      sheet: presetSheet(),
    })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: hero })
    await t.mutation(api.characters.adjustHp, { code, characterId: hero, delta: -9, playerId: ben })

    const expected = {
      kind: 'exact',
      characterId: hero,
      current: PRESET_MAX_HP - 9,
      max: PRESET_MAX_HP,
      hitDiceCount: PRESET_HIT_DICE,
      hitDiceRemaining: PRESET_HIT_DICE,
      spentPerRest: [],
      // The library's, like every other number in this row — which is the same proof one
      // field further: a `preset` document stores no armour class and no ability scores, so
      // both of these had to come off the *resolved* sheet or they would be null.
      armourClass: PRESET_ARMOUR_CLASS,
      passivePerception: PRESET_PASSIVE_PERCEPTION,
    }

    // The player playing them, another seat entirely, a caller with no seat at all,
    // and the DM: one answer, and it is the exact one.
    for (const who of [{}, { dmCode }, { dmCode: twiddle(dmCode) }]) {
      const rows = await t.query(api.characters.vitals, { code, ...who })
      expect(rowFor(rows, hero), JSON.stringify(who)).toEqual(expected)
    }

    // And the monster in the same payload is still a band, so the two rules are
    // being applied per character rather than per request.
    const mixed = await t.query(api.characters.vitals, { code })
    expect(rowFor(mixed, fixture.npc)?.kind).toBe('band')
    expect(rowFor(mixed, hero)?.kind).toBe('exact')
  })

  /**
   * The payload scan again, with a premade character in the game.
   *
   * The point is not that a hero could leak a monster — it is that resolution now
   * runs inside every one of these queries, over a library that holds seventy-two
   * stat blocks, and a resolver that reached for the wrong document or spread a raw
   * row into a payload would show up here and nowhere else.
   */
  test('no player payload leaks the monster once a premade hero shares the game', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)

    await t.mutation(api.characters.create, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      name: PRESET_NAME,
      sheet: presetSheet({ race: 'goliath', classKey: 'wizard', subclassKey: 'evocation' }),
    })
    await t.mutation(api.characters.create, {
      code: fixture.code,
      name: 'Second Opinion',
      sheet: presetSheet({ race: 'dwarf', level: 1, subclassKey: null }),
      dmCode: fixture.dmCode,
    })

    for (const [name, payload] of Object.entries(await playerPayloads(t, fixture))) {
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
      expect(serialised, `${name} leaked the npc discriminator`).not.toContain('"npc"')
    }

    // The positive control, so the sweep above is running against a game that has
    // something in it: the premade hero really is in the player's payload.
    const listed = await t.query(api.characters.list, { code: fixture.code })
    expect(listed.map((row) => row.name)).toContain(PRESET_NAME)
    expect(listed.every((row) => row.kind === 'pc')).toBe(true)
  })

  /**
   * The bands, once more, with the resolver in the path on the other side of the
   * payload. A monster's `maxHp` still comes off its own stored sheet — resolution
   * passes an `npc` sheet through untouched — so the ratio the band is computed from
   * has not moved.
   */
  test('a monster is still a band, and the band still tracks its stored hit points', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    await t.mutation(api.characters.create, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      name: PRESET_NAME,
      sheet: presetSheet(),
    })

    for (const [currentHp, band] of [
      [NPC_MAX_HP, 'healthy'],
      [Math.floor(NPC_MAX_HP / 2), 'bloodied'],
      [Math.floor(NPC_MAX_HP / 5), 'critical'],
      [0, 'down'],
    ] as [number, HealthBand][]) {
      await setHp(t, fixture.code, fixture.dmCode, fixture.npc, currentHp)
      expect(await bandOf(t, fixture.code, fixture.npc), `${currentHp}/${NPC_MAX_HP}`).toBe(band)
    }
  })

  /**
   * A premade character's *sheet* is a hero's sheet, so the ordinary rule applies:
   * the seat playing them sees it, another seat does not, and the DM sees any of
   * them. Worth restating with a preset because the sheet a player receives is now
   * assembled rather than stored — the refusal happens before the assembly, and has
   * to keep happening there.
   */
  test('a premade hero’s sheet is still only for the seat playing it and the DM', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode } = fixture
    const ben = await makeSeat(t, code, 'Ben')

    const { characterId: hero } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: PRESET_NAME,
      sheet: presetSheet(),
    })
    await t.mutation(api.characters.claim, { code, playerId: ben, characterId: hero })

    expect(
      (await t.query(api.characters.sheet, { code, characterId: hero, playerId: ben }))?.sheet.kind,
    ).toBe('pc')
    expect(
      await t.query(api.characters.sheet, { code, characterId: hero, playerId: fixture.seat }),
    ).toBeNull()
    expect(await t.query(api.characters.sheet, { code, characterId: hero })).toBeNull()
    expect(
      (await t.query(api.characters.sheet, { code, characterId: hero, dmCode }))?.preset,
    ).toMatchObject({ kind: 'preset', classKey: 'fighter' })
  })
})

// ---------------------------------------------------------------------------
// (i) Milestone 5: the same guarantee, with a creature read live out of a corpus
// ---------------------------------------------------------------------------
//
// RE-PROVEN RATHER THAN ASSUMED, and this time there is a second secret in the payload
// rather than a second route to the first one.
//
// Milestone 4 put a resolver between the document and every consumer. Milestone 5 puts a
// *corpus* behind the resolver, and a creature carries far more than a statline: a loot
// line, a blurb, an alignment, a recommended party level, and — for the thirty social
// entries — an occupation, three personality keywords and a `knows` string which **is
// the plot**. Every one of those travels in `creaturePayload`, inside the same
// `characters.sheet` payload a hero's own sheet uses, and CLAUDE.md is explicit that the
// mechanical guard does not reach it: a bestiary payload and a preset payload are both
// legitimately shaped, so Convex would approve either against `publicSheetValidator`
// without comment. What keeps a creature away from a player is the structural guard, and
// this is where that gets proved rather than asserted.
//
// It also adds the first two DM-only queries that are not about a table at all. The
// corpus is a static module, so `bestiary.index` and `bestiary.entry` read nothing the
// leak guard sweeps — `requireDm` on the first line of each is the whole of the gate, and
// a `dmCode` that is merely *present* is what `twiddle` exists to rule out.

/**
 * The vitals fixture with the DM's shelf drawn on: one scaled monster and one person,
 * both with a coin on the **player** layer.
 *
 * The player layer is what makes this worth writing, exactly as it was for the NPC in
 * `vitalsFixture`. A creature hidden on the DM layer would make every assertion below
 * pass for the wrong reason — the token choke point would already have dropped it, and
 * neither the vitals union nor `maySeeCharacter` would ever be asked a hard question. A
 * creature the party can see is precisely the creature whose stat block the DM is still
 * keeping.
 *
 * Built alongside `vitalsFixture` rather than inside it, so that the count tests in
 * section (d) keep asserting the lengths they were written against.
 */
async function bestiaryFixture(t: Harness) {
  const fixture = await vitalsFixture(t)
  const { code, dmCode, sceneId } = fixture

  const { characterId: creature } = await t.mutation(api.characters.create, {
    code,
    dmCode,
    name: CREATURE_NAME,
    sheet: { kind: 'bestiary', entryKey: CREATURE_KEY, cr: 1 },
  })
  // Scaled three ratings up, which is what makes 143 a number nobody sent.
  await t.mutation(api.characters.setCreatureCr, { code, dmCode, characterId: creature, cr: 6 })
  await setHp(t, code, dmCode, creature, CREATURE_CURRENT_HP)
  // The coin's name is deliberately neither the entry's nor the character's: a player is
  // *supposed* to see what is written on a token, so reusing either string would make the
  // scan below unable to tell a leak from the thing it is meant to allow.
  await addToken(t, code, dmCode, sceneId, {
    name: 'Shape in the Reeds',
    layer: 'player',
    characterId: creature,
    x: 1100,
    y: 700,
  })

  const { characterId: person } = await t.mutation(api.characters.create, {
    code,
    dmCode,
    name: PERSON_NAME,
    sheet: { kind: 'bestiary', entryKey: PERSON_KEY, cr: 0 },
  })
  await t.mutation(api.characters.setCreatureCr, {
    code,
    dmCode,
    characterId: person,
    cr: PERSON_SHIFTED_CR,
  })
  await addToken(t, code, dmCode, sceneId, {
    name: 'Someone Behind the Bar',
    layer: 'player',
    characterId: person,
    x: 1500,
    y: 300,
  })

  return { ...fixture, creature, person }
}

describe('a player inspecting network traffic sees nothing off the DM’s shelf', () => {
  test('no payload fetched without the DM code carries a creature’s numbers, labels or plot', async () => {
    const t = harness()
    const fixture = await bestiaryFixture(t)
    const payloads = await playerPayloads(t, fixture)

    for (const [name, payload] of Object.entries(payloads)) {
      const serialised = JSON.stringify(payload) ?? ''

      // Milestone 3's needles first, because a creature in the game is a new way for the
      // old secret to travel: `characters.vitals` now resolves two more sheets.
      expect(containsNumber(serialised, NPC_MAX_HP), `${name} leaked the NPC's maximum`).toBe(false)
      expect(
        containsNumber(serialised, NPC_CURRENT_HP),
        `${name} leaked the NPC's current hit points`,
      ).toBe(false)
      expect(serialised, `${name} leaked the NPC's name`).not.toContain(NPC_NAME)
      expect(serialised, `${name} leaked the NPC's notes`).not.toContain(NPC_NOTES)
      expect(serialised, `${name} leaked the npc discriminator`).not.toContain('"npc"')

      // And Milestone 5's. The discriminator beside the old one: `characters.list` drops
      // a creature's row and `characters.sheet` refuses one, so no player payload has a
      // reason to carry the word at all.
      expect(serialised, `${name} leaked the bestiary discriminator`).not.toContain('"bestiary"')
      expect(serialised, `${name} leaked the entry key`).not.toContain(CREATURE_KEY)
      expect(serialised, `${name} leaked the social entry key`).not.toContain(PERSON_KEY)
      expect(serialised, `${name} leaked the creature's name`).not.toContain(CREATURE_NAME)
      expect(serialised, `${name} leaked the monster entry's name`).not.toContain(
        CREATURE_ENTRY_NAME,
      )
      expect(serialised, `${name} leaked the person's name`).not.toContain(PERSON_NAME)
      expect(serialised, `${name} leaked the social entry's name`).not.toContain(PERSON_ENTRY_NAME)
      expect(serialised, `${name} leaked the creature's loot`).not.toContain(CREATURE_LOOT)
      expect(serialised, `${name} leaked the person's loot`).not.toContain(PERSON_LOOT)
      expect(serialised, `${name} leaked the creature's blurb`).not.toContain(CREATURE_BLURB)
      expect(serialised, `${name} leaked the person's blurb`).not.toContain(PERSON_BLURB)
      // The one that is not a statistic and matters most. What the innkeeper knows is the
      // plot, and the whole social block is DM-only for that reason.
      expect(serialised, `${name} leaked what the innkeeper knows`).not.toContain(PERSON_KNOWS)

      // The scaled creature's numbers, and the *rating* the DM chose — through
      // `containsNumber` rather than `toContain`, because both are numbers and a bare
      // substring search fires on a thirteen-digit `_creationTime`.
      expect(
        containsNumber(serialised, CREATURE_MAX_HP),
        `${name} leaked the creature's maximum`,
      ).toBe(false)
      expect(
        containsNumber(serialised, CREATURE_CURRENT_HP),
        `${name} leaked the creature's current hit points`,
      ).toBe(false)
      expect(
        containsNumber(serialised, PERSON_SHIFTED_CR),
        `${name} leaked the rating the DM shifted a creature to`,
      ).toBe(false)
    }
  })

  /**
   * THE OTHER HALF, GROWN TO MATCH — and this is the half this repo has written down
   * twice, because without it the loop above passes on a game with no creature in it.
   *
   * Two claims, and both have to hold. The player really is being served: they can see
   * both coins and they do get a band for each. And every needle the loop hunted for is
   * genuinely in the database and genuinely reachable — with the DM code, from these
   * three queries, and from nowhere else.
   */
  test('positive control: the player sees two coins and two bands, and the DM sees everything', async () => {
    const t = harness()
    const fixture = await bestiaryFixture(t)
    const { code, dmCode } = fixture

    // Half one — the party really is looking at these two creatures.
    const tokens = await t.query(api.board.tokens, { code })
    expect(tokens.map((token) => token.name).sort()).toEqual(
      [NPC_TOKEN_NAME, PC_NAME, 'Shape in the Reeds', 'Someone Behind the Bar'].sort(),
    )
    const asPlayer = await t.query(api.characters.vitals, { code })
    expect(rowFor(asPlayer, fixture.creature)?.kind).toBe('band')
    expect(rowFor(asPlayer, fixture.person)?.kind).toBe('band')
    // A band that tracks the stored number rather than a constant: 89 of 143 is 62%.
    expect(await bandOf(t, code, fixture.creature)).toBe('healthy')

    // Half two — the shelf, which is where the keys, the names and the blurbs live.
    const index = JSON.stringify(await t.query(api.bestiary.index, { code, dmCode })) ?? ''
    for (const needle of [
      CREATURE_KEY,
      CREATURE_ENTRY_NAME,
      CREATURE_BLURB,
      PERSON_KEY,
      PERSON_ENTRY_NAME,
      PERSON_BLURB,
    ]) {
      expect(index, `bestiary.index does not carry ${needle}`).toContain(needle)
    }

    // The library's own copy of each, which is where the loot and the plot live. The
    // index deliberately carries neither — a summary is not a stat block — so a control
    // that looked only there would leave two needles unproven.
    const wolf =
      JSON.stringify(
        await t.query(api.bestiary.entry, { code, dmCode, key: CREATURE_KEY, cr: 6 }),
      ) ?? ''
    expect(wolf).toContain(CREATURE_ENTRY_NAME)
    expect(wolf).toContain(CREATURE_LOOT)
    expect(wolf).toContain(CREATURE_BLURB)
    expect(containsNumber(wolf, CREATURE_MAX_HP)).toBe(true)

    const innkeeper =
      JSON.stringify(await t.query(api.bestiary.entry, { code, dmCode, key: PERSON_KEY })) ?? ''
    expect(innkeeper).toContain(PERSON_ENTRY_NAME)
    expect(innkeeper).toContain(PERSON_LOOT)
    expect(innkeeper).toContain(PERSON_KNOWS)

    // And the assigned creatures' own sheets, which is where the character's name, the
    // stored key and the shifted rating live.
    const creatureSheet =
      JSON.stringify(
        await t.query(api.characters.sheet, { code, dmCode, characterId: fixture.creature }),
      ) ?? ''
    expect(creatureSheet).toContain(CREATURE_NAME)
    expect(creatureSheet).toContain(CREATURE_KEY)
    expect(creatureSheet).toContain(CREATURE_LOOT)
    expect(creatureSheet).toContain('"npc"')
    expect(containsNumber(creatureSheet, CREATURE_MAX_HP)).toBe(true)

    /**
     * ⚠️ **`"bestiary"` is the one needle in the loop above that no query can control,
     * and that is a fact about the payloads rather than a gap in this test.**
     *
     * The word appears in the *database* and travels to nobody, not even the DM:
     * `creaturePayload` rebuilds the labels and the two selections field by field and
     * never names a `kind`, and the resolved sheet says `npc` because that is what it
     * is. Contrast `preset`, whose stored shape *is* sent to the DM verbatim — which is
     * why `"preset"` would positively control and this does not.
     *
     * So the needle is a tripwire for a raw stored document being spread into a payload
     * — the one thing that would put it on the wire — and the honest positive control is
     * the row itself, read with `t.run`. Asserting it against a query instead is how a
     * needle silently becomes decoration.
     */
    const storedSheet = await t.run(
      async (ctx) => (await ctx.db.get('characters', fixture.creature))?.sheet,
    )
    expect(JSON.stringify(storedSheet) ?? '').toContain('"bestiary"')
    expect(storedSheet).toStrictEqual({ kind: 'bestiary', entryKey: CREATURE_KEY, cr: 6 })

    const personSheet =
      JSON.stringify(
        await t.query(api.characters.sheet, { code, dmCode, characterId: fixture.person }),
      ) ?? ''
    expect(personSheet).toContain(PERSON_NAME)
    expect(personSheet).toContain(PERSON_KEY)
    expect(personSheet).toContain(PERSON_KNOWS)
    expect(personSheet).toContain(PERSON_LOOT)
    expect(
      containsNumber(personSheet, PERSON_SHIFTED_CR),
      'the DM cannot see the rating they shifted a creature to',
    ).toBe(true)

    // The exact hit points, which only `characters.vitals` carries.
    const dmVitals = JSON.stringify(await t.query(api.characters.vitals, { code, dmCode })) ?? ''
    expect(containsNumber(dmVitals, CREATURE_CURRENT_HP)).toBe(true)
    expect(containsNumber(dmVitals, CREATURE_MAX_HP)).toBe(true)
  })

  /**
   * The number scan's own instrument, checked against the one value in this fixture that
   * is not a whole number. It is worth pinning that `containsNumber` handles a decimal at
   * all rather than assuming it, because CR ⅛ is the only rating a scan can look for
   * without firing on an ability score.
   */
  test('the number scan matches a fractional challenge rating and not a longer number', () => {
    expect(containsNumber('{"cr":0.125}', 0.125)).toBe(true)
    expect(containsNumber('[0.125,4]', 0.125)).toBe(true)
    expect(containsNumber('{"x":10.125}', 0.125)).toBe(false)
    expect(containsNumber('{"x":0.1255}', 0.125)).toBe(false)
    expect(containsNumber('{"cr":0.25}', 0.125)).toBe(false)
  })

  /**
   * The count leak, restated for the shelf — and it is a different count from the one
   * section (d) is about.
   *
   * Section (d) holds that a player cannot count the DM's prepared monsters. This holds
   * that a player cannot tell **which** of ~130 creatures the DM has picked, which is the
   * spoiler the whole corpus is gated for: the library is not a secret, and which twelve
   * of it are in tonight's game is.
   */
  test('preparing eight creatures off the shelf does not change the player’s payload at all', async () => {
    const t = harness()
    const fixture = await bestiaryFixture(t)
    const before = JSON.stringify(await t.query(api.characters.vitals, { code: fixture.code })) ?? ''
    const listBefore =
      JSON.stringify(await t.query(api.characters.list, { code: fixture.code })) ?? ''

    // Eight more, none of them placed on the player layer — half unplaced, half hidden.
    for (let i = 0; i < 8; i += 1) {
      const { characterId } = await t.mutation(api.characters.create, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        name: `Ambusher ${i}`,
        sheet: { kind: 'bestiary', entryKey: CREATURE_KEY, cr: 2 },
      })
      if (i % 2 === 0) {
        await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
          name: `Ambusher ${i}`,
          layer: 'gm',
          characterId,
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
    expect(
      await t.query(api.characters.vitals, { code: fixture.code, dmCode: fixture.dmCode }),
    ).toHaveLength(12)
  })

  /**
   * `playerId` is routing rather than identity, so a player can pass any seat's id —
   * including the DM's, whose badge is in the public roster. None of it opens a creature.
   *
   * ⚠️ **The sentence that used to finish this comment — "because the refusal that guards
   * a secret keys off the DM code alone" — is no longer true in general, and the fixture
   * is what makes it true here.** A grant is a second door, opened by the DM deliberately,
   * and a seat id passed against a granted creature *does* open it (that residual is
   * sanctioned; closing it needs accounts, which ADR 0002 has declined). `bestiaryFixture`
   * writes no grant, so every seat below has been granted nothing, and what is being
   * asserted is that a seat id on its own — badge or otherwise — is worth exactly nothing.
   * Section (j) walks the other side of that door.
   */
  test('no seat id, badge or otherwise, opens a creature’s sheet', async () => {
    const t = harness()
    const fixture = await bestiaryFixture(t)
    const ben = await makeSeat(t, fixture.code, 'Ben')
    const roster = await t.query(api.players.list, { code: fixture.code })
    const dmSeat = roster.find((row) => row.isDm)!._id

    for (const playerId of [ben, fixture.seat, dmSeat]) {
      for (const characterId of [fixture.creature, fixture.person]) {
        expect(
          await t.query(api.characters.sheet, { code: fixture.code, characterId, playerId }),
          'a seat id opened a creature sheet',
        ).toBeNull()
      }
    }

    // Nor does the badge move the vitals payload off a band.
    const vitals = await t.query(api.characters.vitals, { code: fixture.code })
    expect(rowFor(vitals, fixture.creature)?.kind).toBe('band')
    expect(rowFor(vitals, fixture.person)?.kind).toBe('band')
  })
})

// ---------------------------------------------------------------------------
// (j) Milestone 7: control widens the headline secret, by exactly one seat
// ---------------------------------------------------------------------------
//
// THE OTHER DIRECTION, AND IT IS NOT OPTIONAL. Every scan above holds that an ungranted
// creature's exact hit points reach nobody. On its own that is satisfied by a grant that
// does not work at all — which would be a feature discovered broken at the table, and
// which would look exactly like this suite passing.
//
// So the two are written as a pair. `visibleVitals` sends `exact` for
// `isDm || controlled.has(id)`, and `controlled` is built from the same visible-token set
// the band rule uses, so a grant can only ever upgrade a creature the caller can already
// see standing on their board. It opens nothing new; it changes what may be read about
// something already open.
//
// The reason it has to send `exact` rather than a band is not symmetry. `HpControls`
// renders its `−`/`+` only on the `exact` variant, on the stated grounds that a caller who
// may edit hit points is always sent them — so a granted player with a band would get the
// party's wolf with no way to take damage on it. That is a feature that looks broken
// rather than one that looks restricted, which is why the widening exists.

/** The DM hands one token to a set of seats. */
async function setControllers(
  t: Harness,
  fixture: { code: string; dmCode: string },
  tokenId: Id<'tokens'>,
  playerIds: Id<'players'>[],
) {
  await t.mutation(api.board.setControllers, {
    code: fixture.code,
    dmCode: fixture.dmCode,
    tokenId,
    playerIds,
  })
}

describe('a granted seat is sent exact hit points, and only that seat', () => {
  /**
   * THE WIDENING, BOUNDED IN ONE TEST. Ana is handed the monster and Ben is not, so one
   * query answers two different things for two seats at one table — which is the whole
   * reason `characters.vitals` took a `playerId` and split its cache entry per seat.
   *
   * Ben's side is the full payload scan rather than a kind check, because the interesting
   * failure is not "Ben's row said band" but "the numbers turned up in something else of
   * Ben's on the way past".
   */
  test('the granted seat gets exact, the ungranted seat gets a band and nothing else', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, seat: ana, npc, npcToken } = fixture
    const ben = await makeSeat(t, code, 'Ben')

    await setControllers(t, fixture, npcToken, [ana])

    const forAna = rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc)
    expect(forAna).toEqual({
      kind: 'exact',
      characterId: npc,
      current: NPC_CURRENT_HP,
      max: NPC_MAX_HP,
      // A monster has no hit dice at all — the reduced sheet carries none — so both
      // travel as null rather than as a zero somebody could spend.
      hitDiceCount: null,
      hitDiceRemaining: null,
      spentPerRest: [],
      armourClass: NPC_ARMOUR_CLASS,
      passivePerception: NPC_PASSIVE_PERCEPTION,
    })

    // Ben was granted nothing, and neither was the caller with no seat at all — which is
    // the fail-closed case, since `undefined` means no grants rather than every grant.
    for (const who of [{ playerId: ben }, {}]) {
      const rows = await t.query(api.characters.vitals, { code, ...who })
      expect(rowFor(rows, npc)?.kind, JSON.stringify(who)).toBe('band')

      const serialised = JSON.stringify(rows) ?? ''
      expect(containsNumber(serialised, NPC_MAX_HP), 'the maximum leaked').toBe(false)
      expect(containsNumber(serialised, NPC_CURRENT_HP), 'the current total leaked').toBe(false)
    }

    // And the grant does not open the *sheet* to Ben either. The two secrets travel by
    // different routes — the numbers through the vitals union, the stat block through
    // `maySeeCharacter` — and both stay shut for him.
    //
    // ⚠️ Scanned as **Ben's** payloads rather than through `playerPayloads`, which sends
    // `fixture.seat` — that is Ana, who has been granted the creature, so her payloads
    // now legitimately carry it. A sweep that had reused the shared helper here would
    // have been asserting the opposite of what it says.
    for (const [name, payload] of Object.entries({
      'characters.sheet (ben’s id)': await t.query(api.characters.sheet, {
        code,
        characterId: npc,
        playerId: ben,
      }),
      'characters.list': await t.query(api.characters.list, { code }),
      'characters.vitals (ben’s id)': await t.query(api.characters.vitals, {
        code,
        playerId: ben,
      }),
      'board.tokens': await t.query(api.board.tokens, { code }),
      'players.list': await t.query(api.players.list, { code }),
    })) {
      const serialised = JSON.stringify(payload) ?? ''
      expect(serialised, `${name} leaked the NPC's name`).not.toContain(NPC_NAME)
      expect(serialised, `${name} leaked the NPC's notes`).not.toContain(NPC_NOTES)
      expect(serialised, `${name} leaked an NPC action`).not.toContain(NPC_ACTION_NAME)
    }

    // ⚠️ **The sanctioned residual, stated rather than left to be discovered.** Ana's own
    // payload does carry the sheet, and `playerId` is routing rather than identity — so
    // Ben passing Ana's id reads what Ana was granted. That is a fourth decline of
    // accounts (ADR 0002) rather than an oversight: the door was opened by the DM on
    // purpose, and closing the residual needs identity rather than another check.
    // Asserted so that anyone tightening this later knows they are changing a decision.
    expect(
      await t.query(api.characters.sheet, { code, characterId: npc, playerId: ana }),
    ).not.toBeNull()
  })

  /**
   * ⚠️ **THE COMPOSITION, ON THE HIT-POINT SIDE.** `controlledCharacterIds` is built from
   * `visibleTokens`, so a grant written onto a DM-layer token contributes nothing: the
   * token was filtered out before anybody asked who held its lead.
   *
   * A creature on the DM layer produces **no row at all** rather than a band, because
   * `visibleCharacterIds` is what decides whether the caller is told about it — otherwise
   * the length of this array would publish how many monsters the DM has prepared. So the
   * assertion is absence, and the grant does not turn it into presence.
   */
  test('a grant on a DM-layer token produces no row, let alone an exact one', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode, sceneId, seat: ana } = fixture

    const hidden = await makeNpc(t, code, dmCode, 'Something Waiting', npcSheet())
    const hiddenToken = await addToken(t, code, dmCode, sceneId, {
      name: 'Not On Their Board',
      layer: 'gm',
      characterId: hidden,
    })
    await setControllers(t, fixture, hiddenToken, [ana])

    const rows = await t.query(api.characters.vitals, { code, playerId: ana })
    expect(rowFor(rows, hidden)).toBeUndefined()
    expect(JSON.stringify(rows) ?? '').not.toContain(hidden)

    // The control, and it is the whole point of this test: the DM does get a row, so the
    // creature exists and has hit points — the player is being told nothing rather than
    // being told about an empty game.
    expect(rowFor(await t.query(api.characters.vitals, { code, dmCode }), hidden)?.kind).toBe(
      'exact',
    )
  })

  /**
   * THE WHOLE DEFENCE OF PUBLISHING ARMOUR CLASS, ASSERTED RATHER THAN ARGUED.
   *
   * A creature's armour class now reaches every player who can see its coin — a secret
   * lifted deliberately, on the record, in ADR 0014. What makes that defensible is entirely
   * the *scope*: it is published to people who were already being told the creature exists,
   * and to nobody else. So the claim to hold onto is not "the number is safe", it is
   * **"the set of creatures a player hears about did not change"** — and if that ever stops
   * being true, this badge starts announcing the armour class of the ambush.
   *
   * The mechanism is that `visibleVitals` `continue`s past a creature the caller may not
   * see **before** it assembles either variant, so there is no row to hang a number on. This
   * asserts the consequence directly rather than trusting the ordering: the number is in the
   * DM's payload and absent from the player's, as a raw substring scan over the serialised
   * response so that a future field carrying it by another name fails too.
   *
   * ⚠️ **The armour class here is deliberately not `NPC_ARMOUR_CLASS`.** The fixture's
   * visible monster uses that value and is legitimately in the player's payload, so scanning
   * for 22 would find it and this test would pass on the wrong row. A distinct number is
   * what makes the scan mean *this* creature.
   */
  test('a DM-layer creature publishes no armour class to a player, and does to the DM', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode, sceneId, seat: ana } = fixture

    // Both distinct from every other number in the fixture, so a hit in the scan below can
    // only have come from this creature.
    const SECRET_ARMOUR_CLASS = 19
    const SECRET_PASSIVE_PERCEPTION = 21
    const ambush = await makeNpc(
      t,
      code,
      dmCode,
      'The Thing In The Rafters',
      npcSheet({
        armourClass: SECRET_ARMOUR_CLASS,
        passivePerception: SECRET_PASSIVE_PERCEPTION,
      }),
    )
    await addToken(t, code, dmCode, sceneId, {
      name: 'Rafters',
      layer: 'gm',
      characterId: ambush,
    })

    // `containsNumber` rather than `toContain`, and the word boundaries are load-bearing:
    // a bare substring search for 19 finds it inside 190, inside a timestamp and inside a
    // character id, so the negative half would pass or fail for reasons unrelated to the
    // payload. This is the helper every other scan in this file uses.
    const asPlayer = JSON.stringify(await t.query(api.characters.vitals, { code, playerId: ana }))
    expect(containsNumber(asPlayer, SECRET_ARMOUR_CLASS)).toBe(false)
    expect(containsNumber(asPlayer, SECRET_PASSIVE_PERCEPTION)).toBe(false)
    expect(asPlayer).not.toContain(ambush)

    // The positive control, without which the scan above passes on an empty payload — the
    // discipline every payload scan in this repo keeps. The DM is told all three.
    const asDm = JSON.stringify(await t.query(api.characters.vitals, { code, dmCode }))
    expect(containsNumber(asDm, SECRET_ARMOUR_CLASS)).toBe(true)
    expect(containsNumber(asDm, SECRET_PASSIVE_PERCEPTION)).toBe(true)
    expect(asDm).toContain(ambush)

    // And the second control: the *visible* monster's armour class is in the player's
    // payload, so the assertion above is about this creature being hidden rather than about
    // the field having failed to ship.
    expect(rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), fixture.npc)).toMatchObject(
      { kind: 'band', armourClass: NPC_ARMOUR_CLASS },
    )
  })

  /**
   * The half of a grant that makes it worth having: the player holding the lead can spend
   * the creature's hit points.
   *
   * `adjustHp` takes `allowControl: true` for exactly this — a grant that could not spend
   * a hit point would be a sheet to look at — while `updateSheet` takes `false`, because
   * lending somebody a wolf is not handing them the wolf's stat block to rewrite. Both
   * directions are asserted, because the pair *is* the decision.
   */
  test('the granted seat may take damage on the creature but may not rewrite it', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, seat: ana, npc, npcToken } = fixture

    await setControllers(t, fixture, npcToken, [ana])

    const { currentHp } = await t.mutation(api.characters.adjustHp, {
      code,
      characterId: npc,
      delta: -7,
      playerId: ana,
    })
    expect(currentHp).toBe(NPC_CURRENT_HP - 7)
    expect(
      rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc),
    ).toMatchObject({ kind: 'exact', current: NPC_CURRENT_HP - 7 })

    // Authorship is not granted. The refusal is `CharacterNotFound` rather than
    // `CharacterNotYours`, because `updateSheet` passes no controlled set at all and the
    // creature is therefore invisible to it — which is the same answer a fabricated id
    // gets, and the right one.
    await expectKind(
      t.mutation(api.characters.updateSheet, {
        code,
        characterId: npc,
        sheet: npcSheet({ maxHp: 4, notes: '', actions: [] }),
        playerId: ana,
      }),
      'CharacterNotFound',
    )
    expect(
      rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc),
    ).toMatchObject({ max: NPC_MAX_HP })
  })

  /** Revoking is the same door shutting: the exact numbers go back to being a band. */
  test('revoking the grant puts the creature back on a band', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, seat: ana, npc, npcToken } = fixture

    await setControllers(t, fixture, npcToken, [ana])
    expect(rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc)?.kind).toBe(
      'exact',
    )

    await setControllers(t, fixture, npcToken, [])

    const rows = await t.query(api.characters.vitals, { code, playerId: ana })
    expect(rowFor(rows, npc)?.kind).toBe('band')
    const serialised = JSON.stringify(rows) ?? ''
    expect(containsNumber(serialised, NPC_MAX_HP)).toBe(false)
    expect(containsNumber(serialised, NPC_CURRENT_HP)).toBe(false)

    // And the write path closed with it, rather than lagging a subscription behind.
    await expectKind(
      t.mutation(api.characters.adjustHp, { code, characterId: npc, delta: -1, playerId: ana }),
      'CharacterNotFound',
    )
  })

  /**
   * ⚠️ **A hero's hit points are exact for everybody and were never gated**, so the grant
   * must not have quietly turned `characters.vitals` into a per-seat query in the wrong
   * direction — one where a seat that was granted nothing now sees *less* than it did.
   *
   * requirements.md asks for `20/45` above a hero's token for the whole table, and the
   * cheapest way to break that while every other test in this file passes is to make the
   * `exact` branch depend on the seat argument rather than adding to it.
   */
  test('a hero stays exact for every seat id and for none, grant or no grant', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode, seat: ana, pc, npcToken } = fixture
    const ben = await makeSeat(t, code, 'Ben')
    await setControllers(t, fixture, npcToken, [ana])

    for (const who of [{}, { playerId: ana }, { playerId: ben }, { dmCode }]) {
      expect(
        rowFor(await t.query(api.characters.vitals, { code, ...who }), pc),
        JSON.stringify(who),
      ).toMatchObject({ kind: 'exact', current: PC_CURRENT_HP, max: PC_MAX_HP })
    }
  })
})

// ---------------------------------------------------------------------------
// (k) Milestone 10: a creature standing in the dark has no health bar at all
// ---------------------------------------------------------------------------
//
// ⚠️ **THE THIRD CONSEQUENCE OF ONE `continue`, AND THE ONE THIS SUITE OWNS.** Fog is
// decided in `foggedTokenIds` and applied in exactly two places: `visiblePositions`, and the
// loop in `boardCharacterAccess`. That second one is a single `continue` above both `visible`
// and `controlled`, so a fogged creature loses its **placement**, its **health band** and its
// **feed lines** together, by the subset property that was already there. The placement is
// `fog.test.ts`'s and the lines are `feed.test.ts`'s; the band is here.
//
// Note what the withholding looks like, because it is not a narrower band: the creature has
// **no row at all**. That is `visible`'s existing count-leak refusal doing the work — a
// player reading twelve entries knows the DM has twelve monsters prepared, so a hidden
// creature must contribute nothing, not a row, not a band, not a number in a length. Fog
// reaches that rule through the same door the GM layer does, which is why it needed no new
// machinery here.

describe('fog takes a creature’s health bar with it', () => {
  /** Where a coin is actually standing — snapping and displacement both move it. */
  async function placementOf(t: Harness, sceneId: Id<'scenes'>, tokenId: Id<'tokens'>) {
    const row = await t.run(
      async (ctx) =>
        await ctx.db
          .query('tokenPositions')
          .withIndex('by_sceneId_and_tokenId', (q) =>
            q.eq('sceneId', sceneId).eq('tokenId', tokenId),
          )
          .unique(),
    )
    if (!row) throw new Error('that token has no placement on that scene')
    return { x: row.x, y: row.y }
  }

  /** A rectangle centred on one coin and reaching no other. */
  async function fogOver(
    t: Harness,
    fixture: { code: string; dmCode: string; sceneId: Id<'scenes'> },
    tokenId: Id<'tokens'>,
  ) {
    const at = await placementOf(t, fixture.sceneId, tokenId)
    const { fogId } = await t.mutation(api.fog.draw, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      sceneId: fixture.sceneId,
      x: at.x - 40,
      y: at.y - 40,
      width: 80,
      height: 80,
    })
    return fogId
  }

  /**
   * Both directions, because a one-way assertion passes on a fixture that never had a row.
   * The hero is asserted in the same breath as the control: the same query, the same
   * rectangle's scene, and numbers that did not move.
   */
  test('the band goes when the corridor goes dark and comes back when it is erased', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, npc, npcToken, pc } = fixture

    const before = await t.query(api.characters.vitals, { code })
    expect(rowFor(before, npc)?.kind).toBe('band')

    const fogId = await fogOver(t, fixture, npcToken)

    const fogged = await t.query(api.characters.vitals, { code })
    // No row at all rather than a narrower band — see the note above this describe.
    expect(rowFor(fogged, npc)).toBeUndefined()
    const serialised = JSON.stringify(fogged) ?? ''
    expect(serialised, 'the fogged creature’s id travelled anyway').not.toContain(npc)
    expect(containsNumber(serialised, NPC_MAX_HP)).toBe(false)
    expect(containsNumber(serialised, NPC_CURRENT_HP)).toBe(false)

    // The hero standing in the lit half of the map is untouched, which is what makes the
    // absence above about the rectangle rather than about the query having emptied.
    expect(rowFor(fogged, pc)).toMatchObject({ kind: 'exact', current: PC_CURRENT_HP })

    await t.mutation(api.fog.erase, { code, dmCode: fixture.dmCode, fogId })
    expect(await t.query(api.characters.vitals, { code })).toEqual(before)
  })

  /**
   * ⚠️ **A COIN SOMEBODY CONTROLS IS NEVER FOGGED, AND THAT REACHES THE NUMBERS TOO.**
   *
   * `foggedTokenIds` excludes any token with an effective controller, so the DM cannot
   * accidentally black out the party's own wolf — and since a granted seat is sent `exact`
   * rather than a band, getting this wrong would take the `−`/`+` controls off a creature
   * the player is supposed to be spending hit points on, with no way to select it back.
   *
   * The revoke at the end is the live disjunct: the identical rectangle over the identical
   * coin, with the grant gone, does hide it. Without that half this test would pass on a
   * rectangle that had missed.
   */
  test('a granted creature keeps its exact numbers through the fog until the grant goes', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, seat: ana, npc, npcToken } = fixture

    await setControllers(t, fixture, npcToken, [ana])
    await fogOver(t, fixture, npcToken)

    expect(rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc)).toMatchObject(
      { kind: 'exact', current: NPC_CURRENT_HP, max: NPC_MAX_HP },
    )
    // And for a seat that was granted nothing it is still on the board, still a band — the
    // exclusion is about the *token* having a controller, not about who is asking.
    expect(rowFor(await t.query(api.characters.vitals, { code }), npc)?.kind).toBe('band')

    await setControllers(t, fixture, npcToken, [])
    expect(rowFor(await t.query(api.characters.vitals, { code, playerId: ana }), npc)).toBeUndefined()
  })

  /** The DM reads no rectangles at all, so their own health bars are never affected. */
  test('the DM keeps every row through a rectangle over the whole map', async () => {
    const t = harness()
    const fixture = await vitalsFixture(t)
    const { code, dmCode, sceneId, npc } = fixture
    const before = await t.query(api.characters.vitals, { code, dmCode })

    await t.mutation(api.fog.draw, {
      code,
      dmCode,
      sceneId,
      x: -MAP_WIDTH,
      y: -MAP_HEIGHT,
      width: MAP_WIDTH * 3,
      height: MAP_HEIGHT * 3,
    })

    expect(await t.query(api.characters.vitals, { code, dmCode })).toEqual(before)
    expect(rowFor(await t.query(api.characters.vitals, { code, dmCode }), npc)?.kind).toBe('exact')
    // A wrong DM code is an ordinary player rather than a partial DM.
    expect(
      rowFor(await t.query(api.characters.vitals, { code, dmCode: twiddle(dmCode) }), npc),
    ).toBeUndefined()
  })
})
