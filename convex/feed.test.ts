/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { NO_MODIFIERS, rollRange } from './lib/dice'
import { publicFeedValidator } from './lib/feed'
import type { PublicFeedRow } from './lib/feed'
import { MAX_FEED_ROWS_LISTED } from './lib/games'
import { MAX_ROLL_LENGTH } from './lib/sheet'
import type { NpcSheet, PcSheet, SheetEntry } from './lib/sheet'
import schema from './schema'

/**
 * MILESTONE 9'S ACCEPTANCE TEST, MECHANISED.
 *
 * > A line in the feed never names a creature the caller may not be told about.
 *
 * A feed row is a leaked **row** and not a leaked field, which is the distinction
 * CLAUDE.md invariant 8 exists to keep. `Skarnvex the Undrawn attacks with their
 * Skarnfang Rend` has exactly the shape of `Thorin Ironfist attacks with their Rapier` —
 * a name, a subject, a total — so `publicFeedValidator` would approve an array made
 * entirely of spoilers without comment, and no `returns:` validator can ever be the guard
 * here. What is the guard is the arrangement `lib/feed.ts` describes: **one reader, handed
 * a `Set` of ids that one predicate has already filtered.** So this suite scans the
 * *serialised* payload of every query a player's client can issue, in every credential
 * shape, rather than checking the fields a component happens to read.
 *
 * Three predicates decide, and they are deliberately three rather than one, so all three
 * are exercised separately below:
 *
 * - `mayHearOf` — whose name may appear in a line saying they rolled something. Sections
 *   (a), (d) and (e).
 * - `isWithheldAsReserved` — a hero the DM has set aside for somebody who has not arrived.
 *   Section (f).
 * - `dmOnly` on the row itself, which is a fact about the *line* and not about the
 *   character on it. Section (g).
 *
 * ⚠️ **Section (d) is the one that stops this whole file passing for the wrong reason.**
 * Every scan in (a) would be satisfied by a feed that was simply DM-only, and a feed that
 * showed players nothing would be a feature discovered broken at the table rather than in
 * CI. So the live-disjunct half is written beside the withholding half everywhere it
 * exists: the token moves to the player layer and the line appears; the reservation is
 * lifted and the line appears; the private flag comes off and the line appears.
 *
 * The fixtures duplicate `vitals.test.ts`'s rather than sharing them, deliberately and for
 * the reason recorded there: every safe home for a shared helper is either deployed as a
 * Convex module or swept by the leak guard, so duplication is the cheaper of the two costs.
 */
const modules = import.meta.glob('./**/*.ts')

function harness() {
  return convexTest(schema, modules)
}

type Harness = ReturnType<typeof harness>

/** `Admittance [Gridded 16x12]` at its stored size, as the other two suites use. */
const MAP_WIDTH = 2240
const MAP_HEIGHT = 1680

const TINT = '#c0392b'

// ---------------------------------------------------------------------------
// DELIBERATELY DISTINCTIVE NUMBERS
//
// The discipline is `vitals.test.ts`'s, restated because this suite scans a *different*
// set of payloads and so needs its own needles. A creature on `12/20` swinging `1d8+3`
// would make every assertion below lie in both directions: `20`, `8` and `3` occur in an
// ability score, a die face, a grid offset, a token size and the middle of a timestamp, so
// a scan for any of them either fires on nothing or fires on everything. Three digits that
// appear nowhere else in the fixture mean a hit is a leak and a miss is silence.
//
// Every one of the four below is also chosen so that the *band a roll can land in* is
// clear of every other number in the fixture — see `feedTotals` at the foot of section (a),
// which scans the totals actually rolled. The map is 2240×1680, the coins stand at 300,
// 500 and 700, the hero is 45 hit points on 3d10, and the bands below are 230–249,
// 356–371, 463–469 and 587. Nothing overlaps, which is what makes a hit in that scan a
// leak rather than a coincidence.
// ---------------------------------------------------------------------------

/** The to-hit modifier. `1d20+229` lands in 230–249, a band nothing else occupies. */
const CREATURE_TO_HIT = '1d20+229'
const CREATURE_TO_HIT_MODIFIER = 229

/** The damage modifier. `2d4+461` lands in 463–469 — the tightest band of the three. */
const CREATURE_DAMAGE = '2d4+461'
const CREATURE_DAMAGE_MODIFIER = 461

/** A second attack nobody rolls in section (a): the *stored* string is a spoiler too. */
const CREATURE_ACTION_ROLL = '3d6+353'
const CREATURE_ACTION_MODIFIER = 353

/** The creature's maximum, which only `characters.vitals` and `characters.sheet` carry. */
const CREATURE_MAX_HP = 587
const CREATURE_CURRENT_HP = 419

/**
 * Six separate spoilers, so a partial leak cannot pass as a clean one. The character's
 * name, its DM-only notes, the names of its three entries and the description on one of
 * them are each independently enough to tell the party what they are about to walk into —
 * and a feed row is built out of exactly those fields, which is what makes them the right
 * needles for this suite rather than for `vitals.test.ts`'s.
 */
const CREATURE_NAME = 'Skarnvex the Undrawn'
const CREATURE_NOTES = 'Waits in the flooded stair until the Skarnglass is lifted from its plinth.'
const CREATURE_WEAPON_NAME = 'Skarnfang Rend'
const CREATURE_WEAPON_TEXT = 'Two hooked jaws, out of the water and back under it.'
const CREATURE_ACTION_NAME = 'Drowning Skarnwail'
const CREATURE_PASSIVE_NAME = 'Skarnshroud'
const CREATURE_PASSIVE_TEXT = 'Nothing sees it in still water until it has already moved.'

/**
 * The coin standing on that creature carries a name of its own, and it is a different one
 * on purpose. In section (a) the coin is on the **DM** layer, so the token name is a
 * secret too; in section (d) the same coin moves to the player layer and the name becomes
 * something a player is *supposed* to see. Reusing the character's name for it would make
 * both halves unable to tell a leak from the thing they are meant to allow.
 */
const CREATURE_TOKEN_NAME = 'Shape Beneath the Stair'

/** The hero the party is playing, and the one roll a player's own feed must carry. */
const HERO_NAME = 'Thorin Ironfist'
const HERO_MAX_HP = 45
/** DEX 12 → a modifier of +1, so a hero's initiative is `1d20+1`. Section (i). */
const HERO_INITIATIVE_ROLL = '1d20+1'

/** The creature's stored bonus, capped at ±20 by `MAX_INITIATIVE_BONUS`. Section (i). */
const CREATURE_INITIATIVE_BONUS = 17
const CREATURE_INITIATIVE_ROLL = '1d20+17'

/** A hero the DM has built for somebody who has not arrived. Section (f). */
const RESERVED_NAME = 'Seraphine the Unarrived'

/** The pet the DM lends the party. Section (e). */
const PET_NAME = 'Wolf of the Second Cart'
const PET_ENTRY_NAME = 'Cart-Wolf Bite'

/** The DM's private ad-hoc roll. Section (g). `1d100+787` lands in 788–887. */
const DM_PRIVATE_ROLL = '1d100+787'
const DM_PRIVATE_MODIFIER = 787

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
 * A payload, or a marker for the refusal that came instead.
 *
 * No query in the sweep below refuses a player today — `feed.list` takes an optional
 * `dmCode` and paints an empty screen for an unknown code. It is wrapped anyway, because
 * **the error channel is a read channel too**: a refusal that named the creature would be
 * as much of a leak as a payload carrying it, which is the reasoning `CHARACTER_NOT_FOUND`
 * is one shared constant for, and because a required argument added to any of these in a
 * later milestone must not silently drop that query out of the loop.
 *
 * A `ConvexError`'s `data` is swept; anything else is reduced to a marker rather than
 * having its message swept, exactly as `vitals.test.ts` does and for the same reason —
 * Convex's own argument-validation message quotes the arguments it was sent, so scanning
 * it would find the test's own request and report it as a leak.
 */
async function attempt(call: Promise<unknown>): Promise<unknown> {
  return await call.then(
    (value) => value,
    (error: unknown) =>
      error instanceof ConvexError ? { refused: error.data } : { refused: 'argument validation' },
  )
}

function twiddle(code: string): string {
  const swapped = code[0] === 'A' ? 'B' : 'A'
  return swapped + code.slice(1)
}

/**
 * `461` as a number in the payload, rather than `461` sitting in the middle of a document
 * id or a millisecond timestamp.
 *
 * Copied from `vitals.test.ts` rather than shared, like the fixtures. A plain
 * `toContain('461')` would be flaky in the worst possible direction: it fires on a
 * `_creationTime` of `1782713461000` and so passes or fails on the clock. Requiring a
 * non-word, non-decimal character on both sides matches `"modifier":461` and `[461,`
 * while never matching inside `a461b` or `1782713461000`.
 */
function containsNumber(serialised: string, value: number): boolean {
  return new RegExp(`(?<![\\w.])${value}(?![\\w.])`).test(serialised)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function pcSheet(overrides: Partial<PcSheet> = {}): PcSheet {
  return {
    kind: 'pc',
    level: 3,
    className: 'Fighter',
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
    saveProficiencies: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
    armourClass: 17,
    maxHp: HERO_MAX_HP,
    hitDice: { count: 3, faces: 10 },
    feats: [],
    spells: [],
    ...overrides,
  }
}

/**
 * One of each category on one sheet, which is what section (i) is written against.
 *
 * `entriesProblem` enforces the arity rule — a weapon carries a to-hit *and* a roll, an
 * action carries a roll and no to-hit, a passive carries neither — so these three literals
 * are the only three coherent shapes a `SheetEntry` has, and having all of them on one
 * creature means the passive/action control in section (i) is a comparison between two
 * rows of the same sheet rather than between two fixtures.
 */
function creatureEntries(): SheetEntry[] {
  return [
    {
      id: 'rend',
      name: CREATURE_WEAPON_NAME,
      text: CREATURE_WEAPON_TEXT,
      roll: CREATURE_DAMAGE,
      level: null,
      catalogueKey: null,
      category: 'weapon',
      toHit: CREATURE_TO_HIT,
    },
    {
      id: 'wail',
      name: CREATURE_ACTION_NAME,
      text: 'A note under the water that empties a lung from thirty feet.',
      roll: CREATURE_ACTION_ROLL,
      level: null,
      catalogueKey: null,
      category: 'action',
    },
    {
      id: 'shroud',
      name: CREATURE_PASSIVE_NAME,
      text: CREATURE_PASSIVE_TEXT,
      roll: null,
      level: null,
      catalogueKey: null,
      category: 'passive',
    },
  ]
}

function npcSheet(overrides: Partial<NpcSheet> = {}): NpcSheet {
  return {
    kind: 'npc',
    armourClass: 22,
    maxHp: CREATURE_MAX_HP,
    initiativeBonus: CREATURE_INITIATIVE_BONUS,
    actions: creatureEntries(),
    notes: CREATURE_NOTES,
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

/**
 * One hero the party is playing, and one creature waiting on the DM layer.
 *
 * ⚠️ **The creature's coin is on the DM layer, which is the opposite of `vitals.test.ts`'s
 * fixture, and the difference is the point rather than an inconsistency.** That suite is
 * about a creature the party can *see* whose hit points are still secret, so hiding it
 * would have made every assertion pass for the wrong reason. This suite is about whether a
 * *line* names a creature, and `mayHearOf` admits any creature whose coin is on the board —
 * deliberately, because `board.tokens` has already published that name. So the case worth
 * scanning here is the one where the coin is *not* on the board: the DM's prepared
 * encounter, rolling its attacks in a fight the party has not reached yet.
 *
 * The other direction — a creature on the player layer whose lines a player genuinely does
 * receive — is section (d), and it is not optional: without it every scan below would pass
 * against a feed that was simply DM-only.
 */
async function feedFixture(t: Harness) {
  const game = await makeGame(t)
  const sceneId = await makeScene(t, game.code, game.dmCode)
  const ana = await makeSeat(t, game.code, 'Ana')

  const { characterId: hero } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name: HERO_NAME,
    sheet: pcSheet(),
  })
  await t.mutation(api.characters.claim, { code: game.code, playerId: ana, characterId: hero })
  const heroToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: HERO_NAME,
    layer: 'player',
    characterId: hero,
    x: 300,
    y: 300,
  })

  const { characterId: creature } = await t.mutation(api.characters.create, {
    code: game.code,
    dmCode: game.dmCode,
    name: CREATURE_NAME,
    sheet: npcSheet(),
  })
  await t.mutation(api.characters.setHp, {
    code: game.code,
    dmCode: game.dmCode,
    characterId: creature,
    currentHp: CREATURE_CURRENT_HP,
  })
  const creatureToken = await addToken(t, game.code, game.dmCode, sceneId, {
    name: CREATURE_TOKEN_NAME,
    layer: 'gm',
    characterId: creature,
    x: 700,
    y: 500,
  })

  return { ...game, sceneId, ana, hero, heroToken, creature, creatureToken }
}

type Fixture = Awaited<ReturnType<typeof feedFixture>>

/** The DM's own seat, which `feed.rollDice` needs because an ad-hoc roll names a person. */
async function dmSeat(t: Harness, code: string): Promise<Id<'players'>> {
  const roster = await t.query(api.players.list, { code })
  const seat = roster.find((row) => row.isDm)
  if (!seat) throw new Error('the game has no DM seat')
  return seat._id
}

/** The feed as the DM receives it. */
async function dmFeed(t: Harness, fixture: Fixture): Promise<PublicFeedRow[]> {
  return await t.query(api.feed.list, { code: fixture.code, dmCode: fixture.dmCode })
}

/**
 * The rows with the reveal flag taken off, for the one comparison that spans a widening.
 *
 * `predatesReveal` is the single member of a row that a mutation touching nothing on the
 * `feed` table can change, so a before-and-after diff across a reveal has to either assert
 * it or exclude it. Section (l) asserts it, with a fixture that owns the clock; everywhere
 * else excludes it through this, so a whole-row `toEqual` still means what it used to.
 */
function withoutRevealFlag(rows: PublicFeedRow[]): Omit<PublicFeedRow, 'predatesReveal'>[] {
  return rows.map(({ predatesReveal: _flag, ...rest }) => rest)
}

/** The newest line, which is the last one because `visibleFeed` returns oldest-first. */
function newest(rows: PublicFeedRow[]): PublicFeedRow {
  const row = rows[rows.length - 1]
  if (!row) throw new Error('the feed is empty, so there is no newest line')
  return row
}

/** The DM rolls the creature's to-hit and then its damage — the two rows section (a) hunts. */
async function rollCreatureAttack(t: Harness, fixture: Fixture) {
  for (const part of ['toHit', 'roll'] as const) {
    await t.mutation(api.feed.roll, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId: fixture.creature,
      request: { kind: 'entry', entryId: 'rend', part },
      mode: 'flat',
      dmOnly: false,
    })
  }
}

/** Ana rolls initiative on her own hero, so a player's feed is never empty. */
async function rollHeroInitiative(t: Harness, fixture: Fixture) {
  await t.mutation(api.feed.roll, {
    code: fixture.code,
    playerId: fixture.ana,
    characterId: fixture.hero,
    request: { kind: 'initiative' },
    mode: 'flat',
    dmOnly: false,
  })
}

/**
 * Every payload a player's client can fetch, keyed by name so a failure says which query
 * leaked rather than which array index did.
 *
 * ⚠️ **`feed.list` appears six times, and the six are the point of this helper.** The
 * query takes two optional arguments and a player's client can send any combination of
 * them: a `dmCode` is *optional*, not absent, so a gate that keyed off the argument being
 * present rather than being correct would pass every other test in this file, and a
 * `playerId` changes the answer by design (a granted seat hears more), so the no-seat
 * payload alone is not the whole of what a player can fetch.
 *
 * The other six queries are `vitals.test.ts`'s sweep, kept rather than trimmed. A feed row
 * carries `characterId` and `actorName`, so this milestone gives the *existing* secrets two
 * new ways to travel — a creature's name in an `actorName`, its id in a pointer — and those
 * would show up in this loop rather than in a new one.
 */
async function playerPayloads(t: Harness, fixture: Fixture): Promise<Record<string, unknown>> {
  const { code, sceneId, ana, creature } = fixture
  const wrong = twiddle(fixture.dmCode)

  return {
    'feed.list (no dm code)': await attempt(t.query(api.feed.list, { code })),
    'feed.list (empty dm code)': await attempt(t.query(api.feed.list, { code, dmCode: '' })),
    'feed.list (wrong dm code)': await attempt(t.query(api.feed.list, { code, dmCode: wrong })),
    'characters.vitals': await attempt(t.query(api.characters.vitals, { code })),
    'characters.vitals (the seat’s own id)': await attempt(
      t.query(api.characters.vitals, { code, playerId: ana }),
    ),
    'characters.list': await attempt(t.query(api.characters.list, { code })),
    'characters.list (wrong dm code)': await attempt(
      t.query(api.characters.list, { code, dmCode: wrong }),
    ),
    'characters.sheet (the creature)': await attempt(
      t.query(api.characters.sheet, { code, characterId: creature }),
    ),
    'characters.sheet (the creature, the seat’s own id)': await attempt(
      t.query(api.characters.sheet, { code, characterId: creature, playerId: ana }),
    ),
    'characters.sheet (the creature, wrong dm code)': await attempt(
      t.query(api.characters.sheet, { code, characterId: creature, dmCode: wrong }),
    ),
    'board.tokens': await attempt(t.query(api.board.tokens, { code })),
    'board.tokens (wrong dm code)': await attempt(
      t.query(api.board.tokens, { code, dmCode: wrong }),
    ),
    'board.positions': await attempt(t.query(api.board.positions, { code, sceneId })),
    'scenes.active': await attempt(t.query(api.scenes.active, { code })),
    'players.list': await attempt(t.query(api.players.list, { code })),
    /**
     * The one query in the sweep that is not scoped to this game, and the only one a
     * browser may call having typed nothing at all (ADR 0010). It reads *every* game in
     * the deployment, so the scan also proves the cross-game read carries nothing: the
     * creature's name and its rolls are in a game whose join code this caller is not even
     * supplying, and a projection that leaked a field would leak it from all thirty rows.
     */
    'games.list': await attempt(t.query(api.games.list, {})),
  }
}

/** Every string a line about the creature would have to carry. */
const CREATURE_STRINGS: [string, string][] = [
  ['the creature’s name', CREATURE_NAME],
  ['the creature’s notes', CREATURE_NOTES],
  ['the coin’s DM-layer name', CREATURE_TOKEN_NAME],
  ['the weapon’s name', CREATURE_WEAPON_NAME],
  ['the weapon’s description', CREATURE_WEAPON_TEXT],
  ['the action’s name', CREATURE_ACTION_NAME],
  ['the passive’s name', CREATURE_PASSIVE_NAME],
  ['the passive’s description', CREATURE_PASSIVE_TEXT],
  ['the to-hit expression', CREATURE_TO_HIT],
  ['the damage expression', CREATURE_DAMAGE],
  ['the second attack’s expression', CREATURE_ACTION_ROLL],
]

/** Every number a line about the creature, or its sheet, would have to carry. */
const CREATURE_NUMBERS: [string, number][] = [
  ['the to-hit modifier', CREATURE_TO_HIT_MODIFIER],
  ['the damage modifier', CREATURE_DAMAGE_MODIFIER],
  ['the second attack’s modifier', CREATURE_ACTION_MODIFIER],
  ['the creature’s maximum', CREATURE_MAX_HP],
  ['the creature’s current hit points', CREATURE_CURRENT_HP],
]

/**
 * The totals actually rolled, read back off the DM's own feed.
 *
 * ⚠️ **A total cannot be a *chosen* constant, and pretending otherwise is the one thing
 * this helper exists to avoid.** The dice are thrown by `cryptoDice` inside the mutation,
 * and there is no way to inject a source through a mutation — that is the whole of the
 * security boundary lib/dice.ts describes, and the reason the exact-pair assertions live in
 * `dice.test.ts` against `sequenceSource` instead. So the needle is discovered rather than
 * declared: the modifier is chosen so that the *band* the total must land in (230–249 for
 * the to-hit, 463–469 for the damage) is clear of every other number in the fixture, and
 * the exact value is then read off the row that was written. A scan for it is therefore
 * exactly as sharp as a scan for a constant, and it is honest about which is which.
 */
async function rolledTotals(t: Harness, fixture: Fixture): Promise<number[]> {
  const rows = await dmFeed(t, fixture)
  const totals = rows
    .filter((row) => row.characterId === fixture.creature && row.roll !== null)
    .map((row) => row.roll!.total)

  expect(totals, 'the creature rolled nothing, so there is no total to scan for').toHaveLength(2)
  // The bands, asserted rather than assumed — a total outside them would mean this scan
  // had quietly started hunting for a number the fixture uses somewhere else.
  expect(totals[0]).toBeGreaterThanOrEqual(230)
  expect(totals[0]).toBeLessThanOrEqual(249)
  expect(totals[1]).toBeGreaterThanOrEqual(463)
  expect(totals[1]).toBeLessThanOrEqual(469)
  return totals
}

// ---------------------------------------------------------------------------
// (a) The payload scan
// ---------------------------------------------------------------------------

describe('a player inspecting network traffic hears nothing about the DM’s creature', () => {
  test('no payload fetched without the DM code names the creature, its entries or its rolls', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    await rollCreatureAttack(t, fixture)
    await rollHeroInitiative(t, fixture)

    const totals = await rolledTotals(t, fixture)
    const payloads = await playerPayloads(t, fixture)

    for (const [name, payload] of Object.entries(payloads)) {
      const serialised = JSON.stringify(payload) ?? ''

      for (const [what, needle] of CREATURE_STRINGS) {
        expect(serialised, `${name} leaked ${what}`).not.toContain(needle)
      }
      for (const [what, needle] of CREATURE_NUMBERS) {
        expect(containsNumber(serialised, needle), `${name} leaked ${what}`).toBe(false)
      }
      for (const total of totals) {
        expect(containsNumber(serialised, total), `${name} leaked a rolled total`).toBe(false)
      }
      // Neither by id. A row keyed on a character a player must not know exists is a leak
      // whether or not the name travels beside it — and `characterId` *does* travel on a
      // feed row, which is why this needle belongs to this suite rather than to another.
      expect(serialised, `${name} leaked the creature’s id`).not.toContain(fixture.creature)
      expect(serialised, `${name} leaked the DM-layer coin’s id`).not.toContain(
        fixture.creatureToken,
      )
      // The discriminator, the way board.test.ts sweeps for `"dm"`. `characters.list`
      // filters a creature's row out and `characters.sheet` refuses one, so no player
      // payload has a reason to carry the word at all.
      expect(serialised, `${name} leaked the npc discriminator`).not.toContain('"npc"')
    }
  })

  /**
   * THE OTHER HALF, and it has to mean two separate things.
   *
   * The player really is being served: their own hero's roll is in their `feed.list`, so
   * the loop above is not passing on an empty array. And the secrets really are in the
   * database: the identical fetches *with* the DM code hand back every string and every
   * number that loop hunted for. Without both halves this suite passes on a game in which
   * nobody has rolled anything.
   */
  test('positive control: the player hears their own hero, and the DM hears everything', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    await rollCreatureAttack(t, fixture)
    await rollHeroInitiative(t, fixture)
    const totals = await rolledTotals(t, fixture)

    // Half one — the player is genuinely subscribed to a feed with something in it.
    const own = await t.query(api.feed.list, { code: fixture.code })
    expect(own.map((row) => row.actorName)).toEqual([HERO_NAME])
    expect(own[0].characterId).toBe(fixture.hero)
    expect(own[0].subject).toEqual({ kind: 'initiative' })
    expect(own[0].roll?.expression).toBe(HERO_INITIATIVE_ROLL)

    // Half two — the same fetch with the DM code carries every needle the loop hunted for.
    const dmRows = await dmFeed(t, fixture)
    const dmFeedText = JSON.stringify(dmRows) ?? ''
    expect(dmRows.map((row) => row.actorName).sort()).toEqual(
      [CREATURE_NAME, CREATURE_NAME, HERO_NAME].sort(),
    )
    expect(dmFeedText).toContain(CREATURE_NAME)
    expect(dmFeedText).toContain(CREATURE_WEAPON_NAME)
    expect(dmFeedText).toContain(CREATURE_TO_HIT)
    expect(dmFeedText).toContain(CREATURE_DAMAGE)
    expect(dmFeedText).toContain(fixture.creature)
    expect(containsNumber(dmFeedText, CREATURE_TO_HIT_MODIFIER)).toBe(true)
    expect(containsNumber(dmFeedText, CREATURE_DAMAGE_MODIFIER)).toBe(true)
    for (const total of totals) {
      expect(containsNumber(dmFeedText, total), 'the DM cannot read the total they rolled').toBe(
        true,
      )
    }

    // The needles the feed does not carry are reachable with the DM code too, from the two
    // queries that do carry them — otherwise four entries of `CREATURE_STRINGS` and two of
    // `CREATURE_NUMBERS` would be decoration rather than needles.
    const dmSheet =
      JSON.stringify(
        await t.query(api.characters.sheet, {
          code: fixture.code,
          dmCode: fixture.dmCode,
          characterId: fixture.creature,
        }),
      ) ?? ''
    expect(dmSheet).toContain(CREATURE_NOTES)
    expect(dmSheet).toContain(CREATURE_ACTION_NAME)
    expect(dmSheet).toContain(CREATURE_PASSIVE_NAME)
    expect(dmSheet).toContain(CREATURE_PASSIVE_TEXT)
    expect(dmSheet).toContain(CREATURE_ACTION_ROLL)
    expect(dmSheet).toContain('"npc"')
    expect(containsNumber(dmSheet, CREATURE_MAX_HP)).toBe(true)
    expect(containsNumber(dmSheet, CREATURE_ACTION_MODIFIER)).toBe(true)

    const dmVitals =
      JSON.stringify(
        await t.query(api.characters.vitals, { code: fixture.code, dmCode: fixture.dmCode }),
      ) ?? ''
    expect(containsNumber(dmVitals, CREATURE_CURRENT_HP)).toBe(true)

    const dmTokens =
      JSON.stringify(
        await t.query(api.board.tokens, { code: fixture.code, dmCode: fixture.dmCode }),
      ) ?? ''
    expect(dmTokens).toContain(CREATURE_TOKEN_NAME)
    expect(dmTokens).toContain(fixture.creatureToken)
  })
})

// ---------------------------------------------------------------------------
// (b) The instrument
// ---------------------------------------------------------------------------

/**
 * The scan's own instrument, checked. `containsNumber` is the only reason the loop above
 * is not a `toContain`, so a bug in it would silently turn every numeric assertion in this
 * file into a no-op — and a scan whose needle does not work passes in silence.
 *
 * Adapted from `vitals.test.ts` with this suite's own constants, because the cases that
 * matter are the ones this fixture can actually produce: a thirteen-digit `_creationTime`,
 * a document id with digits in it, and a `total` that is a *prefix* of another number.
 */
test('the number scan matches a JSON number and not a timestamp, an id or a longer number', () => {
  expect(containsNumber('{"modifier":461}', 461)).toBe(true)
  expect(containsNumber('[461,4]', 461)).toBe(true)
  expect(containsNumber('{"n":"461"}', 461)).toBe(true)
  expect(containsNumber('{"total":229}', 229)).toBe(true)
  expect(containsNumber('{"_creationTime":1782713461000}', 461)).toBe(false)
  expect(containsNumber('{"_id":"kg461abc"}', 461)).toBe(false)
  expect(containsNumber('{"x":3.461}', 461)).toBe(false)
  expect(containsNumber('{"x":4610}', 461)).toBe(false)
  expect(containsNumber('{"x":1461}', 461)).toBe(false)
})

// ---------------------------------------------------------------------------
// (c) The key set
// ---------------------------------------------------------------------------

describe('publicFeedValidator sends the stored row minus the game, plus a timestamp and a flag', () => {
  /**
   * THE KEY SET, not the values. `gameId: undefined` would satisfy every assertion about
   * the game id being absent and would still be a field the moment anything reflected over
   * the object — which is exactly the failure `vitals.test.ts` records for `current`.
   *
   * The literal list is asserted against the row *and* against the validator's own fields,
   * so the test fails in both directions: a projection that grows a key fails the first
   * assertion, and a validator that grows one without the projection following fails the
   * second. Deriving the expectation from the validator alone would pass for a field added
   * to both.
   */
  test('a projected row has exactly the validator’s keys and no gameId', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    await rollHeroInitiative(t, fixture)

    const expected = [
      '_id',
      'actorName',
      'characterId',
      'createdAt',
      'dmOnly',
      'predatesReveal',
      'roll',
      'subject',
    ]

    const row = newest(await dmFeed(t, fixture))
    expect(Object.keys(row).sort()).toEqual(expected)
    expect(Object.keys(publicFeedValidator.fields).sort()).toEqual(expected)

    // The stored field the caller supplied and so is told nothing by. Named separately
    // from the key set because it is the one absence that is a decision rather than a
    // consequence — see the note on the validator.
    expect(row).not.toHaveProperty('gameId')
    // And `createdAt` really is the projected `_creationTime` rather than a field of its
    // own, which is what makes the substitution above a projection rather than a rename.
    expect(row).not.toHaveProperty('_creationTime')
    expect(typeof row.createdAt).toBe('number')
    // The other derived member, and the one with no stored counterpart at all: it is a
    // comparison between this row's creation time and the game's reveal clock, made on the
    // server because a browser has only its own clock to compare against. Section (l) proves
    // it moves; here it only has to be a boolean and not, say, an absent key reading as
    // falsy on every client.
    expect(typeof row.predatesReveal).toBe('boolean')

    // A player's row has the same keys, so the projection is one shape rather than two
    // that agreed when they were written. There is no redacted variant of a feed row and
    // there must not be one: a row a caller may not hear about is dropped whole.
    const asPlayer = newest(await t.query(api.feed.list, { code: fixture.code }))
    expect(Object.keys(asPlayer).sort()).toEqual(expected)
    expect(asPlayer).toEqual(row)
  })
})

// ---------------------------------------------------------------------------
// (d) The token moves and the line appears
// ---------------------------------------------------------------------------
//
// ⚠️ **THIS IS THE SECTION THAT STOPS SECTION (a) PASSING FOR THE WRONG REASON.** Every
// scan above is satisfied by a feed that is simply DM-only, and a feed showing players
// nothing would be a feature discovered broken at the table rather than in CI. So the
// `visible` disjunct of `mayHearOf` is proved live here, and proved live *by the one write
// that is supposed to move it*: `board.setLayer`.
//
// It is also the section that keeps the two predicates apart. `mayHearOf` and
// `maySeeCharacter` answer different questions, and the collapse fails in whichever
// direction it is made — ask the sheet question about a line and the arrow the party
// watched land is suppressed; widen the sheet question to admit what the line admits and
// the goblin's armour class goes out with it.

describe('a coin on the player layer is a line the table hears', () => {
  test('the same creature’s rolls appear and disappear with its layer', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, creatureToken } = fixture
    await rollCreatureAttack(t, fixture)

    // Hidden: the ambush case, which is section (a) restated in two lines so that the
    // before and after of one write are in one test.
    expect(await t.query(api.feed.list, { code })).toHaveLength(0)

    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'player' })

    const revealed = await t.query(api.feed.list, { code })
    expect(revealed).toHaveLength(2)
    expect(revealed.map((row) => row.actorName)).toEqual([CREATURE_NAME, CREATURE_NAME])
    const revealedText = JSON.stringify(revealed) ?? ''
    expect(revealedText).toContain(CREATURE_NAME)
    expect(revealedText).toContain(CREATURE_WEAPON_NAME)
    expect(revealedText).toContain(CREATURE_TO_HIT)
    expect(revealedText).toContain(CREATURE_DAMAGE)

    // And back. One write to `layer` reveals both the coin and the lines, and one write
    // takes both away again — see the ⚠️ on `setTokenLayer`, which lists the three things
    // that move together.
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'gm' })
    expect(await t.query(api.feed.list, { code })).toHaveLength(0)
  })

  /**
   * THE SHARP PAIR, and the exact distinction `mayHearOf` exists for.
   *
   * With the coin on the player layer the party hears the line — and still may not read
   * the stat block. `board.tokens` has already published the creature's coin and its name,
   * so withholding the line would be secrecy theatre against a client that can read the
   * name off its own board; the armour class, the notes and the hit points are a different
   * question, answered by `maySeeCharacter`, and it says no.
   */
  test('hearing the line is not seeing the sheet', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, ana, creature, creatureToken } = fixture
    await rollCreatureAttack(t, fixture)
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'player' })

    // The line is there, so what follows is a refusal about the sheet rather than an
    // empty game.
    expect(await t.query(api.feed.list, { code })).toHaveLength(2)

    for (const who of [{}, { playerId: ana }, { dmCode: twiddle(dmCode) }]) {
      expect(
        await t.query(api.characters.sheet, { code, characterId: creature, ...who }),
        `${JSON.stringify(who)} opened the creature’s sheet`,
      ).toBeNull()
    }

    // Nor do the numbers arrive by the other route: a creature the party can see is
    // exactly the creature whose hit points the DM is still keeping.
    const vitals = await t.query(api.characters.vitals, { code, playerId: ana })
    expect(vitals.find((row) => row.characterId === creature)?.kind).toBe('band')

    // The notes and the maximum are still nowhere in a player's traffic, even though a
    // line naming this creature now legitimately is.
    for (const [name, payload] of Object.entries({
      'feed.list': await t.query(api.feed.list, { code }),
      'characters.sheet': await t.query(api.characters.sheet, { code, characterId: creature }),
      'characters.list': await t.query(api.characters.list, { code }),
      'characters.vitals': await t.query(api.characters.vitals, { code, playerId: ana }),
    })) {
      const serialised = JSON.stringify(payload) ?? ''
      expect(serialised, `${name} leaked the notes`).not.toContain(CREATURE_NOTES)
      expect(serialised, `${name} leaked the passive`).not.toContain(CREATURE_PASSIVE_NAME)
      expect(containsNumber(serialised, CREATURE_MAX_HP), `${name} leaked the maximum`).toBe(false)
      expect(
        containsNumber(serialised, CREATURE_CURRENT_HP),
        `${name} leaked the current total`,
      ).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// (e) A granted creature
// ---------------------------------------------------------------------------
//
// ⚠️ **WHAT A GRANT ACTUALLY CHANGES ABOUT THE FEED IS NOTHING, AND THAT IS THE RESULT
// RATHER THAN A GAP.** It is worth stating plainly, because the obvious assumption — the
// granted seat hears the pet and the others do not — is false, and a test written to that
// assumption would fail.
//
// `boardCharacterAccess` returns `{ visible, controlled }` from one pass over the tokens
// this caller may see, and `mayHearOf` is `maySeeCharacter(…, controlled) || visible.has(…)`.
// A pet standing on a **player-layer** coin is in `visible` for *everybody*, because the
// layer is a property of the token and not of the seat — so every seat at the table hears
// its rolls, granted or not, and `controlled` adds nothing that `visible` had not already
// given. What the grant changes is the two things `controlled` is for: whose *sheet* may be
// opened, and who may *roll* the thing.
//
// The other side of the composition is the DM layer, and there the grant is inert in both
// directions: an id cannot enter `controlled` on an iteration that did not already put it
// into `visible`, so a grant written onto a hidden coin contributes nothing at all.

describe('a granted pet: sight follows the coin, and the grant follows the lead', () => {
  /** A pet on the player layer, handed to Ana and not to Ben. */
  async function petFixture(t: Harness) {
    const fixture = await feedFixture(t)
    const ben = await makeSeat(t, fixture.code, 'Ben')

    const { characterId: pet } = await t.mutation(api.characters.create, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      name: PET_NAME,
      sheet: npcSheet({
        maxHp: 31,
        notes: '',
        actions: [
          {
            id: 'bite',
            name: PET_ENTRY_NAME,
            text: 'It has done this before and it is bored of doing it.',
            roll: '1d6+2',
            level: null,
            catalogueKey: null,
            category: 'weapon',
            toHit: '1d20+4',
          },
        ],
      }),
    })
    const petToken = await addToken(t, fixture.code, fixture.dmCode, fixture.sceneId, {
      name: 'The Second Cart’s Wolf',
      layer: 'player',
      characterId: pet,
      x: 1100,
      y: 700,
    })
    await setControllers(t, fixture, petToken, [fixture.ana])

    return { ...fixture, ben, pet, petToken }
  }

  test('both seats hear the pet, because the layer and not the grant is what admits a line', async () => {
    const t = harness()
    const fixture = await petFixture(t)
    const { code, dmCode, ana, ben, pet } = fixture

    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: pet,
      request: { kind: 'entry', entryId: 'bite', part: 'roll' },
      mode: 'flat',
      dmOnly: false,
    })

    // Ana holds the lead; Ben holds nothing. Both hear the line, because `visible` is a
    // property of the coin and not of the seat.
    const heard = await t.query(api.feed.list, { code })
    expect(heard.map((row) => row.actorName)).toEqual([PET_NAME])
    expect(heard[0].subject).toMatchObject({ kind: 'entry', name: PET_ENTRY_NAME })

    // What the grant *does* change, asserted beside it so the two are not confused: the
    // sheet opens for the seat holding the lead and for nobody else.
    expect(
      await t.query(api.characters.sheet, { code, characterId: pet, playerId: ana }),
    ).not.toBeNull()
    expect(
      await t.query(api.characters.sheet, { code, characterId: pet, playerId: ben }),
    ).toBeNull()

    /**
     * ⚠️ **AND THE STRONGER FORM OF THE SAME FACT: THERE IS NO LONGER A CHANNEL FOR A GRANT
     * TO WIDEN THE FEED, AND THIS IS WHAT PINS THAT.**
     *
     * `boardCharacterAccess` builds both sets in one pass and only ever adds to
     * `controlled` on an iteration that has already added to `visible`, so
     * `controlled ⊆ visible` holds by construction (ADR 0009, and the ⚠️ on that function).
     * `mayHearOf` was therefore `maySeeCharacter(…, controlled) || visible.has(…)` with a
     * first disjunct that could admit nothing the second had not — a parameter that changed
     * no answer while *asserting* that a grant widens the feed, which is what put `playerId`
     * on this query and split the highest-churn subscription in the application into one
     * cache entry per seat.
     *
     * Both are gone, so the property is now structural rather than tested: a seat cannot be
     * named, so it cannot change the answer. What is left to assert is that the door is
     * genuinely shut — Convex refuses an argument the validator does not declare, before any
     * handler runs — and that a later milestone wanting control to widen the feed beyond
     * sight has to reopen it deliberately. That would be a new decision, not a tidy-up, and
     * this is the test that makes somebody take it.
     */
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t.query(api.feed.list, { code, playerId: ben } as any),
    ).rejects.toThrow()
  })

  test('the granted seat may roll the pet, and an ungranted seat may not', async () => {
    const t = harness()
    const fixture = await petFixture(t)
    const { code, ana, ben, pet, creature } = fixture

    const bite = {
      request: { kind: 'entry' as const, entryId: 'bite', part: 'roll' as const },
      mode: 'flat' as const,
      dmOnly: false,
    }

    await t.mutation(api.feed.roll, { code, playerId: ana, characterId: pet, ...bite })
    expect(newest(await t.query(api.feed.list, { code })).actorName).toBe(PET_NAME)

    // Ben was granted nothing, so the pet is invisible to the rule that decides this —
    // `maySeeCharacter` refuses a creature before anybody asks who is holding its lead,
    // and the empty controlled set does not change that. `CharacterNotFound` rather than
    // `CharacterNotYours`, which is the same answer a fabricated id gets and the right one.
    await expectKind(
      t.mutation(api.feed.roll, { code, playerId: ben, characterId: pet, ...bite }),
      'CharacterNotFound',
    )

    // And a grant is per token: the creature Ana was *not* handed is refused to her too.
    await expectKind(
      t.mutation(api.feed.roll, {
        code,
        playerId: ana,
        characterId: creature,
        request: { kind: 'entry', entryId: 'rend', part: 'roll' },
        mode: 'flat',
        dmOnly: false,
      }),
      'CharacterNotFound',
    )

    // Nothing was written by either refusal, so the feed holds the one line Ana rolled.
    expect(await t.query(api.feed.list, { code, dmCode: fixture.dmCode })).toHaveLength(1)
  })

  /**
   * ⚠️ **THE COMPOSITION, ON THE FEED SIDE.** A grant written onto a DM-layer coin
   * contributes nothing: `visibleTokens` dropped that row before `boardCharacterAccess`'s
   * loop began, so the id cannot be in `controlled` either, and `mayHearOf` has neither
   * disjunct to work with. The DM prepares the ambush, hands the party its pet in advance,
   * and reveals both with one click.
   */
  test('a grant on a DM-layer coin is inert, for the feed as for the sheet', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, ana, creature, creatureToken } = fixture

    await setControllers(t, fixture, creatureToken, [ana])
    await rollCreatureAttack(t, fixture)

    expect(await t.query(api.feed.list, { code })).toHaveLength(0)
    expect(
      await t.query(api.characters.sheet, { code, characterId: creature, playerId: ana }),
    ).toBeNull()
    // Nor may the granted seat roll it, which is the write path saying the same thing.
    await expectKind(
      t.mutation(api.feed.roll, {
        code,
        playerId: ana,
        characterId: creature,
        request: { kind: 'entry', entryId: 'rend', part: 'roll' },
        mode: 'flat',
        dmOnly: false,
      }),
      'CharacterNotFound',
    )

    // The control: the DM hears both lines, so the creature exists and did roll. The
    // player is being told nothing rather than being told about an empty game.
    expect(await dmFeed(t, fixture)).toHaveLength(2)

    // And the grant survives the round trip inert rather than revoked, which is what makes
    // the reveal one click: put the coin on the player layer and Ana has the lead.
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'player' })
    expect(await t.query(api.feed.list, { code })).toHaveLength(2)
    expect(
      await t.query(api.characters.sheet, { code, characterId: creature, playerId: ana }),
    ).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// (f) Reserved
// ---------------------------------------------------------------------------
//
// The second withholding reason, and the one `readableCharacterIds` calls genuinely
// reachable: the DM's grouped Sheets selector rolls initiative row by row, and a reserved
// hero has a row. `Seraphine the Unarrived rolls initiative` is one click away from the
// whole table for a character nobody is supposed to know exists yet.
//
// Note what makes this a different test from every other one in this file rather than a
// variation: a **hero** is admitted by `maySeeCharacter` outright, with no token needed and
// no layer to hide behind, so the reservation is the only thing withholding the line.

describe('a reserved hero’s rolls are withheld, and the reservation is the only thing doing it', () => {
  test('the DM hears the line, the table does not, and lifting the flag publishes it', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, ana } = fixture

    const { characterId: seraphine } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: RESERVED_NAME,
      sheet: pcSheet({ maxHp: 33 }),
    })
    await t.mutation(api.characters.setReserved, {
      code,
      dmCode,
      characterId: seraphine,
      reserved: true,
    })

    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: seraphine,
      request: { kind: 'initiative' },
      mode: 'flat',
      dmOnly: false,
    })

    // Withheld — and by name and by id, because a row keyed on a character nobody is
    // supposed to know exists is a leak whether or not the name travels beside it.
    for (const who of [{}, { dmCode: twiddle(dmCode) }]) {
      const rows = await t.query(api.feed.list, { code, ...who })
      expect(rows, JSON.stringify(who)).toHaveLength(0)
      expect(JSON.stringify(rows) ?? '').not.toContain(RESERVED_NAME)
      expect(JSON.stringify(rows) ?? '').not.toContain(seraphine)
    }

    // The positive control: the DM's own feed carries it, so the line was written and the
    // scan above is not passing on a mutation that did nothing.
    const asDm = await dmFeed(t, fixture)
    expect(asDm.map((row) => row.actorName)).toEqual([RESERVED_NAME])
    expect(asDm[0].characterId).toBe(seraphine)

    // And the live disjunct, the same discipline as section (d): un-reserve and the line
    // appears, with nothing else written and no second roll.
    await t.mutation(api.characters.setReserved, {
      code,
      dmCode,
      characterId: seraphine,
      reserved: false,
    })
    const afterwards = await t.query(api.feed.list, { code })
    expect(afterwards.map((row) => row.actorName)).toEqual([RESERVED_NAME])
    // The same row reaching a new audience, field for field — **except `predatesReveal`,
    // which this very write is supposed to move.** Lifting a reservation is a widening, so
    // the line becomes history to the table at the moment it becomes audible to them, and
    // comparing that field here would be asserting section (l)'s subject from a test whose
    // fixture does not control the clock. What is claimed here is the sharper thing: nothing
    // *else* about the row was rewritten to publish it.
    expect(withoutRevealFlag(afterwards)).toEqual(withoutRevealFlag(asDm))
  })
})

// ---------------------------------------------------------------------------
// (g) dmOnly
// ---------------------------------------------------------------------------
//
// The third withholding reason, and it is a question about the **row** rather than about
// the character on it — which is why `visibleFeed` `&&`s it rather than folding it into
// `mayHearOf`. The DM's private roll for a hero the whole table can see is still private,
// and that case is the last test here because it is the one a fold would break.

describe('dmOnly is about the line and not about the character', () => {
  test('a private ad-hoc roll reaches no player payload and reaches the DM', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode } = fixture
    await rollHeroInitiative(t, fixture)

    await t.mutation(api.feed.rollDice, {
      code,
      dmCode,
      playerId: await dmSeat(t, code),
      expression: DM_PRIVATE_ROLL,
      mode: 'flat',
      dmOnly: true,
    })

    for (const [name, payload] of Object.entries(await playerPayloads(t, fixture))) {
      const serialised = JSON.stringify(payload) ?? ''
      expect(serialised, `${name} leaked the DM’s private expression`).not.toContain(DM_PRIVATE_ROLL)
      expect(
        containsNumber(serialised, DM_PRIVATE_MODIFIER),
        `${name} leaked the DM’s private modifier`,
      ).toBe(false)
    }

    // Present for the DM, and marked as private rather than merely present — `dmOnly`
    // travels so the panel can say what is currently true rather than what a button would
    // do, which is `publicCharacterValidator.reserved`'s argument exactly.
    const asDm = newest(await dmFeed(t, fixture))
    expect(asDm.dmOnly).toBe(true)
    expect(asDm.roll?.expression).toBe(DM_PRIVATE_ROLL)
    expect(asDm.characterId).toBeNull()

    // And the player's own line is still there, so `dmOnly` dropped one row rather than
    // the query answering nothing.
    const asPlayer = await t.query(api.feed.list, { code })
    expect(asPlayer.map((row) => row.actorName)).toEqual([HERO_NAME])
    expect(asPlayer.every((row) => row.dmOnly === false)).toBe(true)
  })

  test('a player asking to roll privately is refused on both mutations, and rolls publicly fine', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, ana, hero } = fixture

    // An explicit refusal rather than a silent downgrade, and the one distinguishable
    // refusal in `convex/feed.ts` — nothing sits behind it. It is asked before any
    // character is read, and its answer is a fact the caller already knows.
    await expectKind(
      t.mutation(api.feed.roll, {
        code,
        playerId: ana,
        characterId: hero,
        request: { kind: 'initiative' },
        mode: 'flat',
        dmOnly: true,
      }),
      'NotDm',
    )
    await expectKind(
      t.mutation(api.feed.rollDice, {
        code,
        playerId: ana,
        expression: '2d6',
        mode: 'flat',
        dmOnly: true,
      }),
      'NotDm',
    )
    // A wrong DM code is not a DM code, so the gate keys off the code being correct rather
    // than being present (invariant 7).
    await expectKind(
      t.mutation(api.feed.rollDice, {
        code,
        playerId: ana,
        dmCode: twiddle(fixture.dmCode),
        expression: '2d6',
        mode: 'flat',
        dmOnly: true,
      }),
      'NotDm',
    )

    // Nothing was written by any of the three.
    expect(await dmFeed(t, fixture)).toHaveLength(0)

    // The control: the identical calls with the flag down both land.
    await t.mutation(api.feed.roll, {
      code,
      playerId: ana,
      characterId: hero,
      request: { kind: 'initiative' },
      mode: 'flat',
      dmOnly: false,
    })
    await t.mutation(api.feed.rollDice, {
      code,
      playerId: ana,
      expression: '2d6',
      mode: 'flat',
      dmOnly: false,
    })
    const rows = await t.query(api.feed.list, { code })
    expect(rows.map((row) => row.actorName)).toEqual([HERO_NAME, 'Ana'])
    expect(rows.every((row) => row.dmOnly === false)).toBe(true)
  })

  /**
   * THE CASE THAT WOULD BREAK IF `dmOnly` WERE FOLDED INTO `mayHearOf`.
   *
   * The hero is claimed, on the player layer, and the whole table can already read their
   * sheet — so every visibility predicate in the codebase says yes to this character. The
   * row is withheld anyway, because the flag is about the line.
   */
  test('a private roll on a hero the whole table can see is still withheld', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, ana, hero } = fixture

    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: hero,
      request: { kind: 'save', ability: 'con' },
      mode: 'flat',
      dmOnly: true,
    })

    // Nothing for the party, even though the character is theirs to read.
    expect(await t.query(api.feed.list, { code })).toHaveLength(0)
    // The control on both halves: the sheet *is* open to that seat, and the DM does have
    // the line — so the withholding is the flag rather than the character.
    expect(
      await t.query(api.characters.sheet, { code, characterId: hero, playerId: ana }),
    ).not.toBeNull()
    const asDm = await dmFeed(t, fixture)
    expect(asDm).toHaveLength(1)
    expect(asDm[0]).toMatchObject({ actorName: HERO_NAME, dmOnly: true })

    // And the same roll with the flag down does reach them, which is the live disjunct for
    // this predicate as section (d) is for `visible`.
    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: hero,
      request: { kind: 'save', ability: 'con' },
      mode: 'flat',
      dmOnly: false,
    })
    const afterwards = await t.query(api.feed.list, { code })
    expect(afterwards).toHaveLength(1)
    expect(afterwards[0].dmOnly).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (h) Refusal parity
// ---------------------------------------------------------------------------

describe('refusing a roll on the DM’s creature is indistinguishable from it not existing', () => {
  /**
   * Once the payload channel is closed, the remaining way to enumerate the DM's bestiary
   * is to guess ids and read the error back. A distinguishable refusal is an existence
   * oracle: a player who can tell "you may not roll that one" from "no such character" can
   * enumerate the DM layer one id at a time without ever seeing a payload, and a player who
   * knows there is a dragon has had the dragon spoiled.
   *
   * `feed.roll` gets this for free from `requireEditableCharacter`, which is the whole
   * reason `convex/feed.ts` writes no check of its own — so what is asserted here is that
   * the free thing is actually in place, message included.
   */
  test('a hidden creature, a vanished id and another game’s hero refuse identically', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, ana } = fixture
    const other = await makeGame(t, 'Other Table', 'Sam')
    const { characterId: theirs } = await t.mutation(api.characters.create, {
      code: other.code,
      dmCode: other.dmCode,
      name: 'Their Hero',
      sheet: pcSheet(),
    })
    const ghost = await vanishedCharacterId(t, code)

    const roll = (characterId: Id<'characters'>, playerId?: Id<'players'>) =>
      t.mutation(api.feed.roll, {
        code,
        characterId,
        request: { kind: 'initiative' },
        mode: 'flat',
        dmOnly: false,
        ...(playerId === undefined ? {} : { playerId }),
      })

    const secret = await refusalOf(roll(fixture.creature))
    expect(secret.kind).toBe('CharacterNotFound')
    expect(await refusalOf(roll(ghost))).toEqual(secret)
    expect(await refusalOf(roll(theirs))).toEqual(secret)

    // And with a seat id attached, which is the shape a real client sends. The three are
    // still one answer, because visibility is refused ahead of everything else.
    const seated = await refusalOf(roll(fixture.creature, ana))
    expect(seated).toEqual(secret)
    expect(await refusalOf(roll(ghost, ana))).toEqual(seated)
    expect(await refusalOf(roll(theirs, ana))).toEqual(seated)

    // The error channel says nothing either: a refusal that named the creature would be as
    // much of a leak as a payload carrying it.
    expect(JSON.stringify(secret) ?? '').not.toContain(CREATURE_NAME)

    // Nothing was written by any of the six, so a refused roll is not a line the DM sees.
    expect(await dmFeed(t, fixture)).toHaveLength(0)
  })

  test('a player rolling another player’s hero is told whose it is', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, hero } = fixture
    const ben = await makeSeat(t, code, 'Ben')

    // A hero is not a secret from the party, so this refusal may name the holder — the
    // distinction is precisely that nothing behind it is hidden. Contrast the creature
    // above, whose existence is the thing being kept.
    const refusal = await refusalOf(
      t.mutation(api.feed.roll, {
        code,
        playerId: ben,
        characterId: hero,
        request: { kind: 'initiative' },
        mode: 'flat',
        dmOnly: false,
      }),
    )
    expect(refusal.kind).toBe('CharacterNotYours')
    expect(refusal.message).toContain('Ana')

    // And the seat that does hold the claim may roll it, so the refusal is about the seat
    // rather than about the mutation.
    await rollHeroInitiative(t, fixture)
    expect(newest(await dmFeed(t, fixture)).actorName).toBe(HERO_NAME)
  })
})

// ---------------------------------------------------------------------------
// (i) What a roll produces
// ---------------------------------------------------------------------------
//
// Round-trip assertions on the row itself. Everything below is read off the *stored* sheet
// by `planRoll` — the client sends an id and a part and nothing else — so these are as much
// assertions about what a caller cannot say as about what the server writes.

describe('what a click produces, read back off the row', () => {
  /** The DM rolls something on the creature, and hands back the line it wrote. */
  async function dmRoll(
    t: Harness,
    fixture: Fixture,
    request:
      | { kind: 'entry'; entryId: string; part: 'toHit' | 'roll' | 'use' | 'text' }
      | { kind: 'check'; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' }
      | { kind: 'save'; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' }
      | { kind: 'skill'; skill: 'athletics' }
      | { kind: 'initiative' },
    characterId: Id<'characters'> = fixture.creature,
  ): Promise<PublicFeedRow> {
    await t.mutation(api.feed.roll, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId,
      request,
      mode: 'flat',
      dmOnly: false,
    })
    return newest(await dmFeed(t, fixture))
  }

  /**
   * ⚠️ **A REQUIRED ACCEPTANCE CRITERION: a passive rolls nothing.**
   *
   * `use` is a passive being *declared* — the point is that the table is told — so the row
   * carries no dice at all. Written with the positive control beside it, on the same sheet,
   * because "roll is null" is also what a broken evaluator produces for everything.
   */
  test('a passive produces no roll, and an action on the same sheet produces one', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    const passive = await dmRoll(t, fixture, { kind: 'entry', entryId: 'shroud', part: 'use' })
    expect(passive.roll).toBeNull()
    expect(passive.subject).toEqual({
      kind: 'entry',
      part: 'use',
      name: CREATURE_PASSIVE_NAME,
      category: 'passive',
      level: null,
      text: null,
    })

    const action = await dmRoll(t, fixture, { kind: 'entry', entryId: 'wail', part: 'roll' })
    expect(action.roll).not.toBeNull()
    expect(action.roll?.expression).toBe(CREATURE_ACTION_ROLL)
    expect(action.roll?.modifier).toBe(CREATURE_ACTION_MODIFIER)
    expect(action.subject).toMatchObject({ part: 'roll', category: 'action' })

    // The part gate is a real gate: a passive offers only `use`, so asking for its damage
    // is refused rather than answered with an empty roll or a crash.
    await expectKind(
      t.mutation(api.feed.roll, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.creature,
        request: { kind: 'entry', entryId: 'shroud', part: 'roll' },
        mode: 'flat',
        dmOnly: false,
      }),
      'BadInput',
    )
  })

  /**
   * `subject.text` is populated only when the part is `'text'`, which is a coherence rule
   * no validator can express — lib/roll.ts records it as an invariant with a test, and this
   * is that test. An alt-click *is* the description, so it travels; a roll does not carry
   * six hundred characters of prose on every line of a busy feed.
   */
  test('alt-click carries the description and rolls nothing, and no other part carries text', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    const described = await dmRoll(t, fixture, { kind: 'entry', entryId: 'rend', part: 'text' })
    expect(described.roll).toBeNull()
    expect(described.subject).toEqual({
      kind: 'entry',
      part: 'text',
      name: CREATURE_WEAPON_NAME,
      category: 'weapon',
      level: null,
      text: CREATURE_WEAPON_TEXT,
    })

    // Every other part on every entry, so this is the invariant rather than one example.
    const others: [string, 'toHit' | 'roll' | 'use'][] = [
      ['rend', 'toHit'],
      ['rend', 'roll'],
      ['wail', 'roll'],
      ['shroud', 'use'],
    ]
    for (const [entryId, part] of others) {
      const row = await dmRoll(t, fixture, { kind: 'entry', entryId, part })
      expect(row.subject, `${entryId}.${part} carried text`).toMatchObject({ text: null })
    }

    // Alt-click works on a passive too, which is why `partsFor` leaves `text` out of every
    // category's list: it is a modifier on a gesture rather than a fourth button.
    const passiveText = await dmRoll(t, fixture, {
      kind: 'entry',
      entryId: 'shroud',
      part: 'text',
    })
    expect(passiveText.subject).toMatchObject({ text: CREATURE_PASSIVE_TEXT, part: 'text' })
  })

  test('a weapon’s to-hit and its damage are two rows with two expressions', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    await rollCreatureAttack(t, fixture)

    const rows = await dmFeed(t, fixture)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.roll?.expression)).toEqual([CREATURE_TO_HIT, CREATURE_DAMAGE])
    expect(rows.map((row) => row.roll?.modifier)).toEqual([
      CREATURE_TO_HIT_MODIFIER,
      CREATURE_DAMAGE_MODIFIER,
    ])
    // The same entry, named twice, with the part as the only difference — the two clicks
    // are two facts about one line on the sheet rather than two entries.
    expect(rows.map((row) => row.subject)).toEqual([
      {
        kind: 'entry',
        part: 'toHit',
        name: CREATURE_WEAPON_NAME,
        category: 'weapon',
        level: null,
        text: null,
      },
      {
        kind: 'entry',
        part: 'roll',
        name: CREATURE_WEAPON_NAME,
        category: 'weapon',
        level: null,
        text: null,
      },
    ])
    // One d20 among the to-hit's dice and none among the damage's, so `critOf` can answer
    // the first and must not answer the second.
    expect(rows[0].roll?.dice.map((die) => die.faces)).toEqual([20])
    expect(rows[1].roll?.dice.map((die) => die.faces)).toEqual([4, 4])
    expect(rows[1].roll?.crit).toBeNull()
  })

  /**
   * `actorName` is the **character's** for a sheet roll and the **seat's** for the tray,
   * and the asymmetry is the decision rather than an inconsistency: a sheet roll is
   * announced as the character, because the DM rolling on a player's behalf has to announce
   * *the character*; an ad-hoc roll names nobody, so it is announced as the person.
   */
  test('a sheet roll is announced as the character and the dice tray as the seat', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, ana, hero } = fixture

    // The DM rolling the party's hero still says the hero, which is the case that makes
    // this a decision rather than a coincidence of who pressed the button.
    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: hero,
      request: { kind: 'initiative' },
      mode: 'flat',
      dmOnly: false,
    })
    expect(newest(await dmFeed(t, fixture)).actorName).toBe(HERO_NAME)

    // The seat rolling its own hero says the same thing, so the name comes off the
    // document rather than off the caller.
    await rollHeroInitiative(t, fixture)
    expect(newest(await dmFeed(t, fixture)).actorName).toBe(HERO_NAME)

    // The tray says the person, and carries no character at all.
    await t.mutation(api.feed.rollDice, {
      code,
      playerId: ana,
      expression: '2d6',
      mode: 'flat',
      dmOnly: false,
    })
    const tray = newest(await dmFeed(t, fixture))
    expect(tray.actorName).toBe('Ana')
    expect(tray.characterId).toBeNull()
    expect(tray.subject).toEqual({ kind: 'dice' })
  })

  /**
   * ONE PATH, TWO SHEET KINDS. `initiativeBonusOf` already knows both answers — Dexterity
   * for a hero, the stored bonus for a creature, because a reduced sheet has no Dexterity
   * to consult — so this is the one roll `planRoll` serves a creature as well as a hero.
   * Note the contrast with the three refusals below it: those are refused *because* the
   * number does not exist on a creature, and this is allowed *because* it does.
   */
  test('initiative works off Dexterity for a hero and off the stored bonus for a creature', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    const forHero = await dmRoll(t, fixture, { kind: 'initiative' }, fixture.hero)
    expect(forHero.roll?.expression).toBe(HERO_INITIATIVE_ROLL)
    expect(forHero.roll?.modifier).toBe(1)
    expect(forHero.subject).toEqual({ kind: 'initiative' })

    const forCreature = await dmRoll(t, fixture, { kind: 'initiative' })
    expect(forCreature.roll?.expression).toBe(CREATURE_INITIATIVE_ROLL)
    expect(forCreature.roll?.modifier).toBe(CREATURE_INITIATIVE_BONUS)
    expect(forCreature.subject).toEqual({ kind: 'initiative' })
  })

  test('a check, a save and a skill are refused on a creature and answered for a hero', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, creature, hero } = fixture

    const requests = [
      { kind: 'check' as const, ability: 'str' as const },
      { kind: 'save' as const, ability: 'dex' as const },
      { kind: 'skill' as const, skill: 'athletics' as const },
    ]

    // Refused rather than answered with a zero, which is the one thing that must not
    // happen: `+0` is a number the feed then prints as though somebody had rolled it.
    for (const request of requests) {
      await expectKind(
        t.mutation(api.feed.roll, {
          code,
          dmCode,
          characterId: creature,
          request,
          mode: 'flat',
          dmOnly: false,
        }),
        'BadInput',
      )
    }
    expect(await dmFeed(t, fixture)).toHaveLength(0)

    // The control: the identical three requests on a hero all land, so the refusals are
    // about the sheet rather than about the request kinds being unimplemented.
    for (const request of requests) {
      await t.mutation(api.feed.roll, {
        code,
        dmCode,
        characterId: hero,
        request,
        mode: 'flat',
        dmOnly: false,
      })
    }
    const rows = await dmFeed(t, fixture)
    expect(rows.map((row) => row.subject.kind)).toEqual(['check', 'save', 'skill'])
    // STR 16 → +3; DEX 12 with no proficiency → +1; Athletics off STR with no proficiency
    // → +3. Every d20 is built by `toHitFromBonus`, so a zero bonus would be a bare
    // `1d20` rather than the `1d20+0` the grammar would happily have accepted.
    expect(rows.map((row) => row.roll?.expression)).toEqual(['1d20+3', '1d20+1', '1d20+3'])
  })

  /**
   * THE TOTAL, checked as an invariant rather than against a scripted pair.
   *
   * ⚠️ **Both halves are asserted, and the choice is forced rather than preferred.** There
   * is no way to inject a `DieSource` through a mutation — that is the whole of the
   * boundary lib/dice.ts describes, and `dice.test.ts` is where `sequenceSource` makes an
   * exact total checkable. What *is* checkable here is the arithmetic the row reports about
   * itself, and it is checked twice over: `total` equals the dice plus the modifier floored
   * at zero, and `total` lies inside `rollRange`, which is a second, independent statement
   * of the same arithmetic. Two agreeing statements is weaker than a proof and considerably
   * stronger than either alone — the same bet the corpus test makes.
   */
  test('a total is the dice plus the modifier, and inside the range the expression allows', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    await rollCreatureAttack(t, fixture)
    // Ten more, because a floor and a range are properties of every roll rather than of
    // one, and one sample of a random total proves very little.
    for (let i = 0; i < 10; i += 1) {
      await t.mutation(api.feed.roll, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.creature,
        request: { kind: 'entry', entryId: 'wail', part: 'roll' },
        mode: 'flat',
        dmOnly: false,
      })
    }

    const rows = await dmFeed(t, fixture)
    expect(rows).toHaveLength(12)

    for (const row of rows) {
      const roll = row.roll
      expect(roll, 'a rolled line came back with no roll on it').not.toBeNull()
      if (!roll) continue

      const rolled = roll.dice.reduce((sum, die) => sum + die.value, 0)
      expect(roll.total, roll.expression).toBe(Math.max(0, rolled + roll.modifier))

      // ⚠️ `NO_MODIFIERS` is the right set here because the roller is a creature: every
      // token on a reduced sheet resolves to zero, and these three expressions carry no
      // token anyway. A hero's expression would need `modifiersFor`.
      const range = rollRange(roll.expression, NO_MODIFIERS)
      expect(roll.total, `${roll.expression} below its minimum`).toBeGreaterThanOrEqual(range.min)
      expect(roll.total, `${roll.expression} above its maximum`).toBeLessThanOrEqual(range.max)

      // Every die is inside its own faces, which is what the 3D dice are handed.
      for (const die of roll.dice) {
        expect(die.value).toBeGreaterThanOrEqual(1)
        expect(die.value).toBeLessThanOrEqual(die.faces)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// (j) Advantage, through the mutation
// ---------------------------------------------------------------------------
//
// ⚠️ **THIS TEST'S ONLY JOB IS TO PROVE THE MODE REACHES THE EVALUATOR.** A source cannot
// be injected through a mutation, so there is no scripted pair to assert against and no
// honest way to write one — `expect(dice[0].value).toBe(18)` here would be a test of
// `crypto.getRandomValues`. The exact-pair assertions live in `dice.test.ts` against
// `sequenceSource`, which is where injection is possible and where "advantage keeps the
// higher of two d20s" is a statement about a known pair.
//
// What is left is the *ordering invariant*, which holds for every pair the generator can
// produce, plus enough repetitions that a comparison reversed in the wrong direction cannot
// pass by luck: a broken `Math.max` survives one roll about half the time and forty rolls
// about once in a trillion.

describe('advantage and disadvantage reach the evaluator through the mutation', () => {
  const ROUNDS = 40

  /** Forty d20 rolls in one mode, as the rows they wrote. */
  async function d20Rounds(
    t: Harness,
    fixture: Fixture,
    mode: 'advantage' | 'disadvantage',
  ): Promise<PublicFeedRow[]> {
    for (let i = 0; i < ROUNDS; i += 1) {
      await t.mutation(api.feed.roll, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        characterId: fixture.hero,
        request: { kind: 'initiative' },
        mode,
        dmOnly: false,
      })
    }
    // Forty is inside `MAX_FEED_ROWS_LISTED`, so every row written is in the window.
    const rows = await dmFeed(t, fixture)
    expect(rows).toHaveLength(ROUNDS)
    return rows
  }

  test('advantage keeps the higher of two d20s and reports the other as dropped', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    for (const row of await d20Rounds(t, fixture, 'advantage')) {
      const roll = row.roll!
      expect(roll.mode).toBe('advantage')
      // `dropped` is how a row says the toggle did anything, which is what `rollModeNote`
      // keys off — so it is the field that proves the mode arrived, rather than `mode`,
      // which is only what was asked for.
      expect(roll.dropped).not.toBeNull()
      expect(roll.dice).toHaveLength(1)
      expect(roll.dice[0].faces).toBe(20)
      expect(roll.dice[0].value).toBeGreaterThanOrEqual(roll.dropped!)
    }
  })

  test('disadvantage keeps the lower of the two', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    for (const row of await d20Rounds(t, fixture, 'disadvantage')) {
      const roll = row.roll!
      expect(roll.mode).toBe('disadvantage')
      expect(roll.dropped).not.toBeNull()
      expect(roll.dice).toHaveLength(1)
      expect(roll.dice[0].value).toBeLessThanOrEqual(roll.dropped!)
    }
  })

  /**
   * The other half of `ROLL_MODES`'s decision: anywhere the toggle cannot apply it is
   * *inert rather than refused*, because the roller has a sticky toggle set from the last
   * saving throw and is now rolling damage. `dropped` stays null, so the row itself says
   * the toggle did nothing and `rollModeNote` cannot print `with advantage` over a `2d4`.
   */
  test('advantage on a damage roll is recorded and ignored rather than refused', async () => {
    const t = harness()
    const fixture = await feedFixture(t)

    await t.mutation(api.feed.roll, {
      code: fixture.code,
      dmCode: fixture.dmCode,
      characterId: fixture.creature,
      request: { kind: 'entry', entryId: 'rend', part: 'roll' },
      mode: 'advantage',
      dmOnly: false,
    })

    const roll = newest(await dmFeed(t, fixture)).roll!
    expect(roll.mode).toBe('advantage')
    expect(roll.dropped).toBeNull()
    expect(roll.dice).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// (k) Bounds
// ---------------------------------------------------------------------------

describe('the dice tray is the one place a roll arrives from a human', () => {
  /**
   * ⚠️ **`ROLL_PATTERN`'s trailing term group has no repetition cap**, so `1d6+1+1+1…` a
   * thousand times over is a *valid* roll and only `MAX_ROLL_LENGTH` inside `rollProblem`
   * closes it. This mutation is the only place that hole is reachable at all — everything
   * on a sheet went through `entriesProblem`, which asks the same question — so the
   * over-long chain is the first case here rather than an afterthought.
   */
  test('an over-long chain, too many dice, a bad die and garbage are all refused', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, ana } = fixture

    const chain = `1d6${'+1'.repeat(20)}`
    expect(chain.length).toBeGreaterThan(MAX_ROLL_LENGTH)

    const refused = [
      chain,
      // Twenty dice is the grammar's ceiling and `MAX_ROLL_DICE` is that fact named.
      '21d6',
      '99d20',
      // A die the allow-list does not carry: `1d7` is a typo rather than a house rule.
      '1d7',
      'kobold',
      '',
      '2d6++3',
    ]

    for (const expression of refused) {
      await expectKind(
        t.mutation(api.feed.rollDice, {
          code,
          playerId: ana,
          expression,
          mode: 'flat',
          dmOnly: false,
        }),
        'BadInput',
      )
    }

    /**
     * ⚠️ **A modifier token is refused rather than resolved to nothing**, which is the
     * opposite call from `modifiersFor`'s and deliberately so: there the roll is stored
     * content and is happening regardless, so a visible `+0` is the best available report
     * of a content bug, and here the roll has not started and a person is present to be
     * told. The refusal names the token, because "type the number instead" is only
     * actionable if the reader knows which one.
     */
    const token = await refusalOf(
      t.mutation(api.feed.rollDice, {
        code,
        playerId: ana,
        expression: '1d8+STR',
        mode: 'flat',
        dmOnly: false,
      }),
    )
    expect(token.kind).toBe('BadInput')
    expect(token.message).toContain('STR')
    // Lower case too, because `normaliseRoll` runs first: `1d8+str` is the same request.
    await expectKind(
      t.mutation(api.feed.rollDice, {
        code,
        playerId: ana,
        expression: '1d8+str',
        mode: 'flat',
        dmOnly: false,
      }),
      'BadInput',
    )

    // Nothing was written by any of the ten, so a refused expression is not a line.
    expect(await dmFeed(t, fixture)).toHaveLength(0)
  })

  test('a valid expression is accepted and normalised before it is stored', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const { code, ana } = fixture

    for (const expression of ['4d6+2', '2d6']) {
      await t.mutation(api.feed.rollDice, {
        code,
        playerId: ana,
        expression,
        mode: 'flat',
        dmOnly: false,
      })
      expect(newest(await dmFeed(t, fixture)).roll?.expression).toBe(expression)
    }

    // Normalised by the same function the tray's field runs on every keystroke, so
    // `2d6 + 3` typed by hand and `2d6+3` offered by a picker are byte-identical before
    // anything judges either of them — and the row records the normalised form.
    await t.mutation(api.feed.rollDice, {
      code,
      playerId: ana,
      expression: '2d6 + 3',
      mode: 'flat',
      dmOnly: false,
    })
    const row = newest(await dmFeed(t, fixture))
    expect(row.roll?.expression).toBe('2d6+3')
    expect(row.roll?.modifier).toBe(3)
    expect(row.subject).toEqual({ kind: 'dice' })
  })

  /** `N` ad-hoc rolls, each carrying its own index in its modifier so the order is legible. */
  async function fireRolls(t: Harness, fixture: Fixture, count: number) {
    for (let i = 1; i <= count; i += 1) {
      await t.mutation(api.feed.rollDice, {
        code: fixture.code,
        playerId: fixture.ana,
        expression: `1d6+${i}`,
        mode: 'flat',
        dmOnly: false,
      })
    }
  }

  test('the window is the newest MAX_FEED_ROWS_LISTED lines, oldest-first', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const total = MAX_FEED_ROWS_LISTED + 5
    await fireRolls(t, fixture, total)

    const rows = await t.query(api.feed.list, { code: fixture.code })
    expect(rows).toHaveLength(MAX_FEED_ROWS_LISTED)

    // ⚠️ **The ordering, not just the count.** The index gives newest-first because that
    // is the only order in which "the newest sixty" is a bounded read at all; a chat panel
    // renders top to bottom, so the server reverses once rather than every client doing it
    // per render. A count assertion alone would pass for a payload in either order.
    expect(rows.map((row) => row.roll?.expression)).toEqual(
      Array.from({ length: MAX_FEED_ROWS_LISTED }, (_, i) => `1d6+${i + 6}`),
    )
    expect(rows.map((row) => row.createdAt)).toEqual(
      [...rows.map((row) => row.createdAt)].sort((a, b) => a - b),
    )
    // The DM's window is the same size, so the bound is the table's rather than the
    // caller's — it is a scrollback and not a search.
    expect(await dmFeed(t, fixture)).toHaveLength(MAX_FEED_ROWS_LISTED)
  })

  /**
   * ⚠️ **THE HONEST LIMIT OF THE WINDOW, RECORDED RATHER THAN LEFT TO BE FOUND** — and it
   * is a *count* leak, which is worth saying because `visibleFeed`'s own note says the
   * opposite.
   *
   * The window is taken before the filter, so what a player receives is the visible part of
   * the last sixty lines rather than the last sixty visible lines. Once a game has more
   * than sixty rows, a player who has counted their own rolls can subtract: sixty-one
   * public lines and four private ones give them fifty-six, and the four they are missing
   * are four rolls they now know the DM made. Filtering before taking the window would leak
   * nothing here — it would always answer sixty — at the price of an unbounded read, which
   * is the real reason for the present order and the one that stands up.
   *
   * Recorded in a test on purpose, so that whoever finds it reads this rather than filing
   * it. Anyone changing the order should change `visibleFeed` and this test together, and
   * should rewrite that function's ⚠️ while they are there.
   */
  test('a player’s window is shortened by the DM’s private lines — the honest limit', async () => {
    const t = harness()
    const fixture = await feedFixture(t)
    const privateLines = 4
    const publicLines = MAX_FEED_ROWS_LISTED + 1
    await fireRolls(t, fixture, publicLines)

    const seat = await dmSeat(t, fixture.code)
    for (let i = 0; i < privateLines; i += 1) {
      await t.mutation(api.feed.rollDice, {
        code: fixture.code,
        dmCode: fixture.dmCode,
        playerId: seat,
        expression: DM_PRIVATE_ROLL,
        mode: 'flat',
        dmOnly: true,
      })
    }

    const rows = await t.query(api.feed.list, { code: fixture.code })
    expect(rows).toHaveLength(MAX_FEED_ROWS_LISTED - privateLines)
    // Not one of the private lines is in it, which is the part that matters and holds.
    expect(JSON.stringify(rows) ?? '').not.toContain(DM_PRIVATE_ROLL)
    expect(rows.every((row) => row.dmOnly === false)).toBe(true)
    // The DM's window is full, so the four lines exist and the shortfall is the filter.
    expect(await dmFeed(t, fixture)).toHaveLength(MAX_FEED_ROWS_LISTED)
  })
})

// ---------------------------------------------------------------------------
// (l) The reveal clock
// ---------------------------------------------------------------------------
//
// ⚠️ **THE SECTION THAT MAKES `stampReveal` A GUARANTEE RATHER THAN AN INTENTION.** Every
// other section in this file asks *whether* a row reaches a caller; this one asks *why* it
// has, which is the question `TableEffects` needs answered before it throws dice over the
// map. A creature that rolled six times behind the GM layer and is then revealed sends six
// rows a player has never seen, and announcing the newest of them replays a roll from
// minutes ago as though the dice were still in the air. Fog turns that from a curiosity
// into the ordinary case, which is why it is fixed and why it is tested.
//
// **Coverage of the stamp is discipline and not construction**, and this section is the
// whole of the mitigation — so it is worth being exact about how far it reaches. A stamp
// *removed* from one of the paths below fails here rather than at a table. A stamp never
// written on a path invented next year fails nothing at all, because no test knows the
// mutation exists. Anyone adding a widening mutation adds a case here in the same commit,
// or the guarantee quietly stops covering it.
//
// ⚠️ **The clock is faked, and only `Date` is.** `revealedAt` is `Date.now()` at the moment
// of the stamp and `_creationTime` is the harness's own reading of the same clock, bumped
// by a thousandth of a millisecond per collision so that two rows written in one tick still
// sort — so a mutation and a row written inside the same integer millisecond can order
// either way, which real time in an in-memory harness makes likely rather than exotic. A
// frozen clock advanced by hand between the rolls and the reveal is what turns "usually"
// into "always". `toFake: ['Date']` and never the timers: faking `setTimeout` here would
// hang the harness's own awaits, and this needs none of them.

/** The two instants the tests below step between, a minute apart, with no real waiting. */
const BEFORE_REVEAL = new Date('2026-08-02T20:00:00.000Z')
const AFTER_REVEAL = new Date('2026-08-02T20:01:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('a row arriving because the audience widened is marked as history', () => {
  test('showing the coin publishes the creature’s lines and marks every one of them', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BEFORE_REVEAL)

    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, creatureToken } = fixture
    await rollCreatureAttack(t, fixture)

    // The DM could hear these all along, so nothing about them is history to *them* — the
    // negative control, and the one that fails if the comparison is accidentally inverted
    // or if `gameRevealedAt` starts answering something other than the last stamp.
    expect((await dmFeed(t, fixture)).some((row) => row.predatesReveal)).toBe(false)

    vi.setSystemTime(AFTER_REVEAL)
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'player' })

    const revealed = await t.query(api.feed.list, { code })
    expect(revealed).toHaveLength(2)
    expect(revealed.every((row) => row.predatesReveal)).toBe(true)
    // And to the DM too, because the flag is a fact about the *game's* clock rather than
    // about this caller's audience. A per-caller answer would need a per-caller cache entry
    // on the one query that re-runs every time anybody rolls.
    expect((await dmFeed(t, fixture)).every((row) => row.predatesReveal)).toBe(true)

    // The live half, without which everything above is satisfied by a flag stuck at `true`:
    // a roll made after the reveal is current, and the flourish plays.
    await rollHeroInitiative(t, fixture)
    expect(newest(await t.query(api.feed.list, { code })).predatesReveal).toBe(false)
  })

  /**
   * ⚠️ **A stamp on a *narrowing* write would be the same bug wearing the fix's clothes.**
   * Hiding a coin tells nobody anything, so moving the clock there would mark every line
   * rolled since the last reveal as history — silencing the flourish for rolls the table
   * has been watching all along, and doing it every time the DM tidies the board.
   *
   * Asserted on a row written *between* the two writes, which is the only shape that can
   * see the difference: it reads `false` before the hide and has to still read `false`
   * after it.
   */
  test('hiding the coin again moves nothing, because narrowing reveals nobody', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BEFORE_REVEAL)

    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode, creatureToken } = fixture

    vi.setSystemTime(AFTER_REVEAL)
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'player' })
    await rollHeroInitiative(t, fixture)
    expect(newest(await t.query(api.feed.list, { code })).predatesReveal).toBe(false)

    vi.setSystemTime(new Date('2026-08-02T20:02:00.000Z'))
    await t.mutation(api.board.setLayer, { code, dmCode, tokenId: creatureToken, layer: 'gm' })
    expect(newest(await dmFeed(t, fixture)).predatesReveal).toBe(false)
  })

  /**
   * The widening with no token in it at all, and the reason the stamp is not simply a line
   * inside `setTokenLayer`. A reserved hero is withheld by `isWithheldAsReserved` rather
   * than by a layer, so lifting the reservation publishes that hero's whole history to the
   * table without one row of `tokens` being touched.
   */
  test('lifting a reservation marks the lines it publishes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BEFORE_REVEAL)

    const t = harness()
    const fixture = await feedFixture(t)
    const { code, dmCode } = fixture

    const { characterId: seraphine } = await t.mutation(api.characters.create, {
      code,
      dmCode,
      name: RESERVED_NAME,
      sheet: pcSheet({ maxHp: 33 }),
    })
    await t.mutation(api.characters.setReserved, { code, dmCode, characterId: seraphine, reserved: true })
    await t.mutation(api.feed.roll, {
      code,
      dmCode,
      characterId: seraphine,
      request: { kind: 'initiative' },
      mode: 'flat',
      dmOnly: false,
    })

    vi.setSystemTime(AFTER_REVEAL)
    await t.mutation(api.characters.setReserved, { code, dmCode, characterId: seraphine, reserved: false })

    const published = await t.query(api.feed.list, { code })
    expect(published.map((row) => row.actorName)).toEqual([RESERVED_NAME])
    expect(published[0].predatesReveal).toBe(true)
  })
})
